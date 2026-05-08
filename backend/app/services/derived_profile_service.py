"""
Derived profile service — Phase 1 placeholder + Phase 4 real synthesis.

A `DerivedProfile` is the rolled-up understanding of a user's voice,
interests, and behavior, synthesized from raw events. Phase 4 replaces
the Phase 1 stub with a real LLM-driven synthesis using gpt-4o-mini.

Cost model (per §6.1 of the eng review):
   ~3,000 input tokens + ~500 output tokens × ~3,000 syntheses/week
   = ~$10/month at 300 active users on gpt-4o-mini
   30× headroom to gpt-4o if quality is insufficient.

Synthesis trigger logic lives in `backend/scripts/derived_profile_cron.py`
and reads from this module's `synthesize(uid)`. The function is
idempotent and safe to call on a user with no events (it writes a
placeholder profile and returns).

Failure isolation (§12 critical gap): synthesize raises on hard failures
so the cron's per-user try/except can capture to Sentry without affecting
other users. Soft failures (no events, no openai client) return the
existing or placeholder profile.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.extensions import get_db

logger = logging.getLogger('derived_profile_service')

# Window of events used as input to synthesis. 60 days matches the design
# doc's success-criteria window; events beyond this are skipped (already
# rolled up in the prior derivedProfile).
SYNTHESIS_WINDOW_DAYS = 60

# Minimum events to bother running synthesis; below this we leave the
# placeholder. Empirically, fewer than ~5 events doesn't have enough
# signal to produce a stable voice model.
MIN_EVENTS_FOR_SYNTHESIS = 5

# How many recent events to include verbatim in the prompt. Keeps the
# token bill close to the §6.1 projection.
MAX_EVENTS_IN_PROMPT = 80


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _now_dt() -> datetime:
    return datetime.now(timezone.utc)


def is_enabled() -> bool:
    """Feature gate — `DERIVED_PROFILE_ENABLED` env var defaults OFF."""
    return os.getenv('DERIVED_PROFILE_ENABLED', 'false').lower() == 'true'


# ============================================================================
# Reads
# ============================================================================

def get_derived_profile(uid: str) -> Optional[Dict[str, Any]]:
    """Read users/{uid}/derivedProfile/v1. Returns None if it doesn't exist yet."""
    if not uid:
        return None
    db = get_db()
    doc = (
        db.collection('users')
        .document(uid)
        .collection('derivedProfile')
        .document('v1')
        .get()
    )
    if not doc.exists:
        return None
    return doc.to_dict()


def write_placeholder_derived_profile(uid: str) -> Dict[str, Any]:
    """Lay down an empty derivedProfile/v1 document.

    Phase 1 callers (e.g. backfill, profile-confirm) invoke this so the
    document exists before Phase 4 starts firing event-triggered syntheses.
    All model fields are None — readers must already be tolerant of that.
    """
    if not uid:
        raise ValueError('uid is required')

    payload: Dict[str, Any] = {
        'voiceModel': None,
        'interestModel': None,
        'behaviorStats': None,
        'lastSynthesizedAt': None,
        'synthesizedFromEventCount': 0,
        'sourceEventCutoff': None,
        'placeholder': True,
        'createdAt': _now_iso(),
    }

    db = get_db()
    ref = (
        db.collection('users')
        .document(uid)
        .collection('derivedProfile')
        .document('v1')
    )
    ref.set(payload, merge=True)
    return payload


# ============================================================================
# Phase 4 — real synthesis pipeline
# ============================================================================

def _load_recent_events(uid: str, since: datetime, limit: int) -> List[Dict[str, Any]]:
    """Stream the user's events newer than `since`, up to `limit` returned.

    Filters in-memory rather than via where() because Firestore won't index
    every timestamp field by default. The events collection is bounded by
    the 90-day TTL so the per-user scan stays small.
    """
    db = get_db()
    events: List[Dict[str, Any]] = []
    try:
        snaps = (
            db.collection('users')
            .document(uid)
            .collection('events')
            .stream()
        )
    except Exception as exc:  # pragma: no cover
        logger.warning('synthesize[%s]: events read failed: %s', uid, exc)
        return events

    for snap in snaps:
        data = snap.to_dict() or {}
        ts_raw = data.get('timestamp') or data.get('createdAt')
        ts = _coerce_dt(ts_raw)
        if ts is None or ts < since:
            continue
        # Drop the heavy / PII-adjacent fields before we ship to the LLM.
        events.append({
            'type': data.get('type'),
            'timestamp': ts.isoformat(),
            'payload': _scrub_payload(data.get('payload') or {}),
        })

    events.sort(key=lambda e: e['timestamp'], reverse=True)
    return events[:limit]


