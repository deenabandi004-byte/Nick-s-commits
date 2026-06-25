// ReferPage — /refer
// The referral program's home base: the full Refer & Earn card (link + Copy +
// Share + progress) plus a short "How it works" explainer. Available to all
// tiers. Reuses ReferralCard so the link/Copy/Share logic has one source of
// truth.

import { Share2, UserPlus, Gift } from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { ReferralCard } from "@/components/referral/ReferralCard";

const STEPS = [
  {
    icon: Share2,
    title: "Share your link",
    body: "Copy your unique link or use Share to send it to friends.",
  },
  {
    icon: UserPlus,
    title: "Friend signs up",
    body: "When they create an Offerloop account with your link, it counts.",
  },
  {
    icon: Gift,
    title: "You both win",
    body: "Hit 5 signups and we give you a full month of Elite — free.",
  },
];

export default function ReferPage() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full font-sans" style={{ color: "var(--ink)" }}>
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="Refer & Earn" />

          <div className="flex-1 overflow-y-auto" style={{ background: "#FBFCFE" }}>
            <div className="mx-auto w-full max-w-[820px] space-y-8 px-5 py-6 sm:px-10 sm:py-8">
              {/* Full card — single source of truth for link/Copy/Share/progress */}
              <ReferralCard />

              {/* How it works */}
              <section>
                <h2 className="mb-4 font-serif text-[18px] text-[#0F172A]">How it works</h2>
                <div className="grid gap-4 sm:grid-cols-3">
                  {STEPS.map((step, i) => (
                    <div
                      key={step.title}
                      className="rounded-st-xl border border-line bg-white p-5 shadow-sm"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
                          <step.icon className="h-4 w-4" />
                        </span>
                        <span className="text-[12px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                          Step {i + 1}
                        </span>
                      </div>
                      <h3 className="mt-3 font-serif text-[15.5px] text-[#0F172A]">{step.title}</h3>
                      <p className="mt-1 text-[13px] leading-relaxed text-[#64748B]">{step.body}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}
