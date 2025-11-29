"""
Run routes - free and pro tier search endpoints
"""
import json
import csv
from app.services.pdl_client import search_contacts_with_smart_location_strategy, get_contact_identity
from io import StringIO
from flask import Blueprint, request, jsonify, send_file
from werkzeug.utils import secure_filename

from app.extensions import require_firebase_auth, get_db
from app.services.resume_parser import extract_text_from_pdf
from app.services.reply_generation import batch_generate_emails
from app.services.gmail_client import _load_user_gmail_creds, _gmail_service, create_gmail_draft_for_user
from app.services.auth import check_and_reset_credits
from app.services.hunter import enrich_contacts_with_hunter
from app.config import TIER_CONFIGS
from firebase_admin import firestore
def _is_valid_email(value: str) -> bool:
    """Basic sanity check for emails."""
    if not isinstance(value, str):
        return False
    value = value.strip()
    if not value:
        return False
    if value.lower() in ("not available", "n/a"):
        return False
    if "@" not in value:
        return False
    return True


def has_pdl_email(contact: dict) -> bool:
    """
    Treat ANY of Email / WorkEmail / PersonalEmail as 'PDL has an email'
    as long as it looks like a real email.
    """
    candidates = [
        contact.get("Email"),
        contact.get("WorkEmail"),
        contact.get("PersonalEmail"),
    ]
    return any(_is_valid_email(v) for v in candidates)
runs_bp = Blueprint('runs', __name__, url_prefix='/api')


