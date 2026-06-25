"""
draft_outreach MCP tool.

Two surfaces:

  Anonymous callers (no OAuth)
    Wraps reply_generation.batch_generate_emails for a single contact
    using a synthesized user_profile from the request fields (no resume,
    no Firestore lookup). Cached + rate-limited per IP.

  Authenticated callers (OAuth bearer)
    Mirrors the website's Find People draft flow: pulls the user's
    Firestore profile + resume, generates the email with the same
    batch_generate_emails call signature runs.py uses, then creates a
    real Gmail draft in the caller's connected Gmail account via
    create_gmail_draft_for_user — the same helper that powers
    Find People drafts.

The Gmail draft is a side effect, never cached. Subject + body are
cached, bucketed by uid so authed/anon outputs do not collide.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from app.mcp_server.cache import MCPCache
from app.mcp_server.events import MCPEvents
from app.mcp_server.rate_limit import MCPRateLimit
from app.mcp_server.responses import build_paywall
from app.mcp_server.schemas import (
    ContactRef,
    DraftOutreachInput,
    DraftOutreachOutput,
    GmailDraftRef,
)

logger = logging.getLogger(__name__)


TOOL_NAME = "draft_outreach"
CACHE_TTL_SECONDS = 7 * 24 * 3600  # 7 days; drafts can be reused per (contact, user, intent)


# Offerloop credits charged per draft generated for signed-in callers.
# Same rate as find_contacts (5 per contact). MCP find + draft for one
# person costs 10 total credits — find_contacts (5) + draft_outreach (5).
# Anonymous callers pay nothing — rate limits + cache gate them.
CREDITS_PER_DRAFT = 5

# Cached payload only carries the stable LLM output. Per-user side
# effects (gmail_draft, gmail_draft_status) are recomputed on every
# call so the draft_id reflects the current request, not a stale one.
_CACHED_FIELDS = ("subject", "body", "contact_name")


def handle(
    *,
    args: dict,
    ip_hash: str,
    db: Any,
    user_ctx: dict | None = None,
) -> dict:
    started = time.monotonic()
    cache = MCPCache(db)
    limiter = MCPRateLimit(db)
    events = MCPEvents(db)

    try:
        parsed = DraftOutreachInput.model_validate(args)
    except Exception as e:
        events.log(
            tool=TOOL_NAME, ip_hash=ip_hash, args_hash="",
            error=f"input_validation: {e}",
            duration_ms=int((time.monotonic() - started) * 1000),
        )
        return {"error": "invalid input", "details": str(e)}

    uid = (user_ctx or {}).get("uid") or None

    # Bucket cache by identity so an anonymous caller never sees an
    # authed user's resume-personalized draft (or vice versa).
    cache_args = {**parsed.model_dump(), "_uid_bucket": uid or "_anon"}
    args_hash = cache.key(TOOL_NAME, cache_args)

    from app.mcp_server.tier_caps import rate_limit_identity
    rl = limiter.check_and_increment(
        rate_limit_identity(user_ctx, ip_hash), TOOL_NAME, user_ctx=user_ctx,
    )
    if not rl.ok:
        cached_payload = cache.get(TOOL_NAME, cache_args)
        paywall = build_paywall(
            TOOL_NAME, ip_hash,
            hit_cap_type=rl.hit_cap_type or "day",
            retry_after_seconds=rl.retry_after_seconds,
        )
        if cached_payload is not None:
            out = DraftOutreachOutput.model_validate({**cached_payload, "cached": True})
            out.paywall = paywall
            events.log(
                tool=TOOL_NAME, ip_hash=ip_hash, args_hash=args_hash,
                cache_hit=True, paywall_shown=True,
                claim_token=_token_from_url(paywall.claim_url),
                duration_ms=int((time.monotonic() - started) * 1000),
            )
            return out.model_dump()
        out = DraftOutreachOutput(
            subject="",
            body="",
            contact_name=parsed.contact.name,
            cached=False,
            paywall=paywall,
        )
        events.log(
            tool=TOOL_NAME, ip_hash=ip_hash, args_hash=args_hash,
            paywall_shown=True,
            claim_token=_token_from_url(paywall.claim_url),
            duration_ms=int((time.monotonic() - started) * 1000),
        )
        return out.model_dump()

    # For authed callers, load profile + resume bytes ONCE. The same
    # context feeds both LLM generation (needs resume text) and the
    # Gmail draft helper (needs resume bytes for the attachment), so
    # downloading twice would be a wasted round-trip to Cloud Storage.
    authed_ctx: Optional[_AuthedContext] = None
    if uid:
        authed_ctx = _load_authed_context(uid, db)

    cached_payload = cache.get(TOOL_NAME, cache_args)
    if cached_payload is not None:
        out = DraftOutreachOutput.model_validate({**cached_payload, "cached": True})
        if authed_ctx is not None:
            _attach_gmail_draft(out, parsed.contact, user_ctx, authed_ctx, db)
        events.log(
            tool=TOOL_NAME, ip_hash=ip_hash, args_hash=args_hash,
            cache_hit=True,
            duration_ms=int((time.monotonic() - started) * 1000),
            extra=_gmail_event_extras(out) if authed_ctx is not None else None,
        )
        return out.model_dump()

    # Credit pre-check for signed-in callers. One draft costs
    # CREDITS_PER_DRAFT (5). Cache hits above don't deduct — mirrors the
    # find_contacts pattern and the website's pdl_cache 0-credit
    # behavior. Anonymous callers (uid=None) skip the gate and rely on
    # rate limits + cache for abuse control.
    credit_paywall = _credit_pre_check_draft(user_ctx, ip_hash)
    if credit_paywall is not None:
        out = DraftOutreachOutput(
            subject="",
            body="",
            contact_name=parsed.contact.name,
            cached=False,
            paywall=credit_paywall,
        )
        events.log(
            tool=TOOL_NAME, ip_hash=ip_hash, args_hash=args_hash,
            paywall_shown=True,
            claim_token=_token_from_url(credit_paywall.claim_url),
            duration_ms=int((time.monotonic() - started) * 1000),
            error="insufficient_credits",
        )
        return out.model_dump()

    # Cold path. Authenticated callers use their Firestore profile +
    # resume (same shape as the website); anonymous callers fall back
    # to the request fields. Both invoke batch_generate_emails.
    try:
        if authed_ctx is not None:
            result = _generate_authenticated(parsed, uid, authed_ctx)
        else:
            result = _generate_anonymous(parsed)
    except Exception as e:
        logger.warning("[MCP draft_outreach] generation failed: %s", e, exc_info=True)
        events.log(
            tool=TOOL_NAME, ip_hash=ip_hash, args_hash=args_hash,
            error=f"generation: {e}",
            duration_ms=int((time.monotonic() - started) * 1000),
        )
        return {
            "subject": "",
            "body": "",
            "contact_name": parsed.contact.name,
            "cached": False,
            "error": "draft generation failed",
        }

    out = DraftOutreachOutput(
        subject=result.get("subject", ""),
        body=result.get("body", ""),
        contact_name=parsed.contact.name,
        cached=False,
    )

    # Cache the stable LLM output only. Side-effect fields are recomputed
    # per call so cache hits don't return stale Gmail draft IDs. Gate on
    # non-empty body so a failed LLM generation (subject="" body="")
    # doesn't poison the cache for 7 days.
    if out.body and out.subject:
        cache_payload = {k: getattr(out, k) for k in _CACHED_FIELDS}
        cache.set(TOOL_NAME, cache_args, cache_payload, CACHE_TTL_SECONDS)

    # Deduct credits for signed-in callers, but only on a successful
    # generation. Same gate as the cache.set above (body+subject both
    # populated) — a failed LLM call surfaces an empty draft and costs
    # the user nothing. Anonymous callers skip this branch internally.
    if out.body and out.subject:
        _deduct_credits_for_draft(user_ctx)

    if authed_ctx is not None:
        _attach_gmail_draft(out, parsed.contact, user_ctx, authed_ctx, db)

    events.log(
        tool=TOOL_NAME, ip_hash=ip_hash, args_hash=args_hash,
        cache_hit=False,
        result_count=1 if out.body else 0,
        duration_ms=int((time.monotonic() - started) * 1000),
        extra=_gmail_event_extras(out) if authed_ctx is not None else None,
    )
    return out.model_dump()


def _gmail_event_extras(out: DraftOutreachOutput) -> dict:
    return {
        "authed": True,
        "gmail_draft_created": out.gmail_draft is not None,
        "gmail_draft_status": out.gmail_draft_status,
    }


# ── LLM generation ───────────────────────────────────────────────────────────


def _generate_anonymous(parsed: DraftOutreachInput) -> dict:
    """Anonymous path: synthesize a thin user_profile from request fields."""
    from app.services.reply_generation import batch_generate_emails

    contact_dict = _build_contact_dict(parsed.contact)
    user_profile = _build_user_profile_anon(parsed)
    pre_parsed = _build_pre_parsed_anon(parsed)
    template_instructions = _build_template_instructions(parsed.intent)

    drafts = batch_generate_emails(
        contacts=[contact_dict],
        resume_text="",
        user_profile=user_profile,
        career_interests=parsed.user_career_track or "",
        pre_parsed_user_info=pre_parsed,
        template_instructions=template_instructions,
        personal_note=parsed.personal_note or "",
        dream_companies=parsed.user_target_companies or [],
        uid=None,
    )
    return _unwrap_single_draft(drafts)


def _generate_authenticated(
    parsed: DraftOutreachInput, uid: str, ctx: "_AuthedContext",
) -> dict:
    """Authed path: same call signature as runs.py's batch_generate_emails."""
    from app.services.reply_generation import batch_generate_emails

    contact_dict = _build_contact_dict(parsed.contact)
    pre_parsed = ctx.user_data.get("resumeParsed") or _build_pre_parsed_anon(parsed)
    template_instructions = _build_template_instructions(parsed.intent)
    career_interests = (
        ctx.user_data.get("careerInterests")
        or parsed.user_career_track
        or ctx.user_profile.get("careerTrack")
        or ""
    )
    dream_companies = (
        parsed.user_target_companies
        or ctx.user_data.get("dreamCompanies")
        or []
    )

    drafts = batch_generate_emails(
        contacts=[contact_dict],
        resume_text=ctx.resume_text or "",
        user_profile=ctx.user_profile,
        career_interests=career_interests,
        pre_parsed_user_info=pre_parsed,
        template_instructions=template_instructions,
        personal_note=parsed.personal_note or "",
        dream_companies=dream_companies,
        uid=uid,
    )
    return _unwrap_single_draft(drafts)


