# Agent Mode (Scout) Deep Dive: Perplexity + Firecrawl Integration

**Date**: May 15, 2026
**Purpose**: Comprehensive technical plan for upgrading Scout from a chatbot to a true research agent

---

## Table of Contents

1. [What Scout Is Today (Exact Code Mapping)](#1-what-scout-is-today)
2. [Why It's Limited](#2-why-its-limited)
3. [Perplexity Agent API — What It Actually Gives Us](#3-perplexity-agent-api)
4. [Firecrawl Agent — What It Actually Gives Us](#4-firecrawl-agent)
5. [The Upgrade: Intent by Intent](#5-the-upgrade-intent-by-intent)
6. [New Intents to Add](#6-new-intents-to-add)
7. [Tool-Use Architecture for Scout](#7-tool-use-architecture)
8. [Scout Assistant Service Upgrades](#8-scout-assistant-service-upgrades)
9. [Firm Assist Upgrades](#9-firm-assist-upgrades)
10. [Concrete Implementation Plan](#10-concrete-implementation-plan)

---

## 1. What Scout Is Today

Scout is **two separate services** that share the "Scout" brand:

### Service 1: Scout Job Search (`scout_service.py` — 3,515 lines)

This is the Cmd+K search assistant. It costs **5 credits per turn**.

**Entry point**: `handle_chat(message, context)` at line 278

**Intent classification** (line 340, `_classify_intent()`):
1. **Regex patterns first** (fast path):
   - URL detection: `https?://[^\s<>"{}|\\^`\[\]]+`
   - Job search: "find/search/look for jobs/roles/positions in location"
   - Field help: "What job title should I search for?"
   - Research: "What's the interview process at X?"
2. **LLM fallback** (GPT-4o-mini) when regex is ambiguous

**Five intents route to five handlers**:

| Intent | Handler | What Happens | Data Source | Limitation |
|--------|---------|-------------|-------------|------------|
| `URL_PARSE` | `_handle_url_parse()` | Fetches URL via Jina Reader → LLM extracts job fields | Jina Reader (`r.jina.ai/`) | 4.5s timeout, 15K char truncation, raw text only, no structured extraction |
| `JOB_SEARCH` | `_handle_job_search()` | Builds query → SerpAPI Google Jobs → format results | SerpAPI (`google_jobs` engine) | Only 10 results, Google Jobs snippets only, no actual posting content |
| `FIELD_HELP` | `_handle_field_help()` | LLM helps with form fields | OpenAI only | No web data, just LLM knowledge |
| `RESEARCH` | `_handle_research()` (line 2081) | SerpAPI organic search → 5 snippets → LLM summary | SerpAPI (`organic_results`) | **Snippets only** — 1-2 sentences per result. No full articles. 500 max tokens response. |
| `CONVERSATION` | `_handle_conversation()` | Multi-turn chat with history | OpenAI only | No web grounding. Pure LLM hallucination risk. |

**The RESEARCH handler is the most revealing** (lines 2081-2188):
```python
# Current: SerpAPI → snippets → LLM
search = GoogleSearch({"q": search_query, "api_key": SERPAPI_KEY, "num": 5})
results = await loop.run_in_executor(None, search.get_dict)
snippets = []
for result in results.get("organic_results", [])[:5]:
    snippet = result.get("snippet", "")  # 1-2 sentences!
    source = result.get("displayed_link", "")
    snippets.append(f"[{source}]: {snippet}")
research_context = "\n".join(snippets)  # Total: maybe 500 chars
# Then LLM generates 500-token response from these scraps
```

This is the core problem: **Scout's research is built on Google snippets, not actual web content.**

### Service 2: Scout Assistant (`scout_assistant_service.py` — 2,147 lines)

This is the product help assistant. It's **free** (no credits).

**Three tools** it can call (line 642, `SCOUT_TOOLS`):

| Tool | What It Does | Data Source |
|------|-------------|-------------|
| `search_saved_contacts` | Filters user's saved contacts | Firestore only |
| `generate_email_preview` | Drafts outreach email | OpenAI + user resume |
| `suggest_networking_strategy` | Networking advice | OpenAI + user profile + dream companies |

**No web access whatsoever.** The assistant works purely from a static knowledge base (PAGES dict, line 35) and the user's Firestore data.

### Service 3: Firm Assist (inside `scout_service.py`, line 2700)

Helps users with company search. Six action types:
- `generate_query` — builds search query from resume
- `refine_query` — narrows/widens search
- `recommend_firms` — suggests companies
- `research_firm` — researches a specific company
- `next_steps` — suggests what to do
- `general` — catch-all

**All powered by OpenAI only. No web access.** When a student asks "tell me about McKinsey," Scout generates an answer from LLM knowledge, not live data.

---

## 2. Why It's Limited

### The five critical gaps

**Gap 1: Jina Reader is unreliable and shallow**
- 4.5s hard timeout (line 715: `timeout=4.5`)
- 15K character truncation (line 720: `content[:15000]`)
- Returns raw markdown — no structured extraction
- No anti-bot bypass — fails on many job boards
- No JS rendering — misses dynamically loaded content

**Gap 2: Research is Google snippets, not real research**
- `_handle_research()` gets 5 organic results with 1-2 sentence snippets
- Total research context is ~500 characters
- LLM must hallucinate the rest with 500 max tokens
- No citations, no source verification
- No domain filtering (gets random SEO spam mixed in)

**Gap 3: No web access in assistant or firm modes**
- Scout Assistant can search saved contacts but can't look anything up online
- Firm Assist gives LLM-hallucinated company info
- "Tell me about Goldman Sachs culture" → pure hallucination

**Gap 4: No structured extraction from any URL**
- When a student pastes a Greenhouse/Lever job posting, Scout gets raw text
- No schema-based extraction of requirements, qualifications, salary
- No structured output — just unstructured text passed to LLM

**Gap 5: No deep/multi-step research**
- Every query is a single SerpAPI call → single LLM call
- No ability to search → read → search again → synthesize
- No following citations to get full article text
- No cross-referencing sources

---

## 3. Perplexity Agent API — What It Actually Gives Us

### SDK & Authentication

```python
# Install
pip install perplexity-python

# Initialize
from perplexity import Perplexity
client = Perplexity()  # reads PERPLEXITY_API_KEY from env

# OR use OpenAI-compatible interface (simpler migration)
from openai import OpenAI
client = OpenAI(api_key=PERPLEXITY_API_KEY, base_url="https://api.perplexity.ai")
```

### The Four Presets (and why they matter for Scout)

| Preset | Model | Steps | Tools | Max Tokens | Scout Use Case |
|--------|-------|-------|-------|------------|----------------|
| `fast-search` | xAI Grok | 1 | web_search | 4K | Quick fact checks: "Is Jane still at Goldman?" |
| `pro-search` | GPT-5.1 | 3 | web_search + fetch_url | 4K | Standard research: "What's the culture at Bain?" |
| `deep-research` | GPT-5.2 | 10 | web_search + fetch_url | 10K | Full dossier: "Research this person for my coffee chat" |
| `advanced-deep-research` | Claude Opus 4.6 | 10 | web_search + fetch_url | 10K | Complex analysis: "Compare these 3 firms for my profile" |

**All presets are overridable.** You can start with `pro-search` but change the model, add domain filters, or adjust token limits.

### Built-in Tools

**`web_search`** — the killer feature for Scout:
```python
response = client.responses.create(
    preset="pro-search",
    input="What is the interview process at McKinsey for business analyst roles?",
    tools=[{
        "type": "web_search",
        "search_domain_filter": ["glassdoor.com", "reddit.com", "mckinsey.com"],  # Up to 20 domains
        "search_recency_filter": "month",  # hour, day, week, month, year
        "search_context_size": "high",  # low, medium, high
    }]
)
```

This means Scout can:
- Search only Glassdoor + Reddit for interview questions
- Search only company websites for culture info
- Search only news sites for recent developments
- Filter by recency (critical for "latest news about X")

**`fetch_url`** — replaces Jina Reader:
```python
response = client.responses.create(
    preset="fast-search",
    input="Extract the job requirements from this posting",
    tools=[{"type": "fetch_url"}],
    # The model will use fetch_url to read the job posting page
)
```

This replaces `_fetch_url_content()` with something that:
- Has no 4.5s timeout limit
- Reads the full page, not 15K truncated chars
- Understands the content and extracts what matters
- Follows redirects and handles JS rendering (via Perplexity's infrastructure)

### Streaming Support

```python
stream = client.responses.create(
    preset="pro-search",
    input="Research McKinsey's Chicago office",
    stream=True
)
for event in stream:
    if event.type == "response.output_text.delta":
        print(event.delta, end="")  # Stream to frontend
    elif event.type == "response.completed":
        citations = event.response.citations  # Source URLs
```

This means Scout can **stream research results to the student in real-time** instead of waiting for the full response.

### Structured Output

```python
response = client.responses.create(
    preset="pro-search",
    input="What are the top 5 consulting firms hiring entry-level analysts in Chicago?",
    response_format={
        "type": "json_schema",
        "json_schema": {
            "schema": {
                "type": "object",
                "properties": {
                    "firms": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "open_roles": {"type": "integer"},
                                "glassdoor_rating": {"type": "number"},
                                "hiring_status": {"type": "string"}
                            }
                        }
                    }
                }
            }
        }
    }
)
```

This means Scout can return **structured, typed data** — not just free text.

### Citations

Every Perplexity response includes `response.citations` — a list of URLs that back up the claims. This is huge for Scout:
- Student asks "What's Goldman's culture like?"
- Scout answers with cited claims
- Student can click citations to verify

---

## 4. Firecrawl Agent — What It Actually Gives Us

### SDK & Authentication

```python
# Install
pip install firecrawl-py

# Initialize
from firecrawl import FirecrawlApp
fc = FirecrawlApp(api_key=FIRECRAWL_API_KEY)
```

### The Three Endpoints That Matter for Scout

#### 1. `/scrape` — Single URL → Clean Data (replaces Jina Reader)

```python
# Basic scrape (markdown)
result = fc.scrape_url("https://boards.greenhouse.io/stripe/jobs/12345", {
    "formats": ["markdown"]
})
# result["markdown"] = clean, readable content (no JS noise, no ads)

# Structured extraction
from pydantic import BaseModel
from typing import Optional, List

class JobPosting(BaseModel):
    title: str
    company: str
    location: str
    salary_range: Optional[str]
    requirements: List[str]
    nice_to_have: List[str]
    responsibilities: List[str]
    team: Optional[str]
    benefits: List[str]

result = fc.scrape_url("https://boards.greenhouse.io/stripe/jobs/12345", {
    "formats": ["extract"],
    "extract": {
        "schema": JobPosting.model_json_schema(),
        "prompt": "Extract the job posting details"
    }
})
# result["extract"] = {"title": "Software Engineer", "company": "Stripe", ...}
```

**Why this is better than Jina Reader**:
- Returns structured JSON, not raw text
- Handles JS rendering (Greenhouse, Lever, Workday all work)
- Anti-bot bypass built in
- No 15K char truncation — extracts what you need via schema
- Faster for structured data (LLM extraction happens server-side)

#### 2. `/search` — Web Search with Full Content

```python
result = fc.search("McKinsey interview process business analyst", {
    "limit": 5
})
# Each result includes FULL PAGE markdown, not just a snippet
for item in result["data"]:
    print(item["url"])
    print(item["markdown"][:500])  # Full page content available
```

**Why this matters for Scout's RESEARCH intent**: Instead of 5 Google snippets (500 chars total), Scout gets 5 full pages of content. The LLM can actually read the Glassdoor review, the Reddit thread, the blog post.

#### 3. `/agent` — Autonomous Research

```python
# Synchronous (waits for completion)
result = fc.agent(
    prompt="Find the hiring managers for software engineering at Stripe. "
           "Check their careers page and LinkedIn.",
    schema={
        "type": "object",
        "properties": {
            "hiring_managers": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "title": {"type": "string"},
                        "source": {"type": "string"}
                    }
                }
            }
        }
    }
)
# result = {"hiring_managers": [{"name": "...", "title": "...", "source": "..."}]}
```

The `/agent` endpoint can autonomously:
- Search the web
- Navigate to pages
- Follow links
- Extract data
- Return structured results

This is the closest thing to giving Scout "hands" — it can go do multi-step web research without us coding each step.

---

## 5. The Upgrade: Intent by Intent

### Intent: URL_PARSE

**Current** (line 702-757):
```
URL → Jina Reader (4.5s timeout) → raw text (15K chars) → GPT-4o-mini extracts fields
```

**Upgraded**:
```
URL → detect URL type → Firecrawl /scrape with type-specific schema → structured data
  │
  ├── Job posting URL (greenhouse, lever, workday, linkedin/jobs)
  │   → JobPosting schema → structured requirements, salary, team
  │   → THEN Perplexity fast-search: "Quick brief on {company}: culture, rating"
  │
  ├── LinkedIn profile URL (linkedin.com/in/)
  │   → PersonProfile schema → name, title, company, experience, interests
  │   → THEN Perplexity fast-search: "Recent activity/publications by {name}"
  │
  ├── Company URL (about page, careers page)
  │   → CompanyProfile schema → description, size, culture, open roles
  │
  └── Generic URL
      → Firecrawl /scrape markdown → pass to LLM for summary
```

**Schemas to define** (new file: `backend/app/services/extraction_schemas.py`):

```python
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
    reporting_to: Optional[str]
    benefits: List[str]
    application_deadline: Optional[str]

class PersonProfileExtract(BaseModel):
    name: str
    current_title: str
    current_company: str
    location: Optional[str]
    experience_summary: List[str]  # Last 3 roles
    education: List[str]
    interests: List[str]
    recent_activity: List[str]  # Posts, articles

class CompanyPageExtract(BaseModel):
    name: str
    description: str
    industry: str
    headquarters: Optional[str]
    employee_count: Optional[str]
    founded: Optional[str]
    mission: Optional[str]
    values: List[str]
    leadership: List[dict]
    careers_url: Optional[str]
```

**Integration point**: Replace `_fetch_url_content()` (line 702) and `_extract_job_details_from_content()` (line 759).

---

### Intent: JOB_SEARCH

**Current** (line 1635-1700):
```
Query → SerpAPI google_jobs → 10 results with title/company/location/snippet
```

**Upgraded**:
```
Query → Perplexity fast-search with structured output
  │
  ├── Perplexity searches real-time job boards, company career pages, LinkedIn
  │   (with domain filter: linkedin.com, glassdoor.com, indeed.com, greenhouse.io, lever.co)
  │
  ├── Returns structured: [{title, company, location, url, brief_description, salary_hint}]
  │
  └── For top 3 results: Firecrawl /scrape actual posting URL → full requirements
      (lazy-load on click, or prefetch top 3)
```

```python
async def _search_jobs_v2(self, query: str, location: str = None) -> List[dict]:
    """Search for jobs using Perplexity with real-time web grounding."""
    search_query = query
    if location:
        search_query += f" in {location}"

    response = perplexity.responses.create(
        preset="fast-search",
        input=f"Find current job openings for: {search_query}. "
              f"Return the top 10 most relevant results with direct application URLs.",
        tools=[{
            "type": "web_search",
            "search_domain_filter": [
                "linkedin.com", "greenhouse.io", "lever.co",
                "workday.com", "glassdoor.com", "indeed.com"
            ],
            "search_recency_filter": "month",
        }],
        response_format={
            "type": "json_schema",
            "json_schema": {
                "schema": {
                    "type": "object",
                    "properties": {
                        "jobs": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "title": {"type": "string"},
                                    "company": {"type": "string"},
                                    "location": {"type": "string"},
                                    "url": {"type": "string"},
                                    "salary_hint": {"type": "string"},
                                    "posted_date": {"type": "string"}
                                }
                            }
                        }
                    }
                }
            }
        }
    )
    return json.loads(response.output_text)["jobs"]
