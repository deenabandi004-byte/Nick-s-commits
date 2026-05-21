# Complete Resume System Audit

This document is a full audit of the Offerloop resume system for redesign planning. It traces every flow, identifies inconsistencies, and catalogs known issues.

---

## 1. Resume Upload & Storage

### 1.1 How does a user upload a resume?

**Multiple entry points** (inconsistent flows):

| Location | Trigger | What happens |
|----------|---------|---------------|
| **Account Settings** | File input → `handleResumeUpload` | 1) Reads file as base64 (FileReader). 2) `POST /api/parse-resume` with `FormData` (file). 3) **Then** uploads same file again to Firebase Storage (`resumes/${uid}/${ts}-${file.name}`). 4) `setDoc(users/{uid}, { resumeUrl, resumeFileName, resumeUpdatedAt }, { merge: true })`. 5) Stores minimal parsed fields in **local state** and **localStorage** (`resumeData`, `resumeFile`). |
| **Contact Search** | "Upload" / file input | 1) `POST /api/parse-resume` (backend parses + uploads to Storage + saves Firestore). 2) **Then** frontend uploads file again to Storage (`resumes/${uid}/${ts}-${file.name}`) and `updateDoc(users/{uid}, { resumeUrl, resumeFileName, resumeUpdatedAt, resumeParsed: { name, university, major, year } })`. So Contact Search does **not** duplicate the backend’s full `resumeParsed`; it overwrites with a minimal subset. |
| **Onboarding (OnboardingFlow)** | Step 2 profile + optional file | On completion: if file present, `POST /api/parse-resume`; backend handles Storage + Firestore. Then `localStorage.setItem('resumeData', …)`. No second client-side Storage upload here. |
| **Recruiter Spreadsheet** | File input | **Does NOT call parse-resume.** Uploads file directly to Storage (`resumes/${uid}/${file.name}`) and `updateDoc` with `resumeUrl`, `resumeFileName`, `resumeUpdatedAt` only. **No parsing, no resumeText, no resumeParsed.** |
| **Resume Workshop** | No upload UI | Only loads existing resume from Firestore; "Upload New" links to Account Settings. |

**Critical path (backend, when token present):**

```text
POST /api/parse-resume (file in FormData)
  → resume_parser.extract_text_from_file(file, extension)
  → users.parse_resume_info(resume_text)   # OpenAI GPT-4o-mini
  → upload_resume_to_firebase_storage(user_id, file)   # blob path: resumes/{uid}/{file.filename}
  → save_resume_to_firebase(user_id, resume_text, resume_url, parsed_info, resume_metadata)
```

`save_resume_to_firebase` writes to `users/{uid}`: `resumeText`, `originalResumeText`, `resumeUrl`, `resumeUpdatedAt`, `resumeFileName`, `resumeFileType`, `resumeUploadedAt`, `resumeCapabilities`, `resumeParsed`, `resumeParseVersion`.

**Account Settings bug:** After calling `/api/parse-resume`, Account Settings does a **second** Storage upload and `setDoc` with only `resumeUrl`, `resumeFileName`, `resumeUpdatedAt`. So the URL in Firestore can point to the **frontend-uploaded** file (with timestamp in path), while the backend already uploaded to `resumes/{uid}/{file.filename}`. Firestore keeps whatever was saved by the backend for `resumeParsed`/`resumeText` (merge keeps those fields) unless another code path overwrites them. So we have **duplicate Storage uploads** from Account Settings and Contact Search.

### 1.2 Where is the file stored?

- **Service:** Firebase Storage (default bucket).
- **Path pattern:** `resumes/{userId}/{filename}`. Backend uses `resumes/{user_id}/{file.filename}`; frontend (Account Settings / Contact Search) uses `resumes/{uid}/${ts}-${file.name}`.
- **Bucket:** From Firebase Admin SDK `storage.bucket()` (no override in code).
- **Access:** `storage.rules`: read/write under `resumes/{uid}/**` only when `request.auth.uid == uid`. Max size 10 MB; content types: PDF, images, `application/msword`, DOCX.

