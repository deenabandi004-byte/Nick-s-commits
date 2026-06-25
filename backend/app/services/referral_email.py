"""
Referral email orchestrator — Phase 5 quality lift.

The vanilla `/api/emails/generate-and-draft` path produces competent but
generic outreach. For a *warm contact at the hiring company*, we have much
richer data to draw on, and the prompt strategy should be fundamentally
different: ask for a 15-min conversation, NOT a referral. Referrals
follow conversations; they almost never come from cold first-touch asks.

This module orchestrates the click path for "↗ Reach out to {Name}":
  1. Look up the saved contact and the user's profile + signals.
  2. Pull the user's most recent coffee-chat prep for this contact, if any
     (their own notes are by far the best context we'll ever have).
  3. Pull recent professional activity for the contact via Perplexity,
     cached so the same person isn't re-queried more than weekly.
  4. Find 1-3 specific overlaps between the JD requirements and the user's
     resume bullets — concrete, citable, not generic skill claims.
  5. Build a referral-tuned prompt with explicit banned-phrase rules + the
     two-step "ask for a chat" framing.
  6. Call gpt-4o, parse subject/body, create a Gmail draft, return the URL.
  7. Cache the (contact, job) combo so re-clicks reuse the same draft.
"""
from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from app.extensions import get_db

logger = logging.getLogger(__name__)


REFERRAL_DRAFT_TTL_DAYS = 7
PERPLEXITY_ACTIVITY_TTL_DAYS = 7

# Hard ceiling on prompt input. Coffee-chat preps and recent-activity blobs
# can be large; we trim each segment to keep gpt-4o focused on the highest
# signal context.
MAX_PROMPT_CHARS = 12000
MAX_COFFEE_CHAT_CHARS = 3000
MAX_RECENT_ACTIVITY_CHARS = 1500
MAX_JD_CHARS = 1200
MAX_OVERLAP_BULLETS = 3


# ---------------------------------------------------------------------------
# Cache helpers — (uid, contact_id, job_id) → draft result
# ---------------------------------------------------------------------------

def _cache_key(contact_id: str, job_id: str) -> str:
    """Stable key for the (contact, job) pair, hashed to a fixed length."""
    raw = f"{contact_id}::{job_id}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:32]


def _read_cached_draft(uid: str, contact_id: str, job_id: str) -> Optional[dict]:
    """Return a cached draft for this (uid, contact, job) if fresh."""
    if not (uid and contact_id and job_id):
        return None
    try:
        db = get_db()
        if not db:
            return None
        key = _cache_key(contact_id, job_id)
        doc = (
            db.collection("users")
            .document(uid)
            .collection("referral_drafts")
            .document(key)
            .get()
        )
        if not doc.exists:
            return None
        data = doc.to_dict() or {}
        expires = data.get("expires_at")
        if isinstance(expires, datetime):
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if expires < datetime.now(timezone.utc):
                return None
        return data
    except Exception:
        logger.exception("[ReferralEmail] cache read failed uid=%s", uid)
        return None


def _write_cached_draft(uid: str, contact_id: str, job_id: str, payload: dict) -> None:
    """Persist a successful draft for re-clicks within the TTL window."""
    try:
        db = get_db()
        if not db:
            return
        key = _cache_key(contact_id, job_id)
        doc = {
            **payload,
            "contact_id": contact_id,
            "job_id": job_id,
            "cached_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(days=REFERRAL_DRAFT_TTL_DAYS),
        }
        (
            db.collection("users")
            .document(uid)
            .collection("referral_drafts")
            .document(key)
            .set(doc)
        )
    except Exception:
        logger.exception("[ReferralEmail] cache write failed uid=%s", uid)


# ---------------------------------------------------------------------------
# Context gathering — each helper returns None / empty on error (never raises)
# ---------------------------------------------------------------------------

def _load_contact(uid: str, contact_id: str) -> Optional[dict]:
    """Fetch a saved contact dict from users/{uid}/contacts/{contact_id}."""
    try:
        db = get_db()
        if not db:
            return None
        doc = (
            db.collection("users")
            .document(uid)
            .collection("contacts")
            .document(contact_id)
            .get()
        )
        if not doc.exists:
            return None
        data = doc.to_dict() or {}
        data["_id"] = doc.id
        return data
    except Exception:
        logger.exception("[ReferralEmail] contact load failed uid=%s id=%s", uid, contact_id)
        return None


def _load_user_profile(uid: str) -> dict:
    """User doc + resumeParsed for prompt context."""
    try:
        db = get_db()
        if not db:
            return {}
        doc = db.collection("users").document(uid).get()
        return doc.to_dict() or {} if doc.exists else {}
    except Exception:
        logger.exception("[ReferralEmail] user load failed uid=%s", uid)
        return {}


