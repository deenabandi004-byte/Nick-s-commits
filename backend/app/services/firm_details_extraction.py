"""
Firm Details Extraction - Uses SERP API to get detailed information about specific firms
OPTIMIZED: Parallel processing, caching, timeout handling, enhanced data extraction
"""
import requests
import json
import hashlib
import time
import re
import logging
from typing import List, Dict, Any, Optional, Callable
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FutureTimeoutError
from functools import lru_cache
from threading import Lock
from app.config import SERPAPI_KEY
from app.services.openai_client import get_openai_client, get_anthropic_client

logger = logging.getLogger(__name__)


def _call_ai(system_prompt: str, user_prompt: str, max_tokens: int = 1000, label: str = "AI") -> Optional[str]:
    """Try Claude first, fall back to GPT. Returns the response text or None."""
    # Try Claude first
    anthropic_client = get_anthropic_client()
    if anthropic_client:
        try:
            response = anthropic_client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=max_tokens,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )
            logger.info("[%s] ✅ Claude succeeded", label)
            return response.content[0].text.strip()
        except Exception as e:
            logger.warning("[%s] ⚠️ Claude failed: %s - falling back to GPT", label, e)

    # Fall back to GPT
    client = get_openai_client()
    if not client:
        logger.warning("[%s] ⚠️ No AI client available", label)
        return None
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        temperature=0.1,
        max_tokens=max_tokens
    )
    logger.info("[%s] ✅ GPT succeeded", label)
    return response.choices[0].message.content.strip()


SERPAPI_BASE_URL = "https://serpapi.com/search"

# Create a session with connection pooling for better performance
# Note: requests.Session is thread-safe for concurrent requests, no lock needed
_serp_session = requests.Session()
# Lock removed - was causing serialization bottleneck (all requests queued sequentially)
# _serp_session_lock = Lock()

# In-memory cache for firm details (key: firm_name_hash, value: firm_data)
_firm_cache = {}
_cache_ttl = 3600  # 1 hour cache TTL


def _search_linkedin_url(firm_name: str, location: Dict[str, Optional[str]] = None, timeout: int = 5) -> Optional[str]:
    """
    Perform a specific search for LinkedIn company page.
    This is a fallback if LinkedIn isn't found in the main search.
    """
    # PRIMARY: Perplexity
    try:
        from app.services.perplexity_client import pro_search
        loc_hint = ""
        if location and location.get("locality"):
            loc_hint = f" in {location['locality']}"
        result = pro_search(f"{firm_name}{loc_hint} LinkedIn company page URL")
        if result.get("content"):
            content = result["content"]
            # Extract LinkedIn company URL from response
            import re as _re
            linkedin_match = _re.search(r'https?://(?:www\.)?linkedin\.com/company/[\w-]+', content)
            if linkedin_match:
                linkedin_url = linkedin_match.group(0)
                logger.info("Found LinkedIn URL via Perplexity for %s: %s", firm_name, linkedin_url)
                return linkedin_url
            # Also check citations
            for citation in result.get("citations", []):
                if "linkedin.com/company" in citation.lower():
                    if not citation.startswith("http"):
                        citation = f"https://{citation}"
                    logger.info("Found LinkedIn URL in Perplexity citations for %s: %s", firm_name, citation)
                    return citation
    except Exception:
        logger.warning("Perplexity failed for LinkedIn URL search (%s), falling back to SerpAPI", firm_name, exc_info=True)

    # DEPRECATED: remove in Phase 8 - existing SerpAPI code
    if not SERPAPI_KEY:
        return None

    # Build LinkedIn-specific search query
    query = f"{firm_name} LinkedIn company"
    if location and location.get("locality"):
        query += f" {location['locality']}"

    params = {
        "q": query,
        "api_key": SERPAPI_KEY,
        "engine": "google",
        "num": 5,  # Only need a few results for LinkedIn
        "hl": "en",
        "gl": "us"
    }

    try:
        # requests.Session is thread-safe for concurrent requests, no lock needed
        response = _serp_session.get(SERPAPI_BASE_URL, params=params, timeout=timeout)
        if response.status_code == 200:
            data = response.json()
            organic_results = data.get("organic_results", [])

            # Look for LinkedIn URL
            for result in organic_results:
                link = result.get('link', '').lower()
                if 'linkedin.com/company' in link:
                    linkedin_url = result.get('link', '')
                    if not linkedin_url.startswith('http'):
                        linkedin_url = f"https://{linkedin_url}"
                    print(f"✅ Found LinkedIn URL via dedicated search: {linkedin_url}")
                    return linkedin_url
    except Exception as e:
        print(f"⚠️ LinkedIn search failed for {firm_name}: {e}")

    return None


def _get_cache_key(firm_name: str, location: Dict[str, Optional[str]] = None) -> str:
    """Generate cache key for firm search."""
    key_parts = [firm_name.lower().strip()]
    if location:
        if location.get("locality"):
            key_parts.append(location["locality"].lower())
        if location.get("region"):
            key_parts.append(location["region"].lower())
    key_str = "|".join(key_parts)
    return hashlib.md5(key_str.encode()).hexdigest()


def _get_cached_firm(cache_key: str) -> Optional[Dict[str, Any]]:
    """Get firm from cache if not expired."""
    if cache_key in _firm_cache:
        cached_data, timestamp = _firm_cache[cache_key]
        if time.time() - timestamp < _cache_ttl:
            return cached_data
        else:
            # Expired, remove from cache
            del _firm_cache[cache_key]
    return None


def _set_cached_firm(cache_key: str, firm_data: Dict[str, Any]):
    """Cache firm data with timestamp."""
    _firm_cache[cache_key] = (firm_data, time.time())


