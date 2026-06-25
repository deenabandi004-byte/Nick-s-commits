"""
Referral program logic.

Functions are split into pure helpers (no I/O, unit-tested directly) and
orchestration functions that touch Firestore / Stripe.
"""
import os
import secrets
from datetime import datetime, timezone

from firebase_admin import firestore as _firestore

from app.config import REFERRAL_TARGET_COUNT, REFERRAL_REWARD_TIER

# Unambiguous alphabet (no 0/O/1/I)
_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_CODE_LENGTH = 8

_VALID_ACK_SURFACES = {
    'banner': 'referralBannerDismissedAt',
    'launch_modal': 'referralLaunchModalSeenAt',
}


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


def _referral_link(code: str) -> str:
    base = os.getenv('FRONTEND_BASE_URL', 'https://offerloop.ai').rstrip('/')
    return f"{base}/signin?ref={code}"


def ack_referral_surface(db, uid: str, surface: str) -> dict:
    """Record that the user dismissed the banner / saw the launch modal."""
    field = _VALID_ACK_SURFACES.get(surface)
    if not field:
        return {'ok': False, 'reason': 'invalid_surface'}
    db.collection('users').document(uid).update({field: datetime.now(timezone.utc)})
    return {'ok': True}


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
        'bannerDismissed': bool((data or {}).get('referralBannerDismissedAt')),
        'launchModalSeen': bool((data or {}).get('referralLaunchModalSeenAt')),
    }


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
        # Guard against double-claim (double-click / two tabs / retry): if a
        # checkout was started recently, don't spawn another. This closes the
        # common double-submit window. Truly-concurrent requests would need a
        # Firestore transaction to fully serialize — acceptable risk for v1.
        pending_at = (data or {}).get('referralRewardPendingAt')
        now = datetime.now(timezone.utc)
        if pending_at is not None:
            try:
                age = (now - pending_at).total_seconds()
            except TypeError:
                age = None
            if age is not None and age < 3600:
                return {'ok': False, 'reason': 'claim_in_progress'}
        user_ref.update({'referralRewardPendingAt': now})
        out = stripe_client.create_referral_trial_checkout(uid, email)
        if out.get('url'):
            return {'ok': True, 'mode': 'checkout', 'url': out['url']}
        # Checkout failed to create — release the lock so the user can retry.
        user_ref.update({'referralRewardPendingAt': None})
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
