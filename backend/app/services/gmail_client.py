"""
Gmail client service - OAuth credentials management and Gmail API operations
"""
import os
import base64
import pickle
from datetime import datetime
from email.mime.text import MIMEText
import requests
from googleapiclient.discovery import build
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google.oauth2 import service_account
from google.cloud.firestore_v1 import FieldFilter

from app.config import (
    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_SCOPES, OAUTH_REDIRECT_URI,
    GOOGLE_SERVICE_ACCOUNT_FILE, GOOGLE_SERVICE_ACCOUNT_EMAIL,
    GMAIL_PUBSUB_TOPIC,
)
from app.extensions import get_db


def _gmail_client_config():
    """Get Gmail OAuth client configuration"""
    return {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "project_id": "offerloop-native",
            "auth_uri": "https://accounts.google.com/o/oauth2/v2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uris": [OAUTH_REDIRECT_URI],
        }
    }


def clear_user_gmail_integration(uid):
    """Clear Gmail integration for a user so gmail/status reflects disconnected state."""
    db = get_db()
    if not db:
        return
    ref = db.collection("users").document(uid).collection("integrations").document("gmail")
    ref.delete()
    print(f"[GmailClient] Cleared Gmail integration")


def _save_user_gmail_creds(uid, creds):
    """Save user Gmail credentials to Firestore"""
    db = get_db()
    if not db:
        return
    
    data = {
        "token": creds.token,
        "refresh_token": getattr(creds, "refresh_token", None),
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        # Do NOT store client_secret per-user - it's an app-level secret read from env vars.
        "scopes": creds.scopes,
        "expiry": creds.expiry.isoformat() if getattr(creds, "expiry", None) else None,
        "updatedAt": datetime.utcnow(),  # TODO: deprecated in Python 3.12
    }
    db.collection("users").document(uid).collection("integrations").document("gmail").set(data, merge=True)


def _load_user_gmail_creds(uid):
    """Load user Gmail credentials from Firestore with automatic token refresh"""
    db = get_db()
    if not db:
        print("❌ Database not available")
        return None
    
    snap = db.collection("users").document(uid).collection("integrations").document("gmail").get()
    if not snap.exists:
        print(f"[GmailClient] No Gmail credentials found")
        return None

    data = snap.to_dict() or {}

    # Check if we have required data
    if not data.get("token"):
        print(f"[GmailClient] No access token found")
        return None

    if not data.get("refresh_token"):
        print(f"[GmailClient] WARNING: No refresh token found - token cannot be refreshed!")
    
    # Create credentials object
    try:
        # Parse expiry if it exists
        expiry = None
        expiry_str = data.get("expiry")
        if expiry_str:
            try:
                # Parse ISO format string back to datetime
                # Handle both with and without timezone info
                if isinstance(expiry_str, str):
                    # Remove 'Z' suffix if present and replace with +00:00 for fromisoformat
                    expiry_str_clean = expiry_str.replace('Z', '+00:00')
                    expiry = datetime.fromisoformat(expiry_str_clean)
                    # Ensure expiry is timezone-aware (UTC) for proper comparison
                    if expiry.tzinfo is None:
                        from datetime import timezone
                        expiry = expiry.replace(tzinfo=timezone.utc)
                elif isinstance(expiry_str, datetime):
                    expiry = expiry_str
                    # Ensure expiry is timezone-aware (UTC) for proper comparison
                    if expiry.tzinfo is None:
                        from datetime import timezone
                        expiry = expiry.replace(tzinfo=timezone.utc)
            except (ValueError, TypeError, AttributeError) as e:
                print(f"⚠️ Could not parse expiry '{expiry_str}': {e}")
                # If parsing fails, expiry will be None and token will be checked/refreshed
        
        # Build authorized_user_info dict
        authorized_user_info = {
            "token": data.get("token"),
            "refresh_token": data.get("refresh_token"),
            "token_uri": data.get("token_uri") or "https://oauth2.googleapis.com/token",
            "client_id": data.get("client_id") or GOOGLE_CLIENT_ID,
            "client_secret": data.get("client_secret") or GOOGLE_CLIENT_SECRET,
            "scopes": data.get("scopes") or GMAIL_SCOPES,
        }
        
        # Include expiry if we have it (Google OAuth2 library accepts datetime or RFC3339 string)
        # Note: Google's library expects expiry without timezone offset, so we strip it
        if expiry:
            # Convert to naive datetime (UTC) by removing timezone info before isoformat()
            # This prevents "unconverted data remains: +00:00" error in from_authorized_user_info()
            expiry_naive = expiry.replace(tzinfo=None) if expiry.tzinfo else expiry
            authorized_user_info["expiry"] = expiry_naive.isoformat()
        
        creds = Credentials.from_authorized_user_info(authorized_user_info)
        
        # If expiry wasn't set in authorized_user_info, set it directly on the creds object
        if expiry and not creds.expiry:
            creds.expiry = expiry
        
        # Check if credentials are valid
        # Only log if there's an issue (no expiry or expired)
        if not creds.expiry:
            print(f"[GmailClient] No expiry information - will check/refresh token")
        elif creds.expired:
            print(f"[GmailClient] Gmail token expired")

            if creds.refresh_token:
                try:
                    creds.refresh(Request())
                    print(f"[GmailClient] Token refreshed successfully")

                    # Save the refreshed credentials
                    _save_user_gmail_creds(uid, creds)
                except Exception as refresh_error:
                    error_msg = str(refresh_error).lower()
                    if 'invalid_grant' in error_msg:
                        print(f"[GmailClient] Refresh token is invalid or revoked")
                        # Preserve original error message
                        raise Exception(f"Gmail refresh token invalid: {refresh_error}")
                    else:
                        print(f"[GmailClient] Token refresh failed: {refresh_error}")
                        raise
            else:
                print(f"[GmailClient] No refresh token available")
                raise Exception("Gmail token expired and no refresh token available")
        
        return creds
        
    except Exception as e:
        print(f"[GmailClient] Error loading/refreshing Gmail credentials: {e}")
        import traceback
        traceback.print_exc()
        raise


def _gmail_service(creds):
    """Build Gmail service from credentials"""
    return build("gmail", "v1", credentials=creds)


