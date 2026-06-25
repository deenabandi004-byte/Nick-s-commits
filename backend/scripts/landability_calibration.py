"""Calibration report for the new landability scorer vs the old
level + location gates.

Compares, on a representative sample, the OLD binary gate decisions
(_gate_by_level OR _gate_by_location) against the NEW landability score
threshold (score < hard_drop.landability_below).

Output: Markdown to stdout. No writes anywhere.

Sample source priority:
  1. Real Firestore data (users with a non-empty jobFeedCache).
     Requires GOOGLE_APPLICATION_CREDENTIALS pointing at the service
     account JSON.
  2. Synthetic hand-built fixture covering every gate branch.
     Used when Firestore is unreachable; clearly flagged in the report.

Usage:
    python backend/scripts/landability_calibration.py
    python backend/scripts/landability_calibration.py --max-users=10
"""
import os
import sys


# Mirror the path setup in diagnose_intent_gates.py so the `app.*` imports
# resolve whether you run from repo root or from backend/.
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_SCRIPT_DIR, ".."))
sys.path.insert(0, os.path.join(_SCRIPT_DIR, "..", ".."))

from app.job_ranking_config import DEFAULT_PROFILE
from app.utils.intent_gates import (
    _gate_by_level,
    _gate_by_location,
    build_user_intent,
)
from app.utils.landability import score_landability


HARD_DROP_THRESHOLD = DEFAULT_PROFILE["hard_drop"]["landability_below"]


def _parse_int_arg(name: str, default: int) -> int:
    for arg in sys.argv:
        if arg.startswith(f"--{name}="):
            try:
                return int(arg.split("=", 1)[1])
            except ValueError:
                pass
    return default


# ---------------------------------------------------------------------------
# Sample loaders
# ---------------------------------------------------------------------------

def try_load_real_sample(max_users: int, max_jobs_per_user: int):
    """Pull (uid, profile, jobs) tuples from Firestore.

    Returns (sample_list, source_description_str).
    On any failure returns ([], reason_str) so the caller falls back.
    """
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
    except Exception as e:
        return [], f"firebase_admin not importable: {e!r}"

    try:
        if not firebase_admin._apps:
            cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
            if cred_path and os.path.exists(cred_path):
                cred = credentials.Certificate(cred_path)
                firebase_admin.initialize_app(cred)
            else:
                firebase_admin.initialize_app()
        db = firestore.client()
    except Exception as e:
        return [], f"firestore client init failed: {e!r}"

    sample = []
    try:
        users_iter = db.collection("users").limit(80).stream()
        users = list(users_iter)
    except Exception as e:
        return [], f"could not list users: {e!r}"

    for u in users:
        if len(sample) >= max_users:
            break
        try:
            profile = u.to_dict() or {}
            cache = profile.get("jobFeedCache") or {}
            job_ids = cache.get("job_ids") or []
            if not job_ids:
                continue

            jobs = []
            for jid in job_ids[:max_jobs_per_user]:
                try:
                    jd = db.collection("jobs").document(jid).get()
                except Exception:
                    continue
                if jd.exists:
                    jdict = jd.to_dict() or {}
                    jdict.setdefault("job_id", jid)
                    jobs.append(jdict)
            if jobs:
                sample.append({"uid": u.id, "profile": profile, "jobs": jobs})
        except Exception:
            continue

    if not sample:
        return [], "no users with a populated jobFeedCache pointing at fetchable jobs"
    total_jobs = sum(len(s["jobs"]) for s in sample)
    return sample, f"real Firestore data: {len(sample)} users, {total_jobs} (user, job) pairs"


