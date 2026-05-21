"""
Weekly metrics aggregation script.

Computes:
  - Reply rate: count(reply_received) / count(email_actually_sent) over past 7 days
  - Conversion rate: users who upgraded from free in past 30 days / total free users

Writes to metrics_weekly/{YYYY-WXX} Firestore doc.

Usage:
    python backend/scripts/aggregate_metrics.py
"""
import os
import sys
from datetime import datetime, timedelta, timezone

# Allow running from repo root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import firebase_admin
from firebase_admin import credentials, firestore


def get_db():
    """Initialize Firebase and return Firestore client."""
    if not firebase_admin._apps:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if cred_path:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
        else:
            firebase_admin.initialize_app()
    return firestore.client()


def compute_reply_rate(db, since):
    """Reply rate = reply_received / email_actually_sent over the window."""
    sent_query = (
        db.collection("metrics_events")
        .where("event_type", "==", "email_actually_sent")
        .where("timestamp", ">=", since)
    )
    sent_count = sum(1 for _ in sent_query.stream())

    reply_query = (
        db.collection("metrics_events")
        .where("event_type", "==", "reply_received")
        .where("timestamp", ">=", since)
    )
    reply_count = sum(1 for _ in reply_query.stream())

    rate = round(reply_count / sent_count, 4) if sent_count > 0 else 0.0
    return {"reply_count": reply_count, "sent_count": sent_count, "reply_rate": rate}


def compute_conversion_rate(db, since_30d):
    """Conversion rate = users upgraded in past 30 days / total free users."""
    users_ref = db.collection("users")

    # Count free-tier users
    free_count = 0
    upgraded_count = 0

    for doc in users_ref.stream():
        data = doc.to_dict() or {}
        tier = data.get("subscriptionTier") or data.get("tier") or "free"
        if tier == "free":
            free_count += 1
        elif tier in ("pro", "elite"):
            # Check if they upgraded recently
            upgraded_at = data.get("subscriptionUpdatedAt") or data.get("tierChangedAt")
            if upgraded_at:
                try:
                    if hasattr(upgraded_at, "timestamp"):
                        dt = upgraded_at
                    else:
                        dt = datetime.fromisoformat(str(upgraded_at).replace("Z", "+00:00"))
                    if dt >= since_30d:
                        upgraded_count += 1
                except Exception:
                    pass

    total_free_base = free_count + upgraded_count
    rate = round(upgraded_count / total_free_base, 4) if total_free_base > 0 else 0.0
    return {
        "upgraded_count": upgraded_count,
        "free_count": free_count,
        "total_free_base": total_free_base,
        "conversion_rate": rate,
    }


def main():
    db = get_db()
    now = datetime.now(timezone.utc)

    # Week label: ISO year and week number
    iso_year, iso_week, _ = now.isocalendar()
    week_label = f"{iso_year}-W{iso_week:02d}"

    since_7d = now - timedelta(days=7)
    since_30d = now - timedelta(days=30)

    print(f"Aggregating metrics for week {week_label}...")

    reply_data = compute_reply_rate(db, since_7d)
    print(f"  Reply rate: {reply_data['reply_count']}/{reply_data['sent_count']} = {reply_data['reply_rate']}")

    conversion_data = compute_conversion_rate(db, since_30d)
    print(f"  Conversion rate: {conversion_data['upgraded_count']}/{conversion_data['total_free_base']} = {conversion_data['conversion_rate']}")

    doc_data = {
        "week": week_label,
        "computed_at": now.isoformat(),
        "reply_rate": reply_data,
        "conversion_rate": conversion_data,
    }

    db.collection("metrics_weekly").document(week_label).set(doc_data)
    print(f"Written to metrics_weekly/{week_label}")


if __name__ == "__main__":
    main()
