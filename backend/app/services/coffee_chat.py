"""
Coffee chat prep orchestration helpers.
"""
from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Sequence, Tuple

import dateparser
from serpapi import GoogleSearch

from app.config import SERPAPI_KEY
from app.services.openai_client import get_openai_client
from app.utils.contact import strip_dashes

logger = logging.getLogger(__name__)


@dataclass
class NewsItem:
    title: str
    url: str
    source: str
    published_at: Optional[str]
    summary: str
    relevance_tag: str
    confidence: str = "high"


def _default_time_window_to_serp(time_window: str) -> str:
    """
    Convert a human friendly time window into SerpAPI `tbs` value.
    """
    time_window = (time_window or "").lower()
    patterns = {
        ("last 7 days", "past week", "7d", "week"): "qdr:w",
        ("last 30 days", "past month", "30d", "month"): "qdr:m",
        ("last 90 days", "quarter", "90d"): "qdr:m3",
        ("last year", "12m", "365d"): "qdr:y",
    }
    for aliases, tbs in patterns.items():
        if any(alias in time_window for alias in aliases):
            return tbs
    return "qdr:m3"


def _normalise_iso(date_str: Optional[str]) -> Optional[str]:
    if not date_str:
        return None
    parsed = dateparser.parse(str(date_str))
    if not parsed:
        return None
    return parsed.isoformat()


