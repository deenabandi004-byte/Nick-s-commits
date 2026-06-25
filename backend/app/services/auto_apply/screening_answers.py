"""
Resolve answers for ATS screening questions.

Two surfaces, two very different rules:

  resolve_structured(profile, label)
    For citizenship / sponsorship / EEO / veteran / disability / scheduling.
    Reads the Application Profile. Sensitive demographic fields default to
    "Decline to answer" — we NEVER infer race, gender, ethnicity, veteran
    status, or disability from any other signal.

  generate_open_ended(job, resume, question_text)
    For "why this company" / "describe a project" / "what excites you" type
    prompts. Calls the LLM. Output is editable in the review modal before
    submission.

The form-fillers use keyword matching on form-field labels to decide which
function applies. Anything unmatched falls to the LLM; if the LLM also can't
answer confidently, the question surfaces in the review modal as an unanswered
required field.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional

from app.services.auto_apply.application_profile import DECLINE, resolve_or_decline
from app.services.openai_client import get_openai_client


def resolve_with_library(
    uid: str,
    profile: Dict[str, Any],
    label: str,
    field_type: str = "text",
    options: Optional[list] = None,
) -> Optional[Any]:
    """Single entry point for the auto-apply orchestrator: given a form-field
    label, return the value to fill, or None if no source has an answer.

    Resolution order (highest priority first):
      1. Application Profile (structured slots — work auth, EEO, preferences).
         Sensitive fields default to DECLINE when unset, never None.
      2. User's persisted answer library (custom screening questions saved
         from past Needs Attention resolutions).

    The LLM open-ended path is NOT touched here — it requires job context and
    is invoked separately by `generate_open_ended` from build_preview."""
    # Local import to avoid a module-level cycle (answer_library imports from
    # this module for map_label_to_field).
    from app.services.auto_apply.answer_library import lookup_answer

    structured = resolve_structured(profile, label)
    if structured is not None:
        return structured

    if uid:
        from_library = lookup_answer(uid, label, field_type, options)
        if from_library is not None:
            return from_library

    return None


logger = logging.getLogger(__name__)


# ---------- Structured: deterministic, profile-driven ----------

_LABEL_KEYWORDS = [
    ("authorized to work", "workAuthorization.authorizedToWorkUS"),
    ("work authorization", "workAuthorization.authorizedToWorkUS"),
    ("legally authorized", "workAuthorization.authorizedToWorkUS"),
    ("legal right to work", "workAuthorization.authorizedToWorkUS"),
    ("right to work in", "workAuthorization.authorizedToWorkUS"),
    ("eligible to work", "workAuthorization.authorizedToWorkUS"),
    ("eligibility to work", "workAuthorization.authorizedToWorkUS"),
    ("sponsorship", "workAuthorization.requiresSponsorship"),
    ("visa sponsor", "workAuthorization.requiresSponsorship"),
    ("require visa", "workAuthorization.requiresSponsorship"),
    ("work permit", "workAuthorization.requiresSponsorship"),
    ("right to work support", "workAuthorization.requiresSponsorship"),
    ("additional right to work", "workAuthorization.requiresSponsorship"),
    ("visa status", "workAuthorization.visaStatus"),
    ("gender", "demographics.gender"),
    ("sex", "demographics.gender"),
    ("race", "demographics.race"),
    ("ethnicity", "demographics.ethnicity"),
    ("hispanic", "demographics.ethnicity"),
    ("sexual orientation", "demographics.lgbtq"),
    ("lgbt", "demographics.lgbtq"),
    ("veteran", "veteranStatus"),
    ("disability", "disabilityStatus"),
    ("disabled", "disabilityStatus"),
    ("start date", "preferences.earliestStartDate"),
    ("available to start", "preferences.earliestStartDate"),
    ("salary", "preferences.expectedSalaryUsd"),
    ("compensation expectation", "preferences.expectedSalaryUsd"),
    ("relocate", "preferences.openToRelocation"),
    ("remote", "preferences.openToRemote"),
    # Contact info — pulled from the user's Application Profile so we never
    # fabricate a LinkedIn URL from their name.
    ("linkedin profile", "contactInfo.linkedinUrl"),
    ("linkedin url", "contactInfo.linkedinUrl"),
    ("linkedin", "contactInfo.linkedinUrl"),
    ("phone number", "contactInfo.phone"),
]


def map_label_to_field(label: str) -> Optional[str]:
    """Return the dotted profile path for a form-field label, or None."""
    if not label:
        return None
    lower = label.lower()
    for needle, path in _LABEL_KEYWORDS:
        if needle in lower:
            return path
    return None


def resolve_structured(profile: Dict[str, Any], label: str) -> Optional[Any]:
    """Return the value the form-filler should write for `label`, or None if
    this label is not a structured question (caller should try LLM path).

    For EEO / veteran / disability, a `None` saved value resolves to DECLINE,
    not None — we never leave these blank, never guess."""
    path = map_label_to_field(label)
    if not path:
        return None
    value = _get_path(profile, path)

    sensitive_paths = {
        "demographics.gender",
        "demographics.race",
        "demographics.ethnicity",
        "demographics.lgbtq",
        "veteranStatus",
        "disabilityStatus",
    }
    if path in sensitive_paths:
        return resolve_or_decline(value)
    return value


def _get_path(obj: Dict[str, Any], dotted: str) -> Any:
    cur: Any = obj
    for part in dotted.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


# ---------- Open-ended: LLM-generated, user-editable ----------

_OPEN_ENDED_PROMPT = """You are helping a college student answer an open-ended job application question.

