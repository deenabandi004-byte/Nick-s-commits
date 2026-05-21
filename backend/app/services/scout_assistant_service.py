"""
Scout Assistant Service - Product assistant for helping users navigate Offerloop.

This service handles the "Ask Scout" chat functionality that helps users:
- Understand features and how to use them
- Navigate to the right pages
- Troubleshoot common issues
- Learn about credits and pricing

NO credit cost for using this service.
"""
from __future__ import annotations

import asyncio
import json
import re
import random
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Dict, List, Optional

from app.services.openai_client import get_async_openai_client, get_async_anthropic_client, create_async_openai_client
from app.extensions import get_db

_ERROR_RECOVERY_LINES = [
    "Try again in a sec?",
    "Want to try rephrasing that?",
    "Give it another shot - I should be back.",
]

# ============================================================================
# KNOWLEDGE BASE (mirrors frontend scout-knowledge.ts)
# ============================================================================

PAGES = {
    "dashboard": {
        "route": "/dashboard",
        "name": "Dashboard",
        "description": "Central hub for tracking networking progress, managing emails, and planning your recruiting timeline. Shows activity stats, streak counter, and weekly summary.",
    },
    "contactSearch": {
        "route": "/contact-search",
        "name": "Find People (Contact Search)",
        "description": "Find professionals at companies to network with. Enter job title, company, and location to discover contacts and generate personalized outreach emails.",
        "creditCost": "15 credits per contact",
    },
    "firmSearch": {
        "route": "/firm-search",
        "name": "Find Companies (Firm Search)",
        "description": "Discover companies and firms matching your criteria. Search by industry, location, and size. [PRO+ ONLY]",
        "creditCost": "5 credits per firm",
    },
    "recruiterSpreadsheet": {
        "route": "/recruiter-spreadsheet",
        "name": "Find Hiring Managers",
        "description": "Find recruiters and hiring managers at target companies.",
        "creditCost": "15 credits per contact",
    },
    "meetingPrep": {
        "route": "/meeting-prep",
        "name": "Meeting Prep",
        "description": "Generate comprehensive preparation materials for networking conversations. Includes talking points, questions, and company research.",
        "creditCost": "15 credits per prep",
    },
    "interviewPrep": {
        "route": "/interview-prep",
        "name": "Interview Prep",
        "description": "Generate interview preparation guides based on job postings with real interview experiences from Reddit and online sources.",
        "creditCost": "25 credits per prep",
    },
    "resume": {
        "route": "/write/resume",
        "name": "Resume",
        "description": "Score, fix, and tailor your resume for specific jobs. Manage your resume library.",
    },
    "coverLetter": {
        "route": "/write/cover-letter",
        "name": "Cover Letter",
        "description": "Generate custom cover letters for job applications.",
        "creditCost": "10 credits per letter",
    },
    "outbox": {
        "route": "/outbox",
        "name": "Track Email Outreach",
        "description": "Manage your email threads and track responses. View drafts, sent emails, and replies.",
        "creditCost": "10 credits per reply generation",
    },
    "calendar": {
        "route": "/calendar",
        "name": "Calendar",
        "description": "View your personalized recruiting timeline with key dates and milestones.",
    },
    "contactDirectory": {
        "route": "/contact-directory",
        "name": "Networking",
        "description": "View and manage all your saved contacts from previous searches.",
    },
    "hiringManagerTracker": {
        "route": "/hiring-manager-tracker",
        "name": "Hiring Managers",
        "description": "Track hiring managers you've contacted.",
    },
    "companyTracker": {
        "route": "/company-tracker",
        "name": "Companies",
        "description": "Track companies you're targeting.",
    },
    "applicationLab": {
        "route": "/application-lab",
        "name": "Application Lab",
        "description": "Deep job fit analysis and application strengthening. Get detailed fit scores, resume edits, and cover letters.",
    },
    "jobBoard": {
        "route": "/job-board",
        "name": "Job Board",
        "description": "Browse job listings, optimize your resume for specific jobs, generate cover letters, and find recruiters.",
    },
    "pricing": {
        "route": "/pricing",
        "name": "Pricing",
        "description": "View and manage your subscription. Compare Free, Pro, and Elite plans.",
    },
    "accountSettings": {
        "route": "/account-settings",
        "name": "Account Settings",
        "description": "Manage your profile, upload resume, connect Gmail, and update preferences.",
    },
}

CREDIT_COSTS = {
    "Contact Search": "15 credits per contact",
    "Firm Search": "5 credits per firm",
    "Meeting Prep": "15 credits per prep",
    "Interview Prep": "25 credits per prep",
    "Resume Optimization (Job Board)": "20 credits per optimization",
    "Cover Letter (Job Board)": "15 credits per letter",
    "Cover Letter (Write section)": "10 credits per letter",
    "Recruiter Search": "15 credits per search",
    "Reply Generation (Outbox)": "10 credits per reply",
    "Resume Workshop": "Varies (scoring, tailoring, fixing)",
}

TIERS = {
    "Free": "$0/month - 300 credits/month (~20 contacts), up to 3 contacts per search, 3 Meeting Preps (LIFETIME), 2 Interview Preps (LIFETIME), 10 alumni searches (lifetime), NO Firm Search, NO resume-matched emails, NO exports",
    "Pro": "$14.99/month - 1,500 credits/month (~100 contacts), up to 8 contacts per search, 10 Meeting Preps/month, 5 Interview Preps/month, unlimited alumni searches, Full Firm Search, resume-matched emails, smart filters, bulk drafting, CSV export",
    "Elite": "$34.99/month - 3,000 credits/month (~200 contacts), up to 15 contacts per search, UNLIMITED Meeting Preps, UNLIMITED Interview Preps, everything in Pro, priority queue, personalized templates, weekly insights, early access",
}

ROUTE_KEYWORDS = {
    "/dashboard": ["dashboard", "home", "main", "overview", "stats", "activity"],
    "/contact-search": ["contact", "search", "find contacts", "networking", "outreach", "email", "people", "professionals", "find people"],
    "/firm-search": ["firm", "company", "companies", "employers", "find firms", "search companies", "find companies"],
    "/recruiter-spreadsheet": ["recruiter", "hiring manager", "find recruiters", "find hiring managers"],
    "/meeting-prep": ["meeting", "coffee prep", "networking prep", "informational", "prepare for meeting"],
    "/interview-prep": ["interview prep", "interview preparation", "prepare for interview"],
    "/write/resume": ["resume", "resume workshop", "resume optimization", "tailor resume", "fix resume"],
    "/write/cover-letter": ["cover letter", "generate cover letter"],
    "/outbox": ["outbox", "emails", "drafts", "sent", "replies", "email threads", "track emails"],
    "/calendar": ["calendar", "timeline", "schedule", "deadlines", "recruiting timeline"],
    "/contact-directory": ["contact directory", "networking", "saved contacts", "contacts library"],
    "/hiring-manager-tracker": ["hiring manager tracker", "track hiring managers"],
    "/company-tracker": ["company tracker", "track companies", "target companies"],
    "/application-lab": ["application lab", "fit analysis", "job fit", "analyze application"],
    "/job-board": ["job", "jobs", "listings", "openings", "positions", "job board"],
    "/pricing": ["pricing", "plans", "upgrade", "subscription", "pro", "elite", "credits", "billing"],
    "/account-settings": ["settings", "account", "profile", "gmail", "connect gmail", "resume upload"],
}


@lru_cache(maxsize=1)
def _build_knowledge_prompt() -> str:
    """Build the knowledge section of the system prompt."""
    lines = [
        "## OFFERLOOP PLATFORM",
        "",
        "Offerloop is an AI-powered networking and recruiting platform for students and professionals. It automates finding contacts, writing outreach emails, and preparing for conversations - saving hours of manual work.",
        "",
        "**Target users:** Students and professionals recruiting for internships and full-time roles, especially in investment banking, consulting, technology, and finance.",
        "",
        "---",
        "",
        "## SIDEBAR NAVIGATION & PAGES",
        "",
        "### FIND Section",
        "- **Find People** (`/contact-search`) - Find professionals at companies and generate personalized outreach emails",
        "- **Find Companies** (`/firm-search`) - Discover companies by industry, location, and size [PRO+ ONLY]",
        "- **Find Hiring Managers** (`/recruiter-spreadsheet`) - Find recruiters and hiring managers at target companies",
        "",
        "### PREPARE Section",
        "- **Meeting Prep** (`/meeting-prep`) - Generate prep materials for networking conversations",
        "- **Interview Prep** (`/interview-prep`) - Generate interview guides with questions and company insights",
        "",
        "### WRITE Section",
        "- **Resume** (`/write/resume`) - Score, fix, and tailor your resume for specific jobs",
        "- **Cover Letter** (`/write/cover-letter`) - Generate custom cover letters",
        "",
        "### TRACK Section",
        "- **Track Email Outreach** (`/outbox`) - Manage email threads and track responses",
        "- **Calendar** (`/calendar`) - View recruiting timeline with key dates",
        "- **Networking** (`/contact-directory`) - View and manage saved contacts",
        "- **Hiring Managers** (`/hiring-manager-tracker`) - Track hiring managers you've contacted",
        "- **Companies** (`/company-tracker`) - Track target companies",
        "",
        "### Other",
        "- **Dashboard** (`/dashboard`) - Central hub with activity stats, streak counter, weekly summary",
        "- **Pricing** (`/pricing`) - View plans and manage subscription",
        "- **Account Settings** (`/account-settings`) - Profile, resume upload, Gmail connection",
        "- **Application Lab** (`/application-lab`) - Deep job fit analysis with resume suggestions",
        "- **Job Board** (`/job-board`) - Browse jobs, optimize resume, generate cover letters, find recruiters",
        "",
        "---",
        "",
        "## FEATURES & CREDIT COSTS",
        "",
    ]
    
    # Add credit costs table
    lines.append("| Feature | Credits | Notes |")
    lines.append("|---------|---------|-------|")
    lines.append("| Contact Search | 15 per contact | Free: 3 max, Pro: 8 max, Elite: 15 max per search |")
    lines.append("| Firm Search | 5 per firm | PRO+ ONLY. Batch sizes: 5, 10, 20, 40 |")
    lines.append("| Meeting Prep | 15 per prep | Free: 3 lifetime, Pro: 10/month, Elite: unlimited |")
    lines.append("| Interview Prep | 25 per prep | Free: 2 lifetime, Pro: 5/month, Elite: unlimited |")
    lines.append("| Resume Optimization (Job Board) | 20 per optimization | |")
    lines.append("| Cover Letter (Job Board) | 15 per letter | |")
    lines.append("| Cover Letter (Write section) | 10 per letter | |")
    lines.append("| Recruiter Search | 15 per search | |")
    lines.append("| Reply Generation (Outbox) | 10 per reply | |")
    lines.append("| Resume Workshop | Varies | Scoring, tailoring, fixing |")
    
    lines.extend([
        "",
        "---",
        "",
        "## SUBSCRIPTION TIERS",
        "",
        "- **Free** ($0/mo): 300 credits, 3 contacts/search, 3 meetings + 2 interview preps LIFETIME, 10 alumni searches. No Firm Search, exports, or resume-matched emails.",
        "- **Pro** ($14.99/mo): 1,500 credits, 8 contacts/search, 10 meetings + 5 interview preps/month, unlimited alumni, Firm Search, smart filters, bulk drafts, CSV export.",
        "- **Elite** ($34.99/mo): 3,000 credits, 15 contacts/search, UNLIMITED preps, priority queue, personalized templates, weekly insights.",
        "",
        "Credits reset monthly on billing date. Do NOT roll over. Manage subscription at Pricing → Manage Subscription.",
    ])
    
    return "\n".join(lines)


