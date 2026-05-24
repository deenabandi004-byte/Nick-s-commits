"""
Stripe client service - payment processing and subscription management
"""
import stripe
from datetime import datetime
from flask import request, jsonify
from app.config import STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, TIER_CONFIGS, STRIPE_PRO_PRICE_ID, STRIPE_ELITE_PRICE_ID
from app.extensions import get_db
from app.services.auth import check_and_reset_credits


def get_tier_from_price_id(price_id: str) -> str:
    """Determine tier from Stripe price ID"""
    if not price_id:
        return 'pro'
    if price_id == STRIPE_ELITE_PRICE_ID:
        return 'elite'
    elif price_id == STRIPE_PRO_PRICE_ID:
        return 'pro'
    else:
        # Unknown price ID: default to pro for backward compatibility; log so we can spot Elite price ID mismatch
        print(f"⚠️ Unknown Stripe price_id={price_id!r}, defaulting to 'pro'. Check STRIPE_ELITE_PRICE_ID ({STRIPE_ELITE_PRICE_ID!r}) / STRIPE_PRO_PRICE_ID ({STRIPE_PRO_PRICE_ID!r}).")
        return 'pro'


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

        # .edu users get a 30-day trial (full recruiting-cycle); everyone else gets 14 days (SaaS standard).
        # is_student is set at signup in create_user_data; reading it here gates the trial length
        # and locks in lifetime student pricing via metadata on the subscription.
        is_student = False
        verified_edu_email = None
        try:
            user_doc = get_db().collection('users').document(user_id).get()
            if user_doc.exists:
                user_record = user_doc.to_dict() or {}
                is_student = bool(user_record.get('isStudent'))
                verified_edu_email = user_record.get('verifiedEduEmail')
        except Exception as lookup_err:
            print(f"[Stripe] Could not read isStudent for {user_id}: {lookup_err}. Defaulting to non-student trial.")

        trial_days = 30 if is_student else 14

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
                'isStudent': 'true' if is_student else 'false',
            },
            'subscription_data': {
                'trial_period_days': trial_days,
                'metadata': {
                    'user_id': user_id,
                    'isStudent': 'true' if is_student else 'false',
                    'studentLockIn': 'true' if is_student else 'false',
                    'verifiedEduEmail': verified_edu_email or '',
                },
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
            handle_checkout_completed(event['data']['object'])
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
        user_ref.update({
            'subscriptionTier': tier,
            'tier': tier,  # Keep for backward compatibility
            'maxCredits': tier_config['credits'],
            'credits': tier_config['credits'],
            'stripeSubscriptionId': subscription_id,
            'stripeCustomerId': session.get('customer'),
            'subscriptionStatus': sub_status,
            'lastCreditReset': datetime.now().isoformat(),
            'upgraded_at': datetime.now().isoformat(),
            'updatedAt': datetime.now().isoformat()
        })
        
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
                'updatedAt': datetime.now().isoformat()
            })
            print(f"✅ User {doc.id} downgraded to free")
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
            return  # Can't determine tier - don't reset blindly

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
                'lastCreditReset': datetime.now().isoformat(),
                'lastUsageReset': datetime.now().isoformat(),
                'updatedAt': datetime.now().isoformat(),
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


def _apply_monthly_reset(user_ref, user_data: dict, tier: str) -> bool:
    """Apply a monthly credit/usage reset to a single user.

    Idempotent at month granularity - checks lastCreditReset and skips
    if it's already in the current calendar month.

    Returns True if a reset was applied, False if skipped.
    """
    tier_config = TIER_CONFIGS.get(tier)
    if not tier_config:
        return False

    current_month_key = datetime.now().strftime('%Y-%m')
    last_reset = user_data.get('lastCreditReset') or ''
    last_reset_month = last_reset[:7] if isinstance(last_reset, str) else ''

    if last_reset_month == current_month_key:
        return False  # already reset this month

    user_ref.update({
        'credits': tier_config['credits'],
        'maxCredits': tier_config['credits'],
        'alumniSearchesUsed': 0,
        'coffeeChatPrepsUsed': 0,
        'lastCreditReset': datetime.now().isoformat(),
        'lastUsageReset': datetime.now().isoformat(),
        'updatedAt': datetime.now().isoformat(),
    })
    return True


def reset_credits_for_active_subscribers() -> dict:
    """Monthly credit refill safety net for active Pro/Elite subscribers.

    Stripe's `invoice.payment_succeeded` webhook fires once per billing cycle.
    For annual subscribers that's once a year - so without this cron, an annual
    Pro user would get 3,000 credits and be expected to stretch them across 12
    months. This loop catches that case and also acts as a safety net for any
    monthly subscriber whose webhook was dropped or delayed.

    Idempotent: refuses to reset a user more than once in the same calendar
    month, so running this hourly is safe (and cheap - most users skip
    immediately on the month-key check).

    Returns a summary dict for the daemon to log: {reset, skipped, failed}.
    """
    db = get_db()
    if not db:
        return {'error': 'no_db', 'reset': 0, 'skipped': 0, 'failed': 0}

    reset_count = 0
    skip_count = 0
    fail_count = 0

    users_ref = db.collection('users')
    # Filter by tier server-side; subscription status filtered in Python so
    # we don't need a Firestore composite index.
    try:
        query = users_ref.where('subscriptionTier', 'in', ['pro', 'elite'])
        candidates = list(query.stream())
    except Exception as e:
        print(f"❌ Credit-refill cron query failed: {e}")
        return {'error': str(e), 'reset': 0, 'skipped': 0, 'failed': 0}

    for doc in candidates:
        try:
            user_data = doc.to_dict() or {}
            status = user_data.get('subscriptionStatus')
            if status not in ('active', 'trialing'):
                skip_count += 1
                continue

            tier = user_data.get('subscriptionTier') or user_data.get('tier') or 'pro'
            user_ref = users_ref.document(doc.id)

            if _apply_monthly_reset(user_ref, user_data, tier):
                reset_count += 1
                print(f"✅ Cron monthly reset: user={doc.id} tier={tier}")
            else:
                skip_count += 1
        except Exception as e:
            fail_count += 1
            print(f"❌ Cron reset failed for user {doc.id}: {e}")

    return {'reset': reset_count, 'skipped': skip_count, 'failed': fail_count}


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
                'updatedAt': datetime.now().isoformat()
            })
            price_id = subscription.items.data[0].price.id if subscription.items.data else None
            print(f"✅ User {doc.id} subscription updated to {tier} (price_id={price_id})")
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

        # Modify the subscription - swap the price
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
            'updatedAt': datetime.now().isoformat()
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