def _load_latest_coffee_chat_prep(uid: str, contact_id: str) -> Optional[dict]:
    """Pull the user's most recent coffee-chat prep for this contact.

    This is the single highest-signal piece of context we have — the
    student already did research on this person. Surfacing it into the
    referral prompt means the email reads like a follow-up, not a cold
    pitch. Returns the raw prep dict (or None if none exists).

    Note: filter by contactId only (no order_by) so we don't require a
    composite Firestore index. Picks the newest in Python from the small
    set returned. Users typically have <5 preps per contact.
    """
    try:
        db = get_db()
        if not db:
            return None
        prep_query = (
            db.collection("users")
            .document(uid)
            .collection("coffee-chat-preps")
            .where("contactId", "==", contact_id)
            .limit(5)
        )
        candidates = []
        for doc in prep_query.stream():
            data = doc.to_dict() or {}
            data["_id"] = doc.id
            candidates.append(data)
        if not candidates:
            return None
        # Newest first by createdAt string (ISO format sorts lexicographically).
        candidates.sort(key=lambda d: d.get("createdAt") or "", reverse=True)
        return candidates[0]
    except Exception:
        logger.warning(
            "[ReferralEmail] coffee-chat prep query failed uid=%s contact=%s",
            uid, contact_id, exc_info=True,
        )
        return None


def _load_recent_activity(contact: dict) -> str:
    """Perplexity sonar pull for what the contact is currently working on.

    Returns a short prose paragraph or "" on failure. Cached via the
    Perplexity client's own enrichment cache.

    GUARD: rejects generic content that doesn't name a specific post,
    paper, talk, or product. The previous version passed "innovative
    projects happening at OpenAI"-style filler to the LLM, which then
    confabulated a fake LinkedIn-post reference in the email opener.
    If we don't have something specific, the prompt should fall back
    to the honest-direct opener instead of fabricating one.
    """
    full_name = (
        contact.get("name") or contact.get("Name")
        or f"{(contact.get('firstName') or contact.get('FirstName') or '').strip()} "
           f"{(contact.get('lastName') or contact.get('LastName') or '').strip()}".strip()
    ).strip()
    company = (contact.get("company") or contact.get("Company") or "").strip()
    title = (contact.get("title") or contact.get("Title") or "").strip()
    if not full_name or not company:
        return ""
    try:
        from app.services.perplexity_client import quick_search
        query = (
            f"What specifically has {full_name} ({title} at {company}) posted, "
            f"published, or been quoted on in the last 60 days? Name the exact "
            f"post title, paper, talk, podcast, or product launch. Do not "
            f"summarize general company news. If you cannot find a specific "
            f"named work by this individual, reply with the single word: NONE"
        )
        result = quick_search(query, recency="month")
        content = ((result or {}).get("content") or "").strip()
        if not content or "NONE" in content.upper()[:50]:
            return ""
        # Reject if it looks generic — no proper nouns past the first 20 chars,
        # or contains hedging language. These are the cases that lead to the
        # "I enjoyed your recent post about innovative projects" disasters.
        lower = content.lower()
        bad_signals = (
            "innovative projects", "exciting work", "general", "broadly",
            "company has been", "team is working on", "the company",
            "no specific", "could not find", "i cannot",
        )
        if any(s in lower for s in bad_signals):
            logger.info("[ReferralEmail] recent-activity rejected as generic: %s", content[:120])
            return ""
        return content[:MAX_RECENT_ACTIVITY_CHARS]
    except Exception:
        logger.warning("[ReferralEmail] recent-activity lookup failed", exc_info=True)
        return ""


def _has_prior_email_thread(uid: str, contact_email: str) -> bool:
    """Check the saved-contact doc for any prior email thread signal.

    Cheap probe — we don't fetch Gmail threads here, just look for fields
    the existing email-generation flow writes when it creates a draft
    (gmailDraftId, gmailThreadId, lastActivityAt). If any are present,
    treat the relationship as having prior contact.
    """
    # Caller already loaded the contact, so passing the email back through
    # would be redundant. Instead, the caller passes the contact dict
    # directly to _relationship_strength which checks these fields.
    # This helper kept for future Gmail-thread API check if we want it.
    return False


def _flatten_skills(skills_field: Any) -> list[str]:
    """resumeParsed.skills is sometimes a list, sometimes a dict-of-lists."""
    if isinstance(skills_field, list):
        return [str(s) for s in skills_field if isinstance(s, str)]
    if isinstance(skills_field, dict):
        flat = []
        for v in skills_field.values():
            if isinstance(v, list):
                flat.extend([str(s) for s in v if isinstance(s, str)])
        return flat
    return []