# Note: run_free_tier_enhanced_optimized and run_pro_tier_enhanced_final_with_text
# are large functions that should be moved to services/runs_service.py
# For now, importing them from app.py (will be moved later)
def run_free_tier_enhanced_optimized(job_title, company, location, user_email=None, user_profile=None, resume_text=None, career_interests=None, college_alumni=None, batch_size=None):
    """Free tier search - will be moved to services/runs_service.py"""
    # Import here to avoid circular dependencies
    # This function will be extracted from app.py and moved to services
    
    import time
    start_time = time.time()
    
    print(f"Starting OPTIMIZED Free tier for {user_email}")
    
    try:
        db = get_db()
        user_id = None
        if hasattr(request, 'firebase_user'):
            user_id = request.firebase_user.get('uid')
        
        credits_available = 120
        if db and user_id:
            try:
                user_ref = db.collection('users').document(user_id)
                user_doc = user_ref.get()
                if user_doc.exists:
                    user_data = user_doc.to_dict()
                    credits_available = check_and_reset_credits(user_ref, user_data)
                    
                    # ✅ LOAD FROM SUBCOLLECTION (not contactLibrary field)
                    contacts_ref = db.collection('users').document(user_id).collection('contacts')
                    contact_docs = list(contacts_ref.stream())
                    
                    seen_contact_set = set()
                    
                    for doc in contact_docs:
                        contact = doc.to_dict()
                        
                        # Standardize to match PDL format for identity matching
                        standardized = {
                            'FirstName': contact.get('firstName', ''),
                            'LastName': contact.get('lastName', ''),
                            'Email': contact.get('email', ''),
                            'LinkedIn': contact.get('linkedinUrl', ''),
                            'Company': contact.get('company', '')
                        }
                        
                        library_key = get_contact_identity(standardized)
                        seen_contact_set.add(library_key)
                    
                    print(f"📊 Exclusion list (from contacts subcollection):")
                    print(f"   - Contacts in database: {len(contact_docs)}")
                    print(f"   - Unique identity keys: {len(seen_contact_set)}")
                    print(f"   💡 Deleting contacts from library will allow them to appear in searches")
                    
                    if credits_available < 15:
                        return {    
                            'error': 'Insufficient credits',
                            'credits_needed': 15,
                            'current_credits': credits_available,
                            'contacts': []
                        }
            except Exception:
                pass
        
        tier_max = TIER_CONFIGS['free']['max_contacts']
        max_contacts = batch_size if batch_size and 1 <= batch_size <= tier_max else tier_max
        
        # Search contacts
        contacts = search_contacts_with_smart_location_strategy(
            job_title, company, location, max_contacts=max_contacts, college_alumni=college_alumni, exclude_keys=seen_contact_set 
        )
        
        if not contacts:
            return {'contacts': [], 'successful_drafts': 0}
        # ✅ REMOVED: No longer tracking seenContactKeys
        # Only Contact Library is used for exclusion
        # This allows contacts to reappear if library is cleared
        
        # ✅ HUNTER.IO ENRICHMENT - Enrich contacts without emails
        contacts_with_email: list[dict] = []
        contacts_without_email: list[dict] = []

        for c in contacts:
            if has_pdl_email(c):
                contacts_with_email.append(c)
            else:
                contacts_without_email.append(c)
        # 🔍 DEBUG: show a sample of contacts that we're about to send to Hunter
        if contacts_without_email:
            print("\nDEBUG: contacts WITHOUT any PDL emails (up to 5):")
            for c in contacts_without_email[:5]:
                print(
                    f"   - {c.get('FirstName','')} {c.get('LastName','')} | "
                    f"Email={c.get('Email')} | "
                    f"WorkEmail={c.get('WorkEmail')} | "
                    f"PersonalEmail={c.get('PersonalEmail')}"
                )


        print(f"\n📧 Email Status: {len(contacts_with_email)}/{len(contacts)} have emails from PDL")

        # Only use Hunter.io if we have contacts without emails
        if contacts_without_email:
            needed = max_contacts - len(contacts_with_email)
            print(f"🔍 Need {needed} more emails, enriching {len(contacts_without_email)} contacts with Hunter.io...")
            
            try:
                contacts = enrich_contacts_with_hunter(
                    contacts,
                    max_enrichments=needed  # Only enrich what we need to save Hunter credits
                )
            except Exception as hunter_error:
                ...

                print(f"⚠️ Hunter.io enrichment failed: {hunter_error}")
                import traceback
                traceback.print_exc()
                # Continue without Hunter enrichment
        else:
            print(f"✅ All {len(contacts_with_email)} contacts have emails from PDL, skipping Hunter.io enrichment")
        
        # Generate emails
        print(f"📧 Generating emails for {len(contacts)} contacts...")
        try:
            email_results = batch_generate_emails(contacts, resume_text, user_profile, career_interests)
            print(f"📧 Email generation returned {len(email_results)} results")
        except Exception as email_gen_error:
            print(f"❌ Email generation failed: {email_gen_error}")
            import traceback
            traceback.print_exc()
            # Continue with empty results - contacts won't have emails but search can still complete
            email_results = {}
        
        # Attach email data to ALL contacts FIRST (before draft creation)
        emails_attached = 0
        for i, contact in enumerate(contacts):
            key = str(i)
            email_result = email_results.get(i) or email_results.get(str(i)) or email_results.get(f"{i}")
            if email_result and isinstance(email_result, dict):
                subject = email_result.get('subject', '')
                body = email_result.get('body', '')
                if subject and body:
                    contact['emailSubject'] = subject
                    contact['emailBody'] = body
                    emails_attached += 1
                    print(f"✅ [{i}] Attached email to {contact.get('FirstName', 'Unknown')}: {subject[:50]}...")
                else:
                    print(f"⚠️ [{i}] Email result missing subject/body for {contact.get('FirstName', 'Unknown')}")
            else:
                print(f"⚠️ [{i}] No email result found for {contact.get('FirstName', 'Unknown')} (key: {key})")
        
        print(f"📧 Attached emails to {emails_attached}/{len(contacts)} contacts")
        
        # Get user resume URL
        resume_url = None
        if db and user_id:
            try:
                user_doc = db.collection('users').document(user_id).get()
                if user_doc.exists:
                    resume_url = user_doc.to_dict().get('resumeUrl')
            except Exception:
                pass
        
        # Create drafts if Gmail connected
        successful_drafts = 0
        user_info = None
        if user_profile:
            user_info = {
                'name': user_profile.get('name', ''),
                'email': user_profile.get('email', ''),
                'phone': user_profile.get('phone', ''),
                'linkedin': user_profile.get('linkedin', '')
            }
        
        try:
            creds = _load_user_gmail_creds(user_id) if user_id else None
            connected_email = None
            if creds:
                try:
                    from app.services.gmail_client import _gmail_service
                    gmail = _gmail_service(creds)
                    connected_email = gmail.users().getProfile(userId="me").execute().get("emailAddress")
                except Exception:
                    pass
                
                print(f"📧 Creating Gmail drafts for {len(contacts[:max_contacts])} contacts...")
                for i, contact in enumerate(contacts[:max_contacts]):
                    # Try both string and integer keys
                    email_result = email_results.get(i) or email_results.get(str(i)) or email_results.get(f"{i}")
                    if email_result and isinstance(email_result, dict):
                        subject = email_result.get('subject', '')
                        body = email_result.get('body', '')
                        if subject and body:
                            try:
                                draft_result = create_gmail_draft_for_user(
                                    contact, subject, body,
                                    tier='free', user_email=user_email, resume_url=resume_url, user_info=user_info, user_id=user_id
                                )
                                
                                # Handle both dict response (new) and string response (old/fallback)
                                if isinstance(draft_result, dict):
                                    draft_id = draft_result.get('draft_id', '')
                                    draft_url = draft_result.get('draft_url', '')
                                else:
                                    draft_id = draft_result
                                    draft_url = f"https://mail.google.com/mail/#drafts/{draft_id}" if draft_id and not draft_id.startswith('mock_') else None
                                
                                if draft_id and not draft_id.startswith('mock_'):
                                    successful_drafts += 1
                                    # Store draft URL with contact
                                    if draft_url:
                                        contact['gmailDraftId'] = draft_id
                                        contact['gmailDraftUrl'] = draft_url
                                    print(f"✅ [{i}] Created draft for {contact.get('FirstName', 'Unknown')}: {draft_id}")
                                else:
                                    print(f"⚠️ [{i}] Draft creation returned mock/invalid ID for {contact.get('FirstName', 'Unknown')}")
                            except Exception as draft_error:
                                print(f"❌ [{i}] Failed to create draft for {contact.get('FirstName', 'Unknown')}: {draft_error}")
                                import traceback
                                traceback.print_exc()
                        else:
                            print(f"⚠️ [{i}] Missing subject/body for {contact.get('FirstName', 'Unknown')}")
                    else:
                        print(f"⚠️ [{i}] No email result for draft creation: {contact.get('FirstName', 'Unknown')}")
        except Exception as gmail_error:
            # Token refresh happens automatically in _load_user_gmail_creds
            # Only catch errors that indicate PERMANENT auth failure
            error_str = str(gmail_error).lower()
            if 'invalid_grant' in error_str or 'token has been expired or revoked' in error_str:
                print(f"⚠️ Gmail token permanently invalid for user {user_id}")
                return {
                    'error': 'gmail_token_expired',
                    'message': 'Your Gmail connection has expired. Please reconnect your Gmail account.',
                    'require_reauth': True,
                    'contacts': contacts
                }
            else:
                print(f"⚠️ Gmail draft creation error (continuing without drafts): {gmail_error}")
                # Continue without drafts if other Gmail error
                pass
        
        # Deduct credits
        if db and user_id:
            try:
                user_ref = db.collection('users').document(user_id)
                user_ref.update({
                    'credits': firestore.Increment(-15 * len(contacts))
                })
            except Exception:
                pass
        
        # ✅ Limit contacts to batch_size before returning
        contacts_to_return = contacts[:max_contacts]
        
        elapsed = time.time() - start_time
        print(f"✅ Free tier completed in {elapsed:.2f}s - {len(contacts_to_return)} contacts (requested: {max_contacts}), {successful_drafts} drafts")
        
        return {
            'contacts': contacts_to_return,
            'successful_drafts': successful_drafts
        }
        
    except Exception as e:
        print(f"Free tier error: {e}")
        import traceback
        traceback.print_exc()
        return {'error': str(e), 'contacts': []}


