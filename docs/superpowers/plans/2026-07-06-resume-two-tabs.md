# Resume Page Two Tabs (Edit + Tailor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild /resume as two tabs — **Edit** (structured resume editor with real-time preview + PDF download) and **Tailor** (paste a job URL or description → job-specific resume) — resurrecting the deleted-but-recoverable resume pipeline from git history.

**Architecture:** The old pipeline is fully recoverable and shape-compatible: Firestore `resumeParsed` → `normalizeParsedResumeFromFirestore()` → `ParsedResume` editor state (structured field forms) → `parseResumeToPdfPayload()` → PascalCase display shape consumed by BOTH `ResumeRenderer` (live HTML preview, on disk today) and `ResumePDF` (@react-pdf/renderer, in git history; the package is still installed). Save = client `setDoc` of `resumeParsed` (legal per firestore.rules). Tailor passes `jobUrl` straight to `optimize-resume-v2`, which parses it server-side via `parse_job_url()` (job_board.py:7385-7396).

**Tech Stack:** React 18 + TS, `@react-pdf/renderer` ^4.3.1 (already installed). No new packages, no backend changes.

**Recovery source:** `git show 833982c^:<path>` for `connect-grow-hire/src/types/resume.ts`, `src/utils/resumePDFGenerator.tsx`, `src/components/ResumePDF.tsx`, and (as reference only) `src/pages/ResumePage.tsx` (1300-line old editor).

## Global Constraints

- Frontend only. No backend, rules, or extension changes.
- `ResumeRenderer.tsx` + css + skeleton are used as-is (adopted, not modified) unless compilation requires a minimal fix — document any change.
- The upload/replace flow must STOP clobbering `resumeParsed`: today's page writes a thin `{name, year, major, university}` stub after `/api/parse-resume` already stored the full parse server-side. New flow: upload → server parses+stores → client re-reads the user doc. Do not copy the stub write forward.
- Tailor gating: enabled when `jobUrl.trim()` is a plausible URL OR `jobDescription.trim().length >= 50`. Keep "Tailor resume · 20 credits" copy and the `ResumeOptimizationModal` flow (it already accepts a `jobUrl` prop).
- Repo has unrelated modified files: `git add` only named paths. Commit per task.
- tsc gate per task; final `npm run build`.

---

### Task A: Resurrect the resume data/PDF foundation

**Files:**
- Create (from git history, adapted only as needed to compile): `connect-grow-hire/src/types/resume.ts`, `connect-grow-hire/src/utils/resumePDFGenerator.tsx`, `connect-grow-hire/src/components/ResumePDF.tsx`

**Interfaces (produced, consumed by Task B):**
- `types/resume.ts`: `ParsedResume` (lowercase keys, `education: ParsedResumeEducationEntry[]`), `emptyParsedResume(): ParsedResume`, `normalizeParsedResumeFromFirestore(data: any): ParsedResume | null`, plus the entry interfaces.
- `utils/resumePDFGenerator.tsx`: `parseResumeToPdfPayload(data: ParsedResume | null): any` (lowercase→PascalCase adapter, education array→single object), `generateResumePDF(data: ParsedResume): Promise<Blob>`.
- `components/ResumePDF.tsx`: `<ResumePDF resume={payload}/>` (@react-pdf/renderer Document).

- [ ] Restore each file verbatim: `git show 833982c^:connect-grow-hire/src/types/resume.ts > connect-grow-hire/src/types/resume.ts` (same pattern for the other two).
- [ ] Fix ONLY what tsc forces (import paths, dead imports of deleted modules — e.g. if `resumePDFGenerator` imports anything from the deleted `resumeWorkshop.ts`, excise that import and any function that needed it, documenting each excision). `generateResumePDF` + `parseResumeToPdfPayload` + the types MUST survive intact.
- [ ] Verify: `npx tsc --noEmit 2>&1 | grep -E "types/resume|resumePDFGenerator|ResumePDF"` → no output. Also confirm `ResumeRenderer.tsx` still typechecks against `parseResumeToPdfPayload`'s output (write nothing yet — just confirm the shapes line up by reading; note discrepancies for Task B).
- [ ] Commit: `git add` the three files → `feat(resume): resurrect resume types, PDF generator, and ResumePDF from history`

### Task B: Rebuild ResumePage with Edit + Tailor tabs

**Files:**
- Rewrite: `connect-grow-hire/src/pages/ResumePage.tsx`

**Interfaces:**
- Consumes: everything Task A produced; `ResumeRenderer` (`import ResumeRenderer from "@/components/ResumeRenderer"` — check its actual export style); existing upload endpoint `POST /api/parse-resume`; `updateDoc(doc(db,'users',uid), { resumeParsed })` for save; `generateResumePDF` for download; `ResumeOptimizationModal` (existing props incl. `jobUrl?`); `apiService.parseJobUrl` exists (api.ts:2309) if a URL-preview step is wanted — optional, since optimize-resume-v2 parses server-side anyway.

Structure (keep today's shell/header; replace the body):

- Tab strip: **Edit resume** | **Tailor to a job** (house tab styles — copy the underline-tab pattern from MyNetworkPage's strip).
- **Edit tab**, two columns on lg+ (form left, live preview right; stacked below):
  - Load: user doc → `normalizeParsedResumeFromFirestore(data.resumeParsed)`; if null → `emptyParsedResume()` + prominent upload CTA banner ("Upload your resume to get started — we'll fill this in for you").
  - Editor sections adapted from the OLD page (`git show 833982c^:connect-grow-hire/src/pages/ResumePage.tsx`, editor JSX + immutable updater callbacks): Name+Contact, Objective, Education (add/remove entries), Experience (add/remove roles, add/remove bullets), Projects, Skills (per-category comma-separated inputs), Extracurriculars. Trim styling to today's tokens; keep the updater pattern.
  - Live preview: `<ResumeRenderer resume={parseResumeToPdfPayload(resumeData)} />` re-rendering from the same state (sticky container, own scroll).
  - Action row: **Save** (updateDoc `{ resumeParsed: resumeData, resumeUpdatedAt: ... }`, toast, disable while saving, dirty-tracking so the button reads Saved/Save), **Download PDF** (`generateResumePDF(resumeData)` → blob → `<a download="{name || 'resume'}.pdf">`), **Replace file** (existing hidden-input flow MINUS the stub write; after success re-run the load so the editor repopulates from the fresh server parse).
- **Tailor tab**: today's card + a new **Job URL** input above the description textarea ("Paste a job posting URL — we'll read it for you"). Gate: URL present OR JD ≥50 chars. Pass `jobUrl` into `ResumeOptimizationModal` alongside jobDescription/jobTitle/company. Helper copy notes URL wins server-side.
- [ ] Verify: tsc filtered to `ResumePage|ResumeRenderer|ResumePDF|resumePDFGenerator|types/resume` → nothing new; manual: typing in any editor field updates the preview immediately.
- [ ] Commit: `feat(resume): two-tab Resume page — live structured editor + URL-driven tailoring`

### Task C: Build + review sweep

- [ ] `npm run build` → ✓.
- [ ] Task reviews (per SDD) both green; fix loop as needed.
- [ ] Smoke notes for Nick: docx preview problem is gone (Edit tab renders the parsed resume, no iframe); upload no longer clobbers the full parse.
