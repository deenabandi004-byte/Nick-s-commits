import requests
import os
import time
import json
from functools import lru_cache
from typing import Dict, Tuple, Optional
from app.utils.retry import retry_with_backoff, retry_on_rate_limit
from app.services.openai_client import get_openai_client
import requests.exceptions
import threading

HUNTER_API_KEY = os.getenv('HUNTER_API_KEY')

# Rate limiting configuration
# Note: No preemptive delays - only sleep when actually rate limited (429 status)
MAX_CONSECUTIVE_FAILURES = 3  # Stop after 3 consecutive API failures (likely rate limit)

# ✅ ISSUE 2 FIX: Module-level caches with TTL timestamps (persist across requests)
# Domain pattern cache - stores email patterns for each domain with timestamps
# Format: {domain: (pattern, timestamp)} e.g., {'google.com': ('{first}.{last}', 1234567890.0)}
_email_pattern_cache = {}  # type: Dict[str, Tuple[str, float]]
_cache_lock = threading.Lock()
CACHE_TTL = 3600  # 1 hour TTL

# Email verification cache - stores verification results with timestamps
# Format: {email: (verification_result, timestamp)}
_email_verification_cache = {}  # type: Dict[str, Tuple[dict, float]]
_verification_cache_lock = threading.Lock()

# Company domain mapping for common companies
COMPANY_DOMAINS = {
    # Consulting
    'bain & company': 'bain.com',
    'bain and company': 'bain.com',
    'bain': 'bain.com',
    'bcg': 'bcg.com',
    'boston consulting group': 'bcg.com',
    'mckinsey': 'mckinsey.com',
    'mckinsey & company': 'mckinsey.com',
    'mckinsey and company': 'mckinsey.com',
    'deloitte': 'deloitte.com',
    'pwc': 'pwc.com',
    'pricewaterhousecoopers': 'pwc.com',
    'kpmg': 'kpmg.com',
    'ey': 'ey.com',
    'ernst & young': 'ey.com',
    'accenture': 'accenture.com',
    
    # Tech
    'google': 'google.com',
    'meta': 'meta.com',
    'facebook': 'meta.com',
    'amazon': 'amazon.com',
    'microsoft': 'microsoft.com',
    'apple': 'apple.com',
    'netflix': 'netflix.com',
    'uber': 'uber.com',
    'airbnb': 'airbnb.com',
    'salesforce': 'salesforce.com',
    'oracle': 'oracle.com',
    'adobe': 'adobe.com',
    'playstation': 'playstation.com',
    'sie': 'playstation.com',  # Sony Interactive Entertainment
    'sony interactive entertainment': 'playstation.com',
    'tiktok': 'tiktok.com',
    'bytedance': 'bytedance.com',
    
    # Finance
    'goldman sachs': 'gs.com',
    'morgan stanley': 'morganstanley.com',
    'jp morgan': 'jpmorgan.com',
    'jpmorgan': 'jpmorgan.com',
    'jpmorgan chase': 'jpmorganchase.com',
    'bank of america': 'bofa.com',
    'citigroup': 'citi.com',
    'wells fargo': 'wellsfargo.com',
    'blackrock': 'blackrock.com',
    'evercore': 'evercore.com',
    'lazard': 'lazard.com',
    'centerview': 'centerviewpartners.com',
    
    # Add more as needed
}

# Alternate domain mappings - some companies use multiple domains
# Format: {primary_domain: [alternate_domains]}
COMPANY_ALTERNATE_DOMAINS = {
    "tiktok.com": ["bytedance.com"],
    "bytedance.com": ["tiktok.com"],
    "instagram.com": ["meta.com"],
    "whatsapp.com": ["meta.com"],
    "meta.com": ["facebook.com"],  # Some legacy employees might still use facebook.com
}


def is_personal_email_domain(domain: str) -> bool:
    """
    Check if an email domain is a personal email provider (Gmail, Yahoo, etc.)
    
    Args:
        domain: Email domain (e.g., 'gmail.com')
    
    Returns:
        True if domain is a personal email provider, False otherwise
    """
    if not domain:
        return False
    
    personal_domains = [
        'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
        'icloud.com', 'me.com', 'protonmail.com', 'mail.com', 'yandex.com',
        'zoho.com', 'gmx.com', 'live.com', 'msn.com', 'inbox.com',
        'sbcglobal.net', 'att.net', 'verizon.net', 'comcast.net'
    ]
    
    return domain.lower().strip() in personal_domains


def extract_domain_from_url(url: str) -> str:
    """
    Extract domain from a URL (e.g., 'https://www.company.com' -> 'company.com')
    
    Args:
        url: URL string
    
    Returns:
        Domain string or None
    """
    if not url:
        return None
    
    # Remove protocol
    domain = url.replace('https://', '').replace('http://', '').replace('www.', '')
    
    # Remove path and query
    domain = domain.split('/')[0]
    domain = domain.split('?')[0]
    
    return domain.strip().lower() if domain else None


# Domain cache to avoid repeated API calls
_domain_cache = {}

