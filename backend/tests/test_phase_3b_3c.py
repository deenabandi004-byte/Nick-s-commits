"""Tests for Phase 3b (tighter PDL query at level 0) and Phase 3c
(per-contact low-confidence gate in create_gmail_draft_for_user)."""
from unittest.mock import MagicMock, patch

from app.services import pdl_client
from app.services import gmail_client


# ------------------------------------------------------------------ 3b
class TestPhase3bWorkEmailFilter:
    """build_query_from_prompt must NOT include exists:work_email at any retry
    level. Phase 3b's level-0 filter was removed after it caused empty results
    for queries with rich PDL coverage but sparse top-level work_email field
    (Berkeley + Google SWE). Hunter waterfall fills the email gap, and Phase 3c's
    draft-time gate is the real deliverability protection."""

    def _has_work_email_exists_clause(self, query: dict) -> bool:
        must = (query.get("bool") or {}).get("must") or []
        for clause in must:
            ex = clause.get("exists") or {}
            if ex.get("field") == "work_email":
                return True
        return False

    def _parsed_prompt(self):
        return {
            "companies": [{"name": "Acme"}],
            "title_variations": ["pm"],
            "industries": [],
            "schools": [],
            "locations": [],
        }

    def test_level_0_does_not_require_work_email(self):
        q = pdl_client.build_query_from_prompt(self._parsed_prompt(), retry_level=0)
        assert not self._has_work_email_exists_clause(q), (
            f"level 0 must NOT require exists:work_email — Hunter resolves "
            f"emails for records that only have emails[]. Got {q!r}"
        )

    def test_level_1_does_not_require_work_email(self):
        q = pdl_client.build_query_from_prompt(self._parsed_prompt(), retry_level=1)
        assert not self._has_work_email_exists_clause(q), (
            f"level 1 query must NOT require exists:work_email (would over-narrow "
            f"the topup rung). Got {q!r}"
        )

    def test_level_2_does_not_require_work_email(self):
        q = pdl_client.build_query_from_prompt(self._parsed_prompt(), retry_level=2)
        assert not self._has_work_email_exists_clause(q)

    def test_level_3_does_not_require_work_email(self):
        q = pdl_client.build_query_from_prompt(self._parsed_prompt(), retry_level=3)
        assert not self._has_work_email_exists_clause(q)

    def test_emails_exists_clause_still_present_at_all_levels(self):
        """The pre-existing exists:emails filter must stay at every level
        (otherwise we'd start drafting contacts with no email at all)."""
        for lvl in (0, 1, 2, 3):
            q = pdl_client.build_query_from_prompt(self._parsed_prompt(), retry_level=lvl)
            must = (q.get("bool") or {}).get("must") or []
            has_emails = any(
                (c.get("exists") or {}).get("field") == "emails" for c in must
            )
            assert has_emails, f"level {lvl} must still require exists:emails"


# ------------------------------------------------------------------ 3c
class TestPhase3cLowConfidenceGate:
    """create_gmail_draft_for_user must skip drafting when EmailSource is
    explicitly in the low-confidence set. Manual contacts (no EmailSource)
    must NOT be affected."""

    def _gmail_service_mock(self):
        svc = MagicMock()
        svc.users().getProfile().execute.return_value = {"emailAddress": "me@x.com"}
        return svc

    def _run(self, contact):
        with (
            patch.object(gmail_client, "get_gmail_service_for_user") as mock_svc,
            patch("app.services.suppression.is_suppressed", return_value=False),
        ):
            mock_svc.return_value = self._gmail_service_mock()
            # Make drafts.create raise so we exit before the full MIME build;
            # we only care about whether we passed the gates or not.
            mock_svc.return_value.users().drafts().create().execute.side_effect = RuntimeError("stop here")

            return gmail_client.create_gmail_draft_for_user(
                contact=contact,
                email_subject="hi",
                email_body="body",
                tier="elite",
                user_email="me@x.com",
                user_id="uid-1",
            )

    def test_pattern_source_returns_low_confidence_sentinel(self):
        result = self._run({
            "FirstName": "Jane", "LastName": "Doe",
            "WorkEmail": "jane.doe@acme.com",
            "EmailSource": "pattern",
        })
        assert isinstance(result, str) and result.startswith("low_confidence_"), (
            f"pattern source should return low_confidence sentinel, got {result!r}"
        )

    def test_domain_generated_source_blocked(self):
        result = self._run({
            "FirstName": "Jane", "LastName": "Doe",
            "WorkEmail": "jane.doe@acme.com",
            "EmailSource": "domain_generated",
        })
        assert isinstance(result, str) and result.startswith("low_confidence_")

    def test_pdl_fallback_blocked(self):
        result = self._run({
            "FirstName": "Jane", "LastName": "Doe",
            "WorkEmail": "jane@oldco.com",
            "EmailSource": "pdl_fallback",
        })
        assert isinstance(result, str) and result.startswith("low_confidence_")

    def test_hunter_finder_risky_blocked(self):
        result = self._run({
            "FirstName": "Jane", "LastName": "Doe",
            "WorkEmail": "jane@acme.com",
            "EmailSource": "hunter_finder_risky",
        })
        assert isinstance(result, str) and result.startswith("low_confidence_")

    def test_high_confidence_pdl_proceeds(self):
        result = self._run({
            "FirstName": "Jane", "LastName": "Doe",
            "WorkEmail": "jane@acme.com",
            "EmailSource": "pdl",
        })
        # Should NOT be a low_confidence sentinel — we passed the gate and
        # only stopped because the mocked drafts.create raised.
        assert not (isinstance(result, str) and result.startswith("low_confidence_")), (
            f"pdl source should NOT be blocked, got {result!r}"
        )

    def test_high_confidence_hunter_finder_proceeds(self):
        result = self._run({
            "FirstName": "Jane", "LastName": "Doe",
            "WorkEmail": "jane@acme.com",
            "EmailSource": "hunter_finder",
        })
        assert not (isinstance(result, str) and result.startswith("low_confidence_"))

    def test_neverbounce_verified_proceeds(self):
        result = self._run({
            "FirstName": "Jane", "LastName": "Doe",
            "WorkEmail": "jane@acme.com",
            "EmailSource": "neverbounce_verified",
        })
        assert not (isinstance(result, str) and result.startswith("low_confidence_"))

    def test_manual_contact_no_email_source_proceeds(self):
        """Contacts without EmailSource (CSV import, LinkedIn extension,
        referral) must NOT be blocked — the field is the signal, absence
        means we can't classify."""
        result = self._run({
            "FirstName": "Manual", "LastName": "Contact",
            "WorkEmail": "manual@some-domain.com",
            # NO EmailSource field
        })
        assert not (isinstance(result, str) and result.startswith("low_confidence_")), (
            f"manual contact (no EmailSource) was wrongly blocked: {result!r}"
        )

    def test_empty_email_source_proceeds(self):
        """Empty string EmailSource is treated as 'unknown' — not blocked."""
        result = self._run({
            "FirstName": "Jane", "LastName": "Doe",
            "WorkEmail": "jane@acme.com",
            "EmailSource": "",
        })
        assert not (isinstance(result, str) and result.startswith("low_confidence_"))
