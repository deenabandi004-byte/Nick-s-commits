// ReferralTile
// A small, compact dashboard prompt that links to the /refer page. NOT the full
// link/Copy/Share card — just a short nudge so the home tab has a contextual
// referral presence without a pinned top banner.

import { useNavigate } from "react-router-dom";
import { Gift, ArrowRight } from "lucide-react";

const GRADIENT = "linear-gradient(135deg, #003262 0%, #1E3A8A 50%, #2563EB 100%)";

export function ReferralTile() {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate("/refer")}
      className="group flex w-full items-center gap-3 rounded-st-xl border border-line bg-white px-4 py-3 text-left shadow-sm transition-colors hover:border-[#C7D2FE]"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: GRADIENT }}
      >
        <Gift className="h-[18px] w-[18px] text-white" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-serif text-[14.5px] text-[#0F172A]">
          Refer friends, get a free month of Elite
        </span>
        <span className="block text-[12.5px] text-[#64748B]">
          Share your link — when 5 sign up, Elite's on us.
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-[#94A3B8] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--accent)]" />
    </button>
  );
}
