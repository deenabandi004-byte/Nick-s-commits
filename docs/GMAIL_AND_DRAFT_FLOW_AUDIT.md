# Gmail Connect & Email Draft Creation - Full Audit

End-to-end audit of Gmail OAuth and draft creation with code references and file map.

---

## 1. Gmail OAuth Flow

### 1.1 Where the "Connect Gmail" button lives (every instance)

| Location | File | How it appears |
|----------|------|----------------|
| **Sign-in (implicit)** | `connect-grow-hire/src/pages/SignIn.tsx` | No visible "Connect Gmail" button. After user signs in with Google, `handleGoogleAuth` calls `checkNeedsGmailConnection()`; if Gmail is not connected, it calls `initiateGmailOAuth(false)` and redirects to Google consent. So Gmail OAuth is triggered automatically post sign-in when needed. |
| **Account Settings** | `connect-grow-hire/src/pages/AccountSettings.tsx` | Gmail Integration section: "Connect Gmail" when not connected, "Reconnect" / "Disconnect" when connected. Buttons call `handleConnectGmail` / `handleDisconnectGmail`. |
| **Contact Search** | `connect-grow-hire/src/pages/ContactSearchPage.tsx` | (1) Banner when `gmailConnected === false`: "Gmail not connected - drafts won't be created. **Connect Gmail**" (link calling `initiateGmailOAuth`). (2) Error toasts after failed search/draft with "Reconnect Gmail" (navigate to account-settings or `window.location.href = authUrl` when backend returns `authUrl`). |
| **Outbox** | `connect-grow-hire/src/pages/Outbox.tsx` | No standalone button. When regenerate/sync fails with `gmail_not_connected`, toast shows with action **Connect Gmail** that navigates to `/account-settings`. |
| **Onboarding** | N/A | No "Connect Gmail" on any onboarding page. Gmail is handled during sign-in. |

So: **Connect Gmail** appears in **Account Settings**, **Contact Search** (banner + error toasts), and **Outbox** (toast action only). Sign-in triggers the flow automatically when Gmail is not connected.

---

### 1.2 What happens when the user clicks "Connect Gmail"

**From Account Settings** (`handleConnectGmail`):

```758:771:connect-grow-hire/src/pages/AccountSettings.tsx
  const handleConnectGmail = async () => {
    setGmailActionLoading(true);
    try {
      const authUrl = await apiService.startGmailOAuth();
      if (authUrl) {
        sessionStorage.setItem('gmail_oauth_return', '/account-settings');
        window.location.href = authUrl;
      } else {
        toast({ title: "Could not start Gmail connection", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Error", description: "Failed to start Gmail connection.", variant: "destructive" });
    } finally {
      setGmailActionLoading(false);
    }
  };
```

- `apiService.startGmailOAuth()` → `GET /api/google/oauth/start` (with Bearer token). Returns `{ authUrl }`.
- Frontend sets `sessionStorage.gmail_oauth_return = '/account-settings'` (never used by backend or SignIn).
- `window.location.href = authUrl` → user goes to **Google** consent.

**From Contact Search** (`initiateGmailOAuth`):

```492:513:connect-grow-hire/src/pages/ContactSearchPage.tsx
  const initiateGmailOAuth = async () => {
    try {
      // ...
      const response = await fetch(`${API_BASE_URL}/api/google/oauth/start`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      // ...
      if (data.authUrl) {
        sessionStorage.setItem('gmail_oauth_return', window.location.pathname);
        window.location.href = data.authUrl;
      }
    } catch (error) { ... }
  };
```

- Same idea: GET `/api/google/oauth/start`, then redirect to `data.authUrl`. Return path is stored in `gmail_oauth_return` but not used after callback.

**From Sign-in** (automatic):

- After Firebase sign-in, `handleGoogleAuth` calls `checkNeedsGmailConnection()` (GET `/api/google/gmail/status`). If not connected, it calls `initiateGmailOAuth(false)` which:
  - Fetches `/api/google/oauth/start`
  - Sets `localStorage.post_gmail_destination` to `/onboarding` or `/home`
  - Does **redirect** (not popup): `window.location.replace(data.authUrl)`.

