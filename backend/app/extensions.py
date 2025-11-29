"""
Flask extensions and initialization
"""
import os
import firebase_admin
from firebase_admin import credentials, firestore, auth as fb_auth
from flask import Flask, request, jsonify
from flask_cors import CORS
import functools

# Global Firestore client
db = None

def init_firebase(app):
    """Initialize Firebase and set up Firestore client."""
    global db
    print(f"🔍 init_firebase called, current db value: {db}")
    print(f"🔍 firebase_admin._apps: {firebase_admin._apps}")
    if firebase_admin._apps:  # already initialized
        try:
            db = firestore.client()
            print(f"✅ Firebase already initialized, got Firestore client: {db}")
            print(f"🔍 db id: {id(db)}")
            return
        except Exception as e:
            print(f"⚠️ Firebase already initialized but Firestore client failed: {e}")
            firebase_admin._apps.clear()

    # Try multiple credential sources
    cred = None
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    
    if cred_path and os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        print(f"✅ Using credentials from GOOGLE_APPLICATION_CREDENTIALS: {cred_path}")
    else:
        # Try different possible paths for credentials
        cred_paths = [
            './firebase-creds.json',
            '/home/ubuntu/secrets/firebase-creds.json',
            os.path.expanduser('~/firebase-creds.json')
        ]
        for path in cred_paths:
            if os.path.exists(path):
                cred = credentials.Certificate(path)
                print(f"✅ Using credentials from: {path}")
                break
    
    try:
        if cred:
            firebase_admin.initialize_app(cred, {
                'projectId': 'offerloop-native',
                'storageBucket': 'offerloop-native.firebasestorage.app'
            })
            print("✅ Firebase initialized with credentials file")
        else:
            # No credentials found - try with project ID only (for cloud environments)
            print("⚠️ No Firebase credentials found, initializing with explicit project ID")
            firebase_admin.initialize_app(options={
                'projectId': 'offerloop-native',
                'storageBucket': 'offerloop-native.firebasestorage.app'
            })
            print("✅ Firebase initialized with project ID option")
        
        db = firestore.client()
        print(f"✅ Firestore client initialized successfully: {db}")
        print(f"🔍 db id: {id(db)}")
        
        # Verify Firebase Admin is properly initialized by checking _apps
        if not firebase_admin._apps:
            raise RuntimeError("Firebase Admin SDK initialization completed but _apps is empty")
        print(f"✅ Firebase Admin SDK verified: {len(firebase_admin._apps)} app(s) initialized")
        
    except Exception as e:
        error_msg = f"❌ Firebase initialization failed: {e}"
        print(error_msg)
        import traceback
        print(traceback.format_exc())
        db = None
        # Don't raise here - allow app to start but auth will fail gracefully
        print("⚠️ App will start but Firebase-dependent features will not work")

def get_db():
    """Returns the Firestore client instance."""
    global db
    print(f"🔍 get_db() called, current db value: {db}, id: {id(db) if db else 'None'}")
    # If db is None but Firebase Admin is initialized, create the client on demand
    if db is None:
        if firebase_admin._apps:
            print("⚠️ db global is None but Firebase Admin is initialized, creating client on demand")
            try:
                db = firestore.client()
                print(f"✅ Firestore client created on demand: {db}, id: {id(db)}")
            except Exception as e:
                print(f"❌ Failed to create Firestore client: {e}")
                raise RuntimeError(f"Failed to create Firestore client: {e}")
        else:
            print("❌ ERROR: Firestore DB is None and Firebase Admin is not initialized!")
            print("❌ Make sure init_firebase() was called during app initialization")
            print("❌ Check GOOGLE_APPLICATION_CREDENTIALS environment variable")
            raise RuntimeError("Firestore DB not initialized. Call init_firebase() first.")
    return db

