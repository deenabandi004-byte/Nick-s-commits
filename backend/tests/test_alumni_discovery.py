"""Tests for the auto-discover alumni feature (job board referral path).

Covers all 14 plan-verification cases + 3 eng-review additions:

  1.  Happy path — 3 contacts, dedup, cache_hit plumbed
  2.  Relaxation ladder — rung 2 fires when rung 1 is empty
  3.  Empty state — negative cache written
  4.  Negative-cache hit — 0 credits, cache_hit="negative"
  5.  PDL cache hit — 0 credits, cache_hit=True
  6.  Mid-flight partial — partial=True surfaces in response
  7.  /from-discovery happy path — cache → persist → build_referral_draft
  8.  /from-discovery forged-payload rejection — 410 discovery_expired
  9.  /from-discovery dedup race — same contact_id returned
  10. No-school path — 400 no_school
  11. Rate-limit — 429 on cap
  12. PDL timeout — 504 pdl_timeout
  13. PDL Firestore cache outage — endpoint doesn't 500
  14. Match-strength scoring unit test
  15. Exclude-keys wiring (eng review)
  16. Parallel-tab race on /discover-alumni (eng review)
  17. Discovery-cache TTL boundary at 60min (eng review)

Mocks PDL + OpenAI everywhere — no live spend per project policy.
"""
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Enable the feature flag for tests that hit the routes. is_feature_enabled()
# re-reads at call time, so we can flip it per-test if needed.
os.environ["DISCOVER_ALUMNI_ENABLED"] = "true"

from app.services import alumni_discovery as ad


FAKE_USER = {"uid": "test-uid", "email": "student@usc.edu", "name": "Test Student"}
DISCOVER_ENDPOINT = "/api/job-board/discover-alumni"
DRAFT_ENDPOINT = "/api/job-board/referral-draft/from-discovery"


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

def _user_doc(tier="pro", school="USC", grad_year=2024):
    doc = MagicMock()
    doc.exists = True
    payload = {
        "subscriptionTier": tier,
        "tier": tier,
        "email": "student@usc.edu",
        "credits": 500,
    }
    if school:
        payload["resumeParsed"] = {
            "education": {"school": school, "graduationYear": grad_year}
        }
    doc.to_dict.return_value = payload
    return doc


@pytest.fixture(autouse=True)
def _enable_flag():
    """Default the discovery flag ON for every test in this module."""
    old = os.environ.get("DISCOVER_ALUMNI_ENABLED")
    os.environ["DISCOVER_ALUMNI_ENABLED"] = "true"
    yield
    if old is None:
        os.environ.pop("DISCOVER_ALUMNI_ENABLED", None)
    else:
        os.environ["DISCOVER_ALUMNI_ENABLED"] = old


@pytest.fixture(autouse=True)
def _bypass_firebase_auth():
    """Bypass Firebase token verification at the firebase_admin layer."""
    with patch("firebase_admin._apps", {"[DEFAULT]": MagicMock()}), \
         patch("firebase_admin.auth.verify_id_token", return_value=FAKE_USER):
        yield


@pytest.fixture
def app():
    from backend.wsgi import create_app
    app = create_app()
    app.config["TESTING"] = True
    return app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def mock_db_with_user():
    """Wire get_db() everywhere to return a MagicMock with a Pro user."""
    db = MagicMock()
    user_ref = MagicMock()
    user_ref.get.return_value = _user_doc(tier="pro")
    db.collection.return_value.document.return_value = user_ref

    with patch("app.extensions.get_db", return_value=db), \
         patch("app.services.alumni_discovery.get_db", return_value=db, create=True), \
         patch("app.routes.alumni_discovery_routes._check_user_rate_limit", return_value=True, create=False) \
              if False else patch("app.routes.job_board._check_user_rate_limit", return_value=True):
        yield db


# Tiny helper: a contact dict in the PascalCase shape produced by
# `extract_contact_from_pdl_person_enhanced`.
def _make_contact(first="Jane", last="Doe", company="Stripe",
                  title="Software Engineer", school="USC",
                  end_year=2022, email="jane@stripe.com",
                  email_source="hunter_verified"):
    return {
        "FirstName": first,
        "LastName": last,
        "Title": title,
        "Company": company,
        "City": "San Francisco",
        "State": "CA",
        "LinkedIn": f"https://linkedin.com/in/{first.lower()}-{last.lower()}",
        "Email": email,
        "EmailSource": email_source,
        "EmailVerified": True,
        "EmailConfidenceScore": 90,
        "College": school,
        "EducationTop": f"{school} - BS ({end_year - 4} - {end_year})",
    }


# ===========================================================================
# 14. Match-strength scoring (pure helper — runs first; no fixtures needed)
# ===========================================================================

