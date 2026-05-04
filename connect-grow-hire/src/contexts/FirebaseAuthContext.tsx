// src/contexts/FirebaseAuthContext.tsx

"use client";


import React, { createContext, useContext, useState, useEffect } from "react";
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
import posthog from "../lib/posthog";

const getMonthKey = () => new Date().toISOString().slice(0, 7);
const initialCreditsByTier = (tier: "free" | "pro" | "elite") => {
  if (tier === "free") return 300;
  if (tier === "pro") return 1500;
  if (tier === "elite") return 3000;
  return 300; // default to free
};

interface User {
  uid: string;
  email: string;
  name: string;
  picture?: string;
  accessToken?: string;
  tier: "free" | "pro";
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

  // Phase 1 personalization gate (used by ProfileConfirmModal):
  //   - schemaVersion === 1   user has the v1 schema fields
  //   - backfillProcessed     phase1_backfill.py has populated them
  //   - profileConfirmedAt    user has confirmed via the modal
  schemaVersion?: number;
  backfillProcessed?: boolean;
  profileConfirmedAt?: string | null;
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
            console.log("[AUTH CONTEXT] Loading user data");
            await loadUserData(firebaseUser);
            console.log("🔐 [AUTH CONTEXT] User data loaded");
          } else {
            console.log("🔐 [AUTH CONTEXT] No Firebase user, setting user state to null");
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
        const userData = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || "",
          name: firebaseUser.displayName || "",
          picture: firebaseUser.photoURL || undefined,
          tier: d.tier || "free",
          credits: d.credits ?? initialCreditsByTier(d.tier || "free"),
          maxCredits: d.maxCredits ?? initialCreditsByTier(d.tier || "free"),
          stripeCustomerId: d.stripeCustomerId,
          stripeSubscriptionId: d.stripeSubscriptionId,
          subscriptionStatus: d.subscriptionStatus,
          subscriptionStartDate: d.subscriptionStartDate,
          subscriptionEndDate: d.subscriptionEndDate,
          emailsMonthKey: d.emailsMonthKey || getMonthKey(),
          emailsUsedThisMonth: d.emailsUsedThisMonth ?? 0,
          needsOnboarding: d.needsOnboarding ?? false,
          schemaVersion: d.schemaVersion,
          backfillProcessed: d.backfillProcessed,
          profileConfirmedAt: d.profileConfirmedAt ?? null,
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