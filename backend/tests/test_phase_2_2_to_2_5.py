"""Tests for Phase 2.2 / 2.3 / 2.4 / 2.5 of the bounce-reduction plan.

These cover the gates that stop unverified / suppressed / rate-limited
addresses from being shipped as Gmail drafts.
"""
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------- 2.2
class TestPhase22EmailQualityGate:
    """execute_find_and_draft must skip Gmail drafting when adjacency_metadata
    flags email_quality="low".

    execute_find_and_draft is a single ~400-line function with heavy I/O —
    a full integration mock is brittle. We pin the gate with a source-level
    assertion instead. If the gate is renamed / removed, this trips and a
    human must restore the intent.
    """

    def test_low_email_quality_gate_present_in_source(self):
        import inspect

        from app.services import agent_actions
        src = inspect.getsource(agent_actions.execute_find_and_draft)

        # The metadata must be captured from the tuple return.
        assert "adjacency_metadata = result[3]" in src, (
            "execute_find_and_draft must capture adjacency_metadata[3] "
            "from search_contacts_from_prompt's tuple return"
        )
        # The gate variable must exist.
        assert 'low_email_quality' in src and '"email_quality"' in src and '"low"' in src, (
            "execute_find_and_draft must compute low_email_quality from "
            "adjacency_metadata['email_quality']"
        )
        # The draft path must respect the gate.
        assert "not low_email_quality" in src, (
            "Gmail draft creation must be gated by `not low_email_quality`"
        )
        # The contact doc must surface the needs_verification status.
        assert '"needs_verification"' in src, (
            "low-quality contacts must be stamped emailVerificationStatus=needs_verification"
        )


# ---------------------------------------------------------------- 2.3
class TestPhase23CatchAllDropped:
    """NeverBounce ACCEPT_ALL / CATCHALL results must be dropped, not
    retained as a low-score 'neverbounce_acceptall' candidate."""

    def test_catchall_returns_none_email(self):
        # Exercise the inline _nb_upgrade closure by patching neverbounce_client
        # and walking batch_verify_emails_for_contacts with a single contact
        # whose pattern email NeverBounce flags as catch-all.
        from app.services import hunter
        from app.services import neverbounce_client as nb

        contact = {"FirstName": "Jane", "LastName": "Doe", "Company": "Acme", "pdl_email": None}

        with (
            patch.object(hunter, "get_smart_company_domain", return_value="acme.com"),
            patch.object(hunter, "get_domain_pattern", return_value="{first}.{last}"),
            patch.object(hunter, "find_email_with_hunter", return_value=(None, 0)),
            patch.object(hunter, "generate_email_from_pattern", return_value="jane.doe@acme.com"),
            patch.object(nb, "is_configured", return_value=True),
            patch.object(nb, "verify_email", return_value={"result": nb.RESULT_ACCEPT_ALL}),
        ):
            results = hunter.batch_verify_emails_for_contacts([contact], target_company="Acme")

        assert 0 in results
        payload = results[0]
        # Catch-all dropped: no email, source None
        assert payload.get("email") is None, f"expected catchall to be dropped, got {payload!r}"
        assert payload.get("source") is None


# ---------------------------------------------------------------- 2.4
class TestPhase24SuppressionGate:
    """create_gmail_draft_for_user must skip drafting suppressed addresses."""

    def test_suppressed_returns_sentinel_no_gmail_call(self):
        from app.services import gmail_client

        contact = {"FirstName": "Jane", "LastName": "Doe", "WorkEmail": "jane@acme.com"}

        with (
            patch.object(gmail_client, "get_gmail_service_for_user") as mock_svc,
            patch("app.services.suppression.is_suppressed", return_value=True),
        ):
            mock_svc.return_value = MagicMock()
            mock_svc.return_value.users().getProfile().execute.return_value = {"emailAddress": "me@x.com"}

            result = gmail_client.create_gmail_draft_for_user(
                contact=contact,
                email_subject="hi",
                email_body="body",
                tier="elite",
                user_email="me@x.com",
                user_id="uid-1",
            )

        # Sentinel string, NOT a draft dict
        assert isinstance(result, str)
        assert result.startswith("suppressed_"), f"expected suppressed sentinel, got {result!r}"
        # The Gmail service was fetched (to read profile) but drafts.create was NOT called
        assert not mock_svc.return_value.users().drafts().create.called, (
            "drafts().create() should NOT have been called for a suppressed address"
        )

    def test_unsuppressed_proceeds_to_draft_path(self):
        from app.services import gmail_client

        contact = {"FirstName": "Jane", "LastName": "Doe", "WorkEmail": "jane@acme.com"}

        with (
            patch.object(gmail_client, "get_gmail_service_for_user") as mock_svc,
            patch("app.services.suppression.is_suppressed", return_value=False),
        ):
            svc = MagicMock()
            mock_svc.return_value = svc
            svc.users().getProfile().execute.return_value = {"emailAddress": "me@x.com"}
            # Make drafts.create raise so we exit before fully building the MIME
            # message — we just need to confirm we PROCEEDED past the suppression
            # gate.
            svc.users().drafts().create().execute.side_effect = RuntimeError("stop here")

            result = gmail_client.create_gmail_draft_for_user(
                contact=contact,
                email_subject="hi",
                email_body="body",
                tier="elite",
                user_email="me@x.com",
                user_id="uid-1",
            )

        # Exception path returns the mock_..._unknown sentinel; key check is
        # that we did NOT return the suppressed sentinel.
        assert not (isinstance(result, str) and result.startswith("suppressed_")), (
            f"unsuppressed address was wrongly blocked: {result!r}"
        )


# ---------------------------------------------------------------- 2.5
class TestPhase25HunterRateLimited:
    """find_email_with_hunter must return (None, -1) on 429 exhaustion,
    and the batch caller must NOT fall through to pattern synthesis."""

    def test_429_returns_minus_one_sentinel(self):
        from app.services import hunter

        # Simulate Hunter returning 429 on every attempt (max_retries=1 by default,
        # so one 429 → sentinel).
        mock_response = MagicMock()
        mock_response.status_code = 429

        with patch("app.services.hunter.requests.get", return_value=mock_response):
            email, score = hunter.find_email_with_hunter("Jane", "Doe", "acme.com", api_key="test-key")

        assert email is None
        assert score == -1, f"expected -1 sentinel on rate limit, got {score!r}"

    def test_batch_skips_pattern_on_rate_limit(self):
        """When Hunter Finder is rate-limited, batch_verify_emails_for_contacts
        must NOT synthesize a pattern email — the contact should land with
        email=None so downstream marks it low-quality."""
        from app.services import hunter
        from app.services import neverbounce_client as nb

        contact = {"FirstName": "Jane", "LastName": "Doe", "Company": "Acme", "pdl_email": None}

        with (
            patch.object(hunter, "get_smart_company_domain", return_value="acme.com"),
            # Pattern is available — but should not be used on rate-limit
            patch.object(hunter, "get_domain_pattern", return_value="{first}.{last}"),
            patch.object(hunter, "find_email_with_hunter", return_value=(None, -1)),
            patch.object(hunter, "generate_email_from_pattern") as mock_gen,
            patch.object(nb, "is_configured", return_value=False),  # disable upgrade pass for clarity
        ):
            results = hunter.batch_verify_emails_for_contacts([contact], target_company="Acme")

        assert 0 in results
        payload = results[0]
        assert payload.get("email") is None, f"pattern was synthesized despite rate limit: {payload!r}"
        assert payload.get("reason") == "hunter_rate_limited"
        assert not mock_gen.called, "generate_email_from_pattern was called despite Hunter rate limit"
