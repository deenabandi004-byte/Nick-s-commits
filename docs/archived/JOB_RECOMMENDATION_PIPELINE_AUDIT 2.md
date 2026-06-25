# 🔍 Job Recommendation System Pipeline Audit
## Comprehensive Data → Decision → Output Analysis

**Date:** 2024  
**Purpose:** Read-only diagnostic audit of job recommendation pipeline  
**Scope:** Full trace from onboarding data collection through job output

---

## 1️⃣ ONBOARDING DATA INVENTORY

### Data Collection Points

#### Step 1: Profile (OnboardingProfile.tsx)
| Field Name | Saved Location | Data Type | Step | Used Later? | Where Used? |
|------------|----------------|-----------|------|-------------|-------------|
| `firstName` | `users/{uid}.profile.firstName` | string | Profile | ❌ **UNUSED** | Collected but never read |
| `lastName` | `users/{uid}.profile.lastName` | string | Profile | ❌ **UNUSED** | Collected but never read |
| `email` | `users/{uid}.email` | string | Profile | ✅ | Authentication, user identification |
| `phone` | `users/{uid}.profile.phone` | string | Profile | ❌ **UNUSED** | Collected but never read |
| `resume` | `users/{uid}.resumeParsed` | object | Profile | ✅ | Resume optimization, profile extraction |

#### Step 2: Academics (OnboardingAcademics.tsx)
| Field Name | Saved Location | Data Type | Step | Used Later? | Where Used? |
|------------|----------------|-----------|------|-------------|-------------|
| `university` | `users/{uid}.academics.university` OR `professionalInfo.university` | string | Academics | ✅ | `get_user_career_profile()` → `extract_user_profile_from_resume()` → `get_job_keywords_for_major()` |
| `degree` | `users/{uid}.academics.degree` OR `professionalInfo.degree` | enum | Academics | ❌ **UNUSED** | Collected (associate/bachelor/master/doctoral) but never read in job matching |
| `major` | `users/{uid}.academics.major` OR `professionalInfo.major` | string | Academics | ✅ | **PRIMARY SIGNAL** - Used in query generation (`build_personalized_queries`) and scoring (`calculate_field_affinity`) |
| `graduationMonth` | `users/{uid}.academics.graduationMonth` | string | Academics | ❌ **UNUSED** | Collected but never read |
| `graduationYear` | `users/{uid}.academics.graduationYear` OR `professionalInfo.graduationYear` | string | Academics | ✅ | Used in `get_user_career_profile()` for graduation timing scoring (2 points max) |

#### Step 3: Location Preferences (OnboardingLocationPreferences.tsx)
| Field Name | Saved Location | Data Type | Step | Used Later? | Where Used? |
|------------|----------------|-----------|------|-------------|-------------|
| `country` | `users/{uid}.location.country` | string | Location | ❌ **UNUSED** | Collected but never read |
| `state` | `users/{uid}.location.state` | string | Location | ❌ **UNUSED** | Collected but never read |
| `city` | `users/{uid}.location.city` | string | Location | ❌ **UNUSED** | Collected but never read |
| `jobTypes` | `users/{uid}.location.jobTypes` OR `users/{uid}.jobTypes` | array<string> | Location | ✅ | Used in job query filtering (`build_personalized_queries`) and scoring base relevance (5 points) |
| `interests` | `users/{uid}.location.interests` OR `users/{uid}.careerInterests` | array<string> | Location | ⚠️ **PARTIALLY USED** | Saved as `careerInterests` but only used in scoring (4 points max) - **NOT used in query generation** |
| `preferredLocation` | `users/{uid}.location.preferredLocation` | array<string> | Location | ❌ **CRITICAL MISSING** | **Collected but NEVER used in job queries** - Only uses locations from API request, not from user profile |

### Resume Upload State
- **Location:** `users/{uid}.resumeParsed` (nested object with education, experience, skills, projects)
- **When Collected:** During onboarding profile step OR later via Account Settings
- **Used For:** 
  - Profile extraction (`extract_user_profile_from_resume()`)
  - Skills matching (30 points in scoring)
  - Experience relevance (15 points)
  - Major extraction (fallback if onboarding major missing)

