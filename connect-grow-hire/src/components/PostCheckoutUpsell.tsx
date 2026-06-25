/**
 * PostCheckoutUpsell — Pro→Elite "$10 more, right now" offer.
 *
 * Shown one-time on /payment-success after a Pro checkout completes. Brand-honest
 * version of the Higgsfield "post-checkout next-tier upsell" pattern.
 *
 * Mechanic (server-side in `stripe_client.apply_post_checkout_upsell`):
 *   1. stripe.Subscription.modify(items=Elite, proration_behavior='none')
 *   2. one-time $10 invoice item, finalized + paid against saved card
 *   3. credit allocation bumped to Elite immediately
 *   4. user doc gets upsellShownAt + upsellAcceptedAt
 *
 * Result: $15 (Pro) + $10 (this) = $25 effective Elite this month, $35 next.
 *
 * Honest copy: revert date is plainly stated. No 10-min countdown — the
 * self-enforcing rule is "this offer is only on this page."
 */
import { useState } from 'react';
import { Sparkles, Check, X } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { BACKEND_URL } from '@/services/api';

export interface PostCheckoutUpsellProps {
  /** First-month effective price the user will land on. Default $25 ($15 Pro + $10 upsell). */
  effectiveFirstMonthPrice?: number;
  /** Full Elite monthly price (the renewal anchor). Default $34.99 — tunable. */
  fullElitePrice?: number;
  /** Called after the server confirms the Elite upgrade. Refresh user + redirect. */
  onAccepted: () => void;
  /** Called after decline (or on user dismissal). Should redirect to /home. */
  onDeclined: () => void;
}

const C = {
  ink: '#003262',
  brand: '#3B82F6',
  body: '#475569',
  muted: '#64748B',
  border: '#E2E8F0',
};

