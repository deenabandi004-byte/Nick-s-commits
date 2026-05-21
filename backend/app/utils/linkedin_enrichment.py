"""
LinkedIn profile enrichment utilities.

Two enrichment chains:

- Default (`prefer_scrape=False`): PDL → Bright Data - used for *contact lookups*
  where the target is an established professional (good PDL coverage).
- Self-enrichment (`prefer_scrape=True`): Jina → Bright Data → PDL - used for
  the *user's own* LinkedIn during onboarding/profile. Most users are college
  students with thin PDL records, so direct page scrapes via Jina yield far
  richer data (full work history, skills, projects, certifications) than PDL.

LLM enrichment layer structures raw data into resumeParsed format
(source-specific prompts: PDL / Bright Data / Jina markdown).
Merge logic combines LinkedIn data with existing resume data.
"""
import json
import logging
import os
import re
from typing import Optional

logger = logging.getLogger(__name__)

# ── resumeParsed schema definition ──────────────────────────────────────────

RESUME_PARSED_SCHEMA = {
    "name": str,
    "contact": {
        "email": Optional[str],
        "phone": Optional[str],
        "linkedin": Optional[str],
        "location": Optional[str],
    },
    "objective": Optional[str],
    "education": {
        "university": Optional[str],
        "degree": Optional[str],
        "major": Optional[str],
        "graduation": Optional[str],
        "gpa": Optional[str],
    },
    "experience": list,  # [{ title, company, dates, location, bullets }]
    "skills": {
        "technical": list,
        "tools": list,
        "soft_skills": list,
        "languages": list,
    },
    "projects": list,
    "extracurriculars": list,
    "certifications": list,
    "awards": list,
    "career_interests": list,
}

EMPTY_RESUME_PARSED = {
    "name": None,
    "contact": {"email": None, "phone": None, "linkedin": None, "location": None},
    "objective": None,
    "education": {"university": None, "degree": None, "major": None, "graduation": None, "gpa": None},
    "experience": [],
    "skills": {"technical": [], "tools": [], "soft_skills": [], "languages": []},
    "projects": [],
    "extracurriculars": [],
    "certifications": [],
    "awards": [],
    "career_interests": [],
}


# ── URL normalization ───────────────────────────────────────────────────────

def normalize_linkedin_url(url: str) -> str | None:
    """
    Normalize LinkedIn URL to standard format.
    Handles: trailing params, locale suffixes, mobile URLs, missing protocol.
    Returns normalized URL or None if invalid.
    """
    if not url:
        return None

    url = url.strip().rstrip('/')

    # Remove query params and fragments
    url = url.split('?')[0].split('#')[0]

    # Remove trailing locale paths like /en, /fr
    url = re.sub(r'/[a-z]{2}$', '', url)

    # Handle mobile URLs
    url = url.replace('://m.linkedin.com', '://www.linkedin.com')

    # Add protocol if missing
    if not url.startswith('http'):
        if url.startswith('linkedin.com') or url.startswith('www.linkedin.com'):
            url = 'https://' + url
        else:
            # Might be just a slug
            url = f'https://www.linkedin.com/in/{url}'

    # Extract slug and rebuild canonical URL
    pattern = r'https?://(?:www\.)?linkedin\.com/in/([\w-]+)'
    match = re.match(pattern, url)
    if match:
        slug = match.group(1)
        return f'https://www.linkedin.com/in/{slug}'

    return None


# ── Enrichment tier helpers ─────────────────────────────────────────────────

def fetch_linkedin_jina(linkedin_url: str) -> dict | None:  # DEPRECATED: remove in Phase 8
    """
    Fetch a public LinkedIn profile page via Jina Reader.
    Returns a wrapper dict { "markdown": str, "url": str } or None.
    Jina returns a markdown rendering of the page; LLM structures it downstream.
    """
    try:
        import requests
    except Exception as e:
        logger.warning(f"[Jina] requests library unavailable: {e}")
        return None

    jina_url = f"https://r.jina.ai/{linkedin_url}"
    headers = {}
    api_key = os.getenv("JINA_API_KEY")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        response = requests.get(jina_url, headers=headers, timeout=20)
    except Exception as e:
        logger.warning(f"[Jina] HTTP exception for {linkedin_url}: {e}")
        return None

    if response.status_code != 200:
        logger.warning(f"[Jina] HTTP {response.status_code} for {linkedin_url}")
        return None

    content = response.text or ""
    if len(content) < 200:
        logger.warning(f"[Jina] Empty / too-short response for {linkedin_url}")
        return None

    # Cap to avoid token blowups when the LLM structures it
    if len(content) > 25000:
        content = content[:25000] + "\n... [truncated]"

    return {"markdown": content, "url": linkedin_url}


