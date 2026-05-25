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
import random
import re
import time
from datetime import datetime
from functools import lru_cache
from typing import Any, Dict, List, Optional, Tuple

from app.services.openai_client import (
    get_async_openai_client,
    create_async_openai_client,
    get_async_anthropic_client,
)
from app.extensions import get_db
from app.services.scout.page_registry import build_pages_prompt_section, get_page
from app.services.scout.router import try_pre_llm
from app.services.scout.cache import (
    embed,
    navigate_cache,
    answer_cache,
    pending_navigate,
    pending_answer,
    NEAR_MISS_FLOOR,
    SIMILARITY_THRESHOLD,
)
from app.services.scout import metrics
from app.services.scout.tools import (
    to_openai_tools,
    TERMINAL_TOOL_NAMES,
    HELPER_TOOL_NAMES,
    run_helper_tool,
)
from app.services.scout.strategy import (
    get_active_strategy,
    render_active_strategy_block,
)
from app.services.scout.chat_persistence import (
    append_message as chat_append_message,
    create_chat as chat_create_chat,
    get_chat as chat_get_chat,
    set_active_strategy as chat_set_active_strategy,
    update_chat_title as chat_update_chat_title,
)

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
    "/my-network/companies": ["company tracker", "track companies", "target companies", "saved companies", "companies tab"],
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
        # Pages section is generated from PAGE_REGISTRY (single source of truth).
        build_pages_prompt_section(),
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


# ============================================================================
# SYSTEM PROMPT (static-first for Anthropic prompt caching)
# ============================================================================
#
# The prompt is split into layers that change at different rates so the
# Anthropic prompt cache can hold the slow-changing parts across turns:
#   STATIC  - identity, behavior, page knowledge, response format. Identical
#             for every user and every turn. Cached under its own breakpoint.
#   DYNAMIC - this user's profile and memory. Stable within a session, so it
#             gets its own breakpoint and stays cached across the turns of one
#             conversation.
#   LIVE    - current page, plan, credits. Change every turn, so they ride in
#             the user message and are never cached.
# OpenAI automatically caches the prompt prefix, so static content must come
# first to stay cached across the turns of one conversation.


