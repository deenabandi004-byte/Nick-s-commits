# Gmail-Optional Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users who decline the Gmail permission checkboxes during OAuth can still enter and use the whole site; drafting features show a "Connect Gmail" popup that routes to a new Integrations sidebar page which re-runs consent on the spot.

**Architecture:** The backend OAuth callback currently crashes with a raw JSON 500 when Google returns narrowed scopes (user skipped checkboxes) — the user is stranded on `offerloop.ai/api/google/oauth/callback` and can never reach the app. Fix: relax oauthlib's strict scope check, detect missing Gmail scopes after token exchange, and always redirect back to the frontend (never return JSON to a browser). Add a `return_to` param through the OAuth state doc so post-consent redirects land back where the user started (e.g. `/integrations`). On the frontend, add an Integrations page + sidebar item, a reusable ConnectGmailModal shown when a not-connected user tries to draft/send, and a small connection-status hook.

**Tech Stack:** Flask 3 blueprint (`gmail_oauth.py`), google-auth-oauthlib, pytest; React 18 + TS, react-router, shadcn/ui Dialog, lucide-react.

## Key audit facts (context for every task)

- **The crash:** `backend/app/routes/gmail_oauth.py:219` — `flow.fetch_token(code=code)` raises `Warning: Scope has changed from "<gmail scopes>" to "openid userinfo.email userinfo.profile"` when the user leaves checkboxes unticked. Caught at line 298–301 → `jsonify({"error": f"Token exchange failed: ..."}), 500` — rendered as raw JSON in the user's browser (this was the screenshot). Dead end.
- **Sign-in flow:** `SignIn.tsx` `handleGoogleAuth` → Firebase sign-in → `gmailStatus()` → if not connected, full-page redirect to Google consent. On success, callback 302s to `{frontend}/signin?connected=gmail`.
- **PublicRoute** (`App.tsx:242`) redirects any authenticated user off `/signin` to `/onboarding` (if `needsOnboarding`) or `/dashboard`. So once the backend *redirects instead of 500s*, a declining user automatically flows into the app. SignIn.tsx's `gmail_error` handling at lines 149–202 is mostly dead code (early return at line 144 fires first, and PublicRoute usually unmounts SignIn anyway) — do NOT build on it.
- **`GMAIL_SCOPES`** (`backend/app/config.py:44`): 3 gmail scopes (compose, readonly, send) + openid/email/profile.
- **`get_frontend_redirect_uri()`** (`backend/app/config.py:66`) returns `https://offerloop.ai/signin` (prod) / `http://localhost:8080/signin` (dev) — path baked in, no base-URL helper exists yet.
- **Existing UI pieces to reuse:** `GmailBanner.tsx` (app-wide "Gmail is not connected" banner, CTA currently → `/account-settings`), `AccountSettings.tsx:841-891` (status fetch / connect / disconnect handlers — leave that page untouched), `apiService.startGmailOAuth/gmailStatus/revokeGmail` (`api.ts:1623-1643`).
- **Sidebar:** `AppSidebar.tsx:85-87` — `utilityNavItems` currently holds only Pricing.
- **Draft entry points to gate:** `ContactSearchPage.tsx` `handleDraftAll` (line ~378) and `handleSendAll` (line ~406); `FindHumansModal.tsx` `handleDraftAll` (line ~417) and `handleSendAll` (line ~431).
- **Dead sessionStorage key:** `gmail_oauth_return` is written by ContactSearchPage/AccountSettings but never read anywhere. Don't use it; the `return_to` mechanism in Task 2 replaces it.

## Global Constraints

- Do NOT change the `GMAIL_SCOPES` list in `backend/app/config.py` — Google verification depends on it.
- Do NOT change when sign-in triggers the OAuth consent (SignIn.tsx `handleGoogleAuth`) — Nick is reworking that separately. Only make the *decline path* non-blocking.
- The OAuth callback must NEVER return JSON to the browser — every exit is a 302 to the frontend.
- No new npm packages (so no `vite.config.ts` vendor-chunk changes needed).
- Frontend has no test framework: verify with `cd connect-grow-hire && npx tsc --noEmit` (and `npm run build` at the end).
- Backend tests: `cd backend && pytest tests/<file> -v` with `FLASK_ENV=testing`.
- New sidebar item label is exactly `Integrations`, placed ABOVE `Pricing`.
- Route for the new page is `/integrations` (ProtectedRoute).
- `return_to` values must be validated server-side: must start with `/` and not `//` (open-redirect guard).

