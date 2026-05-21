"""
LinkedIn import routes - Import contact from LinkedIn URL
"""
from flask import Blueprint, request, jsonify
import requests
import re
from datetime import datetime

from ..extensions import require_firebase_auth, get_db
from ..config import PDL_BASE_URL, PEOPLE_DATA_LABS_API_KEY
from ..services.reply_generation import batch_generate_emails
from ..utils.warmth_scoring import score_contacts_for_email
from ..services.gmail_client import create_gmail_draft_for_user, download_resume_from_url
from ..services.hunter import get_verified_email, get_smart_company_domain

linkedin_import_bp = Blueprint('linkedin_import', __name__, url_prefix='/api/contacts')


def resolve_email_for_linkedin_import(pdl_contact: dict, person_data: dict) -> dict:
    """
    Resolve email using Hunter.io fallback pipeline (same as Meeting Prep).
    
    Args:
        pdl_contact: Extracted contact dict with FirstName, LastName, Company fields
        person_data: Raw PDL person data dict for email extraction and context
    
    Returns:
        {
            "email": str | None,
            "email_source": "pdl" | "hunter.io" | None
        }
    """
    print(f"\n[LinkedInImport] ========== Email Resolution Started ==========")
    
    first_name = pdl_contact.get('FirstName', '')
    last_name = pdl_contact.get('LastName', '')
    company = pdl_contact.get('Company', '')
    
    print(f"[LinkedInImport] Contact Info: {first_name} {last_name} at {company}")
    
    # Extract PDL email from raw person_data (same pattern as extract_contact_from_pdl_person_enhanced)
    # Use same logic as _choose_best_email from pdl_client.py
    emails = person_data.get('emails') or []
    if not isinstance(emails, list):
        emails = []
    recommended = person_data.get('recommended_personal_email') or ''
    if not isinstance(recommended, str):
        recommended = ''
    
    print(f"[LinkedInImport] PDL Email Data: {len(emails)} email(s) found")
    
    def is_valid_email(addr: str) -> bool:
        if not isinstance(addr, str):
            return False
        if not addr or '@' not in addr:
            return False
        bad = ["example.com", "test.com", "domain.com", "noreply@"]
        return not any(b in addr.lower() for b in bad)
    
    # Extract valid emails with types
    email_items = []
    for e in emails:
        if isinstance(e, dict):
            addr = (e.get("address") or "").strip()
            email_type = (e.get("type") or "").lower()
            if is_valid_email(addr):
                email_items.append((email_type, addr))
                print(f"[LinkedInImport] Found valid {email_type or 'unknown'} email")
    
    # Prioritize work/professional emails
    pdl_email = None
    for email_type, addr in email_items:
        if email_type in ("work", "professional"):
            pdl_email = addr
            print(f"[LinkedInImport] Selected PDL work email")
            break
    
    # Fall back to personal email
    if not pdl_email:
        for email_type, addr in email_items:
            if email_type == "personal":
                pdl_email = addr
                print(f"[LinkedInImport] Selected PDL personal email")
                break
    
    # Fall back to recommended email
    if not pdl_email and is_valid_email(recommended):
        pdl_email = recommended
        print(f"[LinkedInImport] Selected PDL recommended email")
    
    # Fall back to first valid email
    if not pdl_email and email_items:
        pdl_email = email_items[0][1]
        print(f"[LinkedInImport] Selected first available PDL email")
    
    if not pdl_email:
        print(f"[LinkedInImport] No PDL email found - will rely on Hunter.io")
    
    # Resolve target company domain using existing domain helpers
    target_domain = None
    if company:
        print(f"[LinkedInImport] Resolving domain for company: {company}")
        target_domain = get_smart_company_domain(company)
        print(f"[LinkedInImport] Resolved domain: {target_domain or 'None'}")
    else:
        print(f"[LinkedInImport] No company provided - cannot resolve domain")
    
    # Call get_verified_email with proper parameters
    print(f"[LinkedInImport] Calling get_verified_email (domain: {target_domain or 'None'})")
    
    verified_result = get_verified_email(
        pdl_email=pdl_email,
        first_name=first_name,
        last_name=last_name,
        company=company,
        person_data=person_data,
        target_domain=target_domain
    )
    
    # Extract email and source
    email = verified_result.get('email')
    email_source = verified_result.get('email_source')
    email_verified = verified_result.get('email_verified', False)
    
    print(f"[LinkedInImport] Email resolution complete: source={email_source or 'None'}, verified={email_verified}")
    
    # Return structured output only (never "Not available", use None)
    return {
        "email": email if email and email != "Not available" else None,
        "email_source": email_source
    }


