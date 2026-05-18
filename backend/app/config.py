"""
Application configuration - all constants, environment variables, and config dictionaries
"""
import os
from datetime import timedelta
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# ========================================
# API Keys & Secrets
# ========================================
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
CLAUDE_API_KEY = os.getenv("CLAUDE_API_KEY")
PEOPLE_DATA_LABS_API_KEY = os.getenv('PEOPLE_DATA_LABS_API_KEY')
STRIPE_SECRET_KEY = os.getenv('STRIPE_SECRET_KEY')
STRIPE_PUBLISHABLE_KEY = os.getenv('STRIPE_PUBLISHABLE_KEY')
STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')
SERPAPI_KEY = os.getenv('SERPAPI_KEY')
JINA_API_KEY = os.getenv("JINA_API_KEY", "")
PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY")
FIRECRAWL_API_KEY = os.getenv("FIRECRAWL_API_KEY")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_SERVICE_ACCOUNT_FILE = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE")  # Path to service account JSON
GOOGLE_SERVICE_ACCOUNT_EMAIL = os.getenv("GOOGLE_SERVICE_ACCOUNT_EMAIL")  # Service account email for domain-wide delegation
FLASK_SECRET = os.getenv("FLASK_SECRET", "dev")

# Gmail push notifications (Pub/Sub)
GOOGLE_CLOUD_PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT_ID", "offerloop-native")
GMAIL_PUBSUB_TOPIC = os.getenv("GMAIL_PUBSUB_TOPIC", "projects/offerloop-native/topics/gmail-notifications")
GMAIL_WEBHOOK_SECRET = os.getenv("GMAIL_WEBHOOK_SECRET", "")  # Random string for webhook verification

# ========================================
# Gmail OAuth Configuration
# ========================================
GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.readonly", 
    "https://www.googleapis.com/auth/gmail.send",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile"
]

def get_oauth_redirect_uri():
    """Get the appropriate OAuth redirect URI based on environment"""
    env_uri = os.getenv("OAUTH_REDIRECT_URI")
    if env_uri:
        return env_uri
    # Auto-detect based on Flask environment
    is_production = os.getenv("FLASK_ENV") == "production" or os.getenv("RENDER")
    return (
        "https://offerloop.ai/api/google/oauth/callback"
        if is_production
        else "http://localhost:5001/api/google/oauth/callback"
    )

def get_frontend_redirect_uri():
    """Get the appropriate frontend redirect URI based on environment
    
    ⚠️ IMPORTANT: Returns base URL without query params.
    Query params like ?connected=gmail or ?gmail_error=wrong_account 
    are added by gmail_oauth.py callback handler.
    """
    is_production = os.getenv("FLASK_ENV") == "production" or os.getenv("RENDER")
    return (
        "https://offerloop.ai/signin"
        if is_production
        else "http://localhost:8080/signin"
    )

OAUTH_REDIRECT_URI = get_oauth_redirect_uri()

# ========================================
# Constants
# ========================================
RESUME_LINE = "For context, I've attached my resume below."
COFFEE_CHAT_CREDITS = 15
INTERVIEW_PREP_CREDITS = 25
TIMELINE_CREDITS = 10
CACHE_DURATION = timedelta(days=365)
CREATE_GMAIL_DRAFTS = False  # Set True to create Gmail drafts; False to only return subject/body and compose links

# ========================================
# Feature Flags
# ========================================
PROMPT_SEARCH_ENABLED = os.getenv('PROMPT_SEARCH_ENABLED', 'false').lower() == 'true'  # Experimental prompt-first search

# ========================================
# Personalization Controlled Vocab
# ========================================
# Keep in sync with connect-grow-hire/src/lib/constants.ts

TARGET_INDUSTRIES = [
    "Investment Banking",
    "Management Consulting",
    "Private Equity / VC",
    "Technology",
    "Sales & Trading",
    "Corporate Finance / FP&A",
    "Data Science / Analytics",
    "Product Management",
    "Software Engineering",
    "Marketing",
    "Healthcare",
    "Real Estate",
    "Media & Entertainment",
    "Nonprofit / Public Sector",
    "Other",
]

TARGET_ROLE_TYPES = [
    "Internship",
    "Full-Time",
    "Part-Time",
    "Co-op",
    "Fellowship",
]

