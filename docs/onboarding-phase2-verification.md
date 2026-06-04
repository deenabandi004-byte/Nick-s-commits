# Onboarding Rewrite — Phase 2 Verification

**Date:** 2026-06-03
**Scope:** Parse-bug fixes that make the Confirm step's prefill actually work, plus the Bug 3 auth lockdown. No flow/UI rebuild yet (that's Phase 3).

## What changed

| Bug | Fix | Files |
|-----|-----|-------|
| **Bug 1** — resume parse response read the wrong shape (`data.year/major/university`, which the endpoint never returns) | New shared helper `resumePrefillFromParse()` reads the real nested shape `data.education.{university,major,graduation}` + `data.contact.{email,phone}` and maps `graduation → graduationYear` (4-digit extraction). Both read sites now use it. | `connect-grow-hire/src/utils/onboardingPrefill.ts` (new), `connect-grow-hire/src/pages/OnboardingFlow.tsx`, `connect-grow-hire/src/pages/OnboardingProfile.tsx` |
| **Bug 2** — LinkedIn enrichment never returned education (Firecrawl wins the tier loop; its minimal schema omits education) | New `backfill_education()` pulls university/major/degree/graduation from an education-capable provider (PDL → Bright Data) when the winning tier lacks a university. Wired into the onboarding enrichment route. No-op when education is already present. | `backend/app/utils/linkedin_enrichment.py`, `backend/app/routes/enrichment.py` |
| **Bug 3** — `/api/parse-resume` had no auth decorator | Added `@require_firebase_auth`; route now reads `request.firebase_user['uid']` instead of manually decoding the Bearer token. | `backend/app/routes/resume.py` |

### Bug 3 caller guard (done before changing auth)

All callers of `/api/parse-resume` attach a Firebase Bearer token from the signed-in user:
`AccountSettings.tsx:369`, `ContactSearchPage.tsx:922`, `OnboardingProfile.tsx:115`, `ProfilePreview.tsx:2519`, `OnboardingFlow.tsx:136`. The public resume tools (`find_companies_public`, `find_jobs_public`) call the `parse_resume_to_profile` **util** server-side — they do **not** hit this HTTP endpoint. No intentionally-unauthenticated caller exists, so the lockdown is safe.

## Verification

### Bug 2 — automated test (offline, mocked providers)

`backend/tests/test_linkedin_education_backfill.py` — 4 tests, all passing:

```
tests/test_linkedin_education_backfill.py::test_backfill_education_fills_from_pdl_when_missing PASSED
tests/test_linkedin_education_backfill.py::test_backfill_education_falls_through_to_brightdata PASSED
tests/test_linkedin_education_backfill.py::test_backfill_education_noop_when_already_present PASSED
tests/test_linkedin_education_backfill.py::test_backfill_education_handles_no_education_anywhere PASSED
======================= 4 passed in 0.29s ========================
```

Run: `cd backend && FLASK_ENV=testing .venv/bin/pytest tests/test_linkedin_education_backfill.py -v`

Covers: Firecrawl-shaped result (name present, education empty) → education backfilled from PDL; PDL empty → falls through to Bright Data; education already present → no extra provider call; no provider has education → no crash, unchanged.

### Bug 1 — helper logic check (frontend has no test runner)

The frontend has no test framework (backend-only per project setup), so Bug 1 is verified by exercising the helper logic against a realistic `/api/parse-resume` response shape:

```
OLD flat reads (the bug):
  data.year       = undefined
  data.major      = undefined
  data.university = undefined

NEW helper output (resumePrefillFromParse):
{
  "name": "Maya Patel",
  "firstName": "Maya",
  "lastName": "Patel",
  "email": "maya@usc.edu",
  "phone": "310-555-0188",
  "university": "University of Southern California",
  "major": "Business Administration",
  "graduationYear": "2026"          // extracted from "May 2026"
}
```

Confirms: the old flat reads were always `undefined` (the bug); the new helper reliably yields `university`, `major`, and a 4-digit `graduationYear` from the nested `education` object.

### Manual end-to-end check (for when Phase 3 wires the Confirm step)

Dev server: `cd connect-grow-hire && npm run dev`, open `/dev/onboarding-preview`.
1. **Resume path:** on the Profile step, upload a PDF resume with an education section. Expect name/email/phone to auto-fill immediately, and `localStorage.resumeData` to contain `{university, major, graduationYear}`. (Phase 3 binds these into the Confirm step.)
2. **LinkedIn path:** paste a `linkedin.com/in/...` URL and blur. The enrichment route now returns `academics.{university, major, graduationYear}` even when Firecrawl is the scraping tier (education backfilled from PDL/Bright Data).
3. **Manual path:** provide neither — onboarding still completes; no `resumeParsed` is written (expected, not a bug).

### Type / compile checks

- `python3 -m py_compile` on all edited backend files: **OK**.
- `backfill_education` imports cleanly (no circular import): **OK**.
- `tsc --noEmit` on the frontend: **no type errors** in `onboardingPrefill.ts`, `OnboardingFlow.tsx`, `OnboardingProfile.tsx`.
- Broader backend suite (resume/enrich/linkedin/onboard keyword): **102 passed**; the 1 failure is a pre-existing missing-CSV-fixture in `test_contact_import.py` (matched on "linkedin" in a dedup test), unrelated to these changes.

## Notes / fields still empty

- The **manual path writes no `resumeParsed`** by design — confirmed expected behavior, not a bug.
- `graduationYear` is normalized to a 4-digit year; if a resume/LinkedIn record has no parseable year, it stays `""` and the Confirm step's year field is left for the user (safety-net behavior).
- LinkedIn `email`/`phone` are frequently null from scrape providers; the Confirm step will rely on resume or manual entry for those.