### 1.3 File types and size limit

- **Accepted types:** PDF, DOCX, DOC (backend: `resume_capabilities.is_valid_resume_file`; frontend: `resumeFileTypes.ts` - `.pdf`, `.docx`, `.doc` and matching MIME types).
- **Size limit:** Not enforced in backend. Storage rules: **10 MB** (`10 * 1024 * 1024`).
- **DOC:** Allowed in UI/capabilities but `resume_parser.extract_text_from_file` returns `None` for `.doc` (“Please convert to DOCX first”). So DOC upload can “succeed” but parsing fails.

### 1.4 Firestore metadata

**Document:** `users/{uid}`.

**Fields written by backend (`save_resume_to_firebase`):**

- `resumeText`, `originalResumeText`, `resumeUrl`, `resumeUpdatedAt`
- `resumeFileName`, `resumeFileType`, `resumeUploadedAt`, `resumeCapabilities`
- `resumeParsed` (full structure: name, contact, education, experience, projects, skills, etc.), `resumeParseVersion` (2)

**Fields written only by frontend in some flows:**

- Account Settings: `resumeUrl`, `resumeFileName`, `resumeUpdatedAt` (merge).
- Contact Search: same plus `resumeParsed` with only `{ name, university, major, year }` (overwrites full backend `resumeParsed`).

**DELETE resume:** `DELETE /api/resume` clears all resume-related fields and deletes Storage blobs for `resumeUrl` and `originalResumeUrl`.

### 1.5 Multiple resumes / resume library

- **Single “main” resume per user:** One `resumeUrl` / `resumeText` / `resumeParsed` on `users/{uid}`.
- **Resume library:** Separate subcollection `users/{uid}/resume_library/{entryId}`. Each entry: `id`, `display_name`, `job_title`, `company`, `location`, `created_at`, `pdf_base64`, `score`, etc. **Only the deprecated “apply recommendation” flow writes here** (see §8). There is **no “Save to library”** in the current Tailor UI.

---

## 2. Resume Parsing & Data Extraction

### 2.1 When is the resume parsed?

- On **upload** when the request hits `POST /api/parse-resume` with a valid auth token (and file type pdf/docx). DOC is rejected at extraction.)
- **Not** parsed when uploading only from Recruiter Spreadsheet (that flow skips parse-resume).

### 2.2 What is extracted?

**Library:** `backend/app/utils/users.py` - `parse_resume_info(resume_text)` uses **OpenAI GPT-4o-mini** with a large structured prompt.

**Extracted structure (v2):**

- `name`, `contact` (email, phone, location, linkedin, github, website)
- `objective`
- `education` (degree, major, university, location, graduation, gpa, coursework, honors, minor)
- `experience[]` (company, title, dates, location, bullets[])
- `projects[]` (name, description, technologies, date, link)
- `skills` (dict: programming_languages, tools_frameworks, databases, cloud_devops, core_skills, soft_skills, languages)
- `extracurriculars[]`, `certifications[]`, `publications`, `awards`, `volunteer`

Validation: `validate_parsed_resume()` checks name, education/university, experience, skills.

### 2.3 Where is parsed data stored and how is it used?

- **Stored:** Firestore `users/{uid}.resumeParsed` (and optionally `originalResumeParsed`). Also `resumeText` / `originalResumeText` on the same document.
- **Used downstream:** Email generation (reply_generation.batch_generate_emails uses resume text and profile; resume parser output feeds user info). Resume Workshop reads `resumeText` / `originalResumeText` (and fallbacks) for score/fix/tailor. Application Lab and Scout use `userResume` (resumeText + resumeParsed from Firestore). Contact Search overwrites `resumeParsed` with a minimal subset when saving from that page.

### 2.4 Parsing stack

