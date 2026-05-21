import React from "react";
import { Mail, ChevronDown } from "lucide-react";
import type { EmailTemplate } from "@/services/api";

interface TemplateButtonProps {
  template: EmailTemplate | null;
  onClick: () => void;
}

export const TemplateButton: React.FC<TemplateButtonProps> = ({ template, onClick }) => {
  const purpose = template?.purpose || "Networking";
  const style = template?.stylePreset || "Professional";

  return (
    <button
      type="button"
      onClick={onClick}
      className="tpl-btn"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0,
        padding: "8px 12px",
        border: "1px solid var(--line, #E2E8F0)",
        borderRadius: 10,
        background: "var(--paper)",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "all .15s",
        color: "var(--ink, #0F172A)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--brand-blue, #3B82F6)";
        e.currentTarget.style.color = "var(--brand-blue, #3B82F6)";
        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--line, #E2E8F0)";
        e.currentTarget.style.color = "var(--ink, #0F172A)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <Mail style={{ width: 13, height: 13, color: "currentColor", opacity: 0.7, marginRight: 8 }} />
      <span style={{ fontSize: 12, color: "currentColor", opacity: 0.6, marginRight: 6 }}>
        Email template
      </span>
      <span style={{ fontSize: 12, color: "currentColor", fontWeight: 500 }}>
        {purpose}
      </span>
      <span style={{ margin: "0 4px", fontSize: 11, color: "currentColor", opacity: 0.55 }}>
        &middot;
      </span>
      <span style={{ fontSize: 12, color: "currentColor", fontWeight: 500 }}>
        {style}
      </span>
      <ChevronDown style={{ width: 12, height: 12, color: "currentColor", opacity: 0.6, marginLeft: 8 }} />
    </button>
  );
};
