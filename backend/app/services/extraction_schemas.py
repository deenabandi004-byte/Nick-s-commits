"""Pydantic schemas for Firecrawl structured extraction."""
from pydantic import BaseModel
from typing import Optional, List


class JobPostingExtract(BaseModel):
    title: str = ""
    company: str = ""
    location: str = ""
    # Full job-description prose, as written on the posting. Sources like
    # Simplify ingest with an empty description_raw; this lets the enricher's
    # existing Firecrawl scrape recover the description in the same call.
    description: str = ""
    employment_type: Optional[str] = None
    salary_range: Optional[str] = None
    requirements: List[str] = []
    nice_to_have: List[str] = []
    responsibilities: List[str] = []
    team_or_department: Optional[str] = None
    hiring_manager: Optional[str] = None
    application_deadline: Optional[str] = None
    experience_level: Optional[str] = None


class CompanyProfileExtract(BaseModel):
    name: str = ""
    description: str = ""
    headquarters: Optional[str] = None
    employee_count: Optional[int] = None
    founded: Optional[int] = None
    industries: List[str] = []
    culture_keywords: List[str] = []
    careers_url: Optional[str] = None
    leadership: List[str] = []
    recent_news: List[str] = []


class PersonProfileExtract(BaseModel):
    name: str = ""
    current_title: Optional[str] = None
    current_company: Optional[str] = None
    summary: Optional[str] = None
    recent_posts: List[str] = []
    interests: List[str] = []
