"""
Stripe client service - payment processing and subscription management
"""
import os
import stripe
from datetime import datetime
from flask import request, jsonify
from app.config import STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, TIER_CONFIGS, STRIPE_PRO_PRICE_ID, STRIPE_ELITE_PRICE_ID, STRIPE_PRICE_CATALOG, STRIPE_COUPONS
from app.extensions import get_db
from app.services.auth import check_and_reset_credits


def _build_price_id_index(catalog: dict) -> dict:
    """Invert STRIPE_PRICE_CATALOG into {price_id: {tier, cadence, audience, credits}}.

    One walk, one source of truth. Used for both tier resolution and trial-length
    resolution so neither can drift from the catalog. Empty slots (SKU not wired
    yet) are skipped. Built once at import, so adding a Stripe Price only means
    setting its env var, not editing this file.
    """
    index = {}
    for tier in ('pro', 'elite'):
        for cadence, audiences in (catalog.get(tier) or {}).items():
            for audience, by_credits in audiences.items():
                for credits, price_id in by_credits.items():
                    if price_id:
                        index[price_id] = {
                            'tier': tier,
                            'cadence': cadence,
                            'audience': audience,
                            'credits': credits,
                        }
    season_pass = (catalog.get('season_pass') or {}).get('one_time') or {}
    for audience, price_id in season_pass.items():
        if price_id:
            index[price_id] = {
                'tier': 'season_pass',
                'cadence': 'one_time',
                'audience': audience,
                'credits': None,
            }
    return index


# Built once at import. Every catalog SKU (current and future) resolves here.
_PRICE_ID_INDEX = _build_price_id_index(STRIPE_PRICE_CATALOG)


def get_tier_from_price_id(price_id: str) -> str:
    """Determine tier from a Stripe price ID via the inverted catalog index."""
    if not price_id:
        return 'pro'
    meta = _PRICE_ID_INDEX.get(price_id)
    if meta:
        return meta['tier']
    # Legacy flat constants: still honored for existing subscribers whose
    # subscription points at the original Price ID after the 2K slot is
    # repointed to a new $14.99 SKU in env.
    if price_id == STRIPE_ELITE_PRICE_ID:
        return 'elite'
    if price_id == STRIPE_PRO_PRICE_ID:
        return 'pro'
    # Genuinely unknown: warn loudly (never silent) and fall back to 'pro'.
    print(f"WARNING unknown Stripe price_id={price_id!r} not in STRIPE_PRICE_CATALOG or legacy constants; falling back to 'pro'. Wire its env var so it resolves to the correct tier.")
    return 'pro'


def _user_has_used_trial(user_id: str) -> bool:
    """True if the user already consumed their one lifetime trial. Reuses the
    same trialUsedAt field services/trial_service.start_trial writes, so Path A
    and the Stripe path share one invariant."""
    db = get_db()
    if not db or not user_id:
        return False
    snap = db.collection('users').document(user_id).get()
    return bool((snap.to_dict() or {}).get('trialUsedAt')) if snap.exists else False


# ============================================================================
# Post-Checkout Upsell — Pro → Elite at "$10 more, right now"
# ============================================================================
# Mechanic: invoice-item + subscription.modify (NOT a coupon).
# The original coupon-based mechanic was buggy because subscription-level
# coupons don't charge immediately — the user already paid $15 for Pro, so we
# (a) switch the subscription to Elite with proration_behavior='none' (no
# proration surprise), (b) create a one-time $10 invoice item and invoice it
# now (saved card on file from Pro checkout = one click), (c) explicitly bump
# the user's credit allocation to Elite's (off-cycle invoice items do NOT
# trigger the invoice.paid renewal webhook so credits would otherwise stay at
# Pro level).
#
# Net effect: user paid $15 (Pro) + $10 (upsell) = $25 effective on Elite this
# month. Next renewal is full Elite ($35) automatically.

# Default $10 upsell. Tunable per market via env without code change.
UPSELL_AMOUNT_CENTS = 1000