def fetch_linkedin_firecrawl(linkedin_url: str) -> dict | None:
    """Scrape LinkedIn profile via Firecrawl (replaces Jina)."""
    try:
        from app.services.firecrawl_client import scrape_linkedin_profile
        return scrape_linkedin_profile(linkedin_url)
    except Exception:
        logger.warning("Firecrawl LinkedIn scrape failed for %s", linkedin_url, exc_info=True)
        return None


def _try_pdl(url: str) -> tuple[dict | None, str]:
    try:
        try:
            from app.services.pdl_client import enrich_linkedin_profile
        except ImportError:
            from backend.app.services.pdl_client import enrich_linkedin_profile
        result = enrich_linkedin_profile(url)
        if result:
            logger.info(f"[Enrichment] PDL returned data for: {url}")
            return result, "pdl"
    except Exception as e:
        logger.warning(f"[Enrichment] PDL failed: {e}")
    return None, ""


def _try_brightdata(url: str) -> tuple[dict | None, str]:
    try:
        try:
            from app.services.bright_data_client import fetch_linkedin_profile_brightdata
        except ImportError:
            from backend.app.services.bright_data_client import fetch_linkedin_profile_brightdata
        result = fetch_linkedin_profile_brightdata(url)
        if result:
            logger.info(f"[Enrichment] Bright Data returned data for: {url}")
            return result, "brightdata"
    except Exception as e:
        logger.warning(f"[Enrichment] Bright Data failed: {e}")
    return None, ""


def _try_jina(url: str) -> tuple[dict | None, str]:  # DEPRECATED: remove in Phase 8
    try:
        result = fetch_linkedin_jina(url)
        if result:
            logger.info(f"[Enrichment] Jina returned data for: {url}")
            return result, "jina"
    except Exception as e:
        logger.warning(f"[Enrichment] Jina failed: {e}")
    return None, ""


def _try_firecrawl(url):
    """Try Firecrawl for LinkedIn profile extraction."""
    result = fetch_linkedin_firecrawl(url)
    if result:
        return result, "firecrawl"
    return None, "firecrawl_fail"


# ── Enrichment chain ────────────────────────────────────────────────────────

def get_enrichment_tiers(prefer_scrape: bool = False):
    """
    Return the ordered list of tier functions for LinkedIn enrichment.
    Each tier function takes a normalized URL and returns (raw_data, source).
    Exposed so callers can loop through and validate the LLM-structured output
    of each tier, falling through if a tier returns content the LLM can't parse
    (e.g. a LinkedIn login wall served to Jina).
    """
    if prefer_scrape:
        return [_try_firecrawl, _try_jina, _try_brightdata, _try_pdl]
    return [_try_pdl, _try_brightdata]


def enrich_linkedin_with_fallback(
    linkedin_url: str, prefer_scrape: bool = False
) -> tuple[dict | None, str]:
    """
    Try a tiered enrichment chain.

    prefer_scrape=False (default): PDL → Bright Data
        Use for contact lookups (the user is researching an established
        professional whose record PDL has rich coverage of).

    prefer_scrape=True: Jina → Bright Data → PDL
        Use for the user's own LinkedIn during onboarding/profile. Most users
        are college students whose PDL records are thin. Direct LinkedIn page
        scrapes (via Jina markdown rendering) yield richer education, work,
        skill, and project history. PDL is kept as a last resort.

    Returns (raw_data, source) or (None, "").
    """
    normalized = normalize_linkedin_url(linkedin_url)
    if not normalized:
        logger.warning(f"[Enrichment] Invalid LinkedIn URL: {linkedin_url}")
        return None, ""

    chain = (
        [_try_firecrawl, _try_jina, _try_brightdata, _try_pdl]
        if prefer_scrape
        else [_try_pdl, _try_brightdata]
    )

    for tier in chain:
        result, source = tier(normalized)
        if result:
            return result, source

    return None, ""


