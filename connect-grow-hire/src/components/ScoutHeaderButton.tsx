import React from "react";
import { useLocation } from "react-router-dom";
import { useScout } from "@/contexts/ScoutContext";
import ScoutIconImage from "@/assets/Scout_icon.png";

interface ScoutHeaderButtonProps {
  onJobTitleSuggestion?: (title: string, company?: string, location?: string) => void;
}

/**
 * ScoutHeaderButton - Floating blue call-to-action that opens the Scout panel.
 *
 * Appearance:
 * - A rounded blue pill in the top-right of the header, with a colored shadow
 *   so it reads as "floating" above the page.
 * - On the dashboard (home) it gently pulses with an expanding ring to invite
 *   first use. On every other page it is a consistent, static blue button.
 */
const ScoutHeaderButton: React.FC<ScoutHeaderButtonProps> = () => {
  const { openPanel, closePanel, isPanelOpen } = useScout();
  const { pathname } = useLocation();
  const isHome = pathname === "/dashboard";
  const shouldPulse = isHome && !isPanelOpen;

  return (
    <button
      onClick={isPanelOpen ? closePanel : openPanel}
      aria-label={isPanelOpen ? "Close Scout" : "Ask Scout for help navigating Offerloop"}
      className={`group inline-flex items-center gap-2.5 rounded-full pl-2 pr-7 py-2 text-sm font-semibold text-white
        bg-[#3B82F6] hover:bg-[#2563EB] active:scale-[0.97]
        transition-[background-color,transform] duration-150 cursor-pointer
        focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:ring-offset-2
        ${shouldPulse ? "scout-btn-pulse" : "shadow-[0_4px_14px_rgba(59,130,246,0.40)]"}`}
    >
      {/* Scout icon inside a bright circle for a polished, floating look */}
      <span className="flex items-center justify-center h-8 w-8 rounded-full bg-white/30 flex-shrink-0">
        <img
          src={ScoutIconImage}
          alt=""
          className="w-5 h-5 object-contain"
          style={{
            filter: "brightness(0) invert(1) drop-shadow(0 1px 1px rgba(0,0,0,0.25))",
          }}
        />
      </span>

      <span className="whitespace-nowrap hidden sm:inline tracking-wide">
        {isPanelOpen ? "Close Scout" : "Ask Scout"}
      </span>
    </button>
  );
};

export default ScoutHeaderButton;
