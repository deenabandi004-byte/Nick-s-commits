// ReferralCard
// The shared, persistent "Refer & Earn" surface: the user's unique, trackable
// referral link with Copy + Share actions and live progress toward the free
// month of Elite. Single source of truth — used by the /refer page (and any
// other full-card surface). Self-fetches via apiService; renders nothing until
// loaded. No modal and no dismiss control (it's page content, not a banner).

import { useEffect, useState } from "react";
import { Gift, Copy, Share2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiService } from "@/services/api";
import { toast } from "@/hooks/use-toast";

// Matches the pricing-page Season Pass card so the surfaces feel related.
const GRADIENT = "linear-gradient(135deg, #003262 0%, #1E3A8A 50%, #2563EB 100%)";
const HIGHLIGHT = "linear-gradient(135deg, #A3E635 0%, #FDE047 100%)";

type ReferralStatus = {
  referralCode: string;
  referralLink: string;
  signupCount: number;
  signupTarget: number;
  eligible: boolean;
  rewardClaimed: boolean;
  rewardClaimedAt: string | null;
  bannerDismissed: boolean;
  launchModalSeen: boolean;
};

export function ReferralCard({ className }: { className?: string }) {
  const [status, setStatus] = useState<ReferralStatus | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiService.getReferralStatus().then(setStatus).catch(() => {
      // On error, render nothing — never break the host page.
    });
  }, []);

  if (!status) return null;

  const { referralLink, signupCount, signupTarget, rewardClaimed } = status;

  const copyLink = () => {
    try { navigator.clipboard?.writeText(referralLink); } catch {}
    setCopied(true);
    toast({ title: "Link copied!", description: "Send it to friends to earn a free month of Elite." });
    setTimeout(() => setCopied(false), 2000);
  };

  const shareLink = async () => {
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({
          title: "Join me on Offerloop",
          text: "I'm using Offerloop to network into top internships & jobs — sign up with my link:",
          url: referralLink,
        });
        return;
      } catch {
        // user cancelled the share sheet — fall through to copy
      }
    }
    copyLink();
  };

  const pct = Math.min(100, Math.round((signupCount / signupTarget) * 100));
  const reached = signupCount >= signupTarget;

  return (
    <div
      className={cn("relative w-full overflow-hidden px-6 py-5 sm:px-7", className)}
      style={{ background: GRADIENT, borderRadius: 14, color: "#fff", boxShadow: "0 12px 36px -10px rgba(0,50,98,0.35)" }}
    >
      {/* decorative light wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{ right: -60, top: -90, width: 240, height: 240, borderRadius: 9999, background: "radial-gradient(circle, rgba(255,255,255,0.16), transparent 70%)" }}
      />

      <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        {/* Left: pitch + progress */}
        <div className="min-w-0 flex-1">
          <div
            className="inline-flex items-center gap-1.5"
            style={{ background: "rgba(255,255,255,0.15)", borderRadius: 999, padding: "5px 10px", fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase" }}
          >
            <Gift className="h-3 w-3" style={{ color: "#A3E635" }} /> Refer &amp; Earn
          </div>

          <h3 className="mt-3 font-serif" style={{ fontSize: 22, lineHeight: 1.2, fontWeight: 400 }}>
            Give friends Offerloop,{" "}
            <em
              style={{ background: HIGHLIGHT, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", fontWeight: 700 }}
            >
              get a free month of Elite
            </em>
          </h3>

          <p className="mt-1 text-white/80" style={{ fontSize: 13.5 }}>
            {reached
              ? `You've referred ${signupCount} friends — you've hit the goal! 🎉`
              : `When ${signupTarget} friends sign up with your link, you unlock a month of Elite — free.`}
          </p>

          <div className="mt-3 max-w-xs">
            <div className="flex justify-between text-[11px] text-white/70">
              <span>Signups</span>
              <span>{signupCount}/{signupTarget}</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: HIGHLIGHT }} />
            </div>
          </div>

          {rewardClaimed && (
            <p className="mt-2 text-[11px] text-white/70">✓ Reward claimed — thanks for spreading the word!</p>
          )}
        </div>

        {/* Right: the trackable link + actions */}
        <div className="w-full md:w-[320px] md:flex-shrink-0">
          <div className="flex items-center gap-2 rounded-lg bg-white/[0.12] p-1.5 ring-1 ring-white/15">
            <input
              readOnly
              value={referralLink}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 bg-transparent px-2 text-[12.5px] text-white outline-none"
            />
            <button
              onClick={copyLink}
              className="flex shrink-0 items-center gap-1 rounded-md bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-[#1E3A8A] transition-colors hover:bg-white/90"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            onClick={shareLink}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-white/15 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-white/25"
          >
            <Share2 className="h-3.5 w-3.5" /> Share link
          </button>
        </div>
      </div>
    </div>
  );
}
