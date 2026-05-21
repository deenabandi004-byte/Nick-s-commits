import React from "react";
import { getCompanyLogoUrl } from "@/utils/suggestionChips";
import { ArrowRight } from "lucide-react";

interface ArchiveRowProps {
  num: string;
  name: string;
  sentence: string;
  sector: string;
  onClick: () => void;
}

export const ArchiveRow: React.FC<ArchiveRowProps> = ({
  num,
  name,
  sentence,
  sector,
  onClick,
}) => {
  const logoUrl = getCompanyLogoUrl(name);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        width: "100%",
        padding: "14px 16px",
        background: "transparent",
        border: "none",
        borderBottom: "1px solid var(--line-2, #F0F0ED)",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "inherit",
        transition: "background .12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--paper-2, #FAFBFF)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {/* Row number */}
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          fontWeight: 400,
          color: "var(--ink-3, #8A8F9A)",
          width: 24,
          flexShrink: 0,
          textAlign: "right",
        }}
      >
        {num}
      </span>

      {/* Company logo */}
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          style={{
            width: 20,
            height: 20,
            borderRadius: 3,
            flexShrink: 0,
            objectFit: "contain",
          }}
        />
      ) : (
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 3,
            background: "var(--line-2, #F0F0ED)",
            flexShrink: 0,
          }}
        />
      )}

      {/* Company name */}
      <span
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: "var(--ink, #111318)",
          minWidth: 120,
          flexShrink: 0,
        }}
      >
        {name}
      </span>

      {/* Sentence */}
      <span
        style={{
          flex: 1,
          fontSize: 13,
          color: "var(--ink-3, #8A8F9A)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {sentence}
      </span>

      {/* Sector tag */}
      <span
        style={{
          fontSize: 10,
          fontFamily: "'JetBrains Mono', monospace",
          color: "var(--ink-3, #8A8F9A)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          flexShrink: 0,
          display: "none",
        }}
        className="hidden sm:inline"
      >
        {sector}
      </span>

      {/* Arrow */}
      <ArrowRight
        style={{
          width: 14,
          height: 14,
          color: "var(--ink-3, #8A8F9A)",
          flexShrink: 0,
          opacity: 0.5,
        }}
      />
    </button>
  );
};
