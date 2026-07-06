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
  // subscriptionTier is the source of truth (CLAUDE.md); tier is the legacy
  // fallback. Both are already typed on the User interface, so no `as any`
  // is needed here.
  const tier = user?.subscriptionTier || user?.tier || "free";
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
