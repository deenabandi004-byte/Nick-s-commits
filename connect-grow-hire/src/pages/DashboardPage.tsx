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
  Briefcase, FileText, MessageSquare, Repeat, Play, X, Clock,
  ChevronRight, ChevronLeft, UserPlus, CircleCheck, Loader2, HelpCircle,
} from "lucide-react";

import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useScout } from "@/contexts/ScoutContext";
import { useNotifications } from "@/hooks/useNotifications";
import {
  useAgentConfig, useAgentSidebarStatus, useAgentCycles, useCycleRunner, useCountdown,
} from "@/hooks/useAgent";
import { apiService, type Nudge } from "@/services/api";
import { firebaseApi } from "@/services/firebaseApi";

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
   Category color system - the page's entire color budget
   ============================================================ */

const CATS = {
  people: {
    color: "#2563EB", grad: "linear-gradient(135deg,#3B82F6 0%,#60A5FA 100%)",
    label: "People", Icon: Users, action: "Find people",
  },
  companies: {
    color: "#7C3AED", grad: "linear-gradient(135deg,#8B5CF6 0%,#A78BFA 100%)",
    label: "Companies", Icon: Building2, action: "Find firms",
  },
  hm: {
    color: "#0E9F6E", grad: "linear-gradient(135deg,#10B981 0%,#34D399 100%)",
    label: "Hiring", Icon: UserPlus, action: "Find hiring managers",
  },
  loop: {
    color: "#D97706", grad: "linear-gradient(135deg,#F59E0B 0%,#FBBF24 100%)",
    label: "Loop", Icon: Repeat, action: "Set up loop",
  },
} as const;
type CatKey = keyof typeof CATS;

/* ============================================================
   Shared styles
   ============================================================ */

const CARD = "rounded-[10px] border border-[#E6EAF1] bg-white";
const CARD_HOVER = "transition-all hover:border-[#BFDBFE] hover:shadow-[0_4px_14px_rgba(59,130,246,0.08)]";

/* ============================================================
   Small presentational components
   ============================================================ */

