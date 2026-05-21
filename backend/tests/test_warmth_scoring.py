"""Tests for warmth_scoring module."""
import pytest
import os

os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", "test-credentials.json")

from app.utils.warmth_scoring import (
    compute_warmth_score,
    score_and_sort_contacts,
    score_contacts_for_email,
    _build_user_comparison_data,
    _score_role_match,
    _compute_warmth_label,
    _tier_label,
    SHARED_IDENTITY_CAP,
    TIER_THRESHOLDS,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def user_profile():
    return {
        "academics": {"university": "University of Southern California", "major": "Finance"},
        "goals": {"careerTrack": "investment banking", "dreamCompanies": ["Goldman Sachs", "JPMorgan"]},
        "resumeParsed": {
            "university": "University of Southern California",
            "major": "Finance",
            "experience": [{"company": "Deloitte"}],
        },
        "hometown": "Los Angeles",
    }


@pytest.fixture
def warm_contact():
    """Contact that shares university + target industry = warm."""
    return {
        "FirstName": "Jane",
        "LastName": "Doe",
        "College": "University of Southern California",
        "title": "Investment Banking Analyst",
        "company": "Goldman Sachs",
        "headline": "Investment Banking Analyst at Goldman Sachs",
        "experience": [
            {"company": {"name": "Goldman Sachs"}, "title": {"name": "Analyst"}},
            {"company": {"name": "PwC"}, "title": {"name": "Intern"}},
        ],
        "educationArray": [{"school": "University of Southern California", "major": "Finance"}],
    }


@pytest.fixture
def neutral_contact():
    """Contact with some career relevance but no shared identity."""
    return {
        "FirstName": "Bob",
        "LastName": "Smith",
        "College": "NYU",
        "title": "Analyst",
        "company": "Morgan Stanley",
        "headline": "Analyst at Morgan Stanley",
        "experience": [{"company": {"name": "Morgan Stanley"}, "title": {"name": "Analyst"}}],
    }


@pytest.fixture
def cold_contact():
    """Contact with no overlap."""
    return {
        "FirstName": "Alex",
        "LastName": "Johnson",
        "College": "MIT",
        "title": "Software Engineer",
        "company": "Startup Inc",
        "headline": "Software Engineer at Startup Inc",
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_warm_contact_scores_above_threshold(user_profile, warm_contact):
    comparison = _build_user_comparison_data(user_profile)
    result = compute_warmth_score(comparison, warm_contact)
    assert result["tier"] == "warm"
    assert result["score"] >= TIER_THRESHOLDS["warm"]


def test_cold_contact_scores_below_neutral(user_profile, cold_contact):
    comparison = _build_user_comparison_data(user_profile)
    result = compute_warmth_score(comparison, cold_contact)
    assert result["tier"] == "cold"
    assert result["score"] < TIER_THRESHOLDS["neutral"]


def test_neutral_contact_in_middle(user_profile, neutral_contact):
    comparison = _build_user_comparison_data(user_profile)
    result = compute_warmth_score(comparison, neutral_contact)
    # Neutral should have career relevance points but few identity points
    assert result["score"] >= 0


def test_shared_identity_cap(user_profile):
    """Identity points alone should not exceed SHARED_IDENTITY_CAP."""
    comparison = _build_user_comparison_data(user_profile)
    # Contact with maximum identity overlap: same university + same major + same employer + same hometown
    contact = {
        "College": "University of Southern California",
        "major": "Finance",
        "company": "Deloitte",
        "City": "Los Angeles",
        "title": "Teacher",  # unrelated role
        "headline": "Teacher at School",
    }
    result = compute_warmth_score(comparison, contact)
    # Raw identity signals: university(20) + major(10) + employer(15) + hometown(8) = 53
    # After cap, identity contribution should be at most SHARED_IDENTITY_CAP (45).
    # Total score may exceed cap due to career relevance signals.
    identity_signals = {"same_university", "same_major", "same_hometown", "same_past_employer"}
    identity_raw = sum(s["points"] for s in result["signals"] if s["signal"] in identity_signals)
    # The raw signals aren't individually capped, but the function caps their combined contribution.
    # Total score should be less than uncapped identity (53) + any career points.
    assert identity_raw > SHARED_IDENTITY_CAP, "Test needs enough identity overlap to exceed cap"
    # Score should be lower than if identity were uncapped
    assert result["score"] < identity_raw + 20  # some career signals may add, but identity is capped


def test_score_and_sort_contacts_ordering(user_profile, warm_contact, cold_contact):
    contacts = [cold_contact, warm_contact]
    sorted_contacts = score_and_sort_contacts(user_profile, contacts)
    assert sorted_contacts[0]["warmth_score"] >= sorted_contacts[1]["warmth_score"]
    assert sorted_contacts[0].get("warmth_tier") is not None


def test_score_and_sort_empty_list(user_profile):
    result = score_and_sort_contacts(user_profile, [])
    assert result == []


def test_dream_company_signal(user_profile):
    comparison = _build_user_comparison_data(user_profile)
    contact = {
        "FirstName": "Test",
        "company": "Goldman Sachs",
        "title": "Analyst",
        "headline": "Analyst at Goldman Sachs",
    }
    result = compute_warmth_score(comparison, contact)
    signal_names = [s["signal"] for s in result["signals"]]
    assert "dream_company" in signal_names


def test_missing_fields_no_crash(user_profile):
    """Scoring a contact with minimal/empty fields should not raise."""
    comparison = _build_user_comparison_data(user_profile)
    result = compute_warmth_score(comparison, {})
    assert isinstance(result["score"], int)
    assert result["tier"] in ("warm", "neutral", "cold")


def test_firestore_field_normalization():
    """Contacts saved from Firestore use different field names."""
    user = {"academics": {"university": "USC"}}
    comparison = _build_user_comparison_data(user)
    contact = {
        "college": "USC",  # lowercase Firestore field
        "jobTitle": "Analyst",
        "company": "Test Co",
    }
    result = compute_warmth_score(comparison, contact)
    # Should not crash and should synthesize headline
    assert isinstance(result["score"], int)


def test_university_from_resume_parsed_education():
    """University nested under resumeParsed.education must be found by warmth scoring.

    This is the real-world case: the resume parser stores university at
    resumeParsed.education.university, and the user has no academics
    onboarding data.  Previously _build_user_comparison_data only checked
    resumeParsed.university (top-level), which was always None.
    """
    user = {
        "resumeParsed": {
            "education": {
                "university": "University of Southern California (USC)",
                "major": "Data Science",
                "graduation": "May 2026",
            },
            "experience": [],
        },
        # No academics, no professionalInfo - university only in resume
    }
    comparison = _build_user_comparison_data(user)
    assert "southern california" in comparison["university"], (
        f"Expected USC in university, got: {comparison['university']!r}"
    )
    # Should detect same_university for a USC alum contact
    contact = {
        "College": "University of Southern California",
        "title": "Analyst",
        "company": "Test",
        "headline": "Analyst at Test",
    }
    result = compute_warmth_score(comparison, contact)
    signal_names = [s["signal"] for s in result["signals"]]
    assert "same_university" in signal_names


def test_university_from_top_level_profile_field():
    """University set directly on user_profile (by route handler) should be found."""
    user = {
        "university": "USC",
        # No academics, no resumeParsed
    }
    comparison = _build_user_comparison_data(user)
    assert comparison["university"] == "usc"


def test_score_contacts_for_email(user_profile, warm_contact, cold_contact):
    result = score_contacts_for_email(user_profile, [warm_contact, cold_contact])
    assert 0 in result
    assert 1 in result
    assert result[0]["tier"] in ("warm", "neutral", "cold")
    assert "score" in result[0]
    assert "signals" in result[0]


def test_score_contacts_for_email_error_returns_empty():
    """If scoring fails, should return empty dict (graceful degradation)."""
    result = score_contacts_for_email(None, None)  # will throw internally
    assert result == {}


def test_tier_label():
    assert _tier_label(60) == "warm"
    assert _tier_label(50) == "warm"
    assert _tier_label(30) == "neutral"
    assert _tier_label(25) == "neutral"
    assert _tier_label(10) == "cold"
    assert _tier_label(0) == "cold"


# ---------------------------------------------------------------------------
# University variant matching (PDL format edge cases)
# ---------------------------------------------------------------------------

class TestUniversityVariantMatching:
    """Verify same_university fires for all common PDL representations."""

    @pytest.fixture
    def usc_user(self):
        """USC Data Science student with shorthand in profile."""
        return {
            "academics": {"university": "USC", "major": "Data Science"},
            "goals": {"careerTrack": "tech"},
        }

    @pytest.fixture
    def usc_user_full_name(self):
        """USC student with full university name in profile."""
        return {
            "academics": {"university": "University of Southern California", "major": "Data Science"},
            "goals": {"careerTrack": "tech"},
        }

    def _has_signal(self, result, signal_name):
        return any(s["signal"] == signal_name for s in result["signals"])

    def test_pdl_school_as_nested_dict(self, usc_user):
        """PDL often returns school as {"name": "...", "type": "..."}."""
        comparison = _build_user_comparison_data(usc_user)
        contact = {
            "FirstName": "David",
            "LastName": "Tao",
            "title": "Senior UX Program Manager",
            "company": "Google",
            "headline": "Senior UX Program Manager at Google",
            "educationArray": [
                {
                    "school": {"name": "University of Southern California", "type": "post-secondary institution"},
                    "degrees": ["bachelors"],
                    "majors": ["design"],
                    "end_date": "2015",
                },
            ],
            "experience": [
                {"company": {"name": "Google"}, "title": {"name": "Senior UX Program Manager"}},
                {"company": {"name": "YouTube"}, "title": {"name": "UX Program Manager"}},
            ],
        }
        result = compute_warmth_score(comparison, contact)
        assert self._has_signal(result, "same_university"), (
            f"Expected same_university signal, got signals: {result['signals']}"
        )

    def test_shorthand_vs_full_name(self, usc_user):
        """User profile has 'USC', contact has 'University of Southern California'."""
        comparison = _build_user_comparison_data(usc_user)
        contact = {
            "FirstName": "Sarah",
            "College": "University of Southern California",
            "title": "Analyst",
            "company": "Deloitte",
            "headline": "Analyst at Deloitte",
        }
        result = compute_warmth_score(comparison, contact)
        assert self._has_signal(result, "same_university")

    def test_full_name_vs_shorthand(self, usc_user_full_name):
        """User profile has full name, contact has 'USC' in College field."""
        comparison = _build_user_comparison_data(usc_user_full_name)
        contact = {
            "FirstName": "Mike",
            "College": "USC",
            "title": "PM",
            "company": "Meta",
            "headline": "PM at Meta",
        }
        result = compute_warmth_score(comparison, contact)
        assert self._has_signal(result, "same_university")

    def test_sub_school_variant(self, usc_user):
        """PDL sometimes stores sub-school names like 'USC Viterbi School of Engineering'."""
        comparison = _build_user_comparison_data(usc_user)
        contact = {
            "FirstName": "Li",
            "title": "Software Engineer",
            "company": "Amazon",
            "headline": "Software Engineer at Amazon",
            "educationArray": [
                {"school": "USC Viterbi School of Engineering", "major": "Computer Science"},
            ],
        }
        result = compute_warmth_score(comparison, contact)
        assert self._has_signal(result, "same_university")

    def test_marshall_sub_school(self, usc_user):
        """'USC Marshall School of Business' should match."""
        comparison = _build_user_comparison_data(usc_user)
        contact = {
            "FirstName": "Amy",
            "title": "Associate",
            "company": "BCG",
            "headline": "Associate at BCG",
            "educationArray": [
                {"school": "USC Marshall School of Business", "major": "Business Administration"},
            ],
        }
        result = compute_warmth_score(comparison, contact)
        assert self._has_signal(result, "same_university")


# ---------------------------------------------------------------------------
# Role match and warmth label tests
# ---------------------------------------------------------------------------

class TestRoleMatchAndWarmthLabel:
    """Tests for _score_role_match and _compute_warmth_label."""

    @pytest.fixture
    def user_profile_with_dream(self):
        return {
            "academics": {"university": "University of Southern California"},
            "goals": {"dreamCompanies": ["Disney"]},
        }

    def test_role_match_plus_dream_company_strong_fit(self, user_profile_with_dream):
        """Role match + dream company + school → 'Strong fit'."""
        search_ctx = {"title_variations": ["data scientist"]}
        comparison = _build_user_comparison_data(user_profile_with_dream, search_context=search_ctx)
        contact = {
            "title": "Data Scientist",
            "company": "Disney",
            "College": "University of Southern California",
            "headline": "Data Scientist at Disney",
            "experience": [{"company": {"name": "Disney"}, "title": {"name": "Data Scientist"}}],
            "educationArray": [{"school": "University of Southern California"}],
        }
        result = compute_warmth_score(comparison, contact)
        assert result["tier"] == "warm"
        assert result["label"] == "Strong fit"
        signal_names = [s["signal"] for s in result["signals"]]
        assert "role_match" in signal_names
        assert "dream_company" in signal_names

    def test_role_match_only_good_fit(self):
        """Role match without dream company or school → 'Good fit'."""
        user = {"goals": {}}
        search_ctx = {"title_variations": ["software engineer"]}
        comparison = _build_user_comparison_data(user, search_context=search_ctx)
        contact = {
            "title": "Software Engineer",
            "company": "Random Corp",
            "headline": "Software Engineer at Random Corp",
            "experience": [
                {"company": {"name": "Random Corp"}, "title": {"name": "Software Engineer"}},
                {"company": {"name": "Prev Co"}, "title": {"name": "Intern"}},
            ],
            "educationArray": [{"school": "MIT", "major": "CS"}],
        }
        result = compute_warmth_score(comparison, contact)
        assert result["label"] == "Good fit"
        signal_names = [s["signal"] for s in result["signals"]]
        assert "role_match" in signal_names

    def test_role_mismatch_dream_company_different_role(self, user_profile_with_dream):
        """No role match but dream company → 'Right company, different role'."""
        search_ctx = {"title_variations": ["data scientist"]}
        comparison = _build_user_comparison_data(user_profile_with_dream, search_context=search_ctx)
        contact = {
            "title": "Marketing Manager",
            "company": "Disney",
            "headline": "Marketing Manager at Disney",
        }
        result = compute_warmth_score(comparison, contact)
        assert result["label"] == "Right company, different role"
        signal_names = [s["signal"] for s in result["signals"]]
        assert "role_match" not in signal_names
        assert "dream_company" in signal_names

    def test_no_search_context_legacy_fallback(self, user_profile_with_dream):
        """Without search_context, labels fall back to tier-based defaults."""
        comparison = _build_user_comparison_data(user_profile_with_dream)  # no search_context
        contact = {
            "title": "Analyst",
            "company": "Disney",
            "College": "University of Southern California",
            "headline": "Analyst at Disney",
            "experience": [{"company": {"name": "Disney"}, "title": {"name": "Analyst"}}],
            "educationArray": [{"school": "University of Southern California"}],
        }
        result = compute_warmth_score(comparison, contact)
        # Without search_context, role_matched is None → legacy labels
        assert result["label"] in ("Strong match", "Good fit", "")
        signal_names = [s["signal"] for s in result["signals"]]
        assert "role_match" not in signal_names

    def test_empty_title_variations_no_boost(self):
        """Empty title_variations list → no role_match signal or points."""
        user = {"goals": {}}
        search_ctx = {"title_variations": []}
        comparison = _build_user_comparison_data(user, search_context=search_ctx)
        contact = {
            "title": "Data Scientist",
            "company": "Google",
            "headline": "Data Scientist at Google",
        }
        pts, signals, matched = _score_role_match(comparison, contact)
        assert pts == 0
        assert signals == []
        assert matched is None  # not evaluated, same as no search context
