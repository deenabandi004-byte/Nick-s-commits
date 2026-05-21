# Diagnostic: Current Implementation of 3 Flows

Full code paths for template save, contact dedup (prompt-search), and signoff/duplicate signoff. No changes - current state only.

---

## 1. Template Save Flow

### Frontend

#### 1.1 "Save Template" / "Save as default" button and handler

**File:** `connect-grow-hire/src/pages/EmailTemplatesPage.tsx`

**Button (lines 552–554):**
```tsx
                <Button onClick={handleSaveAsDefault} disabled={isSaving} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
                  {isSaving ? "Saving…" : isMakeYourOwn ? "Save Template" : "Save as default"}
                </Button>
```

**Handler (lines 199–244):**
```tsx
  const handleSaveAsDefault = async () => {
    if (purpose === CUSTOM_PURPOSE_ID && !templateName.trim()) {
      toast({ title: "Name required", description: "Please enter a template name before saving.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      let savedId = activeSavedTemplateId;
      if (purpose === CUSTOM_PURPOSE_ID) {
        const res = await apiService.createSavedEmailTemplate({
          id: activeSavedTemplateId || undefined,
          name: templateName.trim(),
          subject: subjectLine.trim(),
          body: customInstructions.trim(),
        });
        savedId = res.id;
        setActiveSavedTemplateId(savedId);

        const newEntry: SavedEmailTemplate = {
          id: savedId,
          name: templateName.trim(),
          subject: subjectLine.trim(),
          body: customInstructions.trim(),
        };
        setSavedCustomTemplates((prev) => {
          const idx = prev.findIndex((t) => t.id === savedId);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = newEntry;
            return copy;
          }
          return [newEntry, ...prev];
        });
      }

      const template = buildTemplate();
      template.savedTemplateId = savedId || undefined;
      await apiService.saveEmailTemplate(template);
      setSavedTemplate(template);
      toast({ title: "Saved", description: "Email template saved as your default." });
    } catch {
      toast({ title: "Failed to save", description: "Could not save template.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };
```

**buildTemplate (lines 129–140):**
```tsx
  const buildTemplate = (): EmailTemplate => {
    const custom = customInstructions.trim().slice(0, MAX_CUSTOM_LEN);
    return {
      purpose: effectivePurpose,
      stylePreset: null,
      customInstructions: custom,
      signoffPhrase: effectiveSignoff,
      signatureBlock: signatureBlock.trim().slice(0, 500),
      name: templateName.trim(),
      subject: subjectLine.trim(),
      savedTemplateId: activeSavedTemplateId || undefined,
    };
  };
```

#### 1.2 EmailTemplateModal save

**File:** `connect-grow-hire/src/components/EmailTemplateModal.tsx`

**Save handler (lines 127–130):**
```tsx
  const handleSaveAsDefault = async () => {
    await onSaveAsDefault(buildTemplate());
    onOpenChange(false);
  };
```

Modal’s `buildTemplate()` (lines 105–116) builds the same shape (purpose, stylePreset, customInstructions, signoffPhrase, signatureBlock). The parent passes `onSaveAsDefault`; that parent is responsible for calling the API (typically the same `apiService.saveEmailTemplate`).

#### 1.3 API: saveEmailTemplate and POST to `/api/email-template`

**File:** `connect-grow-hire/src/services/api.ts`

**Lines 1155–1171:**
```ts
  async saveEmailTemplate(template: EmailTemplate): Promise<{ success: boolean }> {
    const headers = await this.getAuthHeaders();
    return this.makeRequest<{ success: boolean }>('/email-template', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purpose: template.purpose,
        stylePreset: template.stylePreset,
        customInstructions: template.customInstructions || '',
        signoffPhrase: template.signoffPhrase ?? '',
        signatureBlock: template.signatureBlock ?? '',
        name: template.name || '',
        subject: template.subject || '',
        savedTemplateId: template.savedTemplateId || null,
      }),
    });
  }
```

---

### Backend: POST `/api/email-template`

**File:** `backend/app/routes/email_template.py`

