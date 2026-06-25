"""
Map the Firestore user profile dict into the shape the deterministic
student_job_ranker expects.

The Firestore profile has accreted multiple layouts over the lifetime of
Offerloop (legacy top-level fields, professionalInfo, location.*,
academics.*, resumeParsed.education.*). This mapper consolidates all of
them into the small flat dict the ranker reads.

Pure helper — no I/O, no Firestore calls. Safe to import from anywhere.
"""
from typing import Any


def _list_or_empty(v: Any) -> list:
    return v if isinstance(v, list) else []


def _flatten_skills(skills_field: Any) -> list[str]:
    """Resume.skills can be a flat list (old) or a categorized dict (new)."""
    if isinstance(skills_field, list):
        return [s for s in skills_field if isinstance(s, str)]
    if isinstance(skills_field, dict):
        out: list[str] = []
        for v in skills_field.values():
            if isinstance(v, list):
                out.extend([s for s in v if isinstance(s, str)])
        return out
    return []


def _coerce_grad_year(value: Any) -> int | None:
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        import re
        m = re.search(r"\b(19|20)\d{2}\b", value)
        if m:
            try:
                return int(m.group())
            except ValueError:
                return None
    return None


def _employment_pref(job_types: list) -> str:
    """Map onboarding jobTypes ['Internship', 'Full-time'] → INTERN/FULLTIME/BOTH."""
    has_intern = any(("intern" in str(t).lower() or "co-op" in str(t).lower()) for t in job_types)
    has_ft = any(("full" in str(t).lower() or "new grad" in str(t).lower()) for t in job_types)
    if has_intern and has_ft:
        return "BOTH"
    if has_intern:
        return "INTERN"
    if has_ft:
        return "FULLTIME"
    return "BOTH"


def _accepts_remote(location_data: dict, job_types: list) -> bool:
    if any("remote" in str(t).lower() for t in job_types):
        return True
    arr = (location_data.get("workArrangement") or [])
    if isinstance(arr, str):
        arr = [arr]
    return any("remote" in str(a).lower() for a in arr)


def _work_arrangement_prefs(location_data: dict) -> list[str]:
    arr = location_data.get("workArrangement") or []
    if isinstance(arr, str):
        arr = [arr]
    out: list[str] = []
    for a in arr:
        s = str(a).lower()
        if "on-site" in s or "onsite" in s or "on site" in s:
            out.append("on-site")
        elif "hybrid" in s:
            out.append("hybrid")
        elif "remote" in s:
            out.append("remote solely")
            out.append("remote ok")
    return out


def _needs_visa(user_data: dict, professional_info: dict) -> bool:
    """Read whichever of the visa-related flags exists."""
    for key in ("sponsorshipNeeded", "needsVisaSponsorship", "needsSponsorship", "requiresVisaSponsorship"):
        if professional_info.get(key) is True:
            return True
        if user_data.get(key) is True:
            return True
    return False


def _is_grad_student(academics: dict, professional_info: dict) -> bool:
    degree = (academics.get("degree") or professional_info.get("degree") or "").lower()
    return any(kw in degree for kw in ("master", "mba", "ph.d", "phd", "doctorate"))


def build_student_dict(user_data: dict) -> dict:
    """Flatten a Firestore user profile into the ranker's student shape.

    Reads from the union of: professionalInfo, location, academics,
    resumeParsed.education / .skills, and a few legacy top-level fields.
    Missing values become None / empty list — the ranker tolerates both.
    """
    professional_info = user_data.get("professionalInfo") or {}
    location_data = user_data.get("location") or {}
    academics = user_data.get("academics") or {}
    resume_parsed = user_data.get("resumeParsed") or {}
    education = resume_parsed.get("education") if isinstance(resume_parsed, dict) else {}
    education = education if isinstance(education, dict) else {}

    major = (
        education.get("major")
        or professional_info.get("major")
        or academics.get("major")
        or user_data.get("major")
        or ""
    )

    graduation_year = _coerce_grad_year(
        academics.get("graduationYear")
        or professional_info.get("graduationYear")
        or education.get("graduationYear")
        or user_data.get("graduationYear")
    )

    skills = _flatten_skills(resume_parsed.get("skills") if isinstance(resume_parsed, dict) else None)
    if not skills:
        skills = _list_or_empty(user_data.get("skills"))

    target_industries = (
        _list_or_empty(professional_info.get("targetIndustries"))
        or _list_or_empty(user_data.get("targetIndustries"))
    )

    target_locations = (
        _list_or_empty(location_data.get("preferredLocation"))
        or _list_or_empty(user_data.get("preferredLocation"))
        or _list_or_empty(user_data.get("preferredLocations"))
    )

    job_types = (
        _list_or_empty(location_data.get("jobTypes"))
        or _list_or_empty(user_data.get("jobTypes"))
    )

    return {
        "major": major or None,
        "graduation_year": graduation_year,
        "skills": [str(s).lower() for s in skills],
        "target_industries": [str(t).lower() for t in target_industries],
        "target_locations": [str(loc).lower() for loc in target_locations],
        "employment_pref": _employment_pref(job_types),
        "accepts_remote": _accepts_remote(location_data, job_types),
        "work_arrangement_prefs": _work_arrangement_prefs(location_data),
        "needs_visa_sponsorship": _needs_visa(user_data, professional_info),
        "is_grad_student": _is_grad_student(academics, professional_info),
    }
