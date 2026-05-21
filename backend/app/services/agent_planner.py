"""
Agent Planner - LLM-driven action plan generation using Claude (Anthropic).

Takes user goals + pipeline state + recent activity → outputs a JSON action plan.
Each cycle, the planner decides what the agent should do next.
"""
from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone

from app.config import CLAUDE_API_KEY

logger = logging.getLogger(__name__)

PLANNER_MODEL = "claude-sonnet-4-20250514"
MAX_ACTIONS_PER_CYCLE = 10

VALID_ACTIONS = frozenset({
    "find", "find_jobs", "discover_companies", "find_hiring_managers",
    "follow_up", "skip",
})


def generate_action_plan(
    uid: str,
    config: dict,
    user_data: dict,
    pipeline_state: dict,
) -> dict:
    """Generate an action plan for one agent cycle.

    Returns:
        {
            "plan": [{"action": "find", "company": "...", ...}, ...],
            "plannerLog": {"prompt": ..., "response": ..., "model": ..., "latencyMs": ...}
        }
    """
    # Pre-planning market research via Perplexity
    market_context = {}
    try:
        from app.services.perplexity_client import get_market_context
        market_context = get_market_context(
            target_companies=config.get("targetCompanies", []),
            target_industries=config.get("targetIndustries", []),
        )
    except Exception:
        logger.warning("Market context fetch failed, planning without", exc_info=True)

    prompt = _build_prompt(config, user_data, pipeline_state, market_context)

    start_ms = time.time() * 1000
    raw_response = _call_claude(prompt)
    latency_ms = int(time.time() * 1000 - start_ms)

    plan = _parse_plan(raw_response)

    return {
        "plan": plan,
        "plannerLog": {
            "prompt": prompt,
            "response": raw_response,
            "parsedPlan": plan,
            "model": PLANNER_MODEL,
            "latencyMs": latency_ms,
        },
    }


