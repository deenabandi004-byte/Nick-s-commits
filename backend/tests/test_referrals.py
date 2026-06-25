import pytest
from unittest.mock import MagicMock, patch
from app import config
from app.services import referral_service as rs
from app.services import stripe_client


def test_referral_config_constants():
    assert config.REFERRAL_TARGET_COUNT == 5
    assert config.REFERRAL_REWARD_TIER == 'elite'
    assert 'referral_reward' in config.STRIPE_COUPONS


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


def _claim_db(tier='free', count=5, claimed=False, sub_id=None, pending_at=None):
    db = MagicMock()
    user_ref = db.collection.return_value.document.return_value
    user_data = {
        'subscriptionTier': tier,
        'email': 'a@x.com',
        'referralQualifiedCount': count,
        'referralRewardClaimed': claimed,
        'stripeSubscriptionId': sub_id,
    }
    if pending_at is not None:
        user_data['referralRewardPendingAt'] = pending_at
    user_ref.get.return_value = _user_snapshot(user_data)
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


def test_claim_free_user_in_progress_blocks(monkeypatch):
    from datetime import datetime, timezone
    recent = datetime.now(timezone.utc)
    db, _ = _claim_db(tier='free', pending_at=recent)
    # Stripe must NOT be called when a checkout is already in progress.
    monkeypatch.setattr(
        'app.services.stripe_client.create_referral_trial_checkout',
        lambda uid, email: (_ for _ in ()).throw(AssertionError('Stripe should not be called')),
    )
    out = rs.claim_reward(db, 'u1')
    assert out == {'ok': False, 'reason': 'claim_in_progress'}


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


@pytest.fixture
def app():
    """Minimal Flask app with the referrals blueprint registered."""
    from flask import Flask
    from app.routes.referrals import referrals_bp
    a = Flask(__name__)
    a.config['TESTING'] = True
    a.register_blueprint(referrals_bp)
    return a


def test_blueprint_registered(app):
    rules = {r.rule for r in app.url_map.iter_rules()}
    assert '/api/referrals/me' in rules
    assert '/api/referrals/attribute' in rules
    assert '/api/referrals/claim' in rules
    assert '/api/referrals/ack' in rules


def test_ack_valid_surface_updates_field():
    # banner surface maps to referralBannerDismissedAt
    db = MagicMock()
    result = rs.ack_referral_surface(db, 'u1', 'banner')
    assert result == {'ok': True}
    db.collection('users').document('u1').update.assert_called_once()
    call_kwargs = db.collection('users').document('u1').update.call_args[0][0]
    assert list(call_kwargs.keys()) == ['referralBannerDismissedAt']

    # launch_modal surface maps to referralLaunchModalSeenAt
    db2 = MagicMock()
    result2 = rs.ack_referral_surface(db2, 'u1', 'launch_modal')
    assert result2 == {'ok': True}
    db2.collection('users').document('u1').update.assert_called_once()
    call_kwargs2 = db2.collection('users').document('u1').update.call_args[0][0]
    assert list(call_kwargs2.keys()) == ['referralLaunchModalSeenAt']


def test_ack_invalid_surface():
    db = MagicMock()
    result = rs.ack_referral_surface(db, 'u1', 'nope')
    assert result == {'ok': False, 'reason': 'invalid_surface'}
    db.collection('users').document('u1').update.assert_not_called()


def test_get_referral_status_includes_ack_flags():
    from datetime import datetime, timezone
    db = MagicMock()
    user_ref = db.collection.return_value.document.return_value
    user_ref.get.return_value = _user_snapshot({
        'referralCode': 'CODE1234',
        'referralBannerDismissedAt': datetime.now(timezone.utc),
        # referralLaunchModalSeenAt is absent
    })

    status = rs.get_referral_status(db, 'u1')

    assert status['bannerDismissed'] is True
    assert status['launchModalSeen'] is False


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
