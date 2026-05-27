"""OpenAI aggregation for the public interview-prep flow.

Takes (job_details, perplexity_research, reddit_posts) and returns a single
structured insights dict consumed by the PDF generator.

The prompt is built to actively forbid generic textbook content. Every
question, tip, and red flag must trace back to a source string (Reddit
post number, or one of the Perplexity research blocks). Verbatim Reddit
quotes are extracted into candidate_voices.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime

from app.services.openai_client import get_openai_client

logger = logging.getLogger(__name__)


# Compact, role-aware steering. The PUBLIC flow uses the same role buckets
# as the authenticated content_processor.
ROLE_GUIDANCE = {
    "Consulting": (
        "Center the prep on CASE INTERVIEWS (profitability, market entry, "
        "M&A, market sizing) and FIT questions. Do NOT include LeetCode."
    ),
    "Software Engineering": (
        "Center the prep on CODING (algorithms, data structures), SYSTEM "
        "DESIGN, and behavioral. Do NOT include consulting cases or DCFs."
    ),
    "Finance": (
        "Center the prep on TECHNICAL questions (DCF, LBO, accounting, "
        "valuation, walk-me-through-your-resume) and FIT. Do NOT include "
        "LeetCode."
    ),
    "Product Management": (
        "Center the prep on PRODUCT SENSE, estimation, prioritization, "
        "behavioral. Frameworks: CIRCLES, RICE, AARRR. For senior/staff "
        "roles also include strategy, ambiguous-scoping, and "
        "cross-functional-leadership questions."
    ),
    "Data Science": (
        "Center the prep on SQL, statistics, A/B testing, ML fundamentals, "
        "and product analytics. No LeetCode-style algorithms."
    ),
}


def _summarize_reddit(reddit_posts: list[dict]) -> str:
    """Pack as much of the Reddit signal into the prompt as we can afford.

    Public-flow tradeoff: we WANT specificity, not brevity. Using a wider
    window (20 posts, longer bodies, more comments) means the LLM has the
    raw material to ground claims in real candidate reports. Without this,
    the synth step regresses to generic PM/SWE textbook content.
    """
    if not reddit_posts:
        return "(no Reddit posts available)"

    blocks = []
    for i, post in enumerate(reddit_posts[:20], 1):
        block = [
            f"=== POST {i} (r/{post.get('subreddit', '?')}, "
            f"{post.get('upvotes', 0)} upvotes, url: {post.get('url', '')}) ===",
            f"Title: {post.get('post_title', '')}",
        ]
        body = (post.get("post_body") or "").strip()
        if body:
            block.append(f"Body: {body[:4000]}")
        comments = post.get("top_comments") or []
        for j, c in enumerate(comments[:6], 1):
            text = (c.get("body") or "").strip()
            if text:
                block.append(
                    f"Comment {j} ({c.get('upvotes', 0)} upvotes): "
                    f"{text[:1500]}"
                )
        blocks.append("\n".join(block))

    return "\n\n".join(blocks)


def _shape_for_failure(company_name: str, reason: str) -> dict:
    return {
        "company_name": company_name,
        "last_updated": datetime.now().isoformat(),
        "interview_process": {"stages": [], "total_timeline": "", "notes": reason},
        "common_questions": {"behavioral": [], "technical": [], "company_specific": []},
        "success_tips": [],
        "red_flags": [],
        "day_of_logistics": [],
        "candidate_voices": [],
        "citations": [],
        "degraded": True,
    }


def process(job_details: dict, research: dict, reddit_posts: list[dict]) -> dict:
    """Return structured insights for the PDF generator."""
    company = job_details.get("company_name") or "the company"
    title = job_details.get("job_title") or ""
    level = job_details.get("level") or ""
    role_category = job_details.get("role_category") or "Other"
    skills = job_details.get("required_skills") or []
    team_division = job_details.get("team_division") or ""

    client = get_openai_client()
    if not client:
        return _shape_for_failure(company, "OpenAI client unavailable.")

    # Pull all four Perplexity blocks (or empty strings if degraded).
    process_block = (research.get("interview_process") or {}).get("content") or ""
    questions_block = (research.get("specific_questions") or {}).get("content") or ""
    signals_block = (research.get("signals_and_red_flags") or {}).get("content") or ""
    company_news = research.get("company_news") or []
    citations = research.get("citations") or []

    role_steering = ROLE_GUIDANCE.get(role_category, "Tailor to the role described.")
    skills_clause = f"Required skills from posting: {', '.join(skills[:10])}." if skills else ""
    team_clause = f"Team / division: {team_division}." if team_division else ""
    reddit_block = _summarize_reddit(reddit_posts)
    news_block = "\n".join(f"- {n}" for n in company_news[:6]) or "(none available)"

    prompt = f"""You are building an interview prep document for the {title or 'role'} at
{company}{f' ({level})' if level else ''}.

ROLE GUIDANCE: {role_steering}
{skills_clause}
{team_clause}

RULES (read carefully):

1. PREFER SPECIFIC OVER GENERIC. When the source material below contains
   a specific question, process detail, tip, or red flag tied to
   {company}, use that. Quote and cite it. Generic textbook content
   (e.g. "What is RICE?", "Tell me about a time you failed") is allowed
   ONLY as a small fraction of the output, and only when you can't find
   anything more specific in the sources.

