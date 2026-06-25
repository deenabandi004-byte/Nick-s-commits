"""
Fixture-based unit tests for the auto-apply form-fillers.

We can't run Playwright headlessly in CI without burning Browserless quota,
so the tests focus on the parts of the filler logic we CAN exercise on the
captured HTML fixtures:

  - The captured Greenhouse fixture is a real Greenhouse application form
    (SpaceX). Parse it with BeautifulSoup and assert that the selectors the
    filler relies on actually resolve.

  - The detector + screening-answer logic is pure Python; assert it correctly
    forces "decline" defaults for sensitive demographic fields, and that the
    work-auth gate refuses to fire without an explicit answer.
"""
import os
import pathlib

import pytest
from bs4 import BeautifulSoup


FIXTURES = pathlib.Path(__file__).parent / "fixtures" / "auto_apply"


# ---------------------------------------------------------------------------
# Fixture loaders
# ---------------------------------------------------------------------------

def _load(name: str) -> BeautifulSoup:
    path = FIXTURES / name
    if not path.exists():
        pytest.skip(f"fixture not present: {name}")
    return BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")


# ---------------------------------------------------------------------------
# Greenhouse fixture: stable selectors the filler depends on
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def greenhouse_doc():
    return _load("greenhouse_sample.html")


def test_greenhouse_standard_ids_present(greenhouse_doc):
    """The Greenhouse filler hard-codes these IDs. If a real Greenhouse form
    drops one, the filler needs to learn about it."""
    for sel in ("first_name", "last_name", "email", "phone"):
        assert greenhouse_doc.find(id=sel) is not None, f"missing #{sel}"


def test_greenhouse_resume_input_is_file(greenhouse_doc):
    resume = greenhouse_doc.find(id="resume")
    assert resume is not None
    assert resume.get("type") == "file"


def test_greenhouse_eeo_selectors_present(greenhouse_doc):
    """EEO fields are the highest-stakes part of the filler (legal
    compliance + Decline defaults). Confirm Greenhouse keeps these IDs
    stable."""
    for sel in ("gender", "hispanic_ethnicity", "veteran_status", "disability_status"):
        assert greenhouse_doc.find(id=sel) is not None, f"missing EEO #{sel}"


def test_greenhouse_custom_question_label_pattern(greenhouse_doc):
    """Custom questions use <label id="question_XXX-label" for="question_XXX">.
    The filler iterates these to classify by keyword. Confirm at least one
    such label exists."""
    labels = greenhouse_doc.find_all("label", id=lambda v: v and v.startswith("question_") and v.endswith("-label"))
    assert len(labels) > 0, "no custom-question labels in fixture"
    # The `for` attribute must point at a real input we can resolve.
    for label in labels[:5]:
        target_id = label.get("for")
        assert target_id, f"label {label.get('id')} missing for=..."


# ---------------------------------------------------------------------------
# ATS detector — covers the production job_id prefix shapes Sid hit
# ---------------------------------------------------------------------------

def test_ats_detector_real_job_ids():
    """These are real job IDs from Sid's feed (greenhouse_stripe_..., etc.).
    The detector must recognize the prefix even when ats_platform is missing
    on the Firestore doc."""
    from app.services.auto_apply.ats_detector import detect_platform, is_eligible

    assert detect_platform({"job_id": "greenhouse_stripe_8004054"}) == "greenhouse"
    assert detect_platform({"job_id": "greenhouse_doordashusa_7932109"}) == "greenhouse"
    assert detect_platform({"job_id": "lever_brex_12345"}) == "lever"
    assert detect_platform({"job_id": "ashby_1password_abc"}) == "ashby"
    assert detect_platform({"job_id": "workday_cisco_x"}) is None

    # FJ explicit tag wins over job_id prefix
    assert detect_platform({
        "job_id": "greenhouse_x_1", "ats_platform": "workday"
    }) is None

    # Expired jobs are NEVER eligible regardless of platform
    assert is_eligible({"job_id": "greenhouse_stripe_1"}) is True
    assert is_eligible({"job_id": "greenhouse_stripe_1", "expired": True}) is False


# ---------------------------------------------------------------------------
# Sensitive-field defaults — the never-infer rule
# ---------------------------------------------------------------------------

def test_decline_default_for_unset_demographics():
    """The plan's source-of-truth rule: when the user has not explicitly set
    race / gender / ethnicity / veteran / disability, the resolver MUST
    return 'decline'. We never infer these."""
    from app.services.auto_apply.screening_answers import resolve_structured

    profile = {
        "demographics": {"gender": None, "race": None, "ethnicity": None, "lgbtq": None},
        "veteranStatus": None,
        "disabilityStatus": None,
    }
    assert resolve_structured(profile, "Gender") == "decline"
    assert resolve_structured(profile, "Race") == "decline"
    assert resolve_structured(profile, "Are you a protected veteran?") == "decline"
    assert resolve_structured(profile, "Disability status") == "decline"


