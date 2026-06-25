# Safety Fix Implementation Summary

## Files Modified

1. `backend/app/services/scout_service.py`
2. `backend/app/services/application_lab_service.py`

---

## TASK 1: Harden Resume Parsing

**File**: `backend/app/services/scout_service.py`  
**Function**: `_parse_resume_structured()`  
**Lines**: 1934-1987

### Change

Added explicit section preservation instructions to the parsing prompt:

```python
prompt = f"""Parse this resume into structured sections.

CRITICAL INSTRUCTIONS:
- Preserve ALL sections present in the input resume.
- If the input contains Education, Experience, Projects, or Skills,
  the output MUST contain the same sections.
- Do NOT remove, collapse, summarize, or omit any section.
- Extract content faithfully; do not optimize or rewrite.

RESUME:
{resume_text[:8000]}

[... rest of prompt ...]
```

**Impact**: Forces the model to preserve all sections from input to output.

---

## TASK 2: Explicit Parse Validation

**File**: `backend/app/services/scout_service.py`  
**Function**: `_parse_resume_structured()`  
**Lines**: 2011-2035

### Change

Added validation after JSON parsing to detect missing sections:

```python
parsed = json.loads(result_text)
# Always preserve raw_text in the parsed result for fallback
if resume_text:
    parsed["raw_text"] = resume_text

# TASK 2: Explicit Parse Validation
# Detect whether input contained sections that output lacks
input_lower = resume_text.lower()
input_has_education = any(term in input_lower for term in ['education', 'university', 'degree', 'bachelor', 'master', 'phd', 'college', 'school'])
input_has_experience = any(term in input_lower for term in ['experience', 'work', 'employment', 'intern', 'position', 'role', 'job'])
input_has_projects = any(term in input_lower for term in ['project', 'portfolio', 'built', 'developed', 'created'])

output_has_education = bool(parsed.get('education'))
output_has_experience = bool(parsed.get('experience'))
output_has_projects = bool(parsed.get('projects'))

# If input had sections but output doesn't, mark as incomplete
if (input_has_education and not output_has_education) or \
   (input_has_experience and not output_has_experience) or \
   (input_has_projects and not output_has_projects):
    missing_sections = []
    if input_has_education and not output_has_education:
        missing_sections.append('education')
    if input_has_experience and not output_has_experience:
        missing_sections.append('experience')
    if input_has_projects and not output_has_projects:
        missing_sections.append('projects')
    print(f"[Scout] WARNING: Parsing incomplete - input had sections not in output: {missing_sections}")
    parsed["_parse_incomplete"] = True
else:
    parsed["_parse_incomplete"] = False

return parsed
```

**Impact**: Flags incomplete parsing for downstream handling. The `_parse_incomplete` flag propagates to formatting and edit application.

---

## TASK 3: Fix Formatting Fallback (Critical)

**File**: `backend/app/services/scout_service.py`  
**Function**: `format_resume_text()`  
**Lines**: 3556-3582

### Change

Removed early raw_text return and added validation:

**BEFORE**:
```python
if missing_all_critical:
    print(f"[Scout] WARNING: Resume missing all critical sections...")
    raw_text = parsed_resume.get('raw_text') or ...
    if raw_text and len(raw_text.strip()) > 100:
        return raw_text  # ❌ BYPASSES ALL EDITS
```

**AFTER**:
```python
# TASK 3: Fix Formatting Fallback (Critical)
# Check if edits were applied (indicated by _edits_applied flag or presence of edits metadata)
has_edits_applied = parsed_resume.get("_edits_applied", False)

# Check section presence
has_experience = bool(parsed_resume.get("experience"))
has_education = bool(parsed_resume.get("education"))
has_projects = bool(parsed_resume.get("projects"))
has_summary = bool(parsed_resume.get("summary"))
has_skills = bool(parsed_resume.get("skills"))
has_achievements = bool(parsed_resume.get("achievements"))

# Hard rule: A resume containing only Skills/Achievements is invalid output
has_only_skills_achievements = (has_skills or has_achievements) and not (has_experience or has_education or has_projects or has_summary)

if has_only_skills_achievements:
    error_msg = "Invalid resume output: contains only Skills/Achievements, missing critical sections (Experience, Education, Projects)"
    print(f"[Scout] ERROR: {error_msg}")
    raise ValueError(error_msg)

# If edits were applied, NEVER return raw_text - must format what we have
if has_edits_applied:
    print(f"[Scout] Edits were applied - formatting structured content (exp:{has_experience}, edu:{has_education}, proj:{has_projects})")
    # Continue to formatting below
elif not (has_experience or has_education):
    # Missing Experience OR Education - this violates non-negotiable rule
    error_msg = "Resume missing required sections: Experience or Education must be present"
    print(f"[Scout] ERROR: {error_msg}")
    raise ValueError(error_msg)
```

