/**
 * Slate Split onboarding design tokens + shared styles.
 * Source of truth: design_handoff_onboarding_flow (Onboarding Mockups, July 2026).
 * Scoped to the onboarding flow only — do not import into general app surfaces.
 */
import type { CSSProperties } from "react";

export const OB = {
  primary: "#4A60A8",
  primaryDark: "#3C4F8E",
  primary200: "#B6C3E8",
  primary100: "#E4E9F5",
  primary50: "#EEF1F9",
  heading: "#1E2D4D",
  ink: "#0A0A0A",
  ink2: "#475569",
  ink3: "#64748B",
  ink4: "#94A3B8",
  border: "#E5E7EC",
  railGradient: "linear-gradient(165deg, #25335A, #0F172A)",
  railPeriwinkle: "#9CA8CD",
  railHintText: "#B6C3E8",
  mascotChip: "#F1F4FA",
  pageBg: "#EEF0F4",
  trialPillBg: "#E8F5E9",
  trialPillFg: "#2E7D32",
  shadowLg: "0 16px 40px rgba(26,26,26,.08)",
  shadowBlue: "0 2px 8px rgba(74,96,168,.20)",
  fontDisplay: "'Lora', Georgia, serif",
  fontBody: "'Inter', system-ui, sans-serif",
} as const;

export const obFieldLabel: CSSProperties = {
  fontFamily: OB.fontBody,
  fontWeight: 600,
  fontSize: 14,
  color: OB.heading,
  marginBottom: 8,
  display: "block",
};

export const obInput: CSSProperties = {
  width: "100%",
  height: 48,
  border: `1px solid ${OB.border}`,
  borderRadius: 10,
  padding: "0 15px",
  fontFamily: OB.fontBody,
  fontSize: 15,
  color: OB.ink,
  background: "#fff",
  outline: "none",
};

export const obPrimaryButton: CSSProperties = {
  width: "100%",
  height: 50,
  border: "none",
  borderRadius: 10,
  background: OB.primary,
  color: "#fff",
  fontFamily: OB.fontBody,
  fontWeight: 600,
  fontSize: 15,
  cursor: "pointer",
  boxShadow: OB.shadowBlue,
  transition: "background .2s cubic-bezier(0.16,1,0.3,1)",
};

/** Input focus ring per spec: 3px primary-100 ring + primary border. */
export const obFocus = {
  onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = OB.primary;
    e.currentTarget.style.boxShadow = `0 0 0 3px ${OB.primary100}`;
  },
  onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = OB.border;
    e.currentTarget.style.boxShadow = "none";
  },
};
