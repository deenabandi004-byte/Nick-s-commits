from flask import Flask

def create_app():
    app = Flask(__name__, static_folder="../../connect-grow-hire/dist", static_url_path="")
    
    # ✅ Initialize extensions (includes Firebase and CORS)
    from .extensions import init_app_extensions
    init_app_extensions(app)
    
    # Register blueprints
    from .routes.health import bp as health_bp
    from .routes.spa import bp as spa_bp
    from .routes.outbox import outbox_bp
    from .routes.timeline import timeline_bp
    
    app.register_blueprint(health_bp)
    app.register_blueprint(outbox_bp)
    app.register_blueprint(timeline_bp)
    app.register_blueprint(spa_bp)  # Register SPA last (catch-all)

    @app.after_request
    def add_cors_headers(resp):
        resp.headers.setdefault("Access-Control-Allow-Credentials", "true")
        return resp

    return app