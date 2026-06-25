import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, ChevronUp, ArrowRight, Star } from 'lucide-react';
import posthog from '@/lib/posthog';
import { firebaseApi } from '@/services/firebaseApi';
import {
  type SuggestionChip, type UserContext, type RecommendedCompany,
  generateFirmDiscoveryChips,
  getDefaultPeopleChips, getDefaultFirmChips, isContextEmpty, EMPTY_CONTEXT,
  getRecommendedCompanies, getIndustryColor, shortUniversity, inferRoleLabel,
  getCompanyLogoUrl,
} from '@/utils/suggestionChips';

function CompanyLogo({ company }: { company: string; accentColor?: string }) {
  const [failed, setFailed] = useState(false);
  const logoUrl = getCompanyLogoUrl(company);
  const initial = company.charAt(0).toUpperCase();

  const tileStyle: React.CSSProperties = {
    width: 32, height: 32, borderRadius: 3,
    background: 'var(--paper-2, #FAFBFF)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  if (!logoUrl || failed) {
    return (
      <div style={{ ...tileStyle, color: 'var(--ink-2, #4A5058)', fontSize: 13, fontWeight: 600 }}>
        {initial}
      </div>
    );
  }

  return (
    <div style={tileStyle}>
      <img
        src={logoUrl}
        alt=""
        style={{ width: 24, height: 24, objectFit: 'contain' }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

interface SuggestionChipsProps {
  type: 'people' | 'companies';
  uid: string | undefined;
  onSelect: (prompt: string) => void;
  onSchoolAffinitySelect?: (university: string, field: string) => void;
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  hasSearched: boolean;
  disabled?: boolean;
  accentColor?: string;
}

// Fallback chip rendering for users with no profile data
function FallbackChips({
  chips, type, onSelect, disabled,
}: {
  chips: SuggestionChip[];
  type: string;
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
      {chips.map(chip => {
        const isSelected = selectedId === chip.id;
        return (
          <button
            key={chip.id}
            type="button"
            disabled={disabled}
            onClick={() => {
              setSelectedId(chip.id);
              // TODO(#13): PostHog was reset and never re-configured. This event fired
              // into a void. Rewire through /api/metrics/events or replacement analytics
              // system per https://github.com/deenabandi004-byte/Final_offerloop/issues/13
              // <ORIGINAL CALL COMMENTED BELOW>
              // posthog.capture('suggestion_chip_clicked', { chip_id: chip.id, category: chip.category, label: chip.label, tab: type });
              onSelect(chip.prompt);
              setTimeout(() => setSelectedId(null), 300);
            }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 11px', fontSize: 11.5, borderRadius: 100,
              cursor: 'pointer', transition: 'all .12s', fontFamily: 'inherit',
              maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              border: `1px solid ${isSelected ? 'var(--accent, #4A60A8)' : 'var(--line, #E5E5E0)'}`,
              background: isSelected ? 'var(--accent, #4A60A8)' : 'var(--paper-2, #FAFBFF)',
              color: isSelected ? '#fff' : 'var(--ink-2, #4A4F5B)',
            }}
            onMouseEnter={e => {
              if (!isSelected) {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--primary-200, #B6C3E8)';
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface, #F5F6F8)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink, #111318)';
              }
            }}
            onMouseLeave={e => {
              if (!isSelected) {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--line, #E5E5E0)';
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--paper-2, #FAFBFF)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-2, #4A4F5B)';
              }
            }}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}

const SuggestionChips: React.FC<SuggestionChipsProps> = ({
  type, uid, onSelect, onSchoolAffinitySelect, collapsed, onCollapse, hasSearched, disabled,
}) => {
  const [userCtx, setUserCtx] = useState<UserContext>(EMPTY_CONTEXT);
  const [recommendations, setRecommendations] = useState<RecommendedCompany[]>([]);
  const [firmDiscoveryChips, setFirmDiscoveryChips] = useState<SuggestionChip[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const prevHasSearched = useRef(hasSearched);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch user onboarding data
  useEffect(() => {
    if (!uid) { setLoaded(true); return; }
    firebaseApi.getUserOnboardingData(uid).then(data => {
      setUserCtx(data);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [uid]);

  // Generate recommendations when context loads
  useEffect(() => {
    if (!loaded) return;
    if (!isContextEmpty(userCtx)) {
      setRecommendations(getRecommendedCompanies(userCtx));
      setFirmDiscoveryChips(generateFirmDiscoveryChips(userCtx));
    }
  }, [loaded, userCtx]);

  const schoolColor = 'var(--accent, #4A60A8)';

  // Auto-collapse after first search
  useEffect(() => {
    if (!prevHasSearched.current && hasSearched) {
      onCollapse(true);
      // TODO(#13): PostHog was reset and never re-configured. This event fired
      // into a void. Rewire through /api/metrics/events or replacement analytics
      // system per https://github.com/deenabandi004-byte/Final_offerloop/issues/13
      // <ORIGINAL CALL COMMENTED BELOW>
      // posthog.capture('suggestions_collapsed', { tab: type, trigger: 'auto' });
    }
    prevHasSearched.current = hasSearched;
  }, [hasSearched, onCollapse, type]);

  const toggleCollapse = useCallback(() => {
    const next = !collapsed;
    onCollapse(next);
    // TODO(#13): PostHog was reset and never re-configured. This event fired
    // into a void. Rewire through /api/metrics/events or replacement analytics
    // system per https://github.com/deenabandi004-byte/Final_offerloop/issues/13
    // <ORIGINAL CALL COMMENTED BELOW>
    // posthog.capture(next ? 'suggestions_collapsed' : 'suggestions_expanded', { tab: type, ...(next ? { trigger: 'manual' } : {}) });
  }, [collapsed, onCollapse, type]);

  const handleCardClick = useCallback((company: RecommendedCompany) => {
    // TODO(#13): PostHog was reset and never re-configured. This event fired
    // into a void. Rewire through /api/metrics/events or replacement analytics
    // system per https://github.com/deenabandi004-byte/Final_offerloop/issues/13
    // <ORIGINAL CALL COMMENTED BELOW>
    // posthog.capture('recommendation_card_clicked', {
    //   company: company.company, industry: company.industry, score: company.score, tab: type,
    // });
    if (type === 'people') {
      const uni = shortUniversity(userCtx.university);
      const loc = userCtx.preferredLocations[0] || '';
      const role = inferRoleLabel(userCtx, company.industry);

      if (uni) {
        // e.g. "USC alumni working as data scientists at Google in Los Angeles"
        const parts = [`${uni} alumni`];
        if (role) parts.push(`working as ${role}`);
        parts.push(`at ${company.company}`);
        if (loc) parts.push(`in ${loc}`);
        onSelect(parts.join(' '));
      } else {
        // e.g. "data scientists at Google in Los Angeles"
        const parts: string[] = [];
        if (role) parts.push(`${role} at ${company.company}`);
        else parts.push(company.company);
        if (loc) parts.push(`in ${loc}`);
        onSelect(parts.join(' '));
      }
    } else {
      onSelect(company.company);
    }
  }, [onSelect, type, userCtx]);

  // If no profile data, fall back to default chips
  const useCards = !isContextEmpty(userCtx) && recommendations.length > 0;
  // Companies tab uses discovery text pills, not company cards
  const useFirmDiscovery = type === 'companies' && !isContextEmpty(userCtx) && firmDiscoveryChips.length > 0;

  if (!loaded) return null;

  // Collapsed state
  if (collapsed) {
    return (
      <button
        onClick={toggleCollapse}
        aria-expanded={false}
        aria-controls="suggestion-chips"
        aria-label="Toggle personalized suggestions"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', fontSize: 11, color: 'var(--ink-3, #8A8F9A)',
          background: 'none', border: '1px solid var(--line, #E5E5E0)', borderRadius: 100,
          cursor: 'pointer', transition: 'all .12s', fontFamily: 'inherit',
          marginBottom: 16,
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent, #4A60A8)'; e.currentTarget.style.borderColor = 'var(--accent, #4A60A8)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--ink-3, #8A8F9A)'; e.currentTarget.style.borderColor = 'var(--line, #E5E5E0)'; }}
      >
        Suggestions
        <ChevronDown className="h-3 w-3" />
      </button>
    );
  }

  // No profile → fallback chips
  if (!useCards && !useFirmDiscovery) {
    const defaults = type === 'people' ? getDefaultPeopleChips(userCtx.university) : getDefaultFirmChips(userCtx.university);
    return (
      <div id="suggestion-chips" style={{ marginBottom: 20 }}>
        <FallbackChips chips={defaults} type={type} onSelect={onSelect} disabled={disabled} />
      </div>
    );
  }

  // Companies tab with profile data → clean discovery suggestions
  if (useFirmDiscovery) {
    return (
      <div id="suggestion-chips" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-2, #4A4F5B)', letterSpacing: '0.01em' }}>
            Here's where to start
          </span>
          <button
            onClick={toggleCollapse}
            style={{
              fontSize: 11, color: 'var(--ink-3, #8A8F9A)', background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex',
              alignItems: 'center', gap: 3, padding: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent, #4A60A8)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-3, #8A8F9A)'; }}
          >
            Collapse
            <ChevronUp className="h-3 w-3" />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {firmDiscoveryChips.map((chip, idx) => {
            const isFirst = idx === 0;
            return (
              <button
                key={chip.id}
                type="button"
                disabled={disabled}
                onClick={() => {
                  // TODO(#13): PostHog was reset and never re-configured. This event fired
                  // into a void. Rewire through /api/metrics/events or replacement analytics
                  // system per https://github.com/deenabandi004-byte/Final_offerloop/issues/13
                  // <ORIGINAL CALL COMMENTED BELOW>
                  // posthog.capture('suggestion_chip_clicked', { chip_id: chip.id, category: chip.category, label: chip.label, tab: type });
                  if (chip.prompt.startsWith('__school_affinity__') && onSchoolAffinitySelect) {
                    const parts = chip.prompt.split('__').filter(Boolean);
                    const university = parts[1] || '';
                    const field = parts[2] || '';
                    onSchoolAffinitySelect(university, field);
                  } else {
                    onSelect(chip.prompt);
                  }
                }}
                className="suggestion-row-enter"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: isFirst ? '14px 14px 14px 14px' : '10px 14px',
                  background: 'var(--paper-2, #FAFBFF)',
                  borderTop: '1px solid var(--line, #E5E5E0)',
                  borderRight: '1px solid var(--line, #E5E5E0)',
                  borderBottom: '1px solid var(--line, #E5E5E0)',
                  borderLeft: '2px solid transparent',
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'all .15s ease',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  animationDelay: `${idx * 50}ms`,
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.background = 'var(--surface, #F5F6F8)';
                  el.style.borderColor = 'var(--primary-200, #B6C3E8)';
                  el.style.borderLeftColor = schoolColor;
                  el.style.boxShadow = 'var(--shadow-sm, 0 1px 3px rgba(17,19,24,0.06))';
                  el.style.paddingLeft = '18px';
                  const arrow = el.querySelector('.suggestion-arrow') as HTMLElement;
                  if (arrow) arrow.style.transform = 'translateX(4px)';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.background = 'var(--paper-2, #FAFBFF)';
                  el.style.borderTop = '1px solid var(--line, #E5E5E0)';
                  el.style.borderRight = '1px solid var(--line, #E5E5E0)';
                  el.style.borderBottom = '1px solid var(--line, #E5E5E0)';
                  el.style.borderLeft = '2px solid transparent';
                  el.style.boxShadow = 'none';
                  el.style.paddingLeft = '14px';
                  const arrow = el.querySelector('.suggestion-arrow') as HTMLElement;
                  if (arrow) arrow.style.transform = 'translateX(0)';
                }}
              >
                <span style={{
                  fontSize: 13.5, fontWeight: isFirst ? 600 : 500, color: 'var(--ink, #111318)',
                  lineHeight: 1.4, flex: 1,
                }}>
                  {chip.label}
                </span>
                {isFirst && (
                  <span style={{
                    fontSize: 10, fontWeight: 500, color: '#92400E',
                    background: '#FFF3CD', border: '1px solid #FDEAB0',
                    padding: '2px 6px', borderRadius: 4,
                    whiteSpace: 'nowrap', marginLeft: 8,
                  }}>
                    Best match
                  </span>
                )}
                <ArrowRight className="suggestion-arrow" style={{ width: 13, height: 13, color: 'var(--ink-3, #8A8F9A)', flexShrink: 0, marginLeft: isFirst ? 8 : 12, transition: 'transform .15s ease' }} />
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginTop: 16,
        }}>
          <div style={{ flex: 1, height: 1, background: 'var(--line-2, #F0F0ED)' }} />
          <span style={{ fontSize: 11, color: 'var(--ink-3, #8A8F9A)', whiteSpace: 'nowrap' }}>Have somewhere in mind?</span>
          <div style={{ flex: 1, height: 1, background: 'var(--line-2, #F0F0ED)' }} />
        </div>
      </div>
    );
  }

  // Build subtitle from profile — prefer richer signals if present
  const uni = shortUniversity(userCtx.university);
  const targetFirmHint =
    userCtx.targetFirms && userCtx.targetFirms.length > 0
      ? `${userCtx.targetFirms.length} target firm${userCtx.targetFirms.length === 1 ? '' : 's'}`
      : '';
  const industryHint = userCtx.targetIndustries[0] || '';
  const locHint = userCtx.preferredLocations[0] || '';
  const subtitleParts = [uni, industryHint, targetFirmHint || locHint].filter(Boolean);
  const subtitle = subtitleParts.join(' · ');

  const visibleCards = showMore ? recommendations : recommendations.slice(0, 5);
  const ctaLabel = type === 'people' ? 'Find contacts' : 'Search company';

  return (
    <div id="suggestion-chips" style={{ marginBottom: 20 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--ink-3, #8A8F9A)', fontFamily: "'Libre Baskerville', Georgia, serif" }}>
          Recommended for you
        </span>
        <button
          onClick={toggleCollapse}
          style={{
            fontSize: 11, color: 'var(--ink-3, #8A8F9A)', background: 'none', border: 'none',
            cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex',
            alignItems: 'center', gap: 3, padding: 0,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent, #4A60A8)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-3, #8A8F9A)'; }}
        >
          Collapse
          <ChevronUp className="h-3 w-3" />
        </button>
      </div>

      {/* Subtitle */}
      {subtitle && (
        <div style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 11.5, color: 'var(--ink-2, #4A4F5B)' }}>{subtitle}</span>
        </div>
      )}

      {/* Horizontal scroll card row */}
      <div
        ref={scrollRef}
        style={{
          display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6,
          scrollbarWidth: 'none',
        }}
      >
        {visibleCards.map((rec, idx) => {
          const accentColor = getIndustryColor(rec.industry);
          return (
            <button
              key={rec.company}
              type="button"
              disabled={disabled}
              onClick={() => handleCardClick(rec)}
              className="suggestion-row-enter"
              style={{
                flex: '0 0 160px', width: 160,
                borderRadius: 16, overflow: 'hidden',
                background: 'var(--elev, #FFFFFF)',
                border: rec.isTargetFirm
                  ? '1px solid rgba(74, 96, 168, 0.35)'
                  : '1px solid var(--line, #E8E8E8)',
                cursor: 'pointer', textAlign: 'left',
                transition: 'all .2s ease',
                fontFamily: 'inherit', padding: 0,
                boxShadow: rec.isTargetFirm
                  ? 'inset 0 -1px 0 rgba(74, 96, 168, 0.18), 0 1px 2px rgba(74, 96, 168, 0.08)'
                  : 'inset 0 -1px 0 var(--line, #E8E8E8), 0 1px 2px rgba(26,29,35,0.03)',
                animationDelay: `${idx * 60}ms`,
                position: 'relative',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.borderColor = 'var(--accent, #4A60A8)';
                el.style.boxShadow = 'inset 0 -1px 0 var(--line, #E8E8E8), 0 2px 6px rgba(26,29,35,0.06)';
                el.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.borderColor = rec.isTargetFirm
                  ? 'rgba(74, 96, 168, 0.35)'
                  : 'var(--line, #E8E8E8)';
                el.style.boxShadow = rec.isTargetFirm
                  ? 'inset 0 -1px 0 rgba(74, 96, 168, 0.18), 0 1px 2px rgba(74, 96, 168, 0.08)'
                  : 'inset 0 -1px 0 var(--line, #E8E8E8), 0 1px 2px rgba(26,29,35,0.03)';
                el.style.transform = 'translateY(0)';
              }}
            >
              {/* "Yours" pin for explicit target firms */}
              {rec.isTargetFirm && (
                <div
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '2px 6px',
                    borderRadius: 100,
                    background: 'rgba(74, 96, 168, 0.10)',
                    color: 'var(--primary-600, #4C62A8)',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 8.5,
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    pointerEvents: 'none',
                  }}
                >
                  <Star style={{ width: 8, height: 8, fill: 'var(--primary-600, #4C62A8)' }} strokeWidth={0} />
                  Yours
                </div>
              )}
              {/* Card body */}
              <div style={{ padding: '12px 14px 14px' }}>
                {/* Logo */}
                <div style={{ marginBottom: 10 }}>
                  <CompanyLogo company={rec.company} accentColor={accentColor} />
                </div>

                {/* Company name */}
                <div style={{
                  fontSize: 13.5, fontWeight: 500, color: 'var(--ink, #111318)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  marginBottom: 4,
                }}>
                  {rec.company}
                </div>

                {/* Reason */}
                <div style={{
                  fontSize: 11, color: 'var(--ink-2, #4A4F5B)', lineHeight: 1.4,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden', minHeight: 30,
                  marginBottom: rec.reasoning ? 6 : 10,
                }}>
                  {rec.reason}
                </div>

                {/* Why this company — reasoning hint */}
                {rec.reasoning && (
                  <div style={{
                    fontSize: 11, padding: '6px 8px',
                    background: 'var(--paper, #FFFFFF)',
                    borderLeft: '2px solid var(--accent, #1B2A44)',
                    borderRadius: '0 4px 4px 0',
                    marginBottom: 10,
                    lineHeight: 1.4,
                  }}>
                    {/* Number intentionally omitted — only show it once a
                        real data source backs the count. */}
                    {typeof rec.reasoning.primary.number === 'number' && (
                      <>
                        <span style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontWeight: 600,
                          color: 'var(--accent, #1B2A44)',
                        }}>
                          {rec.reasoning.primary.number}
                        </span>
                        {' '}
                      </>
                    )}
                    <span style={{ color: 'var(--ink-2, #4A4F5B)' }}>
                      {rec.reasoning.primary.label}
                    </span>
                    {rec.reasoning.qualifier && (
                      <>
                        <span style={{ color: 'var(--ink-3, #8A8F9A)', margin: '0 4px' }}>&middot;</span>
                        <em style={{
                          fontFamily: "'Libre Baskerville', Georgia, serif",
                          fontStyle: 'italic',
                          color: 'var(--ink-2, #4A4F5B)',
                        }}>
                          {rec.reasoning.qualifier}
                        </em>
                      </>
                    )}
                  </div>
                )}

                {/* CTA */}
                <div style={{
                  fontSize: 11, color: 'var(--accent, #4A60A8)', fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  {ctaLabel}
                  <ArrowRight style={{ width: 11, height: 11, opacity: 0.7 }} />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Show more button */}
      {recommendations.length > 5 && !showMore && (
        <button
          type="button"
          onClick={() => setShowMore(true)}
          style={{
            fontSize: 11.5, color: 'var(--ink-2, #4A4F5B)', background: 'none', border: 'none',
            cursor: 'pointer', fontFamily: 'inherit', padding: '8px 0 0',
            transition: 'color .12s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent, #4A60A8)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-2, #4A4F5B)'; }}
        >
          Show more companies
        </button>
      )}

    </div>
  );
};

export default SuggestionChips;
