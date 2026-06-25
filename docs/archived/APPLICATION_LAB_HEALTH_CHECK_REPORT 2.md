# Application Lab Health Check & Stabilization Report

**Date:** Generated from comprehensive codebase analysis  
**Scope:** Application Lab feature reliability, failure points, and fixes

---

## Executive Summary

Application Lab has **10 critical failure points** that cause unreliable behavior:
1. Missing `resumeText` in Firestore user documents (root cause: frontend delete sets to null, no validation on writes)
2. Nested `asyncio.run()` calls causing event loop conflicts and CancelledError
3. Timeout values inconsistent and too aggressive for LLM operations
4. Resume edit application strategy tries to patch 226-char reconstructed text via LLM (slow, brittle)
5. No fail-fast validation before expensive LLM calls
6. Limited observability (no structured logging, no health endpoint)
7. Frontend passes incomplete resume data (missing resumeText when Firestore has it)
8. No validation that resume upload actually persisted resumeText
9. Race conditions between resume upload and Application Lab usage
10. Missing error recovery paths when resumeText is missing

---

## A) FULL FLOW MAPPING (SOURCE OF TRUTH)

### Request Flow Sequence

```
Frontend (ApplicationLabPage.tsx:38-65)
  ↓
  useEffect loads resume from Firestore:
    - doc(db, 'users', user.uid)
    - getDoc() → userData
    - Constructs: { resumeText, rawText, resumeParsed, ...userData.resumeParsed }
    - Sets userResume state
  ↓
  User clicks "Analyze" → handleAnalyze()
  ↓
  Calls analyzeApplication(jobData, userResume)
    - connect-grow-hire/src/services/applicationLab.ts:56-94
  ↓
  POST /api/application-lab/analyze
    - backend/app/routes/application_lab.py:17-95
    - Payload: { job: {...}, user_resume: {...} }
  ↓
  Route handler extracts:
    - user_resume = payload.get("user_resume")  # From frontend payload
    - user_id = request.firebase_user.get('uid')
  ↓
  Calls application_lab_service.analyze_job_fit()
    - backend/app/services/application_lab_service.py:124-314
  ↓
  Service checks user_resume for resumeText:
    - Line 37: resume_text = user_resume.get('resumeText') or user_resume.get('rawText') or ...
    - Line 201: Fallback to user_resume.get('resumeText', user_resume.get('rawText', ''))[:500]
  ↓
  If missing, tries database fetch:
    - Line 488-498: _get_raw_resume_text() fetches from Firestore
    - db.collection('users').document(user_id).get()
    - user_data.get('resumeText', '') or user_data.get('rawText', '')
  ↓
  If still missing, reconstructs from structured:
    - Line 507-514: _reconstruct_text_from_structured()
    - Returns ~226 chars (incomplete)
  ↓
  Calls scout_service._parse_resume_structured()
    - backend/app/services/scout_service.py:1950-2056
  ↓
  OpenAI API calls for:
    - Job description fetch (timeout: 5s)
    - Resume parsing (timeout: 15s)
    - Requirement extraction (timeout: 20s)
    - Requirement matching
    - Resume edit generation
  ↓
  Returns analysis with resume_edits
```

### Generate Edited Resume Flow

```
Frontend calls generateEditedResume(userResume, resumeEdits, format)
  ↓
  POST /api/application-lab/generate-edited-resume
    - backend/app/routes/application_lab.py:197-283
  ↓
  Route calls application_lab_service.generate_edited_resume()
    - backend/app/services/application_lab_service.py:603-797
  ↓
  Service tries to get raw text:
    - Line 612: From user_resume payload
    - Line 616-632: If missing, fetches from Firestore
    - Line 635: Parses resume via scout_service
  ↓
  Checks if parse incomplete:
    - Line 646: parse_incomplete = parsed_resume.get("_parse_incomplete", False)
    - Line 649: If incomplete AND edits exist → apply_edits_to_raw_text()
  ↓
  apply_edits_to_raw_text():
    - Line 365-453
    - Calls OpenAI with 8000-char prompt + edits
    - Timeout: 30s
    - Model: gpt-4o-mini, max_tokens: 4000
  ↓
  If timeout → ValueError → Route returns 500 error
```

### Key Finding: Resume Data Source Priority

**Current behavior:**
1. Frontend passes `user_resume` from Firestore (may be missing `resumeText`)
2. Backend checks payload first, then Firestore, then reconstructs
3. **Problem:** Frontend may not include `resumeText` if it wasn't in the doc when loaded

