/**
 * QueueContactCard — single card in the "Suggested For You" tab.
 *
 * Displays a queued contact with its warmth badge, why-this-contact
 * rationale, drafted email preview, and Approve / Dismiss actions.
 *
 * Design notes (Phase 1):
 *  - Warmth palette is ZERO red. Warm = #3B82F6, Neutral = gray, Cold = light-blue.
 *  - Uses shared ContactAvatar / ContactIdentity / CardAccentBorder primitives
 *    so it stays visually aligned with the Pipeline ContactCard.
 *  - Approve / Dismiss are non-destructive — dismiss opens a modal for reason.
 */
import { useState } from "react";
import { CheckCircle2, X, Mail, MapPin, GraduationCap, Loader2, ExternalLink } from "lucide-react";
import type { QueueContact } from "@/services/api";
import {
  ContactAvatar,
  ContactIdentity,
} from "@/components/tracker/shared/ContactCardBase";
import { htmlToPlainText } from "@/lib/formatters";

interface QueueContactCardProps {
  contact: QueueContact;
  onApprove: () => void;
  onDismiss: () => void;
  isApproving?: boolean;
  isDismissing?: boolean;
  disabled?: boolean;
  /** When true, the card becomes non-interactive (used by the Free teaser). */
  readOnly?: boolean;
}

// Warmth palette — intentionally ZERO red (see design doc §Warmth).
const WARMTH_STYLE: Record<
  NonNullable<QueueContact["warmthTier"]>,
  { bg: string; fg: string; label: string; accent: string }
> = {
  warm: {
    bg: "rgba(59, 130, 246, 0.12)",
    fg: "#2563EB",
    label: "Warm",
    accent: "#3B82F6",
  },
  neutral: {
    bg: "rgba(107, 114, 128, 0.12)",
    fg: "#4B5563",
    label: "Neutral",
    accent: "#9CA3AF",
  },
  cold: {
    bg: "rgba(147, 197, 253, 0.18)",
    fg: "#1D4ED8",
    label: "Cold",
    accent: "#93C5FD",
  },
};

function displayName(c: QueueContact): string {
  if (c.name) return c.name;
  const pieces = [c.firstName, c.lastName].filter(Boolean);
  if (pieces.length > 0) return pieces.join(" ");
  return c.email || "Unknown";
}

export function QueueContactCard({
  contact,
  onApprove,
  onDismiss,
  isApproving = false,
  isDismissing = false,
  disabled = false,
  readOnly = false,
}: QueueContactCardProps) {
  const [expanded, setExpanded] = useState(false);

  const name = displayName(contact);
  const warmth = contact.warmthTier ? WARMTH_STYLE[contact.warmthTier] : WARMTH_STYLE.neutral;
  const subtitle = [contact.title, contact.company].filter(Boolean).join(" at ");
  const locationStr = [contact.city, contact.state].filter(Boolean).join(", ");

  const disableActions = disabled || readOnly || isApproving || isDismissing;

  return (
    <div
      className="bg-white border border-gray-100 rounded-[6px] overflow-hidden shadow-[0_1px_3px_rgba(15,23,42,0.04)]"
      style={{ borderLeft: `3px solid ${warmth.accent}` }}
    >
      {/* Top row: identity + warmth badge */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-start gap-3">
          <ContactAvatar name={name} size="lg" />
          <ContactIdentity
            name={name}
            subtitle={subtitle}
            trailing={
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                style={{ background: warmth.bg, color: warmth.fg }}
              >
                {warmth.label}
              </span>
            }
            status={
              <div className="flex items-center gap-3 text-gray-400 text-[11px] mt-0.5">
                {locationStr && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {locationStr}
                  </span>
                )}
                {contact.college && (
                  <span className="flex items-center gap-1 truncate">
                    <GraduationCap className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{contact.college}</span>
                  </span>
                )}
              </div>
            }
          />
          {contact.linkedinUrl && !readOnly && (
            <a
              href={contact.linkedinUrl.startsWith('http') ? contact.linkedinUrl : `https://${contact.linkedinUrl}`}
              target="_blank"
              rel="noreferrer"
              className="flex-shrink-0 text-gray-400 hover:text-[#3B82F6] p-1"
              aria-label="Open LinkedIn profile"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Why this contact */}
      {contact.whyThisContact && (
        <div className="px-4 pb-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 mb-1">
            Why this contact
          </p>
          <p className="text-xs text-gray-600 leading-relaxed">{contact.whyThisContact}</p>
          {contact.warmthSignals && contact.warmthSignals.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {contact.warmthSignals.map((signal) => (
                <span
                  key={signal}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-500"
                >
                  {signal}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Email preview (collapsible) */}
      {(contact.emailSubject || contact.emailBody) && (
        <div className="px-4 pb-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            <Mail className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate font-medium text-gray-700">
              {contact.emailSubject || "(no subject)"}
            </span>
            <span className="text-gray-400 flex-shrink-0">{expanded ? "Hide" : "Preview"}</span>
          </button>
          {expanded && contact.emailBody && (
            <div className="mt-2 bg-gray-50 border border-gray-100 rounded-[4px] px-3 py-2 text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">
              {htmlToPlainText(contact.emailBody)}
            </div>
          )}
        </div>
      )}

      {/* Action bar */}
      <div className="px-4 py-2.5 bg-[#FAFBFF] border-t border-gray-100 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDismiss}
          disabled={disableActions}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-[3px] text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isDismissing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <X className="w-3.5 h-3.5" />
          )}
          Dismiss
        </button>
        <button
          type="button"
          onClick={onApprove}
          disabled={disableActions}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-[3px] bg-[#3B82F6] text-white hover:bg-[#2563EB] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isApproving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5" />
          )}
          Approve & Draft
        </button>
      </div>
    </div>
  );
}