# ── PDL → resumeParsed converter ────────────────────────────────────────────

def convert_pdl_to_resume_parsed(pdl_data: dict) -> dict:
    """
    Convert PDL meeting_data (output of enrich_linkedin_profile) to resumeParsed format.
    PDL's enrich_linkedin_profile returns build_meeting_data() output, not raw PDL person.
    """
    result = json.loads(json.dumps(EMPTY_RESUME_PARSED))  # deep copy

    result["name"] = pdl_data.get("name", None)

    result["contact"] = {
        "email": pdl_data.get("email") or None,
        "phone": None,
        "linkedin": pdl_data.get("linkedin_url") or None,
        "location": pdl_data.get("location", {}).get("name") if isinstance(pdl_data.get("location"), dict) else pdl_data.get("location") or None,
    }

    # Education - PDL returns education as array
    edu_list = pdl_data.get("education", [])
    if edu_list and isinstance(edu_list, list) and len(edu_list) > 0:
        first_edu = edu_list[0]
        result["education"] = {
            "university": first_edu.get("school") or None,
            "degree": first_edu.get("degree") or None,
            "major": first_edu.get("major") or None,
            "graduation": first_edu.get("end_date") or None,
            "gpa": str(first_edu.get("gpa")) if first_edu.get("gpa") else None,
        }

    # Experience
    for exp in pdl_data.get("experience", []):
        start = exp.get("start_date", "")
        end = exp.get("end_date", "")
        dates = f"{start} - {end}" if start else ""
        if end == "" and start:
            dates = f"{start} - Present"

        result["experience"].append({
            "title": exp.get("title", ""),
            "company": exp.get("company", ""),
            "dates": dates,
            "location": ", ".join(exp.get("location_names", [])) if exp.get("location_names") else None,
            "bullets": [],
        })

    # Skills - PDL returns flat skills list
    for skill in pdl_data.get("skills", []):
        if isinstance(skill, str) and skill:
            result["skills"]["technical"].append(skill)

    # Certifications
    for cert in pdl_data.get("certifications", []):
        name = cert.get("name") if isinstance(cert, dict) else str(cert)
        if name:
            result["certifications"].append(name)

    # Career interests from PDL interests field
    for interest in pdl_data.get("interests", []):
        if isinstance(interest, str) and interest:
            result["career_interests"].append(interest)

    # Objective from industry/summary
    industry = pdl_data.get("industry") or ""
    current_title = pdl_data.get("current_title") or ""
    current_company = pdl_data.get("current_company") or ""
    if current_title and current_company:
        result["objective"] = f"{current_title} at {current_company}"
    elif industry:
        result["objective"] = f"Professional in {industry}"

    return result


# ── LLM enrichment ──────────────────────────────────────────────────────────

LLM_PROMPT_BRIGHTDATA = """You are a data extraction assistant. Given a LinkedIn profile scraped by Bright Data, extract structured data into the exact JSON schema below.

CRITICAL RULES:
1. Output ONLY valid JSON. No markdown, no preamble, no explanation.
2. Only include information explicitly present in the source data.
3. Copy company names, titles, and dates VERBATIM from the source.
4. ALWAYS leave "bullets": [] empty - NEVER write experience descriptions or bullet points.
5. For skills: extract technologies, tools, programming languages, and frameworks mentioned in activity posts, about section, and position/headline. You MAY infer commonly associated skills from the person's major or field of study (e.g., Finance major → Financial Modeling), but only well-established associations.
6. For career_interests: career_interests MUST be populated - infer from jobTitle, industry, education major, and company. For example: jobTitle=co-founder → entrepreneurship, industry=computer software → software engineering, major=data science → data science & analytics. Always return at least 1-2 career interests, never leave this array empty.
7. For objective: generate a one-line professional summary from the headline (position field) and about section. If neither exists, use null.
8. For extracurriculars: extract clubs, organizations, volunteer work mentioned in activity posts or about section.
9. If a field has no data, use null for strings or [] for arrays.
10. Languages come from the languages[] array in the source data.
11. Mine the activity[] array carefully - for students without formal experience, activity posts are the primary signal for skills, interests, and projects.

OUTPUT SCHEMA (follow exactly):
{
  "name": "string",
  "contact": {
    "email": null,
    "phone": null,
    "linkedin": "string or null",
    "location": "string or null"
  },
  "objective": "string or null",
  "education": {
    "university": "string or null",
    "degree": "string or null",
    "major": "string or null",
    "graduation": "string or null (end_year from education)",
    "gpa": null
  },
  "experience": [
    {
      "title": "string",
      "company": "string",
      "dates": "start_date - end_date",
      "location": "string or null",
      "bullets": []
    }
  ],
  "skills": {
    "technical": ["programming languages, frameworks, methodologies"],
    "tools": ["software tools, platforms, products"],
    "soft_skills": ["leadership, communication, etc"],
    "languages": ["spoken/written languages with proficiency"]
  },
  "projects": [],
  "extracurriculars": ["club or org names"],
  "certifications": ["cert names"],
  "awards": [],
  "career_interests": ["inferred career interests"]
}

SOURCE DATA (Bright Data LinkedIn scrape):
"""

