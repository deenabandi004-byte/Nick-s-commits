# Onboarding System Audit (Discovery Only)

**Date:** 2026-06-03
**Scope:** How Offerloop onboarding works today — what it collects, where it's stored, and every place that data is consumed downstream.
**Constraint:** Investigation only. No application code was changed. This document is the only file created.
**Method:** Read of `connect-grow-hire/` (React/TS), `backend/` (Flask/Python), `firestore.rules`. Citations are `path:line`. Anything inferred rather than read explicitly is marked `[INFERRED]`.

> **TL;DR of the shape:** Onboarding is a single-route, 5-step in-component state machine. Nothing persists until the final step, when the **frontend writes directly to Firestore** (no Flask submit endpoint). The user doc is created at sign-in (before step 1) with `needsOnboarding: true`; the final write flips it to `false`. Auth is **Google-only** (Firebase popup); a **separate** Gmail OAuth runs right after sign-in. Downstream, ~20 features read profile fields through ~8 independent fallback chains, and **none hard-errors on missing data** — they all silently degrade to generic output.

---

## 1. Current onboarding flow (frontend)

### Entry / gate — where the flow starts

- **Trigger field:** `needsOnboarding` on the Firestore user doc, read into auth state at `FirebaseAuthContext.tsx:156`. Set `true` for every new user at sign-in (`FirebaseAuthContext.tsx:173`, `:216`).
- **`ProtectedRoute` gate** (`App.tsx:147-207`): if `user.needsOnboarding` is true and the user is anywhere other than `/onboarding`, redirect to `/onboarding?returnTo=<encoded current path>` (`App.tsx:195-202`). On `/onboarding` itself, allow (`App.tsx:196-198`).
- **`PublicRoute`** (`App.tsx:245-252`): authenticated user with `needsOnboarding` → `/onboarding`; otherwise → `/dashboard`.
- **Route** (`App.tsx:274-282`): `/onboarding` → `<ProtectedRoute><OnboardingFlow/></ProtectedRoute>`. The `onComplete` prop is a no-op; completion is handled inside the component. Dev preview at `/dev/onboarding-preview` renders the flow unauthenticated with no save (`App.tsx:296-299`).

The flow is **one route with no sub-routes**. All five steps render under `/onboarding`, switched by the `currentStep` state var: `"welcome" | "profile" | "academics" | "goals" | "location"` (`OnboardingFlow.tsx:14`, `:35`). The aggregate state object is `onboardingData = { location, profile, academics, goals }` (`OnboardingFlow.tsx:16-21`, `:44-48`). The progress header shows 4 dots (profile→academics→goals→location); welcome is index 0 (`OnboardingFlow.tsx:276-308`).

### Steps, in order

| # | Step | Route (currentStep) | Component | Fields collected | Validation |
|---|------|--------------------|-----------|------------------|------------|
| 1 | Welcome | `/onboarding` (`welcome`) | `connect-grow-hire/src/pages/OnboardingWelcome.tsx` | None. Display-only. Props `onNext`, `userName` (`OnboardingWelcome.tsx:5-8`); `userName = user?.name \|\| "there"` (`OnboardingFlow.tsx:313`) | None |
| 2 | Profile | `/onboarding` (`profile`) | `OnboardingProfile.tsx` | `firstName`, `lastName`, `email`, `phone`, `avatar?`, `resume?` (File), `linkedinUrl`, `linkedinEnrichment?` (interface `ProfileData` `:11-20`, state `:29-37`) | `firstName` **required** (`:266`), `lastName` **required** (`:282`), `email` **required** `type=email` (`:297,:301`); `phone` optional `type=tel`; `resume` optional, must be pdf/docx/doc to parse (`:101`,`:107-108`); `linkedinUrl` optional, inline error if non-empty and missing `linkedin.com/in/` (`:242-246`) |
| 3 | Academics | `/onboarding` (`academics`) | `OnboardingAcademics.tsx` | `university`, `degree`, `major`, `graduationMonth`, `graduationYear` (interface `AcademicData` `:12-18`, state `:662-673`); also receives `linkedinData` prop (`:31`) | Only `major` has native `required` (`:835`). `university`/`degree`/`graduationMonth`/`graduationYear` are **not** required and have no JS guard before `onNext` (`:684-687`). Degree options associate/bachelor/master/doctoral/certificate/other (`:783-788`); year range 1940..currentYear+10 (`:705`) |
| 4 | Goals | `/onboarding` (`goals`) | `OnboardingGoals.tsx` | `careerTrack` (string), `dreamCompanies` (string[]) (interface `GoalsData` `:19-22`, state `:35-38`) | **Entirely skippable** via "Skip for now" (`:147-166` → `onSkip`). No required fields. `careerTrack` single-select from 8 tracks (`:8-17`); `dreamCompanies` via `DreamCompanyAutocomplete`, pending text flushed on submit (`:45`) |
| 5 | Location / Career Prefs | `/onboarding` (`location`) | `OnboardingLocationPreferences.tsx` | `country`, `state`, `city`, `jobTypes` (string[]), `interests` (string[]), `preferredLocation` (string[]) (interface `:12-19`, state `:97-104`) | **No required fields, no submit guard** (`:109-112`). `country`/`state`/`city` are in the interface but **have no UI inputs** — always `""`. `jobTypes`: Internship/Part-Time/Full-Time (`:134`); `interests`: ~130 options (`:28-61`); `preferredLocation`: US cities (`:63-89`). Submit disabled while `isSubmitting` (`:360`) |

### Navigation