### Critical Findings: Unused Onboarding Fields

**Fields collected but completely unused:**
1. `firstName`, `lastName`, `phone` - Profile step
2. `country`, `state`, `city` - Location step  
3. `degree` - Academics step
4. `graduationMonth` - Academics step
5. **`preferredLocation`** - **CRITICAL:** Collected as array but never read from user profile for job queries

**Fields partially used:**
- `careerInterests` (interests) - Only used in scoring (4 points), NOT in query generation

---

## 2️⃣ USER CAREER PROFILE ASSEMBLY

### Function: `get_user_career_profile(uid: str)` 
**Location:** `backend/app/routes/job_board.py:743`

### Profile Construction Logic

#### Primary Source Priority:
1. **Resume parsed data** (`resumeParsed` - new nested format OR old flat format)
2. **Professional info** (`professionalInfo` - onboarding academics/location data)
3. **Top-level user fields** (fallback)

#### Field Extraction Details:

**Education Fields:**
```python
major = (
    education.get('major') or              # New resume format
    resumeParsed.get('major') or           # Old resume format
    professional_info.get('fieldOfStudy') or
    professional_info.get('major') or      # Onboarding academics
    ''
)
```
**Precedence:** Resume → Professional Info → Empty

**Graduation Year:**
```python
year_str = profile.get('graduation') or professional_info.get("graduationYear")
```
**Issue:** Only takes first 4 digits, may fail for "May 2026" format

**Skills Assembly:**
- New format: Combines `programming_languages`, `tools_frameworks`, `core_skills`, `databases`, `cloud_devops`
- Old format: Flat `skills` array
- **Limit:** Top 20 skills used in matching

**Interests Extraction:**
```python
interests = professional_info.get("interests", [])
if not interests:
    interests = user_data.get("interests", [])  # Fallback
```
**Issue:** `careerInterests` from onboarding saved as `location.interests` but read from `professionalInfo.interests` - **FIELD MISMATCH**

**Job Types:**
```python
job_types = user_data.get("jobTypes", [])
```
**Read from:** Top-level `user_data.jobTypes`, NOT from `location.jobTypes` where it's saved in onboarding

### Fields Expected vs Missing

**Expected by scoring function:**
- `major` ✅ (has fallback chain)
- `skills` ✅ (array, limited to 20)
- `experiences` ✅ (array of {title, company, keywords}, limited to 10)
- `extracurriculars` ✅ (array of {name, role, description}, limited to 15)
- `interests` ⚠️ (may be empty due to field mismatch)
- `graduation_year` ✅ (integer, extracted from string)
- `gpa` ⚠️ (optional, from professionalInfo)
- `target_industries` ⚠️ (from request params OR professionalInfo, may be empty)
- `job_types` ⚠️ (from request params, NOT from saved profile)

**Fields Mismatched (saved in one place, read from another):**
1. **`interests`/`careerInterests`**: 
   - Saved: `location.interests` or `location.careerInterests` 
   - Read: `professionalInfo.interests` or top-level `interests`
   - **Result:** Often empty when it shouldn't be

2. **`jobTypes`**:
   - Saved: `location.jobTypes` 
   - Read: Top-level `jobTypes` (from request, not profile)

3. **`preferredLocation`**:
   - Saved: `location.preferredLocation` (array)
   - Read: **NEVER READ** - Only uses request params

### Resume Parsing Failure Handling

**If resume parsing fails:**
- Major: Falls back to `professionalInfo.major` or `professionalInfo.fieldOfStudy`
- Skills: Empty array → Skills matching gets 0 points (30 points lost)
- Experience: Empty array → Experience relevance gets 0 points (15 points lost)
- **Net Impact:** User loses up to 45/100 match score points

**If resume incomplete:**
- Partial data is used (e.g., only education section parsed)
- Missing sections result in empty arrays
- Scoring continues with available data

---

## 3️⃣ JOB QUERY GENERATION

### Function: `build_personalized_queries(user_profile: dict, job_types: List[str])`
**Location:** `backend/app/routes/job_board.py:1288`

### Query Generation Logic

