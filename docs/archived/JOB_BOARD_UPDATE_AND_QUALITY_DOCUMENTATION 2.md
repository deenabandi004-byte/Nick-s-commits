# Job Board Update Frequency & Quality Enhancement Documentation

This document covers job update frequency, caching behavior, and strategies for improving job quality and filtering.

---

## Part 1: Job Update Frequency & Caching

### Current Update Frequency

Jobs in the Job Board are updated through the following mechanisms:

#### 1. Automatic Cache Expiry (Default Behavior)

**Frequency**: Every 6 hours

- Jobs are cached in Firestore `job_cache` collection
- Cache duration is set by `CACHE_DURATION_HOURS = 6`
- After 6 hours, cache expires and fresh jobs are fetched from SerpAPI on next request
- Each personalized query has its own cache entry
- Only the first page of each query is cached (to avoid pagination token complexity)

**Cache Structure**:
```python
{
  "jobs": List[Dict],
  "query": str,
  "location": str,
  "job_type": Optional[str],
  "cached_at": datetime,
  "expires_at": datetime,  # cached_at + 6 hours
  "result_count": int,
  "next_page_token": Optional[str]
}
```

#### 2. Manual Refresh (On-Demand)

**Frequency**: Immediate (bypasses cache)

- Users can force a refresh by setting `refresh: true` in the API request
- Frontend has a refresh button that triggers this
- Bypasses cache completely and fetches fresh jobs immediately
- Updates all personalized queries

**API Request Example**:
```json
{
  "jobTypes": ["Internship"],
  "industries": ["Technology"],
  "locations": ["San Francisco, CA"],
  "refresh": true  // Forces fresh fetch
}
```

#### 3. Source Data Freshness

**Frequency**: Multiple times per day (Google Jobs updates)

- Jobs come from SerpAPI Google Jobs
- Google Jobs aggregates from multiple job boards and company websites
- Google updates their index frequently (typically multiple times per day)
- The 6-hour cache adds a delay, so users see data that's at most 6 hours old

### Multi-Query Cache Behavior

With the personalized fetching system:

- **Up to 4 different queries** are used (major-based, skills-based, extracurricular-based, industry-based)
- **Each query is cached separately** in Firestore
- If one query's cache expires while others are still fresh, only that query is refreshed
- This optimizes API usage while maintaining freshness

### Cache Cleanup

- `clear_expired_cache()` function exists for cleanup
- Can be called periodically via cron job
- Removes expired entries from Firestore
- Returns count of deleted entries

### Current Update Summary

| Update Method | Frequency | When It Happens |
|--------------|-----------|-----------------|
| **Automatic (Cache Expiry)** | Every 6 hours | When cache expires and user makes request |
| **Manual Refresh** | On-demand | When user clicks refresh button |
| **Source Updates** | Multiple times/day | Google Jobs index updates (uncontrolled) |

---

## Part 2: Improving Job Quality & Filtering Strategies

### Overview

This section outlines strategies to surface higher-quality jobs and better companies, without requiring immediate code changes. These can be implemented as enhancements to the existing system.

---

### 1. SerpAPI Query Refinements

#### A. Salary-Based Filtering

**Strategy**: Add minimum salary filters to search queries

**Benefits**:
- Higher salary often correlates with better companies and roles
- Filters out low-paying positions
- Attracts more competitive opportunities

**Implementation Ideas**:
- Add salary ranges to queries: `"software engineer intern $25/hour+"`
- For full-time: `"software engineer $100,000+"` or `"entry level analyst $70,000+"`
- Use industry-appropriate benchmarks

**Example Query Enhancement**:
```
Before: "software engineer internship"
After:  "software engineer internship $25/hour top tech companies"
```

#### B. Quality Keyword Addition

**Strategy**: Include quality-indicating keywords in queries

**Keywords to Add**:
- "top companies"
- "premier"
- "leading"
- "[industry] leaders"
- "Fortune 500"
- "well-funded startups"

