import React, { useMemo } from 'react';
import type { UserContext } from '@/utils/suggestionChips';
import { buildPromptGallery } from '@/utils/promptGallery';
import { PromptCard } from './PromptCard';
interface PromptGalleryProps {
  ctx: UserContext | null;
  onSelect: (prompt: string) => void;
  onUpdatePreferences: () => void;
  dimmed?: boolean;
}

export const PromptGallery: React.FC<PromptGalleryProps> = ({ ctx, onSelect, onUpdatePreferences, dimmed }) => {
  const weekSeed = useMemo(() => Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)), []);

  const gallery = useMemo(() => {
    if (!ctx) return null;
    return buildPromptGallery(ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.university, ctx?.targetIndustries?.join(','), ctx?.careerTrack, ctx?.preferredJobRole, weekSeed]);

  if (!gallery) return null;

  const { tier, items } = gallery;

  const firstName = ctx?.firstName || '';
  const industry = ctx?.targetIndustries?.[0] || '';

  let eyebrow: string;
  let title: string;
  let linkText: string;

  if (tier === 1) {
    eyebrow = 'BUILT FROM YOUR PROFILE';
    const nameSlug = firstName ? `, ${firstName.toLowerCase()}` : '';
    const industrySlug = industry ? ` ${industry.toLowerCase()}` : '';
    title = `Six places to look first${nameSlug}${industrySlug}.`;
    linkText = 'Update preferences \u2197';
  } else if (tier === 2) {
    eyebrow = 'BUILT FROM YOUR PROFILE';
    title = 'Six places to look first.';
    linkText = 'Update preferences \u2197';
  } else {
    eyebrow = 'CURATED BY OFFERLOOP';
    title = 'Six strong starting points.';
    linkText = 'Tell us about yourself \u2197';
  }

  return (
    <div
      style={{
        marginTop: 36,
        transition: 'opacity 0.15s ease',
        opacity: dimmed ? 0.4 : 1,
      }}
    >
      {/* Section header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9.5,
              letterSpacing: '0.08em',
              textTransform: 'uppercase' as const,
              color: '#8A8F97',
              marginBottom: 4,
            }}
          >
            {eyebrow}
          </div>
          <div
            style={{
              fontFamily: "var(--serif, 'Instrument Serif', Georgia, serif)",
              fontStyle: 'italic',
              fontSize: 18,
              color: 'var(--ink, #111418)',
              lineHeight: 1.3,
            }}
          >
            {title}
          </div>
        </div>
        <button
          type="button"
          onClick={onUpdatePreferences}
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: '#4A4F57',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            padding: 0,
            marginTop: 2,
          }}
        >
          {linkText}
        </button>
      </div>

      {/* Tier 3 nudge */}
      {tier === 3 && (
        <div
          style={{
            fontFamily: "var(--serif, 'Instrument Serif', Georgia, serif)",
            fontStyle: 'italic',
            fontSize: 13,
            color: 'var(--ink-2, #4A4F57)',
            padding: '10px 14px',
            background: 'var(--paper-2, #FAFBFF)',
            border: '1px solid var(--line, #E5E3DE)',
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          Add your school and target industries to get prompts shaped around you.
        </div>
      )}

      {/* 2-col grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
        }}
      >
        {items.map((item, i) => (
          <PromptCard key={i} item={item} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
};
