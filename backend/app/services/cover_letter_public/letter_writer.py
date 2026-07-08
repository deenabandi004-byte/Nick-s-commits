"""Write the cover letter with GPT-4o.

Prompt is grounded in a Perplexity + WebSearch literature review of what
recruiters and hiring managers in 2025-2026 actually say separates a
memorable, personalized cover letter from a forgettable one:

  - Mergers & Inquisitions / Kellogg / Leland on IB-and-consulting structure
    (treat it like a case: problem -> motivation -> fit -> value).
  - PQ Magazine, Coursera, Staffing by Starboard on AI-generated tells
    recruiters now flag (delve, foster, testament-to, beacon-of, etc.).
  - ResumeWorded, Enhancv on personalization that works (reference
    specific company values verbatim, concrete metric-backed wins,
    alignment-not-admiration framing).

The prompt is strict on three axes:
  1. Specificity - every claim about the applicant or the company must
     trace to the resume or the research block. No invention.
  2. Voice - no AI-tell vocabulary, no uniform sentence openings, no
     three-part formulaic paragraphs.
  3. Discipline - 250-350 words, three short paragraphs, no preamble.
"""
from __future__ import annotations

import logging

from app.services.openai_client import get_openai_client
from app.utils.em_dash import strip_em_dashes

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = (
    "You write cover letters for college students applying to consulting, "
    "investment banking, and tech roles. Your letters read like a thoughtful "
    "human wrote them, not a template. You are specific over generic, concrete "
    "over abstract, and short over long. You never use AI-tell vocabulary "
    "(delve, foster, leverage, synergy, streamline, facilitate, underscore, "
    "testament-to, beacon-of). You never repeat the resume; you make the "
    "resume mean something for THIS company and THIS role."
)


# Recruiter-flagged AI tells and clichés. Expanded from Perplexity research.
KILL_LIST = """
- "I am writing to express my interest in..."
- "I am writing to apply for..."
- "I am excited to apply..."  /  "I am thrilled to apply..."
- "I am excited to contribute to your team"
- "I love your mission" (unless followed by a specific, credible reason)
- "results-oriented professional"  /  "results-driven"
- "dynamic thinker"  /  "innovative self-starter"  /  "detail-oriented team player"  /  "go-getter"
- "passionate" (about anything)
- "deeply" (as an intensifier)
- "leverage" (as a verb)
- "synergy", "streamline", "facilitate", "foster", "underscore", "delve"
- "testament to my..."  /  "a beacon of..."
- "drive digital transformation" or grand corporate phrases without a concrete example
- "It's important to remember that..."  /  "It is worth noting that..."
- "Furthermore", "Additionally", "Moreover" used in sequence to start sentences
- "As you can see from my resume..."  /  "Per my resume..."
- "I believe my background makes me a strong fit"  (vague self-praise)
- "fast-paced environment"  /  "hit the ground running"  /  "wear many hats"
- Repeating the same "By doing X, I achieved Y" sentence pattern across paragraphs
- Starting every paragraph with the same word (especially "I")
""".strip()


TONE_GUIDANCE = {
    "professional": (
        "Voice: confident, thoughtful, professional. The applicant sounds "
        "like a senior at a top-30 university with a real point of view, "
        "not a CFO and not a fan. Earn warmth through specificity, not "
        "exclamation points."
    ),
    "conversational": (
        "Voice: warm and conversational, like a smart undergrad emailing "
        "an alum after a coffee chat. Use slightly shorter sentences and "
        "the occasional first-person aside. Still professional, still "
        "specific. No slang, no emoji."
    ),
    "enthusiastic": (
        "Voice: visibly motivated and high-energy, but earned through "
        "concrete reasons (specific products, specific deals, specific "
        "wins). Never gushing, never fawning. Enthusiasm comes from how "
        "much you know about the company, not from adjectives like "
        "'amazing' or 'incredible'."
    ),
}


