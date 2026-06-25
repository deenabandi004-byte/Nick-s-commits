"""
Deterministic student-job ranker.

Takes a normalized student profile (major, grad year, skills, target
industries/locations, visa/work-arrangement prefs, employment_pref) and
a list of normalized job docs, and returns a ranked list with score +
per-job "why this matched" reasons.

No LLM-per-job — runs in microseconds per pairing. Uses the AI fields
captured by the Fantastic.jobs fetcher (ai_experience_level,
ai_employment_type, ai_work_arrangement, ai_visa_sponsorship,
ai_has_salary, ai_key_skills, ai_keywords, ai_education_requirements,
linkedin_org_employees, linkedin_org_industry) when present.

Scoring is intentionally ~100-point. Penalties can drive the score
negative; hard mismatches (visa, senior misfit) return a sentinel that
the caller filters out.
"""
import re
from typing import Iterable

# Sentinel returned by score() when the job is a hard mismatch for the
# student (e.g., requires visa sponsorship that the company won't provide).
# Callers should filter these out before ranking.
HARD_FILTER = -1.0

_SENIOR_TITLE_RE = re.compile(
    r"\b(Senior|Staff|Principal|Lead|Director|Head\s+of|VP|Vice\s+President|Chief)\b",
    re.I,
)
_INTERN_TITLE_RE = re.compile(
    r"\b(Intern|Internship|Co-?op|Summer\s+Analyst|Summer\s+Associate)\b", re.I,
)
_NEW_GRAD_RE = re.compile(
    r"\b(New\s+Grad|New\s+Graduate|Entry[-\s]?Level|University\s+Graduate|Early\s+Career)\b",
    re.I,
)
_GRAD_YEAR_RE = re.compile(r"\b(20\d{2})\b")


# Mapping from common major strings to broad role families. Intentionally
# small and high-signal — extend via the CIP→SOC crosswalk in a later PR.
_MAJOR_TO_FAMILIES = {
    "computer science": {"swe", "data", "ml", "pm", "security"},
    "cs": {"swe", "data", "ml", "pm", "security"},
    "data science": {"data", "ml", "swe"},
    "statistics": {"data", "quant", "ml"},
    "applied mathematics": {"data", "quant", "ml"},
    "mathematics": {"data", "quant", "ml"},
    "electrical engineering": {"swe", "hardware", "data"},
    "mechanical engineering": {"hardware"},
    "industrial engineering": {"ops", "consulting", "data"},
    "information systems": {"swe", "consulting", "data"},
    "finance": {"ib", "consulting", "quant", "finance_corp"},
    "economics": {"ib", "consulting", "finance_corp", "data"},
    "business administration": {"consulting", "finance_corp", "pm"},
    "accounting": {"finance_corp", "consulting"},
    "marketing": {"marketing", "pm"},
    "design": {"design"},
}


# Title-pattern → role family (for the title-family match signal)
_TITLE_FAMILY_PATTERNS = (
    ({"swe"}, re.compile(r"\b(Software|Backend|Frontend|Full[-\s]Stack|SWE|Developer|Engineer)\b", re.I)),
    ({"data"}, re.compile(r"\b(Data\s+Scien|Data\s+Analyst|Data\s+Engineer|Analytics)\b", re.I)),
    ({"ml"}, re.compile(r"\b(Machine\s+Learning|ML\s+Engineer|AI\s+Engineer|Research\s+Scientist)\b", re.I)),
    ({"pm"}, re.compile(r"\b(Product\s+Manager|Product\s+Management|APM|TPM)\b", re.I)),
    ({"design"}, re.compile(r"\b(Designer|UX|UI\s+Designer|Product\s+Designer)\b", re.I)),
    ({"ib"}, re.compile(r"\b(Investment\s+Banking|Summer\s+Analyst|Global\s+Markets|Sales\s*&\s*Trading)\b", re.I)),
    ({"quant"}, re.compile(r"\b(Quant|Quantitative|Algorithmic\s+Trading|Trading\s+Intern)\b", re.I)),
    ({"consulting"}, re.compile(r"\b(Consultant|Business\s+Analyst|Strategy\s+Analyst|Advisory)\b", re.I)),
    ({"finance_corp"}, re.compile(r"\b(Financial\s+Analyst|FP&A|Corporate\s+Finance|Treasury)\b", re.I)),
    ({"marketing"}, re.compile(r"\b(Marketing|Growth|Brand)\b", re.I)),
    ({"security"}, re.compile(r"\b(Security\s+Engineer|Cybersecurity|InfoSec)\b", re.I)),
    ({"hardware"}, re.compile(r"\b(Hardware|FPGA|ASIC|Embedded|Firmware)\b", re.I)),
    ({"ops"}, re.compile(r"\b(Operations|Logistics|Supply\s+Chain)\b", re.I)),
)


