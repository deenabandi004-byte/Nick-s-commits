"""
Company Search Service - SERP API Company Search + OpenAI NLP Parsing
Handles firm discovery based on natural language prompts
"""
import json
import hashlib
import logging
import threading
import time as _time
from typing import Optional, List, Dict, Any

from app.services.openai_client import get_openai_client

logger = logging.getLogger(__name__)


# =============================================================================
# INDUSTRY MAPPING - Maps user-friendly names to PDL industry codes
# =============================================================================

INDUSTRY_MAPPING = {
    "investment banking": {
        "industries": ["investment banking", "financial services", "banking"],
        "sub_industries": ["investment banking", "mergers and acquisitions", "capital markets"],
        "tags": ["investment bank", "m&a", "ib", "bulge bracket", "boutique bank"]
    },
    "real estate private equity": {
        "industries": ["real estate", "investment management", "private equity"],
        "sub_industries": ["real estate investment", "private equity", "real estate development"],
        "tags": ["repe", "real estate fund", "property investment"]
    },
    "venture capital": {
        "industries": ["venture capital", "investment management", "financial services"],
        "sub_industries": ["venture capital", "startup funding", "growth equity"],
        "tags": ["vc", "seed funding", "series a", "startup investor"]
    },
    "private equity": {
        "industries": ["private equity", "investment management", "financial services"],
        "sub_industries": ["private equity", "leveraged buyout", "growth equity"],
        "tags": ["pe", "buyout", "lbo", "portfolio company"]
    },
    "consulting": {
        "industries": ["management consulting", "consulting", "professional services"],
        "sub_industries": ["strategy consulting", "management consulting", "business consulting"],
        "tags": ["mbb", "strategy", "big 4", "advisory"]
    },
    "software engineering": {
        "industries": ["software", "technology", "information technology"],
        "sub_industries": ["software development", "saas", "enterprise software"],
        "tags": ["tech", "software", "engineering", "developer"]
    },
    "product management": {
        "industries": ["technology", "software", "internet"],
        "sub_industries": ["product development", "product management", "technology"],
        "tags": ["product", "pm", "tech product"]
    },
    "hedge fund": {
        "industries": ["hedge funds", "investment management", "financial services"],
        "sub_industries": ["hedge fund", "asset management", "alternative investments"],
        "tags": ["hf", "quant", "trading", "alpha"]
    },
    "asset management": {
        "industries": ["asset management", "investment management", "financial services"],
        "sub_industries": ["wealth management", "portfolio management", "institutional investing"],
        "tags": ["am", "wealth", "portfolio", "aum"]
    },
    "accounting": {
        "industries": ["accounting", "professional services", "financial services"],
        "sub_industries": ["public accounting", "audit", "tax"],
        "tags": ["big 4", "cpa", "audit", "tax"]
    }
}

# Size bucket mapping
SIZE_MAPPING = {
    "small": {"min": 1, "max": 50},
    "mid": {"min": 51, "max": 500},
    "large": {"min": 501, "max": None},
    "none": None  # No filter
}

# Country code mapping
COUNTRY_CODE_MAP = {
    "united states": "us",
    "usa": "us",
    "u.s.": "us",
    "u.s.a.": "us",
    "united kingdom": "gb",
    "uk": "gb",
    "u.k.": "gb",
    "canada": "ca",
    "germany": "de",
    "france": "fr",
    "australia": "au",
    "singapore": "sg",
    "hong kong": "hk",
    "japan": "jp",
    "china": "cn",
    "india": "in",
    "brazil": "br",
    "mexico": "mx"
}


# =============================================================================
# OPENAI PROMPT PARSING - Extract structured fields from natural language
# =============================================================================

# Manual TTL cache for parsed prompts — never caches errors permanently
_parse_cache: dict[str, tuple[float, str]] = {}
_parse_cache_lock = threading.Lock()
_PARSE_CACHE_TTL_SUCCESS = 3600  # 1 hour for successful parses
_PARSE_CACHE_MAX = 500


def _normalize_query_for_cache(prompt: str) -> str:
    """Normalize query string for consistent caching."""
    return prompt.lower().strip()


def _hash_query(query: str) -> str:
    """Create stable hash for query caching."""
    normalized = _normalize_query_for_cache(query)
    return hashlib.md5(normalized.encode()).hexdigest()


