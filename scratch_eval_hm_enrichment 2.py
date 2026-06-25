"""SCRATCH — quality eval for HM Perplexity + Firecrawl enrichment.

Not for commit. Run from the repo root:
    python3 scratch_eval_hm_enrichment.py

What it does (no PDL — bypasses the quota issue):
  1. extract_job_posting on 3 real job-posting URLs (Firecrawl)
  2. verify_hiring_managers_v2 on 3 known names (Perplexity, structured output)
  3. batch_enrich_company_news on 3 well-known companies (Perplexity)

Cost: ~$0.15 total (3 Firecrawl scrapes @ ~5 credits each, ~6-9 Perplexity
calls @ ~$0.01 each). Edit URLs / names / companies inline as needed.

Read the output side-by-side and judge: are answers correct? Schema valid?
Useful for emails? Decide ship-ready vs needs-tuning.
"""
from __future__ import annotations
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

# Trigger app.config import so .env loads BEFORE we check env vars.
from app import config as _cfg  # noqa: F401, E402

# Required env: PERPLEXITY_API_KEY, FIRECRAWL_API_KEY
for var in ("PERPLEXITY_API_KEY", "FIRECRAWL_API_KEY"):
    if not os.getenv(var):
        print(f"WARN: {var} not set — that section will skip.")


# ─── Test inputs (edit these freely) ─────────────────────────────────────

# 3 real job-posting URLs across ATSes. Greenhouse and Lever expose hiring
# manager / recruiting team names more often than Workday.
JOB_URLS = [
    "https://www.ziprecruiter.com/Jobs/Ai-Data-Scientist?lk=gulYapx3pGIOUDpZFnlOHQ",
    "https://www.ziprecruiter.com/Jobs/Ai-Data-Scientist?lk=YN0YD4lmH1IY7xgYmquw1g",
    "https://www.indeed.com/?json=1&from=rnonboarding&vjk=f576547424cdcf6c&advn=7094832873033074",
]

# Real people likely-still / likely-not at the named company.
# Add edge cases (recently-departed executives, fake names) to stress the schema.
VERIFY_TARGETS = [
    # --- still-there (should NOT be dropped) ---
    {"FirstName": "Sundar",  "LastName": "Pichai",   "company": "Google",   "job_title": "Chief Executive Officer", "expected": "yes"},
    {"FirstName": "Brian",   "LastName": "Chesky",   "company": "Airbnb",   "job_title": "Chief Executive Officer", "expected": "yes"},
    {"FirstName": "Tobi",    "LastName": "Lütke",    "company": "Shopify",  "job_title": "Chief Executive Officer", "expected": "yes"},
    # --- known-departed (SHOULD be dropped if Perplexity is accurate) ---
    {"FirstName": "Jack",    "LastName": "Dorsey",   "company": "Twitter",  "job_title": "Chief Executive Officer", "expected": "no"},
    {"FirstName": "Adam",    "LastName": "Neumann",  "company": "WeWork",   "job_title": "Chief Executive Officer", "expected": "no"},
    {"FirstName": "Travis",  "LastName": "Kalanick", "company": "Uber",     "job_title": "Chief Executive Officer", "expected": "no"},
    {"FirstName": "Sheryl",  "LastName": "Sandberg", "company": "Meta",     "job_title": "Chief Operating Officer", "expected": "no"},
    # --- fake / unknown (should return unknown — kept by pipeline) ---
    {"FirstName": "Fake",    "LastName": "Person",   "company": "Stripe",   "job_title": "Software Engineer",       "expected": "unknown"},
]

# Companies to fetch recent news for (used by the email-hook enrichment).
# Mix: high-news-velocity, medium, quieter, very quiet — to see if Fix C made
# Stripe behave AND to spot which companies justifiably return NONE.
NEWS_COMPANIES = ["Stripe", "OpenAI", "Anthropic", "Notion", "Linear", "Plaid"]

# ─── Eval runners ────────────────────────────────────────────────────────


def hr(label: str):
    print("\n" + "=" * 78)
    print(f"  {label}")
    print("=" * 78)


def section_firecrawl():
    hr("1. FIRECRAWL: extract_job_posting (hiring_manager field is what we care about)")
    if not os.getenv("FIRECRAWL_API_KEY"):
        print("  SKIPPED — no FIRECRAWL_API_KEY")
        return
    from app.services.firecrawl_client import extract_job_posting

    for url in JOB_URLS:
        print(f"\n  URL: {url}")
        t0 = time.time()
        try:
            posting = extract_job_posting(url)
            dt = time.time() - t0
        except Exception as e:
            print(f"    EXCEPTION ({time.time()-t0:.1f}s): {e}")
            continue
        if not posting:
            print(f"    (empty result, {dt:.1f}s — Firecrawl may have failed or cached an empty)")
            continue
        # Highlight the only field we care about for this feature
        hm = posting.get("hiring_manager")
        print(f"    [{dt:.1f}s] hiring_manager → {hm!r}")
        # Useful context — show what else we got
        for k in ("title", "company", "location", "team_or_department", "experience_level"):
            v = posting.get(k)
            if v:
                v_str = (v[:80] + "…") if isinstance(v, str) and len(v) > 80 else v
                print(f"           {k}: {v_str!r}")