def _unwrap_single_draft(drafts: dict | None) -> dict:
    if not drafts:
        return {"subject": "", "body": ""}
    d = drafts.get(0) or drafts.get("0")
    if not d:
        return {"subject": "", "body": ""}
    return {
        "subject": d.get("subject", ""),
        "body": d.get("plain_body") or d.get("body", ""),
    }


# ── Gmail draft side effect ──────────────────────────────────────────────────


def _attach_gmail_draft(
    out: DraftOutreachOutput,
    contact: ContactRef,
    user_ctx: dict,
    ctx: "_AuthedContext",
    db: Any,
) -> None:
    """Mutate `out` to set gmail_draft + gmail_draft_status.

    Best effort: any failure leaves subject/body intact and surfaces a
    status string the client can render as a 'connect Gmail' nudge.

    On success, also persist the contact to My Network and attach the
    Gmail draft fields so the website's Tracker / Inbox pages show the
    conversation under the user's account.
    """
    scope = (user_ctx or {}).get("scope") or ""
    if "mcp:write" not in scope.split():
        out.gmail_draft_status = "scope_missing"
        return

    if not (contact.email or "").strip() or "@" not in (contact.email or ""):
        out.gmail_draft_status = "no_recipient_email"
        return

    if not ctx.has_gmail_integration:
        out.gmail_draft_status = "gmail_not_connected"
        return

    tier = (user_ctx or {}).get("tier") or "free"
    try:
        draft = _create_gmail_draft(
            tier=tier,
            contact=contact,
            subject=out.subject,
            body=out.body,
            ctx=ctx,
        )
    except Exception as e:
        logger.warning("[MCP draft_outreach] Gmail draft create raised: %s", e, exc_info=True)
        out.gmail_draft_status = "create_failed"
        return

    if draft is None:
        out.gmail_draft_status = "create_failed"
        return

    out.gmail_draft = draft
    _persist_drafted_contact(out, contact, ctx.uid, db, draft)