def _cached_parse_firm_search_prompt_impl(normalized_query: str) -> str:
    """
    Internal cached implementation of query parsing.
    Returns JSON string for lru_cache compatibility (since dicts aren't directly hashable).
    """
    client = get_openai_client()
    prompt = normalized_query  # Use normalized query as the actual prompt
    
    system_prompt = """You are a search query parser for a professional networking platform.
Extract structured information from natural language queries about finding companies/firms.

You must extract:
1. industry (REQUIRED) - The type of business/industry. Must be one of:
   - "investment banking"
   - "real estate private equity"
   - "venture capital"
   - "private equity"
   - "consulting"
   - "software engineering"
   - "product management"
   - "hedge fund"
   - "asset management"
   - "accounting"
   If the user mentions something similar, map it to the closest option.
   BE LENIENT - if the query mentions "firms", "companies", or industry-related terms, try to infer the industry.
   If the query mentions "VC", "PE", "IB", "MBB", etc., map to the appropriate industry.
   If the user names a specific company (e.g. "Goldman Sachs"), infer the industry from that company.

2. location (OPTIONAL) - City, state, region, or country. Examples:
   - "New York, NY"
   - "San Francisco Bay Area"
   - "Los Angeles"
   - "United States"
   - "London, UK"
   BE LENIENT - extract any geographic reference, even if implicit (e.g., "Boston" = "Boston, MA").

3. size (OPTIONAL) - Company size preference:
   - "small" = 1-50 employees (startups, boutiques)
   - "mid" = 51-500 employees (mid-market)
   - "large" = 500+ employees (large firms, bulge bracket)
   - "none" = no preference
   Default to "none" if not specified.

4. keywords (OPTIONAL) - Specific focus areas, specialties, or niches. Examples:
   - ["healthcare", "M&A"]
   - ["technology", "growth equity"]
   - ["real estate", "hospitality"]
   Extract any specific sectors, deal types, or specializations mentioned.
   If the user named a specific company, include the company name as a keyword.

Respond with ONLY valid JSON in this exact format:
{
    "industry": "string or null",
    "location": "string or null",
    "size": "small|mid|large|none",
    "keywords": ["array", "of", "strings"]
}

IMPORTANT: Be as lenient as possible. If the query mentions any industry-related terms or locations, extract them even if not explicit. Only set fields to null if absolutely no information is available."""

    # Retry logic - try up to 2 times
    max_retries = 2
    last_error = None
    current_prompt = system_prompt
    
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": current_prompt},
                    {"role": "user", "content": f"Parse this search query: {prompt}"}
                ],
                temperature=0.1,
                max_tokens=500
            )
            
            result_text = response.choices[0].message.content.strip()
            
            # Clean up response - remove markdown code blocks if present
            if result_text.startswith("```"):
                result_text = result_text.split("```")[1]
                if result_text.startswith("json"):
                    result_text = result_text[4:]
            result_text = result_text.strip()
            
            parsed = json.loads(result_text)
            
            # Validate parsed fields. Discovery-first behavior: a query with
            # just a company name ("Apple") or just an industry ("fintech") or
            # just a location ("NYC") should still return useful results.
            # Industry/location are nice-to-have signals but never required —
            # the downstream search will fall back to looser SerpAPI queries
            # when fields are missing.
            if not parsed.get("industry") and not parsed.get("location") and not parsed.get("keywords"):
                # No structured signal at all — pass through the raw query as
                # a keyword so downstream search has SOMETHING to work with.
                parsed["keywords"] = [prompt.strip()] if prompt and prompt.strip() else []
            
            # Normalize industry to lowercase for mapping
            if parsed.get("industry"):
                parsed["industry"] = parsed["industry"].lower().strip()
                
            # Ensure size has a default
            if not parsed.get("size"):
                parsed["size"] = "none"
                
            # Ensure keywords is a list
            if not parsed.get("keywords"):
                parsed["keywords"] = []
            elif isinstance(parsed["keywords"], str):
                parsed["keywords"] = [parsed["keywords"]]
                
            result = {
                "success": True,
                "parsed": parsed,
                "error": None
            }
            return json.dumps(result)  # Serialize for caching
            
        except json.JSONDecodeError as e:
            last_error = f"Failed to parse OpenAI response as JSON: {e}"
            print(f"⚠️ Attempt {attempt + 1}: {last_error}")
            if attempt < max_retries - 1:
                continue
            result = {
                "success": False,
                "parsed": None,
                "error": "Failed to understand your search query. Please try rephrasing, for example: 'mid-sized investment banks in New York focused on healthcare'"
            }
            return json.dumps(result)  # Serialize for caching
        except Exception as e:
            last_error = f"OpenAI parsing error: {e}"
            print(f"⚠️ Attempt {attempt + 1}: {last_error}")
            if attempt < max_retries - 1:
                continue
            result = {
                "success": False,
                "parsed": None,
                "error": f"Error processing your search: {str(e)}"
            }
            return json.dumps(result)  # Serialize for caching
    
    # Should not reach here, but just in case
    result = {
        "success": False,
        "parsed": None,
        "error": f"Failed to parse query after {max_retries} attempts. Please try rephrasing your search."
    }
    return json.dumps(result)  # Serialize for caching


def parse_firm_search_prompt(prompt: str, use_cache: bool = True) -> Dict[str, Any]:
    """
    Use OpenAI to extract structured search parameters from natural language.
    WITH RETRY LOGIC and CACHING for robustness.
    
    Returns:
        {
            "success": bool,
            "parsed": {
                "industry": str or None,
                "location": str or None,
                "size": "small" | "mid" | "large" | "none" or None,
                "keywords": list[str]
            },
            "error": str or None (if required fields missing)
        }
    """
    # Normalize query for caching
    normalized_query = _normalize_query_for_cache(prompt)

    # Check manual TTL cache
    if use_cache:
        with _parse_cache_lock:
            entry = _parse_cache.get(normalized_query)
        if entry is not None:
            ts, cached_json = entry
            if _time.time() - ts < _PARSE_CACHE_TTL_SUCCESS:
                cached_result = json.loads(cached_json)
                # Don't serve cached errors — let them retry
                if cached_result.get("success"):
                    print(f"✅ Cache hit for query parsing: '{prompt[:50]}...'")
                    return cached_result

    # Fresh parse
    result_json = _cached_parse_firm_search_prompt_impl(normalized_query)
    result = json.loads(result_json)

    # Only cache successful parses
    if result.get("success"):
        with _parse_cache_lock:
            # Evict oldest if at capacity
            if len(_parse_cache) >= _PARSE_CACHE_MAX:
                oldest_key = min(_parse_cache, key=lambda k: _parse_cache[k][0])
                del _parse_cache[oldest_key]
            _parse_cache[normalized_query] = (_time.time(), result_json)

    return result


# =============================================================================
# LOCATION NORMALIZATION - Parse location strings for PDL query
# =============================================================================