# Expanded domain mapping
COMPANY_DOMAIN_MAP = {
    # Tech Giants
    "google": "google.com",
    "meta": "meta.com",
    "facebook": "meta.com",
    "microsoft": "microsoft.com",
    "amazon": "amazon.com",
    "apple": "apple.com",
    "netflix": "netflix.com",
    "tiktok": "tiktok.com",
    "bytedance": "bytedance.com",
    "uber": "uber.com",
    "lyft": "lyft.com",
    "airbnb": "airbnb.com",
    "salesforce": "salesforce.com",
    "oracle": "oracle.com",
    "ibm": "ibm.com",
    "intel": "intel.com",
    "nvidia": "nvidia.com",
    "adobe": "adobe.com",
    "twitter": "x.com",
    "x": "x.com",
    "snap": "snap.com",
    "snapchat": "snap.com",
    "linkedin": "linkedin.com",
    "spotify": "spotify.com",
    "stripe": "stripe.com",
    "paypal": "paypal.com",
    "square": "squareup.com",
    "block": "block.xyz",
    
    # Finance
    "bank of america": "bofa.com",
    "bofa": "bofa.com",
    "jpmorgan": "jpmorgan.com",
    "jpmorgan chase": "jpmorgan.com",
    "jp morgan": "jpmorgan.com",
    "chase": "chase.com",
    "goldman sachs": "gs.com",
    "morgan stanley": "morganstanley.com",
    "citibank": "citi.com",
    "citi": "citi.com",
    "citigroup": "citi.com",
    "wells fargo": "wellsfargo.com",
    "capital one": "capitalone.com",
    "american express": "aexp.com",
    "amex": "aexp.com",
    "blackrock": "blackrock.com",
    "vanguard": "vanguard.com",
    "fidelity": "fidelity.com",
    "charles schwab": "schwab.com",
    "schwab": "schwab.com",
    
    # Consulting/Professional Services
    "deloitte": "deloitte.com",
    "pwc": "pwc.com",
    "pricewaterhousecoopers": "pwc.com",
    "kpmg": "kpmg.com",
    "ernst & young": "ey.com",
    "ernst and young": "ey.com",
    "ey": "ey.com",
    "accenture": "accenture.com",
    "mckinsey": "mckinsey.com",
    "mckinsey & company": "mckinsey.com",
    "bain": "bain.com",
    "bain & company": "bain.com",
    "bcg": "bcg.com",
    "boston consulting group": "bcg.com",
    
    # LA/California Government
    "los angeles department of water and power": "ladwp.com",
    "ladwp": "ladwp.com",
    "la department of water and power": "ladwp.com",
    "los angeles unified school district": "lausd.net",
    "lausd": "lausd.net",
    "city of los angeles": "lacity.org",
    "la city": "lacity.org",
    "los angeles county": "lacounty.gov",
    "la county": "lacounty.gov",
    "los angeles county department of mental health": "dmh.lacounty.gov",
    "state of california": "ca.gov",
    "california state": "ca.gov",
    
    # Universities
    "university of southern california": "usc.edu",
    "usc": "usc.edu",
    "university of california, los angeles": "ucla.edu",
    "ucla": "ucla.edu",
    "california state university, fullerton": "fullerton.edu",
    "cal state fullerton": "fullerton.edu",
    "csuf": "fullerton.edu",
    "stanford university": "stanford.edu",
    "stanford": "stanford.edu",
    "harvard university": "harvard.edu",
    "harvard": "harvard.edu",
    "mit": "mit.edu",
    "massachusetts institute of technology": "mit.edu",
    "uc berkeley": "berkeley.edu",
    "university of california, berkeley": "berkeley.edu",
    "caltech": "caltech.edu",
    "california institute of technology": "caltech.edu",
    
    # Healthcare
    "kaiser permanente": "kp.org",
    "kaiser": "kp.org",
    "blue shield of california": "blueshieldca.com",
    "blue cross blue shield": "bcbs.com",
    "unitedhealth": "uhg.com",
    "united health": "uhg.com",
    "unitedhealth group": "uhg.com",
    "cvs health": "cvshealth.com",
    "cvs": "cvshealth.com",
    "walgreens": "walgreens.com",
    "cigna": "cigna.com",
    "aetna": "aetna.com",
    "humana": "humana.com",
    "anthem": "anthem.com",
    
    # Retail
    "walmart": "walmart.com",
    "target": "target.com",
    "costco": "costco.com",
    "home depot": "homedepot.com",
    "the home depot": "homedepot.com",
    "lowes": "lowes.com",
    "lowe's": "lowes.com",
    "best buy": "bestbuy.com",
    "nordstrom": "nordstrom.com",
    "macy's": "macys.com",
    "macys": "macys.com",
    
    # Entertainment
    "disney": "disney.com",
    "walt disney": "disney.com",
    "the walt disney company": "disney.com",
    "warner bros": "warnerbros.com",
    "warner brothers": "warnerbros.com",
    "warnermedia": "warnermedia.com",
    "sony": "sony.com",
    "sony pictures": "sonypictures.com",
    "paramount": "paramount.com",
    "universal": "nbcuni.com",
    "nbcuniversal": "nbcuni.com",
    "hbo": "hbo.com",
    "hulu": "hulu.com",
    
    # Telecom
    "t-mobile": "t-mobile.com",
    "t mobile": "t-mobile.com",
    "tmobile": "t-mobile.com",
    "at&t": "att.com",
    "att": "att.com",
    "at & t": "att.com",
    "verizon": "verizon.com",
    "sprint": "t-mobile.com",  # Sprint merged into T-Mobile (2020)
    "comcast": "comcast.com",
    "xfinity": "comcast.com",
    "charter communications": "charter.com",
    "spectrum": "charter.com",

    # Tech - Hardware/Infra
    "samsung": "samsung.com",
    "qualcomm": "qualcomm.com",
    "cisco": "cisco.com",
    "cisco systems": "cisco.com",
    "dell": "dell.com",
    "dell technologies": "dell.com",
    "hp": "hp.com",
    "hewlett packard": "hp.com",
    "hewlett-packard": "hp.com",
    "hpe": "hpe.com",
    "hewlett packard enterprise": "hpe.com",
    "vmware": "vmware.com",
    "broadcom": "broadcom.com",
    "amd": "amd.com",
    "advanced micro devices": "amd.com",

    # Tech - SaaS/Cloud
    "servicenow": "servicenow.com",
    "workday": "workday.com",
    "snowflake": "snowflake.com",
    "databricks": "databricks.com",
    "palantir": "palantir.com",
    "palantir technologies": "palantir.com",
    "datadog": "datadoghq.com",
    "twilio": "twilio.com",
    "slack": "slack-corp.com",
    "zoom": "zoom.us",
    "zoom video": "zoom.us",
    "dropbox": "dropbox.com",
    "atlassian": "atlassian.com",
    "hubspot": "hubspot.com",
    "splunk": "splunk.com",
    "crowdstrike": "crowdstrike.com",
    "palo alto networks": "paloaltonetworks.com",
    "okta": "okta.com",
    "cloudflare": "cloudflare.com",
    "mongodb": "mongodb.com",
    "elastic": "elastic.co",
    "confluent": "confluent.io",

    # Tech - Consumer/Social
    "pinterest": "pinterest.com",
    "reddit": "reddit.com",
    "coinbase": "coinbase.com",
    "robinhood": "robinhood.com",
    "doordash": "doordash.com",
    "instacart": "instacart.com",
    "discord": "discord.com",
    "figma": "figma.com",
    "notion": "notion.so",
    "openai": "openai.com",
    "anthropic": "anthropic.com",

    # Other Major Companies
    "3m": "mmm.com",
    "ge": "ge.com",
    "general electric": "ge.com",
    "boeing": "boeing.com",
    "lockheed martin": "lmco.com",
    "raytheon": "rtx.com",
    "northrop grumman": "ngc.com",
    "spacex": "spacex.com",
    "tesla": "tesla.com",
    "ford": "ford.com",
    "gm": "gm.com",
    "general motors": "gm.com",
    "toyota": "toyota.com",
    "honda": "honda.com",
}

# Merge with existing COMPANY_DOMAINS for backward compatibility
COMPANY_DOMAINS.update(COMPANY_DOMAIN_MAP)


def get_smart_company_domain(company_name: str, company_website: str = None) -> str:
    """
    Get email domain for a company using multiple strategies:
    1. Check hardcoded mapping
    2. Check cache
    3. Use OpenAI for complex company names
    4. Generate simple domain for simple names
    
    Args:
        company_name: Company name
        company_website: Optional company website URL
    
    Returns:
        Domain string or None
    """
    import time
    domain_start = time.time()
    
    if not company_name:
        return None
    
    company_lower = company_name.lower().strip()
    
    # Check cache first
    if company_lower in _domain_cache:
        domain_time = time.time() - domain_start
        print(f"[DomainLookup] ⏱️  Cache hit ({domain_time*1000:.0f}ms): {company_lower} → {_domain_cache[company_lower]}")
        return _domain_cache[company_lower]
    
    # Check hardcoded mapping
    domain = COMPANY_DOMAIN_MAP.get(company_lower) or COMPANY_DOMAINS.get(company_lower)
    if domain:
        domain_time = time.time() - domain_start
        print(f"[DomainLookup] ⏱️  Mapping hit ({domain_time*1000:.0f}ms): {company_lower} → {domain}")
        _domain_cache[company_lower] = domain
        return domain
    
    # Extract domain from website if provided
    if company_website:
        domain = extract_domain_from_url(company_website)
        if domain and not is_personal_email_domain(domain):
            domain_time = time.time() - domain_start
            print(f"[DomainLookup] ⏱️  Extracted from website ({domain_time*1000:.0f}ms): {company_website} → {domain}")
            _domain_cache[company_lower] = domain
            return domain
    
    # Check if company name is complex (needs OpenAI)
    needs_openai = (
        len(company_name) > 30 or  # Long name
        "&" in company_name or  # Has special chars
        "'" in company_name or
        "county" in company_lower or  # Government
        "department" in company_lower or
        "university" in company_lower or  # Education
        "college" in company_lower or
        "school" in company_lower or
        "hospital" in company_lower or  # Healthcare
        "medical" in company_lower or
        "health" in company_lower
    )
    
    if needs_openai:
        print(f"[DomainLookup] ⏱️  Complex company name, using OpenAI: {company_name}")
        openai_start = time.time()
        domain = get_domain_from_openai(company_name)
        openai_time = time.time() - openai_start
        # Note: We can't access _timing_stats from here, but we can log it
        print(f"[DomainLookup] ⏱️  OpenAI domain lookup: {openai_time:.2f}s")
        if domain:
            _domain_cache[company_lower] = domain
            return domain
        else:
            print(f"[DomainLookup] OpenAI couldn't find domain")
            _domain_cache[company_lower] = None
            return None
    
    # Simple company name - generate domain
    domain = generate_simple_domain(company_name)
    if domain:
        domain_time = time.time() - domain_start
        print(f"[DomainLookup] ⏱️  Generated domain ({domain_time*1000:.0f}ms): {company_name} → {domain}")
        _domain_cache[company_lower] = domain
        return domain
    
    return None