**Example Query Enhancement**:
```
Before: "financial analyst internship"
After:  "financial analyst internship top investment banks"
```

#### C. Company Name Targeting

**Strategy**: Explicitly include prestigious company names in queries

**Industry-Specific Targets**:

**Finance**:
- Investment Banks: "Goldman Sachs", "JPMorgan Chase", "Morgan Stanley", "Bank of America", "Citigroup"
- Consulting: "McKinsey", "Bain", "BCG", "Deloitte", "PwC", "EY", "KPMG"
- Private Equity: "Blackstone", "KKR", "Apollo", "Carlyle"

**Technology**:
- FAANG: "Google", "Meta", "Amazon", "Apple", "Netflix", "Microsoft"
- Unicorns: "Stripe", "Databricks", "Figma", "Canva", "Notion"
- Established Tech: "Salesforce", "Oracle", "IBM", "Adobe"

**Business**:
- Fortune 500 companies
- Major retailers: "Walmart", "Target", "Costco"
- Consulting firms (see Finance section)

**Implementation**:
- Add top 3-5 companies to queries based on user's major/industry
- Rotate companies to get variety
- Use OR logic: `"internship (Google OR Microsoft OR Amazon)"`

#### D. Location Specificity

**Strategy**: Target high-quality job hubs explicitly

**Tech Hubs**:
- "Silicon Valley"
- "Seattle tech"
- "Austin tech scene"
- "Boston tech companies"

**Finance Hubs**:
- "New York Financial District"
- "Wall Street"
- "Chicago financial services"

**Consulting/Business**:
- "New York consulting"
- "Boston consulting firms"
- "Chicago business"

**Benefits**:
- These areas have higher concentration of quality jobs
- Better compensation typically
- More competitive opportunities

---

### 2. Company Filtering Strategy

#### A. Source Quality Prioritization

**High-Priority Sources** (Prioritize these):
- Direct company websites (check `via` field)
- LinkedIn Jobs
- Major job boards: Glassdoor, Indeed, company career pages
- Well-known recruiters with good reputation

**Low-Priority Sources** (Filter or down-rank):
- Unknown third-party recruiters
- Suspicious aggregators
- Jobs with very short descriptions (< 100 chars)
- Generic company names ("Staffing Firm", "Recruiting Agency")

**Implementation**:
```python
# In scoring or filtering
if job.get("via") in ["LinkedIn", "Company Website", "Glassdoor", "Indeed"]:
    quality_score += 10
elif job.get("via") in ["Unknown Recruiter", "Generic Agency"]:
    quality_score -= 5
```

#### B. Company Size Indicators

**Strategy**: Use heuristics to identify larger, established companies

**Signals of Larger Companies**:
- Longer, detailed job descriptions (500+ characters)
- Structured requirements sections
- Benefits information included
- Professional formatting
- Multiple job postings from same company

**Signals of Smaller/Less Established Companies**:
- Very short descriptions
- No requirements listed
- Poor formatting
- Generic descriptions

#### C. Company Name Validation

**Strategy**: Filter out low-quality company names

**Filter Out**:
- Generic names: "Recruiting Agency", "Staffing Firm", "Hiring Company"
- Placeholder names: "Company", "Employer", "Organization"
- Suspicious patterns: Too many special characters, all caps spam

**Keep**:
- Recognizable company names
- Names with proper capitalization
- Well-known brands/companies

---

### 3. Job Quality Scoring Metrics

#### A. Description Quality

**High-Quality Signals** (Boost score):
- **Length**: 500+ characters (detailed descriptions)
- **Structure**: Has sections (Requirements, Benefits, Company Culture)
- **Information Completeness**: Includes salary, benefits, location details
- **Professional Language**: Well-written, clear requirements

**Low-Quality Signals** (Reduce score):
- **Length**: < 200 characters (too short)
- **No Structure**: Wall of text, no sections
- **Missing Information**: No salary, vague requirements
- **Spam Keywords**: "Work from home!", "Make money fast!", excessive punctuation

