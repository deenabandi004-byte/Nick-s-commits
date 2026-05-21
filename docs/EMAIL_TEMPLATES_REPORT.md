# Email Templates - Full System Report

This document describes how Offerloop’s email template system works end-to-end: UI, API, storage, and how templates affect email generation and drafts.

---

## 1. Overview

The email template system lets users configure:

1. **Purpose** - What the email is for (networking, referral, follow-up, sales, or custom).
2. **Style preset** - Optional tone (casual, professional, short & direct, etc.); used in the **modal** and in preset definitions, not on the full **templates page**.
3. **Custom instructions** - Free-form text (up to 4,000 characters) that is injected into the LLM prompt.
4. **Sign-off** - Closing phrase (e.g. “Best,” “Thanks,” or custom) and an optional **signature block** (name, university, email, LinkedIn, etc.).

Templates are stored per user in Firestore and are used when generating outreach emails (Discover Contacts, Pro/Free runs, prompt search) and when creating Gmail drafts.

---

## 2. Data Model

### 2.1 Frontend type (`connect-grow-hire/src/services/api.ts`)

```ts
export interface EmailTemplate {
  purpose?: string | null;           // "networking" | "referral" | "follow_up" | "sales" | "custom"
  stylePreset?: string | null;        // "casual" | "professional" | "short_direct" | "warm_enthusiastic" | "bold_confident"
  customInstructions?: string;       // max 4000 chars
  signoffPhrase?: string;            // e.g. "Best," - max 50 chars
  signatureBlock?: string;           // freeform lines - max 500 chars
}
```

- `hasEmailTemplateValues(t)` is used to decide whether to send a template in run/generate requests (true if any of purpose, stylePreset, customInstructions, or non-default signoff/signature are set).

### 2.2 Firestore

- **Collection:** `users`
- **Document:** `users/{uid}`
- **Field:** `emailTemplate` (map), written by `backend/app/routes/email_template.py`:

| Key                 | Type   | Notes                                      |
|---------------------|--------|--------------------------------------------|
| `purpose`           | string | null or one of valid purposes              |
| `stylePreset`       | string | null or one of valid style preset ids     |
| `customInstructions` | string | trimmed, max 4000 chars                  |
| `signoffPhrase`     | string | default `"Best,"`, max 50 chars            |
| `signatureBlock`    | string | max 500 chars                               |
| `updatedAt`         | timestamp | SERVER_TIMESTAMP                         |

Valid purposes: from `email_templates.EMAIL_PURPOSE_PRESETS` plus `"custom"`.  
Valid style presets: from `email_templates.EMAIL_STYLE_PRESETS`.

---

## 3. Frontend - Where Templates Are Managed

### 3.1 Full-page: Email Templates Page

- **File:** `connect-grow-hire/src/pages/EmailTemplatesPage.tsx`
- **Route:** `/contact-search/templates`
- **Layout:** Sidebar + main content (same shell as rest of app).

**Sections:**

1. **What kind of email?** - Purpose pills: **Networking** (default), **Referral Request**, **Follow-Up**. No style dropdown here.
2. **Create Your Own Template** - Expandable card; when expanded, shows a textarea for **custom instructions** (plain English; max 4,000 chars). Choosing “Create Your Own” sets purpose to `"custom"` and uses that text as the custom instructions.
3. **Sign-off & signature** - Always visible card:
   - **Closing phrase:** Presets (Best,, Thanks,, Warm regards,, Sincerely,, Cheers,, **Custom**). If Custom, a short input (max 50 chars).
   - **Signature:** Textarea for full signature (name, university, email, LinkedIn, etc.; max 500 chars).
   - **Preview:** Shows `signoffPhrase` + `signatureBlock` (or first name if block empty).

**Actions:**

- **Reset** - Resets to networking, no custom instructions, “Best,” sign-off, empty signature.
- **Apply to this search** - Writes template to `sessionStorage` as `offerloop_applied_email_template` and navigates to `/contact-search` with `state.appliedEmailTemplate`. Contact search then uses this as the “session” template until cleared or overridden.
- **Save as default** - Calls `apiService.saveEmailTemplate(buildTemplate())`; backend persists to Firestore `users/{uid}.emailTemplate`.