---

### Task 1: Backend — OAuth callback survives declined scopes and never dead-ends

**Files:**
- Modify: `backend/app/routes/gmail_oauth.py` (module top, callback body lines ~215-301)
- Test: `backend/tests/test_gmail_oauth_callback.py` (new)

**Interfaces:**
- Consumes: `GMAIL_SCOPES`, `get_frontend_redirect_uri` from `app.config`
- Produces: callback redirect contract used by Tasks 2–4:
  - declined scopes → 302 to `{frontend}?gmail_error=scopes_declined`
  - any exchange error → 302 to `{frontend}?gmail_error=oauth_failed`
  - success (unchanged) → 302 to `{frontend}?connected=gmail`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_gmail_oauth_callback.py`:

```python
"""OAuth callback behavior when the user declines Gmail scopes or exchange fails.

The callback runs in the user's browser tab, so it must always redirect back
to the frontend — a JSON 500 strands the user on /api/google/oauth/callback.
"""
from unittest.mock import MagicMock, patch

import pytest


GMAIL_ONLY_PROFILE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]


def _fake_db_with_state(uid="user-123", extra_state=None):
    """Firestore double: oauth_state/<state> exists and carries a uid."""
    db = MagicMock()
    state_doc = MagicMock()
    state_doc.exists = True
    state_data = {"uid": uid, "email": "student@usc.edu"}
    if extra_state:
        state_data.update(extra_state)
    state_doc.to_dict.return_value = state_data
    db.collection.return_value.document.return_value.get.return_value = state_doc
    return db


@pytest.fixture
def callback_mocks():
    with patch("app.routes.gmail_oauth.get_db") as get_db, \
         patch("app.routes.gmail_oauth._gmail_client_config", return_value={"web": {}}), \
         patch("app.routes.gmail_oauth._save_user_gmail_creds") as save_creds, \
         patch("app.routes.gmail_oauth.Flow") as flow_cls:
        get_db.return_value = _fake_db_with_state()
        flow = MagicMock()
        flow_cls.from_client_config.return_value = flow
        yield {"flow": flow, "save_creds": save_creds, "get_db": get_db}


def test_declined_gmail_scopes_redirects_to_frontend(client, callback_mocks):
    """User unchecked the Gmail boxes: granted scopes are profile-only."""
    callback_mocks["flow"].credentials.scopes = GMAIL_ONLY_PROFILE_SCOPES

    resp = client.get("/api/google/oauth/callback?code=abc&state=xyz")

    assert resp.status_code == 302
    assert "gmail_error=scopes_declined" in resp.headers["Location"]
    callback_mocks["save_creds"].assert_not_called()


def test_token_exchange_error_redirects_to_frontend(client, callback_mocks):
    """Any exchange failure must redirect, never return JSON to the browser."""
    callback_mocks["flow"].fetch_token.side_effect = Exception("boom")

    resp = client.get("/api/google/oauth/callback?code=abc&state=xyz")

    assert resp.status_code == 302
    assert "gmail_error=oauth_failed" in resp.headers["Location"]
    callback_mocks["save_creds"].assert_not_called()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_gmail_oauth_callback.py -v`
Expected: both tests FAIL — first because the route currently 500s with JSON (`assert 500 == 302`), second likewise. (If the `client`/`app` fixtures from `conftest.py` need extra env, mirror whatever `tests/test_exceptions.py`-style tests do to build the app.)

- [ ] **Step 3: Implement the callback changes**

In `backend/app/routes/gmail_oauth.py`:

3a. At the top of the module, after the imports (below line 8):

```python
# Google legitimately returns fewer scopes than requested when the user leaves
# consent checkboxes unticked. Without this, oauthlib raises
# "Warning: Scope has changed" inside fetch_token and the user is stranded on
# the raw JSON error page. We do our own scope check after the exchange.
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")
```

3b. Inside `google_oauth_callback`, right after `creds = flow.credentials` (line ~220) and BEFORE the `build("gmail", ...)` call (getProfile would 403 without Gmail scopes):

```python
        # If the user unchecked the Gmail boxes on the consent screen, Google
        # grants only openid/profile/email. Don't save creds — send them back
        # into the app; drafting surfaces will prompt to connect from
        # /integrations instead.
        granted = set(creds.scopes or [])
        required_gmail = {s for s in GMAIL_SCOPES if "auth/gmail." in s}
        if not required_gmail.issubset(granted):
            print(f"[gmail_oauth] Gmail scopes declined. granted={sorted(granted)}")
            redirect_url = get_frontend_redirect_uri()
            sep = "&" if "?" in redirect_url else "?"
            return redirect(f"{redirect_url}{sep}gmail_error=scopes_declined")
