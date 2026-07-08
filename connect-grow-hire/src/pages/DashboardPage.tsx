// DashboardPage - "Getting Started"
// The post-login landing is a full-page Scout chat. It renders the SAME
// conversation as the Ask Scout side panel (state lives in
// ScoutChatProvider); this page is just the big view of it. Prompt in the
// centered box and the conversation unfolds right here.
//
// User-facing name is "Getting Started"; the route stays /dashboard (see
// docs/getting-started-route-note.md for why the label and route differ).

import React from "react";
import { Loader2 } from "lucide-react";

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
        <MainContentWrapper>
          <AppHeader title="Getting Started" />

          <div className="relative flex flex-1 flex-col overflow-hidden" style={{ background: "#FBFCFE" }}>
            {/* Brand watercolor backdrop, fixed to the viewport bottom. */}
            <img
              src="/mountains-lake.png"
              alt=""
              aria-hidden
              draggable={false}
              style={{
                position: "fixed", bottom: 0, left: 0, width: "100%", height: "70vh",
                objectFit: "cover", objectPosition: "bottom center", opacity: 0.9,
                zIndex: 0, pointerEvents: "none", userSelect: "none",
              }}
            />

            <div className="relative flex min-h-0 flex-1 flex-col" style={{ zIndex: 1 }}>
              <ScoutChatThread variant="page" />
            </div>
          </div>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}
