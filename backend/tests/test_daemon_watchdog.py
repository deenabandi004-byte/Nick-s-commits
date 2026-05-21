"""Tests for daemon healthcheck watchdog staleness logic."""
import os
import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone, timedelta

os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", "test-credentials.json")


class TestWatchdogStaleness:
    """Test the staleness detection logic used by the watchdog.

    These tests verify the threshold calculations without starting real threads.
    """

    # Thresholds from wsgi.py
    THRESHOLDS = {
        "nudge_scanner": 8 * 3600,
        "queue_scanner": 7 * 24 * 3600,
        "aggregation_scanner": 8 * 24 * 3600,
        "gmail_watch": 7 * 24 * 3600,
    }

    def _is_stale(self, last_success_str, threshold_seconds, now=None):
        """Replicate the watchdog staleness check."""
        if now is None:
            now = datetime.now(timezone.utc)
        last_success = datetime.fromisoformat(
            last_success_str.replace("Z", "+00:00")
        )
        age_seconds = (now - last_success).total_seconds()
        return age_seconds > threshold_seconds

    def test_nudge_scanner_fresh_after_6_hours(self):
        now = datetime(2026, 4, 10, 12, 0, 0, tzinfo=timezone.utc)
        last = (now - timedelta(hours=6)).isoformat().replace("+00:00", "Z")
        assert not self._is_stale(last, self.THRESHOLDS["nudge_scanner"], now)

    def test_nudge_scanner_stale_after_9_hours(self):
        now = datetime(2026, 4, 10, 12, 0, 0, tzinfo=timezone.utc)
        last = (now - timedelta(hours=9)).isoformat().replace("+00:00", "Z")
        assert self._is_stale(last, self.THRESHOLDS["nudge_scanner"], now)

    def test_nudge_scanner_boundary_at_8_hours(self):
        now = datetime(2026, 4, 10, 12, 0, 0, tzinfo=timezone.utc)
        last = (now - timedelta(hours=8, seconds=1)).isoformat().replace("+00:00", "Z")
        assert self._is_stale(last, self.THRESHOLDS["nudge_scanner"], now)

    def test_queue_scanner_fresh_after_6_days(self):
        now = datetime(2026, 4, 10, 12, 0, 0, tzinfo=timezone.utc)
        last = (now - timedelta(days=6)).isoformat().replace("+00:00", "Z")
        assert not self._is_stale(last, self.THRESHOLDS["queue_scanner"], now)

    def test_queue_scanner_stale_after_8_days(self):
        now = datetime(2026, 4, 10, 12, 0, 0, tzinfo=timezone.utc)
        last = (now - timedelta(days=8)).isoformat().replace("+00:00", "Z")
        assert self._is_stale(last, self.THRESHOLDS["queue_scanner"], now)

    def test_aggregation_scanner_fresh_after_7_days(self):
        now = datetime(2026, 4, 10, 12, 0, 0, tzinfo=timezone.utc)
        last = (now - timedelta(days=7)).isoformat().replace("+00:00", "Z")
        assert not self._is_stale(last, self.THRESHOLDS["aggregation_scanner"], now)

    def test_aggregation_scanner_stale_after_9_days(self):
        now = datetime(2026, 4, 10, 12, 0, 0, tzinfo=timezone.utc)
        last = (now - timedelta(days=9)).isoformat().replace("+00:00", "Z")
        assert self._is_stale(last, self.THRESHOLDS["aggregation_scanner"], now)

    def test_gmail_watch_fresh_after_6_days(self):
        now = datetime(2026, 4, 10, 12, 0, 0, tzinfo=timezone.utc)
        last = (now - timedelta(days=6)).isoformat().replace("+00:00", "Z")
        assert not self._is_stale(last, self.THRESHOLDS["gmail_watch"], now)

    def test_gmail_watch_stale_after_8_days(self):
        now = datetime(2026, 4, 10, 12, 0, 0, tzinfo=timezone.utc)
        last = (now - timedelta(days=8)).isoformat().replace("+00:00", "Z")
        assert self._is_stale(last, self.THRESHOLDS["gmail_watch"], now)


# ---------------------------------------------------------------------------
# Tracker daemon loop wiring - C2 coordination PR
# ---------------------------------------------------------------------------
#
# These tests are source-level: they read wsgi.py and assert that the
# three scanners are wired into the shared daemon loop with:
#   1. Per-scanner kill switch env var
#   2. Per-scanner try/except isolation (one crash must not block others)
#   3. The exact scanner function names from the daemon contract
#   4. app_context() around each invocation
#
# Contract: docs/designs/tracker-daemon-contract.md