```

**Why this is better**: Perplexity searches the live web, not just Google Jobs index. It can find roles on company career pages that Google Jobs hasn't indexed yet.

---

### Intent: RESEARCH

**Current** (line 2081-2188):
```
Query → SerpAPI 5 organic results → snippets (500 chars total) → LLM 500-token summary
```

This is the **single biggest upgrade opportunity**. Currently Scout's research is embarrassingly thin.

**Upgraded — Three tiers**:

#### Tier 1: Quick Research (Perplexity `fast-search`)
For simple factual questions: "What's Goldman's dress code?" "How many rounds is the McKinsey interview?"

```python
async def _handle_research_quick(self, message: str, extracted: dict) -> ScoutResponse:
    response = perplexity.responses.create(
        preset="fast-search",
        input=message,
        tools=[{
            "type": "web_search",
            "search_recency_filter": "year",
            "search_context_size": "medium",
        }]
    )
    return ScoutResponse(
        status="ok",
        message=response.output_text,
        citations=[c.url for c in response.citations],
        context=context,
    )
```

**Cost**: ~$0.01. **Latency**: 1-3 seconds. **Quality**: 10x current (grounded in real web content with citations).

#### Tier 2: Standard Research (Perplexity `pro-search`)
For substantial questions: "What's it like working at Bain Chicago?" "What skills do I need for a PE associate role?"

```python
async def _handle_research_standard(self, message: str, extracted: dict) -> ScoutResponse:
    company = extracted.get("company")
    domain_filter = []
    if company:
        # Try to include company's domain + review sites
        domain_filter = ["glassdoor.com", "reddit.com", "blind.com"]

    response = perplexity.responses.create(
        preset="pro-search",  # 3 steps, web_search + fetch_url
        input=message,
        tools=[{
            "type": "web_search",
            "search_domain_filter": domain_filter if domain_filter else None,
            "search_recency_filter": "month",
            "search_context_size": "high",
        }]
    )
    return ScoutResponse(
        status="ok",
        message=response.output_text,
        citations=[c.url for c in response.citations],
        context=context,
    )
