#!/usr/bin/env python3
"""
SEO page generator — PDL-free.

Two phases, both cached so re-runs cost nothing for work already done:

  Phase A (facts)  : one Perplexity `pro_search` per FIRM -> structured firm
                     facts (ATS, recruiting timeline, interview process, what
                     they value, recent deals, comp band, divisions). Cached to
                     scripts/seo_cache/firm_facts/{firm}.json. ~60 calls total.

  Phase B (rows)   : one OpenAI call per (firm x role x cluster) -> a row object
                     matching the cluster's TS schema, following the SEO_STRATEGY
                     quality bars. Cached per row. Output written to
                     connect-grow-hire/src/seo/data/generated/{cluster}.generated.json
                     which the TS data files spread into their row arrays.

No PDL. Firm facts come from Perplexity (already paid); composition from OpenAI.

Usage (run from backend/):
  python scripts/seo_build_pages.py --facts-only --firms goldman-sachs
  python scripts/seo_build_pages.py --firms goldman-sachs,mckinsey --clusters resume-review
  python scripts/seo_build_pages.py --limit 5            # first 5 firms, all clusters
  python scripts/seo_build_pages.py                      # everything (uses caches)
  python scripts/seo_build_pages.py --publish            # mark generated rows published:true

Generated rows default to published:false so nothing goes live until you review
them and flip the flag (or re-run with --publish).
"""
import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

# Make `app` importable when run from backend/
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

try:
    from dotenv import load_dotenv
    load_dotenv(BACKEND_DIR.parent / ".env")
    load_dotenv(BACKEND_DIR / ".env")
except Exception:
    pass

REPO = BACKEND_DIR.parent
SEO_DATA = REPO / "connect-grow-hire" / "src" / "seo" / "data"
GEN_DIR = SEO_DATA / "generated"
CACHE_DIR = Path(__file__).resolve().parent / "seo_cache"
FACTS_DIR = CACHE_DIR / "firm_facts"
ROW_CACHE = CACHE_DIR / "rows"
for d in (GEN_DIR, FACTS_DIR, ROW_CACHE):
    d.mkdir(parents=True, exist_ok=True)

TODAY = time.strftime("%Y-%m-%d")
OPENAI_MODEL = os.environ.get("SEO_GEN_MODEL", "gpt-4.1")

# Clusters that are per (firm x role); ATS is per-firm only.
FIRM_ROLE_CLUSTERS = ("resume-review", "cover-letter", "interview-prep")
ALL_CLUSTERS = FIRM_ROLE_CLUSTERS + ("ats",)


# ───────────────────────── TS parsing ─────────────────────────

def _parse_objects(ts_text: str) -> list[dict]:
    """Pull flat { key: 'val', ... } objects out of a TS array literal."""
    out = []
    for block in re.findall(r"\{[^{}]*\}", ts_text):
        obj = {}
        for k, v in re.findall(r"(\w+):\s*'([^']*)'", block):
            obj[k] = v
        if obj:
            out.append(obj)
    return out


def load_firms() -> list[dict]:
    text = (SEO_DATA / "firms.ts").read_text(encoding="utf-8")
    # only the FIRMS array region
    text = text.split("export const FIRMS_BY_SLUG", 1)[0]
    return [o for o in _parse_objects(text) if "slug" in o and "name" in o and "ats" in o]


def load_roles() -> list[dict]:
    text = (SEO_DATA / "roles.ts").read_text(encoding="utf-8")
    text = text.split("export const ROLES_BY_SLUG", 1)[0]
    return [o for o in _parse_objects(text) if "slug" in o and "blurb" in o]


def existing_slugs(cluster: str) -> set[str]:
    """Hand-authored slugs already in the .ts file — skip to avoid dupes."""
    f = SEO_DATA / f"{cluster}.ts"
    if not f.exists():
        return set()
    return set(re.findall(r"slug:\s*'([^']+)'", f.read_text(encoding="utf-8")))


# ───────────────────────── Phase A: firm facts ─────────────────────────

