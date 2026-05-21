"""
Run routes - prompt-based contact search endpoint
"""
import json
import time
import traceback
import threading
from datetime import datetime
from typing import Dict, Tuple, Optional
from app.services.pdl_client import get_contact_identity, search_contacts_from_prompt
from app.services.prompt_parser import parse_search_prompt_structured
from flask import Blueprint, request, jsonify

from app.extensions import require_firebase_auth, get_db
from app.services.feature_flags import PDL_OUTAGE_ACTIVE
from app.services.reply_generation import batch_generate_emails, PURPOSES_INCLUDE_RESUME, email_body_mentions_resume, regenerate_with_feedback
from app.services.gmail_client import _load_user_gmail_creds, download_resume_from_url, clear_user_gmail_integration
from app.services.interview_prep.resume_parser import extract_text_from_pdf_bytes
from app.routes.gmail_oauth import build_gmail_oauth_url_for_user
from app.services.auth import check_and_reset_credits, deduct_credits_atomic
from app.config import TIER_CONFIGS
from app.utils.exceptions import OfferloopException, InsufficientCreditsError, ExternalAPIError
from app.utils.warmth_scoring import score_contacts_for_email, score_and_sort_contacts, build_briefing_line
from app.utils.email_quality import check_email_quality, has_specificity_signal
from email_templates import get_template_instructions

# =============================================================================
# EMAIL TEMPLATE RESOLUTION (per-request override → user default → none)
# =============================================================================

def _resolve_email_template(email_template_override, user_id, db, user_data=None):
    """
    Resolve email template: request body override → user's saved default in Firestore → no injection.
    Returns (template_instructions: str, purpose: str|None, subject_line: str|None, signoff_config: dict).
    signoff_config = {"signoffPhrase": str, "signatureBlock": str}; defaults to "Best," and "".
    """
    purpose = None
    style_preset = None
    custom_instructions = ""
    subject_line = None
    signoff_phrase = None
    signature_block = None
    if email_template_override and isinstance(email_template_override, dict):
        purpose = email_template_override.get("purpose")
        style_preset = email_template_override.get("stylePreset")
        custom_instructions = (email_template_override.get("customInstructions") or "").strip()[:4000]
        subject_line = (email_template_override.get("subject") or "").strip() or None
        if "signoffPhrase" in email_template_override:
            signoff_phrase = (email_template_override.get("signoffPhrase") or "").strip()[:50] or "Best,"
        if "signatureBlock" in email_template_override:
            signature_block = (email_template_override.get("signatureBlock") or "").strip()[:500]
    # Fill gaps from user data (reuse already-loaded doc, or fetch if not provided)
    fs_data = user_data
    if not fs_data and user_id and db:
        try:
            user_doc = db.collection("users").document(user_id).get()
            if user_doc.exists:
                fs_data = user_doc.to_dict() or {}
        except Exception:
            pass
    if fs_data:
        t = fs_data.get("emailTemplate") or {}
        if purpose is None:
            purpose = t.get("purpose")
        if style_preset is None:
            style_preset = t.get("stylePreset")
        if not custom_instructions:
            custom_instructions = (t.get("customInstructions") or "").strip()[:4000]
        if subject_line is None:
            subject_line = (t.get("subject") or "").strip() or None
        if signoff_phrase is None:
            signoff_phrase = (t.get("signoffPhrase") or "").strip() or "Best,"
        if signature_block is None:
            signature_block = (t.get("signatureBlock") or "").strip()[:500]
    if signoff_phrase is None:
        signoff_phrase = "Best,"
    if signature_block is None:
        signature_block = ""
    signoff_config = {"signoffPhrase": signoff_phrase, "signatureBlock": signature_block}
    instructions = get_template_instructions(purpose=purpose, style_preset=style_preset, custom_instructions=custom_instructions)
    print(f"[EmailTemplate] Resolved purpose={purpose!r}, style_preset={style_preset!r}, custom_len={len(custom_instructions)}, subject={subject_line!r}, signoff={signoff_phrase!r}, instructions_len={len(instructions)}")
    if instructions:
        print(f"[EmailTemplate] Instructions preview: {instructions[:300]}...")
    return instructions, purpose, subject_line, signoff_config


