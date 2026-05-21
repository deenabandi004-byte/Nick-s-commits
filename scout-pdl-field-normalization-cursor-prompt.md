# Cursor Prompt: PDL-Compatible Field Normalization for Scout

## Context

Scout auto-fills search fields from job postings and SERP results, but the values often don't match what People Data Labs (PDL) expects:

**Current Problems:**
- Job titles are too long/specific: "Project Manager for Academic Initiatives and Planning"
- Company names are legal entities: "The Regents of the University of California on behalf of their Los Angeles Campus"
- Locations have inconsistent formats: "Los Angeles, CA, USA" vs "SF Bay Area" vs "New York City"

**Goal:** Normalize all fields to PDL-friendly search terms that will actually return results.

---

## Files to Modify

- `app/services/scout_service.py` - Add normalization functions and apply them

---

## Implementation

### Step 1: Add Location Normalization

Add this function to `scout_service.py`:

```python
def _normalize_location(self, location: str) -> Optional[str]:
    """
    Normalize location strings to PDL-compatible format: "City, ST"
    
    Examples:
        "Los Angeles, California, USA" -> "Los Angeles, CA"
        "San Francisco Bay Area" -> "San Francisco, CA"
        "New York City" -> "New York, NY"
        "NYC" -> "New York, NY"
        "Remote" -> None (or handle specially)
    """
    if not location:
        return None
    
    location = location.strip()
    
    # Handle remote
    if location.lower() in ['remote', 'remote - us', 'remote, us', 'work from home']:
        return None  # Or return "Remote" if PDL supports it
    
    # State abbreviation mapping
    STATE_ABBREV = {
        'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
        'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
        'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
        'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
        'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
        'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
        'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
        'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
        'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
        'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
        'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
        'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
        'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC'
    }
    
    # Common city aliases
    CITY_ALIASES = {
        'nyc': 'New York, NY',
        'new york city': 'New York, NY',
        'la': 'Los Angeles, CA',
        'sf': 'San Francisco, CA',
        'san francisco bay area': 'San Francisco, CA',
        'bay area': 'San Francisco, CA',
        'silicon valley': 'San Jose, CA',
        'dc': 'Washington, DC',
        'washington dc': 'Washington, DC',
        'philly': 'Philadelphia, PA',
        'chi-town': 'Chicago, IL',
        'atl': 'Atlanta, GA',
        'boston metro': 'Boston, MA',
        'dallas-fort worth': 'Dallas, TX',
        'dfw': 'Dallas, TX',
        'denver metro': 'Denver, CO',
        'seattle metro': 'Seattle, WA',
        'greater los angeles': 'Los Angeles, CA',
        'greater new york': 'New York, NY',
        'socal': 'Los Angeles, CA',
        'norcal': 'San Francisco, CA',
    }
    
    # Check aliases first
    location_lower = location.lower().strip()
    if location_lower in CITY_ALIASES:
        return CITY_ALIASES[location_lower]
    
    # Remove common suffixes
    location = re.sub(r',?\s*(USA|US|United States|America)$', '', location, flags=re.IGNORECASE).strip()
    location = re.sub(r',?\s*(Metro|Area|Region|Metropolitan)$', '', location, flags=re.IGNORECASE).strip()
    
    # Try to parse "City, State" or "City, ST"
    parts = [p.strip() for p in location.split(',')]
    
    if len(parts) >= 2:
        city = parts[0].strip()
        state_part = parts[1].strip()
        
        # Check if state_part is full state name
        state_lower = state_part.lower()
        if state_lower in STATE_ABBREV:
            return f"{city}, {STATE_ABBREV[state_lower]}"
        
        # Check if it's already abbreviated (2 letters)
        if len(state_part) == 2 and state_part.upper() in STATE_ABBREV.values():
            return f"{city}, {state_part.upper()}"
        
        # If 3+ parts, might be "City, State, Country" - take first two
        return f"{city}, {state_part}"
    
    # Single part - might be just a city, try to infer
    MAJOR_CITIES = {
        'new york': 'New York, NY',
        'los angeles': 'Los Angeles, CA',
        'chicago': 'Chicago, IL',
        'houston': 'Houston, TX',
        'phoenix': 'Phoenix, AZ',
        'philadelphia': 'Philadelphia, PA',
        'san antonio': 'San Antonio, TX',
        'san diego': 'San Diego, CA',
        'dallas': 'Dallas, TX',
        'san jose': 'San Jose, CA',
        'austin': 'Austin, TX',
        'jacksonville': 'Jacksonville, FL',
        'fort worth': 'Fort Worth, TX',
        'columbus': 'Columbus, OH',
        'charlotte': 'Charlotte, NC',
        'san francisco': 'San Francisco, CA',
        'indianapolis': 'Indianapolis, IN',
        'seattle': 'Seattle, WA',
        'denver': 'Denver, CO',
        'boston': 'Boston, MA',
        'nashville': 'Nashville, TN',
        'detroit': 'Detroit, MI',
        'portland': 'Portland, OR',
        'miami': 'Miami, FL',
        'atlanta': 'Atlanta, GA',
    }
    
    if location_lower in MAJOR_CITIES:
        return MAJOR_CITIES[location_lower]
    
    # Return as-is if we can't normalize
    return location
```

