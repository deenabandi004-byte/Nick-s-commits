# Scout Job Search Analysis Report

## Summary

This document provides a comprehensive analysis of the Scout feature's job search functionality, including the data source, query construction, result fetching, and identification of why the same jobs appear repeatedly.

---

## 1. Files Related to Scout and Job Searching

### Core Scout Files:
- **`backend/app/services/scout_service.py`** (6,031 lines) - Main Scout service implementation
- **`backend/app/routes/scout.py`** - API routes for Scout endpoints
- **`connect-grow-hire/src/components/ScoutChatbot.tsx`** - Frontend Scout chatbot component
- **`connect-grow-hire/src/types/scout.ts`** - TypeScript type definitions
- **`connect-grow-hire/src/services/scoutConversations.ts`** - Frontend conversation management

### Related Configuration:
- **`backend/app/config.py`** - Contains `SERPAPI_KEY` configuration

---

## 2. Job Data Source

**Primary Source: SerpAPI (Google Jobs Engine)**

Scout uses **SerpAPI** with the **Google Jobs engine** (`engine: "google_jobs"`) to fetch job listings.

**Key Details:**
- **API**: SerpAPI (serpapi.com)
- **Engine**: Google Jobs (`google_jobs`)
- **API Key Location**: `backend/app/config.py` line 19 (`SERPAPI_KEY`)
- **Import**: `backend/app/services/scout_service.py` line 19-21

```python
from serpapi import GoogleSearch
from app.config import SERPAPI_KEY, JINA_API_KEY
```

**Code Location**: `backend/app/services/scout_service.py:4193-4338`

---

## 3. Query Construction Logic

### A. Resume-Based Job Search

**Location**: `backend/app/services/scout_service.py:3720-3819`

When a user asks for jobs "based on my resume" or similar phrases, Scout:

1. **Generates Job Titles from Resume** (lines 3948-4040):
   - Uses GPT-4 to analyze the resume
   - Generates 2-3 specific job titles
   - **Prompt Location**: Lines 3975-4005
   - **Key Logic**: 
     ```python
     job_titles = await self._generate_job_titles_from_resume(user_resume)
     ```

2. **Constructs Search Queries** (lines 3793-3803):
   - For each generated job title (max 3):
     ```python
     query = title
     if location:
         query += f" in {location}"
     else:
         query += " jobs"
     ```
   - Location is extracted from resume if not provided
   - Each query is searched independently

3. **Deduplicates Results** (lines 3805-3813):
   - Uses `(title.lower(), company.lower())` tuple as key
   - Prevents same job from appearing multiple times across searches

### B. Specific Job Title Search

**Location**: `backend/app/services/scout_service.py:3861-3946`

When user specifies a job title directly:

1. **Extracts Fields** from user message:
   - Job title
   - Company (optional)
   - Location (from resume if available, or from message)

2. **Builds Query** using `_build_job_search_query()`:
   - Adds job title
   - Adds location if available: `"in {location}"`
   - Adds company if available: `"at {company}"`
   - Adds "jobs" suffix if not present

**Key Code** (lines 3925-3944):
```python
if query_parts:
    query = " ".join(query_parts)
    if "job" not in query.lower() and "internship" not in query.lower():
        query += " jobs"
```

---

## 4. Search Results Fetching

### Main Search Function

**Location**: `backend/app/services/scout_service.py:4193-4338`

**Function**: `async def _search_jobs(self, query: str) -> List[JobListing]`

### Key Implementation Details:

1. **Caching** (lines 4196-4200):
   - Results are cached for **30 minutes** (TTL: 1800 seconds)
   - Cache key: `("jobs", query)`
   - **⚠️ This means identical queries return cached results**

2. **API Call** (lines 4202-4214):
   ```python
   search = GoogleSearch({
       "engine": "google_jobs",
       "q": query,
       "api_key": SERPAPI_KEY,
       "num": 10,  # ⚠️ FIXED TO 10 RESULTS - NO PAGINATION
       "hl": "en",
       "gl": "us",
   })
   ```

3. **Result Parsing** (lines 4218-4296):
   - Parses `jobs_results` from Google Jobs API
   - Limits to **first 10 results**: `results.get("jobs_results", [])[:10]`
   - Extracts: title, company, location, description, URL
   - Falls back to `organic_results` if `jobs_results` is empty

4. **Job Listing Creation**:
   - Creates `JobListing` objects with normalized titles/companies
   - Prefers LinkedIn URLs from `apply_options`

5. **Return** (lines 4332-4333):
   ```python
   self._cache.set(cache_key, jobs, ttl=1800)  # Cache for 30 min
   return jobs
   ```

---

## 5. Pagination, Offset, and Deduplication

### ❌ **NO PAGINATION SUPPORT**

**Critical Finding**: The search function has **NO pagination, offset, or page parameters**.

