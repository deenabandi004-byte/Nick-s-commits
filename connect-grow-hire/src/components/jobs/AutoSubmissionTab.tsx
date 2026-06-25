// AutoSubmissionTab
//
// Lists every auto-apply job the user has fired off — in-flight at top,
// submitted below, failed at the bottom. Polls /list every 5s while there
// are still in-flight cards.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listAutoApplyJobs,
  type AutoApplyStatus,
  type AutoApplyStatusResponse,
} from "@/services/api";

const IN_FLIGHT_STATUSES: AutoApplyStatus[] = ["queued", "running"];
const TERMINAL_SUCCESS: AutoApplyStatus[] = ["submitted", "dry_run_complete"];
const TERMINAL_FAILURE: AutoApplyStatus[] = ["failed", "submit_failed"];

interface AutoSubmissionTabProps {
  pollIntervalIdle?: number;
  pollIntervalActive?: number;
}

export function AutoSubmissionTab({
  pollIntervalIdle = 15000,
  pollIntervalActive = 5000,
}: AutoSubmissionTabProps) {
  const [items, setItems] = useState<AutoApplyStatusResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await listAutoApplyJobs(
        [
          "queued",
          "running",
          "submitted",
          "dry_run_complete",
          "submit_failed",
          "failed",
        ],
        100,
      );
      setItems(r.items || []);
    } catch (err) {
      console.warn("listAutoApplyJobs failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const hasInFlight = useMemo(
    () => items.some((i) => IN_FLIGHT_STATUSES.includes(i.status)),
    [items],
  );

  useEffect(() => {
    load();
    const interval = hasInFlight ? pollIntervalActive : pollIntervalIdle;
    const id = window.setInterval(load, interval);
    return () => window.clearInterval(id);
  }, [load, hasInFlight, pollIntervalActive, pollIntervalIdle]);

  if (loading) {
    return (
      <div style={{ padding: 32, color: "#64748B", fontSize: 13 }}>
        Loading queue…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        style={{
          padding: "48px 32px",
          textAlign: "center",
          color: "#64748B",
          fontSize: 13,
        }}
      >
        <div style={{ fontSize: 14, color: "#0F172A", marginBottom: 6 }}>
          No auto-applications yet
        </div>
        Click Auto-apply on a job in Discover to submit one in the background.
      </div>
    );
  }

  const inFlight = items.filter((i) => IN_FLIGHT_STATUSES.includes(i.status));
  const submitted = items.filter((i) => TERMINAL_SUCCESS.includes(i.status));
  const failed = items.filter((i) => TERMINAL_FAILURE.includes(i.status));

  return (
    <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 22 }}>
      {inFlight.length > 0 && (
        <Section title="In flight" count={inFlight.length}>
          {inFlight.map((i) => (
            <Card key={i.auto_apply_id} item={i} />
          ))}
        </Section>
      )}

      {submitted.length > 0 && (
        <Section title="Submitted" count={submitted.length}>
          {submitted.map((i) => (
            <Card key={i.auto_apply_id} item={i} />
          ))}
        </Section>
      )}

      {failed.length > 0 && (
        <Section title="Failed" count={failed.length}>
          {failed.map((i) => (
            <Card key={i.auto_apply_id} item={i} />
          ))}
        </Section>
      )}
    </div>
  );
}

interface SectionProps {
  title: string;
  count: number;
  children: React.ReactNode;
}

function Section({ title, count, children }: SectionProps) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#94A3B8",
          letterSpacing: 0.6,
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        {title} · {count}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

function Card({ item }: { item: AutoApplyStatusResponse }) {
  const badge = statusBadge(item.status);
  return (
    <div
      style={{
        border: "1px solid #E5E5E5",
        borderRadius: 10,
        padding: 16,
        display: "flex",
        alignItems: "center",
        gap: 16,
        background: "#fff",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#0F172A",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.job_title || item.job_id}
        </div>
        <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
          {item.company || ""}
          {item.ats_platform ? ` · ${item.ats_platform}` : ""}
        </div>
        {item.status === "running" && item.stage && (
          <div style={{ fontSize: 12, color: "#475569", marginTop: 6 }}>
            {humanStage(item.stage)}
          </div>
        )}
        {item.failure_reason && (
          <div style={{ fontSize: 12, color: "#EF4444", marginTop: 6 }}>
            {item.failure_reason}
          </div>
        )}
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          padding: "4px 10px",
          borderRadius: 999,
          background: badge.bg,
          color: badge.fg,
          whiteSpace: "nowrap",
        }}
      >
        {badge.label}
      </span>
    </div>
  );
}

function statusBadge(status: AutoApplyStatus): { label: string; bg: string; fg: string } {
  switch (status) {
    case "queued":
      return { label: "Queued", bg: "#F1F5F9", fg: "#475569" };
    case "running":
      return { label: "Running", bg: "#DBEAFE", fg: "#1D4ED8" };
    case "submitted":
      return { label: "Submitted", bg: "#DCFCE7", fg: "#15803D" };
    case "dry_run_complete":
      return { label: "Preview done", bg: "#FEF3C7", fg: "#92400E" };
    case "needs_attention":
      return { label: "Needs attention", bg: "#FEF3C7", fg: "#92400E" };
    case "submit_failed":
      return { label: "Submit failed", bg: "#FEE2E2", fg: "#B91C1C" };
    case "failed":
    default:
      return { label: "Failed", bg: "#FEE2E2", fg: "#B91C1C" };
  }
}

function humanStage(stage: string): string {
  const map: Record<string, string> = {
    queued: "Queued",
    loading_data: "Loading your profile…",
    downloading_resume: "Downloading your resume…",
    filling_form: "Filling the application form…",
    queued_for_resume: "Resuming with saved answers…",
  };
  return map[stage] || stage;
}
