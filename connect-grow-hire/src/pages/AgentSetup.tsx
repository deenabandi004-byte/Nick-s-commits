// AgentSetup — thin wrapper around AgentSetupInline with app chrome.

import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { AgentSetupInline } from "@/components/agent/AgentSetupInline";
import type { InitialBriefParsed } from "@/components/loop/LoopsEmptyState";
import MountainsLake from "@/assets/for-students/mountains-lake.png";

interface AgentSetupNavState {
  initialBrief?: string;
  initialBriefParsed?: InitialBriefParsed;
}

export default function AgentSetup() {
  const navigate = useNavigate();
  const location = useLocation();
  // LoopsEmptyState navigates here with the brief the user edited inline
  // PLUS the proposal's parsed chips. Both are forwarded so the wizard
  // can (a) seed the textarea, (b) show real chips on Step 02's review
  // even when the brief text doesn't explicitly name a role, and
  // (c) decide to skip Step 01 because the student already handled it
  // on the empty-state screen.
  const state = (location.state as AgentSetupNavState | null) ?? {};
  const initialBrief = state.initialBrief?.trim() || undefined;
  const initialBriefParsed = state.initialBriefParsed;

  // Back from Step 02 when the user skipped Step 01 should return them
  // to the empty-state surface they came from. The empty state lives at
  // /agent (when there are zero Loops); if they've created one in the
  // meantime, /agent shows the fleet. Either way, navigating up matches
  // their mental model better than dumping them into Step 01 they never
  // saw.
  const onBackToEntry = initialBrief
    ? () => navigate("/agent")
    : undefined;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full font-sans" style={{ color: "var(--ink)" }}>
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="Agent Setup" />
          <div className="flex-1 overflow-y-auto" style={{ position: "relative" }}>
            {/* Mountains backdrop — same atmospheric treatment as Loops + Find. */}
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
                opacity: 0.45,
                maskImage:
                  "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.4) 18%, #000 55%, #000 100%)",
                WebkitMaskImage:
                  "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.4) 18%, #000 55%, #000 100%)",
              }}
            />
            {/* Top-left back nav — pinned to the page edge, not the centered
                content column, so it reads as a true "out" affordance. */}
            <div className="pl-4 sm:pl-6 pt-5" style={{ position: "relative", zIndex: 1 }}>
              <Link
                to="/agent"
                className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors hover:text-[var(--ink)]"
                style={{ color: "var(--ink-2)" }}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Loops
              </Link>
            </div>
            <div style={{ position: "relative", zIndex: 1 }}>
              <AgentSetupInline
                onDeployed={() => navigate("/agent")}
                initialBrief={initialBrief}
                initialBriefParsed={initialBriefParsed}
                onBackToEntry={onBackToEntry}
              />
            </div>
          </div>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}
