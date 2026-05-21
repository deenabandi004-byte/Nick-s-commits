# Gmail Connection Troubleshooting Report

**Purpose:** Identify why users may have trouble connecting Gmail to get drafts in their inbox (Gmail Drafts folder).  
**Scope:** Flow analysis and pain points only - no code changes in this document.

---

## 1. How Gmail Connection & Drafts Work (Summary)

- **Connection:** User signs in with Google (Firebase), then the app checks Gmail status via `/api/google/gmail/status`. If not connected, the app starts Gmail OAuth: user is sent to Google’s consent screen, then redirected to the backend callback (`/api/google/oauth/callback`). The backend exchanges the code for tokens, stores credentials per user, and redirects the frontend to **`/signin`** with `?connected=gmail` (or `?gmail_error=...`).
- **Drafts:** Once connected, the backend uses the user’s Gmail credentials to create drafts via the Gmail API. Drafts appear in the **connected Gmail account’s Drafts** folder (not Inbox). The app exposes “Connect Gmail” in several places: during sign-in, Account Settings, Contact Search, and Outbox.

---

## 2. Likely Pain Points (Why Connection Fails or Feels Broken)

### 2.1 Return Path Always Goes to Sign-In

- **What happens:** After OAuth, the backend **always** redirects to the frontend base URL, which is **`/signin`** (see `get_frontend_redirect_uri()` in `backend/app/config.py`). So every user lands on `/signin?connected=gmail` (or with a `gmail_error`) after connecting Gmail.
- **Impact:** If the user started “Connect Gmail” from **Account Settings** or **Contact Search**, the app stores a return path in `sessionStorage` (`gmail_oauth_return`), but the backend never receives or uses it. So:
  - Users who connected from Account Settings expect to land back in Account Settings but end up on Sign-in, then are sent to `/home`.
  - Users who connected from Contact Search lose their place and are sent to `/home`.
- **Result:** Confusion (“Did it work?”), repeated attempts from Account Settings, or abandoning the flow.

### 2.2 “Test users” Restriction (OAuth in Testing Mode)

- **What happens:** If the OAuth consent screen is in **Testing** mode, only Google accounts listed as **Test users** in Google Cloud Console can complete OAuth. Others get `access_denied` and are redirected with `gmail_error=not_test_user`.
- **Impact:** Any user not in the Test users list cannot connect Gmail. The app does show a toast for `not_test_user` with instructions (contact support / add in Console), but in production the app should be in **Production** mode so this doesn’t apply.
- **Check:** Google Cloud Console → APIs & Services → OAuth consent screen → Publishing status. For production traffic, use **Production**, not Testing.

### 2.3 State Expiry or Missing State → `no_user_id`

- **What happens:** OAuth state is stored in Firestore with a **15-minute** TTL. If the user takes too long, opens the OAuth link in another device/tab, or state is lost, the callback may not find a valid state and may fail to resolve `uid`. The backend then redirects with `gmail_error=no_user_id`.
- **Impact:** SignIn only shows specific error toasts for `wrong_account` and `not_test_user`. For `no_user_id` there is **no dedicated message**, so the user sees no clear explanation and may assume a generic failure.
- **Result:** Users don’t know they should try again (and complete the flow within the same session).

### 2.4 Wrong Gmail Account Selected

- **What happens:** The backend sends `login_hint` so the consent screen can pre-select the signed-in user’s email. If the user is not signed into Google in that browser, or they choose a different account, they might connect a different Gmail than the one they expect.
- **Impact:** Drafts then go to that other account’s Drafts folder. Users looking at their “main” inbox/drafts don’t see them and think “Gmail isn’t connected” or “drafts don’t show up.”
- **Note:** The app allows connecting a different Gmail than the app login email; the main issue here is **expectation** (which account’s drafts to check).

### 2.5 Popup Blockers (Sign-In Popup Path)

- **What happens:** SignIn can open Gmail OAuth in a **popup** (e.g. when using the auto-close flow). If the browser blocks popups, the popup never opens and the user stays on the same page with no clear error.
- **Impact:** User thinks they clicked “Connect Gmail” but nothing happens. No toast or message explains that a popup was blocked.

### 2.6 CORS / Wrong API Base URL

- **What happens:** OAuth start is a **frontend fetch** to `API_BASE_URL + /api/google/oauth/start` (e.g. `VITE_API_BASE_URL` or default `http://localhost:5001`). If the frontend is built for one environment (e.g. production) but points to a different backend (e.g. local or wrong host), or if CORS is misconfigured, the request fails.
- **Impact:** User gets a network/CORS error or a generic failure; they may be navigated to `/home` without having completed OAuth (SignIn catch block can do that in non–auto-close mode). So they believe they’re “in” the app but Gmail was never connected.

### 2.7 Redirect URI Mismatch

- **What happens:** Google only accepts the **exact** redirect URI registered in the OAuth client. Backend uses `OAUTH_REDIRECT_URI` (e.g. `https://www.offerloop.ai/api/google/oauth/callback` in production). If the deployed backend uses a different origin (e.g. `offerloop.ai` vs `www.offerloop.ai`) or the env var is wrong, Google returns an error and the user never gets back to the app with a code.
- **Impact:** User completes consent, then sees a Google or browser error and never lands back on the app with `connected=gmail`. No in-app message explains “redirect URI mismatch.”