def _persist_drafted_contact(
    out: DraftOutreachOutput,
    contact: ContactRef,
    uid: str,
    db: Any,
    draft: GmailDraftRef,
) -> None:
    """Write the contact into My Network and attach Gmail draft fields so
    the website's Tracker / Inbox UIs pick it up under the user's account.
    Best-effort — persistence failures don't break the tool's response."""
    if not uid or db is None:
        return
    try:
        from app.mcp_server.persist import (
            attach_gmail_draft_to_contact,
            persist_contacts,
        )
        first, last = _split_name(contact.name)
        contact_dict = {
            "FirstName": first,
            "LastName": last,
            "Title": contact.title or "",
            "Company": contact.company or "",
            "LinkedIn": contact.linkedin_url or "",
            "College": contact.education or "",
            "Email": draft.recipient_email or contact.email or "",
        }
        written = persist_contacts(
            uid=uid, db=db, contacts=[contact_dict], source="mcp",
        )
        doc_id = (
            written.get((draft.recipient_email or "").lower())
            or written.get((contact.email or "").lower())
            or written.get((contact.linkedin_url or "").strip())
        )
        if doc_id:
            attach_gmail_draft_to_contact(
                uid=uid, db=db,
                contact_doc_id=doc_id,
                draft_id=draft.draft_id,
                draft_url=draft.draft_url,
                thread_id=None,  # Gmail returns draft_id; thread_id lands via webhook
                recipient_email=draft.recipient_email,
                subject=out.subject,
                body=out.body,
            )
    except Exception as e:
        logger.warning("[MCP draft_outreach] My Network persist failed: %s", e)


