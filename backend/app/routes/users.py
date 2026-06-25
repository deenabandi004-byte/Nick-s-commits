"""
User management routes
"""
from flask import Blueprint, jsonify, request
from app.extensions import require_firebase_auth, get_db
from app.routes.job_board import (
    get_user_career_profile,
    normalize_intent,
    _clear_user_profile_cache,
    _get_cached_user_profile,
)
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


@users_bp.route('/onboarding-event', methods=['POST'])
@require_firebase_auth
def log_onboarding_event():
    """Log an onboarding step event (viewed or completed).

    Request body: { "event": "viewed"|"completed", "step": "source"|"confirm"|"direction"|"trial", "skipped": false }
    """
    try:
        uid = request.firebase_user["uid"]
        data = request.get_json(silent=True) or {}
        event = data.get("event", "")
        step = data.get("step", "")
        skipped = bool(data.get("skipped", False))

        valid_events = {"viewed": "onboarding_step_viewed", "completed": "onboarding_step_completed"}
        # New 5-step flow: source/confirm/direction/trial. Legacy step names kept
        # so historical/in-flight clients don't 400.
        valid_steps = {
            "profile", "source", "manual", "intent", "track", "trial",
            "confirm", "direction",  # transitional names
            "welcome", "academics", "goals", "location",  # legacy
        }

        if event not in valid_events:
            return jsonify({"error": f"Invalid event: {event}"}), 400
        if step not in valid_steps:
            return jsonify({"error": f"Invalid step: {step}"}), 400

        from app.utils.metrics_events import log_event
        log_event(uid, valid_events[event], {
            "step": step,
            "skipped": skipped,
        })

        return jsonify({"ok": True})
    except Exception as e:
        print(f"[Onboarding] Event log error: {e}")
        return jsonify({"ok": True})  # Never fail the client


# =============================================================================
# Profile confirmation (Phase 1 — personalization data layer)
# =============================================================================

@users_bp.route('/profile-confirm', methods=['POST'])
@require_firebase_auth
def confirm_structured_profile():
    """
    Confirm structured profile fields. Writes normalized versions alongside
    the raw values and stamps profileConfirmedAt + per-field provenance.

    Body: {
        "school": "University of Southern California",
        "targetCompanies": ["Goldman Sachs", "McKinsey"],
        "targetIndustries": ["Investment Banking", "Management Consulting"],
        "targetRoleTypes": ["Internship"],
        "openToLocations": ["New York, NY", "San Francisco, CA"],
        "careerTrack": "Investment Banking"
    }

    All fields are optional — only provided fields are updated.
    """
    uid = request.firebase_user.get("uid")
    if not uid:
        return jsonify({"error": "uid required"}), 401

    data = request.get_json(silent=True) or {}
    if not data:
        return jsonify({"error": "No fields provided"}), 400

    from datetime import datetime, timezone
    from app.models.users import normalize_company, normalize_school, SCHEMA_VERSION

    db = get_db()
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    updates = {
        "profileConfirmedAt": now_iso,
        "schemaVersion": SCHEMA_VERSION,
    }
    provenance_updates = {}

    # School
    if "school" in data and data["school"]:
        school = data["school"].strip()
        updates["school"] = school
        updates["schoolNormalized"] = normalize_school(school)
        provenance_updates["school"] = "explicit"

    # Target companies (normalize each)
    if "targetCompanies" in data and isinstance(data["targetCompanies"], list):
        raw = [c.strip() for c in data["targetCompanies"] if isinstance(c, str) and c.strip()]
        updates["targetCompanies"] = raw
        updates["targetCompaniesNormalized"] = [normalize_company(c) for c in raw]
        provenance_updates["targetCompanies"] = "explicit"

    # Target industries (validate against controlled vocab)
    if "targetIndustries" in data and isinstance(data["targetIndustries"], list):
        from app.config import TARGET_INDUSTRIES
        valid_set = set(TARGET_INDUSTRIES)
        cleaned = [i for i in data["targetIndustries"] if isinstance(i, str) and i in valid_set]
        updates["targetIndustries"] = cleaned
        provenance_updates["targetIndustries"] = "explicit"

    # Target role types
    if "targetRoleTypes" in data and isinstance(data["targetRoleTypes"], list):
        from app.config import TARGET_ROLE_TYPES
        valid_set = set(TARGET_ROLE_TYPES)
        cleaned = [r for r in data["targetRoleTypes"] if isinstance(r, str) and r in valid_set]
        updates["targetRoleTypes"] = cleaned
        provenance_updates["targetRoleTypes"] = "explicit"

    # Open to locations
    if "openToLocations" in data and isinstance(data["openToLocations"], list):
        cleaned = [loc for loc in data["openToLocations"] if isinstance(loc, str) and loc.strip()]
        updates["openToLocations"] = cleaned
        provenance_updates["openToLocations"] = "explicit"

    # Career track (legacy single field)
    if "careerTrack" in data and isinstance(data["careerTrack"], str):
        updates["careerTrack"] = data["careerTrack"].strip()
        provenance_updates["careerTrack"] = "explicit"

    # Write provenance map (merge, don't overwrite)
    if provenance_updates:
        updates["fieldProvenance"] = provenance_updates

    try:
        user_ref = db.collection("users").document(uid)
        user_ref.set(updates, merge=True)

        # Log event if events service is available
        try:
            from app.services.events_service import log_event
            log_event(uid, "profile_confirmed", {
                "fields": list(provenance_updates.keys()),
            })
        except Exception:
            pass

        return jsonify({"ok": True, "updatedFields": list(provenance_updates.keys())}), 200
    except Exception as e:
        print(f"[ProfileConfirm] Error for uid={uid}: {e}")
        return jsonify({"error": "Failed to update profile"}), 500


