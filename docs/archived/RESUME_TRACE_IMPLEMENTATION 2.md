# Resume Trace and Normalization Confidence Implementation

## Summary

This implementation adds comprehensive resume tracing and normalization confidence scoring to ensure Application Lab always uses the canonical (original) resume and provides full visibility into resume processing.

## Root Causes Identified

1. **Derived Resumes Being Used**: System sometimes used "resume-company-position.pdf" files instead of original resume
2. **Payload Resume Override**: Client payload could override canonical Firestore resume
3. **Insufficient Tracing**: No visibility into which resume source was used at each step
4. **Missing Confidence Metrics**: No way to detect when resume processing had issues

## Implementation Details

### 1. Resume Trace Helper (`make_resume_trace`)

Creates structured trace dictionaries with:
- `uid_prefix`, `request_id`, `phase`
- `resume_text_source`: payload, firestore_resumeText, canonical_backfill, etc.
- `resume_text_len`, `resume_file_name`, `resume_url_present`
- `parsed_resume_keys`, `section_counts`
- Hash fingerprints (SHA256 first 30 chars) for detecting source switching

### 2. Normalization Confidence Score (`calculate_normalization_confidence`)

Calculates 0-100 score based on:
- **Section Presence** (weighted):
  - Experience: -25 if missing
  - Education: -15 if missing
  - Summary/Projects/Skills: -5 each if missing
- **Section Lengths**:
  - Experience < 300 chars: -10
  - Education < 150 chars: -5
- **Output/Input Ratio** (when edits applied):
  - Ratio < 0.6: -15

### 3. Canonical Resume Enforcement

`generate_edited_resume` now:
- **Rejects payload resume by default** (unless `_debug_allow_payload_resume=true`)
- **Always uses Firestore canonical resume** with precedence:
  1. `originalResumeText` / `originalResumeParsed`
  2. `resumeText` / `resumeParsed` (only if not derived)
  3. `originalResumeUrl` (for backfilling)
  4. `resumeUrl` (only if not derived)
- **Detects derived resumes** by filename patterns:
  - `resume-company-position.pdf`
  - `*-resume-*.pdf`
  - `resume*generated*.pdf`

### 4. Comprehensive Logging

Trace logs at all critical points:
1. **RESUME_TRACE_START**: Initial resume fetch
2. **RESUME_TRACE** (after_parsing): After Scout parsing
3. **RESUME_TRACE** (after_normalization): After normalization
4. **NORMALIZATION_SCORE**: Confidence score with breakdown
5. **RESUME_TRACE_END**: Final state with input/output lengths

## Files Changed

### `backend/app/services/application_lab_service.py`

1. Added helper functions:
   - `make_resume_trace()`: Creates structured trace dicts
   - `calculate_normalization_confidence()`: Computes 0-100 confidence score

2. Updated `_get_resume_text_from_payload_or_firestore()`:
   - Added `request_id` and `allow_payload_resume` parameters
   - Returns trace_info as third element
   - Logs RESUME_TRACE at fetch point

3. Updated `generate_edited_resume()`:
   - Enforces canonical resume only (rejects payload unless debug flag)
   - Adds RESUME_TRACE logs at each phase
   - Calculates and logs NORMALIZATION_SCORE
   - Includes trace info in response JSON

4. Enhanced Experience extraction logging:
   - Logs pattern used and surrounding snippets on failure

## Verification Checklist

To verify the implementation works correctly, check logs for:

- [ ] `resume_text_source=canonical_firestore` or `originalResumeText`
- [ ] `resume_file_name=DeenaSiddharthBandi_Resume.pdf` (or original filename, not derived)
- [ ] `resume_text_len` roughly matches original resume length (>2000 chars typical)
- [ ] `normalization_score >= 80`
- [ ] `section_counts` includes `experience` and `education` with counts > 0
- [ ] `output_length` >= 60% of `input_length` when edits applied
- [ ] No warnings about "missing_experience_section" or "output_too_short"

## Sample Log Output

```
[ApplicationLab] Enforcing canonical resume only (user_id=abc12345..., request_id=def67890)
[ApplicationLab] RESUME_TRACE_START request_id=def67890 {'uid_prefix': 'abc12345', 'request_id': 'def67890', 'phase': 'fetch_resume', 'resume_text_source': 'originalResumeText', 'resume_text_len': 5420, 'resume_file_name': 'DeenaSiddharthBandi_Resume.pdf', 'resume_url_present': True, 'resume_text_hash': 'a1b2c3d4e5f6...'}

[ApplicationLab] RESUME_TRACE {'uid_prefix': 'abc12345', 'request_id': 'def67890', 'phase': 'after_parsing', 'resume_text_source': 'originalResumeText', 'resume_text_len': 5420, 'parsed_resume_keys': ['summary', 'experience', 'education', 'projects', 'skills'], 'section_counts': {'experience': 3, 'education': 1, 'projects': 2, 'skills': 1, 'summary': 1}}

[ApplicationLab] RESUME_TRACE {'uid_prefix': 'abc12345', 'request_id': 'def67890', 'phase': 'after_normalization', 'resume_text_source': 'originalResumeText', 'resume_text_len': 5420, 'section_counts': {'experience': 3, 'education': 1, 'projects': 2, 'skills': 1, 'summary': 1}}

[ApplicationLab] NORMALIZATION_SCORE request_id=def67890 score=92 warnings=[] breakdown={'sections_present': {'summary': True, 'education': True, 'experience': True, 'projects': True, 'skills': True}, 'experience_length': 1847, 'education_length': 234}}

[ApplicationLab] RESUME_TRACE_END {'uid_prefix': 'abc12345', 'request_id': 'def67890', 'phase': 'after_formatting', 'input_length': 5420, 'output_length': 5123, 'normalization_score': 92}
```

## API Response Structure

When `DEBUG_RESUME_TRACE=true` (or always, currently), response includes:

```json
{
  "status": "ok",
  "edited_resume": {
    "formatted_text": "...",
    "structured": {...},
    "normalization": {
      "confidence": 0.92,
      "reasons": [],
      "metrics": {...}
    },
    "normalization_score": {
      "normalization_score": 92,
      "score_breakdown": {
        "sections_present": {...},
        "experience_length": 1847,
        "education_length": 234,
        "output_input_ratio": 0.94
      },
      "warnings": []
    },
    "resume_trace": {
      "request_id": "def67890",
      "resume_source": "originalResumeText",
      "resume_file_name": "DeenaSiddharthBandi_Resume.pdf",
      "input_length": 5420,
      "output_length": 5123
    }
  }
}
```

## Testing

To test:
1. Upload original resume via `/api/parse-resume`
2. Call `/api/application-lab/generate-edited-resume` with edits
3. Check logs for RESUME_TRACE entries
4. Verify `normalization_score >= 80` and all sections present
5. Verify output length is reasonable (>60% of input)

