"""
Firm Search Routes - Flask Blueprint for company discovery
Endpoints for natural language and structured firm search
WITH CREDIT SYSTEM INTEGRATION
"""
from flask import Blueprint, request, jsonify, Response
from datetime import datetime
import uuid
import json
import threading
import time
import traceback

from app.extensions import get_db, require_firebase_auth, require_tier
from app.services.company_search import (
    search_firms,
    get_available_industries,
    get_size_options
)
from app.services.auth import check_and_reset_credits, deduct_credits_atomic
from app.services.search_progress import (
    create_search_progress,
    update_search_progress,
    complete_search_progress,
    fail_search_progress
)
from app.config import TIER_CONFIGS
from app.utils.exceptions import ValidationError, OfferloopException, InsufficientCreditsError, ExternalAPIError
from app.utils.validation import FirmSearchRequest, validate_request
from firebase_admin import firestore

# Credit constants
CREDITS_PER_FIRM = 2
FREE_FIRM_BATCH_DEFAULT = 10
PRO_FIRM_BATCH_DEFAULT = 10

# Find Companies batch-size caps per tier (slider max).
COMPANY_BATCH_CAPS = {'free': 10, 'pro': 25, 'elite': 50}
# Fail-safe: if the tier lookup is missing, unknown, or fails, fall back to the
# FREE cap so a bad/empty tier can never bypass the cap or grant unlimited.
COMPANY_BATCH_CAP_FALLBACK = COMPANY_BATCH_CAPS['free']


def company_batch_cap_for_tier(tier):
    """Return the max companies-per-search for a tier.

    Falls back to the FREE cap for a missing or unrecognized tier so a failed
    or empty tier lookup can never bypass the cap.
    """
    if not tier:
        return COMPANY_BATCH_CAP_FALLBACK
    return COMPANY_BATCH_CAPS.get(tier, COMPANY_BATCH_CAP_FALLBACK)

firm_search_bp = Blueprint('firm_search', __name__, url_prefix='/api/firm-search')


def get_user_credits_and_tier(db, uid):
    """Get user's current credits and tier."""
    try:
        user_ref = db.collection('users').document(uid)
        user_doc = user_ref.get()
        
        if user_doc.exists:
            user_data = user_doc.to_dict()
            credits = check_and_reset_credits(user_ref, user_data)
            # subscriptionTier is the source-of-truth field; `tier` is a legacy
            # fallback that can be stale for upgraded accounts. Reading `tier`
            # alone caps paid users (Pro/Elite) at the FREE company-batch limit,
            # so prefer subscriptionTier first.
            tier = user_data.get('subscriptionTier') or user_data.get('tier', 'free')
            max_credits = user_data.get('maxCredits', TIER_CONFIGS[tier]['credits'])
            return credits, tier, max_credits
        
        # User doesn't exist - return defaults
        return TIER_CONFIGS['free']['credits'], 'free', TIER_CONFIGS['free']['credits']
    except Exception as e:
        print(f"Error getting user credits: {e}")
        return 0, 'free', 150


def deduct_credits(db, uid, amount):
    """Deduct credits from user's account (DEPRECATED - use deduct_credits_atomic instead)."""
    # Use atomic function to prevent race conditions
    success, remaining = deduct_credits_atomic(uid, amount, "firm_search")
    if success:
        return remaining
    else:
        # If deduction failed, return current balance (for backward compatibility)
        try:
            user_ref = db.collection('users').document(uid)
            user_doc = user_ref.get()
            if user_doc.exists:
                user_data = user_doc.to_dict()
                return check_and_reset_credits(user_ref, user_data)
        except:
            pass
        return 0



def calculate_firm_search_cost(num_firms):
    """Calculate credit cost for firm search."""
    return num_firms * CREDITS_PER_FIRM


def save_search_to_history(uid: str, query: str, parsed_filters: dict, results: list) -> str:
    """Save a firm search to user's history in Firebase. Returns the search ID."""
    try:
        db = get_db()
        search_id = str(uuid.uuid4())
        
        search_doc = {
            'id': search_id,
            'query': query,
            'parsedFilters': parsed_filters,
            'results': results,
            'resultsCount': len(results),
            'createdAt': datetime.utcnow()
        }
        
        db.collection('users').document(uid).collection('firmSearches').document(search_id).set(search_doc)
        print(f"[FirmSearch] Saved firm search {search_id}")
        return search_id
    except Exception as e:
        print(f"Error saving search to history: {e}")
        return None


