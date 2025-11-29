"""
Company Search Service - PDL Company Search + OpenAI NLP Parsing
Handles firm discovery based on natural language prompts
"""
import requests
import json
import hashlib
from datetime import datetime
from typing import Optional, List, Dict, Any

from app.config import PEOPLE_DATA_LABS_API_KEY, PDL_BASE_URL
from app.services.openai_client import get_openai_client


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


# =============================================================================
# OPENAI PROMPT PARSING - Extract structured fields from natural language
# =============================================================================

def parse_firm_search_prompt(prompt: str) -> Dict[str, Any]:
    """
    Use OpenAI to extract structured search parameters from natural language.
    
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
    client = get_openai_client()
    
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

2. location (REQUIRED) - City, state, region, or country. Examples:
   - "New York, NY"
   - "San Francisco Bay Area"
   - "Los Angeles"
   - "United States"
   - "London, UK"

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

Respond with ONLY valid JSON in this exact format:
{
    "industry": "string or null",
    "location": "string or null", 
    "size": "small|mid|large|none",
    "keywords": ["array", "of", "strings"]
}

If the query is missing required fields (industry or location), still return what you can parse but set missing required fields to null."""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
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
        
        # Validate required fields
        missing_fields = []
        if not parsed.get("industry"):
            missing_fields.append("industry")
        if not parsed.get("location"):
            missing_fields.append("location")
        
        if missing_fields:
            return {
                "success": False,
                "parsed": parsed,
                "error": f"Missing required fields: {', '.join(missing_fields)}. Please include the industry (e.g., investment banking, consulting, venture capital) and location (e.g., New York, San Francisco Bay Area) in your search. You can also add keywords like 'healthcare M&A' or 'technology focused' to narrow results.",
                "missing_fields": missing_fields
            }
        
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
            
        return {
            "success": True,
            "parsed": parsed,
            "error": None
        }
        
    except json.JSONDecodeError as e:
        print(f"Failed to parse OpenAI response as JSON: {e}")
        return {
            "success": False,
            "parsed": None,
            "error": "Failed to understand your search query. Please try rephrasing, for example: 'mid-sized investment banks in New York focused on healthcare'"
        }
    except Exception as e:
        print(f"OpenAI parsing error: {e}")
        return {
            "success": False,
            "parsed": None,
            "error": f"Error processing your search: {str(e)}"
        }


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
    
    return result


# =============================================================================
# PDL COMPANY SEARCH - Query People Data Labs Company API
# =============================================================================

def build_pdl_company_query(
    industry: str,
    location: Dict[str, Optional[str]],
    size: str,
    keywords: List[str]
) -> Dict[str, Any]:
    """
    Build a PDL Company Search API query from parsed parameters.
    
    PDL Company Search uses Elasticsearch query syntax.
    Docs: https://docs.peopledatalabs.com/docs/company-search-api
    """
    
    # Start building the query
    must_clauses = []
    should_clauses = []
    
    # Industry filter
    industry_config = INDUSTRY_MAPPING.get(industry, {})
    if industry_config:
        industry_terms = industry_config.get("industries", [])
        sub_industries = industry_config.get("sub_industries", [])
        tags = industry_config.get("tags", [])
        
        # Build industry OR clause
        industry_conditions = []
        
        if industry_terms:
            industry_conditions.append({
                "terms": {"industry": industry_terms}
            })
        
        if tags:
            # Tags can match against company tags or summary
            for tag in tags:
                industry_conditions.append({
                    "match": {"tags": tag}
                })
        
        if industry_conditions:
            must_clauses.append({
                "bool": {
                    "should": industry_conditions
                }
            })
    
    # Location filter
    location_conditions = []
    
    if location.get("locality"):
        location_conditions.append({
            "match": {"location.locality": location["locality"]}
        })
    
    if location.get("region"):
        location_conditions.append({
            "match": {"location.region": location["region"]}
        })
    
    if location.get("metro"):
        location_conditions.append({
            "match": {"location.metro": location["metro"]}
        })
    
    if location.get("country"):
        location_conditions.append({
            "match": {"location.country": location["country"]}
        })
    
    if location_conditions:
        must_clauses.append({
            "bool": {
                "should": location_conditions
            }
        })
    
    # Size filter
    size_config = SIZE_MAPPING.get(size)
    if size_config:
        size_range = {}
        if size_config.get("min") is not None:
            size_range["gte"] = size_config["min"]
        if size_config.get("max") is not None:
            size_range["lte"] = size_config["max"]
        
        if size_range:
            must_clauses.append({
                "range": {"employee_count": size_range}
            })
    
    # Keywords filter (boost relevance, don't require)
    if keywords:
        for keyword in keywords:
            should_clauses.append({
                "multi_match": {
                    "query": keyword,
                    "fields": ["tags", "summary", "industry", "name"],
                    "type": "best_fields",
                    "boost": 2
                }
            })
    
    # Build final query
    query = {
        "bool": {
            "must": must_clauses
        }
    }
    
    if should_clauses:
        query["bool"]["should"] = should_clauses
    
    return query


