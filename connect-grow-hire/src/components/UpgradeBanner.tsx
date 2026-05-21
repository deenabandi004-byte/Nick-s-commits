import React from "react";
import { useNavigate } from "react-router-dom";
import { Info } from "lucide-react";
import { trackUpgradeClick } from "../lib/analytics";

interface UpgradeBannerProps {
  /** Whether user has exhausted their monthly limit (not just credits) */
  hasExhaustedLimit: boolean;
  /** Whether user has enough credits */
  hasEnoughCredits: boolean;
  /** Current usage count */
  currentUsage: number;
  /** Limit (number or 'unlimited') */
  limit: number | 'unlimited';
  /** Current tier */
  tier: string;
  /** Credits required for this feature */
  requiredCredits: number;
  /** Current credits */
  currentCredits: number;
  /** Feature name for messaging (e.g., "Meeting Preps", "Interview Preps") */
  featureName: string;
  /** Next tier name for upgrade message */
  nextTier: 'Pro' | 'Elite';
  /** Whether to show the upgrade button */
  showUpgradeButton?: boolean;
}

export const UpgradeBanner: React.FC<UpgradeBannerProps> = ({
  hasExhaustedLimit,
  hasEnoughCredits,
  currentUsage,
  limit,
  tier,
  requiredCredits,
  currentCredits,
  featureName,
  nextTier,
  showUpgradeButton = true,
}) => {
  const navigate = useNavigate();

  // Don't show banner for elite members (they have unlimited access)
  if (tier === 'elite') {
    return null;
  }

  // Only show banner if user doesn't have access
  // User doesn't have access if they've exhausted their limit OR don't have enough credits
  if (!hasExhaustedLimit && hasEnoughCredits) {
    return null;
  }

  // Determine the message based on the issue
  const isCreditsIssue = !hasEnoughCredits;
  const isLimitIssue = hasExhaustedLimit && hasEnoughCredits;

  return (
    <div className="mb-6 rounded-md border-l-4 border-[#3B82F6] bg-[#FAFBFF]">
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Simple info icon */}
          <Info className="h-4 w-4 text-[#3B82F6] mt-0.5 flex-shrink-0" />

          <div className="flex-1 min-w-0">
            {/* Description - factual and simple */}
            <p className="text-sm text-slate-600 leading-relaxed">
              {isCreditsIssue ? (
                <>
                  You need {requiredCredits} credits to generate a {featureName.slice(0, -1)}. You currently have {currentCredits} credits.
                </>
              ) : (
                <>
                  You've used {currentUsage} of {typeof limit === 'number' ? limit : 'unlimited'} {featureName}. Upgrade to {nextTier} for more.
                </>
              )}
            </p>

            {/* Simple text link button */}
            {showUpgradeButton && (
              <button
                onClick={() => {
                  trackUpgradeClick(featureName.toLowerCase().replace(/\s+/g, '_'), {
                    from_action: isCreditsIssue ? 'insufficient_credits' : 'limit_reached',
                    from_location: 'banner',
                  });
                  navigate('/pricing');
                }}
                className="mt-2 text-sm font-medium text-[#3B82F6] hover:text-[#2563EB] transition-colors"
              >
                Upgrade to {nextTier} →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
