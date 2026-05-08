"""
Email generator dispatch  Phase 7 of the Personalization Data Layer.

Routes each email-draft generation request to either the new
`email_generator.generate_email` (when USE_NEW_GENERATOR is on for the
user) or the legacy `reply_generation.batch_generate_emails` (the
kill-switch fallback).

Per section 8 of the eng review, reply_generation.py stays alive until
USE_NEW_GENERATOR has been at 100 percent for 30 days. This module is
the choke point that picks the path per request and stamps each draft
with the generator version that produced it, so the admin edit-rate
dashboard can A/B compare without a vendor (section 10.5).

The new generator is owned by the co-founder (section 4.4) and is still
a stub that raises NotImplementedError. When it raises (NotImplemented
or anything else), dispatch logs the failure, falls back to the legacy
path, and tags the version as 'new_unavailable' so the dashboard does
not silently double-count old-generator drafts as new ones.

The dispatch module must NEVER be the reason an email send fails. The
kill-switch path is a try/except around the new path; the legacy call
runs unconditionally if the new path raises.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.services.feature_flags import USE_NEW_GENERATOR, get_assignment

logger = logging.getLogger('email_generator_dispatch')

# Generator version strings written into event metadata. The admin
# edit-rate dashboard buckets on this field, so do not rename without
# updating `routes/admin.py:edit_rate_dashboard` and the frontend
# `EmailDraftedPayloadSchema` enum.
GENERATOR_VERSION_OLD = 'old'
GENERATOR_VERSION_NEW = 'new'
GENERATOR_VERSION_NEW_UNAVAILABLE = 'new_unavailable'

ALL_GENERATOR_VERSIONS = (
    GENERATOR_VERSION_OLD,
    GENERATOR_VERSION_NEW,
    GENERATOR_VERSION_NEW_UNAVAILABLE,
)


@dataclass
class DispatchResult:
    """Returned alongside the per-draft results dict so the caller in
    routes/emails.py can stamp each draft's tracking row with the
    version that produced it."""

    # Same shape that legacy `batch_generate_emails` returns: a dict
    # keyed by index → per-draft dict (subject/body/personalization).
    results: Dict[Any, Any]
    # 'old' | 'new' | 'new_unavailable'.
    generator_version: str
    # From feature_flags.get_assignment(): 'rollout' | 'override' |
    # 'flag_off' | 'kill_switch' | 'no_uid'.
    assignment_reason: str
    # 0-99 if computed, else None.
    assignment_bucket: Optional[int]
    # Best-effort tally of which contacts came back from which path. The
    # default is empty; only populated when the new path partially
    # succeeds (Phase 7 stub never partially succeeds).
    per_contact_versions: Dict[int, str] = field(default_factory=dict)


def dispatch_email_generation(
    uid: str,
    *,
    contacts: List[Dict[str, Any]],
    resume_text: Optional[str],
    user_profile: Dict[str, Any],
    career_interests: Any,
    fit_context: Any = None,
    pre_parsed_user_info: Optional[Dict[str, Any]] = None,
    template_instructions: str = '',
    email_template_purpose: Any = None,
    resume_filename: Optional[str] = None,
    subject_line: Optional[str] = None,
    signoff_config: Any = None,
    auth_display_name: Optional[str] = None,
    personal_note: str = '',
    dream_companies: Any = None,
    warmth_data: Any = None,
    company_contexts: Optional[Dict[str, Any]] = None,
) -> DispatchResult:
    """Pick old vs new generator for `uid` and run it.

    Both branches return the legacy results shape so callers do not need
    a branch of their own. Per section 12 risk #1 (generator-divergence),
    any failure on the new path falls back to the legacy generator and
    tags the version as 'new_unavailable'.
    """
    assignment = get_assignment(USE_NEW_GENERATOR, uid)
    assignment_reason = assignment.get('reason', 'rollout')
    assignment_bucket = assignment.get('bucket')
    use_new = bool(assignment.get('enabled'))

    if use_new:
        try:
            results = _run_new_generator(
                uid=uid,
                contacts=contacts,
                user_profile=user_profile,
                career_interests=career_interests,
                company_contexts=company_contexts,
            )
            return DispatchResult(
                results=results,
                generator_version=GENERATOR_VERSION_NEW,
                assignment_reason=assignment_reason,
                assignment_bucket=assignment_bucket,
                per_contact_versions={
                    idx: GENERATOR_VERSION_NEW for idx in range(len(contacts))
                },
            )
        except NotImplementedError:
            logger.info(
                'email_generator.generate_email is still stubbed for uid=%s; '
                'falling back to reply_generation', uid
            )
            version = GENERATOR_VERSION_NEW_UNAVAILABLE
        except Exception as exc:  # pragma: no cover  never block send
            logger.exception(
                'new generator threw for uid=%s; falling back: %s', uid, exc
            )
            version = GENERATOR_VERSION_NEW_UNAVAILABLE
    else:
        version = GENERATOR_VERSION_OLD

    results = _run_legacy_generator(
        contacts=contacts,
        resume_text=resume_text,
        user_profile=user_profile,
        career_interests=career_interests,
        fit_context=fit_context,
        pre_parsed_user_info=pre_parsed_user_info,
        template_instructions=template_instructions,
        email_template_purpose=email_template_purpose,
        resume_filename=resume_filename,
        subject_line=subject_line,
        signoff_config=signoff_config,
        auth_display_name=auth_display_name,
        personal_note=personal_note,
        dream_companies=dream_companies,
        warmth_data=warmth_data,
        company_contexts=company_contexts,
    )
    return DispatchResult(
        results=results,
        generator_version=version,
        assignment_reason=assignment_reason,
        assignment_bucket=assignment_bucket,
        per_contact_versions={
            idx: version for idx in range(len(contacts))
        },
    )


def _run_legacy_generator(
    *,
    contacts,
    resume_text,
    user_profile,
    career_interests,
    fit_context,
    pre_parsed_user_info,
    template_instructions,
    email_template_purpose,
    resume_filename,
    subject_line,
    signoff_config,
    auth_display_name,
    personal_note,
    dream_companies,
    warmth_data,
    company_contexts,
):
    """Call into reply_generation.batch_generate_emails verbatim.

    Imported lazily so test harnesses that exercise the dispatch routing
    logic without an OpenAI key do not pay the import cost.
    """
    from app.services.reply_generation import batch_generate_emails
    return batch_generate_emails(
        contacts,
        resume_text,
        user_profile,
        career_interests,
        fit_context=fit_context,
        pre_parsed_user_info=pre_parsed_user_info,
        template_instructions=template_instructions,
        email_template_purpose=email_template_purpose,
        resume_filename=resume_filename,
        signoff_config=signoff_config,
        auth_display_name=auth_display_name,
        personal_note=personal_note,
        dream_companies=dream_companies,
        warmth_data=warmth_data,
        company_contexts=company_contexts,
    )


def _run_new_generator(
    *,
    uid: str,
    contacts: List[Dict[str, Any]],
    user_profile: Dict[str, Any],
    career_interests: Any,
    company_contexts: Optional[Dict[str, Any]],
) -> Dict[int, Dict[str, Any]]:
    """Adapt the locked dataclass interface (section 4.1) into the legacy
    result shape so the caller in routes/emails.py is path-agnostic.

    Phase 7: `email_generator.generate_email` is still a stub that raises
    NotImplementedError on any call. The first contact in the loop will
    raise, dispatch's outer try/except will catch it, the whole batch
    falls back to the legacy generator, and the version is tagged
    'new_unavailable'. When the co-founder lands the real implementation,
    this loop starts producing per-contact GeneratedEmail outputs that
    we map onto the legacy result shape without changing the caller.
    """
    from app.services.email_generator import (
        Contact as GenContact,
        StructuredProfile,
        generate_email,
    )

    sp = _build_structured_profile(uid, user_profile)
    out: Dict[int, Dict[str, Any]] = {}
    for idx, c in enumerate(contacts):
        gen_contact = _build_contact_dataclass(c, sender_school=sp.school)
        company_ctx = _lookup_company_context(c, company_contexts)
        result = generate_email(
            structured_profile=sp,
            derived_profile=None,
            company_context=company_ctx,
            contact=gen_contact,
            job=None,
        )
        # Map the GeneratedEmail dataclass to the legacy per-contact dict
        # shape that routes/emails.py downstream code expects. Keeping
        # the exact key names (subject/body/personalization) means no
        # change in the caller.
        out[idx] = {
            'subject': result.subject,
            'body': result.body,
            'tracking_id': result.tracking_id,
            'template_used': result.template_used,
            'generation_metadata': dict(result.generation_metadata or {}),
            'personalization': {
                'commonality_type': result.template_used,
            },
        }
    return out


def _build_structured_profile(uid: str, user_profile: Dict[str, Any]):
    """Build a frozen StructuredProfile from the user's loaded profile dict.

    `user_profile` here is whatever routes/emails.py already loaded for
    the legacy generator (a Firestore doc dict plus runtime overrides),
    so field names match the camelCase conventions used elsewhere.
    Missing fields collapse to None / [] per the locked dataclass.
    """
    from app.services.email_generator import StructuredProfile

    def _list(v: Any) -> List[str]:
        if isinstance(v, list):
            return [str(x) for x in v if x is not None]
        return []

    return StructuredProfile(
        uid=uid,
        name=str(user_profile.get('name') or user_profile.get('displayName') or ''),
        email=str(user_profile.get('email') or ''),
        phone=user_profile.get('phone'),
        linkedin=user_profile.get('linkedin') or user_profile.get('linkedinUrl'),
        school=user_profile.get('school'),
        school_short=user_profile.get('schoolShort') or user_profile.get('schoolNormalized'),
        major=user_profile.get('major'),
        graduation_year=user_profile.get('graduationYear'),
        graduation_status=user_profile.get('graduationStatus'),
        current_role=user_profile.get('currentRole'),
        current_company=user_profile.get('currentCompany'),
        target_industries=_list(user_profile.get('targetIndustries')),
        target_companies=_list(user_profile.get('targetCompanies')),
        target_role_types=_list(user_profile.get('targetRoleTypes')),
        interest_tags=_list(user_profile.get('interestTags')),
        tone_preference=user_profile.get('tonePreference'),
        length_preference=user_profile.get('lengthPreference'),
    )


def _build_contact_dataclass(c: Dict[str, Any], *, sender_school: Optional[str]):
    """Build a frozen Contact from the legacy contact dict shape."""
    from app.services.email_generator import Contact as GenContact
    from app.utils.company import company_to_slug

    company_raw = c.get('Company') or c.get('company') or ''
    contact_school = c.get('School') or c.get('school')
    school_match = bool(
        sender_school
        and contact_school
        and str(sender_school).strip().lower() == str(contact_school).strip().lower()
    )

    return GenContact(
        contact_id=str(c.get('id') or c.get('contactId') or ''),
        first_name=str(c.get('FirstName') or c.get('firstName') or ''),
        last_name=str(c.get('LastName') or c.get('lastName') or ''),
        company=str(company_raw),
        company_normalized=company_to_slug(company_raw) or '',
        title=str(c.get('Title') or c.get('title') or ''),
        school=contact_school,
        school_match=school_match,
        hometown_match=False,
        company_overlap=None,
        email=c.get('Email') or c.get('email'),
        linkedin=c.get('LinkedIn') or c.get('linkedin'),
    )


def _lookup_company_context(c: Dict[str, Any], company_contexts: Optional[Dict[str, Any]]):
    """Return the saved CompanyContext for this contact's company, or None.

    `company_contexts` is the map keyed by companyId/normalized slug that
    routes/emails.py loaded from `company_contexts_service.list_company_contexts`.
    The lookup uses the same slug helper so a context written under
    'goldman-sachs' matches a contact whose Company is 'Goldman Sachs'.
    """
    if not company_contexts:
        return None
    from app.services.email_generator import CompanyContext
    from app.utils.company import company_to_slug

    slug = company_to_slug(c.get('Company') or c.get('company') or '')
    if not slug:
        return None
    raw = company_contexts.get(slug) or company_contexts.get(c.get('companyId'))
    if not raw:
        return None
    related = raw.get('relatedRoleTypes')
    if not isinstance(related, list):
        related = []
    return CompanyContext(
        company_id=str(raw.get('companyId') or raw.get('_id') or slug),
        company_name=str(raw.get('companyName') or c.get('Company') or ''),
        reason=str(raw.get('reason') or ''),
        source=raw.get('source') or 'inferred_from_resume',
        related_role_types=[str(x) for x in related if x is not None],
        last_used_at=None,
    )
