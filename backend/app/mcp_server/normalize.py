"""
Shared cache-key normalization.

Used by cache.py (and applied identically across all three tools) so that
"Goldman Sachs", "goldman sachs ", and "goldman  sachs" hash to the same
cache key. Normalization is lowercase, strip, collapse internal whitespace.
"""
from __future__ import annotations

from typing import Any, Optional


def normalize_str(s: Optional[str]) -> Optional[str]:
    """Lowercase, strip, collapse internal whitespace to a single space.

    Returns None when s is None. Empty / whitespace-only strings normalize
    to the empty string (not None) so they can still participate in hashing.
    """
    if s is None:
        return None
    return " ".join(s.strip().lower().split())


def normalize_args(args: dict) -> dict:
    """Canonical pre-hash form of a tool's input args.

    Applies normalize_str to every str value, recursively into list / dict.
    Leaves non-str primitives (int, bool, None, float) untouched.
    """
    return {k: _normalize_value(v) for k, v in args.items()}


def _normalize_value(v: Any) -> Any:
    if isinstance(v, str):
        return normalize_str(v)
    if isinstance(v, list):
        return [_normalize_value(x) for x in v]
    if isinstance(v, dict):
        return normalize_args(v)
    return v