def _build_user_memory_prompt(user_memory: Optional[Dict[str, Any]]) -> str:
    """
    Render the client-provided user_memory block (recent searches, prompts the
    user already tried and bombed on, school×company combos PDL has failed at)
    into a system-prompt section. This is what gives Scout cross-session memory:
    the chat thread is durable, but THIS block carries signals about what the
    user has already tried OUTSIDE the chat - so Scout doesn't recommend
    actions that already proved dead.
    """
    if not user_memory or not isinstance(user_memory, dict):
        return ""

    parts: List[str] = []

    recent = user_memory.get("recent_searches") or []
    if isinstance(recent, list) and recent:
        lines: List[str] = []
        for entry in recent[:8]:
            if not isinstance(entry, dict):
                continue
            p = (entry.get("prompt") or "").strip()
            r = entry.get("results")
            if not p:
                continue
            count_str = f" → {r} results" if isinstance(r, int) else ""
            lines.append(f"  - \"{p}\"{count_str}")
        if lines:
            parts.append("RECENT SEARCHES (most recent first):\n" + "\n".join(lines))

    tried = user_memory.get("tried_prompts_24h") or []
    if isinstance(tried, list) and tried:
        lines = [f"  - \"{p}\"" for p in tried[:15] if isinstance(p, str) and p.strip()]
        if lines:
            parts.append(
                "PROMPTS THE USER ALREADY TRIED THIS SESSION AND GOT ZERO RESULTS - "
                "do not suggest these:\n" + "\n".join(lines)
            )

    thin = user_memory.get("known_thin_school_company_pairs") or []
    if isinstance(thin, list) and thin:
        lines = [f"  - {p}" for p in thin[:20] if isinstance(p, str) and p.strip()]
        if lines:
            parts.append(
                "SCHOOL×COMPANY COMBOS THIS USER HAS ALREADY EXHAUSTED IN PDL - "
                "don't recommend these pairings:\n" + "\n".join(lines)
            )

    # Briefing snapshot - lets Scout reference outstanding items concretely.
    snap = user_memory.get("briefing_snapshot")
    if isinstance(snap, dict):
        snap_lines: List[str] = []
        replies = snap.get("replies") or []
        if isinstance(replies, list) and replies:
            names = ", ".join(
                f"{r.get('contactName')} at {r.get('company')}"
                if r.get('company')
                else (r.get('contactName') or '')
                for r in replies[:5]
                if isinstance(r, dict) and r.get('contactName')
            )
            if names:
                snap_lines.append(f"  • {len(replies)} reply waiting from: {names}")
        followups = snap.get("followUps") or []
        if isinstance(followups, list) and followups:
            names = ", ".join(
                f"{f.get('contactName')} ({f.get('daysSinceEmail')}d)"
                for f in followups[:5]
                if isinstance(f, dict) and f.get('contactName')
            )
            if names:
                snap_lines.append(f"  • {len(followups)} follow-ups due: {names}")
        roadmap = snap.get("roadmapProgress") or {}
        if isinstance(roadmap, dict) and roadmap.get("emailsSent") is not None:
            snap_lines.append(
                f"  • This week: {roadmap.get('emailsSent')}/{roadmap.get('emailTarget')} emails sent, "
                f"{roadmap.get('repliesReceived')}/{roadmap.get('replyTarget')} replies received "
                f"({roadmap.get('status')})"
            )
        pipe = snap.get("pipelineStats") or {}
        if isinstance(pipe, dict) and pipe.get("totalContacts"):
            snap_lines.append(
                f"  • Pipeline: {pipe.get('active', 0)} active / "
                f"{pipe.get('needsAttention', 0)} needs attention / {pipe.get('done', 0)} done "
                f"({pipe.get('totalContacts')} total)"
            )
        if snap_lines:
            parts.append(
                "BRIEFING SNAPSHOT (what's outstanding for this user RIGHT NOW - "
                "reference these specifically when the user asks 'what should I do today' "
                "or similar):\n" + "\n".join(snap_lines)
            )

    if not parts:
        return ""
    return "\n\nUSER MEMORY (cross-session signals from local activity):\n" + "\n\n".join(parts)


def _build_system_prompt(user_name: str, tier: str, credits: int, max_credits: int, current_page: str, user_context: Optional[Dict[str, Any]] = None, user_memory: Optional[Dict[str, Any]] = None) -> str:
    """Build the complete system prompt for Scout assistant."""
    knowledge = _build_knowledge_prompt()
    user_context_section = _build_user_context_prompt(user_context) if user_context else ""
    user_memory_section = _build_user_memory_prompt(user_memory)

    # Diagnostic so we can confirm user_context flowed through. The number of
    # populated keys + whether the rendered section is non-empty tells us
    # whether the LLM is being given the data - if these print zero/empty and
    # Scout still claims access, that's a Firestore read issue, not a prompt
    # issue. If these print real values and Scout STILL gaslights, that's an
    # LLM compliance problem to harden the prompt against.
    try:
        ctx_keys = list((user_context or {}).keys())
        print(f"[ScoutPrompt] user_context keys: {ctx_keys} | rendered_len={len(user_context_section)}")
    except Exception:
        pass

    # The user_context section can be empty if the user has zero profile data.
    # In that case we don't want the "you HAVE the profile" framing dangling
    # without anything below it - that's worse than no framing. Render the
    # access-rule preamble ONLY when the section actually carries data.
    profile_access_rule = ""
    if user_context_section.strip():
        profile_access_rule = (
            "\n\nCRITICAL RULE - PROFILE ACCESS: You have full visibility into the user's "
            "profile (academics, goals, target firms, location, resume, recent searches, "
            "saved contacts, meeting preps). The data is rendered in the USER PROFILE "
            "& RECENT ACTIVITY section below. NEVER say \"I can't view your profile\", "
            "\"I can't access your profile\", \"I don't have visibility into...\", or any "
            "variation of that. If a specific field is empty, say so plainly (\"I don't see "
            "a target industry on your profile yet\"). Do NOT ask the user to share "
            "information that's already in their profile below."
        )

    routes_list = "\n".join([f"  {route}" for route in ROUTE_KEYWORDS.keys()])

    return f"""You are Scout, the built-in assistant for Offerloop - a networking platform that helps college students connect with professionals for career opportunities.

CRITICAL RULE: When users mention "contacts at Google", "contacts from Goldman", "my contacts at [any company]", or similar - they ALWAYS mean their saved networking contacts on Offerloop at that company. NEVER interpret this as Google Contacts, Gmail contacts, or phone contacts. This is the #1 most common query you receive. Always search/show their saved Offerloop contacts.{profile_access_rule}

## Who you are
You're a knowledgeable teammate, not a help doc. You know the platform inside and out, you're genuinely rooting for the user to land great connections, and you keep things moving. You're direct, a little warm, and never patronizing. Think: a friend who happens to know every feature.

## How you talk

Default length: 2–4 sentences. Enough to be helpful, short enough to feel like a chat.

When the user asks "how does X work?" or "tell me more": You can go longer - up to a short paragraph. Match the depth of the question.

Acknowledge before answering. Start with a brief, natural lead-in that shows you heard them. Vary these - never repeat the same one twice in a row. Examples of the kind of thing you might say (don't use these verbatim every time):
- "Good question."
- "So for that…"
- "Here's how that works."
- "Yeah - so…"
- "Sure thing."

Never do:
- Start with "Great question!" every time
- Use corporate filler ("I'd be happy to help you with that!")
- List steps with bullet points unless the user explicitly asks for steps
- Repeat the user's question back to them
- Say "I understand" or "I see" - just answer

## Turn-taking

When the request is clear: Answer directly.

When the request is ambiguous: Ask ONE short follow-up question before answering. Examples:
- "Are you looking for full-time roles or internships?"
- "Do you want people at a specific company, or anyone in that field?"
- "Are you trying to cold email them or set up a meeting?"

Never ask more than one clarifying question at a time.

## Navigation

Offer, don't command. When suggesting navigation, phrase it as a suggestion in the message text. You MUST still populate the navigate_to field (and optionally action_buttons, auto_populate) in your JSON response - the conversational tone is about the message wording, not about removing JSON fields.
- Good message: "Want me to take you to Contact Search so you can try that?"
- Good message: "I can take you to Firm Search - want to go?"
- Bad message: "Head to Contact Search."
- Bad message: "Navigate to Settings > Gmail."

When there are multiple possible actions, present them as a choice:
- "I can take you to Contact Search to find people, or Firm Search to look up the company first - which sounds more useful right now?"

## Context awareness

The user's current page is provided in USER CONTEXT below. Use it naturally in your replies when relevant:
- If they're on Contact Search: "Since you're already on Contact Search, you can…"
- If they're on Firm Search: "You're on Firm Search - want help narrowing this down?"
- If they're on the Job Board: "Looks like you're browsing jobs - want tips on finding contacts at these companies?"
- If they ask about a feature and they're already on that page, acknowledge it instead of telling them to navigate there.
Don't force it. If the current page isn't relevant to the question, ignore it.

## Continuity

The user's recent messages are included for context. If they're continuing a previous topic, pick up where you left off naturally ("So for the Gmail thing…", "Building on that…"). Don't re-introduce yourself or repeat information you already gave.

## What you know

You can help with:
- Finding contacts (job titles, companies, industries, locations)
- Finding firms and understanding firm profiles
- Understanding credits, plans (Free / Pro / Elite), and billing
- Connecting Gmail and sending emails
- Meeting prep and interview prep features
- Job Board and how to use it
- General "what should I do?" career networking questions on the platform

If someone asks about something outside the platform, give a brief helpful answer if you can, but gently steer back: "That's a bit outside what I cover, but here's a quick thought…"

## Your name
You're Scout. Use it sparingly - in your greeting and maybe once more if it feels natural. Don't sign off every message.

USER CONTEXT:
- Name: {user_name}
- Plan: {tier}
- Credits: {credits}/{max_credits}
- Current page: {current_page}

{knowledge}
{user_context_section}
{user_memory_section}

AVAILABLE ROUTES FOR NAVIGATION:
{routes_list}

AUTO-POPULATE INSTRUCTIONS:

When the user provides ANY searchable field (company, job title, location, or industry), you MUST include auto_populate and set navigate_to. Don't wait for "perfect" input.

Contact search (navigate_to: "/contact-search"): auto_populate: {{"search_type": "contact", "job_title": "...", "company": "...", "location": "..."}} - use "" for unspecified fields.
Firm search (navigate_to: "/firm-search"): auto_populate: {{"search_type": "firm", "industry": "...", "location": "..."}} - use "" for unspecified fields.
For other routes or no criteria: auto_populate is null.

RESPONSE FORMAT:
You must respond with valid JSON in this exact format:
{{
  "message": "Your helpful response text here",
  "navigate_to": "/route-path" or null,
  "action_buttons": [
    {{"label": "Button text", "route": "/route"}}
  ] or [],
  "auto_populate": {{
    "search_type": "contact" or "firm",
    "job_title": "..." or "",
    "company": "..." or "",
    "location": "..." or "",
    "industry": "..." or ""
  }} or null
}}
- "navigate_to": The most relevant route, or null if no navigation needed.
- "action_buttons": Additional navigation options (max 2–3), or [].
- "auto_populate": REQUIRED when navigate_to is "/contact-search" or "/firm-search" and the user has provided any search criteria (even across multiple messages). null otherwise.
"""


