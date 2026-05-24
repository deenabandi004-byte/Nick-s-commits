"""
Tests for input validation
"""
import pytest
from app.utils.validation import (
    ContactSearchRequest,
    FirmSearchRequest,
    MeetingPrepRequest,
    validate_request
)
from app.utils.exceptions import ValidationError


class TestContactSearchValidation:
    """Test contact search request validation"""
    
    def test_valid_request(self):
        """Test valid contact search request"""
        data = {
            "jobTitle": "Software Engineer",
            "company": "Google",
            "location": "San Francisco, CA"
        }
        result = validate_request(ContactSearchRequest, data)
        assert result["jobTitle"] == "Software Engineer"
        assert result["company"] == "Google"
        assert result["location"] == "San Francisco, CA"
    
    def test_missing_required_field(self):
        """Test missing required field"""
        data = {
            "company": "Google",
            "location": "San Francisco, CA"
        }
        with pytest.raises(ValidationError):
            validate_request(ContactSearchRequest, data)
    
    def test_empty_string(self):
        """Test empty string validation"""
        data = {
            "jobTitle": "",
            "company": "Google",
            "location": "San Francisco, CA"
        }
        with pytest.raises(ValidationError):
            validate_request(ContactSearchRequest, data)
    
    def test_batch_size_validation(self):
        """Test batch size limits"""
        data = {
            "jobTitle": "Engineer",
            "company": "Google",
            "location": "SF",
            "batchSize": 15  # Exceeds max of 10
        }
        with pytest.raises(ValidationError):
            validate_request(ContactSearchRequest, data)


class TestFirmSearchValidation:
    """Test firm search request validation"""
    
    def test_valid_request(self):
        """Test valid firm search request"""
        data = {
            "query": "investment banks in New York"
        }
        result = validate_request(FirmSearchRequest, data)
        assert result["query"] == "investment banks in New York"
    
    def test_empty_query(self):
        """Test empty query"""
        data = {
            "query": ""
        }
        with pytest.raises(ValidationError):
            validate_request(FirmSearchRequest, data)


class TestMeetingPrepValidation:
    """Test meeting prep request validation"""
    
    def test_valid_linkedin_url(self):
        """Test valid LinkedIn URL"""
        data = {
            "linkedinUrl": "https://www.linkedin.com/in/johndoe"
        }
        result = validate_request(MeetingPrepRequest, data)
        assert "linkedin.com" in result["linkedinUrl"]
    
    def test_invalid_linkedin_url(self):
        """Test invalid LinkedIn URL"""
        data = {
            "linkedinUrl": "not-a-linkedin-url"
        }
        with pytest.raises(ValidationError):
            validate_request(MeetingPrepRequest, data)