---

### 1.3 Full OAuth redirect flow (frontend → backend → Google → callback → token storage)

**Step 1 - Frontend starts OAuth**

- Request: `GET /api/google/oauth/start` with `Authorization: Bearer <Firebase ID token>`.
- Handler: `backend/app/routes/gmail_oauth.py` → `google_oauth_start()` (requires `@require_firebase_auth`).

**Step 2 - Backend builds Google URL and returns it**

- Reads `uid` and user email (Firestore `users/{uid}` then Firebase token).
- Generates state: `secrets.token_urlsafe(32)`.
- Saves state in Firestore: `oauth_state/{state}` with `uid`, `email`, `created`, `expires` (15 min).
- Builds Google auth URL:

```174:201:backend/app/routes/gmail_oauth.py
    # Build OAuth URL with all required scopes
    CLIENT_ID = os.environ["GOOGLE_CLIENT_ID"]
    REDIRECT_URI = OAUTH_REDIRECT_URI
    AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth"
    scope_string = " ".join(GMAIL_SCOPES)
    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": scope_string,
        "access_type": "offline",
        "state": state,
        "prompt": "consent",
    }
    if user_email:
        params["login_hint"] = user_email
    auth_url = f"{AUTH_BASE}?{urlencode(params)}"
```

- Returns JSON: `{ "authUrl": auth_url, "state": state, "debug": { ... } }` (no redirect; frontend does the redirect).

**Step 3 - User on Google**

- Frontend has set `window.location.href = authUrl` (or `replace`). User sees Google consent screen.
- User approves → Google redirects to backend: `GET /api/google/oauth/callback?state=...&code=...`.

**Step 4 - Backend callback** (`google_oauth_callback` in `gmail_oauth.py`)

- No `@require_firebase_auth` (user is coming from Google, no Bearer token).
- Validates `state`: loads `oauth_state/{state}` from Firestore, gets `uid` and optional `email`. Deletes state doc after use.
- If no `code`: e.g. `access_denied` / not test user → redirect to `get_frontend_redirect_uri()?gmail_error=not_test_user`.
- Exchanges code for tokens:

```473:476:backend/app/routes/gmail_oauth.py
    try:
        # 1) Exchange code for tokens
        flow = Flow.from_client_config(_gmail_client_config(), scopes=GMAIL_SCOPES)
        flow.redirect_uri = OAUTH_REDIRECT_URI
        flow.fetch_token(code=code)
        creds = flow.credentials
```

- Gets Gmail profile: `gmail_service.users().getProfile(userId="me").execute()` → `gmail_email`.
- If no `uid` from state, looks up user by `gmail_email` in `users` collection.
- Saves credentials and Gmail address:

```519:523:backend/app/routes/gmail_oauth.py
        _save_user_gmail_creds(uid, creds)
        gmail_ref = db.collection("users").document(uid).collection("integrations").document("gmail")
        gmail_ref.set({"gmailAddress": gmail_email}, merge=True)
```

- Optionally calls `start_gmail_watch(uid)` for push notifications.
- Redirects to frontend: `redirect(get_frontend_redirect_uri() + "?connected=gmail")` → **always `/signin?connected=gmail`** (see `get_frontend_redirect_uri()` in config).

**Step 5 - Frontend after redirect (SignIn only)**

- SignIn.tsx `useEffect` runs; sees `connected=gmail`.
- Reads `localStorage.post_gmail_destination` (set only when SignIn started the flow) or defaults to `/home`.
- Shows toast "Gmail Connected! 🎉", then `forceNavigate(dest)`.
- **Important:** If the user started from Account Settings or Contact Search, they had set `sessionStorage.gmail_oauth_return`; the backend never receives it and always sends them to `/signin`. SignIn then uses `post_gmail_destination` (from SignIn flow) or `/home`, so they do **not** return to Account Settings or Contact Search.