def apply_post_checkout_upsell(user_id: str) -> dict:
    """Apply the Pro→Elite post-checkout upsell.

    Returns {ok: bool, error?: str, invoice_id?: str, new_tier: 'elite'}.
    Idempotent — refuses to apply twice (`upsellAcceptedAt` is the guard).
    """
    if not STRIPE_SECRET_KEY:
        return {'ok': False, 'error': 'stripe_not_configured'}
    stripe.api_key = STRIPE_SECRET_KEY

    db = get_db()
    if not db:
        return {'ok': False, 'error': 'db_unavailable'}

    user_ref = db.collection('users').document(user_id)
    snap = user_ref.get()
    if not snap.exists:
        return {'ok': False, 'error': 'user_not_found'}
    user = snap.to_dict() or {}

    # Idempotency guard — accept exactly once.
    if user.get('upsellAcceptedAt'):
        return {'ok': False, 'error': 'already_accepted'}

    sub_id = user.get('stripeSubscriptionId')
    customer_id = user.get('stripeCustomerId')
    if not sub_id or not customer_id:
        return {'ok': False, 'error': 'no_active_subscription'}

    # Pull the current subscription so we know which subscription-item-id to swap.
    try:
        sub = stripe.Subscription.retrieve(sub_id)
    except stripe.error.StripeError as e:
        return {'ok': False, 'error': f'stripe_retrieve_failed: {e}'}

    # Collision guard — if the subscription already carries a discount, the
    # post-checkout upsell shouldn't pile on. Frontend should hide the modal
    # in this case; this is a defensive double-check.
    if sub.get('discount'):
        return {'ok': False, 'error': 'subscription_has_existing_discount'}

    items = sub.get('items', {}).get('data', [])
    if not items:
        return {'ok': False, 'error': 'no_subscription_items'}
    current_item_id = items[0]['id']

    # Step 1: switch the subscription to Elite — no proration so Stripe doesn't
    # auto-charge the price-difference at this moment. We charge explicitly via
    # the invoice item in step 2.
    try:
        stripe.Subscription.modify(
            sub_id,
            items=[{'id': current_item_id, 'price': STRIPE_ELITE_PRICE_ID}],
            proration_behavior='none',
        )
    except stripe.error.StripeError as e:
        return {'ok': False, 'error': f'stripe_modify_failed: {e}'}

    # Step 2: one-time $10 invoice item, finalized + paid immediately.
    try:
        stripe.InvoiceItem.create(
            customer=customer_id,
            amount=UPSELL_AMOUNT_CENTS,
            currency='usd',
            description='Add Elite this month — Offerloop upgrade',
        )
        invoice = stripe.Invoice.create(customer=customer_id, auto_advance=False)
        stripe.Invoice.finalize_invoice(invoice.id)
        paid_invoice = stripe.Invoice.pay(invoice.id)
        invoice_id = paid_invoice.id
    except stripe.error.StripeError as e:
        # Step 1 already succeeded — the user IS on Elite. Roll back to Pro?
        # Tricky because that risks proration churn. Safer: log and surface the
        # error; the frontend can prompt support. The user's plan is now Elite
        # but they haven't been charged the $10; manual reconciliation needed.
        print(f"⚠️ Upsell step 1 (sub.modify) succeeded but step 2 (invoice) failed for user {user_id}: {e}")
        return {
            'ok': False,
            'error': f'invoice_failed_after_sub_modify: {e}',
            'requires_manual_reconciliation': True,
        }

    # Step 3: bump credit allocation to Elite NOW. Off-cycle invoice items do
    # NOT trigger the `invoice.paid` renewal webhook, so without this explicit
    # bump the user is on the Elite price with Pro credits.
    elite_credits = TIER_CONFIGS['elite']['credits']
    user_ref.update({
        'subscriptionTier': 'elite',
        'tier': 'elite',  # legacy fallback field
        'maxCredits': elite_credits,
        'credits': elite_credits,
        'upsellShownAt': datetime.utcnow(),
        'upsellAcceptedAt': datetime.utcnow(),
        'upsellInvoiceId': invoice_id,
        'trialActive': False,  # paid upgrade ends any active no-card trial
    })

    return {
        'ok': True,
        'new_tier': 'elite',
        'invoice_id': invoice_id,
        'credits': elite_credits,
    }