```

3c. Replace the final `except` block (lines ~298-301):

```python
    except Exception as e:
        print(f"[gmail_oauth] OAuth token exchange failed: {e}")
        traceback.print_exc()
        # This response renders in the user's browser tab — never show JSON.
        redirect_url = get_frontend_redirect_uri()
        sep = "&" if "?" in redirect_url else "?"
        return redirect(f"{redirect_url}{sep}gmail_error=oauth_failed")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_gmail_oauth_callback.py -v`
Expected: 2 passed

- [ ] **Step 5: Run the full backend suite to check for regressions**

Run: `cd backend && FLASK_ENV=testing pytest tests/ -q`
Expected: no new failures vs. main

- [ ] **Step 6: Commit**

```bash
git add backend/app/routes/gmail_oauth.py backend/tests/test_gmail_oauth_callback.py
git commit -m "fix(gmail-oauth): redirect to app when Gmail scopes are declined instead of raw JSON 500"
```

**Why this alone unblocks users:** after this task, a declining user lands on `/signin?gmail_error=scopes_declined`; they're already Firebase-authenticated, so `PublicRoute` immediately forwards them to `/onboarding` or `/dashboard`. The site is fully usable; the existing `GmailBanner` tells them drafts are off.

---

### Task 2: Backend — `return_to` destination through the OAuth state

**Files:**
- Modify: `backend/app/config.py` (add `get_frontend_base_uri` next to `get_frontend_redirect_uri`, line ~66)
- Modify: `backend/app/routes/gmail_oauth.py` (`google_oauth_start` state doc, callback redirect targets)
- Test: `backend/tests/test_gmail_oauth_callback.py` (extend)

**Interfaces:**
- Consumes: Task 1's redirect contract.
- Produces:
  - `GET /api/google/oauth/start?return_to=/integrations` stores `return_to` in the `oauth_state` doc.
  - `_safe_return_path(value: str | None) -> str | None` in `gmail_oauth.py` — returns the path only if it starts with `/` and not `//`, else `None`.
  - Callback redirects: with a valid `return_to` in state, success → `{base}{return_to}?connected=gmail`, declined scopes → `{base}{return_to}?gmail_error=scopes_declined`. Without one, behavior is exactly Task 1's (→ `/signin`).
  - `get_frontend_base_uri()` in `config.py` → `https://offerloop.ai` (prod) / `http://localhost:8080` (dev).

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_gmail_oauth_callback.py`:

```python
def test_safe_return_path_validation():
    from app.routes.gmail_oauth import _safe_return_path

    assert _safe_return_path("/integrations") == "/integrations"
    assert _safe_return_path("/integrations?connect=gmail") == "/integrations?connect=gmail"
    assert _safe_return_path("//evil.com") is None          # protocol-relative
    assert _safe_return_path("https://evil.com") is None    # absolute URL
    assert _safe_return_path("") is None
    assert _safe_return_path(None) is None


def test_declined_scopes_honors_return_to(client, callback_mocks):
    callback_mocks["get_db"].return_value = _fake_db_with_state(
        extra_state={"return_to": "/integrations"}
    )
    callback_mocks["flow"].credentials.scopes = GMAIL_ONLY_PROFILE_SCOPES

    resp = client.get("/api/google/oauth/callback?code=abc&state=xyz")

    assert resp.status_code == 302
    loc = resp.headers["Location"]
    assert "/integrations" in loc
    assert "gmail_error=scopes_declined" in loc
    assert "/signin" not in loc
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_gmail_oauth_callback.py -v`
Expected: the two new tests FAIL (`ImportError: cannot import name '_safe_return_path'`); Task 1's tests still pass.

- [ ] **Step 3: Implement**

3a. `backend/app/config.py`, directly above `get_frontend_redirect_uri` (line ~66):

```python
def get_frontend_base_uri():
    """Frontend origin without a path — for OAuth return_to redirects."""
    is_production = os.getenv("FLASK_ENV") == "production" or os.getenv("RENDER")
    return "https://offerloop.ai" if is_production else "http://localhost:8080"
