"""
Loop notifications routes — prefs, unsubscribe, and Resend webhook.

Endpoints:
  GET  /api/loops/notifications/unsubscribe/<token>   (token IS auth)
  POST /api/loops/notifications/webhook/resend         (HMAC-verified)
  GET  /api/users/me/loop-alert-email                  (firebase auth)
  PATCH /api/users/me/loop-alert-email                 (firebase auth)
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging

from flask import Blueprint, jsonify, make_response, render_template_string, request

from app import config
from app.extensions import require_firebase_auth
from app.services.loop_alert_prefs import (
    disable_for_bounce,
    disable_for_complaint,
    get_loop_alert_email,
    set_loop_alert_email,
)
from app.services.loop_notifications import verify_unsubscribe_token

logger = logging.getLogger(__name__)

loop_notifications_bp = Blueprint("loop_notifications", __name__)


# ── Unsubscribe page ────────────────────────────────────────────────────────


_UNSUBSCRIBE_OK_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Unsubscribed</title>
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:Georgia,'Times New Roman',serif;color:#1A1A1A;min-height:100vh;display:flex;align-items:center;justify-content:center;">
  <main style="max-width:480px;padding:48px 32px;text-align:center;background:#FFFFFF;border:1px solid #E5E5E5;">
    <h1 style="font-style:italic;font-weight:400;font-size:28px;line-height:1.3;margin:0 0 16px 0;">You're unsubscribed.</h1>
    <p style="font-family:Georgia,serif;font-size:15px;color:#555555;line-height:1.5;margin:0 0 32px 0;">You won't receive loop digest emails. You can re-enable them anytime in your account settings.</p>
    <a href="https://offerloop.ai/account-settings" style="display:inline-block;padding:12px 24px;background:#1A1A1A;color:#FFFFFF;text-decoration:none;font-family:'Courier New',monospace;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;">Go to Account Settings</a>
  </main>
</body>
</html>"""

_UNSUBSCRIBE_EXPIRED_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Link expired</title>
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:Georgia,'Times New Roman',serif;color:#1A1A1A;min-height:100vh;display:flex;align-items:center;justify-content:center;">
  <main style="max-width:480px;padding:48px 32px;text-align:center;background:#FFFFFF;border:1px solid #E5E5E5;">
    <h1 style="font-style:italic;font-weight:400;font-size:28px;line-height:1.3;margin:0 0 16px 0;">This unsubscribe link expired.</h1>
    <p style="font-family:Georgia,serif;font-size:15px;color:#555555;line-height:1.5;margin:0 0 32px 0;">Manage your email preferences directly in account settings.</p>
    <a href="https://offerloop.ai/account-settings" style="display:inline-block;padding:12px 24px;background:#1A1A1A;color:#FFFFFF;text-decoration:none;font-family:'Courier New',monospace;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;">Go to Account Settings</a>
  </main>
</body>
</html>"""


def _wants_json() -> bool:
    accept = request.headers.get("Accept", "")
    return "application/json" in accept


@loop_notifications_bp.route(
    "/api/loops/notifications/unsubscribe/<token>", methods=["GET"]
)
def unsubscribe(token: str):
    """Token-authenticated unsubscribe (no Firebase auth — the token IS auth).

    Valid token → disables digest sends for the uid, returns the success page.
    Invalid/expired/tampered → 410 Gone with the friendly expiry page.
    """
    uid = verify_unsubscribe_token(token)
    if not uid:
        if _wants_json():
            return jsonify({"ok": False, "error": "expired_or_invalid"}), 410
        return make_response(_UNSUBSCRIBE_EXPIRED_HTML, 410, {"Content-Type": "text/html; charset=utf-8"})

    try:
        # Soft disable — keep deliveryStatus="ok" so we know this was a user
        # opt-out, not a deliverability problem.
        set_loop_alert_email(uid, {"enabled": False})
    except Exception:
        logger.exception("Failed to disable alerts for uid=%s on unsubscribe", uid)
        # We still claim success to the user — they don't care about our DB.

    if _wants_json():
        return jsonify({"ok": True, "uid": uid}), 200
    return make_response(_UNSUBSCRIBE_OK_HTML, 200, {"Content-Type": "text/html; charset=utf-8"})


# ── Resend webhook ──────────────────────────────────────────────────────────


def _verify_resend_signature(body: bytes, header_sig: str) -> bool:
    """Verify an HMAC-SHA256 of the raw body against the configured secret.

    Production Resend uses svix-style signatures; this scaffold accepts a
    simple HMAC-SHA256 hex digest in `X-Resend-Signature`. PR3 can swap in
    full svix verification when we go live.
    """
    secret = config.RESEND_WEBHOOK_SECRET
    if not secret:
        # If no secret is configured, reject everything (closed by default).
        return False
    expected = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, (header_sig or "").strip())


@loop_notifications_bp.route(
    "/api/loops/notifications/webhook/resend", methods=["POST"]
)
def resend_webhook():
    """Inbound bounce/complaint events from Resend.

    Always returns 200 (even no-ops) so Resend doesn't retry forever on
    benign cases. Logs every reject. Maps:
      email.bounced     → disable_for_bounce
      email.complained  → disable_for_complaint
    """
    raw = request.get_data(cache=False) or b""
    sig = request.headers.get("X-Resend-Signature", "")
    if not _verify_resend_signature(raw, sig):
        logger.warning("Resend webhook signature verification failed")
        return jsonify({"ok": False, "error": "bad_signature"}), 401

    try:
        event = json.loads(raw.decode("utf-8")) if raw else {}
    except (UnicodeDecodeError, json.JSONDecodeError):
        logger.warning("Resend webhook body not valid JSON")
        return jsonify({"ok": True, "noop": "bad_body"}), 200

    event_type = (event.get("type") or "").strip()
    data = event.get("data") or {}
    uid = data.get("uid") or (data.get("metadata") or {}).get("uid")

    if not uid:
        # No uid → we have nothing to update. Don't error — log and accept.
        logger.info("Resend webhook had no uid metadata (type=%s)", event_type)
        return jsonify({"ok": True, "noop": "no_uid"}), 200

    try:
        if event_type == "email.bounced":
            disable_for_bounce(uid)
        elif event_type == "email.complained":
            disable_for_complaint(uid)
        else:
            logger.info("Resend webhook ignored event type=%s uid=%s", event_type, uid)
    except Exception:
        logger.exception("Resend webhook failed to apply (type=%s uid=%s)", event_type, uid)

    return jsonify({"ok": True}), 200


# ── User prefs CRUD ─────────────────────────────────────────────────────────


@loop_notifications_bp.route("/api/users/me/loop-alert-email", methods=["GET"])
@require_firebase_auth
def get_my_loop_alert_email():
    uid = request.firebase_user["uid"]
    return jsonify(get_loop_alert_email(uid))


@loop_notifications_bp.route("/api/users/me/loop-alert-email", methods=["PATCH"])
@require_firebase_auth
def patch_my_loop_alert_email():
    uid = request.firebase_user["uid"]
    payload = request.get_json(silent=True) or {}
    try:
        merged = set_loop_alert_email(uid, payload)
    except ValueError as exc:
        return jsonify({"error": "invalid_payload", "message": str(exc)}), 400
    return jsonify(merged)
