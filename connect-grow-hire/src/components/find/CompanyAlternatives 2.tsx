/**
 * Right-side sidebar that surfaces peer-firm alternatives when a company is detected
 * in the prompt. Sits OUTSIDE the prompt bubble; doesn't crowd the input.
 *
 * Hover any company to preview the swap in the prompt overlay; click to commit.
 *
 * Future hook for personalization: `getCompanyAlternatives` in `lib/specificity.ts`
 * is currently a static map. When richer user context (resume, year, target
 * industries) becomes available, the same function can re-rank or filter results
 * without changes here.
 */

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb } from 'lucide-react';
import useDebounce from '@/hooks/use-debounce';
import { analyzeQuery } from '@/lib/specificity';
import { useSchoolHometown } from '@/hooks/use-school-hometown';
import { useDetectedSchool } from '@/hooks/use-detected-school';
import { isThinPair } from '@/lib/thinPairs';

interface CompanyAlternativesProps {
  prompt: string;
  isSearching: boolean;
  hasResults: boolean;
  isLinkedIn: boolean;
  onAcceptSuggestion?: (originalMatched: string, chosen: string) => void;
  onPreviewSuggestion?: (originalMatched: string, chosen: string) => void;
  onClearPreview?: () => void;
  /** When industry-firm mode fires (no specific company in prompt), this handler
   *  is called with the raw company string to APPEND to the user's prompt rather
   *  than swap. Falls back to overwriting the prompt if not provided. */
  onAppendCompany?: (company: string) => void;
  /** Append a location string to the prompt (no swap - purely additive). */
  onAppendLocation?: (location: string) => void;
  /** Drives rail rotation. When the parent bumps the seed (e.g. on each Network
   *  click) the firms shuffle through their pools so the user sees fresh
   *  recommendations on repeated searches. */
  rotationSeed?: number;
  /** When true, the right rail stays visible after results have rendered - 
   *  lets users iterate on a query post-search and still see firm/location
   *  recommendations. */
  inputFocused?: boolean;
}

const EASE = [0.16, 1, 0.3, 1] as const;
const COMPANY_LIMIT = 4;

// Trim verbose location strings for sub-rail headings - "Los Angeles, CA" → "LA"
function shortLoc(loc: string): string {
  if (!loc) return '';
  const norm = loc.trim().toLowerCase();
  if (norm.startsWith('los angeles')) return 'LA';
  if (norm.startsWith('san francisco')) return 'SF';
  if (norm.startsWith('new york')) return 'NYC';
  if (norm.startsWith('washington')) return 'DC';
  if (norm.startsWith('hong kong')) return 'HK';
  // Default: take everything before the first comma, capitalized as in input.
  const first = loc.split(',')[0].trim();
  return first;
}

/** Sub-rail used for both "Similar Companies" / "Top in <Industry>" / "Common locations". */
const SubRail: React.FC<{
  heading: string;
  items: string[];
  onItemClick: (item: string) => void;
  onItemHover?: (item: string) => void;
  onItemLeave?: () => void;
}> = ({ heading, items, onItemClick, onItemHover, onItemLeave }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9,
        fontWeight: 500,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--ink-3, #8A8F9A)',
        marginBottom: 4,
        paddingLeft: 6,
      }}
    >
      <Lightbulb
        style={{
          width: 10,
          height: 10,
          color: 'var(--brand-blue, #3B82F6)',
        }}
      />
      {heading}
    </span>
    {items.map((item) => (
      <button
        key={item}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={(e) => {
          onItemHover?.(item);
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(59,130,246,0.10)';
        }}
        onMouseLeave={(e) => {
          onItemLeave?.();
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        }}
        onClick={() => onItemClick(item)}
        style={{
          background: 'transparent',
          border: 'none',
          padding: '5px 8px',
          cursor: 'pointer',
          color: 'var(--brand-blue, #3B82F6)',
          fontFamily: 'inherit',
          fontSize: 12,
          fontWeight: 500,
          textAlign: 'left',
          borderRadius: 4,
          transition: 'background .12s',
          lineHeight: 1.3,
        }}
      >
        {item}
      </button>
    ))}
  </div>
);

