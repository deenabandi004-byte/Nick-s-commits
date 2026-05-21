---
status: ACTIVE
created: 2026-04-09
amended: 2026-04-09 (Phase 2 aggregation scanner added - 3rd scanner permitted)
owners: flywheel, agentic-queue
related:
  - ~/.gstack/projects/deenabandi004-byte-Final_offerloop/ceo-plans/2026-04-08-ai-intelligence-flywheel.md
  - docs/designs/agentic-queue.md
---

# Tracker Daemon Contract

The nudge scanner, queue scanner, and aggregation scanner share a single
background daemon thread. Originally two scanners; amended 2026-04-09 to permit
three after the Phase 2 sub-design review resolved the aggregation cadence
question (Q2.4). This doc is the contract for all three.

## Why this exists

As of 2026-04-09 the repo has:

- **A live daemon thread** registered in `backend/wsgi.py:285` that runs
  `scan_and_generate_nudges()` every 6 hours (AI Intelligence Flywheel, Phase 1).
- **A planned queue scanner** (Agentic Networking Queue, Phase 2) that, per
  `docs/designs/agentic-queue.md:44`, will "piggyback on existing nudge scanner
  thread (every 6 hours, checks if Tuesday)."
- **Zero spec for how these coexist.** Not who owns the thread, not how errors
  are isolated, not what happens when one scanner throws, not how kill switches
  compose.

Without this contract, the first production exception in either scanner will
silently eat the other's 6-hour iteration, and nobody will notice.

## Ownership

- **Thread owner:** Flywheel. The nudge scanner shipped first and the thread is
  already live. The flywheel team is responsible for the thread lifecycle
  (start, healthcheck, restart).
- **Scanner owners:** Each scanner is owned by its feature team. Flywheel owns
  `scan_and_generate_nudges()`. Queue owns `scan_and_generate_queues()`.
- **Contract owner:** This document. Changes require review from both feature
  owners before merging.

## Dispatch model

A single thread, single loop, multiple scanner calls. Each scanner call is
isolated in its own try/except so one scanner's failure never blocks another.

```python
def _tracker_scanner_loop():
    SIX_HOURS = 6 * 3600
    time.sleep(300)  # boot stabilization

    while True:
        # Each scanner runs in isolation. A crash in one MUST NOT
        # prevent the other from running in the same iteration.

        if os.getenv("NUDGES_ENABLED", "true").lower() == "true":
            try:
                with app.app_context():
                    from .app.services.nudge_service import scan_and_generate_nudges
                    scan_and_generate_nudges()
                    _write_health("nudge_scanner")
            except Exception as e:
                logging.getLogger("nudge_scanner").exception(
                    "Nudge scanner iteration failed: %s", e
                )

        if os.getenv("QUEUE_SCANNER_ENABLED", "true").lower() == "true":
            try:
                with app.app_context():
                    from .app.services.queue_service import scan_and_generate_queues
                    # Queue scanner is idempotent and checks internally
                    # whether today is the dispatch day (Tuesday).
                    scan_and_generate_queues()
                    _write_health("queue_scanner")
            except Exception as e:
                logging.getLogger("queue_scanner").exception(
                    "Queue scanner iteration failed: %s", e
                )

        if os.getenv("AGGREGATION_SCANNER_ENABLED", "true").lower() == "true":
            try:
                with app.app_context():
                    from .app.services.email_baseline import aggregate_email_outcomes
                    # Aggregation scanner is idempotent and checks internally
                    # whether today is Sunday and the 3am-9am UTC window.
                    # Full scan takes <1 min at current volume.
                    aggregate_email_outcomes()
                    _write_health("aggregation_scanner")
            except Exception as e:
                logging.getLogger("aggregation_scanner").exception(
                    "Aggregation scanner iteration failed: %s", e
                )

        time.sleep(SIX_HOURS)
```

## Error isolation rules

1. **Per-scanner try/except is mandatory.** No shared catch around multiple
   scanner calls.
2. **Log with `.exception()`, not `.error()`.** Stack traces go to stderr.
3. **Never swallow and continue without logging.** Every exception writes a
   log line that names the scanner that failed.
4. **Do not retry in-loop.** If a scanner fails, wait until the next 6-hour
   tick. In-loop retries compound the risk of eating the next scanner's slot.
5. **Health doc is written AFTER the scanner returns successfully.** A failed
   scanner leaves its health doc stale, which is the watchdog's signal.

## Kill switches

Each scanner has its own env var, default `true`:

| Scanner | Env var | Default |
|---------|---------|---------|
| Nudges | `NUDGES_ENABLED` | `true` |
| Queue | `QUEUE_SCANNER_ENABLED` | `true` |
| Aggregation | `AGGREGATION_SCANNER_ENABLED` | `true` |

Rationale for three separate switches: each scanner has a different failure
mode and blast radius. You may want to disable nudges (user complaints about
spam) while keeping the queue alive, or disable aggregation (bad data or
write budget blown) while keeping user-facing scanners running. A single
combined switch would force an all-or-nothing outage response.

Thread itself can be disabled with `TRACKER_DAEMON_ENABLED=false` for
emergencies. This is a last resort - prefer the per-scanner switches.

## Dispatch cadence

- **Nudge scanner:** every 6 hours, no gating. Internal frequency cap (3 nudges
  per user per day) prevents spam.
- **Queue scanner:** every 6 hours invocation, but internal gate - returns
  early if the most recent successful run for any user was within the last
  6 days 20 hours AND today is not the designated Tuesday dispatch day.
  The 6-hour outer loop exists so that if the scanner is briefly disabled on
  Tuesday morning and re-enabled Tuesday afternoon, it still runs that week.
