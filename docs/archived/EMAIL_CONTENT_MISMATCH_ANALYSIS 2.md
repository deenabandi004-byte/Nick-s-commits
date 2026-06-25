# Email Content Mismatch Investigation - Analysis & Fix

## Problem Summary

When users click the email icon in Contact Tracker, the Gmail compose window shows different content than the actual Gmail draft. Additionally, there's a hardcoded "Nicholas Wittig" signature appearing in drafts.

## Root Causes Identified

### 1. **Hardcoded Signature Bug** (CRITICAL)
**Location**: `backend/app/routes/emails.py` lines 179-183

```python
html_body += """
    <br><p>Warm regards,<br><b>Nicholas Wittig</b><br>
    USC Marshall School of Business<br>
    <a href='mailto:nwittig@usc.edu'>nwittig@usc.edu</a></p>
"""
```

This is a hardcoded signature that should be using the actual user's information from `user_profile`.

### 2. **Two Different Code Paths with Inconsistent Behavior**

#### Path 1: Contact Search (`runs.py` → `gmail_client.py`)
- **Flow**: `run_pro_tier_enhanced_final_with_text()` → `batch_generate_emails()` → `create_gmail_draft_for_user()`
- **Email Body**: Raw body from `batch_generate_emails()` (no signature added)
- **Gmail Draft**: Uses body as-is, adds HTML formatting, but **NO signature** in the HTML content
- **Firestore**: Saves raw `emailBody` without signature
- **Result**: Draft and Firestore content match (both have no signature)

#### Path 2: `/generate-and-draft` Endpoint (`emails.py`)
- **Flow**: `generate_and_draft()` → `batch_generate_emails()` → adds hardcoded signature → creates draft
- **Email Body**: Raw body from `batch_generate_emails()` + hardcoded "Nicholas Wittig" signature
- **Gmail Draft**: Has the hardcoded signature in HTML
- **Firestore**: Saves `emailBody` as the **raw body BEFORE signature** (line 291)
- **Result**: Draft has signature, Firestore doesn't → **MISMATCH**

### 3. **Signature Not Included in Firestore emailBody**

In `emails.py` line 291:
```python
"emailBody": body,  # This is the body BEFORE the HTML signature was added
```

The `body` variable is set at line 170 (before signature), but the signature is added to `html_body` at lines 179-183. The Firestore save uses `body`, not the final `html_body`.

## Code Flow Comparison

### Gmail Draft Creation

**Path 1 (runs.py):**
```
batch_generate_emails() 
  → returns {subject, body}
  → contact['emailSubject'] = subject
  → contact['emailBody'] = body  (no signature)
  → create_gmail_draft_for_user(contact, subject, body, user_info)
    → Uses body as-is, adds HTML formatting
    → NO signature added (user_info signature logic exists but not used in HTML)
```

**Path 2 (emails.py):**
```
batch_generate_emails()
  → returns {subject, body}
  → body += "\n\nFor context, I've attached my resume below."
  → html_body = convert_to_html(body)
  → html_body += hardcoded "Nicholas Wittig" signature  ❌ BUG
  → Creates draft with html_body (has signature)
  → Saves to Firestore: emailBody = body (NO signature)  ❌ MISMATCH
```

### Firestore emailBody Save

**Path 1 (runs.py):**
- Saves via `bulk_create_contacts()` endpoint
- `emailBody` = raw body from `batch_generate_emails()` (no signature)
- ✅ Matches what's in Gmail draft (both have no signature)

**Path 2 (emails.py):**
- Saves directly in `generate_and_draft()` function
- `emailBody` = raw body (no signature)
- ❌ Doesn't match Gmail draft (draft has signature, Firestore doesn't)

## Recommended Fixes

### Fix 1: Remove Hardcoded Signature and Use Dynamic User Info

**File**: `backend/app/routes/emails.py`