LLM_PROMPT_JINA = """You are a data extraction assistant. The source below is a markdown-rendered scrape of a public LinkedIn profile page (via Jina Reader). Extract structured data into the exact JSON schema below.

CRITICAL RULES:
1. Output ONLY valid JSON. No markdown, no preamble, no explanation.
2. Only include information explicitly present in the source data.
3. Copy company names, titles, and dates VERBATIM from the source.
4. For experience bullets: include up to 3 bullets per role IF the source contains achievement / responsibility lines clearly under that role. If the rendered page only shows role titles without descriptions, leave bullets empty. Do NOT invent or paraphrase.
5. For skills: extract from the Skills section, About section, and clearly mentioned tech in roles. Categorize into technical/tools/soft_skills/languages.
6. For career_interests: career_interests MUST be populated - infer from headline, current title, industry, education major, and About section. Always return at least 1-2.
7. For objective: generate a one-line professional summary from the headline (the line under the name) and About section.
8. For extracurriculars: extract clubs, organizations, leadership roles, volunteer work mentioned anywhere on the page (Activities, Volunteer, About).
9. For projects: include items the user explicitly lists under Projects, with a one-line description if present.
10. For certifications: items under Licenses & Certifications.
11. If a field has no data, use null for strings or [] for arrays.

OUTPUT SCHEMA (follow exactly):
{
  "name": "string",
  "contact": {
    "email": "string or null",
    "phone": null,
    "linkedin": "string or null",
    "location": "string or null"
  },
  "objective": "string or null",
  "education": {
    "university": "string or null",
    "degree": "string or null",
    "major": "string or null",
    "graduation": "string or null",
    "gpa": "string or null"
  },
  "experience": [
    {
      "title": "string",
      "company": "string",
      "dates": "start_date - end_date",
      "location": "string or null",
      "bullets": []
    }
  ],
  "skills": {
    "technical": [],
    "tools": [],
    "soft_skills": [],
    "languages": []
  },
  "projects": [],
  "extracurriculars": [],
  "certifications": [],
  "awards": [],
  "career_interests": []
}

SOURCE DATA (Jina Reader markdown of the LinkedIn profile):
"""


