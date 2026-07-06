# Applications Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New sidebar "Applications" section with three pages — /applications (auto-apply tracker + extra-questions queue), /resume (view/replace/tailor), /cover-letter (generate + PDF) — reusing live backends and existing components.

**Architecture:** Frontend-only. /applications composes the three existing self-fetching Job Board tab components. /resume reads the user doc's resume fields (Account Settings pattern) and reuses the orphaned `ResumeOptimizationModal` for tailoring. /cover-letter uses the existing unused `apiService.generateCoverLetter` wrapper plus one new thin PDF wrapper. Sidebar badge polls the existing needs-attention/needs-verification list endpoints.

**Tech Stack:** React 18 + TS, existing shadcn/inline-style patterns. No new npm packages. No backend changes.

**Spec:** `docs/superpowers/specs/2026-07-06-applications-section-design.md`

## Global Constraints

- Frontend only. Do not touch `backend/`, `firestore.rules`, or the Chrome extension.
- Do not modify `JobBoardPage.redesign.tsx` or anything under `src/components/jobs/` — the parallel workstream owns them; we IMPORT the tab components as-is.
- Page shells follow the house pattern: `SidebarProvider > AppSidebar + MainContentWrapper > AppHeader + scrollable content` (copy from `UploadListPage.tsx`).
- Credit costs shown in copy: tailoring = 20, cover letter = 5 (match `backend/app/config.py` constants already used by the endpoints).
- Repo has many unrelated modified files; `git add` ONLY the paths each task names. Commit after every task.
- tsc gate per task: `cd connect-grow-hire && npx tsc --noEmit 2>&1 | grep -E "<your files>"` → no output beyond pre-existing noise (list any pre-existing hits in the report).

---

### Task 1: ApplicationsPage

**Files:**
- Create: `connect-grow-hire/src/pages/ApplicationsPage.tsx`
- Modify: `connect-grow-hire/src/App.tsx` (lazy import + `/applications` route, next to the `/upload-list` route)

**Interfaces:**
- Consumes: `AutoSubmissionTab` (props `{pollIntervalIdle?, pollIntervalActive?}`), `NeedsAttentionTab` (`{pollInterval?}`), `NeedsVerificationTab` (`{pollInterval?}`) from `@/components/jobs/` — all self-fetching. Tier via `useFirebaseAuth()` user (`subscriptionTier`/`tier` — check how `FeatureGate`/existing pages read tier and copy that exact accessor).
- Produces: default-export page component routed at `/applications`.

- [ ] **Step 1: Write the page**

```tsx
// connect-grow-hire/src/pages/ApplicationsPage.tsx
// Standalone home for auto-apply: the "answer extra questions" queue, the
// finish-in-browser queue, and the full submission history. Composes the
// Job Board's existing self-fetching tab components — no data logic here.
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { AutoSubmissionTab } from "@/components/jobs/AutoSubmissionTab";
import { NeedsAttentionTab } from "@/components/jobs/NeedsAttentionTab";
import { NeedsVerificationTab } from "@/components/jobs/NeedsVerificationTab";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-[15px] font-semibold text-ink mb-1">{title}</h2>
      {hint && <p className="text-[12.5px] text-muted-foreground mb-3">{hint}</p>}
      {children}
    </section>
  );
}

const ApplicationsPage = () => {
  const { user } = useFirebaseAuth();
  const navigate = useNavigate();
  const tier = ((user as any)?.subscriptionTier || (user as any)?.tier || "free") as string;
  const locked = tier === "free";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-paper font-sans text-ink">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="Applications" />
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-[900px] mx-auto px-6 py-6">
              {locked ? (
                <div className="rounded-xl border border-line bg-white p-8 text-center">
                  <h2 className="text-[16px] font-semibold mb-2">Auto Apply is a Pro feature</h2>
                  <p className="text-[13px] text-muted-foreground mb-4">
                    Upgrade to submit applications automatically and track them all here.
                  </p>
                  <Button onClick={() => navigate("/pricing")}>See plans</Button>
                </div>
              ) : (
                <>
                  <Section
                    title="Needs your answers"
                    hint="Some applications hit questions we couldn't answer for you. Answer them here and we'll finish the submission."
                  >
                    <NeedsAttentionTab />
                  </Section>
                  <Section
                    title="Finish in browser"
                    hint="These forms are filled but blocked by a CAPTCHA — open, complete, and confirm."
                  >
                    <NeedsVerificationTab />
                  </Section>
                  <Section title="All auto-applications">
                    <AutoSubmissionTab />
                  </Section>
                </>
              )}
            </div>
          </div>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
};

export default ApplicationsPage;
```

