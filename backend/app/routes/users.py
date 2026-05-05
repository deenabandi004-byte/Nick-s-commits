"""
User management routes
"""
import os
import re
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request
from app.extensions import require_firebase_auth, get_db
from app.routes.job_board import (
    get_user_career_profile,
    normalize_intent,
    _clear_user_profile_cache,
    _get_cached_user_profile,
)
from app.models.users import (
    PHASE_1_PROMOTED_FIELDS,
    normalize_company,
    normalize_school,
)
from app.services.alumni_service import get_alumni_count
from app.services.company_contexts_service import (
    REASON_MAX_CHARS,
    list_company_contexts,
    should_show_prompt,
    write_company_context,
)
from app.utils.company import company_to_slug, get_aliases_for_slug
from firebase_admin import firestore
import json

users_bp = Blueprint('users', __name__, url_prefix='/api/users')

# =============================================================================
# PHASE 5: Job-Relevant Fields That Trigger Recomputation
# =============================================================================

# =============================================================================
# SECURITY: Fields that only the backend (Stripe webhooks, admin scripts) may write.
# The update-preferences endpoint strips these before writing to Firestore.
# =============================================================================
BLOCKED_FIELDS = {
    "tier", "subscriptionTier", "credits", "maxCredits",
    "lastCreditReset", "stripeCustomerId", "stripeSubscriptionId",
    "subscriptionStatus", "alumniSearchesUsed", "coffeeChatPrepsUsed",
    "interviewPrepsUsed", "email",  # email comes from Firebase Auth, not user input
}

JOB_RELEVANT_FIELDS = {
    "location.preferredLocation",
    "location.interests",
    "location.careerInterests",
    "location.jobTypes",
    "academics.graduationYear",
    "academics.graduationMonth",
    "academics.degree",
    "academics.university",
    "professionalInfo.interests",  # Legacy path
    "jobTypes",  # Legacy top-level path
    "graduationYear",  # Legacy top-level path
    "careerTrack",
    "dreamCompanies",
    "personalNote",
}


def _get_nested_field(data: dict, field_path: str) -> any:
    """
    Get nested field value using dot notation (e.g., "location.preferredLocation").
    """
    parts = field_path.split(".")
    value = data
    for part in parts:
        if isinstance(value, dict):
            value = value.get(part)
        else:
            return None
    return value


def _set_nested_field(data: dict, field_path: str, value: any):
    """
    Set nested field value using dot notation.
    """
    parts = field_path.split(".")
    current = data
    for i, part in enumerate(parts):
        if i == len(parts) - 1:
            current[part] = value
        else:
            if part not in current:
                current[part] = {}
            current = current[part]


def _detect_job_relevant_changes(old_data: dict, new_data: dict) -> list:
    """
    Detect if any job-relevant fields changed between old and new data.
    
    Returns:
        List of changed field paths
    """
    changed_fields = []
    
    for field_path in JOB_RELEVANT_FIELDS:
        old_value = _get_nested_field(old_data, field_path)
        new_value = _get_nested_field(new_data, field_path)
        
        # Compare values (handle lists specially)
        if old_value != new_value:
            # Deep comparison for lists
            if isinstance(old_value, list) and isinstance(new_value, list):
                if sorted(old_value) != sorted(new_value):
                    changed_fields.append(field_path)
            elif old_value != new_value:
                changed_fields.append(field_path)
    
    return changed_fields


def _compare_intent_contracts(old_intent: dict, new_intent: dict) -> bool:
    """
    Compare two intent contracts to detect meaningful changes.
    
    Returns:
        True if intent meaningfully changed, False otherwise
    """
    # Compare key fields that affect job recommendations
    key_fields = [
        "career_domains",
        "preferred_locations",
        "job_types",
        "graduation_timing.career_phase",
        "graduation_timing.months_until_graduation",
    ]
    
    for field in key_fields:
        if "." in field:
            # Nested field
            parts = field.split(".")
            old_val = old_intent
            new_val = new_intent
            for part in parts:
                old_val = old_val.get(part, {}) if isinstance(old_val, dict) else None
                new_val = new_val.get(part, {}) if isinstance(new_val, dict) else None
            
            if old_val != new_val:
                return True
        else:
            # Top-level field
            old_val = old_intent.get(field)
            new_val = new_intent.get(field)
            
            # Special handling for lists
            if isinstance(old_val, list) and isinstance(new_val, list):
                if sorted(old_val) != sorted(new_val):
                    return True
            elif old_val != new_val:
                return True
    
    return False