def _extract_jd_resume_overlap(job: dict, profile: dict) -> list[str]:
    """Find 1-3 concrete overlaps between this JD and the user's resume.

    Used as evidence in the prompt — "I noticed the role calls for X; I built
    Y last summer." Specific > generic skill lists.

    Scans, in priority order:
      1. structured.requirements (Firecrawl-extracted, cleanest)
      2. structured.responsibilities
      3. job.description / description_raw (last resort, noisy)
    against the user's:
      a. skill keywords (resumeParsed.skills)
      b. experience titles (resumeParsed.experience[].title)
      c. project keywords (resumeParsed.projects[].keywords)
    """
    resume = profile.get("resumeParsed") or {}
    skills = {s.lower() for s in _flatten_skills(resume.get("skills")) if isinstance(s, str) and len(s) > 2}
    experiences = resume.get("experience") or []
    projects = resume.get("projects") or []

    structured = job.get("structured") or {}
    jd_sources: list[str] = []
    reqs = structured.get("requirements") or []
    if isinstance(reqs, list):
        jd_sources.extend(str(r) for r in reqs if isinstance(r, str))
    resp = structured.get("responsibilities") or []
    if isinstance(resp, list):
        jd_sources.extend(str(r) for r in resp if isinstance(r, str))
    description = (job.get("description") or job.get("description_raw") or "")[:MAX_JD_CHARS]
    if description:
        # Split description into rough sentences as a last-resort source.
        for sent in re.split(r"[\.\n•]+", description):
            sent = sent.strip()
            if 20 <= len(sent) <= 200:
                jd_sources.append(sent)

    # Build experience keyword set
    exp_terms: set[str] = set()
    for exp in experiences[:5]:
        if not isinstance(exp, dict):
            continue
        title = (exp.get("title") or "").lower()
        for w in re.split(r"\W+", title):
            if len(w) > 3:
                exp_terms.add(w)
        keywords = exp.get("keywords") or []
        if isinstance(keywords, list):
            for k in keywords[:8]:
                if isinstance(k, str) and len(k) > 2:
                    exp_terms.add(k.lower())

    project_terms: set[str] = set()
    for proj in projects[:5]:
        if not isinstance(proj, dict):
            continue
        keywords = proj.get("keywords") or []
        if isinstance(keywords, list):
            for k in keywords[:8]:
                if isinstance(k, str) and len(k) > 2:
                    project_terms.add(k.lower())

    overlaps: list[str] = []
    seen: set[str] = set()
    for source in jd_sources:
        source_lower = source.lower()
        # Find which user term matched
        matched_term = None
        for term in skills:
            if term in source_lower:
                matched_term = term
                break
        if not matched_term:
            for term in project_terms:
                if term in source_lower:
                    matched_term = term
                    break
        if not matched_term:
            for term in exp_terms:
                if term in source_lower:
                    matched_term = term
                    break
        if matched_term and source not in seen:
            overlaps.append(f"{source.strip()} (matches your `{matched_term}`)")
            seen.add(source)
        if len(overlaps) >= MAX_OVERLAP_BULLETS:
            break
    return overlaps


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------

from app.services.email_rules import EMAIL_QUALITY_RULES


# Relationship strength is computed from inputs and decides the ask framing.
# This is research-backed: Stephanie Manwaring's best-received referral email
# was direct. Career Principles' templates are direct. Ramit Sethi's scripts
# are direct. The "ask for chat not referral" two-step is only better when
# there's no real relationship — for saved warm contacts, directness wins.
SYSTEM_PROMPT_BASE = """You are drafting a referral-outreach email from a \
college student to a SAVED contact at a company where the student is \
interested in a specific open role. The recipient is someone the student \
already knows or has a meaningful shared context with (alumni, prior chat, \
or saved from a search). This is NOT a cold email.

YOUR JOB
Write an email that gets a yes — either to a referral or to a short \
conversation, depending on the relationship strength. Be honest, specific, \
and direct. Sophisticated recipients reward clarity, not coyness.

""" + EMAIL_QUALITY_RULES