OPEN_TO_LOCATIONS = [
    "New York, NY",
    "San Francisco, CA",
    "Los Angeles, CA",
    "Chicago, IL",
    "Boston, MA",
    "Washington, DC",
    "Seattle, WA",
    "Dallas, TX",
    "Houston, TX",
    "Austin, TX",
    "Atlanta, GA",
    "Miami, FL",
    "Denver, CO",
    "Philadelphia, PA",
    "Charlotte, NC",
    "Nashville, TN",
    "Detroit, MI",
    "Minneapolis, MN",
    "San Diego, CA",
    "Portland, OR",
    "Remote",
    "Open to Relocation",
]


# ========================================
# Database Configuration
# ========================================
# Get absolute path to contacts.db in project root
_config_dir = os.path.dirname(os.path.abspath(__file__))  # backend/app/
_backend_dir = os.path.dirname(_config_dir)  # backend/
_project_root = os.path.dirname(_backend_dir)  # project root/
DB_PATH = os.path.join(_project_root, 'contacts.db')

# ========================================
# PDL Configuration
# ========================================
PDL_BASE_URL = 'https://api.peopledatalabs.com/v5'
pdl_cache = {}  # In-memory cache for PDL data

# ========================================
# Stripe Price IDs
# ========================================
# Pro tier: $9.99/month (student pricing, show as $14.99 $9.99)
STRIPE_PRO_PRICE_ID = os.getenv('STRIPE_PRO_PRICE_ID', 'price_1ScLXrERY2WrVHp1bYgdMAu4')
# Elite tier: $34.99/month
STRIPE_ELITE_PRICE_ID = os.getenv('STRIPE_ELITE_PRICE_ID', 'price_1ScLcfERY2WrVHp1c5rcONJ3')

# ========================================
# Tier Configurations
# ========================================
TIER_CONFIGS = {
    'free': {
        'max_contacts': 5,   # Maximum contacts returned per search
        'batch_size': 1,      # Maximum batch operations allowed (per audit spec)
        'min_contacts': 1,
        'fields': ['FirstName', 'LastName', 'LinkedIn', 'Email', 'Title', 'Company', 'City', 'State', 'College', 'Hometown'],
        'uses_pdl': True,
        'uses_email_drafting': True,
        'uses_resume': False,
        'credits': 500,
        'time_saved_minutes': 1680,  # 20 typical contacts/mo × 84 min/contact research
        'description': 'Try it out for free',
        'alumni_searches': 'unlimited',
        'coffee_chat_preps': 1,
        'interview_preps': 2,
        'firm_search': False,
        'smart_filters': False,
        'bulk_drafting': False,
        'export_enabled': False,
        'priority_queue': False,
        'personalized_templates': False,
        'weekly_insights': False,
        'early_access': False,
        'agent_enabled': False,
        'agent_max_concurrent': 0,
    },
    'pro': {
        'max_contacts': 15,  # Maximum contacts returned per search
        'batch_size': 5,      # Maximum batch operations allowed (per audit spec)
        'min_contacts': 1,
        'fields': ['FirstName', 'LastName', 'LinkedIn', 'Email', 'Title', 'Company', 'City', 'State', 'College',
                  'Phone', 'PersonalEmail', 'WorkEmail', 'SocialProfiles', 'EducationTop', 'VolunteerHistory',
                  'WorkSummary', 'Group', 'Hometown', 'Similarity'],
        'uses_pdl': True,
        'uses_email_drafting': True,
        'uses_resume': True,
        'credits': 3000,
        'time_saved_minutes': 12600,  # 150 typical contacts/mo × 84 min
        'description': 'Best for Students',
        'alumni_searches': 'unlimited',
        'coffee_chat_preps': 'unlimited',
        'interview_preps': 5,
        'firm_search': True,
        'smart_filters': True,
        'bulk_drafting': True,
        'export_enabled': True,
        'priority_queue': False,
        'personalized_templates': False,
        'weekly_insights': False,
        'early_access': False,
        'agent_enabled': True,
        'agent_max_concurrent': 1,
    },
    'elite': {
        'max_contacts': 30,  # Maximum contacts returned per search
        'batch_size': 15,     # Maximum batch operations allowed (per audit spec)
        'min_contacts': 1,
        'fields': ['FirstName', 'LastName', 'LinkedIn', 'Email', 'Title', 'Company', 'City', 'State', 'College',
                  'Phone', 'PersonalEmail', 'WorkEmail', 'SocialProfiles', 'EducationTop', 'VolunteerHistory',
                  'WorkSummary', 'Group', 'Hometown', 'Similarity'],
        'uses_pdl': True,
        'uses_email_drafting': True,
        'uses_resume': True,
        'credits': 12000,
        'time_saved_minutes': 67200,  # 800 max contacts/mo × 84 min — displayed as hours in UI
        'description': 'For serious recruiting season',
        'alumni_searches': 'unlimited',
        'coffee_chat_preps': 'unlimited',
        'interview_preps': 'unlimited',
        'firm_search': True,
        'smart_filters': True,
        'bulk_drafting': True,
        'export_enabled': True,
        'priority_queue': True,
        'personalized_templates': True,
        'weekly_insights': True,
        'early_access': True,
        'agent_enabled': True,
        'agent_max_concurrent': 5,
    }
}

