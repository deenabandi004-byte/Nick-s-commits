/**
 * Feature access utilities - tier limits and helper functions
 */

export type Tier = 'free' | 'pro' | 'elite';

/**
 * Outreach mode for the Find search: what we do after finding contacts.
 *  - "preview": return contact info only (no email written, no draft).
 *  - "draft": write the email and create a Gmail draft. ALL tiers (Free's
 *    monthly credit budget is the meter, not the feature gate).
 *  - "send": write and send the email. Elite only.
 * The backend (runs.py prompt_search) is the source of truth and re-validates
 * the chosen mode against the user tier. These helpers exist only to drive the
 * UI and must stay in sync with the backend TIER_ALLOWED_MODES map.
 */
export type OutreachMode = 'preview' | 'draft' | 'send';

const TIER_ALLOWED_MODES: Record<Tier, OutreachMode[]> = {
  free: ['preview', 'draft'],
  pro: ['preview', 'draft'],
  elite: ['preview', 'draft', 'send'],
};

/**
 * Modes this tier is allowed to use, in display order (preview, draft, send).
 */
export function getAllowedOutreachModes(tier: Tier): OutreachMode[] {
  return TIER_ALLOWED_MODES[tier] || TIER_ALLOWED_MODES.free;
}

/**
 * Whether a tier may use a given mode.
 */
export function canUseOutreachMode(tier: Tier, mode: OutreachMode): boolean {
  return getAllowedOutreachModes(tier).includes(mode);
}

/**
 * The mode a tier should land on by default: draft for anyone who can draft
 * (every tier today), preview as the safety fallback.
 */
export function getDefaultOutreachMode(tier: Tier): OutreachMode {
  return canUseOutreachMode(tier, 'draft') ? 'draft' : 'preview';
}

export interface TierLimits {
  credits: number;
  alumniSearches: number | 'unlimited';
  coffeeChatPreps: number | 'unlimited';
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
    firmSearch: false,
    smartFilters: false,
    // 2026-07: Free can draft (batch of 3) — credits are the meter.
    bulkDrafting: true,
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
export function getFeatureLimit(tier: Tier, feature: 'alumniSearches' | 'coffeeChatPreps'): number | 'unlimited' {
  return TIER_LIMITS[tier][feature];
}

/**
 * Check if user can use a feature based on current usage
 */
export function canUseFeature(
  tier: Tier,
  feature: 'alumniSearches' | 'coffeeChatPreps',
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
  feature: 'alumniSearches' | 'coffeeChatPreps',
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