```

**Cost**: ~$0.03. **Latency**: 3-8 seconds. **Quality**: Includes content from multiple pages, cross-referenced.

#### Tier 3: Deep Research (Perplexity `deep-research`)
For comprehensive questions: "Research Jane Smith at Goldman Sachs for my coffee chat" "Compare McKinsey vs BCG vs Bain for someone with my background"

```python
async def _handle_research_deep(self, message: str, extracted: dict, user_profile: dict) -> ScoutResponse:
    # Build personalized research prompt
    context_str = ""
    if user_profile.get("school"):
        context_str += f"I'm a student at {user_profile['school']}. "
    if user_profile.get("major"):
        context_str += f"Studying {user_profile['major']}. "
    if user_profile.get("target_industry"):
        context_str += f"Targeting {user_profile['target_industry']}. "

    response = perplexity.responses.create(
        preset="deep-research",  # 10 steps, both tools, 10K tokens
        input=f"{context_str}\n\n{message}",
        instructions="You are a networking research assistant for college students "
                     "breaking into competitive industries. Provide actionable intelligence "
                     "with specific talking points, not generic advice. Always cite sources.",
        tools=[{
            "type": "web_search",
            "search_context_size": "high",
        }, {
            "type": "fetch_url"
        }],
        max_tokens=4096,
    )

    # Parse citations for display
    sources = []
    for citation in response.citations:
        sources.append({"url": citation.url, "title": citation.title})

    return ScoutResponse(
        status="ok",
        message=response.output_text,
        citations=sources,
        research_depth="deep",
        context=context,
    )
