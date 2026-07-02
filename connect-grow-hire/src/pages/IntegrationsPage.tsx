import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-semibold text-foreground">Integrations</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect your accounts to unlock drafting and reply tracking.
      </p>
      <div className="mt-6 space-y-4">
        <GmailIntegrationCard autoConnect={autoConnect} />
      </div>
    </div>
  );
};

export default IntegrationsPage;