**Note:** This page does **not** expose **style preset**; it only sets `stylePreset: null` in `buildTemplate()`. Style is used in the modal and in backend preset definitions.

### 3.2 Modal: Email Template Modal

- **File:** `connect-grow-hire/src/components/EmailTemplateModal.tsx`
- **Used from:** Contact Search and any place that opens “Edit template” in-context.

**Differences from the full page:**

- Has **purpose** (including “Custom” with custom text) and **style preset** dropdown (from `apiService.getEmailTemplatePresets()`).
- **Sign-off & signature** is a **collapsible** section (same fields: closing phrase presets + custom, signature textarea).
- **Apply** updates parent state/session and/or sessionStorage; **Save as default** calls the same `saveEmailTemplate` API.

So: **full page** = purpose + custom instructions + sign-off/signature (no style). **Modal** = purpose + style + custom instructions + sign-off/signature.

### 3.3 API usage (`connect-grow-hire/src/services/api.ts`)

- **GET `/api/email-template`** → `getEmailTemplate()`: returns current default template (from Firestore).
- **POST `/api/email-template`** → `saveEmailTemplate(template)`: body includes `purpose`, `stylePreset`, `customInstructions`, and optionally `signoffPhrase`, `signatureBlock`; backend validates and merges into `users/{uid}.emailTemplate`.
- **GET `/api/email-template/presets`** → `getEmailTemplatePresets()`: returns `{ styles, purposes }` for dropdowns.

When starting a **run** or **generate-and-draft**, the frontend may send `emailTemplate` in the request body if `hasEmailTemplateValues(request.emailTemplate)` is true; otherwise the backend uses the stored default.

---

## 4. Backend - Template API & Validation

- **File:** `backend/app/routes/email_template.py`
- **Blueprint:** `email_template_bp`, prefix `/api/email-template`.

**Endpoints:**

| Method | Path     | Auth   | Description |
|--------|----------|--------|-------------|
| POST   | `/`      | Firebase | Save default template; validate then merge into `users/{uid}.emailTemplate`. |
| GET    | `/`      | Firebase | Return current default template (or defaults if no doc). |
| GET    | `/presets` | Firebase | Return style and purpose presets from `email_templates.get_available_presets()`. |

**Validation (_validate_body):**

- `purpose`: must be in `VALID_PURPOSES` (all keys of `EMAIL_PURPOSE_PRESETS` plus `"custom"`).
- `stylePreset`: must be in `VALID_STYLE_PRESETS` (keys of `EMAIL_STYLE_PRESETS`).
- `customInstructions`: stripped, max 4,000 chars.
- `signoffPhrase`: stripped; if empty, set to `"Best,"`; max 50 chars (truncated).
- `signatureBlock`: stripped, max 500 chars (truncated).

Saved document shape: `purpose`, `stylePreset`, `customInstructions`, `signoffPhrase`, `signatureBlock`, `updatedAt`.

---

## 5. Backend - Preset Definitions (Prompt Building)

- **File:** `backend/email_templates.py` (no Flask; used by routes and services).

**EMAIL_PURPOSE_PRESETS** - e.g.:

- `networking`: meetings, informational interviews; mentions resume, 15–20 min ask, “Thank you,” then name and contact.
- `referral`: ask for referral; specific role, fit, resume.
- `follow_up`: short 2–3 sentences; reference previous contact; “Thanks,” then name.
- `sales`: sales/partnership; pain point, one-sentence product, proof, low-friction ask; no resume line.

**EMAIL_STYLE_PRESETS** - e.g.:

- `casual`: relaxed, contractions, short sentences; sign off “Thanks,” or “Cheers,” then name.
- `professional`: polished; “Best regards,” or “Thank you,” then full name.
- `short_direct`: body under 50 words; “Thanks,” then name.
- `warm_enthusiastic`, `bold_confident`: similar structure with different tone/signoff hints.

**get_template_instructions(purpose, style_preset, custom_instructions):**

- If purpose is None or `"networking"`, no style, and no custom → returns `""` (backwards compatible).
- Otherwise concatenates: purpose base_prompt + style instructions + `"CUSTOM INSTRUCTIONS (from user):"` + custom_instructions.
- Style presets only give **hints** (e.g. “Sign off with …”); the actual sign-off used in generation comes from **signoff_config** (see below).