def _contact_already_exists(contact, existing_emails_set, existing_name_company_set, existing_linkedins_set=None):
    """Check if a contact already exists in the user's saved contacts."""
    email = (contact.get("Email") or contact.get("WorkEmail") or contact.get("PersonalEmail") or contact.get("email") or "").strip().lower()
    if email and email in existing_emails_set:
        return True
    if existing_linkedins_set:
        linkedin = (contact.get("LinkedIn") or contact.get("linkedinUrl") or "").strip()
        if linkedin and linkedin in existing_linkedins_set:
            return True
    fn = (contact.get("FirstName") or contact.get("firstName") or "").strip().lower()
    ln = (contact.get("LastName") or contact.get("lastName") or "").strip().lower()
    co = (contact.get("Company") or contact.get("company") or "").strip().lower()
    if fn and ln and co and f"{fn}_{ln}_{co}" in existing_name_company_set:
        return True
    return False


# =============================================================================
# EXCLUSION LIST CACHING (1-hour TTL for faster contact searches)
# =============================================================================
#
# Cached value is a dict of lookup sets used for dedup:
#   {
#     "identity_set": set[str],       # get_contact_identity() keys for PDL-side dedup
#     "email_set": set[str],          # lowercased email addresses
#     "linkedin_set": set[str],       # linkedin URLs (raw)
#     "name_company_set": set[str],   # "first_last_company" lowercased
#   }
# Populated once per request from a single Firestore stream and reused for
# both pre-generation dedup and the save loop.

_exclusion_list_cache: Dict[str, Tuple[dict, float]] = {}
_exclusion_cache_lock = threading.Lock()
EXCLUSION_CACHE_TTL = 3600  # 1 hour in seconds

def _get_cached_exclusion_list(user_id: str) -> Optional[dict]:
    """Get cached exclusion lookup dict if not expired."""
    with _exclusion_cache_lock:
        if user_id in _exclusion_list_cache:
            exclusion_data, timestamp = _exclusion_list_cache[user_id]
            if time.time() - timestamp < EXCLUSION_CACHE_TTL:
                print(f"[ContactSearch] Using cached exclusion list ({len(exclusion_data.get('identity_set', set()))} contacts, age: {time.time() - timestamp:.1f}s)")
                return exclusion_data
            else:
                # Cache expired, remove it
                del _exclusion_list_cache[user_id]
                print(f"[ContactSearch] Exclusion list cache expired")
    return None

def _set_cached_exclusion_list(user_id: str, exclusion_data: dict):
    """Cache exclusion lookup dict with current timestamp."""
    with _exclusion_cache_lock:
        _exclusion_list_cache[user_id] = (exclusion_data, time.time())
        print(f"[ContactSearch] Cached exclusion list ({len(exclusion_data.get('identity_set', set()))} contacts)")

def _invalidate_exclusion_cache(user_id: str):
    """Invalidate exclusion list cache (call when contacts are added/removed)."""
    with _exclusion_cache_lock:
        if user_id in _exclusion_list_cache:
            del _exclusion_list_cache[user_id]
            print(f"[ContactSearch] Invalidated exclusion list cache")


def _build_exclusion_data_from_firestore(db, user_id: str) -> dict:
    """Stream the user's contacts once and build all four dedup lookup sets."""
    identity_set = set()
    email_set = set()
    linkedin_set = set()
    name_company_set = set()
    contacts_ref = db.collection("users").document(user_id).collection("contacts")
    for doc in contacts_ref.select(
        ["firstName", "lastName", "email", "linkedinUrl", "company"]
    ).stream():
        cd = doc.to_dict() or {}
        first = (cd.get("firstName") or "").strip()
        last = (cd.get("lastName") or "").strip()
        company = (cd.get("company") or "").strip()
        email = (cd.get("email") or "").strip().lower()
        linkedin = (cd.get("linkedinUrl") or "").strip()
        standardized = {
            "FirstName": first,
            "LastName": last,
            "Email": email,
            "LinkedIn": linkedin,
            "Company": company,
        }
        identity_set.add(get_contact_identity(standardized))
        if email:
            email_set.add(email)
        if linkedin:
            linkedin_set.add(linkedin)
        fn = first.lower()
        ln = last.lower()
        co = company.lower()
        if fn and ln and co:
            name_company_set.add(f"{fn}_{ln}_{co}")
    return {
        "identity_set": identity_set,
        "email_set": email_set,
        "linkedin_set": linkedin_set,
        "name_company_set": name_company_set,
    }

runs_bp = Blueprint('runs', __name__, url_prefix='/api')


