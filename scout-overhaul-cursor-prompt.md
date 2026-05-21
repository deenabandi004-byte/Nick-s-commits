# Scout AI Overhaul - Cursor Prompt

## Overview

You are overhauling the Scout feature for Offerloop.ai - a networking platform that helps students connect with professionals. Scout is a conversational AI assistant that helps users fill in the Professional Search form fields on the Home page.

**Current State:** Scout is a basic job title discovery assistant with limited functionality.

**Target State:** Scout becomes a powerful, conversational AI that can:
1. Parse job posting URLs and auto-fill search fields
2. Find job postings based on natural language queries (e.g., "data analytics jobs in San Francisco")
3. Help users input the right keywords/titles for their searches
4. Have full conversations with SERP-powered research capabilities
5. Answer questions about companies, roles, interview processes, etc.

**Performance Target:** Responses should complete within 30-60 seconds max, with most responses under 15 seconds.

---

## Files to Modify

### Backend Files
- `app/routes/scout.py` - API endpoints
- `app/services/scout_service.py` - Core Scout logic (major rewrite)

### Frontend Files
- `src/components/ScoutChatbot.tsx` - Chat UI component
- `src/pages/Home.tsx` - Professional Search form (minor updates to callback)

---

## Architecture

```
User Input (URL, Natural Language, or Question)
        │
        ▼
┌─────────────────────────────────────────────┐
│           Intent Classification             │
│  (Regex + GPT-4o-mini, < 1 second)          │
│                                             │
│  Intents:                                   │
│  - URL_PARSE: User pasted a job posting URL │
│  - JOB_SEARCH: User wants to find jobs      │
│  - FIELD_HELP: User needs help with fields  │
│  - RESEARCH: User asking about company/role │
│  - CONVERSATION: General chat/follow-up     │
└────────────────┬────────────────────────────┘
                 │
    ┌────────────┼────────────┬───────────────┬─────────────┐
    ▼            ▼            ▼               ▼             ▼
┌────────┐ ┌──────────┐ ┌──────────┐  ┌───────────┐ ┌────────────┐
│URL Mode│ │Job Search│ │Field Help│  │ Research  │ │Conversation│
│ (Jina) │ │  (SERP)  │ │  (LLM)   │  │(SERP+LLM) │ │   (LLM)    │
└───┬────┘ └────┬─────┘ └────┬─────┘  └─────┬─────┘ └─────┬──────┘
    │           │            │              │             │
    └───────────┴────────────┴──────────────┴─────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │   Response Generator (LLM)   │
              │   + Field Extraction         │
              └──────────────┬───────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │  Return to Frontend:         │
              │  - message (conversational)  │
              │  - fields (to auto-populate) │
              │  - suggestions (job listings)│
              └──────────────────────────────┘
```

---

## Backend Implementation

### 1. New Dependencies

Add to `requirements.txt`:
```
httpx>=0.25.0  # For async HTTP requests to Jina
```

### 2. scout_service.py - Complete Rewrite