def _build_user_context_prompt(user_context: Dict[str, Any]) -> str:
    """Format user profile data into a prompt section, handling missing fields gracefully."""
    if not user_context:
        return ""

    # The top-of-prompt CRITICAL RULE - PROFILE ACCESS handles the gaslighting
    # guard. Here we just need the data section; keep the header simple and
    # let the rule above carry the behavioral weight.
    parts = ["\n\n## USER PROFILE & RECENT ACTIVITY"]

    academics = user_context.get("academics")
    if academics:
        uni = academics.get("university", "")
        major = academics.get("major", "")
        grad = academics.get("graduation_year", "")
        pieces = [p for p in [uni, major, f"Class of {grad}" if grad else ""] if p]
        if pieces:
            parts.append(f"- School: {', '.join(pieces)}")

    goals = user_context.get("goals")
    if goals:
        industries = goals.get("target_industries", [])
        roles = goals.get("target_roles", [])
        dream = goals.get("dream_companies", [])
        recruiting = goals.get("recruiting_for", "")
        if industries:
            parts.append(f"- Target industries: {', '.join(industries[:5])}")
        if roles:
            parts.append(f"- Target roles: {', '.join(roles[:5])}")
        if dream:
            parts.append(f"- Dream companies: {', '.join(dream[:8])}")
        if recruiting:
            parts.append(f"- Recruiting for: {recruiting}")

    location = user_context.get("location")
    if location:
        pref = location.get("preferred", "")
        curr = location.get("current", "")
        if pref:
            parts.append(f"- Preferred location: {pref}")
        elif curr:
            parts.append(f"- Current location: {curr}")

    prof = user_context.get("professional_info")
    if prof:
        role = prof.get("current_role", "")
        level = prof.get("experience_level", "")
        if role:
            parts.append(f"- Current role: {role}")
        if level:
            parts.append(f"- Experience level: {level}")

    resume = user_context.get("resume_summary")
    if resume:
        parts.append(f"- Resume: {resume[:300]}")

    personal = user_context.get("personal_note")
    if personal:
        parts.append(f"- Personal note: {personal[:200]}")

    email_tmpl = user_context.get("email_template")
    if email_tmpl:
        style = email_tmpl.get("style_preset") or "default"
        purpose = email_tmpl.get("purpose") or "networking"
        parts.append(f"- Email style: {purpose}, {style}")

    contacts = user_context.get("contacts_summary")
    if contacts:
        total = contacts.get("total", 0)
        top = contacts.get("top_companies", [])
        top_str = ", ".join([f"{c['name']} ({c['count']})" for c in top[:5]])
        parts.append(f"- Saved contacts: {total} total. Top companies: {top_str}")
        recent = contacts.get("recent") or []
        if recent:
            recent_lines = []
            for r in recent[:5]:
                bits = [r.get("name") or ""]
                role_co = " ".join(filter(None, [r.get("title"), "at" if r.get("company") else "", r.get("company")]))
                if role_co:
                    bits.append(f"({role_co.strip()})")
                if r.get("stage"):
                    bits.append(f"[{r['stage']}]")
                recent_lines.append("  • " + " ".join(b for b in bits if b))
            parts.append("- Recently saved contacts:\n" + "\n".join(recent_lines))

    rs = user_context.get("recent_searches")
    if rs:
        rs_lines = []
        for s in rs[:5]:
            p = s.get("prompt", "")
            r = s.get("results")
            count_str = f" → {r} results" if isinstance(r, int) else ""
            if p:
                rs_lines.append(f'  • "{p}"{count_str}')
        if rs_lines:
            parts.append("- Recent searches (Firestore-backed):\n" + "\n".join(rs_lines))

    ccp = user_context.get("recent_coffee_chat_preps")
    if ccp:
        ccp_lines = []
        for c in ccp[:5]:
            target = " ".join(filter(None, [c.get("name"), "at" if c.get("company") else "", c.get("company")]))
            if target.strip():
                ccp_lines.append(f"  • {target.strip()}")
        if ccp_lines:
            parts.append("- Meeting preps generated:\n" + "\n".join(ccp_lines))

    age = user_context.get("account_age_days")
    if isinstance(age, (int, float)):
        if age < 1:
            tenure = "new today"
        elif age < 7:
            tenure = f"{int(age)} days into using the platform"
        elif age < 30:
            tenure = f"{int(age // 7)} weeks into using the platform"
        else:
            tenure = f"{int(age // 30)} months into using the platform"
        parts.append(f"- Tenure: {tenure}")

    if len(parts) <= 1:
        return ""

    parts.append("")
    parts.append("BEHAVIORAL RULE - USE THIS CONTEXT:")
    parts.append("When the user asks you to do something and doesn't specify details available in their profile, "
                 "USE THE PROFILE DATA. For example:")
    parts.append('- "Find me contacts at Rivian" → Use their preferred location and target role from goals')
    parts.append('- "Write an email for a data engineer" → Use their email template style and resume context')
    parts.append('- "What companies should I target?" → Reference their dream companies and target industries')
    parts.append('- "Look at my profile" → Read the data above and respond - do NOT ask them to share what\'s there')
    parts.append("Only ask follow-up questions when the profile genuinely doesn't have the needed information.")
    parts.append("If the user references a person they're prepping for or just saved, reference them by name from the lists above.")

    return "\n".join(parts)


# ============================================================================
# TOOL DEFINITIONS (OpenAI function calling)
# ============================================================================

