# Job Board Population Documentation

This document explains how jobs are currently populated in the Job Board feature.

## Overview

The Job Board feature fetches real job listings from **SerpAPI Google Jobs** and displays them to users based on their preferences. The system uses Firestore caching to reduce API calls and improve performance.

---

## Architecture Flow

```
Frontend (JobBoardPage.tsx)
    ↓
API Service (api.ts) - getJobListings()
    ↓
Backend Endpoint (/api/job-board/jobs)
    ↓
SerpAPI Google Jobs Integration
    ↓
Firestore Cache (job_cache collection)
    ↓
Transform & Score Jobs
    ↓
Return to Frontend
```

---

## Frontend Implementation

### Location
`connect-grow-hire/src/pages/JobBoardPage.tsx`

### Job Fetching Logic

The frontend fetches jobs in a `useEffect` hook that triggers when the user is authenticated and preferences are loaded:

```typescript
useEffect(() => {
  const fetchJobs = async () => {
    if (!user?.uid || !userPreferences) return;
    setLoadingJobs(true);
    try {
      const response = await apiService.getJobListings({
        jobTypes: userPreferences.jobTypes || ["Internship"],
        industries: userPreferences.industries || [],
        locations: userPreferences.locations || [],
        page: 1,
        perPage: 200, // Request more jobs per page
      });
      
      if (response.jobs && response.jobs.length > 0) {
        setJobs(response.jobs);
      }
    } catch (error) {
      console.error("Error fetching jobs:", error);
    } finally {
      setLoadingJobs(false);
    }
  };
  fetchJobs();
}, [user?.uid, userPreferences]);
```

### User Preferences

User preferences are fetched from Firestore:

1. **Job Types**: From `users/{uid}/jobTypes` or `users/{uid}/professionalInfo/jobTypes` (default: `["Internship"]`)
2. **Industries**: From `users/{uid}/professionalInfo/targetIndustries` or `users/{uid}/targetIndustries`
3. **Locations**: From `users/{uid}/locationPreferences` or `users/{uid}/professionalInfo/locationPreferences`

### API Service Method

**Location**: `connect-grow-hire/src/services/api.ts`

```typescript
async getJobListings(params: JobListingsRequest): Promise<JobListingsResponse> {
  const response = await this.makeRequest<JobListingsResponse>(
    '/job-board/jobs',
    {
      method: 'POST',
      headers: {
        ...await this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    }
  );
  return response;
}
```

**Request Parameters**:
- `jobTypes`: Array of job types (e.g., `["Internship", "Full-Time"]`)
- `industries`: Array of industries (e.g., `["Technology", "Finance"]`)
- `locations`: Array of locations (e.g., `["San Francisco, CA"]`)
- `page`: Page number (default: 1)
- `perPage`: Jobs per page (default: 20, frontend requests 200 for first page)
- `refresh`: Boolean to bypass cache (default: false)
- `searchQuery`: Optional direct search query

**Response Format**:
```typescript
{
  jobs: Job[];
  total: number;
  estimatedTotal?: number;
  page?: number;
  perPage?: number;
  hasMore?: boolean;
  source: string; // "serpapi" or "demo"
  query?: string;
  location?: string;
  cached?: boolean;
}
```

---

## Backend Implementation

### Location
`backend/app/routes/job_board.py`

### Main Endpoint

**Route**: `POST /api/job-board/jobs`

**Decorator**: `@require_firebase_auth` (requires Firebase authentication)

**Function**: `get_job_listings()`

### Processing Flow

#### 1. Extract Request Parameters

```python
job_types = data.get("jobTypes", ["Internship"])
industries = data.get("industries", [])
locations = data.get("locations", [])
search_query = data.get("searchQuery", "")
refresh = data.get("refresh", False)  # Bypasses cache if True
page = data.get("page", 1)
per_page = data.get("perPage", 20)
```

#### 2. Fetch User Resume Data

The backend fetches user data from Firestore to improve job matching:

- **Major**: `users/{uid}/professionalInfo/fieldOfStudy` or `professionalInfo/major`
- **Skills**: `users/{uid}/resumeParsed/skills`
- **Key Experiences**: `users/{uid}/resumeParsed/key_experiences`