**Validation (lines 26–71):**
```python
def _validate_body():
    """Validate POST body; returns (data, error_response). error_response is (jsonify_result, status) or None."""
    data = request.get_json(silent=True)
    if data is None:
        return None, (jsonify({"error": "Invalid or missing JSON body"}), 400)

    purpose = data.get("purpose")
    if purpose is not None and purpose not in VALID_PURPOSES:
        return None, (
            jsonify({"error": "Invalid purpose", "valid": sorted(VALID_PURPOSES)}),
            400,
        )

    style_preset = data.get("stylePreset")
    if style_preset is not None and style_preset not in VALID_STYLE_PRESETS:
        return None, (
            jsonify({"error": "Invalid stylePreset", "valid": sorted(VALID_STYLE_PRESETS)}),
            400,
        )

    custom_instructions = (data.get("customInstructions") or "").strip()
    if len(custom_instructions) > EMAIL_TEMPLATE_MAX_CUSTOM_LEN:
        return None, (
            jsonify({
                "error": f"customInstructions must be at most {EMAIL_TEMPLATE_MAX_CUSTOM_LEN} characters",
                "max": EMAIL_TEMPLATE_MAX_CUSTOM_LEN,
            }),
            400,
        )

    signoff_phrase = (data.get("signoffPhrase") or "").strip()
    if not signoff_phrase:
        signoff_phrase = DEFAULT_SIGNOFF_PHRASE
    signoff_phrase = signoff_phrase[:SIGNOFF_PHRASE_MAX_LEN]

    signature_block = (data.get("signatureBlock") or "").strip()[:SIGNATURE_BLOCK_MAX_LEN]

    return {
        "purpose": purpose,
        "stylePreset": style_preset,
        "customInstructions": custom_instructions[:EMAIL_TEMPLATE_MAX_CUSTOM_LEN],
        "signoffPhrase": signoff_phrase,
        "signatureBlock": signature_block,
        "name": (data.get("name") or "").strip()[:200],
        "subject": (data.get("subject") or "").strip()[:500],
        "savedTemplateId": (data.get("savedTemplateId") or "").strip() or None,
    }, None
```

**POST endpoint (lines 75–104):**
```python
@email_template_bp.route("", methods=["POST"])
@require_firebase_auth
def save_default():
    """Save the user's default email template."""
    try:
        db = get_db()
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500

    data, err = _validate_body()
    if err:
        return err

    uid = request.firebase_user["uid"]
    user_ref = db.collection("users").document(uid)

    email_template = {
        "purpose": data["purpose"],
        "stylePreset": data["stylePreset"],
        "customInstructions": data["customInstructions"],
        "signoffPhrase": data["signoffPhrase"],
        "signatureBlock": data["signatureBlock"],
        "name": data["name"],
        "subject": data["subject"],
        "savedTemplateId": data["savedTemplateId"],
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }
    user_ref.set({"emailTemplate": email_template}, merge=True)

    return jsonify({"success": True}), 200
```

---

## 2. Contact Dedup Flow (prompt-search)

### 2.1 In `backend/app/routes/runs.py`: prompt-search from PDL results to Firestore save

**Flow summary:** `search_contacts_from_prompt` returns contacts → no dedup before `batch_generate_emails` → emails generated → `contacts_with_emails` built → `create_drafts_parallel` → credits deducted → **dedup only at Firestore save** (skip if email/linkedin/name+company already exists).

**PDL call and pipeline (lines 1193–1252):**
```python
        # Fetch contacts
        contacts = search_contacts_from_prompt(parsed, max_contacts, exclude_keys=seen_contact_set)
        if not contacts:
            return jsonify({...})

        # Same pipeline as free-run: template, emails, drafts, deduct, save
        user_profile = ...
        template_instructions, email_template_purpose, template_subject_line, signoff_config = _resolve_email_template(data.get("emailTemplate"), user_id, db)
        ...
        auth_display_name = ...
        try:
            email_results = batch_generate_emails(
                contacts, resume_text, user_profile, career_interests,
                fit_context=None,
                template_instructions=template_instructions,
                email_template_purpose=email_template_purpose,
                resume_filename=user_resume_filename,
                subject_line=template_subject_line,
                signoff_config=signoff_config,
                auth_display_name=auth_display_name,
            )
        except Exception as email_gen_error:
            ...
            email_results = {}

        for i, contact in enumerate(contacts):
            ...
            if email_result ...:
                contact["emailSubject"] = subject
                contact["emailBody"] = body

        contacts_with_emails = []
        for i, contact in enumerate(contacts):
            ...
            contacts_with_emails.append({...})

        # Always fetch user resume ...
        ...
        draft_results = create_drafts_parallel(...)

        # Firestore save with dedup
        ...
        existing_emails = {...}
        existing_linkedins = {...}
        existing_name_company = {...}
        for contact in contacts:
            ...
            if (email and email in existing_emails) or (linkedin and linkedin in existing_linkedins):
                skipped_count += 1
                continue
            if first_name and last_name and company and f"{first_name}_{last_name}_{company}".lower() in existing_name_company:
                skipped_count += 1
                continue
            ...
            contacts_ref.add(contact_doc)
            saved_count += 1
            if email:
                existing_emails.add(email)
            ...
```

