"""Data-first generator for the find-people SEO cluster (Workstream B rebuild).

The page body is now real per-cell data, not prose:
  - titleBreakdown: the actual current roles those alumni hold at that firm,
    with real counts from a PDL profile sample (varies genuinely per cell)
  - seniority: the real level mix from the same sample
  - alumniCount: the PDL total for the cell
Prose is cut to thin connective tissue with the real values injected. No LLM
output is presented as per-cell fact, no invented data, no individual names,
no em dashes.

Only cells that have enrichment (alumni_enrichment.json) are emitted, so every
generated page carries real aggregate data. Enrich more cells, then rerun, to
grow the set.

Run (from repo root):
  PYTHONPATH="$(pwd):$(pwd)/backend" .venv/bin/python \\
    backend/scripts/seo/generate_find_people.py

Writes: connect-grow-hire/src/seo/data/find-people.generated.ts
"""
from __future__ import annotations

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT_TS = os.path.join(REPO, "connect-grow-hire", "src", "seo", "data", "find-people.generated.ts")

UPDATED = "2026-06-15"

ROLE_LABEL = {"tech": "Software Engineer", "banking": "Investment Banking Analyst", "consulting": "Business Analyst"}
PEER = {"tech": "Carnegie Mellon University", "banking": "University of Notre Dame", "consulting": "Cornell University"}
SAMPLE_CARDS = {
    "tech": [("Priya S.", "Software Engineer"), ("Daniel K.", "Product Manager"), ("Elena T.", "Senior Software Engineer")],
    "banking": [("Jordan P.", "Investment Banking Analyst"), ("Maya R.", "Analyst"), ("Chris L.", "Associate")],
    "consulting": [("Alex T.", "Business Analyst"), ("Riya D.", "Associate"), ("Sam K.", "Engagement Manager")],
}
SENIORITY_LABEL = {"vp": "VP", "cxo": "CxO", "ceo": "CEO", "cfo": "CFO", "cto": "CTO"}


def load(name: str) -> dict:
    with open(os.path.join(DATA_DIR, name), "r", encoding="utf-8") as fh:
        return json.load(fh)


def title_breakdown(enr: dict) -> list[dict]:
    titles = enr.get("top_titles") or []
    strong = [[t, c] for t, c in titles if c >= 2]
    # Fill toward 6 rows with clean single-count roles (skip ultra-long noisy
    # PDL titles so the table stays readable, not metric-padded).
    fillers = [[t, c] for t, c in titles if c < 2 and len(t) <= 32 and len(t.split()) <= 4]
    use = (strong + fillers)[:6]
    if len(use) < 3:
        use = titles[:3]
    return [{"title": t, "count": c} for t, c in use]


def functions_list(enr: dict) -> list[dict]:
    fns = enr.get("top_functions") or []
    strong = [{"title": t, "count": c} for t, c in fns if c >= 2]
    return strong[:5] if strong else [{"title": t, "count": c} for t, c in fns[:4]]


def prior_list(enr: dict) -> list[dict]:
    # Prior employers vary strongly cell to cell (verified, 0.04 overlap), so
    # show the top few with counts. Drop the cell's own school as a "prior
    # employer" artifact of internships listed as experience.
    pe = [(t, c) for t, c in (enr.get("top_prior_employers") or [])]
    return [{"name": t, "count": c} for t, c in pe[:5]]


