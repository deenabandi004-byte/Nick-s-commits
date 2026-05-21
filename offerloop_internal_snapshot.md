# Offerloop Internal Snapshot

Source-of-truth factual audit produced for downstream competitor analysis and messaging work. Captured 2026-05-17 from two passes: a walk of the codebase at `/Users/nicholaswittig/Desktop/offerloop/Final_offerloop` and a crawl of the live public site at `https://www.offerloop.ai/`. Marketing copy is quoted verbatim where indicated. File paths are repo-relative from the project root. No recommendations, no positioning suggestions, no competitor commentary; this document is descriptive only.

---

## 1. Executive Snapshot

Offerloop is an AI networking and outreach platform aimed at college students recruiting for competitive roles in investment banking, consulting, private equity, hedge funds, tech, and similar industries. The shipped product spans contact discovery against the People Data Labs database (around 2.2 billion records), personalized email generation that writes drafts directly into Gmail, automated reply detection via Gmail Pub/Sub webhooks, a Kanban network tracker with cooldown enforcement, AI generated meeting and interview prep PDFs, a job board with recruiter and hiring manager finding, a resume and cover letter workshop, a firm search assistant, two distinct Scout AI surfaces, an Elite tier autonomous "Offerloop Agent" copilot with daemon driven cycles, a recommendations feed, a nudge system, and a Chrome extension that injects into LinkedIn and eight job boards. The codebase shows a clear in flight pivot from SerpAPI plus Jina Reader toward Perplexity Sonar plus Firecrawl as the live web layer, and a hard coded `PDL_OUTAGE_ACTIVE = True` flag currently has multiple high value surfaces (Find, Meeting Prep, autocomplete) short circuiting to HTTP 503. The public marketing surface positions the product as "We do the outreach, you land the offer", lists pricing publicly as Free, Pro at $14.99/mo, and Elite at $34.99/mo, claims roughly 300 active users and 41 paying subscribers (with a separate homepage claim of 2,400 plus students), and supports an aggressive programmatic SEO footprint of around 1,494 indexed URLs across `/networking/`, `/meeting/`, `/alumni/`, `/cold-email/`, `/networking-for/`, `/compare/`, and `/blog/`. The product surface that exists in code is materially larger than what the marketing site currently presents.

---

## 2. Capabilities Inventory

Tier names: Free, Pro, Elite. Tier definitions live in `backend/app/config.py` (`TIER_CONFIGS`, lines 174 to 251). Credit costs in `backend/app/config.py:80-82`: Meeting Prep = 15, Interview Prep = 25, Timeline = 10. Scout credits historically listed at 5.

### 2.1 Contact Search and Data Pipeline (FIND)

What it does: Student enters a job title, company, location, university, or a free form natural language prompt and receives a tier capped list of contacts (Free 3, Pro 8, Elite 15) drawn from People Data Labs. Each result is warmth scored against the user profile, deduped against already saved contacts, optionally enriched with real time Perplexity talking points, and may be auto paired with a personalized email and a Gmail draft in the same call.

Backend:
- Blueprints: `backend/app/routes/runs.py` (838 lines), `backend/app/routes/runs_hunter.py` (982 lines). Both registered as `runs_bp` in `backend/wsgi.py:185`.
- Routes: `POST /prompt-search` (`runs.py:193`), `POST /free-run` (`runs_hunter.py:607`), `POST /free-run-csv` (`runs_hunter.py:703`), `POST /pro-run` (`runs_hunter.py:778`), `POST /pro-run-csv` (`runs_hunter.py:896`), `POST /basic-run` and `POST /advanced-run` (`runs_hunter.py:971, 978`).
- Core service: `backend/app/services/pdl_client.py` (3,590 lines) with `search_contacts_with_pdl`, `search_contacts_with_smart_location_strategy_enhanced`, `search_contacts_from_prompt` (line 3176).
- Real time enrichment: `backend/app/services/perplexity_client.py:293` `batch_enrich_contacts` attaches `enrichment_talking_points` and `enrichment_recent_activity`.
- Email verification: `backend/app/services/hunter.py` for Pro/Elite.
- LinkedIn enrichment fallback chain: `backend/app/utils/linkedin_enrichment.py` calls Firecrawl, then Bright Data, then Jina, then PDL.
- Outage gate: returns HTTP 503 with `code: "PDL_OUTAGE"` when `PDL_OUTAGE_ACTIVE = True` (`runs.py:202`, `runs_hunter.py:611, 785`).

Frontend: `connect-grow-hire/src/pages/FindPage.tsx` (425 lines, tabs People, Companies, Hiring Managers), `ContactSearchPage.tsx`, `FirmSearchPage.tsx`, `RecruiterSpreadsheetPage.tsx`, `connect-grow-hire/src/components/PDLOutageBanner.tsx`.

Tier gating: contact cap 3/8/15, email batch size 1/5/15, Hunter.io email verification Pro/Elite only.

External services: People Data Labs (primary search), Perplexity Sonar (enrichment), Hunter.io (Pro/Elite verify), Firecrawl, Bright Data, Jina, OpenAI (downstream emails), Gmail API (downstream drafts).

Status: Shipped but currently 503ing because of the `PDL_OUTAGE_ACTIVE = True` kill switch.

### 2.2 AI Email Generation (REACH)

What it does: Generates a personalized cold outreach email per contact, optionally creates a Gmail draft, inserts a warmth aware "briefing line" explaining why the contact matters, supports batch generation (1/5/15 per tier), template instructions, signoff config, resume attachment, and Reply Coach drafts for inbound messages.

Backend:
- Blueprint: `backend/app/routes/emails.py`, prefix `/api/emails`. `POST /generate-and-draft` at line 98.
- Generation core: `backend/app/services/reply_generation.py`. `batch_generate_emails` (line 336), `generate_reply_to_message` (line 1454), `regenerate_with_feedback` (line 1622).
- Templates and personalization: `backend/app/services/email_baseline.py`, `backend/app/utils/personalization.py` (1,100+ lines, defines lead type priority `alumni > dream_company > shared_company > career_path > shared_major`).
- Reply Coach: `backend/app/services/reply_coach.py` (auto draft on incoming reply).
- Template store: `backend/app/routes/email_template.py`.
- Quality gate: `backend/app/utils/email_quality.py`.

Frontend: `EmailTemplatesPage.tsx`, `EmailTemplateModal.tsx`, `NudgePanel.tsx`.

Tier gating: Resume attachment and `personalized_templates` Elite only (`config.py:246`). Batch size enforced per tier. Free can draft but not attach resume.

External services: OpenAI (GPT-4 family), Anthropic Claude (fallback), Gmail API (draft creation when `CREATE_GMAIL_DRAFTS` env true).

Status: Shipped. Reply Coach active and feeds the Tracker.

### 2.3 Gmail OAuth and Pub/Sub Reply Detection

What it does: Three legged Google OAuth flow grants scopes for compose, read, and send. Credentials stored per user in Firestore at `users/{uid}/integrations/gmail`. Google Pub/Sub subscription pushes Gmail history notifications, which the backend fans out to per user thread sync, automatic reply detection, contact stage updates (replied, bounced), cooldown recording, and Reply Coach draft generation. A background daemon thread renews each user's Gmail watch every six days.

Backend:
- OAuth: `backend/app/routes/gmail_oauth.py`, prefix `/api/google`. `GET /oauth/start`, `GET /oauth/callback`, `POST /gmail/revoke`, `GET /gmail/status`. Legacy aliases at `/api/gmail/...` in `wsgi.py:170-180`.
- Webhook: `backend/app/routes/gmail_webhook.py`. `POST /webhook` at line 606. Verifies Google Pub/Sub JWT (line 581), dispatches `_process_gmail_notification` (line 76), triggers `cooldown_service.record_outreach` (line 386) on confirmed sends.
- Client: `backend/app/services/gmail_client.py` (1,394 lines). `start_gmail_watch`, `stop_gmail_watch`, `renew_gmail_watch`, `find_uid_by_gmail_address`, `sync_thread_message`, `create_gmail_draft_for_user`, `create_drafts_parallel`, `send_email_for_user`.
- Renewal daemon: `wsgi.py:370` `_watch_renewal_loop`, every six days.
- Scopes (`config.py:38`): `gmail.compose`, `gmail.readonly`, `gmail.send`, `openid`, `userinfo.email`, `userinfo.profile`.

Frontend: `connect-grow-hire/src/components/GmailBanner.tsx`.

Tier gating: None.

External services: Google OAuth, Gmail API, Google Cloud Pub/Sub (topic defaults to `projects/offerloop-native/topics/gmail-notifications`).

Status: Shipped.

### 2.4 Network Tracker (Outbox) and Pipeline Stages

What it does: Pipeline/Kanban view of every contact the user has reached out to. Stages, durations, snooze, archive, "won", and reply detected unread state all live here. Reads from `users/{uid}/contacts/`. Each contact has `pipelineStage`, `emailSentAt`, `lastReplyAt`, `archivedAt`, `snoozeUntil`, `unreadReply`, and a Gmail thread ID.

Backend:
- Blueprint: `backend/app/routes/outbox.py`, prefix `/api/outbox`. Endpoints: `GET /threads`, `GET /stats`, `PUT /threads/<id>/stage`, `POST /threads/<id>/sync`, `POST /threads/<id>/mark-read`, `POST /threads/<id>/archive`, `POST /threads/<id>/unarchive`, `POST /threads/<id>/snooze`, `POST /threads/<id>/won`, `POST /threads/<id>/resolution`.
- Service: `backend/app/services/outbox_service.py`. Stage vocabulary (line 23): `new, draft_created, draft_deleted, email_sent, waiting_on_reply, replied, meeting_scheduled, connected, no_response, bounced, closed`. Done stages (line 28): `connected, meeting_scheduled, no_response, bounced, closed`. Replied stages: `replied, meeting_scheduled, connected`. Resolutions: `meeting_booked, soft_no, hard_no, ghosted, completed`. `STUCK_DRAFT_HOURS = 24`. `sync_contact_thread` (line 701) advances stages on detected replies and may trigger auto prep (line 779).
- Cooldown: `backend/app/services/cooldown_service.py`. `record_outreach(email, uid)` and `get_outreach_count(email)` against `global_contact_outreach/{email}` with a rolling 30 day window. Called from `outbox_service.py:376` and `gmail_webhook.py:386` to prevent contact saturation across users.

Frontend: `connect-grow-hire/src/pages/NetworkTracker.tsx`, `MyNetworkPage.tsx`, `connect-grow-hire/src/components/tracker/`.

Tier gating: None at API level.

External services: Firestore, Gmail API.

Status: Shipped. Cooldown live on every confirmed send.

### 2.5 Meeting Prep

What it does: For a given LinkedIn URL, generates a personalized meeting prep PDF in the background: contact research, company news, mutual connections, talking points, suggested questions. Spawns a thread, returns a `prep_id`, status polled by frontend. Costs 15 credits.

Backend:
- Blueprint: `backend/app/routes/meeting_prep.py`, prefix `/api/meeting-prep`. `POST /`, `GET /history`, `GET /all`, `GET /<prep_id>/download`, `GET /<prep_id>`, `DELETE /<prep_id>`.
- Service: `backend/app/services/meeting.py`. `fetch_serp_research`, `fetch_comprehensive_research` (SerpAPI for news, Perplexity quick_search and deep_research).
- PDF generator: `backend/app/services/pdf_builder.py`.
- Auto prep: `outbox_service.py:779` `_maybe_trigger_auto_prep` runs a meeting prep automatically when a contact replies.

Frontend: `MeetingPrepPage.tsx`, `MeetingLibrary.tsx`, `MeetingNetworking.tsx`, `MeetingGuidePage.tsx`.

Tier gating: Free 3 lifetime, Pro 10/month, Elite unlimited. Requires resume on file. 15 credits per prep.

External services: SerpAPI, Perplexity Sonar and Sonar deep research, OpenAI/Claude, PDL.

Status: Shipped but currently 503ing because of `PDL_OUTAGE_ACTIVE`.

### 2.6 Interview Prep

What it does: Given a job posting URL or company plus title, scrapes Reddit, YouTube, and Glassdoor for first hand interview reports, normalizes the content, classifies questions (behavioral, technical, case), personalizes against the user's resume, produces a PDF prep document. Costs 25 credits.

Backend:
- Blueprint: `backend/app/routes/interview_prep.py`, prefix `/api/interview-prep`. `POST /generate`, `GET /status/<prep_id>`, `GET /download/<prep_id>`, `GET /history`.
- Service module: `backend/app/services/interview_prep/` with eight submodules: `content_aggregator.py`, `job_posting_parser.py`, `reddit_scraper.py`, `youtube_scraper.py`, `glassdoor_scraper.py`, `question_extractor.py`, `personalization.py`, `pdf_generator.py` (plus `content_processor.py`, `resume_parser.py`).

Frontend: `InterviewPrepPage.tsx`.

Tier gating: Free 2 lifetime, Pro 5/month, Elite unlimited. 25 credits.

External services: Reddit (PRAW/asyncpraw), YouTube transcript API, Glassdoor scraper, OpenAI, SerpAPI, ReportLab/WeasyPrint.

Status: Shipped.

### 2.7 Job Board and Recruiter Finder

What it does: Personalized job board sourcing live jobs via SerpAPI Google Jobs (with Perplexity-based variants emerging), ranking jobs against the user's resume and stated career interests, surfacing hiring managers and recruiters for a given role, generating cover letters, and tailoring resumes for specific jobs. Single 8,800+ line route file handles search, ranking, parsing, gating by domain and job type, and resume optimization.

