/**
 * UsageMeter component - shows remaining uses for limited features
 */
import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Tier, getRemainingUses } from '@/utils/featureAccess';

interface UsageMeterProps {
  tier: Tier;
  feature: 'alumniSearches' | 'coffeeChatPreps';
  currentUsage: number;
  showWarning?: boolean;
  warningThreshold?: number;
}

export function UsageMeter({
  tier,
  feature,
  currentUsage,
  showWarning = true,
  warningThreshold = 2,
}: UsageMeterProps) {
  const remaining = getRemainingUses(tier, feature, currentUsage);
  const limit = tier === 'free'
    ? (feature === 'alumniSearches' ? 10 : feature === 'coffeeChatPreps' ? 3 : 1)
    : tier === 'pro'
    ? (feature === 'coffeeChatPreps' ? 10 : 'unlimited')
    : 'unlimited';

  if (remaining === 'unlimited') {
    return null;
  }

  const percentage = (remaining / (typeof limit === 'number' ? limit : 1)) * 100;
  const isLow = remaining <= warningThreshold;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600 dark:text-slate-400">
          {feature === 'alumniSearches' && 'Alumni Searches'}
          {feature === 'coffeeChatPreps' && 'Meeting Preps'}
        </span>
        <span className={`font-medium ${isLow ? 'text-orange-600 dark:text-orange-400' : 'text-slate-700 dark:text-slate-300'}`}>
          {remaining} remaining
        </span>
      </div>
      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${
            isLow
              ? 'bg-orange-500'
              : 'bg-[#3B82F6]'
          }`}
          style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }}
        />
      </div>
      {isLow && showWarning && (
        <div className="flex items-center gap-2 text-xs text-orange-600 dark:text-orange-400">
          <AlertCircle className="h-3 w-3" />
          <span>Running low! Upgrade for more uses.</span>
        </div>
      )}
    </div>
  );
}