def _create_gmail_draft(
    *,
    tier: str,
    contact: ContactRef,
    subject: str,
    body: str,
    ctx: "_AuthedContext",
) -> Optional[GmailDraftRef]:
    """Call into the same helper the website uses for Find People drafts."""
    from app.services.gmail_client import create_gmail_draft_for_user

    contact_dict = _build_recipient_dict(contact)
    result = create_gmail_draft_for_user(
        contact_dict,
        email_subject=subject,
        email_body=body,
        tier=tier,
        user_email=ctx.user_email,
        resume_url=ctx.resume_url,
        resume_content=ctx.resume_content,
        resume_filename=ctx.resume_filename,
        user_info=ctx.user_info,
        user_id=ctx.uid,
    )

    if not isinstance(result, dict):
        return None
    draft_id = result.get("draft_id") or ""
    if not draft_id or str(draft_id).startswith(("mock_", "suppressed_", "low_confidence_")):
        return None
    return GmailDraftRef(
        draft_id=draft_id,
        draft_url=result.get("draft_url") or "",
        recipient_email=result.get("recipient_email") or contact.email or "",
    )


def _build_recipient_dict(c: ContactRef) -> dict:
    """Shape the contact for create_gmail_draft_for_user.

    The website passes contacts from PDL which have WorkEmail/Email/PersonalEmail
    slots. MCP gets a single email per contact; route it through WorkEmail since
    that's the highest-priority slot in _select_recipient_email and it bypasses
    the @domain.com placeholder check applied to Email.
    """
    first, last = _split_name(c.name)
    return {
        "FirstName": first,
        "LastName": last,
        "Title": c.title or "",
        "Company": c.company or "",
        "LinkedIn": c.linkedin_url or "",
        "College": c.education or "",
        "WorkEmail": c.email or "",
        "Email": "",
        "PersonalEmail": "",
        "experience": [],
    }