def record_post_checkout_upsell_decline(user_id: str) -> dict:
    """Mark the upsell as shown-and-declined. Idempotent."""
    db = get_db()
    if not db:
        return {'ok': False, 'error': 'db_unavailable'}

    user_ref = db.collection('users').document(user_id)
    snap = user_ref.get()
    if not snap.exists:
        return {'ok': False, 'error': 'user_not_found'}

    user = snap.to_dict() or {}
    if user.get('upsellShownAt'):
        return {'ok': True, 'already_recorded': True}

    user_ref.update({
        'upsellShownAt': datetime.utcnow(),
        'upsellDeclinedAt': datetime.utcnow(),
    })
    return {'ok': True}


def create_referral_trial_checkout(user_id: str, user_email: str) -> dict:
    """Create an Elite Checkout with a 30-day free trial for a referral reward."""
    if not STRIPE_SECRET_KEY:
        return {'error': 'Stripe not configured'}
    stripe.api_key = STRIPE_SECRET_KEY

    base_url = os.getenv('FRONTEND_BASE_URL', 'https://offerloop.ai').rstrip('/')
    try:
        session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            mode='subscription',
            customer_email=user_email,
            success_url=f"{base_url}/account-settings?referral=claimed",
            cancel_url=f"{base_url}/account-settings?referral=cancelled",
            line_items=[{'price': STRIPE_ELITE_PRICE_ID, 'quantity': 1}],
            subscription_data={'trial_period_days': 30},
            metadata={
                'user_id': user_id,
                'tier': 'elite',
                'referral_reward': 'true',
            },
        )
    except stripe.error.StripeError as e:
        return {'error': f'stripe_checkout_failed: {e}'}
    return {'url': session.url, 'sessionId': session.id}


def apply_referral_reward_coupon(subscription_id: str) -> dict:
    """Apply the 100%-off one-month referral coupon to an existing subscription."""
    if not STRIPE_SECRET_KEY:
        return {'ok': False, 'error': 'stripe_not_configured'}
    coupon_id = (STRIPE_COUPONS or {}).get('referral_reward')
    if not coupon_id:
        return {'ok': False, 'error': 'coupon_not_configured'}
    stripe.api_key = STRIPE_SECRET_KEY
    try:
        stripe.Subscription.modify(subscription_id, coupon=coupon_id)
        return {'ok': True}
    except stripe.error.StripeError as e:
        return {'ok': False, 'error': f'stripe_modify_failed: {e}'}