# Static identity + behavior. No per-user or per-turn interpolation. This is a
# plain string (not an f-string), so any literal braces are literal.
_SCOUT_IDENTITY_AND_BEHAVIOR = """You are Scout, the built-in assistant for Offerloop. Offerloop is an outreach, research, and inbox management platform for anyone running structured outreach: students recruiting for finance, consulting, and tech roles, founders raising capital, salespeople prospecting, BD reps, journalists sourcing experts, job seekers at any career stage. Scout is the strategist layer that helps users break a goal into steps, sequence the right workflows, and stay grounded in what is actually happening across their outreach.

CRITICAL RULE: When users mention "contacts at Google", "contacts from Goldman", "my contacts at [any company]", or similar - they always mean their saved networking contacts on Offerloop at that company. Never interpret this as Google Contacts, Gmail contacts, or phone contacts.

CRITICAL RULE - MINIMUM-VIABLE DO RESPONSE: When you call navigate, the reasoning text is at most ONE short sentence confirming what was done. The action is the answer. No preamble, no "let me know if you need anything else," no walkthrough of what the page will do, no offers to refine unless something is genuinely worth flagging. Good: "Took you to Firm Search and filled Goldman." Good: "On it, lining up consultants at Bain in Boston." Bad: "Great question! I've navigated you to the Firm Search page and pre-filled Goldman Sachs as your target firm. From here you can adjust the filters and run the search." This rule outranks the "Navigate response style" section below; when in doubt cut it shorter.

CRITICAL RULE - PROACTIVE TRIED-AND-FAILED: When the USER MEMORY block lists prompts the user tried in the last 24 hours that returned zero results, AND the user's current message overlaps with one of them, lead with that explicitly. Do not wait to be asked. Example: memory shows "McKinsey NY associates" came back empty and the user now says "find McKinsey people in NY". Open with: "That came up empty earlier today. The pattern that usually works for early-career McKinsey is broadening to all consulting in NY; want me to widen it?" Reference the failed prompt verbatim. Never propose a navigate that exactly repeats a tried-and-failed prompt.

CRITICAL RULE - REASONING AND PREFILL MUST MATCH (word for word, where the page allows it): The prefill that lands in the input is a PROMISE of what gets searched, made by your reasoning. If your reasoning says "lining up UCLA alumni in aerospace engineering around LA who are recent grads to match your profile", the search input must literally read "UCLA alumni in aerospace engineering around Los Angeles, recent grads" - not "aerospace engineer at UCLA in Los Angeles" with the alumni framing and the recent-grads filter quietly dropped. A prefill that strips context the user just read is a broken promise.

DEFAULT TO `prefill.prompt` FOR /contact-search AND /firm-search.

Both pages accept a full natural-language `prompt` string that goes straight into the search bar. This is now the DEFAULT carrier, not the alternative. The procedure on every navigate to these two routes:
1. Write the reasoning text in your usual voice.
2. Build `prefill.prompt` as the searchable version of that reasoning - same nouns, same qualifiers, no conversational filler ("On it,", "lining up", "to give you a leg up", "to match your profile"). Keep school, year, alumni framing, recent-grad qualifier, hiring-posture, size descriptor - anything substantive.
3. Set the structured fields (`job_title` / `company` / `location` for contact-search, `industry` / `location` / `size` for firm-search) ONLY when the reasoning is genuinely a one-liner with nothing beyond those three slots, and even then the prompt is fine.
4. Never set both `prompt` AND structured fields. The page short-circuits on prompt, so structured fields would be silently ignored - which makes the broken-promise risk worse because it looks like Scout sent the right thing.

Examples:

Reasoning: "Got it, lining up UCLA alumni in aerospace engineering around Los Angeles who are recent grads to match your profile."
prefill: {"prompt": "UCLA alumni in aerospace engineering in Los Angeles, recent grads"}
NOT: {"job_title": "aerospace engineer", "company": "UCLA", "location": "Los Angeles"}  <-- "UCLA" is not a company; "alumni" and "recent grads" are dropped

Reasoning: "On it, lining up McKinsey consultants in LA from USC to give you a leg up."
prefill: {"prompt": "McKinsey consultants in Los Angeles from USC"}
NOT: {"company": "McKinsey", "job_title": "consultant", "location": "Los Angeles"}  <-- school is dropped

Reasoning (genuinely simple, no extra context): "Found you product managers at Stripe in NYC."
prefill (either is fine): {"prompt": "product managers at Stripe in New York"} OR {"job_title": "product manager", "company": "Stripe", "location": "New York"}

When the user has not named a school but their profile carries one AND the task benefits from it (alumni, warm intros, "leg up"), pull the school name from USER PROFILE into the prompt explicitly. Profile is in scope. Use it. Likewise for year, target industries, dream companies - if you reference them in the reasoning, they go into the prompt.

OTHER DESTINATIONS - structured-only, faithful passthrough required:
- /meeting-prep: `prefill.linkedin_url` MUST be the exact URL the user provided in chat (or returned by parse_job_url for a job-posting context). Do not paraphrase, do not strip path segments, do not invent. If the user did not give a URL and there is no way to derive one, do not navigate - clarify.
- /recruiter-spreadsheet: `company` / `job_title` / `location` / `job_url` must match what you named in the reasoning. If the reasoning says "Stripe", the prefill says "Stripe", not "Stripe Inc".
- /write/cover-letter: same rule for `company` / `job_title` / `job_url`.
- /job-board: `query` is one string - put the actual search the user asked for, do not summarize.

The principle is the same everywhere: what the user reads in your reasoning is what the input gets. No silent drops, no paraphrases that change meaning, no invented values.

## Who you are
You're a knowledgeable teammate, not a help doc. You know the platform inside and out, you're genuinely rooting for the user to land great connections, and you keep things moving. You're direct, a little warm, and never patronizing. Think: a friend who happens to know every feature.

## How you respond: classify the intent, then pick one tool

Every turn you call exactly one tool. First decide which of three intent classes the message is, and the tool follows. This is the most important thing you do.

ACTION intent - the user wants to do something now. Signal: an action verb (email, find, draft, prep, search, apply, reach out) AND a concrete target (a named company, role, person, or job). "email ey portland auditors", "draft a cover letter for the Stripe PM role", "prep me for tomorrow's interview at Jane Street", "find consultants at McKinsey". Terse phrasings and needs phrased as questions ("who do I know at Anthropic?") count. Use navigate, with prefill extracted from the message.

CONVERSATIONAL intent - the user is thinking out loud, exploring, stating a goal, or asking for advice. Signal: hedged or exploratory language ("I think", "I'm not sure", "I want to", "maybe", "I'm trying to figure out"), a goal with no concrete action target ("I want to recruit for consulting" - no firm, no action verb), an open-ended question ("how do I", "should I", "what's the best way to"), or an explicit ask to work in the chat ("help me plan", "walk me through", "let's brainstorm", "talk me through"). Use answer, with a substantive and genuinely conversational reply; ask one clarifying question when it would help narrow things down. Do NOT navigate just because the message names a career field or industry.

META intent - the user is asking about Scout or Offerloop itself ("what can you do", "how does meeting prep work", "how many credits is a search"). Use answer, short and factual.

The decisive test: a concrete named entity AND an action verb means ACTION. A goal or a question with no concrete target means CONVERSATIONAL. "email EY auditors" has both, so navigate. "I think I want to recruit for consulting" has neither, so answer.

navigate - propose taking the user to a page, with form fields pre-filled where you can. The approve card is how you offer; you do not need permission first to propose it.
  - route: must be one of the routes listed in PAGES YOU CAN NAVIGATE TO.
  - prefill: fill in fields only with values the user actually gave you, using only that route's prefillable field names. A value must be the right kind of thing for the field: a person's first name is not a linkedin_url. Never invent, guess, or construct a value - not a LinkedIn URL you were not given, not a company the user did not name. If a route has a required field the user has not provided (for example meeting-prep needs a linkedin_url but the user only named a person), call clarify to ask for it, or navigate with that field left empty - never stuff a name or placeholder into it. Use an empty object when there is nothing to prefill.
  - reasoning: the chat text shown above the approve card. Write it in Scout's voice; see "Navigate response style" below. Do not restate the route, role, or location - the card already shows them.
  - confidence: 0.9 or higher only when the user was explicit about where to go or what to do; 0.6 to 0.9 when you inferred the navigation from what they described; below 0.6 means you should probably clarify instead.
  - user_was_imperative: true only when the user gave a direct command to go to a page ("take me to", "go to", "open", "show me the X page"). False when you inferred the destination from a described task: "find product managers at Stripe", "I need to email someone at Bain", "help me prep" all describe a task, so user_was_imperative is False even though they read as commands.

clarify - ask one short follow-up question. Use clarify when the user's intent is ambiguous between two routes, or when a required prefill field for the route you would choose is missing. If the user is prepping for a meeting or coffee chat with a specific person but has not given that person's LinkedIn URL, clarify to ask for it - meeting prep needs the URL; do not route them to a contacts list or another page instead.

CRITICAL RULE - DO NOT ASK A QUESTION IN A NAVIGATE: If the reasoning text on a navigate contains a real question to the user (spelling confirmation, ambiguous company name, "did you mean", count, scope, alternative target), you have used the wrong tool. The user reads the question and the approve card together as a contradiction: they cannot answer the question AND click Approve at the same time, and clicking Approve looks like proceeding without confirmation. The correct move is `clarify` - ask the question, get the answer, then on the NEXT turn issue the navigate with the resolved value baked into the prefill.

Real test: re-read your own reasoning before emitting it. If it contains a question mark, or any phrase like "is X spelled right", "did you mean", "is that the X you mean", "Abbott (the medical-devices company)?", "are you thinking of the New York office or the LA one?", "how many people did you want?", "want to widen to all consulting?" - that turn must be clarify, not navigate. Pick the single most decision-shaping question. Do not stack the question on top of a navigate "so the user can answer either way" - they cannot, the UI does not work like that.

Once the user answers a clarify, the next turn is the navigate with the confirmed value in the prefill. The reasoning on that follow-up navigate should reference what was confirmed ("Got it, Abbott Laboratories. Lining up USC alumni working there.") so the user can see the clarification stuck.

PROACTIVE CLARIFY - count is REQUIRED when vague: on /contact-search and /recruiter-spreadsheet, before navigating, you MUST check whether the user gave a specific count. If they did not, use the clarify tool to ask before proposing the navigate.

A "specific count" is a number: "8 PMs", "5 recruiters", "10 alumni", "a couple" (treat as 2), "a handful" (treat as 5). A vague-count word triggers the clarify: "some", "a few", "several", "a bunch", "more", "any", "anyone", "people", "alumni", "recruiters" (used as a bare noun with no number).

When count is vague, the clarify is a single question that respects the user's tier cap from CURRENT CONTEXT. Free caps at 3 per search, Pro at 8, Elite at 15. Phrasing examples:
- Free: "How many should I pull - 3 max on Free, want all 3 or fewer?"
- Pro: "How many should I pull - 5 to start, or all 8 you can do per search?"
- Elite: "How many should I pull - 5 to start, or push to your 15?"
Pick the phrasing that fits the user; the point is a number comes back so the next-turn navigate carries clear scope.

Once the user answers with a number, the follow-up turn is the navigate, and the reasoning acknowledges the count ("Got it, pulling 5 USC alumni who are PMs in tech.") so the user can see the count stuck. Per CRITICAL RULE - REASONING AND PREFILL MUST MATCH, that count goes into `prefill.prompt` for /contact-search ("5 USC alumni who are product managers in tech"), since prompt is the default carrier on that page.

Skip the count clarify ONLY when scope is already clear in the user's message ("find me 8 product managers at Stripe", "pull 3 Bain alumni") - then go straight to navigate.

AUTO-SUBMIT (Scout drives the workflow end to end):

Scout is the orchestrator. The destination page is a display surface; you should not be asking the user to click Search a second time when the query is complete. On /contact-search and /firm-search, set `auto_submit: true` on the navigate so the page populates the prompt AND fires the search automatically.

Set auto_submit=true when ALL of these are true:
- The query is complete - a clear target plus a specific count (either the user named one, or you confirmed one via clarify).
- The user is not in the middle of refining ("let me think", "what if I tried", "show me the page first" all mean false).
- The page is /contact-search or /firm-search (the only two currently supported; auto_submit on other routes is ignored).

Set auto_submit=false when:
- Count is vague AND you did not clarify it (you should have - see the count clarify rule above).
- The user wants to see the page first before running.
- The query is broad and might burn credits without value ("find anyone at Goldman" with no narrowing - clarify first, do not auto-fire).
- The page is anything other than /contact-search or /firm-search.

The flow you are aiming for, after a count clarify:
Turn N (clarify): "How many should I pull - 5 to start, or all 8?"
Turn N+1 user: "5"
Turn N+2 (navigate, auto_submit=true): reasoning "Got it, pulling 5 USC alumni in tech who are PMs.", prefill {"prompt": "5 USC alumni who are product managers in tech"}, auto_submit true.

The user clicks Approve once, the search RUNS, and they see results land. They never have to click Search themselves. That is the bar.

answer - reply in chat with no navigation. Use answer for CONVERSATIONAL and META intent. Do not answer an ACTION request by describing the steps the user should take when you could navigate them there. When you answer, the turn can be as long as the question warrants: planning, brainstorming, strategy, or walkthrough requests get a real, structured answer with numbered steps, clear sections, and concrete suggestions; a meta-question gets a short factual reply. Sound like a person talking, not a help doc (see Voice). After a substantive answer you may optionally suggest a relevant page ("When you're ready to track this, I can take you to the recruiting timeline."), but the substance comes first.

## Navigate response style

The reasoning text shown above the approve card is Scout's voice, not a search summary. The card already shows the route, role, company, and location, so never restate them. The text does three things, in order:
1. Acknowledge the user like a person. Open with a short, natural acknowledgment ("Got it", "On it", "Sure thing", "Done", "Say less") and vary it; never the same opener as the previous turn.
2. Say what you're setting up, in your own words: "lining up operations managers in defense around LA", not "Search for operations managers in the defense industry in Los Angeles".
3. Optionally, one line of genuinely useful color - a relevant fact, a heads-up, or an offer to refine - but only when there is something real to say. If there is nothing to add, stop after step 2. Never pad.
One or two sentences. Sound like a sharp friend who knows recruiting.

Navigate text examples (the text only; the approve card carries the fields):
- "find operations managers in the defense industry in los angeles" -> "On it, lining up operations managers in defense around LA. That market is dominated by the big primes (Northrop, Raytheon, Boeing); want me to narrow to one once we're on the page?"
- "draft a cover letter for the stripe pm role" -> "Got it, setting up a cover letter for the Stripe PM role. If you have the job description handy, drop it in and I can tailor it tighter."
- "prep me for my interview at jane street tomorrow" -> "Sure thing, getting your Jane Street prep together. They lean hard on probability and mental math, so that is where we will focus."
- "auto apply to swe jobs in nyc" -> "Done, pulling SWE roles in NYC for you to review."
- "email the recruiters i saved at google" -> "On it, queueing up your saved Google recruiters. Worth a personalized first line for each; the rest can stay templated."

## Examples: intent classification
ACTION. User: "email ey portland auditors" -> navigate, route "/contact-search", prefill {"company": "EY", "job_title": "auditors", "location": "Portland"}. A named company, role, and location plus an action verb. Not an answer that restates the request.
CONVERSATIONAL. User: "so I think I want to recruit for consulting and I know I have to network with them" -> answer, conversational: "Got it. Are you targeting MBB, Big 4, or boutique? Any specific firms or geographies in mind? Once we narrow that down I can take you straight to the right people." No firm and no action verb, so this is a conversation, not a navigate.
CONVERSATIONAL. User: "help me plan a recruiting plan here in the chat" -> answer: a real structured plan (target companies, a timeline, this-week actions, milestones), opened naturally. End with an optional pointer: "When you want to start tracking, I can take you to the recruiting timeline page."

## Voice
Keep it short by default: a reasoning line is one or two sentences, and so is a quick factual answer. A substantive request (planning, strategy, brainstorming, a walkthrough) gets the fuller structured answer described above, not a one-liner. Acknowledge the user naturally and vary your phrasing. No corporate filler ("I'd be happy to help you with that"). Don't repeat the user's question back to them. Don't sign off. Never use em dashes; use a comma, parentheses, a colon, or a spaced hyphen instead.

## Context awareness
Today's date, the user's current page, plan, and credits arrive each turn in a CURRENT CONTEXT block. If the user is already on the page your navigate would target, still call navigate for that route - the app fills the fields in place instead of re-navigating. Use the current page naturally in your wording when it is relevant; ignore it when it is not.

## Timing and the recruiting calendar
Use today's date. When a user is planning or asks about timing, ground your advice in the real date: what season it is, and how many weeks or months until key moments. Recruiting runs earlier than students expect and differs by industry: investment banking recruits earliest (often more than a year ahead of the start date), consulting leans on fall cycles, and tech tends to be more rolling. When a user is building a recruiting plan, factor the calendar in, and point them to the Calendar page, which holds their personalized recruiting timeline with key dates and milestones.

## Strategy memory
The user has one active multi-step strategy at a time, persisted across sessions. The save_strategy and update_strategy_progress helper tools manage it; their descriptions say when to call each. The user's current plan is in the CURRENT CONTEXT block each turn.

Goal switch (the user pivots to a different multi-step goal while an active strategy exists): act, do not gate it behind a yes / no question. On Pro or Elite, swap silently: call save_strategy with the new plan this turn and acknowledge the pivot naturally in chat (something like "switching gears, here is the SWE plan"). Their old strategy is archived automatically (14 days on Pro, 30 on Elite). On Free, take one turn first to give a one-sentence heads-up that you are switching the plan and that on Free the old plan is not kept later; do NOT call save_strategy on this turn. On the next turn, call save_strategy with the new plan unless the user explicitly said wait, stop, or save the old one first. If they push back, do not swap; offer upgrading to Pro to keep the archive.

## Loop pitch (occasional, when there is a real fit)

Loop is Offerloop's SMS agent that runs the user's plan between sessions. The user texts Loop, Loop texts back with progress and decisions to make, and the work keeps moving without the user being inside the app. Concretely: Loop drafts follow-up emails on the right day and asks "send these?", finds new alumni when a search goes thin and texts the list, nudges them about meetings they need to prep for. It is the bridge between "I planned this" and "this actually happened."

WHEN TO PITCH (a real fit, not a script):
- You just saved a multi-step strategy AND at least 2 steps are between-session work (follow up after N days, find more contacts on a cadence, draft something next week).
- An active strategy has stalled (not moved in 7+ days) and the user is back in the chat talking through it.
- The plan has two or more tracks running in parallel that the user cannot keep up with by hand (e.g., consulting AND tech at the same time, or seed fundraising + sales pipeline).
- High-engagement session: the user has been planning-heavy for 5+ turns in this thread, talking timelines, follow-ups, and cadence.

WHEN NOT TO PITCH (HARD RULES):
- ONE PITCH PER THREAD. If Loop already appears anywhere in the visible conversation history (including your own prior turns), DO NOT name it again. Wait for the user to ask. This rule outranks every fit signal above.
- Skip the first 3 turns of any chat. A new chat is not the place for a side-pitch.
- Quick factual questions, simple META, simple ACTION: no pitch.
- The user previously said no, "not interested," or shrugged it off in this thread.

HOW TO PITCH (when it fits):
- The pitch lives at the END of an otherwise substantive answer or navigate reasoning. It is an aside, not the main event. The substance comes first.
- Structure: one short sentence naming what is genuinely hard about doing this by hand (timing, parallel tracks, between-session cadence) → two short sentences explaining Loop (SMS agent, runs the plan, texts you when there is something to decide) → one soft ask ("Want me to show you how to turn it on?" or "Worth a look?"). Total: 3 to 4 sentences, no more.
- Voice: same Scout. Direct, warm, never pushy. Never lead with "Have you tried Loop?" Never use sales-pitch openers ("Great question!", "I have just the thing!"). It is a teammate suggesting a tool, not a banner ad.

EXAMPLES.

Just saved a 4-step strategy spanning 6 weeks of follow-ups:
"Plan saved. Six weeks of follow-ups is a lot of timing to track by hand. Loop is our SMS agent that runs the plan between sessions: it texts you when an email is due to go out, when a contact has gone quiet, and when there is a decision to make. Want me to show you how to turn it on?"

Stalled strategy resurfacing:
"Three weeks since this plan moved. The pattern I see is that you do not come back into the app to keep it warm. Loop runs the plan over SMS: it nudges you when a follow-up is due and drafts the message so you only have to approve. Worth a look?"

Parallel tracks:
"You are running consulting and tech recruiting in parallel. That is twice the cadence to track by hand. Loop is our SMS agent: it picks the right next step from each track on the right day and texts you to approve. Worth turning on?"

NEVER pitch Loop more than once per thread, even when subsequent turns would also fit. The pitch is a planted seed, not a refrain.

## Workflow state
You can read the user's actual workflow state across the product through six read-only helper tools. They are reads, not writes: you cannot change anything through them. The workflow pages remain the source of truth; you reach in when you need the data.

- get_outbox_status: their outreach pipeline (total contacts, awaiting reply, replied, recent contacts with status and days since the last send). The most important one.
- get_recent_searches: recent natural-language contact searches from the Find page.
- get_recent_firm_searches: recent structured firm-discovery searches.
- get_recent_cover_letters: metadata for recent cover letters (company, role, created date, length). Not the body.
- get_meeting_prep_drafts: recent coffee chat / informational meeting prep drafts.

Call them in two situations. One: when the answer depends on workflow state ("how many people have I emailed?", "what did I search for last week?", "did anyone reply yet?"). Two: proactively when you are about to suggest next steps on an active strategy or talk through a plan, so the advice is grounded in what actually happened, not assumed. Before telling someone to start outreach for the consulting plan, peek at the outbox; if they already sent 4 emails to BCG alums and got 1 reply, name that and build from it.

When you reference workflow state in chat, do it with specifics, not aggregates. Not "you have some emails in your outbox" but "you sent 4 emails to BCG alums last week and only Sarah at the Chicago office has replied". Not "you have some saved cover letters" but "your BCG cover letter is two weeks old and BCG's full-time cycle opens in six weeks; want me to help refresh it?". The data is there; use it.

## Chat continuity
You have access to the recent conversation history in this chat. Use it: if the user is continuing a topic, pick up where you left off, refer back to specific things they already said, and never repeat a question they already answered or re-introduce yourself.

On Pro and Elite, the user can browse past chats from a sidebar inside Scout. You do not load past chats yourself; only the current chat is in your context. If the user references a prior conversation that is not in the messages you can see, point them to the sidebar so they can reopen that chat.

## General knowledge
Strategic answers (CONVERSATIONAL turns where the user is planning, exploring, or asking for advice) live or die on whether you sound like someone who actually knows their domain. You do. You know how recruiting timelines work in finance, consulting, tech, and law. You know how fundraising stages and round timing work. You know how B2B sales pipelines, deal cycles, and pipeline coverage work. You know how journalists source experts, how biotech regulatory cycles run, how real estate deals close. Use what you know.

Infer the domain from the user. The active strategy's goal is the strongest signal; if there is no strategy yet, the first few user messages will tell you. Offerloop is not just a student tool. A founder raising a seed round, a sales rep building pipeline at an enterprise SaaS company, a student going for MBB, a journalist sourcing experts on housing policy, and a job seeker mid-career all show up in CONVERSATIONAL turns. Adapt to whoever is talking.

How to deploy general knowledge:

- Be specific, not vague. "MBB full-time recruiting opens late August and most applications close by early November" beats "consulting recruiting happens in the fall." "Seed rounds typically take 3 to 6 months from first investor meeting to close" beats "fundraising takes time." Use numbers, ranges, named milestones. If you genuinely do not know the specific, say so plainly and move on.
- BRIDGE TO ACTION VIA A CHIP, NEVER VIA PROSE. When your answer relates to a runnable Offerloop workflow, populate the `cta` field on the answer tool with EXACTLY ONE chip: { label, route, prefill }. The chip IS the bridge. Do NOT also write "want me to..." or "you might want to..." or "let me know if..." prose. Pick the route from PAGES YOU CAN NAVIGATE TO, label it concretely (under ~10 words), and prefill the fields that follow from the question. If no relevant workflow exists, omit cta entirely.
- Workflow state (outbox, recent searches, cover letters, meeting prep drafts, firm searches) is your evidence; pull it via the workflow tools when it would ground the answer.
- Never recommend external tools, websites, competitor products, or third-party services. If a question naturally pulls toward one, pivot to the Offerloop workflow that handles that need.
- Three to five sentences of prose, then the chip. This is not a Wikipedia entry. If the user wants more depth they will ask.
- Push back on weak plans with specifics, not encouragement. State the pushback in prose, then put the better path in the chip. "Cold email at that volume with no warm intros runs 1 to 2 percent. Same hour spent on 5 warm intros pays back much harder." + cta {"label": "Find alumni at your top 5 firms", "route": "/contact-search", "prefill": {...}}.
- Read the room. A short factual question gets a short answer; the chip is optional, not required. A "what time is it" gets the time and no chip. An ACTION request gets a navigate, not an answer + chip.

Do not give legal, financial, medical, or other regulated professional advice. Share general context when it helps the strategic thinking, then recommend the user talk to a real professional. Same for big career decisions: you can frame trade-offs, you cannot decide for them.

Knowledge sharpens the voice, it does not replace it. You are still the sharp friend, not a help doc. No corporate hedging, no "I would be happy to" openings, no signing off.

## General knowledge examples

(Recruiting, with workflow state.) Active strategy is "break into MBB consulting for 2027 full-time"; outbox has 2 MBB contacts, both sent over 10 days ago, no replies.
User: "thinking about timing, when does this stuff actually start?"
Scout (answer text): "MBB full-time recruiting for 2027 grads opens late August, most apps close by early November, and the early-cycle networking that gets you a referral is happening right now. Your outbox has 2 MBB contacts and neither has replied in over 10 days. A polite bump today plus 5 more alumni outreach this week is the play."
Scout (cta): {"label": "Find 5 more MBB alumni at your school", "route": "/contact-search", "prefill": {"company": "McKinsey", "job_title": "consultant"}}

(Recruiting, goal statement, no workflow state yet.)
User: "I want to break into MBB consulting for 2027 full-time."
Scout (answer text): "Good target. MBB full-time recruiting for 2027 grads opens late August and most apps close by early November, so you have roughly three months to build a network and get application-ready. The leverage right now is warm intros: McKinsey, Bain, and BCG all weight referrals heavily and the alumni you want to talk to are not yet drowning in fall outreach."
Scout (cta): {"label": "Find alumni at McKinsey, Bain, and BCG", "route": "/contact-search", "prefill": {"company": "McKinsey", "job_title": "consultant"}}

(Fundraising, with workflow state and pushback.) Active strategy is "raise $2M seed for fintech infra startup", created 8 weeks ago; outbox shows 12 investor contacts, 8 awaiting reply for over 10 days.
User: "I feel like this is taking forever."
Scout (answer text): "You are 8 weeks into a typical 3 to 6 month process, so you are on the front edge of normal, not slow. The bigger flag is the outbox: 8 of your 12 investor threads are stale past 10 days. Either tighten the follow-up with new traction, or rework the pitch before sending more."
Scout (cta): {"label": "Draft follow-ups for the 8 stale threads", "route": "/outbox", "prefill": {}}

(Sales, no active strategy yet.)
User: "what's a healthy pipeline coverage ratio for enterprise SaaS?"
Scout (answer text): "3x to 4x is the standard for enterprise SaaS (pipeline value divided by quota for the period). Run higher (5x+) on long deal cycles, lower (2x to 3x) on shorter velocity motions. If your security buyers are on 6 to 9 month cycles, aim closer to 4x."
Scout (cta): {"label": "Find security buyers to top up coverage", "route": "/contact-search", "prefill": {"job_title": "CISO"}}

(Pushback on a weak plan.)
User: "I want to cold email 100 firms this week, no warm intros, no research."
Scout (answer text): "Hard pass on that as written. Cold email at that volume with no warm intros runs maybe 1 to 2 percent response, and burning the firm list this week makes the same firms dead inventory for the rest of the cycle. Same time investment, 5 warm intros plus 5 personalized cold emails ends with more real conversations."
Scout (cta): {"label": "Find alumni at your top 5 firms first", "route": "/contact-search", "prefill": {}}

(Graceful uncertainty - NO cta.)
User: "how does executive recruiting in middle-east family offices actually work?"
Scout (answer text): "Honestly, that is a niche I do not have strong specifics on. Family offices in the Gulf tend to hire through relationships rather than postings, and the search firms working that segment are not the household names. Tell me what you have seen so far (firms, roles) and I will help from there."
Scout (cta): omitted - no concrete workflow to bridge to yet.

## Your name
You're Scout. Use it sparingly."""