# ── Authenticated-call context (loaded once, used by both LLM + Gmail) ──────


@dataclass
class _AuthedContext:
    """Everything we need from Firestore + Cloud Storage for one authed call.

    Loaded once at the top of handle() so the LLM-generation path and the
    Gmail-draft side-effect path share user_profile/user_info and never
    re-download the resume.
    """
    uid: str
    user_data: dict = field(default_factory=dict)
    user_email: str = ""
    user_profile: dict = field(default_factory=dict)
    user_info: dict = field(default_factory=dict)
    resume_url: Optional[str] = None
    resume_filename: Optional[str] = None
    resume_content: Optional[bytes] = None
    resume_text: Optional[str] = None
    has_gmail_integration: bool = False


def _load_authed_context(uid: str, db: Any) -> _AuthedContext:
    ctx = _AuthedContext(uid=uid)
    if db is None:
        return ctx

    ctx.user_data = _read_doc(db, "users", uid) or {}
    ctx.user_email = _outreach_email(ctx.user_data)

    prof_info = _read_subdoc(db, "users", uid, "professionalInfo", "info") or {}
    ctx.user_profile = _build_user_profile(ctx.user_data, prof_info, ctx.user_email)
    ctx.user_info = _build_user_info(ctx.user_data, prof_info, ctx.user_email)

    gmail_int = _read_subdoc(db, "users", uid, "integrations", "gmail") or {}
    # Must have at minimum a refresh_token to mint new access tokens.
    ctx.has_gmail_integration = bool(
        gmail_int.get("refresh_token") or gmail_int.get("token")
    )

    ctx.resume_url = ctx.user_data.get("resumeUrl") or ctx.user_data.get("resumeURL")
    ctx.resume_filename = ctx.user_data.get("resumeFileName")
    if ctx.resume_url:
        ctx.resume_content, ctx.resume_text, fetched = _download_resume(ctx.resume_url)
        if ctx.resume_content and not ctx.resume_filename:
            ctx.resume_filename = fetched

    return ctx


def _read_doc(db: Any, coll: str, doc_id: str) -> Optional[dict]:
    try:
        snap = db.collection(coll).document(doc_id).get()
    except Exception as e:
        logger.warning("[MCP draft_outreach] %s/%s read failed: %s", coll, doc_id, e)
        return None
    if not snap.exists:
        return None
    return snap.to_dict() or {}


def _read_subdoc(db: Any, coll: str, doc_id: str, sub_coll: str, sub_id: str) -> Optional[dict]:
    try:
        snap = (
            db.collection(coll).document(doc_id)
            .collection(sub_coll).document(sub_id).get()
        )
    except Exception as e:
        logger.warning(
            "[MCP draft_outreach] %s/%s/%s/%s read failed: %s",
            coll, doc_id, sub_coll, sub_id, e,
        )
        return None
    if not snap.exists:
        return None
    return snap.to_dict() or {}


def _outreach_email(user_data: dict) -> str:
    """Inline copy of utils.users.get_outreach_email — prefer verified .edu."""
    if not user_data:
        return ""
    edu = (user_data.get("eduEmail") or "").strip()
    if "@" in edu and edu.lower().endswith(".edu"):
        return edu
    return (user_data.get("email") or "").strip()


