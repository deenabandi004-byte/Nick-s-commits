import React from "react";
import { ScribbleUnderline } from "./ScribbleUnderline";

interface PageTitleProps {
  /** Primary text. If `lead` is provided, this is ignored. */
  children?: React.ReactNode;
  /** Italic accent word(s) with scribble underline. */
  accent?: React.ReactNode;
  /** Optional subtitle below the heading. */
  subtitle?: string;
  /** Explicit lead text — takes precedence over `children`. */
  lead?: string;
  /** Text alignment. Defaults to "left". */
  align?: "left" | "center";
  /** Suppress the scribble underline beneath the accent. */
  noScribble?: boolean;
  /** Heading size. "lg" = 44px (default), "md" = 36px. */
  size?: "lg" | "md";
}

export const PageTitle = ({ children, accent, subtitle, lead, align = "left", noScribble = false, size = "lg" }: PageTitleProps) => (
  <div style={align === "center" ? { textAlign: "center" } : undefined}>
    <h1 className={`font-serif ${size === "md" ? "text-[36px]" : "text-[44px]"} leading-[1.05] text-ink tracking-[-0.015em]`}>
      {lead ?? children}{' '}
      {accent && (
        <em className="font-serif relative inline-block" style={{ fontStyle: 'italic', fontWeight: 400, color: '#003262' }}>
          {accent}
          {!noScribble && <ScribbleUnderline />}
        </em>
      )}
    </h1>
    {subtitle && (
      <p className="mt-2 text-ink-2 text-[15px]">{subtitle}</p>
    )}
  </div>
);
