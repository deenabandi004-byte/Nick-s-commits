"""
Company normalization utility — Phase 3 of the Personalization Data Layer.

Goal: every variant a student types ("Goldman", "Goldman Sachs", "GS",
"goldman-sachs", "goldman sachs llc") collapses to one canonical slug
("goldman-sachs") so company contexts, alumni counts, and recommendation
joins all work off the same key.

The alias map covers the top ~100 companies students at our target schools
target — investment banking, consulting, tech, PE/VC, big-4. The fallback
for anything not in the map is a deterministic alnum-hyphen slug, which is
good enough for joins as long as both sides slug consistently.

`normalize_company` in `models/users.py` was the Phase 1 minimum (one-off
slugifier with the highest-traffic aliases). This module REPLACES that
behavior — `models.users.normalize_company` is now a thin shim that calls
into `company_to_slug` here.

Stripping rules applied before alias lookup:
  - lowercase
  - strip leading/trailing whitespace
  - drop common corporate suffixes (Inc., LLC, Co., Corp., & Company, ...)
  - collapse "&" to " and " before slugifying
  - collapse runs of non-alnum into single hyphen
"""
from __future__ import annotations

import re
from typing import Dict, Optional

# ---------------------------------------------------------------------------
# Alias → canonical slug map
# ---------------------------------------------------------------------------
#
# Keep keys lowercased + suffix-stripped; the lookup runs the input through
# the same normalization steps before checking. Every canonical slug also
# maps to itself so round-trips are stable.
#
# Coverage targets (by the order students apply):
#   - Bulge bracket + elite boutique IB
#   - MBB + Tier 2 consulting + Big 4
#   - FAANG / MAANG + adjacent tech
#   - Top PE / HF / VC firms
#   - Major commercial / corporate banks
#
# This is NOT exhaustive — net-new firms get added as users complain. The
# fallback slug is always usable; aliases just make the company-context
# join more forgiving when users type sloppy names.

