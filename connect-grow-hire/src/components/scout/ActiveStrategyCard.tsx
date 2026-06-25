/**
 * ActiveStrategyCard — persistent strategy header in the Scout panel
 * (Phase 4B, cherry-pick E7, placement D2-A header strip).
 *
 * Shows the user's currently-active multi-step plan with checkbox progress.
 * Renders at the top of the chat column whenever a strategy exists, so
 * step progress is always-on context (the "coach" positioning).
 *
 * Per-briefing opt-out via the X button: clicking it fires onDontSave, which
 * the panel translates into a one-shot "don't auto-save the next briefing"
 * preference. The card itself doesn't delete the persisted strategy; the
 * delete-on-dismiss flow lives on the backend in Phase 4B follow-up so the
 * user can opt out without nuking work-in-progress.
 */
import { useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import type { ScoutActiveStrategy } from '@/hooks/useScoutChat'

interface ActiveStrategyCardProps {
  strategy: ScoutActiveStrategy
  onDontSave?: () => void
}

export function ActiveStrategyCard({
  strategy,
  onDontSave,
}: ActiveStrategyCardProps) {
  const [collapsed, setCollapsed] = useState(false)
  const steps = strategy.steps || []
  const done = steps.filter((s) => s.done).length
  const total = steps.length

  return (
    <section
      role="region"
      aria-label={`Active strategy: ${strategy.goal || 'unnamed plan'}`}
      data-testid="active-strategy-card"
      className="mx-3 mt-2 mb-1 rounded-xl border border-[#E0EAFF] bg-[#FAFBFF] overflow-hidden"
    >
      {/* Header row: title + progress + collapse + opt-out */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand strategy' : 'Collapse strategy'}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-blue)]">
            Plan
          </span>
          <span className="text-xs font-medium text-gray-900 truncate">
            {strategy.goal || 'Active strategy'}
          </span>
          <span className="text-[11px] text-gray-500 flex-shrink-0">
            {done}/{total}
          </span>
          {collapsed ? (
            <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
          )}
        </button>
        {onDontSave && (
          <button
            type="button"
            onClick={onDontSave}
            aria-label="Don't save this briefing as a plan"
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-white rounded-md transition-colors flex-shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Step list. Hidden when collapsed - lets the card act as a one-line
          summary on a crowded panel. */}
      {!collapsed && steps.length > 0 && (
        <ul className="px-3 pb-2.5 space-y-1.5">
          {steps.map((step, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2 text-xs leading-snug"
            >
              <input
                type="checkbox"
                checked={step.done}
                readOnly
                aria-label={`Step ${idx + 1}: ${step.title}${step.done ? ' (done)' : ' (pending)'}`}
                className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-[var(--brand-blue)] focus:ring-[var(--brand-blue)] cursor-default"
              />
              <span
                className={
                  step.done
                    ? 'text-gray-400 line-through'
                    : 'text-gray-700'
                }
              >
                {step.title}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