def _relationship_strength(
    contact: dict,
    coffee_chat_prep,
    has_prior_email_thread: bool,
    user_school: str,
) -> str:
    """Classify the relationship strength based on signals we have.

    v3 fix: "strong" requires actual *content* to reference. A bare
    "Gmail thread exists" boolean is NOT enough — without the thread's
    subject/body the model fabricates a fake prior conversation. The
    boolean still moves us up to "moderate" (you've interacted, but we
    don't have content to cite verbatim), which is honest.

    Levels:
      strong   → coffee-chat prep exists (rich content the model can cite)
      moderate → prior thread OR shared school (interaction exists but no
                 specific content the model can quote — use honest-direct
                 opener, don't fabricate)
      weak     → saved contact, no shared signal (treat as cold)
    """
    if coffee_chat_prep:
        return "strong"
    if has_prior_email_thread:
        return "moderate"
    contact_school = (contact.get("college") or contact.get("College") or "").strip().lower()
    user_school = (user_school or "").strip().lower()
    if user_school and contact_school and user_school == contact_school:
        return "moderate"
    return "weak"


_ASK_FRAMING = {
    "strong": (
        "RELATIONSHIP: STRONG (coffee-chat prep content exists — you have "
        "ground-truth notes from the student's research on this person).\n"
        "ASK FRAMING: Lead the opener by citing one specific detail from the "
        "STUDENT'S PRIOR RESEARCH block. If a prior conversation is referenced "
        "in the prep notes, you may say 'Following up on our chat about "
        "[specific topic from the prep]' — but ONLY if a specific topic is "
        "in the prep. Do NOT invent a conversation that isn't documented. "
        "Ask DIRECTLY for a referral or to share the student's resume with "
        "the hiring team. Always include an out clause."
    ),
    "moderate": (
        "RELATIONSHIP: MODERATE (interacted before via email, OR shared "
        "school — but we do NOT have specific content (no coffee-chat prep, "
        "no quoted prior message). Do NOT invent a prior conversation or "
        "fabricate what was discussed.\n"
        "ASK FRAMING: Use the honest-direct opener. If shared school: "
        "'Fellow [school] '24 here — saw the [exact role title] open at "
        "[company] and wanted to reach out.' If prior interaction without "
        "content: 'Hi [first name] — applying to the [exact role title] at "
        "[company] and wanted to reach out to you specifically.' Then ask "
        "DIRECTLY for a referral or resume forward. Always include an out "
        "clause. NEVER write 'Following up on our chat' or similar without "
        "specific content to cite."
    ),
    "weak": (
        "RELATIONSHIP: WEAK / COLD (saved contact, no shared signal). The "
        "recipient does not know the sender. This IS a cold email — frame "
        "it as such.\n"
        "ASK FRAMING: Acknowledge briefly that the sender doesn't know the "
        "recipient yet ('I came across your name while researching [team]' "
        "or 'I haven't had the chance to connect before, but…'). Then state "
        "one specific, honest reason for reaching out to THIS person (their "
        "team, their role, a specific aspect of their work that's relevant). "
        "Do NOT ask for a referral in the first email — the recipient owes "
        "you nothing yet. Ask for a brief 15-minute conversation about their "
        "experience at the company. Be direct and respectful. Always give "
        "them an out."
    ),
}


def _build_system_prompt(relationship: str) -> str:
    """Compose the full system prompt with the relationship-specific framing."""
    return SYSTEM_PROMPT_BASE + "\n\n" + _ASK_FRAMING.get(relationship, _ASK_FRAMING["weak"])


def _profile_summary(profile: dict) -> str:
    """Compact one-paragraph summary of the user for the prompt."""
    parsed = profile.get("resumeParsed") or {}
    edu = parsed.get("education") or {}
    major = (edu.get("major") if isinstance(edu, dict) else None) or profile.get("major") or ""
    school = (
        (edu.get("school") if isinstance(edu, dict) else None)
        or profile.get("university")
        or profile.get("school")
        or ""
    )
    grad = (
        (edu.get("graduation_year") if isinstance(edu, dict) else None)
        or profile.get("graduationYear")
        or ""
    )
    skills = _flatten_skills(parsed.get("skills"))[:8]
    experiences = parsed.get("experience") or []
    exp_strs: list[str] = []
    for e in experiences[:3]:
        if not isinstance(e, dict):
            continue
        title = e.get("title") or ""
        company = e.get("company") or ""
        if title and company:
            exp_strs.append(f"{title} at {company}")
        elif title:
            exp_strs.append(title)
    name = profile.get("name") or parsed.get("name") or "the student"
    parts = [
        f"Name: {name}",
        f"School: {school}" if school else "",
        f"Major: {major}" if major else "",
        f"Graduation: {grad}" if grad else "",
        f"Top skills: {', '.join(skills)}" if skills else "",
        f"Recent experience: {'; '.join(exp_strs)}" if exp_strs else "",
    ]
    return "\n".join(p for p in parts if p)