# ========================================
# PDL Metro Areas
# ========================================
PDL_METRO_AREAS = {
    'san francisco': 'san francisco, california',
    'san francisco bay area': 'san francisco, california',
    'bay area': 'san francisco, california',
    'sf': 'san francisco, california',
    'los angeles': 'los angeles, california',
    'la': 'los angeles, california',
    'new york': 'new york, new york',
    'new york city': 'new york, new york',
    'nyc': 'new york, new york',
    'chicago': 'chicago, illinois',
    'boston': 'boston, massachusetts',
    'washington dc': 'washington, district of columbia',
    'dc': 'washington, district of columbia',
    'seattle': 'seattle, washington',
    'atlanta': 'atlanta, georgia',
    'dallas': 'dallas, texas',
    'houston': 'houston, texas',
    'miami': 'miami, florida',
    'denver': 'denver, colorado',
    'phoenix': 'phoenix, arizona',
    'philadelphia': 'philadelphia, pennsylvania',
    'detroit': 'detroit, michigan',
    'minneapolis': 'minneapolis, minnesota',
    'austin': 'austin, texas',
    'san diego': 'san diego, california',
    'portland': 'portland, oregon',
    'orlando': 'orlando, florida',
    'tampa': 'tampa, florida',
    'nashville': 'nashville, tennessee',
    'charlotte': 'charlotte, north carolina',
    'pittsburgh': 'pittsburgh, pennsylvania',
    'cleveland': 'cleveland, ohio',
    'cincinnati': 'cincinnati, ohio',
    'columbus': 'columbus, ohio',
    'indianapolis': 'indianapolis, indiana',
    'milwaukee': 'milwaukee, wisconsin',
    'kansas city': 'kansas city, missouri',
    'sacramento': 'sacramento, california',
    'las vegas': 'las vegas, nevada',
    'salt lake city': 'salt lake city, utah',
    'raleigh': 'raleigh, north carolina',
    'richmond': 'richmond, virginia',
    'birmingham': 'birmingham, alabama',
    'memphis': 'memphis, tennessee',
    'louisville': 'louisville, kentucky',
    'jacksonville': 'jacksonville, florida',
    'oklahoma city': 'oklahoma city, oklahoma',
    'buffalo': 'buffalo, new york',
    'rochester': 'rochester, new york',
    'albany': 'albany, new york',
    'hartford': 'hartford, connecticut',
    'providence': 'providence, rhode island'
}

# ========================================
# Validation
# ========================================
if not PEOPLE_DATA_LABS_API_KEY:
    print("WARNING: PEOPLE_DATA_LABS_API_KEY not found in .env file")

if not OPENAI_API_KEY:
    print("WARNING: OPENAI_API_KEY not found in .env file")

if not CLAUDE_API_KEY:
    print("WARNING: CLAUDE_API_KEY not found in .env file")
else:
    print("✓ Claude API key loaded")

if STRIPE_SECRET_KEY:
    import stripe
    stripe.api_key = STRIPE_SECRET_KEY
    print("✓ Stripe initialized successfully")
else:
    print("WARNING: STRIPE_SECRET_KEY not found in .env file")

# OAuth insecure transport for localhost
if (os.environ.get("OAUTH_REDIRECT_URI") or "").startswith("http://localhost"):
    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"