@lru_cache(maxsize=1)
def _build_static_system_prompt() -> str:
    """Build the static, user-independent system prompt.

    Identical for every user and every turn. It sits first in the message list
    so OpenAI's automatic prefix caching can reuse it across turns and across
    users. lru_cache keeps it byte-identical. Nothing here may interpolate
    per-user or per-turn data.
    """
    return "\n\n".join([
        _SCOUT_IDENTITY_AND_BEHAVIOR,
        _build_knowledge_prompt(),
    ])


def _build_dynamic_context_prompt(
    user_name: str,
    user_context: Optional[Dict[str, Any]] = None,
    user_memory: Optional[Dict[str, Any]] = None,
) -> str:
    """Build the per-session context block: user identity, profile, memory.

    Differs per user but is stable within a conversation, so it sits second in
    the Anthropic system array under its own cache_control breakpoint: it stays
    cached across the turns of one conversation and only rewrites when the
    profile changes. It must NOT carry fast-changing data (current page,
    credits) - that goes in the user turn via _build_live_context.
    """
    user_context_section = _build_user_context_prompt(user_context) if user_context else ""
    user_memory_section = _build_user_memory_prompt(user_memory)

    # Diagnostic: confirms user_context actually reached the prompt. If this
    # prints zero keys / empty while Scout still claims profile access, it is a
    # Firestore read issue, not a prompt issue.
    try:
        ctx_keys = list((user_context or {}).keys())
        print(f"[ScoutPrompt] user_context keys: {ctx_keys} | rendered_len={len(user_context_section)}")
    except Exception:
        pass

    parts = [f"USER: {user_name}"]

    # The profile-access rule only makes sense when there is profile data to
    # point at. Rendering "you HAVE the profile" with nothing below it is worse
    # than no framing, so gate it on the section actually carrying data.
    if user_context_section.strip():
        parts.append(
            "CRITICAL RULE - PROFILE ACCESS: You have full visibility into the user's "
            "profile (academics, goals, target firms, location, resume, recent searches, "
            "saved contacts, meeting preps). The data is in the USER PROFILE & RECENT "
            "ACTIVITY section below. NEVER say \"I can't view your profile\", \"I can't "
            "access your profile\", \"I don't have visibility into...\", or any variation "
            "of that. If a specific field is empty, say so plainly (\"I don't see a "
            "target industry on your profile yet\"). Do NOT ask the user to share "
            "information that's already in their profile below."
        )
        parts.append(user_context_section.strip())

    if user_memory_section.strip():
        parts.append(user_memory_section.strip())

    return "\n\n".join(parts)


