"""
Unit tests for the deterministic student-job ranker.

Mocked profile + job dicts. Verifies weights, hard filters, and the
diversification re-ranker behave as designed.
"""
from datetime import datetime, timedelta, timezone

from app.services.student_job_ranker import (
    score, rank_for_student, diversify, HARD_FILTER,
)


def _student(**overrides):
    s = {
        "major": "Computer Science",
        "graduation_year": 2026,
        "skills": ["python", "rust", "distributed systems"],
        "target_industries": ["technology", "software"],
        "target_locations": ["san francisco", "new york"],
        "needs_visa_sponsorship": False,
        "accepts_remote": True,
        "work_arrangement_prefs": ["hybrid", "on-site"],
        "employment_pref": "INTERN",
    }
    s.update(overrides)
    return s


def _job(**overrides):
    j = {
        "job_id": "fantasticjobs_x",
        "title": "Software Engineer Intern",
        "company": "Stripe",
        "location": "San Francisco, California",
        "description_raw": "Build payment systems. " * 10,
        "posted_at": datetime.now(timezone.utc) - timedelta(days=2),
        "ai_experience_level": "0-2",
        "ai_employment_type": "INTERN",
        "ai_work_arrangement": "Hybrid",
        "ai_visa_sponsorship": True,
        "ai_has_salary": True,
        "salary_normalized_annual": 130000,
        "ai_key_skills": ["Python", "Distributed Systems"],
        "ai_keywords": ["rust", "go", "payments"],
        "ai_education_requirements": ["bachelor degree"],
        "ai_taxonomies_a": ["Software", "Technology"],
        "linkedin_org_industry": "Financial Services",
        "linkedin_org_employees": 8000,
    }
    j.update(overrides)
    return j


class TestRankerScoring:

    def test_ideal_match_scores_high(self):
        sc, reasons = score(_student(), _job())
        assert sc >= 60
        assert "entry_level_fit" in reasons
        assert "internship_match" in reasons
        assert "location_match" in reasons
        assert "strong_skill_overlap" in reasons

    def test_visa_mismatch_hard_filters(self):
        s = _student(needs_visa_sponsorship=True)
        j = _job(ai_visa_sponsorship=False)
        sc, reasons = score(s, j)
        assert sc == HARD_FILTER
        assert "visa_required_not_offered" in reasons

    def test_senior_title_hard_filters(self):
        sc, reasons = score(_student(), _job(title="Senior Software Engineer"))
        assert sc == HARD_FILTER
        assert "senior_misfit" in reasons

    def test_intern_with_senior_yoe_penalized(self):
        clean = score(_student(), _job())[0]
        bad = score(_student(), _job(
            description_raw="We need 5+ years of distributed systems experience. " * 5
        ))[0]
        assert bad < clean - 10

    def test_employment_pref_mismatch_penalized(self):
        s = _student(employment_pref="INTERN")
        match = score(s, _job(ai_employment_type="INTERN"))[0]
        mismatch = score(s, _job(ai_employment_type="FULL_TIME"))[0]
        assert mismatch < match - 15

    def test_grad_year_match_adds_bonus(self):
        base = score(_student(), _job(title="Software Engineer Intern"))[0]
        with_year = score(
            _student(graduation_year=2026),
            _job(title="Software Engineer Intern, Summer 2026"),
        )[0]
        assert with_year > base

    def test_stale_posting_loses_points(self):
        fresh = score(_student(), _job(posted_at=datetime.now(timezone.utc)))[0]
        stale = score(_student(), _job(
            posted_at=datetime.now(timezone.utc) - timedelta(days=45)
        ))[0]
        assert fresh > stale + 8

    def test_visa_sponsoring_job_gives_bonus_when_needed(self):
        s = _student(needs_visa_sponsorship=True)
        sc, reasons = score(s, _job(ai_visa_sponsorship=True))
        assert "sponsors_visa" in reasons
        assert sc > 0

    def test_postgrad_required_penalizes_undergrad(self):
        regular = score(_student(), _job())[0]
        postgrad = score(_student(), _job(
            ai_education_requirements=["postgraduate degree"]
        ))[0]
        assert postgrad < regular - 5


class TestDiversification:

    def _scored(self, items):
        return [(j, sc, []) for j, sc in items]

    def test_caps_one_company_dominating(self):
        # 5 jobs from Stripe scoring 90, 1 from each of 5 other cos scoring 80
        scored = self._scored([
            (_job(job_id=f"stripe_{i}", company="Stripe"), 90)
            for i in range(5)
        ] + [
            (_job(job_id=f"other_{i}", company=f"Co{i}"), 80)
            for i in range(5)
        ])
        top = diversify(scored, k=6)
        companies = [j[0]["company"] for j in top]
        assert companies.count("Stripe") < 5, "diversifier should cap Stripe in top 6"

    def test_returns_at_most_k(self):
        scored = self._scored([(_job(job_id=str(i)), 50.0) for i in range(100)])
        assert len(diversify(scored, k=10)) == 10

    def test_empty_input_returns_empty(self):
        assert diversify([], k=10) == []


class TestRankForStudent:

    def test_hard_filters_dropped_before_ranking(self):
        s = _student(needs_visa_sponsorship=True)
        jobs = [
            _job(job_id="ok", ai_visa_sponsorship=True),
            _job(job_id="reject", ai_visa_sponsorship=False),
        ]
        out = rank_for_student(s, jobs, top_k=10)
        ids = [j[0]["job_id"] for j in out]
        assert "ok" in ids
        assert "reject" not in ids

    def test_returns_top_k(self):
        jobs = [_job(job_id=str(i)) for i in range(50)]
        out = rank_for_student(_student(), jobs, top_k=10)
        assert len(out) == 10
