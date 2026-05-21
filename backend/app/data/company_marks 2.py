# Hand-coded marks for companies likely to appear in hero slots.
# Everyone else falls back to first letter + --brand (#1B2A44).

COMPANY_MARKS = {
    "google":          {"letters": "G",  "color": "#4285F4"},
    "meta":            {"letters": "M",  "color": "#0668E1"},
    "apple":           {"letters": "A",  "color": "#000000"},
    "openai":          {"letters": "O",  "color": "#111418"},
    "anthropic":       {"letters": "A",  "color": "#D4A27F"},
    "disney":          {"letters": "D",  "color": "#0B1E3F"},
    "sequoia":         {"letters": "S",  "color": "#1B2A44"},
    "electronic arts": {"letters": "EA", "color": "#D93A2F"},
    "netflix":         {"letters": "N",  "color": "#E50914"},
    "stripe":          {"letters": "S",  "color": "#635BFF"},
    "amazon":          {"letters": "A",  "color": "#FF9900"},
    "microsoft":       {"letters": "M",  "color": "#00A4EF"},
    "goldman sachs":   {"letters": "GS", "color": "#6F9CDE"},
    "jpmorgan":        {"letters": "JP", "color": "#003A70"},
    "mckinsey":        {"letters": "M",  "color": "#00457C"},
    "bcg":             {"letters": "B",  "color": "#00A651"},
    "bain":            {"letters": "B",  "color": "#CC0000"},
    "deloitte":        {"letters": "D",  "color": "#86BC25"},
    "morgan stanley":  {"letters": "MS", "color": "#003C71"},
    "barclays":        {"letters": "B",  "color": "#00AEEF"},
    "blackrock":       {"letters": "BR", "color": "#000000"},
    "citadel":         {"letters": "C",  "color": "#1B2A44"},
    "airbnb":          {"letters": "A",  "color": "#FF5A5F"},
}


def get_company_mark(company_name: str) -> dict:
    """Return mark for a company. Falls back to first letter + brand color."""
    key = company_name.lower().strip()
    if key in COMPANY_MARKS:
        return COMPANY_MARKS[key]
    # Try partial match for common variants like "JPMorgan Chase"
    for known, mark in COMPANY_MARKS.items():
        if known in key or key in known:
            return mark
    return {"letters": company_name[0].upper() if company_name else "?", "color": "#1B2A44"}