def _copy_dedup_items(items: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    deduped: List[Dict[str, Any]] = []
    for item in items:
        url = item.get("link") or item.get("url")
        if not url:
            continue
        key = url.split("?")[0]
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _classify_domain(job_title: str) -> str:
    """
    Classify the professional's domain from their role/title.
    Returns 'industrial_engineering' if role indicates industrial/manufacturing work,
    otherwise returns 'general'.
    """
    if not job_title:
        return "general"
    
    job_lower = job_title.lower()
    industrial_keywords = [
        "process", "manufacturing", "operations", "plant", "epc", 
        "mechanical", "chemical"
    ]
    
    if any(keyword in job_lower for keyword in industrial_keywords):
        return "industrial_engineering"
    
    return "general"


def _is_news_eligible(
    item: Dict[str, Any],
    company: str,
    domain: str
) -> bool:
    """
    Hard eligibility filter for news items.
    A news item is ELIGIBLE ONLY if at least one is true:
    - Same company as the professional
    - Clear peer company in industrial / EPC / manufacturing (for industrial_engineering domain)
    - Content directly relates to engineering projects, infrastructure, manufacturing, safety, operations, or regulations
    
    Automatically REJECT:
    - AI, media, SaaS, fintech, consumer tech, finance news
    - Broad earnings or market news unrelated to engineering
    """
    title = (item.get("title") or "").lower()
    snippet = (item.get("snippet") or "").lower()
    text_blob = f"{title} {snippet}"
    company_lower = (company or "").lower()
    
    # Reject categories
    # Use word-boundary-aware matching for short terms to avoid false positives
    # (e.g. "ai" matching "maintain", "railway")
    import re as _re
    reject_phrases = [
        "artificial intelligence", "machine learning",
        "saas", "software as a service", "fintech", "financial technology",
        "consumer tech", "consumer technology", "social media",
        "venture capital", "startup funding",
    ]
    # Short terms that need word-boundary matching
    reject_words = ["ai", "ml", "ipo"]
    reject_broad = ["earnings", "stock", "share", "market", "acquisition", "funding"]

    matches_reject = (
        any(phrase in text_blob for phrase in reject_phrases)
        or any(_re.search(rf'\b{word}\b', text_blob) for word in reject_words)
        or any(term in text_blob for term in reject_broad)
    )

    # Check if same company — allow unless clearly irrelevant
    if company_lower and company_lower in text_blob:
        if domain == "industrial_engineering" and matches_reject:
            engineering_terms = [
                "engineering", "manufacturing", "infrastructure", "operations",
                "process", "plant", "facility", "safety", "regulation"
            ]
            if not any(term in text_blob for term in engineering_terms):
                return False  # Company mentioned but not engineering-relevant
        return True  # Same company, allow it

    # Reject if matches reject terms and isn't company-specific
    if matches_reject:
        return False

    # For industrial_engineering domain, check for relevant peer content
    if domain == "industrial_engineering":
        relevant_terms = [
            "engineering project", "infrastructure", "manufacturing",
            "safety", "operations", "regulation", "industrial",
            "epc", "plant", "process", "chemical", "mechanical",
            "construction", "facility", "production", "refinery",
            "pipeline", "power plant", "factory"
        ]
        if any(term in text_blob for term in relevant_terms):
            peer_indicators = ["contractor", "engineering firm", "manufacturer", "industrial"]
            if any(indicator in text_blob for indicator in peer_indicators):
                return True

    return False


def _score_relevance(
    item: Dict[str, Any],
    company: str,
    division: str,
    office: str,
    industry: str,
) -> Tuple[str, str]:
    """
    Determine relevance_tag and confidence (high/medium) based on match heuristics.
    """
    title = item.get("title", "").lower()
    snippet = item.get("snippet", "").lower()
    text_blob = f"{title} {snippet}"

    division_hit = division and division.lower() in text_blob
    office_hit = office and office.lower() in text_blob
    company_hit = company and company.lower() in text_blob
    industry_hit = industry and industry.lower() in text_blob

    if division_hit and office_hit:
        return "division", "high"
    if division_hit:
        return "division", "medium"
    if office_hit and company_hit:
        return "office", "high"
    if office_hit:
        return "office", "medium"
    if industry_hit:
        return "industry", "medium"
    return "industry", "medium"


def _score_news_relevance(news_item) -> float:
    """
    Compute a 0-1 relevance score for a news item based on its tag and confidence.
    Higher scores indicate more relevant news items.
    Accepts either NewsItem dataclass or dict.
    """
    # Handle both dict and NewsItem types
    if isinstance(news_item, dict):
        tag = (news_item.get("relevance_tag") or "industry").lower()
        confidence = (news_item.get("confidence") or "medium").lower()
    else:
        tag = (news_item.relevance_tag or "industry").lower()
        confidence = (news_item.confidence or "medium").lower()
    
    # Base scores by tag type (division > office > industry)
    tag_scores = {
        "division": 0.9,
        "office": 0.7,
        "industry": 0.5
    }
    
    base_score = tag_scores.get(tag, 0.3)
    
    # Adjust by confidence level
    if confidence == "high":
        score = min(base_score + 0.1, 1.0)
    elif confidence == "medium":
        score = base_score
    else:
        score = base_score * 0.8
    
    return score


def _summarise_article(
    item: Dict[str, Any], 
    division: str, 
    office: str,
    company: str = "",
    domain: str = "general"
) -> str:
    """
    Use OpenAI to craft a 30–40 word summary that is coffee-chat ready.
    """
    # Early exit: check eligibility before generating summary
    if not _is_news_eligible(item, company, domain):
        return ""
    
    client = get_openai_client()
    if not client:
        return ""

    prompt = (
        "You are preparing a high-quality coffee chat brief. Surface ONLY information that is accurate, clearly relevant, and natural for conversation.\n\n"
        "NEWS CONTENT RULES:\n"
        "- The news must relate directly to the company, division, role function, or office\n"
        "- Broad market news is NOT acceptable unless clearly tied to the professional's work\n"
        "- If the news is not clearly relevant, return ONLY the word 'SKIP'\n"
        "- Summaries must be factual, neutral, and 30-40 words\n"
        "- Briefly explain why the item could be worth mentioning in conversation\n"
        "- Avoid sensational, unrelated, or general-interest news\n"
        "- Do not mention job postings, hiring, or recruitment\n"
        "- Never use em dashes or en dashes; use a comma or a period instead\n\n"
        f"TITLE: {item.get('title', '')}\n"
        f"SNIPPET: {item.get('snippet', '')}\n"
        f"DIVISION: {division}\n"
        f"OFFICE: {office}\n"
        "SUMMARY (30-40 words, or 'SKIP' if not clearly relevant):"
    )

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=120,
            temperature=0.4,
        )
        summary = response.choices[0].message.content or ""
        summary = summary.strip()
        
        # Return empty string if model indicates item should be skipped
        if summary.upper() == "SKIP" or len(summary) < 10:
            return ""

        return strip_dashes(summary)
    except Exception as exc:  # pragma: no cover - defensive
        print(f"[CoffeeChat] Summary generation failed: {exc}")
        # Return empty string instead of snippet to maintain quality standards
        return ""


