"""
Unit tests for the resume scoring service (app.services.resume_scoring) and
a route-level smoke test for POST /api/resume/score.
"""
import json

import pytest
from unittest.mock import MagicMock, patch

from app.services.resume_scoring import score_resume_structured

pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

def _sample_parsed():
    return {
        "name": "Jane Doe",
        "contact": {"email": "jane@example.com", "phone": "", "location": "",
                    "linkedin": "", "github": "", "website": ""},
        "objective": "",
        "education": {
            "university": "University of Southern California",
            "degree": "Bachelor of Science",
            "major": "Computer Science",
            "graduation": "May 2026",
            "gpa": "3.8",
            "location": "Los Angeles, CA",
        },
        "experience": [
            {
                "company": "Acme Corp",
                "title": "Software Engineering Intern",
                "dates": "Jun 2025 - Aug 2025",
                "location": "Remote",
                "bullets": [
                    "Worked on backend systems",
                    "Helped the team with various tasks",
                ],
            }
        ],
        "projects": [
            {
                "name": "Resume Analyzer",
                "description": "Built a tool to analyze resumes",
                "technologies": "Python, Flask",
                "date": "2025",
                "link": "",
            }
        ],
        "skills": {"languages": ["Python", "JavaScript"]},
        "extracurriculars": [],
        "certifications": [],
    }


def _mock_openai_response(content: str):
    response = MagicMock()
    response.choices = [MagicMock(message=MagicMock(content=content))]
    return response


def _make_client(payload=None, raw_content=None):
    """Build a mock OpenAI client whose chat.completions.create returns `payload` as JSON."""
    client = MagicMock()
    content = raw_content if raw_content is not None else json.dumps(payload)
    client.chat.completions.create.return_value = _mock_openai_response(content)
    return client


