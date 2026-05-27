/**
 * Feature access utilities - tier limits and helper functions
 */

export type Tier = 'free' | 'pro' | 'elite';

export interface TierLimits {
  credits: number;
  alumniSearches: number | 'unlimited';
  coffeeChatPreps: number | 'unlimited';
  interviewPreps: number | 'unlimited';
  firmSearch: boolean;
  smartFilters: boolean;
  bulkDrafting: boolean;
  exportEnabled: boolean;
  priorityQueue: boolean;
  personalizedTemplates: boolean;
  weeklyInsights: boolean;
  earlyAccess: boolean;
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    credits: 300,
    alumniSearches: 10,
    coffeeChatPreps: 3,
    interviewPreps: 2,
    firmSearch: false,
    smartFilters: false,
    bulkDrafting: false,
    exportEnabled: false,
    priorityQueue: false,
    personalizedTemplates: false,
    weeklyInsights: false,
    earlyAccess: false,
  },
  pro: {
    credits: 1500,
    alumniSearches: 'unlimited',
    coffeeChatPreps: 10,
    interviewPreps: 5,
    firmSearch: true,
    smartFilters: true,
    bulkDrafting: true,
    exportEnabled: true,
    priorityQueue: false,
    personalizedTemplates: false,
    weeklyInsights: false,
    earlyAccess: false,
  },
  elite: {
    credits: 3000,
    alumniSearches: 'unlimited',
    coffeeChatPreps: 'unlimited',
    interviewPreps: 'unlimited',
    firmSearch: true,
    smartFilters: true,
    bulkDrafting: true,
    exportEnabled: true,
    priorityQueue: true,
    personalizedTemplates: true,
    weeklyInsights: true,
    earlyAccess: true,
  },
};

/**
 * Check if a tier has access to a feature
 */
export function hasFeatureAccess(tier: Tier, feature: keyof TierLimits): boolean {
  return TIER_LIMITS[tier][feature] === true || TIER_LIMITS[tier][feature] === 'unlimited';
}

/**
 * Get the limit for a usage-based feature
 */
export function getFeatureLimit(tier: Tier, feature: 'alumniSearches' | 'coffeeChatPreps' | 'interviewPreps'): number | 'unlimited' {
  return TIER_LIMITS[tier][feature];
}

/**
 * Check if user can use a feature based on current usage
 */
export function canUseFeature(
  tier: Tier,
  feature: 'alumniSearches' | 'coffeeChatPreps' | 'interviewPreps',
  currentUsage: number
): boolean {
  const limit = getFeatureLimit(tier, feature);
  if (limit === 'unlimited') return true;
  return currentUsage < limit;
}

/**
 * Get remaining uses for a feature
 */
export function getRemainingUses(
  tier: Tier,
  feature: 'alumniSearches' | 'coffeeChatPreps' | 'interviewPreps',
  currentUsage: number
): number | 'unlimited' {
  const limit = getFeatureLimit(tier, feature);
  if (limit === 'unlimited') return 'unlimited';
  return Math.max(0, limit - currentUsage);
}

/**
 * Get the minimum tier required for a feature
 */
export function getRequiredTier(feature: keyof TierLimits): Tier {
  if (TIER_LIMITS.pro[feature]) return 'pro';
  if (TIER_LIMITS.elite[feature]) return 'elite';
  return 'free';
}

/**
 * Get upgrade message for a locked feature
 */
export function getUpgradeMessage(feature: string, currentTier: Tier): string {
  const requiredTier = getRequiredTier(feature as keyof TierLimits);
  
  if (requiredTier === 'elite' && currentTier !== 'elite') {
    return `Upgrade to Elite to unlock ${feature}`;
  }
  if (requiredTier === 'pro' && currentTier === 'free') {
    return `Upgrade to Pro to unlock ${feature}`;
  }
  return `This feature requires ${requiredTier} tier`;
}
