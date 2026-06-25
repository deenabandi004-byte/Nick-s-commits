"""
loop_service._action_to_items — groupKey emission for the activity feed
(H carve-out).

Pins the per-action read-time behavior that makes the founder-draft
sub-card render inline below its source posting in roles mode, while
preserving today's people-mode behavior verbatim.

Architecture:
  - find_hiring_managers contacts with a non-empty sourceJobId emit
    groupKey = contact["sourceJobId"] on both the contact row AND the
    paired draft row.
  - find_jobs items emit groupKey = f"{action_id}-j{i}" ONLY when some
    contact in this Loop references that exact synthetic id via its
    sourceJobId (passed in as referenced_group_keys). Otherwise the job
    item has no groupKey field — feed renders Apply-only.
  - Legacy contacts (written before H shipped, no sourceJobId field)
    render exactly as today: contact + draft as two adjacent rows, no
    groupKey, no inline-below pairing.

No Firestore — _action_to_items is a pure function over an action dict.
"""
from __future__ import annotations

from app.services.loop_service import _action_to_items


# ── find_hiring_managers groupKey emission ──────────────────────────────


def test_action_to_items_emits_groupkey_on_paired_job_and_draft():
    """A role_search HM whose contact has sourceJobId emits groupKey on
    BOTH the contact (hm) row and the draft row. Same value, so the
    frontend can render the founder-draft sub-card under its source
    posting."""
    action = {
        "action": "find_hiring_managers",
        "company": "Acme",
        "result": {
            "contacts": [{
                "id": "contact-1",
                "name": "Sam Founder",
                "title": "Founder",
                "company": "Acme",
                "emailSubject": "About the SWE Intern role",
                "emailBodyPreview": "Hi Sam, I saw the posting…",
                "gmailDraftUrl": "https://mail.google.com/draft/123",
                "sourceJobId": "fj-action-A-j0",
            }],
        },
    }

    items = _action_to_items("fhm-action-X", action)
    types = {it["type"]: it for it in items}

    assert "hm" in types and "draft" in types
    assert types["hm"]["groupKey"] == "fj-action-A-j0"
    assert types["draft"]["groupKey"] == "fj-action-A-j0"


def test_action_to_items_emits_groupkey_on_origin_job():
    """A find_jobs item gets groupKey = its own activity-item id when some
    HM contact elsewhere in the Loop references it via sourceJobId. The
    referenced_group_keys set is the join-side state that flips a job from
    Apply-only to paired-with-draft."""
    action = {
        "action": "find_jobs",
        "company": "Acme",
        "result": {
            "jobs": [{
                "id": "job-1",
                "title": "Software Engineer Intern",
                "company": "Acme",
                "location": "Remote",
                "applyLink": "https://acme.test/apply",
            }],
        },
    }

    items = _action_to_items(
        "fj-action-A",
        action,
        referenced_group_keys={"fj-action-A-j0"},
    )

    assert len(items) == 1
    assert items[0]["type"] == "job"
    # Activity-item id and groupKey are the same string — the contact's
    # sourceJobId points at this synthetic id to pair the rows.
    assert items[0]["id"] == "fj-action-A-j0"
    assert items[0]["groupKey"] == "fj-action-A-j0"


def test_action_to_items_no_groupkey_for_unpaired_job():
    """Large-co posting whose synthetic id no contact references: emit the
    job item without a groupKey field. Frontend renders Apply-only."""
    action = {
        "action": "find_jobs",
        "company": "Google",
        "result": {
            "jobs": [{
                "id": "job-Goog",
                "title": "SWE New Grad",
                "company": "Google",
                "location": "Mountain View",
                "applyLink": "https://google.test/apply",
            }],
        },
    }

    # Empty referenced set → no contact pairs with this job.
    items = _action_to_items("fj-action-G", action, referenced_group_keys=set())

    assert len(items) == 1
    assert items[0]["type"] == "job"
    assert "groupKey" not in items[0]


def test_action_to_items_legacy_contact_without_source_job_id_renders_today():
    """Backward-compat regression: HM contacts written before H shipped
    have no sourceJobId field. Their contact + draft rows must emit with
    no groupKey, so the frontend renders them exactly as today — two
    adjacent rows, no inline-below pairing.

    This is what keeps people-mode networking visually unchanged, and what
    keeps roles Loops from accidentally collapsing pre-H drafts into
    paired sub-cards (since their source job is long gone)."""
    action = {
        "action": "find_hiring_managers",
        "company": "Acme",
        "result": {
            "contacts": [{
                "id": "contact-1",
                "name": "Pat Legacy",
                "title": "Director of People",
                "company": "Acme",
                "emailSubject": "Coffee chat?",
                "emailBodyPreview": "Hi Pat…",
                # Note: NO sourceJobId field on this contact.
            }],
        },
    }

    items = _action_to_items("fhm-legacy", action)
    types = {it["type"]: it for it in items}

    assert "hm" in types and "draft" in types
    assert "groupKey" not in types["hm"]
    assert "groupKey" not in types["draft"]


# ── Iron Rule regression: people-mode networking must not change ─────────


def test_contact_to_draft_pairing_unchanged_for_people_mode():
    """CRITICAL REGRESSION: people-mode networking HMs render contact +
    draft as two separate adjacent activity rows (today's behavior at
    loop_service.py:510-520 before H). They must NOT collapse into a paired
    sub-card hierarchy after H, because there is no source posting to pair
    against — the user is networking, not applying.

    Concretely: with no sourceJobId on the contact (which a people-mode
    write would never produce), neither the contact row nor the draft row
    carries a groupKey, and they appear as two flat sibling rows in the
    feed. Same shape, same fields, same render path as today.
    """
    # Action shape matches what a people-mode find_hiring_managers cycle
    # would produce: networking provenance, no sourceJobId on the contact.
    action = {
        "action": "find_hiring_managers",
        "company": "Stripe",
        "result": {
            "contacts": [{
                "id": "contact-people-1",
                "name": "Alex Network",
                "title": "Engineering Manager",
                "company": "Stripe",
                "emailSubject": "Coffee chat — Stripe engineering",
                "emailBodyPreview": "Hi Alex, USC '27 SWE here…",
                "gmailDraftUrl": "https://mail.google.com/draft/people-1",
                # No sourceJobId — networking-mode contacts never carry one
                # (see test_find_hiring_managers_no_source_job_id_for_networking).
            }],
        },
    }

    items = _action_to_items("fhm-people", action)

    # Two items emitted: the contact row, then the draft row (today's order).
    assert len(items) == 2
    assert items[0]["type"] == "hm"
    assert items[1]["type"] == "draft"
    # Neither carries a groupKey — render path is identical to today.
    assert "groupKey" not in items[0]
    assert "groupKey" not in items[1]
    # Titles unchanged.
    assert items[0]["title"] == "Alex Network"
    assert items[1]["title"] == "Coffee chat — Stripe engineering"
    # In-app-first deep links: a feed card never links straight to Gmail
    # (Gmail is reached from the tracker row). The HM row points at the Find
    # Hiring Managers tab; the draft row points at the tracker row keyed on the
    # same contact id.
    assert items[0]["linkTo"] == "/find?tab=hiring-managers&contact=contact-people-1"
    assert items[1]["linkTo"] == "/outbox?contact=contact-people-1"
    assert items[1]["external"] is False