Adjust the tier accessor to whatever `useFirebaseAuth`'s user type actually exposes (open `FirebaseAuthContext.tsx`; if it has a typed tier field, drop the `as any`). If the tab components render their own headers that clash with the Section titles, keep the Section titles and note the doubling in your report rather than editing the tab components.

- [ ] **Step 2: Route**

In `App.tsx`: `const ApplicationsPage = React.lazy(() => import("./pages/ApplicationsPage"));` next to `UploadListPage`, and after the `/upload-list` route:

```tsx
      <Route path="/applications" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><ApplicationsPage /></Suspense></ProtectedRoute>} />
```

- [ ] **Step 3: Verify + commit**

`npx tsc --noEmit 2>&1 | grep -E "ApplicationsPage|src/App.tsx"` → nothing new.

```bash
git add connect-grow-hire/src/pages/ApplicationsPage.tsx connect-grow-hire/src/App.tsx
git commit -m "feat(applications): standalone Applications page composing auto-apply queues"
```

---

### Task 2: ResumePage

**Files:**
- Create: `connect-grow-hire/src/pages/ResumePage.tsx`
- Modify: `connect-grow-hire/src/App.tsx` (lazy import + `/resume` route)

**Interfaces:**
- Consumes: Firestore user doc fields `resumeUrl`, `resumeFileName`, `resumeUpdatedAt` (read exactly the way `AccountSettings.tsx:340-365` does — copy its getDoc pattern); `POST /api/parse-resume` multipart with Bearer token (copy the upload call from `AccountSettings.tsx:~400-430`); `ResumeOptimizationModal` (props: `{isOpen, onClose, jobDescription, jobTitle?, company?, jobUrl?, onSuggestionsReceived?, onTemplateRebuildReceived?}`) — orphaned component, verify it compiles and its api calls match `api.ts` (`optimizeResumeV2` at :2241).
- Produces: default-export page at `/resume`.

- [ ] **Step 1: Build the page**

Layout: two-column on `md+` (left: PDF preview card; right: controls + tailor card), stacked on mobile.

Required behaviors (write the code following the referenced patterns; structure below):

