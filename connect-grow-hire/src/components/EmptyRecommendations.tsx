/**
 * EmptyRecommendations: Phase 5 of the Personalization Data Layer.
 *
 * The dashboard's recommendation surface. Per section 15 number 7, this
 * component MUST NOT show "no recommendations yet". The backend's
 * rank_contacts already tops up with synthetic seeded picks when the
 * saved-contact pool is thin, so a confirmed-profile user always gets
 * at least three results back. The only path to a zero state is a user
 * with no school AND no targetCompanies AND no targetIndustries: in
 * that case we surface a CTA pointing at /onboarding.
 *
 * Maturity-aware copy (section 15 number 7):
 *   - profile-seeded: "Top alumni picks based on your profile"
 *   - mixed:          "Picked from people like you"
 *   - steady:         "Your network at a glance"
 *
 * Events fired:
 *   - dashboard_recommendation_viewed: once on mount when a non-empty
 *     list is rendered.
 *   - dashboard_recommendation_clicked: per-card click.
 *
 * The component is a no-op when VITE_RECOMMENDATIONS_ENABLED is false:
 * callers can mount it unconditionally and the flag short-circuits.
 *
 * Component does NOT navigate to /onboarding directly. The CTA renders
 * a Link the user clicks; the parent app's router handles the route.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, GraduationCap, Sparkles, Users } from 'lucide-react';
import { getAuth } from 'firebase/auth';

import { useEventLogger } from '@/hooks/useEventLogger';
import { API_BASE_URL } from '@/services/api';
import { RECOMMENDATIONS_ENABLED } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface RankedContactDTO {
  contactId: string;
  score: number;
  rationale: string;
  predictedOutcome: null;
  pathSimilarityScore: number | null;
  display?: {
    kind?: 'seed' | 'saved';
    name?: string | null;
    title?: string | null;
    company?: string | null;
    school?: string | null;
    industry?: string | null;
  };
}

interface RecommendationsResponse {
  enabled: boolean;
  contacts: RankedContactDTO[];
}

type Maturity = 'profile-seeded' | 'mixed' | 'steady';

function pickMaturity(items: RankedContactDTO[]): Maturity {
  if (!items.length) return 'profile-seeded';
  const seedCount = items.filter((c) => c.display?.kind === 'seed').length;
  const ratio = seedCount / items.length;
  if (ratio >= 0.8) return 'profile-seeded';
  if (ratio >= 0.3) return 'mixed';
  return 'steady';
}

const MATURITY_COPY: Record<Maturity, { title: string; subtitle: string }> = {
  'profile-seeded': {
    title: 'Top alumni picks based on your profile',
    subtitle: 'Synthesized from your school and target companies. Save a few to sharpen this list.',
  },
  mixed: {
    title: 'Picked from people like you',
    subtitle: 'Blending your saved contacts with seeded suggestions.',
  },
  steady: {
    title: 'Your network at a glance',
    subtitle: 'Ranked from your saved contacts and recent activity.',
  },
};

export interface EmptyRecommendationsProps {
  className?: string;
  /** Cap on rendered cards (defaults to 6). The API caps at 50 server-side. */
  limit?: number;
  /** Optional click handler; default is to log the event (no nav). */
  onContactClick?: (contact: RankedContactDTO) => void;
}