def section_verify():
    hr("2. PERPLEXITY: verify_hiring_managers_v2 (structured output, ~2s each in parallel)")
    if not os.getenv("PERPLEXITY_API_KEY"):
        print("  SKIPPED — no PERPLEXITY_API_KEY")
        return
    from app.services.perplexity_client import verify_hiring_managers_v2

    verdicts = []
    for target in VERIFY_TARGETS:
        expected = target.get("expected", "?")
        print(f"\n  {target['FirstName']} {target['LastName']} @ {target['company']} ({target['job_title']!r}) [expected={expected}]:")
        t0 = time.time()
        results = verify_hiring_managers_v2(
            hms=[target],
            company=target["company"],
            job_title=target["job_title"],
        )
        dt = time.time() - t0
        if not results:
            print(f"    [{dt:.1f}s] EMPTY RESPONSE")
            verdicts.append((target, None, None, "EMPTY"))
            continue
        r = results[0]
        still = r.get("still_at_company")
        conf = r.get("confidence")
        print(f"    [{dt:.1f}s] still_at_company={still!r:10} confidence={conf!r:10}")
        print(f"           current_title={r.get('current_title')!r}")
        print(f"           actively_hiring={r.get('actively_hiring')!r}")
        sig = r.get("recent_hiring_signal", "")
        if sig:
            print(f"           signal: {sig[:200]}{'…' if len(sig) > 200 else ''}")
        # Pipeline action
        would_drop = still == "no" and conf != "low"
        action = "DROPPED" if would_drop else "kept"
        # PASS/FAIL judgment
        if expected == "yes":
            ok = (still == "yes") and not would_drop
        elif expected == "no":
            ok = would_drop  # We expect Perplexity to be confident enough to drop
        elif expected == "unknown":
            ok = (still == "unknown") and not would_drop
        else:
            ok = None
        tag = "✓" if ok else ("✗" if ok is False else "?")
        print(f"           → pipeline verdict: {action}   [{tag}]")
        verdicts.append((target, still, conf, action))

    # Summary table
    print("\n  ── Verification summary ──")
    passes, fails = 0, 0
    for target, still, conf, action in verdicts:
        expected = target.get("expected", "?")
        if expected == "yes":
            ok = still == "yes" and action == "kept"
        elif expected == "no":
            ok = action == "DROPPED"
        elif expected == "unknown":
            ok = still == "unknown" and action == "kept"
        else:
            ok = None
        if ok is True:
            passes += 1
            mark = "PASS"
        elif ok is False:
            fails += 1
            mark = "FAIL"
        else:
            mark = "?"
        name = f"{target['FirstName']} {target['LastName']}"
        print(f"    [{mark}] {name:25} @ {target['company']:10} expected={expected:8} got still={still!r:10} conf={conf!r:8} action={action}")
    print(f"\n  Totals: {passes} PASS / {fails} FAIL / {len(verdicts) - passes - fails} other")


def section_news():
    hr("3. PERPLEXITY: batch_enrich_company_news (one bullet list per company, 24h cache)")
    if not os.getenv("PERPLEXITY_API_KEY"):
        print("  SKIPPED — no PERPLEXITY_API_KEY")
        return
    from app.services.perplexity_client import batch_enrich_company_news

    contacts = [{"FirstName": "Test", "LastName": "User", "Company": c} for c in NEWS_COMPANIES]
    t0 = time.time()
    news_by_idx = batch_enrich_company_news(contacts)
    dt = time.time() - t0
    print(f"\n  ({dt:.1f}s total for {len(NEWS_COMPANIES)} companies)\n")

    for idx, contact in enumerate(contacts):
        company = contact["Company"]
        payload = news_by_idx.get(idx, {})
        items = payload.get("company_recent_news", [])
        print(f"  {company}:")
        if not items:
            print("    (no news returned)")
            continue
        for item in items[:5]:
            print(f"    • {item}")
        # Show what the email prompt would actually see
        print(f"    → would inject {min(len(items), 3)} bullet(s) into outreach prompt")


def main():
    print("HM enrichment quality eval — scratch script (do not commit)")
    print(f"Cost guard: roughly $0.15-0.30 total. Ctrl-C to abort.\n")
    if os.getenv("RUN_FIRECRAWL_SECTION") == "1":
        section_firecrawl()
    else:
        hr("1. FIRECRAWL — SKIPPED (set RUN_FIRECRAWL_SECTION=1 to enable)")
    section_verify()
    section_news()
    hr("DONE — share output with reviewer to judge ship-readiness")


if __name__ == "__main__":
    main()
