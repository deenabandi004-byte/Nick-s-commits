"""
Dashboard statistics and analytics routes
"""
from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta
from collections import defaultdict
from app.extensions import get_db, require_firebase_auth
from app.services.gmail_client import _load_user_gmail_creds, _gmail_service, get_thread_messages

dashboard_bp = Blueprint('dashboard', __name__, url_prefix='/api/dashboard')


def _get_month_key(date_str):
    """Convert ISO date string to 'YYYY-MM' format"""
    try:
        dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        return dt.strftime('%Y-%m')
    except:
        return None


@dashboard_bp.get("/stats")
@require_firebase_auth
def get_dashboard_stats():
    """Get comprehensive dashboard statistics"""
    try:
        db = get_db()
        uid = request.firebase_user["uid"]
        
        # Get all contacts
        contacts_ref = db.collection("users").document(uid).collection("contacts")
        contacts = list(contacts_ref.stream())
        
        # Initialize stats
        outreach_by_month = defaultdict(lambda: {"outreach": 0, "replies": 0})
        total_sent = 0
        total_replies = 0
        firms_by_name = defaultdict(lambda: {"contacts": 0, "replies": 0})
        
        # Get Gmail service for checking threads
        gmail_service = None
        try:
            creds = _load_user_gmail_creds(uid)
            if creds:
                gmail_service = _gmail_service(creds)
        except Exception as e:
            print(f"⚠️ Could not initialize Gmail service: {e}")
        
        # Process contacts
        for contact_doc in contacts:
            data = contact_doc.to_dict()
            
            # Check if contact has email sent (has draft or thread)
            has_draft = bool(
                data.get("gmailDraftId") or 
                data.get("gmail_draft_id") or 
                data.get("gmailDraftUrl")
            )
            has_thread = bool(data.get("gmailThreadId") or data.get("gmail_thread_id"))
            
            if has_draft or has_thread:
                total_sent += 1
                
                # Get date when email was sent (draftCreatedAt or lastActivityAt)
                sent_date = (
                    data.get("draftCreatedAt") or 
                    data.get("lastActivityAt") or 
                    data.get("createdAt")
                )
                
                if sent_date:
                    month_key = _get_month_key(sent_date)
                    if month_key:
                        outreach_by_month[month_key]["outreach"] += 1
                
                # Check if there's a reply
                has_reply = bool(
                    data.get("hasUnreadReply") or 
                    data.get("threadStatus") in ["new_reply", "waiting_on_you"] or
                    (data.get("threadStatus") and "reply" in data.get("threadStatus", "").lower())
                )
                
                if has_reply:
                    total_replies += 1
                    if sent_date:
                        month_key = _get_month_key(sent_date)
                        if month_key:
                            outreach_by_month[month_key]["replies"] += 1
                
                # Track firms
                company = data.get("company") or ""
                if company:
                    firms_by_name[company]["contacts"] += 1
                    if has_reply:
                        firms_by_name[company]["replies"] += 1
        
        # Format outreach by month (last 6 months)
        now = datetime.now()
        months_data = []
        for i in range(5, -1, -1):  # Last 6 months
            month_date = now - timedelta(days=30 * i)
            month_key = month_date.strftime('%Y-%m')
            month_name = month_date.strftime('%b')
            months_data.append({
                "month": month_name,
                "outreach": outreach_by_month[month_key]["outreach"],
                "replies": outreach_by_month[month_key]["replies"]
            })
        
        # Calculate response rate
        response_rate = (total_replies / total_sent * 100) if total_sent > 0 else 0
        
        # Get top firms (by contact count)
        top_firms_list = sorted(
            [
                {
                    "name": name,
                    "contacts": stats["contacts"],
                    "replyRate": (stats["replies"] / stats["contacts"] * 100) if stats["contacts"] > 0 else 0
                }
                for name, stats in firms_by_name.items()
            ],
            key=lambda x: x["contacts"],
            reverse=True
        )[:5]  # Top 5
        
        return jsonify({
            "outreachByMonth": months_data,
            "replyStats": {
                "totalReplies": total_replies,
                "responseRate": round(response_rate, 1),
                "totalSent": total_sent
            },
            "topFirms": top_firms_list
        }), 200
        
    except Exception as e:
        print(f"❌ Error getting dashboard stats: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@dashboard_bp.get("/recommendations")
@require_firebase_auth
def get_recommendations():
    """Get AI-generated personalized recommendations"""
    try:
        db = get_db()
        uid = request.firebase_user["uid"]
        
        recommendations = []
        
        # Get all contacts
        contacts_ref = db.collection("users").document(uid).collection("contacts")
        contacts = list(contacts_ref.stream())
        
        # 1. Check for contacts needing follow-up (sent > 3 days ago, no reply)
        now = datetime.utcnow()
        for contact_doc in contacts:
            data = contact_doc.to_dict()
            
            # Check if has draft/thread but no reply
            has_draft = bool(data.get("gmailDraftId") or data.get("gmailDraftUrl"))
            has_thread = bool(data.get("gmailThreadId"))
            has_reply = bool(
                data.get("hasUnreadReply") or 
                data.get("threadStatus") in ["new_reply", "waiting_on_you"]
            )
            
            if (has_draft or has_thread) and not has_reply:
                # Check last activity date
                last_activity = data.get("lastActivityAt") or data.get("draftCreatedAt")
                if last_activity:
                    try:
                        last_date = datetime.fromisoformat(last_activity.replace('Z', '+00:00'))
                        days_ago = (now - last_date.replace(tzinfo=None)).days
                        
                        if days_ago >= 3:
                            contact_name = (
                                f"{data.get('firstName', '')} {data.get('lastName', '')}".strip() or
                                data.get('email', '').split('@')[0]
                            )
                            company = data.get('company', 'Unknown Company')
                            
                            recommendations.append({
                                "type": "follow_up",
                                "title": f"Follow up with {contact_name} at {company}",
                                "description": f"You reached out {days_ago} days ago - a follow-up could help",
                                "action": "Draft follow-up",
                                "contactId": contact_doc.id,
                                "priority": "high"
                            })
                    except:
                        pass
        
        # 2. Check for unread replies
        unread_replies = [
            doc for doc in contacts
            if doc.to_dict().get("hasUnreadReply") or 
            doc.to_dict().get("threadStatus") == "new_reply"
        ]
        
        if unread_replies:
            company_names = [doc.to_dict().get("company", "contacts") for doc in unread_replies[:2]]
            companies_str = " and ".join(company_names) if len(company_names) <= 2 else f"{company_names[0]} and {len(unread_replies) - 1} others"
            
            recommendations.append({
                "type": "unread_replies",
                "title": f"You have {len(unread_replies)} unread {'reply' if len(unread_replies) == 1 else 'replies'} to review",
                "description": f"Recent responses from {companies_str}",
                "action": "View replies",
                "contactIds": [doc.id for doc in unread_replies],
                "priority": "high"
            })
        
        # 3. Get top firms for "next steps" recommendation
        # This would ideally use firm search history, but for now we'll use contacts
        firms_by_name = defaultdict(int)
        for contact_doc in contacts:
            company = contact_doc.to_dict().get("company")
            if company:
                firms_by_name[company] += 1
        
        if firms_by_name:
            top_firms = sorted(firms_by_name.items(), key=lambda x: x[1], reverse=True)[:5]
            if len(top_firms) >= 3:
                recommendations.append({
                    "type": "explore_firms",
                    "title": "Students like you often target these firms next",
                    "description": f"Based on your search history: {', '.join([f[0] for f in top_firms[:3]])}",
                    "action": "Explore firms",
                    "priority": "medium"
                })
        
        # Sort by priority (high first)
        recommendations.sort(key=lambda x: {"high": 0, "medium": 1, "low": 2}.get(x.get("priority", "low"), 2))
        
        # Limit to 3 recommendations
        return jsonify({
            "recommendations": recommendations[:3]
        }), 200
        
    except Exception as e:
        print(f"❌ Error getting recommendations: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@dashboard_bp.get("/firm-locations")
@require_firebase_auth
def get_firm_locations():
    """Get firm locations for map visualization"""
    try:
        db = get_db()
        uid = request.firebase_user["uid"]
        
        # Get all contacts
        contacts_ref = db.collection("users").document(uid).collection("contacts")
        contacts = list(contacts_ref.stream())
        
        # Aggregate by firm and location
        firms_by_location = defaultdict(lambda: {
            "name": "",
            "city": "",
            "state": "",
            "contacts": 0,
            "locations": set()
        })
        
        for contact_doc in contacts:
            data = contact_doc.to_dict()
            company = data.get("company") or ""
            location_str = data.get("location") or ""
            
            if company and location_str:
                # Parse location (format: "City, State" or "City, ST")
                parts = location_str.split(",")
                if len(parts) >= 2:
                    city = parts[0].strip()
                    state = parts[1].strip()
                    
                    # Use company+location as key
                    key = f"{company}|{city}|{state}"
                    firms_by_location[key]["name"] = company
                    firms_by_location[key]["city"] = city
                    firms_by_location[key]["state"] = state
                    firms_by_location[key]["contacts"] += 1
                    firms_by_location[key]["locations"].add((city, state))
        
        # Convert to list and add approximate coordinates
        # Note: This is a simplified mapping. For production, use a geocoding service
        state_coords = {
            "NY": {"x": 82, "y": 35},
            "CA": {"x": 15, "y": 42},
            "MA": {"x": 85, "y": 32},
            "IL": {"x": 62, "y": 38},
            "TX": {"x": 54, "y": 68},
            "FL": {"x": 78, "y": 72},
        }
        
        locations = []
        for key, firm_data in firms_by_location.items():
            state = firm_data["state"]
            # Get first 2 letters of state (handle "New York" -> "NY")
            state_abbr = state[:2].upper() if len(state) <= 2 else state.split()[0][:2] if " " in state else state[:2]
            
            coords = state_coords.get(state_abbr, {"x": 50, "y": 40})  # Default center
            
            locations.append({
                "name": firm_data["name"],
                "city": firm_data["city"],
                "state": state,
                "contacts": firm_data["contacts"],
                "coordinates": coords
            })
        
        # Sort by contact count
        locations.sort(key=lambda x: x["contacts"], reverse=True)
        
        return jsonify({
            "locations": locations[:20]  # Top 20 locations
        }), 200
        
    except Exception as e:
        print(f"❌ Error getting firm locations: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


