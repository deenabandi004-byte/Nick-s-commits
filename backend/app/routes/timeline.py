"""
Timeline Routes - Flask Blueprint for generating personalized recruiting timelines
"""
from flask import Blueprint, request, jsonify
import json
import re
from app.extensions import require_firebase_auth
from app.services.openai_client import get_openai_client

timeline_bp = Blueprint('timeline', __name__, url_prefix='/api/timeline')


def extract_fields_from_prompt(prompt: str, client) -> dict:
    """
    Extract structured fields (role, industry, dates, etc.) from a natural language prompt using AI.
    """
    extraction_prompt = f"""Extract recruiting information from this user prompt. Return ONLY valid JSON with this structure:
{{
    "role": "Specific job title/position (e.g., 'Investment Banking Analyst', 'Software Engineer Intern', 'Consulting Intern')",
    "industry": "Industry name (e.g., 'Finance', 'Technology', 'Consulting')",
    "startDate": "YYYY-MM-DD format start date",
    "targetDate": "YYYY-MM-DD format target deadline",
    "numApplications": number (default 30 if not mentioned)
}}

User prompt: {prompt}

CRITICAL RULES - YOU MUST EXTRACT ALL FIELDS:
1. ROLE EXTRACTION (REQUIRED):
   - "investment banking" + "summer analyst" = "Investment Banking Summer Analyst"
   - "investment banking" + "internship" = "Investment Banking Intern" or "Investment Banking Summer Analyst"
   - "investment banking" alone = "Investment Banking Analyst" or "Investment Banking Summer Analyst"
   - "IB" = "Investment Banking Analyst"
   - ALWAYS extract a role - never leave it empty

2. INDUSTRY EXTRACTION (REQUIRED):
   - "investment banking" = "Finance"
   - "IB" = "Finance"
   - Extract the industry from the role/field mentioned

3. DATE EXTRACTION (REQUIRED - AI MUST DETERMINE START DATE BASED ON INDUSTRY):
   - Extract targetDate from the prompt (when they want to start working)
   - Determine startDate based on industry recruiting cycles:
     * INVESTMENT BANKING / FINANCE: Start networking in fall/winter of the year BEFORE
       - Summer 2027 internship → targetDate: "2027-06-01", startDate: "2026-09-01" (fall 2026)
       - Full-time 2027 → targetDate: "2027-07-01", startDate: "2026-08-01" (fall 2026 recruiting)
     * CONSULTING: Similar to banking, fall recruiting the year before
       - Summer 2027 → targetDate: "2027-06-01", startDate: "2026-09-01"
     * TECHNOLOGY: More flexible, can start 3-6 months before
       - Summer 2027 → targetDate: "2027-06-01", startDate: "2026-12-01" or "2027-01-01"
     * GENERAL: If industry unclear, start 6-9 months before target date
   - If target date is "summer 2027", set targetDate to "2027-06-01"
   - If target date is "fall 2027", set targetDate to "2027-09-01"
   - ALWAYS set startDate based on when recruiting typically begins for that industry

4. OTHER:
   - Location mentions (e.g., "Los Angeles") should be ignored for role/industry extraction
   - If no number of applications mentioned, use 30
   - Return ONLY the JSON object, no markdown, no explanations

IMPORTANT: You MUST return a role, industry, startDate, and targetDate. The startDate should be intelligently determined based on the industry's typical recruiting cycle."""

    try:
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You extract structured recruiting information from natural language. Return only valid JSON."},
                {"role": "user", "content": extraction_prompt}
            ],
            max_tokens=500,
            temperature=0.3,
            response_format={"type": "json_object"}
        )
        
        extracted_json = response.choices[0].message.content.strip()
        
        # Remove markdown if present
        if '```' in extracted_json:
            json_match = re.search(r'```(?:json)?\s*(\{.*\})\s*```', extracted_json, re.DOTALL)
            if json_match:
                extracted_json = json_match.group(1)
        
        extracted_data = json.loads(extracted_json)
        print(f"✅ Extracted fields from prompt: {extracted_data}")
        return extracted_data
    except Exception as e:
        print(f"❌ Failed to extract fields from prompt: {e}")
        # Return defaults/empty so validation will catch it
        return {}


@timeline_bp.route('/generate', methods=['OPTIONS'])
def handle_options():
    """Handle CORS preflight requests."""
    return '', 200


