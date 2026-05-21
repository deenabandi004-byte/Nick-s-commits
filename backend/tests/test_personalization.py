"""Tests for personalization engine"""

import pytest
from app.services.interview_prep.personalization import PersonalizationEngine, personalize_prep


class TestPersonalizationEngine:
    
    @pytest.fixture
    def engine(self):
        return PersonalizationEngine()
    
    @pytest.fixture
    def sample_job_details(self):
        return {
            "company_name": "Google",
            "job_title": "Software Engineer",
            "level": "Entry Level",
            "role_category": "Software Engineering",
            "required_skills": ["Python", "JavaScript", "React"]
        }
    
    @pytest.fixture
    def sample_user_context_with_resume(self):
        return {
            "resume_data": {
                "experience": [
                    {
                        "title": "Software Engineer Intern",
                        "company": "Tech Corp",
                        "description": "Built web applications using Python and React"
                    }
                ],
                "skills": ["Python", "JavaScript", "React", "Node.js"],
                "education": {
                    "school": "USC",
                    "degree": "BS Computer Science"
                }
            },
            "profile": {
                "school": "USC",
                "major": "Computer Science",
                "graduation_year": "2025"
            },
            "history": [],
            "meetings": []
        }
    
    @pytest.fixture
    def sample_user_context_no_resume(self):
        return {
            "resume_data": None,
            "profile": {
                "school": "USC",
                "major": "Computer Science"
            },
            "history": [],
            "meetings": []
        }
    
    def test_generate_fit_analysis_with_resume(self, engine, sample_user_context_with_resume, sample_job_details):
        """Test fit analysis generation with resume"""
        fit = engine.generate_fit_analysis(sample_user_context_with_resume, sample_job_details)
        
        assert isinstance(fit, dict)
        assert "fit_score" in fit
        assert "strengths" in fit
        assert "gaps" in fit
        assert "recommendations" in fit
        assert "personalized" in fit
    
    def test_generate_fit_analysis_no_resume(self, engine, sample_user_context_no_resume, sample_job_details):
        """Test fit analysis generation without resume"""
        fit = engine.generate_fit_analysis(sample_user_context_no_resume, sample_job_details)
        
        assert fit["personalized"] is False
        assert fit["fit_score"] is None
        assert len(fit["recommendations"]) > 0
        assert "Upload your resume" in fit["recommendations"][0]
    
    def test_generate_story_bank_with_resume(self, engine, sample_user_context_with_resume, sample_job_details):
        """Test story bank generation with resume"""
        questions = {
            "behavioral": [
                {"question": "Tell me about a challenge", "frequency": 5}
            ]
        }
        
        stories = engine.generate_story_bank(sample_user_context_with_resume, sample_job_details, questions)
        
        # May be empty if OpenAI not available, but should be a list
        assert isinstance(stories, list)
    
    def test_generate_story_bank_no_resume(self, engine, sample_user_context_no_resume, sample_job_details):
        """Test story bank generation without resume"""
        questions = {
            "behavioral": [
                {"question": "Tell me about a challenge", "frequency": 5}
            ]
        }
        
        stories = engine.generate_story_bank(sample_user_context_no_resume, sample_job_details, questions)
        
        assert stories == []
    
    def test_generate_prep_plan_software_engineering(self, engine, sample_user_context_with_resume, sample_job_details):
        """Test prep plan generation for software engineering"""
        fit_analysis = {
            "gaps": ["system design", "coding"],
            "strengths": ["Python experience"]
        }
        
        plan = engine.generate_personalized_prep_plan(sample_user_context_with_resume, sample_job_details, fit_analysis)
        
        assert plan["total_weeks"] == 4
        assert len(plan["weeks"]) == 4
        assert "focus_areas" in plan
        assert "personalized_notes" in plan
        assert plan["weeks"][0]["title"] == "Foundations"
        assert "LeetCode" in plan["weeks"][0]["tasks"][0]
    
    def test_generate_prep_plan_consulting(self, engine, sample_user_context_with_resume):
        """Test prep plan generation for consulting"""
        job_details = {
            "company_name": "McKinsey",
            "job_title": "Business Analyst",
            "role_category": "Consulting"
        }
        fit_analysis = {
            "gaps": [],
            "strengths": []
        }
        
        plan = engine.generate_personalized_prep_plan(sample_user_context_with_resume, job_details, fit_analysis)
        
        assert plan["total_weeks"] == 4
        assert plan["weeks"][0]["title"] == "Case Frameworks"
        assert "Case in Point" in plan["weeks"][0]["tasks"][1]
    
    def test_generate_prep_plan_with_gaps(self, engine, sample_user_context_with_resume, sample_job_details):
        """Test prep plan with specific gaps"""
        fit_analysis = {
            "gaps": ["system design experience", "coding algorithms"],
            "strengths": ["Strong Python background"]
        }
        
        plan = engine.generate_personalized_prep_plan(sample_user_context_with_resume, sample_job_details, fit_analysis)
        
        assert "system_design" in plan["focus_areas"]
        assert "coding" in plan["focus_areas"]
        assert len(plan["personalized_notes"]) > 0
    
    @pytest.mark.asyncio
    @pytest.mark.skip(reason="Requires Firestore database access")
    async def test_get_user_context(self, engine):
        """Test fetching user context from database"""
        # Would need actual database connection
        # context = await engine.get_user_context("test_user_id", db)
        # assert "resume_data" in context
        # assert "profile" in context
        pass
    
    @pytest.mark.asyncio
    @pytest.mark.skip(reason="Requires Firestore database and OpenAI API")
    async def test_personalize_prep_full(self, sample_job_details):
        """Full integration test for personalization"""
        # Would need actual database connection
        # questions = {"behavioral": []}
        # result = await personalize_prep("test_user_id", sample_job_details, questions, db)
        # assert "fit_analysis" in result
        # assert "story_bank" in result
        # assert "prep_plan" in result
        pass

