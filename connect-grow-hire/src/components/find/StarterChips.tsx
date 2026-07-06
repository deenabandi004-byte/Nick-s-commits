/**
 * StarterChips: the empty-state starter row inside the Find search card.
 *
 * A small segmented control (General / Consulting / Banking / Tech) plus one
 * row of chips. General mixes profile-aware plain examples (buildStarters)
 * with that category's fill-in-the-blank templates; the other categories show
 * their templates. Plain chips fill the search box with their text; template
 * chips insert the pattern with bracketed placeholders for the parent to
 * select and Tab through.
 */

import React, { useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { TemplateCategory, TemplatePart } from '@/data/searchTemplates';
import { buildStarters } from './QuickStarters';

interface StarterChipsProps {
  visible: boolean;
  categories: TemplateCategory[];
  onPickPlain: (prompt: string) => void;
  onPickTemplate: (pattern: string) => void;
  disabled?: boolean;
  schoolShort?: string;
  schoolFull?: string;
  targetFirms?: string[];
  targetIndustries?: string[];
  preferredLocations?: string[];
  extractedRoles?: string[];
}

const EASE = [0.16, 1, 0.3, 1] as const;

const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  background: 'var(--paper, #FFFFFF)',
  border: '1px solid var(--line, #E5E5E0)',
  borderRadius: 999,
  padding: '7px 14px',
  fontFamily: 'inherit',
  fontSize: 12.5,
  color: 'var(--ink-2, #4A4F5B)',
  cursor: 'pointer',
  transition: 'background .12s ease, border-color .12s ease',
};

const chipHover = (el: HTMLButtonElement, on: boolean) => {
  el.style.background = on ? 'var(--surface, #F5F6F8)' : 'var(--paper, #FFFFFF)';
  el.style.borderColor = on ? 'var(--primary-200, #B6C3E8)' : 'var(--line, #E5E5E0)';
};

function patternOf(parts: TemplatePart[]): string {
  return parts.map((p) => (typeof p === 'string' ? p : `[${p.placeholder}]`)).join('');
}

export const StarterChips: React.FC<StarterChipsProps> = ({
  visible,
  categories,
  onPickPlain,
  onPickTemplate,
  disabled,
  schoolShort,
  schoolFull,
  targetFirms,
  targetIndustries,
  preferredLocations,
  extractedRoles,
}) => {
  const [activeCat, setActiveCat] = useState(categories[0]?.id);
  const segRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const cat = categories.find((c) => c.id === activeCat) ?? categories[0];

  const plainStarters = useMemo(
    () =>
      buildStarters({
        schoolShort,
        schoolFull,
        targetFirms,
        targetIndustries,
        preferredLocations,
        extractedRoles,
      }).slice(0, 3),
    [schoolShort, schoolFull, targetFirms, targetIndustries, preferredLocations, extractedRoles],
  );

  if (!cat) return null;
  const showPlain = cat.id === categories[0]?.id;

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key="starter-chips"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: EASE }}
          style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {/* Segmented category control, arrow keys move the selection */}
          <div
            role="radiogroup"
            aria-label="Starter search categories"
            style={{
              display: 'inline-flex',
              alignSelf: 'flex-start',
              gap: 2,
              background: 'rgba(17,19,24,0.05)',
              borderRadius: 9,
              padding: 3,
            }}
          >
            {categories.map((c, i) => {
              const active = c.id === cat.id;
              return (
                <button
                  key={c.id}
                  ref={(el) => { segRefs.current[i] = el; }}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setActiveCat(c.id)}
                  onKeyDown={(e) => {
                    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                    e.preventDefault();
                    const dir = e.key === 'ArrowRight' ? 1 : -1;
                    const ni = (i + dir + categories.length) % categories.length;
                    setActiveCat(categories[ni].id);
                    segRefs.current[ni]?.focus();
                  }}
                  style={{
                    padding: '4px 11px',
                    borderRadius: 7,
                    border: 'none',
                    fontFamily: 'inherit',
                    fontSize: 12,
                    fontWeight: active ? 600 : 500,
                    cursor: 'pointer',
                    background: active ? 'var(--paper, #FFFFFF)' : 'transparent',
                    color: active ? 'var(--accent, #4A60A8)' : 'var(--ink-2, #4A4F5B)',
                    boxShadow: active ? '0 1px 2px rgba(17,19,24,0.08)' : 'none',
                    transition: 'background .12s ease, color .12s ease',
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>

          {/* One chip row: plain profile-aware examples plus fill-in templates */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {showPlain &&
              plainStarters.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={disabled}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickPlain(s)}
                  onMouseEnter={(e) => chipHover(e.currentTarget, true)}
                  onMouseLeave={(e) => chipHover(e.currentTarget, false)}
                  style={chipStyle}
                >
                  {s}
                </button>
              ))}
            {cat.templates.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPickTemplate(patternOf(t.parts))}
                onMouseEnter={(e) => chipHover(e.currentTarget, true)}
                onMouseLeave={(e) => chipHover(e.currentTarget, false)}
                aria-label={`Use template: ${patternOf(t.parts)}`}
                style={chipStyle}
              >
                {t.parts.map((p, i) =>
                  typeof p === 'string' ? (
                    <span key={i}>{p}</span>
                  ) : (
                    <span
                      key={`${p.key}-${i}`}
                      style={{
                        background: 'var(--primary-50, #EEF1F9)',
                        color: 'var(--accent, #4A60A8)',
                        borderRadius: 999,
                        padding: '1px 7px',
                        fontSize: 11.5,
                      }}
                    >
                      {p.placeholder}
                    </span>
                  ),
                )}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default StarterChips;
