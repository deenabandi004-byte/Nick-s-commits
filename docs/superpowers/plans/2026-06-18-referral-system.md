# Referral System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user earn one free month of Elite (a Stripe trial that converts to paid) when 5 people sign up through their referral link.

**Architecture:** A new `referrals` Flask blueprint exposes three endpoints (`/me`, `/attribute`, `/claim`) backed by a function-based `referral_service`. Referral attribution is recorded server-side at signup with per-referred-user dedupe docs. The reward is delivered through existing Stripe machinery — a 30-day-trial Elite Checkout for free users, or a 100%-off one-month coupon for users who already pay. Stripe owns the free-month clock, so there is no custom expiry job. The frontend captures `?ref=` at signup, fires attribution on first account creation, and surfaces progress + a claim button in Account Settings.

**Tech Stack:** Flask 3.0, firebase-admin (Firestore), stripe 8.0, React 18 + TypeScript, Vite, pytest.

## Global Constraints

- Backend reads tier from Firestore only; never trust client-sent tier. Source-of-truth field is `subscriptionTier` (legacy fallback `tier`).
- `@require_tier` must appear ABOVE `@require_firebase_auth` (decorators run inside-out). These endpoints only need `@require_firebase_auth`.
- New blueprints MUST be registered in `backend/wsgi.py` (not `app/__init__.py`).
- Services are function-based modules, not classes.
- Frontend has NO test framework — frontend tasks are verified manually, backend tasks use pytest.
- Reward is one-time per referrer in v1. Qualifying event is signup only (no activation bar).
- Referral target count = 5. Reward tier = Elite. Free-user reward = Stripe Checkout with `trial_period_days=30`. Paid-user reward = 100%-off-once coupon `STRIPE_REFERRAL_REWARD_COUPON_ID`.
- Run backend tests with `FLASK_ENV=testing`. From repo root: `cd backend && FLASK_ENV=testing pytest tests/test_referrals.py -v`.

---

## File Structure

**Backend**
- Create: `backend/app/services/referral_service.py` — all referral logic (code gen, attribution, status, claim). Pure helpers + Firestore/Stripe orchestration.
- Create: `backend/app/routes/referrals.py` — `referrals_bp` blueprint, 3 thin routes.
- Create: `backend/tests/test_referrals.py` — pytest coverage.
- Modify: `backend/app/config.py` — add `referral_reward` coupon + `REFERRAL_TARGET_COUNT` / `REFERRAL_REWARD_TIER` constants.
- Modify: `backend/app/services/stripe_client.py` — add `create_referral_trial_checkout()`, `apply_referral_reward_coupon()`, and a referral branch in `handle_checkout_completed()`.
- Modify: `backend/wsgi.py` — import + register `referrals_bp`.
- Modify: `firestore.rules` — protect referral fields/subcollection from client writes.

**Frontend**
- Modify: `connect-grow-hire/src/services/api.ts` — `getReferralStatus()`, `attributeReferral()`, `claimReferralReward()`.
- Modify: `connect-grow-hire/src/pages/SignIn.tsx` — persist `?ref=` to localStorage.
- Modify: `connect-grow-hire/src/contexts/FirebaseAuthContext.tsx` — call attribution after first account creation.
- Modify: `connect-grow-hire/src/pages/AccountSettings.tsx` — "Refer & Earn" section + nav entry.

**Firestore data**
- `users/{uid}` fields: `referralCode`, `referredBy`, `referralQualifiedCount`, `referralRewardClaimed`, `referralRewardClaimedAt`.
- `referralCodes/{code}` → `{ uid }` (code→owner lookup).
- `users/{ownerUid}/referrals/{referredUid}` → `{ signedUpAt }` (dedupe + audit).

---

## Task 1: Config constants and reward coupon

**Files:**
- Modify: `backend/app/config.py` (STRIPE_COUPONS dict, ~line 268-277)
- Test: `backend/tests/test_referrals.py`

**Interfaces:**
- Produces: `STRIPE_COUPONS['referral_reward']`, `REFERRAL_TARGET_COUNT = 5`, `REFERRAL_REWARD_TIER = 'elite'` (module-level in `config.py`).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_referrals.py`:

```python
from app import config


def test_referral_config_constants():
    assert config.REFERRAL_TARGET_COUNT == 5
    assert config.REFERRAL_REWARD_TIER == 'elite'
    assert 'referral_reward' in config.STRIPE_COUPONS
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_referrals.py::test_referral_config_constants -v`
Expected: FAIL with `AttributeError: module 'app.config' has no attribute 'REFERRAL_TARGET_COUNT'`

- [ ] **Step 3: Add config**

In `backend/app/config.py`, add the new coupon entry inside `STRIPE_COUPONS`:

```python
STRIPE_COUPONS = {
    'pricing_recapture': os.getenv('STRIPE_PRICING_RECAPTURE_COUPON_ID',   ''),  # 20% off Pro — STAYHIRED
    'winback':           os.getenv('STRIPE_WINBACK_COUPON_ID',             ''),  # 50% off Pro — WELCOMEBACK
    'checkout_recovery': os.getenv('STRIPE_CHECKOUT_RECOVERY_COUPON_ID',   ''),  # 20% off — WARMINTRO
    'referral_reward':   os.getenv('STRIPE_REFERRAL_REWARD_COUPON_ID',     ''),  # 100% off one month for paying referrers
}

