"""
Email generation and drafting routes
"""
import os
import base64
import requests
from datetime import datetime
from flask import Blueprint, request, jsonify
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
import mimetypes
import re

from app.config import GMAIL_SCOPES
from ..extensions import require_firebase_auth
from app.services.reply_generation import batch_generate_emails
from app.services.gmail_client import get_gmail_service_for_user
from app.services.resume_parser import extract_text_from_pdf_bytes
from app.utils.url_validator import validate_fetch_url, UnsafeURLError
from app.utils.seniority import classify_seniority
from app.utils.warmth_scoring import score_contacts_for_email
from app.utils.users import get_outreach_email
from ..extensions import get_db
from email_templates import get_template_instructions


def _persist_warmth_on_send(db, uid, contact_email, warmth_info, job_title):
    """Write warmthTier, warmthScore, and seniorityBucket on the contact doc.

    Called after email generation so the Phase 2 aggregation scanner can
    bucket contacts by warmth and seniority. Idempotent (merge update).
    Must never block the email-send flow — all exceptions are swallowed.
    """
    try:
        email_clean = (contact_email or "").strip().lower()
        if not email_clean:
            return
        contacts_ref = db.collection("users").document(uid).collection("contacts")
        matches = list(contacts_ref.where("email", "==", email_clean).limit(1).stream())
        if not matches:
            return
        update = {
            "seniorityBucket": classify_seniority(job_title),
        }
        if warmth_info:
            update["warmthTier"] = warmth_info.get("tier", "unknown")
            update["warmthScore"] = warmth_info.get("score", 0)
        matches[0].reference.update(update)
    except Exception as exc:
        import logging
        logging.getLogger("emails").debug(
            "warmth persist failed for %s: %s", contact_email, exc
        )

emails_bp = Blueprint('emails', __name__, url_prefix='/api/emails')
def _infer_mime_type(filename_or_url: str, fallback=("application", "octet-stream")):
    # Try headers first if you already have them, else guess from extension
    guessed, _ = mimetypes.guess_type(filename_or_url)
    if guessed:
        main, sub = guessed.split("/", 1)
        return main, sub
    return fallback


def _normalize_drive_url(url: str) -> str:
    """
    Normalize Google Drive URLs to direct download format.
    Firebase Storage URLs are returned as-is.
    """
    if not url:
        return url
    
    # If it's a Firebase Storage URL, return as-is
    if 'firebasestorage.googleapis.com' in url:
        return url
    
    # Handle Google Drive URLs
    if 'drive.google.com' in url:
        # Extract file ID from various Drive URL formats
        
        # Format: https://drive.google.com/file/d/FILE_ID/view
        match = re.search(r'/file/d/([^/]+)', url)
        if match:
            file_id = match.group(1)
            return f'https://drive.google.com/uc?export=download&id={file_id}'
        
        # Format: https://drive.google.com/open?id=FILE_ID
        match = re.search(r'[?&]id=([^&]+)', url)
        if match:
            file_id = match.group(1)
            return f'https://drive.google.com/uc?export=download&id={file_id}'
    
    # Return original URL if no normalization needed
    return url