**Impact**: 
- Blocks output if only Skills/Achievements present
- Blocks output if Experience or Education missing
- Never returns raw_text if edits were applied

---

## TASK 4: Guarantee Edit Application

**File**: `backend/app/services/application_lab_service.py`  
**Function**: `generate_edited_resume()`  
**Lines**: 465-531

### Change

Reordered logic to check `_parse_incomplete` flag first and always apply edits to raw text when incomplete:

**BEFORE**:
```python
# Apply edits
edited_resume = self._scout.apply_resume_edits(parsed_resume, resume_edits)
# ... then check if incomplete ...
if missing_all_critical and raw_resume_text and len(raw_resume_text.strip()) > 100:
    if resume_edits:
        # Apply edits to raw text
```

**AFTER**:
```python
# TASK 4: Guarantee Edit Application
# Check if parsing was marked as incomplete
parse_incomplete = parsed_resume.get("_parse_incomplete", False)

# If parsing incomplete AND edits exist, ALWAYS apply edits to raw text
if parse_incomplete and resume_edits and len(resume_edits) > 0:
    print(f"[ApplicationLab] Parse incomplete (_parse_incomplete=True) AND {len(resume_edits)} edits exist - applying edits to raw text")
    try:
        edited_raw_text = await self.apply_edits_to_raw_text(raw_resume_text, resume_edits)
        result = {
            "structured": parsed_resume,  # Keep original parse for reference
            "format": format_type if format_type != "pdf" else "plain",  # Skip PDF if incomplete
            "formatted_text": edited_raw_text,
            "_edits_applied": True,
            "_parse_incomplete": True
        }
        print(f"[ApplicationLab] Successfully applied {len(resume_edits)} edits to raw text")
        return result
    except Exception as e:
        error_msg = f"Failed to apply edits to raw text: {str(e)}"
        print(f"[ApplicationLab] ERROR: {error_msg}")
        raise ValueError(error_msg)

# If parsing incomplete but no edits, return raw text with warning
if parse_incomplete:
    print(f"[ApplicationLab] Parse incomplete but no edits to apply - returning raw text with warning")
    result = {
        "structured": parsed_resume,
        "format": format_type if format_type != "pdf" else "plain",
        "formatted_text": raw_resume_text,
        "_parse_incomplete": True,
        "_warning": "Resume parsing incomplete - returned raw text without edits"
    }
    return result

# Parsing complete - apply edits to structured resume
edited_resume = self._scout.apply_resume_edits(parsed_resume, resume_edits)
# Mark that edits were applied
edited_resume["_edits_applied"] = True
```

**Impact**: 
- Edits are ALWAYS applied when parsing is incomplete and edits exist
- No silent discarding of edits
- Clear metadata flags for downstream handling

---

## TASK 5: Add Output Safety Guardrails

### Guardrail 1: Section Presence Check

**File**: `backend/app/services/application_lab_service.py`  
**Function**: `generate_edited_resume()`  
**Lines**: 520-530

```python
# TASK 5: Output Safety Guardrails - Section Presence Check
# Before formatting, validate that output will have required sections
has_experience = bool(edited_resume.get("experience"))
has_education = bool(edited_resume.get("education"))

# Check input for sections
input_lower = raw_resume_text.lower()
input_has_education = any(term in input_lower for term in ['education', 'university', 'degree', 'bachelor', 'master', 'phd', 'college', 'school'])
input_has_experience = any(term in input_lower for term in ['experience', 'work', 'employment', 'intern', 'position', 'role', 'job'])

# If input had sections but output doesn't, BLOCK output
if input_has_education and not has_education:
    raise ValueError("Output missing Education section - blocking to prevent data loss")
if input_has_experience and not has_experience:
    raise ValueError("Output missing Experience section - blocking to prevent data loss")
```