FACTS_QUERY = """You are a recruiting research analyst. Research {name} ({domain}) for US college \
students recruiting for {industry} roles in 2026-2027. Return STRICT JSON only, no prose, with keys:

{{
  "ats": "the applicant tracking system the firm uses (Workday | Greenhouse | Lever | Ashby | iCIMS | Internal), best public knowledge",
  "recruiting_timeline": "2-3 sentences: when applications open and close for the next cycle, key dates, how early it runs",
  "interview_process": [{{"round": "name", "format": "what happens", "evaluates": "what they assess"}}],
  "values": ["3-5 specific things this firm screens candidates for"],
  "recent": ["2-3 specific, recent (2025-2026) deals, launches, or news items with enough detail to reference in a cover letter"],
  "comp": "entry-level total comp range for the target role, with source if known",
  "divisions": ["the main groups/divisions a student would apply to"],
  "locations": ["primary US offices for early-career hiring"]
}}

Only include facts you can verify. If a field is unknown, use an empty string or empty list. Do not invent numbers."""


def pull_firm_facts(firm: dict, force: bool = False) -> dict | None:
    cache = FACTS_DIR / f"{firm['slug']}.json"
    if cache.exists() and not force:
        return json.loads(cache.read_text(encoding="utf-8"))
    from app.services.perplexity_client import pro_search, _parse_json_response
    q = FACTS_QUERY.format(name=firm["name"], domain=firm.get("applicationDomain", ""),
                           industry=firm["industry"])
    res = pro_search(q, recency="year", timeout=60.0)
    content = (res or {}).get("content", "")
    if not content:
        print(f"  [facts] {firm['slug']}: empty Perplexity response, skipping")
        return None
    parsed = _parse_json_response(content)
    if not isinstance(parsed, dict) or "raw_text" in parsed:
        print(f"  [facts] {firm['slug']}: non-JSON response, skipping")
        return None
    parsed["_citations"] = (res or {}).get("citations", [])
    parsed["_pulled"] = TODAY
    cache.write_text(json.dumps(parsed, indent=2), encoding="utf-8")
    print(f"  [facts] {firm['slug']}: cached ({len(parsed.get('recent', []))} news, ats={parsed.get('ats')})")
    return parsed


# ───────────────────────── Phase B: row composition ─────────────────────────

QUALITY_RULES = """QUALITY BARS (non-negotiable):
- Product-led: the page maps to one Offerloop action and ends in one CTA. The body sells the firm-specific facts, not generic advice.
- Never fabricate a statistic. Every number in statStrip must come from the firm facts provided or be a widely-cited industry figure you name the source for. If you lack a real number, use a qualitative tile instead.
- The uniqueDataBlock must be firm-AND-role specific: what THIS firm's ATS / JD / interview actually checks. No generic resume advice.
- Copy rules: no em dashes, no exclamation marks, no "sparkle" filler, builder voice, concrete over vague.
- FAQ answers are tailored to the firm + role, 1-3 sentences, factual.
- Output MUST be a single JSON object matching the schema exactly. No markdown, no commentary."""

