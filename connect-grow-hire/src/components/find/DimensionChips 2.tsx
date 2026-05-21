/**
 * Dimension hints - horizontal row at the bottom-left of the search input wrapper.
 * Plain-text labels, no pills, four dimensions in fixed order.
 *
 * Role variations live in a separate component (`RoleVariations`) that renders
 * directly under the typed sentence - Grammarly-style. Company alternatives live
 * in the right sidebar (`CompanyAlternatives`).
 */

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useDebounce from '@/hooks/use-debounce';
import { analyzeQuery } from '@/lib/specificity';
import { useDetectedSchool } from '@/hooks/use-detected-school';

interface DimensionChipsProps {
  prompt: string;
  isSearching: boolean;
  hasResults: boolean;
  isLinkedIn: boolean;
  /** When true, intelligence stays visible even after results render - so users
   *  iterating on a prompt post-search still see chips. */
  inputFocused?: boolean;
}

type DimKey = 'role' | 'location' | 'company' | 'school' | 'industry';

const ORDER: DimKey[] = ['role', 'industry', 'location', 'company', 'school'];

const LABEL: Record<DimKey, string> = {
  role: 'ROLE',
  industry: 'INDUSTRY',
  location: 'LOCATION',
  company: 'COMPANY',
  school: 'SCHOOL',
};

const EASE = [0.16, 1, 0.3, 1] as const;

export const DimensionChips: React.FC<DimensionChipsProps> = ({
  prompt,
  isSearching,
  hasResults,
  isLinkedIn,
  inputFocused = false,
}) => {
  const debounced = useDebounce(prompt, 120);
  const trimmed = debounced.trim();
  const visible =
    trimmed.length >= 3 &&
    !isSearching &&
    !isLinkedIn &&
    (!hasResults || inputFocused);

  const analysis = useMemo(() => {
    if (!visible) return null;
    return analyzeQuery(debounced);
  }, [debounced, visible]);

  // Async LLM-backed school detection for prompts our static lexicon misses
  // (typos, missing US schools, international schools). Only fires when local
  // detection failed; result patches the SCHOOL chip when it returns.
  const llmSchool = useDetectedSchool(debounced, !!analysis?.school);

  const dims = useMemo(() => {
    if (!analysis) return null;
    // Patch the analysis with the LLM-detected school if local detection missed.
    const patched = { ...analysis };
    if (!patched.school && llmSchool?.detected && llmSchool.school) {
      patched.school = {
        value: llmSchool.school,
        matched: llmSchool.matched || llmSchool.school,
      };
    }
    // Industry is an opportunistic 5th dimension - only show its chip when
    // actually detected (otherwise the row gets visually crowded with "?"s).
    return ORDER.filter((key) => key !== 'industry' || patched.industry !== null).map(
      (key) => {
        // For school, append a "+N more" suffix to the value when extras exist
        if (key === 'school' && patched.school && patched.additionalSchools?.length) {
          const extras = patched.additionalSchools.length;
          return {
            key,
            match: {
              ...patched.school,
              value: `${patched.school.value} +${extras}`,
            },
          };
        }
        return { key, match: patched[key] };
      },
    );
  }, [analysis, llmSchool]);

  return (
    <AnimatePresence initial={false}>
      {visible && dims && (
        <motion.div
          key="dim-row"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.2, ease: EASE }}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'baseline' }}
        >
          {dims.map(({ key, match }) => {
            const detected = match !== null;
            const value = match?.value ?? null;
            return (
              <span
                key={key}
                style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}
              >
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 9,
                    fontWeight: 500,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--ink-3, #8A8F9A)',
                    opacity: detected ? 1 : 0.55,
                    transition: 'opacity .15s ease',
                  }}
                >
                  {LABEL[key]}
                </span>
                <span
                  style={{
                    fontFamily: 'inherit',
                    fontSize: 11,
                    fontWeight: 500,
                    color: detected ? 'var(--ink-2, #4A4F5B)' : 'var(--ink-3, #8A8F9A)',
                    opacity: detected ? 1 : 0.45,
                    transition: 'color .15s ease, opacity .15s ease',
                  }}
                >
                  {detected ? value : '?'}
                </span>
              </span>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DimensionChips;