def extract_contact_from_pdl_person_enhanced(person_data):
    """
    Extract contact information from PDL person enrichment response.
    
    Args:
        person_data: Dictionary from PDL person/enrich API response
        
    Returns:
        Dictionary with standardized contact fields
    """
    contact = {}
    
    # Extract name
    first_name = person_data.get('first_name', '')
    last_name = person_data.get('last_name', '')
    contact['FirstName'] = first_name
    contact['LastName'] = last_name
    
    # Extract emails (prioritize work email)
    # Handle various formats: list, dict, boolean, string, or None
    emails_data = person_data.get('emails', [])
    work_email = None
    personal_email = None
    
    # Check if emails is actually a list/iterable
    if isinstance(emails_data, list) and len(emails_data) > 0:
        for email_obj in emails_data:
            email_addr = None
            email_type = None
            
            if isinstance(email_obj, dict):
                email_addr = email_obj.get('address', '') or email_obj.get('email', '')
                email_type = email_obj.get('type', '').lower()
            elif isinstance(email_obj, str):
                # Handle case where emails is a list of strings
                email_addr = email_obj
                email_type = 'work'  # Default to work
            
            if email_addr and '@' in email_addr:
                if email_type == 'work' or (email_type is None and not personal_email):
                    if not work_email:
                        work_email = email_addr
                    contact['Email'] = email_addr
                    contact['WorkEmail'] = email_addr
                elif email_type == 'personal':
                    if not personal_email:
                        personal_email = email_addr
                    contact['PersonalEmail'] = email_addr
    elif isinstance(emails_data, dict):
        # Handle case where emails is a single dict
        email_addr = emails_data.get('address', '') or emails_data.get('email', '')
        if email_addr and '@' in email_addr:
            contact['Email'] = email_addr
            contact['WorkEmail'] = email_addr
    elif isinstance(emails_data, str) and '@' in emails_data:
        # Handle case where emails is a single string
        contact['Email'] = emails_data
        contact['WorkEmail'] = emails_data
    
    # If no work email but we have personal email, use that
    if not contact.get('Email') and personal_email:
        contact['Email'] = personal_email
    
    # Extract job information
    job_titles = person_data.get('job_titles', [])
    if isinstance(job_titles, list) and len(job_titles) > 0:
        # Get the most recent job title
        latest_job = job_titles[0]
        if isinstance(latest_job, dict):
            contact['Title'] = latest_job.get('title', '') or latest_job.get('name', '')
        elif isinstance(latest_job, str):
            contact['Title'] = latest_job
    elif isinstance(job_titles, str):
        contact['Title'] = job_titles
    elif isinstance(job_titles, dict):
        contact['Title'] = job_titles.get('title', '') or job_titles.get('name', '')
    
    # Extract company information
    # PDL API can return either 'experience' (singular) or 'experiences' (plural)
    experiences = person_data.get('experiences') or person_data.get('experience') or []
    
    print(f"[LinkedInImport] [ExtractContact] Checking experiences: type={type(experiences)}, length={len(experiences) if isinstance(experiences, list) else 'N/A'}")
    
    if isinstance(experiences, list) and len(experiences) > 0:
        # Get the most recent experience
        latest_exp = experiences[0]
        print(f"[LinkedInImport] [ExtractContact] Latest experience: {latest_exp}")
        if isinstance(latest_exp, dict):
            company_obj = latest_exp.get('company', {})
            print(f"[LinkedInImport] [ExtractContact] Company object from experience: {company_obj} (type: {type(company_obj)})")
            if isinstance(company_obj, dict):
                contact['Company'] = company_obj.get('name', '')
                print(f"[LinkedInImport] [ExtractContact] Extracted company name from dict: {contact['Company']}")
            elif isinstance(company_obj, str):
                contact['Company'] = company_obj
                print(f"[LinkedInImport] [ExtractContact] Extracted company name from string: {contact['Company']}")
    elif isinstance(experiences, dict):
        # Handle case where experiences is a single dict
        company_obj = experiences.get('company', {})
        if isinstance(company_obj, dict):
            contact['Company'] = company_obj.get('name', '')
        elif isinstance(company_obj, str):
            contact['Company'] = company_obj
    
    # Also check top-level company field
    if not contact.get('Company'):
        company = person_data.get('company', '')
        print(f"[LinkedInImport] [ExtractContact] Checking top-level company field: {company} (type: {type(company)})")
        if isinstance(company, str):
            contact['Company'] = company
        elif isinstance(company, dict):
            contact['Company'] = company.get('name', '')
    
    print(f"[LinkedInImport] [ExtractContact] Final extracted company: '{contact.get('Company', '')}'")
    
    # Extract location
    location = person_data.get('location', {})
    if isinstance(location, dict):
        contact['City'] = location.get('city', '')
        contact['State'] = location.get('region', '')
        contact['Country'] = location.get('country', '')
    
    # Extract LinkedIn
    profiles = person_data.get('profiles', [])
    linkedin_url = None
    if isinstance(profiles, list):
        for profile in profiles:
            if isinstance(profile, dict):
                if profile.get('network', '').lower() == 'linkedin':
                    linkedin_url = profile.get('url', '')
                    break
    elif isinstance(profiles, dict):
        if profiles.get('network', '').lower() == 'linkedin':
            linkedin_url = profiles.get('url', '')
    
    # Also check top-level linkedin_url field
    if not linkedin_url:
        linkedin_url = person_data.get('linkedin_url') or person_data.get('linkedin')
    
    if linkedin_url:
        contact['LinkedIn'] = linkedin_url
    
    # Extract phone
    phone_numbers = person_data.get('phone_numbers', [])
    if isinstance(phone_numbers, list) and len(phone_numbers) > 0:
        phone_obj = phone_numbers[0]
        if isinstance(phone_obj, dict):
            contact['Phone'] = phone_obj.get('number', '') or phone_obj.get('phone', '')
        else:
            contact['Phone'] = str(phone_obj)
    elif isinstance(phone_numbers, str):
        contact['Phone'] = phone_numbers
    elif isinstance(phone_numbers, dict):
        contact['Phone'] = phone_numbers.get('number', '') or phone_numbers.get('phone', '')
    
    # Also check top-level phone field
    if not contact.get('Phone'):
        phone = person_data.get('phone', '') or person_data.get('phone_number', '')
        if phone:
            contact['Phone'] = str(phone)
    
    # Extract education
    educations = person_data.get('education', [])
    if isinstance(educations, list) and len(educations) > 0:
        latest_edu = educations[0]
        if isinstance(latest_edu, dict):
            school_obj = latest_edu.get('school', {})
            if isinstance(school_obj, dict):
                contact['College'] = school_obj.get('name', '')
            elif isinstance(school_obj, str):
                contact['College'] = school_obj
            contact['EducationTop'] = contact.get('College', '')
    elif isinstance(educations, dict):
        # Handle case where education is a single dict
        school_obj = educations.get('school', {})
        if isinstance(school_obj, dict):
            contact['College'] = school_obj.get('name', '')
        elif isinstance(school_obj, str):
            contact['College'] = school_obj
        contact['EducationTop'] = contact.get('College', '')
    
    # Also check top-level school/college fields
    if not contact.get('College'):
        school = person_data.get('school', '') or person_data.get('college', '')
        if isinstance(school, str):
            contact['College'] = school
        elif isinstance(school, dict):
            contact['College'] = school.get('name', '')
        contact['EducationTop'] = contact.get('College', '')
    
    # Don't set "Not available" - email will be resolved via Hunter
    # Leave Email field empty if no PDL email found
    
    return contact


