"""
Morning Briefing endpoint - Sprint 3A.

Single aggregation endpoint that returns replies, follow-ups, roadmap progress,
recruiting deadlines, and pipeline stats in one call.
"""
import logging
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from app.extensions import get_db, require_firebase_auth
from app.services.nudge_service import _get_eligible_contacts, DEFAULT_FOLLOWUP_DAYS
from app.services.outbox_service import get_outbox_stats
from app.services.networking_roadmap import (
    get_cached_roadmap,
    compute_roadmap_progress,
    RECRUITING_CALENDARS,
    _resolve_industry,
)
from app.utils.metrics_events import log_event

logger = logging.getLogger(__name__)

briefing_bp = Blueprint("briefing_bp", __name__)


def _get_unread_replies(db, uid: str, tier: str) -> list:
    """Get contacts with unread replies, including reply draft data for Pro/Elite."""
    contacts_ref = db.collection("users").document(uid).collection("contacts")
    results = []

    try:
        docs = list(
            contacts_ref
            .where("hasUnreadReply", "==", True)
            .limit(10)
            .stream()
        )
    except Exception:
        docs = []

    for doc in docs:
        data = doc.to_dict() or {}
        contact_name = (
            f"{data.get('firstName', '')} {data.get('lastName', '')}".strip()
            or data.get("name", "Unknown")
        )
        entry = {
            "contactId": doc.id,
            "contactName": contact_name,
            "company": data.get("company") or data.get("jobCompany") or "",
            "snippet": data.get("lastReplySnippet") or data.get("replySnippet") or "",
        }

        # Include reply draft for Pro/Elite
        if tier in ("pro", "elite"):
            try:
                draft_ref = db.collection("users").document(uid).collection("replyDrafts").document(doc.id)
                draft_doc = draft_ref.get()
                if draft_doc.exists:
                    draft_data = draft_doc.to_dict() or {}
                    entry["replyDraftBody"] = draft_data.get("draftBody") or ""
                    entry["replyDraftStatus"] = draft_data.get("status") or "pending"
            except Exception:
                pass

        results.append(entry)

    return results


def _get_follow_ups(db, uid: str) -> list:
    """Get top follow-up-eligible contacts."""
    try:
        eligible = _get_eligible_contacts(db, uid, followup_days=DEFAULT_FOLLOWUP_DAYS)
    except Exception:
        eligible = []

    results = []
    for contact in eligible[:5]:
        contact_name = (
            f"{contact.get('firstName', '')} {contact.get('lastName', '')}".strip()
            or contact.get("name", "Unknown")
        )
        # Calculate days since email
        days_since = DEFAULT_FOLLOWUP_DAYS
        from app.services.outbox_service import _parse_iso
        sent_at = _parse_iso(contact.get("emailGeneratedAt") or contact.get("emailSentAt"))
        if sent_at:
            if sent_at.tzinfo is None:
                sent_at = sent_at.replace(tzinfo=timezone.utc)
            days_since = (datetime.now(timezone.utc) - sent_at).days

        results.append({
            "contactId": contact.get("id", ""),
            "contactName": contact_name,
            "company": contact.get("company") or "",
            "daysSinceEmail": days_since,
        })

    return results