export function PostCheckoutUpsell({
  effectiveFirstMonthPrice = 25,
  fullElitePrice = 34.99,
  onAccepted,
  onDeclined,
}: PostCheckoutUpsellProps) {
  const [working, setWorking] = useState<'idle' | 'accepting' | 'declining'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const callBackend = async (path: 'accept-post-checkout-upsell' | 'decline-post-checkout-upsell') => {
    const auth = getAuth();
    const fbUser = auth.currentUser;
    if (!fbUser) throw new Error('Not authenticated');
    const token = await fbUser.getIdToken();
    const res = await fetch(`${BACKEND_URL}/api/billing/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.error || `Request failed (${res.status})`);
    }
    return json;
  };

  const handleAccept = async () => {
    setWorking('accepting');
    setErrorMsg(null);
    try {
      await callBackend('accept-post-checkout-upsell');
      // PostHog event — fire BEFORE the parent navigates away so it doesn't get lost.
      try {
        const { trackUpgradeClick } = await import('@/lib/analytics');
        trackUpgradeClick('post_checkout_upsell_accepted', {
          from_location: 'payment_success',
          plan_selected: 'elite',
        });
      } catch {
        /* analytics best-effort */
      }
      onAccepted();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Something went wrong');
      setWorking('idle');
    }
  };

  const handleDecline = async () => {
    setWorking('declining');
    try {
      await callBackend('decline-post-checkout-upsell');
    } catch {
      /* decline is fire-and-forget; if backend fails we still let user move on */
    }
    onDeclined();
  };

  // Day-31 revert date — honest copy needs an actual date users can verify.
  const revertDate = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
  const revertLabel = revertDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#FAFBFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 560,
          width: '100%',
          background: '#fff',
          borderRadius: 14,
          padding: '40px 36px 32px',
          boxShadow: '0 20px 48px -16px rgba(15, 37, 69, 0.20), 0 4px 12px rgba(15, 37, 69, 0.06)',
          position: 'relative',
        }}
      >
        {/* eyebrow */}
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              background: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)',
              border: '1px solid #93C5FD',
              borderRadius: 999,
              fontFamily: "'Inter', sans-serif",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.16em',
              color: C.ink,
              textTransform: 'uppercase',
            }}
          >
            <Sparkles size={11} /> One last thing
          </div>
        </div>

        {/* Headline */}
        <h1
          style={{
            fontFamily: "'Libre Baskerville', Georgia, serif",
            fontSize: 'clamp(28px, 4vw, 36px)',
            fontWeight: 400,
            color: C.ink,
            textAlign: 'center',
            letterSpacing: '-0.015em',
            lineHeight: 1.15,
            margin: '0 0 14px',
          }}
        >
          Add Elite for{' '}
          <span style={{ fontStyle: 'italic', color: C.brand }}>$10 more</span>, this month.
        </h1>

        {/* Body */}
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 15,
            lineHeight: 1.65,
            color: C.body,
            textAlign: 'center',
            margin: '0 auto 24px',
            maxWidth: 460,
          }}
        >
          You just unlocked Pro. For <strong style={{ color: C.ink }}>$10 more right now</strong>,
          you're on Elite for the rest of this month — the full plan, normally{' '}
          <strong style={{ color: C.ink }}>${fullElitePrice}</strong>.
        </p>

        {/* What Elite adds */}
        <div
          style={{
            background: '#F8FAFC',
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: '16px 18px',
            marginBottom: 22,
          }}
        >
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: C.muted,
              margin: '0 0 10px',
            }}
          >
            You get
          </p>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px 12px',
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: C.body,
              lineHeight: 1.4,
            }}
          >
            {[
              'Unlimited Coffee Chat Prep',
              'Up to 5 concurrent Loops',
              'Priority contact queue',
              'Personalized templates',
              'Weekly firm insights',
              'Early access to new tools',
            ].map((item) => (
              <li
                key={item}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 6,
                }}
              >
                <Check size={14} style={{ color: C.brand, flexShrink: 0, marginTop: 2 }} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Honesty line — revert date is real and spelled out */}
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 12.5,
            lineHeight: 1.55,
            color: C.muted,
            textAlign: 'center',
            margin: '0 auto 24px',
            maxWidth: 460,
          }}
        >
          <strong style={{ color: C.body }}>Heads up:</strong> next month it renews at $
          {fullElitePrice} on <strong style={{ color: C.body }}>{revertLabel}</strong>. You can drop
          back to Pro or cancel anytime in settings. This offer is only on this page.
        </p>

        {/* Error message */}
        {errorMsg && (
          <div
            style={{
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 16,
              fontFamily: "'Inter', sans-serif",
              fontSize: 12.5,
              color: '#B91C1C',
              textAlign: 'center',
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* CTAs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            disabled={working !== 'idle'}
            onClick={handleAccept}
            style={{
              width: '100%',
              padding: '15px 20px',
              background:
                working === 'accepting'
                  ? '#94A3B8'
                  : 'linear-gradient(135deg, #003262 0%, #1E3A8A 50%, #2563EB 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontFamily: "'Inter', sans-serif",
              fontSize: 15,
              fontWeight: 800,
              cursor: working !== 'idle' ? 'wait' : 'pointer',
              boxShadow: '0 8px 22px -8px rgba(37, 99, 235, 0.45)',
              transition: 'all 180ms ease',
            }}
            onMouseEnter={(e) => {
              if (working === 'idle') {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 12px 28px -8px rgba(37, 99, 235, 0.55)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 8px 22px -8px rgba(37, 99, 235, 0.45)';
            }}
          >
            {working === 'accepting' ? 'Processing…' : `Add Elite for $10 — effective $${effectiveFirstMonthPrice}/mo`}
          </button>

          <button
            type="button"
            disabled={working !== 'idle'}
            onClick={handleDecline}
            style={{
              width: '100%',
              padding: '13px 20px',
              background: 'transparent',
              color: C.muted,
              border: 'none',
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              cursor: working !== 'idle' ? 'wait' : 'pointer',
              transition: 'color 160ms ease',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
            onMouseEnter={(e) => {
              if (working === 'idle') e.currentTarget.style.color = C.ink;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = C.muted;
            }}
          >
            <X size={14} /> No thanks, keep Pro
          </button>
        </div>
      </div>
    </div>
  );
}