def _generate_industry_overview(
    industry: str, 
    items: Sequence[NewsItem],
    company: str = "",
    domain: str = "general"
) -> str:
    """
    Use OpenAI to produce a 30–40 word industry shift summary.
    """
    client = get_openai_client()
    if not client:
        # Return empty string to maintain quality standards (no generic fallback)
        return ""

    # Filter items to only those with strong relevance scores (threshold 0.8)
    high_relevance_items = [item for item in items if _score_news_relevance(item) >= 0.8]
    if not high_relevance_items:
        logger.debug("NEWS_SKIPPED: no eligible items passed relevance threshold (0.8)")
        return ""  # No high-relevance items, omit industry summary
    
    # Additional domain-specific filtering for industrial_engineering
    if domain == "industrial_engineering":
        # Only include items that are clearly tied to engineering/manufacturing work
        engineering_terms = [
            "engineering", "manufacturing", "infrastructure", "operations",
            "process", "plant", "facility", "safety", "regulation"
        ]
        filtered_items = []
        for item in high_relevance_items:
            item_text = f"{item.title} {item.summary}".lower()
            # Must be same company OR contain engineering-relevant terms
            is_same_company = company.lower() in item_text if company else False
            has_engineering_relevance = any(term in item_text for term in engineering_terms)
            if is_same_company or has_engineering_relevance:
                filtered_items.append(item)
        high_relevance_items = filtered_items
        if not high_relevance_items:
            return ""  # No items meet domain-specific criteria

    notes = "\n".join(
        f"- {item.title}: {item.summary}" for item in list(high_relevance_items)[:5]
    )
    prompt = (
        "You are preparing a high-quality coffee chat brief. Surface ONLY information that is accurate, clearly relevant, and natural for conversation.\n\n"
        "INDUSTRY CONTENT RULES:\n"
        "- Include industry content ONLY if it clearly relates to the company, division, role function, or office\n"
        "- Broad market news is NOT acceptable unless clearly tied to the professional's work\n"
        "- If content does not meet relevance thresholds, return ONLY the word 'SKIP'\n"
        "- Write a 30-40 word factual, neutral summary\n"
        "- Briefly explain why these developments matter for the division or office\n"
        "- Focus on concrete trends or events, not speculation\n"
        "- Avoid marketing language, opinions, or value judgments\n"
        "- Use simple, conversational language\n"
        "- Never use em dashes or en dashes; use a comma or a period instead\n\n"
        f"Industry: {industry}\n"
        f"Relevant Highlights:\n{notes}\n\n"
        "Industry Summary (30-40 words, or 'SKIP' if not clearly relevant):"
    )
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=120,
            temperature=0.5,
        )
        result = (response.choices[0].message.content or "").strip()
        
        # Return empty string if model indicates content should be skipped
        if result.upper() == "SKIP" or len(result) < 10:
            return ""

        return strip_dashes(result)
    except Exception as exc:  # pragma: no cover - defensive
        print(f"[CoffeeChat] Industry summary failed: {exc}")
        # Return empty string to maintain quality standards (no generic fallback)
        return ""