### Step 2: Add Company Name Normalization

```python
def _normalize_company(self, company: str) -> Optional[str]:
    """
    Normalize company names to common/searchable forms.
    
    Examples:
        "The Regents of the University of California on behalf of their Los Angeles Campus" -> "UCLA"
        "Meta Platforms, Inc." -> "Meta"
        "Alphabet Inc." -> "Google"
        "Amazon.com, Inc." -> "Amazon"
    """
    if not company:
        return None
    
    company = company.strip()
    original = company
    
    # University patterns - these are verbose legal names
    UNIVERSITY_MAPPINGS = {
        r'regents?\s+of\s+(the\s+)?university\s+of\s+california.*los\s+angeles': 'UCLA',
        r'regents?\s+of\s+(the\s+)?university\s+of\s+california.*berkeley': 'UC Berkeley',
        r'regents?\s+of\s+(the\s+)?university\s+of\s+california.*san\s+diego': 'UC San Diego',
        r'regents?\s+of\s+(the\s+)?university\s+of\s+california.*san\s+francisco': 'UCSF',
        r'regents?\s+of\s+(the\s+)?university\s+of\s+california.*irvine': 'UC Irvine',
        r'regents?\s+of\s+(the\s+)?university\s+of\s+california.*davis': 'UC Davis',
        r'regents?\s+of\s+(the\s+)?university\s+of\s+california.*santa\s+barbara': 'UC Santa Barbara',
        r'regents?\s+of\s+(the\s+)?university\s+of\s+california.*santa\s+cruz': 'UC Santa Cruz',
        r'regents?\s+of\s+(the\s+)?university\s+of\s+california.*riverside': 'UC Riverside',
        r'regents?\s+of\s+(the\s+)?university\s+of\s+california.*merced': 'UC Merced',
        r'regents?\s+of\s+(the\s+)?university\s+of\s+california': 'University of California',
        r'trustees?\s+of\s+(the\s+)?university\s+of\s+pennsylvania': 'University of Pennsylvania',
        r'president\s+and\s+fellows\s+of\s+harvard\s+college': 'Harvard University',
        r'leland\s+stanford\s+junior\s+university': 'Stanford University',
        r'massachusetts\s+institute\s+of\s+technology': 'MIT',
    }
    
    company_lower = company.lower()
    for pattern, replacement in UNIVERSITY_MAPPINGS.items():
        if re.search(pattern, company_lower):
            return replacement
    
    # Common company aliases/simplifications
    COMPANY_SIMPLIFY = {
        # Tech giants
        r'^meta\s+platforms?,?\s*(inc\.?)?$': 'Meta',
        r'^alphabet,?\s*(inc\.?)?$': 'Google',
        r'^amazon\.?com,?\s*(inc\.?)?$': 'Amazon',
        r'^apple,?\s*(inc\.?)?$': 'Apple',
        r'^microsoft\s*(corporation|corp\.?)?$': 'Microsoft',
        r'^netflix,?\s*(inc\.?)?$': 'Netflix',
        r'^nvidia\s*(corporation|corp\.?)?$': 'NVIDIA',
        r'^salesforce,?\s*(inc\.?)?$': 'Salesforce',
        r'^adobe,?\s*(inc\.?|systems)?$': 'Adobe',
        r'^oracle\s*(corporation|corp\.?)?$': 'Oracle',
        r'^international\s+business\s+machines\s*(corporation|corp\.?)?$': 'IBM',
        r'^ibm\s*(corporation|corp\.?)?$': 'IBM',
        
        # Finance
        r'^jpmorgan\s+chase\s*(&\s*co\.?)?': 'JPMorgan Chase',
        r'^goldman\s+sachs\s*(group|&\s*co\.?)?': 'Goldman Sachs',
        r'^morgan\s+stanley\s*(&\s*co\.?)?': 'Morgan Stanley',
        r'^bank\s+of\s+america\s*(corporation|corp\.?)?': 'Bank of America',
        r'^wells\s+fargo\s*(&\s*company)?': 'Wells Fargo',
        r'^citigroup,?\s*(inc\.?)?': 'Citigroup',
        r'^blackrock,?\s*(inc\.?)?': 'BlackRock',
        
        # Consulting
        r'^mckinsey\s*(&|and)?\s*(company|co\.?)?': 'McKinsey',
        r'^boston\s+consulting\s+group': 'BCG',
        r'^bain\s*(&|and)?\s*(company|co\.?)?': 'Bain',
        r'^deloitte\s*(touche\s+tohmatsu)?.*': 'Deloitte',
        r'^pricewaterhousecoopers.*': 'PwC',
        r'^pwc.*': 'PwC',
        r'^ernst\s*(&|and)?\s*young.*': 'EY',
        r'^kpmg.*': 'KPMG',
        r'^accenture,?\s*(plc)?': 'Accenture',
        
        # Government
        r'^county\s+of\s+(.+)$': r'\1 County',
        r'^city\s+of\s+(.+)$': r'\1',
        r'^state\s+of\s+(.+)$': r'\1',
    }
    
    for pattern, replacement in COMPANY_SIMPLIFY.items():
        match = re.match(pattern, company_lower)
        if match:
            # Handle backreferences in replacement
            if r'\1' in replacement:
                return re.sub(pattern, replacement, company, flags=re.IGNORECASE).strip().title()
            return replacement
    
    # Generic cleanup
    # Remove legal suffixes
    company = re.sub(r',?\s*(Inc\.?|LLC|Ltd\.?|Corp\.?|Corporation|Company|Co\.?|PLC|LP|LLP)$', '', company, flags=re.IGNORECASE).strip()
    
    # Remove "The" prefix if followed by more words
    company = re.sub(r'^The\s+(?=\w+\s+)', '', company).strip()
    
    # If still very long (>50 chars), it's probably a legal name we didn't catch
    if len(company) > 50:
        # Try to extract the meaningful part
        # Often format is "Department - Organization" or "Organization - Department"
        if ' - ' in company:
            parts = company.split(' - ')
            # Take the shorter, more meaningful part
            company = min(parts, key=len).strip()
        elif ' on behalf of ' in company.lower():
            # Take part after "on behalf of"
            match = re.search(r'on behalf of\s+(.+)', company, re.IGNORECASE)
            if match:
                company = match.group(1).strip()
    
    return company if company else original
```