def _coerce_dt(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if hasattr(value, 'to_datetime'):
        try:
            return value.to_datetime().replace(tzinfo=timezone.utc)
        except Exception:  # pragma: no cover
            return None
    if isinstance(value, str):
        try:
            v = value.replace('Z', '+00:00')
            parsed = datetime.fromisoformat(v)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def _scrub_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Drop fields that shouldn't leave Firestore (raw text, emails)."""
    if not isinstance(payload, dict):
        return {}
    out = {}
    blocked = {'rawBody', 'rawDiff', 'rawText', 'snippet', 'inboundMessageId',
               'sentMessageId', 'inReplyTo'}
    for k, v in payload.items():
        if k in blocked:
            continue
        if isinstance(v, str) and len(v) > 240:
            v = v[:240] + '…'
        out[k] = v
    return out


def _compute_behavior_stats(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Cheap, deterministic rollups — done in Python, not the LLM."""
    drafts = [e for e in events if e['type'] == 'email_drafted']
    edits = [e for e in events if e['type'] == 'email_edited']
    # De-duplicate sends by trackingId so a single draft that fires both
    # email_sent_clicked (frontend optimistic) AND email_sent_via_gmail
    # (Pub/Sub confirmed) for the same trackingId counts as ONE send.
    # See app/models/events.py: both payloads carry `trackingId`. Events
    # missing the field (rare; older clicks before tracking was wired)
    # get a synthetic per-event key so each still counts as one and
    # doesn't dedupe against unrelated events.
    send_keys: set = set()
    for idx, e in enumerate(events):
        if e['type'] not in ('email_sent_via_gmail', 'email_sent_clicked'):
            continue
        tid = (e.get('payload') or {}).get('trackingId')
        send_keys.add(tid if tid else f'__no_tid:{idx}')
    sends_count = len(send_keys)
    replies = [e for e in events if e['type'] == 'reply_received']

    edit_rate_30d = (len(edits) / len(drafts)) if drafts else 0.0
    reply_rate_30d = (len(replies) / sends_count) if sends_count else 0.0

    edit_distances: List[int] = []
    for e in edits:
        delta = (e.get('payload') or {}).get('delta') or {}
        wc = delta.get('wordsChanged')
        if isinstance(wc, (int, float)):
            edit_distances.append(int(wc))
    avg_edit_distance = (sum(edit_distances) / len(edit_distances)) if edit_distances else 0.0

    return {
        'editRate30d': round(min(1.0, edit_rate_30d), 3),
        'replyRate30d': round(min(1.0, reply_rate_30d), 3),
        'avgEditDistance': round(avg_edit_distance, 2),
    }


def _build_user_profile_summary(uid: str) -> Dict[str, Any]:
    """Pull the structured profile fields that bias synthesis."""
    db = get_db()
    snap = db.collection('users').document(uid).get()
    if not snap.exists:
        return {}
    data = snap.to_dict() or {}
    return {
        'school': data.get('school'),
        'major': data.get('major'),
        'graduationYear': data.get('graduationYear'),
        'currentRole': data.get('currentRole'),
        'currentCompany': data.get('currentCompany'),
        'targetIndustries': data.get('targetIndustries') or [],
        'targetCompanies': data.get('targetCompanies') or [],
        'targetRoleTypes': data.get('targetRoleTypes') or [],
        'tonePreference': data.get('tonePreference'),
        'lengthPreference': data.get('lengthPreference'),
    }


SYSTEM_PROMPT = """You are an analyst building a compact behavioral profile of a college student
who is using a networking tool to find professional contacts and write outreach emails.

Given the student's structured profile and a stream of behavioral events, produce a JSON
object with EXACTLY these top-level keys:

{
  "voiceModel": {
    "avg_length_words": int,            // typical email length the user prefers
    "formality_score": float,           // 0.0 (very casual) – 1.0 (very formal)
    "opener_style": "direct" | "warm" | "contextual" | "question" | "none",
    "closer_style": "direct" | "warm" | "grateful" | "none",
    "signature_pattern": str            // template like "Best,\\n{name}\\n{school_short} | Class of {year}"
  },
  "interestModel": {
    "top_industries": [str, ...],       // ranked, drawn from targetIndustries + behavior
    "top_companies": [str, ...],        // ranked
    "emerging_interests": [str, ...],   // rising in last 30d (events with prompt_answered etc.)
    "pivot_signal": str | null          // "shifted from IB → consulting" or null if no shift
  }
}

Rules:
- If a field cannot be inferred confidently, use a conservative default (formality_score 0.5,
  opener_style "warm", etc.) rather than null.
- Do NOT echo any raw event text or contact emails.
- Output JSON only. No prose, no code fences."""


def _call_llm(profile_summary: Dict[str, Any], events: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Call gpt-4o-mini for synthesis. Returns parsed JSON or None on failure."""
    try:
        from app.services.openai_client import get_openai_client
    except Exception:
        return None
    client = get_openai_client()
    if client is None:
        logger.warning('synthesize: no OpenAI client available')
        return None

    user_prompt = (
        f"STRUCTURED PROFILE:\n{json.dumps(profile_summary, default=str)}\n\n"
        f"EVENTS (most recent first, JSON array of {len(events)} events):\n"
        f"{json.dumps(events, default=str)}"
    )

    model = os.getenv('DERIVED_PROFILE_MODEL', 'gpt-4o-mini')
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {'role': 'system', 'content': SYSTEM_PROMPT},
                {'role': 'user', 'content': user_prompt},
            ],
            temperature=0.2,
            response_format={'type': 'json_object'},
            max_tokens=900,
        )
    except Exception as exc:
        logger.exception('synthesize: LLM call failed: %s', exc)
        return None

    content = resp.choices[0].message.content if resp and resp.choices else None
    if not content:
        return None
    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        logger.warning('synthesize: LLM returned invalid JSON: %s', exc)
        return None