def send_email_for_user(uid: str, to: str, subject: str, body_html: str) -> dict:
    """Send an email via user's Gmail OAuth credentials (appears as from themselves)."""
    creds = _load_user_gmail_creds(uid)
    if not creds:
        raise ValueError(f"No Gmail credentials for uid={uid}")

    service = _gmail_service(creds)
    if not service:
        raise ValueError(f"Failed to build Gmail service for uid={uid}")

    message = MIMEText(body_html, "html")
    message["to"] = to
    message["subject"] = subject
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    return service.users().messages().send(
        userId="me", body={"raw": raw}
    ).execute()


def start_gmail_watch(uid):
    """
    Start Gmail push notifications watch for the user. Saves watchHistoryId, watchExpiration,
    watchStartedAt to users/{uid}/integrations/gmail. Raises if no/invalid Gmail credentials.
    """
    creds = _load_user_gmail_creds(uid)
    if not creds:
        raise ValueError(f"No Gmail credentials for uid={uid}")
    service = _gmail_service(creds)
    if not service:
        raise ValueError(f"Failed to build Gmail service for uid={uid}")
    body = {"topicName": GMAIL_PUBSUB_TOPIC}
    response = service.users().watch(userId="me", body=body).execute()
    history_id = str(response.get("historyId", ""))
    expiration = response.get("expiration")
    if expiration is not None:
        try:
            expiration = int(expiration)
        except (TypeError, ValueError):
            expiration = None
    db = get_db()
    if not db:
        raise RuntimeError("Database not available")
    gmail_ref = db.collection("users").document(uid).collection("integrations").document("gmail")
    now_iso = datetime.utcnow().isoformat() + "Z"  # TODO: deprecated in Python 3.12
    gmail_ref.set({
        "watchHistoryId": history_id,
        "watchExpiration": expiration,
        "watchStartedAt": now_iso,
    }, merge=True)
    print(f"[gmail_watch] Started watch historyId={history_id} expiration={expiration}")
    return response


def stop_gmail_watch(uid):
    """Stop Gmail push notifications and clear watch fields from users/{uid}/integrations/gmail."""
    from firebase_admin import firestore
    creds = _load_user_gmail_creds(uid)
    if not creds:
        raise ValueError(f"No Gmail credentials for uid={uid}")
    service = _gmail_service(creds)
    if not service:
        raise ValueError(f"Failed to build Gmail service for uid={uid}")
    service.users().stop(userId="me").execute()
    db = get_db()
    if db:
        gmail_ref = db.collection("users").document(uid).collection("integrations").document("gmail")
        gmail_ref.update({
            "watchHistoryId": firestore.DELETE_FIELD,
            "watchExpiration": firestore.DELETE_FIELD,
            "watchStartedAt": firestore.DELETE_FIELD,
        })
    print(f"[gmail_watch] Stopped watch")


def renew_gmail_watch(uid):
    """Renew Gmail watch (same as start - calling watch() again extends expiration)."""
    start_gmail_watch(uid)
    print(f"[gmail_watch] Renewed watch")


# Cache for find_uid_by_gmail_address (TTL 5 min) to avoid scanning all users on every notification
_gmail_address_to_uid_cache = {}
_gmail_address_cache_ts = 0
_GMAIL_ADDRESS_CACHE_TTL_SEC = 300


def find_uid_by_gmail_address(email_address):
    """
    Find user uid whose Gmail integration has the given email.
    First checks gmail_mappings/{email} for O(1) lookup, then falls back to
    collection group query on integrations, and finally falls back to full scan.
    Uses a module-level cache with 5-min TTL.
    """
    global _gmail_address_to_uid_cache, _gmail_address_cache_ts
    import time as _time
    now = _time.time()
    if now - _gmail_address_cache_ts > _GMAIL_ADDRESS_CACHE_TTL_SEC:
        _gmail_address_to_uid_cache = {}
        _gmail_address_cache_ts = now
    key = (email_address or "").strip().lower()
    if not key:
        return None
    if key in _gmail_address_to_uid_cache:
        return _gmail_address_to_uid_cache[key]
    db = get_db()
    if not db:
        return None

    # O(1) lookup via gmail_mappings collection
    try:
        mapping_doc = db.collection("gmail_mappings").document(key).get()
        if mapping_doc.exists:
            uid = (mapping_doc.to_dict() or {}).get("uid")
            if uid:
                _gmail_address_to_uid_cache[key] = uid
                return uid
    except Exception:
        pass

    # Fallback: collection group query on "integrations" where gmailAddress matches
    try:
        from google.cloud.firestore_v1 import FieldFilter
        query = db.collection_group("integrations").where(
            filter=FieldFilter("gmailAddress", "==", key)
        ).limit(1)
        for doc in query.stream():
            # doc path: users/{uid}/integrations/gmail
            uid = doc.reference.parent.parent.id
            _gmail_address_to_uid_cache[key] = uid
            # Backfill the mapping for future O(1) lookups
            try:
                db.collection("gmail_mappings").document(key).set({"uid": uid}, merge=True)
            except Exception:
                pass
            return uid
    except Exception:
        pass

    # Final fallback: full scan (only reached if collection group index not set up)
    for user_doc in db.collection("users").stream():
        uid = user_doc.id
        gmail_doc = db.collection("users").document(uid).collection("integrations").document("gmail").get()
        if not gmail_doc.exists:
            continue
        data = gmail_doc.to_dict() or {}
        stored = (data.get("gmailAddress") or "").strip().lower()
        if stored:
            _gmail_address_to_uid_cache[stored] = uid
            # Backfill mapping
            try:
                db.collection("gmail_mappings").document(stored).set({"uid": uid}, merge=True)
            except Exception:
                pass
    uid = _gmail_address_to_uid_cache.get(key)
    if uid is None and key not in _gmail_address_to_uid_cache:
        _gmail_address_to_uid_cache[key] = None
    return uid


def get_thread_messages(gmail_service, thread_id):
    """Get all messages in a Gmail thread"""
    try:
        thread = gmail_service.users().threads().get(
            userId='me',
            id=thread_id,
            format='metadata',
            metadataHeaders=['From', 'To', 'Subject']
        ).execute()
        return thread.get('messages', [])
    except Exception as e:
        print(f"Error getting thread messages: {e}")
        return []