def _fetch_serp_results_only(
    firm_name: str,
    location: Dict[str, Optional[str]] = None,
    timeout: int = 6,
    search_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Fetch SERP API results only (no ChatGPT extraction).
    Returns raw SERP data for batch processing.
    """
    start_time = time.time()

    # PRIMARY: Perplexity
    try:
        from app.services.perplexity_client import pro_search
        loc_parts = []
        if location:
            if location.get("locality"):
                loc_parts.append(location["locality"])
            if location.get("region"):
                loc_parts.append(location["region"])
        loc_hint = " ".join(loc_parts)
        query = f"{firm_name} company {loc_hint}".strip()
        result = pro_search(query)
        if result.get("content"):
            duration = time.time() - start_time
            logger.info("perplexity_single_fetch succeeded for %s in %.2fs", firm_name, duration)
            return {
                "firm_name": firm_name,
                "location": location,
                "knowledge_graph": None,
                "organic_results": [],
                "_perplexity_content": result["content"],
                "_perplexity_citations": result.get("citations", []),
            }
    except Exception:
        logger.warning("Perplexity failed for _fetch_serp_results_only (%s), falling back to SerpAPI", firm_name, exc_info=True)

    # DEPRECATED: remove in Phase 8 - existing SerpAPI code
    if not SERPAPI_KEY:
        return None

    query = f"{firm_name} company"
    if location:
        if location.get("locality"):
            query += f" {location['locality']}"
        if location.get("region"):
            query += f" {location['region']}"

    params = {
        "q": query,
        "api_key": SERPAPI_KEY,
        "engine": "google",
        "num": 20,
        "hl": "en",
        "gl": "us"
    }

    try:
        # requests.Session is thread-safe for concurrent requests, no lock needed
        response = _serp_session.get(SERPAPI_BASE_URL, params=params, timeout=timeout)

        duration = time.time() - start_time

        if response.status_code != 200:
            logger.debug("serp_single_fetch", extra={
                "search_id": search_id,
                "firm": firm_name,
                "duration_seconds": round(duration, 2),
                "success": False,
                "status_code": response.status_code
            })
            return None

        data = response.json()
        result = {
            "firm_name": firm_name,
            "location": location,
            "knowledge_graph": data.get("knowledge_graph"),
            "organic_results": data.get("organic_results", [])
        }

        logger.debug("serp_single_fetch", extra={
            "search_id": search_id,
            "firm": firm_name,
            "duration_seconds": round(duration, 2),
            "success": True,
            "has_knowledge_graph": bool(data.get("knowledge_graph")),
            "organic_results_count": len(data.get("organic_results", []))
        })

        return result
    except requests.exceptions.Timeout:
        duration = time.time() - start_time
        logger.warning("serp_single_fetch_failed", extra={
            "search_id": search_id,
            "firm": firm_name,
            "duration_seconds": round(duration, 2),
            "error": "timeout",
            "timeout_seconds": timeout
        })
        return None
    except Exception as e:
        duration = time.time() - start_time
        logger.warning("serp_single_fetch_failed", extra={
            "search_id": search_id,
            "firm": firm_name,
            "duration_seconds": round(duration, 2),
            "error": str(e)
        })
        return None


def _extract_single_batch(
    batch: List[Dict[str, Any]],
    batch_idx: int,
    location: Dict[str, Optional[str]],
    search_id: Optional[str]
) -> tuple:
    """
    Extract a single batch and return (firms, duration).
    
    Args:
        batch: List of SERP data for firms in this batch
        batch_idx: Index of this batch (0-based)
        location: Location dict for context
        search_id: Search ID for logging
        
    Returns:
        Tuple of (extracted_firms_list, duration_seconds)
    """
    start = time.time()
    
    try:
        # Call existing extraction function
        firms = _extract_firms_batch_with_chatgpt(batch, location)
        duration = time.time() - start
        
        logger.debug("chatgpt_batch_complete", extra={
            "search_id": search_id,
            "batch": batch_idx + 1,
            "firms_in_batch": len(batch),
            "firms_extracted": len(firms),
            "duration_seconds": round(duration, 2)
        })
        
        return firms, duration
        
    except Exception as e:
        duration = time.time() - start
        logger.error("chatgpt_batch_error", extra={
            "search_id": search_id,
            "batch": batch_idx + 1,
            "error": str(e),
            "duration_seconds": round(duration, 2)
        })
        return [], duration


def _extract_all_firms_parallel(
    serp_results: List[Dict[str, Any]],
    location: Dict[str, Optional[str]] = None,
    search_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Extract firm details from SERP results using parallel ChatGPT batches.
    
    Args:
        serp_results: List of SERP data dictionaries
        location: Location dict for context
        search_id: Search ID for logging correlation
        
    Returns:
        List of extracted firm dictionaries
    """
    if not serp_results:
        return []
    
    BATCH_SIZE = 8  # Extract 8 firms per ChatGPT call
    MAX_PARALLEL_BATCHES = 3  # Limit concurrent ChatGPT calls to avoid rate limits
    
    # Split into batches
    batches = []
    for i in range(0, len(serp_results), BATCH_SIZE):
        batches.append(serp_results[i:i + BATCH_SIZE])
    
    logger.info("chatgpt_parallel_extraction_started", extra={
        "search_id": search_id,
        "total_firms": len(serp_results),
        "batch_count": len(batches),
        "batch_size": BATCH_SIZE,
        "max_parallel": MAX_PARALLEL_BATCHES
    })
    
    extracted_firms = []
    batch_times = []
    
    start_time = time.time()
    
    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_BATCHES) as executor:
        # Submit all batches with small stagger to avoid rate limits
        future_to_batch = {}
        for batch_idx, batch in enumerate(batches):
            # Small stagger to avoid hitting rate limits all at once
            if batch_idx > 0:
                time.sleep(0.5)  # 500ms between submissions
            
            future = executor.submit(
                _extract_single_batch,
                batch,
                batch_idx,
                location,
                search_id
            )
            future_to_batch[future] = batch_idx
        
        # Collect results as they complete
        for future in as_completed(future_to_batch):
            batch_idx = future_to_batch[future]
            try:
                firms, duration = future.result()
                extracted_firms.extend(firms)
                batch_times.append({
                    "batch": batch_idx + 1,
                    "seconds": round(duration, 2),
                    "firms": len(firms)
                })
            except Exception as e:
                logger.error("chatgpt_batch_failed", extra={
                    "search_id": search_id,
                    "batch": batch_idx + 1,
                    "error": str(e)
                })
    
    total_duration = time.time() - start_time
    
    # Sort batch_times for consistent logging
    batch_times.sort(key=lambda x: x["batch"])
    
    slowest_batch = max(batch_times, key=lambda x: x["seconds"])["seconds"] if batch_times else 0
    
    logger.info("chatgpt_parallel_extraction_complete", extra={
        "search_id": search_id,
        "total_duration_seconds": round(total_duration, 2),
        "firms_extracted": len(extracted_firms),
        "batch_times": batch_times,
        "slowest_batch_seconds": round(slowest_batch, 2)
    })
    
    return extracted_firms