**Dedup logic (lines 1355–1401):**
```python
                for contact in contacts:
                    first_name = (contact.get("FirstName") or contact.get("firstName") or "").strip()
                    last_name = (contact.get("LastName") or contact.get("lastName") or "").strip()
                    email = (contact.get("Email") or contact.get("WorkEmail") or contact.get("PersonalEmail") or contact.get("email") or "").strip().lower()
                    linkedin = (contact.get("LinkedIn") or contact.get("linkedinUrl") or "").strip()
                    company = (contact.get("Company") or contact.get("company") or "").strip()
                    if (email and email in existing_emails) or (linkedin and linkedin in existing_linkedins):
                        skipped_count += 1
                        continue
                    if first_name and last_name and company and f"{first_name}_{last_name}_{company}".lower() in existing_name_company:
                        skipped_count += 1
                        continue
                    contact_doc = {...}
                    ...
                    contacts_ref.add(contact_doc)
                    saved_count += 1
                    # Avoid duplicates within same batch
                    if email:
                        existing_emails.add(email)
                    if linkedin:
                        existing_linkedins.add(linkedin)
                    if first_name and last_name and company:
                        existing_name_company.add(f"{first_name}_{last_name}_{company}".lower().strip())
```

So: **there is no dedup before `batch_generate_emails`**. Dedup is only at Firestore write: skip if email or linkedin or (first+last+company) already in `existing_*`. `seen_contact_set` is used earlier only inside `search_contacts_from_prompt` to exclude already-seen contacts from the PDL result set.

---

### 2.2 `search_contacts_from_prompt` - signature and `size`

**File:** `backend/app/services/pdl_client.py`

**Function (lines 2980–3053):**
```python
def search_contacts_from_prompt(parsed_prompt: dict, max_contacts: int, exclude_keys=None):
    """
    Run PDL person search from structured prompt output. Reuses execute_pdl_search,
    applies exclusion filtering and post-validation (company/school match), returns contacts.
    """
    ...
    exclude_keys = exclude_keys or set()
    ...
    fetch_limit = int(min(max_contacts * 2, 50))
    page_size = min(100, max(1, fetch_limit))

    raw_contacts = []
    ...
    for attempt in range(4):
        ...
        query_obj = build_query_from_prompt(parsed_prompt, retry_level=attempt)
        raw_contacts, status_code = execute_pdl_search(
            headers=headers,
            url=PDL_URL,
            query_obj=query_obj,
            desired_limit=fetch_limit,
            search_type="prompt_search",
            page_size=page_size,
            ...
        )
        ...
    ...
    filtered = []
    for contact in raw_contacts:
        key = get_contact_identity(contact)
        if key in exclude_keys:
            continue
        matches, _ = _contact_matches_prompt_criteria(...)
        if not matches:
            ...
            continue
        filtered.append(contact)
    ...
    return filtered[:max_contacts]
```

So: **no `excluded_names` or `excluded_emails`**; it takes **`exclude_keys`** (set of identity keys from `get_contact_identity`). Contacts whose key is in `exclude_keys` are dropped after PDL returns.

**How `size` is set:** Inside `execute_pdl_search` (lines 1736, 1754–1774):

```python
def execute_pdl_search(headers, url, query_obj, desired_limit, search_type, page_size=50, ...):
    desired_limit = int(desired_limit)
    page_size = int(page_size)
    ...
    fetch_size = page_size + skip_count if skip_count > 0 else page_size
    fetch_size = int(min(100, fetch_size))
    body = {"query": query_obj, "size": fetch_size}
```

For prompt-search, caller passes `desired_limit=fetch_limit` (max_contacts * 2 capped at 50) and `page_size=min(100, max(1, fetch_limit))`. So the first request’s `size` is `min(100, fetch_size)` where `fetch_size` is derived from `page_size` (and optional skip).

---

## 3. Signoff / Duplicate Signoff Flow

### 3.1 `batch_generate_emails` - signoff_config usage, custom vs non-custom prompt, post-processing

**File:** `backend/app/services/reply_generation.py`

**Signature block helper (lines 458–472):**
```python
def _build_signature_block_for_prompt(signoff_config, user_info):
    """
    Build the signature block string for the LLM prompt.
    signoff_config: {"signoffPhrase": str, "signatureBlock": str} or None.
    """
    phrase = "Best,"
    block = ""
    if signoff_config and isinstance(signoff_config, dict):
        phrase = (signoff_config.get("signoffPhrase") or "").strip() or "Best,"
        block = (signoff_config.get("signatureBlock") or "").strip()
    if block:
        return f"{phrase}\n{block}"
    return f"{phrase}\n[Full Name]\n[University] | Class of [Year]"
```

**Custom-purpose branch (signature in prompt) (lines 792–807):**
```python
        if is_custom_purpose:
            ...
            _sig_block = _build_signature_block_for_prompt(signoff_config, user_info)
            minimal_formatting = f"""
===== FORMATTING ONLY =====
- Start each email with "Hi [FirstName],"{subject_instruction}
- ...
- End each body with this exact sign-off block:
{_sig_block}

Return ONLY valid JSON:
{{"0": {{"subject": "...", "body": "..."}}, ...}}"""
            prompt = f"{context_block}\n\n{(template_instructions or '').strip()}\n\n{minimal_formatting}"
```

