"""
Company Data Extraction Service - Uses Claude/ChatGPT to generate firm names, then SERP to get details
"""
import json
import logging
import re
from typing import List, Dict, Any, Optional
from app.services.openai_client import get_openai_client, get_anthropic_client

logger = logging.getLogger(__name__)


def generate_firm_names_with_chatgpt(
    filters: Dict[str, Any],
    limit: int = 20,
    original_query: str = ""
) -> List[str]:
    """
    Use ChatGPT to generate a list of specific firm names based on search criteria.
    This is the first step - ChatGPT suggests actual company names.
    
    Args:
        filters: Search filters (industry, location, size, keywords)
        limit: Maximum number of firm names to generate
        original_query: The original user search query (used to match exact company type)
    
    Returns:
        List of firm names (strings)
    """
    industry = filters.get("industry", "")
    location_info = filters.get("location", {})
    location_str = ", ".join([v for v in [
        location_info.get("locality"),
        location_info.get("region"),
        location_info.get("country")
    ] if v])
    size = filters.get("size", "none")
    keywords = filters.get("keywords", [])
    
    # Enhanced prompt - emphasizes matching EXACT company type and LOCATION from original query
    system_prompt = """Generate specific company names matching the user's search criteria.

CRITICAL RULES:

1. LOCATION REQUIREMENT:
   - Prioritize companies with headquarters/primary operations in the specified location
   - For early-stage startups or companies where location is unclear, include them if they're likely in the location based on available information
   - The specified location should be a strong preference, but don't skip all companies if you can't verify exact location
   - If the query mentions a specific location, prioritize companies in that location, but include others if needed to reach the requested count

2. Match the EXACT type of company the user is looking for - not just the broad industry.

3. The user's original search query is the most important guide.

4. For early-stage startups or niche searches, be more flexible with location verification - include companies that are likely in the location even if you can't verify with 100% certainty.

EXAMPLES OF CORRECT MATCHING:

- "talent agencies" → Return talent agencies (CAA, WME, UTA, ICM Partners, Paradigm) - NOT movie studios, NOT production companies

- "law firms" → Return law firms - NOT legal tech companies

- "hedge funds" → Return hedge funds - NOT banks or asset managers

- "record labels" → Return record labels - NOT streaming services

- "early-stage tech startups in SF" → Return actual early-stage startups in SF, even if some location details are unclear

Return JSON array only."""

    # Determine size instruction
    if size != 'none':
        size_instruction = f"Size preference: {size} companies"
    else:
        size_instruction = "Size preference: Prioritize the BIGGEST/LARGEST companies (when size is not specified, return the largest firms first)"
    
    user_prompt = f"""User's original search: "{original_query if original_query else f'{industry} companies in {location_str}'}"

Parsed criteria:

- Industry/Type: {industry}

- Location: {location_str}  

- {size_instruction}

- Keywords: {', '.join(keywords) if keywords else 'none'}

Generate {limit} companies that match EXACTLY what the user is looking for.

IMPORTANT: If the user said "talent agencies", only return talent agencies like CAA, WME, UTA, ICM Partners. 

If the user said "law firms", only return law firms.

Do NOT return broadly related companies.

LOCATION REQUIREMENT:
- Prioritize companies with headquarters/primary operations in: {location_str}
- For early-stage startups or when location is unclear, include companies that are likely in {location_str} based on available information
- The location {location_str} is a strong preference - prioritize it, but don't skip all companies if exact verification is difficult
- If the query specifically mentions a location, make it a priority, but be flexible enough to return results

CRITICAL SIZE RULE: When size preference is not specified, prioritize returning the BIGGEST and MOST ESTABLISHED companies in the industry. List them from largest to smallest.

Return JSON array:
["Company 1", "Company 2", ...]"""

    try:
        result_text = None

        # Try Claude first
        anthropic_client = get_anthropic_client()
        if anthropic_client:
            try:
                logger.info("[FIRM-GEN] Attempting Claude for firm name generation")
                claude_response = anthropic_client.messages.create(
                    model="claude-sonnet-4-20250514",
                    max_tokens=1000,
                    system=system_prompt,
                    messages=[{"role": "user", "content": user_prompt}],
                )
                result_text = claude_response.content[0].text.strip()
                logger.info("[FIRM-GEN] ✅ Claude succeeded")
            except Exception as claude_err:
                logger.warning("[FIRM-GEN] ⚠️ Claude failed: %s - falling back to GPT", claude_err)

        # Fall back to GPT
        if result_text is None:
            client = get_openai_client()
            if not client:
                print("⚠️ No AI client available")
                return []
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,
                max_tokens=1000
            )
            result_text = response.choices[0].message.content.strip()
            logger.info("[FIRM-GEN] ✅ GPT succeeded")
        
        # Clean up response - remove markdown code blocks if present
        if result_text.startswith("```"):
            result_text = result_text.split("```")[1]
            if result_text.startswith("json"):
                result_text = result_text[4:]
        result_text = result_text.strip()
        
        # Parse JSON response
        try:
            parsed = json.loads(result_text)
            
            # Handle different response formats
            if isinstance(parsed, list):
                firm_names = [str(name).strip() for name in parsed if name]
            elif isinstance(parsed, dict):
                # Check for common keys
                firm_names = parsed.get("companies", parsed.get("names", parsed.get("firms", [])))
                if not isinstance(firm_names, list):
                    firm_names = []
                firm_names = [str(name).strip() for name in firm_names if name]
            else:
                firm_names = []
            
            # Remove duplicates and STRICTLY limit to requested amount
            seen = set()
            unique_names = []
            for name in firm_names:
                name_lower = name.lower().strip()
                if name_lower and name_lower not in seen:
                    seen.add(name_lower)
                    unique_names.append(name.strip())
                    if len(unique_names) >= limit:
                        break
            
            # STRICT LIMIT: Ensure we never return more than requested
            unique_names = unique_names[:limit]
            
            if len(unique_names) == 0:
                print(f"⚠️ ChatGPT returned 0 firm names (limit: {limit})")
                print(f"⚠️ DEBUG: Raw response (first 500 chars): {result_text[:500]}")
                print(f"⚠️ DEBUG: Parsed type: {type(parsed)}, Value: {parsed}")
            else:
                print(f"✅ Generated {len(unique_names)} firm names from ChatGPT (limit: {limit})")
            return unique_names
            
        except json.JSONDecodeError as e:
            print(f"⚠️ Failed to parse ChatGPT JSON response: {e}")
            print(f"⚠️ Response text (first 1000 chars): {result_text[:1000]}")
            # Try to extract JSON array from text
            json_match = re.search(r'\[.*\]', result_text, re.DOTALL)
            if json_match:
                try:
                    parsed = json.loads(json_match.group())
                    if isinstance(parsed, list):
                        firm_names = [str(name).strip() for name in parsed if name]
                        if firm_names:
                            print(f"✅ Recovered {len(firm_names)} firm names after JSON parse error")
                            return firm_names[:limit]
                        else:
                            print(f"⚠️ Recovered JSON array but it was empty")
                except Exception as recovery_error:
                    print(f"⚠️ Failed to recover from JSON parse error: {recovery_error}")
            print(f"⚠️ Returning empty list - could not parse or recover firm names")
            return []
        
    except Exception as e:
        print(f"❌ Error generating firm names: {e}")
        import traceback
        traceback.print_exc()
        return []


