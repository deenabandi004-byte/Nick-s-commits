"""
Pytest configuration and fixtures
"""
import pytest
import os
from unittest.mock import Mock, patch

# Set test environment
os.environ['FLASK_ENV'] = 'testing'
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = 'test-credentials.json'
# Industry expansion tests assume the flag is on (they're testing the gate
# logic itself, not whether the flag is set). Must be in place BEFORE
# app.config is first imported by any test module — config reads env at
# module-load and the value is locked thereafter.
os.environ.setdefault('ENABLE_INDUSTRY_EXPANSION', 'true')


@pytest.fixture
def mock_firebase_user():
    """Mock Firebase user"""
    return {
        'uid': 'test-user-id',
        'email': 'test@example.com',
        'name': 'Test User'
    }


@pytest.fixture
def mock_db():
    """Mock Firestore database"""
    return Mock()


@pytest.fixture
def app():
    """Create Flask app for testing"""
    from backend.wsgi import create_app
    app = create_app()
    app.config['TESTING'] = True
    return app


@pytest.fixture
def client(app):
    """Create test client"""
    return app.test_client()


@pytest.fixture
def authenticated_request(mock_firebase_user):
    """Mock authenticated request"""
    with patch('app.extensions.require_firebase_auth') as mock_auth:
        def mock_decorator(fn):
            def wrapper(*args, **kwargs):
                # Mock request.firebase_user
                from flask import request
                request.firebase_user = mock_firebase_user
                return fn(*args, **kwargs)
            return wrapper
        mock_auth.side_effect = mock_decorator
        yield mock_auth
