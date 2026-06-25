# Coding Agent Session — Offerloop personalization moat

**Company:** Offerloop ([offerloop.ai](https://offerloop.ai)) — AI networking SaaS helping college students cold-email professionals at their target firms. **300 active users, 41 paying subscribers, 22% free-to-paid conversion, $0 CAC.**

**Session goal:** Audit our LinkedIn / web enrichment pipeline (PDL + Apify + Perplexity + Firecrawl + Bright Data), figure out which sources were actually pulling weight, and reshape them so personalized cold emails reference specific verifiable facts — not generic firm praise.

**Duration:** ~6 hours of paired work with the AI agent.

---

## What shipped

7 files modified across `backend/app/`:

- **`services/perplexity_client.py`** — Reframed per-person enrichment prompt to **exclude LinkedIn entirely** and return structured `media_appearances` / `published_writing` / `news_mentions`. Eliminates duplicate signal with Apify and reduces Perplexity token spend.
- **`services/apify_client.py`** (new) — Wired Apify HarvestAPI's `linkedin-profile-posts` actor as the working LinkedIn-post source after vendor research showed it costs **17–33× less than the incumbent Bright Data integration**.
- **`utils/personalization.py`** — Extended the strategy engine from **9 → 13 signal types** (`linkedin_recent_activity`, `linkedin_interest_overlap`, `company_recent_news`, `perplexity_web_mention`). Added a global `BANNED_OPENERS` constant that gets injected into every strategy's avoid list. Rewrote 9 strategy instructions to enforce self-intro-first openers.
- **`services/reply_generation.py`** — Restructured the email-gen prompt into **source-labeled sections** (`RECIPIENT (PDL)`, `LINKEDIN (Apify)`, `NON-LINKEDIN WEB PRESENCE (Perplexity)`, `COMPANY NEWS (Perplexity)`). Added cross-source dedup with a 60% token-overlap threshold so Perplexity items that duplicate Apify posts are dropped.
- **`services/extraction_schemas.py`** — Fixed a pre-existing production bug (`leadership: List[dict]` → `List[str]`) that was silently breaking Firecrawl schema validation in our firm-search code path. Surfaced during Apify migration testing.
- **`services/firecrawl_client.py`, `services/bright_data_client.py`** — Removed ~250 lines of dead code after Apify took over the LinkedIn path.
- **`routes/runs.py`, `services/agent_actions.py`** — Orchestration update + cost-telemetry log line per search: `[Enrich] uid=X contacts=N apify_posts=K perplexity_person_hits=N perplexity_company_unique=M`.

---

## Concrete before / after on actual email output

**Before** (canned alumni hook from existing instruction template):

> Fellow USC alum -- I noticed we both studied Computer Science in the same department! I saw your recent post about rebuilding the merchant onboarding flow to support agentic commerce. It's fascinating how the human-in-the-loop aspect presents such unique challenges...

**After** (rewritten instructions + live Apify post data + Perplexity company news):

> Hi Patrick,
>
> I'm Alex Park, a current USC student studying Computer Science and exploring product management in fintech. Stripe is on my shortlist because of your recent announcement about the improvements at Stripe Sessions, particularly your insights on the dramatic changes in economic activity and how Stripe is shaping the infrastructure for AI-driven commerce.
>
> As someone who has interned at Coinbase and is keen on product management, I would appreciate your perspective on how you envision the evolution of fintech in this rapidly changing landscape. Would you be open to a 15-minute chat?
>
> Best, Alex

Every concrete claim in that email maps to a labeled source we provided to the LLM. The Stripe Sessions reference came from a live Apify scrape of Patrick Collison's actual LinkedIn activity during this session. The fintech / product-management framing came from the user's resume + onboarding profile.

---

## The founder loop this session ran

1. **Discovery.** Started by asking *"do we have Perplexity and Firecrawl enriching emails — how is that happening?"* Surfaced that we already had a sophisticated 9-signal commonality engine but were leaving the most credible personalization signal (recent LinkedIn posts) on the floor.

2. **Diagnosis under load.** Two production blockers found mid-build:
   - **Firecrawl deprecated LinkedIn scraping** entirely (`WebsiteNotSupportedError` on every `linkedin.com/*` URL)
   - **Bright Data account returned** `Customer is not active`
   Both were gracefully no-oping in production today, so a feature we thought we had wasn't actually firing for users.

3. **Vendor pivot with cost discipline.** Pushed back on the AI's "$1/profile" cost estimate for Bright Data — *"a dollar per profile that cant be right."* That pushback triggered actual web research: Proxycurl shut down July 2025 after a LinkedIn lawsuit; Apify HarvestAPI costs **$1.50 per 1,000 posts**. Switched primary LinkedIn source to Apify.

4. **Live verification before committing.** Real Apify call against public LinkedIn profiles returned 5 actual posts from Patrick Collison and 4 from Reid Hoffman. End-to-end test confirmed the post text reached the LLM prompt and influenced the generated email.

5. **Architectural cleanup.** Reframed Perplexity per-person prompt to deliberately exclude LinkedIn (Apify owns that layer). Added `perplexity_web_mention` signal so podcasts / conference talks / articles can lead emails when LinkedIn is thin. Added cross-source dedup. Source-labeled prompt sections so the LLM cites correctly instead of hallucinating "I saw your LinkedIn post" about a podcast finding.

6. **Output quality iteration.** Caught the LLM falling back to canned *"Fellow USC alum --"* phrasing. Tightened the `BANNED_OPENERS` rules from "never *open* with" to "never *write* anywhere." Re-ran the sample three times until the email read like a real student.

7. **Dead-code cleanup.** Removed Bright Data + Firecrawl LinkedIn integrations from the email pipeline after Apify proved out. Kept them in the onboarding self-enrichment chain where they serve a different purpose.

---

## Moments that show founder judgment more than code

- **Cost pushback** — "a dollar per profile that cant be right" forced a real check that surfaced a 17–33× pricing delta. The AI was wrong; the founder caught it.

- **Demand for honest vendor research** — *"can you do research, deep research whether brightdata is the best for our purpose"* with explicit demand for honest assessment, not validation. Output: 14 cited sources, structured comparison across pricing / coverage / legal risk / reliability, clear recommendation. Including the legal context (Proxycurl shutdown, LinkedIn vs hiQ injunction).

- **Asking "what do you think"** on whether to keep Bright Data as a fallback. Got a decisive opinion (rip it out — same target as Apify, real redundancy is PDL summary fallback, not another LinkedIn scraper). Then *"lets so it"* → executed.

- **Pushback on canned email** — *"why does it start like that it doesnt sound professional"* — forced two rounds of refinement on the `BANNED_OPENERS` and instruction templates until the output stopped reading like a templated cold-outreach line.

---

## Mistakes that became signal

This is the part most coding-agent submissions hide. I'll include it explicitly because the *correction loop* is the signal.

- **AI claimed $1/profile for Bright Data** from vague training-data memory. Wrong by ~100×. Founder caught it, forced a real check.
- **First `BANNED_OPENERS` rule** said "never *open* with 'Fellow X alum'" — LLM complied with the letter and slipped the phrase into sentence 2. Caught on the next iteration, rule tightened to ban anywhere in the email.
- **Initial Firecrawl integration** assumed LinkedIn was still supported. Live call returned `WebsiteNotSupportedError`. Triggered the Apify pivot.

Each of these is in the session transcript. They're not "failures" — they're an AI being audited by a founder running real tests rather than rubber-stamping output.

---

## Why this matters for the company

Offerloop's competitive moat is **personalized cold outreach for college students** against generic AI tools and templated mass mailers. Before this session, our personalization was rules-engine-strong but data-thin. After this session, every outbound email opens with:

- A specific, verifiable, recent fact about the recipient
- Sourced (we know which signal — alumni vs LinkedIn post vs podcast vs company news — produced the hook)
- Measured (cost telemetry per search)
- Defensible (signal engine picks the right hook from 13 types, banned-phrase rules prevent regression to templated voice)

The thesis is testable: emails with specific verifiable hooks should produce measurably higher reply rates than the templated version any competitor can ship in a weekend.

---

## How to verify

The session output is in production-ready code. To verify when PDL is back up tomorrow:

1. Trigger a real contact search via the UI
2. Backend logs should show `[Enrich] uid=X contacts=N apify_posts=K perplexity_person_hits=N perplexity_company_unique=M`
3. Open one resulting contact in Firestore — confirm `linkedinRecentPosts`, `perplexityMediaAppearances`, etc. populated
4. Open the Gmail draft — confirm `Hi <FirstName>,` opener with specific post / podcast reference, no "fellow X alum"

Full handoff/verification doc kept in our planning notes.