# =============================================================================
# Pro Free Trial — Wave 3
# =============================================================================
# See `backend/app/services/trial_service.py` for the full policy + lifecycle.
# - 14 days, no credit card required, one trial per account lifetime
# - 300 credits/day daily allocation (no rollover, anti-skim)
# - At expiry, auto-downgrade to Free tier on next authenticated request
# =============================================================================

from app.services.trial_service import start_trial, get_trial_status, apply_trial_expiry


@users_bp.route('/start-trial', methods=['POST'])
@require_firebase_auth
def start_pro_trial():
    """Activate the one-time 14-day Pro free trial. No credit card required.

    Returns:
      200 + {ok, trial_ends_at, daily_credits, duration_days} on success
      409 + {error: 'trial_already_used' | 'already_subscribed'} when ineligible
      404 + {error: 'user_not_found'} when user doc missing
    """
    user_id = request.firebase_user.get('uid')
    if not user_id:
        return jsonify({'error': 'unauthenticated'}), 401

    result = start_trial(user_id)
    if not result.get('ok'):
        err = result.get('error', 'unknown')
        if err == 'user_not_found':
            return jsonify(result), 404
        if err in ('trial_already_used', 'already_subscribed'):
            return jsonify(result), 409
        return jsonify(result), 500

    return jsonify(result), 200


@users_bp.route('/trial-status', methods=['GET'])
@require_firebase_auth
def get_pro_trial_status():
    """Return the user's trial state — used by TrialBanner.tsx to show days +
    daily credits remaining. Also lazily handles trial expiry transition: if
    the trial has expired but we haven't processed it yet, this call also
    runs the auto-downgrade to Free.
    """
    user_id = request.firebase_user.get('uid')
    if not user_id:
        return jsonify({'error': 'unauthenticated'}), 401

    db = get_db()
    user_ref = db.collection('users').document(user_id)
    snap = user_ref.get()
    if not snap.exists:
        return jsonify({'error': 'user_not_found'}), 404
    user_data = snap.to_dict() or {}

    status = get_trial_status(user_data)

    # Lazy expiry processing — flip to Free if needed
    if status.get('is_expired_unprocessed'):
        apply_trial_expiry(user_id)
        # Re-read to surface the new state
        snap = user_ref.get()
        user_data = snap.to_dict() or {}
        status = get_trial_status(user_data)

    return jsonify({
        'ok': True,
        'status': status,
        'has_trial_used': bool(user_data.get('trialUsedAt')),
        'current_tier': user_data.get('subscriptionTier') or user_data.get('tier') or 'free',
    }), 200
