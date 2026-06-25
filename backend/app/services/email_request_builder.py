"""
email_request_builder — single source of truth for assembling kwargs for
reply_generation.batch_generate_emails.

Three production callers build these kwargs today:
  - app/routes/runs.py            (prompt-search Find pipeline)
  - app/routes/linkedin_import.py (LinkedIn URL quick-add)
  - app/services/recruiter_email_generator.py (recruiter / hiring-manager drafts)

Before this module existed, each caller hand-rolled the kwargs and they drifted
(hardcoded email_template_purpose='networking', missing signoff_config, etc.).
This module canonicalizes:

  1. Email template resolution (request override → user's saved template → defaults)
  2. Kwargs assembly for batch_generate_emails (every field, every default)

Add a new email-gen call site? Use build_email_gen_request. Don't hand-roll.
"""
from email_templates import get_template_instructions


def resolve_email_template(email_template_override, user_id, db, user_data=None):
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


def build_email_gen_request(
    *,
    contacts,
    user_id,
    user_profile,
    user_data,
    auth_display_name="",
    fit_context=None,
    template_override=None,
    forced_purpose=None,
    resume_text=None,
    resume_filename=None,
    warmth_data=None,
    enrichment_data=None,
    loop_brief_text="",
    loop_brief_parsed=None,
    db=None,
):
    """
    Assemble a kwargs dict for reply_generation.batch_generate_emails.

    Required:
      contacts: list of contact dicts (the engine generates one email per contact)
      user_id: Firebase uid
      user_profile: caller-built profile dict (name, email, university, etc.)
      user_data: full Firestore user doc (or {}); used for emailTemplate + resumeParsed + careerInterests

    Optional:
      auth_display_name: from request.firebase_user.name (signature fallback)
      fit_context: job/role context dict; populates the "Target Role" prompt section
      template_override: request-body emailTemplate dict (wins over user's saved template)
      forced_purpose: hardcode the email_template_purpose (recruiter path passes 'referral')
      resume_text: pre-extracted resume text; None lets the engine skip resume context
      resume_filename: for the "I've attached <filename>" in the body
      warmth_data: pre-computed warmth tier per contact (index → tier dict)
      enrichment_data: Perplexity per-contact talking points
      loop_brief_text / loop_brief_parsed: agentic Loop context

    Returns: dict ready for `batch_generate_emails(**request)`.
    """
    template_instructions, purpose, subject_line, signoff_config = resolve_email_template(
        template_override, user_id, db, user_data=user_data
    )
    if forced_purpose:
        purpose = forced_purpose

    user_data_safe = user_data or {}
    career_interests = user_data_safe.get("careerInterests", []) or []
    pre_parsed = user_data_safe.get("resumeParsed")

    return {
        "contacts": contacts,
        "resume_text": resume_text,
        "user_profile": user_profile,
        "career_interests": career_interests,
        "fit_context": fit_context,
        "pre_parsed_user_info": pre_parsed,
        "template_instructions": template_instructions,
        "email_template_purpose": purpose,
        "resume_filename": resume_filename,
        "subject_line": subject_line,
        "signoff_config": signoff_config,
        "auth_display_name": auth_display_name,
        "warmth_data": warmth_data,
        "uid": user_id,
        "enrichment_data": enrichment_data,
        "loop_brief_text": loop_brief_text,
        "loop_brief_parsed": loop_brief_parsed,
    }
