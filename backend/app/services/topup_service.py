"""
Top-up purchase flow — Stripe checkout session creation + payment fulfillment.

Flow:
  1. Frontend modal calls POST /api/billing/create-topup-session with pack_id.
  2. Backend resolves the Stripe Price ID from STRIPE_PRICE_CATALOG.topup
     and creates a Stripe Checkout Session in `mode=payment` (one-time, not
     subscription). Metadata includes user_id + pack_id + credit_amount so
     the webhook can credit the right user.
  3. User pays. Stripe fires `checkout.session.completed`.
  4. Webhook handler (in stripe_client.py) detects `mode=payment` + metadata
     marker and calls `apply_topup_purchase` here, which delegates to
     `credit_ledger.apply_add_purchased_atomic` to bump bonusCredits.

Top-up credits NEVER expire (CA prepaid-credit law + TOS promise + the
ledger's three-bucket spend order which preserves bonusCredits across
monthly resets).
"""
import logging
import os
from typing import Optional

import stripe

from app.config import STRIPE_PRICE_CATALOG, STRIPE_SECRET_KEY, TOPUP_PACKS
from app.extensions import get_db
from app.services.credit_ledger import apply_add_purchased_atomic

logger = logging.getLogger(__name__)


# Metadata marker we stamp on the Checkout Session so the webhook can tell
# top-up payments apart from other one-time invoice items.
TOPUP_METADATA_KEY = 'offerloop_purchase_kind'
TOPUP_METADATA_VALUE = 'topup'


def _find_pack_by_id(pack_id: str) -> Optional[dict]:
    for p in TOPUP_PACKS:
        if p['id'] == pack_id:
            return p
    return None


def create_topup_session(user_id: str, user_email: str, pack_id: str,
                         success_url: str, cancel_url: str) -> dict:
    """Create a Stripe Checkout Session for a one-time top-up purchase.

    Returns {ok, session_id, url} on success, {ok: False, error} otherwise.
    """
    if not STRIPE_SECRET_KEY:
        return {'ok': False, 'error': 'stripe_not_configured'}
    stripe.api_key = STRIPE_SECRET_KEY

    pack = _find_pack_by_id(pack_id)
    if not pack:
        return {'ok': False, 'error': 'unknown_pack'}

    credits = int(pack['credits'])
    topup_catalog = (STRIPE_PRICE_CATALOG.get('topup') or {})
    price_id = topup_catalog.get(credits) or ''

    # If the cofounders haven't wired the Stripe SKU yet, fail clearly with
    # 503 rather than silently letting the user end up at a broken Stripe page.
    if not price_id:
        return {
            'ok': False,
            'error': 'stripe_sku_not_wired',
            'message': f"The {pack['label']} top-up isn't quite ready for checkout. We'll have it live shortly.",
        }

    db = get_db()
    if db:
        snap = db.collection('users').document(user_id).get()
        if snap.exists:
            stored_email = (snap.to_dict() or {}).get('email')
            if stored_email:
                user_email = stored_email

    metadata = {
        TOPUP_METADATA_KEY: TOPUP_METADATA_VALUE,
        'user_id': user_id,
        'pack_id': pack_id,
        'credit_amount': str(credits),
    }

    try:
        session = stripe.checkout.Session.create(
            mode='payment',
            payment_method_types=['card'],
            customer_email=user_email,
            success_url=success_url,
            cancel_url=cancel_url,
            line_items=[{'price': price_id, 'quantity': 1}],
            allow_promotion_codes=False,  # top-ups don't get coupon-stacked
            metadata=metadata,
            payment_intent_data={'metadata': metadata},
        )
    except stripe.error.StripeError as e:
        logger.error("Stripe top-up session error: %s", e)
        return {'ok': False, 'error': f'stripe_error: {e}'}

    logger.info("Created top-up session %s for user %s pack=%s credits=%d",
                session.id, user_id, pack_id, credits)
    return {'ok': True, 'session_id': session.id, 'url': session.url}


def apply_topup_purchase(session: dict) -> dict:
    """Webhook handler — called when checkout.session.completed fires AND the
    metadata identifies this as a top-up purchase.

    Idempotent: tags the user doc with the session ID so re-firing the
    webhook (Stripe retries on 5xx) doesn't double-credit.
    """
    metadata = session.get('metadata') or {}
    if metadata.get(TOPUP_METADATA_KEY) != TOPUP_METADATA_VALUE:
        # Not a top-up — let the regular checkout handler deal with it.
        return {'ok': False, 'error': 'not_a_topup'}

    user_id = metadata.get('user_id')
    try:
        credits = int(metadata.get('credit_amount') or 0)
    except (TypeError, ValueError):
        credits = 0
    if not user_id or credits <= 0:
        logger.error("Top-up webhook missing user_id or credits: %s", metadata)
        return {'ok': False, 'error': 'bad_metadata'}

    # Idempotency — set a per-session sentinel so we credit at most once
    db = get_db()
    if not db:
        return {'ok': False, 'error': 'db_unavailable'}
    session_id = session.get('id') or ''
    user_ref = db.collection('users').document(user_id)
    user_snap = user_ref.get()
    if not user_snap.exists:
        return {'ok': False, 'error': 'user_not_found'}
    user_data = user_snap.to_dict() or {}
    already_applied = set(user_data.get('topupSessionIdsApplied') or [])
    if session_id in already_applied:
        logger.info("Top-up session %s already credited for user %s — skipping", session_id, user_id)
        return {'ok': True, 'already_applied': True, 'credits_added': 0}

    success, new_total = apply_add_purchased_atomic(user_id, credits)
    if not success:
        return {'ok': False, 'error': 'ledger_write_failed'}

    # Stamp the session ID so retries don't double-credit
    already_applied.add(session_id)
    user_ref.update({
        'topupSessionIdsApplied': list(already_applied),
        'lastTopupAt': session.get('created'),  # epoch from Stripe
    })

    logger.info("Top-up applied: user=%s credits=+%d new_total=%d session=%s",
                user_id, credits, new_total, session_id)
    return {'ok': True, 'credits_added': credits, 'new_total': new_total}