```python
"""
Scout Service v2.0 - Conversational job search assistant with URL parsing,
job discovery, and SERP-powered research capabilities.
"""
from __future__ import annotations

import asyncio
import json
import re
import time
import hashlib
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional, Tuple, Literal
from urllib.parse import urlparse

import httpx
from serpapi import GoogleSearch

from app.config import SERPAPI_KEY, JINA_API_KEY
from app.services.openai_client import get_async_openai_client


# ============================================================================
# CONFIGURATION
# ============================================================================

JINA_READER_URL = "https://r.jina.ai/"
JINA_SEARCH_URL = "https://s.jina.ai/"

# Intent types
IntentType = Literal["URL_PARSE", "JOB_SEARCH", "FIELD_HELP", "RESEARCH", "CONVERSATION"]


# ============================================================================
# DATA CLASSES
# ============================================================================

@dataclass
class SearchFields:
    """Fields that can be auto-populated in the Professional Search form."""
    job_title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    experience_level: Optional[str] = None  # intern, entry, mid, senior, etc.
    
    def to_dict(self) -> Dict[str, Any]:
        return {k: v for k, v in asdict(self).items() if v is not None}
    
    def has_any(self) -> bool:
        return any([self.job_title, self.company, self.location])


@dataclass
class JobListing:
    """A job posting found via search."""
    title: str
    company: str
    location: Optional[str] = None
    url: Optional[str] = None
    snippet: Optional[str] = None
    source: str = "serp"
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ScoutResponse:
    """Response returned to the frontend."""
    status: str  # "ok", "needs_input", "error"
    message: str  # Conversational response to display
    fields: Optional[SearchFields] = None  # Fields to auto-populate
    job_listings: List[JobListing] = field(default_factory=list)  # Job results
    intent: Optional[str] = None  # What Scout understood
    context: Dict[str, Any] = field(default_factory=dict)  # Session context
    
    def to_dict(self) -> Dict[str, Any]:
        result = {
            "status": self.status,
            "message": self.message,
            "intent": self.intent,
            "context": self.context,
        }
        if self.fields and self.fields.has_any():
            result["fields"] = self.fields.to_dict()
        if self.job_listings:
            result["job_listings"] = [j.to_dict() for j in self.job_listings]
        return result


# ============================================================================
# CACHING
# ============================================================================

class TTLCache:
    """Simple in-memory TTL cache."""
    
    def __init__(self, default_ttl: int = 3600):  # 1 hour default
        self._store: Dict[str, Tuple[float, Any]] = {}
        self._default_ttl = default_ttl
    
    def get(self, key: str) -> Optional[Any]:
        if key not in self._store:
            return None
        expires_at, value = self._store[key]
        if expires_at < time.time():
            self._store.pop(key, None)
            return None
        return value
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        lifetime = ttl if ttl is not None else self._default_ttl
        self._store[key] = (time.time() + lifetime, value)
    
    def make_key(self, *args) -> str:
        return hashlib.md5(":".join(str(a) for a in args).encode()).hexdigest()


# ============================================================================
# SCOUT SERVICE
# ============================================================================

class ScoutService:
    """Main Scout service orchestrating all functionality."""
    
    DEFAULT_MODEL = "gpt-4o-mini"
    
    def __init__(self):
        self._cache = TTLCache()
        self._openai = get_async_openai_client()
        self._http_client: Optional[httpx.AsyncClient] = None
    
    async def _get_http_client(self) -> httpx.AsyncClient:
        """Lazy-initialize HTTP client."""
        if self._http_client is None:
            self._http_client = httpx.AsyncClient(timeout=30.0)
        return self._http_client
    
    # ========================================================================
    # MAIN ENTRY POINT
    # ========================================================================
    
    async def handle_chat(
        self,
        *,
        message: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Main entry point for Scout chat interactions.
        
        Args:
            message: User's message (can be URL, question, or natural language)
            context: Session context from previous messages
        
        Returns:
            ScoutResponse as dictionary
        """
        context = context or {}
        message = (message or "").strip()
        
        if not message:
            return ScoutResponse(
                status="needs_input",
                message="Hi! I'm Scout 🐕 I can help you find the right professionals to network with. You can:\n\n"
                        "• Paste a job posting URL and I'll extract the details\n"
                        "• Tell me what kind of roles you're looking for (e.g., 'data analyst jobs in NYC')\n"
                        "• Ask me about companies or roles\n\n"
                        "What would you like to do?",
                context=context,
            ).to_dict()
        
        # Classify intent
        intent, extracted = await self._classify_intent(message, context)
        print(f"[Scout] Intent: {intent}, Extracted: {extracted}")
        
        # Route to appropriate handler
        try:
            if intent == "URL_PARSE":
                response = await self._handle_url_parse(extracted.get("url", message), context)
            elif intent == "JOB_SEARCH":
                response = await self._handle_job_search(message, extracted, context)
            elif intent == "FIELD_HELP":
                response = await self._handle_field_help(message, extracted, context)
            elif intent == "RESEARCH":
                response = await self._handle_research(message, extracted, context)
            else:  # CONVERSATION
                response = await self._handle_conversation(message, context)
            
            response.intent = intent
            return response.to_dict()
            
        except Exception as e:
            print(f"[Scout] Error handling message: {e}")
            return ScoutResponse(
                status="error",
                message="I ran into an issue processing that. Could you try rephrasing or paste the job description text directly?",
                context=context,
            ).to_dict()
    
    # ========================================================================
    # INTENT CLASSIFICATION
    # ========================================================================
    
    async def _classify_intent(
        self, 
        message: str, 
        context: Dict[str, Any]
    ) -> Tuple[IntentType, Dict[str, Any]]:
        """
        Classify user intent using regex patterns first, then LLM if needed.
        Returns (intent_type, extracted_entities).
        """
        extracted: Dict[str, Any] = {}
        
        # Pattern 1: URL detection (fast path)
        url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+'
        urls = re.findall(url_pattern, message)
        if urls:
            extracted["url"] = urls[0]
            return "URL_PARSE", extracted
        
        # Pattern 2: Job search patterns
        job_search_patterns = [
            r'\b(find|search|look for|looking for|show me|get me)\b.*\b(jobs?|roles?|positions?|openings?)\b',
            r'\b(jobs?|roles?|positions?)\b.*(in|at|near)\b',
            r'\b(hiring|openings?)\b.*\b(for|at|in)\b',
            r'\bwho.*(is hiring|are hiring)\b',
            r'\b(data|software|product|marketing|sales|finance|engineering)\b.*\b(jobs?|roles?|positions?)\b',
        ]
        for pattern in job_search_patterns:
            if re.search(pattern, message, re.IGNORECASE):
                # Extract location if mentioned
                location_match = re.search(
                    r'\b(?:in|at|near)\s+([A-Za-z\s,]+?)(?:\s*$|\s+(?:for|as|with))',
                    message, re.IGNORECASE
                )
                if location_match:
                    extracted["location"] = location_match.group(1).strip()
                return "JOB_SEARCH", extracted
        
        # Pattern 3: Field help patterns
        field_help_patterns = [
            r'\b(what|which)\b.*\b(title|job title|role)\b.*\b(should|would|to use)\b',
            r'\b(help|assist)\b.*\b(fill|input|enter)\b',
            r'\bhow (do|should) i (search|find|look)\b',
            r'\bwhat.*(put|enter|type|input)\b',
        ]
        for pattern in field_help_patterns:
            if re.search(pattern, message, re.IGNORECASE):
                return "FIELD_HELP", extracted
        
        # Pattern 4: Research patterns (questions about companies/roles)
        research_patterns = [
            r'\b(what|how|tell me about|describe)\b.*\b(interview|culture|salary|compensation|benefits)\b',
            r'\bwhat.*(like|about)\b.*\b(work|working)\b.*\bat\b',
            r'\b(interview process|hiring process)\b',
            r'\bhow (hard|difficult|easy)\b.*\b(get|land)\b.*\b(job|role|position)\b',
        ]
        for pattern in research_patterns:
            if re.search(pattern, message, re.IGNORECASE):
                # Extract company if mentioned
                company_match = re.search(r'\bat\s+([A-Z][A-Za-z0-9\s&]+)', message)
                if company_match:
                    extracted["company"] = company_match.group(1).strip()
                return "RESEARCH", extracted
        
        # Fall back to LLM classification for ambiguous cases
        return await self._llm_classify_intent(message, context)
    
    async def _llm_classify_intent(
        self, 
        message: str, 
        context: Dict[str, Any]
    ) -> Tuple[IntentType, Dict[str, Any]]:
        """Use LLM to classify intent when regex patterns don't match."""
        try:
            prompt = f"""Classify this user message for a job search assistant. Return JSON only.

Message: "{message}"

Recent context: {json.dumps(context.get('recent_topics', []))}

Classify as one of:
- URL_PARSE: User shared a URL to a job posting
- JOB_SEARCH: User wants to find job listings (e.g., "data analyst jobs in SF")
- FIELD_HELP: User needs help with what to enter in search fields
- RESEARCH: User asking about a company, role, interview process, etc.
- CONVERSATION: General chat, follow-up, or unclear intent

Also extract any entities mentioned:
- job_title: specific role mentioned
- company: company name mentioned  
- location: city/location mentioned
- experience_level: intern, entry, mid, senior, etc.

Return format:
{{"intent": "INTENT_TYPE", "entities": {{"job_title": null, "company": null, "location": null, "experience_level": null}}}}
"""
            
            completion = await asyncio.wait_for(
                self._openai.chat.completions.create(
                    model=self.DEFAULT_MODEL,
                    messages=[
                        {"role": "system", "content": "You classify user intents. Return only valid JSON."},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0,
                    max_tokens=150,
                    response_format={"type": "json_object"},
                ),
                timeout=5.0
            )
            
            result = json.loads(completion.choices[0].message.content)
            intent = result.get("intent", "CONVERSATION")
            entities = result.get("entities", {})
            # Filter out null values
            entities = {k: v for k, v in entities.items() if v}
            
            return intent, entities
            
        except Exception as e:
            print(f"[Scout] LLM classification failed: {e}")
            return "CONVERSATION", {}
    
    # ========================================================================
    # URL PARSING (Jina Reader)
    # ========================================================================
    
    async def _handle_url_parse(
        self, 
        url: str, 
        context: Dict[str, Any]
    ) -> ScoutResponse:
        """Parse a job posting URL using Jina Reader and extract fields."""
        
        # Check cache first
        cache_key = self._cache.make_key("url", url)
        cached = self._cache.get(cache_key)
        if cached:
            return cached
        
        # Fetch page content via Jina Reader
        content = await self._fetch_url_content(url)
        
        if not content:
            # Fallback: Try SERP search for the URL
            return await self._handle_url_fallback(url, context)
        
        # Extract job details using LLM
        fields, summary = await self._extract_job_details_from_content(content, url)
        
        if not fields.has_any():
            return ScoutResponse(
                status="needs_input",
                message="I found the page but couldn't extract job details. Could you paste the job title and company name directly?",
                context=self._update_context(context, url=url),
            )
        
        # Build response message
        message_parts = ["📋 **Got it!** I found these details from the job posting:\n"]
        if fields.job_title:
            message_parts.append(f"• **Job Title:** {fields.job_title}")
        if fields.company:
            message_parts.append(f"• **Company:** {fields.company}")
        if fields.location:
            message_parts.append(f"• **Location:** {fields.location}")
        if fields.experience_level:
            message_parts.append(f"• **Level:** {fields.experience_level}")
        
        message_parts.append("\n✨ I've filled these into your search. Click **Find Contacts** to discover professionals in this role!")
        
        if summary:
            message_parts.append(f"\n\n💡 **About this role:** {summary}")
        
        response = ScoutResponse(
            status="ok",
            message="\n".join(message_parts),
            fields=fields,
            context=self._update_context(context, url=url, fields=fields),
        )
        
        self._cache.set(cache_key, response)
        return response
    
    async def _fetch_url_content(self, url: str) -> Optional[str]:
        """Fetch URL content using Jina Reader API."""
        try:
            client = await self._get_http_client()
            jina_url = f"{JINA_READER_URL}{url}"
            
            headers = {}
            if JINA_API_KEY:
                headers["Authorization"] = f"Bearer {JINA_API_KEY}"
            
            response = await client.get(jina_url, headers=headers, timeout=15.0)
            
            if response.status_code == 200:
                content = response.text
                # Limit content length to avoid token limits
                if len(content) > 15000:
                    content = content[:15000] + "\n... [truncated]"
                return content
            else:
                print(f"[Scout] Jina Reader returned {response.status_code} for {url}")
                return None
                
        except Exception as e:
            print(f"[Scout] Error fetching URL via Jina: {e}")
            return None
    
    async def _extract_job_details_from_content(
        self, 
        content: str,
        url: str
    ) -> Tuple[SearchFields, Optional[str]]:
        """Extract job details from page content using LLM."""
        try:
            # Infer company from URL if possible
            domain_hint = self._extract_company_from_url(url)
            
            prompt = f"""Extract job posting details from this content. Return JSON only.

URL: {url}
Domain hint: {domain_hint or "unknown"}

Content:
{content[:8000]}

Extract:
- job_title: The exact job title (e.g., "Software Engineer", "Data Analyst Intern")
- company: Company name
- location: City, State or "Remote" if mentioned
- experience_level: One of: intern, entry, mid, senior, lead, manager, director, or null
- summary: 1-2 sentence summary of the role (for context)

Return format:
{{"job_title": "...", "company": "...", "location": "...", "experience_level": "...", "summary": "..."}}

If a field cannot be determined, use null.
"""
            
            completion = await asyncio.wait_for(
                self._openai.chat.completions.create(
                    model=self.DEFAULT_MODEL,
                    messages=[
                        {"role": "system", "content": "You extract structured job posting data. Return only valid JSON."},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0,
                    max_tokens=300,
                    response_format={"type": "json_object"},
                ),
                timeout=10.0
            )
            
            result = json.loads(completion.choices[0].message.content)
            
            fields = SearchFields(
                job_title=result.get("job_title"),
                company=result.get("company") or domain_hint,
                location=result.get("location"),
                experience_level=result.get("experience_level"),
            )
            summary = result.get("summary")
            
            return fields, summary
            
        except Exception as e:
            print(f"[Scout] Error extracting job details: {e}")
            return SearchFields(), None
    
    def _extract_company_from_url(self, url: str) -> Optional[str]:
        """Try to extract company name from URL domain."""
        try:
            parsed = urlparse(url)
            domain = parsed.netloc.lower()
            
            # Common ATS patterns
            ats_patterns = {
                "greenhouse.io": lambda d: d.split(".greenhouse.io")[0].replace("-", " ").title(),
                "lever.co": lambda d: d.split(".lever.co")[0].replace("-", " ").title(),
                "jobs.lever.co": lambda d: d.replace("jobs.lever.co/", "").split("/")[0].replace("-", " ").title(),
                "myworkdayjobs.com": lambda d: d.split(".myworkdayjobs.com")[0].replace("-", " ").title(),
                "smartrecruiters.com": lambda d: None,  # Company in path
                "linkedin.com": lambda d: None,  # Can't extract
            }
            
            for pattern, extractor in ats_patterns.items():
                if pattern in domain:
                    return extractor(domain)
            
            # Try to get company from subdomain or path
            if "careers" in domain or "jobs" in domain:
                parts = domain.replace("careers.", "").replace("jobs.", "").split(".")
                if parts[0] not in ["www", "apply"]:
                    return parts[0].replace("-", " ").title()
            
            return None
            
        except Exception:
            return None
    
    async def _handle_url_fallback(
        self, 
        url: str, 
        context: Dict[str, Any]
    ) -> ScoutResponse:
        """Fallback when URL fetching fails - try SERP or ask user."""
        # Try to extract company from URL
        company = self._extract_company_from_url(url)
        
        if company:
            # Search for jobs at this company
            return await self._handle_job_search(
                f"jobs at {company}",
                {"company": company},
                context
            )
        
        return ScoutResponse(
            status="needs_input",
            message="I couldn't access that URL directly. Could you try one of these:\n\n"
                    "1. **Paste the job description text** directly\n"
                    "2. **Tell me the job title and company** (e.g., 'Software Engineer at Google')\n"
                    "3. **Share a different URL** to the same posting",
            context=self._update_context(context, failed_url=url),
        )
    
    # ========================================================================
    # JOB SEARCH (SERP)
    # ========================================================================
    
    async def _handle_job_search(
        self, 
        message: str,
        extracted: Dict[str, Any],
        context: Dict[str, Any]
    ) -> ScoutResponse:
        """Handle job search queries using SERP API."""
        
        # Build search query
        query = await self._build_job_search_query(message, extracted, context)
        print(f"[Scout] Job search query: {query}")
        
        # Search for jobs
        jobs = await self._search_jobs(query)
        
        if not jobs:
            # Fallback: suggest common job titles
            return await self._handle_no_jobs_found(message, extracted, context)
        
        # Extract fields from first few results
        fields = self._aggregate_fields_from_jobs(jobs, extracted)
        
        # Build response
        message_parts = [f"🔍 **Found {len(jobs)} relevant positions!** Here are the top matches:\n"]
        
        for i, job in enumerate(jobs[:5], 1):
            job_line = f"{i}. **{job.title}** at {job.company}"
            if job.location:
                job_line += f" ({job.location})"
            message_parts.append(job_line)
        
        message_parts.append("\n✨ **I've filled in suggested search terms:**")
        if fields.job_title:
            message_parts.append(f"• Job Title: **{fields.job_title}**")
        if fields.company:
            message_parts.append(f"• Company: **{fields.company}**")
        if fields.location:
            message_parts.append(f"• Location: **{fields.location}**")
        
        message_parts.append("\nFeel free to adjust these and click **Find Contacts** to discover professionals!")
        
        return ScoutResponse(
            status="ok",
            message="\n".join(message_parts),
            fields=fields,
            job_listings=jobs[:10],
            context=self._update_context(context, search_query=query, fields=fields),
        )
    
    async def _build_job_search_query(
        self,
        message: str,
        extracted: Dict[str, Any],
        context: Dict[str, Any]
    ) -> str:
        """Build an optimized search query for job postings."""
        # Start with user's message, clean it up
        query_parts = []
        
        # Add job title/role if extracted
        if extracted.get("job_title"):
            query_parts.append(extracted["job_title"])
        
        # Add location if extracted
        if extracted.get("location"):
            query_parts.append(f"in {extracted['location']}")
        
        # Add company if extracted
        if extracted.get("company"):
            query_parts.append(f"at {extracted['company']}")
        
        # If we have parts, use them; otherwise clean up the message
        if query_parts:
            query = " ".join(query_parts) + " jobs"
        else:
            # Clean message for search
            query = re.sub(r'\b(find|search|look for|looking for|show me|get me)\b', '', message, flags=re.IGNORECASE)
            query = query.strip()
            if "job" not in query.lower():
                query += " jobs"
        
        return query
    
    async def _search_jobs(self, query: str) -> List[JobListing]:
        """Search for job postings using SERP API."""
        try:
            # Check cache
            cache_key = self._cache.make_key("jobs", query)
            cached = self._cache.get(cache_key)
            if cached:
                return cached
            
            search = GoogleSearch({
                "q": query,
                "api_key": SERPAPI_KEY,
                "num": 10,
                "tbm": "",  # Web search
            })
            
            # Run in thread pool to not block
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(None, search.get_dict)
            
            jobs = []
            
            # Parse organic results
            for result in results.get("organic_results", [])[:10]:
                title = result.get("title", "")
                snippet = result.get("snippet", "")
                link = result.get("link", "")
                
                # Try to extract company and job title from result
                job_title, company, location = self._parse_job_from_serp_result(title, snippet, link)
                
                if job_title:
                    jobs.append(JobListing(
                        title=job_title,
                        company=company or "Unknown",
                        location=location,
                        url=link,
                        snippet=snippet[:200] if snippet else None,
                        source="serp"
                    ))
            
            # Also check jobs_results if available
            for result in results.get("jobs_results", [])[:5]:
                jobs.append(JobListing(
                    title=result.get("title", "Unknown Role"),
                    company=result.get("company_name", "Unknown"),
                    location=result.get("location"),
                    url=result.get("link"),
                    snippet=result.get("description", "")[:200],
                    source="google_jobs"
                ))
            
            self._cache.set(cache_key, jobs, ttl=1800)  # Cache for 30 min
            return jobs
            
        except Exception as e:
            print(f"[Scout] SERP search failed: {e}")
            return []
    
    def _parse_job_from_serp_result(
        self,
        title: str,
        snippet: str,
        url: str
    ) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """Parse job title, company, and location from SERP result."""
        job_title = None
        company = None
        location = None
        
        # Common patterns in job listing titles
        # "Software Engineer - Google" or "Software Engineer at Google"
        patterns = [
            r'^(.+?)\s*[-– - ]\s*(.+?)(?:\s*[-– - ]\s*(.+))?$',  # Title - Company - Location
            r'^(.+?)\s+at\s+(.+?)(?:\s*[-– - ,]\s*(.+))?$',   # Title at Company - Location
            r'^(.+?)\s*\|\s*(.+?)(?:\s*\|\s*(.+))?$',       # Title | Company | Location
        ]
        
        for pattern in patterns:
            match = re.match(pattern, title, re.IGNORECASE)
            if match:
                job_title = match.group(1).strip()
                company = match.group(2).strip() if match.group(2) else None
                location = match.group(3).strip() if match.lastindex >= 3 and match.group(3) else None
                break
        
        # If no match, use the whole title as job title
        if not job_title:
            job_title = title
        
        # Try to get company from URL
        if not company:
            company = self._extract_company_from_url(url)
        
        return job_title, company, location
    
    def _aggregate_fields_from_jobs(
        self,
        jobs: List[JobListing],
        extracted: Dict[str, Any]
    ) -> SearchFields:
        """Aggregate the most common/relevant fields from job listings."""
        # Use extracted fields as base
        job_title = extracted.get("job_title")
        company = extracted.get("company")
        location = extracted.get("location")
        
        # If not extracted, use most common from results
        if not job_title and jobs:
            # Get the most "standard" job title (shortest, most common)
            titles = [j.title for j in jobs if j.title]
            if titles:
                job_title = min(titles, key=len)  # Shortest is usually most generic
        
        if not company and jobs:
            companies = [j.company for j in jobs if j.company and j.company != "Unknown"]
            if companies:
                company = companies[0]
        
        if not location and jobs:
            locations = [j.location for j in jobs if j.location]
            if locations:
                location = locations[0]
        
        return SearchFields(
            job_title=job_title,
            company=company,
            location=location,
        )
    
    async def _handle_no_jobs_found(
        self,
        message: str,
        extracted: Dict[str, Any],
        context: Dict[str, Any]
    ) -> ScoutResponse:
        """Handle case when no jobs are found - suggest alternatives."""
        suggestions = await self._get_title_suggestions(message, extracted)
        
        message_parts = [
            "🤔 I couldn't find exact matches. Here are some suggestions:\n"
        ]
        
        if suggestions:
            message_parts.append("**Try searching for:**")
            for s in suggestions[:5]:
                message_parts.append(f"• {s}")
        
        message_parts.append("\n💡 **Tips:**")
        message_parts.append("• Try broader job titles (e.g., 'Analyst' instead of 'Junior Data Analyst')")
        message_parts.append("• Check the spelling of company names")
        message_parts.append("• Try a larger city or metro area")
        
        return ScoutResponse(
            status="needs_input",
            message="\n".join(message_parts),
            context=context,
        )
    
    async def _get_title_suggestions(
        self,
        message: str,
        extracted: Dict[str, Any]
    ) -> List[str]:
        """Get alternative job title suggestions."""
        try:
            prompt = f"""The user is looking for: "{message}"
Extracted info: {json.dumps(extracted)}

Suggest 5 alternative, commonly-used job titles they might search for.
Focus on titles that would have many professionals on LinkedIn.

Return as JSON: {{"suggestions": ["title1", "title2", ...]}}
"""
            
            completion = await asyncio.wait_for(
                self._openai.chat.completions.create(
                    model=self.DEFAULT_MODEL,
                    messages=[
                        {"role": "system", "content": "You suggest job titles. Return JSON only."},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.7,
                    max_tokens=150,
                    response_format={"type": "json_object"},
                ),
                timeout=5.0
            )
            
            result = json.loads(completion.choices[0].message.content)
            return result.get("suggestions", [])
            
        except Exception as e:
            print(f"[Scout] Error getting suggestions: {e}")
            return []
    
    # ========================================================================
    # FIELD HELP
    # ========================================================================
    
    async def _handle_field_help(
        self,
        message: str,
        extracted: Dict[str, Any],
        context: Dict[str, Any]
    ) -> ScoutResponse:
        """Help users understand what to enter in search fields."""
        
        prompt = f"""The user needs help with job search fields. Their message: "{message}"

Context from conversation: {json.dumps(context.get('recent_topics', []))}

Provide helpful, specific advice about:
1. What job titles to search for (be specific based on their interests)
2. Whether to include company name or leave it broad
3. Best practices for location (city vs metro area)

Keep response concise and actionable. Use bullet points.
If you can infer specific titles they should try, list them.
"""
        
        try:
            completion = await asyncio.wait_for(
                self._openai.chat.completions.create(
                    model=self.DEFAULT_MODEL,
                    messages=[
                        {"role": "system", "content": "You are Scout, a helpful job search assistant. Be friendly and concise."},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.7,
                    max_tokens=400,
                ),
                timeout=8.0
            )
            
            response_text = completion.choices[0].message.content
            
            return ScoutResponse(
                status="ok",
                message=response_text,
                context=self._update_context(context, topic="field_help"),
            )
            
        except Exception as e:
            print(f"[Scout] Field help failed: {e}")
            return ScoutResponse(
                status="ok",
                message="Here are some tips for filling in the search:\n\n"
                        "• **Job Title**: Use common titles like 'Software Engineer', 'Product Manager', 'Data Analyst'\n"
                        "• **Company**: Optional - leave blank to search across all companies\n"
                        "• **Location**: Use city names like 'San Francisco, CA' or 'New York, NY'\n\n"
                        "What specific role are you interested in? I can help you find the right search terms!",
                context=context,
            )
    
    # ========================================================================
    # RESEARCH (Company/Role Info)
    # ========================================================================
    
    async def _handle_research(
        self,
        message: str,
        extracted: Dict[str, Any],
        context: Dict[str, Any]
    ) -> ScoutResponse:
        """Handle research questions about companies, roles, interviews, etc."""
        
        # Build search query for research
        search_query = message
        if extracted.get("company"):
            search_query = f"{extracted['company']} {message}"
        
        # Search for information
        try:
            search = GoogleSearch({
                "q": search_query,
                "api_key": SERPAPI_KEY,
                "num": 5,
            })
            
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(None, search.get_dict)
            
            # Collect snippets for context
            snippets = []
            for result in results.get("organic_results", [])[:5]:
                snippet = result.get("snippet", "")
                source = result.get("displayed_link", "")
                if snippet:
                    snippets.append(f"[{source}]: {snippet}")
            
            research_context = "\n".join(snippets)
            
        except Exception as e:
            print(f"[Scout] Research SERP failed: {e}")
            research_context = ""
        
        # Generate response with LLM
        try:
            prompt = f"""The user is researching: "{message}"
            
Company mentioned: {extracted.get('company', 'not specified')}
Role mentioned: {extracted.get('job_title', 'not specified')}

Search results for context:
{research_context}

Provide a helpful, informative response. Include:
1. Direct answer to their question
2. Relevant insights from search results
3. A follow-up suggestion for their job search

Keep it concise but informative. Use formatting for readability.
"""
            
            completion = await asyncio.wait_for(
                self._openai.chat.completions.create(
                    model=self.DEFAULT_MODEL,
                    messages=[
                        {"role": "system", "content": "You are Scout, a knowledgeable job search assistant. Provide helpful research insights."},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.7,
                    max_tokens=500,
                ),
                timeout=10.0
            )
            
            response_text = completion.choices[0].message.content
            
            # If we found fields, include them
            fields = None
            if extracted.get("job_title") or extracted.get("company"):
                fields = SearchFields(
                    job_title=extracted.get("job_title"),
                    company=extracted.get("company"),
                    location=extracted.get("location"),
                )
            
            return ScoutResponse(
                status="ok",
                message=response_text,
                fields=fields,
                context=self._update_context(context, topic="research", company=extracted.get("company")),
            )
            
        except Exception as e:
            print(f"[Scout] Research response failed: {e}")
            return ScoutResponse(
                status="ok",
                message="I found some information but had trouble summarizing it. Try asking a more specific question, like:\n\n"
                        "• 'What's the interview process at [Company]?'\n"
                        "• 'What skills are needed for [Role]?'\n"
                        "• 'How is the culture at [Company]?'",
                context=context,
            )
    
    # ========================================================================
    # CONVERSATION (General Chat)
    # ========================================================================
    
    async def _handle_conversation(
        self,
        message: str,
        context: Dict[str, Any]
    ) -> ScoutResponse:
        """Handle general conversation and follow-ups."""
        
        # Build conversation history
        history = context.get("history", [])
        
        try:
            messages = [
                {
                    "role": "system",
                    "content": """You are Scout, a friendly and helpful job search assistant for Offerloop.ai.
                    
Your capabilities:
- Parse job posting URLs to extract details
- Find job listings based on descriptions
- Help users choose the right search terms
- Answer questions about companies, roles, and interviews

You help users fill in the Professional Search form with:
- Job Title (required)
- Company (optional)
- Location (required)

Be concise, friendly, and action-oriented. Use emojis sparingly.
If the user seems stuck, suggest concrete next steps.
If you can extract job search fields from the conversation, mention them."""
                }
            ]
            
            # Add recent history
            for h in history[-6:]:  # Last 6 messages
                messages.append({"role": h["role"], "content": h["content"]})
            
            messages.append({"role": "user", "content": message})
            
            completion = await asyncio.wait_for(
                self._openai.chat.completions.create(
                    model=self.DEFAULT_MODEL,
                    messages=messages,
                    temperature=0.7,
                    max_tokens=400,
                ),
                timeout=8.0
            )
            
            response_text = completion.choices[0].message.content
            
            # Update history
            new_history = history + [
                {"role": "user", "content": message},
                {"role": "assistant", "content": response_text},
            ]
            
            return ScoutResponse(
                status="ok",
                message=response_text,
                context=self._update_context(context, history=new_history[-10:]),
            )
            
        except Exception as e:
            print(f"[Scout] Conversation failed: {e}")
            return ScoutResponse(
                status="ok",
                message="I'm here to help you find professionals to network with! You can:\n\n"
                        "🔗 **Paste a job posting URL** - I'll extract the details\n"
                        "🔍 **Describe what you're looking for** - e.g., 'data analyst jobs in NYC'\n"
                        "❓ **Ask me anything** - about companies, roles, or interviews\n\n"
                        "What would you like to do?",
                context=context,
            )
    
    # ========================================================================
    # HELPERS
    # ========================================================================
    
    def _update_context(self, context: Dict[str, Any], **kwargs) -> Dict[str, Any]:
        """Update context with new information."""
        updated = dict(context)
        
        for key, value in kwargs.items():
            if value is not None:
                if key == "fields" and isinstance(value, SearchFields):
                    updated["last_fields"] = value.to_dict()
                elif key == "history":
                    updated["history"] = value
                else:
                    updated[key] = value
        
        # Track recent topics
        topics = updated.get("recent_topics", [])
        if kwargs.get("topic"):
            topics.append(kwargs["topic"])
            updated["recent_topics"] = topics[-5:]  # Keep last 5
        
        return updated


# ============================================================================
# SINGLETON INSTANCE
# ============================================================================

scout_service = ScoutService()
```

