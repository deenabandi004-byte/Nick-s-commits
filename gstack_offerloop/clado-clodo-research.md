# Research: Clado / Clodo (YC X25) — Parallel Agent Architecture

Date: 2026-04-09
Purpose: Understand how Clado/Clodo deploys agentic agents for outbound, and what Offerloop should learn from them.

## Who they are

Clado and Clodo are the same team. Clado was the original product (deep research for people, sunsetting). Clodo is the rebrand actively shipping. YC X25 batch. Raised $2M seed from Valor Equity Partners. Founders: Tom Zheng (UCSD) and Eric Mao (UPenn M&T).

Closest comparison to Offerloop in the market. They're building B2B sales outreach the way Offerloop wants to build student outreach.

## Core technical insight: massively parallel agents

Instead of one large LLM call deciding over many profiles, they spawn 100,000+ small agents in parallel. Each agent reads ONE profile and makes ONE judgment: "does this person match the user's prompt?" The agent reads, reasons, ranks, returns. The swarm answers the query.

This is fundamentally different from:
- **Vector search** — finds "similar" profiles via embedding distance
- **Filter search** — finds profiles matching exact field criteria
- **Single LLM call** — one model with a giant context window trying to rank everything

Clado's approach: each agent reads a profile and decides if it matches a natural language description. Profiles that no filter combination could capture (e.g., "compliance officers at Series A fintechs nearing SEC requirements") get correctly identified because an agent reading the actual profile content can reason about it.

## User journey

1. User types a natural language ICP description. No filter dropdowns. No keyword fields. Just describe who you want.
2. System spawns the agent swarm against 800M+ profiles + 50+ data sources (SEC filings, Crunchbase, LinkedIn, etc.)
3. Returns ranked, enriched results in under 5 minutes
4. Each result includes **signals** — not just contact info, but context: recent job change, funding round, hiring sprees, tech stack
5. User picks who to reach out to
6. System drafts personalized emails referencing the actual signals
7. Multi-step sequences scheduled and sent
8. Tagline: "Prompt to emails sent without touching a template or a spreadsheet"

Positioning: "AI slop doesn't convert. Your voice does." Positioned against generic AI cold email tools by being radically more personalized.

## Distribution surfaces

- **Web app** (Atlas / Clodo dashboard) — primary interface
- **Chrome extension** (Clodo Copilot for LinkedIn) — works inside LinkedIn
- **API** — for engineering teams to integrate

## Lessons for Offerloop

### 1. Parallel agents, not one big LLM call

When building the Phase 3 autopilot architecture, don't build "one cron job that loops through users sequentially." Build a system that spawns many small agents in parallel. Each agent does one tiny task:
- Job-matcher agent: does this job match this student?
- Contact-finder agent: who works at this company?
- Email-drafter agent: write a personalized email for this pair
- Signal-detector agent: any recent news about this person/company?

Agents run independently and write back to shared state. This scales infinitely and parallelizes naturally.

For Offerloop's scale (students, not enterprise sales), maybe 50 agents per student per day. But the architecture is the same.

### 2. Natural language as the entry point

Clado proves users want to type what they want. Filters force users to think like the database. Natural language lets them think like a human.

For students, the prompt could be: "alumni from my school working in TMT investment banking at bulge brackets, who joined in the last 2 years."

Offerloop's existing Scout AI feature is already this intuition. The opportunity is to make it the front door instead of a side feature.

### 3. Signals, not just contacts

Clado doesn't return "here's a person." It returns "here's a person AND why they matter right now." The signal IS the personalization hook.

For students, equivalent signals:
- Alumni who just joined a target firm
- Alumni who recently posted about hiring
- Alumni at firms with new offices opening
- Alumni at firms that just hired from your school
- Alumni who recently changed roles

This is the answer to the "resume database isn't a moat" critique. The moat isn't the resume database alone — it's the **signal layer** built on top. Nobody is doing this for the student market.

## What Offerloop has that Clado doesn't

- A specific user (students, not generic salespeople)
- A specific use case (career outreach, not B2B sales)
- A constrained dataset (target firms students care about, not all 800M profiles)
- A trust angle (alumni connections, school affiliations) that B2B sales can't use

Offerloop's wedge is sharper than Clado's. They're trying to be "search for everyone." Offerloop is trying to be "the system for students breaking into specific industries." Narrower = better.

## Architectural recommendation for Phase 3

Don't build a sequential cron job and then refactor. Start with the parallel agent model:

1. **Scheduler** triggers the daily run for each user (cron job, runs at 5am user-local time)
2. **Agent dispatcher** spawns N agents per user:
   - 1 ICP-resolver agent (reads student profile, generates target queries)
   - 5-10 job-matcher agents (one per target firm/industry, runs in parallel)
   - 10-20 contact-finder agents (one per matched job)
   - 10-20 signal-detector agents (one per contact)
   - 10-20 email-drafter agents (one per contact, runs after signal detection)
3. **Each agent** calls one of the existing API services and writes results to Firestore
4. **Coordinator agent** assembles the final queue once all sub-agents complete
5. **Edge cases** (failed agents, retries, partial results) handled per-agent, not for the whole batch

### Infrastructure options

For the task queue, three viable choices:
- **Celery + Redis** — Battle-tested, lots of docs, requires running Redis
- **Google Cloud Tasks** — Managed, plays nicely with Firestore, no servers to run
- **Firestore-based job tracker** — Simplest, no new infra, slower but works for low scale

Recommendation: Start with the Firestore-based tracker. Migrate to Cloud Tasks if you hit performance limits. Avoid Celery unless you need its specific features.

## Sources

- [Clado YC profile](https://www.ycombinator.com/companies/clado)
- [Clado launch announcement](https://www.ycombinator.com/launches/NbA-clado-deep-research-for-people)
- [Clodo product page](https://clodo.ai/)
- [Clodo company / positioning](https://clodo.ai/company)
- [Clodo LinkedIn copilot](https://clodo.ai/linkedin)
- [Clodo Chrome extension](https://chromewebstore.google.com/detail/clodo-copilot-ai-for-outb/ahcikciiiaefbgeocfegjegmhejollme)
- [BetaKit profile of the Clado team](https://betakit.com/team-of-toronto-talent-unites-after-y-combinator-to-build-clado/)
