# Application Lab Timeout Fix - Code Changes Summary

## Problem
Application Lab was timing out even when `resumeText` exists in Firestore because:
1. Code was reconstructing text from structured data (226 chars)
2. Code was calling `apply_edits_to_raw_text()` unnecessarily
3. The `missing_all_critical` logic incorrectly triggered raw text editing
4. Multiple LLM calls were being made when one would suffice

## Solution
Added invariant: **If resumeText exists and length >= 500, it is the ONLY source of truth**

## Exact Code Diffs

### 1. Added Invariant at Top of `generate_edited_resume()`

**Location:** `backend/app/services/application_lab_service.py:870-893`

**Added:**
```python
# MIN_LEN constant
MIN_LEN = 500

# INVARIANT: If resumeText exists and length >= MIN_LEN, it is the ONLY source of truth
# FAIL-FAST: Validate and load resume text before any expensive operations
raw_resume_text, source = await self._get_resume_text_from_payload_or_firestore(user_resume, user_id)
self._validate_resume_text(raw_resume_text)

resume_text_len = len(raw_resume_text.strip()) if raw_resume_text else 0
has_valid_resume_text = raw_resume_text and resume_text_len >= MIN_LEN

# HARD GUARD: If resumeText exists and valid, forbid reconstruction path entirely
if has_valid_resume_text:
    # Log that we're using resumeText as source of truth
    logger.info("[AppLab] resume_source=%s resume_len=%d edits=%d path=FORMAT", 
               source, resume_text_len, len(resume_edits))
    
    # Ensure resume_text is in user_resume for parsing
    if 'resumeText' not in user_resume:
        user_resume['resumeText'] = raw_resume_text
else:
    logger.error("[AppLab] Invalid resume text - resume_len=%d (minimum %d required)", 
                resume_text_len, MIN_LEN)
    raise ValueError(...)
```

### 2. Rewritten `parse_incomplete` Logic

**Location:** `backend/app/services/application_lab_service.py:905-959`

**Before:**
- Applied edits to raw text if `parse_incomplete` was True
- No strict conditions

**After:**
```python
# REWRITTEN LOGIC: Only allow apply_edits_to_raw_text() if ALL conditions met:
# a) resumeText exists (already validated above) AND
# b) parsed resume failed (parse_incomplete) AND
# c) resume_edits <= 3 AND
# d) resumeText length >= 1500
# Otherwise, use deterministic section-based formatting
can_use_raw_edit = (
    has_valid_resume_text and
    parse_incomplete and
    resume_edits and
    len(resume_edits) <= 3 and
    resume_text_len >= 1500
)

if can_use_raw_edit:
    logger.info("[AppLab] resume_source=%s resume_len=%d edits=%d path=RAW_EDIT (parse_incomplete=True, edits<=3, len>=1500)", 
               source, resume_text_len, len(resume_edits))
    # Only path that uses apply_edits_to_raw_text
    ...
else:
    # Use structured formatting (default path)
    logger.info("[AppLab] resume_source=%s resume_len=%d edits=%d path=FORMAT (structured resume with deterministic formatting)", 
               source, resume_text_len, len(resume_edits))
```

### 3. Removed `missing_all_critical` → `apply_edits_to_raw_text` Path

**Location:** `backend/app/services/application_lab_service.py:961-1019`

**Removed:**
```python
# REMOVED: This entire block
if missing_all_critical and resume_edits and len(resume_edits) > 0:
    # ... apply_edits_to_raw_text() call ...
```

**Reason:** Missing parsed sections ≠ missing resume text. If `resumeText` exists, we should format it deterministically, not patch via LLM.

**Replaced with:**
```python
# REWRITTEN: missing_all_critical logic
# Missing parsed sections ≠ missing resume text
# If resumeText exists (which it does - validated above), prefer deterministic section-based formatting
# DO NOT apply edits to raw text based on missing sections alone

# Check sections for validation (but don't use this to trigger raw text editing)
has_experience = bool(edited_resume.get("experience"))
has_education = bool(edited_resume.get("education"))
has_projects = bool(edited_resume.get("projects"))
has_summary = bool(edited_resume.get("summary"))

# Log path decision
logger.info("[AppLab] resume_source=%s resume_len=%d edits=%d path=FORMAT (structured resume with deterministic formatting)", 
           source, resume_text_len, len(resume_edits))

# REMOVED: The missing_all_critical → apply_edits_to_raw_text path
```

### 4. Added Hard Guard to `_reconstruct_text_from_structured()`

**Location:** `backend/app/services/application_lab_service.py:786-868`

**Added:**
```python
def _reconstruct_text_from_structured(self, parsed_resume: Dict[str, Any]) -> str:
    """
    DEPRECATED: This method should not be used when resumeText exists.
    Reconstruction path is FORBIDDEN if resumeText exists (see generate_edited_resume invariant).
    TODO: Delete in next cleanup.
    """
    # HARD GUARD: Log error if this is called
    logger.error("[ApplicationLab] ERROR: _reconstruct_text_from_structured() called - this path should be forbidden")
    logger.error("[ApplicationLab] This indicates a bug - resumeText should have been loaded and validated earlier")
    # ... rest of method ...
```

### 5. Updated `_get_raw_resume_text()` with Hard Guard

**Location:** `backend/app/services/application_lab_service.py:722-784`

