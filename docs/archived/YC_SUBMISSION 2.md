# Coding agent session — Offerloop.ai job-board overhaul

**One sitting. ~10 hours. 20 commits. $0.78 in new API spend. Working tree
finishes clean.**

I'm a graduating senior at USC and co-founder of Offerloop.ai, an AI
networking tool for college students recruiting into consulting, IB,
and tech. We have 300+ active users, 41 paying subscribers, and a 22%
free-to-paid conversion rate.

Tonight I worked with Claude Code on a job-board overhaul I'd been
planning for weeks — a multi-phase audit doc that involved scheduling
our ingest pipeline, structured-extracting every job posting via
Firecrawl, building a semantic resume-to-job matching ranker on top
of OpenAI embeddings, adding hard intent gates, and shipping an
editorial UI redesign.

## What shipped (verifiable in the transcript)

- 20 commits to `main`, ~4,000 LOC net delta
- Audit doc Phases 0, 1, 2 + an embedding-based ranker shipped
  end-to-end on the same night
- Phase 3 explicitly **deferred** based on data — not because we ran
  out of time
- Two production crash hotfixes: JSON-LD location dicts crashing the
  feed; list-typed `preferredLocation` crashing the ranker (both had
  been silently 500-ing for some users)
- Security gap closed: clients could write `credits: 999999` directly
  to their own Firestore user doc and bypass paywalls. Now blocked.
- One-shot data migration: 388 job embeddings moved from inline on the
  `jobs` collection to a dedicated `job_embeddings` collection,
  reducing Firestore egress on the bulk feed query by ~200×
- Cost-aware: caught a GitHub Actions free-tier overrun (3,660
  min/month forecasted) and halved a cron schedule to fit
- 8 planning docs committed; 28-file personalization-layer WIP
  stashed with documented recovery steps for tomorrow

Total recurring cost added: ~$60/month on top of existing ~$660/month.
One-shot backfill cost: $0.78.

## What's actually worth looking at

If a reviewer has 5 minutes, these are the moments that matter:

**1. Probe before build.** Before committing to Phase 3 (Perplexity-
powered "dream company spotlight" feed), the agent ran real Perplexity
queries with my actual dream companies. The probe revealed Perplexity
returns "no results" for company-specific queries — saving 3 days of
work on a feature that would have surfaced mostly empty sections.

**2. Adoption recount that flipped a conclusion.** The agent initially
told me only 2.1% of users had `dreamCompanies` set. A second probe
across all schema paths found the data was actually present at 45.5%
— under a different field path the gate code wasn't reading. One-line
backend fix; the gate immediately worked for half my user base instead
of zero.

**3. Visual validation caught a 100%-dropped-feed bug.** After shipping
the hard intent gates, the agent ran them against my real cached feed
instead of trusting the code "looked right." Discovered the gates were
dropping all 41 jobs because `"Los Angeles, CA"` doesn't substring-
match into `"Los Angeles"`. Fixed with tokenization + state-level
fallback before any user ever saw the broken state.

**4. Pushed back on me, repeatedly.** Recommended stopping ~4 times
during the session. Refused to build Phase 3 after the data made it
uneconomic ($200–300/month for a feature serving 8 users). Surfaced
cost concerns proactively. Flagged my own UX adoption gap as "not worth
the Perplexity layer until this improves." Not sycophantic.

**5. Self-correction in the open.** The intent gates needed three
follow-up commits before producing correct results. The first
embedding backfill (at concurrency 8) hit Firecrawl's rate limit and
94% of jobs failed; recovered to concurrency 2. The first data
migration hit a Firestore "transaction too big" error mid-stream;
recovered to per-doc commits. Each failure and recovery is in the log.
Production work looks like this.

## Honest limitations

- **It's long.** ~10 hours, 20 commits. There's fatigue at the edges.
- **The intent gates needed three iterations** before producing correct
  results. A polished single-shot generation would look better; this
  is what real iteration looks like.
- **I tried to run `/codex review` for an independent second-opinion
  AI pass, but the binary wasn't installed.** Fell back to Claude's own
  `/review` skill, which catches structural issues but isn't a true
  cross-model voice.
- **Some agent responses are verbose.** Could have been tighter.

## Why this session

Most demo sessions are 100-line one-shot generations. This is a
10-hour working session on a real product with paying users, where the
agent shipped code, audited its own work, refused to build features
that didn't pencil out, made mistakes, recovered from them, and pushed
back when I was overreaching.

If YC's reviewers want to see what it looks like when a coding agent
acts more like a co-founder than an autocompleter — testing
assumptions before committing engineering time, flagging cost concerns
without being asked, refusing to ship economically-bad features — this
is the session.

---

**Project**: https://offerloop.ai
**Repo**: `deenabandi004-byte/Final_offerloop` (private)
**Audit doc the session followed**: `JOB_BOARD_AUDIT_PERPLEXITY_FIRECRAWL.md`
(committed in the session itself, commit `521a9bd`)
**Tool**: Claude Code (Anthropic), Opus 4.7 (1M context)
