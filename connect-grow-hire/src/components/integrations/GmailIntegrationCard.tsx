import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
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

  const refreshStatus = () => {
    invalidateGmailConnectionCache();
    apiService
      .gmailStatus()
      .then((data) => {
        setConnected(data.connected === true);
        setGmailAddress(data.gmail_address ?? null);
      })
      .catch(() => {});
  };

  // Opens Google's consent screen in a popup so the user never leaves this
  // page. The popup lands back on /integrations?connected=gmail, which (in
  // popup context) posts a message to us and closes itself — see
  // IntegrationsPage. `viaPopup: false` keeps the old full-page redirect for
  // the ?connect=gmail auto-launch, where browsers would block a popup
  // (no direct user gesture).
  const handleConnect = async (viaPopup = true) => {
    setActionLoading(true);

    // Must open synchronously within the click gesture or popup blockers
    // kill it; the OAuth URL is filled in once the backend responds.
    let popup: Window | null = null;
    if (viaPopup) {
      const w = 520;
      const h = 680;
      const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
      const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
      popup = window.open(
        "about:blank",
        "offerloop-gmail-oauth",
        `width=${w},height=${h},left=${left},top=${top}`
      );
    }

    try {
      const authUrl = await apiService.startGmailOAuth("/integrations");
      if (!authUrl) {
        popup?.close();
        toast({ title: "Could not start Gmail connection", variant: "destructive" });
        setActionLoading(false);
        return;
      }
      if (!popup) {
        // Popup blocked (or auto-launch path): fall back to full redirect.
        window.location.href = authUrl;
        return; // navigating away
      }
      popup.location.href = authUrl;

      const finish = (status: string | null) => {
        window.removeEventListener("message", onMessage);
        window.clearInterval(closedPoll);
        setActionLoading(false);
        if (status === "connected") {
          refreshStatus();
          toast({
            title: "Gmail connected 🎉",
            description: "Drafts will now appear in your Gmail account.",
          });
        } else if (status === "scopes_declined") {
          toast({
            variant: "destructive",
            title: "Gmail permissions incomplete",
            description:
              "You'll need to check all the permission boxes on Google's screen. Click Connect Gmail to try again.",
            duration: 8000,
          });
        } else if (status) {
          toast({
            variant: "destructive",
            title: "Gmail connection failed",
            description: "Something went wrong. Click Connect Gmail to try again.",
          });
        } else {
          // Popup closed without reporting back — re-check in case the flow
          // actually completed.
          refreshStatus();
        }
      };

      const onMessage = (e: MessageEvent) => {
        if (e.origin !== window.location.origin) return;
        if (e.data?.type !== "offerloop-gmail-oauth") return;
        popup?.close();
        finish(typeof e.data.status === "string" ? e.data.status : "error");
      };
      window.addEventListener("message", onMessage);

      const closedPoll = window.setInterval(() => {
        if (popup?.closed) finish(null);
      }, 500);
    } catch {
      popup?.close();
      toast({ title: "Could not start Gmail connection", variant: "destructive" });
      setActionLoading(false);
    }
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

  // Auto-launch OAuth when arriving via /integrations?connect=gmail. Uses the
  // full-page redirect: this runs from an effect, not a click, so a popup
  // would be blocked.
  useEffect(() => {
    if (autoConnect && connected === false && !autoConnectRan.current) {
      autoConnectRan.current = true;
      handleConnect(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, connected]);

  // Square card matching the MCP Server page's client cards: logo centered,
  // name + status in the middle, action button pinned to the bottom.
  return (
    <div
      className="flex flex-col items-center rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm"
      style={{ aspectRatio: "1 / 1", minHeight: 280 }}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <img src="/logos/gmail.svg" alt="Gmail logo" className="h-14 w-14" />
        <div>
          <div className="text-lg font-semibold" style={{ color: "#1e2d4d" }}>
            Gmail
          </div>
          {connected === null ? (
            <p className="mt-1 text-sm text-muted-foreground">Checking connection…</p>
          ) : connected ? (
            <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-600" />
              <span className="truncate">
                Connected{gmailAddress ? ` as ${gmailAddress}` : ""}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Drafts land in your account. You review and send every email yourself.
            </p>
          )}
          {connected === false && (
            <p className="mt-2 text-xs text-muted-foreground">
              On Google's permission screen, check <strong>all the boxes</strong>.
            </p>
          )}
        </div>
      </div>
      {connected === true ? (
        <Button
          variant="outline"
          className="mt-6 w-full"
          onClick={handleDisconnect}
          disabled={actionLoading}
        >
          Disconnect
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => handleConnect()}
          disabled={actionLoading || connected === null}
          className="mt-6 w-full rounded-lg bg-[#0F172A] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1E293B] disabled:opacity-50"
        >
          {actionLoading ? "Connecting…" : "Connect Gmail"}
        </button>
      )}
    </div>
  );
}