def _extract_firms_batch_with_chatgpt(
    serp_data_list: List[Dict[str, Any]],
    location: Dict[str, Optional[str]] = None
) -> List[Dict[str, Any]]:
    """
    Extract multiple firms from SERP results in a single ChatGPT call.
    This is much faster than individual extractions.
    """
    if not serp_data_list:
        return []
    
    # Prepare batch context
    location_str = ""
    if location:
        location_parts = [v for v in [
            location.get("locality"),
            location.get("region"),
            location.get("country")
        ] if v]
        location_str = ", ".join(location_parts)
    
    # Build context for all firms
    firms_context = []
    for serp_data in serp_data_list:
        firm_name = serp_data["firm_name"]
        knowledge_graph = serp_data.get("knowledge_graph")
        organic_results = serp_data.get("organic_results", [])
        
        firm_context = f"\n=== FIRM: {firm_name} ===\n"
        
        if knowledge_graph:
            kg_display = {
                "title": knowledge_graph.get("title"),
                "name": knowledge_graph.get("name"),
                "website": knowledge_graph.get("website") or knowledge_graph.get("official_website"),
                "description": knowledge_graph.get("description") or knowledge_graph.get("about"),
                "employees": knowledge_graph.get("employees") or knowledge_graph.get("number_of_employees"),
                "headquarters": knowledge_graph.get("headquarters"),
                "industry": knowledge_graph.get("industry") or knowledge_graph.get("sector"),
                "founded": knowledge_graph.get("founded")
            }
            firm_context += f"Knowledge Graph:\n{json.dumps(kg_display, indent=2)}\n"
        
        # Add top organic results
        for i, result in enumerate(organic_results[:5], 1):
            firm_context += f"Result {i}:\n  Title: {result.get('title', '')}\n  Link: {result.get('link', '')}\n  Snippet: {result.get('snippet', '')}\n"
        
        firms_context.append(firm_context)
    
    combined_context = "\n".join(firms_context)
    
    system_prompt = """You are an expert at extracting company information from Google search results.
Extract information for MULTIPLE companies in one response.
Return a JSON array with one object per company.
Prioritize Knowledge Graph data - it's the most reliable source."""

    user_prompt = f"""Requested Location: {location_str if location_str else 'Not specified'}

Search Results for {len(serp_data_list)} companies (in order):
{combined_context}

Extract comprehensive information for each company. Return a JSON array with one object per company.
IMPORTANT: Return companies in the SAME ORDER as listed above (FIRM 1, FIRM 2, etc.).

For each company, extract:
- name: Official company name
- website: Official website URL
- linkedinUrl: LinkedIn company page URL (format: https://linkedin.com/company/company-name)
- location: {{"city": string or null, "state": string or null, "country": string or null}}
- industry: Primary industry/sector
- employeeCount: Number of employees (integer or null)
- sizeBucket: "small" (1-50), "mid" (51-500), "large" (500+), or null
- founded: Year founded (4-digit integer or null)

Return ONLY a JSON array (no markdown, no explanations):
[
  {{
    "name": "Company 1",
    "website": "...",
    "linkedinUrl": "...",
    "location": {{"city": "...", "state": "...", "country": "..."}},
    "industry": "...",
    "employeeCount": 10000,
    "sizeBucket": "large",
    "founded": 2010
  }},
  ...
]"""

    try:
        result_text = _call_ai(system_prompt, user_prompt, max_tokens=2000, label="FIRM-BATCH")
        if not result_text:
            return []

        # Clean up response
        if result_text.startswith("```"):
            result_text = result_text.split("```")[1]
            if result_text.startswith("json"):
                result_text = result_text[4:]
        result_text = result_text.strip()
        
        try:
            companies_data = json.loads(result_text)
            if not isinstance(companies_data, list):
                companies_data = [companies_data]
            
            # Match extracted companies back to firm names
            # ChatGPT should return companies in the same order as requested
            extracted_firms = []
            used_indices = set()
            
            for i, serp_data in enumerate(serp_data_list):
                firm_name = serp_data["firm_name"]
                knowledge_graph = serp_data.get("knowledge_graph")
                
                # Try to find matching company data
                company_data = None
                
                # First, try exact order match (ChatGPT usually follows order)
                if i < len(companies_data) and i not in used_indices:
                    candidate = companies_data[i]
                    # Verify it's a reasonable match
                    if candidate.get("name") and (
                        firm_name.lower() in candidate.get("name", "").lower() or
                        candidate.get("name", "").lower() in firm_name.lower()
                    ):
                        company_data = candidate
                        used_indices.add(i)
                
                # If no order match, try name similarity
                if not company_data:
                    for j, cd in enumerate(companies_data):
                        if j in used_indices:
                            continue
                        if cd.get("name") and (
                            firm_name.lower() in cd.get("name", "").lower() or
                            cd.get("name", "").lower() in firm_name.lower()
                        ):
                            company_data = cd
                            used_indices.add(j)
                            break
                
                # If still no match, use first unused company
                if not company_data and companies_data:
                    for j, cd in enumerate(companies_data):
                        if j not in used_indices:
                            company_data = cd
                            used_indices.add(j)
                            break
                
                if not company_data:
                    # Fallback: create minimal data from Knowledge Graph
                    if knowledge_graph:
                        kg_name = knowledge_graph.get("title") or knowledge_graph.get("name") or firm_name
                        company_data = {"name": kg_name}
                    else:
                        company_data = {"name": firm_name}
                
                # Enhance with Knowledge Graph data
                if knowledge_graph:
                    kg_website = knowledge_graph.get("website") or knowledge_graph.get("official_website")
                    if kg_website:
                        company_data["website"] = kg_website
                    
                    kg_employees = knowledge_graph.get("employees") or knowledge_graph.get("number_of_employees")
                    if kg_employees:
                        if isinstance(kg_employees, (int, float)):
                            company_data["employeeCount"] = int(kg_employees)
                        elif isinstance(kg_employees, str):
                            numbers = re.findall(r'[\d,]+', kg_employees.replace(',', ''))
                            if numbers:
                                try:
                                    company_data["employeeCount"] = int(numbers[0].replace(',', ''))
                                except:
                                    pass
                    
                    kg_founded = knowledge_graph.get("founded")
                    if kg_founded:
                        company_data["founded"] = kg_founded
                    
                    kg_industry = knowledge_graph.get("industry") or knowledge_graph.get("sector")
                    if kg_industry:
                        company_data["industry"] = kg_industry
                
                # Extract LinkedIn URL from organic results
                organic_results = serp_data.get("organic_results", [])
                for result in organic_results:
                    link = result.get('link', '').lower()
                    if 'linkedin.com/company' in link:
                        company_data["linkedinUrl"] = result.get('link', '')
                        if not company_data["linkedinUrl"].startswith('http'):
                            company_data["linkedinUrl"] = f"https://{company_data['linkedinUrl']}"
                        break
                
                # Calculate sizeBucket
                if not company_data.get("sizeBucket") and company_data.get("employeeCount"):
                    emp = company_data["employeeCount"]
                    if emp <= 50:
                        company_data["sizeBucket"] = "small"
                    elif emp <= 500:
                        company_data["sizeBucket"] = "mid"
                    else:
                        company_data["sizeBucket"] = "large"
                
                # Normalize location
                if not isinstance(company_data.get("location"), dict):
                    company_data["location"] = {}
                
                # Normalize URLs
                if company_data.get("website") and not company_data["website"].startswith("http"):
                    company_data["website"] = f"https://{company_data['website']}"
                
                extracted_firms.append(company_data)
            
            return extracted_firms
            
        except json.JSONDecodeError as e:
            print(f"⚠️ Failed to parse batch extraction JSON: {e}")
            return []
            
    except Exception as e:
        print(f"❌ Error in batch extraction: {e}")
        return []