def _contact_summary(contact: dict, alumni_match_school: str) -> str:
    """How the user knows this contact, plus contact basics."""
    name = (contact.get("name") or contact.get("Name") or "").strip()
    title = (contact.get("title") or contact.get("Title") or "").strip()
    company = (contact.get("company") or contact.get("Company") or "").strip()
    college = (contact.get("college") or contact.get("College") or "").strip()
    note = (contact.get("note") or contact.get("notes") or "").strip()
    linkedin = (contact.get("linkedinUrl") or contact.get("LinkedIn") or "").strip()

    rel = []
    if college and alumni_match_school and college.lower().strip() == alumni_match_school.lower().strip():
        rel.append(f"Shared school: both attended {college}.")
    elif college:
        rel.append(f"Contact attended {college}.")
    if note:
        rel.append(f"User's note about this contact: {note[:400]}")

    parts = [
        f"Name: {name}",
        f"Title: {title}" if title else "",
        f"Company: {company}",
        f"LinkedIn: {linkedin}" if linkedin else "",
        *rel,
    ]
    return "\n".join(p for p in parts if p)


def _job_summary(job: dict) -> str:
    """One-paragraph framing of the role for the prompt."""
    title = job.get("title") or ""
    company = job.get("company") or ""
    location = job.get("location") or ""
    structured = job.get("structured") or {}
    team = structured.get("team") or ""
    employment_type = structured.get("employment_type") or job.get("type") or ""
    apply_url = job.get("apply_url") or job.get("url") or ""
    parts = [
        f"Role: {title}",
        f"Company: {company}",
        f"Location: {location}" if location else "",
        f"Team: {team}" if team else "",
        f"Type: {employment_type}" if employment_type else "",
        # v3: surface JOB_URL so the model can inline it instead of
        # hallucinating "the job link is attached".
        f"JOB_URL (include this inline in the body as a plain URL): {apply_url}" if apply_url else "",
    ]
    return "\n".join(p for p in parts if p)


def _build_user_prompt(
    profile: dict,
    contact: dict,
    job: dict,
    coffee_chat_prep: Optional[dict],
    recent_activity: str,
    overlaps: list[str],
) -> str:
    """Compose the full user-side prompt with all gathered context."""
    user_school = (
        ((profile.get("resumeParsed") or {}).get("education") or {}).get("school")
        or profile.get("university")
        or profile.get("school")
        or ""
    )
    sections = []
    sections.append("STUDENT:\n" + _profile_summary(profile))
    sections.append("CONTACT (the recipient):\n" + _contact_summary(contact, user_school))
    sections.append("ROLE THE STUDENT IS INTERESTED IN:\n" + _job_summary(job))

    if overlaps:
        sections.append(
            "SPECIFIC OVERLAPS between this role and the student's background:\n- "
            + "\n- ".join(overlaps)
        )
    else:
        sections.append(
            "SPECIFIC OVERLAPS: none found. Cite the student's major or a concrete "
            "skill from their resume instead of inventing a project."
        )

    if coffee_chat_prep:
        # The prep is rich — pull the strongest text fields and trim.
        prep_bits = []
        for k in ("summary", "background", "talkingPoints", "researchSummary", "notes"):
            v = coffee_chat_prep.get(k)
            if isinstance(v, str) and v.strip():
                prep_bits.append(f"{k}: {v.strip()}")
            elif isinstance(v, list) and v:
                prep_bits.append(f"{k}: " + "; ".join(str(x) for x in v[:5] if x))
        contact_data = coffee_chat_prep.get("contactData") or {}
        if isinstance(contact_data, dict):
            cd_summary = contact_data.get("summary") or contact_data.get("about") or ""
            if isinstance(cd_summary, str) and cd_summary.strip():
                prep_bits.append(f"contactSummary: {cd_summary.strip()}")
        if prep_bits:
            blob = "\n".join(prep_bits)[:MAX_COFFEE_CHAT_CHARS]
            sections.append(
                "STUDENT'S PRIOR RESEARCH on this contact (treat as ground truth — "
                "use it to make the email feel like a continuation, not a cold pitch):\n"
                + blob
            )

    if recent_activity:
        sections.append(
            "CONTACT'S RECENT ACTIVITY (from web search — cite only if it sounds "
            "natural in a brief opener):\n" + recent_activity
        )

    sections.append(
        "WRITE THE EMAIL NOW. Output exactly:\n"
        "Subject: <line>\n\n"
        "<body>"
    )
    full = "\n\n---\n".join(sections)
    return full[:MAX_PROMPT_CHARS]


# ---------------------------------------------------------------------------
# LLM call
# ---------------------------------------------------------------------------

def _call_llm(system_prompt: str, user_prompt: str, temperature: float = 0.5) -> tuple[str, str]:
    """Run gpt-4o on the assembled prompts. Returns (subject, body)."""
    from app.services.openai_client import get_openai_client

    client = get_openai_client()
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=temperature,
        max_tokens=600,
    )
    content = (response.choices[0].message.content or "").strip()
    return _parse_subject_body(content)


