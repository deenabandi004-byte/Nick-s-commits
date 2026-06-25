"""Unit tests for the Scout-rebuild Apify user-profile and user-posts methods.

Per project policy: all paid APIs are mocked at the requests layer. These
tests cover the contract the onboarding flow depends on (envelope shape on
each failure mode + happy path) without burning Apify spend.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest
import requests


# Ensure the API key is present for the call-site guards. The actual HTTP
# layer is mocked so no real call is made.
@pytest.fixture(autouse=True)
def _set_api_key(monkeypatch):
    monkeypatch.setattr(
        "app.services.apify_client.APIFY_API_KEY", "test-key", raising=False
    )


# ---------------------------------------------------------------------------
# enrich_user_linkedin_profile_via_apify
# ---------------------------------------------------------------------------

def _ok(json_body):
    class R:
        status_code = 200
        text = ""

        def json(self):
            return json_body

    return R()


def _http_error(code: int, body: str = ""):
    class R:
        status_code = code
        text = body

        def json(self):
            return {}

    return R()


def test_user_profile_happy_path_returns_first_dataset_item():
    from app.services.apify_client import enrich_user_linkedin_profile_via_apify

    payload = [{"name": "Sid", "education": [{"school": "USC"}]}]
    with patch("app.services.apify_client.requests.post", return_value=_ok(payload)):
        result = enrich_user_linkedin_profile_via_apify(
            "https://linkedin.com/in/test"
        )

    assert result["ok"] is True
    assert result["source"] == "apify"
    assert result["actor"]
    assert result["data"] == payload[0]


def test_user_profile_bad_url_short_circuits_without_http_call():
    from app.services.apify_client import enrich_user_linkedin_profile_via_apify

    with patch("app.services.apify_client.requests.post") as post:
        result = enrich_user_linkedin_profile_via_apify("not-a-linkedin-url")
        assert post.call_count == 0

    assert result["ok"] is False
    assert result["error"] == "bad_url"


def test_user_profile_missing_api_key_returns_no_key_envelope(monkeypatch):
    from app.services.apify_client import enrich_user_linkedin_profile_via_apify

    monkeypatch.setattr(
        "app.services.apify_client.APIFY_API_KEY", "", raising=False
    )
    with patch("app.services.apify_client.requests.post") as post:
        result = enrich_user_linkedin_profile_via_apify("https://linkedin.com/in/x")
        assert post.call_count == 0

    assert result["ok"] is False
    assert result["error"] == "no_api_key"


def test_user_profile_5xx_falls_through_to_pdl_via_ok_false():
    from app.services.apify_client import enrich_user_linkedin_profile_via_apify

    with patch(
        "app.services.apify_client.requests.post", return_value=_http_error(503, "down")
    ):
        result = enrich_user_linkedin_profile_via_apify(
            "https://linkedin.com/in/test"
        )

    assert result["ok"] is False
    assert result["error"].startswith("http_5")


def test_user_profile_429_rate_limit_is_reported_as_http_error():
    """The onboarding caller treats any non-2xx as 'fall back to PDL'."""
    from app.services.apify_client import enrich_user_linkedin_profile_via_apify

    with patch(
        "app.services.apify_client.requests.post", return_value=_http_error(429)
    ):
        result = enrich_user_linkedin_profile_via_apify(
            "https://linkedin.com/in/test"
        )

    assert result["ok"] is False
    assert result["error"] == "http_429"


def test_user_profile_timeout_returns_envelope_not_raises():
    from app.services.apify_client import enrich_user_linkedin_profile_via_apify

    with patch(
        "app.services.apify_client.requests.post",
        side_effect=requests.Timeout("timed out"),
    ):
        result = enrich_user_linkedin_profile_via_apify(
            "https://linkedin.com/in/test"
        )

    assert result["ok"] is False
    assert result["error"] == "timeout"


def test_user_profile_empty_dataset_signals_no_data():
    """Private / deleted profiles often come back as []."""
    from app.services.apify_client import enrich_user_linkedin_profile_via_apify

    with patch(
        "app.services.apify_client.requests.post", return_value=_ok([])
    ):
        result = enrich_user_linkedin_profile_via_apify(
            "https://linkedin.com/in/private"
        )

    assert result["ok"] is False
    assert result["error"] == "no_data"
    assert result["source"] == "apify_no_data"


def test_user_profile_non_list_payload_is_treated_as_bad_shape():
    from app.services.apify_client import enrich_user_linkedin_profile_via_apify

    with patch(
        "app.services.apify_client.requests.post",
        return_value=_ok({"unexpected": "object"}),
    ):
        result = enrich_user_linkedin_profile_via_apify(
            "https://linkedin.com/in/test"
        )

    assert result["ok"] is False
    assert result["error"] == "bad_shape"


# ---------------------------------------------------------------------------
# enrich_user_linkedin_posts_via_apify
# ---------------------------------------------------------------------------

def test_user_posts_happy_path_extracts_text_and_dedupes():
    from app.services.apify_client import enrich_user_linkedin_posts_via_apify

    payload = [
        {"text": "First post about a new project I shipped this week"},
        {"text": "First post about a new project I shipped this week"},  # dup
        {"text": "Second post about Stripe internships and what I learned"},
        {"text": "short"},  # below 20-char floor
    ]
    with patch(
        "app.services.apify_client.requests.post", return_value=_ok(payload)
    ):
        posts = enrich_user_linkedin_posts_via_apify(
            "https://linkedin.com/in/test", max_posts=5
        )

    assert posts == [
        "First post about a new project I shipped this week",
        "Second post about Stripe internships and what I learned",
    ]


def test_user_posts_filters_by_source_url_when_actor_populates_it():
    """Some actors echo back inputUrl per item; only this user's posts count.

    The canonicalizer strips trailing two-letter paths (locale segments), so
    slugs need to be longer than 2 chars for canon to round-trip; the test
    fixtures match that constraint.
    """
    from app.services.apify_client import enrich_user_linkedin_posts_via_apify

    payload = [
        {
            "text": "Mine: a long enough post about my recent internship search",
            "inputUrl": "https://www.linkedin.com/in/sidsriram",
        },
        {
            "text": "Theirs: this came from a different profile somehow",
            "inputUrl": "https://www.linkedin.com/in/someone-else",
        },
    ]
    with patch(
        "app.services.apify_client.requests.post", return_value=_ok(payload)
    ):
        posts = enrich_user_linkedin_posts_via_apify(
            "https://linkedin.com/in/sidsriram", max_posts=5
        )

    assert len(posts) == 1
    assert "Mine" in posts[0]


def test_user_posts_failure_modes_all_return_empty_list():
    """Onboarding does not block on posts; failure is just an empty list."""
    from app.services.apify_client import enrich_user_linkedin_posts_via_apify

    for response_or_exc in (
        _http_error(500),
        _http_error(429),
        _ok({"not": "a list"}),
    ):
        with patch(
            "app.services.apify_client.requests.post", return_value=response_or_exc
        ):
            posts = enrich_user_linkedin_posts_via_apify("https://linkedin.com/in/x")
            assert posts == []

    with patch(
        "app.services.apify_client.requests.post",
        side_effect=requests.Timeout("slow"),
    ):
        assert enrich_user_linkedin_posts_via_apify("https://linkedin.com/in/x") == []


def test_user_posts_bad_url_skips_http_call():
    from app.services.apify_client import enrich_user_linkedin_posts_via_apify

    with patch("app.services.apify_client.requests.post") as post:
        posts = enrich_user_linkedin_posts_via_apify("not-a-url")
        assert post.call_count == 0
    assert posts == []


def test_user_posts_caps_max_posts_to_actor_ceiling():
    """Caller asks for 50; actor ceiling caps to a sane number."""
    from app.services.apify_client import (
        APIFY_MAX_POSTS_PER_PROFILE,
        enrich_user_linkedin_posts_via_apify,
    )

    captured = {}

    class _R:
        status_code = 200
        text = ""

        def json(self):
            return []

    def _capture_post(url, **kwargs):
        captured["json"] = kwargs.get("json")
        return _R()

    with patch("app.services.apify_client.requests.post", side_effect=_capture_post):
        enrich_user_linkedin_posts_via_apify(
            "https://linkedin.com/in/test", max_posts=50
        )

    assert captured["json"]["maxPosts"] == APIFY_MAX_POSTS_PER_PROFILE
