"""
Application Profile: persisted answers to ATS screening questions that don't
change between applications (work authorization, EEO demographics, veteran /
disability status, scheduling preferences).

Source-of-truth rule
--------------------
We never INFER race, gender, ethnicity, veteran status, or disability status
from any other signal. If the user has not explicitly set a value, the
auto-apply submitter must select "Decline to answer" or equivalent. Wrong-
filling these fields can disqualify an applicant or constitute legal
misrepresentation.

Work authorization is the one field we refuse to auto-fill blindly — if the
user has not set authorizedToWorkUS, the submit endpoint returns 409 and the
form-filler refuses to run.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from app.extensions import get_db


DECLINE = "decline"


def _default_profile() -> Dict[str, Any]:
    """Schema-shaped empty profile. All sensitive fields default to None so the
    UI can show "Choose..." rather than implying a value. Once persisted, any
    None on a sensitive field is treated as "decline" by the form-fillers."""
    return {
        # Contact info — overrides resume-parsed values when set. Useful for
        # fields that resume parsers commonly miss (phone) or that aren't on
        # resumes at all (LinkedIn URL).
        "contactInfo": {
            "phone": None,
            "linkedinUrl": None,
        },
        "workAuthorization": {
            "authorizedToWorkUS": None,
            "requiresSponsorship": None,
            "visaStatus": None,
        },
        "demographics": {
            "gender": None,
            "race": None,
            "ethnicity": None,
            "lgbtq": None,
        },
        "veteranStatus": None,
        "disabilityStatus": None,
        "preferences": {
            "earliestStartDate": None,
            "expectedSalaryUsd": None,
            "openToRelocation": None,
            "openToRemote": None,
        },
        "acknowledgedAt": None,
    }


def get_application_profile(uid: str) -> Dict[str, Any]:
    """Return the user's saved Application Profile (default-shaped if absent)."""
    db = get_db()
    snap = db.collection("users").document(uid).get()
    user = snap.to_dict() or {}
    saved = user.get("applicationProfile") or {}
    profile = _default_profile()
    _deep_merge(profile, saved)
    return profile


def save_application_profile(uid: str, incoming: Dict[str, Any]) -> Dict[str, Any]:
    """Persist the profile and stamp acknowledgedAt. Returns the saved profile."""
    profile = _default_profile()
    _deep_merge(profile, incoming or {})
    profile["acknowledgedAt"] = datetime.utcnow().isoformat()
    db = get_db()
    db.collection("users").document(uid).set(
        {"applicationProfile": profile}, merge=True
    )
    return profile


def is_acknowledged(profile: Dict[str, Any]) -> bool:
    return bool(profile.get("acknowledgedAt"))


def work_auth_complete(profile: Dict[str, Any]) -> bool:
    """Submit guard: refuse to run the form-filler without explicit work auth."""
    wa = profile.get("workAuthorization") or {}
    return wa.get("authorizedToWorkUS") is not None


def resolve_or_decline(value: Optional[str]) -> str:
    """For EEO / veteran / disability fields: if the user never set it, the
    answer is 'decline'. Never guess, never leave blank."""
    if value is None or value == "":
        return DECLINE
    return value


def _deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> None:
    for key, val in (override or {}).items():
        if isinstance(val, dict) and isinstance(base.get(key), dict):
            _deep_merge(base[key], val)
        else:
            base[key] = val
