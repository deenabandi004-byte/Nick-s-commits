"""
P0 Verification: Generate emails across warmth tiers and lead types.

Tests the full personalization -> prompt -> LLM -> post-processing pipeline.
Hits the real Claude API (no mocks) to validate actual email output quality.

Run with: pytest tests/test_p0_email_verification.py -v -s
"""
import json
import pytest
from unittest.mock import patch, MagicMock
from app.services.reply_generation import batch_generate_emails
from app.utils.personalization import (
    build_user_profile,
    build_batch_strategies,
    build_contact_profile,
)


# ---------------------------------------------------------------------------
# Shared test user: USC Finance student, interned at Deloitte
# ---------------------------------------------------------------------------
USER_PROFILE = {
    "name": "Sarah Chen",
    "email": "sarah.chen@usc.edu",
    "academics": {
        "university": "University of Southern California",
        "major": "Finance",
        "graduationYear": "2027",
    },
    "goals": {
        "careerTrack": "investment banking",
        "dreamCompanies": ["Goldman Sachs", "Morgan Stanley", "JPMorgan"],
    },
    "hometown": "San Francisco, CA",
}
RESUME_PARSED = {
    "name": "Sarah Chen",
    "education": {
        "university": "University of Southern California",
        "major": "Finance",
        "graduation": "May 2027",
    },
    "experience": [
        {"company": "Deloitte", "title": "Advisory Intern", "start_date": "Jun 2025", "end_date": "Aug 2025"},
        {"company": "USC Investment Fund", "title": "Analyst", "start_date": "Sep 2024"},
    ],
    "skills": {"technical": ["financial modeling", "Excel", "Python", "Bloomberg Terminal", "valuation"]},
    "career_interests": ["investment banking", "M&A advisory"],
}
RESUME_TEXT = "Sarah Chen\nFinance, University of Southern California\nDeloitte Advisory Intern\nUSC Investment Fund Analyst"
CAREER_INTERESTS = "investment banking"


# ---------------------------------------------------------------------------
# Test contacts spanning all lead types
# ---------------------------------------------------------------------------
CONTACTS = [
    # 0: Alumni (USC) - should get lead_type=alumni
    {
        "FirstName": "Michael", "LastName": "Park", "Company": "Lazard",
        "Title": "Associate", "City": "New York, NY",
        "educationArray": [
            {"school": {"name": "University of Southern California"}, "majors": ["Business Administration"], "degrees": ["Bachelor's"]},
        ],
        "experience": [
            {"company": {"name": "Lazard"}, "title": {"name": "Associate"}, "start_date": {"year": 2024, "month": 3}, "is_primary": True},
            {"company": {"name": "Houlihan Lokey"}, "title": {"name": "Analyst"}, "start_date": {"year": 2021, "month": 7}, "end_date": {"year": 2024, "month": 2}},
        ],
    },
    # 1: Dream company (Goldman) - should get lead_type=dream_company
    {
        "FirstName": "Jessica", "LastName": "Liu", "Company": "Goldman Sachs",
        "Title": "Vice President", "City": "New York, NY",
        "educationArray": [
            {"school": {"name": "University of Pennsylvania"}, "majors": ["Economics"], "degrees": ["Bachelor's"]},
        ],
        "experience": [
            {"company": {"name": "Goldman Sachs"}, "title": {"name": "Vice President"}, "start_date": {"year": 2020, "month": 1}, "is_primary": True},
            {"company": {"name": "Credit Suisse"}, "title": {"name": "Associate"}, "start_date": {"year": 2017, "month": 7}, "end_date": {"year": 2019, "month": 12}},
        ],
    },
    # 2: Shared company (Deloitte) - should get lead_type=shared_company
    {
        "FirstName": "David", "LastName": "Nguyen", "Company": "McKinsey",
        "Title": "Engagement Manager", "City": "Chicago, IL",
        "educationArray": [
            {"school": {"name": "University of Michigan"}, "majors": ["Economics"], "degrees": ["Bachelor's"]},
        ],
        "experience": [
            {"company": {"name": "McKinsey & Company"}, "title": {"name": "Engagement Manager"}, "start_date": {"year": 2022, "month": 1}, "is_primary": True},
            {"company": {"name": "Deloitte"}, "title": {"name": "Senior Consultant"}, "start_date": {"year": 2018, "month": 7}, "end_date": {"year": 2021, "month": 12}},
        ],
    },
    # 3: Shared hometown (San Francisco) - should get shared_hometown or career_path
    {
        "FirstName": "Rachel", "LastName": "Kim", "Company": "Bain & Company",
        "Title": "Consultant", "City": "San Francisco, CA",
        "location": "San Francisco, CA",
        "educationArray": [
            {"school": {"name": "Stanford University"}, "majors": ["Mathematics"], "degrees": ["Bachelor's"]},
        ],
        "experience": [
            {"company": {"name": "Bain & Company"}, "title": {"name": "Consultant"}, "start_date": {"year": 2023, "month": 9}, "is_primary": True},
        ],
    },
    # 4: Cold / general (no overlap) - should get general or role_match
    {
        "FirstName": "Tom", "LastName": "Williams", "Company": "Evercore",
        "Title": "Analyst", "City": "Houston, TX",
        "educationArray": [
            {"school": {"name": "Rice University"}, "majors": ["Political Science"], "degrees": ["Bachelor's"]},
        ],
        "experience": [
            {"company": {"name": "Evercore"}, "title": {"name": "Analyst"}, "start_date": {"year": 2024, "month": 7}, "is_primary": True},
        ],
    },
]


