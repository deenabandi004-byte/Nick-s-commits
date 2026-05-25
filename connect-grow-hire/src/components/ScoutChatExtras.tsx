/**
 * ScoutChatExtras - small presentational sub-components that ride alongside
 * a Scout chat turn:
 *   - ScoutModePill      mode receipt (chat / plan / do / clarify)
 *   - ScoutToolPill      live tool-call narration with collapse to result chip
 *   - ScoutPlanChecklist inline render of a saved multi-step plan
 *   - ScoutCtaChip       single end-of-message bridge chip
 *   - ScoutTriedFailedHint  proactive prompt at panel top when memory shows
 *                           recent zero-result searches
 *
 * House style: cool-slate neutrals, brand blue (#3B82F6) is the only accent,
 * no gradients, no warm fills on chrome.
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, ArrowRight, Lightbulb, Circle, CheckCircle2 } from 'lucide-react';
import type {
  ScoutMode,
  ScoutCta,
  ScoutPlan,
  ScoutPlanStep,
  ScoutToolEvent,
} from '@/hooks/useScoutChat';

// ---------------------------------------------------------------------------
// Mode pill
// ---------------------------------------------------------------------------

const MODE_COPY: Record<ScoutMode, string> = {
  chat: 'chat',
  plan: 'plan',
  do: 'do',
  clarify: 'clarify',
};

export function ScoutModePill({ mode }: { mode: ScoutMode | null | undefined }) {
  if (!mode) return null;
  return (
    <span
      className="inline-flex items-center rounded-full bg-[var(--brand-blue-soft)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--brand-blue)]"
      title={`Scout classified this turn as ${mode}`}
    >
      {MODE_COPY[mode]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tool-call narration pill (Change 1)
// ---------------------------------------------------------------------------

export function ScoutToolPill({ event }: { event: ScoutToolEvent }) {
  const [open, setOpen] = useState(false);
  const expandable = event.done && !!event.summary;

  if (!event.done) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand-border)] bg-[var(--brand-bg-surface)] px-2.5 py-1 text-xs text-[var(--brand-ink-secondary)]">
        <Loader2 className="h-3 w-3 animate-spin text-[var(--brand-blue)]" />
        <span>{event.label}…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => expandable && setOpen(o => !o)}
        className={
          'inline-flex items-center gap-1.5 self-start rounded-full border border-[var(--brand-border)] bg-white px-2.5 py-1 text-xs text-[var(--brand-ink-secondary)] ' +
          (expandable ? 'hover:border-[var(--brand-blue)] hover:text-[var(--brand-ink)] cursor-pointer' : 'cursor-default')
        }
      >
        {expandable && (open
          ? <ChevronDown className="h-3 w-3" />
          : <ChevronRight className="h-3 w-3" />
        )}
        <span className="text-[var(--brand-ink-secondary)]">{event.label}</span>
        {event.summary && (
          <>
            <span className="text-[var(--brand-ink-tertiary)]">·</span>
            <span className="font-medium text-[var(--brand-ink)]">{event.summary}</span>
          </>
        )}
      </button>
      {open && event.summary && (
        <pre className="ml-3 max-h-32 overflow-auto rounded-md bg-[var(--brand-bg-surface)] px-2 py-1.5 text-[11px] text-[var(--brand-ink-secondary)] whitespace-pre-wrap">
          {/* No raw payload by default; the summary is the canonical view.
              Reserved for future deep-inspection. */}
          {event.summary}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan checklist (Change 5)
// ---------------------------------------------------------------------------

interface ScoutPlanChecklistProps {
  plan: ScoutPlan;
  /** Called when the user clicks "Do this" on a step that carries a route.
   *  The panel turns it into a navigate + bridge. */
  onStepAction: (step: ScoutPlanStep) => void;
}

export function ScoutPlanChecklist({ plan, onStepAction }: ScoutPlanChecklistProps) {
  if (!plan?.steps?.length) return null;
  return (
    <div className="mt-2 rounded-xl border border-[var(--brand-border)] bg-white p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--brand-ink-secondary)]">
        <Lightbulb className="h-3.5 w-3.5 text-[var(--brand-blue)]" />
        <span className="uppercase tracking-wide">Plan saved</span>
      </div>
      <p className="mb-3 text-sm leading-snug text-[var(--brand-ink)]">{plan.goal}</p>
      <ul className="space-y-1.5">
        {plan.steps.map((step) => (
          <li key={step.index} className="flex items-start gap-2">
            {step.done
              ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--brand-blue)]" />
              : <Circle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--brand-ink-tertiary)]" />}
            <div className="flex-1">
              <div className={
                'text-sm leading-snug ' +
                (step.done ? 'text-[var(--brand-ink-tertiary)] line-through' : 'text-[var(--brand-ink)]')
              }>
                {step.title}
              </div>
              {step.detail && (
                <div className="text-xs leading-snug text-[var(--brand-ink-secondary)]">{step.detail}</div>
              )}
            </div>
            {!step.done && step.route && (
              <button
                type="button"
                onClick={() => onStepAction(step)}
                className="inline-flex flex-shrink-0 items-center gap-1 rounded-md border border-[var(--brand-border)] bg-white px-2 py-0.5 text-[11px] font-medium text-[var(--brand-blue)] hover:border-[var(--brand-blue)] hover:bg-[var(--brand-blue-subtle)]"
              >
                Do this
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CTA chip (Change 6)
// ---------------------------------------------------------------------------

interface ScoutCtaChipProps {
  cta: ScoutCta;
  onAction: (cta: ScoutCta) => void;
}

export function ScoutCtaChip({ cta, onAction }: ScoutCtaChipProps) {
  return (
    <button
      type="button"
      onClick={() => onAction(cta)}
      className="mt-2 inline-flex items-center gap-1.5 self-start rounded-full border border-[var(--brand-border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--brand-blue)] hover:border-[var(--brand-blue)] hover:bg-[var(--brand-blue-subtle)]"
    >
      <span>{cta.label}</span>
      <ArrowRight className="h-3.5 w-3.5" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tried-and-failed proactive hint (Change 3)
// ---------------------------------------------------------------------------

interface ScoutTriedFailedHintProps {
  triedPrompt: string;
  onWiden: (prompt: string) => void;
  onDismiss: () => void;
}

export function ScoutTriedFailedHint({
  triedPrompt,
  onWiden,
  onDismiss,
}: ScoutTriedFailedHintProps) {
  return (
    <div className="mx-5 mt-3 mb-1 flex items-start gap-2 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg-surface)] px-3 py-2">
      <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--brand-blue)]" />
      <div className="flex-1">
        <p className="text-xs leading-snug text-[var(--brand-ink-secondary)]">
          Earlier today, <span className="font-medium text-[var(--brand-ink)]">"{triedPrompt}"</span> came up empty. Want to widen it?
        </p>
        <div className="mt-1.5 flex gap-2">
          <button
            type="button"
            onClick={() => onWiden(triedPrompt)}
            className="text-xs font-medium text-[var(--brand-blue)] hover:underline"
          >
            Widen the search
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-[var(--brand-ink-tertiary)] hover:text-[var(--brand-ink-secondary)]"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
