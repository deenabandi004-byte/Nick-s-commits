"""Scoring gate for the find-people SEO cluster (Phase 2, Step 1).

The gate decides which cells are worth building. It is the deliverable here,
not pages. Page count is an output of the gate, never an input.

  demand_signal(cell) = tier(school) * tier(firm)        # 1 to 9 (proxy)
  data_density(cell)  = bucket(alumni_count)             # 0 to 4
  score(cell)         = demand_signal * data_density
  build(cell)         = alumni_count >= FLOOR  AND  score >= THRESHOLD

The FLOOR is a hard, separate guard: a cell with a few alumni is thin by
construction and is skipped no matter how high demand is. Above the floor,
cells are ranked by score and built top down to whatever the ceiling allows.

Run (from repo root):
  PYTHONPATH="$(pwd):$(pwd)/backend" .venv/bin/python \\
    backend/scripts/seo/gate.py --floor 10 --threshold 12 --top 100
"""
from __future__ import annotations

import argparse
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")


def load(path: str) -> dict:
    with open(os.path.join(DATA_DIR, path), "r", encoding="utf-8") as fh:
        return json.load(fh)


def density_bucket(count: int) -> int:
    if count >= 1000:
        return 4
    if count >= 200:
        return 3
    if count >= 50:
        return 2
    if count >= 10:
        return 1
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    # The explicit floor. THRESHOLD=12 already excluded every density-1 cell
    # (10 to 49 alumni), so the real floor was ~50 all along. We name it here
    # instead of letting the threshold override FLOOR implicitly: density 2
    # (the lowest band that can clear) starts at 50 alumni.
    parser.add_argument("--floor", type=int, default=50, help="hard min alumni_count (explicit effective floor)")
    parser.add_argument("--threshold", type=int, default=12, help="min score to build")
    parser.add_argument("--top", type=int, default=100, help="cap the build list")
    parser.add_argument("--per-firm-cap", type=int, default=8,
                        help="max pilot pages per firm, for cluster diversity")
    args = parser.parse_args()

    schools = {s["slug"]: s for s in load("schools.json")["schools"]}
    firms = {f["slug"]: f for f in load("firms.json")["firms"]}
    counts = load("alumni_counts.json")

    rows = []
    for key, count in counts.items():
        sslug, fslug = key.split("|")
        s, f = schools.get(sslug), firms.get(fslug)
        if not s or not f:
            continue
        demand = s["tier"] * f["tier"]
        density = density_bucket(count)
        score = demand * density
        clears = count >= args.floor and score >= args.threshold
        rows.append({
            "slug": f"{sslug}-alumni-at-{fslug}",
            "school": sslug, "firm": fslug,
            "alumni_count": count, "demand": demand,
            "density": density, "score": score, "build": clears,
        })

    have_data = len(rows)
    above_floor = sum(1 for r in rows if r["alumni_count"] >= args.floor)
    # Break score ties by raw alumni count (denser cells first).
    clears = sorted([r for r in rows if r["build"]],
                    key=lambda r: (r["score"], r["alumni_count"]), reverse=True)

    print(f"Cells with count data: {have_data}")
    print(f"Cells above floor ({args.floor}+ alumni): {above_floor}")
    print(f"Cells that clear (floor AND score >= {args.threshold}): {len(clears)}")
    print("")
    print("Clears at a sweep of thresholds (floor held at "
          f"{args.floor}):")
    for t in (6, 9, 12, 16, 20, 24):
        n = sum(1 for r in rows if r["alumni_count"] >= args.floor and r["score"] >= t)
        print(f"  threshold {t:>2}: {n} cells")
    print("")
    print("Top of the build list:")
    for r in clears[:15]:
        print(f"  {r['slug']:<40} count={r['alumni_count']:>5} demand={r['demand']} "
              f"density={r['density']} score={r['score']}")

    # Greedy top-down with a per-firm cap so the pilot spans clusters
    # instead of filling with one firm's huge alumni base.
    build_list: list[dict] = []
    per_firm: dict[str, int] = {}
    for r in clears:
        if len(build_list) >= args.top:
            break
        if per_firm.get(r["firm"], 0) >= args.per_firm_cap:
            continue
        per_firm[r["firm"]] = per_firm.get(r["firm"], 0) + 1
        build_list.append(r)

    out_path = os.path.join(DATA_DIR, "find_people_buildlist.json")
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump({"floor": args.floor, "threshold": args.threshold,
                   "per_firm_cap": args.per_firm_cap,
                   "count": len(build_list), "cells": build_list}, fh, indent=2)
    by_firm = {}
    for r in build_list:
        by_firm[r["firm"]] = by_firm.get(r["firm"], 0) + 1
    print("")
    print(f"Wrote {len(build_list)} cells (per-firm cap {args.per_firm_cap}) to {out_path}")
    print(f"Firm spread in pilot: {dict(sorted(by_firm.items()))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