function ZoneHeader({
  title, count, action,
}: { title: string; count?: number; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h2 className="font-sans text-[13.5px] font-semibold tracking-[-0.01em] text-[#334155]">
          {title}
        </h2>
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-[#EFF4FF] px-2 py-0.5 text-[11px] font-semibold text-[#3B82F6]">
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
  catKey, title, subtitle, monogram, onClick,
}: {
  catKey: CatKey; title: string; subtitle: string; monogram?: string; onClick: () => void;
}) {
  const c = CATS[catKey];
  const Icon = c.Icon;
  return (
    <button
      onClick={onClick}
      className="snap-start shrink-0 w-[230px] overflow-hidden rounded-[14px] border border-[#E8ECF2] bg-white text-left shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-all duration-150 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(15,23,42,0.16)]"
    >
      <div className="relative h-[86px] overflow-hidden px-3.5 py-3" style={{ background: c.grad }}>
        <Icon className="absolute -bottom-4 -right-3 h-[72px] w-[72px] text-white/[0.16]" strokeWidth={1.5} />
        <div className="relative flex h-full items-start justify-between">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-white text-[16px] font-bold shadow-sm"
            style={{ color: c.color }}
          >
            {monogram ? monogram : <Icon className="h-5 w-5" />}
          </span>
          <span className="rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {c.label}
          </span>
        </div>
      </div>
      <div className="p-3.5">
        <p className="truncate text-[14px] font-semibold text-[#0F172A]">{title}</p>
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
  const { openPanelWithMessage } = useScout();
  const { notifications } = useNotifications();

  const [scoutInput, setScoutInput] = useState("");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loopModalOpen, setLoopModalOpen] = useState(false);

  /* ---- loops (the agent, reframed) ---- */
  const agentConfig = useAgentConfig();
  const { status: loopStatus, pendingCount: loopPending } = useAgentSidebarStatus();
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
  // New user - no outreach pipeline yet. Drives the adaptive hero tile.
  const isNewUser = !statsQuery.isLoading && (outbox?.total ?? 0) === 0;

  /* ---- recent-activity metrics (shown inside the blue band) ---- */
  const sent = outbox?.thisWeekSent ?? 0;
  const replied = outbox?.thisWeekReplied ?? 0;
  const replyRate = outbox?.replyRate != null
    ? Math.round(outbox.replyRate * (outbox.replyRate <= 1 ? 100 : 1))
    : 0;
  const bandMetrics = [
    { label: "Intros sent", value: String(sent) },
    { label: "Replies", value: String(replied) },
    { label: "Reply rate", value: `${replyRate}%` },
    { label: "Credits left", value: String(user?.credits ?? 0) },
  ];

  /* ---- welcome line - replies waiting + loop actions to review ---- */
  const statusLine = useMemo(() => {
    const n = unreadReplies.length;
    const m = loopPending;
    const replyW = n === 1 ? "reply" : "replies";
    const actionW = m === 1 ? "action" : "actions";
    if (n > 0 && m > 0) return `You have ${n} ${replyW} waiting and ${m} loop ${actionW} to review.`;
    if (n > 0) return `You have ${n} ${replyW} waiting.`;
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
      tone: "#3B82F6",
      text: `${r.contactName} replied to you`,
      sub: r.company || r.snippet?.slice(0, 60) || "Reply waiting in your tracker",
      cta: "Reply",
      onClick: () => navigate("/tracker", { state: { selectContactId: r.contactId } }),
    });
  }
  for (const e of soonMeetings) {
    needs.push({
      key: `mtg-${e.id}`,
      icon: <Calendar className="h-4 w-4" />,
      tone: "#8B5CF6",
      text: `${e.type || "Meeting"} with ${e.contactName || "a contact"}`,
      sub: `${dayLabel(e.date)}${e.time ? ` at ${e.time}` : ""}${e.firm ? ` · ${e.firm}` : ""}`,
      cta: "Prep",
      onClick: () => navigate("/meeting-prep"),
    });
  }
  if (loopPending > 0) {
    needs.push({
      key: "loop-approvals",
      icon: <Repeat className="h-4 w-4" />,
      tone: "#F59E0B",
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
    monogram?: string; onClick: () => void;
  };
  const mixed: MixedCard[] = (() => {
    const peopleM: MixedCard[] = discovery.people.map((c) => ({
      id: `mx-${c.id}`, catKey: "people", monogram: c.company.charAt(0).toUpperCase(),
      title: c.company, subtitle: `${c.role}${c.location ? ` · ${c.location}` : ""}`,
      onClick: () => runPeople(c),
    }));
    const companyM: MixedCard[] = discovery.companies.map((c) => ({
      id: `mx-${c.id}`, catKey: "companies", monogram: c.industry.charAt(0).toUpperCase(),
      title: c.industry, subtitle: c.location ? `Roles in ${c.location}` : "Roles across all markets",
      onClick: () => runCompany(c),
    }));
    const hmM: MixedCard[] = discovery.hms.map((c) => ({
      id: `mx-${c.id}`, catKey: "hm", monogram: c.company.charAt(0).toUpperCase(),
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

  /* ---- tools (demoted chip row) ---- */
  const tools = [
    { icon: <Mail className="h-3.5 w-3.5" />, label: "Tracker", to: "/tracker" },
    { icon: <Coffee className="h-3.5 w-3.5" />, label: "Meeting Prep", to: "/meeting-prep" },
    { icon: <MessageSquare className="h-3.5 w-3.5" />, label: "Interview Prep", to: "/interview-prep" },
    { icon: <Briefcase className="h-3.5 w-3.5" />, label: "Job Board", to: "/job-board" },
    { icon: <FileText className="h-3.5 w-3.5" />, label: "Resume", to: "/write/resume" },
    { icon: <Calendar className="h-3.5 w-3.5" />, label: "Calendar", to: "/calendar" },
  ];

  /* ---- auth gate ---- */
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#3B82F6]" />
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

          <div className="flex-1 overflow-y-auto" style={{ background: "#FBFCFE" }}>
            <div className="mx-auto w-full max-w-[1120px] space-y-8 px-5 py-6 sm:px-8 sm:py-8">

              {/* ── 1. Blue hero band - greeting + metrics + Scout ── */}
              <section
                className="animate-fadeInUp relative overflow-hidden rounded-[16px]"
                style={{ background: "linear-gradient(135deg,#1D4ED8 0%,#3B82F6 56%,#60A5FA 100%)" }}
              >
                {/* soft light decoration */}
                <div
                  className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full"
                  style={{ background: "radial-gradient(circle,rgba(255,255,255,0.20),transparent 70%)" }}
                />
                <div className="relative px-6 py-5 sm:px-8">
                  <h1 className="font-serif text-[30px] leading-tight text-white sm:text-[34px]">
                    Hi {firstNameOf(user?.name)}
                  </h1>
                  <p className="mt-0.5 text-[14px] text-white/80">{statusLine}</p>

                  {/* new users get a get-started nudge above the metrics */}
                  {isNewUser && (
                    <div className="mt-3.5 flex flex-col gap-3 rounded-[10px] border border-white/20 bg-white/10 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[13.5px] font-semibold text-white">Get started</p>
                        <p className="mt-0.5 text-[13px] text-white/75">
                          Run your first loop to start tracking your outreach here.
                        </p>
                      </div>
                      <Button
                        onClick={() => navigate("/agent/setup")}
                        className="h-9 shrink-0 gap-1.5 bg-white px-4 text-[13px] font-semibold text-[#2563EB] hover:bg-white/90"
                      >
                        Start a loop <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}

                  {/* recent-activity metrics - always visible */}
                  <div className="mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {bandMetrics.map((m) => (
                      <div
                        key={m.label}
                        className="rounded-[10px] border border-white/15 bg-white/10 px-3.5 py-2"
                      >
                        <p className="font-serif text-[22px] leading-none text-white">{m.value}</p>
                        <p className="mt-1 text-[11.5px] font-medium text-white/70">{m.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Scout command bar */}
                  <div className="mt-3.5 flex items-center gap-2 rounded-[10px] bg-white px-3.5 py-2.5 shadow-sm">
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
                      size="sm"
                      onClick={() => askScout(scoutInput)}
                      disabled={!scoutInput.trim()}
                      className="h-8 gap-1 bg-[#3B82F6] px-3 text-[13px] hover:bg-[#2563EB]"
                    >
                      Ask Scout <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </section>

              {/* ── 2. Needs you now ──────────────────────────────── */}
              <section className="animate-fadeInUp">
                <ZoneHeader title="Needs you now" count={needs.length} />
                {dataLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-[58px] w-full rounded-[10px]" />
                    <Skeleton className="h-[58px] w-full rounded-[10px]" />
                  </div>
                ) : needs.length === 0 ? (
                  <div className={`${CARD} flex items-center gap-2.5 px-4 py-3`}>
                    <CircleCheck className="h-[18px] w-[18px] text-[#10B981]" />
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
                          style={{ background: `${n.tone}18`, color: n.tone }}
                        >
                          {n.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-semibold text-[#0F172A]">{n.text}</p>
                          <p className="truncate text-[12px] text-[#94A3B8]">{n.sub}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={n.onClick}
                          className="h-8 flex-shrink-0 border-[#E2E8F0] px-3 text-[12.5px] hover:border-[#BFDBFE] hover:text-[#3B82F6]"
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
                        className="flex items-center gap-1 text-[12.5px] font-medium text-[#64748B] hover:text-[#3B82F6]"
                      >
                        <HelpCircle className="h-3.5 w-3.5" /> What's a loop?
                      </button>
                      {!isLoopSetup && (
                        <button
                          onClick={() => navigate("/agent")}
                          className="flex items-center gap-0.5 text-[12.5px] font-medium text-[#3B82F6] hover:underline"
                        >
                          Open Loops <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  }
                />

                {isLoopSetup ? (
                  <div
                    className="rounded-[12px] border border-[#FCE4BE] p-5 sm:p-6"
                    style={{ background: "linear-gradient(135deg,#FEF6E7 0%,#FFFFFF 65%)" }}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex gap-4">
                        <span className="hidden h-11 w-11 flex-shrink-0 items-center justify-center rounded-[9px] bg-[#F59E0B] text-white sm:flex">
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
                        className="h-10 flex-shrink-0 gap-1.5 self-start bg-[#F59E0B] px-5 text-[14px] text-white hover:bg-[#D97706] sm:self-center"
                      >
                        Set up a loop <ArrowRight className="h-4 w-4" />
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
                            background: isRunning ? "#3B82F6" : loopStatus === "active" ? "#10B981" : "#F59E0B",
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
                        size="sm"
                        onClick={() => runNow()}
                        disabled={isRunNowPending || isRunning}
                        className="h-8 gap-1.5 bg-[#F59E0B] px-3 text-[12.5px] text-white hover:bg-[#D97706]"
                      >
                        {isRunNowPending || isRunning ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        {isRunning ? "Running" : "Start a loop"}
                      </Button>
                    </div>

                    {isRunning && cycleProgress && (
                      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 rounded-[8px] bg-[#FEF6E7] px-3.5 py-2.5 text-[12.5px] text-[#92400E]">
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
              {(recCards.length > 0 || dataLoading) && (
                <section className="animate-fadeInUp">
                  <ZoneHeader
                    title="Follow-ups"
                    action={
                      <button
                        onClick={() => navigate("/tracker")}
                        className="flex items-center gap-0.5 text-[12.5px] font-medium text-[#3B82F6] hover:underline"
                      >
                        Open tracker <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    }
                  />
                  {dataLoading ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Skeleton className="h-[110px] rounded-[10px]" />
                      <Skeleton className="h-[110px] rounded-[10px]" />
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
                            size="sm"
                            variant="outline"
                            onClick={c.onClick}
                            className="mt-3 h-8 w-fit gap-1 border-[#E2E8F0] px-3 text-[12.5px] hover:border-[#BFDBFE] hover:text-[#3B82F6]"
                          >
                            {c.cta} <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* ── 6. Tools (demoted chip row) ───────────────────── */}
              <section className="animate-fadeInUp">
                <ZoneHeader title="Tools" />
                <div className="flex flex-wrap gap-2">
                  {tools.map((t) => (
                    <button
                      key={t.label}
                      onClick={() => navigate(t.to)}
                      className="flex items-center gap-2 rounded-full border border-[#E6EAF1] bg-white px-3.5 py-2 text-[12.5px] font-medium text-[#475569] transition-colors hover:border-[#BFDBFE] hover:text-[#3B82F6]"
                    >
                      <span className="text-[#94A3B8]">{t.icon}</span>
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
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#EFF4FF] text-[11px] font-bold text-[#3B82F6]">
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
                    className="mt-1 w-full gap-1.5 bg-[#3B82F6] hover:bg-[#2563EB]"
                  >
                    Start your first loop <ArrowRight className="h-4 w-4" />
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
