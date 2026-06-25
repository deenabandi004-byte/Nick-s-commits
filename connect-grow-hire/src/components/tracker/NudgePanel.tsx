import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Bell, X, Send, Clock, MessageSquareReply, Loader2, Search } from "lucide-react";
import type { Nudge, ReplyCoachDraft } from "@/services/api";
import { htmlToPlainText } from "@/lib/formatters";

export interface ReplyDraftItem {
  contactId: string;
  contactName: string;
  company?: string;
  draft: ReplyCoachDraft;
}

interface NudgePanelProps {
  nudges: Nudge[];
  replyDrafts?: ReplyDraftItem[];
  onActOnNudge: (nudge: Nudge) => void;
  onDismissNudge: (nudgeId: string) => void;
  onSelectContact: (contactId: string) => void;
  onSendReplyDraft?: (contactId: string) => void;
  isSendingDraft?: string | null;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function StuckStudentCard({ nudge, onDismiss }: { nudge: Nudge; onDismiss: (id: string) => void }) {
  const navigate = useNavigate();
  const suggestions = (nudge as any).suggestions || [];

  return (
    <div className="bg-emerald-50/60 border border-emerald-200/60 rounded-md px-3 py-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-700 leading-relaxed">
            {nudge.generatedMessage}
          </p>
        </div>
        <button
          onClick={() => onDismiss(nudge.id)}
          className="flex-shrink-0 p-1 rounded hover:bg-emerald-200/40 text-gray-400 hover:text-gray-600 transition-colors"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {suggestions.map((s: { title: string; company: string; reason: string }, i: number) => (
            <button
              key={i}
              onClick={() => navigate(`/find?tab=people&q=${encodeURIComponent(s.title + " " + s.company)}`)}
              className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded bg-white border border-emerald-200/50 hover:border-emerald-300 transition-colors"
            >
              <Search className="w-3 h-3 text-emerald-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-gray-800 block truncate">
                  {s.title} at {s.company}
                </span>
                <span className="text-[10px] text-gray-500 block truncate">{s.reason}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1 mt-1.5 text-[10px] text-gray-400">
        <Clock className="w-3 h-3" />
        {timeAgo(nudge.createdAt)}
      </div>
    </div>
  );
}

export function NudgePanel({
  nudges,
  replyDrafts = [],
  onActOnNudge,
  onDismissNudge,
  onSelectContact,
  onSendReplyDraft,
  isSendingDraft,
}: NudgePanelProps) {
  const [open, setOpen] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);

  // Separate stuck-student nudges from regular follow-up nudges
  const stuckNudges = nudges.filter((n) => (n as any).type === "stuck_student");
  const regularNudges = nudges.filter((n) => (n as any).type !== "stuck_student");

  const totalCount = regularNudges.length + replyDrafts.length + stuckNudges.length;
  if (totalCount === 0) return null;

  return (
    <div data-testid="nudge-panel" className="border-b border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-gray-50 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        )}
        <Bell className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
        <span className="text-xs font-semibold tracking-wide uppercase text-amber-600">
          Follow-up Suggestions
        </span>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
          {totalCount}
        </span>
      </button>

      {open && (
        <div className="px-2 pb-2 space-y-1.5">
          {/* Reply Coach drafts */}
          {replyDrafts.map((item) => {
            const isExpanded = expandedDraftId === item.contactId;
            return (
              <div
                key={`reply-${item.contactId}`}
                className="bg-blue-50/60 border border-blue-200/60 rounded-md px-3 py-2"
              >
                <div className="flex items-start gap-2">
                  <MessageSquareReply className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => onSelectContact(item.contactId)}
                      className="text-sm font-medium text-gray-900 hover:text-[#3B82F6] truncate block text-left"
                    >
                      {item.contactName}
                    </button>
                    {item.company && (
                      <p className="text-xs text-gray-500 truncate">{item.company}</p>
                    )}
                    <p className="text-xs text-blue-600 mt-0.5">
                      Reply draft ready — {item.draft.replyType}
                    </p>
                  </div>
                </div>

                <div className="mt-2">
                  {!isExpanded ? (
                    <button
                      onClick={() => setExpandedDraftId(item.contactId)}
                      className="text-[11px] text-blue-700 hover:text-blue-800 font-medium"
                    >
                      View suggested reply →
                    </button>
                  ) : (
                    <div className="mt-1">
                      <div className="bg-white border border-blue-200/50 rounded px-3 py-2 text-xs text-gray-700 leading-relaxed whitespace-pre-line">
                        {htmlToPlainText(item.draft.body)}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        {onSendReplyDraft && (
                          <button
                            onClick={() => onSendReplyDraft(item.contactId)}
                            disabled={isSendingDraft === item.contactId}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded bg-[#3B82F6] text-white hover:bg-[#2563EB] transition-colors disabled:opacity-50"
                          >
                            {isSendingDraft === item.contactId ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Send className="w-3 h-3" />
                            )}
                            Create Gmail draft
                          </button>
                        )}
                        <button
                          onClick={() => setExpandedDraftId(null)}
                          className="text-[11px] text-gray-500 hover:text-gray-700"
                        >
                          Collapse
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 mt-1.5 text-[10px] text-gray-400">
                  <Clock className="w-3 h-3" />
                  {timeAgo(item.draft.createdAt)}
                </div>
              </div>
            );
          })}

          {/* Stuck-student nudges */}
          {stuckNudges.map((nudge) => (
            <StuckStudentCard key={nudge.id} nudge={nudge} onDismiss={onDismissNudge} />
          ))}

          {/* Follow-up nudges */}
          {regularNudges.map((nudge) => {
            const isExpanded = expandedId === nudge.id;
            return (
              <div
                key={nudge.id}
                className="bg-amber-50/60 border border-amber-200/60 rounded-md px-3 py-2"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => onSelectContact(nudge.contactId)}
                      className="text-sm font-medium text-gray-900 hover:text-[#3B82F6] truncate block text-left"
                    >
                      {nudge.contactName}
                    </button>
                    {nudge.company && (
                      <p className="text-xs text-gray-500 truncate">{nudge.company}</p>
                    )}
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                      {nudge.generatedMessage}
                    </p>
                  </div>
                  <button
                    onClick={() => onDismissNudge(nudge.id)}
                    className="flex-shrink-0 p-1 rounded hover:bg-amber-200/40 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Expandable follow-up draft */}
                {nudge.followUpDraft && (
                  <div className="mt-2">
                    {!isExpanded ? (
                      <button
                        onClick={() => setExpandedId(nudge.id)}
                        className="text-[11px] text-amber-700 hover:text-amber-800 font-medium"
                      >
                        View suggested follow-up email →
                      </button>
                    ) : (
                      <div className="mt-1">
                        <div className="bg-white border border-amber-200/50 rounded px-3 py-2 text-xs text-gray-700 leading-relaxed whitespace-pre-line">
                          {nudge.followUpDraft}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={() => onActOnNudge(nudge)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded bg-[#3B82F6] text-white hover:bg-[#2563EB] transition-colors"
                          >
                            <Send className="w-3 h-3" />
                            Use this draft
                          </button>
                          <button
                            onClick={() => setExpandedId(null)}
                            className="text-[11px] text-gray-500 hover:text-gray-700"
                          >
                            Collapse
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!nudge.followUpDraft && (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => onActOnNudge(nudge)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded bg-[#3B82F6] text-white hover:bg-[#2563EB] transition-colors"
                    >
                      <Send className="w-3 h-3" />
                      Follow up
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-1 mt-1.5 text-[10px] text-gray-400">
                  <Clock className="w-3 h-3" />
                  {timeAgo(nudge.createdAt)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
