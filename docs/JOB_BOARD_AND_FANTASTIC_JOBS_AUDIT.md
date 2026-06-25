# Job Board & Fantastic Jobs API — Diagnostic Audit

**Date**: 2026-06-02
**Scope**: Student-facing Job Board ("Jobbot") + Fantastic Jobs API integration
**Triggered by**: User report — "only 18 jobs showing in job board despite 20–30k in the DB; save button doesn't work; we may be leaking FJ credits"

## TL;DR

| Concern | Verdict | Severity |
|---|---|---|
| Only ~18 jobs render in the job board | **Confirmed — backend-imposed display cap, not a data shortage** | **High** (product) |
| "Save job" button does nothing | **Confirmed — backend endpoint missing entirely; frontend POST 404s** | **High** (broken feature) |
| Fantastic Jobs API credit leak | **Not confirmed — current daemons use FREE endpoints; manual paid path exists but is gated by CLI flag** | Low (process risk only) |
| Are we using FJ API optimally | **Mostly yes; three tightening opportunities identified** | Medium (cost efficiency) |

Bottom line: the job board feels broken because two distinct things are wrong — (1) a deliberately tight display cap from earlier widget-style UX, and (2) a missing save-job endpoint. Neither is data-pipeline-related. Fantastic Jobs spend is under control; the user's intuition about a leak is most likely the cost of running the `--fantastic-only` 7d backfill on a recurring cadence rather than a hidden runaway.

---

## 1. Why only ~18 jobs render

### Pipeline trace

```
Browser
  └─ JobBoardPage.tsx renders feed.new_matches + feed.top_jobs
       └─ apiService.getJobFeed() → GET /api/jobs/feed
            └─ backend/app/routes/jobs.py :: job_feed()
                 ├─ Reads users/{uid}/jobFeedCache (Firestore)
                 ├─ _fetch_new_matches() → reads `jobs` collection, last 24h, limit 120
                 │     ↓ _is_international_job + _is_excluded_job filters
                 │     ↓ _dedup_by_title_company()
                 │     ↓ cap_per_company(deduped, max_per_company=2)
                 │     ↓ [:20]
                 └─ top_jobs path → reads `jobs` collection, order by posted_at, limit 80
                       ↓ _is_international_job + _is_excluded_job filters
                       ↓ cap_per_company(top_jobs, max_per_company=3)
                       ↓ [:50]
```

### Root cause — hard caps in `backend/app/routes/jobs.py`

| Line | Code | What it does |
|------|------|--------------|
| `409` | `.limit(120)` on jobs from last 24h | Window for new_matches |
| `432` | `cap_per_company(deduped, max_per_company=2)[:20]` | Hard ceiling: 20 new_matches |
| `521` / `549` | `.limit(80)` on jobs ordered by `posted_at` | Window for top_jobs |
| `525` / `553` | `cap_per_company(top_jobs, max_per_company=3)[:50]` | Hard ceiling: 50 top_jobs |

**Theoretical max**: 20 + 50 = 70 jobs. **Observed**: ~18 because:
- `_is_international_job` discards non-US postings
- `_is_excluded_job` discards categories flagged as inappropriate for undergrads
- `_dedup_by_title_company` collapses near-duplicate titles ("Teller (Full Time)" + "Teller (Part Time)" → one)
- `cap_per_company` caps any single employer at 2 (new_matches) or 3 (top_jobs)
- Overlap between new_matches and top_jobs (frontend may deduplicate further)

After all five filters stack, 18–20 is the steady state. The Firestore `jobs` collection itself almost certainly has 20–30k rows as the user states — those rows simply never reach the response.

### Recommended fix

In `backend/app/routes/jobs.py`:

1. **Widen the Firestore reads** so dedup/cap_per_company have headroom:
   - L409: `.limit(120)` → `.limit(400)`
   - L521 + L549: `.limit(80)` → `.limit(500)`

2. **Raise the display caps**:
   - L432: `cap_per_company(deduped, max_per_company=2)[:20]` → `cap_per_company(deduped, max_per_company=4)[:60]`
   - L525 + L553: `cap_per_company(top_jobs, max_per_company=3)[:50]` → `cap_per_company(top_jobs, max_per_company=5)[:150]`

3. **Add pagination** for top_jobs. Accept `?page=N&page_size=50` on `/api/jobs/feed`, default 50, max 100. Frontend `JobBoardPage.tsx` adds infinite scroll.

