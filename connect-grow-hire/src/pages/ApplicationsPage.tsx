// Standalone home for auto-apply. One header ("Applications") and three
// sub-tabs instead of stacked sections: All applications (the full
// submission history, default), Needs your answers (exclamation badge), and
// Finish in browser. Composes the Job Board's existing self-fetching tab
// components — no data logic beyond the badge counts.
import { useEffect, useState } from "react";
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
import { useTour } from "@/contexts/TourContext";

// Inert demo rows shown ONLY during the product tour's Applications step, so
// a brand-new user (who has zero applications and may be on the free tier)
// sees what a live auto-apply pipeline looks like. Never rendered outside
// the tour; nothing here is clickable or persisted.
const TOUR_DEMO_APPLICATIONS = [
  {
    role: "Data Analyst Intern",
    company: "Spotify",
    when: "Submitted 2h ago",
    status: "Submitted",
    chip: { bg: "#E8F5E9", fg: "#2E7D32" },
  },
  {
    role: "Software Engineer Intern",
    company: "Stripe",
    when: "Submitted yesterday",
    status: "In review",
    chip: { bg: "#E4E9F5", fg: "#3C4F8E" },
  },
  {
    role: "Strategy & Ops Intern",
    company: "Disney",
    when: "Paused 10m ago",
    status: "Needs your answer",
    chip: { bg: "#FEF3C7", fg: "#B45309" },
  },
] as const;

const TourDemoApplications = () => (
  <div className="flex flex-col gap-2" aria-hidden="true">
    {TOUR_DEMO_APPLICATIONS.map((a) => (
      <div
        key={a.company}
        className="flex items-center justify-between rounded-xl border border-line bg-white px-4 py-3.5"
      >
        <div>
          <div className="text-[14px] font-semibold" style={{ color: "#1e2d4d" }}>
            {a.role}
          </div>
          <div className="text-[12.5px] text-muted-foreground">
            {a.company} · {a.when}
          </div>
        </div>
        <span
          className="text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
          style={{ background: a.chip.bg, color: a.chip.fg }}
        >
          {a.status}
        </span>
      </div>
    ))}
  </div>
);

type AppsTab = "all" | "needs-answers" | "finish-browser";

const TAB_HINTS: Record<AppsTab, string> = {
  all: "Every auto-application in one list: submitted, in progress, and anything that needs work.",
  "needs-answers":
    "Some applications hit questions we couldn't answer for you. Answer them here and we'll finish the submission.",
  "finish-browser":
    "These forms are filled but blocked by a CAPTCHA: open, complete, and confirm.",
};

const ApplicationsPage = () => {
  const { user } = useFirebaseAuth();
  const navigate = useNavigate();
  // Product-tour choreography: while the tour's Applications step is active,
  // show seeded demo rows (and bypass the free-tier lock) so the spotlight
  // has something real-looking to highlight.
  const { demoSurface } = useTour();
  const tourDemo = demoSurface === "applications";
  // subscriptionTier is the source of truth (CLAUDE.md); tier is the legacy
  // fallback. Both are already typed on the User interface, so no `as any`
  // is needed here.
  const tier = user?.subscriptionTier || user?.tier || "free";
  const locked = tier === "free";

  const [tab, setTab] = useState<AppsTab>("all");

  // Badge counts for the two action queues. The tab bodies self-fetch their
  // own lists; this only drives the tab badges. Refreshes on a slow interval
  // and skips while the browser tab is backgrounded.
  const [needsAnswersCount, setNeedsAnswersCount] = useState(0);
  const [finishBrowserCount, setFinishBrowserCount] = useState(0);
  useEffect(() => {
    if (!user || locked) return;
    let cancelled = false;
    const refresh = async () => {
      if (document.hidden) return;
      try {
        const api = await import("@/services/api");
        const [na, nv] = await Promise.all([
          api.listNeedsAttention(),
          api.listNeedsVerification(),
        ]);
        if (cancelled) return;
        setNeedsAnswersCount((na.items || []).length);
        setFinishBrowserCount((nv.items || []).length);
      } catch {
        /* badge-only; next poll retries */
      }
    };
    refresh();
    const id = window.setInterval(refresh, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [user, locked]);

  const tabs: { id: AppsTab; label: string; count: number; alert: boolean }[] = [
    { id: "all", label: "All applications", count: 0, alert: false },
    { id: "needs-answers", label: "Needs your answers", count: needsAnswersCount, alert: true },
    { id: "finish-browser", label: "Finish in browser", count: finishBrowserCount, alert: false },
  ];

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-paper font-sans text-ink">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="Applications" />
          <div className="flex-1 overflow-y-auto">
            {/* data-tour lives on the always-mounted container (not the demo
                block) so the tour's element-ready wait resolves before the
                demoSurface flag flips on and swaps in the seeded rows. */}
            <div className="max-w-[900px] mx-auto px-6 py-6" data-tour="tour-applications-list">
              {/* Page header, same serif display treatment as the other pages
                  (Browse all jobs, Who do you want to meet?). */}
              <h1
                className="mb-5"
                style={{
                  fontFamily: "'Libre Baskerville', Georgia, serif",
                  fontSize: 30,
                  fontWeight: 400,
                  lineHeight: "36px",
                  color: "#1e2d4d",
                  margin: "0 0 20px",
                }}
              >
                Applications
              </h1>
              {tourDemo ? (
                <div>
                  <p className="text-[12.5px] text-muted-foreground mt-1 mb-4">{TAB_HINTS.all}</p>
                  <TourDemoApplications />
                </div>
              ) : locked ? (
                <div className="rounded-xl border border-line bg-white p-8 text-center">
                  <h2 className="text-[16px] font-semibold mb-2">Auto Apply is a Pro feature</h2>
                  <p className="text-[13px] text-muted-foreground mb-4">
                    Upgrade to submit applications automatically and track them all here.
                  </p>
                  <Button onClick={() => navigate("/pricing")}>See plans</Button>
                </div>
              ) : (
                <>
                  {/* Sub-tab bar */}
                  <div className="flex gap-1 border-b border-line mb-1" role="tablist" aria-label="Application queues">
                    {tabs.map((t) => {
                      const active = tab === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setTab(t.id)}
                          className={`inline-flex items-center gap-1.5 px-4 py-2.5 -mb-px text-[13px] border-b-2 transition-colors ${
                            active
                              ? "font-semibold text-brand-blue border-brand-blue"
                              : "font-medium text-muted-foreground border-transparent hover:text-ink"
                          }`}
                          style={active ? { color: "var(--brand-blue, #3B82F6)", borderColor: "var(--brand-blue, #3B82F6)" } : undefined}
                        >
                          {t.alert && (
                            <span
                              aria-hidden="true"
                              className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[10px] font-bold leading-none text-white"
                              style={{ background: t.count > 0 ? "#EF4444" : "#CBD5E1" }}
                            >
                              !
                            </span>
                          )}
                          {t.label}
                          {t.count > 0 && (
                            <span className="text-[10px] px-1.5 py-px rounded bg-slate-100 text-slate-500 font-mono">
                              {t.count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[12.5px] text-muted-foreground mt-3 mb-4">{TAB_HINTS[tab]}</p>

                  {tab === "all" && <AutoSubmissionTab />}
                  {tab === "needs-answers" && <NeedsAttentionTab />}
                  {tab === "finish-browser" && <NeedsVerificationTab />}
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
