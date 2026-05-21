# Contact Search System

## PDL API Configuration

| Parameter | Value |
|-----------|-------|
| API Version | v5 |
| Base URL | `https://api.peopledatalabs.com/v5` |
| Search Type | Person Search (Elasticsearch query) |
| Company Clean | `GET /v5/company/clean` |
| Location Clean | `GET /v5/location/clean` (optional) |
| Connection Pooling | `requests.Session()` with thread lock |
| Cache | In-memory dict (`pdl_cache`) with 365-day TTL |
| Job Title Enrichment | OpenAI GPT call for similar titles |

---

## Input Processing Pipeline

### 1. Job Title Processing

**`enrich_job_title_with_pdl()`** (via `cached_enrich_job_title()` with LRU cache):
- Calls OpenAI to generate similar/related job titles
- Returns: `primary_title` + list of `similar_titles`
- Example: "Software Engineer" → ["Software Developer", "SDE", "Backend Engineer", ...]

### 2. Company Name Cleaning

**`clean_company_name()`** (via `cached_clean_company()` with LRU cache):
- Calls PDL Company Clean API: `GET /v5/company/clean?name={company}`
- Returns canonical company name (e.g., "McKinsey & Company" → "mckinsey & company")
- Falls back to original name on error

### 3. Location Resolution

**Two strategies based on input:**

#### Metro Area Strategy (`metro_primary`)
- Triggered when location matches a known metro area in `PDL_METRO_AREAS` dict
- 45+ cities mapped (e.g., "SF" → "san francisco, california", "NYC" → "new york, new york")
- Uses `location_metro` field in PDL query for broader coverage

#### Locality Strategy (fallback)
- Used when location doesn't match metro areas
- `clean_location_name()` calls PDL Location Clean API
- `_expand_us_state_abbreviation()` expands "CA" → "California" to prevent Canada misinterpretation
- `_fix_canada_misinterpretation()` corrects PDL mistaking "CA" for Canada
- Uses `location_locality` and `location_region` in PDL query

**Location Strategy Object:**
```python
{
    'strategy': 'metro_primary' | 'locality',
    'city': str,
    'state': str,
    'metro': str | None,      # For metro strategy
    'region': str | None,     # For locality strategy
}
```

### 4. Alumni Filter

**When `college_alumni` is provided:**
- Applied at both query-level (PDL education field) AND post-filter level
- `_school_aliases()` generates comprehensive name variations for the school
- Supports 30+ major schools with bidirectional alias mapping

**School Alias Examples:**
```python
"usc" → ["university of southern california", "usc viterbi", "viterbi school of engineering", "southern california"]
"mit" → ["massachusetts institute of technology", "m.i.t."]
"penn" → ["university of pennsylvania", "upenn", "wharton"]
"berkeley" → ["uc berkeley", "university of california berkeley", "cal", "california berkeley"]
```

---

## Search Strategies & Fallback Chain

### Primary Search Flow

```
contact_search_optimized() or run_free_tier_enhanced_optimized()
    │
    ├─ If alumni filter: _fetch_verified_alumni_contacts()
    │   ├─ Fetch 2x contacts, verify alumni status
    │   ├─ Max 4 attempts, max 200 total fetched
    │   └─ Increase batch size if <20% success rate
    │
    └─ If no alumni: _fetch_contacts_standard_parallel()
        └─ Run multiple strategies in parallel via ThreadPoolExecutor
```

### Strategy 1: Metro Search (`try_metro_search_optimized()`)
- Used when location maps to a known metro area
- Builds PDL query with `location_metro` field
- Includes job title + similar titles, company filter
- Returns up to `max_contacts` results

### Strategy 2: Locality Search (`try_locality_search_optimized()`)
- Used as primary when no metro match, or as fallback after metro
- Builds PDL query with `location_locality` + `location_region`
- Same title/company filters

### Strategy 3: Broader Search (`try_job_title_levels_search_enhanced()`)
- Used when metro+locality don't return enough results
- Relaxes location constraints
- Uses job title level matching (broader title categories)

### Parallel Execution
`_fetch_contacts_standard_parallel()`:
1. Runs metro + locality searches simultaneously via `ThreadPoolExecutor`
2. Deduplicates results by `get_contact_identity()` (first_name + last_name + company)
3. If still under `max_contacts`, runs broader search
4. Returns up to `max_contacts` total

