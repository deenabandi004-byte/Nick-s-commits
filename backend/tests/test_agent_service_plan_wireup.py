"""
agent_service — plan safety-net + H carve-out sourceJobId propagation.

Two helpers live at module scope in agent_service so they can be unit-
tested without standing up Firestore or running a real cycle:

  _apply_plan_safety_net(plan, loop_mode, targets, roles_list)
    Mutates the plan to enforce mode-required actions. Closes gap A in
    the H carve-out follow-up: roles/both-mode briefs with no parsed
    company targets (e.g. "Summer 2027 SWE internships at YC tech
    startups") still get a find_jobs auto-added — empty company →
    executor falls back to a role-only broad Perplexity search.

  _propagate_source_job_id_to_plan(plan, idx, find_jobs_action_id, result)
    Stamps sourceJobId on subsequent find_hiring_managers actions
    matching a fetched job's company. Closes gap B: at write time the
    contact doc's sourceJobId matches the find_jobs item's groupKey, so
    the activity feed renders the founder-draft sub-card under its
    source posting.

Both helpers are pure (mutate-in-place over plain dicts) — no Firestore,
no API calls, no closures over enclosing state.
"""
from __future__ import annotations

from app.services.agent_service import (
    _apply_plan_safety_net,
    _propagate_source_job_id_to_plan,
)


# ── _apply_plan_safety_net — gap A: targetless briefs ────────────────────


def test_roles_mode_with_targets_emits_per_company_find_jobs():
    """Roles mode + explicit targets keeps the today behavior: auto-add
    find_jobs at each (capped at 2) target company. Iron Rule
    regression — this path was working pre-H and must keep working."""
    plan = [{"action": "discover_companies", "sourceCompany": "Anthropic"}]
    _apply_plan_safety_net(plan, "roles", ["Stripe", "Linear", "Notion"], ["SWE Intern"])

    find_jobs = [a for a in plan if a.get("action") == "find_jobs"]
    assert len(find_jobs) == 2  # capped at 2 per the function
    assert find_jobs[0]["company"] == "Stripe"
    assert find_jobs[0]["role"] == "SWE Intern"
    assert find_jobs[1]["company"] == "Linear"


def test_roles_mode_without_targets_emits_broad_find_jobs():
    """Roles mode + zero targets used to silently skip the auto-add. The
    YC dogfood (no company names) suffered this — find_jobs never ran,
    and the H pairing render had no postings to work with. Now we
    auto-add one broad role-only find_jobs (company=''); the executor
    falls back to a role-only Perplexity query."""
    plan = [{"action": "discover_companies", "sourceCompany": "YC W17"}]
    _apply_plan_safety_net(plan, "roles", [], ["Software Engineering Intern"])

    find_jobs = [a for a in plan if a.get("action") == "find_jobs"]
    assert len(find_jobs) == 1
    assert find_jobs[0]["company"] == ""
    assert find_jobs[0]["role"] == "Software Engineering Intern"
    assert "broadly" in find_jobs[0]["reason"].lower()


def test_both_mode_with_targets_emits_find_and_find_jobs():
    """Both mode + targets: both pipelines must be present per Rule #1.
    Iron Rule regression — this is the today-working path."""
    plan = [{"action": "discover_companies", "sourceCompany": "Acme"}]
    _apply_plan_safety_net(plan, "both", ["Stripe", "Linear"], ["SWE"])

    finds = [a for a in plan if a.get("action") == "find"]
    find_jobs = [a for a in plan if a.get("action") == "find_jobs"]
    assert len(finds) == 2 and finds[0]["company"] == "Stripe"
    assert len(find_jobs) == 2 and find_jobs[0]["company"] == "Stripe"


def test_both_mode_without_targets_emits_broad_find_jobs_only():
    """Both mode + zero targets: skip the find auto-add (PDL queries
    without a company filter would scan the 2.2B-row index — that's
    useless and expensive). Emit ONLY the broad find_jobs so postings
    surface and the planner can discover companies for next cycle."""
    plan = [{"action": "discover_companies", "sourceCompany": "YC"}]
    _apply_plan_safety_net(plan, "both", [], ["SWE Intern"])

    finds = [a for a in plan if a.get("action") == "find"]
    find_jobs = [a for a in plan if a.get("action") == "find_jobs"]
    assert finds == []
    assert len(find_jobs) == 1
    assert find_jobs[0]["company"] == ""


