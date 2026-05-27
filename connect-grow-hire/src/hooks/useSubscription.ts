/**
 * Hook for managing subscription state and usage
 */
import { useState, useEffect } from 'react';
import { getAuth } from 'firebase/auth';
import { Tier } from '@/utils/featureAccess';
import { BACKEND_URL } from '@/services/api';

export interface SubscriptionData {
  tier: Tier;
  credits: number;
  maxCredits: number;
  alumniSearchesUsed: number;
  alumniSearchesLimit: number | 'unlimited';
  coffeeChatPrepsUsed: number;
  coffeeChatPrepsLimit: number | 'unlimited';
  interviewPrepsUsed: number;
  interviewPrepsLimit: number | 'unlimited';
  resumeFileName?: string;
}

export function useSubscription() {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscription = async () => {
    try {
      const auth = getAuth();
      const firebaseUser = auth.currentUser;
      
      if (!firebaseUser) {
        setSubscription(null);
        setLoading(false);
        return;
      }

      const token = await firebaseUser.getIdToken();
      
      const API_URL = BACKEND_URL;

      const response = await fetch(`${API_URL}/api/user/subscription`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch subscription');
      }

      const data = await response.json();
      setSubscription(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching subscription:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      // Set default free tier on error
      setSubscription({
        tier: 'free',
        credits: 0,
        maxCredits: 300,
        alumniSearchesUsed: 0,
        alumniSearchesLimit: 10,
        coffeeChatPrepsUsed: 0,
        coffeeChatPrepsLimit: 1,
        interviewPrepsUsed: 0,
        interviewPrepsLimit: 1,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscription();

    // Refresh subscription data every 2 minutes, only when tab is visible
    const interval = setInterval(() => {
      if (!document.hidden) fetchSubscription();
    }, 120000);
    return () => clearInterval(interval);
  }, []);

  const incrementUsage = async (feature: 'alumni_search' | 'meeting_prep' | 'interview_prep') => {
    try {
      const auth = getAuth();
      const firebaseUser = auth.currentUser;
      
      if (!firebaseUser) return false;

      const token = await firebaseUser.getIdToken();
      
      const API_URL = BACKEND_URL;

      const response = await fetch(`${API_URL}/api/user/increment-usage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ feature }),
      });

      if (!response.ok) {
        throw new Error('Failed to increment usage');
      }

      // Refresh subscription data
      await fetchSubscription();
      return true;
    } catch (err) {
      console.error('Error incrementing usage:', err);
      return false;
    }
  };

  return {
    subscription,
    loading,
    error,
    refetch: fetchSubscription,
    incrementUsage,
  };
}
