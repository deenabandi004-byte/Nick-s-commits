"""Salary backfill (tier 1 + tier 2). Idempotent.

Walks active jobs (expires_at > now). For each job:
  - If existing salary.source == "ats": SKIP (tier 1 is locked)
  - Else if top-level salary_min/max/period populated:
      write salary{source="ats", confidence="high"} from those values
  - Else if structured.salary_range_text populated:
      try parse_salary_text(...)
      on success: write salary{source="firecrawl", confidence="medium"}
      on failure: write salary = None  (CLEAR any stale prior value)
  - Else: leave salary untouched

Also writes the legacy top-level salary_display on tier-1 and tier-2
success so the existing FE reader (jobBoardAdapter.pickSalary) keeps
showing real numbers without an FE change in this PR.

Honest-on-failure: a tier-2 parse that succeeded last week but fails
today (data drifted) WIPES the prior value. We never carry a number
forward we cannot re-derive.

Usage:
  python -m backend.scripts.salary_backfill_t1_t2
  python -m backend.scripts.salary_backfill_t1_t2 --dry-run
  python -m backend.scripts.salary_backfill_t1_t2 --dry-run --verbose
  python -m backend.scripts.salary_backfill_t1_t2 --limit=500
"""
import os
import re
import sys
import time
import random
from datetime import datetime, timezone

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_SCRIPT_DIR, ".."))
sys.path.insert(0, os.path.join(_SCRIPT_DIR, "..", ".."))

from app.utils.salary_text_parser import parse_salary_text


# Re-implemented locally to classify why a parse returned None (for the
# dry-run rejection-reason breakdown). Mirrors parser internals.
_NON_USD_TOKENS = ("£", "€", "¥", "kr", "gbp", "eur", "cad", "aud")
_AMBIGUOUS_MARKERS = (
    "doe", "depends on experience", "competitive", "negotiable",
    "not disclosed", "not provided", "not specified", "tbd",
    "up to", "starting at",
    "/week", "/wk", "per week", "weekly",
    "sign-on", "signing bonus", "sign on bonus",
)
_DOLLAR_RE = re.compile(r"\$\s*[0-9]")


def _classify_rejection(text: str) -> str:
    """Return a short label for why parse_salary_text rejected `text`."""
    if not isinstance(text, str) or not text.strip():
        return "empty_or_null"
    t = text.strip()
    tl = t.lower()
    if any(c in t for c in ("£", "€", "¥")) or any(tok in tl for tok in ("gbp", "eur", "cad", "aud")):
        return "non_usd_currency"
    if any(m in tl for m in _AMBIGUOUS_MARKERS):
        return "ambiguous_marker"
    dollar_count = len(_DOLLAR_RE.findall(t))
    if dollar_count == 0:
        return "no_dollar_amounts"
    if dollar_count == 1:
        return "single_value_only"
    return "sanity_check_failed"


def _parse_flag(name: str) -> bool:
    return f"--{name}" in sys.argv


def _parse_int(name: str, default):
    for arg in sys.argv:
        if arg.startswith(f"--{name}="):
            try:
                return int(arg.split("=", 1)[1])
            except ValueError:
                pass
    return default


def _build_tier1_salary(job: dict, apply_url, now) -> dict:
    """Build the salary{} dict from top-level salary_min/max/period."""
    sal_min = job.get("salary_min")
    sal_max = job.get("salary_max")
    period_raw = (job.get("salary_period") or "").upper()
    if period_raw == "YEAR":
        period, mult = "annual", 1
    elif period_raw == "HOUR":
        period, mult = "hourly", 2080
    else:
        return None
    if not isinstance(sal_min, (int, float)) or not isinstance(sal_max, (int, float)):
        return None
    mn = int(round(float(sal_min) * mult))
    mx = int(round(float(sal_max) * mult))
    if mn <= 0 or mx <= mn:
        return None

    # Build display
    if period == "hourly":
        hr_min = mn / 2080
        hr_max = mx / 2080
        display = f"${hr_min:.0f}/hr - ${hr_max:.0f}/hr"
    elif mn % 1000 == 0 and mx % 1000 == 0:
        display = f"${mn // 1000}k - ${mx // 1000}k"
    else:
        display = f"${mn:,} - ${mx:,}"

    return {
        "min": mn,
        "max": mx,
        "period": period,
        "currency": "USD",
        "display": display,
        "source": "ats",
        "source_url": apply_url,
        "extracted_at": now,
        "confidence": "high",
    }