@firm_search_bp.route('/search', methods=['POST'])
@require_firebase_auth
def search_firms_route():
    # Rate limiting is handled globally by Flask-Limiter (default: 50/hour, 200/day)
    """
    Natural language firm search WITH CREDIT SYSTEM.
    
    Request body:
    {
        "query": "mid-sized investment banks in NYC focused on healthcare",
        "batchSize": 10  // Optional, defaults to 10
    }
    """
    try:
        uid = request.firebase_user.get('uid')
        db = get_db()
        data = request.get_json() or {}
        
        # Validate input
        try:
            validated_data = validate_request(FirmSearchRequest, data)
        except ValidationError as ve:
            return ve.to_response()
        
        query = validated_data['query']
        batch_size = validated_data.get('batchSize', 10)

        # Fetch tier FIRST so the batch-size cap can be tier-aware.
        # get_user_credits_and_tier already defaults tier to 'free' on any
        # error or missing user doc, and company_batch_cap_for_tier falls back
        # to the FREE cap for a missing/unknown tier, so a failed lookup can
        # never bypass the cap.
        current_credits, tier, max_credits = get_user_credits_and_tier(db, uid)

        # Cap batch size to this tier's max (free 10, pro 25, elite 50).
        tier_cap = company_batch_cap_for_tier(tier)
        batch_size = max(1, min(batch_size, tier_cap))

        # Calculate MAX credit cost
        max_credits_needed = calculate_firm_search_cost(batch_size)
        
        # Check if user has enough credits
        if current_credits < max_credits_needed:
            raise InsufficientCreditsError(max_credits_needed, current_credits)
        
        # Generate search ID for progress tracking
        search_id = str(uuid.uuid4())
        
        # Initialize progress tracking
        create_search_progress(search_id, total=batch_size, step="Starting search...")
        
        # Perform the search with progress tracking
        # NOTE: Search is synchronous, but progress is tracked for future async implementation
        try:
            result = search_firms(query, limit=batch_size, search_id=search_id)
        except Exception as e:
            print(f"❌ Error calling search_firms: {e}")
            traceback.print_exc()
            fail_search_progress(search_id, str(e))
            raise ExternalAPIError("Firm Search", f"Search service error: {str(e)}")
        
        firms = result.get('firms', [])
        
        # Handle partial results (some firms found but not all)
        is_partial = result.get('partial', False)
        partial_message = None
        if is_partial and firms:
            partial_message = result.get('error')  # This is informational, not an error
        
        if not result.get('success'):
            error_msg = result.get('error', 'Firm search failed')
            print(f"⚠️ Firm search returned error: {error_msg}")
            
            # Check if this is a validation/parsing error (missing fields)
            # These should be 400 errors, not 502 errors
            if 'Missing required fields' in error_msg or 'Failed to understand' in error_msg:
                raise ValidationError(error_msg, field="query")
            else:
                # Actual API/service errors
                raise ExternalAPIError("Firm Search", error_msg)
        
        if not firms:
            # No firms found - return empty result but don't charge credits
            return jsonify({
                'success': True,
                'firms': [],
                'total': 0,
                'parsedFilters': result.get('parsedFilters'),
                'message': 'No firms found matching your search criteria. Try broadening your search.',
                'batchSize': batch_size,
                'creditsCharged': 0,
                'remainingCredits': current_credits
            })
        
        # Ensure firms are properly sorted to avoid comparison errors with None values
        # Sort by employeeCount in DESCENDING order (largest first)
        # When size is not specified, we want the biggest firms
        firms.sort(key=lambda f: f.get('employeeCount') if f.get('employeeCount') is not None else 0, reverse=True)
        
        # Calculate ACTUAL credit cost based on firms returned
        actual_firms_returned = len(firms)
        actual_credits_to_charge = calculate_firm_search_cost(actual_firms_returned)
        
        # Charge credits atomically
        success, new_credit_balance = deduct_credits_atomic(uid, actual_credits_to_charge, "firm_search")
        if not success:
            # If deduction failed, user may have spent credits elsewhere
            current_credits, _, _ = get_user_credits_and_tier(db, uid)
            raise InsufficientCreditsError(actual_credits_to_charge, current_credits)
        
        # Save to history
        history_id = save_search_to_history(
            uid=uid,
            query=query,
            parsed_filters=result.get('parsedFilters', {}),
            results=firms
        )

        print(f"[FirmSearch] Search successful: {actual_firms_returned} firms returned, {actual_credits_to_charge} credits charged")

        # Mark search as complete (use original search_id, not history_id)
        complete_search_progress(search_id, step="Search complete!")
        
        response_data = {
            'success': True,
            'firms': firms,
            'total': len(firms),
            'parsedFilters': result.get('parsedFilters'),
            'searchId': history_id or search_id,
            'batchSize': batch_size,
            'firmsReturned': actual_firms_returned,
            'creditsCharged': actual_credits_to_charge,
            'remainingCredits': new_credit_balance
        }
        
        # Add partial result message if applicable
        if partial_message:
            response_data['partialMessage'] = partial_message
        
        return jsonify(response_data)
    
    except (ValidationError, InsufficientCreditsError, ExternalAPIError, OfferloopException):
        raise
    except Exception as e:
        print(f"Firm search error: {e}")
        traceback.print_exc()
        raise OfferloopException(f"Firm search failed: {str(e)}", error_code="FIRM_SEARCH_ERROR")


