"""
Email quality gate - deterministic checks, no LLM.

Validates generated emails meet a quality floor before the student sees them.
"""
import re

# ---------------------------------------------------------------------------
# Ask-phrase patterns (compiled once)
# ---------------------------------------------------------------------------
_ASK_PATTERNS = re.compile(
    r"15 minutes|quick chat|meeting|your time|would love to hear|"
    r"would appreciate|brief call|short conversation|few minutes|"
    r"chance to connect|love to learn|happy to work around your schedule|"
    r"pick your brain|hear your perspective|learn more about",
    re.IGNORECASE,
)

_TEMPLATE_LEAK = re.compile(r"\[Name\]|\[Company\]|\{\{|(?<!\w)\[\s*\]")

_GENERIC_SUBJECTS = frozenset({
    "meeting?", "quick question", "hi", "hello", "hey",
    "introduction", "reaching out", "networking",
})


# ---------------------------------------------------------------------------
# Shared helper (also used by metrics instrumentation in runs.py)
# ---------------------------------------------------------------------------

def has_specificity_signal(body: str, contact: dict) -> bool:
    """Return True if body contains at least one concrete reference to the recipient."""
    body_lower = body.lower()
    company = (contact.get("Company") or contact.get("company") or "").strip().lower()
    college = (contact.get("College") or contact.get("college") or "").strip().lower()
    role = (contact.get("Title") or contact.get("title") or "").strip().lower()

    if company and company in body_lower:
        return True
    if college and college in body_lower:
        return True
    if role and len(role) > 3 and role in body_lower:
        return True
    return False


def subject_has_contact_proper_noun(
    subject: str, contact: dict, user_university: str = "",
) -> bool:
    """Return True if subject contains at least one proper noun from the contact
    that is NOT just the user's own university.

    Checks: contact's company, first name, title keywords (≥4 chars).
    """
    subj_lower = subject.lower()
    user_uni_lower = user_university.strip().lower() if user_university else ""

    company = (contact.get("Company") or contact.get("company") or "").strip()
    first_name = (contact.get("FirstName") or contact.get("first_name") or "").strip()
    title = (contact.get("Title") or contact.get("title") or "").strip()

    # Company name (not the user's university)
    # Check full name and significant words (≥4 chars) for partial matches like "Goldman" for "Goldman Sachs"
    if company:
        co_lower = company.lower()
        if co_lower != user_uni_lower:
            if co_lower in subj_lower:
                return True
            for word in co_lower.split():
                if len(word) >= 4 and word in subj_lower:
                    return True

    # Contact's first name
    if first_name and len(first_name) > 1 and first_name.lower() in subj_lower:
        return True

    # Title keywords ≥4 chars (avoids "VP", "PM" false positives on short words)
    if title:
        for word in title.split():
            w = word.strip().lower().rstrip(",;.")
            if len(w) >= 4 and w in subj_lower:
                return True

    return False


# ---------------------------------------------------------------------------
# Quality check
# ---------------------------------------------------------------------------

def check_email_quality(
    email_subject: str,
    email_body: str,
    contact: dict,
    user_university: str = "",
) -> dict:
    """
    Deterministic quality check.

    Returns {"passed": bool, "failures": list[str]}
    Failure names: too_short, too_long, no_specificity, no_clear_ask,
                   template_leak, weak_subject, subject_no_contact_noun
    """
    failures = []
    body = (email_body or "").strip()
    subject = (email_subject or "").strip()
    word_count = len(body.split())

    if word_count < 60:
        failures.append("too_short")
    elif word_count > 180:
        failures.append("too_long")

    if not has_specificity_signal(body, contact):
        failures.append("no_specificity")

    if not _ASK_PATTERNS.search(body):
        failures.append("no_clear_ask")

    if _TEMPLATE_LEAK.search(body) or _TEMPLATE_LEAK.search(subject):
        failures.append("template_leak")

    subject_words = len(subject.split())
    if subject_words < 3 or subject_words > 8 or subject.lower().rstrip("?").strip() in _GENERIC_SUBJECTS:
        failures.append("weak_subject")

    # P1a: Subject must reference the contact, not just the sender's school
    if not subject_has_contact_proper_noun(subject, contact, user_university):
        failures.append("subject_no_contact_noun")

    return {"passed": len(failures) == 0, "failures": failures}


# ---------------------------------------------------------------------------
# Batch diversity check (P1b)
# ---------------------------------------------------------------------------

def _extract_subject_prefix(subject: str, n_words: int = 3) -> str:
    """First N words of subject, lowercased. Used for duplicate detection."""
    words = subject.lower().split()[:n_words]
    return " ".join(words)


def _extract_opener(body: str) -> str:
    """First non-greeting, non-empty line of the body, lowercased."""
    for line in body.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.lower().startswith("hi ") or stripped.lower().startswith("hey "):
            continue
        return stripped.lower()
    return ""


def check_batch_diversity(
    results: dict,
    contacts: list,
) -> list[int]:
    """Check a batch of generated emails for subject/opener duplication.

    Returns list of indices that should be regenerated (the later duplicate
    in each collision pair). An empty list means the batch is diverse enough.
    """
    indices_to_regen: set[int] = set()
    sorted_keys = sorted(results.keys())

    # --- Subject prefix collisions (first 3 words) ---
    seen_prefixes: dict[str, int] = {}  # prefix -> first index
    for idx in sorted_keys:
        r = results[idx]
        prefix = _extract_subject_prefix(r.get("subject", ""))
        if not prefix:
            continue
        if prefix in seen_prefixes:
            indices_to_regen.add(idx)  # keep the first, mark the duplicate
        else:
            seen_prefixes[prefix] = idx

    # --- Opener collisions ---
    # Two checks: first sentence match AND first 8-word match.
    # The 8-word check catches "I'm Sarah, a Finance student at USC exploring"
    # patterns that share a template even if the rest of the sentence differs.
    seen_openers: dict[str, int] = {}
    seen_opener_prefixes: dict[str, int] = {}
    for idx in sorted_keys:
        r = results[idx]
        opener = _extract_opener(r.get("body", ""))
        if not opener or len(opener) < 15:
            continue

        # Check 1: first sentence (up to first period/exclamation)
        first_sentence = opener
        for sep in (".", "!", "?"):
            if sep in first_sentence:
                first_sentence = first_sentence[:first_sentence.index(sep) + 1]
                break
        sentence_key = first_sentence[:80]
        if sentence_key in seen_openers:
            indices_to_regen.add(idx)
        else:
            seen_openers[sentence_key] = idx

        # Check 2: first 8 words (catches templated positioning patterns)
        opener_words = opener.split()[:8]
        if len(opener_words) >= 6:  # only compare if enough words
            prefix_key = " ".join(opener_words)
            if prefix_key in seen_opener_prefixes:
                indices_to_regen.add(idx)
            else:
                seen_opener_prefixes[prefix_key] = idx

    return sorted(indices_to_regen)