def _call_llm_with_quality_check(
    system_prompt: str, user_prompt: str
) -> tuple[str, str, list[str]]:
    """Generate, scrub for banned phrases, regenerate once if dirty.

    Returns (subject, body, remaining_issues). Single retry — if the second
    attempt still has issues, we hand back what we have and let the
    inline-preview UI surface them so the student can edit.
    """
    from app.services.email_rules import detect_quality_issues

    subject, body = _call_llm(system_prompt, user_prompt, temperature=0.5)
    issues = detect_quality_issues(subject, body)
    if not issues:
        return subject, body, []

    logger.info("[ReferralEmail] first draft had quality issues, regenerating: %s", issues[:3])
    # Surface the issues to the model and ask it to fix them. Slightly
    # higher temperature so it doesn't reproduce the same banned phrases.
    fix_prompt = user_prompt + "\n\n---\nYOUR PREVIOUS DRAFT FAILED QUALITY CHECK. Issues: " \
                 + "; ".join(issues[:5]) \
                 + "\nRewrite from scratch, fixing these issues. Same output format."
    subject2, body2 = _call_llm(system_prompt, fix_prompt, temperature=0.65)
    issues2 = detect_quality_issues(subject2, body2)
    if len(issues2) < len(issues):
        return subject2, body2, issues2
    # Regen didn't help — return the first draft, which was at least
    # generated with the more-deterministic temperature.
    return subject, body, issues


def _parse_subject_body(content: str) -> tuple[str, str]:
    """Split the model's output into (subject, body).

    Accepts either:
      Subject: ...\n\n<body>
    or
      Subject Line: ...\n\n<body>
    Falls back to "Quick chat?" if no subject line is found.
    """
    if not content:
        return "Quick chat?", ""
    # Strip leading code fences if any
    content = re.sub(r"^```\w*\s*", "", content.strip()).rstrip("`").strip()
    m = re.search(r"^\s*subject(?:\s*line)?\s*:\s*(.+)$", content, flags=re.I | re.M)
    if not m:
        return "Quick chat?", content.strip()
    subject = m.group(1).strip().strip('"').strip("'")
    body = content[m.end():].strip()
    # Strip a leading blank line or "Body:" prefix the model sometimes emits.
    body = re.sub(r"^\s*body\s*:\s*", "", body, flags=re.I)
    return subject or "Quick chat?", body


# ---------------------------------------------------------------------------
# Gmail draft creation
# ---------------------------------------------------------------------------

def _split_full_name(contact: dict) -> tuple[str, str]:
    """Best-effort extraction of (first_name, last_name) from a contact doc.

    Saved contacts come from many sources (PDL search, LinkedIn import, manual
    Find Humans, Gmail thread sync). Each writes the name field differently.
    Try every variant we've seen in production.
    """
    full = (
        contact.get("name")
        or contact.get("Name")
        or contact.get("fullName")
        or contact.get("FullName")
        or ""
    ).strip()
    first_field = (
        contact.get("firstName")
        or contact.get("FirstName")
        or contact.get("first_name")
        or ""
    ).strip()
    last_field = (
        contact.get("lastName")
        or contact.get("LastName")
        or contact.get("last_name")
        or ""
    ).strip()

    if first_field or last_field:
        return first_field, last_field
    if not full:
        return "", ""
    parts = full.split()
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def _load_user_resume_attachment(user_data: dict) -> tuple[Optional[bytes], Optional[str]]:
    """Fetch the user's resume PDF bytes + filename for Gmail attachment.

    Mirrors how /api/job-board/find-recruiter loads the resume — same
    `resumeURL`/`resumeUrl` field check, same `download_resume_from_url`
    helper, same filename override via `resumeFileName`. Returns
    (None, None) when no URL is set or the download fails (in which case
    the draft is created without an attachment — the email still ships,
    just no resume).
    """
    if not isinstance(user_data, dict):
        return None, None
    resume_url = user_data.get("resumeURL") or user_data.get("resumeUrl")
    if not resume_url:
        return None, None
    try:
        from app.services.gmail_client import download_resume_from_url
        content, filename = download_resume_from_url(resume_url)
        if content:
            stored_filename = user_data.get("resumeFileName")
            if stored_filename:
                filename = stored_filename
            logger.info(
                "[ReferralEmail] resume downloaded for attachment (%d bytes, filename=%s)",
                len(content), filename,
            )
            return content, filename
    except Exception:
        logger.warning("[ReferralEmail] resume download failed", exc_info=True)
    return None, None


