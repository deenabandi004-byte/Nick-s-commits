# Resume Parsing Pipeline - Full Trace

## 1. What handles the resume upload?

**Endpoint:** `POST /api/parse-resume`  
**Handler:** `parse_resume()` in **`backend/app/routes/resume.py`** (line 193).

- Frontend calls this from:
  - **ResumePage.tsx** - `handleUpload` → `fetch(API_BASE_URL + '/api/parse-resume', { method: 'POST', body: formData })`
  - **AccountSettings.tsx** - resume upload → same endpoint
  - **ContactSearchPage.tsx** - resume upload → same endpoint
  - **OnboardingFlow.tsx** - optional resume on completion → same endpoint

**Flow in `parse_resume()`:**
1. Validate file (`resume` in `request.files`, filename, type via `is_valid_resume_file`).
2. Get extension via `get_file_extension()` (from `resume_capabilities`).
3. **Extract text:** `resume_text = extract_text_from_file(file, extension)`.
4. **Parse to structure:** `parsed_info = parse_resume_info(resume_text)`.
5. **Validate:** `validate_parsed_resume(parsed_info)`.
6. If authenticated: upload file to Firebase Storage, then **save to Firestore** via `save_resume_to_firebase(user_id, resume_text, resume_url, parsed_info, resume_metadata)`.
7. Return `{ success: true, data: parsed_info, ... }`.

---

## 2. What extracts text from the PDF?

**Library:** **PyPDF2** (no pdf-parse, pdfjs, affinda, pdfplumber, textract, or Document AI in this path).

**File:** **`backend/app/services/resume_parser.py`**

- **`extract_text_from_pdf(pdf_file)`** (lines 12–43):
  - Saves upload to a temp file, opens with `PyPDF2.PdfReader(file)`.
  - Loops `pdf_reader.pages`, calls `page.extract_text()`.
  - Cleans: printable chars only, `encode('utf-8', errors='ignore').decode('utf-8')`, then `' '.join(text.split())`.
  - Returns one concatenated string (or `None` if extraction fails).

- **`extract_text_from_file(file, file_type)`** (lines 49–91):
  - Dispatches by `file_type`: `'pdf'` → `extract_text_from_pdf(file)`; `'docx'` → **`docx_service.extract_text_from_docx(temp_file.name)`**; `'doc'` → returns `None` (no conversion).
  - DOCX comes from **`backend/app/services/docx_service.py`** (not shown in trace; no PDF there).

**Dependencies:** `PyPDF2==3.0.1` in `backend/requirements.txt`.

---

## 3. What converts raw text → structured `resumeParsed`?

**It is an LLM call**, not a rules-based or third-party resume API.

**File:** **`backend/app/utils/users.py`**  
**Function:** **`parse_resume_info(resume_text)`** (starts line 229).

- Uses **OpenAI** via **`get_openai_client()`** (sync client from `app.services.openai_client`).
- Sends `resume_text[:8000]` with a long **RESUME_PARSING_PROMPT** that asks for a single JSON object with: `name`, `contact`, `objective`, `education`, `experience` (array of `{ company, title, dates, location, bullets[] }`), `projects[]`, `skills` (dict of categories), `extracurriculars`, `certifications`, etc.
- **API call:** `client.chat.completions.create(model="gpt-4o-mini", messages=[...], max_tokens=4000, temperature=0.1)`.
- Strips markdown code blocks from the response, `json.loads(result_text)`, then normalizes types (e.g. `contact`/`education`/`skills` must be dict; `experience`/`projects`/… must be list; education `coursework`/`honors` lists).
- **Prompt rules** say: “PRESERVE EXACT TEXT”, “KEEP ALL BULLETS”, “copy them exactly”, “Do NOT summarize”, “Do NOT invent or infer”. So the *intent* is extraction only, but the model can still rephrase or drop content.

---

## 4. Where is `resumeParsed` stored?

**At upload time**, when the user is authenticated.

**File:** **`backend/app/routes/resume.py`**  
**Function:** **`save_resume_to_firebase(user_id, resume_text, resume_url, parsed_info=None, resume_metadata=None)`** (lines 105–189).

- Writes to **Firestore** `users/{user_id}` with `set(..., merge=True)`.
- Fields set include: `resumeText`, `originalResumeText`, `resumeUrl`, `resumeUpdatedAt`, resume metadata (e.g. `resumeFileName`, `resumeFileType`, `resumeCapabilities`), and **`resumeParsed`** = `parsed_info` (the object returned by `parse_resume_info`), plus **`resumeParseVersion`** = 2.

So **`resumeParsed` is saved at upload time**; it is **not** generated on-the-fly when a page loads. Pages that need it (ResumePage, Resume Workshop, Application Lab, etc.) read it from Firestore `users/{uid}` (e.g. via `getDoc(doc(db, 'users', uid))` and use `data.resumeParsed`).

