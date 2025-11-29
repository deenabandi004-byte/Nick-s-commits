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

const getMonthKey = () => new Date().toISOString().slice(0, 7);
const initialCreditsByTier = (tier: "free" | "pro") => (tier === "free" ? 150 : 1800);

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
  
  // Resume fields
  resumeUrl?: string;
  resumeFileName?: string;
  resumeParsed?: any;
  resumeUpdatedAt?: string;
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
        await setPersistence(auth, browserLocalPersistence);
      } catch {}
      finally {
        unsub = onIdTokenChanged(auth, async (firebaseUser) => {
          if (firebaseUser) {
            await loadUserData(firebaseUser);
          } else {
            setUser(null);
          }
          setIsLoading(false);
        });
      }
    })();
    return () => { if (unsub) unsub(); };
  }, []);

  const loadUserData = async (firebaseUser: FirebaseUser) => {
    try {
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const snap = await getDoc(userDocRef);
      if (snap.exists()) {
        const d = snap.data() as Partial<User>;
        setUser({
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
          
          // Resume fields - load from Firestore for persistence
          resumeUrl: d.resumeUrl,
          resumeFileName: d.resumeFileName,
          resumeParsed: d.resumeParsed,
          resumeUpdatedAt: d.resumeUpdatedAt,
        });
      } else {
        const newUser: User = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || "",
          name: firebaseUser.displayName || "",
          picture: firebaseUser.photoURL || undefined,
          tier: "free",
          credits: 150,
          maxCredits: 150,
          emailsMonthKey: getMonthKey(),
          emailsUsedThisMonth: 0,
          needsOnboarding: true,
        };
        await setDoc(userDocRef, { ...newUser, createdAt: new Date().toISOString() });
        setUser(newUser);
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
        credits: 120,
        maxCredits: 120,
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
      await firebaseSignOut(auth);
      setUser(null);
    } catch (error) {
      console.error("Sign out failed:", error);
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
    const ref = doc(db, "users", user.uid);
    await updateDoc(ref, { credits: newCredits });
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
    if (!user) return;
    const ref = doc(db, "users", user.uid);

    // Import resume upload utility
    const { uploadResume } = await import('../lib/resumeUtils');

    // 1. Upload resume if provided
    let resumeData = null;
    if (onboardingData.profile?.resume instanceof File) {
      try {
        resumeData = await uploadResume(onboardingData.profile.resume, user.uid, true);
        console.log('✅ Resume uploaded during onboarding:', resumeData);
      } catch (error) {
        console.error('❌ Failed to upload resume during onboarding:', error);
        // Continue without resume - user can upload later
      }
    }

    // 2. Flatten all nested data to root level for flat schema
    const payload: any = {
      uid: user.uid,
      email: user.email || onboardingData.profile?.email || '',
      name: user.name || `${onboardingData.profile?.firstName || ''} ${onboardingData.profile?.lastName || ''}`.trim() || '',
      firstName: onboardingData.profile?.firstName || '',
      lastName: onboardingData.profile?.lastName || '',
      phone: onboardingData.profile?.phone || '',
      picture: user.picture,
      tier: "free",
      credits: initialCreditsByTier("free"),
      maxCredits: initialCreditsByTier("free"),
      emailsMonthKey: getMonthKey(),
      emailsUsedThisMonth: 0,
      createdAt: new Date().toISOString(),
      needsOnboarding: false,
      
      // Academic fields (flat)
      university: onboardingData.academics?.university || '',
      college: onboardingData.academics?.university || '', // Backend fallback
      degree: onboardingData.academics?.degree || '',
      currentDegree: onboardingData.academics?.degree || '',
      major: onboardingData.academics?.major || '',
      fieldOfStudy: onboardingData.academics?.major || '',
      graduationMonth: onboardingData.academics?.graduationMonth || '',
      graduationYear: onboardingData.academics?.graduationYear || '',
      
      // Location/Career fields (flat)
      country: onboardingData.location?.country || '',
      state: onboardingData.location?.state || '',
      city: onboardingData.location?.city || '',
      preferredLocation: onboardingData.location?.preferredLocation || [],
      preferredLocations: onboardingData.location?.preferredLocation || [],
      jobTypes: onboardingData.location?.jobTypes || [],
      interests: onboardingData.location?.interests || [],
      industriesOfInterest: onboardingData.location?.interests || [],
      careerInterests: onboardingData.location?.interests || [],
      preferredJobRole: onboardingData.location?.preferredJobRole || '',
    };

    // 3. Add resume data if uploaded
    if (resumeData) {
      payload.resumeUrl = resumeData.resumeUrl;
      payload.resumeFileName = resumeData.resumeFileName;
      payload.resumeParsed = resumeData.resumeParsed;
      payload.resumeUpdatedAt = resumeData.resumeUpdatedAt;
    }

    // 4. Save to Firestore
    await setDoc(ref, payload, { merge: true });
    setUser({ ...user, ...payload, needsOnboarding: false });
    
    console.log('✅ Onboarding data saved with flat schema');
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