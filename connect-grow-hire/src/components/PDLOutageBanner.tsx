import React, { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Hard-coded kill switch - set to true when PDL API is down, false when restored.
const PDL_OUTAGE_ACTIVE = true;

const SESSION_KEY = "pdl_outage_banner_dismissed";

export function PDLOutageBanner() {
  const [dismissed, setDismissed] = useState(() =>
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem(SESSION_KEY) === "1"
      : false
  );

  if (!PDL_OUTAGE_ACTIVE || dismissed) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    setDismissed(true);
  };

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2 bg-red-50 border-b border-red-200 text-red-900"
      style={{ minHeight: 40 }}
      role="banner"
    >
      <span className="text-sm flex-1 min-w-0">
        All Find features (People, Companies, Hiring Managers), Meeting
        Prep, and Agent are temporarily down due to a data provider update. Job
        Board and saved contacts are unaffected. We expect full service within
        1–2 days.
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-red-700 hover:bg-red-100 hover:text-red-900"
        aria-label="Dismiss"
        onClick={handleDismiss}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