def fetch_serp_research(
    *,
    company: str,
    division: str,
    office: str,
    industry: str,
    job_title: str = "",
    time_window: str = "last 90 days",
    geo: str = "us",
    language: str = "en",
) -> Tuple[List[NewsItem], str]:
    """
    Fetch up to five relevant news items plus an industry summary.
    Primary: Perplexity quick_search.  Fallback: SerpAPI + OpenAI summarisation.
    """
    # ── PRIMARY: Perplexity (replaces SerpAPI) ──────────────────────────
    try:
        from app.services.perplexity_client import quick_search

        query_parts = [p for p in [company, division, office, industry] if p]
        query = " ".join(query_parts) + " recent news updates"
        result = quick_search(query, recency="month")
        if result.get("content"):
            # Parse Perplexity response into NewsItem list
            domain = _classify_domain(job_title)
            content = result["content"]
            citations = result.get("citations", [])

            # Build a single high-confidence NewsItem from the Perplexity response
            news_items: List[NewsItem] = []
            # Split content into paragraphs to create individual news items
            paragraphs = [p.strip() for p in content.split("\n") if p.strip() and len(p.strip()) > 20]
            for i, para in enumerate(paragraphs[:5]):
                url = citations[i] if i < len(citations) else ""
                news_items.append(
                    NewsItem(
                        title=para[:120],
                        url=url,
                        source="Perplexity",
                        published_at=None,
                        summary=para,
                        relevance_tag="division" if division and division.lower() in para.lower() else "industry",
                        confidence="high",
                    )
                )

            base_industry = industry or company or "the industry"
            industry_summary = _generate_industry_overview(
                base_industry, news_items, company, domain
            )
            logger.info("Perplexity quick_search succeeded for coffee-chat research")
            return news_items, industry_summary
    except Exception:
        logger.warning("Perplexity quick_search failed; SerpAPI fallback gated by ENABLE_SERPAPI_FALLBACK", exc_info=True)

    # SerpAPI fallback disabled by default. Set ENABLE_SERPAPI_FALLBACK=1 to re-enable.
    if not os.getenv("ENABLE_SERPAPI_FALLBACK"):
        return [], ""

    # ── FALLBACK: existing SerpAPI code (kept until Phase 8) ────────────
    # DEPRECATED: remove in Phase 8
    if not SERPAPI_KEY:
        print("⚠️ SERPAPI_KEY missing; skipping newsroom enrichment")
        return [], ""

    # Build query list with fallbacks per product spec
    queries: List[Tuple[str, str]] = []
    base_company = company or ""
    base_division = division or ""
    base_office = office or ""
    base_industry = industry or ""

    def _compose_query(*parts: str) -> str:
        base = " ".join(filter(None, parts)).strip()
        if not base:
            return ""
        # Exclude hiring spam and emphasise announcements
        return f'{base} "news" "update" -"careers" -"jobs" -"hiring" -"recruiting"'

    if base_company or base_office or base_division:
        queries.append(
            (
                _compose_query(base_company, base_division, base_office),
                "division",
            )
        )
    if base_company or base_office:
        queries.append((_compose_query(base_company, base_office), "office"))
    if base_company and base_industry:
        queries.append((_compose_query(base_company, base_industry), "industry"))
    if base_industry:
        queries.append((_compose_query(base_industry), "industry"))

    tbs_value = _default_time_window_to_serp(time_window)
    collected: List[Dict[str, Any]] = []
    used_queries: List[str] = []

    for query, query_type in queries:
        query = query.strip()
        if not query:
            continue
        print(f"[CoffeeChat] SERP query ({query_type}): {query}")
        used_queries.append(query)
        try:
            search = GoogleSearch(
                {
                    "q": query,
                    "api_key": SERPAPI_KEY,
                    "tbm": "nws",
                    "num": 10,
                    "tbs": tbs_value,
                    "hl": language or "en",
                    "gl": geo or "us",
                }
            )
            results = search.get_dict()
            items = results.get("news_results", []) or []
            collected.extend(items)
            if len(_copy_dedup_items(collected)) >= 5:
                break
        except Exception as exc:  # pragma: no cover - network call
            print(f"[CoffeeChat] SERP request failed: {exc}")
            continue

    deduped = _copy_dedup_items(collected)
    
    # Classify domain from job title
    domain = _classify_domain(job_title)
    
    news_items: List[NewsItem] = []
    for raw in deduped:
        if len(news_items) >= 5:
            break
        
        # Early eligibility check before scoring or summarizing
        if not _is_news_eligible(raw, base_company, domain):
            continue
        
        tag, confidence = _score_relevance(
            raw, base_company, base_division, base_office, base_industry
        )
        summary = _summarise_article(raw, base_division, base_office, base_company, domain)
        
        # Only include items with valid summaries (empty string means filtered out)
        if not summary:
            continue
        
        news_items.append(
            NewsItem(
                title=raw.get("title", ""),
                url=raw.get("link", ""),
                source=raw.get("source", ""),
                published_at=_normalise_iso(raw.get("date")),
                summary=summary,
                relevance_tag=tag,
                confidence=confidence,
            )
        )

    industry_summary = _generate_industry_overview(
        base_industry or base_company or "the industry", 
        news_items,
        base_company,
        domain
    )

    return news_items, industry_summary