SCHEMAS = {
    "resume-review": """{
  "slug": "<firmSlug>-<roleSlug>", "firmSlug": "...", "roleSlug": "...",
  "primaryKeyword": "lowercase keyword like '<role> resume for <firm>'",
  "metaDescription": "<=160 chars, keyword early",
  "quickAnswer": "40-60 word AEO answer ending by pointing at the free widget",
  "statStrip": [{"value":"...","label":"... (source)"},{"value":"...","label":"..."},{"value":"...","label":"..."}],
  "uniqueDataBlock": [{"title":"...","body":"1-2 sentences"} x6-8],
  "examplePanel": {"studentBlurb":"...","score":<60-95>,"scoreLabel":"strong|solid|needs work","previousScore":<lower>,"rewriteCount":<int>,
    "recommendations":[{"section":"EXPERIENCE|FORMAT|KEYWORDS","chip":"...","severity":"high|medium|low","original":"...","suggested":"...","why":"..."} x3]},
  "faq": [{"q":"...","a":"..."} x6-8],
  "updatedAt": "%s", "published": %s
}""",
    "cover-letter": """{
  "slug": "<firmSlug>-<roleSlug>", "firmSlug": "...", "roleSlug": "...",
  "primaryKeyword": "lowercase like 'cover letter for <firm> <role>'",
  "metaDescription": "<=160 chars", "quickAnswer": "40-60 words",
  "uniqueDataBlock": [{"title":"...","body":"..."} x6-8],
  "examplePanel": {"studentBlurb":"...","location":"city","wordCount":<250-350>,"paragraphs":["greeting","body1","body2","body3","signature"]},
  "faq": [{"q":"...","a":"..."} x6-8],
  "updatedAt": "%s", "published": %s
}""",
    "interview-prep": """{
  "slug": "<firmSlug>-<roleSlug>", "firmSlug": "...", "roleSlug": "...",
  "primaryKeyword": "lowercase like '<firm> <role> interview questions'",
  "metaDescription": "<=160 chars", "quickAnswer": "40-60 words",
  "process": {"timeline":"...","rounds":[{"name":"...","format":"...","evaluate":"..."} x3-5]},
  "statStrip": [{"value":"...","label":"..."} x3],
  "sampleCase": {"kicker":"CASE 1 OF N","title":"...","body":"detailed sample question/case"},
  "sampleBehavioral": {"kicker":"BEHAVIORAL","question":"...","body":"model answer outline"},
  "drillSample": {"kicker":"DRILL","title":"...","body":"..."},
  "firmIntel": ["4-6 firm-specific bullets"],
  "faq": [{"q":"...","a":"..."} x6-8],
  "updatedAt": "%s", "published": %s
}""",
    "ats": """{
  "slug": "<firmSlug>", "variant": "by-firm", "firmSlug": "...",
  "primaryKeyword": "lowercase like '<firm> ats resume'",
  "metaDescription": "<=160 chars", "quickAnswer": "40-60 words naming the firm's ATS",
  "statStrip": [{"value":"...","label":"... (source)"} x3],
  "uniqueDataBlock": [{"title":"...","body":"... specific to THIS firm's ATS"} x6-8],
  "examplePanel": {"studentBlurb":"...","score":<60-95>,"scoreLabel":"...","previousScore":<lower>,"rewriteCount":<int>,
    "recommendations":[{"section":"...","chip":"...","severity":"high|medium|low","original":"...","suggested":"...","why":"..."} x3]},
  "faq": [{"q":"...","a":"..."} x6-8],
  "updatedAt": "%s", "published": %s
}""",
}


def compose_row(cluster: str, firm: dict, role: dict | None, facts: dict, publish: bool) -> dict | None:
    slug = firm["slug"] if cluster == "ats" else f"{firm['slug']}-{role['slug']}"
    cache = ROW_CACHE / f"{cluster}__{slug}.json"
    if cache.exists():
        row = json.loads(cache.read_text(encoding="utf-8"))
        row["published"] = publish
        return row
    from app.services.openai_client import get_openai_client
    client = get_openai_client()
    if client is None:
        print("  [rows] OPENAI_API_KEY missing — cannot compose")
        return None

    schema = SCHEMAS[cluster] % (TODAY, "true" if publish else "false")
    role_line = "" if role is None else f"Role: {role['name']} ({role['shortName']}). {role['blurb']}\n"
    facts_blob = json.dumps({k: v for k, v in facts.items() if not k.startswith("_")}, indent=2)
    prompt = f"""Compose ONE {cluster} page row as JSON.

Firm: {firm['name']} ({firm['shortName']}), industry {firm['industry']}, ATS {firm['ats']}, portal {firm.get('applicationDomain','')}.
{role_line}
FIRM FACTS (from research, use these for all firm-specific claims):
{facts_blob}

{QUALITY_RULES}

Return JSON EXACTLY matching this schema (fill every field; slug must be "{slug}"):
{schema}"""

    try:
        resp = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": "You write product-led SEO page data as strict JSON. You never fabricate statistics."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.5,
        )
        row = json.loads(resp.choices[0].message.content)
    except Exception as e:
        print(f"  [rows] {cluster}/{slug}: failed ({e})")
        return None

    row["slug"] = slug
    row["published"] = publish
    row["updatedAt"] = TODAY
    if cluster == "ats":
        row["variant"] = "by-firm"
        row["firmSlug"] = firm["slug"]
    else:
        row["firmSlug"] = firm["slug"]
        row["roleSlug"] = role["slug"]
    cache.write_text(json.dumps(row, indent=2), encoding="utf-8")
    print(f"  [rows] {cluster}/{slug}: composed")
    return row