def _build_prompt(config: dict, user_data: dict, pipeline_state: dict, market_context: dict | None = None) -> str:
    # User context
    prof = user_data.get("professionalInfo") or {}
    university = prof.get("university", "Unknown")
    career_track = prof.get("careerTrack", "Unknown")
    graduation_year = prof.get("graduationYear", "Unknown")
    career_interests = user_data.get("careerInterests", [])

    # Agent config
    targets = config.get("targetCompanies", [])
    industries = config.get("targetIndustries", [])
    roles = config.get("targetRoles", [])
    locations = config.get("targetLocations", [])
    weekly_target = config.get("weeklyContactTarget", 5)
    prefer_alumni = config.get("preferAlumni", True)
    follow_up_enabled = config.get("followUpEnabled", True)
    follow_up_days = config.get("followUpDays", 7)
    blocklist = config.get("blocklist", {})

    # Feature toggles
    enable_jobs = config.get("enableJobDiscovery", True)
    enable_hms = config.get("enableHiringManagers", True)
    enable_cos = config.get("enableCompanyDiscovery", True)

    # Pipeline state
    total_contacts = pipeline_state.get("totalContacts", 0)
    company_counts = pipeline_state.get("companyCounts", {})
    jobs_pipeline = pipeline_state.get("jobsPipeline", {})
    hm_pipeline = pipeline_state.get("hmPipeline", {})
    discovered_companies = pipeline_state.get("discoveredCompanies", [])

    # Contacts needing follow-up
    follow_up_candidates = []
    if follow_up_enabled:
        now = datetime.now(timezone.utc)
        for c in pipeline_state.get("contacts", []):
            sent_at = c.get("emailSentAt")
            if not sent_at:
                continue
            last_nudge = c.get("lastNudgeAt")
            if last_nudge:
                continue
            try:
                if isinstance(sent_at, str):
                    sent_dt = datetime.fromisoformat(sent_at.replace("Z", "+00:00"))
                else:
                    sent_dt = sent_at
                days_since = (now - sent_dt).days
                if days_since >= follow_up_days:
                    follow_up_candidates.append({
                        "id": c["id"],
                        "name": f"{c.get('company', '')}",
                        "days_since_email": days_since,
                    })
            except Exception:
                pass

    # Build action types section
    action_types = [
        '"find" - search for contacts at a company. Include "company", "title", "count" (1-3).',
        '"follow_up" - follow up on stale outreach. Include "contact_ids" array.',
        '"skip" - do nothing this cycle. Include just "reason".',
    ]
    if enable_jobs:
        action_types.append(
            '"find_jobs" - search for jobs at a company. Include "company", "role", "count" (3-10).'
        )
    if enable_hms:
        action_types.append(
            '"find_hiring_managers" - find HMs for a job. Include "company", "jobTitle", "location", "count" (1-3).'
        )
    if enable_cos:
        action_types.append(
            '"discover_companies" - find similar companies. Include "sourceCompany".'
        )

    # Pipeline state section for HM pipeline
    pipeline_section = f"""## Current Pipeline State
- Total Contacts in Pipeline: {total_contacts}
- Contacts per Company: {json.dumps(company_counts) if company_counts else 'None yet'}
- Follow-up Candidates: {len(follow_up_candidates)} contacts awaiting follow-up"""

    if enable_jobs:
        pipeline_section += f"\n- Jobs Found per Company: {json.dumps(jobs_pipeline) if jobs_pipeline else 'None yet'}"
    if enable_hms:
        pipeline_section += f"\n- HMs Contacted per Company: {json.dumps(hm_pipeline) if hm_pipeline else 'None yet'}"
    if enable_cos and discovered_companies:
        pipeline_section += f"\n- Companies Already Discovered: {', '.join(discovered_companies)}"

    prompt = f"""You are an autonomous networking agent for a college student. Your job is to plan the next set of actions to help them build their professional network.

## Student Profile
- University: {university}
- Career Track: {career_track}
- Graduation Year: {graduation_year}
- Career Interests: {', '.join(career_interests) if career_interests else 'Not specified'}

## Agent Configuration
- Target Companies: {', '.join(targets) if targets else 'None specified'}
- Target Industries: {', '.join(industries) if industries else 'None specified'}
- Target Roles: {', '.join(roles) if roles else 'None specified'}
- Target Locations: {', '.join(locations) if locations else 'Any'}
- Weekly Contact Target: {weekly_target}
- Prefer Alumni: {prefer_alumni}
- Follow-up Enabled: {follow_up_enabled} (after {follow_up_days} days)

{pipeline_section}

## Blocklist
- Blocked Companies: {', '.join(blocklist.get('companies', [])) or 'None'}
- Blocked Titles: {', '.join(blocklist.get('titles', [])) or 'None'}

{_build_market_section(market_context) if market_context else ''}## Rules
- If market intelligence indicates a company announced layoffs or a hiring freeze, reduce contact count for that company
- If a company announced expansion or a hiring surge, increase contact count
1. ALWAYS include "find" actions to search for contacts - this is the core action. Every cycle must find at least some contacts.
2. Distribute contacts across target companies evenly (max 3 NEW contacts per company per cycle)
3. Prioritize companies with fewer existing contacts
4. If follow-up candidates exist, include follow_up actions for them
5. Do NOT exceed the weekly contact target of {weekly_target}
6. If the weekly target is already met, output a single "skip" action
7. Never include blocked companies or titles
8. When target companies have jobs, use find_hiring_managers to reach HMs directly
9. Use discover_companies to find similar companies the student might not know
10. A good cycle includes ALL of these: find contacts (REQUIRED) + find_jobs for 1-2 companies + discover_companies + find_hiring_managers if jobs exist + follow_up stale outreach

## Output Format
Return a JSON array of actions. Each action must have:
- "action": one of the action types below
- "reason": brief explanation of why this action was chosen

Action types:
{chr(10).join(f'- {a}' for a in action_types)}

Return ONLY the JSON array, no other text."""

    return prompt


def _build_market_section(market_context: dict) -> str:
    """Build the market intelligence section for the planner prompt."""
    if not market_context:
        return ""
    sections = ["## Real-Time Market Intelligence (from web research)\n"]
    if market_context.get("hiring_intel"):
        sections.append(f"### Hiring Activity\n{market_context['hiring_intel']}\n")
    if market_context.get("cycle_intel"):
        sections.append(f"### Recruiting Cycle\n{market_context['cycle_intel']}\n")
    return "\n".join(sections) + "\n"


def _call_claude(prompt: str) -> str:
    """Call Claude API for planning."""
    if not CLAUDE_API_KEY:
        logger.warning("CLAUDE_API_KEY not set - returning empty plan")
        return "[]"

    import anthropic

    client = anthropic.Anthropic(api_key=CLAUDE_API_KEY)

    message = client.messages.create(
        model=PLANNER_MODEL,
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )

    return message.content[0].text


def _parse_plan(raw: str) -> list[dict]:
    """Parse the LLM response into a list of action dicts."""
    try:
        # Strip markdown code fences if present
        text = raw.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            text = "\n".join(lines)

        plan = json.loads(text)
        if not isinstance(plan, list):
            logger.warning("Planner returned non-list: %s", type(plan))
            return []

        # Validate and cap
        validated = []
        for item in plan[:MAX_ACTIONS_PER_CYCLE]:
            if not isinstance(item, dict):
                continue
            action = item.get("action")
            if action not in VALID_ACTIONS:
                continue
            # Normalize company name casing (LLM sometimes returns "gOOGLE" etc.)
            if "company" in item and isinstance(item["company"], str):
                item["company"] = item["company"].strip().title()
            validated.append(item)

        return validated

    except (json.JSONDecodeError, Exception) as e:
        logger.exception("Failed to parse planner output: %s", e)
        return []
