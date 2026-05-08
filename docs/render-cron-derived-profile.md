# Render cron: derivedProfile nightly synthesis

Render configuration lives in the Render dashboard for this project (no
`render.yaml` in the repo). This is the dashboard checklist for adding the
Phase 4 nightly synthesis cron alongside the two existing crons (job board
hourly + nightly cleanup).

## Schedule

- **Cadence:** daily at 03:00 UTC
- **Cron expression:** `0 3 * * *`

## Command

```
python -m backend.scripts.derived_profile_cron --mode nightly
```

Run from the repository root (the script's `sys.path` shim resolves
`app.*` imports either way, but the rest of the backend already runs from
the repo root via `backend.wsgi:app`).

The CLI accepts `--mode {event-triggered,nightly}` and an optional
`--dry-run`. The audit's original prompt referenced `--nightly`; the
script's actual flag is `--mode nightly` and that is what the cron must
use, otherwise argparse exits with `unrecognized arguments`.

## Env vars

Mirror the env-var set used by the existing two Render crons (Render
dashboard → existing job → "Environment"). The synthesis script
specifically reads:

- `DERIVED_PROFILE_ENABLED` — kill switch. Defaults `false`; the script
  short-circuits and exits cleanly when not `true`. Leave `false` until
  the gate ramp is owner-approved.
- `DERIVED_PROFILE_TRIGGER_N` — event-trigger threshold (default `10`).
  Not used by `--mode nightly` but harmless to set.
- `DERIVED_PROFILE_NIGHTLY_HOURS` — staleness window for the nightly
  sweep (default `24`).
- `DERIVED_PROFILE_MAX_USERS` — per-run cap (default `500`).

Plus everything the rest of the backend needs to talk to Firestore +
OpenAI (`GOOGLE_APPLICATION_CREDENTIALS` / service-account env, project
ID, `OPENAI_API_KEY`, etc.). Easiest path: copy the env group from the
existing nightly-cleanup cron in the dashboard rather than re-listing.

## Dashboard steps

1. Render dashboard → New → **Cron Job**.
2. **Environment:** Python; **Region:** match the existing crons.
3. **Build command:** same as the existing crons (typically
   `pip install -r backend/requirements.txt`). The script does not need
   the frontend build, so the full `render-build.sh` is overkill — use
   the slimmer pip-install command the existing crons use.
4. **Schedule:** `0 3 * * *`.
5. **Command:** `python -m backend.scripts.derived_profile_cron --mode nightly`.
6. **Environment:** link to the same env group(s) the existing crons use,
   then add `DERIVED_PROFILE_ENABLED=false` (and the three optional
   tuning vars only if you want to override defaults).
7. Save.

## Verifying the first run

- The script prints a JSON summary on stdout (`run_nightly` returns a dict
  that `main()` json-dumps). When the flag is off, the JSON contains
  `{"skipped": true, "reason": "DERIVED_PROFILE_ENABLED=false"}` —
  expected during the gated rollout.
- When you flip the flag, expect `{"users_scanned": N, "synthesized": M,
  "errors": [...]}` shape. Per-user errors are caught individually so one
  bad user does not abort the sweep (§12 of the eng review).
