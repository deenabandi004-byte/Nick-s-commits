# Resume Parsing Analysis - Experience Headers Missing

## Step 1: Parsing Prompt Location

**File:** `backend/app/services/scout_service.py`  
**Method:** `_parse_resume_structured`  
**Lines:** 2101-2360

### Current Prompt Structure (lines 2133-2256)

The prompt DOES include explicit instructions for extracting experience headers:

```python
"experience": [
  {
    "company": "Exact Company Name from resume",
    "title": "Exact Job Title from resume",
    "dates": "Exact date range from resume",
    "location": "Location if mentioned",
    "bullets": ["Bullet point 1", "Bullet point 2"]
  }
]
```

### CRITICAL Section in Prompt (lines 2184-2248)

The prompt includes detailed instructions:
- "Create a SEPARATE object for EACH job/position"
- "Extract ALL header information for EACH job before listing its bullets"
- Multiple pattern examples with expected output
- Clear extraction rules for company, title, dates, location
- Grouping rules that explicitly say "Do NOT combine multiple jobs into one entry"

## Step 2: Response Handling (lines 2280-2331)

### JSON Parsing (line 2280)
```python
parsed = json.loads(result_text)
```

### Experience Validation (lines 2285-2331)
- Checks for placeholder values
- Replaces placeholders with empty strings
- Ensures required fields exist
- **Does NOT flatten or remove headers**
- Logs warnings if headers are missing

### Cache Guard (lines 2076-2085)
```python
# HARD GUARD: Discard poisoned cache entries missing experience section
if "experience" not in cached or not cached.get("experience"):
    print("[Scout] Discarding cached resume parse without experience section")
    cached = None
    self._cache.delete(cache_key)
```

## Step 3: Potential Issues Found

### Issue 1: Cache May Contain Bad Parses
- **Location:** `_parse_resume_structured_cached` (lines 2059-2099)
- **Problem:** If a previous parse had missing headers, it might be cached for 1 hour
- **Fix Needed:** Clear cache OR add validation that checks for headers in cached entries

### Issue 2: Model May Not Follow Instructions
- The prompt is good, but GPT-4o-mini might be ignoring the structure
- **Possible Fix:** Use a stronger model (gpt-4o) for parsing OR add even more explicit examples

### Issue 3: Old Format Conversion Path
- **Location:** `_convert_old_resume_format` (lines 2367-2491)
- If resume comes in old format (key_experiences), it tries to extract headers from raw_text
- This extraction is fallible and might miss headers

### Issue 4: Enhancement Path
- **Location:** `_enhance_parsed_resume` (lines 2493+)
- If resume_parsed already exists, it goes through enhancement
- Enhancement might not preserve headers correctly

## Step 4: Response Format

**Model:** `gpt-4o-mini` (line 2261)  
**Temperature:** 0.2 (line 2266)  
**Max Tokens:** 4000 (line 2267) - **Recently increased from 2500**  
**Response Format:** `{"type": "json_object"}` (line 2268)

## Step 5: Cache Details

**Cache Type:** TTLCache (in-memory)  
**TTL:** 3600 seconds (1 hour)  
**Cache Key:** Generated from resume hash  
**Cache Location:** `self._cache` (TTLCache instance)

### To Clear Cache:
The cache is in-memory only, so restarting the server clears it. To clear programmatically:
- Restart the Python process/server
- OR modify cache key generation (breaks cache but forces re-parse)

## Recommended Fixes

### Fix 1: Add Header Validation to Cache Check
```python
# In _parse_resume_structured_cached, after line 2078
if cached and isinstance(cached, dict):
    exp_list = cached.get("experience", [])
    if exp_list:
        # Check if entries have headers
        has_headers = any(
            exp.get("company") or exp.get("title") 
            for exp in exp_list 
            if isinstance(exp, dict)
        )
        if not has_headers:
            print("[Scout] Discarding cached parse with experience entries missing headers")
            cached = None
            self._cache.delete(cache_key)
```

### Fix 2: Add More Explicit Examples to Prompt
Add concrete before/after examples showing exactly what GPT should extract.

### Fix 3: Use Stronger Model for Parsing
Change `PARSING_MODEL = "gpt-4o-mini"` to `PARSING_MODEL = "gpt-4o"` for better structure following.

### Fix 4: Add Debug Logging
Log the actual parsed experience structure to see what GPT is returning.