@timeline_bp.route('/generate', methods=['POST'])
@require_firebase_auth
def generate_timeline():
    """
    Generates a personalized recruiting timeline based on user inputs using OpenAI.
    
    Request body:
    {
        "role": "Investment Banking Analyst",
        "industry": "Finance",
        "startDate": "2024-01-01",
        "targetDate": "2024-06-30",
        "numApplications": 30
    }
    
    Response:
    {
        "phases": [
            {
                "name": "Research & Target Firms",
                "startMonth": "Jan 2024",
                "endMonth": "Feb 2024",
                "goals": ["Identify 50 target firms", "Research company cultures"],
                "description": "Build your target list and research companies"
            },
            ...
        ]
    }
    """
    try:
        # Get user ID from auth (set by require_firebase_auth decorator)
        user_id = request.uid
        if not user_id:
            return jsonify({
                'error': 'User ID not found in request'
            }), 401
        
        # Parse request body
        data = request.get_json()
        if not data:
            return jsonify({
                'error': 'Request body is required'
            }), 400
        
        # Get OpenAI client first (needed for extraction)
        client = get_openai_client()
        if not client:
            print("❌ OpenAI client not initialized")
            return jsonify({
                'error': 'OpenAI service not available'
            }), 500
        
        # Check if we have a prompt (new format) or structured fields (old format)
        prompt = data.get('prompt', '').strip()
        
        # Check if this is an update (has existing timeline data)
        is_update = data.get('isUpdate', False)
        existing_timeline = data.get('existingTimeline', {})
        
        # Try to get structured fields first
        role = data.get('role', '').strip()
        industry = data.get('industry', '').strip()
        start_date = data.get('startDate', '').strip()
        target_date = data.get('targetDate', '').strip()
        num_applications = data.get('numApplications', 30)
        
        # If this is an update, use existing timeline data as defaults
        if is_update and existing_timeline:
            existing_phases = existing_timeline.get('phases', [])
            if existing_phases:
                # Extract role/industry from existing phases if available
                # Try to infer from first phase description
                first_phase = existing_phases[0] if existing_phases else {}
                if not role and first_phase.get('description'):
                    desc = first_phase['description'].lower()
                    if 'investment banking' in desc or 'ib' in desc:
                        role = role or 'Investment Banking Analyst'
                        industry = industry or 'Finance'
                
                # Use existing dates if available
                if existing_timeline.get('startDate') and not start_date:
                    start_date = existing_timeline['startDate']
                if existing_timeline.get('targetDeadline') and not target_date:
                    target_date = existing_timeline['targetDeadline']
        
        # If we have a prompt but missing fields, extract them using AI
        if prompt and (not role or not industry or not start_date or not target_date):
            print(f"📝 Extracting fields from prompt: {prompt}")
            extracted = extract_fields_from_prompt(prompt, client)
            print(f"🔍 Extracted data: {extracted}")
            
            # Use extracted values if current values are empty
            if not role:
                role = extracted.get('role', '').strip()
                print(f"✅ Extracted role: {role}")
            if not industry:
                industry = extracted.get('industry', '').strip()
                print(f"✅ Extracted industry: {industry}")
            if not start_date:
                start_date = extracted.get('startDate', '').strip()
                print(f"✅ Extracted startDate: {start_date}")
            if not target_date:
                target_date = extracted.get('targetDate', '').strip()
                print(f"✅ Extracted targetDate: {target_date}")
            if extracted.get('numApplications'):
                num_applications = extracted.get('numApplications', 30)
            
            print(f"📊 Final values - role: '{role}', industry: '{industry}', start_date: '{start_date}', target_date: '{target_date}'")
        
        # Fallback: If extraction failed and we still don't have required fields, try to infer from prompt
        if prompt:
            prompt_lower = prompt.lower()
            
            # Infer role
            if not role:
                if 'investment banking' in prompt_lower or 'ib' in prompt_lower:
                    if 'summer analyst' in prompt_lower or ('summer' in prompt_lower and 'analyst' in prompt_lower):
                        role = 'Investment Banking Summer Analyst'
                    elif 'intern' in prompt_lower:
                        role = 'Investment Banking Intern'
                    else:
                        role = 'Investment Banking Analyst'
                    print(f"🔄 Fallback: Inferred role from prompt: {role}")
            
            # Infer industry
            if not industry:
                if 'investment banking' in prompt_lower or 'ib' in prompt_lower or 'finance' in prompt_lower:
                    industry = 'Finance'
                    print(f"🔄 Fallback: Inferred industry from prompt: {industry}")
                elif 'consulting' in prompt_lower:
                    industry = 'Consulting'
                    print(f"🔄 Fallback: Inferred industry from prompt: {industry}")
                elif 'tech' in prompt_lower or 'software' in prompt_lower or 'engineering' in prompt_lower:
                    industry = 'Technology'
                    print(f"🔄 Fallback: Inferred industry from prompt: {industry}")
            
            # Infer dates from prompt
            if not target_date:
                # Look for year mentions
                import re
                year_match = re.search(r'20\d{2}', prompt)
                if year_match:
                    year = int(year_match.group())
                    if 'summer' in prompt_lower:
                        target_date = f"{year}-06-01"
                        print(f"🔄 Fallback: Inferred targetDate from prompt: {target_date}")
                    elif 'fall' in prompt_lower or 'autumn' in prompt_lower:
                        target_date = f"{year}-09-01"
                        print(f"🔄 Fallback: Inferred targetDate from prompt: {target_date}")
                    elif 'winter' in prompt_lower:
                        target_date = f"{year}-12-01"
                        print(f"🔄 Fallback: Inferred targetDate from prompt: {target_date}")
                    elif 'spring' in prompt_lower:
                        target_date = f"{year}-03-01"
                        print(f"🔄 Fallback: Inferred targetDate from prompt: {target_date}")
                    else:
                        # Default to summer if year found but no season
                        target_date = f"{year}-06-01"
                        print(f"🔄 Fallback: Inferred targetDate (default summer) from prompt: {target_date}")
            
            # Infer start date based on industry and target date
            if target_date and not start_date:
                from datetime import datetime, timedelta
                try:
                    target_dt = datetime.strptime(target_date, "%Y-%m-%d")
                    target_year = target_dt.year
                    target_month = target_dt.month
                    
                    # Determine start date based on industry
                    if industry == 'Finance' or 'investment banking' in prompt_lower or 'ib' in prompt_lower:
                        # Investment banking: start fall/winter of year before
                        if target_month >= 6:  # Summer or later
                            start_date = f"{target_year - 1}-09-01"  # Fall of previous year
                        else:  # Spring or earlier
                            start_date = f"{target_year - 1}-08-01"  # Late summer/fall of previous year
                        print(f"🔄 Fallback: Inferred startDate for Finance: {start_date}")
                    elif industry == 'Consulting':
                        # Consulting: similar to banking
                        if target_month >= 6:
                            start_date = f"{target_year - 1}-09-01"
                        else:
                            start_date = f"{target_year - 1}-08-01"
                        print(f"🔄 Fallback: Inferred startDate for Consulting: {start_date}")
                    elif industry == 'Technology':
                        # Technology: 3-6 months before
                        start_dt = target_dt - timedelta(days=180)  # ~6 months
                        start_date = start_dt.strftime("%Y-%m-%d")
                        print(f"🔄 Fallback: Inferred startDate for Technology: {start_date}")
                    else:
                        # General: 6-9 months before
                        start_dt = target_dt - timedelta(days=270)  # ~9 months
                        start_date = start_dt.strftime("%Y-%m-%d")
                        print(f"🔄 Fallback: Inferred startDate (general): {start_date}")
                except Exception as e:
                    print(f"⚠️ Failed to parse target_date for fallback: {e}")
                    # Last resort: set to 9 months before if we can't parse
                    if '2027' in prompt:
                        start_date = "2026-09-01"
                        print(f"🔄 Fallback: Set startDate to 2026-09-01 (last resort)")
        
        # For updates, be more lenient - use defaults if missing
        if is_update:
            # Use defaults for missing fields in update mode
            if not role:
                role = 'Investment Banking Analyst'  # Default
                print(f"⚠️ Update mode: Using default role: {role}")
            if not industry:
                industry = 'Finance'  # Default
                print(f"⚠️ Update mode: Using default industry: {industry}")
            if not start_date:
                # Use current date or existing timeline start date
                from datetime import datetime
                start_date = existing_timeline.get('startDate') or datetime.now().strftime("%Y-%m-%d")
                print(f"⚠️ Update mode: Using start_date: {start_date}")
            if not target_date:
                # Use existing timeline target or default to 6 months from now
                from datetime import datetime, timedelta
                target_date = existing_timeline.get('targetDeadline') or (datetime.now() + timedelta(days=180)).strftime("%Y-%m-%d")
                print(f"⚠️ Update mode: Using target_date: {target_date}")
        else:
            # For new timelines, require all fields
            if not role:
                return jsonify({
                    'error': 'role is required. Please specify the position you are recruiting for (e.g., "Investment Banking Analyst", "Software Engineer Intern")'
                }), 400
            if not industry:
                return jsonify({
                    'error': 'industry is required. Please specify the industry (e.g., "Finance", "Technology")'
                }), 400
            if not start_date:
                return jsonify({
                    'error': 'startDate is required. Please specify when you want to start (e.g., "2024-01-01")'
                }), 400
            if not target_date:
                return jsonify({
                    'error': 'targetDate is required. Please specify your target deadline (e.g., "2024-06-30")'
                }), 400
        
        # Validate numApplications
        try:
            num_applications = int(num_applications)
            if num_applications < 1:
                num_applications = 30
        except (ValueError, TypeError):
            num_applications = 30
        
        # System prompt
        if is_update:
            system_prompt = """You are a recruiting timeline expert. The user wants to UPDATE their existing recruiting timeline based on new information or changes in their situation. Return only valid JSON with no markdown formatting or explanations.
            
            Return JSON in this exact format:
            {
                "phases": [
                    {
                        "name": "Phase name (e.g., 'Research & Target Firms')",
                        "startMonth": "Month abbreviation and year (e.g., 'Jan 2024')",
                        "endMonth": "Month abbreviation and year (e.g., 'Feb 2024')",
                        "goals": ["Goal 1", "Goal 2", "Goal 3"],
                        "description": "Brief description of what happens in this phase"
                    }
                ]
            }
            
            Requirements:
            - Create 4-6 phases that span from startDate to targetDate
            - Phases should be realistic and sequential
            - Each phase should have 2-3 specific, actionable goals
            - Month names should be abbreviated (Jan, Feb, Mar, etc.) followed by the year
            - Phases should cover: research, networking, applications, interview prep, interviews, and offer evaluation
            - Distribute the number of applications across appropriate phases
            - Make descriptions concise (1-2 sentences)
            - Consider industry-specific recruiting timelines (e.g., banking has fall recruiting, tech has year-round)
            - IMPORTANT: The user's update request should be reflected in the new timeline. If they mention starting later, targeting different firms, or changing their approach, incorporate those changes.
            - Return ONLY the JSON object, no markdown code blocks, no explanations"""
        else:
            system_prompt = """You are a recruiting timeline expert. Return only valid JSON with no markdown formatting or explanations.
            
            Generate a realistic recruiting timeline based on the user's inputs. Consider typical recruiting cycles for the given industry.
            
            Return JSON in this exact format:
            {
                "phases": [
                    {
                        "name": "Phase name (e.g., 'Research & Target Firms')",
                        "startMonth": "Month abbreviation and year (e.g., 'Jan 2024')",
                        "endMonth": "Month abbreviation and year (e.g., 'Feb 2024')",
                        "goals": ["Goal 1", "Goal 2", "Goal 3"],
                        "description": "Brief description of what happens in this phase"
                    }
                ]
            }
            
            Requirements:
            - Create 4-6 phases that span from startDate to targetDate
            - Phases should be realistic and sequential
            - Each phase should have 2-3 specific, actionable goals
            - Month names should be abbreviated (Jan, Feb, Mar, etc.) followed by the year
            - Phases should cover: research, networking, applications, interview prep, interviews, and offer evaluation
            - Distribute the number of applications across appropriate phases
            - Make descriptions concise (1-2 sentences)
            - Consider industry-specific recruiting timelines (e.g., banking has fall recruiting, tech has year-round)
            - Return ONLY the JSON object, no markdown code blocks, no explanations"""
        
        # User prompt
        if is_update and existing_timeline and prompt:
            # Include existing timeline and update request
            existing_phases_str = ""
            if existing_timeline.get('phases'):
                existing_phases_str = "\n\nEXISTING TIMELINE:\n"
                for i, phase in enumerate(existing_timeline['phases'], 1):
                    existing_phases_str += f"{i}. {phase.get('name', 'Phase')} ({phase.get('startMonth', '')} - {phase.get('endMonth', '')}): {phase.get('description', '')}\n"
            
            user_prompt = f"""UPDATE the recruiting timeline based on the user's request.

            USER'S UPDATE REQUEST: "{prompt}"

            Current timeline context:
            - Role: {role}
            - Industry: {industry}
            - Start Date: {start_date}
            - Target Deadline: {target_date}
            - Number of Applications: {num_applications}
            {existing_phases_str}

            Generate a NEW timeline that incorporates the user's requested changes. The user's update request is the most important factor - make sure the new timeline reflects what they asked for (e.g., if they say they're starting in December and targeting smaller banks on later cycles, adjust the timeline accordingly).

            Consider typical recruiting cycles for {industry} and create phases that are realistic and actionable based on the user's specific situation and update request."""
        else:
            user_prompt = f"""Create a realistic recruiting timeline for:
            - Role: {role}
            - Industry: {industry}
            - Start Date: {start_date}
            - Target Deadline: {target_date}
            - Number of Applications: {num_applications}
            
            Generate a timeline that helps the user achieve their goal of landing this role by the target date.
            Consider typical recruiting cycles for {industry} and create phases that are realistic and actionable."""
        
        print(f"📅 Generating timeline for user {user_id}: {role} in {industry}")
        
        # Call OpenAI
        try:
            response = client.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                max_tokens=2000,
                temperature=0.7,
                response_format={"type": "json_object"}
            )
        except Exception as openai_error:
            print(f"❌ OpenAI API error: {openai_error}")
            # Fallback to gpt-4-turbo if gpt-4 fails
            try:
                print("🔄 Trying gpt-4-turbo as fallback...")
                response = client.chat.completions.create(
                    model="gpt-4-turbo",
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    max_tokens=2000,
                    temperature=0.7,
                    response_format={"type": "json_object"}
                )
            except Exception as fallback_error:
                print(f"❌ Fallback model also failed: {fallback_error}")
                return jsonify({
                    'error': 'Failed to generate timeline: OpenAI API error'
                }), 500
        
        # Extract response content
        timeline_json = response.choices[0].message.content.strip()
        
        # Remove markdown code blocks if present
        if '```' in timeline_json:
            # Extract JSON from markdown code blocks
            json_match = re.search(r'```(?:json)?\s*(\{.*\})\s*```', timeline_json, re.DOTALL)
            if json_match:
                timeline_json = json_match.group(1)
            else:
                # Try to find JSON object in the string
                json_match = re.search(r'\{.*\}', timeline_json, re.DOTALL)
                if json_match:
                    timeline_json = json_match.group(0)
        
        # Parse JSON
        try:
            timeline_data = json.loads(timeline_json)
        except json.JSONDecodeError as e:
            print(f"❌ Failed to parse JSON response: {e}")
            print(f"Response content: {timeline_json[:500]}")
            return jsonify({
                'error': 'Failed to parse timeline response from AI'
            }), 500
        
        # Validate structure
        if 'phases' not in timeline_data:
            print(f"❌ Missing 'phases' in response: {timeline_data}")
            return jsonify({
                'error': 'Invalid timeline structure: missing phases'
            }), 500
        
        if not isinstance(timeline_data['phases'], list):
            print(f"❌ 'phases' is not a list: {type(timeline_data['phases'])}")
            return jsonify({
                'error': 'Invalid timeline structure: phases must be a list'
            }), 500
        
        if len(timeline_data['phases']) == 0:
            print(f"❌ Empty phases list")
            return jsonify({
                'error': 'Invalid timeline structure: no phases returned'
            }), 500
        
        # Validate each phase has required fields
        for i, phase in enumerate(timeline_data['phases']):
            required_fields = ['name', 'startMonth', 'endMonth', 'goals', 'description']
            missing = [field for field in required_fields if field not in phase]
            if missing:
                print(f"❌ Phase {i} missing fields: {missing}")
                return jsonify({
                    'error': f'Invalid phase structure: missing fields {missing}'
                }), 500
        
        print(f"✅ Successfully generated timeline with {len(timeline_data['phases'])} phases")
        
        # Return response in format expected by frontend
        return jsonify({
            'success': True,
            'timeline': {
                'phases': timeline_data['phases']
            },
            'startDate': start_date,
            'targetDeadline': target_date
        })
    
    except Exception as e:
        print(f"❌ Error generating timeline: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': 'Failed to generate timeline'
        }), 500