- **Text extraction:** `backend/app/services/resume_parser.py` - PyPDF2 for PDF, `docx_service.extract_text_from_docx` for DOCX. DOC returns None.
- **Structured parsing:** OpenAI GPT-4o-mini in `users.parse_resume_info`.
- **Interview prep (separate):** `backend/app/services/interview_prep/resume_parser.py` has `extract_text_from_pdf_bytes` and `parse_resume_to_profile` (different pipeline).

---

## 3. Resume Display & UI

### 3.1 Where can users see their resume?

| Place | What’s shown |
|-------|-------------|
| **Account Settings** | Resume section: filename, upload date, “View” (opens `resumeUrl` in new tab), “Upload” / “Delete”. Uses local state + localStorage for display; Firestore for URL. |
| **Contact Search** | Optional resume upload; after save, “saved” state and filename. No PDF preview in this page. |
| **Resume Workshop** | “Your Resume” card: if `resumeUrl` exists, `<iframe>` PDF via blob URL (fetch PDF, create blob URL to avoid Content-Disposition). Otherwise “No resume uploaded” with link to Account Settings. |
| **Resume Library tab** | List of library entries (display_name, job title, company, date, score); preview/detail loads one entry (PDF from `pdf_base64`). |
| **Application Lab** | Loads `userResume` from Firestore (resumeText, resumeParsed, resumeUrl, etc.); no inline PDF viewer on the main page; resume is used for analysis and “Resume Edits” tab. |
| **Recruiter Spreadsheet** | Resume upload and “saved” state; no preview. |

### 3.2 How is the resume displayed?

- **PDF:** Via `resumeUrl` (or blob URL from it) in an iframe, or base64 data URL for library entries. No embedded PDF.js in the codebase for the main app.
- **Structured view:** `ResumeRenderer` component can render structured resume (name, contact, summary, education, experience, projects, skills, extracurriculars). Used where structured data is passed (e.g. optimization/result UIs). Not the main “view my resume” path; main path is PDF iframe.
- **Download:** “View” opens URL in new tab; library has “Download PDF” from base64.

### 3.3 Can users edit the resume in the app?

- **No inline editor** for the main resume. Tailor flow gives **recommendations** (copy/paste); “Fix” gives improved text + PDF and option to “Replace resume” (replace main resume in Firestore + Storage). So “editing” is: apply suggestions manually, or run Fix → Replace.
- **Application Lab** “Resume Edits” tab shows suggested edits; the block that would “Apply all edits and get a formatted resume” (PDF/TXT) is **disabled** (`{false && ...}` in ApplicationLabPanel.tsx), so no in-app edit-and-generate from that screen.

### 3.4 Resume library (multiple versions)

- **Library** = subcollection `users/{uid}/resume_library`. Entries are created only when the **deprecated** “apply recommendation” API is used. Current Tailor UI has **no “Save to library”**; users only get recommendations and copy/paste. So in normal use the library does not get new tailored versions (“resume library isn’t saving correctly” = no save path from current UI).
- **Selection:** No UI to “choose which resume to use” for drafts or elsewhere; email drafts always use the single main `resumeUrl` from `users/{uid}`.

### 3.5 Edit UI

- **Tailor results:** Recommendation cards (expand to see current vs suggested, copy suggested).
- **Fix results:** Preview of fixed PDF (base64), optional “Replace resume” modal.
- No dedicated “edit resume” page; no field-by-field form for the main resume.

---

## 4. Resume Tailoring / ALE (Applicant-Level Editing)

### 4.1 Is there tailoring?

- **Resume Workshop “Tailor Resume”:** Yes. User provides job URL and/or manual job fields; backend runs `_analyze_resume_sections` (GPT) and returns score + section-by-section suggestions (summary, experience bullets, skills add/remove, keywords). No automatic rewrite of the main resume; user applies suggestions manually (copy/paste).
- **Application Lab (ALE):** Analysis produces `resume_edits` (suggested changes). Intended: “edit the resume and generate a new PDF on the spot when you click the checkmark.” In code, the “checkmark” is the **Generate PDF/TXT** block in the “Resume Edits” tab, which is **turned off** (`{false && analysis.resume_edits.length > 0 && (...)}` in ApplicationLabPanel). So ALE does not currently change the resume or generate a new PDF in the UI.