@runs_bp.route("/prompt-search", methods=["POST"])
@require_firebase_auth
def prompt_search():
    """
    Prompt-based contact search for all tiers. Parses natural language prompt,
    runs PDL search, then same email/draft/save pipeline as free-run.
    Request: { "prompt": "...", "batchSize": 5 }
    Response: same shape as free-run plus parsed_query.
    """
    if PDL_OUTAGE_ACTIVE:
        return jsonify({"error": "service_unavailable", "message": "Contact search temporarily unavailable.", "code": "PDL_OUTAGE"}), 503

    try:
        user_email = request.firebase_user.get("email")
        user_id = request.firebase_user["uid"]
        db = get_db()

        data = request.get_json(silent=True) or {}
        prompt = (data.get("prompt") or "").strip()
        batch_size = data.get("batchSize")

        # Validate prompt length
        if not prompt:
            return jsonify({"error": "Prompt is required"}), 400
        if len(prompt) < 3:
            return jsonify({"error": "Prompt must be at least 3 characters"}), 400
        if len(prompt) > 500:
            return jsonify({"error": "Prompt must be at most 500 characters"}), 400

        # Resolve tier and max_contacts
        user_tier = "free"
        credits_available = TIER_CONFIGS["free"]["credits"]
        user_data = None
        exclusion_data = None
        seen_contact_set = set()
        if db and user_id:
            try:
                user_ref = db.collection("users").document(user_id)
                user_doc = user_ref.get()
                if user_doc.exists:
                    user_data = user_doc.to_dict()
                    credits_available = check_and_reset_credits(user_ref, user_data)
                    user_tier = user_data.get("subscriptionTier", user_data.get("tier", "free"))
                    if user_tier not in TIER_CONFIGS:
                        user_tier = "free"
                    exclusion_data = _get_cached_exclusion_list(user_id)
                    if exclusion_data is None:
                        exclusion_data = _build_exclusion_data_from_firestore(db, user_id)
                        _set_cached_exclusion_list(user_id, exclusion_data)
                    seen_contact_set = exclusion_data["identity_set"]
            except Exception as e:
                # Fail closed: if we can't load user data, don't allow search
                print(f"⚠️ Failed to load user profile for {user_id}: {e}")
                return jsonify({"error": "Could not load user profile. Please try again."}), 500

        # Credit check outside try/except - always enforced
        if credits_available < 15:
            return jsonify({
                "error": "Insufficient credits",
                "credits_needed": 15,
                "current_credits": credits_available,
            }), 400

        tier_max = TIER_CONFIGS[user_tier]["max_contacts"]
        try:
            batch_size = int(batch_size) if batch_size is not None else None
        except (TypeError, ValueError):
            batch_size = None
        max_contacts = batch_size if batch_size and 1 <= batch_size <= tier_max else tier_max

        # Parse prompt
        parsed = parse_search_prompt_structured(prompt)
        if parsed.get("error"):
            return jsonify({
                "error": parsed.get("error", "Failed to parse prompt"),
                "parsed_query": {k: parsed.get(k) for k in ("companies", "title_variations", "locations") if k in parsed},
            }), 400
        if parsed.get("confidence") == "low":
            return jsonify({
                "error": "Your search was too vague. Please add more specifics (e.g. job title, company, or location).",
                "parsed_query": {k: parsed.get(k) for k in ("companies", "title_variations", "locations") if k in parsed},
            }), 400

        # Request extra from PDL to account for dedup filtering (already-contacted users)
        # Use seen_contact_set (already loaded for exclusion) instead of re-streaming Firestore
        existing_contact_count = len(seen_contact_set) if seen_contact_set else 0
        pdl_fetch_count = max_contacts + existing_contact_count + 2

        # Fetch contacts
        contacts, retry_level_used, already_saved_contacts, adjacency_metadata = search_contacts_from_prompt(parsed, pdl_fetch_count, exclude_keys=seen_contact_set, user_profile=user_data)
        search_broadened = retry_level_used >= 1  # Any broadening at all

        # Surface which dimensions were dropped at the rung that succeeded so the
        # frontend can render an honest "we expanded by..." banner.
        broadened_dimensions: list[str] = []
        if retry_level_used >= 1:
            broadened_dimensions.append("title")
        if retry_level_used >= 2:
            broadened_dimensions.append("industry")
        if retry_level_used >= 3:
            broadened_dimensions.append("location")
        if retry_level_used >= 4:
            broadened_dimensions.append("company")
        if retry_level_used >= 5:
            broadened_dimensions = ["title", "industry", "location", "company"]

        def _build_saved_contact_cards(raw_already_saved):
            cards = []
            for c in (raw_already_saved or []):
                cards.append({
                    "FirstName": c.get("FirstName") or c.get("firstName") or "",
                    "LastName": c.get("LastName") or c.get("lastName") or "",
                    "Title": c.get("Title") or c.get("JobTitle") or "",
                    "Company": c.get("Company") or c.get("company") or "",
                    "LinkedIn": c.get("LinkedIn") or c.get("linkedinUrl") or "",
                    "College": c.get("College") or c.get("college") or "",
                    "City": c.get("City") or "",
                    "State": c.get("State") or "",
                    "alreadySaved": True,
                })
            return cards

        parsed_query_payload = {
            "companies": parsed.get("companies", []),
            "title_variations": parsed.get("title_variations", []),
            "locations": parsed.get("locations", []),
            "company_context": parsed.get("company_context", ""),
        }

        if not contacts and not already_saved_contacts:
            response_data = {
                "contacts": [],
                "already_saved_contacts": [],
                "successful_drafts": 0,
                "total_contacts": 0,
                "tier": user_tier,
                "user_email": user_email,
                "parsed_query": parsed_query_payload,
            }
            if adjacency_metadata:
                response_data["adjacency_metadata"] = adjacency_metadata
                response_data["message"] = adjacency_metadata.get("message", "No contacts found. Try broadening your search.")
                # Add cross-tab suggestion for hiring managers if company was specified
                companies = parsed.get("companies") or []
                if companies:
                    company_name = companies[0].get("name", "") if isinstance(companies[0], dict) else str(companies[0])
                    if company_name:
                        response_data["suggestions"] = [{
                            "type": "switch_tab",
                            "label": f"Find recruiters at {company_name}",
                            "tab": "hiring-managers",
                            "prefill": {"company": company_name}
                        }]
            else:
                response_data["message"] = "No contacts found. Try broadening your search."
            return jsonify(response_data)

        # Pre-generation dedup: filter out contacts already in Firestore (avoid generating emails for them)
        # Reuse the exclusion data loaded during auth (no second Firestore stream).
        # Copy the sets because the save loop mutates them to prevent intra-batch duplicates,
        # and we don't want those mutations to leak into the cached exclusion data.
        if exclusion_data is not None:
            existing_emails_set = set(exclusion_data["email_set"])
            existing_linkedins_set = set(exclusion_data["linkedin_set"])
            existing_name_company_set = set(exclusion_data["name_company_set"])
            print(f"[ContactSearch] Reusing exclusion data for pre-gen dedup (saved Firestore re-stream)", flush=True)
        else:
            existing_emails_set = set()
            existing_linkedins_set = set()
            existing_name_company_set = set()

        if db and user_id:
            try:
                before_count = len(contacts)
                newly_skipped = [
                    c for c in contacts
                    if _contact_already_exists(c, existing_emails_set, existing_name_company_set, existing_linkedins_set)
                ]
                contacts = [
                    c for c in contacts
                    if not _contact_already_exists(c, existing_emails_set, existing_name_company_set, existing_linkedins_set)
                ]
                skipped_pre = before_count - len(contacts)
                if skipped_pre:
                    print(f"🔄 Pre-generation dedup: filtered out {skipped_pre} already-contacted people", flush=True)
                    # Surface these as "already saved" so the UI can show them as existing cards.
                    already_saved_contacts = list(already_saved_contacts or []) + newly_skipped

                if not contacts:
                    saved_cards = _build_saved_contact_cards(already_saved_contacts)
                    if saved_cards:
                        message = (
                            f"All {len(saved_cards)} matching contact(s) are already in your tracker. "
                            "Open them in your network, or broaden your search to find new people."
                        )
                    else:
                        message = "No contacts found. Try broadening your search."
                    return jsonify({
                        "contacts": [],
                        "already_saved_contacts": saved_cards,
                        "successful_drafts": 0,
                        "total_contacts": len(saved_cards),
                        "tier": user_tier,
                        "user_email": user_email,
                        "parsed_query": parsed_query_payload,
                        "message": message,
                    }), 200
            except Exception as e:
                print(f"⚠️ Pre-generation dedup failed, continuing: {e}", flush=True)

        # Trim to the originally requested count (whether or not dedup ran)
        contacts = contacts[:max_contacts]

        # Enrich contacts with real-time web data (Perplexity)
        enrichment_data = {}
        try:
            from app.services.perplexity_client import batch_enrich_contacts
            enrichment_data = batch_enrich_contacts(contacts)
            for idx, contact in enumerate(contacts):
                enrich = enrichment_data.get(idx, {})
                if enrich.get("talking_points"):
                    contact["enrichment_talking_points"] = enrich["talking_points"]
                if enrich.get("recent_activity"):
                    contact["enrichment_recent_activity"] = enrich["recent_activity"]
        except Exception:
            print("⚠️ Contact enrichment failed, continuing without", flush=True)

        # Same pipeline as free-run: template, emails, drafts, deduct, save
        # A4: Build rich user profile from root doc + professionalInfo subcollection
        user_profile = data.get("userProfile") or (user_data or {}).get("userProfile")
        if not user_profile and db and user_id:
            try:
                prof_ref = db.collection("users").document(user_id).collection("professionalInfo").document("info")
                prof_doc = prof_ref.get()
                if prof_doc.exists:
                    pi = prof_doc.to_dict()
                    user_profile = {
                        "name": f"{pi.get('firstName', '')} {pi.get('lastName', '')}".strip() or user_email or "",
                        "email": user_email,
                        "university": pi.get("university", ""),
                        "major": pi.get("fieldOfStudy", ""),
                        "year": pi.get("graduationYear", ""),
                        "graduationYear": pi.get("graduationYear", ""),
                        "degree": pi.get("currentDegree", ""),
                    }
            except Exception:
                pass
        if not user_profile:
            user_profile = {"name": "", "email": user_email or ""}
        # A4: Enrich user_profile with onboarding data from root user document
        if user_data:
            for key in ("resumeParsed", "academics", "goals", "careerTrack",
                        "dreamCompanies", "hometown", "location", "pastCompanies"):
                if key in user_data and key not in user_profile:
                    user_profile[key] = user_data[key]
        career_interests = data.get("careerInterests") or (user_data or {}).get("careerInterests", [])
        template_instructions, email_template_purpose, template_subject_line, signoff_config = _resolve_email_template(data.get("emailTemplate"), user_id, db, user_data=user_data)
        # Get resume filename for email body reference
        user_resume_filename = (user_data or {}).get("resumeFileName")

        auth_display_name = (getattr(request, "firebase_user", None) or {}).get("name") or ""

        # Download resume PDF and extract text for email personalization
        resume_url = (user_data or {}).get("resumeUrl") or (user_data or {}).get("resumeURL")
        resume_text = None
        resume_content = None
        resume_filename = None
        if resume_url:
            try:
                print(f"[Runs] Downloading resume for text extraction: {resume_url[:80]}...")
                _content, _fname = download_resume_from_url(resume_url)
                if _content:
                    resume_content = _content
                    resume_filename = _fname
                    resume_text = extract_text_from_pdf_bytes(_content)
                    if resume_text and len(resume_text.strip()) > 50:
                        print(f"[Runs] Extracted {len(resume_text)} chars from resume PDF")
                    else:
                        print(f"[Runs] Resume text extraction too short ({len(resume_text or '')} chars)")
                        resume_text = None
                else:
                    print("[Runs] Resume download returned no content")
            except Exception as e:
                print(f"[Runs] Could not download/extract resume: {e}")

        # 1A: Score, sort by warmth (dream companies first), and attach fields
        try:
            contacts = score_and_sort_contacts(user_profile, contacts, search_context=parsed_query_payload)
            warmth_data = {
                i: {"tier": c.get("warmth_tier", ""), "score": c.get("warmth_score", 0), "label": c.get("warmth_label", ""), "signals": c.get("warmth_signals", [])}
                for i, c in enumerate(contacts)
            }
        except Exception:
            warmth_data = score_contacts_for_email(user_profile, contacts, search_context=parsed_query_payload)

        # 1B: Attach briefing lines (deterministic, no LLM)
        for contact in contacts:
            signals = contact.get("warmth_signals", [])
            briefing = build_briefing_line(contact, signals)
            if briefing:
                contact["briefing"] = briefing

        # Generate emails with resume text
        try:
            email_results = batch_generate_emails(
                contacts=contacts,
                resume_text=resume_text,
                user_profile=user_profile,
                career_interests=career_interests,
                fit_context=None,
                pre_parsed_user_info=(user_data or {}).get("resumeParsed"),
                template_instructions=template_instructions,
                email_template_purpose=email_template_purpose,
                resume_filename=user_resume_filename,
                subject_line=template_subject_line,
                signoff_config=signoff_config,
                auth_display_name=auth_display_name,
                warmth_data=warmth_data,
                uid=user_id,
                enrichment_data=enrichment_data,
            )
        except Exception as e:
            print(f"[Runs] Email generation failed (prompt-search): {e}")
            email_results = {}

        contacts_with_emails = []
        for i, contact in enumerate(contacts):
            key = str(i)
            email_result = email_results.get(i) or email_results.get(key) or email_results.get(f"{i}")
            if email_result and isinstance(email_result, dict):
                subject = email_result.get("subject", "")
                body = email_result.get("plain_body") or email_result.get("body", "")
                if subject and body:
                    contact["emailSubject"] = subject
                    contact["emailBody"] = body
                    # Attach personalization metadata (label, commonality_type, anchor)
                    if email_result.get("personalization"):
                        contact["personalization"] = email_result["personalization"]
                    attach_resume = (email_template_purpose in PURPOSES_INCLUDE_RESUME) or email_body_mentions_resume(body)
                    contacts_with_emails.append({
                        "index": i,
                        "contact": contact,
                        "email_subject": subject,
                        "email_body": body,
                        "attach_resume": attach_resume,
                    })

        # 1E: Silent email quality gate - check + parallel regen for failures
        try:
            from concurrent.futures import ThreadPoolExecutor, as_completed

            _qg_user_university = (user_profile or {}).get("university", "")

            def _quality_check_and_regen(item):
                """Check one email; regen if needed. Returns (index, was_regenerated)."""
                contact = item["contact"]
                subject = item["email_subject"]
                body = item["email_body"]
                result = check_email_quality(subject, body, contact, _qg_user_university)
                if result["passed"]:
                    return (item["index"], False)
                # Attempt regeneration
                original = {"subject": subject, "body": body}
                improved = regenerate_with_feedback(contact, user_profile, original, result["failures"])
                # Compare: pick the one that passes, or the one with fewer failures
                improved_result = check_email_quality(improved["subject"], improved["body"], contact, _qg_user_university)
                if improved_result["passed"] or len(improved_result["failures"]) < len(result["failures"]):
                    contact["emailSubject"] = improved["subject"]
                    contact["emailBody"] = improved["body"]
                    item["email_subject"] = improved["subject"]
                    item["email_body"] = improved["body"]
                contact["_qualityRegenerated"] = True
                return (item["index"], True)

            regen_count = 0
            if contacts_with_emails:
                with ThreadPoolExecutor(max_workers=5) as executor:
                    futures = {executor.submit(_quality_check_and_regen, item): item for item in contacts_with_emails}
                    for future in as_completed(futures):
                        try:
                            _, was_regen = future.result()
                            if was_regen:
                                regen_count += 1
                        except Exception:
                            pass

            if regen_count > 0:
                print(f"[Runs] Quality gate: regenerated {regen_count}/{len(contacts_with_emails)} emails")

            # Log quality gate results to Firestore
            if db and user_id and contacts_with_emails:
                try:
                    quality_ref = db.collection("email_quality_logs")
                    for item in contacts_with_emails:
                        contact = item["contact"]
                        qr = check_email_quality(item["email_subject"], item["email_body"], contact, _qg_user_university)
                        quality_ref.add({
                            "userId": user_id,
                            "contactId": contact.get("pdlId", ""),
                            "passed": qr["passed"],
                            "failures": qr["failures"],
                            "regenerated": bool(contact.get("_qualityRegenerated")),
                            "timestamp": datetime.utcnow().isoformat() + "Z",
                        })
                except Exception as qlog_err:
                    print(f"[Runs] Quality log write failed: {qlog_err}")
        except Exception as qgate_err:
            print(f"[Runs] Quality gate error (non-blocking): {qgate_err}")

        successful_drafts = 0
        user_info = {"name": user_profile.get("name", ""), "email": user_profile.get("email", ""), "phone": "", "linkedin": ""}
        try:
            creds = _load_user_gmail_creds(user_id) if user_id else None
            if creds and contacts_with_emails:
                from app.services.gmail_client import create_drafts_parallel
                draft_results = create_drafts_parallel(
                    contacts_with_emails,
                    resume_bytes=resume_content,
                    resume_filename=resume_filename,
                    user_info=user_info,
                    user_id=user_id,
                    tier=user_tier,
                    user_email=user_email,
                    resume_url=resume_url,
                )
                for item, draft_result in zip(contacts_with_emails, draft_results):
                    contact = item["contact"]
                    draft_id = draft_result.get("draft_id", "") if isinstance(draft_result, dict) else (draft_result or "")
                    if draft_id and not str(draft_id).startswith("mock_"):
                        successful_drafts += 1
                        contact["gmailDraftId"] = draft_id
                        if isinstance(draft_result, dict):
                            if draft_result.get("draft_url"):
                                contact["gmailDraftUrl"] = draft_result["draft_url"]
                            if draft_result.get("recipient_email"):
                                contact["_draftRecipientEmail"] = draft_result["recipient_email"]
        except Exception as gmail_error:
            err_str = str(gmail_error).lower()
            if "invalid_grant" in err_str or "token has been expired or revoked" in err_str:
                # Still deduct credits and save contacts even though drafts failed
                if db and user_id:
                    try:
                        deduct_credits_atomic(user_id, 15 * len(contacts), "prompt_search")
                    except Exception:
                        pass
                return jsonify({
                    "error": "gmail_token_expired",
                    "message": "Your Gmail connection has expired. Please reconnect your Gmail account.",
                    "require_reauth": True,
                    "contacts": contacts,
                }), 401
            print(f"[Runs] Gmail draft error (prompt-search): {gmail_error}")

        if not (db and user_id):
            print(f"[Runs] Prompt-search: skipping Firestore save")
        credits_used = 0
        credits_remaining = None
        if db and user_id:
            try:
                credits_amount = 15 * len(contacts)
                success, remaining = deduct_credits_atomic(user_id, credits_amount, "prompt_search")
                if success:
                    credits_used = credits_amount
                    credits_remaining = remaining
                else:
                    print(f"⚠️ Credit deduction failed for {user_id}: insufficient credits (have {remaining}, need {credits_amount})")
                    credits_remaining = remaining
            except Exception as credit_error:
                print(f"⚠️ Credit deduction error for {user_id}: {credit_error}")
                traceback.print_exc()
            try:
                print(f"💾 Saving {len(contacts)} contacts to Firestore (prompt-search)...")
                contacts_ref = db.collection("users").document(user_id).collection("contacts")
                # Reuse pre-gen dedup sets instead of re-streaming Firestore
                today = datetime.now().strftime("%m/%d/%Y")
                saved_count = 0
                skipped_count = 0
                for contact in contacts:
                    if _contact_already_exists(contact, existing_emails_set, existing_name_company_set, existing_linkedins_set):
                        skipped_count += 1
                        continue
                    first_name = (contact.get("FirstName") or contact.get("firstName") or "").strip()
                    last_name = (contact.get("LastName") or contact.get("lastName") or "").strip()
                    email = (contact.get("Email") or contact.get("WorkEmail") or contact.get("PersonalEmail") or contact.get("email") or "").strip().lower()
                    linkedin = (contact.get("LinkedIn") or contact.get("linkedinUrl") or "").strip()
                    company = (contact.get("Company") or contact.get("company") or "").strip()
                    contact_doc = {
                        "firstName": first_name,
                        "lastName": last_name,
                        "email": contact.get("Email") or contact.get("WorkEmail") or contact.get("PersonalEmail") or "",
                        "linkedinUrl": linkedin,
                        "company": company,
                        "jobTitle": contact.get("Title") or contact.get("jobTitle") or "",
                        "college": contact.get("College") or contact.get("college") or "",
                        "location": contact.get("location") or "",
                        "city": contact.get("City") or "",
                        "state": contact.get("State") or "",
                        "firstContactDate": today,
                        "status": "Not Contacted",
                        "lastContactDate": today,
                        "userId": user_id,
                        "createdAt": datetime.utcnow().isoformat() + "Z",  # TODO: deprecated in Python 3.12
                        # pdlId persists the PDL stable identifier for queue dedup.
                        "pdlId": contact.get("pdlId") or "",
                    }
                    if contact.get("emailSubject"):
                        contact_doc["emailSubject"] = contact["emailSubject"]
                    if contact.get("emailBody"):
                        contact_doc["emailBody"] = contact["emailBody"]
                    if contact.get("gmailDraftId"):
                        contact_doc["gmailDraftId"] = contact["gmailDraftId"]
                    if contact.get("gmailDraftUrl"):
                        contact_doc["gmailDraftUrl"] = contact["gmailDraftUrl"]
                    if contact.get("warmth_score") is not None:
                        contact_doc["warmthScore"] = contact["warmth_score"]
                        contact_doc["warmthTier"] = contact.get("warmth_tier", "")
                        contact_doc["warmthLabel"] = contact.get("warmth_label", "")
                        contact_doc["warmthSignals"] = contact.get("warmth_signals", [])
                    if contact.get("personalization"):
                        contact_doc["personalizationLabel"] = contact["personalization"].get("label", "")
                        contact_doc["personalizationType"] = contact["personalization"].get("commonality_type", "")
                    if contact.get("_qualityRegenerated"):
                        contact_doc["qualityRegenerated"] = True
                    if contact.get("briefing"):
                        contact_doc["briefing"] = contact["briefing"]
                    if contact.get("enrichment_talking_points"):
                        contact_doc["enrichmentTalkingPoints"] = contact["enrichment_talking_points"][:5]
                    if contact.get("enrichment_recent_activity"):
                        contact_doc["enrichmentRecentActivity"] = contact["enrichment_recent_activity"]
                    if contact.get("gmailDraftId") or contact.get("gmailDraftUrl"):
                        contact_doc["pipelineStage"] = "draft_created"
                    now_iso = datetime.utcnow().isoformat() + "Z"  # TODO: deprecated in Python 3.12
                    contact_doc["inOutbox"] = True
                    contact_doc["draftToEmail"] = contact.get("_draftRecipientEmail") or email
                    contact_doc["draftCreatedAt"] = now_iso
                    contact_doc["emailGeneratedAt"] = now_iso
                    contact_doc["draftStillExists"] = True
                    contact_doc["lastActivityAt"] = now_iso
                    contact_doc["hasUnreadReply"] = False
                    contact_doc["gmailMessageId"] = contact.get("gmailMessageId") or None
                    contacts_ref.add(contact_doc)
                    saved_count += 1
                    # Avoid duplicates within same batch
                    if email:
                        existing_emails_set.add(email)
                    if linkedin:
                        existing_linkedins_set.add(linkedin)
                    if first_name and last_name and company:
                        existing_name_company_set.add(f"{first_name}_{last_name}_{company}".lower().strip())
                print(f"✅ Prompt-search: saved {saved_count} new contacts to Firestore, skipped {skipped_count} duplicates")
                _invalidate_exclusion_cache(user_id)
            except Exception as save_error:
                print(f"⚠️ Error saving contacts (prompt-search): {save_error}")
                traceback.print_exc()

        # Metrics: log email_generated per contact with email (outside save block
        # so events fire even if Firestore save fails - emails were already generated)
        try:
            from app.utils.metrics_events import log_event
            for contact in contacts:
                if contact.get("emailSubject"):
                    body = contact.get("emailBody", "")
                    log_event(user_id, "email_generated", {
                        "contact_id": contact.get("pdlId") or "",
                        "email_length": len(body.split()),
                        "has_specificity_signal": has_specificity_signal(body, contact),
                        "quality_regenerated": bool(contact.get("_qualityRegenerated")),
                    })
        except Exception:
            pass

        # Build lightweight already-saved contact cards (no emails, no credits)
        saved_contact_cards = _build_saved_contact_cards(already_saved_contacts)

        response_data = {
            "contacts": contacts,
            "already_saved_contacts": saved_contact_cards,
            "successful_drafts": successful_drafts,
            "total_contacts": len(contacts),
            "tier": user_tier,
            "user_email": user_email,
            "credits_used": credits_used,
            "parsed_query": parsed_query_payload,
            "search_broadened": search_broadened,
            "retry_level_used": retry_level_used,
            "broadened_dimensions": broadened_dimensions,
        }
        if search_broadened:
            response_data["broadening_level"] = retry_level_used
        if adjacency_metadata and adjacency_metadata.get("drop_reasons"):
            response_data["adjacency_metadata"] = adjacency_metadata
        if credits_remaining is not None:
            response_data["credits_remaining"] = credits_remaining

        # Metrics: log search_performed
        try:
            from app.utils.metrics_events import log_event
            top_tier = ""
            if warmth_data:
                tiers = [v.get("tier", "") for v in warmth_data.values()]
                for t in ["warm", "neutral", "cold"]:
                    if t in tiers:
                        top_tier = t
                        break
            log_event(user_id, "search_performed", {
                "companies": parsed_query_payload.get("companies", []),
                "titles": parsed_query_payload.get("title_variations", [])[:5],
                "locations": parsed_query_payload.get("locations", []),
                "results_count": len(contacts),
                "top_warmth_tier": top_tier,
            })
        except Exception:
            pass

        # Recommendation events: log each shown contact with rank and features
        try:
            from app.utils.recommendation_events import log_recommendation_event
            for rank_idx, contact in enumerate(contacts):
                wd = warmth_data.get(rank_idx, {})
                log_recommendation_event(
                    "recommendation_shown",
                    user_id,
                    contact_id=contact.get("pdlId", ""),
                    contact_email=contact.get("Email") or contact.get("WorkEmail") or "",
                    rank=rank_idx,
                    score=wd.get("score"),
                    surface="find_search",
                    search_query=parsed_query_payload,
                    features_snapshot={
                        "warmth_tier": wd.get("tier", ""),
                        "warmth_score": wd.get("score", 0),
                        "warmth_signals": wd.get("signals", []),
                        "quality_regenerated": bool(contact.get("_qualityRegenerated")),
                    },
                )
        except Exception:
            pass

        return jsonify(response_data)
    except (OfferloopException, InsufficientCreditsError, ExternalAPIError):
        raise
    except Exception as e:
        print(f"Prompt-search error: {e}")
        traceback.print_exc()
        raise OfferloopException(f"Prompt search failed: {str(e)}", error_code="PROMPT_SEARCH_ERROR")
