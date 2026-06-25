"""
Shared quality rules for LLM-generated outreach emails.

One source of truth for the rules every outreach prompt should obey — banned
phrases, length caps, anti-cliché guidance. Each flow (referral, cold
recruiter, networking) includes EMAIL_QUALITY_RULES in its system prompt
alongside its own purpose-specific framing.

Rules are research-backed. Sources informing this version:
  - Stephanie Manwaring, "The Best Job Referral Request I Have Ever Received"
    (the email that worked was direct, included the role link + resume, and
    didn't try to build elaborate rapport before the ask).
  - Career Principles networking templates for IB/consulting students
    (3-part structure: brief intro, direct ask, thank-you; under 200 words).
  - Ramit Sethi's referral scripts (always give the recipient an out;
    "if you're not comfortable referring me, point me to the right person").
  - Common LLM tells observed in production (specific phrases that signal
    AI-generated text to sophisticated readers).
"""

BANNED_PHRASES_VERBATIM = (
    # Generic openers — instantly clock as AI/template
    "I hope this email finds you well",
    "I hope this finds you well",
    "I hope you are doing well",
    "I hope you're doing well",   # v3: contracted form slipped through
    "I hope all is well",
    "Hope you're doing well",
    "I came across your profile",
    "I came across your name",
    "I'm reaching out to",
    "I am reaching out to",
    "I wanted to reach out",
    "I am writing to express",
    # Filler / hedging — v3: caught "which seems relevant to the role"
    "seems relevant to the role",
    "seems relevant",
    "seems to align",
    "appears relevant",
    "might align",
    "could be relevant",
    "which I believe aligns",
    "I would appreciate the opportunity",
    "I would love the opportunity",
    "your time and consideration",
    "Thank you for considering",
    "Thank you for your time",  # use literally "Thanks" or similar, in signoff only
    "I look forward to hearing from you",
    "Please let me know if",
    # Generic "fit" claims
    "I would be a strong fit",
    "I'm a strong candidate",
    "I would be a great fit",
    "I'd be a great addition",
    "my skills and experience",
    "my background aligns",
    "how my background might align",
    "aligns with your background",
    "aligns with the role",
    "resonates with my experience",
    "is well-aligned with",
    # Marketing-speak / corporate filler
    "I'm particularly drawn to",
    "particularly interested in",
    "team's current initiatives",
    "leverage my skills",
    "wear many hats",
    "I'm excited about the opportunity",
    "I'd love to learn more about your role",
    "I'd love to hear more about",
    # Over-apologizing
    "I will ensure our conversation is",
    "I'll make sure to be brief",
    "I value your insights",
    "I value your time",
    # Vague references to nonexistent specifics
    "your recent post on LinkedIn about",  # When LLM has no actual post to cite
    "I enjoyed your recent post",
    "the innovative work happening",
    "the exciting projects",
    # v3: model invented "the job link attached" when nothing of the sort was
    # being attached. Resume IS attached; job URL goes inline if at all.
    "the job link attached",
    "the job link for reference",
    "and the job link",
)

BANNED_PHRASES_SUBSTRING = (
    # Looser bans — any sentence containing these patterns is suspect.
    # Used as a "scrub then regenerate" signal, not a hard ban in-prompt.
    "innovative projects",
    "exciting opportunity",
    "passionate about",
    "deeply impressed",
    "tremendously",
)