def _build_user_profile(user_data: dict, prof_info: dict, user_email: str) -> dict:
    """Mirror of runs.py's user_profile assembly (root doc + professionalInfo)."""
    user_profile = user_data.get("userProfile")
    if not user_profile and prof_info:
        user_profile = {
            "name": f"{prof_info.get('firstName', '')} {prof_info.get('lastName', '')}".strip()
            or user_email or "",
            "email": user_email,
            "university": prof_info.get("university", ""),
            "major": prof_info.get("fieldOfStudy", ""),
            "year": prof_info.get("graduationYear", ""),
            "graduationYear": prof_info.get("graduationYear", ""),
            "degree": prof_info.get("currentDegree", ""),
        }
    if not user_profile:
        user_profile = {"name": "", "email": user_email or ""}

    for key in (
        "resumeParsed", "academics", "goals", "careerTrack",
        "dreamCompanies", "hometown", "location", "pastCompanies",
    ):
        if key in user_data and key not in user_profile:
            user_profile[key] = user_data[key]

    if user_email and not user_profile.get("email"):
        user_profile["email"] = user_email
    return user_profile


def _build_user_info(user_data: dict, prof_info: dict, user_email: str) -> dict:
    """Signature block consumed by _build_outreach_mime in gmail_client."""
    name = f"{prof_info.get('firstName', '')} {prof_info.get('lastName', '')}".strip()
    if not name:
        name = (user_data.get("displayName") or user_data.get("name") or "").strip()
    return {
        "name": name,
        "email": user_email or "",
        "phone": "",
        "linkedin": "",
    }


def _download_resume(resume_url: str) -> tuple[Optional[bytes], Optional[str], Optional[str]]:
    """Download resume bytes, extract text, return (content, text, fetched_name).

    One Cloud Storage GET per authed call. Text extraction is best-effort:
    a too-short extract returns None for text but still keeps the bytes so
    the Gmail attachment still works.
    """
    try:
        from app.services.gmail_client import download_resume_from_url
        content, fetched_name = download_resume_from_url(resume_url)
    except Exception as e:
        logger.warning("[MCP draft_outreach] resume download failed: %s", e)
        return None, None, None

    if not content:
        return None, None, fetched_name

    text: Optional[str] = None
    try:
        from app.services.resume_parser import extract_text_from_pdf_bytes
        extracted = extract_text_from_pdf_bytes(content) or ""
        if len(extracted.strip()) > 50:
            text = extracted
    except Exception as e:
        logger.warning("[MCP draft_outreach] resume text extract failed: %s", e)

    return content, text, fetched_name


# ── Anonymous helpers (legacy shape) ─────────────────────────────────────────


def _build_contact_dict(c: ContactRef) -> dict:
    first, last = _split_name(c.name)
    return {
        "FirstName": first,
        "LastName": last,
        "Title": c.title or "",
        "Company": c.company or "",
        "LinkedIn": c.linkedin_url or "",
        "College": c.education or "",
        "experience": [],
    }


def _split_name(full: str) -> tuple[str, str]:
    parts = (full or "").strip().split()
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def _build_user_profile_anon(parsed: DraftOutreachInput) -> dict:
    school = parsed.user_school or ""
    return {
        "name": "",
        "academics": {
            "university": school,
            "major": parsed.user_major or "",
            "graduationYear": parsed.user_year or "",
        },
        "professionalInfo": {
            "university": school,
            "careerTrack": parsed.user_career_track or "",
        },
        "goals": {
            "careerTrack": parsed.user_career_track or "",
            "dreamCompanies": parsed.user_target_companies or [],
        },
    }


def _build_pre_parsed_anon(parsed: DraftOutreachInput) -> dict:
    school = parsed.user_school or ""
    return {
        "university": school,
        "major": parsed.user_major or "",
        "year": parsed.user_year or "",
        "education": {
            "university": school,
            "major": parsed.user_major or "",
            "graduation": parsed.user_year or "",
        },
        "experience": [],
        "skills": {},
        "rawText": "",
    }