export function EmptyRecommendations({
  className,
  limit = 6,
  onContactClick,
}: EmptyRecommendationsProps) {
  const { logEvent } = useEventLogger();
  const [items, setItems] = useState<RankedContactDTO[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLoggedView, setHasLoggedView] = useState<boolean>(false);

  useEffect(() => {
    if (!RECOMMENDATIONS_ENABLED) {
      setLoading(false);
      setItems([]);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function fetchRecs() {
      try {
        const auth = getAuth();
        const token = await auth.currentUser?.getIdToken();
        if (!token) {
          if (!cancelled) {
            setItems([]);
            setLoading(false);
          }
          return;
        }
        const res = await fetch(
          `${API_BASE_URL}/recommendations/contacts?limit=${limit}`,
          {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          },
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as RecommendationsResponse;
        if (cancelled) return;
        setItems(data.contacts || []);
      } catch (err) {
        if (cancelled) return;
        if ((err as Error).name === 'AbortError') return;
        setError((err as Error).message || 'failed to load recommendations');
        setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchRecs();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [limit]);

  const maturity = useMemo(() => pickMaturity(items || []), [items]);

  useEffect(() => {
    if (hasLoggedView) return;
    if (!items || items.length === 0) return;
    logEvent('dashboard_recommendation_viewed', {
      surface: 'dashboard.empty_recommendations',
    });
    setHasLoggedView(true);
  }, [items, hasLoggedView, logEvent]);

  if (!RECOMMENDATIONS_ENABLED) {
    return null;
  }

  if (loading) {
    return (
      <section className={cn('rounded-[3px] border border-[#E2E8F0] bg-white p-6', className)}>
        <div className="h-5 w-56 animate-pulse rounded bg-[#F1F5F9]" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded bg-[#F8FAFC]" />
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-[88px] animate-pulse rounded-[3px] border border-[#E2E8F0] bg-[#FAFBFF]"
            />
          ))}
        </div>
      </section>
    );
  }

  if (!items || items.length === 0) {
    return (
      <section
        className={cn(
          'rounded-[3px] border border-[#E2E8F0] bg-gradient-to-br from-white to-[#FAFBFF] p-6',
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[3px] bg-[#3B82F6]/10 text-[#3B82F6]">
            <Sparkles size={18} />
          </div>
          <div className="flex-1">
            <h3 className="text-[15px] font-semibold text-[#0F172A]">
              Tell us a bit about your goals to get picks
            </h3>
            <p className="mt-1 text-sm text-[#475569]">
              Add your school and target companies and we will pull alumni picks
              tuned to where you want to land.
            </p>
            <Link
              to="/onboarding"
              className="mt-4 inline-flex items-center gap-2 rounded-[3px] bg-[#3B82F6] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30"
            >
              Finish setting up your profile
              <ArrowRight size={14} />
            </Link>
            {error ? (
              <p className="mt-3 text-xs text-[#94A3B8]">
                ({error}; try refreshing in a moment.)
              </p>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  const copy = MATURITY_COPY[maturity];

  return (
    <section
      className={cn(
        'rounded-[3px] border border-[#E2E8F0] bg-white p-6',
        className,
      )}
      data-testid="empty-recommendations"
      data-maturity={maturity}
    >
      <header className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-[#0F172A]">{copy.title}</h3>
          <p className="mt-1 text-sm text-[#475569]">{copy.subtitle}</p>
        </div>
        <span className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-[#3B82F6]/10 px-2 py-0.5 text-[11px] font-medium text-[#3B82F6]">
          <Sparkles size={11} /> Personalized
        </span>
      </header>

      <ul className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {items.slice(0, limit).map((c) => (
          <RecommendationCard
            key={c.contactId}
            contact={c}
            onClick={() => {
              logEvent('dashboard_recommendation_clicked', {
                surface: 'dashboard.empty_recommendations',
                recommendationId: c.contactId,
              });
              onContactClick?.(c);
            }}
          />
        ))}
      </ul>
    </section>
  );
}

interface RecommendationCardProps {
  contact: RankedContactDTO;
  onClick: () => void;
}

function RecommendationCard({ contact, onClick }: RecommendationCardProps) {
  const display = contact.display || {};
  const isSeed = display.kind === 'seed';
  const headline = display.name || display.company || 'Suggested contact';
  const sub =
    display.title ||
    (display.company && display.name ? display.company : null) ||
    (display.industry ? display.industry.replace(/_/g, ' ') : null) ||
    null;

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="group relative flex w-full flex-col items-start gap-1.5 rounded-[3px] border border-[#E2E8F0] bg-white p-4 text-left transition-all duration-150 hover:border-[#3B82F6] hover:bg-[#FAFBFF] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30"
      >
        <div className="flex w-full items-center gap-2">
          <span
            className={cn(
              'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[3px]',
              isSeed
                ? 'bg-[#3B82F6]/10 text-[#3B82F6]'
                : 'bg-[#F1F5F9] text-[#475569]',
            )}
          >
            {isSeed ? <GraduationCap size={14} /> : <Users size={14} />}
          </span>
          <span className="truncate text-sm font-semibold text-[#0F172A]">
            {headline}
          </span>
        </div>
        {sub ? (
          <span className="line-clamp-1 text-xs text-[#64748B]">{sub}</span>
        ) : null}
        <span className="mt-1 line-clamp-2 text-[12px] leading-snug text-[#475569]">
          {contact.rationale}
        </span>
      </button>
    </li>
  );
}