def get_domain_from_openai(company_name: str) -> str:
    """
    Use OpenAI to find the actual email domain for a company.
    """
    import time
    openai_start = time.time()
    try:
        print(f"[OpenAI] ⏱️  Looking up domain for: {company_name}")
        
        client = get_openai_client()
        if not client:
            print(f"[OpenAI] ❌ OpenAI client not available")
            return None
        
        api_start = time.time()
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "system",
                "content": "You are a helpful assistant that finds company email domains. Respond with ONLY the domain name (like 'google.com' or 'usc.edu'), nothing else. If you're not sure, respond with 'unknown'."
            }, {
                "role": "user", 
                "content": f"What is the email domain for employees at '{company_name}'?"
            }],
            max_tokens=50,
            temperature=0
        )
        api_time = time.time() - api_start
        
        domain = response.choices[0].message.content.strip().lower()
        total_time = time.time() - openai_start
        print(f"[OpenAI] ⏱️  Response ({total_time:.2f}s, API: {api_time:.2f}s): {domain}")
        
        # Validate response
        if domain and domain != "unknown" and "." in domain and " " not in domain:
            # Remove any trailing punctuation
            domain = domain.rstrip(".,;:")
            print(f"[OpenAI] ✅ Found domain: {domain}")
            return domain
        else:
            print(f"[OpenAI] ❌ Invalid or unknown response")
            return None
            
    except Exception as e:
        total_time = time.time() - openai_start
        print(f"[OpenAI] ❌ Error ({total_time:.2f}s): {str(e)}")
        return None


def generate_simple_domain(company_name: str) -> str:
    """
    Generate domain for simple company names only.
    Returns None for complex names that should use OpenAI.
    """
    clean = company_name.lower().strip()
    # Strip leading "the " so "the corvallis clinic" -> "corvallis clinic" -> corvallisclinic.com
    if clean.startswith("the "):
        clean = clean[4:].strip()
    # Remove common suffixes
    suffixes = [", inc.", " inc.", " inc", ", llc", " llc", ", l.p.", " l.p.",
                " lp", " corp", " corporation", " co.", " co", " ltd", " ltd.",
                ", ltd", ", corp", ", corporation"]
    for suffix in suffixes:
        clean = clean.replace(suffix, "")
    clean = clean.strip()
    # Remove spaces
    clean = clean.replace(" ", "")
    
    # Must be alphanumeric only
    if not clean.isalnum():
        return None
    
    # Must be reasonable length
    if len(clean) > 25 or len(clean) < 2:
        return None
    
    return f"{clean}.com"


@lru_cache(maxsize=1000)
def get_company_domain(company_name: str) -> str:
    """
    Convert company name to email domain.
    Uses mapping first, falls back to guessing.
    
    DEPRECATED: Use get_smart_company_domain() instead for better results.
    Kept for backward compatibility.
    
    Args:
        company_name: Company name (e.g., "Google", "Bain & Company")
    
    Returns:
        Domain string (e.g., "google.com", "bain.com") or None
    """
    return get_smart_company_domain(company_name)


def find_email_with_hunter(first_name: str, last_name: str, domain: str, api_key: str = None,
                            *, timeout: float = 5.0, max_retries: int = 1):
    """
    Use Hunter's Email Finder API to find email address.
    This replaces the manual pattern generation approach (1 API call instead of 10+).

    Args:
        first_name: Person's first name
        last_name: Person's last name
        domain: Company domain (e.g., "google.com")
        api_key: Hunter API key (optional, uses env var if not provided)
        timeout: Per-attempt HTTP timeout in seconds (default 5s — successful
                 calls return in ~2-3s; default 10s was making slow lookups
                 block the whole parallel batch)
        max_retries: Total attempts (default 1 = no retry). Hunter timeouts
                     are usually a real signal that Hunter has no data; retrying
                     just wastes wall-clock time. Pattern synthesis is a fine
                     fallback after a single miss.

    Returns:
        Tuple of (email, score)
          - (email, score) on a confident hit (score >= 70)
          - (None, score)  on a low-confidence hit (Hunter has data but score < 70)
          - (None, 0)      on a real "no data" miss
          - (None, -1)     when Hunter rate-limited us (Phase 2.5 sentinel).
                           Callers MUST NOT fall through to pattern synthesis
                           on this case — pattern guesses on a rate-limit are
                           the #2 source of bounces.
    """
    import time
    finder_start = time.time()
    print(f"[Hunter Email Finder] ⏱️  Searching for {first_name} {last_name} @ {domain}")

    if not api_key:
        api_key = HUNTER_API_KEY

    if not api_key:
        print("⚠️ Hunter.io API key not configured")
        return None, 0

    if not (first_name and last_name and domain):
        print(f"[Hunter Email Finder] ⚠️ Missing required parameters: first={bool(first_name)}, last={bool(last_name)}, domain={bool(domain)}")
        return None, 0

    url = "https://api.hunter.io/v2/email-finder"
    params = {
        "domain": domain,
        "first_name": first_name.strip(),
        "last_name": last_name.strip(),
        "api_key": api_key
    }

    for attempt in range(max_retries):
        try:
            print(f"[Hunter Email Finder] Making API request (attempt {attempt + 1}/{max_retries})...")
            api_start = time.time()
            response = requests.get(url, params=params, timeout=timeout)
            api_time = time.time() - api_start
            total_time = time.time() - finder_start
            
            print(f"[Hunter Email Finder] ⏱️  Response status: {response.status_code} (total: {total_time:.2f}s, API: {api_time:.2f}s)")
            
            # Handle rate limit (429) with exponential backoff - only sleep when actually rate limited
            if response.status_code == 429:
                wait_time = min((2 ** attempt) * 1, 8)  # 1s, 2s, 4s, max 8s
                print(f"[Hunter Email Finder] ⚠️ Rate limited (429), waiting {wait_time}s before retry {attempt + 1}/{max_retries}...")
                if attempt < max_retries - 1:
                    time.sleep(wait_time)
                    continue
                else:
                    print(f"[Hunter Email Finder] ❌ Rate limited after {max_retries} attempts")
                    # Phase 2.5: -1 sentinel tells the caller we were rate
                    # limited, so it skips pattern synthesis instead of
                    # shipping an invented address.
                    try:
                        from app.utils.metrics_events import log_event
                        log_event(None, "hunter_rate_limited", {
                            "endpoint": "email_finder",
                            "domain": domain,
                        })
                    except Exception:
                        pass
                    return None, -1
            
            if response.status_code != 200:
                print(f"[Hunter Email Finder] ⚠️ Error response: {response.status_code}")
                print(f"[Hunter Email Finder] Response body: {response.text[:200]}")
                return None, 0
            
            data = response.json()
            print(f"[Hunter Email Finder] Response data: {json.dumps(data, indent=2)}")
            
            email_data = data.get("data", {})
            email = email_data.get("email")
            score = email_data.get("score", 0)
            position = email_data.get("position", "Unknown")
            company = email_data.get("company", "Unknown")
            
            print(f"[Hunter Email Finder] Parsed - email: {email}, score: {score}, position: {position}, company: {company}")
            
            if email and score >= 70:
                print(f"[Hunter Email Finder] ✅ Found valid email: {email} (score: {score})")
                return email, score
            elif email:
                print(f"[Hunter Email Finder] ⚠️ Found email but low confidence: {email} (score: {score})")
                return None, score
            else:
                print(f"[Hunter Email Finder] ❌ No email found for {first_name} {last_name} @ {domain}")
                return None, 0
                
        except requests.exceptions.Timeout:
            print(f"[Hunter Email Finder] ⚠️ Request timeout")
            if attempt < max_retries - 1:
                wait_time = (2 ** attempt) * 1
                time.sleep(wait_time)
                continue
            return None, 0
        except requests.exceptions.RequestException as e:
            print(f"[Hunter Email Finder] ❌ Request exception: {str(e)}")
            if attempt < max_retries - 1:
                wait_time = (2 ** attempt) * 1
                time.sleep(wait_time)
                continue
            return None, 0
        except json.JSONDecodeError as e:
            print(f"[Hunter Email Finder] ❌ JSON decode error: {str(e)}")
            if 'response' in locals():
                print(f"[Hunter Email Finder] Raw response: {response.text[:200]}")
            return None, 0
        except Exception as e:
            print(f"[Hunter Email Finder] ❌ Unexpected exception: {str(e)}")
            import traceback
            print(f"[Hunter Email Finder] Traceback: {traceback.format_exc()}")
            if attempt < max_retries - 1:
                wait_time = (2 ** attempt) * 1
                time.sleep(wait_time)
                continue
            return None, 0
    
    # All retries exhausted
    print(f"[Hunter Email Finder] ❌ All retry attempts exhausted")
    return None, 0


def find_email_hunter(first_name: str, last_name: str, company: str, api_key: str = None) -> dict:
    """
    DEPRECATED: Use find_email_with_hunter() instead.
    Legacy wrapper for backward compatibility.
    """
    domain = get_company_domain(company)
    if not domain:
        return None
    
    email, score = find_email_with_hunter(first_name, last_name, domain, api_key)
    if email:
        return {
            'email': email,
            'score': score,
            'verified': score >= 70,
            'sources': [],
            'position': None,
            'company': company
        }
    return None


