"""
User data models and schemas.

Phase 1 of the Personalization Data Layer extends user docs with structured
fields (school, major, currentRole, targetIndustries, etc.) so generators
and recommendation logic can read typed values instead of pawing through
the legacy `professionalInfo` blob.

All Phase 1 fields are nullable + additive. `professionalInfo` stays as a
read-fallback for v1 of the schema — see §2.3 of the eng review for the
3-stage deprecation policy.
"""
from typing import Optional, Dict, Any, List, Literal
from datetime import datetime

try:
    from pydantic import BaseModel, Field, ConfigDict
    _HAS_PYDANTIC_V2 = True
except ImportError:  # pragma: no cover — repo pins pydantic >=2.10
    _HAS_PYDANTIC_V2 = False
    BaseModel = object  # type: ignore
    Field = lambda *a, **kw: None  # type: ignore
    ConfigDict = dict  # type: ignore

from app.models.enums import UserTier  # re-export friendly  # noqa: F401


# ============================================================================
# Pydantic mirror of the Firestore user document
# ============================================================================

GraduationStatus = Literal['student', 'recent_grad', 'experienced']
TonePreference = Literal['formal', 'casual', 'warm']
LengthPreference = Literal['short', 'medium']
AlumniGraphConsent = Literal['opt_in', 'opt_out', 'pending']
TierLiteral = Literal['free', 'pro', 'elite']


class UserDocument(BaseModel):
    """Pydantic mirror of users/{uid}.

    Loaded with `extra='ignore'` so legacy fields (e.g. `professionalInfo`,
    `dreamCompanies`, `personalNote`, the various usage counters) don't blow
    up validation while we migrate. Aliases match the camelCase Firestore
    field names; Python code can use snake_case.
    """

    # === Identity (existing, unchanged) ============================
    uid: str
    email: str
    name: Optional[str] = None
    tier: TierLiteral = 'free'
    subscription_tier: Optional[TierLiteral] = Field(default=None, alias='subscriptionTier')
    credits: int = 0
    max_credits: Optional[int] = Field(default=None, alias='maxCredits')
    created_at: Optional[str] = Field(default=None, alias='createdAt')
    last_credit_reset: Optional[str] = Field(default=None, alias='lastCreditReset')
    subscription_status: Optional[Literal['active']] = Field(default=None, alias='subscriptionStatus')
    upgraded_at: Optional[str] = None

    # === Phase 1 promoted fields (all nullable, additive) ==========
    schema_version: int = Field(default=1, alias='schemaVersion')

    school: Optional[str] = None
    school_normalized: Optional[str] = Field(default=None, alias='schoolNormalized')
    major: Optional[str] = None
    graduation_year: Optional[int] = Field(default=None, alias='graduationYear', ge=2020, le=2035)
    graduation_status: Optional[GraduationStatus] = Field(default=None, alias='graduationStatus')
    gpa: Optional[float] = Field(default=None, ge=0.0, le=4.0)
    current_role: Optional[str] = Field(default=None, alias='currentRole')
    current_company: Optional[str] = Field(default=None, alias='currentCompany')
    current_company_normalized: Optional[str] = Field(default=None, alias='currentCompanyNormalized')
    target_industries: List[str] = Field(default_factory=list, alias='targetIndustries')
    target_companies: List[str] = Field(default_factory=list, alias='targetCompanies')
    target_role_types: List[str] = Field(default_factory=list, alias='targetRoleTypes')
    interest_tags: List[str] = Field(default_factory=list, alias='interestTags')
    tone_preference: Optional[TonePreference] = Field(default=None, alias='tonePreference')
    length_preference: Optional[LengthPreference] = Field(default=None, alias='lengthPreference')
    location: Optional[str] = None
    open_to_locations: List[str] = Field(default_factory=list, alias='openToLocations')

    # === Resume artifacts (existing, kept) ==========================
    resume_url: Optional[str] = Field(default=None, alias='resumeUrl')
    resume_file_name: Optional[str] = Field(default=None, alias='resumeFileName')
    resume_text: Optional[str] = Field(default=None, alias='resumeText')
    resume_uploaded_at: Optional[str] = Field(default=None, alias='resumeUploadedAt')

    # === Consent flags (P6 — written by AlumniConsent UX) ==========
    alumni_graph_consent: Optional[AlumniGraphConsent] = Field(default=None, alias='alumniGraphConsent')
    alumni_graph_consent_at: Optional[str] = Field(default=None, alias='alumniGraphConsentAt')

    # === Backfill provenance (set by phase1_backfill.py) ===========
    backfill_provenance: Optional[Dict[str, Any]] = Field(default=None, alias='_backfillProvenance')
    profile_confirmed_at: Optional[str] = Field(default=None, alias='profileConfirmedAt')

    if _HAS_PYDANTIC_V2:
        model_config = ConfigDict(populate_by_name=True, extra='ignore')


# ============================================================================
# Phase 1 promoted-field set — used by backfill, profile-confirm, write helpers
# ============================================================================

PHASE_1_PROMOTED_FIELDS = (
    'schemaVersion',
    'school',
    'schoolNormalized',
    'major',
    'graduationYear',
    'graduationStatus',
    'gpa',
    'currentRole',
    'currentCompany',
    'currentCompanyNormalized',
    'targetIndustries',
    'targetCompanies',
    'targetRoleTypes',
    'interestTags',
    'tonePreference',
    'lengthPreference',
    'location',
    'openToLocations',
)