Replace lines 179-183 with:
```python
# Build signature from user_profile
signature_html = ""
if user_profile:
    user_name = user_profile.get('name', '')
    user_email = user_profile.get('email', '')
    user_university = user_profile.get('university', '')
    user_year = user_profile.get('year', '') or user_profile.get('graduationYear', '')
    
    signature_parts = []
    if user_name:
        signature_parts.append(f"<b>{user_name}</b>")
    if user_university:
        if user_year:
            signature_parts.append(f"{user_university} | Class of {user_year}")
        else:
            signature_parts.append(user_university)
    if user_email:
        signature_parts.append(f'<a href="mailto:{user_email}">{user_email}</a>')
    
    if signature_parts:
        signature_html = f"<br><p>Best,<br>{'<br>'.join(signature_parts)}</p>"
    else:
        signature_html = "<br><p>Best regards</p>"
else:
    signature_html = "<br><p>Best regards</p>"

html_body += signature_html
```

### Fix 2: Include Signature in Firestore emailBody

**File**: `backend/app/routes/emails.py`

After building the signature, also add it to the plain text `body` before saving:

```python
# After line 183 (after building signature_html)
# Also add signature to plain text body for Firestore
signature_text = ""
if user_profile:
    user_name = user_profile.get('name', '')
    user_email = user_profile.get('email', '')
    user_university = user_profile.get('university', '')
    user_year = user_profile.get('year', '') or user_profile.get('graduationYear', '')
    
    signature_lines = ["Best,"]
    if user_name:
        signature_lines.append(user_name)
    if user_university:
        if user_year:
            signature_lines.append(f"{user_university} | Class of {user_year}")
        else:
            signature_lines.append(user_university)
    if user_email:
        signature_lines.append(user_email)
    
    signature_text = "\n" + "\n".join(signature_lines)
else:
    signature_text = "\n\nBest regards"

body += signature_text  # Add to body before saving to Firestore
```

Then update line 291 to use this body:
```python
"emailBody": body,  # Now includes signature
```

### Fix 3: Make Both Code Paths Consistent

**Option A**: Add signature in `gmail_client.py` `create_gmail_draft_for_user()`
- Modify the function to append signature to email_body when user_info is provided
- This ensures both paths use the same signature logic

**Option B**: Remove signature from `emails.py` and let `gmail_client.py` handle it
- Remove signature logic from `emails.py`
- Ensure `gmail_client.py` properly adds signature when user_info is provided

**Recommended**: Option A - Add signature logic to `gmail_client.py` and use it in both paths.

## Files to Modify

1. **`backend/app/routes/emails.py`**
   - Remove hardcoded "Nicholas Wittig" signature (lines 179-183)
   - Add dynamic signature from user_profile
   - Include signature in plain text body before saving to Firestore

2. **`backend/app/services/gmail_client.py`** (Optional - for consistency)
   - Ensure signature is properly added when user_info is provided
   - Currently the signature logic exists but may not be working correctly

## Testing Checklist

After fixes:
1. ✅ Gmail draft should have correct user's signature (not "Nicholas Wittig")
2. ✅ Firestore `emailBody` should match Gmail draft content (including signature)
3. ✅ Email icon in Contact Tracker should show same content as Gmail draft
4. ✅ Both code paths (runs.py and emails.py) should produce identical results

## Current State Summary

| Code Path | Gmail Draft Has Signature? | Firestore emailBody Has Signature? | Match? |
|-----------|---------------------------|-----------------------------------|--------|
| runs.py → gmail_client.py | ❌ No | ❌ No | ✅ Yes |
| emails.py → generate_and_draft | ✅ Yes (wrong user) | ❌ No | ❌ No |

## After Fixes

| Code Path | Gmail Draft Has Signature? | Firestore emailBody Has Signature? | Match? |
|-----------|---------------------------|-----------------------------------|--------|
| runs.py → gmail_client.py | ✅ Yes (correct user) | ✅ Yes (correct user) | ✅ Yes |
| emails.py → generate_and_draft | ✅ Yes (correct user) | ✅ Yes (correct user) | ✅ Yes |

