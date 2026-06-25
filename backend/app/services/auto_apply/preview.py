"""
Build the auto-apply preview payload.

The preview is what the user reviews in `AutoApplyReviewModal` before any
real submission. It contains:

  fields              — name / email / phone / location / LinkedIn from
                        resumeParsed + user account. ATS-agnostic; the
                        form-filler will route these into whatever field
                        names the live form uses.

  structured_answers  — work auth / EEO / veteran / disability / scheduling.
                        Pulled deterministically from applicationProfile.
                        Sensitive demographic fields are forced to "decline"
                        when the user never set them; never inferred.

  open_ended_answers  — LLM-generated paragraphs for the two most common
                        screening questions ("Why this role?" and "Why this
                        company?"). Editable in the modal. The form-filler
                        will fuzzy-match real form questions to these
                        answers at submit time.

  resume              — { has_resume, filename } so the modal can show
                        "Resume: my-resume.pdf will be uploaded" without
                        leaking the storage path. Signed URL is generated
                        later, only when the form-filler actually needs it.

  unmapped_fields     — empty at prepare time. The form-filler populates
                        this when it encounters required fields the preview
                        didn't cover (custom multi-selects, etc.). The
                        modal surfaces these inline for the user to answer.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.extensions import get_db
from app.services.auto_apply.application_profile import resolve_or_decline
from app.services.auto_apply.screening_answers import (
    generate_open_ended,
    summarize_resume_for_prompt,
)


logger = logging.getLogger(__name__)


# The two questions virtually every ATS asks in some form. We pre-generate
# answers at prepare time so the user can review and edit before any real
# submission. Form-filler maps these to whatever wording the live form uses.
DEFAULT_OPEN_ENDED_PROMPTS = [
    ("why_role", "Why are you interested in this specific role?"),
    ("why_company", "Why are you interested in working at this company?"),
]


def load_user_for_apply(uid: str) -> Dict[str, Any]:
    """Read the user doc and return the fields auto-apply cares about."""
    db = get_db()
    snap = db.collection("users").document(uid).get()
    user = snap.to_dict() or {}
    return {
        "email": user.get("email"),
        "name": user.get("name"),
        "resumeParsed": user.get("resumeParsed") or {},
        "professionalInfo": user.get("professionalInfo") or {},
        "academics": user.get("academics") or {},
        "location": user.get("location") or {},
        "applicationProfile": user.get("applicationProfile") or {},
        # Real Offerloop field names (verified against AccountSettings.tsx +
        # referral_email.py): resumeUrl/resumeURL holds the storage download
        # URL, resumeFileName holds the display filename.
        "resumeUrl": user.get("resumeUrl") or user.get("resumeURL"),
        "resumeFileName": user.get("resumeFileName"),
    }


def build_structured_fields(user: Dict[str, Any]) -> Dict[str, Any]:
    """Identity + contact fields. ATS-agnostic. Form-filler routes these
    into whatever the live form's field names happen to be."""
    parsed = user.get("resumeParsed") or {}
    professional = user.get("professionalInfo") or {}
    location_pref = user.get("location") or {}
    # Application Profile overrides — these are the user's explicit answers
    # for fields that resume parsing commonly misses (phone) or that aren't
    # on resumes at all (LinkedIn). Resume is the fallback, not the source
    # of truth, when the user has set a profile value.
    profile_contact = (user.get("applicationProfile") or {}).get("contactInfo") or {}

    # Split name if we only have a single string
    full_name = parsed.get("name") or user.get("name") or ""
    first, last = _split_name(full_name)

    # Pull most-recent role for "current or previous {employer,title}"
    # style questions on Greenhouse forms.
    experience = parsed.get("experience") or []
    most_recent_company = ""
    most_recent_title = ""
    if isinstance(experience, list) and experience:
        first_exp = experience[0]
        if isinstance(first_exp, dict):
            most_recent_company = str(first_exp.get("company") or "")
            most_recent_title = str(first_exp.get("title") or "")

    return {
        "first_name": first,
        "last_name": last,
        "full_name": full_name,
        "email": parsed.get("email") or user.get("email") or "",
        # Profile overrides resume for phone (resume parsers commonly miss it)
        "phone": profile_contact.get("phone") or parsed.get("phone") or "",
        "location": parsed.get("location")
        or _first_str(location_pref.get("preferredLocation"))
        or "",
        # Profile overrides professionalInfo for LinkedIn (not on resume)
        "linkedin_url": profile_contact.get("linkedinUrl")
        or professional.get("linkedinUrl") or "",
        "github_url": professional.get("githubUrl") or "",
        "portfolio_url": professional.get("portfolioUrl") or "",
        "most_recent_company": most_recent_company,
        "most_recent_title": most_recent_title,
    }


