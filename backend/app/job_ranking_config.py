"""
Job ranking config (phase 1).

Single source of truth for how the ranker composes signals into a match
score and how the feed renderer composes jobs into buckets. One default
profile, calibrated so that under default settings the feed behaves
exactly as it did before this module landed. Tuning happens by editing
this file, not by code changes downstream.

PHASE 1 GUARANTEE: with DEFAULT_PROFILE as written, the user-visible feed
is identical to the pre-config behavior. Behavior changes when (and only
when) we deliberately tune one of these knobs.

Field semantics:
  render_mode             "legacy" preserves the old two-array shape and
                          ignores bucket_mix. Flip to "buckets" in phase 2
                          to start composing the feed from bucket pools.
  bucket_mix              Slot allocation across STRONG / REACH / HIDDEN
                          when render_mode == "buckets". Inert under
                          "legacy".
  within_bucket_weights   Per-bucket weighting used to compute the
                          composite (match_score). Defaults put 100%
                          weight on relevance so the composite equals the
                          old GPT score exactly.
  bucket_assignment       Thresholds the natural-bucket tagger reads. Tags
                          are computed unconditionally for telemetry, but
                          only drive the render in "buckets" mode.
  hard_drop               Safety floors. A job that fails any active
                          floor is removed from the feed before sort.
                          landability_below replaces the old level +
                          location gates.
  interest_gate.enabled   Preserves the existing interest gate as a
                          separate hard filter. Phase 2 may roll this
                          into relevance_below.
  ranker.gpt_rank_count   Top-N candidates sent to GPT. Unchanged from
                          today.
  ranker.fallback_for_no_resume
                          When relevance is unavailable (no resume), sort
                          by this strategy. "recency" is the current
                          behavior.

Compatibility:
  - Adding new keys is safe; readers must default missing keys via
    profile.get(key, fallback).
  - Removing or retyping keys requires a coordinated reader update.
"""

from typing import Dict, Literal

RenderMode = Literal["legacy", "buckets"]
BucketKey = Literal["strong", "reach", "hidden"]
SignalKey = Literal["relevance", "landability", "pipeline", "discovery"]


DEFAULT_PROFILE: Dict = {
    "render_mode": "legacy",

    "bucket_mix": {
        "strong": 1.0,
        "reach":  0.0,
        "hidden": 0.0,
    },

    "within_bucket_weights": {
        "strong":  {"relevance": 1.0, "landability": 0.0, "pipeline": 0.0, "discovery": 0.0},
        "reach":   {"relevance": 1.0, "landability": 0.0, "pipeline": 0.0, "discovery": 0.0},
        "hidden":  {"relevance": 1.0, "landability": 0.0, "pipeline": 0.0, "discovery": 0.0},
    },

    "bucket_assignment": {
        "reach_when_landability_below": 45,
        "hidden_when_discovery_above":  70,
        "hidden_when_pipeline_above":   50,
    },

    "hard_drop": {
        "landability_below": 15,
        "relevance_below":    0,
    },

    "interest_gate": {
        "enabled": True,
    },

    "ranker": {
        "gpt_rank_count": 20,
        "fallback_for_no_resume": "recency",
    },
}


def get_active_profile() -> Dict:
    """
    Return the active ranking profile for the current request.

    Phase 1: always returns DEFAULT_PROFILE.
    Phase 2: will look up tier and (optional) experiment assignment, and
    may return a different profile per request.

    Callers should treat the returned dict as read-only.
    """
    return DEFAULT_PROFILE
