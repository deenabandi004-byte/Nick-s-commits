"""
Prompt parser service - converts natural language prompts into structured search filters.

Single canonical parser (parse_search_prompt_structured) with adapter functions
for legacy callers that expect different output shapes.
"""
import json
import hashlib
import threading
import time
from typing import Dict, Any
from app.services.openai_client import get_openai_client

# Default timeout for OpenAI prompt parsing (keep prompt search fast)
PROMPT_PARSE_TIMEOUT = 10.0

# Shared empty result template
_EMPTY_STRUCTURED = {
    "confidence": "low",
    "original_prompt": "",
    "company_context": "",
    "companies": [],
    "locations": [],
    "schools": [],
    "industries": [],
    "title_variations": [],
}

# Manual TTL cache for parsed prompts - same pattern as company_search.py
_parse_cache: dict[str, tuple[float, dict]] = {}
_parse_cache_lock = threading.Lock()
_PARSE_CACHE_TTL = 3600   # 1 hour
_PARSE_CACHE_MAX = 500


def _make_empty(prompt: str, error: str = "") -> Dict[str, Any]:
    """Return a valid empty structured result."""
    out = dict(_EMPTY_STRUCTURED)
    out["original_prompt"] = prompt
    if error:
        out["error"] = error
    return out


def parse_search_prompt_structured(prompt: str) -> Dict[str, Any]:
    """
    Parse a natural language search prompt into structured params with company-specific
    job titles. Uses OpenAI with structured JSON output.

    This is the SINGLE canonical parser. All other parse functions delegate to this one.

    Returns:
        Dict with: original_prompt, company_context, companies [{name, matched_titles}],
        locations, schools, seniority_levels, industries, confidence ("high"|"low"),
        title_variations (flat list). On error: includes "error" key.
    """
    client = get_openai_client()
    if not client:
        return _make_empty(prompt, "OpenAI client not available")

    # --- Cache lookup ---
    cache_key = hashlib.md5(prompt.lower().strip().encode()).hexdigest()
    with _parse_cache_lock:
        if cache_key in _parse_cache:
            ts, cached_result = _parse_cache[cache_key]
            if time.time() - ts < _PARSE_CACHE_TTL:
                print(f"[PromptParser] Cache hit for prompt (MD5: {cache_key})")
                return cached_result
            else:
                del _parse_cache[cache_key]

    print("[PromptParser] Cache miss - calling OpenAI")

    system_prompt = """You are a contact search query parser. Extract structured search parameters from a user's natural language prompt for finding professional contacts.

RULES:
1. Extract companies, locations, schools, and seniority when mentioned.
2. For EACH company mentioned, generate the REAL job titles that actual employees at that company have on LinkedIn - not job posting titles, not generic titles. Use company-specific naming:
   - Amazon: use "SDE", "Software Development Engineer", not "Software Engineer".
   - Google: use "Software Engineer", "Product Manager", not "SDE".
   - Meta: use "Software Engineer" with team suffixes where relevant, "Product Manager".
   - Finance: "Investment Banking Analyst", "Investment Banking Associate" - match the seniority the user specified.
3. Title variations should primarily use domain-qualified titles (e.g., "Investment Banking Analyst", "Software Engineer"). ALSO include the standalone generic version as a fallback at the end of the list (e.g., "Analyst", "Engineer", "Associate"). Many real LinkedIn profiles only have the generic title, so including both ensures broad coverage.
4. Include seniority only when combined with the domain: e.g. "investment banking associate", "software engineering manager".
5. RESPECT the seniority level the user specified. If they say "analysts", generate analyst-level titles ONLY - do NOT add senior titles like "Vice President", "Managing Director", "Partner", "Principal" unless the user explicitly asks for them. If they say "bankers" (generic), include all levels. If they say "associates", include associate-level only. Match the user's intent.
6. Include closely related roles: if user says "PM", include "Product Manager", "Technical Program Manager", "Program Manager".
7. Expand shorthand:
   - "FAANG" → Google, Apple, Meta, Amazon, Netflix
   - "Big 4" → Deloitte, PwC, EY, KPMG
   - "MBB" → McKinsey, Bain, BCG
8. Expand location shorthand: "NYC" → "New York", "SF" → "San Francisco", "LA" → "Los Angeles", "DC" → "Washington".
9. Set confidence to "low" ONLY when the prompt has no specifics at all - no job titles/roles, no companies, no schools, and no location. Examples of LOW confidence: "find me people", "help", "good contacts". Examples of HIGH confidence: "Software engineers from USC" (title + school), "Product managers in NYC" (title + location), "People at Google" (company), "USC alumni in consulting" (school + industry). If the prompt has at least one of: title_variations, companies, schools, or locations, set confidence to "high".
10. title_variations must be a flat, deduplicated list of ALL job titles across all companies for use in search.
11. When a company is specified, generate title variations that people ACTUALLY use at that company, not generic industry titles. Think about what the company does and what titles exist there. If the user's role description doesn't match what the company does, interpret the user's INTENT - they probably want to connect with people in a related function at that company. Examples:
   - "Investment bankers at Bain" → Bain is a consulting firm, not an investment bank. The user likely wants finance-related or client-facing roles at Bain. Generate titles like: "Consultant", "Associate Consultant", "Manager", "Senior Manager", "Partner".
   - "Investment banking analysts at Goldman Sachs" → Goldman IS an investment bank. User said "analysts" so generate analyst-level only: "Investment Banking Analyst", "Analyst", "Financial Analyst". Do NOT include "Vice President" or "Managing Director" - the user specified the seniority.
   - "Investment bankers at Goldman Sachs" → User said "bankers" (generic), so include all levels: "Investment Banking Analyst", "Investment Banking Associate", "Vice President", "Managing Director", "Analyst".
   - "Engineers at McKinsey" → McKinsey is a consulting firm that does have engineers. Generate: "Software Engineer", "Data Engineer", "Engineering Manager".
   Always think about what titles actually exist at the specified company before generating variations.

12. If the user mentions an industry (e.g. "consulting", "finance", "tech", "healthcare"), include it in the industries array. Use PDL-compatible industry labels when possible: "financial services", "technology", "management consulting", "health care", "real estate", "education", "media", "legal services", "accounting", "marketing and advertising".
13. For matched_titles in the companies array and for title_variations, always include BOTH domain-specific titles AND their generic fallbacks. Examples:
    - "Investment Banking Analyst" → also include "Analyst"
    - "Software Development Engineer" → also include "Software Engineer", "Engineer"
    - "Management Consultant" → also include "Consultant"
    - "Product Manager" → also include "PM"
    Place domain-specific titles first, generic fallbacks last.

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "original_prompt": "<user prompt>",
  "company_context": "<brief description of what the specified company/companies do, e.g. 'Bain & Company is a management consulting firm'. Empty string if no company specified.>",
  "companies": [{"name": "<company name>", "matched_titles": ["<title1>", "<title2>"]}],
  "locations": ["<location1>", "<location2>"],
  "schools": [],
  "industries": [],
  "confidence": "high" or "low",
  "title_variations": ["<title1>", "<title2>", ...]
}"""

    user_prompt = f'Extract search parameters from this prompt:\n\n"{prompt}"'

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=1200,
            temperature=0.2,
            response_format={"type": "json_object"},
            timeout=PROMPT_PARSE_TIMEOUT,
        )
        result_text = (response.choices[0].message.content or "").strip()
        if not result_text:
            return _make_empty(prompt, "Empty response from OpenAI")
        parsed = json.loads(result_text)
        result = _validate_structured_parse(parsed, prompt)
        # --- Cache successful parse (don't cache errors) ---
        if "error" not in result:
            with _parse_cache_lock:
                if len(_parse_cache) >= _PARSE_CACHE_MAX:
                    oldest_key = min(_parse_cache, key=lambda k: _parse_cache[k][0])
                    del _parse_cache[oldest_key]
                _parse_cache[cache_key] = (time.time(), result)
        return result
    except json.JSONDecodeError as e:
        print(f"⚠️ Prompt parser JSON decode error: {e}")
        return _make_empty(prompt, "Failed to parse OpenAI response")
    except Exception as e:
        print(f"⚠️ Prompt parser error: {e}")
        return _make_empty(prompt, str(e))


