import React from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { ProGate } from "@/components/ProGate";
import { PersonalizedRecruitingTimeline } from "@/components/PersonalizedRecruitingTimeline";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { TIMELINE_CREDITS } from "@/lib/constants";
import { Coins } from "lucide-react";

const RecruitingTimelinePage: React.FC = () => {
  const { user } = useFirebaseAuth();
  const tier = user?.tier || "free";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-h-0">
          <AppHeader />
          <MainContentWrapper>
            <ProGate
              title="Recruiting Timeline"
              description="Plan your recruiting journey with an AI-generated timeline tailored to your target industry, role, and deadlines."
              videoId="dQw4w9WgXcQ"
            >
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
                <div className="max-w-5xl mx-auto space-y-6">
                  <div>
                    <h1
                      className="text-2xl font-bold tracking-tight"
                      style={{ color: "var(--foreground)", fontFamily: "var(--font-heading)" }}
                    >
                      Recruiting Timeline
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                      Generate a personalized recruiting plan based on your target role, industry, and deadlines.
                    </p>
                  </div>

                  {tier !== "free" && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Coins className="h-3.5 w-3.5" />
                      <span>{TIMELINE_CREDITS} credits per generation</span>
                    </div>
                  )}

                  <PersonalizedRecruitingTimeline />
                </div>
              </div>
            </ProGate>
          </MainContentWrapper>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default RecruitingTimelinePage;