### Alumni Verification (Post-Filter)

**Strict Filter:** `_contact_has_school_as_primary_education()`
- Checks if school appears in structured education data
- Requires degree indicators: `degrees`, `degree`, `end_date` + `start_date`, `field_of_study`, `major`
- Bidirectional substring matching against aliases

**Lenient Filter:** `_contact_has_school_as_primary_education_lenient()`
- Accepts if school name appears in ANY education entry
- Requires minimal indicators (even just school name length > 5)
- Also checks `College` and `EducationTop` fields

**Filter applied:** Lenient is used by default in `_fetch_verified_alumni_contacts()`.

---

## PDL Elasticsearch Query Structure

### Example Query (Metro + Title + Company + Alumni)

```json
{
  "query": {
    "bool": {
      "must": [
        {
          "bool": {
            "should": [
              {"match_phrase": {"job_title": "Software Engineer"}},
              {"match_phrase": {"job_title": "Software Developer"}},
              {"match_phrase": {"job_title": "SDE"}}
            ]
          }
        },
        {"match_phrase": {"job_company_name": "google"}},
        {"match_phrase": {"location_metro": "san francisco, california"}}
      ],
      "should": [
        {"match_phrase": {"education.school.name": {"query": "university of southern california", "boost": 3.0}}},
        {
          "bool": {
            "must": [
              {"match_phrase": {"education.school.name": "university of southern california"}},
              {"match": {"education.degrees": "bachelor"}}
            ],
            "boost": 5.0
          }
        }
      ]
    }
  },
  "size": 8
}
```

---

## Contact Extraction

### `extract_contact_from_pdl_person_enhanced()`

Maps PDL raw person data to Offerloop contact format:

| Offerloop Field | PDL Source |
|----------------|-----------|
| `FirstName` | `first_name` |
| `LastName` | `last_name` |
| `Title` | `job_title` |
| `Company` | `job_company_name` |
| `City` | `location_locality` |
| `State` | `location_region` |
| `Email` | Best email (see below) |
| `WorkEmail` | `work_email` |
| `PersonalEmail` | First from `personal_emails[]` |
| `LinkedIn` | From `profiles[]` where network="linkedin" |
| `Phone` | From `phone_numbers[]` |
| `College` | From `education[0].school.name` |
| `EducationTop` | Formatted education summary |
| `WorkSummary` | Formatted work history (current + previous) |
| `Hometown` | `location_street_address` or inferred |
| `SocialProfiles` | Dict of social network URLs |
| `education` | Raw education array (for alumni filtering) |
| `experience` | Raw experience array (for career transition detection) |

### `_choose_best_email()` - Email Priority Logic

1. `work_email` - highest priority (professional email)
2. `emails[0]` - first email in PDL emails array
3. `personal_emails[0]` - first personal email
4. `recommended_personal_email` - PDL's recommended personal
5. Returns `None` if no valid email found

Email validation: `_is_valid_email()` checks for `@`, non-empty, not "not available" / "n/a".

---

## Post-Search Processing

### Deduplication

**Contact Identity:** `get_contact_identity()` → `"first_name||last_name||company"`

- Deduplication uses `(first_name, last_name, company)` tuple - NOT email
- Email is excluded because it may be added later by Hunter.io enrichment
- `_contact_hash()` generates the identity tuple

### Exclusion List (User's Existing Contacts)

Before searching, the system loads the user's saved contacts from `users/{uid}/contacts/`:
- Builds a set of identity keys from saved contacts
- Passes as `exclude_keys` to search functions
- Any contact matching an existing key is skipped
- **Caching:** Exclusion lists cached in-memory for 1 hour (`EXCLUSION_CACHE_TTL = 3600`)
- Cache invalidated when contacts are added/removed

### Hunter.io Email Enrichment

After PDL search, contacts without emails can be enriched via Hunter.io:
- `enrich_contacts_with_hunter()` in `services/hunter.py`
- Called from `runs.py` for contacts missing email addresses
- Adds verified email addresses to contact objects

### Sorting

Contacts are returned in PDL relevance order (by default). No additional client-side sorting is applied unless the user applies filters in the frontend.