def synthetic_sample():
    """Two user archetypes, thirteen jobs, every gate branch covered."""
    soon_grad_sf = {
        "uid": "synth__soon_grad_sf",
        "profile": {
            "resumeParsed": {
                "education": {"graduationYear": 2026, "graduationMonth": 6},
            },
            "location": {"preferredLocation": ["San Francisco, CA"]},
        },
        "jobs": [
            # neither: kept by both, full match
            {"job_id": "syn1", "title": "Software Engineer", "company": "Stripe",
             "location": "San Francisco, CA", "remote": False,
             "structured": {"experience_level": "entry-level"}},
            # level only via structured.experience_level
            {"job_id": "syn2", "title": "Software Engineer", "company": "Stripe",
             "location": "San Francisco, CA", "remote": False,
             "structured": {"experience_level": "senior"}},
            # level only via title senior regex
            {"job_id": "syn3", "title": "Senior Software Engineer", "company": "Stripe",
             "location": "San Francisco, CA", "remote": False,
             "structured": {"experience_level": None}},
            # level only via PhD in title
            {"job_id": "syn4", "title": "PhD Research Scientist", "company": "OpenAI",
             "location": "San Francisco, CA", "remote": False,
             "structured": {"experience_level": None}},
            # level only via "5+ years" in requirements
            {"job_id": "syn5", "title": "Software Engineer", "company": "Stripe",
             "location": "San Francisco, CA", "remote": False,
             "structured": {
                 "experience_level": None,
                 "requirements": ["5+ years of Python experience", "BS degree"],
             }},
            # location only: wrong city
            {"job_id": "syn6", "title": "Software Engineer", "company": "Stripe",
             "location": "Austin, TX", "remote": False,
             "structured": {"experience_level": "entry-level"}},
            # both: level + location
            {"job_id": "syn7", "title": "Senior Software Engineer", "company": "Stripe",
             "location": "Austin, TX", "remote": False,
             "structured": {"experience_level": "senior"}},
            # neither (remote saves it)
            {"job_id": "syn8", "title": "Software Engineer", "company": "GitLab",
             "location": "Anywhere", "remote": True,
             "structured": {"experience_level": "entry-level"}},
            # neither (intern override on senior title)
            {"job_id": "syn9", "title": "Lead Frontend Engineering Intern",
             "company": "Stripe", "location": "San Francisco, CA", "remote": False,
             "structured": {"experience_level": None}},
            # neither (empty location -> location gate keeps conservatively)
            {"job_id": "syn10", "title": "Software Engineer", "company": "Stripe",
             "location": "", "remote": False,
             "structured": {"experience_level": None}},
        ],
    }
    far_grad_no_prefs = {
        "uid": "synth__far_grad_no_prefs",
        "profile": {
            "resumeParsed": {
                "education": {"graduationYear": 2028, "graduationMonth": 5},
            },
            "location": {"preferredLocation": []},
        },
        "jobs": [
            # level signal but rule doesn't apply: grad too far out
            {"job_id": "syn11", "title": "Senior Software Engineer", "company": "Stripe",
             "location": "San Francisco, CA", "remote": False,
             "structured": {"experience_level": "senior"}},
            # location-mismatched but no prefs -> rule doesn't apply
            {"job_id": "syn12", "title": "Software Engineer", "company": "Stripe",
             "location": "Austin, TX", "remote": False,
             "structured": {"experience_level": "entry-level"}},
            # both signals but neither rule applies -> kept by both
            {"job_id": "syn13", "title": "Senior Software Engineer", "company": "Stripe",
             "location": "Austin, TX", "remote": False,
             "structured": {"experience_level": "senior"}},
        ],
    }
    return [soon_grad_sf, far_grad_no_prefs]


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

def evaluate(sample):
    rows = []
    for entry in sample:
        intent = build_user_intent(entry["profile"])
        for job in entry["jobs"]:
            old_level = bool(_gate_by_level(job, intent))
            old_location = bool(_gate_by_location(job, intent))
            old_drop = old_level or old_location
            new = score_landability(job, intent, DEFAULT_PROFILE)
            new_drop = new["score"] < HARD_DROP_THRESHOLD
            rows.append({
                "uid": entry["uid"],
                "job_id": str(job.get("job_id", "<no id>")),
                "title": str(job.get("title") or ""),
                "company": str(job.get("company") or ""),
                "location": str(job.get("location") or ""),
                "old_level_drop": old_level,
                "old_location_drop": old_location,
                "old_drop": old_drop,
                "new_score": new["score"],
                "new_drop": new_drop,
                "new_fired": new["fired"],
                "new_components": new["components"],
            })
    return rows


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

def _truncate(s: str, n: int) -> str:
    if len(s) <= n:
        return s
    return s[: max(0, n - 1)] + "..."