@users_bp.route('/update-preferences', methods=['POST'])
@require_firebase_auth
def update_user_preferences():
    """
    PHASE 5: Update user preferences with intent change detection.
    
    Detects if preference changes affect job recommendations and invalidates
    caches accordingly.
    
    Request body:
    {
        "updates": {
            "location": {
                "preferredLocation": ["New York, NY", "San Francisco, CA"]
            },
            "academics": {
                "graduationYear": "2026"
            },
            ...
        }
    }
    
    Returns:
    {
        "success": true,
        "intentChanged": true/false,
        "changedFields": ["location.preferredLocation", ...]
    }
    """
    try:
        db = get_db()
        if not db:
            return jsonify({"error": "Database not available"}), 500
        
        user_id = request.firebase_user.get('uid')
        data = request.get_json() or {}
        updates = data.get("updates", {})
        
        if not updates:
            return jsonify({"error": "No updates provided"}), 400
        
        # Get current user data
        user_ref = db.collection("users").document(user_id)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            return jsonify({"error": "User not found"}), 404
        
        old_data = user_doc.to_dict()
        
        # PHASE 5: Detect job-relevant field changes BEFORE update
        changed_fields = _detect_job_relevant_changes(old_data, {**old_data, **updates})
        
        # PHASE 5: Get old intent contract for comparison
        old_profile = get_user_career_profile(user_id)
        old_intent = old_profile.get("_intent_contract")
        if not old_intent:
            # Compute old intent if not cached
            old_intent = normalize_intent(old_profile)
        
        print(f"[IntentUpdate] user={user_id[:8]}... updated_fields={changed_fields}")
        
        # Apply updates to Firestore
        # SECURITY: Strip billing/tier fields that only the backend should write.
        # The Admin SDK bypasses Firestore security rules, so we must enforce
        # the field blocklist here in application code.
        firestore_updates = {}
        for key, value in updates.items():
            if key in BLOCKED_FIELDS:
                print(f"[SECURITY] Blocked write to protected field '{key}' for user={user_id[:8]}...")
                continue
            if isinstance(value, dict):
                # Nested update (e.g., location.preferredLocation)
                for nested_key, nested_value in value.items():
                    field_path = f"{key}.{nested_key}"
                    if nested_key in BLOCKED_FIELDS or field_path in BLOCKED_FIELDS:
                        print(f"[SECURITY] Blocked write to protected field '{field_path}' for user={user_id[:8]}...")
                        continue
                    firestore_updates[field_path] = nested_value
            else:
                firestore_updates[key] = value

        if not firestore_updates:
            return jsonify({"error": "No valid updates provided"}), 400
        
        user_ref.update(firestore_updates)
        
        # PHASE 5: Recompute new intent contract AFTER update
        # Clear profile cache to force fresh fetch
        _clear_user_profile_cache(user_id)
        new_profile = get_user_career_profile(user_id)
        new_intent = normalize_intent(new_profile)
        
        # PHASE 5: Compare old vs new intent
        intent_changed = _compare_intent_contracts(old_intent, new_intent)
        
        print(f"[IntentUpdate] old_intent={json.dumps({k: v for k, v in old_intent.items() if k != 'preferred_locations'}, default=str)[:200]}...")
        print(f"[IntentUpdate] new_intent={json.dumps({k: v for k, v in new_intent.items() if k != 'preferred_locations'}, default=str)[:200]}...")
        print(f"[IntentUpdate] intent_changed={intent_changed}")
        
        # PHASE 5: Invalidate job board cache if intent changed
        if intent_changed:
            # Clear user profile cache (already cleared, but ensure it stays clear)
            _clear_user_profile_cache(user_id)
            
            # Invalidate job cache in Firestore (delete all cached jobs for this user's queries)
            # Note: We can't easily identify user-specific cache keys, so we rely on TTL
            # But we can add a user-specific invalidation marker
            invalidation_ref = db.collection("job_cache_invalidations").document(user_id)
            invalidation_ref.set({
                "invalidated_at": firestore.SERVER_TIMESTAMP,
                "reason": "intent_changed",
                "changed_fields": changed_fields
            }, merge=True)
            
            print(f"[JobBoard][INVALIDATE] user={user_id[:8]}... reason=intent_changed changed_fields={changed_fields}")
        else:
            print(f"[IntentUpdate] intent_unchanged — no recompute triggered")
        
        return jsonify({
            "success": True,
            "intentChanged": intent_changed,
            "changedFields": changed_fields
        })
        
    except Exception as e:
        print(f"[IntentUpdate] Error updating preferences: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# =============================================================================
# Phase 1 — Personalization Data Layer endpoints
# =============================================================================
# - GET /api/users/alumni-count — read-cache lookup for the contact-card badge
# - GET /api/users/profile-confirm — pull what backfill extracted so the modal
#       can show extracted vs. user-confirmed values
# - POST /api/users/profile-confirm — write user-confirmed fields with
#       source='explicit' so future generations stop using inferred values

# Whitelist of Phase 1 promoted fields the user is allowed to confirm/edit
# via the profile-confirm modal. Stays in sync with PHASE_1_PROMOTED_FIELDS
# in models/users.py.
PROFILE_CONFIRM_WRITABLE_FIELDS = {
    "school", "schoolNormalized", "major",
    "graduationYear", "graduationStatus", "gpa",
    "currentRole", "currentCompany", "currentCompanyNormalized",
    "targetIndustries", "targetCompanies", "targetRoleTypes",
    "interestTags", "tonePreference", "lengthPreference",
    "location", "openToLocations",
}


@users_bp.route('/alumni-count', methods=['GET'])
@require_firebase_auth
def alumni_count():
    """Return the cached alumni count for (school, company[, office]).

    Phase 1 callers: ContactCard top-right badge. Returns 200 + {count, ...}
    on cache hit, 200 + {count: null, miss: true} on miss. We never trigger
    a fresh PDL fetch from this endpoint — the Phase 6 sourcing pipeline
    populates the cache.
    """
    school = request.args.get('school', '').strip()
    company = request.args.get('company', '').strip()
    office = (request.args.get('office') or '').strip() or None

    if not school or not company:
        return jsonify({'error': 'school and company are required'}), 400

    data = get_alumni_count(school, company, office)

    # Phase 6: when ALUMNI_GRAPH_ENABLED is on and the cache is missing or
    # stale, source synchronously through the provider chain. Flag off keeps
    # the Phase 1 read-only behavior unchanged.
    try:
        from app.services.alumni_sourcing_service import (
            is_enabled as alumni_graph_enabled,
            source_alumni_for_pair,
        )
        if alumni_graph_enabled() and (data is None or getattr(data, 'is_stale', False)):
            sourced = source_alumni_for_pair(school, company, office)
            if sourced is not None:
                data = sourced
    except Exception:
        # Sourcing must never break the read path; fall through to the cache.
        pass

    if not data:
        return jsonify({
            'count': None,
            'miss': True,
            'schoolId': normalize_school(school),
            'companyId': normalize_company(company),
        }), 200

    return jsonify(data.to_dict()), 200


@users_bp.route('/profile-confirm', methods=['GET', 'POST'])
@require_firebase_auth
def profile_confirm():
    """Profile-confirm modal back-end.

    GET: returns the current user's structured fields plus the
        `_backfillProvenance` blob so the modal can render extracted values
        side-by-side with edit fields.
    POST: writes user-confirmed values. Each field that the user touches
        is recorded under `_backfillProvenance.{field} = 'explicit'` so the
        generator knows it can trust them. Sets `profileConfirmedAt`.
    """
    uid = request.firebase_user['uid']
    db = get_db()
    user_ref = db.collection('users').document(uid)

    if request.method == 'GET':
        snap = user_ref.get()
        if not snap.exists:
            return jsonify({'error': 'user not found'}), 404
        data = snap.to_dict() or {}
        out = {field: data.get(field) for field in PHASE_1_PROMOTED_FIELDS}
        out['_backfillProvenance'] = data.get('_backfillProvenance')
        out['profileConfirmedAt'] = data.get('profileConfirmedAt')
        return jsonify(out), 200

    body = request.get_json(silent=True) or {}
    updates = {}
    provenance_updates = {}

    for key, value in body.items():
        if key not in PROFILE_CONFIRM_WRITABLE_FIELDS:
            continue
        # Defensive normalization for the slug fields — the frontend
        # mostly sends display names; we recompute the slug server-side.
        updates[key] = value
        provenance_updates[key] = 'explicit'

    # Recompute normalized slugs on every confirm so the user can't end
    # up with display + slug mismatches.
    if 'school' in updates:
        updates['schoolNormalized'] = normalize_school(updates['school'])
    if 'currentCompany' in updates:
        updates['currentCompanyNormalized'] = normalize_company(updates['currentCompany'])

    if not updates:
        return jsonify({'error': 'no writable fields in body'}), 400

    now = datetime.now(timezone.utc).isoformat()
    updates['profileConfirmedAt'] = now
    updates['updatedAt'] = now
    # Merge provenance into the existing blob.
    snap = user_ref.get()
    existing_provenance = (snap.to_dict() or {}).get('_backfillProvenance') or {}
    if not isinstance(existing_provenance, dict):
        existing_provenance = {}
    existing_provenance.update(provenance_updates)
    existing_provenance['confirmedAt'] = now
    updates['_backfillProvenance'] = existing_provenance

    user_ref.set(updates, merge=True)
    _clear_user_profile_cache(uid)

    return jsonify({'success': True, 'fieldsWritten': list(provenance_updates.keys())}), 200


# =============================================================================
# Phase 3 — Company Contexts (floating-prompt back-end)
# =============================================================================
# - GET  /api/company-contexts/should-show — staleness check for the floating
#         prompt; the FloatingPrompt component calls this on render to decide
#         whether to show itself for a given (user, company).
# - POST /api/company-contexts — write the user's answer with source='explicit'.
# - GET  /api/company-contexts — list all contexts for the current user
#         (used by the AccountSettings "your reasons" surface).
#
# Both routes are gated by FLOATING_PROMPT_ENABLED so we can deploy the API
# surface separately from flipping the UX live. Default OFF (per §8).

REASON_MIN_CHARS = 10  # noise floor — anything shorter is a "test" / "asdf"
# Strings the user can type instead of a real answer — match exactly to
# avoid catching legitimate short answers like "Family connections."
_NOISE_LITERALS = {
    'asdf', 'asdfasdf', 'qwerty', 'test', 'testing', 'tbd', 'idk',
    'i dont know', "i don't know", 'no idea', 'na', 'n/a', 'none',
    'placeholder', 'tk', 'todo',
}


def _floating_prompt_enabled() -> bool:
    return os.getenv('FLOATING_PROMPT_ENABLED', 'false').lower() == 'true'


def _validate_reason_or_400(reason):
    """Pure validator — returns (cleaned, error_dict_or_None).

    Returning a dict (not a Flask response) keeps this function unit-testable
    without an app context. The route wraps the dict in `jsonify` itself.
    """
    if not isinstance(reason, str):
        return None, {'error': 'reason must be a string', 'status': 400}
    cleaned = reason.strip()
    if len(cleaned) < REASON_MIN_CHARS:
        return None, {
            'error': f'reason must be at least {REASON_MIN_CHARS} characters',
            'code': 'reason_too_short',
            'status': 400,
        }
    if len(cleaned) > REASON_MAX_CHARS:
        cleaned = cleaned[:REASON_MAX_CHARS]
    # Noise filter — strip and lower to catch "  ASDF  " but keep things
    # like "Family connections." intact (length > min already filters).
    lowered = re.sub(r'\s+', ' ', cleaned.lower()).strip()
    if lowered in _NOISE_LITERALS:
        return None, {
            'error': 'reason looks like a placeholder; please write a real one',
            'code': 'reason_noise',
            'status': 400,
        }
    # Repetition heuristic — "asdfasdfasdf" / "aaaaaaaaaa" patterns.
    compact = lowered.replace(' ', '')
    if len(set(compact)) <= 2:
        return None, {
            'error': 'reason looks like keyboard mashing; please write a real one',
            'code': 'reason_noise',
            'status': 400,
        }
    # Catch short-substring tile repetition like "asdfasdfasdf".
    for unit_len in range(2, 5):
        if len(compact) >= unit_len * 3:
            unit = compact[:unit_len]
            if compact == unit * (len(compact) // unit_len) + compact[len(compact) - (len(compact) % unit_len):]:
                if compact == unit * (len(compact) // unit_len) and len(compact) % unit_len == 0:
                    return None, {
                        'error': 'reason looks like keyboard mashing; please write a real one',
                        'code': 'reason_noise',
                        'status': 400,
                    }
    return cleaned, None


# NOTE: The two company-contexts routes live on a dedicated blueprint
# (`company_contexts_bp`) registered at `/api/company-contexts` rather than
# under the `/api/users` prefix. That keeps the API shape spec-aligned
# (§5 P3) and avoids fragile `..` traversal in the URL path.
company_contexts_bp = Blueprint('company_contexts', __name__, url_prefix='/api/company-contexts')


@company_contexts_bp.route('/should-show', methods=['GET'])
@require_firebase_auth
def company_contexts_should_show():
    """Return whether the floating prompt should fire for (user, company).

    Query params:
        company        — display name. Required.
        companyId      — already-normalized slug; overrides `company` if both.

    Returns:
        200 with the dict from `should_show_prompt` (show, reason, priorAnswer).
        When the feature flag is off, always returns show=false.
    """
    if not _floating_prompt_enabled():
        return jsonify({
            'show': False,
            'reason': 'flag_disabled',
            'priorAnswer': None,
        }), 200

    uid = request.firebase_user['uid']
    company_raw = (request.args.get('company') or '').strip()
    company_id_param = (request.args.get('companyId') or '').strip()
    company_id = company_id_param or company_to_slug(company_raw)
    if not company_id:
        return jsonify({'error': 'company or companyId is required'}), 400

    decision = should_show_prompt(uid, company_id)
    # Don't leak the full prior context doc to the client — only the answer
    # text and source are needed to render the stale re-ask UI.
    prior_ctx = decision.get('priorContext') or {}
    return jsonify({
        'show': bool(decision.get('show')),
        'reason': decision.get('reason'),
        'priorAnswer': decision.get('priorAnswer'),
        'priorSource': prior_ctx.get('source'),
        'companyId': company_id,
    }), 200


@company_contexts_bp.route('', methods=['GET', 'POST'])
@require_firebase_auth
def company_contexts():
    """List or write company contexts for the current user."""
    uid = request.firebase_user['uid']

    if request.method == 'GET':
        if not _floating_prompt_enabled():
            return jsonify({'contexts': []}), 200
        contexts = list_company_contexts(uid)
        # Trim verbose fields the UI doesn't need.
        trimmed = [
            {
                'companyId': c.get('companyId'),
                'companyName': c.get('companyName'),
                'reason': c.get('reason'),
                'source': c.get('source'),
                'answeredAt': c.get('answeredAt'),
                'lastUsedAt': c.get('lastUsedAt'),
            }
            for c in contexts
        ]
        return jsonify({'contexts': trimmed}), 200

    if not _floating_prompt_enabled():
        return jsonify({'error': 'feature flag disabled', 'code': 'flag_disabled'}), 403

    body = request.get_json(silent=True) or {}
    company_name = (body.get('company') or body.get('companyName') or '').strip()
    reason_raw = body.get('reason') or ''
    company_id_param = (body.get('companyId') or '').strip()
    related_role_types = body.get('relatedRoleTypes') or []

    if not company_name and not company_id_param:
        return jsonify({'error': 'company is required'}), 400

    cleaned_reason, err = _validate_reason_or_400(reason_raw)
    if err is not None:
        status = err.pop('status', 400)
        return jsonify(err), status

    company_id = company_id_param or company_to_slug(company_name)
    if not company_id:
        return jsonify({'error': f'could not normalize company {company_name!r}'}), 400

    # Surface known aliases on first write so future lookups for any of
    # those names hit this same doc.
    aliases = get_aliases_for_slug(company_id)
    if company_name and company_name.lower() not in {a.lower() for a in aliases}:
        aliases = sorted(set(aliases + [company_name]))

    persisted = write_company_context(
        uid=uid,
        company_name=company_name or company_id,
        reason=cleaned_reason,
        source='explicit',
        company_aliases=aliases,
        related_role_types=related_role_types if isinstance(related_role_types, list) else [],
        answered=True,
        company_id_normalized=company_id,
    )
    return jsonify({
        'success': True,
        'companyId': company_id,
        'reason': persisted.get('reason'),
        'answeredAt': persisted.get('answeredAt'),
    }), 200


