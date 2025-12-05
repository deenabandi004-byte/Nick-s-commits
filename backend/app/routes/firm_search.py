"""
Firm Search Routes - Flask Blueprint for company discovery
Endpoints for natural language and structured firm search
WITH CREDIT SYSTEM INTEGRATION
"""
from flask import Blueprint, request, jsonify
from datetime import datetime
import uuid

from app.extensions import get_db, require_firebase_auth
from app.services.company_search import (
    search_firms,
    search_firms_structured,
    get_available_industries,
    get_size_options
)
from app.services.credits import (
    get_user_credits,
    has_enough_credits,
    deduct_credits,
    validate_firm_batch_size,
    calculate_firm_search_cost,
    get_firm_batch_options,
    CREDITS_PER_FIRM,
    FREE_FIRM_BATCH_DEFAULT,
    PRO_FIRM_BATCH_DEFAULT
)
from app.services.openai_client import get_openai_client


firm_search_bp = Blueprint('firm_search', __name__, url_prefix='/api/firm-search')


@firm_search_bp.route('/batch-options', methods=['GET'])
@require_firebase_auth
def get_batch_options():
    """
    Get available batch size options for the current user's tier.
    
    Response:
    {
        "success": true,
        "tier": "free" | "pro",
        "options": [5, 10] or [5, 10, 15, ..., 40],
        "default": 10,
        "min": 5,
        "max": 10 or 40,
        "creditsPerFirm": 5,
        "currentCredits": 150,
        "maxCredits": 150 or 1800
    }
    """
    try:
        uid = request.uid
        db = get_db()
        
        # Get user's tier and credits
        current_credits, tier, max_credits = get_user_credits(db, uid)
        
        # Get batch options for this tier
        batch_info = get_firm_batch_options(tier)
        
        return jsonify({
            'success': True,
            'tier': tier,
            'options': batch_info['options'],
            'default': batch_info['default'],
            'min': batch_info['min'],
            'max': batch_info['max'],
            'creditsPerFirm': CREDITS_PER_FIRM,
            'currentCredits': current_credits,
            'maxCredits': max_credits
        })
    
    except Exception as e:
        print(f"Error getting batch options: {e}")
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve batch options'
        }), 500


def save_search_to_history(uid: str, query: str, parsed_filters: dict, results: list) -> str:
    """
    Save a firm search to user's history in Firebase.
    
    Returns the search ID.
    """
    try:
        db = get_db()
        
        search_id = str(uuid.uuid4())
        
        search_doc = {
            'id': search_id,
            'query': query,
            'parsedFilters': parsed_filters,
            'results': results,  # Store the firms so user can revisit without re-querying
            'resultsCount': len(results),
            'createdAt': datetime.utcnow()
        }
        
        # Save to Firestore
        db.collection('users').document(uid).collection('firmSearches').document(search_id).set(search_doc)
        
        print(f"Saved firm search {search_id} for user {uid}")
        return search_id
    
    except Exception as e:
        print(f"Error saving search to history: {e}")
        return None


# =============================================================================
# ROUTES
# =============================================================================

