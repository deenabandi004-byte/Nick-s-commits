# Resume Optimization Failure - Forensic Analysis

## Executive Summary

**Issue**: Application Lab produced a resume that collapsed from full sections (Education, Experience, Projects, Skills) into minimal structure (Skills + Achievements only), removing entire sections without user consent.

**Root Cause**: Incomplete resume parsing → formatting fallback to raw text → edits lost → output contains only parsed sections (Skills/Achievements) instead of full resume.

**Severity**: CRITICAL - Violates product intent (strengthen, not replace/truncate)

---

## 1) Resume Pipeline Map (Input → Output)

### Complete Flow

```
User Input (Resume PDF/Text)
    ↓
[POST /api/application-lab/analyze]
    ↓
ApplicationLabService.analyze_job_fit()
    ├─→ _parse_resume_structured_cached(user_resume)
    │     └─→ _parse_resume_structured(user_resume)
    │           └─→ GPT-4o-mini with parsing prompt
    │                 └─→ parsed_resume (structured JSON)
    │
    ├─→ _extract_job_requirements()
    ├─→ _match_requirements_to_resume()
    └─→ _generate_resume_edits()
          └─→ resume_edits[] (ResumeEdit objects)
    ↓
[POST /api/application-lab/generate-edited-resume]
    ↓
ApplicationLabService.generate_edited_resume()
    ├─→ _parse_resume_structured(user_resume) [re-parse]
    ├─→ apply_resume_edits(parsed_resume, resume_edits)
    │     └─→ edited_resume (structured with edits applied)
    └─→ format_resume_text(edited_resume, format_type)
          ├─→ Check: missing_all_critical?
          │     └─→ YES: Return raw_text (BYPASSES ALL EDITS) ❌
          └─→ NO: Format structured sections
                └─→ formatted_text output
```

### Critical Files & Functions

| File | Function | Line | Purpose |
|------|----------|------|---------|
| `backend/app/services/scout_service.py` | `_parse_resume_structured()` | 1902 | Parse raw resume text → structured JSON |
| `backend/app/services/scout_service.py` | `apply_resume_edits()` | 3309 | Apply edits to structured resume |
| `backend/app/services/scout_service.py` | `format_resume_text()` | 3506 | Format structured resume → text output |
| `backend/app/services/application_lab_service.py` | `generate_edited_resume()` | 455 | Orchestrate edit application & formatting |
| `backend/app/services/application_lab_service.py` | `apply_edits_to_raw_text()` | 365 | Apply edits directly to raw text (fallback) |

### Prompt Templates

**Resume Parsing Prompt** (`_parse_resume_structured`, line 1934):
```python
prompt = f"""Parse this resume into structured sections.

RESUME:
{resume_text[:8000]}

Return JSON with this structure:
{{
  "summary": "...",
  "experience": [...],
  "projects": [...],
  "education": [...],
  "skills": {...},
  "certifications": [...],
  "achievements": [...]
}}

Return ONLY valid JSON."""
```

**Model Configuration**:
- Model: `gpt-4o-mini` (PARSING_MODEL)
- Temperature: 0.2
- Max tokens: 2500
- Response format: `{"type": "json_object"}`
- Timeout: 20 seconds
- Input truncation: First 8000 chars only

---

## 2) Root Cause Analysis (Ranked)

### 🔴 PRIMARY CAUSE: Incomplete Parsing → Formatting Fallback → Edits Lost

**Location**: `format_resume_text()` lines 3521-3537

**Mechanism**:
1. Resume parsing produces incomplete structure (only Skills + Achievements)
2. `format_resume_text()` detects `missing_all_critical = True` (no experience/education/projects/summary)
3. Function returns `raw_text` immediately, **bypassing all edits**
4. Output contains only Skills + Achievements because that's what was parsed

**Evidence**:
```python
# Line 3528: Check for critical sections
missing_all_critical = not (has_experience or has_education or has_projects or has_summary)

if missing_all_critical:
    print(f"[Scout] WARNING: Resume missing all critical sections...")
    raw_text = parsed_resume.get('raw_text') or ...
    if raw_text and len(raw_text.strip()) > 100:
        return raw_text  # ❌ BYPASSES ALL EDITS
```

