# Profile & Onboarding - Design Spec

**Status:** Draft v1, not yet implemented
**Owner:** Rylan + Claude
**Last updated:** 2026-05-02

---

## Vision

Personalization is Offerloop's moat. Today the user's resume, school, and target context are scattered across `users/{uid}` Firestore fields, occasionally surfaced in the typewriter placeholder and chip suggestions, and otherwise invisible. The user can't see what we know about them, can't edit it, and can't feel that this knowledge is feeding their search results, email drafts, Scout answers, and Job Board ranking.

This spec proposes:

1. **A new top-level Profile page** as the user's personalization control center - visible in the sidebar, editable, and explicitly tied back to the features it powers.
2. **An expanded onboarding flow** that captures rich context (LinkedIn, resume, structured career interest, free-text narrative) and visualizes the work being done so the user feels the value before they ever search.
3. **A unified `PersonalizationProfile` data model** that consolidates everything we know about the user into one Firestore document, queryable by every feature downstream.

LinkedIn URL and resume upload remain **optional but encouraged**. Skipping forfeits the corresponding personalization tier (alumni connection ranking, resume-derived role suggestions). Each skip is acknowledged with a clear "you'll miss X" message, not punished.

---

## The data model

`PersonalizationProfile` lives at `users/{uid}/personalization` (subcollection doc, single record per user). Synthesized once during onboarding, edited from the Profile page, refreshed when the user replaces their resume or relinks LinkedIn.

```ts
interface PersonalizationProfile {
  // Basics - already collected by today's onboarding
  firstName: string;
  lastName: string;
  university: string;          // canonical full name
  universityShort: string;     // "USC", "NYU"
  major: string;
  graduationYear: number;
  graduationMonth?: string;
  classStanding?: 'Freshman' | 'Sophomore' | 'Junior' | 'Senior' | 'Graduate';

  // Resume-derived (null if user skipped upload)
  resume: {
    fileName: string;
    fileUrl: string;             // Firebase Storage path
    parsedAt: Date;
    gpa: number | null;
    coursework: string[];
    skills: string[];
    experiences: Array<{
      company: string;
      title: string;
      startDate: string;        // YYYY-MM
      endDate: string | null;   // null = current
      description: string;
      isInternship: boolean;
    }>;
    projects: Array<{ title: string; description: string }>;
    certifications: string[];
    languages: string[];
  } | null;

  // LinkedIn-derived (null if user skipped paste/import)
  linkedin: {
    url: string;
    headline: string;
    aboutSummary: string;
    industriesInferred: string[];
    connections: {
      total: number;
      bySchool: Record<string, number>;     // { "USC": 487 }
      byCompany: Record<string, number>;    // { "Goldman Sachs": 12, "JPMorgan": 8 }
    };
    activitySnapshot: string;              // optional plain-text summary
    refreshedAt: Date;
  } | null;

  // User-provided career context (Phase 2c of onboarding - required)
  careerContext: {
    targetIndustries: string[];            // chip multi-select
    targetFirms: string[];                 // chip + free-add
    recruitingCycle: 'summer-sa' | 'off-cycle' | 'fulltime' | 'exploring';
    cycleYear: number | null;              // 2027 etc.
    preferredLocations: string[];
    narrative: string;                     // free text, ≤500 chars
  };

  // Computed / derived (rebuilt on save)
  derived: {
    primaryTarget: string;                 // "IB Analyst at bulge bracket"
    alumniNetworkSize: number;
    targetCompaniesCount: number;
    completenessScore: number;             // 0–100
    completenessBreakdown: {
      basics: number;                      // 0 or 100
      resume: number;
      linkedin: number;
      careerContext: number;
      narrative: number;
    };
    lastUpdated: Date;
  };
}
```

Existing `users/{uid}` fields (university, targetIndustries, careerGoals, etc.) become **derived shadows** of this object - the source of truth is the personalization doc.

---

## The Profile page

### Placement

**New top-level sidebar nav item, second from the top, between Find and My Network.**

```
Find
Profile           ← new
My Network
Meeting Prep
Tracker
Job Board
Timeline
```