---

### 1.4 Where Gmail tokens are stored

- **Firestore only** (backend). Path: `users/{uid}/integrations/gmail`.
- Written by `_save_user_gmail_creds(uid, creds)` in `backend/app/services/gmail_client.py`:

```48:64:backend/app/services/gmail_client.py
def _save_user_gmail_creds(uid, creds):
    """Save user Gmail credentials to Firestore"""
    db = get_db()
    # ...
    data = {
        "token": creds.token,
        "refresh_token": getattr(creds, "refresh_token", None),
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": creds.scopes,
        "expiry": creds.expiry.isoformat() if getattr(creds, "expiry", None) else None,
        "updatedAt": datetime.utcnow(),
    }
    db.collection("users").document(uid).collection("integrations").document("gmail").set(data, merge=True)
```

- Callback also sets `gmailAddress` on the same doc. Watch-related fields (`watchHistoryId`, `watchExpiration`, `watchStartedAt`) are stored there too.
- **Nothing is stored in the frontend** for Gmail tokens; frontend only has Firebase auth and calls backend APIs that load credentials by `uid`.

---

### 1.5 Token refresh when tokens expire

- **On load (gmail_client):** `_load_user_gmail_creds(uid)` in `gmail_client.py` builds `Credentials` from Firestore. If `creds.expired` and `creds.refresh_token` exists, it calls `creds.refresh(Request())`, then `_save_user_gmail_creds(uid, creds)` to persist the new access token.

```148:166:backend/app/services/gmail_client.py
        elif creds.expired:
            print(f"⚠️ Gmail token expired for user {uid}")
            if creds.refresh_token:
                print(f"🔄 Attempting to refresh token...")
                try:
                    creds.refresh(Request())
                    # ...
                    _save_user_gmail_creds(uid, creds)
                except Exception as refresh_error:
                    # invalid_grant → raise; other → raise
```

- **On status check:** `GET /api/google/gmail/status` also refreshes if needed and updates the doc:

```657:662:backend/app/routes/gmail_oauth.py
        if not creds.valid and getattr(creds, "refresh_token", None):
            # ...
            creds.refresh(Request())
            db.collection("users").document(uid).collection("integrations").document("gmail").set(
                {"token": creds.token, "updatedAt": datetime.utcnow()}, merge=True
            )
```

- So: refresh is done when loading creds for any Gmail operation and when the app explicitly checks Gmail status. If refresh fails with `invalid_grant` (revoked/expired refresh token), the code raises and the route (or draft flow) returns 401 and/or clears integration.

---

### 1.6 Scopes requested

Defined in `backend/app/config.py`:

```35:42:backend/app/config.py
GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile"
]
```

---

## 2. Draft Creation Flow

### 2.1 When user "generates email and saves as draft" - two main paths

**Path A - Contact Search (prompt search)**

- User runs a search on Contact Search → `handleSearch()` → `apiService.runPromptSearch({ prompt, batchSize })` → `POST /api/prompt-search` (runs.py).
- Backend: PDL search, email generation, then **draft creation in the same request** via `create_drafts_batch` or per-contact `create_gmail_draft_for_user` (runs.py / runs_hunter.py). Response includes `contacts` and `successful_drafts`. On Gmail token error, backend returns **401** with `authUrl` and `contacts`.

**Path B - Emails API (generate-and-draft)**

- Used when the frontend explicitly calls the emails API (e.g. a "Generate and save drafts" action that sends contacts + profile). Frontend: `POST /api/emails/generate-and-draft` with `contacts`, `userProfile`, `careerInterests`, `fitContext`, etc. (e.g. from `generateAndDraftEmailsBatch` in ContactSearchPage; that function is defined but not currently referenced in the main search flow - the main flow uses prompt-search above.)
- Backend: `backend/app/routes/emails.py` → `generate_and_draft()`. It gets Gmail via `get_gmail_service_for_user(user_email, user_id=uid)`. If that returns `None` or throws (e.g. invalid/expired token), the route returns **500** with a generic message and does **not** return `authUrl` or 401.

