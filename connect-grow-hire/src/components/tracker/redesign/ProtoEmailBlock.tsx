import { type ReactNode } from "react";
import { type ProtoContact } from "@/pages/trackerAdapter";
import { type ThreadMessage } from "@/services/api";

// ProtoEmailBlock is now a render-only conversation view. The hardcoded
// buildTemplates() that used to live here (Networking / Referral / Follow Up
// boilerplate) was the bug: it surfaced the same canned text even on contacts
// the user had already emailed. Real chain comes from
// GET /api/outbox/threads/<id>/messages and is passed in via props.
//
// Layout top to bottom:
//   1. Recommended-reply box (editable textarea + a Generate-button slot
//      controlled by the parent)
//   2. Conversation chain, newest first — most recent message lands directly
//      under the recommendation, older messages stack below.

function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function formatSentAt(sentAt: string | null | undefined): string {
  if (!sentAt) return "";
  const d = new Date(sentAt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// TemplateKey kept exported for legacy import-site compatibility — the
// template UI is gone but the parent still threads the type around. Treat as
// dead and remove once no consumers reference it.
export type TemplateKey = "networking" | "referral" | "followup";

interface MessageBubbleProps {
  message: ThreadMessage;
  contactName: string;
  userName: string;
}

function MessageBubble({ message, contactName, userName }: MessageBubbleProps) {
  const isUser = message.isFromUser;
  const isRecipient = message.isFromRecipient;
  const speakerName = isUser
    ? userName || "You"
    : isRecipient
      ? contactName || "Them"
      : message.sender || "Unknown";
  const speakerLabel = isUser ? "You" : isRecipient ? contactName || "Them" : message.sender || "Unknown";

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: 12,
        borderRadius: 6,
        background: isUser ? "#f5f6f8" : "#fff",
        border: "1px solid #eff0f3",
      }}
    >
      <div
        className="chip-avatar"
        style={{ alignSelf: "flex-start", marginTop: 2 }}
      >
        {initials(speakerName)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            marginBottom: 4,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "#1e2d4d" }}>{speakerLabel}</span>
          {message.sentAt && (
            <span style={{ fontSize: 11, color: "#94a3b8" }}>{formatSentAt(message.sentAt)}</span>
          )}
        </div>
        {message.subject && (
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>
            {message.subject}
          </div>
        )}
        <div
          style={{
            fontSize: 14,
            color: "#1a1a1a",
            lineHeight: "20px",
            whiteSpace: "pre-wrap",
          }}
        >
          {message.body || <span style={{ color: "#94a3b8" }}>(no body)</span>}
        </div>
      </div>
    </div>
  );
}

interface ProtoEmailBlockProps {
  contact: ProtoContact;
  userName: string;
  userEmail: string;
  messages: ThreadMessage[];
  messagesLoading: boolean;
  messagesError: string | null;
  draftBody: string;
  onChangeDraftBody: (next: string) => void;
  draftLoading: boolean;
  draftError: string | null;
  generateSlot: ReactNode;
  // Optional override for the "no messages yet" placeholder — lets the parent
  // surface a Gmail-disconnect prompt without ProtoEmailBlock owning that
  // affordance.
  emptyChainSlot?: ReactNode;
}

export function ProtoEmailBlock({
  contact,
  userName,
  userEmail,
  messages,
  messagesLoading,
  messagesError,
  draftBody,
  onChangeDraftBody,
  draftLoading,
  draftError,
  generateSlot,
  emptyChainSlot,
}: ProtoEmailBlockProps) {
  // Backend returns oldest -> newest. Display newest first so the latest
  // message sits directly under the recommendation box.
  const newestFirst = messages.slice().reverse();
  const hasMessages = newestFirst.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 1. Recommended reply (top) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="email-header-row">
          <span className="email-label">Recommended Reply</span>
        </div>

        <div className="email-fields" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <div className="email-field-row">
            <span className="email-field-label">To</span>
            <div className="email-to-chip">
              <div className="chip-avatar">{initials(contact.name)}</div>
              <span className="chip-name">{contact.name}</span>
            </div>
          </div>
          <div className="email-field-row">
            <span className="email-field-label">From</span>
            <span className="email-field-value">{userEmail}</span>
          </div>
        </div>

        <div
          style={{
            border: "1px solid #e5e7ec",
            borderRadius: 6,
            background: "#fff",
            padding: 10,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <textarea
            value={draftBody}
            onChange={(e) => onChangeDraftBody(e.target.value)}
            placeholder={
              draftLoading
                ? "Generating reply…"
                : "Click Generate to draft a thread-aware reply."
            }
            disabled={draftLoading}
            rows={8}
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              resize: "vertical",
              fontFamily: "var(--font-sans, Inter, system-ui, sans-serif)",
              fontSize: 14,
              lineHeight: "20px",
              color: "#1a1a1a",
              background: "transparent",
              minHeight: 140,
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 11, color: "#94a3b8" }}>
              {draftError
                ? <span style={{ color: "#dc2626" }}>{draftError}</span>
                : draftLoading
                  ? "Generating…"
                  : draftBody
                    ? `${draftBody.trim().split(/\s+/).filter(Boolean).length} words`
                    : ""}
            </div>
            {generateSlot}
          </div>
        </div>
      </div>

      {/* 2. Conversation chain (newest first) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="email-header-row">
          <span className="email-label">Conversation</span>
          <span className="email-pick">— what's been sent so far</span>
        </div>

        {messagesLoading ? (
          <div style={{ fontSize: 13, color: "#94a3b8", padding: 8 }}>
            Loading conversation…
          </div>
        ) : messagesError ? (
          <div style={{ fontSize: 13, color: "#dc2626", padding: 8 }}>
            {messagesError}
          </div>
        ) : hasMessages ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {newestFirst.map((m, idx) => (
              <MessageBubble
                key={m.messageId || `local-${idx}`}
                message={m}
                contactName={contact.name}
                userName={userName}
              />
            ))}
          </div>
        ) : emptyChainSlot ? (
          emptyChainSlot
        ) : (
          <div style={{ fontSize: 13, color: "#94a3b8", padding: 8 }}>
            No messages yet.
          </div>
        )}
      </div>
    </div>
  );
}
