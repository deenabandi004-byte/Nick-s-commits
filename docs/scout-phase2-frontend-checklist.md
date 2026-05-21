# Scout Phase 2 - Manual Frontend Acceptance Checklist

Browser steps to verify the Scout approve flow and floating chat.

> **PRECONDITION - NOT YET RUNNABLE.** As of this writing the Scout frontend
> for Phase 2 does **not exist**. `useScoutChat.ts` still reads the old
> `navigate_to` / `auto_populate` / `action_buttons` response shape; there is no
> approve card, no floating-chat refactor, and no `{ route, prefill, expires_at }`
> bridge. The backend was cut over to the new `{ tool, message, navigate }`
> contract, so the live panel currently shows Scout's text but cannot navigate
> or prefill. This checklist is the acceptance spec to run **after** the
> frontend (Phase 2 items 4 and 5) is built.

## Setup
- Run backend and frontend locally, signed in as a test user with a known
  credit balance.
- Have DevTools open (Console + Application > Session Storage).

---

### 1. Floating chat persists across navigation
1. Go to `/dashboard`. Open Scout.
2. Send: `take me to the job board`.
3. Scout navigates you to `/job-board`.
- [ ] Chat panel stays open after the route change.
- [ ] The conversation history (your message + Scout's reply) is still visible.
- [ ] Panel is bottom-right and can be collapsed to a button, then reopened.

### 2. Approve card with editable chips
1. On `/dashboard`, send: `find software engineers at Datadog in Boston`.
2. Scout returns an inferred navigate (not imperative).
- [ ] An approve card renders inline in the chat.
- [ ] Card shows the reasoning sentence as the summary.
- [ ] Card shows the destination route as a small badge (`/contact-search`).
- [ ] Each prefill field is an editable chip: `job_title`, `company`, `location`.
3. Click the `company` chip, change `Datadog` to `Stripe`, confirm.
4. Click Approve.
- [ ] You land on `/contact-search` with company = **Stripe** (the edited value), not Datadog.
- [ ] The approve card stays in chat history, collapsed.

### 3. Skip-approve on imperative, no credit cost
1. On `/dashboard`, send: `take me to the job board`.
- [ ] Scout navigates immediately to `/job-board`, no approve card.
- [ ] A toast appears, roughly: "Scout took you to /job-board".

### 4. Always-approve on a credit-spending page
1. On `/dashboard`, send: `take me to contact search`.
- [ ] Despite the imperative phrasing, an approve card is shown (contact search spends 15 credits per result).
- [ ] The card communicates the credit cost before you approve.

### 5. In-place populate (already on destination)
1. Navigate to `/contact-search` manually.
2. Open Scout, send: `find engineers at Google`.
- [ ] No navigation happens (you stay on `/contact-search`).
- [ ] The page's form fields fill in place (company = Google).
- [ ] A toast appears, roughly: "Scout filled in the search".

### 6. Clarify renders as a chat message
1. On `/dashboard`, send: `help me prep`.
- [ ] Scout replies with a single clarifying question as a normal chat message.
- [ ] No approve card, no navigation.

### 7. Stale prefill is ignored
1. On `/dashboard`, get a Scout navigate suggestion for `/contact-search` but do NOT approve.
2. Wait 60 seconds.
3. Manually navigate to `/contact-search` yourself.
- [ ] The form is empty - the stale prefill (past its ~30s window) does NOT apply.
4. In Application > Session Storage, confirm the prefill entry has an `expires_at`
   (or timestamp) and is ignored when expired.

### 8. Multi-page route-keyed bridge
For each page below, trigger a Scout navigate with prefill, approve, and confirm
the destination reads the route-keyed bridge and fills its own fields:
- [ ] `/meeting-prep` - prefill `linkedin_url`
- [ ] `/interview-prep` - prefill `company`, `job_title`
- [ ] `/write/cover-letter` - prefill `company`, `job_title`
- [ ] `/contact-search` and `/firm-search` still work (migrated to the new bridge shape, no `search_type` special-casing).

---

## Result
- Date run:
- Pass / Fail per item: (record above)
- Bugs found:
