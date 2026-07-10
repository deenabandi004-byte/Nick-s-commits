"""
Pydantic input + output schemas for the three MCP tools.

Tier-cap fields (most importantly find_contacts.count) are intentionally
permissive at the schema level. Handlers clamp to the current tier cap.
This lets us raise the anonymous-tier cap in v2 (OAuth) by editing
handler logic only, no schema migration.
"""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field, model_validator


# ── find_contacts ────────────────────────────────────────────────────────────


class FindContactsInput(BaseModel):
    company: str = Field(
        "",
        description=(
            "Target company name. Optional: leave empty for industry-wide "
            "searches (e.g. 'investment banking analysts in Los Angeles'), "
            "but then role or school must be provided."
        ),
    )
    location: Optional[str] = Field(
        None,
        description=(
            "City or metro area filter, e.g. 'Los Angeles', 'New York'. "
            "Especially useful for company-less searches."
        ),
    )
    school: Optional[str] = Field(
        None,
        description=(
            "Your school. When provided, alumni at that school rank "
            "higher and surface an alumni connection hook."
        ),
    )
    role: Optional[str] = Field(
        None,
        description="Target role or function, e.g. 'software engineer', 'M&A'.",
    )
    career_track: Optional[str] = Field(
        None,
        description=(
            "Broader career track, e.g. 'investment banking', 'tech'. Used as a "
            "fallback when role is too narrow."
        ),
    )
    count: int = Field(
        default=5,
        ge=1,
        le=25,
        description=(
            "Requested number of contacts. Schema is permissive (1-25); the "
            "anonymous tier handler clamps to 5."
        ),
    )

    @model_validator(mode="after")
    def _require_search_criteria(self):
        """Company-less searches are allowed, but location alone is too broad
        to spend PDL credits on — require a company, role, or school."""
        if not (self.company or "").strip() and not (self.role or "").strip() \
                and not (self.school or "").strip():
            raise ValueError(
                "provide a company, role, or school to search on "
                "(location alone is too broad)"
            )
        return self


class Contact(BaseModel):
    name: str
    title: Optional[str] = None
    company: Optional[str] = None
    linkedin_url: Optional[str] = None
    education: Optional[str] = None
    recent_career_move: Optional[str] = None
    personalization_hook: Optional[str] = None
    relationship_type: Optional[str] = None
    warmth: Optional[str] = None  # cold | neutral | warm
    email: Optional[str] = Field(
        None,
        description=(
            "Best-available recipient email when PDL has one for this "
            "contact. Pass it back to draft_outreach.contact.email to "
            "create a real Gmail draft in the user's account."
        ),
    )


class PaywallCTA(BaseModel):
    message: str
    claim_url: str
    reset_in_hours: int
    hit_cap_type: Optional[str] = None  # day | hour | budget


class FindContactsOutput(BaseModel):
    contacts: List[Contact]
    company: str
    cached: bool = False
    truncated_to: Optional[int] = None  # set when count clamped
    note: Optional[str] = None
    paywall: Optional[PaywallCTA] = None


# ── get_company_intel ────────────────────────────────────────────────────────


class GetCompanyIntelInput(BaseModel):
    company: str = Field(..., description="Target company name. Required.")
    user_school: Optional[str] = Field(
        None,
        description=(
            "Your school. When provided, returns how many alumni from that "
            "school work at the company."
        ),
    )
    career_field: Optional[str] = Field(
        None,
        description=(
            "Career field for the alumni-density filter, e.g. 'investment "
            "banking', 'software engineering'. Defaults to 'general' if omitted."
        ),
    )


class AlumniAtSchool(BaseModel):
    school: str
    count: int
    field: str
    examples_available_via: str = "find_contacts"


class CompanyOverview(BaseModel):
    description: Optional[str] = None
    headquarters: Optional[str] = None
    industries: List[str] = Field(default_factory=list)
    culture_keywords: List[str] = Field(default_factory=list)


class RecruitingSignals(BaseModel):
    hiring_momentum: Optional[str] = None
    cycle_intel: Optional[str] = None


class GetCompanyIntelOutput(BaseModel):
    company: str
    overview: CompanyOverview
    recent_news: List[str] = Field(default_factory=list)
    recruiting_signals: RecruitingSignals
    divisions: List[str] = Field(default_factory=list)
    alumni_at_your_school: Optional[AlumniAtSchool] = None
    discovery_score: Optional[int] = None
    cached: bool = False
    paywall: Optional[PaywallCTA] = None


# ── draft_outreach ───────────────────────────────────────────────────────────


class ContactRef(BaseModel):
    name: str
    title: Optional[str] = None
    company: Optional[str] = None
    linkedin_url: Optional[str] = None
    education: Optional[str] = None
    recent_career_move: Optional[str] = None
    email: Optional[str] = Field(
        None,
        description=(
            "Recipient email address. When provided AND the caller is "
            "authenticated AND has connected Gmail at offerloop.ai, the "
            "tool will also create a real Gmail draft in their account."
        ),
    )


class DraftOutreachInput(BaseModel):
    contact: ContactRef
    user_school: Optional[str] = Field(
        None,
        description=(
            "Your school. Recommended for anonymous callers — drives the "
            "alumni hook. Authenticated callers can omit it; the tool uses "
            "the school from their offerloop.ai profile."
        ),
    )
    user_major: Optional[str] = None
    user_year: Optional[str] = None
    user_career_track: Optional[str] = None
    user_target_companies: Optional[List[str]] = None
    intent: str = Field(
        default="coffee_chat",
        description="One of: coffee_chat, informational_interview, referral_ask.",
    )
    personal_note: Optional[str] = Field(
        None,
        description="Free-text context to include in the email.",
    )


class GmailDraftRef(BaseModel):
    draft_id: str
    draft_url: str
    recipient_email: str


class DraftOutreachOutput(BaseModel):
    subject: str
    body: str
    contact_name: str
    cached: bool = False
    paywall: Optional[PaywallCTA] = None
    gmail_draft: Optional[GmailDraftRef] = Field(
        None,
        description=(
            "Set when a Gmail draft was created in the caller's connected "
            "Gmail account. Absent for anonymous callers, callers without "
            "Gmail connected, or contacts without an email address."
        ),
    )
    gmail_draft_status: Optional[str] = Field(
        None,
        description=(
            "When a Gmail draft was NOT created despite the caller being "
            "authenticated, explains why: 'no_recipient_email', "
            "'gmail_not_connected', 'create_failed', or 'scope_missing'. "
            "Lets clients show the user a 'connect Gmail' or 'add an email' "
            "nudge."
        ),
    )
