"""
Discovery aggregation (phase 1).

Computes a per-company DISCOVERY signal from Firestore data only. The
intuition: companies that flood our feed (many open roles) are easier to
find through normal search and get a LOW discovery score. Companies with
one or two roles in the active window are off the beaten path and get a
HIGH discovery score.

Phase 1 role: this signal feeds the bucket tagger's HIDDEN GEM branch
but the composite weight for discovery is 0, so it does not affect feed
ordering yet. See ranking config for the dial board.

Phase 2 caveat: pure inverse-popularity is naive. A one-posting no-name
company scores ~100 with no quality filter. Do NOT turn discovery weight
above 0 in phase 2 without combining with at least one second axis
(saves per company, views per company, apply CTR). The hidden-gem bucket
will fill with random one-off postings otherwise.

Algorithm:
  1. Query `jobs` where expires_at > now. This matches the 14-day window
     the pipeline uses for active jobs.
  2. Group by normalized company name. Skip empty companies.
  3. Tie-aware percentile rank by job count (higher count -> higher
     percentile -> lower discovery).
  4. discovery = round(100 * (1 - percentile))
  5. Write {discovery_score, job_count_14d, computed_at, source_count,
     display_name} to company_signals/{normalized_slug} with merge=True.

Idempotent: each run overwrites. Safe to re-run.

Usage:
    python -m backend.scripts.discovery_aggregation
    python -m backend.scripts.discovery_aggregation --dry-run
    python -m backend.scripts.discovery_aggregation --verbose
"""
import os
import re
import sys
import time
from datetime import datetime, timezone

# Both path styles for the transitive imports (mirrors diagnose_intent_gates.py)
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_SCRIPT_DIR, ".."))
sys.path.insert(0, os.path.join(_SCRIPT_DIR, "..", ".."))


def _normalize_company(name: str) -> str:
    """Lowercased, alnum-only slug. 'Open AI, Inc.' -> 'openai'."""
    if not isinstance(name, str):
        return ""
    return re.sub(r"[^a-z0-9]+", "", name.lower())


def _parse_flag(name: str) -> bool:
    return f"--{name}" in sys.argv


def _summarize(scores_by_slug: dict, counts_by_slug: dict, raw_names: dict) -> str:
    """Return a Markdown summary of the score distribution.

    Used by --dry-run and printed to stdout. Layout:
      - total companies
      - median discovery
      - histogram (10 buckets)
      - top-5 lowest discovery (most popular)
      - bottom-5 highest discovery (most underground)
    """
    if not scores_by_slug:
        return "(no companies)"

    scores = sorted(scores_by_slug.values())
    n = len(scores)
    median = scores[n // 2] if n % 2 == 1 else (scores[n // 2 - 1] + scores[n // 2]) / 2.0

    # Histogram in 10 buckets (0-9, 10-19, ..., 90-100 inclusive)
    bins = [0] * 10
    for s in scores:
        idx = min(9, max(0, s // 10))
        bins[idx] += 1

    by_score = sorted(scores_by_slug.items(), key=lambda x: (x[1], -counts_by_slug.get(x[0], 0)))
    bottom_5 = by_score[:5]
    top_5 = list(reversed(by_score[-5:]))

    lines = []
    lines.append(f"Total companies: {n}")
    lines.append(f"Median discovery: {median:.1f}")
    lines.append("")
    lines.append("Histogram (count of companies per discovery band):")
    for i, b in enumerate(bins):
        lo, hi = i * 10, (i * 10 + 9) if i < 9 else 100
        bar = "#" * min(40, b)
        lines.append(f"  {lo:3d}-{hi:3d}: {b:4d}  {bar}")
    lines.append("")
    lines.append("Most popular (lowest discovery, top 5 by job count):")
    for slug, score in bottom_5:
        cnt = counts_by_slug.get(slug, 0)
        name = raw_names.get(slug, slug)
        lines.append(f"  discovery={score:3d}  jobs={cnt:4d}  {name}")
    lines.append("")
    lines.append("Most underground (highest discovery, bottom 5 by job count):")
    for slug, score in top_5:
        cnt = counts_by_slug.get(slug, 0)
        name = raw_names.get(slug, slug)
        lines.append(f"  discovery={score:3d}  jobs={cnt:4d}  {name}")

    return "\n".join(lines)


def main() -> int:
    dry_run = _parse_flag("dry-run")
    verbose = _parse_flag("verbose")

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

    counts: dict = {}
    raw_names: dict = {}
    scanned = 0

    # Stream active jobs. expires_at is set by writer.py at fetched_at + 14d.
    iterator = db.collection("jobs").where("expires_at", ">", now).stream()
    for snap in iterator:
        scanned += 1
        j = snap.to_dict() or {}
        company = j.get("company")
        slug = _normalize_company(company or "")
        if not slug:
            continue
        counts[slug] = counts.get(slug, 0) + 1
        raw_names.setdefault(slug, company)

    if not counts:
        print(f"[discovery] no active jobs found; scanned={scanned}")
        return 0

    # Tie-aware percentile rank: companies with the same count get the same
    # discovery score. Sort ascending by (count, slug) for stable ties, then
    # walk to assign average rank within each tie group.
    sorted_items = sorted(counts.items(), key=lambda x: (x[1], x[0]))
    n = len(sorted_items)
    ranks: dict = {}
    i = 0
    while i < n:
        j = i
        while j < n and sorted_items[j][1] == sorted_items[i][1]:
            j += 1
        avg_rank = (i + j - 1) / 2.0
        for k in range(i, j):
            ranks[sorted_items[k][0]] = avg_rank
        i = j

    scores: dict = {}
    payloads: list = []
    for slug, count in counts.items():
        rank = ranks[slug]
        percentile = rank / max(1.0, n - 1)
        discovery = int(round(100 * (1.0 - percentile)))
        scores[slug] = discovery
        payload = {
            "discovery_score": discovery,
            "job_count_14d": count,
            "computed_at": now,
            "source_count": n,
            "display_name": raw_names.get(slug, slug),
        }
        if verbose:
            print(f"[discovery] {slug:30s} count={count:4d} -> discovery={discovery:3d}")
        payloads.append((slug, payload))

    summary = _summarize(scores, counts, raw_names)
    runtime = time.monotonic() - started

    if dry_run:
        print(f"[discovery] DRY RUN — would have written {len(payloads)} docs")
        print(f"[discovery] scanned={scanned} unique_companies={n} runtime={runtime:.1f}s")
        print("")
        print(summary)
        return 0

    batch = db.batch()
    BATCH_LIMIT = 400
    for idx, (slug, payload) in enumerate(payloads):
        ref = db.collection("company_signals").document(slug)
        batch.set(ref, payload, merge=True)
        if (idx + 1) % BATCH_LIMIT == 0:
            batch.commit()
            batch = db.batch()
    batch.commit()

    print(f"[discovery] wrote {len(payloads)} docs, scanned {scanned} jobs, "
          f"{n} unique companies, runtime={runtime:.1f}s")
    print("")
    print(summary)
    return 0


if __name__ == "__main__":
    sys.exit(main())
