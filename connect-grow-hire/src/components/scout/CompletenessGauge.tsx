/**
 * CompletenessGauge — inline profile-completeness signal for briefings
 * (Phase 4B, cherry-pick E1, placement D2-B in-flow).
 *
 * Rendered inside the briefing message bubble when coverage < 90%. Below
 * that the gauge becomes ambient noise so the backend marks
 * should_hide_gauge=true and we render nothing.
 *
 * Hover/tap on the percentage opens a HoverCard listing the top gap groups
 * with deep-link "Upload your resume" / "Add LinkedIn URL" CTAs. Keeping
 * the labels and routes in sync with the backend's GAP_LABELS/GAP_DEEP_LINKS
 * is a manual coordination; if this list drifts, the gauge's hover surface
 * goes stale before any test will catch it.
 */
import { Link } from 'react-router-dom'
import { Progress } from '@/components/ui/progress'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import type { ScoutCoverage } from '@/hooks/useScoutChat'

// Mirrors backend GAP_LABELS in scout/profile_coverage.py. Drift risk noted
// in the module doc; keep one source of truth eventually.
const GAP_COPY: Record<string, { label: string; route: string }> = {
  resume: {
    label: 'Upload your resume',
    route: '/account-settings?tab=resume',
  },
  linkedin: {
    label: 'Add your LinkedIn URL',
    route: '/onboarding/profile',
  },
  goals: {
    label: 'Tell us your target industries and roles',
    route: '/onboarding/goals',
  },
  academics: {
    label: 'Add your school, major, and graduation year',
    route: '/onboarding/academics',
  },
  location: {
    label: 'Set your preferred location',
    route: '/onboarding/location',
  },
  professional: {
    label: 'Add your professional background',
    route: '/account-settings?tab=profile',
  },
}

interface CompletenessGaugeProps {
  coverage: ScoutCoverage
}

export function CompletenessGauge({ coverage }: CompletenessGaugeProps) {
  if (coverage.should_hide_gauge) return null
  const pct = Math.max(0, Math.min(100, coverage.coverage_pct))
  const topGaps = (coverage.gap_groups || []).slice(0, 3)

  return (
    <div
      data-testid="completeness-gauge"
      className="mt-3 px-3 py-2.5 rounded-xl bg-[#FAFBFF] border border-[#EEF2F8]"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-gray-700">
          Scout coverage:
        </span>
        <HoverCard openDelay={150}>
          <HoverCardTrigger asChild>
            <button
              type="button"
              className="text-xs font-semibold text-[var(--brand-blue)] hover:underline"
              aria-label={`Profile completeness: ${pct} percent. Click for details.`}
            >
              {pct}%
            </button>
          </HoverCardTrigger>
          <HoverCardContent
            side="top"
            align="start"
            className="w-72 text-xs leading-snug"
          >
            {topGaps.length === 0 ? (
              <p className="text-gray-600">Profile complete. Nice work.</p>
            ) : (
              <>
                <p className="font-medium mb-2 text-gray-900">
                  Fill these to sharpen the next briefing:
                </p>
                <ul className="space-y-1">
                  {topGaps.map((group) => {
                    const meta = GAP_COPY[group]
                    if (!meta) return null
                    return (
                      <li key={group}>
                        <Link
                          to={meta.route}
                          className="text-[var(--brand-blue)] hover:underline"
                        >
                          {meta.label} →
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </HoverCardContent>
        </HoverCard>
      </div>
      <Progress
        value={pct}
        aria-label={`Profile completeness: ${pct} percent`}
        className="h-1.5"
      />
    </div>
  )
}