def fetch_comprehensive_research(
    company: str,
    industry: str,
    job_title: str,
    first_name: str,
    last_name: str,
    division: str = "",
    office: str = "",
    time_window: str = "last 90 days",
    geo: str = "us",
    language: str = "en",
) -> dict:
    """
    Run comprehensive research. Primary: single Perplexity deep_research call
    (replaces 4 parallel SerpAPI calls). Fallback: SerpAPI.
    """
    import concurrent.futures

    results = {
        "company_news":     [],
        "company_overview": [],
        "person_mentions":  [],
        "industry_trends":  [],
    }

    # ── PRIMARY: Perplexity deep_research (one call replaces all 4 SerpAPI calls) ──
    try:
        from app.services.perplexity_client import deep_research

        query_parts = []
        if company:
            query_parts.append(f'company "{company}"')
        if first_name and last_name:
            query_parts.append(f'person "{first_name} {last_name}"')
        if industry:
            query_parts.append(f"industry {industry}")
        if job_title:
            query_parts.append(f"role {job_title}")
        if division:
            query_parts.append(f"division {division}")

        query = (
            "Comprehensive research for a coffee chat: "
            + ", ".join(query_parts)
            + ". Include: recent company news, company overview, any public mentions of the person, and industry trends."
        )

        result = deep_research(query)
        if result.get("content"):
            content = result["content"]
            citations = result.get("citations", [])

            def _extract_section(text: str, header: str, next_headers: list) -> str:
                """Extract text between header and next header."""
                import re as _re
                pattern = rf"(?:^|\n)#+\s*{_re.escape(header)}[^\n]*\n(.*?)(?=\n#+\s*(?:{'|'.join(_re.escape(h) for h in next_headers)})|$)"
                match = _re.search(pattern, text, _re.DOTALL | _re.IGNORECASE)
                return match.group(1).strip() if match else ""

            def _to_items(text: str, max_items: int = 5) -> list:
                """Convert text block into result dicts."""
                items = []
                for line in text.split("\n"):
                    line = line.strip().lstrip("- ").lstrip("* ")
                    if line and len(line) > 15:
                        items.append({
                            "title": line[:120],
                            "url": citations[len(items)] if len(items) < len(citations) else "",
                            "source": "Perplexity",
                            "snippet": line,
                            "date": "",
                        })
                    if len(items) >= max_items:
                        break
                return items

            # Try to extract structured sections; fall back to using full content
            sections = ["company news", "company overview", "person", "industry"]
            news_text = _extract_section(content, "company news", sections)
            overview_text = _extract_section(content, "company overview", sections)
            person_text = _extract_section(content, "person", sections)
            trends_text = _extract_section(content, "industry", sections)

            # If no structured sections found, put everything in company_news
            if not any([news_text, overview_text, person_text, trends_text]):
                results["company_news"] = _to_items(content, 5)
            else:
                results["company_news"] = _to_items(news_text, 5) if news_text else []
                results["company_overview"] = _to_items(overview_text, 3) if overview_text else []
                results["person_mentions"] = _to_items(person_text, 3) if person_text else []
                results["industry_trends"] = _to_items(trends_text, 3) if trends_text else []

            logger.info("Perplexity deep_research succeeded for comprehensive research")
            return results
    except Exception:
        logger.warning("Perplexity deep_research failed; SerpAPI fallback gated by ENABLE_SERPAPI_FALLBACK", exc_info=True)

    # SerpAPI fallback disabled by default. Set ENABLE_SERPAPI_FALLBACK=1 to re-enable.
    if not os.getenv("ENABLE_SERPAPI_FALLBACK"):
        return results

    # ── FALLBACK: existing SerpAPI code (kept until Phase 8) ────────────
    # DEPRECATED: remove in Phase 8
    if not SERPAPI_KEY:
        print("[SERP] SERPAPI_KEY missing; skipping research")
        return results

    current_year = datetime.now().year
    year_range = f"{current_year} {current_year + 1}"

    def safe_search(params):
        try:
            params["api_key"] = SERPAPI_KEY
            params.setdefault("hl", language or "en")
            params.setdefault("gl", geo or "us")
            search = GoogleSearch(params)
            data = search.get_dict()
            return data.get("organic_results", []) or data.get("news_results", []) or []
        except Exception as e:
            print(f"[SERP] Search failed: {e}")
            return []

    def to_result(r):
        source = r.get("source", "")
        if isinstance(source, dict):
            source = source.get("name", "")
        return {
            "title":   r.get("title", ""),
            "url":     r.get("link", ""),
            "source":  source,
            "snippet": r.get("snippet", ""),
            "date":    r.get("date", ""),
        }

    tbs_value = _default_time_window_to_serp(time_window)

    def _search_company_news():
        if not company:
            return []
        # Include division/office in query if provided for more targeted results
        query_parts = [f'"{company}"']
        if division:
            query_parts.append(division)
        if office:
            query_parts.append(office)
        query_parts.append(f"news {year_range}")
        raw = safe_search({
            "engine": "google", "q": " ".join(query_parts),
            "tbm": "nws", "num": 5, "tbs": tbs_value,
        })
        return [to_result(r) for r in raw[:5]]

    def _search_company_overview():
        if not company:
            return []
        raw = safe_search({
            "engine": "google",
            "q": f'"{company}" company overview {industry}',
            "num": 3,
        })
        return [to_result(r) for r in raw[:3]]

    def _search_person_mentions():
        if not (first_name and last_name):
            return []
        raw = safe_search({
            "engine": "google",
            "q": f'"{first_name} {last_name}" {company} interview OR article OR talk OR paper',
            "num": 3,
        })
        return [to_result(r) for r in raw[:3]]

    def _search_industry_trends():
        if not (industry or job_title):
            return []
        q = f'{industry or job_title} trends {year_range}'
        raw = safe_search({"engine": "google", "q": q, "tbm": "nws", "num": 3, "tbs": tbs_value})
        return [to_result(r) for r in raw[:3]]

    # Run all 4 SERP searches in parallel
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        f_news = executor.submit(_search_company_news)
        f_overview = executor.submit(_search_company_overview)
        f_person = executor.submit(_search_person_mentions)
        f_trends = executor.submit(_search_industry_trends)

        results["company_news"] = f_news.result()
        results["company_overview"] = f_overview.result()
        results["person_mentions"] = f_person.result()
        results["industry_trends"] = f_trends.result()

    return results


