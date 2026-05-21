// AgentPage - thin wrapper for the agent dashboard.
// Elite gate → config check → AgentSnapshot

import { useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { PDLOutageBanner } from "@/components/PDLOutageBanner";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useAgentConfig } from "@/hooks/useAgent";
import { AgentSnapshot, AgentActivityRail } from "@/components/agent/AgentSnapshot";
import { AgentSettingsModal } from "@/components/agent/AgentSettingsModal";
import { Button } from "@/components/ui/button";

export default function AgentPage() {
  const { user, isLoading: authLoading } = useFirebaseAuth();
  const configQuery = useAgentConfig();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isElite = (user as { tier?: string } | null)?.tier === "elite";

  // Elite gate
  if (!authLoading && !isElite) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen w-full font-sans" style={{ color: "var(--ink)" }}>
          <AppSidebar />
          <MainContentWrapper>
            <AppHeader title="Agent" />
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-md mx-auto px-4 py-20 text-center">
                <div className="inline-flex p-3 rounded-xl bg-muted mb-4">
                  <Lock className="h-6 w-6 text-muted-foreground" />
                </div>
                <h2 className="text-xl font-semibold mb-2">Agent is an Elite feature</h2>
                <p className="text-sm text-muted-foreground mb-6">
                  Your autonomous networking agent finds contacts, drafts emails, discovers jobs, and runs daily - all on autopilot.
                </p>
                <Link to="/pricing">
                  <Button>Upgrade to Elite</Button>
                </Link>
              </div>
            </div>
          </MainContentWrapper>
        </div>
      </SidebarProvider>
    );
  }

  const config = configQuery.data;
  const isSetup = !config || config.status === "setup" || config.status === "stopped";
  const hasTargets = !!(config?.targetCompanies?.length || config?.targetIndustries?.length);
  const agentConfigured = !isSetup && hasTargets;

  // Redirect to setup if not configured
  if (!configQuery.isLoading && !agentConfigured) {
    return <Navigate to="/agent/setup" replace />;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full font-sans" style={{ color: "var(--ink)" }}>
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="Agent" />
          <PDLOutageBanner />
          <div className="flex-1 flex min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-[760px] mx-auto px-4 sm:px-8 pb-20">
                {configQuery.isLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : config ? (
                  <>
                    <AgentSnapshot
                      config={config}
                      onOpenSettings={() => setSettingsOpen(true)}
                    />
                    <AgentSettingsModal
                      open={settingsOpen}
                      onOpenChange={setSettingsOpen}
                      config={config}
                    />
                  </>
                ) : null}
              </div>
            </div>
            {config?.status === "active" && !configQuery.isLoading && (
              <AgentActivityRail />
            )}
          </div>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}