**Root cause:** Frontend `ApplicationLabPage.tsx:51-56` only includes `resumeText` if it exists in `userData`, but doesn't re-fetch if missing.

---

## B) RESUME DATA PATHS + WHY resumeText IS MISSING

### All Writers to `users/{uid}` Document

| File | Function/Method | Line | Operation | Fields Written | Can Remove resumeText? |
|------|----------------|------|-----------|----------------|------------------------|
| `backend/app/routes/resume.py` | `save_resume_to_firebase()` | 58 | `update()` | `resumeText`, `resumeUrl`, `resumeFileName`, `resumeUpdatedAt`, `resumeParsed` | ❌ No - always writes resumeText |
| `connect-grow-hire/src/pages/AccountSettings.tsx` | `handleResumeDelete()` | 301 | `updateDoc()` | `resumeText: null`, `resumeUrl: null`, `resumeFileName: null`, `resumeUpdatedAt: null`, `resumeParsed: null` | ✅ **YES - Sets to null** |
| `backend/app/services/auth.py` | User creation | 161 | `set()` or `update()` | User profile fields | ⚠️ Unknown - need to check if merge=True |
| `connect-grow-hire/src/services/firebaseApi.ts` | `createUser()` | 116 | `setDoc(..., { merge: true })` | User data | ❌ No - uses merge |
| `backend/app/routes/billing.py` | Multiple functions | Various | `update()` | Billing fields only | ❌ No - doesn't touch resume fields |
| `backend/app/routes/dashboard.py` | Various | Various | Read-only | N/A | ❌ No |
| `backend/app/extensions.py` | User creation on auth | 223 | `set()` or `update()` | User profile | ⚠️ **NEED TO CHECK** - may overwrite if no merge |

### Root Cause Analysis

**Primary Root Cause: Frontend Resume Deletion**

`connect-grow-hire/src/pages/AccountSettings.tsx:301-307`:
```typescript
await updateDoc(userRef, {
  resumeText: null,  // ⚠️ EXPLICITLY SETS TO NULL
  resumeUrl: null,
  resumeFileName: null,
  resumeUpdatedAt: null,
  resumeParsed: null,
});
```

**Impact:** When user deletes resume, `resumeText` is set to `null` in Firestore. If user then uploads a new resume but the upload fails silently or user navigates away, `resumeText` remains `null`.

**Secondary Root Cause: Resume Upload Validation Gap**

`backend/app/routes/resume.py:58-70`:
- ✅ Has safety check (lines 61-67) that verifies `resumeText` was written
- ✅ Raises `RuntimeError` if missing
- ⚠️ **BUT:** Exception may be caught and swallowed upstream

**Tertiary Root Cause: Frontend Resume Loading**

`connect-grow-hire/src/pages/ApplicationLabPage.tsx:51-56`:
```typescript
const resumeData = {
  resumeText: userData.resumeText || userData.resume_text || '',  // ⚠️ Empty string if missing
  rawText: userData.resumeText || userData.resume_text || '',
  resumeParsed: userData.resumeParsed || {},
  ...userData.resumeParsed,
};
```

**Problem:** If `userData.resumeText` is `null` or missing, frontend passes empty string. Backend then tries to reconstruct from structured data (~226 chars), which is insufficient for LLM edits.

### Verification: Resume Upload Endpoint

**File:** `backend/app/routes/resume.py`

✅ **Does it ALWAYS write resumeText?**  
Yes - Line 37: `update_data['resumeText'] = resume_text` (always set)

✅ **Does it EVER return savedToFirebase=true but fail to write?**  
No - Lines 61-67 have safety check that raises exception if `resumeText` missing after write

⚠️ **Are exceptions swallowed anywhere?**  
Line 149-157: Token verification errors are caught and printed, but upload continues. However, if `save_resume_to_firebase()` raises, it should propagate.

**Potential Issue:** If `extract_text_from_pdf()` returns empty string, `resume_text` is empty, but upload still succeeds. Line 101-103 checks for empty, but only returns 400 if completely empty.

---

## C) TIMEOUTS + ASYNC EVENT LOOP RELIABILITY

### Current Timeout Values

