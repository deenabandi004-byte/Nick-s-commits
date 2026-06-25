"""One-shot live canary for the Find Companies migration.

Runs ONE real search end-to-end against Perplexity + Firecrawl + the LLM
normalizer, prints the top firms, and exits. Costs roughly one Perplexity
sonar-pro call plus a small number of Firecrawl extracts (only for firms
where discovery didn't return a complete website + employeeCount).

Gated behind `--live` so it cannot fire by accident. Without the flag, the
script prints the plan and exits without making any API calls.

Usage:
    cd backend
    python scripts/canary_find_companies.py             # dry-run
    python scripts/canary_find_companies.py --live      # real call

Env vars required for --live:
    PERPLEXITY_API_KEY
    FIRECRAWL_API_KEY
    OPENAI_API_KEY (or CLAUDE_API_KEY) — for the fallback normalizer
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

# Make both `app.*` and `backend.app.*` resolvable regardless of CWD.
# (Prod runs as `backend.wsgi:app` under gunicorn, so both prefixes work there;
# this mirrors that for the script.)
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_REPO_ROOT = _BACKEND_DIR.parent
for p in (_BACKEND_DIR, _REPO_ROOT):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))


DEFAULT_QUERY = "fintech startups in San Francisco with 50-500 employees"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true",
                        help="Make real API calls. Without this flag, prints the plan and exits.")
    parser.add_argument("--query", default=DEFAULT_QUERY,
                        help=f"Natural-language firm-search query (default: {DEFAULT_QUERY!r})")
    parser.add_argument("--limit", type=int, default=5,
                        help="Number of firms to request (default: 5)")
    args = parser.parse_args()

    print(f"Query: {args.query!r}")
    print(f"Limit: {args.limit}")
    print(f"Mode:  {'LIVE — will call Perplexity, Firecrawl, and the LLM normalizer' if args.live else 'DRY-RUN'}")
    print()

    if not args.live:
        print("Re-run with --live to perform the call. Estimated cost:")
        print("  - 1 Perplexity sonar-pro discovery call")
        print("  - 0-N Firecrawl extract calls (only for firms missing website/employeeCount)")
        print("  - 0-1 LLM normalization calls (only when fallback enrichment fires)")
        return 0

    # Importing app.config triggers load_dotenv(), so the env-var check below
    # sees the same values the running app would.
    from app.config import PERPLEXITY_API_KEY, FIRECRAWL_API_KEY
    missing = [name for name, val in (
        ("PERPLEXITY_API_KEY", PERPLEXITY_API_KEY),
        ("FIRECRAWL_API_KEY", FIRECRAWL_API_KEY),
    ) if not val]
    if missing:
        print(f"ERROR: {', '.join(missing)} not set in .env. Aborting.")
        return 1

    from app.services.company_search import search_firms

    t0 = time.time()
    result = search_firms(args.query, limit=args.limit)
    elapsed = time.time() - t0

    firms = result.get("firms", [])
    print(f"Returned {len(firms)} firms in {elapsed:.2f}s")
    print(f"Parsed filters: {json.dumps(result.get('parsedFilters', {}), indent=2)}")
    print()

    for i, firm in enumerate(firms, 1):
        loc = firm.get("location", {})
        loc_str = loc.get("display") or f"{loc.get('city', '?')}, {loc.get('state', '?')}"
        print(f"{i}. {firm.get('name')}")
        print(f"     website:  {firm.get('website') or '—'}")
        print(f"     linkedin: {firm.get('linkedinUrl') or '—'}")
        print(f"     emp:      {firm.get('employeeCount') or '—'} ({firm.get('sizeBucket') or '?'})")
        print(f"     founded:  {firm.get('founded') or '—'}")
        print(f"     location: {loc_str}")
        print()

    if not firms:
        print("WARNING: zero firms returned. Investigate.")
        return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
