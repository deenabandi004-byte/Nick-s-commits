# TODOS

Deferred work tracked across reviews. Items added by /plan-ceo-review.

## Email Personalization Engine (2026-04-08)

### P2: "Why This Email Works" Transparency Panel
- **What:** After generating an email, show which warmth signals and research hooks were used
- **Why:** Builds user trust in AI-generated emails, teaches users what good personalization looks like
- **Pros:** Increases confidence in sending, educational for students learning to network
- **Cons:** Adds UI complexity to email generation flow
- **Context:** warmth_scoring returns signals list, B2 returns hooks with types. Both are already computed during generation, just need to surface them. Display as collapsible section below the email.
- **Effort:** S (human: ~3 hrs / CC: ~20 min)
- **Priority:** P2
- **Depends on:** Phase A email personalization shipping first

### P3: Writing Style Learning
- **What:** Analyze user's past edited emails to learn their voice and match it in future generations
- **Why:** Makes AI emails indistinguishable from user's own writing style
- **Pros:** Highest-quality personalization possible, true moat
- **Cons:** Requires ~10+ edited emails per user for meaningful signal, cold start problem, privacy consideration (analyzing user's writing)
- **Context:** Users edit generated emails before sending. Track edits (diff original vs sent version), extract style patterns (sentence length, formality, vocabulary). Feed back into system prompt as style examples.
- **Effort:** L (human: ~2 weeks / CC: ~2 hrs)
- **Priority:** P3
- **Depends on:** Users actively editing and sending emails for several weeks. Gmail integration for tracking sent versions.

## AI Intelligence Flywheel (2026-04-08)

### P1: Extract `industry_classifier.py` (Phase 2 prerequisite)
- **What:** New `backend/app/utils/industry_classifier.py` with one canonical `classify_industry(company, title) -> str` function. Both `email_baseline.py` and `warmth_scoring.py` import from it.
- **Why:** The two files currently maintain their own keyword maps and they've already drifted (4 categories vs 6). When Phase 2 writes `industry` into composite segment keys, a classifier mismatch will silently miss segment lookups. Extract once, fix the divergence at the source.
- **Pros:** Eliminates a class of silent bugs. Single canonical industry taxonomy. Makes Q2.6 cardinality math reliable.
- **Cons:** Touches 2 existing files, needs migration of all callers in one PR to avoid temporary inconsistency.
- **Context:** Surfaced by /plan-eng-review on 2026-04-09 (Issue 6) while resolving the 8 Phase 2 sub-design questions. Buckets: `{investment_banking, consulting, private_equity, venture_capital, tech, finance, other}` - 7 total. Order matters: specific firms before generic keywords.
- **Effort:** S (human: ~2 hrs / CC: ~15 min)
- **Priority:** P1 (blocking Phase 2)
- **Depends on:** nothing - pure refactor.

### P1: Email quality eval suite (Phase 2 prerequisite)
- **What:** A pytest-based eval suite in `backend/tests/eval_email_generation.py` that takes a frozen set of contact + user fixtures, runs `reply_generation.py` against them, and compares outputs against a baseline. Required for the Phase 2 prompt change in Q2.7.
- **Why:** Q2.7 injects a "historical signal" block into the email generation system prompt. Without an eval, we have no way to know if the change improves, regresses, or has zero effect on email quality. The flywheel requires measurement to close the loop.
- **Pros:** Catches prompt regressions before they ship. Required for any future prompt iteration. Aligns with the eval-as-test pattern in CLAUDE.md.
- **Cons:** Requires building fixture set + scoring rubric. Some judgment in scoring (use a second LLM as judge, or hand-graded baseline).
- **Context:** Surfaced by /plan-eng-review on 2026-04-09 while resolving Q2.7. Phase 2 cannot ship its prompt change without it. Suggested approach: 20-30 fixture pairs (contact + user profile), each with a hand-graded "good" output. New runs are scored by GPT-4 against the baseline on relevance, specificity, naturalness. Pass = mean score ≥ baseline within 0.5 stddev.
- **Effort:** M (human: ~1 week / CC: ~45 min)
- **Priority:** P1 (blocking Phase 2 launch, not blocking implementation)
- **Depends on:** Phase 2 sub-design (just resolved). Pairs naturally with the regression test for `insight=None → byte-identical prompt`.


### P2: Onboarding Data → Scout System Prompt (cut from Flywheel 2026-04-09)
- **What:** Inject user's onboarding signals (career track, target industries, dream companies, personal note) into Scout's system prompt so Scout conversations reference the student's actual goals.
- **Why:** Scout currently treats every user identically. Personalization is a trust/quality unlock, and the data already exists from the new 5-step onboarding flow (`goals.careerTrack`, `goals.dreamCompanies`, `goals.personalNote` in Firestore).
- **Pros:** Cheap (30 min of prompt engineering). Uses data already collected. Immediate perceived intelligence improvement on Scout.
- **Cons:** Scout is actively being redesigned in a separate sprint (14 system prompts, 3,400 lines). Landing a prompt change now means the redesign has to either reconcile or revert it. Hidden coupling during a refactor.
- **Context:** Originally cherry-pick #3 of the AI Intelligence Flywheel CEO review (2026-04-08). Cut during the 2026-04-09 re-review because it violated the Scout-redesign-sprint directive. This is explicitly a *Scout sprint* item, not flywheel work. Implement alongside the new prompt architecture so it absorbs cleanly. The memory file `project_scout_redesign.md` names this exact item as the thing that should wait.
- **Effort:** S (human: ~30 min / CC: ~5 min)
- **Priority:** P2
- **Depends on:** Scout redesign sprint in flight. Onboarding goals schema already shipped (March 2026).

### ~~P1: Instrument Tracker Page Views~~ (DONE 2026-04-09)
- Completed: `trackContentViewed("network_tracker", "page_view")` shipped at `connect-grow-hire/src/pages/NetworkTracker.tsx:52`. Removed from active TODOs during /plan-eng-review on 2026-04-09.

### P2: Weekly Email Digest (Phase 1.5)
- **What:** Weekly summary email to Pro/Elite users: nudges pending, reply rates, pipeline health score
- **Why:** Only out-of-app channel to re-engage users who don't check the tracker regularly. Critical for the nudge system's reach.
- **Pros:** Brings users back to the app, surfaces flywheel value even for low-engagement users
- **Cons:** Requires new infrastructure dependency (transactional email service). SendGrid free tier (100 emails/day) sufficient for current scale.
- **Context:** Gmail API integration sends FROM the user's own account, which is wrong for system-to-user emails. Need SendGrid, SES, or Postmark. Opt-in for launch (flip to opt-out once quality proven).
- **Effort:** M (human: ~1 week / CC: ~45 min)
- **Priority:** P2
- **Depends on:** Phase 1 nudges shipped. SendGrid account setup.

### P1: Daemon Thread Healthcheck & Auto-Restart (upgraded from P2 on 2026-04-09)
- **What:** Healthcheck watchdog for Gmail watch renewal, nudge scanner, AND queue scanner daemon threads. Each daemon writes a timestamp to Firestore (`system/gmail_watch.lastRunAt`, `system/nudge_scanner.lastScanAt`, `system/queue_scanner.lastSuccessAt`). A periodic check detects stale timestamps and restarts dead threads.
- **Why:** All three daemons die silently on unhandled exceptions. Currently no detection or recovery. At 300 users this is annoying; at 3,000 it's an outage. Three daemons × silent failure = operational time bomb.
- **Pros:** Reduces operational risk for all three daemons with one watchdog. Self-healing. Small code footprint.
- **Cons:** Adds complexity to wsgi.py. Healthcheck itself could fail. Restart-in-process may not recover from zombie state.
- **Context:** Gmail watch renewal already has this bug (flagged in CLAUDE.md). Nudge scanner added the second daemon. Queue scanner will add the third. A single watchdog thread that checks all three timestamps every hour and attempts restart covers all daemons. Upgraded from P2 to P1 on 2026-04-09 during /plan-eng-review - the risk compounds non-linearly.
- **Effort:** S (human: ~3 hrs / CC: ~15 min)
- **Priority:** P1
- **Depends on:** Phase 1 nudge scanner shipped, Phase 2 queue scanner shipped.

### P2: Best Time to Send Insights
- **What:** Analyze reply data to identify optimal send times by segment (day of week, time of day)
- **Why:** Students sending emails at 2am get worse reply rates than 9am Tuesday. Surfacing this data helps users time their outreach.
- **Pros:** Actionable insight from flywheel data, visible AI value
- **Cons:** Requires sufficient data volume. Phase 2 aggregation must accumulate data first.
- **Context:** Deferred from cherry-pick ceremony. Depends on Phase 2 reply rate tracking being operational for 2+ months with meaningful volume.
- **Effort:** M (human: ~1 week / CC: ~30 min)
- **Priority:** P2
- **Depends on:** Phase 2 aggregation pipeline operational with 2+ months of data.

## Agentic Networking Queue (2026-04-08)

### P2: Batch Approve with Send Stagger Scheduling
- **What:** When users hit "Approve All" on the weekly queue, spread Gmail draft sends across 2-3 days instead of creating all 5 drafts simultaneously. Users can optionally schedule send times.
- **Why:** Sending 5 cold emails in the same 30-second window looks like spam. Staggering improves reply rates and reduces account flagging risk.
- **Pros:** Better reply rates, more natural outreach pattern, reduces Gmail sender reputation risk
- **Cons:** Adds send-timing state management (scheduled sends table, cron job, retry logic). Problem barely exists at 5 contacts per week - this is preemptive.
- **Context:** Deferred from Phase 1 cherry-pick ceremony. Revisit once Phase 1 usage data shows whether approve-all behavior is common enough to matter. If users approve contacts individually over days, the problem self-solves.
- **Effort:** S (human: ~4 hrs / CC: ~30 min)
- **Priority:** P2
- **Depends on:** Phase 1 queue shipped + 4 weeks of usage data showing approve-all behavior.

### P2: Queue Analytics Dashboard
- **What:** Dashboard showing queue approval rate, reply rate comparison vs manual search, week-over-week retention, most-approved contact attributes
- **Why:** Validates the flywheel thesis ("per-student taste model compounds") with real numbers. Answers "is the learning loop working?"
- **Pros:** Data-driven Phase 3 decisions, debugging tool for selection algorithm
- **Cons:** Needs Phase 2 reply tracking to be operational first - nothing meaningful to show until then
- **Context:** Deferred from cherry-pick ceremony. Becomes valuable once Phase 2 reply data accumulates.
- **Effort:** M (human: ~1 week / CC: ~45 min)
- **Priority:** P2
- **Depends on:** Phase 2 reply rate tracking operational with 2+ months of data.

### P3: Weekly Email Digest Notification
- **What:** Tuesday morning email to Pro/Elite users: "Your queue of 5 contacts is ready. 3 warm matches this week." Links directly to the Suggested For You tab.
- **Why:** Out-of-app re-engagement. Builds the Tuesday habit even for users who forget to open the app.
- **Pros:** Habit formation, re-engagement channel, reinforces predictability thesis
- **Cons:** Requires SendGrid or equivalent (new dependency). Same infra cost as the nudge digest (P2 above).
- **Context:** Phase 3 of the agentic queue plan. Share infrastructure with the nudge weekly digest.
- **Effort:** S if SendGrid already exists (~2 hrs / CC: ~20 min); M otherwise (~1 week / CC: ~45 min)
- **Priority:** P3
- **Depends on:** Phase 1 queue shipped + SendGrid setup (shared with nudge digest).

### P3: Extract BottomSheet Primitive from Queue Dismiss Modal (2026-04-09)
- **What:** After Phase 1 ships, extract a reusable `<BottomSheet>` component from the queue dismiss modal into `connect-grow-hire/src/components/ui/bottom-sheet.tsx`. Wraps Radix Dialog with the mobile bottom-sheet variant (`rounded-t-xl rounded-b-none fixed inset-x-0 bottom-0`) and falls back to centered modal at `sm:` and up. Migrate any other hand-rolled mobile modals to use it.
- **Why:** Pass 6 of /plan-design-review specced a mobile bottom sheet for the dismiss modal. shadcn/ui has no bottom-sheet primitive, so Phase 1 will hand-roll it inside the queue. Other surfaces (email compose, upgrade modal, notifications) would benefit from the same pattern and will drift if each reinvents it. Shared primitive prevents that.
- **Pros:** Eliminates future drift. One mobile modal pattern across the app. Easier to maintain. Sets the mobile modal bar for future surfaces.
- **Cons:** Premature abstraction if no second caller materializes. Phase 1 proves the need first - extracting after shipping is the safer path.
- **Context:** Surfaced during /plan-design-review Pass 6 (Responsive & Accessibility) on 2026-04-09. Extract-after-shipping rather than design-upfront because the queue is the first known consumer. Wait for a second caller before generalizing further.
- **Effort:** S (human: ~4 hrs / CC: ~25 min)
- **Priority:** P3
- **Depends on:** Phase 1 queue shipped with hand-rolled bottom sheet variant. A second caller identified (email compose mobile variant is the likely candidate).

### P2: Automated Accessibility Testing for Queue + Tracker (2026-04-09)
- **What:** Add `@axe-core/react` in dev mode (logs a11y violations to console during development) + a Playwright smoke test that loads `/tracker?tab=queue` with a seeded queue fixture, runs axe-core, and asserts zero violations. The test also verifies focus order through tab switching, card action buttons, and dismiss modal, plus asserts the ARIA live region announces state changes.
- **Why:** Pass 6 of /plan-design-review locked a detailed ARIA spec (live regions, focus ring helper, state announcements, 44px touch targets). There is currently no automated check to catch regressions. Any subsequent PR could drop an aria-label, break focus order, or regress a touch target, and nobody would notice until a screen-reader user complains. A11y debt compounds invisibly.
- **Pros:** Locks the Pass 6 spec against regression. Catches issues in CI, not production. Dev-mode axe-core gives immediate feedback during implementation. Sets the a11y bar for all future tracker work.
- **Cons:** Requires Playwright setup (currently no frontend test framework per CLAUDE.md). Non-trivial initial investment. Playwright adds CI time.
- **Context:** Surfaced during /plan-design-review Pass 6 (Responsive & Accessibility) on 2026-04-09. Phase 1 ships the full ARIA spec but no automation to defend it. Frontend has zero test framework today - this TODO is the forcing function to add one. Scope the first Playwright test to just the queue tab; expand to other tracker tabs after it proves out.
- **Effort:** M (human: ~1 week / CC: ~1 hr)
- **Priority:** P2
- **Depends on:** Phase 1 queue shipped with ARIA spec. Playwright setup (net-new for this repo).

### P2: Migrate Tracker Cards to ContactCardBase Primitives (2026-04-09)
- **What:** Refactor the existing Pipeline tab cards, Nudge tab cards, and `CurrentPositionCard` in NetworkTracker to use the new ContactCardBase primitives (`<ContactAvatar>`, `<ContactIdentity>`, `<CardAccentBorder>`, `<StatusLine>`) that Phase 1 queue introduces. Delete the old bespoke card markup.
- **Why:** Phase 1 queue ships the primitives but deliberately does NOT migrate the existing tracker cards (scope lock from /plan-design-review). This leaves two parallel card rendering systems: the new primitives for queue, the old bespoke JSX for Pipeline/Nudges. Drift risk is real - any visual tweak has to be made in two places, and over time the systems will diverge (spacing, colors, warmth treatment, border accents).
- **Pros:** Single source of truth for card styling. Eliminates drift. Future card changes ship once, apply everywhere. Design system consistency. Makes the next /design-review much easier to satisfy.
- **Cons:** Touches high-traffic tracker code. Requires visual regression testing across Pipeline, Nudges, and the new queue. Non-trivial diff (every card call site).
- **Context:** Surfaced during /plan-design-review Pass 5 (Design System Alignment) on 2026-04-09. Phase 1 scope was explicitly locked to queue-only - migrating existing cards would have doubled the review surface. Deferring was the right call, but the work must not rot. Do this immediately after Phase 1 ships and before Phase 2 learning-loop work starts touching tracker UI.
- **Effort:** S (human: ~1 day / CC: ~45 min)
- **Priority:** P2
- **Depends on:** Phase 1 queue shipped with ContactCardBase primitives exported from `connect-grow-hire/src/components/tracker/shared/ContactCardBase.tsx`.

### P2: "Why This Contact?" AI Reasoning Card (2026-04-09)
- **What:** Expandable panel on each queue card showing the AI's actual reasoning in plain English: "Selected because: USC alumni (2019), same industry as your Goldman target, recently promoted to VP." Toggles open on click, collapsed by default.
- **Why:** Pass 3 of /plan-design-review flagged that warmth badges carry all the "why" in Phase 1. A single "warm" pill is thin signal. A real reasoning card makes the AI's judgment legible, 10x's trust, and closes the loop on "earn autonomy through behavior" - users see the logic, agree or disagree, and the approve/dismiss signal becomes more meaningful training data.
- **Pros:** Highest-leverage trust builder in Phase 2. Makes the learning loop feel alive. Converts skeptical dismissals into informed dismissals. Unlocks the "Progressive Coach" emotional arc.
- **Cons:** Requires Phase 2 structured reasoning signals (warmth sub-scores, filter match weights, historical approval patterns). Phase 1 warmth scoring returns signals list but not ranked explanations. Needs prompt engineering to render signals as plain-English sentences without slop.
- **Context:** Surfaced during /plan-design-review Pass 3 (User Journey & Emotional Arc) on 2026-04-09. Phase 1 ships with warmth badges only as a trust proxy. Phase 2 learning loop adds the structured signals needed to author the reasoning card. Component slots into existing ContactCardBase below the email preview.
- **Effort:** S (human: ~6 hrs / CC: ~30 min)
- **Priority:** P2
- **Depends on:** Phase 2 learning loop operational with structured selection signals (warmth sub-scores, filter match weights, dismissal pattern weights).

### P3: Smart Timing / Cadence Precision
- **What:** Replace fixed Tuesday-morning cadence with per-user optimal timing based on engagement patterns, recruiting season, and target firm application windows
- **Why:** Engagement timing precision becomes meaningful at 500+ users with enough data to personalize per-student
- **Pros:** Higher engagement per queue, better alignment with recruiting cycles
- **Cons:** Destroys habit/predictability thesis at current scale. Cross-model review explicitly challenged this - fixed cadence wins until 500+ users.
- **Context:** Deferred per cross-model agreement. Revisit ONLY when user count > 500 and data shows cycle-to-cycle engagement drop under fixed cadence.
- **Effort:** L (human: ~2 weeks / CC: ~2 hrs)
- **Priority:** P3
- **Depends on:** 500+ active users, 3+ months of engagement data, Phase 2 learning loop operational.

### P1: Baseline Instrumentation for Manual Contact-Search Flow (2026-04-09)
- **What:** Add PostHog events to the existing manual PDL search + email generation flow so we can measure: (1) what % of searched contacts get emailed, (2) what % of generated emails get sent, (3) time-to-send distribution. Same events on the queue flow so we can compare apples-to-apples.
- **Why:** Week-2 retention is the locked queue success metric, but a manual-flow baseline is still needed to answer the core flywheel thesis question: "is the queue actually better than manual search?" Without a baseline, any queue metric is unanchored.
- **Pros:** Zero risk, pure observation. Required precondition for Phase 2 learning loop (can't tune what you can't measure). Answers the business question directly. Unblocks the existing "Queue Analytics Dashboard" P2 TODO.
- **Cons:** Takes ~1 hr to instrument both flows. Requires a dashboard to visualize. PostHog already integrated so no new dependency.
- **Context:** Surfaced during /plan-eng-review outside voice pass on 2026-04-09. The design doc's "40% approval rate" target was made up because no one knows what the manual baseline is. This fixes that. Ship in parallel with Phase 1 queue so both accumulate data from day 1.
- **Effort:** S (human: ~4 hrs / CC: ~25 min)
- **Priority:** P1 - ship in parallel with Phase 1 queue
- **Depends on:** Nothing. Can ship today.

### P1: Blocklist Management UI (2026-04-09)
- **What:** Settings surface showing the user's queue blocklist (companies + titles they dismissed) with the ability to remove entries. Lives at `/account-settings` or as a new `Queue preferences` page. New endpoint: `DELETE /api/queue/preferences/blocklist/:type/:value`.
- **Why:** Phase 1 writes to a blocklist on every dismissal, but users have zero visibility into what's in it. If a student changes their mind about Goldman Sachs 3 months later, they have no way to undo the block. Silent over-rejection bug waiting to happen.
- **Pros:** User control = trust. Cheap to build once the backend is in place. Prevents "why am I not seeing any Goldman contacts" support tickets. Companion to the exact-match semantics decision - together they give users real agency.
- **Cons:** Needs a UI, needs DELETE endpoint. Minor scope expansion beyond Phase 1.
- **Context:** Surfaced by outside voice during /plan-eng-review on 2026-04-09. Original blocklist decision used substring match (§2.4) and was revised to exact-match-on-normalized via outside voice challenge (§OV.2). Exact-match + no visibility is better than substring + no visibility, but exact-match + visibility is the real answer. Phase 1.5 = ship within 2 weeks of Phase 1.
- **Effort:** S (human: ~4 hrs / CC: ~25 min)
- **Priority:** P1 - Phase 1.5, ship within 2 weeks of Phase 1
- **Depends on:** Phase 1 queue preferences document shipped.

### P2: Job-Change Detection Nudges (2026-04-09)
- **What:** Scan `users/{uid}/contacts/` for saved contacts whose PDL pdlId matches but whose current job title/company differs from what's stored. Surface as a Nudges-tab entry: "Sarah just moved from Goldman Sachs Analyst to JPMorgan VP - want to congratulate her?"
- **Why:** Job changes are the highest-signal reason to re-engage a warm contact. The queue's dedup query would silently filter out a job-changed contact (email match wins, new pdlId lost), so this was carved out as a separate feature rather than bolted into queue dedup.
- **Pros:** Unique re-engagement surface, compounds with nudge infrastructure, genuinely novel insight for students. Piggybacks on existing nudge scanner daemon.
- **Cons:** Requires PDL re-enrichment of saved contacts (credit cost), Nudges tab UI changes, needs rate limiting so we don't spam students with 50 job changes at once.
- **Context:** Surfaced during /plan-eng-review outside voice pass on 2026-04-09 as a deep-dive on queue dedup blindspots. Queue stays focused on NEW contact discovery. Depends on pdlId backfill (P2 below) for full coverage of historical contacts.
- **Effort:** M (human: ~1 week / CC: ~1 hr)
- **Priority:** P2
- **Depends on:** PDL re-enrichment API, nudge scanner daemon (already shipped), contacts subcollection storing pdlId (§2.1), pdlId backfill migration (P2 below) for full coverage.

### P2: pdlId Backfill Migration for Existing Contacts (2026-04-09)
- **What:** One-time migration script that walks `users/{uid}/contacts/` across all users, for each contact without a `pdlId` field, re-queries PDL by email and writes the returned pdlId back to the doc. Runs once post-deploy, then a weekly cleanup job.
- **Why:** Section 2 Issue 1 of the queue eng review locked pdlId plumbing forward for new contacts, but historical contacts remain without pdlId. The §2.1 decision added email fallback to handle this, but fallback isn't a fix - it's a workaround. A real backfill closes the gap permanently and is a precondition for the Phase 2 job-change detection feature above.
- **Pros:** Clean dedup guarantees, eliminates a permanent dual-path, enables Phase 2 features that need pdlId on all contacts.
- **Cons:** Costs PDL credits (~1 credit/contact × total existing contact count). Migration needs careful batching to avoid hammering PDL. Some emails won't resolve (PDL doesn't have them) leaving gaps anyway.
- **Context:** Surfaced during /plan-eng-review Section 2 Issue 1 on 2026-04-09. Deferred from Phase 1 because email fallback handles the short term. Capture the reasoning because Phase 2 job-change detection and the queue learning loop both want pdlId everywhere.
- **Effort:** M (human: ~1 week / CC: ~30 min)
- **Priority:** P2
- **Depends on:** Credit budget approval (PDL credit cost scales with total saved contact count), Phase 1 queue shipped.