```

**Cost**: ~$0.10. **Latency**: 15-60 seconds. **Quality**: Comprehensive dossier with dozens of sources cross-referenced.

#### How to route between tiers:

```python
async def _handle_research(self, message: str, extracted: dict, context: dict) -> ScoutResponse:
    # Classify research depth needed
    depth = self._classify_research_depth(message)

    if depth == "deep":
        return await self._handle_research_deep(message, extracted, context)
    elif depth == "standard":
        return await self._handle_research_standard(message, extracted, context)
    else:
        return await self._handle_research_quick(message, extracted, context)

def _classify_research_depth(self, message: str) -> str:
    message_lower = message.lower()
    # Deep research triggers
    deep_triggers = [
        "research", "tell me everything", "deep dive", "prepare me for",
        "compare", "comprehensive", "full brief", "dossier",
        "coffee chat", "networking call", "meeting with"
    ]
    if any(trigger in message_lower for trigger in deep_triggers):
        return "deep"

    # Standard research triggers
    standard_triggers = [
        "what's it like", "culture", "interview process", "salary",
        "how is", "work-life", "growth", "career path"
    ]
    if any(trigger in message_lower for trigger in standard_triggers):
        return "standard"

    return "quick"
```

---

### Intent: CONVERSATION

**Current**: Pure OpenAI with conversation history, no web grounding.

**Upgraded**: Keep OpenAI/Anthropic as the conversation engine, but give it the ability to call Perplexity when it needs to verify a claim or look something up.

This is where **tool-use** comes in (see Section 7).

---

## 6. New Intents to Add

The current 5 intents are limiting. With Perplexity + Firecrawl, Scout should recognize:

| New Intent | Trigger | What Happens |
|------------|---------|-------------|
| `PERSON_RESEARCH` | "Tell me about [name] at [company]" | Perplexity deep-research on the person |
| `COMPANY_DEEP_DIVE` | "Research [company] for me" | Perplexity pro-search + Firecrawl company page |
| `JOB_DEEP_DIVE` | "Analyze this job posting" (after URL_PARSE) | Firecrawl extract + Perplexity company context + fit analysis |
| `NETWORKING_PLAN` | "Help me network into [company/industry]" | Multi-step: research → find contacts → suggest sequence |
| `NEWS_CHECK` | "What's the latest at [company]?" | Perplexity fast-search with recency=week |

**Updated intent classification**:

```python
IntentType = Literal[
    "URL_PARSE",
    "JOB_SEARCH",
    "JOB_DEEP_DIVE",
    "PERSON_RESEARCH",
    "COMPANY_DEEP_DIVE",
    "NETWORKING_PLAN",
    "NEWS_CHECK",
    "FIELD_HELP",
    "RESEARCH",
    "CONVERSATION",
]
```

**New regex patterns**:

```python
# Person research
person_patterns = [
    r'\b(tell me about|research|look up|who is)\b\s+[A-Z][a-z]+\s+[A-Z][a-z]+',
    r'\b(prepare me for|coffee chat with|meeting with)\b.*[A-Z][a-z]+',
]