def _create_gmail_draft(
    uid: str,
    user_email: str,
    contact: dict,
    subject: str,
    body: str,
    user_data: Optional[dict] = None,
) -> tuple[Optional[str], Optional[str]]:
    """Create a Gmail draft in the user's Gmail. Returns (draft_id, gmail_url).

    Attaches the user's resume PDF when `user_data` carries a resumeURL.
    Mirrors the Find Recruiter resume-attachment pattern so the referral
    draft lands with the same file the recipient would get from any other
    Offerloop-drafted email. user_data is optional so legacy callers don't
    break; without it the draft is created without an attachment.

    Falls back to (None, None) when the user has no Gmail integration. The
    SPA handles that case by surfacing subject/body for copy-paste.

    create_gmail_draft_for_user returns a dict {draft_id, message_id,
    draft_url, recipient_email} on success or a "mock_*" string on failure
    or when Gmail isn't connected — handle both.
    """
    try:
        from app.services.gmail_client import (
            create_gmail_draft_for_user,
            get_gmail_service_for_user,
        )

        # Normalize the contact dict to what create_gmail_draft_for_user expects.
        # It probes WorkEmail / Email / PersonalEmail in that order.
        recipient_email = (
            contact.get("Email")
            or contact.get("email")
            or contact.get("WorkEmail")
            or contact.get("work_email")
            or contact.get("PersonalEmail")
            or ""
        )
        if not recipient_email:
            return None, None

        first_name, last_name = _split_full_name(contact)
        contact_for_draft = {
            "Email": recipient_email,
            "FirstName": first_name,
            "LastName": last_name,
        }

        # Check that Gmail is connected before we try.
        if not get_gmail_service_for_user(user_email, user_id=uid):
            return None, None

        # Pull the user's resume PDF if a URL is on file. Find Recruiter does
        # this same thing — the student expects the referral draft to ship
        # with the resume already attached, since that's what the recipient
        # needs to act on a referral request.
        resume_content, resume_filename = _load_user_resume_attachment(user_data or {})

        # user_info drives the HTML signature block in the email body.
        # Sourced from user_data so the signature matches what shows in
        # other email flows (name, university, etc.).
        user_info = None
        if user_data:
            user_info = {
                "name": user_data.get("name") or user_data.get("displayName") or "",
                "email": user_data.get("email") or user_email or "",
                "phone": user_data.get("phone") or "",
                "linkedin": user_data.get("linkedin") or user_data.get("linkedinUrl") or "",
            }

        result = create_gmail_draft_for_user(
            contact_for_draft,
            subject,
            body,
            tier="referral",
            user_email=user_email,
            user_id=uid,
            resume_content=resume_content,
            resume_filename=resume_filename,
            user_info=user_info,
        )
        # Success path: dict with draft_id / draft_url / message_id / recipient_email.
        # Failure path: string starting with "mock_".
        if isinstance(result, dict):
            draft_id = result.get("draft_id")
            draft_url = result.get("draft_url")
            if not draft_id:
                return None, None
            # Prefer the URL the Gmail client built (it knows the message_id).
            return draft_id, draft_url
        if isinstance(result, str) and not result.startswith("mock_"):
            # Older code path returned a raw draft id string. Construct URL.
            return result, f"https://mail.google.com/mail/u/0/#draft/{result}"
        return None, None
    except Exception:
        logger.exception("[ReferralEmail] Gmail draft create failed uid=%s", uid)
        return None, None


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def build_referral_draft(
    uid: str,
    user_email: str,
    contact_id: str,
    job: dict,
    *,
    commit: bool = False,
) -> dict:
    """Generate referral email text. Returns subject + body + context.

    Phase-5 step 1 of two: produces the draft text from rich context. The
    SPA shows it in a preview/edit modal; the user reviews, edits, and
    clicks "Open in Gmail" to commit. Step 2 (commit_referral_draft below)
    creates the actual Gmail draft from whatever text the user submits —
    which may or may not match what we generated.

    Set commit=True for the legacy auto-open behavior (creates the Gmail
    draft immediately with the generated text, returns gmailUrl). Default
    is False so the SPA can put a human in the loop.
    """
    if not uid or not contact_id:
        return {"ok": False, "error": "missing_uid_or_contact"}

    job_id = (job or {}).get("job_id") or (job or {}).get("id") or ""
    # Cache only the text — not the Gmail URL, which only exists in legacy
    # commit=True path. The modal path doesn't reuse Gmail drafts across
    # clicks because the user may edit between clicks.
    cached = None
    if job_id and commit:
        cached = _read_cached_draft(uid, contact_id, job_id)
    if cached and cached.get("gmailUrl"):
        return {
            "ok": True,
            "gmailUrl": cached.get("gmailUrl"),
            "draftId": cached.get("draftId"),
            "subject": cached.get("subject"),
            "body": cached.get("body"),
            "cached": True,
            "context_used": cached.get("context_used") or {},
        }

    contact = _load_contact(uid, contact_id)
    if not contact:
        return {"ok": False, "error": "contact_not_found"}

    profile = _load_user_profile(uid)
    coffee_chat = _load_latest_coffee_chat_prep(uid, contact_id)
    recent_activity = _load_recent_activity(contact)
    overlaps = _extract_jd_resume_overlap(job or {}, profile)

    # Has the user emailed this contact before? The save-on-send path in
    # routes/emails.py writes gmailDraftId / gmailMessageId / lastActivityAt
    # on the contact doc; presence of any of those = prior contact.
    has_prior_thread = bool(
        contact.get("gmailDraftId")
        or contact.get("gmailMessageId")
        or contact.get("gmailThreadId")
        or contact.get("lastActivityAt")
    )

    user_school = (
        ((profile.get("resumeParsed") or {}).get("education") or {}).get("school")
        or profile.get("university")
        or profile.get("school")
        or ""
    )
    relationship = _relationship_strength(
        contact=contact,
        coffee_chat_prep=coffee_chat,
        has_prior_email_thread=has_prior_thread,
        user_school=user_school,
    )
    system_prompt = _build_system_prompt(relationship)

    user_prompt = _build_user_prompt(
        profile=profile,
        contact=contact,
        job=job or {},
        coffee_chat_prep=coffee_chat,
        recent_activity=recent_activity,
        overlaps=overlaps,
    )

    try:
        subject, body, remaining_issues = _call_llm_with_quality_check(
            system_prompt, user_prompt,
        )
    except Exception as e:
        logger.exception("[ReferralEmail] LLM call failed uid=%s", uid)
        return {"ok": False, "error": f"llm_failed:{type(e).__name__}"}

    if not subject or not body:
        return {"ok": False, "error": "empty_generation"}

    context_used = {
        "has_coffee_chat_prep": bool(coffee_chat),
        "has_recent_activity": bool(recent_activity),
        "has_prior_thread": has_prior_thread,
        "overlap_count": len(overlaps),
        "relationship": relationship,
        "quality_issues": remaining_issues,  # surface to the UI so user knows
    }

    payload: dict = {
        "ok": True,
        "gmailUrl": None,
        "draftId": None,
        "subject": subject,
        "body": body,
        "cached": False,
        "context_used": context_used,
    }

    # Legacy: commit immediately (no preview/edit). Kept so the route can
    # still opt into the auto-open behavior if we ever want it.
    if commit:
        # Reuse the profile we already loaded — avoids a second Firestore read.
        draft_id, gmail_url = _create_gmail_draft(
            uid, user_email, contact, subject, body, user_data=profile,
        )
        payload["draftId"] = draft_id
        payload["gmailUrl"] = gmail_url
        if job_id and gmail_url:
            _write_cached_draft(uid, contact_id, job_id, payload)

    return payload