## Find the Humans (2026-04-09)

### P2: /hiring-manager-tracker Post-Ship Audit
- **What:** After Find the Humans ships on Job Board cards, audit whether the standalone `/hiring-manager-tracker` page is still being used, whether it overlaps with Find the Humans (which auto-saves to contacts), and whether to consolidate it into the tracker or delete it.
- **Why:** Find the Humans keeps `/find?tab=hiring-managers` as an escape hatch (Approach B locked during 2026-04-09 CEO review). But the separate `/hiring-manager-tracker` page is now a third surface that does similar work. Three places to find hiring managers is one too many - users will get confused and engineers will drift three codepaths apart.
- **Pros:** Simpler product surface, less code drift, clearer mental model.
- **Cons:** Deleting a page always has a long tail of bookmarks and tour references. Audit first, decide later.
- **Context:** Surfaced during /plan-ceo-review of the Find the Humans design doc on 2026-04-09. Scope was HOLD, so this was deferred. The audit should include: analytics on /hiring-manager-tracker page views, grep for internal links/router references, user-facing announcements mentioning it.
- **Effort:** S (human: ~2 hrs audit / CC: ~15 min. Consolidation work separate, depends on findings.)
- **Priority:** P2
- **Depends on:** Find the Humans shipped and soak-tested.

