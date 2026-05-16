# Parallel Agent Architecture for Offerloop

Date: 2026-04-09
Purpose: Technical spec for implementing Clado-style parallel agents in Offerloop's existing stack.

## What "parallel agents" means at the code level

An agent is a function that does one tiny task, autonomously, and writes its result to a shared state. Three rules:

1. **Each agent does one thing.** Not "find contacts and draft emails." Just "find contacts" OR just "draft an email."
2. **Agents communicate through shared state (Firestore), not through each other.** Agent A writes to Firestore. Agent B reads from Firestore. They never call each other directly.
3. **Agents run in parallel by default.** A coordinator dispatches them, not a sequential loop.

## The daily run for one student, agent-by-agent

Example student: Sarah, junior at Georgetown, targeting IB at bulge brackets.

### Step 1 — Profile resolver agent (1 agent)

Reads Sarah's profile from Firestore: resume, interests, target firms, school. Generates 5-10 search queries.

```
Output: ["IB analyst Goldman Sachs", "IB analyst Morgan Stanley", 
         "IB analyst Evercore", "consulting analyst McKinsey", ...]
```

Writes queries to a new "daily run" document in Firestore.

### Step 2 — Job hunter agents (10 agents in parallel)

Each takes ONE query, calls existing `serp_client.py` or job board service. Returns 5-10 matching open roles. Each agent writes independently.

```
Agent 1: "IB analyst Goldman Sachs" → finds 5 jobs → writes to Firestore
Agent 2: "IB analyst Morgan Stanley" → finds 3 jobs → writes to Firestore
... (all running simultaneously)
```

Total time: ~5 seconds (slowest agent), not 50 seconds (sum of all agents).

### Step 3 — Contact finder agents (~30 agents in parallel)

Each takes ONE job, calls existing `pdl_client.py` to find 2-3 contacts. Prioritizes alumni from student's school.

### Step 4 — Signal detector agents (~75 agents in parallel)

Each takes ONE contact, looks up recent activity: LinkedIn posts, news mentions, recent role changes. Uses SerpAPI or Jina Reader. Writes signals to that contact's doc.

**This is the part Offerloop doesn't do today. Most important for personalization.**

### Step 5 — Email drafter agents (~75 agents in parallel)

Each takes ONE tuple of (student, job, contact, signals), calls OpenAI with self-critique pass, writes email to Firestore.

### Step 6 — Coordinator agent (1 agent, runs last)

Checks all agents completed. Assembles final outreach queue, ranks it, marks run as "ready," sends notification.

**Total: ~190 agents per student per day. For 1,000 students: ~190,000 agents/day.**

## Why parallel beats sequential

### Sequential (wrong way)
```python
def run_daily_sequential(user_id):
    queries = generate_queries(user_id)
    for query in queries:
        jobs = find_jobs(query)
        for job in jobs:
            contacts = find_contacts(job)
            for contact in contacts:
                signals = find_signals(contact)
                email = draft_email(contact, signals)
                save_email(email)
```

190 sequential API calls × 2 sec each = 6+ min per student. 1,000 students = 100+ hours.

### Parallel (right way)
```python
def run_daily_parallel(user_id):
    queries = generate_queries(user_id)
    
    with ThreadPoolExecutor(max_workers=20) as pool:
        jobs = list(pool.map(find_jobs, queries))
    
    flat_jobs = [j for batch in jobs for j in batch]
    with ThreadPoolExecutor(max_workers=30) as pool:
        contacts = list(pool.map(find_contacts, flat_jobs))
    
    flat_contacts = [c for batch in contacts for c in batch]
    with ThreadPoolExecutor(max_workers=30) as pool:
        pool.map(draft_email_with_signals, flat_contacts)
    
    finalize_run(user_id)
```

Same 190 calls, 30 at a time. ~30 seconds per student. 1,000 students = ~8 hours overnight.

## Implementation in Offerloop's existing stack

### The agent (a function wrapping an existing service)

```python
# backend/app/agents/contact_finder_agent.py

def contact_finder_agent(run_id: str, job_id: str) -> dict:
    db = get_db()
    
    # 1. Read inputs from shared state
    job_doc = db.collection('daily_runs').document(run_id) \
               .collection('jobs').document(job_id).get()
    job = job_doc.to_dict()
    
    # 2. Do the work (uses existing service)
    contacts = pdl_client.find_contacts_at_company(
        company=job['company'],
        role_keywords=job['role'],
        school=job['student_school']
    )
    
    # 3. Write output to shared state
    contact_ref = db.collection('daily_runs').document(run_id) \
                    .collection('jobs').document(job_id) \
                    .collection('contacts')
    for c in contacts:
        contact_ref.add(c)
    
    return {'job_id': job_id, 'contacts_found': len(contacts), 'status': 'ok'}
```

~15 lines per agent. Write one per task type.

### The orchestrator (dispatches agents in parallel)