# Common US state abbreviations and names
US_STATES = {
    "al": "alabama", "ak": "alaska", "az": "arizona", "ar": "arkansas",
    "ca": "california", "co": "colorado", "ct": "connecticut", "de": "delaware",
    "fl": "florida", "ga": "georgia", "hi": "hawaii", "id": "idaho",
    "il": "illinois", "in": "indiana", "ia": "iowa", "ks": "kansas",
    "ky": "kentucky", "la": "louisiana", "me": "maine", "md": "maryland",
    "ma": "massachusetts", "mi": "michigan", "mn": "minnesota", "ms": "mississippi",
    "mo": "missouri", "mt": "montana", "ne": "nebraska", "nv": "nevada",
    "nh": "new hampshire", "nj": "new jersey", "nm": "new mexico", "ny": "new york",
    "nc": "north carolina", "nd": "north dakota", "oh": "ohio", "ok": "oklahoma",
    "or": "oregon", "pa": "pennsylvania", "ri": "rhode island", "sc": "south carolina",
    "sd": "south dakota", "tn": "tennessee", "tx": "texas", "ut": "utah",
    "vt": "vermont", "va": "virginia", "wa": "washington", "wv": "west virginia",
    "wi": "wisconsin", "wy": "wyoming", "dc": "district of columbia"
}

# Reverse mapping (full name -> abbreviation)
STATE_ABBREVS = {v: k.upper() for k, v in US_STATES.items()}

# Known metro areas
METRO_AREAS = [
    "san francisco bay area", "bay area", "sf bay area",
    "new york metro", "nyc metro", "tri-state area",
    "los angeles metro", "la metro", "socal",
    "chicago metro", "chicagoland",
    "boston metro", "greater boston",
    "seattle metro", "puget sound",
    "dallas-fort worth", "dfw metro",
    "miami metro", "south florida",
    "washington dc metro", "dmv area"
]

# Major cities that should be treated as metro areas
MAJOR_CITY_TO_METRO = {
    "los angeles": "los angeles metro",
    "la": "los angeles metro",
    "new york": "new york metro",
    "nyc": "new york metro",
    "san francisco": "san francisco bay area",
    "sf": "san francisco bay area",
    "chicago": "chicago metro",
    "boston": "boston metro",
    "seattle": "seattle metro",
    "dallas": "dallas-fort worth",
    "miami": "miami metro",
    "washington": "washington dc metro",
    "washington dc": "washington dc metro",
    "dc": "washington dc metro"
}

# Location normalization aliases for better matching
CITY_ALIASES = {
    # New York
    "nyc": "new york",
    "new york city": "new york",
    "manhattan": "new york",
    "brooklyn": "new york",
    
    # San Francisco
    "sf": "san francisco",
    "san fran": "san francisco",
    
    # Los Angeles
    "la": "los angeles",
    
    # Other major cities
    "dc": "washington",
    "washington dc": "washington",
    "washington d.c.": "washington",
    "philly": "philadelphia",
    "vegas": "las vegas",
    "nola": "new orleans",
    
    # Saint/St variations
    "st louis": "saint louis",
    "st. louis": "saint louis",
    "st paul": "saint paul",
    "st. paul": "saint paul",
}

STATE_ALIASES = {
    "al": "alabama", "ak": "alaska", "az": "arizona", "ar": "arkansas",
    "ca": "california", "co": "colorado", "ct": "connecticut", "de": "delaware",
    "fl": "florida", "ga": "georgia", "hi": "hawaii", "id": "idaho",
    "il": "illinois", "in": "indiana", "ia": "iowa", "ks": "kansas",
    "ky": "kentucky", "la": "louisiana", "me": "maine", "md": "maryland",
    "ma": "massachusetts", "mi": "michigan", "mn": "minnesota", "ms": "mississippi",
    "mo": "missouri", "mt": "montana", "ne": "nebraska", "nv": "nevada",
    "nh": "new hampshire", "nj": "new jersey", "nm": "new mexico", "ny": "new york",
    "nc": "north carolina", "nd": "north dakota", "oh": "ohio", "ok": "oklahoma",
    "or": "oregon", "pa": "pennsylvania", "ri": "rhode island", "sc": "south carolina",
    "sd": "south dakota", "tn": "tennessee", "tx": "texas", "ut": "utah",
    "vt": "vermont", "va": "virginia", "wa": "washington", "wv": "west virginia",
    "wi": "wisconsin", "wy": "wyoming",
}

COUNTRY_ALIASES = {
    "usa": "united states",
    "us": "united states",
    "u.s.": "united states",
    "u.s.a.": "united states",
    "america": "united states",
    "united states of america": "united states",
    "uk": "united kingdom",
    "u.k.": "united kingdom",
    "great britain": "united kingdom",
    "britain": "united kingdom",
    "england": "united kingdom",  # Not technically correct but common usage
    "gb": "united kingdom",
}

# Statistics tracking for normalization improvements
_normalization_stats = {"matches_saved": 0, "aliases_used": {}}


def get_normalization_stats() -> Dict[str, Any]:
    """
    Get statistics about location normalization improvements.
    
    Returns:
        Dictionary with matches_saved count and aliases_used frequency
    """
    return {
        "matches_saved": _normalization_stats["matches_saved"],
        "aliases_used": dict(_normalization_stats["aliases_used"]),
        "top_aliases": sorted(
            _normalization_stats["aliases_used"].items(),
            key=lambda x: x[1],
            reverse=True
        )[:10]  # Top 10 most used aliases
    }