def check_for_replies(gmail_service, thread_id, sent_to_email):
    """Check if there are any replies from the recipient in the thread"""
    try:
        messages = get_thread_messages(gmail_service, thread_id)
        
        # Skip the first message (our sent message)
        for msg in messages[1:]:
            headers = msg.get('payload', {}).get('headers', [])
            from_header = next((h['value'] for h in headers if h['name'].lower() == 'from'), '')
            
            # Check if this message is from the recipient
            if sent_to_email.lower() in from_header.lower():
                # Check if it's unread
                if 'UNREAD' in msg.get('labelIds', []):
                    return {
                        'hasReply': True,
                        'isUnread': True,
                        'messageId': msg['id']
                    }
                else:
                    return {
                        'hasReply': True,
                        'isUnread': False,
                        'messageId': msg['id']
                    }
        
        return {'hasReply': False, 'isUnread': False}
    except Exception as e:
        print(f"Error checking for replies: {e}")
        return {'hasReply': False, 'isUnread': False}


def extract_message_body(message, max_length=500):
    """Extract clean plain text body from a Gmail message, removing HTML/CSS/formatting"""
    import re
    
    try:
        payload = message.get('payload', {})
        body = ''
        
        def clean_html_text(html_text):
            """Thoroughly clean HTML text"""
            if not html_text:
                return ''
            
            # Remove style tags and their content completely
            html_text = re.sub(r'<style[^>]*>.*?</style>', '', html_text, flags=re.DOTALL | re.IGNORECASE)
            
            # Remove script tags
            html_text = re.sub(r'<script[^>]*>.*?</script>', '', html_text, flags=re.DOTALL | re.IGNORECASE)
            
            # Remove inline styles (style="...")
            html_text = re.sub(r'style\s*=\s*["\'][^"\']*["\']', '', html_text, flags=re.IGNORECASE)
            
            # Remove all HTML tags
            html_text = re.sub(r'<[^>]+>', '', html_text)
            
            # Decode HTML entities
            html_text = html_text.replace('&nbsp;', ' ')
            html_text = html_text.replace('&amp;', '&')
            html_text = html_text.replace('&lt;', '<')
            html_text = html_text.replace('&gt;', '>')
            html_text = html_text.replace('&quot;', '"')
            html_text = html_text.replace('&#39;', "'")
            html_text = html_text.replace('&apos;', "'")
            
            # Remove excessive whitespace but preserve line breaks
            html_text = re.sub(r'[ \t]+', ' ', html_text)  # Multiple spaces to single
            html_text = re.sub(r'\n\s*\n\s*\n+', '\n\n', html_text)  # Multiple newlines to double
            
            return html_text.strip()
        
        def remove_email_signature(text):
            """Remove common email signature patterns"""
            # Remove lines starting with common signature markers
            lines = text.split('\n')
            cleaned_lines = []
            in_signature = False
            
            signature_markers = [
                '--', '---', '___', 'Best regards', 'Best,', 'Sincerely', 'Thanks,',
                'Sent from', 'Get Outlook', 'Sent from my', 'iPhone', 'Android',
                'This email', 'Confidentiality Notice', 'Disclaimer:'
            ]
            
            for line in lines:
                line_lower = line.strip().lower()
                # Check if this line starts a signature
                if any(line_lower.startswith(marker.lower()) for marker in signature_markers):
                    in_signature = True
                
                # Stop at common signature separators
                if line.strip() in ['--', '---', '___']:
                    in_signature = True
                    continue
                
                if not in_signature:
                    cleaned_lines.append(line)
            
            return '\n'.join(cleaned_lines).strip()
        
        # Handle multipart messages
        if 'parts' in payload:
            # First, try to find text/plain
            for part in payload['parts']:
                mime_type = part.get('mimeType', '')
                body_data = part.get('body', {}).get('data')
                
                if mime_type == 'text/plain' and body_data:
                    try:
                        decoded = base64.urlsafe_b64decode(body_data).decode('utf-8', errors='ignore')
                        if decoded and decoded.strip():
                            body = decoded
                            break
                    except Exception as e:
                        print(f"Error decoding text/plain part: {e}")
                        continue
                
                # Recursively check nested parts
                if 'parts' in part:
                    for nested_part in part.get('parts', []):
                        nested_mime = nested_part.get('mimeType', '')
                        nested_data = nested_part.get('body', {}).get('data')
                        if nested_mime == 'text/plain' and nested_data:
                            try:
                                decoded = base64.urlsafe_b64decode(nested_data).decode('utf-8', errors='ignore')
                                if decoded and decoded.strip():
                                    body = decoded
                                    break
                            except Exception:
                                pass
                    if body:
                        break
            
            # If no plain text, try HTML
            if not body:
                for part in payload['parts']:
                    mime_type = part.get('mimeType', '')
                    body_data = part.get('body', {}).get('data')
                    
                    if mime_type == 'text/html' and body_data:
                        try:
                            decoded = base64.urlsafe_b64decode(body_data).decode('utf-8', errors='ignore')
                            if decoded:
                                body = clean_html_text(decoded)
                                if body.strip():
                                    break
                        except Exception as e:
                            print(f"Error decoding text/html part: {e}")
                            continue
                    
                    # Check nested parts for HTML
                    if 'parts' in part:
                        for nested_part in part.get('parts', []):
                            nested_mime = nested_part.get('mimeType', '')
                            nested_data = nested_part.get('body', {}).get('data')
                            if nested_mime == 'text/html' and nested_data:
                                try:
                                    decoded = base64.urlsafe_b64decode(nested_data).decode('utf-8', errors='ignore')
                                    if decoded:
                                        body = clean_html_text(decoded)
                                        if body.strip():
                                            break
                                except Exception:
                                    pass
                        if body:
                            break
        
        # Handle simple messages (not multipart)
        elif 'body' in payload and 'data' in payload['body']:
            try:
                decoded = base64.urlsafe_b64decode(payload['body']['data']).decode('utf-8', errors='ignore')
                # Check if it's HTML
                if '<' in decoded and '>' in decoded:
                    body = clean_html_text(decoded)
                else:
                    body = decoded
            except Exception as e:
                print(f"Error decoding simple message body: {e}")
        
        # Fallback to Gmail snippet if we have nothing
        if not body or not body.strip():
            body = message.get('snippet', '')
        
        # Clean up the body
        if body:
            # Remove email signatures
            body = remove_email_signature(body)
            
            # Remove quoted replies (lines starting with >)
            lines = body.split('\n')
            cleaned_lines = []
            in_quoted = False
            for line in lines:
                stripped = line.strip()
                # Detect quoted text
                if stripped.startswith('>') or (stripped.startswith('On ') and 'wrote:' in stripped):
                    in_quoted = True
                if in_quoted:
                    continue
                cleaned_lines.append(line)
            body = '\n'.join(cleaned_lines)
            
            # Final cleanup
            body = re.sub(r'\s+', ' ', body)  # Collapse all whitespace to single spaces
            body = body.strip()
            
            # Limit length for snippets if specified
            if max_length and len(body) > max_length:
                # Try to cut at a sentence boundary
                truncated = body[:max_length]
                last_period = truncated.rfind('.')
                last_exclamation = truncated.rfind('!')
                last_question = truncated.rfind('?')
                last_sentence = max(last_period, last_exclamation, last_question)
                if last_sentence > max_length * 0.7:  # Only use if we're not cutting too much
                    body = truncated[:last_sentence + 1] + '...'
                else:
                    body = truncated + '...'
        
        return body.strip()
    except Exception as e:
        print(f"Error extracting message body: {e}")
        import traceback
        traceback.print_exc()
        # Fallback to snippet
        return message.get('snippet', '').strip()


