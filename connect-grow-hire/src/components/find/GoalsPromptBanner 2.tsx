import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";

const DISMISS_KEY = "goals_banner_dismissed_at";
const RESHOW_DAYS = 7;

export function GoalsPromptBanner() {
  const navigate = useNavigate();
  const { user } = useFirebaseAuth();

  const [dismissed, setDismissed] = useState(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (!raw) return false;
      const dismissedAt = parseInt(raw, 10);
      const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
      return daysSince < RESHOW_DAYS;
    } catch {
      return false;
    }
  });

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  // Don't show if dismissed, no user, or user already has careerTrack set
  if (dismissed || !user) return null;

  // Check if goals data exists (careerTrack loaded in auth context from Firestore)
  if (user.careerTrack) return null;

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2 bg-blue-50 border-b border-blue-200 text-blue-900"
      style={{ minHeight: 40 }}
      role="banner"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-sm shrink-0">
          Set your career goals to get better contact and company suggestions.
        </span>
        <button
          type="button"
          onClick={() => navigate("/account-settings")}
          className="text-sm font-medium underline underline-offset-2 hover:no-underline focus:outline-none focus:underline shrink-0"
        >
          Add goals
        </button>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-blue-700 hover:bg-blue-100 hover:text-blue-900"
        aria-label="Dismiss"
        onClick={handleDismiss}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