def normalize_location_string(location_str: str) -> str:
    """
    Normalize location string for comparison using aliases.
    
    Args:
        location_str: Location string to normalize
        
    Returns:
        Normalized location string
    """
    if not location_str:
        return ""
    
    normalized = location_str.lower().strip()
    original = normalized
    
    # Check city aliases first
    if normalized in CITY_ALIASES:
        normalized = CITY_ALIASES[normalized]
        alias_key = f"city:{original}"
        _normalization_stats["aliases_used"][alias_key] = _normalization_stats["aliases_used"].get(alias_key, 0) + 1
        return normalized
    
    # Check state aliases
    if normalized in STATE_ALIASES:
        normalized = STATE_ALIASES[normalized]
        alias_key = f"state:{original}"
        _normalization_stats["aliases_used"][alias_key] = _normalization_stats["aliases_used"].get(alias_key, 0) + 1
        return normalized
    
    # Check country aliases
    if normalized in COUNTRY_ALIASES:
        normalized = COUNTRY_ALIASES[normalized]
        alias_key = f"country:{original}"
        _normalization_stats["aliases_used"][alias_key] = _normalization_stats["aliases_used"].get(alias_key, 0) + 1
        return normalized
    
    return normalized


def locations_match(location1: str, location2: str) -> bool:
    """
    Check if two location strings refer to the same place using normalization.
    
    Args:
        location1: First location string
        location2: Second location string
        
    Returns:
        True if locations match after normalization, False otherwise
    """
    if not location1 or not location2:
        return False
    
    norm1 = normalize_location_string(location1)
    norm2 = normalize_location_string(location2)
    
    if not norm1 or not norm2:
        return False
    
    # Track if normalization enabled a match that would have failed
    original_match = (location1.lower().strip() == location2.lower().strip() or
                     location1.lower().strip() in location2.lower().strip() or
                     location2.lower().strip() in location1.lower().strip())
    
    # Exact match after normalization
    if norm1 == norm2:
        if not original_match:
            _normalization_stats["matches_saved"] += 1
        return True
    
    # Partial match (one contains the other) after normalization
    if norm1 in norm2 or norm2 in norm1:
        if not original_match:
            _normalization_stats["matches_saved"] += 1
        return True
    
    return False


# Metro area to cities mapping (used for location matching)
METRO_CITIES_MAP = {
    "san francisco bay area": ["san francisco", "palo alto", "mountain view", "sunnyvale", "san jose", "fremont", "oakland", "redwood city", "menlo park"],
    "bay area": ["san francisco", "palo alto", "mountain view", "sunnyvale", "san jose", "fremont", "oakland"],
    "sf bay area": ["san francisco", "palo alto", "mountain view", "sunnyvale", "san jose", "fremont", "oakland"],
    "new york metro": ["new york", "nyc", "manhattan", "brooklyn", "queens", "bronx", "staten island"],
    "nyc metro": ["new york", "nyc", "manhattan", "brooklyn", "queens", "bronx"],
    "tri-state area": ["new york", "nyc", "new jersey", "connecticut"],
    "los angeles metro": [
        "los angeles", "la", "santa monica", "beverly hills", "pasadena", "glendale",
        "burbank", "hollywood", "culver city", "universal city", "west hollywood",
        "torrance", "el segundo", "hawthorne", "calabasas", "calabasas hills",
        "manhattan beach", "redondo beach", "hermosa beach", "venice", "marina del rey",
        "encino", "sherman oaks", "studio city", "north hollywood", "van nuys",
        "santa clarita", "valencia", "newhall", "long beach", "compton",
        "inglewood", "gardena", "lomita", "san pedro", "wilmington"
    ],
    "la metro": [
        "los angeles", "la", "santa monica", "beverly hills", "pasadena", "glendale",
        "burbank", "hollywood", "culver city", "universal city", "west hollywood",
        "torrance", "el segundo", "hawthorne", "calabasas", "calabasas hills"
    ],
    "socal": ["los angeles", "la", "san diego", "orange county"],
    "chicago metro": ["chicago"],
    "chicagoland": ["chicago"],
    "boston metro": ["boston", "cambridge", "somerville"],
    "greater boston": ["boston", "cambridge", "somerville"],
    "seattle metro": ["seattle", "bellevue", "redmond"],
    "puget sound": ["seattle", "bellevue", "redmond"],
    "dallas-fort worth": ["dallas", "fort worth", "arlington"],
    "dfw metro": ["dallas", "fort worth", "arlington"],
    "miami metro": ["miami", "miami beach"],
    "south florida": ["miami", "miami beach", "fort lauderdale"],
    "washington dc metro": ["washington", "dc", "arlington", "alexandria", "bethesda"],
    "dmv area": ["washington", "dc", "arlington", "alexandria", "bethesda", "maryland", "virginia"]
}

# Countries
COUNTRIES = [
    "united states", "usa", "us", "united kingdom", "uk", "canada",
    "germany", "france", "australia", "singapore", "hong kong",
    "japan", "china", "india", "brazil", "mexico"
]