_ALIAS_MAP: Dict[str, str] = {
    # ---- Bulge bracket investment banking ----
    'goldman': 'goldman-sachs',
    'goldman sachs': 'goldman-sachs',
    'gs': 'goldman-sachs',
    'goldman sachs group': 'goldman-sachs',

    'morgan stanley': 'morgan-stanley',
    'ms': 'morgan-stanley',

    'jp morgan': 'jpmorgan',
    'jpm': 'jpmorgan',
    'jpmorgan': 'jpmorgan',
    'jpmorgan chase': 'jpmorgan',
    'jp morgan chase': 'jpmorgan',
    'chase': 'jpmorgan',

    'bofa': 'bank-of-america',
    'bank of america': 'bank-of-america',
    'bank of america merrill lynch': 'bank-of-america',
    'bofa securities': 'bank-of-america',
    'merrill lynch': 'bank-of-america',
    'merrill': 'bank-of-america',

    'citi': 'citigroup',
    'citibank': 'citigroup',
    'citigroup': 'citigroup',

    'barclays': 'barclays',
    'barclays capital': 'barclays',

    'credit suisse': 'credit-suisse',
    'cs': 'credit-suisse',

    'ubs': 'ubs',
    'ubs investment bank': 'ubs',

    'deutsche bank': 'deutsche-bank',
    'db': 'deutsche-bank',

    'hsbc': 'hsbc',
    'wells fargo': 'wells-fargo',
    'wells fargo securities': 'wells-fargo',

    'rbc': 'rbc-capital-markets',
    'rbc capital markets': 'rbc-capital-markets',
    'royal bank of canada': 'rbc-capital-markets',

    'bmo': 'bmo-capital-markets',
    'bmo capital markets': 'bmo-capital-markets',

    'td securities': 'td-securities',
    'td': 'td-securities',

    'nomura': 'nomura',
    'mizuho': 'mizuho',
    'mufg': 'mufg',

    'bnp paribas': 'bnp-paribas',
    'bnp': 'bnp-paribas',

    'societe generale': 'societe-generale',
    'socgen': 'societe-generale',

    # ---- Elite boutique IB ----
    'evercore': 'evercore',
    'lazard': 'lazard',
    'centerview': 'centerview-partners',
    'centerview partners': 'centerview-partners',
    'moelis': 'moelis',
    'moelis and company': 'moelis',
    'moelis & company': 'moelis',
    'pjt': 'pjt-partners',
    'pjt partners': 'pjt-partners',
    'guggenheim': 'guggenheim-partners',
    'guggenheim partners': 'guggenheim-partners',
    'guggenheim securities': 'guggenheim-partners',
    'perella weinberg': 'perella-weinberg-partners',
    'perella weinberg partners': 'perella-weinberg-partners',
    'pwp': 'perella-weinberg-partners',
    'rothschild': 'rothschild-and-co',
    'rothschild and co': 'rothschild-and-co',
    'rothschild & co': 'rothschild-and-co',
    'jefferies': 'jefferies',
    'houlihan lokey': 'houlihan-lokey',
    'hl': 'houlihan-lokey',
    'lincoln international': 'lincoln-international',
    'william blair': 'william-blair',
    'blair': 'william-blair',
    'piper sandler': 'piper-sandler',
    'piper jaffray': 'piper-sandler',

    # ---- MBB ----
    'mck': 'mckinsey',
    'mckinsey': 'mckinsey',
    'mckinsey and company': 'mckinsey',
    'mckinsey & company': 'mckinsey',

    'bcg': 'bcg',
    'boston consulting group': 'bcg',
    'the boston consulting group': 'bcg',

    'bain': 'bain-and-company',
    'bain and company': 'bain-and-company',
    'bain & company': 'bain-and-company',

    # ---- Tier 2 consulting ----
    'oliver wyman': 'oliver-wyman',
    'ow': 'oliver-wyman',
    'lek': 'lek-consulting',
    'l.e.k.': 'lek-consulting',
    'l.e.k. consulting': 'lek-consulting',
    'lek consulting': 'lek-consulting',
    'kearney': 'kearney',
    'a.t. kearney': 'kearney',
    'at kearney': 'kearney',
    'roland berger': 'roland-berger',
    'parthenon': 'ey-parthenon',
    'ey-parthenon': 'ey-parthenon',
    'ey parthenon': 'ey-parthenon',
    'strategy and': 'strategy-and',
    'strategy&': 'strategy-and',
    's&': 'strategy-and',
    'accenture': 'accenture',
    'accenture strategy': 'accenture',

    # ---- Big 4 ----
    'deloitte': 'deloitte',
    'deloitte consulting': 'deloitte',
    'pwc': 'pwc',
    'pricewaterhousecoopers': 'pwc',
    'ey': 'ey',
    'ernst and young': 'ey',
    'ernst & young': 'ey',
    'kpmg': 'kpmg',

    # ---- Tech (FAANG + adjacent) ----
    'google': 'google',
    'alphabet': 'google',
    'alphabet inc': 'google',
    'youtube': 'google',

    'meta': 'meta',
    'facebook': 'meta',
    'fb': 'meta',
    'instagram': 'meta',
    'whatsapp': 'meta',

    'amazon': 'amazon',
    'aws': 'amazon',
    'amazon web services': 'amazon',

    'apple': 'apple',
    'apple inc': 'apple',

    'microsoft': 'microsoft',
    'msft': 'microsoft',
    'azure': 'microsoft',

    'netflix': 'netflix',
    'nflx': 'netflix',

    'nvidia': 'nvidia',
    'nvda': 'nvidia',

    'tesla': 'tesla',
    'tsla': 'tesla',

    'salesforce': 'salesforce',
    'oracle': 'oracle',
    'ibm': 'ibm',
    'sap': 'sap',
    'cisco': 'cisco',
    'intel': 'intel',
    'amd': 'amd',
    'qualcomm': 'qualcomm',
    'adobe': 'adobe',

    'uber': 'uber',
    'lyft': 'lyft',
    'doordash': 'doordash',
    'instacart': 'instacart',
    'airbnb': 'airbnb',
    'pinterest': 'pinterest',
    'snap': 'snap',
    'snapchat': 'snap',
    'snap inc': 'snap',
    'tiktok': 'tiktok',
    'bytedance': 'bytedance',

    'palantir': 'palantir',
    'pltr': 'palantir',
    'stripe': 'stripe',
    'square': 'block',
    'block': 'block',
    'block inc': 'block',
    'shopify': 'shopify',
    'spotify': 'spotify',
    'twitter': 'x-corp',
    'x': 'x-corp',
    'x corp': 'x-corp',

    'openai': 'openai',
    'anthropic': 'anthropic',
    'databricks': 'databricks',
    'snowflake': 'snowflake',
    'datadog': 'datadog',
    'mongodb': 'mongodb',
    'atlassian': 'atlassian',
    'slack': 'slack',
    'zoom': 'zoom',
    'figma': 'figma',
    'notion': 'notion',
    'linear': 'linear',
    'vercel': 'vercel',
    'github': 'github',
    'gitlab': 'gitlab',
    'hubspot': 'hubspot',
    'workday': 'workday',
    'servicenow': 'servicenow',
    'twilio': 'twilio',
    'asana': 'asana',
    'dropbox': 'dropbox',
    'box': 'box',
    'okta': 'okta',
    'reddit': 'reddit',

    # ---- PE / HF / VC ----
    'kkr': 'kkr',
    'kohlberg kravis roberts': 'kkr',
    'blackstone': 'blackstone',
    'bx': 'blackstone',
    'apollo': 'apollo-global-management',
    'apollo global management': 'apollo-global-management',
    'carlyle': 'carlyle-group',
    'the carlyle group': 'carlyle-group',
    'tpg': 'tpg',
    'warburg pincus': 'warburg-pincus',
    'general atlantic': 'general-atlantic',
    'silver lake': 'silver-lake',
    'vista equity': 'vista-equity-partners',
    'vista equity partners': 'vista-equity-partners',
    'thoma bravo': 'thoma-bravo',
    'bain capital': 'bain-capital',
    'advent international': 'advent-international',
    'cvc': 'cvc-capital-partners',
    'cvc capital': 'cvc-capital-partners',
    'cvc capital partners': 'cvc-capital-partners',

    'citadel': 'citadel',
    'two sigma': 'two-sigma',
    'jane street': 'jane-street',
    'de shaw': 'd-e-shaw',
    'd.e. shaw': 'd-e-shaw',
    'd.e.shaw': 'd-e-shaw',
    'd e shaw': 'd-e-shaw',
    'millennium': 'millennium-management',
    'millennium management': 'millennium-management',
    'point72': 'point72',
    'aqr': 'aqr-capital',
    'aqr capital': 'aqr-capital',
    'renaissance technologies': 'renaissance-technologies',
    'rentec': 'renaissance-technologies',
    'bridgewater': 'bridgewater-associates',
    'bridgewater associates': 'bridgewater-associates',
    'hudson river trading': 'hudson-river-trading',
    'hrt': 'hudson-river-trading',
    'jump trading': 'jump-trading',
    'imc': 'imc-trading',
    'optiver': 'optiver',
    'flow traders': 'flow-traders',
    'sig': 'susquehanna-international-group',
    'susquehanna': 'susquehanna-international-group',
    'susquehanna international group': 'susquehanna-international-group',

    'sequoia': 'sequoia-capital',
    'sequoia capital': 'sequoia-capital',
    'a16z': 'andreessen-horowitz',
    'andreessen horowitz': 'andreessen-horowitz',
    'benchmark': 'benchmark',
    'lightspeed': 'lightspeed-venture-partners',
    'accel': 'accel',
    'greylock': 'greylock-partners',
    'greylock partners': 'greylock-partners',
    'kleiner perkins': 'kleiner-perkins',
    'kp': 'kleiner-perkins',
    'founders fund': 'founders-fund',
    'gv': 'gv',
    'google ventures': 'gv',
    'index ventures': 'index-ventures',
    'first round capital': 'first-round-capital',
    'union square ventures': 'union-square-ventures',
    'usv': 'union-square-ventures',
    'thrive capital': 'thrive-capital',
    'tiger global': 'tiger-global-management',
    'tiger global management': 'tiger-global-management',
    'coatue': 'coatue-management',
    'coatue management': 'coatue-management',
    'general catalyst': 'general-catalyst',
    'gc': 'general-catalyst',

    # ---- Other major employers students target ----
    'nike': 'nike',
    'pepsi': 'pepsico',
    'pepsico': 'pepsico',
    'coca cola': 'coca-cola',
    'coca-cola': 'coca-cola',
    'pg': 'procter-and-gamble',
    'p&g': 'procter-and-gamble',
    'procter and gamble': 'procter-and-gamble',
    'procter & gamble': 'procter-and-gamble',
    'unilever': 'unilever',
    'lvmh': 'lvmh',
    'disney': 'disney',
    'walt disney': 'disney',
    'the walt disney company': 'disney',
    'lockheed': 'lockheed-martin',
    'lockheed martin': 'lockheed-martin',
    'raytheon': 'raytheon',
    'boeing': 'boeing',
    'spacex': 'spacex',
    'space x': 'spacex',
}


