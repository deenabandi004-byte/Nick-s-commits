// AgentSetup - thin wrapper around AgentSetupInline with app chrome.

import { useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { AgentSetupInline } from "@/components/agent/AgentSetupInline";

export default function AgentSetup() {
  const navigate = useNavigate();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full font-sans" style={{ color: "var(--ink)" }}>
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="Agent Setup" />
          <div className="flex-1 overflow-y-auto">
            <AgentSetupInline onDeployed={() => navigate("/agent")} />
          </div>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}
