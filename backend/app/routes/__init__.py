"""
Routes package - all API route blueprints
"""
from app.routes.health import health_bp
from app.routes.spa import spa_bp
from app.routes.gmail_oauth import gmail_oauth_bp
from app.routes.emails import emails_bp
from app.routes.contacts import contacts_bp
from app.routes.runs import runs_bp
from app.routes.enrichment import enrichment_bp
from app.routes.resume import resume_bp
from app.routes.meeting_prep import meeting_bp
from app.routes.interview_prep import interview_prep_bp
from app.routes.billing import billing_bp
from app.routes.users import users_bp
from app.routes.firm_search import firm_search_bp
from app.routes.dashboard import dashboard_bp
from app.routes.timeline import timeline_bp
from app.routes.linkedin_import import linkedin_import_bp
from app.routes.resume_workshop import resume_workshop_bp
from app.routes.cover_letter_workshop import cover_letter_workshop_bp

__all__ = [
    'health_bp',
    'spa_bp',
    'gmail_oauth_bp',
    'emails_bp',
    'contacts_bp',
    'runs_bp',
    'enrichment_bp',
    'resume_bp',
    'meeting_bp',
    'interview_prep_bp',
    'billing_bp',
    'users_bp',
    'firm_search_bp',
    'dashboard_bp',
    'timeline_bp',
    'linkedin_import_bp',
    'resume_workshop_bp',
    'cover_letter_workshop_bp'
]