2. EVERY question, tip, and flag must carry a "source" field. Use one
   of these tags:
     - "Reddit POST <n>" when grounded in a specific Reddit post.
     - "Perplexity research" when grounded in one of the Perplexity blocks.
     - "Role-typical" when the source material is thin and you are
       producing a question/tip that is typical for this role category
       at companies like this. Use this sparingly.
     - "Inferred from posting" when grounded in the job posting itself
       (e.g. a required skill maps obviously to a likely question).

3. PRODUCE THE FULL OUTPUT EVEN IF SOURCES ARE THIN. A blank prep is
   worse than a mostly-role-typical one. Always return at least:
     - 3 interview_process stages
     - 4 behavioral questions
     - 4 technical questions
     - 3 company_specific questions
     - 4 success_tips
     - 3 red_flags
     - 2 day_of_logistics items
   Use "Role-typical" or "Inferred from posting" sources to fill gaps.

4. candidate_voices: include VERBATIM quotes pulled directly from the
   Reddit posts below. Use the exact wording (you may trim for length
   but do not paraphrase). Each quote must include subreddit and
   upvotes. If the Reddit posts have very thin bodies, return fewer
   quotes (0 is acceptable) rather than fabricating any.

5. NO EM DASHES anywhere in any string. Use commas, colons, or
   parentheses instead.

==========================================================================
SOURCE 1 (Perplexity research): How the interview process at {company} works
==========================================================================
{process_block[:6000] or "(no data returned)"}

==========================================================================
SOURCE 2 (Perplexity research): Specific questions {company} asks
==========================================================================
{questions_block[:6000] or "(no data returned)"}

==========================================================================
SOURCE 3 (Perplexity research): What {company} looks for, red flags
==========================================================================
{signals_block[:6000] or "(no data returned)"}

==========================================================================
SOURCE 4: Recent company news (last 30 days)
==========================================================================
{news_block}

==========================================================================
SOURCE 5: Reddit threads (real candidate reports for this company/role)
==========================================================================
{reddit_block}

==========================================================================

Return ONLY this JSON object:

{{
  "company_name": "{company}",
  "last_updated": "{datetime.now().isoformat()}",
  "interview_process": {{
    "stages": [
      {{
        "name": "string (use the actual stage name this company uses)",
        "description": "string (1-2 sentences, specific to this stage)",
        "duration": "string",
        "format": "string (phone, video, in-person, take-home, case, etc)",
        "what_they_evaluate": "string (specific signals, not 'communication')",
        "source": "string (where in the sources above this came from)"
      }}
    ],
    "total_timeline": "string (real number, e.g. '5-7 weeks')",
    "notes": "string (anything unusual about how this company runs interviews)"
  }},
  "common_questions": {{
    "behavioral":       [{{"question": "string", "why_asked": "string", "source": "string"}}],
    "technical":        [{{"question": "string", "why_asked": "string", "source": "string"}}],
    "company_specific": [{{"question": "string", "why_asked": "string", "source": "string"}}]
  }},
  "success_tips":      [{{"tip": "string", "source": "string"}}],
  "red_flags":         [{{"flag": "string", "source": "string"}}],
  "day_of_logistics":  ["string"],
  "candidate_voices": [
    {{
      "quote": "string (verbatim, in the redditor's own words)",
      "subreddit": "string",
      "upvotes": 0,
      "url": "string (the Reddit URL)"
    }}
  ]
}}

Counts:
- interview_process.stages: 3-6, using the company's actual stage names
  where the sources support it, otherwise typical names like "Recruiter
  Screen", "Hiring Manager", "Panel", "Final Round".
- behavioral: 4-6, technical: 4-6, company_specific: 3-5
- success_tips: 4-6, red_flags: 3-5, day_of_logistics: 2-4
- candidate_voices: 0-8 verbatim Reddit quotes (only if Reddit posts
  contain real quotable content; otherwise omit entirely)

Return JSON only. No prose before or after.
"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        parsed = json.loads(response.choices[0].message.content or "{}")
    except json.JSONDecodeError:
        logger.warning("Public content_processor: JSON parse failed", exc_info=True)
        return _shape_for_failure(company, "AI response was not valid JSON.")
    except Exception:
        logger.warning("Public content_processor: OpenAI call failed", exc_info=True)
        return _shape_for_failure(company, "AI processing failed.")

    parsed.setdefault("company_name", company)
    parsed.setdefault("last_updated", datetime.now().isoformat())
    parsed.setdefault("candidate_voices", [])
    parsed["citations"] = citations[:15]
    parsed["company_news"] = company_news[:6]

    logger.info(
        "Public content_processor: stages=%d, beh=%d, tech=%d, co=%d, tips=%d, flags=%d, voices=%d",
        len((parsed.get("interview_process") or {}).get("stages") or []),
        len((parsed.get("common_questions") or {}).get("behavioral") or []),
        len((parsed.get("common_questions") or {}).get("technical") or []),
        len((parsed.get("common_questions") or {}).get("company_specific") or []),
        len(parsed.get("success_tips") or []),
        len(parsed.get("red_flags") or []),
        len(parsed.get("candidate_voices") or []),
    )

    return parsed
