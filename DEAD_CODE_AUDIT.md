# Offerloop Dead Code Audit

**Date:** 2026-05-17
**Scope:** `backend/`, `connect-grow-hire/`, repo root
**Method:** Cross-referenced every file/asset against the import graph and route registrations. Findings below are everything with **zero references** in the live codebase.

---

## TL;DR

| Category | Count | Risk |
|---|---|---|
| Critical: missing files imported by wsgi.py | 2 | **May break app startup** |
| Mac Finder `" 2."` duplicates (backend + frontend + dist + root) | ~270 | None - pure cruft |
| Dead backend routes/services/utils | ~20 | None |
| Dead frontend components/hooks/services/types | ~60 | None |
| Dead frontend assets (images/videos) | ~153 of 237 (65%) | None - ~145MB |
| Loose screenshots / zips in repo root | ~60 | None |
| **Total cleanup candidates** | **~565 files** | |

The vast majority are zero-risk deletes (Mac duplicates, orphan files, asset cruft). The only thing that needs investigation first is the two missing-blueprint imports in `wsgi.py`.

---

## 1. CRITICAL - Investigate First

Two blueprints are imported and registered in `backend/wsgi.py` but **the files don't exist on disk**:

- `backend/app/routes/company_contexts.py` - imported at wsgi.py:52, registered at line 220
- `backend/app/routes/events.py` - imported at wsgi.py:51, registered at line 219

If wsgi.py is run as-is, this should crash on boot with `ModuleNotFoundError`. Either these files exist somewhere we're not seeing (env-specific?), or production is running a different commit than `main`. Worth confirming before touching anything else.

---

## 2. Mac Finder `" 2."` Duplicates - ~270 files

Pure cruft from accidental Finder copies. **Safe to bulk delete with no review.**

### Backend (31 files - all currently untracked in git status)
- **Routes (3):** `briefing 2.py`, `company_recommendations 2.py`, `prompt_gallery 2.py`
- **Services (8):** `agent_service 2.py`, `company_recommendations 2.py`, `cooldown_service 2.py`, `enrichment_cache 2.py`, `feature_flags 2.py`, `perplexity_client 2.py`, `reply_coach 2.py`, `search_suggestions 2.py`
- **Utils (3):** `metrics_events 2.py`, `recommendation_events 2.py`, `request_context 2.py`
- **Data (2):** `__init__ 2.py`, `company_marks 2.py`
- **Tests (15):** `test_aggregate_metrics 2.py`, `test_briefing_line 2.py`, `test_email_quality_gate 2.py`, `test_metrics_events 2.py`, `test_metrics_instrumentation 2.py`, `test_metrics_route 2.py`, `test_outbox_limit 2.py`, `test_p0_email_verification 2.py`, `test_recommendation_funnel 2.py`, `test_regenerate 2.py`, `test_reply_coach 2.py`, `test_search_suggestions_route 2.py`, `test_subject_and_diversity 2.py`, `test_timeline 2.py`, `test_warmth_tier_upgrade 2.py`
- **Scripts (1):** `aggregate_metrics 2.py`

### Frontend source (~29 files)
- **Pages:** `AgentPage 2.tsx`, `MyNetworkPage 2.tsx`, `RecruitingTimelinePage 2.tsx`
- **Components in `find/`:** `ArchiveList 2.tsx`, `ArchiveRow 2.tsx`, `CompanyAlternatives 2.tsx`, `DimensionChips 2.tsx`, `GoalsPromptBanner 2.tsx`, `PromptGallery 2.tsx`, `QuickStarters 2.tsx`, `RecentTrojanSearches 2.tsx`, `RoleVariations 2.tsx`
- **Components in `personalization/`:** `PersonalizationStrip 2.tsx`, `ScoutNote 2.tsx`, `SchoolSeal 2.tsx`
- **Components top-level:** `NoSchoolEmptyState 2.tsx`, `SuggestionCard 2.tsx`
- **Hooks:** `useAgent 2.ts`, `use-detected-school 2.ts`, `use-school-hometown 2.ts`, `useSuggestions 2.ts`, `useSimulatedStream 2.ts`
- **Services:** `agent 2.ts`
- **Utils:** `promptGallery 2.ts`
- **Lib:** `devPreview 2.ts`, `thinPairs 2.ts`, `universityUtils 2.ts`
- **Types:** `promptCard 2.ts`
- **Assets:** `afterwork-rafiki 2.svg`, `sidebaricons/icons8-building-50 2.png`, `sidebaricons/icons8-find-user-male-48 (1).png`