```tsx
// State: resumeUrl/fileName/updatedAt (fetched from user doc on mount),
// uploading flag, tailor form state (jobDescription, jobTitle, company),
// modalOpen.

// 1. Resume preview card:
//    - if resumeUrl: <iframe src={`${resumeUrl}#toolbar=0`} title="Resume preview"
//        style={{ width: "100%", height: "72vh", border: "none" }} />
//      + row: fileName, "Updated {date}", Download button (window.open(resumeUrl)),
//        Replace button (hidden file input, accept=".pdf,.doc,.docx")
//    - else: empty-state card "No resume yet" + Upload button (same file input)
// 2. Upload/replace handler: multipart POST to `${API_URL}/api/parse-resume`
//    with Authorization Bearer (copy AccountSettings' exact fetch incl. token
//    retrieval), then re-fetch the user doc fields and cache-bust the iframe
//    (append ?cb=Date.now() — AccountSettings:1597 does the same).
// 3. Tailor card ("Tailor to a job" — the page's primary CTA styling):
//    - textarea jobDescription (placeholder mentions pasting the posting),
//      inputs jobTitle/company (optional)
//    - button "Tailor resume · 20 credits" disabled until
//      jobDescription.trim().length >= 50 (backend minimum) or no resume
//    - onClick → setModalOpen(true)
//    - <ResumeOptimizationModal isOpen={modalOpen} onClose={...}
//        jobDescription={jobDescription} jobTitle={jobTitle} company={company} />
```

Page shell identical to ApplicationsPage (AppHeader title="Resume").

If `ResumeOptimizationModal` fails to compile or its endpoints/props have drifted: fix minimally inside the modal file (it has zero other consumers — safe), and document every change in your report.

- [ ] **Step 2: Route**

Lazy import + `<Route path="/resume" …ProtectedRoute…>` following Task 1's pattern.

- [ ] **Step 3: Verify + commit**

`npx tsc --noEmit 2>&1 | grep -E "ResumePage|ResumeOptimizationModal|src/App.tsx"` → nothing new.

```bash
git add connect-grow-hire/src/pages/ResumePage.tsx connect-grow-hire/src/App.tsx connect-grow-hire/src/components/ResumeOptimizationModal.tsx
git commit -m "feat(applications): Resume page — preview, replace, tailor-to-job"
```

(Include the modal file only if you changed it.)

---

### Task 3: CoverLetterPage

**Files:**
- Create: `connect-grow-hire/src/pages/CoverLetterPage.tsx`
- Modify: `connect-grow-hire/src/services/api.ts` (add `downloadCoverLetterPdf`)
- Modify: `connect-grow-hire/src/App.tsx` (lazy import + `/cover-letter` route)

**Interfaces:**
- Consumes: `apiService.generateCoverLetter(params: GenerateCoverLetterRequest)` (api.ts:2393 — currently zero callers; check its request type: `{jobUrl?, jobDescription, jobTitle?, company?}` and response `{coverLetter, creditsUsed, creditsRemaining}`); backend `POST /api/job-board/cover-letter-pdf` `{content, company?}` → `application/pdf`.
- Produces: page at `/cover-letter`; `apiService.downloadCoverLetterPdf(content: string, company?: string): Promise<Blob>`.

- [ ] **Step 1: api.ts wrapper**

Next to `generateCoverLetter` (match its auth-header style):

```ts
  /** Render an already-generated cover letter to PDF (no credit cost). */
  async downloadCoverLetterPdf(content: string, company?: string): Promise<Blob> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`${API_BASE_URL}/job-board/cover-letter-pdf`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, ...(company ? { company } : {}) }),
    });
    if (!res.ok) throw new Error(`Cover letter PDF failed (${res.status})`);
    return res.blob();
  }
```

(Confirm `API_BASE_URL` vs the file's actual base-const name and the raw-fetch precedent used by other blob endpoints in the file — mirror it.)

- [ ] **Step 2: Build the page**

Shell identical to the other two (AppHeader title="Cover Letter"). Content:

```tsx
// Form card:
//   - input jobUrl (placeholder "Paste a job posting URL (optional)")
//   - textarea jobDescription (placeholder "…or paste the job description")
//   - inputs jobTitle / company (optional, one row)
//   - button "Generate cover letter · 5 credits", disabled while generating or
//     when (!jobUrl.trim() && jobDescription.trim().length < 30)
//   - on click: apiService.generateCoverLetter({
//       jobUrl: jobUrl.trim() || undefined,
//       jobDescription: jobDescription.trim(),
//       jobTitle: jobTitle.trim() || undefined,
//       company: company.trim() || undefined })
//     → setLetter(res.coverLetter)
//   - error handling: if the error message contains "No resume" render an
//     inline callout: "Upload your resume first" + Button → navigate("/resume").
//     Other errors: toast (use the house use-toast hook).
// Result card (when letter set):
//   - <textarea value={letter} onChange…/> tall (min 380px), mono-adjacent body font
//   - actions: Copy (navigator.clipboard.writeText + toast), Download PDF:
//       const blob = await apiService.downloadCoverLetterPdf(letter, company || undefined);
//       const url = URL.createObjectURL(blob);
//       const a = document.createElement("a");
//       a.href = url; a.download = `${(company || "cover").replace(/\s+/g, "_")}_cover_letter.pdf`;
//       a.click(); URL.revokeObjectURL(url);
//   - subtle note: "Generated from your stored resume. Edits here appear in the PDF."
```

- [ ] **Step 3: Route + verify + commit**

Route per Task 1's pattern. `npx tsc --noEmit 2>&1 | grep -E "CoverLetterPage|api\.ts|src/App.tsx"` → nothing new.

```bash
git add connect-grow-hire/src/pages/CoverLetterPage.tsx connect-grow-hire/src/services/api.ts connect-grow-hire/src/App.tsx
git commit -m "feat(applications): Cover Letter page on the live job-board endpoints"
```

---

### Task 4: Sidebar section + attention badge

**Files:**
- Create: `connect-grow-hire/src/hooks/useApplicationsAttention.ts`
- Modify: `connect-grow-hire/src/components/AppSidebar.tsx`

**Interfaces:**
- Consumes: `listNeedsAttention()` and `listNeedsVerification()` — exported standalone functions in `api.ts` (~:3030; check exact names/exports and response shape `AutoApplyListResponse` — likely `{items: [...]}`; verify). Routes /applications, /resume, /cover-letter from Tasks 1–3.
- Produces: `useApplicationsAttention(): number` (total apps awaiting user input, 0 while loading/unauthed/free-tier errors).

- [ ] **Step 1: Hook**

```ts
// connect-grow-hire/src/hooks/useApplicationsAttention.ts
// Count of auto-applications waiting on the user (extra questions + CAPTCHA).
// Polls the REST lists (Firestore rules deny client reads of autoApplyJobs).
// 60s cadence — the Applications page itself polls faster; this is just the badge.
import { useEffect, useState } from "react";
import { listNeedsAttention, listNeedsVerification } from "@/services/api";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";