Backend:
- Blueprint: `backend/app/routes/job_board.py` (8,800+ lines). Endpoints: `POST /jobs`, `POST /search`, `POST /optimize-resume`, `GET /resume-capabilities`, `POST /optimize-resume-v2`, `POST /find-recruiter` (Pro/Elite gated), `POST /parse-hiring-prompt`, `POST /find-hiring-manager`, `POST /save-recruiters`, `POST /generate-cover-letter`, `POST /cover-letter-pdf`, `POST /parse-job-url`, `POST /clear-cache`.
- Newer per job feed: `backend/app/routes/jobs.py`. `GET /api/jobs/feed`, `GET /api/jobs/<id>`, `POST /api/jobs/feedback`, `GET /api/jobs/filters`.
- Recruiter finder: `backend/app/services/recruiter_finder.py` (1,300+ lines). `find_recruiters`, `rank_recruiters`, `search_recruiters_with_fallback`, `find_hiring_manager`, `rank_hiring_managers`, `determine_job_type`.
- Recruiter email generator: `backend/app/services/recruiter_email_generator.py`.
- Job ranking utils: `backend/app/utils/job_ranking.py` (two stage: deterministic score, then top 20 ranked with GPT). `backend/app/utils/job_url_fetcher.py`.

Frontend: `JobBoardPage.tsx`, `HiringManagerTrackerPage.tsx`, `RecruiterSpreadsheetPage.tsx`, `connect-grow-hire/src/components/jobs/`.

Tier gating: `/find-recruiter` Pro/Elite only. Job feed open to all tiers.

External services: SerpAPI, Perplexity Sonar (`search_jobs_live`), Firecrawl (`extract_job_posting`), OpenAI.

Status: Shipped. Largest single route file in the codebase.

### 2.8 Resume Workshop and Cover Letter Workshop

What it does: Resume Workshop parses an uploaded resume (PDF or DOCX), scores it for ATS compatibility, suggests AI improvements, applies them, and regenerates a polished PDF preserving the original layout. Cover Letter Workshop produces a tailored cover letter for a specific job posting using the user's resume.

Backend:
- Blueprint `backend/app/routes/resume_workshop.py` (~1,900 lines), prefix `/api/resume-workshop`. `POST /analyze`, `POST /fix`, `POST /score`, `POST /apply-improvements`, `POST /replace-main`, `POST /apply`, library endpoints, `GET /health`.
- Blueprint `backend/app/routes/cover_letter_workshop.py`, prefix `/api/cover-letter-workshop`. `POST /generate`, library endpoints.
- `backend/app/routes/resume_pdf_patch.py`: `POST /patch-pdf`.
- `backend/app/routes/resume.py`: `POST /parse-resume`, `DELETE /resume`.
- Services: `resume_parser_v2.py`, `resume_optimizer_v2.py`, `ats_scorer.py`, `pdf_builder.py`, `pdf_patcher.py`, `resume_capabilities.py`, `libreoffice_service.py`, `docx_service.py`.

Frontend: `ResumeWorkshopPage.tsx`, `ResumePage.tsx`, `CoverLetterPage.tsx`, `connect-grow-hire/src/services/resumeWorkshop.ts` (~675 lines), `coverLetterWorkshop.ts` (~213 lines).

Tier gating: Pro/Elite only (`TIER_CONFIGS["free"]["uses_resume"] = False`).

External services: OpenAI, ReportLab and WeasyPrint, LibreOffice.

Status: Shipped.

### 2.9 Firm Search and Company Search

What it does: Natural language company discovery ("mid sized investment banks in NYC focused on healthcare"). Parses the prompt with OpenAI, queries SerpAPI for candidate firms, scrapes/extracts firm details via Firecrawl plus Perplexity, normalizes location, returns ranked firm cards with culture/recruiting context. Synchronous and streaming (SSE) responses supported.

Backend:
- Blueprint: `backend/app/routes/firm_search.py`, prefix `/api/firm-search`. `POST /search`, `GET /status/<id>`, `GET /stream/<id>` (SSE), `POST /search-async`, `GET /history`, `GET /history/<id>`, `GET /options/industries`, `GET /options/sizes`, `POST /delete-firm`.
- Services: `company_search.py` (1,240+ lines), `firm_details_extraction.py` (1,192 lines), `company_extraction.py`, `extraction_schemas.py`, `search_progress.py`.
- Cost: `calculate_firm_search_cost(num_firms)`.

Frontend: `FirmSearchPage.tsx`, `FirmSearchResults.tsx`, `ScoutFirmAssistant.tsx`, `ScoutFirmAssistantButton.tsx`.

Tier gating: Pro/Elite (`TIER_CONFIGS["free"]["firm_search"] = False`). Capped at 15 firms per query server side regardless of tier.

External services: SerpAPI, Perplexity Sonar Pro, Firecrawl, OpenAI.

Status: Shipped.

### 2.10 Scout AI Assistant (Two Surfaces)

What it does: Two layered Scout surfaces. Scout (job fit) is a chatbot for analyzing a specific job against the user's resume. Scout Assistant is a conversational copilot (Cmd+K side panel) that surfaces user memory and answers product, workflow, and search help questions. Both maintain Firestore backed conversation history under `users/{uid}/scoutConversations/`.

Backend:
- Scout (job fit): `backend/app/routes/scout.py`, prefix `/api/scout`. `POST /chat`, `POST /analyze-job`, `POST /firm-assist`, `GET /health`.
- Scout Assistant: `backend/app/routes/scout_assistant.py`, prefix `/api/scout-assistant`. `POST /chat`, `POST /chat/stream` (SSE), `POST /search-help`, `GET /health`.
- Services: `scout_service.py` (~3,605 lines, `ScoutService`) and `scout_assistant_service.py` (~1,074 lines, `ScoutAssistantService`, includes `_build_user_memory_prompt`, `_detect_route_from_query`, `_detect_intent`). Both call Perplexity, Firecrawl, SerpAPI, OpenAI.

Frontend: `connect-grow-hire/src/contexts/ScoutContext.tsx`, `ScoutSidePanel.tsx`, `ScoutChatbot.tsx`, `ScoutBubble.tsx`, `ScoutHeaderButton.tsx`, `ScoutHelperChatbot.tsx`, `ScoutFirmAssistant.tsx`, `ScoutConversationList.tsx`, `ScoutPage.tsx`. Cmd+K shortcut wired in `App.tsx`. Briefing's "Ask Scout" chips auto send pending messages via ScoutContext.

Tier gating: None enforced at route. Tier/credits surfaced in system prompt.

External services: OpenAI, Anthropic Claude (fallback), Perplexity Sonar, SerpAPI, Firecrawl, Jina.

Status: Shipped.

### 2.11 Offerloop Agent Copilot (Elite Autonomous Agent) and `/agent` Page

What it does: Elite only autonomous networking agent. The user configures target companies, industries, roles, locations, weekly contact targets, credit budget, alumni preference, approval mode (`review_first` or `autopilot`), and send mode (`drafts_only` or `auto_send`). A background daemon picks up active agent configs once per hour, runs a planning cycle (Claude generates an action plan), executes actions (find contacts, find jobs, discover companies, find hiring managers, follow up), produces draft emails, and either auto sends or queues for approval. Daily digest emails and stale outreach follow ups run as separate daemons.

