"""
Season Pass purchase flow — Stripe checkout session creation + payment fulfillment.

Mirrors topup_service.py, but grants a tier instead of bonus credits.

Flow:
  1. Frontend Season Pass button calls POST /api/billing/create-season-pass-session
     with the audience ('student' | 'list').
  2. Backend resolves the Stripe Price ID from STRIPE_PRICE_CATALOG.season_pass
     .one_time[audience] and creates a Checkout Session in `mode=payment`
     (one-time, not subscription). Metadata marks it as a season-pass purchase
     so the webhook can grant the pass to the right user.
  3. User pays. Stripe fires `checkout.session.completed`.
  4. Webhook handler (in stripe_client.py) detects the season-pass marker and
     calls `apply_season_pass_purchase` here, which grants the season_pass tier
     for SEASON_PASS['months'] months.

The Season Pass is a one-time prepaid pass — there is NO Stripe subscription, so
the recurring `invoice.paid` webhook never fires. Instead the monthly credit
refill rides the existing lazy per-request reset (auth._check_reset_needed):
while subscriptionTier == 'season_pass', each new calendar month refills
TIER_CONFIGS['season_pass']['credits']. Expiry after `months` is enforced lazily
in that same reset path (no cron needed).
"""
import logging
import os
from datetime import datetime
from typing import Optional

import stripe

from app.config import SEASON_PASS, STRIPE_PRICE_CATALOG, STRIPE_SECRET_KEY, TIER_CONFIGS
from app.extensions import get_db

logger = logging.getLogger(__name__)

# Metadata marker stamped on the Checkout Session so the webhook can tell
# season-pass payments apart from top-ups and regular subscription checkouts.
# Shares the key with top-ups (offerloop_purchase_kind); the VALUE disambiguates.
SEASON_PASS_METADATA_KEY = 'offerloop_purchase_kind'
SEASON_PASS_METADATA_VALUE = 'season_pass'


def _resolve_price_id(audience: str) -> str:
    one_time = (STRIPE_PRICE_CATALOG.get('season_pass') or {}).get('one_time') or {}
    return one_time.get(audience) or ''


def _add_months(dt: datetime, months: int) -> datetime:
    """Add calendar months without a hard dependency on dateutil."""
    try:
        from dateutil.relativedelta import relativedelta  # type: ignore
        return dt + relativedelta(months=months)
    except ImportError:
        # Approximate fallback: 30-day months. Good enough for an expiry bound.
        from datetime import timedelta
        return dt + timedelta(days=30 * months)


def create_season_pass_session(user_id: str, user_email: str, audience: str,
                               success_url: str, cancel_url: str) -> dict:
    """Create a Stripe Checkout Session for a one-time Season Pass purchase.

    Returns {ok, session_id, url} on success, {ok: False, error} otherwise.
    """
    if not STRIPE_SECRET_KEY:
        return {'ok': False, 'error': 'stripe_not_configured'}
    stripe.api_key = STRIPE_SECRET_KEY

    audience = audience if audience in ('student', 'list') else 'list'
    price_id = _resolve_price_id(audience)

    # If the Season Pass SKU isn't wired in Stripe yet, fail clearly (503)
    # rather than dropping the user on a broken Stripe page.
    if not price_id:
        return {
            'ok': False,
            'error': 'stripe_sku_not_wired',
            'message': "The Recruiting Season Pass isn't quite ready for checkout. We'll have it live shortly.",
        }

    db = get_db()
    if db:
        snap = db.collection('users').document(user_id).get()
        if snap.exists:
            stored_email = (snap.to_dict() or {}).get('email')
            if stored_email:
                user_email = stored_email

    metadata = {
        SEASON_PASS_METADATA_KEY: SEASON_PASS_METADATA_VALUE,
        'user_id': user_id,
        'audience': audience,
    }

    try:
        session = stripe.checkout.Session.create(
            mode='payment',
            payment_method_types=['card'],
            customer_email=user_email,
            success_url=success_url,
            cancel_url=cancel_url,
            line_items=[{'price': price_id, 'quantity': 1}],
            allow_promotion_codes=False,
            metadata=metadata,
            payment_intent_data={'metadata': metadata},
        )
    except stripe.error.StripeError as e:
        logger.error("Stripe season-pass session error: %s", e)
        return {'ok': False, 'error': f'stripe_error: {e}'}

    logger.info("Created season-pass session %s for user %s audience=%s",
                session.id, user_id, audience)
    return {'ok': True, 'session_id': session.id, 'url': session.url}


def apply_season_pass_purchase(session: dict) -> dict:
    """Webhook handler — called when checkout.session.completed fires AND the
    metadata identifies this as a season-pass purchase.

    Grants the season_pass tier for SEASON_PASS['months'] months. Idempotent:
    tags the user doc with the session ID so webhook retries don't re-grant.
    """
    metadata = session.get('metadata') or {}
    if metadata.get(SEASON_PASS_METADATA_KEY) != SEASON_PASS_METADATA_VALUE:
        return {'ok': False, 'error': 'not_a_season_pass'}

    user_id = metadata.get('user_id')
    if not user_id:
        logger.error("Season-pass webhook missing user_id: %s", metadata)
        return {'ok': False, 'error': 'bad_metadata'}

    db = get_db()
    if not db:
        return {'ok': False, 'error': 'db_unavailable'}

    session_id = session.get('id') or ''
    user_ref = db.collection('users').document(user_id)
    user_snap = user_ref.get()
    if not user_snap.exists:
        return {'ok': False, 'error': 'user_not_found'}
    user_data = user_snap.to_dict() or {}

    already_applied = set(user_data.get('seasonPassSessionIdsApplied') or [])
    if session_id in already_applied:
        logger.info("Season-pass session %s already applied for user %s — skipping", session_id, user_id)
        return {'ok': True, 'already_applied': True}

    config = TIER_CONFIGS['season_pass']
    credits = config['credits']
    now = datetime.now()
    expires = _add_months(now, int(SEASON_PASS.get('months', 4)))

    already_applied.add(session_id)
    user_ref.update({
        'subscriptionTier': 'season_pass',
        'tier': 'season_pass',
        'credits': credits,
        'maxCredits': credits,
        'stripeCustomerId': session.get('customer'),
        'subscriptionStatus': 'active',
        'seasonPassStartedAt': now.isoformat(),
        'seasonPassExpiresAt': expires.isoformat(),
        'seasonPassSessionIdsApplied': list(already_applied),
        'lastCreditReset': now.isoformat(),
        'lastUsageReset': now.isoformat(),
        'alumniSearchesUsed': 0,
        'coffeeChatPrepsUsed': 0,
        # A paid pass ends any active no-card trial; preserve trialUsedAt so it
        # can't restart.
        'trialActive': False,
        'updatedAt': now.isoformat(),
    })

    logger.info("Season Pass granted: user=%s credits=%d expires=%s session=%s",
                user_id, credits, expires.isoformat(), session_id)
    return {'ok': True, 'tier': 'season_pass', 'credits': credits, 'expires_at': expires.isoformat()}