LLM_PROMPT_PDL = """You are a data extraction assistant. Given a LinkedIn profile enriched by People Data Labs, extract structured data into the exact JSON schema below.

CRITICAL RULES:
1. Output ONLY valid JSON. No markdown, no preamble, no explanation.
2. Only include information explicitly present in the source data.
3. Copy company names, titles, and dates VERBATIM from the source.
4. ALWAYS leave "bullets": [] empty - NEVER write experience descriptions or bullet points.
5. Categorize skills into technical (languages, frameworks), tools (software, platforms), soft_skills, and languages (spoken).
6. For career_interests: career_interests MUST be populated - infer from jobTitle, industry, education major, and company. For example: jobTitle=co-founder → entrepreneurship, industry=computer software → software engineering, major=data science → data science & analytics. Always return at least 1-2 career interests, never leave this array empty.
7. For objective: generate a one-line professional summary from current title, company, and industry.
8. If a field has no data, use null for strings or [] for arrays.

OUTPUT SCHEMA (follow exactly):
{
  "name": "string",
  "contact": {
    "email": "string or null",
    "phone": null,
    "linkedin": "string or null",
    "location": "string or null"
  },
  "objective": "string or null",
  "education": {
    "university": "string or null",
    "degree": "string or null",
    "major": "string or null",
    "graduation": "string or null",
    "gpa": "string or null"
  },
  "experience": [
    {
      "title": "string",
      "company": "string",
      "dates": "start_date - end_date",
      "location": "string or null",
      "bullets": []
    }
  ],
  "skills": {
    "technical": [],
    "tools": [],
    "soft_skills": [],
    "languages": []
  },
  "projects": [],
  "extracurriculars": [],
  "certifications": [],
  "awards": [],
  "career_interests": []
}

SOURCE DATA (People Data Labs enrichment):
"""


def llm_enrich_profile(raw_data: dict, source: str) -> dict:
    """
    Use GPT-4o-mini to structure raw profile data into resumeParsed format.
    Source-specific prompts for PDL vs Bright Data.
    Returns resumeParsed dict or empty template on failure.
    """
    try:
        try:
            from app.services.openai_client import client as openai_client
        except ImportError:
            from backend.app.services.openai_client import client as openai_client

        if not openai_client:
            logger.error("[LLM Enrich] OpenAI client not available")
            return json.loads(json.dumps(EMPTY_RESUME_PARSED))

        # Select prompt based on source
        if source == "pdl":
            system_prompt = LLM_PROMPT_PDL
        elif source == "jina":
            system_prompt = LLM_PROMPT_JINA
        else:
            system_prompt = LLM_PROMPT_BRIGHTDATA

        # Build the source-data payload string
        if source == "jina":
            # Jina returns a markdown wrapper; pass the markdown directly so the LLM
            # reads it as page content rather than a JSON object.
            if isinstance(raw_data, dict):
                content_str = raw_data.get("markdown", "") or ""
            else:
                content_str = str(raw_data)
            if len(content_str) > 50000:
                content_str = content_str[:50000] + "\n... [truncated]"
        else:
            content_str = json.dumps(raw_data, default=str, ensure_ascii=False)
            if len(content_str) > 50000:
                # Truncate activity array if too large
                truncated = dict(raw_data) if isinstance(raw_data, dict) else {}
                if 'activity' in truncated and isinstance(truncated['activity'], list):
                    truncated['activity'] = truncated['activity'][:10]
                content_str = json.dumps(truncated, default=str, ensure_ascii=False)

        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt + content_str},
            ],
            temperature=0.0,
            max_tokens=4000,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content.strip()
        parsed = json.loads(content)

        # Validate required structure
        validated = _validate_resume_parsed(parsed)
        logger.info(f"[LLM Enrich] Successfully structured profile: {validated.get('name', 'unknown')}")
        return validated

    except json.JSONDecodeError as e:
        logger.error(f"[LLM Enrich] Failed to parse LLM JSON output: {e}")
        return json.loads(json.dumps(EMPTY_RESUME_PARSED))
    except Exception as e:
        logger.error(f"[LLM Enrich] Error: {e}")
        return json.loads(json.dumps(EMPTY_RESUME_PARSED))


def _clean_null(val):
    """Convert string 'null'/'None' to actual None."""
    if val is None:
        return None
    if isinstance(val, str) and val.strip().lower() in ('null', 'none', ''):
        return None
    return val