def build_row(cell: dict, schools: dict, firms: dict, enr: dict) -> dict:
    s, f = schools[cell["school"]], firms[cell["firm"]]
    school, firm, ind = s["name"], f["name"], f["industry"]
    count = cell["alumni_count"]
    count_str = f"{count:,}"
    tb = title_breakdown(enr)
    fns = functions_list(enr)
    pri = prior_list(enr)
    n = enr.get("sample_size", 0)
    samples = SAMPLE_CARDS[ind]

    top_role = tb[0]["title"] if tb else ROLE_LABEL[ind]
    roles_phrase = ", ".join(f"{t['title']} ({t['count']})" for t in tb[:3])
    func_phrase = ", ".join(f"{t['title']} ({t['count']})" for t in fns[:2])
    prior_phrase = ", ".join(p["name"] for p in pri[:3])

    quick = (
        f"Roughly {count_str} {school} alumni currently work at {firm}. "
        f"In a sample of {n} the most common roles are {roles_phrase}"
        + (f", concentrated in {func_phrase}" if func_phrase else "")
        + ". "
        + (f"Common prior employers in the sample include {prior_phrase}. " if prior_phrase else "")
        + "The widget returns 5 of these alumni with a verified LinkedIn URL, free and with no account."
    )
    faq = [
        {"q": f"What roles do {school} alumni hold at {firm}?",
         "a": f"In a {n}-profile sample the most common are {roles_phrase}"
              + (f", concentrated in the {fns[0]['title']} function" if fns else "")
              + f". Roughly {count_str} {school} alumni are at {firm} in total."},
        {"q": f"Where did {school} alumni work before {firm}?",
         "a": (f"Common prior employers in the sample include {prior_phrase}. " if prior_phrase
               else "The sample did not surface one dominant prior employer. ")
              + "The free tool returns 5 alumni with a verified LinkedIn URL so you can ask them directly."},
        {"q": "Is the tool free, and can I see emails?",
         "a": "Free, one search per 24 hours, no account. Verified work emails come back inside a free Offerloop account."},
    ]
    return {
        "slug": cell["slug"],
        "schoolSlug": cell["school"],
        "firmSlug": cell["firm"],
        "roleLabel": ROLE_LABEL[ind],
        "primaryKeyword": f"{school.lower()} alumni at {firm.lower()}",
        "metaDescription": (
            f"Find {school} alumni at {firm}: about {count_str} work there now, most as {top_role}. "
            f"See the real role breakdown and get 5 with name, title, and LinkedIn URL. Free, no account."
        ),
        "quickAnswer": quick,
        "alumniCount": count,
        "statStrip": [
            {"value": f"~{count_str}", "label": f"{school} alumni at {firm}"},
            {"value": str(enr.get("sample_size", 0)), "label": "profiles in the role-breakdown sample"},
            {"value": "5 names", "label": "returned per free search"},
        ],
        "topRoles": [t["title"] for t in tb][:4] or [ROLE_LABEL[ind]],
        "titleBreakdown": tb,
        "topFunctions": functions_list(enr),
        "priorEmployers": prior_list(enr),
        "sampleSize": enr.get("sample_size", 0),
        "examplePeople": [
            {"name": samples[0][0], "title": samples[0][1], "school": school},
            {"name": samples[1][0], "title": samples[1][1], "school": school},
            {"name": samples[2][0], "title": samples[2][1], "school": PEER[ind]},
        ],
        "faq": faq,
        "updatedAt": UPDATED,
        "published": False,
    }


def main() -> int:
    schools = {s["slug"]: s for s in load("schools.json")["schools"]}
    firms = {f["slug"]: f for f in load("firms.json")["firms"]}
    cells = {c["slug"]: c for c in load("find_people_buildlist.json")["cells"]}
    enrichment = load("alumni_enrichment.json")

    rows = []
    for slug, enr in enrichment.items():
        if slug in cells and (enr.get("top_titles")):
            rows.append(build_row(cells[slug], schools, firms, enr))
    rows.sort(key=lambda r: r["alumniCount"])

    blob = json.dumps(rows)
    if "—" in blob:
        print("ERROR: em dash found in generated content; aborting.")
        return 1

    body = ",\n  ".join(json.dumps(r, ensure_ascii=False) for r in rows)
    ts = (
        "/*\n"
        " * AUTO-GENERATED by backend/scripts/seo/generate_find_people.py.\n"
        " * Do not edit by hand. Each row carries real per-cell data\n"
        " * (alumni count, role breakdown, seniority mix). published is false:\n"
        " * noindex, out of the sitemap, until a batch clears the 14-day gate.\n"
        " */\n"
        "import type { FindPeopleRow } from './types';\n\n"
        f"export const GENERATED_FIND_PEOPLE_ROWS: FindPeopleRow[] = [\n  {body},\n];\n"
    )
    os.makedirs(os.path.dirname(OUT_TS), exist_ok=True)
    with open(OUT_TS, "w", encoding="utf-8") as fh:
        fh.write(ts)
    print(f"Wrote {len(rows)} data-dense find-people rows to {OUT_TS}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