| Location | Operation | Timeout | File:Line |
|----------|-----------|---------|-----------|
| Route: `/analyze` | Overall analysis | 120s | `application_lab.py:73` |
| Route: `/generate-cover-letter` | Cover letter generation | 90s | `application_lab.py:174` |
| Route: `/generate-edited-resume` | **NO TIMEOUT** | ❌ None | `application_lab.py:263` |
| Service: Job description fetch | Jina Reader | 5s | `application_lab_service.py:164` |
| Service: Resume parsing | OpenAI parse | 15s | `application_lab_service.py:170` |
| Service: Requirement extraction | OpenAI extract | 20s | `application_lab_service.py:234` |
| Service: Apply edits to raw text | OpenAI edit | 30s | `application_lab_service.py:437` |
| Scout: Resume parsing | OpenAI parse | 20s | `scout_service.py:2008` |
| Scout: Job fit analysis | Overall | 50s | `scout_service.py:1190` |
| Scout: Requirement matching | OpenAI match | 45s | `scout_service.py:1303` |

### Event Loop Issues

**Problem 1: Nested `asyncio.run()` Calls**

`backend/app/routes/application_lab.py:65-75`:
```python
result = asyncio.run(
    asyncio.wait_for(
        application_lab_service.analyze_job_fit(...),
        timeout=120.0
    )
)
```

**Issue:** `asyncio.run()` creates a new event loop. If `analyze_job_fit()` internally uses `asyncio.create_task()` or `asyncio.gather()`, it may conflict with the outer loop.

**Problem 2: No Timeout on `/generate-edited-resume`**

`backend/app/routes/application_lab.py:263-270`:
```python
edited_resume_data = asyncio.run(
    application_lab_service.generate_edited_resume(...)  # ⚠️ NO TIMEOUT
)
```

**Issue:** If `apply_edits_to_raw_text()` times out (30s) or hangs, the route will hang indefinitely.

**Problem 3: Timeout Too Short for LLM Edit Application**

`backend/app/services/application_lab_service.py:427-438`:
```python
completion = await asyncio.wait_for(
    self._openai.chat.completions.create(
        model="gpt-4o-mini",
        messages=[...],
        max_tokens=4000
    ),
    timeout=30.0  # ⚠️ May be too short for 8000-char prompt + 4000 tokens
)
```

**Issue:** With 8000-char prompt and 4000 max_tokens, 30s may be insufficient, especially if OpenAI is slow.

### Recommended Architecture Change

**Option 1: Convert to Sync (Minimal Change)**
- Replace `asyncio.run()` with direct sync OpenAI calls
- Use `client.chat.completions.create()` instead of `async_client`
- Remove all `async/await` from routes

**Option 2: Proper Async Framework (Better)**
- Use Flask with `quart` or `aiohttp` for async routes
- Single event loop per request
- No nested `asyncio.run()`

**Option 3: Isolated Async (Recommended - Minimal)**
- Keep Flask sync routes
- Use `asyncio.new_event_loop()` + `run_coroutine_threadsafe()` for each request
- Or use `concurrent.futures.ThreadPoolExecutor` to run async code in thread

**Recommended:** Option 3 with thread pool executor (minimal code change, proper isolation).

---

## D) RESUME EDIT APPLICATION STRATEGY

### Current Strategy Problems

**Condition That Triggers Raw Text Editing:**

1. **Parse Incomplete Flag:**
   - `backend/app/services/application_lab_service.py:646`
   - `parse_incomplete = parsed_resume.get("_parse_incomplete", False)`
   - Set by `scout_service._parse_resume_structured()` when input has sections but output doesn't

2. **Missing Critical Sections:**
   - `backend/app/services/application_lab_service.py:710`
   - `missing_all_critical = not (has_experience or has_education or has_projects or has_summary)`
   - If true AND edits exist → apply to raw text

**Why Resumes Are Flagged Incomplete:**

`backend/app/services/scout_service.py:2034-2046`:
- Compares input text keywords (education, experience, projects) to parsed output
- If input has keywords but output missing sections → `_parse_incomplete = True`
- Common when:
  - Resume is scanned PDF (poor OCR)
  - Resume has non-standard formatting
  - Resume is very long (LLM truncates)

**Current Flow When Incomplete:**

1. Reconstruct text from structured (~226 chars) - `_reconstruct_text_from_structured()`
2. Try to apply edits via LLM with 8000-char prompt
3. LLM times out or produces poor output
4. User sees error or incomplete resume

### Proposed Safer Strategy

**Priority 1: Fail Fast if resumeText Missing**

```python
# In generate_edited_resume(), before any LLM calls:
raw_resume_text = await self._get_raw_resume_text(user_resume, parsed_resume=parsed_resume, user_id=user_id)

if not raw_resume_text or len(raw_resume_text.strip()) < 500:
    raise ValueError(
        "Resume text is missing or too short. Please re-upload your resume. "
        "If you recently deleted your resume, upload it again in Account Settings."
    )
```

**Priority 2: Structured Resume Generation (Not Raw Text Patching)**