SCOUT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_saved_contacts",
            "description": "Search the user's saved contacts by company, job title, name, or status. Use when the user asks about their contacts, wants to see who they've saved, or asks about contacts at a specific company.",
            "parameters": {
                "type": "object",
                "properties": {
                    "company": {
                        "type": "string",
                        "description": "Filter by company name (partial match)",
                    },
                    "job_title": {
                        "type": "string",
                        "description": "Filter by job title (partial match)",
                    },
                    "name": {
                        "type": "string",
                        "description": "Filter by contact name (partial match)",
                    },
                    "status": {
                        "type": "string",
                        "description": "Filter by pipeline status",
                        "enum": ["needs_attention", "active", "done"],
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_email_preview",
            "description": "Generate a draft email preview for outreach to a professional. Use when the user asks to write, draft, or compose an email for a specific person or role.",
            "parameters": {
                "type": "object",
                "properties": {
                    "recipient_name": {
                        "type": "string",
                        "description": "Name of the recipient",
                    },
                    "recipient_company": {
                        "type": "string",
                        "description": "Company the recipient works at",
                    },
                    "recipient_title": {
                        "type": "string",
                        "description": "Job title of the recipient",
                    },
                    "purpose": {
                        "type": "string",
                        "description": "Purpose of the email",
                        "enum": ["networking", "referral", "meeting", "follow_up", "thank_you"],
                    },
                },
                "required": ["recipient_company"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "suggest_networking_strategy",
            "description": "Suggest a personalized networking strategy based on the user's goals, dream companies, and resume. Use when the user asks for advice on who to reach out to, how to network, or what their next steps should be.",
            "parameters": {
                "type": "object",
                "properties": {
                    "focus_area": {
                        "type": "string",
                        "description": "Optional focus area for strategy",
                        "enum": ["getting_started", "expanding_network", "specific_company", "industry_switch", "interview_prep"],
                    },
                    "target_company": {
                        "type": "string",
                        "description": "Optional specific company to focus strategy on",
                    },
                },
                "required": [],
            },
        },
    },
]


def _detect_route_from_query(query: str) -> Optional[str]:
    """Detect if the query mentions a specific route/page."""
    query_lower = query.lower()

    for route, keywords in ROUTE_KEYWORDS.items():
        for keyword in keywords:
            if keyword in query_lower:
                return route

    return None


# Intent patterns for smart tool routing
_INTENT_PATTERNS = {
    "contacts": re.compile(
        r"(?:my contacts|saved contacts|contacts at|who (?:do i|have i)|show me .* contacts|"
        r"contacts (?:at|from|in)|how many contacts|list .*contacts)",
        re.IGNORECASE,
    ),
    "email": re.compile(
        r"(?:write (?:an? )?email|draft (?:an? )?email|compose|reach out to|"
        r"email (?:to|for|preview)|send (?:an? )?email|outreach email)",
        re.IGNORECASE,
    ),
    "strategy": re.compile(
        r"(?:networking strategy|who should i|advice|what should i do|"
        r"how (?:should|do) i (?:network|start|approach)|next steps|strategy for)",
        re.IGNORECASE,
    ),
    "research": re.compile(
        r"(?:tell me about|what is|what are|describe|explain|info(?:rmation)? (?:on|about)|"
        r"research|how does .+ (?:work|hire|recruit)|"
        r"(?:interview|hiring|recruiting) (?:process|culture|timeline) (?:at|for)|"
        r"what.+(?:like|about).+(?:work|working).+at|"
        r"(?:culture|salary|compensation|benefits|interview) at)",
        re.IGNORECASE,
    ),
}


def _detect_intent(message: str) -> str:
    """Fast keyword/regex check to determine intent and select appropriate tools.

    Returns one of: "contacts", "email", "strategy", "general"
    """
    for intent, pattern in _INTENT_PATTERNS.items():
        if pattern.search(message):
            return intent
    return "general"


# ============================================================================
# DATA CLASSES
# ============================================================================

@dataclass
class ScoutAssistantResponse:
    """Response from Scout assistant."""
    message: str
    navigate_to: Optional[str] = None
    action_buttons: List[Dict[str, str]] = field(default_factory=list)
    auto_populate: Optional[Dict[str, Any]] = None
    contacts_results: Optional[List[Dict[str, Any]]] = None
    email_preview: Optional[Dict[str, str]] = None
    tool_used: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        result = {
            "message": self.message,
            "navigate_to": self.navigate_to,
            "action_buttons": self.action_buttons,
            "auto_populate": self.auto_populate,
        }
        if self.contacts_results is not None:
            result["contacts_results"] = self.contacts_results
        if self.email_preview is not None:
            result["email_preview"] = self.email_preview
        if self.tool_used is not None:
            result["tool_used"] = self.tool_used
        return result


# ============================================================================
# SCOUT ASSISTANT SERVICE
# ============================================================================

class ScoutAssistantService:
    """Service for Scout product assistant functionality."""

    DEFAULT_MODEL = "gpt-4o-mini"
    CLAUDE_MODEL = "claude-haiku-4-5-20251001"

    def __init__(self):
        self._openai = get_async_openai_client()

    def _get_openai(self):
        """Get the appropriate async OpenAI client.
        Returns _stream_openai if set (streaming context with fresh event loop),
        otherwise falls back to self._openai (main event loop)."""
        return getattr(self, "_stream_openai", None) or self._openai

    async def handle_chat(
        self,
        *,
        message: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        current_page: str = "/home",
        user_name: str = "there",
        tier: str = "free",
        credits: int = 0,
        max_credits: int = 300,
        user_context: Optional[Dict[str, Any]] = None,
        user_memory: Optional[Dict[str, Any]] = None,
        uid: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Handle a chat message from the user."""
        message = (message or "").strip()
        conversation_history = conversation_history or []

        # Handle empty message
        if not message:
            return ScoutAssistantResponse(
                message=f"Hey{', ' + user_name if user_name != 'there' else ''}! I'm Scout - I know the platform inside and out. What are you trying to do right now?",
                navigate_to=None,
                action_buttons=[],
            ).to_dict()

        # Detect intent for smart tool routing
        intent = _detect_intent(message)

        # Build system prompt with user context + memory
        system_prompt = _build_system_prompt(
            user_name=user_name,
            tier=tier,
            credits=credits,
            max_credits=max_credits,
            current_page=current_page,
            user_context=user_context,
            user_memory=user_memory,
        )

        # Build messages list
        messages = [{"role": "system", "content": system_prompt}]

        # Add conversation history (last 6 messages)
        for msg in conversation_history[-6:]:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ["user", "assistant"] and content:
                messages.append({"role": role, "content": content})

        # For contacts intent: pre-load contacts into prompt to avoid tool call
        contacts_results = None
        tool_used = None
        email_preview = None

        if intent == "contacts" and uid:
            # Extract filter from message and pre-load contacts
            pre_loaded = await self._preload_contacts(uid, message)
            if pre_loaded:
                contacts_results = pre_loaded.get("contacts", [])
                tool_used = "search_saved_contacts"
                # Add contacts data to the user message so model can reference them
                contacts_info = json.dumps(pre_loaded, indent=None)
                messages.append({
                    "role": "user",
                    "content": f"{message}\n\n[SAVED OFFERLOOP CONTACTS - these are the user's saved networking contacts. Summarize them in your response. Do NOT confuse with Google/Gmail contacts.]\n{contacts_info}",
                })
            else:
                messages.append({"role": "user", "content": message})
        elif intent == "research":
            research_context = await self._fetch_research_context(message)
            if research_context:
                messages.append({
                    "role": "user",
                    "content": f"{message}\n\n[REAL-TIME RESEARCH DATA - use this to give a detailed, specific answer. Cite sources when relevant.]\n{research_context}",
                })
            else:
                messages.append({"role": "user", "content": message})
        else:
            messages.append({"role": "user", "content": message})

        # Select tools based on intent
        tools_for_intent = self._get_tools_for_intent(intent, uid)

        try:
            # For "general" intent (no tools) or pre-loaded contacts: try Claude first, single LLM call
            if not tools_for_intent:
                content = await self._call_llm_json(messages, system_prompt)
            else:
                # Tool-based flow (email, strategy): use OpenAI with function calling
                content, tool_used_from_call, contacts_from_call, email_from_call = (
                    await self._call_with_tools(messages, system_prompt, conversation_history, message, tools_for_intent, uid, user_context)
                )
                tool_used = tool_used or tool_used_from_call
                contacts_results = contacts_results or contacts_from_call
                email_preview = email_preview or email_from_call

            # Parse the final JSON response
            parsed = self._parse_json_response(content)

            response_message = parsed.get("message", "I'm not sure how to help with that. Could you rephrase?")
            navigate_to = self._validate_route(parsed.get("navigate_to"))
            action_buttons = self._validate_buttons(parsed.get("action_buttons", []))
            auto_populate = self._validate_auto_populate(parsed.get("auto_populate"))

            return ScoutAssistantResponse(
                message=response_message,
                navigate_to=navigate_to,
                action_buttons=action_buttons,
                auto_populate=auto_populate,
                contacts_results=contacts_results,
                email_preview=email_preview,
                tool_used=tool_used,
            ).to_dict()

        except Exception as e:
            print(f"[ScoutAssistant] Error: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()

            return ScoutAssistantResponse(
                message=f"I'm having a moment! {random.choice(_ERROR_RECOVERY_LINES)}",
                navigate_to=None,
                action_buttons=[],
                auto_populate=None,
            ).to_dict()

    def _get_tools_for_intent(self, intent: str, uid: Optional[str]) -> Optional[List[Dict]]:
        """Return the subset of tools appropriate for the detected intent."""
        if not uid:
            return None
        if intent == "contacts":
            # Contacts are pre-loaded into prompt; no tool needed
            return None
        if intent == "email":
            return [t for t in SCOUT_TOOLS if t["function"]["name"] == "generate_email_preview"]
        if intent == "strategy":
            return [t for t in SCOUT_TOOLS if t["function"]["name"] == "suggest_networking_strategy"]
        # "general" - no tools, fastest path
        return None

    async def _preload_contacts(self, uid: str, message: str) -> Optional[Dict[str, Any]]:
        """Pre-load contacts matching the user's query to avoid a tool call."""
        # Extract a rough filter from the message
        args: Dict[str, Any] = {}
        # Try to extract company name - look for "at <company>"
        at_match = re.search(r'\bat\s+(\w[\w&.\' -]+)', message, re.IGNORECASE)
        if at_match:
            args["company"] = at_match.group(1).strip()
        # Try "from <company>"
        elif (from_match := re.search(r'\bfrom\s+(\w[\w&.\' -]+)', message, re.IGNORECASE)):
            args["company"] = from_match.group(1).strip()
        try:
            result_str = await self._tool_search_contacts(uid, args)
            result = json.loads(result_str) if isinstance(result_str, str) else result_str
            contacts = result.get("contacts", [])
            if isinstance(contacts, list):
                return result
        except Exception as e:
            print(f"[ScoutAssistant] Pre-load contacts failed: {e}")
        return None

    async def _fetch_research_context(self, message: str) -> Optional[str]:
        """Fetch real-time research data via Perplexity for research-intent queries."""
        try:
            from app.services.perplexity_client import quick_search
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, lambda: quick_search(message))
            if result and result.get("content"):
                citations = result.get("citations", [])
                context = result["content"]
                if citations:
                    context += "\n\nSources:\n" + "\n".join(f"- {c}" for c in citations[:5])
                return context
        except Exception as e:
            print(f"[ScoutAssistant] Perplexity research failed: {e}")
        return None

    async def _call_llm_json(self, messages: List[Dict], system_prompt: str) -> str:
        """Single LLM call for JSON response. Tries Claude first, falls back to GPT-4o-mini."""
        anthropic_client = get_async_anthropic_client()

        # Try Claude first for non-tool queries (faster for text generation)
        if anthropic_client:
            try:
                # Convert messages to Anthropic format: extract system, keep user/assistant
                anthropic_messages = [m for m in messages if m["role"] in ("user", "assistant")]
                claude_system = system_prompt + "\n\nRespond with valid JSON only."

                response = await asyncio.wait_for(
                    anthropic_client.messages.create(
                        model=self.CLAUDE_MODEL,
                        max_tokens=500,
                        temperature=0.5,
                        system=claude_system,
                        messages=anthropic_messages,
                    ),
                    timeout=10.0,
                )
                content = response.content[0].text
                # Validate it's parseable JSON
                json.loads(content)
                return content
            except Exception as e:
                print(f"[ScoutAssistant] Claude failed, falling back to GPT: {type(e).__name__}: {e}")

        # Fallback to GPT-4o-mini
        try:
            response = await asyncio.wait_for(
                self._get_openai().chat.completions.create(
                    model=self.DEFAULT_MODEL,
                    messages=messages,
                    temperature=0.5,
                    max_tokens=500,
                    response_format={"type": "json_object"},
                ),
                timeout=15.0,
            )
            return response.choices[0].message.content
        except asyncio.TimeoutError:
            return json.dumps({
                "message": f"I'm taking too long to think! {random.choice(_ERROR_RECOVERY_LINES)}",
                "navigate_to": None,
                "action_buttons": [],
                "auto_populate": None,
            })

    async def _call_with_tools(
        self,
        messages: List[Dict],
        system_prompt: str,
        conversation_history: List[Dict[str, str]],
        user_message: str,
        tools: List[Dict],
        uid: Optional[str],
        user_context: Optional[Dict[str, Any]],
    ) -> tuple:
        """Two-pass LLM flow with tool calling. Returns (content, tool_used, contacts, email_preview).
        Uses self._get_openai() which picks the right client for the event loop."""
        tool_used = None
        contacts_results = None
        email_preview = None

        try:
            response = await asyncio.wait_for(
                self._get_openai().chat.completions.create(
                    model=self.DEFAULT_MODEL,
                    messages=messages,
                    temperature=0.5,
                    max_tokens=500,
                    tools=tools,
                    tool_choice="auto",
                ),
                timeout=15.0,
            )
        except asyncio.TimeoutError:
            return (
                json.dumps({
                    "message": f"I'm taking too long to think! {random.choice(_ERROR_RECOVERY_LINES)}",
                    "navigate_to": None, "action_buttons": [], "auto_populate": None,
                }),
                None, None, None,
            )

        choice = response.choices[0]
        tool_calls = choice.message.tool_calls

        if not tool_calls or not uid:
            return (choice.message.content, None, None, None)

        # Execute tool calls
        tool_messages = [choice.message]
        for tc in tool_calls:
            fn_name = tc.function.name
            try:
                fn_args = json.loads(tc.function.arguments)
            except json.JSONDecodeError:
                fn_args = {}

            tool_result = await self._execute_tool(fn_name, fn_args, uid, user_context or {})
            tool_used = fn_name

            if fn_name == "search_saved_contacts":
                try:
                    parsed_contacts = json.loads(tool_result) if isinstance(tool_result, str) else tool_result
                    if isinstance(parsed_contacts, list):
                        contacts_results = parsed_contacts
                except (json.JSONDecodeError, TypeError):
                    pass
            elif fn_name == "generate_email_preview":
                try:
                    parsed_email = json.loads(tool_result) if isinstance(tool_result, str) else tool_result
                    if isinstance(parsed_email, dict) and "body" in parsed_email:
                        email_preview = parsed_email
                except (json.JSONDecodeError, TypeError):
                    pass

            tool_messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": tool_result if isinstance(tool_result, str) else json.dumps(tool_result),
            })

        # Second LLM call with tool results
        second_system = system_prompt + "\n\nIMPORTANT: You just called a tool and got results. Include those results naturally in your response. Respond with valid JSON in the standard format."
        second_messages = [{"role": "system", "content": second_system}]
        for msg in conversation_history[-6:]:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ["user", "assistant"] and content:
                second_messages.append({"role": role, "content": content})
        second_messages.append({"role": "user", "content": user_message})
        second_messages.extend(tool_messages)

        try:
            second_response = await asyncio.wait_for(
                self._get_openai().chat.completions.create(
                    model=self.DEFAULT_MODEL,
                    messages=second_messages,
                    temperature=0.5,
                    max_tokens=500,
                    response_format={"type": "json_object"},
                ),
                timeout=15.0,
            )
            content = second_response.choices[0].message.content
        except (asyncio.TimeoutError, Exception) as e:
            print(f"[ScoutAssistant] Second pass failed: {e}")
            content = json.dumps({
                "message": "I found some results but had trouble formatting them. Check the data below!",
                "navigate_to": None, "action_buttons": [], "auto_populate": None,
            })

        return (content, tool_used, contacts_results, email_preview)

    # ========================================================================
    # STREAMING
    # ========================================================================

    async def handle_chat_stream(
        self,
        *,
        message: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        current_page: str = "/home",
        user_name: str = "there",
        tier: str = "free",
        credits: int = 0,
        max_credits: int = 300,
        user_context: Optional[Dict[str, Any]] = None,
        user_memory: Optional[Dict[str, Any]] = None,
        uid: Optional[str] = None,
        queue: "asyncio.Queue[Optional[Dict[str, Any]]]" = None,
    ) -> None:
        """Stream a chat response, pushing SSE events to the provided queue.

        IMPORTANT: This runs in a NEW event loop (background thread). We must
        create fresh async HTTP clients here - the ones from __init__ are bound
        to the main event loop and will hang/fail in this context.

        Events pushed:
          {"event": "intent", "data": {"intent": "..."}}
          {"event": "token", "data": {"text": "..."}}
          {"event": "done", "data": {full response dict}}
          {"event": "error", "data": {"message": "..."}}
        """
        # Create fresh async clients for this event loop
        self._stream_openai = create_async_openai_client()
        try:
            import anthropic as _anthropic
            from app.config import CLAUDE_API_KEY
            self._stream_anthropic = _anthropic.AsyncAnthropic(api_key=CLAUDE_API_KEY) if CLAUDE_API_KEY else None
        except (ImportError, Exception):
            self._stream_anthropic = None

        message = (message or "").strip()
        conversation_history = conversation_history or []

        if not message:
            greeting = f"Hey{', ' + user_name if user_name != 'there' else ''}! I'm Scout - I know the platform inside and out. What are you trying to do right now?"
            await queue.put({"event": "done", "data": {
                "message": greeting, "navigate_to": None, "action_buttons": [], "auto_populate": None,
            }})
            await queue.put(None)  # Signal end
            return

        intent = _detect_intent(message)
        await queue.put({"event": "intent", "data": {"intent": intent}})

        system_prompt = _build_system_prompt(
            user_name=user_name, tier=tier, credits=credits,
            max_credits=max_credits, current_page=current_page, user_context=user_context,
            user_memory=user_memory,
        )

        messages = [{"role": "system", "content": system_prompt}]
        for msg in conversation_history[-6:]:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ["user", "assistant"] and content:
                messages.append({"role": role, "content": content})

        contacts_results = None
        email_preview = None
        tool_used = None

        # Pre-load contacts for contacts intent
        if intent == "contacts" and uid:
            pre_loaded = await self._preload_contacts(uid, message)
            if pre_loaded:
                contacts_results = pre_loaded.get("contacts", [])
                tool_used = "search_saved_contacts"
                contacts_info = json.dumps(pre_loaded, indent=None)
                messages.append({
                    "role": "user",
                    "content": f"{message}\n\n[SAVED OFFERLOOP CONTACTS - these are the user's saved networking contacts. Summarize them in your response. Do NOT confuse with Google/Gmail contacts.]\n{contacts_info}",
                })
            else:
                messages.append({"role": "user", "content": message})
        elif intent == "research":
            # Fetch real-time data via Perplexity for research queries
            research_context = await self._fetch_research_context(message)
            if research_context:
                messages.append({
                    "role": "user",
                    "content": f"{message}\n\n[REAL-TIME RESEARCH DATA - use this to give a detailed, specific answer. Cite sources when relevant.]\n{research_context}",
                })
            else:
                messages.append({"role": "user", "content": message})
        else:
            messages.append({"role": "user", "content": message})

        tools_for_intent = self._get_tools_for_intent(intent, uid)

        try:
            if tools_for_intent:
                # Tool flow: execute tools first, then stream synthesis
                content, tool_used_fc, contacts_fc, email_fc = await self._call_with_tools(
                    messages, system_prompt, conversation_history, message,
                    tools_for_intent, uid, user_context,
                )
                tool_used = tool_used or tool_used_fc
                contacts_results = contacts_results or contacts_fc
                email_preview = email_preview or email_fc

                # Stream the already-generated content token by token (simulate streaming for tool results)
                parsed = self._parse_json_response(content)
                text = parsed.get("message", "")
                # Send text in chunks for a streaming feel
                chunk_size = 8
                words = text.split(" ")
                for i in range(0, len(words), chunk_size):
                    chunk = " ".join(words[i:i + chunk_size])
                    if i > 0:
                        chunk = " " + chunk
                    await queue.put({"event": "token", "data": {"text": chunk}})

                await queue.put({"event": "done", "data": {
                    "message": text,
                    "navigate_to": self._validate_route(parsed.get("navigate_to")),
                    "action_buttons": self._validate_buttons(parsed.get("action_buttons", [])),
                    "auto_populate": self._validate_auto_populate(parsed.get("auto_populate")),
                    "contacts_results": contacts_results,
                    "email_preview": email_preview,
                    "tool_used": tool_used,
                }})
            else:
                # No tools - stream directly
                full_text = await self._stream_llm(messages, system_prompt, queue)

                # Check if the model accidentally returned JSON instead of plain text
                clean_text = full_text.strip()
                if clean_text.startswith("{") and clean_text.endswith("}"):
                    try:
                        parsed_json = json.loads(clean_text)
                        if "message" in parsed_json:
                            # Model returned JSON - extract the message and metadata directly
                            msg_text = parsed_json["message"]
                            metadata = {
                                "message": msg_text,
                                "navigate_to": self._validate_route(parsed_json.get("navigate_to")),
                                "action_buttons": self._validate_buttons(parsed_json.get("action_buttons", [])),
                                "auto_populate": self._validate_auto_populate(parsed_json.get("auto_populate")),
                                "contacts_results": contacts_results,
                                "email_preview": email_preview,
                                "tool_used": tool_used,
                            }
                            await queue.put({"event": "done", "data": metadata})
                            return  # _stream_llm already pushed None-triggering return
                    except (json.JSONDecodeError, KeyError):
                        pass  # Not valid JSON, continue with normal flow

                # Phase 2: classify metadata from the full text
                metadata = await self._classify_metadata(full_text, system_prompt)
                metadata["message"] = full_text
                metadata["contacts_results"] = contacts_results
                metadata["email_preview"] = email_preview
                metadata["tool_used"] = tool_used
                await queue.put({"event": "done", "data": metadata})

        except Exception as e:
            print(f"[ScoutAssistant] Stream error: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            await queue.put({"event": "error", "data": {"message": "Something went wrong. Try again!"}})

        await queue.put(None)  # Signal end

    async def _stream_llm(self, messages: List[Dict], system_prompt: str, queue) -> str:
        """Stream text tokens from LLM. Tries Claude first, falls back to GPT-4o-mini.
        Returns the full accumulated text.
        Uses fresh clients via self._get_openai() and self._stream_anthropic."""
        anthropic_client = getattr(self, "_stream_anthropic", None)
        full_text = ""

        if anthropic_client:
            try:
                anthropic_messages = [m for m in messages if m["role"] in ("user", "assistant")]
                claude_system = system_prompt + "\n\nRespond with ONLY your message text (no JSON). Be direct and helpful."

                async with anthropic_client.messages.stream(
                    model=self.CLAUDE_MODEL,
                    max_tokens=500,
                    temperature=0.5,
                    system=claude_system,
                    messages=anthropic_messages,
                ) as stream:
                    async for event in stream:
                        # Handle ContentBlockDeltaEvent with TextDelta
                        if hasattr(event, "type") and event.type == "content_block_delta":
                            delta = getattr(event, "delta", None)
                            if delta and hasattr(delta, "text"):
                                full_text += delta.text
                                await queue.put({"event": "token", "data": {"text": delta.text}})
                return full_text
            except Exception as e:
                print(f"[ScoutAssistant] Claude streaming failed, falling back to GPT: {type(e).__name__}: {e}")
                full_text = ""

        # Fallback: GPT-4o-mini streaming
        try:
            stream = await asyncio.wait_for(
                self._get_openai().chat.completions.create(
                    model=self.DEFAULT_MODEL,
                    messages=messages,
                    temperature=0.5,
                    max_tokens=500,
                    stream=True,
                ),
                timeout=15.0,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    full_text += delta.content
                    await queue.put({"event": "token", "data": {"text": delta.content}})
        except asyncio.TimeoutError:
            if not full_text:
                full_text = f"I'm taking too long to think! {random.choice(_ERROR_RECOVERY_LINES)}"
                await queue.put({"event": "token", "data": {"text": full_text}})

        return full_text

    async def _classify_metadata(self, text: str, system_prompt: str) -> Dict[str, Any]:
        """Fast classification call to extract navigate_to, action_buttons, auto_populate from text.
        Uses the fresh streaming client if available."""

        classify_prompt = f"""Based on this Scout assistant response, extract structured metadata.

RESPONSE TEXT:
{text}

Return JSON:
{{"navigate_to": "/route" or null, "action_buttons": [{{"label": "...", "route": "/..."}}] or [], "auto_populate": {{"search_type": "contact" or "firm", ...}} or null}}

Only set navigate_to if the response suggests navigation. Only set auto_populate if the response contains search criteria for contact-search or firm-search."""

        try:
            response = await asyncio.wait_for(
                self._get_openai().chat.completions.create(
                    model=self.DEFAULT_MODEL,
                    messages=[
                        {"role": "system", "content": "Extract structured metadata from the text. Return valid JSON only."},
                        {"role": "user", "content": classify_prompt},
                    ],
                    temperature=0.0,
                    max_tokens=200,
                    response_format={"type": "json_object"},
                ),
                timeout=5.0,
            )
            parsed = json.loads(response.choices[0].message.content)
            return {
                "navigate_to": self._validate_route(parsed.get("navigate_to")),
                "action_buttons": self._validate_buttons(parsed.get("action_buttons", [])),
                "auto_populate": self._validate_auto_populate(parsed.get("auto_populate")),
            }
        except Exception as e:
            print(f"[ScoutAssistant] Metadata classification failed: {e}")
            # Fall back to simple route detection
            route = _detect_route_from_query(text)
            return {
                "navigate_to": route,
                "action_buttons": [],
                "auto_populate": None,
            }

    def _parse_json_response(self, content: Optional[str]) -> Dict[str, Any]:
        """Parse LLM response as JSON with fallbacks."""
        if not content or not content.strip():
            return {
                "message": "I had trouble formatting my response. Could you try again?",
                "navigate_to": None,
                "action_buttons": [],
                "auto_populate": None,
            }
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            return {"message": content, "navigate_to": None, "action_buttons": [], "auto_populate": None}

    def _validate_route(self, navigate_to: Optional[str]) -> Optional[str]:
        """Validate navigate_to is a known route."""
        if not navigate_to:
            return None
        if any(navigate_to.startswith(route.split("?")[0]) for route in ROUTE_KEYWORDS.keys()):
            return navigate_to
        valid_routes = [
            "/dashboard", "/contact-search", "/firm-search", "/recruiter-spreadsheet",
            "/job-board", "/meeting-prep", "/interview-prep", "/application-lab",
            "/write/resume", "/write/cover-letter", "/outbox", "/calendar",
            "/contact-directory", "/hiring-manager-tracker", "/company-tracker",
            "/pricing", "/account-settings",
        ]
        return navigate_to if navigate_to in valid_routes else None

    def _validate_buttons(self, action_buttons: Any) -> List[Dict[str, str]]:
        """Validate and sanitize action buttons."""
        validated = []
        if not isinstance(action_buttons, list):
            return []
        for btn in action_buttons[:3]:
            if isinstance(btn, dict) and "label" in btn and "route" in btn:
                validated.append({
                    "label": str(btn["label"])[:50],
                    "route": str(btn["route"]),
                })
        return validated

    def _validate_auto_populate(self, auto_populate: Any) -> Optional[Dict[str, Any]]:
        """Validate auto_populate data."""
        if not auto_populate or not isinstance(auto_populate, dict):
            return None
        search_type = auto_populate.get("search_type")
        if search_type == "contact":
            return {
                "search_type": "contact",
                "job_title": str(auto_populate.get("job_title", ""))[:100],
                "company": str(auto_populate.get("company", ""))[:100],
                "location": str(auto_populate.get("location", ""))[:100],
            }
        elif search_type == "firm":
            return {
                "search_type": "firm",
                "industry": str(auto_populate.get("industry", ""))[:100],
                "location": str(auto_populate.get("location", ""))[:100],
                "size": str(auto_populate.get("size", ""))[:50] if auto_populate.get("size") else "",
            }
        return None

    # ========================================================================
    # TOOL EXECUTION
    # ========================================================================

    async def _execute_tool(
        self, tool_name: str, args: Dict[str, Any], uid: str, user_context: Dict[str, Any]
    ) -> str:
        """Execute a Scout tool and return the result as a string."""
        try:
            if tool_name == "search_saved_contacts":
                return await self._tool_search_contacts(uid, args)
            elif tool_name == "generate_email_preview":
                return await self._tool_email_preview(uid, user_context, args)
            elif tool_name == "suggest_networking_strategy":
                return await self._tool_networking_strategy(user_context, args)
            else:
                return json.dumps({"error": f"Unknown tool: {tool_name}"})
        except Exception as e:
            print(f"[ScoutAssistant] Tool {tool_name} failed: {e}")
            return json.dumps({"error": f"Tool failed: {str(e)}"})

    async def _tool_search_contacts(self, uid: str, args: Dict[str, Any]) -> str:
        """Search the user's saved contacts in Firestore."""
        db = get_db()
        contacts_ref = db.collection("users").document(uid).collection("contacts")

        # Firestore doesn't support partial text search well, so fetch and filter in Python
        docs = contacts_ref.limit(50).get()
        contacts = []
        for doc in docs:
            if not doc.exists:
                continue
            c = doc.to_dict()
            c["id"] = doc.id
            contacts.append(c)

        # Apply filters
        company_filter = (args.get("company") or "").lower()
        title_filter = (args.get("job_title") or "").lower()
        name_filter = (args.get("name") or "").lower()
        status_filter = (args.get("status") or "").lower()

        filtered = []
        for c in contacts:
            company = (c.get("company") or c.get("job_company_name") or "").lower()
            title = (c.get("job_title") or c.get("title") or "").lower()
            name = (c.get("full_name") or c.get("name") or "").lower()
            status = (c.get("status") or c.get("pipelineStatus") or "").lower()

            if company_filter and company_filter not in company:
                continue
            if title_filter and title_filter not in title:
                continue
            if name_filter and name_filter not in name:
                continue
            if status_filter and status_filter not in status:
                continue
            filtered.append(c)

        # Return up to 5 results (10 for pre-loading), compact format
        results = []
        for c in filtered[:5]:
            results.append({
                "name": c.get("full_name") or c.get("name") or "Unknown",
                "job_title": c.get("job_title") or c.get("title") or "",
                "company": c.get("company") or c.get("job_company_name") or "",
                "email": c.get("work_email") or c.get("email") or "",
                "linkedin_url": c.get("linkedin_url") or "",
                "status": c.get("status") or c.get("pipelineStatus") or "",
            })

        if not results:
            return json.dumps({"contacts": [], "message": f"No saved contacts found matching your criteria. You have {len(contacts)} total saved contacts."})

        return json.dumps({"contacts": results, "total_matches": len(filtered), "total_saved": len(contacts)})

    async def _tool_email_preview(self, uid: str, user_context: Dict[str, Any], args: Dict[str, Any]) -> str:
        """Generate a draft email preview using the user's template settings."""
        recipient_name = args.get("recipient_name", "the recipient")
        recipient_company = args.get("recipient_company", "")
        recipient_title = args.get("recipient_title", "")
        purpose = args.get("purpose", "networking")

        # Build context from user profile
        user_name = ""
        university = ""
        resume_summary = ""

        academics = user_context.get("academics", {})
        if academics:
            university = academics.get("university", "")
            user_name = user_context.get("resume_summary", "").split("|")[0].replace("Name:", "").strip() if user_context.get("resume_summary") else ""

        resume_summary = user_context.get("resume_summary", "")
        personal_note = user_context.get("personal_note", "")

        # Get template style from user preferences
        email_tmpl = user_context.get("email_template", {})
        style = email_tmpl.get("style_preset") or "professional"
        custom_instr = email_tmpl.get("custom_instructions", "")

        email_prompt = f"""Generate a short, personalized networking email.

SENDER CONTEXT:
- University: {university or 'Not specified'}
- Resume summary: {resume_summary or 'Not available'}
- Personal note: {personal_note or 'None'}
- Preferred style: {style}
{f'- Custom instructions: {custom_instr}' if custom_instr else ''}

RECIPIENT:
- Name: {recipient_name}
- Company: {recipient_company}
- Title: {recipient_title or 'Not specified'}
- Purpose: {purpose}

Write a concise email (3-5 sentences for the body). Include a subject line.
Return JSON: {{"subject": "...", "body": "...", "recipient_name": "{recipient_name}", "recipient_company": "{recipient_company}"}}"""

        try:
            import time as _time
            t0 = _time.monotonic()
            response = await asyncio.wait_for(
                self._get_openai().chat.completions.create(
                    model=self.DEFAULT_MODEL,
                    messages=[
                        {"role": "system", "content": "You are an expert networking email writer. Generate concise, warm, professional emails. Return valid JSON only."},
                        {"role": "user", "content": email_prompt},
                    ],
                    temperature=0.7,
                    max_tokens=400,
                    response_format={"type": "json_object"},
                ),
                timeout=10.0,
            )
            print(f"[ScoutAssistant] Email preview generated in {_time.monotonic() - t0:.2f}s")
            return response.choices[0].message.content
        except Exception as e:
            print(f"[ScoutAssistant] Email preview generation failed: {e}")
            return json.dumps({
                "subject": f"Reaching out - {purpose}",
                "body": f"Hi {recipient_name},\n\nI'm reaching out because I'm very interested in {recipient_company}. I'd love to learn more about your experience. Would you be open to a brief conversation?\n\nBest regards",
                "recipient_name": recipient_name,
                "recipient_company": recipient_company,
            })

    async def _tool_networking_strategy(self, user_context: Dict[str, Any], args: Dict[str, Any]) -> str:
        """Generate personalized networking strategy advice."""
        focus = args.get("focus_area", "getting_started")
        target_company = args.get("target_company", "")

        goals = user_context.get("goals", {})
        academics = user_context.get("academics", {})
        contacts_summary = user_context.get("contacts_summary", {})
        resume = user_context.get("resume_summary", "")

        strategy_prompt = f"""Give personalized networking strategy advice.

USER PROFILE:
- University: {academics.get('university', 'Unknown')}
- Major: {academics.get('major', 'Unknown')}
- Target industries: {', '.join(goals.get('target_industries', [])) or 'Not specified'}
- Target roles: {', '.join(goals.get('target_roles', [])) or 'Not specified'}
- Dream companies: {', '.join(goals.get('dream_companies', [])) or 'Not specified'}
- Recruiting for: {goals.get('recruiting_for', 'Not specified')}
- Resume: {resume[:200] or 'Not available'}
- Saved contacts: {contacts_summary.get('total', 0)} total
- Top companies contacted: {', '.join([c['name'] for c in contacts_summary.get('top_companies', [])]) or 'None yet'}

FOCUS: {focus}
{f'TARGET COMPANY: {target_company}' if target_company else ''}

Give 3-5 specific, actionable suggestions. Be concrete - mention specific companies, roles, or approaches based on their profile.
Return JSON: {{"strategy": "A brief strategy summary", "suggestions": ["suggestion 1", "suggestion 2", ...]}}"""

        try:
            response = await asyncio.wait_for(
                self._get_openai().chat.completions.create(
                    model=self.DEFAULT_MODEL,
                    messages=[
                        {"role": "system", "content": "You are an expert career networking strategist for college students. Be specific and actionable. Return valid JSON only."},
                        {"role": "user", "content": strategy_prompt},
                    ],
                    temperature=0.7,
                    max_tokens=500,
                    response_format={"type": "json_object"},
                ),
                timeout=10.0,
            )
            return response.choices[0].message.content
        except Exception as e:
            print(f"[ScoutAssistant] Networking strategy failed: {e}")
            return json.dumps({
                "strategy": "Focus on building connections at your dream companies through alumni outreach.",
                "suggestions": [
                    "Start with alumni from your university at target companies",
                    "Use meeting requests to learn about company culture",
                    "Follow up within 48 hours of every conversation",
                ],
            })


    async def handle_search_help(
        self,
        *,
        search_type: str,  # "contact" or "firm"
        failed_search_params: Dict[str, Any],
        error_type: str = "no_results",  # "no_results" or "error"
        user_name: str = "there",
    ) -> Dict[str, Any]:
        """
        Handle a failed search by generating helpful suggestions.
        
        Args:
            search_type: "contact" or "firm"
            failed_search_params: The original search parameters that failed
            error_type: Type of failure
            user_name: User's display name
        
        Returns:
            Dictionary with message, suggestions, and auto_populate data
        """
        if search_type == "contact":
            return await self._handle_contact_search_help(
                failed_search_params=failed_search_params,
                error_type=error_type,
                user_name=user_name,
            )
        elif search_type == "firm":
            return await self._handle_firm_search_help(
                failed_search_params=failed_search_params,
                error_type=error_type,
                user_name=user_name,
            )
        else:
            return {
                "message": "I'm not sure how to help with that search type.",
                "suggestions": [],
                "auto_populate": None,
                "search_type": search_type,
                "action": None,
            }
    
    async def _handle_prompt_refinement_help(
        self,
        *,
        prompt_text: str,
        parsed_query: Dict[str, Any],
        broadened_dimensions: List[str],
        retry_level_used: int,
        tried_prompts: Optional[List[str]] = None,
        user_name: str,
    ) -> Dict[str, Any]:
        """
        Generate refined natural-language prompts for a failed contact search.
        Inputs include what the backend already tried (broadened_dimensions,
        retry_level_used) so suggestions don't repeat ground we already covered.
        """
        # Pull richest signal we have so the LLM can reason about *why* the
        # original search came up thin.
        companies_meta = parsed_query.get("companies") or []
        company_names = [c.get("name") for c in companies_meta if isinstance(c, dict) and c.get("name")]
        schools = parsed_query.get("schools") or []
        locations = parsed_query.get("locations") or []
        title_variations = parsed_query.get("title_variations") or []
        industries = parsed_query.get("industries") or []

        already_tried_lines = []
        if broadened_dimensions:
            label_map = {"title": "broadened the role", "industry": "dropped the industry filter",
                         "location": "dropped the location filter", "company": "dropped the company filter"}
            tried = [label_map.get(d, d) for d in broadened_dimensions]
            already_tried_lines.append(f"Backend already {', then '.join(tried)} - still empty.")
        if retry_level_used >= 5:
            already_tried_lines.append("Even searching school-only returned no alumni in this role family.")

        context_block = []
        if company_names: context_block.append(f"Companies: {', '.join(company_names)}")
        if schools: context_block.append(f"Schools: {', '.join(schools)}")
        if locations: context_block.append(f"Locations: {', '.join(locations)}")
        if title_variations: context_block.append(f"Titles tried: {', '.join(title_variations[:6])}")
        if industries: context_block.append(f"Industries: {', '.join(industries)}")

        system_prompt = """You are Scout, helping a college student refine a natural-language people-search prompt that returned zero results from People Data Labs (PDL).

YOUR JOB
Generate exactly 3 alternative natural-language search prompts the student should try. Each prompt must be:
- Self-contained (works as a standalone PDL search)
- Specific enough to be routable (mentions a concrete company OR concrete role family)
- A meaningful CHANGE from the original - not just rewording
- Sorted from most-likely-to-succeed to least

PRINCIPLES (use these to pick alternatives)
1. PDL coverage gaps you should WORK AROUND:
   - International schools (Bocconi, HEC, INSEAD) × US-centric firms (Goldman, JPMorgan, MBB) often yield zero. Suggest the student try EU/regional firms with strong school pipelines (Mediobanca, Rothschild, Lazard for Bocconi; Kearney, Roland Berger, Oliver Wyman for European consulting).
   - Boutique/small firms have thin PDL coverage - pivot to bulge-bracket or top-tier alternates.
2. If a specific company was already tried and broadened past, REMOVE the company and search by school + role family ("Bocconi alumni in consulting").
3. If a specific location was tried and broadened past, REMOVE the location.
4. If only a school was specified, suggest school + role-family or school + concrete-firm pairings the school is known for.
5. Each suggestion needs a one-sentence rationale grounded in school/firm/region pipelines - not generic.

OUTPUT FORMAT (strict JSON)
{
  "message": "1-2 sentences acknowledging the miss and framing the suggestions in Scout's voice. Direct, warm, never apologetic.",
  "refined_prompts": [
    {"prompt": "<full natural-language search prompt>", "rationale": "<one specific sentence>"},
    {"prompt": "...", "rationale": "..."},
    {"prompt": "...", "rationale": "..."}
  ]
}

VOICE: direct, warm, no fluff. Don't say "I'm sorry" or "unfortunately." Lead with what to try.
"""

        user_message_parts = [f'Original prompt: "{prompt_text}"']
        if context_block:
            user_message_parts.append("Parsed signals:\n  " + "\n  ".join(context_block))
        if already_tried_lines:
            user_message_parts.append("What the backend already tried:\n  " + "\n  ".join(already_tried_lines))
        # Forbid resurrecting prompts the user has already run and seen fail in
        # this session. Without this, Scout cheerfully recommends the very
        # query the user just clicked through and bombed on.
        cleaned_tried: List[str] = []
        if tried_prompts:
            seen = set()
            for tp in tried_prompts:
                key = tp.strip().lower()
                if key and key != prompt_text.strip().lower() and key not in seen:
                    seen.add(key)
                    cleaned_tried.append(tp.strip())
            cleaned_tried = cleaned_tried[:30]
        if cleaned_tried:
            forbidden_block = "\n  ".join(f'- "{p}"' for p in cleaned_tried)
            user_message_parts.append(
                "DO NOT suggest any of these - the user already ran them in this session "
                "and they returned zero results:\n  " + forbidden_block
            )
        user_message_parts.append("Generate 3 refined prompts that are NOT in the forbidden list above.")
        user_message = "\n\n".join(user_message_parts)

        response = await asyncio.wait_for(
            self._get_openai().chat.completions.create(
                model=self.DEFAULT_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                temperature=0.6,
                max_tokens=600,
                response_format={"type": "json_object"},
            ),
            timeout=12,
        )
        parsed = json.loads(response.choices[0].message.content or "{}")
        refined = parsed.get("refined_prompts") or []
        # Belt-and-suspenders: even if the LLM ignored the forbidden list,
        # filter it post-hoc. Match is case/whitespace-insensitive.
        forbidden_set = {p.strip().lower() for p in cleaned_tried}
        forbidden_set.add(prompt_text.strip().lower())
        clean_refined: List[Dict[str, str]] = []
        for r in refined:
            if not isinstance(r, dict):
                continue
            p = (r.get("prompt") or "").strip()
            why = (r.get("rationale") or "").strip()
            if not p or len(p) < 6:
                continue
            if p.lower() in forbidden_set:
                continue
            clean_refined.append({"prompt": p, "rationale": why})
            if len(clean_refined) >= 3:
                break

        message = (parsed.get("message") or "").strip() or (
            f"That combo came up empty in our database. Here are three angles I'd try next:"
        )

        # Surface a flat suggestions list (titles only) for backwards compat
        # with the legacy ScoutSidePanel render path.
        legacy_suggestions = [r["prompt"] for r in clean_refined]

        return {
            "message": message,
            "suggestions": legacy_suggestions,
            "refined_prompts": clean_refined,
            "auto_populate": {
                # Top suggestion seeds the auto-populate fallback path.
                "prompt": clean_refined[0]["prompt"] if clean_refined else prompt_text,
            },
            "search_type": "contact",
            "action": "retry_search",
        }

    async def _handle_contact_search_help(
        self,
        *,
        failed_search_params: Dict[str, Any],
        error_type: str,
        user_name: str,
    ) -> Dict[str, Any]:
        """Generate help for failed contact search."""
        # The new natural-language prompt path: when the frontend sends the raw
        # prompt + parsed_query + retry chain context, we generate refined
        # natural-language prompts the user can re-run with one click. Falls
        # through to the legacy structured path if `prompt` isn't present.
        prompt_text = (failed_search_params.get("prompt") or "").strip()
        if prompt_text:
            try:
                return await self._handle_prompt_refinement_help(
                    prompt_text=prompt_text,
                    parsed_query=failed_search_params.get("parsed_query") or {},
                    broadened_dimensions=failed_search_params.get("broadened_dimensions") or [],
                    retry_level_used=int(failed_search_params.get("retry_level_used") or 0),
                    tried_prompts=[
                        p for p in (failed_search_params.get("tried_prompts") or [])
                        if isinstance(p, str) and p.strip()
                    ],
                    user_name=user_name,
                )
            except Exception as exc:
                print(f"[ScoutAssistant] Prompt-refinement path failed, falling back to legacy: {type(exc).__name__}: {exc}")
                # Fall through to legacy flow with empty structured fields.

        job_title = failed_search_params.get("job_title", "")
        company = failed_search_params.get("company", "")
        location = failed_search_params.get("location", "")
        
        system_prompt = """You are Scout, a helpful assistant that suggests alternative job titles when a contact search fails.

TONE (match Scout's main personality - direct, warm, helpful):
When a search returns no results, your tone should match Scout's main personality: direct, warm, helpful.
1. Briefly acknowledge the miss (don't just say "No results found")
2. Suggest 2-3 specific alternatives
3. Offer to help adjust
Example openings: "That combo didn't return anything - here's what I'd try next:" / "No luck with that search. A few things that usually help:" / "Hmm, nothing came back. Here's what I'd tweak:"
After listing alternatives, close with something like: "Want me to adjust the search for you?" or "Want to try one of these?"
Do NOT just list alternatives without context. Always acknowledge, suggest, then offer.

CONTEXT:
Different companies use different job titles for the same role. For example:
- Google uses "Software Engineer", "SWE", "Software Developer"
- Amazon uses "SDE", "Software Development Engineer"
- Meta/Facebook uses "Software Engineer, IC3", "Software Engineer, E4"
- Banks use "Analyst", "Associate", "VP" levels
- Consulting uses "Consultant", "Associate", "Senior Consultant"

COMPANY-SPECIFIC KNOWLEDGE:
- Google: Uses L3-L10 levels, "SWE" is common
- Amazon: Uses "SDE" (Software Development Engineer), levels I, II, III
- Meta: Uses E3-E8 levels, "Software Engineer, IC" format
- Microsoft: Uses levels 59-67+, "Software Engineer" or "SDE"
- Apple: Uses "Software Engineer", "ICT" prefixes
- Investment banks (Goldman, JPMorgan, etc.): Analyst, Associate, VP, Director, MD
- Consulting (McKinsey, BCG, Bain): Business Analyst, Associate, Consultant, Engagement Manager
- Private Equity: Analyst, Associate, VP, Principal, Partner

YOUR TASK:
Generate 3-5 alternative job titles that might work better for the given search.
Consider:
1. The company's known naming conventions
2. Industry standard variations
3. Seniority level variations
4. Abbreviations vs full titles

RESPONSE FORMAT (JSON):
{
  "message": "Brief, friendly message that acknowledges the miss, suggests alternatives, and offers to adjust (e.g. end with 'Want me to adjust the search for you?')",
  "suggestions": ["Alternative Title 1", "Alternative Title 2", "Alternative Title 3"],
  "recommended_title": "The single best alternative to try first"
}

Keep the message to 1-2 sentences. Be specific about the company if known."""

        user_message = f"Contact search failed for:\n- Job Title: {job_title or 'Not specified'}\n- Company: {company or 'Not specified'}\n- Location: {location or 'Not specified'}\n\nSuggest alternative job titles."

        try:
            response = await asyncio.wait_for(
                self._get_openai().chat.completions.create(
                    model=self.DEFAULT_MODEL,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                    temperature=0.7,
                    max_tokens=300,
                    response_format={"type": "json_object"},
                ),
                timeout=10,
            )

            content = response.choices[0].message.content
            parsed = json.loads(content)

            message = parsed.get("message", f"That combo didn't return anything - here's what I'd try next:")
            suggestions = parsed.get("suggestions", [])
            recommended = parsed.get("recommended_title", suggestions[0] if suggestions else job_title)

            return {
                "message": message,
                "suggestions": suggestions[:5],  # Max 5 suggestions
                "auto_populate": {
                    "job_title": recommended,
                    "company": company,
                    "location": location,
                },
                "search_type": "contact",
                "action": "retry_search",
            }

        except Exception as e:
            print(f"[ScoutAssistant] Contact search help failed: {type(e).__name__}: {e}")
            # Fallback suggestions based on common patterns
            fallback_suggestions = self._get_fallback_job_title_suggestions(job_title, company)
            return {
                "message": f"That combo didn't return anything - here's what I'd try next. Want me to adjust the search for you?",
                "suggestions": fallback_suggestions,
                "auto_populate": {
                    "job_title": fallback_suggestions[0] if fallback_suggestions else job_title,
                    "company": company,
                    "location": location,
                },
                "search_type": "contact",
                "action": "retry_search",
            }
    
    async def _handle_firm_search_help(
        self,
        *,
        failed_search_params: Dict[str, Any],
        error_type: str,
        user_name: str,
    ) -> Dict[str, Any]:
        """Generate help for failed firm search."""
        industry = failed_search_params.get("industry", "")
        location = failed_search_params.get("location", "")
        size = failed_search_params.get("size", "")
        
        system_prompt = """You are Scout, a helpful assistant that suggests alternatives when a firm search fails.

TONE (match Scout's main personality - direct, warm, helpful):
When a search returns no results, your tone should match Scout's main personality: direct, warm, helpful.
1. Briefly acknowledge the miss (don't just say "No firms found")
2. Suggest 2-3 specific alternatives
3. Offer to help adjust
Example openings: "I couldn't find a match for that. A few things that might help:" / "That search came up empty. Here's what I'd try:"
After listing alternatives, close with something like: "Want to try a different angle?" or "Want me to adjust the search?"
Do NOT just list alternatives without context. Always acknowledge, suggest, then offer.

CONTEXT:
Firm searches can fail because:
1. Industry terminology varies (e.g., "VC" vs "Venture Capital" vs "Investment Firm")
2. Location is too narrow (city vs metro area vs state)
3. Company size filters are too restrictive
4. Spelling or naming variations

INDUSTRY KNOWLEDGE:
- Finance: "Investment Banking", "IB", "Investment Bank", "Financial Services"
- VC/PE: "Venture Capital", "VC", "Private Equity", "PE", "Growth Equity", "Investment Firm"
- Consulting: "Management Consulting", "Strategy Consulting", "Consulting Firm"
- Tech: "Technology", "Software", "SaaS", "Enterprise Software"
- Hedge Funds: "Hedge Fund", "Asset Management", "Investment Management", "Alternative Investments"

LOCATION SUGGESTIONS:
- If city-level fails, suggest the metro area or state
- NYC → "New York Metro", "New York State"
- SF → "Bay Area", "California"
- Boston → "Greater Boston", "Massachusetts"

YOUR TASK:
Generate 3-5 alternative search terms that might work better.
Consider:
1. Alternative industry terminology
2. Broader locations
3. Related industries

RESPONSE FORMAT (JSON):
{
  "message": "Brief, friendly message that acknowledges the miss, suggests alternatives, and offers to adjust (e.g. end with 'Want to try a different angle?')",
  "suggestions": ["Alternative 1", "Alternative 2", "Alternative 3"],
  "recommended_industry": "Best alternative industry term",
  "recommended_location": "Broader location if applicable, or original"
}

Keep the message to 1-2 sentences."""

        user_message = f"Firm search failed for:\n- Industry: {industry or 'Not specified'}\n- Location: {location or 'Not specified'}\n- Size: {size or 'Any'}\n\nSuggest alternatives."

        try:
            response = await asyncio.wait_for(
                self._get_openai().chat.completions.create(
                    model=self.DEFAULT_MODEL,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                    temperature=0.7,
                    max_tokens=300,
                    response_format={"type": "json_object"},
                ),
                timeout=10,
            )

            content = response.choices[0].message.content
            parsed = json.loads(content)

            message = parsed.get("message", f"I couldn't find a match for that. A few things that might help:")
            suggestions = parsed.get("suggestions", [])
            recommended_industry = parsed.get("recommended_industry", suggestions[0] if suggestions else industry)
            recommended_location = parsed.get("recommended_location", location)

            return {
                "message": message,
                "suggestions": suggestions[:5],  # Max 5 suggestions
                "auto_populate": {
                    "industry": recommended_industry,
                    "location": recommended_location,
                    "size": size,
                },
                "search_type": "firm",
                "action": "retry_search",
            }

        except Exception as e:
            print(f"[ScoutAssistant] Firm search help failed: {type(e).__name__}: {e}")
            # Fallback suggestions
            fallback_suggestions = self._get_fallback_industry_suggestions(industry)
            return {
                "message": f"I couldn't find a match for that. A few things that might help. Want to try a different angle?",
                "suggestions": fallback_suggestions,
                "auto_populate": {
                    "industry": fallback_suggestions[0] if fallback_suggestions else industry,
                    "location": location,
                    "size": size,
                },
                "search_type": "firm",
                "action": "retry_search",
            }
    
    def _get_fallback_job_title_suggestions(self, job_title: str, company: str) -> List[str]:
        """Get fallback job title suggestions when OpenAI fails."""
        job_lower = job_title.lower()
        company_lower = company.lower() if company else ""
        
        # Common mappings
        if "software" in job_lower or "developer" in job_lower or "engineer" in job_lower:
            if "google" in company_lower:
                return ["SWE", "Software Developer", "Software Engineer, L3", "Software Engineer, L4"]
            elif "amazon" in company_lower:
                return ["SDE", "Software Development Engineer", "SDE I", "SDE II"]
            elif "meta" in company_lower or "facebook" in company_lower:
                return ["Software Engineer, IC3", "Software Engineer, E4", "Software Developer"]
            else:
                return ["Software Developer", "Software Engineer", "Developer", "Programmer"]
        
        if "product" in job_lower and "manager" in job_lower:
            return ["PM", "Product Lead", "Product Manager", "Product Management"]
        
        if "analyst" in job_lower:
            return ["Business Analyst", "Financial Analyst", "Data Analyst", "Associate Analyst"]
        
        if "consultant" in job_lower:
            return ["Associate", "Business Analyst", "Consultant", "Strategy Consultant"]
        
        # Generic fallback
        return [job_title, f"Senior {job_title}", f"Junior {job_title}"]
    
    def _get_fallback_industry_suggestions(self, industry: str) -> List[str]:
        """Get fallback industry suggestions when OpenAI fails."""
        industry_lower = industry.lower()
        
        if "venture" in industry_lower or "vc" in industry_lower:
            return ["Investment Firm", "Private Equity", "Growth Equity", "Venture Capital"]
        
        if "private equity" in industry_lower or "pe" in industry_lower:
            return ["Investment Firm", "Venture Capital", "Growth Equity", "Asset Management"]
        
        if "hedge" in industry_lower:
            return ["Asset Management", "Investment Management", "Alternative Investments", "Fund Management"]
        
        if "consulting" in industry_lower:
            return ["Management Consulting", "Strategy Consulting", "Business Advisory", "Professional Services"]
        
        if "investment bank" in industry_lower or "ib" in industry_lower:
            return ["Financial Services", "Investment Banking", "Corporate Finance", "Capital Markets"]
        
        # Generic fallback
        return [industry, "Financial Services", "Professional Services"]


# Create singleton instance
scout_assistant_service = ScoutAssistantService()