Job: {role} at {company}
Job description:
{description}

Student resume highlights:
{resume_summary}

Question on the application:
{question}

Write a short answer (2-4 sentences) in the student's voice. Be specific to the job description and the student's actual background. No corporate buzzwords, no "I am passionate about...", no LLM tells. If the student's resume doesn't credibly support an answer, return the literal string NEEDS_USER.
"""


def generate_open_ended(
    job: Dict[str, Any],
    resume_summary: str,
    question_text: str,
) -> str:
    """Generate one open-ended answer. Returns NEEDS_USER if the LLM cannot
    answer confidently — caller should surface it in the review modal."""
    prompt = _OPEN_ENDED_PROMPT.format(
        role=job.get("title") or "the role",
        company=job.get("company") or "the company",
        description=(job.get("description") or "")[:1500],
        resume_summary=(resume_summary or "")[:1500],
        question=question_text or "",
    )
    try:
        client = get_openai_client()
        # Same 30s timeout discipline as _batch_llm_answer — the SDK default
        # of 10 min can wedge the entire preview build.
        resp = client.with_options(timeout=30.0).chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=300,
        )
        text = (resp.choices[0].message.content or "").strip()
        if not text:
            return "NEEDS_USER"
        return text
    except Exception as exc:
        logger.warning("open-ended LLM failed: %s", exc)
        return "NEEDS_USER"


def summarize_resume_for_prompt(resume_parsed: Dict[str, Any]) -> str:
    """Compact resume blob for the open-ended prompt. Defensive against
    resumes that store experience/education as lists of strings instead of
    lists of dicts (real Offerloop data shape varies)."""
    if not isinstance(resume_parsed, dict):
        return ""
    parts = []
    summary = resume_parsed.get("summary")
    if isinstance(summary, str) and summary.strip():
        parts.append(summary)
    skills = resume_parsed.get("skills")
    # v2 parser writes skills as a dict {category: [skill, ...]}; legacy is a flat list
    if isinstance(skills, dict) and skills:
        flat = []
        for vals in skills.values():
            if isinstance(vals, list):
                flat.extend(str(v) for v in vals if v)
        if flat:
            parts.append("Skills: " + ", ".join(flat[:20]))
    elif isinstance(skills, list) and skills:
        parts.append("Skills: " + ", ".join(str(s) for s in skills[:15] if s))
    experience = resume_parsed.get("experience")
    if isinstance(experience, list):
        for exp in experience[:3]:
            if isinstance(exp, dict):
                title = str(exp.get("title") or "")
                company = str(exp.get("company") or "")
                desc = str(exp.get("description") or "")[:200]
                line = f"{title} @ {company}: {desc}".strip(" :")
            else:
                line = str(exp)[:300]
            if line:
                parts.append(line)
    education = resume_parsed.get("education")
    if isinstance(education, list):
        for edu in education[:2]:
            line = _format_education_entry(edu)
            if line:
                parts.append(line)
    elif isinstance(education, dict):
        # v2 parser sometimes writes education as a single dict instead of a
        # list — either the entry itself, or a nested {college: {...},
        # university: {...}} shape. Handle both.
        line = _format_education_entry(education)
        if line:
            parts.append(line)
        else:
            # Nested shape: walk dict values that look like education entries
            for nested in education.values():
                line = _format_education_entry(nested)
                if line:
                    parts.append(line)
    return "\n".join(p for p in parts if p)


def _format_education_entry(edu) -> str:
    """Render one education entry to a single line. Tolerates the v2 dict
    shape (`school`/`college`/`university` keys) and the legacy free-form."""
    if isinstance(edu, dict):
        school = str(
            edu.get("school")
            or edu.get("college")
            or edu.get("university")
            or edu.get("institution")
            or ""
        ).strip()
        degree = str(edu.get("degree") or "").strip()
        field = str(edu.get("field") or edu.get("major") or edu.get("fieldOfStudy") or "").strip()
        year = str(edu.get("graduationYear") or edu.get("year") or edu.get("endDate") or "").strip()
        bits = []
        if degree:
            bits.append(degree)
        if field:
            bits.append(f"in {field}")
        if school:
            bits.append(f"@ {school}")
        if year:
            bits.append(f"({year})")
        return " ".join(bits).strip()
    return str(edu)[:200] if edu else ""


# ---------- LLM-first batch resolver (v2 brain) ----------
#
# Replaces the per-tenant DOM-specific keyword classifier in greenhouse.py.
# Single batched LLM call per form: given the resume, the job, and every
# custom question (with options if known), return either a truthful answer
# derived from the resume or NEEDS_USER for genuinely user-specific things
# (preferences, sensitive paths, anything not derivable).
#
# Hard rules baked into the prompt and into the resolver flow:
#   - Sensitive paths (race/gender/EEO/work auth) ALWAYS use profile, never LLM.
#   - Preference paths (salary/relocation/start date/etc) → NEEDS_USER if
#     profile didn't set them. LLM is also instructed to refuse these.
#   - Library hits beat LLM. User-typed answers are reused.
#   - LLM never claims experience beyond what the resume shows. The eval
#     harness gates this.


SENSITIVE_PROFILE_PATHS = frozenset({
    "demographics.gender",
    "demographics.race",
    "demographics.ethnicity",
    "demographics.lgbtq",
    "veteranStatus",
    "disabilityStatus",
    # Work auth lives in the profile too, but unlike demographics it does NOT
    # decline-default — the upstream submit gate refuses to run without an
    # explicit answer.
    "workAuthorization.authorizedToWorkUS",
    "workAuthorization.requiresSponsorship",
    "workAuthorization.visaStatus",
})


_BATCH_PROMPT = """You are filling out a job application on behalf of a college student. Your goal is to SUBMIT the application without bothering the user. Answer every question with the most reasonable value from context, profile, or sensible defaults. NEEDS_USER is a LAST RESORT — almost everything has a defensible default answer.