### 2.8 Token Expiry / Revocation After Connection

- **What happens:** After Gmail is connected, tokens can expire or be revoked (e.g. user revokes access in Google account, or refresh fails). When the backend tries to create drafts or sync, it may return **401** with `needsAuth` / `authUrl` so the frontend can prompt reconnection.
- **Impact:** Contact Search (and similar flows) can redirect to the auth URL for reconnection. If the reconnection flow is unclear, or if the user reconnects but still has cached “disconnected” state, they may think Gmail is still broken. Outbox and other surfaces show “Connect Gmail” or “Reconnect” - if the copy doesn’t match the actual state (e.g. “Connect” when they already connected once), users get confused.

### 2.9 Drafts vs Inbox Wording

- **What happens:** Drafts are created in the user’s **Gmail Drafts** folder via the Gmail API. The app copy says things like “drafts directly in Gmail” and “Drafts will now appear in your Gmail account.”
- **Impact:** If users interpret “get drafts in their inbox” literally, they may look in **Inbox** and not see anything. Clarifying that drafts appear in **Gmail → Drafts** (and optionally guiding them there once) could reduce support questions.

### 2.10 Multiple “Connect Gmail” Entry Points

- **What happens:** “Connect Gmail” appears on: Sign-in (implicit in flow), Account Settings, Contact Search, and Outbox. Return-after-OAuth is always `/signin` and only SignIn uses `post_gmail_destination` (from localStorage) to send the user to `/home` or `/onboarding`. `gmail_oauth_return` (sessionStorage) from Account Settings or Contact Search is never used.
- **Impact:** Inconsistent post-OAuth experience: users who started from Settings or Contact Search never get returned there and may think the action didn’t “stick” or that they need to do something else on that page.

---

## 3. Error Handling Summary (Current Behavior)

| Scenario                     | Backend / Google behavior                    | Frontend handling                                                                 |
|----------------------------|----------------------------------------------|------------------------------------------------------------------------------------|
| Success                    | Redirect to `/signin?connected=gmail`        | Toast “Gmail Connected!”, then navigate to `post_gmail_destination` or `/home`.     |
| Not a test user            | Redirect to `/signin?gmail_error=not_test_user` | Toast with “add to Test users” / contact support.                               |
| Wrong account              | Redirect with `gmail_error=wrong_account`     | Toast: connect the Gmail that matches your login.                                  |
| No UID (e.g. state lost)   | Redirect to `/signin?gmail_error=no_user_id`  | **No specific toast**; user may see no explanation.                                 |
| Token exchange failure     | 500 JSON response                            | User stays on Google or sees raw error; no redirect to app with a friendly message. |
| User denies consent        | Redirect from Google with `error=access_denied` (no code) | Backend returns 400; user may not be redirected to app with `gmail_error`.      |

---

## 4. Recommended Next Steps (No Code Here - For Prioritization)

1. **Return path:** Support post-OAuth return to the page that started the flow (e.g. pass return path in state and have backend redirect to that path with `connected=gmail` / `gmail_error`).
2. **Production OAuth:** Confirm OAuth consent screen is **Production** for the production app so all users can connect without being Test users.
3. **`no_user_id`:** Add an explicit toast or message on `/signin?gmail_error=no_user_id` (e.g. “Connection timed out. Please try connecting Gmail again.”).
4. **Token exchange failure:** When backend returns 500 on token exchange, consider redirecting to frontend with a generic `gmail_error=connection_failed` (or similar) so the user sees a consistent error page/message instead of raw JSON.
5. **Popup blocked:** When opening OAuth in a popup, if the popup is blocked, show a toast (e.g. “Popup blocked. Please allow popups and try again,” or switch to redirect for that flow).
6. **Drafts location:** In onboarding or first-time success message, briefly clarify that drafts appear in **Gmail → Drafts** (and optionally link “Open Gmail Drafts”).
7. **Monitoring:** Log or track `gmail_error` query params (and 401 `needsAuth` for draft/sync) to see which failure modes are most common in production.

---

## 5. References in Codebase

- **OAuth start:** `backend/app/routes/gmail_oauth.py` (`GET /api/google/oauth/start`), `connect-grow-hire/src/pages/SignIn.tsx` (`initiateGmailOAuth`, `checkNeedsGmailConnection`).
- **OAuth callback:** `backend/app/routes/gmail_oauth.py` (`GET /api/google/oauth/callback`), redirect via `get_frontend_redirect_uri()`.
- **Frontend redirect URI:** `backend/app/config.py` (`get_frontend_redirect_uri()` → `/signin`).
- **Gmail status:** `backend/app/routes/gmail_oauth.py` (`GET /api/google/gmail/status`), used by SignIn and Contact Search.
- **Draft creation:** `backend/app/services/gmail_client.py` (`create_gmail_draft_for_user`), and various route handlers (e.g. `runs.py`, `emails.py`, `outbox.py`).
- **Return path stored but unused:** `sessionStorage.setItem('gmail_oauth_return', ...)` in Account Settings and Contact Search; backend never reads it.
- **Error handling on SignIn:** `connect-grow-hire/src/pages/SignIn.tsx` (URL params `connected`, `gmail_error`; toasts for `wrong_account`, `not_test_user` only).