_INTENT_INSTRUCTIONS = {
    "coffee_chat": (
        "End the email with an explicit ask for a 15-minute coffee chat or "
        "virtual call to learn about their career path."
    ),
    "informational_interview": (
        "End the email with an explicit ask for a 20-minute informational "
        "interview, framed as wanting to learn how they got into the role."
    ),
    "referral_ask": (
        "End the email with a clear ask for a referral or introduction to "
        "someone on their team who is hiring. Be direct, not coy."
    ),
}


def _build_template_instructions(intent: str) -> str:
    return _INTENT_INSTRUCTIONS.get(intent, _INTENT_INSTRUCTIONS["coffee_chat"])


def _token_from_url(url: str) -> Optional[str]:
    if not url or "token=" not in url:
        return None
    return url.split("token=", 1)[1].split("&", 1)[0]


# ── Credit gating + deduction (signed-in callers only) ─────────────────────


def _signed_in_uid(user_ctx) -> Optional[str]:
    """Return the Firestore uid for signed-in callers, else None.

    user_ctx['uid'] comes from the OAuth access token's `sub` claim
    (flask_mount.py:143). Anonymous bearer tokens carry sub=None — those
    skip credit logic and rely on rate limits + cache for abuse control.
    """
    uid = (user_ctx or {}).get("uid") if user_ctx else None
    return uid if uid else None


def _credit_pre_check_draft(user_ctx, ip_hash: str):
    """Return a paywall CTA if the signed-in caller can't afford one
    draft at CREDITS_PER_DRAFT; None otherwise.

    Defensive Firestore-unreachable / no-user-doc paths return None (no
    gate) so a transient infra issue can't lock signed-in users out —
    the deduction step is the fallback. Same fail-open philosophy as
    find_contacts._credit_pre_check.
    """
    uid = _signed_in_uid(user_ctx)
    if not uid:
        return None

    cost = CREDITS_PER_DRAFT
    try:
        from app.extensions import get_db
        from app.services.auth import check_and_reset_credits
        db = get_db()
        if db is None:
            return None
        user_ref = db.collection("users").document(uid)
        snap = user_ref.get()
        if not snap.exists:
            return None
        credits_available = check_and_reset_credits(user_ref, snap.to_dict() or {})
        if credits_available >= cost:
            return None
    except Exception as e:
        logger.warning("[MCP draft_outreach] credit pre-check error: %s", e)
        return None

    return build_paywall(
        TOOL_NAME, ip_hash,
        hit_cap_type="credits",
        retry_after_seconds=0,
        message=(
            f"Not enough Offerloop credits to draft this email "
            f"(need {cost}). Top up at offerloop.ai or wait for your "
            "monthly reset."
        ),
    )


def _deduct_credits_for_draft(user_ctx) -> None:
    """Charge CREDITS_PER_DRAFT to a signed-in caller. No-op for
    anonymous. Logs but never raises on failure — same fail-soft pattern
    as the website's prompt_search route (routes/runs.py:824-833) and
    find_contacts._deduct_credits_for_search.
    """
    uid = _signed_in_uid(user_ctx)
    if not uid:
        return
    try:
        from app.services.auth import deduct_credits_atomic
        success, remaining = deduct_credits_atomic(
            uid, CREDITS_PER_DRAFT, "mcp_draft_outreach",
        )
        if not success:
            logger.warning(
                "[MCP draft_outreach] credit deduction underpaid for "
                "uid=%s: had %d, needed %d (draft surfaced anyway)",
                uid, remaining, CREDITS_PER_DRAFT,
            )
    except Exception as e:
        logger.warning(
            "[MCP draft_outreach] credit deduction error for uid=%s: %s",
            uid, e,
        )