All transitions are `setCurrentStep(...)` in `OnboardingFlow.tsx`:
- Welcome → Profile: `onNext` inline (`:313`).
- Profile → Academics: `handleProfileData` (`:69-97`), may trigger LinkedIn enrichment fallback, then `setCurrentStep("academics")` (`:96`). Profile Back → welcome (`:319`).
- Academics → Goals: `handleAcademicsData` (`:99-103`).
- Goals → Location: `handleGoalsData` (`:105-112`) or `handleGoalsSkip` (`:114-117`).
- Location → submit: `handleLocationData` (`:119-256`).
- Shared **Back**: `handleBack` (`:258-262`) — academics→profile, goals→academics, location→goals. (Goals step UI has **no Back button** — only "Skip for now" + "Continue", `OnboardingGoals.tsx:147-174`.)
- Each step fires a fire-and-forget `onboarding-event` POST on view/complete (`:50-67`, `:95`, `:101`, `:110`, `:115`, `:214`).

> **Validation gap:** Enforcement is purely native HTML `required` on a handful of Profile inputs. There is no JS gate before `onNext` on any step, so Academics (only `major` required) and Location (nothing required) can be walked through nearly empty, and Goals can be skipped outright. `[INFERRED]` that native `required` blocks submit since each step is a `<form onSubmit>` with a `type=submit` button.

### Final submit & landing

Final submit is `handleLocationData` (`OnboardingFlow.tsx:119-256`):
1. If a resume File exists, POST to `${BACKEND_URL}/api/parse-resume`, store a subset in `localStorage.resumeData` (`:125-153`), then `mergeLinkedInData()` if a linkedinUrl exists (`:156-158`).
2. Fill `university`/`major` gaps from resume parse (`:166-173`).
3. Build `finalData` (`:176-211`): `profile` (with `fullName`), top-level `university`, nested `academics`, **flat** `careerTrack`/`dreamCompanies` (only if present, `:196-197`), `location` (with `interests` also written as `careerInterests` and `career_interests`, `:202-205`), `onboarding.completedAt`.
4. Persist via `completeOnboarding(finalData)` (`:217`).
5. Set `sessionStorage.onboarding_just_completed = "true"` (`:220`), wait 500ms, `refreshUser()` (`:226`), fire analytics callback (`:230`).
6. **Navigate:** default `"/home"` (`:236`); if a valid `returnTo` exists (decoded, not containing `/onboarding` or `/signin`) use it instead (`:239-245`); `navigate(destination, {replace:true})` (`:250`).

**Where the user lands:** `/home` is a redirect → `<Navigate to="/dashboard" replace />` (`App.tsx:313`). So with no `returnTo`, the user ends on **`/dashboard`** (the Home page). With a valid `returnTo`, they land there instead.

---

## 2. Onboarding data persistence (Firestore)

### Canonical write: frontend → Firestore directly

The onboarding payload is written **client-side via the Firebase Web SDK**, not through Flask. It lives in `completeOnboarding()` at `FirebaseAuthContext.tsx:303-404`, writing to `doc(db, "users", user.uid)` (`:325`):
- If the doc exists → `updateDoc` with `tier`/`maxCredits` **stripped** (security rules), setting `credits=300`, `emailsMonthKey`, `emailsUsedThisMonth=0`, `needsOnboarding:false` (`:343-374`).
- If not → `setDoc` creating the full doc with `tier:"free"`, `credits/maxCredits=300`, `needsOnboarding:false` (`:375-403`).
- A `clean()` helper strips `undefined` recursively before writing (`:328-335`).

### Incremental vs all-at-once

**All at once, at the final step.** Steps 1-4 only update React state (`setOnboardingData`, `OnboardingFlow.tsx:70,100,106`). Persistence fires only inside `handleLocationData` → `completeOnboarding` (`:217`). Two **side-effect** writes happen mid-flow but are not the onboarding payload: LinkedIn enrichment (Profile step) and resume parse (final step) — see §3.

### Document shape (`users/{uid}`)

Combining `finalData` (`OnboardingFlow.tsx:176-211`) with the wrapper fields in `completeOnboarding`:

```jsonc
{
  // identity / account (set at sign-in, re-stamped here)
  "uid": "string",
  "email": "string",                 // Firebase Auth, not user input
  "name": "string",                  // Firebase displayName
  "picture": "string | undefined",   // Firebase photoURL
  "tier": "free",                    // setDoc-create path only; stripped on update
  "maxCredits": 300,                 // setDoc-create path only; stripped on update
  "credits": 300,
  "emailsMonthKey": "2026-06",
  "emailsUsedThisMonth": 0,
  "createdAt": "ISO-8601",           // only if absent
  "needsOnboarding": false,          // flipped true -> false here

  "profile": {
    "fullName": "string",            // `${firstName} ${lastName}`
    "firstName": "string",
    "lastName": "string",
    "email": "string",
    "phone": "string",
    "linkedinUrl": "string"          // "" if none
  },

  "university": "string",            // flat duplicate of academics.university

  "academics": {
    "university": "string",
    "college": "string",             // duplicate of university
    "degree": "string",
    "major": "string",
    "graduationMonth": "string",
    "graduationYear": "string"
  },

  // goals: FLAT top-level keys, NOT nested. Omitted if empty.
  "careerTrack": "string",           // OnboardingFlow.tsx:196
  "dreamCompanies": ["string"],      // OnboardingFlow.tsx:197

  "location": {
    "country": "string",             // always "" (no UI)
    "state": "string",               // always "" (no UI)
    "city": "string",                // always "" (no UI)
    "jobTypes": ["string"],
    "interests": ["string"],
    "careerInterests": ["string"],   // duplicate of interests
    "career_interests": ["string"],  // snake_case duplicate
    "preferredLocation": ["string"]
  },

  "onboarding": { "completedAt": "ISO-8601" }
}
```