`cap_per_company` is intentionally kept — without it a single high-volume employer (Amazon, Deloitte) saturates the feed. Raising the cap from 2/3 to 4/5 preserves variety while letting the page actually fill.

---

## 2. Save-job button is broken

### Root cause

The frontend at `connect-grow-hire/src/services/api.ts:1921` calls:

```ts
async saveJob(job: SavedJob): Promise<{ success: boolean; job_id: string }> {
  return this.makeRequest(...)('/job-board/saved-jobs', { method: 'POST', body: JSON.stringify(job) });
}
```

This resolves to `POST /api/job-board/saved-jobs` (the `job_board_bp` blueprint at `backend/app/routes/job_board.py:36` is mounted at `url_prefix="/api/job-board"`).

**No such route exists**. `grep -rn "saved-jobs" backend/app/routes/` returns only a single read at `backend/app/routes/jobs.py:312`:

```py
saved_snap = user_ref.collection("savedJobs").stream()
```

That read powers a "saved-company affinity" badge but does not service the write path. The frontend save handler at `JobBoardPage.tsx:827-850` catches the failure silently and toasts "Couldn't update saved jobs."

### Recommended fix

Add three routes to `backend/app/routes/job_board.py` under the existing `job_board_bp`:

```python
@job_board_bp.route("/saved-jobs", methods=["GET"])
@require_firebase_auth
def list_saved_jobs():
    uid = request.firebase_user["uid"]
    db = get_db()
    snap = db.collection("users").document(uid).collection("savedJobs").stream()
    saved = [d.to_dict() | {"job_id": d.id} for d in snap]
    return jsonify({"saved": saved, "count": len(saved)})

@job_board_bp.route("/saved-jobs", methods=["POST"])
@require_firebase_auth
def save_job():
    uid = request.firebase_user["uid"]
    payload = request.get_json() or {}
    job_id = payload.get("job_id")
    if not job_id:
        return jsonify({"error": "job_id required"}), 400
    db = get_db()
    db.collection("users").document(uid).collection("savedJobs").document(job_id).set({
        "job_id": job_id,
        "title": payload.get("title"),
        "company": payload.get("company"),
        "location": payload.get("location"),
        "apply_url": payload.get("apply_url"),
        "match_score": payload.get("match_score"),
        "saved_at": firestore.SERVER_TIMESTAMP,
    })
    return jsonify({"success": True, "job_id": job_id})

@job_board_bp.route("/saved-jobs/<job_id>", methods=["DELETE"])
@require_firebase_auth
def unsave_job(job_id: str):
    uid = request.firebase_user["uid"]
    db = get_db()
    db.collection("users").document(uid).collection("savedJobs").document(job_id).delete()
    return jsonify({"success": True, "job_id": job_id})
```

No `wsgi.py` change needed — `job_board_bp` is already registered. The frontend already sends the correct payload (`JobBoardPage.tsx:834-842`), so no frontend change required.

---

## 3. Fantastic Jobs API — credit audit

### Inventory of every call site

| # | Site | Trigger | Endpoint | Credit cost | Necessary? |
|---|------|---------|----------|-------------|------------|
| 1 | `wsgi.py:620-631` `_fantastic_modified_loop` | Daemon, every 24h | `/modified-ats-24h` | **FREE** (1 Request credit, 0 Jobs credits) | ✓ Yes |
| 2 | `wsgi.py:648-659` `_fantastic_expired_loop` | Daemon, every 24h | `/active-ats-expired` | **FREE** (1 Request credit) | ✓ Yes — needed to mark expired |
| 3 | `pipeline/main.py:150-175` `run_fantastic_only()` | Manual CLI `--fantastic-only` | `/active-ats-7d` (10 recipes × limit=100) | **PAID** (~1000 Jobs credits/run) | Backfill only |
| 4 | `pipeline/main.py:178-208` `run_fantastic_modified()` | Manual CLI `--fantastic-modified` | `/modified-ats-24h` | **FREE** | Duplicate of daemon |
| 5 | `pipeline/main.py:121-147` `run_pipeline()` default | Manual CLI `python pipeline/main.py` | `/active-ats-7d` (unless `--skip-fantastic`) | **PAID** | Conditionally needed |

### Verdict

**No runaway leak found.** Both scheduled daemons hit FREE endpoints. The expensive path is gated by an explicit CLI argument that requires someone to type `--fantastic-only` or to run `python pipeline/main.py` without `--skip-fantastic`.

