"""
Routes package - all API route blueprints
"""
from app.routes.health import health_bp
from app.routes.spa import spa_bp
from app.routes.gmail_oauth import gmail_oauth_bp
from app.routes.emails import emails_bp
from app.routes.contacts import contacts_bp
from app.routes.directory import directory_bp
from app.routes.runs import runs_bp
from app.routes.enrichment import enrichment_bp
from app.routes.resume import resume_bp
from app.routes.coffee_chat_prep import coffee_chat_bp
from app.routes.billing import billing_bp
from app.routes.users import users_bp
from app.routes.firm_search import firm_search_bp

__all__ = [
    'health_bp',
    'spa_bp',
    'gmail_oauth_bp',
    'emails_bp',
    'contacts_bp',
    'directory_bp',
    'runs_bp',
    'enrichment_bp',
    'resume_bp',
    'coffee_chat_bp',
    'billing_bp',
    'users_bp',
    'firm_search_bp',
    'outbox_bp' 
]

