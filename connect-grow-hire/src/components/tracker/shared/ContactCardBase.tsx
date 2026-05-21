/**
 * Shared contact card primitives used by both the Pipeline (existing
 * ContactCard.tsx) and the Agentic Queue (QueueContactCard.tsx).
 *
 * These are additive - the legacy ContactCard is not refactored to use them
 * yet. The goal is to avoid drift between the two card variants (avatar
 * coloring, identity block, accent border) while leaving existing code
 * untouched.
 *
 * Design reference: Phase 1 design doc §"Card Components".
 */
import type { CSSProperties, ReactNode } from "react";

// ---------- avatar ----------

export function initialsFor(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = name.charCodeAt(i) + ((h << 5) - h);
  }
  const hue = ((h % 360) + 360) % 360;
  return `hsl(${hue}, 55%, 55%)`;
}

interface ContactAvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const AVATAR_SIZE_CLASS: Record<NonNullable<ContactAvatarProps["size"]>, string> = {
  sm: "w-8 h-8 text-[10px]",
  md: "w-9 h-9 text-xs",
  lg: "w-11 h-11 text-sm",
};

export function ContactAvatar({ name, size = "md", className = "" }: ContactAvatarProps) {
  return (
    <div
      className={`flex-shrink-0 rounded-full flex items-center justify-center font-semibold text-white ${AVATAR_SIZE_CLASS[size]} ${className}`}
      style={{ backgroundColor: avatarColor(name) }}
      aria-hidden
    >
      {initialsFor(name)}
    </div>
  );
}

// ---------- identity (name + subtitle) ----------

interface ContactIdentityProps {
  name: string;
  subtitle?: string;
  status?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}

export function ContactIdentity({
  name,
  subtitle,
  status,
  trailing,
  className = "",
}: ContactIdentityProps) {
  return (
    <div className={`min-w-0 flex-1 ${className}`}>
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold truncate text-gray-900">{name}</p>
        {trailing}
      </div>
      {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
      {status && <div className="text-xs mt-0.5 truncate">{status}</div>}
    </div>
  );
}

// ---------- accent border wrapper ----------

interface CardAccentBorderProps {
  accentColor?: string;
  isSelected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  as?: "button" | "div";
}

/**
 * Wrapper that renders a left-accent border, rounded corners, hover state,
 * and click affordance. Pass `accentColor` as a CSS color string (hex / hsl
 * / rgb). For non-interactive cards use `as="div"` and omit onClick.
 */
export function CardAccentBorder({
  accentColor = "transparent",
  isSelected = false,
  onClick,
  children,
  className = "",
  style,
  as = "button",
}: CardAccentBorderProps) {
  const baseClass = `w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-[3px] transition-all border-l-[3px] ${
    isSelected ? "bg-[#FAFBFF]" : "hover:bg-gray-50"
  } ${className}`;

  const resolvedStyle: CSSProperties = {
    borderLeftColor: isSelected ? "#3B82F6" : accentColor,
    ...style,
  };

  if (as === "div") {
    return (
      <div className={baseClass} style={resolvedStyle}>
        {children}
      </div>
    );
  }

  return (
    <button type="button" onClick={onClick} className={baseClass} style={resolvedStyle}>
      {children}
    </button>
  );
}

// ---------- status line ----------

interface StatusLineProps {
  text: string;
  tone?: "muted" | "info" | "warning" | "danger" | "success";
  className?: string;
}

const TONE_CLASS: Record<NonNullable<StatusLineProps["tone"]>, string> = {
  muted: "text-gray-400",
  info: "text-[#2563EB]",
  warning: "text-amber-600",
  danger: "text-red-500 font-medium",
  success: "text-green-600",
};

export function StatusLine({ text, tone = "muted", className = "" }: StatusLineProps) {
  return <span className={`${TONE_CLASS[tone]} ${className}`}>{text}</span>;
}