### P2: Dedup /find-recruiter and /find-hiring-manager Endpoints
- **What:** `/find-recruiter` and `/find-hiring-manager` in `backend/app/routes/job_board.py` are ~95% duplicate code (parser, credit logic, request flow). Their services (`find_recruiters()`, `find_hiring_manager()` in `recruiter_finder.py`) likely have similar duplication. Refactor into a single shared path parameterized by `role_type`.
- **Why:** Find the Humans is now the second user-facing feature riding `/find-recruiter`. The /find HM tab rides `/find-hiring-manager`. Two load-bearing consumers of duplicated code is the moment to dedupe - bugs will otherwise need to be fixed twice, and the two paths will drift.
- **Pros:** One codepath, one test surface, easier to add future improvements (receipts, warmth scoring, enrichment) to both flows.
- **Cons:** Refactoring a 1325-line service is risky without strong tests. `recruiter_finder.py` has limited test coverage today.
- **Context:** Discovered during /plan-ceo-review of Find the Humans on 2026-04-09 (Premise Failure #4). The duplication was known but acceptable until this plan made it load-bearing twice. Adding this TODO now captures the dedup pressure before a third caller appears.
- **Effort:** M (human: ~3 days / CC: ~1 hr, assuming test harness is built first)
- **Priority:** P2
- **Depends on:** Find the Humans shipped and soak-tested. Test coverage on `recruiter_finder.py` improved.

## Agent Mode (2026-05-04)

### P3: Align AgentSetupInline with Offerloop Design System
- **What:** Replace violet gradients, colored pill step indicators, and shadcn Card containers in `AgentSetupInline.tsx` with the Offerloop design language (serif italic headers, flat rows, ink-on-white, underline indicators).
- **Why:** The setup wizard looks like a different product from the agent dashboard (which correctly uses the Offerloop design system). Users see the disconnect when transitioning from setup to the running dashboard.
- **Pros:** Visual consistency across the agent experience, reinforces brand identity, removes AI-slop-looking violet gradient.
- **Cons:** Setup wizard is only seen once per user, so impact is limited. Low urgency.
- **Context:** Surfaced during /plan-design-review of agent running state on 2026-05-04. The AgentSnapshot dashboard follows the design system (serif headers, underline tabs, flat rows) but setup uses generic shadcn Card + violet gradient deploy button + colored step pills.
- **Effort:** S (human: ~3 hrs / CC: ~20 min)
- **Priority:** P3
- **Depends on:** Nothing.

### P2: Credit Refund on Save Failure (Find the Humans & existing recruiter flow)
- **What:** Wrap credit deduction + contact save in a transaction, or implement a compensating refund if `createContact` fails after credits are charged. Currently the user pays N credits even if the save silently fails.
- **Why:** This is a pre-existing risk in the recruiter flow (not introduced by Find the Humans), but Find the Humans makes it more visible because the button is on every job card and users will click it often. A single failure = a support ticket. At scale, a P2 becomes a P1.
- **Pros:** Trust preservation, fewer support tickets, cleaner reliability story.
- **Cons:** Firestore doesn't have multi-document transactions spanning credit doc + contacts subcollection in the way you'd want. Compensating-refund pattern is simpler but needs careful idempotency.
- **Context:** Surfaced during /plan-ceo-review of Find the Humans on 2026-04-09 Section 4 (Data Flow). The existing recruiter flow has this problem today - Find the Humans doesn't regress it, but the design review declined to fix it in this PR to stay HOLD SCOPE.
- **Effort:** M (human: ~2 days / CC: ~30 min)
- **Priority:** P2
- **Depends on:** None.