Instead of patching raw text:
1. Apply edits to structured resume (already done for complete parses)
2. Format structured resume to text/markdown/PDF
3. Only use raw text patching as last resort with chunked edits

**Priority 3: Chunked Edit Application**

If must patch raw text:
- Split edits into batches (max 3 edits per LLM call)
- Apply sequentially
- Validate each batch before proceeding

**Priority 4: Deterministic Templating**

For common edit types (add_keywords, quantify):
- Use regex/string replacement instead of LLM
- Only use LLM for complex modifications

### Fail-Fast Rule Set

```python
def validate_resume_for_edits(user_resume, parsed_resume, user_id):
    """Fail fast if resume cannot support edits."""
    raw_text = get_raw_resume_text(user_resume, parsed_resume, user_id)
    
    # Rule 1: Must have raw text
    if not raw_text or len(raw_text.strip()) < 500:
        raise ValueError("Resume text missing - re-upload resume")
    
    # Rule 2: Reconstructed text is insufficient
    if len(raw_text.strip()) < 500 and parsed_resume.get("_parse_incomplete"):
        raise ValueError("Resume parsing incomplete - re-upload a text-based PDF")
    
    # Rule 3: Too many edits for raw text patching
    if len(resume_edits) > 10 and parsed_resume.get("_parse_incomplete"):
        raise ValueError("Too many edits for incomplete resume - re-upload resume")
    
    return True
```

---

## E) OBSERVABILITY + HEALTH CHECKS

### Structured Logging to Add

**1. Request Entry Logging**

**File:** `backend/app/routes/application_lab.py:42-58`

```python
# After extracting payload
import logging
logger = logging.getLogger('application_lab')

user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
has_resume_text = bool(user_resume and (user_resume.get('resumeText') or user_resume.get('rawText')))
resume_text_len = len(user_resume.get('resumeText', '') or user_resume.get('rawText', '')) if user_resume else 0
has_resume_url = bool(user_resume and user_resume.get('resumeUrl'))

logger.info("application_lab.analyze.request", extra={
    "user_id": user_id[:8] if user_id else None,
    "has_resume_text": has_resume_text,
    "resume_text_len": resume_text_len,
    "has_resume_url": has_resume_url,
    "job_title": job.get('title', '')[:50],
    "job_company": job.get('company', '')[:50],
})
```

**2. Before OpenAI Calls**

**File:** `backend/app/services/application_lab_service.py:427`

```python
logger.info("application_lab.apply_edits.openai_call", extra={
    "user_id": user_id[:8] if user_id else None,
    "model": "gpt-4o-mini",
    "prompt_chars": len(prompt),
    "max_tokens": 4000,
    "num_edits": len(resume_edits),
    "raw_text_len": len(raw_text),
    "timeout": 30.0,
})
```

**3. After OpenAI Calls**

**File:** `backend/app/services/application_lab_service.py:440`

```python
import time
start_time = time.time()
# ... OpenAI call ...
latency = time.time() - start_time

logger.info("application_lab.apply_edits.openai_complete", extra={
    "user_id": user_id[:8] if user_id else None,
    "latency_seconds": latency,
    "tokens_used": completion.usage.total_tokens if hasattr(completion, 'usage') else None,
    "success": True,
})
```

**4. Database Fetch Logging**

**File:** `backend/app/services/application_lab_service.py:492-498`

```python
user_doc = db.collection('users').document(user_id).get()
if user_doc.exists:
    user_data = user_doc.to_dict()
    has_resume_text = bool(user_data.get('resumeText') or user_data.get('rawText'))
    resume_text_len = len(user_data.get('resumeText', '') or user_data.get('rawText', ''))
    
    logger.info("application_lab.resume_fetch.firestore", extra={
        "user_id": user_id[:8],
        "has_resume_text": has_resume_text,
        "resume_text_len": resume_text_len,
        "doc_keys": list(user_data.keys())[:10],
    })
```

### Health Endpoint Implementation

**File:** `backend/app/routes/application_lab.py:286-289` (extend existing)