# Company deep dive
company_deep_patterns = [
    r'\b(research|deep dive|tell me about|what do you know about)\b.*\b(company|firm)\b',
    r'\b(research|deep dive|tell me about)\b\s+(McKinsey|Goldman|JPMorgan|Bain|BCG|...)',
]

# News check
news_patterns = [
    r'\b(latest|recent|news|what.s new|updates?)\b.*\b(at|about|from)\b',
]

# Networking plan
network_patterns = [
    r'\b(help me network|networking (plan|strategy)|break into|get into)\b',
    r'\b(who should I (reach out|contact|email))\b',
]
```

---

## 7. Tool-Use Architecture for Scout

The most transformative change is giving Scout's LLM backbone the ability to **call tools mid-conversation**. Instead of rigid intent → handler routing, the LLM can decide when to search, scrape, or look up data.

### Current Scout Assistant tools (3 tools, Firestore-only):

```
search_saved_contacts  → Firestore query
generate_email_preview → OpenAI generation
suggest_networking_strategy → OpenAI generation
```

### New Scout tools (8 tools, web-enabled):

```python
SCOUT_AGENT_TOOLS = [
    # === Web Research (Perplexity) ===
    {
        "type": "function",
        "function": {
            "name": "web_research",
            "description": "Search the web for real-time information about a person, "
                          "company, industry, or any topic. Returns cited, grounded results. "
                          "Use for: company culture, interview process, person background, "
                          "industry trends, hiring activity, news.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The research query"
                    },
                    "depth": {
                        "type": "string",
                        "enum": ["quick", "standard", "deep"],
                        "description": "quick=1 search step, standard=3 steps, deep=10 steps"
                    },
                    "domain_filter": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Only search these domains (e.g., ['glassdoor.com', 'reddit.com'])"
                    },
                    "recency": {
                        "type": "string",
                        "enum": ["hour", "day", "week", "month", "year"],
                        "description": "Only return results from this time period"
                    }
                },
                "required": ["query"]
            }
        }
    },

    # === URL Extraction (Firecrawl) ===
    {
        "type": "function",
        "function": {
            "name": "extract_from_url",
            "description": "Extract structured data from a specific URL. Works with "
                          "job postings, LinkedIn profiles, company pages, articles. "
                          "Handles JS-rendered pages and anti-bot protection.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The URL to extract data from"
                    },
                    "extract_type": {
                        "type": "string",
                        "enum": ["job_posting", "person_profile", "company_page", "article", "general"],
                        "description": "What type of page this is (determines extraction schema)"
                    }
                },
                "required": ["url", "extract_type"]
            }
        }
    },

    # === Contact Search (PDL) ===
    {
        "type": "function",
        "function": {
            "name": "find_professionals",
            "description": "Search for professionals at a company to network with. "
                          "Returns name, title, email, LinkedIn URL. Use when the student "
                          "wants to find people to reach out to.",
            "parameters": {
                "type": "object",
                "properties": {
                    "company": {"type": "string"},
                    "title": {"type": "string", "description": "Job title or role"},
                    "location": {"type": "string"},
                    "school": {"type": "string", "description": "Alumni filter"}
                },
                "required": ["company"]
            }
        }
    },

    # === Saved Contacts (Firestore) ===
    {
        "type": "function",
        "function": {
            "name": "search_saved_contacts",
            "description": "Search the user's saved contacts by company, title, name, or status.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "company": {"type": "string"},
                    "status": {"type": "string", "enum": ["needs_attention", "active", "done"]}
                }
            }
        }
    },

    # === Email Drafting ===
    {
        "type": "function",
        "function": {
            "name": "draft_outreach_email",
            "description": "Generate a personalized outreach email to a professional. "
                          "Uses the student's resume and any research context.",
            "parameters": {
                "type": "object",
                "properties": {
                    "recipient_name": {"type": "string"},
                    "recipient_title": {"type": "string"},
                    "recipient_company": {"type": "string"},
                    "context": {"type": "string", "description": "Any context about why reaching out"}
                },
                "required": ["recipient_name", "recipient_company"]
            }
        }
    },

    # === Company News (Perplexity) ===
    {
        "type": "function",
        "function": {
            "name": "get_company_news",
            "description": "Get the latest news about a company. Use for conversation "
                          "starters, follow-up topics, or staying informed.",
            "parameters": {
                "type": "object",
                "properties": {
                    "company": {"type": "string"},
                    "timeframe": {"type": "string", "enum": ["week", "month", "quarter"]}
                },
                "required": ["company"]
            }
        }
    },

    # === Coffee Chat Prep (Perplexity Deep Research) ===
    {
        "type": "function",
        "function": {
            "name": "prepare_coffee_chat",
            "description": "Generate a comprehensive coffee chat prep brief. "
                          "Researches the person, their company, and suggests talking points.",
            "parameters": {
                "type": "object",
                "properties": {
                    "person_name": {"type": "string"},
                    "title": {"type": "string"},
                    "company": {"type": "string"},
                    "division": {"type": "string"},
                    "office": {"type": "string"}
                },
                "required": ["person_name", "company"]
            }
        }
    },

    # === Networking Strategy ===
    {
        "type": "function",
        "function": {
            "name": "suggest_networking_strategy",
            "description": "Create a networking strategy for breaking into a company or industry.",
            "parameters": {
                "type": "object",
                "properties": {
                    "target": {"type": "string", "description": "Company or industry name"},
                    "goal": {"type": "string", "description": "What the student wants (internship, full-time, etc.)"}
                },
                "required": ["target"]
            }
        }
    },
]
```

### How tool execution works:

```python
async def handle_chat_with_tools(self, message: str, context: dict) -> ScoutResponse:
    """Scout chat with tool-use capabilities."""
    messages = self._build_messages(message, context)

    # First LLM call — may request tool calls
    response = await openai.chat.completions.create(
        model="gpt-4o",  # Need a model that supports tool-use well
        messages=messages,
        tools=SCOUT_AGENT_TOOLS,
        tool_choice="auto",  # LLM decides when to use tools
    )

    # Process tool calls if any
    while response.choices[0].message.tool_calls:
        tool_calls = response.choices[0].message.tool_calls
        messages.append(response.choices[0].message)

        for tool_call in tool_calls:
            result = await self._execute_tool(tool_call)
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": json.dumps(result)
            })

        # Follow-up LLM call with tool results
        response = await openai.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=SCOUT_AGENT_TOOLS,
            tool_choice="auto",
        )

    return ScoutResponse(
        status="ok",
        message=response.choices[0].message.content,
        context=context,
    )