def _valid_llm_payload(**overrides):
    payload = {
        "score": 78,
        "score_label": "Very Good",
        "summary": "Solid resume with room to quantify impact.",
        "categories": [
            {"name": "Impact & Results", "score": 70, "explanation": "Some quantification missing."},
            {"name": "Clarity & Structure", "score": 80, "explanation": "Clear structure."},
            {"name": "Keywords / ATS Readiness", "score": 75, "explanation": "Good keyword coverage."},
            {"name": "Professional Presentation", "score": 85, "explanation": "Consistent formatting."},
        ],
        "recommendations": [
            {
                "id": "rec_1",
                "category": "Impact & Results",
                "reason": "Bullet lacks a quantified result and uses a weak verb.",
                "target": {"section": "experience", "index": 0, "bullet": 1},
                "current": "Helped the team with various tasks",
                "proposed": "Collaborated with a 5-engineer team to ship 3 backend "
                            "features, reducing API latency by 20%",
            },
        ],
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# score_resume_structured
# ---------------------------------------------------------------------------

class TestScoreResumeStructuredHappyPath:
    def test_happy_path_returns_validated_shape(self):
        client = _make_client(_valid_llm_payload())
        with patch("app.services.resume_scoring.get_openai_client", return_value=client):
            result = score_resume_structured(_sample_parsed())

        assert result["score"] == 78
        assert result["score_label"] == "Very Good"
        assert result["summary"]
        assert len(result["categories"]) == 4
        assert {c["name"] for c in result["categories"]} == {
            "Impact & Results", "Clarity & Structure",
            "Keywords / ATS Readiness", "Professional Presentation",
        }
        assert len(result["recommendations"]) == 1
        rec = result["recommendations"][0]
        assert rec["id"] == "rec_1"
        assert rec["target"] == {"section": "experience", "index": 0, "bullet": 1}
        assert rec["current"] == "Helped the team with various tasks"
        assert "20%" in rec["proposed"]
        assert client.chat.completions.create.call_count == 1


class TestRecommendationTargetValidation:
    def test_out_of_range_and_wrong_section_targets_are_dropped(self):
        payload = _valid_llm_payload(recommendations=[
            {  # experience index out of range
                "id": "rec_1", "category": "Impact & Results", "reason": "x",
                "target": {"section": "experience", "index": 5, "bullet": 0},
                "current": "Helped the team with various tasks", "proposed": "y",
            },
            {  # bullet index out of range
                "id": "rec_2", "category": "Impact & Results", "reason": "x",
                "target": {"section": "experience", "index": 0, "bullet": 9},
                "current": "Helped the team with various tasks", "proposed": "y",
            },
            {  # disallowed section entirely
                "id": "rec_3", "category": "Impact & Results", "reason": "x",
                "target": {"section": "education", "index": 0},
                "current": "University of Southern California", "proposed": "y",
            },
            {  # projects index out of range
                "id": "rec_4", "category": "Impact & Results", "reason": "x",
                "target": {"section": "projects", "index": 3, "field": "description"},
                "current": "Built a tool to analyze resumes", "proposed": "y",
            },
            {  # disallowed field on an otherwise-valid projects target
                "id": "rec_5", "category": "Impact & Results", "reason": "x",
                "target": {"section": "projects", "index": 0, "field": "name"},
                "current": "Resume Analyzer", "proposed": "y",
            },
        ])
        client = _make_client(payload)
        with patch("app.services.resume_scoring.get_openai_client", return_value=client):
            result = score_resume_structured(_sample_parsed())

        assert result["recommendations"] == []

    def test_bool_indices_are_dropped(self):
        # bool is an int subclass in Python — {"index": true, "bullet": false}
        # would otherwise resolve to experience[1].bullets[0]. Must be dropped.
        payload = _valid_llm_payload(recommendations=[
            {
                "id": "rec_1", "category": "Impact & Results", "reason": "x",
                "target": {"section": "experience", "index": True, "bullet": False},
                "current": "Worked on backend systems", "proposed": "y",
            },
            {
                "id": "rec_2", "category": "Impact & Results", "reason": "x",
                "target": {"section": "projects", "index": False, "field": "description"},
                "current": "Built a tool to analyze resumes", "proposed": "y",
            },
        ])
        client = _make_client(payload)
        with patch("app.services.resume_scoring.get_openai_client", return_value=client):
            result = score_resume_structured(_sample_parsed())

        assert result["recommendations"] == []

    def test_valid_projects_target_survives(self):
        payload = _valid_llm_payload(recommendations=[
            {
                "id": "rec_1", "category": "Impact & Results",
                "reason": "Quantify the project's reach.",
                "target": {"section": "projects", "index": 0, "field": "description"},
                "current": "Built a tool to analyze resumes",
                "proposed": "Built a resume analysis tool used by 200+ students to improve ATS scores",
            },
        ])
        client = _make_client(payload)
        with patch("app.services.resume_scoring.get_openai_client", return_value=client):
            result = score_resume_structured(_sample_parsed())

        assert len(result["recommendations"]) == 1
        assert result["recommendations"][0]["target"] == {
            "section": "projects", "index": 0, "field": "description"
        }


class TestCategoryCoercion:
    CANONICAL = (
        "Impact & Results",
        "Clarity & Structure",
        "Keywords / ATS Readiness",
        "Professional Presentation",
    )

    def test_missing_categories_are_backfilled_with_overall_score(self):
        # LLM returns only one canonical category plus a junk one.
        payload = _valid_llm_payload(categories=[
            {"name": "Impact & Results", "score": 55, "explanation": "Weak verbs."},
            {"name": "Vibes", "score": 99, "explanation": "Great vibes."},
        ])
        client = _make_client(payload)
        with patch("app.services.resume_scoring.get_openai_client", return_value=client):
            result = score_resume_structured(_sample_parsed())

        assert [c["name"] for c in result["categories"]] == list(self.CANONICAL)
        # The matched canonical category keeps its own score/explanation.
        impact = result["categories"][0]
        assert impact["score"] == 55
        assert impact["explanation"] == "Weak verbs."
        # Backfilled ones use the overall score and an empty explanation.
        for cat in result["categories"][1:]:
            assert cat["score"] == result["score"]
            assert cat["explanation"] == ""

    def test_extra_and_duplicate_categories_are_truncated_to_the_four(self):
        payload = _valid_llm_payload(categories=[
            {"name": "Impact & Results", "score": 70, "explanation": "a"},
            {"name": "Impact & Results", "score": 10, "explanation": "dupe ignored"},
            {"name": "Clarity & Structure", "score": 80, "explanation": "b"},
            {"name": "Keywords / ATS Readiness", "score": 75, "explanation": "c"},
            {"name": "Professional Presentation", "score": 85, "explanation": "d"},
            {"name": "Extra Category", "score": 5, "explanation": "junk"},
        ])
        client = _make_client(payload)
        with patch("app.services.resume_scoring.get_openai_client", return_value=client):
            result = score_resume_structured(_sample_parsed())

        assert len(result["categories"]) == 4
        assert [c["name"] for c in result["categories"]] == list(self.CANONICAL)
        assert result["categories"][0]["score"] == 70  # first match wins over dupe

    def test_non_list_categories_still_yields_four_backfilled(self):
        payload = _valid_llm_payload(categories="not a list")
        client = _make_client(payload)
        with patch("app.services.resume_scoring.get_openai_client", return_value=client):
            result = score_resume_structured(_sample_parsed())

        assert [c["name"] for c in result["categories"]] == list(self.CANONICAL)
        for cat in result["categories"]:
            assert cat["score"] == result["score"]
            assert cat["explanation"] == ""


class TestRecommendationCurrentTextValidation:
    def test_current_mismatch_is_dropped(self):
        payload = _valid_llm_payload(recommendations=[
            {
                "id": "rec_1", "category": "Impact & Results", "reason": "x",
                "target": {"section": "experience", "index": 0, "bullet": 0},
                "current": "This text does not match the real bullet at all",
                "proposed": "y",
            },
        ])
        client = _make_client(payload)
        with patch("app.services.resume_scoring.get_openai_client", return_value=client):
            result = score_resume_structured(_sample_parsed())

        assert result["recommendations"] == []

    def test_current_match_tolerates_whitespace_differences(self):
        payload = _valid_llm_payload(recommendations=[
            {
                "id": "rec_1", "category": "Impact & Results", "reason": "x",
                "target": {"section": "experience", "index": 0, "bullet": 0},
                "current": "  Worked   on backend   systems ",
                "proposed": "Built backend systems serving 10k daily users",
            },
        ])
        client = _make_client(payload)
        with patch("app.services.resume_scoring.get_openai_client", return_value=client):
            result = score_resume_structured(_sample_parsed())

        assert len(result["recommendations"]) == 1


class TestEmptyInput:
    def test_empty_dict_raises_value_error(self):
        with pytest.raises(ValueError):
            score_resume_structured({})

    def test_none_raises_value_error(self):
        with pytest.raises(ValueError):
            score_resume_structured(None)

    def test_content_free_dict_raises_value_error(self):
        with pytest.raises(ValueError):
            score_resume_structured({"contact": {"email": ""}, "experience": [], "projects": []})


class TestMalformedLlmResponse:
    def test_malformed_json_retries_once_then_raises(self):
        client = _make_client(raw_content="not valid json at all")
        with patch("app.services.resume_scoring.get_openai_client", return_value=client):
            with pytest.raises(RuntimeError):
                score_resume_structured(_sample_parsed())

        assert client.chat.completions.create.call_count == 2

    def test_client_unavailable_raises_without_calling_llm(self):
        with patch("app.services.resume_scoring.get_openai_client", return_value=None):
            with pytest.raises(RuntimeError):
                score_resume_structured(_sample_parsed())


class TestScoreClampingAndServerDerivedLabel:
    def test_score_above_100_is_clamped(self):
        payload = _valid_llm_payload(score=150, score_label="Excellent")
        client = _make_client(payload)
        with patch("app.services.resume_scoring.get_openai_client", return_value=client):
            result = score_resume_structured(_sample_parsed())
        assert result["score"] == 100
        assert result["score_label"] == "Excellent"

    def test_score_below_0_is_clamped(self):
        payload = _valid_llm_payload(score=-20, score_label="Needs Work")
        client = _make_client(payload)
        with patch("app.services.resume_scoring.get_openai_client", return_value=client):
            result = score_resume_structured(_sample_parsed())
        assert result["score"] == 0
        assert result["score_label"] == "Needs Work"

    def test_label_is_derived_from_score_not_trusted_from_llm(self):
        # LLM claims "Excellent" but the score is only 40 — label must reflect the score.
        payload = _valid_llm_payload(score=40, score_label="Excellent")
        client = _make_client(payload)
        with patch("app.services.resume_scoring.get_openai_client", return_value=client):
            result = score_resume_structured(_sample_parsed())
        assert result["score"] == 40
        assert result["score_label"] == "Needs Work"

    def test_score_int_is_returned_even_if_llm_sends_float(self):
        payload = _valid_llm_payload(score=77.6)
        client = _make_client(payload)
        with patch("app.services.resume_scoring.get_openai_client", return_value=client):
            result = score_resume_structured(_sample_parsed())
        assert isinstance(result["score"], int)
        assert result["score"] == 78


# ---------------------------------------------------------------------------
# Route-level: POST /api/resume/score — auth + Firestore fallback
# ---------------------------------------------------------------------------

FAKE_USER = {"uid": "test-user-id", "email": "test@example.com", "name": "Test User"}


class TestScoreResumeRoute:
    @pytest.fixture(autouse=True)
    def _bypass_firebase_auth(self):
        with patch("firebase_admin._apps", {"[DEFAULT]": MagicMock()}), \
             patch("firebase_admin.auth.verify_id_token", return_value=FAKE_USER):
            yield

    def test_falls_back_to_firestore_resume_and_returns_score(self, client):
        mock_db = MagicMock()
        user_doc = MagicMock()
        user_doc.to_dict.return_value = {"resumeParsed": _sample_parsed()}
        mock_db.collection.return_value.document.return_value.get.return_value = user_doc

        with patch("backend.app.routes.resume.get_db", return_value=mock_db), \
             patch("backend.app.routes.resume.score_resume_structured",
                   return_value={
                       "score": 82, "score_label": "Very Good", "summary": "Good work.",
                       "categories": [], "recommendations": [],
                   }) as mock_score:
            resp = client.post(
                "/api/resume/score",
                data=json.dumps({}),
                content_type="application/json",
                headers={"Authorization": "Bearer test-token"},
            )

        assert resp.status_code == 200
        body = resp.get_json()
        assert body["score"] == 82
        # Fell back to the Firestore-stored resumeParsed, not an empty body.
        mock_score.assert_called_once()
        assert mock_score.call_args[0][0] == _sample_parsed()

    def test_no_resume_data_returns_400(self, client):
        mock_db = MagicMock()
        user_doc = MagicMock()
        user_doc.to_dict.return_value = {}
        mock_db.collection.return_value.document.return_value.get.return_value = user_doc

        with patch("backend.app.routes.resume.get_db", return_value=mock_db), \
             patch("backend.app.routes.resume.score_resume_structured",
                   side_effect=AssertionError("scoring should not run with no resume")):
            resp = client.post(
                "/api/resume/score",
                data=json.dumps({}),
                content_type="application/json",
                headers={"Authorization": "Bearer test-token"},
            )

        assert resp.status_code == 400

    def test_llm_failure_returns_502(self, client):
        mock_db = MagicMock()
        user_doc = MagicMock()
        user_doc.to_dict.return_value = {"resumeParsed": _sample_parsed()}
        mock_db.collection.return_value.document.return_value.get.return_value = user_doc

        with patch("backend.app.routes.resume.get_db", return_value=mock_db), \
             patch("backend.app.routes.resume.score_resume_structured",
                   side_effect=RuntimeError("LLM call failed after retry")):
            resp = client.post(
                "/api/resume/score",
                data=json.dumps({}),
                content_type="application/json",
                headers={"Authorization": "Bearer test-token"},
            )

        assert resp.status_code == 502