def _get_deadlines(user_data: dict) -> list:
    """Get upcoming recruiting deadlines based on user's career track."""
    professional = user_data.get("professionalInfo") or {}
    goals = user_data.get("goals") or {}
    career_track = (
        professional.get("careerTrack")
        or user_data.get("careerTrack")
        or goals.get("careerTrack")
        or ""
    )
    industry = _resolve_industry(career_track) or "Tech"
    calendar = RECRUITING_CALENDARS.get(industry, RECRUITING_CALENDARS["Tech"])

    now = datetime.now(timezone.utc)
    current_month = now.month

    # Map month names to numbers
    month_map = {
        "January": 1, "February": 2, "March": 3, "April": 4,
        "May": 5, "June": 6, "July": 7, "August": 8,
        "September": 9, "October": 10, "November": 11, "December": 12,
    }

    deadlines = []
    peak_start = month_map.get(calendar.get("peak_start", ""), 0)
    peak_end = month_map.get(calendar.get("peak_end", ""), 0)
    early_prep = month_map.get(calendar.get("early_prep", ""), 0)

    if early_prep and current_month <= early_prep:
        deadlines.append({
            "industry": industry,
            "event": f"Early prep starts ({calendar.get('early_prep')})",
            "date": calendar.get("early_prep", ""),
            "urgency": "upcoming" if abs(current_month - early_prep) <= 2 else "future",
        })

    if peak_start:
        deadlines.append({
            "industry": industry,
            "event": f"Peak recruiting opens ({calendar.get('peak_start')})",
            "date": calendar.get("peak_start", ""),
            "urgency": "urgent" if abs(current_month - peak_start) <= 1 else "upcoming",
        })

    if peak_end:
        deadlines.append({
            "industry": industry,
            "event": f"Applications close ({calendar.get('peak_end')})",
            "date": calendar.get("peak_end", ""),
            "urgency": "urgent" if current_month >= peak_start and current_month <= peak_end else "future",
        })

    return deadlines[:3]


@briefing_bp.route('/api/briefing', methods=['GET'])
@require_firebase_auth
def get_briefing():
    """Morning briefing aggregation endpoint."""
    try:
        return _get_briefing_inner()
    except Exception as e:
        logger.exception("Briefing endpoint error: %s", e)
        return jsonify({"error": "Internal server error", "detail": str(e)}), 500


def _get_briefing_inner():
    uid = request.firebase_user['uid']
    db = get_db()

    # Get user data for tier and profile info
    user_doc = db.collection("users").document(uid).get()
    user_data = user_doc.to_dict() if user_doc.exists else {}
    tier = user_data.get("subscriptionTier") or user_data.get("tier", "free")

    # Determine if new user (for empty states)
    created_at = user_data.get("createdAt")
    is_new_user = False
    if created_at:
        try:
            # createdAt may be a Firestore timestamp object or an ISO string
            if hasattr(created_at, 'timestamp'):
                # Firestore DatetimeWithNanoseconds
                created_dt = created_at.replace(tzinfo=timezone.utc) if created_at.tzinfo is None else created_at
            else:
                created_dt = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
            is_new_user = (datetime.now(timezone.utc) - created_dt).days <= 7
        except Exception:
            pass

    # Aggregate all sections
    replies = _get_unread_replies(db, uid, tier)
    follow_ups = _get_follow_ups(db, uid)

    # Roadmap progress (Pro/Elite only)
    roadmap_progress = None
    has_roadmap = False
    if tier in ("pro", "elite"):
        roadmap_progress = compute_roadmap_progress(uid)
        has_roadmap = roadmap_progress is not None

    # Pipeline stats
    try:
        pipeline_stats = get_outbox_stats(uid)
        total = pipeline_stats.get("total", 0)
        done_count = pipeline_stats.get("doneCount", 0)
        needs_attention = pipeline_stats.get("needsAttentionCount", 0)
        stats_summary = {
            "active": total - done_count,
            "needsAttention": needs_attention,
            "done": done_count,
            "totalContacts": total,
        }
    except Exception:
        stats_summary = {"active": 0, "needsAttention": 0, "done": 0, "totalContacts": 0}

    # Deadlines
    deadlines = _get_deadlines(user_data)

    # Determine content sections for metrics
    sections_with_content = []
    if replies:
        sections_with_content.append("replies")
    if follow_ups:
        sections_with_content.append("followUps")
    if roadmap_progress:
        sections_with_content.append("roadmapProgress")
    if deadlines:
        sections_with_content.append("deadlines")

    # Log briefing_viewed metric
    log_event(uid, "briefing_viewed", {"sections_with_content": sections_with_content})

    return jsonify({
        "replies": replies,
        "followUps": follow_ups,
        "roadmapProgress": roadmap_progress,
        "deadlines": deadlines,
        "pipelineStats": stats_summary,
        "meta": {
            "tier": tier,
            "hasRoadmap": has_roadmap,
            "hasContacts": stats_summary["totalContacts"] > 0,
            "isNewUser": is_new_user,
        },
    })