### 4.2 What triggers tailoring?

- **Resume Workshop:** User clicks “Tailor Resume” with job URL and/or manual job description filled.
- **Application Lab:** User runs “Analyze” with job input + resume; result includes `resume_edits`; no automatic tailoring of the stored resume.

### 4.3 How tailoring works

- **Workshop:** Backend fetches user `resumeText` (or originalResumeText, etc.), optionally parses job URL via `interview_prep.job_posting_parser.fetch_job_posting`, then `_analyze_resume_sections(resume_text, job_title, company, location, job_description)` → GPT returns JSON with score, score_label, sections (summary, experience[], skills, keywords). Frontend shows recommendations; no backend rewrite of the main resume.
- **ALE:** Backend (application_lab) produces `resume_edits`; frontend could call `generateEditedResume(userResume, analysis.resume_edits, 'pdf'|'plain')` to get a new PDF/text, but the button block is disabled.

### 4.4 What gets changed

- In **Tailor:** Suggestions for summary, experience bullets, skills to add/remove, keywords and where to add them. User must copy/paste into their own document or use the deprecated “apply” endpoint (which applied one recommendation and saved to library).
- In **ALE:** Edits are per-section suggestions; applying them would be via the disabled “Generate Complete Edited Resume” (PDF/TXT) UI.

### 4.5 Tailored version vs original

- **Workshop:** Tailored output is **not** saved as the main resume unless user uses “Fix” and then “Replace resume.” No “Save tailored version to library” in current UI.
- **ALE:** Edited resume is only generated (when the UI is enabled) as a download; it is **not** written to Firestore or Storage, and **not** set as the main resume.

### 4.6 “It’s supposed to change the resume for ALE”

- **Intended:** User sees resume edits in Application Lab, clicks a checkmark/button, and the app generates a new PDF (and optionally updates the resume for that context).
- **Actual:** The block that calls `handleGenerateEditedResume` (PDF/TXT) is wrapped in `{false && ...}`, so the button never renders. So ALE does not change the resume or produce an on-the-spot PDF in the current build.

---

## 5. Resume PDF Generation

### 5.1 Can the app generate a PDF from edited/tailored data?

- **Backend:** Yes. `pdf_builder.build_resume_pdf_from_text(resume_text)` (ReportLab) builds a PDF from plain text (section headers, bullets). Used by Resume Workshop fix/apply and replace-main.
- **Frontend:** `ResumePDFDownload` uses `@react-pdf/renderer` and `ResumePDF` to generate a PDF from **structured** resume data (name, contact, Summary, Experience, Education, Skills, Projects, Extracurriculars). Used in flows that have structured data (e.g. optimization result). If only `content` (text) exists and no structured data, it throws (“Resume data is in text format only…”).

### 5.2 What triggers PDF generation?

- **Resume Workshop - Fix:** Backend returns `pdf_base64`; user can download or “Replace resume.”
- **Resume Workshop - Replace main:** Backend builds PDF from improved text, uploads to Storage, updates `resumeUrl`/`resumeText`/etc.
- **Resume Workshop - Apply (deprecated):** Backend applies one recommendation, builds PDF, returns base64 and saves to library.
- **Application Lab - Resume Edits:** The “Generate Complete Edited Resume” (PDF/TXT) is the checkmark flow but is **disabled** in the UI.
- **ResumePDFDownload (frontend):** User clicks “Download PDF” where the component is used with structured resume data.

### 5.3 Libraries

- **Backend:** ReportLab (`SimpleDocTemplate`, `Paragraph`, etc.) in `backend/app/services/pdf_builder.py` - `build_resume_pdf_from_text`. Same file has meeting PDF and cover letter PDF.
- **Frontend:** `@react-pdf/renderer` in `ResumePDFDownload.tsx` and `ResumePDF.tsx` for structured resume → PDF.

### 5.4 Is the generated PDF stored?

