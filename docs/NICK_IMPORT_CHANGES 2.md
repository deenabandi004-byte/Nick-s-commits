# Nick's Branch Import — Session Summary

**Audience**: a sibling Claude session cleaning up the codebase.
**Source**: `github.com/deenabandi004-byte/Nick-s-commits@scout-overhaul` (7417e2f).
**Date**: 2026-05-26.

This session brought in 9 UI/UX items plus the full Scout overhaul. **Don't delete or
revert anything listed under "Added" or "Replaced" — it's all wired up and being used.**

## DO NOT DELETE / DO NOT REVERT

### Newly added files (all in active use)
- `scripts/check-app-colors.sh` — design-system color enforcement script (executable)
- `connect-grow-hire/src/utils/linkedinUrl.ts` — `normalizeLinkedInUrl` util
- `connect-grow-hire/src/components/CompanyLogo.tsx` — shared logo component (Clearbit → favicon → monogram fallback). Used by `DashboardPage.tsx`.
- `connect-grow-hire/src/components/ContactAvatar.tsx` — extracted from MyNetworkPage inline component. Used by `MyNetworkPage.tsx`.
- `connect-grow-hire/src/components/ScoutApproveCard.tsx` — plan-then-approve UX card. Used by `ScoutSidePanel.tsx`.
- `connect-grow-hire/src/components/ScoutChatExtras.tsx` — exports `ScoutModePill`, `ScoutToolPill`, `ScoutPlanChecklist`, `ScoutCtaChip`, `ScoutTriedFailedHint`. Used by `ScoutSidePanel.tsx`.
- `connect-grow-hire/src/services/scoutChats.ts` — client for `/api/scout-assistant/chats` endpoints. Used by `ScoutSidePanel.tsx`.
- `connect-grow-hire/src/lib/scoutBridge.ts` — route-keyed sessionStorage prefill bridge (30s expiry). Used by `useScoutChat.ts`, `ScoutSidePanel.tsx`, and 8 page-side consumers (eventually).
- `backend/app/services/scout/` — new package (9 files: `__init__.py`, `cache.py`, `chat_persistence.py`, `metrics.py`, `page_registry.py`, `router.py`, `strategy.py`, `tools.py`, `workflow_state.py`). All imported by `scout_assistant_service.py` and the new tests.
- `backend/tests/test_scout_*.py` — 9 new test files (cutover, cache, chat_persistence, general_knowledge, intent_recognition, metrics, router, strategy, workflow_state).

### Replaced (in place) — do not roll back
- `connect-grow-hire/src/pages/DashboardPage.tsx` — was 21-line redirect stub, now a 1030-line personalized home page. Routed at `/dashboard`. Old behavior (Elite → /agent, others → /find) was REMOVED — this page is the home for everyone now.
- `connect-grow-hire/src/pages/Pricing.tsx` — Nick's overhauled pricing page (annual/monthly toggle, student price toggle, scrolled navbar, mobile menu, public-route signin redirect).
- `connect-grow-hire/src/components/AppSidebar.tsx` — light-mode redesign. White bg, blue active state, bolder 3px left accent. Nav items: Home (`/dashboard`) + Loops (`/agent`, renamed from "Agent") + Find + My Network + Meeting Prep (`/coffee-chat-prep`, label-only rename) + Tracker + Job Board. Profile removed. `dataTour` values kept as ours (e.g. `tour-coffee-chat-prep`) so the existing product tour doesn't break.
- `connect-grow-hire/src/hooks/useScoutChat.ts` — rewritten. Exports new types: `ScoutNavigate`, `ScoutMode`, `ScoutIntent`, `ScoutCta`, `ScoutPlanStep`, `ScoutPlan`, `ScoutToolEvent`, `ChatMessage`, `UseScoutChatReturn`. Old fields `auto_populate`, `navigate_to`, `action_buttons`, `ContactResult`, `EmailPreview` are GONE.
- `connect-grow-hire/src/components/ScoutSidePanel.tsx` — replaced with Nick's 984-line version. Includes chat history rail (Pro/Elite, 160px when in chat mode, panel widens 420→600px).
- `backend/app/services/scout_assistant_service.py` — replaced (2190 → 2678 lines). Class `ScoutAssistantService` with `handle_chat`, `handle_chat_stream`, `handle_search_help`.
- `backend/app/routes/scout_assistant.py` — replaced (597 → 799 lines). Now exports BOTH `scout_assistant_bp` (under `/api/scout-assistant`) AND `scout_admin_bp` (under `/api/admin`). `scout_admin_bp` is registered in `wsgi.py:213`.

