"""
Email Template API - save/load user default template + CRUD for saved custom templates.
"""
from flask import Blueprint, jsonify, request
from firebase_admin import firestore

from app.extensions import require_firebase_auth, require_tier, get_db
from email_templates import (
    get_available_presets,
    EMAIL_STYLE_PRESETS,
    EMAIL_PURPOSE_PRESETS,
)

EMAIL_TEMPLATE_MAX_CUSTOM_LEN = 4000
MAX_SAVED_TEMPLATES = 20
SIGNOFF_PHRASE_MAX_LEN = 50
SIGNATURE_BLOCK_MAX_LEN = 500
DEFAULT_SIGNOFF_PHRASE = "Best,"

VALID_PURPOSES = frozenset(EMAIL_PURPOSE_PRESETS.keys()) | {"custom"}
VALID_STYLE_PRESETS = frozenset(EMAIL_STYLE_PRESETS.keys())

email_template_bp = Blueprint("email_template", __name__, url_prefix="/api/email-template")


def _validate_body():
    """Validate POST body; returns (data, error_response). error_response is (jsonify_result, status) or None."""
    data = request.get_json(silent=True)
    if data is None:
        return None, (jsonify({"error": "Invalid or missing JSON body"}), 400)

    purpose = data.get("purpose")
    if purpose is not None and purpose not in VALID_PURPOSES:
        return None, (
            jsonify({"error": "Invalid purpose", "valid": sorted(VALID_PURPOSES)}),
            400,
        )

    style_preset = data.get("stylePreset")
    if style_preset is not None and style_preset not in VALID_STYLE_PRESETS:
        return None, (
            jsonify({"error": "Invalid stylePreset", "valid": sorted(VALID_STYLE_PRESETS)}),
            400,
        )

    custom_instructions = (data.get("customInstructions") or "").strip()
    if len(custom_instructions) > EMAIL_TEMPLATE_MAX_CUSTOM_LEN:
        return None, (
            jsonify({
                "error": f"customInstructions must be at most {EMAIL_TEMPLATE_MAX_CUSTOM_LEN} characters",
                "max": EMAIL_TEMPLATE_MAX_CUSTOM_LEN,
            }),
            400,
        )

    signoff_phrase = (data.get("signoffPhrase") or "").strip()
    if not signoff_phrase:
        signoff_phrase = DEFAULT_SIGNOFF_PHRASE
    signoff_phrase = signoff_phrase[:SIGNOFF_PHRASE_MAX_LEN]

    signature_block = (data.get("signatureBlock") or "").strip()[:SIGNATURE_BLOCK_MAX_LEN]

    return {
        "purpose": purpose,
        "stylePreset": style_preset,
        "customInstructions": custom_instructions[:EMAIL_TEMPLATE_MAX_CUSTOM_LEN],
        "signoffPhrase": signoff_phrase,
        "signatureBlock": signature_block,
        "name": (data.get("name") or "").strip()[:200],
        "subject": (data.get("subject") or "").strip()[:500],
        "savedTemplateId": (data.get("savedTemplateId") or "").strip() or None,
    }, None


@email_template_bp.route("", methods=["POST"])
@require_firebase_auth
def save_default():
    """Save the user's default email template."""
    try:
        db = get_db()
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500

    data, err = _validate_body()
    if err:
        return err

    uid = request.firebase_user["uid"]
    user_ref = db.collection("users").document(uid)

    email_template = {
        "purpose": data["purpose"],
        "stylePreset": data["stylePreset"],
        "customInstructions": data["customInstructions"],
        "signoffPhrase": data["signoffPhrase"],
        "signatureBlock": data["signatureBlock"],
        "name": data["name"],
        "subject": data["subject"],
        "savedTemplateId": data["savedTemplateId"],
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }
    user_ref.set({"emailTemplate": email_template}, merge=True)

    return jsonify({"success": True}), 200