**Shape notes:**
- **Goals are top-level**, not nested (comment at `OnboardingFlow.tsx:194-195`: flat "for backwards compat with backend reads that check both paths"). Auth context still reads `goals?.careerTrack` as a legacy fallback (`FirebaseAuthContext.tsx:157`), but the writer no longer produces a `goals` object.
- **`interests` is triplicated** (`interests`, `careerInterests`, `career_interests`) to satisfy multiple reader paths (`OnboardingFlow.tsx:202-204`; readers in `users.py:32-47`).
- **`university` is duplicated** at top level and under `academics`/`academics.college`.
- **No `professionalInfo` object is written by current onboarding.** It's referenced only as a legacy read fallback (`FirebaseAuthContext.tsx:157`, `users.py:41`). `[INFERRED]` dead/legacy for new signups.

### Subcollections touched around onboarding
- `users/{uid}/integrations/gmail` — written by the Gmail OAuth callback (§4), not onboarding proper.
- Resume binary → Firebase **Storage** at `resumes/{uid}/{filename}`, with metadata written back to the user doc (§6).

---

## 3. Write path (backend)

There is **no Flask endpoint that ingests the onboarding form.** The backend participates only via side channels:

### 3.1 `POST /api/users/onboarding-event` — analytics only
`backend/app/routes/users.py:279-310`. Called fire-and-forget per step (`OnboardingFlow.tsx:52-60`). Validates `event ∈ {viewed,completed}` and `step ∈ {welcome,profile,academics,goals,location}` (`:293-299`), calls `log_event(...)` (`:301-305`). **Never writes profile fields.** Always returns `{ok:true}` so it can't break the client (`:309-310`).

### 3.2 `POST /api/enrich-linkedin-onboarding` — enriches + writes to user doc
`backend/app/routes/enrichment.py:120-291` (`@require_firebase_auth`). Called from Profile step (`enrichLinkedInOnboarding`, `api.ts:2379`) and post-resume (`mergeLinkedInData` with `{merge_only:true}`, `api.ts:2392`).
- Requires/normalizes `linkedin_url` (`:146-152`); per-user cache keyed on stored `linkedinUrl` (`:168-190`).
- Provider chain scrape-first: **Firecrawl → Bright Data → PDL**, LLM-structured per tier, accepts first tier yielding a `name` (`:202-233`).
- Writes via `user_ref.set(..., merge=True)` (`:254-255`): `linkedinUrl`, `linkedinEnrichmentData`, `linkedinEnrichmentSource`, `linkedinEnrichedAt`, `linkedinResumeParsed`, and creates/merges `resumeParsed` (`:236-252`).
- Returns `profile{firstName,lastName,email,phone}` + `academics{university,major,degree,graduationYear}` for auto-fill (`:269-286`).

### 3.3 `POST /api/parse-resume` — parses resume, writes user doc + Storage
`backend/app/routes/resume.py:193+`. **Not decorated with `@require_firebase_auth`** — it manually parses the Bearer token (`:263-270`) and only persists if a valid token decodes; unauthenticated calls still parse and return data.
- Validates file type PDF/DOCX/DOC (`:216-220`), extracts text (`:228`), parses via `parse_resume_info` (`:240`).
- If authed: uploads to Storage (`:277`), saves text/URL/parsed/metadata via `save_resume_to_firebase` (`:293-299`).

### 3.4 Post-onboarding edits (not the flow itself)
`/api/users/update-preferences` (`users.py`) enforces a `BLOCKED_FIELDS` blocklist (`:25-30`: `tier, subscriptionTier, credits, maxCredits, lastCreditReset, stripeCustomerId, stripeSubscriptionId, subscriptionStatus, alumniSearchesUsed, coffeeChatPrepsUsed, interviewPrepsUsed, email`) and strips them before writing (`:213-227`) — needed because the Admin SDK bypasses Firestore rules. `/api/users/profile-confirm` is a separate Phase-1 "personalization data layer" confirm step, not called by `OnboardingFlow`.

### When the account & user doc are created
**Before step 1.** The user doc is created at sign-in, redundantly in two places, both with `needsOnboarding:true`:
- `signIn()` (`FirebaseAuthContext.tsx:205-220`): first sign-in `setDoc({tier:"free", credits:300, maxCredits:300, needsOnboarding:true, createdAt, lastSignIn})`, returns `"onboarding"`.
- `loadUserData()` (`:162-179`): the `onIdTokenChanged` listener also creates the doc if missing, same defaults.

So by the time `OnboardingFlow` mounts, the doc exists; onboarding flips `needsOnboarding` to `false` in the final write. `@require_tier` treats a missing doc as `'free'` defensively (`extensions.py:306-307`).

---

## 4. Auth

### Firebase Google sign-in (app login)
- **Frontend:** `GoogleAuthProvider` + `signInWithPopup(auth, provider)` (`FirebaseAuthContext.tsx:189-197`), triggered from `SignIn.tsx` `handleGoogleAuth` → `signIn({prompt:"consent"})` (`:202-211`).
- **Scopes at login:** **none beyond default OpenID profile/email.** Comment at `FirebaseAuthContext.tsx:191`: "No Gmail scopes here anymore. We only sign the user into your app." Only custom param is `prompt` (`:192-194`).
- **SDK init:** `lib/firebase.ts:9-30`, project `offerloop-native`, hardcoded fallback config, `experimentalForceLongPolling:true`.
- **Backend verification:** `@require_firebase_auth` (`extensions.py:132-266`) reads `Authorization: Bearer <token>`, `verify_id_token(..., clock_skew_seconds=5)` with up to 3 retries + backoff (`:171-261`), sets `request.firebase_user`. `@require_tier` (`:269-335`) reads tier from Firestore (`subscriptionTier` → `tier` → `free`).