**Why parsing fails**:
- Prompt may not enforce section preservation
- Model may infer structure instead of extracting all sections
- 8000 char truncation may cut off sections
- Max tokens (2500) may be insufficient for full resume
- No validation that all input sections are preserved

### 🟡 SECONDARY CAUSE: Edit Application Logic Doesn't Handle Incomplete Parses

**Location**: `generate_edited_resume()` lines 492-517

**Mechanism**:
1. Code detects incomplete parse (`missing_all_critical = True`)
2. Attempts to use `apply_edits_to_raw_text()` fallback
3. **BUT**: Only if `resume_edits` exist AND `raw_resume_text` exists
4. If either condition fails, returns raw text without edits

**Evidence**:
```python
# Line 492-495: Fallback logic
if missing_all_critical and raw_resume_text and len(raw_resume_text.strip()) > 100:
    if resume_edits:  # ❌ Only applies edits if edits exist
        try:
            edited_raw_text = await self.apply_edits_to_raw_text(raw_resume_text, resume_edits)
```

**Gap**: If parsing fails completely, `resume_edits` may be empty or invalid, so fallback never triggers.

### 🟡 TERTIARY CAUSE: Parsing Prompt Doesn't Enforce Section Preservation

**Location**: `_parse_resume_structured()` lines 1934-1987

**Issues**:
1. Prompt says "Parse this resume" but doesn't say "preserve ALL sections"
2. No explicit instruction: "If input has Education section, output must have Education section"
3. Model may optimize/condense instead of preserving structure
4. No validation that output sections match input sections

**Missing Instructions**:
- "Preserve all sections present in the input resume"
- "If the input has an Education section, the output must include an Education section"
- "Do not remove or collapse sections"
- "Maintain the same section structure as the input"

---

## 3) Exact Code Locations to Change

### Fix 1: Add Section Preservation Validation in Parsing

**File**: `backend/app/services/scout_service.py`  
**Function**: `_parse_resume_structured()`  
**Line**: ~1987 (after prompt definition, before API call)

**Change**: Add explicit section preservation instructions to prompt:

```python
prompt = f"""Parse this resume into structured sections.

CRITICAL: Preserve ALL sections present in the input resume. If the input has:
- Education section → output MUST include Education section
- Experience section → output MUST include Experience section  
- Projects section → output MUST include Projects section
- Skills section → output MUST include Skills section

Do NOT remove, collapse, or omit any sections. Extract and preserve all content.

RESUME:
{resume_text[:8000]}

Return JSON with this structure:
[... existing structure ...]

Return ONLY valid JSON."""
```

### Fix 2: Add Post-Parse Validation

**File**: `backend/app/services/scout_service.py`  
**Function**: `_parse_resume_structured()`  
**Line**: ~2011 (after JSON parsing, before return)

**Change**: Validate that parsed structure contains expected sections:

```python
parsed = json.loads(result_text)

# VALIDATION: Check if parsing preserved critical sections
# If input had sections but output doesn't, parsing may be incomplete
input_has_education = any(term in resume_text.lower() for term in ['education', 'university', 'degree', 'bachelor', 'master'])
input_has_experience = any(term in resume_text.lower() for term in ['experience', 'work', 'intern', 'employment', 'position'])
input_has_projects = any(term in resume_text.lower() for term in ['project', 'portfolio', 'built', 'developed'])

output_has_education = bool(parsed.get('education'))
output_has_experience = bool(parsed.get('experience'))
output_has_projects = bool(parsed.get('projects'))

# If input had sections but output doesn't, mark as incomplete
if (input_has_education and not output_has_education) or \
   (input_has_experience and not output_has_experience) or \
   (input_has_projects and not output_has_projects):
    print(f"[Scout] WARNING: Parsing may be incomplete - input had sections not in output")
    # Still return parsed, but mark for fallback handling

# Always preserve raw_text
if resume_text:
    parsed["raw_text"] = resume_text
return parsed
```

