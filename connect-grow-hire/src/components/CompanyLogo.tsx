import { useEffect, useMemo, useState } from "react";
import { getCompanyLogoCandidates } from "@/utils/suggestionChips";

type CompanyLogoProps = {
  /** Company name - resolves the logo and the fallback monogram. */
  company: string;
  /** Square size in pixels. */
  size?: number;
  /** Corner radius in pixels. */
  rounded?: number;
  /** Hairline border around the logo tile. */
  bordered?: boolean;
  className?: string;
};

/**
 * Company logo tile. Tries Clearbit first (full-color logo), then the Google
 * favicon, and falls back to a neutral monogram (the company's first letter)
 * when no logo loads. Replaces colored letter avatars across the app.
 */
export function CompanyLogo({
  company,
  size = 36,
  rounded = 9,
  bordered = true,
  className,
}: CompanyLogoProps) {
  const candidates = useMemo(() => getCompanyLogoCandidates(company), [company]);
  const [idx, setIdx] = useState(0);

  // Reset to the first candidate when the company changes (rows/cards reuse
  // this component instance as lists re-render).
  useEffect(() => setIdx(0), [company]);

  const url = candidates[idx];
  const monogram = company.trim().charAt(0).toUpperCase() || "?";

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
