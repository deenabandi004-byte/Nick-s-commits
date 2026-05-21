import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '@/services/api';

interface RecentTrojanSearchesProps {
  schoolShort: string | null;
  onSelect: (query: string) => void;
}

export const RecentTrojanSearches: React.FC<RecentTrojanSearchesProps> = ({ schoolShort, onSelect }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['recentSearches', schoolShort],
    queryFn: () => apiService.getRecentSearches(3, schoolShort || undefined),
    staleTime: 5 * 60 * 1000,
  });

  const items = data || [];

  // Hide entirely if no data and not loading
  if (!isLoading && items.length === 0) return null;

  const demonymLabel = schoolShort
    ? `WHAT OTHER ${schoolShort.toUpperCase()} STUDENTS ARE SEARCHING`
    : 'WHAT STUDENTS ARE SEARCHING';

  return (
    <div style={{ marginTop: 40 }}>
      {/* Section header */}
      <div style={{ marginBottom: 12 }}>
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
          {demonymLabel}
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
          This week&rsquo;s most-run prompts.
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div>
          {[1, 2, 3].map(i => (
            <div
              key={i}
              style={{
                padding: '10px 0',
                borderTop: '1px solid #EFEDE8',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 14, height: 14, background: 'var(--line-2, #F0F0ED)', borderRadius: 2 }} />
                <div style={{ width: 200 + i * 30, height: 13, background: 'var(--line-2, #F0F0ED)', borderRadius: 2 }} />
              </div>
              <div style={{ width: 100, height: 10, background: 'var(--line-2, #F0F0ED)', borderRadius: 2 }} />
            </div>
          ))}
        </div>
      )}

      {/* Rows */}
      {!isLoading && items.map((item, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelect(item.query)}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            padding: '10px 0',
            borderTop: '1px solid #EFEDE8',
            background: 'none',
            border: 'none',
            borderBottom: i === items.length - 1 ? 'none' : undefined,
            cursor: 'pointer',
            fontFamily: 'inherit',
            textAlign: 'left',
          }}
          className="recent-search-row"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#8A8F97', fontSize: 13 }}>&#x2315;</span>
            <span style={{ fontSize: 13, color: '#4A4F57' }}>{item.query}</span>
          </div>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              color: '#8A8F97',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              marginLeft: 12,
            }}
          >
            {item.count} {item.count === 1 ? 'student' : 'students'} this week
          </span>
        </button>
      ))}

      <style>{`
        .recent-search-row {
          border-top: 1px solid #EFEDE8 !important;
        }
        .recent-search-row:hover {
          background: var(--paper-2, #FAFBFF) !important;
        }
        .recent-search-row:focus-visible {
          outline: 2px solid var(--st-accent, #1B2A44);
          outline-offset: 2px;
        }
      `}</style>
    </div>
  );
};