@emails_bp.post("/generate-and-draft")
@require_firebase_auth
def generate_and_draft():
    """Generate emails and create Gmail drafts"""
    db = get_db()
    uid = request.firebase_user["uid"]
    payload = request.get_json() or {}
    contacts = payload.get("contacts", [])
    resume_text = payload.get("resumeText", "")
    user_profile = payload.get("userProfile", {})
    career_interest = payload.get("careerInterests")
    fit_context = payload.get("fitContext")  # NEW: Job fit analysis context

    # If frontend didn't send resume text, download PDF from resume URL and extract
    print(f"[EmailGen] resume_text from payload: {repr(resume_text)[:100] if resume_text else 'None/empty'} "
          f"(len={len(resume_text) if resume_text else 0})")
    if not resume_text or len(resume_text.strip()) < 50:
        print("[EmailGen] resume_text missing or too short, attempting backfill from URL...")
        _resume_url = payload.get("resumeUrl")
        _url_source = "payload" if _resume_url else None
        if not _resume_url:
            _resume_url = user_profile.get("resumeUrl")
            _url_source = "userProfile" if _resume_url else None
        if not _resume_url:
            _user_doc = db.collection("users").document(uid).get()
            _user_data = _user_doc.to_dict() or {}
            _resume_url = _user_data.get("resumeUrl")
            _url_source = "firestore" if _resume_url else None
        print(f"[EmailGen] Resume URL resolved: {_resume_url[:100] if _resume_url else 'None'} "
              f"(source={_url_source})")
        if _resume_url:
            _resume_url = _normalize_drive_url(_resume_url)
            try:
                _resume_url = validate_fetch_url(_resume_url)
                _res = requests.get(_resume_url, timeout=15, headers={"User-Agent": "Offerloop/1.0"})
                _res.raise_for_status()
                _pdf_bytes = _res.content
                print(f"[EmailGen] Resume download: {_res.status_code}, {len(_pdf_bytes)} bytes, "
                      f"content-type={_res.headers.get('content-type', 'unknown')}")
                if len(_pdf_bytes) >= 1024 and b"<html" not in _pdf_bytes[:2048].lower():
                    resume_text = extract_text_from_pdf_bytes(_pdf_bytes)
                    print(f"[EmailGen] Text extraction result: {len(resume_text)} chars, "
                          f"preview={repr(resume_text[:120])}")
                else:
                    print(f"[EmailGen] Resume download unusable: size={len(_pdf_bytes)}, "
                          f"looks_like_html={b'<html' in _pdf_bytes[:2048].lower()}")
            except Exception as e:
                print(f"[EmailGen] Resume download/extraction failed: {e}")
        else:
            print("[EmailGen] No resume URL found in payload, userProfile, or Firestore")

    # Get Gmail service using user's OAuth credentials (falls back to shared account if not connected)
    user_email = request.firebase_user.get("email")
    gmail_service = get_gmail_service_for_user(user_email, user_id=uid)
    if not gmail_service:
        return jsonify({
            "error": "Gmail service unavailable",
            "message": "Please connect your Gmail account to create drafts. The shared Gmail account is not available."
        }), 500

    # ✅ FIX: Check if contacts already have emails to avoid duplicate generation
    # Filter out contacts that already have emailSubject and emailBody
    contacts_needing_emails = []
    contacts_with_emails = []
    for i, contact in enumerate(contacts):
        has_subject = contact.get('emailSubject') or contact.get('email_subject')
        has_body = contact.get('emailBody') or contact.get('email_body')
        if has_subject and has_body:
            contacts_with_emails.append((i, contact))
        else:
            contacts_needing_emails.append((i, contact))
    
    if contacts_with_emails:
        print(f"📧 Skipping email generation for {len(contacts_with_emails)} contacts that already have emails")
    
    # Load email template: prefer request body override, fall back to Firestore stored default
    user_doc = db.collection("users").document(uid).get()
    user_data = user_doc.to_dict() or {}
    # Prefer the user's .edu for the outreach identity (signature + mailto). This
    # flows into both this endpoint's signature builder and the LLM body via
    # batch_generate_emails(user_profile). Falls back to the primary email.
    _outreach_email = get_outreach_email(user_data)
    if _outreach_email:
        user_profile = {**(user_profile or {}), "email": _outreach_email}
    request_template = payload.get("emailTemplate") or {}
    stored_template = user_data.get("emailTemplate") or {}
    # Use request template if it has any meaningful values, otherwise use stored
    template = request_template if any(request_template.get(k) for k in ("purpose", "stylePreset", "customInstructions")) else stored_template
    purpose = template.get("purpose")
    style_preset = template.get("stylePreset")
    custom_instructions = (template.get("customInstructions") or "").strip()[:4000]
    template_instructions = get_template_instructions(purpose=purpose, style_preset=style_preset, custom_instructions=custom_instructions)
    signoff_phrase = (template.get("signoffPhrase") or stored_template.get("signoffPhrase") or "").strip() or "Best,"
    signature_block = (template.get("signatureBlock") or stored_template.get("signatureBlock") or "").strip()[:500]
    signoff_config = {"signoffPhrase": signoff_phrase, "signatureBlock": signature_block}
    draft_resume_filename = (
        payload.get("resumeFileName")
        or user_profile.get("resumeFileName")
        or user_data.get("resumeFileName")
        or "Resume.pdf"
    )

    # Pull resumeParsed from Firestore (includes LinkedIn enrichment + resume data)
    # This gives the email generator rich context: skills, career_interests,
    # extracurriculars, certifications, experience — even for LinkedIn-only users
    resume_parsed = user_data.get("resumeParsed")
    if resume_parsed and isinstance(resume_parsed, dict):
        print(f"[EmailGen] Using resumeParsed from Firestore: name={resume_parsed.get('name')!r}, "
              f"skills={bool(resume_parsed.get('skills'))}, career_interests={resume_parsed.get('career_interests', [])[:3]}, "
              f"experience={len(resume_parsed.get('experience', []))} entries")
    else:
        resume_parsed = None
        print("[EmailGen] No resumeParsed in Firestore")

    # Backfill career interests from resumeParsed if frontend didn't send them
    if not career_interest and resume_parsed and resume_parsed.get("career_interests"):
        career_interest = resume_parsed["career_interests"]
        print(f"[EmailGen] Backfilled career_interests from resumeParsed: {career_interest[:3]}")

    # Read personalNote and dreamCompanies for enhanced personalization
    personal_note = user_data.get("personalNote", "")
    dream_companies = user_data.get("dreamCompanies", [])

    # Only generate emails for contacts that don't have them
    results = {}
    if contacts_needing_emails:
        # Log if fit context is being used
        if fit_context:
            print(f"📧 Generating emails with fit context: {fit_context.get('job_title', 'Unknown')} at {fit_context.get('company', 'Unknown')}")

        # Extract just the contact dicts for generation
        contacts_to_generate = [contact for _, contact in contacts_needing_emails]
        
        # 1) Generate emails with fit context and user's template/signoff
        auth_display_name = (getattr(request, "firebase_user", None) or {}).get("name") or ""
        warmth_data = score_contacts_for_email(user_data, contacts_to_generate)
        print(f"[EmailGen] Calling batch_generate_emails: resume_text={'present (' + str(len(resume_text)) + ' chars)' if resume_text else 'None/empty'}, "
              f"contacts={len(contacts_to_generate)}")
        generated_results = batch_generate_emails(
            contacts_to_generate,
            resume_text,
            user_profile,
            career_interest,
            fit_context=fit_context,
            pre_parsed_user_info=resume_parsed,
            template_instructions=template_instructions,
            email_template_purpose=purpose,
            resume_filename=draft_resume_filename,
            signoff_config=signoff_config,
            auth_display_name=auth_display_name,
            personal_note=personal_note,
            dream_companies=dream_companies,
            warmth_data=warmth_data,
            uid=uid,
        )
        print(f"🧪 batch_generate_emails returned: type={type(generated_results)}, "
          f"len={len(generated_results) if hasattr(generated_results, '__len__') else 'n/a'}, "
          f"keys={list(generated_results.keys())[:5] if isinstance(generated_results, dict) else 'list'}")
        
        # Map results back to original indices
        for idx, (original_idx, _) in enumerate(contacts_needing_emails):
            result_key = idx
            if isinstance(generated_results, dict):
                result = generated_results.get(result_key) or generated_results.get(str(result_key))
                if result:
                    results[original_idx] = result
    else:
        print(f"📧 All {len(contacts)} contacts already have emails, skipping generation")


    # 2) Create drafts with resume and formatted body
    gmail = gmail_service
    created = []
    draft_ids = []

    # Log which mailbox we're drafting as
    try:
        connected_email = gmail.users().getProfile(userId="me").execute().get("emailAddress")
        print(f"📧 Connected Gmail account: {connected_email}")
    except Exception as e:
        connected_email = None
        print(f"⚠️ Could not fetch connected Gmail profile: {e}")

    # user_data already loaded above for email template; use for resume too
    resume_url = (
        payload.get("resumeUrl") or
        user_profile.get("resumeUrl") or
        user_data.get("resumeUrl")
    )
    resume_filename = (
        payload.get("resumeFileName") or
        user_profile.get("resumeFileName") or
        user_data.get("resumeFileName") or
        "Resume.pdf"
    )

    if resume_url:
        resume_url = _normalize_drive_url(resume_url)

    # Download resume once before the loop (avoid N repeated downloads)
    _cached_resume_data = None
    _cached_resume_ctype = None
    if resume_url:
        try:
            resume_url = validate_fetch_url(resume_url)
            _resume_res = requests.get(
                resume_url, timeout=15,
                headers={"User-Agent": "Offerloop/1.0"}
            )
            _resume_res.raise_for_status()
            _cached_resume_data = _resume_res.content
            _cached_resume_ctype = _resume_res.headers.get("content-type", "")
            if isinstance(_cached_resume_ctype, bytes):
                _cached_resume_ctype = _cached_resume_ctype.decode("utf-8", errors="ignore")
            _cached_resume_ctype = _cached_resume_ctype.lower()
            # Guard: HTML sharing page instead of file bytes
            if len(_cached_resume_data) < 1024 and b"<html" in _cached_resume_data[:2048].lower():
                print("Resume URL returned HTML (likely a sharing page)")
                _cached_resume_data = None
            # Guard: skip very large attachments
            elif len(_cached_resume_data) > 8 * 1024 * 1024:
                print(f"Resume too large ({len(_cached_resume_data)} bytes) — skipping")
                _cached_resume_data = None
        except Exception as e:
            print(f"Could not download resume from {resume_url}: {e}")
            _cached_resume_data = None

    print(f"👥 Contacts received: {len(contacts)}")
    for i, c in enumerate(contacts):
        # ✅ FIX: Check if contact already has email, otherwise use newly generated email
        # First, check if contact already has emailSubject and emailBody
        existing_subject = c.get('emailSubject') or c.get('email_subject')
        existing_body = c.get('emailBody') or c.get('email_body')
        
        if existing_subject and existing_body:
            # Use existing email
            r = {
                'subject': existing_subject,
                'body': existing_body
            }
            print(f"✅ Using existing email for contact {i}: {c.get('FirstName', 'Unknown')}")
        else:
            # Try to get newly generated email
            r = None
            try:
                if isinstance(results, dict):
                    # handle both string and int keys
                    r = results.get(str(i)) or results.get(i)
                    # handle wrapped shape: {"results": [...]}
                    if r is None and "results" in results and isinstance(results["results"], list):
                        r = results["results"][i] if i < len(results["results"]) else None
                elif isinstance(results, list):
                    r = results[i] if i < len(results) else None
            except Exception as e:
                print(f"⚠️ Error reading generated email at index {i}: {e}")
                r = None

        if not r or not isinstance(r, dict) or not r.get("body") or not r.get("subject"):
            print(
                f"⚠️ Skipping index {i}: no email available (existing or generated) "
                f"for contact {c.get('FirstName', 'Unknown')}"
            )
            continue


        # Be tolerant to various keys
        to_addr = (
            c.get("Email") or c.get("email") or
            c.get("WorkEmail") or c.get("work_email") or
            c.get("PersonalEmail") or c.get("personal_email")
        )
        if not to_addr:
            print(f"⚠️ Skipping contact {i}: no email in {c}")
            continue

        # --- Format email content ---
        body = r["body"].strip()
        if "for context, i've attached my resume below" not in body.lower():
            body += "\n\nFor context, I've attached my resume below."

        # Check if body already ends with a signature (batch_generate_emails includes signature)
        # Look for common closings, user's signoffPhrase, user name, email, university, auth name, signatureBlock lines in last 200 chars
        body_lower = body.lower()
        has_signature = False
        phrase_lower = (signoff_config.get("signoffPhrase") or "").strip().lower()
        sig_block = (signoff_config.get("signatureBlock") or "").strip()
        auth_name = (getattr(request, "firebase_user", None) or {}).get("name", "").strip().lower()
        sig_block_lines = [line.strip().lower() for line in sig_block.split("\n") if line.strip()] if sig_block else []
        if user_profile or phrase_lower or sig_block:
            user_name = (user_profile or {}).get('name', '').lower()
            user_email = (user_profile or {}).get('email', '').lower()
            user_university = (user_profile or {}).get('university', '').lower()
            signature_indicators = [
                'best,', 'best regards', 'thank you', 'thanks,', 'sincerely', 'warm regards', 'cheers,',
                phrase_lower if phrase_lower else None,
                user_name if user_name else None,
                auth_name if auth_name else None,
                user_email if user_email else None,
                user_university if user_university else None,
            ]
            signature_indicators.extend(sig_block_lines)
            signature_indicators = [s for s in signature_indicators if s]
            body_end = body_lower[-200:] if len(body_lower) > 200 else body_lower
            has_signature = any(indicator in body_end for indicator in signature_indicators)
        
        # Build signature from signoff_config or user_profile (only if not already present)
        signature_html = ""
        signature_text = ""
        if not has_signature:
            phrase = (signoff_config.get("signoffPhrase") or "").strip() or "Best,"
            if signoff_config.get("signatureBlock") and sig_block:
                # Custom signature block (plain text and HTML)
                signature_text = "\n\n" + phrase + "\n" + sig_block
                signature_html = f"<br><p>{phrase.replace(chr(10), '<br>')}<br>{sig_block.replace(chr(10), '<br>')}</p>"
            elif user_profile:
                user_name = user_profile.get('name', '')
                user_email = user_profile.get('email', '')
                user_university = user_profile.get('university', '')
                user_year = user_profile.get('year', '') or user_profile.get('graduationYear', '')
                signature_parts_html = []
                if user_name:
                    signature_parts_html.append(f"<b>{user_name}</b>")
                if user_university:
                    if user_year:
                        signature_parts_html.append(f"{user_university} | Class of {user_year}")
                    else:
                        signature_parts_html.append(user_university)
                if user_email:
                    signature_parts_html.append(f'<a href="mailto:{user_email}">{user_email}</a>')
                if signature_parts_html:
                    signature_html = f"<br><p>{phrase}<br>{'<br>'.join(signature_parts_html)}</p>"
                else:
                    signature_html = f"<br><p>{phrase}</p>"
                signature_lines = [phrase]
                if user_name:
                    signature_lines.append(user_name)
                if user_university:
                    signature_lines.append(f"{user_university} | Class of {user_year}" if user_year else user_university)
                if user_email:
                    signature_lines.append(user_email)
                signature_text = "\n\n" + "\n".join(signature_lines)
            else:
                signature_html = f"<br><p>{phrase}</p>"
                signature_text = "\n\n" + phrase
        
        # Add signature to body before saving to Firestore (only if not already present)
        if signature_text:
            body += signature_text

        # Convert to simple HTML (paragraph spacing)
        html_body = "".join([
            f'<p style="margin:12px 0; line-height:1.6;">{p.strip()}</p>'
            for p in body.split("\n") if p.strip()
        ])
        # Add HTML signature
        html_body += signature_html

        # --- Build MIME message ---
        msg = MIMEMultipart("mixed")
        msg["to"] = to_addr
        msg["subject"] = r["subject"]

        alt = MIMEMultipart("alternative")
        alt.attach(MIMEText(body, "plain", "utf-8"))
        alt.attach(MIMEText(html_body, "html", "utf-8"))
        msg.attach(alt)

        # --- Attach resume if available (uses pre-downloaded bytes) ---
        if _cached_resume_data is not None:
            try:
                data = _cached_resume_data
                filename = resume_filename or "Resume.pdf"
                # If filename missing extension, try to pull one from the cached content-type
                if "." not in filename and _cached_resume_ctype and "/" in _cached_resume_ctype:
                    ext = mimetypes.guess_extension(_cached_resume_ctype.split(";")[0].strip()) or ".pdf"
                    filename += ext

                # Infer MIME type
                ctype_clean = (_cached_resume_ctype or "").split(";", 1)[0].strip()
                if "/" in ctype_clean:
                    main, sub = ctype_clean.split("/", 1)
                else:
                    main, sub = _infer_mime_type(filename)

                part = MIMEBase(main, sub)
                part.set_payload(data)
                encoders.encode_base64(part)
                part.add_header("Content-Disposition", f'attachment; filename="{filename}"')
                msg.attach(part)
            except Exception as e:
                print(f"[{i}] Could not attach resume: {e}")



        # --- Create Gmail draft ---
        try:
            raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
            draft = gmail.users().drafts().create(
                userId="me",
                body={"message": {"raw": raw}}
            ).execute()
            print(f"📤 [{i}] Draft created: {draft}")
            draft_id = draft.get("id")
            draft_ids.append(draft_id)
            
            # Extract message ID and threadId from draft (Gmail creates a thread when draft is created)
            message_id = draft.get("message", {}).get("id")
            thread_id = draft.get("message", {}).get("threadId")
            
            if not message_id or not thread_id:
                # If message ID or threadId not in draft response, get it from the draft message
                try:
                    draft_message = gmail.users().drafts().get(userId="me", id=draft_id, format="full").execute()
                    if not message_id:
                        message_id = draft_message.get("message", {}).get("id")
                    if not thread_id:
                        thread_id = draft_message.get("message", {}).get("threadId")
                except Exception as e:
                    print(f"⚠️ [{i}] Could not get message/threadId from draft: {e}")

            # Use message ID format for more reliable draft URL (Option A from fix doc)
            # Format: https://mail.google.com/mail/u/0/#drafts?compose=<messageId>
            if message_id:
                gmail_url = (
                    f"https://mail.google.com/mail/?authuser={connected_email}#drafts?compose={message_id}"
                    if connected_email else f"https://mail.google.com/mail/u/0/#drafts?compose={message_id}"
                )
            else:
                # Fallback to draft ID format if message ID not available
                gmail_url = (
                    f"https://mail.google.com/mail/?authuser={connected_email}#draft/{draft_id}"
                    if connected_email else f"https://mail.google.com/mail/u/0/#draft/{draft_id}"
                )

            created.append({
                "index": i,
                "to": to_addr,
                "draftId": draft_id,
                "messageId": message_id,
                "threadId": thread_id,
                "gmailUrl": gmail_url
            })
            
            # Save/update contact in Firestore with draft info (even if no threadId yet)
            # Drafts may not have threadId until they're sent or replied to
            try:
                contacts_ref = db.collection("users").document(uid).collection("contacts")
                # Find existing contact by email (normalized to lowercase)
                to_addr_clean = (to_addr or "").strip().lower()
                existing_contacts = list(contacts_ref.where("email", "==", to_addr_clean).limit(1).stream())
                
                contact_data = {
                    "gmailDraftId": draft_id,
                    "gmailMessageId": message_id,  # Save message ID for more reliable URL
                    "gmailDraftUrl": gmail_url,
                    "emailSubject": r["subject"],
                    "emailBody": body,
                    "draftToEmail": to_addr_clean,
                    "draftCreatedAt": datetime.utcnow().isoformat(),
                    "emailGeneratedAt": datetime.utcnow().isoformat(),
                    "lastActivityAt": datetime.utcnow().isoformat(),
                    "hasUnreadReply": False,
                    "draftStillExists": True,
                    "updatedAt": datetime.utcnow().isoformat(),
                    "pipelineStage": "draft_created",
                    "inOutbox": True,
                }

                # Store personalization metadata if available
                # New fields (leadType, commonalityTypes, warmthTierFinal, wordCountFinal,
                # leadHookUsedInBody) added 2026-04-28. Old contacts only have
                # personalizationLabel + personalizationType. No backfill — filter
                # analysis by emailGeneratedAt >= 2026-04-28 for clean P0 measurement.
                personalization = r.get("personalization")
                if personalization:
                    contact_data["personalizationLabel"] = personalization.get("label", "")
                    contact_data["personalizationType"] = personalization.get("commonality_type", "")
                    contact_data["leadType"] = personalization.get("lead_type", "")
                    contact_data["commonalityTypes"] = personalization.get("commonality_types", [])
                    contact_data["warmthTierFinal"] = personalization.get("warmth_tier_final", "")

                # Word count of final email body
                contact_data["wordCountFinal"] = len(body.split())

                # Check if lead hook content appears in the final body.
                # Uses 3+ consecutive significant words (>=4 chars) from the hook
                # to detect incorporation without false positives from short words.
                lead_hook = (personalization or {}).get("lead_hook", "")
                if lead_hook and len(lead_hook) > 5:
                    body_lower = body.lower()
                    hook_words = [
                        w for w in lead_hook.lower().split()
                        if len(w) >= 4 and w not in {"this", "that", "they", "them", "their", "with", "from", "have", "been", "were", "also", "your", "about"}
                    ]
                    # Check for any 3-consecutive-word window match
                    found = False
                    for i in range(len(hook_words) - 2):
                        trigram = " ".join(hook_words[i:i+3])
                        if trigram in body_lower:
                            found = True
                            break
                    # Fallback: if hook has fewer than 3 significant words,
                    # check if any 2-word pair appears
                    if not found and len(hook_words) >= 2 and len(hook_words) < 3:
                        bigram = " ".join(hook_words[:2])
                        found = bigram in body_lower
                    contact_data["leadHookUsedInBody"] = found
                else:
                    contact_data["leadHookUsedInBody"] = False
                
                # Add threadId if we have it
                if thread_id:
                    contact_data["gmailThreadId"] = thread_id
                
                # Add contact fields from the original contact data
                if c.get("FirstName"):
                    contact_data["firstName"] = c["FirstName"]
                if c.get("LastName"):
                    contact_data["lastName"] = c["LastName"]
                # Build full name for display
                full_name = (
                    c.get("full_name")
                    or c.get("name")
                    or f"{c.get('FirstName', '')} {c.get('LastName', '')}".strip()
                    or None
                )
                if full_name:
                    contact_data["name"] = full_name
                if c.get("Company"):
                    contact_data["company"] = c["Company"]
                if c.get("Title") or c.get("jobTitle"):
                    contact_data["jobTitle"] = c.get("Title") or c.get("jobTitle")
                if c.get("LinkedIn") or c.get("linkedinUrl"):
                    contact_data["linkedinUrl"] = c.get("LinkedIn") or c.get("linkedinUrl")
                if c.get("College") or c.get("college"):
                    contact_data["college"] = c.get("College") or c.get("college")
                if c.get("location"):
                    contact_data["location"] = c["location"]
                # pdlId for agentic queue dedup (new in Phase 1).
                if c.get("pdlId"):
                    contact_data["pdlId"] = c.get("pdlId")
                
                if existing_contacts:
                    # Update existing contact (same email = one contact doc)
                    contact_doc = existing_contacts[0]
                    contact_doc.reference.update(contact_data)
                    print(f"✅ [{i}] Updated contact {contact_doc.id} with draftId {draft['id']}" + (f" and threadId {thread_id}" if thread_id else ""))
                else:
                    # Create new contact only when no existing contact with this email
                    contact_data["email"] = to_addr_clean
                    contact_data["createdAt"] = datetime.utcnow().isoformat()
                    new_contact_ref = contacts_ref.document()
                    new_contact_ref.set(contact_data)
                    print(f"✅ [{i}] Created new contact {new_contact_ref.id} with draftId {draft['id']}" + (f" and threadId {thread_id}" if thread_id else ""))

                # Persist warmth tier + seniority bucket for Phase 2 aggregation.
                # warmth_data is keyed by index within contacts_needing_emails,
                # but we also need to handle contacts_with_emails (no warmth data).
                _w_info = warmth_data.get(i) if warmth_data else None
                _persist_warmth_on_send(
                    db, uid, to_addr_clean, _w_info,
                    c.get("Title") or c.get("jobTitle") or "",
                )
            except Exception as e:
                print(f"⚠️ [{i}] Failed to save contact to Firestore: {e}")
                import traceback
                traceback.print_exc()
        except Exception as e:
            print(f"❌ [{i}] Draft creation failed for {to_addr}: {e}")

    skipped_count = len(contacts) - len(created)
    return jsonify({
        "success": len(created) > 0 or len(contacts) == 0,
        "connected_email": connected_email,
        "draft_count": len(draft_ids),
        "draft_ids": draft_ids,
        "drafts": created,
        **({"skipped_count": skipped_count} if skipped_count > 0 else {}),
    }), 200