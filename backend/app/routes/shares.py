"""Contact / company / hiring-manager sharing between users."""
from datetime import datetime
from flask import Blueprint, request, jsonify

from ..extensions import require_firebase_auth, require_tier, get_db

shares_bp = Blueprint("shares", __name__, url_prefix="/api/shares")

VALID_KINDS = ("contacts", "companies", "hiringManagers")
_SUBCOLLECTION = {
    "contacts": "contacts",
    "companies": "manual_firms",
    "hiringManagers": "recruiters",
}


def _now_z():
    return datetime.utcnow().isoformat() + "Z"


def _resolve_recipient(db, email):
    """Return (uid, display_name) for a user with this email, else (None, None)."""
    email = (email or "").strip().lower()
    if not email:
        return None, None
    docs = list(
        db.collection("users").where("email", "==", email).limit(1).stream()
    )
    if not docs:
        return None, None
    data = docs[0].to_dict() or {}
    return docs[0].id, (data.get("name") or data.get("email") or "Someone")


@shares_bp.route("", methods=["POST"])
@require_firebase_auth
def create_share():
    db = get_db()
    from_uid = request.firebase_user["uid"]
    data = request.get_json(silent=True) or {}

    to_email = (data.get("toEmail") or "").strip().lower()
    kind = data.get("kind")
    items = data.get("items")

    if kind not in VALID_KINDS:
        return jsonify({"error": "Invalid kind."}), 400
    if not isinstance(items, list) or not items:
        return jsonify({"error": "No items to share."}), 400
    if not to_email:
        return jsonify({"error": "Recipient email required."}), 400

    # Sender's own profile (for fromName)
    me = db.collection("users").document(from_uid).get()
    me_data = me.to_dict() if me and me.exists else {}
    from_name = me_data.get("name") or me_data.get("email") or "Someone"

    if to_email == (me_data.get("email") or "").strip().lower():
        return jsonify({"error": "You can't share to yourself."}), 400

    to_uid, to_name = _resolve_recipient(db, to_email)
    if not to_uid:
        return jsonify({"error": "Not an Offerloop account."}), 404

    share = {
        "fromUid": from_uid,
        "fromName": from_name,
        "toUid": to_uid,
        "toEmail": to_email,
        "kind": kind,
        "items": items,
        "status": "pending",
        "createdAt": _now_z(),
    }
    ref = db.collection("pendingShares").add(share)
    share_id = ref[1].id
    return jsonify({"shareId": share_id, "toName": to_name}), 201


def _load_owned_pending(db, uid, share_id):
    """Return (ref, data) for a pending share owned by uid, else (None, None)."""
    ref = db.collection("pendingShares").document(share_id)
    snap = ref.get()
    if not snap or not snap.exists:
        return None, None
    data = snap.to_dict() or {}
    if data.get("toUid") != uid or data.get("status") != "pending":
        return None, None
    return ref, data


@shares_bp.route("/<share_id>/accept", methods=["POST"])
@require_firebase_auth
@require_tier(["pro", "elite"])
def accept_share(share_id):
    db = get_db()
    uid = request.firebase_user["uid"]
    ref, data = _load_owned_pending(db, uid, share_id)
    if not ref:
        return jsonify({"error": "Share not found."}), 404

    kind = data.get("kind")
    items = data.get("items") or []
    if kind not in VALID_KINDS:
        return jsonify({"error": "Invalid share."}), 400
    sub = _SUBCOLLECTION[kind]

    dest = db.collection("users").document(uid).collection(sub)
    batch = db.batch()
    for item in items:
        doc = dict(item)
        doc["sharedImport"] = True
        doc["createdAt"] = _now_z()
        doc.setdefault("status", "Not Contacted")
        batch.set(dest.document(), doc)
    batch.set(ref, {"status": "accepted", "acceptedAt": _now_z()}, merge=True)
    batch.commit()

    return jsonify({"imported": len(items), "kind": kind}), 200


@shares_bp.route("/<share_id>/decline", methods=["POST"])
@require_firebase_auth
def decline_share(share_id):
    db = get_db()
    uid = request.firebase_user["uid"]
    ref, data = _load_owned_pending(db, uid, share_id)
    if not ref:
        return jsonify({"error": "Share not found."}), 404
    ref.set({"status": "declined", "declinedAt": _now_z()}, merge=True)
    return jsonify({"ok": True}), 200


@shares_bp.route("/pending", methods=["GET"])
@require_firebase_auth
def list_pending():
    db = get_db()
    uid = request.firebase_user["uid"]
    docs = (
        db.collection("pendingShares")
        .where("toUid", "==", uid)
        .where("status", "==", "pending")
        .stream()
    )
    out = []
    for d in docs:
        data = d.to_dict() or {}
        out.append({
            "id": d.id,
            "fromName": data.get("fromName", "Someone"),
            "kind": data.get("kind", "contacts"),
            "count": len(data.get("items") or []),
            "createdAt": data.get("createdAt"),
        })
    return jsonify({"shares": out}), 200