---

## 6. How the Template Is Resolved at Generation Time

Two main code paths use the template: **Discover Contacts** (generate-and-draft) and **Runs** (free/pro/prompt search).

### 6.1 Discover Contacts: POST `/api/emails/generate-and-draft`

- **File:** `backend/app/routes/emails.py` → `generate_and_draft()`.

Flow:

1. Reads `user_profile`, contacts, resume, etc. from payload.
2. Loads user doc from Firestore: `user_doc = db.collection("users").document(uid).get()`, `user_data = user_doc.to_dict()`, `email_template = user_data.get("emailTemplate") or {}`.
3. Builds:
   - `template_instructions = get_template_instructions(purpose, style_preset, custom_instructions)` from `email_template`.
   - `email_template_purpose = email_template.get("purpose")`.
   - `signoff_config`: if `email_template` has `signoffPhrase` or `signatureBlock`, `signoff_config = { "signoffPhrase": ..., "signatureBlock": ... }` (with defaults); else `signoff_config = None`.
4. Calls `batch_generate_emails(..., template_instructions=..., email_template_purpose=..., signoff_config=signoff_config, auth_display_name=...)` for contacts that need emails.
5. For each contact, if the body doesn’t already look like it has a signature (checks last 200 chars for signoff phrase, name, email, university), appends a signature built from `signoff_config` or from `user_profile` (Best, + name + university | Class of year + email). HTML version is built the same way for the draft.

So **Discover Contacts always uses the saved Firestore template** (purpose, style, custom, signoff). It does **not** take an override from the request body.

### 6.2 Runs: Free / Pro / Prompt search

- **File:** `backend/app/routes/runs.py`.

**Template resolution:** `_resolve_email_template(email_template_override, user_id, db)`:

1. If the request sent an `email_template_override` (dict), take purpose, stylePreset, customInstructions from it.
2. If not fully specified, load `users/{uid}.emailTemplate` from Firestore and fill in missing fields.
3. `instructions = get_template_instructions(purpose, style_preset, custom_instructions)`.
4. **Signoff:** Prefer override if it has `signoffPhrase` or `signatureBlock`; otherwise use Firestore template. Build `signoff_config = { "signoffPhrase": ..., "signatureBlock": ... }` (with defaults).
5. Returns `(instructions, purpose, signoff_config)`.

Run endpoints then call `batch_generate_emails(..., template_instructions=..., email_template_purpose=..., signoff_config=signoff_config)` (and optionally attach resume based on purpose and body content).

So **runs** support both request override and stored default; signoff is never “dropped” when the client sends a minimal override (fallback to Firestore for signoff if override has no signoff fields).

---

## 7. Email Generation - How the Template and Sign-off Are Used

- **File:** `backend/app/services/reply_generation.py` → `batch_generate_emails(...)`.

**Parameters relevant to templates:**

- `template_instructions`: string (purpose + style + custom block from `get_template_instructions`).
- `email_template_purpose`: used to decide resume line and some structure (e.g. networking vs sales).
- `signoff_config`: `{ "signoffPhrase": str, "signatureBlock": str }` or None.

**Signature block in prompt:**

- `_build_signature_block_for_prompt(signoff_config, user_info)`:
  - If `signoff_config` has a non-empty `signoffPhrase`, use it; else `"Best,"`.
  - If `signoff_config` has non-empty `signatureBlock`, return `signoff_phrase + "\n" + signature_block`.
  - Else return `signoff_phrase + "\n[Full Name]\n[University] | Class of [Year]"` (LLM fills from context).

This string is injected into the **SIGNATURE (exactly this format):** section of the requirements block so the model outputs the user’s chosen closing and signature (or the default).

**Prompt assembly:**

- For **custom** purpose: context + user’s `template_instructions` + minimal formatting rules that include the signature block; no fixed networking structure.
- For **non-custom**: context + `template_instructions` + full “EMAIL STRUCTURE” (opening, middle, resume line if applicable, **SIGNATURE** with the same signature block).

So the **sign-off and signature block are fully driven by the template** (or Firestore default) at generation time.

**Post-processing:**