Reasoning: Profile is the moat. A subtab inside Find subordinates it; a top-level item declares it. Users return to it to refresh resume / edit context / verify what's stored - needs to be one click away.

### Layout (top to bottom)

1. **Header card.** Avatar, name, university · major · class year, attached resume status, "Edit basics" link. Maps to the top of the user's whiteboard mockup.
2. **Completeness meter.** Single horizontal bar with percentage and one-line nudge ("Add your career interests to unlock better ranking"). Click → scrolls to the section that's missing.
3. **Resume + LinkedIn - two columns.**
   - Resume column: education, experience list (3 most recent), skills (top 8), GPA + coursework, "Replace resume" button.
   - LinkedIn column: headline, total connections, top 3 companies by connection count, top 3 schools, industry inference, "Refresh LinkedIn" button.
   - If either is empty: "Skip placeholder" with explicit value prop and "Add now" CTA.
4. **Career Interest.** Editable chips for target industries (multi-select from a curated list of ~14), target firms (chip + free-add), recruiting cycle (radio), preferred locations (chip + free-add).
5. **Extra Context.** Free-text textarea, 500 char max. Subtitle: "Used as system prompt context for your searches and emails."
6. **What this personalization powers.** Compact list with one-liner per surface:
   - Find - alumni & company suggestions
   - Job Board - roles ranked for your fit
   - Emails - drafted with your context
   - Scout - answers tuned to who you are
   - Tracker - context-aware reply suggestions

### Edit interactions

All sections inline-editable. No "Edit mode" toggle - clicking a chip removes it, typing in a field saves on blur, drag-drop replaces a resume. Save persists to Firestore via debounced upserts (500ms).

Every save triggers a `derived` recompute on the backend (cheap - completeness score + alumni count).

### Empty states

Each section that lacks data shows a styled "skip placeholder":

```
[icon]  We don't have your LinkedIn yet.
        With it, we'll surface alumni at every company you search,
        rank by connection density, and suggest the right people
        to message first.
        [+ Add LinkedIn]
```

Color: subtle paper-2 background, dashed line border, no urgency tint. Information-dense, not pushy.

---

## The onboarding flow

Four phases. Total time: 4–5 minutes when filled honestly.

### Phase 1 - Welcome & basics (existing, polished)

One screen. Captures: first name, last name, university (autocomplete), major (autocomplete), graduation year. ~30 seconds. The current `OnboardingWelcome` + `OnboardingProfile` + `OnboardingAcademics` flow consolidated.

### Phase 2 - Personalization ingestion (new)

Three sub-screens, one per data source so each gets focus. Skip option visible on every screen but de-emphasized.

**2a. LinkedIn.**
- Single input: "Paste your LinkedIn URL"
- Helper: "We'll extract your education, work history, headline, and connection stats. We don't post anything or contact your network."
- Validation: must contain `linkedin.com/in/`
- "Skip - I'll add it later" link, secondary visual weight

**2b. Resume.**
- Drag-drop zone with file picker fallback
- Helper: "PDF or DOCX. We extract experience, skills, GPA, and coursework. Stored encrypted in your account."
- Skip link with same treatment

**2c. Career context.**
- Target industries: chip multi-select from curated list of 14 (IB, MBB Consulting, Big 4 Consulting, Tech, PE, VC, Hedge Funds, Quant, FinTech, Healthcare, Marketing, Sales, Strategy, General Finance)
- Target firms: chip input that suggests as you type from `companies.ts`
- Recruiting cycle: radio (Summer 2027 SA / Off-cycle / Full-time 2027 / Exploring)
- Preferred locations: chip input from curated city list
- "What are you optimizing for?" - 500-char textarea, examples in placeholder

This step is **required** (not skippable). It's the only context the user must explicitly provide; everything else is auto-derived.

### Phase 3 - Scrubbing visualization (new)

Single full-screen moment, ~7–10 seconds. Real work happens; counters animate in.