def test_people_mode_unchanged_by_safety_net_with_targets():
    """People mode behavior must not regress — only find is auto-added,
    never find_jobs (PDL contacts are the primary output of people mode;
    postings are not on the menu)."""
    plan = [{"action": "discover_companies", "sourceCompany": "Acme"}]
    _apply_plan_safety_net(plan, "people", ["Stripe"], ["Engineering Manager"])

    finds = [a for a in plan if a.get("action") == "find"]
    find_jobs = [a for a in plan if a.get("action") == "find_jobs"]
    assert len(finds) == 1
    assert find_jobs == []


def test_people_mode_without_targets_emits_nothing_extra():
    """People mode without targets: no auto-add fires (find without a
    company can't usefully query PDL). Plan stays as-is."""
    plan = [{"action": "skip", "reason": "no targets, no auto-add"}]
    _apply_plan_safety_net(plan, "people", [], ["SWE"])

    assert plan == [{"action": "skip", "reason": "no targets, no auto-add"}]


def test_safety_net_skips_when_find_jobs_already_present():
    """When the planner already emitted find_jobs, the safety net must
    not duplicate it."""
    plan = [
        {"action": "find_jobs", "company": "Stripe", "role": "SWE"},
    ]
    _apply_plan_safety_net(plan, "roles", ["Stripe"], ["SWE"])

    find_jobs = [a for a in plan if a.get("action") == "find_jobs"]
    assert len(find_jobs) == 1
    assert find_jobs[0]["company"] == "Stripe"  # original, not auto-added


def test_safety_net_recovers_empty_plan_with_targets():
    """When the planner returns an empty list — Claude regressed or the
    JSON parse fell back to [] — the safety net MUST synthesize
    mode-required actions. Pre-fix, the `if not plan: return` guard
    bailed out here and the cycle stamped found=0/drafted=0 with errors=0
    (the user's loop ran for ~10s and produced nothing).

    The author's original assumption was that an empty plan signaled
    "planner deliberately chose to skip" — but a real skip-signal is
    `[{"action": "skip"}]`, not `[]`. Empty is always a regression."""
    plan: list = []
    _apply_plan_safety_net(plan, "both", ["Stripe", "Linear"], ["SWE"])
    # both mode with targets → safety net should inject both `find` and
    # `find_jobs` for the top 2 companies.
    actions = [a.get("action") for a in plan]
    assert actions.count("find") == 2
    assert actions.count("find_jobs") == 2
    companies = sorted([a.get("company") for a in plan])
    assert companies == ["Linear", "Linear", "Stripe", "Stripe"]


def test_safety_net_recovers_empty_plan_no_targets_roles_mode():
    """Even without targets, roles-mode loops must produce at least one
    broad find_jobs action so the cycle isn't a no-op. Without this, a
    targetless brief like 'Summer 2027 SWE internships' would silently
    do nothing when the planner regressed."""
    plan: list = []
    _apply_plan_safety_net(plan, "roles", [], ["SWE Intern"])
    assert len(plan) == 1
    assert plan[0]["action"] == "find_jobs"
    assert plan[0].get("role") == "SWE Intern"


# ── _propagate_source_job_id_to_plan — gap B: H pairing key ───────────────


def test_propagate_stamps_matching_hm_with_correct_index():
    """The classic H pairing case: find_jobs surfaces 2 postings at YC
    companies; subsequent find_hiring_managers at the first company
    gets sourceJobId pointing at job index 0."""
    plan = [
        {"action": "find_jobs", "company": "Stripe", "role": "SWE Intern"},
        {"action": "find_hiring_managers", "company": "Stripe", "jobTitle": "Founder"},
    ]
    result = {
        "jobs": [
            {"company": "Stripe", "title": "SWE Intern"},
        ],
    }

    _propagate_source_job_id_to_plan(plan, 0, "fj-action-A", result)

    assert plan[1]["sourceJobId"] == "fj-action-A-j0"


def test_propagate_uses_correct_index_when_multiple_jobs():
    """find_jobs sometimes returns multiple companies in one action's
    result (broad search). The HM stamping picks the index of the FIRST
    matching company so the groupKey matches that posting's synthetic
    activity-item id."""
    plan = [
        {"action": "find_jobs", "company": "", "role": "SWE Intern"},
        {"action": "find_hiring_managers", "company": "Linear", "jobTitle": "Founder"},
    ]
    result = {
        "jobs": [
            {"company": "Stripe", "title": "SWE Intern"},
            {"company": "Linear", "title": "SWE Intern"},
            {"company": "Notion", "title": "SWE Intern"},
        ],
    }

    _propagate_source_job_id_to_plan(plan, 0, "fj-action-B", result)

    # j1 (Linear) is the matching index, not j0 (Stripe) or j2 (Notion)
    assert plan[1]["sourceJobId"] == "fj-action-B-j1"