@email_template_bp.route("", methods=["GET"])
@require_firebase_auth
def get_default():
    """Get the user's current default email template."""
    try:
        db = get_db()
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500

    uid = request.firebase_user["uid"]
    user_doc = db.collection("users").document(uid).get()

    if not user_doc.exists:
        return jsonify({
            "purpose": None,
            "stylePreset": None,
            "customInstructions": "",
            "signoffPhrase": DEFAULT_SIGNOFF_PHRASE,
            "signatureBlock": "",
            "name": "",
            "subject": "",
            "savedTemplateId": None,
        }), 200

    data = user_doc.to_dict() or {}
    template = data.get("emailTemplate") or {}

    return jsonify({
        "purpose": template.get("purpose"),
        "stylePreset": template.get("stylePreset"),
        "customInstructions": template.get("customInstructions", "") or "",
        "signoffPhrase": (template.get("signoffPhrase") or "").strip() or DEFAULT_SIGNOFF_PHRASE,
        "signatureBlock": template.get("signatureBlock", "") or "",
        "name": template.get("name", "") or "",
        "subject": template.get("subject", "") or "",
        "savedTemplateId": template.get("savedTemplateId"),
    }), 200


@email_template_bp.route("/presets", methods=["GET"])
@require_firebase_auth
def list_presets():
    """List all available style and purpose presets for the UI."""
    presets = get_available_presets()
    return jsonify(presets), 200


# ---------------------------------------------------------------------------
# Saved custom templates CRUD  (subcollection: users/{uid}/emailTemplates)
# ---------------------------------------------------------------------------

@email_template_bp.route("/saved", methods=["GET"])
@require_firebase_auth
@require_tier(['elite'])
def list_saved():
    """List all saved custom email templates for the user."""
    try:
        db = get_db()
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500

    uid = request.firebase_user["uid"]
    docs = (
        db.collection("users").document(uid)
        .collection("emailTemplates")
        .order_by("createdAt", direction=firestore.Query.DESCENDING)
        .limit(MAX_SAVED_TEMPLATES)
        .stream()
    )

    templates = []
    for doc in docs:
        d = doc.to_dict()
        created = d.get("createdAt")
        templates.append({
            "id": doc.id,
            "name": d.get("name", ""),
            "subject": d.get("subject", ""),
            "body": d.get("body", ""),
            "createdAt": created.isoformat() if hasattr(created, "isoformat") else str(created) if created else None,
        })

    return jsonify({"templates": templates}), 200


@email_template_bp.route("/saved", methods=["POST"])
@require_firebase_auth
@require_tier(['elite'])
def create_saved():
    """Create (or update) a saved custom email template."""
    try:
        db = get_db()
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()[:200]
    if not name:
        return jsonify({"error": "name is required"}), 400

    subject = (data.get("subject") or "").strip()[:500]
    body = (data.get("body") or "").strip()[:EMAIL_TEMPLATE_MAX_CUSTOM_LEN]

    uid = request.firebase_user["uid"]
    col_ref = db.collection("users").document(uid).collection("emailTemplates")

    template_id = (data.get("id") or "").strip()

    if template_id:
        col_ref.document(template_id).set({
            "name": name,
            "subject": subject,
            "body": body,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }, merge=True)
        return jsonify({"id": template_id}), 200

    doc_ref = col_ref.document()
    doc_ref.set({
        "name": name,
        "subject": subject,
        "body": body,
        "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    })
    return jsonify({"id": doc_ref.id}), 201


@email_template_bp.route("/saved/<template_id>", methods=["DELETE"])
@require_firebase_auth
@require_tier(['elite'])
def delete_saved(template_id):
    """Delete a saved custom email template."""
    try:
        db = get_db()
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500

    uid = request.firebase_user["uid"]
    db.collection("users").document(uid).collection("emailTemplates").document(template_id).delete()

    return jsonify({"success": True}), 200