async def _execute_tool(self, tool_call) -> dict:
    """Execute a tool call and return results."""
    name = tool_call.function.name
    args = json.loads(tool_call.function.arguments)

    if name == "web_research":
        return await self._tool_web_research(**args)
    elif name == "extract_from_url":
        return await self._tool_extract_url(**args)
    elif name == "find_professionals":
        return await self._tool_find_professionals(**args)
    elif name == "get_company_news":
        return await self._tool_company_news(**args)
    elif name == "prepare_coffee_chat":
        return await self._tool_coffee_chat_prep(**args)
    # ... etc

async def _tool_web_research(self, query: str, depth: str = "quick",
                              domain_filter: list = None, recency: str = None) -> dict:
    """Execute web research via Perplexity."""
    preset_map = {"quick": "fast-search", "standard": "pro-search", "deep": "deep-research"}

    tools_config = [{"type": "web_search"}]
    if domain_filter:
        tools_config[0]["search_domain_filter"] = domain_filter
    if recency:
        tools_config[0]["search_recency_filter"] = recency

    response = perplexity.responses.create(
        preset=preset_map.get(depth, "fast-search"),
        input=query,
        tools=tools_config,
    )

    return {
        "answer": response.output_text,
        "citations": [{"url": c.url, "title": c.title} for c in response.citations],
    }