- **Resume line:** For purposes in `PURPOSES_INCLUDE_RESUME` (None, `"networking"`, `"referral"`) and when appropriate (targeted outreach or strong connection), a line like “I've attached my resume below for context.” is inserted **before** the sign-off. The code looks for the user’s `signoffPhrase` (and common variants) to find where to insert; if none found, it inserts before the last non-empty line.
- **Fallback / malformed:** If a body is detected as malformed, a fallback body is built and the fallback signature uses `signoff_config.signoffPhrase` and `signatureBlock` (or name) so sign-off stays consistent.
- **Exception fallback:** If batch generation fails, fallback emails also use `signoff_config` for the closing line when provided.

---

## 8. Draft Creation and Signature (emails.py)

After `batch_generate_emails` (or when reusing existing email body):

1. **Resume line:** If “for context, i've attached my resume below” is not already in the body, it is appended (Discover flow).
2. **Signature detection:** The last 200 characters are checked for signature indicators: common closings, user’s `signoffPhrase`, user name, email, university.
3. **Appending signature:** If no signature is detected and `user_profile` exists:
   - If `signoff_config` has a custom `signatureBlock`, signature = `signoff_phrase + "\n" + sig_block` (plain and HTML).
   - Else: `signoff_phrase` + name + university | Class of year + email (from `user_profile`).
   - If no profile: “Best regards”.
4. Appended signature is added to both plain `body` and `html_body` before building the MIME message and creating the draft.

So drafts always get a consistent sign-off: either from the template’s signoff/signature or from profile + default “Best,”.

---

## 9. Entry Points Summary

| Entry point | Template source | Template instructions | Signoff config |
|------------|------------------|------------------------|----------------|
| **Discover Contacts** (generate-and-draft) | Firestore `users/{uid}.emailTemplate` only | From stored purpose/style/custom | From stored signoffPhrase/signatureBlock |
| **Free / Pro / Prompt runs** | Request body override → else Firestore | From resolved purpose/style/custom | Override if has signoff fields → else Firestore |
| **Contact import / LinkedIn import / Hunter** | Not using template (or signoff_config=None in current code paths) | - | - |

---

## 10. File Reference

| Layer | File | Responsibility |
|-------|------|----------------|
| Frontend page | `connect-grow-hire/src/pages/EmailTemplatesPage.tsx` | Full template UI (purpose, custom, sign-off); save default; apply to search |
| Frontend modal | `connect-grow-hire/src/components/EmailTemplateModal.tsx` | In-context template edit (purpose, style, custom, sign-off); save / apply |
| Frontend API | `connect-grow-hire/src/services/api.ts` | `EmailTemplate` type, `getEmailTemplate`, `saveEmailTemplate`, `getEmailTemplatePresets`, `hasEmailTemplateValues` |
| Backend template API | `backend/app/routes/email_template.py` | GET/POST default template, GET presets; validation; Firestore merge |
| Backend presets | `backend/email_templates.py` | Purpose/style preset definitions; `get_template_instructions`, `get_available_presets` |
| Backend resolution | `backend/app/routes/runs.py` | `_resolve_email_template` (override + Firestore → instructions + signoff_config) |
| Backend generate-and-draft | `backend/app/routes/emails.py` | Load template from Firestore; call batch_generate_emails; append signature to drafts |
| Backend generation | `backend/app/services/reply_generation.py` | `batch_generate_emails`, `_build_signature_block_for_prompt`; inject template + signoff into prompt; resume line; fallbacks |

---

## 11. Sign-off Summary

- **Configured in UI:** Closing phrase (presets or custom, max 50 chars) and optional signature block (max 500 chars) on both the Email Templates page and the Email Template modal.
- **Stored:** In Firestore `users/{uid}.emailTemplate` as `signoffPhrase` and `signatureBlock`.
- **Used in generation:** `signoff_config` is passed into `batch_generate_emails`; `_build_signature_block_for_prompt` turns it into the exact SIGNATURE block in the LLM prompt so the model outputs that closing and block (or default “Best,” + [Full Name] + [University] | Class of [Year]).
- **Used in drafts:** When the generated body doesn’t already contain a signature, `emails.py` appends the same sign-off and signature (or profile-based default) to the plain and HTML body before creating the Gmail draft.

End-to-end, the email template system (purpose, style, custom instructions, and sign-off/signature) is fully wired from UI → API → Firestore → generation and draft creation.
