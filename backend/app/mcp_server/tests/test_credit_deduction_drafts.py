"""Tests for draft_outreach Offerloop credit deduction.

Mirrors test_credit_deduction.py (find_contacts) with the draft-specific
rate of CREDITS_PER_DRAFT (5) per generated draft. Cache hits and failed
generations (empty body/subject) cost zero — same fail-soft semantics as
the find_contacts deduction.
"""
from __future__ import annotations

from unittest.mock import patch

from app.mcp_server.tools import draft_outreach


def _free_user_ctx(uid="user-free-1"):
    return {"uid": uid, "tier": "free", "scope": "mcp:read mcp:write"}


def _anon_ctx():
    """Anonymous-but-bearer: token verifies but `sub` is None."""
    return {"uid": None, "tier": "free", "scope": "mcp:read mcp:write"}


# ── 1. Anonymous skips credit logic entirely ──────────────────────────────


class TestAnonymousSkipsCredits:
    def test_pre_check_with_none_uid_returns_none(self):
        result = draft_outreach._credit_pre_check_draft(_anon_ctx(), ip_hash="x")
        assert result is None

    def test_deduct_with_none_uid_noops(self):
        with patch("app.services.auth.deduct_credits_atomic") as ded:
            draft_outreach._deduct_credits_for_draft(_anon_ctx())
            ded.assert_not_called()

    def test_deduct_with_no_user_ctx_noops(self):
        with patch("app.services.auth.deduct_credits_atomic") as ded:
            draft_outreach._deduct_credits_for_draft(None)
            ded.assert_not_called()


# ── 2. Signed-in deduction amount + operation name ────────────────────────


class TestSignedInDeductionAmount:
    def test_deduct_charges_5_credits_per_draft(self):
        """One draft = CREDITS_PER_DRAFT (5). Operation name
        'mcp_draft_outreach' so analytics can split MCP drafts from the
        website's prompt_search drafts (which bundle them with the
        contact search at 5/contact)."""
        with patch("app.services.auth.deduct_credits_atomic") as ded:
            ded.return_value = (True, 95)
            draft_outreach._deduct_credits_for_draft(_free_user_ctx())
            ded.assert_called_once_with("user-free-1", 5, "mcp_draft_outreach")

    def test_deduct_failure_logged_but_does_not_raise(self):
        """deduct_credits_atomic returns (False, remaining) on
        insufficient — log and proceed. Same pattern as
        routes/runs.py:824-833 and find_contacts."""
        with patch("app.services.auth.deduct_credits_atomic") as ded:
            ded.return_value = (False, 2)  # Had 2, needed 5
            # Must not raise
            draft_outreach._deduct_credits_for_draft(_free_user_ctx())
            ded.assert_called_once()


# ── 3. Insufficient credits → paywall, no LLM call ────────────────────────


class TestInsufficientCreditsBlocksDraft:
    def _setup_user(self, fake_db, uid, credits):
        from datetime import datetime
        fake_db.collection("users").document(uid).set({
            "credits": credits,
            "maxCredits": 500,
            "lastCreditReset": datetime.now().isoformat(),
            "subscriptionTier": "free",
        })

    def test_pre_check_returns_paywall_when_short(self, fake_db):
        """Signed-in user with 3 credits requests one draft (cost=5).
        Pre-check returns a paywall, NOT None."""
        self._setup_user(fake_db, "broke-user", credits=3)
        import app.extensions
        with patch.object(app.extensions, "get_db", return_value=fake_db):
            result = draft_outreach._credit_pre_check_draft(
                _free_user_ctx("broke-user"), ip_hash="ip-x",
            )
        assert result is not None
        assert result.hit_cap_type == "credits"
        assert "5" in result.message  # CREDITS_PER_DRAFT

    def test_pre_check_returns_none_at_exactly_5_credits(self, fake_db):
        """Boundary: exactly the draft cost → pre-check clears."""
        self._setup_user(fake_db, "edge-user", credits=5)
        import app.extensions
        with patch.object(app.extensions, "get_db", return_value=fake_db):
            result = draft_outreach._credit_pre_check_draft(
                _free_user_ctx("edge-user"), ip_hash="ip-x",
            )
        assert result is None

    def test_pre_check_returns_none_when_sufficient(self, fake_db):
        self._setup_user(fake_db, "rich-user", credits=500)
        import app.extensions
        with patch.object(app.extensions, "get_db", return_value=fake_db):
            result = draft_outreach._credit_pre_check_draft(
                _free_user_ctx("rich-user"), ip_hash="ip-x",
            )
        assert result is None

    def test_pre_check_missing_user_doc_does_not_gate(self, fake_db):
        """If user_ctx has a uid but Firestore has no matching doc
        (shouldn't happen post-OAuth but defensive), return None — let
        the request through and rely on deduction step's fail-soft.
        Lock-outs are worse than soft-charges."""
        import app.extensions
        with patch.object(app.extensions, "get_db", return_value=fake_db):
            result = draft_outreach._credit_pre_check_draft(
                _free_user_ctx("ghost-user"), ip_hash="ip-x",
            )
        assert result is None

    def test_pre_check_firestore_error_does_not_gate(self):
        """Transient Firestore error during pre-check shouldn't lock
        users out. Log and let the request through."""
        import app.extensions
        class Boom:
            def collection(self, *a, **kw):
                raise RuntimeError("firestore unreachable")
        with patch.object(app.extensions, "get_db", return_value=Boom()):
            result = draft_outreach._credit_pre_check_draft(
                _free_user_ctx("any-user"), ip_hash="ip-x",
            )
        assert result is None