Backend:
- Blueprint: `backend/app/routes/agent.py`, prefix `/api/agent`. Endpoints (all Elite gated for writes): `GET /config`, `PUT /config`, `POST /deploy`, `POST /pause`, `POST /stop`, `POST /run-now`, `GET /cycles/<id>/status`, `GET /cycles`, `GET /activity`, `GET /stats`, `GET /pipeline`, `GET /approvals`, `POST /approvals/<id>/approve`, `POST /approvals/<id>/reject`, `GET /jobs`, `PUT /jobs/<id>/status`, `GET /companies`.
- Service: `backend/app/services/agent_service.py`. Functions include `deploy_agent`, `pause_agent`, `stop_agent`, `trigger_cycle_background`, `run_due_agent_cycles` (line 436), `send_daily_digests` (line 498), `run_followup_scan` (line 605), `_run_cycle` (line 695), `_execute_single_action` (line 667).
- Planner: `backend/app/services/agent_planner.py`. `generate_action_plan` uses Claude (`_call_claude`) and Perplexity market context (`get_market_context`).
- Actions: `backend/app/services/agent_actions.py`. `execute_find_and_draft` (PDL plus Perplexity), `execute_find_jobs` (Perplexity `search_jobs_live`, Firecrawl `extract_job_posting`, SerpAPI fallback), `execute_discover_companies` (Perplexity `discover_companies_live`, Firecrawl `extract_company_profile`), `execute_find_hiring_managers`, `execute_follow_up`.
- Three daemon threads in `wsgi.py`: `_agent_daemon_loop` (1h cycle), `_agent_followup_loop` (1h), `_agent_digest_loop` (24h, sends summary via user's own Gmail OAuth).

Frontend: `AgentPage.tsx`, `AgentSetup.tsx` (mounted at `/agent` and `/agent/setup`), `connect-grow-hire/src/services/agent.ts` (`AgentConfig` interface), `connect-grow-hire/src/components/agent/`.

Tier gating: Elite only (`TIER_CONFIGS["elite"]["agent_enabled"] = True`).

External services: Anthropic Claude (planner), OpenAI (email generation), Perplexity Sonar / Sonar Pro, Firecrawl, People Data Labs, SerpAPI, Hunter.io, Gmail API.

Status: Shipped. Daemons enabled by default (`AGENT_DAEMON_ENABLED`, `AGENT_FOLLOWUP_ENABLED`, `AGENT_DIGEST_ENABLED` env vars all default true).

### 2.12 Recommendations Feed (Company Recommendations)

What it does: Returns six personalized company recommendation cards keyed off the user's stated target industries, plus a deterministic Scout sentence ("X UCLA alumni at McKinsey...") and a seal/mark per company. Used on the dashboard. Funnel events logged for measurement.

Backend:
- Blueprint: `backend/app/routes/company_recommendations.py`. `GET /api/companies/recommendations`.
- Service: `backend/app/services/company_recommendations.py`. `get_recommendations` (line 275), static `INDUSTRY_COMPANIES` map, `_score_company`, `_build_scout_sentence`. Folds in school affinity via `get_school_affinity`.
- Model: `backend/app/models/company_recommendation.py` (`ScoutSentence`, `CompanyMark`, `CompanyRecommendation`).
- Marks data: `backend/app/data/company_marks.py`.
- Event logging: `backend/app/utils/recommendation_events.py`. Funnel stages: `recommendation_shown, email_drafted, email_sent, email_replied, meeting_scheduled, offer_received`.
- Admin readout: `backend/app/routes/recommendation_funnel.py` `GET /api/admin/recommendation-funnel`, gated by `ADMIN_UIDS` env var, caps date range at 90 days, reads at 100,000 events.

Frontend: `connect-grow-hire/src/types/companyRecommendation.ts` plus dashboard components.

Tier gating: None at route level. Credit cost 0.

External services: Firestore (school affinity cache), PDL (downstream school affinity lookup), OpenAI (Phase 5 LLM variation for hero detail paragraph).

Status: Shipped. Admin funnel readout shipped in the most recent commit `dabd418 feat(admin): GET /api/admin/recommendation-funnel for measurement readout`.

### 2.13 Nudge System

What it does: Proactive flywheel surface that prompts the user with timely actions: stale follow ups (a contact you reached out to >= 5-7 days ago hasn't been pinged), and "stuck student" suggestions when activity drops. A background scanner runs every six hours and generates AI personalized nudge texts. Users can read, act on (creates Gmail draft), or dismiss them. Per user `nudgePreferences` controls timing and notification settings.

Backend:
- Blueprint: `backend/app/routes/nudges.py`. `GET /nudges`, `PATCH /nudges/<id>`, `POST /nudges/<id>/draft`, `PUT /nudge-preferences`.
- Service: `backend/app/services/nudge_service.py`. `scan_and_generate_nudges`, `_get_eligible_contacts`, `_generate_nudge_text`, `_generate_template_nudge`, `_create_nudge`, `_check_student_activity`, `_generate_stuck_suggestions`, `_fallback_suggestions`, `dismiss_pending_nudges_for_contact`. Distributed lock prevents duplicate scans. Healthcheck written to `system/nudge_scanner`.
- Cadence: `wsgi.py:315` inside the six hour tracker scanner loop (`NUDGES_ENABLED` env var, default true). Stale threshold eight hours.

Frontend: `connect-grow-hire/src/components/tracker/NudgePanel.tsx` (with `StuckStudentCard` variant), `Nudge` type in `connect-grow-hire/src/services/api.ts`, `NotificationBell.tsx`, `useNotifications` hook.

Tier gating: None.

External services: OpenAI/Anthropic (nudge text generation, falls back to template), Perplexity (news hook via `get_company_news_brief`), Gmail API.

Status: Shipped. Daemon enabled by default.

### 2.14 Warmth Scoring

What it does: Deterministic scoring algorithm ranks contacts on a cold/neutral/warm tier based on shared identity (alumni, hometown, major), career relevance, role match against the active search, and data richness. Outputs `warmth_score`, `warmth_tier`, `warmth_label` ("Strong fit", "Good fit", "Right company, different role"), and `warmth_signals`. Used to sort `/find` results, prioritize emails, and feed the briefing line.

Backend:
- Module: `backend/app/utils/warmth_scoring.py` (~625 lines).
- Components: shared identity capped at 45 pts (same university +20, same major +10, same hometown +8, same past employer +15), career relevance, role match against parsed query (+15 substring/token overlap), data richness.
- Thresholds: warm >= 50, neutral >= 25, else cold.
- Callers: `runs_hunter.py:683` sorts free tier results, `reply_generation.py` biases email tone with warmth, `emails.py:28` `_persist_warmth_on_send`.
- Deterministic briefing line builder `build_briefing_line` at line 579 generates one line LLM free explanations from up to three signals.
- Industry classifier: `backend/app/utils/industry_classifier.py`.

Frontend: warmth fields rendered as tier chips in search results and the tracker.

Tier gating: None.

External services: None (pure deterministic).

Status: Shipped.

### 2.15 Alumni Detection and Alumni Features

What it does: Identifies which contacts share the user's university (highest priority warmth signal). Provides explicit "college alumni" filter on Free tier search and a "X alumni at this company" stat via school affinity at the recommendation layer.

Backend:
- College alumni filter: `backend/app/utils/validation.py:14` `collegeAlumni: Optional[str]`. Passed through `free-run` (`runs_hunter.py:622`).
- Warmth signal: `same_university` major boost. Lead type priority `alumni > dream_company > shared_company > career_path > shared_major`. Alumni weight 2 in `personalization.py:197`.
- School affinity: `backend/app/services/school_affinity.py`. `get_school_affinity(university, field)` queries PDL for alumni concentrations, caches results in Firestore for 30 days (`schoolAffinity` collection).
- Endpoint: `backend/app/routes/school_affinity.py` `GET /api/companies/school-affinity`.
- Counter: `alumniSearchesUsed` on user doc. Free 10, Pro/Elite unlimited.

Frontend: `AlumniGuidePage.tsx`, `AlumniOutreach.tsx`. University seal rendered in company recommendations.

Tier gating: Alumni search counter capped at 10 for Free.

External services: People Data Labs.

Status: Shipped.

### 2.16 Graduation Gates / Cooldown / Feature Flags

What it does: Centralized feature flag system supporting global enable, env var kill switches, per uid overrides, and rollout percentage bucketing by deterministic SHA256 hash. Cooldown system tracks rolling 30 day outreach counts per contact email globally.

Backend:
- Feature flags: `backend/app/services/feature_flags.py`. Firestore doc shape `feature_flags/{flag_name}` with `enabled`, `rollout_pct`, `overrides` map. Resolution order: per uid override, env `<FLAG>_KILL=true`, env `<FLAG>=true/false`, Firestore `rollout_pct`, Firestore `enabled`, code default. 60s cache. Known flag constants: `EVENTS_LOGGING_ENABLED`, `DERIVED_PROFILE_ENABLED`, `RECOMMENDATIONS_ENABLED`, `NUDGES_ENABLED`, `USE_NEW_GENERATOR`, `ALUMNI_GRAPH_ENABLED`, `FLOATING_PROMPT_ENABLED`, `COLD_START_INTENT_ENABLED`, `REPLY_ATTRIBUTION_ENABLED`, `PDL_OUTAGE`.
- `PDL_OUTAGE_ACTIVE = True` is a hard coded module constant (line 246), not Firestore driven, used to fail contact search routes fast.
- Daemon scanner kill switches: env vars `NUDGES_ENABLED`, `QUEUE_SCANNER_ENABLED`, `AGGREGATION_SCANNER_ENABLED`, `WATCHDOG_ENABLED`, `AGENT_DAEMON_ENABLED`, `AGENT_FOLLOWUP_ENABLED`, `AGENT_DIGEST_ENABLED`.
- Cooldown: `backend/app/services/cooldown_service.py` (described in 2.4).
- "Graduation gates" (lifetime to monthly): `backend/app/utils/users.py` `check_and_reset_usage` (calendar month boundary).

Tier gating: N/A (infrastructure).

External services: Firestore.

Status: Shipped.

### 2.17 Application Lab

What it does: Per job analysis pipeline that takes a job posting, returns a job fit analysis, generates a tailored cover letter, and edits the resume specifically for that role. The backend service is fully implemented but the blueprint is not registered in `wsgi.py`, so HTTP routes are currently 404. The frontend still calls these routes.

Backend:
- Blueprint (orphaned): `backend/app/routes/application_lab.py`. `POST /analyze`, `GET /analysis/<id>`, `POST /generate-cover-letter`, `POST /generate-edited-resume`, `GET /health`, `GET /health/details`, `POST /repair-resume`.
- Service: `backend/app/services/application_lab_service.py` (3,082 lines). Singleton at line 3081.

Frontend: `ApplicationLabPage.tsx` (mounted at `/application-lab`), `connect-grow-hire/src/services/applicationLab.ts` (~349 lines), `ApplicationLabPanel.tsx`.

Tier gating: Service contains tier checks but route never reachable.

External services: OpenAI, Anthropic.

Status: Dead at the API layer. `application_lab_bp` not imported or registered in `wsgi.py`. Frontend route mounted and tries to call dead endpoints.

### 2.18 Auth (Firebase) and Tier Enforcement

What it does: All API routes authenticated via Firebase ID token (Authorization Bearer header), verified server side with three retries and exponential backoff for transient network errors. Tier checks always read from Firestore, never from the request body. CORS preflight passes through without auth.

Backend:
- `backend/app/extensions.py`: `require_firebase_auth` (line 132), `require_tier(allowed_tiers)` (line 269), `init_firebase`, `get_db`, rate limiting (`get_rate_limit_key` line 337, excludes static assets and root).
- Chrome extension auth: `backend/app/routes/auth_extension.py` `POST /api/google-extension`.

Frontend: `connect-grow-hire/src/contexts/FirebaseAuthContext.tsx`, `connect-grow-hire/src/lib/firebase.ts`.

External services: Firebase Auth, Firestore.

Status: Shipped.

### 2.19 Billing (Stripe), Tiers, Credit System

What it does: Stripe based subscription management with three plans. Monthly credit allowance (300/1500/3000 per `config.py`) plus per month usage counters for capped features. Credit reset at calendar month boundary. Usage counters reset monthly for Pro/Elite. 30 day free trial. Hardcoded price IDs default to `price_1ScLXrERY2WrVHp1bYgdMAu4` (Pro) and `price_1ScLcfERY2WrVHp1c5rcONJ3` (Elite). Source of truth is `subscriptionTier` on user doc; `tier` is legacy fallback.

Backend:
- Blueprint: `backend/app/routes/billing.py`, prefix `/api`. `GET /tier-info`, `GET /check-credits`, `POST /user/update-tier`, `POST /create-checkout-session`, `POST /complete-upgrade`, `POST /stripe-webhook`, `POST /update-subscription`, `POST /create-portal-session`, `GET /subscription-status`, `GET /user/subscription`, `POST /user/check-feature`, `POST /user/increment-usage`, `GET /debug/check-upgrade/<user_id>`.
- Service: `backend/app/services/stripe_client.py`.
- Tier configs: `config.py:174` `TIER_CONFIGS` feature matrix including `agent_enabled`, `firm_search`, `smart_filters`, `bulk_drafting`, `export_enabled`, `priority_queue`, `personalized_templates`, `weekly_insights`, `early_access`.
- Credit/usage helpers: `backend/app/utils/users.py`.

Frontend: `connect-grow-hire/src/pages/Pricing.tsx`, `PaymentSuccess.tsx`, `useSubscription` hook, `useFeatureGate` hook, `connect-grow-hire/src/lib/constants.ts` (frontend mirror, Free credits 150 vs backend 300, an in repo drift).

External services: Stripe (subscriptions, Customer Portal, webhooks).

Status: Shipped.

### 2.20 Admin Tooling

What it does: Operational endpoints for migrations, watch renewal, baseline computation, and the admin only recommendation funnel readout. Most admin routes are user scoped (only act on the caller's own data); the funnel route uses an `ADMIN_UIDS` env var allowlist.

Backend:
- Blueprint: `backend/app/routes/admin.py`, prefix `/api/admin`. `POST /backfill-stages`, `POST /deduplicate-contacts`, `POST /sync-stale`, `POST /renew-watches` (cron secret protected via `X-Cron-Secret` against `CRON_SECRET`), `POST /compute-email-baseline`, `POST /client-error`.
- Admin funnel: `backend/app/routes/recommendation_funnel.py` `GET /api/admin/recommendation-funnel`.
- Daemon watchdog status: written to `system/watchdog` Firestore doc by `wsgi.py:494`.
- Extension scraper telemetry: `backend/app/routes/extension_logs.py` `POST /api/extension/scraper-log`, `GET /api/extension/scraper-stats`.
- Metrics ingestion: `backend/app/routes/metrics.py` `POST /api/metrics/events`.

Tier gating: Admin allowlist for funnel. Other admin routes self only.

External services: Firestore, Gmail API.

Status: Shipped.

### 2.21 Prompt Gallery, Search Suggestions, Briefing

2.21a Prompt gallery: `backend/app/routes/prompt_gallery.py` `POST /api/find/prompt-gallery`. Blueprint not registered in `wsgi.py`. No frontend caller found. Status: Dead at the API layer.

2.21b Search suggestions: `backend/app/routes/search_suggestions.py` `GET /api/search-suggestions`, registered in `wsgi.py:215`. Service `backend/app/services/search_suggestions.py` returns cached, user contextualized suggestions. Status: Shipped.

2.21c Briefing line: deterministic one sentence "why this contact matters" built in `warmth_scoring.py:579` `build_briefing_line`. Status: Shipped.

2.21d Morning briefing: `backend/app/routes/briefing.py` `GET /api/briefing`, registered in `wsgi.py:216`. Aggregator returns `unreadReplies`, `followUps`, `roadmapProgress` (Pro/Elite only), `pipelineStats`, `deadlines`. Logs `briefing_viewed` event. Frontend `MorningBriefing.tsx` surfaces it on the dashboard with "Ask Scout" chips that auto send to ScoutContext. Status: Shipped.

### 2.22 Cross Cutting Capabilities (Selected)

- Networking Roadmap: `backend/app/routes/networking_roadmap.py` `GET /api/networking-roadmap`, `POST /api/networking-roadmap/refresh`. Not registered in `wsgi.py`. Service `backend/app/services/networking_roadmap.py` exists; `compute_roadmap_progress` is called inline from briefing. Status: Dead at HTTP layer.
- Agentic Weekly Queue (Phase 2): `backend/app/routes/queue.py` `POST /api/queue/generate`, `GET /api/queue/current`, `GET /api/queue/status/<id>`, `POST /api/queue/<qid>/<cid>/approve`. Pro/Elite gated. Service `backend/app/services/queue_service.py`, weekly Tuesday scan via tracker daemon (`wsgi.py:330`). Status: Shipped.
- Email baseline aggregation: `backend/app/services/email_baseline.py` `aggregate_email_outcomes` scanner runs Sundays 3-9am UTC (`wsgi.py:347`). Powers reply rate stats by industry bucket.
- Dashboard: `backend/app/routes/dashboard.py` `GET /api/dashboard/stats`, `GET /api/dashboard/recommendations`, `GET /api/dashboard/firm-locations`, `GET /api/dashboard/interview-prep-stats`.
- Contacts CRUD plus reply check: `backend/app/routes/contacts.py` full CRUD plus `GET /<id>/check-replies`, `POST /<id>/mute-notifications`, `POST /batch-check-replies`, `POST /<id>/generate-reply`, `POST /bulk`.
- Contact import (CSV): `backend/app/routes/contact_import.py` import preview/commit, `GET /api/import/template`.
- LinkedIn import: `backend/app/routes/linkedin_import.py` `POST /api/import-linkedin`.
- Enrichment autocomplete: `backend/app/routes/enrichment.py` `GET /autocomplete/<data_type>`, `POST /enrich-job-title`, `POST /enrich-linkedin-onboarding`. Currently 503ing per `PDL_OUTAGE_ACTIVE`.
- Timeline (recruiting timeline): `backend/app/routes/timeline.py` `POST /api/timeline/generate`. 10 credits.
- Users: `backend/app/routes/users.py` `POST /api/users/update-preferences` (invalidates intent contract, retriggers job rerank), `POST /api/users/onboarding-event`.

### 2.23 Chrome Extension

Repository: `chrome-extension/` (Manifest V3, version 1.0.9). Files: `manifest.json`, `background.js` (378 lines), `content.js` (867 lines), `popup.js` (1,604 lines), `popup.html`/`popup.css`, `build.js`/`build.mjs`, `tests/`. A separate Safari variant lives at `Safari-extension/`.

Permissions: `storage`, `activeTab`, `contextMenus`, `notifications`, `identity`, `downloads`.

Host permissions: `https://www.linkedin.com/*`, `https://linkedin.com/*`, `https://final-offerloop.onrender.com/*`.

OAuth2 client id (`manifest.json`): `184607281467-bv1qomua1ndf3jo0tdmpjvte4ukbkcli.apps.googleusercontent.com`. Scopes: `userinfo.email`, `userinfo.profile`.

Content script injection targets (14 patterns): LinkedIn `/in/*`, LinkedIn `/jobs/*`, Greenhouse (`boards.greenhouse.io/*`), Lever (`jobs.lever.co/*`), Workday (`*.myworkdayjobs.com/*`), Indeed, Handshake (three subdomains), Glassdoor, ZipRecruiter, Wellfound.

Two popup modes (`popup.html`):
- Contact mode (default for LinkedIn `/in/*` URLs): `findEmailBtn` "Find Email and Draft" calls `POST /api/contacts/import-linkedin`. `meetingBtn` "Meeting Prep" costs 15 credits.
- Job mode (auto detected on job posting URLs): `find-recruiters-btn` calls `POST /api/job-board/find-recruiter`. `cover-letter-btn` calls `POST /api/job-board/generate-cover-letter` then `POST /api/job-board/cover-letter-pdf`.

Backend endpoints called from extension (all to `https://final-offerloop.onrender.com`): `/api/auth/google-extension`, `/api/contacts/import-linkedin`, `/api/check-credits`, `/api/extension/scraper-log`, `/api/job-board/find-recruiter`, `/api/job-board/save-recruiters`, `/api/job-board/generate-cover-letter`, `/api/job-board/cover-letter-pdf`, `/api/meeting-prep`, `/api/meeting-prep/{prepId}` (polling).

Architecture notes:
- Service worker (`background.js`) handles all backend traffic and stores tokens in `chrome.storage.local`.
- LinkedIn SPA detection patches `history.pushState` and `history.replaceState`, listens for `popstate`, runs a `setInterval` fallback poll every 1s. On URL change, `init()` is called with a 500ms delay.
- MutationObserver attached to `.scaffold-layout__main` re injects the "Offerloop" button when LinkedIn re renders.
- Telemetry: every scrape call fires a `logScraperResult` message with platform, success, fields found, anonymized URL pattern.
- Right click context menu "Add to Offerloop" for LinkedIn profile links.

Status: Shipped (v1.0.9). Chrome Web Store URL: `https://chromewebstore.google.com/detail/offerloop/aabnjgecmobcnnhkilbeocggbmgilpcl`.

### 2.24 Known Dead, Broken, and In Flight

| Surface | Status | Note |
|---|---|---|
| `backend/app/routes/application_lab.py` | Dead | `application_lab_bp` exists, never registered in `wsgi.py`. Frontend still calls it. |
| `backend/app/routes/prompt_gallery.py` | Dead | `prompt_gallery_bp` exists, never registered. No frontend caller. |
| `backend/app/routes/networking_roadmap.py` | Dead at HTTP layer | Not registered. Service still called internally from briefing. |
| `wsgi.py:51-52` imports `events_bp` and `company_contexts_bp` | In flight, broken | Source `.py` files do not exist on disk. Only stale `.pyc` files remain in `backend/app/routes/__pycache__/events.cpython-314.pyc`. Will crash a clean boot. |
| `PDL_OUTAGE_ACTIVE = True` in `feature_flags.py:246` | Flagged | Hard coded kill switch currently disabling prompt search, free run, pro run, autocomplete, enrichment, and Meeting Prep. |
| 30 plus duplicate "X 2.py" files | In flight artifact | macOS Finder duplicates of routes/services/utils/scripts/tests. Imports always reference the non suffixed file. |
| Frontend Free tier shows 150 credits, backend `TIER_CONFIGS["free"]["credits"] = 300` | Drift | Documented inconsistency. Backend is source of truth. |
| Resume parser v1 (`resume_parser.py`) coexists with v2 (`resume_parser_v2.py`) | Partial migration | v1 still importable. |
| Two Scout services in parallel | Two surfaces | `scout_service.py` (3,605 lines, `scout_bp`) and `scout_assistant_service.py` (2,190 lines, `scout_assistant_bp`). |
| SerpAPI to Perplexity Sonar plus Firecrawl migration | In progress | Module docstrings document direction. SerpAPI client still active and used by `company_search.py`. Firm search retry env vars still target SerpAPI path. Newer code paths (`agent_actions.py`, `scout_service.py`) call Perplexity and Firecrawl directly. |
| Legacy `tier` field on user doc | In flight | Backend dual writes `subscriptionTier` and `tier`. Reads prefer `subscriptionTier`, fall back to `tier`, default to `free`. Firestore rules block client writes to either. |
| Bright Data client | Newly shipped | `bright_data_client.py` (no macOS duplicate) wired into LinkedIn enrichment fallback chain. CLAUDE.md describes it as "in development" but code paths are live. |

---

## 3. Tech and Infrastructure

### 3.1 Stack and Versions

Backend (Python; version not pinned in `runtime.txt`, GitHub Action uses 3.11):

- Flask 3.0.0, Werkzeug 3.0.1, gunicorn 21.2.0, flask-cors 4.0.0, Flask-Limiter 3.5.0
- openai 1.54.0, anthropic 0.52.0 (CLAUDE.md says `>=0.86`; actual pin is 0.52.0)
- firebase-admin 6.4.0, stripe 8.0.0, pydantic 2.12.5, pydantic-settings 2.12.0
- google-search-results 2.4.2 (SerpAPI), firecrawl-py `>=1.0`, google-api-python-client 2.114.0, google-auth-oauthlib 1.2.0
- Documents: pdfplumber 0.11.9, reportlab 4.0.7, python-docx 1.1.0, pdf2docx 0.5.6, weasyprint 67.0, jinja2 3.1.4, markdown 3.10.2, openpyxl 3.1.5
- Scraping/async: aiohttp 3.12.15, asyncpraw 7.8.1, praw 7.8.1, beautifulsoup4 4.12.3, youtube-transcript-api 1.2.4
- Test: pytest 7.4.3, pytest-cov 4.1.0, pytest-mock 3.12.0, pytest-asyncio 0.23.8
- Caching: cachetools 5.5.2, dateparser 1.2.0
- Optional commented: sentry-sdk[flask], flasgger

Frontend (TypeScript, Node 20 in GitHub Actions):

- React 18.2.0, Vite 5.0.0 plus @vitejs/plugin-react-swc 3.5.0, TypeScript 5.2.2
- react-router-dom 6.20.0, @tanstack/react-query 5.89.0
- firebase 10.7.0, @stripe/stripe-js 7.9.0
- 24 separate @radix-ui/react-* packages, tailwindcss 3.3.0, class-variance-authority 0.7.1
- react-hook-form 7.62.0, zod 4.1.9, date-fns 3.6.0, recharts 3.2.1
- PDF generation: @react-pdf/renderer 4.3.1, jspdf 3.0.4, html2canvas 1.4.1
- Animation: framer-motion 12.23.25, gsap 3.13.0, ogl 1.0.11
- Tour: react-joyride 2.9.3
- Analytics: posthog-js 1.308.0
- No frontend test framework declared (no jest, vitest, or playwright in `package.json`)

### 3.2 Firestore Data Model

Project: `offerloop-native` (`backend/app/extensions.py:82`).

Top level collections: `users`, `admins`, `system` (daemon health docs: `nudge_scanner`, `nudge_scanner_lock`, `queue_scanner`, `aggregation_scanner`, `agent_daemon`, `watchdog`, `gmail_watch`), `feature_flags`, `gmail_mappings` (Gmail address to uid index), `oauth_state`, `cache`, `enrichment_cache`, `school_detect_cache`, `school_hometown_cache`, `job_cache`, `job_cache_invalidations`, `analytics`, `metrics_events`, `recommendation_events`, `email_quality_logs`, `global_contact_outreach` (dedup across users), `schoolAffinity`, `prompt_parses`, `promptGallery`, `pending_auto_preps`, `pending_reply_drafts`, `replyDrafts`, `nudges`, `jobs`, `job_queue`, `emailTemplates`.

`users/{uid}` fields (from `backend/app/models/users.py` `create_user_data`): `uid`, `email`, `name`, `subscriptionTier` (source of truth), `tier` (legacy fallback, dual written), `credits`, `maxCredits`, `createdAt`, `lastCreditReset`, `lastUsageReset`, `upgraded_at`, `subscriptionStatus`, usage counters `alumniSearchesUsed`, `coffeeChatPrepsUsed`, `interviewPrepsUsed`, Stripe fields `stripeCustomerId`, `stripeSubscriptionId`. Frontend context also reads `professionalInfo`, `needsOnboarding`, `resumeParsed`, `academics`, `goals`, `pastCompanies`, `dreamCompanies`, `hometown`.

`users/{uid}/{subcollection}`:
- `contacts/`: saved contacts. Fields per `backend/app/models/contact.py` `normalize_contact`: `FirstName`, `LastName`, `LinkedIn`, `Email`, `Title`, `Company`, `City`, `State`, `College`, `Phone`, `PersonalEmail`, `WorkEmail`, `SocialProfiles`, `EducationTop`, `VolunteerHistory`, `WorkSummary`, `Group`, `Hometown`, `Similarity`, `Status` (default `Not Contacted`), `FirstContactDate`, `LastContactDate`, `pdlId`. Outbox additions: `inOutbox`, `pipelineStage`, `emailSentAt`, `threadStatus`, `warmth_score`, `warmth_tier`, `warmth_label`, `warmth_signals`.
- `integrations/gmail`: `token`, `refresh_token`, `token_uri`, `client_id`, `scopes`, `watchHistoryId`, `watchExpiration`, `watchStartedAt`.
- `scoutConversations/`: chat history. Fixed doc id `active` for the in progress conversation.
- `coffee-chat-preps/`: `linkedinUrl`, `status` (one of `pending, processing, enriching, researching, analyzing, generating, building, completed, failed`), `createdAt`, `userId`, `userEmail`, `contactData`, `companyNews`, `similaritySummary`, `coffeeQuestions`, `pdfPath`, `completedAt`, `error`.
- `interview-preps/`, `resume_library/`, `resume_scores/`, `cover_letter_library/`, `applicationLabAnalyses/`, `calendar_events/`, `recruiters/`, `notifications/`, `activity/`, `goals/`, `searchHistory/`, `firmSearches/`, `exports/`, `professionalInfo/info`, `jobPreferences/`
- `weekly_queues/{queue_id}` plus nested `weekly_queues/{queue_id}/contacts/`
- `settings/agent_config`, `settings/queue_preferences`
- `agent_actions/`, `agent_cycles/`, `agent_jobs/`, `agent_companies/`

Credit reset cadence: calendar month boundary (`auth.py:46-48`). `_check_reset_needed` is pure (no writes); caller applies updates. `deduct_credits_atomic(uid, amount, op)` for transactional safety.

### 3.3 Deployment

Render single service, no Docker. Build script `render-build.sh`:
1. `cd connect-grow-hire`, `npm ci || npm install` then `npm run build`. Falls back to bun.
2. `pip install --upgrade pip` then `pip install -r backend/requirements.txt --break-system-packages` (PEP 668 override).

Runtime: `gunicorn backend.wsgi:app --bind 0.0.0.0:5001 --workers 4`.

`backend/wsgi.py` flow:
1. Logging configured.
2. 41 blueprints imported at module level.
3. Prerender.io middleware as `@app.before_request`. Activates when `PRERENDER_TOKEN` env var is set. Bot user agent list (lines 75-86) covers 41 crawlers including `googlebot`, `gptbot`, `claudebot`, `anthropic-ai`, `perplexitybot`, `ccbot`, `chatgpt-user`, `google-extended`, `bytespider`. Skips API routes, `/assets/`, and any path ending in a file extension.
4. Request context (request_id, session_id) attached to every request.
5. `init_app_extensions(app)` initializes CORS, rate limiter, Firebase, Flask secret.
6. Sentry init (graceful degrade if `sentry_sdk` not installed).
7. Swagger init only when `FLASK_ENV=development`.
8. Error handlers registered.
9. Blueprints registered (lines 162-222). `linkedin_import_bp` before `contacts_bp`. Legacy Gmail aliases at `/api/gmail/*` wrap `/api/google/*`.
10. Static and SPA routes: `/`, `/assets/<filename>` (one year immutable cache), `/sitemap.xml`, `/robots.txt`, `/llms.txt`, SPA 404 fallback to `index.html`. `/api/*` 404s return JSON.
11. Six background daemon threads started.
12. `app = create_app()` is the Gunicorn entrypoint. `LIST_ROUTES=1` dumps URL map.

`firestore.rules`: user scoped enforcement (`request.auth.uid == userId` on every match). Inline helpers `getUserTier` (reads `subscriptionTier`, falls back to `tier`, defaults to `free`), `hasProOrEliteTier` (gates `exports/` creation). Default deny on everything else. Top level `system/feature_flags` read only for authenticated users.

`storage.rules`: single rule at `/resumes/{uid}/{allPaths=**}` allowing owner only read/write, max 10 MB, content type must match PDF, image, or DOC/DOCX.

No Cloudflare references in active backend code. Prerender.io is the only SSR layer.

### 3.4 Background Jobs and Webhooks

Six daemon threads in `wsgi.py` (all `daemon=True`):
1. Tracker scanner (`wsgi.py:307-365`). 6 hour interval, 5 minute boot delay. Runs three isolated scanners per iteration: nudge scanner, queue scanner (Tuesday gated), aggregation scanner (Sunday 3-9am UTC).
2. Gmail watch renewal (`wsgi.py:370-415`). 6 day interval. Renews any watch expiring within 24h. Per user exceptions caught. Logger `watch_renewal`.
3. Daemon watchdog (`wsgi.py:438-512`). 1 hour interval. Reads health docs from `system/{...}` and writes `system/watchdog` with `staleScanners` list. Thresholds: 8h nudge, 7d queue, 8d aggregation, 7d gmail_watch.
4. Agent daemon (`wsgi.py:522-541`). 1 hour interval.
5. Agent followup daemon (`wsgi.py:549-567`). 1 hour interval.
6. Agent digest daemon (`wsgi.py:575-593`). 24 hour interval.

ThreadPoolExecutor pools (selected):
- `backend/pipeline/fetcher.py`: max_workers 5 and 8.
- `backend/app/routes/jobs.py:28`: `_ranking_pool` max_workers 2.
- `backend/app/routes/job_board.py:361`: `_refresh_pool` max_workers 2, plus inline pool of 4.
- `backend/app/routes/meeting_prep.py:199`: max_workers 3.
- `backend/app/routes/runs.py:569`: max_workers 5 for batch enrichment.

Webhooks:
- Stripe webhook at `/api/stripe/webhook` (verified with `STRIPE_WEBHOOK_SECRET`).
- Gmail Pub/Sub at `/api/gmail/webhook`. Verifies via Google OIDC JWT plus optional `GMAIL_WEBHOOK_SECRET` HMAC fallback.
- Pub/Sub topic: `GMAIL_PUBSUB_TOPIC` env var, default `projects/offerloop-native/topics/gmail-notifications`.

Cron style:
- `POST /api/admin/renew-watches` accepts Firebase auth or `X-Cron-Secret` header matching `CRON_SECRET` (min 20 chars). Designed for external 12 hour cron.

GitHub Actions (`.github/workflows/`):
- `reddit-scanner.yml`: every 30 min. Runs `backend/scripts/reddit_scanner.py` on Python 3.11. Posts opportunities to Telegram.
- `weekly-blog-post.yml`: Fridays 09:00 UTC. Node 20. Runs `scripts/generate-blog-post.cjs` against OpenAI `gpt-4o`. Validates only allowed paths changed, rejects script/iframe content. Commits as `Offerloop Bot <bot@offerloop.ai>` to `main`.

### 3.5 Third Party Integrations

| Integration | Use | Client |
|---|---|---|
| OpenAI (GPT-4) | Primary LLM (emails, scout, resume, ranking, prep). 300s timeout. Custom httpx pool (50 keepalive, 200 max) | `backend/app/services/openai_client.py` |
| Anthropic Claude | Fallback LLM. Used by agent planner directly. | `backend/app/services/openai_client.py:9-14` |
| Perplexity (Sonar / Sonar Pro / Sonar Deep Research) | Live web search and grounded research. Replaces SerpAPI for jobs, company research, person research, news. | `backend/app/services/perplexity_client.py` (OpenAI compatible SDK, `base_url="https://api.perplexity.ai"`) |
| Firecrawl | Structured web extraction with Pydantic schemas. Replaces Jina Reader. | `backend/app/services/firecrawl_client.py` |
| Bright Data | LinkedIn profile scraping via dataset API. Dataset id `gd_l1viktl72bvl7bjuj0`. | `backend/app/services/bright_data_client.py` |
| Jina Reader | Web content extraction `https://r.jina.ai/{url}`. Used in self enrichment chain. | `backend/app/utils/linkedin_enrichment.py:126` |
| People Data Labs | Contact search (2.2B records), enrichment, alumni queries. | `backend/app/services/pdl_client.py` (3,590 lines) |
| Hunter.io | Email finder and verification. | `backend/app/services/hunter.py` |
| SerpAPI | Google Search for firm discovery (legacy). | `backend/app/services/serp_client.py` |
| Stripe | Subscriptions, checkout, webhooks. | `backend/app/services/stripe_client.py`, `backend/app/routes/billing.py` |
| Firebase | Auth, Firestore, Storage. | `backend/app/extensions.py` |
| Gmail API | OAuth, drafts, sends, thread sync, watch. | `backend/app/services/gmail_client.py` |
| Google Cloud Pub/Sub | Gmail push notifications. | `backend/app/routes/gmail_webhook.py` |
| YouTube Data API | Interview prep scraping. | `backend/app/services/interview_prep/youtube_scraper.py` (`YOUTUBE_API_KEY`) |
| RapidAPI (FantasticJobs) | Job posting fetcher. | `backend/pipeline/fetcher.py` (`RAPIDAPI_KEY`) |
| Reddit (PRAW) | Interview prep + growth scanner. | `backend/scripts/reddit_scanner.py`, `backend/app/services/interview_prep/reddit_scraper.py` |
| Telegram Bot | Reddit scanner alerts. | `backend/scripts/reddit_scanner.py:268` |
| Prerender.io | SSR for 41 bot UAs (proxies non-API GET requests). | `backend/wsgi.py:69-127` |
| PostHog | Frontend analytics, identification on auth. | `connect-grow-hire/src/lib/posthog.ts` |
| Sentry | Backend error tracking (optional, graceful degrade). | `backend/app/utils/sentry_config.py` |

### 3.6 Environment Variables

AI/LLM: `OPENAI_API_KEY`, `CLAUDE_API_KEY`, `PERPLEXITY_API_KEY`.

Data/search: `PEOPLE_DATA_LABS_API_KEY`, `SERPAPI_KEY` (also `SERP_API_KEY` alias), `HUNTER_API_KEY`, `FIRECRAWL_API_KEY`, `JINA_API_KEY`, `BRIGHTDATA_API_KEY`, `YOUTUBE_API_KEY`, `RAPIDAPI_KEY`.

Payments: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID` (default `price_1ScLXrERY2WrVHp1bYgdMAu4`), `STRIPE_ELITE_PRICE_ID` (default `price_1ScLcfERY2WrVHp1c5rcONJ3`).

Auth/Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_SERVICE_ACCOUNT_FILE`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_CLOUD_PROJECT_ID` (default `offerloop-native`), `OAUTH_REDIRECT_URI`, `FIREBASE_API_KEY` / `FIREBASE_WEB_API_KEY`, `OAUTHLIB_INSECURE_TRANSPORT` (auto set when redirect URI is localhost).

Gmail / Pub/Sub: `GMAIL_PUBSUB_TOPIC` (default `projects/offerloop-native/topics/gmail-notifications`), `GMAIL_WEBHOOK_SECRET`, `DEFAULT_FROM_EMAIL` (default `noreply@offerloop.ai`).

Infra/Flask: `FLASK_ENV`, `FLASK_DEBUG`, `ENVIRONMENT`, `FLASK_SECRET` (required in prod, default `dev` in non prod), `RENDER` (auto set), `RENDER_GIT_COMMIT`, `CORS_ORIGINS`, `PRERENDER_TOKEN`, `SENTRY_DSN`, `CRON_SECRET` (min 20 chars in prod), `ADMIN_API_SECRET`, `ADMIN_UIDS`, `LIST_ROUTES`.

Feature flag toggles: `NUDGES_ENABLED` (default true), `QUEUE_SCANNER_ENABLED` (true), `AGGREGATION_SCANNER_ENABLED` (true), `WATCHDOG_ENABLED` (true), `AGENT_DAEMON_ENABLED` (true), `AGENT_FOLLOWUP_ENABLED` (true), `AGENT_DIGEST_ENABLED` (true), `PROMPT_SEARCH_ENABLED` (false), `CREATE_GMAIL_DRAFTS` (false, hardcoded constant), `<FLAG>` / `<FLAG>_KILL` per flag overrides, `DEBUG_RESUME_TRACE`.

Job board tuning: `MAX_JOB_AGE_DAYS` (30), `MIN_QUALITY_SCORE` (15), `FIRM_SEARCH_OVERFETCH_MULTIPLIER` (2.5), `FIRM_SEARCH_RETRY_MULTIPLIER` (3.0), `FIRM_SEARCH_MAX_ITERATIONS` (2), `FIRM_SEARCH_MAX_TOTAL_MULTIPLIER` (5.0).

Reddit scanner: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

Frontend (Vite): `VITE_API_BASE_URL` (`https://offerloop.ai/api`), `VITE_FIREBASE_*` (6), `VITE_PUBLIC_POSTHOG_KEY`, `VITE_PUBLIC_POSTHOG_HOST`, `NGROK_HOST` (dev only).

### 3.7 Scoring and Ranking Pipelines

Warmth scoring (`backend/app/utils/warmth_scoring.py`): pure functions, no API calls. Shared identity capped at 45 pts (same university +20, same major +10, same hometown +8, same past employer +15). Career relevance, role match, data richness. Thresholds: warm >= 50, neutral >= 25, else cold. Labels: `Strong fit`, `Good fit`, `Right company, different role`, `Strong match` (fallback).

Job ranking (`backend/app/utils/job_ranking.py`): two stage. Stage 1 `deterministic_score`: +40 exact title match, +30 partial, +15 industry/level, up to +20 from skill overlap, +10 location, +10 dream company, +4 same city, +15 recent posting, +5 has description, +10 known company. Stage 2 `rank_with_gpt`: top 20 jobs sent to OpenAI for `match_score` (0-100) and `match_reason`. Remaining jobs scaled to 0-49.

ATS scoring (`backend/app/services/ats_scorer.py`): Keywords 35%, Formatting 20%, Relevance 45% (AI). Quality gate `assess_job_description_quality` filters low quality JDs.

Recruiter ranking (`backend/app/services/recruiter_finder.py`): `score_recruiter` awards +50 for recruiter title list match, +40 for title priority list (decaying), +25 seniority match, +20/+10 contains checks. Base scores by job type bucket: engineering 100, sales 70, marketing 40, intern 20, general 10.

Scout AI scoring (`backend/app/services/scout_service.py`): `overall_score`, `score`, `potential_score_after_edits`, `score_breakdown` used for fit assessment.

Company recommendation rungs (`backend/app/services/company_recommendations.py`): deterministic R1 to R5 classification (`ScoutSentence.rung`). R4 and R5 fully deterministic; R1 to R3 use LLM variation for hero detail paragraph.

School affinity (`backend/app/services/school_affinity.py`): PDL alumni queries (limit 500 profiles) aggregated by company, cached 30 days in `schoolAffinity` collection.

Contact search ranking (`backend/app/services/contact_search_optimized.py:260`): `score_and_rank_candidates` for ranking PDL candidates before email verification.

### 3.8 Auth Internals

`backend/app/extensions.py`:
- `init_firebase`: idempotent, reuses `firebase_admin._apps`. Falls back to ADC. Project id `offerloop-native`, storage bucket `offerloop-native.firebasestorage.app`.
- `get_db()`: singleton Firestore client accessor.
- `@require_firebase_auth`: skips `OPTIONS`. Verifies `Bearer` token via `fb_auth.verify_id_token` with `clock_skew_seconds=5`. Three retry attempts with exponential backoff on transient network errors. Returns 401 for invalid/expired tokens, 503 with `{"retry": true}` for network errors after max retries.
- `@require_tier(allowed_tiers)`: must be applied outside `@require_firebase_auth`. Always re fetches tier from Firestore.
- Rate limiting: flask-limiter, default 2,000/day, 500/hour. Fixed window. Storage: starts as `memory://`, swapped to `FirestoreStorage` if available. Exempts static assets, root, GET `/api/meeting-prep/<id>` polling.
- CORS: dev origins localhost:5173/8080/8081 and 127.0.0.1 equivalents. Prod origins `https://offerloop.ai`, `https://www.offerloop.ai`, plus `CORS_ORIGINS`. `supports_credentials=True`, `max_age=3600`. Headers Content-Type, Authorization, X-Requested-With, X-Session-Id. Methods GET, POST, PUT, DELETE, OPTIONS, PATCH. Applied to `/api/*` and `/*`.
- Flask secret enforcement in production: raises `RuntimeError` if `FLASK_SECRET` is unset or equals `"dev"`.

### 3.9 Vite Build Peculiarities

`connect-grow-hire/vite.config.ts`:
- `@vitejs/plugin-react-swc` (not standard `@vitejs/plugin-react`).
- `resolve.dedupe: ['react', 'react-dom']` and `optimizeDeps.include`.
- `build.minify: 'esbuild'`. No sourcemaps in production.
- Manual chunk splitting strategy: aggressive grouping of React dependent libs into `vendor-react` chunk to prevent "Cannot access before initialization" errors. Forced into `vendor-react`: react, react-dom, react-router, react-hook-form, @tanstack/react-query, react-day-picker, embla-carousel-react, react-resizable-panels, react-fast-marquee, react-is, all @radix-ui/*, framer-motion, recharts, @hookform/resolvers, cmdk, sonner, vaul, input-otp, next-themes, lucide-react, defensively zod and ogl. Separate chunks: `vendor-firebase`, `vendor-utils`, `vendor-animations`, `vendor-dates`, `vendor-stripe`. Default unmatched `node_modules` lands in `vendor-react`.
- `preserveEntrySignatures: false`, `hoistTransitiveImports: false`, `generatedCode.constBindings: true` to prevent init errors.

### 3.10 Architectural Surfaces Worth Highlighting

- Two parallel Scout services (`scout_service.py` 3,605 lines, `scout_assistant_service.py` 2,190 lines) registered as separate blueprints.
- Three dead but committed blueprints (`application_lab_bp`, `prompt_gallery_bp`, `networking_roadmap_bp`).
- Two broken imports in `wsgi.py` (`events_bp`, `company_contexts_bp`) that will crash a clean boot.
- One hard coded global outage switch `PDL_OUTAGE_ACTIVE = True`.
- Two PDF generators (`pdf_builder.py` and `pdf_patcher.py`), three PDF dependencies (ReportLab, WeasyPrint, @react-pdf/renderer on frontend).
- Two resume parsers (`resume_parser.py` v1, `resume_parser_v2.py` v2).
- One in flight migration (SerpAPI plus Jina to Perplexity plus Firecrawl).
- One legacy field migration ongoing (`tier` to `subscriptionTier`).
- 30 plus macOS Finder duplicate files in working tree.

---

## 4. Current Public Positioning

Captured 2026-05-17 from `https://www.offerloop.ai/`. Quoted text is verbatim. Some pages did not return SSR content when fetched with a Googlebot UA; those gaps are noted.

### 4.1 Homepage

Meta:
- Title tag, verbatim: `Offerloop - AI Networking for College Students | Find, Reach & Track Professionals`
- Meta description, verbatim: `Offerloop helps college students find professionals, generate personalized cold emails, and track networking conversations. Search 2.2B verified contacts. Built for consulting, IB, and tech recruiting.`
- OpenGraph title (different from page title), verbatim: `Offerloop - Recruiting Made Simple`
- OG description, verbatim: `Professional networking platform for USC students - AI-powered meeting prep, interview prep, and contact management`
- Schema.org JSON-LD: `Organization` (foundingDate 2025), `SoftwareApplication` with three `Offer` entries (Free $0, Pro $14.99/mo, Elite $34.99/mo), `aggregateRating` 4.9 with reviewCount 41.

Top nav (left to right): Logo, `Features`, `Extension`, `Reviews`, `Sign in`, `Create account`. Pricing is not in the homepage nav.

Hero eyebrow pill, verbatim: `Made for students chasing their first offer`.

H1, verbatim (two lines, with `outreach` and `offer` rendered in brand blue):

> We do the outreach
> You land the offer

Subheadline, verbatim: `Tell us who you want to meet. We write personalized intros in your Gmail and track every reply for you.`

Hero search input placeholder example, verbatim: `USC alumni working at Go`

Hero right side: animated Gmail style mock with `Compose / Inbox / Starred / Sent / Drafts` sidebar, a "Finding 5 contacts" progress chip, confirmation `✓ 5 in Gmail` and `Drafts auto-written into your Gmail / Synced`.

Trust band heading, verbatim: `Trusted by students at the country's top universities`

Two hero testimonials (cycling):
- `"As an international student, I had no pre-existing network, and Offerloop allowed me to find and connect with professionals that resulted in me landing an offer."` David Ji, `Incoming FedEx Intern`.
- `"Automating cold outreach gave me more time spent face to face with professionals who could actually help."` Sarah Ucuzoglu, `Advisory Intern, PwC`.

Stats band: `2.2B+ verified contacts` and `2,400+ students` (note: About page elsewhere says `300+`).

"How It Works" section H2, verbatim: `How It Works`. Body, verbatim: `Prompt the type of person you want to talk to and instantly have personalized emails created in your drafts ready to send. At the same time their information is stored into a networking tracker spreadsheet.`

Chrome extension section H2, verbatim: `Works right inside LinkedIn`. Sub: `Write emails to anyone from their profile. Find hiring managers on any job posting. All from a single Chrome extension.` CTA: `Add to Chrome - it's free`.

"Where your time actually goes" comparison heading: `Where your time actually goes.` Rows, verbatim:
- `Finding one person's email`: `20 min` vs `~3 sec` (`Verified email, instantly`)
- `Writing one personalized email`: `15 min` vs `~10 sec` (`AI-drafted and in your Gmail`)
- `Prepping for one meeting`: `45 min` vs `~30 sec` (`Full prep sheet with talking points`)
- `Logging each contact to a spreadsheet`: `5 min` vs `0 sec` (`Auto-tracked the moment you search`)

Totals: `1 hr 25 min` vs `< 1 min`. Punchline, verbatim: `That's 84 minutes back - per contact you reach out to.`

Feature grid H2, verbatim: `Everything You Need to Network Smarter`. Four cards, verbatim H3 and body:
1. `Find Hiring Managers`: `Paste a job posting URL and we'll find the recruiters and hiring managers for that role.`
2. `Manage Emails`: `Track every email you've sent, see who opened it, who replied, and who needs a follow-up.`
3. `Meeting Prep`: `Paste a LinkedIn URL and get a personalized prep sheet with talking points, recent news, and smart questions.`
4. `Find Company`: `Describe the type of companies you're looking for in plain English and we'll find them for you.`

Testimonial wall H2, verbatim: `Be the next to land your offer.` Sub: `Real students. Real outreach. Real offers.` Cards tagged `Offer landed` or `Student review`. Twelve quotes attributed to: Dylan Roby (Evercore), Jackson Leck (Blackstone), David Ji (FedEx), Sarah Ucuzoglu (PwC), Marcus T. (Goldman Sachs), Priya S. (NYU), Jordan W. (Deloitte), Alex M. (Georgetown), Sophia K. (Lazard), Emma L. (USC), Ryan C. (Centerview), Nina P. (Michigan). Plus a `Show 6 more` button.

Footer columns, verbatim:
- Features: Find People; Meeting Prep; Interview Prep; Chrome Extension; Job Board.
- Resources: Networking Guides; Meeting Prep; Cold Email Guides; Alumni Directory; Compare Offerloop.
- Company: About; Blog; Contact Us.
- Legal: Privacy; Terms of Service.

Bottom line: `© 2026 Offerloop. All rights reserved.` Social icons: X/Twitter, LinkedIn, Instagram, TikTok (all at `*.com/offerloop`).

### 4.2 Pricing Page

`/pricing` is gated. SSR returns a sign in card (`Welcome back`, `Sign in to continue to your account`, `Sign in with Google`). No public marketing pricing page exists; the URL redirects to `/signin?mode=signin&returnTo=%2Fpricing`.

Pricing claims that are publicly verifiable from other surfaces:
- Homepage JSON-LD: Free $0, Pro $14.99/mo, Elite $34.99/mo.
- `/compare/linkedin` table row, verbatim: `Free / $14.99/mo Pro` for Offerloop vs `Free / $29.99-59.99/mo Premium` for LinkedIn.
- `/compare/apollo` row, verbatim: `Free / $14.99/mo Pro` for Offerloop vs `$49-119/mo (annual billing)` for Apollo.
- `/compare/handshake` row, verbatim: `Free / $14.99/mo Pro` for Offerloop vs `Free for students` for Handshake.

Important: every public surface lists Pro at **$14.99/mo**, not the $9.99 stated in CLAUDE.md. Elite at $34.99/mo matches CLAUDE.md. No free trial duration is mentioned anywhere publicly.

Free tier credits stated as `300 credits` on `/compare/apollo` (consistent with backend `config.py` 300, contradicting frontend `constants.ts` 150 noted in CLAUDE.md).

### 4.3 About Page

Top nav on About differs from homepage: `Pricing`, `About`, `Sign in`, `Create account`.

Hero, verbatim: `Built by students, for students`.

Lead paragraph, verbatim: `Offerloop is a networking and outreach platform - not an email provider. Founded in 2025 at the University of Southern California by three students who were frustrated with the manual grind of networking for internships, we built the tool we wished we had.`

Our Story (verbatim, three paragraphs):
- `During recruiting season at USC, we spent hundreds of hours doing the same thing every other student was doing - searching for professionals on LinkedIn, guessing email addresses, writing personalized outreach messages one by one, and tracking everything in messy spreadsheets. It was exhausting, inefficient, and it took away from the experiences that make college worth it.`
- `We realized the tools that existed - LinkedIn, Handshake, Apollo - weren't built for students. LinkedIn doesn't give you email addresses. Handshake only has job postings. Apollo costs $50-500/month and is designed for enterprise sales teams. There was nothing that helped a college student find the right person, write a great email, send it, and track the response - all in one place.`
- `So we built Offerloop. What started as a side project in a dorm room in 2025 has grown to 300+ users across USC, UCLA, Michigan, NYU, Georgetown, UPenn, and more. We're still students ourselves, which means we use Offerloop every day and understand the challenges firsthand.`

Founders, verbatim:
- `Nick Wittig`, `CEO`, `USC Class of 2027`
- `Deena Siddharth Bandi`, `CTO`, `USC Class of 2026` (note: `llms.txt` calls him `Sid Bandi`, same person)
- `Rylan Bohnett`, `CMO`, `USC Class of 2027`

Mission, verbatim: `Our mission is to make professional networking accessible to every college student. Recruiting for competitive roles in consulting, investment banking, and tech shouldn't require hundreds of hours of manual work. Offerloop automates the busywork - finding contacts, writing emails, tracking conversations - so students can focus on building real relationships and preparing for the opportunities that matter.`

Traction tiles:
- `300+` `Active student users`
- `41` `Paying subscribers`
- `22%` `Free-to-paid conversion`
- `$0` `Customer acquisition cost`
- `6+` `Universities represented`

Caption, verbatim: `Launched and validated at USC. Growing organically across UCLA, University of Michigan, NYU, Georgetown, and UPenn.`

Timeline, verbatim:
- `Spring 2025`: `Idea born at USC`
- `Summer 2025`: `First prototype built`
- `Fall 2025`: `Beta launch, first users`
- `Now`: `300+ users, growing daily`

Final CTA: `Join 300+ students from USC, Georgetown, NYU & more`, `Try Offerloop free`, `Free to start. Set up in under two minutes.`, `Create free account`.

### 4.4 Blog

Heading: eyebrow `BLOG`, H1 `Networking & Recruiting Guides`, sub `Actionable guides on cold emailing, meetings, and breaking into consulting, banking, and tech. Written for college students by the Offerloop team.`

18 posts on the index, dates 2026-03-13 to 2026-04-03 (one March post then mostly a March 13-21 burst, latest post 2026-04-03). Topics: cold email mechanics, meetings, recruiting timelines, alumni outreach, competitor comparisons. Tone is direct, second person, parenthetical hooks ("That Actually Work", "That Get Replies", "Copy + Paste").

Voice sample from `/blog/cold-email-mckinsey-consultant`, verbatim opening: `Here's something most students don't realize: McKinsey consultants get fewer cold emails than you think, and they respond to more of them than you'd expect. The ones who don't respond aren't ignoring you because they're too important - they're ignoring you because your email looked like everyone else's. This guide fixes that.`

Cadence: about 18 posts spanning 3 weeks then a 13 day gap until 2026-04-03. Generation is automated via GitHub Action Fridays 09:00 UTC.

### 4.5 Programmatic SEO Page Samples

`/networking/goldman-sachs` H1 verbatim: `How to Network at Goldman Sachs as a College Student`. Hero: `Investment banking recruiting is one of the most competitive processes on any campus. Internal referrals and networking are the primary way students land interviews at top banks.` Sections: `Why Networking at Goldman Sachs Matters`, `Who Should You Reach Out to at Goldman Sachs?`, `How to Write a Cold Email to a Goldman Sachs Employee` (sample template), `How to Prepare for Your Goldman Sachs Meeting` (5 bullets), `4 Steps to Network at Goldman Sachs with Offerloop`, FAQ (5 Q&A), `Related Resources`, CTA `Find Goldman Sachs employees on Offerloop / Search 2.2B verified contacts...`

`/alumni/usc` H1 verbatim: `How to Leverage USC Alumni for Recruiting`. Sections: `Why USC Alumni Are Your Secret Weapon`, `Where USC Alumni Work` (`Goldman Sachs / McKinsey / Google / Deloitte`), `How to Find USC Alumni at Your Target Companies` (recommends Offerloop), `3 Email Templates for USC Alumni Outreach` (General Meeting, Division Specific, Referral Request).

`/meeting/{slug}` did not return SSR content on the slugs sampled (`mckinsey`, `goldman-sachs`). Returned only the 4 KB JS shell.

`/cold-email/investment-banking` H1: `Cold Email Templates for Investment Banking Recruiting`. Hero verbatim: `Cold emailing is one of the most effective ways to break into investment banking. These templates have been refined through thousands of successful outreach campaigns by students targeting Goldman Sachs, JPMorgan, Morgan Stanley, Evercore, Lazard.` Sections include `5 Cold Email Templates for Investment Banking` (Meeting Request, Alumni Connection, Post Event Follow Up, Informational Interview Request, Referral Ask), Subject Lines, Send Timing.

`/compare/linkedin` hero verbatim: `LinkedIn has the largest professional network in the world. But it wasn't built for proactive outreach - Offerloop was. Use LinkedIn to research. Use Offerloop to reach out.` Comparison table includes Primary Use Case, Built for Students, Contact Database (`2.2B verified emails | 900M+ profiles (no emails)`), AI Email Generation, Gmail Integration, Networking Pipeline Tracker, Professional Profiles, Pricing.

`/compare/apollo` hero verbatim: `Apollo.io is a powerful B2B sales platform - but it's built for sales teams, not students. Offerloop delivers the same core capability (find contacts, send emails) at a fraction of the price, with features designed specifically for student networking.`

`/compare/handshake` hero verbatim: `Handshake is the best platform for job postings and campus recruiting events. Offerloop is the best platform for proactive cold outreach and 1-on-1 networking. Most successful students use both.`

`/networking-for/investment-banking-analyst` H1: `Student Networking Guide for Investment Banking Analyst Positions`. Meta: `Industry: Investment Banking`, `Timeline: Applications open June-August for summer analysts`, `Interview Type: Technical + behavioral, superday format`.

`/glossary` H1: `Recruiting & Networking Glossary`. 25 entries alphabetical. Sample terms: Alumni Network, Bulge Bracket, Meeting, Cold Email, Elite Boutique, Engagement Manager, MBB, OCR, Offer Exploding, Pipeline, Private Equity, Referral, Superday, Target School, Walk Me Through Your Resume.

### 4.6 Brand Surface

Tone: direct, college peer register, slightly punchy. Mixes short imperatives ("Tell us who you want to meet") with conversational mechanics ("That's 84 minutes back"). Uses em dashes liberally in marketing copy. Speaks in second person, frames product as teammate ("We do the outreach"). Founders position company as student built, not enterprise SaaS.

Typography:
- Headlines: `Libre Baskerville` serif (homepage hero, section H2/H3) and `Instrument Serif` in auth screens.
- Body: `Inter` sans serif.
- Mono: `JetBrains Mono` (loaded, occasional accent).

Color palette:
- Brand blue: `rgb(37, 99, 235)` (primary CTAs, hero word highlights).
- Lighter blue: `rgb(96, 165, 250)`.
- Deep navy: `rgb(15, 37, 69)` (headline text).
- Slate gray: `rgb(71, 85, 105)` (body).
- Off white background `rgb(255, 255, 255)` with radial gradient `rgb(238, 244, 253)` to `rgb(220, 231, 247)`.
- Internal theme name: `<html data-theme="stationery">`.

Visual style cues: pill shaped floating header with backdrop blur, large rounded cards with subtle box shadows, radial blue gradient hero with animated drifting blobs and floating particles, faint dot grid backgrounds, animated SVG concentric rings. Aesthetic reads as "clean modern fintech" rather than "AI techy".

### 4.7 Persona Signals

Schools named: USC (most prominent, founding school, repeated in About and traction caption), UCLA, University of Michigan, NYU, Georgetown, UPenn. Programmatic alumni pages also cover Berkeley, Duke, UT Austin, UVA, Harvard, Stanford, Princeton, plus 192 total universities in the alumni sitemap section.

Industries explicitly targeted:
- Investment Banking (`Goldman Sachs, JPMorgan, Morgan Stanley, Evercore, Lazard`)
- Management Consulting (`MBB`, `McKinsey & Company, Boston Consulting Group, Bain & Company`, Deloitte, Big 4)
- Tech (`Google, Meta, Microsoft, Apple, Anthropic, OpenAI` per `llms.txt`)
- Private Equity (`Blackstone, KKR, Carlyle, TPG, Warburg Pincus, Apollo`)
- Hedge Funds (`Citadel, Two Sigma, Point72, Millennium, DE Shaw, Bridgewater, Renaissance` per `llms.txt`)
- Venture Capital (`a16z, Sequoia`)
- Defense/intel (`Palantir vs Anduril Recruiting` blog post; SpaceX in sitemap)

Pain points named, verbatim:
- `searching for professionals on LinkedIn, guessing email addresses, writing personalized outreach messages one by one, and tracking everything in messy spreadsheets`
- `LinkedIn doesn't give you email addresses. Handshake only has job postings. Apollo costs $50-500/month and is designed for enterprise sales teams.`
- `1 hr 25 min` per contact manually vs `< 1 min`
- International students with no existing network (David Ji testimonial)
- Recruiting weekends consumed by manual work

Persona register: written in second person, college junior voice, references summer analyst recruiting timelines and superdays. Acknowledges international students explicitly.

### 4.8 Social Proof

Public numbers:
- `2.2B+ verified contacts`
- `2,400+ students` (homepage)
- `300+ Active student users` (About traction tile)
- `41 Paying subscribers`
- `22% Free-to-paid conversion`
- `$0 Customer acquisition cost`
- `6+ Universities represented`
- `4.9 rating, 41 reviews` (Schema.org aggregateRating; identical to subscriber count)

Named testimonials: 12 total on homepage (most listed in 4.1). Many last names are initialed only.

Logos: no third party logo bar on the public site. Trust band is text only.

Press: none mentioned anywhere.

### 4.9 Footer Links and Sitemap (Public)

Homepage footer hrefs found in source: `/about`, `/blog`, `/contact-us`, `/privacy`, `/terms-of-service`, `/find`, `/meeting-prep`, `/interview-prep`, `/job-board`, `/alumni/usc`, `/networking/goldman-sachs`, `/meeting/bain`, `/cold-email/investment-banking`, `/compare/linkedin`, plus Chrome Web Store URL.

robots.txt: allow lists `*`, GPTBot, ClaudeBot, anthropic-ai, PerplexityBot, Googlebot, Bingbot, Bytespider. Disallows `/app`, `/dashboard`, `/api`, `/auth`, `/home`, `/tracker`, `/settings`. Sitemap at `https://www.offerloop.ai/sitemap.xml`.

llms.txt (full quote captured in section 6.4). Names `People Data Labs` as the contact source (only public surface that names the data vendor) and lists hedge funds `Citadel, Two Sigma, Point72, Millennium, DE Shaw, Bridgewater, Renaissance` that do not appear in any other marketing facing copy.

### 4.10 Pages That Did Not Render for Crawlers

When fetched with a Googlebot UA, the following returned only the 4 KB JS shell (no SSR content), meaning they may not be crawlable:
- `/pricing` (gated, redirects to signin instead)
- `/meeting/mckinsey`, `/meeting/goldman-sachs`
- `/networking/mckinsey` (template renders fine for `goldman-sachs`, so this is per slug not per template)
- `/data`

---

## 5. Marketing to Product Gap Analysis

### 5.1 Marketed but Missing or Weaker than Implied

These appear in marketing copy or `llms.txt` and either do not exist in the codebase, are gated differently than implied, or are currently disabled.

- "Find Hiring Managers" feature card: `Paste a job posting URL and we'll find the recruiters and hiring managers for that role.` Code path exists at `backend/app/routes/job_board.py:7600` `POST /find-recruiter` but is gated `@require_tier(['pro', 'elite'])`. Free users cannot access. The homepage copy does not mention this restriction.
- "Manage Emails" feature card: `Track every email you've sent, see who opened it, who replied, and who needs a follow-up.` The product tracks sent emails, replies, and follow up needs (Outbox, Reply Coach, Nudges). Open tracking ("see who opened it") is not implemented anywhere in the backend; no Gmail open-tracking pixel or polling logic found.
- "Meeting Prep" pitch: `Paste a LinkedIn URL and get a personalized prep sheet with talking points, recent news, and smart questions.` Implementation exists but is currently 503ing because of the `PDL_OUTAGE_ACTIVE` kill switch. Public copy does not reflect the outage.
- "Find Company" feature card: `Describe the type of companies you're looking for in plain English and we'll find them for you.` Firm Search exists but is Pro/Elite only and capped at 15 firms server side. Not visible to Free.
- "Networking pipeline tracker" claim on compare pages: tracker exists, but its sophistication (cooldown enforcement, automatic reply detection, agent integration, warmth scoring) is not communicated.
- `llms.txt` Pro tier line: `Pro: unlimited searches, full email generation, meeting prep`. `unlimited searches` is not supported by `config.py`; Pro is capped at 1,500 credits/month and Meeting Prep at 10/month.
- `llms.txt` claims "limited contact searches" for free tier and "unlimited" for Pro. Free is actually 300 credits/month and Pro is 1,500 credits/month per `config.py`.
- Brand/site copy never mentions the Offerloop Agent (Elite tier autonomous copilot), the Weekly Networking Queue, or the Nudge system. The product has a significant agentic surface area that the marketing site does not surface.
- Recommendations feed (with school affinity and "X UCLA alumni at McKinsey" Scout sentences) is not mentioned publicly. Funnel measurement is now wired up admin side but the surface itself is invisible to marketing.
- Two distinct Scout surfaces (`Scout` for job fit, `Scout Assistant` for product help via Cmd+K) are not mentioned anywhere publicly.
- 30 day free trial (claimed in CLAUDE.md as Stripe trial duration) does not appear on any public page. Public CTA says only `Free to start. Set up in under two minutes.`.
- Pricing copy in the auto generated blog generator system prompt (`scripts/generate-blog-post.cjs`) says `Pro $14.99/mo` consistent with the public site, but conflicts with CLAUDE.md's `$9.99` claim. The frontend `constants.ts` mirror also shows 150 Free credits vs backend 300.

### 5.2 Shipped but Invisible to the Public

Significant product surface that exists in code and is exercised by users, but is not mentioned anywhere on the marketing site:

- Offerloop Agent (Elite autonomous copilot, `/agent` and `/agent/setup` pages). Three daemon threads run cycles, follow ups, and digests. Approval modes (`review_first` vs `autopilot`), send modes (`drafts_only` vs `auto_send`). No public mention.
- Weekly Networking Queue (Phase 2 Tuesday scan, Pro/Elite gated). No public mention.
- Nudge system (six hour scanner, stale follow up plus stuck student suggestions, AI personalized text). No public mention.
- Reply Coach (auto generated reply drafts on inbound mail). No public mention.
- Warmth scoring with explicit tiers (cold/neutral/warm), labels (Strong fit, Good fit, Right company different role), and signals. No public mention.
- Recommendations feed with deterministic Scout sentences and school affinity. No public mention.
- Two parallel Scout surfaces. No public mention.
- Firm Search SSE streaming endpoint, Firm history library, dedicated industries/sizes options endpoints. No public mention.
- Networking Roadmap (briefing roadmap progress section for Pro/Elite). No public mention.
- Auto Meeting Prep on reply: when a contact replies, Outbox triggers a meeting prep automatically. Mentioned nowhere publicly.
- Chrome extension Job mode (`Find & Email Recruiters`, `Generate Cover Letter` directly from a job posting). Public extension copy emphasizes LinkedIn only: `Works right inside LinkedIn`.
- Application Lab (UI route mounted at `/application-lab`, backend service exists at 3,082 lines). Currently dead at the API layer because blueprint isn't registered. Public site does not mention it.
- Cooldown system (rolling 30 day global outreach dedup across users). No public mention.

### 5.3 Where Public Framing Diverges from Code Structure

- Public framing: "We do the outreach, you land the offer" emphasizes a fully automated outreach pipe. Code structure shows the autonomous pipeline (Agent) is Elite tier only. Free and Pro tiers are manual flows with Gmail drafts plus tracker. The "we do" promise is more accurate for Elite than for Free.
- Public site emphasizes contact search and email generation as the core unit. Code structure shows the product is wider: prep documents (meeting, interview), job board with recruiter finding, resume workshop, cover letter workshop, firm search, application analysis, alumni discovery, recommendations feed.
- Compare pages position Offerloop as "Built for Students". Code shows tier configs include `agent_enabled`, `priority_queue`, `weekly_insights`, `personalized_templates`, `early_access`. Some of these read as enterprise SaaS feature flags rather than student facing language.
- The marketing site references `300+ users` (About) and `2,400+ students` (homepage) within the same brand surface. The two numbers are publicly inconsistent.
- Founder name is `Deena Siddharth Bandi` on the About page and `Sid Bandi` in `llms.txt` (same person).
- Founding date is `2025` per Schema.org Organization and About page, `2024` per `llms.txt`.
- CLAUDE.md says PDL search returns from a "2.2B-contact database" and the homepage says `2.2B+ verified contacts`. The same number is used both as "contacts" and "verified emails" (compare/linkedin row): `2.2B verified emails`. The underlying PDL dataset is profile based, not email based; not every PDL record carries a verified email.

---

## 6. SEO Footprint

### 6.1 Sitemap Composition

Sitemap location: `connect-grow-hire/public/sitemap.xml` (7,477 lines, 1,494 `<loc>` entries). Note: all URLs use `https://www.offerloop.ai/...` form, but CLAUDE.md canonical is non www `offerloop.ai`. Mismatch in normalization.

Breakdown by category:

| Prefix | URL count | Notes |
|---|---|---|
| `/networking/` | 499 | One fewer than the 500 entry data file |
| `/meeting/` | 499 | Same |
| `/alumni/` | 192 | Data file has 196 |
| `/networking-for/` | 79 | Data file has 80 roles |
| `/cold-email/` | 59 | Data file has 60 industries |
| `/compare/` | 146 | Data file has 151 pairs plus 4 hardcoded comparisons |
| `/blog/` | 9 | 18 posts on disk; only 9 indexed |
| Top level singles | ~10 | `/`, `/about`, `/pricing`, `/blog`, `/glossary`, `/data`, plus six legacy `/cold-email-*`, `/alumni-outreach`, `/meeting-networking` pages |

### 6.2 Templating Approach

Two patterns:

Pattern A, hardcoded one off React pages (one component per URL):
- `/compare/handshake` -> `CompareHandshake.tsx`
- `/compare/linkedin` -> `CompareLinkedIn.tsx`
- `/compare/apollo` -> `CompareApollo.tsx`
- `/compare/chatgpt` -> `CompareChatGPT.tsx`
- `/cold-email-consulting` -> `ColdEmailConsulting.tsx`
- `/cold-email-investment-banking` -> `ColdEmailBanking.tsx`
- `/cold-email-tech-internships` -> `ColdEmailTech.tsx`
- `/alumni-outreach` -> `AlumniOutreach.tsx`
- `/meeting-networking` -> `MeetingNetworking.tsx`
- `/glossary` -> `Glossary.tsx`
- `/data` -> `DataStats.tsx`

Pattern B, slug driven template routes (one component, many URLs from a static data file):

| Route | Template component | Data source | Slug count |
|---|---|---|---|
| `/networking/:slug` | `pages/templates/NetworkingGuide.tsx` | `src/data/companies.ts` | 500 |
| `/meeting/:slug` | `pages/templates/MeetingGuide.tsx` | `src/data/companies.ts` | 500 |
| `/cold-email/:slug` | `pages/templates/ColdEmailGuide.tsx` | `src/data/industries.ts` | 60 |
| `/alumni/:slug` | `pages/templates/AlumniGuide.tsx` | `src/data/seo-universities.ts` | 196 |
| `/networking-for/:slug` | `pages/templates/RoleNetworkingGuide.tsx` | `src/data/roles.ts` | 80 |
| `/compare/:comparison` | `pages/templates/CompanyComparison.tsx` | `src/data/comparisons.ts` plus parsing `slugA-vs-slugB` against `companies.ts` | 151 |
| `/blog/:slug` | n/a (markdown loader) | `src/content/blog/*.md` | 18 |

Wrapper pattern: thin component reads `useParams().slug`, looks the slug up in the static array, renders the template or `<Navigate to="/" replace />` on miss. Title and meta come from `connect-grow-hire/src/utils/generateMeta.ts` with switch cases per `routeType` (compare, meeting, cold-email, networking, alumni, blog) and per slug overrides in `CUSTOM_OVERRIDES` and `BLOG_OVERRIDES` maps.

### 6.3 Target Query Patterns

`/networking/{company}` meta title: `{Company} Networking Guide for Students (2026)`. H1: `How to Network at {Company} as a College Student`. Sample slugs: mckinsey, bcg, bain, deloitte, goldman-sachs, jpmorgan, morgan-stanley, blackstone, google, meta, evercore, lazard, kkr, citadel, two-sigma, apollo, carlyle, sequoia, a16z, stripe.

`/meeting/{company}` meta title: `How to Get a Meeting at {Company}, Email Templates & Tips`. Uses same 500 company slugs.

`/cold-email/{industry}` meta title: `Cold Email Templates for {Industry} Jobs, 2026`. Sample slugs: management-consulting, investment-banking, private-equity, tech, venture-capital, hedge-funds, product-management, real-estate, healthcare, fintech.

`/alumni/{university}` meta title: `{Univ} Alumni Network Guide, Who to Reach and How`. Sample slugs: usc, ucla, michigan, nyu, georgetown, upenn, duke, uva, berkeley, northwestern, harvard, stanford, princeton.

`/networking-for/{role}` meta titles: role specific. Sample slugs: investment-banking-analyst, management-consulting-intern, software-engineering-intern, product-manager-intern, private-equity-analyst, data-science-intern, venture-capital-analyst, quantitative-researcher, ai-research-intern.

`/compare/{slugA-vs-slugB}` parsed via `comparison?.split('-vs-')`. Sample slugs from `comparisons.ts`: mckinsey-vs-bcg, mckinsey-vs-bain, goldman-sachs-vs-morgan-stanley, google-vs-meta, blackstone-vs-kkr, openai-vs-anthropic, citadel-vs-two-sigma, palantir-vs-anduril, figma-vs-canva, snowflake-vs-databricks. Twelve specific pairs have hand authored meta overrides in `generateMeta.ts` (lines 4 to 52). Default fallback meta: `{X} vs {Y}: Recruiting, Target Schools & Culture (2026)`.

### 6.4 llms.txt (verbatim)

Located at `connect-grow-hire/public/llms.txt`:

> # Offerloop
>
> ## About
> Offerloop is an AI-powered career networking platform built for college
> students targeting competitive careers in investment banking, consulting,
> private equity, hedge funds, and tech. Students use Offerloop to find
> verified professional contacts, generate personalized cold emails, prepare
> for meetings, and track their networking outreach.
>
> ## What It Does
> - Contact search: find verified professionals at target firms using
>   People Data Labs, filtered by company, title, school, and industry
> - Cold email generation: AI-written personalized outreach emails based
>   on the contact's background and the student's goals
> - Meeting prep: AI-generated preparation guides for informational
>   interviews at specific companies
> - Network tracker: Gmail-integrated CRM that auto-detects replies and
>   tracks outreach status
> - Interview prep: company-specific interview guides scraped from Reddit
>   and YouTube
> - Resume workshop: AI resume feedback tailored to target industries
>
> ## Who It's For
> College students and recent graduates targeting:
> - Investment banking (bulge bracket, elite boutique, middle market)
> - Management consulting (MBB, Big 4, boutique)
> - Private equity and hedge funds (Citadel, Two Sigma, Point72, Millennium,
>   DE Shaw, Bridgewater, Renaissance)
> - Venture capital
> - Tech (Google, Meta, Microsoft, Apple, Anthropic, OpenAI)
> - Other competitive industries
>
> ## Pricing
> - Free: limited contact searches and email generation
> - Pro: unlimited searches, full email generation, meeting prep
> - Elite: all Pro features plus priority support

Plus key pages list, an FAQ block, and a contact block naming `Sid Bandi (CTO), Nick Wittig (CEO), Rylan Bohnett (CMO)` and `Founded: 2024`.

### 6.5 Blog System

Location: `connect-grow-hire/src/content/blog/` (18 `.md` files). Markdown with YAML frontmatter (`title`, `date`, `description`, `slug`, `keywords`, `schema`, `canonicalUrl`). Served via `/blog` (`Blog.tsx`) and `/blog/:slug` (`BlogPost.tsx`).

Generation: GitHub Action `weekly-blog-post.yml` runs Fridays 09:00 UTC. Script `scripts/generate-blog-post.cjs` reads a content calendar at `connect-grow-hire/src/content/06_content_calendar.json`, iterates entries, finds the first slug not yet in `connect-grow-hire/src/content/blog/`, calls OpenAI `gpt-4o` (`max_tokens: 4096`, `temperature: 0.7`), writes the markdown, appends a `<url>` entry to `sitemap.xml`, and commits to `main` as `Offerloop Bot <bot@offerloop.ai>`.

System prompt rules mandate: minimum 2,500 words, 6+ copy paste templates, FAQ with 6 questions, FAQPage and optional HowTo JSON-LD, no em dashes, no "unleash/delve/game-changer", Offerloop mentioned 3 to 4 times maximum.

Pricing in the blog system prompt: `Free / Pro $14.99/mo / Elite $34.99/mo` (matches public pricing, conflicts with CLAUDE.md's $9.99 Pro).

### 6.6 Prerender Setup

`backend/wsgi.py:69-130` `prerender_middleware()` intercepts GET requests with `User-Agent` matching `BOT_AGENTS` (41 entries including googlebot, bingbot, gptbot, claudebot, anthropic-ai, perplexitybot, ccbot, chatgpt-user, google-extended, bytespider, telegrambot, discordbot, applebot, whatsapp). Bot requests proxied to `https://service.prerender.io/{url}` with `X-Prerender-Token` header. Non bot, API, asset requests pass through.

### 6.7 Structured Data and Meta

`SEOHead` component at `connect-grow-hire/src/components/SEOHead.tsx` emits via `react-helmet-async`: `<title>`, `<meta name="description">`, `<link rel="canonical">` (always `https://www.offerloop.ai{pathname}`), `og:title`, `og:description`, `og:url`, `og:type` (default `website`, templates pass `article`), `twitter:card=summary_large_image`, `twitter:title`, `twitter:description`.

JSON-LD `application/ld+json` blocks: 21 components emit them. Templates emit `FAQPage` plus `HowTo` (confirmed on `NetworkingGuide.tsx`). One off pages emit `FAQPage`, `Article`, or product specific schemas.

### 6.8 SEO Surface Discrepancies

- Sitemap and data file counts diverge slightly (off by one to off by five across categories). Most likely staleness in the generator rather than blocked URLs.
- Only 9 of 18 blog posts in sitemap.
- `/pricing` is gated and redirects to signin; it should not be a marketable URL.
- Some programmatic slugs do not render SSR for crawlers despite being in the sitemap (`/networking/mckinsey`, `/meeting/mckinsey`, `/meeting/goldman-sachs`, `/data`). May indicate Prerender cache misses or per slug rendering failures.

---

## 7. Signals About Strategy and Direction

Pulled only from code evidence and recent commits. No speculation.

### 7.1 Pivot Toward Perplexity Plus Firecrawl

Module docstrings declare the direction explicitly. `backend/app/services/perplexity_client.py:1-9`: "Replaces SerpAPI for: job search, company research, person research, news. Replaces SerpAPI+OpenAI two-step for: meeting research, firm discovery." `backend/app/services/firecrawl_client.py:1-8`: "Replaces Jina Reader for: URL scraping, LinkedIn extraction. New capability: structured extraction with Pydantic schemas." Newer code paths (`agent_actions.py`, `scout_service.py`, `scout_assistant_service.py`) call Perplexity and Firecrawl directly. SerpAPI client remains alive and is still the active path for firm search retries. Migration in progress, not complete.

### 7.2 Agentic Copilot as the Top of the Funnel for Elite

Three Elite gated daemon threads (`_agent_daemon_loop`, `_agent_followup_loop`, `_agent_digest_loop`) run on production by default per their `*_ENABLED` env var defaults. The agent has a full action graph (find and draft, find jobs, discover companies, find hiring managers, follow up) and Claude based planner with Perplexity market context. The `/agent` and `/agent/setup` frontend pages are mounted. This is a meaningful Elite tier differentiation that does not appear publicly.

### 7.3 Recommendation Funnel Measurement

Most recent commit `dabd418` is `feat(admin): GET /api/admin/recommendation-funnel for measurement readout`. The funnel stages are explicit: `recommendation_shown, email_drafted, email_sent, email_replied, meeting_scheduled, offer_received`. Admin gated by `ADMIN_UIDS` env var, caps date range at 90 days. Signals investment in instrumentation of the recommendations feed end to end (from impression to offer accepted).

### 7.4 Email Quality Aggregation

`backend/app/services/email_baseline.py` `aggregate_email_outcomes` scanner runs Sundays 3-9am UTC. Logs reply rates by industry bucket. Powers future warmth weighting and email quality gating. Implies a learning loop, not a static template system.

### 7.5 Multiple Generations of Resume Tools

Both `resume_parser.py` v1 and `resume_parser_v2.py` v2 exist; both `resume_optimizer_v2.py` exists, suggesting v1 was retired. PDF generation has three independent paths (`pdf_builder.py`, `pdf_patcher.py`, frontend `@react-pdf/renderer`). Indicates iteration on resume layout preservation.

### 7.6 Aggressive Programmatic SEO Bet

1,494 sitemap URLs across six programmatic categories. Auto generated blog cadence (Fridays). Per slug meta overrides for 12 high traffic comparison pairs in `generateMeta.ts`. 25 entry glossary. The size of the SEO surface relative to the rest of the public site is the most visible strategic investment.

### 7.7 University Specific Distribution

Founder narrative pinned to USC. Traction caption: "Launched and validated at USC. Growing organically across UCLA, University of Michigan, NYU, Georgetown, and UPenn." OG meta description on homepage hardcoded as `Professional networking platform for USC students`. School affinity service (`school_affinity.py`) caches PDL alumni counts per university for 30 days; alumni recommendation surfaces. Implies a distribution model that scales university by university rather than blanket digital ads. The "$0 CAC" claim is consistent with this.

### 7.8 Chrome Extension as Acquisition Lever

Manifest V3, 14 host patterns, eight job board scrapers, two popup modes, telemetry on every scrape. Hosted on Chrome Web Store. Marketing site has a full section dedicated to it (`Works right inside LinkedIn`). Indicates the extension is treated as a top of funnel acquisition surface rather than a feature for existing users.

### 7.9 Stalled or Half Cut Areas

- Three dead but committed blueprints (`application_lab_bp`, `prompt_gallery_bp`, `networking_roadmap_bp`).
- Two broken imports (`events_bp`, `company_contexts_bp`) that would crash a clean boot.
- PDL outage flag hard coded to true currently disabling the core "Find" flow.
- 30 plus macOS duplicate "X 2.py" files in working tree.
- Frontend tier mirror drift (`constants.ts` Free 150 vs backend 300).

The Application Lab is the most pronounced gap: a 3,082 line service plus a frontend page plus a frontend service file all wired to call routes that do not exist.

---

## 8. Open Questions and Ambiguities

These could not be cleanly resolved from code and public surface alone. A human should clarify before any downstream messaging work.

1. Pricing: public site, Stripe price IDs, and blog generator prompt all say Pro is $14.99/mo. CLAUDE.md says $9.99. Which is authoritative? (Stripe is most likely the technical source of truth; the dollar amount displayed at checkout would resolve this.)
2. Free trial duration: CLAUDE.md says 30 days. Public site does not mention any trial duration. Stripe configuration not directly inspectable from repo. What is the actual trial behavior?
3. User counts: homepage says `2,400+ students`. About page says `300+ users` and `41 paying subscribers`. Both surfaces are within the same brand. Which number is current?
4. PDL outage status: `PDL_OUTAGE_ACTIVE = True` is a hard coded module constant, not Firestore driven. Is this a permanent state or an active incident? Has the public site been updated to acknowledge it, or are users currently hitting 503s without explanation?
5. Application Lab status: the blueprint is unregistered and the frontend page is still mounted. Was this rolled back, never shipped, or an in flight build? Frontend calls will currently 404.
6. Three dead blueprints (`prompt_gallery`, `networking_roadmap`, `application_lab`): cleanup intended, or part of an in flight feature?
7. `wsgi.py:51-52` imports `events_bp` and `company_contexts_bp` that do not exist as `.py` files. How is production booting? Possibly there is a `.pyc` cache that survives or these are local artifacts only.
8. Founder name: `Deena Siddharth Bandi` (About page) vs `Sid Bandi` (llms.txt). Which form is preferred for public materials?
9. Founding year: 2025 (homepage Schema.org, About page) vs 2024 (llms.txt). Which is correct?
10. Anthropic SDK version: `requirements.txt` pins `anthropic==0.52.0` but CLAUDE.md says `>=0.86`. Has there been a downgrade?
11. `chrome-extension/manifest.json` host permissions point at `https://final-offerloop.onrender.com/*`, not `offerloop.ai`. Was the extension updated when the canonical domain changed?
12. `2.2B verified contacts` claim: PDL profile dataset is 2.2B people, but not all carry verified emails. Compare/linkedin page says `2.2B verified emails`. Is "verified emails" wording intentional or an overstatement?
13. Cooldown system: rolling 30 day global outreach dedup across users is a meaningful integrity mechanism. Is this messaged anywhere to users, or is it purely silent?
14. Three founder titles list `CTO, CEO, CMO`. Is the user the same person as `deena.bandi004@gmail.com` (CTO) per the git config? The auto memory says `userEmail: deena.bandi004@gmail.com`, but the recent git author on commits is `deenabandi004-byte`.
15. Two Scout surfaces (`scout` and `scout_assistant`) overlap functionally. Is this intentional segmentation (job fit chatbot vs product help copilot) or two competing implementations heading toward consolidation?

---

End of snapshot. Generated from a synchronous two pass audit on 2026-05-17. All file paths are relative to `/Users/nicholaswittig/Desktop/offerloop/Final_offerloop`. All marketing copy quoted from the public site at `https://www.offerloop.ai/` is verbatim except where noted as paraphrase.