def _validate_structured_parse(parsed: Dict, original_prompt: str) -> Dict[str, Any]:
    """Ensure all required keys and types; normalize lists and confidence."""
    out = {
        "original_prompt": str(parsed.get("original_prompt") or original_prompt),
        "company_context": str(parsed.get("company_context") or "").strip(),
        "companies": [],
        "locations": [],
        "schools": [],
        "seniority_levels": [],
        "industries": [],
        "confidence": "low",
        "title_variations": [],
    }
    if isinstance(parsed.get("companies"), list):
        for c in parsed["companies"]:
            if isinstance(c, dict) and c.get("name"):
                titles = c.get("matched_titles") or []
                out["companies"].append({
                    "name": str(c["name"]).strip(),
                    "matched_titles": [str(t).strip() for t in titles if t and str(t).strip()],
                })
    for key in ("locations", "schools", "industries", "title_variations"):
        val = parsed.get(key)
        if isinstance(val, list):
            out[key] = [str(x).strip() for x in val if x and str(x).strip()]
        elif isinstance(val, str) and val.strip():
            out[key] = [val.strip()]
    # Flatten title_variations from companies if not already populated
    if not out["title_variations"] and out["companies"]:
        seen = set()
        for c in out["companies"]:
            for t in c.get("matched_titles") or []:
                if t and t not in seen:
                    seen.add(t)
                    out["title_variations"].append(t)
    # Override confidence: high if we have at least one search dimension
    has_specifics = bool(
        out["title_variations"] or out["companies"] or out["schools"] or out["locations"]
    )
    if has_specifics:
        out["confidence"] = "high"
    else:
        conf = (parsed.get("confidence") or "").strip().lower()
        out["confidence"] = "high" if conf == "high" else "low"
    return out


