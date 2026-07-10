/**
 * TrialBanner — sidebar/dashboard banner for Pro trial state.
 *
 * Three render modes based on user trial state:
 *  1. Not eligible (already used trial OR already on a paid plan) → null
 *  2. Eligible but not started → "Try Pro free for 14 days" CTA
 *  3. Trial active → "X days left · Y credits today · Z saved contacts"
 *
 * Polls /api/users/trial-status on mount + every 60s while mounted. The poll
 * also serves as the lazy-expiry trigger — on the first call after the trial
 * ends, the backend flips the user to Free and we re-render in mode 1.
 */
import { useEffect, useState, useCallback } from 'react';
import { Sparkles, Clock, Zap, ChevronRight } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { BACKEND_URL } from '@/services/api';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import { useTierConfig } from '@/hooks/useTierConfig';
import { useTour } from '@/contexts/TourContext';

interface TrialStatus {
  is_active: boolean;
  is_expired_unprocessed?: boolean;
  days_remaining?: number;
  hours_remaining?: number;
  credits_remaining?: number;
  credits_total?: number;
  trial_ends_at?: string;
}

interface TrialStatusResponse {
  ok: boolean;
  status: TrialStatus;
  has_trial_used: boolean;
  current_tier: string;
}

interface TrialBannerProps {
  /** Visual variant. "compact" sits in the sidebar; "full" is a wide banner. */
  variant?: 'compact' | 'full';
  /** Optional CTA when not in a trial — defaults to internal start-trial call. */
  onStartTrial?: () => void;
  /** Optional CTA when trial is active — what "Upgrade now" should do. */
  onUpgrade?: () => void;
}

const C = {
  ink: '#003262',
  brand: '#3B82F6',
  body: '#475569',
  magenta: '#EC4899',
  magentaDeep: '#DB2777',
  lime: '#A3E635',
  border: '#E2E8F0',
};

