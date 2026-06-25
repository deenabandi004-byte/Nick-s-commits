# Tomorrow's job-board TODOs

## ✅ Resolved tonight (after the original list was written)

- **GitHub Actions free-tier overrun** → commit `d46a409` (`15 * * * *`, fits free tier)
- **titleEmbedding bloats every jobs query** → commit `9c73a2f` + migration (388 embeddings moved to `job_embeddings/{job_id}` collection)
- **Backfill scan transfers ~166MB** → resolved by the embedding refactor (jobs docs are now small again; `_collect_backfill` is still useful for future legacy scans, no longer expensive)
- **Firestore security rules** → commit `6dbc2ac` (added `resumeEmbedding`, `resumeEmbeddingHash`, `credits`, `lastCreditReset`, usage counters, `jobFeedCache` to the blocklist; deployed via `firebase deploy --only firestore:rules`)
- **Sequential gate counts mislead the SPA banner** → commit `6dbc2ac` (independent per-gate evaluation + new `dropped` field for the headline count)

## 🔜 Still open

### Dream company adoption (~3.3% real)

Onboarding asks for dreamCompanies but ~92% of users skip. Adding a typeahead
input wired to `companies.ts` would likely 5-10× adoption. ~30-45 min of UX work.

**Files**:
- `connect-grow-hire/src/pages/OnboardingGoals.tsx` (lines 182-209: free-text Input + helper text "Press Enter or comma after each company")
- `connect-grow-hire/src/data/companies.ts` (if exists per CLAUDE.md's mention of 8 static data files)

**Value**: deterministic ranker already gives `+15` score for dream-company matches; higher adoption immediately improves feed quality even without Phase 3.

### Phase 3 (Perplexity dream-company spotlight) — DEFERRED

The probe showed Perplexity returns "no results" / vendor jobs for
company-specific queries. Don't build until:
1. Perplexity quality improves for company-specific search, OR
2. dreamCompanies adoption is high enough that a polished fallback experience
   (e.g., "We hunted for X jobs at Stripe today — none found") is worth it

### Personalization-layer WIP — stashed for proper per-phase commits

The "unstaged sprawl" was actually a 9-phase **personalization data layer**
(see `PERSONALIZATION_DATA_LAYER.md`) — ~3K LOC across 28 files, each phase
feature-flag-gated default-OFF. Way too big for a tired commit.

**Now stashed** at `stash@{0}`:
```
git stash show -p stash@{0} | less   # review the diff
git stash apply stash@{0}            # unstash without dropping the stash
```

The doc has per-phase file lists, so the natural workflow tomorrow is:
1. `git stash apply stash@{0}` (don't pop yet)
2. For each of P1-P9: `git add <files-from-doc>` + commit with phase name
3. Push
4. `git stash drop stash@{0}` once everything's committed

Expected total: ~2-3 hours of careful work for a clean per-phase history.

**Caveat — there were already 2 prior stashes** (`stash@{1}`, `stash@{2}`)
from earlier sessions. Review all three before deciding what's still relevant:
```
git stash list
git stash show stash@{1} --stat
git stash show stash@{2} --stat
```

### Smaller items

- `_serialize_jobs:157` still has `doc.pop("titleEmbedding", None)` — harmless
  but dead code now that embeddings live in a separate collection. Drop on the
  next pass.
- Backwards-compat legacy-emb code in `get_job_embeddings` can be removed in
  ~1 week once we're confident no doc still has `titleEmbedding` (sample of
  2000 currently shows 0).