def _validate_resume_parsed(data: dict) -> dict:
    """
    Validate and normalize LLM output to match resumeParsed schema.
    Fills missing fields with defaults, enforces types.
    """
    result = json.loads(json.dumps(EMPTY_RESUME_PARSED))  # deep copy

    result["name"] = _clean_null(data.get("name"))

    # Contact
    contact = data.get("contact", {})
    if isinstance(contact, dict):
        result["contact"] = {
            "email": _clean_null(contact.get("email")),
            "phone": _clean_null(contact.get("phone")),
            "linkedin": _clean_null(contact.get("linkedin")),
            "location": _clean_null(contact.get("location")),
        }

    result["objective"] = _clean_null(data.get("objective"))

    # Education
    edu = data.get("education", {})
    if isinstance(edu, dict):
        result["education"] = {
            "university": _clean_null(edu.get("university")),
            "degree": _clean_null(edu.get("degree")),
            "major": _clean_null(edu.get("major")),
            "graduation": _clean_null(edu.get("graduation")),
            "gpa": _clean_null(edu.get("gpa")),
        }

    # Experience - enforce bullets is always empty
    for exp in data.get("experience", []):
        if isinstance(exp, dict):
            result["experience"].append({
                "title": exp.get("title", ""),
                "company": exp.get("company", ""),
                "dates": exp.get("dates", ""),
                "location": exp.get("location") or None,
                "bullets": [],  # ALWAYS empty
            })

    # Skills
    skills = data.get("skills", {})
    if isinstance(skills, dict):
        for key in ["technical", "tools", "soft_skills", "languages"]:
            val = skills.get(key, [])
            if isinstance(val, list):
                result["skills"][key] = [s for s in val if isinstance(s, str) and s]

    # Simple list fields
    for field in ["projects", "extracurriculars", "certifications", "awards", "career_interests"]:
        val = data.get(field, [])
        if isinstance(val, list):
            result[field] = [item for item in val if item]

    return result


# ── Merge logic ─────────────────────────────────────────────────────────────

def merge_linkedin_into_resume_parsed(existing: dict, linkedin: dict) -> dict:
    """
    Merge LinkedIn enrichment data into existing resumeParsed.
    Resume is primary - LinkedIn only fills gaps.

    Rules:
    - experience, projects, education, gpa → keep existing, ignore linkedin
    - skills → union all skill lists, deduplicate
    - extracurriculars → union, deduplicate
    - certifications → union, deduplicate
    - objective → use linkedin value if existing has none
    - career_interests → always use linkedin value (resume never produces this)
    """
    result = json.loads(json.dumps(existing))  # deep copy

    # Never overwrite: experience, projects, education, gpa
    # These come from the resume which has richer data

    # Objective: use linkedin if existing is empty
    if not result.get("objective") and linkedin.get("objective"):
        result["objective"] = linkedin["objective"]

    # Skills: union
    existing_skills = result.get("skills", {})
    linkedin_skills = linkedin.get("skills", {})
    for key in ["technical", "tools", "soft_skills", "languages"]:
        existing_list = existing_skills.get(key, [])
        linkedin_list = linkedin_skills.get(key, [])
        # Case-insensitive dedup
        seen = {s.lower() for s in existing_list}
        for s in linkedin_list:
            if s.lower() not in seen:
                existing_list.append(s)
                seen.add(s.lower())
        if "skills" not in result:
            result["skills"] = {}
        result["skills"][key] = existing_list

    # Extracurriculars: union
    existing_ec = result.get("extracurriculars", [])
    linkedin_ec = linkedin.get("extracurriculars", [])
    seen_ec = {s.lower() for s in existing_ec if isinstance(s, str)}
    for ec in linkedin_ec:
        if isinstance(ec, str) and ec.lower() not in seen_ec:
            existing_ec.append(ec)
            seen_ec.add(ec.lower())
    result["extracurriculars"] = existing_ec

    # Certifications: union
    existing_certs = result.get("certifications", [])
    linkedin_certs = linkedin.get("certifications", [])
    seen_certs = {s.lower() for s in existing_certs if isinstance(s, str)}
    for cert in linkedin_certs:
        if isinstance(cert, str) and cert.lower() not in seen_certs:
            existing_certs.append(cert)
            seen_certs.add(cert.lower())
    result["certifications"] = existing_certs

    # Career interests: always use linkedin (resume doesn't produce this)
    if linkedin.get("career_interests"):
        result["career_interests"] = linkedin["career_interests"]

    # Contact: fill gaps only
    existing_contact = result.get("contact", {})
    linkedin_contact = linkedin.get("contact", {})
    for key in ["email", "phone", "linkedin", "location"]:
        if not existing_contact.get(key) and linkedin_contact.get(key):
            existing_contact[key] = linkedin_contact[key]
    result["contact"] = existing_contact

    return result
