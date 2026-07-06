import React from "react";
import { Mail, ChevronRight } from "lucide-react";
import { getEmailTemplateLabel } from "@/services/api";
import type { EmailTemplate } from "@/services/api";

interface TemplateButtonProps {
  template: EmailTemplate | null;
  onClick: () => void;
}

// The editable-choice control in the Outreach setup group: a stacked
// label/value ("Email template" over the selected template name) so the
// value reads as a changeable selection, not part of a static caption.
export const TemplateButton: React.FC<TemplateButtonProps> = ({ template, onClick }) => {
  // Show the template's display name (a named custom template like "Quick
  // Interview") when present, otherwise the human-readable purpose label.
  const label = getEmailTemplateLabel(template);

  return (
    <button
      type="button"
      onClick={onClick}
      className="tpl-btn"
      aria-label={`Email template: ${label}. Change template`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 14px",
        border: "1px solid rgba(59,130,246,0.45)",
        borderRadius: 10,
        background: "var(--paper, #FFFFFF)",
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
        transition: "all .15s",
        color: "var(--ink, #111318)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--brand-blue, #3B82F6)";
        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "rgba(59,130,246,0.45)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <Mail style={{ width: 16, height: 16, color: "var(--brand-blue, #3B82F6)", flexShrink: 0 }} />
      <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontSize: 10.5, color: "var(--ink-3, #8A8F9A)", lineHeight: 1.2 }}>
          Email template
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink, #111318)", lineHeight: 1.25 }}>
          {label}
        </span>
      </span>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 2,
          marginLeft: 6,
          fontSize: 11.5,
          fontWeight: 500,
          color: "var(--brand-blue, #3B82F6)",
        }}
      >
        Edit
        <ChevronRight style={{ width: 12, height: 12 }} />
      </span>
    </button>
  );
};