#### Inputs Used:
1. ✅ `major` - **PRIMARY INPUT** (Query 1: highest priority, weight 1.2)
2. ✅ `skills` - Query 2 & 2.5 (weight 1.1-1.15)
3. ✅ `extracurriculars` - Query 3 (weight 1.15)
4. ✅ `target_industries` - Query 4 (weight 1.0)
5. ⚠️ `interests` - Query 5 (lowest priority, weight 1.0) - **Only uses first interest**
6. ❌ **`preferredLocation`** - **NOT USED IN QUERY GENERATION**
7. ✅ `job_types` - Used as prefix ("internship", "entry level", etc.)

#### Query Examples for USC Finance Major (Graduation 2026, Interest: Investment Banking)

**Expected Queries Generated:**
```python
# Query 1 (Major-focused, weight 1.2):
"internship (Financial Analyst OR Investment Banking OR Private Equity OR Asset Management)"

# Query 2 (Skills-focused, weight 1.1):
"internship (Excel OR Financial Modeling OR Python OR Bloomberg)"  # Example skills

# Query 2.5 (Skill-pair, weight 1.15):
"internship Excel Financial Modeling"

# Query 3 (Extracurriculars, weight 1.15):
"internship (Investment Banking OR Financial Analyst OR Trader)"  # If EC signals extracted

# Query 4 (Industry, weight 1.0):
"internship financial OR banking"  # If target_industries includes "Finance"

# Query 4.5 (Remote, weight 1.1):
"remote internship (Financial Analyst OR Investment Banking OR Private Equity OR Asset Management)"

# Query 5 (Interests, weight 1.0):
"internship Investment Banking"  # Only first interest used

# Query 6 (Top Companies, weight 1.25):
"internship (\"Goldman Sachs\" OR \"JP Morgan\" OR \"JPMorgan\" OR \"Morgan Stanley\" OR \"Bank of America\")"
```

**Location Used:** Only from **request parameters**, NOT from user profile `preferredLocation`

```python
# build_location_query() is called with request.locations, NOT user_profile.preferredLocation
location = build_location_query(locations)  # locations from API request
# Result: "New York, NY" (from request) OR "United States" (default)
```

### Major to Job Title Mapping

**Function:** `get_job_keywords_for_major(major: str)`
**Location:** `backend/app/routes/job_board.py:1055`

**For "Finance" major:**
```python
# Returns from MAJOR_TO_JOBS mapping:
["financial analyst", "investment banking", "private equity", "asset management", "trader"]
```

**Special Cases:**
- Combined majors like "Data Science and Economics" → Returns combined job titles
- Partial matching: "Business Finance" → Matches "finance" keyword → Returns finance jobs
- Fallback: Returns `["entry level", "associate", "analyst", "coordinator"]` if no match

**Issue:** Mapping is case-sensitive lowercase matching - "Finance" must match "finance" (which it does after `.lower()`)

### Query Characteristics

**Generic vs Specific:**
- **Most Specific:** Query 1 (major-focused) - Targets exact job titles
- **Moderate:** Query 2.5 (skill-pair) - Combines 2 specific skills
- **Generic:** Query 4 (industry) - Uses broad keywords like "financial OR banking"
- **Very Generic:** Query 5 (interests) - Single interest term, no job title context

**Query Limits:**
- Top 4 queries executed (reduced from 6 for performance)
- 20 jobs per query (2 pages × 10 jobs/page)
- Max 50 jobs total fetched (reduced from 150)

---

## 4️⃣ JOB FILTERING & GATING

### Hard Filters (Before Scoring)

**Function:** `is_job_quality_acceptable(job: dict, min_quality_score: int = 0)`
**Location:** `backend/app/routes/job_board.py:1944`

#### Explicit Filters:

1. **Company Name Quality:**
   - ❌ Rejects: `company in ["company", "employer", "organization", "confidential", ""]`
   - ❌ Rejects: Companies matching `LOW_QUALITY_COMPANY_PATTERNS` (staffing agencies) UNLESS description > 300 chars

2. **Description Length:**
   - ❌ Rejects: `len(description) < 50`

3. **Spam Detection:**
   - ❌ Rejects: Jobs with `SPAM_KEYWORDS` in description ("make money fast", "!!!", etc.)