def _title_role_families(title: str) -> set[str]:
    families: set[str] = set()
    for fams, pat in _TITLE_FAMILY_PATTERNS:
        if pat.search(title):
            families |= fams
    return families


def _major_role_families(major: str | None) -> set[str]:
    if not major:
        return set()
    key = major.strip().lower()
    return _MAJOR_TO_FAMILIES.get(key, set())


def _norm_set(values: Iterable) -> set[str]:
    return {str(v).strip().lower() for v in values if v}


def _job_location_string(job: dict) -> str:
    loc = job.get("location") or ""
    if isinstance(loc, dict):
        loc = loc.get("name") or loc.get("city") or ""
    if isinstance(loc, list):
        loc = " ".join(str(x) for x in loc)
    return str(loc).lower()


def _location_match(student: dict, job: dict) -> bool:
    targets = _norm_set(student.get("target_locations") or [])
    if not targets:
        return False
    loc = _job_location_string(job)
    return any(t in loc for t in targets)


def _grad_year_in_title(grad_year: int | None, title: str, desc: str) -> bool:
    if not grad_year:
        return False
    years = set(_GRAD_YEAR_RE.findall(title + " " + (desc or "")[:500]))
    return str(grad_year) in years


def score(student: dict, job: dict) -> tuple[float, list[str]]:
    """Return (score, reasons[]). HARD_FILTER means caller should drop the job."""
    s = 0.0
    reasons: list[str] = []

    title = job.get("title") or ""
    desc = job.get("description_raw") or ""

    # ===== Hard filters =====
    needs_visa = bool(student.get("needs_visa_sponsorship"))
    visa = job.get("ai_visa_sponsorship")
    if needs_visa and visa is False:
        return HARD_FILTER, ["visa_required_not_offered"]

    pref = (student.get("employment_pref") or "BOTH").upper()
    emp = (job.get("ai_employment_type") or "").upper()
    if _SENIOR_TITLE_RE.search(title) and not (_INTERN_TITLE_RE.search(title) or _NEW_GRAD_RE.search(title)):
        return HARD_FILTER, ["senior_misfit"]

    # ===== Positive signals =====
    # (1) Experience level fit — strongest predictor for "can I plausibly qualify"
    exp = (job.get("ai_experience_level") or "").lower()
    if exp == "0-2" or _INTERN_TITLE_RE.search(title) or _NEW_GRAD_RE.search(title):
        s += 18; reasons.append("entry_level_fit")
    elif exp == "2-5":
        s += 5  # might qualify, no reason badge

    # (2) Employment-type preference match
    if pref == "BOTH" and emp in ("INTERN", "FULL_TIME", "FULLTIME"):
        s += 10
    elif pref == "INTERN" and emp == "INTERN":
        s += 15; reasons.append("internship_match")
    elif pref == "FULLTIME" and emp in ("FULL_TIME", "FULLTIME"):
        s += 15; reasons.append("fulltime_match")

    # (3) Visa sponsorship — a positive signal when needed
    if needs_visa and visa is True:
        s += 12; reasons.append("sponsors_visa")

    # (4) Location — geo + remote compat
    if _location_match(student, job):
        s += 8; reasons.append("location_match")
    accepts_remote = bool(student.get("accepts_remote"))
    arrangement = (job.get("ai_work_arrangement") or "")
    if accepts_remote and arrangement in ("Remote Solely", "Remote OK", "Hybrid"):
        s += 4
    elif not accepts_remote and arrangement == "Remote Solely":
        s -= 2  # student wanted on-site, this is purely remote

    # (5) Work-arrangement preference match
    prefs = _norm_set(student.get("work_arrangement_prefs") or [])
    if prefs and arrangement.lower() in prefs:
        s += 8

    # (6) Industry / function match (target industries + LinkedIn industry)
    targets = _norm_set(student.get("target_industries") or [])
    job_industry = (job.get("linkedin_org_industry") or "").lower()
    taxonomies = {t.lower() for t in (job.get("ai_taxonomies_a") or []) if t}
    if targets and (job_industry in targets or targets & taxonomies):
        s += 12; reasons.append("industry_match")

    # (7) Skill overlap (Jaccard-style over ai_key_skills + ai_keywords)
    student_skills = _norm_set(student.get("skills") or [])
    job_skills = _norm_set((job.get("ai_key_skills") or []) + (job.get("ai_keywords") or []))
    if student_skills and job_skills:
        overlap = len(student_skills & job_skills)
        s += min(overlap, 5) * 2
        if overlap >= 3:
            reasons.append("strong_skill_overlap")

    # (8) Title role-family match to major
    major_families = _major_role_families(student.get("major"))
    title_families = _title_role_families(title)
    if major_families and (major_families & title_families):
        s += 6

    # (9) Graduation year cohort match (year appears in title/description)
    if _grad_year_in_title(student.get("graduation_year"), title, desc):
        s += 4; reasons.append("cohort_year_match")

    # (10) Salary transparency
    if job.get("ai_has_salary"):
        s += 1
    if (job.get("salary_normalized_annual") or 0) >= 60000:
        s += 2  # rough floor for "real" intern/new-grad comp

    # (11) Company size — favor mid-large established hirers
    emp_count = job.get("linkedin_org_employees") or 0
    if 500 <= emp_count <= 200000:
        s += 2
    elif emp_count > 200000:
        s += 1

    # (12) Education requirements vs student level
    edu_reqs = {e.lower() for e in (job.get("ai_education_requirements") or [])}
    if "postgraduate degree" in edu_reqs and not student.get("is_grad_student"):
        s -= 8  # undergrad seeing PhD/Masters-required job

    # ===== Soft penalties =====
    # Mis-tagged intern with senior YOE in description
    if emp == "INTERN" and re.search(r"\b(3\+|5\+|7\+)\s*years?\b", desc, re.I):
        s -= 15

    # Employment-type mismatch (soft, since student may flex)
    if pref == "INTERN" and emp in ("FULL_TIME", "FULLTIME"):
        s -= 20
    if pref == "FULLTIME" and emp == "INTERN":
        s -= 20

    # Recency — bucketed half-life curve
    s += _recency_bonus(job.get("posted_at"))

    return max(s, 0.0), reasons


