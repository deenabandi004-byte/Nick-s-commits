"""
Quality gate for ingested jobs. Drops postings that are wrong for the
Offerloop student audience BEFORE they reach Firestore — keeps the index
small, keeps the ranker honest, and saves enrichment spend.

All rules are deterministic and run on the normalized job dict (the same
shape `_normalize_board_job` produces). The AI-derived fields are used
when present (Fantastic.jobs source) and gracefully skipped otherwise.
"""
import logging
import re
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)


# Company-name patterns that flag staffing / recruiting / RPO firms.
_STAFFING_PATTERNS = re.compile(
    r"\b("
    r"staffing|recruiting|recruiter[s]?|talent\s+solutions|placement\s+agency|"
    r"manpower|adecco|randstad|robert\s+half|kforce|aerotek|"
    r"insight\s+global|teksystems|allegis|kelly\s+services|"
    r"experis|modis|mondo|tek\s+systems"
    r")\b",
    re.I,
)

# Obvious scams / MLM / influencer-marketing fake-intern patterns.
_SCAM_PATTERNS = re.compile(
    r"\b("
    r"commission\s+only|100%\s+commission|"
    r"multi[-\s]?level\s+marketing|MLM|"
    r"brand\s+ambassador|independent\s+distributor|"
    r"earn\s+up\s+to\s+\$|earn\s+\$\d|"
    r"work\s+from\s+home!!!|hiring\s+immediately!!!|"
    r"no\s+experience\s+necessary"
    r")\b",
    re.I,
)

# Senior / leadership titles. Treated as wrong-for-student UNLESS the title
# also carries an Intern / New Grad / Early Career / Co-op marker (which
# happens occasionally for sponsored rotations).
_SENIOR_TITLE = re.compile(
    r"\b(Senior|Staff|Principal|Lead|Director|Head\s+of|"
    r"Vice\s+President|VP|Chief|Manager\s+II|Manager\s+III)\b",
    re.I,
)
_EARLY_CAREER_OVERRIDE = re.compile(
    r"\b(Intern|Internship|Co-?op|'New\s+Grad'|'Entry[-\s]Level'|"
    r"University\s+Graduate|Early\s+Career|Summer\s+Analyst|Summer\s+Associate)\b",
    re.I,
)

# Inconsistency: posting is tagged INTERN (or has Intern in title) but
# description requires 3+/5+ years experience.
_YOE_INCONSISTENT = re.compile(
    r"\b(3\+|4\+|5\+|6\+|7\+|8\+|10\+)\s*(?:years?|yrs?)\b", re.I,
)

# Internships requiring permanent work authorization → exclude for the
# visa-needing slice of users. We capture this as a per-job flag rather
# than a hard drop, but if combined with INTERN + 0-2 it's a strong
# signal of mismatch for the international student persona.
_REQUIRES_WORK_AUTH = re.compile(
    r"\b(must\s+have\s+permanent\s+work\s+authorization|"
    r"no\s+sponsorship|"
    r"will\s+not\s+sponsor|"
    r"unable\s+to\s+sponsor)\b",
    re.I,
)


_MIN_DESCRIPTION_CHARS = 50
_MAX_AGE_DAYS = 60


def _is_too_old(posted_at) -> bool:
    if posted_at is None:
        return False
    if isinstance(posted_at, str):
        try:
            posted_at = datetime.fromisoformat(posted_at.replace("Z", "+00:00"))
        except ValueError:
            return False
    if not isinstance(posted_at, datetime):
        return False
    if posted_at.tzinfo is None:
        posted_at = posted_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - posted_at > timedelta(days=_MAX_AGE_DAYS)


def _is_intern_role(doc: dict) -> bool:
    """True if this posting targets interns (used to evaluate YOE inconsistency)."""
    emp = (doc.get("ai_employment_type") or "").upper()
    if emp == "INTERN":
        return True
    job_type = (doc.get("type") or "").upper()
    if job_type == "INTERNSHIP":
        return True
    title = (doc.get("title") or "").lower()
    return any(kw in title for kw in ("intern", "co-op", "coop", "summer analyst"))


def evaluate(doc: dict) -> tuple[bool, str | None]:
    """Return (keep, reason_if_dropped).

    Pure function — easy to unit test without Firestore or HTTP.
    """
    title = doc.get("title") or ""
    company = doc.get("company") or ""
    desc = doc.get("description_raw") or ""

    # 1. LinkedIn agency flag (FJ provides this when include_li=true)
    if doc.get("linkedin_org_recruitment_agency") is True:
        return False, "linkedin_recruitment_agency"

    # 2. Company-name staffing patterns
    if _STAFFING_PATTERNS.search(company):
        return False, "staffing_company_name"

    # 3. Scam / MLM patterns
    if _SCAM_PATTERNS.search(title) or _SCAM_PATTERNS.search(desc):
        return False, "scam_pattern"

    # 4. Senior title without an early-career override
    if _SENIOR_TITLE.search(title) and not _EARLY_CAREER_OVERRIDE.search(title):
        return False, "senior_title"

    # 5. Intern-tagged role that requires 3+ years experience
    if _is_intern_role(doc) and _YOE_INCONSISTENT.search(desc):
        return False, "intern_yoe_inconsistent"

    # 6. Description too short to be a real posting
    if len(desc.strip()) < _MIN_DESCRIPTION_CHARS:
        # Allow short descriptions from Simplify (which intentionally stores
        # description="" and links out) — those entries are still useful.
        if doc.get("source") != "simplify":
            return False, "description_too_short"

    # 7. Stale posting (>60 days old)
    if _is_too_old(doc.get("posted_at")):
        return False, "too_old"

    return True, None


def apply(docs: list[dict]) -> tuple[list[dict], dict]:
    """Filter a batch of normalized job docs. Returns (kept, drop_counts_by_reason)."""
    kept = []
    drops: dict[str, int] = {}
    for doc in docs:
        ok, reason = evaluate(doc)
        if ok:
            kept.append(doc)
        else:
            drops[reason] = drops.get(reason, 0) + 1
    if drops:
        breakdown = ", ".join(f"{k}={v}" for k, v in sorted(drops.items()))
        logger.info("Quality gate dropped %d jobs (%s)", sum(drops.values()), breakdown)
    return kept, drops