This data is used to:
- Build better search queries
- Score jobs based on resume match (0-100 score)

#### 3. Build Search Query

If no `searchQuery` is provided, the backend builds a query using `build_search_query()`:

**Query Building Logic**:
- Adds job type keywords (e.g., "internship", "entry level")
- Adds top 2-3 skills from resume
- Adds industry keywords (maps industries to relevant job titles)
- Falls back to user's major if no industries specified
- Default fallback: "entry level jobs"

**Example Query**: `"internship (Python OR JavaScript OR React) software engineer OR product manager"`

#### 4. Build Location Query

Uses `build_location_query()` to determine location:
- Returns first location from array
- If location contains "remote", defaults to "United States"
- Default: "United States"

#### 5. Fetch Jobs from SerpAPI

**Function**: `fetch_jobs_from_serpapi()`

**SerpAPI Configuration**:
- **API Key**: `SERPAPI_KEY` or `SERP_API_KEY` environment variable
- **Endpoint**: `https://serpapi.com/search`
- **Engine**: `google_jobs`
- **Results per page**: 10 (Google Jobs API limit)

**First Page Behavior** (page == 1):
- Fetches **up to 200 jobs** by making multiple paginated requests
- Makes up to 20 API calls (20 pages × 10 jobs = 200 jobs max)
- Uses `next_page_token` for pagination (with fallback to `start` parameter)

**Subsequent Pages**:
- Fetches `perPage` jobs using pagination tokens
- Makes only necessary API calls

**Pagination Methods**:
1. **Primary**: `next_page_token` (preferred, provided by SerpAPI)
2. **Fallback**: `start` parameter (offset-based, e.g., `start=10`)

#### 6. Cache Management

**Firestore Collection**: `job_cache`

**Cache Key Format**:
```
MD5("{query.lower()}|{location.lower()}|{job_type or 'all'}|{page_token or 'first'}")
```

**Cache Duration**: 6 hours (`CACHE_DURATION_HOURS = 6`)

**Cache Structure**:
```python
{
  "jobs": List[Dict],  # Array of job objects
  "query": str,
  "location": str,
  "job_type": Optional[str],
  "cached_at": datetime,
  "expires_at": datetime,
  "result_count": int,
  "next_page_token": Optional[str]  # For pagination
}
```

**Cache Behavior**:
- Only first page is cached (avoids pagination token issues)
- Cache is bypassed if `refresh=True`
- Legacy cache format (jobs list only) is handled gracefully

#### 7. Job Transformation

Raw SerpAPI jobs are transformed to our format:

**Field Mapping**:
- `job_id` → `id` (with fallback hash if missing)
- `title` → `title`
- `company_name` → `company`
- `location` → `location`
- `detected_extensions.salary` or `extensions` → `salary`
- `extensions` → `type` (detected: "Internship", "Full-Time", "Part-Time", "Contract")
- `extensions` → `remote` (boolean)
- `detected_extensions.posted_at` → `posted`
- `job_highlights` → `requirements` (extracted from "Qualifications" section)
- `apply_options` → `url` (prioritizes LinkedIn links)
- `thumbnail` → `logo`

**Link Priority** (for `url` field):
1. LinkedIn link (if available in `apply_options`)
2. Direct company link (first `apply_options` link)
3. `related_links` (first link)
4. `share_link` (fallback)
5. Empty string (if none found)

#### 8. Resume-Based Scoring

**Function**: `score_jobs_by_resume_match()`

Adds a `matchScore` field (0-100) to each job based on:
- **Skills Match**: Up to 30 points (checks if user skills appear in job title/description)
- **Experience Match**: Up to 20 points (checks if user experiences match job requirements)
- **Major Match**: 10 points (checks if user major appears in job text)
- **Base Score**: 50 points

Jobs are then ranked by this score.

#### 9. Pagination & Response

**First Page**:
- Returns all fetched jobs (up to 200)
- `hasMore = True` if 200 jobs were fetched

