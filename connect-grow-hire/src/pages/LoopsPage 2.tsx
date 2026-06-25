// LoopsPage — the fleet view at /agent.
//
// State machine:
//   - Loading        → centered spinner
//   - 0 Loops        → StartLoopHero (page variant, with marketing cards)
//   - Composing      → StartLoopHero (inline variant) over a dimmed grid
//   - 1+ Loops       → LoopGrid

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { useLoopsList } from "@/hooks/useLoops";
import { LoopGrid } from "@/components/loop/LoopGrid";
import { StartLoopHero } from "@/components/loop/StartLoopHero";
import { LOOP_COPY } from "@/lib/loopCopy";

export default function LoopsPage() {
  const query = useLoopsList();
  const [composing, setComposing] = useState(false);

  const loops = query.data?.loops ?? [];
  const limits = query.data?.limits;

  return (
    <SidebarProvider>
      <div
        className="flex min-h-screen w-full font-sans"
        style={{ color: "var(--ink)" }}
      >
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title={LOOP_COPY.pageTitle} />

          <div className="flex-1 overflow-y-auto">
            {query.isLoading && (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
              </div>
            )}

            {!query.isLoading && loops.length === 0 && (
              <StartLoopHero variant="page" />
            )}

            {!query.isLoading && loops.length > 0 && limits && (
              <>
                {composing && (
                  <div
                    className="border-b"
                    style={{
                      borderColor: "var(--line-2)",
                      background: "var(--paper-2)",
                    }}
                  >
                    <StartLoopHero
                      variant="inline"
                      onCancel={() => setComposing(false)}
                      onCreated={() => setComposing(false)}
                    />
                  </div>
                )}
                <LoopGrid
                  loops={loops}
                  limits={limits}
                  onCreate={() => setComposing(true)}
                />
              </>
            )}
          </div>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}
