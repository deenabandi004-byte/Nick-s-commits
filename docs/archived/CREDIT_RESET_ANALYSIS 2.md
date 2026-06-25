# Credit Reset Analysis - 30 Day Cycle

## Current Implementation

### ✅ What's Working

1. **Reactive Credit Reset (`check_and_reset_credits`):**
   - Located in `backend/app/services/auth.py`
   - Checks if 30 days have passed since `lastCreditReset`
   - Resets credits to tier maximum when called
   - Called automatically when:
     - User checks credits (`/api/check-credits`)
     - User uses credits (contact search, firm search, etc.)
     - User accesses subscription status

2. **Credit Reset Logic:**
   ```python
   def check_and_reset_credits(user_ref, user_data):
       last_reset = _parse_datetime(user_data.get('lastCreditReset'))
       days_since_reset = (datetime.now() - last_reset).days
       
       if days_since_reset >= 30:
           # Reset credits to tier maximum
           tier = user_data.get('subscriptionTier') or user_data.get('tier', 'free')
           max_credits = TIER_CONFIGS[tier]['credits']
           user_ref.update({
               'credits': max_credits,
               'lastCreditReset': datetime.now().isoformat()
           })
   ```

### ⚠️ Potential Issues

#### 1. **No Proactive Reset on Subscription Renewal**

**Problem:**
- Credits are only reset **reactively** when users check/use credits
- There's **NO webhook handler** for `invoice.payment_succeeded` (Stripe subscription renewal event)
- If a user's subscription renews but they don't use the app, credits won't reset until they return

**Current Webhook Handlers:**
- ✅ `checkout.session.completed` - Initial subscription creation
- ✅ `customer.subscription.deleted` - Subscription cancellation
- ✅ `customer.subscription.updated` - Subscription plan changes
- ❌ **MISSING:** `invoice.payment_succeeded` - Monthly renewal payments

**Impact:**
- Low impact for active users (they'll trigger reset when using app)
- Medium impact for inactive users (credits won't reset until they return)
- Could cause confusion if user expects credits to reset on renewal date

#### 2. **Initial Upgrade Doesn't Set Reset Date**

**Problem:**
In `handle_checkout_completed()` (line 150-195 in `stripe_client.py`):
- Sets credits to tier maximum ✅
- Sets `upgraded_at` timestamp ✅
- **Does NOT set `lastCreditReset`** ❌

**Impact:**
- First reset might happen immediately if user checks credits right after upgrade
- Or might not reset for 30 days from upgrade date
- Inconsistent behavior

#### 3. **Subscription Update Doesn't Reset Credits**

**Problem:**
In `handle_subscription_updated()` (line 234-281 in `stripe_client.py`):
- Updates tier and credits ✅
- **Does NOT reset `lastCreditReset`** ❌
- **Does NOT call `check_and_reset_credits()`** ❌

**Impact:**
- If subscription renews (status changes to `active`), credits won't automatically reset
- User must use the app to trigger reset check

## Recommended Fixes

### 🔴 High Priority: Add Invoice Payment Webhook Handler

**Add to `backend/app/services/stripe_client.py`:**

```python
def handle_invoice_payment_succeeded(invoice):
    """Handle successful invoice payment - reset credits on subscription renewal"""
    try:
        db = get_db()
        if not db:
            return
        
        subscription_id = invoice.get('subscription')
        if not subscription_id:
            return
        
        # Get subscription to find customer
        stripe.api_key = STRIPE_SECRET_KEY
        subscription = stripe.Subscription.retrieve(subscription_id)
        customer_id = subscription.get('customer')
        
        if not customer_id:
            return
        
        # Find user by customer ID
        users_ref = db.collection('users')
        query = users_ref.where('stripeCustomerId', '==', customer_id).limit(1)
        docs = query.stream()
        
        for doc in docs:
            user_ref = users_ref.document(doc.id)
            user_data = doc.to_dict()
            tier = user_data.get('subscriptionTier') or user_data.get('tier', 'free')
            tier_config = TIER_CONFIGS.get(tier, TIER_CONFIGS['free'])
            
            # Reset credits on renewal
            user_ref.update({
                'credits': tier_config['credits'],
                'lastCreditReset': datetime.now().isoformat(),
                'lastRenewal': datetime.now().isoformat()
            })
            
            print(f"✅ Credits reset on renewal for user {doc.id} ({tier} tier)")
            break
        
    except Exception as e:
        print(f"Error handling invoice payment: {e}")
        import traceback
        traceback.print_exc()
```

**Update `handle_stripe_webhook()` to include:**
```python
elif event['type'] == 'invoice.payment_succeeded':
    handle_invoice_payment_succeeded(event['data']['object'])
```

### 🟡 Medium Priority: Fix Initial Upgrade

**Update `handle_checkout_completed()` to set reset date:**
```python
user_ref.update({
    'subscriptionTier': tier,
    'tier': tier,
    'maxCredits': tier_config['credits'],
    'credits': tier_config['credits'],
    'stripeSubscriptionId': subscription_id,
    'stripeCustomerId': session.get('customer'),
    'subscriptionStatus': 'active',
    'upgraded_at': datetime.now().isoformat(),
    'lastCreditReset': datetime.now().isoformat(),  # ✅ ADD THIS
    'updatedAt': datetime.now().isoformat()
})
```

### 🟡 Medium Priority: Fix Subscription Update

**Update `handle_subscription_updated()` to reset credits if renewing:**
```python
# Check if subscription just renewed (status changed to active)
subscription_status = subscription.status
old_status = user_data.get('subscriptionStatus')

# If subscription just became active (renewal), reset credits
if subscription_status == 'active' and old_status != 'active':
    new_credits = tier_config['credits']
    user_ref.update({
        'lastCreditReset': datetime.now().isoformat(),  # ✅ ADD THIS
        'lastRenewal': datetime.now().isoformat()  # ✅ ADD THIS
    })
```

## Current Behavior Summary

| Scenario | Credit Reset? | When? |
|----------|---------------|-------|
| User checks credits | ✅ Yes | If 30+ days since last reset |
| User uses credits | ✅ Yes | If 30+ days since last reset |
| Subscription renews (Stripe) | ❌ **No** | Not handled |
| Initial upgrade | ⚠️ Partial | Sets credits but not reset date |
| Subscription updated | ❌ No | Only updates tier/credits |

## Testing Recommendations

1. **Test Reactive Reset:**
   - Set `lastCreditReset` to 31 days ago
   - Call `/api/check-credits`
   - Verify credits reset to tier maximum

2. **Test Webhook (when implemented):**
   - Use Stripe CLI to send `invoice.payment_succeeded` event
   - Verify credits reset automatically
   - Verify `lastCreditReset` is updated

3. **Test Edge Cases:**
   - User upgrades, then immediately checks credits
   - User's subscription renews but they don't use app for 60 days
   - User downgrades tier mid-cycle

## Conclusion

**Current Status:** ⚠️ **Partially Working**

- Credits DO reset every 30 days, but only when users interact with the app
- Credits do NOT automatically reset on Stripe subscription renewal
- This is acceptable for active users but could cause issues for inactive users

**Recommendation:** 
- Add `invoice.payment_succeeded` webhook handler for proactive resets
- Fix initial upgrade to set `lastCreditReset`
- This ensures credits reset on the actual renewal date, not just when users check