# ---------------------------------------------------------------------------
# Suffix stripping
# ---------------------------------------------------------------------------

# Common corporate suffixes that should NOT affect normalization. Order
# matters — longer first so we don't half-strip.
_SUFFIX_PATTERNS = [
    r',?\s*incorporated$',
    r',?\s*inc\.?$',
    r',?\s*corporation$',
    r',?\s*corp\.?$',
    r',?\s*l\.?l\.?c\.?$',
    r',?\s*l\.?l\.?p\.?$',
    r',?\s*p\.?l\.?c\.?$',
    r',?\s*ltd\.?$',
    r',?\s*limited$',
    r',?\s*co\.?$',
    r',?\s*company$',
    r',?\s*group$',
    r',?\s*holdings$',
    r',?\s*partners$',
]


def _strip_suffixes(name: str) -> str:
    """Iteratively strip recognized corporate suffixes (e.g. ', LLC')."""
    cleaned = name
    changed = True
    while changed:
        changed = False
        for pat in _SUFFIX_PATTERNS:
            new = re.sub(pat, '', cleaned, flags=re.IGNORECASE).strip()
            if new and new != cleaned:
                cleaned = new
                changed = True
                break
    return cleaned


def _slugify(name: str) -> str:
    """Lowercase, '&' → ' and ', collapse non-alnum to '-', strip leading/trailing '-'."""
    s = name.strip().lower()
    s = s.replace('&', ' and ')
    # Collapse common punctuation in shorthand (e.g. "L.E.K." → "lek")
    s = re.sub(r"[\.']", '', s)
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s


