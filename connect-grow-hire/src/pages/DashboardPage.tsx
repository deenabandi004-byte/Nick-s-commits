// DashboardPage - "Home"
// The post-login home. One job: a returning user understands their status and
// takes their next valuable action in under 5 seconds.
//
// Route stays /dashboard (internal); the user-facing name is "Home".
// Built with the dashboard-builder + visual-hierarchy skills. Structure:
//   1. Blue hero band - greeting + recent-activity metrics + Scout command bar
//   2. Needs you now
//   3. Four color-coded discovery carousels (People/Companies/Hiring/Loops)
//   4. Your loops   5. Follow-ups   6. Tools
// The blue band is the single focal point; the carousels are the CTAs.

import React, { useMemo, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, Mail, Calendar, Users, Building2, Coffee,
  Briefcase, Repeat, Play, X, Clock,
  ChevronRight, ChevronLeft, UserPlus, CircleCheck, Loader2, HelpCircle,
  Info,
} from "lucide-react";

import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { CompanyLogo } from "@/components/CompanyLogo";

import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useCreditsView } from "@/hooks/useCreditsView";
import { useScout } from "@/contexts/ScoutContext";
import { useNotifications } from "@/hooks/useNotifications";
import {
  useAgentConfig, useAgentSidebarStatus, useAgentCycles, useCycleRunner, useCountdown,
} from "@/hooks/useAgent";
import { apiService, type Nudge } from "@/services/api";
import { firebaseApi } from "@/services/firebaseApi";
import { ReferralTile } from "@/components/referral/ReferralTile";

/* ============================================================
   Helpers
   ============================================================ */

function firstNameOf(name?: string): string {
  const n = (name || "").trim().split(/\s+/)[0];
  return n || "there";
}

function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Label a "yyyy-MM-dd" date as Today / Tomorrow / weekday / short date. */
function dayLabel(dateStr?: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dt = new Date(y, m - 1, d);
  const diff = Math.round((dt.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff < 7) return dt.toLocaleDateString(undefined, { weekday: "long" });
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function daysUntil(dateStr?: string): number {
  if (!dateStr) return 9999;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return 9999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86_400_000);
}

/** Unwrap an `T | { error }` API response - returns null on error. */
function ok<T>(r: T | { error: string } | undefined | null): T | null {
  if (!r) return null;
  if (typeof r === "object" && "error" in (r as Record<string, unknown>)) return null;
  return r as T;
}

type RecItem = {
  type: string;
  title: string;
  description: string;
  action: string;
  contactId?: string;
  priority?: string;
};

/* ============================================================
   Discovery - recommended searches built from the user's profile
   ============================================================ */

function roleFromTrack(track: string): string {
  const t = (track || "").toLowerCase();
  if (t.includes("bank")) return "Investment Banking Analyst";
  if (t.includes("consult")) return "Consultant";
  if (t.includes("software") || t.includes("engineer")) return "Software Engineer";
  if (t.includes("product")) return "Product Manager";
  if (t.includes("data")) return "Data Analyst";
  if (t.includes("market")) return "Marketing Coordinator";
  if (t.includes("financ")) return "Financial Analyst";
  return "Analyst";
}

function fallbackFirms(track: string): string[] {
  const t = (track || "").toLowerCase();
  if (t.includes("bank") || t.includes("financ"))
    return ["Goldman Sachs", "J.P. Morgan", "Morgan Stanley", "Evercore", "Lazard", "Citi"];
  if (t.includes("consult"))
    return ["McKinsey & Company", "Boston Consulting Group", "Bain & Company", "Deloitte", "Accenture"];
  if (t.includes("tech") || t.includes("engineer") || t.includes("software") || t.includes("product"))
    return ["Google", "Meta", "Amazon", "Microsoft", "Apple", "Stripe"];
  return ["Goldman Sachs", "McKinsey & Company", "Google", "J.P. Morgan", "BlackRock"];
}

function fallbackIndustries(track: string): string[] {
  const t = (track || "").toLowerCase();
  if (t.includes("bank") || t.includes("financ"))
    return ["Investment Banks", "Private Equity Firms", "Hedge Funds"];
  if (t.includes("consult"))
    return ["Consulting Firms", "Boutique Consultancies", "Corporate Strategy"];
  if (t.includes("tech") || t.includes("engineer") || t.includes("software") || t.includes("product"))
    return ["Tech Companies", "AI Startups", "SaaS Companies"];
  return ["Investment Banks", "Consulting Firms", "Tech Companies"];
}

type PeopleCard = { id: string; company: string; role: string; location?: string };
type CompanyCard = { id: string; industry: string; location?: string };
type HmCard = { id: string; company: string; role: string };
type LoopCard = {
  id: string; title: string; subtitle: string;
  companies: string[]; industries: string[]; roles: string[];
};
type Discovery = { people: PeopleCard[]; companies: CompanyCard[]; hms: HmCard[]; loops: LoopCard[] };

type Profile = {
  careerTrack?: string; preferredJobRole?: string; extractedRoles?: string[];
  targetFirms?: string[]; dreamCompanies?: string[]; preferredLocations?: string[];
  targetIndustries?: string[]; university?: string;
  // Free-form blurb fields surfaced on /profile. Used by the home widget's
  // CTA rotation to nudge users toward filling out the moat-building text.
  directionNarrative?: string; personalContext?: string; hardNos?: string;
};

/** Turn the user's onboarding profile into four sets of recommended cards. */
function buildDiscovery(p?: Profile): Discovery {
  const roles = ((p?.extractedRoles?.length ? p.extractedRoles : [p?.preferredJobRole])
    .filter(Boolean)) as string[];
  const track = p?.careerTrack || p?.targetIndustries?.[0] || "";
  const primaryRole = roles[0] || roleFromTrack(track);
  const rolePool = roles.length ? roles : [primaryRole];

  let firms = ((p?.targetFirms?.length ? p.targetFirms : p?.dreamCompanies) || [])
    .filter(Boolean) as string[];
  if (firms.length === 0) firms = fallbackFirms(track);

  let industries = (p?.targetIndustries || []).filter(Boolean) as string[];
  if (industries.length === 0) industries = fallbackIndustries(track);

  const locations = (p?.preferredLocations || []).filter(Boolean) as string[];
  const loc = locations[0];

  const people: PeopleCard[] = firms.slice(0, 8).map((c, i) => ({
    id: `p${i}`, company: c, role: rolePool[i % rolePool.length], location: loc,
  }));

  const companies: CompanyCard[] = [];
  industries.slice(0, 6).forEach((ind, i) => companies.push({ id: `c${i}`, industry: ind, location: loc }));
  if (locations[1]) {
    industries.slice(0, 2).forEach((ind, i) =>
      companies.push({ id: `cl${i}`, industry: ind, location: locations[1] }));
  }

  const hms: HmCard[] = firms.slice(0, 8).map((c, i) => ({
    id: `h${i}`, company: c, role: rolePool[i % rolePool.length],
  }));

  const loops: LoopCard[] = [];
  loops.push({
    id: "l0", title: "Your target firms",
    subtitle: `${Math.min(firms.length, 6)} companies on autopilot`,
    companies: firms.slice(0, 6), industries: [], roles: rolePool.slice(0, 3),
  });
  if (industries[0]) {
    loops.push({
      id: "l1", title: industries[0], subtitle: "Find + draft every week",
      companies: [], industries: [industries[0]], roles: rolePool.slice(0, 3),
    });
  }
  loops.push({
    id: "l2", title: `${primaryRole} pipeline`, subtitle: "Fresh leads, drafted for you",
    companies: firms.slice(0, 4), industries: [], roles: [primaryRole],
  });
  if (industries[1]) {
    loops.push({
      id: "l3", title: industries[1], subtitle: "Find + draft every week",
      companies: [], industries: [industries[1]], roles: rolePool.slice(0, 3),
    });
  }

  return { people, companies: companies.slice(0, 6), hms, loops: loops.slice(0, 4) };
}

/* ============================================================
   Category color system - TWO accents only.
   - Brand blue (var(--accent)) = every category action/link (People,
     Companies, Hiring). Tint = var(--primary-50). No purple, no green.
   - Orange = reserved EXCLUSIVELY for loop-related UI (the Loop card).
   `color` is the solid text/icon color; `tint` is the icon-tile fill.
   ============================================================ */

const CATS = {
  people: {
    color: "var(--accent)", tint: "var(--primary-50)",
    label: "People", Icon: Users, action: "Find people",
  },
  companies: {
    color: "var(--accent)", tint: "var(--primary-50)",
    label: "Companies", Icon: Building2, action: "Find firms",
  },
  hm: {
    color: "var(--accent)", tint: "var(--primary-50)",
    label: "Hiring", Icon: UserPlus, action: "Find hiring managers",
  },
  loop: {
    color: "var(--signal-pos, #16A34A)", tint: "#16A34A14",
    label: "Loop", Icon: Repeat, action: "Set up loop",
  },
} as const;
type CatKey = keyof typeof CATS;

/* ============================================================
   Shared styles
   ============================================================ */

// These mirror the My Network filter-bar tokens (FB_* in src/pages/MyNetworkPage.tsx,
// the documented single source of truth) so Home reads as the same product:
// cards use the rounded-st-xl + border-line treatment, and pill controls are
// h-10 / rounded-full / 14px text with 14px icons.
const CARD = "rounded-st-xl border border-line bg-white";
const CARD_HOVER = "transition-all hover:border-[#CBD5E1] hover:shadow-[0_4px_14px_rgba(15,23,42,0.06)]";
const PILL = "h-10 px-3 rounded-full text-[14px]";                                    // FB_SIZE
const PILL_OUTLINE = "bg-paper-2/60 border border-line text-black hover:bg-paper-2";  // FB_FILL (secondary)
const PILL_ICON = "h-3.5 w-3.5";                                                      // FB_ICON

/* ============================================================
   Small presentational components
   ============================================================ */

function ZoneHeader({
  title, count, action,
}: { title: string; count?: number; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h2
          className="font-sans text-[13.5px] font-semibold tracking-[-0.01em] text-[#334155]"
          style={{ textShadow: "0 1px 2px rgba(255,255,255,0.9), 0 0 12px rgba(255,255,255,0.5)" }}
        >
          {title}
        </h2>
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-[var(--primary-50)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
            {count}
          </span>
        )}
      </div>
      {action}
    </div>
  );
}