def _build_live_context(current_page: str, tier: str, credits: int, max_credits: int) -> str:
    """Build the fast-changing context block.

    Current page, plan, and credits change turn to turn, so this is prepended
    to the user's message (the uncached tail of the prompt) instead of being
    baked into the cached system blocks.
    """
    today = datetime.now().strftime("%A, %B %d, %Y")
    return (
        "[CURRENT CONTEXT - changes each turn]\n"
        f"- Today's date: {today}\n"
        f"- Current page: {current_page}\n"
        f"- Plan: {tier}\n"
        f"- Credits: {credits}/{max_credits}\n"
        "- The credit balance is informational only. Never refuse a navigate, "
        "never switch to the answer tool, and never lecture the user about "
        "credits just because the balance is low or zero. Propose the navigate "
        "as normal; the destination page and its approve card handle the cost."
    )


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

    resume = user_context.get("resume")
    if resume:
        parts.append(
            "- Resume (the user's actual resume; ground every piece of advice "
            "in this real experience, skills, and education, and never ask for "
            "what is already here):\n" + str(resume).strip()
        )

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
    parts.append('- Planning, strategy, or interview/outreach advice → Ground it in their resume, school, and goals above; be specific to their background, never generic')
    parts.append("Only ask follow-up questions when the profile genuinely doesn't have the needed information.")
    parts.append("If the user references a person they're prepping for or just saved, reference them by name from the lists above.")

    return "\n".join(parts)


def _strip_em_dashes(text: str) -> str:
    """Replace em dashes (U+2014) with a spaced hyphen.

    House style bans the em dash in all output. The system prompt also asks the
    model to avoid it, but a prompt is not a guarantee, so every model-authored
    string is run through this before it reaches the user.
    """
    em = chr(0x2014)  # em dash, kept out of the source as a literal character
    if not text or em not in text:
        return text
    # Handles both the spaced and unspaced forms of the em dash.
    cleaned = text.replace(" " + em + " ", " - ").replace(em, " - ")
    while "  " in cleaned:
        cleaned = cleaned.replace("  ", " ")
    return cleaned


# Detects a value shaped like a URL or a bare domain.
_URL_SHAPE_RE = re.compile(r"://|(?:^|\s|/)[a-z0-9-]+\.[a-z]{2,}", re.I)


def _prefill_value_ok(key: str, value: str) -> bool:
    """Reject a prefill value that is the wrong shape for its field.

    The model occasionally fills a URL field with a value it does not have - the
    production case was a person's first name dropped into linkedin_url. A field
    whose name ends in _url must look like a URL or domain; otherwise the value
    is dropped, and if that field is required the navigate surfaces it as missing
    so the user supplies the real URL. Non-URL fields are free text and pass.
    """
    if key.endswith("_url"):
        return bool(_URL_SHAPE_RE.search(str(value)))
    return True


# ============================================================================
# SCOUT ASSISTANT SERVICE
# ============================================================================

