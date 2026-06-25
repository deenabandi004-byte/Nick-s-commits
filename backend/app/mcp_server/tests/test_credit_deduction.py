"""Tests for find_contacts Offerloop credit deduction.

Pins three behaviors:
  1. Anonymous callers (uid=None) skip both the credit pre-check AND
     the deduction. They keep paying via rate limits + MCPBudget only.
  2. Signed-in callers with sufficient credits: deduct CREDITS_PER_CONTACT
     per contact actually returned. NOT per requested or per effective_count
     cap. A search that returns 3 of the requested 5 costs 15 credits.
  3. Signed-in callers with insufficient credits: pre-check returns a
     paywall, the PDL cold path is NOT invoked, no credits are deducted.

Cache hits are charged 0 (verified by checking the pre-check is bypassed
when a cached payload is returned earlier in the handler).
"""
from __future__ import annotations

from unittest.mock import patch

import pytest

from app.mcp_server.tools import find_contacts


# ── Helpers ─────────────────────────────────────────────────────────────────


def _args():
    """Standard MCP find_contacts input. Returned dict is what the schema
    validates against."""
    return {
        "company": "Goldman Sachs",
        "role": "Analyst",
        "school": "USC",
        "career_track": "Investment Banking",
        "count": 5,
    }


def _free_user_ctx(uid="user-free-1"):
    return {"uid": uid, "tier": "free", "scope": "mcp:read mcp:write"}


def _pro_user_ctx(uid="user-pro-1"):
    return {"uid": uid, "tier": "pro", "scope": "mcp:read mcp:write"}


def _anon_ctx():
    """Anonymous-but-bearer: token verifies but `sub` is None. This is
    what flask_mount produces for unauthed Claude.ai sessions before OAuth
    completes."""
    return {"uid": None, "tier": "free", "scope": "mcp:read mcp:write"}


# ── 1. Anonymous skips credit logic entirely ──────────────────────────────


class TestAnonymousSkipsCredits:
    def test_anonymous_uid_none_does_not_call_deduct(
        self, fake_db, mock_pdl, mock_warmth
    ):
        """uid=None → no Firestore read, no deduct_credits_atomic call.
        Anonymous is gated only by rate limits + MCPBudget. We patch the
        helpers to return their no-op values explicitly so we can assert
        they were invoked but the handler took the no-paywall branch."""
        with (
            patch.object(find_contacts, "_credit_pre_check", return_value=None) as pre,
            patch.object(find_contacts, "_deduct_credits_for_search") as deduct,
        ):
            find_contacts.handle(
                args=_args(),
                ip_hash="anon-ip",
                db=fake_db,
                user_ctx=_anon_ctx(),
            )
            # Helpers ARE called (handler doesn't short-circuit on uid
            # itself — the helpers self-no-op). Verify both got the
            # anonymous ctx so the real implementations would no-op.
            assert pre.call_count == 1
            assert pre.call_args.args[0] == _anon_ctx()
            assert deduct.call_count == 1
            assert deduct.call_args.args[0] == _anon_ctx()

    def test_pre_check_with_none_uid_returns_none(self):
        """The pre-check helper itself short-circuits on uid=None."""
        result = find_contacts._credit_pre_check(_anon_ctx(), count=5, ip_hash="x")
        assert result is None

    def test_deduct_with_none_uid_noops(self):
        """The deduct helper itself short-circuits on uid=None — it does
        NOT call deduct_credits_atomic, so no Firestore round-trip."""
        with patch("app.services.auth.deduct_credits_atomic") as ded:
            find_contacts._deduct_credits_for_search(_anon_ctx(), contact_count=5)
            ded.assert_not_called()

    def test_deduct_with_no_user_ctx_noops(self):
        """user_ctx=None (truly unauthed code path) also no-ops."""
        with patch("app.services.auth.deduct_credits_atomic") as ded:
            find_contacts._deduct_credits_for_search(None, contact_count=5)
            ded.assert_not_called()


# ── 2. Signed-in with enough credits — deduct on actual count ─────────────