/* ---- DoorDash / Uber-Eats-style discovery carousel ---- */

function DiscoveryCard({
  catKey, title, subtitle, monogram, logoCompany, onClick,
}: {
  catKey: CatKey; title: string; subtitle: string;
  monogram?: string; logoCompany?: string; onClick: () => void;
}) {
  const c = CATS[catKey];
  const Icon = c.Icon;
  return (
    <button
      onClick={onClick}
      className="snap-start shrink-0 w-[230px] rounded-st-2xl border border-line bg-white text-left shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-all duration-150 hover:-translate-y-1 hover:border-[#CBD5E1] hover:shadow-[0_12px_28px_rgba(15,23,42,0.12)]"
    >
      <div className="p-3.5">
        {/* category row: company logo (or icon tile) + neutral label */}
        <div className="flex items-center justify-between">
          {logoCompany ? (
            <CompanyLogo company={logoCompany} size={36} rounded={9} />
          ) : (
            <span
              className="flex h-9 w-9 items-center justify-center rounded-[9px] text-[14px] font-bold"
              style={{ background: c.tint, color: c.color }}
            >
              {monogram ? monogram : <Icon className="h-[18px] w-[18px]" />}
            </span>
          )}
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">
            {c.label}
          </span>
        </div>
        <p className="mt-3 truncate text-[14px] font-semibold text-[#0F172A]">{title}</p>
        <p className="mt-0.5 truncate text-[12px] text-[#94A3B8]">{subtitle}</p>
        <p className="mt-2.5 flex items-center gap-1 text-[12.5px] font-semibold" style={{ color: c.color }}>
          {c.action} <ArrowRight className="h-3.5 w-3.5" />
        </p>
      </div>
    </button>
  );
}

