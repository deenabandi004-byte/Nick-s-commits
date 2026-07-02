import { useEffect, useState } from "react";
import { apiService } from "@/services/api";

// Module-level cache so opening a modal doesn't re-hit the API every time
// (same pattern as GmailBanner.tsx).
let cachedConnected: boolean | null = null;

// Call after a successful disconnect so the next mount refetches instead of
// trusting a stale `true` from before the disconnect.
export function invalidateGmailConnectionCache() {
  cachedConnected = null;
}

export function useGmailConnection(): { connected: boolean | null } {
  const [connected, setConnected] = useState<boolean | null>(cachedConnected);

  useEffect(() => {
    if (cachedConnected !== null) return;
    let cancelled = false;
    apiService
      .gmailStatus()
      .then((data) => {
        cachedConnected = data.connected === true;
        if (!cancelled) setConnected(cachedConnected);
      })
      .catch(() => {
        // Unknown status — fail open (don't block drafting on an API blip).
        if (!cancelled) setConnected(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { connected };
}