```

3b. `backend/app/routes/gmail_oauth.py` — import it (line 11):

```python
from app.config import GMAIL_SCOPES, OAUTH_REDIRECT_URI, get_frontend_redirect_uri, get_frontend_base_uri
```

3c. Add the validator below the module imports:

```python
def _safe_return_path(value):
    """Allow only same-site paths like '/integrations' as OAuth return targets."""
    if not value or not isinstance(value, str):
        return None
    if not value.startswith("/") or value.startswith("//"):
        return None
    return value
```

3d. In `google_oauth_start`, add `return_to` to the state doc (the `state_data` dict at line ~94):

```python
    state_data = {
        "uid": uid,
        "email": user_email,
        "return_to": _safe_return_path(request.args.get("return_to")),
        "created": datetime.utcnow(),
        "expires": datetime.utcnow() + timedelta(minutes=15)
    }
```

3e. In `google_oauth_callback`, where state is read (line ~194-196), also pull `return_to`:

```python
                uid = state_data.get("uid")
                expected_email_from_state = state_data.get("email")
                return_to = _safe_return_path(state_data.get("return_to"))
```

Initialize `return_to = None` next to `uid = None` (line ~185) so it exists on all paths.

3f. Add one helper near the top of the callback body and use it for every redirect exit:

```python
    def _frontend_redirect(param_key, param_value):
        base = f"{get_frontend_base_uri()}{return_to}" if return_to else get_frontend_redirect_uri()
        sep = "&" if "?" in base else "?"
        return redirect(f"{base}{sep}{param_key}={param_value}")