---

## 5. Code path: PDF upload → text → structure → Firestore

| Step | File | Function / detail |
|------|------|-------------------|
| 1. Request | `backend/app/routes/resume.py` | `parse_resume()` - receives `POST /api/parse-resume`, file in `request.files['resume']` |
| 2. File type | `backend/app/services/resume_capabilities.py` | `is_valid_resume_file()`, `get_file_extension()` (used by route) |
| 3. Text extraction | `backend/app/services/resume_parser.py` | `extract_text_from_file(file, extension)` → for PDF: `extract_text_from_pdf(file)` (PyPDF2); for DOCX: `extract_text_from_docx()` in `app/services/docx_service.py` |
| 4. Structured parse | `backend/app/utils/users.py` | `parse_resume_info(resume_text)` - builds prompt, calls OpenAI `chat.completions.create`, parses JSON, normalizes shape |
| 5. Validation | `backend/app/utils/users.py` | `validate_parsed_resume(parsed_info)` - checks name, education, experience, skills |
| 6. Storage upload | `backend/app/routes/resume.py` | `upload_resume_to_firebase_storage(user_id, file)` - Firebase Storage `resumes/{user_id}/{filename}` |
| 7. Firestore save | `backend/app/routes/resume.py` | `save_resume_to_firebase(user_id, resume_text, resume_url, parsed_info, resume_metadata)` - sets `resumeParsed`, `resumeText`, `resumeUrl`, etc. on `users/{user_id}` |

**Frontend (example):**
- **ResumePage.tsx**: `handleUpload` → `fetch('/api/parse-resume', { body: formData })` → on success, `result.data` is `parsed_info`; page can set local state and/or refetch user doc; Firestore already has `resumeParsed` from backend save.

---

## 6. Is there an LLM that “reorganizes” or “improves” the resume during parsing?

**Yes - a single LLM is used for parsing**, and it’s the only place where raw text is turned into structured content. That’s **`parse_resume_info()`** in **`backend/app/utils/users.py`**.

- It does **not** call a separate “improve” or “reorganize” step; the same call is supposed to both extract and structure.
- The prompt explicitly tells the model to **extract only**: preserve exact text, keep all bullets, copy exactly, don’t summarize, don’t invent. So **by design** it is not an “improvement” step.
- **In practice**, any change in wording, reordering, or dropped bullets would be the **LLM not following instructions** (e.g. summarizing, “cleaning up,” or omitting bullets). So if content is changing, the likely source is **`parse_resume_info`** in **`backend/app/utils/users.py`** (the GPT-4o-mini call around line 352).

**Relevant file paths and functions:**

| Purpose | File | Function / symbol |
|--------|------|--------------------|
| Upload endpoint | `backend/app/routes/resume.py` | `parse_resume()` |
| PDF/DOCX text extraction | `backend/app/services/resume_parser.py` | `extract_text_from_pdf()`, `extract_text_from_file()` |
| DOCX only | `backend/app/services/docx_service.py` | `extract_text_from_docx()` |
| Raw text → structured JSON (LLM) | `backend/app/utils/users.py` | `parse_resume_info()` |
| Validation | `backend/app/utils/users.py` | `validate_parsed_resume()` |
| Save to Firestore | `backend/app/routes/resume.py` | `save_resume_to_firebase()` |
| Load on frontend | e.g. `connect-grow-hire/src/pages/ResumePage.tsx` | `loadResume()` reads `doc(db, 'users', uid)` and uses `data.resumeParsed` |

---

## Summary

1. **Upload handler:** `backend/app/routes/resume.py` → `parse_resume()` (`POST /api/parse-resume`).
2. **PDF text:** PyPDF2 in `backend/app/services/resume_parser.py` → `extract_text_from_pdf()` / `extract_text_from_file()`.
3. **Structured `resumeParsed`:** One LLM call - `parse_resume_info(resume_text)` in `backend/app/utils/users.py` (OpenAI GPT-4o-mini). Prompt is extraction-only; no separate “improve” step.
4. **Storage:** `resumeParsed` is written to Firestore at upload time in `save_resume_to_firebase()`; pages load it from `users/{uid}.resumeParsed`.
5. **Full path:** `resume.py` → `extract_text_from_file()` (resume_parser) → `parse_resume_info()` (users) → `validate_parsed_resume()` → `upload_resume_to_firebase_storage()` + `save_resume_to_firebase()`.
6. **Content changes:** If bullets or wording change, the only place that can do it in this pipeline is the **`parse_resume_info`** LLM in **`backend/app/utils/users.py`** (around the `client.chat.completions.create` call).
