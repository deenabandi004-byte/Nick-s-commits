"""
Per-user answer library for auto-apply.

When the form-filler encounters a custom screening question the Application
Profile doesn't cover ("years of Python experience", "willing to relocate to
Austin", "what's your visa expiration date"), and the user resolves it from
the Needs Attention queue, we save the answer here. The next job that asks
the same question (or a paraphrase mapped to the same canonical slot) gets
auto-filled without ever hitting Needs Attention.

Storage
-------
Firestore subcollection: users/{uid}/applicationAnswerLibrary/{question_id}

Match priority (highest first)
------------------------------
1. Exact normalized question text + field_type match
2. Canonical slot match via screening_answers.map_label_to_field

If a saved answer used select_options and the next job's options differ, we
treat it as a miss (options-mismatch guard).

Hard rules
----------
- Sensitive paths (race / gender / ethnicity / sexual orientation / veteran /
  disability / work authorization) NEVER go in the library. Those live in the
  Application Profile, which is the only authority for them. `save_answer`
  rejects writes that map to a profile sensitive slot.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.extensions import get_db
from app.services.auto_apply.screening_answers import map_label_to_field


logger = logging.getLogger(__name__)


COLLECTION = "applicationAnswerLibrary"

# Canonical-slot paths that must NEVER be set via the library — the
# Application Profile is the only source of truth for these.
_PROFILE_SENSITIVE_PATHS = {
    "demographics.gender",
    "demographics.race",
    "demographics.ethnicity",
    "demographics.lgbtq",
    "veteranStatus",
    "disabilityStatus",
    "workAuthorization.authorizedToWorkUS",
    "workAuthorization.requiresSponsorship",
    "workAuthorization.visaStatus",
}


def normalize_question(text: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace.

    Two questions with the same normalized form are treated as the same
    question for exact-match lookup."""
    if not text:
        return ""
    lower = text.lower()
    no_punct = re.sub(r"[^\w\s]", " ", lower)
    return re.sub(r"\s+", " ", no_punct).strip()


def question_id_for(text: str, field_type: str) -> str:
    """Stable doc id derived from the normalized question + field_type.

    field_type is suffixed so that "are you authorized" as a text input vs a
    radio gets separate slots — the answer shape differs."""
    normalized = normalize_question(text)
    slug = re.sub(r"[^a-z0-9]+", "_", normalized)[:120].strip("_") or "question"
    return f"{slug}__{field_type}"


def lookup_answer(
    uid: str,
    question_text: str,
    field_type: str,
    options: Optional[List[str]] = None,
) -> Optional[Any]:
    """Return the saved answer for this question, or None if no match.

    Match order:
      1. Exact (normalized + field_type) hit on `question_id`
      2. Canonical-slot scan: if the label keyword-matches a known slot,
         find any library entry with the same canonical_slot

    options-mismatch guard: if the saved entry stored select_options and the
    incoming options differ, we treat it as a miss — the answer string may
    not appear in the new dropdown."""
    if not uid or not question_text:
        return None

    db = get_db()
    base = db.collection("users").document(uid).collection(COLLECTION)

    # 1. Exact match by normalized text + field_type
    qid = question_id_for(question_text, field_type)
    snap = base.document(qid).get()
    if snap.exists:
        data = snap.to_dict() or {}
        if _options_compatible(data.get("select_options"), options):
            _stamp_used(base.document(qid), data.get("usage_count", 0))
            return data.get("answer")

    # 2. Canonical-slot match
    slot = map_label_to_field(question_text)
    if slot and slot not in _PROFILE_SENSITIVE_PATHS:
        # Find any entry tagged with the same slot.
        query = base.where("canonical_slot", "==", slot).limit(1).stream()
        for doc in query:
            data = doc.to_dict() or {}
            if _options_compatible(data.get("select_options"), options):
                _stamp_used(doc.reference, data.get("usage_count", 0))
                return data.get("answer")

    return None


def save_answer(
    uid: str,
    question_text: str,
    answer: Any,
    field_type: str,
    options: Optional[List[str]] = None,
    source: str = "user_answered",
) -> Optional[str]:
    """Persist an answer to the library. Returns the doc id, or None if the
    save was rejected (sensitive slot, empty input).

    Sensitive-slot rejection: if `question_text` maps to a profile-owned
    sensitive path, we refuse to write — those values must come from the
    Application Profile only."""
    if not uid or not question_text or answer is None or answer == "":
        return None

    slot = map_label_to_field(question_text)
    if slot in _PROFILE_SENSITIVE_PATHS:
        logger.info(
            "answer_library: refused to save sensitive slot %r for uid=%s",
            slot, uid,
        )
        return None

    qid = question_id_for(question_text, field_type)
    db = get_db()
    ref = db.collection("users").document(uid).collection(COLLECTION).document(qid)

    now = datetime.utcnow().isoformat()
    payload: Dict[str, Any] = {
        "question_id": qid,
        "normalized_question": normalize_question(question_text),
        "question_text_original": question_text,
        "canonical_slot": slot,
        "answer": answer,
        "field_type": field_type,
        "select_options": list(options) if options else None,
        "source": source,
        "last_used_at": now,
        "updated_at": now,
    }
    # Don't clobber created_at / usage_count on re-save
    existing = ref.get()
    if existing.exists:
        data = existing.to_dict() or {}
        payload["usage_count"] = int(data.get("usage_count") or 0) + 1
        payload["created_at"] = data.get("created_at") or now
    else:
        payload["usage_count"] = 1
        payload["created_at"] = now

    ref.set(payload)
    return qid


def list_for_user(uid: str, limit: int = 200) -> List[Dict[str, Any]]:
    """Return all library entries for a user, newest-first. For an eventual
    'Manage saved answers' surface in account settings."""
    db = get_db()
    docs = (
        db.collection("users").document(uid).collection(COLLECTION)
        .order_by("updated_at", direction="DESCENDING")
        .limit(limit)
        .stream()
    )
    return [d.to_dict() or {} for d in docs]


def delete_answer(uid: str, question_id: str) -> bool:
    if not uid or not question_id:
        return False
    db = get_db()
    ref = db.collection("users").document(uid).collection(COLLECTION).document(question_id)
    if not ref.get().exists:
        return False
    ref.delete()
    return True


# ---------- internal helpers ----------


def _options_compatible(
    saved: Optional[List[str]], incoming: Optional[List[str]]
) -> bool:
    """If both are present, the saved answer's option-set must be a subset of
    the incoming options. (We don't want to fill 'Yes' when the new dropdown
    only offers 'Confirmed' / 'Not yet'.) If either side is missing, we
    assume compatible — free-text questions never have options."""
    if not saved or not incoming:
        return True
    saved_set = {str(s).strip().lower() for s in saved if s}
    incoming_set = {str(s).strip().lower() for s in incoming if s}
    if not saved_set:
        return True
    return saved_set.issubset(incoming_set)


def _stamp_used(ref, current_count: int) -> None:
    try:
        ref.update({
            "last_used_at": datetime.utcnow().isoformat(),
            "usage_count": int(current_count or 0) + 1,
        })
    except Exception:
        # Don't blow up the auto-apply run because telemetry write failed
        logger.debug("answer_library: stamp_used failed", exc_info=True)