- **Replace main:** Yes - uploaded to Storage `resumes/{uid}/improved_resume.pdf`, and `resumeUrl`/`resumeText`/etc. updated in Firestore.
- **Fix (no replace):** No - PDF only in response (base64).
- **Apply (deprecated):** Stored in library entry as `pdf_base64` in `resume_library` doc.
- **ALE:** Would be download-only; currently not reachable (UI disabled).

### 5.5 “Edit the resume and generate a new PDF on the spot when you click the checkmark”

- The **checkmark** is the “Generate Complete Edited Resume” area in **ApplicationLabPanel** (Resume Edits tab): “Apply all X edits and get a formatted resume” with PDF/TXT buttons.
- That block is **disabled** by `{false && ...}`, so it never runs. Comment in code: “TODO: PDF generation temporarily disabled - rebuild needed.”
- So: **does not work** in current build; the intended behavior is exactly that block (generate edited PDF/TXT on the spot).

---

## 6. Resume in Email Drafts

### 6.1 How is the resume attached?

- **Route:** `POST /api/emails/generate-and-draft` (emails.py).
- **Resume source:** `resume_url` from payload, or `user_profile.resumeUrl`, or Firestore `user_data.resumeUrl`. Normalized if Google Drive (`_normalize_drive_url`). Filename: payload / user_profile / user_data `resumeFileName` or `"Resume.pdf"`.
- **Download:** `download_resume_from_url(resume_url)` (gmail_client) - GET with User-Agent; for Firebase URLs, retry with signed URL on failure. Max 8 MB; if larger or download fails, drafts are created without attachment.
- **Attachment:** One pre-downloaded `resume_content_for_drafts` (bytes) is attached to each draft via MIME (base64). Same content for all drafts in the request.

### 6.2 Which version is attached?

- **Always the main resume:** The URL is from `users/{uid}.resumeUrl` (or payload/profile). There is no “use library entry” or “use tailored version” for drafts. So: **the single main resume (latest replace/upload)** is what gets attached.

### 6.3 Same URL as Firestore?

- Yes. The URL used for attachment is the same one stored in the user doc (or passed in the request). After “Replace resume” from Workshop, the new `resumeUrl` is that main doc field and is what draft creation uses.

---

## 7. Job Posting URL Integration

### 7.1 Where is job posting URL used?

- **Resume Workshop:** “Job Posting URL” input + “Or enter job details manually” (job title, company, location, job description). Used for Tailor only.
- **Application Lab:** User pastes job URL or description; job URL is parsed by backend when running analysis.
- **Recruiter Spreadsheet:** Has job posting URL for context (separate from resume library).

### 7.2 What happens when the user enters a job URL?

- **Resume Workshop:** Backend `_parse_job_url(job_url)` calls `interview_prep.job_posting_parser.fetch_job_posting(url)` (aiohttp + BeautifulSoup), then optional GPT to extract job_title, company, location, job_description. If parsing fails, frontend shows `URL_PARSE_FAILED` and suggests manual fields.
- **Job posting parser:** Fetches HTML; uses JSON-LD, meta tags, and structure; then `extract_job_details(job_text)` (OpenAI) for full structure. Handles Handshake/LinkedIn/careers.leidos with specific error messages. Many SPA job pages return little HTML, so “needs to be any job posting URL” is **not** satisfied for JS-rendered pages.

### 7.3 “Fix the job posting URL link stuff” / “needs to be any job posting URL”

- **Issues:** (1) Many sites (e.g. LinkedIn, Handshake) are JS-heavy or block bots, so fetch returns minimal or login pages. (2) No generic “paste job description” in Workshop when URL fails - only manual fields. (3) Application Lab has a paste fallback; Workshop could mirror that. (4) Backend returns `url_parse_warning` when URL fails but still requires job_description for manual path.

### 7.4 How job URL connects to tailoring

- Job URL (or manual fields) supplies job_title, company, location, job_description to `_analyze_resume_sections`. No separate “job posting” entity; it’s just input to the one-shot tailor request.