@firm_search_bp.route('/search', methods=['POST'])
@require_firebase_auth
def search_firms_route():
    """
    Natural language firm search WITH CREDIT SYSTEM.
    
    Request body:
    {
        "query": "mid-sized investment banks in NYC focused on healthcare",
        "batchSize": 10  // Optional, defaults to tier default (10 for both)
    }
    
    Response:
    {
        "success": bool,
        "firms": [...],
        "total": int,
        "parsedFilters": {...},
        "searchId": str,
        "batchSize": int,
        "creditsCharged": int,
        "remainingCredits": int,
        "error": str or null
    }
    """
    try:
        uid = request.uid
        db = get_db()
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'Request body is required'
            }), 400
        
        query = data.get('query', '').strip()
        
        if not query:
            return jsonify({
                'success': False,
                'error': 'Search query is required. Try something like "investment banks in New York" or "mid-sized consulting firms in San Francisco focused on healthcare"'
            }), 400
        
        # Get user's tier and credits
        current_credits, tier, max_credits = get_user_credits(db, uid)
        
        # Get and validate batch size
        requested_batch_size = data.get('batchSize')
        if requested_batch_size is None:
            # Use tier default
            batch_size = FREE_FIRM_BATCH_DEFAULT if tier == 'free' else PRO_FIRM_BATCH_DEFAULT
        else:
            batch_size = int(requested_batch_size)
        
        # Validate batch size for tier
        is_valid, error_msg = validate_firm_batch_size(tier, batch_size)
        if not is_valid:
            return jsonify({
                'success': False,
                'error': error_msg,
                'tier': tier,
                'allowedBatchSizes': get_firm_batch_options(tier)
            }), 400
        
        # Calculate MAX credit cost (for pre-check)
        max_credits_needed = calculate_firm_search_cost(batch_size)
        
        # Check if user has enough credits for the maximum possible cost
        has_credits, current_credits, credit_error = has_enough_credits(db, uid, max_credits_needed)
        if not has_credits:
            return jsonify({
                'success': False,
                'error': credit_error,
                'creditsNeeded': max_credits_needed,
                'currentCredits': current_credits,
                'insufficientCredits': True
            }), 402  # Payment Required
        
        # Perform the search
        result = search_firms(query, limit=batch_size)
        
        if not result['success'] or not result.get('firms'):
            # Search failed or no results - don't charge credits
            return jsonify({
                'success': result['success'],
                'firms': result.get('firms', []),
                'total': result.get('total', 0),
                'parsedFilters': result.get('parsedFilters'),
                'error': result.get('error'),
                'batchSize': batch_size,
                'creditsCharged': 0,
                'remainingCredits': current_credits
            })
        
        # Calculate ACTUAL credit cost based on firms returned (not requested)
        # This ensures users only pay for what they get
        actual_firms_returned = len(result['firms'])
        actual_credits_to_charge = calculate_firm_search_cost(actual_firms_returned)
        
        # Charge credits for actual firms returned (atomic operation)
        new_credit_balance = deduct_credits(db, uid, actual_credits_to_charge)
        
        # Save to history
        search_id = save_search_to_history(
            uid=uid,
            query=query,
            parsed_filters=result.get('parsedFilters', {}),
            results=result['firms']
        )
        
        print(f"✅ Firm search successful for user {uid}:")
        print(f"   - Query: {query}")
        print(f"   - Batch size requested: {batch_size}")
        print(f"   - Firms returned: {actual_firms_returned}")
        print(f"   - Credits charged: {actual_credits_to_charge} ({actual_firms_returned} firms × {CREDITS_PER_FIRM} credits)")
        print(f"   - New balance: {new_credit_balance}")
        
        return jsonify({
            'success': True,
            'firms': result.get('firms', []),
            'total': len(result.get('firms', [])),
            'parsedFilters': result.get('parsedFilters'),
            'searchId': search_id,
            'batchSize': batch_size,
            'firmsReturned': actual_firms_returned,
            'creditsCharged': actual_credits_to_charge,
            'remainingCredits': new_credit_balance
        })
    
    except Exception as e:
        print(f"Firm search error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'An unexpected error occurred. Please try again.'
        }), 500