### Frontend dist (100 files)
`connect-grow-hire/dist/assets/*` is tracked in git and contains 100 `" 2.js"` duplicate build artifacts. **`dist/` should be added to `.gitignore` entirely.**

### Repo root (~50 PNGs/HTML)
Each screenshot/audit PNG has a " 2" twin: `audit-hiring 2.png`, `baseline-people 2.png`, `screenshot-meeting 2.png`, `devpreview-companies 2.png`, `mid-mobile 2.png`, `pass2-companies 2.png`, etc. Plus `Find Companies - Mockups _standalone_ 2.html` and `chrome-extension 2.zip`.

### Docs (3)
`docs/RECOMMENDER_STATUS 2.md`, `docs/p0_baseline_2026-04-28 2.md`, `scripts/browse-auth 2.sh`

---

## 3. Backend Dead Code

### Unregistered blueprints (5)
Define a Flask blueprint but are **not** imported/registered in `wsgi.py` - their endpoints don't exist at runtime:
- `routes/application_lab.py` - note: backed by a 3,082-line `application_lab_service.py`. Either the route should be registered or both should go together.
- `routes/networking_roadmap.py`
- `routes/prompt_gallery.py`
- `routes/runs_hunter.py` - conflicts with the real `runs_bp` in `runs.py`
- `routes/spa.py`