def run_pro_tier_enhanced_final_with_text(job_title, company, location, resume_text, user_email=None, user_profile=None, career_interests=None, college_alumni=None, batch_size=None):
    """Pro tier search - will be moved to services/runs_service.py"""
    # Import here to avoid circular dependencies
    from flask import request
    
    import time
    start_time = time.time()
    
    print(f"Starting OPTIMIZED Pro tier for {user_email}")
    
    try:
        db = get_db()
        user_id = None
        if hasattr(request, 'firebase_user'):
            user_id = request.firebase_user.get('uid')
        
        credits_available = 1800
        if db and user_id:
            try:
                user_ref = db.collection('users').document(user_id)
                user_doc = user_ref.get()
                if user_doc.exists:
                    user_data = user_doc.to_dict()
                    credits_available = check_and_reset_credits(user_ref, user_data)
                    
                    # ✅ LOAD FROM SUBCOLLECTION (not contactLibrary field)
                    contacts_ref = db.collection('users').document(user_id).collection('contacts')
                    contact_docs = list(contacts_ref.stream())
                    
                    seen_contact_set = set()
                    
                    for doc in contact_docs:
                        contact = doc.to_dict()
                        
                        # Standardize to match PDL format for identity matching
                        standardized = {
                            'FirstName': contact.get('firstName', ''),
                            'LastName': contact.get('lastName', ''),
                            'Email': contact.get('email', ''),
                            'LinkedIn': contact.get('linkedinUrl', ''),
                            'Company': contact.get('company', '')
                        }
                        
                        library_key = get_contact_identity(standardized)
                        seen_contact_set.add(library_key)
                    
                    print(f"📊 Exclusion list (from contacts subcollection):")
                    print(f"   - Contacts in database: {len(contact_docs)}")
                    print(f"   - Unique identity keys: {len(seen_contact_set)}")
                    print(f"   💡 Deleting contacts from library will allow them to appear in searches")
                    
                    tier = user_data.get('tier', 'free')
                    if tier != 'pro':
                        return {'error': 'Pro tier subscription required', 'contacts': []}
                    if credits_available < 15:
                        return {
                            'error': 'Insufficient credits',
                            'credits_needed': 15,
                            'current_credits': credits_available,
                            'contacts': []
                        }
            except Exception:
                pass
        
        tier_max = TIER_CONFIGS['pro']['max_contacts']
        max_contacts = batch_size if batch_size and 1 <= batch_size <= tier_max else tier_max
        
        print(f"DEBUG - Pro tier batch_size: {batch_size}, tier_max: {tier_max}, calculated max_contacts: {max_contacts}")
        
        # Search contacts
        contacts = search_contacts_with_smart_location_strategy(
            job_title, company, location, max_contacts=max_contacts, college_alumni=college_alumni, exclude_keys=seen_contact_set
        )
        
        if not contacts:
            return {'contacts': [], 'successful_drafts': 0}
        
        # ✅ REMOVED: No longer tracking seenContactKeys
        # Only Contact Library is used for exclusion
        # This allows contacts to reappear if library is cleared
        
        # ✅ HUNTER.IO ENRICHMENT - Enrich contacts without emails
        contacts_with_email = [c for c in contacts if c.get('Email') and c['Email'] != "Not available"]
        contacts_without_email = len(contacts) - len(contacts_with_email)
        
        print(f"\n📧 Email Status: {len(contacts_with_email)}/{len(contacts)} have emails from PDL")
        
        # Only use Hunter.io if we have contacts without emails
        if contacts_without_email > 0:
            needed = max_contacts - len(contacts_with_email)
            print(f"🔍 Need {needed} more emails, enriching {contacts_without_email} contacts with Hunter.io...")
            
            try:
                contacts = enrich_contacts_with_hunter(
                    contacts,
                    max_enrichments=needed  # Only enrich what we need to save Hunter credits
                )
            except Exception as hunter_error:
                print(f"⚠️ Hunter.io enrichment failed: {hunter_error}")
                import traceback
                traceback.print_exc()
                # Continue without Hunter enrichment
        else:
            print(f"✅ All {len(contacts_with_email)} contacts have emails from PDL, skipping Hunter.io enrichment")
        
        # Generate emails with resume
        print(f"📧 Generating emails for {len(contacts)} contacts...")
        try:
            email_results = batch_generate_emails(contacts, resume_text, user_profile, career_interests)
            print(f"📧 Email generation returned {len(email_results)} results")
        except Exception as email_gen_error:
            print(f"❌ Email generation failed: {email_gen_error}")
            import traceback
            traceback.print_exc()
            # Continue with empty results - contacts won't have emails but search can still complete
            email_results = {}
        
        # Attach email data to ALL contacts FIRST (before draft creation)
        emails_attached = 0
        for i, contact in enumerate(contacts):
            key = str(i)
            email_result = email_results.get(i) or email_results.get(str(i)) or email_results.get(f"{i}")
            if email_result and isinstance(email_result, dict):
                subject = email_result.get('subject', '')
                body = email_result.get('body', '')
                if subject and body:
                    contact['emailSubject'] = subject
                    contact['emailBody'] = body
                    emails_attached += 1
                    print(f"✅ [{i}] Attached email to {contact.get('FirstName', 'Unknown')}: {subject[:50]}...")
                else:
                    print(f"⚠️ [{i}] Email result missing subject/body for {contact.get('FirstName', 'Unknown')}")
            else:
                print(f"⚠️ [{i}] No email result found for {contact.get('FirstName', 'Unknown')} (key: {key})")
        
        print(f"📧 Attached emails to {emails_attached}/{len(contacts)} contacts")
        
        # Get user resume URL
        resume_url = None
        if db and user_id:
            try:
                user_doc = db.collection('users').document(user_id).get()
                if user_doc.exists:
                    resume_url = user_doc.to_dict().get('resumeUrl')
            except Exception:
                pass
        
        # Create drafts
        successful_drafts = 0
        user_info = None
        if user_profile:
            user_info = {
                'name': user_profile.get('name', ''),
                'email': user_profile.get('email', ''),
                'phone': user_profile.get('phone', ''),
                'linkedin': user_profile.get('linkedin', '')
            }
        
        try:
            creds = _load_user_gmail_creds(user_id) if user_id else None
            connected_email = None
            if creds:
                try:
                    from app.services.gmail_client import _gmail_service
                    gmail = _gmail_service(creds)
                    connected_email = gmail.users().getProfile(userId="me").execute().get("emailAddress")
                except Exception:
                    pass
                
                print(f"📧 Creating Gmail drafts for {len(contacts[:max_contacts])} contacts...")
                for i, contact in enumerate(contacts[:max_contacts]):
                    key = str(i)
                    email_result = email_results.get(i) or email_results.get(str(i)) or email_results.get(f"{i}")
                    if email_result and isinstance(email_result, dict):
                        subject = email_result.get('subject', '')
                        body = email_result.get('body', '')
                        if subject and body:
                            try:
                                draft_result = create_gmail_draft_for_user(
                                    contact, subject, body,
                                    tier='pro', user_email=user_email, resume_url=resume_url, user_info=user_info, user_id=user_id
                                )
                                
                                # Handle both dict response (new) and string response (old/fallback)
                                if isinstance(draft_result, dict):
                                    draft_id = draft_result.get('draft_id', '')
                                    draft_url = draft_result.get('draft_url', '')
                                else:
                                    draft_id = draft_result
                                    draft_url = f"https://mail.google.com/mail/#drafts/{draft_id}" if draft_id and not draft_id.startswith('mock_') else None
                                
                                if draft_id and not draft_id.startswith('mock_'):
                                    successful_drafts += 1
                                    # Store draft URL with contact
                                    if draft_url:
                                        contact['gmailDraftId'] = draft_id
                                        contact['gmailDraftUrl'] = draft_url
                                    print(f"✅ [{i}] Created draft for {contact.get('FirstName', 'Unknown')}: {draft_id}")
                                else:
                                    print(f"⚠️ [{i}] Draft creation returned mock/invalid ID for {contact.get('FirstName', 'Unknown')}")
                            except Exception as draft_error:
                                print(f"❌ [{i}] Failed to create draft for {contact.get('FirstName', 'Unknown')}: {draft_error}")
                                import traceback
                                traceback.print_exc()
                        else:
                            print(f"⚠️ [{i}] Missing subject/body for {contact.get('FirstName', 'Unknown')}")
                    else:
                        print(f"⚠️ [{i}] No email result for draft creation: {contact.get('FirstName', 'Unknown')}")
        except Exception as gmail_error:
            # Token refresh happens automatically in _load_user_gmail_creds
            # Only catch errors that indicate PERMANENT auth failure
            error_str = str(gmail_error).lower()
            if 'invalid_grant' in error_str or 'token has been expired or revoked' in error_str:
                print(f"⚠️ Gmail token permanently invalid for user {user_id}")
                return {
                    'error': 'gmail_token_expired',
                    'message': 'Your Gmail connection has expired. Please reconnect your Gmail account.',
                    'require_reauth': True,
                    'contacts': contacts
                }
            else:
                print(f"⚠️ Gmail draft creation error (continuing without drafts): {gmail_error}")
                # Continue without drafts if other Gmail error
                pass
        
        # Deduct credits
        if db and user_id:
            try:
                user_ref = db.collection('users').document(user_id)
                user_ref.update({
                    'credits': firestore.Increment(-15 * len(contacts))
                })
            except Exception:
                pass
        
        # ✅ Limit contacts to batch_size before returning
        contacts_to_return = contacts[:max_contacts]
        
        elapsed = time.time() - start_time
        print(f"✅ Pro tier completed in {elapsed:.2f}s - {len(contacts_to_return)} contacts (requested: {max_contacts}), {successful_drafts} drafts")
        
        return {
            'contacts': contacts_to_return,
            'successful_drafts': successful_drafts
        }
        
    except Exception as e:
        print(f"Pro tier error: {e}")
        import traceback
        traceback.print_exc()
        return {'error': str(e), 'contacts': []}


