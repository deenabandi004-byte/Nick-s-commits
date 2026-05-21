# Offerloop Positioning & Messaging - Working Doc

**Status as of 2026-05-17.** Hero is locked. Positioning spine and messaging system are locked. Pricing recommendations are captured separately in [`docs/pricing-recommendations.md`](./pricing-recommendations.md). Next phase is the surface-by-surface rewrite plan (Phase 5).

This doc is the durable pickup point for resuming the work in another session or terminal. Read top to bottom before continuing.

---

## How we got here

A multi-phase positioning exercise. Phases 1 to 4 are complete. Phase 5 is the next move.

| Phase | Status | Output |
|---|---|---|
| 1. Diagnosis | Complete | What's wrong with current positioning, competitive sweep |
| 2. Strategic territories | Complete (rejected by user) | Five territory options; user pushed past category-creation toward dry/descriptive |
| 3. Positioning spine | Complete | Spiky statement, enemy, POV, proof points, Hormozi call, kill criteria |
| 4. Messaging system | Complete | Hero (locked), pillars, CTAs, ban list, tone guardrails, before/after rewrites |
| 5. Surface-by-surface rewrite plan | **IN PROGRESS** | Plan written. Executing waves in this session, starting with Wave 1. |
| 6. Skills to scope | Pending | Recommend which positioning/messaging skills to codify |

---

## Core constraints (do not violate)

These were set at the start of the work and remain non-negotiable:

1. **De-emphasize AI almost entirely.** No "AI-powered," no "AI assistant," no "intelligent," no "smart" as code for AI. The product just does the thing. AI can appear in FAQ if necessary, never in hero, value props, or CTAs.
2. **Persona is broad-ambitious students who don't already have the connections.** State schools, non-targets, semi-targets, internationals, transfers, first-gen. Not Harvard or Wharton kids with family in IB.
3. **University contracts and B2B are out of scope.** Website speaks to the student end user. B2B lives separately.
4. **Tone: confident, helpful, human, warm, no-BS, clean.** Smart older friend voice. Not pushy, hustle-cult, desperate, salesy, gimmicky, bro-y, corporate, or gen-z tryhard.
5. **No "students" in the homepage headline.** The audience is broader than the marketing surface. The student-targeting happens in distribution channels and on the `/for-students` sub-page.
6. **No em dashes anywhere.** Commas, colons, parentheses, periods only.
7. **Job-search urgency stays in marketing campaigns and SEO landers, not in the homepage frame.**

---

## Locked: hero

> **H1:** `Find anyone. Reach anyone. Track every conversation.`
>
> **Sub:** `Tell us who you want to meet. We find them, draft the message, and manage every reply, follow-up, and meeting prep.`

This was iterated through six rounds with the user. Do not re-litigate. If a future session questions it, the user has already pushed past category-creation, identity-led, outcome-coded, and time-savings framings. They landed on the Granola-flat register: descriptive, not aspirational. The H1 verbs map to the product loop (find → reach → track). The sub names mechanisms (find, draft, manage replies / follow-ups / meeting prep).

**The existing `HeroSearchCTA.tsx` component is structurally locked.** Keep the interactive prompt-as-CTA (left column: typewriter placeholder + real input that stashes the query to localStorage and bounces to `/signin?mode=signup`), keep the animated Gmail mockup (right column, four-phase cycle). Only three copy swaps:
1. Eyebrow (`Made for students chasing their first offer`) - kill, or replace with `Built and used at USC, UCLA, Michigan, NYU, Georgetown.`
2. H1 - swap to the locked H1 above. Note: the new H1 is three short phrases, not two; the existing component uses `whiteSpace: nowrap` on a two-line H1, so the line-break structure needs to be rewritten.
3. Sub - swap to the locked sub above.

The submit button label can stay `Search`. The rotating prompt placeholders can stay (USC alumni at Goldman Sachs, etc.) - they're specific, which sells the product.

---

## Locked: positioning spine (Phase 3)

### Spiky statement (internal only, never goes on the page)

> For ambitious students who don't have the connections to break into competitive industries, **Offerloop** is the workflow that finds the right people, drafts the message, and manages every conversation that follows. Unlike LinkedIn (which has the data and won't give you the emails), Apollo (built for sales teams at $49+/mo), or coaching packages (passive PDFs at $500+ once), Offerloop replaces the manual grind of networking with one continuous product at student pricing.

### Category claim (descriptive, not coined)

> Offerloop is a personal outreach workflow. Discovery, sending, and follow-through, in one place.

We are not declaring a new category. The H1 does the categorizing work. If pressed in a deck or by a journalist: "outreach workflow tool" or "personal networking workflow."

### Named enemy

The enemy is **the manual grind** as an activity, not as a brand:

> Searching LinkedIn for the right person, guessing their email, writing the message from scratch, sending it, forgetting about it, and tracking everything in a spreadsheet that hasn't been updated since October.

This phrasing is descended from the existing About page line: `searching for professionals on LinkedIn, guessing email addresses, writing personalized outreach messages one by one, and tracking everything in messy spreadsheets`. Elevate it from the About page to the homepage value-prop section.

