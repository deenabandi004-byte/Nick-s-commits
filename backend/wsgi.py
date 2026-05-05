import os
import logging
import threading
import time
from flask import Flask, send_from_directory, abort, request, redirect, make_response

# Configure logging BEFORE importing anything else that uses logging
from .app.logging_config import configure_logging
configure_logging()

# --- Import your API blueprints (use package-relative imports) ---
from .app.routes.health import health_bp
from .app.routes.gmail_oauth import gmail_oauth_bp
from .app.routes.emails import emails_bp
from .app.routes.contacts import contacts_bp
from .app.routes.runs import runs_bp
from .app.routes.enrichment import enrichment_bp
from .app.routes.resume import resume_bp
from .app.routes.coffee_chat_prep import coffee_chat_bp
from .app.routes.interview_prep import interview_prep_bp
from .app.routes.billing import billing_bp
from .app.routes.users import users_bp, company_contexts_bp
from .app.routes.outbox import outbox_bp
from .app.routes.scout import scout_bp
from .app.routes.firm_search import firm_search_bp
from .app.routes.dashboard import dashboard_bp
from .app.routes.timeline import timeline_bp
from .app.routes.search_history import search_history_bp
from .app.routes.prompt_search import prompt_search_bp
from .app.routes.parse_prompt import parse_prompt_bp
from .app.routes.contact_import import contact_import_bp
from .app.routes.job_board import job_board_bp
from .app.routes.scout_assistant import scout_assistant_bp
from .app.routes.linkedin_import import linkedin_import_bp
from .app.routes.resume_workshop import resume_workshop_bp
from .app.routes.resume_pdf_patch import resume_pdf_patch_bp
from .app.routes.cover_letter_workshop import cover_letter_workshop_bp
from .app.routes.auth_extension import auth_extension_bp
from .app.routes.email_template import email_template_bp
from .app.routes.admin import admin_bp
from .app.routes.gmail_webhook import gmail_webhook_bp
from .app.routes.nudges import nudges_bp
from .app.routes.queue import queue_bp
from .app.routes.jobs import jobs_bp
from .app.routes.extension_logs import extension_logs_bp
from .app.routes.events import events_bp
from .app.routes.gmail_pubsub import gmail_pubsub_bp
from .app.routes.alumni import alumni_bp, alumni_consent_bp
from .app.extensions import init_app_extensions

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

    # --- Prerender.io middleware for bot crawlers (SEO/AEO) ---
    PRERENDER_TOKEN = os.environ.get("PRERENDER_TOKEN")
    if not PRERENDER_TOKEN:
        app.logger.warning("PRERENDER_TOKEN not set — bot SSR via Prerender.io is disabled")
    else:
        app.logger.info(f"PRERENDER_TOKEN loaded: {PRERENDER_TOKEN[:6]}... ({len(PRERENDER_TOKEN)} chars)")
    BOT_AGENTS = [
        'googlebot', 'bingbot', 'yandex', 'duckduckbot', 'slurp',
        'baiduspider', 'facebookexternalhit', 'twitterbot', 'linkedinbot',
        'embedly', 'quora link preview', 'showyoubot', 'outbrain',
        'pinterest', 'developers.google.com/+/web/snippet', 'slackbot',
        'vkshare', 'w3c_validator', 'redditbot', 'applebot', 'whatsapp',
        'flipboard', 'tumblr', 'bitlybot', 'skypeuripreview', 'nuzzel',
        'discordbot', 'google page speed', 'qwantify', 'pinterestbot',
        'bitrix link preview', 'xing-contenttabreceiver', 'chrome-lighthouse',
        'telegrambot', 'gptbot', 'claudebot', 'anthropic-ai', 'perplexitybot',
        'ccbot', 'chatgpt-user', 'google-extended', 'bytespider'
    ]

    @app.before_request
    def prerender_middleware():
        user_agent = request.headers.get('User-Agent', '').lower()
        is_bot = any(bot in user_agent for bot in BOT_AGENTS)

        # Only prerender GET requests to non-API, non-asset routes
        if not is_bot or not PRERENDER_TOKEN:
            return None
        if request.method != 'GET':
            return None
        if request.path.startswith('/api/'):
            return None
        if request.path.startswith('/assets/'):
            return None
        if '.' in request.path.split('/')[-1]:  # skip files like .js .css .png
            return None

        import requests as req
        prerender_url = f"https://service.prerender.io/{request.url}"
        try:
            resp = req.get(
                prerender_url,
                headers={
                    'X-Prerender-Token': PRERENDER_TOKEN,
                    'User-Agent': request.headers.get('User-Agent', '')
                },
                timeout=10
            )
            if resp.status_code >= 500:
                app.logger.warning(f"Prerender returned {resp.status_code} for {request.url}, falling through to SPA")
                return None
            from flask import Response
            return Response(
                resp.content,
                status=resp.status_code,
                content_type=resp.headers.get('Content-Type', 'text/html')
            )
        except Exception as e:
            app.logger.warning(f"Prerender failed for {request.url}: {e}")
            return None  # Fall through to normal serving

    print("🚀 Initializing app extensions...")
    init_app_extensions(app)
    print("✅ App extensions initialized")
    
    # Initialize Sentry error tracking
    from app.utils.sentry_config import init_sentry
    init_sentry(app)
    
    # Initialize Swagger API documentation (only in development)
    if os.environ.get('FLASK_ENV') == 'development':
        from app.utils.swagger_config import init_swagger
        init_swagger(app)
    
    # Register error handlers
    from app.utils.exceptions import register_error_handlers
    register_error_handlers(app)
    print("✅ Error handlers registered")
    
    # Check if db was initialized
    from .app.extensions import db
    print(f"🔍 After init_app_extensions, db is: {db}")
    print(f"🔍 db type: {type(db)}")
    
    # --- Logging (handy on Render) ---
    app.logger.setLevel(logging.INFO)
    app.logger.info("STATIC FOLDER: %s", app.static_folder)
    app.logger.info("INDEX EXISTS? %s", os.path.exists(os.path.join(app.static_folder, "index.html")))

    # --- Register API blueprints FIRST ---
    app.register_blueprint(health_bp)
    app.register_blueprint(gmail_oauth_bp)
    
    # --- Backwards compatibility: Add old /api/gmail/* routes ---
    # These routes call the same handlers as /api/google/* routes
    from .app.extensions import require_firebase_auth
    from .app.routes.gmail_oauth import google_oauth_start, gmail_status
    
    @app.route('/api/gmail/oauth/start', methods=['GET', 'OPTIONS'])
    @require_firebase_auth
    def gmail_oauth_start_legacy():
        """Legacy route for /api/gmail/oauth/start - calls same handler as /api/google/oauth/start"""
        return google_oauth_start()
    
    @app.route('/api/gmail/status', methods=['GET', 'OPTIONS'])
    @require_firebase_auth
    def gmail_status_legacy():
        """Legacy route for /api/gmail/status - calls same handler as /api/google/gmail/status"""
        return gmail_status()
    
    app.register_blueprint(emails_bp)
    app.register_blueprint(linkedin_import_bp)  # Register before contacts_bp to avoid route conflicts
    app.register_blueprint(contacts_bp)
    app.register_blueprint(runs_bp)
    app.register_blueprint(enrichment_bp)
    app.register_blueprint(resume_bp)
    app.register_blueprint(coffee_chat_bp)
    app.register_blueprint(interview_prep_bp)
    app.register_blueprint(billing_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(company_contexts_bp)
    app.register_blueprint(outbox_bp)
    app.register_blueprint(scout_bp)
    app.register_blueprint(firm_search_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(timeline_bp)
    app.register_blueprint(search_history_bp)
    app.register_blueprint(prompt_search_bp)
    app.register_blueprint(parse_prompt_bp)
    app.register_blueprint(contact_import_bp)
    app.register_blueprint(job_board_bp)
    app.register_blueprint(scout_assistant_bp)
    app.register_blueprint(resume_workshop_bp)
    app.register_blueprint(resume_pdf_patch_bp)
    app.register_blueprint(cover_letter_workshop_bp)
    app.register_blueprint(auth_extension_bp)
    app.register_blueprint(email_template_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(gmail_webhook_bp)
    app.register_blueprint(nudges_bp)
    app.register_blueprint(queue_bp)
    app.register_blueprint(jobs_bp)
    app.register_blueprint(extension_logs_bp)
    # Phase 2 personalization data layer
    app.register_blueprint(events_bp)
    app.register_blueprint(gmail_pubsub_bp)
    # Phase 6 personalization data layer (alumni graph + consent)
    app.register_blueprint(alumni_bp)
    app.register_blueprint(alumni_consent_bp)

    # --- Debug route to check frontend build (dev only) ---
    @app.route('/api/debug/frontend')
    def debug_frontend():
        is_dev = (
            os.getenv("FLASK_ENV") == "development"
            or os.getenv("FLASK_DEBUG") == "1"
            or app.debug
        )
        if not is_dev:
            return {"error": "Not available in production"}, 404

        static_dir = app.static_folder
        exists = os.path.exists(static_dir)
        index_exists = os.path.exists(os.path.join(static_dir, 'index.html')) if exists else False

        return {
            'static_folder_exists': exists,
            'index_html_exists': index_exists,
            'file_count': len(os.listdir(static_dir)) if exists else 0,
        }

    # --- Serve built asset files (e.g., /assets/*) ---
    @app.route('/assets/<path:filename>')
    def vite_assets(filename):
        assets_dir = os.path.join(app.static_folder, 'assets')
        response = send_from_directory(assets_dir, filename)
        # Add caching headers for static assets (1 year cache)
        response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
        return response

    # --- Serve root index.html ---
    @app.route('/')
    def index():
        response = make_response(send_from_directory(app.static_folder, 'index.html'))
        response.headers['Cache-Control'] = 'public, max-age=0, s-maxage=3600, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response

    # --- Serve SEO/AEO root files explicitly ---
    @app.route('/sitemap.xml')
    def sitemap():
        return send_from_directory(app.static_folder, 'sitemap.xml', mimetype='application/xml')

    @app.route('/robots.txt')
    def robots():
        return send_from_directory(app.static_folder, 'robots.txt', mimetype='text/plain')

    @app.route('/llms.txt')
    def llms():
        return send_from_directory(app.static_folder, 'llms.txt', mimetype='text/plain')

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
            response = make_response(send_from_directory(app.static_folder, 'index.html'))
            response.headers['Cache-Control'] = 'public, max-age=0, s-maxage=3600, must-revalidate'
            response.headers['Pragma'] = 'no-cache'
            response.headers['Expires'] = '0'
            return response
        else:
            return "Frontend build not found", 500

    # Start tracker scanner background thread (every 6 hours).
    #
    # This single thread dispatches to multiple scanners per iteration. Each
    # scanner runs inside its own try/except so one scanner's failure does
    # NOT prevent the other from running in the same iteration.
    #
    # Contract: docs/designs/tracker-daemon-contract.md
    # Ownership: Flywheel owns the thread lifecycle. Each scanner is owned
    # by its feature team. Adding a third scanner requires updating the
    # contract doc and re-evaluating the cadence math.
    _tracker_logger = logging.getLogger("tracker_scanner")

    def _tracker_scanner_loop():
        _tracker_logger.info("Tracker scanner thread started (interval=6 hours)")
        SIX_HOURS = 6 * 3600
        # Initial delay: wait 5 minutes after boot to let app stabilize
        time.sleep(300)
        while True:
            # ---- Nudge scanner (Flywheel Phase 1) -----------------------
            # Isolated: a crash here MUST NOT block other scanners below.
            if os.getenv("NUDGES_ENABLED", "true").lower() == "true":
                try:
                    with app.app_context():
                        from .app.services.nudge_service import scan_and_generate_nudges
                        scan_and_generate_nudges()
                except Exception:
                    logging.getLogger("nudge_scanner").exception(
                        "Nudge scanner iteration failed"
                    )
            else:
                _tracker_logger.info("Nudge scanner disabled via NUDGES_ENABLED=false")

            # ---- Queue scanner (Agentic Queue Phase 2) ------------------
            # Intentionally left as a placeholder. The queue scanner will be
            # wired here by the queue team following the isolation pattern
            # above. See docs/designs/tracker-daemon-contract.md.
            # Kill switch: QUEUE_SCANNER_ENABLED (default "true")

            time.sleep(SIX_HOURS)

    tracker_thread = threading.Thread(target=_tracker_scanner_loop, daemon=True)
    tracker_thread.start()
    _tracker_logger.info("Tracker scanner thread registered (first run in ~5 minutes)")

    # Start Gmail watch renewal background thread (every 6 days)
    _watch_logger = logging.getLogger("watch_renewal")

    def _watch_renewal_loop():
        _watch_logger.info("Gmail watch renewal thread started (interval=6 days)")
        SIX_DAYS = 6 * 24 * 3600
        while True:
            time.sleep(SIX_DAYS)
            try:
                with app.app_context():
                    from .app.routes.admin import renew_watches as _renew_endpoint
                    # Call the core logic directly, not the HTTP handler
                    from .app.extensions import get_db
                    from .app.services.gmail_client import renew_gmail_watch
                    db = get_db()
                    now_ms = int(time.time() * 1000)
                    one_day_ms = 86400 * 1000
                    renewed = 0
                    failed = 0
                    for user_doc in db.collection("users").stream():
                        uid = user_doc.id
                        gmail_ref = db.collection("users").document(uid).collection("integrations").document("gmail")
                        gmail_doc = gmail_ref.get()
                        if not gmail_doc.exists:
                            continue
                        data = gmail_doc.to_dict() or {}
                        if not (data.get("token") or data.get("refresh_token")):
                            continue
                        watch_exp = data.get("watchExpiration")
                        if watch_exp is not None:
                            try:
                                watch_exp = int(watch_exp)
                            except (TypeError, ValueError):
                                watch_exp = None
                        if watch_exp is not None and (watch_exp - now_ms) >= one_day_ms:
                            continue
                        try:
                            renew_gmail_watch(uid)
                            renewed += 1
                        except Exception as e:
                            failed += 1
                            _watch_logger.error("Watch renewal failed uid=%s: %s", uid, e)
                    _watch_logger.info("Watch renewal complete: renewed=%d failed=%d", renewed, failed)
            except Exception as e:
                _watch_logger.error("Watch renewal loop error: %s", e)

    t = threading.Thread(target=_watch_renewal_loop, daemon=True)
    t.start()
    _watch_logger.info("Gmail watch renewal thread registered (first run in 6 days)")

    # ---- Daemon healthcheck watchdog (every 1 hour) ----------------------
    #
    # Reads health docs from Firestore for each daemon scanner (nudge, queue,
    # gmail_watch) and logs warnings when lastSuccessAt is stale.
    #
    # Contract: docs/designs/tracker-daemon-contract.md
    # TODOS.md P1: "Daemon Thread Healthcheck & Auto-Restart"
    _watchdog_logger = logging.getLogger("daemon_watchdog")

    # Staleness thresholds in seconds.
    # Nudge: 8h (2h slack on 6h cadence)
    # Queue: 7d (slightly over one-week Tuesday cadence)
    # Aggregation: 8d (slightly over one-week Sunday cadence)
    # Gmail watch: 7d (6-day renewal cadence + 1d slack)
    _STALENESS = {
        "nudge_scanner": 8 * 3600,
        "queue_scanner": 7 * 24 * 3600,
        "aggregation_scanner": 8 * 24 * 3600,
        "gmail_watch": 7 * 24 * 3600,
    }

    def _watchdog_loop():
        ONE_HOUR = 3600
        _watchdog_logger.info("Daemon watchdog started (interval=1 hour)")
        # Wait 10 minutes to give scanners time to do their first run.
        time.sleep(600)
        while True:
            try:
                with app.app_context():
                    from .app.extensions import get_db
                    from datetime import datetime, timezone
                    db = get_db()
                    now = datetime.now(timezone.utc)
                    stale_scanners = []

                    for scanner_name, threshold_seconds in _STALENESS.items():
                        try:
                            doc = db.collection("system").document(scanner_name).get()
                            if not doc.exists:
                                # Scanner hasn't run yet — only warn if it
                                # should have had enough time (> threshold).
                                _watchdog_logger.debug(
                                    "No health doc for %s (may not have run yet)",
                                    scanner_name,
                                )
                                continue

                            data = doc.to_dict() or {}
                            last_success = data.get("lastSuccessAt")
                            if not last_success:
                                continue

                            # Parse ISO timestamp
                            if isinstance(last_success, str):
                                last_success = datetime.fromisoformat(
                                    last_success.replace("Z", "+00:00")
                                )

                            age_seconds = (now - last_success).total_seconds()
                            if age_seconds > threshold_seconds:
                                stale_scanners.append(scanner_name)
                                _watchdog_logger.warning(
                                    "STALE: %s last succeeded %.1f hours ago "
                                    "(threshold: %.1f hours)",
                                    scanner_name,
                                    age_seconds / 3600,
                                    threshold_seconds / 3600,
                                )
                        except Exception:
                            _watchdog_logger.exception(
                                "Error checking health for %s", scanner_name
                            )

                    if not stale_scanners:
                        _watchdog_logger.info("All daemons healthy")
                    else:
                        # Write a watchdog status doc so external monitors
                        # (Render health checks, future alerting) can read it.
                        try:
                            db.collection("system").document("watchdog").set({
                                "lastCheckAt": now.isoformat().replace("+00:00", "Z"),
                                "staleScanners": stale_scanners,
                                "healthy": len(stale_scanners) == 0,
                            })
                        except Exception:
                            _watchdog_logger.exception("Failed to write watchdog status")

            except Exception:
                _watchdog_logger.exception("Watchdog loop error")

            time.sleep(ONE_HOUR)

    if os.getenv("WATCHDOG_ENABLED", "true").lower() == "true":
        watchdog_thread = threading.Thread(target=_watchdog_loop, daemon=True)
        watchdog_thread.start()
        _watchdog_logger.info("Daemon watchdog registered (first check in ~10 minutes)")
    else:
        _watchdog_logger.info("Daemon watchdog disabled via WATCHDOG_ENABLED=false")

    return app

# Gunicorn entrypoint
app = create_app()

# Optional: list all registered routes when LIST_ROUTES=1 (e.g. LIST_ROUTES=1 python wsgi.py)
if os.environ.get("LIST_ROUTES"):
    print("--- Registered routes ---")
    for rule in app.url_map.iter_rules():
        print(f"{rule.endpoint}: {rule.methods} {rule.rule}")
    print("--- End routes ---")