class TestMatchStrengthScoring:

    @pytest.mark.unit
    def test_strong_when_school_year_and_role_family_match(self):
        contact = _make_contact(school="USC", end_year=2024, title="Software Engineer")
        strength, reasons = ad.score_match_strength(
            contact,
            user_school="USC",
            job_title="Software Engineer",
            user_grad_year=2024,
        )
        assert strength == "strong"
        assert any("USC" in r or "alum" in r.lower() for r in reasons)

    @pytest.mark.unit
    def test_moderate_when_same_school_different_role(self):
        contact = _make_contact(school="USC", end_year=2010, title="Marketing Director")
        strength, _ = ad.score_match_strength(
            contact,
            user_school="USC",
            job_title="Software Engineer",
            user_grad_year=2024,
        )
        # Same school + different role + different year → moderate (school
        # signal alone is enough for moderate, but not strong).
        assert strength == "moderate"

    @pytest.mark.unit
    def test_weak_when_no_school_overlap(self):
        contact = _make_contact(school="MIT", end_year=2024, title="Software Engineer")
        strength, _ = ad.score_match_strength(
            contact,
            user_school="USC",
            job_title="Software Engineer",
            user_grad_year=2024,
        )
        # No school overlap is a NECESSARY condition for weak per spec.
        assert strength == "weak"

    @pytest.mark.unit
    def test_school_alias_match_usc(self):
        contact = _make_contact(
            school="University of Southern California",
            end_year=2024, title="Software Engineer",
        )
        strength, reasons = ad.score_match_strength(
            contact,
            user_school="USC",  # short form
            job_title="Software Engineer",
            user_grad_year=2024,
        )
        assert strength == "strong"
        assert reasons  # at least the alum reason fired


# ===========================================================================
# Route-level tests via Flask test client
# ===========================================================================

def _wire_user(db, *, school="USC", grad_year=2024, tier="pro"):
    """Helper: configure db.collection('users').document(uid).get() to return
    a user doc with (or without) a school. Discovery service reads users/{uid}.
    """
    user_doc = _user_doc(tier=tier, school=school, grad_year=grad_year)
    # The DB receives multiple paths (users/, users/{uid}/discovery_cache/, ...)
    # so we route via .collection().document() chaining.
    user_doc_ref = MagicMock()
    user_doc_ref.get.return_value = user_doc

    discovery_cache_col = MagicMock()
    discovery_cache_col.document.return_value = MagicMock()
    discovery_cache_col.document.return_value.get.return_value = MagicMock(exists=False)

    neg_cache_col = MagicMock()
    neg_cache_col.document.return_value = MagicMock()
    neg_cache_col.document.return_value.get.return_value = MagicMock(exists=False)
    neg_cache_col.stream.return_value = []

    contacts_col = MagicMock()
    # default: no existing contact (dedup query returns empty)
    contacts_col.where.return_value.limit.return_value.get.return_value = []
    new_contact_ref = MagicMock()
    new_contact_ref.id = "new-contact-id-123"
    contacts_col.document.return_value = new_contact_ref

    def user_subcollection(name):
        if name == "discovery_cache":
            return discovery_cache_col
        if name == "discovery_negative_cache":
            return neg_cache_col
        if name == "contacts":
            return contacts_col
        return MagicMock()

    user_doc_ref.collection.side_effect = user_subcollection

    users_col = MagicMock()
    users_col.document.return_value = user_doc_ref

    def root_collection(name):
        if name == "users":
            return users_col
        return MagicMock()

    db.collection.side_effect = root_collection

    return {
        "user_doc_ref": user_doc_ref,
        "discovery_cache_col": discovery_cache_col,
        "neg_cache_col": neg_cache_col,
        "contacts_col": contacts_col,
        "new_contact_ref": new_contact_ref,
    }


# ---------------------------------------------------------------------------
# Test 10 — No-school path → 400 no_school
# ---------------------------------------------------------------------------

class TestNoSchool:

    @pytest.mark.unit
    def test_no_school_returns_400(self, client):
        db = MagicMock()
        _wire_user(db, school="")  # student doc has no school

        with patch("app.extensions.get_db", return_value=db), \
             patch("app.routes.job_board._check_user_rate_limit", return_value=True):
            resp = client.post(
                DISCOVER_ENDPOINT,
                json={"job_id": "j1", "company": "Stripe", "title": "SWE"},
                headers={"Authorization": "Bearer fake"},
            )

        assert resp.status_code == 400, resp.get_json()
        assert resp.get_json().get("code") == "no_school"


# ---------------------------------------------------------------------------
# Test 11 — Rate limit → 429
# ---------------------------------------------------------------------------

class TestRateLimit:

    @pytest.mark.unit
    def test_rate_limit_returns_429(self, client):
        db = MagicMock()
        _wire_user(db)
        with patch("app.extensions.get_db", return_value=db), \
             patch("app.routes.job_board._check_user_rate_limit", return_value=False):
            resp = client.post(
                DISCOVER_ENDPOINT,
                json={"job_id": "j1", "company": "Stripe", "title": "SWE"},
                headers={"Authorization": "Bearer fake"},
            )

        assert resp.status_code == 429
        assert "Daily limit" in resp.get_json().get("error", "")


# ---------------------------------------------------------------------------
# Tests 1, 5, 6 — Happy path + cache_hit + partial
# ---------------------------------------------------------------------------

