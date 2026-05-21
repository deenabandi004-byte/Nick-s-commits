"""Scout PAGE_REGISTRY: the single source of truth for every page Scout can
navigate a user to.

Phase 2 of the Scout consolidation. The registry drives three things:
  1. The "pages you can navigate to" section of Scout's system prompt
     (build_pages_prompt_section), so the prompt and the navigable route set
     can never drift apart.
  2. navigate tool-call validation (valid_routes, get_page).
  3. The approve-flow rules (required_inputs, credit_cost, tier_required).

Route strings match Scout's current knowledge (the legacy PAGES dict).
Reconciling legacy vs new route names (/contact-search vs /find, etc.) is
Phase 3 work, when Scout Chat is deleted and routing is unified.

Fields per entry:
  route            Path Scout navigates to.
  purpose          What the page does. Pulled verbatim from the existing Scout
                   prompt where one existed; terse and factual otherwise.
  inputs           Form field names Scout may prefill. These must match the
                   frontend form fields AND the scout_auto_populate
                   sessionStorage bridge. Empty when the page has no
                   Scout-prefillable form.
  required_inputs  Subset of inputs that must be present to navigate. Empty for
                   every page today: landing on a page never hard-requires a
                   field, the page accepts partial prefill. Kept as the hook
                   the clarify rule reads.
  send_user_here_when  Natural-language trigger, derived from ROUTE_KEYWORDS
                   and the page purpose.
  credit_cost      Credits the page's own action charges (per result/use), or
                   None when the page has no credit-spending action. Scout
                   never spends credits; this tells the approve flow whether a
                   credit-spending action is implied.
  tier_required    Minimum tier to use the page ("pro"/"elite"), or None for
                   all tiers.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

# Each entry is a plain dict so the registry is trivially serializable and easy
# to diff. See module docstring for the field contract.
PAGE_REGISTRY: List[Dict[str, Any]] = [
    {
        "route": "/dashboard",
        "purpose": "Central hub for tracking networking progress, managing emails, and planning your recruiting timeline. Shows activity stats, streak counter, and weekly summary.",
        "inputs": [],
        "required_inputs": [],
        "send_user_here_when": "the user wants their home base, activity stats, streak, or a weekly overview of where things stand",
        "credit_cost": None,
        "tier_required": None,
    },
    {
        "route": "/contact-search",
        "purpose": "Find professionals at companies to network with. Enter job title, company, and location to discover contacts and generate personalized outreach emails.",
        "inputs": ["job_title", "company", "location"],
        "required_inputs": [],
        "send_user_here_when": "the user wants to find people, contacts, professionals, or alumni to network with or email",
        "credit_cost": 15,
        "tier_required": None,
    },
    {
        "route": "/firm-search",
        "purpose": "Discover companies and firms matching your criteria. Search by industry, location, and size.",
        "inputs": ["industry", "location", "size"],
        "required_inputs": [],
        "send_user_here_when": "the user wants to find or research companies, firms, or employers rather than individual people",
        "credit_cost": 5,
        "tier_required": "pro",
    },
    {
        "route": "/recruiter-spreadsheet",
        "purpose": "Find recruiters and hiring managers at target companies.",
        "inputs": ["company", "job_title", "location", "job_url"],
        "required_inputs": [],
        "send_user_here_when": "the user wants to find recruiters or hiring managers specifically",
        "credit_cost": 15,
        "tier_required": None,
    },
    {
        "route": "/meeting-prep",
        "purpose": "Generate comprehensive preparation materials for networking conversations. Includes talking points, questions, and company research.",
        "inputs": ["linkedin_url"],
        "required_inputs": ["linkedin_url"],
        "send_user_here_when": "the user has a networking call, coffee chat, or informational meeting coming up and wants to prepare",
        "credit_cost": 15,
        "tier_required": None,
    },
    {
        "route": "/interview-prep",
        "purpose": "Generate interview preparation guides based on job postings with real interview experiences from Reddit and online sources.",
        "inputs": ["company", "job_title", "job_url"],
        "required_inputs": [],
        "send_user_here_when": "the user has an interview coming up and wants to prepare for it",
        "credit_cost": 25,
        "tier_required": None,
    },
    {
        "route": "/meeting-library",
        "purpose": "Library of the meeting prep documents you have already generated.",
        "inputs": [],
        "required_inputs": [],
        "send_user_here_when": "the user wants to revisit or reread a meeting prep they generated earlier",
        "credit_cost": None,
        "tier_required": None,
    },
    {
        "route": "/write/resume",
        "purpose": "Score, fix, and tailor your resume for specific jobs. Manage your resume library.",
        "inputs": [],
        "required_inputs": [],
        "send_user_here_when": "the user wants to score, fix, tailor, or work on their resume",
        "credit_cost": None,
        "tier_required": None,
    },
    {
        "route": "/write/resume-library",
        "purpose": "Your saved resumes. Open, duplicate, or manage resume versions.",
        "inputs": [],
        "required_inputs": [],
        "send_user_here_when": "the user wants to find or manage a resume they saved earlier",
        "credit_cost": None,
        "tier_required": None,
    },
    {
        "route": "/write/cover-letter",
        "purpose": "Generate custom cover letters for job applications.",
        "inputs": ["company", "job_title", "job_url"],
        "required_inputs": [],
        "send_user_here_when": "the user wants to write or generate a cover letter",
        "credit_cost": 10,
        "tier_required": None,
    },
    {
        "route": "/write/cover-letter-library",
        "purpose": "Your saved cover letters.",
        "inputs": [],
        "required_inputs": [],
        "send_user_here_when": "the user wants to find or manage a cover letter they saved earlier",
        "credit_cost": None,
        "tier_required": None,
    },
    {
        "route": "/outbox",
        "purpose": "Manage your email threads and track responses. View drafts, sent emails, and replies.",
        "inputs": ["query"],
        "required_inputs": [],
        "send_user_here_when": "the user wants to see their email threads, drafts, sent mail, or replies",
        "credit_cost": 10,
        "tier_required": None,
    },
    {
        "route": "/calendar",
        "purpose": "View your personalized recruiting timeline with key dates and milestones.",
        "inputs": [],
        "required_inputs": [],
        "send_user_here_when": "the user asks about their recruiting timeline, key dates, deadlines, or schedule",
        "credit_cost": None,
        "tier_required": None,
    },
    {
        "route": "/contact-directory",
        "purpose": "View and manage all your saved contacts from previous searches.",
        "inputs": [],
        "required_inputs": [],
        "send_user_here_when": "the user wants to see or manage the contacts they have already saved",
        "credit_cost": None,
        "tier_required": None,
    },
    {
        "route": "/hiring-manager-tracker",
        "purpose": "Track hiring managers you've contacted.",
        "inputs": [],
        "required_inputs": [],
        "send_user_here_when": "the user wants to track the hiring managers they have reached out to",
        "credit_cost": None,
        "tier_required": None,
    },
    {
        "route": "/company-tracker",
        "purpose": "Track companies you're targeting.",
        "inputs": [],
        "required_inputs": [],
        "send_user_here_when": "the user wants to track the companies they are targeting",
        "credit_cost": None,
        "tier_required": None,
    },
    {
        "route": "/application-lab",
        "purpose": "Deep job fit analysis and application strengthening. Get detailed fit scores, resume edits, and cover letters.",
        "inputs": [],
        "required_inputs": [],
        "send_user_here_when": "the user wants a deep fit analysis of a specific job or wants to strengthen an application",
        "credit_cost": None,
        "tier_required": None,
    },
    {
        "route": "/job-board",
        "purpose": "Browse job listings, optimize your resume for specific jobs, generate cover letters, and find recruiters.",
        "inputs": ["query"],
        "required_inputs": [],
        "send_user_here_when": "the user wants to browse or search open job listings",
        "credit_cost": None,
        "tier_required": None,
    },
    {
        "route": "/email-templates",
        "purpose": "Create and manage reusable outreach email templates.",
        "inputs": [],
        "required_inputs": [],
        "send_user_here_when": "the user wants to create, edit, or manage their outreach email templates",
        "credit_cost": None,
        "tier_required": None,
    },
    {
        "route": "/pricing",
        "purpose": "View and manage your subscription. Compare Free, Pro, and Elite plans.",
        "inputs": [],
        "required_inputs": [],
        "send_user_here_when": "the user asks about plans, pricing, upgrading, or managing their subscription",
        "credit_cost": None,
        "tier_required": None,
    },
    {
        "route": "/account-settings",
        "purpose": "Manage your profile, upload resume, connect Gmail, and update preferences.",
        "inputs": [],
        "required_inputs": [],
        "send_user_here_when": "the user wants to update their profile, upload a resume, connect Gmail, or change preferences",
        "credit_cost": None,
        "tier_required": None,
    },
    {
        "route": "/documentation",
        "purpose": "Help docs and guides for using Offerloop.",
        "inputs": [],
        "required_inputs": [],
        "send_user_here_when": "the user wants the help docs or written guides for the platform",
        "credit_cost": None,
        "tier_required": None,
    },
    {
        "route": "/onboarding",
        "purpose": "First-time setup: profile, academics, location, and goals.",
        "inputs": [],
        "required_inputs": [],
        "send_user_here_when": "the user wants to redo or finish first-time setup of their profile",
        "credit_cost": None,
        "tier_required": None,
    },
]


# ---------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------

_BY_ROUTE: Dict[str, Dict[str, Any]] = {p["route"]: p for p in PAGE_REGISTRY}


def get_page(route: str) -> Optional[Dict[str, Any]]:
    """Return the registry entry for a route, or None if not a known route.

    Tolerates query strings: "/contact-search?tab=x" resolves to "/contact-search".
    """
    if not route:
        return None
    base = route.split("?")[0].rstrip("/") or "/"
    return _BY_ROUTE.get(base) or _BY_ROUTE.get(route)


def valid_routes() -> List[str]:
    """All routes Scout is allowed to navigate to."""
    return [p["route"] for p in PAGE_REGISTRY]


def is_valid_route(route: str) -> bool:
    """True if route (ignoring any query string) is in the registry."""
    return get_page(route) is not None


def build_pages_prompt_section() -> str:
    """Render the registry into the "pages you can navigate to" prompt section.

    This is the single source of truth for that section: the prompt is
    generated from PAGE_REGISTRY, never hand-written prose.
    """
    lines: List[str] = [
        "## PAGES YOU CAN NAVIGATE TO",
        "",
        "Each page below is somewhere you can send the user with the navigate "
        "tool. Only ever navigate to a route in this list.",
        "",
    ]
    for page in PAGE_REGISTRY:
        purpose = page["purpose"]
        if page.get("tier_required"):
            purpose = f"{purpose} (requires {str(page['tier_required']).capitalize()})"
        lines.append(f"{page['route']} - {purpose}")
        lines.append(f"  Send here when: {page['send_user_here_when']}.")
        if page.get("inputs"):
            lines.append(f"  Prefillable fields: {', '.join(page['inputs'])}")
        if page.get("required_inputs"):
            lines.append(f"  Required to navigate: {', '.join(page['required_inputs'])}")
        if page.get("credit_cost") is not None:
            lines.append(
                f"  Action cost: about {page['credit_cost']} credits per result "
                f"(the user spends this, not you)."
            )
        lines.append("")
    return "\n".join(lines).rstrip()