class TestPersonalizationStrategies:
    """Verify lead types are detected correctly before hitting LLM."""

    def test_strategies_cover_expected_lead_types(self):
        user = build_user_profile(
            resume_parsed=RESUME_PARSED,
            user_profile=USER_PROFILE,
            dream_companies=["Goldman Sachs", "Morgan Stanley", "JPMorgan"],
        )
        strategies = build_batch_strategies(user, CONTACTS)

        types = {i: s.lead_type for i, s in strategies.items()}
        print("\n=== Lead type assignments ===")
        for i, lt in types.items():
            s = strategies[i]
            print(f"  Contact {i} ({CONTACTS[i]['FirstName']} {CONTACTS[i]['LastName']}): "
                  f"lead_type={lt}, warmth={s.warmth_tier}, hook={s.lead_hook[:80]}")

        assert types[0] == "alumni", f"Expected alumni for USC contact, got {types[0]}"
        assert types[1] == "dream_company", f"Expected dream_company for Goldman, got {types[1]}"
        assert types[2] == "shared_company", f"Expected shared_company for Deloitte alum, got {types[2]}"
        # Contact 3: could be shared_hometown, career_path, or role_match
        assert types[3] in ("shared_hometown", "career_path", "role_match"), f"Unexpected type for Rachel: {types[3]}"
        # Contact 4: cold, likely role_match or general
        assert types[4] in ("role_match", "general", "career_path"), f"Unexpected type for Tom: {types[4]}"

    def test_no_contacts_get_empty_hook(self):
        user = build_user_profile(
            resume_parsed=RESUME_PARSED,
            user_profile=USER_PROFILE,
            dream_companies=["Goldman Sachs", "Morgan Stanley", "JPMorgan"],
        )
        strategies = build_batch_strategies(user, CONTACTS)
        for i, s in strategies.items():
            assert s.lead_hook, f"Contact {i} has empty lead_hook"
            assert s.prompt_instruction, f"Contact {i} has empty prompt_instruction"

    def test_alumni_gets_warm_tier(self):
        user = build_user_profile(
            resume_parsed=RESUME_PARSED,
            user_profile=USER_PROFILE,
        )
        strategies = build_batch_strategies(user, CONTACTS)
        assert strategies[0].warmth_tier == "warm"

    def test_metadata_includes_lead_type_and_commonality_types(self):
        """Verify metadata shape matches what emails.py writes to Firestore."""
        user = build_user_profile(
            resume_parsed=RESUME_PARSED,
            user_profile=USER_PROFILE,
            dream_companies=["Goldman Sachs", "Morgan Stanley", "JPMorgan"],
        )
        strategies = build_batch_strategies(user, CONTACTS)
        for i, s in strategies.items():
            assert isinstance(s.lead_type, str)
            assert isinstance(s.commonality_types, list)
            assert s.lead_type in s.commonality_types or s.lead_type == "general"


