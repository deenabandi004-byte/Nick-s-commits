"""
Input validation schemas using Pydantic
"""
from pydantic import BaseModel, ConfigDict, Field, EmailStr, HttpUrl, field_validator
from typing import Optional, List
from app.utils.exceptions import ValidationError


class ContactSearchRequest(BaseModel):
    """Validation schema for contact search requests"""
    jobTitle: str = Field(..., min_length=1, max_length=200, description="Job title to search for")
    company: Optional[str] = Field(None, max_length=200, description="Company name (optional)")
    location: str = Field(..., min_length=1, max_length=200, description="Location (city, state)")
    collegeAlumni: Optional[str] = Field(None, max_length=200, description="College name for alumni filter")
    batchSize: Optional[int] = Field(None, ge=1, le=15, description="Number of contacts to return (max 15 for elite tier)")
    careerInterests: Optional[List[str]] = Field(None, max_length=10, description="Career interests")
    userProfile: Optional[dict] = Field(None, description="User profile data")
    
    @field_validator('jobTitle', 'location')
    @classmethod
    def validate_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError('Field cannot be empty')
        return v.strip()
    
    @field_validator('company')
    @classmethod
    def validate_company(cls, v):
        if v is None:
            return None
        return v.strip() if v.strip() else None
    
    @field_validator('batchSize')
    @classmethod
    def validate_batch_size(cls, v, info):
        if v is None:
            return None
        if v < 1:
            raise ValueError('Batch size must be at least 1')
        if v > 15:
            raise ValueError('Batch size cannot exceed 15 (elite tier maximum)')
        return v


class FirmSearchRequest(BaseModel):
    """Validation schema for firm search requests"""
    query: str = Field(..., min_length=1, max_length=500, description="Search query")
    # Upper bound matches the highest Find Companies slider cap (Elite = 50).
    # Per-tier caps (free 10 / pro 25 / elite 50) are enforced in the route after
    # the tier is resolved, so this only needs to allow the largest valid request.
    batchSize: Optional[int] = Field(None, ge=1, le=50, description="Number of firms to return")
    
    @field_validator('query')
    @classmethod
    def validate_query(cls, v):
        if not v or not v.strip():
            raise ValueError('Search query cannot be empty')
        return v.strip()


class CoffeeChatPrepRequest(BaseModel):
    """Validation schema for coffee chat prep requests"""
    linkedinUrl: str = Field(..., description="LinkedIn profile URL")
    timeWindow: Optional[str] = Field(None, description="Time window for news search")
    geo: Optional[str] = Field(None, description="Geographic region")
    language: Optional[str] = Field(None, description="Language")
    division: Optional[str] = Field(None, description="Division/Department")
    office: Optional[str] = Field(None, description="Office location")
    industry: Optional[str] = Field(None, description="Industry")
    
    @field_validator('linkedinUrl')
    @classmethod
    def validate_linkedin_url(cls, v):
        if not v or not v.strip():
            raise ValueError('LinkedIn URL is required')
        v = v.strip()
        # Accept various LinkedIn URL formats
        if 'linkedin.com' not in v.lower():
            raise ValueError('Invalid LinkedIn URL format')
        return v