### Surgical edits (don't accidentally undo these)
- `backend/wsgi.py` — line 34 imports `scout_admin_bp`; line 205 registers it. Keep both.
- `backend/app/config.py` — `TIER_CONFIGS` credit values bumped: Free 300→500, Pro 1500→3000, Elite 3000→12000. These were a deliberate change to match Nick's pricing page.
- `connect-grow-hire/src/lib/constants.ts` — `TIER_CONFIGS` credit values bumped: Free 150→500, Pro 1800→3000, Elite 3000→12000. Same reason.
- `connect-grow-hire/src/utils/suggestionChips.ts` — `getCompanyDomain` extracted as a new exported function; `getCompanyLogoUrl` refactored to use it; new `getCompanyLogoCandidates` added. Same call sites still work.
- `connect-grow-hire/src/pages/MyNetworkPage.tsx` — **WHOLESALE replaced with Nick's 2768-line version** (was ~1556 + earlier WIP). Brings in:
  - `GroupedShell<T>` generic with list/grid view toggle and drill-in cards
  - Redesigned `PeopleTable`, `CompaniesTable`, `ManagersTable` with new column structures, monospace headers, `CompanyLogo` integration in group headers, sort + recency highlight + bulk delete
  - Inline `AddPersonRow`, `AddCompanyRow`, `AddManagerRow` for direct-in-table editing
  - Inline `normalizeLinkedInUrl` helper (we also have `connect-grow-hire/src/utils/linkedinUrl.ts` exporting the same — minor duplication, dedupe later)
  - Inline `ContactAvatar` component (we also have it at `connect-grow-hire/src/components/ContactAvatar.tsx` — same duplication, dedupe later)
  - `CompanyRow.manualFirmId?: string` for manual-firms bulk-delete tracking (Nick's design — REPLACES our earlier `source: "people" | "firm-search" | "exploring" | "manual_firm"` union approach)
  - `manualFirms` state loaded via `firebaseApi.getManualFirms(uid)`
- `connect-grow-hire/src/services/firebaseApi.ts` — `ManualFirm` interface exported; `getManualFirms`, `createManualFirm`, `deleteManualFirm` methods added.
- `firestore.rules` — new rule for `users/{uid}/manual_firms/{firmId}` (after the recruiters rule).

### Files DELETED in this session — don't restore
- `connect-grow-hire/src/pages/ScoutPage.tsx` — orphaned full-page Scout UI that referenced old `ChatMessage` fields (`auto_populate`, `navigate_to`, `action_buttons`). The route `/scout` uses `ScoutRedirect`, not this file. Safe to stay deleted.

## SAFE TO DELETE (orphaned, no incoming references)

These were NOT deleted in this session but are now orphans. The cleanup terminal can
delete them. Grep verified zero incoming references from outside the file itself.

### Frontend Scout legacy components (Nick consolidated these into ScoutSidePanel)
- `connect-grow-hire/src/components/ScoutBubble.tsx`
- `connect-grow-hire/src/components/ScoutChatbot.tsx`
- `connect-grow-hire/src/components/ScoutConversationList.tsx`
- `connect-grow-hire/src/components/ScoutFirmAssistant.tsx`
- `connect-grow-hire/src/components/ScoutFirmAssistantButton.tsx`
- `connect-grow-hire/src/components/ScoutHelperChatbot.tsx`

### Backend Scout legacy route
- `backend/app/routes/scout.py` — legacy Scout chat blueprint. Nick deleted it. Our new active path is `scout_assistant_bp`. Before deleting, verify it's still registered in `wsgi.py` (if registered, deregister there too).
- Whatever blueprint registration line in `wsgi.py` calls `app.register_blueprint(scout_bp)` — remove with the file.

### Verify before deleting:
```bash
# Confirm no live references before deleting any Scout legacy file:
grep -rln "from ScoutBubble\|import ScoutBubble" connect-grow-hire/src
grep -rln "from .*scout_service\b\|import scout_service\b" backend
```
If any other file still imports them, fix the importer first.

## DO NOT DELETE — these look orphaned but aren't

- `backend/app/services/scout_service.py` — legacy Scout service, but **Application Lab still imports five of its dataclasses** (per Nick's cleanup commit note). We still ship Application Lab. Keep this file alive until App Lab is rewritten or removed.

## Required manual follow-ups (already done by user OR pending)

### DONE
- ✅ Firestore TTL on `expires_at` for `scoutChats` collection (TTL state: ACTIVE)
- ✅ Firestore TTL on `expires_at` for `messages` collection (TTL state: ACTIVE)

### PENDING (block production push if relevant)
- **Stripe pricing**: `Pricing.tsx` displays Pro at $14.99/mo and references `STRIPE_PRO_PRICE_ID = price_1ScLXrERY2WrVHp1bYgdMAu4`, which still charges the OLD amount. Either create a new Stripe Price at $14.99 and update the constant, or revert the displayed price. Same potential issue for Elite display vs charge.
- **Annual Stripe Prices**: Pricing.tsx checks for `VITE_STRIPE_PRO_ANNUAL_PRICE_ID` and `VITE_STRIPE_ELITE_ANNUAL_PRICE_ID` env vars; until set, annual CTA gracefully falls back to monthly checkout. Add to Render env when annual SKUs exist.
- **`isStudent` field on user docs**: `Pricing.tsx:152` reads `user.isStudent` via a cast (`(user as any).isStudent`). Page renders fine without it (defaults to non-student price flow). To enable the .edu / student price path, populate `isStudent` on the Firestore user doc during onboarding when a .edu email is verified, and type it on `FirebaseAuthContext`'s `User` shape to remove the cast.
- **Smoke test**: not yet run. Recommended before push:
  ```
  cd backend && python3 wsgi.py
  cd connect-grow-hire && npm run dev
  ```
  Verify `/dashboard`, sidebar light-mode, Cmd+K Scout panel, `/my-network` add rows, `/pricing` toggles.

## What was SKIPPED (intentionally, by user direction)

- **#6 Tabbed FirmSearchPage** — your sibling/parent terminal is actively *removing* the Tabs/AlertDialog/FirmSearchResults UI in the working tree. Porting Nick's tabs UI would have undone that. Skipped. If the FirmSearchPage simplification gets reverted later and you want the tabbed version, the source is at `/tmp/nick-review/nick-scout/connect-grow-hire/src/pages/FirmSearchPage.tsx` (2066 lines) and `connect-grow-hire/src/components/FirmSearchResults.tsx` already exists on our side.
- **Coffee Chat Prep → Meeting Prep full-stack rename** — only the sidebar LABEL changed to "Meeting Prep"; routes (`/coffee-chat-prep`), blog posts, backend services (`coffee_chat.py`, `coffee_chat_prep.py`), feature gates, and frontend page names all keep "Coffee Chat" everywhere. The cleanup terminal should NOT rename the rest unless explicitly asked.
- **Application Lab + Interview Prep deletion** — Nick deleted both features wholesale in commit `cbbe584`. We KEPT both because they're live features per CLAUDE.md. Do NOT delete `routes/application_lab.py`, `services/application_lab_service.py`, `routes/interview_prep.py`, `services/interview_prep/` (8 submodules), `pages/ApplicationLabPage.tsx`, `pages/InterviewPrepPage.tsx`, or any of the App Lab / Interview Prep tests.

## Plan file with full context
`/Users/karthik/.claude/plans/can-you-look-deep-moonbeam.md` — full plan, inventory,
and per-item rationale. Read this if you need deeper context on any item.