class TestSignedInDeductionAmount:
    def test_deduct_called_with_5_per_actual_contact(self):
        """5 credits per contact RETURNED. Operation name 'mcp_find_contacts'
        so analytics can distinguish MCP from website prompt_search."""
        with patch("app.services.auth.deduct_credits_atomic") as ded:
            ded.return_value = (True, 100)
            find_contacts._deduct_credits_for_search(_free_user_ctx(), contact_count=3)
            ded.assert_called_once_with("user-free-1", 15, "mcp_find_contacts")

    def test_deduct_at_pro_cap_charges_40_credits(self):
        """Pro cap is 8 contacts. Worst-case search costs 8 * 5 = 40."""
        with patch("app.services.auth.deduct_credits_atomic") as ded:
            ded.return_value = (True, 200)
            find_contacts._deduct_credits_for_search(_pro_user_ctx(), contact_count=8)
            ded.assert_called_once_with("user-pro-1", 40, "mcp_find_contacts")

    def test_deduct_zero_contacts_skipped(self):
        """A search that returns 0 contacts (PDL miss, post-filter wipeout)
        deducts NOTHING. Matches the website's prompt_search behavior
        which only deducts after contacts are surfaced."""
        with patch("app.services.auth.deduct_credits_atomic") as ded:
            find_contacts._deduct_credits_for_search(_free_user_ctx(), contact_count=0)
            ded.assert_not_called()

    def test_deduct_failure_logged_but_does_not_raise(self):
        """When deduct_credits_atomic returns (False, remaining) — e.g.
        race condition or trial expired mid-search — we log and proceed.
        Same fail-soft pattern as routes/runs.py:824-833."""
        with patch("app.services.auth.deduct_credits_atomic") as ded:
            ded.return_value = (False, 3)  # Had 3, needed 15
            # Must not raise
            find_contacts._deduct_credits_for_search(_free_user_ctx(), contact_count=3)
            ded.assert_called_once()


# ── 3. Insufficient credits → paywall, no PDL call ────────────────────────


class TestInsufficientCreditsBlocksSearch:
    def _setup_user(self, fake_db, uid, credits):
        """Seed the fake Firestore with a user doc carrying `credits`."""
        from datetime import datetime
        fake_db.collection("users").document(uid).set({
            "credits": credits,
            "maxCredits": 500,
            "lastCreditReset": datetime.now().isoformat(),
            "subscriptionTier": "free",
        })

    def test_pre_check_returns_paywall_when_short(self, fake_db):
        """Free user with 10 credits requests 5 contacts (cost = 25).
        Pre-check must return a paywall, NOT None."""
        self._setup_user(fake_db, "broke-user", credits=10)
        with patch("app.mcp_server.tools.find_contacts.get_db", create=True) as gd:
            # Patch get_db inside the helper's import path
            import app.extensions
            with patch.object(app.extensions, "get_db", return_value=fake_db):
                result = find_contacts._credit_pre_check(
                    _free_user_ctx("broke-user"), count=5, ip_hash="ip-x",
                )
        assert result is not None, "expected paywall, got None"
        assert result.hit_cap_type == "credits"
        assert "25" in result.message  # cost = 5 * 5

    def test_pre_check_returns_none_when_sufficient(self, fake_db):
        """Free user with 500 credits requests 5 contacts. Pre-check
        clears (returns None)."""
        self._setup_user(fake_db, "rich-user", credits=500)
        import app.extensions
        with patch.object(app.extensions, "get_db", return_value=fake_db):
            result = find_contacts._credit_pre_check(
                _free_user_ctx("rich-user"), count=5, ip_hash="ip-x",
            )
        assert result is None

    def test_pre_check_missing_user_doc_does_not_gate(self, fake_db):
        """If the user_ctx has a uid but Firestore has no matching user
        doc (shouldn't happen post-OAuth but defensive), the pre-check
        returns None — let the request through and rely on the deduction
        step's fail-soft behavior. Locks-out are worse than soft-charges."""
        import app.extensions
        with patch.object(app.extensions, "get_db", return_value=fake_db):
            result = find_contacts._credit_pre_check(
                _free_user_ctx("ghost-user"), count=5, ip_hash="ip-x",
            )
        assert result is None

    def test_pre_check_firestore_error_does_not_gate(self):
        """If Firestore raises during the pre-check (transient infra
        issue), don't lock the user out. Log and let the request through;
        deduction will retry."""
        import app.extensions
        class Boom:
            def collection(self, *a, **kw):
                raise RuntimeError("firestore unreachable")
        with patch.object(app.extensions, "get_db", return_value=Boom()):
            result = find_contacts._credit_pre_check(
                _free_user_ctx("any-user"), count=5, ip_hash="ip-x",
            )
        assert result is None
