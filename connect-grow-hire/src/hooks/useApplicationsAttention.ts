// Count of auto-applications waiting on the user (extra questions + CAPTCHA).
// Polls the REST lists (Firestore rules deny client reads of autoApplyJobs).
// 60s cadence — the Applications page itself polls faster; this is just the badge.
import { useEffect, useState } from "react";
import { listNeedsAttention, listNeedsVerification } from "@/services/api";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";

const POLL_MS = 60_000;

export function useApplicationsAttention(): number {
  const { user } = useFirebaseAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user?.uid) { setCount(0); return; }
    let cancelled = false;
    const tick = async () => {
      try {
        const [attention, verification] = await Promise.all([
          listNeedsAttention(),
          listNeedsVerification(),
        ]);
        if (!cancelled) {
          setCount((attention.items?.length ?? 0) + (verification.items?.length ?? 0));
        }
      } catch {
        if (!cancelled) setCount(0); // free tier / transient — badge just hides
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [user?.uid]);

  return count;
}