- **Aggregation scanner:** every 6 hours invocation, internal gate - returns
  early unless today is Sunday AND current UTC hour is in `[3, 9)` AND the
  last successful run was more than 6 days ago. Full scan of
  `users/{uid}/contacts` across all users, writes composite-key segments to
  `analytics/email_outcomes`. Runs in <1 min at current volume.

Rationale for 6d 20h on queue: slightly under one week to accommodate clock
drift and the fact that the first Tuesday check might happen a few hours after
midnight UTC but still needs to fire on the same calendar Tuesday.

Rationale for Sunday 3am-9am UTC on aggregation: low-traffic window in both
US and EU zones, minimizing risk of contention with user traffic. 6-hour
dispatch window gives the outer loop multiple chances to hit it even if one
iteration is briefly delayed.

### Cadence math (3 scanners)

| Scanner | Frequency | Runtime | Reads/run |
|---------|-----------|---------|-----------|
| Nudges | every 6h | <1 min | ~500-2,000 |
| Queue | every 6h (Tuesday gate) | <1 min | ~5,000 |
| Aggregation | every 6h (Sunday 3-9am UTC gate) | <1 min | ~45,000 |

Total worst-case scanner runtime per 6-hour iteration: ~3 min. Well within
the 6-hour window. This is the math referenced by the "three scanners is the
contract" rule below.

## Health check schema

Each scanner writes to its own Firestore doc after a successful run:

```
system/nudge_scanner
  lastSuccessAt: ISO timestamp
  lastDurationMs: int
  contactsScanned: int
  nudgesGenerated: int
  errorCount: int          # running count over last 10 runs

system/queue_scanner
  lastSuccessAt: ISO timestamp
  lastDurationMs: int
  usersProcessed: int
  queuesGenerated: int
  errorCount: int

system/aggregation_scanner
  lastSuccessAt: ISO timestamp
  lastDurationMs: int
  contactsScanned: int
  segmentsWritten: int
  docSizeBytes: int         # for the 800KB warn / 950KB fail guard
  errorCount: int
```

The watchdog (TODOS.md P1 - "Daemon Thread Healthcheck & Auto-Restart") reads
all three docs every hour. Staleness thresholds:

- **Nudge**: 8 hours (2-hour slack on 6-hour cadence)
- **Queue**: 7 days (slightly over one week for the Tuesday cadence)
- **Aggregation**: 8 days (slightly over one week for the Sunday cadence)

If `lastSuccessAt` is older than the threshold for a given scanner, the
watchdog logs an alert and attempts restart.

## Scaling ceiling

This thread-based pattern is appropriate up to approximately 1,000 users
across both scanners combined. Beyond that, migrate to Cloud Tasks or Cloud
Functions. At 1,000 users, a nudge scan approaches ~5,000 Firestore reads
per iteration and runtime approaches 10 minutes, which starts to interfere
with the weekly queue's Tuesday dispatch window.

The migration path:

1. Extract each scanner into a Cloud Function triggered by Cloud Scheduler
2. Remove the daemon thread from `wsgi.py`
3. Keep the same health doc schema so the watchdog code stays unchanged
4. Keep the same kill-switch env vars but read them from Cloud Function config

## Forbidden patterns

These have bitten us before. Do not:

1. **Add a fourth scanner to this loop without updating this doc.** Three
   scanners is the current contract (nudge, queue, aggregation - amended
   2026-04-09). A fourth requires re-evaluating the cadence math (can four
   scanners fit in one 6-hour window), health doc namespace expansion, and
   honest reconsideration of whether a migration to Cloud Tasks / Cloud
   Functions is overdue. The three-scanner runtime budget is already ~3 min
   per iteration; a fourth puts us in the zone where a slow iteration risks
   eating into the next tick.
2. **Call `requests.get()` or any blocking I/O without a timeout.** One
   hanging HTTP call will freeze the entire thread, silently killing all
   future scanner runs. Use `timeout=30` on every external call.
3. **Write to `system/health/*`** - the path is `system/{scanner_name}` (flat,
   no nested `health` segment). Using a different path creates orphan docs the
   watchdog will not find.
4. **Import scanner services at module load time.** Import inside the try
   block so an ImportError in one scanner doesn't prevent the other from
   loading. See `wsgi.py:279` for the correct pattern.
5. **Block waiting for user input.** The scanner runs headless. Any code path
   that prompts, opens a browser, or requires interaction will hang forever.

## Open questions (resolved in this doc)

- ~~Who owns the thread lifecycle?~~ → Flywheel owns the thread, each team
  owns their scanner.
- ~~What happens when one scanner throws?~~ → Per-scanner try/except, errors
  logged, other scanner continues.
- ~~One kill switch or two?~~ → Two, plus a thread-level emergency switch.
- ~~How do we detect daemon death?~~ → Per-scanner health docs + hourly
  watchdog (tracked in TODOS.md P1).

## Changelog

- **2026-04-09** - Initial contract. Extracted from findings in 2026-04-09
  flywheel re-review. Error isolation bug in `wsgi.py:276-283` (single outer
  try/except) identified and scheduled for fix.
- **2026-04-09** - Amended to permit a 3rd scanner (aggregation) for Phase 2
  of the AI Intelligence Flywheel. Added Sunday 3-9am UTC cadence for
  `aggregate_email_outcomes()`, `AGGREGATION_SCANNER_ENABLED` kill switch,
  `system/aggregation_scanner` health doc, 8-day watchdog threshold, and
  updated the forbidden-patterns rule from "2 scanners" to "3 scanners".
  Cadence math validated: ~3 min total scanner runtime per 6-hour iteration.
  Triggered by /plan-eng-review resolving Phase 2 sub-design Q2.4.