def normalize_linkedin_url(url):
    """Normalize LinkedIn URL to standard format"""
    url = url.strip().rstrip('/')
    url = url.split('?')[0]
    
    pattern = r'^https?://(www\.)?linkedin\.com/in/([\w-]+)$'
    match = re.match(pattern, url)
    
    if match:
        username = match.group(2)
        return f'https://www.linkedin.com/in/{username}'
    return None


@linkedin_import_bp.route('/import-linkedin', methods=['POST', 'OPTIONS'])
@require_firebase_auth
def import_from_linkedin():
    """
    Import a contact from LinkedIn URL:
    1. Parse LinkedIn URL to extract username
    2. Query PDL to find contact by LinkedIn URL
    3. Generate personalized email using OpenAI
    4. Create Gmail draft
    5. Save contact to Firestore
    """
    # Handle OPTIONS preflight requests
    if request.method == 'OPTIONS':
        # CORS middleware will handle headers, just return empty response
        return '', 200
    
    try:
        print(f"\n{'='*80}")
        print(f"[LinkedInImport] ========== NEW IMPORT REQUEST ==========")
        print(f"{'='*80}")
        
        data = request.get_json() or {}
        linkedin_url = data.get('linkedin_url', '').strip()
        user_id = request.firebase_user['uid']
        user_resume = data.get('user_resume', '')
        user_email = request.firebase_user.get('email', 'Unknown')
        
        print(f"[LinkedInImport] Request received: resume_provided={bool(user_resume)}")
        
        if not linkedin_url:
            print(f"[LinkedInImport] ❌ ERROR: Missing LinkedIn URL")
            return jsonify({'status': 'error', 'message': 'Missing LinkedIn URL'}), 400
        
        # Step 1: Validate and normalize LinkedIn URL
        print(f"[LinkedInImport] Step 1: Validating and normalizing LinkedIn URL...")
        linkedin_url = normalize_linkedin_url(linkedin_url)
        if not linkedin_url:
            print(f"[LinkedInImport] ❌ ERROR: Invalid LinkedIn URL format")
            return jsonify({'status': 'error', 'message': 'Invalid LinkedIn URL format'}), 400
        print(f"[LinkedInImport] ✅ Normalized URL: {linkedin_url}")
        
        # Step 2: Query PDL by LinkedIn URL
        print(f"[LinkedInImport] Step 2: Querying PDL API...")
        pdl_url = linkedin_url
        if not pdl_url.startswith('http'):
            pdl_url = f'https://www.linkedin.com/in/{pdl_url.split("/in/")[-1].rstrip("/")}'
        
        print(f"[LinkedInImport]   - PDL API URL: {PDL_BASE_URL}/person/enrich")
        print(f"[LinkedInImport]   - Profile: {pdl_url}")
        
        response = requests.get(
            f"{PDL_BASE_URL}/person/enrich",
            params={
                'api_key': PEOPLE_DATA_LABS_API_KEY,
                'profile': pdl_url,
                'pretty': True
            },
            timeout=30
        )
        
        print(f"[LinkedInImport]   - PDL Response Status: {response.status_code}")
        
        # Handle different error status codes appropriately
        if response.status_code == 402:
            # Payment Required - API quota exceeded or payment issue
            error_detail = ""
            try:
                error_data = response.json()
                error_detail = error_data.get("error", {}).get("message", "") if isinstance(error_data.get("error"), dict) else str(error_data.get("error", ""))
            except:
                error_detail = response.text[:200] if response.text else ""
            
            print(f"[LinkedInImport] ❌ ERROR: PDL API returned 402 (Payment Required): {error_detail}")
            
            # Check if it's a quota/credits issue
            if "maximum" in error_detail.lower() or "matches used" in error_detail.lower() or "quota" in error_detail.lower() or "limit" in error_detail.lower():
                error_message = "The contact lookup service has reached its monthly limit. Please try again later or contact support for assistance."
            else:
                error_message = "The contact lookup service is temporarily unavailable due to a payment issue. Please try again in a few minutes or contact support."
            
            return jsonify({
                'status': 'error', 
                'message': error_message,
                'error_code': 'PDL_QUOTA_EXCEEDED'
            }), 503  # Service Unavailable
        
        elif response.status_code != 200:
            print(f"[LinkedInImport] ❌ ERROR: PDL API returned {response.status_code}")
            # For other non-200 status codes, try to extract error message
            error_message = 'Could not find contact information for this LinkedIn profile'
            try:
                error_data = response.json()
                if isinstance(error_data.get("error"), dict):
                    error_message = error_data.get("error", {}).get("message", error_message)
                elif isinstance(error_data.get("error"), str):
                    error_message = error_data.get("error", error_message)
            except:
                pass
            
            return jsonify({
                'status': 'error', 
                'message': error_message,
                'error_code': 'PDL_API_ERROR'
            }), 404
        
        person_data = response.json()
        print(f"[LinkedInImport]   - PDL Response Status (JSON): {person_data.get('status')}")
        print(f"[LinkedInImport]   - PDL Has Data: {bool(person_data.get('data'))}")
        
        if person_data.get('status') != 200 or not person_data.get('data'):
            print(f"[LinkedInImport] ❌ ERROR: PDL returned no data")
            return jsonify({
                'status': 'error', 
                'message': 'Could not find contact information for this LinkedIn profile',
                'error_code': 'CONTACT_NOT_FOUND'
            }), 404
        
        # Log raw PDL data structure for debugging
        raw_data = person_data['data']
        print(f"[LinkedInImport]   - PDL Data Structure Debug:")
        print(f"[LinkedInImport]     - Has 'experience': {bool(raw_data.get('experience'))}")
        print(f"[LinkedInImport]     - Has 'experiences': {bool(raw_data.get('experiences'))}")
        print(f"[LinkedInImport]     - Has 'company': {bool(raw_data.get('company'))}")
        if raw_data.get('experience'):
            exp = raw_data.get('experience', [])
            if isinstance(exp, list) and len(exp) > 0:
                print(f"[LinkedInImport]     - Experience[0] company: {exp[0].get('company') if isinstance(exp[0], dict) else 'N/A'}")
        if raw_data.get('experiences'):
            exps = raw_data.get('experiences', [])
            if isinstance(exps, list) and len(exps) > 0:
                print(f"[LinkedInImport]     - Experiences[0] company: {exps[0].get('company') if isinstance(exps[0], dict) else 'N/A'}")
        
        # Extract contact using existing function
        print(f"[LinkedInImport] Step 3: Extracting contact data from PDL response...")
        pdl_contact = extract_contact_from_pdl_person_enhanced(person_data['data'])
        if not pdl_contact:
            print(f"[LinkedInImport] ❌ ERROR: Failed to extract contact data")
            return jsonify({'status': 'error', 'message': 'Failed to extract contact data'}), 500
        
        print(f"[LinkedInImport] ✅ Contact Extracted:")
        print(f"[LinkedInImport]   - Name: {pdl_contact.get('FirstName', '')} {pdl_contact.get('LastName', '')}")
        print(f"[LinkedInImport]   - Company: {pdl_contact.get('Company', 'None')}")
        print(f"[LinkedInImport]   - Title: {pdl_contact.get('Title', 'None')}")
        print(f"[LinkedInImport]   - Location: {pdl_contact.get('City', '')}, {pdl_contact.get('State', '')}")
        
        # Step 3: Resolve email using Hunter fallback pipeline
        print(f"[LinkedInImport] Step 4: Resolving email using Hunter.io pipeline...")
        email_result = resolve_email_for_linkedin_import(pdl_contact, person_data['data'])
        contact_email = email_result['email']
        email_source = email_result['email_source']
        has_email = contact_email is not None
        
        print(f"[LinkedInImport] Email resolution: found={has_email}, source={email_source or 'None'}")
        
        contact_for_email = pdl_contact.copy()
        contact_for_email['LinkedIn'] = linkedin_url
        # Update email in contact_for_email for email generation
        if contact_email:
            contact_for_email['Email'] = contact_email
        
        # Step 4: Generate personalized email (only if email is available)
        print(f"[LinkedInImport] Step 5: Preparing email generation...")
        db = get_db()
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        user_data = user_doc.to_dict() if user_doc.exists else {}
        user_profile = {}
        if user_doc.exists:
            user_profile = {
                'name': user_data.get('name', ''),
                'university': user_data.get('university', ''),
                'major': user_data.get('major', ''),
                'year': user_data.get('year', ''),
            }
            print(f"[LinkedInImport] User profile loaded")
        else:
            print(f"[LinkedInImport]   - No user profile found in Firestore")
        # Use request body resume if provided (e.g. from web app); otherwise use saved resume from Firestore (for extension)
        resume_text_for_email = (user_resume or '').strip() or (user_data.get('resumeText') or '')
        if not (user_resume or '').strip() and resume_text_for_email:
            print(f"[LinkedInImport] Using saved resume from Firestore ({len(resume_text_for_email)} chars)")
        
        email_subject = None
        email_body = None
        draft_result = None
        
        if has_email:
            print(f"[LinkedInImport] Step 6: Generating personalized email...")
            # Generate personalized email (include resume line for networking; template_purpose=None => include resume)
            auth_display_name = (getattr(request, "firebase_user", None) or {}).get("name") or ""
            warmth_data = score_contacts_for_email(user_data or {}, [contact_for_email])
            email_results = batch_generate_emails(
                contacts=[contact_for_email],
                resume_text=resume_text_for_email or None,
                user_profile=user_profile,
                career_interests=[],
                fit_context=None,
                pre_parsed_user_info=(user_data or {}).get("resumeParsed"),
                email_template_purpose='networking',
                resume_filename=user_data.get('resumeFileName') if user_data else None,
                signoff_config=None,
                auth_display_name=auth_display_name,
                warmth_data=warmth_data,
                uid=user_id,
            )

            print(f"[LinkedInImport] Email generation result: {bool(email_results)}")
            
            if email_results and len(email_results) > 0:
                # batch_generate_emails returns a dict with integer keys (0, 1, 2, ...)
                email_data = email_results.get(0) or email_results.get('0')
                if not email_data:
                    if isinstance(email_results, dict) and len(email_results) > 0:
                        # Try to get the first value
                        email_data = list(email_results.values())[0]
                    elif isinstance(email_results, list) and len(email_results) > 0:
                        email_data = email_results[0]
                
                if email_data:
                    email_subject = email_data.get('subject', f"Connecting with you - {contact_for_email['FirstName']}")
                    email_body = email_data.get('body', '')
                    print(f"[LinkedInImport]   - Email Subject: {email_subject}")
                    print(f"[LinkedInImport]   - Email Body Length: {len(email_body) if email_body else 0} characters")
                    
                    # Step 5: Create Gmail draft (only if email was generated)
                    if email_body:
                        print(f"[LinkedInImport] Step 7: Creating Gmail draft...")
                        user_email = request.firebase_user.get('email')
                        # Load user's resume from Firestore and download for attachment (extension does not send resume)
                        resume_content = None
                        resume_filename = None
                        resume_url = user_data.get('resumeUrl') if user_data else None
                        if resume_url:
                            try:
                                resume_content, resume_filename = download_resume_from_url(resume_url)
                                if resume_content:
                                    stored_filename = user_data.get('resumeFileName') if user_data else None
                                    if stored_filename:
                                        resume_filename = stored_filename
                                    elif not resume_filename:
                                        resume_filename = 'resume.pdf'
                                    print(f"[LinkedInImport]   - Resume will be attached: {resume_filename}")
                                else:
                                    print(f"[LinkedInImport]   - Resume download failed - draft will be created without attachment")
                            except Exception as e:
                                print(f"[LinkedInImport]   - Resume fetch error: {e}")
                        else:
                            print(f"[LinkedInImport]   - No resumeUrl in account - draft without attachment")
                        # Build user_info for draft signature (name, email, phone, linkedin)
                        user_info = {
                            'name': user_profile.get('name', '') or user_data.get('name', ''),
                            'email': user_email or '',
                            'phone': user_data.get('phone', '') if user_data else '',
                            'linkedin': user_data.get('linkedin', '') if user_data else '',
                        }
                        try:
                            draft_result = create_gmail_draft_for_user(
                                contact=contact_for_email,
                                email_subject=email_subject,
                                email_body=email_body,
                                tier='free',
                                user_email=user_email,
                                user_id=user_id,
                                user_info=user_info,
                                resume_content=resume_content,
                                resume_filename=resume_filename,
                            )
                            if draft_result:
                                print(f"[LinkedInImport]   - ✅ Gmail draft created successfully")
                                if isinstance(draft_result, dict):
                                    print(f"[LinkedInImport]   - Draft ID: {draft_result.get('draft_id', 'Unknown')}")
                                    print(f"[LinkedInImport]   - Draft URL: {draft_result.get('draft_url', 'Unknown')}")
                            else:
                                print(f"[LinkedInImport]   - ⚠️ Gmail draft creation returned None")
                        except Exception as draft_error:
                            print(f"[LinkedInImport]   - ❌ Gmail draft creation error: {draft_error}")
                            import traceback
                            traceback.print_exc()
                    else:
                        print(f"[LinkedInImport]   - ⚠️ No email body generated, skipping draft creation")
                else:
                    print(f"[LinkedInImport]   - ⚠️ No email data extracted from generation results")
            else:
                print(f"[LinkedInImport]   - ⚠️ Email generation returned no results")
        else:
            print(f"[LinkedInImport] Step 6: Skipping email generation (no email found)")
        
        # Step 6: Save to Firestore
        print(f"[LinkedInImport] Step 8: Saving contact to Firestore...")
        contact_data = {
            'firstName': pdl_contact.get('FirstName', ''),
            'lastName': pdl_contact.get('LastName', ''),
            'email': contact_email,  # None if not found (not empty string)
            'emailSource': email_source,  # "pdl" or "hunter.io" or None
            'linkedinUrl': linkedin_url,
            'jobTitle': pdl_contact.get('Title', ''),
            'company': pdl_contact.get('Company', ''),
            'location': f"{pdl_contact.get('City', '')}, {pdl_contact.get('State', '')}".strip(', '),
            'source': 'linkedin_import',
            'status': 'drafted' if has_email and draft_result else 'not_contacted',
            'createdAt': datetime.utcnow(),
            'updatedAt': datetime.utcnow(),
            # pdlId for agentic queue dedup (new in Phase 1).
            'pdlId': pdl_contact.get('pdlId', '') or '',
        }
        
        # Add email content and draft info if available
        if email_subject:
            contact_data['emailSubject'] = email_subject
        if email_body:
            contact_data['emailBody'] = email_body  # Fixed: use emailBody (not emailContent) to match frontend expectations
        
        if draft_result:
            if isinstance(draft_result, dict):
                contact_data['gmailDraftId'] = draft_result.get('draft_id')
                message_id = draft_result.get('message_id')
                if message_id:
                    contact_data['gmailMessageId'] = message_id
                contact_data['gmailDraftUrl'] = draft_result.get('draft_url')
                contact_data['gmailThreadId'] = draft_result.get('thread_id')
            else:
                contact_data['gmailDraftId'] = str(draft_result)
            contact_data['pipelineStage'] = 'draft_created'
            contact_data['emailGeneratedAt'] = datetime.utcnow().isoformat() + "Z"

        print(f"[LinkedInImport]   - Contact Data Prepared:")
        print(f"[LinkedInImport]     - Name: {contact_data['firstName']} {contact_data['lastName']}")
        print(f"[LinkedInImport]     - Email: {contact_data['email'] or 'None'}")
        print(f"[LinkedInImport]     - Email Source: {contact_data['emailSource'] or 'None'}")
        print(f"[LinkedInImport]     - Status: {contact_data['status']}")
        
        contacts_ref = db.collection('users').document(user_id).collection('contacts')
        doc_ref = contacts_ref.add(contact_data)
        contact_id = doc_ref[1].id
        print(f"[LinkedInImport]   - ✅ Contact saved with ID: {contact_id}")
        
        # Step 7: Deduct credit
        print(f"[LinkedInImport] Step 9: Deducting credit...")
        credits_to_deduct = 5
        user_doc = user_ref.get()
        current_credits = 0
        if user_doc.exists:
            current_credits = user_doc.to_dict().get('credits', 0)
        
        print(f"[LinkedInImport]   - Current Credits: {current_credits}")
        print(f"[LinkedInImport]   - Credits to Deduct: {credits_to_deduct}")
        
        new_credits = max(0, current_credits - credits_to_deduct)
        user_ref.update({
            'credits': new_credits,
            'lastCreditUsage': datetime.utcnow().isoformat()
        })
        print(f"[LinkedInImport]   - ✅ New Credits: {new_credits}")
        
        # Build response message
        print(f"[LinkedInImport] Step 10: Preparing response...")
        full_name = f"{pdl_contact.get('FirstName', '')} {pdl_contact.get('LastName', '')}".strip()
        
        # HTTP Semantics: 200 for success (email optional), 404 only for contact not found, 500 for errors
        # Always return 200 if contact was successfully imported, even without email
        if has_email and draft_result:
            message = f'Successfully imported {full_name}! Gmail draft created.'
        elif has_email:
            message = f'Successfully imported {full_name}, but email draft could not be created.'
        else:
            # No email found after Hunter fallback, but contact was imported successfully
            message = f'Successfully imported {full_name}, but no email address was found. You can add an email manually later.'
        
        status_code = 200  # Always 200 for successful contact import
        
        print(f"[LinkedInImport] Final Summary:")
        print(f"[LinkedInImport]   - Contact: {full_name}")
        print(f"[LinkedInImport]   - Email Found: {has_email}")
        print(f"[LinkedInImport]   - Email Source: {email_source or 'None'}")
        print(f"[LinkedInImport]   - Draft Created: {draft_result is not None}")
        print(f"[LinkedInImport]   - Credits Remaining: {new_credits}")
        print(f"[LinkedInImport]   - Status Code: {status_code}")
        print(f"{'='*80}")
        print(f"[LinkedInImport] ========== IMPORT COMPLETE ==========")
        print(f"{'='*80}\n")
        
        response_payload = {
            'status': 'ok',
            'contact': {
                'full_name': full_name,
                'email': contact_email,  # None if not found
                'email_source': email_source,  # "pdl" or "hunter.io" or None
                'linkedin_url': linkedin_url,
            },
            'contact_id': contact_id,
            'draft_created': draft_result is not None,
            'email_found': has_email,
            'message': message,
            'credits_remaining': new_credits
        }
        if draft_result and isinstance(draft_result, dict) and draft_result.get('draft_url'):
            response_payload['gmail_draft_url'] = draft_result.get('draft_url')
        return jsonify(response_payload), status_code
        
    except Exception as e:
        print(f"\n{'='*80}")
        print(f"[LinkedInImport] ❌❌❌ ERROR OCCURRED ❌❌❌")
        print(f"{'='*80}")
        print(f"[LinkedInImport] Error: {str(e)}")
        print(f"[LinkedInImport] Error Type: {type(e).__name__}")
        import traceback
        print(f"[LinkedInImport] Traceback:")
        traceback.print_exc()
        print(f"{'='*80}\n")
        return jsonify({'status': 'error', 'message': str(e)}), 500

