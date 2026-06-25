// NeedsAttentionTab
//
// Lists every auto-apply job currently paused waiting on user input.
// Each card shows the job, the count of pending questions, and a "Resolve"
// button that opens the NeedsAttentionDrawer.

import { useCallback, useEffect, useState } from "react";
import {
  listNeedsAttention,
  type AutoApplyStatusResponse,
} from "@/services/api";
import { NeedsAttentionDrawer } from "./NeedsAttentionDrawer";

interface NeedsAttentionTabProps {
  // Optional poll interval in ms. Default 8s — drawer also forces a refetch
  // when the user resolves a card.
  pollInterval?: number;
}

export function NeedsAttentionTab({ pollInterval = 8000 }: NeedsAttentionTabProps) {
  const [items, setItems] = useState<AutoApplyStatusResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeJob, setActiveJob] = useState<AutoApplyStatusResponse | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await listNeedsAttention();
      setItems(r.items || []);
    } catch (err) {
      console.warn("listNeedsAttention failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, pollInterval);
    return () => window.clearInterval(id);
  }, [load, pollInterval]);

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
          Nothing waiting on you
        </div>
        Jobs that need your input will show up here.
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map((item) => (
        <Card key={item.auto_apply_id} item={item} onResolve={() => setActiveJob(item)} />
      ))}

      <NeedsAttentionDrawer
        job={activeJob}
        onClose={() => setActiveJob(null)}
        onResolved={() => {
          setActiveJob(null);
          load();
        }}
      />
    </div>
  );
}

interface CardProps {
  item: AutoApplyStatusResponse;
  onResolve: () => void;
}

function Card({ item, onResolve }: CardProps) {
  const pendingCount = item.pending_questions?.length || 0;
  const requiredCount =
    item.pending_questions?.filter((q) => q.required).length || 0;

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
        <div style={{ fontSize: 12, color: "#EF4444", marginTop: 6 }}>
          {requiredCount > 0
            ? `${requiredCount} required question${requiredCount === 1 ? "" : "s"}`
            : `${pendingCount} optional question${pendingCount === 1 ? "" : "s"}`}
        </div>
      </div>
      <button
        type="button"
        onClick={onResolve}
        style={{
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: 600,
          background: "#3B82F6",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
        }}
      >
        Resolve
      </button>
    </div>
  );
}
