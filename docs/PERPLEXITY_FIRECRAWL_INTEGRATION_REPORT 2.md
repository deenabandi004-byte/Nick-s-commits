# Perplexity + Firecrawl Integration Report for Offerloop

**Date**: May 15, 2026
**Purpose**: Deep analysis of how Perplexity's Sonar API and Firecrawl can dramatically improve every Offerloop workflow

---

## Table of Contents

1. [Tool Capabilities Summary](#1-tool-capabilities-summary)
2. [Current Data Sources & Gaps](#2-current-data-sources--gaps)
3. [Workflow-by-Workflow Integration Plan](#3-workflow-by-workflow-integration-plan)
4. [Agent Mode (Scout) — The Biggest Win](#4-agent-mode-scout--the-biggest-win)
5. [Architecture Recommendations](#5-architecture-recommendations)
6. [Cost Analysis](#6-cost-analysis)
7. [Implementation Priority](#7-implementation-priority)

---

## 1. Tool Capabilities Summary

### Perplexity Sonar API

Perplexity is no longer just an MCP server — they launched a full **Agent API** (Feb 2026) that's a managed runtime for agentic workflows. This is the bigger play for Offerloop.

| Model | Best For | Pricing |
|-------|----------|---------|
| **Sonar** | Quick factual lookups, contact/company verification | $1/1M tokens + $5-12/1K requests |
| **Sonar Pro** | Rich company research, detailed person profiles | $3/$15 per 1M tokens + $6-14/1K requests |
| **Sonar Reasoning Pro** | Complex analysis (fit scoring, strategy) | $2/$8 per 1M tokens |
| **Sonar Deep Research** | Comprehensive multi-source reports (coffee chat prep, company research) | $2/$8 tokens + $5/1K search queries |

**Key capabilities**:
- **Real-time web search grounded in citations** — every claim has a source URL
- **OpenAI SDK compatible** — drop-in replacement, just change `base_url` to `https://api.perplexity.ai`
- **Agent API presets**: `fast-search` (1 step), `pro-search` (3 steps), `deep-research` (10 steps), `advanced-deep-research` (10 steps, Claude Opus 4.6)
- **Built-in tools**: `web_search` (with domain filtering, recency, language) and `fetch_url`
- **Structured outputs** via Pydantic/Instructor — can return typed JSON
- **Domain allowlist/denylist** — up to 20 domains per request (e.g., only search LinkedIn, Glassdoor, company sites)

### Firecrawl

Firecrawl is a web scraping/extraction API purpose-built for AI agents. It handles JS rendering, anti-bot bypass, and returns clean markdown or structured JSON.

| Tool | Best For | Credits |
|------|----------|---------|
| **`/scrape`** | Single URL → clean markdown or structured JSON | 1 credit (5 with extraction) |
| **`/extract`** | Schema-based structured data from URLs | 5 credits |
| **`/search`** | Web search with full-page markdown per result | 1 credit/result |
| **`/crawl`** | Recursive site crawling (company career pages) | 1 credit/page |
| **`/map`** | Site structure discovery | 1 credit |
| **`/interact`** | Click buttons, fill forms, paginate | Variable |
| **`/agent`** | Autonomous research agent with schema output | Variable |
| **`/batch_scrape`** | Bulk URL scraping with rate limiting | 1 credit/URL |

**Key capabilities**:
- **Pydantic schema extraction** — define a `class Company(BaseModel)` and get exactly that shape back
- **JS rendering** — handles React/Angular SPAs, dynamic content, infinite scroll
- **Anti-bot bypass** — rotates proxies, handles CAPTCHAs, stealth mode
- **Autonomous `/agent`** — give it a prompt + optional schema, it searches/navigates/extracts autonomously
- **Fire Enrich** — open-source tool that takes emails → enriched company/person profiles
- **Batch processing** — hundreds of URLs in parallel
- **Python SDK**: `pip install firecrawl-py`

### How They Complement Each Other

| Need | Use Perplexity | Use Firecrawl |
|------|---------------|---------------|
| "What does this person do?" | Sonar search for person + company | — |
| "Scrape this company's about page" | — | `/scrape` with extraction schema |
| "Research this company for a coffee chat" | Deep Research preset | — |
| "Get structured job data from career page" | — | `/extract` with job schema |
| "What's the latest news about Bain?" | Sonar (real-time, cited) | — |
| "Extract all team members from company page" | — | `/agent` with person schema |
| "Is this person's LinkedIn profile accurate?" | Sonar to cross-reference | `/scrape` LinkedIn URL |

**Rule of thumb**: Perplexity for *understanding and researching*, Firecrawl for *extracting structured data from specific URLs*.

---

## 2. Current Data Sources & Gaps

### Current data pipeline per workflow

| Workflow | Current Sources | Current Limitations |
|----------|----------------|---------------------|
| **Find People** | People Data Labs (PDL) API, Hunter.io email verification | PDL data can be stale (months old). No real-time verification of current role. No company context beyond what PDL stores. |
| **Find Companies** | SerpAPI Google Search → OpenAI extraction | Relies on Google snippets — shallow company data. No structured extraction from company websites. No funding/culture/size verification. |
| **Hiring Managers** | PDL person search with recruiter title patterns | Same staleness as PDL. Can't verify if person is still in role. No insight into hiring activity or recent postings. |
| **Coffee Chat Prep** | SerpAPI (4 parallel searches: company news, overview, person mentions, industry trends) + OpenAI summarization | SerpAPI returns snippets, not full articles. No deep research capability. Person mentions often sparse. No real-time company announcements. |
| **Job Board** | SerpAPI Google Jobs | Limited job details. No structured extraction from actual job postings. No company research attached to listings. |
| **Tracker** | Gmail integration, Firestore state | No enrichment of tracked contacts. No automatic updates on contact role changes. No company news alerts. |
| **Scout (Agent)** | Jina Reader (URL fetching), SerpAPI (job search), OpenAI (conversation) | Jina Reader has 4.5s timeout, truncates at 15K chars. No structured extraction. No deep research mode. Limited to single-URL parsing. |

### The gaps, clearly

1. **Stale data everywhere** — PDL snapshots are months old, no real-time verification
2. **Shallow research** — SerpAPI returns snippets, not full-page content
3. **No structured extraction** — Everything is unstructured text passed to LLMs
4. **No deep research** — Coffee chat prep does surface-level SERP queries
6. **Scout is hobbled** — Jina Reader is slow, unreliable, and can't do multi-step research
7. **No company page scraping** — We never actually visit company websites for culture/values/team data
8. **No job posting parsing** — Job board shows SERP snippets, not actual requirements extracted from the posting

---

## 3. Workflow-by-Workflow Integration Plan

### 3.1 Find People (Contact Search)

**Current**: PDL API → contacts with name, title, company, email, LinkedIn, education
**File**: `backend/app/services/pdl_client.py`

**With Perplexity + Firecrawl**:

| Enhancement | Tool | How |
|-------------|------|-----|
| **Real-time role verification** | Perplexity Sonar | After PDL returns contacts, batch-verify: "Is {name} still {title} at {company}?" Sonar checks LinkedIn, company site, recent mentions |
| **Contact enrichment** | Perplexity Sonar | For each contact: "What has {name} published, spoken about, or been mentioned in recently?" Returns talking points for outreach |
| **Company context cards** | Firecrawl `/extract` | Scrape company about page with schema: `{mission, values, recent_news, team_size, culture_keywords}` |
| **LinkedIn profile extraction** | Firecrawl `/scrape` | If we have LinkedIn URL, extract structured profile data (recent posts, activity, interests) for email personalization |

**Impact**: Emails generated with enriched data will be dramatically more personalized. Instead of "I saw you work at Goldman Sachs," it becomes "I noticed your recent article on structured credit markets — as someone studying finance at USC..."

**Integration point**: Add a `perplexity_enrich_contact()` function in a new `backend/app/services/perplexity_client.py`. Call it from `pdl_client.py` after contact retrieval, before returning to the route.

```python
# Pseudocode for enrichment
from openai import OpenAI

perplexity = OpenAI(api_key=PERPLEXITY_API_KEY, base_url="https://api.perplexity.ai")

def enrich_contact(name, title, company):
    response = perplexity.chat.completions.create(
        model="sonar",
        messages=[{
            "role": "user",
            "content": f"What is {name}'s current role? Are they still {title} at {company}? "
                       f"What have they published or been mentioned in recently? "
                       f"What are their professional interests?"
        }]
    )
    return {
        "verified_role": True/False,
        "recent_activity": [...],
        "talking_points": [...],
        "citations": response.citations
    }
```

---

### 3.2 Find Companies (Firm Search)

**Current**: SerpAPI → OpenAI extracts company list from search snippets
**Files**: `backend/app/services/company_search.py`, `backend/app/services/serp_client.py`, `backend/app/services/firm_details_extraction.py`

**With Perplexity + Firecrawl**:

| Enhancement | Tool | How |
|-------------|------|-----|
| **Rich company discovery** | Perplexity Sonar Pro | Replace SerpAPI+OpenAI with single Sonar Pro call: "List consulting firms in Chicago with 50-500 employees" — returns cited, structured results |
| **Company detail pages** | Firecrawl `/extract` | For each firm, scrape their actual website with schema: `{name, description, offices, employee_count, industries, culture, careers_url, leadership_team, recent_news}` |
| **Competitive intel** | Perplexity Deep Research | "Compare {company} culture, compensation, and career progression for entry-level analysts" |
| **Career page crawling** | Firecrawl `/crawl` | Crawl company career pages to find open roles relevant to the student |
| **Funding/growth signals** | Perplexity Sonar | "Has {company} raised funding, expanded, or announced new offices recently?" |

**Impact**: Company cards go from basic (name, location, size) to rich profiles with culture fit indicators, growth signals, and open roles. Students can make informed decisions about where to network.

**Integration point**: Replace `transform_serp_company_to_firm()` in `company_search.py` with a two-step pipeline:
1. Perplexity Sonar Pro discovers companies (replaces SerpAPI + OpenAI extraction)
2. Firecrawl `/extract` enriches each company with website data

```python
# Firecrawl company extraction schema
from pydantic import BaseModel
from typing import Optional, List

class CompanyProfile(BaseModel):
    name: str
    description: str
    headquarters: Optional[str]
    employee_count: Optional[int]
    founded: Optional[int]
    industries: List[str]
    culture_keywords: List[str]
    careers_url: Optional[str]
    leadership: List[dict]  # [{name, title}]
    recent_news: List[str]

# Usage
from firecrawl import FirecrawlApp
fc = FirecrawlApp(api_key=FIRECRAWL_API_KEY)

result = fc.scrape_url("https://mckinsey.com/about", {
    "formats": ["extract"],
    "extract": {
        "schema": CompanyProfile.model_json_schema()
    }
})
```

---

### 3.3 Hiring Manager Finder

**Current**: PDL person search with recruiter title patterns → rank by title/location match
**File**: `backend/app/services/recruiter_finder.py`

**With Perplexity + Firecrawl**:

| Enhancement | Tool | How |
|-------------|------|-----|
| **Verify active recruiters** | Perplexity Sonar | "Is {name} still recruiting at {company}? Are they actively hiring for {role_type}?" |
| **Find hiring activity signals** | Perplexity Sonar | "Has {company} posted {role_type} jobs recently? Who is the hiring manager?" |
| **Extract from job postings** | Firecrawl `/extract` | Scrape actual job postings to find "hiring manager" or "reporting to" fields |
| **Company career page mining** | Firecrawl `/crawl` + `/extract` | Crawl career pages, extract job listings with schema: `{title, department, location, hiring_manager, posted_date}` |
| **LinkedIn recruiter activity** | Perplexity Sonar | "What roles has {recruiter_name} at {company} been posting about on LinkedIn?" |

**Impact**: Instead of guessing who the recruiter is from PDL title data, we can verify they're actively hiring and even identify the specific hiring manager from job postings.

**Integration point**: Add `verify_recruiter_activity()` to `recruiter_finder.py`. Call after PDL returns candidates, before ranking.

---

### 3.4 Coffee Chat Prep — Major Upgrade

**Current**: 4 parallel SerpAPI searches (company news, overview, person mentions, industry trends) → OpenAI summarization
**File**: `backend/app/services/coffee_chat.py`

This is where the integration shines brightest (after Scout).

**With Perplexity + Firecrawl**:

| Enhancement | Tool | How |
|-------------|------|-----|
| **Deep person research** | Perplexity Deep Research | "Research {name}, {title} at {company}. Find their career trajectory, publications, speaking engagements, interests, and any recent professional activity." — returns comprehensive, cited report |
| **Company deep dive** | Perplexity Deep Research | "Prepare a briefing on {company}'s {division} in {office}. Include recent deals/projects, leadership changes, strategic direction, and culture." |
| **Full article extraction** | Firecrawl `/scrape` | When Perplexity cites an article about the person/company, scrape the full text instead of relying on SerpAPI snippets |
| **Person's content** | Firecrawl `/scrape` | Scrape their blog posts, podcast transcripts, conference talks — real talking points |
| **Company culture page** | Firecrawl `/extract` | Extract values, DEI info, employee testimonials from company culture pages |
| **Industry report** | Perplexity Sonar Reasoning Pro | "What are the top 3 trends in {industry} that a {title} at {company} would care about?" |

**Impact**: Coffee chat prep goes from "here are some generic news articles" to a genuine deep research dossier. The student walks in knowing the person's recent work, the company's latest deals, and industry talking points.

**Integration point**: Replace `fetch_serp_research()` and `fetch_comprehensive_research()` in `coffee_chat.py`:

```python
# Before (4 SerpAPI searches returning snippets):
def fetch_comprehensive_research(company, industry, job_title, first_name, last_name, ...):
    # 4 GoogleSearch() calls → snippets → OpenAI summarization

# After (1 Perplexity Deep Research call):
def fetch_comprehensive_research(company, industry, job_title, first_name, last_name, ...):
    perplexity = OpenAI(api_key=PERPLEXITY_API_KEY, base_url="https://api.perplexity.ai")

    response = perplexity.chat.completions.create(
        model="sonar-deep-research",
        messages=[{
            "role": "user",
            "content": f"""Research {first_name} {last_name}, {job_title} at {company}.

            I need:
            1. Their career trajectory and current responsibilities
            2. Any publications, talks, or professional content they've created
            3. Recent company news about {company} (especially {division} in {office})
            4. Top {industry} trends relevant to their role
            5. Shared interests or connections I could reference

            I'm a college student preparing for a networking coffee chat."""
        }]
    )

    # Response comes with citations, structured sections, and real content
    return parse_deep_research_response(response)
```

This single call replaces:
- `_search_company_news()`
- `_search_company_overview()`
- `_search_person_mentions()`
- `_search_industry_trends()`
- `_summarise_article()` (no longer needed — Perplexity summarizes inline)
- `_generate_industry_overview()` (included in deep research)

**Bonus**: Use Firecrawl to follow up on Perplexity's citations — scrape the full text of the most relevant articles and include key quotes in the prep doc.

---

### 3.5 Job Board

**Current**: SerpAPI Google Jobs → snippet display
**File**: `backend/app/routes/job_board.py` (8800+ lines)

**With Perplexity + Firecrawl**:

| Enhancement | Tool | How |
|-------------|------|-----|
| **Rich job details** | Firecrawl `/extract` | When user clicks a job, scrape the actual posting with schema: `{title, company, location, salary_range, requirements, responsibilities, benefits, team, hiring_manager}` |
| **Company context** | Perplexity Sonar | "What's it like to work at {company} in {role}? Glassdoor rating, culture, growth opportunities?" |
| **Resume matching** | Firecrawl `/extract` → then local | Extract structured requirements, then match against user resume locally |
| **Smart recommendations** | Perplexity Sonar | "Based on {user_profile}, what types of roles at {company} would be the best fit?" |
| **Career page discovery** | Firecrawl `/crawl` | Crawl company career pages to find unlisted roles |

**Impact**: Job board goes from showing search snippets to showing full, structured job details with company context and fit analysis.

---

### 3.6 Network Tracker

**Current**: Firestore contacts + Gmail thread sync + stage management
**File**: `backend/app/services/outbox_service.py`

**With Perplexity + Firecrawl**:

| Enhancement | Tool | How |
|-------------|------|-----|
| **Contact freshness alerts** | Perplexity Sonar | Periodic check: "Has {contact_name} changed roles from {title} at {company}?" |
| **Company news alerts** | Perplexity Sonar | "Any major news about {company} in the last week?" — trigger nudge to re-engage contact |
| **Follow-up intelligence** | Perplexity Sonar | When a contact replies, enrich context: "What recent projects or news about {company} can I reference in my follow-up?" |
| **Auto-prep on reply** | Perplexity Deep Research | When a contact replies to schedule a meeting, auto-trigger deep research prep |

**Impact**: Tracker becomes proactive — alerting students when contacts change roles (time to re-engage) or when company news creates a natural follow-up opportunity.

**Integration point**: Add to the existing `_maybe_trigger_auto_prep()` function in `outbox_service.py`, and create a new periodic enrichment job.

---

## 4. Agent Mode (Scout) — The Biggest Win

Scout is currently hobbled by Jina Reader (4.5s timeout, unreliable, no structured extraction) and basic SerpAPI job searches. This is where Perplexity + Firecrawl create the most transformative upgrade.

### Current Scout Architecture

```
User message → Intent classification (URL_PARSE, JOB_SEARCH, FIELD_HELP, RESEARCH, CONVERSATION)
                    │
                    ├── URL_PARSE: Jina Reader (4.5s timeout, 15K char truncation)
                    ├── JOB_SEARCH: SerpAPI Google Jobs → format results
                    ├── RESEARCH: SerpAPI → OpenAI summarization
                    └── CONVERSATION: OpenAI with context
```

**Files**: `backend/app/services/scout_service.py` (3400 lines), `backend/app/services/scout_assistant_service.py` (1074 lines)

### Upgraded Scout Architecture

```
User message → Intent classification (expanded intents)
                    │
                    ├── URL_PARSE: Firecrawl /scrape + /extract (structured, reliable, fast)
                    ├── JOB_SEARCH: Perplexity Sonar (real-time job search with context)
                    ├── JOB_DEEP_DIVE: Firecrawl /extract (job posting) + Perplexity (company research)
                    ├── PERSON_RESEARCH: Perplexity Deep Research (full dossier)
                    ├── COMPANY_RESEARCH: Perplexity Pro + Firecrawl /extract (website)
                    ├── STRATEGY: Perplexity Reasoning Pro (networking strategy advice)
                    └── CONVERSATION: OpenAI/Anthropic with enriched context
```

### New Scout Capabilities

#### 1. URL Intelligence (replaces Jina Reader)

```python
# Before: Jina Reader
async def _fetch_url_content(self, url: str) -> Optional[str]:
    jina_url = f"{JINA_READER_URL}{url}"
    response = await client.get(jina_url, headers=headers, timeout=4.5)
    content = response.text[:15000]  # Truncated raw text
    return content

# After: Firecrawl structured extraction
async def _fetch_url_content(self, url: str) -> Optional[dict]:
    # Detect URL type and use appropriate schema
    if "linkedin.com/jobs" in url or "greenhouse.io" in url or "lever.co" in url:
        schema = JobPostingSchema  # {title, company, location, requirements, ...}
    elif "linkedin.com/in/" in url:
        schema = PersonProfileSchema  # {name, title, company, experience, ...}
    elif "linkedin.com/company" in url:
        schema = CompanySchema  # {name, industry, size, description, ...}
    else:
        schema = GenericPageSchema  # {title, main_content, key_points}

    result = firecrawl.scrape_url(url, {
        "formats": ["extract", "markdown"],
        "extract": {"schema": schema.model_json_schema()}
    })
    return result  # Structured data, not raw text
```

#### 2. Deep Research Mode

When a user asks Scout something like "Tell me everything about Jane Smith at Goldman Sachs" or "Help me prepare for my networking call with this person":

```python
async def _deep_research(self, query: str, context: dict) -> str:
    response = perplexity.chat.completions.create(
        model="sonar-deep-research",
        messages=[{
            "role": "system",
            "content": "You are a networking research assistant for college students. "
                       "Provide actionable intelligence for professional networking."
        }, {
            "role": "user",
            "content": query
        }]
    )
    # Returns comprehensive, cited research
    # Format for chat display with citations
    return format_research_for_scout(response)
```

#### 3. Smart Job Analysis

When a user pastes a job URL or asks about a role:

```python
async def _analyze_job(self, url: str, user_profile: dict) -> dict:
    # Step 1: Extract structured job data
    job_data = firecrawl.scrape_url(url, {
        "formats": ["extract"],
        "extract": {"schema": JobPostingSchema.model_json_schema()}
    })

    # Step 2: Company research
    company_intel = perplexity.chat.completions.create(
        model="sonar",
        messages=[{
            "role": "user",
            "content": f"Quick brief on {job_data['company']}: culture, interview process, "
                       f"what it's like for entry-level {job_data['title']}. "
                       f"Glassdoor rating, compensation range."
        }]
    )

    # Step 3: Fit analysis against user's resume
    fit = analyze_fit(job_data, user_profile)

    return {
        "job": job_data,
        "company_intel": company_intel,
        "fit_analysis": fit,
        "recommended_contacts": suggest_contacts_at_company(job_data["company"])
    }
```

#### 4. Networking Strategy Agent

Scout becomes a true agent that can plan multi-step networking strategies:

```python
# User: "I want to break into consulting at McKinsey in Chicago"
# Scout now can:
# 1. Research McKinsey Chicago office (Perplexity)
# 2. Find alumni at McKinsey from user's school (PDL)
# 3. Research each contact (Perplexity)
# 4. Suggest a networking sequence with personalized outreach angles
# 5. Prepare coffee chat talking points for each person
```

#### 5. Real-time Company Intelligence

```python
async def _company_intelligence(self, company: str) -> dict:
    # Perplexity for recent news and context
    intel = perplexity.chat.completions.create(
        model="sonar-pro",
        messages=[{
            "role": "user",
            "content": f"Latest news and developments at {company}. "
                       f"Focus on: hiring activity, office expansions, deals/projects, "
                       f"leadership changes, and culture signals. Last 30 days."
        }],
        search_recency_filter="month"
    )

    # Firecrawl for structured website data
    website_data = firecrawl.scrape_url(f"https://{company_domain}/about", {
        "formats": ["extract"],
        "extract": {"schema": CompanyProfile.model_json_schema()}
    })

    return merge_intelligence(intel, website_data)
```

### Scout Tool-Use Architecture

The most powerful upgrade is giving Scout **tool-use capabilities** — instead of just being a chatbot, Scout becomes an agent that can call Perplexity and Firecrawl as tools:

```python
SCOUT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "web_research",
            "description": "Search the web for real-time information about a person, company, or topic",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "depth": {"type": "string", "enum": ["quick", "standard", "deep"]},
                    "domain_filter": {"type": "array", "items": {"type": "string"}}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "scrape_url",
            "description": "Extract structured data from a specific URL",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string"},
                    "extract_type": {"type": "string", "enum": ["job_posting", "person_profile", "company_page", "article", "general"]}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_contacts",
            "description": "Search for professional contacts at a company using PDL",
            "parameters": {
                "type": "object",
                "properties": {
                    "company": {"type": "string"},
                    "title": {"type": "string"},
                    "location": {"type": "string"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "prepare_coffee_chat",
            "description": "Generate a coffee chat prep brief for a contact",
            "parameters": {
                "type": "object",
                "properties": {
                    "person_name": {"type": "string"},
                    "company": {"type": "string"},
                    "title": {"type": "string"}
                }
            }
        }
    }
]
```

This turns Scout from a chatbot into an **agentic assistant** that can research, search, extract, and prepare — all within the chat interface.

---

## 5. Architecture Recommendations

### New Service Files

```
backend/app/services/
├── perplexity_client.py     # NEW: Perplexity API wrapper
│   ├── quick_search()       # Sonar - fast factual lookups
│   ├── pro_search()         # Sonar Pro - rich research
│   ├── deep_research()      # Sonar Deep Research - comprehensive reports
│   ├── reasoning_query()    # Sonar Reasoning Pro - analysis
│   └── enrich_contact()     # Contact enrichment pipeline
├── firecrawl_client.py      # NEW: Firecrawl API wrapper
│   ├── scrape_url()         # Single URL scrape
│   ├── extract_structured() # Schema-based extraction
│   ├── crawl_site()         # Recursive crawl
│   ├── search_web()         # Web search with full content
│   └── batch_scrape()       # Bulk URL processing
├── enrichment_service.py    # NEW: Orchestrates enrichment across tools
│   ├── enrich_contact()     # PDL → Perplexity verify → Firecrawl LinkedIn
│   ├── enrich_company()     # Perplexity research → Firecrawl website
│   └── enrich_job()         # Firecrawl posting → Perplexity company intel
└── (existing services updated to call new clients)
```

### Environment Variables

```bash
# Add to .env
PERPLEXITY_API_KEY=pplx-...
FIRECRAWL_API_KEY=fc-...

# Optional tuning
PERPLEXITY_DEFAULT_MODEL=sonar           # Default for quick lookups
PERPLEXITY_RESEARCH_MODEL=sonar-deep-research  # For deep research
FIRECRAWL_TIMEOUT=30                     # Seconds
```

### Caching Strategy

Both APIs cost money per call. Implement aggressive caching:

```python
# In enrichment_service.py
CACHE_TTL = {
    "contact_enrichment": 7 * 24 * 3600,   # 7 days (people don't change roles daily)
    "company_research": 24 * 3600,          # 24 hours (news changes daily)
    "job_posting": 6 * 3600,                # 6 hours (postings update)
    "person_deep_research": 3 * 24 * 3600,  # 3 days
}

# Use Firestore subcollection: users/{uid}/enrichment_cache/{key}
# Or a shared cache: enrichment_cache/{hash} for non-user-specific data
```

### Graceful Degradation

Both services can fail. Every integration point should fall back to the current behavior:

```python
async def enrich_contact(contact, use_perplexity=True):
    try:
        if use_perplexity:
            return await perplexity_enrich(contact)
    except Exception as e:
        logger.warning(f"Perplexity enrichment failed: {e}")

    # Fallback to current behavior (no enrichment)
    return contact
```

---

## 6. Cost Analysis

### Perplexity Estimated Costs (per month, 300 active users)

| Use Case | Model | Est. Calls/Month | Cost/Call | Monthly Cost |
|----------|-------|-------------------|-----------|-------------|
| Contact enrichment (Find) | Sonar | 3,000 | ~$0.01 | $30 |
| Company research (Firms) | Sonar Pro | 1,000 | ~$0.03 | $30 |
| Coffee chat deep research | Deep Research | 500 | ~$0.10 | $50 |
| Scout quick searches | Sonar | 5,000 | ~$0.01 | $50 |
| Scout deep research | Deep Research | 200 | ~$0.10 | $20 |
| Tracker freshness checks | Sonar | 2,000 | ~$0.01 | $20 |
| **Total** | | | | **~$200/mo** |

### Firecrawl Estimated Costs

| Plan | Credits | Price | Enough For |
|------|---------|-------|------------|
| Hobby | 3,000 | $16/mo | Light usage — ~600 extractions |
| Standard | 100,000 | $99/mo | Full integration — ~20,000 extractions |
| Growth | 500,000 | $333/mo | Scale usage |

**Recommended**: Start with Standard ($99/mo) for ~20K extractions/month.

### Total Additional Cost: ~$300/month

Compare to current SerpAPI costs and the value of dramatically better data. This is well worth it at 41 paying subscribers ($9.99-$34.99/mo).

### Cost Optimization Strategies

1. **Cache aggressively** — same company researched by 10 students = 1 API call
2. **Lazy enrichment** — only enrich when user actually views details, not on search
3. **Tier gating** — Deep Research features (coffee chat) already cost credits, which naturally limits volume
4. **Shared cache** — company research is not user-specific
5. **Batch where possible** — Firecrawl `/batch_scrape` for bulk operations

---

## 7. Implementation Priority

### Phase 1: Foundation (Week 1-2)
1. **Create `perplexity_client.py`** — wrapper with Sonar/Pro/Deep Research methods
2. **Create `firecrawl_client.py`** — wrapper with scrape/extract/search methods
3. **Add env vars** and update `config.py`
4. **Caching layer** in Firestore

### Phase 2: Scout Agent Mode (Week 2-4) — HIGHEST IMPACT
1. **Replace Jina Reader** with Firecrawl `/scrape` in `scout_service.py`
2. **Add tool-use architecture** to Scout (web_research, scrape_url tools)
3. **Add deep research intent** — "research this person/company"
4. **Add smart URL parsing** — structured extraction for job/profile/company URLs
5. **Perplexity as Scout's brain for web queries** — replaces SerpAPI for research intent

### Phase 3: Coffee Chat Prep (Week 4-6)
1. **Replace `fetch_comprehensive_research()`** with Perplexity Deep Research
2. **Enrich prep docs** with Firecrawl follow-up on Perplexity citations

### Phase 4: Contact & Company Enrichment (Week 6-8)
1. **Contact enrichment pipeline** — Perplexity role verification after PDL
2. **Company enrichment** — Firecrawl website extraction for firm search
3. **Recruiter verification** — Perplexity hiring activity signals
4. **Email personalization boost** — use enrichment data in email generation

### Phase 5: Tracker Intelligence (Week 8-10)
1. **Contact freshness daemon** — periodic Perplexity checks for role changes
2. **Company news alerts** — Perplexity news monitoring for tracked companies
3. **Smart follow-up suggestions** — Perplexity context for follow-up emails

---

## Appendix: Key Integration Points (File Map)

| File | What Changes | Priority |
|------|-------------|----------|
| `backend/app/services/scout_service.py` | Replace Jina Reader, add tool-use, add deep research | P0 |
| `backend/app/services/coffee_chat.py` | Replace `fetch_serp_research()` and `fetch_comprehensive_research()` | P1 |
| `backend/app/services/company_search.py` | Add Firecrawl company extraction | P2 |
| `backend/app/services/firm_details_extraction.py` | Add Firecrawl website scraping | P2 |
| `backend/app/services/pdl_client.py` | Add Perplexity contact enrichment post-search | P2 |
| `backend/app/services/recruiter_finder.py` | Add Perplexity recruiter verification | P2 |
| `backend/app/services/reply_generation.py` | Use enriched contact data for better emails | P2 |
| `backend/app/services/outbox_service.py` | Add freshness checks, company news alerts | P3 |
| `backend/app/routes/job_board.py` | Add Firecrawl job posting extraction | P3 |
| `backend/app/config.py` | Add new API keys and config | P0 |
| `backend/requirements.txt` | Add `firecrawl-py`, update `openai` (for Perplexity) | P0 |

---

## Sources

- [Perplexity MCP Server Documentation](https://docs.perplexity.ai/docs/getting-started/integrations/mcp-server)
- [Perplexity Agent API Quickstart](https://docs.perplexity.ai/docs/agent-api/quickstart)
- [Perplexity Agent API Presets](https://docs.perplexity.ai/docs/agent-api/presets)
- [Perplexity Sonar API Quickstart](https://docs.perplexity.ai/docs/sonar/quickstart)
- [Perplexity API Pricing](https://docs.perplexity.ai/docs/getting-started/pricing)
- [Perplexity CTO on MCP vs APIs](https://awesomeagents.ai/news/perplexity-agent-api-mcp-shift/)
- [Perplexity Agent API Blog Post](https://www.perplexity.ai/hub/blog/agent-api-a-managed-runtime-for-agentic-workflows)
- [Firecrawl Official Site](https://www.firecrawl.dev/)
- [Firecrawl MCP Server (GitHub)](https://github.com/firecrawl/firecrawl-mcp-server)
- [Firecrawl Python SDK](https://pypi.org/project/firecrawl-py/)
- [Firecrawl Agent Endpoint](https://www.firecrawl.dev/agent)
- [Firecrawl Extract Endpoint Guide](https://www.firecrawl.dev/blog/mastering-firecrawl-extract-endpoint)
- [Firecrawl Scrape API Tutorial](https://www.firecrawl.dev/blog/mastering-firecrawl-scrape-endpoint)
- [Fire Enrich (GitHub)](https://github.com/firecrawl/fire-enrich)
- [Firecrawl Pricing](https://www.firecrawl.dev/pricing)
- [Firecrawl Lead Enrichment Use Case](https://www.firecrawl.dev/use-cases/lead-enrichment)
- [Firecrawl Deep Research Use Case](https://www.firecrawl.dev/use-cases/deep-research)
- [Firecrawl Job Board Scraping](https://www.firecrawl.dev/blog/scrape-job-boards-firecrawl-openai)
- [Perplexity + Pydantic Structured Outputs](https://python.useinstructor.com/integrations/perplexity/)
- [Sonar Deep Research Pricing](https://pricepertoken.com/pricing-page/model/perplexity-sonar-deep-research)
