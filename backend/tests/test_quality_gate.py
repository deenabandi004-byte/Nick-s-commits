"""
Unit tests for the pipeline quality gate.

Pure-function tests over normalized job dicts. No live API calls and no
Firestore dependency.
"""
from datetime import datetime, timedelta, timezone

from pipeline.quality_gate import evaluate, apply


def _base_job(**overrides):
    job = {
        "job_id": "fantasticjobs_1",
        "source": "fantasticjobs",
        "title": "Software Engineer Intern",
        "company": "Stripe",
        "description_raw": "Build payment systems. Pursuing a Bachelor's in CS. " * 5,
        "posted_at": datetime.now(timezone.utc) - timedelta(days=2),
        "type": "INTERNSHIP",
        "ai_employment_type": "INTERN",
    }
    job.update(overrides)
    return job


class TestQualityGate:

    def test_clean_intern_kept(self):
        ok, reason = evaluate(_base_job())
        assert ok and reason is None

    def test_recruitment_agency_dropped(self):
        ok, reason = evaluate(_base_job(linkedin_org_recruitment_agency=True))
        assert not ok and reason == "linkedin_recruitment_agency"

    def test_staffing_company_name_dropped(self):
        ok, reason = evaluate(_base_job(company="Insight Global Staffing"))
        assert not ok and reason == "staffing_company_name"

    def test_scam_in_description_dropped(self):
        ok, reason = evaluate(_base_job(
            description_raw="Earn up to $5000/week! 100% commission. Hiring immediately!!! " * 5
        ))
        assert not ok and reason == "scam_pattern"

    def test_senior_title_dropped(self):
        ok, reason = evaluate(_base_job(title="Senior Software Engineer"))
        assert not ok and reason == "senior_title"

    def test_senior_title_with_intern_override_kept(self):
        ok, _ = evaluate(_base_job(title="Senior Engineer Intern Program"))
        # "Intern" in title overrides Senior — rare but exists
        assert ok

    def test_intern_with_5_years_yoe_dropped(self):
        ok, reason = evaluate(_base_job(
            description_raw="We need 5+ years of experience in distributed systems. " * 5
        ))
        assert not ok and reason == "intern_yoe_inconsistent"

    def test_too_short_description_dropped(self):
        ok, reason = evaluate(_base_job(description_raw="apply now"))
        assert not ok and reason == "description_too_short"

    def test_simplify_short_description_kept(self):
        # Simplify intentionally stores empty descriptions; gate exempts that source
        ok, _ = evaluate(_base_job(source="simplify", description_raw=""))
        assert ok

    def test_stale_posting_dropped(self):
        old = datetime.now(timezone.utc) - timedelta(days=90)
        ok, reason = evaluate(_base_job(posted_at=old))
        assert not ok and reason == "too_old"

    def test_apply_returns_breakdown(self):
        jobs = [
            _base_job(job_id="a"),
            _base_job(job_id="b", title="Senior Director"),
            _base_job(job_id="c", company="Robert Half Staffing"),
        ]
        kept, drops = apply(jobs)
        assert len(kept) == 1
        assert kept[0]["job_id"] == "a"
        assert drops.get("senior_title") == 1
        assert drops.get("staffing_company_name") == 1
