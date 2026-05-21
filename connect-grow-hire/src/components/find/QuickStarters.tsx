/**
 * QuickStarters - quiet floating examples below the search input.
 *
 * Goal: eliminate cold-start fog without crowding the page. Renders as a single
 * line of comma/middot-separated clickable text examples in muted ink. No pill
 * chrome, no border, no header banner. Reads as "here are some you could try"
 * rather than a prominent UI block. Disappears the moment the user types.
 *
 * Each example is profile-aware - built from the user's school, target firms,
 * target industries, extracted roles, and preferred locations.
 */

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface QuickStartersProps {
  visible: boolean;
  onPick: (prompt: string) => void;
  schoolShort?: string;
  schoolFull?: string;
  targetFirms?: string[];
  targetIndustries?: string[];
  preferredLocations?: string[];
  extractedRoles?: string[];
}

const EASE = [0.16, 1, 0.3, 1] as const;

function buildStarters({
  schoolShort,
  schoolFull,
  targetFirms = [],
  targetIndustries = [],
  preferredLocations = [],
  extractedRoles = [],
}: Omit<QuickStartersProps, 'visible' | 'onPick'>): string[] {
  const starters: string[] = [];
  const school = schoolShort || schoolFull || '';
  const firm = targetFirms[0];
  const firm2 = targetFirms[1];
  const industry = targetIndustries[0];
  const role = extractedRoles[0];
  const loc = preferredLocations[0];

  if (school && firm) starters.push(`${school} alumni at ${firm}`);
  if (role && loc) starters.push(`${role}s in ${loc}`);
  else if (role) starters.push(`${role}s in New York, NY`);
  if (school && industry) starters.push(`${school} grads in ${industry}`);
  if (firm) starters.push(`Hiring managers at ${firm}`);
  else if (industry) starters.push(`Hiring managers in ${industry}`);
  if (school && firm2) starters.push(`${school} alumni at ${firm2}`);

  if (starters.length < 3) {
    if (school && !starters.some((s) => s.includes(school))) {
      starters.push(`${school} alumni in finance`);
    }
    starters.push('Investment Banking Analysts in New York, NY');
    starters.push('Software Engineers at Google');
  }

  // Dedupe + cap at 4
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const s of starters) {
    const k = s.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(s);
    }
    if (unique.length >= 4) break;
  }
  return unique;
}

export const QuickStarters: React.FC<QuickStartersProps> = ({
  visible,
  onPick,
  schoolShort,
  schoolFull,
  targetFirms,
  targetIndustries,
  preferredLocations,
  extractedRoles,
}) => {
  const starters = useMemo(
    () =>
      buildStarters({
        schoolShort,
        schoolFull,
        targetFirms,
        targetIndustries,
        preferredLocations,
        extractedRoles,
      }),
    [
      schoolShort,
      schoolFull,
      targetFirms,
      targetIndustries,
      preferredLocations,
      extractedRoles,
    ],
  );

  return (
    <AnimatePresence initial={false}>
      {visible && starters.length > 0 && (
        <motion.div
          key="quick-starters"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: EASE }}
          style={{
            marginTop: 10,
            paddingLeft: 4,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'baseline',
            gap: 4,
            fontSize: 12.5,
            color: 'var(--ink-3, #94A3B8)',
            lineHeight: 1.7,
          }}
        >
          <span style={{ marginRight: 2, color: 'var(--ink-3, #94A3B8)' }}>
            Try
          </span>
          {starters.map((s, i) => (
            <React.Fragment key={s}>
              <button
                type="button"
                // Prevent focus from leaving the search input when this is clicked - 
                // we want the click to feel like the user just typed the seed in,
                // and the rest of the pipeline (chips, sidebar, ghost) needs the
                // input to stay focused.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPick(s)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  margin: 0,
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  color: 'var(--ink-2, #475569)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textDecorationColor: 'rgba(15, 23, 42, 0.12)',
                  textUnderlineOffset: 3,
                  transition: 'color .12s ease, text-decoration-color .12s ease',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.color = 'var(--brand-blue, #2563EB)';
                  el.style.textDecorationColor = 'rgba(37, 99, 235, 0.45)';
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.color = 'var(--ink-2, #475569)';
                  el.style.textDecorationColor = 'rgba(15, 23, 42, 0.12)';
                }}
              >
                {s}
              </button>
              {i < starters.length - 1 && (
                <span style={{ color: 'var(--ink-3, #94A3B8)' }}>·</span>
              )}
            </React.Fragment>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default QuickStarters;