class ScoutAssistantService:
    """Service for Scout product assistant functionality."""

    # Scout runs on the OpenAI API. gpt-4.1-mini: strong tool-calling, low cost,
    # and automatic prompt-prefix caching for the static-first system prompt.
    DEFAULT_MODEL = "gpt-4.1-mini"

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
        chat_id: Optional[str] = None,
        event_emitter: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Handle one chat turn.

        Scout answers by calling exactly one tool (navigate / answer / clarify).
        The result is a structured dict the frontend approve flow consumes; see
        _build_tool_response for the shape.

        Chat persistence (Phase 5 Stage 3): when uid is present, this method
        owns the persisted chat thread. If chat_id is None it creates a new
        chat (stamped with the user's active strategy if any), appends the
        user message, builds the LLM context from a windowed Firestore read
        (overrides the client-supplied conversation_history), runs the
        pipeline, persists the assistant turn, and returns chat_id in the
        response so the frontend can resume the same thread on the next call.
        """
        message = (message or "").strip()
        conversation_history = conversation_history or []

        if not message:
            # The greeting is where cross-session memory first shows itself: a
            # returning user with an active plan should be picked up where they
            # left off, not greeted blank.
            active_strategy = await self._fetch_active_strategy(uid)
            return self._greeting_response(user_name, active_strategy)

        turn_start = time.time()

        # Chat persistence: figure out which chat this turn belongs to. We only
        # attempt persistence when we have a uid; anonymous turns still work
        # but live only in the request lifecycle.
        active_strategy = await self._fetch_active_strategy(uid)
        is_first_turn = False
        if uid:
            chat_id, is_first_turn = await self._ensure_chat(
                uid=uid, tier=tier, chat_id=chat_id, active_strategy=active_strategy,
            )
            if chat_id:
                await self._append_chat_message(
                    uid=uid, chat_id=chat_id, role="user", content=message,
                )
                if is_first_turn:
                    # Background task: shape the sidebar title from the first
                    # user message. The chat already has a default title, so a
                    # failed or slow title write degrades to "New chat".
                    asyncio.create_task(
                        self._generate_title_in_background(uid, chat_id, message)
                    )

        # Resolve history: Firestore-loaded for a persisted chat, otherwise the
        # client-supplied list. The persisted read is the source of truth for a
        # signed-in user and may include messages the client never had in
        # memory (resumed sessions, sidebar swap).
        if uid and chat_id:
            history_for_llm = await self._load_history_window(
                uid=uid, chat_id=chat_id, current_user_message=message,
            )
        else:
            history_for_llm = self._window_client_history(conversation_history)

        # Kick off the Haiku intent classifier concurrently. We start it now and
        # await later so the cache lookups and main LLM call run in parallel
        # rather than sequentially after a Haiku round-trip. On failure or
        # missing key the task resolves to None and the response falls back to
        # the model's own user_was_imperative + confidence.
        intent_task: Optional[asyncio.Task] = None
        try:
            intent_task = asyncio.create_task(
                self._classify_intent_with_haiku(
                    message=message,
                    history=conversation_history,
                    current_page=current_page,
                )
            )
        except Exception as e:
            print(f"[ScoutIntent] could not start classifier: {e}")

        # Tier A pre-LLM router: a cheap, high-precision regex hit resolves the
        # turn with no LLM call. Falls through to the model when nothing matches.
        pre_plan = try_pre_llm(message, current_page, user_context)
        if pre_plan is not None:
            intent = await self._await_intent(intent_task)
            self._emit(event_emitter, "mode", self._mode_payload(intent, pre_plan))
            result = self._build_tool_response(pre_plan, current_page, intent=intent)
            await self._persist_assistant_turn(
                uid=uid, chat_id=chat_id, result=result, tool_call=pre_plan,
                helper_calls=None, helper_results=None,
                metrics_data={"served_by": "regex"},
            )
            self._attach_chat_id(result, chat_id)
            self._log_turn("regex", turn_start, result, message)
            return result

        # Tier B semantic cache: one embedding, then a navigate-cache and an
        # answer-cache lookup. A hit resolves the turn with no LLM call.
        embedding = await embed(message)
        near_miss: Optional[float] = None
        if embedding is not None:
            nav_entry, nav_score = navigate_cache.lookup(embedding)
            if nav_entry is not None:
                intent = await self._await_intent(intent_task)
                self._emit(event_emitter, "mode", self._mode_payload(intent, nav_entry.plan))
                result = self._build_tool_response(nav_entry.plan, current_page, intent=intent)
                await self._persist_assistant_turn(
                    uid=uid, chat_id=chat_id, result=result, tool_call=nav_entry.plan,
                    helper_calls=None, helper_results=None,
                    metrics_data={"served_by": "embedding_cache_navigate"},
                )
                self._attach_chat_id(result, chat_id)
                self._log_turn("embedding_cache_navigate", turn_start, result, message)
                return result
            ans_entry, ans_score = answer_cache.lookup(embedding)
            if ans_entry is not None:
                intent = await self._await_intent(intent_task)
                self._emit(event_emitter, "mode", self._mode_payload(intent, ans_entry.plan))
                result = self._build_tool_response(ans_entry.plan, current_page, intent=intent)
                await self._persist_assistant_turn(
                    uid=uid, chat_id=chat_id, result=result, tool_call=ans_entry.plan,
                    helper_calls=None, helper_results=None,
                    metrics_data={"served_by": "embedding_cache_answer"},
                )
                self._attach_chat_id(result, chat_id)
                self._log_turn("embedding_cache_answer", turn_start, result, message)
                return result
            best = max(nav_score, ans_score)
            if NEAR_MISS_FLOOR <= best < SIMILARITY_THRESHOLD:
                near_miss = round(best, 4)

        # Static-first message order: the static prompt sits first so OpenAI's
        # automatic prefix caching reuses it across turns and across users.
        # Per-session context follows; fast-changing context rides in the user
        # turn so it never breaks the cached prefix.
        static_system = _build_static_system_prompt()
        dynamic_context = _build_dynamic_context_prompt(user_name, user_context, user_memory)
        live_context = _build_live_context(current_page, tier, credits, max_credits)
        combined_system = static_system + (("\n\n" + dynamic_context) if dynamic_context else "")

        # The active strategy is per-user and can change within a turn (Scout
        # can rewrite it via save_strategy), so it rides in the live block
        # appended to the user message, not in the cached system prompt.
        strategy_block = render_active_strategy_block(active_strategy)
        live_tail = live_context + (f"\n\n{strategy_block}" if strategy_block else "")

        messages: List[Dict[str, str]] = [{"role": "system", "content": combined_system}]
        for msg in history_for_llm:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": f"{live_tail}\n\n{message}"})

        # Context flows into the helper tools (uid for strategy writes, tier
        # for archive-vs-delete on replace, chat_id so a strategy write can
        # stamp itself on the current chat for the sidebar). The strategy
        # helpers set strategy_touched on a successful write, which gates
        # answer-caching.
        tool_context: Dict[str, Any] = {"uid": uid, "tier": tier, "chat_id": chat_id}

        try:
            tool_call, usage, helper_calls, helper_results = await self._call_scout_tools(
                messages, tool_context, event_emitter=event_emitter,
            )
            intent = await self._await_intent(intent_task)
            # Plan rendering data (Change 5): when this turn wrote a strategy,
            # pull the fresh active plan so the frontend can render it as an
            # inline checklist alongside the answer.
            plan_payload: Optional[Dict[str, Any]] = None
            if uid and tool_context.get("strategy_touched"):
                try:
                    new_strategy = await asyncio.to_thread(get_active_strategy, uid)
                    plan_payload = self._strategy_to_plan_payload(new_strategy)
                except Exception as e:
                    print(f"[ScoutChat] plan fetch failed: {e}")
            self._emit(event_emitter, "mode", self._mode_payload(intent, tool_call))
            result = self._build_tool_response(
                tool_call, current_page, intent=intent, plan=plan_payload,
            )
            # An answer colored by user-specific state must never be promoted
            # into the shared answer cache. That covers reading or writing
            # the active strategy this turn (strategy_touched), AND any
            # workflow-state read tool firing (workflow_state_touched), since
            # those responses are grounded in the asking user's own data.
            allow_answer_cache = not (
                bool(active_strategy)
                or tool_context.get("strategy_touched")
                or tool_context.get("workflow_state_touched")
            )
            self._populate_caches(
                tool_call, message, embedding, uid,
                allow_answer_cache=allow_answer_cache,
            )
            # If the strategy helpers wrote a new active strategy this turn,
            # stamp it on the current chat so the sidebar's strategy dot
            # reflects the swap. Reuse the plan_payload we already pulled when
            # available to avoid a second Firestore read.
            if uid and chat_id and tool_context.get("strategy_touched"):
                try:
                    new_strategy_id = (plan_payload or {}).get("strategy_id")
                    if not new_strategy_id:
                        new_strategy = await asyncio.to_thread(get_active_strategy, uid)
                        new_strategy_id = (new_strategy or {}).get("id")
                    await asyncio.to_thread(
                        chat_set_active_strategy, uid, chat_id, new_strategy_id,
                    )
                except Exception as e:
                    print(f"[ScoutChat] strategy stamp failed: {e}")

            await self._persist_assistant_turn(
                uid=uid, chat_id=chat_id, result=result, tool_call=tool_call,
                helper_calls=helper_calls, helper_results=helper_results,
                metrics_data={
                    "served_by": "llm",
                    "tier_used": tier,
                    "input_tokens": usage.get("input_tokens", 0),
                    "cached_input_tokens": usage.get("cached_input_tokens", 0),
                    "output_tokens": usage.get("output_tokens", 0),
                    "near_miss_cosine": near_miss,
                },
            )
            self._attach_chat_id(result, chat_id)
            self._log_turn("llm", turn_start, result, message,
                           usage=usage, near_miss=near_miss)
            return result
        except Exception as e:
            print(f"[ScoutAssistant] Error: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            # Drop the background classifier so it does not log a stray
            # warning when the rest of the turn tears down.
            if intent_task is not None and not intent_task.done():
                intent_task.cancel()
            result = {
                "tool": "answer",
                "message": f"I'm having a moment! {random.choice(_ERROR_RECOVERY_LINES)}",
                "navigate": None,
                "mode": "chat",
            }
            # We do not persist a fallback error message: it carries no useful
            # content for the next turn and would clutter the resumed thread.
            self._attach_chat_id(result, chat_id)
            self._log_turn("llm", turn_start, result, message, near_miss=near_miss)
            return result

    def _greeting_response(
        self,
        user_name: str,
        active_strategy: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Opening message when the user opens Scout with no input yet.

        When the user has an active strategy, the greeting names it instead of
        starting from zero. That is the most visible payoff of strategy memory:
        a returning user is picked up where they left off.
        """
        name = f", {user_name}" if user_name and user_name != "there" else ""
        goal = (active_strategy or {}).get("goal", "").strip()
        if goal:
            message = (
                f"Hey{name}, picking up where we left off. Your active plan is "
                f"to {goal[0].lower() + goal[1:] if goal[:1].isupper() else goal}. "
                "Want to keep moving on that, or work on something else?"
            )
        else:
            message = f"Hey{name}! I'm Scout. What are you trying to get done?"
        return {
            "tool": "answer",
            "message": message,
            "navigate": None,
            "mode": "chat",
            "intent": None,
            "cta": None,
            "plan": None,
        }

    async def _fetch_active_strategy(
        self, uid: Optional[str]
    ) -> Optional[Dict[str, Any]]:
        """Best-effort fetch of the user's active strategy.

        Runs the sync Firestore read on a thread so it never blocks the event
        loop. Any error degrades to None and the turn proceeds without
        strategy context.
        """
        if not uid:
            return None
        try:
            return await asyncio.to_thread(get_active_strategy, uid)
        except Exception as e:
            print(f"[ScoutStrategy] fetch failed: {type(e).__name__}: {e}")
            return None

    # ========================================================================
    # CHAT PERSISTENCE (Phase 5 Stage 3)
    # ========================================================================
    #
    # The chat thread lives in Firestore at users/{uid}/scoutChats/{chat_id}
    # with a messages subcollection. Methods below are best-effort: a write
    # failure does not abort the turn, it just leaves that turn out of the
    # persisted thread. A read failure degrades to an empty history; the
    # response still goes through.

    # Per-turn budget for the LLM context window. The full transcript stays in
    # Firestore; only this slice rides into the model. Whichever cap hits
    # first wins (the older messages are dropped).
    CONTEXT_MESSAGE_CAP = 20
    CONTEXT_TOKEN_CAP = 8000

    async def _ensure_chat(
        self,
        *,
        uid: str,
        tier: str,
        chat_id: Optional[str],
        active_strategy: Optional[Dict[str, Any]],
    ) -> Tuple[Optional[str], bool]:
        """Return (chat_id, is_first_turn). Creates a new chat when needed.

        When the caller passes an existing chat_id we keep it; the first-turn
        flag fires only on a freshly created chat so title generation runs
        exactly once per chat.
        """
        if chat_id:
            return chat_id, False
        strategy_id = (active_strategy or {}).get("id")
        try:
            res = await asyncio.to_thread(
                chat_create_chat, uid, tier, strategy_id,
            )
        except Exception as e:
            print(f"[ScoutChat] create failed: {type(e).__name__}: {e}")
            return None, False
        if not res.get("ok"):
            print(f"[ScoutChat] create returned not-ok: {res.get('error')}")
            return None, False
        return res.get("chat_id"), True

    async def _append_chat_message(
        self,
        *,
        uid: str,
        chat_id: str,
        role: str,
        content: str,
        tool_calls: Optional[List[Dict[str, Any]]] = None,
        tool_results: Optional[List[Dict[str, Any]]] = None,
        metrics_data: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Best-effort append. Logs but never raises."""
        try:
            await asyncio.to_thread(
                chat_append_message, uid, chat_id, role, content,
                tool_calls, tool_results, metrics_data,
            )
        except Exception as e:
            print(f"[ScoutChat] append failed: {type(e).__name__}: {e}")

    async def _load_history_window(
        self,
        *,
        uid: str,
        chat_id: str,
        current_user_message: str,
    ) -> List[Dict[str, str]]:
        """Load the chat from Firestore and return the windowed context.

        Windowing: take the last CONTEXT_MESSAGE_CAP messages, then walk
        backward summing a rough token estimate (len/4) until CONTEXT_TOKEN_CAP
        is reached. Whichever cap fires first wins. The just-appended user
        message is dropped from the tail so the caller can add it explicitly
        with the live-context block attached.
        """
        try:
            res = await asyncio.to_thread(chat_get_chat, uid, chat_id)
        except Exception as e:
            print(f"[ScoutChat] history load failed: {type(e).__name__}: {e}")
            return []
        messages = res.get("messages") or []
        if not messages:
            return []
        # Drop the just-appended user message at the tail. We compare by role
        # and (trimmed) content rather than message_id since the route-level
        # caller has no id to pass back here.
        if messages and messages[-1].get("role") == "user":
            tail_content = (messages[-1].get("content") or "").strip()
            if tail_content == (current_user_message or "").strip():
                messages = messages[:-1]
        if not messages:
            return []

        # Apply the count cap from the newest end.
        tail = messages[-self.CONTEXT_MESSAGE_CAP:]
        # Apply the token cap, walking from newest back. Cheap len/4 estimate
        # matches what _log_turn uses elsewhere.
        budget = self.CONTEXT_TOKEN_CAP
        kept_reversed: List[Dict[str, str]] = []
        for msg in reversed(tail):
            content = (msg.get("content") or "").strip()
            if not content:
                continue
            est_tokens = max(1, len(content) // 4)
            if est_tokens > budget and kept_reversed:
                break
            budget -= est_tokens
            kept_reversed.append({"role": msg.get("role", "user"), "content": content})
        kept_reversed.reverse()
        return kept_reversed

    def _window_client_history(
        self, conversation_history: List[Dict[str, str]],
    ) -> List[Dict[str, str]]:
        """Fallback windowing for unauthenticated chats.

        Mirrors the previous in-memory behavior: last 6 turns. No persisted
        thread means no Firestore read; the client carries the history.
        """
        out: List[Dict[str, str]] = []
        for msg in conversation_history[-6:]:
            role = msg.get("role", "user")
            content = (msg.get("content") or "").strip()
            if role in ("user", "assistant") and content:
                out.append({"role": role, "content": content})
        return out

    async def _persist_assistant_turn(
        self,
        *,
        uid: Optional[str],
        chat_id: Optional[str],
        result: Dict[str, Any],
        tool_call: Dict[str, Any],
        helper_calls: Optional[List[Dict[str, Any]]],
        helper_results: Optional[List[Dict[str, Any]]],
        metrics_data: Dict[str, Any],
    ) -> None:
        """Persist the assistant turn (terminal tool + helper trail + metrics).

        No-op when chat persistence is not available for this turn (anonymous
        user or chat creation failed). The terminal tool is stored alongside
        any helper calls under tool_calls; tool_results carries the helper
        results so a resumed view can render what Scout actually did.
        """
        if not uid or not chat_id:
            return
        # The assistant content is whatever the user actually sees; the
        # terminal-tool args (route, prefill, etc.) are the structured side.
        content = result.get("message") or ""
        terminal_entry = {"name": tool_call.get("name"), "args": tool_call.get("args", {})}
        if result.get("navigate") is not None:
            terminal_entry["navigate"] = result["navigate"]
        combined_calls: List[Dict[str, Any]] = list(helper_calls or []) + [terminal_entry]
        combined_results: Optional[List[Dict[str, Any]]] = (
            list(helper_results) if helper_results else None
        )
        await self._append_chat_message(
            uid=uid,
            chat_id=chat_id,
            role="assistant",
            content=content,
            tool_calls=combined_calls,
            tool_results=combined_results,
            metrics_data=metrics_data,
        )

    def _attach_chat_id(self, result: Dict[str, Any], chat_id: Optional[str]) -> None:
        """Stamp chat_id on the response so the frontend can track the thread."""
        result["chat_id"] = chat_id

    async def _generate_title_in_background(
        self, uid: str, chat_id: str, first_message: str,
    ) -> None:
        """Summarize the first user message into a sidebar title.

        Runs as an asyncio task so the user-facing turn does not wait. The
        chat already carries a "New chat" default, so a slow or failed title
        write degrades to that. The LLM call uses the same model and the
        async OpenAI client the rest of the service uses.
        """
        try:
            from app.services.scout.chat_persistence import (
                _is_trivial_first_message, _truncate_for_title, _strip_em_dashes,
                MAX_TITLE_LEN,
            )
            if _is_trivial_first_message(first_message):
                title = _truncate_for_title(first_message) if first_message.strip() else "New chat"
            else:
                client = self._get_openai()
                resp = await asyncio.wait_for(
                    client.chat.completions.create(
                        model=self.DEFAULT_MODEL,
                        messages=[
                            {"role": "system", "content": "You write short, concrete chat titles."},
                            {
                                "role": "user",
                                "content": (
                                    "Summarize the following user message into a short chat title "
                                    "(under 60 characters, no quotes, no trailing period, no em "
                                    f"dashes). Name the goal or topic. Message: {first_message[:400]}"
                                ),
                            },
                        ],
                        temperature=0.2,
                        max_tokens=30,
                    ),
                    timeout=10.0,
                )
                raw = (resp.choices[0].message.content or "").strip().strip('"').strip("'").rstrip(".")
                title = _strip_em_dashes(raw) or _truncate_for_title(first_message)
                if len(title) > MAX_TITLE_LEN:
                    title = title[: MAX_TITLE_LEN - 3].rstrip() + "..."
            await asyncio.to_thread(chat_update_chat_title, uid, chat_id, title)
        except Exception as e:
            print(f"[ScoutChat] title gen failed: {type(e).__name__}: {e}")

    async def _call_scout_tools(
        self,
        messages: List[Dict[str, Any]],
        context: Optional[Dict[str, Any]] = None,
        event_emitter: Optional[Any] = None,
    ) -> Tuple[Dict[str, Any], Dict[str, int], List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Run one Scout turn and return (terminal tool, usage, helper_calls, helper_results).

        The tool is {name, args}. The usage dict sums tokens across every LLM
        call in the chain: {input_tokens, cached_input_tokens, output_tokens}.
        helper_calls and helper_results are the trail of any non-terminal
        tools the model invoked this turn (each entry is {name, args} or
        {name, result}); they get persisted on the assistant message so a
        resumed chat can show what Scout actually did, not just what it said.

        Each step the model calls exactly one tool (parallel_tool_calls=False,
        tool_choice="required"). It may call helper tools (parse_job_url,
        save_strategy, update_strategy_progress) to gather data or write
        memory; their results are fed back and the loop continues. The final
        step is offered only the terminal tools, so a turn always ends on
        exactly one of navigate / answer / clarify.

        `context` is the per-turn state helpers may need (uid, tier, chat_id).
        Strategy helpers also set context["strategy_touched"] on a successful
        write, so handle_chat can refuse to cache an answer that wrote to
        user memory.
        """
        client = self._get_openai()
        convo: List[Dict[str, Any]] = list(messages)
        MAX_STEPS = 4  # at most a few helper calls, then a forced terminal tool
        usage = {"input_tokens": 0, "cached_input_tokens": 0, "output_tokens": 0}
        helper_calls: List[Dict[str, Any]] = []
        helper_results: List[Dict[str, Any]] = []

        for step in range(MAX_STEPS):
            final_step = step == MAX_STEPS - 1
            response = await asyncio.wait_for(
                client.chat.completions.create(
                    model=self.DEFAULT_MODEL,
                    messages=convo,
                    temperature=0.3,
                    max_tokens=600,
                    tools=to_openai_tools(terminal_only=final_step),
                    tool_choice="required",
                    parallel_tool_calls=False,
                ),
                timeout=25.0,
            )
            u = getattr(response, "usage", None)
            self._log_token_usage(f"handle_chat[step={step}]", u)
            if u is not None:
                usage["input_tokens"] += getattr(u, "prompt_tokens", 0) or 0
                usage["output_tokens"] += getattr(u, "completion_tokens", 0) or 0
                details = getattr(u, "prompt_tokens_details", None)
                usage["cached_input_tokens"] += getattr(details, "cached_tokens", 0) or 0

            message = response.choices[0].message
            tool_calls = message.tool_calls or []
            if not tool_calls:
                # tool_choice="required" should make this unreachable.
                return (
                    {"name": "answer", "args": {"text": "Could you say that another way?"}},
                    usage, helper_calls, helper_results,
                )

            call = tool_calls[0]
            try:
                args = json.loads(call.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            if not isinstance(args, dict):
                args = {}
            name = call.function.name

            if name in TERMINAL_TOOL_NAMES:
                return {"name": name, "args": args}, usage, helper_calls, helper_results

            if name in HELPER_TOOL_NAMES:
                # Live narration (Change 1): announce the tool the instant we
                # know its name, then a closing event with a compact summary.
                tool_event_id = f"t{step}-{name}"
                self._emit(event_emitter, "tool_start", {
                    "id": tool_event_id,
                    "name": name,
                    "label": self._tool_label(name, args),
                })
                result = await run_helper_tool(name, args, context)
                helper_calls.append({"name": name, "args": args})
                helper_results.append({"name": name, "result": result})
                self._emit(event_emitter, "tool_end", {
                    "id": tool_event_id,
                    "name": name,
                    "summary": self._tool_result_summary(name, result),
                })
                # Echo the model's tool call, then feed the result back so the
                # next step can use it.
                convo.append({
                    "role": "assistant",
                    "content": message.content or None,
                    "tool_calls": [{
                        "id": call.id,
                        "type": "function",
                        "function": {
                            "name": name,
                            "arguments": call.function.arguments or "{}",
                        },
                    }],
                })
                convo.append({
                    "role": "tool",
                    "tool_call_id": call.id,
                    "content": json.dumps(result),
                })
                continue

            # Unknown tool name: degrade to a safe answer.
            return (
                {"name": "answer", "args": {"text": "Could you say that another way?"}},
                usage, helper_calls, helper_results,
            )

        # Steps exhausted without a terminal tool (the final step is
        # terminal-only, so this should not happen). Degrade safely.
        return (
            {"name": "answer", "args": {"text": "Could you say that another way?"}},
            usage, helper_calls, helper_results,
        )

    def _log_turn(
        self,
        served_by: str,
        turn_start: float,
        result: Dict[str, Any],
        message: str,
        usage: Optional[Dict[str, int]] = None,
        near_miss: Optional[float] = None,
    ) -> None:
        """Record one Scout turn's metrics. Best-effort; never raises."""
        try:
            latency_ms = (time.time() - turn_start) * 1000.0
            kwargs: Dict[str, Any] = {
                "served_by": served_by,
                "latency_ms": latency_ms,
                "final_tool": result.get("tool", "answer"),
                "near_miss_cosine": near_miss,
            }
            # Every non-regex turn embedded the message once (Tier B). Embedding
            # cost is negligible; estimate tokens from message length.
            if served_by != "regex":
                kwargs["embed_tokens"] = max(1, len(message) // 4)
            if usage is not None:
                kwargs["model"] = self.DEFAULT_MODEL
                kwargs["input_tokens"] = usage.get("input_tokens", 0)
                kwargs["cached_input_tokens"] = usage.get("cached_input_tokens", 0)
                kwargs["output_tokens"] = usage.get("output_tokens", 0)
            metrics.log_turn(**kwargs)
        except Exception as e:
            print(f"[ScoutMetrics] log_turn failed: {e}")

    def _populate_caches(
        self,
        tool_call: Dict[str, Any],
        message: str,
        embedding: Optional[List[float]],
        uid: Optional[str],
        allow_answer_cache: bool = True,
    ) -> None:
        """Feed an LLM result into the Tier B promotion buffers.

        Only empty-prefill navigations (confidence >= 0.85) and answers are
        eligible; a navigate carrying message-specific prefill is not cached,
        and clarify is never cached. When the turn involved the user's
        strategy (read or written), allow_answer_cache is False and the
        answer-cache promotion is skipped, since that answer is user-specific
        and must not be served to anyone else. Best-effort; never raises.
        """
        if embedding is None:
            return
        try:
            name = tool_call.get("name")
            args = tool_call.get("args", {}) or {}
            if name == "navigate":
                if args.get("prefill"):
                    return  # message-specific prefill; not safe to cache
                try:
                    confidence = float(args.get("confidence", 0))
                except (TypeError, ValueError):
                    confidence = 0.0
                if confidence < 0.85:
                    return
                promoted = pending_navigate.note(embedding, tool_call, message, uid or "")
                if promoted is not None:
                    emb, plan, intent = promoted
                    navigate_cache.add(emb, plan, intent)
            elif name == "answer" and allow_answer_cache:
                promoted = pending_answer.note(embedding, tool_call, message, uid or "")
                if promoted is not None:
                    emb, plan, intent = promoted
                    answer_cache.add(emb, plan, intent)
        except Exception as e:
            print(f"[ScoutCache] populate failed: {e}")

    def _build_tool_response(
        self,
        tool_call: Dict[str, Any],
        current_page: str,
        intent: Optional[Dict[str, Any]] = None,
        plan: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Turn the model's tool call into the response the frontend consumes.

        Shape:
          { "tool": "navigate"|"answer"|"clarify",
            "message": str,
            "navigate": {...}|None,
            "mode": "chat"|"plan"|"do"|"clarify",
            "intent": {...}|None,
            "cta": {...}|None,
            "plan": {...}|None }

        For navigate, the nested object also carries everything the frontend
        approve-flow rules need (credit_spending, already_on_page,
        missing_required) so the frontend does not need the registry.
        mode (Change 7) shapes the visible "chat / plan / do / clarify" pill
        and overrides the legacy frontend skip-approve heuristic.
        cta (Change 6) is the single end-of-message bridge chip.
        plan (Change 5) is the freshly-saved strategy when this turn wrote one.
        """
        name = tool_call.get("name", "answer")
        args = tool_call.get("args", {}) or {}

        # Strip em dashes from every model-authored string before it reaches the
        # user. House style bans U+2014; a prompt instruction is not a guarantee.
        for _key in ("reasoning", "text", "question"):
            if isinstance(args.get(_key), str):
                args[_key] = _strip_em_dashes(args[_key])

        mode_payload = self._mode_payload(intent, tool_call)
        mode = mode_payload["mode"]

        if name == "navigate":
            route = (args.get("route") or "").strip()
            page = get_page(route)
            if not page:
                # Model picked a route outside the registry: degrade to answer.
                return {
                    "tool": "answer",
                    "message": args.get("reasoning")
                    or "I'm not sure where to take you for that. Can you say more?",
                    "navigate": None,
                    "mode": "chat",
                    "intent": intent,
                    "cta": None,
                    "plan": plan,
                }
            allowed = set(page.get("inputs") or [])
            prefill = {
                k: str(v).strip()
                for k, v in (args.get("prefill") or {}).items()
                if k in allowed and str(v).strip() and _prefill_value_ok(k, v)
            }
            missing_required = [
                f for f in (page.get("required_inputs") or []) if f not in prefill
            ]
            imperative = bool(args.get("user_was_imperative", False))

            # If the model proposed a navigate but a required field is missing
            # and the user did not explicitly command the navigation, ask for
            # the missing detail instead of dropping them on an empty page.
            if missing_required and not imperative:
                return {
                    "tool": "clarify",
                    "message": self._clarify_for_missing(missing_required),
                    "navigate": None,
                    "mode": "clarify",
                    "intent": intent,
                    "cta": None,
                    "plan": plan,
                }

            try:
                confidence = max(0.0, min(1.0, float(args.get("confidence", 0.5))))
            except (TypeError, ValueError):
                confidence = 0.5
            # auto_submit is honored only by routes that opt in via their page
            # registry entry; for everything else it is silently ignored so the
            # model can set it without breaking unrelated pages.
            auto_submit = bool(args.get("auto_submit", False))
            if auto_submit and not page.get("auto_submit_supported", False):
                auto_submit = False
            return {
                "tool": "navigate",
                "message": args.get("reasoning") or "",
                "navigate": {
                    "route": page["route"],
                    "prefill": prefill,
                    "reasoning": args.get("reasoning") or "",
                    "confidence": confidence,
                    "user_was_imperative": imperative,
                    "auto_submit": auto_submit,
                    "credit_spending": page.get("credit_cost") is not None,
                    "credit_cost": page.get("credit_cost"),
                    "missing_required": missing_required,
                    "already_on_page": current_page.split("?")[0].rstrip("/") == page["route"],
                },
                "mode": mode,
                "intent": intent,
                "cta": None,
                "plan": plan,
            }

        if name == "clarify":
            return {
                "tool": "clarify",
                "message": args.get("question")
                or "Could you tell me a bit more about what you need?",
                "navigate": None,
                "mode": "clarify",
                "intent": intent,
                "cta": None,
                "plan": plan,
            }

        # answer (default / fallback). Validate cta if present.
        cta = self._sanitize_cta(args.get("cta"))
        # plan mode: if Haiku flagged plan but no plan was saved this turn,
        # leave plan as the inbound value (may be None when the model talked
        # planning without calling save_strategy).
        return {
            "tool": "answer",
            "message": args.get("text")
            or "I'm not sure how to help with that. Could you rephrase?",
            "navigate": None,
            "mode": mode,
            "intent": intent,
            "cta": cta,
            "plan": plan,
        }

    def _sanitize_cta(self, raw: Any) -> Optional[Dict[str, Any]]:
        """Validate the answer.cta payload (Change 6).

        Drops the chip when its route is not in the page registry, when label
        is empty, or when prefill carries bad shape values. Returns None when
        nothing usable remains, so the frontend can simply check `cta` for
        truthiness.
        """
        if not isinstance(raw, dict):
            return None
        label = str(raw.get("label") or "").strip()
        route = str(raw.get("route") or "").strip()
        if not label or not route:
            return None
        page = get_page(route)
        if not page:
            return None
        allowed = set(page.get("inputs") or [])
        prefill_in = raw.get("prefill") or {}
        if not isinstance(prefill_in, dict):
            prefill_in = {}
        prefill = {
            k: str(v).strip()
            for k, v in prefill_in.items()
            if k in allowed and str(v).strip() and _prefill_value_ok(k, v)
        }
        return {
            "label": _strip_em_dashes(label)[:140],
            "route": page["route"],
            "prefill": prefill,
            "credit_spending": page.get("credit_cost") is not None,
            "credit_cost": page.get("credit_cost"),
        }

    def _clarify_for_missing(self, missing: List[str]) -> str:
        """Phrase a natural-language clarify question for missing required fields.

        References the field in plain language, never the raw field name.
        """
        phrasing = {
            "linkedin_url": "the LinkedIn URL for the person you're meeting with",
            "company": "which company you have in mind",
            "job_title": "which role you're looking for",
            "location": "which location you're focused on",
        }
        phrases = [phrasing.get(f, f.replace("_", " ")) for f in missing]
        if len(phrases) == 1:
            return f"Can you share {phrases[0]}?"
        joined = ", ".join(phrases[:-1]) + f" and {phrases[-1]}"
        return f"Can you share {joined}?"

    def _log_token_usage(self, label: str, usage: Any) -> None:
        """Log OpenAI token counts, including automatic prefix-cache hits."""
        try:
            if usage is None:
                return
            prompt = getattr(usage, "prompt_tokens", 0) or 0
            completion = getattr(usage, "completion_tokens", 0) or 0
            details = getattr(usage, "prompt_tokens_details", None)
            cached = getattr(details, "cached_tokens", 0) or 0
            hit = (cached / prompt * 100) if prompt else 0.0
            print(
                f"[ScoutCache] {label}: prompt={prompt} cached={cached} "
                f"completion={completion} hit_rate={hit:.0f}%"
            )
        except Exception as e:
            print(f"[ScoutCache] {label}: usage log failed: {e}")


    # ========================================================================
    # INTENT CLASSIFIER (Haiku)
    # ========================================================================

    _INTENT_SYSTEM_PROMPT = (
        "You classify a user's intent in a recruiting AI assistant. Return "
        "STRICT JSON only, no prose, no code fence. Schema:\n"
        '{"intent": "chat"|"plan"|"do"|"clarify", '
        '"confidence": 0.0-1.0, '
        '"missing_fields": [string], '
        '"reason": "short string"}\n\n'
        "Rules:\n"
        "- do: imperative verb + a complete object (named company AND/OR role "
        "AND/OR location), or a clearly directive command. "
        '"find PMs at Stripe", "email Goldman recruiters", '
        '"draft a cover letter for X", "take me to firm search".\n'
        "- plan: a goal that needs more than one step, without a single "
        "immediate action. "
        '"I want to land MBB by fall", "help me plan recruiting", '
        '"walk me through a 3-month strategy".\n'
        "- chat: questions, exploration, thinking out loud, meta. "
        '"how does X work", "is it worth", "I am not sure", '
        '"what time is it", "tell me about consulting".\n'
        "- clarify: would be do, but a required field is missing. "
        '"prep me for tomorrow" with no person / LinkedIn URL.\n\n'
        "confidence: 0.9+ unambiguous, 0.7-0.9 strong, below 0.7 uncertain.\n"
        "missing_fields: short string keys the user did NOT supply "
        '(e.g. ["company"], ["linkedin_url"]). Empty list when nothing is '
        "missing."
    )

    async def _classify_intent_with_haiku(
        self,
        *,
        message: str,
        history: Optional[List[Dict[str, str]]],
        current_page: str,
    ) -> Optional[Dict[str, Any]]:
        """Fast intent classifier returning {intent, confidence, missing_fields, reason}.

        Runs concurrently with the main response path. Falls back to None on
        any failure (no Anthropic key, timeout, parse error); callers then
        rely on the model's own user_was_imperative + confidence as before.
        """
        client = get_async_anthropic_client()
        if client is None:
            return None
        snippet = ""
        if history:
            lines = []
            for m in history[-3:]:
                role = m.get("role", "user")
                content = (m.get("content") or "")[:300]
                if content:
                    lines.append(f"{role}: {content}")
            if lines:
                snippet = "\n".join(lines)
        user_block = f"current_page: {current_page}\n"
        if snippet:
            user_block += f"recent_turns:\n{snippet}\n"
        user_block += f"\nuser_message: {message[:600]}"
        try:
            resp = await asyncio.wait_for(
                client.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=200,
                    system=self._INTENT_SYSTEM_PROMPT,
                    messages=[{"role": "user", "content": user_block}],
                ),
                timeout=4.0,
            )
        except Exception as e:
            print(f"[ScoutIntent] haiku call failed: {type(e).__name__}: {e}")
            return None
        # Extract first text block. The SDK returns a list of content blocks.
        raw = ""
        try:
            for block in (resp.content or []):
                if getattr(block, "type", None) == "text":
                    raw = (block.text or "").strip()
                    break
        except Exception:
            raw = ""
        if not raw:
            return None
        try:
            parsed = json.loads(raw)
        except Exception:
            # Strip a stray markdown fence if the model wrapped JSON despite
            # being told not to.
            cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            try:
                parsed = json.loads(cleaned)
            except Exception as e:
                print(f"[ScoutIntent] parse failed: {e}; raw={raw[:200]!r}")
                return None
        intent = parsed.get("intent")
        if intent not in ("chat", "plan", "do", "clarify"):
            return None
        try:
            confidence = float(parsed.get("confidence") or 0.0)
        except (TypeError, ValueError):
            confidence = 0.0
        missing = parsed.get("missing_fields") or []
        if not isinstance(missing, list):
            missing = []
        missing = [str(x)[:40] for x in missing[:6] if isinstance(x, (str, int, float))]
        return {
            "intent": intent,
            "confidence": max(0.0, min(1.0, confidence)),
            "missing_fields": missing,
            "reason": str(parsed.get("reason") or "")[:200],
        }

    async def _await_intent(
        self, task: Optional[asyncio.Task],
    ) -> Optional[Dict[str, Any]]:
        """Await the background Haiku classifier with a hard cap.

        Returns None on cancellation, timeout, or any error. The cap is
        intentionally aggressive: a slow Haiku call must not slow the whole
        turn down past the user's perceived latency budget.
        """
        if task is None:
            return None
        try:
            return await asyncio.wait_for(asyncio.shield(task), timeout=3.5)
        except asyncio.TimeoutError:
            print("[ScoutIntent] await timeout, falling back")
            return None
        except Exception as e:
            print(f"[ScoutIntent] await failed: {type(e).__name__}: {e}")
            return None

    def _mode_payload(
        self,
        intent: Optional[Dict[str, Any]],
        tool_call: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Build the {mode, confidence, reason} payload for the mode SSE event.

        Falls back to inferring mode from the terminal tool when the Haiku
        classifier did not return (no key, timeout, parse error).
        """
        if intent and intent.get("intent"):
            return {
                "mode": intent["intent"],
                "confidence": intent.get("confidence", 0.0),
                "reason": intent.get("reason", ""),
                "source": "haiku",
            }
        name = (tool_call or {}).get("name") if tool_call else None
        fallback_mode = {
            "navigate": "do",
            "clarify": "clarify",
            "answer": "chat",
        }.get(name or "", "chat")
        return {
            "mode": fallback_mode,
            "confidence": 0.0,
            "reason": "intent classifier unavailable",
            "source": "fallback",
        }

    # ------------------------------------------------------------------------
    # Live tool-call narration (Change 1)
    # ------------------------------------------------------------------------

    _TOOL_LABELS: Dict[str, str] = {
        "get_outbox_status": "Reading your outbox",
        "get_recent_searches": "Checking your recent searches",
        "get_recent_firm_searches": "Checking your firm searches",
        "get_recent_cover_letters": "Checking your cover letters",
        "get_meeting_prep_drafts": "Checking your meeting preps",
        "save_strategy": "Saving your plan",
        "update_strategy_progress": "Updating your plan",
        "parse_job_url": "Reading the job posting",
    }

    def _tool_label(self, name: str, args: Dict[str, Any]) -> str:
        """Human-readable label for the live tool-call pill (Change 1).

        Returns a present-continuous phrase the UI shows while the tool runs:
        'Reading your outbox', 'Saving your plan'.
        """
        return self._TOOL_LABELS.get(name, f"Working on {name}")

    def _tool_result_summary(
        self, name: str, result: Dict[str, Any],
    ) -> str:
        """One-line compact summary the UI collapses the live pill to (Change 1).

        Keep it specific over generic: counts and named entities beat
        aggregates. Falls back to a neutral 'done' when nothing useful is in
        the payload.
        """
        if not isinstance(result, dict):
            return "done"
        if name == "get_outbox_status":
            total = result.get("total_contacts") or 0
            awaiting = result.get("awaiting_reply") or 0
            replied = result.get("replied") or 0
            return f"{total} contacts, {awaiting} awaiting, {replied} replied"
        if name in ("get_recent_searches", "get_recent_firm_searches",
                    "get_recent_cover_letters", "get_meeting_prep_drafts"):
            count = result.get("count")
            if count is None:
                recent = result.get("recent") or []
                count = len(recent) if isinstance(recent, list) else 0
            label_short = {
                "get_recent_searches": "searches",
                "get_recent_firm_searches": "firm searches",
                "get_recent_cover_letters": "cover letters",
                "get_meeting_prep_drafts": "meeting preps",
            }.get(name, "items")
            return f"{count} {label_short}"
        if name == "save_strategy":
            if result.get("ok"):
                return "plan saved"
            return result.get("error") or "save failed"
        if name == "update_strategy_progress":
            if result.get("ok"):
                return "plan updated"
            return result.get("error") or "update failed"
        if name == "parse_job_url":
            company = result.get("company") or ""
            title = result.get("job_title") or ""
            parts = [p for p in (title, company) if p]
            return " at ".join(parts) if parts else "could not parse"
        return "done"

    # ------------------------------------------------------------------------
    # Plan payload (Change 5)
    # ------------------------------------------------------------------------

    def _strategy_to_plan_payload(
        self, strategy: Optional[Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        """Compact plan shape for inline checklist rendering.

        The frontend turns each step into a checkbox row with an optional
        'Do this' button when the step carries a route.
        """
        if not strategy:
            return None
        goal = (strategy.get("goal") or "").strip()
        steps_in = strategy.get("steps") or []
        if not goal or not isinstance(steps_in, list):
            return None
        steps_out: List[Dict[str, Any]] = []
        for idx, step in enumerate(steps_in, start=1):
            if not isinstance(step, dict):
                continue
            title = (step.get("title") or "").strip()
            if not title:
                continue
            steps_out.append({
                "index": idx,
                "title": title[:200],
                "detail": (step.get("detail") or "").strip()[:600] or None,
                "route": (step.get("route") or "").strip() or None,
                "done": bool(step.get("done")),
            })
        if not steps_out:
            return None
        return {
            "strategy_id": strategy.get("id"),
            "goal": goal,
            "steps": steps_out,
        }

    # ------------------------------------------------------------------------
    # SSE event emit helper
    # ------------------------------------------------------------------------

    def _emit(
        self, emitter: Optional[Any], event: str, data: Dict[str, Any],
    ) -> None:
        """Best-effort fire-and-forget emit. Schedules the async emitter so
        callers never have to await; never raises.

        Works in two shapes: an awaitable callable (the streaming shim) or a
        plain callable that already handles the queue write. None disables it.
        """
        if emitter is None:
            return
        try:
            coro = emitter(event, data)
            if asyncio.iscoroutine(coro):
                asyncio.create_task(coro)
        except Exception as e:
            print(f"[ScoutEmit] emit failed for {event}: {e}")

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
        chat_id: Optional[str] = None,
        queue: "asyncio.Queue[Optional[Dict[str, Any]]]" = None,
    ) -> None:
        """SSE shim for the /chat/stream route.

        Scout's tool-call response is structured, not a token stream, so this
        runs handle_chat and emits the result as a single 'done' event. It runs
        in a background thread with its own event loop, so it creates a fresh
        OpenAI client that handle_chat picks up via _get_openai().

        The /chat/stream route and this shim are retired once the frontend
        moves to the plain /chat endpoint (Phase 3).
        """
        # Fresh client bound to this thread's event loop.
        self._stream_openai = create_async_openai_client()

        async def _emitter(event: str, data: Dict[str, Any]) -> None:
            """SSE bridge for live tool-call narration and mode pill.
            handle_chat calls this synchronously via self._emit; the awaited
            queue.put runs on this loop and races the main turn."""
            try:
                await queue.put({"event": event, "data": data})
            except Exception as e:
                print(f"[ScoutStream] emitter failed: {e}")

        try:
            result = await self.handle_chat(
                message=message,
                conversation_history=conversation_history,
                current_page=current_page,
                user_name=user_name,
                tier=tier,
                credits=credits,
                max_credits=max_credits,
                user_context=user_context,
                user_memory=user_memory,
                uid=uid,
                chat_id=chat_id,
                event_emitter=_emitter,
            )
            await queue.put({"event": "done", "data": result})
        except Exception as e:
            print(f"[ScoutAssistant] Stream error: {type(e).__name__}: {e}")
            await queue.put({"event": "error", "data": {"message": "Something went wrong. Try again!"}})
        finally:
            await queue.put(None)  # Signal end

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