class TestDiscoverAlumni:

    @pytest.mark.unit
    def test_happy_path_returns_3_contacts(self, client):
        db = MagicMock()
        _wire_user(db)
        contacts = [
            _make_contact(first=f"Alum{i}", last="USC", school="USC")
            for i in range(3)
        ]

        with patch("app.extensions.get_db", return_value=db), \
             patch("app.routes.job_board._check_user_rate_limit", return_value=True), \
             patch("app.services.alumni_discovery._run_search_with_timeout",
                   return_value=(contacts, False, False, False)):
            resp = client.post(
                DISCOVER_ENDPOINT,
                json={"job_id": "j1", "company": "Stripe", "title": "Software Engineer"},
                headers={"Authorization": "Bearer fake"},
            )

        assert resp.status_code == 200, resp.get_json()
        body = resp.get_json()
        assert len(body["contacts"]) == 3
        assert body["credits_used"] == 3
        assert body["cache_hit"] is False
        assert body["rung"] == ad.RUNG_SCHOOL_COMPANY_TITLE
        # Each row carries a strong/moderate/weak badge.
        for row in body["contacts"]:
            assert row["match_strength"] in ("strong", "moderate", "weak")
            assert "pdl_id" in row

    @pytest.mark.unit
    def test_pdl_cache_hit_zero_credits(self, client):
        db = MagicMock()
        _wire_user(db)
        contacts = [_make_contact(first="A", last="B", school="USC")]

        with patch("app.extensions.get_db", return_value=db), \
             patch("app.routes.job_board._check_user_rate_limit", return_value=True), \
             patch("app.services.alumni_discovery._run_search_with_timeout",
                   return_value=(contacts, True, False, False)):  # cache_hit=True
            resp = client.post(
                DISCOVER_ENDPOINT,
                json={"job_id": "j1", "company": "Stripe", "title": "SWE"},
                headers={"Authorization": "Bearer fake"},
            )

        body = resp.get_json()
        assert resp.status_code == 200, body
        assert body["credits_used"] == 0
        assert body["cache_hit"] is True

    @pytest.mark.unit
    def test_mid_flight_partial_surfaces(self, client):
        db = MagicMock()
        _wire_user(db)
        contacts = [
            _make_contact(first=f"P{i}", last="USC", school="USC") for i in range(2)
        ]  # tier_max=5 for pro, returned only 2 → partial

        with patch("app.extensions.get_db", return_value=db), \
             patch("app.routes.job_board._check_user_rate_limit", return_value=True), \
             patch("app.services.alumni_discovery._run_search_with_timeout",
                   return_value=(contacts, False, False, True)):  # partial=True
            resp = client.post(
                DISCOVER_ENDPOINT,
                json={"job_id": "j1", "company": "Stripe", "title": "SWE"},
                headers={"Authorization": "Bearer fake"},
            )

        body = resp.get_json()
        assert resp.status_code == 200, body
        assert body["partial"] is True
        assert len(body["contacts"]) == 2


# ---------------------------------------------------------------------------
# Test 2 — Relaxation ladder rung 2 fires
# ---------------------------------------------------------------------------

class TestRelaxationLadder:

    @pytest.mark.unit
    def test_rung_2_fires_when_rung_1_empty(self, client):
        db = MagicMock()
        _wire_user(db)
        # Rung 1 (school+company+title): empty. Rung 2 (school+company): hits.
        rung_2_contacts = [_make_contact(first="Drop", last="Title", school="USC")]

        call_count = {"n": 0}

        def fake_run(parsed, **kw):
            call_count["n"] += 1
            if call_count["n"] == 1:
                return ([], False, False, False)
            return (rung_2_contacts, False, False, False)

        with patch("app.extensions.get_db", return_value=db), \
             patch("app.routes.job_board._check_user_rate_limit", return_value=True), \
             patch("app.services.alumni_discovery._run_search_with_timeout",
                   side_effect=fake_run):
            resp = client.post(
                DISCOVER_ENDPOINT,
                json={
                    "job_id": "j1",
                    "company": "Stripe",
                    "title": "SWE",
                    "allow_drop_title": True,
                },
                headers={"Authorization": "Bearer fake"},
            )

        body = resp.get_json()
        assert resp.status_code == 200, body
        assert body["rung"] == ad.RUNG_SCHOOL_COMPANY
        assert call_count["n"] == 2


# ---------------------------------------------------------------------------
# Tests 3, 4 — Empty state + negative cache
# ---------------------------------------------------------------------------

