"""
Apify client — LinkedIn profile posts via HarvestAPI's actor.

Primary live source for LinkedIn recent_posts on contacts in the email
generation pipeline. PDL `summary` field fills linkedin_summary as a
free fallback (handled in personalization.build_contact_profile).

Firecrawl dropped LinkedIn support; Bright Data was previously in the
chain but was 17-33x more expensive and the account was broken — both
removed from the email pipeline.
"""
from __future__ import annotations

import logging
import os
import re

import requests

from app.services.metering import meter_call

logger = logging.getLogger(__name__)

APIFY_API_KEY = os.getenv("APIFY_API_KEY")
APIFY_ACTOR_ID = "harvestapi~linkedin-profile-posts"
APIFY_RUN_SYNC_URL = (
    f"https://api.apify.com/v2/acts/{APIFY_ACTOR_ID}/run-sync-get-dataset-items"
)
APIFY_TIMEOUT_S = 180
APIFY_MAX_POSTS_PER_PROFILE = 5


def _canonicalize_linkedin_url(url: str) -> str:
    """Force https://www.linkedin.com/in/<slug>.

    Robust to common PDL/legacy variations:
    - missing protocol (linkedin.com/in/slug)
    - missing www
    - mobile (m.linkedin.com)
    - trailing slash, query params, fragments
    - trailing locale path (/en, /fr)
    """
    if not url:
        return ""
    url = url.strip().rstrip("/")
    url = url.split("?")[0].split("#")[0]
    url = re.sub(r"/[a-z]{2}$", "", url, flags=re.IGNORECASE)
    m = re.search(r"linkedin\.com/in/([\w-]+)", url, re.IGNORECASE)
    if m:
        return f"https://www.linkedin.com/in/{m.group(1).lower()}"
    return ""


def _extract_post_text(item) -> str:
    if not isinstance(item, dict):
        return ""
    for key in ("text", "content", "postText", "post_text", "description", "title"):
        val = item.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return ""


def _extract_post_source_url(item) -> str:
    """HarvestAPI nests author info under `item.author`:
        author.linkedinUrl       -> https://www.linkedin.com/in/<slug>?...
        author.publicIdentifier  -> <slug>
    Falls back to top-level fields then `query.url`.
    """
    if not isinstance(item, dict):
        return ""
    author = item.get("author")
    if isinstance(author, dict):
        url = author.get("linkedinUrl")
        if isinstance(url, str) and url.strip():
            canon = _canonicalize_linkedin_url(url)
            if canon:
                return canon
        slug = author.get("publicIdentifier")
        if isinstance(slug, str) and slug.strip():
            return f"https://www.linkedin.com/in/{slug.strip().lower()}"
    for key in ("inputUrl", "input_url", "profileUrl", "profile_url", "sourceUrl", "source_url"):
        val = item.get(key)
        if isinstance(val, str) and val.strip():
            return _canonicalize_linkedin_url(val)
    query = item.get("query")
    if isinstance(query, dict):
        url = query.get("url") or query.get("profileUrl")
        if isinstance(url, str) and url.strip():
            return _canonicalize_linkedin_url(url)
    return ""


@meter_call("apify", "linkedin_posts")
def batch_enrich_linkedin_posts_via_apify(contacts: list[dict]) -> dict[int, dict]:
    """Scrape recent LinkedIn posts for a batch of contacts via Apify.

    Returns dict keyed by contact index:
        {linkedin_recent_posts: list[str]}
    Contacts without a LinkedIn URL or with no posts get no entry.
    """
    if not APIFY_API_KEY:
        logger.warning("[Apify] APIFY_API_KEY not set; skipping batch")
        return {}

    url_to_indices: dict[str, list[int]] = {}
    for idx, c in enumerate(contacts):
        raw = (
            c.get("LinkedIn")
            or c.get("linkedin_url")
            or c.get("linkedinUrl")
            or ""
        ).strip()
        canon = _canonicalize_linkedin_url(raw)
        if not canon:
            if raw:
                name = f"{c.get('FirstName', '')} {c.get('LastName', '')}".strip() or "?"
                logger.warning(f"[Apify] Could not canonicalize LinkedIn URL for {name}: {raw!r}")
            continue
        url_to_indices.setdefault(canon, []).append(idx)

    if not url_to_indices:
        return {}

    try:
        from app.services.enrichment_cache import get_cached, set_cached
    except Exception:
        get_cached = None
        set_cached = None

    results: dict[int, dict] = {}
    urls_to_fetch: list[str] = []
    for canon in url_to_indices:
        cached = None
        if get_cached:
            try:
                cached = get_cached("contact_enrichment", ["linkedin_apify_posts", canon])
            except Exception:
                cached = None
        if cached:
            for idx in url_to_indices[canon]:
                results[idx] = cached
        else:
            urls_to_fetch.append(canon)

    if not urls_to_fetch:
        return results

    try:
        logger.info(f"[Apify] Scraping {len(urls_to_fetch)} LinkedIn profiles")
        for u in urls_to_fetch:
            logger.info(f"[Apify]   -> {u}")
        response = requests.post(
            APIFY_RUN_SYNC_URL,
            params={"token": APIFY_API_KEY},
            headers={"Content-Type": "application/json"},
            json={
                "targetUrls": urls_to_fetch,
                "maxPosts": APIFY_MAX_POSTS_PER_PROFILE,
                "maxReactions": 0,
                "maxComments": 0,
            },
            timeout=APIFY_TIMEOUT_S,
        )
        # Apify's run-sync endpoint returns 201 (Created) on success
        if response.status_code not in (200, 201):
            logger.error(f"[Apify] HTTP {response.status_code}: {response.text[:400]}")
            return results

        items = response.json()
        if not isinstance(items, list):
            logger.warning(f"[Apify] Unexpected response shape: {str(items)[:200]}")
            return results

        posts_per_url: dict[str, list[str]] = {}
        for item in items:
            text = _extract_post_text(item)
            if not text or len(text) < 20:
                continue
            src = _extract_post_source_url(item)
            if not src or src not in url_to_indices:
                continue
            bucket = posts_per_url.setdefault(src, [])
            if text not in bucket:
                bucket.append(text)

        for canon, posts in posts_per_url.items():
            payload = {"linkedin_recent_posts": posts[:APIFY_MAX_POSTS_PER_PROFILE]}
            if set_cached:
                try:
                    set_cached("contact_enrichment", ["linkedin_apify_posts", canon], payload)
                except Exception:
                    pass
            for idx in url_to_indices[canon]:
                results[idx] = payload

        return results
    except requests.Timeout:
        logger.error("[Apify] Batch request timed out")
        return results
    except requests.RequestException as e:
        logger.error(f"[Apify] Request error: {e}")
        return results
    except Exception as e:
        logger.error(f"[Apify] Unexpected error: {e}", exc_info=True)
        return results
