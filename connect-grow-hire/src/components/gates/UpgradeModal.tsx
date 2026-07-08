/**
 * UpgradeModal - prompts users to upgrade when they hit a limit
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Lock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tier, getRequiredTier, TIER_LIMITS } from '@/utils/featureAccess';
import { trackUpgradeClick } from '../../lib/analytics';

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: string;
  reason?: string;
  currentTier: Tier;
  /** Override the auto-resolved required tier (use when `feature` isn't a TierLimits key). */
  requiredTier?: Tier;
  /** Override the human-readable feature label shown in the heading. */
  featureLabel?: string;
}

export function UpgradeModal({
  open,
  onOpenChange,
  feature,
  reason,
  currentTier,
  requiredTier: requiredTierProp,
  featureLabel,
}: UpgradeModalProps) {
  const navigate = useNavigate();
  const requiredTier = requiredTierProp ?? getRequiredTier(feature as keyof typeof TIER_LIMITS.free);

  if (!open) return null;

  const handleUpgrade = () => {
    trackUpgradeClick(feature, {
      from_action: reason || 'limit_reached',
      from_location: 'modal',
      plan_selected: requiredTier,
    });
    onOpenChange(false);
    navigate(`/pricing?tier=${requiredTier}`);
  };

  const getFeatureDescription = () => {
    if (featureLabel) return featureLabel;
    const featureMap: Record<string, string> = {
      firm_search: 'Full Firm Search',
      smart_filters: 'Smart Filters',
      bulk_drafting: 'Bulk Drafting',
      export: 'Export to CSV/Gmail',
      alumni_search: 'Alumni Search',
      coffee_chat_prep: 'Coffee Chat Prep',
    };
    return featureMap[feature] || feature;
  };

  const getTierBenefits = (tier: Tier) => {
    const benefits: Record<Tier, string[]> = {
      free: [],
      pro: [
        '2,000 credits (~200 contacts)',
        'Full Firm Search',
        '10 Coffee Chat Preps/month',
        'Unlimited alumni searches',
        'Export unlocked',
        'Bulk drafting',
      ],
      elite: [
        '5,000 credits (~500 contacts)',
        'Everything in Pro, plus:',
        'Unlimited Coffee Chat Prep',
        'Priority queue',
        'Personalized templates',
        'Weekly firm insights',
        'Early access to new features',
      ],
    };
    return benefits[tier];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      
      {/* Modal */}
      <div className="relative bg-white dark:bg-[#0F172A] rounded-[3px] shadow-2xl max-w-md w-full mx-4 p-6 border border-slate-200 dark:border-slate-800">
        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[rgba(59,130,246,0.10)] dark:bg-[rgba(59,130,246,0.10)] mb-4">
            <Lock className="h-8 w-8 text-[#3B82F6] dark:text-[#3B82F6]" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Feature Locked
          </h2>
          <p className="text-slate-600 dark:text-slate-400">
            {getFeatureDescription()} requires {requiredTier} tier
          </p>
        </div>

        {reason && (
          <div className="mb-6 p-4 bg-slate-100 dark:bg-slate-800 rounded-[3px]">
            <p className="text-sm text-slate-700 dark:text-slate-300">{reason}</p>
          </div>
        )}

        <div className="mb-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-3">
            Upgrade to {requiredTier === 'pro' ? 'Pro' : 'Elite'} and unlock:
          </h3>
          <ul className="space-y-2">
            {getTierBenefits(requiredTier).map((benefit, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                <ArrowRight className="h-4 w-4 text-[#3B82F6] mt-0.5 flex-shrink-0" />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            Maybe Later
          </Button>
          <Button
            onClick={handleUpgrade}
            className="flex-1 bg-[#0F172A] hover:bg-[#1E293B] text-white"
          >
            Upgrade to {requiredTier === 'pro' ? 'Pro' : 'Elite'}
          </Button>
        </div>
      </div>
    </div>
  );
}