def generate_email_from_pattern(first_name: str, last_name: str, domain: str, pattern: str) -> str:
    """
    Generate email address from a pattern like '{first}.{last}', '{f}{last}', etc.
    
    Args:
        first_name: First name
        last_name: Last name
        domain: Email domain
        pattern: Email pattern from Hunter (e.g., '{first}.{last}', '{f}{last}')
    
    Returns:
        Generated email address
    """
    first = first_name.lower().strip() if first_name else ""
    last = last_name.lower().strip() if last_name else ""
    f = first[0] if first else ""
    l = last[0] if last else ""
    
    # Replace pattern placeholders
    email_local = pattern.replace("{first}", first)
    email_local = email_local.replace("{last}", last)
    email_local = email_local.replace("{f}", f)
    email_local = email_local.replace("{l}", l)
    
    return f"{email_local}@{domain}"


def get_domain_pattern(domain: str, api_key: str = None) -> str:
    """
    Get email pattern for a domain using Hunter.io Domain Search API.
    Uses caching to avoid repeated API calls for the same domain.
    
    Returns:
        Pattern string like '{first}.{last}' or None if not found
    """
    import time
    pattern_start = time.time()
    
    if not api_key:
        api_key = HUNTER_API_KEY
    
    if not api_key:
        return None
    
    if not domain:
        return None
    
    # ✅ ISSUE 2 FIX: Check cache with TTL validation
    with _cache_lock:
        if domain in _email_pattern_cache:
            pattern, timestamp = _email_pattern_cache[domain]
            if time.time() - timestamp < CACHE_TTL:
                cache_time = time.time() - pattern_start
                print(f"📦 ⏱️  Using cached email pattern ({cache_time*1000:.0f}ms) for {domain}: {pattern}")
                return pattern
            else:
                # Cache expired, remove it
                del _email_pattern_cache[domain]
    
    # Fetch pattern from Hunter with retry logic (only sleeps on actual 429 rate limits)
    url = "https://api.hunter.io/v2/domain-search"
    params = {
        'domain': domain,
        'api_key': api_key
    }
    
    max_retries = 3
    for attempt in range(max_retries):
        try:
            api_start = time.time()
            response = requests.get(url, params=params, timeout=10)
            api_time = time.time() - api_start
            
            # Handle rate limit (429) with exponential backoff
            if response.status_code == 429:
                wait_time = (2 ** attempt) * 1  # 1s, 2s, 4s
                print(f"⚠️ Hunter.io Domain Search rate limited (429), waiting {wait_time}s before retry {attempt + 1}/{max_retries}...")
                time.sleep(wait_time)
                continue
            
            if response.status_code == 200:
                data = response.json()
                domain_data = data.get('data', {})
                pattern = domain_data.get('pattern')
                
                total_time = time.time() - pattern_start
                if pattern:
                    # ✅ ISSUE 2 FIX: Cache the pattern with timestamp
                    with _cache_lock:
                        _email_pattern_cache[domain] = (pattern, time.time())
                    print(f"✅ ⏱️  Retrieved email pattern ({total_time:.2f}s, API: {api_time:.2f}s) for {domain}: {pattern}")
                    return pattern
                else:
                    print(f"⚠️ ⏱️  No email pattern found ({total_time:.2f}s, API: {api_time:.2f}s) for domain: {domain}")
                    return None
            else:
                total_time = time.time() - pattern_start
                print(f"⚠️ ⏱️  Hunter.io Domain Search API error {response.status_code} ({total_time:.2f}s) for {domain}")
                if attempt < max_retries - 1:
                    wait_time = (2 ** attempt) * 1
                    time.sleep(wait_time)
                    continue
                return None
        
        except requests.exceptions.Timeout:
            print(f"⚠️ Hunter.io Domain Search timeout for {domain}")
            if attempt < max_retries - 1:
                wait_time = (2 ** attempt) * 1
                time.sleep(wait_time)
                continue
            return None
        except Exception as e:
            print(f"⚠️ Error fetching domain pattern for {domain}: {e}")
            if attempt < max_retries - 1:
                wait_time = (2 ** attempt) * 1
                time.sleep(wait_time)
                continue
            return None
    
    return None


def generate_email_with_hunter(first_name: str, last_name: str, domain: str, api_key: str = None) -> dict:
    """
    DEPRECATED: Use find_email_with_hunter() instead.
    This function uses 10+ API calls (Domain Search + multiple Email Verifier calls).
    The new approach uses Email Finder API (1 API call per person).
    
    This function is kept for backward compatibility but should not be used in new code.
    
    Generate email address by trying MULTIPLE email patterns until one verifies.
    
    Flow:
    1. Get Hunter's suggested pattern (if available) and prioritize it
    2. Generate list of common email patterns
    3. Try each pattern and verify with Hunter Email Verifier
    4. Return the first email that verifies successfully
    
    Args:
        first_name: First name
        last_name: Last name
        domain: Company domain (e.g., 'google.com')
        api_key: Hunter API key (optional)
    
    Returns:
        {
            'email': 'john.smith@company.com',
            'email_verified': True,
            'score': 95
        }
        or None if no valid email found
    """
    # Use the new Email Finder API instead
    print(f"[DEPRECATED] generate_email_with_hunter() called - using Email Finder API instead")
    email, score = find_email_with_hunter(first_name, last_name, domain, api_key)
    if email:
        return {
            'email': email,
            'email_verified': score >= 70,
            'score': score
        }
    return None


def enrich_contact_with_hunter(contact: dict, api_key: str = None, target_domain: str = None, skip_personal_emails: bool = False) -> dict:
    """
    Enrich a single contact with Hunter.io - VERIFIES PDL EMAILS BEFORE USING THEM
    
    Args:
        contact: Contact dict with FirstName, LastName, Company, Email
        api_key: Hunter.io API key (optional, uses env var if not provided)
        target_domain: Target company domain (e.g., "tiktok.com") - if provided, used directly
        skip_personal_emails: If True, skip personal email fallback (for recruiter search)
    
    Returns:
        Contact with verified email (either verified PDL email or new Hunter email)
    """
    first_name = contact.get('FirstName', '')
    last_name = contact.get('LastName', '')
    company = contact.get('Company', '')
    pdl_email = contact.get('Email')
    
    if not (first_name and last_name):
        return contact
    
    # Construct minimal person_data from contact to help extract correct domain
    # Extract domain from contact's email if available, or use company name
    person_data = None
    if company:
        # Create minimal person_data structure with company info
        person_data = {
            'experience': [{
                'company': {
                    'name': company,
                    'website': contact.get('CompanyWebsite', '') or contact.get('Website', '')
                }
            }]
        }
    
    # ✅ VERIFY PDL EMAIL WITH HUNTER BEFORE USING IT
    # Use the shared helper function that verifies PDL emails
    # Pass target_domain directly to ensure we use the correct domain
    # Use get_verified_email_with_alternates for recruiter search to try alternate domains
    if target_domain:
        # Use alternate domain support for recruiter search
        verified_email_result = get_verified_email_with_alternates(
            pdl_email=pdl_email if pdl_email and pdl_email != "Not available" else None,
            first_name=first_name,
            last_name=last_name,
            company=company,
            person_data=person_data,  # Pass person_data for context
            api_key=api_key,
            target_domain=target_domain,  # Pass target domain directly
            skip_personal_emails=skip_personal_emails  # Skip personal emails for recruiter search
        )
    else:
        # Fallback to regular function if no target_domain
        verified_email_result = get_verified_email(
            pdl_email=pdl_email if pdl_email and pdl_email != "Not available" else None,
            first_name=first_name,
            last_name=last_name,
            company=company,
            person_data=person_data,  # Pass person_data for context
            api_key=api_key,
            target_domain=target_domain,  # Pass target domain directly
            skip_personal_emails=skip_personal_emails  # Skip personal emails for recruiter search
        )
    
    email = verified_email_result.get('email')
    email_source = verified_email_result.get('email_source')
    email_verified = verified_email_result.get('email_verified', False)
    
    if email:
        contact['Email'] = email
        contact['EmailSource'] = email_source
        contact['EmailVerified'] = email_verified
        if email_source == 'hunter.io':
            # For Hunter emails, also store confidence score if available
            # (we'd need to modify get_verified_email to return this, but for now this is fine)
            print(f"✅ Hunter.io: Generated and verified {email} for {first_name} {last_name}")
        else:
            print(f"✅ PDL email verified: {email} for {first_name} {last_name}")
    else:
        # No email found
        contact['Email'] = "Not available"
        contact['EmailSource'] = None
        contact['EmailVerified'] = False
        print(f"❌ No email found for {first_name} {last_name}")
    
    return contact