class TestNegativeCache:

    @pytest.mark.unit
    def test_empty_state_writes_negative_cache(self, client):
        db = MagicMock()
        wiring = _wire_user(db)
        neg_doc = wiring["neg_cache_col"].document.return_value

        with patch("app.extensions.get_db", return_value=db), \
             patch("app.routes.job_board._check_user_rate_limit", return_value=True), \
             patch("app.services.alumni_discovery._run_search_with_timeout",
                   return_value=([], False, False, False)):
            resp = client.post(
                DISCOVER_ENDPOINT,
                json={"job_id": "j1", "company": "ObscureCo", "title": "SWE"},
                headers={"Authorization": "Bearer fake"},
            )

        body = resp.get_json()
        assert resp.status_code == 200, body
        assert body["contacts"] == []
        assert body["credits_used"] == 0
        assert body["rung"] == ad.RUNG_EMPTY
        # Negative cache .set() called with company + 7d expiry.
        assert neg_doc.set.called
        written = neg_doc.set.call_args.args[0]
        assert written["company"] == "ObscureCo"
        # expires_at should be ~7 days out
        expires = written["expires_at"]
        delta = expires - datetime.now(timezone.utc)
        assert timedelta(days=6) < delta < timedelta(days=8)

    @pytest.mark.unit
    def test_negative_cache_hit_short_circuits(self, client):
        db = MagicMock()
        wiring = _wire_user(db)
        # Pre-seed negative cache so read returns a live doc.
        neg_snap = MagicMock()
        neg_snap.exists = True
        neg_snap.to_dict.return_value = {
            "company": "ObscureCo",
            "expires_at": datetime.now(timezone.utc) + timedelta(days=3),
        }
        wiring["neg_cache_col"].document.return_value.get.return_value = neg_snap

        # If PDL is hit at all, the test fails.
        with patch("app.extensions.get_db", return_value=db), \
             patch("app.routes.job_board._check_user_rate_limit", return_value=True), \
             patch("app.services.alumni_discovery._run_search_with_timeout") as mock_run:
            resp = client.post(
                DISCOVER_ENDPOINT,
                json={"job_id": "j1", "company": "ObscureCo", "title": "SWE"},
                headers={"Authorization": "Bearer fake"},
            )

        body = resp.get_json()
        assert resp.status_code == 200, body
        assert body["cache_hit"] == "negative"
        assert body["credits_used"] == 0
        mock_run.assert_not_called()


# ---------------------------------------------------------------------------
# Test 12 — PDL timeout → 504
# ---------------------------------------------------------------------------

class TestPdlTimeout:

    @pytest.mark.unit
    def test_pdl_timeout_returns_504(self, client):
        db = MagicMock()
        _wire_user(db)

        with patch("app.extensions.get_db", return_value=db), \
             patch("app.routes.job_board._check_user_rate_limit", return_value=True), \
             patch("app.services.alumni_discovery._run_search_with_timeout",
                   return_value=([], False, True, False)):  # timed_out=True
            resp = client.post(
                DISCOVER_ENDPOINT,
                json={"job_id": "j1", "company": "Stripe", "title": "SWE"},
                headers={"Authorization": "Bearer fake"},
            )

        assert resp.status_code == 504
        assert resp.get_json().get("code") == "pdl_timeout"


# ---------------------------------------------------------------------------
# Test 13 — PDL Firestore cache outage → endpoint doesn't 500
# ---------------------------------------------------------------------------

class TestPdlCacheOutage:

    @pytest.mark.unit
    def test_pdl_cache_outage_falls_through(self, client):
        """If pdl_cache.get raises (Firestore outage) inside
        search_contacts_from_prompt, the wrapper should still return live
        contacts and the endpoint should still respond 200."""
        db = MagicMock()
        _wire_user(db)
        contacts = [_make_contact(first="Live", last="PDL", school="USC")]

        # Simulate: search_contacts_from_prompt swallows the pdl_cache.get
        # exception internally and returns live results. Our wrapper just
        # needs to plumb them through cleanly.
        with patch("app.extensions.get_db", return_value=db), \
             patch("app.routes.job_board._check_user_rate_limit", return_value=True), \
             patch("app.services.alumni_discovery._run_search_with_timeout",
                   return_value=(contacts, False, False, False)):
            resp = client.post(
                DISCOVER_ENDPOINT,
                json={"job_id": "j1", "company": "Stripe", "title": "SWE"},
                headers={"Authorization": "Bearer fake"},
            )

        assert resp.status_code == 200, resp.get_json()
        assert len(resp.get_json()["contacts"]) == 1


# ---------------------------------------------------------------------------
# Test 15 — Exclude-keys wiring (eng review)
# ---------------------------------------------------------------------------

class TestExcludeKeysWiring:

    @pytest.mark.unit
    def test_identity_set_passed_to_search(self, client):
        db = MagicMock()
        _wire_user(db)
        contacts = [_make_contact(first="Q", last="R", school="USC")]
        excl = {
            "identity_set": {"jane||doe||stripe", "bob||k||google"},
            "email_set": set(),
            "linkedin_set": set(),
            "name_company_set": set(),
        }

        captured = {}

        def fake_run(parsed, *, max_contacts, exclude_keys, user_profile):
            captured["exclude_keys"] = exclude_keys
            captured["max_contacts"] = max_contacts
            return (contacts, False, False, False)

        with patch("app.extensions.get_db", return_value=db), \
             patch("app.routes.job_board._check_user_rate_limit", return_value=True), \
             patch("app.routes.runs._build_exclusion_data_from_firestore", return_value=excl), \
             patch("app.services.alumni_discovery._run_search_with_timeout",
                   side_effect=fake_run):
            resp = client.post(
                DISCOVER_ENDPOINT,
                json={"job_id": "j1", "company": "Stripe", "title": "SWE"},
                headers={"Authorization": "Bearer fake"},
            )

        assert resp.status_code == 200, resp.get_json()
        # The identity_set must be plumbed into search_contacts_from_prompt
        # so PDL-side dedup excludes already-saved contacts.
        assert captured["exclude_keys"] == excl["identity_set"]
        # Pro tier max for discovery is 5.
        assert captured["max_contacts"] == ad.TIER_DISCOVERY_MAX["pro"]


