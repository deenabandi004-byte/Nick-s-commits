// src/contexts/FirebaseAuthContext.tsx

"use client";


import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import {
  User as FirebaseUser,
  signInWithPopup,
  signOut as firebaseSignOut,
  onIdTokenChanged,
  setPersistence,
  browserLocalPersistence,
  getAdditionalUserInfo,
  GoogleAuthProvider,
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { BACKEND_URL } from "@/services/api";
import posthog from "../lib/posthog";

const getMonthKey = () => new Date().toISOString().slice(0, 7);
const initialCreditsByTier = (tier: "free" | "pro" | "elite") => {
  // Keep in sync with TIER_CONFIGS (@/lib/constants) and backend config.py.
  if (tier === "free") return 300;
  if (tier === "pro") return 2000;
  if (tier === "elite") return 5000;
  return 300; // default to free
};

interface User {
  uid: string;
  email: string;
  name: string;
  picture?: string;
  accessToken?: string;
  tier: "free" | "pro" | "elite";
  subscriptionTier?: "free" | "pro" | "elite";
  credits: number;
  maxCredits: number;
  subscriptionId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: string;
  subscriptionStartDate?: string;
  subscriptionEndDate?: string;
  emailsUsedThisMonth?: number;
  emailsMonthKey?: string;
  needsOnboarding?: boolean;
  careerTrack?: string;

}

type SignInOptions = {
  prompt?: "select_account" | "consent";
};

type NextRoute = "onboarding" | "home";

interface AuthContextType {
  user: User | null;
  signIn: (opts?: SignInOptions) => Promise<NextRoute>;
  signOut: () => void;
  updateUser: (updates: Partial<User>) => Promise<void>;
  updateCredits: (newCredits: number) => Promise<void>;
  checkCredits: () => Promise<number>;
  completeOnboarding: (onboardingData: any) => Promise<void>;
  refreshUser: () => Promise<void>;
  isLoading: boolean;
}

const FirebaseAuthContext = createContext<AuthContextType | undefined>(undefined);

export const useFirebaseAuth = () => {
  const context = useContext(FirebaseAuthContext);
  if (!context) throw new Error("useFirebaseAuth must be used within a FirebaseAuthProvider");
  return context;
};

export const FirebaseAuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Tracks the uid whose Firestore profile we've already loaded, so token
  // refreshes (which also fire onIdTokenChanged) don't re-fetch the user doc.
  const lastLoadedUidRef = useRef<string | null>(null);

  useEffect(() => {
    let unsub: undefined | (() => void);
    (async () => {
      try {
        console.log("🔐 [AUTH CONTEXT] Setting up auth state listener...");
        await setPersistence(auth, browserLocalPersistence);
      } catch {}
      finally {
        unsub = onIdTokenChanged(auth, async (firebaseUser) => {
          console.log("🔐 [AUTH CONTEXT] Auth state changed:", {
            hasUser: !!firebaseUser,
            userEmail: firebaseUser?.email || "none",
            userId: firebaseUser?.uid || "none"
          });
          if (firebaseUser) {
            // onIdTokenChanged also fires on hourly token refreshes and on any
            // getIdToken(true) call (e.g. completeOnboarding). Only (re)load the
            // Firestore profile when the signed-in uid actually changes — a token
            // refresh for the same user must not re-fetch the doc or churn state.
            if (lastLoadedUidRef.current !== firebaseUser.uid) {
              lastLoadedUidRef.current = firebaseUser.uid;
              console.log("[AUTH CONTEXT] Loading user data");
              await loadUserData(firebaseUser);
              console.log("🔐 [AUTH CONTEXT] User data loaded");
              // D11 lazy backfill: fire-and-forget call to the sync endpoint.
              // Backend gates on ENABLE_APIFY_USER_LINKEDIN + per-user flag +
              // cooldown so a misfire here is just a no-op. Wrapped so a
              // network error here does NOT block auth resolution.
              void (async () => {
                try {
                  const token = await firebaseUser.getIdToken();
                  await fetch(`${BACKEND_URL}/api/users/me/sync-linkedin`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${token}`,
                    },
                  });
                } catch (e) {
                  console.log("[Apify Backfill] sync call failed (non-fatal):", e);
                }
              })();
            } else {
              console.log("🔐 [AUTH CONTEXT] Token refresh for same uid, skipping reload");
            }
          } else {
            console.log("🔐 [AUTH CONTEXT] No Firebase user, setting user state to null");
            lastLoadedUidRef.current = null;
            setUser(null);
          }
          setIsLoading(false);
          console.log("🔐 [AUTH CONTEXT] Auth state update complete, isLoading set to false");
        });
      }
    })();
    return () => { 
      console.log("🔐 [AUTH CONTEXT] Cleaning up auth state listener");
      if (unsub) unsub(); 
    };
  }, []);

  const identifyUser = (user: User, userDocData?: any) => {
    try {
      const properties: Record<string, any> = {
        // Note: Email is NOT included to avoid sending PII to analytics
        // PostHog identifies users by UID, which is sufficient for tracking
        plan: user.tier || "free",
      };

      // Include signup_source if available in user document
      if (userDocData?.signup_source) {
        properties.signup_source = userDocData.signup_source;
      }

      posthog.identify(user.uid, properties);
      // Removed console.log to avoid exposing user data in browser console
    } catch (error) {
      // Only log errors, not user data
      console.error("❌ [PostHog] Failed to identify user:", error);
    }
  };

  const loadUserData = async (firebaseUser: FirebaseUser) => {
    try {
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const snap = await getDoc(userDocRef);
      if (snap.exists()) {
        const d = snap.data() as Partial<User>;
        // subscriptionTier is the source of truth; tier is a legacy fallback
        // that can be stale (e.g. "free") on upgraded Pro/Elite accounts. Read
        // both so tier-gated UI (e.g. ProGate) sees the real plan.
        const resolvedTier = d.subscriptionTier || d.tier || "free";
        const userData = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || "",
          name: firebaseUser.displayName || "",
          picture: firebaseUser.photoURL || undefined,
          tier: resolvedTier,
          subscriptionTier: resolvedTier,
          credits: d.credits ?? initialCreditsByTier(resolvedTier),
          maxCredits: d.maxCredits ?? initialCreditsByTier(resolvedTier),
          stripeCustomerId: d.stripeCustomerId,
          stripeSubscriptionId: d.stripeSubscriptionId,
          subscriptionStatus: d.subscriptionStatus,
          subscriptionStartDate: d.subscriptionStartDate,
          subscriptionEndDate: d.subscriptionEndDate,
          emailsMonthKey: d.emailsMonthKey || getMonthKey(),
          emailsUsedThisMonth: d.emailsUsedThisMonth ?? 0,
          needsOnboarding: d.needsOnboarding ?? false,
          careerTrack: d.careerTrack || (d as any).goals?.careerTrack || (d as any).professionalInfo?.careerTrack,
        };
        setUser(userData);
        // Identify user after data is loaded
        identifyUser(userData, d);
      } else {
        const newUser: User = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || "",
          name: firebaseUser.displayName || "",
          picture: firebaseUser.photoURL || undefined,
          tier: "free",
          credits: 300,
          maxCredits: 300,
          emailsMonthKey: getMonthKey(),
          emailsUsedThisMonth: 0,
          needsOnboarding: true,
        };
        await setDoc(userDocRef, { ...newUser, createdAt: new Date().toISOString() });
        // Referral attribution (best-effort, must not block onboarding)
        try {
          const refCode =
            new URLSearchParams(window.location.search).get('ref') ||
            localStorage.getItem('offerloop_ref');
          if (refCode) {
            const { apiService } = await import('../services/api');
            await apiService.attributeReferral(refCode);
          }
        } catch (e) {
          console.error('Referral attribution failed:', e);
        } finally {
          localStorage.removeItem('offerloop_ref');
        }
        setUser(newUser);
        // Identify new user after data is set
        identifyUser(newUser);
      }
    } catch (err) {
      console.error("Error loading user data:", err);
      setUser(null);
    }
  };

const signIn = async (opts?: SignInOptions): Promise<NextRoute> => {
  try {
    setIsLoading(true);
    const provider = new GoogleAuthProvider();

    // ✅ No Gmail scopes here anymore. We only sign the user into your app.
    if (opts?.prompt) {
      provider.setCustomParameters({ prompt: opts.prompt });
    }

    console.log('🔐 Starting basic Google sign-in (no Gmail scopes)');
    const result = await signInWithPopup(auth, provider);
    const info = getAdditionalUserInfo(result);

    // Ensure user doc exists (without storing Gmail tokens)
    const uid = result.user.uid;
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      await setDoc(ref, {
        uid,
        email: result.user.email || "",
        name: result.user.displayName || "",
        picture: result.user.photoURL || undefined,
        tier: "free",
        credits: 300,
        maxCredits: 300,
        emailsMonthKey: getMonthKey(),
        emailsUsedThisMonth: 0,
        needsOnboarding: true,
        createdAt: new Date().toISOString(),
        lastSignIn: new Date().toISOString(),
      });
      // Brand-new account: no Firestore doc existed. Co-gate on Firebase's own
      // isNewUser so this cannot misfire if a doc is ever missing for an
      // existing account. No email or PII; attribution is handled by the
      // onIdTokenChanged identify path.
      if (info?.isNewUser) {
        posthog.capture('sign_up', { signup_method: 'google' });
      }
      return "onboarding";
    } else {
      await updateDoc(ref, { lastSignIn: new Date().toISOString() });
    }

    const data = snap.data() as Partial<User>;
    const needs = data.needsOnboarding ?? !!info?.isNewUser;
    console.log('✅ Sign-in complete. Needs onboarding:', needs);
    return needs ? "onboarding" : "home";
  } catch (error: any) {
    console.error("❌ Authentication failed:", error);
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);
    throw error;
  } finally {
    setIsLoading(false);
  }
};


  const signOut = async () => {
    try {
      console.log("🔐 [AUTH CONTEXT] signOut() called");
      console.log("[AUTH CONTEXT] Signing out");
      await firebaseSignOut(auth);
      // Reset PostHog user session
      try {
        posthog.reset();
        // Removed console.log to avoid logging user actions
      } catch (error) {
        // Only log errors, not user actions
        console.error("❌ [PostHog] Failed to reset session:", error);
      }
      console.log("🔐 [AUTH CONTEXT] Firebase signOut() completed, setting user state to null");
      // Clear the pricing-page tier hint so a signed-out visitor never sees a stale tier.
      try { localStorage.removeItem('offerloop_tier'); } catch {}
      setUser(null);
      console.log("🔐 [AUTH CONTEXT] User state set to null");
    } catch (error) {
      console.error("❌ [AUTH CONTEXT] Sign out failed:", error);
      console.error("❌ [AUTH CONTEXT] Error details:", {
        message: error instanceof Error ? error.message : String(error),
        code: (error as any)?.code
      });
    }
  };

  const updateUser = async (updates: Partial<User>) => {
    if (!user) return;
    const ref = doc(db, "users", user.uid);
    await updateDoc(ref, updates);
    setUser({ ...user, ...updates });
  };

  const updateCredits = async (newCredits: number) => {
    if (!user) return;
    // Only update local state — the backend already wrote the correct value to Firestore.
    // Skipping the redundant Firestore write saves 50-200ms per credit deduction.
    setUser({ ...user, credits: newCredits });
  };

  const checkCredits = async (): Promise<number> => {
    if (!user) return 0;
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    const data = snap.exists() ? (snap.data() as Partial<User>) : {};
    const credits = data.credits ?? 0;
    if (credits !== user.credits) setUser({ ...user, credits });
    return credits;
  };

  const refreshUser = async () => {
    if (!auth.currentUser) {
      console.warn("No authenticated user to refresh");
      return;
    }
    
    try {
      await loadUserData(auth.currentUser);
      console.log("User data refreshed successfully");
    } catch (error) {
      console.error("Error refreshing user data:", error);
    }
  };

  const completeOnboarding = async (onboardingData: any) => {
    // Ensure user is authenticated
    if (!auth.currentUser) {
      console.error("❌ [ONBOARDING] User not authenticated");
      throw new Error("User not authenticated");
    }

    // Ensure we have user data
    if (!user) {
      console.error("❌ [ONBOARDING] User data not loaded");
      throw new Error("User data not loaded");
    }

    // Force token refresh to ensure permissions are up to date
    try {
      await auth.currentUser.getIdToken(true);
      console.log("✅ [ONBOARDING] Auth token refreshed");
    } catch (tokenError) {
      console.error("❌ [ONBOARDING] Failed to refresh token:", tokenError);
      throw new Error("Failed to refresh authentication token");
    }

    const ref = doc(db, "users", user.uid);
    console.log("[ONBOARDING] Saving onboarding data");

    const clean = (obj: any): any => {
      const out: any = {};
      Object.keys(obj || {}).forEach((k) => {
        const v = obj[k];
        if (v !== undefined) out[k] = typeof v === "object" && v !== null && !Array.isArray(v) ? clean(v) : v;
      });
      return out;
    };

    const cleaned = clean(onboardingData);
    
    // Check if document already exists
    const docSnapshot = await getDoc(ref);
    const docExists = docSnapshot.exists();
    
    if (docExists) {
      // Document exists - use updateDoc and exclude tier/maxCredits to comply with security rules
      // These fields are already set during sign-in, so we don't need to update them
      const { tier, maxCredits, ...updatePayload } = {
        ...cleaned,
        uid: user.uid,
        email: user.email,
        name: user.name,
        picture: user.picture,
        credits: initialCreditsByTier("free"),
        emailsMonthKey: getMonthKey(),
        emailsUsedThisMonth: 0,
        needsOnboarding: false,
      };
      
      // Only include createdAt if it doesn't exist in the document
      const existingData = docSnapshot.data();
      if (!existingData?.createdAt) {
        updatePayload.createdAt = new Date().toISOString();
      }
      
      console.log("💾 [ONBOARDING] Document exists, using updateDoc");
      try {
        await updateDoc(ref, updatePayload);
        console.log("✅ [ONBOARDING] Onboarding data updated successfully");
        setUser({ ...user, ...updatePayload, needsOnboarding: false });
      } catch (error: any) {
        console.error("❌ [ONBOARDING] Failed to update onboarding data:", error);
        console.error("❌ [ONBOARDING] Error code:", error.code);
        console.error("❌ [ONBOARDING] Error message:", error.message);
        throw error;
      }
    } else {
      // Document doesn't exist - use setDoc to create it
      const payload = {
        ...cleaned,
        uid: user.uid,
        email: user.email,
        name: user.name,
        picture: user.picture,
        tier: "free",
        credits: initialCreditsByTier("free"),
        maxCredits: initialCreditsByTier("free"),
        emailsMonthKey: getMonthKey(),
        emailsUsedThisMonth: 0,
        createdAt: new Date().toISOString(),
        needsOnboarding: false,
      };
      
      console.log("💾 [ONBOARDING] Document doesn't exist, using setDoc (create)");
      try {
        await setDoc(ref, payload);
        console.log("✅ [ONBOARDING] Onboarding data created successfully");
        setUser({ ...user, ...payload, needsOnboarding: false });
      } catch (error: any) {
        console.error("❌ [ONBOARDING] Failed to create onboarding data:", error);
        console.error("❌ [ONBOARDING] Error code:", error.code);
        console.error("❌ [ONBOARDING] Error message:", error.message);
        throw error;
      }
    }
  };

  return (
    <FirebaseAuthContext.Provider
      value={{ 
        user, 
        signIn, 
        signOut, 
        updateUser, 
        updateCredits, 
        checkCredits, 
        completeOnboarding, 
        refreshUser,
        isLoading 
      }}
    >
      {children}
    </FirebaseAuthContext.Provider>
  );
};