### 3. scout.py - Updated Routes

```python
"""
Scout API endpoints - conversational job search assistant.
"""
from __future__ import annotations

import asyncio

from flask import Blueprint, jsonify, request

from app.services.scout_service import scout_service

scout_bp = Blueprint("scout", __name__, url_prefix="/api/scout")


@scout_bp.route("/chat", methods=["POST"])
def scout_chat():
    """
    Main Scout chat endpoint.
    
    Request body:
    {
        "message": "user's message or URL",
        "context": { ... optional session context ... }
    }
    
    Response:
    {
        "status": "ok" | "needs_input" | "error",
        "message": "Scout's response",
        "fields": { "job_title": "...", "company": "...", "location": "..." },
        "job_listings": [ { "title": "...", "company": "...", ... } ],
        "intent": "URL_PARSE" | "JOB_SEARCH" | "FIELD_HELP" | "RESEARCH" | "CONVERSATION",
        "context": { ... updated context for next request ... }
    }
    """
    payload = request.get_json(force=True, silent=True) or {}
    message = payload.get("message", "")
    context = payload.get("context") or {}
    
    try:
        result = asyncio.run(
            scout_service.handle_chat(
                message=message,
                context=context,
            )
        )
        return jsonify(result)
    except Exception as exc:
        print(f"[Scout] Chat endpoint failed: {exc}")
        return jsonify({
            "status": "error",
            "message": "Scout is having trouble right now. Please try again!",
            "context": context,
        }), 500


@scout_bp.route("/health", methods=["GET"])
def scout_health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "service": "scout"})
```

