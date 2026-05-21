import React from "react";
import { getUniversityShortName } from "@/lib/universityUtils";

interface PersonalizationStripProps {
  firstName: string | null | undefined;
  university: string | null | undefined;
  angle?: string | null;
}

export const PersonalizationStrip: React.FC<PersonalizationStripProps> = ({
  firstName,
  university,
  angle,
}) => {
  const schoolShort = getUniversityShortName(university);
  if (!firstName && !schoolShort) return null;

  const nameLabel = [firstName, schoolShort].filter(Boolean).join(" · ");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 0 16px",
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "var(--ink-2)",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        {nameLabel}
      </span>
      {angle && (
        <>
          <span style={{ color: "var(--ink-3)", fontSize: 11 }}>·</span>
          <span
            style={{
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 400,
              color: "var(--ink-3)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {angle}
          </span>
        </>
      )}
    </div>
  );
};
