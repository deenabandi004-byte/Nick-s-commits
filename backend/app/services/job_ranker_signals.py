"""
Per-user signals that boost job rankings beyond keyword match.

Phase 2 of the Job Board Elevation Plan (docs/JOB_BOARD_ELEVATION_PLAN.md).
The base scorer in job_board.py:score_job_for_user only knows about the
resume — skills, major, experience. This module adds the signals that make
matching feel personal:

  - dream companies     : explicit top-N targets the student named in onboarding
  - target companies    : softer "interested in" list
  - alumni at company   : the student's saved contacts at the hiring company
  - saved-job affinity  : companies where the student has already saved ≥1 job
  - dismissed jobs      : negative signal — filter, don't just downrank

The signals are loaded in a single Firestore round-trip per user request and
cached for 5 minutes to keep the per-request overhead negligible.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

from cachetools import TTLCache

from app.extensions import get_db
from app.models.users import (
    normalize_company,
    get_structured_career_track,
    get_structured_target_companies,
)

logger = logging.getLogger(__name__)

# 5-minute TTL — long enough to cover a burst of job-feed requests, short
# enough that adding a contact or dismissing a job shows up in the next page.
_SIGNAL_CACHE: TTLCache = TTLCache(maxsize=500, ttl=300)

# Score boost values. These are added to combined_score directly (not to
# matchScore), so the 0-100 match display stays intact while the ranking
# absorbs the boost. Tuned so a dream-company hit reliably outranks a
# strong-keyword-match generic job.
DREAM_COMPANY_BOOST = 25
TARGET_COMPANY_BOOST = 15
ALUMNI_BOOST = 20
SAVED_AFFINITY_BOOST = 10


@dataclass
class UserSignals:
    """Loaded once per user per request. Treat as immutable."""
    uid: str
    career_track: str = ""
    dream_companies: set[str] = field(default_factory=set)   # normalized slugs
    target_companies: set[str] = field(default_factory=set)
    alumni_companies: set[str] = field(default_factory=set)
    # company slug → count of saved contacts at that company. Used by the
    # editorial UI to render "3 alumni you know" rather than a binary badge.
    alumni_counts: dict[str, int] = field(default_factory=dict)
    # Phase 5: company slug → best-contact dict {contact_id, name, title,
    # has_email}. Drives the "Reach out to Sarah" CTA on job rows. "Best"
    # is currently "first found with an email"; falls back to first overall.
    top_contact_per_company: dict[str, dict] = field(default_factory=dict)
    saved_companies: set[str] = field(default_factory=set)
    dismissed_job_ids: set[str] = field(default_factory=set)

    def boost(self, job: dict) -> tuple[int, list[str]]:
        """Return (score_boost, [reason_codes]) for a single job.

        Reason codes are stable strings the frontend uses to render badges:
          'dream_company', 'target_company', 'alumni_at_company',
          'saved_company_affinity'. Dismissed jobs are filtered upstream
          (they shouldn't reach the scorer), so no negative reason here.
        """
        company_slug = normalize_company(job.get("company") or "")
        if not company_slug:
            return 0, []

        boost = 0
        reasons: list[str] = []

        # Dream company wins over target — never double-count.
        if company_slug in self.dream_companies:
            boost += DREAM_COMPANY_BOOST
            reasons.append("dream_company")
        elif company_slug in self.target_companies:
            boost += TARGET_COMPANY_BOOST
            reasons.append("target_company")

        # Alumni stacks with dream/target — knowing someone matters
        # independently of whether the company is on the wish list.
        if company_slug in self.alumni_companies:
            boost += ALUMNI_BOOST
            reasons.append("alumni_at_company")

        # Saved affinity stacks with everything else but is the weakest
        # signal — capped to avoid pile-on when a user has saved many jobs
        # at one company already (diminishing returns).
        if company_slug in self.saved_companies and "dream_company" not in reasons:
            boost += SAVED_AFFINITY_BOOST
            reasons.append("saved_company_affinity")

        return boost, reasons

    def editorial_badges(self, job: dict) -> list[str]:
        """Return prose strings for the editorial 'why this ranked' UI.

        Distinct from boost() which returns stable codes for the badge
        renderer. These strings are appended to the existing match_signals
        bullet list and rendered verbatim, so format matters.
        """
        company = (job.get("company") or "").strip()
        if not company:
            return []
        slug = normalize_company(company)
        bullets: list[str] = []

        if slug in self.dream_companies:
            bullets.append(f"{company} is on your dream companies list")
        elif slug in self.target_companies:
            bullets.append(f"{company} is on your target companies list")

        alumni_n = self.alumni_counts.get(slug, 0)
        if alumni_n > 0:
            noun = "alum" if alumni_n == 1 else "alumni"
            bullets.append(f"You know {alumni_n} {noun} at {company}")

        return bullets


def load_user_signals(uid: str) -> UserSignals:
    """Fetch and cache all per-user ranking signals.

    One Firestore read for the user doc + three subcollection scans. The
    subcollections are typically tiny (savedJobs, contacts, jobPreferences),
    so this is a few hundred milliseconds at most on a cold cache.

    Returns an empty UserSignals on any error — the scorer treats missing
    signals as "no boost" rather than failing the whole request.
    """
    if not uid:
        return UserSignals(uid="")

    cached = _SIGNAL_CACHE.get(uid)
    if cached is not None:
        return cached

    signals = UserSignals(uid=uid)

    db = get_db()
    if not db:
        return signals

    user_ref = db.collection("users").document(uid)

    try:
        user_doc = user_ref.get()
        if user_doc.exists:
            user_data = user_doc.to_dict() or {}
            signals.career_track = get_structured_career_track(user_data)

            # dream + target — get_structured_target_companies already falls
            # back from targetCompanies → goals.dreamCompanies → dreamCompanies.
            # We pull dream separately so we can distinguish boost tiers.
            dream_raw = (
                (user_data.get("goals") or {}).get("dreamCompanies")
                or user_data.get("dreamCompanies")
                or []
            )
            if isinstance(dream_raw, str):
                dream_raw = [c.strip() for c in dream_raw.split(",") if c.strip()]
            signals.dream_companies = {normalize_company(c) for c in dream_raw if c}

            target_raw = user_data.get("targetCompanies") or []
            signals.target_companies = {
                normalize_company(c) for c in target_raw if c
            } - signals.dream_companies  # de-dupe so we never boost twice
    except Exception:
        logger.exception("[Signals] Failed to load user doc for uid=%s", uid)

    # Alumni: contacts where the user has saved someone at a company.
    # We don't filter by role — even a peer at the company is useful
    # context for the badge ("you know 3 people here").
    # Phase 5: also keep the "best" contact per company for the referral
    # CTA. "Best" = first one we see with an email; falls back to first
    # one overall. Good enough for v1 — future iteration can prefer
    # alumni from the same school, recent senders, etc.
    try:
        for contact_doc in user_ref.collection("contacts").stream():
            cdata = contact_doc.to_dict() or {}
            company = cdata.get("company") or cdata.get("Company") or ""
            slug = normalize_company(company)
            if not slug:
                continue
            signals.alumni_companies.add(slug)
            signals.alumni_counts[slug] = signals.alumni_counts.get(slug, 0) + 1

            # Capture contact details if this is the first (or first with
            # a usable email) for this company.
            name = (
                cdata.get("name")
                or cdata.get("Name")
                or f"{(cdata.get('firstName') or cdata.get('FirstName') or '').strip()} "
                   f"{(cdata.get('lastName') or cdata.get('LastName') or '').strip()}".strip()
            )
            if not name:
                continue
            email = cdata.get("email") or cdata.get("Email") or ""
            email_ok = bool(email) and email != "Not available"
            existing = signals.top_contact_per_company.get(slug)
            # Upgrade rules: take the first contact, but replace if we
            # find one with an email and the existing doesn't have one.
            should_set = (
                existing is None
                or (email_ok and not existing.get("has_email"))
            )
            if should_set:
                signals.top_contact_per_company[slug] = {
                    "contact_id": contact_doc.id,
                    "name": name,
                    "title": cdata.get("title") or cdata.get("Title") or "",
                    "has_email": email_ok,
                }
    except Exception:
        logger.exception("[Signals] Failed to load contacts for uid=%s", uid)

    # Saved jobs — companies the user has explicitly bookmarked.
    try:
        for saved_doc in user_ref.collection("savedJobs").stream():
            sdata = saved_doc.to_dict() or {}
            company = sdata.get("company") or ""
            slug = normalize_company(company)
            if slug:
                signals.saved_companies.add(slug)
    except Exception:
        logger.exception("[Signals] Failed to load savedJobs for uid=%s", uid)

    # Dismissed jobs — negative signal. Filtered upstream in the serving
    # layer rather than penalized in the scorer (cheaper + cleaner UX).
    try:
        prefs = (
            user_ref.collection("jobPreferences")
            .where("signal", "==", "negative")
            .stream()
        )
        for pref_doc in prefs:
            pdata = pref_doc.to_dict() or {}
            jid = pdata.get("job_id") or pref_doc.id
            if jid:
                signals.dismissed_job_ids.add(jid)
    except Exception:
        logger.exception("[Signals] Failed to load jobPreferences for uid=%s", uid)

    logger.info(
        "[Signals] uid=%s dream=%d target=%d alumni=%d saved=%d dismissed=%d track=%s",
        uid,
        len(signals.dream_companies),
        len(signals.target_companies),
        len(signals.alumni_companies),
        len(signals.saved_companies),
        len(signals.dismissed_job_ids),
        signals.career_track or "-",
    )

    _SIGNAL_CACHE[uid] = signals
    return signals


def clear_user_signals_cache(uid: Optional[str] = None) -> None:
    """Invalidate the cache. Call after saving a job or adding a contact."""
    if uid is None:
        _SIGNAL_CACHE.clear()
    else:
        _SIGNAL_CACHE.pop(uid, None)