function Rail({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const by = (dir: number) => ref.current?.scrollBy({ left: dir * 250, behavior: "smooth" });
  return (
    <div className="group/rail relative">
      <div
        ref={ref}
        className="scrollbar-hide flex snap-x snap-mandatory gap-3.5 overflow-x-auto pb-1"
      >
        {children}
      </div>
      <button
        onClick={() => by(-1)}
        aria-label="Scroll left"
        className="absolute -left-3 top-[43px] z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#475569] shadow-md transition-opacity hover:text-[#0F172A] sm:flex sm:opacity-0 sm:group-hover/rail:opacity-100"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        onClick={() => by(1)}
        aria-label="Scroll right"
        className="absolute -right-3 top-[43px] z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#475569] shadow-md transition-opacity hover:text-[#0F172A] sm:flex sm:opacity-0 sm:group-hover/rail:opacity-100"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ============================================================
   Page
   ============================================================ */

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useFirebaseAuth();
  const creditsView = useCreditsView();
  const { openPanelWithMessage } = useScout();
  const { notifications } = useNotifications();

  const [scoutInput, setScoutInput] = useState("");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loopModalOpen, setLoopModalOpen] = useState(false);

  /* ---- loops (the agent, reframed) ---- */
  const agentConfig = useAgentConfig();
  const { status: loopStatus, pendingCount: loopPending } = useAgentSidebarStatus();
  // While the status is still loading (undefined) we render a height-locked
  // skeleton rather than defaulting to the tall setup card, which would shift
  // when it resolves to the active-loop card. isLoopSetup keeps treating
  // undefined as "setup" so the cycles query stays disabled until we know the
  // real status.
  const isLoopLoading = loopStatus === undefined;
  const isLoopSetup = loopStatus === "setup" || loopStatus === undefined;
  const cyclesQuery = useAgentCycles(1, !isLoopSetup);
  const { runNow, isRunNowPending, isRunning, cycleProgress } = useCycleRunner();
  const nextLoopIn = useCountdown(agentConfig.data?.nextCycleAt);

  /* ---- data queries ---- */
  const recsQuery = useQuery({
    queryKey: ["dashboard", "recommendations"],
    queryFn: () => apiService.getRecommendations(),
    enabled: !!user,
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const nudgesQuery = useQuery({
    queryKey: ["dashboard", "nudges"],
    queryFn: () => apiService.getNudges({ status: "pending", limit: 6 }),
    enabled: !!user,
    retry: 1,
  });

  const statsQuery = useQuery({
    queryKey: ["dashboard", "outboxStats"],
    queryFn: () => apiService.getOutboxStats(),
    enabled: !!user,
    retry: 1,
  });

  const eventsQuery = useQuery({
    queryKey: ["dashboard", "events"],
    queryFn: () => firebaseApi.getCalendarEvents(user!.uid),
    enabled: !!user?.uid,
    retry: 1,
  });

  const profileQuery = useQuery({
    queryKey: ["dashboard", "profile"],
    queryFn: () => firebaseApi.getUserOnboardingData(user!.uid),
    enabled: !!user?.uid,
    retry: 1,
    staleTime: 10 * 60 * 1000,
  });

  /* ---- derive ---- */
  const recs: RecItem[] = (ok(recsQuery.data)?.recommendations ?? []) as RecItem[];
  const nudges: Nudge[] = (ok(nudgesQuery.data)?.nudges ?? []).filter(
    (n) => !dismissed.has(`nudge-${n.id}`),
  );
  const outbox = ok(statsQuery.data);
  const events = eventsQuery.data ?? [];
  const discovery = useMemo(() => buildDiscovery(profileQuery.data), [profileQuery.data]);

  const unreadReplies = useMemo(
    () => notifications.items.filter((i) => !i.read).slice(0, 3),
    [notifications.items],
  );

  const soonMeetings = useMemo(
    () => events.filter((e) => { const d = daysUntil(e.date); return d >= 0 && d <= 2; }).slice(0, 2),
    [events],
  );

  const lastCycle = cyclesQuery.data?.cycles?.[0];
  const cfg = agentConfig.data;

  const dataLoading =
    recsQuery.isLoading || nudgesQuery.isLoading || statsQuery.isLoading || eventsQuery.isLoading;

  /* ---- recent-activity metrics (shown inside the blue band) ---- */
  const sent = outbox?.thisWeekSent ?? 0;
  const replied = outbox?.thisWeekReplied ?? 0;
  const replyRate = outbox?.replyRate != null
    ? Math.round(outbox.replyRate * (outbox.replyRate <= 1 ? 100 : 1))
    : 0;
  // Credits come from the auth user (present at first paint), so that cell
  // never shows a skeleton. The other three are statsQuery-driven, so they
  // show a value-sized skeleton while it loads instead of flashing 0.
  const statsPending = statsQuery.isLoading;
  // The three activity metrics are THIS WEEK (outbox stats reset weekly), so
  // they're labeled as such — otherwise "0 Replies" reads as contradicting the
  // greeting's "N replies waiting" (which is the all-time unread backlog).
  // Credits is a live balance, not weekly, so it stays unqualified.
  const bandMetrics = [
    { label: "Sent this week", value: String(sent), pending: statsPending },
    { label: "Replies this week", value: String(replied), pending: statsPending },
    { label: "Reply rate · wk", value: `${replyRate}%`, pending: statsPending },
    { label: creditsView.isTrialing ? "Trial credits left" : "Credits left", value: String(creditsView.balance), pending: false },
  ];

  /* ---- welcome line - replies waiting + loop actions to review ---- */
  const statusLine = useMemo(() => {
    const n = unreadReplies.length;
    const m = loopPending;
    const replyW = n === 1 ? "reply" : "replies";
    const actionW = m === 1 ? "action" : "actions";
    if (n > 0 && m > 0) return `You have ${n} unread ${replyW} and ${m} loop ${actionW} to review.`;
    if (n > 0) return `You have ${n} unread ${replyW} to review.`;
    if (m > 0) return `You have ${m} loop ${actionW} to review.`;
    return "All caught up - start a new loop when you're ready.";
  }, [unreadReplies.length, loopPending]);

  /* ---- needs-you-now items ---- */
  type NeedItem = {
    key: string; icon: React.ReactNode; tone: string;
    text: string; sub: string; cta: string; onClick: () => void;
  };
  const needs: NeedItem[] = [];
  for (const r of unreadReplies) {
    needs.push({
      key: `reply-${r.contactId}`,
      icon: <Mail className="h-4 w-4" />,
      tone: "var(--accent)",
      text: `${r.contactName} replied to you`,
      sub: r.company || r.snippet?.slice(0, 60) || "Reply waiting in your inbox",
      cta: "Reply",
      onClick: () => navigate("/tracker", { state: { selectContactId: r.contactId } }),
    });
  }
  for (const e of soonMeetings) {
    needs.push({
      key: `mtg-${e.id}`,
      icon: <Calendar className="h-4 w-4" />,
      tone: "var(--accent)",
      text: `${e.type || "Meeting"} with ${e.contactName || "a contact"}`,
      sub: `${dayLabel(e.date)}${e.time ? ` at ${e.time}` : ""}${e.firm ? ` · ${e.firm}` : ""}`,
      cta: "Prep",
      onClick: () => navigate("/coffee-chat-prep"),
    });
  }
  if (loopPending > 0) {
    needs.push({
      key: "loop-approvals",
      icon: <Repeat className="h-4 w-4" />,
      tone: "var(--accent)",
      text: `Your last loop has ${loopPending} ${loopPending === 1 ? "action" : "actions"} to review`,
      sub: "Scout drafted these for you - approve or skip each one",
      cta: "Review",
      onClick: () => navigate("/agent"),
    });
  }

  /* ---- follow-up cards (nudges first - most concrete) ---- */
  type RecCard = {
    key: string; name: string; meta: string; reason: string;
    cta: string; onClick: () => void; onDismiss: () => void;
  };
  const recCards: RecCard[] = [];
  for (const n of nudges.slice(0, 4)) {
    recCards.push({
      key: `nudge-${n.id}`,
      name: `Follow up with ${n.contactName}`,
      meta: n.company || "",
      reason: `You reached out to ${n.company || "this contact"} but haven't heard back - a short nudge keeps it warm.`,
      cta: "Review draft",
      onClick: () => navigate("/tracker", { state: { selectContactId: n.contactId } }),
      onDismiss: () => setDismissed((s) => new Set(s).add(`nudge-${n.id}`)),
    });
  }
  for (const r of recs) {
    if (recCards.length >= 4) break;
    const key = `rec-${r.title}`;
    if (dismissed.has(key)) continue;
    recCards.push({
      key,
      name: r.title,
      meta: "",
      reason: r.description,
      cta: "Open",
      onClick: () => (r.contactId
        ? navigate("/tracker", { state: { selectContactId: r.contactId } })
        : navigate("/find")),
      onDismiss: () => setDismissed((s) => new Set(s).add(key)),
    });
  }

  /* ---- Scout command bar ---- */
  const askScout = (msg: string) => {
    const t = msg.trim();
    if (t) { openPanelWithMessage(t); setScoutInput(""); }
  };

  /* ---- discovery navigation (deep-link + pre-populate) ---- */
  const runPeople = (c: PeopleCard) => {
    const qs = new URLSearchParams({ tab: "people", company: c.company, role: c.role });
    if (c.location) qs.set("location", c.location);
    navigate(`/find?${qs.toString()}`);
  };
  const runCompany = (c: CompanyCard) => {
    navigate("/find?tab=companies", {
      state: { scoutAutoPopulate: { search_type: "firm", industry: c.industry, location: c.location } },
    });
  };
  const runHm = (c: HmCard) => {
    const qs = new URLSearchParams({ tab: "hiring-managers", company: c.company });
    if (c.role) qs.set("role", c.role);
    navigate(`/find?${qs.toString()}`);
  };
  const startLoop = (c: LoopCard) => {
    try {
      sessionStorage.setItem("loop_prefill", JSON.stringify({
        companies: c.companies, industries: c.industries, roles: c.roles,
      }));
    } catch { /* ignore */ }
    navigate("/agent/setup");
  };

  /* ---- one mixed, color-coded recommendation rail ----
     Cards from all four categories interleaved round-robin so the rail opens
     with variety (People, Company, Hiring, Loop, …) - the card color + tag
     does the organizing, so no tabs and nothing buried at the bottom. */
  type MixedCard = {
    id: string; catKey: CatKey; title: string; subtitle: string;
    monogram?: string; logoCompany?: string; onClick: () => void;
  };
  const mixed: MixedCard[] = (() => {
    const peopleM: MixedCard[] = discovery.people.map((c) => ({
      id: `mx-${c.id}`, catKey: "people", logoCompany: c.company,
      title: c.company, subtitle: `${c.role}${c.location ? ` · ${c.location}` : ""}`,
      onClick: () => runPeople(c),
    }));
    // Company cards represent an industry, not a firm - no logo, show the icon.
    const companyM: MixedCard[] = discovery.companies.map((c) => ({
      id: `mx-${c.id}`, catKey: "companies",
      title: c.industry, subtitle: c.location ? `Roles in ${c.location}` : "Roles across all markets",
      onClick: () => runCompany(c),
    }));
    const hmM: MixedCard[] = discovery.hms.map((c) => ({
      id: `mx-${c.id}`, catKey: "hm", logoCompany: c.company,
      title: c.company, subtitle: "Open hiring manager roles",
      onClick: () => runHm(c),
    }));
    const loopM: MixedCard[] = discovery.loops.map((c) => ({
      id: `mx-${c.id}`, catKey: "loop",
      title: c.title, subtitle: c.subtitle,
      onClick: () => startLoop(c),
    }));
    const lists = [peopleM, companyM, hmM, loopM];
    const out: MixedCard[] = [];
    for (let i = 0; out.length < 16; i++) {
      let added = false;
      for (const l of lists) {
        if (l[i]) { out.push(l[i]); added = true; if (out.length >= 16) break; }
      }
      if (!added) break;
    }
    return out;
  })();

  /* ---- hero quick links (top-right of the blue band) ---- */
  const heroLinks = [
    { label: "Find People", to: "/find" },
    { label: "Prep for next Call", to: "/coffee-chat-prep" },
    { label: "See Who's Responded", to: "/tracker" },
  ];

  /* ---- tools (demoted chip row) ---- */
  const tools = [
    { icon: <Mail className="h-3.5 w-3.5" />, label: "Inbox", to: "/tracker" },
    { icon: <Coffee className="h-3.5 w-3.5" />, label: "Meeting Prep", to: "/coffee-chat-prep" },
    { icon: <Briefcase className="h-3.5 w-3.5" />, label: "Job Board", to: "/job-board" },
  ];

  /* ---- auth gate ---- */
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  /* ============================================================
     Render
     ============================================================ */
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full font-sans" style={{ color: "var(--ink)" }}>
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="Home" />

          <div className="flex-1 overflow-y-auto relative" style={{ background: "#FBFCFE" }}>
            {/* Background watercolor mountains, sourced from the Figma file's
                synced HTML asset (imgMountainsLake1, node 2081:15934). Fixed
                to the viewport bottom so the ground/horizon stays visible
                regardless of scroll position. Height covers ~70% of the
                viewport, so the peaks rise behind the hero card from the
                sides while the lake reflection grounds the bottom edge.
                Z-index sits behind the content wrapper; the sidebar's solid
                navy covers the left portion. */}
            <img
              src="/mountains-lake.png"
              alt=""
              aria-hidden
              draggable={false}
              style={{
                position: "fixed",
                bottom: 0,
                left: 0,
                width: "100%",
                height: "70vh",
                objectFit: "cover",
                objectPosition: "bottom center",
                opacity: 0.9,
                zIndex: 0,
                pointerEvents: "none",
                userSelect: "none",
              }}
            />

            <div
              className="relative mx-auto w-full max-w-[1040px] space-y-8 px-5 py-6 sm:px-10 sm:py-8"
              style={{ zIndex: 1 }}
            >
              {/* Yeti peeking over the top-right of the hero card. Positioned
                  absolute so most of the body sits behind the hero's rounded
                  top edge while the paws and head crest above it. Anchored to
                  the content wrapper (not fixed) so it scrolls away with the
                  hero rather than persisting through the page. */}
              <img
                src="/yeti-mascot.png"
                alt=""
                aria-hidden
                style={{
                  position: "absolute",
                  top: 0,
                  right: 100,
                  width: 160,
                  height: "auto",
                  zIndex: 5,
                  pointerEvents: "none",
                  userSelect: "none",
                }}
                draggable={false}
              />

              {/* ── 1. Blue hero band - greeting + metrics + Scout ── */}
              <section
                className="animate-fadeInUp relative overflow-hidden rounded-st-3xl"
                /* Spec defines no surface gradient; this is a subtle depth gradient
                   between two canonical APP-system colors — brand slate (--accent
                   #4a60a8) into heading navy (--heading #1e2d4d). Ties the hero to
                   the navy sidebar/headings. Swap to a flat `var(--accent)` if you
                   want strictly solid. */
                style={{ background: "linear-gradient(135deg,var(--accent) 0%,var(--heading) 100%)" }}
              >
                {/* soft light decoration */}
                <div
                  className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full"
                  style={{ background: "radial-gradient(circle,rgba(255,255,255,0.20),transparent 70%)" }}
                />
                <div className="relative px-6 py-5 sm:px-8">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h1 className="font-serif text-[30px] leading-tight text-white sm:text-[34px]">
                        Hi {firstNameOf(user?.name)}
                      </h1>
                      <p className="mt-0.5 text-[14px] text-white/80">{statusLine}</p>
                    </div>
                    <nav className="hidden flex-shrink-0 items-center gap-1 pt-1 sm:flex">
                      {heroLinks.map((l) => (
                        <button
                          key={l.label}
                          onClick={() => navigate(l.to)}
                          className="rounded-md px-2.5 py-1 text-[12.5px] font-semibold text-white/85 transition-colors hover:bg-white/15 hover:text-white"
                        >
                          {l.label}
                        </button>
                      ))}
                    </nav>
                  </div>

                  {/* get-started nudge above the metrics */}
                  <div className="mt-3.5 flex flex-col gap-3 rounded-st-xl border border-white/20 bg-white/10 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[13.5px] font-semibold text-white">Get started</p>
                      <p className="mt-0.5 text-[13px] text-white/75">
                        Put tasks on autopilot, walk away and get a text when the work's done.
                      </p>
                    </div>
                    <Button
                      onClick={() => navigate("/agent/setup")}
                      className={`${PILL} shrink-0 gap-1.5 bg-white font-semibold text-[var(--accent)] hover:bg-white/90`}
                    >
                      Start a loop <ArrowRight className={PILL_ICON} />
                    </Button>
                  </div>

                  {/* recent-activity metrics - always visible */}
                  <div className="mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {bandMetrics.map((m) => (
                      <div
                        key={m.label}
                        className="rounded-st-xl border border-white/15 bg-white/10 px-3.5 py-2"
                      >
                        {m.pending ? (
                          <Skeleton className="h-[22px] w-9 rounded bg-white/25" />
                        ) : (
                          <p className="font-serif text-[22px] leading-none text-white">{m.value}</p>
                        )}
                        <p className="mt-1 text-[11.5px] font-medium text-white/70">{m.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Scout command bar */}
                  <div className="mt-3.5 flex items-center gap-2 rounded-st-xl bg-white px-3.5 py-2.5 shadow-sm">
                    <input
                      value={scoutInput}
                      onChange={(e) => setScoutInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") askScout(scoutInput); }}
                      placeholder="Ask Scout to find people, draft emails, or run a loop…"
                      className="flex-1 bg-transparent text-[14px] text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none"
                    />
                    <kbd className="hidden rounded border border-[#E2E8F0] bg-[#F8FAFC] px-1.5 py-0.5 text-[10.5px] font-medium text-[#94A3B8] sm:inline">
                      ⌘K
                    </kbd>
                    <Button
                      onClick={() => askScout(scoutInput)}
                      disabled={!scoutInput.trim()}
                      className={`${PILL} gap-1.5 bg-[var(--accent)] text-white hover:bg-[var(--primary-600)]`}
                    >
                      Ask Scout <ArrowRight className={PILL_ICON} />
                    </Button>
                  </div>
                </div>
              </section>

              {/* ── 1b. Personalization prose widget — editorial voice, not chips.
                  Reads like a sentence the system has written about the user
                  (serif + periwinkle highlighter marks). The marker stroke is
                  faithful to the landing-page testimonial treatment so the
                  visual language ties the marketing page to the in-app surface.
                  The CTA at the bottom is the only navigation point; routes to
                  /account-settings for now (Phase 1). Phase 2 swaps that to a
                  new free-flow /profile page. */}
              {(() => {
                // Reserve the widget height and show a skeleton while the
                // profile loads, so the prose (1 to 3 lines) never reflows the
                // page and we never flash the "set up your profile" fallback at
                // users who already have one. minHeight matches the loaded
                // section so the swap causes no shift.
                if (profileQuery.isLoading) {
                  return (
                    <section
                      className="rounded-st-xl border border-line bg-white"
                      style={{ padding: "20px 24px", minHeight: 132 }}
                    >
                      <div className="space-y-3">
                        <Skeleton className="h-[20px] w-[94%] rounded" />
                        <Skeleton className="h-[20px] w-[60%] rounded" />
                      </div>
                      <Skeleton className="mt-[18px] h-[20px] w-48 rounded" />
                    </section>
                  );
                }
                const p = profileQuery.data as Profile | undefined;
                const uni = p?.university;
                const role = p?.preferredJobRole || p?.extractedRoles?.[0] || p?.careerTrack;
                const firms = ((p?.targetFirms?.length ? p.targetFirms : p?.dreamCompanies) || [])
                  .filter(Boolean)
                  .slice(0, 3) as string[];
                const loc = (p?.preferredLocations || []).filter(Boolean)[0];
                const hasAnything = !!(uni || role || firms.length > 0 || loc);

                // Periwinkle highlighter — full text height, fainter and
                // softer than a true marker stroke so the prose reads first
                // and the highlight feels natural rather than abrupt.
                // Matches the landing-page testimonial treatment density.
                const hi: React.CSSProperties = {
                  background: "rgba(123,143,201,0.18)",
                  padding: "1px 5px",
                  borderRadius: 2,
                  fontWeight: 500,
                  boxDecorationBreak: "clone",
                  WebkitBoxDecorationBreak: "clone",
                };

                const buildSentence = () => {
                  const parts: React.ReactNode[] = [];
                  parts.push("You're");
                  if (uni) parts.push(<> at <span style={hi} key="u">{uni}</span></>);
                  if (role) parts.push(<> looking for <span style={hi} key="r">{role}</span> roles</>);
                  if (firms.length > 0) {
                    parts.push(" at ");
                    firms.forEach((f, i) => {
                      parts.push(<span style={hi} key={`f${i}`}>{f}</span>);
                      if (i < firms.length - 1) parts.push(i === firms.length - 2 ? " and " : ", ");
                    });
                  }
                  if (loc) parts.push(<> in <span style={hi} key="l">{loc}</span></>);
                  parts.push(".");
                  return parts;
                };

                // Rotating CTA + value preview. Each visit, the prompt targets
                // the user's biggest profile gap so the action feels specific.
                // Order: structured fields first (role, firms, location), then
                // narrative blurbs (hard no's, side stuff, direction), then a
                // generic refresher CTA for fully-filled profiles. The blurb
                // tiers are what build the personalization moat — surfacing
                // them in rotation pulls users back to fill them out over time.
                const directionNarrative = (p?.directionNarrative || "").trim();
                const personalContext = (p?.personalContext || "").trim();
                const hardNos = (p?.hardNos || "").trim();

                const ctaConfig = !hasAnything
                  ? {
                      text: "Set up your profile →",
                      preview: "Personalizes job matches, emails, and Scout's advice across the app",
                    }
                  : !role
                  ? {
                      text: "Tell us what you're hunting for →",
                      preview: "We use this to rank every job we show you",
                    }
                  : firms.length === 0
                  ? {
                      text: "Add the companies on your list →",
                      preview: "Boosts target-firm matches on the job board and the Find page",
                    }
                  : !loc
                  ? {
                      text: "Where are you trying to land? →",
                      preview: "Filters jobs and contacts to the right metro",
                    }
                  : !hardNos
                  ? { variant: "button" as const }
                  : !personalContext
                  ? {
                      text: "Tell us something the resume doesn't say →",
                      preview: "Helps Scout draft sharper emails and find better coffee-chat hooks",
                    }
                  : !directionNarrative
                  ? {
                      text: "What's the direction you're heading? →",
                      preview: "A few sentences here tunes every recommendation we make",
                    }
                  : {
                      text: "Sharpen your matches →",
                      preview: "A 30-second update re-ranks your jobs and refines Scout's tone",
                    };

                return (
                  <section
                    className="animate-fadeInUp rounded-st-xl border border-line bg-white"
                    style={{ padding: "20px 24px", minHeight: 132 }}
                  >
                    <p
                      style={{
                        fontFamily: "'Libre Baskerville', Georgia, serif",
                        fontSize: 17,
                        lineHeight: 1.75,
                        color: "var(--heading, #1E2D4D)",
                        margin: 0,
                      }}
                    >
                      {hasAnything
                        ? buildSentence()
                        : "Tell us a bit about yourself — it's how we know what to recommend."}
                    </p>
                    <div style={{ marginTop: 14 }}>
                      {ctaConfig.variant === "button" ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => navigate("/profile")}
                            className="inline-flex items-center rounded-md px-3 py-1.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
                            style={{
                              background: "#1e3a8a",
                              border: "none",
                              cursor: "pointer",
                              fontFamily: "'Inter', sans-serif",
                            }}
                          >
                            Update profile
                          </button>
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                aria-label="Why complete your profile"
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[#94A3B8] transition-colors hover:text-[#475569] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  cursor: "pointer",
                                }}
                              >
                                <Info className="h-4 w-4" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              side="bottom"
                              align="start"
                              className="w-72 text-[12.5px] leading-relaxed"
                            >
                              The more you include in your profile, the more personalized the messages we can draft, and the more tailored our job and people recommendations get.
                            </PopoverContent>
                          </Popover>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => navigate("/profile")}
                            style={{
                              fontFamily: "var(--font-body)",
                              fontSize: 13.5,
                              fontWeight: 600,
                              color: "var(--accent, #4A60A8)",
                              background: "transparent",
                              border: "none",
                              padding: 0,
                              cursor: "pointer",
                              display: "block",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
                          >
                            {ctaConfig.text}
                          </button>
                          <p
                            style={{
                              marginTop: 4,
                              marginBottom: 0,
                              fontFamily: "var(--font-body)",
                              fontSize: 11.5,
                              lineHeight: 1.5,
                              color: "var(--ink-3, #94A3B8)",
                            }}
                          >
                            {ctaConfig.preview}
                          </p>
                        </>
                      )}
                    </div>
                  </section>
                );
              })()}

              {/* ── 2. Needs you now ──────────────────────────────── */}
              <section className="animate-fadeInUp">
                <ZoneHeader title="Needs you now" count={needs.length} />
                {dataLoading ? (
                  <Skeleton className="h-[58px] w-full rounded-st-xl" />
                ) : needs.length === 0 ? (
                  <div className={`${CARD} flex min-h-[58px] items-center gap-2.5 px-4 py-3`}>
                    <CircleCheck className="h-[18px] w-[18px] text-[var(--accent)]" />
                    <p className="text-[13.5px] text-[#475569]">
                      You're all caught up - nothing needs you right now.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {needs.map((n) => (
                      <div
                        key={n.key}
                        className={`${CARD} flex items-center gap-3 px-4 py-3`}
                        style={{ boxShadow: `inset 3px 0 0 ${n.tone}` }}
                      >
                        <span
                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[7px]"
                          style={{ background: "var(--primary-50)", color: n.tone }}
                        >
                          {n.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-semibold text-[#0F172A]">{n.text}</p>
                          <p className="truncate text-[12px] text-[#94A3B8]">{n.sub}</p>
                        </div>
                        <Button
                          variant="outline"
                          onClick={n.onClick}
                          className={`${PILL} ${PILL_OUTLINE} flex-shrink-0`}
                        >
                          {n.cta}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* ── 3. Recommended for you - one mixed carousel ───── */}
              <section className="animate-fadeInUp">
                <ZoneHeader title="Recommended for you" />
                <Rail>
                  {mixed.map((m) => (
                    <DiscoveryCard
                      key={m.id}
                      catKey={m.catKey}
                      title={m.title}
                      subtitle={m.subtitle}
                      monogram={m.monogram}
                      logoCompany={m.logoCompany}
                      onClick={m.onClick}
                    />
                  ))}
                </Rail>
              </section>

              {/* ── 4. Your loops ─────────────────────────────────── */}
              <section className="animate-fadeInUp">
                <ZoneHeader
                  title="Your loops"
                  action={
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setLoopModalOpen(true)}
                        className="flex items-center gap-1 text-[12.5px] font-medium text-[#64748B] hover:text-[var(--accent)]"
                      >
                        <HelpCircle className="h-3.5 w-3.5" /> What's a loop?
                      </button>
                      {!isLoopSetup && (
                        <button
                          onClick={() => navigate("/agent")}
                          className="flex items-center gap-0.5 text-[12.5px] font-medium text-[var(--accent)] hover:underline"
                        >
                          Open Loops <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  }
                />

                {isLoopLoading ? (
                  <Skeleton className="h-[140px] w-full rounded-st-2xl" />
                ) : isLoopSetup ? (
                  <div
                    className="rounded-st-2xl border border-[#BBF7D0] p-5 sm:p-6"
                    style={{ background: "linear-gradient(135deg,#F0FDF4 0%,#FFFFFF 65%)" }}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex gap-4">
                        <span className="hidden h-11 w-11 flex-shrink-0 items-center justify-center rounded-[9px] bg-[#16A34A] text-white sm:flex">
                          <Repeat className="h-[22px] w-[22px]" />
                        </span>
                        <div>
                          <h3 className="font-sans text-[16px] font-semibold text-[#0F172A]">
                            Put your networking on a loop
                          </h3>
                          <p className="mt-1 max-w-[560px] text-[13px] leading-relaxed text-[#475569]">
                            Set targets once. Scout runs a loop that finds new contacts, drafts
                            personalized emails, and follows up - then reports back here for review.
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={() => navigate("/agent/setup")}
                        className={`${PILL} flex-shrink-0 gap-1.5 self-start bg-[#16A34A] text-white hover:bg-[#15803D] sm:self-center`}
                      >
                        Set up a loop <ArrowRight className={PILL_ICON} />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className={`${CARD} p-5`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex h-2 w-2 rounded-full"
                          style={{
                            background: "#F59E0B",
                          }}
                        />
                        <span className="text-[14px] font-semibold text-[#0F172A]">
                          {isRunning ? "Loop running…" : loopStatus === "active" ? "Loops active" : "Loops paused"}
                        </span>
                        {!isRunning && loopStatus === "active" && nextLoopIn && (
                          <span className="flex items-center gap-1 text-[12px] text-[#94A3B8]">
                            <Clock className="h-3.5 w-3.5" /> next loop in {nextLoopIn}
                          </span>
                        )}
                      </div>
                      <Button
                        onClick={() => runNow()}
                        disabled={isRunNowPending || isRunning}
                        className={`${PILL} gap-1.5 bg-[#F59E0B] text-white hover:bg-[#D97706]`}
                      >
                        {isRunNowPending || isRunning ? (
                          <Loader2 className={`${PILL_ICON} animate-spin`} />
                        ) : (
                          <Play className={PILL_ICON} />
                        )}
                        {isRunning ? "Running" : "Start a loop"}
                      </Button>
                    </div>

                    {isRunning && cycleProgress && (
                      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 rounded-st-lg bg-[#FEF6E7] px-3.5 py-2.5 text-[12.5px] text-[#92400E]">
                        <span>{cycleProgress.contactsFound} contacts found</span>
                        <span>{cycleProgress.emailsDrafted} emails drafted</span>
                        <span>{cycleProgress.jobsFound} jobs found</span>
                        <span>{cycleProgress.hmsFound} hiring managers</span>
                      </div>
                    )}

                    {!isRunning && (
                      <div className="mt-4 border-t border-[#EEF2F8] pt-3.5">
                        {lastCycle ? (
                          <p className="text-[13px] text-[#475569]">
                            <span className="font-medium text-[#0F172A]">Last loop</span>{" "}
                            {timeAgo(lastCycle.completedAt || cfg?.lastCycleAt)} - found{" "}
                            <span className="font-semibold text-[#0F172A]">{lastCycle.results?.contactsFound ?? 0}</span>{" "}
                            contacts and drafted{" "}
                            <span className="font-semibold text-[#0F172A]">{lastCycle.results?.emailsDrafted ?? 0}</span>{" "}
                            emails for your review.
                          </p>
                        ) : (
                          <p className="text-[13px] text-[#94A3B8]">
                            No loops have run yet - start one to see results here.
                          </p>
                        )}
                        {cfg && (cfg.totalContactsFound > 0 || cfg.totalEmailsDrafted > 0) && (
                          <p className="mt-1 text-[12px] text-[#94A3B8]">
                            All-time: {cfg.totalContactsFound} contacts · {cfg.totalEmailsDrafted} emails ·{" "}
                            {cfg.totalRepliesReceived} replies
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* ── 5. Follow-ups (demoted) ───────────────────────── */}
              {/* Always mounted so it reserves space. When there are no
                  follow-ups it shows an empty state instead of unmounting,
                  which would collapse the Tools row upward. */}
              <section className="animate-fadeInUp">
                  <ZoneHeader
                    title="Follow-ups"
                    action={
                      <button
                        onClick={() => navigate("/tracker")}
                        className="flex items-center gap-0.5 text-[12.5px] font-medium text-[var(--accent)] hover:underline"
                      >
                        Open tracker <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    }
                  />
                  {dataLoading ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Skeleton className="h-[150px] rounded-st-xl" />
                      <Skeleton className="h-[150px] rounded-st-xl" />
                    </div>
                  ) : recCards.length === 0 ? (
                    <div className={`${CARD} flex min-h-[72px] items-center gap-2.5 px-4 py-3`}>
                      <CircleCheck className="h-[18px] w-[18px] text-[var(--accent)]" />
                      <p className="text-[13.5px] text-[#475569]">
                        No follow-ups right now. Scout will surface them as conversations go quiet.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {recCards.map((c) => (
                        <div key={c.key} className={`${CARD} ${CARD_HOVER} flex flex-col p-4`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-[14px] font-semibold text-[#0F172A]">{c.name}</p>
                              {c.meta && <p className="text-[12px] text-[#94A3B8]">{c.meta}</p>}
                            </div>
                            <button
                              onClick={c.onDismiss}
                              aria-label="Dismiss"
                              className="flex-shrink-0 rounded-md p-1 text-[#CBD5E1] hover:bg-[#F1F5F9] hover:text-[#64748B]"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <p className="mt-1.5 flex-1 text-[12.5px] leading-relaxed text-[#64748B]">
                            {c.reason}
                          </p>
                          <Button
                            variant="outline"
                            onClick={c.onClick}
                            className={`${PILL} ${PILL_OUTLINE} mt-3 w-fit gap-1.5`}
                          >
                            {c.cta} <ArrowRight className={PILL_ICON} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
              </section>

              {/* ── 5b. Referral nudge (compact, secondary) ───────── */}
              <ReferralTile />

              {/* ── 6. Tools (demoted chip row) ───────────────────── */}
              <section className="animate-fadeInUp">
                <ZoneHeader title="Tools" />
                <div className="flex flex-wrap gap-2">
                  {tools.map((t) => (
                    <button
                      key={t.label}
                      onClick={() => navigate(t.to)}
                      className={`inline-flex items-center gap-1.5 ${PILL} ${PILL_OUTLINE} font-medium transition-colors`}
                      style={{
                        background: "rgba(255,255,255,0.75)",
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)",
                      }}
                    >
                      <span className="text-ink-3">{t.icon}</span>
                      {t.label}
                    </button>
                  ))}
                </div>
              </section>

              {/* "What's a loop?" explainer modal */}
              <Dialog open={loopModalOpen} onOpenChange={setLoopModalOpen}>
                <DialogContent className="max-w-[480px]">
                  <DialogHeader>
                    <DialogTitle className="font-serif text-[22px] text-[#0F172A]">
                      What's a loop?
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 text-[13.5px] leading-relaxed text-[#475569]">
                    <p>
                      A loop is your end-to-end outreach workflow, automated by Scout.
                      In one loop, Scout will:
                    </p>
                    <ol className="space-y-2">
                      {[
                        "Find the right people at your target companies",
                        "Draft personalized cold emails for each one",
                        "Send them on a schedule you control",
                        "Track replies and surface the ones that need your attention",
                        "Suggest follow-ups when conversations go quiet",
                      ].map((t, i) => (
                        <li key={i} className="flex gap-2.5">
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[var(--primary-50)] text-[11px] font-bold text-[var(--accent)]">
                            {i + 1}
                          </span>
                          <span>{t}</span>
                        </li>
                      ))}
                    </ol>
                    <p>
                      You stay in control: approve every email before it sends, pause
                      anytime, and review every reply. Think of a loop as a single
                      campaign - like "10 software engineers at Apple" or "alumni at
                      Goldman Sachs."
                    </p>
                  </div>
                  <Button
                    onClick={() => { setLoopModalOpen(false); navigate("/agent/setup"); }}
                    className={`${PILL} mt-1 w-full gap-1.5 bg-[var(--accent)] text-white hover:bg-[var(--primary-600)]`}
                  >
                    Start your first loop <ArrowRight className={PILL_ICON} />
                  </Button>
                </DialogContent>
              </Dialog>

              <div className="h-2" />
            </div>
          </div>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}