def enrich_contacts_with_hunter(contacts: list, api_key: str = None, max_enrichments: int = None, target_company: str = None, skip_personal_emails: bool = False) -> list:
    """
    Enrich multiple contacts with Hunter.io using Email Finder API (1 API call per person).
    
    Args:
        contacts: List of contact dicts
        api_key: Hunter.io API key (optional)
        max_enrichments: Max number of Hunter API calls (to save credits)
        target_company: Target company name for batch processing summary (optional)
        skip_personal_emails: If True, skip personal email fallback (for recruiter search)
    
    Returns:
        List of contacts with emails enriched where possible
    """
    import time
    
    if not api_key:
        api_key = HUNTER_API_KEY
    
    if not api_key:
        print("⚠️ Hunter.io enrichment skipped - no API key")
        return contacts
    
    # Get target domain from target company
    target_domain = None
    if target_company:
        target_domain = get_company_domain(target_company)
    
    print(f"\n[BatchProcess] ==========================================")
    print(f"[BatchProcess] Starting email enrichment for {len(contacts)} contacts")
    if target_company:
        print(f"[BatchProcess] Target company: {target_company}")
        print(f"[BatchProcess] Target domain: {target_domain}")
    if skip_personal_emails:
        print(f"[BatchProcess] Skipping personal email fallback (recruiter search mode)")
    print(f"[BatchProcess] Two-pass mode: verified first, then unverified")
    print(f"[BatchProcess] ==========================================\n")
    
    # === PASS 1: Verify all contacts, separate into verified vs unverified ===
    print(f"[BatchProcess] === PASS 1: Verifying all contacts ===\n")
    
    verified_contacts = []
    unverified_contacts = []
    no_email_contacts = []
    enrichments_done = 0
    rate_limited = False
    
    # Track results for summary
    results = {
        "total": len(contacts),
        "pdl_verified": 0,
        "hunter_found": 0,
        "personal_fallback": 0,
        "no_email": 0,
        "emails": []
    }
    
    for i, contact in enumerate(contacts):
        print(f"\n[BatchProcess] --- Contact {i+1}/{len(contacts)} ---")
        
        first_name = contact.get('FirstName', '')
        last_name = contact.get('LastName', '')
        name = f"{first_name} {last_name}".strip()
        
        # ✅ VERIFY ALL EMAILS (including PDL emails) - no skipping
        # The enrich_contact_with_hunter function now verifies PDL emails before using them
        
        # Stop if we hit rate limit
        if rate_limited:
            print(f"⚠️ Stopping Hunter.io enrichment due to rate limit")
            no_email_contacts.append(contact)
            results["no_email"] += 1
            continue
        
        # Check if we've hit the enrichment limit
        if max_enrichments and enrichments_done >= max_enrichments:
            print(f"⚠️ Reached Hunter.io enrichment limit ({max_enrichments})")
            # Still try to process, but don't count towards enrichment limit
            # This allows us to verify PDL emails even if we've hit the limit
        
        # Track original email source
        original_email = contact.get('Email')
        original_email_source = contact.get('EmailSource')
        
        # Enrich this contact with target_domain
        enriched_contact = enrich_contact_with_hunter(
            contact, 
            api_key,
            target_domain=target_domain,  # Pass target domain
            skip_personal_emails=skip_personal_emails  # Skip personal emails for recruiter search
        )
        
        # Track results
        email = enriched_contact.get('Email')
        email_source = enriched_contact.get('EmailSource')
        email_verified = enriched_contact.get('EmailVerified', False)
        
        # Add is_verified_email flag for consistency
        enriched_contact['is_verified_email'] = email_verified
        
        if email and email != "Not available":
            results["emails"].append(email)
            
            # Separate into verified vs unverified
            if email_verified:
                verified_contacts.append(enriched_contact)
                print(f"✅ VERIFIED: {email} for {name}")
            else:
                unverified_contacts.append(enriched_contact)
                print(f"⚠️ UNVERIFIED (saved for fallback): {email} for {name}")
            
            # Track statistics
            if email_source == 'pdl':
                # Check if it was verified (PDL email that matched target domain)
                if original_email == email and original_email_source != 'hunter.io':
                    if email_verified:
                        results["pdl_verified"] += 1
                    else:
                        results["personal_fallback"] += 1
                else:
                    results["personal_fallback"] += 1
            elif email_source == 'hunter.io':
                results["hunter_found"] += 1
                if email_verified:
                    enrichments_done += 1
        else:
            no_email_contacts.append(enriched_contact)
            results["no_email"] += 1
            print(f"❌ No email found for {name}")
        
        # No preemptive delay - only sleep when actually rate limited (429)
    
    # === PASS 2: Combine results - verified first, then unverified ===
    print(f"\n[BatchProcess] === PASS 2: Combining results ===")
    print(f"[BatchProcess] Verified: {len(verified_contacts)}")
    print(f"[BatchProcess] Unverified: {len(unverified_contacts)}")
    print(f"[BatchProcess] No email: {len(no_email_contacts)}")
    
    # Combine: verified first, then unverified
    final_contacts = verified_contacts + unverified_contacts + no_email_contacts
    
    verified_count = sum(1 for c in final_contacts if c.get('is_verified_email', False))
    unverified_count = len([c for c in final_contacts if c.get('Email') and c.get('Email') != "Not available" and not c.get('is_verified_email', False)])
    
    # Print summary
    print(f"\n[BatchProcess] ==========================================")
    print(f"[BatchProcess] 📊 EMAIL ENRICHMENT SUMMARY")
    print(f"[BatchProcess] ==========================================")
    print(f"[BatchProcess] Total contacts: {results['total']}")
    print(f"[BatchProcess] Total returned: {len(final_contacts)}")
    print(f"[BatchProcess]   ├── Verified: {verified_count}")
    print(f"[BatchProcess]   └── Unverified: {unverified_count}")
    print(f"[BatchProcess] PDL emails verified: {results['pdl_verified']}")
    print(f"[BatchProcess] Hunter Email Finder found: {results['hunter_found']}")
    print(f"[BatchProcess] Personal email fallback: {results['personal_fallback']}")
    print(f"[BatchProcess] No email found: {results['no_email']}")
    success_rate = (100 * len(results['emails']) // results['total']) if results['total'] > 0 else 0
    print(f"[BatchProcess] Success rate: {len(results['emails'])}/{results['total']} ({success_rate}%)")
    print(f"[BatchProcess] ==========================================\n")
    
    return final_contacts


def verify_email_hunter(email: str, api_key: str = None, use_cache: bool = True) -> dict:
    """
    Verify an email address using Hunter.io with caching and rate limiting.
    
    Args:
        email: Email address to verify
        api_key: Hunter API key (optional)
        use_cache: Whether to use cached results (default: True)
    
    Returns:
        {
            'email': 'test@example.com',
            'status': 'valid',  # valid, invalid, unknown
            'score': 95,
            'accept_all': False,  # True if domain is catch-all
            'verification_status': 'success'  # success, rate_limited, unknown, error, auth_error
        }
        or None if verification fails completely
    """
    import time
    verify_start = time.time()
    
    if not api_key:
        api_key = HUNTER_API_KEY
    
    if not api_key:
        return None
    
    # ✅ ISSUE 2 FIX: Check cache with TTL validation
    if use_cache:
        with _verification_cache_lock:
            if email in _email_verification_cache:
                cached_result, timestamp = _email_verification_cache[email]
                if time.time() - timestamp < CACHE_TTL:
                    cache_time = time.time() - verify_start
                    print(f"📦 ⏱️  Using cached verification ({cache_time*1000:.0f}ms) for {email}: score={cached_result.get('score', 'N/A')}")
                    return cached_result
                else:
                    # Cache expired, remove it
                    del _email_verification_cache[email]
    
    # Only sleep when actually rate limited (429), not preemptively
    url = "https://api.hunter.io/v2/email-verifier"
    params = {
        'email': email,
        'api_key': api_key
    }
    
    max_retries = 3
    last_was_rate_limit = False
    
    for attempt in range(max_retries):
        try:
            api_start = time.time()
            response = requests.get(url, params=params, timeout=10)
            api_time = time.time() - api_start
        
            # Handle rate limit (429) - actual rate limit, wait and retry
            if response.status_code == 429:
                last_was_rate_limit = True
                wait_time = (2 ** attempt) * 1  # 1s, 2s, 4s
                print(f"⚠️ Hunter.io rate limited (429), waiting {wait_time}s before retry {attempt + 1}/{max_retries}...")
                time.sleep(wait_time)
                continue
            
            last_was_rate_limit = False
            
            # Handle unauthorized (401) - API key issue, stop everything
            if response.status_code == 401:
                print(f"❌ Hunter.io API key invalid (401)!")
                return {
                    'status': 'error',
                    'score': 0,
                    'verification_status': 'auth_error'
                }
            
            # Handle successful response (200)
            if response.status_code == 200:
                data = response.json()
                
                # Check for errors in response body (e.g., error code 222)
                if "errors" in data:
                    error_code = data.get("errors", [{}])[0].get("code", 0)
                    
                    if error_code == 222:
                        # Unable to verify - not a rate limit, just uncertain
                        print(f"⚠️ Hunter couldn't verify {email} (code 222 - uncertain)")
                        return {
                            'status': 'unknown',
                            'score': 50,  # Return middling score
                            'verification_status': 'unknown'
                        }
                    
                    print(f"⚠️ Hunter error {error_code} for {email}")
                    return {
                        'status': 'error',
                        'score': 0,
                        'verification_status': 'error'
                    }
                
                result = data.get('data', {})
                if result:
                    # Add verification_status to successful results
                    result['verification_status'] = 'success'
                    
                    # Cache the result
                    if use_cache:
                        with _verification_cache_lock:
                            # ✅ ISSUE 2 FIX: Cache with timestamp
                            _email_verification_cache[email] = (result, time.time())
                    
                    return result
                else:
                    # No data in response
                    print(f"⚠️ Hunter.io verify returned no data for {email}")
                    return {
                        'status': 'unknown',
                        'score': 0,
                        'verification_status': 'error'
                    }
            
            # Handle other HTTP errors (400, 500, etc.)
            if response.status_code == 400:
                print(f"⚠️ Hunter.io bad request (400) for {email}")
                return {
                    'status': 'error',
                    'score': 0,
                    'verification_status': 'error'
                }
            
            # Other status codes
            print(f"⚠️ Hunter.io verify API error {response.status_code} for {email}")
            return {
                'status': 'error',
                'score': 0,
                'verification_status': 'error'
            }
        
        except requests.exceptions.Timeout:
            print(f"⚠️ Hunter.io verify timeout for {email}")
            if attempt < max_retries - 1:
                wait_time = (2 ** attempt) * 1
                time.sleep(wait_time)
                continue
            return {
                'status': 'error',
                'score': 0,
                'verification_status': 'error'
            }
        except Exception as e:
            print(f"⚠️ Hunter.io verify error for {email}: {e}")
            if attempt < max_retries - 1:
                wait_time = (2 ** attempt) * 1
                time.sleep(wait_time)
                continue
            return {
                'status': 'error',
                'score': 0,
                'verification_status': 'error'
            }
    
    # All retries exhausted - check if last error was rate limit
    if last_was_rate_limit:
        return {
            'status': 'error',
            'score': 0,
            'verification_status': 'rate_limited'
        }
    
    # All retries exhausted for other reasons
    return {
        'status': 'error',
        'score': 0,
        'verification_status': 'error'
    }


def extract_company_domain_from_person_data(
    pdl_email: str | None,
    person_data: dict = None,
    company_name: str = None
) -> str:
    """
    Extract the correct company domain from PDL email or person data.
    Prioritizes: PDL email domain (if work email) > company website > company name.
    
    Args:
        pdl_email: Email from PDL (can be None)
        person_data: Full PDL person data dict (optional)
        company_name: Company name as fallback (optional)
    
    Returns:
        Company domain string or None
    """
    # Priority 1: Extract domain from PDL email (if it's a work email)
    if pdl_email and "@" in pdl_email:
        email_domain = pdl_email.split("@")[1].lower().strip()
        if not is_personal_email_domain(email_domain):
            print(f"📧 Extracted company domain from PDL email: {email_domain}")
            return email_domain
    
    # Priority 2: Extract domain from company website in person data
    if person_data:
        # Check current job company website
        experience = person_data.get('experience', [])
        if experience and isinstance(experience, list) and len(experience) > 0:
            current_job = experience[0]
            if isinstance(current_job, dict):
                company_info = current_job.get('company', {})
                if isinstance(company_info, dict):
                    company_website = company_info.get('website', '') or company_info.get('url', '')
                    if company_website:
                        domain = extract_domain_from_url(company_website)
                        if domain and not is_personal_email_domain(domain):
                            print(f"🌐 Extracted company domain from website: {domain}")
                            return domain
    
    # Priority 3: Use company name to guess domain
    if company_name:
        domain = get_company_domain(company_name)
        if domain and not is_personal_email_domain(domain):
            print(f"🏢 Extracted company domain from name: {domain}")
            return domain
    
    return None


def get_verified_email(
    pdl_email: str | None,
    first_name: str,
    last_name: str,
    company: str,
    person_data: dict = None,
    api_key: str = None,
    target_domain: str = None,
    skip_personal_emails: bool = False
) -> dict:
    """
    Get a verified email address using Hunter's Email Finder API (1 API call instead of 10+).
    PRIORITIZES WORK EMAILS FROM TARGET COMPANY OVER OLD JOB/PERSONAL EMAILS.
    
    Flow:
    1. If PDL email exists and matches target company domain → verify it
    2. Use Hunter Email Finder API to find email at target company (ONE API call instead of pattern generation)
    3. Fall back to personal email if available (unless skip_personal_emails=True)
    
    Args:
        pdl_email: Email from PDL (can be None)
        first_name: First name for email generation
        last_name: Last name for email generation
        company: Company name (used to determine domain if target_domain not provided)
        person_data: Full PDL person data dict (optional, used to extract correct domain)
        api_key: Hunter API key (optional, uses env var if not provided)
        target_domain: Target company domain (e.g., "tiktok.com") - if provided, used directly instead of extracting
        skip_personal_emails: If True, skip personal email fallback (for recruiter search)
    
    Returns:
        {
            'email': 'verified@example.com' or None,
            'email_verified': True/False,
            'email_source': 'pdl' or 'hunter.io' or None
        }
    """
    full_name = f"{first_name} {last_name}".strip()
    
    print(f"\n[EmailVerification] ========== Processing: {full_name} ==========")
    print(f"[EmailVerification] Target company: {company}")
    print(f"[EmailVerification] PDL email: {pdl_email}")
    print(f"[EmailVerification] First name: {first_name}, Last name: {last_name}")
    
    if not api_key:
        api_key = HUNTER_API_KEY
    
    if not api_key:
        print("⚠️ Hunter.io API key not configured, cannot verify emails")
        return {
            'email': pdl_email if pdl_email and pdl_email != "Not available" else None,
            'email_verified': False,
            'email_source': 'pdl' if pdl_email and pdl_email != "Not available" else None
        }
    
    # Use provided target_domain, or extract from company name
    if not target_domain:
        target_domain = get_company_domain(company)
        print(f"[EmailVerification] Target domain (from company name): {target_domain}")
    else:
        print(f"[EmailVerification] Using provided target domain: {target_domain}")
    
    # Step 1: Only verify PDL email if it matches target company domain
    if pdl_email and pdl_email != "Not available" and "@" in pdl_email and target_domain:
        pdl_email_domain = pdl_email.split("@")[1].lower().strip()
        target_domain_lower = target_domain.lower().strip()
        
        # Check if PDL email domain matches target domain (exact match or target is substring)
        # e.g., "tiktok.com" matches "tiktok.com" or "mail.tiktok.com"
        domain_matches = (
            pdl_email_domain == target_domain_lower or
            pdl_email_domain.endswith(f".{target_domain_lower}") or
            target_domain_lower.endswith(f".{pdl_email_domain}")
        )
        
        if domain_matches:
            # PDL email is from target company - verify it
            print(f"[EmailVerification] ✅ PDL email matches target domain, verifying...")
            verification = verify_email_hunter(pdl_email, api_key)
            score = verification.get("score", 0) if verification else 0
            status = verification.get("status", "unknown") if verification else "unknown"
            print(f"[EmailVerification] PDL email verification - score: {score}, status: {status}")
            
            if score >= 80:
                print(f"[EmailVerification] ✅ PDL email verified: {pdl_email}")
                return {
                    'email': pdl_email,
                    'email_verified': True,
                    'email_source': 'pdl'
                }
            else:
                # Return unverified email anyway (for two-pass system)
                print(f"[EmailVerification] ⚠️ PDL email failed verification (score: {score}), returning as unverified")
                return {
                    'email': pdl_email,
                    'email_verified': False,
                    'email_source': 'pdl'
                }
        else:
            # PDL email is from OLD JOB - skip it entirely, use Hunter
            print(f"[EmailVerification] ⚠️ PDL email is from {pdl_email_domain}, not {target_domain} - SKIPPING")
    else:
        if pdl_email:
            print(f"[EmailVerification] ⚠️ PDL email domain doesn't match target ({pdl_email} vs {target_domain})")
        else:
            print(f"[EmailVerification] No PDL email available")
    
    # Step 2: Use Hunter Email Finder with TARGET domain (not old job domain)
    if target_domain and first_name and last_name:
        print(f"[EmailVerification] Using Hunter Email Finder with target domain: {target_domain}")
        email, score = find_email_with_hunter(first_name, last_name, target_domain, api_key)
        if email:
            print(f"[EmailVerification] ✅ Hunter found email: {email} (score: {score})")
            return {
                'email': email,
                'email_verified': True,
                'email_source': 'hunter.io'
            }
        else:
            print(f"[EmailVerification] Hunter Email Finder returned no results")
    else:
        print(f"[EmailVerification] ⚠️ Cannot use Email Finder - missing: domain={target_domain}, first={first_name}, last={last_name}")
    
    # Step 2b: FALLBACK - Generate email using company pattern when Hunter Email Finder returns no results
    if target_domain and first_name and last_name:
        print(f"[EmailVerification] Hunter returned no results, trying pattern generation fallback...")
        
        # Get company's email pattern from Hunter Domain Search
        pattern = get_domain_pattern(target_domain, api_key)
        if pattern:
            generated_email = generate_email_from_pattern(first_name, last_name, target_domain, pattern)
            
            # Verify the generated email
            print(f"[EmailVerification] Verifying generated email: {generated_email}")
            verification = verify_email_hunter(generated_email, api_key)
            score = verification.get("score", 0) if verification else 0
            status = verification.get("status", "unknown") if verification else "unknown"
            accept_all = verification.get("accept_all", False) if verification else False
            
            print(f"[EmailVerification] Generated {generated_email} - score: {score}, status: {status}, accept_all: {accept_all}")
            
            # Accept if valid with decent score, or accept_all with higher score
            if status == "valid" and score >= 70:
                print(f"[EmailVerification] ✅ Generated email verified: {generated_email}")
                return {
                    'email': generated_email,
                    'email_verified': True,
                    'email_source': 'hunter.io'  # Pattern-based but verified via Hunter
                }
            elif accept_all and status == "accept_all" and score >= 75:
                print(f"[EmailVerification] ✅ Generated email accepted (accept_all): {generated_email}")
                return {
                    'email': generated_email,
                    'email_verified': True,
                    'email_source': 'hunter.io'  # Pattern-based but verified via Hunter
                }
            else:
                # Return unverified email anyway (for two-pass system)
                print(f"[EmailVerification] ⚠️ Generated email failed verification (score: {score}, status: {status}), returning as unverified")
                return {
                    'email': generated_email,
                    'email_verified': False,
                    'email_source': 'hunter.io'  # Pattern-based but unverified
                }
        else:
            print(f"[EmailVerification] ⚠️ No email pattern found for domain: {target_domain}")
            # Try fallback pattern generation
            if first_name and last_name:
                fallback_email = f"{first_name[0].lower()}{last_name.lower()}@{target_domain}"
                print(f"[EmailVerification] ⚠️ Using fallback pattern (unverified): {fallback_email}")
                return {
                    'email': fallback_email,
                    'email_verified': False,
                    'email_source': 'hunter.io'
                }
    
    # Step 3: Fall back to personal email if available (unless skip_personal_emails=True)
    if not skip_personal_emails and pdl_email and pdl_email != "Not available" and "@" in pdl_email:
        pdl_email_domain = pdl_email.split("@")[1].lower().strip()
        if is_personal_email_domain(pdl_email_domain):
            print(f"[EmailVerification] Trying personal email fallback: {pdl_email}")
            verification = verify_email_hunter(pdl_email, api_key)
            score = verification.get("score", 0) if verification else 0
            status = verification.get("status", "unknown") if verification else "unknown"
            print(f"[EmailVerification] Personal email verification - score: {score}, status: {status}")
            
            if score >= 85:
                print(f"[EmailVerification] ✅ Personal email verified: {pdl_email}")
                return {
                    'email': pdl_email,
                    'email_verified': True,
                    'email_source': 'pdl'
                }
            else:
                print(f"[EmailVerification] ⚠️ Personal email failed verification (score: {score})")
    elif skip_personal_emails and pdl_email and "@" in pdl_email:
        pdl_email_domain = pdl_email.split("@")[1].lower().strip()
        if is_personal_email_domain(pdl_email_domain):
            print(f"[EmailVerification] ⚠️ Skipping personal email fallback (skip_personal_emails=True)")
    
    print(f"[EmailVerification] ❌ No valid email found for {full_name}")
    return {
        'email': None,
        'email_verified': False,
        'email_source': None
    }


# ✅ FIX #1: Batch email verification with aggressive caching
def batch_verify_emails_for_contacts(contacts: list, target_company: str = None) -> dict:
    """
    Batch verify emails for multiple contacts efficiently.
    Uses pre-computed domain patterns and generates emails without parallel Hunter API calls.
    
    Args:
        contacts: List of contact dicts with:
            - 'FirstName'/'firstName' or 'first_name': First name
            - 'LastName'/'lastName' or 'last_name': Last name
            - 'Company'/'company': Company name
            - 'Email'/'WorkEmail'/'PersonalEmail' or 'pdl_email': PDL email
        target_company: Target company name (if searching for specific company)
    
    Returns:
        {contact_index: {'email': str, 'verified': bool, 'source': str}}
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed
    import time
    
    if not contacts:
        return {}
    
    print(f"\n[BatchEmailVerification] ⚡ Starting batch verification for {len(contacts)} contacts...")
    batch_start = time.time()
    
    # Step 1: Collect all unique domains and pre-fetch patterns in parallel
    unique_domains = set()
    contact_domain_map = {}  # contact_index -> domain
    
    for i, contact in enumerate(contacts):
        # Support multiple contact formats
        company = target_company or contact.get('Company', '') or contact.get('company', '')
        if company:
            domain = get_smart_company_domain(company)
            if domain:
                unique_domains.add(domain)
                contact_domain_map[i] = domain
    
    # Pre-fetch ALL domain patterns in parallel (one API call per domain, not per contact)
    print(f"[BatchEmailVerification] 🔍 Pre-fetching {len(unique_domains)} unique domain patterns...")
    domain_patterns = {}
    if unique_domains:
        with ThreadPoolExecutor(max_workers=min(5, len(unique_domains))) as executor:
            pattern_futures = {
                executor.submit(get_domain_pattern, domain): domain
                for domain in unique_domains
            }
            for future in as_completed(pattern_futures):
                domain = pattern_futures[future]
                try:
                    pattern = future.result()
                    if pattern:
                        domain_patterns[domain] = pattern
                        print(f"[BatchEmailVerification] ✅ Cached pattern for {domain}: {pattern}")
                except Exception as e:
                    print(f"[BatchEmailVerification] ⚠️ Failed to get pattern for {domain}: {e}")
    
    # Step 2: Find emails via WATERFALL per contact, parallelized
    #   T1: PDL work email that matches current target domain   → free, verified
    #   T2: Hunter Email Finder (real lookup)                   → ~$0.003 per HIT, $0 on miss
    #   T3: Pattern synthesis from cached domain pattern        → unverified, last resort
    # Hunter doesn't charge for no-match results, so calling Email Finder for
    # every contact bounds spend at ≤ N hits * $0.003, not N * $0.003.
    results = {}

    MIN_FINDER_SCORE = 80  # High-confidence threshold per Hunter docs
    RISKY_FINDER_SCORE = 70  # 70-79 = usable but flag as not-verified

    def _resolve_one(i, contact):
        first_name = (contact.get('FirstName', '') or contact.get('firstName', '') or contact.get('first_name', '') or '').strip()
        last_name = (contact.get('LastName', '') or contact.get('lastName', '') or contact.get('last_name', '') or '').strip()
        company = target_company or contact.get('Company', '') or contact.get('company', '')
        pdl_email = (contact.get('Email') or contact.get('WorkEmail') or contact.get('PersonalEmail') or contact.get('pdl_email') or '').strip()

        if not first_name or not last_name:
            return i, {'email': None, 'verified': False, 'source': None}

        domain = contact_domain_map.get(i)
        if not domain and company:
            domain = get_smart_company_domain(company)

        # T1: PDL email already at current company → free, trusted
        if pdl_email and pdl_email != "Not available" and '@' in pdl_email:
            pdl_domain = pdl_email.split('@')[1].lower().strip()
            if domain and pdl_domain == domain.lower():
                return i, {'email': pdl_email, 'verified': True, 'source': 'pdl', 'score': 100}

        # T2: Hunter Email Finder. Returns (email, score) where email is None
        # if score < 70 OR no match. Hunter does NOT charge on no-match.
        # score == -1 sentinel means Hunter rate-limited us (Phase 2.5).
        finder_rate_limited = False
        if domain and first_name and last_name:
            try:
                finder_email, finder_score = find_email_with_hunter(first_name, last_name, domain)
                if finder_email and finder_score >= MIN_FINDER_SCORE:
                    return i, {'email': finder_email, 'verified': True, 'source': 'hunter_finder', 'score': finder_score}
                if finder_email and finder_score >= RISKY_FINDER_SCORE:
                    # Usable but flag as not-verified so caller can decide
                    return i, {'email': finder_email, 'verified': False, 'source': 'hunter_finder_risky', 'score': finder_score}
                if finder_score == -1:
                    finder_rate_limited = True
            except Exception as e:
                print(f"[BatchEmailVerification] Hunter Email Finder failed for contact {i}: {e}")

        # Phase 2.5: if Hunter was rate-limited, stop here — do NOT synthesize a
        # pattern guess. Pattern guesses on a 429 silently inflate the bounce
        # rate because the user thinks Hunter cleared the address.
        if finder_rate_limited:
            return i, {'email': None, 'verified': False, 'source': None, 'score': 0, 'reason': 'hunter_rate_limited'}

        # T3: Pattern synthesis from cached domain pattern (unverified)
        if domain and domain in domain_patterns:
            pattern = domain_patterns[domain]
            generated_email = generate_email_from_pattern(first_name, last_name, domain, pattern)
            return i, {'email': generated_email, 'verified': False, 'source': 'pattern', 'score': 0}

        # T4: Generic first.last@domain fallback (least reliable)
        if domain:
            fallback_email = f"{first_name.lower()}.{last_name.lower()}@{domain}"
            return i, {'email': fallback_email, 'verified': False, 'source': 'domain_generated', 'score': 0}

        # T5: Fall back to PDL email (any domain) only when no target domain
        if pdl_email and pdl_email != "Not available":
            return i, {'email': pdl_email, 'verified': False, 'source': 'pdl_fallback', 'score': 0}

        return i, {'email': None, 'verified': False, 'source': None}

    print(f"[BatchEmailVerification] 🔎 Running Hunter Email Finder for {len(contacts)} contacts in parallel...")
    with ThreadPoolExecutor(max_workers=min(6, max(1, len(contacts)))) as ex:
        futures = [ex.submit(_resolve_one, i, c) for i, c in enumerate(contacts)]
        for fut in as_completed(futures):
            try:
                idx, payload = fut.result()
                results[idx] = payload
            except Exception as e:
                print(f"[BatchEmailVerification] worker error: {e}")

    # ---- NeverBounce upgrade pass --------------------------------------
    # Run SMTP verification on low-confidence emails (pattern synth,
    # hunter_finder_risky, domain_generated). Upgrades best-guesses to
    # SMTP-verified. Graceful no-op if NEVERBOUNCE_API_KEY is unset.
    try:
        from app.services import neverbounce_client
        if neverbounce_client.is_configured():
            NB_UPGRADE_SOURCES = {"pattern", "domain_generated", "hunter_finder_risky"}
            upgrade_indices = [
                i for i, r in results.items()
                if r.get("source") in NB_UPGRADE_SOURCES and r.get("email")
            ]
            if upgrade_indices:
                print(f"[BatchEmailVerification] 🛡️  NeverBounce upgrade pass for {len(upgrade_indices)} low-confidence emails...")

                def _nb_upgrade(idx):
                    r = results[idx]
                    nb = neverbounce_client.verify_email(r["email"], timeout=5.0)
                    nb_result = nb.get("result")
                    if nb_result == neverbounce_client.RESULT_VALID:
                        return idx, {**r, "source": "neverbounce_verified", "verified": True, "score": max(int(r.get("score") or 0), 90)}
                    if nb_result in (neverbounce_client.RESULT_ACCEPT_ALL, neverbounce_client.RESULT_CATCHALL):
                        # Phase 2.3: catch-all domains accept everything at SMTP
                        # but silently drop or bounce later. Treat them as
                        # invalid for draft purposes — better to surface the
                        # contact with no email than to ship a guess that
                        # routes to /dev/null.
                        return idx, {"email": None, "verified": False, "source": None, "score": 0}
                    if nb_result == neverbounce_client.RESULT_INVALID:
                        # Drop invalid emails entirely — don't draft to a dead inbox
                        return idx, {"email": None, "verified": False, "source": None, "score": 0}
                    # unknown / disposable — leave the original payload untouched
                    return idx, r

                with ThreadPoolExecutor(max_workers=min(6, max(1, len(upgrade_indices)))) as nb_ex:
                    nb_futures = [nb_ex.submit(_nb_upgrade, i) for i in upgrade_indices]
                    for fut in as_completed(nb_futures):
                        try:
                            idx, updated = fut.result()
                            results[idx] = updated
                        except Exception as e:
                            print(f"[BatchEmailVerification] NeverBounce worker error: {e}")
    except Exception as e:
        # NeverBounce module import or any other failure: continue without the
        # upgrade pass. Pattern emails stay at source='pattern'.
        print(f"[BatchEmailVerification] NeverBounce upgrade pass skipped: {e}")

    batch_time = time.time() - batch_start
    email_count = sum(1 for r in results.values() if r.get('email'))
    verified_count = sum(1 for r in results.values() if r.get('verified'))
    by_source = {}
    for r in results.values():
        s = r.get('source') or 'none'
        by_source[s] = by_source.get(s, 0) + 1
    print(f"[BatchEmailVerification] ✅ Batch complete: {batch_time:.2f}s for {len(contacts)} contacts ({email_count} emails, {verified_count} verified). By source: {by_source}")

    return results


def get_verified_email_with_alternates(
    pdl_email: str | None,
    first_name: str,
    last_name: str,
    company: str,
    person_data: dict = None,
    api_key: str = None,
    target_domain: str = None,
    skip_personal_emails: bool = False
) -> dict:
    """
    Get verified email with support for alternate domains (e.g., TikTok employees might use bytedance.com).
    
    Tries primary domain first, then alternate domains if available.
    
    Args:
        Same as get_verified_email()
    
    Returns:
        Same as get_verified_email()
    """
    # Try primary domain first
    result = get_verified_email(
        pdl_email=pdl_email,
        first_name=first_name,
        last_name=last_name,
        company=company,
        person_data=person_data,
        api_key=api_key,
        target_domain=target_domain,
        skip_personal_emails=skip_personal_emails
    )
    
    # If we found an email, return it
    if result.get('email'):
        return result
    
    # If no email found and we have a target_domain, try alternate domains
    if target_domain:
        alternates = COMPANY_ALTERNATE_DOMAINS.get(target_domain.lower(), [])
        for alt_domain in alternates:
            print(f"[EmailVerification] Trying alternate domain: {alt_domain}")
            alt_result = get_verified_email(
                pdl_email=pdl_email,
                first_name=first_name,
                last_name=last_name,
                company=company,
                person_data=person_data,
                api_key=api_key,
                target_domain=alt_domain,
                skip_personal_emails=skip_personal_emails
            )
            if alt_result.get('email'):
                print(f"[EmailVerification] ✅ Found email on alternate domain: {alt_domain}")
                return alt_result
    
    # No email found on any domain
    return result


if __name__ == "__main__":
    # Test the integration
    print("Testing Hunter.io integration...")
    
    test_contact = {
        'FirstName': 'John',
        'LastName': 'Smith',
        'Company': 'Bain & Company',
        'Email': 'Not available'
    }
    
    enriched = enrich_contact_with_hunter(test_contact)
    print(f"\nTest result: {enriched}")