async def _tool_extract_url(self, url: str, extract_type: str = "general") -> dict:
    """Extract structured data from URL via Firecrawl."""
    schema_map = {
        "job_posting": JobPostingExtract,
        "person_profile": PersonProfileExtract,
        "company_page": CompanyPageExtract,
    }

    schema_class = schema_map.get(extract_type)

    if schema_class:
        result = firecrawl.scrape_url(url, {
            "formats": ["extract"],
            "extract": {"schema": schema_class.model_json_schema()}
        })
        return result.get("extract", {})
    else:
        result = firecrawl.scrape_url(url, {"formats": ["markdown"]})
        # Truncate for context window
        return {"content": result.get("markdown", "")[:8000]}
```

### What this enables — real example flows:

**Student**: "I have a coffee chat with Sarah Chen at Bain next week. Help me prepare."

**Scout (with tools)**:
1. Calls `web_research(query="Sarah Chen Bain consulting", depth="deep")`
   → Gets her background, recent mentions, publications
2. Calls `get_company_news(company="Bain & Company", timeframe="month")`
   → Gets recent deals, leadership changes, office news
3. Calls `web_research(query="Bain consulting interview culture entry level", domain_filter=["glassdoor.com", "reddit.com"])`
   → Gets culture insights from actual employees
4. Synthesizes everything into a prep brief with talking points

**Student**: "I found this job posting, is it a good fit?" *pastes Greenhouse URL*

**Scout (with tools)**:
1. Calls `extract_from_url(url="...", extract_type="job_posting")`
   → Gets structured requirements, responsibilities, salary
2. Compares against student's resume (local, no tool needed)
3. Calls `web_research(query="{company} {role} culture team", depth="quick")`
   → Gets team/culture context
4. Returns: fit score, strengths, gaps, and networking contacts at the company

**Student**: "Help me break into consulting in Chicago"

**Scout (with tools)**:
1. Calls `web_research(query="top consulting firms hiring Chicago 2026", depth="standard")`
   → Gets current landscape
2. Calls `find_professionals(company="McKinsey", title="analyst", location="Chicago", school="{student_school}")`
   → Finds alumni to network with
3. Calls `find_professionals(company="Bain", ...)` and `find_professionals(company="BCG", ...)`
4. Synthesizes a networking strategy: who to reach out to first, what to say, timeline

---

## 8. Scout Assistant Service Upgrades

The Scout Assistant (`scout_assistant_service.py`) currently has no web access. Add:

### New tools for the assistant:

```python
# Add to existing SCOUT_TOOLS in scout_assistant_service.py
{
    "type": "function",
    "function": {
        "name": "look_up_company",
        "description": "Look up real-time information about a company. "
                      "Use when the user asks about a company and you need current data.",
        "parameters": {
            "type": "object",
            "properties": {
                "company": {"type": "string"},
                "question": {"type": "string", "description": "What specifically to look up"}
            },
            "required": ["company"]
        }
    }
},
{
    "type": "function",
    "function": {
        "name": "verify_contact_info",
        "description": "Verify if a contact is still at their listed company and role. "
                      "Use when helping with outreach to confirm the person hasn't moved.",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "company": {"type": "string"},
                "title": {"type": "string"}
            },
            "required": ["name", "company"]
        }
    }
},
```

This means the free assistant can now answer: "What companies should I target for consulting?" with **real, cited data** instead of hallucinated advice.

---

## 9. Firm Assist Upgrades

The `handle_firm_assist()` handler (line 2700) routes to 6 action types, all powered by OpenAI-only. Key upgrades:

### `research_firm` action:

**Current**: OpenAI generates company info from training data (stale, potentially wrong).

**Upgraded**:
```python
async def _handle_firm_research(self, message: str, firm_context: dict) -> dict:
    company = self._extract_company_name(message, firm_context)

    # Parallel: Perplexity research + Firecrawl website extraction
    research_task = self._tool_web_research(
        query=f"{company} company overview culture hiring recent news",
        depth="standard"
    )

    website_task = None
    if firm_context.get("website"):
        website_task = self._tool_extract_url(
            url=firm_context["website"],
            extract_type="company_page"
        )

    research = await research_task
    website_data = await website_task if website_task else {}

    # Combine into comprehensive response
    return {
        "status": "ok",
        "message": research["answer"],
        "citations": research["citations"],
        "company_data": website_data,
        "action_type": "research_firm",
    }
