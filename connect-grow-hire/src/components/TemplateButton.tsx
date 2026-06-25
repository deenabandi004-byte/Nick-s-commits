import React from "react";
import { Mail, ChevronDown } from "lucide-react";
import { getEmailTemplateLabel } from "@/services/api";
import type { EmailTemplate } from "@/services/api";

interface TemplateButtonProps {
  template: EmailTemplate | null;
  onClick: () => void;
}

export const TemplateButton: React.FC<TemplateButtonProps> = ({ template, onClick }) => {
  // Show the template's display name (a named custom template like "Quick
  // Interview") when present, otherwise the human-readable purpose label.
  // stylePreset is always null now, so the old "purpose . style" pair only
  // ever rendered a misleading "custom . Professional".
  const label = getEmailTemplateLabel(template);

  return (
    <button
      type="button"
      onClick={onClick}
      className="tpl-btn"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0,
        padding: "12px 20px",
        border: "1px solid var(--line, #E5E5E0)",
        borderRadius: 10,
        background: "var(--paper)",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "all .15s",
        color: "var(--ink, #111318)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--brand-blue, #3B82F6)";
        e.currentTarget.style.color = "var(--brand-blue, #3B82F6)";
        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--line, #E5E5E0)";
        e.currentTarget.style.color = "var(--ink, #111318)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <Mail style={{ width: 13, height: 13, color: "currentColor", opacity: 0.7, marginRight: 8 }} />
      <span style={{ fontSize: 14, color: "currentColor", opacity: 0.6, marginRight: 6 }}>
        Email template
      </span>
      <span style={{ margin: "0 4px 0 0", fontSize: 13, color: "currentColor", opacity: 0.55 }}>
        &middot;
      </span>
      <span style={{ fontSize: 14, color: "currentColor", fontWeight: 500 }}>
        {label}
      </span>
      <ChevronDown style={{ width: 12, height: 12, color: "currentColor", opacity: 0.6, marginLeft: 8 }} />
    </button>
  );
};