---

## 8. Resume Library

### 8.1 Is there a library?

- Yes. Subcollection `users/{uid}/resume_library/{entryId}`. List: `GET /api/resume-workshop/library`; get one: `GET /api/resume-workshop/library/<id>`; delete: `DELETE /api/resume-workshop/library/<id>`. **No POST** to create an entry from the frontend; creation is only inside the **apply** endpoint.

### 8.2 How are entries stored?

- One document per entry: `id`, `display_name`, `job_title`, `company`, `location`, `created_at`, `pdf_base64`, `score`, `source_base_resume_id`. `_save_to_resume_library` in resume_workshop.py does `db.collection('users').document(user_id).collection('resume_library').document(entry_id).set(entry)`.

### 8.3 “Resume library isn’t saving correctly”

- **Root cause:** The only code path that **writes** to the library is the **apply recommendation** endpoint (`POST /api/resume-workshop/apply`). The frontend **no longer calls** apply (resumeWorkshop.ts `applyRecommendation` returns a deprecation error immediately). So when users use “Tailor Resume” and see recommendations, there is **no “Save to library”** button and no API call that creates a library entry. The library only grows if something had called apply in the past. So the save flow is “broken” in the sense that the current UI never triggers it.

### 8.4 Choosing which resume to use

- No UI or API to select a library entry (or any alternate resume) for drafts or for a given job. All draft attachment uses the main `resumeUrl`.

---

## 9. Known Issues (To-Do List)

### 9.1 “Resume UI makes no sense”

- **Current layout:** Resume is spread across Account Settings (upload/view/delete), Contact Search (upload for this flow), Recruiter Spreadsheet (upload without parsing), Resume Workshop (preview + tailor/fix, no upload), Application Lab (resume required, no upload), and Library (view/download only, no way to add from current UI). So: **multiple upload entry points** with different behavior (parse vs no parse, duplicate Storage uploads), **no single “resume” page**, and **library is a dead end** for saving tailored versions.

### 9.2 “Resume library isn’t saving correctly”

- See §8.3: only the deprecated apply endpoint writes to the library; current UI never calls it, so nothing is saved from Tailor.

### 9.3 “It’s supposed to change the resume for ALE”

- See §4.6: Application Lab is supposed to let users generate an edited PDF (and possibly set it as resume) from the Resume Edits tab; the block that does this is disabled (`{false && ...}`).

### 9.4 “Edit the resume and generate a new PDF on the spot when you click the checkmark”

- See §5.5: the checkmark is the “Generate Complete Edited Resume” (PDF/TXT) in ApplicationLabPanel; it is disabled; when enabled it would call `handleGenerateEditedResume`.

### 9.5 “Fix the resume being attached”

- Recent fix (per your note): draft creation downloads resume once per request, uses Firebase signed URL retry, normalizes Drive URL, and attaches the same bytes to all drafts. So attachment **reliability** is addressed; the **version** attached is still always the main resume (see §6).

---

## 10. File Map

### Backend