```
Personalizing your search experience…

Parsing your resume                          ✓
  → 7 experiences · 12 skills · 3 projects extracted

Reading your LinkedIn                        ✓
  → 487 connections · 12 alumni at Goldman Sachs

Cross-referencing your school                ✓
  → 3,200 USC alumni in finance · 1,400 in IB

Mapping your recruiting timeline             ✓
  → IB summer-analyst recruiting closes Aug 2026

Building your search profile                 ✓
  → Profile ready
```

Each row appears with a check after its data is fetched. Numbers are real, computed live.

If a step has no data (user skipped LinkedIn), the row reads "Skipped - add LinkedIn later for richer matches" in muted text.

### Phase 4 - Profile preview & confirmation

Renders the new Profile page in a "first-time review" mode: large "Looks right" CTA at the bottom, helper copy "Edit anything that's wrong before you start searching." Inline edits are allowed but optional. Submit → marks `needsOnboarding=false`, navigates to `/find` with profile-driven chips pre-populated.

---

## How the profile feeds back into the app

| Surface | Today | With profile |
|---|---|---|
| Find - chips | Empty until user types | Pre-populated with target industry, target firms, school, location |
| Find - TRY pills | Industry-aware role variations only | Filtered by user's `careerContext.targetIndustries` |
| Find - Similar Companies sidebar | Static peer firms | Re-ranked by `linkedin.connections.byCompany` |
| Find - Network results | Generic relevance | Boosted by alumni overlap + connection density |
| Job Board | Match score from skills | Match score from skills × experience × target industries × cycle |
| Email drafts | Templates with placeholders | LLM system prompt includes `narrative` and `experiences` |
| Scout | Generic answers | Answers reference user's specific firms / school / cycle |
| Meeting Prep | Static questions | Questions tailored to the contact's role × user's `careerContext` |

---

## The dream: common-ground discovery in outreach

The bar Rylan set: a user types "fly fishing" into their personal context. They search for and decide to email a senior person at Goldman. Offerloop notices that the contact has a podcast appearance, a tweet, or a published article about fly fishing - and weaves *one* organic mention into the draft. Same shape for hometown ties (PDL → contact's home city matches user's home city pulled from resume / LinkedIn high-school field), shared alma mater clubs, mutual obscure interests.

This is the difference between "personalized email" and "the email actually feels human." It's also the difference between Offerloop and every other cold-email tool.

### What's feasible *today* with the current backend

Almost all of it, as a v1, with **zero new external services**:

| Need | Existing capability |
|---|---|
| Contact's bio, employment history, hometown, education | **PDL** (already pulled in contact search) - `location_country`, `location_locality`, `education[].school.name`, `education[].degrees`. Hometown via PDL `location_metro` fallback or high-school inference. |
| Contact's public mentions (articles, podcasts, posts) | **SerpAPI** (already wired in `serp_client.py`) - query `"<contact name>" <interest>` site-narrowed. Already used by Job Board and firm search. |
| Article / podcast page text extraction | **Jina Reader** (`r.jina.ai/<url>` - already used by `scout_service.py`). Free at volume, returns clean markdown. |
| Deeper bio when SerpAPI is thin | **Bright Data** (already in `linkedin_enrichment.py` fallback chain) for LinkedIn posts/activity scraping when needed. |
| User's hometown / high school | Pulled during onboarding from resume parser (`resume_parser_v2.py` already extracts education going back to high school in many resumes) **+** LinkedIn (Jina-extracted education list). |
| LLM that can decide "should I mention this?" | OpenAI / Anthropic (already in `reply_generation.py`). |

**v1 implementation sketch** (~5 days of backend work, no new vendor contracts):

1. New service `common_ground.py`. Function `find_common_ground(sender_profile, contact_pdl)` returns a list of `{ kind, signal, evidence_url, confidence }` candidates.
2. **Cheap signals first** (no external calls): hometown match, school match, employer overlap, club/interest overlap from `personalization.narrative` parsed against contact's PDL `interests` field if present.
3. **Expensive signals second** (one SerpAPI call max per draft): for each user-stated interest in `narrative`, run `"<contact name>" <interest>` query. If SerpAPI returns a result with the contact's name in the title or first 200 chars, fetch the page via Jina, snip the relevant 2–3 sentences, store as evidence.
4. **LLM decision step**: pass top 3 candidates to the email-generation LLM with a strict "weave in *at most one* if it's clearly the contact (verified by name match in evidence), otherwise omit. Never invent." prompt. Better to skip than to hallucinate.
5. **Cache** common-ground results per (user_id, contact_id) for 30 days. Refresh on contact data change.