def search_firm_details_with_serp(
    firm_name: str,
    location: Dict[str, Optional[str]] = None,
    timeout: int = 6
) -> Optional[Dict[str, Any]]:
    """
    Search for a specific firm using SERP API and extract its details.
    OPTIMIZED: Includes caching and timeout handling.

    Args:
        firm_name: Name of the firm to search for
        location: Optional location dict to help narrow results
        timeout: Request timeout in seconds (default: 6)

    Returns:
        Dictionary with firm details or None if not found
    """
    # Check cache first
    cache_key = _get_cache_key(firm_name, location)
    cached_result = _get_cached_firm(cache_key)
    if cached_result:
        print(f"✅ Cache hit for {firm_name}")
        return cached_result

    # PRIMARY: Firecrawl (extract_company_profile) then Perplexity (pro_search)
    try:
        from app.services.perplexity_client import pro_search as _pro_search
        loc_parts = []
        if location:
            if location.get("locality"):
                loc_parts.append(location["locality"])
            if location.get("region"):
                loc_parts.append(location["region"])
        loc_hint = ", ".join(loc_parts) if loc_parts else ""

        # Step 1 - ask Perplexity for a company website so we can Firecrawl it
        website_url_for_firecrawl = None
        perplexity_result = _pro_search(
            f"{firm_name} company {loc_hint} official website LinkedIn employee count headquarters founded".strip()
        )
        perplexity_content = perplexity_result.get("content", "")

        if perplexity_content:
            # Try to extract a website URL from Perplexity response
            import re as _re
            url_match = _re.search(
                r'https?://(?:www\.)?(?!linkedin\.com)[\w.-]+\.(?:com|org|io|co|net)(?:/[\w./-]*)?',
                perplexity_content
            )
            if url_match:
                website_url_for_firecrawl = url_match.group(0)

        # Step 2 - try Firecrawl on the website if we found one
        firecrawl_data = {}
        if website_url_for_firecrawl:
            try:
                from app.services.firecrawl_client import extract_company_profile
                firecrawl_data = extract_company_profile(website_url_for_firecrawl) or {}
                if firecrawl_data:
                    logger.info("Firecrawl extract_company_profile succeeded for %s (%s)", firm_name, website_url_for_firecrawl)
            except Exception:
                logger.warning("Firecrawl failed for %s, continuing with Perplexity data", firm_name, exc_info=True)

        # Step 3 - build result from combined Perplexity + Firecrawl data
        if perplexity_content or firecrawl_data:
            # Extract LinkedIn URL from Perplexity content or citations
            import re as _re
            linkedin_url = None
            linkedin_match = _re.search(r'https?://(?:www\.)?linkedin\.com/company/[\w-]+', perplexity_content)
            if linkedin_match:
                linkedin_url = linkedin_match.group(0)
            else:
                for citation in perplexity_result.get("citations", []):
                    if "linkedin.com/company" in citation.lower():
                        linkedin_url = citation if citation.startswith("http") else f"https://{citation}"
                        break

            # Use AI to parse Perplexity prose into structured JSON
            combined_context = f"Perplexity research:\n{perplexity_content}"
            if firecrawl_data:
                combined_context += f"\n\nFirecrawl company profile:\n{json.dumps(firecrawl_data, indent=2)}"

            system_prompt = (
                "You are an expert at extracting company information. "
                "Return ONLY valid JSON, no markdown, no explanations."
            )
            user_prompt = f"""Company Name: {firm_name}
Requested Location: {loc_hint or 'Not specified'}

Research Data:
{combined_context}

Extract:
- name: Official company name
- website: Official website URL
- linkedinUrl: LinkedIn company page URL (format: https://linkedin.com/company/slug)
- location: {{"city": str|null, "state": str|null, "country": str|null}}
- industry: Primary industry
- employeeCount: integer or null
- sizeBucket: "small" (1-50), "mid" (51-500), "large" (500+), or null
- founded: 4-digit year or null

Return ONLY JSON:
{{"name":"...","website":"...","linkedinUrl":"...","location":{{"city":"...","state":"...","country":"..."}},"industry":"...","employeeCount":null,"sizeBucket":null,"founded":null}}"""

            result_text = _call_ai(system_prompt, user_prompt, max_tokens=800, label="FIRM-DETAIL-PERPLEXITY")
            if result_text:
                # Clean up response
                if result_text.startswith("```"):
                    result_text = result_text.split("```")[1]
                    if result_text.startswith("json"):
                        result_text = result_text[4:]
                result_text = result_text.strip()
                try:
                    company_data = json.loads(result_text)
                    if company_data.get("name"):
                        # Override linkedinUrl if we found one directly
                        if linkedin_url and not company_data.get("linkedinUrl"):
                            company_data["linkedinUrl"] = linkedin_url
                        if website_url_for_firecrawl and not company_data.get("website"):
                            company_data["website"] = website_url_for_firecrawl
                        # Merge Firecrawl data for any missing fields
                        if firecrawl_data:
                            if not company_data.get("employeeCount") and firecrawl_data.get("employee_count"):
                                company_data["employeeCount"] = firecrawl_data["employee_count"]
                            if not company_data.get("founded") and firecrawl_data.get("founded"):
                                company_data["founded"] = firecrawl_data["founded"]
                            if not company_data.get("industry") and firecrawl_data.get("industries"):
                                industries = firecrawl_data["industries"]
                                if isinstance(industries, list) and industries:
                                    company_data["industry"] = industries[0]
                        # Calculate sizeBucket if missing
                        if not company_data.get("sizeBucket") and company_data.get("employeeCount"):
                            emp = company_data["employeeCount"]
                            if isinstance(emp, (int, float)):
                                if emp <= 50:
                                    company_data["sizeBucket"] = "small"
                                elif emp <= 500:
                                    company_data["sizeBucket"] = "mid"
                                else:
                                    company_data["sizeBucket"] = "large"
                        # Ensure location is a dict
                        if not isinstance(company_data.get("location"), dict):
                            company_data["location"] = {}
                        # Cache and return
                        _set_cached_firm(cache_key, company_data)
                        logger.info("Perplexity+Firecrawl firm detail extraction succeeded for %s", firm_name)
                        return company_data
                except json.JSONDecodeError:
                    logger.warning("Failed to parse Perplexity+Firecrawl AI result for %s", firm_name)
    except Exception:
        logger.warning("Perplexity/Firecrawl failed for search_firm_details_with_serp (%s), falling back to SerpAPI", firm_name, exc_info=True)

    # DEPRECATED: remove in Phase 8 - existing SerpAPI code
    if not SERPAPI_KEY:
        return None

    # Build search query - search for the firm name with LinkedIn hint
    # For better results, include "LinkedIn" in the query to prioritize LinkedIn pages
    query = f"{firm_name} company"
    if location:
        if location.get("locality"):
            query += f" {location['locality']}"
        if location.get("region"):
            query += f" {location['region']}"

    params = {
        "q": query,
        "api_key": SERPAPI_KEY,
        "engine": "google",
        "num": 20,  # Get more results to find LinkedIn and other info
        "hl": "en",
        "gl": "us"
    }

    try:
        # requests.Session is thread-safe for concurrent requests, no lock needed
        response = _serp_session.get(SERPAPI_BASE_URL, params=params, timeout=timeout)
        
        if response.status_code != 200:
            print(f"⚠️ SERP API error for {firm_name}: {response.status_code}")
            return None
        
        data = response.json()
        
        # Extract information from knowledge graph (most reliable)
        knowledge_graph = data.get("knowledge_graph")
        organic_results = data.get("organic_results", [])
        
        # Extract structured data from knowledge graph first (most reliable)
        kg_data = {}
        if knowledge_graph:
            kg_data = {
                "name": knowledge_graph.get("title") or knowledge_graph.get("name"),
                "website": knowledge_graph.get("website") or knowledge_graph.get("official_website"),
                "description": knowledge_graph.get("description") or knowledge_graph.get("about"),
                "type": knowledge_graph.get("type"),
                "founded": knowledge_graph.get("founded"),
                "employees": knowledge_graph.get("employees") or knowledge_graph.get("number_of_employees"),
                "headquarters": knowledge_graph.get("headquarters"),
                "industry": knowledge_graph.get("industry") or knowledge_graph.get("sector"),
            }
            
            # Extract location from headquarters if available
            if kg_data.get("headquarters"):
                hq = kg_data["headquarters"]
                if isinstance(hq, str):
                    # Try to parse location string
                    kg_data["location_str"] = hq
                elif isinstance(hq, dict):
                    kg_data["location"] = {
                        "city": hq.get("city") or hq.get("locality"),
                        "state": hq.get("state") or hq.get("region"),
                        "country": hq.get("country")
                    }
        
        # Look for LinkedIn URL specifically in organic results
        linkedin_url = None
        website_url = kg_data.get("website")
        
        # First pass: Look for LinkedIn and website in organic results
        for result in organic_results:
            link = result.get('link', '').lower()
            title = result.get('title', '').lower()
            
            # Check for LinkedIn (prioritize company pages)
            if 'linkedin.com/company' in link:
                linkedin_url = result.get('link', '')
                if not linkedin_url.startswith('http'):
                    linkedin_url = f"https://{linkedin_url}"
                print(f"✅ Found LinkedIn URL in organic results: {linkedin_url}")
                break
            elif 'linkedin.com' in link and not linkedin_url:
                # Fallback to any LinkedIn URL
                linkedin_url = result.get('link', '')
                if not linkedin_url.startswith('http'):
                    linkedin_url = f"https://{linkedin_url}"
        
        # Normalize website URL
        if website_url and not website_url.startswith('http'):
            website_url = f"https://{website_url}"
        
        # If no LinkedIn found, try a specific LinkedIn search
        if not linkedin_url:
            linkedin_url = _search_linkedin_url(firm_name, location, timeout=5)
        
        # Use AI to extract structured data from SERP results
        
        # Prepare enhanced context for ChatGPT
        context_parts = []
        
        if knowledge_graph:
            # Include full knowledge graph data with extracted fields highlighted
            kg_display = {
                "title": knowledge_graph.get("title"),
                "name": knowledge_graph.get("name"),
                "website": knowledge_graph.get("website") or knowledge_graph.get("official_website"),
                "description": knowledge_graph.get("description") or knowledge_graph.get("about"),
                "type": knowledge_graph.get("type"),
                "founded": knowledge_graph.get("founded"),
                "employees": knowledge_graph.get("employees") or knowledge_graph.get("number_of_employees"),
                "headquarters": knowledge_graph.get("headquarters"),
                "industry": knowledge_graph.get("industry"),
                "sector": knowledge_graph.get("sector"),
                "full_data": knowledge_graph  # Include full data for comprehensive extraction
            }
            context_parts.append(f"Knowledge Graph (MOST RELIABLE - use this data first):\n{json.dumps(kg_display, indent=2)}")
        
        # Add more organic results (up to 10) to find more information
        for i, result in enumerate(organic_results[:10], 1):
            link = result.get('link', '')
            # Highlight LinkedIn and company website results
            is_linkedin = 'linkedin.com' in link.lower()
            is_company_site = any(domain in link.lower() for domain in ['.com', '.org', '.io']) and not any(skip in link.lower() for skip in ['wikipedia', 'crunchbase', 'glassdoor'])
            
            highlight = ""
            if is_linkedin:
                highlight = " [LINKEDIN PAGE]"
            elif is_company_site and firm_name.lower().replace(' ', '') in link.lower().replace('www.', '').replace('https://', '').replace('http://', '').split('.')[0]:
                highlight = " [COMPANY WEBSITE]"
            
            context_parts.append(f"""
Result {i}{highlight}:
  Title: {result.get('title', '')}
  Link: {link}
  Snippet: {result.get('snippet', '')}
""")
        
        context = "\n".join(context_parts)
        
        # Enhanced prompt - more thorough extraction with location validation
        location_str = ""
        if location:
            location_parts = [v for v in [
                location.get("locality"),
                location.get("region"),
                location.get("country")
            ] if v]
            location_str = ", ".join(location_parts)
        
        system_prompt = """You are an expert at extracting company information from Google search results. 
For well-known companies, you should be able to find comprehensive information including LinkedIn URLs, employee counts, and locations.
Pay special attention to:
- LinkedIn company pages (linkedin.com/company/...)
- Official company websites
- Knowledge Graph data (most reliable)
- Company size information from snippets
- Location validation (CRITICAL: verify company is in the requested location)
Return ONLY valid JSON, no markdown, no explanations."""

        user_prompt = f"""Company Name: {firm_name}
Requested Location: {location_str if location_str else 'Not specified'}

Search Results:
{context}

Extract comprehensive company information. PRIORITIZE Knowledge Graph data - it's the most reliable source.

CRITICAL LOCATION REQUIREMENT:
- The company MUST be located in: {location_str if location_str else 'any location'}
- Extract the EXACT location (city, state, country) from Knowledge Graph headquarters or search results
- If the company's location does not match the requested location, you should still extract the data but note the mismatch

Required fields:
- name: Official company name (exact match to "{firm_name}" or from Knowledge Graph)
- website: Official company website URL (from Knowledge Graph website field, or company domain in results)
- linkedinUrl: LinkedIn company page URL (look for "linkedin.com/company/" URLs in results, format: https://linkedin.com/company/company-name)
- location: {{"city": string or null, "state": string or null, "country": string or null}} 
  * Extract from Knowledge Graph headquarters field first (MOST RELIABLE)
  * Then from result snippets or location mentions
  * Be precise: extract the actual headquarters location, not just any office location
- industry: Primary industry/sector (from Knowledge Graph industry/sector, or infer from description)
  * Be specific: "Investment Banking", "Management Consulting", "Venture Capital", etc.
- employeeCount: Number of employees (integer or null)
  * Look in Knowledge Graph "employees" or "number_of_employees" field
  * Or extract from snippets like "10,000 employees", "50,000+ employees"
  * For large companies, this should be available
- sizeBucket: "small" (1-50), "mid" (51-500), "large" (500+), or null
  * Calculate from employeeCount if available
- founded: Year founded (4-digit integer or null)
  * From Knowledge Graph "founded" field, or extract from snippets

EXTRACTION RULES:
1. ALWAYS check Knowledge Graph first - it has the most accurate data
2. For LinkedIn: Look for "linkedin.com/company/" URLs in organic results
3. For employee count: Knowledge Graph > snippets with numbers > size descriptions
4. For location: Knowledge Graph headquarters > location mentions in snippets
5. For well-known companies (Fortune 500, major brands), most fields should be found
6. Use null (not empty string) if information is truly not available
7. LOCATION ACCURACY: Extract the actual headquarters location, not branch offices

Return ONLY a JSON object (no markdown, no explanations):
{{
  "name": "...",
  "website": "...",
  "linkedinUrl": "...",
  "location": {{"city": "...", "state": "...", "country": "..."}},
  "industry": "...",
  "employeeCount": 10000,
  "sizeBucket": "large",
  "founded": 2010
}}"""

        result_text = _call_ai(system_prompt, user_prompt, max_tokens=800, label="FIRM-DETAIL")
        if not result_text:
            return None

        # Clean up response
        if result_text.startswith("```"):
            result_text = result_text.split("```")[1]
            if result_text.startswith("json"):
                result_text = result_text[4:]
        result_text = result_text.strip()
        
        try:
            company_data = json.loads(result_text)
            
            # Validate required fields
            if not company_data.get("name"):
                return None
            
            # Normalize data - use pre-found URLs and Knowledge Graph data if available
            # Prioritize: Knowledge Graph > ChatGPT extraction > Pre-found URLs
            
            # Get employee count - try multiple sources
            employee_count = None
            if kg_data.get("employees"):
                # Knowledge Graph employees might be a string like "10,000" or number
                emp_val = kg_data["employees"]
                if isinstance(emp_val, (int, float)):
                    employee_count = int(emp_val)
                elif isinstance(emp_val, str):
                    # Extract number from string like "10,000 employees" or "50,000+"
                    numbers = re.findall(r'[\d,]+', emp_val.replace(',', ''))
                    if numbers:
                        try:
                            employee_count = int(numbers[0].replace(',', ''))
                        except:
                            pass
            
            # Fallback to ChatGPT extraction
            if not employee_count:
                employee_count = company_data.get("employeeCount") or company_data.get("employees")
                if isinstance(employee_count, str):
                    # Try to extract number from string
                    numbers = re.findall(r'[\d,]+', employee_count.replace(',', ''))
                    if numbers:
                        try:
                            employee_count = int(numbers[0].replace(',', ''))
                        except:
                            employee_count = None
            
            # Get founded year
            founded_year = kg_data.get("founded") or company_data.get("founded") or company_data.get("foundedYear")
            if isinstance(founded_year, str):
                # Extract 4-digit year
                years = re.findall(r'\b(19|20)\d{2}\b', founded_year)
                if years:
                    try:
                        founded_year = int(years[0])
                    except:
                        founded_year = None
            
            # Get location - prioritize Knowledge Graph
            location_data = company_data.get("location") or {}
            if kg_data.get("location"):
                # Use Knowledge Graph location if available
                location_data = kg_data["location"]
            elif kg_data.get("location_str"):
                # Try to parse location string from Knowledge Graph
                loc_str = kg_data["location_str"]
                # Simple parsing - could be improved
                parts = [p.strip() for p in loc_str.split(',')]
                if len(parts) >= 3:
                    location_data = {"city": parts[0], "state": parts[1], "country": parts[2]}
                elif len(parts) == 2:
                    location_data = {"city": parts[0], "state": parts[1], "country": None}
                elif len(parts) == 1:
                    location_data = {"city": parts[0], "state": None, "country": None}
            
            validated_company = {
                "name": kg_data.get("name") or company_data.get("name", "").strip() or firm_name,
                "website": website_url or company_data.get("website") or company_data.get("websiteUrl") or None,
                "linkedinUrl": linkedin_url or company_data.get("linkedinUrl") or company_data.get("linkedin") or None,
                "location": location_data if isinstance(location_data, dict) else {},
                "industry": kg_data.get("industry") or company_data.get("industry") or company_data.get("sector") or None,
                "employeeCount": employee_count,
                "sizeBucket": company_data.get("sizeBucket") or company_data.get("size") or None,
                "founded": founded_year
            }
            
            # Calculate sizeBucket from employeeCount if not provided
            if not validated_company["sizeBucket"] and validated_company["employeeCount"]:
                emp = validated_company["employeeCount"]
                if emp <= 50:
                    validated_company["sizeBucket"] = "small"
                elif emp <= 500:
                    validated_company["sizeBucket"] = "mid"
                else:
                    validated_company["sizeBucket"] = "large"
            
            # Clean up URLs
            if validated_company["website"]:
                website = validated_company["website"].strip()
                if website and not website.startswith("http"):
                    validated_company["website"] = f"https://{website}"
                else:
                    validated_company["website"] = website
            
            if validated_company["linkedinUrl"]:
                linkedin = validated_company["linkedinUrl"].strip()
                if linkedin and not linkedin.startswith("http"):
                    validated_company["linkedinUrl"] = f"https://{linkedin}"
                else:
                    validated_company["linkedinUrl"] = linkedin
            
            # Ensure location is a dict
            if not isinstance(validated_company["location"], dict):
                validated_company["location"] = {}
            
            # Cache the result
            _set_cached_firm(cache_key, validated_company)
            
            return validated_company
            
        except json.JSONDecodeError as e:
            print(f"⚠️ Failed to parse company data for {firm_name}: {e}")
            return None
        
    except requests.exceptions.Timeout:
        print(f"⏰ Timeout searching firm details for {firm_name}")
        return None
    except requests.exceptions.RequestException as e:
        print(f"🌐 Request error for {firm_name}: {e}")
        return None
    except Exception as e:
        print(f"❌ Error searching firm details for {firm_name}: {e}")
        return None