**Implementation**:
```python
def score_description_quality(description: str) -> int:
    score = 0
    
    # Length bonus
    if len(description) > 500:
        score += 10
    elif len(description) < 200:
        score -= 5
    
    # Structure bonus
    if any(section in description.lower() for section in ["requirements", "qualifications", "benefits"]):
        score += 5
    
    # Information completeness
    if "$" in description or "salary" in description.lower():
        score += 5
    
    return score
```

#### B. Recency Preference

**Strategy**: Prioritize recent postings

**Reasoning**:
- Jobs posted in last 7-14 days are more likely to be active
- Older postings (>30 days) are often stale or filled
- Fresh postings indicate active hiring

**Implementation**:
- Parse "posted" field (e.g., "2 days ago", "1 week ago")
- Boost jobs posted in last 14 days
- Down-rank jobs older than 30 days

#### C. Requirements Completeness

**Strategy**: Score based on requirements detail

**High-Quality Signals**:
- Specific skill requirements listed
- Education requirements mentioned
- Experience level specified
- Clear job responsibilities

**Low-Quality Signals**:
- No requirements listed
- Vague requirements ("some experience preferred")
- Requirements don't match job title

---

### 4. User Preference Filters (UI Enhancement Ideas)

#### A. Quality Filter Toggles

**Suggested Filters**:

1. **"Top Companies Only"**
   - Filters to Fortune 500, FAANG, major firms
   - Uses company name matching or tier list

2. **"Salary Range"**
   - Minimum salary filter (e.g., "$50k+", "$100k+")
   - Filters out jobs without salary info if strict mode

3. **"Direct Company Postings"**
   - Only shows jobs from company websites
   - Filters out third-party recruiters

4. **"Posted Recently"**
   - "Last 7 days"
   - "Last 14 days"
   - "Last 30 days"

5. **"Description Quality"**
   - "Detailed descriptions only" (500+ chars)
   - "Has salary information"
   - "Has benefits listed"

#### B. Company Tier Selection

**Options**:
- "Fortune 500 Companies"
- "FAANG / Top Tech"
- "Unicorns (Startups valued $1B+)"
- "Well-Funded Startups (Series B+)"
- "All Companies" (default)

**Implementation**: 
- Maintain curated lists of companies by tier
- Filter jobs by company name matching

---

### 5. SerpAPI Parameter Optimizations

#### A. Explore Additional Filters

**Check SerpAPI Documentation For**:
- Company size filters
- Salary range parameters
- Job source filters
- Industry-specific filters
- Date range filters

#### B. Query Structure Improvements

**Internships**:
- "summer internship [company names]"
- "paid internship [industry]"
- "2024 internship [role] top companies"

**Full-Time**:
- "[role] [top companies in industry]"
- "[role] entry level Fortune 500"
- "[role] [location] top employers"

**Example Enhanced Queries**:
```
# Finance
"financial analyst internship summer 2024 (Goldman Sachs OR JPMorgan OR Morgan Stanley)"

# Tech
"software engineer intern paid $25/hour (Google OR Microsoft OR Amazon OR Meta)"

# Consulting
"consultant internship (McKinsey OR Bain OR BCG) strategy"
```

---

### 6. Post-Processing Filters

#### A. Description Quality Checks

**Filter Out Jobs With**:
- Descriptions < 100 characters (likely incomplete)
- No requirements listed (low quality)
- Spam-like keywords: "work from home!!!", "make $5000/week", excessive caps
- Missing essential information (company name, location)

#### B. Company Name Validation

**Exclude Jobs Where**:
- Company name is generic ("Recruiting Agency", "Staffing Firm")
- Company name appears to be placeholder ("Company", "Employer")
- Company name format is suspicious (all caps spam, excessive punctuation)

#### C. Duplicate Detection