def _recency_bonus(posted_at) -> float:
    if posted_at is None:
        return 0.0
    from datetime import datetime, timezone
    if isinstance(posted_at, str):
        try:
            posted_at = datetime.fromisoformat(posted_at.replace("Z", "+00:00"))
        except ValueError:
            return 0.0
    if not isinstance(posted_at, datetime):
        return 0.0
    if posted_at.tzinfo is None:
        posted_at = posted_at.replace(tzinfo=timezone.utc)
    age_days = (datetime.now(timezone.utc) - posted_at).days
    if age_days <= 3: return 10.0
    if age_days <= 7: return 6.0
    if age_days <= 14: return 3.0
    if age_days <= 30: return 0.0
    return -10.0  # stale


def rank_for_student(
    student: dict, jobs: list[dict], top_k: int = 50, candidate_pool: int = 300
) -> list[tuple[dict, float, list[str]]]:
    """Score every job, filter hard mismatches, return diversified top_k."""
    scored: list[tuple[dict, float, list[str]]] = []
    for job in jobs:
        sc, reasons = score(student, job)
        if sc == HARD_FILTER:
            continue
        scored.append((job, sc, reasons))
    scored.sort(key=lambda x: -x[1])
    pool = scored[:candidate_pool]
    return diversify(pool, k=top_k)


def diversify(
    scored: list[tuple[dict, float, list[str]]],
    k: int = 50,
    lambda_company: float = 3.0,
    lambda_family: float = 0.5,
) -> list[tuple[dict, float, list[str]]]:
    """Greedy MMR-style re-rank: penalize already-picked company + role family.

    Soft caps in practice:
      - ~3-4 jobs per company in the top 20 (lambda_company=3.0)
      - mild diminishing return per role family
    """
    if k <= 0 or not scored:
        return []
    chosen: list[tuple[dict, float, list[str]]] = []
    co_counts: dict[str, int] = {}
    fam_counts: dict[str, int] = {}
    remaining = list(scored)

    while remaining and len(chosen) < k:
        best_idx = -1
        best_adj = float("-inf")
        for i, (job, sc, _) in enumerate(remaining):
            company = (job.get("company") or "").lower()
            families = _title_role_families(job.get("title") or "") or {"other"}
            company_pen = lambda_company * (co_counts.get(company, 0) ** 2)
            fam_pen = lambda_family * sum(
                fam_counts.get(f, 0) ** 2 for f in families
            )
            adj = sc - company_pen - fam_pen
            if adj > best_adj:
                best_adj = adj
                best_idx = i
        picked = remaining.pop(best_idx)
        chosen.append(picked)
        co = (picked[0].get("company") or "").lower()
        co_counts[co] = co_counts.get(co, 0) + 1
        for f in _title_role_families(picked[0].get("title") or "") or {"other"}:
            fam_counts[f] = fam_counts.get(f, 0) + 1
    return chosen