---

### 2.2 Trace: Frontend action → API → backend → Gmail API (Path B - emails)

**Frontend (ContactSearchPage - if/when used)**

- `generateAndDraftEmailsBatch(contacts)`:
  - `POST /api/emails/generate-and-draft`
  - Body: `{ contacts, resumeText: "", userProfile, careerInterests, fitContext }`. No `resumeUrl`/`resumeFileName` in body; backend gets resume from Firestore user doc.

**Backend handler** (`emails.py`)

- `generate_and_draft()`:
  - Gets `uid`, `contacts`, `resumeText`, `userProfile`, `careerInterests`, `fitContext`, optional `resumeFileName` from payload.
  - Gmail: `gmail_service = get_gmail_service_for_user(user_email, user_id=uid)`. If `None` → 500 "Please connect your Gmail account...".
  - Loads user template from Firestore (`users/{uid}`) and builds `template_instructions`, `signoff_config`, `draft_resume_filename`.
  - For contacts without existing subject/body, calls `batch_generate_emails(...)`.
  - Resume: `resume_url` / `resume_filename` from `payload` → `user_profile` → `user_data` (Firestore).
  - For each contact: build MIME message (To, Subject, body plain+HTML, optional resume attachment), then:

```383:387:backend/app/routes/emails.py
            raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
            draft = gmail.users().drafts().create(
                userId="me",
                body={"message": {"raw": raw}}
            ).execute()
```

- Returns `{ success, connected_email, draft_count, draft_ids, drafts }`. On exception (e.g. from `get_gmail_service_for_user` or Gmail API), Flask returns 500; no 401/authUrl.

**Gmail service resolution** (`gmail_client.py`)

- `get_gmail_service_for_user(user_email, user_id=None)`:
  - If `user_id`: tries `_load_user_gmail_creds(user_id)` (which may refresh), then `_gmail_service(creds)`, then `getProfile('me')` to verify. Returns service or falls back.
  - Fallback: shared `get_gmail_service()` (e.g. token.pickle). If both fail, returns `None`.

---

### 2.3 How the draft is composed (subject, body, attachments)

- **Subject:** From generated result `r['subject']` or existing contact `emailSubject`/`email_subject`.
- **Body:** From generated `r['body']` or existing `emailBody`/`email_body`; appended line "For context, I've attached my resume below." if not already present; then signature from `signoff_config` / `user_profile`; then converted to HTML (paragraphs + signature).
- **MIME:** `MIMEMultipart("mixed")`; alternative part with plain and HTML; optional attachment part for resume (see below).

**Resume attachment (emails.py)**

- Resume URL: `payload.get("resumeUrl")` or `user_profile.get("resumeUrl")` or `user_data.get("resumeUrl")` (Firestore `users/{uid}`).
- Filename: payload / user_profile / user_data `resumeFileName` or `"Resume.pdf"`.
- If `resume_url`: GET request to URL (with timeout, User-Agent). If response looks like HTML or size > 8 MB, skip attachment. Otherwise create `MIMEBase(main, sub)`, set payload, base64 encode, `Content-Disposition: attachment; filename="..."`, attach to message.

So the resume comes from: **request body** (if sent), **user profile in request**, or **Firestore user document** (`resumeUrl`, `resumeFileName`). User document is updated when they upload a resume (e.g. Account Settings or Contact Search resume upload).

---

### 2.4 Expired or invalid token at draft creation time

- **runs.py / runs_hunter.py (prompt-search, free-run, etc.):**  
  Draft creation is wrapped in try/except. If `_load_user_gmail_creds` or Gmail API raises with `invalid_grant` or "token has been expired or revoked", backend returns a result with `error: 'gmail_token_expired'`, `require_reauth: True`, `contacts`. The route then builds `auth_url = build_gmail_oauth_url_for_user(uid, user_email)`, clears integration with `clear_user_gmail_integration(uid)`, and returns **401** with `authUrl`, `message`, `contacts`. Frontend (e.g. Contact Search) can redirect to `authUrl` or show "Reconnect Gmail".