**Strategy**: Remove near-duplicate jobs

**Criteria for Duplicates**:
- Same job title
- Same company
- Same location
- Similar descriptions (>80% similarity)

**Action**: Keep the highest quality version (best description, most recent)

---

### 7. Leveraging User Career Profile

#### A. Major-Based Company Targeting

**For Finance Majors**:
- Explicitly include top investment banks in queries
- Add consulting firms (MBB: McKinsey, Bain, BCG)
- Include asset management firms

**For Tech Majors**:
- Include FAANG companies
- Add well-known startups/unicorns
- Include established tech companies

**For Business Majors**:
- Fortune 500 companies
- Top consulting firms
- Major corporations in user's target industries

#### B. Industry-Specific Quality Filters

**Finance**:
- Focus on investment banks, private equity, top consulting firms
- Prioritize Wall Street, financial districts

**Technology**:
- Prioritize FAANG, unicorns, well-funded startups
- Focus on tech hubs (Silicon Valley, Seattle, Austin)

**Business/Consulting**:
- Target Fortune 500 companies
- Top consulting firms (MBB, Big 4)
- Major corporations

#### C. Extracurricular-Based Quality Signals

**If User Has**:
- **Consulting club** → Prioritize MBB, Big 4 consulting
- **Finance club** → Prioritize investment banks, PE firms
- **Tech club/hackathons** → Prioritize FAANG, top tech companies
- **Leadership roles** → Prioritize companies with management/leadership programs

---

### 8. Data Enrichment (Future Enhancement Ideas)

#### A. Company Database Integration

**Potential Data Sources**:
- **Crunchbase**: Company size, funding, employee count
- **LinkedIn**: Employee count, industry, company type
- **Glassdoor**: Ratings, reviews, salary data
- **Fortune Lists**: Fortune 500, Best Companies to Work For

**Use Cases**:
- Filter by company size (e.g., 1000+ employees)
- Filter by funding status (e.g., Series B+ or public)
- Rank by Glassdoor ratings (e.g., 4.0+ stars)
- Filter by industry reputation scores

**Implementation**:
```python
# Pseudo-code
company_data = get_company_info(job.company)
if company_data:
    if company_data.employee_count > 1000:
        quality_score += 5
    if company_data.glassdoor_rating > 4.0:
        quality_score += 5
    if company_data.funding_status in ["Series B+", "Public"]:
        quality_score += 5
```

#### B. Salary Data Integration

**Potential Data Sources**:
- **levels.fyi**: Tech salary data
- **Glassdoor Salaries**: Industry salary ranges
- **Payscale**: Salary benchmarks

**Use Cases**:
- Flag jobs with competitive salaries (above market rate)
- Filter out jobs with below-market salaries
- Show salary comparisons in UI

---

### 9. Quick Wins (Highest Impact, Easiest to Implement)

#### Priority 1: Immediate Impact

1. **Add Minimum Salary Filters to Queries**
   - Impact: Filters out low-paying positions
   - Effort: Low (modify query building)

2. **Prioritize Company Website Postings**
   - Impact: Higher quality, direct applications
   - Effort: Low (check `via` field in scoring)

3. **Filter Short Descriptions**
   - Impact: Removes low-quality postings
   - Effort: Low (add description length check)

#### Priority 2: High Value

4. **Add "Top Companies" Keywords**
   - Impact: Surfaces prestigious companies
   - Effort: Medium (modify query building logic)

5. **Prioritize Recent Postings (14 days)**
   - Impact: More active, relevant jobs
   - Effort: Medium (parse "posted" field)

6. **Exclude Generic Company Names**
   - Impact: Removes low-quality sources
   - Effort: Low (company name validation)

#### Priority 3: Future Enhancements

7. **Company Database Integration**
   - Impact: Very high (quality filtering)
   - Effort: High (API integration, data management)

8. **Salary Data Integration**
   - Impact: High (competitive positioning)
   - Effort: High (API integration)