```

Then replace:
- Task 1's declined-scopes exit → `return _frontend_redirect("gmail_error", "scopes_declined")`
- Task 1's exception exit → `return _frontend_redirect("gmail_error", "oauth_failed")` (define the helper OUTSIDE the `try` so the `except` can use it; `return_to` may still be its `None` initial value there, which is correct)
- the success exit (lines ~294-296) → `return _frontend_redirect("connected", "gmail")`
- the `no_user_id` exit (line ~270) → `return _frontend_redirect("gmail_error", "no_user_id")`

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_gmail_oauth_callback.py -v`
Expected: all tests pass (Task 1's included — no `return_to` in their state docs, so they still go to `/signin`).

- [ ] **Step 5: Commit**

```bash
git add backend/app/config.py backend/app/routes/gmail_oauth.py backend/tests/test_gmail_oauth_callback.py
git commit -m "feat(gmail-oauth): return_to param routes OAuth completion back to the launching page"
```

---

### Task 3: Frontend — Integrations page, sidebar item, `startGmailOAuth(returnTo)`

**Files:**
- Modify: `connect-grow-hire/src/services/api.ts:1623` (`startGmailOAuth`)
- Create: `connect-grow-hire/src/components/integrations/GmailIntegrationCard.tsx`
- Create: `connect-grow-hire/src/pages/IntegrationsPage.tsx`
- Modify: `connect-grow-hire/src/App.tsx` (lazy import + route)
- Modify: `connect-grow-hire/src/components/AppSidebar.tsx` (icon import + `utilityNavItems`)

**Interfaces:**
- Consumes: Task 2's `return_to` backend support; existing `apiService.gmailStatus()` / `revokeGmail()`.
- Produces:
  - `apiService.startGmailOAuth(returnTo?: string): Promise<string>`
  - Route `/integrations` (ProtectedRoute). URL params it handles: `?connect=gmail` (auto-launch OAuth), `?connected=gmail` (success toast), `?gmail_error=scopes_declined|oauth_failed` (explainer toast).
  - `<GmailIntegrationCard autoConnect />` component.
  - Task 4 navigates to `/integrations?connect=gmail`.

- [ ] **Step 1: Extend `startGmailOAuth` in `api.ts`**

Replace the method at line 1623:

```typescript
  async startGmailOAuth(returnTo?: string): Promise<string> {
    const headers = await this.getAuthHeaders();
    const qs = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : '';
    const { authUrl } = await this.makeRequest<{ authUrl: string }>(
      `/google/oauth/start${qs}`,
      { headers }
    );
    return authUrl;
  }
```

- [ ] **Step 2: Create `GmailIntegrationCard.tsx`**

Create `connect-grow-hire/src/components/integrations/GmailIntegrationCard.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { Mail, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiService } from "@/services/api";

interface GmailIntegrationCardProps {
  /** When true (from /integrations?connect=gmail), launch OAuth immediately. */
  autoConnect?: boolean;
}

export function GmailIntegrationCard({ autoConnect = false }: GmailIntegrationCardProps) {
  const { toast } = useToast();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [gmailAddress, setGmailAddress] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const autoConnectRan = useRef(false);

  useEffect(() => {
    let cancelled = false;
    apiService
      .gmailStatus()
      .then((data) => {
        if (cancelled) return;
        setConnected(data.connected === true);
        setGmailAddress(data.gmail_address ?? null);
      })
      .catch(() => {
        if (!cancelled) setConnected(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleConnect = async () => {
    setActionLoading(true);
    try {
      const authUrl = await apiService.startGmailOAuth("/integrations");
      if (authUrl) {
        window.location.href = authUrl;
        return; // navigating away
      }
      toast({ title: "Could not start Gmail connection", variant: "destructive" });
    } catch {
      toast({ title: "Could not start Gmail connection", variant: "destructive" });
    }
    setActionLoading(false);
  };

  const handleDisconnect = async () => {
    setActionLoading(true);
    try {
      await apiService.revokeGmail();
      setConnected(false);
      setGmailAddress(null);
      toast({ title: "Gmail disconnected", description: "You can reconnect anytime." });
    } catch {
      toast({ title: "Failed to disconnect Gmail", variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  // Auto-launch OAuth when arriving via /integrations?connect=gmail
  useEffect(() => {
    if (autoConnect && connected === false && !autoConnectRan.current) {
      autoConnectRan.current = true;
      handleConnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, connected]);

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-50">
            <Mail className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Gmail</h3>
            {connected === null ? (
              <p className="text-sm text-muted-foreground">Checking connection…</p>
            ) : connected ? (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Connected{gmailAddress ? ` as ${gmailAddress}` : ""}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Connect Gmail so Offerloop can create email drafts in your account.
                We never send anything — you review and send every email yourself.
              </p>
            )}
          </div>
        </div>
        {connected === true ? (
          <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={actionLoading}>
            Disconnect
          </Button>
        ) : (
          <Button size="sm" onClick={handleConnect} disabled={actionLoading || connected === null}>
            {actionLoading ? "Connecting…" : "Connect Gmail"}
          </Button>
        )}
      </div>
      {connected === false && (
        <p className="mt-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          On Google's permission screen, check <strong>all the boxes</strong> — that's what
          lets Offerloop write drafts into your Gmail and track replies.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `IntegrationsPage.tsx`**

Create `connect-grow-hire/src/pages/IntegrationsPage.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { GmailIntegrationCard } from "@/components/integrations/GmailIntegrationCard";

const IntegrationsPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const paramsHandled = useRef(false);

  const params = new URLSearchParams(location.search);
  const autoConnect = params.get("connect") === "gmail";

  // Handle OAuth return params once, then clean the URL.
  useEffect(() => {
    if (paramsHandled.current) return;
    const p = new URLSearchParams(location.search);
    const connected = p.get("connected") === "gmail";
    const gmailError = p.get("gmail_error");
    if (!connected && !gmailError) return;
    paramsHandled.current = true;

    if (connected) {
      toast({
        title: "Gmail connected 🎉",
        description: "Drafts will now appear in your Gmail account.",
      });
    } else if (gmailError === "scopes_declined") {
      toast({
        variant: "destructive",
        title: "Gmail permissions incomplete",
        description:
          "You'll need to check all the permission boxes on Google's screen to enable email drafting. Click Connect Gmail to try again.",
        duration: 8000,
      });
    } else {
      toast({
        variant: "destructive",
        title: "Gmail connection failed",
        description: "Something went wrong. Click Connect Gmail to try again.",
      });
    }
    navigate("/integrations", { replace: true });
  }, [location.search, navigate, toast]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-semibold text-foreground">Integrations</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect your accounts to unlock drafting and reply tracking.
      </p>
      <div className="mt-6 space-y-4">
        <GmailIntegrationCard autoConnect={autoConnect} />
      </div>
    </div>
  );
};