The user's "leaking credits" intuition most likely traces to: running the `--fantastic-only` 7d sweep on a recurring cadence (cron, GitHub Action, etc.) somewhere outside this repo. Worth verifying — but inside this codebase, there's no automatic paid call.

### Recommended hardening

1. **Gate `run_fantastic_only`** behind `FJ_FULL_BACKFILL_ENABLED=true` env. Prevents accidental burns:
   ```python
   def run_fantastic_only():
       if os.getenv("FJ_FULL_BACKFILL_ENABLED", "false").lower() != "true":
           print("FJ_FULL_BACKFILL_ENABLED=false — refusing to spend ~1000 Jobs credits. Set the flag explicitly.")
           sys.exit(2)
       ...
   ```

2. **Flip the default in `run_pipeline()`** so Fantastic Jobs is opt-in via `--include-fantastic-7d` rather than opt-out via `--skip-fantastic`. Daily delta + expired daemons already keep the index fresh.

3. **Persist quota snapshots**. The fetcher already logs `x-ratelimit-jobs-remaining` (`fetcher.py:739-747`). Add a daily Firestore write at `system/fj_quota/snapshots/{yyyy-mm-dd}` so quota burn-down is queryable without scraping logs.

---

## 4. Fantastic Jobs API — vendor research

### Pricing model

- **Per job returned, not per request.** The API bills based on result-set size.
- ATS/Career feed: **$1–$9 per 1,000 jobs**.
- LinkedIn SKU (separate product): **$0.75–$4.50 per 1,000 jobs**.
- RapidAPI plan tiers for Active Jobs DB: **Basic** $0 (250 req/mo, 1000 req/hr cap), **Pro** $45 (~5k req/mo, 2 RPS), **Ultra** $95 (~20k req/mo). Enterprise above 200k jobs/mo.

### Endpoint families

| Endpoint | Cost model | Page size | Use case |
|----------|-----------|-----------|----------|
| `/active-ats-7d` | Paid (per job returned) | 100 (locked floor) | Initial backfill, weekly broad sweep |
| `/active-ats-backfill` | Paid | Up to 500 | Bulk history (up to ~6 months) |
| `/modified-ats-24h` | **FREE** (1 Request credit per call) | 500 | Daily delta — recommended |
| `/active-ats-expired` | **FREE** (1 Request credit per call) | n/a (ID list) | Reconciliation |

### Rate limits

- Generic RapidAPI `X-RateLimit-*` headers. No vendor-specific signalling.
- Basic: 1000/hr. Pro: 2 RPS. Implement 429 backoff — Offerloop's `fetcher.py:666-669` already does this (60s sleep + single retry).

### Pagination

- `offset` + `limit`. Each page billed (jobs returned count toward quota — no free pagination).
- Hourly endpoint has a **100-job floor**. You cannot peek cheaper than 100 jobs even if you only need 5.
- Backfill goes up to 500/page.

### Server-side filters (the cost lever)

Per vendor docs (verify exact spelling in RapidAPI console — the playground is JS-rendered and not fully scrapable):

- `title_filter`, `advanced_title_filter`
- `location_filter`
- `description_filter`, `description_type` (toggle off HTML to shrink payload)
- `remote`
- `organization_filter`
- `ai_employment_type_filter` ← key for "internships only"
- `ai_experience_level_filter` ← key for "entry-level only"
- `ai_work_arrangement_filter`
- `date_filter` / `posted_after`
- `include_ai`, `offset`, `limit`

**Implication**: every job filtered server-side is a job not billed. Offerloop's `FANTASTICJOBS_CALLS` recipes in `fetcher.py:680` use role-title and organization filters — good. Should additionally use `ai_experience_level_filter` for intern/new-grad recipes if not already set, so the API doesn't return senior-role jobs that get dropped client-side.

### Response shape

Stable fields per job: `id` (use for dedup), `url`, `source`, `source_domain`, `title`, `organization`, `organization_url`, `organization_logo`, `linkedin_org_*`, `date_posted`, `date_created`, `locations_raw`, `cities_derived`, `countries_derived`, `lats_derived`, `lngs_derived`, `remote_derived`, `salary_raw`, `employment_type`, `recruiter_*` (LinkedIn SKU only), `ai_*` (employment_type, experience_level, work_arrangement, etc.).

### Gotchas

