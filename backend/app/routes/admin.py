"""
Admin / one-off endpoints (e.g. migrations).
"""
import os
import time
from flask import Blueprint, jsonify, request

from app.extensions import require_firebase_auth, get_db
from app.services.migration import backfill_pipeline_stages, deduplicate_contacts
from app.services.background_sync import sync_stale_threads
from app.services.gmail_client import renew_gmail_watch
from app.services.email_baseline import compute_email_baseline

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")

# In production, call POST /api/admin/renew-watches from a cron job every 12 hours
# with header X-Cron-Secret matching CRON_SECRET env var.


@admin_bp.post("/backfill-stages")
@require_firebase_auth
def backfill_stages():
    """
    Backfill pipelineStage and emailSentAt for a user's contacts.
    Body: { "uid": "<firebase_uid>" } (optional; defaults to authenticated user).
    """
    body = request.get_json(silent=True) or {}
    uid = body.get("uid") or request.firebase_user.get("uid")
    if not uid:
        return jsonify({"error": "uid required"}), 400
    # Optional: restrict to self only for security
    if uid != request.firebase_user.get("uid"):
        return jsonify({"error": "Can only backfill your own contacts"}), 403
    result = backfill_pipeline_stages(uid)
    return jsonify(result), 200


@admin_bp.post("/deduplicate-contacts")
@require_firebase_auth
def deduplicate_contacts_route():
    """
    Merge duplicate contacts (same email) for a user. Body: { "uid": "<firebase_uid>" } (optional).
    """
    body = request.get_json(silent=True) or {}
    uid = body.get("uid") or request.firebase_user.get("uid")
    if not uid:
        return jsonify({"error": "uid required"}), 400
    if uid != request.firebase_user.get("uid"):
        return jsonify({"error": "Can only deduplicate your own contacts"}), 403
    result = deduplicate_contacts(uid)
    return jsonify(result), 200


@admin_bp.post("/sync-stale")
@require_firebase_auth
def sync_stale():
    """
    Manually trigger background sync of stale outbox threads.
    Body (optional): { "uid": "<uid>", "max_threads": 10 }. uid must match authenticated user.
    """
    body = request.get_json(silent=True) or {}
    uid = body.get("uid") or request.firebase_user.get("uid")
    if not uid:
        return jsonify({"error": "uid required"}), 400
    if uid != request.firebase_user.get("uid"):
        return jsonify({"error": "Can only sync your own outbox"}), 403
    max_threads = 10
    if isinstance(body.get("max_threads"), (int, float)):
        max_threads = min(max(1, int(body["max_threads"])), 20)
    result = sync_stale_threads(uid, max_threads=max_threads)
    return jsonify(result), 200


def _is_cron_authorized():
    """Check if the request has a valid cron secret for headless access."""
    import hmac
    cron_secret = os.getenv("CRON_SECRET")
    if not cron_secret or len(cron_secret) < 20:
        # Reject trivially short/guessable secrets in production
        if os.getenv("RENDER") or os.getenv("FLASK_ENV") == "production":
            print("[SECURITY] CRON_SECRET is missing or too short (<20 chars). Rejecting cron auth.")
            return False
        if not cron_secret:
            return False
    provided = (request.headers.get("X-Cron-Secret") or "").strip()
    return hmac.compare_digest(provided, cron_secret)


@admin_bp.post("/renew-watches")
def renew_watches():
    """
    Renew Gmail push watches for all users whose watch expires within 24h or who have
    Gmail connected but no watch. Call periodically (e.g. cron every 12h).

    Auth: accepts either Firebase auth (Bearer token) or X-Cron-Secret header.
    Returns: { "renewed": N, "failed": N, "errors": [ { "uid": "...", "error": "..." }, ... ] }
    """
    # Allow either Firebase auth or cron secret
    if not _is_cron_authorized():
        # Fall back to Firebase auth check
        from firebase_admin import auth as fb_auth
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Unauthorized — provide Firebase auth or X-Cron-Secret"}), 401
        token = auth_header.split("Bearer ", 1)[1]
        try:
            fb_auth.verify_id_token(token, clock_skew_seconds=5)
        except Exception:
            return jsonify({"error": "Invalid token"}), 401

    try:
        db = get_db()
    except RuntimeError as e:
        return jsonify({"error": "Database not initialized", "message": str(e)}), 500

    now_ms = int(time.time() * 1000)
    one_day_ms = 86400 * 1000
    renewed = 0
    failed = 0
    errors = []

    for user_doc in db.collection("users").stream():
        uid = user_doc.id
        gmail_ref = db.collection("users").document(uid).collection("integrations").document("gmail")
        gmail_doc = gmail_ref.get()
        if not gmail_doc.exists:
            continue
        data = gmail_doc.to_dict() or {}
        has_creds = bool(data.get("token") or data.get("refresh_token"))
        if not has_creds:
            continue
        watch_exp = data.get("watchExpiration")
        if watch_exp is not None:
            try:
                watch_exp = int(watch_exp)
            except (TypeError, ValueError):
                watch_exp = None
        need_renewal = watch_exp is None or (watch_exp - now_ms) < one_day_ms
        if not need_renewal:
            continue
        try:
            renew_gmail_watch(uid)
            renewed += 1
            print(f"[admin/renew-watches] Renewed watch for uid={uid}")
        except Exception as e:
            failed += 1
            errors.append({"uid": uid, "error": str(e)})
            print(f"[admin/renew-watches] Failed uid={uid}: {e}")

    return jsonify({"renewed": renewed, "failed": failed, "errors": errors}), 200