def get_latest_message_from_thread(gmail_service, thread_id, sent_to_email=None):
    """
    Get the latest message from a Gmail thread.
    If sent_to_email is provided, returns the latest message from that sender.
    Otherwise, returns the latest message in the thread.
    """
    try:
        thread = gmail_service.users().threads().get(
            userId='me',
            id=thread_id,
            format='full'
        ).execute()
        
        messages = thread.get('messages', [])
        if not messages:
            return None
        
        # If sent_to_email is provided, find latest message from that sender
        if sent_to_email:
            for msg in reversed(messages):  # Start from latest
                headers = msg.get('payload', {}).get('headers', [])
                from_header = next((h['value'] for h in headers if h['name'].lower() == 'from'), '')
                
                if sent_to_email.lower() in from_header.lower():
                    return msg
        
        # Otherwise, return the latest message
        return messages[-1]
    except Exception as e:
        print(f"Error getting latest message from thread: {e}")
        return None


def sync_thread_message(gmail_service, thread_id, sent_to_email=None, user_email=None):
    """
    Sync the latest message from a Gmail thread and return message snippet with status.
    Returns dict with: snippet, hasUnreadReply, lastActivityAt, status, isFromRecipient
    """
    try:
        # Get full thread to analyze all messages
        thread = gmail_service.users().threads().get(
            userId='me',
            id=thread_id,
            format='full'
        ).execute()
        
        messages = thread.get('messages', [])
        if not messages:
            return {
                'snippet': 'No messages found in thread.',
                'hasUnreadReply': False,
                'lastActivityAt': None,
                'status': 'no_reply_yet',
                'isFromRecipient': False
            }
        
        # Get the latest message
        latest_msg = messages[-1]
        
        # Determine who sent the latest message
        headers = latest_msg.get('payload', {}).get('headers', [])
        from_header = next((h['value'] for h in headers if h['name'].lower() == 'from'), '')
        
        # Check if latest message is from recipient
        is_from_recipient = False
        if sent_to_email:
            is_from_recipient = sent_to_email.lower() in from_header.lower()
        
        # Check if latest message is from user
        is_from_user = False
        if user_email:
            is_from_user = user_email.lower() in from_header.lower()
        
        # Extract message body
        snippet = extract_message_body(latest_msg, max_length=300)
        if not snippet:
            # Fallback to Gmail's snippet
            snippet = latest_msg.get('snippet', 'No message content available.')
            # Clean the snippet too
            import re
            snippet = re.sub(r'\s+', ' ', snippet).strip()
        
        # Check if unread
        has_unread = 'UNREAD' in latest_msg.get('labelIds', [])
        
        # Get timestamp
        timestamp = latest_msg.get('internalDate')
        last_activity = None
        if timestamp:
            try:
                last_activity = datetime.utcfromtimestamp(int(timestamp) / 1000).isoformat() + "Z"  # TODO: deprecated in Python 3.12
            except Exception:
                pass
        
        # Determine status
        status = 'waiting_on_them'
        if is_from_recipient and has_unread:
            status = 'new_reply'
        elif is_from_recipient and not has_unread:
            status = 'waiting_on_you'  # They replied, we haven't responded yet
        elif is_from_user:
            status = 'waiting_on_them'  # We sent, waiting for their reply
        else:
            # Check if there are any replies from recipient in the thread
            has_any_reply = False
            for msg in messages:
                msg_headers = msg.get('payload', {}).get('headers', [])
                msg_from = next((h['value'] for h in msg_headers if h['name'].lower() == 'from'), '')
                if sent_to_email and sent_to_email.lower() in msg_from.lower():
                    has_any_reply = True
                    break
            
            if not has_any_reply:
                status = 'no_reply_yet'
            else:
                status = 'waiting_on_you'
        
        return {
            'snippet': snippet,
            'hasUnreadReply': has_unread and is_from_recipient,
            'lastActivityAt': last_activity or datetime.utcnow().isoformat(),  # TODO: deprecated in Python 3.12
            'messageId': latest_msg.get('id'),
            'status': status,
            'isFromRecipient': is_from_recipient
        }
    except Exception as e:
        print(f"Error syncing thread message: {e}")
        import traceback
        traceback.print_exc()
        # datetime is imported at module level, use it directly
        return {
            'snippet': 'Error syncing message from Gmail.',
            'hasUnreadReply': False,
            'lastActivityAt': datetime.utcnow().isoformat(),  # TODO: deprecated in Python 3.12
            'status': 'waiting_on_them',
            'isFromRecipient': False
        }


