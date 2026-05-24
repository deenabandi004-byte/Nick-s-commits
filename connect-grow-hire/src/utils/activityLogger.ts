// Activity logging utility
import { firebaseApi } from '../services/firebaseApi';
import { apiService, API_BASE_URL } from '../services/api';
import { calculateStreak } from './dashboardStats';

interface ActivityMetadata {
  [key: string]: any;
}

/**
 * Log activity to Firestore
 */
export async function logActivity(
  userId: string,
  type: 'firmSearch' | 'contactSearch' | 'coffeePrep',
  summary: string,
  metadata?: ActivityMetadata
): Promise<void> {
  try {
    console.log('📝 activityLogger.logActivity called:', { userId, type, summary });
    await firebaseApi.logActivity(userId, type, summary, metadata);
    console.log('✅ activityLogger: Activity logged successfully');
    
    // Update streak after logging activity
    try {
      const streakData = await calculateStreak(userId);
      const today = new Date().toISOString().split('T')[0];
      
      // Only update if we have a valid streak and last activity date
      if (streakData.lastActivityDate) {
        await firebaseApi.updateUserStreak(userId, {
          currentStreak: streakData.currentStreak,
          longestStreak: Math.max(streakData.currentStreak, streakData.longestStreak),
          lastActivityDate: streakData.lastActivityDate,
        });
        console.log('✅ Streak updated:', streakData);
      }
    } catch (streakError) {
      console.error('⚠️ Failed to update streak (non-critical):', streakError);
      // Don't throw - streak update failure shouldn't break activity logging
    }
  } catch (error) {
    console.error('❌ activityLogger: Failed to log activity:', error);
    // Don't throw - activity logging should not break the main flow
  }
}

/**
 * Generate firm search summary using OpenAI
 */
export async function generateFirmSearchSummary(
  searchParams: {
    industry?: string;
    location?: string;
    size?: string;
    keywords?: string[];
    [key: string]: any;
  },
  numberOfFirms: number
): Promise<string> {
  try {
    const headers = await apiService.getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/firm-search/generate-summary`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        searchParams,
        numberOfFirms,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to generate summary');
    }

    const data = await response.json();
    return data.summary || `Viewed ${numberOfFirms} firms`;
  } catch (error) {
    console.error('Failed to generate firm search summary:', error);
    // Fallback to simple summary
    const parts: string[] = [];
    if (searchParams.industry) parts.push(searchParams.industry);
    if (searchParams.location) parts.push(`in ${searchParams.location}`);
    return `Viewed ${numberOfFirms} ${parts.length > 0 ? parts.join(' ') : 'firms'}`;
  }
}

/**
 * Generate contact search summary deterministically
 */
export function generateContactSearchSummary(params: {
  jobTitle?: string;
  company?: string;
  location?: string;
  college?: string;
  contactCount: number;
}): string {
  const parts: string[] = [];

  if (params.jobTitle) parts.push(params.jobTitle);
  if (params.company) parts.push(`at ${params.company}`);
  if (params.location) parts.push(`in ${params.location}`);
  if (params.college) parts.push(`who attended ${params.college}`);

  const prefix = parts.length > 0 ? parts.join(' ') : 'contacts';
  return `${prefix} – Generated ${params.contactCount} contacts`;
}

/**
 * Generate meeting prep summary
 */
export function generateCoffeeChatPrepSummary(params: {
  contactName?: string;
  company?: string;
}): string {
  if (params.contactName && params.company) {
    return `Created meeting prep for ${params.contactName} at ${params.company}`;
  } else if (params.contactName) {
    return `Created meeting prep for ${params.contactName}`;
  }
  return 'Created meeting prep';
}

