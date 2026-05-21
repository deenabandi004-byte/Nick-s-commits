import React from "react";
import { getSchoolMeta } from "@/lib/universityUtils";

interface SchoolSealProps {
  university: string | null | undefined;
  size?: 24 | 32 | 40;
}

export const SchoolSeal: React.FC<SchoolSealProps> = ({ university, size = 32 }) => {
  const meta = getSchoolMeta(university);
  const bg = meta?.color ?? "#94A3B8";
  const text = meta?.seal ?? "?";
  const fontSize = size <= 24 ? 9 : size <= 32 ? 11 : 13;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          color: "#fff",
          fontSize,
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontStyle: "italic",
          fontWeight: 400,
          lineHeight: 1,
          letterSpacing: "-0.02em",
        }}
      >
        {text}
      </span>
    </div>
  );
};
