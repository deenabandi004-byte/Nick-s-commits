#!/usr/bin/env python3
"""One-shot: run Perplexity deep research on early-career resume best practices
and save the result as docs/resume_principles.md. This MD file is loaded by the
public resume-review recommender to ground its suggestions in real principles
rather than generic GPT advice.

Calls Perplexity directly (bypasses the wrapper) with a 10-minute timeout so
sonar-deep-research has room to complete.

Usage:
    .venv/bin/python backend/scripts/build_resume_principles.py
"""
from __future__ import annotations

import os
import sys
from datetime import datetime
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]

    # Load .env
    try:
        from dotenv import load_dotenv
        load_dotenv(repo_root / ".env")
    except Exception:
        pass

    api_key = os.environ.get("PERPLEXITY_API_KEY")
    if not api_key:
        print("ERROR: PERPLEXITY_API_KEY not set in .env", file=sys.stderr)
        return 1

    try:
        from openai import OpenAI
    except ImportError:
        print("ERROR: openai package not installed in this venv", file=sys.stderr)
        return 1

    query = """
You are writing a definitive, evidence-based reference document on how to write
a great resume for an early-career candidate (undergraduate junior/senior, or
0-2 years of experience) targeting recruiting in CONSULTING (MBB, Big 4),
INVESTMENT BANKING (bulge bracket, EBs), and TECH (Google, Meta, Amazon, AI
startups). The reader will use this document as a rubric: given a candidate's
current resume and a specific job description, the reader must be able to
identify substantive, specific improvements to bullets, summary, skills, and
structure.

Cover at minimum:

1) Structural rules
   - Section order (Education first vs Experience first for early-career)
   - One-page rule and exceptions
   - Reverse chronological ordering
   - Use of dates, locations, headers, GPA cutoffs
   - Common ATS-friendly formatting rules (no tables, no columns, parseable fonts)
   - When to include Skills, Projects, Activities/Leadership, Certifications

2) Bullet writing
   - The CAR / STAR / "what you did + how + impact" pattern
   - Strong action verbs (give a curated list, organized by skill area)
   - Quantification: types of metrics, how to estimate when you don't know,
     never inflate
   - Specificity: technologies, scope, audience size, dollar amounts, percentages
   - Tense: past for prior roles, present for current
   - Avoiding cliches ("team player", "hard working", "passionate") and
     pronoun usage ("I", "we")

3) Tailoring to the job description
   - Mirroring exact keywords/phrasing from the JD where truthful
   - Re-prioritizing experiences that map to the JD
   - Adding/removing bullets to maximize JD relevance
   - Inserting the right hard skills (languages, tools, certifications) when present
   - When NOT to tailor (fabricating, claiming skills you don't have)

4) Industry-specific guidance
   - Consulting: case-team simulation experiences, leadership, structured problem
     solving signals, quant rigor, communication
   - Investment Banking: technical modeling exposure, deal/transaction context,
     Excel/PowerPoint/Bloomberg, finance club leadership, accuracy
   - Tech: shipped projects with measurable usage, GitHub links, system design
     vocabulary, language/framework specificity, internship-to-FTE patterns

5) Summary / Objective section
   - When to use one (and when not to for early career)
   - Length, tone, what to include and avoid

6) Skills section
   - How to organize (categories vs flat list)
   - Which proficiency levels to skip
   - Order of skills (relevance first, not alphabetical)

7) Common mistakes that get resumes rejected
   - Specific patterns that ATS systems and recruiters flag

8) High-impact rewrites: 6-10 BEFORE/AFTER bullet examples with explanation,
   spanning consulting, IB, and tech roles. Each before/after should illustrate
   a different principle.

Aim for ~4000 words. Format with clear h2/h3 markdown headings, bulleted lists,
and the before/after examples in code blocks. Cite sources where helpful
(Harvard, Wharton, Wall Street Oasis, Management Consulted, Levels.fyi, Google
recruiting blog, etc.).

Return the document as a single self-contained markdown text. Do not include
preamble like "Here is the document". Start directly with the title.
"""

    print("Running Perplexity sonar-deep-research (can take 3-5 minutes)...", flush=True)
    client = OpenAI(
        api_key=api_key,
        base_url="https://api.perplexity.ai",
        timeout=600.0,  # 10 minutes
    )

    try:
        response = client.chat.completions.create(
            model="sonar-deep-research",
            messages=[{"role": "user", "content": query}],
        )
    except Exception as exc:
        print(f"ERROR: Perplexity call failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1

    content = (response.choices[0].message.content or "").strip()
    if not content:
        print("ERROR: Perplexity returned empty content.", file=sys.stderr)
        return 1

    # Strip the sonar-deep-research <think>...</think> reasoning block if present
    if content.startswith("<think>"):
        end = content.find("</think>")
        if end != -1:
            content = content[end + len("</think>"):].lstrip()

    # Pull citations if attached to the response
    citations: list[str] = []
    try:
        # Newer sonar responses attach citations on the response object
        cits = getattr(response, "citations", None)
        if cits:
            citations = list(cits)
    except Exception:
        pass

    out_path = repo_root / "docs" / "resume_principles.md"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    header = (
        f"<!--\n"
        f"Auto-generated by backend/scripts/build_resume_principles.py on "
        f"{datetime.utcnow().isoformat(timespec='seconds')}Z.\n"
        f"Edit the script's query and re-run to regenerate.\n"
        f"Source: Perplexity sonar-deep-research.\n"
        f"-->\n\n"
    )

    footer_parts = ["\n\n---\n\n## Sources\n"]
    if citations:
        for i, c in enumerate(citations, 1):
            footer_parts.append(f"{i}. {c}")
    else:
        footer_parts.append("_No citations attached to response._")
    footer = "\n".join(footer_parts) + "\n"

    out_path.write_text(header + content + footer, encoding="utf-8")
    print(f"Wrote {out_path}  ({len(content):,} chars, {len(citations)} citations)", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