def test_decline_default_does_not_overwrite_set_values():
    from app.services.auto_apply.screening_answers import resolve_structured

    profile = {"demographics": {"gender": "female"}}
    assert resolve_structured(profile, "Gender") == "female"


def test_unmatched_label_returns_none_for_llm_fallthrough():
    """If a label doesn't match a structured-screening keyword, the resolver
    returns None so the caller falls through to the LLM open-ended path."""
    from app.services.auto_apply.screening_answers import resolve_structured

    assert resolve_structured({}, "Tell us about a project you're proud of") is None


# ---------------------------------------------------------------------------
# Work-authorization guard — explicit answer required, never inferred
# ---------------------------------------------------------------------------

def test_greenhouse_url_embed_endpoint_is_first():
    """The /embed/job_app endpoint is the iframe-embed URL that returns ONLY
    the application form HTML — bypasses any company-side redirect (Stripe,
    Databricks, DoorDash all redirect canonical Greenhouse URLs to their own
    careers page). The resolver MUST try /embed/job_app first."""
    from app.services.auto_apply.greenhouse import _candidate_apply_urls

    urls = _candidate_apply_urls(
        apply_url="https://stripe.com/jobs/search?gh_jid=8004054",
        job_id="greenhouse_stripe_8004054",
    )
    # Embed URL is the highest-confidence candidate
    assert urls[0] == "https://boards.greenhouse.io/embed/job_app?for=stripe&token=8004054"
    # /applications/new is the explicit form path on legacy boards
    assert "https://boards.greenhouse.io/stripe/jobs/8004054/applications/new" in urls
    # Raw non-greenhouse apply_url is appended last
    assert urls[-1] == "https://stripe.com/jobs/search?gh_jid=8004054"


def test_greenhouse_url_resolution_already_greenhouse_uses_it_first():
    """When apply_url is already a Greenhouse URL, try it first (e.g., SpaceX
    where the form genuinely lives on the canonical /jobs/{id} page)."""
    from app.services.auto_apply.greenhouse import _candidate_apply_urls

    urls = _candidate_apply_urls(
        apply_url="https://boards.greenhouse.io/spacex/jobs/8403223002",
        job_id="greenhouse_spacex_8403223002",
    )
    assert urls[0] == "https://boards.greenhouse.io/spacex/jobs/8403223002"
    # Embed endpoint still tried as a fallback
    assert any("/embed/job_app?for=spacex&token=8403223002" in u for u in urls)


def test_greenhouse_url_resolution_missing_job_id_falls_back_to_apply_url():
    from app.services.auto_apply.greenhouse import _candidate_apply_urls

    urls = _candidate_apply_urls(
        apply_url="https://stripe.com/jobs/123",
        job_id="",
    )
    # No reconstruction possible — only the raw apply_url
    assert urls == ["https://stripe.com/jobs/123"]


def test_custom_question_classifier_routes_real_stripe_labels():
    """The 10 unmapped labels Sid hit on the live Stripe job — most of them
    should now route to structured profile values or NEEDS_USER (never
    silently wrong-fill, especially for work auth)."""
    from app.services.auto_apply.greenhouse import _classify_custom_question

    fields = {
        "linkedin_url": "https://linkedin.com/in/sid",
        "github_url": "https://github.com/sid",
        "portfolio_url": "",
        "most_recent_company": "Offerloop",
    }
    structured = {
        "authorized_to_work_us": True,
        "requires_sponsorship": False,
        "open_to_remote": True,
        "open_to_relocation": True,
    }
    open_ended = {"why_role": "Stripe payments role…", "why_company": "Stripe mission…"}

    # Work auth: maps to structured Yes
    v, combo = _classify_custom_question(
        "Are you authorized to work in the location(s) you selected?",
        fields, structured, open_ended,
    )
    assert v == "Yes" and combo is True

    # Sponsorship: maps to structured No
    v, combo = _classify_custom_question(
        "Will you require Stripe to sponsor you for a work permit?",
        fields, structured, open_ended,
    )
    assert v == "No" and combo is True

    # Country: default US for now
    v, combo = _classify_custom_question(
        "Please select the country where you currently reside",
        fields, structured, open_ended,
    )
    assert v == "United States" and combo is True

    # Remote
    v, _ = _classify_custom_question(
        "Do you plan to work remotely?", fields, structured, open_ended,
    )
    assert v == "Yes"

    # Bay Area / relocate
    v, _ = _classify_custom_question(
        "Are you willing to relocate to the Bay Area, CA?",
        fields, structured, open_ended,
    )
    assert v == "Yes"

    # Current/previous employer
    v, combo = _classify_custom_question(
        "Who is your current or previous employer?",
        fields, structured, open_ended,
    )
    assert v == "Offerloop" and combo is False

    # LinkedIn
    v, _ = _classify_custom_question("LinkedIn Profile", fields, structured, open_ended)
    assert v == "https://linkedin.com/in/sid"