def get_gmail_service():
    """Get Gmail API service using token.pickle (shared account)"""
    try:
        # Try multiple possible locations for token.pickle
        # Get the backend directory path
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))  # Go up from services/ to backend/
        current_dir = os.getcwd()
        
        possible_paths = [
            os.path.join(backend_dir, 'token.pickle'),  # backend/token.pickle (most likely)
            'token.pickle',  # Current working directory
            os.path.join(current_dir, 'token.pickle'),  # Explicit current directory
            os.path.join(os.path.dirname(__file__), '..', '..', 'token.pickle'),  # Relative from services/
        ]
        
        token_path = None
        for path in possible_paths:
            abs_path = os.path.abspath(path)
            if os.path.exists(abs_path):
                token_path = abs_path
                break

        if not token_path:
            print("[GmailClient] token.pickle not found in expected locations")
            return None
        
        creds = None
        with open(token_path, 'rb') as token:
            creds = pickle.load(token)
        
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
                with open(token_path, 'wb') as token:
                    pickle.dump(creds, token)
            else:
                print("[GmailClient] No valid Gmail credentials found in token.pickle")
                return None
        
        service = build('gmail', 'v1', credentials=creds)
        
        # Verify connection by getting profile (only log in debug mode or when explicitly requested)
        # This is often called from health checks, so we don't want to spam logs
        try:
            profile = service.users().getProfile(userId='me').execute()
            email = profile.get('emailAddress', 'unknown')
            # Only print if explicitly requested (not for health checks)
            # The email is logged elsewhere when actually used for user operations
        except Exception as profile_error:
            # Only log errors, not successful connections
            print(f"[GmailClient] Gmail service connected but couldn't fetch profile: {profile_error}")
        
        return service
        
    except Exception as e:
        print(f"[GmailClient] Gmail service failed: {e}")
        import traceback
        traceback.print_exc()
        return None


def get_gmail_service_with_service_account(user_email):
    """Get Gmail service using service account with domain-wide delegation (no OAuth required)"""
    try:
        if not GOOGLE_SERVICE_ACCOUNT_FILE or not os.path.exists(GOOGLE_SERVICE_ACCOUNT_FILE):
            print(f"[GmailClient] Service account file not found, falling back to shared account")
            return None

        if not user_email:
            print(f"[GmailClient] No user email provided")
            return None
        
        # Load service account credentials
        creds = service_account.Credentials.from_service_account_file(
            GOOGLE_SERVICE_ACCOUNT_FILE,
            scopes=GMAIL_SCOPES
        )
        
        # If service account email is provided, use domain-wide delegation to impersonate user
        if GOOGLE_SERVICE_ACCOUNT_EMAIL:
            # Delegate domain-wide authority to impersonate the user
            delegated_creds = creds.with_subject(user_email)
            service = build('gmail', 'v1', credentials=delegated_creds)
            print(f"[GmailClient] Gmail service created with domain-wide delegation")
            return service
        else:
            # Use service account directly (shared account)
            service = build('gmail', 'v1', credentials=creds)
            print(f"[GmailClient] Gmail service created using service account")
            return service
        
    except Exception as e:
        print(f"[GmailClient] Error creating service account Gmail service: {e}")
        import traceback
        traceback.print_exc()
        return None


def download_resume_from_url(resume_url):
    """
    Download resume PDF from a URL (Google Drive, Firebase Storage, etc.)
    Returns tuple: (resume_content: bytes, filename: str) or (None, None) on error
    """
    import re
    
    try:
        print(f"📎 Downloading resume from: {resume_url}")
        
        # Normalize Google Drive URLs to direct download format
        normalized_url = resume_url
        if 'drive.google.com' in resume_url:
            # Format: https://drive.google.com/file/d/FILE_ID/view
            match = re.search(r'/file/d/([^/]+)', resume_url)
            if match:
                file_id = match.group(1)
                normalized_url = f'https://drive.google.com/uc?export=download&id={file_id}'
                print(f"   🔄 Normalized Google Drive URL: {normalized_url}")
            else:
                # Format: https://drive.google.com/open?id=FILE_ID
                match = re.search(r'[?&]id=([^&]+)', resume_url)
                if match:
                    file_id = match.group(1)
                    normalized_url = f'https://drive.google.com/uc?export=download&id={file_id}'
                    print(f"   🔄 Normalized Google Drive URL: {normalized_url}")
        
        # Handle Firebase Storage URLs - they should work directly
        if 'firebasestorage.googleapis.com' in normalized_url:
            print(f"   📦 Detected Firebase Storage URL")
        
        print(f"   ⬇️ Downloading resume from {normalized_url}")
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        response = requests.get(normalized_url, timeout=30, headers=headers, allow_redirects=True)
        response.raise_for_status()
        
        # Check if we got actual PDF content
        content_type = response.headers.get('Content-Type', '').lower()
        print(f"   📄 Content-Type: {content_type}")
        
        if 'html' in content_type and 'drive.google.com' in normalized_url:
            # Google Drive might be showing a warning page, try alternative method
            print(f"   ⚠️ Got HTML instead of PDF, trying alternative download method...")
            # Extract file ID and try direct download
            match = re.search(r'id=([^&]+)', normalized_url)
            if match:
                file_id = match.group(1)
                alt_url = f'https://drive.google.com/uc?export=download&id={file_id}&confirm=t'
                print(f"   🔄 Trying alternative URL: {alt_url}")
                response = requests.get(alt_url, timeout=30, headers=headers, allow_redirects=True)
                response.raise_for_status()
                content_type = response.headers.get('Content-Type', '').lower()
        
        # Get filename from URL or headers
        filename = "resume.pdf"
        if 'Content-Disposition' in response.headers:
            content_disp = response.headers['Content-Disposition']
            if 'filename=' in content_disp:
                filename = content_disp.split('filename=')[1].strip('"').strip("'")
        
        if not filename.endswith('.pdf') and not filename.endswith('.docx'):
            # Try to extract from URL
            for part in reversed(resume_url.split('/')):
                if '.pdf' in part.lower() or '.docx' in part.lower():
                    filename = part.split('?')[0]
                    break

        resume_content = response.content
        
        return resume_content, filename
        
    except Exception as resume_error:
        print(f"[GmailClient] Could not download resume: {resume_error}")
        import traceback
        traceback.print_exc()
        return None, None