### Fix 3: Fix Formatting Fallback to Preserve Edits

**File**: `backend/app/services/scout_service.py`  
**Function**: `format_resume_text()`  
**Line**: 3530-3537 (fallback logic)

**Change**: Don't return raw text if edits were applied. Check if edits exist:

```python
# Check upfront if we're missing critical sections
has_experience = bool(parsed_resume.get("experience"))
has_education = bool(parsed_resume.get("education"))
has_projects = bool(parsed_resume.get("projects"))
has_summary = bool(parsed_resume.get("summary"))

missing_all_critical = not (has_experience or has_education or has_projects or has_summary)

# FIX: Don't fallback to raw_text if we have edits applied
# Check if resume has been edited (indicated by presence of edits metadata or structured content)
has_edits_applied = parsed_resume.get("_edits_applied", False) or \
                    any(key.startswith("_edit_") for key in parsed_resume.keys())

if missing_all_critical and not has_edits_applied:
    # Only fallback if no edits were applied
    raw_text = parsed_resume.get('raw_text') or parsed_resume.get('resumeText') or parsed_resume.get('rawText')
    if raw_text and len(raw_text.strip()) > 100:
        print(f"[Scout] Returning raw text ({len(raw_text)} chars) instead of formatting incomplete parse")
        return raw_text
```

**Better Fix**: Remove fallback entirely from `format_resume_text()` and handle incomplete parsing at call site.

### Fix 4: Ensure Edit Application Always Uses Raw Text Fallback

**File**: `backend/app/services/application_lab_service.py`  
**Function**: `generate_edited_resume()`  
**Line**: 492-517 (incomplete parse handling)

**Change**: Always attempt to apply edits to raw text if parsing incomplete:

```python
# Check if parsed resume is complete before formatting
has_experience = bool(edited_resume.get("experience"))
has_education = bool(edited_resume.get("education"))
has_projects = bool(edited_resume.get("projects"))
has_summary = bool(edited_resume.get("summary"))
missing_all_critical = not (has_experience or has_education or has_projects or has_summary)

# FIX: Always apply edits to raw text if parsing incomplete AND we have edits
if missing_all_critical and raw_resume_text and len(raw_resume_text.strip()) > 100:
    if resume_edits and len(resume_edits) > 0:
        # Apply edits directly to raw text using LLM
        print(f"[ApplicationLab] Resume parse incomplete - applying {len(resume_edits)} edits to raw text via LLM")
        try:
            edited_raw_text = await self.apply_edits_to_raw_text(raw_resume_text, resume_edits)
            result["formatted_text"] = edited_raw_text
            result["_edits_applied"] = True  # Mark that edits were applied
            print(f"[ApplicationLab] Successfully applied {len(resume_edits)} edits to raw text")
            return result  # Return early, don't try to format incomplete structure
        except Exception as e:
            # Fail loudly - do NOT silently drop edits
            error_msg = f"Failed to apply edits to raw text: {str(e)}"
            print(f"[ApplicationLab] ERROR: {error_msg}")
            raise ValueError(error_msg)
    else:
        # No edits to apply, but parsing incomplete - return raw text with warning
        print(f"[ApplicationLab] WARNING: Resume parse incomplete but no edits to apply")
        result["formatted_text"] = raw_resume_text
        result["_parse_incomplete"] = True
        return result
```

---

## 4) Proposed Minimal Fixes (v1 Safe)

### Fix A: Prompt Enhancement (No Code Changes, Just Prompt)

**File**: `backend/app/services/scout_service.py`  
**Function**: `_parse_resume_structured()`  
**Lines**: 1934-1987

**Change**: Add section preservation instructions to prompt:

```python
prompt = f"""Parse this resume into structured sections.

CRITICAL INSTRUCTIONS:
1. Preserve ALL sections present in the input resume
2. If input has Education → output MUST have Education
3. If input has Experience → output MUST have Experience
4. If input has Projects → output MUST have Projects
5. Do NOT remove, collapse, or omit any sections
6. Extract and preserve all content from each section

RESUME:
{resume_text[:8000]}

[... rest of prompt ...]
```