### Separate Gmail OAuth (3-legged) — for drafts
Distinct from login. `backend/app/routes/gmail_oauth.py`, prefix `/api/google` (`:16`).
- **Scopes** (`GMAIL_SCOPES`, `config.py:38-45`): `gmail.compose`, `gmail.readonly`, `gmail.send`, `openid`, `userinfo.email`, `userinfo.profile`.
- **Routes:** `GET /api/google/oauth/start` (`:61`) builds consent URL with all scopes (`:114-120`), stamps a `state` doc; `GET /api/google/oauth/callback` (`:160`) exchanges code, calls Gmail `getProfile` (`:223-225`), stores creds at `users/{uid}/integrations/gmail` (`:273`) + `gmailAddress` (`:274-275`) + reverse-lookup `gmail_mappings/{email}` (`:279`).
- **When it triggers:** **immediately after Firebase sign-in, before the app.** In `SignIn.tsx:222-235`, after `signIn()` resolves, `checkNeedsGmailConnection()` → if not connected, `initiateGmailOAuth(false)` does `window.location.replace(authUrl)`. On return (`?connected=gmail`), routes to `localStorage.post_gmail_destination` (`/onboarding` or `/home`). **New-user order:** Google sign-in → Gmail OAuth consent → onboarding.

### Account creation & onboarding ordering
- Account/user-doc creation is triggered by the first successful Firebase Google sign-in (`FirebaseAuthContext.tsx:205-220` / `:162-179`).
- **Onboarding runs strictly after authentication.** `/onboarding` is inside `ProtectedRoute`; an unauthenticated user can never reach it. All side-channel calls attach a Firebase ID token.

### Non-Google signup path
**None.** Repo-wide search for `createUserWithEmailAndPassword`, `signInWithEmailAndPassword`, `EmailAuthProvider`, `sendSignInLink` in `connect-grow-hire/src/` returns **zero results**. `SignIn.tsx` shows "Sign in" / "Create account" tabs, but **both invoke the same single Google button** (`handleGoogleAuth`, `:391-436`) — no email/password fields. The Chrome extension is also Google-only.

---

## 5. Consumers of onboarding data (the true minimum field set)

A structural fact up front: **the same logical field resolves through ~8 independent fallback chains** (warmth_scoring, runs.py, company_recommendations, getUserOnboardingData, search_suggestions, networking_roadmap, job_board, coffee_chat). The same field can resolve to different values depending on which consumer reads it — a latent consistency risk. And **no consumer hard-errors on missing data**; every path degrades to generic output, which makes "missing profile" invisible in the UI.

### 5.1 Email generation / outreach (most important)

Live path: `POST /api/emails/generate-and-draft` → `emails.py:98` → `score_contacts_for_email()` + `batch_generate_emails()` (`reply_generation.py:337`). Two normalization layers consume profile fields: `extract_user_info_from_resume_priority()` (`backend/app/utils/users.py:715`, the "ABOUT THE SENDER" block + signature) and `build_user_profile()` → `NormalizedUserProfile` (`backend/app/utils/personalization.py:460`, drives warmth + lead type). (`recruiter_email_generator.py` exists but is **not wired to any route** — dead in this flow.)

**Source-priority chains** (the order each field is resolved):
- **University:** `academics.university` → `resumeParsed.education.university` → `resumeParsed.university` → `professionalInfo.university` → `user_profile.university` (`personalization.py:489-496`; `warmth_scoring.py:89-96`).
- **Major:** `academics.major` → `resumeParsed.education.major` → `resumeParsed.major` (`personalization.py:499-504`).
- **Year:** `academics.graduationYear` → `user_profile.year` → `user_profile.graduationYear` → parsed `resumeParsed.education.graduation` (`personalization.py:507-515`).
- **Career track:** `goals.careerTrack` → `user_profile.careerTrack` → `professionalInfo.careerTrack` (`personalization.py:578-583`).
- **Dream companies:** `user_data.dreamCompanies` (`emails.py:213`) → `goals.dreamCompanies` → `user_profile.dreamCompanies` (`personalization.py:586`).
- **Hometown/location:** `user_profile.hometown`/`professionalInfo.hometown`; `user_profile.location`/`professionalInfo.location` (`personalization.py:524-525`).
- **Past companies / skills / extracurriculars:** from `resumeParsed.*` (`personalization.py:530-575`).
- **Personal note:** `user_data.personalNote` (`emails.py:212`) → `user_profile.personalNote` (`personalization.py:595`).