def get_gmail_service_for_user(user_email, user_id=None):
    """
    Get Gmail service for a specific user.
    Priority:
    1. Per-user OAuth credentials (if user_id provided and credentials exist)
    2. Shared token.pickle account (fallback)
    """
    try:
        if not user_email:
            print("[GmailClient] No user email provided")
            return None

        # Priority 1: Try per-user OAuth credentials if user_id is provided
        if user_id:
            try:
                creds = _load_user_gmail_creds(user_id)
                if creds:
                    service = _gmail_service(creds)
                    if service:
                        try:
                            service.users().getProfile(userId='me').execute()
                            print(f"[GmailClient] Using user's own Gmail account")
                            return service
                        except Exception as profile_err:
                            print(f"[GmailClient] Could not verify per-user account: {profile_err}")
                            # Continue to fallback
            except Exception as oauth_err:
                print(f"[GmailClient] Per-user OAuth not available: {oauth_err}")
                # Continue to fallback

        # Priority 2: Fallback to shared token.pickle account
        service = get_gmail_service()
        if service:
            return service

        print(f"[GmailClient] Gmail service not available - token.pickle not found")
        return None
        
    except Exception as e:
        print(f"[GmailClient] Error getting Gmail service: {e}")
        import traceback
        traceback.print_exc()
        return None


def create_gmail_draft_for_user(contact, email_subject, email_body, tier='free', user_email=None, resume_url=None, resume_content=None, resume_filename=None, user_info=None, user_id=None):
    """
    Create Gmail draft in the user's account with optional resume attachment and HTML formatting
    
    Args:
        contact: Contact dictionary
        email_subject: Email subject line
        email_body: Email body text
        tier: 'free' or 'pro'
        user_email: User's email address
        resume_url: URL to download resume from (deprecated - use resume_content instead)
        resume_content: Pre-downloaded resume content as bytes (preferred)
        resume_filename: Filename for the resume attachment
        user_info: User profile information
        user_id: User ID for Gmail credentials
    """
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from email.mime.base import MIMEBase
    from email import encoders
    
    # Import clean_email_text from utils (will be created)
    from app.utils.contact import clean_email_text
    
    try:
        # Clean the email subject and body FIRST
        email_subject = clean_email_text(email_subject)
        email_body = clean_email_text(email_body)
        
        gmail_service = get_gmail_service_for_user(user_email, user_id=user_id)
        
        if not gmail_service:
            print(f"[GmailClient] Gmail unavailable - creating mock draft")
            return f"mock_{tier}_draft_{contact.get('FirstName', 'unknown').lower()}"

        # Get the actual Gmail account email (might be shared account)
        try:
            gmail_account_email = gmail_service.users().getProfile(userId='me').execute().get('emailAddress')
        except Exception as profile_error:
            print(f"[GmailClient] Could not get Gmail profile: {profile_error}")
            gmail_account_email = user_email or os.getenv("DEFAULT_FROM_EMAIL", "noreply@offerloop.ai")
        
        print(f"[GmailClient] Creating {tier.capitalize()} Gmail draft for contact {contact.get('FirstName', 'Unknown')}")

        # Get the best available email address - prefer work/verified over personal
        recipient_email = None
        source = None

        if contact.get('WorkEmail') and contact['WorkEmail'] != 'Not available' and '@' in contact['WorkEmail']:
            recipient_email = contact['WorkEmail']
            source = 'WorkEmail'
        elif contact.get('Email') and '@' in contact['Email'] and not contact['Email'].endswith('@domain.com'):
            recipient_email = contact['Email']
            source = 'Email'
        elif contact.get('PersonalEmail') and contact['PersonalEmail'] != 'Not available' and '@' in contact['PersonalEmail']:
            recipient_email = contact['PersonalEmail']
            source = 'PersonalEmail'

        print(f"[GmailDraft] Recipient for {contact.get('FirstName')} {contact.get('LastName')}: selected={recipient_email} (source={source}) | WorkEmail={contact.get('WorkEmail', 'n/a')} | Email={contact.get('Email', 'n/a')} | PersonalEmail={contact.get('PersonalEmail', 'n/a')}")
        
        if not recipient_email:
            print(f"[GmailClient] No valid email found for contact - creating mock draft")
            return f"mock_{tier}_draft_{contact.get('FirstName', 'unknown').lower()}_no_email"
        
        # Create multipart message
        message = MIMEMultipart('mixed')
        message['to'] = recipient_email
        message['subject'] = email_subject
        # Use the actual Gmail account email as the "from" address
        message['from'] = gmail_account_email
        
        # Add body (HTML if user_info provided, plain text otherwise)
        if user_info:
            # Create HTML email with professional signature
            user_name = user_info.get('name', '[Your Name]')
            user_email_addr = user_info.get('email', '')
            user_phone = user_info.get('phone', '')
            user_linkedin = user_info.get('linkedin', '')
            
            # Build contact signature FIRST
            contact_parts = []
            if user_email_addr:
                contact_parts.append(f'<a href="mailto:{user_email_addr}" style="color: #2563eb; text-decoration: none;">{user_email_addr}</a>')
            if user_phone:
                contact_parts.append(f'<span>{user_phone}</span>')
            if user_linkedin:
                linkedin_clean = user_linkedin.replace('https://', '').replace('http://', '').replace('www.', '')
                contact_parts.append(f'<a href="{user_linkedin}" style="color: #2563eb; text-decoration: none;">{linkedin_clean}</a>')
            
            contact_html = ' · '.join(contact_parts) if contact_parts else ''
            
            # Convert line breaks to <br> tags for Gmail
            email_body = email_body.strip()
            email_body_html = email_body.replace('\n\n', '<br><br>').replace('\n', '<br>')
            
            # Simple HTML wrapper
            html_content = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
* {{ margin: 0 !important; padding: 0 !important; text-indent: 0 !important; }}
</style>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
             line-height: 1.6; color: #1f2937; margin-left: -8px !important;">