### Step 3: Improve Job Title Simplification

Update `_simplify_job_title()` to be more aggressive:

```python
def _simplify_job_title(self, job_title: str) -> str:
    """
    Simplify job titles to PDL-searchable format.
    
    Target: 2-4 words that describe the core role.
    
    Examples:
        "Project Manager for Academic Initiatives and Planning" -> "Project Manager"
        "Senior Software Engineer, Infrastructure Team" -> "Senior Software Engineer"
        "AI Research Scientist, Text Data Research - MSL FAIR" -> "AI Research Scientist"
        "Vice President of Engineering" -> "VP Engineering"
    """
    if not job_title:
        return job_title
    
    title = job_title.strip()
    original_title = title
    
    # Core role keywords (what we want to KEEP)
    ROLE_CORES = [
        # Engineering
        'software engineer', 'data engineer', 'ml engineer', 'machine learning engineer',
        'frontend engineer', 'backend engineer', 'fullstack engineer', 'full stack engineer',
        'devops engineer', 'site reliability engineer', 'sre', 'platform engineer',
        'security engineer', 'qa engineer', 'test engineer', 'systems engineer',
        
        # Data/ML
        'data scientist', 'data analyst', 'business analyst', 'research scientist',
        'machine learning scientist', 'ai researcher', 'research engineer',
        'analytics engineer', 'bi analyst', 'business intelligence',
        
        # Product/Design
        'product manager', 'program manager', 'project manager', 'technical program manager',
        'product designer', 'ux designer', 'ui designer', 'ux researcher',
        
        # Leadership
        'engineering manager', 'product lead', 'tech lead', 'team lead',
        'director of engineering', 'vp engineering', 'cto', 'ceo', 'cfo', 'coo',
        
        # Other
        'consultant', 'analyst', 'associate', 'intern', 'coordinator',
        'specialist', 'administrator', 'manager', 'developer', 'architect',
    ]
    
    # Level prefixes to preserve
    LEVEL_PREFIXES = ['senior', 'junior', 'staff', 'principal', 'lead', 'chief', 'head', 'vp', 'director']
    
    # Step 1: Remove everything after common separators
    for sep in [' - ', ' – ', ' - ', ' | ', ' / ', ', ', ' for ', ' of the ', ' on the ']:
        if sep in title:
            parts = title.split(sep)
            # Score each part
            best_part = title
            best_score = 0
            
            for part in parts:
                part = part.strip()
                part_lower = part.lower()
                score = 0
                
                # Check for role cores
                for core in ROLE_CORES:
                    if core in part_lower:
                        score += 10
                        break
                
                # Check for level prefix
                for prefix in LEVEL_PREFIXES:
                    if part_lower.startswith(prefix):
                        score += 3
                        break
                
                # Penalize very short or very long parts
                word_count = len(part.split())
                if word_count < 2:
                    score -= 2
                if word_count > 5:
                    score -= 3
                
                # Penalize parts that look like department names
                dept_words = ['team', 'group', 'department', 'division', 'services', 'solutions', 'initiatives']
                if any(dw in part_lower for dw in dept_words) and not any(core in part_lower for core in ROLE_CORES):
                    score -= 5
                
                if score > best_score:
                    best_score = score
                    best_part = part
            
            if best_score > 0:
                title = best_part
                break
    
    # Step 2: Remove parenthetical content
    title = re.sub(r'\s*\([^)]+\)', '', title).strip()
    title = re.sub(r'\s*\[[^\]]+\]', '', title).strip()
    
    # Step 3: Simplify verbose titles
    # "Vice President of Engineering" -> "VP Engineering"
    title = re.sub(r'\bVice President\b', 'VP', title, flags=re.IGNORECASE)
    title = re.sub(r'\bSenior Vice President\b', 'SVP', title, flags=re.IGNORECASE)
    title = re.sub(r'\bExecutive Vice President\b', 'EVP', title, flags=re.IGNORECASE)
    
    # Remove filler words
    title = re.sub(r'\b(of|the|and|in|at|for)\b', ' ', title, flags=re.IGNORECASE)
    title = ' '.join(title.split())  # Clean up multiple spaces
    
    # Step 4: If still too long, extract just the role
    words = title.split()
    if len(words) > 4:
        # Try to find a role core and keep level + core
        title_lower = title.lower()
        for core in ROLE_CORES:
            if core in title_lower:
                # Find the core in the title
                core_words = core.split()
                core_start = title_lower.find(core)
                
                # Check if there's a level prefix before it
                prefix_found = None
                for prefix in LEVEL_PREFIXES:
                    prefix_pattern = rf'\b{prefix}\b\s+{re.escape(core)}'
                    match = re.search(prefix_pattern, title_lower)
                    if match:
                        prefix_found = prefix
                        break
                
                # Build simplified title
                if prefix_found:
                    title = f"{prefix_found.title()} {core.title()}"
                else:
                    title = core.title()
                break
    
    # Step 5: Final cleanup
    title = ' '.join(title.split())
    
    # Validate - if we broke it, return original
    if len(title) < 3:
        return original_title
    
    return title
```