**Impact**: Low risk, high value. Forces model to preserve structure.

### Fix B: Formatting Guardrail (Prevent Raw Text Fallback When Edits Exist)

**File**: `backend/app/services/scout_service.py`  
**Function**: `format_resume_text()`  
**Lines**: 3521-3537

**Change**: Add check to prevent fallback if structured content exists (even if incomplete):

```python
# Check upfront if we're missing critical sections
has_experience = bool(parsed_resume.get("experience"))
has_education = bool(parsed_resume.get("education"))
has_projects = bool(parsed_resume.get("projects"))
has_summary = bool(parsed_resume.get("summary"))
has_skills = bool(parsed_resume.get("skills"))
has_achievements = bool(parsed_resume.get("achievements"))

missing_all_critical = not (has_experience or has_education or has_projects or has_summary)

# FIX: Only fallback if we have NO structured content at all
# If we have Skills/Achievements but missing critical sections, still format what we have
has_any_structured = has_experience or has_education or has_projects or has_summary or has_skills or has_achievements

if missing_all_critical and not has_any_structured:
    # Only fallback if completely empty
    raw_text = parsed_resume.get('raw_text') or parsed_resume.get('resumeText') or parsed_resume.get('rawText')
    if raw_text and len(raw_text.strip()) > 100:
        print(f"[Scout] Returning raw text ({len(raw_text)} chars) - no structured content")
        return raw_text
```

**Impact**: Prevents output from collapsing to Skills + Achievements only. Still formats what was parsed.

### Fix C: Always Apply Edits to Raw Text When Parsing Incomplete

**File**: `backend/app/services/application_lab_service.py`  
**Function**: `generate_edited_resume()`  
**Lines**: 492-517

**Change**: Ensure edits are always applied, even if parsing incomplete:

```python
# Check if parsed resume is complete before formatting
has_experience = bool(edited_resume.get("experience"))
has_education = bool(edited_resume.get("education"))
has_projects = bool(edited_resume.get("projects"))
has_summary = bool(edited_resume.get("summary"))
missing_all_critical = not (has_experience or has_education or has_projects or has_summary)

# FIX: If parsing incomplete AND we have edits, ALWAYS apply to raw text
if missing_all_critical and raw_resume_text and len(raw_resume_text.strip()) > 100:
    if resume_edits and len(resume_edits) > 0:
        print(f"[ApplicationLab] Parse incomplete - applying {len(resume_edits)} edits to raw text")
        try:
            edited_raw_text = await self.apply_edits_to_raw_text(raw_resume_text, resume_edits)
            result["formatted_text"] = edited_raw_text
            result["format"] = format_type if format_type != "pdf" else "plain"  # Skip PDF if incomplete
            return result  # Return early - don't format incomplete structure
        except Exception as e:
            raise ValueError(f"Failed to apply edits: {str(e)}")
```

**Impact**: Ensures edits are never lost, even if parsing fails.

---

## 5) Automated Guardrails to Add Immediately

### Guardrail 1: Section Count Validation

**Location**: `format_resume_text()` before formatting

**Check**:
```python
def _validate_section_preservation(input_text: str, parsed_resume: Dict[str, Any]) -> bool:
    """Check if parsing preserved expected sections."""
    input_sections = []
    if any(term in input_text.lower() for term in ['education', 'university', 'degree']):
        input_sections.append('education')
    if any(term in input_text.lower() for term in ['experience', 'work', 'employment']):
        input_sections.append('experience')
    if any(term in input_text.lower() for term in ['project', 'portfolio']):
        input_sections.append('projects')
    
    output_sections = []
    if parsed_resume.get('education'):
        output_sections.append('education')
    if parsed_resume.get('experience'):
        output_sections.append('experience')
    if parsed_resume.get('projects'):
        output_sections.append('projects')
    
    # If input had sections but output doesn't, parsing incomplete
    missing = set(input_sections) - set(output_sections)
    if missing:
        print(f"[Scout] WARNING: Parsing incomplete - missing sections: {missing}")
        return False
    return True
```