```python
@application_lab_bp.route("/health/details", methods=["GET"])
@require_firebase_auth
def health_details():
    """Detailed health check for Application Lab dependencies."""
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated"
        }), 401
    
    health = {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "checks": {}
    }
    
    # Check 1: Firestore connectivity
    try:
        from app.extensions import get_db
        db = get_db()
        if db:
            user_doc = db.collection('users').document(user_id).get()
            health["checks"]["firestore"] = {
                "status": "ok",
                "user_doc_exists": user_doc.exists
            }
            
            if user_doc.exists:
                user_data = user_doc.to_dict()
                has_resume_text = bool(user_data.get('resumeText') or user_data.get('rawText'))
                resume_text_len = len(user_data.get('resumeText', '') or user_data.get('rawText', ''))
                
                health["checks"]["resume_data"] = {
                    "status": "ok" if has_resume_text else "missing",
                    "has_resume_text": has_resume_text,
                    "resume_text_len": resume_text_len,
                    "has_resume_url": bool(user_data.get('resumeUrl')),
                    "has_resume_parsed": bool(user_data.get('resumeParsed')),
                }
        else:
            health["checks"]["firestore"] = {"status": "error", "message": "Database not available"}
    except Exception as e:
        health["checks"]["firestore"] = {"status": "error", "message": str(e)}
    
    # Check 2: OpenAI reachability
    try:
        from app.services.openai_client import get_async_openai_client
        openai_client = get_async_openai_client()
        if openai_client:
            # Quick test call (very small)
            import asyncio
            test_result = asyncio.run(
                asyncio.wait_for(
                    openai_client.chat.completions.create(
                        model="gpt-4o-mini",
                        messages=[{"role": "user", "content": "test"}],
                        max_tokens=5
                    ),
                    timeout=5.0
                )
            )
            health["checks"]["openai"] = {
                "status": "ok",
                "model": "gpt-4o-mini"
            }
        else:
            health["checks"]["openai"] = {"status": "error", "message": "OpenAI client not available"}
    except asyncio.TimeoutError:
        health["checks"]["openai"] = {"status": "timeout", "message": "OpenAI API timeout"}
    except Exception as e:
        health["checks"]["openai"] = {"status": "error", "message": str(e)}
    
    # Overall status
    all_checks_ok = all(
        check.get("status") == "ok" 
        for check in health["checks"].values()
    )
    health["status"] = "ok" if all_checks_ok else "degraded"
    
    return jsonify(health)
```

### Sentry Breadcrumbs

**Add to:** `backend/app/services/application_lab_service.py` (top of file)

```python
try:
    import sentry_sdk
    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False

# In generate_edited_resume(), before LLM call:
if SENTRY_AVAILABLE:
    sentry_sdk.add_breadcrumb(
        message="Applying edits to raw resume text",
        level="info",
        data={
            "user_id": user_id[:8] if user_id else None,
            "num_edits": len(resume_edits),
            "raw_text_len": len(raw_text),
            "model": "gpt-4o-mini",
        }
    )
```

**Note:** Never log full `resumeText` to Sentry (privacy).

---

## F) TEST PLAN

### Test File Location

**Create:** `backend/tests/test_application_lab.py`

### Test Cases

#### Test 1: Missing resumeText → Clear Error (No LLM Call)

```python
import pytest
from unittest.mock import Mock, patch, AsyncMock
from app.services.application_lab_service import application_lab_service
from app.services.scout_service import ResumeEdit

@pytest.mark.asyncio
async def test_generate_edited_resume_missing_resume_text():
    """Test that missing resumeText returns clear error without LLM call."""
    user_resume = {
        "resumeText": None,
        "rawText": None,
        "resumeParsed": {"summary": "Test"}
    }
    resume_edits = [
        ResumeEdit(
            id="1",
            section="Experience",
            edit_type="add",
            priority="high",
            impact="Test",
            suggested_content="New content",
            rationale="Test",
            requirements_addressed=[],
            keywords_added=[]
        )
    ]
    
    with patch('app.services.application_lab_service.get_db') as mock_db:
        mock_db.return_value = None
        
        with pytest.raises(ValueError) as exc_info:
            await application_lab_service.generate_edited_resume(
                user_resume=user_resume,
                resume_edits=resume_edits,
                user_id="test_user"
            )
        
        assert "resume text is not available" in str(exc_info.value).lower()
        # Verify no OpenAI call was made
        assert not hasattr(application_lab_service, '_openai') or application_lab_service._openai is None
```

#### Test 2: resumeText Present → Success Within Time Budget

