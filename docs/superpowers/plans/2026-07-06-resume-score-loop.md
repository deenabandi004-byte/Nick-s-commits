# Resume Score-and-Approve Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Resume Edit tab's form editor with: the PDF + a **Score resume** button → LLM evaluation (Harvard rubric, strong model) with a score and path-targeted recommended changes → user approves changes → PDF visibly updates → automatic rescore with the new score shown.

**Architecture:** New lean backend endpoint `POST /api/resume/score` (service `resume_scoring.py`, gpt-4o JSON mode) takes the structured `resumeParsed` and returns `{score, label, categories, summary, recommendations[]}` where each recommendation targets an exact path (`experience[i].bullets[j]` or `projects[i].description`) with verbatim `current` and rewritten `proposed` text. The client applies approved edits to `resumeParsed` (verify-then-replace), saves, lets the existing debounced PDF preview regenerate, and auto-rescores. Mine `git show 21d1cac^:backend/app/routes/resume_workshop.py` `_score_resume` (line 221) for prompt/rubric raw material — but the new contract is structured-target based, not text-blob based.

**Tech Stack:** Flask + openai (sync `get_openai_client`, `response_format json_object` — house pattern in `prompt_parser.py:149`), pytest with mocked client. React: rework of `ResumePage.tsx` Edit tab only.

## Global Constraints

- Model: `gpt-4o` (the "pretty good model"; house precedent from the old workshop scorer). Temperature ≤0.4.
- Rubric grounded in Harvard Mignone Center guidance (already applied to the PDF template): action-verb bullets, quantified results, no pronouns, no summary/objective, consistency, one page. Score 0–100 with labels Needs Work (<60) / Good (60–74) / Very Good (75–89) / Excellent (90+).
- Recommendations MUST be mechanically applicable: `target` limited to `{section:'experience', index, bullet}` (bullets) and `{section:'projects', index, field:'description'}`; `current` must be the verbatim existing text. The SERVICE validates every recommendation against the actual parsed structure and drops any whose path or `current` doesn't match — the client never receives unapplicable recs.
- Scoring costs no credits in v1 (evaluation only). Auth required.
- Frontend: Edit tab = PDF + score rail ONLY (the structured form editor is REMOVED — git history keeps it). Tailor tab untouched. Existing debounced real-PDF preview machinery stays and is what makes approved changes visible.
- Persist `{resumeScore, resumeScoreLabel, resumeScoredAt}` to the user doc after each scoring so the score shows on next visit (fields are client-writable; not in rules deny-list).
- Backend: no other route/service files touched. Frontend: only `ResumePage.tsx`, plus one thin `apiService` wrapper in `api.ts`.
- Repo carries unrelated WIP: `git add` only named paths; run backend commands from `backend/`, frontend from `connect-grow-hire/`.

---

### Task 1: Backend scoring endpoint

**Files:**
- Create: `backend/app/services/resume_scoring.py`
- Modify: `backend/app/routes/resume.py` (add `POST /api/resume/score` to the existing `resume_bp`)
- Test: `backend/tests/test_resume_scoring.py`

**Interfaces (produced):**
- `score_resume_structured(parsed: dict) -> dict` raising `ValueError` on empty/invalid parsed input. Return shape:
```json
{
  "score": 78, "score_label": "Very Good",
  "summary": "…",
  "categories": [{"name": "Impact & Results", "score": 70, "explanation": "…"}, …4 categories…],
  "recommendations": [{
    "id": "rec_1", "category": "Impact & Results", "reason": "…",
    "target": {"section": "experience", "index": 0, "bullet": 2},
    "current": "<verbatim existing bullet>", "proposed": "<rewritten bullet>"
  }]
}
```
- Route: `POST /api/resume/score`, `@require_firebase_auth`; body `{resumeParsed?}`; falls back to the user doc's `resumeParsed`; 400 if neither has content; 502-style `{"error": …}` if the LLM call fails after one retry.

**Steps:**
- [ ] Write failing tests first (mock `get_openai_client` — patch at `app.services.resume_scoring.get_openai_client`): (1) happy path returns validated shape; (2) recommendation with non-existent path (experience index out of range / bullet out of range / wrong section) is DROPPED; (3) recommendation whose `current` doesn't match the actual text (after whitespace-normalize) is DROPPED; (4) empty parsed → ValueError; (5) malformed LLM JSON → one retry, then raises; (6) score clamped to 0–100 int, label derived server-side from score (not trusted from LLM).
- [ ] Implement service: prompt embeds the parsed resume as indexed JSON (`experience[0].bullets[0]: "…"` style listing so the model can cite paths), the Harvard rubric, the exact response contract, and hard rules (max 8 recommendations, `current` copied verbatim, only the two allowed target shapes). Validate + sanitize as tested. Sync client, `model="gpt-4o"`, `response_format={"type": "json_object"}`, `temperature=0.3`, `max_tokens=3000`.
- [ ] Route in `resume.py` following its existing patterns (`get_db`, `request.firebase_user["uid"]`).
- [ ] Run: `cd backend && python3 -m pytest tests/test_resume_scoring.py -v -p no:warnings` → green; `python3 -m pytest tests/ -k resume -q` for neighbors.
- [ ] Commit only the three files: `feat(resume): /api/resume/score — Harvard-rubric LLM scoring with path-targeted recommendations`

### Task 2: Frontend score-and-approve loop

**Files:**
- Modify: `connect-grow-hire/src/pages/ResumePage.tsx` (Edit tab rework)
- Modify: `connect-grow-hire/src/services/api.ts` (add `scoreResume(resumeParsed): Promise<ResumeScoreResponse>` wrapper + response types, following the file's auth-header conventions)

**Steps:**
- [ ] Remove the form editor column and its now-unused sub-components/updaters (keep `resumeData` state, load/normalize, upload/replace, Save-if-dirty logic can go if nothing edits state anymore EXCEPT the apply flow — keep a minimal internal save used after applying changes).
- [ ] New Edit-tab layout: PDF preview (existing debounced iframe, now the dominant element, ~2/3 width on lg) + right rail:
  - Initial state: "Score my resume" primary button (+ last saved score chip if `resumeScore` exists on the user doc, with its date).
  - Scoring state: spinner + "Scoring against Harvard resume standards…".
  - Scored state: big score + label + per-category bars/numbers + summary; below, the recommendations list — each card: category chip, reason, `current` (struck/red-tinted) → `proposed` (green-tinted), checkbox checked by default; footer "Apply N selected changes".
  - Apply: for each selected rec, verify-then-replace in `resumeData` (whitespace-normalized compare against `current`; skip mismatches with a toast count), `updateDoc` the new `resumeParsed` + `resumeUpdatedAt`, let the preview regenerate (existing effect), then AUTO-RESCORE: call the endpoint again with the new parsed, show "Rescoring…" then the new score with a delta badge ("78 → 86 ▲8"), persist `{resumeScore, resumeScoreLabel, resumeScoredAt}`.
  - Errors: toast + return to previous state; never lose the user's resume data on a failed apply (apply is all-client, atomic setState before the single updateDoc).
- [ ] Empty state (no resume): unchanged upload CTA; Score button disabled until a resume exists.
- [ ] Verify: `cd connect-grow-hire && npx tsc --noEmit 2>&1 | grep -E "ResumePage|api\.ts"` → nothing new; `npm run build` → ✓.
- [ ] Commit only the two files: `feat(resume): score-and-approve loop replaces form editor on Edit tab`

### Task 3: Review sweep + build

- [ ] Task reviews green (fix loops as needed); final `npm run build` + backend `pytest tests/test_resume_scoring.py`.