export default IntegrationsPage;
```

Note: `?connect=gmail` and the return params are mutually exclusive in practice (connect launches OAuth; return params arrive from the callback), so the cleanup effect won't cancel an auto-connect.

- [ ] **Step 4: Register the route in `App.tsx`**

Next to the `AccountSettings` lazy import (line ~51):

```tsx
const IntegrationsPage = React.lazy(() => import("./pages/IntegrationsPage"));
```

Next to the `/account-settings` route (line ~370):

```tsx
<Route path="/integrations" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><IntegrationsPage /></Suspense></ProtectedRoute>} />
```

- [ ] **Step 5: Add the sidebar item above Pricing**

In `connect-grow-hire/src/components/AppSidebar.tsx`, add `Plug` to the lucide-react import list (line ~2-25), then change `utilityNavItems` (line ~85):

```tsx
const utilityNavItems: NavItemDef[] = [
  { title: "Integrations",  url: "/integrations",  LucideIcon: Plug },
  { title: "Pricing",       url: "/pricing",       LucideIcon: Tag },
];
```

- [ ] **Step 6: Type-check**

Run: `cd connect-grow-hire && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add connect-grow-hire/src/services/api.ts connect-grow-hire/src/components/integrations/GmailIntegrationCard.tsx connect-grow-hire/src/pages/IntegrationsPage.tsx connect-grow-hire/src/App.tsx connect-grow-hire/src/components/AppSidebar.tsx
git commit -m "feat(integrations): Integrations page + sidebar item with on-the-spot Gmail connect"
```

---

### Task 4: Frontend — ConnectGmailModal gates drafting; banner points to Integrations

**Files:**
- Create: `connect-grow-hire/src/hooks/useGmailConnection.ts`
- Create: `connect-grow-hire/src/components/ConnectGmailModal.tsx`
- Modify: `connect-grow-hire/src/pages/ContactSearchPage.tsx` (`handleDraftAll` ~line 378, `handleSendAll` ~line 406, render block)
- Modify: `connect-grow-hire/src/components/jobs/FindHumansModal.tsx` (`handleDraftAll` ~line 417, `handleSendAll` ~line 431, render block)
- Modify: `connect-grow-hire/src/components/GmailBanner.tsx` (`handleReconnect`, line ~58)

**Interfaces:**
- Consumes: `/integrations?connect=gmail` from Task 3; `apiService.gmailStatus()`.
- Produces:
  - `useGmailConnection(): { connected: boolean | null }` — cached across mounts like GmailBanner's module cache.
  - `<ConnectGmailModal open onOpenChange />` — CTA navigates to `/integrations?connect=gmail`.

- [ ] **Step 1: Create the hook**

Create `connect-grow-hire/src/hooks/useGmailConnection.ts`:

```typescript
import { useEffect, useState } from "react";
import { apiService } from "@/services/api";

// Module-level cache so opening a modal doesn't re-hit the API every time
// (same pattern as GmailBanner.tsx).
let cachedConnected: boolean | null = null;