**Evidence**:
- Line 4207: `"num": 10` - Hardcoded to 10 results
- Line 4219: `results.get("jobs_results", [])[:10]` - Always takes first 10
- **No `start` or `offset` parameter** in the API call
- **No `page` parameter** passed to SerpAPI

### ✅ **Deduplication Logic**

**Location**: `backend/app/services/scout_service.py:3805-3813`

Only used when multiple searches are performed (resume-based search with multiple job titles):

```python
# Deduplicate by (title, company) tuple
seen = set()
unique_jobs = []
for job in all_jobs:
    key = (job.title.lower().strip(), job.company.lower().strip())
    if key not in seen:
        seen.add(key)
        unique_jobs.append(job)
all_jobs = unique_jobs
```

**Limitation**: This only deduplicates within a single search session. It does not prevent the same jobs from appearing in subsequent searches with the same query.

---

## 6. Resume-Based Job Search Prompts

### GPT Prompt for Job Title Generation

**Location**: `backend/app/services/scout_service.py:3975-4005`

**Purpose**: Analyzes user's resume and generates 2-3 specific, searchable job titles.

**Key Instructions**:
1. Be SPECIFIC (e.g., "Full Stack Developer" not "Software Engineer")
2. Match experience level (Intern/Junior/Entry Level for recent grads)
3. Base on strongest skills and experiences
4. Use real, searchable job titles

**Example Output Format**:
```json
{
    "job_titles": ["Title 1", "Title 2", "Title 3"],
    "reasoning": "Brief explanation"
}
```

**Caching**: Results cached for 1 hour (line 4031)

---

## 7. Why Same 5 Jobs Appear Repeatedly

### Root Causes:

1. **No Pagination/Offset**:
   - Every search with the same query returns the **same top 10 results**
   - SerpAPI Google Jobs always returns results in the same order for identical queries
   - No mechanism to request "next page" of results

2. **Caching (30 minutes)**:
   - Identical queries return cached results for 30 minutes
   - Users see exact same jobs until cache expires

3. **Resume-Based Search Deduplication**:
   - When searching 3 job titles, some jobs may appear in multiple searches
   - Deduplication reduces final list (e.g., 10 + 10 + 10 → might become 5 unique jobs)
   - If all 3 searches return overlapping results, final list can be small

4. **Fixed Result Limit**:
   - Always requests exactly 10 results per query
   - No way to get more results even if available

5. **Query Construction Issues**:
   - If location or job titles are the same across searches, queries are identical
   - Identical queries → identical results

---

## 8. Code Reference Summary

| Component | File | Line Numbers | Description |
|-----------|------|--------------|-------------|
| Main Search Function | `backend/app/services/scout_service.py` | 4193-4338 | `_search_jobs()` - Fetches jobs from SerpAPI |
| Query Construction | `backend/app/services/scout_service.py` | 3861-3946 | `_build_job_search_query()` - Builds search query string |
| Resume-Based Search Handler | `backend/app/services/scout_service.py` | 3720-3819 | `_handle_job_search()` - Main job search handler |
| Job Title Generation | `backend/app/services/scout_service.py` | 3948-4040 | `_generate_job_titles_from_resume()` - GPT-based title generation |
| Deduplication Logic | `backend/app/services/scout_service.py` | 3805-3813 | Deduplicates jobs by (title, company) |
| API Routes | `backend/app/routes/scout.py` | 18-79 | `/api/scout/chat` endpoint |
| Configuration | `backend/app/config.py` | 19 | `SERPAPI_KEY` environment variable |

---

## 9. Recommendations to Fix Repeated Jobs Issue

1. **Add Pagination Support**:
   - Add `start` or `offset` parameter to SerpAPI calls
   - Allow users to request "more results" or "next page"
   - Track which results have already been shown

2. **Implement Result Tracking**:
   - Store previously shown job IDs/URLs in user session
   - Exclude already-shown jobs from new results
   - Reset when query changes significantly

3. **Reduce Cache TTL**:
   - Reduce from 30 minutes to 5-10 minutes for more fresh results
   - Or implement cache invalidation on user request

4. **Increase Result Diversity**:
   - Vary query parameters slightly (add synonyms, alternate locations)
   - Combine results from multiple search engines if available
   - Add randomization or rotation to query construction

5. **Add Query Variation**:
   - When generating job titles from resume, add more diversity
   - Include location variations (city, state, metro area)
   - Add experience level variations (entry-level, junior, etc.)

---

## Conclusion

Scout uses **SerpAPI with Google Jobs engine** to fetch job listings. The main issues causing repeated jobs are:

1. **No pagination** - Always returns the same top 10 results
2. **30-minute caching** - Identical queries return cached results
3. **Fixed 10-result limit** - No way to access more results
4. **Query similarity** - Similar queries return similar top results

The query construction and resume-based job title generation are functional, but the lack of pagination and result tracking causes the repetition issue.