@firm_search_bp.route('/status/<search_id>', methods=['GET'])
@require_firebase_auth
def get_search_status(search_id):
    """Get progress status for an ongoing search.
    
    Returns:
        {
            "current": int,
            "total": int,
            "step": str,
            "status": "in_progress" | "completed" | "failed",
            "error": str (if failed)
        }
    """
    from app.services.search_progress import get_search_progress
    
    progress = get_search_progress(search_id)
    
    if not progress:
        return jsonify({
            'success': False,
            'error': 'Search not found or expired'
        }), 404
    
    return jsonify({
        'success': True,
        'progress': progress
    })


# In-memory store for async search results keyed by search_id
# Each entry stores (timestamp, result_data) for TTL-based cleanup
_async_results: dict = {}
_async_results_lock = threading.Lock()
_ASYNC_RESULT_TTL = 300  # 5 minutes


def _cleanup_stale_results():
    """Remove async results older than TTL."""
    now = time.time()
    with _async_results_lock:
        stale = [k for k, (ts, _) in _async_results.items() if now - ts > _ASYNC_RESULT_TTL]
        for k in stale:
            del _async_results[k]


def _store_async_result(search_id: str, data: dict):
    """Store an async result with timestamp."""
    _cleanup_stale_results()
    with _async_results_lock:
        _async_results[search_id] = (time.time(), data)


def _pop_async_result(search_id: str) -> dict | None:
    """Pop an async result if it exists and hasn't expired."""
    with _async_results_lock:
        entry = _async_results.get(search_id)
        if entry is None:
            return None
        ts, data = entry
        if time.time() - ts > _ASYNC_RESULT_TTL:
            del _async_results[search_id]
            return None
        del _async_results[search_id]
    return data


@firm_search_bp.route('/stream/<search_id>', methods=['GET'])
def stream_search_progress(search_id):
    """SSE endpoint that streams real-time progress for a running search.

    Accepts auth via Authorization header OR ?token= query param
    (EventSource API doesn't support custom headers).

    Events:
      - event: progress  {current, total, step, status}
      - event: complete   {firms, creditsCharged, remainingCredits, ...}
      - event: error      {message}
    """
    from firebase_admin import auth as fb_auth

    # Accept token from header or query param (EventSource limitation)
    token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split("Bearer ", 1)[1]
    if not token:
        token = request.args.get("token")
    if not token:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        fb_auth.verify_id_token(token, clock_skew_seconds=5)
    except Exception:
        return jsonify({"error": "Invalid token"}), 401
    from app.services.search_progress import get_search_progress

    def _generate():
        last_step = None
        timeout = 120  # max 2 min
        start = time.time()
        while time.time() - start < timeout:
            progress = get_search_progress(search_id)
            if progress is None:
                # Check if result arrived (search finished before SSE connected)
                result_data = _pop_async_result(search_id)
                if result_data is not None:
                    yield f"event: complete\ndata: {json.dumps(result_data)}\n\n"
                    return
                yield f"event: error\ndata: {json.dumps({'message': 'Search not found'})}\n\n"
                return

            status = progress.get("status", "in_progress")
            step = progress.get("step")

            # Only send if something changed
            if step != last_step:
                yield f"event: progress\ndata: {json.dumps(progress)}\n\n"
                last_step = step

            if status == "completed":
                # Deliver the full result if available
                result_data = _pop_async_result(search_id)
                if result_data is not None:
                    yield f"event: complete\ndata: {json.dumps(result_data)}\n\n"
                else:
                    yield f"event: progress\ndata: {json.dumps(progress)}\n\n"
                return

            if status == "failed":
                error_msg = progress.get("error", "Search failed")
                yield f"event: error\ndata: {json.dumps({'message': error_msg})}\n\n"
                return

            time.sleep(0.5)

        yield f"event: error\ndata: {json.dumps({'message': 'Stream timeout'})}\n\n"

    return Response(
        _generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',  # Disable nginx buffering
        }
    )