def convert_es_to_sql(
    query: Dict[str, Any],
    industry: str,
    location: Dict[str, Optional[str]],
    size: str,
    keywords: List[str]
) -> str:
    """
    Convert Elasticsearch query to SQL format for PDL Company Search API.
    
    PDL Company Search uses SQL queries like:
    SELECT * FROM company WHERE industry='tech' AND location.country='United States'
    """
    conditions = []
    
    # Industry condition
    industry_config = INDUSTRY_MAPPING.get(industry, {})
    if industry_config:
        industry_terms = industry_config.get("industries", [])
        if industry_terms:
            # Use first industry term as primary filter
            conditions.append(f"industry='{industry_terms[0]}'")
    
    # Location conditions - Use simplest possible SQL syntax
    # PDL SQL might have very specific requirements, so use exact match or simple text search
    if location.get("locality"):
        loc_safe = location['locality'].replace("'", "''")
        # Try exact match first, then text search as fallback
        conditions.append(f"(location='{loc_safe}' OR location LIKE '%{loc_safe}%')")
    elif location.get("region"):
        region_safe = location['region'].replace("'", "''")
        conditions.append(f"(location='{region_safe}' OR location LIKE '%{region_safe}%')")
    elif location.get("country"):
        country_safe = location['country'].replace("'", "''")
        conditions.append(f"(location='{country_safe}' OR location LIKE '%{country_safe}%')")
    
    # Size condition
    size_config = SIZE_MAPPING.get(size)
    if size_config:
        if size_config.get("min") is not None and size_config.get("max") is not None:
            conditions.append(f"employee_count>={size_config['min']} AND employee_count<={size_config['max']}")
        elif size_config.get("min") is not None:
            conditions.append(f"employee_count>={size_config['min']}")
    
    # Keywords (use for relevance boost in SQL)
    if keywords:
        # Add keywords as OR conditions on name/tags/summary
        keyword_conditions = []
        for kw in keywords[:3]:  # Limit to first 3 keywords
            kw_safe = kw.replace("'", "''")  # Escape single quotes
            # Use simple LIKE for text matching
            keyword_conditions.append(f"(name LIKE '%{kw_safe}%' OR tags LIKE '%{kw_safe}%' OR summary LIKE '%{kw_safe}%')")
        if keyword_conditions:
            conditions.append(f"({' OR '.join(keyword_conditions)})")
    
    # Build final SQL query
    where_clause = " AND ".join(conditions) if conditions else "1=1"
    sql = f"SELECT * FROM company WHERE {where_clause}"
    
    return sql


