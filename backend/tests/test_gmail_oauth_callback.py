"""OAuth callback behavior when the user declines Gmail scopes or exchange fails.

The callback runs in the user's browser tab, so it must always redirect back
to the frontend — a JSON 500 strands the user on /api/google/oauth/callback.
"""
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def _bypass_firebase_prod_guard():
    """Prevent create_app() from tripping the MCP prod-Firestore guard.

    firebase_admin persists a global app registry across create_app() calls
    within a test process; once it resolves a real project id the MCP mount
    guard (app/mcp_server/flask_mount.py) refuses to boot outside
    FLASK_ENV=production. Other route tests (e.g. test_shares.py,
    test_outbox_limit.py) sidestep this the same way: patch
    firebase_admin._apps to a MagicMock before create_app() runs so
    firebase_admin.get_app().project_id isn't the real prod id.
    """
    with patch("firebase_admin._apps", {"[DEFAULT]": MagicMock()}):
        yield


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
    # NOTE: patched at the "backend.app.routes.gmail_oauth" path, not
    # "app.routes.gmail_oauth". backend/wsgi.py imports routes via a
    # relative import (`from .app.routes...`), so the blueprint Flask
    # actually runs lives under the `backend.app.*` module identity — a
    # separate module object from `app.routes.gmail_oauth` even though both
    # names are importable (backend/ and its parent are both on sys.path).
    # Patching the wrong one silently no-ops and the real Flow/get_db run
    # underneath. Mirrors the pattern in test_shares.py.
    with patch("backend.app.routes.gmail_oauth.get_db") as get_db, \
         patch("backend.app.routes.gmail_oauth._gmail_client_config", return_value={"web": {}}), \
         patch("backend.app.routes.gmail_oauth._save_user_gmail_creds") as save_creds, \
         patch("backend.app.routes.gmail_oauth.Flow") as flow_cls:
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