| Field | Read at | How used | If missing |
|-------|---------|----------|-----------|
| name | `users.py:773-774`; `reply_generation.py:420-429` | sign-off, sender intro, signature | falls back profile→first+last→`auth_display_name`→literal `"Student"` |
| university | `personalization.py:489`; prompt `:775,:896,:994` | "ABOUT THE SENDER", alumni hook, signature; shortened via `get_university_shorthand` | prompt prints `"Not specified"`; alumni lead-type can't fire |
| major | `personalization.py:499`; prompt `:776,:897` | sender intro, `shared_major` matching | `"Not specified"`; rule `:1052` omits major from intro |
| year/graduationYear | `personalization.py:507`; `reply_generation.py:914-926` | computes `sender_status` (student/recent_grad/alum); guards "fellow alum"; "Class of {year}" signature | defaults `current_student` (`:926`); label "(graduation year unknown)" |
| careerTrack | `personalization.py:578`; warmth `:121` | `role_match` lead-type, industry-tone vocab block, warmth +15 | no role-match, no tone block |
| dreamCompanies | `emails.py:213`; `personalization.py:586` | `dream_company` lead-type (+warmth), warmth +10 | no signal; resume_context line omitted |
| hometown/location | `personalization.py:524`; warmth `:138` | `shared_hometown` lead-type, warmth +8, common-ground block | no signal; block empty |
| pastCompanies | `personalization.py:530-550` | `shared_company` lead-type, warmth +15 | no signal |
| resumeParsed.skills | `personalization.py:553` | `skills_overlap` (≥2 shared), resume_context | no signal; line omitted |
| personalNote | `emails.py:212`; `personalization.py:595` | common-ground facts, "Personal context" prompt line | line empty |
| careerInterests/career_interests | `emails.py:108,207`; `reply_generation.py:1012-1019` | industry-tone calibration (consulting/finance/tech) | no tone block; backfilled from `resumeParsed.career_interests` |
| resumeText/resumeUrl | `emails.py:107,114-148` | parsed into `user_info`; attached as PDF | backfills payload→userProfile→Firestore; else proceeds profile-only, no attachment |
| emailTemplate (purpose, stylePreset, customInstructions, signoff, signatureBlock) | `emails.py:176-186` | prompt instructions + signature | falls back Firestore template → `"Best,"` |

**Warmth + lead type (two stages):**
- Stage 1 numeric (`warmth_scoring.py`): same university **+20**, same major **+10**, same hometown **+8**, same past employer **+15**, role matches target industry **+15**, dream company **+10** (`:175-308`). Tiers warm≥50 / neutral≥25 / else cold (`:20-23`). Note: the `_score_role_match` bucket (+15) is keyed on the **search query**, not onboarding, and is inactive in the draft flow because `emails.py:227` passes no `search_context`. `[INFERRED]`
- Stage 2 lead-type + tier upgrade (`personalization.py:172-208`): priority `alumni > dream_company > shared_company > career_path > shared_major > recent_transition > skills_overlap > shared_hometown > ... > role_match > general`. Upgrades: alumni +2, shared_company +2, dream_company +1, shared_major +1, shared_hometown +1. Final tier drives prompt tone/word-count (`reply_generation.py:946-980`).

**Anti-hallucination prompt** (`reply_generation.py:990-1094`): the "ABOUT THE SENDER (use these facts; never invent)" block injects name, sender status (from year), university, hometown, personal note, with rules against claiming "fellow alum" / inventing shared schools/employers. Source-labeled enrichment sections (PDL / LinkedIn / web / company news) enforce attribution. Onboarding fields feeding it: `name`, `year`, `university`, `hometown`, `personalNote`.

**PDL career history:** the **contact's** PDL data is normalized into `career_path`, `schools`, `skills` (`personalization.py:618`) and rendered into the prompt verbatim (`reply_generation.py:823-872`). The **user's** profile is matched against it for warmth: user university ∩ contact schools (alumni), user past companies ∩ contact career_path (shared_company), user major ∩ contact school majors (shared_major), user dream companies ∩ contact company (dream_company), user skills ∩ contact skills (skills_overlap).

**Missing-field behavior is fail-soft throughout:** warmth scoring is try/except → `{}` → all contacts `cold` (`warmth_scoring.py:553-558`); `build_user_profile` failure → empty `NormalizedUserProfile`, generation continues (`reply_generation.py:465-469`); no commonality → `general` strategy with honest 3-part instruction, no faked research (`personalization.py:1380-1424`). `name` is the only field with a hard literal fallback (`"Student"`).

### 5.2 Find page — what actually scores

Neither "Find recommendation" lives in `FindPage.tsx` (a thin tab shell; its only "match" text is static copy at `:341`). Two real things:

- **Contact warmth scoring** (`backend/app/utils/warmth_scoring.py`) — scores People results after a FIND search. Invoked from `runs.py:601` / `:607`; warmth persisted to each contact doc (`runs.py:867-870`: `warmthScore`, `warmthTier`, `warmthLabel`). Reads university, major, pastCompanies, careerTrack, dreamCompanies, hometown, resumeParsed via `_build_user_comparison_data` (`warmth_scoring.py:63-172`). `runs.py:542-568` assembles `user_profile` from the `professionalInfo/info` subcollection + top-level fields; if none → `{name:"", email}`. **Missing:** each signal truthiness-guarded; no profile → zero shared-identity points, contacts still return sorted by data-richness only. No error.
- **Company recommendation engine** (`backend/app/services/company_recommendations.py`) — produces ranked company cards with "scout sentences." **Wired only into Scout/agent** (`agent_actions.py:649`, `search_suggestions.py:12`), **not** Find or Dashboard. `[INFERRED]` Scoring (`:239-272`): +2.0 industry match, +1.0 location, +1.0 career-track, +0.5 alumni. **Missing:** all candidates score 0 → alphabetical default 5; scout sentence degrades real-alumni→generic.

`[INFERRED]` "Find page recommendation cards" as a user-facing grid does not exist as the audit prompt implies — the closest user-facing personalized cards are the **Dashboard discovery cards** (§5.4).

### 5.3 Scout AI prefill