**Non-custom branch (signature in requirements block) (lines 826–884):**
```python
        else:
            ...
            signature_block_prompt = _build_signature_block_for_prompt(signoff_config, user_info)

            requirements_block = f"""===== EMAIL STRUCTURE (FOLLOW THIS EXACTLY) =====
...
{resume_line_section}SIGNATURE (REQUIRED - every email MUST end with this):
Use exactly this format (sign-off line then name/signature block):
{signature_block_prompt}
CRITICAL: Never end the email without a sign-off and the sender's name.
...
Return ONLY valid JSON: ..."""
            prompt = build_template_prompt(context_block, template_instructions or "", requirements_block)
```

**Post-processing (ensure sign-off and fallback use of signoff_config):** After parsing LLM JSON, each body is passed through resume-line insertion (which uses `signoff_config` for custom sign-off patterns), malformed fallback (which uses `signoff_config` for phrase/signatureBlock), then:

**Lines 1131–1135:**
```python
            # Ensure every email ends with a sign-off and sender name
            sender_name = user_info.get('name', '') or 'Student'
            body = ensure_sign_off(body, sender_name, signoff_config)
            cleaned_results[idx] = {'subject': subject, 'body': body}
```

**ensure_sign_off (lines 475–496):**
```python
def ensure_sign_off(body: str, sender_name: str, signoff_config=None) -> str:
    """Ensure the email body ends with a sign-off and sender name. Appends if missing."""
    if not body or not body.strip():
        return body
    name = (sender_name or "Student").strip() or "Student"
    if email_has_sign_off(body, name):
        return body
    phrase = "Best regards,"
    extra_lines = ""
    if signoff_config and isinstance(signoff_config, dict):
        phrase = (signoff_config.get("signoffPhrase") or "").strip() or "Best,"
        block = (signoff_config.get("signatureBlock") or "").strip()
        if block:
            extra_lines = "\n" + block
        else:
            extra_lines = "\n" + name
    else:
        extra_lines = "\n" + name
    base = body.rstrip()
    if not base.endswith("\n"):
        base += "\n"
    return f"{base}\n\n{phrase}{extra_lines}"
```

So: **signoff_config** is used to build the SIGNATURE section in both custom and non-custom prompts, and in post-processing (resume-line patterns, malformed fallback, and `ensure_sign_off`).

---

### 3.2 `_resolve_email_template` and how `signoff_config` is passed

**File:** `backend/app/routes/runs.py` (lines 33–84):

```python
def _resolve_email_template(email_template_override, user_id, db):
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
    # Fill gaps from Firestore (whether or not we had an override)
    if user_id and db:
        try:
            user_doc = db.collection("users").document(user_id).get()
            if user_doc.exists:
                data = user_doc.to_dict() or {}
                t = data.get("emailTemplate") or {}
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
        except Exception:
            pass
    if signoff_phrase is None:
        signoff_phrase = "Best,"
    if signature_block is None:
        signature_block = ""
    signoff_config = {"signoffPhrase": signoff_phrase, "signatureBlock": signature_block}
    instructions = get_template_instructions(purpose=purpose, style_preset=style_preset, custom_instructions=custom_instructions)
    ...
    return instructions, purpose, subject_line, signoff_config
```

So: override can set signoff fields; any missing field is filled from Firestore `users/{uid}.emailTemplate`. **signoff_config** is always returned and passed into `batch_generate_emails(..., signoff_config=signoff_config)` at every call site (free-run, pro-run, prompt-search). Discover Contacts (emails.py) builds its own signoff_config from Firestore and does not use `_resolve_email_template`.

---

### 3.3 Signature detection / append in `emails.py` (generate-and-draft)

**File:** `backend/app/routes/emails.py` (lines 244–320):

```python
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
                signature_text = "\n\n" + phrase + "\n" + sig_block
                signature_html = f"<br><p>{phrase.replace(chr(10), '<br>')}<br>{sig_block.replace(chr(10), '<br>')}</p>"
            elif user_profile:
                # ... build from user_profile (name, university, year, email)
                signature_text = "\n\n" + "\n".join(signature_lines)
                ...
            else:
                signature_html = f"<br><p>{phrase}</p>"
                signature_text = "\n\n" + phrase
        
        # Add signature to body before saving to Firestore (only if not already present)
        if signature_text:
            body += signature_text
```

So: **Detection** uses the last 200 chars of the body and checks for presence of: common closings, signoff phrase, user name, auth name, user email, user university, and **each line of the user’s signature block**. **Append** happens only when `not has_signature`; the appended block is either signoff_config (phrase + signatureBlock) or profile-based (phrase + name + university/year + email) or just the phrase.

---

End of diagnostic.
