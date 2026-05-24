/**
 * Hook for checking feature access
 */
import { useState, useEffect } from 'react';
import { getAuth } from 'firebase/auth';
import { Tier, hasFeatureAccess, canUseFeature, getUpgradeMessage } from '@/utils/featureAccess';
import { useSubscription } from './useSubscription';
import { BACKEND_URL } from '@/services/api';

export interface FeatureCheckResult {
  allowed: boolean;
  reason?: string;
  tier: Tier;
}

export function useFeatureGate(feature: string) {
  const { subscription, loading } = useSubscription();
  const [checkResult, setCheckResult] = useState<FeatureCheckResult | null>(null);
  const [checking, setChecking] = useState(false);

  const checkFeature = async (): Promise<FeatureCheckResult> => {
    if (!subscription) {
      return {
        allowed: false,
        reason: 'Not authenticated',
        tier: 'free',
      };
    }

    setChecking(true);
    try {
      const auth = getAuth();
      const firebaseUser = auth.currentUser;
      
      if (!firebaseUser) {
        return {
          allowed: false,
          reason: 'Not authenticated',
          tier: 'free',
        };
      }

      const token = await firebaseUser.getIdToken();
      
      const API_URL = BACKEND_URL;

      const response = await fetch(`${API_URL}/api/user/check-feature`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ feature }),
      });

      if (!response.ok) {
        throw new Error('Failed to check feature');
      }

      const data = await response.json();
      setCheckResult(data);
      return data;
    } catch (err) {
      console.error('Error checking feature:', err);
      // Fallback to client-side check
      const tier = subscription.tier as Tier;
      const allowed = hasFeatureAccess(tier, feature as any);
      const result = {
        allowed,
        reason: allowed ? undefined : getUpgradeMessage(feature, tier),
        tier,
      };
      setCheckResult(result);
      return result;
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (subscription && !loading) {
      checkFeature();
    }
  }, [subscription, feature]);

  // Client-side quick check for usage-based features
  const canUse = (usageType: 'alumniSearches' | 'coffeeChatPreps'): boolean => {
    if (!subscription) return false;
    return canUseFeature(
      subscription.tier as Tier,
      usageType,
      subscription[`${usageType}Used` as keyof typeof subscription] as number
    );
  };

  return {
    allowed: checkResult?.allowed ?? false,
    reason: checkResult?.reason,
    tier: (checkResult?.tier || subscription?.tier || 'free') as Tier,
    loading: loading || checking,
    checkFeature,
    canUse,
  };
}