**Cost guards:**
- Only run for tier ≥ Pro (Free tier gets the basic system-prompt personalization, not the live web search).
- Cap: 1 SerpAPI call + 1 Jina fetch per email draft.
- Skip entirely if `personalization.narrative` is empty.

### What would need new backend additions

Honest read on what's *not* feasible today and what each addition unlocks:

| Want | Gap | Add |
|---|---|---|
| Realtime LinkedIn post / engagement feed for contacts | We don't continuously scrape LinkedIn at user volume. Bright Data does ad-hoc profile pulls; not a feed. | Bright Data scheduled scraper, or buy a service like Coresignal. ~$$$, 2 weeks. |
| Cross-contact interest graph ("who else in the network shares this interest") | No persistent index. Each draft is point-in-time. | New Firestore collection `interestEdges/` populated as drafts run; trivial to add but value compounds slowly. ~3 days. |
| Behavioral inference ("this person engages with X-themed posts") | Not feasible without LinkedIn engagement data. | Same as the first row - a real LinkedIn data pipeline. |
| Hometown verification beyond PDL | PDL is best-in-class. Anything beyond is diminishing returns. | None. PDL is enough. |

**Recommendation:** ship the v1 above (PDL hometown + SerpAPI interest probe + Jina extract + LLM decision step) before considering the cross-contact graph or LinkedIn feeds. The v1 alone covers Rylan's fly-fishing example end-to-end.

### How the Profile page feeds this

`personalization.narrative` is the input. Two design implications:

1. **Don't phrase the field as "this gets injected into emails."** Phrase it as **"the more we know about you, the better we can spot real common ground."** The user shouldn't feel they're writing a system prompt; they should feel they're describing themselves to a friend who's about to introduce them.
2. **Show the field generously** - 600 chars not 500, multi-line by default, and accept a placeholder that reads like a person ("Bend, OR · fly fishing · Liverpool FC · Patrick Rothfuss novels · …") so users know unstructured tags are welcome.

The frontend lives in `ProfilePreview.tsx`'s `PersonalContext` component and is the prototype of how this should land in production.

---

## Sequencing

1. **Build the new `PersonalizationProfile` data model and migration**
   Backend: Firestore schema, derived recompute service, migration that backfills from existing `users/{uid}` fields. ~3 days.

2. **Build the Profile page UI** (this is the first user-visible piece)
   Frontend: new sidebar nav item, page component with all six sections, inline-edit interactions, completeness meter logic, empty-state placeholders. ~4 days.

3. **Build Phase 2c & Phase 3 of onboarding**
   Frontend: career-context sub-screen, scrubbing visualization. Backend: data aggregator that produces the scrubbing feed (counts of alumni, connection breakdowns). ~3 days.

4. **Wire profile into Find first** (highest-value downstream)
   Pre-populate chips, filter TRY pills, re-rank Similar Companies. ~2 days.

5. **Wire profile into Email drafts** (second highest)
   System prompt builder reads from the profile. ~1 day.

6. **Wire profile into Scout, Job Board, Meeting Prep, Tracker** (lower priority, parallelizable)
   ~1 week total.

Total: ~3 weeks of focused work for the foundational personalization moat to be real and visible.

---

## Decisions resolved

1. **LinkedIn ingestion - avoid PDL.** PDL costs us per call and is reserved for paid contact searches. The existing `/api/enrich-linkedin-onboarding` route currently does PDL → Bright Data. **Reorder to: Jina Reader first → LLM structuring → Bright Data fallback → PDL only as last resort.** Jina (`r.jina.ai/<linkedin-url>`) is already used by `scout_service.py` for web scraping, returns markdown of the public profile, and is essentially free at our volume. The existing `llm_enrich_profile` handles structuring the markdown into the same `resumeParsed` shape we already write to Firestore. PDL stays in the chain as a floor but should rarely be hit.