<div style="white-space: pre-wrap; margin: 0 !important; padding: 0 !important;">
{email_body_html}
</div>
</body>
</html>"""
            message.attach(MIMEText(html_content, 'html', 'utf-8'))
        else:
            # Plain text fallback
            message.attach(MIMEText(email_body, 'plain', 'utf-8'))
        
        # Attach resume if available
        # Prefer pre-downloaded resume_content over resume_url to avoid redundant downloads
        if resume_content:
            print(f"[GmailClient] Attaching resume: {resume_filename or 'resume.pdf'}")
            try:
                filename = resume_filename or "resume.pdf"
                
                import mimetypes
                mime_type, _ = mimetypes.guess_type(filename)
                if mime_type and '/' in mime_type:
                    main_type, sub_type = mime_type.split('/', 1)
                else:
                    main_type, sub_type = 'application', 'pdf'
                
                attachment = MIMEBase(main_type, sub_type)
                attachment.set_payload(resume_content)
                encoders.encode_base64(attachment)
                attachment.add_header('Content-Disposition', f'attachment; filename="{filename}"')
                message.attach(attachment)
                print(f"[GmailClient] Resume attached successfully")

            except Exception as resume_error:
                print(f"[GmailClient] Could not attach resume: {resume_error}")
                import traceback
                traceback.print_exc()
                # Continue without resume - don't fail the entire draft
        elif resume_url:
            # Fallback: download from URL if resume_content not provided (for backward compatibility)
            print(f"[GmailClient] Attaching resume from URL")
            resume_content, filename = download_resume_from_url(resume_url)
            if resume_content:
                try:
                    import mimetypes as _mt
                    _mime, _ = _mt.guess_type(filename)
                    if _mime and '/' in _mime:
                        main_type, sub_type = _mime.split('/', 1)
                    else:
                        main_type, sub_type = 'application', 'pdf'
                    
                    attachment = MIMEBase(main_type, sub_type)
                    attachment.set_payload(resume_content)
                    encoders.encode_base64(attachment)
                    attachment.add_header('Content-Disposition', f'attachment; filename="{filename}"')
                    message.attach(attachment)
                    print(f"[GmailClient] Resume attached successfully")
                except Exception as resume_error:
                    print(f"[GmailClient] Could not attach resume: {resume_error}")
                    import traceback
                    traceback.print_exc()
                    # Continue without resume - don't fail the entire draft
            else:
                print(f"[GmailClient] Failed to download resume from URL - skipping attachment")
        
        # Create the draft
        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
        
        draft_body = {
            'message': {
                'raw': raw_message
            }
        }
        
        # Create the draft via Gmail API
        try:
            draft_result = gmail_service.users().drafts().create(userId='me', body=draft_body).execute()
            draft_id = draft_result['id']
            message_id = draft_result.get('message', {}).get('id')
        except Exception as api_error:
            print(f"[GmailClient] Gmail API error creating draft: {api_error}")
            import traceback
            traceback.print_exc()
            raise  # Re-raise to be caught by outer exception handler
        
        # If message ID not in response, try to fetch it
        if not message_id:
            try:
                draft_full = gmail_service.users().drafts().get(userId='me', id=draft_id, format='full').execute()
                message_id = draft_full.get('message', {}).get('id')
            except Exception as fetch_err:
                print(f"[GmailClient] Could not fetch message ID: {fetch_err}")
        
        # Get the Gmail account where the draft was created and build draft URL
        # Use message ID format for more reliable draft URL (Option A from fix doc)
        # Format: https://mail.google.com/mail/u/0/#drafts?compose=<messageId>
        gmail_draft_url = None
        try:
            account_email = gmail_service.users().getProfile(userId='me').execute().get('emailAddress')
            # Prefer message ID format (more reliable)
            if message_id:
                gmail_draft_url = f"https://mail.google.com/mail/u/0/#drafts?compose={message_id}"
            else:
                # Fallback to draft ID format if message ID not available
                gmail_draft_url = f"https://mail.google.com/mail/u/0/#draft/{draft_id}"
            print(f"[GmailClient] Created {tier.capitalize()} Gmail draft {draft_id}")
        except Exception as profile_err:
            print(f"[GmailClient] Created {tier.capitalize()} Gmail draft {draft_id}")
            # Still create URL even if we can't get profile
            if message_id:
                gmail_draft_url = f"https://mail.google.com/mail/u/0/#drafts?compose={message_id}"
            else:
                gmail_draft_url = f"https://mail.google.com/mail/u/0/#draft/{draft_id}"
        
        # Return draft_id, message_id, URL, and actual recipient as a dict for easier access
        return {
            'draft_id': draft_id,
            'message_id': message_id,
            'draft_url': gmail_draft_url,
            'recipient_email': recipient_email,
        }
        
    except Exception as e:
        print(f"[GmailClient] {tier.capitalize()} Gmail draft creation failed: {e}")
        import traceback
        traceback.print_exc()
        return f"mock_{tier}_draft_{contact.get('FirstName', 'unknown').lower()}"


# ISSUE 3 FIX: Parallel Gmail draft creation with rate limiting
def create_drafts_parallel(contacts_with_emails, resume_bytes=None, resume_filename=None, user_info=None, user_id=None, tier='free', user_email=None, resume_url=None):
    """
    Create all Gmail drafts in parallel with rate limiting.
    
    Args:
        contacts_with_emails: List of dicts, each containing:
            - contact: Contact dict
            - email_subject: Subject line
            - email_body: Body text
        resume_bytes: Optional resume content as bytes
        resume_filename: Optional resume filename
        user_info: Optional user profile info
        user_id: Optional user ID
        tier: 'free' or 'pro'
        user_email: User's email address
        resume_url: Optional URL to download resume when resume_bytes is not provided
    
    Returns:
        List of results (dicts with draft_id, message_id, draft_url) or error strings
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed
    import threading
    
    if not contacts_with_emails:
        return []
    
    # When resume_bytes not provided but resume_url is set, download once for all drafts
    if resume_bytes is None and resume_url:
        try:
            resume_bytes, downloaded_filename = download_resume_from_url(resume_url)
            if resume_bytes and not resume_filename:
                resume_filename = downloaded_filename
        except Exception as e:
            print(f"⚠️ Could not download resume from URL in create_drafts_parallel: {e}")
    
    # Use semaphore-like behavior with max 5 concurrent workers
    max_workers = min(5, len(contacts_with_emails))
    results = []
    results_lock = threading.Lock()
    
    def create_single_draft(item):
        """Create a single draft with resume attached when available."""
        try:
            contact = item['contact']
            email_subject = item['email_subject']
            email_body = item['email_body']
            
            result = create_gmail_draft_for_user(
                contact, email_subject, email_body, tier, user_email,
                None,  # resume_url (deprecated)
                resume_bytes,
                resume_filename,
                user_info,
                user_id
            )
            return item.get('index', 0), result, None
        except Exception as e:
            return item.get('index', 0), None, str(e)
    
    # Create all drafts in parallel
    print(f"[GmailClient] Creating {len(contacts_with_emails)} Gmail drafts in parallel (max {max_workers} concurrent)")
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all tasks
        future_to_item = {
            executor.submit(create_single_draft, item): item 
            for item in contacts_with_emails
        }
        
        # Collect results as they complete
        for future in as_completed(future_to_item):
            item = future_to_item[future]
            try:
                index, result, error = future.result()
                with results_lock:
                    results.append((index, result, error))
            except Exception as e:
                with results_lock:
                    results.append((item.get('index', 0), None, str(e)))
    
    # Sort results by index to maintain order
    results.sort(key=lambda x: x[0])
    return [result for _, result, _ in results]