import pathlib


class TestDaemonLoopWiring:
    """Assert wsgi.py wires all three scanners per daemon contract."""

    @staticmethod
    def _read_wsgi() -> str:
        wsgi_path = pathlib.Path(__file__).resolve().parents[1] / "wsgi.py"
        return wsgi_path.read_text()

    def test_nudge_scanner_wired(self):
        """Nudge scanner imports scan_and_generate_nudges under NUDGES_ENABLED."""
        src = self._read_wsgi()
        assert "NUDGES_ENABLED" in src
        assert "scan_and_generate_nudges" in src
        assert "from .app.services.nudge_service import scan_and_generate_nudges" in src

    def test_queue_scanner_wired(self):
        """Queue scanner imports scan_and_generate_queues under QUEUE_SCANNER_ENABLED."""
        src = self._read_wsgi()
        assert "QUEUE_SCANNER_ENABLED" in src
        assert "scan_and_generate_queues" in src
        assert "from .app.services.queue_service import scan_and_generate_queues" in src

    def test_aggregation_scanner_wired(self):
        """Aggregation scanner imports aggregate_email_outcomes under AGGREGATION_SCANNER_ENABLED."""
        src = self._read_wsgi()
        assert "AGGREGATION_SCANNER_ENABLED" in src
        assert "aggregate_email_outcomes" in src
        assert "from .app.services.email_baseline import aggregate_email_outcomes" in src

    def test_each_scanner_has_try_except_isolation(self):
        """
        A crash in one scanner MUST NOT block the others. Each scanner
        block should have its own try/except that catches Exception.
        Count try: lines between the nudge/queue/aggregation markers.
        """
        src = self._read_wsgi()
        # Locate the three scanner blocks by their ENV var names
        nudge_idx = src.find("NUDGES_ENABLED")
        queue_idx = src.find("QUEUE_SCANNER_ENABLED")
        agg_idx = src.find("AGGREGATION_SCANNER_ENABLED")
        assert nudge_idx < queue_idx < agg_idx, \
            "Scanners should be ordered nudge → queue → aggregation in wsgi.py"

        # Between nudge and queue markers: exactly one try: and one except
        nudge_block = src[nudge_idx:queue_idx]
        assert nudge_block.count("try:") == 1
        assert "except Exception:" in nudge_block

        # Between queue and aggregation markers
        queue_block = src[queue_idx:agg_idx]
        assert queue_block.count("try:") == 1
        assert "except Exception:" in queue_block

        # From aggregation to end of the scanner loop (approximated by
        # watchdog / Gmail renewal marker)
        next_marker = src.find("Gmail watch renewal", agg_idx)
        if next_marker < 0:
            next_marker = len(src)
        agg_block = src[agg_idx:next_marker]
        assert agg_block.count("try:") == 1
        assert "except Exception:" in agg_block

    def test_each_scanner_wrapped_in_app_context(self):
        """Every scanner invocation must run inside app.app_context()."""
        src = self._read_wsgi()
        for scanner in (
            "scan_and_generate_nudges",
            "scan_and_generate_queues",
            "aggregate_email_outcomes",
        ):
            idx = src.find(scanner + "()")
            assert idx > 0, f"{scanner}() call site not found in wsgi.py"
            # The nearest preceding 500 chars should contain "app.app_context()"
            preceding = src[max(0, idx - 500):idx]
            assert "app.app_context()" in preceding, (
                f"{scanner}() must be called inside app.app_context()"
            )

    def test_watchdog_staleness_covers_all_three_scanners(self):
        """_STALENESS dict must list all three scanner health doc names."""
        src = self._read_wsgi()
        assert '"nudge_scanner"' in src
        assert '"queue_scanner"' in src
        assert '"aggregation_scanner"' in src
        assert '"gmail_watch"' in src

    def test_scanner_ordering_matches_contract(self):
        """
        Contract ordering: nudge (6h), queue (Tuesday), aggregation (Sun 3-9a).
        Ordering matters because each block's early-return gates fire
        independently; execution order is documented in the contract so
        that ops can reason about relative load.
        """
        src = self._read_wsgi()
        nudge = src.find("NUDGES_ENABLED")
        queue = src.find("QUEUE_SCANNER_ENABLED")
        agg = src.find("AGGREGATION_SCANNER_ENABLED")
        assert 0 < nudge < queue < agg