Secondary enemy, used only on `/compare/*` pages: **LinkedIn has the data and won't give you the emails.**

### One-line POV (brand line)

> You shouldn't need connections to start a conversation.

Eight words. Doesn't say `students`, `non-target`, or `outreach`. The persona reads it and feels seen. Competitors can't echo it without contradicting their own business model. Goes somewhere persistent: above the proof beats, in the footer brand line, or as the About hero.

### Unique value (the one thing only Offerloop does)

> Find, reach, and follow through, in one continuous product, at the price of two coffees a month.

The continuity is the moat. Apollo finds. LinkedIn messages. Gmail drafts. Salesforce tracks. Coaching tells you what to say. Nobody does all of them in one product at student pricing.

### Hormozi diagnosis (which lever to attack)

For the non-target ambitious student persona:
- **Dream outcome**: clear, aspirational, already wanted. Don't sell it harder.
- **Perceived likelihood**: LOW. They don't believe it'll work for someone like them. **This is the weakest lever.**
- **Time delay**: external. Can't compress recruiting cycles.
- **Effort / sacrifice**: HIGH and directly addressable, but it's the second-priority lever.

**Decision**: attack perceived likelihood in the section directly below the hero (testimonials and persona-coded proof). Move the time-savings math (`84 minutes back per contact`) further down the page. The cold visitor doesn't sign up because they don't believe it'll work for them, not because they think it's slow.

User signed off on this in conversation: "I think with the reviews right below it could be solid."

### Trend / urgency (use sparingly)

> LinkedIn cold-DM reply rates have collapsed because everyone is doing it badly. AI-generated noise is making *specific, well-researched* outreach more valuable, not less. The bar for "good" is rising while recruiting timelines compress (IB recruits 18 months early for 2027 summer analyst seats).

Use this on `/for-students` and in blog posts. Mention sparingly on homepage.

### AI-era anchor (per the positioning skill)

Not anchoring to AI. Anchoring to:
- **Workflow** (the find → reach → track loop)
- **Audience** (well-defined non-target ambitious student persona)
- **Distribution** (founder-led USC community, Chrome extension acquisition surface, 1,494 SEO landers)
- **Taste** (the dry/flat register)

### Proof points mapped to the three verbs

**Find anyone:**
- 2.2 billion contact database via People Data Labs
- Warmth scoring with explicit signals: `+20 same university`, `+10 same major`, `+8 same hometown`, `+15 same past employer`
- School affinity service (the "12 UCLA alumni at McKinsey" sentence is real and deterministic, runs off `school_affinity.py`)
- Chrome extension on LinkedIn

**Reach anyone:**
- Drafts written into the user's actual Gmail, not a separate inbox
- Personalized per contact with warmth signals folded in
- Hunter.io email verification on Pro/Elite
- Chrome extension Job mode (recruiters and cover letters from any job posting on 8 job boards)