4. **Recency Filter:**
   - ❌ Rejects: Jobs older than `MAX_JOB_AGE_DAYS` (default: 30 days)

5. **Quality Score Threshold:**
   - ⚠️ Rejects: `quality_score < MIN_QUALITY_SCORE` (default: 15)
   - **Issue:** Quality score is separate from match score - low-quality but well-matched jobs are filtered out

#### What Slips Through:

**No Hard Filters For:**
- ❌ **Seniority mismatch** (Senior SWE jobs for freshmen) - Only soft filter via graduation timing (2 points)
- ❌ **Location mismatch** (Jobs in random cities when user wants NYC/SF) - **Location NOT used in filtering**
- ❌ **Industry mismatch** (Tech jobs for Finance major) - Only soft filter via field affinity (20 points max)
- ❌ **Job type mismatch** (Full-time when user wants Internship) - Only soft filter in base relevance (5 points)

**Example:** A Senior Software Engineer role in Seattle for a Finance major wanting Investment Banking internships in NYC would:
- ✅ Pass all hard filters (real company, good description, recent, no spam)
- ⚠️ Get low match score (15 base + 2 field affinity + 0 skills = 17/100)
- ✅ Still appear if no better jobs found (quality score 25+ could push it through)

---

## 5️⃣ MATCH SCORING BREAKDOWN

### Function: `score_job_for_user(job: dict, user_profile: dict, query_weight: float = 1.0)`
**Location:** `backend/app/routes/job_board.py:1650`

### Scoring System (100 points max)

#### 1. BASE RELEVANCE (20 points max)
- **15 points:** Having a profile (major OR skills exists)
- **5 points:** Job type match (user's `job_types` contains job's type)
- **Dependency:** `user_profile.job_types` (from request, NOT saved profile)

#### 2. FIELD/MAJOR AFFINITY (20 points max)
- **Function:** `calculate_field_affinity(major, job_title, job_desc)`
- **Returns:** 0.0 - 1.0 multiplier
- **Calculation:** 
  - Field clusters: tech_fields, finance_fields, engineering_fields, science_fields
  - Job type indicators: pure_tech_jobs, data_tech_jobs, pure_finance_jobs, quant_jobs
  - Strong matches: 0.95 (e.g., Finance major → Investment Banking)
  - Weak matches: 0.15 (e.g., Finance major → Software Engineer)
- **Score:** `affinity * 20`
- **Issue:** Uses weak string matching - "finance" in major, "investment banking" in title

#### 3. SKILLS MATCH (30 points max)
- **Process:**
  1. Iterates through top 15 skills
  2. Uses `semantic_skill_match()` to check job title (6 points × confidence)
  3. Uses `semantic_skill_match()` to check job description (3 points × confidence, min 0.8)
  4. Multiplier bonus: `1 + 0.03 * min(total_matches, 5)`
- **Dependency:** `user_profile.skills` array (from resume OR empty)
- **Issue:** Generic terms filtered out ("strong", "excellent", "team") but may miss relevant skills

#### 4. EXPERIENCE RELEVANCE (15 points max)
- **Process:**
  1. Iterates through top 5 experiences
  2. Title word match: +4 points per matching word (>3 chars)
  3. Keyword match: +1.5 points × confidence per keyword
- **Dependency:** `user_profile.experiences` array (from resume)
- **Issue:** Only matches single words, not phrases

#### 5. ADDITIONAL SIGNALS (15 points max)
- **Extracurriculars (6 points):** Word match in job text (2 points per match, max 3 matches)
- **Interests (4 points):** String match `interest.lower() in job_text` (1.5 points per match, max 5 interests)
- **Industry Match (3 points):** `target_industries` keyword match
- **Graduation Timing (2 points):** 
  - New grad + entry level job = +2
  - 1 year to grad + internship = +2
  - >1 year to grad + internship = +2
- **Dependency:** All from user_profile (may be empty due to field mismatches)

### Final Score Calculation

```python
score = score * query_weight  # Applied AFTER all other scoring
return max(0, min(100, int(round(score))))
```

