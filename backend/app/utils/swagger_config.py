"""
Swagger/OpenAPI documentation configuration
"""
def init_swagger(app):
    """
    Initialize Swagger API documentation.
    Access at /apidocs when running.
    Gracefully handles missing flasgger package.
    """
    try:
        from flasgger import Swagger
    except ImportError:
        print("⚠️ flasgger not installed. Install with: pip install flasgger")
        print("⚠️ API documentation disabled. Continuing without Swagger.")
        return
    
    swagger_config = {
        "headers": [],
        "specs": [
            {
                "endpoint": "apispec",
                "route": "/apispec.json",
                "rule_filter": lambda rule: True,
                "model_filter": lambda tag: True,
            }
        ],
        "static_url_path": "/flasgger_static",
        "swagger_ui": True,
        "specs_route": "/apidocs"
    }
    
    swagger_template = {
        "swagger": "2.0",
        "info": {
            "title": "Offerloop API",
            "description": "API documentation for Offerloop platform",
            "version": "1.0.0",
            "contact": {
                "name": "Offerloop Support",
                "email": "support@offerloop.ai"
            }
        },
        "basePath": "/api",
        "schemes": ["http", "https"],
        "securityDefinitions": {
            "Bearer": {
                "type": "apiKey",
                "name": "Authorization",
                "in": "header",
                "description": "Firebase ID token in format: Bearer {token}"
            }
        },
        "security": [
            {
                "Bearer": []
            }
        ],
        "tags": [
            {
                "name": "Contacts",
                "description": "Contact management endpoints"
            },
            {
                "name": "Search",
                "description": "Contact and firm search endpoints"
            },
            {
                "name": "Prep",
                "description": "Meeting and interview prep endpoints"
            },
            {
                "name": "Billing",
                "description": "Billing and credits endpoints"
            }
        ]
    }
    
    try:
        Swagger(app, config=swagger_config, template=swagger_template)
        print("✅ Swagger API documentation initialized at /apidocs")
    except Exception as e:
        print(f"⚠️ Failed to initialize Swagger: {e}")
        print("⚠️ Continuing without API documentation.")