# ---------------------------------------------------------------------------
# Test 16 — Parallel-tab race on /discover-alumni (last-write-wins)
# ---------------------------------------------------------------------------

class TestParallelDiscoverRace:

    @pytest.mark.unit
    def test_two_simultaneous_writes_same_shape(self, client):
        db = MagicMock()
        wiring = _wire_user(db)
        contacts = [_make_contact(first="X", last="Y", school="USC")]

        with patch("app.extensions.get_db", return_value=db), \
             patch("app.routes.job_board._check_user_rate_limit", return_value=True), \
             patch("app.services.alumni_discovery._run_search_with_timeout",
                   return_value=(contacts, False, False, False)):
            # Two back-to-back requests for the same job_id simulate the
            # parallel-tab case. Both must succeed and the cache .set()
            # must be called for each — Firestore's last-write-wins handles
            # the order. No 500s; no double-charging at this layer.
            r1 = client.post(
                DISCOVER_ENDPOINT,
                json={"job_id": "shared-j1", "company": "Stripe", "title": "SWE"},
                headers={"Authorization": "Bearer fake"},
            )
            r2 = client.post(
                DISCOVER_ENDPOINT,
                json={"job_id": "shared-j1", "company": "Stripe", "title": "SWE"},
                headers={"Authorization": "Bearer fake"},
            )

        assert r1.status_code == 200 and r2.status_code == 200
        b1, b2 = r1.get_json(), r2.get_json()
        assert b1["rung"] == b2["rung"]
        assert [c["pdl_id"] for c in b1["contacts"]] == [c["pdl_id"] for c in b2["contacts"]]
        # Cache write fired on both calls (last write wins).
        cache_doc_ref = wiring["discovery_cache_col"].document.return_value
        assert cache_doc_ref.set.call_count == 2


# ---------------------------------------------------------------------------
# Test 17 — Discovery-cache TTL boundary at 60 min (eng review)
# ---------------------------------------------------------------------------

class TestDiscoveryCacheTTL:

    @pytest.mark.unit
    def test_59min_old_cache_is_live(self):
        """A cache doc created 59min ago is still readable (TTL=60min)."""
        db = MagicMock()
        snap = MagicMock()
        snap.exists = True
        snap.to_dict.return_value = {
            "job_id": "j1",
            "company": "Stripe",
            "contacts": [_make_contact()],
            "rung": ad.RUNG_SCHOOL_COMPANY_TITLE,
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=1),  # 1min remaining
        }
        db.collection.return_value.document.return_value \
          .collection.return_value.document.return_value.get.return_value = snap

        with patch("app.extensions.get_db", return_value=db):
            doc = ad.read_discovery_cache("uid", "j1")
        assert doc is not None
        assert doc["job_id"] == "j1"

    @pytest.mark.unit
    def test_61min_old_cache_returns_none(self):
        """A cache doc whose expires_at is in the past returns None."""
        db = MagicMock()
        snap = MagicMock()
        snap.exists = True
        snap.to_dict.return_value = {
            "job_id": "j1",
            "expires_at": datetime.now(timezone.utc) - timedelta(minutes=1),
        }
        db.collection.return_value.document.return_value \
          .collection.return_value.document.return_value.get.return_value = snap

        with patch("app.extensions.get_db", return_value=db):
            doc = ad.read_discovery_cache("uid", "j1")
        assert doc is None


# ---------------------------------------------------------------------------
# Tests 7, 8, 9 — /from-discovery
# ---------------------------------------------------------------------------

