# PDL Integration Discovery Report

## Executive Summary

This document provides a comprehensive analysis of the People Data Labs (PDL) integration in the Offerloop codebase, prepared for building a new "Find Recruiter" feature for job postings.

---

## 1. Current PDL Configuration

### API Configuration
- **Base URL**: `https://api.peopledatalabs.com/v5`
- **Configuration File**: `backend/app/config.py` (lines 92-95)
- **API Key Storage**: Environment variable `PEOPLE_DATA_LABS_API_KEY` loaded from `.env` file
- **Authentication Method**: API key passed in `X-Api-Key` header

```python
# From backend/app/config.py
PDL_BASE_URL = 'https://api.peopledatalabs.com/v5'
PEOPLE_DATA_LABS_API_KEY = os.getenv('PEOPLE_DATA_LABS_API_KEY')
```

### Rate Limiting & Error Handling
- **Retry Logic**: Exponential backoff implemented in `prompt_pdl_search.py` (lines 61-86)
- **Rate Limit Handling**: 429 status codes handled with `Retry-After` header support
- **Connection Pooling**: Uses `requests.Session()` for better performance (see `pdl_client.py` line 21)
- **Timeout**: 30 seconds for search requests, 10 seconds for enrichment/cleaning

### Caching
- **In-Memory Cache**: `pdl_cache = {}` dictionary in `config.py` (line 95)
- **Cache Duration**: 365 days (permanent caching for LinkedIn enrichment)
- **LRU Cache**: Used for job title enrichment, company cleaning, location cleaning (maxsize=1000)

---

## 2. Existing PDL Endpoints in Use

### Primary Endpoints

1. **Person Search** (`/person/search`)
   - **Location**: `backend/app/services/pdl_client.py` (line 1693)
   - **Usage**: Main contact search functionality
   - **Method**: POST
   - **Query Format**: Elasticsearch-style boolean queries
   - **Pagination**: Supports scroll tokens for pagination (max 100 per page)

2. **Person Enrichment** (`/person/enrich`)
   - **Location**: `backend/app/services/pdl_client.py` (line 2106)
   - **Usage**: Enrich LinkedIn profiles
   - **Method**: GET
   - **Parameters**: `profile` (LinkedIn URL), `api_key`

3. **Company Clean** (`/company/clean`)
   - **Location**: `backend/app/services/pdl_client.py` (line 853)
   - **Usage**: Normalize company names for better matching
   - **Method**: GET
   - **Parameters**: `name`, `api_key`

4. **Location Clean** (`/location/clean`)
   - **Location**: `backend/app/services/pdl_client.py` (line 884)
   - **Usage**: Normalize location names
   - **Method**: GET
   - **Parameters**: `location`, `api_key`

5. **Job Title Enrichment** (`/job_title/enrich`)
   - **Location**: `backend/app/services/pdl_client.py` (line 915)
   - **Usage**: Get standardized job titles and similar titles
   - **Method**: GET
   - **Parameters**: `job_title`, `api_key`
   - **Returns**: `cleaned_name`, `similar_job_titles`, `job_title_levels`, `job_title_categories`

6. **Autocomplete** (`/autocomplete`)
   - **Location**: `backend/app/services/pdl_client.py` (line 960)
   - **Usage**: Get autocomplete suggestions for job titles, companies, locations, schools
   - **Method**: GET
   - **Parameters**: `field`, `text`, `size`, `api_key`
   - **Field Mapping**: Frontend field names mapped to PDL field names (e.g., `job_title` → `title`)

---

## 3. PDL Service Files

### Main Service File: `backend/app/services/pdl_client.py`

**Key Functions:**

1. **`search_contacts_with_smart_location_strategy()`** (line 1991)
   - Main entry point for contact searches
   - Handles job title enrichment, company/location cleaning
   - Supports alumni filtering
   - Supports exclusion of existing contacts
   - Returns list of contact dictionaries

2. **`execute_pdl_search()`** (line 1453)
   - Executes PDL person/search API calls with pagination
   - Handles scroll tokens for multi-page results
   - Transforms PDL person records to contact format
   - Supports random skip for result variation