def get_firm_details_batch(
    firm_names: List[str], 
    location: Dict[str, Optional[str]] = None,
    max_workers: int = 5,
    progress_callback: Optional[Callable[[int, int], None]] = None,
    max_results: Optional[int] = None,
    search_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Get details for multiple firms in batch using parallel processing.
    OPTIMIZED: Batch ChatGPT extraction for 5-10x speedup.
    
    Args:
        firm_names: List of firm names to search for
        location: Optional location to help narrow results
        max_workers: Maximum number of parallel workers (default: 5)
        progress_callback: Optional callback function(current, total) for progress updates
        max_results: Optional maximum number of results to return (enforces strict limit)
        search_id: Optional search ID for logging correlation
    
    Returns:
        List of firm detail dictionaries (limited to max_results if provided)
    """
    total_start = time.time()
    
    logger.info("serp_fetch_started", extra={
        "search_id": search_id,
        "firm_count": len(firm_names),
        "firms": firm_names[:5]  # Log first 5 to avoid huge logs
    })
    
    # Deduplicate firm names (case-insensitive)
    seen_names = set()
    unique_names = []
    for name in firm_names:
        name_lower = name.lower().strip()
        if name_lower and name_lower not in seen_names:
            seen_names.add(name_lower)
            unique_names.append(name)
    
    if len(unique_names) < len(firm_names):
        logger.debug("serp_fetch_deduplicated", extra={
            "search_id": search_id,
            "original_count": len(firm_names),
            "unique_count": len(unique_names)
        })
    
    # Apply max_results limit if provided
    if max_results is not None and len(unique_names) > max_results:
        unique_names = unique_names[:max_results]
        logger.debug("serp_fetch_limited", extra={
            "search_id": search_id,
            "limited_to": max_results
        })
    
    # Check cache first for all firms
    cached_firms = []
    uncached_names = []
    for name in unique_names:
        cache_key = _get_cache_key(name, location)
        cached_result = _get_cached_firm(cache_key)
        if cached_result:
            cached_firms.append(cached_result)
        else:
            uncached_names.append(name)
    
    if cached_firms:
        logger.debug("serp_fetch_cache_hits", extra={
            "search_id": search_id,
            "cached_count": len(cached_firms),
            "total_count": len(unique_names)
        })
    
    if not uncached_names:
        # All cached!
        if max_results is not None and len(cached_firms) > max_results:
            cached_firms = cached_firms[:max_results]
        total_duration = time.time() - total_start
        logger.info("serp_fetch_completed", extra={
            "search_id": search_id,
            "total_duration_seconds": round(total_duration, 2),
            "serp_api_seconds": 0,
            "extraction_seconds": 0,
            "all_cached": True
        })
        return cached_firms
    
    # Phase 1: Fetch all SERP results in parallel (fast)
    serp_start = time.time()
    logger.info("serp_fetch_api_started", extra={
        "search_id": search_id,
        "firms_to_fetch": len(uncached_names),
        "max_workers": max_workers
    })
    
    serp_results = []
    total = len(uncached_names)
    completed = 0
    request_times = []  # Track individual request times
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Use 6 second timeout for HTTP requests (most complete in 2-3s)
        serp_timeout = 6
        future_to_name = {
            executor.submit(_fetch_serp_results_only, name, location, serp_timeout, search_id): name
            for name in uncached_names
        }
        
        for future in as_completed(future_to_name):
            firm_name = future_to_name[future]
            completed += 1
            request_start = time.time()
            
            try:
                # Future timeout should be slightly longer than HTTP timeout to account for processing
                serp_data = future.result(timeout=serp_timeout + 2)
                request_duration = time.time() - request_start
                request_times.append((firm_name, request_duration))
                
                if serp_data:
                    serp_results.append(serp_data)
                
                if progress_callback:
                    progress_callback(completed, total)
            except FutureTimeoutError:
                request_duration = time.time() - request_start
                request_times.append((firm_name, request_duration))
                logger.warning("serp_fetch_timeout", extra={
                    "search_id": search_id,
                    "firm": firm_name,
                    "duration_seconds": round(request_duration, 2)
                })
            except Exception as e:
                request_duration = time.time() - request_start
                request_times.append((firm_name, request_duration))
                logger.warning("serp_fetch_error", extra={
                    "search_id": search_id,
                    "firm": firm_name,
                    "duration_seconds": round(request_duration, 2),
                    "error": str(e)
                })
    
    serp_duration = time.time() - serp_start
    
    # Log slowest requests
    if request_times:
        slowest = sorted(request_times, key=lambda x: x[1], reverse=True)[:5]
        avg_seconds = sum(d for _, d in request_times) / len(request_times)
        max_seconds = max(d for _, d in request_times)
        
        logger.info("serp_fetch_slowest", extra={
            "search_id": search_id,
            "slowest_requests": [{"firm": f, "seconds": round(d, 2)} for f, d in slowest],
            "avg_seconds": round(avg_seconds, 2),
            "max_seconds": round(max_seconds, 2),
            "total_requests": len(request_times)
        })
    
    logger.info("serp_fetch_api_complete", extra={
        "search_id": search_id,
        "duration_seconds": round(serp_duration, 2),
        "results_count": len(serp_results),
        "success_rate": round(len(serp_results) / len(uncached_names), 2) if uncached_names else 0
    })
    
    if not serp_results:
        logger.warning("serp_fetch_no_results", extra={
            "search_id": search_id
        })
        return cached_firms
    
    # Phase 2: Batch extract with ChatGPT (parallel batches for faster processing)
    extraction_start = time.time()
    logger.info("serp_fetch_extraction_started", extra={
        "search_id": search_id,
        "firms_to_extract": len(serp_results)
    })
    
    # Use parallel batch extraction instead of sequential
    extracted_firms = _extract_all_firms_parallel(
        serp_results=serp_results,
        location=location,
        search_id=search_id
    )
    
    # Cache each extracted firm
    for firm_data in extracted_firms:
        firm_name = firm_data.get("name", "")
        if firm_name:
            cache_key = _get_cache_key(firm_name, location)
            _set_cached_firm(cache_key, firm_data)
    
    extraction_duration = time.time() - extraction_start
    
    logger.info("serp_fetch_extraction_complete", extra={
        "search_id": search_id,
        "duration_seconds": round(extraction_duration, 2),
        "firms_extracted": len(extracted_firms)
    })
    
    # Combine cached and extracted firms
    all_firms = cached_firms + extracted_firms
    
    # STRICT LIMIT ENFORCEMENT: Apply max_results limit if provided
    if max_results is not None:
        if len(all_firms) > max_results:
            all_firms = all_firms[:max_results]
            logger.debug("serp_fetch_results_limited", extra={
                "search_id": search_id,
                "limited_to": max_results
            })
        elif len(all_firms) < max_results:
            logger.warning("serp_fetch_partial_results", extra={
                "search_id": search_id,
                "retrieved": len(all_firms),
                "requested": max_results
            })
    
    total_duration = time.time() - total_start
    
    logger.info("serp_fetch_completed", extra={
        "search_id": search_id,
        "total_duration_seconds": round(total_duration, 2),
        "serp_api_seconds": round(serp_duration, 2),
        "extraction_seconds": round(extraction_duration, 2),
        "cached_count": len(cached_firms),
        "extracted_count": len(extracted_firms),
        "total_firms": len(all_firms)
    })
    
    return all_firms