@firm_search_bp.route('/search-async', methods=['POST'])
@require_firebase_auth
def search_firms_async():
    """Start a firm search in the background and return a search ID immediately.

    The client should connect to /stream/<search_id> to receive real-time progress
    and the final result.

    Request body: same as /search  { "query": "...", "batchSize": 10 }
    Response: 202 { "searchId": "..." }
    """
    try:
        uid = request.firebase_user.get('uid')
        db = get_db()
        data = request.get_json() or {}

        try:
            validated_data = validate_request(FirmSearchRequest, data)
        except ValidationError as ve:
            return ve.to_response()

        query = validated_data['query']
        batch_size = validated_data.get('batchSize', 10)

        # Fetch tier FIRST so the batch-size cap can be tier-aware.
        # get_user_credits_and_tier defaults tier to 'free' on any error, and
        # company_batch_cap_for_tier falls back to the FREE cap for a
        # missing/unknown tier, so a failed lookup can never bypass the cap.
        current_credits, tier, max_credits_val = get_user_credits_and_tier(db, uid)

        # Cap batch size to this tier's max (free 10, pro 25, elite 50).
        tier_cap = company_batch_cap_for_tier(tier)
        batch_size = max(1, min(batch_size, tier_cap))

        # Pre-flight credit check
        max_credits_needed = calculate_firm_search_cost(batch_size)
        if current_credits < max_credits_needed:
            raise InsufficientCreditsError(max_credits_needed, current_credits)

        search_id = str(uuid.uuid4())
        create_search_progress(search_id, total=batch_size, step="Starting search...")

        def _run_search():
            try:
                result = search_firms(query, limit=batch_size, search_id=search_id)
                firms = result.get('firms', [])

                if not result.get('success'):
                    fail_search_progress(search_id, result.get('error', 'Search failed'))
                    _store_async_result(search_id, {
                        'success': False,
                        'firms': [],
                        'total': 0,
                        'creditsCharged': 0,
                        'remainingCredits': current_credits,
                        'error': result.get('error', 'Search failed'),
                    })
                    return

                if not firms:
                    # Successful search but no results — not a failure
                    empty_result = {
                        'success': True,
                        'firms': [],
                        'total': 0,
                        'creditsCharged': 0,
                        'remainingCredits': current_credits,
                        'message': 'No firms found matching your search criteria.',
                    }
                    if result.get('suggestions'):
                        empty_result['suggestions'] = result['suggestions']
                    _store_async_result(search_id, empty_result)
                    complete_search_progress(search_id, step="Search complete!")
                    return

                firms.sort(
                    key=lambda f: f.get('employeeCount') if f.get('employeeCount') is not None else 0,
                    reverse=True,
                )
                actual_credits = calculate_firm_search_cost(len(firms))
                ok, new_balance = deduct_credits_atomic(uid, actual_credits, "firm_search")
                if not ok:
                    fail_search_progress(search_id, "Insufficient credits")
                    # Re-fetch actual balance instead of using stale pre-flight snapshot
                    current_balance, _, _ = get_user_credits_and_tier(db, uid)
                    _store_async_result(search_id, {
                        'success': False,
                        'error': 'Insufficient credits',
                        'error_code': 'INSUFFICIENT_CREDITS',
                        'creditsCharged': 0,
                        'remainingCredits': current_balance,
                    })
                    return

                save_search_to_history(uid=uid, query=query,
                                       parsed_filters=result.get('parsedFilters', {}),
                                       results=firms)
                # Store result BEFORE marking complete to avoid race condition
                # where SSE reads completed status but result isn't stored yet
                success_result = {
                    'success': True,
                    'firms': firms,
                    'total': len(firms),
                    'parsedFilters': result.get('parsedFilters'),
                    'searchId': search_id,
                    'batchSize': batch_size,
                    'firmsReturned': len(firms),
                    'creditsCharged': actual_credits,
                    'remainingCredits': new_balance,
                }
                if result.get('suggestions'):
                    success_result['suggestions'] = result['suggestions']
                _store_async_result(search_id, success_result)
                complete_search_progress(search_id, step="Search complete!")
            except Exception as exc:
                fail_search_progress(search_id, str(exc))
                _store_async_result(search_id, {'success': False, 'error': str(exc)})

        thread = threading.Thread(target=_run_search, daemon=True)
        thread.start()

        return jsonify({'searchId': search_id}), 202

    except (ValidationError, InsufficientCreditsError, ExternalAPIError, OfferloopException):
        raise
    except Exception as e:
        raise OfferloopException(f"Firm search failed: {str(e)}", error_code="FIRM_SEARCH_ERROR")


