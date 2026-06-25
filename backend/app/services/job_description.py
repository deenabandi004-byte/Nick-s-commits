"""Job-description helpers shared by the live detail endpoint and the
pre-fill backfill script.

Intentionally dependency-free (no Flask, Firestore, or `app.*` imports) so the
standalone backfill CLI can import it without pulling in the blueprint package.
"""


def compose_from_structured(structured) -> str:
    """Build a readable description from an enriched `structured` map (or a raw
    Firecrawl extract — both use the same keys) when no prose is available.

    Each header and bullet becomes its own paragraph (blank-line separated) so
    the detail pane's `\\n{2,}` paragraph splitter renders them as distinct
    lines rather than collapsing single newlines into spaces.
    """
    if not isinstance(structured, dict):
        return ""
    sections = [
        ("What you'll do", structured.get("responsibilities")),
        ("What we're looking for", structured.get("requirements")),
        ("Nice to have", structured.get("nice_to_have")),
    ]
    parts = []
    for header, items in sections:
        bullets = [str(i).strip() for i in (items or []) if str(i).strip()]
        if not bullets:
            continue
        parts.append(header)
        parts.extend(f"• {b}" for b in bullets)
    return "\n\n".join(parts).strip()
