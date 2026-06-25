/**
 * BriefingButton — the primary "Get my game plan" CTA inside Scout's empty
 * state (Phase 4B).
 *
 * Renders prominently above the suggested-question chips. Clicking it fires
 * useScoutChat.requestBriefing(), which posts to /briefing/stream and streams
 * a profile-grounded strategy back into the chat.
 *
 * Disabled while a briefing is already in-flight (isLoading) so the user
 * can't fan out duplicate requests.
 */
import { Loader2 } from 'lucide-react'

interface BriefingButtonProps {
  onClick: () => void
  isLoading: boolean
}

export function BriefingButton({ onClick, isLoading }: BriefingButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      aria-label="Set a plan"
      data-testid="briefing-button"
      className={[
        'group relative w-full flex items-center justify-center gap-2',
        'px-4 py-3 rounded-xl text-sm font-medium',
        'bg-[var(--brand-blue)] text-white shadow-sm',
        'hover:bg-[#2563EB] hover:shadow',
        'disabled:bg-gray-300 disabled:cursor-not-allowed disabled:shadow-none',
        'transition-colors duration-150',
      ].join(' ')}
    >
      {isLoading && (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      )}
      <span>{isLoading ? 'Putting together your plan…' : 'Set a plan'}</span>
    </button>
  )
}