def _build_user_prompt(
    *,
    applicant_name: str,
    resume_text: str,
    job: dict,
    company_research: dict,
    tone: str = "professional",
) -> str:
    title = job.get("title") or "the role"
    company = job.get("company") or "the company"
    location = job.get("location") or ""
    job_description = job.get("description") or ""
    raw_markdown = job.get("raw_markdown") or ""

    research_block = (company_research.get("content") or "").strip()
    name_block = applicant_name or "the applicant"

    job_block_parts: list[str] = [
        f"Position: {title}",
        f"Company: {company}",
    ]
    if location:
        job_block_parts.append(f"Location: {location}")
    if job_description:
        job_block_parts.append(f"\nJob description / requirements:\n{job_description[:4000]}")
    elif raw_markdown:
        job_block_parts.append(f"\nRaw job posting (extracted from page):\n{raw_markdown[:4000]}")
    job_block = "\n".join(job_block_parts)

    tone_guidance = TONE_GUIDANCE.get(tone, TONE_GUIDANCE["professional"])

    if research_block:
        research_section = (
            "\nRECENT COMPANY CONTEXT (from a live Perplexity search; use 1-2 specific\n"
            "facts from this in paragraph 1 to prove you actually researched, not pattern-matched):\n"
            f"{research_block[:2200]}"
        )
    else:
        research_section = (
            "\nRECENT COMPANY CONTEXT: (none available - lean harder on the job\n"
            "description, the company's name, and the role's stated responsibilities\n"
            "to ground paragraph 1 in something specific)"
        )

    return f"""Write a cover letter for the following application.

APPLICANT NAME: {name_block}

RESUME (raw text - parse it yourself; pull the strongest 2-3 experiences that match the JD):
{resume_text[:5500]}

JOB:
{job_block}
{research_section}

═══════════════════════════════════════════════════════════════════
STRUCTURE (250-350 words total, three paragraphs, no postscript)
═══════════════════════════════════════════════════════════════════

PARAGRAPH 1 - "Why {company}, why now" (60-90 words)
Open with something concrete about {company} drawn from the research or the
JD. Pick ONE of these opening patterns - do not use a generic one:

  (a) Reference a specific recent event, product launch, deal, hire,
      research paper, or strategic move that the research block names. Then
      pivot in one sentence to why that pulls you toward this role.
      Example: "When {company} closed the [specific deal] in [month], it
      signaled [specific implication]. That is the kind of [function/
      strategy/build] I want to learn under."

  (b) Cite a specific stated value or principle of {company} (e.g.,
      Amazon's "ownership", Google's "continuous learning") and tie it to
      a concrete moment from the applicant's resume that demonstrates the
      same trait. The applicant's example must be specific, not abstract.

  (c) Open with a precise moment from the applicant's experience that led
      them to want this role specifically (not "the industry"). Then
      mention {company} by name and one specific thing about it.

  Do NOT open with: "I am writing...", "I am excited to apply...",
  "I am thrilled...", "I have always been passionate about...", or any
  variant. Do NOT name the role title in the first sentence.

PARAGRAPH 2 - "Why I'm the right fit" (110-160 words)
Pick 2 (max 3) specific experiences from the resume that map onto specific
requirements from the JD. For each one, name:
  - The project, employer, club, or class by its actual name from the resume
  - What the applicant actually did (verb + object, no abstractions)
  - The outcome with a number when the resume gives one (% gain, $ raised,
    users reached, hours saved, ranking, prize, accepted-paper, etc.)
  - Why that outcome predicts they will do well on the specific deliverable
    named in the JD

Do NOT list more than 3 experiences. Do NOT just paraphrase the resume.
Every example must connect explicitly to the JD. If the JD names a tool,
skill, or workflow the resume also names, surface that overlap.

PARAGRAPH 3 - Close (40-70 words)
One sentence on the through-line: what these experiences together suggest
about how the applicant will show up in this role. One sentence proposing
a concrete next step (a chat, a call, an interview). Do NOT say "thank you
for your consideration" or "I look forward to hearing from you". Do NOT
restate the role. Do NOT add a P.S.

═══════════════════════════════════════════════════════════════════
HARD RULES
═══════════════════════════════════════════════════════════════════

1. WORD COUNT: 250-350 words for the body (excluding salutation and
   sign-off). Count carefully. Over 360 is a fail.

2. NO EM DASHES anywhere. Use commas, parentheses, colons, or " - "
   (regular hyphen with spaces). This is non-negotiable.

3. KILL-LIST - do not use any of the following phrases or words, ever:
{KILL_LIST}

4. NO INVENTION. Every claim about the applicant must trace to the
   resume text. Every claim about the company must trace to the JD or
   the research block. If a fact isn't in those inputs, do not write it.

5. VARY PARAGRAPH OPENINGS. Each paragraph must start with a different
   structure. Avoid starting more than one paragraph with "I".

6. CONCRETE BEATS ABSTRACT. Prefer specific nouns (Goldman, Series B,
   React Native, Series 7) over generic ones (the firm, the funding,
   the technology, the qualification).

7. VOICE: {tone_guidance}

8. FORMAT:
   Line 1: Dear Hiring Manager,
   Line 2: (blank)
   Lines 3-N: Three paragraphs separated by blank lines
   Line N+1: (blank)
   Line N+2: Sincerely,
   Line N+3: {name_block}

   Return ONLY the cover letter. No preamble ("Here is your cover
   letter:"), no commentary, no explanation, no markdown fences.
"""


def generate_letter(
    *,
    applicant_name: str,
    resume_text: str,
    job: dict,
    company_research: dict,
    tone: str = "professional",
) -> str:
    """Generate the cover letter text.

    Args:
        tone: one of "professional", "conversational", "enthusiastic".
            Falls back to professional for unknown values.

    Raises:
        RuntimeError: when the OpenAI client is unavailable.
    """
    client = get_openai_client()
    if client is None:
        raise RuntimeError("OpenAI client is not configured.")

    prompt = _build_user_prompt(
        applicant_name=applicant_name,
        resume_text=resume_text,
        job=job,
        company_research=company_research,
        tone=tone,
    )

    # Temperature 0.6: warm enough for natural prose, cool enough to honor
    # the strict structural and kill-list constraints. presence_penalty
    # nudges away from the repetitive AI cadence (every paragraph starting
    # the same way) without forcing weird vocabulary.
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        temperature=0.6,
        max_tokens=1200,
        presence_penalty=0.3,
        frequency_penalty=0.2,
        timeout=60.0,
    )
    text = (response.choices[0].message.content or "").strip()

    # Belt and suspenders: strip em dashes if the model snuck one in (the
    # shared sanitizer also catches ―/⸺ variants, "--", and spaced en
    # dashes, and cleans up punctuation around the replacement).
    text = strip_em_dashes(text)
    # Strip any markdown code-fence wrapping if the model added one.
    if text.startswith("```"):
        lines = [l for l in text.splitlines() if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()

    logger.info("Cover letter generated: %d chars", len(text))
    return text