2. **Industry prediction.** New backend service `predict_target_industries(profile)` that takes the resume + LinkedIn `resumeParsed` object and returns a ranked list from the 10-industry taxonomy. Implementation: single LLM call with a curated system prompt; cached per profile-version. Surfaces in the Profile page as **AI-suggested chips** (sparkles icon, distinct visual treatment) above the user-confirmed chips. **User input always wins** - once a chip is confirmed or rejected, the prediction is locked out for that slot. Re-predictions only run when the underlying resume/LinkedIn changes.

2b. **Direction = freeform-input → structured-extraction, not chip-first.** The Direction card on the Profile page leads with a textarea (`directionNarrative`, ≤800 chars) where the user describes what they're after in plain English - *"I want to ship things fast"*, *"good with numbers but hate spreadsheets, like talking to people"*. Industries / Roles / Firms chips are rendered **below** under a "Here's what we picked up" divider as the *receipt* of LLM extraction, not the entry point. **Why:** chip-first forces the user to know our taxonomy ("Big 4 Consulting", "Forward-Deployed Engineer") which most undergrads don't. Narrative-first captures nuance the taxonomy can't ("research-y but only if it ships", "client-facing but I want to travel"), and the chips become an audit trail the user verifies and edits - not a cold-start picker. **Implementation:** new service `extract_direction(narrative)` returns `{ industries[], roles[], firms[], confidence }`. Runs on debounced blur of the textarea. Cached per narrative hash. Same OpenAI/Anthropic infra as `predict_target_industries`. **Roles** added as a first-class field alongside Industries - `roles.ts` already has 79 entries, and the narrative pattern surfaces role signal more cleanly than industry signal in many cases.

2. **Resume parser fidelity.** `resume_parser_v2.py` already extracts header, education, experience, projects, skills, activities, summary - the structured output is rich. The `/api/parse-resume` endpoint flattens this to (name, year, major, university). **Recommendation: extend the API to return the full structured object so the Profile page can display it without a second parse.**

3. **Career-interest taxonomy size.** 14 industries felt right when sketching but might be too many or too few. **Recommendation: start with 10 (IB, MBB, Big 4, Tech, PE, VC, Hedge/Quant, FinTech, Healthcare, Other) and add as we learn from real users.**

4. **Edit audit trail.** Should profile edits be tracked (when, what changed)? Useful for debugging "why is Find suggesting X?" later. **Recommendation: yes, but start simple - append to a `profileChanges` subcollection with `{ field, oldValue, newValue, at }` per edit.**

5. **What survives if a user removes their LinkedIn or replaces their resume?** Old derived data (alumni count, connection breakdowns) becomes stale immediately. **Recommendation: clear the affected `linkedin` / `resume` blocks immediately and recompute `derived.completenessScore` on save.**

---

## Cross-references

Onboarding patterns worth copying from:

- **Superhuman** - concierge intake, depth justifies time. Read patience trade-off.
- **Apple Health initial setup** - canonical "watch us parse your data" visualization. Direct inspiration for Phase 3.
- **Linear** - clean step-by-step with progress dots; each step does real work.
- **Notion workspace setup** - captures rich context up front, populates templates immediately. Closes loop on "we used what you told us."
- **Cursor** - short but smart; detects preferences from sample work. Equivalent of resume parser auto-fill.
- **YC Startup School** - asks deeper context than feels reasonable, then uses every answer throughout the experience.
- **Mint / Personal Capital** - financial scrubbing visualization.

The pair to anchor on for our flow: **Superhuman's depth + Apple Health's visualization**.

---

## Dev preview routes (this PR)

For visual iteration before commit:

- `/dev/profile-preview` - renders the proposed Profile page with mock data. No auth required.
- `/dev/onboarding-preview` - renders the existing `OnboardingFlow` without auth-gating. Use this to see what's there today before we replace it.

Both routes are dev-only ergonomics, not production paths. They live in `App.tsx` outside the `ProtectedRoute` wrapper.