### Orphaned services (7) - zero imports anywhere
- `services/cache.py`
- `services/contact_search_optimized.py`
- `services/directory_search.py`
- `services/job_queue.py` (different from `queue_service.py`, which IS used)
- `services/resume_parser_v2.py` (note: CLAUDE.md claims this is active, but `resume_parser.py` is what's imported - CLAUDE.md is out of date)
- `services/resume_template.py`
- `services/skills_taxonomy.py`

### Orphaned utils (3)
- `utils/enums.py` (duplicates `models/enums.py`)
- `utils/job_url_fetcher.py`
- `utils/job_ranking.py` - one malformed `from backend.app.utils...` import in `routes/jobs.py`, likely broken

### One-time scripts at backend root, no callers/CI (4)
Probably batch jobs that were run once and committed. Suggest moving to `backend/scripts/archive/` with a README, or deleting:
- `backend/setup_credentials.py`
- `backend/upgrade_users_to_elite_batch.py`
- `backend/reset_user_credits.py`
- `backend/update_user_tier.py`

---

## 4. Frontend Dead Code (non-asset)

### Orphaned top-level components - 25+ files in `src/components/`
`AnimatedBackground`, `AnimatedDots`, `AnimatedInterestText`, `AnimatedMadeForText`, `AutocompleteInput`, `BackToHomeButton`, `ComingSoonOverlay`, `ContactSearchForm`, `EmailTemplateModal`, `ExpandablePrivacyLock`, `ExtensionShowcase`, `FeatureCards`, `Features`, `GmailBanner`, `GranolaBackground`, `LockedFeatureOverlay`, `OnboardingShell`, `PageHeaderActions`, `PageWrapper`, `ProductTour`, `RecommendedJobs`, `ResumeRendererSkeleton`, `RotatingImage`, `ScoutBubble`, `ScoutFirmAssistantButton`, `ScoutHelperChatbot`, `ScreenshotGallery`, `SuggestionCard`, `UniversityLogos`

### Orphaned subdirectory components
- **`components/personalization/`** - entire subdir unused: `PersonalizationStrip.tsx`, `ScoutNote.tsx`, `SchoolSeal.tsx`
- **`components/find/`** - `ArchiveList.tsx`, `RecentTrojanSearches.tsx`, `SmartSuggestions.tsx`, `FooterSearch.tsx`
- **`components/search/`** - entire subdir unused: `PromptSearchFlow.tsx`, `PromptSearchInput.tsx`, `SearchConfirmation.tsx`. **Caveat:** gated by `PROMPT_SEARCH_ENABLED` feature flag per CLAUDE.md - verify before deleting.
- **`components/background/DynamicBackground.tsx`**
- **`components/briefing/MorningBriefing.tsx`, `RoadmapProgress.tsx`**
- **`components/demo/ContactLibraryDemoPlaceholder.tsx`**
- **`components/gates/UsageMeter.tsx`** (CLAUDE.md lists this as part of gates, but nothing imports it)
- **`components/resume/ScoreFixTab.tsx`**

### Other orphans
- `hooks/useSuggestions.ts`
- `utils/applyResumeEdits.ts`
- `lib/posthog-events.ts`
- `types/companyRecommendation.ts`

---

## 5. Frontend Assets - ~153 of 237 dead (65%)

### Largest single win: `howitworks*/` subdirectories - ~130MB
Six `.mp4` files exist in **both** `src/assets/howitworks{thing}.mp4` AND inside `src/assets/howitworks{thing}/howitworks{thing}.mp4`. Only the root versions are imported. The entire subdirectories (with extra `.WAV` files nothing references) can be deleted:
- `howitworksmeeting/`
- `howitworkscompanies/`
- `howitworkscontactsearch/` (+ a misspelled `howitoworkscontactsearch/` typo dir)
- `howitworkshiringmanager/`
- `howitworksinterviewprep/`
- `howitworksresume&cv/`

### Legacy icons8 library - 73 files (~15MB)
All `src/assets/icons8-*-50.png` files. App switched to Lucide React icons (shadcn/ui) - these aren't referenced anywhere. Sweep them all.

### Scout mascot variants - 13 files
Concept-art leftovers. Only `ScoutWavingWhite.mp4` and `public/scout-mascot.png` are actually used. Dead:
- Images: `assistant_scout.png`, `coffee_scout.png`, `femaleproscout.png`, `financescout.png`, `greendoctorscout.png`, `greenproscout.png`, `interview_scout.png`, `kidscout.png`, `redconstructionscout.png`
- Videos: `ScoutAsleep.mp4`, `Scoutgirlsad.mp4`, `ScoutWavingDark.mp4`, `scaredscout.mp4`

### Logo/branding variants - 11 files
Only `offerloop_logo2.png` is used. Dead: `Blue_logo.png`, `blue_icon.png`, `blueofferlooplogo.jpeg`, `Light_Mode_Logo.png`, `lightblue_logo.png`, `lowercaseoloop.png`, `Offerloop-almostfinishedlogo.png`, `Offerloop-topleft.jpeg`, `offerloopiconlogo.png`, `Offerloop_Banner.jpg`, `icon.png`.

### Office/tool logos - 9 files
`applecalendarlogo.png`, `applemail.png`, `applenumberslogo-removebg-preview.png`, `Googlecalendar.png`, `Gmaillogopng.png`, `excel_logo.png`, `outlook_logo.png`, `sheetslogo.png`, `zoom_logo.png`.

### Off-target university logos - 13 files
Only imported by orphan component `UniversityLogos.tsx`. Schools not in CLAUDE.md's target list (USC, UCLA, Michigan, NYU, Georgetown, UPenn):
`Callogo.png`, `Caltechlogo.png`, `LMUlogo.png`, `SDSUlogo.png`, `UCIlogo.png`, `UCLAlogo.png`, `UCSBlogo.png`, `UCSDlogo.png`, `Udublogo.png`, `UofOlogo.png`, `USClogo.png`, `USDlogo.png`, `WSUlogo.png`.

### Tied to orphan components - 10 files
Their only references are dead components (`ExtensionShowcase.tsx`, `FeatureCards.tsx`):
- `Chrome extension walkthrough.mp4`, `meeting2extension.mp4`, `coverletter2.mp4`, `hiringmanager2.mp4`, `interviewprep.mp4`
- `Meeting.png`, `Contact_search.png`, `Dashboard.png`, `Firm_Search.png`, `Interview_Prep.png`

### Sidebar icons - 8 files
Used: `icons8-briefcase-48.png`, `icons8-cup-48.png`, `icons8-important-mail-48.png`, `icons8-magnifying-glass-50.png`.
Dead: `icons8-building-50.png` (+ " 2" dup), `icons8-find-user-male-48.png` (+ "(1)" dup), `icons8-paper-48.png`, `icons8-people-working-together-48.png`, `icons8-wallet-48.png`, `icons8-write-48.png`.

### Misc one-offs - ~20 files
`afterwork-rafiki.svg`, `Ai_Personal.jpeg`, `Analytics.jpeg`, `Bain.png`, `bell.png`, `bell_mute.png`, `bell_notification.png`, `ChatGPT of Email Outreach.mp4`, `coffeechatprepss.png`, `contactsearchss .png` (trailing space), `coverletterlandingpage.png`, `extension.png`, `high-impact-connections.jpg`, `hooks.png`, `Lightning.png`, `lock.png`, `MiaSanders.png`, `organization.png`, `professional.png`, `profile.png`, `sample.png`, `Website Feature Walkthrough.mp4`.

### Public/ unused - 4 files
- `public/nopefavicon.png`, `public/placeholder.svg`
- `public/lovable-uploads/14bb2bf5-...png`, `public/lovable-uploads/992f7ac5-...png` (Lovable.app generator leftovers)
- `public/cold-email-playbook.pdf` exists with no in-code reference - **verify** before deleting; might be linked from marketing emails.

### Filename bugs worth fixing while cleaning
- `emailoutreach.png.png` - doubled `.png` extension
- `contactsearchss .png` - trailing space before `.png`
- `Wharton Logo .png` - trailing space before `.png`
- `LinkedIn_logo.png` (unused) vs `LinkedIn_Logo.png` (used) - case-collision dup

---

## 6. Repo Root Cruft

These don't belong in git at all. Add patterns to `.gitignore` and remove from tracking:

- **~40 loose PNGs:** `audit-*.png`, `baseline-*.png`, `devpreview-*.png`, `mid-*.png`, `pass2-*.png`, `screenshot-*.png`, `raw.png`, `IMG_7922.png`, `logo.png`, `logo2.png`
- **Stray HTMLs:** `Find Companies - Mockups _standalone_.html`, `Find Companies B+ - Implementation Spec.html`, `Scout Intro Sentence - Spec.html`, `index.html`
- **ZIP archives:** `chrome-extension.zip`, `chrome-extension 3.zip`, `chrome-extension 4.zip`, `offerloop-autofill-extension (1).zip`, `Offerloop.zip`, `onboarding.zip`
- **Same pattern in `connect-grow-hire/`:** loose `pass2-*.png`, `test-screenshot*.png`, `screenshot-step-final.png` at the project root

---

## Recommended Cleanup Order

1. **Verify the missing wsgi.py imports** (`company_contexts.py`, `events.py`). Boot the app or check git log - this could be a real bug.
2. **Bulk delete the Mac `" 2."` duplicates** (~270 files). Zero risk.
3. **Add to `.gitignore`:** `connect-grow-hire/dist/`, root `*.png`/`*.zip`/`*.html`. Then `git rm --cached` them.
4. **Delete the `howitworks*/` subdirectories** - single biggest space win (~130MB).
5. **Delete the icons8 library** - 73 files, all unreferenced.
6. **Delete the orphan frontend components** + their attached assets (univ logos, scout mascots, logo variants, etc.).
7. **Delete confirmed backend orphans** (7 services, 3 utils).
8. **Decide on unregistered backend blueprints** - register them or delete (especially `application_lab` with its 3k-line service file).
9. **Archive the one-time backend scripts** under `backend/scripts/archive/` or delete.

### Things to verify before deleting
- `application_lab.py` route - there's a huge service file attached; might be in-progress
- `components/search/` subdir - gated by `PROMPT_SEARCH_ENABLED` feature flag
- `public/cold-email-playbook.pdf` - possibly linked from marketing emails
- `LinkedIn_logo.png` vs `LinkedIn_Logo.png` - case-collision could matter on Linux

---

## Notes on CLAUDE.md

A few things in CLAUDE.md are out of date based on what's in the code:
- Claims `resume_parser_v2.py` is the active parser - actually `resume_parser.py` is what's imported.
- Lists `components/gates/UsageMeter.tsx` as part of the gates system - it has zero imports.
- Free-tier credits listed as 300 (backend) vs 150 (frontend constants.ts) - known inconsistency, already flagged in the doc itself.

Worth a refresh pass after the cleanup lands.