@firm_search_bp.route('/search/structured', methods=['POST'])
@require_firebase_auth
def search_firms_structured_route():
    """
    Structured firm search (dropdown/form inputs) WITH CREDIT SYSTEM.
    
    Request body:
    {
        "industry": "investment banking",
        "location": "New York, NY",
        "size": "mid",  // optional
        "keywords": ["healthcare", "M&A"],  // optional
        "batchSize": 10  // Optional, defaults to tier default
    }
    
    Response: Same as /search
    """
    try:
        uid = request.uid
        db = get_db()
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'Request body is required'
            }), 400
        
        industry = data.get('industry', '').strip()
        location = data.get('location', '').strip()
        size = data.get('size', 'none')
        keywords = data.get('keywords', [])
        
        # Validate required fields
        if not industry:
            return jsonify({
                'success': False,
                'error': 'Industry is required'
            }), 400
        
        if not location:
            return jsonify({
                'success': False,
                'error': 'Location is required'
            }), 400
        
        # Get user's tier and credits
        current_credits, tier, max_credits = get_user_credits(db, uid)
        
        # Get and validate batch size
        requested_batch_size = data.get('batchSize')
        if requested_batch_size is None:
            batch_size = FREE_FIRM_BATCH_DEFAULT if tier == 'free' else PRO_FIRM_BATCH_DEFAULT
        else:
            batch_size = int(requested_batch_size)
        
        # Validate batch size for tier
        is_valid, error_msg = validate_firm_batch_size(tier, batch_size)
        if not is_valid:
            return jsonify({
                'success': False,
                'error': error_msg,
                'tier': tier,
                'allowedBatchSizes': get_firm_batch_options(tier)
            }), 400
        
        # Calculate MAX credit cost (for pre-check)
        max_credits_needed = calculate_firm_search_cost(batch_size)
        
        # Check if user has enough credits for the maximum possible cost
        has_credits, current_credits, credit_error = has_enough_credits(db, uid, max_credits_needed)
        if not has_credits:
            return jsonify({
                'success': False,
                'error': credit_error,
                'creditsNeeded': max_credits_needed,
                'currentCredits': current_credits,
                'insufficientCredits': True
            }), 402
        
        # Perform the search
        result = search_firms_structured(
            industry=industry,
            location=location,
            size=size,
            keywords=keywords,
            limit=batch_size
        )
        
        if not result['success'] or not result.get('firms'):
            # Search failed or no results - don't charge credits
            return jsonify({
                'success': result['success'],
                'firms': result.get('firms', []),
                'total': result.get('total', 0),
                'parsedFilters': result.get('parsedFilters'),
                'error': result.get('error'),
                'batchSize': batch_size,
                'creditsCharged': 0,
                'remainingCredits': current_credits
            })
        
        # Calculate ACTUAL credit cost based on firms returned (not requested)
        actual_firms_returned = len(result['firms'])
        actual_credits_to_charge = calculate_firm_search_cost(actual_firms_returned)
        
        # Charge credits for actual firms returned
        new_credit_balance = deduct_credits(db, uid, actual_credits_to_charge)
        
        # Build query string for history
        query_parts = [industry, location]
        if size and size != 'none':
            query_parts.append(f"{size}-sized")
        if keywords:
            query_parts.append(f"focused on {', '.join(keywords)}")
        query_str = " ".join(query_parts)
        
        # Save to history
        search_id = save_search_to_history(
            uid=uid,
            query=query_str,
            parsed_filters=result.get('parsedFilters', {}),
            results=result['firms']
        )
        
        print(f"✅ Structured firm search successful for user {uid}:")
        print(f"   - Query: {query_str}")
        print(f"   - Batch size requested: {batch_size}")
        print(f"   - Firms returned: {actual_firms_returned}")
        print(f"   - Credits charged: {actual_credits_to_charge} ({actual_firms_returned} firms × {CREDITS_PER_FIRM} credits)")
        print(f"   - New balance: {new_credit_balance}")
        
        return jsonify({
            'success': True,
            'firms': result.get('firms', []),
            'total': len(result.get('firms', [])),
            'parsedFilters': result.get('parsedFilters'),
            'searchId': search_id,
            'batchSize': batch_size,
            'firmsReturned': actual_firms_returned,
            'creditsCharged': actual_credits_to_charge,
            'remainingCredits': new_credit_balance
        })
    
    except Exception as e:
        print(f"Structured firm search error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'An unexpected error occurred. Please try again.'
        }), 500


@firm_search_bp.route('/history', methods=['GET'])
@require_firebase_auth
def get_search_history():
    """
    Get user's firm search history.
    
    Query params:
    - limit: int (default 10, max 50)
    
    Response:
    {
        "success": true,
        "searches": [
            {
                "id": "...",
                "query": "...",
                "parsedFilters": {...},
                "resultsCount": 20,
                "createdAt": "2024-01-15T10:30:00Z"
            }
        ]
    }
    """
    try:
        uid = request.uid
        limit = min(int(request.args.get('limit', 10)), 50)
        
        db = get_db()
        
        # Get recent searches (don't include full results to keep response small)
        searches_ref = db.collection('users').document(uid).collection('firmSearches')
        query = searches_ref.order_by('createdAt', direction='DESCENDING').limit(limit)
        
        searches = []
        for doc in query.stream():
            search_data = doc.to_dict()
            searches.append({
                'id': search_data.get('id'),
                'query': search_data.get('query'),
                'parsedFilters': search_data.get('parsedFilters'),
                'resultsCount': search_data.get('resultsCount', 0),
                'createdAt': search_data.get('createdAt').isoformat() if search_data.get('createdAt') else None
            })
        
        return jsonify({
            'success': True,
            'searches': searches
        })
    
    except Exception as e:
        print(f"Error getting search history: {e}")
        return jsonify({
            'success': False,
            'error': 'Failed to load search history'
        }), 500


@firm_search_bp.route('/history/<search_id>', methods=['GET'])
@require_firebase_auth
def get_search_by_id(search_id):
    """
    Get a specific search from history (including full results).
    
    Response:
    {
        "success": true,
        "search": {
            "id": "...",
            "query": "...",
            "parsedFilters": {...},
            "results": [...],
            "resultsCount": 20,
            "createdAt": "2024-01-15T10:30:00Z"
        }
    }
    """
    try:
        uid = request.uid
        
        db = get_db()
        
        doc_ref = db.collection('users').document(uid).collection('firmSearches').document(search_id)
        doc = doc_ref.get()
        
        if not doc.exists:
            return jsonify({
                'success': False,
                'error': 'Search not found'
            }), 404
        
        search_data = doc.to_dict()
        
        return jsonify({
            'success': True,
            'search': {
                'id': search_data.get('id'),
                'query': search_data.get('query'),
                'parsedFilters': search_data.get('parsedFilters'),
                'results': search_data.get('results', []),
                'resultsCount': search_data.get('resultsCount', 0),
                'createdAt': search_data.get('createdAt').isoformat() if search_data.get('createdAt') else None
            }
        })
    
    except Exception as e:
        print(f"Error getting search: {e}")
        return jsonify({
            'success': False,
            'error': 'Failed to load search'
        }), 500