```python
# backend/app/agents/orchestrator.py

from concurrent.futures import ThreadPoolExecutor, as_completed

def run_daily_for_user(user_id: str):
    db = get_db()
    run_id = create_run_doc(db, user_id)
    
    # Phase 1: profile resolver (1 agent)
    queries = profile_resolver_agent(run_id, user_id)
    
    # Phase 2: job hunters (parallel)
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = [pool.submit(job_hunter_agent, run_id, q) for q in queries]
        for f in as_completed(futures):
            result = f.result()
            log_agent_completion(run_id, 'job_hunter', result)
    
    # Phase 3: contact finders (parallel)
    job_ids = list_jobs_in_run(db, run_id)
    with ThreadPoolExecutor(max_workers=20) as pool:
        futures = [pool.submit(contact_finder_agent, run_id, j) for j in job_ids]
        for f in as_completed(futures):
            log_agent_completion(run_id, 'contact_finder', f.result())
    
    # Phase 4: signal + email drafters (parallel)
    contact_ids = list_contacts_in_run(db, run_id)
    with ThreadPoolExecutor(max_workers=20) as pool:
        futures = [pool.submit(signal_and_email_agent, run_id, c) for c in contact_ids]
        for f in as_completed(futures):
            log_agent_completion(run_id, 'email_drafter', f.result())
    
    # Phase 5: coordinator (1 agent)
    finalize_run(db, user_id, run_id)
```

### The scheduler (daemon thread in wsgi.py)

```python
# wsgi.py (add to existing daemon threads)

def daily_run_daemon():
    while True:
        try:
            now = datetime.utcnow()
            users_due = db.collection('users') \
                         .where('next_daily_run', '<=', now).stream()
            
            with ThreadPoolExecutor(max_workers=5) as pool:
                pool.map(run_daily_for_user, [u.id for u in users_due])
            
            time.sleep(60)  # check every minute
        except Exception as e:
            log.error(f"daily_run_daemon error: {e}")
            time.sleep(300)  # back off on error

threading.Thread(target=daily_run_daemon, daemon=True).start()
```

### The entire system is 3 pieces:

1. **Agents** = functions in `backend/app/agents/` wrapping existing services
2. **Orchestrator** = function dispatching agents via ThreadPoolExecutor
3. **Scheduler** = daemon thread in wsgi.py triggering the orchestrator

## Failure handling

### Pattern 1: Retry inside each agent
Use existing `backend/app/utils/retry.py`. Each agent wraps API calls in `retry_with_backoff()`.

### Pattern 2: Fail individually, not as a batch
```python
for f in as_completed(futures):
    try:
        result = f.result()
        log_agent_completion(run_id, 'contact_finder', result)
    except Exception as e:
        log_agent_failure(run_id, 'contact_finder', e)
        # don't re-raise — let other agents continue
```

### Pattern 3: Graceful partial results
Coordinator doesn't require ALL agents to succeed. 80 of 100 succeed = 80 emails in queue. Failed ones retry next run.

## When to upgrade to a real task queue

Upgrade from ThreadPoolExecutor when you hit:

- **Compute limit**: Render maxes out CPU/memory with 1,000+ users → move to Google Cloud Tasks
- **Reliability limit**: Daemon thread dies, lose in-flight work → task queue persists and retries
- **Observability limit**: Need dashboard for 100k agents/day → Cloud Tasks has built-in monitoring

### Infrastructure options:

| Option | Complexity | Best for |
|--------|-----------|----------|
| ThreadPoolExecutor | Minimal (no new infra) | v1, under 500 users |
| Firestore-based job tracker | Low (just Firestore docs) | v1.5, simple persistence |
| Google Cloud Tasks | Medium (managed service) | v2, 500+ users, needs reliability |
| Celery + Redis | High (new service to run) | Only if you need Celery-specific features |

**Recommendation:** Start with ThreadPoolExecutor. Migrate to Cloud Tasks when you hit a limit.

## Smallest possible prototype (1 day of work)

1. Pick ONE test user. Hardcode the user_id.
2. Write 3 agents: `job_hunter_agent`, `contact_finder_agent`, `email_drafter_agent`
3. Write `run_daily_for_user(user_id)` with ThreadPoolExecutor
4. Expose as Flask route: `POST /api/admin/run_daily/<user_id>`
5. Run it. Check Firestore for results.
6. If the queue populates with good emails → the architecture works

The hard part isn't the parallelism (~200 lines of Python). The hard part is:
- Email drafter producing good output (Phase 1 work)
- Signal detector finding actually useful signals
- Coordinator ranking the queue intelligently

Those are AI/product problems, not infrastructure problems.

## Firestore data model for daily runs

```
daily_runs/{run_id}
  ├── user_id: string
  ├── status: "running" | "completed" | "partial" | "failed"
  ├── created_at: timestamp
  ├── completed_at: timestamp
  ├── agent_stats: { total: N, succeeded: N, failed: N }
  │
  ├── jobs/{job_id}
  │   ├── company: string
  │   ├── role: string
  │   ├── url: string
  │   ├── source_query: string
  │   │
  │   └── contacts/{contact_id}
  │       ├── name: string
  │       ├── email: string
  │       ├── linkedin: string
  │       ├── is_alumni: boolean
  │       ├── signals: [{ type: string, content: string, date: string }]
  │       └── email_draft: { subject: string, body: string, status: "draft" | "approved" | "sent" }
```

This structure maps directly to the pipeline UI in Phase 2: each job card shows its contacts and their draft emails inline.