def _validate_synthesis_output(out: Dict[str, Any]) -> Dict[str, Any]:
    """Coerce LLM output to the locked dataclass shape; fill safe defaults
    so a malformed model response doesn't poison the stored profile."""
    voice = out.get('voiceModel') or {}
    interest = out.get('interestModel') or {}

    formality = voice.get('formality_score', 0.5)
    try:
        formality = float(formality)
    except (TypeError, ValueError):
        formality = 0.5
    formality = max(0.0, min(1.0, formality))

    avg_len = voice.get('avg_length_words', 110)
    try:
        avg_len = max(20, min(400, int(avg_len)))
    except (TypeError, ValueError):
        avg_len = 110

    opener_allowed = {'direct', 'warm', 'contextual', 'question', 'none'}
    closer_allowed = {'direct', 'warm', 'grateful', 'none'}
    opener_style = voice.get('opener_style') if voice.get('opener_style') in opener_allowed else 'warm'
    closer_style = voice.get('closer_style') if voice.get('closer_style') in closer_allowed else 'warm'

    sig_pat = voice.get('signature_pattern') or 'Best,\n{name}\n{school_short} | Class of {year}'
    if not isinstance(sig_pat, str):
        sig_pat = 'Best,\n{name}'

    def _list(v) -> List[str]:
        if not isinstance(v, list):
            return []
        return [str(x).strip() for x in v if isinstance(x, (str, int, float)) and str(x).strip()][:10]

    pivot = interest.get('pivot_signal')
    if pivot is not None and not isinstance(pivot, str):
        pivot = None

    return {
        'voiceModel': {
            'avg_length_words': avg_len,
            'formality_score': formality,
            'opener_style': opener_style,
            'closer_style': closer_style,
            'signature_pattern': sig_pat,
        },
        'interestModel': {
            'top_industries': _list(interest.get('top_industries')),
            'top_companies': _list(interest.get('top_companies')),
            'emerging_interests': _list(interest.get('emerging_interests')),
            'pivot_signal': pivot,
        },
    }


