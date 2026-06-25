"""
Unit tests for the Firestore profile → student_job_ranker shape mapper.
Pure-function, no Firestore access.
"""
from app.utils.student_profile import build_student_dict


class TestStudentProfileMapper:

    def test_extracts_from_new_profile_shape(self):
        profile = {
            "professionalInfo": {
                "major": "Computer Science",
                "graduationYear": "2027",
                "targetIndustries": ["Technology", "Software"],
                "sponsorshipNeeded": True,
            },
            "location": {
                "preferredLocation": ["San Francisco", "New York"],
                "jobTypes": ["Internship"],
                "workArrangement": ["Hybrid", "Remote"],
            },
            "academics": {
                "graduationYear": 2027,
                "university": "USC",
                "degree": "Bachelor's in CS",
            },
            "resumeParsed": {
                "education": {"major": "Computer Science"},
                "skills": {
                    "programming_languages": ["Python", "Go"],
                    "tools_frameworks": ["React"],
                    "core_skills": ["Distributed Systems"],
                },
            },
        }
        student = build_student_dict(profile)
        assert student["major"] == "Computer Science"
        assert student["graduation_year"] == 2027
        assert "python" in student["skills"]
        assert "react" in student["skills"]
        assert "distributed systems" in student["skills"]
        assert student["target_industries"] == ["technology", "software"]
        assert "san francisco" in student["target_locations"]
        assert student["employment_pref"] == "INTERN"
        assert student["accepts_remote"] is True
        assert "hybrid" in student["work_arrangement_prefs"]
        assert student["needs_visa_sponsorship"] is True
        assert student["is_grad_student"] is False

    def test_legacy_top_level_fields_fallback(self):
        profile = {
            "major": "Finance",
            "graduationYear": "Class of 2026",
            "targetIndustries": ["Investment Banking"],
            "preferredLocations": ["New York"],
            "jobTypes": ["Internship", "Full-time"],
            "skills": ["Excel", "PowerPoint", "DCF"],
        }
        student = build_student_dict(profile)
        assert student["major"] == "Finance"
        assert student["graduation_year"] == 2026
        assert student["target_industries"] == ["investment banking"]
        assert student["target_locations"] == ["new york"]
        assert student["employment_pref"] == "BOTH"
        assert "dcf" in student["skills"]

    def test_employment_pref_inference(self):
        assert build_student_dict({"jobTypes": ["Internship"]})["employment_pref"] == "INTERN"
        assert build_student_dict({"jobTypes": ["Full-time", "New Grad"]})["employment_pref"] == "FULLTIME"
        assert build_student_dict({"jobTypes": ["Internship", "Full-time"]})["employment_pref"] == "BOTH"
        assert build_student_dict({"jobTypes": []})["employment_pref"] == "BOTH"

    def test_grad_student_flag(self):
        assert build_student_dict({
            "academics": {"degree": "Master's in Data Science"},
        })["is_grad_student"] is True
        assert build_student_dict({
            "academics": {"degree": "Bachelor's"},
        })["is_grad_student"] is False
        assert build_student_dict({
            "professionalInfo": {"degree": "PhD"},
        })["is_grad_student"] is True

    def test_flat_skills_list(self):
        profile = {"resumeParsed": {"skills": ["Python", "Rust", "Go"]}}
        out = build_student_dict(profile)
        assert "python" in out["skills"]
        assert "rust" in out["skills"]

    def test_empty_profile_returns_safe_defaults(self):
        out = build_student_dict({})
        assert out["major"] is None
        assert out["graduation_year"] is None
        assert out["skills"] == []
        assert out["target_industries"] == []
        assert out["target_locations"] == []
        assert out["employment_pref"] == "BOTH"
        assert out["needs_visa_sponsorship"] is False
        assert out["is_grad_student"] is False

    def test_remote_inferred_from_jobtypes(self):
        out = build_student_dict({"location": {"jobTypes": ["Remote"]}})
        assert out["accepts_remote"] is True
