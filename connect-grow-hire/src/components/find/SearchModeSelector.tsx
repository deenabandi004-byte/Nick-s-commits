import React, { useEffect, useRef, useState } from "react";
import { Mail, FileText, Send, Lock, Info } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  type Tier,
  type OutreachMode,
  getAllowedOutreachModes,
} from "@/utils/featureAccess";

/**
 * Three-mode outreach selector for the Find search, chosen BEFORE running a
 * search. Segmented control with three discrete options (not a slider):
 *   Get emails (preview) | Draft emails (default) | Send emails (Elite).
 *
 * Modes the current tier cannot use are shown greyed with a lock and a one
 * line upsell on hover. An info icon opens a popover describing each mode.
 *
 * The backend (runs.py prompt_search) re-validates the chosen mode against the
 * user tier and is the source of truth, so this UI gating is convenience only.
 */

type ModeMeta = {
  mode: OutreachMode;
  label: string;
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
  short: string;
  upsell: string;
};

const MODE_META: ModeMeta[] = [
  {
    mode: "preview",
    label: "Get emails",
    icon: Mail,
    short: "Returns contact info only. No email is written and no Gmail draft is created.",
    upsell: "",
  },
  {
    mode: "draft",
    label: "Draft emails",
    icon: FileText,
    short: "Writes the email and creates a Gmail draft for you to review before sending.",
    upsell: "Upgrade to Pro to draft emails automatically.",
  },
  {
    mode: "send",
    label: "Send emails",
    icon: Send,
    short: "Writes and sends the emails for you. You confirm before anything goes out.",
    upsell: "Upgrade to Elite to send emails directly.",
  },
];

const ACCENT = "#4A60A8";
const FLASH = "#3B82F6";

interface SearchModeSelectorProps {
  tier: Tier;
  value: OutreachMode;
  onChange: (mode: OutreachMode) => void;
  disabled?: boolean;
}

export function SearchModeSelector({ tier, value, onChange, disabled }: SearchModeSelectorProps) {
  const allowed = getAllowedOutreachModes(tier);

  // Flash effect: when the user picks a new mode, briefly tint the selected
  // pill vibrant blue then fade back to the slate accent.
  const [flashing, setFlashing] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = () => {
    setFlashing(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashing(false), 700);
  };
  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        role="radiogroup"
        aria-label="Outreach mode"
        style={{
          display: "inline-flex",
          border: "1px solid #E2E8F0",
          borderRadius: 8,
          padding: 2,
          background: "#fff",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {MODE_META.map((meta) => {
          const Icon = meta.icon;
          const isAllowed = allowed.includes(meta.mode);
          const isSelected = value === meta.mode;
          const locked = !isAllowed;
          return (
            <button
              key={meta.mode}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              title={locked ? meta.upsell : meta.short}
              onClick={() => {
                if (disabled || locked) return;
                onChange(meta.mode);
                flash();
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 6,
                border: "none",
                fontSize: 13,
                fontWeight: 500,
                cursor: disabled ? "default" : locked ? "not-allowed" : "pointer",
                background: isSelected ? (flashing ? FLASH : ACCENT) : "transparent",
                color: isSelected ? "#fff" : locked ? "#94A3B8" : "#334155",
                transition: "background .35s ease, color .12s",
              }}
            >
              <Icon style={{ width: 14, height: 14 }} />
              {meta.label}
              {locked && <Lock style={{ width: 11, height: 11 }} />}
            </button>
          );
        })}
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="What do these modes do?"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 24,
              height: 24,
              borderRadius: 9999,
              border: "none",
              background: "transparent",
              color: "#94A3B8",
              cursor: "pointer",
            }}
          >
            <Info style={{ width: 16, height: 16 }} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" style={{ width: 300, padding: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {MODE_META.map((meta) => {
              const Icon = meta.icon;
              return (
                <div key={meta.mode} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <Icon style={{ width: 14, height: 14, color: ACCENT, marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1E293B" }}>{meta.label}</div>
                    <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.4 }}>{meta.short}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default SearchModeSelector;
