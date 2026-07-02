"""
Merge explicit user filter-rail edits over LLM-parsed search queries.

Contract (shared by /prompt-search and firm search):
- A key PRESENT in `filters` replaces the parsed value entirely — an empty
  list deliberately clears that dimension (the user removed the chip).
- An absent key leaves the parsed value untouched.
- Non-dict `filters`, wrong-shaped values, and unknown keys are ignored.
"""
from typing import Any, Dict, Optional

LIST_CAP = 5
STR_CAP = 100

# rail key -> parsed-query key (People search)
_PEOPLE_KEY_MAP = {
    "titles": "title_variations",
    "companies": "companies",
    "locations": "locations",
    "schools": "schools",
    "industries": "industries",
}

_FIRM_SIZES = ("small", "mid", "large", "none")


def _clean_str(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    s = value.strip()[:STR_CAP]
    return s or None


def _clean_str_list(values: Any) -> Optional[list]:
    """Sanitize a list override. Returns None for wrong shapes (keep parse);
    returns a (possibly empty) list for a valid override."""
    if not isinstance(values, list):
        return None
    out = []
    for v in values:
        s = _clean_str(v)
        if s:
            out.append(s)
        if len(out) >= LIST_CAP:
            break
    return out


def apply_people_filters(parsed: Dict[str, Any], filters: Any) -> Dict[str, Any]:
    if not isinstance(filters, dict):
        return parsed
    out = dict(parsed)
    for rail_key, parsed_key in _PEOPLE_KEY_MAP.items():
        if rail_key in filters:
            cleaned = _clean_str_list(filters[rail_key])
            if cleaned is not None:
                if rail_key == "companies":
                    # Parser output shape for companies is
                    # [{"name": str, "matched_titles": string[]}], consumed
                    # that way by pdl_client.py (name extraction + first-company
                    # lookup). The other four dims stay plain string lists.
                    cleaned = [{"name": name, "matched_titles": []} for name in cleaned]
                out[parsed_key] = cleaned
    return out


def apply_firm_filters(parsed: Dict[str, Any], filters: Any) -> Dict[str, Any]:
    if not isinstance(filters, dict):
        return parsed
    out = dict(parsed)
    if "industry" in filters:
        out["industry"] = _clean_str(filters["industry"])
    if "location" in filters:
        out["location"] = _clean_str(filters["location"])
    if "size" in filters:
        out["size"] = filters["size"] if filters["size"] in _FIRM_SIZES else "none"
    if "keywords" in filters:
        cleaned = _clean_str_list(filters["keywords"])
        if cleaned is not None:
            out["keywords"] = cleaned
    return out