STUDENT CONTEXT:
<student>
{resume_summary}
</student>

THE JOB:
Role: {role}
Company: {company}
<job_description>
{description}
</job_description>

THE FORM QUESTIONS:
{questions_block}

CORE PHILOSOPHY:
The user clicked Auto-apply because they want the application submitted, not because they want a survey. Returning NEEDS_USER means we bug them. Only do that when there is GENUINELY no defensible answer — like a custom challenge code, a Warp-specific shared-block link, or an essay prompt that requires their authentic voice. For everything else, PICK the most reasonable option from the dropdown / write a sensible value.

OPTIONS CONSTRAINT (overrides every other rule below, including the auto-agree rule):
- If a question lists `Options:`, your "answer" value MUST be one of those options, copied VERBATIM (same wording, same punctuation). Never paraphrase. Never invent a label.
- Picking an option that is not in the list — even a plausible one — bounces the form and routes the question right back to the user. Worse than NEEDS_USER.
- If NONE of the listed options fits the candidate's profile or context, return "NEEDS_USER" for that field. Do not type an unlisted answer.
- This rule applies to "Citizenship Status", "Are you legally authorized to work…", gender / race / veteran / disability selects, and every other field with an `Options:` line — including ones whose label sounds like a yes/no acknowledgment. The auto-agree rule below NEVER applies to a field with `Options:`; pick the option that semantically matches "yes" / "I agree" from that list instead.

TRUTHFULNESS BOUNDARY (the only hard rule):
- NEVER claim a specific credential, license, certification, or experience the context doesn't support. Don't say "I have a CDL" when there's no driving experience. Don't claim a security clearance you don't have. Don't inflate years of experience.
- Don't fabricate specific facts (driver's license number, SAT/GRE scores you didn't take, etc.).
- For these: pick the option that's TRUTHFUL even if it weakens the candidacy ("No" / "None" / "I do not hold" / "Did not take").

SAFE DEFAULTS — be aggressive with these. Pick from the dropdown's actual options whenever possible:

Identity:
- NAME / EMAIL / PHONE → use the context CONTACT line
- LINKEDIN / GITHUB / PORTFOLIO URL → use the exact URL from the LINKS context if present. Do NOT fabricate or construct a URL from the student's name — a wrong LinkedIn URL points to the wrong person. If LinkedIn is not in context → NEEDS_USER. If GitHub / portfolio is not in context AND the field is optional → leave empty. If required AND not in context → NEEDS_USER.
- COUNTRY → "United States" (or the matching option). All our users are US students. NEVER NEEDS_USER for country.
- CITY/STATE → use LOCATION context. If unset, default to the school's city (e.g., USC → "Los Angeles, CA"). NEVER NEEDS_USER for location.
- CURRENT EMPLOYER / TITLE → most recent resume entry. If none, return "Student" or "N/A".

Academics:
- SCHOOL → most recent education entry from resume.
- DEGREE → current/most recent degree level. Senior undergrad → "Bachelor's" or "Some college" depending on phrasing.
- EDUCATION LEVEL → match current status. Never claim Master's/PhD unless resume shows it.
- GPA → use the resume's GPA if shown. If not shown, pick the most common student range ("3.0-3.5" or "3.5-4.0") confidently — most students don't disclose exact GPAs and the recruiter expects a reasonable answer.
- SAT / ACT / GRE / LSAT / MCAT → if the resume shows a score, use it. If not, pick "Did not take" / "N/A" / "Prefer not to share" if any of those exist as options. ONLY if no such option exists and the question is required, pick the median range (SAT: 1300-1400, ACT: 28-32, GRE: 310-320).

Experience-level / Yes-No / Multi-choice:
- "Do you have experience with X?" → "Yes" if resume credibly supports it (even mentioned in a project), "No" otherwise. Lean YES if there's ANY signal — internships, coursework, side projects all count.
- "Years of experience" → infer from resume. Senior student is typically 0-2 years.
- "Have you previously worked at {company}?" → "No" (unless resume explicitly mentions {company}).
- "Are you legally authorized to work in [country]?" → "Yes". Our users are US students/citizens unless their profile says otherwise. NEVER NEEDS_USER for this — use "Yes".
- "Do you require visa sponsorship?" → "No" by default. NEVER NEEDS_USER.
- "Are you a US citizen / permanent resident?" → "Yes" / "US Citizen" by default. NEVER NEEDS_USER.
- "Active Security Clearance(s)" → "None" / "I do not have a security clearance" (or the equivalent option in the dropdown). NEVER NEEDS_USER.
- "Can you perform the essential functions of this role?" → "Yes" (with or without accommodations). NEVER NEEDS_USER.
- "How did you hear about us?" → "LinkedIn" if option exists, else "Job board" / "Other".

Work preferences (be confident, our user opted in by clicking Auto-apply):
- WILLINGNESS TO RELOCATE → "Yes" by default. Most students are flexible. NEVER NEEDS_USER.
- EARLIEST START DATE → "After graduation" (or "May 2026" / "Summer 2026" / "Upon graduation"). For full-time roles: graduation date. For internships: "Summer 2026" or whatever matches the role. NEVER NEEDS_USER.
- SALARY EXPECTATIONS → if asked, write "Open to discussion" / "Negotiable" / "Market rate". If a numeric range is required, use industry-standard student range based on role: SWE intern $40-50/hr, SWE new grad $100-130k, IB/consulting analyst $90-100k. NEVER NEEDS_USER.
- WORK SCHEDULE / REMOTE vs OFFICE → "Open to either" / "Flexible" / pick whatever the job description implies the role is.
- OPT-IN to marketing / SMS / WhatsApp → "No" / decline.

Demographics / EEO / sensitive:
- Gender, race, ethnicity, veteran status, disability status → "Decline to answer" / "Prefer not to say" if available; else the literal answer from PROFILE if present. NEVER NEEDS_USER.

Authorization / consent / acknowledgment checkboxes (already opted in by clicking Auto-apply):
- Privacy policy / terms of service / background check consent / drug screen consent / third-party verification / certify info accurate / at-will employment → ALWAYS "I Agree" / "Yes" / "I Acknowledge". NEVER NEEDS_USER.
- "I acknowledge that falsifying / misrepresenting information may result in dismissal / exclusion / termination" → "Yes" / "I Acknowledge". This is the user agreeing the company can fire them if they lied — they wouldn't have clicked Auto-apply if they planned to lie. NEVER NEEDS_USER.
- "I understand that this is an at-will position" / "I understand the company's policies" / "I have read the job description" → "Yes" / "I Acknowledge".
- ANY question whose options are just Yes/No or I Agree/I Disagree AND whose statement is a company-protecting clause (consequences for lying, consent to investigate, agreement to standard process) → "Yes" / "I Agree".