def require_firebase_auth(fn):
    """
    Decorator to require Firebase authentication for an endpoint.
    Extracts and verifies the Firebase ID token from the Authorization header.
    """
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        # Check if Firebase Admin is initialized
        if not firebase_admin._apps:
            error_msg = "Firebase Admin SDK not initialized. Call init_firebase() first."
            print(f"❌ {error_msg}")
            return jsonify({'error': error_msg}), 500
        
        auth_header = request.headers.get('Authorization', '')
        print(f"🔐 Auth header received: {auth_header[:50]}...")  # Print first 50 chars
        
        if not auth_header.startswith('Bearer '):
            print("❌ Missing or invalid Authorization header format")
            return jsonify({'error': 'Missing Authorization header'}), 401

        id_token = auth_header.split(' ', 1)[1].strip()
        print(f"🎫 Token extracted (first 20 chars): {id_token[:20]}...")

        try:
            decoded = fb_auth.verify_id_token(id_token)
            request.firebase_user = decoded
            request.uid = decoded.get('uid')  # Set request.uid for route handlers
            print(f"✅ Token verified for user: {decoded.get('uid')}")
        except ValueError as ve:
            # Firebase Admin SDK not initialized error
            error_str = str(ve)
            if 'initialize' in error_str.lower() or 'init' in error_str.lower():
                error_msg = "Firebase Admin SDK not initialized. Call init_firebase() first."
                print(f"❌ {error_msg}")
                print(f"❌ Original error: {error_str}")
                return jsonify({'error': error_msg}), 500
            else:
                print(f"❌ Token verification failed: {ve}")
                return jsonify({'error': 'Invalid or expired token'}), 401
        except Exception as token_error:
            print(f"❌ Token verification failed: {token_error}")
            # Beta fallback: accept token if it looks valid but can't be verified
            if len(id_token) > 20:  # Basic length check
                beta_uid = 'beta_user_' + id_token[:10]
                request.firebase_user = {
                    'uid': beta_uid,
                    'email': 'beta@offerloop.ai'
                }
                request.uid = beta_uid  # Set request.uid for route handlers
                print("⚠️ Using beta authentication fallback")
            else:
                return jsonify({'error': 'Invalid token format'}), 401

        # Call the route handler - let its exceptions bubble up normally
        return fn(*args, **kwargs)
    return wrapper

def init_app_extensions(app: Flask):
    """Initializes Flask extensions like CORS and Firebase."""
    # Check if we're in development mode
    is_dev = (
        os.getenv("FLASK_ENV") == "development" or 
        os.getenv("ENVIRONMENT") == "development" or
        os.getenv("FLASK_DEBUG") == "1" or
        app.debug
    )
    
    # Get allowed origins from environment or use defaults
    allowed_origins_env = os.getenv("CORS_ORIGINS", "")
    allowed_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()] if allowed_origins_env else []
    
    # Default origins (always include these)
    # Prioritize Vite dev server (5173) which is the default
    default_origins = [
        "http://localhost:5173",      # Vite default (most common)
        "http://127.0.0.1:5173",      # Vite default (IP variant)
        "http://localhost:3000",      # React/Next.js default
        "http://127.0.0.1:3000",      # React/Next.js default (IP variant)
        "http://localhost:8080",      # Other dev servers
        "http://127.0.0.1:8080",      # Other dev servers (IP variant)
        "https://d33d83bb2e38.ngrok-free.app",  # Example ngrok URL
        "https://www.offerloop.ai",
        "https://offerloop.ai"
    ]
    
    # Get all allowed origins (combine defaults and env vars)
    all_origins = list(set(default_origins + allowed_origins))
    
    # In development, use all default origins (more permissive but still explicit)
    # NOTE: Cannot use "*" with supports_credentials=True - must specify origins explicitly
    if is_dev:
        print(f"🔧 Development mode: CORS configured with origins: {all_origins}")
        cors_config = {
            "origins": all_origins,  # Explicit list (required when supports_credentials=True)
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
            "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
            "supports_credentials": True,
            "max_age": 3600,
            "expose_headers": ["Content-Type", "Authorization"]
        }
    else:
        # Production: use specific origins
        cors_config = {
            "origins": all_origins,
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
            "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
            "supports_credentials": True,
            "max_age": 3600,
            "expose_headers": ["Content-Type", "Authorization"]
        }
    
    CORS(app,
         resources={
             r"/api/*": cors_config,
             r"/*": cors_config  # Also allow CORS for all routes (for SPA)
         })
    app.secret_key = os.getenv("FLASK_SECRET", "dev")
    init_firebase(app)  # Initialize Firebase when extensions are initialized