def commit_referral_draft(
    uid: str, user_email: str, contact_id: str, subject: str, body: str
) -> dict:
    """Create a Gmail draft from user-edited text. Step 2 of the preview/edit flow.

    The SPA calls this after the student has reviewed and (optionally
    edited) the text produced by build_referral_draft. We do NOT regenerate
    text here — we trust whatever the user submitted. Returns the Gmail
    URL for the SPA to open.
    """
    if not uid or not contact_id:
        return {"ok": False, "error": "missing_uid_or_contact"}
    if not subject or not body:
        return {"ok": False, "error": "empty_text"}
    if len(subject) > 200 or len(body) > 6000:
        # Defensive bounds — the prompt produces ~130 words but a
        # determined user can paste a wall of text.
        return {"ok": False, "error": "text_too_long"}

    contact = _load_contact(uid, contact_id)
    if not contact:
        return {"ok": False, "error": "contact_not_found"}

    # Load the user doc once — needed for both the resume attachment lookup
    # (resumeURL + resumeFileName) and the signature block (name, university).
    user_data = _load_user_profile(uid)

    draft_id, gmail_url = _create_gmail_draft(
        uid, user_email, contact, subject, body, user_data=user_data,
    )
    if not gmail_url:
        return {
            "ok": False,
            "error": "gmail_not_connected",
            # Still echo back the text so the SPA can show a copy-paste fallback.
            "subject": subject,
            "body": body,
        }
    return {
        "ok": True,
        "gmailUrl": gmail_url,
        "draftId": draft_id,
        "subject": subject,
        "body": body,
    }