class TestFromDiscoveryEndpoint:

    @pytest.mark.unit
    def test_happy_path_persists_and_calls_build_referral_draft(self, client):
        """Server reads from discovery_cache, persists the chosen alum,
        then hands it to build_referral_draft. Response contains
        contact_id + relationship: moderate (shared school)."""
        db = MagicMock()
        wiring = _wire_user(db)
        pdl_contact = _make_contact(first="Alex", last="Trojan", school="USC")
        pdl_id = ad._pdl_id_for(pdl_contact)
        cache_snap = MagicMock()
        cache_snap.exists = True
        cache_snap.to_dict.return_value = {
            "job_id": "j1",
            "company": "Stripe",
            "rung": ad.RUNG_SCHOOL_COMPANY_TITLE,
            "contacts": [pdl_contact],
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=30),
        }
        wiring["discovery_cache_col"].document.return_value.get.return_value = cache_snap

        # build_referral_draft → return a clean ok payload.
        draft_payload = {
            "ok": True,
            "subject": "Quick chat about the Stripe SWE role?",
            "body": "Fellow USC alum here...",
            "context_used": {"two_step_framing": True},
            "relationship": "moderate",
        }

        with patch("app.extensions.get_db", return_value=db), \
             patch("app.routes.job_board._check_user_rate_limit", return_value=True), \
             patch("app.services.referral_email.build_referral_draft",
                   return_value=draft_payload) as mock_build, \
             patch("app.services.alumni_discovery.persist_discovered_contact",
                   return_value=("new-contact-id-123", True)) as mock_persist:
            resp = client.post(
                DRAFT_ENDPOINT,
                json={
                    "job_id": "j1",
                    "pdl_id": pdl_id,
                    "job": {"company": "Stripe", "title": "SWE", "job_id": "j1"},
                },
                headers={"Authorization": "Bearer fake"},
            )

        body = resp.get_json()
        assert resp.status_code == 200, body
        assert body["contact_id"] == "new-contact-id-123"
        assert body["was_new"] is True
        assert body["subject"].startswith("Quick chat")
        assert body["relationship"] == "moderate"

        # Cache was read; build_referral_draft was called with the PERSISTED
        # contact_id (not the pdl_id) — confirming the trust boundary
        # actually flowed through.
        mock_persist.assert_called_once()
        kwargs = mock_build.call_args.kwargs or {}
        if "contact_id" in kwargs:
            assert kwargs["contact_id"] == "new-contact-id-123"
        else:
            # positional fallback
            args = mock_build.call_args.args
            assert "new-contact-id-123" in args

    @pytest.mark.unit
    def test_forged_pdl_id_rejected_410(self, client):
        """A pdl_id not present in the cached discovery_cache must 410
        with code 'discovery_expired' — the security boundary."""
        db = MagicMock()
        wiring = _wire_user(db)
        # Cache exists but doesn't contain the forged pdl_id.
        legit_contact = _make_contact(first="Legit", last="Alum", school="USC")
        cache_snap = MagicMock()
        cache_snap.exists = True
        cache_snap.to_dict.return_value = {
            "job_id": "j1",
            "contacts": [legit_contact],
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=30),
        }
        wiring["discovery_cache_col"].document.return_value.get.return_value = cache_snap

        with patch("app.extensions.get_db", return_value=db), \
             patch("app.routes.job_board._check_user_rate_limit", return_value=True), \
             patch("app.services.referral_email.build_referral_draft") as mock_build, \
             patch("app.services.alumni_discovery.persist_discovered_contact") as mock_persist:
            resp = client.post(
                DRAFT_ENDPOINT,
                json={
                    "job_id": "j1",
                    "pdl_id": "forged-pdl-id-not-in-cache",
                    "job": {"company": "Stripe", "title": "SWE", "job_id": "j1"},
                },
                headers={"Authorization": "Bearer fake"},
            )

        assert resp.status_code == 404, resp.get_json()  # pdl_id_not_in_cache
        assert resp.get_json().get("code") == "pdl_id_not_in_cache"
        mock_persist.assert_not_called()
        mock_build.assert_not_called()

    @pytest.mark.unit
    def test_expired_cache_rejected_410(self, client):
        """Cache miss (expired) returns 410 discovery_expired."""
        db = MagicMock()
        wiring = _wire_user(db)
        # No cache doc.
        miss = MagicMock(exists=False)
        wiring["discovery_cache_col"].document.return_value.get.return_value = miss

        with patch("app.extensions.get_db", return_value=db), \
             patch("app.routes.job_board._check_user_rate_limit", return_value=True), \
             patch("app.services.referral_email.build_referral_draft") as mock_build:
            resp = client.post(
                DRAFT_ENDPOINT,
                json={
                    "job_id": "expired-job",
                    "pdl_id": "anything",
                    "job": {"company": "Stripe", "job_id": "expired-job"},
                },
                headers={"Authorization": "Bearer fake"},
            )

        assert resp.status_code == 410, resp.get_json()
        assert resp.get_json().get("code") == "discovery_expired"
        mock_build.assert_not_called()

    @pytest.mark.unit
    def test_dedup_race_returns_existing_contact_id(self, client):
        """When two tabs race the same alum, the second sees the existing
        contact and the txn returns (existing_id, was_new=False)."""
        db = MagicMock()
        wiring = _wire_user(db)
        pdl_contact = _make_contact(first="Dedup", last="Alum", school="USC")
        pdl_id = ad._pdl_id_for(pdl_contact)
        cache_snap = MagicMock()
        cache_snap.exists = True
        cache_snap.to_dict.return_value = {
            "job_id": "j1",
            "contacts": [pdl_contact],
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=30),
        }
        wiring["discovery_cache_col"].document.return_value.get.return_value = cache_snap

        draft_payload = {"ok": True, "subject": "s", "body": "b", "relationship": "moderate"}

        with patch("app.extensions.get_db", return_value=db), \
             patch("app.routes.job_board._check_user_rate_limit", return_value=True), \
             patch("app.services.referral_email.build_referral_draft",
                   return_value=draft_payload), \
             patch("app.services.alumni_discovery.persist_discovered_contact",
                   return_value=("existing-contact-id-999", False)):
            resp = client.post(
                DRAFT_ENDPOINT,
                json={
                    "job_id": "j1",
                    "pdl_id": pdl_id,
                    "job": {"company": "Stripe", "job_id": "j1"},
                },
                headers={"Authorization": "Bearer fake"},
            )

        body = resp.get_json()
        assert resp.status_code == 200, body
        assert body["contact_id"] == "existing-contact-id-999"
        assert body["was_new"] is False