3. **`extract_contact_from_pdl_person_enhanced()`** (line 1201)
   - Transforms PDL person record to contact format
   - Extracts: name, email, LinkedIn, company, title, location, education, etc.
   - Handles missing/optional fields gracefully

4. **`enrich_job_title_with_pdl()`** (line 915)
   - Uses PDL job title enrichment API
   - Returns cleaned name, similar titles, levels, categories

5. **`clean_company_name()`** (line 853)
   - Normalizes company names using PDL Cleaner API

6. **`clean_location_name()`** (line 884)
   - Normalizes location names using PDL Cleaner API

7. **`get_autocomplete_suggestions()`** (line 960)
   - Provides autocomplete for various field types
   - Maps frontend field names to PDL field names

8. **`enrich_linkedin_profile()`** (line 2106)
   - Enriches LinkedIn profiles using PDL person/enrich endpoint

### Prompt-Specific Service: `backend/app/services/prompt_pdl_search.py`

**Purpose**: Isolated PDL search for prompt-first search flow (experimental feature)

**Key Functions:**

1. **`run_prompt_search()`** (line 597)
   - Progressive query relaxation strategy
   - Post-filters for alumni (doesn't include in PDL query)
   - Returns contacts with strategy metadata

2. **`_build_query()`** (line 173)
   - Builds PDL queries with progressive relaxation
   - Supports strict/loose job title and location matching
   - Optional company filtering

3. **`_call_pdl_with_pagination()`** (line 228)
   - Handles pagination with retry logic
   - Returns records and raw response

---

## 4. Current Contact Search Flow

### User Flow

1. **Frontend Request** → API Route (`/api/run` or `/api/search/prompt-run`)
2. **Route Handler** → Calls `search_contacts_with_smart_location_strategy()`
3. **PDL Service**:
   - Enriches job title (gets similar titles, levels)
   - Cleans company name
   - Cleans location name
   - Determines location strategy (metro vs locality)
   - Builds Elasticsearch-style query
   - Executes PDL search with pagination
   - Transforms results to contact format
4. **Post-Processing**:
   - Alumni filtering (if specified)
   - Email enrichment with Hunter.io (if needed)
   - Exclusion of existing contacts from user's library
5. **Response** → Returns contact list to frontend

### Search Strategies

**Location Strategies** (from `pdl_client.py` line 1061):
- `metro_primary`: Uses PDL metro areas for major cities
- `locality_primary`: Uses city/state matching
- `country_only`: United States only
- `no_location`: No location filter

**Query Building**:
- Job title: Uses `match_phrase` and `match` for flexibility
- Company: Uses both `match_phrase` and `match`
- Location: Uses `match` on `location_metro`, `location_locality`, `location_region`
- Education: Optional alumni filtering (can be in query or post-filter)

### Result Processing

**Contact Format** (from `extract_contact_from_pdl_person_enhanced()`):
```python
{
    'FirstName': str,
    'LastName': str,
    'LinkedIn': str,
    'Email': str,  # Best available email
    'Title': str,
    'Company': str,
    'City': str,
    'State': str,
    'College': str,
    'Phone': str,
    'PersonalEmail': str,
    'WorkEmail': str,
    'SocialProfiles': str,
    'EducationTop': str,
    'VolunteerHistory': str,
    'WorkSummary': str,
    'Group': str,
    'LinkedInConnections': int,
    'DataVersion': str
}
```

---

## 5. API Routes

### Main Search Routes

1. **`/api/run`** (POST) - `backend/app/routes/runs.py`
   - Free/Pro tier contact search
   - Calls `run_free_tier_enhanced_optimized()` or `run_pro_tier_enhanced_final_with_text()`
   - Includes email generation and Gmail draft creation
   - Supports alumni filtering
   - Charges 15 credits per contact

2. **`/api/search/prompt-run`** (POST) - `backend/app/routes/prompt_search.py`
   - Prompt-first search (Elite tier only)
   - Uses `run_prompt_search()` from `prompt_pdl_search.py`
   - Progressive query relaxation
   - Charges 15 credits per contact

3. **`/api/autocomplete/<data_type>`** (GET) - `backend/app/routes/enrichment.py`
   - Autocomplete suggestions for job titles, companies, locations, schools
   - Uses `get_autocomplete_suggestions()` from `pdl_client.py`

4. **`/api/enrich-job-title`** (POST) - `backend/app/routes/enrichment.py`
   - Job title enrichment
   - Uses `enrich_job_title_with_pdl()`

### Request/Response Examples

**Contact Search Request**:
```json
{
  "jobTitle": "Software Engineer",
  "company": "Google",
  "location": "San Francisco, CA",
  "collegeAlumni": "Stanford University"  // optional
}
```

**Contact Search Response**:
```json
{
  "contacts": [
    {
      "FirstName": "John",
      "LastName": "Doe",
      "Email": "john.doe@google.com",
      "LinkedIn": "https://linkedin.com/in/johndoe",
      "Title": "Senior Software Engineer",
      "Company": "Google",
      "City": "San Francisco",
      "State": "California",
      "College": "Stanford University",
      // ... other fields
    }
  ],
  "credits_charged": 45,
  "remaining_credits": 255
}
```

---

## 6. Data Models & Types

### Contact Data Structure

**Fields Extracted from PDL**:
- Identity: `FirstName`, `LastName`
- Contact: `Email`, `PersonalEmail`, `WorkEmail`, `Phone`, `LinkedIn`
- Professional: `Title`, `Company`, `WorkSummary`
- Location: `City`, `State`
- Education: `College`, `EducationTop`
- Social: `SocialProfiles`, `LinkedInConnections`
- Additional: `VolunteerHistory`, `Group`, `DataVersion`

**PDL Person Record Structure** (raw from API):
```python
{
    'first_name': str,
    'last_name': str,
    'emails': [{'address': str, 'type': str}],
    'phone_numbers': [str],
    'profiles': [{'network': str, 'url': str}],
    'experience': [{
        'company': {'name': str},
        'title': {'name': str},
        'start_date': {'year': int, 'month': int},
        'end_date': {'year': int, 'month': int}
    }],
    'education': [{
        'school': {'name': str},
        'degrees': [str],
        'start_date': {'year': int},
        'end_date': {'year': int}
    }],
    'location': {
        'locality': str,  # city
        'region': str,    # state
        'country': str
    },
    'interests': [str],
    'summary': str
}
```

### Query Structure

**Elasticsearch-Style Boolean Query**:
```python
{
    "query": {
        "bool": {
            "must": [
                {
                    "bool": {
                        "should": [
                            {"match_phrase": {"job_title": "software engineer"}},
                            {"match": {"job_title": "software engineer"}}
                        ]
                    }
                },
                {
                    "bool": {
                        "must": [
                            {"match": {"location_locality": "san francisco"}},
                            {"term": {"location_country": "united states"}}
                        ]
                    }
                },
                {
                    "bool": {
                        "should": [
                            {"match_phrase": {"job_company_name": "google"}},
                            {"match": {"job_company_name": "google"}}
                        ]
                    }
                }
            ]
        }
    },
    "size": 50
}
```

---

## 7. Frontend Integration

### Components

1. **Contact Search Form**: `connect-grow-hire/src/components/ContactSearchForm.tsx`
   - Displays search form with autocomplete
   - Shows search results in table format
   - Handles "Save to Library" functionality

2. **Contact Directory**: Same component
   - Displays saved contacts from user's library
   - Table view with pagination

### API Calls

**Search Contacts**:
```typescript
POST /api/run
Body: {
  jobTitle: string,
  company: string,
  location: string,
  collegeAlumni?: string
}
```

**Autocomplete**:
```typescript
GET /api/autocomplete/job_title?query=engineer
GET /api/autocomplete/company?query=google
GET /api/autocomplete/location?query=san fran
```

### Display Fields

Frontend displays these contact fields:
- First Name, Last Name
- LinkedIn (as clickable link)
- Email (as mailto link)
- Company, Job Title
- College
- Location (City, State)
- First Contact Date
- Status

---

## 8. Credit/Usage Tracking

### Credit System

- **Credit Cost**: 15 credits per contact returned
- **Tier Limits**:
  - Free: 3 contacts max per search (300 credits total)
  - Pro: 8 contacts max per search (1500 credits total)
  - Elite: 15 contacts max per search (3000 credits total)

### Credit Deduction

**Location**: `backend/app/routes/prompt_search.py` (lines 71-84)

```python
# Deduct credits (15 credits per contact)
contacts = result.get('contacts', [])
credits_charged = 15 * len(contacts)
user_ref.update({
    'credits': firestore.Increment(-credits_charged)
})
```

### Credit Checking

**Function**: `check_and_reset_credits()` in `backend/app/services/auth.py`
- Checks user's current credits
- Resets credits monthly based on tier
- Returns available credits

**Pre-Search Check**: Routes check credits before executing search (minimum 15 credits required)

---

## 9. Key Implementation Details

### Query Building Logic

1. **Job Title Block** (`es_title_block()` in `pdl_client.py` line 1034):
   - Uses primary title + similar titles from enrichment
   - Creates `should` clause with `match_phrase` and `match`
   - Falls back to `exists` filter if no titles provided

2. **Location Strategy** (`determine_location_strategy()` line 1061):
   - Checks if location matches PDL metro areas
   - Uses metro search for major cities (SF, NYC, LA, etc.)
   - Falls back to locality search (city/state)
   - Supports country-only searches

3. **Company Matching**:
   - Uses both `match_phrase` (exact) and `match` (tokenized)
   - Company name is cleaned via PDL Cleaner API first

4. **Alumni Filtering**:
   - Can be done in PDL query (metro search) or post-filter (locality search)
   - Uses school aliases for matching (handles "USC" vs "University of Southern California")
   - Strict filtering checks for actual degrees, not just mentions

### Pagination

- **Page Size**: Max 100 per page (PDL limit)
- **Scroll Tokens**: Used for subsequent pages
- **Skip Logic**: Random skip (0-5) for result variation

### Error Handling

- **404**: No results found (not an error, returns empty list)
- **429**: Rate limited (retries with exponential backoff)
- **400**: Bad request (logs query for debugging)
- **Timeout**: 30 seconds, retries up to 3 times

---

## 10. Limitations & Considerations

### Current Limitations

1. **PDL Query Requirements**:
   - PDL requires at least one filter in the query
   - If no filters provided, falls back to `{"exists": {"field": "job_title"}}`

2. **Location Handling**:
   - Remote locations don't work well with PDL
   - "Remote" is filtered out from searches
   - Only United States locations are supported

3. **Email Availability**:
   - Not all PDL results have emails
   - Hunter.io is used as fallback for email enrichment
   - Contacts without emails are still included (marked as "Not available")

4. **Alumni Filtering**:
   - Post-filtering (locality search) requires fetching more results
   - Query-level filtering (metro search) is more efficient
   - School aliases must be comprehensive for accurate matching

5. **Rate Limits**:
   - No explicit rate limit tracking in code
   - Relies on PDL's 429 responses
   - Retry logic handles rate limits automatically

### Considerations for "Find Recruiter" Feature

1. **Job Title Matching**:
   - Need to search for recruiter-specific titles:
     - "Technical Recruiter", "Talent Acquisition", "Campus Recruiter", etc.
   - May need to use job title enrichment to get similar titles
   - Consider using `job_title_levels` for broader matching

2. **Company Filtering**:
   - Will need to filter by company name (from job posting)
   - Use `job_company_name` field in PDL query
   - Company name should be cleaned via PDL Cleaner API

3. **Result Ranking**:
   - Technical recruiters for engineering jobs
   - Campus recruiters for intern roles
   - Sales recruiters for sales roles
   - May need to rank by job title relevance

4. **Credit Cost**:
   - Same 15 credits per contact
   - Consider limiting to 3-5 recruiters per search to control costs

5. **Integration Point**:
   - Job optimization page button
   - Should extract company name and job type from job posting
   - Can reuse existing contact search infrastructure

---

## 11. Example PDL Query for Recruiter Search

### Example: Find Technical Recruiter at Google

```python
query = {
    "query": {
        "bool": {
            "must": [
                # Job title: technical recruiter variations
                {
                    "bool": {
                        "should": [
                            {"match_phrase": {"job_title": "technical recruiter"}},
                            {"match_phrase": {"job_title": "talent acquisition"}},
                            {"match_phrase": {"job_title": "recruiter"}},
                            {"match": {"job_title": "technical recruiter"}},
                            {"match": {"job_title": "talent acquisition"}}
                        ]
                    }
                },
                # Company: Google
                {
                    "bool": {
                        "should": [
                            {"match_phrase": {"job_company_name": "google"}},
                            {"match": {"job_company_name": "google"}}
                        ]
                    }
                },
                # Location: United States (optional, could be company location)
                {
                    "term": {"location_country": "united states"}
                }
            ]
        }
    },
    "size": 10
}
```

### Ranking Strategy

1. **Exact Title Match**: "Technical Recruiter" > "Talent Acquisition" > "Recruiter"
2. **Company Match**: Current company = target company (boost)
3. **Relevance**: Engineering/technical keywords in title (for engineering jobs)

---

## 12. Related Files Summary

### Backend Files

1. **`backend/app/services/pdl_client.py`** (2234 lines)
   - Main PDL service with all search functions

2. **`backend/app/services/prompt_pdl_search.py`** (679 lines)
   - Prompt-specific PDL search (isolated)

3. **`backend/app/config.py`** (lines 92-95, 187-240)
   - PDL configuration and metro areas mapping

4. **`backend/app/routes/runs.py`**
   - Main contact search API route

5. **`backend/app/routes/prompt_search.py`**
   - Prompt-first search route

6. **`backend/app/routes/enrichment.py`**
   - Autocomplete and job title enrichment routes

### Frontend Files

1. **`connect-grow-hire/src/components/ContactSearchForm.tsx`**
   - Contact search UI component

2. **`connect-grow-hire/src/services/api.ts`**
   - API client functions

---

## 13. Recommendations for "Find Recruiter" Feature

### Implementation Approach

1. **Create New Function**: `find_recruiters_at_company()` in `pdl_client.py`
   - Takes: company name, job type (engineering, sales, intern, etc.)
   - Returns: List of recruiter contacts

2. **Job Title Mapping**:
   ```python
   RECRUITER_TITLES = {
       'engineering': ['technical recruiter', 'engineering recruiter', 'tech recruiter'],
       'sales': ['sales recruiter', 'business recruiter'],
       'intern': ['campus recruiter', 'university recruiter', 'internship recruiter'],
       'general': ['talent acquisition', 'recruiter', 'talent partner']
   }
   ```

3. **Query Building**:
   - Use company name (cleaned) as must filter
   - Use job title variations as should clause
   - Rank by title relevance to job type

4. **API Route**: Add to `backend/app/routes/runs.py` or create new route
   - `/api/find-recruiter` (POST)
   - Request: `{company: str, jobType: str}`
   - Response: Same contact format as existing search

5. **Frontend Integration**:
   - Button on job optimization page
   - Extract company and job type from job posting
   - Display results similar to contact search

### Code Reuse

- ✅ Reuse `search_contacts_with_smart_location_strategy()` logic
- ✅ Reuse `extract_contact_from_pdl_person_enhanced()` for contact transformation
- ✅ Reuse `clean_company_name()` for company normalization
- ✅ Reuse credit checking and deduction logic
- ✅ Reuse frontend contact display components

### New Code Needed

- ⚠️ Recruiter title mapping logic
- ⚠️ Job type → recruiter title matching
- ⚠️ Result ranking by relevance
- ⚠️ New API route (or extend existing)
- ⚠️ Frontend button and integration

---

## 14. Testing Considerations

### Test Cases

1. **Company Matching**:
   - Test with various company name formats
   - Test with cleaned vs. raw company names

2. **Job Type Matching**:
   - Engineering jobs → Technical Recruiters
   - Sales jobs → Sales Recruiters
   - Intern roles → Campus Recruiters

3. **Result Quality**:
   - Verify recruiters are actually at the target company
   - Check that titles match job type

4. **Edge Cases**:
   - Company with no recruiters in PDL
   - Multiple recruiters (limit to top 3-5)
   - Recruiters at parent company vs. subsidiary

---

## Conclusion

The existing PDL integration is well-structured and can be extended for the "Find Recruiter" feature. The main work involves:

1. Creating recruiter-specific job title mappings
2. Building queries that filter by company and recruiter titles
3. Ranking results by relevance to job type
4. Adding a new API endpoint
5. Integrating with the job optimization page

The infrastructure for contact search, credit tracking, and frontend display can be reused, making this a relatively straightforward feature to implement.

