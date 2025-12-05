// Dashboard statistics utilities
import { firebaseApi } from '../services/firebaseApi';
import { Timestamp } from 'firebase/firestore';

export interface WeeklySummary {
  contactsGenerated: number;
  firmsSearched: number;
  coffeeChatsCreated: number;
  interviewPrepsCreated: number;
  totalActivities: number;
}

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
}

export interface Goal {
  id: string;
  type: 'contacts' | 'firms' | 'coffeeChats' | 'outreach';
  target: number;
  period: 'month' | 'week' | 'year';
  startDate: Timestamp;
  endDate: Timestamp;
}

export interface GoalProgress {
  goal: Goal;
  current: number;
  target: number;
  percentage: number;
}

/**
 * Calculate weekly summary from activities
 */
export async function calculateWeeklySummary(userId: string): Promise<WeeklySummary> {
  try {
    // Get all activities (we'll filter by date)
    const activities = await firebaseApi.getActivities(userId, 100);
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoTimestamp = Timestamp.fromDate(sevenDaysAgo);
    
    const weeklyActivities = activities.filter(activity => {
      if (!activity.timestamp) return false;
      const activityDate = activity.timestamp.toMillis 
        ? activity.timestamp.toMillis() 
        : activity.timestamp;
      const sevenDaysAgoMs = sevenDaysAgoTimestamp.toMillis();
      return activityDate >= sevenDaysAgoMs;
    });
    
    const summary: WeeklySummary = {
      contactsGenerated: 0,
      firmsSearched: 0,
      coffeeChatsCreated: 0,
      interviewPrepsCreated: 0,
      totalActivities: weeklyActivities.length,
    };
    
    weeklyActivities.forEach(activity => {
      switch (activity.type) {
        case 'contactSearch':
          summary.contactsGenerated++;
          break;
        case 'firmSearch':
          summary.firmsSearched++;
          break;
        case 'coffeePrep':
          summary.coffeeChatsCreated++;
          break;
        case 'interviewPrep':
          summary.interviewPrepsCreated++;
          break;
      }
    });
    
    return summary;
  } catch (error) {
    console.error('Error calculating weekly summary:', error);
    return {
      contactsGenerated: 0,
      firmsSearched: 0,
      coffeeChatsCreated: 0,
      interviewPrepsCreated: 0,
      totalActivities: 0,
    };
  }
}

/**
 * Calculate streak from activities
 * Tracks consecutive days the user has logged on (any activity counts as logging on)
 */
export async function calculateStreak(userId: string): Promise<StreakData> {
  try {
    // Get more activities to ensure we capture all login days
    const activities = await firebaseApi.getActivities(userId, 200);
    
    if (activities.length === 0) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        lastActivityDate: null,
      };
    }
    
    // Group activities by day (any activity on a day counts as "logged on")
    const activitiesByDay = new Map<string, boolean>();
    
    activities.forEach(activity => {
      if (!activity.timestamp) return;
      const activityDate = activity.timestamp.toMillis 
        ? new Date(activity.timestamp.toMillis())
        : new Date(activity.timestamp);
      const dayKey = activityDate.toISOString().split('T')[0]; // YYYY-MM-DD
      activitiesByDay.set(dayKey, true);
    });
    
    // Get sorted unique days
    const sortedDays = Array.from(activitiesByDay.keys()).sort().reverse();
    
    if (sortedDays.length === 0) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        lastActivityDate: null,
      };
    }
    
    // Calculate current streak
    let currentStreak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let checkDate = new Date(today);
    
    for (let i = 0; i < sortedDays.length; i++) {
      const dayKey = sortedDays[i];
      const dayDate = new Date(dayKey);
      dayDate.setHours(0, 0, 0, 0);
      
      // Check if this day matches our expected date
      const expectedDateKey = checkDate.toISOString().split('T')[0];
      
      if (dayKey === expectedDateKey) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        // If we're checking today/yesterday and there's no match, break
        if (i === 0 && dayKey !== expectedDateKey) {
          // Check if yesterday had activity (streak continues from yesterday)
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayKey = yesterday.toISOString().split('T')[0];
          
          if (dayKey === yesterdayKey) {
            currentStreak = 1;
            checkDate.setDate(checkDate.getDate() - 1);
            continue;
          }
        }
        break;
      }
    }
    
    // Calculate longest streak
    let longestStreak = 1;
    let tempStreak = 1;
    
    for (let i = 1; i < sortedDays.length; i++) {
      const prevDate = new Date(sortedDays[i - 1]);
      const currDate = new Date(sortedDays[i]);
      const diffDays = Math.floor((prevDate.getTime() - currDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        tempStreak++;
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        tempStreak = 1;
      }
    }
    
    return {
      currentStreak,
      longestStreak,
      lastActivityDate: sortedDays[0] || null,
    };
  } catch (error) {
    console.error('Error calculating streak:', error);
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastActivityDate: null,
    };
  }
}

/**
 * Calculate goal progress
 */
export async function calculateGoalProgress(
  userId: string,
  goal: Goal
): Promise<GoalProgress> {
  try {
    let current = 0;
    
    const startDate = goal.startDate.toMillis();
    const endDate = goal.endDate.toMillis();
    
    switch (goal.type) {
      case 'contacts': {
        const contacts = await firebaseApi.getContacts(userId);
        current = contacts.filter(contact => {
          if (!contact.createdAt) return false;
          const contactDate = new Date(contact.createdAt).getTime();
          return contactDate >= startDate && contactDate <= endDate;
        }).length;
        break;
      }
      case 'firms': {
        const activities = await firebaseApi.getActivities(userId, 100);
        current = activities.filter(activity => {
          if (activity.type !== 'firmSearch' || !activity.timestamp) return false;
          const activityDate = activity.timestamp.toMillis 
            ? activity.timestamp.toMillis()
            : activity.timestamp;
          return activityDate >= startDate && activityDate <= endDate;
        }).length;
        break;
      }
      case 'coffeeChats': {
        const activities = await firebaseApi.getActivities(userId, 100);
        current = activities.filter(activity => {
          if (activity.type !== 'coffeePrep' || !activity.timestamp) return false;
          const activityDate = activity.timestamp.toMillis 
            ? activity.timestamp.toMillis()
            : activity.timestamp;
          return activityDate >= startDate && activityDate <= endDate;
        }).length;
        break;
      }
      case 'outreach': {
        // Outreach = contacts that have been contacted (status !== 'Not Contacted')
        const contacts = await firebaseApi.getContacts(userId);
        current = contacts.filter(contact => {
          if (!contact.firstContactDate || contact.status === 'Not Contacted') return false;
          const contactDate = new Date(contact.firstContactDate).getTime();
          return contactDate >= startDate && contactDate <= endDate;
        }).length;
        break;
      }
    }
    
    const percentage = goal.target > 0 ? Math.min(100, (current / goal.target) * 100) : 0;
    
    return {
      goal,
      current,
      target: goal.target,
      percentage,
    };
  } catch (error) {
    console.error('Error calculating goal progress:', error);
    return {
      goal,
      current: 0,
      target: goal.target,
      percentage: 0,
    };
  }
}

/**
 * Get default monthly goals for a user
 */
export function getDefaultMonthlyGoals(): Omit<Goal, 'id' | 'startDate' | 'endDate'>[] {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  
  return [
    {
      type: 'contacts',
      target: 50,
      period: 'month',
    },
    {
      type: 'firms',
      target: 20,
      period: 'month',
    },
    {
      type: 'coffeeChats',
      target: 10,
      period: 'month',
    },
  ];
}