def test_propagate_case_insensitive_company_match():
    """Companies sometimes drift in casing between planner action dicts
    and Perplexity-returned job docs. Match case-insensitively so a
    `find_hiring_managers` at "stripe" still pairs with a job whose
    company is "Stripe"."""
    plan = [
        {"action": "find_jobs", "company": "Stripe", "role": "SWE"},
        {"action": "find_hiring_managers", "company": "stripe", "jobTitle": "Founder"},
    ]
    result = {"jobs": [{"company": "Stripe", "title": "SWE Intern"}]}

    _propagate_source_job_id_to_plan(plan, 0, "fj-1", result)
    assert plan[1]["sourceJobId"] == "fj-1-j0"


def test_propagate_skips_hm_with_existing_source_job_id():
    """If an earlier find_jobs in the same plan already stamped the HM
    action, don't overwrite. First find_jobs that fetches the company
    wins — matches the dispatcher's iteration order so behavior stays
    deterministic."""
    plan = [
        {"action": "find_jobs", "company": "", "role": "SWE"},
        {
            "action": "find_hiring_managers",
            "company": "Stripe",
            "jobTitle": "Founder",
            "sourceJobId": "earlier-claim-j5",
        },
    ]
    result = {"jobs": [{"company": "Stripe"}]}

    _propagate_source_job_id_to_plan(plan, 0, "fj-2", result)
    assert plan[1]["sourceJobId"] == "earlier-claim-j5"  # untouched


def test_propagate_only_touches_downstream_actions():
    """find_hiring_managers actions BEFORE this find_jobs are not
    stamped — the planner wrote them without knowing the job's
    activity-item id yet, and stamping them retroactively would point
    them at a future job. Honor execution order strictly."""
    plan = [
        {"action": "find_hiring_managers", "company": "Stripe", "jobTitle": "Founder"},
        {"action": "find_jobs", "company": "Stripe", "role": "SWE"},
        {"action": "find_hiring_managers", "company": "Stripe", "jobTitle": "CEO"},
    ]
    result = {"jobs": [{"company": "Stripe"}]}

    _propagate_source_job_id_to_plan(plan, 1, "fj-3", result)
    # The upstream HM at index 0 stays unstamped.
    assert "sourceJobId" not in plan[0]
    # The downstream HM at index 2 gets stamped.
    assert plan[2]["sourceJobId"] == "fj-3-j0"


def test_propagate_skips_non_hm_downstream_actions():
    """Don't stamp follow_up, discover_companies, or other action types —
    sourceJobId is meaningful only on find_hiring_managers actions."""
    plan = [
        {"action": "find_jobs", "company": "Stripe", "role": "SWE"},
        {"action": "discover_companies", "company": "Stripe"},
        {"action": "follow_up", "contact_ids": ["abc"]},
    ]
    result = {"jobs": [{"company": "Stripe"}]}

    _propagate_source_job_id_to_plan(plan, 0, "fj-4", result)
    assert "sourceJobId" not in plan[1]
    assert "sourceJobId" not in plan[2]


def test_propagate_skips_when_no_company_match():
    """If no find_hiring_managers action targets a company the find_jobs
    just fetched, leave the plan untouched. Large-co Apply-only postings
    fall into this bucket — no founder draft pairs with them."""
    plan = [
        {"action": "find_jobs", "company": "Google", "role": "SWE"},
        {"action": "find_hiring_managers", "company": "TinyStartup", "jobTitle": "Founder"},
    ]
    result = {"jobs": [{"company": "Google"}]}

    _propagate_source_job_id_to_plan(plan, 0, "fj-5", result)
    assert "sourceJobId" not in plan[1]


def test_propagate_skips_when_find_jobs_result_empty():
    """find_jobs ran but returned zero postings (cache miss, Perplexity
    rate-limit, no matches for query). Don't stamp anything — there's no
    activity item to point at."""
    plan = [
        {"action": "find_jobs", "company": "Stripe", "role": "SWE"},
        {"action": "find_hiring_managers", "company": "Stripe", "jobTitle": "Founder"},
    ]
    result = {"jobs": [], "jobsFound": 0}

    _propagate_source_job_id_to_plan(plan, 0, "fj-6", result)
    assert "sourceJobId" not in plan[1]
