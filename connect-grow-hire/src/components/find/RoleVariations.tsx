/**
 * Inline role-variations pill row — Grammarly-style, sits directly below the typed
 * sentence in the prompt box. When the heuristic finds industry-aware role variations
 * (e.g. "Banker" + Barclays → IB Analyst, S&T Analyst, Equity Research), this row
 * surfaces them as horizontal blue bubbles. Hover to preview the swap in the prompt;
 * click to commit; × dismisses the suggestion list.
 */

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import useDebounce from '@/hooks/use-debounce';
import { analyzeQuery } from '@/lib/specificity';

interface RoleVariationsProps {
  prompt: string;
  isSearching: boolean;
  hasResults: boolean;
  isLinkedIn: boolean;
  onAcceptSuggestion?: (originalMatched: string, chosen: string) => void;
  onPreviewSuggestion?: (originalMatched: string, chosen: string) => void;
  onClearPreview?: () => void;
  /** When true, the Try card stays visible after a search has rendered results —
   *  so a user editing the prompt post-search still gets role swaps. */
  inputFocused?: boolean;
}

const EASE = [0.16, 1, 0.3, 1] as const;
const ROLE_LIMIT = 3;

export const RoleVariations: React.FC<RoleVariationsProps> = ({
  prompt,
  isSearching,
  hasResults,
  isLinkedIn,
  onAcceptSuggestion,
  onPreviewSuggestion,
  onClearPreview,
  inputFocused = false,
}) => {
  const debounced = useDebounce(prompt, 120);
  const trimmed = debounced.trim();
  const visible =
    trimmed.length >= 3 &&
    !isSearching &&
    !isLinkedIn &&
    (!hasResults || inputFocused);

  // Track dismissed *matched substrings* (and their accepted swaps) so that
  // accepting a pill makes the card go away — not just for the original word but
  // also for the role it just resolved to. Otherwise clicking "Investment Banking
  // Analyst" would immediately surface Investment Banking Associate / Sales &
  // Trading variations on the new prompt, which felt buggy.
  const [dismissedMatches, setDismissedMatches] = useState<Set<string>>(new Set());

  const { matched, suggestions } = useMemo(() => {
    if (!visible) return { matched: undefined, suggestions: [] as string[] };
    const a = analyzeQuery(debounced);
    // Prefer concrete role variations (e.g. "banker" + Goldman → IB Analyst).
    // Fall back to industry-vague-to-roles suggestions (e.g. plain "tech"
    // → Software Engineer / Product Manager / Data Scientist) so users who
    // typed a broad industry term get pushed toward a PDL-routable role.
    if (a.role?.suggestions?.length) {
      return {
        matched: a.role.matched,
        suggestions: a.role.suggestions.slice(0, ROLE_LIMIT),
      };
    }
    if (a.industry?.suggestions?.length) {
      return {
        matched: a.industry.matched,
        suggestions: a.industry.suggestions.slice(0, ROLE_LIMIT),
      };
    }
    return { matched: undefined, suggestions: [] };
  }, [debounced, visible]);

  const matchedLower = matched ? matched.toLowerCase() : '';
  const pillsKey = suggestions.length > 0 ? `role:${suggestions.join('|')}` : '';
  const showPills =
    suggestions.length > 0 &&
    !!matched &&
    !!onAcceptSuggestion &&
    !dismissedMatches.has(matchedLower);

  return (
    <AnimatePresence initial={false}>
      {showPills && (
        <motion.div
          key={pillsKey}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: EASE }}
          style={{
            display: 'inline-flex',
            flexDirection: 'column',
            gap: 8,
            padding: '10px 14px 12px',
            background: '#FFFFFF',
            border: '1px solid rgba(37, 99, 235, 0.18)',
            borderRadius: 10,
            boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(37, 99, 235, 0.06)',
            maxWidth: '100%',
          }}
        >
          {/* Header row — TRY label + dismiss × on the right */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9.5,
                fontWeight: 600,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: 'var(--brand-blue, #2563EB)',
              }}
            >
              Try
            </span>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setDismissedMatches((prev) => {
                  const next = new Set(prev);
                  if (matched) next.add(matched.toLowerCase());
                  return next;
                });
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: 2,
                cursor: 'pointer',
                color: 'var(--ink-3, #8A8F9A)',
                display: 'inline-flex',
                alignItems: 'center',
                borderRadius: 4,
                transition: 'color .12s, background .12s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-2, #4A4F5B)';
                (e.currentTarget as HTMLButtonElement).style.background =
                  'rgba(15,23,42,0.04)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-3, #8A8F9A)';
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
              aria-label="Dismiss role variations"
            >
              <X style={{ width: 11, height: 11 }} />
            </button>
          </div>
          {/* Pills row */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              alignItems: 'center',
            }}
          >
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={(e) => {
                if (matched) onPreviewSuggestion?.(matched, suggestion);
                (e.currentTarget as HTMLButtonElement).style.background =
                  'rgba(59,130,246,0.16)';
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  'rgba(59,130,246,0.45)';
              }}
              onMouseLeave={(e) => {
                onClearPreview?.();
                (e.currentTarget as HTMLButtonElement).style.background =
                  'rgba(59,130,246,0.06)';
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  'rgba(59,130,246,0.22)';
              }}
              onClick={() => {
                if (matched && onAcceptSuggestion) {
                  onAcceptSuggestion(matched, suggestion);
                  onClearPreview?.();
                  // Dismiss both the original word AND the chosen swap so the
                  // card doesn't immediately reappear with sibling variations.
                  setDismissedMatches((prev) => {
                    const next = new Set(prev);
                    next.add(matched.toLowerCase());
                    next.add(suggestion.toLowerCase());
                    return next;
                  });
                }
              }}
              style={{
                background: 'rgba(59,130,246,0.06)',
                color: 'var(--brand-blue, #3B82F6)',
                border: '1px solid rgba(59,130,246,0.22)',
                padding: '4px 10px',
                borderRadius: 100,
                fontSize: 11,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
                transition: 'background .12s, border-color .12s',
              }}
            >
              {suggestion}
            </button>
          ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default RoleVariations;