9. **User Quality Preferences UI**
   - Impact: High (user control)
   - Effort: Medium (UI + backend filtering)

---

### 10. Implementation Roadmap Example

#### Phase 1: Quick Wins (1-2 weeks)
- [ ] Add minimum salary filters to queries
- [ ] Prioritize company website postings in scoring
- [ ] Filter jobs with descriptions < 200 characters
- [ ] Exclude generic company names

#### Phase 2: Query Enhancement (2-3 weeks)
- [ ] Add "top companies" keywords based on major/industry
- [ ] Include prestigious company names in queries
- [ ] Improve location specificity (tech hubs, financial districts)
- [ ] Prioritize recent postings (14 days)

#### Phase 3: Advanced Filtering (1-2 months)
- [ ] Implement description quality scoring
- [ ] Add duplicate detection
- [ ] Build company tier lists (Fortune 500, FAANG, etc.)
- [ ] Create quality filter UI components

#### Phase 4: Data Enrichment (2-3 months)
- [ ] Integrate company databases (Crunchbase/LinkedIn)
- [ ] Add salary data integration
- [ ] Implement company rating/reputation scoring
- [ ] Build company size filtering

---

### 11. Example Query Transformations

#### Before (Current)
```
Query: "software engineer internship"
Result: Generic results, mixed quality
```

#### After (Enhanced)
```
Query: "software engineer internship $25/hour (Google OR Microsoft OR Amazon OR Meta OR Apple) summer 2024"
Result: Higher quality, prestigious companies, competitive pay
```

#### Before (Current)
```
Query: "financial analyst internship"
Result: Generic finance internships
```

#### After (Enhanced)
```
Query: "financial analyst internship (Goldman Sachs OR JPMorgan OR Morgan Stanley OR Bank of America) investment banking"
Result: Top investment banks, better quality opportunities
```

---

### 12. Quality Scoring Formula Example

```python
def calculate_quality_score(job: dict) -> int:
    score = 0
    
    # Description quality (0-20 points)
    desc = job.get("description", "")
    if len(desc) > 500:
        score += 10
    elif len(desc) < 200:
        score -= 5
    
    if any(section in desc.lower() for section in ["requirements", "benefits"]):
        score += 5
    if "$" in desc or "salary" in desc.lower():
        score += 5
    
    # Source quality (0-10 points)
    via = job.get("via", "").lower()
    if via in ["linkedin", "company website", "glassdoor"]:
        score += 10
    elif "recruiter" in via or "staffing" in via:
        score -= 5
    
    # Company quality (0-10 points)
    company = job.get("company", "").lower()
    if any(top_co in company for top_co in ["google", "microsoft", "apple", "amazon"]):
        score += 10
    elif any(generic in company for generic in ["recruiting", "staffing", "agency"]):
        score -= 5
    
    # Recency (0-10 points)
    posted = job.get("posted", "")
    if "day" in posted.lower() and int(posted.split()[0]) <= 14:
        score += 10
    elif "week" in posted.lower() and int(posted.split()[0]) <= 2:
        score += 5
    
    # Salary indication (0-10 points)
    if job.get("salary"):
        score += 10
    
    return max(0, min(100, score))  # Clamp to 0-100
```

---

## Summary

### Update Frequency
- **Automatic**: Every 6 hours (cache expiry)
- **Manual**: On-demand via refresh button
- **Source**: Google Jobs updates multiple times per day

### Quality Improvement Strategies

**Quick Wins** (Implement First):
1. Salary filters in queries
2. Company website prioritization
3. Description length filtering
4. Generic company name exclusion

**High Impact** (Next Phase):
5. Top companies keywords
6. Prestigious company targeting
7. Recent posting prioritization
8. Description quality scoring

**Future Enhancements**:
9. Company database integration
10. Salary data integration
11. Quality filter UI
12. Company tier filtering

---

**Last Updated**: 2024
**Version**: 1.0

