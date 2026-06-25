/**
 * PricingExitPopup — exit-intent capture for the /pricing page.
 *
 * Different from `ExitIntentPopup` (Beehiiv lead magnet on marketing pages).
 * This one captures the email straight into our backend `lifecycle_leads`
 * collection via `/api/lifecycle/pricing-capture`, which triggers the Day 0
 * / Day 2 / Day 5 lifecycle drip in `services/lifecycle_emails.py`.
 *
 * Per the project standing rule: no fake countdown, no fake scarcity. The
 * STAYHIRED coupon code is only shown when the backend's `active_promos`
 * dict reports a real Stripe coupon ID is wired.
 */
import { useState, useEffect, useCallback } from 'react';
import { X, Sparkles } from 'lucide-react';
import { BACKEND_URL } from '@/services/api';
import { useTierConfig } from '@/hooks/useTierConfig';
import { trackPricingPageExit, trackPricingEmailCaptured } from '@/lib/analytics';

const SESSION_KEY = 'offerloop:pricing-exit-shown';

interface PricingExitPopupProps {
  /** Disable the popup (e.g. when the user is already a paid subscriber). */
  disabled?: boolean;
}

const C = {
  ink: '#003262',
  brand: '#3B82F6',
  body: '#475569',
  muted: '#94A3B8',
  magenta: '#EC4899',
  magentaDeep: '#DB2777',
};

export function PricingExitPopup({ disabled = false }: PricingExitPopupProps) {
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { config } = useTierConfig();
  const hasCoupon = Boolean(config.active_promos?.pricing_recapture);

  useEffect(() => {
    if (disabled) return;
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(SESSION_KEY)) return;

    const onMouseLeave = (e: MouseEvent) => {
      if (e.clientY > 0) return;
      sessionStorage.setItem(SESSION_KEY, '1');
      setVisible(true);
      trackPricingPageExit();
    };

    document.addEventListener('mouseout', onMouseLeave);
    return () => document.removeEventListener('mouseout', onMouseLeave);
  }, [disabled]);

  const close = useCallback(() => setVisible(false), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/lifecycle/pricing-capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, utm_source: 'pricing_exit' }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Request failed (${res.status})`);
      }
      trackPricingEmailCaptured({ had_coupon: hasCoupon });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Before you go"
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: 36,
          width: '100%',
          maxWidth: 520,
          boxShadow: '0 24px 64px -12px rgba(15, 37, 69, 0.25)',
          position: 'relative',
        }}
      >
        <button
          onClick={close}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: C.muted,
            padding: 6,
          }}
        >
          <X size={20} />
        </button>

        {done ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                background: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)',
                borderRadius: 999,
                fontFamily: "'Inter', sans-serif",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.16em',
                color: C.ink,
                textTransform: 'uppercase',
                marginBottom: 16,
              }}
            >
              <Sparkles size={11} /> You're in
            </div>
            <h2
              style={{
                fontFamily: "'Libre Baskerville', Georgia, serif",
                fontSize: 24,
                fontWeight: 400,
                color: C.ink,
                margin: '0 0 12px',
              }}
            >
              The Recruiting Game Plan is on its way.
            </h2>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: C.body, lineHeight: 1.6 }}>
              Check your inbox in the next few minutes.
              {hasCoupon && (
                <>
                  {' '}Your discount code <strong style={{ color: C.ink, letterSpacing: '0.08em' }}>STAYHIRED</strong> is locked in for 7 days — use it at checkout.
                </>
              )}
            </p>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  background: `linear-gradient(135deg, ${C.magenta}, ${C.magentaDeep})`,
                  color: '#fff',
                  borderRadius: 999,
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  marginBottom: 16,
                  boxShadow: `0 6px 18px -4px ${C.magenta}55`,
                }}
              >
                <Sparkles size={11} /> Wait — before you go
              </div>
              <h2
                style={{
                  fontFamily: "'Libre Baskerville', Georgia, serif",
                  fontSize: 26,
                  fontWeight: 400,
                  color: C.ink,
                  margin: '0 0 12px',
                  letterSpacing: '-0.012em',
                  lineHeight: 1.2,
                }}
              >
                Grab the Recruiting Game Plan {hasCoupon && '+ 20% off'} on your way out.
              </h2>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 14,
                  color: C.body,
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                The exact warm-intro template + coffee-chat script used by USC, UCLA &amp; Michigan students who landed at Goldman, Bain &amp; Google this season.
                {hasCoupon && ' Plus 20% off your first month of Pro if you decide to try it.'}
              </p>
            </div>

            <form onSubmit={submit}>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="your.name@school.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  fontSize: 15,
                  border: `1.5px solid #E2E8F0`,
                  borderRadius: 10,
                  outline: 'none',
                  fontFamily: "'Inter', sans-serif",
                  marginBottom: 12,
                  boxSizing: 'border-box',
                }}
              />
              {error && (
                <div
                  style={{
                    background: '#FEF2F2',
                    border: '1px solid #FECACA',
                    borderRadius: 8,
                    padding: '10px 14px',
                    marginBottom: 12,
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 12.5,
                    color: '#B91C1C',
                  }}
                >
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  background: `linear-gradient(135deg, ${C.brand} 0%, #7C3AED 60%, ${C.magenta} 100%)`,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: submitting ? 'wait' : 'pointer',
                  boxShadow: `0 10px 28px -8px ${C.magenta}55`,
                }}
              >
                {submitting ? 'Sending…' : 'Send me the playbook'}
              </button>
            </form>

            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 11,
                color: C.muted,
                textAlign: 'center',
                margin: '12px 0 0',
                lineHeight: 1.5,
              }}
            >
              One-tap unsubscribe in every email. No spam — just the recruiting playbook
              {hasCoupon && ', the code, and a couple of stories from other students'}.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
