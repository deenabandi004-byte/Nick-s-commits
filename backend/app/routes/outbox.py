"""
Outbox / Network Tracker routes — thin routing layer.
All business logic lives in app.services.outbox_service.
"""
import logging

from flask import Blueprint, jsonify, request

from app.extensions import require_firebase_auth
from app.services.outbox_service import (
    archive_contact,
    clear_unread_reply,
    get_contact_thread_messages,
    get_outbox_contacts,
    get_outbox_stats,
    get_recent_outbox_contacts,
    mark_contact_resolution,
    mark_contact_won,
    send_reply_for_contact,
    snooze_contact,
    sync_contact_thread,
    unarchive_contact,
    update_contact_stage,
)

logger = logging.getLogger(__name__)

outbox_bp = Blueprint("outbox", __name__, url_prefix="/api/outbox")


@outbox_bp.get("/threads")
@require_firebase_auth
def list_threads():
    uid = request.firebase_user["uid"]
    limit_str = request.args.get("limit", "")
    if limit_str.isdigit() and int(limit_str) > 0:
        contacts = get_recent_outbox_contacts(uid, limit=min(int(limit_str), 200))
    else:
        include_archived = request.args.get("include_archived", "").lower() == "true"
        contacts = get_outbox_contacts(uid, include_archived=include_archived)
    return jsonify({"threads": contacts}), 200


@outbox_bp.get("/stats")
@require_firebase_auth
def outbox_stats():
    uid = request.firebase_user["uid"]
    stats = get_outbox_stats(uid)
    return jsonify(stats), 200


@outbox_bp.put("/threads/<contact_id>/stage")
@require_firebase_auth
def update_stage(contact_id):
    uid = request.firebase_user["uid"]
    body = request.get_json(silent=True) or {}
    new_stage = body.get("stage", "").strip()
    if not new_stage:
        return jsonify({"error": "Missing 'stage' in request body"}), 400
    try:
        contact = update_contact_stage(uid, contact_id, new_stage)
    except ValueError as e:
        msg = str(e)
        if msg == "contact_not_found":
            return jsonify({"error": "Contact not found"}), 404
        return jsonify({"error": msg}), 400
    return jsonify({"thread": contact}), 200


@outbox_bp.post("/threads/<contact_id>/send-reply")
@require_firebase_auth
def send_reply(contact_id):
    uid = request.firebase_user["uid"]
    payload = request.get_json(silent=True) or {}
    body = (payload.get("body") or "").strip()
    if not body:
        return jsonify({"error": "Reply body is required"}), 400
    try:
        contact = send_reply_for_contact(uid, contact_id, body)
    except ValueError as e:
        msg = str(e)
        if msg == "contact_not_found":
            return jsonify({"error": "Contact not found"}), 404
        if msg == "missing_recipient":
            return jsonify({"error": "Contact has no email address"}), 400
        if msg == "gmail_disconnected":
            return jsonify({"error": "Connect Gmail to send replies"}), 400
        return jsonify({"error": msg}), 400
    except Exception as e:
        logger.exception("[outbox] send-reply failed contact=%s", contact_id)
        return jsonify({"error": str(e) or "Gmail send failed"}), 500
    return jsonify({"thread": contact}), 200


@outbox_bp.get("/threads/<contact_id>/messages")
@require_firebase_auth
def list_thread_messages(contact_id):
    uid = request.firebase_user["uid"]
    try:
        result = get_contact_thread_messages(uid, contact_id)
    except ValueError as e:
        if str(e) == "contact_not_found":
            return jsonify({"error": "Contact not found"}), 404
        return jsonify({"error": str(e)}), 400
    return jsonify(result), 200


@outbox_bp.post("/threads/<contact_id>/sync")
@require_firebase_auth
def sync_thread(contact_id):
    uid = request.firebase_user["uid"]
    try:
        contact = sync_contact_thread(uid, contact_id)
    except ValueError as e:
        if str(e) == "contact_not_found":
            return jsonify({"error": "Contact not found"}), 404
        return jsonify({"error": str(e)}), 400
    return jsonify({"thread": contact}), 200


@outbox_bp.post("/threads/<contact_id>/mark-read")
@require_firebase_auth
def mark_read(contact_id):
    uid = request.firebase_user["uid"]
    try:
        contact = clear_unread_reply(uid, contact_id)
    except ValueError as e:
        if str(e) == "contact_not_found":
            return jsonify({"error": "Contact not found"}), 404
        return jsonify({"error": str(e)}), 400
    return jsonify({"thread": contact}), 200


@outbox_bp.post("/threads/<contact_id>/archive")
@require_firebase_auth
def archive(contact_id):
    uid = request.firebase_user["uid"]
    try:
        contact = archive_contact(uid, contact_id)
    except ValueError as e:
        if str(e) == "contact_not_found":
            return jsonify({"error": "Contact not found"}), 404
        return jsonify({"error": str(e)}), 400
    return jsonify({"thread": contact}), 200


@outbox_bp.post("/threads/<contact_id>/unarchive")
@require_firebase_auth
def unarchive(contact_id):
    uid = request.firebase_user["uid"]
    try:
        contact = unarchive_contact(uid, contact_id)
    except ValueError as e:
        if str(e) == "contact_not_found":
            return jsonify({"error": "Contact not found"}), 404
        return jsonify({"error": str(e)}), 400
    return jsonify({"thread": contact}), 200


@outbox_bp.post("/threads/<contact_id>/snooze")
@require_firebase_auth
def snooze(contact_id):
    uid = request.firebase_user["uid"]
    body = request.get_json(silent=True) or {}
    snooze_until = body.get("snoozeUntil", "").strip()
    if not snooze_until:
        return jsonify({"error": "Missing 'snoozeUntil' in request body"}), 400
    try:
        contact = snooze_contact(uid, contact_id, snooze_until)
    except ValueError as e:
        if str(e) == "contact_not_found":
            return jsonify({"error": "Contact not found"}), 404
        return jsonify({"error": str(e)}), 400
    return jsonify({"thread": contact}), 200


@outbox_bp.post("/threads/<contact_id>/won")
@require_firebase_auth
def won(contact_id):
    uid = request.firebase_user["uid"]
    body = request.get_json(silent=True) or {}
    details = body.get("resolutionDetails")
    try:
        contact = mark_contact_won(uid, contact_id, resolution_details=details)
    except ValueError as e:
        if str(e) == "contact_not_found":
            return jsonify({"error": "Contact not found"}), 404
        return jsonify({"error": str(e)}), 400
    return jsonify({"thread": contact}), 200


@outbox_bp.post("/threads/<contact_id>/resolution")
@require_firebase_auth
def resolution(contact_id):
    uid = request.firebase_user["uid"]
    body = request.get_json(silent=True) or {}
    res = body.get("resolution", "").strip()
    if not res:
        return jsonify({"error": "Missing 'resolution' in request body"}), 400
    details = body.get("details")
    try:
        contact = mark_contact_resolution(uid, contact_id, res, details=details)
    except ValueError as e:
        msg = str(e)
        if msg == "contact_not_found":
            return jsonify({"error": "Contact not found"}), 404
        return jsonify({"error": msg}), 400
    return jsonify({"thread": contact}), 200
