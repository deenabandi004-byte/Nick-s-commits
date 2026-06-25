"""
Networking Roadmap Service — Phase 4.

Generates a personalized, time-bound networking action plan based on
user goals, career track, graduation timeline, and recruiting calendars.
Uses GPT-4o for generation, cached 7 days in Firestore.
"""
import logging
import json
from datetime import datetime, timedelta, timezone

from app.extensions import get_db
from app.services.openai_client import get_openai_client
from app.utils.contact import strip_dashes

logger = logging.getLogger(__name__)

RECRUITING_CALENDARS = {
    "Investment Banking": {
        "peak_start": "August",
        "peak_end": "October",
        "early_prep": "June",
        "description": "IB recruiting is highly structured. Summer analyst apps open Aug-Oct for juniors, with superdays in Sep-Oct.",
    },
    "Consulting": {
        "peak_start": "September",
        "peak_end": "November",
        "early_prep": "July",
        "description": "MBB and Big 4 apps open Sep-Nov. Case prep should start 2-3 months before.",
    },
    "Tech": {
        "rolling": True,
        "peak_start": "August",
        "peak_end": "March",
        "description": "Tech recruiting is rolling but peaks Aug-Mar. FAANG opens early; startups hire year-round.",
    },
    "Finance": {
        "peak_start": "September",
        "peak_end": "December",
        "early_prep": "July",
        "description": "Buy-side and asset management recruit Sep-Dec. Hedge funds may recruit earlier.",
    },
    "Marketing": {
        "rolling": True,
        "peak_start": "January",
        "peak_end": "April",
        "description": "Marketing/advertising internships typically open Jan-Apr for summer.",
    },
    "Healthcare": {
        "rolling": True,
        "peak_start": "September",
        "peak_end": "February",
        "description": "Healthcare and biotech recruit Sep-Feb with some rolling positions.",
    },
}

INDUSTRY_ALIASES = {
    "investment banking": "Investment Banking",
    "ib": "Investment Banking",
    "banking": "Investment Banking",
    "consulting": "Consulting",
    "management consulting": "Consulting",
    "strategy consulting": "Consulting",
    "tech": "Tech",
    "technology": "Tech",
    "software engineering": "Tech",
    "product management": "Tech",
    "data science": "Tech",
    "finance": "Finance",
    "asset management": "Finance",
    "private equity": "Finance",
    "hedge funds": "Finance",
    "marketing": "Marketing",
    "advertising": "Marketing",
    "healthcare": "Healthcare",
    "biotech": "Healthcare",
}


def _resolve_industry(raw: str) -> str | None:
    if not raw:
        return None
    return INDUSTRY_ALIASES.get(raw.lower().strip())


def _get_user_roadmap_context(db, uid: str) -> dict:
    """Gather user data needed for roadmap generation."""
    user_doc = db.collection("users").document(uid).get()
    user_data = user_doc.to_dict() or {} if user_doc.exists else {}

    professional = user_data.get("professionalInfo") or {}
    goals = user_data.get("goals") or {}
    academics = user_data.get("academics") or {}

    career_track = (
        professional.get("careerTrack")
        or user_data.get("careerTrack")
        or goals.get("careerTrack")
        or ""
    )

    graduation_year = (
        academics.get("graduationYear")
        or user_data.get("graduationYear")
        or professional.get("graduationYear")
        or ""
    )

    university = (
        user_data.get("university")
        or professional.get("university")
        or user_data.get("school")
        or ""
    )

    dream_companies = goals.get("dreamCompanies") or user_data.get("dreamCompanies") or []
    if isinstance(dream_companies, str):
        dream_companies = [c.strip() for c in dream_companies.split(",") if c.strip()]

    # Count existing contacts
    contact_count = 0
    try:
        contacts = list(
            db.collection("users").document(uid)
            .collection("contacts")
            .limit(500)
            .stream()
        )
        contact_count = len(contacts)
    except Exception:
        pass

    return {
        "career_track": career_track,
        "graduation_year": str(graduation_year),
        "university": university,
        "dream_companies": dream_companies[:5],
        "contact_count": contact_count,
        "tier": user_data.get("subscriptionTier", user_data.get("tier", "free")),
    }


