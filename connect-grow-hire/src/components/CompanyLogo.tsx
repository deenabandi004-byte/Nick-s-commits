import { useEffect, useMemo, useState } from "react";
import { getCompanyLogoCandidates } from "@/utils/suggestionChips";

type CompanyLogoProps = {
  company: string;
  size?: number;
  rounded?: number;
  bordered?: boolean;
  className?: string;
  // When true and the chain falls through to the monogram, render null
  // instead of the slate letter tile. Useful inline (e.g. next to a company
  // name in body text) where a letter tile next to text looks noisy.
  hideWhenMonogram?: boolean;
};

export function CompanyLogo({
  company,
  size = 36,
  rounded = 9,
  bordered = true,
  className,
  hideWhenMonogram = false,
}: CompanyLogoProps) {
  const candidates = useMemo(() => getCompanyLogoCandidates(company), [company]);
  const [idx, setIdx] = useState(0);

  useEffect(() => setIdx(0), [company]);

  const url = candidates[idx];
  const monogram = company.trim().charAt(0).toUpperCase() || "?";

  if (!url && hideWhenMonogram) return null;

  const box: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: size,
    height: size,
    borderRadius: rounded,
    flexShrink: 0,
    overflow: "hidden",
  };

  if (!url) {
    return (
      <span
        className={className}
        style={{
          ...box,
          background: "#F1F5F9",
          color: "#64748B",
          fontSize: Math.round(size * 0.42),
          fontWeight: 700,
        }}
      >
        {monogram}
      </span>
    );
  }

  return (
    <span
      className={className}
      style={{
        ...box,
        background: "#FFFFFF",
        border: bordered ? "1px solid #E2E8F0" : "none",
      }}
    >
      <img
        src={url}
        alt={`${company} logo`}
        width={Math.round(size * 0.66)}
        height={Math.round(size * 0.66)}
        style={{ objectFit: "contain" }}
        loading="lazy"
        onError={() => setIdx((i) => i + 1)}
      />
    </span>
  );
}

export default CompanyLogo;