# ========================================
# Referral program
# ========================================
REFERRAL_TARGET_COUNT = 5          # signups needed to unlock the reward
REFERRAL_REWARD_TIER = 'elite'     # tier granted by the reward
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_referrals.py::test_referral_config_constants -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/config.py backend/tests/test_referrals.py
git commit -m "feat(referrals): add referral config constants and reward coupon"
```

---

## Task 2: Pure helpers in referral_service

**Files:**
- Create: `backend/app/services/referral_service.py`
- Test: `backend/tests/test_referrals.py`

**Interfaces:**
- Produces:
  - `generate_code() -> str` — 8-char uppercase alphanumeric, no ambiguous chars (no `0/O/1/I`).
  - `is_self_referral(owner_uid: str, owner_email: str, new_uid: str, new_email: str) -> bool`
  - `is_eligible(qualified_count: int, reward_claimed: bool) -> bool` — true when `count >= REFERRAL_TARGET_COUNT and not reward_claimed`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_referrals.py`:

```python
from app.services import referral_service as rs


def test_generate_code_shape():
    code = rs.generate_code()
    assert len(code) == 8
    assert code.isupper() or code.isdigit() or code.isalnum()
    for bad in ('0', 'O', '1', 'I'):
        assert bad not in code


def test_generate_code_is_random():
    codes = {rs.generate_code() for _ in range(50)}
    assert len(codes) > 45  # overwhelmingly unique


def test_is_self_referral_uid_match():
    assert rs.is_self_referral('u1', 'a@x.com', 'u1', 'b@x.com') is True


def test_is_self_referral_email_match_case_insensitive():
    assert rs.is_self_referral('u1', 'A@X.com', 'u2', 'a@x.com') is True


def test_is_self_referral_distinct():
    assert rs.is_self_referral('u1', 'a@x.com', 'u2', 'b@x.com') is False


def test_is_eligible():
    assert rs.is_eligible(5, False) is True
    assert rs.is_eligible(6, False) is True
    assert rs.is_eligible(4, False) is False
    assert rs.is_eligible(5, True) is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_referrals.py -v -k "generate_code or self_referral or is_eligible"`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.referral_service'`

- [ ] **Step 3: Create the service with pure helpers**

Create `backend/app/services/referral_service.py`:

```python
"""
Referral program logic.

Functions are split into pure helpers (no I/O, unit-tested directly) and
orchestration functions that touch Firestore / Stripe.
"""
import secrets
from datetime import datetime, timezone

from app.config import REFERRAL_TARGET_COUNT, REFERRAL_REWARD_TIER

# Unambiguous alphabet (no 0/O/1/I)
_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_CODE_LENGTH = 8


def generate_code() -> str:
    """Return a random 8-char referral code from an unambiguous alphabet."""
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(_CODE_LENGTH))


def is_self_referral(owner_uid: str, owner_email: str,
                     new_uid: str, new_email: str) -> bool:
    """True if the referred user is (or looks like) the code owner."""
    if owner_uid and new_uid and owner_uid == new_uid:
        return True
    if owner_email and new_email and owner_email.strip().lower() == new_email.strip().lower():
        return True
    return False


def is_eligible(qualified_count: int, reward_claimed: bool) -> bool:
    """True when the referrer can claim their (one-time) reward."""
    return qualified_count >= REFERRAL_TARGET_COUNT and not reward_claimed
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_referrals.py -v -k "generate_code or self_referral or is_eligible"`
Expected: PASS (6 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/referral_service.py backend/tests/test_referrals.py
git commit -m "feat(referrals): pure helpers for code gen, self-referral, eligibility"
```

---

## Task 3: Code generation + status (Firestore orchestration)

**Files:**
- Modify: `backend/app/services/referral_service.py`
- Test: `backend/tests/test_referrals.py`

**Interfaces:**
- Consumes: `generate_code()` (Task 2), `get_db()`-style Firestore client passed in as `db`.
- Produces:
  - `get_or_create_referral_code(db, uid: str) -> str` — returns existing `referralCode` from `users/{uid}`; if absent, generates one, writes it to the user doc, and writes `referralCodes/{code}` → `{uid}`. Idempotent.
  - `get_referral_status(db, uid: str) -> dict` — `{referralCode, referralLink, signupCount, signupTarget, eligible, rewardClaimed, rewardClaimedAt}`. Uses `FRONTEND_BASE_URL` env (default `https://offerloop.ai`).

The tests use `MagicMock` Firestore handles and assert calls, mirroring the existing repo test style (`tests/test_agent_actions_auto_send.py`).

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_referrals.py`:

```python
from unittest.mock import MagicMock


def _user_snapshot(data, exists=True):
    snap = MagicMock()
    snap.exists = exists
    snap.to_dict.return_value = data
    return snap


def test_get_or_create_returns_existing_code():
    db = MagicMock()
    user_ref = db.collection.return_value.document.return_value
    user_ref.get.return_value = _user_snapshot({'referralCode': 'EXISTING1'})

    code = rs.get_or_create_referral_code(db, 'u1')

    assert code == 'EXISTING1'
    user_ref.set.assert_not_called()
    user_ref.update.assert_not_called()


def test_get_or_create_generates_when_missing():
    db = MagicMock()
    user_ref = db.collection.return_value.document.return_value
    user_ref.get.return_value = _user_snapshot({'email': 'a@x.com'})

    code = rs.get_or_create_referral_code(db, 'u1')

    assert len(code) == 8
    # writes code onto the user doc and into the lookup collection
    user_ref.update.assert_called_once()
    assert user_ref.update.call_args[0][0]['referralCode'] == code
    db.collection.assert_any_call('referralCodes')


def test_get_referral_status_shape():
    db = MagicMock()
    user_ref = db.collection.return_value.document.return_value
    user_ref.get.return_value = _user_snapshot({
        'referralCode': 'CODE1234',
        'referralQualifiedCount': 5,
        'referralRewardClaimed': False,
    })

    status = rs.get_referral_status(db, 'u1')

    assert status['referralCode'] == 'CODE1234'
    assert status['signupCount'] == 5
    assert status['signupTarget'] == 5
    assert status['eligible'] is True
    assert status['rewardClaimed'] is False
    assert status['referralLink'].endswith('ref=CODE1234')
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_referrals.py -v -k "get_or_create or referral_status"`
Expected: FAIL with `AttributeError: module ... has no attribute 'get_or_create_referral_code'`

- [ ] **Step 3: Add orchestration functions**

Append to `backend/app/services/referral_service.py`:

```python
import os


def _referral_link(code: str) -> str:
    base = os.getenv('FRONTEND_BASE_URL', 'https://offerloop.ai').rstrip('/')
    return f"{base}/signin?ref={code}"


def get_or_create_referral_code(db, uid: str) -> str:
    """Return the user's referral code, generating + persisting one if needed."""
    user_ref = db.collection('users').document(uid)
    snap = user_ref.get()
    data = snap.to_dict() if snap and snap.exists else {}
    existing = (data or {}).get('referralCode')
    if existing:
        return existing

    # Generate a code and reserve it in the lookup collection. An 8-char code
    # from a 32-symbol alphabet makes collisions astronomically unlikely, so we
    # generate-and-write directly (no pre-read collision loop — YAGNI).
    code = generate_code()
    db.collection('referralCodes').document(code).set(
        {'uid': uid, 'createdAt': datetime.now(timezone.utc)}
    )
    user_ref.update({'referralCode': code})
    return code


def get_referral_status(db, uid: str) -> dict:
    """Return the referral dashboard payload for the current user."""
    code = get_or_create_referral_code(db, uid)
    snap = db.collection('users').document(uid).get()
    data = snap.to_dict() if snap and snap.exists else {}
    count = int((data or {}).get('referralQualifiedCount', 0) or 0)
    claimed = bool((data or {}).get('referralRewardClaimed', False))
    claimed_at = (data or {}).get('referralRewardClaimedAt')
    return {
        'referralCode': code,
        'referralLink': _referral_link(code),
        'signupCount': count,
        'signupTarget': REFERRAL_TARGET_COUNT,
        'eligible': is_eligible(count, claimed),
        'rewardClaimed': claimed,
        'rewardClaimedAt': claimed_at.isoformat() if hasattr(claimed_at, 'isoformat') else claimed_at,
    }
```

Note: `get_referral_status` re-reads the user doc after `get_or_create_referral_code`. In the "existing code" test path `user_ref.get` returns the same snapshot both times — that's fine. In the "generates" test for status, the snapshot already carries `referralCode`, so no second branch is exercised.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_referrals.py -v -k "get_or_create or referral_status"`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/referral_service.py backend/tests/test_referrals.py
git commit -m "feat(referrals): code generation and status orchestration"
```

---

## Task 4: Signup attribution

**Files:**
- Modify: `backend/app/services/referral_service.py`
- Test: `backend/tests/test_referrals.py`

**Interfaces:**
- Consumes: `is_self_referral()` (Task 2).
- Produces: `record_referral_signup(db, code: str, new_uid: str, new_email: str) -> dict` returning `{'recorded': bool, 'reason': str|None}`. Reasons: `'invalid_code'`, `'self_referral'`, `'already_referred'`, `'duplicate'`. On success it (a) sets `referredBy` on the new user, (b) writes `users/{ownerUid}/referrals/{newUid}` dedupe doc, (c) increments owner `referralQualifiedCount` via `firestore.Increment(1)`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_referrals.py`:

```python
def _make_db_for_attribution(*, code_exists=True, owner_uid='owner1',
                             owner_email='owner@x.com',
                             new_already_referred=False,
                             dedupe_exists=False):
    """Build a MagicMock db wired for record_referral_signup paths."""
    db = MagicMock()

    code_snap = _user_snapshot({'uid': owner_uid}, exists=code_exists)
    owner_snap = _user_snapshot({'email': owner_email})
    new_snap = _user_snapshot(
        {'referredBy': 'SOMECODE'} if new_already_referred else {'email': 'new@x.com'}
    )
    dedupe_snap = MagicMock(); dedupe_snap.exists = dedupe_exists

    def collection(name):
        col = MagicMock()
        if name == 'referralCodes':
            col.document.return_value.get.return_value = code_snap
        elif name == 'users':
            def document(uid):
                d = MagicMock()
                if uid == owner_uid:
                    d.get.return_value = owner_snap
                    d.collection.return_value.document.return_value.get.return_value = dedupe_snap
                else:
                    d.get.return_value = new_snap
                return d
            col.document.side_effect = document
        return col

    db.collection.side_effect = collection
    return db


def test_attribute_invalid_code():
    db = _make_db_for_attribution(code_exists=False)
    out = rs.record_referral_signup(db, 'NOPE', 'new1', 'new@x.com')
    assert out == {'recorded': False, 'reason': 'invalid_code'}


def test_attribute_self_referral_by_uid():
    db = _make_db_for_attribution(owner_uid='new1')
    out = rs.record_referral_signup(db, 'CODE1234', 'new1', 'new@x.com')
    assert out['recorded'] is False
    assert out['reason'] == 'self_referral'


def test_attribute_already_referred():
    db = _make_db_for_attribution(new_already_referred=True)
    out = rs.record_referral_signup(db, 'CODE1234', 'new1', 'new@x.com')
    assert out['recorded'] is False
    assert out['reason'] == 'already_referred'


def test_attribute_duplicate_dedupe_doc():
    db = _make_db_for_attribution(dedupe_exists=True)
    out = rs.record_referral_signup(db, 'CODE1234', 'new1', 'new@x.com')
    assert out['recorded'] is False
    assert out['reason'] == 'duplicate'


def test_attribute_success_increments():
    db = _make_db_for_attribution()
    out = rs.record_referral_signup(db, 'CODE1234', 'new1', 'new@x.com')
    assert out == {'recorded': True, 'reason': None}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_referrals.py -v -k "attribute"`
Expected: FAIL with `AttributeError: ... 'record_referral_signup'`

- [ ] **Step 3: Implement attribution**

Append to `backend/app/services/referral_service.py`:

```python
from firebase_admin import firestore as _firestore


def record_referral_signup(db, code: str, new_uid: str, new_email: str) -> dict:
    """Record a new signup against a referral code. Idempotent + abuse-guarded."""
    code = (code or '').strip().upper()
    if not code:
        return {'recorded': False, 'reason': 'invalid_code'}

    code_snap = db.collection('referralCodes').document(code).get()
    if not code_snap or not code_snap.exists:
        return {'recorded': False, 'reason': 'invalid_code'}
    owner_uid = (code_snap.to_dict() or {}).get('uid')
    if not owner_uid:
        return {'recorded': False, 'reason': 'invalid_code'}

    owner_snap = db.collection('users').document(owner_uid).get()
    owner_email = (owner_snap.to_dict() or {}).get('email', '') if owner_snap and owner_snap.exists else ''

    if is_self_referral(owner_uid, owner_email, new_uid, new_email):
        return {'recorded': False, 'reason': 'self_referral'}

    new_ref = db.collection('users').document(new_uid)
    new_snap = new_ref.get()
    if (new_snap.to_dict() or {}).get('referredBy') if new_snap and new_snap.exists else False:
        return {'recorded': False, 'reason': 'already_referred'}

    owner_ref = db.collection('users').document(owner_uid)
    dedupe_ref = owner_ref.collection('referrals').document(new_uid)
    if dedupe_ref.get().exists:
        return {'recorded': False, 'reason': 'duplicate'}

    now = datetime.now(timezone.utc)
    new_ref.update({'referredBy': code})
    dedupe_ref.set({'signedUpAt': now, 'newUserEmail': new_email})
    owner_ref.update({'referralQualifiedCount': _firestore.Increment(1)})
    return {'recorded': True, 'reason': None}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_referrals.py -v -k "attribute"`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/referral_service.py backend/tests/test_referrals.py
git commit -m "feat(referrals): signup attribution with dedupe and abuse guards"
```

---

## Task 5: Stripe reward helpers

**Files:**
- Modify: `backend/app/services/stripe_client.py`
- Test: `backend/tests/test_referrals.py`

**Interfaces:**
- Produces (in `stripe_client.py`):
  - `create_referral_trial_checkout(user_id: str, user_email: str) -> dict` → `{'url': str}`. Creates an Elite subscription Checkout with `subscription_data.trial_period_days=30` and metadata `{'user_id', 'tier': 'elite', 'referral_reward': 'true'}`.
  - `apply_referral_reward_coupon(subscription_id: str) -> dict` → `{'ok': bool, 'error'?: str}`. Calls `stripe.Subscription.modify(subscription_id, coupon=<referral_reward coupon>)`.

Mirrors existing patterns in `create_checkout_session()` / `apply_post_checkout_upsell()`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_referrals.py`:

```python
from unittest.mock import patch
from app.services import stripe_client


def test_create_referral_trial_checkout_sets_trial_and_metadata(monkeypatch):
    monkeypatch.setattr(stripe_client, 'STRIPE_SECRET_KEY', 'sk_test')
    monkeypatch.setattr(stripe_client, 'STRIPE_ELITE_PRICE_ID', 'price_elite')
    fake_session = MagicMock(url='https://checkout.stripe/x', id='cs_1')
    with patch('stripe.checkout.Session.create', return_value=fake_session) as create:
        out = stripe_client.create_referral_trial_checkout('u1', 'a@x.com')
    assert out['url'] == 'https://checkout.stripe/x'
    params = create.call_args.kwargs
    assert params['subscription_data']['trial_period_days'] == 30
    assert params['metadata']['referral_reward'] == 'true'
    assert params['metadata']['user_id'] == 'u1'
    assert params['line_items'][0]['price'] == 'price_elite'


def test_apply_referral_reward_coupon(monkeypatch):
    monkeypatch.setattr(stripe_client, 'STRIPE_SECRET_KEY', 'sk_test')
    monkeypatch.setattr(stripe_client, 'STRIPE_COUPONS',
                        {'referral_reward': 'coupon_ref'})
    with patch('stripe.Subscription.modify') as modify:
        out = stripe_client.apply_referral_reward_coupon('sub_123')
    assert out['ok'] is True
    modify.assert_called_once_with('sub_123', coupon='coupon_ref')
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_referrals.py -v -k "trial_checkout or reward_coupon"`
Expected: FAIL with `AttributeError: module 'app.services.stripe_client' has no attribute 'create_referral_trial_checkout'`

- [ ] **Step 3: Add the helpers**

In `backend/app/services/stripe_client.py`, add near the other checkout helpers. Use the existing imports already in that module (`stripe`, `STRIPE_SECRET_KEY`, `STRIPE_ELITE_PRICE_ID`, `STRIPE_COUPONS`). If `STRIPE_COUPONS` is not imported there, add `from app.config import STRIPE_COUPONS` at the top.

```python
def create_referral_trial_checkout(user_id: str, user_email: str) -> dict:
    """Create an Elite Checkout with a 30-day free trial for a referral reward."""
    if not STRIPE_SECRET_KEY:
        return {'error': 'Stripe not configured'}
    stripe.api_key = STRIPE_SECRET_KEY

    base_url = os.getenv('FRONTEND_BASE_URL', 'https://offerloop.ai').rstrip('/')
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
```

Confirm `import os` exists at the top of `stripe_client.py`; add it if missing.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_referrals.py -v -k "trial_checkout or reward_coupon"`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/stripe_client.py backend/tests/test_referrals.py
git commit -m "feat(referrals): stripe trial-checkout and reward-coupon helpers"
```

---

## Task 6: Claim logic in referral_service

**Files:**
- Modify: `backend/app/services/referral_service.py`
- Test: `backend/tests/test_referrals.py`

**Interfaces:**
- Consumes: `is_eligible()` (Task 2), `stripe_client.create_referral_trial_checkout()`, `stripe_client.apply_referral_reward_coupon()` (Task 5).
- Produces: `claim_reward(db, uid: str) -> dict`.
  - Not eligible → `{'ok': False, 'reason': 'not_eligible'}`.
  - Free tier → `{'ok': True, 'mode': 'checkout', 'url': <stripe url>}` (claim is finalized later by the webhook, Task 8).
  - Paying tier (pro/elite) with a `stripeSubscriptionId` → applies coupon, sets `referralRewardClaimed=True` immediately, returns `{'ok': True, 'mode': 'coupon'}`.
  - Paying tier without subscription id → `{'ok': False, 'reason': 'no_subscription'}`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_referrals.py`:

```python
def _claim_db(tier='free', count=5, claimed=False, sub_id=None):
    db = MagicMock()
    user_ref = db.collection.return_value.document.return_value
    user_ref.get.return_value = _user_snapshot({
        'subscriptionTier': tier,
        'email': 'a@x.com',
        'referralQualifiedCount': count,
        'referralRewardClaimed': claimed,
        'stripeSubscriptionId': sub_id,
    })
    return db, user_ref


def test_claim_not_eligible():
    db, _ = _claim_db(count=4)
    out = rs.claim_reward(db, 'u1')
    assert out == {'ok': False, 'reason': 'not_eligible'}


def test_claim_free_user_returns_checkout(monkeypatch):
    db, _ = _claim_db(tier='free')
    monkeypatch.setattr(
        'app.services.stripe_client.create_referral_trial_checkout',
        lambda uid, email: {'url': 'https://checkout/x'},
    )
    out = rs.claim_reward(db, 'u1')
    assert out['ok'] is True
    assert out['mode'] == 'checkout'
    assert out['url'] == 'https://checkout/x'


def test_claim_paid_user_applies_coupon(monkeypatch):
    db, user_ref = _claim_db(tier='pro', sub_id='sub_9')
    monkeypatch.setattr(
        'app.services.stripe_client.apply_referral_reward_coupon',
        lambda sid: {'ok': True},
    )
    out = rs.claim_reward(db, 'u1')
    assert out == {'ok': True, 'mode': 'coupon'}
    assert user_ref.update.call_args[0][0]['referralRewardClaimed'] is True


def test_claim_paid_user_without_subscription():
    db, _ = _claim_db(tier='elite', sub_id=None)
    out = rs.claim_reward(db, 'u1')
    assert out == {'ok': False, 'reason': 'no_subscription'}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_referrals.py -v -k "claim"`
Expected: FAIL with `AttributeError: ... 'claim_reward'`

- [ ] **Step 3: Implement claim_reward**

Append to `backend/app/services/referral_service.py`:

```python
def claim_reward(db, uid: str) -> dict:
    """Deliver the referral reward based on the user's current tier."""
    from app.services import stripe_client  # local import avoids circular import

    user_ref = db.collection('users').document(uid)
    snap = user_ref.get()
    data = snap.to_dict() if snap and snap.exists else {}
    count = int((data or {}).get('referralQualifiedCount', 0) or 0)
    claimed = bool((data or {}).get('referralRewardClaimed', False))

    if not is_eligible(count, claimed):
        return {'ok': False, 'reason': 'not_eligible'}

    tier = (data or {}).get('subscriptionTier') or (data or {}).get('tier') or 'free'
    email = (data or {}).get('email', '')

    if tier == 'free':
        # Reward is finalized by the Stripe webhook on checkout completion.
        out = stripe_client.create_referral_trial_checkout(uid, email)
        if out.get('url'):
            return {'ok': True, 'mode': 'checkout', 'url': out['url']}
        return {'ok': False, 'reason': out.get('error', 'checkout_failed')}

    # Already paying: apply the one-month coupon to the live subscription.
    sub_id = (data or {}).get('stripeSubscriptionId')
    if not sub_id:
        return {'ok': False, 'reason': 'no_subscription'}
    out = stripe_client.apply_referral_reward_coupon(sub_id)
    if not out.get('ok'):
        return {'ok': False, 'reason': out.get('error', 'coupon_failed')}
    user_ref.update({
        'referralRewardClaimed': True,
        'referralRewardClaimedAt': datetime.now(timezone.utc),
    })
    return {'ok': True, 'mode': 'coupon'}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_referrals.py -v -k "claim"`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/referral_service.py backend/tests/test_referrals.py
git commit -m "feat(referrals): claim logic for free (trial) and paid (coupon) users"
```

---

## Task 7: Referrals blueprint + wsgi registration

**Files:**
- Create: `backend/app/routes/referrals.py`
- Modify: `backend/wsgi.py` (import ~line 47, register ~line 245)
- Test: `backend/tests/test_referrals.py`

**Interfaces:**
- Consumes: `referral_service.get_referral_status/record_referral_signup/claim_reward`, `get_db`, `require_firebase_auth`.
- Produces: `referrals_bp` with `GET /api/referrals/me`, `POST /api/referrals/attribute`, `POST /api/referrals/claim`.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_referrals.py`:

```python
def test_blueprint_registered(app):
    rules = {r.rule for r in app.url_map.iter_rules()}
    assert '/api/referrals/me' in rules
    assert '/api/referrals/attribute' in rules
    assert '/api/referrals/claim' in rules
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_referrals.py::test_blueprint_registered -v`
Expected: FAIL (rules not present)

- [ ] **Step 3: Create the blueprint**

Create `backend/app/routes/referrals.py`:

```python
"""
Referral program routes.
"""
from flask import Blueprint, jsonify, request

from app.extensions import require_firebase_auth, get_db
from app.services import referral_service

referrals_bp = Blueprint('referrals', __name__, url_prefix='/api/referrals')


@referrals_bp.route('/me', methods=['GET'])
@require_firebase_auth
def referral_me():
    uid = request.firebase_user.get('uid')
    if not uid:
        return jsonify({'error': 'unauthorized'}), 401
    return jsonify(referral_service.get_referral_status(get_db(), uid)), 200


@referrals_bp.route('/attribute', methods=['POST'])
@require_firebase_auth
def referral_attribute():
    uid = request.firebase_user.get('uid')
    email = request.firebase_user.get('email', '')
    if not uid:
        return jsonify({'error': 'unauthorized'}), 401
    data = request.get_json() or {}
    code = data.get('code') or data.get('referral_code') or ''
    result = referral_service.record_referral_signup(get_db(), code, uid, email)
    return jsonify(result), 200


@referrals_bp.route('/claim', methods=['POST'])
@require_firebase_auth
def referral_claim():
    uid = request.firebase_user.get('uid')
    if not uid:
        return jsonify({'error': 'unauthorized'}), 401
    result = referral_service.claim_reward(get_db(), uid)
    status = 200 if result.get('ok') else 400
    return jsonify(result), status
```

- [ ] **Step 4: Register in wsgi.py**

In `backend/wsgi.py`, add the import alongside the others (e.g. after `from .app.routes.metrics import metrics_bp`):

```python
from .app.routes.referrals import referrals_bp
```

And register it in `create_app()` after `app.register_blueprint(metrics_bp)`:

```python
app.register_blueprint(referrals_bp)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_referrals.py::test_blueprint_registered -v`
Expected: PASS

- [ ] **Step 6: Verify routes load end-to-end**

Run: `cd backend && LIST_ROUTES=1 FLASK_ENV=testing python wsgi.py | grep referrals`
Expected: three `/api/referrals/...` lines printed.

- [ ] **Step 7: Commit**

```bash
git add backend/app/routes/referrals.py backend/wsgi.py backend/tests/test_referrals.py
git commit -m "feat(referrals): blueprint with me/attribute/claim and wsgi registration"
```

---

## Task 8: Mark reward claimed on Stripe webhook

**Files:**
- Modify: `backend/app/services/stripe_client.py` (`handle_checkout_completed`, ~line 409-480)
- Test: `backend/tests/test_referrals.py`

**Interfaces:**
- Consumes: existing `handle_checkout_completed(session)` flow.
- Produces: when `session.metadata.referral_reward == 'true'`, the user update payload additionally sets `referralRewardClaimed=True` and `referralRewardClaimedAt`.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_referrals.py`:

```python
def test_webhook_marks_referral_reward_claimed(monkeypatch):
    db = MagicMock()
    user_ref = db.collection.return_value.document.return_value
    monkeypatch.setattr(stripe_client, 'get_db', lambda: db)
    monkeypatch.setattr(stripe_client, 'STRIPE_SECRET_KEY', 'sk_test')

    fake_sub = MagicMock(status='trialing')
    fake_sub.items.data = [MagicMock(price=MagicMock(id='price_elite'))]
    monkeypatch.setattr('stripe.Subscription.retrieve', lambda sid: fake_sub)

    session = {
        'metadata': {'user_id': 'u1', 'tier': 'elite', 'referral_reward': 'true'},
        'subscription': 'sub_1',
        'customer': 'cus_1',
    }
    stripe_client.handle_checkout_completed(session)

    # The final update payload should carry the referral flag.
    payloads = [c[0][0] for c in user_ref.update.call_args_list]
    assert any(p.get('referralRewardClaimed') is True for p in payloads)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_referrals.py::test_webhook_marks_referral_reward_claimed -v`
Expected: FAIL (no payload sets `referralRewardClaimed`)

- [ ] **Step 3: Add the referral branch**

In `handle_checkout_completed()` in `backend/app/services/stripe_client.py`, locate where `update_payload` is built and `user_ref.update(update_payload)` is called. Immediately BEFORE that `user_ref.update(update_payload)` call, add:

```python
        # Referral reward: finalize the one-time claim flag.
        _meta = session.get('metadata') or {}
        if _meta.get('referral_reward') == 'true':
            update_payload['referralRewardClaimed'] = True
            update_payload['referralRewardClaimedAt'] = datetime.now().isoformat()
```

(Use `datetime.now().isoformat()` to match the timestamp style already used in that function's `update_payload`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_referrals.py::test_webhook_marks_referral_reward_claimed -v`
Expected: PASS

- [ ] **Step 5: Run the full referral suite**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_referrals.py -v`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/stripe_client.py backend/tests/test_referrals.py
git commit -m "feat(referrals): mark reward claimed on referral checkout webhook"
```

---

## Task 9: Firestore security rules

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Produces: clients cannot write `referralCode`, `referredBy`, `referralQualifiedCount`, `referralRewardClaimed`, `referralRewardClaimedAt` on their own user doc; the `referralCodes` collection and `users/{uid}/referrals/**` subcollection are not client-writable (backend admin SDK bypasses rules).

- [ ] **Step 1: Add protected fields to the user-doc update rule**

In `firestore.rules`, find the existing rule guarding client writes to `users/{uid}` (the one already protecting `tier`, `subscriptionTier`, `stripeSubscriptionId`, `stripeCustomerId`, `maxCredits`). Extend the protected-field set to also reject the referral fields. Follow the file's existing idiom — e.g. if it uses `request.resource.data.diff(resource.data).affectedKeys().hasAny([...])`, add the new field names to that list:

```
'referralCode', 'referredBy', 'referralQualifiedCount',
'referralRewardClaimed', 'referralRewardClaimedAt'
```

- [ ] **Step 2: Deny client access to referral bookkeeping**

Add, inside `match /databases/{database}/documents {`:

```
// Referral code lookup — backend (admin SDK) only.
match /referralCodes/{code} {
  allow read, write: if false;
}
```

And ensure the `users/{uid}` block denies the `referrals` subcollection to clients (add if a catch-all isn't already present):

```
match /users/{uid}/referrals/{referredUid} {
  allow read, write: if false;
}
```

- [ ] **Step 3: Verify rules compile (syntax)**

Run: `cd /Users/nicholaswittig/Desktop/offerloop/Final_offerloop && npx -y firebase-tools firestore:rules:canary --help >/dev/null 2>&1; echo "review rules manually"`
Expected: No CLI available is fine — visually confirm the braces/match blocks are balanced. (Rules deploy from the Firebase console/CLI by the team; this task only edits the file.)

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "feat(referrals): protect referral fields and collections in firestore rules"
```

---

## Task 10: Frontend API methods

**Files:**
- Modify: `connect-grow-hire/src/services/api.ts`

**Interfaces:**
- Consumes: existing `getAuthHeaders()` / `makeRequest()` in the `ApiService` class.
- Produces: `apiService.getReferralStatus()`, `apiService.attributeReferral(code)`, `apiService.claimReferralReward()`.

- [ ] **Step 1: Add the methods**

In `connect-grow-hire/src/services/api.ts`, inside the `ApiService` class (next to other endpoint methods such as `getEmailTemplate`), add:

```typescript
  async getReferralStatus(): Promise<{
    referralCode: string;
    referralLink: string;
    signupCount: number;
    signupTarget: number;
    eligible: boolean;
    rewardClaimed: boolean;
    rewardClaimedAt: string | null;
  }> {
    const headers = await this.getAuthHeaders();
    return this.makeRequest('/referrals/me', { method: 'GET', headers });
  }

  async attributeReferral(code: string): Promise<{ recorded: boolean; reason: string | null }> {
    const headers = await this.getAuthHeaders();
    return this.makeRequest('/referrals/attribute', {
      method: 'POST',
      headers,
      body: JSON.stringify({ code }),
    });
  }

  async claimReferralReward(): Promise<{ ok: boolean; mode?: string; url?: string; reason?: string }> {
    const headers = await this.getAuthHeaders();
    return this.makeRequest('/referrals/claim', {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
  }
```

Note: `makeRequest` prefixes `API_BASE_URL` (which already ends in `/api`), so the endpoint path is `/referrals/...` NOT `/api/referrals/...`. Confirm against a neighboring method (e.g. `getEmailTemplate` uses `/email-template`).

- [ ] **Step 2: Verify the build compiles**

Run: `cd connect-grow-hire && npx tsc --noEmit`
Expected: no new type errors from `api.ts`.

- [ ] **Step 3: Commit**

```bash
git add connect-grow-hire/src/services/api.ts
git commit -m "feat(referrals): frontend api methods for status/attribute/claim"
```

---

## Task 11: Capture ref code at signup + attribute on account creation

**Files:**
- Modify: `connect-grow-hire/src/pages/SignIn.tsx`
- Modify: `connect-grow-hire/src/contexts/FirebaseAuthContext.tsx` (new-user branch, ~line 195)

**Interfaces:**
- Consumes: `apiService.attributeReferral(code)` (Task 10).
- Produces: `localStorage['offerloop_ref']` set from `?ref=`; an attribution call fired exactly once, right after the new user doc is created.

- [ ] **Step 1: Capture `?ref=` in SignIn.tsx**

In `connect-grow-hire/src/pages/SignIn.tsx`, add an effect that runs on mount (near the existing `location.search` handling):

```typescript
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) {
      localStorage.setItem('offerloop_ref', ref.trim().toUpperCase());
    }
  }, []);
```

If `useEffect` / `useLocation` are already imported, reuse them; otherwise add `import { useEffect } from 'react';`.

- [ ] **Step 2: Fire attribution on first account creation**

In `connect-grow-hire/src/contexts/FirebaseAuthContext.tsx`, in the NEW-user branch immediately after `await setDoc(userDocRef, { ...newUser, createdAt: new Date().toISOString() });`, add:

```typescript
      // Referral attribution (best-effort, must not block onboarding)
      try {
        const refCode =
          new URLSearchParams(window.location.search).get('ref') ||
          localStorage.getItem('offerloop_ref');
        if (refCode) {
          const { apiService } = await import('../services/api');
          await apiService.attributeReferral(refCode);
        }
      } catch (e) {
        console.error('Referral attribution failed:', e);
      } finally {
        localStorage.removeItem('offerloop_ref');
      }
```

Use a dynamic `import('../services/api')` if `apiService` isn't already imported in this file; otherwise call it directly.

- [ ] **Step 3: Verify the build compiles**

Run: `cd connect-grow-hire && npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 4: Manual verification**

Run: `cd connect-grow-hire && npm run dev`, open `http://localhost:8080/signin?ref=TESTCODE`, confirm `localStorage.getItem('offerloop_ref') === 'TESTCODE'` in devtools. (Full attribution requires a real new signup against the running backend; defer to integration check after deploy.)

- [ ] **Step 5: Commit**

```bash
git add connect-grow-hire/src/pages/SignIn.tsx connect-grow-hire/src/contexts/FirebaseAuthContext.tsx
git commit -m "feat(referrals): capture ref code and attribute on first signup"
```

---

## Task 12: "Refer & Earn" section in Account Settings

**Files:**
- Modify: `connect-grow-hire/src/pages/AccountSettings.tsx` (imports; `sections[]` ~line 102; render after the goals section)

**Interfaces:**
- Consumes: `apiService.getReferralStatus()`, `apiService.claimReferralReward()` (Task 10); existing `SettingsSection` component and `toast`.
- Produces: a new `referrals` section showing the link + copy button, `X / 5` progress, and a claim button when eligible.

- [ ] **Step 1: Add the nav entry and icon import**

In `connect-grow-hire/src/pages/AccountSettings.tsx`, add `Gift` and `Copy` to the existing `lucide-react` import, and add to the `sections` array after the `goals` entry:

```typescript
  { id: 'referrals', label: 'Refer & Earn', icon: Gift },
```

- [ ] **Step 2: Load referral status**

Inside the `AccountSettings` component, add state + load (place near other `useState`/`useEffect` hooks):

```typescript
  const [referral, setReferral] = useState<{
    referralLink: string; signupCount: number; signupTarget: number;
    eligible: boolean; rewardClaimed: boolean;
  } | null>(null);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    apiService.getReferralStatus().then(setReferral).catch(() => setReferral(null));
  }, []);

  const handleClaim = async () => {
    setClaiming(true);
    try {
      const res = await apiService.claimReferralReward();
      if (res.ok && res.mode === 'checkout' && res.url) {
        window.location.href = res.url;
      } else if (res.ok) {
        toast({ title: 'Reward applied!', description: 'Your next month is on us.' });
        const fresh = await apiService.getReferralStatus();
        setReferral(fresh);
      } else {
        toast({ title: 'Could not claim', description: res.reason || 'Try again later.', variant: 'destructive' });
      }
    } finally {
      setClaiming(false);
    }
  };
```

Ensure `apiService` is imported (check existing imports at top of file; add `import { apiService } from '@/services/api';` if absent).

- [ ] **Step 3: Render the section**

Add after the goals `SettingsSection` in the render tree:

```tsx
<SettingsSection
  id="referrals"
  icon={Gift}
  title="Refer & Earn"
  description="Invite 5 friends who sign up and get a free month of Elite."
>
  {referral ? (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Your referral link</label>
        <div className="flex gap-2">
          <input type="text" value={referral.referralLink} readOnly
            className="flex-1 px-3 py-2 border border-gray-300 rounded bg-gray-50 text-sm" />
          <button
            onClick={() => { navigator.clipboard.writeText(referral.referralLink);
              toast({ title: 'Copied!', description: 'Referral link copied.' }); }}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div>
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>Signups</span>
          <span>{referral.signupCount} / {referral.signupTarget}</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div className="bg-blue-600 h-2 rounded-full"
            style={{ width: `${Math.min(100, (referral.signupCount / referral.signupTarget) * 100)}%` }} />
        </div>
      </div>
      {referral.rewardClaimed ? (
        <p className="text-sm text-green-700">🎉 Reward claimed — enjoy your free month of Elite!</p>
      ) : referral.eligible ? (
        <button onClick={handleClaim} disabled={claiming}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
          {claiming ? 'Starting…' : 'Claim your free month of Elite'}
        </button>
      ) : (
        <p className="text-sm text-gray-500">
          {referral.signupTarget - referral.signupCount} more signup
          {referral.signupTarget - referral.signupCount === 1 ? '' : 's'} to unlock a free month of Elite.
        </p>
      )}
    </div>
  ) : (
    <p className="text-sm text-gray-500">Loading your referral link…</p>
  )}
</SettingsSection>
```

- [ ] **Step 4: Verify the build compiles**

Run: `cd connect-grow-hire && npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 5: Manual verification**

Run dev server, open `/account-settings`, scroll to "Refer & Earn": link renders, copy button works, progress bar reflects count. (Eligibility/claim require backend data.)

- [ ] **Step 6: Commit**

```bash
git add connect-grow-hire/src/pages/AccountSettings.tsx
git commit -m "feat(referrals): refer & earn section in account settings"
```

---

## Task 13: Full regression + docs

**Files:**
- Modify: `CLAUDE.md` (optional: note the new `referrals/` subcollection + `referralCodes` collection)

- [ ] **Step 1: Run the entire backend suite**

Run: `cd backend && FLASK_ENV=testing pytest tests/ -q`
Expected: no new failures; `test_referrals.py` all green.

- [ ] **Step 2: Frontend typecheck + build**

Run: `cd connect-grow-hire && npx tsc --noEmit && npm run build`
Expected: clean build.

- [ ] **Step 3: Document the data model (optional)**

In `CLAUDE.md`, under the Firestore subcollections list, add:
- `referrals/` — per-referred-user dedupe docs for the referral program
- top-level `referralCodes/` — referral code → owner uid lookup

And note the new env var `STRIPE_REFERRAL_REWARD_COUPON_ID` in the env section.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note referral collections and reward coupon env var"
```

---

## Post-Implementation Setup (manual, outside code)

1. In the Stripe dashboard, create a coupon: **100% off, duration = once** (applies to one billing cycle). Copy its ID into `STRIPE_REFERRAL_REWARD_COUPON_ID` in Render env + local `.env`.
2. Set `FRONTEND_BASE_URL` if the app should not default to `https://offerloop.ai` in non-prod.
3. Deploy `firestore.rules` from the Firebase console/CLI.
4. Smoke test end-to-end: create a referral link from account A, sign up account B through it, confirm A's count increments; repeat to 5; claim and confirm the Stripe trial checkout (free) or zeroed invoice (paid).

---

## Self-Review Notes

- **Spec coverage:** data model (Tasks 3-4, 9), get link (Task 7 `/me`), capture at signup (Task 11), attribution + abuse guards (Task 4), hit-5 eligibility (Tasks 2-3), claim free→trial (Tasks 5-6), claim paid→coupon (Tasks 5-6), webhook finalize (Task 8), frontend widget (Tasks 10-12), tests (every backend task). All spec sections map to tasks.
- **Out of scope (per spec) intentionally absent:** repeatable rewards, referred-user perk, activation gating, custom expiry cron.
- **Type consistency:** service returns use stable keys (`recorded/reason`, `ok/mode/url/reason`, status dict keys) consumed identically by routes and frontend.