class ContactCreateRequest(BaseModel):
    """Validation schema for creating a contact"""
    firstName: str = Field(..., min_length=1, max_length=100)
    lastName: str = Field(..., min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    linkedinUrl: Optional[str] = Field(None, max_length=500)
    company: Optional[str] = Field(None, max_length=200)
    jobTitle: Optional[str] = Field(None, max_length=200)
    college: Optional[str] = Field(None, max_length=200)
    location: Optional[str] = Field(None, max_length=200)


class ContactUpdateRequest(BaseModel):
    """Validation schema for updating a contact"""
    firstName: Optional[str] = Field(None, min_length=1, max_length=100)
    lastName: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    linkedinUrl: Optional[str] = Field(None, max_length=500)
    company: Optional[str] = Field(None, max_length=200)
    jobTitle: Optional[str] = Field(None, max_length=200)
    college: Optional[str] = Field(None, max_length=200)
    location: Optional[str] = Field(None, max_length=200)
    status: Optional[str] = Field(None, max_length=50)


class _BlocklistShape(BaseModel):
    model_config = ConfigDict(extra="forbid")
    companies: Optional[List[str]] = Field(None, max_length=200)
    titles: Optional[List[str]] = Field(None, max_length=200)
    emails: Optional[List[str]] = Field(None, max_length=200)


class AgentConfigUpdate(BaseModel):
    """Validation schema for PUT /api/agent/config.

    Mirrors MUTABLE_CONFIG_FIELDS in app/services/agent_service.py. Extra fields
    are rejected with 400 (was: silently dropped). Numeric fields are typed
    so a bad payload returns a clear error instead of a 500 from int('abc').
    """
    model_config = ConfigDict(extra="forbid")

    briefText: Optional[str] = Field(None, max_length=2000)
    briefParsed: Optional[dict] = None
    reviewBeforeSend: Optional[bool] = None
    targetCompanies: Optional[List[str]] = Field(None, max_length=50)
    targetIndustries: Optional[List[str]] = Field(None, max_length=20)
    targetRoles: Optional[List[str]] = Field(None, max_length=20)
    targetLocations: Optional[List[str]] = Field(None, max_length=20)
    preferAlumni: Optional[bool] = None
    # Cadence targets are optional. Cadence-off Loops, and Loops whose mode
    # excludes contacts (roles-only), legitimately omit these fields. The
    # field-level floor (ge=1 / ge=10) was rejecting those payloads with
    # 400. Upper caps stay as a typo guard; the floor is enforced by the
    # field_validator below (0 or negative is coerced to None, i.e. treated
    # as "not provided"). When a value IS provided as None or omitted, the
    # service layer (agent_service.update_agent_config) leaves the stored
    # value untouched.
    # Upper bounds match agent_service.MAX_CONTACTS_PER_WEEK / MAX_CREDITS_PER_WEEK,
    # which are sized for the daily-cadence ceiling (contacts: 15/day × 7;
    # credits: per-cycle both-mode max × 7). Per-tier caps in config.py
    # clamp below these for non-elite users.
    weeklyContactTarget: Optional[int] = Field(None, le=105)
    creditBudgetPerWeek: Optional[int] = Field(None, le=700)
    approvalMode: Optional[str] = Field(None, pattern=r"^(review_first|autopilot)$")
    autoSendUnlocked: Optional[bool] = None
    emailTemplatePurpose: Optional[str] = Field(None, max_length=500)
    emailStylePreset: Optional[str] = Field(None, max_length=100)
    customInstructions: Optional[str] = Field(None, max_length=2000)
    signoffPhrase: Optional[str] = Field(None, max_length=200)
    signatureBlock: Optional[str] = Field(None, max_length=1000)
    followUpEnabled: Optional[bool] = None
    followUpDays: Optional[int] = Field(None, ge=3, le=14)
    maxFollowUps: Optional[int] = Field(None, ge=1, le=3)
    blocklist: Optional[_BlocklistShape] = None
    enableJobDiscovery: Optional[bool] = None
    enableHiringManagers: Optional[bool] = None
    enableCompanyDiscovery: Optional[bool] = None
    digestEnabled: Optional[bool] = None

    # Cadence-off semantics: a client that legitimately has no target (cadence
    # disabled, or roles-only mode in which contacts are not chased) sends 0
    # or omits the field. Coerce 0 (and any non-positive int) to None so the
    # service layer treats it as "not provided" rather than 400ing on the
    # old ge=1 floor. Applied to both target and budget so neither field
    # trips when the other does. Note: only weeklyContactTarget exists today
    # as a cadence target on this schema; if dailyContactTarget, weekly/daily
    # RoleTarget are added later, give them the same validator.
    @field_validator("weeklyContactTarget", "creditBudgetPerWeek", mode="before")
    @classmethod
    def _zero_or_negative_is_none(cls, v):
        if v is None:
            return None
        try:
            n = int(v)
        except (TypeError, ValueError):
            # Let the int type check below produce a clean error.
            return v
        return n if n > 0 else None


class AgentBriefRequest(BaseModel):
    """Validation schema for POST /api/agent/brief."""
    model_config = ConfigDict(extra="forbid")

    briefText: str = Field(..., max_length=2000)


def _convert_pydantic_types_to_primitives(data: dict) -> dict:
    """
    Convert any Pydantic special types (HttpUrl, EmailStr, etc.) to primitive Python types.
    This ensures compatibility with Firestore which only accepts primitives.
    """
    result = {}
    for key, value in data.items():
        if value is None:
            result[key] = None
        elif isinstance(value, dict):
            result[key] = _convert_pydantic_types_to_primitives(value)
        elif isinstance(value, list):
            result[key] = [
                _convert_pydantic_types_to_primitives(item) if isinstance(item, dict) 
                else str(item) if hasattr(item, '__class__') and 'pydantic' in str(type(item).__module__)
                else item
                for item in value
            ]
        else:
            # Check if it's a Pydantic type (HttpUrl, EmailStr, etc.)
            value_type_name = type(value).__name__
            value_module = str(type(value).__module__)
            
            if 'pydantic' in value_module or 'Url' in value_type_name or 'HttpUrl' in value_type_name:
                result[key] = str(value)
            elif not isinstance(value, (str, int, float, bool)):
                # For any other non-primitive type, convert to string
                result[key] = str(value)
            else:
                result[key] = value
    return result


def validate_request(schema_class: type[BaseModel], data: dict, raise_on_error: bool = True):
    """
    Validate request data against a Pydantic schema.
    
    Args:
        schema_class: Pydantic model class
        data: Request data to validate
        raise_on_error: If True, raise ValidationError. If False, return (is_valid, errors)
    
    Returns:
        If raise_on_error=True: Validated data dict
        If raise_on_error=False: (is_valid: bool, validated_data: dict, errors: list)
    """
    try:
        validated = schema_class(**data)
        if raise_on_error:
            # Use mode='json' to convert HttpUrl and other special types to strings
            result = validated.model_dump(exclude_none=True, mode='json')
            # SAFETY: Explicitly convert any remaining Pydantic types to primitives
            result = _convert_pydantic_types_to_primitives(result)
            return result
        else:
            result = validated.model_dump(exclude_none=True, mode='json')
            result = _convert_pydantic_types_to_primitives(result)
            return True, result, []
    except Exception as e:
        if isinstance(e, ValidationError):
            raise
        # Convert Pydantic validation errors to our ValidationError
        errors = []
        if hasattr(e, 'errors'):
            for error in e.errors():
                field = '.'.join(str(x) for x in error.get('loc', []))
                message = error.get('msg', 'Validation error')
                errors.append(f"{field}: {message}")
        
        error_message = '; '.join(errors) if errors else str(e)
        
        if raise_on_error:
            raise ValidationError(error_message, details={'validation_errors': errors})
        else:
            return False, {}, errors