def create_checkout_session():
    """Create Stripe checkout session for upgrade"""
    try:
        if not STRIPE_SECRET_KEY:
            return jsonify({'error': 'Stripe not configured'}), 500
        
        stripe.api_key = STRIPE_SECRET_KEY
        
        data = request.get_json() or {}
        user_id = request.firebase_user.get('uid')
        user_email = request.firebase_user.get('email')
        price_id = data.get('priceId')
        
        # Validate required fields
        if not user_id:
            return jsonify({'error': 'User ID is required'}), 400
        if not user_email:
            return jsonify({'error': 'User email is required'}), 400
        
        # Determine base URL based on environment
        if request.url_root and 'localhost' in request.url_root:
            base_url = 'http://localhost:8080'  # Frontend dev server runs on port 8080
        else:
            base_url = 'https://offerloop.ai'
        
        # Hardcode URLs with double braces to escape in f-string
        # Stripe recognizes {CHECKOUT_SESSION_ID} as a template variable
        success_url = f'{base_url}/payment-success?session_id={{CHECKOUT_SESSION_ID}}'
        cancel_url = f'{base_url}/pricing'
        
        print(f"[Stripe] Creating checkout session: price_id={price_id}")
        print(f"Success URL: {success_url}")
        print(f"Cancel URL: {cancel_url}")
        
        # Intended tier from price ID so webhook can use it as fallback if price ID mapping fails
        intended_tier = get_tier_from_price_id(price_id) if price_id else 'pro'
        # Option A: Stripe Checkout never starts a free trial. Free trials run
        # only on the no-card Path A (services/trial_service.start_trial). This
        # path is reserved for direct paid signups and post-trial upgrades.
        CHECKOUT_TRIAL_DAYS = 0
        # Decision #5 (defense in depth): never grant more than one trial per
        # account, lifetime, using the shared trialUsedAt field. No-op while
        # CHECKOUT_TRIAL_DAYS is 0, but keeps the invariant if a trial is ever
        # reintroduced on this path.
        trial_days = CHECKOUT_TRIAL_DAYS
        if trial_days > 0 and _user_has_used_trial(user_id):
            print(f"[Stripe] user {user_id} already used their trial; checkout will not grant another.")
            trial_days = 0
        # Prepare session parameters (direct paid checkout; trials live on Path A)
        session_params = {
            'payment_method_types': ['card'],
            'mode': 'subscription',
            'success_url': success_url,
            'cancel_url': cancel_url,
            'customer_email': user_email,
            'allow_promotion_codes': True,
            'metadata': {
                'user_id': user_id,
                'tier': intended_tier,
            },
            'subscription_data': {
                'trial_period_days': trial_days,
            },
        }
        
        # Create checkout session
        if price_id:
            # Use the provided price ID
            session_params['line_items'] = [{
                'price': price_id,
                'quantity': 1,
            }]
        else:
            # Fallback to inline price data if no priceId provided
            session_params['line_items'] = [{
                'price_data': {
                    'currency': 'usd',
                    'product_data': {
                        'name': 'Offerloop Pro',
                    },
                    'unit_amount': 1999,  # $19.99
                    'recurring': {
                        'interval': 'month',
                    },
                },
                'quantity': 1,
            }]
        
        try:
            session = stripe.checkout.Session.create(**session_params)
            print(f"Checkout session created successfully: {session.id}")
            return jsonify({'sessionId': session.id, 'url': session.url})
        except stripe.error.StripeError as stripe_error:
            print(f"Stripe API error: {stripe_error}")
            print(f"Error type: {type(stripe_error).__name__}")
            print(f"Error message: {stripe_error.user_message or stripe_error.message}")
            return jsonify({
                'error': 'Stripe checkout session creation failed',
                'stripe_error': str(stripe_error),
                'stripe_error_type': type(stripe_error).__name__,
                'message': stripe_error.user_message or stripe_error.message
            }), 400
        
    except Exception as e:
        print(f"Stripe checkout error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def handle_stripe_webhook():
    """Handle Stripe webhook events"""
    try:
        if not STRIPE_SECRET_KEY or not STRIPE_WEBHOOK_SECRET:
            return jsonify({'error': 'Stripe not configured'}), 500
        
        stripe.api_key = STRIPE_SECRET_KEY
        
        payload = request.data
        sig_header = request.headers.get('Stripe-Signature')
        
        event = stripe.Webhook.construct_event(
            payload, sig_header, STRIPE_WEBHOOK_SECRET
        )
        
        # Handle different event types
        if event['type'] == 'checkout.session.completed':
            session_obj = event['data']['object']
            # Top-up checkouts use mode=payment and a metadata marker. Route
            # them to the top-up purchase handler so the bonus bucket gets
            # credited (the regular handler upgrades subscription tier and
            # would no-op here).
            metadata = (session_obj.get('metadata') or {})
            from app.services.topup_service import TOPUP_METADATA_KEY, TOPUP_METADATA_VALUE, apply_topup_purchase
            from app.services.season_pass_service import (
                SEASON_PASS_METADATA_KEY, SEASON_PASS_METADATA_VALUE, apply_season_pass_purchase,
            )
            if metadata.get(TOPUP_METADATA_KEY) == TOPUP_METADATA_VALUE:
                apply_topup_purchase(session_obj)
            elif metadata.get(SEASON_PASS_METADATA_KEY) == SEASON_PASS_METADATA_VALUE:
                apply_season_pass_purchase(session_obj)
            else:
                handle_checkout_completed(session_obj)
        elif event['type'] == 'checkout.session.expired':
            handle_checkout_expired(event['data']['object'])
        elif event['type'] == 'invoice.paid':
            handle_invoice_paid(event['data']['object'])
        elif event['type'] == 'customer.subscription.deleted':
            handle_subscription_deleted(event['data']['object'])
        elif event['type'] == 'customer.subscription.updated':
            handle_subscription_updated(event['data']['object'])
        
        return jsonify({'status': 'success'})
        
    except ValueError as e:
        print(f"Invalid payload: {e}")
        return jsonify({'error': 'Invalid payload'}), 400
    except stripe.error.SignatureVerificationError as e:
        print(f"Invalid signature: {e}")
        return jsonify({'error': 'Invalid signature'}), 400
    except Exception as e:
        print(f"Webhook error: {e}")
        return jsonify({'error': str(e)}), 500


def handle_checkout_expired(session):
    """Stamp checkoutAbandonedAt on the user doc so Sequence 2 (checkout
    abandonment) of the lifecycle emails can pick them up on the next cron tick.

    Stripe fires this when a Checkout Session expires unused (default 24h after
    creation). The metadata['user_id'] is set when we create the session in
    create_checkout_session() so we know which Firestore user to mark.
    """
    try:
        user_id = (session.get('metadata') or {}).get('user_id')
        if not user_id:
            print(f"⚠️ checkout.session.expired with no user_id metadata: {session.get('id')}")
            return
        db = get_db()
        if not db:
            return
        db.collection('users').document(user_id).update({
            'checkoutAbandonedAt': datetime.utcnow(),
            'checkoutAbandonedSessionId': session.get('id'),
        })
        print(f"📭 Marked user {user_id} as checkout-abandoned (session {session.get('id')})")
    except Exception as e:
        print(f"⚠️ handle_checkout_expired error: {e}")


def handle_checkout_completed(session):
    """Handle successful checkout - upgrade user to appropriate tier"""
    try:
        db = get_db()
        if not db:
            return

        user_id = session.get('metadata', {}).get('user_id')
        if not user_id:
            return

        # Get subscription to determine tier and actual status (trialing vs active)
        subscription_id = session.get('subscription')
        tier = 'pro'  # Default
        sub_status = 'active'  # Default fallback
        tier_from_metadata = (session.get('metadata') or {}).get('tier')
        price_id = None
        if subscription_id:
            try:
                stripe.api_key = STRIPE_SECRET_KEY
                subscription = stripe.Subscription.retrieve(subscription_id)
                sub_status = subscription.status  # 'trialing' during free trial, 'active' after
                if subscription.items.data:
                    price_id = subscription.items.data[0].price.id
                    tier_from_stripe = get_tier_from_price_id(price_id)
                    # Prefer metadata tier (what user selected at checkout) if Stripe price ID mapping failed
                    if tier_from_metadata in ('pro', 'elite'):
                        tier = tier_from_metadata
                        if tier != tier_from_stripe:
                            print(f"⚠️ Tier mismatch: metadata={tier_from_metadata}, price_id={price_id} -> {tier_from_stripe}. Using metadata tier {tier}.")
                    else:
                        tier = tier_from_stripe
            except Exception as e:
                print(f"Error retrieving subscription: {e}")
                if tier_from_metadata in ('pro', 'elite'):
                    tier = tier_from_metadata
        elif tier_from_metadata in ('pro', 'elite'):
            tier = tier_from_metadata

        tier_config = TIER_CONFIGS.get(tier, TIER_CONFIGS['pro'])
        print(f"[Stripe] User upgraded to {tier} (metadata={tier_from_metadata}, price_id={price_id})")

        user_ref = db.collection('users').document(user_id)
        update_payload = {
            'subscriptionTier': tier,
            'tier': tier,  # Keep for backward compatibility
            'maxCredits': tier_config['credits'],
            'credits': tier_config['credits'],
            'stripeSubscriptionId': subscription_id,
            'stripeCustomerId': session.get('customer'),
            'subscriptionStatus': sub_status,
            'lastCreditReset': datetime.now().isoformat(),
            'upgraded_at': datetime.now().isoformat(),
            'updatedAt': datetime.now().isoformat(),
            # End any active no-card Pro trial NOW. Without this, the trial-aware
            # deduct path (deduct_credits_atomic) would keep spending the 300/day
            # trial bucket until trialEndsAt, throttling a user who just PAID for
            # the full monthly pool. Clearing the flag hands over `credits` above
            # immediately. `trialUsedAt` is preserved so the trial can't restart.
            'trialActive': False,
        }
        # Decision #5: if this checkout began as a trial, consume the one-per-
        # account trial token so neither path can grant a second one.
        if sub_status == 'trialing':
            # A referral-reward checkout starts as a trial; consuming trialUsedAt
            # here intentionally means a referral reward also uses the account's
            # one no-card trial entitlement.
            update_payload['trialUsedAt'] = datetime.utcnow()
        # Referral reward: finalize the one-time claim flag.
        _meta = session.get('metadata') or {}
        if _meta.get('referral_reward') == 'true':
            update_payload['referralRewardClaimed'] = True
            update_payload['referralRewardClaimedAt'] = datetime.now().isoformat()
            update_payload['referralRewardPendingAt'] = None  # clear the claim-in-progress lock
        user_ref.update(update_payload)

        try:
            from app.utils.posthog_client import track_event
            track_event(user_id, 'subscription_started', {
                'tier': tier,
                'subscription_status': sub_status,
                'price_id': price_id,
                'referral_reward': _meta.get('referral_reward') == 'true',
            }, sync=True)
        except Exception:
            pass

    except Exception as e:
        print(f"Error handling checkout: {e}")
        import traceback
        traceback.print_exc()


def handle_subscription_deleted(subscription):
    """Handle subscription cancellation - downgrade to free"""
    try:
        db = get_db()
        if not db:
            return
        
        customer_id = subscription.get('customer')
        if not customer_id:
            return
        
        # Find user by customer ID and downgrade
        users_ref = db.collection('users')
        query = users_ref.where('stripeCustomerId', '==', customer_id).limit(1)
        docs = query.stream()
        
        for doc in docs:
            user_ref = users_ref.document(doc.id)
            tier_config = TIER_CONFIGS['free']
            user_ref.update({
                'subscriptionTier': 'free',
                'tier': 'free',
                'maxCredits': tier_config['credits'],
                'credits': min(doc.to_dict().get('credits', 0), tier_config['credits']),  # Cap at free tier limit
                'subscriptionStatus': None,
                'stripeSubscriptionId': None,
                'lastCreditReset': datetime.now().isoformat(),
                'updatedAt': datetime.now().isoformat(),
                # Stamp canceledAt so the win-back lifecycle email sequence
                # picks this user up 30 days later.
                'canceledAt': datetime.utcnow(),
            })
            print(f"✅ User {doc.id} downgraded to free")
            try:
                from app.utils.posthog_client import track_event
                track_event(doc.id, 'subscription_canceled', {
                    'previous_tier': doc.to_dict().get('subscriptionTier') or doc.to_dict().get('tier'),
                    'stripe_customer_id': customer_id,
                }, sync=True)
            except Exception:
                pass
            break
        
    except Exception as e:
        print(f"Error handling subscription deletion: {e}")
        import traceback
        traceback.print_exc()


def handle_invoice_paid(invoice):
    """Handle successful invoice payment - reset monthly credits and usage counters.

    Idempotent: tracks the Stripe invoice ID to prevent double-resets from
    webhook retries.
    """
    try:
        db = get_db()
        if not db:
            return

        customer_id = invoice.get('customer')
        subscription_id = invoice.get('subscription')
        invoice_id = invoice.get('id')  # e.g. "in_1Nxxxx..."

        if not customer_id or not subscription_id:
            return

        # Determine tier from Stripe subscription FIRST (source of truth)
        tier = 'pro'  # Default
        price_id = None
        try:
            subscription = stripe.Subscription.retrieve(subscription_id)
            if subscription.items.data:
                price_id = subscription.items.data[0].price.id
                tier = get_tier_from_price_id(price_id)
        except Exception as e:
            print(f"Error retrieving subscription: {e}")
            return  # Can't determine tier — don't reset blindly

        # Only reset for Pro/Elite tiers
        if tier not in ['pro', 'elite']:
            print(f"⚠️ Invoice paid for non-paid tier subscription - skipping reset")
            return

        tier_config = TIER_CONFIGS.get(tier, TIER_CONFIGS['pro'])

        # Find user by customer ID
        users_ref = db.collection('users')
        query = users_ref.where('stripeCustomerId', '==', customer_id).limit(1)
        docs = query.stream()

        for doc in docs:
            user_ref = users_ref.document(doc.id)
            user_data = doc.to_dict()

            # Idempotency check: skip if we already processed this invoice
            last_invoice = user_data.get('lastProcessedInvoiceId')
            if invoice_id and last_invoice == invoice_id:
                print(f"⚠️ Invoice {invoice_id} already processed for user {doc.id}, skipping")
                return

            # Reset credits, usage counters, AND sync Firestore tier from Stripe
            update_data = {
                'subscriptionTier': tier,
                'tier': tier,
                'credits': tier_config['credits'],
                'maxCredits': tier_config['credits'],
                'alumniSearchesUsed': 0,
                'coffeeChatPrepsUsed': 0,
                'interviewPrepsUsed': 0,
                'lastCreditReset': datetime.now().isoformat(),
                'lastUsageReset': datetime.now().isoformat(),
                'updatedAt': datetime.now().isoformat(),
                'trialActive': False,  # a paid invoice means no active no-card trial
            }
            if invoice_id:
                update_data['lastProcessedInvoiceId'] = invoice_id

            user_ref.update(update_data)

            print(f"✅ Monthly reset for user {doc.id} → tier={tier} (price_id={price_id}, invoice={invoice_id}): {tier_config['credits']} credits restored, usage counters reset")
            break

    except Exception as e:
        print(f"Error handling invoice payment: {e}")
        import traceback
        traceback.print_exc()


def handle_subscription_updated(subscription):
    """Handle subscription updates (e.g., tier changes, plan upgrades/downgrades)"""
    try:
        db = get_db()
        if not db:
            return
        
        customer_id = subscription.get('customer')
        if not customer_id:
            return
        
        # Determine tier from subscription price ID
        tier = 'pro'  # Default
        if subscription.items.data:
            price_id = subscription.items.data[0].price.id
            tier = get_tier_from_price_id(price_id)
        
        tier_config = TIER_CONFIGS.get(tier, TIER_CONFIGS['pro'])
        
        # Find user by customer ID and update tier
        users_ref = db.collection('users')
        query = users_ref.where('stripeCustomerId', '==', customer_id).limit(1)
        docs = query.stream()
        
        for doc in docs:
            user_ref = users_ref.document(doc.id)
            user_data = doc.to_dict()
            current_credits = user_data.get('credits', 0)
            
            # If upgrading, give full credits. If downgrading, cap at new tier limit
            new_credits = tier_config['credits'] if tier in ['pro', 'elite'] else min(current_credits, tier_config['credits'])
            
            user_ref.update({
                'subscriptionTier': tier,
                'tier': tier,
                'maxCredits': tier_config['credits'],
                'credits': new_credits,
                'stripeSubscriptionId': subscription.id,
                'subscriptionStatus': subscription.status,
                'updatedAt': datetime.now().isoformat(),
                'trialActive': False,  # paid subscription change ends any no-card trial
            })
            price_id = subscription.items.data[0].price.id if subscription.items.data else None
            print(f"✅ User {doc.id} subscription updated to {tier} (price_id={price_id})")
            try:
                from app.utils.posthog_client import track_event
                track_event(doc.id, 'subscription_changed', {
                    'tier': tier,
                    'price_id': price_id,
                    'subscription_status': subscription.status,
                    'previous_tier': user_data.get('subscriptionTier') or user_data.get('tier'),
                }, sync=True)
            except Exception:
                pass
            break
        
    except Exception as e:
        print(f"Error handling subscription update: {e}")
        import traceback
        traceback.print_exc()


def update_subscription_tier():
    """Update an existing subscription to a different tier (e.g., Pro → Elite)"""
    try:
        if not STRIPE_SECRET_KEY:
            return jsonify({'error': 'Stripe not configured'}), 500

        stripe.api_key = STRIPE_SECRET_KEY

        data = request.get_json() or {}
        user_id = request.firebase_user.get('uid')
        new_price_id = data.get('priceId')

        if not user_id or not new_price_id:
            return jsonify({'error': 'User ID and price ID are required'}), 400

        # Get user's current subscription from Firestore
        db = get_db()
        if not db:
            return jsonify({'error': 'Database not available'}), 500

        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()

        if not user_doc.exists:
            return jsonify({'error': 'User not found'}), 404

        user_data = user_doc.to_dict()
        subscription_id = user_data.get('stripeSubscriptionId')

        if not subscription_id:
            return jsonify({'error': 'No active subscription found. Use checkout instead.'}), 400

        # Retrieve the current subscription
        subscription = stripe.Subscription.retrieve(subscription_id)

        if subscription.status not in ['active', 'trialing']:
            return jsonify({'error': 'Subscription is not active'}), 400

        # Get the current subscription item ID (needed for modification)
        current_item_id = subscription.items.data[0].id

        # Modify the subscription — swap the price
        # proration_behavior='create_prorations' charges the difference immediately
        updated_subscription = stripe.Subscription.modify(
            subscription_id,
            items=[{
                'id': current_item_id,
                'price': new_price_id,
            }],
            proration_behavior='create_prorations',
        )

        # Determine new tier and update Firestore
        new_tier = get_tier_from_price_id(new_price_id)
        tier_config = TIER_CONFIGS.get(new_tier, TIER_CONFIGS['pro'])

        user_ref.update({
            'subscriptionTier': new_tier,
            'tier': new_tier,
            'maxCredits': tier_config['credits'],
            'credits': tier_config['credits'],
            'subscriptionStatus': updated_subscription.status,
            'updatedAt': datetime.now().isoformat(),
            'trialActive': False,  # paid tier change ends any no-card trial
        })

        print(f"[Stripe] User upgraded subscription to {new_tier}")

        return jsonify({
            'success': True,
            'tier': new_tier,
            'status': updated_subscription.status
        })

    except stripe.error.StripeError as e:
        print(f"Stripe error updating subscription: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        print(f"Error updating subscription: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def create_portal_session():
    """Create Stripe customer portal session"""
    try:
        if not STRIPE_SECRET_KEY:
            return jsonify({'error': 'Stripe not configured'}), 500
        
        stripe.api_key = STRIPE_SECRET_KEY
        
        user_id = request.firebase_user.get('uid')
        data = request.get_json() or {}
        return_url = data.get('returnUrl') or f'{request.url_root}pricing'
        
        db = get_db()
        
        if not db:
            return jsonify({'error': 'Database not available'}), 500
        
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            return jsonify({'error': 'User not found'}), 404
        
        user_data = user_doc.to_dict()
        customer_id = user_data.get('stripeCustomerId')
        
        if not customer_id:
            return jsonify({'error': 'No Stripe customer ID found. Please contact support.'}), 404
        
        # Verify customer exists and is accessible with current Stripe key
        try:
            customer = stripe.Customer.retrieve(customer_id)
            if not customer:
                return jsonify({
                    'error': 'Stripe customer not found. This may be due to a test/live mode mismatch. Please contact support.',
                    'details': 'Customer ID exists in database but not accessible with current Stripe key'
                }), 400
        except stripe.error.InvalidRequestError as e:
            error_msg = str(e)
            if 'test mode' in error_msg.lower() or 'live mode' in error_msg.lower():
                return jsonify({
                    'error': 'Stripe mode mismatch detected. The customer was created in a different Stripe mode (test vs live).',
                    'details': 'Please ensure your Stripe keys match the mode used when the subscription was created.',
                    'customer_id': customer_id
                }), 400
            raise
        
        # Create portal session
        try:
            session = stripe.billing_portal.Session.create(
                customer=customer_id,
                return_url=return_url,
            )
            print(f"[Stripe] Created portal session")
            return jsonify({'url': session.url})
        except stripe.error.StripeError as e:
            print(f"❌ Stripe error creating portal session: {e}")
            return jsonify({
                'error': 'Failed to create Stripe portal session',
                'details': str(e)
            }), 400
        
    except Exception as e:
        print(f"Portal session error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': 'Failed to open subscription management',
            'details': str(e)
        }), 500