export function TrialBanner({ variant = 'full', onStartTrial, onUpgrade }: TrialBannerProps) {
  const { user } = useFirebaseAuth();
  const { config: tierConfig } = useTierConfig();
  const { run: tourRunning } = useTour();
  const trialDays = tierConfig.trial.days_non_student;
  const [data, setData] = useState<TrialStatusResponse | null>(null);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!user) return;
    try {
      const auth = getAuth();
      const fbUser = auth.currentUser;
      if (!fbUser) return;
      const token = await fbUser.getIdToken();
      const res = await fetch(`${BACKEND_URL}/api/users/trial-status`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = (await res.json()) as TrialStatusResponse;
        setData(json);
      }
    } catch {
      /* best-effort polling */
    }
  }, [user]);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 60_000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const handleStart = async () => {
    if (onStartTrial) {
      onStartTrial();
      return;
    }
    if (!user) return;
    setActivating(true);
    setError(null);
    try {
      const auth = getAuth();
      const fbUser = auth.currentUser;
      if (!fbUser) throw new Error('Not authenticated');
      const token = await fbUser.getIdToken();
      const res = await fetch(`${BACKEND_URL}/api/users/start-trial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Failed to start trial');
      }
      // Optimistically refetch so the banner flips to "active" mode.
      await fetchStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start trial');
    } finally {
      setActivating(false);
    }
  };

  // Don't render anything until we have data. Also stay hidden while the
  // product tour is running: the banner loads async and pushes the whole page
  // down when it appears, which strands the tour tooltip mid-viewport (and a
  // trial pitch is noise inside a walkthrough anyway).
  if (!data || tourRunning) return null;

  const status = data.status;
  const hasUsedTrial = data.has_trial_used;
  const currentTier = data.current_tier;

  // Mode 1: already on a paid plan OR already used trial — no banner
  const isPaidWithStripe = currentTier === 'elite' || (currentTier === 'pro' && !status.is_active);
  if (isPaidWithStripe || (hasUsedTrial && !status.is_active)) {
    return null;
  }

  // Mode 3: trial is active — show countdown + daily credits
  if (status.is_active) {
    const daysLeft = status.days_remaining ?? 0;
    const hoursLeft = status.hours_remaining ?? 0;
    const dailyLeft = status.credits_remaining ?? 0;
    const dailyMax = status.credits_total ?? 600;
    const pct = Math.max(0, Math.min(100, (dailyLeft / dailyMax) * 100));

    if (variant === 'compact') {
      return (
        <div
          style={{
            background: `linear-gradient(135deg, ${C.brand} 0%, ${C.magenta} 100%)`,
            borderRadius: 10,
            padding: '12px 14px',
            color: '#fff',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.95 }}>
              Pro Trial
            </span>
            <span style={{ fontSize: 12, fontWeight: 700 }}>
              {daysLeft > 0 ? `${daysLeft}d left` : `${hoursLeft}h left`}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Zap size={12} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              {dailyLeft.toLocaleString()} / {dailyMax.toLocaleString()} trial credits
            </span>
          </div>
          <div style={{ height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: '#fff', transition: 'width 280ms ease' }} />
          </div>
        </div>
      );
    }

    // Full variant
    return (
      <div
        style={{
          background: `linear-gradient(135deg, ${C.brand} 0%, ${C.magenta} 100%)`,
          borderRadius: 14,
          padding: '20px 24px',
          color: '#fff',
          fontFamily: "'Inter', sans-serif",
          boxShadow: `0 10px 28px -10px ${C.magenta}55`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.95, marginBottom: 4 }}>
            <Sparkles size={11} style={{ display: 'inline', marginRight: 4 }} /> Pro Trial Active
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>
            {daysLeft > 0 ? `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left` : `${hoursLeft} hours left`}
          </div>
          <div style={{ fontSize: 13, opacity: 0.9 }}>
            <Zap size={11} style={{ display: 'inline', marginRight: 4 }} />
            {dailyLeft.toLocaleString()} of {dailyMax.toLocaleString()} trial credits · upgrade for 2,000/mo
          </div>
        </div>
        {onUpgrade && (
          <button
            type="button"
            onClick={onUpgrade}
            style={{
              background: '#fff',
              color: C.ink,
              border: 'none',
              padding: '10px 18px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              boxShadow: '0 4px 12px -2px rgba(0,0,0,0.18)',
            }}
          >
            Keep Pro <ChevronRight size={14} />
          </button>
        )}
      </div>
    );
  }

  // Mode 2: eligible but not started — "Try Pro free for 14 days"
  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={handleStart}
        disabled={activating}
        style={{
          width: '100%',
          background: `linear-gradient(135deg, ${C.brand} 0%, ${C.magenta} 100%)`,
          borderRadius: 10,
          padding: '12px 14px',
          color: '#fff',
          border: 'none',
          cursor: activating ? 'wait' : 'pointer',
          fontFamily: "'Inter', sans-serif",
          fontSize: 13,
          fontWeight: 700,
          textAlign: 'left',
          boxShadow: `0 6px 16px -6px ${C.magenta}55`,
          transition: 'transform 160ms ease',
        }}
        onMouseEnter={(e) => { if (!activating) e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
      >
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.95, marginBottom: 3 }}>
          <Sparkles size={10} style={{ display: 'inline', marginRight: 3 }} /> Free Trial
        </div>
        <div style={{ fontSize: 13, fontWeight: 800 }}>
          {activating ? 'Starting…' : `Try Pro free · ${trialDays} days`}
        </div>
        <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2 }}>No credit card required</div>
      </button>
    );
  }

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${C.brand} 0%, ${C.magenta} 100%)`,
        borderRadius: 14,
        padding: '20px 24px',
        color: '#fff',
        fontFamily: "'Inter', sans-serif",
        boxShadow: `0 10px 28px -10px ${C.magenta}55`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.95, marginBottom: 4 }}>
          <Sparkles size={11} style={{ display: 'inline', marginRight: 4 }} /> Free Trial
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>
          Try Pro free for {trialDays} days
        </div>
        <div style={{ fontSize: 13, opacity: 0.9 }}>
          <Clock size={11} style={{ display: 'inline', marginRight: 4 }} />
          No credit card · Drops to Free if you don't upgrade
        </div>
        {error && (
          <div style={{ fontSize: 12, marginTop: 6, color: '#FFE4E6' }}>{error}</div>
        )}
      </div>
      <button
        type="button"
        onClick={handleStart}
        disabled={activating}
        style={{
          background: '#fff',
          color: C.ink,
          border: 'none',
          padding: '12px 22px',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 800,
          cursor: activating ? 'wait' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          boxShadow: '0 4px 12px -2px rgba(0,0,0,0.18)',
        }}
      >
        {activating ? 'Starting…' : 'Start trial'} <ChevronRight size={16} />
      </button>
    </div>
  );
}
