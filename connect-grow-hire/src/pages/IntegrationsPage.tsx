// IntegrationsPage — /integrations
// Connect external accounts (Gmail today). Handles OAuth return params
// (?connected=gmail / ?gmail_error=...) with toasts, and ?connect=gmail
// auto-launches the Gmail OAuth flow via GmailIntegrationCard.

import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { useToast } from "@/hooks/use-toast";
import { GmailIntegrationCard } from "@/components/integrations/GmailIntegrationCard";

const IntegrationsPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const paramsHandled = useRef(false);

  const params = new URLSearchParams(location.search);
  const autoConnect = params.get("connect") === "gmail";

  // Handle OAuth return params once, then clean the URL.
  useEffect(() => {
    if (paramsHandled.current) return;
    const p = new URLSearchParams(location.search);
    const connected = p.get("connected") === "gmail";
    const gmailError = p.get("gmail_error");
    if (!connected && !gmailError) return;
    paramsHandled.current = true;

    // Popup context: Google redirected the OAuth popup back here. Report the
    // outcome to the page that opened us (GmailIntegrationCard listens for
    // this) and close — the opener shows the toast.
    if (window.opener) {
      window.opener.postMessage(
        {
          type: "offerloop-gmail-oauth",
          status: connected ? "connected" : gmailError || "error",
        },
        window.location.origin
      );
      window.close();
      return;
    }

    if (connected) {
      toast({
        title: "Gmail connected 🎉",
        description: "Drafts will now appear in your Gmail account.",
      });
    } else if (gmailError === "scopes_declined") {
      toast({
        variant: "destructive",
        title: "Gmail permissions incomplete",
        description:
          "You'll need to check all the permission boxes on Google's screen to enable email drafting. Click Connect Gmail to try again.",
        duration: 8000,
      });
    } else {
      toast({
        variant: "destructive",
        title: "Gmail connection failed",
        description: "Something went wrong. Click Connect Gmail to try again.",
      });
    }
    navigate("/integrations", { replace: true });
  }, [location.search, navigate, toast]);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full font-sans" style={{ color: "var(--ink)" }}>
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="Integrations" />

          <div className="flex-1 overflow-y-auto" style={{ background: "#FBFCFE" }}>
            <div className="mx-auto w-full max-w-[820px] px-5 py-6 sm:px-10 sm:py-8">
              <h1
                style={{
                  fontFamily: "'Libre Baskerville', Georgia, serif",
                  fontSize: 30,
                  fontWeight: 400,
                  lineHeight: "36px",
                  color: "#1e2d4d",
                  margin: 0,
                }}
              >
                Integrations
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Connect your accounts to unlock drafting and reply tracking.
              </p>

              <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
                <GmailIntegrationCard autoConnect={autoConnect} />

                <div
                  className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white/60 p-8 text-center"
                  style={{ aspectRatio: "1 / 1", minHeight: 280 }}
                >
                  <div className="text-lg font-semibold text-muted-foreground">
                    More coming
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    More integrations are on the way.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
};

export default IntegrationsPage;