**Action**: If validation fails, mark resume as `_parse_incomplete = True` and use raw text fallback with edits.

### Guardrail 2: Output Length Validation

**Location**: `format_resume_text()` after formatting

**Check**:
```python
# After formatting, validate output length
formatted_length = len(result.strip())
input_length = len((parsed_resume.get('raw_text') or '').strip())

# If formatted output is < 30% of input, likely incomplete
if input_length > 0 and formatted_length < (input_length * 0.3):
    print(f"[Scout] WARNING: Formatted output too short ({formatted_length} vs {input_length} input)")
    # Return raw text with edits applied instead
    if parsed_resume.get('raw_text'):
        return parsed_resume['raw_text']
```

**Action**: If output is suspiciously short, fallback to raw text.

### Guardrail 3: Section Presence Check Before Output

**Location**: `generate_edited_resume()` before returning

**Check**:
```python
# Before returning, validate output has expected sections
if format_type == "plain" or format_type == "markdown":
    formatted = result.get("formatted_text", "")
    
    # Check if output has critical sections
    has_education_in_output = any(term in formatted.lower() for term in ['education', 'university', 'degree'])
    has_experience_in_output = any(term in formatted.lower() for term in ['experience', 'work', 'employment'])
    
    # If input had these but output doesn't, block output
    input_has_education = any(term in raw_resume_text.lower() for term in ['education', 'university', 'degree'])
    input_has_experience = any(term in raw_resume_text.lower() for term in ['experience', 'work', 'employment'])
    
    if input_has_education and not has_education_in_output:
        raise ValueError("Output missing Education section - blocking to prevent data loss")
    if input_has_experience and not has_experience_in_output:
        raise ValueError("Output missing Experience section - blocking to prevent data loss")
```

**Action**: Block output if critical sections are missing (fail loudly instead of returning bad output).

### Guardrail 4: Edit Application Success Check

**Location**: `apply_edits_to_raw_text()` after applying edits

**Check**:
```python
# After applying edits, validate edits were actually applied
edited_text = completion.choices[0].message.content.strip()

# Check if any edit keywords appear in output
edit_keywords = []
for edit in resume_edits:
    if edit.suggested_content:
        # Extract key terms from suggested content
        keywords = [w for w in edit.suggested_content.split() if len(w) > 4]
        edit_keywords.extend(keywords[:3])  # Top 3 keywords per edit

# Verify at least some edit keywords appear in output
matches = sum(1 for kw in edit_keywords if kw.lower() in edited_text.lower())
if matches < len(resume_edits) * 0.3:  # At least 30% of edits should be visible
    print(f"[ApplicationLab] WARNING: Only {matches}/{len(edit_keywords)} edit keywords found in output")
    # Don't fail, but log warning
```

**Action**: Log warning if edits don't appear to be applied (helps debug).

---

## Summary of Recommended Actions

### Immediate (Fix Today)

1. ✅ **Fix A**: Add section preservation instructions to parsing prompt
2. ✅ **Fix C**: Ensure edits always applied to raw text when parsing incomplete
3. ✅ **Guardrail 3**: Block output if critical sections missing

### Short-term (This Week)

4. **Fix B**: Improve formatting fallback logic
5. **Guardrail 1**: Add section count validation
6. **Guardrail 2**: Add output length validation

### Testing Required

- Test with resume that has all sections (Education, Experience, Projects, Skills)
- Verify output preserves all sections
- Verify edits are applied correctly
- Test with incomplete parsing scenario
- Verify fallback to raw text + edits works

---

## Notes

- **No new features**: All fixes are prompt/validation changes
- **Backward compatible**: Existing functionality preserved
- **No UI changes**: All fixes are backend-only
- **Edit-only mode**: Fixes ensure edits are applied, not regeneration