export const CompanyAlternatives: React.FC<CompanyAlternativesProps> = ({
  prompt,
  isSearching,
  hasResults,
  isLinkedIn,
  onAcceptSuggestion,
  onPreviewSuggestion,
  onClearPreview,
  onAppendCompany,
  onAppendLocation,
  rotationSeed = 0,
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
    return analyzeQuery(debounced, rotationSeed);
  }, [debounced, visible, rotationSeed]);

  const companyMatch = analysis?.company || null;
  const matched = companyMatch?.matched;

  // School we use for thin-pair lookup. Prefer the locally-detected school
  // (USC, Bocconi, etc.); the LLM-detected fallback (handles typos / regional
  // schools) is wired in below once the hooks resolve.
  const schoolForThinness = analysis?.school?.value || null;

  // Drop firms we already know return zero contacts for this school. Storage
  // is per-device localStorage; the lookup is O(1) per firm.
  const dropThinFirms = (firms: string[]): string[] =>
    firms.filter((f) => !isThinPair(schoolForThinness, f));

  const peerSuggestions = dropThinFirms(
    companyMatch?.suggestions?.slice(0, COMPANY_LIMIT * 2) ?? [],
  ).slice(0, COMPANY_LIMIT);

  // Mode 1: user typed a real company → peer firms (highest-priority firm rail)
  const showPeers = !!matched && peerSuggestions.length > 0 && !!onAcceptSuggestion;

  // Mode 2 (best): role + location detected → role-location curated firms
  const roleLocFirmsRaw = analysis?.roleLocationCompanies;
  const roleLocFirms = roleLocFirmsRaw
    ? { ...roleLocFirmsRaw, firms: dropThinFirms(roleLocFirmsRaw.firms) }
    : null;
  const showRoleLocFirms = !showPeers && !!roleLocFirms && roleLocFirms.firms.length > 0;

  // Mode 3: only role family detected → top firms in that industry
  const industryFirmsRaw = analysis?.industryFirms;
  const industryFirms = industryFirmsRaw
    ? { ...industryFirmsRaw, firms: dropThinFirms(industryFirmsRaw.firms) }
    : null;
  const showIndustryFirms =
    !showPeers && !showRoleLocFirms && !!industryFirms && industryFirms.firms.length > 0;

  // Mode 4: only school detected → top employers for that school
  const schoolEmployersRaw = analysis?.schoolEmployers;
  const schoolEmployers = schoolEmployersRaw
    ? { ...schoolEmployersRaw, firms: dropThinFirms(schoolEmployersRaw.firms) }
    : null;
  const showSchoolEmployers =
    !showPeers &&
    !showRoleLocFirms &&
    !showIndustryFirms &&
    !!schoolEmployers &&
    schoolEmployers.firms.length > 0;

  // Parallel: no location yet but role detected → suggest hiring locations.
  // Two LLM-backed hooks in tandem:
  //   1. useSchoolHometown(localSchoolName) - fires when local SCHOOL_ALIASES /
  //      universities.ts found a match; resolves its primary campus city.
  //   2. useDetectedSchool(prompt, skip) - fires when local detection FAILED
  //      (skip=false). Reads the prompt, asks an LLM if it names a school
  //      (handles typos, regional/international schools), returns the
  //      canonical name + hometown in one call.
  const localSchoolName = analysis?.school?.value || null;
  const userLocLower = analysis?.location?.value?.toLowerCase() || '';
  const llmHometownFromLocal = useSchoolHometown(localSchoolName);
  // Only fire the prompt-detection LLM call if local detection failed - saves cost.
  const llmDetected = useDetectedSchool(debounced, !!localSchoolName);
  // Pick whichever hometown is available - local-school hook wins, prompt-detection
  // hook fills in for missing/typo'd schools.
  const llmHometown = llmHometownFromLocal || (llmDetected?.formatted ?? null);

  const industryLocations = useMemo(() => {
    const base = analysis?.industryLocations;
    if (!base) return null;
    // If we have an LLM-resolved hometown that isn't already pinned at slot 0
    // (the static map's anchor), inject it as the new slot 0 and dedupe the rest.
    if (
      llmHometown &&
      llmHometown.toLowerCase() !== userLocLower &&
      base.locations[0]?.toLowerCase() !== llmHometown.toLowerCase()
    ) {
      const filtered = base.locations.filter(
        (l) => l.toLowerCase() !== llmHometown.toLowerCase(),
      );
      return {
        ...base,
        locations: [llmHometown, ...filtered].slice(0, 5),
      };
    }
    return base;
  }, [analysis?.industryLocations, llmHometown, userLocLower]);

  const showIndustryLocations = !!industryLocations && industryLocations.locations.length > 0;

  const showAnything =
    showPeers ||
    showRoleLocFirms ||
    showIndustryFirms ||
    showSchoolEmployers ||
    showIndustryLocations;
  if (!showAnything) {
    return <AnimatePresence initial={false} />;
  }

  return (
    <AnimatePresence initial={false}>
      <motion.div
        key="company-alts-rail"
        initial={{ opacity: 0, x: 6 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 6 }}
        transition={{ duration: 0.2, ease: EASE }}
        style={{
          width: 168,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          paddingTop: 4,
        }}
      >
        {showPeers && (
          <SubRail
            heading="Similar Companies"
            items={peerSuggestions}
            onItemClick={(item) => {
              if (matched && onAcceptSuggestion) {
                onAcceptSuggestion(matched, item);
                onClearPreview?.();
              }
            }}
            onItemHover={(item) => {
              if (matched) onPreviewSuggestion?.(matched, item);
            }}
            onItemLeave={() => onClearPreview?.()}
          />
        )}

        {showRoleLocFirms && (
          <SubRail
            heading={`${roleLocFirms!.roleLabel}s in ${shortLoc(roleLocFirms!.location)}`}
            items={roleLocFirms!.firms}
            onItemClick={(item) => onAppendCompany?.(item)}
          />
        )}

        {showIndustryFirms && (
          <SubRail
            heading={`Top in ${industryFirms!.industry}`}
            items={industryFirms!.firms}
            onItemClick={(item) => onAppendCompany?.(item)}
          />
        )}

        {showSchoolEmployers && (
          <SubRail
            heading={`Where ${schoolEmployers!.schoolLabel} alumni work`}
            items={schoolEmployers!.firms}
            onItemClick={(item) => onAppendCompany?.(item)}
          />
        )}

        {showIndustryLocations && (
          <SubRail
            heading={analysis?.location ? 'Also common in' : 'Common locations'}
            items={industryLocations!.locations}
            onItemClick={(item) => onAppendLocation?.(item)}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default CompanyAlternatives;