def normalize_location(location_input: str) -> Dict[str, Optional[str]]:
    """
    Parse a location string and return structured location data for PDL query.
    
    Returns:
        {
            "locality": str or None (city),
            "region": str or None (state/province),
            "metro": str or None (metro area),
            "country": str or None
        }
    """
    if not location_input:
        return {"locality": None, "region": None, "metro": None, "country": None}
    
    location = location_input.lower().strip()
    result = {"locality": None, "region": None, "metro": None, "country": None}
    
    # Check for metro areas first
    for metro in METRO_AREAS:
        if metro in location:
            result["metro"] = location_input  # Use original casing
            # Also set country for US metros
            if any(us_metro in metro for us_metro in ["bay area", "nyc", "la", "chicago", "boston", "seattle", "dallas", "miami", "dc", "dmv"]):
                result["country"] = "united states"
            return result
    
    # Check for country-only input
    for country in COUNTRIES:
        if location == country or location.replace(".", "") == country:
            result["country"] = country.title() if country not in ["usa", "us", "uk"] else country.upper()
            return result
    
    # Try to parse "City, State" or "City, State, Country" format
    parts = [p.strip() for p in location.split(",")]
    
    if len(parts) >= 2:
        city = parts[0]
        second = parts[1].strip().lower()
        
        # Check if second part is a US state
        if second in US_STATES or second in US_STATES.values():
            result["locality"] = parts[0].title()
            # Convert to full state name for PDL
            if second in US_STATES:
                result["region"] = US_STATES[second].title()
            else:
                result["region"] = second.title()
            result["country"] = "united states"
        else:
            # Might be "City, Country"
            result["locality"] = parts[0].title()
            for country in COUNTRIES:
                if second == country or second.replace(".", "") == country:
                    result["country"] = country.title() if country not in ["usa", "us", "uk"] else country.upper()
                    break
            if not result["country"]:
                # Assume it's a region/state in another country
                result["region"] = parts[1].title()
                
        if len(parts) >= 3:
            # Third part is likely country
            third = parts[2].strip().lower()
            for country in COUNTRIES:
                if third == country or third.replace(".", "") == country:
                    result["country"] = country.title() if country not in ["usa", "us", "uk"] else country.upper()
                    break
    else:
        # Single value - could be city, state, or country
        # Check if it's a state
        if location in US_STATES:
            result["region"] = US_STATES[location].title()
            result["country"] = "united states"
        elif location in US_STATES.values():
            result["region"] = location.title()
            result["country"] = "united states"
        else:
            # Assume it's a city
            result["locality"] = location_input.title()
            # Check if it's a major city that should be treated as a metro area
            if location in MAJOR_CITY_TO_METRO:
                result["metro"] = MAJOR_CITY_TO_METRO[location]
                result["country"] = "united states"
    
    return result


def _get_rejection_reason(firm_location: Dict[str, Any], requested_location: Dict[str, Optional[str]]) -> str:
    """
    Categorize why a location match failed.
    
    Args:
        firm_location: Firm's location dict
        requested_location: Requested location dict
        
    Returns:
        String describing the rejection reason
    """
    if not firm_location:
        return "missing_firm_location"
    
    if not firm_location.get("city") and not firm_location.get("state"):
        return "incomplete_firm_location"
    
    if not firm_location.get("country") and requested_location.get("country"):
        return "missing_country"
    
    # Check specific mismatches
    firm_country = normalize_location_string(firm_location.get("country") or "")
    req_country = normalize_location_string(requested_location.get("country") or "")
    if req_country and firm_country and firm_country != req_country:
        return "country_mismatch"
    
    if requested_location.get("metro"):
        return "metro_mismatch"
    
    if requested_location.get("region"):
        firm_state = normalize_location_string(firm_location.get("state") or "")
        req_region = normalize_location_string(requested_location.get("region") or "")
        if req_region and firm_state and not locations_match(firm_state, req_region):
            return "state_mismatch"
    
    if requested_location.get("locality"):
        firm_city = normalize_location_string(firm_location.get("city") or "")
        req_city = normalize_location_string(requested_location.get("locality") or "")
        if req_city and firm_city and not locations_match(firm_city, req_city):
            return "city_mismatch"
    
    return "location_mismatch"