def build_structured_answers(profile: Dict[str, Any]) -> Dict[str, Any]:
    """Work authorization + EEO + veteran + disability + preferences. All
    deterministic; sensitive demographics fall back to 'decline' if unset."""
    wa = profile.get("workAuthorization") or {}
    demo = profile.get("demographics") or {}
    prefs = profile.get("preferences") or {}
    return {
        "authorized_to_work_us": wa.get("authorizedToWorkUS"),
        "requires_sponsorship": wa.get("requiresSponsorship"),
        "visa_status": wa.get("visaStatus"),
        "gender": resolve_or_decline(demo.get("gender")),
        "race": resolve_or_decline(demo.get("race")),
        "ethnicity": resolve_or_decline(demo.get("ethnicity")),
        "lgbtq": resolve_or_decline(demo.get("lgbtq")),
        "veteran_status": resolve_or_decline(profile.get("veteranStatus")),
        "disability_status": resolve_or_decline(profile.get("disabilityStatus")),
        "earliest_start_date": prefs.get("earliestStartDate"),
        "expected_salary_usd": prefs.get("expectedSalaryUsd"),
        "open_to_relocation": prefs.get("openToRelocation"),
        "open_to_remote": prefs.get("openToRemote"),
    }


def build_open_ended_answers(
    job: Dict[str, Any], user: Dict[str, Any]
) -> Dict[str, Dict[str, str]]:
    """Pre-generate LLM answers for the standard "why this role / company"
    questions. Each entry: { key: { question, answer } }. User can edit
    `answer` in the modal before submission."""
    resume_summary = summarize_resume_for_prompt(user.get("resumeParsed") or {})
    out: Dict[str, Dict[str, str]] = {}
    for key, question in DEFAULT_OPEN_ENDED_PROMPTS:
        try:
            answer = generate_open_ended(job, resume_summary, question)
        except Exception as exc:
            logger.warning("open-ended generation failed for %s: %s", key, exc)
            answer = "NEEDS_USER"
        out[key] = {"question": question, "answer": answer}
    return out


def build_resume_descriptor(user: Dict[str, Any]) -> Dict[str, Any]:
    """Modal-friendly resume info. We don't return the URL here; the
    form-filler will fetch it at submit time."""
    filename = user.get("resumeFileName") or "resume.pdf"
    has_resume = bool(user.get("resumeUrl")) or bool(
        (user.get("resumeParsed") or {}).get("rawText")
    )
    return {"has_resume": has_resume, "filename": filename}


def build_preview(
    job: Dict[str, Any], user: Dict[str, Any]
) -> Dict[str, Any]:
    """Top-level preview the prepare endpoint returns."""
    profile = user.get("applicationProfile") or {}
    return {
        "fields": build_structured_fields(user),
        "structured_answers": build_structured_answers(profile),
        "open_ended_answers": build_open_ended_answers(job, user),
        "resume": build_resume_descriptor(user),
        "unmapped_fields": [],
    }


# ---------- helpers ----------

def _split_name(full: str) -> tuple[str, str]:
    """Split a full name into (first, last). For 3+ word names, take the
    FIRST word as first name and the LAST word as last name — discarding
    middle names from the last-name field. Greenhouse's #last_name is meant
    to be the surname only, not "Middle Last"."""
    parts = (full or "").strip().split()
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[-1]


def _first_str(value: Any) -> Optional[str]:
    if isinstance(value, list):
        for v in value:
            if isinstance(v, str) and v.strip():
                return v
    elif isinstance(value, str):
        return value or None
    return None