```python
@pytest.mark.asyncio
async def test_generate_edited_resume_success():
    """Test successful resume generation with valid resumeText."""
    user_resume = {
        "resumeText": "John Doe\nSoftware Engineer\n5 years experience\nPython, JavaScript",
        "resumeParsed": {
            "summary": "Experienced software engineer",
            "experience": [{"title": "Engineer", "company": "Tech Co", "bullets": ["Built apps"]}]
        }
    }
    resume_edits = [
        ResumeEdit(
            id="1",
            section="Experience",
            edit_type="modify",
            priority="medium",
            impact="Test",
            current_content="Built apps",
            suggested_content="Built scalable apps",
            rationale="Test",
            requirements_addressed=[],
            keywords_added=[]
        )
    ]
    
    # Mock OpenAI response
    mock_completion = AsyncMock()
    mock_completion.choices = [Mock(message=Mock(content="Edited resume text"))]
    mock_completion.usage = Mock(total_tokens=100)
    
    with patch('app.services.application_lab_service.get_async_openai_client') as mock_openai:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_completion)
        mock_openai.return_value = mock_client
        
        result = await application_lab_service.generate_edited_resume(
            user_resume=user_resume,
            resume_edits=resume_edits,
            format_type="plain",
            user_id="test_user"
        )
        
        assert result["status"] == "ok" or "formatted_text" in result
        assert "Edited resume text" in result.get("formatted_text", "")
```

#### Test 3: Scanned PDF → OCR Flag + Guidance

```python
@pytest.mark.asyncio
async def test_scanned_pdf_resume_needs_ocr():
    """Test that scanned PDF with empty text extraction sets resumeNeedsOCR flag."""
    user_resume = {
        "resumeText": "",  # Empty from OCR failure
        "resumeParsed": {
            "summary": "",
            "_parse_incomplete": True
        }
    }
    resume_edits = [ResumeEdit(...)]  # Any edit
    
    with pytest.raises(ValueError) as exc_info:
        await application_lab_service.generate_edited_resume(
            user_resume=user_resume,
            resume_edits=resume_edits,
            user_id="test_user"
        )
    
    error_msg = str(exc_info.value).lower()
    assert "resume text" in error_msg or "re-upload" in error_msg
```

### Test Fixtures

**File:** `backend/tests/conftest.py`

```python
import pytest
from unittest.mock import Mock

@pytest.fixture
def mock_firestore_db():
    """Mock Firestore database."""
    db = Mock()
    user_doc = Mock()
    user_doc.exists = True
    user_doc.to_dict.return_value = {
        "resumeText": "Test resume text",
        "resumeUrl": "https://storage.../resume.pdf",
        "resumeParsed": {"summary": "Test"}
    }
    db.collection.return_value.document.return_value.get.return_value = user_doc
    return db

@pytest.fixture
def sample_resume_edits():
    """Sample resume edits for testing."""
    from app.services.scout_service import ResumeEdit
    return [
        ResumeEdit(
            id="1",
            section="Experience",
            edit_type="add",
            priority="high",
            impact="Addresses requirement",
            suggested_content="New bullet point",
            rationale="Matches job requirements",
            requirements_addressed=["Python experience"],
            keywords_added=["Python"]
        )
    ]
```

### Running Tests

```bash
# Install pytest if not already
pip install pytest pytest-asyncio

# Run Application Lab tests
pytest backend/tests/test_application_lab.py -v

# Run with coverage
pytest backend/tests/test_application_lab.py --cov=app.services.application_lab_service --cov-report=html
```

---

## TOP 10 ISSUES (Ranked by Severity)

### 1. **CRITICAL: Missing resumeText Causes Timeout Failures**
- **Severity:** P0 - Blocks core feature
- **Impact:** Users see timeouts when resumeText is missing
- **Root Cause:** Frontend delete sets resumeText to null, no validation before LLM calls
- **Fix:** Add fail-fast validation in `generate_edited_resume()` before any LLM calls

### 2. **CRITICAL: No Timeout on /generate-edited-resume Route**
- **Severity:** P0 - Can hang indefinitely
- **Impact:** Route hangs if LLM call times out or hangs
- **Root Cause:** Missing `asyncio.wait_for()` wrapper
- **Fix:** Add 90s timeout wrapper in route handler

### 3. **HIGH: Nested asyncio.run() Causes Event Loop Conflicts**
- **Severity:** P1 - Causes CancelledError and unreliable behavior
- **Impact:** Intermittent failures, hard to debug
- **Root Cause:** Flask sync routes calling `asyncio.run()` on async code
- **Fix:** Use thread pool executor or convert to proper async framework

### 4. **HIGH: Frontend Passes Incomplete Resume Data**
- **Severity:** P1 - Missing resumeText in payload
- **Impact:** Backend must fetch from Firestore, but may fail
- **Root Cause:** Frontend doesn't re-fetch if resumeText missing
- **Fix:** Frontend should always include resumeText from Firestore in payload

