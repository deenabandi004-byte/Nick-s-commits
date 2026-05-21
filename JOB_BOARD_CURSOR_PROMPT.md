# Job Board Feature - Complete Cursor Implementation Guide

## Overview

This guide implements a complete Job Board feature for Offerloop with:
- **Tab 1: Jobs/Internships** - Real job listings from SerpAPI Google Jobs, filtered by user's onboarding preferences
- **Tab 2: Job Optimization** - ATS resume optimization and personalized cover letter generation
- **Firestore Caching** - 6-hour cache to reduce API calls and costs

---

## Table of Contents

1. [File Structure](#1-file-structure)
2. [Backend: job_board.py](#2-backend-job_boardpy)
3. [Frontend: JobBoardPage.tsx](#3-frontend-jobboardpagetsx)
4. [API Service Updates](#4-api-service-updates)
5. [Navigation Updates](#5-navigation-updates)
6. [Route Configuration](#6-route-configuration)
7. [Environment Variables](#7-environment-variables)
8. [Testing](#8-testing)

---

## 1. File Structure

```
After implementation, you'll have:

connect-grow-hire/
├── src/
│   ├── pages/
│   │   └── JobBoardPage.tsx          # NEW - Main job board page
│   ├── components/
│   │   └── AppSidebar.tsx            # UPDATE - Add navigation item
│   ├── services/
│   │   └── api.ts                    # UPDATE - Add job board methods
│   └── App.tsx                       # UPDATE - Add route

backend/
├── app/
│   └── routes/
│       └── job_board.py              # NEW - Job board API endpoints
└── wsgi.py                           # UPDATE - Register blueprint
```

---

## 2. Backend: job_board.py

**Create file:** `backend/app/routes/job_board.py`

```python
"""
Job Board API endpoints - job listings, resume optimization, and cover letter generation.
Uses SerpAPI Google Jobs for real job listings with Firestore caching.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from flask import Blueprint, jsonify, request
import requests
from bs4 import BeautifulSoup

from app.extensions import require_firebase_auth
from app.services.firebase import db, get_user_data, update_user_credits
from app.services.openai_client import openai_client

job_board_bp = Blueprint("job_board", __name__)


# =============================================================================
# CONSTANTS
# =============================================================================

OPTIMIZATION_CREDIT_COST = 20
COVER_LETTER_CREDIT_COST = 15
CACHE_DURATION_HOURS = 6  # How long to cache job results

# SerpAPI Configuration
SERPAPI_KEY = os.getenv("SERPAPI_KEY") or os.getenv("SERP_API_KEY")


# =============================================================================
# FIRESTORE CACHING
# =============================================================================

def get_cache_key(query: str, location: str, job_type: Optional[str] = None) -> str:
    """
    Generate a unique cache key for a job search query.
    """
    cache_string = f"{query.lower().strip()}|{location.lower().strip()}|{job_type or 'all'}"
    return hashlib.md5(cache_string.encode()).hexdigest()


def get_cached_jobs(cache_key: str) -> Optional[List[Dict[str, Any]]]:
    """
    Retrieve cached job results from Firestore if not expired.
    
    Returns:
        List of jobs if cache hit and not expired, None otherwise
    """
    try:
        cache_ref = db.collection("job_cache").document(cache_key)
        cache_doc = cache_ref.get()
        
        if not cache_doc.exists:
            print(f"[JobBoard Cache] Miss - no cache for key {cache_key[:8]}...")
            return None
        
        cache_data = cache_doc.to_dict()
        cached_at = cache_data.get("cached_at")
        
        if not cached_at:
            return None
        
        # Check if cache is expired
        if isinstance(cached_at, datetime):
            cache_time = cached_at
        else:
            cache_time = cached_at.replace(tzinfo=None) if hasattr(cached_at, 'replace') else datetime.fromisoformat(str(cached_at))
        
        expiry_time = cache_time + timedelta(hours=CACHE_DURATION_HOURS)
        
        if datetime.utcnow() > expiry_time:
            print(f"[JobBoard Cache] Expired - key {cache_key[:8]}... cached at {cache_time}")
            return None
        
        jobs = cache_data.get("jobs", [])
        print(f"[JobBoard Cache] Hit - returning {len(jobs)} cached jobs for key {cache_key[:8]}...")
        return jobs
        
    except Exception as e:
        print(f"[JobBoard Cache] Error reading cache: {e}")
        return None


def set_cached_jobs(
    cache_key: str, 
    jobs: List[Dict[str, Any]], 
    query: str, 
    location: str,
    job_type: Optional[str] = None
) -> None:
    """
    Store job results in Firestore cache.
    """
    try:
        cache_ref = db.collection("job_cache").document(cache_key)
        cache_ref.set({
            "jobs": jobs,
            "query": query,
            "location": location,
            "job_type": job_type,
            "cached_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(hours=CACHE_DURATION_HOURS),
            "result_count": len(jobs),
        })
        print(f"[JobBoard Cache] Stored {len(jobs)} jobs for key {cache_key[:8]}...")
        
    except Exception as e:
        print(f"[JobBoard Cache] Error writing cache: {e}")


def clear_expired_cache() -> int:
    """
    Clean up expired cache entries. Call periodically or via cron.
    Returns number of deleted entries.
    """
    try:
        expired_docs = db.collection("job_cache").where(
            "expires_at", "<", datetime.utcnow()
        ).limit(100).get()
        
        deleted = 0
        for doc in expired_docs:
            doc.reference.delete()
            deleted += 1
        
        if deleted > 0:
            print(f"[JobBoard Cache] Cleaned up {deleted} expired entries")
        
        return deleted
        
    except Exception as e:
        print(f"[JobBoard Cache] Error clearing expired cache: {e}")
        return 0


# =============================================================================
# SERPAPI GOOGLE JOBS INTEGRATION
# =============================================================================

def fetch_jobs_from_serpapi(
    query: str,
    location: str = "United States",
    job_type: Optional[str] = None,
    num_results: int = 20,
    use_cache: bool = True,
) -> List[Dict[str, Any]]:
    """
    Fetch job listings from SerpAPI Google Jobs with Firestore caching.
    
    Args:
        query: Job search query (e.g., "Software Engineer Intern")
        location: Location to search (e.g., "San Francisco, CA")
        job_type: Optional filter - "Internship", "Full-Time", "Part-Time", "Contract"
        num_results: Number of results to fetch
        use_cache: Whether to use Firestore cache
    
    Returns:
        List of job dictionaries
    """
    # Check cache first
    if use_cache:
        cache_key = get_cache_key(query, location, job_type)
        cached_jobs = get_cached_jobs(cache_key)
        if cached_jobs is not None:
            return cached_jobs
    
    if not SERPAPI_KEY:
        print("[JobBoard] WARNING: SERPAPI_KEY not found, using mock data")
        return []
    
    try:
        url = "https://serpapi.com/search"
        
        params = {
            "engine": "google_jobs",
            "q": query,
            "location": location,
            "api_key": SERPAPI_KEY,
            "hl": "en",
            "num": min(num_results, 100),
        }
        
        # Add job type filter if specified
        if job_type:
            type_mapping = {
                "Internship": "INTERN",
                "Full-Time": "FULLTIME", 
                "Part-Time": "PARTTIME",
                "Contract": "CONTRACTOR",
            }
            if job_type in type_mapping:
                params["chips"] = f"employment_type:{type_mapping[job_type]}"
        
        print(f"[JobBoard] Fetching jobs from SerpAPI: {query} in {location}")
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        
        if "error" in data:
            print(f"[JobBoard] SerpAPI error: {data['error']}")
            return []
        
        jobs_results = data.get("jobs_results", [])
        print(f"[JobBoard] Found {len(jobs_results)} jobs from SerpAPI")
        
        # Transform SerpAPI format to our format
        jobs = []
        for idx, job in enumerate(jobs_results):
            # Extract salary if available
            salary = None
            if job.get("detected_extensions", {}).get("salary"):
                salary = job["detected_extensions"]["salary"]
            elif job.get("extensions"):
                for ext in job["extensions"]:
                    if "$" in ext or "hour" in ext.lower() or "year" in ext.lower():
                        salary = ext
                        break
            
            # Determine job type
            detected_type = "Full-Time"
            extensions = job.get("extensions", [])
            extensions_str = " ".join(extensions).lower()
            if "intern" in extensions_str or "internship" in job.get("title", "").lower():
                detected_type = "Internship"
            elif "part-time" in extensions_str or "part time" in extensions_str:
                detected_type = "Part-Time"
            elif "contract" in extensions_str or "contractor" in extensions_str:
                detected_type = "Contract"
            
            # Check if remote
            is_remote = "remote" in extensions_str or "work from home" in extensions_str
            
            # Get posted time
            posted = "Recently"
            detected_extensions = job.get("detected_extensions", {})
            if detected_extensions.get("posted_at"):
                posted = detected_extensions["posted_at"]
            elif extensions:
                for ext in extensions:
                    if "ago" in ext.lower() or "day" in ext.lower() or "hour" in ext.lower():
                        posted = ext
                        break
            
            # Extract requirements from description highlights
            requirements = []
            highlights = job.get("job_highlights", [])
            for highlight in highlights:
                if highlight.get("title", "").lower() in ["qualifications", "requirements", "what you need"]:
                    requirements = highlight.get("items", [])[:5]
                    break
            
            # Get apply link
            apply_link = ""
            apply_options = job.get("apply_options", [])
            if apply_options:
                apply_link = apply_options[0].get("link", "")
            if not apply_link:
                related_links = job.get("related_links", [])
                if related_links:
                    apply_link = related_links[0].get("link", "")
            if not apply_link:
                apply_link = job.get("share_link", "")
            
            # Build job object
            transformed_job = {
                "id": job.get("job_id", f"serp_{idx}_{hash(job.get('title', ''))}"),
                "title": job.get("title", "Unknown Title"),
                "company": job.get("company_name", "Unknown Company"),
                "location": job.get("location", location),
                "salary": salary,
                "type": detected_type,
                "posted": posted,
                "description": job.get("description", "")[:2000],  # Limit description size for cache
                "requirements": requirements,
                "url": apply_link,
                "logo": job.get("thumbnail"),
                "remote": is_remote,
                "experienceLevel": "entry" if any(x in extensions_str for x in ["entry", "junior", "intern", "graduate"]) else "mid",
                "via": job.get("via", ""),
            }
            
            jobs.append(transformed_job)
        
        # Cache the results
        if use_cache and jobs:
            cache_key = get_cache_key(query, location, job_type)
            set_cached_jobs(cache_key, jobs, query, location, job_type)
        
        return jobs
        
    except requests.exceptions.RequestException as e:
        print(f"[JobBoard] SerpAPI request error: {e}")
        return []
    except Exception as e:
        print(f"[JobBoard] Error fetching jobs: {e}")
        return []


def build_search_query(
    job_types: List[str],
    industries: List[str],
    user_major: Optional[str] = None,
) -> str:
    """
    Build an optimized search query based on user preferences.
    """
    query_parts = []
    
    # Add job type
    if "Internship" in job_types:
        query_parts.append("internship")
    elif "Full-Time" in job_types:
        query_parts.append("entry level")
    
    # Add industries/interests
    if industries:
        top_industries = industries[:2]  # Focus on top 2
        
        industry_mapping = {
            "Technology": "software engineer OR product manager",
            "Finance": "financial analyst OR investment banking",
            "Consulting": "consultant OR strategy",
            "Healthcare": "healthcare OR medical",
            "Marketing": "marketing OR brand manager",
            "Engineering": "engineer",
            "Data Science": "data scientist OR machine learning",
            "Design": "UX designer OR product designer",
            "Sales": "sales OR business development",
            "Operations": "operations OR supply chain",
            "Accounting": "accountant OR audit",
            "Legal": "legal OR paralegal",
            "Human Resources": "HR OR recruiting",
            "Real Estate": "real estate OR property",
        }
        
        for industry in top_industries:
            if industry in industry_mapping:
                query_parts.append(industry_mapping[industry])
            else:
                query_parts.append(industry.lower())
    
    # Add major if no industries
    if not industries and user_major:
        query_parts.append(user_major.lower())
    
    # Default fallback
    if not query_parts:
        query_parts.append("entry level jobs")
    
    return " ".join(query_parts)


def build_location_query(locations: List[str]) -> str:
    """
    Build location string for SerpAPI.
    """
    if not locations:
        return "United States"
    
    primary_location = locations[0]
    
    if "remote" in primary_location.lower():
        return "United States"
    
    return primary_location


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def parse_job_url(url: str) -> Optional[Dict[str, Any]]:
    """
    Scrape job details from a URL.
    """
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, "html.parser")
        
        job_data = {
            "title": None,
            "company": None,
            "location": None,
            "description": None,
            "requirements": [],
        }
        
        # LinkedIn parsing
        if "linkedin.com" in url:
            title_elem = soup.find("h1", class_="top-card-layout__title")
            company_elem = soup.find("a", class_="topcard__org-name-link")
            location_elem = soup.find("span", class_="topcard__flavor--bullet")
            description_elem = soup.find("div", class_="description__text")
            
            job_data["title"] = title_elem.get_text(strip=True) if title_elem else None
            job_data["company"] = company_elem.get_text(strip=True) if company_elem else None
            job_data["location"] = location_elem.get_text(strip=True) if location_elem else None
            job_data["description"] = description_elem.get_text(strip=True) if description_elem else None
            
        # Indeed parsing
        elif "indeed.com" in url:
            title_elem = soup.find("h1", class_="jobsearch-JobInfoHeader-title")
            company_elem = soup.find("div", {"data-company-name": True})
            description_elem = soup.find("div", id="jobDescriptionText")
            
            job_data["title"] = title_elem.get_text(strip=True) if title_elem else None
            job_data["company"] = company_elem.get_text(strip=True) if company_elem else None
            job_data["description"] = description_elem.get_text(strip=True) if description_elem else None
            
        # Generic fallback
        else:
            for selector in ["h1", "[class*='title']", "[class*='job-title']"]:
                elem = soup.select_one(selector)
                if elem:
                    job_data["title"] = elem.get_text(strip=True)[:200]
                    break
                    
            for selector in ["[class*='company']", "[class*='employer']"]:
                elem = soup.select_one(selector)
                if elem:
                    job_data["company"] = elem.get_text(strip=True)[:100]
                    break
                    
            for selector in ["[class*='description']", "[class*='content']", "article"]:
                elem = soup.select_one(selector)
                if elem:
                    job_data["description"] = elem.get_text(strip=True)[:5000]
                    break
        
        return job_data if any(job_data.values()) else None
        
    except Exception as e:
        print(f"[JobBoard] Error parsing URL {url}: {e}")
        return None


def extract_keywords_from_job(description: str) -> List[str]:
    """
    Extract important keywords from a job description for ATS optimization.
    """
    skill_patterns = [
        r'\b(Python|Java|JavaScript|TypeScript|C\+\+|Go|Rust|Ruby|PHP|Swift|Kotlin|Scala)\b',
        r'\b(React|Angular|Vue|Node\.js|Django|Flask|Spring|Rails|Next\.js|Express)\b',
        r'\b(AWS|Azure|GCP|Docker|Kubernetes|CI/CD|DevOps|Terraform|Jenkins)\b',
        r'\b(SQL|PostgreSQL|MySQL|MongoDB|Redis|GraphQL|NoSQL|Elasticsearch)\b',
        r'\b(Machine Learning|AI|Deep Learning|NLP|Computer Vision|LLM|PyTorch|TensorFlow)\b',
        r'\b(Agile|Scrum|JIRA|Git|GitHub|GitLab|Confluence|Asana)\b',
        r'\b(Excel|PowerPoint|Tableau|Power BI|Salesforce|SAP|Oracle)\b',
        r'\b(Leadership|Communication|Problem.solving|Analytical|Teamwork|Collaboration)\b',
        r'\b(Financial Modeling|Valuation|DCF|LBO|M&A|Due Diligence|Bloomberg)\b',
        r'\b(Product Management|Roadmap|Stakeholder|Cross-functional|PRD|OKR)\b',
        r'\b(Figma|Sketch|Adobe|InDesign|Photoshop|Illustrator|UI|UX)\b',
    ]
    
    keywords = set()
    for pattern in skill_patterns:
        matches = re.findall(pattern, description, re.IGNORECASE)
        keywords.update([m.strip() for m in matches])
    
    return list(keywords)[:20]


async def optimize_resume_with_ai(
    user_resume: Dict[str, Any],
    job_description: str,
    job_title: str = "",
    company: str = "",
) -> Dict[str, Any]:
    """
    Use AI to optimize a resume for a specific job posting.
    """
    keywords = extract_keywords_from_job(job_description)
    
    prompt = f"""You are an expert resume optimizer and ATS (Applicant Tracking System) specialist.

TASK: Optimize the following resume to better match the job description while maintaining authenticity.

JOB DETAILS:
- Title: {job_title or 'Not specified'}
- Company: {company or 'Not specified'}
- Description: {job_description[:3000]}

KEY KEYWORDS TO INCORPORATE (naturally): {', '.join(keywords)}

CURRENT RESUME:
{json.dumps(user_resume, indent=2)}

INSTRUCTIONS:
1. Rewrite experience bullet points to better align with job requirements
2. Incorporate relevant keywords naturally (don't keyword stuff)
3. Highlight transferable skills that match the job
4. Improve action verbs and quantifiable achievements
5. Ensure proper formatting for ATS parsing
6. Keep all information truthful - only reframe existing experience

OUTPUT FORMAT (JSON):
{{
    "optimized_content": "Full optimized resume text with clear sections (Summary, Experience, Education, Skills)...",
    "ats_score": {{
        "overall": 85,
        "keywords": 80,
        "formatting": 90,
        "relevance": 85
    }},
    "keywords_added": ["keyword1", "keyword2"],
    "sections_optimized": ["Experience", "Skills"],
    "suggestions": ["Suggestion 1", "Suggestion 2"]
}}

Return ONLY valid JSON."""

    try:
        response = await openai_client.chat.completions.create(
            model="gpt-4-turbo-preview",
            messages=[
                {"role": "system", "content": "You are an expert resume optimizer. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=4000,
        )
        
        content = response.choices[0].message.content.strip()
        if content.startswith("```"):
            content = re.sub(r"```json?\n?", "", content)
            content = re.sub(r"\n?```", "", content)
        
        result = json.loads(content)
        return {
            "content": result.get("optimized_content", ""),
            "atsScore": {
                "overall": result.get("ats_score", {}).get("overall", 75),
                "keywords": result.get("ats_score", {}).get("keywords", 70),
                "formatting": result.get("ats_score", {}).get("formatting", 85),
                "relevance": result.get("ats_score", {}).get("relevance", 75),
                "suggestions": result.get("suggestions", []),
            },
            "keywordsAdded": result.get("keywords_added", []),
            "sectionsOptimized": result.get("sections_optimized", []),
        }
        
    except Exception as e:
        print(f"[JobBoard] AI optimization error: {e}")
        raise


async def generate_cover_letter_with_ai(
    user_resume: Dict[str, Any],
    job_description: str,
    job_title: str = "",
    company: str = "",
) -> Dict[str, Any]:
    """
    Generate a personalized cover letter using AI.
    """
    user_name = user_resume.get("name", "")
    user_experience = user_resume.get("experience", [])
    user_education = user_resume.get("education", {})
    user_skills = user_resume.get("skills", [])
    
    prompt = f"""You are an expert cover letter writer who creates compelling, personalized cover letters.

TASK: Write a professional cover letter for this job application.

APPLICANT INFO:
- Name: {user_name}
- Education: {json.dumps(user_education)}
- Experience: {json.dumps(user_experience[:3])}
- Key Skills: {', '.join(user_skills[:10]) if isinstance(user_skills, list) else user_skills}

JOB DETAILS:
- Title: {job_title or 'Not specified'}
- Company: {company or 'Not specified'}
- Description: {job_description[:2000]}

COVER LETTER REQUIREMENTS:
1. Professional but personable tone - suitable for a college student/new grad
2. 3-4 paragraphs max (keep it concise)
3. Highlight 2-3 specific achievements that match job requirements
4. Show genuine interest in the company/role
5. Strong opening hook and confident closing with call-to-action
6. Don't be generic - make it specific to this role and company

OUTPUT FORMAT (JSON):
{{
    "content": "Dear Hiring Manager,\\n\\n[Paragraph 1: Hook + why this role]\\n\\n[Paragraph 2: Relevant experience/achievements]\\n\\n[Paragraph 3: Why this company + enthusiasm]\\n\\n[Closing: Call to action]\\n\\nSincerely,\\n{user_name}",
    "highlights": ["Achievement 1 emphasized", "Skill 2 highlighted", "Experience 3 connected"],
    "tone": "Professional and enthusiastic"
}}

Return ONLY valid JSON."""

    try:
        response = await openai_client.chat.completions.create(
            model="gpt-4-turbo-preview",
            messages=[
                {"role": "system", "content": "You are an expert cover letter writer. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.8,
            max_tokens=2000,
        )
        
        content = response.choices[0].message.content.strip()
        if content.startswith("```"):
            content = re.sub(r"```json?\n?", "", content)
            content = re.sub(r"\n?```", "", content)
        
        result = json.loads(content)
        return {
            "content": result.get("content", ""),
            "highlights": result.get("highlights", []),
            "tone": result.get("tone", "Professional"),
        }
        
    except Exception as e:
        print(f"[JobBoard] Cover letter generation error: {e}")
        raise


# =============================================================================
# API ROUTES
# =============================================================================

@job_board_bp.route("/jobs", methods=["POST"])
@require_firebase_auth
def get_job_listings():
    """
    Get job listings based on user preferences using SerpAPI Google Jobs.
    Uses Firestore caching to reduce API calls.
    
    Request body:
    {
        "jobTypes": ["Internship", "Full-Time"],
        "industries": ["Technology", "Finance"],
        "locations": ["San Francisco, CA"],
        "refresh": false,
        "searchQuery": "optional direct search query"
    }
    """
    try:
        data = request.get_json(force=True, silent=True) or {}
        user_id = request.user_id
        
        job_types = data.get("jobTypes", ["Internship"])
        industries = data.get("industries", [])
        locations = data.get("locations", [])
        search_query = data.get("searchQuery", "")
        refresh = data.get("refresh", False)  # Force refresh bypasses cache
        
        # Get user data for additional context
        user_data = get_user_data(user_id)
        user_major = None
        if user_data:
            professional_info = user_data.get("professionalInfo", {})
            user_major = professional_info.get("fieldOfStudy") or professional_info.get("major")
        
        # Build search query
        if search_query:
            query = search_query
        else:
            query = build_search_query(job_types, industries, user_major)
        
        # Build location
        location = build_location_query(locations)
        
        # Determine primary job type for filtering
        primary_job_type = job_types[0] if job_types else None
        
        # Fetch jobs (with caching unless refresh requested)
        jobs = fetch_jobs_from_serpapi(
            query=query,
            location=location,
            job_type=primary_job_type,
            num_results=30,
            use_cache=not refresh,
        )
        
        # Fallback to mock data if needed
        if not jobs:
            print("[JobBoard] Falling back to mock data")
            jobs = get_mock_jobs(job_types, industries, locations)
            source = "demo"
        else:
            source = "serpapi"
        
        return jsonify({
            "jobs": jobs,
            "total": len(jobs),
            "source": source,
            "query": query,
            "location": location,
            "cached": source == "serpapi" and not refresh,
        }), 200
        
    except Exception as e:
        print(f"[JobBoard] Error fetching jobs: {e}")
        return jsonify({"error": str(e)}), 500


@job_board_bp.route("/search", methods=["POST"])
@require_firebase_auth
def search_jobs():
    """
    Direct job search with custom query.
    
    Request body:
    {
        "query": "software engineer intern",
        "location": "San Francisco, CA",
        "jobType": "Internship"
    }
    """
    try:
        data = request.get_json(force=True, silent=True) or {}
        
        query = data.get("query", "entry level jobs")
        location = data.get("location", "United States")
        job_type = data.get("jobType")
        
        jobs = fetch_jobs_from_serpapi(
            query=query,
            location=location,
            job_type=job_type,
            num_results=20,
        )
        
        return jsonify({
            "jobs": jobs,
            "total": len(jobs),
            "query": query,
            "location": location,
        }), 200
        
    except Exception as e:
        print(f"[JobBoard] Search error: {e}")
        return jsonify({"error": str(e)}), 500


@job_board_bp.route("/optimize-resume", methods=["POST"])
@require_firebase_auth
def optimize_resume():
    """
    Optimize user's resume for a specific job.
    Cost: 20 credits
    """
    try:
        data = request.get_json(force=True, silent=True) or {}
        user_id = request.user_id
        
        job_url = data.get("jobUrl")
        job_description = data.get("jobDescription", "")
        job_title = data.get("jobTitle", "")
        company = data.get("company", "")
        
        # Check credits
        user_data = get_user_data(user_id)
        if not user_data:
            return jsonify({"error": "User not found"}), 404
            
        current_credits = user_data.get("credits", 0)
        if current_credits < OPTIMIZATION_CREDIT_COST:
            return jsonify({
                "error": "Insufficient credits",
                "required": OPTIMIZATION_CREDIT_COST,
                "current": current_credits,
            }), 402
        
        # Get job details from URL if provided
        if job_url and not job_description:
            parsed_job = parse_job_url(job_url)
            if parsed_job:
                job_title = job_title or parsed_job.get("title", "")
                company = company or parsed_job.get("company", "")
                job_description = parsed_job.get("description", "")
        
        if not job_description:
            return jsonify({"error": "Job description is required. Please paste the job description or provide a valid URL."}), 400
        
        # Get user's resume
        user_resume = user_data.get("resumeParsed", {})
        if not user_resume:
            return jsonify({
                "error": "No resume found. Please upload your resume in Account Settings first."
            }), 400
        
        # Optimize resume
        optimized = asyncio.run(
            optimize_resume_with_ai(user_resume, job_description, job_title, company)
        )
        
        # Deduct credits
        update_user_credits(user_id, -OPTIMIZATION_CREDIT_COST)
        
        return jsonify({
            "optimizedResume": optimized,
            "creditsUsed": OPTIMIZATION_CREDIT_COST,
            "creditsRemaining": current_credits - OPTIMIZATION_CREDIT_COST,
        }), 200
        
    except Exception as e:
        print(f"[JobBoard] Resume optimization error: {e}")
        return jsonify({"error": str(e)}), 500


@job_board_bp.route("/generate-cover-letter", methods=["POST"])
@require_firebase_auth
def generate_cover_letter():
    """
    Generate a personalized cover letter for a job.
    Cost: 15 credits
    """
    try:
        data = request.get_json(force=True, silent=True) or {}
        user_id = request.user_id
        
        job_url = data.get("jobUrl")
        job_description = data.get("jobDescription", "")
        job_title = data.get("jobTitle", "")
        company = data.get("company", "")
        
        # Check credits
        user_data = get_user_data(user_id)
        if not user_data:
            return jsonify({"error": "User not found"}), 404
            
        current_credits = user_data.get("credits", 0)
        if current_credits < COVER_LETTER_CREDIT_COST:
            return jsonify({
                "error": "Insufficient credits",
                "required": COVER_LETTER_CREDIT_COST,
                "current": current_credits,
            }), 402
        
        # Get job details from URL if provided
        if job_url and not job_description:
            parsed_job = parse_job_url(job_url)
            if parsed_job:
                job_title = job_title or parsed_job.get("title", "")
                company = company or parsed_job.get("company", "")
                job_description = parsed_job.get("description", "")
        
        if not job_description:
            return jsonify({"error": "Job description is required. Please paste the job description or provide a valid URL."}), 400
        
        # Get user's resume
        user_resume = user_data.get("resumeParsed", {})
        if not user_resume:
            return jsonify({
                "error": "No resume found. Please upload your resume in Account Settings first."
            }), 400
        
        # Generate cover letter
        cover_letter = asyncio.run(
            generate_cover_letter_with_ai(user_resume, job_description, job_title, company)
        )
        
        # Deduct credits
        update_user_credits(user_id, -COVER_LETTER_CREDIT_COST)
        
        return jsonify({
            "coverLetter": cover_letter,
            "creditsUsed": COVER_LETTER_CREDIT_COST,
            "creditsRemaining": current_credits - COVER_LETTER_CREDIT_COST,
        }), 200
        
    except Exception as e:
        print(f"[JobBoard] Cover letter generation error: {e}")
        return jsonify({"error": str(e)}), 500


@job_board_bp.route("/parse-job-url", methods=["POST"])
@require_firebase_auth
def parse_job_url_endpoint():
    """
    Parse a job URL to extract job details.
    No credit cost - just URL parsing.
    """
    try:
        data = request.get_json(force=True, silent=True) or {}
        url = data.get("url", "")
        
        if not url:
            return jsonify({"error": "URL is required"}), 400
        
        try:
            parsed = urlparse(url)
            if not parsed.scheme or not parsed.netloc:
                return jsonify({"error": "Invalid URL format"}), 400
        except Exception:
            return jsonify({"error": "Invalid URL"}), 400
        
        job_data = parse_job_url(url)
        
        if not job_data:
            return jsonify({
                "error": "Could not parse job details from URL",
                "suggestion": "Please paste the job description manually"
            }), 400
        
        return jsonify({"job": job_data}), 200
        
    except Exception as e:
        print(f"[JobBoard] URL parsing error: {e}")
        return jsonify({"error": str(e)}), 500


@job_board_bp.route("/clear-cache", methods=["POST"])
@require_firebase_auth
def clear_cache():
    """
    Admin endpoint to clear expired cache entries.
    """
    try:
        deleted = clear_expired_cache()
        return jsonify({
            "message": f"Cleared {deleted} expired cache entries",
            "deleted": deleted,
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =============================================================================
# MOCK DATA FALLBACK
# =============================================================================

def get_mock_jobs(
    job_types: List[str],
    industries: List[str],
    locations: List[str],
) -> List[Dict[str, Any]]:
    """
    Fallback mock job listings when SerpAPI is unavailable.
    """
    all_jobs = [
        {
            "id": "mock_1",
            "title": "Software Engineering Intern",
            "company": "Google",
            "location": "Mountain View, CA",
            "salary": "$8,000/mo",
            "type": "Internship",
            "posted": "2 days ago",
            "description": "Join Google's engineering team for a summer internship focused on building scalable systems and innovative products that impact billions of users worldwide. You'll work with experienced engineers on real projects.",
            "requirements": ["Currently pursuing BS/MS in Computer Science", "Experience with Python, Java, or C++", "Strong problem-solving skills"],
            "url": "https://careers.google.com/jobs/",
            "remote": False,
            "experienceLevel": "entry",
        },
        {
            "id": "mock_2",
            "title": "Product Management Intern",
            "company": "Meta",
            "location": "Menlo Park, CA",
            "salary": "$9,000/mo",
            "type": "Internship",
            "posted": "1 week ago",
            "description": "Work alongside experienced PMs to ship products used by billions. You'll define strategy, work cross-functionally, and drive impact on Facebook, Instagram, or WhatsApp.",
            "requirements": ["MBA or BS/MS in relevant field", "Strong analytical skills", "Excellent communication"],
            "url": "https://www.metacareers.com/",
            "remote": True,
            "experienceLevel": "entry",
        },
        {
            "id": "mock_3",
            "title": "Investment Banking Analyst",
            "company": "Goldman Sachs",
            "location": "New York, NY",
            "salary": "$110,000/yr",
            "type": "Full-Time",
            "posted": "3 days ago",
            "description": "Join our Investment Banking Division to work on high-profile M&A, capital markets, and restructuring transactions for Fortune 500 clients.",
            "requirements": ["Bachelor's degree in Finance, Economics, or related", "Strong financial modeling skills", "Excellent attention to detail"],
            "url": "https://www.goldmansachs.com/careers/",
            "remote": False,
            "experienceLevel": "entry",
        },
        {
            "id": "mock_4",
            "title": "Data Science Intern",
            "company": "Netflix",
            "location": "Los Gatos, CA",
            "salary": "$8,500/mo",
            "type": "Internship",
            "posted": "4 days ago",
            "description": "Apply machine learning and statistical methods to personalization, content recommendations, and business analytics that shape what 200M+ members watch.",
            "requirements": ["Pursuing MS/PhD in Statistics, CS, or related", "Proficiency in Python and SQL", "Experience with ML frameworks"],
            "url": "https://jobs.netflix.com/",
            "remote": True,
            "experienceLevel": "entry",
        },
        {
            "id": "mock_5",
            "title": "Consulting Analyst",
            "company": "McKinsey & Company",
            "location": "Chicago, IL",
            "salary": "$95,000/yr",
            "type": "Full-Time",
            "posted": "2 weeks ago",
            "description": "Solve complex business problems for Fortune 500 clients across industries. Develop strategy, drive implementation, and create lasting impact.",
            "requirements": ["Outstanding academic record", "Strong analytical and problem-solving skills", "Leadership experience"],
            "url": "https://www.mckinsey.com/careers",
            "remote": False,
            "experienceLevel": "entry",
        },
    ]
    
    if job_types and "all" not in [t.lower() for t in job_types]:
        all_jobs = [j for j in all_jobs if j["type"] in job_types]
    
    return all_jobs
```

---

## 3. Frontend: JobBoardPage.tsx

**Create file:** `src/pages/JobBoardPage.tsx`

```tsx
import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Briefcase,
  Sparkles,
  MapPin,
  Building2,
  Clock,
  DollarSign,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Search,
  Upload,
  FileText,
  Wand2,
  CheckCircle2,
  Download,
  Copy,
  Link,
  Loader2,
  Target,
  Bookmark,
  BookmarkCheck,
  RefreshCw,
  X,
  Zap,
  FileCheck,
  PenTool,
} from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { PageHeaderActions } from "@/components/PageHeaderActions";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { apiService } from "@/services/api";
import { firebaseApi } from "../services/firebaseApi";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { CreditPill } from "@/components/credits";
import { cn } from "@/lib/utils";

// ============================================================================
// TYPES
// ============================================================================

interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  salary?: string;
  type: "Internship" | "Full-Time" | "Part-Time" | "Contract";
  posted: string;
  description: string;
  requirements: string[];
  url: string;
  logo?: string;
  remote?: boolean;
  experienceLevel?: string;
  via?: string;
}

interface UserPreferences {
  jobTypes: string[];
  industries: string[];
  locations: string[];
}

interface ATSScore {
  overall: number;
  keywords: number;
  formatting: number;
  relevance: number;
  suggestions: string[];
}

interface OptimizedResume {
  content: string;
  atsScore: ATSScore;
  keywordsAdded: string[];
  sectionsOptimized: string[];
}

interface CoverLetter {
  content: string;
  highlights: string[];
  tone: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const JOBS_PER_PAGE = 12;
const OPTIMIZATION_CREDIT_COST = 20;
const COVER_LETTER_CREDIT_COST = 15;

const JOB_TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "Internship", label: "Internship" },
  { value: "Full-Time", label: "Full-Time" },
  { value: "Part-Time", label: "Part-Time" },
  { value: "Contract", label: "Contract" },
];

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

const JobCard: React.FC<{
  job: Job;
  isSelected: boolean;
  isSaved: boolean;
  onSelect: () => void;
  onSave: () => void;
  onApply: () => void;
}> = ({ job, isSelected, isSaved, onSelect, onSave, onApply }) => (
  <GlassCard
    className={cn(
      "p-5 cursor-pointer transition-all duration-300 hover:scale-[1.02]",
      isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
    )}
    glow={isSelected}
  >
    <div className="flex items-start justify-between gap-4">
      <div className="flex-shrink-0">
        {job.logo ? (
          <img
            src={job.logo}
            alt={job.company}
            className="w-12 h-12 rounded-lg object-cover bg-muted"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-foreground truncate">{job.title}</h3>
            <p className="text-sm text-muted-foreground">{job.company}</p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onSave(); }}
            className="flex-shrink-0 p-1.5 rounded-full hover:bg-muted/50 transition-colors"
          >
            {isSaved ? (
              <BookmarkCheck className="w-5 h-5 text-primary" />
            ) : (
              <Bookmark className="w-5 h-5 text-muted-foreground" />
            )}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          <Badge variant="secondary" className="text-xs">
            <MapPin className="w-3 h-3 mr-1" />
            {job.location}
          </Badge>
          <Badge variant={job.type === "Internship" ? "default" : "outline"} className="text-xs">
            {job.type}
          </Badge>
          {job.remote && (
            <Badge variant="outline" className="text-xs text-green-600">Remote</Badge>
          )}
          {job.salary && (
            <Badge variant="outline" className="text-xs">
              <DollarSign className="w-3 h-3 mr-1" />
              {job.salary}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {job.posted}
          </span>
          {job.via && <span>{job.via}</span>}
        </div>
      </div>
    </div>

    <div className="flex gap-2 mt-4 pt-4 border-t border-border/50">
      <Button
        variant="outline"
        size="sm"
        className="flex-1"
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
      >
        <Sparkles className="w-4 h-4 mr-2" />
        Optimize
      </Button>
      <Button
        variant="gradient"
        size="sm"
        className="flex-1"
        onClick={(e) => { e.stopPropagation(); onApply(); }}
      >
        <ExternalLink className="w-4 h-4 mr-2" />
        Apply
      </Button>
    </div>
  </GlassCard>
);

const ATSScoreDisplay: React.FC<{ score: ATSScore }> = ({ score }) => {
  const getScoreColor = (value: number) => {
    if (value >= 80) return "text-green-500";
    if (value >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  const getProgressColor = (value: number) => {
    if (value >= 80) return "bg-green-500";
    if (value >= 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          ATS Score Analysis
        </h3>
        <div className={cn("text-3xl font-bold", getScoreColor(score.overall))}>
          {score.overall}%
        </div>
      </div>

      <div className="space-y-4">
        {[
          { label: "Keywords Match", value: score.keywords },
          { label: "Formatting", value: score.formatting },
          { label: "Job Relevance", value: score.relevance },
        ].map(({ label, value }) => (
          <div key={label}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">{label}</span>
              <span className={getScoreColor(value)}>{value}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", getProgressColor(value))}
                style={{ width: `${value}%` }}
              />
            </div>
          </div>
        ))}

        {score.suggestions.length > 0 && (
          <div className="mt-6 pt-4 border-t border-border/50">
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-500" />
              Improvement Suggestions
            </h4>
            <ul className="space-y-2">
              {score.suggestions.map((suggestion, idx) => (
                <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  {suggestion}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </GlassCard>
  );
};

const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-4">
      {icon}
    </div>
    <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
    <p className="text-muted-foreground max-w-md mb-6">{description}</p>
    {action}
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const JobBoardPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isLoading: authLoading, updateCredits } = useFirebaseAuth();

  // Tab State
  const [activeTab, setActiveTab] = useState<string>(searchParams.get("tab") || "jobs");

  // Jobs Tab State
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedJobType, setSelectedJobType] = useState("all");
  const [savedJobs, setSavedJobs] = useState<Set<string>>(new Set());
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);

  // Optimization Tab State
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobUrl, setJobUrl] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isGeneratingCoverLetter, setIsGeneratingCoverLetter] = useState(false);
  const [optimizedResume, setOptimizedResume] = useState<OptimizedResume | null>(null);
  const [coverLetter, setCoverLetter] = useState<CoverLetter | null>(null);
  const [showJobDetails, setShowJobDetails] = useState(false);

  // Fetch user preferences
  useEffect(() => {
    const fetchUserPreferences = async () => {
      if (!user?.uid) return;
      try {
        const professionalInfo = await firebaseApi.getProfessionalInfo(user.uid);
        if (professionalInfo) {
          setUserPreferences({
            jobTypes: professionalInfo.jobTypes || ["Internship"],
            industries: professionalInfo.targetIndustries || [],
            locations: professionalInfo.locationPreferences || [],
          });
        }
      } catch (error) {
        console.error("Error fetching user preferences:", error);
      }
    };
    fetchUserPreferences();
  }, [user?.uid]);

  // Fetch jobs
  useEffect(() => {
    const fetchJobs = async () => {
      if (!user?.uid) return;
      setLoadingJobs(true);
      try {
        const response = await apiService.getJobListings({
          jobTypes: userPreferences?.jobTypes || ["Internship"],
          industries: userPreferences?.industries || [],
          locations: userPreferences?.locations || [],
        });
        if (response.jobs) {
          setJobs(response.jobs);
        }
      } catch (error) {
        console.error("Error fetching jobs:", error);
        toast({
          title: "Error loading jobs",
          description: "Using demo data. Please try again later.",
          variant: "destructive",
        });
      } finally {
        setLoadingJobs(false);
      }
    };
    fetchJobs();
  }, [user?.uid, userPreferences]);

  // Load saved jobs from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("offerloop_saved_jobs");
    if (saved) setSavedJobs(new Set(JSON.parse(saved)));
  }, []);

  // Filter jobs
  const filteredJobs = jobs.filter((job) => {
    const matchesSearch = !searchQuery || 
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = selectedJobType === "all" || job.type === selectedJobType;
    return matchesSearch && matchesType;
  });

  // Pagination
  const totalPages = Math.ceil(filteredJobs.length / JOBS_PER_PAGE);
  const paginatedJobs = filteredJobs.slice(
    (currentPage - 1) * JOBS_PER_PAGE,
    currentPage * JOBS_PER_PAGE
  );

  // Handlers
  const handleSaveJob = useCallback((jobId: string) => {
    setSavedJobs((prev) => {
      const newSaved = new Set(prev);
      if (newSaved.has(jobId)) {
        newSaved.delete(jobId);
        toast({ title: "Job removed from saved" });
      } else {
        newSaved.add(jobId);
        toast({ title: "Job saved!" });
      }
      localStorage.setItem("offerloop_saved_jobs", JSON.stringify([...newSaved]));
      return newSaved;
    });
  }, []);

  const handleSelectJobForOptimization = useCallback((job: Job) => {
    setSelectedJob(job);
    setJobUrl(job.url);
    setJobDescription(job.description);
    setActiveTab("optimize");
    setOptimizedResume(null);
    setCoverLetter(null);
  }, []);

  const handleApplyToJob = useCallback((job: Job) => {
    window.open(job.url, "_blank", "noopener,noreferrer");
  }, []);

  const handleRefreshJobs = async () => {
    setLoadingJobs(true);
    try {
      const response = await apiService.getJobListings({
        jobTypes: userPreferences?.jobTypes || ["Internship"],
        industries: userPreferences?.industries || [],
        locations: userPreferences?.locations || [],
        refresh: true,
      });
      if (response.jobs) {
        setJobs(response.jobs);
        toast({ title: "Jobs refreshed!" });
      }
    } catch (error) {
      toast({ title: "Refresh Failed", variant: "destructive" });
    } finally {
      setLoadingJobs(false);
    }
  };

  const handleOptimizeResume = async () => {
    if (!user?.uid) return;
    if ((user?.credits ?? 0) < OPTIMIZATION_CREDIT_COST) {
      toast({ title: "Insufficient Credits", description: `You need ${OPTIMIZATION_CREDIT_COST} credits.`, variant: "destructive" });
      return;
    }
    if (!jobUrl && !jobDescription) {
      toast({ title: "Job Information Required", variant: "destructive" });
      return;
    }

    setIsOptimizing(true);
    try {
      const response = await apiService.optimizeResume({
        jobUrl: jobUrl || undefined,
        jobDescription: jobDescription || undefined,
        jobTitle: selectedJob?.title,
        company: selectedJob?.company,
        userId: user.uid,
      });
      if (response.optimizedResume) {
        setOptimizedResume(response.optimizedResume);
        await updateCredits(-OPTIMIZATION_CREDIT_COST);
        toast({ title: "Resume Optimized!", description: `ATS Score: ${response.optimizedResume.atsScore.overall}%` });
      }
    } catch (error: any) {
      toast({ title: "Optimization Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleGenerateCoverLetter = async () => {
    if (!user?.uid) return;
    if ((user?.credits ?? 0) < COVER_LETTER_CREDIT_COST) {
      toast({ title: "Insufficient Credits", description: `You need ${COVER_LETTER_CREDIT_COST} credits.`, variant: "destructive" });
      return;
    }
    if (!jobUrl && !jobDescription) {
      toast({ title: "Job Information Required", variant: "destructive" });
      return;
    }

    setIsGeneratingCoverLetter(true);
    try {
      const response = await apiService.generateCoverLetter({
        jobUrl: jobUrl || undefined,
        jobDescription: jobDescription || undefined,
        jobTitle: selectedJob?.title,
        company: selectedJob?.company,
        userId: user.uid,
      });
      if (response.coverLetter) {
        setCoverLetter(response.coverLetter);
        await updateCredits(-COVER_LETTER_CREDIT_COST);
        toast({ title: "Cover Letter Generated!" });
      }
    } catch (error: any) {
      toast({ title: "Generation Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsGeneratingCoverLetter(false);
    }
  };

  const handleCopyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${type} copied to clipboard!` });
  };

  const handleDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded!" });
  };

  // Update URL when tab changes
  useEffect(() => {
    setSearchParams({ tab: activeTab });
  }, [activeTab, setSearchParams]);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedJobType]);

  if (authLoading) return <LoadingSkeleton />;

  return (
    <SidebarProvider>
      <div className="flex h-screen bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="border-b border-border/50 bg-background/80 backdrop-blur-sm">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <div>
                  <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-primary" />
                    Job Board
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Discover opportunities and optimize your applications
                  </p>
                </div>
              </div>
              <PageHeaderActions />
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-7xl mx-auto p-6">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList className="grid w-full grid-cols-2 max-w-md">
                  <TabsTrigger value="jobs" className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4" />
                    {userPreferences?.jobTypes?.includes("Internship") ? "Internships" : "Jobs"}
                  </TabsTrigger>
                  <TabsTrigger value="optimize" className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Optimize
                  </TabsTrigger>
                </TabsList>

                {/* JOBS TAB */}
                <TabsContent value="jobs" className="space-y-6">
                  {/* Filters */}
                  <GlassCard className="p-4">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Search jobs, companies, locations..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      <Select value={selectedJobType} onValueChange={setSelectedJobType}>
                        <SelectTrigger className="w-full sm:w-40">
                          <SelectValue placeholder="Job Type" />
                        </SelectTrigger>
                        <SelectContent>
                          {JOB_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" onClick={handleRefreshJobs} disabled={loadingJobs}>
                              <RefreshCw className={cn("w-4 h-4", loadingJobs && "animate-spin")} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Refresh jobs</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </GlassCard>

                  {/* Jobs Grid */}
                  {loadingJobs ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[...Array(6)].map((_, i) => (
                        <GlassCard key={i} className="p-5 animate-pulse">
                          <div className="flex gap-4">
                            <div className="w-12 h-12 bg-muted rounded-lg" />
                            <div className="flex-1 space-y-2">
                              <div className="h-4 bg-muted rounded w-3/4" />
                              <div className="h-3 bg-muted rounded w-1/2" />
                            </div>
                          </div>
                        </GlassCard>
                      ))}
                    </div>
                  ) : filteredJobs.length === 0 ? (
                    <EmptyState
                      icon={<Briefcase className="w-8 h-8 text-primary" />}
                      title="No jobs found"
                      description="Try adjusting your filters or search query."
                      action={
                        <Button variant="gradient" onClick={() => { setSearchQuery(""); setSelectedJobType("all"); }}>
                          Clear Filters
                        </Button>
                      }
                    />
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Showing {(currentPage - 1) * JOBS_PER_PAGE + 1}-
                        {Math.min(currentPage * JOBS_PER_PAGE, filteredJobs.length)} of {filteredJobs.length} jobs
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {paginatedJobs.map((job) => (
                          <JobCard
                            key={job.id}
                            job={job}
                            isSelected={selectedJob?.id === job.id}
                            isSaved={savedJobs.has(job.id)}
                            onSelect={() => handleSelectJobForOptimization(job)}
                            onSave={() => handleSaveJob(job.id)}
                            onApply={() => handleApplyToJob(job)}
                          />
                        ))}
                      </div>

                      {/* Pagination */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 pt-6">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <span className="text-sm text-muted-foreground">
                            Page {currentPage} of {totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>

                {/* OPTIMIZE TAB */}
                <TabsContent value="optimize" className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left: Input */}
                    <div className="space-y-6">
                      <GlassCard className="p-6">
                        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                          <FileText className="w-5 h-5 text-primary" />
                          Job Information
                        </h2>

                        {selectedJob && (
                          <div className="mb-4 p-4 rounded-lg bg-primary/10 border border-primary/20">
                            <div className="flex items-start justify-between">
                              <div>
                                <h3 className="font-medium">{selectedJob.title}</h3>
                                <p className="text-sm text-muted-foreground">
                                  {selectedJob.company} • {selectedJob.location}
                                </p>
                              </div>
                              <Button variant="ghost" size="sm" onClick={() => { setSelectedJob(null); setJobUrl(""); setJobDescription(""); }}>
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        )}

                        <div className="space-y-4">
                          <div>
                            <label className="text-sm font-medium mb-2 block">Job Posting URL</label>
                            <div className="relative">
                              <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input
                                placeholder="https://linkedin.com/jobs/..."
                                value={jobUrl}
                                onChange={(e) => setJobUrl(e.target.value)}
                                className="pl-10"
                              />
                            </div>
                          </div>

                          <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                              <span className="w-full border-t" />
                            </div>
                            <div className="relative flex justify-center text-xs">
                              <span className="bg-background px-2 text-muted-foreground">or paste job description</span>
                            </div>
                          </div>

                          <div>
                            <label className="text-sm font-medium mb-2 block">Job Description</label>
                            <Textarea
                              placeholder="Paste the job description here..."
                              value={jobDescription}
                              onChange={(e) => setJobDescription(e.target.value)}
                              rows={6}
                            />
                          </div>
                        </div>

                        <div className="mt-6 pt-4 border-t flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Your Credits</span>
                          <CreditPill credits={user?.credits ?? 0} maxCredits={user?.maxCredits ?? 300} />
                        </div>
                      </GlassCard>

                      {/* Action Buttons */}
                      <div className="grid grid-cols-2 gap-4">
                        <Button
                          variant="gradient"
                          size="lg"
                          onClick={handleOptimizeResume}
                          disabled={isOptimizing || (!jobUrl && !jobDescription)}
                        >
                          {isOptimizing ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Optimizing...</>
                          ) : (
                            <><FileCheck className="w-4 h-4 mr-2" />Optimize Resume<Badge variant="secondary" className="ml-2">{OPTIMIZATION_CREDIT_COST}</Badge></>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="lg"
                          onClick={handleGenerateCoverLetter}
                          disabled={isGeneratingCoverLetter || (!jobUrl && !jobDescription)}
                        >
                          {isGeneratingCoverLetter ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating...</>
                          ) : (
                            <><PenTool className="w-4 h-4 mr-2" />Cover Letter<Badge variant="secondary" className="ml-2">{COVER_LETTER_CREDIT_COST}</Badge></>
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Right: Results */}
                    <div className="space-y-6">
                      {!optimizedResume && !coverLetter && (
                        <EmptyState
                          icon={<Wand2 className="w-8 h-8 text-primary" />}
                          title="Ready to optimize"
                          description="Select a job or paste a description to get your ATS-optimized resume and cover letter."
                        />
                      )}

                      {optimizedResume && <ATSScoreDisplay score={optimizedResume.atsScore} />}

                      {optimizedResume && (
                        <GlassCard className="p-6">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                              <FileCheck className="w-5 h-5 text-green-500" />
                              Optimized Resume
                            </h3>
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm" onClick={() => handleCopyToClipboard(optimizedResume.content, "Resume")}>
                                <Copy className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDownload(optimizedResume.content, "optimized-resume.txt")}>
                                <Download className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                          {optimizedResume.keywordsAdded.length > 0 && (
                            <div className="mb-4">
                              <p className="text-sm text-muted-foreground mb-2">Keywords added:</p>
                              <div className="flex flex-wrap gap-2">
                                {optimizedResume.keywordsAdded.map((kw, i) => (
                                  <Badge key={i} variant="outline">+ {kw}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="bg-muted/50 rounded-lg p-4 max-h-64 overflow-y-auto">
                            <pre className="text-sm whitespace-pre-wrap font-mono">{optimizedResume.content}</pre>
                          </div>
                        </GlassCard>
                      )}

                      {coverLetter && (
                        <GlassCard className="p-6">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                              <PenTool className="w-5 h-5 text-primary" />
                              Cover Letter
                            </h3>
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm" onClick={() => handleCopyToClipboard(coverLetter.content, "Cover letter")}>
                                <Copy className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDownload(coverLetter.content, "cover-letter.txt")}>
                                <Download className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                          {coverLetter.highlights.length > 0 && (
                            <div className="mb-4">
                              <p className="text-sm text-muted-foreground mb-2">Key highlights:</p>
                              <div className="flex flex-wrap gap-2">
                                {coverLetter.highlights.map((h, i) => (
                                  <Badge key={i} variant="secondary">{h}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="bg-muted/50 rounded-lg p-4 max-h-64 overflow-y-auto">
                            <p className="text-sm whitespace-pre-wrap">{coverLetter.content}</p>
                          </div>
                        </GlassCard>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </div>

      {/* Job Details Dialog */}
      <Dialog open={showJobDetails} onOpenChange={setShowJobDetails}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedJob?.title}</DialogTitle>
            <DialogDescription>
              {selectedJob?.company} • {selectedJob?.location}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge>{selectedJob?.type}</Badge>
              {selectedJob?.remote && <Badge variant="outline">Remote</Badge>}
              {selectedJob?.salary && <Badge variant="outline">{selectedJob.salary}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedJob?.description}</p>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
};

export default JobBoardPage;
```

---

## 4. API Service Updates

**Update file:** `src/services/api.ts`

Add these types at the top of the file:

```typescript
// Job Board Types
interface JobListingsRequest {
  jobTypes?: string[];
  industries?: string[];
  locations?: string[];
  refresh?: boolean;
  searchQuery?: string;
}

interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  salary?: string;
  type: "Internship" | "Full-Time" | "Part-Time" | "Contract";
  posted: string;
  description: string;
  requirements: string[];
  url: string;
  logo?: string;
  remote?: boolean;
  experienceLevel?: string;
  via?: string;
}

interface JobListingsResponse {
  jobs: Job[];
  total: number;
  source: string;
  query?: string;
  location?: string;
  cached?: boolean;
}

interface OptimizeResumeRequest {
  jobUrl?: string;
  jobDescription?: string;
  jobTitle?: string;
  company?: string;
  userId: string;
}

interface ATSScore {
  overall: number;
  keywords: number;
  formatting: number;
  relevance: number;
  suggestions: string[];
}

interface OptimizedResume {
  content: string;
  atsScore: ATSScore;
  keywordsAdded: string[];
  sectionsOptimized: string[];
}

interface OptimizeResumeResponse {
  optimizedResume: OptimizedResume;
  creditsUsed: number;
  creditsRemaining: number;
}

interface GenerateCoverLetterRequest {
  jobUrl?: string;
  jobDescription?: string;
  jobTitle?: string;
  company?: string;
  userId: string;
}

interface CoverLetter {
  content: string;
  highlights: string[];
  tone: string;
}

interface GenerateCoverLetterResponse {
  coverLetter: CoverLetter;
  creditsUsed: number;
  creditsRemaining: number;
}
```

Add these methods to your `apiService` object:

```typescript
// Inside apiService object, add:

async getJobListings(params: JobListingsRequest): Promise<JobListingsResponse> {
  const response = await fetch(`${API_BASE_URL}/job-board/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...await this.getAuthHeaders(),
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch job listings');
  }
  return response.json();
},

async optimizeResume(params: OptimizeResumeRequest): Promise<OptimizeResumeResponse> {
  const response = await fetch(`${API_BASE_URL}/job-board/optimize-resume`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...await this.getAuthHeaders(),
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    if (response.status === 402) {
      throw new Error('Insufficient credits. Please upgrade your plan.');
    }
    throw new Error(error.error || 'Failed to optimize resume');
  }
  return response.json();
},

async generateCoverLetter(params: GenerateCoverLetterRequest): Promise<GenerateCoverLetterResponse> {
  const response = await fetch(`${API_BASE_URL}/job-board/generate-cover-letter`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...await this.getAuthHeaders(),
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    if (response.status === 402) {
      throw new Error('Insufficient credits. Please upgrade your plan.');
    }
    throw new Error(error.error || 'Failed to generate cover letter');
  }
  return response.json();
},
```

---

## 5. Navigation Updates

**Update file:** `src/components/AppSidebar.tsx`

Find the `navigationItems` array and add Job Board:

```typescript
import { 
  Home, 
  Search, 
  Building2, 
  Coffee, 
  Briefcase, 
  CreditCard,
  Newspaper,  // Add this import
} from "lucide-react";

const navigationItems = [
  { title: "Home", url: "/home", icon: Home },
  { title: "Contact Search", url: "/contact-search", icon: Search },
  { title: "Firm Search", url: "/firm-search", icon: Building2 },
  { title: "Job Board", url: "/job-board", icon: Newspaper },  // ADD THIS
  { title: "Meeting Prep", url: "/meeting-prep", icon: Coffee },
  { title: "Interview Prep", url: "/interview-prep", icon: Briefcase },
  { title: "Pricing", url: "/pricing", icon: CreditCard },
];
```

---

## 6. Route Configuration

**Update file:** `src/App.tsx`

Add the lazy import at the top:

```typescript
const JobBoardPage = React.lazy(() => import("./pages/JobBoardPage"));
```

Add the route in your Routes section:

```typescript
<Route 
  path="/job-board" 
  element={
    <ProtectedRoute>
      <Suspense fallback={<PageLoader />}>
        <JobBoardPage />
      </Suspense>
    </ProtectedRoute>
  } 
/>
```

---

## 7. Environment Variables

**Backend `.env` file:**

Make sure you have:

```env
SERPAPI_KEY=your_serpapi_key_here
# or
SERP_API_KEY=your_serpapi_key_here
```

---

## 8. Register Backend Blueprint

**Update file:** `backend/wsgi.py` (or wherever you register blueprints)

```python
from app.routes.job_board import job_board_bp

# Add with other blueprint registrations:
app.register_blueprint(job_board_bp, url_prefix='/api/job-board')
```

---

## 9. Firestore Index (Optional but Recommended)

For the cache cleanup query to work efficiently, create a composite index in Firebase Console:

**Collection:** `job_cache`
**Fields:** 
- `expires_at` (Ascending)

---

## 10. Testing

1. Start backend: `python wsgi.py`
2. Start frontend: `npm run dev`
3. Navigate to `/job-board`
4. Test:
   - Jobs load based on user preferences
   - Search and filter work
   - Refresh bypasses cache
   - Save jobs to bookmarks
   - Select job → switches to Optimize tab
   - Optimize Resume (costs 20 credits)
   - Generate Cover Letter (costs 15 credits)
   - Copy/Download optimized content

---

## Summary

| Feature | Implementation |
|---------|----------------|
| Job Source | SerpAPI Google Jobs |
| Caching | Firestore, 6-hour TTL |
| Job Types | Internship, Full-Time, Part-Time, Contract |
| Resume Optimization | GPT-4 Turbo, 20 credits |
| Cover Letter | GPT-4 Turbo, 15 credits |
| ATS Scoring | Keywords, Formatting, Relevance |

This implementation gives Offerloop users real job listings personalized to their preferences, with AI-powered tools to optimize their applications. The Firestore caching keeps SerpAPI costs low while ensuring fresh data when needed.