const POLL_MS = 60_000;

export function useApplicationsAttention(): number {
  const { user } = useFirebaseAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user?.uid) { setCount(0); return; }
    let cancelled = false;
    const tick = async () => {
      try {
        const [attention, verification] = await Promise.all([
          listNeedsAttention(),
          listNeedsVerification(),
        ]);
        if (!cancelled) {
          setCount((attention.items?.length ?? 0) + (verification.items?.length ?? 0));
        }
      } catch {
        if (!cancelled) setCount(0); // free tier / transient — badge just hides
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [user?.uid]);

  return count;
}
```

(Adjust `items` to the real response field after reading `AutoApplyListResponse` in api.ts.)

- [ ] **Step 2: Sidebar section**

In `AppSidebar.tsx`:
1. Icons: add `ClipboardList, PenLine` to the lucide import (FileText already imported).
2. New array after `engageNavItems`:

```tsx
const applicationsNavItems: NavItemDef[] = [
  { title: "Applications", url: "/applications", LucideIcon: ClipboardList },
  { title: "Resume",       url: "/resume",       LucideIcon: FileText },
  { title: "Cover Letter", url: "/cover-letter", LucideIcon: PenLine },
];
```

3. In the component: `const applicationsAttention = useApplicationsAttention();`
4. Render the section between Engage's block and the `flex-1` spacer, same structure as Discover/Engage (12px spacer + `sectionLabel("Applications")` + collapsed-mode hairline + item list).
5. Badge on the "Applications" item: extend `renderNavItem`'s existing Loops-badge block (which keys on `item.title === "Loops"` + `agentStatus.pendingCount`) with an equivalent for `item.title === "Applications" && applicationsAttention > 0`, using the same amber pill styles, showing `applicationsAttention`.

- [ ] **Step 3: Verify + commit**

`npx tsc --noEmit 2>&1 | grep -E "AppSidebar|useApplicationsAttention"` → nothing new. Sanity: expand/collapse renders, badge hidden at 0.

```bash
git add connect-grow-hire/src/hooks/useApplicationsAttention.ts connect-grow-hire/src/components/AppSidebar.tsx
git commit -m "feat(applications): sidebar Applications section with needs-input badge"
```

---

### Task 5: Build + smoke QA

- [ ] `cd connect-grow-hire && npm run build` → ✓ built.
- [ ] `npx tsc --noEmit` filtered to all files this plan touched → nothing new vs. pre-existing noise.
- [ ] Manual checklist (report only, don't block): /applications renders three sections (or locked state on free tier); /resume shows PDF or empty state, Replace works, Tailor button gates on 50 chars; /cover-letter generates (needs stored resume) and PDF downloads; sidebar shows the new section expanded + collapsed; badge appears when a needs_attention app exists.
- [ ] Commit any QA fixes (only files touched by fixes).