- **sessionStorage bridge** (`scout_auto_populate`) carries **failed-search parameters, not onboarding data.** Written at `ScoutSidePanel.tsx:461-474`; read at `ContactSearchPage.tsx:647-661` and `FirmSearchPage.tsx:242-253`. Payload: `job_title`, `company`, `location`, `prompt`, `autoSubmit`. **No onboarding fields cross this bridge directly.** Dashboard discovery cards also write `scoutAutoPopulate` nav-state (`DashboardPage.tsx:549`), derived from onboarding-built cards.
- **Scout backend user_context** (`backend/app/routes/scout_assistant.py:100-274`, 5-min cached) is where onboarding data reaches Scout: `academics` (`:119-125`), `goals{target_industries, target_roles, dream_companies, recruiting_for}` (`:128-135`), `location` (`:138-143`), `emailTemplate` (`:146-152`), `professionalInfo` (`:155-160`), `personalNote` (`:163-165`), `resume` (`:169-171`), plus subcollection summaries. Rendered by `_build_user_context_prompt` (`scout_assistant_service.py:701-816`). **Missing:** each block is `if present` — omitted when empty; an anti-gaslighting "PROFILE ACCESS" rule prevents fabrication (`:706-708`).

### 5.4 Broad sweep — other consumers (several you may not expect)

| Consumer | Fields read | Read at | If missing |
|----------|------------|---------|-----------|
| Dashboard discovery cards (client) | extractedRoles/preferredJobRole, careerTrack, targetIndustries, targetFirms/dreamCompanies, preferredLocations, university | `DashboardPage.tsx:156-200`, profile via `firebaseApi.getUserOnboardingData:404` | hard-coded `fallbackFirms`/`fallbackIndustries` by track; generic Goldman/McKinsey/Google if track empty; role defaults "Analyst" |
| Job board ranking | careerTrack, major, resumeParsed.skills, graduationYear, dreamCompanies, target_industries, jobTypes | `job_ranking.py:269-320`; `job_board.py:746,929` (5-min cache) | component-guarded; type-default +15 only |
| RecommendedJobs (frontend) | professionalInfo.targetIndustries, jobTypes, locationPreferences/preferredLocation | `RecommendedJobs.tsx:164-192` | defaults `["Internship"]`, empty lists |
| Coffee chat / Meeting Prep | university, resume_text (hometown/companies), major/fieldOfStudy, year/graduationYear | `coffee_chat_prep.py:20-92`, `routes/coffee_chat_prep.py:142-170`, `coffee_chat.py:814` | `('none',{})` commonality / empty context; prep still generates |
| Recruiter / Hiring-Manager finder | user_resume, resume_text | `recruiter_finder.py:807-809,964,1088`; `RecruiterSpreadsheetPage.tsx:143-181` | email-gen skipped; recruiters still found |
| Agent / Loops | professionalInfo.university (preferAlumni), resumeText, careerInterests, resumeParsed, targetIndustries | `agent_actions.py:115-285,649`; `loop_service.py:617,632`; `loop_jobs.py:59` | preferAlumni skipped; warmth/recs degrade |
| Suggestion chips / prompt gallery | university, graduationYear, targetIndustries, preferredLocations, dreamCompanies, careerTrack, targetFirms, extractedRoles, preferredJobRole | `suggestionChips.ts:13-31`; `promptGallery.ts:26-31`; `suggestionEngine.ts:16-80`; `search_suggestions.py:44-112` | literal defaults ('finance','New York','2026','analyst'); always renders generic |
| GoalsPromptBanner | careerTrack (presence) | `GoalsPromptBanner.tsx:34-35` | banner shows **because** field missing |
| Morning Briefing | professionalInfo/goals.careerTrack | `briefing.py:107-112`; `MorningBriefing.tsx` | generic calendar context |
| Networking roadmap | careerTrack, graduationYear, university, dreamCompanies, tier | `networking_roadmap.py:90-138` | literal `'Not specified'` injected into LLM prompt |
| Nudge service | major, university variants | `nudge_service.py:228-253`; `NudgePanel.tsx` | `'not specified'` |
| `getUserOnboardingData` (shared loader) | firstName, university, graduationYear, targetIndustries, preferredLocations, dreamCompanies, careerTrack, preferredJobRole, targetFirms, extractedRoles, directionNarrative, personalContext | `firebaseApi.ts:222-283` | each `\|\| ''` or `\|\| []` |

**Surprises worth flagging:**
1. `company_recommendations.py` is consumed only by Scout/agent, **not** Find or Dashboard.
2. `dashboard.py:144 /recommendations` reads **zero** onboarding fields — it's contact-activity-based despite the name.
3. Networking roadmap and Morning Briefing silently inject literal `'Not specified'` strings into LLM prompts when fields are empty.
4. No consumer hard-errors on missing data — a user who skipped onboarding still gets full-looking but un-personalized output everywhere.
5. `[INFERRED]` `embedding_ranker.py` / `intent_gates.py` read `target_industries`/profile for search-intent gating (not deep-read).

---

## 6. Resume and LinkedIn parsing

### Resume upload
Uploaded at two points, both POSTing to `POST /api/parse-resume`: on the Profile step (`OnboardingProfile.tsx:97-155`, auto-fills name/email/phone) and at final submit (`OnboardingFlow.tsx:124-164`, persists). No frontend parser — all backend.
- Text extraction: `resume_parser.py:67` (pdfplumber for PDF, docx extractor for DOCX/DOC).
- Field extraction: `parse_resume_info()` (`backend/app/utils/users.py:330`) → OpenAI **gpt-4o-mini** (`:454`), first 8000 chars. Structure: `name`, `contact{email,phone,location,linkedin,github,website}`, `education{degree,major,university,graduation,gpa,coursework,honors,minor}`, `experience[]`, `projects[]`, `skills{...}`, `extracurriculars[]`, `certifications[]`, etc. (`:359-438`).
- Writes to `users/{uid}` (`save_resume_to_firebase`, `resume.py:106-185`): `resumeText`, `originalResumeText`, `resumeUrl`, `resumeUpdatedAt`, `resumeParsed` (+`resumeParseVersion:2`), `resumeFileName`, `resumeFileType`, `resumeCapabilities`. File → Storage `resumes/{uid}/{filename}` (`resume.py:22-30,277`).

