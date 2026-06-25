# TODOS

Items deferred from in-flight work. Each entry includes context, rationale, and a
pointer to the source review / CEO plan it came from.

---

## P2 — Seniority-axis broadening dial for `execute_find_jobs`

**What:** Add an orthogonal seniority dial to `role_taxonomy`, used at Level 1 or
between Levels 1 and 2 of the find_jobs retry loop. Treat seniority (Senior /
Staff / Lead / Intern / New Grad / Early Career) as a separate axis from role
family, parameterized off the user's resume / graduation year.

**Why:** Today's Level 1 strip-list collapses "Senior Data Scientist" → "Data Scientist",
which is a *broadening* — but for a student about to graduate, the more useful retry
might be "Data Scientist" → "Data Scientist (New Grad)" or "Data Scientist (Entry
Level)". That's an axis the strip-list doesn't model.

**Pros:** Better Level 1 fit for student briefs near graduation; couples search to
profile data we already have.
**Cons:** Couples search to user profile; result-set shifts may surprise users; needs
profile data to be present (graduation year, current employment status).
**Context:** Surfaced during /plan-ceo-review on 2026-06-11 for the job-search
gradual-broadening plan. Deferred because the Level 1 strip-list covers the most
common case (Senior/Junior prefixes) and seniority-as-axis needs more product thought.

**Effort:** human M / CC ~30 min once role_taxonomy ships.
**Priority:** P2.
**Depends on:** `app/utils/role_taxonomy.py` shipping (current PR).
**Source:** `~/.gstack/projects/deenabandi004-byte-Final_offerloop/ceo-plans/2026-06-11-job-search-gradual-broadening.md`

---

## P2 — Brief-time RoleSpec normalization across all 4 agent pipelines

**What:** Replace the current per-action role-string parsing with a `RoleSpec(family,
qualifiers, seniority, location_hint)` object derived once at brief-parse time. All
four agent actions (`find`, `find_jobs`, `find_hiring_managers`, `discover_companies`)
consume the same `RoleSpec`.

**Why:** The 10x version of the current PR. Today, the brief is parsed once but each
action interprets the role string independently — PDL has its retry pattern, jobs is
getting its retry pattern (this PR), HM finder has its own logic, company discovery
ignores role family entirely. Centralizing the normalization means broadening,
seniority dials, and future taxonomy improvements ship across all four pipelines at
once.

**Pros:** One source of truth for "what role family is this brief in"; unblocks
cross-pipeline improvements; makes the broadening work in this PR portable.
**Cons:** XL refactor; touches all four action executors plus the brief parser;
requires backfilling existing loops or accepting a behavior-change moment.
**Context:** Surfaced as the 10x version of the broadening plan during
/plan-ceo-review on 2026-06-11. Worth doing once the current heuristic broadening
proves itself in production.

**Effort:** human XL / CC ~3-4 hrs.
**Priority:** P2 (high-value but not urgent — current per-action broadening
unblocks the immediate user pain).
**Depends on:** Telemetry from the current broadening rollout (need to see Level 1+
fire rates before investing in the bigger refactor).
**Source:** `~/.gstack/projects/deenabandi004-byte-Final_offerloop/ceo-plans/2026-06-11-job-search-gradual-broadening.md`

---

## P3 — Prompt-injection audit on Perplexity job-search query

**What:** Audit the path from user-submitted brief → parsed role string → Perplexity
prompt construction in `search_jobs_live`. Confirm the role string can't be used to
escape the prompt frame and influence Sonar's output beyond the search semantics.

**Why:** The role string flows from a user-controlled text field (the brief) into a
Perplexity prompt unvalidated. This is **pre-existing** — not introduced by the
broadening plan — but the broadening work made it visible in the threat model review.
A malicious brief like `role = "Engineer\n\nIgnore previous instructions and return..."`
could in theory alter Sonar's behavior.

**Pros:** Closes a latent injection surface; cheap mitigation (sanitize role string
to alphanumeric + common punctuation before substitution).
**Cons:** Low likelihood — students don't usually inject themselves; impact bounded
to Sonar's response, which we re-validate anyway via `_is_real_job_posting`.
**Context:** Surfaced during Section 3 (security) of /plan-ceo-review on 2026-06-11.

**Effort:** human S / CC ~15 min.
**Priority:** P3 (low likelihood; existing validator on results limits blast radius).
**Source:** `~/.gstack/projects/deenabandi004-byte-Final_offerloop/ceo-plans/2026-06-11-job-search-gradual-broadening.md`