- **Cross-SKU duplicates**: if subscribed to both Active Jobs DB and LinkedIn SKU, the same role can return from both with different IDs. Dedup by canonical URL or organization+title.
- **100-job floor on hourly**: you can't peek cheaply — every call to the hourly endpoint costs ~100 jobs.
- **Expired listings are NOT auto-purged.** You must hit the Expired endpoint or your DB rots. Offerloop does this daily via `_fantastic_expired_loop`. ✓
- HTML descriptions are heavy. `description_type=text` cuts payload significantly (doesn't affect billing, but reduces Firestore write cost + latency).
- **No webhooks.** Polling-only architecture.

### Best-practice integration pattern

1. **Backfill once** per audience segment via `/active-ats-backfill` (500/page).
2. **Daily delta** via `/modified-ats-24h` (FREE) keyed on `date_filter`.
3. **Daily reconciliation** via `/active-ats-expired` (FREE).
4. **Server-side filter aggressively** — AI experience/employment-type for "internships only" recipes.
5. **Dedup on `id`** at write time.
6. **Cache display 1–3h** (jobs don't change minute-to-minute).

Offerloop already follows 2, 3, 5. Backfill (1) is implicit via the manual `--fantastic-only` runs. (4) is partial. (6) is enforced via the `jobFeedCache` user document (5-min cache window in `jobs.py:396`).

---

## 5. Action items (prioritized)

| Pri | Action | File(s) | Effort |
|-----|--------|---------|--------|
| P0 | Add `GET/POST/DELETE /api/job-board/saved-jobs` routes | `backend/app/routes/job_board.py` | ~30 min |
| P0 | Raise feed caps (120→400, 80→500, 20→60, 50→150) | `backend/app/routes/jobs.py:409, 432, 521, 525, 549, 553` | ~15 min |
| P1 | Add `page`/`page_size` pagination to `/api/jobs/feed` + frontend infinite scroll | `backend/app/routes/jobs.py`, `connect-grow-hire/src/pages/JobBoardPage.tsx`, `connect-grow-hire/src/services/api.ts` | ~2 hr |
| P1 | Gate `run_fantastic_only()` behind `FJ_FULL_BACKFILL_ENABLED` env | `backend/pipeline/main.py:150` | ~5 min |
| P1 | Flip `run_pipeline` default to opt-in for FJ 7d | `backend/pipeline/main.py:121` + CLI parser | ~10 min |
| P2 | Audit FJ recipes for missing `ai_experience_level_filter` / `ai_employment_type_filter` | `backend/pipeline/fetcher.py` (the `FANTASTICJOBS_CALLS` constant) | ~30 min |
| P2 | Persist daily FJ quota snapshot to `system/fj_quota/snapshots/{yyyy-mm-dd}` | `backend/pipeline/fetcher.py:739-747` | ~15 min |
| P2 | Pass `description_type=text` on the 7d sweep | `backend/pipeline/fetcher.py:716` | ~2 min |

---

## 6. Verification

After implementing P0/P1 fixes:

```bash
# 1. New routes registered
cd ~/work/Offerloop && LIST_ROUTES=1 python backend/wsgi.py | grep saved-jobs
# Expect: GET, POST, DELETE on /api/job-board/saved-jobs

# 2. Backend smoke
python backend/wsgi.py
# Separate terminal:
cd connect-grow-hire && npm run dev
# Browser: sign in → /job-board
# - Confirm > 18 jobs visible (target 50–150 on top_jobs tab)
# - Click "Save" → Network tab shows POST 200, badge persists across reload
# - Click "Unsave" → DELETE 200, badge gone

# 3. FJ gating
python backend/pipeline/main.py --fantastic-only
# Expect: refusal + exit 2

FJ_FULL_BACKFILL_ENABLED=true python backend/pipeline/main.py --fantastic-only
# Expect: normal run (DO NOT RUN unless intentional — burns ~1000 Jobs credits)

# 4. Regression
cd backend && pytest tests/ -k "jobs or feed or job_board" -x
```

---

## Sources

- Fantastic Jobs API homepage: https://fantastic.jobs/api
- Fantastic Jobs about: https://fantastic.jobs/about
- RapidAPI organization page: https://rapidapi.com/organization/fantastic-jobs
- Active Jobs DB endpoint: https://rapidapi.com/fantastic-jobs-fantastic-jobs-default/api/active-jobs-db
- Active Jobs DB pricing: https://rapidapi.com/fantastic-jobs-fantastic-jobs-default/api/active-jobs-db/pricing
- LinkedIn SKU: https://rapidapi.com/fantastic-jobs-fantastic-jobs-default/api/linkedin-job-search-api
- Internships SKU pricing: https://rapidapi.com/fantastic-jobs-fantastic-jobs-default/api/internships-api/pricing
