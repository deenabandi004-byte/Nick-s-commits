// src/services/firebaseApi.ts
import { db } from '../lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';

// ================================
// TYPES
// ================================
export interface Contact {
  id?: string;
  firstName: string;
  lastName: string;
  linkedinUrl: string;
  email: string;
  company: string;
  jobTitle: string;
  college: string;
  location: string;
  firstContactDate: string;
  status: string;
  lastContactDate: string;
  emailSubject?: string;
  emailBody?: string;
  createdAt?: string;
  updatedAt?: string;

  // ================================
  // NEW: Gmail tracking fields
  // ================================
  gmailThreadId?: string;
  gmailMessageId?: string;
  gmailDraftId?: string;
  gmailDraftUrl?: string;
  hasUnreadReply?: boolean;
  notificationsMuted?: boolean;
  draftCreatedAt?: string;
  lastChecked?: string;
  mutedAt?: string;
}

export interface ProfessionalInfo {
  firstName: string;
  lastName: string;
  university: string;
  currentDegree: string;
  fieldOfStudy: string;
  graduationYear: string;
  targetIndustries: string[];
  linkedinUrl?: string;
  careerGoals?: string;
}

export interface UserData {
  email: string;
  name: string;
  credits: number;
  maxCredits: number;
  tier: 'free' | 'pro';
  createdAt: string;
  lastLogin?: string;
  professionalInfo?: ProfessionalInfo;
  needsOnboarding?: boolean;
}