### LinkedIn URL
Handled by `enrichLinkedInOnboarding` / `mergeLinkedInData` (`api.ts:2379-2403`) → `POST /api/enrich-linkedin-onboarding` (`enrichment.py:120`). Fires on LinkedIn-field blur (`OnboardingProfile.tsx:45-90`, 8s timeout) and after resume upload at final submit (`OnboardingFlow.tsx:156-158`).
- Provider chain scrape-first: **Firecrawl → Bright Data → PDL** (`linkedin_enrichment.py:225-229`), Jina only if `ENABLE_JINA_FALLBACK=1`. LLM-structured per tier via gpt-4o-mini (`:579`).
- Writes `users/{uid}`: `linkedinUrl`, `linkedinEnrichmentData`, `linkedinEnrichmentSource`, `linkedinEnrichedAt`, `linkedinResumeParsed`, and merges into `resumeParsed` (resume primary; if no resume, LinkedIn **becomes** `resumeParsed`) (`enrichment.py:236-252`; merge logic `linkedin_enrichment.py:721-791`).
- Returns `profile{firstName,lastName,email,phone}` + `academics{university,major,degree,graduationYear}` for prefill (`enrichment.py:269-286`).

### Neither provided
Onboarding **still completes** — neither is required. With neither, **no** `resumeText`/`resumeParsed`/`resumeUrl`/`linkedinResumeParsed`/`linkedinEnrichmentData` is ever written; the user doc holds only manually-typed profile/academics/location/goals. **No synthesized fallback profile exists** — downstream features that read `resumeParsed` simply find it empty and degrade (§5).

### Bugs surfaced during the audit
- **Field-shape mismatch** (`OnboardingFlow.tsx:145-152`): reads flat `result.data.year/major/university`, but the backend nests these under `data.education.*` and has no top-level `year`. So resume academics never reach `localStorage.resumeData`, and the academics gap-fill at `:172-173` can't recover them. Net: resume reliably auto-fills only **name** (and email/phone from `contact`) into the form, **not academics**.
- **`/api/parse-resume` is unauthenticated at the decorator level** (`resume.py:193`); persistence is conditional on a manually-decoded Bearer token (`:263-300`).
- **Firecrawl (first-choice LinkedIn provider) returns no education** by schema (`linkedin_enrichment.py:421`), so LinkedIn-driven academics auto-fill only works when Bright Data or PDL wins the tier loop.

---

## 7. Trial and subscription state

### Stripe trial
**Yes — 30 days, applied at checkout-session creation**, the only place it's configured: `stripe_client.py:74-77` (`'subscription_data': {'trial_period_days': 30}`), for both Pro and Elite. Status flows via webhooks → `subscriptionStatus` in Firestore (`stripe_client.py:183,212`); `trialing` surfaced at `billing.py:403-405`. Price IDs (`config.py:166-168`): Pro `price_1ScLXrERY2WrVHp1bYgdMAu4`, Elite `price_1ScLcfERY2WrVHp1c5rcONJ3`; `get_tier_from_price_id()` defaults unknown IDs to `'pro'` (`stripe_client.py:12-23`).

### Tier model
Three tiers. Backend source of truth `config.py:173-262` (`TIER_CONFIGS`); frontend mirror `constants.ts:4-35`.

| | Free | Pro | Elite |
|---|---|---|---|
| Monthly credits | 500 | 3000 | 12000 |
| Max contacts/search (backend) | 5 | 20 | 40 |
| Batch size | 1 | 5 | 15 |
| Alumni searches | 10 (lifetime) | unlimited | unlimited |
| Coffee chat preps | 3 (lifetime) | 10/mo | unlimited |
| Firm search / smart filters / bulk drafting / export | No | Yes | Yes |
| Priority queue / personalized templates / weekly insights / early access | No | No | Yes |
| Uses resume | No | Yes | Yes |
| Max loops | 1 | 5 | 50 |

Prices ($9.99 Pro / $34.99 Elite) live in Stripe + `Pricing.tsx` copy, not `TIER_CONFIGS`. **Tier source of truth in Firestore:** `subscriptionTier` (canonical) → `tier` (legacy), e.g. `extensions.py:312`, `billing.py:455`, `firestore.rules getUserTier`. (Some endpoints read legacy `tier` specifically — `billing.py:97,401`.)

### Paywall / gating
- **Backend `@require_tier`** (`extensions.py:269-335`): always reads tier from Firestore, returns 403 on insufficient tier. Gated routes: `timeline.py:101` (pro/elite), `job_board.py:7602` (pro/elite), all `agent.py` endpoints (elite), `email_template.py:160,194,237` (elite). Loops deliberately **not** gated.
- **Feature-check API:** `billing.py:480 /api/user/check-feature` → `auth.can_access_feature()` (`auth.py:116-162`) maps features to `TIER_CONFIGS` flags + usage-limited features.
- **Frontend gates:** `gates/FeatureGate.tsx` (→ `useFeatureGate` → backend check), `gates/UpgradeModal.tsx`, `ProGate.tsx` (`isFree = !user?.tier || tier==="free"`, used in Timeline/Recruiter/CoffeeChat pages), `EliteGateModal.tsx` (`FindPage.tsx:411`, `ContactSearchPage.tsx:2779`), `LockedFeatureOverlay.tsx`.
- **Firestore rules** block client writes to `tier`, `subscriptionTier`, `stripeSubscriptionId`, `stripeCustomerId`, `maxCredits`, `credits`; exports gated by tier.

