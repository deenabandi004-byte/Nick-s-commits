// DashboardPage - "Getting Started"
// The post-login landing is a full-page Scout chat. It renders the SAME
// conversation as the Ask Scout side panel (state lives in
// ScoutChatProvider); this page is just the big view of it. Prompt in the
// centered box and the conversation unfolds right here.
//
// User-facing name is "Getting Started"; the route stays /dashboard (see
// docs/getting-started-route-note.md for why the label and route differ).

import { Loader2 } from "lucide-react";

import MountainsLake from "@/assets/for-students/mountains-lake.png";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { ScoutChatThread } from "@/components/scout/ScoutChatThread";

export default function DashboardPage() {
  const { isLoading: authLoading } = useFirebaseAuth();

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--brand-blue)" }} />
      </div>
    );
  }

  return (
    <SidebarProvider>
      {/* h-screen (not min-h-screen): the chat thread needs a bounded height
          so its message list scrolls and the composer pins to the bottom. */}
      <div className="flex h-screen w-full font-sans" style={{ color: "var(--brand-ink)" }}>
        <AppSidebar />
        <MainContentWrapper flush>
          <AppHeader title="Home" />

          {/* Cool-paper canvas with a faint slate-blue radial glow at
              top-center (design: Scout home direction 1a). */}
          <div
            className="relative flex flex-1 flex-col overflow-hidden"
            style={{
              background: "#F5F6F8",
              backgroundImage: "radial-gradient(1200px 380px at 50% -140px, rgba(74,96,168,.10), transparent)",
            }}
          >
            {/* Watercolor mountains, same treatment as the Find surface:
                bottom-anchored band with a soft vertical mask so content
                reads on clean paper at the top and bottom edges. */}
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
                opacity: 0.38,
                maskImage:
                  "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.4) 20%, #000 60%, #000 100%)",
                WebkitMaskImage:
                  "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.4) 20%, #000 60%, #000 100%)",
              }}
            />
            <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
              <ScoutChatThread variant="page" />
            </div>
          </div>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}