def search_companies_with_pdl(
    industry: str,
    location: Dict[str, Optional[str]],
    size: str = "none",
    keywords: List[str] = None,
    limit: int = 20
) -> Dict[str, Any]:
    """
    Search for companies using PDL Company Search API.
    
    Returns:
        {
            "success": bool,
            "firms": list[Firm],
            "total": int,
            "error": str or None
        }
    """
    if keywords is None:
        keywords = []
    
    try:
        # Build the query
        query = build_pdl_company_query(industry, location, size, keywords)
        
        print(f"PDL Company Search Query (ES format): {json.dumps(query, indent=2)}")
        
        # Try Elasticsearch query format first (PDL Company Search may accept ES queries)
        # If that fails, we'll fall back to SQL
        payload_es = {
            "query": query,
            "size": limit,
            "dataset": "all_companies",
            "pretty": True
        }
        
        print(f"PDL API Payload (ES format): {json.dumps(payload_es, indent=2)}")
        
        # Make API request to PDL Company Search API - try ES format first
        response = requests.post(
            f"{PDL_BASE_URL}/company/search",
            headers={
                "Content-Type": "application/json",
                "X-Api-Key": PEOPLE_DATA_LABS_API_KEY
            },
            json=payload_es,
            timeout=30
        )
        
        # If ES format fails, try SQL format as fallback
        if response.status_code == 400:
            print("ES format failed, trying SQL format...")
            sql_query = convert_es_to_sql(query, industry, location, size, keywords)
            print(f"PDL SQL Query: {sql_query}")
            
            payload_sql = {
                "sql": sql_query,
                "size": limit,
                "dataset": "all_companies",
                "pretty": True
            }
            
            print(f"PDL API Payload (SQL format): {json.dumps(payload_sql, indent=2)}")
            
            response = requests.post(
                f"{PDL_BASE_URL}/company/search",
                headers={
                    "Content-Type": "application/json",
                    "X-Api-Key": PEOPLE_DATA_LABS_API_KEY
                },
                json=payload_sql,
                timeout=30
            )
        
        print(f"PDL API Response Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            if data.get("status") == 200:
                raw_companies = data.get("data", [])
                total = data.get("total", len(raw_companies))
                
                # Transform to our Firm format
                firms = []
                seen_domains = set()  # De-duplicate by domain
                
                for company in raw_companies:
                    domain = company.get("website") or company.get("linkedin_url", "")
                    
                    # Skip duplicates
                    if domain and domain in seen_domains:
                        continue
                    if domain:
                        seen_domains.add(domain)
                    
                    firm = transform_pdl_company_to_firm(company)
                    if firm:
                        firms.append(firm)
                
                print(f"PDL returned {len(firms)} unique firms")
                
                return {
                    "success": True,
                    "firms": firms[:limit],
                    "total": total,
                    "error": None
                }
            else:
                error_msg = data.get("error", {}).get("message", "Unknown PDL error")
                print(f"PDL API error: {error_msg}")
                return {
                    "success": False,
                    "firms": [],
                    "total": 0,
                    "error": f"Search failed: {error_msg}"
                }
        
        elif response.status_code == 400:
            error_data = response.json()
            error_msg = error_data.get("error", {}).get("message", "Invalid search parameters")
            print(f"PDL 400 error: {error_msg}")
            return {
                "success": False,
                "firms": [],
                "total": 0,
                "error": f"Invalid search: {error_msg}"
            }
        
        elif response.status_code == 401:
            print("PDL API: Invalid API key")
            return {
                "success": False,
                "firms": [],
                "total": 0,
                "error": "API authentication failed. Please contact support."
            }
        
        elif response.status_code == 402:
            print("PDL API: Payment required (out of credits)")
            return {
                "success": False,
                "firms": [],
                "total": 0,
                "error": "Search credits exhausted. Please try again later."
            }
        
        elif response.status_code == 404:
            print("PDL API: No results found")
            return {
                "success": True,
                "firms": [],
                "total": 0,
                "error": None
            }
        
        else:
            print(f"PDL API unexpected status: {response.status_code}")
            print(f"Response: {response.text[:500]}")
            return {
                "success": False,
                "firms": [],
                "total": 0,
                "error": f"Unexpected error (status {response.status_code})"
            }
    
    except requests.exceptions.Timeout:
        print("PDL API timeout")
        return {
            "success": False,
            "firms": [],
            "total": 0,
            "error": "Search timed out. Please try again."
        }
    
    except Exception as e:
        print(f"PDL Company Search error: {e}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "firms": [],
            "total": 0,
            "error": f"Search failed: {str(e)}"
        }


def transform_pdl_company_to_firm(company: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Transform a PDL company record into our Firm format.
    
    Output format:
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
        "founded": int or None (year)
    }
    """
    try:
        # Get primary location (HQ)
        location_data = company.get("location", {}) or {}
        
        # Handle location which might be a single object or list
        if isinstance(location_data, list) and location_data:
            # Find HQ or use first
            hq = next((loc for loc in location_data if loc.get("is_hq")), location_data[0])
            location_data = hq
        
        city = location_data.get("locality") or location_data.get("name")
        state = location_data.get("region")
        country = location_data.get("country")
        
        # Build display location
        location_parts = [p for p in [city, state, country] if p]
        display_location = ", ".join(location_parts) if location_parts else "Unknown"
        
        # Get employee count and determine size bucket
        employee_count = company.get("employee_count")
        size_bucket = None
        
        if employee_count:
            if employee_count <= 50:
                size_bucket = "small"
            elif employee_count <= 500:
                size_bucket = "mid"
            else:
                size_bucket = "large"
        
        # Get industry - might be string or list
        industry = company.get("industry")
        if isinstance(industry, list):
            industry = industry[0] if industry else None
        
        # Get website - clean it up
        website = company.get("website")
        if website and not website.startswith("http"):
            website = f"https://{website}"
        
        # Get LinkedIn URL
        linkedin_url = company.get("linkedin_url")
        if linkedin_url and not linkedin_url.startswith("http"):
            linkedin_url = f"https://{linkedin_url}"
        
        # Generate stable ID from domain or name
        identifier = company.get("website") or company.get("name", "unknown")
        firm_id = hashlib.md5(identifier.encode()).hexdigest()[:16]
        
        return {
            "id": firm_id,
            "name": company.get("name", "Unknown Company"),
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
            "founded": company.get("founded")
        }
    
    except Exception as e:
        print(f"Error transforming company: {e}")
        return None


# =============================================================================
# MAIN SEARCH FUNCTION - Combines parsing + PDL query
# =============================================================================

def search_firms(prompt: str, limit: int = 20) -> Dict[str, Any]:
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
            "fallbackApplied": bool  # True if search was broadened
        }
    """
    # Step 1: Parse the natural language prompt
    parse_result = parse_firm_search_prompt(prompt)
    
    if not parse_result["success"]:
        return {
            "success": False,
            "firms": [],
            "total": 0,
            "parsedFilters": parse_result.get("parsed"),
            "error": parse_result["error"],
            "fallbackApplied": False
        }
    
    parsed = parse_result["parsed"]
    
    # Step 2: Normalize location
    location = normalize_location(parsed.get("location", ""))
    
    # Step 3: Search PDL with original filters
    search_result = search_companies_with_pdl(
        industry=parsed["industry"],
        location=location,
        size=parsed.get("size", "none"),
        keywords=parsed.get("keywords", []),
        limit=limit
    )
    
    # Step 4: If we got fewer than 3 results, try broadening the search
    fallback_applied = False
    if search_result["success"] and len(search_result.get("firms", [])) < 3:
        print(f"⚠️ Only {len(search_result.get('firms', []))} firms found. Trying fallback (removing size filter)...")
        
        # Retry without size filter (most restrictive filter)
        fallback_result = search_companies_with_pdl(
            industry=parsed["industry"],
            location=location,
            size="none",  # Remove size constraint
            keywords=parsed.get("keywords", []),
            limit=limit
        )
        
        # If fallback found more results, use it
        if fallback_result["success"] and len(fallback_result.get("firms", [])) > len(search_result.get("firms", [])):
            print(f"✅ Fallback found {len(fallback_result.get('firms', []))} firms (removed size filter)")
            search_result = fallback_result
            fallback_applied = True
    
    # Add parsed filters to result
    search_result["parsedFilters"] = {
        "industry": parsed["industry"],
        "location": parsed["location"],
        "locationNormalized": location,
        "size": parsed.get("size", "none"),
        "keywords": parsed.get("keywords", [])
    }
    search_result["fallbackApplied"] = fallback_applied
    
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
    
    # Search PDL with original filters
    search_result = search_companies_with_pdl(
        industry=industry_lower,
        location=location_normalized,
        size=size,
        keywords=keywords,
        limit=limit
    )
    
    # If we got fewer than 3 results, try broadening the search
    fallback_applied = False
    if search_result["success"] and len(search_result.get("firms", [])) < 3 and size != "none":
        print(f"⚠️ Only {len(search_result.get('firms', []))} firms found. Trying fallback (removing size filter)...")
        
        # Retry without size filter
        fallback_result = search_companies_with_pdl(
            industry=industry_lower,
            location=location_normalized,
            size="none",
            keywords=keywords,
            limit=limit
        )
        
        # If fallback found more results, use it
        if fallback_result["success"] and len(fallback_result.get("firms", [])) > len(search_result.get("firms", [])):
            print(f"✅ Fallback found {len(fallback_result.get('firms', []))} firms (removed size filter)")
            search_result = fallback_result
            fallback_applied = True
    
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