### Free vs paid
Distinguished purely by `subscriptionTier`/`tier` value; `subscribed = tier in ['pro','elite']` (`billing.py:408`). Free usage limits are **lifetime, never reset** (`auth.py:85-87`); Pro/Elite counters reset at calendar-month boundary (`:98-110`); credits reset monthly for all tiers (`:33-58`) and on Stripe `invoice.paid` (`stripe_client.py:262-338`).

### Does onboarding touch subscription state?
**A default tier + credits are written at user-doc creation (sign-in), but no Stripe customer/subscription/trial is created during onboarding.** Stripe is only touched at explicit checkout. Sign-in writes `tier:"free", credits:300, maxCredits:300` (`FirebaseAuthContext.tsx:206-219`, `:163-176`); `completeOnboarding` strips `tier`/`maxCredits` on the update path and writes `credits:300` + `needsOnboarding:false` (`:344-368`). No `stripeCustomerId`/`subscriptionStatus`/trial field is set until a real checkout completes.

---

## Closing lists

### A. Minimum required fields for non-generic, non-hallucinated output

For the **email engine** to produce a personalized, anti-hallucination-safe email rather than a generic "I'm a student" note, and for **Find warmth scoring** to rank by anything beyond data-richness, the floor is:

1. **`name`** (firstName + lastName) — only field with a hard fallback (`"Student"`); needed for sign-off/signature.
2. **`university`** — drives the alumni hook (warmth +20, highest single signal) and the sender-intro line. Without it, the strongest warmth signal and the alumni lead-type are dead.
3. **`graduationYear`** — sets sender status (student/recent_grad/alum), which gates the anti-"fellow alum" guardrail. Missing → defaults to `current_student`, which can mislabel grads.
4. **`major`** — sender intro + `shared_major` signal.
5. **`careerTrack`** — the only field that unlocks industry-tone calibration and `role_match`; without it the email has no industry voice and Find/job-board lose role alignment (+15/+40).
6. **`dreamCompanies`** — `dream_company` lead-type + warmth +10; also feeds Dashboard/Scout/job-board.
7. **A `resumeParsed` source (resume upload OR LinkedIn enrichment)** — unlocks skills overlap, past-company match (warmth +15), extracurriculars, and the PDF attachment. With neither, every `resumeParsed`-reading consumer (email, coffee chat, job board, recruiter finder, agent) degrades to empty.

Everything else (hometown, personalNote, interests/location, jobTypes) **improves** personalization but is not load-bearing — each is individually guarded and degrades to a skipped sentence, not a generic or broken one.

### B. Biggest friction points in the current flow

1. **Gmail OAuth interrupts before onboarding.** A brand-new user hits Google sign-in → a **second** full-screen Gmail consent screen (`gmail.send`/`readonly`/`compose`) → only then onboarding. That's two consent screens with broad scopes before any value is shown (`SignIn.tsx:222-235`).
2. **Five steps, much of it un-enforced and redundant.** Goals is skippable; Academics requires only `major`; Location requires nothing and its `country`/`state`/`city` fields have no UI at all. Users can complete onboarding with almost no usable data, yet the flow still asks for it all.
3. **The resume academics bug** (`OnboardingFlow.tsx:145-152`) means uploading a resume does **not** prefill university/major/grad-year despite implying it will — so users re-type academics the resume already contains.
4. **Firecrawl-first LinkedIn enrichment returns no education**, so the "paste your LinkedIn to auto-fill" promise silently fails for the common case (academics stay blank unless Bright Data/PDL wins).
5. **No fallback profile when a user provides neither resume nor LinkedIn** — the highest-friction-avoiding users (skip everything) get the worst downstream experience, invisibly.
6. **Data is triplicated/duplicated** (`interests`×3, `university`×2, goals flat-vs-nested) to satisfy divergent reader paths — fragile and a sign the consumers never agreed on a schema.

### C. Open questions / ambiguities to resolve

1. **Free-tier credits have three different values:** `config.py`=500, `constants.ts`=500, `FirebaseAuthContext.initialCreditsByTier`=300 (hardcoded). Which is intended? New users currently get **300** from the client write.
2. **Trial length mismatch:** backend Stripe charges **30 days** (`stripe_client.py:74-77`); frontend copy says **"14-day free trial"** (`ProGate.tsx:69`). Which is the real offer?
3. **Agent gating contradiction:** backend `agent_enabled:True` for all tiers vs frontend `AGENT_CONFIG.enabledTiers:["elite"]` (`constants.ts:38-43`). Is the Agent free-tier-available or Elite-only?
4. **Is there a user-facing "Find recommendation cards" grid at all?** The company-recommendation engine is Scout-only; the closest user-facing personalized cards are Dashboard discovery cards. Confirm which surface the redesign should treat as "Find recs."
5. **`professionalInfo` is read by many consumers but never written by current onboarding.** Is it fully dead (legacy users only), or does some other path still populate it? This affects whether consumers' `professionalInfo.*` fallbacks ever fire for new users.
6. **Gmail connection timing:** should Gmail OAuth stay pre-onboarding, or is deferring it (until first email send) on the table? It's currently the first thing a new user hits after Google sign-in.
7. **`/api/parse-resume` has no `@require_firebase_auth` decorator** (manual token parse). Intentional (to allow unauth previews) or an oversight to flag for security review?