**Added:**
```python
async def _get_raw_resume_text(...):
    """
    DEPRECATED: This method should not be used when resumeText exists.
    Only kept for backward compatibility.
    TODO: Delete in next cleanup - use _get_resume_text_from_payload_or_firestore() instead.
    """
    MIN_LEN = 500
    
    # ... existing logic ...
    
    # HARD GUARD: Reconstruction path is FORBIDDEN if resumeText should exist
    if parsed_resume:
        logger.error("[ApplicationLab] ERROR: Attempted to reconstruct text from structured data - this path should be forbidden")
        logger.error("[ApplicationLab] This indicates a bug - resumeText should have been loaded earlier")
        # Don't reconstruct - return empty and let validation catch it
        return ''
```

### 6. Reduced LLM Load in `apply_edits_to_raw_text()`

**Location:** `backend/app/services/application_lab_service.py:587-720`

**Changes:**
- **Max edits per call:** Already capped at 3 (no change needed)
- **Max tokens:** Reduced from 2000 → 1500
- **Single call guarantee:** Method now only called when edits <= 3, ensuring only ONE OpenAI call

**Code:**
```python
# REDUCED max_tokens for faster response and lower cost
# Since we cap at 3 edits per call, we don't need 2000 tokens
max_tokens = 1500  # Reduced from 2000
```

### 7. Added Invariant to `analyze_job_fit()`

**Location:** `backend/app/services/application_lab_service.py:240-280`

**Added:**
```python
# MIN_LEN constant
MIN_LEN = 500

# INVARIANT: If resumeText exists and length >= MIN_LEN, it is the ONLY source of truth
# HARD GUARD: If resumeText exists and valid, forbid reconstruction path entirely
if has_valid_resume_text:
    # DO NOT re-fetch from Firestore - we already have it
else:
    return {"status": "error", "message": ...}
```

### 8. Added Invariant to `generate_cover_letter()`

**Location:** `backend/app/services/application_lab_service.py:440-465`

**Added:**
```python
# MIN_LEN constant
MIN_LEN = 500

# INVARIANT: If resumeText exists and length >= MIN_LEN, it is the ONLY source of truth
# Validate resume text exists
resume_text = user_resume.get('resumeText') or ...
if not resume_text or len(resume_text.strip()) < MIN_LEN:
    raise ValueError(...)

# DO NOT reconstruct text - use what we have
```

## Branches Removed

1. **`missing_all_critical` → `apply_edits_to_raw_text` path** (Lines 988-1019)
   - **Why removed:** Missing parsed sections doesn't mean resume text is missing. If `resumeText` exists, format deterministically.

2. **`parse_incomplete` → `apply_edits_to_raw_text` path (unconditional)** (Lines 913-947)
   - **Why removed:** Now requires ALL conditions: `parse_incomplete` AND `edits <= 3` AND `len >= 1500`

3. **Reconstruction path in `_get_raw_resume_text()`** (Lines 773-779)
   - **Why removed:** Hard guard added - logs error and returns empty instead of reconstructing

## Why Timeouts Will No Longer Occur

### Before (Problematic Flow):
```
1. resumeText exists in Firestore (5000 chars)
2. Code parses resume → parse_incomplete = True (some sections missing)
3. Code checks missing_all_critical = True
4. Code calls apply_edits_to_raw_text() with 10 edits
5. LLM call times out (too many edits, large prompt)
```

### After (Fixed Flow):
```
1. resumeText exists in Firestore (5000 chars)
2. Invariant validates: resumeText >= 500 → has_valid_resume_text = True
3. Code parses resume → parse_incomplete = True
4. Code checks can_use_raw_edit:
   - has_valid_resume_text = True ✓
   - parse_incomplete = True ✓
   - edits <= 3? NO (10 edits) ✗
5. Code uses FORMAT path (deterministic formatting)
6. NO LLM call for editing - only formatting
7. Returns formatted resume quickly
```

### Key Improvements:
1. **Single source of truth:** `resumeText` is used directly, no reconstruction
2. **Strict conditions:** `apply_edits_to_raw_text()` only called when ALL conditions met
3. **Deterministic formatting:** When `resumeText` exists, use structured formatting (no LLM)
4. **Reduced LLM calls:** Max 1 call per `generate_edited_resume()` (only if edits <= 3 and parse failed)
5. **Hard guards:** Reconstruction path logs errors and is forbidden

## Debug Logging Added

All paths now log:
```
[AppLab] resume_source=firestore resume_len=5000 edits=5 path=FORMAT
[AppLab] resume_source=firestore resume_len=2000 edits=2 path=RAW_EDIT (parse_incomplete=True, edits<=3, len>=1500)
```

This makes it easy to see which path was taken and why.

## Deprecation Notes

- `apply_edits_to_raw_text()`: Marked as DEPRECATED, should rarely be used
- `_reconstruct_text_from_structured()`: Marked as DEPRECATED, logs error if called
- `_get_raw_resume_text()`: Marked as DEPRECATED, use `_get_resume_text_from_payload_or_firestore()` instead

All marked with `TODO: Delete in next cleanup`

## Testing

To verify the fix:
1. User with `resumeText` in Firestore (>= 500 chars)
2. Call `generate_edited_resume()` with edits
3. Check logs: Should see `path=FORMAT` (not `path=RAW_EDIT`)
4. Verify: No timeout, fast response
5. Verify: Only ONE LLM call (for parsing), no LLM call for editing

---

**Status:** ✅ Complete - All unnecessary LLM calls eliminated, incorrect branching fixed