# ✅ FIX #5: Gmail batch API for draft creation (single HTTP request for all drafts)
def create_drafts_batch(contacts_with_emails, gmail_service, resume_bytes=None, resume_filename=None, user_info=None, tier='free', user_email=None):
    """
    Create all Gmail drafts using Gmail batch API (single HTTP request).
    Much faster than individual API calls.
    
    Args:
        contacts_with_emails: List of dicts with 'contact', 'email_subject', 'email_body'
        gmail_service: Gmail service object
        resume_bytes: Optional resume content as bytes
        resume_filename: Optional resume filename
        user_info: Optional user profile info
        tier: 'free' or 'pro'
        user_email: User's email address
    
    Returns:
        List of results (dicts with draft_id, message_id, draft_url) or error strings
    """
    from googleapiclient.http import BatchHttpRequest
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from email.mime.base import MIMEBase
    from email import encoders
    import base64
    import os
    import threading
    
    if not contacts_with_emails or not gmail_service:
        return []
    
    print(f"[GmailClient] Creating {len(contacts_with_emails)} Gmail drafts using batch API")
    
    results = {}
    recipients = {}  # Track recipient email per request index
    results_lock = threading.Lock()

    def build_draft_message(item, index):
        """Build draft message for a single contact. Returns (raw_message, recipient_email) or (None, None)."""
        from app.utils.contact import clean_email_text

        contact = item['contact']
        email_subject = clean_email_text(item['email_subject'])
        email_body = clean_email_text(item['email_body'])

        # Get recipient email - prefer work/verified over personal
        recipient_email = None
        source = None
        if contact.get('WorkEmail') and contact['WorkEmail'] != 'Not available' and '@' in contact['WorkEmail']:
            recipient_email = contact['WorkEmail']
            source = 'WorkEmail'
        elif contact.get('Email') and '@' in contact['Email']:
            recipient_email = contact['Email']
            source = 'Email'
        elif contact.get('PersonalEmail') and contact['PersonalEmail'] != 'Not available' and '@' in contact['PersonalEmail']:
            recipient_email = contact['PersonalEmail']
            source = 'PersonalEmail'

        if recipient_email:
            print(f"[GmailDraft] Batch recipient for {contact.get('FirstName')} {contact.get('LastName')}: selected={recipient_email} (source={source})")

        if not recipient_email:
            return None, None

        recipients[str(index)] = recipient_email
        
        # Get Gmail account email
        try:
            gmail_account_email = gmail_service.users().getProfile(userId='me').execute().get('emailAddress')
        except Exception:
            gmail_account_email = user_email or os.getenv("DEFAULT_FROM_EMAIL", "noreply@offerloop.ai")
        
        # Create multipart message
        message = MIMEMultipart('mixed')
        message['to'] = recipient_email
        message['subject'] = email_subject
        message['from'] = gmail_account_email
        
        # Add body (HTML if user_info provided)
        if user_info:
            email_body_html = email_body.replace('\n\n', '<br><br>').replace('\n', '<br>')
            html_content = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
<div style="white-space: pre-wrap;">
{email_body_html}
</div>
</body>
</html>"""
            message.attach(MIMEText(html_content, 'html', 'utf-8'))
        else:
            message.attach(MIMEText(email_body, 'plain', 'utf-8'))
        
        # Attach resume when available
        if resume_bytes:
            try:
                filename = resume_filename or "resume.pdf"
                attachment = MIMEBase('application', 'pdf')
                attachment.set_payload(resume_bytes)
                encoders.encode_base64(attachment)
                attachment.add_header('Content-Disposition', f'attachment; filename="{filename}"')
                attachment.add_header('Content-Type', 'application/pdf')
                message.attach(attachment)
            except Exception:
                pass
        
        return base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8'), recipient_email

    def callback(request_id, response, exception):
        """Callback for batch request"""
        with results_lock:
            if exception:
                results[request_id] = {'error': str(exception), 'draft_id': None}
            else:
                draft_id = response.get('id') if response else None
                message_id = response.get('message', {}).get('id') if response else None
                
                # Build draft URL
                if message_id:
                    draft_url = f"https://mail.google.com/mail/u/0/#drafts?compose={message_id}"
                elif draft_id:
                    draft_url = f"https://mail.google.com/mail/u/0/#draft/{draft_id}"
                else:
                    draft_url = None
                
                results[request_id] = {
                    'draft_id': draft_id,
                    'message_id': message_id,
                    'draft_url': draft_url,
                    'recipient_email': recipients.get(request_id),
                    'error': None
                }
    
    # Build batch request
    batch = gmail_service.new_batch_http_request(callback=callback)
    
    for i, item in enumerate(contacts_with_emails):
        raw_message, _ = build_draft_message(item, i)
        if raw_message:
            batch.add(
                gmail_service.users().drafts().create(
                    userId='me',
                    body={'message': {'raw': raw_message}}
                ),
                request_id=str(i)
            )
        else:
            # No valid email, mark as error
            with results_lock:
                results[str(i)] = {'error': 'No valid recipient email', 'draft_id': None}
    
    # Execute batch (single HTTP request for all drafts!)
    try:
        batch.execute()
        print(f"✅ Batch draft creation complete: {len([r for r in results.values() if r.get('draft_id')])} successful")
    except Exception as e:
        print(f"❌ Batch draft creation failed: {e}")
        import traceback
        traceback.print_exc()
    
    # Return results in order
    return [results.get(str(i), {'error': 'Missing result', 'draft_id': None}) for i in range(len(contacts_with_emails))]