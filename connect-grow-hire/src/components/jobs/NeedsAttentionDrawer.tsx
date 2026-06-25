// NeedsAttentionDrawer
//
// Opens when the user clicks "Resolve" on a job that landed in the Needs
// Attention queue. Renders pending_questions[] as typed inputs, collects
// answers, and POSTs to /resolve. The backend saves each answer to the
// per-user answer library and re-spawns the background worker when all
// required questions are resolved.

import { useEffect, useMemo, useState } from "react";
import {
  resolveAutoApplyAnswers,
  pollAutoApplyStatus,
  type AutoApplyPendingQuestion,
  type AutoApplyStatusResponse,
} from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { IconClose } from "./icons";

interface NeedsAttentionDrawerProps {
  job: AutoApplyStatusResponse | null;
  onClose: () => void;
  // Called when the drawer closes after a successful resolve. The parent
  // can refresh the Auto-Submission tab to pick up the resumed worker.
  onResolved?: (jobId: string) => void;
}

export function NeedsAttentionDrawer({
  job,
  onClose,
  onResolved,
}: NeedsAttentionDrawerProps) {
  const pending = useMemo<AutoApplyPendingQuestion[]>(
    () => (job?.pending_questions || []) as AutoApplyPendingQuestion[],
    [job],
  );

  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  // Reset state whenever the drawer opens for a different job
  useEffect(() => {
    if (job) setAnswers({});
  }, [job?.auto_apply_id]);

  if (!job) return null;

  const setAnswer = (qid: string, value: unknown) =>
    setAnswers((prev) => ({ ...prev, [qid]: value }));

  const requiredQids = pending.filter((q) => q.required).map((q) => q.field_id);
  const allRequiredAnswered = requiredQids.every((qid) => {
    const v = answers[qid];
    return v !== undefined && v !== "" && v !== null;
  });

  const handleSubmit = async () => {
    if (!allRequiredAnswered) {
      toast({
        title: "Answer all required questions",
        description: "We can only submit when every required field is filled.",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await resolveAutoApplyAnswers(job.auto_apply_id, answers);
      if (!res.ok) {
        toast({
          title: "Couldn't save your answers",
          description: "Try again in a moment.",
          variant: "destructive",
        });
        return;
      }
      const remaining = res.data.pending_questions?.length || 0;
      if (remaining === 0) {
        toast({
          title: "Resuming application",
          description: "Your answers were saved. We'll submit in the background.",
        });
        // Best-effort: poll once to confirm the worker re-spawned
        try {
          await pollAutoApplyStatus(job.auto_apply_id);
        } catch {
          // non-fatal
        }
        onResolved?.(job.auto_apply_id);
        onClose();
      } else {
        toast({
          title: "Saved",
          description: `${remaining} question${remaining === 1 ? "" : "s"} still need answers.`,
        });
      }
    } catch (err) {
      console.error("resolve failed", err);
      toast({
        title: "Couldn't save your answers",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.5)",
        zIndex: 100,
        display: "flex",
        justifyContent: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(560px, 100%)",
          height: "100%",
          background: "#fff",
          boxShadow: "-12px 0 28px rgba(15, 23, 42, 0.18)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid #E5E5E5",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "#94A3B8", fontWeight: 500 }}>
              Needs your input
            </div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 600,
                color: "#0F172A",
                marginTop: 2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {job.job_title || job.job_id || "Application"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              padding: 6,
              borderRadius: 6,
              color: "#475569",
            }}
          >
            <IconClose />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 22,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
            We couldn't auto-fill these questions for you. Answer once and we'll
            save them so the next job that asks the same thing skips this step.
          </p>

          {pending.length === 0 ? (
            <p style={{ fontSize: 13, color: "#64748B" }}>
              No pending questions. The worker should be running.
            </p>
          ) : (
            pending.map((q) => (
              <QuestionInput
                key={q.field_id}
                question={q}
                value={answers[q.field_id]}
                onChange={(v) => setAnswer(q.field_id, v)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 22px",
            borderTop: "1px solid #E5E5E5",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 12, color: "#64748B" }}>
            {requiredQids.length} required · {pending.length - requiredQids.length} optional
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                border: "1px solid #E5E5E5",
                background: "#fff",
                color: "#475569",
                borderRadius: 8,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              Save for later
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || !allRequiredAnswered}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                border: "none",
                background: !allRequiredAnswered ? "#CBD5E1" : "#3B82F6",
                color: "#fff",
                borderRadius: 8,
                cursor: saving || !allRequiredAnswered ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Submitting..." : "Submit application"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface QuestionInputProps {
  question: AutoApplyPendingQuestion;
  value: unknown;
  onChange: (v: unknown) => void;
}

function QuestionInput({ question, value, onChange }: QuestionInputProps) {
  const labelEl = (
    <label
      style={{
        fontSize: 13,
        fontWeight: 500,
        color: "#0F172A",
        display: "block",
        marginBottom: 6,
      }}
    >
      {question.label}
      {question.required && (
        <span style={{ color: "#EF4444", marginLeft: 4 }}>*</span>
      )}
    </label>
  );

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    fontSize: 13,
    border: "1px solid #E5E5E5",
    borderRadius: 8,
    fontFamily: "inherit",
    background: "#fff",
    color: "#0F172A",
  };

  switch (question.field_type) {
    case "textarea":
      return (
        <div>
          {labelEl}
          <textarea
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            style={{ ...inputStyle, resize: "vertical", minHeight: 96 }}
          />
        </div>
      );

    case "select": {
      // Greenhouse uses react-select widgets whose options aren't in the
      // DOM until the dropdown opens. When the extractor couldn't harvest
      // them, fall back to a text input — the form-filler types the value
      // into the react-select on the re-run, which works for free-form
      // values and for selects whose options the user knows (e.g.
      // "How did you hear about us?").
      const hasOptions = (question.options || []).length > 0;
      if (!hasOptions) {
        return (
          <div>
            {labelEl}
            <input
              type="text"
              value={(value as string) || ""}
              onChange={(e) => onChange(e.target.value)}
              style={inputStyle}
              placeholder="Type your answer"
            />
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>
              We couldn't see the dropdown options. Type the exact text that
              should be selected.
            </div>
          </div>
        );
      }
      return (
        <div>
          {labelEl}
          <select
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            style={inputStyle}
          >
            <option value="">Select an option</option>
            {(question.options || []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      );
    }

    case "radio":
      return (
        <div>
          {labelEl}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(question.options || []).map((opt) => (
              <label
                key={opt}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  color: "#0F172A",
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name={question.field_id}
                  value={opt}
                  checked={value === opt}
                  onChange={() => onChange(opt)}
                />
                {opt}
              </label>
            ))}
          </div>
        </div>
      );

    case "checkbox":
      return (
        <div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: "#0F172A",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={value === true}
              onChange={(e) => onChange(e.target.checked)}
            />
            {question.label}
            {question.required && (
              <span style={{ color: "#EF4444" }}>*</span>
            )}
          </label>
        </div>
      );

    case "number":
      return (
        <div>
          {labelEl}
          <input
            type="number"
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            style={inputStyle}
          />
        </div>
      );

    case "date":
      return (
        <div>
          {labelEl}
          <input
            type="date"
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            style={inputStyle}
          />
        </div>
      );

    case "text":
    default:
      return (
        <div>
          {labelEl}
          <input
            type="text"
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            style={inputStyle}
          />
        </div>
      );
  }
}
