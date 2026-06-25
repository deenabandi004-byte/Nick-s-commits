"""
Firm Details Extraction - Perplexity pro_search + Firecrawl extract_company_profile.

Fallback path for the firm-search pipeline: invoked by serp_client when the
discover_firms call returns entries missing website or employeeCount. Combines
Perplexity prose (LinkedIn URL, recent context) with Firecrawl structured
extraction (headcount, founded, industries) and uses an LLM only as a JSON
parser to reconcile the two sources.
"""
import json
import hashlib
import time
import re
import logging
from typing import List, Dict, Any, Optional, Callable
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FutureTimeoutError
from app.services.openai_client import get_openai_client, get_anthropic_client

logger = logging.getLogger(__name__)


def _call_ai(system_prompt: str, user_prompt: str, max_tokens: int = 1000, label: str = "AI") -> Optional[str]:
    """Try Claude first, fall back to GPT. Returns the response text or None."""
    # Try Claude first
    anthropic_client = get_anthropic_client()
    if anthropic_client:
        try:
            response = anthropic_client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=max_tokens,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )
            logger.info("[%s] ✅ Claude succeeded", label)
            return response.content[0].text.strip()
        except Exception as e:
            logger.warning("[%s] ⚠️ Claude failed: %s — falling back to GPT", label, e)

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


# In-memory cache for firm details (key: firm_name_hash, value: firm_data)
_firm_cache = {}
_cache_ttl = 3600  # 1 hour cache TTL


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


_WEBSITE_URL_RE = re.compile(
    r'https?://(?:www\.)?(?!linkedin\.com)[\w.-]+\.(?:com|org|io|co|net|ai)(?:/[\w./-]*)?'
)
_LINKEDIN_URL_RE = re.compile(r'https?://(?:www\.)?linkedin\.com/company/[\w-]+')


