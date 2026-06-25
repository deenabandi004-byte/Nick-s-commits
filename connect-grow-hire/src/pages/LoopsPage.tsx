// LoopsPage — the fleet view at /agent.
//
// State machine:
//   - Loading   → centered spinner
//   - 0 Loops   → LoopsEmptyState (Scout greeter + resume-derived suggestion)
//   - 1+ Loops  → LoopGrid (with the LoopsCommandBar above it)
//
// The inline composer was removed in the Variation D redesign. The full
// `/agent/setup` page owns Loop creation. The first-run empty state is now
// a dedicated screen (per the Loops-redesign handoff) — its CTAs navigate
// into /agent/setup instead of dumping the user into a blank wizard.

import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { useLoopsList } from "@/hooks/useLoops";
import { LoopGrid } from "@/components/loop/LoopGrid";
import { LoopsEmptyState, type InitialBriefParsed } from "@/components/loop/LoopsEmptyState";
import { LOOP_COPY } from "@/lib/loopCopy";
import MountainsLake from "@/assets/for-students/mountains-lake.png";

export default function LoopsPage() {
  const query = useLoopsList();
  const navigate = useNavigate();

  const loops = query.data?.loops ?? [];
  const limits = query.data?.limits;

  const goToSetup = (initialBrief?: string, initialBriefParsed?: InitialBriefParsed) => {
    // Only include state when we actually have something to seed — the
    // fleet-view "Start another Loop" path passes neither and lands on
    // Step 01 of the wizard as today.
    const state =
      initialBrief || initialBriefParsed
        ? { initialBrief, initialBriefParsed }
        : undefined;
    navigate("/agent/setup", { state });
  };
  // Only treat as empty on a genuinely successful, settled load with zero
  // Loops — never mid-fetch or during a transient API error (e.g. a backend
  // hot-reload). Without isSuccess, a failed refetch could flash the
  // first-Loop empty state even though the user has Loops.
  const isEmpty = query.isSuccess && loops.length === 0;

  return (
    <SidebarProvider>
      <div
        className="flex min-h-screen w-full font-sans"
        style={{ color: "var(--ink)" }}
      >
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title={LOOP_COPY.pageTitle} />

          <div
            className="flex-1 overflow-y-auto"
            style={{
              position: "relative",
              // Scoped Variation-D blue accent. Sparkline, ring, primary CTA,
              // and the tinted icon tiles all inherit from these — pages outside
              // /agent keep their navy.
              ["--accent" as string]: "#3E5BD9",
              ["--accent-tint" as string]: "#EDF1FE",
              ["--accent-line" as string]:
                "linear-gradient(90deg, #C7D2FF, #E5EBFF 42%, transparent)",
            }}
          >
            {/* Mountains as full-page backdrop. Anchored bottom-center so
                the peaks sit naturally below content; soft top fade keeps
                the page bg visible above the fold. Aria-hidden + pointer
                events off so it never blocks interaction. */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                zIndex: 0,
                backgroundImage: `url(${MountainsLake})`,
                backgroundSize: "120% auto",
                backgroundPosition: "center bottom",
                backgroundRepeat: "no-repeat",
                opacity: 0.5,
                maskImage:
                  "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.4) 18%, #000 55%, #000 100%)",
                WebkitMaskImage:
                  "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.4) 18%, #000 55%, #000 100%)",
              }}
            />

            <div style={{ position: "relative", zIndex: 1 }}>
              <div
                style={{
                  height: 3,
                  background: "var(--accent-line)",
                }}
              />
              {/* Spinner is the fallback whenever we have no Loops to show and
                  haven't confirmed the account is genuinely empty — covers the
                  first load AND a transient backend outage (it auto-recovers on
                  the next 20s refetch) instead of rendering a blank page. */}
              {loops.length === 0 && !isEmpty && (
                <div className="flex items-center justify-center py-24">
                  <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                </div>
              )}

              {isEmpty && <LoopsEmptyState onStart={goToSetup} />}

              {loops.length > 0 && limits && (
                <LoopGrid
                  loops={loops}
                  limits={limits}
                  onCreate={goToSetup}
                />
              )}
            </div>
          </div>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}
