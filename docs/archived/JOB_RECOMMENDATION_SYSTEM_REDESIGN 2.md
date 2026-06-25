# Job Recommendation System: Conceptual Redesign
## From First Principles

**Status:** Design Document  
**Audience:** Product Managers, Engineers, Leadership  
**Based On:** Diagnostic Audit (JOB_RECOMMENDATION_PIPELINE_AUDIT.md)

---

## 1️⃣ SYSTEM'S CORE PROMISE

### What This System Is

**"We only show jobs that a user could realistically apply to and have a reasonable chance of being considered for."**

More specifically:

> **Every job we recommend must pass three gates:**
> 1. **Relevance Gate:** The job aligns with the user's stated career intent
> 2. **Feasibility Gate:** The user meets basic qualifications (timing, location, role level)
> 3. **Trust Gate:** We are confident enough in the match to stand behind it

### What This System Is Not

- ❌ **Not a job discovery tool** - We don't show jobs "you might be interested in exploring"
- ❌ **Not a learning tool** - We don't show jobs "to help you understand your options"
- ❌ **Not a market research tool** - We don't show jobs "to see what's out there"
- ❌ **Not a spam filter** - Quality filtering is table stakes, not the value proposition

### The Promise in User Terms

**Strict Version (Recommended):**
> "If we show you a job, we believe it's a match. You should feel confident applying. If you see something that's clearly wrong, we've failed."

**This means:**
- A Finance major wanting Investment Banking should **never** see Software Engineer roles
- A student graduating in 2026 should **never** see Senior-level positions (unless explicitly searching for them)
- A user who specified NYC and SF should **never** see jobs in random cities (unless they explicitly search broader)

**Why This Matters:**
- Every irrelevant job damages trust
- Users stop engaging when they see noise
- Application conversion drops when users don't trust recommendations
- The system's value is precision, not volume

---

## 2️⃣ REINTERPRETING ONBOARDING AS INTENT CONTRACT

### Intent Signals: What Each Field Actually Means

#### `careerInterests` (Array)

**Intent Question:** "What career paths am I actively pursuing?"

**Type:** **HARD CONSTRAINT** (when specified)

**What it means:**
- User explicitly selected industries/careers they want
- This is a direct statement of intent, not a preference
- Multiple selections indicate openness across those domains

**Hard constraint logic:**
- Jobs must align with at least one career interest OR be explicitly related to the user's major
- If careerInterest = "Investment Banking", jobs must be in finance/banking domain
- If careerInterest = "Software Engineering", jobs must be in tech/engineering domain

**Missing/Ambiguous handling:**
- If empty: Fall back to major-based inference
- If ambiguous terms: Map to canonical categories (e.g., "Finance" → finance/banking/investment)

**In query generation:** PRIMARY SIGNAL - drives industry keywords and job title selection

**In scoring:** Not needed if hard gate passes (but can boost relevance)

---

#### `major` (String)

**Intent Question:** "What domain knowledge do I have?"

**Type:** **SOFT PREFERENCE** (with hard boundaries)