def report(rows, source_desc: str, is_real: bool) -> str:
    out = []
    out.append("# Landability calibration report\n")

    # 1. SAMPLE SOURCE
    out.append("## 1. Sample source and size\n")
    if is_real:
        out.append(f"**Source: real Firestore data.**  {source_desc}\n")
    else:
        out.append(f"**Source: SYNTHETIC fixture (Firestore unavailable).**  {source_desc}\n")
        out.append(
            "> Synthetic data exercises every gate branch but cannot reveal "
            "the real dual-vs-single drop ratio in production. The per-branch "
            "behavior shown below is correct; the BREAKDOWN MIX is fixture-"
            "dependent and should not be used to lock penalty numbers.\n"
        )
    out.append(f"Total (user, job) pairs evaluated: **{len(rows)}**\n")

    # 2. BY-REASON BREAKDOWN OF OLD DROPS
    old_drops = [r for r in rows if r["old_drop"]]
    level_only = [r for r in old_drops if r["old_level_drop"] and not r["old_location_drop"]]
    location_only = [r for r in old_drops if r["old_location_drop"] and not r["old_level_drop"]]
    both = [r for r in old_drops if r["old_level_drop"] and r["old_location_drop"]]
    den = max(1, len(old_drops))

    out.append("## 2. Breakdown of OLD gate drops by reason\n")
    out.append(
        f"Old gates dropped **{len(old_drops)}** of {len(rows)} pairs "
        f"({100 * len(old_drops) / max(1, len(rows)):.1f}%).\n"
    )
    out.append("| Reason | Count | Share of old drops |")
    out.append("|---|---|---|")
    out.append(f"| Level only | {len(level_only)} | {100 * len(level_only) / den:.1f}% |")
    out.append(f"| Location only | {len(location_only)} | {100 * len(location_only) / den:.1f}% |")
    out.append(f"| Both | {len(both)} | {100 * len(both) / den:.1f}% |\n")
    if not is_real:
        out.append(
            "Synthetic-data caveat: these shares are determined by the "
            "fixture, not by user behavior. Re-run with Firestore for the "
            "production mix.\n"
        )

    # 3. EXPLICIT BEHAVIOR-CHANGE CALLOUT
    new_drops = [r for r in rows if r["new_drop"]]
    new_kept_level_only = [r for r in level_only if not r["new_drop"]]
    new_kept_location_only = [r for r in location_only if not r["new_drop"]]
    new_kept_both = [r for r in both if not r["new_drop"]]
    new_drops_old_kept = [r for r in rows if r["new_drop"] and not r["old_drop"]]

    out.append("## 3. Behavior change at landability < 15\n")
    out.append(
        f"Old gates dropped: **{len(old_drops)}**. "
        f"New scorer at threshold 15 drops: **{len(new_drops)}**.\n"
    )
    out.append("Jobs that the OLD gates dropped but the NEW scorer now keeps "
               "(visible but downranked, since their composite landability "
               "weight is 0 in phase 1 they will not actually rank lower YET, "
               "they will simply remain in the feed):\n")
    out.append(
        f"- Single-signal **LEVEL-only** old drops now kept: "
        f"**{len(new_kept_level_only)}** of {len(level_only)} level-only old drops"
    )
    out.append(
        f"- Single-signal **LOCATION-only** old drops now kept: "
        f"**{len(new_kept_location_only)}** of {len(location_only)} location-only old drops"
    )
    out.append(
        f"- Dual-signal (level AND location) old drops still dropped: "
        f"**{len(both) - len(new_kept_both)}** of {len(both)} dual old drops"
    )
    out.append(
        f"- Jobs that the OLD gates KEPT but the NEW scorer now drops "
        f"(surprising direction): **{len(new_drops_old_kept)}**\n"
    )

    # 4. DISAGREEMENT TABLE
    disagreements = [r for r in rows if r["old_drop"] != r["new_drop"]]
    out.append("## 4. Disagreement table\n")
    out.append(f"Total disagreements: **{len(disagreements)}** of {len(rows)} pairs.\n")
    if disagreements:
        out.append("| UID | Job ID | Title | Company | Location | Old reasons | Old | New score | New | Fired |")
        out.append("|---|---|---|---|---|---|---|---|---|---|")
        for r in disagreements:
            reasons = []
            if r["old_level_drop"]:
                reasons.append("level")
            if r["old_location_drop"]:
                reasons.append("location")
            old_marker = "DROP" if r["old_drop"] else "keep"
            new_marker = "DROP" if r["new_drop"] else "keep"
            out.append(
                f"| {_truncate(r['uid'], 24)} | {_truncate(r['job_id'], 22)} | "
                f"{_truncate(r['title'], 38)} | {_truncate(r['company'], 18)} | "
                f"{_truncate(r['location'], 24)} | {','.join(reasons) or '-'} | "
                f"{old_marker} | {r['new_score']} | {new_marker} | "
                f"{','.join(r['new_fired']) or '-'} |"
            )
        out.append("")
    else:
        out.append("(no disagreements)\n")

    # 5. AGGREGATE AGREEMENT LAST
    agree = sum(1 for r in rows if r["old_drop"] == r["new_drop"])
    out.append("## 5. Aggregate agreement on the keep/drop decision\n")
    out.append(
        f"Old and new agree on **{agree}** of {len(rows)} pairs "
        f"({100 * agree / max(1, len(rows)):.1f}%).\n"
    )
    out.append(
        "> Agreement is the LEAST informative number here. The whole point of "
        "the new scorer is to keep the gradient above the floor, so the "
        "per-job score for kept rows is by design different from the old "
        "binary. Read sections 2 and 3 for the load-bearing facts.\n"
    )

    return "\n".join(out)


def main() -> int:
    max_users = _parse_int_arg("max-users", 5)
    max_jobs_per_user = _parse_int_arg("max-jobs-per-user", 50)

    real, source = try_load_real_sample(max_users, max_jobs_per_user)
    if real:
        print(report(evaluate(real), source, is_real=True))
        return 0

    sample = synthetic_sample()
    total_jobs = sum(len(s["jobs"]) for s in sample)
    desc = (
        f"{len(sample)} archetypes, {total_jobs} jobs covering every gate "
        f"branch.  Firestore unavailable: {source}"
    )
    print(report(evaluate(sample), desc, is_real=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
