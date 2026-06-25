# Autonomous Agent Upgrade: Perplexity + Firecrawl Deep Dive

**Date**: May 15, 2026
**Purpose**: How Perplexity and Firecrawl transform the autonomous networking agent from a PDL/SerpAPI wrapper into an intelligent research-driven autopilot

---

## Table of Contents

1. [What the Agent Is Today](#1-what-the-agent-is-today)
2. [The Five Executors — Current vs Upgraded](#2-the-five-executors)
3. [Upgrading the Planner](#3-upgrading-the-planner)
4. [New Agent Capabilities](#4-new-agent-capabilities)
5. [Architecture Changes](#5-architecture-changes)
6. [Implementation Plan](#6-implementation-plan)

---

## 1. What the Agent Is Today

The Agent is an **Elite-only autonomous networking autopilot** that runs on a daemon cycle without user interaction. It's a completely separate system from Scout.

### Architecture

```
Agent Daemon (hourly scan in wsgi.py)
    │
    ├── Scans all users with status="active"
    ├── Checks if nextCycleAt <= now
    │
    └── _run_cycle(uid, config)
            │
            ├── 1. Load user data + pipeline state from Firestore
            ├── 2. generate_action_plan() — Claude Sonnet plans the cycle
            ├── 3. Execute each planned action:
            │       ├── execute_find_and_draft()        → PDL search → email generation → Gmail drafts
            │       ├── execute_find_jobs()              → SerpAPI Google Jobs → save matches
            │       ├── execute_discover_companies()     → recommendation engine → find similar companies
            │       ├── execute_find_hiring_managers()   → PDL recruiter search → email generation
            │       └── execute_follow_up()              → nudge generation for stale outreach
            ├── 4. Save results to Firestore (agent_cycles, agent_actions, contacts)
            └── 5. Schedule next cycle
```

### Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `backend/app/services/agent_service.py` | ~900 | Orchestration: config CRUD, lifecycle, daemon, cycle runner |
| `backend/app/services/agent_planner.py` | ~250 | LLM-driven action planning (Claude Sonnet) |
| `backend/app/services/agent_actions.py` | ~700 | Five action executors |
| `backend/app/routes/agent.py` | ~180 | API routes (config, deploy, stats, approvals) |
| `connect-grow-hire/src/services/agent.ts` | ~290 | Frontend API client |
| `connect-grow-hire/src/pages/AgentPage.tsx` | ~100 | Dashboard page |
| `connect-grow-hire/src/components/agent/AgentSnapshot.tsx` | ~500 | Dashboard UI with live cycle progress |

### Config (Firestore: `users/{uid}/settings/agent_config`)

```
targetCompanies: ["Goldman Sachs", "McKinsey", "Google"]
targetIndustries: ["Investment Banking", "Consulting"]
targetRoles: ["Analyst", "Associate"]
targetLocations: ["New York", "Chicago"]
preferAlumni: true
weeklyContactTarget: 5
creditBudgetPerWeek: 100
approvalMode: "review_first" | "autopilot"
sendMode: "drafts_only" | "auto_send"
enableJobDiscovery: true
enableHiringManagers: true
enableCompanyDiscovery: true
followUpEnabled: true
followUpDays: 7
```

### What Happens Each Cycle

The planner (Claude Sonnet) looks at:
- Student profile (university, career track, graduation year)
- Target companies/industries/roles
- Current pipeline state (contacts per company, stale outreach, jobs found)
- Weekly progress vs target

Then outputs a JSON action plan like:
```json
[
  {"action": "find", "company": "Goldman Sachs", "title": "Analyst", "count": 3, "reason": "No contacts at GS yet"},
  {"action": "find_jobs", "company": "McKinsey", "role": "Business Analyst", "count": 5, "reason": "User targets consulting"},
  {"action": "discover_companies", "sourceCompany": "Bain", "reason": "Expand from known targets"},
  {"action": "find_hiring_managers", "company": "McKinsey", "jobTitle": "Business Analyst", "count": 2, "reason": "Jobs found, find HMs"},
  {"action": "follow_up", "contact_ids": ["abc123"], "reason": "Email sent 8 days ago, no reply"}
]
```

---

## 2. The Five Executors — Current vs Upgraded

### Executor 1: `execute_find_and_draft()` — Contact Discovery + Email

**Current flow** (`agent_actions.py` line 76):
```
PDL search (company + title + alumni + location)
    → filter duplicates against existing contacts
    → warmth scoring
    → batch_generate_emails() via OpenAI
    → save contacts to Firestore
    → create Gmail drafts
    → deduct 1 credit per contact
```

**What's missing**: The emails are generic. PDL gives us name, title, company, email — but nothing about what the person has done recently, what they care about, or what makes them interesting. The email generation has no research context.

**Upgraded flow with Perplexity + Firecrawl**:
```
PDL search (same as now)
    → filter duplicates (same)
    → NEW: Perplexity Sonar batch enrichment per contact:
    │     "What has {name}, {title} at {company} published, spoken about,
    │      or been mentioned in recently? What are their interests?"
    │     → Returns: recent_activity, talking_points, verified_current_role
    │
    → NEW: Firecrawl /scrape LinkedIn URLs (if available):
    │     → Extract: recent posts, interests, mutual connections context
    │
    → warmth scoring (same, but now with enrichment data)
    → batch_generate_emails() — NOW WITH ENRICHMENT CONTEXT
    │     Each email gets: person's recent activity, shared interests,
    │     specific talking points (not just "I see you work at X")
    │
    → save contacts + enrichment data to Firestore
    → create Gmail drafts
```

**Concrete code change** in `agent_actions.py`:

```python
def execute_find_and_draft(uid, action, config, user_data):
    # ... existing PDL search ...

    # NEW: Enrich contacts before email generation
    from app.services.perplexity_client import batch_enrich_contacts

    enrichment = batch_enrich_contacts(filtered)
    # enrichment = {
    #     0: {"talking_points": ["Published article on M&A trends", "Spoke at USC finance club"],
    #         "recent_activity": "Recently promoted to VP",
    #         "verified_role": True,
    #         "citations": ["https://..."]},
    #     1: {...},
    # }

    # Attach enrichment to contacts for email generation
    for idx, contact in enumerate(filtered):
        enrich = enrichment.get(idx, {})
        contact["enrichment_talking_points"] = enrich.get("talking_points", [])
        contact["enrichment_recent_activity"] = enrich.get("recent_activity", "")
        contact["enrichment_verified"] = enrich.get("verified_role", None)

    # Email generation now uses enrichment data
    email_results = batch_generate_emails(
        contacts=filtered,
        resume_text=resume_text,
        user_profile=user_profile,
        # ... existing params ...
        enrichment_data=enrichment,  # NEW parameter
    )
```

**The `batch_enrich_contacts()` function** in `perplexity_client.py`:

```python
def batch_enrich_contacts(contacts: list[dict]) -> dict[int, dict]:
    """Enrich contacts with real-time web data via Perplexity.

    Uses a shared cache so the same person isn't researched twice
    across different users' agent cycles.
    """
    from openai import OpenAI
    perplexity = OpenAI(api_key=PERPLEXITY_API_KEY, base_url="https://api.perplexity.ai")
    results = {}

    for idx, contact in enumerate(contacts):
        name = f"{contact.get('FirstName', '')} {contact.get('LastName', '')}".strip()
        company = contact.get('Company', '')
        title = contact.get('Title', '')

        # Check cache first (shared across users)
        cache_key = f"contact_enrich:{name.lower()}:{company.lower()}"
        cached = _check_enrichment_cache(cache_key)
        if cached:
            results[idx] = cached
            continue

        try:
            response = perplexity.chat.completions.create(
                model="sonar",  # Fast, cheap — $0.01 per contact
                messages=[{
                    "role": "user",
                    "content": f"Brief professional profile of {name}, {title} at {company}. "
                               f"What have they published, presented, or been mentioned in recently? "
                               f"What are their professional interests? Is this their current role? "
                               f"Keep it to 3-4 bullet points."
                }],
            )
            enrichment = {
                "talking_points": _parse_bullet_points(response.choices[0].message.content),
                "recent_activity": response.choices[0].message.content,
                "verified_role": "current" in response.choices[0].message.content.lower(),
                "citations": getattr(response, 'citations', []),
            }
            results[idx] = enrichment
            _set_enrichment_cache(cache_key, enrichment, ttl=7*24*3600)  # 7 day cache
        except Exception as e:
            logger.warning("Perplexity enrichment failed for %s: %s", name, e)
            results[idx] = {}

    return results
```

**Impact on email quality**:

Before (generic):
> Hi Sarah, I'm a junior at USC studying finance. I came across your profile and was impressed by your work at Goldman Sachs. I'd love to learn more about your experience in investment banking.

After (enriched):
> Hi Sarah, I'm a junior at USC studying finance. I read your recent piece on middle-market M&A trends in the Financial Times — your point about valuation compression in the current rate environment really resonated with what I'm studying in my corporate finance class. I'd love to hear your perspective on how these dynamics play out on the deal team level.

**This alone could double reply rates.**

---

### Executor 2: `execute_find_jobs()` — Job Discovery

**Current flow** (`agent_actions.py` line 338):
```
SerpAPI google_jobs search (role + company + location)
    → LLM generates "why this job?" match reasons
    → save to Firestore agent_jobs collection
    → 0 credits (no cost)
```

**What's missing**: SerpAPI returns Google Jobs snippets — title, company, location, short description. No actual job requirements, no salary info, no team details, no application deadlines. The "match reasons" are hallucinated from a job title, not real requirements.

**Upgraded flow**:
```
Perplexity Sonar search (replaces SerpAPI):
    "Find current {role} openings at {company} in {location}"
    with domain_filter: ["linkedin.com", "greenhouse.io", "lever.co", "workday.com"]
    with recency_filter: "month"
    → Returns: real job URLs with context
    │
    → Top 5 results: Firecrawl /scrape each posting URL:
    │     Schema: {title, requirements, nice_to_have, responsibilities,
    │              salary_range, team, hiring_manager_name, deadline}
    │
    → Match against user's resume using STRUCTURED requirements
    │     (not hallucinated match from a job title)
    │
    → Save enriched job data to Firestore
    → If hiring_manager_name found → auto-queue find_hiring_managers action
```

**Concrete code change**:

```python
def execute_find_jobs(uid, action, config, user_data):
    from app.services.perplexity_client import search_jobs_live
    from app.services.firecrawl_client import extract_job_posting

    company = action.get("company", "")
    role = action.get("role", "")
    location = config.get("targetLocations", ["United States"])[0]

    # Step 1: Perplexity finds real job postings (replaces SerpAPI)
    job_urls = search_jobs_live(
        query=f"{role} at {company}" if company else role,
        location=location,
        limit=10,
        domain_filter=["linkedin.com", "greenhouse.io", "lever.co",
                       "workday.com", "careers.google.com"]
    )

    # Step 2: Firecrawl extracts structured data from each posting
    enriched_jobs = []
    for job_url_info in job_urls[:5]:  # Top 5 to limit Firecrawl credits
        try:
            structured = extract_job_posting(job_url_info["url"])
            # structured = {title, company, location, salary_range, requirements, ...}
            structured["source_url"] = job_url_info["url"]
            structured["perplexity_summary"] = job_url_info.get("summary", "")
            enriched_jobs.append(structured)
        except Exception:
            # Fallback: use Perplexity's summary as the job data
            enriched_jobs.append(job_url_info)

    # Step 3: Match against resume using REAL requirements
    scored = _match_jobs_to_resume(enriched_jobs, user_data)

    # Step 4: Save to Firestore (with real requirements, salary, etc.)
    # ... same save logic but with richer data ...
```

**The `extract_job_posting()` function** in `firecrawl_client.py`:

```python
from firecrawl import FirecrawlApp
from pydantic import BaseModel
from typing import Optional, List

class JobPostingExtract(BaseModel):
    title: str
    company: str
    location: str
    employment_type: Optional[str]  # full-time, intern, contract
    salary_range: Optional[str]
    requirements: List[str]
    nice_to_have: List[str]
    responsibilities: List[str]
    team_or_department: Optional[str]
    hiring_manager: Optional[str]
    application_deadline: Optional[str]
    experience_level: Optional[str]

def extract_job_posting(url: str) -> dict:
    """Extract structured job data from a posting URL."""
    fc = FirecrawlApp(api_key=FIRECRAWL_API_KEY)
    result = fc.scrape_url(url, {
        "formats": ["extract"],
        "extract": {
            "schema": JobPostingExtract.model_json_schema(),
            "prompt": "Extract all job posting details. Focus on requirements and qualifications."
        }
    })
    return result.get("extract", {})
```

**Impact**: Job cards in the Agent dashboard go from "Software Engineer at Google — Mountain View, CA" to showing actual requirements, salary range, team, and a real fit score based on the student's resume vs. the actual stated requirements.

**Bonus**: If Firecrawl extracts a `hiring_manager` name from the posting, the planner can auto-add a `find_hiring_managers` action to the next cycle.

---

### Executor 3: `execute_discover_companies()` — Company Discovery

**Current flow** (`agent_actions.py` line 406):
```
get_recommendations(user_data) — internal recommendation engine
    → filter out companies user already targets
    → save to Firestore agent_companies collection
    → 0 credits
```

**What's missing**: The recommendation engine works from a static company list and user profile. It doesn't know which companies are actually hiring, which ones just raised funding, which ones are expanding to the student's target location, or which ones have a culture that matches the student's preferences.

**Upgraded flow**:
```
Perplexity Pro Search:
    "What {industry} companies in {location} are actively hiring {roles}?
     Focus on companies similar to {targetCompanies} that a {university}
     {career_track} student should target. Include companies that have
     recently raised funding, expanded, or announced new offices."
    → Returns: cited list of companies with context
    │
    → Top 5: Firecrawl /extract each company's website:
    │     Schema: {name, description, employee_count, founded, culture_keywords,
    │              careers_url, recent_news, offices}
    │
    → Score & rank by relevance to student profile
    → Save enriched company data to Firestore
```

**Concrete code change**:

```python
def execute_discover_companies(uid, action, config, user_data):
    from app.services.perplexity_client import discover_companies_live
    from app.services.firecrawl_client import extract_company_profile

    prof = user_data.get("professionalInfo", {})
    targets = config.get("targetCompanies", [])
    industries = config.get("targetIndustries", [])
    locations = config.get("targetLocations", [])
    roles = config.get("targetRoles", [])

    # Step 1: Perplexity discovers companies (replaces static recommendation engine)
    companies = discover_companies_live(
        industries=industries,
        locations=locations,
        roles=roles,
        similar_to=targets,
        university=prof.get("university", ""),
        career_track=prof.get("careerTrack", ""),
    )

    # Step 2: Firecrawl enriches top companies with website data
    enriched = []
    for co in companies[:5]:
        website = co.get("website")
        if website:
            try:
                profile = extract_company_profile(website)
                co.update(profile)
            except Exception:
                pass
        enriched.append(co)

    # Step 3: Filter, score, save (similar to current logic)
    # ...
```

**The `discover_companies_live()` function**:

```python
def discover_companies_live(industries, locations, roles, similar_to,
                            university, career_track):
    """Use Perplexity to find companies actively hiring."""
    perplexity = OpenAI(api_key=PERPLEXITY_API_KEY, base_url="https://api.perplexity.ai")

    similar_str = ", ".join(similar_to[:5]) if similar_to else "top firms"
    industry_str = ", ".join(industries[:3]) if industries else "various industries"
    location_str = ", ".join(locations[:3]) if locations else "major US cities"
    role_str = ", ".join(roles[:3]) if roles else "entry-level roles"

    response = perplexity.chat.completions.create(
        model="sonar-pro",
        messages=[{
            "role": "user",
            "content": f"Find 10 companies in {industry_str} in or near {location_str} "
                       f"that are actively hiring for {role_str}. "
                       f"Similar to companies like {similar_str}. "
                       f"Include companies that have recently raised funding, expanded, "
                       f"or are known for strong entry-level programs. "
                       f"For each, provide: name, website, why it's a good target, "
                       f"and any recent news."
        }],
        response_format={
            "type": "json_schema",
            "json_schema": {
                "schema": {
                    "type": "object",
                    "properties": {
                        "companies": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": {"type": "string"},
                                    "website": {"type": "string"},
                                    "industry": {"type": "string"},
                                    "reason": {"type": "string"},
                                    "recent_news": {"type": "string"},
                                    "hiring_signal": {"type": "string"}
                                }
                            }
                        }
                    }
                }
            }
        }
    )

    return json.loads(response.choices[0].message.content)["companies"]
```

**Impact**: Instead of recommending the same static list of consulting firms, the agent finds companies the student never heard of that are actively hiring, recently funded, and a genuine fit. The student opens their Agent dashboard and sees "Discovered: Alvarez & Marsal — just opened a Chicago office, hiring restructuring analysts, $95K-$115K range."

---

### Executor 4: `execute_find_hiring_managers()` — HM Discovery

**Current flow** (`agent_actions.py` line 474):
```
find_hiring_manager() from recruiter_finder.py
    → PDL person search with recruiter title patterns
    → rank by title/location match
    → generate personalized emails
    → create Gmail drafts
    → 5 credits per HM
```

**What's missing**: PDL data is stale. We don't know if the recruiter is actively hiring. We don't know what specific role they're recruiting for. We can't verify they're still at the company.

**Upgraded flow**:
```
PDL search (same starting point for email addresses)
    │
    → NEW: Perplexity Sonar verification per HM:
    │     "Is {name} still recruiting at {company}?
    │      What roles are they currently hiring for?
    │      Any recent LinkedIn posts about open positions?"
    │     → Verify active, get current role focus
    │
    → NEW: If job URL available, Firecrawl /extract the posting:
    │     → Get "reporting to" or "hiring manager" fields
    │     → This is the ACTUAL hiring manager, not a guess from PDL titles
    │
    → Generate emails with context about WHAT they're hiring for
    → Create Gmail drafts
```

**Concrete addition** to `execute_find_hiring_managers()`:

```python
# After PDL returns hiring manager candidates...

# NEW: Verify each HM is still active via Perplexity
from app.services.perplexity_client import verify_hiring_managers

verified_hms = verify_hiring_managers(hms, company, job_title)
# verified_hms = [
#     {"name": "Sarah Chen", "verified": True, "active_roles": ["BA", "Associate"],
#      "recent_post": "Excited to grow our Chicago team!", "confidence": "high"},
#     {"name": "John Smith", "verified": False, "note": "Left company 2 months ago"},
# ]

# Filter out HMs who left the company
active_hms = [hm for hm, v in zip(hms, verified_hms) if v.get("verified", True)]
```

**Impact**: No more emailing people who left the company 6 months ago. The student's agent only reaches out to verified, active hiring managers — and the email can reference what they're actually hiring for.

---

### Executor 5: `execute_follow_up()` — Smart Follow-ups

**Current flow** (`agent_actions.py` line 595):
```
Load stale contacts from Firestore
    → _generate_nudge_text() via nudge_service
    → save follow-up draft
    → 0 credits
```

**What's missing**: Follow-ups are generic. "Just checking in" or "Wanted to follow up on my previous email." No context about what's happened at the company since the original email, no new talking points.

**Upgraded flow**:
```
Load stale contacts
    │
    → NEW: For each contact, Perplexity fast-search:
    │     "Latest news about {company} in the last 2 weeks"
    │     → Returns: recent deals, announcements, leadership changes
    │
    → Generate follow-up with NEWS HOOK:
    │     "Hi Sarah, I saw Goldman just announced the {deal_name} — congrats
    │      to the team! I'm still very interested in learning about your
    │      experience in the M&A group..."
    │
    → Save enriched follow-up draft
```

**Concrete addition**:

```python
def execute_follow_up(uid, action, config, user_data):
    from app.services.perplexity_client import get_company_news_brief

    # ... existing contact loading ...

    for cid in contact_ids[:5]:
        contact = contacts_ref.document(cid).get().to_dict()
        company = contact.get("company", "")

        # NEW: Get recent company news for follow-up hook
        news_hook = ""
        if company:
            try:
                news = get_company_news_brief(company, timeframe="week")
                if news:
                    news_hook = news[0]  # Most relevant recent news item
            except Exception:
                pass

        # Generate nudge WITH news context
        nudge = _generate_nudge_text(
            contact, user_data,
            news_hook=news_hook  # NEW parameter
        )
```

**Impact**: Follow-ups become genuinely compelling instead of annoying check-ins. "I saw your firm just led the Series C for [company]" is 10x better than "Just following up."

---

## 3. Upgrading the Planner

The planner (`agent_planner.py`) currently uses Claude Sonnet to generate action plans. It works well but has no real-time intelligence. It plans based on the student's config and pipeline state — not on what's actually happening in the market.

### Current Planner Limitations

1. **No market awareness** — doesn't know if a target company just announced layoffs (should deprioritize) or a hiring surge (should prioritize)
2. **No timing intelligence** — doesn't know recruiting cycles (banking recruit in August, consulting in September)
3. **Static company suggestions** — cycles through target companies mechanically
4. **No competitive context** — doesn't know what roles are hot or cooling off

### Upgraded Planner

Add a **pre-planning research step** where Perplexity provides market context:

```python
def generate_action_plan(uid, config, user_data, pipeline_state):
    # NEW: Get market context before planning
    market_context = _get_market_context(config, user_data)

    prompt = _build_prompt(config, user_data, pipeline_state, market_context)
    raw_response = _call_claude(prompt)
    plan = _parse_plan(raw_response)
    return {"plan": plan, ...}

def _get_market_context(config, user_data):
    """Pre-planning research via Perplexity to inform the planner."""
    from app.services.perplexity_client import quick_search

    targets = config.get("targetCompanies", [])
    industries = config.get("targetIndustries", [])

    context = {}

    # 1. Check hiring activity for target companies
    if targets:
        company_str = ", ".join(targets[:5])
        hiring_intel = quick_search(
            f"Are {company_str} actively hiring entry-level roles right now? "
            f"Any hiring freezes, layoffs, or expansion announcements in the last month?"
        )
        context["hiring_intel"] = hiring_intel

    # 2. Industry recruiting cycle awareness
    if industries:
        industry_str = ", ".join(industries[:3])
        cycle_intel = quick_search(
            f"What is the current recruiting timeline for {industry_str}? "
            f"Are applications open? When do interviews typically happen?"
        )
        context["cycle_intel"] = cycle_intel

    return context
```

**Updated planner prompt** (add to `_build_prompt()`):

```
## Real-Time Market Intelligence (from web research)

### Hiring Activity
{market_context.get("hiring_intel", "Not available")}

### Recruiting Cycle
{market_context.get("cycle_intel", "Not available")}

## Additional Planning Rules
- If a company announced layoffs or hiring freeze, reduce contact count for that company
- If a company announced expansion or hiring surge, increase contact count
- Prioritize companies in active recruiting windows for the student's industry
- If the market context suggests a company is a particularly good target right now, explain why in the action's "reason" field
```

**Impact**: The planner becomes market-aware. If Goldman announces a hiring freeze, the agent deprioritizes it. If McKinsey opens a new Chicago office, the agent ramps up outreach. The student's agent is genuinely intelligent, not just mechanically cycling through a company list.

---

## 4. New Agent Capabilities

With Perplexity + Firecrawl, the Agent can do things that were previously impossible:

### A. Career Page Monitoring

New action type: `monitor_career_pages`

```python
def execute_monitor_career_pages(uid, action, config, user_data):
    """Crawl target company career pages for new postings."""
    from app.services.firecrawl_client import crawl_career_page

    company = action.get("company", "")
    careers_url = action.get("careersUrl", "")

    if not careers_url:
        # Use Perplexity to find the careers page
        from app.services.perplexity_client import quick_search
        result = quick_search(f"{company} careers page URL")
        careers_url = _extract_url(result)

    if careers_url:
        # Firecrawl crawls the career page
        jobs = crawl_career_page(careers_url, roles=config.get("targetRoles", []))
        # Returns: [{title, location, url, posted_date}]

        # Filter for relevant roles
        relevant = [j for j in jobs if _role_matches(j, config)]
        # Save to agent_jobs...
```

This finds jobs that aren't on Google Jobs yet — fresh postings directly from the company's career page.

### B. Contact Role Change Detection

New periodic task: `check_contact_freshness`

```python
def check_contact_freshness(uid):
    """Check if any saved contacts have changed roles."""
    from app.services.perplexity_client import verify_contact_role

    db = get_db()
    contacts = db.collection("users").document(uid).collection("contacts") \
                 .where("source", "==", "agent").stream()

    for doc in contacts:
        contact = doc.to_dict()
        name = f"{contact.get('firstName', '')} {contact.get('lastName', '')}".strip()
        company = contact.get("company", "")
        title = contact.get("jobTitle", "")

        if not name or not company:
            continue

        # Perplexity check (cached for 7 days per contact)
        verification = verify_contact_role(name, company, title)

        if verification.get("role_changed"):
            # Update contact record
            db.collection("users").document(uid).collection("contacts") \
              .document(doc.id).update({
                "roleChangeDetected": True,
                "newCompany": verification.get("new_company"),
                "newTitle": verification.get("new_title"),
                "roleChangeDetectedAt": datetime.now(timezone.utc).isoformat(),
            })
```

**Impact**: The Agent dashboard can show "Sarah Chen moved from Goldman Sachs to Centerview Partners" — a perfect re-engagement opportunity.

### C. Company News Alerts

Add to the cycle runner: before planning, check for company news that creates outreach opportunities.

```python
def _pre_cycle_intelligence(uid, config):
    """Gather intelligence before planning the cycle."""
    from app.services.perplexity_client import get_company_news_brief

    intelligence = {}
    for company in config.get("targetCompanies", [])[:5]:
        news = get_company_news_brief(company, timeframe="week")
        if news:
            intelligence[company] = {
                "news": news,
                "outreach_hooks": [n for n in news if _is_outreach_worthy(n)]
            }

    return intelligence
```

The planner can then use this intelligence to prioritize companies with fresh news and include news hooks in the email generation context.

---

## 5. Architecture Changes

### New files

```
backend/app/services/
├── perplexity_client.py          # NEW
│   ├── quick_search()            # Sonar — fast lookups ($0.01)
│   ├── pro_search()              # Sonar Pro — rich research ($0.03)
│   ├── deep_research()           # Deep Research — comprehensive ($0.10)
│   ├── batch_enrich_contacts()   # Contact enrichment for Agent
│   ├── search_jobs_live()        # Job search (replaces SerpAPI)
│   ├── discover_companies_live() # Company discovery
│   ├── verify_hiring_managers()  # HM verification
│   ├── verify_contact_role()     # Role change detection
│   ├── get_company_news_brief()  # Company news for follow-ups
│   └── get_market_context()      # Pre-planning intelligence
│
├── firecrawl_client.py           # NEW
│   ├── extract_job_posting()     # Structured job extraction
│   ├── extract_company_profile() # Company website extraction
│   ├── scrape_linkedin_profile() # LinkedIn data extraction
│   ├── crawl_career_page()       # Career page monitoring
│   └── scrape_url()              # Generic URL scraping
│
├── extraction_schemas.py         # NEW — Pydantic schemas
│   ├── JobPostingExtract
│   ├── CompanyProfileExtract
│   └── PersonProfileExtract
│
└── enrichment_cache.py           # NEW — shared Firestore cache
    ├── get_cached()
    ├── set_cached()
    └── CACHE_TTLS = {...}
```

### Modified files

| File | Changes |
|------|---------|
| `agent_actions.py` | Add enrichment calls to all 5 executors |
| `agent_planner.py` | Add market context to planning prompt |
| `agent_service.py` | Add pre-cycle intelligence, career page monitoring |
| `reply_generation.py` | Accept enrichment data for email personalization |
| `config.py` | Add PERPLEXITY_API_KEY, FIRECRAWL_API_KEY |
| `requirements.txt` | Add `firecrawl-py`, `perplexity-python` |

### Caching Strategy

Agent cycles run for many users on a schedule. We need aggressive shared caching:

```python
# In enrichment_cache.py
CACHE_TTLS = {
    "contact_enrichment": 7 * 86400,    # 7 days
    "company_news": 24 * 3600,          # 24 hours
    "company_profile": 7 * 86400,       # 7 days
    "job_posting": 6 * 3600,            # 6 hours
    "hiring_verification": 3 * 86400,   # 3 days
    "market_context": 12 * 3600,        # 12 hours
}

# Shared cache in Firestore: enrichment_cache/{hash}
# NOT per-user — if 10 students target Goldman, one Perplexity call serves all
```

### Cost Estimate (Agent-specific, per month)

Assuming 20 Elite users with agents, each running ~7 cycles/week:

| API Call | Per Cycle | Cycles/Month | Cost/Call | Monthly |
|----------|-----------|-------------|-----------|---------|
| Contact enrichment (Perplexity Sonar) | 3 contacts × 1 call | 560 | $0.01 | $17 |
| Job search (Perplexity Sonar) | 2 searches | 560 | $0.01 | $11 |
| Job posting extraction (Firecrawl) | 5 postings | 560 | $0.05 | $28 |
| Company discovery (Perplexity Pro) | 1 search | 560 | $0.03 | $17 |
| Company profile extraction (Firecrawl) | 3 pages | 560 | $0.05 | $28 |
| HM verification (Perplexity Sonar) | 2 HMs | 280 | $0.01 | $6 |
| Follow-up news hooks (Perplexity Sonar) | 3 contacts | 280 | $0.01 | $8 |
| Market context (Perplexity Sonar) | 1 call | 560 | $0.01 | $6 |
| **Total** | | | | **~$121/mo** |

With shared caching across users (same company researched once), this drops to roughly **$60-80/month** for the Agent specifically.

---

## 6. Implementation Plan

### Phase 1: Foundation (Days 1-3)

**Goal**: Create the API clients and caching layer.

1. Create `backend/app/services/perplexity_client.py`
   - `quick_search()`, `pro_search()` wrapper functions
   - OpenAI-compatible client pointing to `https://api.perplexity.ai`
   - Error handling with graceful fallback

2. Create `backend/app/services/firecrawl_client.py`
   - `extract_job_posting()`, `extract_company_profile()`, `scrape_url()`
   - Pydantic schema definitions
   - Timeout handling (Firecrawl can be slow)

3. Create `backend/app/services/enrichment_cache.py`
   - Firestore-based shared cache at `enrichment_cache/{hash}`
   - TTL enforcement
   - Cache-through pattern

4. Add env vars to `config.py`: `PERPLEXITY_API_KEY`, `FIRECRAWL_API_KEY`
5. Add `firecrawl-py` and `perplexity-python` to `requirements.txt`

**Test**: Manually call each function from Python REPL, verify responses.

### Phase 2: Contact Enrichment (Days 4-6)

**Goal**: Agent-found contacts get enriched before email generation.

1. Add `batch_enrich_contacts()` to `perplexity_client.py`
2. Modify `execute_find_and_draft()` in `agent_actions.py`:
   - Call enrichment after PDL search, before email generation
   - Pass enrichment data to `batch_generate_emails()`
3. Modify `batch_generate_emails()` in `reply_generation.py`:
   - Accept `enrichment_data` parameter
   - Include talking points and recent activity in email generation prompt
4. Save enrichment data to contact doc in Firestore

**Test**: Trigger an agent cycle, verify emails reference real person data. Compare email quality before/after.

### Phase 3: Job Discovery Upgrade (Days 7-9)

**Goal**: Jobs found by the agent have real requirements and salary data.

1. Add `search_jobs_live()` to `perplexity_client.py`
2. Add `extract_job_posting()` to `firecrawl_client.py` with `JobPostingExtract` schema
3. Modify `execute_find_jobs()` in `agent_actions.py`:
   - Replace SerpAPI with Perplexity job search
   - Add Firecrawl extraction for top results
   - Real resume matching against extracted requirements
4. Update `AgentSnapshot.tsx` to display richer job data (salary, requirements)

**Test**: Trigger a cycle with job discovery enabled. Verify structured job data in Firestore.

### Phase 4: Company Discovery Upgrade (Days 10-12)

**Goal**: Agent discovers companies with real market intelligence.

1. Add `discover_companies_live()` to `perplexity_client.py`
2. Add `extract_company_profile()` to `firecrawl_client.py`
3. Modify `execute_discover_companies()` in `agent_actions.py`
4. Update frontend company cards to show enriched data

**Test**: Verify discovered companies have real context, not just names.

### Phase 5: Planner Intelligence (Days 13-15)

**Goal**: Planner makes market-aware decisions.

1. Add `get_market_context()` to `perplexity_client.py`
2. Modify `generate_action_plan()` in `agent_planner.py`:
   - Call market context before building prompt
   - Include hiring intel and recruiting cycle info in prompt
3. Add new planner rules for market-aware planning

**Test**: Trigger cycles for companies with recent news. Verify planner adapts.

### Phase 6: HM Verification + Smart Follow-ups (Days 16-18)

**Goal**: Agent verifies hiring managers are active and follow-ups use news hooks.

1. Add `verify_hiring_managers()` to `perplexity_client.py`
2. Add `get_company_news_brief()` to `perplexity_client.py`
3. Modify `execute_find_hiring_managers()` to verify before emailing
4. Modify `execute_follow_up()` to include news hooks

**Test**: Verify HMs are filtered by active status. Verify follow-ups reference real news.

### Phase 7: New Capabilities (Days 19-22)

**Goal**: Career page monitoring and role change detection.

1. Add `crawl_career_page()` to `firecrawl_client.py`
2. Add `verify_contact_role()` to `perplexity_client.py`
3. Add `execute_monitor_career_pages()` to `agent_actions.py`
4. Add `check_contact_freshness()` to `agent_service.py`
5. Register new action type in planner
6. Add UI for role change alerts in AgentSnapshot

**Test**: End-to-end cycle with career page monitoring enabled.

### Phase 8: Frontend + Polish (Days 23-25)

**Goal**: Agent dashboard shows the enriched data.

1. Update `AgentSnapshot.tsx` to show:
   - Enrichment data on contact cards (talking points, verified status)
   - Structured job data (salary, requirements, fit score)
   - Company intelligence (hiring signals, news)
   - Role change alerts
   - News hooks on follow-up suggestions
2. Add citations/sources display
3. Cost monitoring dashboard (show Perplexity/Firecrawl spend per cycle)

---

## Summary: Before and After

| Capability | Before | After |
|-----------|--------|-------|
| **Contact emails** | Generic: "I saw you work at Goldman" | Personalized: "I read your article on M&A trends" |
| **Job discovery** | Google Jobs snippets, no requirements | Full structured postings with salary, team, requirements |
| **Company discovery** | Static recommendation list | Live market intelligence, hiring signals, funding news |
| **Hiring managers** | PDL title guess, may have left company | Verified active, know what they're hiring for |
| **Follow-ups** | "Just following up" | "Congrats on the Series C deal!" with news hook |
| **Planner** | Mechanically cycles through company list | Market-aware: deprioritizes freezes, ramps up hiring surges |
| **Career pages** | Not monitored | Crawled for fresh postings before Google indexes them |
| **Role changes** | Not detected | Alerts when contacts move — re-engagement opportunity |

**Bottom line**: The Agent goes from a mechanical PDL/SerpAPI wrapper that sends generic emails on a schedule, to an **intelligent research-driven autopilot** that reads the market, verifies its targets, personalizes every touchpoint, and adapts its strategy in real-time.

---

## Sources

- [Perplexity Agent API Quickstart](https://docs.perplexity.ai/docs/agent-api/quickstart)
- [Perplexity Agent API Presets](https://docs.perplexity.ai/docs/agent-api/presets)
- [Perplexity Search Filters](https://docs.perplexity.ai/docs/sonar/filters)
- [Perplexity API Pricing](https://docs.perplexity.ai/docs/getting-started/pricing)
- [Perplexity Python SDK](https://github.com/perplexityai/perplexity-py)
- [Firecrawl Agent Endpoint](https://www.firecrawl.dev/agent)
- [Firecrawl Extract Endpoint](https://www.firecrawl.dev/blog/mastering-firecrawl-extract-endpoint)
- [Firecrawl Python SDK](https://pypi.org/project/firecrawl-py/)
- [Firecrawl Lead Enrichment](https://www.firecrawl.dev/use-cases/lead-enrichment)