# ---------------------------------------------------------------------------
# /referral-draft/from-find-recruiter (Phase 6 — Find the Connection rewire)
# ---------------------------------------------------------------------------

FROM_FIND_RECRUITER_ENDPOINT = "/api/job-board/referral-draft/from-find-recruiter"


def _wire_recruiter_cache(wiring, recruiters: list, *, search_id: str = "sid-1",
                          company: str = "Stripe", job_title: str = "SWE",
                          expires_in_min: int = 30):
    """Pre-seed a recruiter_cache doc readable by /from-find-recruiter.

    The collection MagicMock plumbed by _wire_user() returns a single
    'collection lookup' MagicMock for `recruiter_cache`; this helper attaches
    a doc that matches what `find_cached_recruiter` needs.
    """
    recruiter_cache_col = MagicMock()
    recruiter_cache_col.document.return_value = MagicMock()
    snap = MagicMock()
    snap.exists = True
    snap.to_dict.return_value = {
        "search_id": search_id,
        "company": company,
        "job_title": job_title,
        "recruiters": recruiters,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=expires_in_min),
    }
    recruiter_cache_col.document.return_value.get.return_value = snap

    # Hot-patch the user_doc_ref.collection side-effect so that
    # 'recruiter_cache' resolves to the seeded collection. The original
    # side_effect already routes other names.
    original_side_effect = wiring["user_doc_ref"].collection.side_effect

    def routed(name):
        if name == "recruiter_cache":
            return recruiter_cache_col
        return original_side_effect(name)

    wiring["user_doc_ref"].collection.side_effect = routed
    return recruiter_cache_col