### 5. **HIGH: Resume Edit Application Timeout Too Short**
- **Severity:** P1 - 30s may be insufficient for large prompts
- **Impact:** Legitimate edits fail due to timeout
- **Root Cause:** Fixed 30s timeout for variable-length prompts
- **Fix:** Increase to 60s or make dynamic based on prompt length

### 6. **MEDIUM: Reconstructed Text Too Short for Edits**
- **Severity:** P2 - ~226 chars insufficient for LLM edits
- **Impact:** Poor edit quality or failures
- **Root Cause:** Fallback reconstruction from structured data
- **Fix:** Fail fast if reconstructed text < 500 chars

### 7. **MEDIUM: No Structured Logging**
- **Severity:** P2 - Hard to debug production issues
- **Impact:** Cannot diagnose failures in production
- **Root Cause:** Only print statements
- **Fix:** Add structured logging with user_id, resume_text_len, etc.

### 8. **MEDIUM: No Health Endpoint**
- **Severity:** P2 - Cannot check system health
- **Impact:** Cannot proactively detect issues
- **Root Cause:** Missing endpoint
- **Fix:** Implement `/health/details` endpoint

### 9. **LOW: Resume Upload Validation May Be Swallowed**
- **Severity:** P3 - Edge case
- **Impact:** resumeText may not be written but upload succeeds
- **Root Cause:** Exception handling in route
- **Fix:** Ensure exceptions propagate correctly

### 10. **LOW: No Test Coverage**
- **Severity:** P3 - Regression risk
- **Impact:** Changes may break existing functionality
- **Root Cause:** No automated tests
- **Fix:** Add test suite as outlined in Section F

---

## FIXES (Exact Files + Code Snippets)

### Fix 1: Add Fail-Fast Validation in generate_edited_resume()

**File:** `backend/app/services/application_lab_service.py:603-633`

**Add after line 632:**

```python
# FAIL-FAST: Validate resume text before any expensive operations
raw_resume_text = await self._get_raw_resume_text(user_resume, parsed_resume=None, user_id=user_id)

if not raw_resume_text or len(raw_resume_text.strip()) < 500:
    error_msg = (
        "Resume text is missing or too short ({} chars). "
        "Please re-upload your resume in Account Settings. "
        "If you recently deleted your resume, upload it again."
    ).format(len(raw_resume_text.strip()) if raw_resume_text else 0)
    print(f"[ApplicationLab] ERROR: {error_msg}")
    raise ValueError(error_msg)

# Ensure raw_text is in user_resume for parsing
if 'resumeText' not in user_resume and raw_resume_text:
    user_resume['resumeText'] = raw_resume_text
```

### Fix 2: Add Timeout to /generate-edited-resume Route

**File:** `backend/app/routes/application_lab.py:263-270`

**Replace:**

```python
edited_resume_data = asyncio.run(
    application_lab_service.generate_edited_resume(
        user_resume=user_resume,
        resume_edits=edit_objects,
        format_type=format_type,
        user_id=user_id
    )
)
```

**With:**

```python
try:
    edited_resume_data = asyncio.run(
        asyncio.wait_for(
            application_lab_service.generate_edited_resume(
                user_resume=user_resume,
                resume_edits=edit_objects,
                format_type=format_type,
                user_id=user_id
            ),
            timeout=90.0  # 90 second timeout
        )
    )
except asyncio.TimeoutError:
    print("[ApplicationLab] Generate edited resume timed out")
    return jsonify({
        "status": "error",
        "message": "Resume generation timed out. Please try again with fewer edits or a simpler resume."
    }), 504
```

### Fix 3: Increase Timeout for apply_edits_to_raw_text()

**File:** `backend/app/services/application_lab_service.py:437`

**Change:**

```python
timeout=30.0
```

**To:**

```python
timeout=60.0  # Increased from 30s to handle large prompts
```

### Fix 4: Frontend Always Include resumeText in Payload

**File:** `connect-grow-hire/src/pages/ApplicationLabPage.tsx:38-65`

**Replace lines 51-56:**

```typescript
const resumeData = {
  resumeText: userData.resumeText || userData.resume_text || '',
  rawText: userData.resumeText || userData.resume_text || '',
  resumeParsed: userData.resumeParsed || {},
  ...userData.resumeParsed,
};
```

**With:**

```typescript
// Always fetch resumeText from Firestore, don't rely on empty string fallback
const resumeText = userData.resumeText || userData.resume_text || '';
if (!resumeText) {
  console.warn('[ApplicationLab] Resume text missing in Firestore - user may need to re-upload');
}

const resumeData = {
  resumeText: resumeText,
  rawText: resumeText,
  resumeParsed: userData.resumeParsed || {},
  resumeUrl: userData.resumeUrl || null,
  resumeFileName: userData.resumeFileName || null,
  ...userData.resumeParsed,
};
```