def extract_company_data_from_serp(
    serp_results: List[Dict[str, Any]],
    filters: Dict[str, Any],
    limit: int = 20
) -> List[Dict[str, Any]]:
    """
    Use ChatGPT to extract structured company data from SERP search results.
    
    Args:
        serp_results: List of SERP result objects (organic, knowledge_graph, local)
        filters: Original search filters (industry, location, size, keywords)
        limit: Maximum number of companies to extract
    
    Returns:
        List of extracted company data dictionaries
    """
    if not serp_results:
        return []
    
    # Prepare SERP results for ChatGPT
    results_text = []
    for i, result in enumerate(serp_results[:limit * 2], 1):  # Get more to account for filtering
        source = result.get("source", "unknown")
        title = result.get("title", "")
        link = result.get("link", "")
        snippet = result.get("snippet", "")
        displayed_link = result.get("displayed_link", link)
        
        # Include knowledge graph data if available
        kg_data = ""
        if result.get("knowledge_graph"):
            kg = result["knowledge_graph"]
            kg_data = f"\n  Knowledge Graph: {json.dumps(kg, indent=2)}"
        
        result_str = f"""
Result {i} ({source}):
  Title: {title}
  Link: {link}
  Displayed Link: {displayed_link}
  Snippet: {snippet}{kg_data}
"""
        results_text.append(result_str)
    
    serp_text = "\n".join(results_text)
    
    # Build extraction prompt
    industry = filters.get("industry", "")
    location_info = filters.get("location", {})
    location_str = ", ".join([v for v in [
        location_info.get("locality"),
        location_info.get("region"),
        location_info.get("country")
    ] if v])
    size = filters.get("size", "none")
    keywords = filters.get("keywords", [])
    
    system_prompt = """You are a company data extraction assistant. Extract structured company information from Google search results.

Your task is to identify companies from search results and extract their information. Focus on:
1. Companies that match the search criteria (industry, location, size)
2. Real companies (not job listings, news articles, or directories)
3. Companies with official websites or LinkedIn pages

For each company found, extract:
- name: Official company name
- website: Official website URL (if found)
- linkedinUrl: LinkedIn company page URL (if found)
- location: {city: string or null, state: string or null, country: string or null}
- industry: Primary industry/sector
- employeeCount: Estimated employee count (number or null if unknown)
- sizeBucket: "small" (1-50), "mid" (51-500), "large" (500+), or null if unknown
- founded: Year founded (number or null if unknown)

IMPORTANT:
- Only extract companies that are actual businesses (not directories, job sites, or news articles)
- If employee count is not available, try to infer from size descriptions (e.g., "mid-sized", "small", "large")
- Extract location from the result snippet, link, or knowledge graph
- Return a valid JSON array of company objects, no markdown code blocks, no explanations
- If a result is not a company, skip it
- Deduplicate companies by website domain
- Format: [{"name": "...", "website": "...", ...}, ...]"""

    user_prompt = f"""Search Criteria:
- Industry: {industry}
- Location: {location_str}
- Size: {size if size != 'none' else 'any'}
- Keywords: {', '.join(keywords) if keywords else 'none'}

Search Results:
{serp_text}

Extract company information for up to {limit} companies that match the criteria. 

Return ONLY a JSON array in this exact format (no markdown, no code blocks, no explanations):
[
  {{
    "name": "Company Name",
    "website": "https://example.com",
    "linkedinUrl": "https://linkedin.com/company/example",
    "location": {{"city": "City", "state": "State", "country": "Country"}},
    "industry": "Industry",
    "employeeCount": 100,
    "sizeBucket": "mid",
    "founded": 2010
  }}
]"""

    try:
        result_text = None

        # Try Claude first
        anthropic_client = get_anthropic_client()
        if anthropic_client:
            try:
                logger.info("[FIRM-EXTRACT] Attempting Claude for company extraction")
                claude_response = anthropic_client.messages.create(
                    model="claude-sonnet-4-20250514",
                    max_tokens=2000,
                    system=system_prompt,
                    messages=[{"role": "user", "content": user_prompt}],
                )
                result_text = claude_response.content[0].text.strip()
                logger.info("[FIRM-EXTRACT] ✅ Claude succeeded")
            except Exception as claude_err:
                logger.warning("[FIRM-EXTRACT] ⚠️ Claude failed: %s - falling back to GPT", claude_err)

        # Fall back to GPT
        if result_text is None:
            client = get_openai_client()
            if not client:
                print("⚠️ No AI client available")
                return []
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1,
                max_tokens=2000
            )
            result_text = response.choices[0].message.content.strip()
            logger.info("[FIRM-EXTRACT] ✅ GPT succeeded")
        
        # Clean up response - remove markdown code blocks if present
        if result_text.startswith("```"):
            result_text = result_text.split("```")[1]
            if result_text.startswith("json"):
                result_text = result_text[4:]
        result_text = result_text.strip()
        
        # Parse JSON response
        # The response might be wrapped in a "companies" key or be a direct array
        try:
            parsed = json.loads(result_text)
            
            # Handle different response formats
            if isinstance(parsed, list):
                companies = parsed
            elif isinstance(parsed, dict):
                # Check for common keys
                companies = parsed.get("companies", parsed.get("data", parsed.get("results", [])))
                if not isinstance(companies, list):
                    companies = [parsed] if parsed else []
            else:
                companies = []
            
            # Validate and clean extracted data
            validated_companies = []
            for company in companies[:limit]:
                if not isinstance(company, dict):
                    continue
                
                # Ensure required fields exist
                if not company.get("name"):
                    continue
                
                # Normalize data
                validated_company = {
                    "name": company.get("name", "").strip(),
                    "website": company.get("website") or company.get("websiteUrl") or None,
                    "linkedinUrl": company.get("linkedinUrl") or company.get("linkedin") or None,
                    "location": company.get("location") or {},
                    "industry": company.get("industry") or company.get("sector") or None,
                    "employeeCount": company.get("employeeCount") or company.get("employees") or None,
                    "sizeBucket": company.get("sizeBucket") or company.get("size") or None,
                    "founded": company.get("founded") or company.get("foundedYear") or None
                }
                
                # Ensure location is a dict
                if not isinstance(validated_company["location"], dict):
                    validated_company["location"] = {}
                
                validated_companies.append(validated_company)
            
            print(f"✅ Extracted {len(validated_companies)} companies from SERP results")
            if len(validated_companies) == 0:
                print(f"⚠️ DEBUG: No companies validated. Parsed companies: {len(companies)}")
                print(f"⚠️ DEBUG: First parsed item type: {type(companies[0]) if companies else 'None'}")
                if companies:
                    print(f"⚠️ DEBUG: First parsed item: {json.dumps(companies[0], indent=2)[:500]}")
            return validated_companies
            
        except json.JSONDecodeError as e:
            print(f"⚠️ Failed to parse ChatGPT JSON response: {e}")
            print(f"Response text (first 1000 chars): {result_text[:1000]}")
            # Try to extract JSON from the response if it's wrapped in text
            import re
            json_match = re.search(r'\[.*\]', result_text, re.DOTALL)
            if json_match:
                try:
                    parsed = json.loads(json_match.group())
                    if isinstance(parsed, list):
                        companies = parsed
                    else:
                        companies = []
                except:
                    companies = []
            else:
                companies = []
            
            # Continue with validation if we found companies
            if companies:
                validated_companies = []
                for company in companies[:limit]:
                    if not isinstance(company, dict) or not company.get("name"):
                        continue
                    validated_company = {
                        "name": company.get("name", "").strip(),
                        "website": company.get("website") or company.get("websiteUrl") or None,
                        "linkedinUrl": company.get("linkedinUrl") or company.get("linkedin") or None,
                        "location": company.get("location") or {},
                        "industry": company.get("industry") or company.get("sector") or None,
                        "employeeCount": company.get("employeeCount") or company.get("employees") or None,
                        "sizeBucket": company.get("sizeBucket") or company.get("size") or None,
                        "founded": company.get("founded") or company.get("foundedYear") or None
                    }
                    if not isinstance(validated_company["location"], dict):
                        validated_company["location"] = {}
                    validated_companies.append(validated_company)
                print(f"✅ Recovered {len(validated_companies)} companies after JSON parse error")
                return validated_companies
            
            return []
        
    except Exception as e:
        print(f"❌ Error extracting company data: {e}")
        import traceback
        traceback.print_exc()
        return []