- **emails.py (generate-and-draft):**  
  If `get_gmail_service_for_user` fails (no creds or refresh fails), it returns `None` or raises. The route does not catch Gmail auth errors to return 401 + authUrl; it returns **500** with a generic message. So for this path, the frontend does not get an `authUrl` for reconnection.

---

### 2.5 Error handling when draft creation fails

- **emails.py:** Per-contact draft creation is in a try/except; failure is logged and the loop continues. Response still returns `success: true` with `draft_count` and `drafts` (only successful ones). No 401 with authUrl on token failure.
- **runs.py:** On Gmail token error, returns 401 with `authUrl` and `contacts`. Other Gmail errors are logged and the run continues without drafts (contacts still returned).
- **Contact Search (handleSearch):** Catches error from `runPromptSearch`. If `error?.needsAuth` / `error?.authUrl`, shows "Gmail Connection Expired" toast and can redirect to `error.authUrl` or navigate to account-settings.
- **api.ts makeRequest:** On 401, builds error with `error.authUrl = data?.authUrl`, `error.contacts = data?.contacts`, `error.needsAuth = data?.needsAuth || data?.require_reauth`, so prompt-search 401 is usable for reconnect.

---

## 3. Known Issues

### 3.1 Infinite redirect loops

- No loop in the code: OAuth callback redirects once to `/signin?connected=gmail`. SignIn then navigates to `post_gmail_destination` or `/home`. If state is missing/expired, callback may redirect with `gmail_error=no_user_id`; SignIn does not auto-retrigger OAuth on that. So no infinite loop identified.

### 3.2 "Connect Gmail" in places it shouldn’t

- **Account Settings:** Correct place; it’s the integration settings.
- **Contact Search banner:** Correct; drafts are created from search results.
- **Outbox:** Only in a toast when the backend returns `gmail_not_connected`; action is "Connect Gmail" → account-settings. Appropriate.

### 3.3 Race conditions (token storage vs draft creation)

- Tokens are written in the OAuth callback before redirecting to `/signin`. The next request (e.g. draft creation) will read from Firestore. Possible race only if the user triggers draft creation in the same moment as callback; in practice the user lands on SignIn then navigates, so there’s a natural delay. No extra locking; acceptable for normal use.

### 3.4 Disconnect / reconnect

- **Disconnect:** Account Settings calls `apiService.revokeGmail()` → `POST /api/google/gmail/revoke`. Backend loads creds, calls Google revoke endpoint, then **deletes** `users/{uid}/integrations/gmail`. So disconnect is clean.
- **Reconnect:** Same as connect; user clicks Connect Gmail again and goes through full OAuth. `gmail/status` will show disconnected until reconnect completes. No special "reconnect" API beyond starting OAuth again.

### 3.5 Return path after OAuth (documented issue)

- Backend always redirects to `/signin?connected=gmail` (or `gmail_error=...`). It does **not** read `gmail_oauth_return` from sessionStorage. So users who start from Account Settings or Contact Search end up on SignIn then `/home` (or `post_gmail_destination` if they had previously started from SignIn). They do not automatically return to Account Settings or Contact Search.

---

## 4. File Map (one-line role per file)

### Frontend