**What it means:**
- Academic background that indicates domain expertise
- Not a hard requirement (majors don't perfectly map to jobs)
- But creates boundaries - some jobs are incompatible

**Hard constraint logic:**
- Finance major → Blocks jobs requiring CS/engineering expertise (unless explicitly in finance tech)
- CS major → Blocks jobs requiring finance/accounting expertise (unless fintech)
- Humanities major → More open, but still blocks highly technical roles

**Missing/Ambiguous handling:**
- If missing: Assume open (but require stronger signals from other fields)
- If ambiguous: Use field clustering (tech_fields, finance_fields, etc.)

**In query generation:** SECONDARY SIGNAL - refines career interest queries, adds domain keywords

**In scoring:** Field affinity (0-20 points) - major domain alignment

---

#### `graduationYear` + `graduationMonth` (Integer + String)

**Intent Question:** "When am I available to start full-time work, and when should I be applying for internships?"

**Type:** **HARD CONSTRAINT** (for timing) + **SOFT PREFERENCE** (for application window)

**What it means:**
- Defines eligibility window (can't start before graduation)
- Defines application timing (internships vs new grad roles)
- Creates seniority boundaries (sophomore ≠ senior-level roles)

**Hard constraint logic:**
- Current year - graduation year = years until graduation
- Years until graduation > 1 → ONLY internships/co-ops (block full-time)
- Years until graduation = 1 → Internships + new grad roles
- Years until graduation ≤ 0 → ONLY new grad/entry-level full-time (block internships)

**Seniority gates:**
- Years until graduation > 1 → Block "Senior", "Lead", "Manager" roles (hard gate)
- Years until graduation = 1 → Block "Senior", "Lead" (allow "Associate", "Analyst")
- Years until graduation ≤ 0 → Allow entry-level and junior roles, block "Senior" (unless 2+ years experience)

**Missing/Ambiguous handling:**
- If missing: Assume current year + 1 (conservative)
- If graduationMonth missing: Assume May (standard)

**In query generation:** PRIMARY SIGNAL - determines job type prefix ("internship" vs "entry level") and filters seniority terms

**In scoring:** Timing alignment (2 points) - minor boost for optimal timing

---

#### `jobTypes` (Array)

**Intent Question:** "What employment structures am I seeking?"

**Type:** **HARD CONSTRAINT**

**What it means:**
- User explicitly selected employment types they want
- This is a direct filter, not a preference

**Hard constraint logic:**
- If `jobTypes = ["Internship"]` → Block all full-time, part-time jobs
- If `jobTypes = ["Full-Time"]` → Block all internships, part-time jobs
- If `jobTypes = ["Internship", "Full-Time"]` → Allow both

**Missing/Ambiguous handling:**
- If empty AND graduationYear indicates >1 year → Default to ["Internship"]
- If empty AND graduationYear indicates ≤1 year → Default to ["Internship", "Full-Time"]
- If empty AND graduationYear missing → Default to ["Internship", "Full-Time"] (conservative)

**In query generation:** PRIMARY SIGNAL - determines query prefix

**In scoring:** Base relevance (5 points) - but redundant if hard gate works

---

#### `preferredLocation` (Array)

**Intent Question:** "Where am I willing to work and apply?"

**Type:** **HARD CONSTRAINT** (when specified, with remote exception)

**What it means:**
- User explicitly selected geographic preferences
- This is a direct location filter, not a preference
- Multiple locations indicate openness to relocating among those cities

**Hard constraint logic:**
- Jobs must be in one of the preferred locations OR explicitly remote
- If `preferredLocation = ["New York, NY", "San Francisco, CA"]` → Block jobs in other cities (unless remote)
- If `preferredLocation = []` → Allow all locations (no geographic constraint)

**Remote handling:**
- If job is explicitly remote → Always pass (regardless of preferredLocation)
- If job location matches preferredLocation → Pass
- If job location doesn't match → Block (hard gate)

**Missing/Ambiguous handling:**
- If empty: No geographic constraint (but this should be rare - most users have preferences)
- If ambiguous format: Normalize to "City, State" format

**In query generation:** PRIMARY SIGNAL - determines location parameter for ALL queries

**In scoring:** NOT NEEDED - if hard gate passes, location is already correct (but can boost if exact match)

---

#### `university` (String)

**Intent Question:** "What is my educational brand/prestige signal?"

**Type:** **SOFT PREFERENCE** (prestige/network signal only)

**What it means:**
- University name doesn't directly filter jobs (anyone can apply anywhere)
- But creates signals for:
  - Target company preferences (some companies target specific schools)
  - Network opportunities (alumni connections)
  - Prestige matching (top companies often target top schools)

**Hard constraint logic:**
- NONE - University doesn't block jobs

**Missing/Ambiguous handling:**
- If missing: No university signal (still allow all jobs)

**In query generation:** TERTIARY SIGNAL - Can influence "top companies" query selection (e.g., target companies that recruit from top schools)

**In scoring:** Prestige boost (optional, 3-5 points) - matching target companies for university tier

---

#### `resume` (Optional Object)

**Intent Question:** "What skills, experiences, and accomplishments do I have?"

**Type:** **SOFT PREFERENCE** (richness signal)

**What it means:**
- Provides concrete evidence of qualifications
- Skills, experiences, projects indicate fit
- **Does NOT override explicit intent** (e.g., if user wants IB but resume shows tech, still show IB jobs)

**Hard constraint logic:**
- NONE based on resume alone
- But can INFORM hard constraints (e.g., if resume shows 3 years experience, allow slightly higher-level roles)

**Missing/Ambiguous handling:**
- If missing: Rely on major + career interests only
- If incomplete: Use available sections, don't penalize

**In query generation:** SECONDARY SIGNAL - Skills inform job title keywords (e.g., "Python" → "Software Engineer", "Financial Modeling" → "Investment Banking")

**In scoring:** PRIMARY SIGNAL - Skills match (30 points), Experience relevance (15 points), Extracurriculars (6 points)

---

### Intent Signal Summary Table

| Signal | Type | Hard Gate? | Query Gen Priority | Scoring Weight | Missing Handling |
|--------|------|------------|-------------------|----------------|------------------|
| `careerInterests` | Hard Constraint | ✅ Yes | PRIMARY | N/A (if gate passes) | Fallback to major |
| `jobTypes` | Hard Constraint | ✅ Yes | PRIMARY | Redundant | Default based on graduation |
| `preferredLocation` | Hard Constraint | ✅ Yes | PRIMARY | N/A (if gate passes) | No constraint |
| `graduationYear` | Hard Constraint | ✅ Yes (timing) | PRIMARY | Minor (2 pts) | Assume +1 year |
| `major` | Soft Preference | ⚠️ Boundaries only | SECONDARY | Moderate (20 pts) | Open (stronger other signals needed) |
| `resume` | Soft Preference | ❌ No | SECONDARY | Major (51 pts total) | Rely on major/interests |
| `university` | Soft Preference | ❌ No | TERTIARY | Minor (3-5 pts) | No signal |

---

## 3️⃣ THE CANDIDATE JOB UNIVERSE

### Concept Definition

**The Candidate Job Universe is the set of jobs that could potentially be shown to a user, before any ranking or scoring occurs.**

It is constructed through **successive filtering layers** that narrow the total job market down to a relevant subset.

### Universe Construction Process

#### Layer 1: Base Job Market (Unfiltered)
- All jobs from external APIs (e.g., SerpAPI Google Jobs)
- Typically thousands to millions of jobs
- No user-specific filtering yet

#### Layer 2: Hard Intent Gates (User-Specific)
Apply hard constraints based on user's explicit intent:

**Gates Applied:**
1. **Career Domain Gate:** Job must align with `careerInterests` OR `major` domain
2. **Job Type Gate:** Job type must be in `jobTypes` array
3. **Location Gate:** Job location must be in `preferredLocation` OR be remote
4. **Timing Gate:** Job seniority must match `graduationYear` eligibility
5. **Quality Gate:** Job must pass minimum quality thresholds (spam, description length, etc.)

**Result:** Universe shrinks to ~100-500 jobs (depending on market density)

#### Layer 3: Relevance Refinement (User-Specific)
Apply soft boundaries that exclude clearly irrelevant jobs even if they pass hard gates:

**Refinements:**
1. **Field Boundaries:** Finance major shouldn't see pure SWE roles (unless fintech)
2. **Seniority Sanity:** Sophomore shouldn't see "Lead" roles even if internship
3. **Industry Alignment:** Career interest "Investment Banking" shouldn't show retail banking roles

**Result:** Universe shrinks to ~50-200 jobs

#### Layer 4: Query-Based Discovery (Active Fetching)
Only fetch jobs that match generated queries (this happens in parallel with universe filtering):

**Query Strategy:**
- Generate 3-5 targeted queries based on intent signals
- Each query fetches 20-30 jobs
- Deduplicate across queries
- Filter through Layers 2-3

**Result:** Universe contains ~30-100 jobs ready for scoring

### Concrete Examples

#### Example 1: Finance Student Pursuing Investment Banking

**User Profile:**
- Major: Finance
- Career Interest: Investment Banking
- Job Types: Internship
- Preferred Location: New York, NY, San Francisco, CA
- Graduation Year: 2026

**Universe Construction:**

**Layer 1:** All jobs in market (millions)

**Layer 2 - Hard Gates:**
- ✅ Career Domain: Finance/banking domain (Investment Banking, Private Equity, Asset Management, etc.)
- ✅ Job Type: Internship only
- ✅ Location: NYC, SF, or Remote only
- ✅ Timing: Internship appropriate for 2026 grad (sophomore/junior level)
- ✅ Quality: Real companies, good descriptions, recent postings

**Excluded:**
- ❌ Software Engineer internships (wrong domain)
- ❌ Full-time roles (wrong job type)
- ❌ Jobs in Chicago (wrong location)
- ❌ Senior Analyst roles (wrong seniority)
- ❌ Retail banking roles (wrong sub-domain)

**Layer 3 - Relevance Refinement:**
- ✅ Investment Banking Analyst Intern at Goldman Sachs (NYC) - IN
- ✅ Private Equity Intern at Blackstone (NYC) - IN
- ✅ Financial Analyst Intern at JP Morgan (SF) - IN
- ❌ Retail Banking Intern at Chase (NYC) - OUT (wrong sub-domain)
- ❌ Accounting Intern at PwC (NYC) - OUT (wrong track, unless user also interested)

**Target Universe Size:** 20-50 jobs

**Why This Size:**
- Investment banking is a niche market
- Top companies are limited (bulge bracket + elite boutiques)
- Location constraint (NYC/SF) further narrows
- Quality threshold removes low-quality postings
- This is a realistic, high-intent universe

---

#### Example 2: CS Student Pursuing SWE

**User Profile:**
- Major: Computer Science
- Career Interest: Software Engineering (or empty, inferred from major)
- Job Types: Internship, Full-Time
- Preferred Location: Remote, San Francisco, CA, Seattle, WA
- Graduation Year: 2025 (graduating this year)

**Universe Construction:**

**Layer 1:** All jobs in market (millions)

**Layer 2 - Hard Gates:**
- ✅ Career Domain: Software engineering/tech domain
- ✅ Job Type: Internship OR Full-Time (entry level)
- ✅ Location: Remote, SF, Seattle, or Remote
- ✅ Timing: Internships for current year OR entry-level full-time for new grad
- ✅ Quality: Real companies, good descriptions, recent

**Excluded:**
- ❌ Investment Banking roles (wrong domain)
- ❌ Part-time roles (not in jobTypes)
- ❌ Jobs in NYC (not in preferredLocation, unless remote)
- ❌ Senior/Lead roles (wrong seniority for new grad)
- ❌ Manager roles (wrong level)

**Layer 3 - Relevance Refinement:**
- ✅ Software Engineer Intern at Google (Remote) - IN
- ✅ Entry-Level Software Engineer at Stripe (SF) - IN
- ✅ Full-Stack Developer Intern at Meta (SF) - IN
- ❌ Data Scientist roles - OUT (unless user also interested, different track)
- ❌ DevOps Engineer roles - OUT (unless skills match)

**Target Universe Size:** 100-300 jobs

**Why This Size:**
- Software engineering is a large market
- Many companies hire SWE interns and new grads
- Remote option expands universe significantly
- Multiple locations (SF, Seattle) add more jobs
- Quality threshold still applies, but market is larger

---

#### Example 3: Senior Graduating This Year vs Sophomore

**Senior Profile (Graduating 2025):**
- Graduation Year: 2025
- Job Types: Full-Time
- Career Interest: Investment Banking

**Universe:**
- ✅ Entry-level full-time roles: Investment Banking Analyst, Financial Analyst
- ✅ New grad programs: Analyst programs, rotational programs
- ❌ Internships: OUT (wrong timing - too late)
- ❌ Senior roles: OUT (wrong level - need 2+ years experience)

**Target Universe:** 30-80 jobs (entry-level IB is competitive, limited openings)

---

**Sophomore Profile (Graduating 2027):**
- Graduation Year: 2027
- Job Types: Internship
- Career Interest: Investment Banking

**Universe:**
- ✅ Sophomore/Junior internships: Investment Banking Summer Analyst (sophomore programs)
- ✅ General internships: Analyst internships (for rising juniors)
- ❌ Full-time roles: OUT (too early)
- ❌ Senior internships: OUT (wrong level)

**Target Universe:** 10-30 jobs (sophomore IB internships are very limited, mostly bulge bracket)

**Key Difference:**
- Senior has broader universe (entry-level full-time is larger market than sophomore internships)
- But both are constrained by career domain (IB is niche)
- Location constraints further narrow both

---

### Target Universe Sizing Philosophy

**Ideal Universe Sizes:**
- **Niche markets (IB, PE, etc.):** 20-50 jobs
- **Broad markets (SWE, Consulting):** 100-300 jobs
- **Very broad markets (Marketing, Sales):** 200-500 jobs

**Why These Sizes:**
- **Too small (<20 jobs):** Risk of empty feed, suggests over-filtering or sparse market
- **Too large (>500 jobs):** Suggests under-filtering, too much noise, hard to maintain quality

**Size is a quality signal:**
- If universe is <10 jobs, we should tell user: "Market is sparse, consider broadening location/interests"
- If universe is >500 jobs, we should tighten filters or use stronger scoring

---

## 4️⃣ HARD GATING VS SOFT SCORING

### The Separation

**Hard Gates = Pre-Scoring Filters**
- Jobs that fail are **excluded entirely**
- No scoring occurs
- These are trust gates - if a job fails, showing it would damage credibility

**Soft Signals = Scoring Only**
- Jobs that pass hard gates are **ranked** by these signals
- Lower scores = lower in feed, but still shown
- These optimize for relevance within the acceptable universe

### Hard Gates (Pre-Scoring)

#### Gate 1: Career Domain Alignment
**Purpose:** Never show jobs in wrong career track

**Logic:**
```
IF careerInterests specified:
    job must be in careerInterest domain OR explicitly related to major
ELSE IF major specified:
    job must be in major domain OR adjacent domain (e.g., Finance → FinTech OK)
ELSE:
    Allow all domains (but require strong signals from resume/skills)
```

**Examples:**
- ✅ Finance major, IB interest → Investment Banking Analyst: PASS
- ❌ Finance major, IB interest → Software Engineer: FAIL
- ✅ Finance major, IB interest → FinTech SWE (if skills match): PASS (adjacent)
- ⚠️ Finance major, no interests → Software Engineer: FAIL (unless resume shows tech skills)

**Why Hard Gate:**
- Showing a Finance major a pure SWE role breaks trust
- User explicitly stated Investment Banking - showing unrelated jobs is noise
- This is not a preference issue, it's a domain mismatch

---

#### Gate 2: Job Type Match
**Purpose:** Never show wrong employment structure

**Logic:**
```
IF jobTypes = ["Internship"]:
    job.type must be "internship" OR "co-op" OR "summer analyst"
ELSE IF jobTypes = ["Full-Time"]:
    job.type must be "full-time" OR "entry level" OR "new grad"
ELSE IF jobTypes = ["Internship", "Full-Time"]:
    job.type must be one of above
```

**Examples:**
- ✅ User wants Internship → Investment Banking Summer Analyst: PASS
- ❌ User wants Internship → Full-Time Analyst: FAIL
- ✅ User wants ["Internship", "Full-Time"] → Either type: PASS

**Why Hard Gate:**
- User explicitly selected job types they want
- Showing wrong type wastes user's time (they can't apply to full-time as a sophomore)
- This is a direct filter request, not a preference

---

#### Gate 3: Location Alignment
**Purpose:** Never show jobs in cities user didn't select (unless remote)

**Logic:**
```
IF preferredLocation specified AND not empty:
    job.location must be in preferredLocation array OR job.remote = true
ELSE:
    Allow all locations (no constraint)
```

**Examples:**
- ✅ User wants NYC, SF → Job in New York, NY: PASS
- ✅ User wants NYC, SF → Remote job: PASS
- ❌ User wants NYC, SF → Job in Chicago, IL: FAIL
- ✅ User wants [] (no preference) → Any location: PASS

**Why Hard Gate:**
- User explicitly selected preferred locations
- Showing jobs in wrong cities breaks promise ("we only show jobs you can apply to")
- Remote is exception because it's location-agnostic

**Edge Case Handling:**
- If preferredLocation = ["New York, NY"] and job = "Manhattan, NY" → Normalize and match
- If preferredLocation = ["San Francisco"] and job = "San Francisco, CA" → Match

---

#### Gate 4: Seniority Eligibility
**Purpose:** Never show roles user is ineligible for based on graduation timing

**Logic:**
```
years_until_grad = graduationYear - currentYear

IF years_until_grad > 1:
    Block: "Senior", "Lead", "Manager", "Principal", "Director" roles
    Allow: Internships, co-ops, entry-level roles
ELSE IF years_until_grad = 1:
    Block: "Senior", "Lead", "Principal", "Director" roles
    Allow: Internships, "Associate", "Analyst", "Junior", entry-level
ELSE IF years_until_grad <= 0:
    Block: "Senior", "Lead", "Principal" (unless resume shows 2+ years experience)
    Allow: "Associate", "Analyst", "Junior", "Entry-level", "New grad"
```

**Examples:**
- ✅ Sophomore (2027) → Investment Banking Summer Analyst: PASS
- ❌ Sophomore (2027) → Senior Investment Banking Analyst: FAIL
- ✅ Senior (2025) → Entry-Level Analyst: PASS
- ❌ Senior (2025) → Senior Analyst (requires 3+ years): FAIL
- ⚠️ Senior (2025) with resume showing 2 years experience → Associate role: MAY PASS (soft signal)

**Why Hard Gate:**
- Showing senior roles to sophomores breaks trust (they can't get hired)
- User's graduation year is objective eligibility signal
- This prevents false hope and wasted applications

---

#### Gate 5: Quality Thresholds
**Purpose:** Never show spam, scams, or low-quality postings

**Logic:**
```
Block if:
- company name is generic ("Company", "Employer", "Confidential")
- description length < 100 chars (too short to be real)
- spam keywords present ("make money fast", "!!!", etc.)
- job age > 60 days (likely stale)
- company is known staffing agency (unless description is high-quality)
```

**Why Hard Gate:**
- Quality is table stakes - not showing spam is basic trust requirement
- Low-quality jobs damage brand credibility
- Users expect curated, real opportunities

---

### Soft Signals (Scoring Only)

#### Signal 1: Role Fit (0-40 points)
**What it measures:** How well the job title/description matches user's background

**Components:**
- Major alignment (0-15 points): Field affinity score
- Skills match (0-15 points): Resume skills in job description
- Experience relevance (0-10 points): Past experiences align with role

**Why Soft:**
- Jobs that pass hard gates are already in right domain
- This ranks within acceptable universe
- A Finance major seeing "Investment Banking Analyst" vs "Private Equity Analyst" - both pass hard gates, this determines order

---

#### Signal 2: Company Signal (0-20 points)
**What it measures:** Company prestige, quality, and alignment with user goals

**Components:**
- Target company status (0-10 points): Is this a company user would recognize/aspire to?
- Company quality (0-5 points): Size, reputation, growth trajectory
- Industry leadership (0-5 points): Is this company a leader in the field?

**Why Soft:**
- Not all users need/prefer top companies
- Some users prefer startups, some prefer established firms
- This is preference, not requirement
- But it's a strong signal for ranking (users generally prefer recognized brands)

---

#### Signal 3: Resume Alignment (0-25 points)
**What it measures:** How well user's resume matches job requirements

**Components:**
- Skills coverage (0-15 points): % of required skills user has
- Experience match (0-7 points): Past roles align with job requirements
- Projects/achievements (0-3 points): Relevant projects or accomplishments

**Why Soft:**
- Resume is evidence, not requirement
- User might be willing to learn missing skills
- This optimizes for "best fit" within acceptable jobs
- A user with 80% skill match vs 40% skill match - both can apply, but 80% ranks higher

---

#### Signal 4: Proximity to Graduation (0-5 points)
**What it measures:** Is the timing optimal for this user?

**Components:**
- Application window alignment (0-3 points): Is this the right time to apply?
- Start date alignment (0-2 points): Does start date align with graduation?

**Why Soft:**
- Timing is nuanced - some roles accept early applications
- User might be flexible on start date
- This is optimization, not requirement
- A job starting in June vs September - both might work, but June aligns better for May grad

---

#### Signal 5: Location Preference (0-5 points)
**What it measures:** Within acceptable locations, which is most preferred?

**Components:**
- Exact city match (0-3 points): Matches first preferredLocation
- Secondary city match (0-2 points): Matches other preferredLocation entries
- Remote bonus (0-1 point): Remote jobs get small boost (flexibility signal)

**Why Soft:**
- All jobs already passed location hard gate
- This ranks within acceptable locations
- User might be open to multiple cities, this indicates preference
- NYC job vs SF job when user listed both - both pass, this determines order

---

#### Signal 6: Career Interest Alignment (0-5 points)
**What it measures:** How closely does job align with specific career interests?

**Components:**
- Exact interest match (0-3 points): Job directly matches careerInterest term
- Adjacent interest match (0-2 points): Job in related domain to interest

**Why Soft:**
- Career domain hard gate already passed
- This ranks within acceptable domains
- "Investment Banking" vs "Private Equity" - both finance, this indicates preference
- User might be open to related tracks, this optimizes for closest match

---

### Hard vs Soft Summary

| Criterion | Type | Rationale | Example |
|-----------|------|-----------|---------|
| Career Domain | Hard Gate | Wrong domain = broken promise | Finance major seeing SWE role |
| Job Type | Hard Gate | Wrong type = can't apply | Internship seeker seeing full-time |
| Location | Hard Gate | Wrong city = can't relocate | NYC seeker seeing Chicago job |
| Seniority | Hard Gate | Wrong level = ineligible | Sophomore seeing Senior role |
| Quality | Hard Gate | Spam = trust damage | Scam job posting |
| Role Fit | Soft Signal | Ranks within acceptable universe | IB Analyst vs PE Analyst |
| Company Signal | Soft Signal | Preference, not requirement | Goldman vs boutique IB |
| Resume Alignment | Soft Signal | Evidence, not requirement | 80% skill match vs 40% |
| Timing | Soft Signal | Optimization, not requirement | June start vs September |
| Location Preference | Soft Signal | Ranks within acceptable cities | NYC vs SF (both acceptable) |
| Interest Alignment | Soft Signal | Ranks within acceptable domains | IB vs PE (both finance) |

---

## 5️⃣ REDESIGNED QUERY GENERATION LOGIC

### Core Principle

**Queries should be constructed to discover jobs that will pass hard gates, not to cast a wide net and filter later.**

This means:
- Location is PRIMARY in query construction (not post-fetch filtering)
- Career interests drive keyword selection (not just major)
- Job type is embedded in every query (not a separate filter)
- Seniority terms are excluded from queries (not filtered post-fetch)

### Query Generation Strategy

#### Primary Signal Hierarchy

**1. Location (FIRST - drives API calls)**
- Every query must include location constraint
- If `preferredLocation = ["NYC", "SF"]` → Generate separate queries per city OR use "NYC OR SF" if API supports
- If `preferredLocation = []` → Use "United States" (but this should be rare)

**2. Career Interests (SECOND - drives keywords)**
- If `careerInterests = ["Investment Banking"]` → Use IB-specific terms: "investment banking", "M&A", "capital markets"
- If `careerInterests = ["Software Engineering"]` → Use SWE terms: "software engineer", "developer", "full-stack"
- If `careerInterests = []` → Fall back to major-based inference

**3. Job Type (THIRD - embedded in query)**
- If `jobTypes = ["Internship"]` → Prefix all queries with "internship" or "summer analyst"
- If `jobTypes = ["Full-Time"]` → Prefix with "entry level" or "new grad"
- This is NOT a post-fetch filter - it's part of the search query

**4. Major (FOURTH - refines keywords)**
- Adds domain-specific terms: Finance → "analyst", "trader", "PE"
- Refines career interest keywords for specificity

**5. Skills (FIFTH - adds specificity)**
- Only if resume available
- Adds technical terms: "Python", "React", "Financial Modeling"
- Creates skill-pair queries: "Python React" for full-stack roles

### Query Construction Examples

#### Example 1: Finance Major, IB Interest, NYC/SF, Internship

**Old Approach (Broken):**
```
Query 1: "internship (Financial Analyst OR Investment Banking OR Private Equity)"
Location: "United States"  # WRONG - ignores preferredLocation
```

**New Approach (Fixed):**
```
Query 1 (NYC): "internship investment banking (\"Goldman Sachs\" OR \"JP Morgan\" OR \"Morgan Stanley\" OR \"Bank of America\")"
Location: "New York, NY"

Query 2 (SF): "internship investment banking (\"Goldman Sachs\" OR \"JP Morgan\" OR \"Morgan Stanley\")"
Location: "San Francisco, CA"

Query 3 (NYC): "internship (private equity OR asset management OR M&A analyst)"
Location: "New York, NY"

Query 4 (Remote): "remote internship investment banking"
Location: "United States"  # Remote jobs can be anywhere
```

**Key Differences:**
- ✅ Location embedded in query (not post-fetch filter)
- ✅ Career interest drives primary keywords ("investment banking" not just "finance")
- ✅ Top companies targeted (IB is company-driven market)
- ✅ Multiple queries per location (NYC and SF are separate markets)

---

#### Example 2: CS Major, SWE Interest, Remote/SF/Seattle, Internship + Full-Time

**New Approach:**
```
Query 1 (SF): "software engineer intern (\"Google\" OR \"Meta\" OR \"Apple\" OR \"Stripe\" OR \"Databricks\")"
Location: "San Francisco, CA"

Query 2 (Seattle): "software engineer intern (\"Amazon\" OR \"Microsoft\" OR \"Google\")"
Location: "Seattle, WA"

Query 3 (Remote): "remote software engineer (entry level OR new grad OR intern)"
Location: "United States"

Query 4 (SF): "full-stack developer (entry level OR new grad)"
Location: "San Francisco, CA"

Query 5 (Skills-based): "Python React (intern OR entry level)"
Location: "San Francisco, CA OR Seattle, WA OR Remote"
```

**Key Differences:**
- ✅ Location-specific queries (SF and Seattle are separate)
- ✅ Remote as separate query (different market dynamics)
- ✅ Job type embedded ("intern" vs "entry level" vs "new grad")
- ✅ Top companies for tech (company-driven market)
- ✅ Skills create additional queries (if resume available)

---

### Fallback Strategy

**If primary queries return <20 jobs:**

**Layer 1: Broaden Location (within preferredLocation)**
- If NYC returns 5 jobs, also query broader metro ("New York Metropolitan Area")
- Still within user's preferredLocation, just broader geography

**Layer 2: Broaden Career Interest (within domain)**
- If "Investment Banking" returns 5 jobs, also query "Private Equity", "Asset Management"
- Still within finance domain, adjacent tracks

**Layer 3: Remove Company Filters**
- If company-specific queries return few results, try general domain queries
- "internship investment banking" without company filters

**Layer 4: Inform User**
- If universe <10 jobs after broadening: "Market is sparse for your criteria. Consider: [suggestions]"
- Don't show irrelevant jobs to fill feed

**Never:**
- ❌ Query outside preferredLocation to get more jobs
- ❌ Query outside career domain to get more jobs
- ❌ Query wrong job types to get more jobs
- ❌ Show low-quality jobs just to have content

---

### Contrast with Major-Only Approach

**Old Approach (Major-Only):**
```
Query: "internship (Financial Analyst OR Investment Banking OR Private Equity OR Asset Management)"
Location: "United States"
Result: 500 jobs (includes random cities, wrong companies, irrelevant roles)
Post-fetch filtering: Try to filter to 50 jobs
Problem: Already wasted API calls, many irrelevant jobs, location ignored
```

**New Approach (Intent-Driven):**
```
Queries: 
- "internship investment banking" in NYC
- "internship investment banking" in SF  
- "internship private equity" in NYC
Location: Embedded in queries
Result: 30 jobs (already location-filtered, domain-filtered, type-filtered)
Post-fetch filtering: Only quality gates, no location/domain filtering needed
Benefit: Fewer API calls, higher relevance, user's intent respected
```

**Why New Approach is Better:**
1. **Efficiency:** Fewer API calls (only query what will pass gates)
2. **Relevance:** Jobs fetched already match intent (location, domain, type)
3. **Trust:** User sees jobs that align with their stated preferences
4. **Performance:** Less post-processing (gates already applied via query)
5. **Quality:** Can't "accidentally" show wrong jobs (they're never fetched)

---

## 6️⃣ REDEFINED ROLE OF SCORING

### What Scoring Is NOT Responsible For

**Scoring should NEVER try to fix:**
- ❌ **Location mismatches** - If job is in wrong city, it shouldn't have been fetched (hard gate)
- ❌ **Domain mismatches** - If job is in wrong career track, it shouldn't have been fetched (hard gate)
- ❌ **Type mismatches** - If job is wrong employment type, it shouldn't have been fetched (hard gate)
- ❌ **Seniority mismatches** - If job is wrong level, it shouldn't have been fetched (hard gate)
- ❌ **Quality issues** - If job is spam/low-quality, it shouldn't have been fetched (hard gate)

**Why This Matters:**
- Scoring is for ranking, not filtering
- If a job fails a hard gate, showing it breaks trust regardless of score
- Trying to "fix" mismatches with scoring is treating symptoms, not causes

### What Scoring IS Responsible For

**Scoring optimizes for: "Among jobs that could all be good fits, which are the BEST fits?"**

#### Responsibility 1: Role Fit Optimization
**Goal:** Rank jobs by how well they match user's specific background

**What it does:**
- Compares job requirements to user's resume (skills, experiences)
- Measures field alignment (major domain to job domain)
- Considers experience relevance (past roles to target role)

**Example:**
- User: Finance major, IB interest, has "Financial Modeling" and "Excel" skills
- Job A: Investment Banking Analyst (requires Financial Modeling, Excel) - Score: 85/100
- Job B: Investment Banking Analyst (requires Python, SQL) - Score: 65/100
- Both pass hard gates, but Job A ranks higher (better skill match)

**Why This Matters:**
- User wants to apply to jobs they're most qualified for
- Higher fit = higher application conversion = better outcomes

---

#### Responsibility 2: Company Signal Ranking
**Goal:** Prioritize companies that align with user's career goals and aspirations

**What it does:**
- Identifies target companies (companies that recruit in user's field/school tier)
- Ranks by company quality/prestige (if relevant to user's goals)
- Considers company growth/opportunity (startup vs established)

**Example:**
- User: Finance major, IB interest, top university
- Job A: Investment Banking Analyst at Goldman Sachs - Score: 90/100 (target company)
- Job B: Investment Banking Analyst at Boutique IB - Score: 70/100 (still good, but less recognized)
- Both pass hard gates, but Job A ranks higher (better company signal)

**Why This Matters:**
- Users generally prefer recognized, prestigious companies (especially in competitive fields)
- But this is preference, not requirement (boutique IBs are still valid)
- Scoring allows ranking without excluding valid options

---

#### Responsibility 3: Application Confidence
**Goal:** Help user feel confident about applying to ranked jobs

**What it does:**
- Higher scores = higher confidence user should apply
- Scores communicate fit quality to user
- Low scores (<40) indicate "might be a stretch" but still acceptable if passed gates

**Example:**
- Score 85+: "Strong match - you're well-qualified"
- Score 60-84: "Good match - worth applying"
- Score 40-59: "Possible match - consider if interested"
- Score <40: "Weak match - unlikely but possible" (but still passed gates, so show if universe is small)

**Why This Matters:**
- Users need to prioritize which jobs to apply to
- Scoring provides signal for application strategy
- But low scores don't mean "don't show" - they mean "lower priority"

---

#### Responsibility 4: Diversity Within Constraints
**Goal:** Show variety within acceptable universe (avoid over-clustering)

**What it does:**
- Prevents showing only one company type (e.g., only Goldman, no boutiques)
- Prevents showing only one role type (e.g., only IB Analyst, no PE)
- Balances high-scores with diversity (show top 3 Goldman jobs, then top 3 boutiques)

**Example:**
- User: IB interest
- Feed shouldn't be: [Goldman job, JP Morgan job, Morgan Stanley job, Bank of America job, Citi job...]
- Feed should be: [Goldman job, JP Morgan job, Boutique IB job, PE job, Asset Management job...]
- Diversity within acceptable universe

**Why This Matters:**
- Users benefit from seeing range of options
- Over-clustering on top companies limits discovery
- But diversity only within hard gates (still all IB/finance domain)

---

### How Scoring Interacts with User Trust

**High Trust Scenario:**
- All jobs pass hard gates (location, domain, type, seniority, quality)
- Scoring ranks by fit/quality
- User sees: "These are all jobs I could apply to, ranked by how good a fit they are"
- **Trust maintained:** Even if lower-ranked jobs aren't perfect, they're still acceptable

**Low Trust Scenario:**
- Jobs that fail hard gates get through (location mismatch, domain mismatch)
- Scoring tries to "fix" with low scores
- User sees: "Why is this Software Engineer job here? I want Investment Banking!"
- **Trust broken:** System showed something clearly wrong, even with low score

**Key Principle:**
- **Trust is binary per job:** Either it passes gates (trust maintained) or it doesn't (trust broken)
- **Scoring affects priority, not trust:** Low scores = lower priority, but still acceptable
- **Never trade trust for volume:** Better to show 10 perfect jobs than 50 jobs with 5 wrong ones

---

## 7️⃣ USER-FACING EXPERIENCE DESIGN

### Feed Size Philosophy

**Target Feed Size: 20-50 jobs**

**Rationale:**
- Enough to feel substantial (not empty)
- Small enough to be curated (not overwhelming)
- Quality over quantity - every job should feel intentional

**Dynamic Sizing:**
- If universe <20 jobs: Show all, add note: "These are all [domain] [type] jobs in [location] matching your criteria"
- If universe 20-50 jobs: Show top 20-30, indicate "X more jobs available" with pagination
- If universe >50 jobs: Show top 30, strong pagination, filters to narrow further

**Why Not Infinite Scroll:**
- Infinite scroll encourages "browsing" behavior
- We want "curated, high-intent" behavior
- Finite feed signals: "These are the jobs worth your time"

---

### Update Cadence

**Recommended: "Top Jobs This Week"**

**Model:**
- Feed updates weekly (refresh cache, fetch new postings)
- Show timestamp: "Updated [date] - Top jobs this week"
- Pagination allows seeing more, but primary view is "this week's best"

**Rationale:**
- Job market moves weekly (new postings, closed positions)
- Weekly cadence balances freshness with stability
- Users can refresh manually if needed
- "This week" creates urgency without being overwhelming

**Alternative (If Real-Time Needed):**
- Daily updates, but still finite feed (top 30 jobs today)
- "New today" badge on fresh postings
- But maintain quality gates (don't lower standards for freshness)

---

### Application Confidence Signal

**Visual Indicators:**

**High Confidence (Score 70+):**
- ✅ Green badge: "Strong Match"
- Text: "Your background aligns well with this role"
- CTA: "Apply Now - You're a strong candidate"

**Medium Confidence (Score 50-69):**
- ⚠️ Yellow badge: "Good Match"
- Text: "This role matches your interests and background"
- CTA: "Apply - Worth exploring"

**Lower Confidence (Score 40-49):**
- ℹ️ Blue badge: "Possible Match"
- Text: "This role is in your field, but may require additional skills"
- CTA: "Consider Applying - Review requirements"

**Why Show Scores:**
- Transparency builds trust
- Users can prioritize applications
- But all jobs shown are still "acceptable" (passed gates)

---

### Mental Model for Users

**How Users Should Interpret Recommendations:**

**Primary Interpretation:**
> "These are jobs that match my stated preferences (location, career interest, job type) and I'm qualified for (based on my graduation year and background). They're ranked by how good a fit they are."

**Secondary Interpretation:**
> "If I see a job here, I should feel confident it's worth applying to. The ranking tells me which ones I'm most qualified for, but all of them are viable options."

**What Users Should NOT Think:**
- ❌ "These are all the jobs I could possibly find" (no, these are curated)
- ❌ "Lower-ranked jobs are bad" (no, they're just less ideal fits)
- ❌ "I need to apply to all of them" (no, use ranking to prioritize)

**Trust Building:**
- User sees Investment Banking jobs in NYC/SF → "Yes, this matches what I want"
- User never sees random cities or wrong domains → "The system understands my intent"
- User sees ranking that makes sense → "I can trust the prioritization"

---

### Product Vision Statement

**For Users:**
> "Every time you open the job feed, you see a curated list of opportunities that match what you're looking for. You don't have to filter out noise or wonder 'why is this here?' You can trust that every job is worth your time to review. The ranking helps you prioritize, but you know that even lower-ranked jobs are still good fits."

**For the Company:**
> "We differentiate through precision, not volume. Our value is showing users the right jobs, not all jobs. Every irrelevant job damages our brand. Every perfect match builds trust and drives application conversion."

---

## 8️⃣ FAILURE MODES & GUARDRAILS

### Failure Mode 1: Sparse Markets

**Scenario:**
- User has very specific criteria: Investment Banking internship in NYC, sophomore eligible
- Universe after hard gates: 5 jobs
- Feed feels empty, user thinks system is broken

**Guardrails:**
1. **Transparency:** Show message: "We found 5 Investment Banking internships in NYC matching your criteria. This is a competitive market with limited openings."
2. **Suggestions:** Offer to broaden (but only if user explicitly opts in):
   - "Consider expanding to San Francisco?" (still within preferredLocation if user adds it)
   - "Consider Private Equity as well?" (adjacent domain, still finance)
3. **Never Lower Standards:** Don't show wrong jobs just to fill feed
4. **Alternative Signals:** If universe <10 jobs, highlight resume optimization or networking tips

**Example Message:**
> "We found 5 Investment Banking internships in New York matching your criteria. This is a highly competitive market. Consider: [Expand to San Francisco] [Include Private Equity roles] [Get notified when new jobs are posted]"

---

### Failure Mode 2: New Users Without Resumes

**Scenario:**
- User completes onboarding but doesn't upload resume
- Skills signal is empty (loses 30 points in scoring)
- Experience signal is empty (loses 15 points)
- Feed is less personalized, rankings may seem off

**Guardrails:**
1. **Onboarding Emphasis:** Make resume upload feel valuable, not optional
   - "Upload your resume to see personalized job matches ranked by your skills"
   - Show preview: "With resume: 50+ personalized matches | Without resume: 20 generic matches"
2. **Graceful Degradation:** System still works with major + career interests
   - Hard gates still apply (location, domain, type, seniority)
   - Scoring uses major alignment + career interest alignment (still 25-30 points possible)
3. **Progressive Enhancement:** Remind users to upload resume for better matches
   - In-feed CTA: "Upload resume to see jobs matched to your skills"
   - Show "Estimated match: 65/100 (would be 85/100 with resume)"
4. **Never Penalize:** Don't show worse jobs to users without resumes - show same jobs, just less personalized ranking

**Example Experience:**
- User without resume sees: "Top Investment Banking internships in NYC (ranked by company quality)"
- User with resume sees: "Top Investment Banking internships in NYC (ranked by your skills + company quality)"
- Both see same jobs, but ranking is more accurate with resume

---

### Failure Mode 3: Over-Filtering

**Scenario:**
- User has very restrictive criteria: IB internship, NYC only, specific companies
- Hard gates are too strict, universe is <5 jobs
- User thinks system is broken or market is dead

**Guardrails:**
1. **Gate Relaxation Rules:**
   - If universe <10 jobs after hard gates, suggest relaxing ONE constraint at a time
   - Never relax multiple gates simultaneously (maintains trust)
   - User must explicitly opt-in to relaxation
2. **Constraint Prioritization:**
   - Ask user: "Which is most important: [Location] [Career Domain] [Job Type] [Company]?"
   - Relax least important constraint first
3. **Informed Consent:**
   - "We found 3 jobs matching all your criteria. Would you like to see jobs in San Francisco as well? (still Investment Banking internships)"
   - User understands trade-off: more jobs, slightly broader location
4. **Never Auto-Relax:** Don't silently broaden filters - user must approve

**Example Flow:**
```
Universe: 3 jobs
Message: "We found 3 Investment Banking internships in New York matching all your criteria."

Option 1: "See more jobs in San Francisco too?" (relax location, keep domain/type)
Option 2: "Include Private Equity roles?" (relax domain slightly, keep location/type)
Option 3: "Keep current filters - notify me when new jobs are posted"
```

---

### Failure Mode 4: Career Interest Ambiguity

**Scenario:**
- User selects ambiguous career interest: "Business" or "Finance" (too broad)
- Hard gate is too permissive (allows many unrelated jobs)
- Or user selects very specific interest: "M&A Advisory" (too narrow, few jobs)

**Guardrails:**
1. **Interest Normalization:**
   - Map ambiguous terms to canonical categories
   - "Business" → Ask: "Which area? [Consulting] [Finance] [Operations] [Strategy]"
   - "Finance" → Infer: Finance/Banking/Investment (but show user what this means)
2. **Interest Hierarchy:**
   - If user selects "Investment Banking", also implicitly allow "Private Equity", "Asset Management" (adjacent)
   - But don't allow "Retail Banking" or "Accounting" (different tracks)
3. **Disambiguation in Onboarding:**
   - When user selects broad interest, show examples: "Finance includes: Investment Banking, Private Equity, Asset Management, Trading"
   - When user selects specific interest, confirm: "We'll show Investment Banking roles. Also interested in Private Equity?"
4. **Post-Onboarding Refinement:**
   - Allow users to refine interests later
   - "We noticed you're interested in Finance. Which areas? [Investment Banking] [Private Equity] [Trading] [Asset Management]"

**Example:**
- User selects "Finance" → System maps to ["Investment Banking", "Private Equity", "Asset Management", "Trading"]
- Hard gate allows all finance sub-domains
- But still blocks unrelated domains (Tech, Consulting, etc.)
- User can refine later if too broad

---

### Failure Mode 5: Location Edge Cases

**Scenario:**
- User selects "New York, NY" but jobs are posted as "Manhattan, NY" or "Brooklyn, NY"
- Or user selects "San Francisco" but jobs are "SF Bay Area" or "Palo Alto" (adjacent but different)
- Jobs get filtered out incorrectly

**Guardrails:**
1. **Location Normalization:**
   - Build location hierarchy: "New York, NY" includes Manhattan, Brooklyn, Queens, Bronx, Staten Island
   - "San Francisco, CA" includes SF city, but "SF Bay Area" requires user to explicitly select
   - Use geocoding APIs to map city names to coordinates, then match within radius
2. **Location Expansion Rules:**
   - If user selects city, include that city's metro area (within reason)
   - "New York, NY" → Include NYC metro (but not New Jersey unless user adds it)
   - "San Francisco, CA" → Include SF city only (Palo Alto is separate market, ask user)
3. **User Clarification:**
   - During onboarding: "New York, NY" → Show: "This includes Manhattan, Brooklyn, Queens, Bronx. Also interested in nearby areas like New Jersey or Long Island?"
   - Post-onboarding: "We found jobs in Manhattan and Brooklyn. Also show jobs in New Jersey?"
4. **Transparency:**
   - Show user what locations are included: "Showing jobs in: New York, NY (Manhattan, Brooklyn, Queens, Bronx)"

**Example:**
- User: "New York, NY"
- System normalizes: NYC metro (5 boroughs)
- Jobs in Manhattan, Brooklyn, Queens: ✅ PASS
- Jobs in Newark, NJ: ❌ FAIL (different metro, ask user first)
- Jobs in Palo Alto: ❌ FAIL (different city, ask user first)

---

### Failure Mode 6: Graduation Year Errors

**Scenario:**
- User enters wrong graduation year (typo: 2027 instead of 2026)
- Or user is non-traditional student (graduating later than expected)
- Hard gates filter out appropriate jobs (too strict) or allow inappropriate jobs (too lenient)

**Guardrails:**
1. **Validation:**
   - Check graduation year is within reasonable range (current year - 5 to current year + 5)
   - Flag if graduation year seems wrong: "You're graduating in 2027? That's [X] years away. Is this correct?"
2. **Flexibility for Non-Traditional:**
   - Allow user to specify: "I'm a non-traditional student - graduating later than typical"
   - Adjust seniority gates accordingly (but still enforce basic eligibility)
3. **Graduation Month Consideration:**
   - Use graduation month to refine timing: May 2026 grad can apply to Summer 2026 internships
   - December 2026 grad has different timeline than May 2026 grad
4. **User Override:**
   - Allow users to adjust: "I want to see [Internship] [Full-Time] roles even though I'm graduating in 2027"
   - But show warning: "These roles typically target [year] graduates. Still interested?"

**Example:**
- User: Graduation year 2027, but selects "Full-Time" job types
- System: "You're graduating in 2027, but you selected Full-Time roles. These typically target 2025-2026 graduates. Still show Full-Time roles?"
- User confirms → Adjust gates to allow entry-level full-time (but still block senior roles)

---

### Failure Mode 7: Resume Parsing Failures

**Scenario:**
- Resume parsing fails or is incomplete
- Skills/experiences not extracted correctly
- Scoring loses 30-45 points, rankings seem random

**Guardrails:**
1. **Fallback to Onboarding:**
   - If resume parsing fails, use onboarding data (major, career interests, skills if user entered them)
   - Don't penalize user for parsing failure
2. **Manual Override:**
   - Allow users to manually add skills/experiences if parsing fails
   - "We couldn't parse your resume. Add your key skills: [Input]"
3. **Progressive Parsing:**
   - Parse incrementally: Education first, then skills, then experience
   - If one section fails, use others
   - Show user: "We extracted your education and skills, but had trouble with experience. Add manually?"
4. **Transparency:**
   - Show user what was extracted: "Resume parsed: [Education ✅] [Skills ✅] [Experience ⚠️ Partial]"
   - Allow correction: "Edit extracted information"

**Example:**
- Resume parsing extracts: Major ✅, Skills ✅, Experience ❌ (failed)
- System uses: Major + Skills for scoring (loses 15 points from experience, but still 45 points possible)
- User sees: "Experience section couldn't be parsed. Add manually for better matches?"
- User adds 2 experiences → Scoring now uses full profile (60 points possible)

---

### Guardrail Summary

| Failure Mode | Guardrail Strategy | User Action Required? |
|--------------|-------------------|----------------------|
| Sparse Markets | Transparency + Suggestions | Opt-in to broaden |
| No Resume | Graceful degradation + Reminders | Upload resume (optional) |
| Over-Filtering | Constraint prioritization + Opt-in relaxation | Choose which constraint to relax |
| Ambiguous Interests | Normalization + Disambiguation | Refine interests |
| Location Edge Cases | Normalization + Hierarchy + Clarification | Confirm metro areas |
| Graduation Year Errors | Validation + Flexibility + Override | Confirm/correct year |
| Resume Parsing Failures | Fallback + Manual Override + Transparency | Add missing info |

**Principle:** Never silently fail or degrade experience. Always inform user, offer solutions, require opt-in for changes.

---

## CONCLUSION

### Why This Design Produces Better Recommendations

**1. Intent is Respected:**
- User's explicit preferences (location, career interest, job type) are hard constraints, not suggestions
- System can't "accidentally" show wrong jobs - they're filtered before scoring

**2. Trust is Maintained:**
- Every job shown passes all gates (location, domain, type, seniority, quality)
- Users never see "why is this here?" jobs
- Even lower-ranked jobs are still acceptable fits

**3. Efficiency is Improved:**
- Queries are constructed to fetch only relevant jobs (location-embedded, domain-specific)
- Fewer API calls, less post-processing, faster results
- Quality over quantity

**4. Scoring Has Clear Purpose:**
- Scoring ranks within acceptable universe, doesn't try to fix mismatches
- Users understand: "These are all good fits, ranked by how ideal they are"
- No confusion about what scores mean

**5. Failure Modes Have Guardrails:**
- Sparse markets → Transparency + opt-in suggestions
- Missing data → Graceful degradation + progressive enhancement
- Edge cases → Normalization + user clarification

### Key Architectural Shifts

**Old System:**
- Fetch broadly → Filter post-fetch → Score everything
- Location ignored in queries → Filtered later (often incorrectly)
- Career interests ignored in queries → Used only in scoring
- No hard gates → Scoring tries to fix everything

**New System:**
- Intent-driven queries → Hard gates → Score acceptable universe
- Location embedded in queries → Never fetch wrong locations
- Career interests drive queries → Domain alignment before scoring
- Hard gates prevent mismatches → Scoring optimizes within constraints

**Result:** Higher relevance, maintained trust, better user experience, higher application conversion.

---

**END OF REDESIGN DOCUMENT**