# ───────────────────────── orchestration ─────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--firms", help="comma-separated firm slugs (default: all)")
    ap.add_argument("--clusters", help=f"comma-separated (default: {','.join(ALL_CLUSTERS)})")
    ap.add_argument("--limit", type=int, help="only the first N firms")
    ap.add_argument("--facts-only", action="store_true", help="Phase A only")
    ap.add_argument("--force-facts", action="store_true", help="re-pull cached firm facts")
    ap.add_argument("--publish", action="store_true", help="mark generated rows published:true")
    ap.add_argument("--dry-run", action="store_true", help="print plan, no API calls")
    args = ap.parse_args()

    firms = load_firms()
    roles = load_roles()
    if args.firms:
        want = {s.strip() for s in args.firms.split(",")}
        firms = [f for f in firms if f["slug"] in want]
    if args.limit:
        firms = firms[: args.limit]
    clusters = [c.strip() for c in args.clusters.split(",")] if args.clusters else list(ALL_CLUSTERS)

    print(f"Firms: {len(firms)} | Roles: {len(roles)} | Clusters: {clusters}")
    if args.dry_run:
        for f in firms:
            n = sum(1 for r in roles if r["industry"] == f["industry"]) * len([c for c in clusters if c in FIRM_ROLE_CLUSTERS])
            n += 1 if "ats" in clusters else 0
            print(f"  {f['slug']:20s} -> ~{n} rows")
        return

    # Phase A
    print("\n== Phase A: firm facts (Perplexity) ==")
    facts_by_firm = {}
    for f in firms:
        facts = pull_firm_facts(f, force=args.force_facts)
        if facts:
            facts_by_firm[f["slug"]] = facts
    if args.facts_only:
        print(f"\nDone. {len(facts_by_firm)}/{len(firms)} firms have facts cached.")
        return

    # Phase B
    print("\n== Phase B: row composition (OpenAI) ==")
    generated = {c: [] for c in clusters}
    for f in firms:
        facts = facts_by_firm.get(f["slug"])
        if not facts:
            print(f"  skip {f['slug']}: no facts")
            continue
        for c in clusters:
            skip = existing_slugs(c)
            if c == "ats":
                if f["slug"] in skip:
                    continue
                row = compose_row(c, f, None, facts, args.publish)
                if row:
                    generated[c].append(row)
            else:
                for r in roles:
                    if r["industry"] != f["industry"]:
                        continue
                    if f"{f['slug']}-{r['slug']}" in skip:
                        continue
                    row = compose_row(c, f, r, facts, args.publish)
                    if row:
                        generated[c].append(row)

    # Write generated JSON (merge with anything already generated in prior runs)
    print("\n== Writing generated JSON ==")
    for c in clusters:
        out = GEN_DIR / f"{c}.generated.json"
        prior = {}
        if out.exists():
            for row in json.loads(out.read_text(encoding="utf-8")):
                prior[row["slug"]] = row
        for row in generated[c]:
            prior[row["slug"]] = row
        rows = list(prior.values())
        out.write_text(json.dumps(rows, indent=2), encoding="utf-8")
        print(f"  {c}.generated.json: {len(rows)} rows total")

    print("\nDone. Run `node scripts/generate-seo-sitemap.cjs` (in connect-grow-hire) "
          "after flipping rows to published, then review before deploy.")


if __name__ == "__main__":
    main()