def normalize_school(school: Optional[str]) -> Optional[str]:
    """Lowercase slug for school joins. 'University of Southern California' → 'usc'."""
    if not school:
        return None
    s = school.strip().lower()
    abbreviations = {
        'university of southern california': 'usc',
        'usc': 'usc',
        'university of california, los angeles': 'ucla',
        'university of california los angeles': 'ucla',
        'ucla': 'ucla',
        'university of california, berkeley': 'berkeley',
        'uc berkeley': 'berkeley',
        'berkeley': 'berkeley',
        'university of pennsylvania': 'upenn',
        'upenn': 'upenn',
        'wharton': 'upenn',
        'university of michigan': 'michigan',
        'university of michigan, ann arbor': 'michigan',
        'umich': 'michigan',
        'michigan': 'michigan',
        'new york university': 'nyu',
        'nyu': 'nyu',
        'georgetown university': 'georgetown',
        'georgetown': 'georgetown',
        'massachusetts institute of technology': 'mit',
        'mit': 'mit',
        'stanford university': 'stanford',
        'stanford': 'stanford',
        'harvard university': 'harvard',
        'harvard': 'harvard',
        'yale university': 'yale',
        'yale': 'yale',
        'princeton university': 'princeton',
        'princeton': 'princeton',
        'columbia university': 'columbia',
        'columbia': 'columbia',
        'duke university': 'duke',
        'duke': 'duke',
    }
    if s in abbreviations:
        return abbreviations[s]
    # Fallback: collapse to alnum-hyphen slug (good enough for join key)
    import re as _re
    slug = _re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return slug or None


def normalize_company(company: Optional[str]) -> Optional[str]:
    """Lowercase slug for company joins. 'Goldman Sachs' / 'GS' / 'Goldman' → 'goldman-sachs'.

    Phase 3: delegates to `app.utils.company.company_to_slug` which carries
    the full alias map (top ~100 firms students target) plus suffix
    stripping. Kept as a re-export so older callsites importing from
    `app.models.users` keep working unchanged.
    """
    # Local import — `app.utils.company` may import from this module
    # transitively in tests; keep the dependency one-way.
    from app.utils.company import company_to_slug
    return company_to_slug(company)


# ============================================================================
# Existing helpers (kept; lightly extended to set schemaVersion on new docs)
# ============================================================================


def create_user_data(
    uid: str,
    email: str,
    tier: str = 'free',
    name: Optional[str] = None,
    credits: Optional[int] = None,
    max_credits: Optional[int] = None
) -> Dict[str, Any]:
    """Create a new user data structure for Firestore.

    Phase 1 additions:
    - `schemaVersion: 1` is written on every new doc so version-aware code
      paths know what to expect.
    - All promoted fields are emitted as nulls / empty arrays so reads from
      typed code never hit a KeyError.
    """
    from app.config import TIER_CONFIGS

    tier_config = TIER_CONFIGS.get(tier, TIER_CONFIGS['free'])
    default_credits = tier_config.get('credits', 300)

    user_data: Dict[str, Any] = {
        'uid': uid,
        'email': email,
        'subscriptionTier': tier,
        'tier': tier,
        'credits': credits if credits is not None else default_credits,
        'maxCredits': max_credits if max_credits is not None else default_credits,
        'createdAt': datetime.now().isoformat(),
        'lastCreditReset': datetime.now().isoformat(),
        'lastUsageReset': datetime.now().isoformat(),
        'subscriptionStatus': 'active' if tier in ['pro', 'elite'] else None,
        'alumniSearchesUsed': 0,
        'coffeeChatPrepsUsed': 0,
        'interviewPrepsUsed': 0,

        # === Phase 1 promoted fields (nullable defaults) ===
        'schemaVersion': 1,
        'school': None,
        'schoolNormalized': None,
        'major': None,
        'graduationYear': None,
        'graduationStatus': None,
        'gpa': None,
        'currentRole': None,
        'currentCompany': None,
        'currentCompanyNormalized': None,
        'targetIndustries': [],
        'targetCompanies': [],
        'targetRoleTypes': [],
        'interestTags': [],
        'tonePreference': None,
        'lengthPreference': None,
        'location': None,
        'openToLocations': [],
        'alumniGraphConsent': None,
    }

    if name:
        user_data['name'] = name

    return user_data


def update_user_tier_data(tier: str, credits: Optional[int] = None) -> Dict[str, Any]:
    """Create update data for tier changes."""
    from app.config import TIER_CONFIGS

    tier_config = TIER_CONFIGS.get(tier, TIER_CONFIGS['free'])
    default_credits = tier_config.get('credits', 300)

    update_data = {
        'subscriptionTier': tier,
        'tier': tier,
        'credits': credits if credits is not None else default_credits,
        'maxCredits': default_credits,
        'subscriptionStatus': 'active' if tier in ['pro', 'elite'] else None,
        'upgraded_at': datetime.now().isoformat() if tier in ['pro', 'elite'] else None,
        'lastCreditReset': datetime.now().isoformat(),
    }

    return update_data


def validate_user_tier(tier: str) -> bool:
    """Validate that tier is a valid value."""
    return tier in ['free', 'pro', 'elite']


def get_default_credits_for_tier(tier: str) -> int:
    """Get default credits for a tier."""
    from app.config import TIER_CONFIGS
    return TIER_CONFIGS.get(tier, TIER_CONFIGS['free']).get('credits', 300)