| File | Role |
|------|------|
| `connect-grow-hire/src/pages/SignIn.tsx` | Sign-in page; checks Gmail after Google auth, starts OAuth redirect or popup, handles `connected=gmail` / `gmail_error` and navigates using `post_gmail_destination`. |
| `connect-grow-hire/src/pages/AccountSettings.tsx` | Account settings; shows Gmail status, "Connect Gmail" / "Reconnect" / "Disconnect", calls startGmailOAuth and revokeGmail. |
| `connect-grow-hire/src/pages/ContactSearchPage.tsx` | Contact search; Gmail banner and initiateGmailOAuth, runPromptSearch (draft creation via runs), generateAndDraftEmailsBatch (emails API), error toasts with Reconnect Gmail. |
| `connect-grow-hire/src/pages/Outbox.tsx` | Outbox; on gmail_not_connected error shows toast with "Connect Gmail" action → account-settings. |
| `connect-grow-hire/src/services/api.ts` | API client; startGmailOAuth, gmailStatus, revokeGmail, runPromptSearch, makeRequest (401 handling with authUrl/needsAuth/contacts). |

### Backend routes

| File | Role |
|------|------|
| `backend/app/routes/gmail_oauth.py` | Gmail OAuth: GET oauth/start (return authUrl), GET oauth/callback (exchange code, save creds, redirect to /signin), POST gmail/revoke, GET gmail/status (with optional refresh). |
| `backend/app/routes/emails.py` | POST generate-and-draft: batch generate emails and create Gmail drafts per contact, attach resume from URL/user doc, no 401/authUrl on token failure. |
| `backend/app/routes/runs.py` | POST prompt-search (and other runs): PDL search, email generation, draft creation via gmail_client; returns 401 + authUrl on gmail_token_expired. |
| `backend/app/routes/runs_hunter.py` | Hunter-based run endpoints; create Gmail drafts per contact, same token-expired handling as runs. |
| `backend/app/routes/outbox.py` | Outbox sync/regenerate; uses Gmail for thread/messages, returns gmail_not_connected when creds missing. |
| `backend/app/routes/contacts.py` | Contact endpoints; some return 401 "Gmail not connected" when Gmail required. |
| `backend/app/routes/job_board.py` | Job board flows; checks integrations/gmail for draft creation, skips drafts if not connected. |
| `backend/wsgi.py` | Registers blueprints and legacy /api/gmail/oauth/start and /api/gmail/status that delegate to gmail_oauth handlers. |

### Backend services / config

| File | Role |
|------|------|
| `backend/app/services/gmail_client.py` | _save_user_gmail_creds, _load_user_gmail_creds (with refresh), _gmail_service, get_gmail_service_for_user, create_gmail_draft_for_user, create_drafts_batch, download_resume_from_url, start_gmail_watch, clear_user_gmail_integration. |
| `backend/app/config.py` | GMAIL_SCOPES, get_oauth_redirect_uri, get_frontend_redirect_uri (always /signin), OAUTH_REDIRECT_URI. |

### Firebase / Firestore

- **Collections/documents:**
  - `users/{uid}/integrations/gmail` - Gmail tokens, refresh_token, expiry, gmailAddress, watch fields.
  - `oauth_state/{state}` - temporary state for OAuth (uid, email, expires ~15 min).
- **Frontend:** Uses Firebase Auth for ID token; no Gmail token storage on client.

---

## Summary

- **Connect Gmail** appears on Sign-in (flow), Account Settings, Contact Search (banner + toasts), and Outbox (toast action). OAuth is started by GET `/api/google/oauth/start`; user is sent to Google; callback is GET `/api/google/oauth/callback`; tokens are stored only in Firestore at `users/{uid}/integrations/gmail`; refresh is done in `_load_user_gmail_creds` and in `/api/google/gmail/status`.
- **Drafts** are created either in the runs pipeline (prompt-search, etc.) or via POST `/api/emails/generate-and-draft`. Resume comes from request or Firestore user doc; draft is MIME (subject, body, optional resume). Runs path returns 401 + authUrl on token expiry; emails path returns 500 and does not return authUrl.
- **Known gaps:** Post-OAuth return path always goes to `/signin` then `/home` (or post_gmail_destination); `gmail_oauth_return` is never used. For `/api/emails/generate-and-draft`, expired token yields 500 without authUrl, so the frontend cannot offer a direct "Reconnect Gmail" redirect from that path.
