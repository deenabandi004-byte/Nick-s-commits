import os
import logging
from flask import Flask, send_from_directory, abort, request, redirect

# --- Import your API blueprints (use absolute imports) ---
from app.routes.health import health_bp
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
from app.routes.outbox import outbox_bp
from app.routes.firm_search import firm_search_bp
from app.extensions import init_app_extensions

def create_app() -> Flask:
    # Project layout assumptions:
    REPO_ROOT = os.path.dirname(os.path.dirname(__file__))
    FRONTEND_DIR = os.path.join(REPO_ROOT, "connect-grow-hire")
    STATIC_DIR = os.path.join(FRONTEND_DIR, "dist")

    app = Flask(
        __name__,
        static_folder=STATIC_DIR,
        static_url_path=""
    )
    
    print("🚀 Initializing app extensions...")
    init_app_extensions(app)
    print("✅ App extensions initialized")
    
    # Check if db was initialized
    from app.extensions import db
    print(f"🔍 After init_app_extensions, db is: {db}")
    print(f"🔍 db type: {type(db)}")
    
    # --- Logging (handy on Render) ---
    app.logger.setLevel(logging.INFO)
    app.logger.info("STATIC FOLDER: %s", app.static_folder)
    app.logger.info("INDEX EXISTS? %s", os.path.exists(os.path.join(app.static_folder, "index.html")))

    # --- Register API blueprints FIRST ---
    app.register_blueprint(health_bp)
    app.register_blueprint(gmail_oauth_bp)
    app.register_blueprint(emails_bp)
    app.register_blueprint(contacts_bp)
    app.register_blueprint(directory_bp)
    app.register_blueprint(runs_bp)
    app.register_blueprint(enrichment_bp)
    app.register_blueprint(resume_bp)
    app.register_blueprint(coffee_chat_bp)
    app.register_blueprint(billing_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(outbox_bp)
    app.register_blueprint(firm_search_bp)

    # --- Debug route to check frontend build ---
    @app.route('/api/debug/frontend')
    def debug_frontend():
        static_dir = app.static_folder
        exists = os.path.exists(static_dir)
        index_exists = os.path.exists(os.path.join(static_dir, 'index.html')) if exists else False
        
        return {
            'static_folder': static_dir,
            'static_folder_exists': exists,
            'index_html_exists': index_exists,
            'files_in_static': os.listdir(static_dir)[:20] if exists else [],
            'repo_root': os.path.dirname(os.path.dirname(__file__))
        }

    # --- Redirect apex → www (optional but recommended) ---
    @app.before_request
    def force_www():
        host = request.headers.get("Host", "")
        if host == "offerloop.ai":
            return redirect("https://www.offerloop.ai" + request.full_path, code=301)

    # --- Serve built asset files (e.g., /assets/*) ---
    @app.route('/assets/<path:filename>')
    def vite_assets(filename):
        assets_dir = os.path.join(app.static_folder, 'assets')
        return send_from_directory(assets_dir, filename)

    # --- Serve root index.html ---
    @app.route('/')
    def index():
        return send_from_directory(app.static_folder, 'index.html')

    # --- 404 handler for SPA (catches all unmatched routes) ---
    @app.errorhandler(404)
    def not_found(e):
        # Don't serve index.html for API routes that don't exist
        if request.path.startswith('/api/'):
            return "API endpoint not found", 404
        
        # For everything else, serve the React app
        index_path = os.path.join(app.static_folder, 'index.html')
        if os.path.exists(index_path):
            app.logger.info(f"404 handler serving index.html for path: {request.path}")
            return send_from_directory(app.static_folder, 'index.html')
        else:
            return "Frontend build not found", 500

    return app

# Gunicorn entrypoint
app = create_app()