# ---------------------------------------------------------------------------
# Legacy adapter: used by /api/search/parse-prompt route (parse_prompt.py)
# Converts structured output → legacy flat-array format
# ---------------------------------------------------------------------------

def parse_search_prompt(prompt: str) -> Dict:
    """
    Adapter around the canonical parser. Returns the legacy flat-array format
    expected by the /api/search/parse-prompt endpoint.

    Returns: { company, roles, location, schools, industries, max_results, confidence }
    """
    structured = parse_search_prompt_structured(prompt)

    # If the canonical parser errored, fall back to keyword matching
    if structured.get("error") and structured.get("confidence") == "low":
        return _fallback_parse(prompt)

    # Reshape: structured → legacy format
    companies = [c["name"] for c in structured.get("companies", []) if c.get("name")]
    roles = list(structured.get("title_variations", []))

    # Confidence: map "high"/"low" → float
    conf = 0.9 if structured.get("confidence") == "high" else 0.2

    return {
        "company": companies,
        "roles": roles,
        "location": list(structured.get("locations", [])),
        "schools": list(structured.get("schools", [])),
        "industries": list(structured.get("industries", [])),
        "max_results": 15,
        "confidence": conf,
    }


# ---------------------------------------------------------------------------
# Keyword fallback (no LLM available)
# ---------------------------------------------------------------------------

def _fallback_parse(prompt: str) -> Dict:
    """Fallback parser using simple keyword matching when LLM is unavailable."""
    prompt_lower = prompt.lower()

    companies = []
    roles = []
    locations = []
    schools = []

    company_keywords = {
        "goldman sachs": ["goldman", "gs"],
        "morgan stanley": ["morgan stanley"],
        "jpmorgan": ["jpmorgan", "jpm", "jp morgan"],
        "mckinsey": ["mckinsey"],
        "bain": ["bain"],
        "bcg": ["bcg", "boston consulting"],
        "google": ["google"],
        "microsoft": ["microsoft", "msft"],
        "amazon": ["amazon"],
        "apple": ["apple"],
        "meta": ["meta", "facebook"],
    }
    for company, keywords in company_keywords.items():
        if any(kw in prompt_lower for kw in keywords):
            companies.append(company)

    if "investment banking" in prompt_lower or "ib " in prompt_lower:
        roles.append("Investment Banking Analyst")
    if "software engineer" in prompt_lower or "swe" in prompt_lower:
        roles.append("Software Engineer")
    if "product manager" in prompt_lower or "pm " in prompt_lower:
        roles.append("Product Manager")
    if "consultant" in prompt_lower:
        roles.append("Consultant")

    school_keywords = {
        "University of Southern California": ["usc", "southern california"],
        "New York University": ["nyu"],
        "Stanford University": ["stanford"],
        "Harvard University": ["harvard"],
        "MIT": ["mit"],
        "UC Berkeley": ["berkeley", "uc berkeley"],
    }
    for school, keywords in school_keywords.items():
        if any(kw in prompt_lower for kw in keywords):
            schools.append(school)

    location_map = {
        "New York": ["new york", "nyc"],
        "San Francisco": ["san francisco", "sf"],
        "Los Angeles": ["los angeles", "la"],
        "Chicago": ["chicago"],
        "Boston": ["boston"],
        "Seattle": ["seattle"],
        "Austin": ["austin"],
    }
    for loc, keywords in location_map.items():
        if any(kw in prompt_lower for kw in keywords):
            locations.append(loc)

    return {
        "company": companies,
        "roles": roles,
        "location": locations,
        "schools": schools,
        "industries": [],
        "max_results": 15,
        "confidence": 0.3,
    }
