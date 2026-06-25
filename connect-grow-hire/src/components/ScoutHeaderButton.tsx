import React from "react";
import { useScout } from "@/contexts/ScoutContext";
import ScoutIconImage from "@/assets/scouts/scout-yeti-head.png";

interface ScoutHeaderButtonProps {
  onJobTitleSuggestion?: (title: string, company?: string, location?: string) => void;
}

/**
 * ScoutHeaderButton - Clear call-to-action for asking questions and getting help
 */
const ScoutHeaderButton: React.FC<ScoutHeaderButtonProps> = () => {
  const { openPanel, isPanelOpen } = useScout();

  return (
    <div className="flex items-end">
      <button
        onClick={openPanel}
        aria-label={isPanelOpen ? "Close Scout" : "Ask Scout questions to navigate Offerloop"}
        className="inline-flex items-center gap-2 rounded-[3px] px-3 py-1.5 text-sm font-medium transition-all duration-150 cursor-pointer focus:outline-none"
        style={{
          background: isPanelOpen ? 'rgba(139,46,31,0.06)' : 'transparent',
          border: `1px solid ${isPanelOpen ? 'var(--accent, #8B2E1F)' : 'var(--line, #E8E8E8)'}`,
          color: 'var(--ink, #1A1D23)',
          opacity: isPanelOpen ? 1 : 0.8,
        }}
        onMouseEnter={e => {
          if (!isPanelOpen) {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent, #8B2E1F)';
            (e.currentTarget as HTMLButtonElement).style.opacity = '1';
          }
        }}
        onMouseLeave={e => {
          if (!isPanelOpen) {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--line, #E8E8E8)';
            (e.currentTarget as HTMLButtonElement).style.opacity = '0.8';
          }
        }}
      >
        {/* Scout Icon — oxblood tinted */}
        <div className="relative flex items-center justify-center h-5 w-5 flex-shrink-0">
          <img
            src={ScoutIconImage}
            alt=""
            className="w-5 h-5 object-contain"
          />
        </div>

        {/* Button label */}
        <span className="whitespace-nowrap hidden sm:inline">
          Ask Scout
        </span>
      </button>
    </div>
  );
};

export default ScoutHeaderButton;