def synthesize(uid: str, *, force: bool = False) -> Dict[str, Any]:
    """Synthesize a fresh derivedProfile for a user from their event stream.

    Args:
        uid: Firebase user ID.
        force: If True, run synthesis even when DERIVED_PROFILE_ENABLED is
            off (used by admin scripts / tests).

    Returns:
        The persisted derivedProfile/v1 document data.

    Raises:
        ValueError on missing uid. Other failures (LLM, Firestore) are
        caught and result in a placeholder write — callers detect via the
        `placeholder: True` field.
    """
    if not uid:
        raise ValueError('uid is required')

    if not (is_enabled() or force):
        existing = get_derived_profile(uid)
        if existing:
            return existing
        return write_placeholder_derived_profile(uid)

    # Respect the user-edited flag — don't overwrite a manually tuned voice
    # model with synthesized values.
    existing = get_derived_profile(uid) or {}
    manually_edited_voice = bool(existing.get('voiceModelManuallyEdited'))

    since = _now_dt() - timedelta(days=SYNTHESIS_WINDOW_DAYS)
    events = _load_recent_events(uid, since, MAX_EVENTS_IN_PROMPT)
    behavior = _compute_behavior_stats(events)

    if len(events) < MIN_EVENTS_FOR_SYNTHESIS:
        # Not enough signal — still update behaviorStats so reply rates
        # surface in the dashboard, but leave voice / interest as-is.
        return _persist_profile(
            uid,
            voice_model=existing.get('voiceModel'),
            interest_model=existing.get('interestModel'),
            behavior_stats=behavior,
            event_count=len(events),
            placeholder=existing.get('placeholder', True),
            voice_manually_edited=manually_edited_voice,
        )

    profile_summary = _build_user_profile_summary(uid)
    raw = _call_llm(profile_summary, events)
    if not raw:
        return _persist_profile(
            uid,
            voice_model=existing.get('voiceModel'),
            interest_model=existing.get('interestModel'),
            behavior_stats=behavior,
            event_count=len(events),
            placeholder=existing.get('placeholder', True),
            voice_manually_edited=manually_edited_voice,
        )
    cleaned = _validate_synthesis_output(raw)

    # Stretch D — preserve user-edited voiceModel.
    voice_model = (
        existing.get('voiceModel')
        if manually_edited_voice and existing.get('voiceModel')
        else cleaned['voiceModel']
    )

    return _persist_profile(
        uid,
        voice_model=voice_model,
        interest_model=cleaned['interestModel'],
        behavior_stats=behavior,
        event_count=len(events),
        placeholder=False,
        voice_manually_edited=manually_edited_voice,
    )


def _persist_profile(
    uid: str,
    *,
    voice_model: Optional[Dict[str, Any]],
    interest_model: Optional[Dict[str, Any]],
    behavior_stats: Optional[Dict[str, Any]],
    event_count: int,
    placeholder: bool,
    voice_manually_edited: bool,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        'voiceModel': voice_model,
        'interestModel': interest_model,
        'behaviorStats': behavior_stats,
        'lastSynthesizedAt': _now_iso(),
        'synthesizedFromEventCount': event_count,
        'sourceEventCutoff': (_now_dt() - timedelta(days=SYNTHESIS_WINDOW_DAYS)).isoformat(),
        'placeholder': placeholder,
        'voiceModelManuallyEdited': voice_manually_edited,
    }
    db = get_db()
    ref = (
        db.collection('users')
        .document(uid)
        .collection('derivedProfile')
        .document('v1')
    )
    ref.set(payload, merge=True)
    return payload


def write_user_voice_model(
    uid: str,
    *,
    avg_length_words: int,
    formality_score: float,
    opener_style: str,
    closer_style: str,
    signature_pattern: str,
) -> Dict[str, Any]:
    """Stretch D — user-editable voiceModel writer.

    Sets `voiceModelManuallyEdited: True` so subsequent synthesis runs leave
    the voice fields alone (per §15 #9 design decision).
    """
    if not uid:
        raise ValueError('uid is required')

    voice = _validate_synthesis_output({
        'voiceModel': {
            'avg_length_words': avg_length_words,
            'formality_score': formality_score,
            'opener_style': opener_style,
            'closer_style': closer_style,
            'signature_pattern': signature_pattern,
        },
        'interestModel': {},
    })['voiceModel']

    existing = get_derived_profile(uid) or {}
    return _persist_profile(
        uid,
        voice_model=voice,
        interest_model=existing.get('interestModel'),
        behavior_stats=existing.get('behaviorStats'),
        event_count=int(existing.get('synthesizedFromEventCount') or 0),
        placeholder=existing.get('placeholder', True),
        voice_manually_edited=True,
    )