// ================================
// API
// ================================
export const firebaseApi = {
  // ----------------
  // USER MANAGEMENT
  // ----------------
  async createUser(uid: string, userData: Partial<UserData>): Promise<void> {
    const userRef = doc(db, 'users', uid);
    await setDoc(
      userRef,
      {
        ...userData,
        createdAt: userData.createdAt || new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      },
      { merge: true }
    );
  },

  async getUser(uid: string): Promise<UserData | null> {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return null;
    return userSnap.data() as UserData;
  },

  async updateUser(uid: string, updates: Partial<UserData>): Promise<void> {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      ...updates,
      lastLogin: new Date().toISOString(),
    });
  },

  async updateCredits(uid: string, credits: number): Promise<void> {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, { credits });
  },

  // ----------------
  // PROFESSIONAL INFO
  // ----------------
  async saveProfessionalInfo(uid: string, info: ProfessionalInfo): Promise<void> {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      professionalInfo: info,
      needsOnboarding: false,
    });
  },

  async getProfessionalInfo(uid: string): Promise<ProfessionalInfo | null> {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return null;

    const userData = userSnap.data() as UserData;
    return userData.professionalInfo || null;
  },

  // ----------------
  // CONTACT MANAGEMENT
  // ----------------
  async createContact(uid: string, contact: Omit<Contact, 'id'>): Promise<string> {
    const contactsRef = collection(db, 'users', uid, 'contacts');
    const newContactRef = doc(contactsRef);

    const contactData = {
      ...contact,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await setDoc(newContactRef, contactData);
    return newContactRef.id;
  },

  async bulkCreateContacts(uid: string, contacts: Omit<Contact, 'id'>[]): Promise<void> {
    const batch = writeBatch(db);
    const contactsRef = collection(db, 'users', uid, 'contacts');

    for (const contact of contacts) {
      const newContactRef = doc(contactsRef);
      const contactData = {
        ...contact,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      batch.set(newContactRef, contactData);
    }

    await batch.commit();
  },

  async getContacts(uid: string): Promise<Contact[]> {
    const contactsRef = collection(db, 'users', uid, 'contacts');
    const snapshot = await getDocs(contactsRef);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Contact[];
  },

  async getContact(uid: string, contactId: string): Promise<Contact | null> {
    const contactRef = doc(db, 'users', uid, 'contacts', contactId);
    const contactSnap = await getDoc(contactRef);
    if (!contactSnap.exists()) return null;

    return { id: contactSnap.id, ...contactSnap.data() } as Contact;
  },

  async updateContact(uid: string, contactId: string, updates: Partial<Contact>): Promise<void> {
    const contactRef = doc(db, 'users', uid, 'contacts', contactId);
    await updateDoc(contactRef, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  },

  async deleteContact(uid: string, contactId: string): Promise<void> {
    const contactRef = doc(db, 'users', uid, 'contacts', contactId);
    await deleteDoc(contactRef);
  },

  async clearAllContacts(uid: string): Promise<void> {
    const contactsRef = collection(db, 'users', uid, 'contacts');
    const snapshot = await getDocs(contactsRef);
    const batch = writeBatch(db);

    snapshot.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  },

  async findContactByEmail(uid: string, email: string): Promise<Contact | null> {
    const contactsRef = collection(db, 'users', uid, 'contacts');
    const q = query(contactsRef, where('email', '==', email));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return null;

    const d = snapshot.docs[0];
    return { id: d.id, ...d.data() } as Contact;
  },

  // ================================
  // ACTIVITY LOGGING
  // ================================
  async logActivity(
    uid: string,
    type: 'firmSearch' | 'contactSearch' | 'coffeePrep' | 'interviewPrep',
    summary: string,
    metadata?: any
  ): Promise<void> {
    try {
      console.log('📝 Logging activity:', { uid, type, summary, metadata });
      const activitiesRef = collection(db, 'users', uid, 'activity');
      const activityDoc = doc(activitiesRef);
      await setDoc(activityDoc, {
        type,
        summary,
        timestamp: Timestamp.now(),
        metadata: metadata || {},
      });
      console.log('✅ Activity logged successfully');
    } catch (error) {
      console.error('❌ Failed to log activity:', error);
      throw error; // Re-throw so caller knows it failed
    }
  },

  async getActivities(uid: string, limitCount: number = 10): Promise<Array<{
    id: string;
    type: string;
    summary: string;
    timestamp: any;
    metadata?: any;
  }>> {
    try {
      const activitiesRef = collection(db, 'users', uid, 'activity');
      
      // Try with orderBy first, fallback to getting all and sorting client-side if index doesn't exist
      let snapshot;
      try {
        const q = query(activitiesRef, orderBy('timestamp', 'desc'), limit(limitCount));
        snapshot = await getDocs(q);
      } catch (error: any) {
        // If orderBy fails (likely missing index), get all and sort client-side
        console.warn('Firestore index may be missing, fetching all activities and sorting client-side:', error);
        const allSnapshot = await getDocs(activitiesRef);
        const allActivities = allSnapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Array<{
          id: string;
          type: string;
          summary: string;
          timestamp: any;
          metadata?: any;
        }>;
        
        // Sort by timestamp desc and limit
        return allActivities
          .filter(a => a.timestamp)
          .sort((a, b) => {
            const aTime = a.timestamp?.toMillis?.() || 0;
            const bTime = b.timestamp?.toMillis?.() || 0;
            return bTime - aTime;
          })
          .slice(0, limitCount);
      }
      
      return snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Array<{
        id: string;
        type: string;
        summary: string;
        timestamp: any;
        metadata?: any;
      }>;
    } catch (error) {
      console.error('Error fetching activities:', error);
      return [];
    }
  },

  // ================================
  // GOALS MANAGEMENT
  // ================================
  async getGoals(uid: string): Promise<Array<{
    id: string;
    type: string;
    target: number;
    period: string;
    startDate: any;
    endDate: any;
  }>> {
    try {
      const goalsRef = collection(db, 'users', uid, 'goals');
      const snapshot = await getDocs(goalsRef);
      
      return snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Array<{
        id: string;
        type: string;
        target: number;
        period: string;
        startDate: any;
        endDate: any;
      }>;
    } catch (error) {
      console.error('Error fetching goals:', error);
      return [];
    }
  },

  async createGoal(
    uid: string,
    goal: {
      type: 'contacts' | 'firms' | 'coffeeChats' | 'outreach';
      target: number;
      period: 'month' | 'week' | 'year';
      startDate: Timestamp;
      endDate: Timestamp;
    }
  ): Promise<string> {
    try {
      const goalsRef = collection(db, 'users', uid, 'goals');
      const goalDoc = doc(goalsRef);
      await setDoc(goalDoc, goal);
      return goalDoc.id;
    } catch (error) {
      console.error('Error creating goal:', error);
      throw error;
    }
  },

  async updateUserStreak(uid: string, streakData: {
    currentStreak: number;
    longestStreak: number;
    lastActivityDate: string;
  }): Promise<void> {
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        currentStreak: streakData.currentStreak,
        longestStreak: streakData.longestStreak,
        lastActivityDate: streakData.lastActivityDate,
      });
    } catch (error) {
      console.error('Error updating user streak:', error);
      // Don't throw - streak update shouldn't break activity logging
    }
  },

  async getUserStreak(uid: string): Promise<{
    currentStreak: number;
    longestStreak: number;
    lastActivityDate: string | null;
  } | null> {
    try {
      const userRef = doc(db, 'users', uid);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        return null;
      }
      
      const data = userDoc.data();
      return {
        currentStreak: data.currentStreak || 0,
        longestStreak: data.longestStreak || 0,
        lastActivityDate: data.lastActivityDate || null,
      };
    } catch (error) {
      console.error('Error fetching user streak:', error);
      return null;
    }
  },

  // ----------------
  // TIMELINE MANAGEMENT
  // ----------------
  async saveTimeline(uid: string, timelineData: {
    phases: Array<{
      name: string;
      startMonth: string;
      endMonth: string;
      goals: string[];
      description: string;
    }>;
    startDate: string;
    targetDeadline: string;
    lastPrompt?: string;
    updatedAt?: string;
  }): Promise<void> {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      timeline: {
        ...timelineData,
        updatedAt: new Date().toISOString(),
      },
    });
  },

  async getTimeline(uid: string): Promise<{
    phases: Array<{
      name: string;
      startMonth: string;
      endMonth: string;
      goals: string[];
      description: string;
    }>;
    startDate: string;
    targetDeadline: string;
    lastPrompt?: string;
    updatedAt?: string;
  } | null> {
    try {
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        console.log('❌ User document does not exist');
        return null;
      }
      const data = userSnap.data();
      const timeline = data.timeline;
      if (!timeline || !timeline.phases || timeline.phases.length === 0) {
        console.log('❌ No timeline data found in user document');
        return null;
      }
      console.log('✅ Found timeline in Firestore:', timeline);
      // Ensure lastPrompt is included if it exists
      return {
        ...timeline,
        lastPrompt: timeline.lastPrompt || '',
      };
    } catch (error) {
      console.error('❌ Error getting timeline:', error);
      return null;
    }
  },
};

export default firebaseApi;