EMAIL_QUALITY_RULES = """
HARD QUALITY RULES (read carefully — these supersede the rest of the prompt):

VOICE & TONE
- Sound like a real undergrad wrote this, not a template. If a sentence \
sounds like every other outreach email the recipient has read, rewrite it.
- Plain prose. No bullets, no markdown, no headers, no em-dashes used as \
"sophisticated" punctuation. One comma works fine.
- Use contractions where natural ("I'm" not "I am", "I've" not "I have").
- One thought per sentence. No nested clauses.

LENGTH
- Body: 80-130 words, hard cap 150. If it's longer, cut.
- Subject: under 55 characters.

OPENER
- The first sentence is the most important. Make it specific to the \
recipient. Acceptable openers:
  * Specific shared context: "Following up on our chat in [month]…" / \
"Fellow [school] '24 here —" / "Saw your post on [exact named topic]…"
  * Honest direct: "I'm applying to the [exact role title] at [company] \
and wanted to reach out to you specifically because [one concrete reason]."
- If you do not have a specific hook from the provided context, use the \
honest direct opener. Do NOT fabricate one. Do NOT pretend you "saw their \
recent post" if the recent-activity context is empty or generic.

THE ASK
- Be direct. Saved contacts deserve clarity, not coy two-step games.
- For STRONG relationship (prior coffee chat or email exchange exists): \
ask plainly for a referral or for them to share the application with the \
hiring team. Reference the prior interaction.
- For MODERATE relationship (shared school, no prior contact): ask for \
a brief chat OR ask directly for a referral. Either is fine. Always include \
an out clause.
- For WEAK relationship (saved contact, no shared signal): ask for a \
short chat (15 minutes). Do not ask for a referral in the first email.
- ALWAYS give them an out: "no pressure if this isn't the right time / \
fit, and feel free to point me to someone else on the team."

SPECIFICITY
- Cite ONE concrete overlap between the role and the student's resume. \
Name a project, a class, a prior internship, a specific tool. Do NOT \
list skills generically ("my Python and ML skills"). Do NOT claim \
"strong fit" or "great alignment".
- When numbers are available in the resume, use them. "Built X that \
processed N requests/day" > "worked on data pipelines".

CLOSE
- Mention the attached resume ONCE. Do NOT claim "the job link is \
attached" — only the resume PDF is attached.
- If a JOB_URL is provided in the context, include it inline as a plain \
URL in one of the body sentences ("The role is here: https://…"). Do NOT \
hyperlink, do NOT use markdown.
- Sign with the student's first name only. Do NOT write a full signature \
block — the mail system appends one automatically.
- One brevity acknowledgment max ("I know your inbox is full" OR \
"thanks for the time" — never both).

BANNED PHRASES (do NOT use these or close paraphrases — they are \
instant AI tells):
""" + "\n".join(f"  - {p}" for p in BANNED_PHRASES_VERBATIM) + """

OUTPUT FORMAT (exact, no extra commentary, no preamble):
Subject: <subject line>

<body>
"""


# Patterns that, if present in a generated email, signal low quality.
# Callers can use these to scrub-then-regenerate or to flag the draft for
# review rather than auto-creating a Gmail draft.
def detect_quality_issues(subject: str, body: str) -> list[str]:
    """Return a list of detected quality problems. Empty list = clean.

    Designed to be cheap (string scans only). Caller decides what to do —
    regenerate, log, or surface to the user.
    """
    issues: list[str] = []
    text = (subject + " " + body).lower()

    for phrase in BANNED_PHRASES_VERBATIM:
        if phrase.lower() in text:
            issues.append(f"banned_phrase: '{phrase}'")

    # Length check — body only
    body_words = len([w for w in body.split() if w])
    if body_words > 160:
        issues.append(f"too_long: {body_words} words")
    if body_words < 40:
        issues.append(f"too_short: {body_words} words")

    # Subject sanity
    if not subject or len(subject) > 70:
        issues.append(f"bad_subject_length: {len(subject)} chars")

    # Sentence-count heuristic — over-long emails often have many sentences
    sentence_count = body.count(". ") + body.count("! ") + body.count("? ") + 1
    if sentence_count > 9:
        issues.append(f"too_many_sentences: {sentence_count}")

    # Triple punctuation / em-dash overuse (LLM tell)
    if "—" in body and body.count("—") >= 3:
        issues.append("em_dash_overuse")

    return issues