@firm_search_bp.route('/history', methods=['GET'])
@require_firebase_auth
def get_search_history():
    """Get user's firm search history.
    
    Query params:
    - limit: Number of searches to return (default: 10, max: 100 for loading all firms)
    - includeFirms: If 'true', include firm results in response (default: false)
    """
    try:
        uid = request.firebase_user.get('uid')
        # Allow higher limit when loading firms to get all searches
        limit = min(int(request.args.get('limit', 10)), 100 if request.args.get('includeFirms') == 'true' else 50)
        include_firms = request.args.get('includeFirms', 'false').lower() == 'true'
        db = get_db()
        
        searches_ref = db.collection('users').document(uid).collection('firmSearches')
        query = searches_ref.order_by('createdAt', direction='DESCENDING').limit(limit)
        
        searches = []
        for doc in query.stream():
            search_data = doc.to_dict()
            search_item = {
                'id': doc.id,  # Use document ID, not from data
                'query': search_data.get('query'),
                'parsedFilters': search_data.get('parsedFilters'),
                'resultsCount': search_data.get('resultsCount', 0),
                'createdAt': search_data.get('createdAt').isoformat() if hasattr(search_data.get('createdAt'), 'isoformat') else str(search_data.get('createdAt', ''))
            }
            
            # Optionally include firms to avoid additional API calls
            if include_firms:
                search_item['results'] = search_data.get('results', [])
            
            searches.append(search_item)
        
        return jsonify({
            'success': True,
            'searches': searches
        })
    
    except Exception as e:
        print(f"Error getting search history: {e}")
        traceback.print_exc()
        from app.utils.exceptions import OfferloopException
        raise OfferloopException(f"Failed to load search history: {str(e)}", error_code="FIRM_SEARCH_HISTORY_ERROR")


@firm_search_bp.route('/history/<search_id>', methods=['GET'])
@require_firebase_auth
def get_search_by_id(search_id):
    """Get a specific search from history (including full results)."""
    try:
        uid = request.firebase_user.get('uid')
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
                'id': doc.id,
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