### Step 4: Apply Normalization in Key Places

Update `_extract_job_details_from_content()` (around line 508):

```python
async def _extract_job_details_from_content(
    self,
    content: str,
    url: str
) -> Tuple[SearchFields, Optional[str]]:
    """Extract job details from page content using LLM."""
    # ... existing LLM extraction code ...
    
    # After getting result from LLM:
    raw_title = result.get("job_title")
    raw_company = result.get("company") or domain_hint
    raw_location = result.get("location")
    
    # Apply normalization
    fields = SearchFields(
        job_title=self._simplify_job_title(raw_title) if raw_title else None,
        company=self._normalize_company(raw_company) if raw_company else None,
        location=self._normalize_location(raw_location) if raw_location else None,
        experience_level=result.get("experience_level"),
    )
    
    return fields, summary
```

Update `_search_jobs()` when creating JobListing objects:

```python
# In the loop where JobListings are created (around line 820):
jobs.append(JobListing(
    title=self._simplify_job_title(title),  # Already there
    company=self._normalize_company(company),  # ADD THIS
    location=self._normalize_location(location),  # ADD THIS
    url=link,
    snippet=description[:200] if description else None,
    source="google_jobs"
))
```

Update `_aggregate_fields_from_jobs()` to also normalize:

```python
def _aggregate_fields_from_jobs(
    self, 
    jobs: List[JobListing], 
    extracted: Dict[str, Any]
) -> SearchFields:
    """Aggregate fields from job listings, preferring extracted values."""
    
    # Get most common/first values
    job_title = extracted.get("job_title")
    company = extracted.get("company")
    location = extracted.get("location")
    
    if not job_title and jobs:
        job_title = jobs[0].title
    if not company and jobs:
        company = jobs[0].company
    if not location and jobs:
        location = jobs[0].location
    
    # Apply normalization (in case extracted values weren't normalized)
    return SearchFields(
        job_title=self._simplify_job_title(job_title) if job_title else None,
        company=self._normalize_company(company) if company else None,
        location=self._normalize_location(location) if location else None,
    )
```