def test_classifier_job_title_and_city_state_rules():
    """The two new rules added after Sid's Stripe-form dogfood. Job title and
    city/state need to route to resume fields, not unmapped."""
    from app.services.auto_apply.greenhouse import _classify_custom_question

    fields = {
        "most_recent_company": "Offerloop",
        "most_recent_title": "Co-founder & CTO",
        "location": "Los Angeles, CA",
    }
    structured = {}
    open_ended: dict[str, str] = {}

    v, _ = _classify_custom_question(
        "What is your current or previous job title?",
        fields, structured, open_ended,
    )
    assert v == "Co-founder & CTO"

    v, _ = _classify_custom_question(
        "What is your current role?",
        fields, structured, open_ended,
    )
    # "current role" matches the title rule, not the employer rule
    assert v == "Co-founder & CTO"

    v, _ = _classify_custom_question(
        "If located in the US, in what city and state do you reside?",
        fields, structured, open_ended,
    )
    assert v == "Los Angeles, CA"

    # Empty resume → unmapped
    v, _ = _classify_custom_question(
        "What is your current job title?",
        fields={"most_recent_title": ""}, structured={}, open_ended_answers={},
    )
    assert v is None


def test_application_profile_contact_overrides_resume():
    """Phone is commonly missed by resume parsers and LinkedIn isn't on
    resumes at all. The Application Profile contactInfo fields must override
    whatever the resume has (or doesn't have)."""
    from app.services.auto_apply.preview import build_structured_fields

    # Resume has empty phone, profile has explicit phone — profile wins
    user = {
        "resumeParsed": {"name": "Deena Bandi", "phone": "", "email": "x@y.com"},
        "professionalInfo": {},
        "applicationProfile": {
            "contactInfo": {
                "phone": "+1-310-555-0100",
                "linkedinUrl": "https://linkedin.com/in/sid",
            },
        },
    }
    fields = build_structured_fields(user)
    assert fields["phone"] == "+1-310-555-0100"
    assert fields["linkedin_url"] == "https://linkedin.com/in/sid"

    # When profile is empty, resume value is used (no regression)
    user_no_profile = {
        "resumeParsed": {"name": "Deena Bandi", "phone": "555-0123"},
        "professionalInfo": {"linkedinUrl": "https://linkedin.com/in/x"},
        "applicationProfile": {"contactInfo": {"phone": None, "linkedinUrl": None}},
    }
    fields = build_structured_fields(user_no_profile)
    assert fields["phone"] == "555-0123"
    assert fields["linkedin_url"] == "https://linkedin.com/in/x"


def test_name_split_takes_first_and_last_word_for_three_part_names():
    """Sid's full legal name is 'Deena Siddharth Bandi'. Greenhouse #last_name
    expects the surname only — 'Bandi' — not 'Siddharth Bandi'."""
    from app.services.auto_apply.preview import _split_name

    assert _split_name("Deena Siddharth Bandi") == ("Deena", "Bandi")
    assert _split_name("Jane Doe") == ("Jane", "Doe")
    assert _split_name("Madonna") == ("Madonna", "")
    assert _split_name("") == ("", "")
    assert _split_name("  Maria   José  García  Lopez  ") == ("Maria", "Lopez")


def test_work_auth_unmapped_when_profile_unset_never_guesses():
    """If authorized_to_work_us is None on the profile, the classifier MUST
    return None (caller adds to unmapped). We never default to Yes/No on
    work authorization — that would be misrepresentation."""
    from app.services.auto_apply.greenhouse import _classify_custom_question

    v, _ = _classify_custom_question(
        "Are you authorized to work in the US?",
        fields={}, structured={"authorized_to_work_us": None}, open_ended_answers={},
    )
    assert v is None


def test_work_auth_complete_requires_explicit_value():
    """work_auth_complete must reject profiles where authorizedToWorkUS is
    unset — otherwise we'd submit an application with a wrong-or-blank work
    authorization answer, which is misrepresentation."""
    from app.services.auto_apply.application_profile import work_auth_complete

    assert work_auth_complete({"workAuthorization": {"authorizedToWorkUS": None}}) is False
    assert work_auth_complete({}) is False
    assert work_auth_complete({"workAuthorization": {}}) is False
    assert work_auth_complete({"workAuthorization": {"authorizedToWorkUS": True}}) is True
    assert work_auth_complete({"workAuthorization": {"authorizedToWorkUS": False}}) is True
