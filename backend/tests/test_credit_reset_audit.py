"""
Credit reset audit tests - covers all 6 issues found in the credit system audit.
"""
import re
import ast
import os
import pytest


def _read_file(relative_path: str) -> str:
    path = os.path.join(os.path.dirname(__file__), '..', relative_path)
    with open(path) as f:
        return f.read()


# =============================================================================
# P0 #1 - NameError in /api/check-credits (tier used before defined)
# =============================================================================

class TestCheckCreditsNameError:
    """billing.py check_credits must define 'tier' before using it."""

    def test_tier_defined_before_max_credits(self):
        """'tier' must be assigned before it's used in TIER_CONFIGS.get(tier, ...)."""
        content = _read_file('app/routes/billing.py')
        # Find the check_credits function
        func_start = content.find('def check_credits():')
        assert func_start > 0, "check_credits function not found"
        func_section = content[func_start:func_start + 2000]

        # Find positions of tier assignment and tier usage in TIER_CONFIGS.get()
        tier_assign = func_section.find("tier = user_data.get('tier'")
        tier_usage = func_section.find("TIER_CONFIGS.get(tier,")

        assert tier_assign > 0, "tier assignment not found"
        assert tier_usage > 0, "TIER_CONFIGS.get(tier, ...) not found"
        assert tier_assign < tier_usage, (
            f"tier is used at offset {tier_usage} before being defined at {tier_assign}"
        )


# =============================================================================
# P0 #2 - Transaction atomicity: reset must not call user_ref.update()
# =============================================================================

class TestTransactionAtomicity:
    """deduct/refund transactions must not call check_and_reset_credits (which writes outside tx)."""

    def test_deduct_uses_check_reset_needed(self):
        """deduct_credits_atomic must use _check_reset_needed, not check_and_reset_credits."""
        content = _read_file('app/services/auth.py')
        # Find deduct_in_transaction
        idx = content.find('def deduct_in_transaction(transaction):')
        assert idx > 0
        func_body = content[idx:content.find('\n    try:', idx)]
        assert '_check_reset_needed' in func_body, (
            "deduct_in_transaction should use _check_reset_needed"
        )
        assert 'check_and_reset_credits' not in func_body, (
            "deduct_in_transaction should NOT call check_and_reset_credits (breaks atomicity)"
        )

    def test_refund_uses_check_reset_needed(self):
        """refund_credits_atomic must use _check_reset_needed, not check_and_reset_credits."""
        content = _read_file('app/services/auth.py')
        idx = content.find('def refund_in_transaction(transaction):')
        assert idx > 0
        func_body = content[idx:content.find('\n    try:', idx)]
        assert '_check_reset_needed' in func_body
        assert 'check_and_reset_credits' not in func_body

    def test_check_reset_needed_is_pure(self):
        """_check_reset_needed must not call user_ref.update or any Firestore write."""
        content = _read_file('app/services/auth.py')
        idx = content.find('def _check_reset_needed(')
        assert idx > 0
        # Find end of function (next def at same indent level)
        next_def = content.find('\ndef ', idx + 1)
        func_body = content[idx:next_def] if next_def > 0 else content[idx:]
        assert '.update(' not in func_body, "_check_reset_needed must not write to Firestore"
        assert '.set(' not in func_body, "_check_reset_needed must not write to Firestore"


# =============================================================================
# P1 #3 - Invoice webhook idempotency
# =============================================================================

class TestInvoiceIdempotency:
    """handle_invoice_paid must track invoice ID to prevent double resets."""

    def test_invoice_id_tracked(self):
        """handle_invoice_paid must save lastProcessedInvoiceId."""
        content = _read_file('app/services/stripe_client.py')
        idx = content.find('def handle_invoice_paid(')
        assert idx > 0
        func_body = content[idx:]
        assert 'lastProcessedInvoiceId' in func_body, (
            "handle_invoice_paid must track invoice ID for idempotency"
        )

    def test_duplicate_invoice_skipped(self):
        """handle_invoice_paid must check lastProcessedInvoiceId before resetting."""
        content = _read_file('app/services/stripe_client.py')
        idx = content.find('def handle_invoice_paid(')
        func_body = content[idx:]
        # Must check last_invoice before doing the update
        check_pos = func_body.find('lastProcessedInvoiceId')
        update_pos = func_body.find("'credits': tier_config")
        assert check_pos < update_pos, (
            "Must check lastProcessedInvoiceId BEFORE resetting credits"
        )

    def test_invoice_id_extracted_from_event(self):
        """handle_invoice_paid must extract invoice ID from the event."""
        content = _read_file('app/services/stripe_client.py')
        idx = content.find('def handle_invoice_paid(')
        func_body = content[idx:idx + 1000]
        assert "invoice.get('id')" in func_body, (
            "Must extract invoice ID from event data"
        )


# =============================================================================
# P1 #4 - Downgrade must set lastCreditReset
# =============================================================================

class TestDowngradeResetDate:
    """handle_subscription_deleted must set lastCreditReset."""

    def test_downgrade_sets_last_credit_reset(self):
        content = _read_file('app/services/stripe_client.py')
        idx = content.find('def handle_subscription_deleted(')
        assert idx > 0
        func_body = content[idx:]
        # Find the update call within this function
        update_section = func_body[:func_body.find('def ', 10)]
        assert 'lastCreditReset' in update_section, (
            "handle_subscription_deleted must set lastCreditReset on downgrade"
        )


# =============================================================================
# P2 #5 - Usage reset uses calendar month (consistent with credit reset)
# =============================================================================

class TestUsageResetConsistency:
    """Usage reset should use calendar month, not rolling 30 days."""

    def test_usage_reset_uses_calendar_month(self):
        """check_and_reset_usage must compare year/month, not days_since_reset >= 30."""
        content = _read_file('app/services/auth.py')
        idx = content.find('def check_and_reset_usage(')
        assert idx > 0
        func_body = content[idx:content.find('\ndef ', idx + 1)]
        # Should NOT use "days_since_reset >= 30" pattern
        assert 'days_since_reset' not in func_body, (
            "check_and_reset_usage should use calendar month, not rolling 30 days"
        )
        # Should use month comparison like credit reset
        assert 'now.month' in func_body, (
            "check_and_reset_usage should compare calendar months"
        )


# =============================================================================
# P2 #6 - Checkout webhook must set lastCreditReset
# =============================================================================

class TestCheckoutSetsResetDate:
    """handle_checkout_completed must set lastCreditReset."""

    def test_checkout_sets_last_credit_reset(self):
        content = _read_file('app/services/stripe_client.py')
        idx = content.find('def handle_checkout_completed(')
        assert idx > 0
        # Find the update call within this function
        next_def = content.find('\ndef ', idx + 1)
        func_body = content[idx:next_def]
        assert 'lastCreditReset' in func_body, (
            "handle_checkout_completed must set lastCreditReset"
        )


# =============================================================================
# Regression: auth.py uses logger, not print
# =============================================================================

class TestAuthUsesLogger:
    """auth.py should use logger, not print."""

    def test_no_print_in_auth(self):
        content = _read_file('app/services/auth.py')
        lines = content.split('\n')
        violations = []
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            if stripped.startswith('print('):
                violations.append(f"Line {i}: {stripped[:80]}")
        assert not violations, (
            f"Found print() in auth.py (should use logger):\n" + "\n".join(violations)
        )

    def test_logger_defined(self):
        content = _read_file('app/services/auth.py')
        assert 'logger = logging.getLogger' in content