def firm_location_matches(firm_location: Dict[str, Any], requested_location: Dict[str, Optional[str]], search_id: Optional[str] = None) -> bool:
    """
    Check if a firm's location matches the requested location criteria.
    Uses normalization to handle abbreviations and variations.
    
    Args:
        firm_location: Firm's location dict with keys: city, state, country
        requested_location: Requested location dict with keys: locality, region, metro, country
    
    Returns:
        True if firm location matches requested location, False otherwise
    """
    if not requested_location:
        # No location filter requested — everything matches
        return True
    if not firm_location:
        # Firm has no location data but user requested a specific location — reject
        logger.debug("company_search_no_firm_location", extra={
            "search_id": search_id,
            "action": "rejecting_firm_no_location_data"
        })
        return False
    
    firm_city = firm_location.get("city") or ""
    firm_state = firm_location.get("state") or ""
    firm_country = firm_location.get("country") or ""
    
    # Normalize country names using the new normalization helper
    firm_country_norm = normalize_location_string(firm_country) if firm_country else ""
    req_country = requested_location.get("country") or ""
    req_country_norm = normalize_location_string(req_country) if req_country else ""
    
    # Check country match first (required if country is specified)
    if req_country_norm:
        if not firm_country_norm:
            # If firm has no country but we require one, fail
            return False
        # Use normalized comparison
        if firm_country_norm != req_country_norm:
            # Country mismatch
            return False
    
    # Check metro area match (most flexible)
    if requested_location.get("metro"):
        metro = requested_location["metro"] or ""
        metro_normalized = normalize_location_string(metro)
        metro_lower = metro.lower().strip()
        
        # Try both original and normalized metro name
        metro_cities_list = METRO_CITIES_MAP.get(metro_lower, [])
        if not metro_cities_list and metro_normalized != metro_lower:
            metro_cities_list = METRO_CITIES_MAP.get(metro_normalized, [])
        
        if metro_cities_list:
            # Normalize firm city and state for better matching
            firm_city_normalized = normalize_location_string(firm_city) if firm_city else ""
            firm_state_normalized = normalize_location_string(firm_state) if firm_state else ""
            firm_location_str = f"{firm_city_normalized} {firm_state_normalized}".lower()
            
            # Check if any metro city matches (including normalized versions)
            for metro_city in metro_cities_list:
                metro_city_normalized = normalize_location_string(metro_city)
                if (metro_city in firm_location_str or 
                    metro_city_normalized in firm_location_str or
                    locations_match(firm_city, metro_city)):
                    return True
            # If no match found for metro, fail
            return False
    
    # If no metro is set but locality is a major city, check if firm is in that metro area
    if requested_location.get("locality") and not requested_location.get("metro"):
        req_locality = requested_location["locality"] or ""
        req_locality_normalized = normalize_location_string(req_locality)
        
        # Check if this locality is a major city that maps to a metro (try both original and normalized)
        metro_name = None
        if req_locality.lower().strip() in MAJOR_CITY_TO_METRO:
            metro_name = MAJOR_CITY_TO_METRO[req_locality.lower().strip()]
        elif req_locality_normalized in MAJOR_CITY_TO_METRO:
            metro_name = MAJOR_CITY_TO_METRO[req_locality_normalized]
        
        if metro_name:
            metro_cities_list = METRO_CITIES_MAP.get(metro_name, [])
            if metro_cities_list:
                firm_city_normalized = normalize_location_string(firm_city) if firm_city else ""
                firm_location_str = f"{firm_city_normalized} {normalize_location_string(firm_state) if firm_state else ''}".lower()
                # Check if firm city is in the metro area (check normalized city names too)
                for metro_city in metro_cities_list:
                    if metro_city in firm_location_str or locations_match(firm_city, metro_city):
                        return True
                # Also check exact match with the requested city using normalization
                if locations_match(firm_city, req_locality):
                    return True
    
    # Check region/state match
    if requested_location.get("region"):
        req_region = requested_location["region"] or ""
        
        # Normalize both sides using the new helper
        firm_state_norm = normalize_location_string(firm_state) if firm_state else ""
        req_region_norm = normalize_location_string(req_region) if req_region else ""
        
        # Also check if it's a US state abbreviation (for backward compatibility)
        req_region_lower = req_region.lower().strip()
        if req_region_lower in US_STATES:
            req_region_full = US_STATES[req_region_lower].lower()
        else:
            req_region_full = req_region_norm
        
        # Check state match using normalized values
        state_matched = False
        if firm_state_norm:
            # Direct match after normalization
            if firm_state_norm == req_region_norm or firm_state_norm == req_region_full:
                state_matched = True
            # Partial match (e.g., "new york" matches "new york state")
            elif req_region_full in firm_state_norm or firm_state_norm in req_region_full:
                state_matched = True
            # Also try using locations_match helper for fuzzy matching
            elif locations_match(firm_state, req_region):
                state_matched = True

        if state_matched:
            # If only region requested (no city), state match is sufficient
            if not requested_location.get("locality"):
                return True
            # If city is also requested, fall through to the city check below
        else:
            # Region didn't match — fail unless city can override
            if not requested_location.get("locality"):
                return False
    
    # Check locality/city match
    if requested_location.get("locality"):
        req_city = requested_location["locality"] or ""
        
        # Use the locations_match helper for better normalization
        if firm_city and req_city:
            if locations_match(firm_city, req_city):
                return True
        
        # Fallback to original logic for edge cases
        if firm_city and req_city:
            firm_city_lower = firm_city.lower().strip()
            req_city_lower = req_city.lower().strip()
            # Direct match
            if firm_city_lower == req_city_lower:
                return True
            # Partial match (e.g., "new york" matches "new york city")
            if req_city_lower in firm_city_lower or firm_city_lower in req_city_lower:
                return True
        
        # If we have a city requirement but no match, fail
        return False
    
    # If we got here and country matched (or no country requirement), location matches
    # This handles the case where only country is specified
    return True



