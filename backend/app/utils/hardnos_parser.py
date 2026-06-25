"""Parse user's free-text `hardNos` field into a list of suppression concepts
and apply soft composite-score penalties to matching jobs.

Per PURPOSEFUL_LEAKAGE_BRIEF.md:
  - hardNos is a SOFT signal, NOT a hard gate. We never drop matching jobs;
    we reduce their composite score so excellent-otherwise matches survive
    and dim-matches sink.
  - Parsing uses gpt-4o-mini (cheap, fast) cached per (uid, text-hash) so we
    only pay once per hardNos edit per user.

Cache shape (Firestore at users/{uid}/hardnos_cache/{hash}):
  {
    "text_hash": str,           # sha256 of the input text
    "raw_text":  str,           # for audit; truncated to 1000 chars
    "concepts":  [str],         # parsed suppression concepts (1-10 short phrases)
    "model":     "gpt-4o-mini",
    "parsed_at": timestamp,
  }

Penalty: each job that contains any concept in its title, company, or first
500 chars of description gets a composite-score reduction of HARDNOS_PENALTY
(default 30, on the 0-100 scale; same as "subtract 0.3" in normalized units).
Clamped to [0, 100]. We never drop the job.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


HARDNOS_PENALTY = 30  # subtracted from composite (0-100 scale) per matching job
HARDNOS_MAX_CONCEPTS = 10  # cap so a paragraph-long hardNos can't over-penalize
HARDNOS_MAX_INPUT_CHARS = 2000  # cap LLM input cost
HARDNOS_DESC_SCAN_CHARS = 500  # how much job description to scan per match


# ---------------------------------------------------------------------------
# Cache lookup
# ---------------------------------------------------------------------------

def _hash_text(text: str) -> str:
    return hashlib.sha256(text.strip().lower().encode("utf-8")).hexdigest()[:32]


def _read_cache(db, uid: str, text_hash: str) -> Optional[dict]:
    if db is None or not uid:
        return None
    try:
        doc = (
            db.collection("users").document(uid)
              .collection("hardnos_cache").document(text_hash).get()
        )
    except Exception as e:
        logger.warning("hardnos cache read failed for %s: %s", uid, e)
        return None
    if not doc.exists:
        return None
    return doc.to_dict() or None


def _write_cache(db, uid: str, text_hash: str, raw_text: str, concepts: list) -> None:
    if db is None or not uid:
        return
    try:
        (
            db.collection("users").document(uid)
              .collection("hardnos_cache").document(text_hash).set({
                "text_hash": text_hash,
                "raw_text":  raw_text[:1000],
                "concepts":  concepts,
                "model":     "gpt-4o-mini",
                "parsed_at": datetime.now(timezone.utc),
            })
        )
    except Exception as e:
        logger.warning("hardnos cache write failed for %s: %s", uid, e)


# ---------------------------------------------------------------------------
# LLM extraction
# ---------------------------------------------------------------------------

_EXTRACTION_PROMPT = """The user is searching for jobs and listed things they want to AVOID.
Extract 1 to 10 short suppression concepts as a JSON array of strings.

Rules:
- Each concept is a short noun phrase (1-5 words). Lowercase. No punctuation.
- Cover only what the user said. Do not invent.
- If the user said something compound ("sales-heavy roles at agencies"), split it: ["sales-heavy roles", "agencies"].
- If the input is empty, vague, or unparseable, return [].
- Return ONLY the JSON array. No prose, no markdown, no commentary.

User's avoid list:
"""


def _call_llm(text: str) -> Optional[list]:
    """Run the small LLM to extract concepts. Returns None on any failure."""
    try:
        from backend.app.services.openai_client import client
        from openai import RateLimitError
    except Exception as e:
        logger.warning("openai client unavailable for hardnos: %s", e)
        return None

    prompt = _EXTRACTION_PROMPT + text[:HARDNOS_MAX_INPUT_CHARS]

    def _do():
        return client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=400,
            temperature=0.1,
        )

    try:
        try:
            response = _do()
        except RateLimitError:
            logger.warning("hardnos extraction hit 429; not retrying (will use cached or empty)")
            return None
        raw = response.choices[0].message.content or ""
        raw = re.sub(r"```(?:json)?", "", raw).strip().rstrip("`").strip()
        parsed = json.loads(raw)
        if not isinstance(parsed, list):
            return None
        concepts = []
        for c in parsed:
            if isinstance(c, str):
                s = c.strip().lower()
                if 1 <= len(s) <= 60:
                    concepts.append(s)
        return concepts[:HARDNOS_MAX_CONCEPTS]
    except Exception as e:
        logger.warning("hardnos LLM call failed: %s", e)
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_hardnos_concepts(profile: dict, db, uid: str) -> list:
    """Return the list of suppression concepts for this user.

    Cached by (uid, text_hash). Returns [] for missing/empty hardNos, missing
    DB, or LLM failures. Always returns a list (never None) so the penalty
    loop can iterate safely.

    No population gate: if the user typed in a hardNos preference, they
    expect it to take effect. The product framing is that hardNos is an
    explicit rejection signal ("no IB", "no agencies") that should hold
    real weight. Periodic spot-checks via
    backend/scripts/hardnos_verification.py remain the right discipline
    for catching over-broad extractions across the user base.
    """
    text = profile.get("hardNos")
    if not isinstance(text, str) or not text.strip():
        return []

    text_hash = _hash_text(text)
    cached = _read_cache(db, uid, text_hash)
    if cached and isinstance(cached.get("concepts"), list):
        return [c for c in cached["concepts"] if isinstance(c, str)][:HARDNOS_MAX_CONCEPTS]

    concepts = _call_llm(text) or []
    if concepts:
        _write_cache(db, uid, text_hash, text, concepts)
    return concepts


def _job_search_blob(job: dict) -> str:
    """Concatenate title + company + first N chars of description, lowercase.

    Lowercase once so we don't repeat case-fold work per concept per job.
    """
    title = job.get("title") or ""
    company = job.get("company") or ""
    desc = job.get("description") or ""
    if not isinstance(desc, str):
        desc = str(desc)
    blob = f"{title} {company} {desc[:HARDNOS_DESC_SCAN_CHARS]}".lower()
    return blob


def apply_hardnos_penalty(jobs: list, concepts: list) -> tuple:
    """Apply HARDNOS_PENALTY to each job's match_score that matches any concept.

    Returns (jobs_after_penalty_and_sort, penalty_count). Never drops a job.
    Idempotent on repeat calls: re-applying the penalty does NOT stack
    because the input job dicts are mutated in place. Callers expecting
    multiple passes should re-fetch fresh scores.
    """
    if not concepts:
        return jobs, 0

    # Word-boundary matches per concept. Compiled once.
    patterns = []
    for c in concepts:
        if not isinstance(c, str) or not c.strip():
            continue
        # Escape special chars; treat the concept as a phrase. Word-boundary
        # at both ends so "ads" doesn't match "address".
        patterns.append(re.compile(rf"\b{re.escape(c.strip().lower())}\b"))

    if not patterns:
        return jobs, 0

    penalized = 0
    for job in jobs:
        score = job.get("match_score")
        if not isinstance(score, (int, float)):
            continue
        blob = _job_search_blob(job)
        if any(p.search(blob) for p in patterns):
            new_score = max(0, min(100, int(score) - HARDNOS_PENALTY))
            job["match_score"] = new_score
            penalized += 1

    if penalized:
        jobs = sorted(jobs, key=lambda j: j.get("match_score") or 0, reverse=True)

    return jobs, penalized