@pytest.mark.slow
class TestEmailOutputQuality:
    """Generate real emails via Claude API and inspect outputs.

    These tests hit the real Claude API. Mark as slow.
    Run with: pytest tests/test_p0_email_verification.py -m slow -v -s
    """

    def test_batch_5_emails_diversity_and_quality(self):
        """Generate 5 emails in one batch. Print for human review."""
        results = batch_generate_emails(
            contacts=CONTACTS,
            resume_text=RESUME_TEXT,
            user_profile=USER_PROFILE,
            career_interests=CAREER_INTERESTS,
            pre_parsed_user_info=RESUME_PARSED,
            personal_note="",
            dream_companies=["Goldman Sachs", "Morgan Stanley", "JPMorgan"],
        )

        print("\n" + "=" * 80)
        print("P0 VERIFICATION: 5 emails from single batch")
        print("=" * 80)

        subjects = []
        openers = []
        for idx in sorted(results.keys()):
            r = results[idx]
            contact = CONTACTS[idx] if idx < len(CONTACTS) else {}
            subject = r.get("subject", "")
            body = r.get("body", "")
            meta = r.get("personalization", {})

            subjects.append(subject)
            # Extract opener (first non-greeting line)
            lines = body.split("\n")
            opener = ""
            for line in lines:
                stripped = line.strip()
                if stripped and not stripped.lower().startswith("hi "):
                    opener = stripped
                    break
            openers.append(opener)

            word_count = len(body.split())
            print(f"\n--- Contact {idx}: {contact.get('FirstName', '?')} {contact.get('LastName', '?')} "
                  f"({contact.get('Title', '?')} at {contact.get('Company', '?')}) ---")
            print(f"Lead type: {meta.get('lead_type', 'n/a')} | Label: {meta.get('label', 'n/a')}")
            print(f"Subject: {subject}")
            print(f"Word count: {word_count}")
            print(f"Body:\n{body}")
            print()

        # Diversity checks
        unique_subjects = len(set(subjects))
        unique_openers = len(set(openers))
        print(f"\n=== Diversity ===")
        print(f"Unique subjects: {unique_subjects}/{len(subjects)}")
        print(f"Unique openers: {unique_openers}/{len(openers)}")

        assert unique_subjects >= 4, f"Only {unique_subjects} unique subjects in batch of 5 - too repetitive"
        assert unique_openers >= 4, f"Only {unique_openers} unique openers in batch of 5 - too repetitive"

        # Every email should have personalization metadata
        for idx in results:
            meta = results[idx].get("personalization", {})
            assert meta.get("lead_type"), f"Contact {idx} missing lead_type in metadata"

    def test_profile_a_cs_major_batch(self):
        """Profile A: CS major, dream companies Google/Meta/Stripe, past startup internship."""
        user_profile_a = {
            "name": "Jake Rodriguez",
            "email": "jake.rod@umich.edu",
            "academics": {
                "university": "University of Michigan",
                "major": "Computer Science",
                "graduationYear": "2027",
            },
            "goals": {
                "careerTrack": "software engineering",
                "dreamCompanies": ["Google", "Meta", "Stripe"],
            },
            "hometown": "Austin, TX",
        }
        resume_parsed_a = {
            "name": "Jake Rodriguez",
            "education": {
                "university": "University of Michigan",
                "major": "Computer Science",
                "graduation": "May 2027",
            },
            "experience": [
                {"company": "Stealth Startup", "title": "Software Engineering Intern", "start_date": "Jun 2025", "end_date": "Aug 2025"},
                {"company": "Michigan Daily", "title": "Web Developer", "start_date": "Sep 2024"},
            ],
            "skills": {"technical": ["Python", "React", "TypeScript", "AWS", "PostgreSQL", "Docker"]},
            "career_interests": ["software engineering", "full-stack development"],
        }
        contacts_a = [
            # 0: Alumni (UMich)
            {
                "FirstName": "Priya", "LastName": "Sharma", "Company": "Stripe",
                "Title": "Staff Engineer", "City": "San Francisco, CA",
                "educationArray": [{"school": {"name": "University of Michigan"}, "majors": ["Computer Science"], "degrees": ["Bachelor's"]}],
                "experience": [
                    {"company": {"name": "Stripe"}, "title": {"name": "Staff Engineer"}, "start_date": {"year": 2021, "month": 1}, "is_primary": True},
                    {"company": {"name": "Google"}, "title": {"name": "Senior SWE"}, "start_date": {"year": 2017, "month": 6}, "end_date": {"year": 2020, "month": 12}},
                ],
                "skills": ["Python", "Go", "Distributed Systems", "AWS"],
            },
            # 1: Dream company (Google) - no alumni overlap
            {
                "FirstName": "Kevin", "LastName": "Zhang", "Company": "Google",
                "Title": "Product Manager", "City": "Mountain View, CA",
                "educationArray": [{"school": {"name": "Carnegie Mellon University"}, "majors": ["HCI"], "degrees": ["Master's"]}],
                "experience": [
                    {"company": {"name": "Google"}, "title": {"name": "Product Manager"}, "start_date": {"year": 2023, "month": 3}, "is_primary": True},
                    {"company": {"name": "Microsoft"}, "title": {"name": "APM"}, "start_date": {"year": 2020, "month": 8}, "end_date": {"year": 2023, "month": 2}},
                ],
            },
            # 2: Shared major (CS at different school)
            {
                "FirstName": "Amanda", "LastName": "Foster", "Company": "Databricks",
                "Title": "Software Engineer", "City": "San Francisco, CA",
                "educationArray": [{"school": {"name": "Georgia Tech"}, "majors": ["Computer Science"], "degrees": ["Bachelor's"]}],
                "experience": [
                    {"company": {"name": "Databricks"}, "title": {"name": "Software Engineer"}, "start_date": {"year": 2024, "month": 7}, "is_primary": True},
                ],
                "skills": ["Python", "Spark", "React", "TypeScript"],
            },
            # 3: Shared hometown (Austin)
            {
                "FirstName": "Marcus", "LastName": "Bell", "Company": "Meta",
                "Title": "Engineering Manager", "City": "Austin, TX",
                "location": "Austin, TX",
                "educationArray": [{"school": {"name": "UT Austin"}, "majors": ["Electrical Engineering"], "degrees": ["Bachelor's"]}],
                "experience": [
                    {"company": {"name": "Meta"}, "title": {"name": "Engineering Manager"}, "start_date": {"year": 2022, "month": 1}, "is_primary": True},
                    {"company": {"name": "Amazon"}, "title": {"name": "SDE II"}, "start_date": {"year": 2018, "month": 7}, "end_date": {"year": 2021, "month": 12}},
                ],
            },
            # 4: Cold / general (no overlap)
            {
                "FirstName": "Claire", "LastName": "Dubois", "Company": "Palantir",
                "Title": "Forward Deployed Engineer", "City": "Denver, CO",
                "educationArray": [{"school": {"name": "Duke University"}, "majors": ["Mathematics"], "degrees": ["Bachelor's"]}],
                "experience": [
                    {"company": {"name": "Palantir"}, "title": {"name": "Forward Deployed Engineer"}, "start_date": {"year": 2023, "month": 9}, "is_primary": True},
                ],
            },
        ]

        results = batch_generate_emails(
            contacts=contacts_a,
            resume_text="Jake Rodriguez\nComputer Science, University of Michigan\nStealth Startup SWE Intern\nMichigan Daily Web Developer",
            user_profile=user_profile_a,
            career_interests="software engineering",
            pre_parsed_user_info=resume_parsed_a,
            personal_note="",
            dream_companies=["Google", "Meta", "Stripe"],
        )

        self._print_batch("PROFILE A (CS/UMich)", results, contacts_a)
        self._assert_diversity(results, contacts_a)

    def test_profile_b_marketing_major_batch(self):
        """Profile B: Marketing major, no internships, strong extracurriculars."""
        user_profile_b = {
            "name": "Mia Thompson",
            "email": "mia.t@nyu.edu",
            "academics": {
                "university": "New York University",
                "major": "Marketing",
                "graduationYear": "2028",
            },
            "goals": {
                "careerTrack": "brand marketing",
                "dreamCompanies": ["Nike", "Spotify", "L'Oreal"],
            },
            "hometown": "Chicago, IL",
        }
        resume_parsed_b = {
            "name": "Mia Thompson",
            "education": {
                "university": "New York University",
                "major": "Marketing",
                "graduation": "May 2028",
            },
            "experience": [],
            "extracurriculars": [
                {"activity": "NYU Marketing Society", "role": "Vice President"},
                {"activity": "NYU Admissions Ambassador"},
                {"activity": "Campus Tour Guide"},
            ],
            "skills": {"technical": ["Adobe Creative Suite", "Canva", "Google Analytics", "social media management"]},
            "career_interests": ["brand marketing", "consumer insights"],
        }
        contacts_b = [
            # 0: Dream company (Nike)
            {
                "FirstName": "Jordan", "LastName": "Hayes", "Company": "Nike",
                "Title": "Brand Marketing Manager", "City": "Portland, OR",
                "educationArray": [{"school": {"name": "University of Oregon"}, "majors": ["Marketing"], "degrees": ["Bachelor's"]}],
                "experience": [
                    {"company": {"name": "Nike"}, "title": {"name": "Brand Marketing Manager"}, "start_date": {"year": 2021, "month": 3}, "is_primary": True},
                    {"company": {"name": "Adidas"}, "title": {"name": "Marketing Coordinator"}, "start_date": {"year": 2018, "month": 7}, "end_date": {"year": 2021, "month": 2}},
                ],
            },
            # 1: Alumni (NYU)
            {
                "FirstName": "Sophia", "LastName": "Reed", "Company": "Spotify",
                "Title": "Consumer Insights Analyst", "City": "New York, NY",
                "educationArray": [{"school": {"name": "New York University"}, "majors": ["Psychology"], "degrees": ["Bachelor's"]}],
                "experience": [
                    {"company": {"name": "Spotify"}, "title": {"name": "Consumer Insights Analyst"}, "start_date": {"year": 2024, "month": 1}, "is_primary": True},
                    {"company": {"name": "Unilever"}, "title": {"name": "Marketing Intern"}, "start_date": {"year": 2023, "month": 6}, "end_date": {"year": 2023, "month": 8}},
                ],
            },
            # 2: Shared major (Marketing, different school) + recent transition
            {
                "FirstName": "Liam", "LastName": "Cooper", "Company": "L'Oreal",
                "Title": "Associate Brand Manager", "City": "New York, NY",
                "educationArray": [{"school": {"name": "Boston University"}, "majors": ["Marketing"], "degrees": ["Bachelor's"]}],
                "experience": [
                    {"company": {"name": "L'Oreal"}, "title": {"name": "Associate Brand Manager"}, "start_date": {"year": 2026, "month": 1}, "is_primary": True},
                    {"company": {"name": "Procter & Gamble"}, "title": {"name": "Brand Assistant"}, "start_date": {"year": 2023, "month": 7}, "end_date": {"year": 2025, "month": 12}},
                ],
            },
            # 3: Shared hometown (Chicago)
            {
                "FirstName": "Natalie", "LastName": "Cho", "Company": "Glossier",
                "Title": "Social Media Manager", "City": "Chicago, IL",
                "location": "Chicago, IL",
                "educationArray": [{"school": {"name": "Northwestern University"}, "majors": ["Communications"], "degrees": ["Bachelor's"]}],
                "experience": [
                    {"company": {"name": "Glossier"}, "title": {"name": "Social Media Manager"}, "start_date": {"year": 2024, "month": 5}, "is_primary": True},
                ],
            },
            # 4: Cold / general
            {
                "FirstName": "Ethan", "LastName": "Park", "Company": "Red Bull",
                "Title": "Events Marketing Coordinator", "City": "Los Angeles, CA",
                "educationArray": [{"school": {"name": "USC"}, "majors": ["Business"], "degrees": ["Bachelor's"]}],
                "experience": [
                    {"company": {"name": "Red Bull"}, "title": {"name": "Events Marketing Coordinator"}, "start_date": {"year": 2025, "month": 3}, "is_primary": True},
                    {"company": {"name": "Live Nation"}, "title": {"name": "Marketing Intern"}, "start_date": {"year": 2024, "month": 6}, "end_date": {"year": 2024, "month": 8}},
                ],
            },
        ]

        results = batch_generate_emails(
            contacts=contacts_b,
            resume_text="Mia Thompson\nMarketing, New York University\nNYU Marketing Society VP\nNYU Admissions Ambassador",
            user_profile=user_profile_b,
            career_interests="brand marketing",
            pre_parsed_user_info=resume_parsed_b,
            personal_note="",
            dream_companies=["Nike", "Spotify", "L'Oreal"],
        )

        self._print_batch("PROFILE B (Marketing/NYU)", results, contacts_b)
        self._assert_diversity(results, contacts_b)

    # --- Shared helpers ---

    def _print_batch(self, label, results, contacts):
        print("\n" + "=" * 80)
        print(f"P0 VERIFICATION: {label}")
        print("=" * 80)
        for idx in sorted(results.keys()):
            r = results[idx]
            c = contacts[idx] if idx < len(contacts) else {}
            meta = r.get("personalization", {})
            body = r.get("body", "")
            print(f"\n--- Contact {idx}: {c.get('FirstName', '?')} {c.get('LastName', '?')} "
                  f"({c.get('Title', '?')} at {c.get('Company', '?')}) ---")
            print(f"Lead type: {meta.get('lead_type', 'n/a')} | Warmth: {meta.get('warmth_tier_final', 'n/a')} | Label: {meta.get('label', 'n/a')}")
            print(f"Subject: {r.get('subject', '')}")
            print(f"Word count: {len(body.split())}")
            print(f"Body:\n{body}\n")

    def _assert_diversity(self, results, contacts):
        subjects = [results[i].get("subject", "") for i in sorted(results.keys())]
        unique_subjects = len(set(subjects))
        print(f"Unique subjects: {unique_subjects}/{len(subjects)}")
        assert unique_subjects >= 4, f"Only {unique_subjects} unique subjects in batch of 5"
        for idx in results:
            meta = results[idx].get("personalization", {})
            assert meta.get("lead_type"), f"Contact {idx} missing lead_type"
