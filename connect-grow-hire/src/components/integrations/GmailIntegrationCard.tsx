import { useEffect, useRef, useState } from "react";
import { Mail, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiService } from "@/services/api";
import { invalidateGmailConnectionCache } from "@/hooks/useGmailConnection";

interface GmailIntegrationCardProps {
  /** When true (from /integrations?connect=gmail), launch OAuth immediately. */
  autoConnect?: boolean;
}

export function GmailIntegrationCard({ autoConnect = false }: GmailIntegrationCardProps) {
  const { toast } = useToast();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [gmailAddress, setGmailAddress] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const autoConnectRan = useRef(false);

  useEffect(() => {
    let cancelled = false;
    apiService
      .gmailStatus()
      .then((data) => {
        if (cancelled) return;
        setConnected(data.connected === true);
        setGmailAddress(data.gmail_address ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        // Constraint: auto-connect must only fire when a SUCCESSFUL status
        // fetch reports not-connected. On a failed fetch we still render the
        // not-connected UI (manual Connect stays available), but we burn the
        // auto-connect guard so a transient API blip can't hurl an
        // already-connected user into a fresh OAuth consent screen.
        autoConnectRan.current = true;
        setConnected(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleConnect = async () => {
    setActionLoading(true);
    try {
      const authUrl = await apiService.startGmailOAuth("/integrations");
      if (authUrl) {
        window.location.href = authUrl;
        return; // navigating away
      }
      toast({ title: "Could not start Gmail connection", variant: "destructive" });
    } catch {
      toast({ title: "Could not start Gmail connection", variant: "destructive" });
    }
    setActionLoading(false);
  };

  const handleDisconnect = async () => {
    setActionLoading(true);
    try {
      await apiService.revokeGmail();
      invalidateGmailConnectionCache();
      setConnected(false);
      setGmailAddress(null);
      toast({ title: "Gmail disconnected", description: "You can reconnect anytime." });
    } catch {
      toast({ title: "Failed to disconnect Gmail", variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  // Auto-launch OAuth when arriving via /integrations?connect=gmail
  useEffect(() => {
    if (autoConnect && connected === false && !autoConnectRan.current) {
      autoConnectRan.current = true;
      handleConnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, connected]);

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-50">
            <Mail className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Gmail</h3>
            {connected === null ? (
              <p className="text-sm text-muted-foreground">Checking connection…</p>
            ) : connected ? (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Connected{gmailAddress ? ` as ${gmailAddress}` : ""}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Connect Gmail so Offerloop can create email drafts in your account.
                We never send anything — you review and send every email yourself.
              </p>
            )}
          </div>
        </div>
        {connected === true ? (
          <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={actionLoading}>
            Disconnect
          </Button>
        ) : (
          <Button size="sm" onClick={handleConnect} disabled={actionLoading || connected === null}>
            {actionLoading ? "Connecting…" : "Connect Gmail"}
          </Button>
        )}
      </div>
      {connected === false && (
        <p className="mt-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          On Google's permission screen, check <strong>all the boxes</strong> — that's what
          lets Offerloop write drafts into your Gmail and track replies.
        </p>
      )}
    </div>
  );
}
