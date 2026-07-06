# Applications Section: Applications, Resume, Cover Letter

**Date:** 2026-07-06
**Status:** Approved direction from Nick ("go ahead with that"); built on exploration of existing code.
**Scope:** New sidebar section + three pages. Frontend-only — every backend endpoint needed is already live.

## Goal

Give auto-apply, resume tailoring, and cover-letter generation first-class homes in the website sidebar under a new **Applications** section, instead of being buried in Job Board tabs (auto-apply), orphaned (resume tailoring UI), or extension-only (cover letter).

## Sidebar

New labeled section between Engage and the bottom spacer:

```
APPLICATIONS
  Applications   /applications   (ClipboardList; amber count badge when apps need user input)
  Resume         /resume         (FileText)
  Cover Letter   /cover-letter   (PenLine)
```

Badge = count of auto-applications in `needs_attention` + `needs_verification`, polled every 60s via the existing REST list endpoints (Firestore rules deny client reads of `autoApplyJobs`, so no snapshot listener — mirrors how the Job Board tabs already poll).

## Page 1: /applications

Composition of the three existing self-fetching Job Board tab components, stacked as sections on one page:

1. **Needs your answers** — `NeedsAttentionTab` (lists stuck applications; the existing `NeedsAttentionDrawer` flow answers extra ATS questions inline and resumes the submission). This is the "extra questions" section Nick asked for — the mechanism already exists, it just gets a permanent page.
2. **Finish in browser** — `NeedsVerificationTab` (CAPTCHA-blocked applications the user completes manually, then confirms).
3. **All auto-applications** — `AutoSubmissionTab` (in-flight / submitted / failed history).

Free-tier users see a locked state with an upgrade CTA (auto-apply endpoints are Pro/Elite-gated server-side).

**Job Board keeps its tabs unchanged** — the other workstream is actively editing that page; consolidation is a later decision.

## Page 2: /resume

- **Current resume front and center:** PDF preview (iframe on `resumeUrl` from the user doc — same fields Account Settings reads), file name + last-updated, Download, and Replace (multipart upload to the live `POST /api/parse-resume`, which re-parses and re-stores).
- **Tailor to a job (the obvious CTA):** paste a job description (≥50 chars, backend minimum), optional title/company → opens the existing-but-orphaned `ResumeOptimizationModal`, which already drives the live `POST /api/job-board/optimize-resume-v2` (20 credits; direct-edit PDF / suggestions modes). The task adopting it verifies it still works and adapts minimally if not.
- Empty state (no resume on file): upload CTA that uses the same parse endpoint.

## Page 3: /cover-letter

- **Input card:** job posting URL *or* pasted job description (URL wins, per backend), optional title/company. "Generate cover letter (5 credits)" → live `POST /api/job-board/generate-cover-letter` via the existing (currently unused) `apiService.generateCoverLetter` wrapper.
- **Result:** editable textarea, Copy, and "Download PDF" → live `POST /api/job-board/cover-letter-pdf` (new thin api.ts wrapper returning a blob).
- Requires a stored resume; the backend 400s with "No resume found" — surface that as a CTA linking to /resume.

## Non-goals

- No backend changes, no new endpoints, no Firestore rules changes.
- No changes to Job Board's existing tabs or the Chrome extension paths.
- No resume "library"/versioning revival (killed 2026-05-26; only the single stored resume).
- No structured resume text editor in v1 — "edit" = replace upload + tailor-to-job. (The old Workshop editor was deleted end-to-end; rebuilding it is its own project if wanted.)

## Decisions log (Claude, decisive-mode; flag to Nick if wrong)

- "Similar to how Source works" interpreted as the existing Needs-Attention answer-questions drawer flow + a Loops-style sidebar count badge (nothing named "Source" exists in the codebase).
- Badge polls REST (60s) instead of Firestore listener — rules deny client subcollection reads on autoApplyJobs.
- Job Board tabs left untouched to avoid colliding with the parallel workstream.
