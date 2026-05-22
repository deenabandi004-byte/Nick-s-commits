/**
 * ScoutApproveCard - the inline approve UI for a Scout navigate proposal.
 *
 * Rendered in the chat when Scout proposes a navigation that needs the user's
 * sign-off: an inferred (non-imperative) navigate, or any credit-spending
 * destination. It shows the reasoning, the destination route, and each prefill
 * field as an editable chip. Approving calls onApprove with the (possibly
 * edited) prefill; the panel then writes the bridge and navigates.
 */
import { useState } from 'react';
import { Check, ArrowRight } from 'lucide-react';
import type { ScoutNavigate } from '@/hooks/useScoutChat';

interface ScoutApproveCardProps {
  navigate: ScoutNavigate;
  /** True once the user has approved; renders a collapsed confirmation. */
  resolved?: boolean;
  onApprove: (prefill: Record<string, string>) => void;
}

// Human-readable labels for prefill field keys.
const FIELD_LABELS: Record<string, string> = {
  job_title: 'Role',
  company: 'Company',
  location: 'Location',
  industry: 'Industry',
  size: 'Size',
  linkedin_url: 'LinkedIn',
  job_url: 'Job link',
  query: 'Search',
};

export function ScoutApproveCard({ navigate, resolved, onApprove }: ScoutApproveCardProps) {
  const [prefill, setPrefill] = useState<Record<string, string>>(
    () => ({ ...(navigate.prefill || {}) }),
  );
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const keys = Object.keys(prefill);

  if (resolved) {
    return (
      <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-[var(--c-border-subtle)] bg-[var(--c-surface)] px-3 py-2 text-xs text-[var(--c-text-tertiary)]">
        <Check className="h-3.5 w-3.5 text-[var(--c-accent)]" />
        <span>Approved, went to {navigate.route}</span>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-raised)] p-3 shadow-sm">
      <p className="text-sm leading-snug text-[var(--c-text)]">{navigate.reasoning}</p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-[var(--c-surface-sunken)] px-2 py-0.5 font-mono text-[11px] text-[var(--c-text-secondary)]">
          {navigate.route}
        </span>
      </div>

      {keys.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {keys.map((k) => (
            <div
              key={k}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--c-border)] bg-[var(--c-surface)] px-2 py-1 text-xs"
            >
              <span className="text-[var(--c-text-tertiary)]">{FIELD_LABELS[k] || k}</span>
              {editingKey === k ? (
                <input
                  autoFocus
                  value={prefill[k]}
                  onChange={(e) => setPrefill((p) => ({ ...p, [k]: e.target.value }))}
                  onBlur={() => setEditingKey(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') setEditingKey(null);
                  }}
                  className="w-32 rounded bg-[var(--c-surface-sunken)] px-1 text-[var(--c-text)] outline-none focus:ring-1 focus:ring-[var(--c-accent)]"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingKey(k)}
                  title="Click to edit"
                  className="font-medium text-[var(--c-text)] underline decoration-dotted decoration-[var(--c-text-tertiary)] underline-offset-2"
                >
                  {prefill[k] || 'add'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => onApprove(prefill)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--c-accent)] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[var(--c-accent-hover)] active:scale-[0.98]"
      >
        <Check className="h-4 w-4" />
        Approve
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default ScoutApproveCard;
