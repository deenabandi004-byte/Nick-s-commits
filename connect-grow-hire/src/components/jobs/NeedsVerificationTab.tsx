// NeedsVerificationTab
//
// Lists every auto-apply job where the filler finished the form fill but the
// ATS ships CAPTCHA that would reject our headless-browser submission
// (Greenhouse reCAPTCHA, Lever hCaptcha, Ashby reCAPTCHA v3). Each card lets
// the user open the apply URL in their own browser, review what we'd fill,
// finish the submit themselves (reCAPTCHA scores their real device as
// human), and then mark it as submitted.
//
// Why this exists: the Sorce research confirmed nobody actually bypasses
// CAPTCHA. They surface failures cleanly. This is our parallel — except we
// pre-fill everything so the user's "finish in browser" step is paste +
// solve + click, not retype-everything-from-scratch.

import { useCallback, useEffect, useState } from "react";
import {
  listNeedsVerification,
  markAutoApplySubmitted,
  type AutoApplyStatusResponse,
  type AutoApplyPreparedAnswer,
} from "@/services/api";

interface NeedsVerificationTabProps {
  // Optional poll interval in ms. Default 8s — matches NeedsAttentionTab.
  pollInterval?: number;
}

export function NeedsVerificationTab({
  pollInterval = 8000,
}: NeedsVerificationTabProps) {
  const [items, setItems] = useState<AutoApplyStatusResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await listNeedsVerification();
      setItems(r.items || []);
    } catch (err) {
      console.warn("listNeedsVerification failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, pollInterval);
    return () => window.clearInterval(id);
  }, [load, pollInterval]);

  const handleMarkSubmitted = useCallback(
    async (autoApplyId: string) => {
      try {
        const r = await markAutoApplySubmitted(autoApplyId);
        if (r.ok) {
          // Optimistic removal — server already flipped status. Reload
          // also kicks in on next poll.
          setItems((cur) => cur.filter((it) => it.auto_apply_id !== autoApplyId));
        } else {
          console.warn("markAutoApplySubmitted failed", r.data);
        }
      } catch (err) {
        console.warn("markAutoApplySubmitted error", err);
      }
    },
    [],
  );

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
        Applications that need a quick check before submit will show up here.
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "16px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: "#64748B",
          lineHeight: 1.6,
          background: "#F8FAFC",
          border: "1px solid #E5E5E5",
          borderRadius: 8,
          padding: "10px 14px",
        }}
      >
        <strong style={{ color: "#0F172A" }}>
          Why are these here?
        </strong>{" "}
        Greenhouse, Lever, and Ashby all use CAPTCHA on their apply forms.
        We can&apos;t solve CAPTCHA from our server, but you can solve it in
        ~5 seconds on your own browser. Open each one, paste our prepared
        answers, solve the challenge, and click Submit. Then mark it done
        here.
      </div>

      {items.map((item) => (
        <VerificationCard
          key={item.auto_apply_id}
          item={item}
          expanded={expandedId === item.auto_apply_id}
          onToggle={() =>
            setExpandedId((cur) =>
              cur === item.auto_apply_id ? null : item.auto_apply_id,
            )
          }
          onMarkSubmitted={() => handleMarkSubmitted(item.auto_apply_id)}
        />
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------
// Card
// -----------------------------------------------------------------------

interface VerificationCardProps {
  item: AutoApplyStatusResponse;
  expanded: boolean;
  onToggle: () => void;
  onMarkSubmitted: () => void;
}

function VerificationCard({
  item,
  expanded,
  onToggle,
  onMarkSubmitted,
}: VerificationCardProps) {
  const prepared = item.prepared_answers || [];
  const vendor = item.captcha?.vendor;
  const vendorLabel =
    vendor === "recaptcha"
      ? "reCAPTCHA"
      : vendor === "hcaptcha"
      ? "hCaptcha"
      : vendor === "turnstile"
      ? "Cloudflare Turnstile"
      : "CAPTCHA";

  return (
    <div
      style={{
        border: "1px solid #E5E5E5",
        borderRadius: 10,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      {/* ---- Header row ---- */}
      <div
        style={{
          padding: 16,
          display: "flex",
          alignItems: "center",
          gap: 16,
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
          <div style={{ fontSize: 12, color: "#3B82F6", marginTop: 6 }}>
            {prepared.length} field
            {prepared.length === 1 ? "" : "s"} ready · finish in your browser
            to clear {vendorLabel}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          style={{
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 500,
            background: "transparent",
            color: "#64748B",
            border: "1px solid #E5E5E5",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          {expanded ? "Hide answers" : "View answers"}
        </button>
        {item.apply_url && (
          <a
            href={item.apply_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              background: "#3B82F6",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            Open in browser ↗
          </a>
        )}
        <button
          type="button"
          onClick={onMarkSubmitted}
          style={{
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 600,
            background: "#10B981",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          I submitted it
        </button>
      </div>

      {/* ---- Expanded prepared-answers block ---- */}
      {expanded && (
        <PreparedAnswersList prepared={prepared} />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Prepared-answers list (the part the user copies / references)
// -----------------------------------------------------------------------

interface PreparedAnswersListProps {
  prepared: AutoApplyPreparedAnswer[];
}

function PreparedAnswersList({ prepared }: PreparedAnswersListProps) {
  if (prepared.length === 0) {
    return (
      <div
        style={{
          padding: "12px 16px 16px",
          borderTop: "1px solid #F1F5F9",
          fontSize: 12,
          color: "#94A3B8",
        }}
      >
        No prepared answers — finish in browser and use your saved profile.
      </div>
    );
  }
  return (
    <div
      style={{
        borderTop: "1px solid #F1F5F9",
        padding: "12px 16px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#64748B",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        Prepared answers
      </div>
      {prepared.map((p, idx) => (
        <PreparedAnswerRow key={`${p.field_id}-${idx}`} answer={p} />
      ))}
    </div>
  );
}

function PreparedAnswerRow({ answer }: { answer: AutoApplyPreparedAnswer }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(answer.answer);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (err) {
      console.warn("clipboard write failed", err);
    }
  }, [answer.answer]);

  // Source tag colors keep the UI honest about where the answer came
  // from: profile data, library (a prior job's saved answer), LLM
  // (generated), consent fast-path (auto-agree to standard checkboxes).
  const sourceColor: Record<string, string> = {
    profile: "#0F766E",
    library: "#1D4ED8",
    llm: "#7C3AED",
    consent_fastpath: "#64748B",
  };
  const tagColor = sourceColor[answer.source] || "#94A3B8";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: 10,
        background: "#F8FAFC",
        border: "1px solid #F1F5F9",
        borderRadius: 8,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#475569",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {answer.label}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: tagColor,
              background: "#fff",
              border: `1px solid ${tagColor}33`,
              padding: "1px 6px",
              borderRadius: 4,
              textTransform: "uppercase",
              letterSpacing: 0.4,
              flexShrink: 0,
            }}
          >
            {answer.source}
          </span>
        </div>
        <div
          style={{
            fontSize: 13,
            color: "#0F172A",
            marginTop: 4,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {answer.answer}
        </div>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        style={{
          padding: "4px 10px",
          fontSize: 11,
          fontWeight: 600,
          background: copied ? "#10B981" : "#fff",
          color: copied ? "#fff" : "#64748B",
          border: copied ? "1px solid #10B981" : "1px solid #E5E5E5",
          borderRadius: 6,
          cursor: "pointer",
          flexShrink: 0,
          minWidth: 56,
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