def generate_roadmap(uid: str) -> dict:
    """
    Generate a personalized networking roadmap using GPT-4o.
    Returns structured roadmap with weeks, goals, and milestones.
    """
    db = get_db()
    ctx = _get_user_roadmap_context(db, uid)

    industry = _resolve_industry(ctx["career_track"]) or "Tech"
    calendar = RECRUITING_CALENDARS.get(industry, RECRUITING_CALENDARS["Tech"])

    now = datetime.now(timezone.utc)
    current_month = now.strftime("%B %Y")

    client = get_openai_client()
    if not client:
        return _build_fallback_roadmap(ctx, industry, calendar, now)

    prompt = f"""Generate a 6-week personalized networking roadmap for this student.

STUDENT PROFILE:
- University: {ctx['university'] or 'Not specified'}
- Target industry: {ctx['career_track'] or industry}
- Graduation year: {ctx['graduation_year'] or 'Not specified'}
- Dream companies: {', '.join(ctx['dream_companies']) if ctx['dream_companies'] else 'Not specified'}
- Current network: {ctx['contact_count']} contacts already reached out to
- Current date: {current_month}

RECRUITING CALENDAR for {industry}:
- Peak recruiting: {calendar.get('peak_start', 'varies')} to {calendar.get('peak_end', 'varies')}
- Early prep starts: {calendar.get('early_prep', 'varies')}
- Notes: {calendar.get('description', '')}
- Rolling: {'Yes' if calendar.get('rolling') else 'No'}

INSTRUCTIONS:
- Create a 6-week plan with specific weekly goals
- Each week should have: email targets (number), who to target (seniority/company type), and one milestone
- Account for the student's current network size
- If they're close to peak recruiting, accelerate the plan
- If they have few contacts, start with broader outreach before narrowing
- Reference their dream companies in specific weeks
- Include when to shift from outreach to interview prep
- Never use em dashes or en dashes; use a comma or a period instead

Return ONLY valid JSON in this exact format:
{{
  "summary": "One-paragraph overview of the plan",
  "weeks": [
    {{
      "weekNumber": 1,
      "theme": "Short theme (e.g., 'Foundation Building')",
      "emailTarget": 8,
      "targetDescription": "Who to email and why",
      "milestone": "What success looks like this week",
      "companies": ["Company1", "Company2"]
    }}
  ],
  "keyDates": ["Oct 15: Goldman Sachs app deadline", "Nov 1: McKinsey first round"],
  "totalEmailTarget": 48
}}"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": "You are a career advisor who creates actionable, week-by-week networking plans for college students. Be specific about numbers, companies, and seniority levels. Return only valid JSON.",
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=1500,
            temperature=0.7,
        )
        text = response.choices[0].message.content or ""

        # Clean markdown wrapping
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()

        roadmap = json.loads(text)
        # House style: no em/en dashes in generated copy. Sanitize the
        # user-facing text fields before caching and returning.
        if isinstance(roadmap.get("summary"), str):
            roadmap["summary"] = strip_dashes(roadmap["summary"])
        for _wk in roadmap.get("weeks") or []:
            for _k in ("theme", "targetDescription", "milestone"):
                if isinstance(_wk.get(_k), str):
                    _wk[_k] = strip_dashes(_wk[_k])
        roadmap["keyDates"] = [
            strip_dashes(d) if isinstance(d, str) else d
            for d in (roadmap.get("keyDates") or [])
        ]
        roadmap["generatedAt"] = now.isoformat().replace("+00:00", "Z")
        roadmap["industry"] = industry
        roadmap["calendar"] = calendar

        # Cache in Firestore
        _cache_roadmap(db, uid, roadmap)

        return roadmap

    except Exception as e:
        logger.error("Roadmap generation failed for uid=%s: %s", uid, e)
        return _build_fallback_roadmap(ctx, industry, calendar, now)


def _build_fallback_roadmap(ctx: dict, industry: str, calendar: dict, now: datetime) -> dict:
    """Deterministic fallback roadmap when GPT is unavailable."""
    dream = ctx.get("dream_companies", [])
    contact_count = ctx.get("contact_count", 0)

    weeks = [
        {
            "weekNumber": 1,
            "theme": "Foundation Building",
            "emailTarget": 6,
            "targetDescription": f"Analysts and associates at your top {industry.lower()} firms",
            "milestone": f"Send 6 personalized outreach emails to {industry.lower()} professionals",
            "companies": dream[:2] if dream else [],
        },
        {
            "weekNumber": 2,
            "theme": "Expand Your Net",
            "emailTarget": 8,
            "targetDescription": "VPs and senior associates, aim for seniority diversity",
            "milestone": "Follow up on week 1 emails + 8 new contacts",
            "companies": dream[1:3] if len(dream) > 1 else dream[:1],
        },
        {
            "weekNumber": 3,
            "theme": "Deep Dive",
            "emailTarget": 8,
            "targetDescription": f"Alumni from your school at {industry.lower()} firms",
            "milestone": "Schedule your first 2 coffee chats",
            "companies": [],
        },
        {
            "weekNumber": 4,
            "theme": "Follow-Up Blitz",
            "emailTarget": 6,
            "targetDescription": "Follow up on all pending emails + 6 new targets",
            "milestone": "Complete 3 coffee chats total",
            "companies": dream[2:4] if len(dream) > 2 else [],
        },
        {
            "weekNumber": 5,
            "theme": "Strategic Targeting",
            "emailTarget": 6,
            "targetDescription": "Hiring managers and team leads at dream companies",
            "milestone": "Have insider knowledge about 2+ firms' culture",
            "companies": dream[:2] if dream else [],
        },
        {
            "weekNumber": 6,
            "theme": "Interview Prep Transition",
            "emailTarget": 4,
            "targetDescription": "Final outreach + shift to interview prep materials",
            "milestone": "Network complete, begin focused interview preparation",
            "companies": [],
        },
    ]

    return {
        "summary": f"A 6-week plan to build your {industry.lower()} network. "
                   f"You've already reached {contact_count} contacts, this plan adds ~38 more targeted connections.",
        "weeks": weeks,
        "keyDates": [],
        "totalEmailTarget": sum(w["emailTarget"] for w in weeks),
        "generatedAt": now.isoformat().replace("+00:00", "Z"),
        "industry": industry,
        "calendar": calendar,
        "isFallback": True,
    }


def _cache_roadmap(db, uid: str, roadmap: dict):
    """Cache roadmap in Firestore with 7-day TTL."""
    try:
        cache_ref = db.collection("users").document(uid).collection("cache").document("networkingRoadmap")
        cache_ref.set({
            "roadmap": roadmap,
            "cachedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        })
    except Exception as exc:
        logger.warning("Failed to cache roadmap for uid=%s: %s", uid, exc)


def compute_roadmap_progress(uid: str) -> dict | None:
    """
    Compute progress against the cached roadmap for the current week.
    Returns None if no roadmap exists or is expired.
    """
    roadmap = get_cached_roadmap(uid)
    if not roadmap:
        return None

    weeks = roadmap.get("weeks") or []
    if not weeks:
        return None

    generated_at = roadmap.get("generatedAt", "")
    if not generated_at:
        return None

    try:
        gen_dt = datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None

    now = datetime.now(timezone.utc)
    days_since = (now - gen_dt).days
    current_week_idx = min(days_since // 7, len(weeks) - 1)
    current_week = weeks[current_week_idx]

    # Count actual emails sent and replies received this week
    db = get_db()
    week_start = gen_dt + timedelta(days=current_week_idx * 7)
    week_start_iso = week_start.isoformat().replace("+00:00", "Z")

    emails_sent = 0
    replies_received = 0
    try:
        contacts_ref = db.collection("users").document(uid).collection("contacts")
        # Count emails generated this week
        email_docs = list(
            contacts_ref
            .where("emailGeneratedAt", ">=", week_start_iso)
            .limit(100)
            .stream()
        )
        emails_sent = len(email_docs)

        # Count replies received this week
        for doc in email_docs:
            data = doc.to_dict() or {}
            if data.get("replyReceivedAt") and data["replyReceivedAt"] >= week_start_iso:
                replies_received += 1
    except Exception:
        pass

    email_target = current_week.get("emailTarget", 6)
    # Reply target is roughly 20% of email target (realistic networking reply rate)
    reply_target = max(1, email_target // 5)

    # Determine status
    email_pct = emails_sent / email_target if email_target else 1.0
    if email_pct >= 1.0:
        status = "ahead"
    elif email_pct >= 0.5:
        status = "on_track"
    else:
        status = "behind"

    return {
        "currentWeek": current_week_idx + 1,
        "weekTheme": current_week.get("theme", ""),
        "emailsSent": emails_sent,
        "emailTarget": email_target,
        "repliesReceived": replies_received,
        "replyTarget": reply_target,
        "status": status,
    }


def get_cached_roadmap(uid: str) -> dict | None:
    """Return cached roadmap if less than 7 days old."""
    db = get_db()
    try:
        cache_ref = db.collection("users").document(uid).collection("cache").document("networkingRoadmap")
        doc = cache_ref.get()
        if doc.exists:
            data = doc.to_dict() or {}
            cached_at = data.get("cachedAt", "")
            if cached_at:
                cached_dt = datetime.fromisoformat(cached_at.replace("Z", "+00:00"))
                age_days = (datetime.now(timezone.utc) - cached_dt).total_seconds() / 86400
                if age_days < 7:
                    return data.get("roadmap")
    except Exception:
        pass
    return None