### 4. config.py - Add Jina API Key

Add to your `app/config.py`:

```python
import os

# Existing keys...
SERPAPI_KEY = os.getenv("SERPAPI_KEY", "")
PEOPLE_DATA_LABS_API_KEY = os.getenv("PEOPLE_DATA_LABS_API_KEY", "")

# Add this:
JINA_API_KEY = os.getenv("JINA_API_KEY", "")
```

---

## Frontend Implementation

### 5. ScoutChatbot.tsx - Updated Component

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, ExternalLink, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

const BACKEND_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:5001'
  : 'https://www.offerloop.ai';

interface SearchFields {
  job_title?: string;
  company?: string;
  location?: string;
  experience_level?: string;
}

interface JobListing {
  title: string;
  company: string;
  location?: string;
  url?: string;
  snippet?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  fields?: SearchFields;
  jobListings?: JobListing[];
  timestamp: Date;
}

interface ScoutChatbotProps {
  onJobTitleSuggestion: (title: string, company?: string, location?: string) => void;
}

const ScoutChatbot: React.FC<ScoutChatbotProps> = ({ onJobTitleSuggestion }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [context, setContext] = useState<Record<string, any>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initial greeting
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        id: 'greeting',
        role: 'assistant',
        content: "Hey! I'm Scout 🐕 Ready to help you find professionals to network with!\n\n" +
                 "You can:\n" +
                 "• **Paste a job posting URL** and I'll fill in the search for you\n" +
                 "• **Tell me what you're looking for** (e.g., 'data analyst jobs in SF')\n" +
                 "• **Ask me anything** about companies or roles\n\n" +
                 "What would you like to do?",
        timestamp: new Date(),
      }]);
    }
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(`${BACKEND_URL}/api/scout/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          context,
        }),
      });

      const data = await response.json();

      // Update context for next message
      if (data.context) {
        setContext(data.context);
      }

      // Create assistant message
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message,
        fields: data.fields,
        jobListings: data.job_listings,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Auto-populate fields if returned
      if (data.fields) {
        const { job_title, company, location } = data.fields;
        if (job_title || company || location) {
          onJobTitleSuggestion(
            job_title || '',
            company || undefined,
            location || undefined
          );
        }
      }

    } catch (error) {
      console.error('[Scout] Error:', error);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: "Oops! I ran into an issue. Please try again or rephrase your message.",
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleJobClick = (job: JobListing) => {
    onJobTitleSuggestion(job.title, job.company, job.location || undefined);
  };

  const formatMessage = (content: string) => {
    // Convert markdown-like formatting to HTML
    return content
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br />');
  };

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg p-3 ${
                  message.role === 'user'
                    ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white'
                    : 'bg-gray-800 text-gray-100 border border-gray-700'
                }`}
              >
                {/* Message content */}
                <div
                  className="text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
                />

                {/* Fields badge */}
                {message.fields && Object.keys(message.fields).length > 0 && (
                  <div className="mt-3 p-2 bg-green-500/20 border border-green-500/40 rounded-md">
                    <div className="flex items-center gap-1 text-green-400 text-xs font-medium mb-1">
                      <Sparkles className="h-3 w-3" />
                      Search fields updated!
                    </div>
                    <div className="text-xs text-green-300/80">
                      {message.fields.job_title && <span>Title: {message.fields.job_title}</span>}
                      {message.fields.company && <span> • Company: {message.fields.company}</span>}
                      {message.fields.location && <span> • Location: {message.fields.location}</span>}
                    </div>
                  </div>
                )}

                {/* Job listings */}
                {message.jobListings && message.jobListings.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs text-gray-400 font-medium">Click to use:</div>
                    {message.jobListings.slice(0, 5).map((job, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleJobClick(job)}
                        className="w-full text-left p-2 bg-gray-700/50 hover:bg-gray-700 rounded border border-gray-600 hover:border-purple-500 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="text-sm font-medium text-white">{job.title}</div>
                            <div className="text-xs text-gray-400">
                              {job.company}
                              {job.location && ` • ${job.location}`}
                            </div>
                          </div>
                          {job.url && (
                            <a
                              href={job.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-blue-400 hover:text-blue-300"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                <div className="flex items-center gap-2 text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Scout is thinking...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-700 bg-gray-900/95">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Paste a job URL or describe what you're looking for..."
            className="flex-1 bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:border-purple-500"
            disabled={isLoading}
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="mt-2 text-xs text-gray-500 text-center">
          Try: "data analyst jobs in NYC" or paste a LinkedIn/Greenhouse job URL
        </div>
      </div>
    </div>
  );
};

export default ScoutChatbot;
```

### 6. Home.tsx - Minor Update to Callback

The existing `handleJobTitleSuggestion` callback in Home.tsx should already work. Just verify it handles all three fields:

```tsx
const handleJobTitleSuggestion = (suggestedTitle: string, company?: string, location?: string) => {
  if (suggestedTitle) setJobTitle(suggestedTitle);
  if (company) setCompany(company);
  if (location) setLocation(location);
  
  const filledFields = [suggestedTitle, company, location].filter(Boolean);
  if (filledFields.length > 0) {
    toast({
      title: "Search Fields Updated",
      description: `Filled in: ${filledFields.join(', ')}`,
    });
  }
};
```

---

## Environment Variables

Add to your `.env`:

```
JINA_API_KEY=your_jina_api_key_here
```

---

## Testing Checklist

### URL Parsing Tests
- [ ] Paste Greenhouse URL → extracts title, company, location
- [ ] Paste Lever URL → extracts details
- [ ] Paste LinkedIn job URL → extracts or gracefully falls back
- [ ] Paste invalid URL → asks user to paste description

### Job Search Tests
- [ ] "data analyst jobs in San Francisco" → finds jobs, fills fields
- [ ] "software engineer at Google" → finds Google jobs
- [ ] "intern positions in NYC" → finds internships
- [ ] "find me marketing roles" → searches broadly

### Field Help Tests
- [ ] "what should I search for?" → gives suggestions
- [ ] "help me fill in the form" → explains fields
- [ ] "what job title should I use for PM?" → suggests titles

### Research Tests
- [ ] "what's the interview process at Meta?" → researches and answers
- [ ] "tell me about working at Stripe" → provides company info
- [ ] "how hard is it to get a job at McKinsey?" → researches

### Conversation Tests
- [ ] Follow-up questions work with context
- [ ] Can switch between intents mid-conversation
- [ ] Graceful error handling

### Performance Tests
- [ ] URL parsing < 10 seconds
- [ ] Job search < 15 seconds
- [ ] Research queries < 20 seconds
- [ ] No request exceeds 60 seconds

---

## Optimization Notes

1. **Parallel Processing**: Consider fetching URL content while showing "Analyzing..." message
2. **Streaming**: For longer responses, implement SSE streaming
3. **Caching**: URL content cached for 1 hour, job searches for 30 minutes
4. **Timeouts**: All external calls have explicit timeouts (5-15 seconds)
5. **Fallbacks**: Every function has graceful error handling

---

## Future Enhancements (Not in Scope)

- [ ] PDL validation of extracted fields
- [ ] Resume-based job matching
- [ ] Save favorite job listings
- [ ] Email alerts for new postings
- [ ] Interview prep integration