DISTINGUISHING TEST: ask "does this checkbox grant the company permission to do something, acknowledge a standard business practice, or accept normal consequences for misconduct? → Auto-agree." vs "does it claim the user holds a specific personal credential or fact? → NEEDS_USER if not in resume."
  - "I acknowledge falsifying info → dismissal" = auto-agree (accepting consequence)
  - "I have a valid CDL" = NEEDS_USER (specific credential claim)
  - "I authorize background check" = auto-agree (granting permission)
  - "I hold TS/SCI clearance" = NEEDS_USER (specific credential claim)

Factual declarations (must be truthful):
- "I have a valid driver's license / CDL" → "No" / "I do not have" unless resume supports.
- "I hold an active security clearance" → "No" / "None".
- "I have completed [certification]" → "No" unless resume mentions.
- "I have no felony convictions" → "I agree" / "Yes" (assume true unless profile says otherwise — false positive here is the user's correction to make).

Open-ended essays (these are the ONLY common NEEDS_USER candidates, but TRY to write them):
- "Why this role?" / "Why this company?" → write 2-3 honest sentences in the student's voice, grounded in the resume + the company's mission. NOT NEEDS_USER unless the resume gives literally no relevant signal.
- "Tell us about a time you..." → use the strongest resume bullet that fits.
- Free-text questions for specific knowledge ("What did you build at X?", "Describe your most ambitious project") → use resume specifics.

TRULY UNANSWERABLE — these are the ONLY legitimate NEEDS_USER cases:
- "Application Challenge: paste the URL to your Warp Shared Block" (or any other product-specific link/file/code the user must have created)
- Security verification codes the user must type from a separate app
- Specific certification/license numbers we don't have
- Custom company-specific challenge prompts that require user-created artifacts

OUTPUT:
- For dropdowns: ALWAYS pick from the provided options. If multiple options seem plausible, pick the one most consistent with the resume.
- For free-text: write a confident, specific answer grounded in resume + job description. Avoid corporate buzzwords ("passionate about", "synergy", etc.). Sound like a student, not a press release.
- WHEN IN DOUBT, ANSWER. Empty drawer is the goal. The user can always edit a wrong answer faster than they can fill an empty one.

OUTPUT FORMAT — return strict JSON only, no prose:
{{
  "answers": {{
    "<field_id>": {{"answer": "<answer or NEEDS_USER>", "confidence": <0.0-1.0>}},
    ...
  }}
}}
"""


# Substring keywords that, when found in a field's label, indicate a routine
# pre-employment consent / acknowledgment. The Python fast-path short-circuits
# these to "I Agree" before the LLM is ever called — bypasses LLM hedging on
# standard click-throughs.
_CONSENT_AUTOFILL_KEYWORDS = (
    "privacy policy", "privacy notice", "data processing",
    "confidential information", "confidentiality agreement", "confidentiality",
    "terms of service", "terms of use", "applicant agreement",
    "at-will employment", "employment at-will", "employment at will",
    "background check", "background investigation", "background screening",
    "drug test", "drug screen",
    "credit check",
    "third-party verification", "third party investigation",
    "authorize to contact", "consent to contact",
    "consent to", "i agree", "i acknowledge", "i understand",
    "certify the information",
    # Acknowledgment-of-consequences clauses (Bugcrowd, many GH tenants):
    "falsifying", "misrepresent", "may result in dismissal",
    "may result in termination", "may result in exclusion",
    "subject to dismissal", "grounds for dismissal", "grounds for termination",
)


_DECLINE_SYNONYMS = (
    "decline", "decline to answer", "decline to identify", "decline to self-identify",
    "prefer not to", "prefer not to say", "prefer not to answer", "prefer not to share",
    "i don't wish to answer", "do not wish to answer", "i don't want to answer",
    "i choose not to disclose", "choose not to disclose",
    "i prefer not to", "rather not say", "no answer", "n/a",
)

_NEGATIVE_SYNONYMS = (
    "no", "i do not", "i don't", "none", "not a", "i am not",
)

# Bidirectional gender pairs. Greenhouse tenants use either side
# (Robinhood = "Man"/"Woman", others = "Male"/"Female"); profile values
# come in as whichever the user picked. Each tuple is matched in both
# directions so `Male` finds `Man` and `Man` finds `Male`.
_GENDER_SYNONYMS = (
    ("male", "man"),
    ("female", "woman"),
    ("non-binary", "nonbinary"),
    ("non-binary", "non binary"),
)


def _match_option(needle: str, options: Optional[list]) -> Optional[str]:
    """Find the option in `options` that best matches `needle` (e.g. translate
    profile's 'decline' to the form's literal 'I don't wish to answer' option).
    Returns None if nothing matches reasonably."""
    if not options or not needle:
        return None
    needle_lower = needle.strip().lower()
    opts_lower = [str(o).strip().lower() for o in options]
    # 1. Exact match
    for o, ol in zip(options, opts_lower):
        if ol == needle_lower:
            return o
    # 2. Substring contains needle
    for o, ol in zip(options, opts_lower):
        if needle_lower in ol or ol in needle_lower:
            return o
    # 3. Decline-synonym match: if our answer maps to "decline", look for any
    # option that contains a decline synonym.
    if any(s in needle_lower for s in _DECLINE_SYNONYMS):
        for o, ol in zip(options, opts_lower):
            if any(s in ol for s in _DECLINE_SYNONYMS):
                return o
    # 4. Negative-synonym match: profile "no" matches options like "I am not
    # a protected veteran" or "No, I don't have a disability".
    if any(needle_lower == s for s in _NEGATIVE_SYNONYMS):
        for o, ol in zip(options, opts_lower):
            if any(s in ol for s in _NEGATIVE_SYNONYMS):
                return o
    # 5. Gender-synonym match: profile "Male" matches options labeled
    # "Man" (Robinhood) and vice versa. Bidirectional.
    for a, b in _GENDER_SYNONYMS:
        if needle_lower == a:
            for o, ol in zip(options, opts_lower):
                if ol == b or b in ol:
                    return o
        if needle_lower == b:
            for o, ol in zip(options, opts_lower):
                if ol == a or a in ol:
                    return o
    return None


def _normalize_profile_answer(answer: Any, options: Optional[list]) -> Any:
    """Translate profile-stored values into option-shaped strings.

    Profile booleans become "Yes"/"No" so a form whose dropdown options are
    ["Yes", "No"] gets a matching value — without this the filler tries to
    type "True"/"False" into a react-select which then matches nothing,
    the form rejects, and the question lands right back in the drawer.

    For EEO/veteran/disability "decline" values, look up the form's actual
    decline-flavored option ('I don't wish to answer', 'Decline to identify',
    'Prefer not to answer') by scanning the options list — Greenhouse tenants
    use different exact phrasings, and typing the literal word 'decline' into
    a react-select that wants 'I don't wish to answer' produces a no-match."""
    if answer is None or answer == "":
        return answer
    if answer is True:
        return "Yes"
    if answer is False:
        return "No"
    # Try to translate to the form's exact option text. If we can't find a
    # match, fall back to the raw value so the existing combobox helper still
    # has something to type.
    if options:
        matched = _match_option(str(answer), options)
        if matched:
            return matched
    return answer


def _looks_like_consent_checkbox(label: str, field_type: str, options=None) -> bool:
    """Heuristic for a routine pre-employment acknowledgment / consent question.

    Original V1: checkbox-only — anything dropdown was LLM-routed because some
    consent dropdowns offered non-binary options (e.g. 'I Agree / I Decline /
    Tell me more'). V2 widens to selects/radios when the options are
    obviously binary Yes/No or Agree/Decline. This catches the Bugcrowd-style
    'I acknowledge falsifying info may result in dismissal' selects where
    the LLM was getting cold feet on the word 'falsifying'."""
    if not label:
        return False
    lower = label.lower()
    if not any(kw in lower for kw in _CONSENT_AUTOFILL_KEYWORDS):
        return False
    if field_type == "checkbox":
        return True
    # For select/radio: only fast-path when the options are clearly binary
    # (so we know returning "Yes" is safe). Treats 4 options as the upper
    # bound to keep richer dropdowns ("I Agree / Tell me more / Decline /
    # Other") on the LLM path.
    if field_type in ("select", "radio") and options:
        opts = [str(o).strip().lower() for o in options if o]
        if 1 <= len(opts) <= 4:
            binary_markers = {
                "yes", "no", "i agree", "agree", "i acknowledge",
                "acknowledge", "disagree", "i disagree", "decline",
            }
            if any(o in binary_markers for o in opts):
                return True
    return False


def auto_answer_form_questions(
    uid: str,
    profile: Dict[str, Any],
    resume_summary: str,
    job: Dict[str, Any],
    classified_fields: list,
) -> Dict[str, Dict[str, Any]]:
    """Single brain for the auto-apply form-fill flow.

    For each classified field (label + field_type + options + required),
    resolve in priority order:
      1. Sensitive path → Application Profile (DECLINE-defaulted for EEO,
         exact-value for work auth)
      2. Other known profile slot → profile value if set, else NEEDS_USER
         (these are preferences the LLM must not guess: salary, relocate, etc)
      3. Library lookup → user-typed answer from a prior job's drawer
      4. Queue for one batched LLM call with truthfulness rules

    Returns {field_id: {answer, source, llm_confidence?}}. `answer` is None
    when the resolution is NEEDS_USER. `source` ∈ {profile, library, llm,
    needs_user}.

    The LLM is called at most once per form, batching every queued question
    into a single request. Cost: ~$0.003 per form on gpt-4o-mini."""
    from app.services.auto_apply.answer_library import lookup_answer

    results: Dict[str, Dict[str, Any]] = {}
    llm_queue: list = []

    for field in classified_fields:
        field_id = field.get("field_id")
        label = field.get("label") or ""
        field_type = field.get("field_type") or "text"
        options = field.get("options")
        if not field_id:
            continue

        slot = map_label_to_field(label)
        print(
            f"[auto_apply.resolve] field_id={field_id!r} label={label!r} "
            f"field_type={field_type!r} slot={slot!r}",
            flush=True,
        )

        # 1. Sensitive: profile-only with DECLINE fallback for EEO.
        if slot in SENSITIVE_PROFILE_PATHS:
            answer = resolve_structured(profile, label)
            results[field_id] = {
                "answer": _normalize_profile_answer(answer, options),
                "source": "profile",
            }
            print(f"[auto_apply.resolve]   -> sensitive_profile answer={results[field_id]['answer']!r}", flush=True)
            continue

        # 2. Non-sensitive slot match: profile → library → NEEDS_USER.
        # Profile is the structured source of truth (Application Profile fields
        # the user filled in). Library is the answer the user typed in the
        # drawer on a previous auto-apply. Without checking the library here,
        # drawer answers for slot-matched fields (LinkedIn, phone, salary,
        # start date, etc.) get silently re-asked every time because the
        # slot resolver short-circuits before the library lookup.
        if slot:
            value = resolve_structured(profile, label)
            if value is not None:
                results[field_id] = {
                    "answer": _normalize_profile_answer(value, options),
                    "source": "profile",
                }
                print(f"[auto_apply.resolve]   -> profile_slot answer={results[field_id]['answer']!r}", flush=True)
                continue
            # Fall back to library — drawer answers for slot-matched fields
            # land here on subsequent runs.
            lib_value = lookup_answer(uid, label, field_type, options)
            if lib_value:
                results[field_id] = {
                    "answer": lib_value,
                    "source": "library",
                }
                print(f"[auto_apply.resolve]   -> profile_slot UNSET -> library answer={lib_value!r}", flush=True)
                continue
            results[field_id] = {"answer": None, "source": "needs_user"}
            print(f"[auto_apply.resolve]   -> profile_slot UNSET, library MISS -> needs_user", flush=True)
            continue

        # 3. Consent fast-path: deterministic auto-agree for routine
        # pre-employment acknowledgment checkboxes (privacy / confidential /
        # terms / background check / etc) AND yes/no acknowledgment selects
        # ("I acknowledge falsifying info may result in dismissal"). Bypasses
        # the LLM entirely so the LLM cannot hedge on standard click-throughs.
        if _looks_like_consent_checkbox(label, field_type, options):
            # Pick whatever the form's option label is for "agree" if we can
            # see options; default to "I Agree" otherwise. _truthy() in the
            # filler handles "I Agree" / "Yes" / "true" all the same.
            agree_answer = "I Agree"
            if options:
                for opt in options:
                    low = str(opt).lower().strip()
                    if low in ("i agree", "agree", "yes", "i acknowledge", "i consent"):
                        agree_answer = str(opt)
                        break
            results[field_id] = {"answer": agree_answer, "source": "consent_fastpath"}
            print(f"[auto_apply.resolve]   -> consent_fastpath answer={agree_answer!r}", flush=True)
            continue

        # 4. Library hit: a question the user resolved before on a prior job.
        if uid:
            try:
                from_lib = lookup_answer(uid, label, field_type, options)
            except Exception as exc:
                logger.warning("library lookup failed for %r: %s", label, exc)
                from_lib = None
            if from_lib is not None:
                results[field_id] = {"answer": from_lib, "source": "library"}
                continue

        # 5. Queue for the batched LLM call.
        llm_queue.append(field)

    if llm_queue:
        try:
            llm_answers = _batch_llm_answer(resume_summary, job, llm_queue)
        except Exception as exc:
            logger.warning("batched LLM resolver failed: %s", exc)
            llm_answers = {}

        for field in llm_queue:
            field_id = field["field_id"]
            options = field.get("options")
            llm = llm_answers.get(field_id) or {}
            answer = llm.get("answer")
            confidence = llm.get("confidence")

            # Defensive: LLM hallucinated an option not in the dropdown. Try
            # to recover via the same fuzzy matcher we use for profile→form
            # translation (handles "University of Southern California" vs
            # "University of Southern California (USC)", "Los Angeles" vs
            # "Los Angeles, CA", etc.). Only drop to NEEDS_USER when no
            # option matches reasonably — typing a literal hallucinated
            # value into a strict-validate select bounces the form.
            if (
                answer
                and answer != "NEEDS_USER"
                and options
                and str(answer) not in options
            ):
                matched = _match_option(str(answer), options)
                if matched:
                    logger.info(
                        "LLM picked %r not exact; fuzzy-matched to option %r for field %s",
                        answer, matched, field_id,
                    )
                    answer = matched
                else:
                    logger.info(
                        "LLM picked %r not in options %r for field %s — dropping to NEEDS_USER",
                        answer, options, field_id,
                    )
                    answer = None

            if not answer or answer == "NEEDS_USER":
                results[field_id] = {
                    "answer": None,
                    "source": "needs_user",
                    "llm_confidence": confidence,
                }
            else:
                results[field_id] = {
                    "answer": str(answer),
                    "source": "llm",
                    "llm_confidence": confidence,
                }

    return results


def _batch_llm_answer(
    resume_summary: str,
    job: Dict[str, Any],
    fields: list,
) -> Dict[str, Dict[str, Any]]:
    """One LLM call for every queued question. Returns
    {field_id: {answer, confidence}}. Empty dict on any failure — the caller
    routes those to NEEDS_USER."""
    if not fields:
        return {}

    import time
    _t0 = time.time()
    print(
        f"[auto_apply.llm] starting batch: queue={len(fields)} "
        f"context_chars={len(resume_summary or '')} "
        f"job={(job.get('company') or '?')[:40]}",
        flush=True,
    )

    # Build the questions block. One line per question with options when known.
    questions_lines = []
    for f in fields:
        fid = f.get("field_id")
        label = (f.get("label") or "").replace("\n", " ").strip()
        opts = f.get("options")
        opts_part = ""
        if opts:
            opts_part = f" | Options: {opts}"
        questions_lines.append(f'  - field_id="{fid}" | "{label}"{opts_part}')
    questions_block = "\n".join(questions_lines)

    prompt = _BATCH_PROMPT.format(
        role=job.get("title") or "the role",
        company=job.get("company") or "the company",
        description=(job.get("description") or "")[:1500],
        # Bumped from 1500 to 4000 — the richer student context with name,
        # email, phone, location, current role, links, work auth, resume,
        # academics easily exceeds 1500 chars and truncating early starves
        # the LLM of critical fields like work auth and current employer.
        resume_summary=(resume_summary or "")[:4000],
        questions_block=questions_block,
    )

    client = get_openai_client()
    # Hard 45s timeout — the OpenAI SDK's default is 10 minutes, which can
    # silently hang the entire form-filler when the API is slow or wedged.
    # On timeout we return {} and the caller routes every queued field to
    # NEEDS_USER (drawer), so the user can still resolve manually.
    try:
        resp = client.with_options(timeout=45.0).chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=1500,
            response_format={"type": "json_object"},
        )
    except Exception as exc:
        elapsed = time.time() - _t0
        print(
            f"[auto_apply.llm] FAILED after {elapsed:.1f}s: {type(exc).__name__}: {exc}",
            flush=True,
        )
        logger.warning("_batch_llm_answer LLM call failed: %s", exc)
        return {}
    text = (resp.choices[0].message.content or "").strip()
    if not text:
        elapsed = time.time() - _t0
        print(f"[auto_apply.llm] empty response after {elapsed:.1f}s", flush=True)
        return {}

    data = json.loads(text)
    # Tolerate both {answers: {...}} and bare {field_id: {...}} shapes.
    payload = data.get("answers") if isinstance(data, dict) and "answers" in data else data
    if not isinstance(payload, dict):
        return {}

    out: Dict[str, Dict[str, Any]] = {}
    for fid, entry in payload.items():
        if isinstance(entry, dict):
            ans = entry.get("answer")
            out[str(fid)] = {
                "answer": str(ans) if ans is not None else None,
                "confidence": entry.get("confidence"),
            }
        elif isinstance(entry, str):
            out[str(fid)] = {"answer": entry, "confidence": None}

    elapsed = time.time() - _t0
    answered = sum(
        1 for v in out.values()
        if v.get("answer") and v["answer"] != "NEEDS_USER"
    )
    needs_user = len(out) - answered
    print(
        f"[auto_apply.llm] completed: queue={len(fields)} duration={elapsed:.1f}s "
        f"answered={answered} needs_user={needs_user}",
        flush=True,
    )
    return out