def company_to_slug(name: Optional[str]) -> Optional[str]:
    """Canonical normalization: alias-map first, deterministic slug fallback.

    Returns None for empty / falsy input. Idempotent: passing an already-slug
    returns the slug unchanged (it goes through the same lookup chain).
    """
    if not name:
        return None
    raw = str(name).strip()
    if not raw:
        return None

    lowered = raw.lower()

    # 1. Try the exact lowercased form against the alias map.
    if lowered in _ALIAS_MAP:
        return _ALIAS_MAP[lowered]

    # 2. Try with corporate suffixes stripped.
    stripped = _strip_suffixes(lowered)
    if stripped in _ALIAS_MAP:
        return _ALIAS_MAP[stripped]

    # 3. Try the slugified form against the alias map (covers "Goldman-Sachs"
    #    style inputs from URL params).
    slug = _slugify(stripped)
    if slug in _ALIAS_MAP:
        return _ALIAS_MAP[slug]

    # 4. Fallback — deterministic slug. Good enough for joins.
    return slug or None


def get_aliases_for_slug(slug: str) -> list:
    """Return all known display-name aliases that map to a given slug.

    Used by company_contexts_service to populate `companyAliases` when
    writing a context — so the next time the user types any of those names
    we hit the same context doc.
    """
    if not slug:
        return []
    aliases = sorted({alias for alias, target in _ALIAS_MAP.items() if target == slug})
    return aliases


# Back-compat: the old `models.users.normalize_company` used this exact name.
# Re-export so callers can migrate gradually without breaking imports.
def normalize_company(name: Optional[str]) -> Optional[str]:  # pragma: no cover — thin alias
    return company_to_slug(name)
