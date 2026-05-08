/**
 * CTACard + CTAList  Phase 8 dashboard surface.
 *
 * Section 15.8 design rules:
 *   - ONE primary action per card.
 *   - Hover-revealed dismiss "x" (no permanent button taking up space).
 *   - Subtle color signaling per action class:
 *       'positive'    -> emerald accent (you got a reply)
 *       'opportunity' -> brand blue accent (alumni hire)
 *       'reminder'    -> amber accent (chat scheduled)
 *   - Stack max 3 visible (the hook trims; we trust it).
 *   - Cooldown after 5 dismissals -> render "Notifications quieted"
 *     instead of cards.
 *
 * The component is safe to mount unconditionally: when CTA_CARDS_ENABLED
 * is off, useCTAs returns an empty deck and the list renders nothing.
 */
import { Link } from 'react-router-dom';
import { ArrowRight, BellOff, X } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useCTAs, type CTACardDTO, type CTAActionClass } from '@/hooks/useCTAs';

const ACTION_CLASS_STYLES: Record<CTAActionClass, { border: string; chipText: string; chipBg: string }> = {
  positive: {
    border: 'border-l-emerald-500/70',
    chipText: 'text-emerald-700',
    chipBg: 'bg-emerald-50',
  },
  opportunity: {
    border: 'border-l-primary',
    chipText: 'text-primary',
    chipBg: 'bg-primary/10',
  },
  reminder: {
    border: 'border-l-amber-500/70',
    chipText: 'text-amber-800',
    chipBg: 'bg-amber-50',
  },
};

const TRIGGER_LABEL: Record<string, string> = {
  reply_received: 'Reply',
  alumni_hire: 'Alumni',
  coffee_chat_scheduled: 'Upcoming',
};

/**
 * The full deck. Renders 0 cards when disabled, the quieted banner when
 * the user is in cooldown, or up to 3 cards otherwise. Mount this once
 * on the dashboard above EmptyRecommendations.
 */
export function CTAList({ className }: { className?: string }) {
  const { cards, isQuieted, enabled, isLoading, dismiss, click } = useCTAs();

  if (!enabled) return null;
  if (isLoading) return null;

  if (isQuieted) {
    return (
      <div className={cn('mb-6', className)}>
        <Card className="px-4 py-3 flex items-center gap-3 border-dashed bg-muted/30">
          <BellOff className="w-4 h-4 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            Notifications quieted. We will resume nudges in a few days.
          </div>
        </Card>
      </div>
    );
  }

  if (cards.length === 0) return null;

  return (
    <div className={cn('mb-6 space-y-3', className)}>
      {cards.map((card) => (
        <CTACard
          key={card.card_id}
          card={card}
          onDismiss={() => void dismiss(card.card_id)}
          onClick={() => void click(card.card_id)}
        />
      ))}
    </div>
  );
}

interface CTACardProps {
  card: CTACardDTO;
  onDismiss: () => void;
  onClick: () => void;
}

/**
 * Single card. Visible everywhere; the hover-revealed "x" sits in the
 * top-right and only appears on group hover so the card chrome stays
 * minimal at rest.
 */
export function CTACard({ card, onDismiss, onClick }: CTACardProps) {
  const styles = ACTION_CLASS_STYLES[card.action_class] ?? ACTION_CLASS_STYLES.opportunity;
  const triggerLabel = TRIGGER_LABEL[card.trigger_type] ?? card.trigger_type;
  const aggregated = card.aggregated_count > 1;

  return (
    <Card
      className={cn(
        'group relative px-5 py-4 border-l-4 transition-shadow hover:shadow-sm',
        styles.border,
      )}
    >
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className={cn(
          'absolute top-2 right-2 rounded-md p-1 text-muted-foreground/60',
          'opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground',
          'transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        )}
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className={cn('text-[11px] font-medium uppercase tracking-wide', styles.chipText, styles.chipBg)}
            >
              {triggerLabel}
            </Badge>
            {aggregated && (
              <span className="text-[11px] text-muted-foreground">
                {card.aggregated_count} new today
              </span>
            )}
          </div>
          <h4 className="mt-2 text-base font-medium leading-tight">{card.title}</h4>
          <p className="mt-1 text-sm text-muted-foreground leading-snug">{card.body}</p>
        </div>

        <Link
          to={card.action_href}
          onClick={onClick}
          className={cn(
            'shrink-0 inline-flex items-center gap-1 self-center text-sm font-medium',
            'text-primary hover:text-primary/80 group-hover:underline underline-offset-4',
          )}
        >
          {card.action_label}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </Card>
  );
}

export default CTAList;