| File | Role | Notes |
|------|------|--------|
| `backend/app/routes/resume.py` | Parse upload, delete resume; Storage upload; Firestore save/delete | Single source of truth for parse-resume; DELETE wipes all resume fields |
| `backend/app/services/resume_parser.py` | PDF/DOCX text extraction | DOC returns None |
| `backend/app/services/resume_capabilities.py` | File type validation, capabilities, metadata builder | Used by resume.py |
| `backend/app/utils/users.py` | `parse_resume_info`, `validate_parsed_resume`, `extract_user_info_*` | OpenAI parsing; used by resume + email/scout |
| `backend/app/routes/resume_workshop.py` | Fix, score, tailor (analyze), replace-main, apply (deprecated), library CRUD, _fetch_user_resume_data, _save_to_resume_library | Long file; library write only in apply |
| `backend/app/services/pdf_builder.py` | `build_resume_pdf_from_text`, meeting PDF, cover letter PDF | ReportLab |
| `backend/app/services/interview_prep/job_posting_parser.py` | Fetch + parse job URL; extract_job_details; role category | Used by resume_workshop + interview prep |
| `backend/app/routes/emails.py` | generate-and-draft; resume URL resolution; download and attach resume | Uses gmail_client.download_resume_from_url |
| `backend/app/services/gmail_client.py` | download_resume_from_url, draft creation with attachment, Firebase signed URL retry | Central for attachment reliability |
| `backend/app/services/reply_generation.py` | batch_generate_emails; resume filename / “resume attached” line | Uses resume text for personalization |
| `backend/app/routes/application_lab.py` | Analyze application, resume_edits, fit analysis | Produces edits; no write of resume |
| `backend/app/services/application_lab_service.py` | Analysis + edited resume generation (backend) | Can return PDF base64 for edited resume |
| `backend/app/services/docx_service.py` | DOCX text extraction | Used by resume_parser |
| `storage.rules` | Resume path rules, 10 MB, content types | resumes/{uid}/** |

### Frontend

| File | Role | Notes |
|------|------|--------|
| `connect-grow-hire/src/pages/AccountSettings.tsx` | Resume upload (parse-resume + duplicate Storage + setDoc), view/delete, local state + localStorage | Duplicate upload; minimal Firestore merge |
| `connect-grow-hire/src/pages/ContactSearchPage.tsx` | Resume upload (parse-resume + Storage + updateDoc with minimal resumeParsed), load saved resume | Overwrites full resumeParsed with 4 fields |
| `connect-grow-hire/src/pages/ResumeWorkshopPage.tsx` | Workshop + Library tabs; load resume from Firestore; Tailor/Fix UI; PDF preview; no “Save to library” | Uses resumeWorkshop API |
| `connect-grow-hire/src/services/resumeWorkshop.ts` | fixResume, scoreResume, tailorResume, replaceMainResume, getResumeLibrary, getLibraryEntry, deleteLibraryEntry; applyRecommendation deprecated | All workshop API calls |
| `connect-grow-hire/src/pages/ApplicationLabPage.tsx` | Load userResume from Firestore; analyze; repair; pass userResume to panel | Resume required for analysis |
| `connect-grow-hire/src/components/ApplicationLabPanel.tsx` | Tabs: Overview, Requirements, Resume Edits, Cover Letter; Generate Edited Resume (PDF/TXT) **disabled** | ALE “checkmark” here |
| `connect-grow-hire/src/services/applicationLab.ts` | analyzeApplication, getAnalysis, generateEditedResume, generateCoverLetter, repairResume | generateEditedResume used only when UI enabled |
| `connect-grow-hire/src/components/ResumePDFDownload.tsx` | Download PDF from structured resume via @react-pdf/renderer | Expects structured data |
| `connect-grow-hire/src/components/ResumePDF.tsx` | React-PDF document for structured resume | Used by ResumePDFDownload |
| `connect-grow-hire/src/components/ResumeRenderer.tsx` | Renders structured resume (sections) | Display only |
| `connect-grow-hire/src/utils/resumeFileTypes.ts` | Accepted extensions/MIME, isValidResumeFile | Used by upload UIs |
| `connect-grow-hire/src/pages/OnboardingFlow.tsx` | Optional resume file on completion; calls parse-resume | No duplicate upload |
| `connect-grow-hire/src/pages/RecruiterSpreadsheetPage.tsx` | Resume upload directly to Storage + updateDoc (no parse) | Inconsistent with rest |
| `connect-grow-hire/src/components/EnhancedFitAnalysis.tsx` | Can show resume edits + generate PDF/TXT (if passed through) | Depends on panel |
| `connect-grow-hire/src/components/ResumeActions.tsx` | Job Board: resume actions (e.g. score/optimize) | Used on JobBoardPage |
| `connect-grow-hire/src/components/ResumeOptimizationModal.tsx` | Job Board: optimization modal | Used on JobBoardPage |
| `connect-grow-hire/src/components/ResumeRendererSkeleton.tsx` | Loading skeleton for resume | Display |
| `connect-grow-hire/src/components/ResumeRenderer.css` | Styles for ResumeRenderer | Display |

### Critical path code snippets

**Upload (backend) - save to Firestore:**

```python
# backend/app/routes/resume.py - save_resume_to_firebase
update_data = {
    'resumeText': resume_text,
    'originalResumeText': resume_text,
    'resumeUrl': resume_url,
    'resumeUpdatedAt': datetime.now().isoformat()
}
if resume_metadata:
    update_data.update({...})  # resumeFileName, resumeFileType, resumeUploadedAt, resumeCapabilities
if parsed_info:
    update_data['resumeParsed'] = parsed_info
    update_data['resumeParseVersion'] = 2
db.collection('users').document(user_id).update(update_data)
```

**Upload (Account Settings) - duplicate Storage + merge:**

```ts
// connect-grow-hire/src/pages/AccountSettings.tsx - after POST /api/parse-resume
const storagePath = `resumes/${uid}/${ts}-${file.name}`;
await uploadBytes(storageRef, file);
const downloadUrl = await getDownloadURL(storageRef);
await setDoc(userRef, {
  resumeUrl: downloadUrl,
  resumeFileName: file.name,
  resumeUpdatedAt: new Date().toISOString(),
}, { merge: true });
```

**Draft attachment (resume URL → bytes):**

```python
# backend/app/routes/emails.py
resume_url = payload.get("resumeUrl") or user_profile.get("resumeUrl") or user_data.get("resumeUrl")
resume_content_for_drafts, downloaded_filename = download_resume_from_url(resume_url)
# ...
if resume_content_for_drafts is not None:
    part = MIMEBase(main, sub)
    part.set_payload(data)
    encoders.encode_base64(part)
    part.add_header("Content-Disposition", f'attachment; filename="{filename}"')
    msg.attach(part)
```

**ALE “checkmark” (disabled):**

```tsx
// connect-grow-hire/src/components/ApplicationLabPanel.tsx
{/* TODO: PDF generation temporarily disabled - rebuild needed */}
{false && analysis.resume_edits.length > 0 && (
  <div className="...">
    ...
    <Button onClick={() => handleGenerateEditedResume('pdf')} ...>PDF</Button>
    <Button onClick={() => handleGenerateEditedResume('plain')} ...>TXT</Button>
  </div>
)}
```

**Library save (only path - inside deprecated apply):**

```python
# backend/app/routes/resume_workshop.py - apply_recommendation
library_entry_id = _save_to_resume_library(
    user_id=user_id,
    job_title=job_title,
    company=company,
    location=location,
    pdf_base64=result['pdf_base64'],
    score=score
)
```

---

## Summary Table

| Area | Status | Main issue |
|------|--------|------------|
| Upload | Inconsistent | 3–4 different flows; Account Settings + Contact Search duplicate Storage upload; Recruiter Spreadsheet skips parsing |
| Storage | OK | Single bucket, path `resumes/{uid}/...`, 10 MB, rules in place |
| Parsing | OK | OpenAI v2 structure; DOC not actually parsed |
| Firestore | Fragile | resumeParsed overwritten by Contact Search with minimal subset; multiple writers |
| Display | Scattered | PDF iframe in Workshop/Account; no single “my resume” page |
| Tailor | Works | Recommendations only; no save to main or library |
| ALE / checkmark | Broken | Generate Edited Resume UI disabled |
| PDF generation | Mixed | Backend ReportLab for text; frontend React-PDF for structured; ALE path off |
| Email attachment | Fixed | Single download, retry, same URL as Firestore |
| Job URL | Partial | Parser fails on many JS job sites; no universal “any URL” |
| Library | Broken | No way to save from current UI; only deprecated apply writes |

This audit should give you a complete picture for redesign: unify upload and Firestore writes, add an explicit “Save to library” from Tailor, re-enable or replace the ALE “checkmark” flow, and consider a single resume management surface.