**Subsequent Pages**:
- Returns `perPage` jobs using slice
- `hasMore = True` if full page of results

**Response**:
```python
{
  "jobs": List[Job],
  "total": int,
  "estimatedTotal": int,
  "page": int,
  "perPage": int,
  "hasMore": bool,
  "source": "serpapi" | "demo",
  "query": str,
  "location": str,
  "cached": bool
}
```

---

## SerpAPI Integration Details

### API Endpoint
`https://serpapi.com/search`

### Request Parameters
```python
{
  "engine": "google_jobs",
  "q": "search query",
  "location": "location string",
  "api_key": "SERPAPI_KEY",
  "hl": "en",
  "num": 10,  # Max results per page
  "next_page_token": "token"  # Optional, for pagination
}
```

### Response Structure
```json
{
  "jobs_results": [
    {
      "job_id": "string",
      "title": "string",
      "company_name": "string",
      "location": "string",
      "description": "string",
      "via": "string",
      "thumbnail": "url",
      "apply_options": [
        {
          "link": "url",
          "site": "site_name"
        }
      ],
      "extensions": ["string"],
      "detected_extensions": {
        "posted_at": "string",
        "salary": "string"
      },
      "job_highlights": [
        {
          "title": "string",
          "items": ["string"]
        }
      ],
      "related_links": [{"link": "url"}],
      "share_link": "url"
    }
  ],
  "pagination": {
    "next_page_token": "string"
  },
  "serpapi_pagination": {
    "next": "url_or_token"
  }
}
```

### Rate Limits & Costs
- SerpAPI has rate limits based on plan
- Google Jobs API returns 10 results per request
- Multiple requests needed to fetch 200 jobs (20 requests for first page)

---

## Caching Strategy

### Firestore Collection
`job_cache`

### Cache Key Generation
```python
cache_string = f"{query.lower().strip()}|{location.lower().strip()}|{job_type or 'all'}|{page_token or 'first'}"
cache_key = hashlib.md5(cache_string.encode()).hexdigest()
```

### Cache Lifecycle
1. **Write**: When jobs are fetched from SerpAPI
2. **Read**: Before making SerpAPI request (only for first page, without pagination token)
3. **Expiry**: 6 hours after `cached_at` timestamp
4. **Cleanup**: `clear_expired_cache()` function (can be called periodically)

### Cache Invalidation
- **Manual**: Set `refresh=True` in request
- **Automatic**: Cache expires after 6 hours
- **Bypass**: Paginated requests (page > 1) don't use cache

---

## Error Handling & Fallbacks

### SerpAPI Failures
- **No API Key**: Returns empty array, falls back to mock data
- **API Error**: Logs error, returns empty array
- **Network Error**: Logs error, returns empty array
- **Invalid Response**: Logs error, returns empty array

### Fallback to Mock Data
**Function**: `get_mock_jobs()`

If no jobs are returned from SerpAPI, the system falls back to mock job data:
- Generates demo jobs based on job types, industries, and locations
- Sets `source: "demo"` in response
- Used for development/testing when SerpAPI is unavailable

---

## Performance Optimizations

### 1. Caching
- 6-hour cache reduces API calls
- Only caches first page (avoids pagination complexity)

### 2. Batch Fetching
- First page fetches 200 jobs in one request cycle
- Reduces multiple round-trips for users

### 3. Resume-Based Filtering
- Jobs are pre-scored on backend
- Frontend can sort/filter without additional API calls

### 4. Pagination
- Uses efficient token-based pagination
- Falls back to offset-based if tokens unavailable

### 5. Deduplication
- Jobs are deduplicated by `id` field before returning

---

## Frontend Filtering & Display

### Client-Side Filtering

After jobs are fetched, the frontend applies filters:

```typescript
const filteredJobs = jobs.filter((job) => {
  const matchesSearch = !searchQuery || 
    job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    job.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
    job.location.toLowerCase().includes(searchQuery.toLowerCase());
  const matchesType = selectedJobType === "all" || job.type === selectedJobType;
  return matchesSearch && matchesType;
});
```

### Pagination