**Track every conversation:**
- Reply detection via Gmail Pub/Sub (real-time, not polling)
- Tracker with automatic stage advancement (`new → email_sent → waiting_on_reply → replied → meeting_scheduled`)
- Reply Coach drafts the response when someone replies
- Meeting Prep auto-generates a research PDF on reply
- Nudges fire on stale follow-ups
- Cooldown enforcement (two users can't hit the same person within 30 days)

**Founder credibility (use on /for-students and About, not homepage hero):**
- Three USC undergrads who use the product daily
- Built 2025, 300+ active users (use this number, NOT the 2,400+ on the current homepage)
- 22% free-to-paid conversion, $0 CAC

### Kill criteria for the positioning

If, after 4 to 6 weeks of the new copy shipped:

1. Cold-visitor → free-signup conversion does not lift, OR free-signup → first-contact-search activation drops.
2. Less than 30% of new free signups can correctly describe what Offerloop does in one sentence (test via onboarding survey: "in your own words, what does Offerloop do?"). If answers cluster on `AI email tool`, `LinkedIn but with emails`, or `tool for finding jobs`, the three-verb claim didn't transfer.

If both hit, the problem is bigger than copy and we revisit category claim and persona simultaneously.

---

## Locked: messaging system (Phase 4)

### Value-prop pillars (3, one per verb)

Three pillars matching the H1, not four random features. Each is a section header + a one-sentence framing. Copy is wordsmithed when implementing.

**Pillar 1 - Find anyone**
- Header: `Search anyone, sorted by who's most likely to reply.`
- Framing: Type a role, a company, a school, or the kind of person you want to meet. We surface people who share your school, your major, your hometown, or your career path. The ones who actually have a reason to write back.

**Pillar 2 - Reach anyone**
- Header: `Personalized emails, drafted into your Gmail.`
- Framing: We write the message using what's actually true about you and them. The draft lands in your real Gmail. Send it, edit it, replace it. Your account, your voice.

**Pillar 3 - Track every conversation**
- Header: `The moment someone replies, we take it from there.`
- Framing: When a reply lands, the tracker updates, a follow-up draft appears, and prep for the meeting is ready before you need it.

Meeting Prep folds under Pillar 3 (mechanism evidence under Track). Give it a dedicated beat below the pillars, between the three-pillar section and the time-savings comparison. Don't promote it to a fourth pillar.

### CTA language

**Primary CTA (above the fold)**: `Try a search`
- Verb-coded, low-commitment, product-anchored.
- Alternative if more outcome-coded: `Find your first contact`
- Alternative if generic-safe: `Get started`

**Secondary CTA**: `See how it works` (anchored to scroll target or short video)

**CTA microtext (under button)**: `Free. No credit card. 5 contacts in your first search.`
- Pre-empts credit-card-trap anxiety.
- Makes the Free tier limit a feature, not a hidden ceiling.
- **Dependency**: Free tier currently delivers 3 contacts per search in `backend/app/config.py` and `connect-grow-hire/src/lib/constants.ts`. Microtext lies until the backend lifts the limit to 5. User is handling this in the pricing-terminal work; landing page copy ships only after the limit change lands.

**Do not use**: `Try Offerloop free`, `Start your journey`, `Land your first offer`, `Join 300+ students`.

### Words we use

- **Verbs**: find, reach, message, track, draft, manage, surface, handle, prep
- **Nouns**: conversation, reply, follow-up, meeting prep, contact, message, Gmail, school, alumni, major, hometown
- **Phrases**: `in your Gmail`, `the right person`, `the moment they reply`, `we handle the rest`, `your account, your voice`, `the manual grind`
- **POV**: `You shouldn't need connections to start a conversation.`

### Words we ban

- **AI clichés**: AI-powered, AI-driven, AI assistant, AI-generated, intelligent, smart, supercharged, robots, agents (as noun form of AI), automated, automation, machine learning, ML-powered, deep learning, neural
- **SaaS-template**: cutting-edge, innovative, revolutionary, game-changing, powerful, compelling, seamless, sophisticated, enterprise-grade, leverage, optimize, supercharge, unleash
- **Hustle / job-search coding** (kill from homepage and hero, OK on SEO landers): chasing, land your offer, breaking into, dream company, dream offer, secure the bag, recruiting made simple, get hired
- **Vague trust claims**: trusted by, top universities, country's best, world-class, leading, premier
- **Specific phrases on the current site to retire today**:
  - `Made for students chasing their first offer`
  - `We do the outreach / You land the offer`
  - `Be the next to land your offer.`
  - `Recruiting Made Simple` (OG title)
  - `AI-powered meeting prep, interview prep, and contact management` (OG description)
  - `Trusted by students at the country's top universities`
  - `Everything You Need to Network Smarter`
  - Any em dash anywhere (the time-savings punchline uses one verbatim)

### Tone guardrails (we sound like this, not that)

| Yes | No |
|---|---|
| We watch the inbox so you don't have to. | AI-powered reply tracking keeps you in the loop. |
| The draft lands in your real Gmail. | Seamless Gmail integration. |
| Type the kind of person you want to meet. | Leverage natural language search to find your ideal contacts. |
| You shouldn't need connections to start a conversation. | Your network is your net worth. |
| When a reply lands, the tracker updates. | Our intelligent system processes inbound responses. |
| 300+ students at USC, UCLA, Michigan, NYU, Georgetown, UPenn. | Trusted by students at the country's top universities. |
| Free. No credit card. Three contacts in your first search. | Start your journey today, free. |
| We built it because we needed it. | A product crafted with passion by founders who care. |
| Your account, your voice. | Personalized AI outreach at scale. |

### Before / after rewrites of the worst current copy

Quoting existing copy verbatim from the snapshot.

**1. Hero eyebrow**
- Before: `Made for students chasing their first offer`
- After: Kill it. Or replace with: `Built and used at USC, UCLA, Michigan, NYU, Georgetown.`

**2. OG title**
- Before: `Offerloop - Recruiting Made Simple`
- After: `Offerloop: Find anyone. Reach anyone. Track every conversation.`

**3. OG description**
- Before: `Professional networking platform for USC students - AI-powered meeting prep, interview prep, and contact management`
- After: `Find the people you want to talk to. We draft the message, manage every reply, and prep you for the meeting.`

**4. Testimonial wall** *(split between landing page and `/for-students` - see "Landing page vs /for-students" section below)*
- Before H2: `Be the next to land your offer.`
- Before sub: `Real students. Real outreach. Real offers.`
- **Landing page** (broad, no student-coding):
  - H2: `Real conversations. Real meetings. Real results.`
  - Sub (recommended, not user-confirmed): `In their words.`
- **`/for-students`** (persona-coded, identity-led):
  - H2: `People who didn't have the connections. Until they did.`
  - Sub: `Real conversations. Real meetings. Real offers.`

**5. Feature grid H2**
- Before: `Everything You Need to Network Smarter`
- After: `Three things, one product.`

**6. Time savings punchline**
- Before: `That's 84 minutes back - per contact you reach out to.`
- After: `That's 84 minutes back, per person you reach.` (also: move the whole section below the pillars)

**7. Trust band**
- Before: `Trusted by students at the country's top universities`
- After: `Used across 30 campuses and growing.` (user updated 2026-05-17; kill the 2,400+ number from the stats band entirely; keep the multi-logo row - broader line now supports more logos)

**8. About page lead**
- Before: `Offerloop is a networking and outreach platform - not an email provider. Founded in 2025 at the University of Southern California by three students who were frustrated with the manual grind of networking for internships, we built the tool we wished we had.`
- After: `Offerloop finds the people you want to talk to, drafts the message into your Gmail, and manages every reply, follow-up, and meeting prep. Three of us built it at USC in 2025 because we were doing the work ourselves, every weekend, for an entire recruiting cycle.`

---

## Landing page vs `/for-students` - the split rule

**Locked as of 2026-05-17.** The two pages serve different jobs and use different registers. Past sessions have drifted student-coded language onto the landing page; that's a regression, not a tone choice.

**Landing page (`/`)** - broad, plain, product-first.
- Audience: anyone running cold outreach. Today that's mostly students, but the page reads cleanly for early-career switchers, recent grads, or anyone else who would benefit from the workflow.
- No `students` in headlines, CTAs, value props, or hero. (Trust band can name campuses because that's factual social proof, not persona-coding.)
- No target-school anxiety, no recruitment-cycle narrative, no founder origin, no identity claim.
- Voice: Granola-flat. Dry, descriptive, plain.
- This page does NOT need rewriting when the audience widens; that's the point of building it broad now.

**`/for-students`** - persona-coded, identity-led, urgency-aware.
- Audience: ambitious students at non-target and semi-target schools.
- Carries everything the landing page can't: target-school objection, recruitment-cycle calendar (IB 18 months early, MBB cycle, tech new grad), founder origin story in full, identity claim, urgency.
- Voice: warmer, more emotional, more urgent. Can use the POV line in full prominence.
- Designed in a separate session (per user, 2026-05-17). Spec below is preserved for that session.

**Migrations from the locked Phase 4 work to `/for-students`** (not the landing page):
- Testimonial H2 `People who didn't have the connections. Until they did.`
- Testimonial sub `Real conversations. Real meetings. Real offers.`
- FAQ Q3: `What if I'm not at a target school?`
- Founder origin story in full
- The POV line `You shouldn't need connections to start a conversation.` *(stays available as the brand-line footer line on landing too; lives in full prominence on `/for-students`.)*

---

## New: /for-students sub-page plan

A dedicated deep persona page. **Not a flavored homepage.** It does what the homepage can't: tells the recruitment narrative, addresses persona-specific objections, carries the founder origin story in full.

### URL

`/for-students` (chosen over `/students`, `/recruiting`, `/how-it-works/recruiting`). Direct, honest, matches existing audience targeting in About page and traction tiles.

### Purpose

- Anchor the 1,494 existing SEO landers (`/networking/*`, `/cold-email/*`, `/alumni/*`, `/networking-for/*`) under one parent page.
- Address the high-intent persona's specific objections in one place.
- Surface job-search urgency that the homepage can't carry without breaking its register.

### Required sections

1. **Hero**: persona-specific entry. Something like `For the kids who didn't have the alum at every firm.` Subhead names the recruitment-cycle pain. Different voice than the homepage hero. Identity-coded.
2. **The recruitment-cycle narrative**: when IB opens (18 months early for summer analyst), when MBB recruits, when tech opens for new grad, when PE off-cycles run. Map the calendar.
3. **Industry workflows**: how Find → Reach → Track maps to meeting → first-round → super day for IB; informational interview → recruiter screen → onsite for tech; case prep → behavioral → partner round for consulting.
4. **The "I'm not at a target school" objection**: addressed head-on. This is where the equalizer-coded copy lives. The POV line (`You shouldn't need connections to start a conversation.`) belongs here in full prominence.
5. **Founder origin story in full**: "Three USC kids. Non-target for IB. We sent X cold emails between us our junior year. We built Offerloop because we were doing the work anyway."
6. **Persona-specific proof**: testimonials with full company names and offers landed. Dylan Roby / Evercore, Jackson Leck / Blackstone, David Ji / FedEx, Sarah Ucuzoglu / PwC. The homepage stays broad; this page goes specific.
7. **Comparison vs coaching incumbents**: Mergers & Inquisitions PDFs, Leland coaching $300-3,000. The homepage attacks "the manual grind." This page attacks "the $500 PDF."
8. **CTA**: lower-friction than the homepage. `Start your first search` or `Try one search free`.

### What this page is NOT

- Not a homepage clone with `students` swapped in.
- Not a place to repeat the three pillars verbatim.
- Not where the dry Granola register lives. This page can be warmer, more emotional, more urgency-coded.

### Navigation placement

Add to top nav: `For Students` (or leave in footer until it earns promotion). Link the existing `/networking/*`, `/cold-email/*`, `/alumni/*` landers to `/for-students` as their parent.

---

## Pricing (separate doc)

Pricing recommendations are in [`docs/pricing-recommendations.md`](./pricing-recommendations.md). Highlights:

- Keep $14.99 Pro and $34.99 Elite monthly.
- Add annual at 17% off: $149/yr Pro, $349/yr Elite.
- Shorten free trial from 30 days to 7 days, no credit card.
- Ungate the `/pricing` page.
- Fix Free tier credits drift (frontend 150 → 300).
- No promo discounts.
- Build the Elite value stack (Agent, unlimited prep, priority support, early access, founder kickoff call).

The pricing changes affect Phase 5 surfaces:
- `/pricing` page rewrite (ungate, add annual toggle, Elite value stack)
- CTA microtext sitewide (references 7-day trial, no credit card)
- `/compare/*` pages (update pricing rows to show annual)

---

## Phase 5: Surface-by-surface rewrite plan

### Surface inventory (grounded in the actual codebase)

| # | Surface | File(s) | Current problem | Effort |
|---|---|---|---|---|
| 1 | OG meta (global) | `index.html` | `Recruiting Made Simple` + `AI-powered` framing | XS |
| 2 | OG meta (page-level Helmet) | `Index.tsx:162-163`, `AboutUs.tsx:73-74` | `AI Networking for College Students` framing | XS |
| 3 | About | `AboutUs.tsx` (358 lines) | Defensive `not an email provider` opener; founder paragraph reads as a hedge | S |
| 4 | Chrome extension manifest | `chrome-extension/manifest.json` | `LinkedIn networking assistant` (misses Job mode + recruiter discovery + cover letters across 8 job boards) | XS |
| 5 | `/pricing` | `Pricing.tsx` (813 lines), `App.tsx:288` is protected | Behind auth, monthly-only, 30-day trial copy, Free credits drift | M |
| 6 | Homepage below-hero | `Index.tsx` (1094 lines) | `Made for students chasing their first offer`, 2,400+ stat, em dashes, banned words throughout | M |
| 7 | `/for-students` | NEW file + NEW route | Doesn't exist | L |
| 8 | `/compare/*` | `CompareLinkedIn.tsx`, `CompareApollo.tsx`, `CompareHandshake.tsx`, `CompareChatGPT.tsx` (~200 lines each) | Strong already; needs em-dash purge + annual prices + ban-list sweep | S total |
| 9 | Chrome Web Store listing | Out of repo (Chrome Developer Dashboard) | Mirrors manifest | XS (flag to user) |
| 10 | In-product feature page copy | `FindPage.tsx`, `FirmSearchPage.tsx`, `RecruiterSpreadsheetPage.tsx`, `JobBoardPage.tsx`, `MeetingPrepPage.tsx` | App pages, not marketing pages. Lower priority (post-signup audience). | M each |

Effort key: XS (<1h), S (1-3h), M (3-8h), L (8-16h).

### Sequenced rollout

#### Wave 1 - cheap leverage (XS/S total)

1. **OG meta tags** (3 locations). Apply Phase 4 before/after verbatim:
   - `index.html` global tags
   - `Index.tsx:162-163` Helmet override
   - `AboutUs.tsx:73-74` Helmet override
2. **About page**. Apply Phase 4 lead-paragraph rewrite. Keep the team section and the 300+ users / 6+ universities framing. Kill any `AI-powered`, `intelligent`, em dash. Ship this BEFORE `/for-students` so the rewritten founder paragraph can be reused.
3. **Chrome extension manifest description**. Reflect Job mode + recruiter discovery + cover letters across job boards, not LinkedIn-only.
   - Flag to user: Chrome Web Store listing in the Developer Dashboard needs the same update. Out of repo, manual.

#### Wave 2 - revenue impact (M)

4. **`/pricing` page**. Order of operations matters:
   - Backend first: shorten free trial from 30 days to 7 days (see `docs/pricing-recommendations.md`). Land this before the copy that promises it.
   - `App.tsx:288`: remove the protected-route wrapper from `/pricing`. Page is now public.
   - `Pricing.tsx`: add monthly/annual toggle. Pro: $14.99/mo or $149/yr. Elite: $34.99/mo or $349/yr.
   - Build Elite value stack section per pricing doc (Agent, unlimited prep, priority support, early access, founder kickoff call).
   - Fix Free tier credits display: `connect-grow-hire/src/lib/constants.ts` shows 150; backend `config.py` is source of truth at 300. Update the frontend constant.
   - CTA microtext sitewide: `Free. No credit card. Three contacts in your first search.`
5. **Homepage below-hero** rewrite. Apply Phase 4 before/after across the page. Section order, top to bottom:
   1. Hero (locked, do not touch)
   2. Testimonial wall, with new H2: `People who didn't have the connections. Until they did.` (Hormozi: attack perceived likelihood directly under the hero.)
   3. Three pillars, one section each, using Phase 4 messaging-system headers.
   4. Meeting Prep dedicated beat (under Track, not a fourth pillar).
   5. Time-savings math, rewritten without em dash, moved down from the current high position.
   6. Trust band: `Used by 300+ students at USC, UCLA, Michigan, NYU, Georgetown, and UPenn.` Kill the 2,400+ stat anywhere it appears in the file.
   7. FAQ / footer CTA.
   - Sweeps before commit: zero em dashes; zero banned words from the Phase 4 ban list; zero references to `chasing`, `dream offer`, `AI-powered`, `intelligent`, `seamless`.

#### Wave 3 - organic anchor (L)

6. **`/for-students` new page**. Implements the 8-section plan from Phase 4.
   - New file: `connect-grow-hire/src/pages/ForStudents.tsx`.
   - New public route in `App.tsx` near `/about` and `/pricing`.
   - Reuse the rewritten founder paragraph from About (extract to a shared constant or component; do not duplicate the prose).
   - Nav placement: footer first. Promote to top nav only if `/for-students` earns >5% of homepage clicks after 4 weeks live.
   - 1,494 SEO landers under `/networking/*`, `/cold-email/*`, `/alumni/*`, `/networking-for/*`: add `/for-students` as breadcrumb parent in their footer. Mechanical pass, scriptable.

#### Wave 4 - compare pages, batched (S total)

7. **`/compare/*`** (LinkedIn, Apollo, Handshake, ChatGPT). Per page:
   - Remove em dashes.
   - Update pricing rows to show annual alongside monthly.
   - Sweep ban list (any remaining `intelligent`, `AI-powered`, `seamless`).
   - Add `/for-students` link in nav/footer.

#### Wave 5 - in-product copy, deferred (M each)

8. **Feature page in-product copy**. Each page in its own session, not batched.
   - `FindPage.tsx`, `FirmSearchPage.tsx`, `RecruiterSpreadsheetPage.tsx`, `JobBoardPage.tsx`, `MeetingPrepPage.tsx`.
   - Scope: page headers, empty states, loading text, button labels, toasts, tooltips.
   - Out of scope: functional UI changes, layout, components.
   - Lower priority than marketing surfaces because the audience is already signed up.

### Dependencies (don't break the sequence)

- `/pricing` copy depends on the backend trial-length change (30 → 7 day).
- `/for-students` depends on About being rewritten first (shares the founder paragraph).
- `/compare/*` annual prices depend on `/pricing` annual implementation.
- All copy depends on resolving the PDL outage (`backend/app/services/feature_flags.py:246`, `PDL_OUTAGE_ACTIVE = True`). Do not ship marketing claims while Find People, autocomplete, and Meeting Prep are returning 503.

### Kill criteria for the Phase 5 rollout

After 4 weeks of Wave 1 + Wave 2 live:

1. If homepage visit → `/pricing` click-through doesn't increase by ≥30% over the gated-pricing baseline, the ungating and price visibility didn't pay off. Revisit whether `/pricing` should stay public, and audit the homepage pricing-mention placement.
2. If `/for-students` bounce rate is >70% after 4 weeks live, the recruitment-cycle narrative and the target-school-objection section aren't connecting. Revisit section ordering, and consider whether the persona page needs its own H1 test cycle (separate from the homepage hero).
3. If OG-meta CTR on social shares doesn't lift within 2 weeks of Wave 1, the OG title formulation is wrong. A/B test the locked H1 directly in OG title position before considering reverts.

### Out of scope for Phase 5

- Re-litigating the hero, positioning spine, or pricing tiers.
- Line-by-line copy editing (that's implementation, done at write-time per surface).
- Designing new pages from scratch. Only `/for-students` is new; everything else is rewrites against existing layouts.
- Building public marketing-facing versions of the protected feature pages (e.g., a public `/features/find-people` lander). The 1,494 SEO landers cover this surface for now. Revisit in a later phase.

---

## Things the next session should NOT do

- Question the locked hero. Six rounds of iteration. Don't reopen.
- Add "students" to the homepage H1 or sub. Explicit constraint.
- Use AI language anywhere in user-facing copy. Explicit constraint.
- Use em dashes anywhere. Explicit constraint.
- Suggest "Your network is your net worth" or similar Naval/Tony Robbins clichés. User rejected this in Phase 2.
- Propose a Clado-style multi-vertical homepage (`/job-seekers`, `/recruiters`, `/sales`). User rejected. The `/for-students` sub-page is the correct version of this instinct.
- Use the 2,400+ student number. Use 300+. The 2,400 is publicly contradicted by the About page.

---

## Open questions to flag to the user before Phase 6

1. Has the user committed to the "no promo discounts, ever" rule (from the pricing doc)? Not explicitly confirmed.
2. Should Meeting Prep get its own dedicated section between the pillars and the time-savings, or fold entirely under Pillar 3? My read (and the user's implicit sign-off): own beat, not own pillar.
3. The `PDL_OUTAGE_ACTIVE = True` kill switch in `feature_flags.py:246` is currently 503-ing Find People, autocomplete, and Meeting Prep. Before any of this copy ships, confirm the outage is resolved so the homepage doesn't promise something the product is actively returning 503 on.

---

## Skills installed during this work

- **`positioning`**: Existing skill, used to drive Phases 1 to 4 structure.
- **`set-pricing`**: NEW skill written during this work, installed at `~/.claude/skills/pricing/SKILL.md`. Designed for future pricing decisions on any product. Frameworks: Van Westendorp, ProfitWell/Campbell, Hormozi value equation.

---

## Quick reference: the locked hero

> **H1:** `Find anyone. Reach anyone. Track every conversation.`
>
> **Sub:** `Tell us who you want to meet. We find them, draft the message, and manage every reply, follow-up, and meeting prep.`

**Tone:** Granola-flat. Dry. Descriptive. No AI. No identity claim. No outcome promise. The verbs are the product loop. The sub names mechanisms.

---

## Open decisions (pre-implementation)

Two pieces of copy are still open. Recommended defaults below; user can override before the rebuild starts.

### Brand line (footer + recurring brand surface)

Current line `You shouldn't need connections to start a conversation.` is too preachy. Five candidates:

1. **`Networking, without the network.`** *(recommended default)* - Contrarian, 4 words. Names the activity, undercuts the assumption.
2. `Cold outreach, warm replies.` - Mechanism-coded, 4 words. Describes what the product does.
3. `The shortcut is the workflow.` - Category-claim. Reframes the equalizer.
4. `The work of networking, done.` - Granola-flat. Closest match to homepage register.
5. `Reach is a workflow, not a network.` - Declarative. Reframes networking itself.

### Time savings section header

Current section uses `Three hours of work. Three minutes of yours.` + punchline with an em dash. Three candidates:

1. `Less time on the inbox. More time in the meeting.` + punchline `That's 84 minutes back, per person you reach.`
2. **`The grind, done.`** *(recommended default)* + body `Search, draft, track. 84 minutes back per person.`
3. `What used to take a weekend.` + body `Now it takes a Tuesday.`

---

## Implementation brief: landing page rebuild (next session)

The user is opening a separate terminal to rebuild the landing page. This is the entire spec for that session. Do not re-litigate anything above.

### What to build

Rewrite the homepage (`connect-grow-hire/src/pages/Index.tsx`, 1094 lines) section-by-section per the structure below. Do NOT build `/for-students` in this session - that's a separate session.

### Order of operations

1. **Pre-flight read** (3 minutes):
   - This entire doc, focusing on: locked hero, locked messaging system (Phase 4), landing-page-vs-/for-students split rule, open decisions.
   - `docs/chrome-extension-marketing.md` - context for why the extension is being CUT from the homepage.
   - `connect-grow-hire/src/pages/Index.tsx` - current state, 1094 lines.
   - `connect-grow-hire/src/components/HeroSearchCTA.tsx` - DO NOT modify the interactive component structure. Only three copy swaps inside it.

2. **Confirm open decisions** with user before writing code:
   - Brand line (5 candidates above; default = #1)
   - Time savings header (3 candidates above; default = #2)

3. **Rebuild section by section** in the order below.

### Landing page section spec (top to bottom)

1. **Top nav** - Keep as-is. Existing nav already has `Sign in` / `Create account` buttons. The `Extension` link points to the existing extension section; since the extension is being removed, point this link to the Chrome Web Store URL directly OR remove the link (extension page comes later).

2. **Hero** - Three copy swaps inside `HeroSearchCTA.tsx`:
   - Eyebrow (line ~476, `Made for students chasing their first offer`): kill, OR replace with `Built and used at USC, UCLA, Michigan, NYU, Georgetown.`
   - H1 (lines ~492-494, `We do the outreach / You land the offer`): replace with `Find anyone. Reach anyone. Track every conversation.` (three short phrases; restructure the line-break logic, drop `whiteSpace: nowrap`).
   - Sub (lines ~508-510): replace with `Tell us who you want to meet. We find them, draft the message, and manage every reply, follow-up, and meeting prep.`

3. **Testimonial wall** *(moved up from current page position)*:
   - H2: `Real conversations. Real meetings. Real results.`
   - Sub: `In their words.`
   - 4-6 cards with name, school, role/offer, one-sentence quote. Sources: existing imports `DavidJiPhoto`, `SarahUcuzogluPhoto`, plus Dylan/Evercore and Jackson/Blackstone from About page.

4. **Pillar 1 - Find anyone**
   - H2: `Search anyone, sorted by who's most likely to reply.`
   - Body: `Type a role, a company, a school, or the kind of person you want to meet. We surface people who share your school, your major, your hometown, or your career path. The ones who actually have a reason to write back.`

5. **Pillar 2 - Reach anyone**
   - H2: `Personalized emails, drafted into your Gmail.`
   - Body: `We write the message using what's actually true about you and them. The draft lands in your real Gmail. Send it, edit it, replace it. Your account, your voice.`

6. **Pillar 3 - Track every conversation**
   - H2: `The moment someone replies, we take it from there.`
   - Body: `When a reply lands, the tracker updates, a follow-up draft appears, and prep for the meeting is ready before you need it.`

7. **Meeting Prep beat** *(under Track, own slot, not a fourth pillar)*
   - H2: `When the meeting gets booked, the prep is already done.`
   - Body: `Research on the person, talking points based on what they care about, questions worth asking. Generated the moment they say yes.`

8. **Time savings** *(moved down from current top-of-page slot)*
   - Use whichever header the user picks from the open decisions.
   - Reuse existing `TimeComparison` component. Fix the em dash in the punchline.

9. **Trust band**
   - Line: `Used across 30 campuses and growing.`
   - Visual: keep the existing multi-logo row.
   - Kill the 2,400+ stat anywhere it appears on the page.

10. **Chrome extension section** - CUT. Remove from the page entirely. See `docs/chrome-extension-marketing.md` for the strategy.

11. **FAQ** *(new section, doesn't exist on current page)*:
    H2: `Questions you probably have.`
    Eight questions, locked copy below.
    - **How do you find people's emails?** We pull from a database of 2.2 billion verified contacts and verify the email before showing it to you. If we can't verify, we tell you.
    - **Is this just AI spam?** No. Every draft is written from your resume and the contact's background. You review it in Gmail before it sends. AI handles the typing; the message is yours.
    - **What's free vs paid?** Free gives you 5 contacts per search and 300 credits a month. Pro and Elite raise the limits and unlock advanced search, resume tools, and prep. Full details on the pricing page.
    - **How is this different from LinkedIn, Apollo, or coaching?** LinkedIn has the data but not the emails. Apollo has the emails but is built for sales teams. Coaching gives you advice in a PDF. Offerloop does all three.
    - **Will my Gmail get flagged?** Drafts land in your own Gmail. You send them yourself, one at a time. Volume stays low enough that Gmail treats them like the personal emails they are.
    - **What happens after someone replies?** The tracker advances, a follow-up draft is ready, and a prep PDF generates with research on the person. You walk in prepared.
    - **Can I edit drafts before sending?** Yes. The draft is in your Gmail. Rewrite, swap, scrap, start over. It's your account.
    - **What does Offerloop cost?** *(short blurb pointing to `/pricing`)*
    NOTE: FAQ Q3 from earlier draft (`What if I'm not at a target school?`) migrates to `/for-students`. Do not include on landing.

12. **Footer CTA**
    - Big line: brand line from open decisions (default `Networking, without the network.`)
    - Button: `Create account`
    - Microtext: `Free. No credit card. 5 contacts in your first search.`

13. **Footer** - Keep existing structure. Brand line bottom-left matches the one from #12.

### Constraints (enforce on every commit)

- No em dashes anywhere on the page. Use commas, colons, parentheses, periods only.
- No banned words: `AI-powered`, `AI-driven`, `intelligent`, `smart`, `seamless`, `supercharge`, `cutting-edge`, `revolutionary`, `dream offer`, `chasing`, `land your offer`, `trusted by`, `top universities`. Full ban list in this doc above.
- No `students` in headlines, value props, CTAs, or hero. (Trust band can say `30 campuses` because that's factual social proof, not persona-coding.)
- Do NOT touch the interactive `HeroSearchCTA` component structure. Only the three copy swaps.
- Do NOT add target-school anxiety, recruitment-cycle narrative, founder origin, or identity claim to the landing page. All of that migrates to `/for-students`.

### Hard dependencies (do not ship copy until these resolve)

1. **PDL outage**: `backend/app/services/feature_flags.py` line ~246, `PDL_OUTAGE_ACTIVE = True`. Currently 503-ing Find People, autocomplete, and Meeting Prep. The landing page promises all three. Confirm outage is resolved before any copy ships.
2. **Free tier credit limit (5 contacts)**: backend currently delivers 3, frontend says 150 credits, source-of-truth backend says 300. Footer microtext says `5 contacts in your first search` - this is a future state; user is handling the limit change in a separate pricing-terminal session. Landing page copy ships only after that lands.
3. **OG meta tags**: cheap parallel update - `index.html` global tags, `Index.tsx:162-163` Helmet override. Use Phase 4 before/after directly (`Offerloop: Find anyone. Reach anyone. Track every conversation.` + `Find the people you want to talk to. We draft the message, manage every reply, and prep you for the meeting.`).

### Out of scope for this session

- `/for-students` page (separate session per user)
- `/pricing` page (separate pricing-terminal session)
- About page rewrite (separate, lower priority)
- `/compare/*` pages (Wave 4, deferred)
- In-product feature page copy (Wave 5, deferred)
- Chrome extension (cut from homepage, strategy doc at `docs/chrome-extension-marketing.md`, dedicated `/extension` page is a later session)
- Visual design changes (brand blue stays, Inter + Libre Baskerville typography stays, landing page is NOT a redesign - copy/structure only)

### Verification before completing the session

1. Run dev server, walk the page top to bottom in a browser. Use `/browse` or screenshot if available.
2. Grep the dist for em dashes (`grep -rn " - " connect-grow-hire/src/pages/Index.tsx connect-grow-hire/src/components/HeroSearchCTA.tsx`). Should return zero.
3. Grep for banned words (above list). Should return zero in landing-page-related files.
4. Confirm `2,400` does not appear anywhere on the page.
5. Confirm hero interactive prompt still routes to `/signin?mode=signup` with the query stashed.
6. Confirm OG meta tags are updated.
7. Commit message format: `feat(landing): rebuild homepage messaging per positioning Phase 5 Wave 2`