def infer_hometown_from_education(education: Sequence[str], contact_data: Optional[Dict[str, Any]] = None) -> Optional[str]:
    """
    Extract hometown only if city/state explicitly appears in education or PDL location fields.
    Does not use AI research - only extracts explicitly stated locations.
    Returns empty string if confidence is low.
    """
    education = [e for e in education if e] if education else []
    
    # Pattern 1: Check education strings for explicit city/state patterns
    # Look for patterns like "High School, City, State" or "City High School, State"
    for edu_entry in education:
        if not isinstance(edu_entry, str):
            continue
        
        edu_text = edu_entry.strip()
        if not edu_text:
            continue
        
        # Pattern: "High School, City, State" or "High School - City, State"
        match = re.search(
            r'(?:High School|Secondary School|Prep)[,\-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)[,\s]+([A-Z]{2})\b',
            edu_text
        )
        if match:
            city, state = match.groups()
            hometown = f"{city}, {state}"
            print(f"[CoffeeChat] Found hometown in education: {hometown}")
            return hometown
        
        # Pattern: "City High School, State"
        match = re.search(
            r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+High School[,\s]+([A-Z]{2})\b',
            edu_text
        )
        if match:
            city, state = match.groups()
            hometown = f"{city}, {state}"
            print(f"[CoffeeChat] Found hometown in education: {hometown}")
            return hometown
        
        # Pattern: Generic "School/Academy, City, State"
        match = re.search(
            r'(?:School|Academy|Institute)[,\-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)[,\s]+([A-Z]{2})\b',
            edu_text
        )
        if match:
            city, state = match.groups()
            hometown = f"{city}, {state}"
            print(f"[CoffeeChat] Found hometown in education: {hometown}")
            return hometown
    
    # Pattern 2: Check PDL location fields if contact_data is provided
    if contact_data:
        city = contact_data.get("city") or contact_data.get("City") or ""
        state = contact_data.get("state") or contact_data.get("State") or ""

        # Only use location if both city and state are present and valid
        if city and state:
            city_clean = city.strip()
            state_clean = state.strip().upper()

            if (city_clean[0].isupper() if city_clean else False) and len(state_clean) == 2 and state_clean.isalpha():
                # High school mention = high confidence hometown
                has_high_school = any(
                    "high school" in str(e).lower() or "secondary school" in str(e).lower()
                    for e in education
                )

                if has_high_school:
                    hometown = f"{city_clean}, {state_clean}"
                    print(f"[CoffeeChat] Found hometown from location fields (high school match): {hometown}")
                    return hometown

                # No high school but PDL has location — still useful as a conversation hook
                hometown = f"{city_clean}, {state_clean}"
                print(f"[CoffeeChat] Using PDL location as hometown: {hometown}")
                return hometown

    # No explicit hometown found
    print(f"[CoffeeChat] No explicit hometown found in education or location fields")
    return ""


def build_similarity_payload(user_data: Dict[str, Any], contact_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Assemble a structured payload for OpenAI similarity prompts.
    """
    payload = {
        "user_data": user_data or {},
        "contact_data": contact_data or {},
    }
    return payload


def format_news_for_storage(items: Sequence[NewsItem]) -> List[Dict[str, Any]]:
    return [
        {
            "title": item.title,
            "url": item.url,
            "source": item.source,
            "published_at": item.published_at,
            "summary": item.summary,
            "relevance_tag": item.relevance_tag,
            "confidence": item.confidence,
        }
        for item in items
    ]


