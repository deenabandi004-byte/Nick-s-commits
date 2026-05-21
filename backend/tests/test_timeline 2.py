"""Tests for timeline route - tier gating, credit deduction, and validation."""
import os
import json
import pytest
from unittest.mock import patch, MagicMock

os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", "test-credentials.json")

FAKE_USER = {"uid": "test-user-1", "email": "test@example.com"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user_doc(tier="pro", credits=100):
    doc = MagicMock()
    doc.exists = True
    doc.to_dict.return_value = {
        "subscriptionTier": tier,
        "tier": tier,
        "credits": credits,
        "maxCredits": 1500,
    }
    return doc


def _mock_openai_response(phases_json):
    mock_resp = MagicMock()
    mock_resp.choices = [MagicMock()]
    mock_resp.choices[0].message.content = json.dumps(phases_json)
    return mock_resp


VALID_TIMELINE_RESPONSE = {
    "phases": [
        {
            "name": "Research & Target Firms",
            "startMonth": "Sep 2026",
            "endMonth": "Oct 2026",
            "goals": ["Identify 50 target firms", "Research company cultures"],
            "description": "Build your target list and research companies",
        },
        {
            "name": "Networking",
            "startMonth": "Nov 2026",
            "endMonth": "Dec 2026",
            "goals": ["Reach out to 20 contacts", "Attend info sessions"],
            "description": "Build relationships with professionals in target firms",
        },
        {
            "name": "Applications",
            "startMonth": "Jan 2027",
            "endMonth": "Feb 2027",
            "goals": ["Submit 30 applications", "Customize resumes"],
            "description": "Apply to target roles with tailored materials",
        },
        {
            "name": "Interview Prep",
            "startMonth": "Mar 2027",
            "endMonth": "Apr 2027",
            "goals": ["Practice behavioral questions", "Do mock interviews"],
            "description": "Prepare for interviews with practice and coaching",
        },
    ]
}

VALID_REQUEST = {
    "role": "Investment Banking Analyst",
    "industry": "Finance",
    "startDate": "2026-09-01",
    "targetDate": "2027-06-01",
    "numApplications": 30,
}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _bypass_firebase_auth():
    """Bypass real Firebase auth - same pattern as test_nudges_routes.py."""
    with patch("firebase_admin._apps", {"[DEFAULT]": MagicMock()}), \
         patch("firebase_admin.auth.verify_id_token", return_value=FAKE_USER):
        yield


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestTimelineTierGate:
    """Free tier users should be blocked by @require_tier(['pro', 'elite'])."""

    def test_free_user_gets_403(self, client):
        mock_db = MagicMock()
        mock_db.collection.return_value.document.return_value.get.return_value = (
            _make_user_doc(tier="free", credits=300)
        )
        with patch("app.extensions.get_db", return_value=mock_db):
            resp = client.post(
                "/api/timeline/generate",
                json=VALID_REQUEST,
                headers={"Authorization": "Bearer fake-token"},
            )

        assert resp.status_code == 403
        data = resp.get_json()
        assert data.get("error") == "Upgrade required"


class TestTimelineCreditGate:
    """Pro user with insufficient credits should get 402."""

    def test_insufficient_credits_gets_402(self, client):
        mock_db = MagicMock()
        mock_db.collection.return_value.document.return_value.get.return_value = (
            _make_user_doc(tier="pro", credits=5)
        )
        with patch("app.extensions.get_db", return_value=mock_db), \
             patch("backend.app.routes.timeline.deduct_credits_atomic", return_value=(False, 5)):
            resp = client.post(
                "/api/timeline/generate",
                json=VALID_REQUEST,
                headers={"Authorization": "Bearer fake-token"},
            )

        assert resp.status_code == 402
        data = resp.get_json()
        assert "credits" in data.get("error", "").lower()


class TestTimelineValidation:
    """Malformed requests should return 400."""

    def test_missing_required_fields_gets_400(self, client):
        mock_db = MagicMock()
        mock_db.collection.return_value.document.return_value.get.return_value = (
            _make_user_doc(tier="pro", credits=100)
        )
        with patch("app.extensions.get_db", return_value=mock_db), \
             patch("backend.app.routes.timeline.deduct_credits_atomic", return_value=(True, 90)):
            resp = client.post(
                "/api/timeline/generate",
                json={},
                headers={"Authorization": "Bearer fake-token"},
            )

        assert resp.status_code == 400


class TestTimelineHappyPath:
    """Pro user with credits generates timeline successfully."""

    def test_pro_user_generates_timeline(self, client):
        mock_db = MagicMock()
        mock_db.collection.return_value.document.return_value.get.return_value = (
            _make_user_doc(tier="pro", credits=100)
        )
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = _mock_openai_response(
            VALID_TIMELINE_RESPONSE
        )

        with patch("app.extensions.get_db", return_value=mock_db), \
             patch("backend.app.routes.timeline.deduct_credits_atomic", return_value=(True, 90)) as mock_deduct, \
             patch("backend.app.routes.timeline.get_openai_client", return_value=mock_client):
            resp = client.post(
                "/api/timeline/generate",
                json=VALID_REQUEST,
                headers={"Authorization": "Bearer fake-token"},
            )

        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert len(data["timeline"]["phases"]) == 4
        assert data["startDate"] == "2026-09-01"
        assert data["targetDeadline"] == "2027-06-01"

        mock_deduct.assert_called_once_with("test-user-1", 10, "timeline_generation")
