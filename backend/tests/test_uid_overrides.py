"""
Per-uid Firestore overrides for the four env-gated personalization flags
(spec section 8 step 2). Mirrors the existing USE_NEW_GENERATOR override
pattern from feature_flags.is_enabled_for_user.

Covers:
  - feature_flags.get_user_override returns the override bool or None.
  - derived_profile_service.is_enabled(uid) honors override either direction.
  - events_service.is_enabled(uid) honors override either direction.
  - recommendation_service.is_enabled(uid) honors override either direction.
  - nudge_service._run_scan skips a user whose override is False.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch


# ============================================================================
# get_user_override helper
# ============================================================================


def test_get_user_override_returns_none_without_inputs():
    from app.services import feature_flags as ff
    ff.invalidate_cache()
    with patch.object(ff, '_read_flags_from_firestore', return_value={}):
        assert ff.get_user_override('', 'uid-1') is None
        assert ff.get_user_override('FLAG', '') is None
        assert ff.get_user_override('FLAG', None) is None


def test_get_user_override_returns_none_when_no_cfg_or_override():
    from app.services import feature_flags as ff
    ff.invalidate_cache()
    with patch.object(ff, '_read_flags_from_firestore', return_value={}):
        assert ff.get_user_override('SOME_FLAG', 'uid-1') is None
    ff.invalidate_cache()
    cfg = {'SOME_FLAG': {'enabled': True, 'overrides': {'other-uid': True}}}
    with patch.object(ff, '_read_flags_from_firestore', return_value=cfg):
        assert ff.get_user_override('SOME_FLAG', 'uid-1') is None


def test_get_user_override_returns_bool_when_set():
    from app.services import feature_flags as ff
    ff.invalidate_cache()
    cfg = {'SOME_FLAG': {'overrides': {'on-uid': True, 'off-uid': False}}}
    with patch.object(ff, '_read_flags_from_firestore', return_value=cfg):
        assert ff.get_user_override('SOME_FLAG', 'on-uid') is True
        assert ff.get_user_override('SOME_FLAG', 'off-uid') is False


# ============================================================================
# Per-flag is_enabled(uid)
# ============================================================================


def _override_cfg(flag: str, mapping: dict) -> dict:
    return {flag: {'overrides': mapping}}


def test_derived_profile_override_wins_over_env(monkeypatch):
    from app.services import feature_flags as ff
    from app.services import derived_profile_service as dps
    ff.invalidate_cache()
    monkeypatch.setenv('DERIVED_PROFILE_ENABLED', 'false')
    cfg = _override_cfg('DERIVED_PROFILE_ENABLED', {'on-uid': True, 'off-uid': False})
    with patch.object(ff, '_read_flags_from_firestore', return_value=cfg):
        assert dps.is_enabled('on-uid') is True
        assert dps.is_enabled('off-uid') is False
        assert dps.is_enabled('no-override-uid') is False  # falls back to env
    ff.invalidate_cache()
    monkeypatch.setenv('DERIVED_PROFILE_ENABLED', 'true')
    with patch.object(ff, '_read_flags_from_firestore', return_value=cfg):
        assert dps.is_enabled('off-uid') is False  # override beats env=true
        assert dps.is_enabled('no-override-uid') is True


def test_derived_profile_no_uid_falls_back_to_env(monkeypatch):
    from app.services import feature_flags as ff
    from app.services import derived_profile_service as dps
    ff.invalidate_cache()
    monkeypatch.setenv('DERIVED_PROFILE_ENABLED', 'false')
    assert dps.is_enabled() is False
    monkeypatch.setenv('DERIVED_PROFILE_ENABLED', 'true')
    assert dps.is_enabled() is True


def test_events_logging_override_wins_over_env(monkeypatch):
    from app.services import feature_flags as ff
    from app.services import events_service
    ff.invalidate_cache()
    monkeypatch.setenv('EVENTS_LOGGING_ENABLED', 'false')
    cfg = _override_cfg('EVENTS_LOGGING_ENABLED', {'on-uid': True, 'off-uid': False})
    with patch.object(ff, '_read_flags_from_firestore', return_value=cfg):
        assert events_service.is_enabled('on-uid') is True
        assert events_service.is_enabled('off-uid') is False
        assert events_service.is_enabled('no-override-uid') is False
    ff.invalidate_cache()
    monkeypatch.setenv('EVENTS_LOGGING_ENABLED', 'true')
    with patch.object(ff, '_read_flags_from_firestore', return_value=cfg):
        assert events_service.is_enabled('off-uid') is False
        assert events_service.is_enabled('no-override-uid') is True


def test_recommendations_override_wins_over_env(monkeypatch):
    from app.services import feature_flags as ff
    from app.services import recommendation_service
    ff.invalidate_cache()
    monkeypatch.setenv('RECOMMENDATIONS_ENABLED', 'false')
    cfg = _override_cfg('RECOMMENDATIONS_ENABLED', {'on-uid': True, 'off-uid': False})
    with patch.object(ff, '_read_flags_from_firestore', return_value=cfg):
        assert recommendation_service.is_enabled('on-uid') is True
        assert recommendation_service.is_enabled('off-uid') is False
        assert recommendation_service.is_enabled('no-override-uid') is False
    ff.invalidate_cache()
    monkeypatch.setenv('RECOMMENDATIONS_ENABLED', 'true')
    with patch.object(ff, '_read_flags_from_firestore', return_value=cfg):
        assert recommendation_service.is_enabled('off-uid') is False
        assert recommendation_service.is_enabled('no-override-uid') is True


# ============================================================================
# nudge_service per-uid override inside _run_scan
# ============================================================================


def test_nudge_scan_skips_user_with_override_false(monkeypatch):
    from app.services import feature_flags as ff
    from app.services import nudge_service
    ff.invalidate_cache()
    cfg = _override_cfg('NUDGES_ENABLED', {'killed-uid': False})

    user_doc = MagicMock()
    user_doc.id = 'killed-uid'
    user_doc.to_dict.return_value = {'nudgesEnabled': True}

    db = MagicMock()
    db.collection.return_value.stream.return_value = iter([user_doc])

    eligible_mock = MagicMock(return_value=[])
    with patch.object(ff, '_read_flags_from_firestore', return_value=cfg), \
         patch.object(nudge_service, '_get_eligible_contacts', eligible_mock), \
         patch.object(nudge_service, '_cleanup_old_nudges'):
        nudge_service._run_scan(db)

    # If the override-false branch fires, _get_eligible_contacts is never called.
    eligible_mock.assert_not_called()


def test_nudge_scan_runs_user_without_override(monkeypatch):
    from app.services import feature_flags as ff
    from app.services import nudge_service
    ff.invalidate_cache()
    cfg = _override_cfg('NUDGES_ENABLED', {'other-uid': False})

    user_doc = MagicMock()
    user_doc.id = 'normal-uid'
    user_doc.to_dict.return_value = {'nudgesEnabled': True}

    db = MagicMock()
    db.collection.return_value.stream.return_value = iter([user_doc])

    eligible_mock = MagicMock(return_value=[])
    with patch.object(ff, '_read_flags_from_firestore', return_value=cfg), \
         patch.object(nudge_service, '_get_eligible_contacts', eligible_mock), \
         patch.object(nudge_service, '_cleanup_old_nudges'):
        nudge_service._run_scan(db)

    eligible_mock.assert_called_once()