Frontend pagination (not backend pagination):
- **Jobs per page**: 12 (`JOBS_PER_PAGE = 12`)
- Jobs are sliced client-side: `filteredJobs.slice((currentPage - 1) * JOBS_PER_PAGE, currentPage * JOBS_PER_PAGE)`

---

## Job Data Structure

### Job Interface (TypeScript)
```typescript
interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  salary?: string;
  type: "Internship" | "Full-Time" | "Part-Time" | "Contract";
  posted: string;
  description: string;
  requirements: string[];
  url: string;
  logo?: string;
  remote?: boolean;
  experienceLevel?: string;
  via?: string;
  matchScore?: number; // 0-100, added by backend scoring
}
```

### Example Job Object
```json
{
  "id": "serp_0_123456789",
  "title": "Software Engineering Intern",
  "company": "Google",
  "location": "Mountain View, CA",
  "salary": "$120,000 - $150,000 a year",
  "type": "Internship",
  "posted": "2 days ago",
  "description": "Join our team as a Software Engineering Intern...",
  "requirements": [
    "Bachelor's degree in Computer Science",
    "Experience with Python or Java",
    "Strong problem-solving skills"
  ],
  "url": "https://www.linkedin.com/jobs/view/123456",
  "logo": "https://...",
  "remote": false,
  "experienceLevel": "entry",
  "via": "LinkedIn",
  "matchScore": 85
}
```

---

## Configuration

### Environment Variables

**Required**:
- `SERPAPI_KEY` or `SERP_API_KEY`: SerpAPI API key for Google Jobs

**Optional**:
- None (cache duration and credit costs are hardcoded)

### Constants

**Backend** (`backend/app/routes/job_board.py`):
- `CACHE_DURATION_HOURS = 6`: Cache expiry time
- `OPTIMIZATION_CREDIT_COST = 20`: Credits for resume optimization
- `COVER_LETTER_CREDIT_COST = 15`: Credits for cover letter generation

**Frontend** (`connect-grow-hire/src/pages/JobBoardPage.tsx`):
- `JOBS_PER_PAGE = 12`: Jobs displayed per page in UI

---

## Troubleshooting

### No Jobs Returned

1. **Check SerpAPI Key**: Verify `SERPAPI_KEY` environment variable is set
2. **Check Logs**: Look for `[JobBoard]` log messages in backend
3. **Check Cache**: Try `refresh: true` in request to bypass cache
4. **Check SerpAPI Status**: Verify SerpAPI service is operational

### Slow Performance

1. **Cache Hit Rate**: Check if cache is being used (look for `"cached": true` in response)
2. **API Calls**: Monitor SerpAPI request count (first page makes up to 20 calls)
3. **Network**: Check network latency to SerpAPI

### Pagination Issues

1. **Tokens**: Check logs for `next_page_token` availability
2. **Fallback**: System automatically falls back to `start` parameter if tokens unavailable
3. **Empty Results**: If consecutive empty results, pagination stops

---

## Future Improvements

Potential enhancements to consider:

1. **Background Job Refresh**: Pre-fetch and cache jobs in background
2. **User-Specific Caching**: Cache jobs per user based on their preferences
3. **Multiple Data Sources**: Integrate additional job APIs (LinkedIn, Indeed, etc.)
4. **Real-Time Updates**: WebSocket updates for new jobs
5. **Smart Filtering**: Backend-side filtering to reduce frontend load
6. **Job Recommendations**: ML-based job recommendations based on user behavior

---

## Related Files

- **Backend Route**: `backend/app/routes/job_board.py`
- **Frontend Page**: `connect-grow-hire/src/pages/JobBoardPage.tsx`
- **API Service**: `connect-grow-hire/src/services/api.ts`
- **Types**: `connect-grow-hire/src/services/api.ts` (JobListingsRequest, Job, etc.)
- **Analysis Document**: `JOB_BOARD_CODEBASE_ANALYSIS.md`
- **Fix Documentation**: `JOB_BOARD_10_JOB_LIMIT_FIX.md`

---

**Last Updated**: 2024
**Version**: 1.0