def _build_tier2_salary(parsed: dict, apply_url, now) -> dict:
    return {
        "min": parsed["min"],
        "max": parsed["max"],
        "period": parsed["period"],
        "currency": "USD",
        "display": parsed["display"],
        "source": "firecrawl",
        "source_url": apply_url,
        "extracted_at": now,
        "confidence": "medium",
    }


def main() -> int:
    dry_run = _parse_flag("dry-run")
    verbose = _parse_flag("verbose")
    limit = _parse_int("limit", None)

    import firebase_admin
    from firebase_admin import credentials, firestore
    if not firebase_admin._apps:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if cred_path and os.path.exists(cred_path):
            firebase_admin.initialize_app(credentials.Certificate(cred_path))
        else:
            firebase_admin.initialize_app()
    db = firestore.client()

    started = time.monotonic()
    now = datetime.now(timezone.utc)

    counts = {
        "scanned": 0,
        "skip_locked_tier1": 0,
        "write_tier1": 0,
        "write_tier2": 0,
        "blank_clear": 0,        # parse failed AND prior salary existed
        "blank_noop": 0,         # parse failed AND prior salary already null
        "untouched": 0,          # no tier-1 input AND no tier-2 input
    }

    # Diagnostic samples for the rich dry-run report
    suspicious_successes = []        # max > 3x min, eyeball candidates
    multi_zone_samples = []          # multi-range parses; user wants to verify
    rejection_samples_by_reason = {} # reason -> list[(job_id, original)]
    REJECTION_SAMPLE_PER_REASON = 5

    pending_writes = []

    iterator = db.collection("jobs").where("expires_at", ">", now).stream()
    for snap in iterator:
        if limit is not None and counts["scanned"] >= limit:
            break
        counts["scanned"] += 1
        j = snap.to_dict() or {}
        jid = snap.id
        existing_salary = j.get("salary") or {}
        apply_url = j.get("apply_url") or None

        # 1. Tier-1 lock: skip if already populated by tier-1 (ATS)
        if existing_salary.get("source") == "ats":
            counts["skip_locked_tier1"] += 1
            continue

        # 2. Tier-1 fresh: populate from top-level salary fields
        tier1 = _build_tier1_salary(j, apply_url, now)
        if tier1 is not None:
            counts["write_tier1"] += 1
            pending_writes.append((jid, tier1))
            if verbose:
                print(f"[t1]   {jid} -> {tier1['display']}")
            continue

        # 3. Tier-2: parse structured.salary_range_text
        text = (j.get("structured") or {}).get("salary_range_text")
        if not (isinstance(text, str) and text.strip()):
            counts["untouched"] += 1
            continue

        parsed = parse_salary_text(text)
        if parsed is None:
            # Honest-blank. Clear prior value if one existed.
            had_value = bool(existing_salary.get("source"))
            if had_value:
                counts["blank_clear"] += 1
                pending_writes.append((jid, None))
            else:
                counts["blank_noop"] += 1
            reason = _classify_rejection(text)
            bucket = rejection_samples_by_reason.setdefault(reason, [])
            if len(bucket) < REJECTION_SAMPLE_PER_REASON:
                bucket.append((jid, text[:140]))
            if verbose:
                print(f"[t2-]  {jid} ({reason}) <- {text[:80]!r}")
            continue

        # Tier-2 success
        counts["write_tier2"] += 1
        salary_doc = _build_tier2_salary(parsed, apply_url, now)
        pending_writes.append((jid, salary_doc))

        # Suspicious: max/min > 3 (likely equity contamination or base+OTE)
        if parsed["min"] > 0 and (parsed["max"] / parsed["min"]) > 3.0:
            suspicious_successes.append({
                "job_id": jid,
                "min": parsed["min"],
                "max": parsed["max"],
                "ratio": parsed["max"] / parsed["min"],
                "original": text[:140],
            })

        # Multi-range: original contained a semicolon
        if ";" in text:
            multi_zone_samples.append({
                "job_id": jid,
                "parsed_min": parsed["min"],
                "parsed_max": parsed["max"],
                "display": parsed["display"],
                "original": text[:200],
            })

        if verbose:
            print(f"[t2+]  {jid} -> {parsed['display']}")

    runtime = time.monotonic() - started

    # ---- Report ----
    print()
    print("========== Salary backfill {} ==========".format("DRY RUN" if dry_run else "WROTE"))
    print(f"Scanned active jobs:                {counts['scanned']:>8,}")
    print()
    print("Decision breakdown:")
    print(f"  Would write tier 1 (ATS):         {counts['write_tier1']:>8,}")
    print(f"  Would write tier 2 (Firecrawl):   {counts['write_tier2']:>8,}")
    print(f"  Would clear (honest blank):       {counts['blank_clear']:>8,}  (parse failed AND prior salary existed)")
    print(f"  Would no-op (already blank):      {counts['blank_noop']:>8,}  (parse failed AND already had no salary)")
    print(f"  Already locked at tier 1:         {counts['skip_locked_tier1']:>8,}")
    print(f"  Untouched (no tier 1/2 input):    {counts['untouched']:>8,}")
    print(f"Total to write/clear:               {len(pending_writes):>8,}")
    print(f"Runtime:                            {runtime:>8.1f}s")

    # Suspicious successes
    print()
    print("========== Suspicious tier-2 successes (max/min > 3, eyeball for equity contamination) ==========")
    print(f"Count: {len(suspicious_successes)}")
    if suspicious_successes:
        print()
        print(f"  {'job_id':<48} {'min':>10} {'max':>10} {'ratio':>6}  original")
        # Sort by ratio descending, show worst offenders first
        for s in sorted(suspicious_successes, key=lambda x: -x["ratio"])[:25]:
            print(
                f"  {s['job_id'][:48]:<48} "
                f"{s['min']:>10,} {s['max']:>10,} {s['ratio']:>5.2f}x "
                f" {s['original']!r}"
            )

    # Multi-zone parses
    print()
    print("========== Multi-zone 'take first range' samples (verify first range is consistently HCOL) ==========")
    print(f"Count: {len(multi_zone_samples)}")
    if multi_zone_samples:
        print()
        random.seed(42)
        sample = random.sample(multi_zone_samples, min(15, len(multi_zone_samples)))
        for m in sample:
            print(f"  job_id:      {m['job_id']}")
            print(f"  parsed:      ${m['parsed_min']:,} - ${m['parsed_max']:,}   display: {m['display']!r}")
            print(f"  original:    {m['original']!r}")
            print()

    # Honest-blank reasons
    print()
    print("========== Honest-blank rejection sample (jobs that did NOT parse) ==========")
    print(f"Reasons + counts:")
    blanked_total = counts['blank_clear'] + counts['blank_noop']
    print(f"  total blanked: {blanked_total}")
    for reason, samples in sorted(rejection_samples_by_reason.items()):
        print(f"\n  {reason}: showing up to {REJECTION_SAMPLE_PER_REASON} examples")
        for jid, original in samples:
            print(f"    {jid:<48}  {original!r}")

    if dry_run:
        print()
        print("(DRY RUN — no Firestore writes performed)")
        return 0

    # Apply writes
    BATCH_LIMIT = 400
    batch = db.batch()
    written = 0
    for idx, (jid, salary_value) in enumerate(pending_writes):
        ref = db.collection("jobs").document(jid)
        update = {"salary": salary_value}
        # Also write legacy top-level salary_display on success so existing
        # FE readers keep showing the real number with no FE change.
        if salary_value is not None:
            update["salary_display"] = salary_value.get("display")
        batch.update(ref, update)
        written += 1
        if (idx + 1) % BATCH_LIMIT == 0:
            batch.commit()
            batch = db.batch()
    if written:
        batch.commit()

    print()
    print(f"WROTE {written} document updates.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
