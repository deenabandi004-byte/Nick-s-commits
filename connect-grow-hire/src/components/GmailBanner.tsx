import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiService } from "@/services/api";

const SESSION_DISMISS_KEY = "gmail_banner_dismissed";

// Cache Gmail status across navigations so we don't hit the API on every route change.
let cachedConnected: boolean | null = null;

export function GmailBanner() {
  const location = useLocation();
  const navigate = useNavigate();
  const [connected, setConnected] = useState<boolean | null>(cachedConnected);
  const [dismissed, setDismissed] = useState(() =>
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem(SESSION_DISMISS_KEY) === "1"
      : false
  );

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const justConnectedGmail = params.get("connected") === "gmail";

    const fetchStatus = async () => {
      try {
        const data = await apiService.gmailStatus();
        cachedConnected = data.connected;
        setConnected(data.connected);
      } catch {
        // On error, don't show banner (avoid false positive when API fails)
        cachedConnected = true;
        setConnected(true);
      }
    };

    if (justConnectedGmail) {
      // Refresh when returning from OAuth callback
      cachedConnected = null;
      fetchStatus();
      return;
    }

    if (cachedConnected !== null) {
      setConnected(cachedConnected);
      return;
    }

    fetchStatus();
  }, [location.search]);

  const handleDismiss = () => {
    sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
    setDismissed(true);
  };

  const handleReconnect = () => {
    navigate("/account-settings");
  };

  // Don't render until we've resolved status, or if connected, or if dismissed this session
  if (connected !== false || dismissed) {
    return null;
  }

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-900"
      style={{ minHeight: 40 }}
      role="banner"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-sm shrink-0">
          Gmail is not connected - email drafts won&apos;t be created.
        </span>
        <button
          type="button"
          onClick={handleReconnect}
          className="text-sm font-medium underline underline-offset-2 hover:no-underline focus:outline-none focus:underline shrink-0"
        >
          Reconnect in Account Settings
        </button>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-amber-700 hover:bg-amber-100 hover:text-amber-900"
        aria-label="Dismiss"
        onClick={handleDismiss}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