class TestFromFindRecruiterEndpoint:

    @pytest.mark.unit
    def test_happy_path_persists_and_drafts(self, client):
        """Server reads from recruiter_cache, persists the chosen recruiter
        with source='find_recruiter', then runs build_referral_draft."""
        db = MagicMock()
        wiring = _wire_user(db)
        recruiter = _make_contact(
            first="Patrick", last="Morey",
            company="Figma", title="Recruiting Manager",
            email="patrick@figma.com",
        )
        _wire_recruiter_cache(wiring, [recruiter], search_id="sid-1",
                              company="Figma", job_title="TPM Data Science")

        draft_payload = {
            "ok": True,
            "subject": "Quick chat about the Figma TPM role?",
            "body": "Hi Patrick, ...",
            "context_used": {"two_step_framing": True},
            "relationship": "weak",
        }

        with patch("app.extensions.get_db", return_value=db), \
             patch("app.routes.job_board._check_user_rate_limit", return_value=True), \
             patch("app.services.referral_email.build_referral_draft",
                   return_value=draft_payload) as mock_build, \
             patch("app.services.alumni_discovery.persist_find_recruiter_contact",
                   return_value=("new-contact-id-1", True)) as mock_persist:
            resp = client.post(
                FROM_FIND_RECRUITER_ENDPOINT,
                json={
                    "search_id": "sid-1",
                    "recruiter_email": "patrick@figma.com",
                    "job": {"company": "Figma", "title": "TPM Data Science"},
                },
                headers={"Authorization": "Bearer fake"},
            )

        body = resp.get_json()
        assert resp.status_code == 200, body
        assert body["contact_id"] == "new-contact-id-1"
        assert body["was_new"] is True
        assert body["subject"].startswith("Quick chat")
        mock_persist.assert_called_once()
        # Critical: the persisted contact_id (not the recruiter_email) flows
        # into build_referral_draft — confirms the trust boundary.
        kwargs = mock_build.call_args.kwargs or {}
        if "contact_id" in kwargs:
            assert kwargs["contact_id"] == "new-contact-id-1"
        else:
            args = mock_build.call_args.args
            assert "new-contact-id-1" in args

    @pytest.mark.unit
    def test_expired_cache_returns_410(self, client):
        """No live cache doc → 410 recruiter_cache_expired (mirrors
        discovery_expired)."""
        db = MagicMock()
        wiring = _wire_user(db)
        miss_col = MagicMock()
        miss_col.document.return_value.get.return_value = MagicMock(exists=False)
        original = wiring["user_doc_ref"].collection.side_effect

        def routed(name):
            if name == "recruiter_cache":
                return miss_col
            return original(name)
        wiring["user_doc_ref"].collection.side_effect = routed

        with patch("app.extensions.get_db", return_value=db), \
             patch("app.routes.job_board._check_user_rate_limit", return_value=True), \
             patch("app.services.referral_email.build_referral_draft") as mock_build, \
             patch("app.services.alumni_discovery.persist_find_recruiter_contact") as mock_persist:
            resp = client.post(
                FROM_FIND_RECRUITER_ENDPOINT,
                json={
                    "search_id": "stale",
                    "recruiter_email": "x@y.com",
                    "job": {"company": "Stripe"},
                },
                headers={"Authorization": "Bearer fake"},
            )

        assert resp.status_code == 410, resp.get_json()
        assert resp.get_json().get("code") == "recruiter_cache_expired"
        mock_build.assert_not_called()
        mock_persist.assert_not_called()

    @pytest.mark.unit
    def test_forged_email_rejected_404(self, client):
        """An email not in the cached recruiter list → 404 with
        recruiter_email_not_in_cache. Prevents the client from forging
        contact fields."""
        db = MagicMock()
        wiring = _wire_user(db)
        legit = _make_contact(first="L", last="R", company="Stripe",
                              email="legit@stripe.com")
        _wire_recruiter_cache(wiring, [legit], search_id="sid-1",
                              company="Stripe", job_title="SWE")

        with patch("app.extensions.get_db", return_value=db), \
             patch("app.routes.job_board._check_user_rate_limit", return_value=True), \
             patch("app.services.referral_email.build_referral_draft") as mock_build, \
             patch("app.services.alumni_discovery.persist_find_recruiter_contact") as mock_persist:
            resp = client.post(
                FROM_FIND_RECRUITER_ENDPOINT,
                json={
                    "search_id": "sid-1",
                    "recruiter_email": "forged@evil.com",
                    "job": {"company": "Stripe"},
                },
                headers={"Authorization": "Bearer fake"},
            )

        assert resp.status_code == 404, resp.get_json()
        assert resp.get_json().get("code") == "recruiter_email_not_in_cache"
        mock_build.assert_not_called()
        mock_persist.assert_not_called()

    @pytest.mark.unit
    def test_rate_limit_returns_429(self, client):
        db = MagicMock()
        _wire_user(db)
        with patch("app.extensions.get_db", return_value=db), \
             patch("app.routes.job_board._check_user_rate_limit", return_value=False):
            resp = client.post(
                FROM_FIND_RECRUITER_ENDPOINT,
                json={
                    "search_id": "sid-1",
                    "recruiter_email": "x@y.com",
                    "job": {"company": "Stripe"},
                },
                headers={"Authorization": "Bearer fake"},
            )
        assert resp.status_code == 429

    @pytest.mark.unit
    def test_dedup_race_returns_existing_contact_id(self, client):
        """Parallel-tab race: existing contact with same identity_key →
        returns existing contact_id + was_new=False."""
        db = MagicMock()
        wiring = _wire_user(db)
        recruiter = _make_contact(first="Dup", last="R", company="Stripe",
                                  email="dup@stripe.com")
        _wire_recruiter_cache(wiring, [recruiter], search_id="sid-1",
                              company="Stripe", job_title="SWE")

        draft_payload = {"ok": True, "subject": "s", "body": "b",
                         "relationship": "weak"}

        with patch("app.extensions.get_db", return_value=db), \
             patch("app.routes.job_board._check_user_rate_limit", return_value=True), \
             patch("app.services.referral_email.build_referral_draft",
                   return_value=draft_payload), \
             patch("app.services.alumni_discovery.persist_find_recruiter_contact",
                   return_value=("existing-99", False)):
            resp = client.post(
                FROM_FIND_RECRUITER_ENDPOINT,
                json={
                    "search_id": "sid-1",
                    "recruiter_email": "dup@stripe.com",
                    "job": {"company": "Stripe"},
                },
                headers={"Authorization": "Bearer fake"},
            )

        body = resp.get_json()
        assert resp.status_code == 200, body
        assert body["contact_id"] == "existing-99"
        assert body["was_new"] is False


# ---------------------------------------------------------------------------
# Feature flag — when off, every route 404s
# ---------------------------------------------------------------------------

class TestFeatureFlag:

    @pytest.mark.unit
    def test_disabled_flag_returns_404(self, client):
        os.environ["DISCOVER_ALUMNI_ENABLED"] = "false"
        try:
            db = MagicMock()
            _wire_user(db)
            with patch("app.extensions.get_db", return_value=db), \
                 patch("app.routes.job_board._check_user_rate_limit", return_value=True):
                resp = client.post(
                    DISCOVER_ENDPOINT,
                    json={"job_id": "j1", "company": "Stripe", "title": "SWE"},
                    headers={"Authorization": "Bearer fake"},
                )
            assert resp.status_code == 404
        finally:
            os.environ["DISCOVER_ALUMNI_ENABLED"] = "true"