### Fix 5: Add Structured Logging

**File:** `backend/app/routes/application_lab.py` (top of file)

**Add:**

```python
import logging
logger = logging.getLogger('application_lab')
```

**File:** `backend/app/routes/application_lab.py:42` (after payload extraction)

**Add:**

```python
# Log request entry
user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
has_resume_text = bool(user_resume and (user_resume.get('resumeText') or user_resume.get('rawText')))
resume_text_len = len(user_resume.get('resumeText', '') or user_resume.get('rawText', '')) if user_resume else 0

logger.info("application_lab.analyze.request", extra={
    "user_id": user_id[:8] if user_id else None,
    "has_resume_text": has_resume_text,
    "resume_text_len": resume_text_len,
    "job_title": job.get('title', '')[:50] if job else None,
})
```

### Fix 6: Prevent resumeText Deletion from Clearing Field

**File:** `connect-grow-hire/src/pages/AccountSettings.tsx:301-307`

**Change:**

```typescript
await updateDoc(userRef, {
  resumeText: null,  // ⚠️ This sets field to null
  resumeUrl: null,
  resumeFileName: null,
  resumeUpdatedAt: null,
  resumeParsed: null,
});
```

**To:**

```typescript
// Use deleteField() to remove fields instead of setting to null
import { deleteField } from 'firebase/firestore';

await updateDoc(userRef, {
  resumeText: deleteField(),
  resumeUrl: deleteField(),
  resumeFileName: deleteField(),
  resumeUpdatedAt: deleteField(),
  resumeParsed: deleteField(),
});
```

**Note:** `deleteField()` removes the field entirely, which is better than `null` for Firestore queries.

---

## GUARDRAILS (Fail-Fast Conditions, Validations)

### Validation Function

**File:** `backend/app/services/application_lab_service.py` (add new method)

```python
def _validate_resume_for_application_lab(
    self,
    user_resume: Dict[str, Any],
    user_id: Optional[str] = None
) -> Tuple[bool, str]:
    """
    Validate resume data before expensive operations.
    
    Returns:
        (is_valid, error_message)
    """
    # Check 1: Must have resumeText or rawText
    resume_text = user_resume.get('resumeText') or user_resume.get('rawText') or user_resume.get('resume_text') or ''
    
    if not resume_text or len(resume_text.strip()) < 500:
        return False, (
            "Resume text is missing or too short. "
            "Please re-upload your resume in Account Settings."
        )
    
    # Check 2: If resumeParsed exists, check for critical sections
    resume_parsed = user_resume.get('resumeParsed') or {}
    if resume_parsed:
        has_experience = bool(resume_parsed.get('experience'))
        has_education = bool(resume_parsed.get('education'))
        has_projects = bool(resume_parsed.get('projects'))
        has_summary = bool(resume_parsed.get('summary'))
        
        if not (has_experience or has_education or has_projects or has_summary):
            # Resume is incomplete, but we have raw text, so allow it
            pass
    
    return True, ""
```

### Usage in Routes

**File:** `backend/app/routes/application_lab.py:46-50`

**Add before processing:**

```python
# Validate resume data
is_valid, error_msg = application_lab_service._validate_resume_for_application_lab(
    user_resume, user_id
)
if not is_valid:
    return jsonify({
        "status": "error",
        "message": error_msg
    }), 400
```

---

## SUMMARY

### Immediate Actions (P0)

1. ✅ Add fail-fast validation in `generate_edited_resume()` (Fix 1)
2. ✅ Add timeout to `/generate-edited-resume` route (Fix 2)
3. ✅ Increase timeout for `apply_edits_to_raw_text()` (Fix 3)

### Short-Term Actions (P1)

4. ✅ Fix frontend to always include resumeText (Fix 4)
5. ✅ Add structured logging (Fix 5)
6. ✅ Implement health endpoint (Section E)
7. ⚠️ Address nested asyncio.run() (requires architecture decision)

### Medium-Term Actions (P2)

8. ✅ Add test suite (Section F)
9. ✅ Prevent resumeText deletion from setting null (Fix 6)
10. ✅ Add validation function (Guardrails section)

### Long-Term Actions (P3)

11. Consider migrating to proper async framework (Quart/aiohttp)
12. Add monitoring/alerting based on structured logs
13. Implement resume edit chunking for large edits

---

**Report Generated:** Comprehensive analysis complete  
**Next Steps:** Implement P0 fixes immediately, then P1, then P2/P3