```

### `recommend_firms` action:

**Current**: OpenAI recommends companies from training data.

**Upgraded**: Perplexity searches for firms actually hiring for the student's target role/location, grounded in real job postings and company pages.

---

## 10. Concrete Implementation Plan

### Step 1: Create the API clients (Day 1-2)

```
backend/app/services/perplexity_client.py  — Perplexity wrapper
backend/app/services/firecrawl_client.py   — Firecrawl wrapper
backend/app/services/extraction_schemas.py — Pydantic schemas
```

Each client should:
- Read API key from env/config
- Have graceful fallback (if Perplexity fails → fall back to current SerpAPI)
- Log costs for monitoring
- Cache results in Firestore

### Step 2: Replace Jina Reader in Scout (Day 3-4)

In `scout_service.py`:
- Replace `_fetch_url_content()` with Firecrawl `/scrape`
- Replace `_extract_job_details_from_content()` with schema-based extraction
- Add URL type detection (job posting vs profile vs company)
- Keep Jina Reader as fallback if Firecrawl fails

**Test**: Paste 5 job posting URLs (Greenhouse, Lever, Workday, LinkedIn, Indeed) and verify structured extraction works.

### Step 3: Replace RESEARCH handler (Day 5-6)

In `scout_service.py`:
- Replace `_handle_research()` with tiered Perplexity calls
- Add research depth classification
- Add citations to ScoutResponse
- Keep SerpAPI as fallback

**Test**: Ask 10 research questions ("What's the interview process at McKinsey?", "Culture at Goldman?", etc.) and compare quality.

### Step 4: Add tool-use architecture (Day 7-10)

This is the biggest change. In `scout_service.py`:
- Add `SCOUT_AGENT_TOOLS` definition
- Add `_execute_tool()` dispatcher
- Add tool implementations (`_tool_web_research`, `_tool_extract_url`, etc.)
- Modify `handle_chat()` to support tool-use loop
- Add tool-use to `handle_firm_assist()`

**Test**: Multi-step conversation: "Research Sarah Chen at Bain, then draft an email to her, then find 3 more people at Bain I should reach out to."

### Step 5: Add web tools to Scout Assistant (Day 11-12)

In `scout_assistant_service.py`:
- Add `look_up_company` and `verify_contact_info` tools
- Implement tool handlers using Perplexity
- Update system prompt to describe new capabilities

**Test**: "What companies should I target for consulting internships in Chicago?" — should return real, cited companies.

### Step 6: Frontend updates (Day 13-15)

- Display citations in Scout chat messages
- Show "researching..." indicator during deep research (can take 15-60s)
- Handle structured data responses (job posting cards, company cards)
- Add "Research depth" indicator (quick/standard/deep)

### Step 7: Cost monitoring & guardrails (Day 16-17)

- Log every Perplexity/Firecrawl call with cost estimate
- Set per-user daily limits on deep research calls
- Cache aggressively (same company researched by 10 students = 1 API call)
- Dashboard for monitoring spend

---

## Sources

- [Perplexity Agent API Quickstart](https://docs.perplexity.ai/docs/agent-api/quickstart)
- [Perplexity Agent API Presets](https://docs.perplexity.ai/docs/agent-api/presets)
- [Perplexity Agent API Output Control](https://docs.perplexity.ai/docs/agent-api/output-control)
- [Perplexity Search Filters Documentation](https://docs.perplexity.ai/docs/sonar/filters)
- [Perplexity Agent API Blog Post](https://www.perplexity.ai/hub/blog/agent-api-a-managed-runtime-for-agentic-workflows)
- [Perplexity Python SDK (GitHub)](https://github.com/perplexityai/perplexity-py)
- [Perplexity + Pydantic Structured Outputs](https://python.useinstructor.com/integrations/perplexity/)
- [Firecrawl Agent Endpoint](https://www.firecrawl.dev/agent)
- [Firecrawl Scrape API Tutorial](https://www.firecrawl.dev/blog/mastering-firecrawl-scrape-endpoint)
- [Firecrawl Extract Endpoint Guide](https://www.firecrawl.dev/blog/mastering-firecrawl-extract-endpoint)
- [Firecrawl Python SDK](https://pypi.org/project/firecrawl-py/)
- [Firecrawl Advanced Scraping Guide](https://docs.firecrawl.dev/advanced-scraping-guide)
- [Firecrawl Open Source Agent](https://www.firecrawl.dev/blog/firecrawl-agent-open-source)
- [Firecrawl Search Endpoint Guide](https://www.firecrawl.dev/blog/mastering-firecrawl-search-endpoint)