export function useGmailConnection(): { connected: boolean | null } {
  const [connected, setConnected] = useState<boolean | null>(cachedConnected);

  useEffect(() => {
    if (cachedConnected !== null) return;
    let cancelled = false;
    apiService
      .gmailStatus()
      .then((data) => {
        cachedConnected = data.connected === true;
        if (!cancelled) setConnected(cachedConnected);
      })
      .catch(() => {
        // Unknown status — fail open (don't block drafting on an API blip).
        if (!cancelled) setConnected(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { connected };
}
```

- [ ] **Step 2: Create the modal**

Create `connect-grow-hire/src/components/ConnectGmailModal.tsx`:

```tsx
import { useNavigate } from "react-router-dom";
import { Mail } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConnectGmailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConnectGmailModal({ open, onOpenChange }: ConnectGmailModalProps) {
  const navigate = useNavigate();

  const handleConnect = () => {
    onOpenChange(false);
    navigate("/integrations?connect=gmail");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
            <Mail className="h-6 w-6 text-blue-600" />
          </div>
          <DialogTitle className="text-center">Connect Gmail to draft emails</DialogTitle>
          <DialogDescription className="text-center">
            Offerloop writes personalized drafts straight into your Gmail — nothing is
            ever sent without you. Connect your account to enable drafting.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button onClick={handleConnect}>Connect Gmail</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Gate ContactSearchPage draft/send**

In `connect-grow-hire/src/pages/ContactSearchPage.tsx`:

3a. Import the modal (top of file):

```tsx
import { ConnectGmailModal } from "@/components/ConnectGmailModal";
```

3b. Add state next to the existing `gmailConnected` state (line ~847):

```tsx
const [showConnectGmailModal, setShowConnectGmailModal] = useState(false);
```

3c. At the very top of `handleDraftAll` (line ~378) and `handleSendAll` (line ~406), before anything else:

```tsx
    if (gmailConnected === false) {
      setShowConnectGmailModal(true);
      return;
    }
```

3d. Render the modal near the page's other dialogs (e.g. beside the confirm-send dialog around line ~2118):

```tsx
<ConnectGmailModal open={showConnectGmailModal} onOpenChange={setShowConnectGmailModal} />
```

- [ ] **Step 4: Gate FindHumansModal draft/send**

In `connect-grow-hire/src/components/jobs/FindHumansModal.tsx`:

4a. Imports:

```tsx
import { ConnectGmailModal } from "@/components/ConnectGmailModal";
import { useGmailConnection } from "@/hooks/useGmailConnection";
```

4b. Inside the component body:

```tsx
const { connected: gmailConnected } = useGmailConnection();
const [showConnectGmail, setShowConnectGmail] = useState(false);
```

4c. At the top of `handleDraftAll` (line ~417) and `handleSendAll` (line ~431):

```tsx
    if (gmailConnected === false) {
      setShowConnectGmail(true);
      return;
    }
```

4d. Render inside the component's JSX, as a sibling of its existing dialog content:

```tsx
<ConnectGmailModal open={showConnectGmail} onOpenChange={setShowConnectGmail} />
```

(shadcn/Radix supports stacked dialogs; the connect modal opens above the humans modal. Navigating to /integrations unmounts both.)

- [ ] **Step 5: Point GmailBanner at Integrations**

In `connect-grow-hire/src/components/GmailBanner.tsx` (line ~58):

```tsx
  const handleReconnect = () => {
    navigate("/integrations?connect=gmail");
  };
```

- [ ] **Step 6: Type-check and build**

Run: `cd connect-grow-hire && npx tsc --noEmit && npm run build`
Expected: clean type-check, successful Vite build (no new deps → no vendor-chunk changes).

- [ ] **Step 7: Commit**

```bash
git add connect-grow-hire/src/hooks/useGmailConnection.ts connect-grow-hire/src/components/ConnectGmailModal.tsx connect-grow-hire/src/pages/ContactSearchPage.tsx connect-grow-hire/src/components/jobs/FindHumansModal.tsx connect-grow-hire/src/components/GmailBanner.tsx
git commit -m "feat(gmail): connect-Gmail popup gates drafting and routes to Integrations"
```

---

### Manual end-to-end verification (after all tasks)

1. `cd backend && python3 wsgi.py` + `cd connect-grow-hire && npm run dev`.
2. Fresh Google account (or revoke at myaccount.google.com/permissions) → sign up → on Google's consent screen, leave the Gmail checkboxes UNCHECKED → Continue.
   - Expect: land in the app (onboarding or dashboard) — no JSON error page. GmailBanner shows "Gmail is not connected".
3. Go to Find → run a search → click "Draft Emails".
   - Expect: ConnectGmailModal appears → "Connect Gmail" → lands on `/integrations`, OAuth launches automatically.
4. On the consent screen, again leave boxes unchecked → Continue.
   - Expect: back on `/integrations` with the "check all the boxes" destructive toast.
5. Click "Connect Gmail" → this time check ALL boxes → Continue.
   - Expect: back on `/integrations` with "Gmail connected 🎉", card shows the address.
6. Draft from Find again → drafts create normally.
7. Sidebar shows "Integrations" directly above "Pricing".

### Out of scope / known follow-ups (do not do in this plan)

- SignIn.tsx lines 149–202 are dead code (early return at line 143 + PublicRoute); leave for a separate cleanup.
- `gmail_oauth_return` sessionStorage key is written but never read (ContactSearchPage:1207, AccountSettings:869); superseded by `return_to` — clean up later.
- AccountSettings' Gmail section could adopt `GmailIntegrationCard`; skipped to keep the 2,400-line file untouched.
- Nick is separately reworking where onboarding triggers the consent screen — this plan deliberately doesn't touch `handleGoogleAuth`.