**Query Weight Impact:**
- Major query jobs: `score × 1.2` (20% boost)
- Skills query jobs: `score × 1.1` (10% boost)
- Top companies query jobs: `score × 1.25` (25% boost)
- **Issue:** Query weight can push mediocre matches (60 points) to good scores (75 points) even if not actually relevant

### Combined Score (Match + Quality)

**Function:** `score_jobs_by_resume_match()`
**Location:** `backend/app/routes/job_board.py:2027`

```python
combined_score = (match_score * 0.7) + (quality_score * 0.6)
```

**Issue:** Mathematical error - should be `(match_score * 0.7) + (quality_score * 0.3)` for proper weighting (70/30 split), but uses `0.6` for quality which means total can exceed 100.

**Actual Calculation:**
- Match score: 0-100 × 0.7 = 0-70
- Quality score: 0-50 × 0.6 = 0-30
- Combined: 0-100 (correct range by accident, but quality gets 30% weight, not intended 30%)

### Quality Score (Separate System)

**Function:** `calculate_quality_score(job: dict)`
**Location:** `backend/app/routes/job_board.py:1810`

**Components (0-50 points):**
- Description quality: 0-15 (length, structure, salary info)
- Source quality: 0-10 (LinkedIn = +10, generic recruiter = -5)
- Company quality: 0-15 (FAANG = +15, Fortune 500 = +12, staffing = -10)
- Recency: 0-10 (hours = +10, weeks = +5, months = -3)

**Issue:** Quality score can dominate - A high-quality but irrelevant job (e.g., Senior SWE at Google for Finance major) gets quality_score=40, match_score=20, combined=32, which may outrank relevant but lower-quality jobs.

---

## 6️⃣ OUTPUT REALITY CHECK

### Hypothetical User Profile

- **University:** USC
- **Major:** Finance
- **Graduation:** 2026 (May)
- **Career Interest:** Investment Banking
- **Preferred Locations:** NYC, SF
- **Job Type:** Internship
- **Skills:** Excel, Financial Modeling, Bloomberg Terminal (from resume)
- **Extracurriculars:** Investment Banking Club (President)

### What Queries Are Generated

**Query 1 (Major, weight 1.2):**
```
"internship (Financial Analyst OR Investment Banking OR Private Equity OR Asset Management)"
```
**Location used:** "United States" (default, since preferredLocation NOT read from profile)

**Query 2 (Skills, weight 1.1):**
```
"internship (Excel OR Financial Modeling OR Bloomberg Terminal OR Python)"
```

**Query 3 (Extracurriculars, weight 1.15):**
```
"internship (Investment Banking OR Financial Analyst OR Trader)"
```

**Query 4 (Top Companies, weight 1.25):**
```
"internship (\"Goldman Sachs\" OR \"JP Morgan\" OR \"JPMorgan\" OR \"Morgan Stanley\" OR \"Bank of America\")"
```

**Query 5 (Interests, weight 1.0):**
```
"internship Investment Banking"
```

### What Jobs Are Fetched

**Expected Results:**
- Investment Banking Analyst Intern at Goldman Sachs (NYC) - ✅ Perfect match
- Financial Analyst Intern at JP Morgan (NYC) - ✅ Good match
- Private Equity Intern at Blackstone (NYC) - ✅ Good match
- Investment Banking Summer Analyst at Morgan Stanley (SF) - ✅ Good match

**Actual Issues Leading to Low-Quality Jobs:**

#### Issue 1: Location Not Used
- Query searches **"United States"** instead of "New York, NY OR San Francisco, CA"
- Results include jobs in random cities (Chicago, Boston, Dallas)
- User's `preferredLocation` is **completely ignored**

#### Issue 2: Generic Queries Return Broad Results
- Query 2 ("internship Excel") returns:
  - Financial Analyst Intern ✅
  - Data Entry Intern (uses Excel) ❌
  - Administrative Assistant Intern (uses Excel) ❌
- No filtering by major/industry in query

#### Issue 3: Top Companies Query Too Narrow
- Query 4 only targets 5 specific companies
- If those companies don't have internships posted, query returns 0 jobs
- No fallback to similar companies (boutique IBs, etc.)

