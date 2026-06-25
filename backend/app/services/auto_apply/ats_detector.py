"""
Route a job to the right ATS form-filler. Inputs come straight from the
FantasticJobs ingestion path (backend/pipeline/fetcher.py:636-638), which tags
each job with ats_platform / ats_source_type / ats_source_domain.

Phase 1 supports guest-application ATSes only: Greenhouse, Lever, Ashby.
Workday (per-company accounts), LinkedIn Easy Apply (auth wall), and
custom career pages are explicitly out of scope.
"""
from __future__ import annotations

from typing import Optional
from urllib.parse import urlparse

from app.config import SUPPORTED_AUTO_APPLY_ATS


_DOMAIN_TO_PLATFORM = {
    "boards.greenhouse.io": "greenhouse",
    "job-boards.greenhouse.io": "greenhouse",
    "jobs.lever.co": "lever",
    "jobs.ashbyhq.com": "ashby",
}

# Suffix-match against the apply_url hostname. Used as a last-resort fallback
# when FJ's `source` tags the job as "indeed" / "linkedin" / "company-website"
# even though the actual apply_url goes to a supported guest-application ATS.
# Most listings on the board fall into this bucket — FJ scrapes from job
# aggregators but the underlying form is hosted on Greenhouse/Lever/Ashby.
_URL_SUFFIX_TO_PLATFORM = (
    (".greenhouse.io", "greenhouse"),
    (".lever.co", "lever"),
    (".ashbyhq.com", "ashby"),
)


def detect_platform(job: dict) -> Optional[str]:
    """Return the normalized ats_platform if the job is eligible, else None.

    Four signals, in priority order:
      1. `ats_platform` — explicit FJ tag. Authoritative when it names a
         supported ATS; falls through (NOT None) when it names an
         unsupported source like "indeed" so the apply_url fallback can
         still recover.
      2. `ats_source_domain` — also FJ. Same fall-through behavior.
      3. `job_id` prefix — pipeline naming convention `{source}_{slug}_{ext_id}`.
      4. `apply_url` hostname — parses the URL itself. Catches the common
         FJ case where source="indeed" but apply_url is boards.greenhouse.io.

    The priority order matters: FJ-tagged `ats_platform="workday"` correctly
    returns None even if apply_url happens to contain a supported domain,
    because by the time we reach the URL fallback, the workday tag has
    been seen and rejected at the top — we only fall through to URL when
    FJ either tagged an unsupported value (e.g. "indeed") or said nothing."""
    raw_platform = (job.get("ats_platform") or "").lower().strip()
    if raw_platform in SUPPORTED_AUTO_APPLY_ATS:
        return raw_platform

    raw_domain = (job.get("ats_source_domain") or "").lower().strip()
    if raw_domain in _DOMAIN_TO_PLATFORM:
        mapped = _DOMAIN_TO_PLATFORM[raw_domain]
        if mapped in SUPPORTED_AUTO_APPLY_ATS:
            return mapped

    job_id = str(job.get("job_id") or job.get("id") or "").lower().strip()
    if "_" in job_id:
        prefix = job_id.split("_", 1)[0]
        if prefix in SUPPORTED_AUTO_APPLY_ATS:
            return prefix

    apply_url = (job.get("apply_url") or "").lower().strip()
    if apply_url:
        try:
            host = (urlparse(apply_url).hostname or "").lower()
        except Exception:
            host = ""
        if host:
            for suffix, platform in _URL_SUFFIX_TO_PLATFORM:
                if host == suffix.lstrip(".") or host.endswith(suffix):
                    if platform in SUPPORTED_AUTO_APPLY_ATS:
                        return platform

    return None


def is_eligible(job: dict) -> bool:
    """Auto-apply gate: must resolve to a supported ATS AND not be expired."""
    if job.get("expired") is True:
        return False
    return detect_platform(job) is not None