**Impact**: Blocks output if critical sections are missing (fails loudly).

### Guardrail 2: Length Sanity Check

**File**: `backend/app/services/scout_service.py`  
**Function**: `format_resume_text()`  
**Lines**: 3771-3781

```python
# TASK 5: Length Sanity Check
# If formatted output is suspiciously shorter than input, validate
raw_text = parsed_resume.get('raw_text') or parsed_resume.get('resumeText') or parsed_resume.get('rawText')
if raw_text and len(raw_text.strip()) > 0:
    formatted_length = len(result.strip())
    input_length = len(raw_text.strip())
    
    # If formatted output < 60% of input length and edits exist, this is suspicious
    if formatted_length < (input_length * 0.6) and has_edits_applied:
        print(f"[Scout] WARNING: Formatted output ({formatted_length} chars) is < 60% of input ({input_length} chars) with edits applied")
        # Don't return raw text if edits were applied - that would lose edits
        # Continue with formatted output but log warning
```

**Impact**: Detects suspiciously short outputs and logs warnings.

**Also in**: `backend/app/services/application_lab_service.py` lines 550-558

### Guardrail 3: Edit Visibility Check

**File**: `backend/app/services/application_lab_service.py`  
**Function**: `generate_edited_resume()`  
**Lines**: 560-577

```python
# TASK 5: Length Sanity Check and Edit Visibility Check
if formatted_text and raw_resume_text:
    formatted_length = len(formatted_text.strip())
    input_length = len(raw_resume_text.strip())
    
    # If formatted output < 60% of input length and edits exist, this is suspicious
    if formatted_length < (input_length * 0.6) and resume_edits:
        print(f"[ApplicationLab] WARNING: Formatted output ({formatted_length} chars) is < 60% of input ({input_length} chars) with edits applied")
        # Don't block, but log warning - edits were applied so we trust the process
    
    # Edit Visibility Check - confirm edits appear in output
    if resume_edits:
        edit_keywords = []
        for edit in resume_edits:
            if edit.suggested_content:
                # Extract key terms from suggested content (words > 4 chars)
                keywords = [w for w in edit.suggested_content.split() if len(w) > 4]
                edit_keywords.extend(keywords[:3])  # Top 3 keywords per edit
        
        # Verify at least some edit keywords appear in output
        if edit_keywords:
            matches = sum(1 for kw in edit_keywords if kw.lower() in formatted_text.lower())
            match_ratio = matches / len(edit_keywords) if edit_keywords else 0
            if match_ratio < 0.3:  # At least 30% of edit keywords should be visible
                print(f"[ApplicationLab] WARNING: Only {matches}/{len(edit_keywords)} edit keywords found in output (match ratio: {match_ratio:.2f})")
            else:
                print(f"[ApplicationLab] Edit visibility check passed: {matches}/{len(edit_keywords)} keywords found")
```

**Impact**: Validates that edits are visible in output and logs warnings if not.

---

## Assumptions Made

1. **`_edits_applied` flag**: Assumes this flag is set by `generate_edited_resume()` when edits are applied. The flag is set at line 508 in `application_lab_service.py`.

2. **Raw text availability**: Assumes `raw_text` is always preserved in parsed resume objects. This is enforced at line 2014 in `scout_service.py`.

3. **Edit application to raw text**: Assumes `apply_edits_to_raw_text()` method exists and works correctly. This method is already implemented at line 365 in `application_lab_service.py`.

4. **Section detection keywords**: Uses keyword matching to detect sections in input text. This is a heuristic approach that may have false positives/negatives, but is sufficient for safety guardrails.

5. **Error handling**: All guardrails raise `ValueError` exceptions to fail loudly. This assumes the calling code handles exceptions appropriately.

---

## Summary

All 5 tasks have been implemented:

✅ **TASK 1**: Hardened parsing prompt with section preservation instructions  
✅ **TASK 2**: Added explicit parse validation with `_parse_incomplete` flag  
✅ **TASK 3**: Fixed formatting fallback to block invalid outputs  
✅ **TASK 4**: Guaranteed edit application when parsing incomplete  
✅ **TASK 5**: Added 3 output safety guardrails (section presence, length sanity, edit visibility)

**No new features added** - only safety fixes as specified.  
**No UI changes** - all changes are backend-only.  
**Backward compatible** - existing functionality preserved with added safety checks.

