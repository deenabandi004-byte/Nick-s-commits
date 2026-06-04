# Onboarding Write-Map — Phase 1

**Date:** 2026-06-03
**Status:** APPROVED 2026-06-03 with corrections (folded in below). Phase 2 in progress.
**Companion docs:** `docs/onboarding-audit.md` (current-behavior source of truth).
**Governing constraint (from the implementation brief):** onboarding writes into the **exact field names current consumers already read**. No new canonical schema, no invented keys, no shim layer beyond what consumers require. Where a logical value is read under several names, onboarding writes all of them. Consumer read logic is not changed (except the two parse-bug fixes in Phase 2).

This document maps every value the new 5-step flow collects to the Firestore path(s) it must write, the consumer each path satisfies, and that path's **source-priority position** (is it the first thing the consumer reads, or a fallback?).

---

## How to read the "priority" column

A consumer resolves a logical field through an ordered fallback chain. "P1" means onboarding's write lands on the **first** path the consumer checks; "P3" means three other paths are checked first. Writing the P1 path is what guarantees the consumer sees onboarding's value rather than a stale or empty earlier source.

---

## 1. Identity — name / email / phone (collected: Step 3 Confirm)

| Value | Write path | Consumer(s) | Priority | Notes |
|-------|-----------|-------------|----------|-------|
| first name | `profile.firstName` | email name fallback (`reply_generation.py:420-429`), `getUserOnboardingData` (`firebaseApi.ts:273`, reads `pi.firstName \|\| d.firstName \|\| profile.firstName \|\| d.name`) | email P-fallback; loader P3 | Keep current shape. |
| last name | `profile.lastName` | email name fallback (`reply_generation.py:420-429`) | fallback | |
| full name | `profile.fullName` = `${first} ${last}` | email "ABOUT THE SENDER" name (`users.py:773-774`) | P1 for display name | Matches current write (`OnboardingFlow.tsx:178`). |
| email | `profile.email` | signature contact line (`reply_generation.py:436-447`) | — | This is the typed contact email; the account email also lives top-level `email` (set from Firebase Auth at sign-in, **never overwritten by onboarding** — it's on the `BLOCKED_FIELDS` list, `users.py:25-30`). |
| phone (optional) | `profile.phone` | signature contact line (`reply_generation.py:436-447`) | — | Empty string if not given. |
| linkedin URL | `profile.linkedinUrl` | user signature linkedin (audit notes email reads `user_profile.linkedin` for signature, `reply_generation.py:438`) | — | Keep. Also the input that drives LinkedIn enrichment (Step 2). |

**No change from today's `profile.*` shape** (`OnboardingFlow.tsx:177-184`). Step 3 is the writer; on the manual path the user types these, on the parse path they're prefilled (Phase 2 fixes make prefill actually work).

---

## 2. Academics — university / major / graduationYear (collected: Step 3 Confirm, folded in from the killed Academics page)

| Value | Write path(s) | Consumer(s) reading that path | Priority | Notes |
|-------|--------------|-------------------------------|----------|-------|
| university | `academics.university` | email/warmth (`personalization.py:489-496`, `warmth_scoring.py:89-96` — alumni +20, the single strongest warmth signal) | **email P1 of the academics branch** (after `resumeParsed.*`) | The email engine's resolved order is `academics.university` → `resumeParsed.education.university` → `resumeParsed.university` → `professionalInfo.university` → `user_profile.university`. |
| university (dup) | top-level `university` | `getUserOnboardingData` (`firebaseApi.ts:266`, → Dashboard discovery cards, suggestion chips, job-board frontend), company_recommendations (`company_recommendations.py:285`, P1), Scout alumni context | loader P4 / company-rec **P1** | Current flow already writes both (`OnboardingFlow.tsx:185-187`). Keep both. |
| university (dup) | `academics.college` | belt-and-suspenders; some readers check `d.college` (`firebaseApi.ts:275`) | deep fallback | Current flow writes this (`OnboardingFlow.tsx:188`). Keep — it's a path a consumer reads. |
| major | `academics.major` | email/warmth (`personalization.py:499-504`; `shared_major` lead-type), job board field-alignment (`job_ranking.py`), company-rec `major` (`company_recommendations.py:290`) | email P1 of branch | Resolved order `academics.major` → `resumeParsed.education.major` → `resumeParsed.major`. |
| graduationYear | `academics.graduationYear` | email sender-status (`personalization.py:507-515`, drives the anti-"fellow alum" guardrail), job board grad-fit, Scout academics, `getUserOnboardingData` (`firebaseApi.ts:277`) | mixed; loader P2 | Resolved order for email: `academics.graduationYear` → `user_profile.year` → `user_profile.graduationYear` → parsed `resumeParsed.education.graduation`. |
| degree | `academics.degree` | (low usage) prefill/echo surfaces | — | Collected on Confirm; keep writing for parity with today. |
| graduationMonth | `academics.graduationMonth` | (low usage) | — | Keep; cheap, already in shape. |

**Folding note:** the standalone Academics step is cut; these fields move onto the Confirm step (Step 3). The write paths are unchanged from today (`OnboardingFlow.tsx:186-193`).

---

## 3. Career track (collected: Step 4 Direction — single-select chip, REQUIRED)

This is the highest-leverage and **most fragile** field. The email + warmth engines do **not** read a `targetIndustries` array for the track — they read the **careerTrack string** and run it through a normalizer (`normalize_career_track`, `industry_classifier.py:75`) to derive a canonical industry bucket. So the *string we store* must be one the normalizer recognizes. Separately, Scout / company-recommendations / Dashboard read a **human-readable industries array**. So a track selection fans out to two kinds of write.

### 3a. The careerTrack string

| Write path(s) | Consumer(s) | Priority | Notes |
|--------------|-------------|----------|-------|
| top-level `careerTrack` | email (`personalization.py:578-583`), warmth (`warmth_scoring.py:121-126`), company-rec (`company_recommendations.py:334-338`), Dashboard (`DashboardPage.tsx`), `getUserOnboardingData` (`firebaseApi.ts:278`) | email/warmth **P2** (after `goals.careerTrack`); company-rec **P2**; loader P1 | Current flow writes this flat (`OnboardingFlow.tsx:196`). |
| nested `goals.careerTrack` | email (`personalization.py:578`), warmth (`warmth_scoring.py:121`) | email/warmth **P1** | **APPROVED to write.** Current flow does NOT write this (flat only); email/warmth find it via the P2 flat fallback today. Writing `goals.careerTrack` (camelCase) lands the consumer's P1 path. Part of the approved nested `goals` object (§6 #2). |

### 3b. The derived industries array

| Write path(s) | Consumer(s) reading it | Priority | Notes |
|--------------|------------------------|----------|-------|
| top-level `targetIndustries` | `getUserOnboardingData` P1 (`firebaseApi.ts:271`) → Dashboard cards, suggestion chips, job-board frontend; company-rec source #4 (`company_recommendations.py:303`) | loader **P1** | |
| nested `goals.targetIndustries` | Scout user_context **P1** (`scout_assistant.py:132`), company-rec source #3 (`company_recommendations.py:302`) | Scout **P1** | **APPROVED (camelCase).** Scout reads `goals.targetIndustries`. Current flow writes no `goals` object → Scout's industries are empty for every current user. Writing this fixes a live gap. |

### 3c. careerTrack chip → stored value mapping — **APPROVED (label/value split)**

**Rule (approved):** the chip UI shows the friendly **label**; onboarding stores a canonical **value** underneath. Never leak the raw stored value into any UI. The stored `careerTrack` value is one of the **verbatim non-composite keys** from `CAREER_TRACK_TO_INDUSTRY` (`industry_classifier.py:56-69`) so `normalize_career_track` (used by email + warmth) resolves it. The slashed composite keys (`tech / software engineering`, `finance / corporate finance`) are **not** stored — the clean keys `tech` / `finance` are used instead. `INDUSTRY_ALIASES` (`company_recommendations.py`) resolves the `targetIndustries` strings for company-rec/Scout scoring.

**"Private Equity / VC" is split into two chips** (`Private Equity`, `Venture Capital`), each storing its own canonical key — this removes the PE/VC bucketing conflict from onboarding's plate.

Final mapping (chip count: 9):

| Display chip (UI label) | Stored `careerTrack` value | `normalize_career_track` → | Stored `targetIndustries` |
|-------------------------|----------------------------|----------------------------|---------------------------|
| Investment Banking | `investment banking` | `investment_banking` | `["Investment Banking"]` |
| Management Consulting | `consulting` | `consulting` | `["Consulting"]` |
| Private Equity | `private equity` | `private_equity` | `["Private Equity"]` (→Finance) |
| Venture Capital | `venture capital` | `venture_capital` | `["Venture Capital"]` (→Finance) |
| Product Management | `product management` | `tech` | `["Product Management"]` (→Tech) |
| Software Engineering | `tech` | `tech` | `["Technology"]` (→Tech) |
| Sales & Trading | `Sales & Trading` | *(no bucket — accepted)* | `["Finance"]` *(hard-coded in onboarding map)* |
| Corporate Finance / FP&A | `finance` | `finance` | `["Finance"]` |
| Other | `Other` | *(no bucket — accepted)* | `[]` |

Notes:
- **Sales & Trading**: no normalizer bucket exists, so email industry-tone won't fire (accepted); `targetIndustries` is set directly to `["Finance"]` so Scout/Dashboard/company-rec still get a signal.
- **Other**: no bucket, empty industries (general fallback).
- Each `targetIndustries` value is chosen to resolve through `INDUSTRY_ALIASES` (`_resolve_industry`) to a real sector. PE/VC both resolve to `Finance` in that map — that's a company-rec concern, not onboarding's, now that the chips are split.
- **Caveat (flag):** a few downstream surfaces (`suggestionChips.ts`, `promptGallery.ts`) read the stored `careerTrack` and may render it; the stored values are lowercase canonical keys. If any surface displays it verbatim, it would show e.g. "investment banking" lowercased. This is a pre-existing consumer-display behavior, out of scope to fix here, surfaced for the later consumer-unification project.

### 3d. Derived roles — **APPROVED: leave empty**

| Write path(s) | Consumer | Priority | Decision |
|--------------|----------|----------|----------|
| `goals.targetRoles` | Scout (`scout_assistant.py:133`, → `target_roles`) | Scout P1 | **Leave empty / do not write.** No track→role map exists; approved not to fabricate one. Scout omits the block when empty. |
| top-level `extractedRoles` / `preferredJobRole` | `getUserOnboardingData` (`firebaseApi.ts:279`, `:278`) → Dashboard `roleFromTrack` (own fallback, `DashboardPage.tsx:106`) | loader | **Leave to existing fallback.** |

---

## 4. Dream companies (collected: Step 4 Direction — multi, optional)

| Write path(s) | Consumer(s) | Priority | Notes |
|--------------|-------------|----------|-------|
| top-level `dreamCompanies` | email (`emails.py:213` → `personalization.py:586`; `dream_company` lead-type + warmth +10), job board (`job_ranking.py` dream-company bonus), `getUserOnboardingData` (`firebaseApi.ts:276`), warmth (`warmth_scoring.py:130`) | email P-after-arg; loader P1; warmth P2 | Current flow writes this flat (`OnboardingFlow.tsx:197`). |
| nested `goals.dreamCompanies` | Scout (`scout_assistant.py:134` → `dream_companies`), email/warmth **P1** (`personalization.py:586`, `warmth_scoring.py:130` read `goals.dreamCompanies` first) | Scout P1; email/warmth P1 | Not written today → Scout dream-companies empty for current users. Write it. |
| top-level `targetFirms` | Dashboard (`DashboardPage.tsx` targetFirms), `getUserOnboardingData` (`firebaseApi.ts:279`, `d.targetFirms \|\| d.dreamCompanies`) | loader P1 (else falls to dreamCompanies) | Brief asks to write explicitly. The loader already falls back to `dreamCompanies`, but writing `targetFirms` lands the P1 path. |

---

## 5. Resume / LinkedIn parse output (collected: Step 2; persisted by backend endpoints, made reliable by Phase 2 fixes)

Onboarding does **not** write these from the frontend `finalData` — they're written server-side by the parse/enrich endpoints. Listed here because they ARE the `resumeParsed` source the email engine, coffee chat, job board, and recruiter finder all depend on, and the Confirm step's prefill reads from them.

| Write path | Written by | Consumer(s) | Notes |
|-----------|-----------|-------------|-------|
| `resumeParsed` (+ `resumeParseVersion`) | `/api/parse-resume` → `save_resume_to_firebase` (`resume.py:156-157`); `/api/enrich-linkedin-onboarding` merge (`enrichment.py:245-252`) | email skills/experience/extracurriculars (`personalization.py:530-575`), job board (`job_board.py:929`), coffee chat, recruiter finder | Nested `education{university,major,graduation}`, `experience[]`, `skills{}`, etc. |
| `resumeText`, `originalResumeText`, `resumeUrl`, `resumeUpdatedAt`, `resumeFileName`, `resumeFileType`, `resumeCapabilities` | `/api/parse-resume` (`resume.py:137-149`) | email PDF attach, resume text consumers | Resume path only. |
| `linkedinUrl`, `linkedinEnrichmentData`, `linkedinEnrichmentSource`, `linkedinEnrichedAt`, `linkedinResumeParsed` | `/api/enrich-linkedin-onboarding` (`enrichment.py:236-242`) | LinkedIn enrichment cache; merged into `resumeParsed` | LinkedIn path only. **Phase 2 Bug 2** makes `linkedinResumeParsed.education` reliably populated. |

**Manual path:** if the user chooses manual entry (neither resume nor LinkedIn), **none** of these are written — there is no synthesized fallback (audit §6). The user doc holds only typed profile/academics/direction. Downstream `resumeParsed` consumers degrade to empty (audit §5). This is expected; surfaced as a flag, not a bug.

---

## 6. Landmines & flags (Part 4 asked these be surfaced, not acted on)

1. **careerTrack chip labels don't normalize — RESOLVED via label/value split (§3c).** 4 of the original 8 labels weren't keys in `CAREER_TRACK_TO_INDUSTRY` (`industry_classifier.py:56-69`). Resolution: store verbatim non-composite canonical keys, split PE/VC into two chips, `Sales & Trading` stores its label + hard-coded `["Finance"]`, `Other` no bucket. No consumer logic touched.

2. **The nested `goals` object is currently never written, so Scout's entire goals block is empty for every user onboarded by the current flow.** Scout reads `goals.targetIndustries / targetRoles / dreamCompanies / recruitingFor` (`scout_assistant.py:128-135`), and email/warmth read `goals.careerTrack` / `goals.dreamCompanies` as their **P1** path. Writing a nested `goals: { careerTrack, dreamCompanies, targetIndustries, targetRoles?, recruitingFor? }` is **consumer-required** (not an invented duplicate) and fixes this live gap. The current flat-only write (`OnboardingFlow.tsx:194-197`) is why it's broken today.

3. **Part 3's `goals.target_industries` / `goals.target_roles` / `goals.dream_companies` (snake_case) are not real read paths.** The Firestore source keys Scout reads are **camelCase** (`goals.targetIndustries`, `goals.targetRoles`, `goals.dreamCompanies`). Snake_case appears only as the *output* context dict keys (`scout_assistant.py:131-134` maps `targetIndustries` → `"target_industries"`). Writing snake_case would create dead keys. The write-map uses the real camelCase paths.

4. **PE/VC bucketing disagreement across consumers.** `industry_classifier` keeps `private_equity` and `venture_capital` distinct; `INDUSTRY_ALIASES` (`company_recommendations.py`) collapses both to `Finance`. The combined `Private Equity / VC` chip can't satisfy both cleanly. Not fixable without consumer changes; flagged.

5. **`professionalInfo.*` is read by many consumers as a fallback but is never written by onboarding** (audit §2). Several `university`/`careerTrack`/`major` reads check `professionalInfo` (e.g. company-rec P2 `professional.get("careerTrack")`, `company_recommendations.py:335`). New flow continues not writing it; the top-level + `academics` + `goals` writes cover every reader's chain, so this is fine — noted so it isn't mistaken for a gap.

6. **Bug 3 — RESOLVED: lock it down.** `/api/parse-resume` had no `@require_firebase_auth` decorator (`resume.py:193`); it manually decoded the Bearer token and persisted only when present. Guard confirmed no intentionally-unauthenticated caller (all 5 frontend callers attach a token; public resume tools call the parse util server-side, not this endpoint). Phase 2 adds the decorator and reads `request.firebase_user['uid']`.

---

## 7. Intent field — "what brings you to Offerloop" (collected: Step 4) — **RESOLVED: Option B**

**Decision (approved):** write under its own key **`onboardingIntent`** (top-level), documented as a **forward-looking field with no current consumer** — the upcoming guided-search-chips feature is the intended consumer. Single-select, **optional, no gate**. This is an explicit deferred-consumer field, not a silent dead key.

Labels (value stored = label string):
1. `Land a job through networking`
2. `Break into a competitive field`
3. `Find and track applications`
4. `Improve my outreach and emails`
5. `Just exploring`

| Write path | Consumer | Notes |
|-----------|----------|-------|
| top-level `onboardingIntent` | **none yet** (guided-search-chips, planned) | Forward-looking. Do not route into `careerGoals` / `goals.recruitingFor` / `directionNarrative` — those are freeform-narrative fields read by other surfaces and would mis-shape. |

Search findings that informed the decision (kept for the record):

**No consumer reads a one-tap categorical "why are you here" intent.** There is nothing that consumes an intent enum. There ARE three adjacent **freeform-narrative** fields that *are* read, but each expects prose, not a category, and each is written by a different existing surface:

| Candidate path | Who reads it | Shape it expects | Currently written by |
|----------------|--------------|------------------|----------------------|
| top-level `careerGoals` | coffee chat prep injects it into prompts as "Career Goals: {careerGoals}" (`coffee_chat_prep.py:153,299,429`); `getUserOnboardingData` reads it as the `personalContext` fallback (`firebaseApi.ts:281`); ProfilePreview narrative (`ProfilePreview.tsx:511`) | freeform sentence(s) | resume `objective` extraction (`users.py:647,663`) — in-memory, not reliably persisted |
| nested `goals.recruitingFor` | Scout user_context → `recruiting_for` (`scout_assistant.py:134`, `scout_assistant_service.py:725`) | short freeform ("what they're recruiting for") | nothing writes it today |
| top-level `directionNarrative` / `personalContext` | suggestion chips (`suggestionChips.ts:23-24`), FirmSearchPage (`FirmSearchPage.tsx:175-176`), ProfilePreview, `getUserOnboardingData` (`firebaseApi.ts:280-281`) | freeform "what they want" / "anything we missed" | ProfilePreview Direction extractor |

**Why Option B over routing into an existing field:** the one-tap intent is categorical; none of `careerGoals` / `goals.recruitingFor` / `directionNarrative` is a clean home (all are freeform-narrative, read by other surfaces). Routing a category into `careerGoals` would feed coffee-chat prompts "Career Goals: Just exploring," which reads oddly. So it gets its own `onboardingIntent` key.

---

## Phase 1 checkpoint — resolutions (approved 2026-06-03)

1. **careerTrack chip → stored-value mapping (§3c):** APPROVED with the label/value split, verbatim non-composite canonical keys, PE/VC split into two chips, `Sales & Trading` → store label + hard-coded `["Finance"]`, `Other` → no bucket.
2. **Nested `goals` object (§6 #2):** APPROVED. Write `goals.{careerTrack, dreamCompanies, targetIndustries}` in **camelCase**. `goals.targetRoles` left empty. No snake_case keys.
3. **Intent field (§7):** Option B — write `onboardingIntent`, forward-looking, optional, no gate. Labels locked.
4. **Bug 3 / parse-resume auth (§6 #6):** LOCK IT DOWN. Add `@require_firebase_auth` to `/api/parse-resume` after confirming no unauthenticated caller. (Guard result: all 5 callers attach a Bearer token; the public resume tools call the parse *util* server-side, not this endpoint. Safe.)
5. **Rest of map (identity, academics, dreamCompanies all three paths, resumeParsed source):** confirmed correct. Manual-path-writes-no-resumeParsed is expected behavior, not a bug.