@firm_search_bp.route('/history/<search_id>', methods=['DELETE'])
@require_firebase_auth
def delete_search(search_id):
    """Delete a search from history."""
    try:
        uid = request.uid
        
        db = get_db()
        
        doc_ref = db.collection('users').document(uid).collection('firmSearches').document(search_id)
        doc_ref.delete()
        
        return jsonify({
            'success': True,
            'message': 'Search deleted'
        })
    
    except Exception as e:
        print(f"Error deleting search: {e}")
        return jsonify({
            'success': False,
            'error': 'Failed to delete search'
        }), 500


@firm_search_bp.route('/options/industries', methods=['GET'])
def get_industries():
    """Get available industries for dropdown."""
    return jsonify({
        'success': True,
        'industries': get_available_industries()
    })


@firm_search_bp.route('/options/sizes', methods=['GET'])
def get_sizes():
    """Get available size options for dropdown."""
    return jsonify({
        'success': True,
        'sizes': get_size_options()
    })


@firm_search_bp.route('/generate-summary', methods=['POST'])
@require_firebase_auth
def generate_firm_search_summary():
    """
    Generate a summary for firm search activity using OpenAI.
    
    Request body:
    {
        "searchParams": {
            "industry": "...",
            "location": "...",
            "size": "...",
            "keywords": [...]
        },
        "numberOfFirms": 8
    }
    
    Response:
    {
        "success": true,
        "summary": "Viewed 8 investment banks in New York focused on technology deals."
    }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'Request body is required'
            }), 400
        
        search_params = data.get('searchParams', {})
        number_of_firms = data.get('numberOfFirms', 0)
        
        if number_of_firms <= 0:
            return jsonify({
                'success': False,
                'error': 'numberOfFirms must be greater than 0'
            }), 400
        
        client = get_openai_client()
        if not client:
            # Fallback to simple summary
            parts = []
            if search_params.get('industry'):
                parts.append(search_params['industry'])
            if search_params.get('location'):
                parts.append(f"in {search_params['location']}")
            summary = f"Viewed {number_of_firms} {' '.join(parts) if parts else 'firms'}"
            return jsonify({
                'success': True,
                'summary': summary
            })
        
        # System message
        system_message = """You are a UI copywriter for a recruiting dashboard.

Your job is to write a SINGLE short sentence summarizing a firm search
for a 'Recent Activity' sidebar.

REQUIREMENTS:
- Output ONLY the sentence. No quotes, labels, or extra text.
- One sentence, max ~18–20 words.
- Mention:
  • number_of_firms_returned
  • industry or keywords if available
  • location if available
- Optional extras if present: company size (e.g., 'mid-market', 'large'), focus keywords (e.g., 'tech', 'growth equity').
- Prefer formats like:
  • 'Viewed 8 investment banks in New York focused on technology deals.'
  • 'Viewed 12 mid-market private equity firms in Chicago.'
- If a field is missing, simply omit it; never write 'unknown' or 'N/A'.
- Use past tense ('Viewed', 'Searched for').
- Tone: concise, neutral, professional."""
        
        # User message
        user_message = f"""Summarize this firm search in one short UI-friendly sentence.

Search inputs (JSON):
{json.dumps(search_params, indent=2)}

Number of firms returned: {number_of_firms}

Remember:
- Output only the sentence, nothing else."""
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": user_message}
            ],
            max_tokens=50,
            temperature=0.3
        )
        
        summary = response.choices[0].message.content.strip()
        # Remove quotes if present
        summary = summary.replace('"', '').replace("'", '').strip()
        
        return jsonify({
            'success': True,
            'summary': summary
        })
    
    except Exception as e:
        print(f"Error generating firm search summary: {e}")
        import traceback
        traceback.print_exc()
        # Fallback to simple summary
        parts = []
        if search_params.get('industry'):
            parts.append(search_params['industry'])
        if search_params.get('location'):
            parts.append(f"in {search_params['location']}")
        summary = f"Viewed {number_of_firms} {' '.join(parts) if parts else 'firms'}"
        return jsonify({
            'success': True,
            'summary': summary
        })
