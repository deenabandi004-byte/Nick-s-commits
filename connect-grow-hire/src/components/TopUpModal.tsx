/**
 * TopUpModal — one-time credit-pack purchase.
 *
 * Triggered from UsageMeter "+ Add Credits" or from any "out of credits" CTA.
 * Three packs: Starter ($4.99/500), Best value ($9.99/1,500), Bulk ($24.99/5,000).
 * Purchased credits NEVER expire (CA prepaid-credit law + goodwill).
 *
 * Stripe Price IDs are env-driven via STRIPE_PRICE_CATALOG.topup.{credits}.
 * If a Price ID is unset (cofounders haven't wired Stripe yet), the CTA is
 * disabled with a "coming soon" tooltip instead of a fake purchase flow.
 */
import { useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { useTierConfig, resolveTopupPriceId, type TopUpPack } from '@/hooks/useTierConfig';
import { trackUpgradeClick } from '@/lib/analytics';

interface TopUpModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the selected pack when the user clicks the CTA. Parent owns
   *  the actual Stripe checkout call so this modal stays presentational. */
  onPurchase: (pack: TopUpPack, priceId: string) => void;
  /** Optional context — pre-selects the recommended pack if user hit a paywall. */
  fromFeature?: string;
}

const C = {
  ink: '#003262',
  brand: '#3B82F6',
  body: '#475569',
  muted: '#94A3B8',
  border: '#E2E8F0',
};

export function TopUpModal({ open, onClose, onPurchase, fromFeature }: TopUpModalProps) {
  const { config } = useTierConfig();
  const recommended = config.topup_packs.find((p) => p.recommended) ?? config.topup_packs[1];
  const [selectedId, setSelectedId] = useState<string>(recommended.id);

  if (!open) return null;

  const selectedPack = config.topup_packs.find((p) => p.id === selectedId) ?? recommended;
  const priceId = resolveTopupPriceId(config.stripe_catalog, selectedPack.credits);
  const ctaDisabled = !priceId;
  const perThousand = (selectedPack.price / (selectedPack.credits / 1000)).toFixed(2);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Buy credit pack"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: 32,
          width: '100%',
          maxWidth: 560,
          boxShadow: '0 24px 64px -12px rgba(15, 37, 69, 0.25)',
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
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

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: '#6478B4',
              textTransform: 'uppercase',
              margin: '0 0 10px',
            }}
          >
            Credit packs
          </p>
          <h2
            style={{
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: 26,
              fontWeight: 400,
              color: C.ink,
              margin: '0 0 8px',
              letterSpacing: '-0.012em',
            }}
          >
            Top up — no monthly commitment
          </h2>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: C.body,
              margin: 0,
            }}
          >
            Credits you buy <strong style={{ color: C.ink }}>never expire</strong>. Use them whenever you need.
          </p>
        </div>

        {/* Pack cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
            marginBottom: 24,
          }}
        >
          {config.topup_packs.map((pack) => {
            const isSelected = pack.id === selectedId;
            const isRecommended = pack.recommended;
            return (
              <button
                key={pack.id}
                type="button"
                onClick={() => setSelectedId(pack.id)}
                style={{
                  position: 'relative',
                  padding: '18px 14px 16px',
                  background: '#fff',
                  border: `2px solid ${isSelected ? C.brand : C.border}`,
                  borderRadius: 12,
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 160ms ease',
                  boxShadow: isSelected
                    ? `0 4px 14px ${C.brand}22`
                    : '0 1px 2px rgba(15,37,69,.04)',
                }}
              >
                {isRecommended && (
                  <div
                    style={{
                      position: 'absolute',
                      top: -10,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: C.brand,
                      color: '#fff',
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      padding: '3px 8px',
                      borderRadius: 999,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Sparkles size={9} /> Best value
                  </div>
                )}
                <div
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    color: C.muted,
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                >
                  {pack.label}
                </div>
                <div
                  style={{
                    fontFamily: "'Libre Baskerville', Georgia, serif",
                    fontSize: 22,
                    fontWeight: 400,
                    color: C.ink,
                    lineHeight: 1.1,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {pack.credits.toLocaleString()}
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 8 }}>credits</div>
                <div
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 17,
                    fontWeight: 700,
                    color: C.ink,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  ${pack.price}
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected pack summary */}
        <div
          style={{
            background: '#F8FAFC',
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 18,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            color: C.body,
          }}
        >
          <span>
            <strong style={{ color: C.ink }}>${perThousand}</strong> per 1,000 credits
          </span>
          <span style={{ color: C.muted, fontSize: 12 }}>One-time charge · No subscription</span>
        </div>

        {/* CTA */}
        <button
          type="button"
          disabled={ctaDisabled}
          onClick={() => {
            trackUpgradeClick(fromFeature || 'topup_modal', {
              from_location: 'topup_modal',
              plan_selected: `topup_${selectedPack.id}`,
            });
            onPurchase(selectedPack, priceId);
          }}
          style={{
            width: '100%',
            padding: '14px 18px',
            background: ctaDisabled ? '#CBD5E1' : C.ink,
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontFamily: "'Inter', sans-serif",
            fontSize: 14,
            fontWeight: 700,
            cursor: ctaDisabled ? 'not-allowed' : 'pointer',
            transition: 'all 160ms ease',
          }}
          title={ctaDisabled ? 'Stripe checkout coming soon for this pack' : undefined}
        >
          {ctaDisabled
            ? 'Coming soon'
            : `Add ${selectedPack.credits.toLocaleString()} credits for $${selectedPack.price}`}
        </button>

        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            color: C.muted,
            textAlign: 'center',
            margin: '12px 0 0',
          }}
        >
          Purchased credits never expire · No subscription · Cancel anytime
        </p>
      </div>
    </div>
  );
}