---

## Expected Results

### Before Normalization

```
Search fields updated!
Title: Project Manager for Academic Initiatives and Planning
Company: The Regents of the University of California on behalf of their Los Angeles Campus
Location: Los Angeles, CA, USA
```

### After Normalization

```
Search fields updated!
Title: Project Manager
Company: UCLA
Location: Los Angeles, CA
```

---

## Testing Checklist

**Job Titles:**
- [ ] "Senior Software Engineer, Infrastructure Team" → "Senior Software Engineer"
- [ ] "Project Manager for Academic Initiatives and Planning" → "Project Manager"
- [ ] "AI Research Scientist, Text Data Research - MSL FAIR" → "AI Research Scientist"
- [ ] "Vice President of Engineering" → "VP Engineering"
- [ ] "Data Analyst Intern" → "Data Analyst Intern" (keep intern)

**Companies:**
- [ ] "The Regents of the University of California on behalf of their Los Angeles Campus" → "UCLA"
- [ ] "Meta Platforms, Inc." → "Meta"
- [ ] "McKinsey & Company" → "McKinsey"
- [ ] "County of Los Angeles" → "Los Angeles County"
- [ ] "Stripe, Inc." → "Stripe"

**Locations:**
- [ ] "Los Angeles, California, USA" → "Los Angeles, CA"
- [ ] "San Francisco Bay Area" → "San Francisco, CA"
- [ ] "NYC" → "New York, NY"
- [ ] "Remote" → null (or handle appropriately)
- [ ] "Boston, MA" → "Boston, MA" (unchanged)
- [ ] "Seattle, Washington" → "Seattle, WA"

---

## Edge Cases

1. **International locations**: Don't break "London, UK" or "Toronto, Canada"
2. **Ambiguous cities**: "Portland" could be OR or ME - default to most common (OR)
3. **Weird company names**: "Company 9 LLC" → "Company 9" (remove LLC but keep name)
4. **Startup names**: Don't over-simplify unique names like "Stripe" or "Notion"
5. **Government roles**: "Water Service Worker" at "County of Los Angeles" - normalize county but keep title
