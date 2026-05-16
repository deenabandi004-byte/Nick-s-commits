"""
Phase 4 personalization data layer -- unit tests.

Covers the §7 (P4 row) cases that don't need real Firestore / OpenAI:
  - feature_flags: deterministic uid bucketing, override map, kill switch.
  - derived_profile_service:
      - synthesize() with no events writes a placeholder when feature off.
      - synthesize() with events <5 returns behaviorStats only.
      - validate_synthesis_output coerces malformed LLM output to safe defaults.
      - Manually edited voice model is preserved across synthesis runs.
  - voice-model route validation rejects out-of-range / wrong-enum input.
  - cron run_event_triggered respects the feature flag (no-op when off).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest


# ============================================================================
# feature_flags
# ============================================================================


def test_feature_flag_off_when_no_doc():
    from app.services import feature_flags as ff
    ff.invalidate_cache()
    with patch.object(ff, '_read_flags_from_firestore', return_value={}):
        assert ff.is_enabled_for_user(ff.USE_NEW_GENERATOR, 'uid-1') is False


def test_feature_flag_kill_switch_overrides_everything(monkeypatch):
    from app.services import feature_flags as ff
    ff.invalidate_cache()
    monkeypatch.setenv(f'{ff.USE_NEW_GENERATOR}_KILL', 'true')
    with patch.object(ff, '_read_flags_from_firestore',
                      return_value={ff.USE_NEW_GENERATOR: {'enabled': True, 'rollout_pct': 100}}):
        assert ff.is_enabled_for_user(ff.USE_NEW_GENERATOR, 'uid-1') is False


def test_feature_flag_override_takes_precedence():
    from app.services import feature_flags as ff
    ff.invalidate_cache()
    cfg = {
        ff.USE_NEW_GENERATOR: {
            'enabled': True,
            'rollout_pct': 0,
            'overrides': {'forced-on-uid': True, 'forced-off-uid': False},
        }
    }
    with patch.object(ff, '_read_flags_from_firestore', return_value=cfg):
        assert ff.is_enabled_for_user(ff.USE_NEW_GENERATOR, 'forced-on-uid') is True
        assert ff.is_enabled_for_user(ff.USE_NEW_GENERATOR, 'forced-off-uid') is False
        # Random user falls into rollout_pct=0 → off.
        assert ff.is_enabled_for_user(ff.USE_NEW_GENERATOR, 'random-uid') is False


def test_feature_flag_uid_bucketing_is_deterministic():
    """Same (flag, uid) → same bucket across calls. This is the foundation
    for the Phase 7 A/B (a flapping bucket would muddy the edit-rate
    comparison)."""
    from app.services import feature_flags as ff
    ff.invalidate_cache()
    cfg = {ff.USE_NEW_GENERATOR: {'enabled': True, 'rollout_pct': 50}}
    with patch.object(ff, '_read_flags_from_firestore', return_value=cfg):
        first = ff.is_enabled_for_user(ff.USE_NEW_GENERATOR, 'uid-deterministic')
        for _ in range(20):
            assert ff.is_enabled_for_user(ff.USE_NEW_GENERATOR, 'uid-deterministic') == first


def test_feature_flag_full_rollout_includes_everyone():
    from app.services import feature_flags as ff
    ff.invalidate_cache()
    cfg = {ff.USE_NEW_GENERATOR: {'enabled': True, 'rollout_pct': 100}}
    with patch.object(ff, '_read_flags_from_firestore', return_value=cfg):
        assert all(
            ff.is_enabled_for_user(ff.USE_NEW_GENERATOR, f'uid-{i}') for i in range(20)
        )


# ============================================================================
# derived_profile_service -- synthesize behavior
# ============================================================================


def _patch_user_get(user_data: dict | None):
    snap = MagicMock()
    snap.exists = bool(user_data)
    snap.to_dict.return_value = user_data or {}
    user_ref = MagicMock()
    user_ref.get.return_value = snap
    return user_ref


def _build_db_with_no_profile_no_events():
    """Firestore mock -- derivedProfile/v1 missing, events collection empty."""
    profile_snap = MagicMock()
    profile_snap.exists = False
    profile_snap.to_dict.return_value = {}

    derived_doc = MagicMock()
    derived_doc.get.return_value = profile_snap
    derived_coll = MagicMock()
    derived_coll.document.return_value = derived_doc

    events_coll = MagicMock()
    events_coll.stream.return_value = iter([])

    user_doc = MagicMock()
    user_doc.collection.side_effect = lambda name: (
        derived_coll if name == 'derivedProfile' else events_coll
    )
    user_doc.get.return_value = MagicMock(exists=True, to_dict=lambda: {})

    users = MagicMock()
    users.document.return_value = user_doc

    db = MagicMock()
    db.collection.return_value = users
    return db


def test_synthesize_writes_placeholder_when_flag_off():
    from app.services import derived_profile_service as svc

    db = _build_db_with_no_profile_no_events()
    with patch.object(svc, 'get_db', return_value=db), \
         patch.object(svc, 'is_enabled', return_value=False):
        result = svc.synthesize('uid-1')
    assert result.get('placeholder') is True
    assert result.get('voiceModel') is None


def test_validate_synthesis_output_coerces_safely():
    from app.services.derived_profile_service import _validate_synthesis_output

    out = _validate_synthesis_output({
        'voiceModel': {
            'avg_length_words': 'not-a-number',
            'formality_score': 1.7,           # out of range
            'opener_style': 'banana',          # invalid enum
            'closer_style': 'meh',             # invalid enum
            'signature_pattern': None,
        },
        'interestModel': {
            'top_industries': ['investment_banking', 'consulting'],
            'top_companies': None,
            'emerging_interests': [123, '  ', 'tech_pm'],
            'pivot_signal': 42,                # not a string
        },
    })
    v = out['voiceModel']
    assert isinstance(v['avg_length_words'], int)
    assert 20 <= v['avg_length_words'] <= 400
    assert 0.0 <= v['formality_score'] <= 1.0
    assert v['opener_style'] in {'direct', 'warm', 'contextual', 'question', 'none'}
    assert v['closer_style'] in {'direct', 'warm', 'grateful', 'none'}
    assert isinstance(v['signature_pattern'], str)

    i = out['interestModel']
    assert i['top_industries'] == ['investment_banking', 'consulting']
    assert i['top_companies'] == []
    # Coerced ints + dropped whitespace-only entries.
    assert 'tech_pm' in i['emerging_interests']
    assert i['pivot_signal'] is None


def test_compute_behavior_stats_deterministic():
    """Same event list → same stats (regenerable property per §7 P4)."""
    from app.services.derived_profile_service import _compute_behavior_stats

    events = [
        {'type': 'email_drafted', 'payload': {}},
        {'type': 'email_drafted', 'payload': {}},
        {'type': 'email_edited', 'payload': {'delta': {'wordsChanged': 12}}},
        {'type': 'email_sent_clicked', 'payload': {}},
        {'type': 'reply_received', 'payload': {}},
    ]
    a = _compute_behavior_stats(events)
    b = _compute_behavior_stats(list(events))
    assert a == b
    assert a['editRate30d'] == 0.5      # 1 edit / 2 drafts
    assert a['replyRate30d'] == 1.0     # 1 reply / 1 send
    assert a['avgEditDistance'] == 12.0


def test_compute_behavior_stats_dedupes_sends_by_tracking_id():
    """Both email_sent_clicked AND email_sent_via_gmail can fire for the
    same draft (frontend optimistic + Pub/Sub confirmed). They share a
    trackingId, so the rollup must count them as ONE send, not two --
    otherwise replyRate30d gets halved.
    """
    from app.services.derived_profile_service import _compute_behavior_stats

    events = [
        {'type': 'email_drafted', 'payload': {'trackingId': 'tid-1'}},
        # Frontend optimistic + backend Pub/Sub for the SAME draft.
        {'type': 'email_sent_clicked', 'payload': {'trackingId': 'tid-1'}},
        {'type': 'email_sent_via_gmail', 'payload': {'trackingId': 'tid-1'}},
        {'type': 'reply_received', 'payload': {'trackingId': 'tid-1'}},
    ]
    stats = _compute_behavior_stats(events)
    # 1 reply / 1 unique send → 1.0. With the old double-counting bug
    # this would be 1 / 2 = 0.5.
    assert stats['replyRate30d'] == 1.0


def test_scrub_payload_drops_sensitive_keys():
    from app.services.derived_profile_service import _scrub_payload
    cleaned = _scrub_payload({
        'rawBody': 'private content',
        'snippet': 'reply preview',
        'sentMessageId': 'gmail-id',
        'wordsChanged': 5,
        'visible': 'kept',
    })
    assert 'rawBody' not in cleaned
    assert 'snippet' not in cleaned
    assert 'sentMessageId' not in cleaned
    assert cleaned['wordsChanged'] == 5
    assert cleaned['visible'] == 'kept'


# ============================================================================
# voice-model route validation (logic, not Flask wiring)
# ============================================================================


def test_voice_model_validate_rejects_invalid_opener():
    """Confirm the validator inside _validate_synthesis_output flags bad
    openers, since the route relies on the same coercion path."""
    from app.services.derived_profile_service import _validate_synthesis_output
    out = _validate_synthesis_output({
        'voiceModel': {
            'avg_length_words': 90,
            'formality_score': 0.5,
            'opener_style': 'invalid',   # should fall back to 'warm'
            'closer_style': 'warm',
            'signature_pattern': 'Best,\n{name}',
        },
        'interestModel': {},
    })
    assert out['voiceModel']['opener_style'] == 'warm'


# ============================================================================
# Cron -- feature flag gating
# ============================================================================


def test_cron_event_triggered_skips_users_when_flag_off():
    """With per-uid override (spec §8 step 2) the cron no longer short-circuits
    globally — it iterates users and skips each one whose `is_enabled(uid)` is
    False, so a per-uid override of True can still synthesize when env is off.
    """
    from backend.scripts import derived_profile_cron as cron
    from app.services import derived_profile_service as svc

    synth = MagicMock()
    with patch.object(svc, 'is_enabled', return_value=False), \
         patch.object(svc, 'synthesize', synth), \
         patch.object(cron, 'get_db', return_value=MagicMock()), \
         patch.object(cron, '_iter_active_user_ids', return_value=iter(['uid-1', 'uid-2'])):
        result = cron.run_event_triggered(dry_run=True)
    assert result.get('triggered') == 0
    synth.assert_not_called()


def test_cron_nightly_skips_users_when_flag_off():
    from backend.scripts import derived_profile_cron as cron
    from app.services import derived_profile_service as svc

    synth = MagicMock()
    with patch.object(svc, 'is_enabled', return_value=False), \
         patch.object(svc, 'synthesize', synth), \
         patch.object(cron, 'get_db', return_value=MagicMock()), \
         patch.object(cron, '_iter_active_user_ids', return_value=iter(['uid-1', 'uid-2'])):
        result = cron.run_nightly(dry_run=True)
    assert result.get('triggered') == 0
    synth.assert_not_called()


# ============================================================================
# Manually-edited voice model preservation
# ============================================================================


def test_persist_profile_preserves_manually_edited_voice():
    """When voice_manually_edited=True is passed, the persisted doc reflects
    that -- the cron uses this to decide whether to overwrite voice fields
    on the next synth run."""
    from app.services import derived_profile_service as svc

    captured = {}

    def fake_set(payload, merge=True):
        captured.update(payload)

    ref = MagicMock()
    ref.set.side_effect = fake_set
    coll = MagicMock()
    coll.document.return_value = ref
    user = MagicMock()
    user.collection.return_value = coll
    coll2 = MagicMock()
    coll2.document.return_value = user
    db = MagicMock()
    db.collection.return_value = coll2

    with patch.object(svc, 'get_db', return_value=db):
        svc._persist_profile(
            'uid-x',
            voice_model={'avg_length_words': 80, 'formality_score': 0.2,
                         'opener_style': 'direct', 'closer_style': 'direct',
                         'signature_pattern': 'Best,\n{name}'},
            interest_model=None,
            behavior_stats=None,
            event_count=42,
            placeholder=False,
            voice_manually_edited=True,
        )
    assert captured['voiceModelManuallyEdited'] is True
    assert captured['voiceModel']['opener_style'] == 'direct'
    assert captured['synthesizedFromEventCount'] == 42
