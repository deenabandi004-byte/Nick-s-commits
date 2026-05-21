// Inline nudge card pattern. Lighter than Card primitive (12px 16px vs p-5),
// heavier than GoalsPromptBanner (has bordered container, not full-width strip).
// Tokens: --paper-2 bg, --line border, --ink/--ink-2 text hierarchy.
// When a 2nd instance of this pattern is needed, extract to shared component (TODO-3).

import { useRef, useEffect, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Suggestion } from '../lib/suggestionEngine';
import { trackSuggestionEvent } from '../services/api';

interface SuggestionCardProps {
  suggestion: Suggestion;
  onDismiss: (id: string) => void;
  onClick: (suggestion: Suggestion) => void;
}

// Module-level set: suggestion_shown fires once per card per browser tab lifetime.
// Not keyed by uid, so cross-user auth switches without reload will undercount
// impressions for the second user. Acceptable for V1 (biases CTR upward).
// TODO: clear on auth change if graduation gate analysis shows undercount skew.
const shownIds = new Set<string>();

export function SuggestionCard({ suggestion, onDismiss, onClick }: SuggestionCardProps) {
  const [dismissed, setDismissed] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver: fire suggestion_shown once per card per session
  useEffect(() => {
    const el = cardRef.current;
    if (!el || shownIds.has(suggestion.id)) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !shownIds.has(suggestion.id)) {
          shownIds.add(suggestion.id);
          trackSuggestionEvent('suggestion_shown', {
            suggestion_id: suggestion.id,
            suggestion_type: suggestion.type,
          });
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [suggestion.id, suggestion.type]);

  const handleDismiss = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      trackSuggestionEvent('suggestion_dismissed', {
        suggestion_id: suggestion.id,
        suggestion_type: suggestion.type,
      });
      setDismissed(true);
    },
    [suggestion.id, suggestion.type],
  );

  const handleTransitionEnd = useCallback(() => {
    if (dismissed) onDismiss(suggestion.id);
  }, [dismissed, onDismiss, suggestion.id]);

  const handleClick = useCallback(() => {
    trackSuggestionEvent('suggestion_clicked', {
      suggestion_id: suggestion.id,
      suggestion_type: suggestion.type,
    });
    onClick(suggestion);
  }, [suggestion, onClick]);

  return (
    <div
      ref={cardRef}
      role="region"
      aria-label={`Suggestion: ${suggestion.title}`}
      className={cn(
        'flex items-center gap-3 rounded-[6px] border px-4 py-3',
        'transition-[opacity,max-height] duration-150 ease-out',
        dismissed ? 'opacity-0 max-h-0 overflow-hidden !py-0 !border-0' : 'max-h-24',
      )}
      style={{
        backgroundColor: 'var(--paper-2)',
        borderColor: dismissed ? 'transparent' : 'var(--line)',
      }}
      onTransitionEnd={handleTransitionEnd}
    >
      <button
        type="button"
        className="flex-1 min-w-0 text-left cursor-pointer"
        onClick={handleClick}
        tabIndex={0}
      >
        <p
          className="text-sm font-medium truncate sm:truncate sm:whitespace-nowrap"
          style={{ color: 'var(--ink)' }}
        >
          {suggestion.title}
        </p>
        <p
          className="text-[13px] truncate"
          style={{ color: 'var(--ink-2)' }}
        >
          {suggestion.subtitle}
        </p>
      </button>

      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss suggestion"
        className="shrink-0 p-2 rounded-sm transition-colors cursor-pointer"
        style={{ color: 'var(--ink-2)' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--ink)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-2)'; }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
