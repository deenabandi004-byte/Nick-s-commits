// LoopActivityFeed — what this Loop found, in order, with one-tap deep links.
//
// Each row answers three questions at a glance:
//   - What did it find? (icon + colored chip)
//   - Who/what is it? (title + subtitle)
//   - Where do I do something with it? (View → link)
//
// Pulls live as the cycle runs (useLoopActivity polls every 10s).

import { Link } from "react-router-dom";
import {
  User,
  Mail,
  UserCheck,
  Briefcase,
  Building2,
  ArrowRight,
  Loader2,
} from "lucide-react";
import type { LoopActivityItem, LoopActivityType } from "@/services/loops";
import { useLoopActivity } from "@/hooks/useLoops";

// Phase 8.5 — credit costs mirrored from backend/app/services/loop_budget.py
// (CREDIT_COSTS dict). If you change these, change them server-side too.
const CREDIT_COST_BY_TYPE: Record<LoopActivityType, number> = {
  contact: 9,
  draft: 0, // draft is part of the contact-find action; don't double-count
  hm: 13,
  job: 1,
  company: 1,
};

const TYPE_META: Record<
  LoopActivityType,
  { Icon: typeof User; label: string; chipBg: string; chipText: string }
> = {
  contact: {
    Icon: User,
    label: "Person",
    chipBg: "#eef2ff",
    chipText: "#4338ca",
  },
  draft: {
    Icon: Mail,
    label: "Email draft",
    chipBg: "#fef3c7",
    chipText: "#92400e",
  },
  hm: {
    Icon: UserCheck,
    label: "Hiring manager",
    chipBg: "#ecfdf5",
    chipText: "#15803d",
  },
  job: {
    Icon: Briefcase,
    label: "Job",
    chipBg: "#f0f9ff",
    chipText: "#0369a1",
  },
  company: {
    Icon: Building2,
    label: "Company",
    chipBg: "#f5f3ff",
    chipText: "#6d28d9",
  },
};

function relativeTime(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function LoopActivityFeed({ loopId }: { loopId: string }) {
  const query = useLoopActivity(loopId);
  const items = query.data?.items ?? [];

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className="rounded-xl border p-6 text-center"
        style={{
          borderColor: "var(--line)",
          background: "var(--paper-2)",
        }}
      >
        <p
          className="text-[13.5px] leading-snug"
          style={{ color: "var(--ink-3)" }}
        >
          Nothing yet. As your Loop finds people, jobs, and companies,
          they'll show up here.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border bg-white overflow-hidden"
      style={{ borderColor: "var(--line)" }}
    >
      {items.map((item, i) => (
        <ActivityRow
          key={item.id}
          item={item}
          last={i === items.length - 1}
        />
      ))}
    </div>
  );
}

function ActivityRow({ item, last }: { item: LoopActivityItem; last: boolean }) {
  const meta = TYPE_META[item.type];
  const Icon = meta.Icon;

  // External links (Gmail drafts, job apply pages) open in a new tab.
  // Internal links use react-router so the SPA navigation kicks in.
  const rowClass =
    "group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--paper-2)]";
  const rowStyle = {
    borderBottom: last ? "none" : "1px solid var(--line-2)",
  } as const;

  const content = (
    <>
      <span
        className="inline-flex items-center justify-center rounded-md shrink-0"
        style={{
          width: 32,
          height: 32,
          background: meta.chipBg,
          color: meta.chipText,
        }}
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[10px] uppercase tracking-[0.06em] font-medium px-1.5 py-0.5 rounded"
            style={{ background: meta.chipBg, color: meta.chipText }}
          >
            {meta.label}
          </span>
          <span
            className="text-[10.5px]"
            style={{ color: "var(--ink-3)" }}
          >
            {relativeTime(item.createdAt)}
          </span>
          {/* Phase 8 — credit cost chip. Hidden for draft rows because the
              cost is already attributed to the contact row above it. */}
          {CREDIT_COST_BY_TYPE[item.type] > 0 && (
            <span
              className="font-mono text-[10px] tabular-nums"
              style={{ color: "var(--ink-3)" }}
              title={`Cost: ${CREDIT_COST_BY_TYPE[item.type]} credits`}
            >
              · {CREDIT_COST_BY_TYPE[item.type]} cr
            </span>
          )}
        </div>
        <div
          className="text-[13.5px] font-medium tracking-[-0.01em] truncate mt-1"
          style={{ color: "var(--ink)" }}
        >
          {item.title}
        </div>
        {item.subtitle && (
          <div
            className="text-[12px] truncate mt-0.5"
            style={{ color: "var(--ink-3)" }}
          >
            {item.subtitle}
          </div>
        )}
      </div>

      <span
        className="inline-flex items-center gap-1 text-[12px] shrink-0 mt-1 transition-transform group-hover:translate-x-0.5"
        style={{ color: "var(--ink-2)" }}
      >
        {item.external ? "Open" : "View"}
        <ArrowRight className="h-3 w-3" />
      </span>
    </>
  );

  if (item.external) {
    return (
      <a
        href={item.linkTo}
        target="_blank"
        rel="noopener noreferrer"
        className={rowClass}
        style={rowStyle}
      >
        {content}
      </a>
    );
  }
  return (
    <Link to={item.linkTo} className={rowClass} style={rowStyle}>
      {content}
    </Link>
  );
}