def _fetch_serp_results_only(
    firm_name: str,
    location: Dict[str, Optional[str]] = None,
    timeout: int = 6,
    search_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Fetch per-firm context for downstream LLM normalization.

    Perplexity pro_search → extract website + LinkedIn URLs from the prose →
    Firecrawl extract_company_profile on the website for structured fields.
    Returns None if Perplexity yields nothing.

    The timeout arg is retained for caller compatibility but is enforced inside
    the Perplexity and Firecrawl clients.
    """
    start_time = time.time()

    try:
        from app.services.perplexity_client import pro_search
    except Exception:
        logger.warning("perplexity_client import failed in _fetch_serp_results_only", exc_info=True)
        return None

    loc_parts = []
    if location:
        if location.get("locality"):
            loc_parts.append(location["locality"])
        if location.get("region"):
            loc_parts.append(location["region"])
    loc_hint = " ".join(loc_parts)
    query = (
        f"{firm_name} company {loc_hint} official website LinkedIn employee count headquarters founded"
    ).strip()

    try:
        result = pro_search(query)
    except Exception:
        logger.warning("Perplexity pro_search failed for %s", firm_name, exc_info=True)
        return None

    content = (result or {}).get("content") or ""
    citations = (result or {}).get("citations") or []
    if not content:
        return None

    website_match = _WEBSITE_URL_RE.search(content)
    website_url = website_match.group(0) if website_match else None

    linkedin_match = _LINKEDIN_URL_RE.search(content)
    linkedin_url = linkedin_match.group(0) if linkedin_match else None
    if not linkedin_url:
        for c in citations:
            if "linkedin.com/company" in str(c).lower():
                linkedin_url = c if str(c).startswith("http") else f"https://{c}"
                break

    firecrawl_data: Dict[str, Any] = {}
    if website_url:
        try:
            from app.services.firecrawl_client import extract_company_profile
            firecrawl_data = extract_company_profile(website_url) or {}
        except Exception:
            logger.warning("Firecrawl extract_company_profile failed for %s (%s)", firm_name, website_url, exc_info=True)

    duration = time.time() - start_time
    logger.info(
        "firm_detail_fetch",
        extra={
            "search_id": search_id,
            "firm": firm_name,
            "duration_seconds": round(duration, 2),
            "has_website": bool(website_url),
            "has_linkedin": bool(linkedin_url),
            "has_firecrawl": bool(firecrawl_data),
        },
    )

    return {
        "firm_name": firm_name,
        "location": location,
        "_perplexity_content": content,
        "_perplexity_citations": citations,
        "_website_url": website_url,
        "_linkedin_url": linkedin_url,
        "_firecrawl_data": firecrawl_data,
    }


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


def _parse_employee_count(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value) if value > 0 else None
    if isinstance(value, str):
        numbers = re.findall(r'[\d,]+', value.replace(',', ''))
        if numbers:
            try:
                n = int(numbers[0].replace(',', ''))
                return n if n > 0 else None
            except ValueError:
                return None
    return None


def _bucket_from_count(count: Optional[int]) -> Optional[str]:
    if not count or count <= 0:
        return None
    if count <= 50:
        return "small"
    if count <= 500:
        return "mid"
    return "large"


def _extract_firms_batch_with_chatgpt(
    serp_data_list: List[Dict[str, Any]],
    location: Dict[str, Optional[str]] = None
) -> List[Dict[str, Any]]:
    """
    Normalize Perplexity prose + Firecrawl structured data into firm dicts.

    One LLM call parses N firms' Perplexity content into JSON. Firecrawl data
    (when present) takes precedence over LLM-inferred fields for headcount,
    founded, and industry.
    """
    if not serp_data_list:
        return []

    location_str = ""
    if location:
        location_parts = [v for v in (
            location.get("locality"),
            location.get("region"),
            location.get("country"),
        ) if v]
        location_str = ", ".join(location_parts)

    firms_context = []
    for serp_data in serp_data_list:
        firm_name = serp_data["firm_name"]
        perplexity_content = serp_data.get("_perplexity_content") or ""
        firecrawl_data = serp_data.get("_firecrawl_data") or {}
        website_url = serp_data.get("_website_url")
        linkedin_url = serp_data.get("_linkedin_url")

        firm_context = f"\n=== FIRM: {firm_name} ===\n"
        if website_url:
            firm_context += f"Website: {website_url}\n"
        if linkedin_url:
            firm_context += f"LinkedIn: {linkedin_url}\n"
        if firecrawl_data:
            firm_context += f"Firecrawl structured profile:\n{json.dumps(firecrawl_data, indent=2)}\n"
        if perplexity_content:
            firm_context += f"Perplexity research:\n{perplexity_content}\n"

        firms_context.append(firm_context)

    combined_context = "\n".join(firms_context)

    system_prompt = (
        "You normalize company research into structured JSON. Be faithful to the "
        "source data. If a field is not stated, return null — do not invent it. "
        "Return ONLY a JSON array, one object per firm, in the same order."
    )

    user_prompt = f"""Requested Location: {location_str if location_str else 'Not specified'}

Research for {len(serp_data_list)} companies (in order):
{combined_context}

For each company, return:
- name: Official company name
- website: Official website URL (https://...) or null
- linkedinUrl: https://linkedin.com/company/<slug> or null
- location: {{"city": string|null, "state": string|null, "country": string|null}}
- industry: Primary industry or null
- employeeCount: integer or null
- sizeBucket: "small" (1-50) | "mid" (51-500) | "large" (500+) | null
- founded: 4-digit year or null

Return ONLY a JSON array — no markdown, no commentary."""

    try:
        result_text = _call_ai(system_prompt, user_prompt, max_tokens=2000, label="FIRM-BATCH")
        if not result_text:
            return []

        if result_text.startswith("```"):
            result_text = result_text.split("```")[1]
            if result_text.startswith("json"):
                result_text = result_text[4:]
        result_text = result_text.strip()

        try:
            companies_data = json.loads(result_text)
        except json.JSONDecodeError as e:
            logger.warning("Failed to parse batch extraction JSON: %s", e)
            return []

        if not isinstance(companies_data, list):
            companies_data = [companies_data]

        extracted_firms = []
        used_indices = set()

        for i, serp_data in enumerate(serp_data_list):
            firm_name = serp_data["firm_name"]
            firecrawl_data = serp_data.get("_firecrawl_data") or {}
            website_url = serp_data.get("_website_url")
            linkedin_url = serp_data.get("_linkedin_url")

            company_data = None
            if i < len(companies_data) and i not in used_indices:
                candidate = companies_data[i]
                if isinstance(candidate, dict) and candidate.get("name") and (
                    firm_name.lower() in candidate["name"].lower() or
                    candidate["name"].lower() in firm_name.lower()
                ):
                    company_data = candidate
                    used_indices.add(i)

            if not company_data:
                for j, cd in enumerate(companies_data):
                    if j in used_indices or not isinstance(cd, dict):
                        continue
                    if cd.get("name") and (
                        firm_name.lower() in cd["name"].lower() or
                        cd["name"].lower() in firm_name.lower()
                    ):
                        company_data = cd
                        used_indices.add(j)
                        break

            if not company_data and companies_data:
                for j, cd in enumerate(companies_data):
                    if j not in used_indices and isinstance(cd, dict):
                        company_data = cd
                        used_indices.add(j)
                        break

            if not company_data:
                company_data = {"name": firm_name}

            # Firecrawl wins for the fields it provides — it scraped the site directly
            if firecrawl_data:
                fc_employees = _parse_employee_count(firecrawl_data.get("employee_count"))
                if fc_employees:
                    company_data["employeeCount"] = fc_employees
                fc_founded = firecrawl_data.get("founded")
                if fc_founded and not company_data.get("founded"):
                    company_data["founded"] = fc_founded
                fc_industries = firecrawl_data.get("industries")
                if fc_industries and not company_data.get("industry"):
                    if isinstance(fc_industries, list) and fc_industries:
                        company_data["industry"] = fc_industries[0]
                    elif isinstance(fc_industries, str):
                        company_data["industry"] = fc_industries

            # Fill in URLs from regex matches if the LLM missed them
            if website_url and not company_data.get("website"):
                company_data["website"] = website_url
            if linkedin_url and not company_data.get("linkedinUrl"):
                company_data["linkedinUrl"] = linkedin_url

            company_data["employeeCount"] = _parse_employee_count(company_data.get("employeeCount"))
            if not company_data.get("sizeBucket"):
                company_data["sizeBucket"] = _bucket_from_count(company_data.get("employeeCount"))

            if not isinstance(company_data.get("location"), dict):
                company_data["location"] = {}

            if company_data.get("website") and not company_data["website"].startswith("http"):
                company_data["website"] = f"https://{company_data['website']}"

            extracted_firms.append(company_data)

        return extracted_firms

    except Exception as e:
        logger.exception("Error in batch extraction: %s", e)
        return []



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