#### Issue 4: Scoring Doesn't Filter Location Mismatches
- Job in Seattle scores: Base (15) + Field (19) + Skills (18) + Experience (12) + EC (4) + Interest (1.5) + Timing (2) = **71.5 × 1.2 = 86**
- This Seattle job outranks a 65-point NYC job due to query weight boost
- **Location preference completely ignored in scoring**

#### Issue 5: Quality Score Dominance
- Senior Investment Banking Analyst at Goldman (NYC) scores:
  - Match: 25 (seniority mismatch, but same field)
  - Quality: 45 (Goldman Sachs, recent, good description)
  - Combined: (25 × 0.7) + (45 × 0.6) = 17.5 + 27 = **44.5**
- Investment Banking Intern at Boutique IB (NYC) scores:
  - Match: 75 (perfect match)
  - Quality: 20 (smaller company, less description)
  - Combined: (75 × 0.7) + (20 × 0.6) = 52.5 + 12 = **64.5**
- **BUT:** Senior role gets filtered by quality threshold OR gets shown due to high quality score

### Why Low-Quality Jobs Appear

1. **Location Mismatch:** Jobs in wrong cities because `preferredLocation` never read
2. **Seniority Mismatch:** Senior roles appear because graduation timing only gives +2 points, not hard filter
3. **Industry Mismatch:** Tech jobs appear for Finance majors because field affinity gives 0.15 (3 points), not 0
4. **Generic Matches:** Broad queries return irrelevant jobs (e.g., "Excel" matches admin jobs)
5. **Quality Over Relevance:** High-quality companies (Google, Microsoft) get shown even if completely irrelevant (SWE jobs for Finance major)
6. **Missing Career Interests in Queries:** "Investment Banking" interest only used in scoring (4 points), not in query generation, so queries miss IB-specific terms

---

## 7️⃣ FINAL DIAGNOSTIC SUMMARY

### Top 5 Root Causes of Poor Job Quality

#### 1. **Preferred Location Never Used (CRITICAL)**
- **Where Lost:** Onboarding saves `location.preferredLocation` but `build_location_query()` only uses request parameters
- **Impact:** Jobs shown in random cities, user's explicit preference ignored
- **Severity:** HIGH - User explicitly stated NYC/SF, system shows jobs everywhere

#### 2. **Career Interests Not Used in Query Generation (HIGH)**
- **Where Lost:** `careerInterests` saved but only used in scoring (4 points), NOT in `build_personalized_queries()`
- **Impact:** "Investment Banking" interest doesn't influence search queries, only post-fetch scoring
- **Severity:** HIGH - User's primary career goal ignored in job discovery

#### 3. **Field Mismatches in Data Storage (MEDIUM)**
- **Where Lost:** Onboarding saves to `location.interests` but code reads from `professionalInfo.interests`
- **Impact:** Interests often empty even when user selected them
- **Severity:** MEDIUM - Data collected but not accessible due to path mismatch

#### 4. **No Hard Filters for Location/Seniority/Industry (MEDIUM)**
- **Where Lost:** Only soft filters via scoring, no pre-filtering before query execution
- **Impact:** Irrelevant jobs (wrong location, wrong seniority, wrong field) still fetched and shown
- **Severity:** MEDIUM - Wastes API calls and clutters results

#### 5. **Quality Score Overweights Company Brand (MEDIUM)**
- **Where Lost:** `combined_score = (match_score * 0.7) + (quality_score * 0.6)` gives quality 30% weight
- **Impact:** Irrelevant jobs at prestigious companies (Google SWE for Finance major) outrank relevant jobs at smaller companies
- **Severity:** MEDIUM - Brand bias over relevance

### Where Intent is First Lost

**PRIMARY LOSS POINT: Onboarding Data Save → Profile Read**

1. **Onboarding Flow (`OnboardingFlow.tsx:144`):** Calls `completeOnboarding()` which saves to Firestore
2. **Save Structure:** Data saved as nested `{profile: {...}, academics: {...}, location: {...}}`
3. **Read Structure:** `get_user_career_profile()` reads from flat `professionalInfo` and top-level fields
4. **Result:** `location.preferredLocation`, `location.interests`, `location.jobTypes` saved but never read