def transform_serp_company_to_firm(company: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Transform a ChatGPT-extracted company record (from SERP) into our Firm format.
    
    ChatGPT-extracted data format:
    - name: Company name
    - website: Website URL
    - linkedinUrl: LinkedIn URL
    - location: {city, state, country}
    - industry: Industry string
    - employeeCount: Integer or None
    - sizeBucket: "small" | "mid" | "large" | None
    - founded: Year (integer) or None
    
    Output format (same as PDL):
    {
        "id": str,
        "name": str,
        "website": str or None,
        "linkedinUrl": str or None,
        "location": {
            "city": str or None,
            "state": str or None,
            "country": str or None,
            "display": str  # Formatted for display
        },
        "industry": str or None,
        "employeeCount": int or None,
        "sizeBucket": "small" | "mid" | "large" | None,
        "sizeRange": str or None,
        "founded": int or None (year)
    }
    """
    try:
        # Get location data
        location_data = company.get("location", {}) or {}
        if not isinstance(location_data, dict):
            location_data = {}
        
        city = location_data.get("city")
        state = location_data.get("state")
        country = location_data.get("country")
        
        # Build display location
        location_parts = [p for p in [city, state, country] if p]
        display_location = ", ".join(location_parts) if location_parts else "Unknown"
        
        # Get employee count and size bucket
        employee_count = company.get("employeeCount")
        size_bucket = company.get("sizeBucket")
        
        # If we have employee count but no size bucket, calculate it
        if employee_count and isinstance(employee_count, int) and employee_count > 0:
            if not size_bucket:
                if employee_count <= 50:
                    size_bucket = "small"
                elif employee_count <= 500:
                    size_bucket = "mid"
                else:
                    size_bucket = "large"
        elif size_bucket and not employee_count:
            # Estimate employee count from size bucket
            if size_bucket == "small":
                employee_count = 25  # Midpoint of 1-50
            elif size_bucket == "mid":
                employee_count = 275  # Midpoint of 51-500
            elif size_bucket == "large":
                employee_count = 1000  # Representative large number
        
        # Get company name
        company_name = company.get("name", "Unknown Company")
        if not company_name or company_name.strip() == "":
            return None
        
        # Get website - ensure it has protocol
        website = company.get("website")
        if website:
            website = str(website).strip()
            if website and website.lower() not in ['null', 'none', '']:
                if not website.startswith("http"):
                    website = f"https://{website}"
            else:
                website = None
        
        # Get LinkedIn URL - ensure it has protocol
        linkedin_url = company.get("linkedinUrl")
        if linkedin_url:
            linkedin_url = str(linkedin_url).strip()
            if linkedin_url and linkedin_url.lower() not in ['null', 'none', '']:
                if not linkedin_url.startswith("http"):
                    linkedin_url = f"https://{linkedin_url}"
            else:
                linkedin_url = None
        
        # Generate stable ID from domain or name
        identifier = website or company_name
        if identifier:
            # Extract domain from URL if needed
            if "://" in identifier:
                identifier = identifier.split("://")[1].split("/")[0]
            firm_id = hashlib.md5(identifier.encode()).hexdigest()[:16]
        else:
            firm_id = hashlib.md5(company_name.encode()).hexdigest()[:16]
        
        # Get industry
        industry = company.get("industry")
        
        # Get founded year
        founded = company.get("founded")
        if founded and not isinstance(founded, int):
            try:
                founded = int(founded)
            except (ValueError, TypeError):
                founded = None
        
        return {
            "id": firm_id,
            "name": company_name,
            "website": website,
            "linkedinUrl": linkedin_url,
            "location": {
                "city": city,
                "state": state,
                "country": country,
                "display": display_location
            },
            "industry": industry,
            "employeeCount": employee_count,
            "sizeBucket": size_bucket,
            "sizeRange": None,  # SERP doesn't provide size ranges like PDL
            "founded": founded
        }
    
    except Exception as e:
        print(f"Error transforming SERP company: {e}")
        import traceback
        traceback.print_exc()
        return None

# =============================================================================
# MAIN SEARCH FUNCTION - Combines parsing + SERP search
# =============================================================================

ADJACENT_INDUSTRIES = {
    "investment banking": ["private equity", "venture capital", "asset management", "hedge fund"],
    "private equity": ["investment banking", "venture capital", "hedge fund", "consulting"],
    "venture capital": ["private equity", "investment banking", "software engineering"],
    "consulting": ["private equity", "accounting", "investment banking"],
    "hedge fund": ["asset management", "investment banking", "private equity"],
    "asset management": ["hedge fund", "investment banking", "private equity"],
    "software engineering": ["product management", "venture capital"],
    "product management": ["software engineering", "consulting"],
    "accounting": ["consulting", "investment banking"],
    "real estate private equity": ["private equity", "investment banking"],
}

NEARBY_LOCATIONS = {
    "new york": ["Boston", "Philadelphia", "Connecticut"],
    "san francisco": ["Silicon Valley", "San Jose", "Oakland"],
    "los angeles": ["Orange County", "San Diego", "Santa Monica"],
    "chicago": ["Milwaukee", "Indianapolis"],
    "boston": ["New York", "Connecticut"],
    "dallas": ["Houston", "Austin"],
    "houston": ["Dallas", "Austin"],
    "atlanta": ["Charlotte", "Nashville"],
    "miami": ["Fort Lauderdale", "Tampa"],
    "washington": ["Baltimore", "Northern Virginia"],
    "seattle": ["Portland", "San Francisco"],
}


def _build_firm_search_suggestions(parsed: dict, location: str, firms_found: int, limit: int) -> list:
    """Build actionable suggestions when firm search returns sparse results."""
    suggestions = []
    industry = (parsed.get("industry") or "").lower()
    loc = (location or "").lower()

    # Suggest adjacent industries
    if industry in ADJACENT_INDUSTRIES:
        for adj in ADJACENT_INDUSTRIES[industry][:2]:
            suggestions.append({
                "type": "broaden_query",
                "label": f"Try {adj} firms" + (f" in {parsed.get('location', '')}" if parsed.get("location") else ""),
                "query": f"{adj} firms" + (f" in {parsed.get('location', '')}" if parsed.get("location") else ""),
            })

    # Suggest nearby locations
    for loc_key, nearby in NEARBY_LOCATIONS.items():
        if loc_key in loc:
            for nearby_city in nearby[:2]:
                suggestions.append({
                    "type": "broaden_query",
                    "label": f"Try {industry} in {nearby_city}",
                    "query": f"{industry} firms in {nearby_city}",
                })
            break

    return suggestions[:4]


def search_firms(prompt: str, limit: int = 20, search_id: Optional[str] = None,
                 filter_overrides: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Main entry point for firm search.
    Takes a natural language prompt, parses it, and returns matching firms.
    WITH AUTOMATIC FALLBACK if not enough results found.
    
    Returns:
        {
            "success": bool,
            "firms": list[Firm],
            "total": int,
            "parsedFilters": dict,  # What we extracted from the prompt
            "error": str or None,
            "fallbackApplied": bool,  # True if search was broadened
            "queryLevel": int  # Strictness level that succeeded
        }
    """
    # Step 1: Parse the natural language prompt
    from app.services.search_progress import update_search_progress
    
    if search_id:
        update_search_progress(search_id, current=0, step="Parsing search query...")
    
    parse_result = parse_firm_search_prompt(prompt)
    
    if not parse_result["success"]:
        if search_id:
            from app.services.search_progress import fail_search_progress
            fail_search_progress(search_id, parse_result.get("error", "Parse failed"))
        return {
            "success": False,
            "firms": [],
            "total": 0,
            "parsedFilters": parse_result.get("parsed"),
            "error": parse_result["error"],
            "fallbackApplied": False,
            "queryLevel": None
        }
    
    parsed = parse_result["parsed"]

    # Filter-rail edits override the parse (spec: filter rail ⇄ prompt sync).
    if filter_overrides:
        from app.services.filter_overrides import apply_firm_filters
        parsed = apply_firm_filters(parsed, filter_overrides)
        if not (parsed.get("industry") or parsed.get("location") or parsed.get("keywords")):
            if search_id:
                from app.services.search_progress import fail_search_progress
                fail_search_progress(search_id, "No filters left after edits")
            return {
                "success": False, "firms": [], "total": 0,
                "parsedFilters": parsed,
                "error": "Your search needs at least one filter. Add an industry, location, or focus area.",
                "fallbackApplied": False, "queryLevel": None,
            }

    # Step 2: Normalize location
    if search_id:
        update_search_progress(search_id, current=1, step="Normalizing location...")
    location = normalize_location(parsed.get("location", ""))

    # Step 3: Search using SERP API + ChatGPT (bulletproof search handles fallbacks internally)
    from app.services.serp_client import search_companies_with_serp

    if search_id:
        update_search_progress(search_id, current=2, step="Generating firm names...")

    search_result = search_companies_with_serp(
        industry=parsed["industry"],
        location=location,
        size=parsed.get("size", "none"),
        keywords=parsed.get("keywords", []),
        limit=limit,
        original_query=prompt,  # Pass the original user query
        search_id=search_id  # Pass search_id for progress tracking
    )
    
    # Determine if fallback was applied
    query_level = search_result.get("queryLevel")
    if query_level is None:
        query_level = 3  # Default to strictest level if None
    fallback_applied = query_level < 3
    
    # Add parsed filters to result
    search_result["parsedFilters"] = {
        "industry": parsed["industry"],
        "location": parsed["location"],
        "locationNormalized": location,
        "size": parsed.get("size", "none"),
        "keywords": parsed.get("keywords", []),
        "location_defaulted": parsed.get("location_defaulted", False),
    }
    search_result["fallbackApplied"] = fallback_applied

    # Add adjacent suggestions when results are sparse
    firms_found = len(search_result.get("firms", []))
    if firms_found < limit * 0.5:
        suggestions = _build_firm_search_suggestions(parsed, parsed.get("location", ""), firms_found, limit)
        if suggestions:
            search_result["suggestions"] = suggestions

    return search_result


# =============================================================================
# STRUCTURED SEARCH - For users who prefer dropdowns
# =============================================================================

def search_firms_structured(
    industry: str,
    location: str,
    size: str = "none",
    keywords: List[str] = None,
    limit: int = 20
) -> Dict[str, Any]:
    """
    Alternative entry point using structured inputs (for dropdown UI).
    Bypasses OpenAI parsing.
    """
    if keywords is None:
        keywords = []
    
    # Validate required fields
    if not industry:
        return {
            "success": False,
            "firms": [],
            "total": 0,
            "parsedFilters": None,
            "error": "Industry is required"
        }
    
    if not location:
        return {
            "success": False,
            "firms": [],
            "total": 0,
            "parsedFilters": None,
            "error": "Location is required"
        }
    
    # Normalize inputs
    industry_lower = industry.lower().strip()
    
    # Check if industry is valid
    if industry_lower not in INDUSTRY_MAPPING:
        # Try to find closest match
        valid_industries = list(INDUSTRY_MAPPING.keys())
        return {
            "success": False,
            "firms": [],
            "total": 0,
            "parsedFilters": None,
            "error": f"Invalid industry. Please choose from: {', '.join(valid_industries)}"
        }
    
    # Normalize location
    location_normalized = normalize_location(location)
    
    # Search using SERP API + ChatGPT (bulletproof search handles fallbacks internally)
    from app.services.serp_client import search_companies_with_serp
    
    # Reconstruct a reasonable query from structured inputs for context
    query_parts = [industry]
    if location:
        query_parts.append(f"in {location}")
    if size != "none":
        query_parts.append(f"({size} companies)")
    if keywords:
        query_parts.extend(keywords[:2])  # Limit to first 2 keywords
    reconstructed_query = " ".join(query_parts)
    
    search_result = search_companies_with_serp(
        industry=industry_lower,
        location=location_normalized,
        size=size,
        keywords=keywords,
        limit=limit,
        original_query=reconstructed_query  # Pass reconstructed query for context
    )
    
    # Determine if fallback was applied
    query_level = search_result.get("queryLevel")
    if query_level is None:
        query_level = 3  # Default to strictest level if None
    fallback_applied = query_level < 3
    
    # Add parsed filters to result
    search_result["parsedFilters"] = {
        "industry": industry_lower,
        "location": location,
        "locationNormalized": location_normalized,
        "size": size,
        "keywords": keywords
    }
    search_result["fallbackApplied"] = fallback_applied
    
    return search_result


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def get_available_industries() -> List[Dict[str, str]]:
    """Return list of available industries for UI dropdowns."""
    return [
        {"value": "investment banking", "label": "Investment Banking"},
        {"value": "real estate private equity", "label": "Real Estate Private Equity"},
        {"value": "venture capital", "label": "Venture Capital"},
        {"value": "private equity", "label": "Private Equity"},
        {"value": "consulting", "label": "Consulting"},
        {"value": "software engineering", "label": "Software Engineering"},
        {"value": "product management", "label": "Product Management"},
        {"value": "hedge fund", "label": "Hedge Fund"},
        {"value": "asset management", "label": "Asset Management"},
        {"value": "accounting", "label": "Accounting"}
    ]


def get_size_options() -> List[Dict[str, str]]:
    """Return list of size options for UI dropdowns."""
    return [
        {"value": "none", "label": "No preference"},
        {"value": "small", "label": "Small (1-50 employees)"},
        {"value": "mid", "label": "Mid-sized (51-500 employees)"},
        {"value": "large", "label": "Large (500+ employees)"}
    ]