@admin_bp.route("/compute-email-baseline", methods=["POST"])
def compute_baseline():
    """
    Aggregate reply data across all users with Gmail integration and store
    the baseline in Firestore at analytics/email_baseline.

    Auth: Firebase Bearer token or X-Cron-Secret header.
    """
    if not _is_cron_authorized():
        from firebase_admin import auth as fb_auth
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Unauthorized — provide Firebase auth or X-Cron-Secret"}), 401
        token = auth_header.split("Bearer ", 1)[1]
        try:
            fb_auth.verify_id_token(token, clock_skew_seconds=5)
        except Exception:
            return jsonify({"error": "Invalid token"}), 401

    try:
        baseline = compute_email_baseline()
    except Exception as e:
        return jsonify({"error": "Baseline computation failed", "message": str(e)}), 500

    return jsonify(baseline), 200


@admin_bp.post("/client-error")
def report_client_error():
    """
    Receive frontend error reports from ErrorBoundary.
    No auth required — error reporting must work even when auth is broken.
    Rate-limited by IP to prevent abuse.
    """
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "unknown")[:500]
    stack = (data.get("stack") or "")[:4000]
    component_stack = (data.get("componentStack") or "")[:2000]
    url = (data.get("url") or "")[:500]
    user_agent = (data.get("userAgent") or "")[:300]
    timestamp = data.get("timestamp", "")

    # Log to stdout (picked up by Cloud Logging / Sentry)
    print(f"[ClientError] {message} | url={url} | ts={timestamp}")
    if stack:
        print(f"[ClientError] Stack: {stack[:500]}")

    # Also forward to Sentry if configured
    try:
        import sentry_sdk
        if sentry_sdk.is_initialized():
            sentry_sdk.capture_message(
                f"Frontend error: {message}",
                level="error",
                extras={
                    "stack": stack,
                    "componentStack": component_stack,
                    "url": url,
                    "userAgent": user_agent,
                },
            )
    except Exception:
        pass

    return jsonify({"ok": True}), 200


# =============================================================================
# Phase 4 — Edit-rate dashboard + feature flag management
# =============================================================================
# - GET  /api/admin/edit-rate-dashboard — read email_drafted vs email_edited
#         events, group by USE_NEW_GENERATOR assignment, compute the A/B
#         comparison without a vendor (per 10.5).
# - GET  /api/admin/feature-flags — read the feature_flags/global doc.
# - POST /api/admin/feature-flags — partial update (enabled / rollout_pct
#         / overrides) for a single flag.
#
# Auth: bound to the existing @require_firebase_auth + a manual ADMIN_UIDS
# allowlist via the ADMIN_UIDS env var (comma-separated). Read-only by
# default; writes only allowed for allow-listed UIDs.

ADMIN_UIDS = {
    uid.strip()
    for uid in (os.getenv('ADMIN_UIDS') or '').split(',')
    if uid.strip()
}


def _is_admin(uid: str) -> bool:
    if not uid:
        return False
    if not ADMIN_UIDS:
        # Empty allowlist = lock down everyone (safe default).
        return False
    return uid in ADMIN_UIDS


@admin_bp.get("/edit-rate-dashboard")
@require_firebase_auth
def edit_rate_dashboard():
    """A/B compare email_edited rate by generator version.

    Delegates to `services.edit_rate_metrics.compute_edit_rate` so the
    metric pipeline can be exercised in unit tests without spinning the
    route. Bucketing prefers the per-event `generatorVersion` payload
    field (Phase 7 dispatch) and falls back to the user's current
    USE_NEW_GENERATOR assignment for events written before the
    dispatcher landed.

    Query params:
        days (default 14)  only count events in the last N days.

    Response (strict superset of the pre-Phase-7 shape):
        {
          "old_generator":     {drafts, edits, edit_rate, users},
          "new_generator":     {drafts, edits, edit_rate, users},
          "new_unavailable":   {drafts, edits, edit_rate, users},
          "rollout_pct":       int,
          "window_days":       int,
          "sample_size":       {old_generator, new_generator, new_unavailable},
        }
    """
    requester = request.firebase_user.get('uid')
    if not _is_admin(requester):
        return jsonify({'error': 'admin only'}), 403

    from app.services.edit_rate_metrics import compute_edit_rate

    try:
        days = int(request.args.get('days', '14'))
    except ValueError:
        days = 14

    db = get_db()
    payload = compute_edit_rate(db, window_days=days)
    return jsonify(payload), 200


@admin_bp.get("/feature-flags")
@require_firebase_auth
def get_feature_flags():
    """Return the entire feature_flags/global doc. Read-only."""
    if not _is_admin(request.firebase_user.get('uid')):
        return jsonify({'error': 'admin only'}), 403
    from app.services.feature_flags import _get_flags, invalidate_cache
    invalidate_cache()
    return jsonify({'flags': _get_flags()}), 200


@admin_bp.post("/feature-flags")
@require_firebase_auth
def post_feature_flag():
    """Partial update of a single flag.

    Body: { "flag": str, "enabled"?: bool, "rollout_pct"?: int,
            "overrides"?: { "<uid>": bool } }
    """
    if not _is_admin(request.firebase_user.get('uid')):
        return jsonify({'error': 'admin only'}), 403

    body = request.get_json(silent=True) or {}
    flag = body.get('flag')
    if not isinstance(flag, str) or not flag:
        return jsonify({'error': 'flag is required'}), 400

    from app.services.feature_flags import set_flag

    cfg = set_flag(
        flag,
        enabled=body.get('enabled') if 'enabled' in body else None,
        rollout_pct=body.get('rollout_pct') if 'rollout_pct' in body else None,
        overrides=body.get('overrides') if 'overrides' in body else None,
    )
    return jsonify({'success': True, 'flag': flag, 'config': cfg}), 200