**SECONDARY LOSS POINT: Query Generation Ignores User Profile Preferences**

1. **Query Building:** `build_personalized_queries()` uses `major`, `skills`, `extracurriculars`, `target_industries`, `interests[0]`
2. **Missing:** `preferredLocation` completely absent from query generation
3. **Location Handling:** `build_location_query()` only uses request parameters, not user profile
4. **Result:** All queries search "United States" instead of user's preferred cities

**TERTIARY LOSS POINT: Scoring Doesn't Penalize Mismatches Hard Enough**

1. **Soft Filters Only:** No hard rejection for location/seniority/industry mismatches
2. **Weak Penalties:** Finance major → Tech job still gets 15% field affinity (3 points)
3. **Quality Dominance:** High-quality irrelevant jobs outscore relevant lower-quality jobs
4. **Result:** Irrelevant jobs appear in top results

### Primary Issue Type

**This is PRIMARILY a DATA ISSUE (60%) + LOGIC ISSUE (40%)**

**Data Issues:**
- Field path mismatches (saved vs read)
- `preferredLocation` collected but never persisted to readable location
- `careerInterests` saved but not read in query generation context
- `jobTypes` saved to `location` but read from top-level (inconsistent)

**Logic Issues:**
- Query generation doesn't use all available signals (`preferredLocation`, full `careerInterests`)
- No hard filters before query execution (location, seniority)
- Scoring weights allow irrelevant jobs to rank high
- Quality score can override relevance

**NOT a Product Modeling Issue:**
- The model (major → job titles, skills → matching, etc.) is reasonable
- The issue is implementation: data not flowing correctly and logic not using all available signals

---

## APPENDIX: Field Usage Matrix

| Field | Collected | Saved Location | Read Location | Used In Queries? | Used In Scoring? | Status |
|-------|-----------|----------------|---------------|------------------|------------------|--------|
| `major` | ✅ | `academics.major` | `resumeParsed.education.major` OR `professionalInfo.major` | ✅ Query 1 | ✅ 20 pts | ✅ WORKING |
| `university` | ✅ | `academics.university` | `resumeParsed.education.university` OR `professionalInfo.university` | ❌ | ❌ | ⚠️ Collected but unused |
| `graduationYear` | ✅ | `academics.graduationYear` | `professionalInfo.graduationYear` | ❌ | ✅ 2 pts | ⚠️ Partial |
| `graduationMonth` | ✅ | `academics.graduationMonth` | - | ❌ | ❌ | ❌ UNUSED |
| `degree` | ✅ | `academics.degree` | - | ❌ | ❌ | ❌ UNUSED |
| `jobTypes` | ✅ | `location.jobTypes` | Request params OR top-level `jobTypes` | ✅ Prefix | ✅ 5 pts | ⚠️ Path mismatch |
| `careerInterests` | ✅ | `location.interests` OR `location.careerInterests` | `professionalInfo.interests` OR top-level `interests` | ⚠️ Query 5 (first only) | ✅ 4 pts | ⚠️ Path mismatch, partial use |
| `preferredLocation` | ✅ | `location.preferredLocation` | - | ❌ | ❌ | ❌ **CRITICAL: UNUSED** |
| `country` | ✅ | `location.country` | - | ❌ | ❌ | ❌ UNUSED |
| `state` | ✅ | `location.state` | - | ❌ | ❌ | ❌ UNUSED |
| `city` | ✅ | `location.city` | - | ❌ | ❌ | ❌ UNUSED |
| `skills` | ⚠️ | `resumeParsed.skills` | `resumeParsed.skills` (new/old format) | ✅ Query 2, 2.5 | ✅ 30 pts | ✅ WORKING (if resume uploaded) |
| `experience` | ⚠️ | `resumeParsed.experience` | `resumeParsed.experience` | ❌ | ✅ 15 pts | ⚠️ Only if resume parsed |
| `extracurriculars` | ⚠️ | `resumeParsed.extracurriculars` | `resumeParsed.extracurriculars` | ✅ Query 3 | ✅ 6 pts | ⚠️ Only if resume parsed |

---

**END OF AUDIT**