@runs_bp.route("/free-run", methods=["POST"])
@require_firebase_auth
def free_run():
    """Free tier search endpoint"""
    try:
        if request.is_json:
            data = request.get_json(silent=True) or {}
            job_title = (data.get("jobTitle") or "").strip()
            company = (data.get("company") or "").strip()
            location = (data.get("location") or "").strip()
            user_profile = data.get("userProfile") or None
            resume_text = data.get("resumeText") or None
            career_interests = data.get("careerInterests") or []
            college_alumni = (data.get("collegeAlumni") or "").strip()
            batch_size = data.get("batchSize")
        else:
            job_title = (request.form.get("jobTitle") or "").strip()
            company = (request.form.get("company") or "").strip()
            location = (request.form.get("location") or "").strip()
            user_profile = request.form.get("userProfile") or None
            resume_text = request.form.get("resumeText") or None
            career_interests = request.form.get("careerInterests") or []
            college_alumni = (request.form.get("collegeAlumni") or "").strip()
            batch_size = request.form.get("batchSize")
        
        if batch_size is not None:
            try:
                batch_size = int(batch_size)
            except (ValueError, TypeError):
                batch_size = None
        
        user_email = (request.firebase_user or {}).get("email") or ""
        
        print(f"New unified email system Free search for {user_email}: {job_title} at {company} in {location}")
        if resume_text:
            print(f"Resume provided for enhanced personalization ({len(resume_text)} chars)")
        print(f"DEBUG - college_alumni received: {college_alumni!r}")
        print(f"DEBUG - batch_size received: {batch_size}")
        
        result = run_free_tier_enhanced_optimized(
            job_title,
            company,
            location,
            user_email=user_email,
            user_profile=user_profile,
            resume_text=resume_text,
            career_interests=career_interests,
            college_alumni=college_alumni,
            batch_size=batch_size
        )
        
        if result.get("error"):
            error_type = result.get("error")
            if error_type == "gmail_token_expired":
                return jsonify({
                    "error": error_type,
                    "message": result.get("message"),
                    "require_reauth": True,
                    "contacts": result.get("contacts", [])
                }), 401  # 401 = Unauthorized (need to re-auth)
            return jsonify({"error": result["error"]}), 500
        
        response_data = {
            "contacts": result["contacts"],
            "successful_drafts": result.get("successful_drafts", 0),
            "total_contacts": len(result["contacts"]),
            "tier": "free",
            "user_email": user_email,
        }
        return jsonify(response_data)
        
    except Exception as e:
        print(f"Free endpoint error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@runs_bp.route('/free-run-csv', methods=['POST'])
@require_firebase_auth
def free_run_csv():
    """Free tier CSV download endpoint"""
    try:
        user_email = request.firebase_user.get('email')
        user_id = request.firebase_user['uid']
        
        if request.is_json:
            data = request.json or {}
            job_title = data.get('jobTitle', '').strip() if data.get('jobTitle') else ''
            company = data.get('company', '').strip() if data.get('company') else ''
            location = data.get('location', '').strip() if data.get('location') else ''
            user_profile = data.get('userProfile') or None
            resume_text = data.get('resumeText', '').strip() if data.get('resumeText') else None
            career_interests = data.get('careerInterests', [])
        else:
            job_title = (request.form.get('jobTitle') or '').strip()
            company = (request.form.get('company') or '').strip()
            location = (request.form.get('location') or '').strip()
            user_profile_raw = request.form.get('userProfile')
            try:
                user_profile = json.loads(user_profile_raw) if user_profile_raw else None
            except Exception:
                user_profile = None
            resume_text = request.form.get('resumeText', '').strip() if request.form.get('resumeText') else None
            career_interests_raw = request.form.get('careerInterests')
            try:
                career_interests = json.loads(career_interests_raw) if career_interests_raw else []
            except Exception:
                career_interests = []
        
        result = run_free_tier_enhanced_optimized(
            job_title, company, location,
            user_email=user_email, user_profile=user_profile,
            resume_text=resume_text, career_interests=career_interests
        )
        
        if result.get('error'):
            return jsonify({'error': result['error']}), 500
        
        # Generate CSV
        output = StringIO()
        writer = csv.DictWriter(output, fieldnames=[
            'FirstName', 'LastName', 'Email', 'LinkedIn', 'Title', 'Company',
            'City', 'State', 'College', 'Phone'
        ])
        writer.writeheader()
        for contact in result.get('contacts', []):
            writer.writerow({
                'FirstName': contact.get('FirstName', ''),
                'LastName': contact.get('LastName', ''),
                'Email': contact.get('Email', ''),
                'LinkedIn': contact.get('LinkedIn', ''),
                'Title': contact.get('Title', ''),
                'Company': contact.get('Company', ''),
                'City': contact.get('City', ''),
                'State': contact.get('State', ''),
                'College': contact.get('College', ''),
                'Phone': contact.get('Phone', '')
            })
        
        output.seek(0)
        return send_file(
            output,
            mimetype='text/csv',
            as_attachment=True,
            download_name=f'contacts_{job_title}_{company}.csv'
        )
        
    except Exception as e:
        print(f"Free CSV endpoint error: {e}")
        return jsonify({'error': str(e)}), 500


@runs_bp.route("/pro-run", methods=["POST"])
@require_firebase_auth
def pro_run():
    """Pro tier search endpoint"""
    try:
        user_email = (request.firebase_user or {}).get("email") or ""
        
        if request.is_json:
            data = request.get_json(silent=True) or {}
            job_title = (data.get("jobTitle") or "").strip()
            company = (data.get("company") or "").strip()
            location = (data.get("location") or "").strip()
            resume_text = data.get("resumeText") or None
            if not resume_text:
                return jsonify({"error": "Resume text is required for Pro tier"}), 400
            user_profile = data.get("userProfile") or None
            career_interests = data.get("careerInterests") or []
            college_alumni = (data.get("collegeAlumni") or "").strip()
            batch_size = data.get("batchSize")
            if batch_size is not None:
                try:
                    batch_size = int(batch_size)
                except (ValueError, TypeError):
                    batch_size = None
        else:
            job_title = (request.form.get("jobTitle") or "").strip()
            company = (request.form.get("company") or "").strip()
            location = (request.form.get("location") or "").strip()
            if 'resume' not in request.files:
                return jsonify({'error': 'Resume PDF file is required for Pro tier'}), 400
            resume_file = request.files['resume']
            if resume_file.filename == '' or not resume_file.filename.lower().endswith('.pdf'):
                return jsonify({'error': 'Valid PDF resume file is required'}), 400
            resume_text = extract_text_from_pdf(resume_file)
            if not resume_text:
                return jsonify({'error': 'Could not extract text from PDF'}), 400
            try:
                user_profile_raw = request.form.get("userProfile")
                user_profile = json.loads(user_profile_raw) if user_profile_raw else None
            except:
                user_profile = None
            try:
                career_interests_raw = request.form.get("careerInterests")
                career_interests = json.loads(career_interests_raw) if career_interests_raw else []
            except:
                career_interests = []
            college_alumni = (request.form.get("collegeAlumni") or "").strip()
            batch_size = request.form.get("batchSize")
            if batch_size is not None:
                try:
                    batch_size = int(batch_size)
                except (ValueError, TypeError):
                    batch_size = None
            else:
                batch_size = None
        
        if not job_title or not location:
            missing = []
            if not job_title: missing.append('Job Title')
            if not location: missing.append('Location')
            return jsonify({'error': f"Missing required fields: {', '.join(missing)}"}), 400
        
        print(f"New unified email system PRO search for {user_email}: {job_title} at {company} in {location}")
        if resume_text:
            print(f"Resume provided ({len(resume_text)} chars)")
        print(f"DEBUG - college_alumni received: {college_alumni!r}")
        print(f"DEBUG - batch_size received: {batch_size} (type: {type(batch_size)})")
        
        result = run_pro_tier_enhanced_final_with_text(
            job_title,
            company,
            location,
            resume_text,
            user_email=user_email,
            user_profile=user_profile,
            career_interests=career_interests,
            college_alumni=college_alumni,
            batch_size=batch_size
        )
        
        if result.get("error"):
            error_type = result.get("error")
            if error_type == "gmail_token_expired":
                return jsonify({
                    "error": error_type,
                    "message": result.get("message"),
                    "require_reauth": True,
                    "contacts": result.get("contacts", [])
                }), 401  # 401 = Unauthorized (need to re-auth)
            return jsonify({"error": result["error"]}), 500
        
        response_data = {
            "contacts": result["contacts"],
            "successful_drafts": result.get("successful_drafts", 0),
            "total_contacts": len(result["contacts"]),
            "tier": "pro",
            "user_email": user_email,
        }
        return jsonify(response_data)
        
    except Exception as e:
        print(f"Pro endpoint error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@runs_bp.route('/pro-run-csv', methods=['POST'])
@require_firebase_auth
def pro_run_csv():
    """Pro tier CSV download endpoint"""
    try:
        user_email = request.firebase_user.get('email')
        
        if request.is_json:
            data = request.json or {}
            job_title = data.get('jobTitle', '').strip()
            company = data.get('company', '').strip()
            location = data.get('location', '').strip()
            resume_text = data.get('resumeText', '')
            if not resume_text:
                return jsonify({'error': 'Resume text is required'}), 400
        else:
            job_title = (request.form.get('jobTitle') or '').strip()
            company = (request.form.get('company') or '').strip()
            location = (request.form.get('location') or '').strip()
            if 'resume' not in request.files:
                return jsonify({'error': 'Resume PDF file is required'}), 400
            resume_file = request.files['resume']
            if resume_file.filename == '' or not resume_file.filename.lower().endswith('.pdf'):
                return jsonify({'error': 'Valid PDF resume file is required'}), 400
            resume_text = extract_text_from_pdf(resume_file)
            if not resume_text:
                return jsonify({'error': 'Could not extract text from PDF'}), 400
        
        result = run_pro_tier_enhanced_final_with_text(
            job_title, company, location, resume_text, user_email=user_email
        )
        
        if result.get('error'):
            return jsonify({'error': result['error']}), 500
        
        # Generate CSV
        output = StringIO()
        writer = csv.DictWriter(output, fieldnames=[
            'FirstName', 'LastName', 'Email', 'LinkedIn', 'Title', 'Company',
            'City', 'State', 'College', 'Phone', 'PersonalEmail', 'WorkEmail'
        ])
        writer.writeheader()
        for contact in result.get('contacts', []):
            writer.writerow({
                'FirstName': contact.get('FirstName', ''),
                'LastName': contact.get('LastName', ''),
                'Email': contact.get('Email', ''),
                'LinkedIn': contact.get('LinkedIn', ''),
                'Title': contact.get('Title', ''),
                'Company': contact.get('Company', ''),
                'City': contact.get('City', ''),
                'State': contact.get('State', ''),
                'College': contact.get('College', ''),
                'Phone': contact.get('Phone', ''),
                'PersonalEmail': contact.get('PersonalEmail', ''),
                'WorkEmail': contact.get('WorkEmail', '')
            })
        
        output.seek(0)
        return send_file(
            output,
            mimetype='text/csv',
            as_attachment=True,
            download_name=f'contacts_{job_title}_{company}.csv'
        )
        
    except Exception as e:
        print(f"Pro CSV endpoint error: {e}")
        return jsonify({'error': str(e)}), 500


@runs_bp.route('/basic-run', methods=['POST'])
def basic_run_redirect():
    """Redirect basic-run to free-run for backward compatibility"""
    print("Redirecting /api/basic-run to /api/free-run")
    return free_run()


@runs_bp.route('/advanced-run', methods=['POST'])
def advanced_run_redirect():
    """Redirect advanced-run to free-run (advanced tier removed)"""
    print("Redirecting /api/advanced-run to /api/free-run (advanced tier removed)")
    return free_run()