@firm_search_bp.route('/delete-firm', methods=['POST'])
@require_firebase_auth
def delete_firm():
    """Delete a firm from all search history entries."""
    try:
        uid = request.firebase_user.get('uid')
        db = get_db()
        data = request.get_json() or {}
        
        firm_id = data.get('firmId')
        firm_name = data.get('firmName')
        firm_location = data.get('firmLocation')
        
        print(f"🗑️ Delete firm request: firmId={firm_id}, firmName={firm_name}, firmLocation={firm_location}")
        
        if not firm_id and not firm_name:
            return jsonify({
                'success': False,
                'error': 'Either firmId or firmName must be provided'
            }), 400
        
        # Get all search history entries (not just recent ones - we need to check ALL)
        searches_ref = db.collection('users').document(uid).collection('firmSearches')
        searches = list(searches_ref.stream())
        
        print(f"🗑️ Found {len(searches)} total search history entries")
        
        # Log the first few firms to see their structure
        total_firms_before = 0
        for search_doc in searches[:3]:  # Check first 3 searches
            search_data = search_doc.to_dict()
            results = search_data.get('results', [])
            total_firms_before += len(results)
            if results:
                print(f"  📋 Sample firm from search {search_doc.id}: {json.dumps(results[0], indent=2, default=str)}")
        
        print(f"🗑️ Total firms across all searches before deletion: {total_firms_before}")
        
        deleted_count = 0
        updated_searches = 0
        
        def normalize_location(loc_str):
            """Normalize location string for comparison."""
            if not loc_str:
                return ""
            # Remove extra spaces, convert to lowercase
            return ' '.join(str(loc_str).strip().lower().split())
        
        # Create a clean matching function for this specific deletion request
        # (no side effects, ensures we're matching the right firm)
        match_attempts = 0
        
        def matches_this_firm(firm):
            """Match function specific to this deletion request."""
            nonlocal match_attempts
            match_attempts += 1
            # PRIORITY 1: Match by ID if provided
            if firm_id:
                firm_id_value = firm.get('id')
                if firm_id_value:
                    firm_id_str = str(firm_id_value).strip()
                    requested_id_str = str(firm_id).strip()
                    if firm_id_str == requested_id_str:
                        return True
                # If ID is provided but doesn't match, don't fall through
                return False
            
            # PRIORITY 2: Match by name + location (only if no ID provided)
            if firm_name:
                firm_name_value = str(firm.get('name', '')).strip()
                requested_name = str(firm_name).strip()
                
                if not firm_name_value or firm_name_value.lower() != requested_name.lower():
                    if match_attempts <= 3:
                        print(f"  ❌ Match #{match_attempts}: Name mismatch - stored='{firm_name_value}', requested='{requested_name}'")
                    return False
                
                if firm_location:
                    firm_loc = firm.get('location', {})
                    if not isinstance(firm_loc, dict):
                        if match_attempts <= 3:
                            print(f"  ❌ Match #{match_attempts}: Location is not a dict")
                        return False
                    
                    loc_display = firm_loc.get('display')
                    if loc_display:
                        if normalize_location(loc_display) == normalize_location(firm_location):
                            if match_attempts <= 5:
                                print(f"  ✅ Match #{match_attempts}: Matched by name+location.display: {firm_name_value} @ {loc_display}")
                            return True
                    
                    loc_parts = [firm_loc.get('city'), firm_loc.get('state'), firm_loc.get('country')]
                    loc_parts = [str(p).strip() for p in loc_parts if p]
                    if loc_parts:
                        constructed_loc = ', '.join(loc_parts)
                        if normalize_location(constructed_loc) == normalize_location(firm_location):
                            if match_attempts <= 5:
                                print(f"  ✅ Match #{match_attempts}: Matched by name+constructed location: {firm_name_value} @ {constructed_loc}")
                            return True
                    
                    if match_attempts <= 3:
                        stored_loc = loc_display or (', '.join(loc_parts) if loc_parts else "N/A")
                        print(f"  ❌ Match #{match_attempts}: Location mismatch - stored='{stored_loc}', requested='{firm_location}'")
                    return False
                else:
                    if match_attempts <= 5:
                        print(f"  ✅ Match #{match_attempts}: Matched by name only (no location): {firm_name_value}")
                    return True
            
            return False
        
        # Remove firm from all search history entries
        # Use a batch write for better performance and atomicity
        batch = db.batch()
        batch_count = 0
        MAX_BATCH_SIZE = 500  # Firestore batch limit
        
        for search_doc in searches:
            search_data = search_doc.to_dict()
            results = search_data.get('results', [])
            
            if not results:
                continue
            
            # Filter out the matching firm(s) using the clean matching function
            original_count = len(results)
            
            # Debug: Log first firm structure to see what we're comparing against
            if deleted_count == 0 and results:
                print(f"  🔍 Sample firm from search {search_doc.id}: id={results[0].get('id')}, name={results[0].get('name')}, location={json.dumps(results[0].get('location'), default=str)}")
            
            filtered_results = [f for f in results if not matches_this_firm(f)]
            
            if len(filtered_results) < original_count:
                # Firm was found and removed
                removed = original_count - len(filtered_results)
                deleted_count += removed
                
                print(f"  🗑️ Removing {removed} firm(s) from search {search_doc.id} (batch write)")
                
                # Add to batch
                batch.update(search_doc.reference, {
                    'results': filtered_results,
                    'resultsCount': len(filtered_results)
                })
                batch_count += 1
                updated_searches += 1
                
                # Commit batch if we hit the limit
                if batch_count >= MAX_BATCH_SIZE:
                    batch.commit()
                    print(f"  ✅ Committed batch of {batch_count} updates")
                    batch = db.batch()
                    batch_count = 0
        
        # Commit remaining updates
        if batch_count > 0:
            batch.commit()
            print(f"  ✅ Committed final batch of {batch_count} updates")
        
        # Firestore batch commits are strongly consistent — no verification/retry needed
        
        return jsonify({
            'success': True,
            'deletedCount': deleted_count,
            'updatedSearches': updated_searches,
            'message': f'Deleted {deleted_count} firm(s) from {updated_searches} search(es)' if deleted_count > 0 else 'No matching firms found to delete'
        })
    
    except Exception as e:
        print(f"❌ Error deleting firm: {e}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'Failed to delete firm: {str(e)}'
        }), 500

