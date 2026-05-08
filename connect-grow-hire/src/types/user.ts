/**
 * User document type — Phase 1 of the Personalization Data Layer.
 *
 * Mirrors `backend/app/models/users.py:UserDocument`. Keep both sides in
 * sync. All Phase 1 fields are nullable + additive, so adding new fields
 * to either side without the other won't break reads.
 */

export type GraduationStatus = 'student' | 'recent_grad' | 'experienced';
export type TonePreference = 'formal' | 'casual' | 'warm';
export type LengthPreference = 'short' | 'medium';
export type AlumniGraphConsent = 'opt_in' | 'opt_out' | 'pending';
export type SubscriptionTier = 'free' | 'pro' | 'elite';

export type BackfillProvenanceSource =
  | 'inferred_from_resume_backfill'
  | 'inferred_from_resume'
  | 'inferred_from_behavior'
  | 'explicit';

export interface BackfillProvenance {
  // One key per Phase 1 promoted field. Value is which source wrote it.
  [field: string]: BackfillProvenanceSource | string | undefined;
  backfilledAt?: string;
  confirmedAt?: string;
  parserVersion?: string;
}

export interface UserDocument {
  // === Identity (existing) ===
  uid: string;
  email: string;
  name?: string;
  tier: SubscriptionTier;
  subscriptionTier?: SubscriptionTier;
  credits: number;
  maxCredits?: number;
  createdAt: string;
  lastCreditReset?: string;
  subscriptionStatus?: 'active' | null;
  upgraded_at?: string;

  // === Phase 1 promoted fields (all nullable, additive) ===
  schemaVersion: 1;

  school: string | null;
  schoolNormalized: string | null;
  major: string | null;
  graduationYear: number | null;
  graduationStatus: GraduationStatus | null;
  gpa: number | null;
  currentRole: string | null;
  currentCompany: string | null;
  currentCompanyNormalized: string | null;
  targetIndustries: string[];
  targetCompanies: string[];
  targetRoleTypes: string[];
  interestTags: string[];
  tonePreference: TonePreference | null;
  lengthPreference: LengthPreference | null;
  location: string | null;
  openToLocations: string[];

  // === Resume artifacts ===
  resumeUrl: string | null;
  resumeFileName: string | null;
  resumeText?: string;
  resumeUploadedAt?: string;

  // === Deprecated, read-fallback (removed in v3) ===
  professionalInfo?: Record<string, unknown>;

  // === Consent flags (P6) ===
  alumniGraphConsent: AlumniGraphConsent | null;
  alumniGraphConsentAt?: string;

  // === Notification stats (P8 — written by cta_service) ===
  notificationStats?: NotificationStats;

  // === Backfill provenance (set by phase1_backfill.py) ===
  _backfillProvenance?: BackfillProvenance;
  profileConfirmedAt?: string;
}

/**
 * P8 notification fatigue tracker, written by cta_service.
 *
 * - `dismissedCount` is the rolling tally inside the current cooldown
 *   window. cta_service resets it when `quietedUntil` elapses.
 * - `quietedUntil` is the absolute ISO8601 timestamp until which the
 *   dashboard renders "Notifications quieted" instead of new cards.
 */
export interface NotificationStats {
  dismissedCount: number;
  lastDismissedAt: string | null;
  quietedUntil: string | null;
}

/** Read-side projection of an alumniCounts/* document. */
export interface AlumniCountData {
  count: number | null;
  schoolId: string;
  companyId: string;
  office?: string | null;
  source?: 'pdl' | 'serpapi' | 'brightdata';
  lastFetched?: string | null;
  isStale?: boolean;
  miss?: boolean;
}

/** Subset of the user doc returned by GET /api/users/profile-confirm. */
export interface ProfileConfirmReadResponse {
  schemaVersion?: number;
  school?: string | null;
  schoolNormalized?: string | null;
  major?: string | null;
  graduationYear?: number | null;
  graduationStatus?: GraduationStatus | null;
  gpa?: number | null;
  currentRole?: string | null;
  currentCompany?: string | null;
  currentCompanyNormalized?: string | null;
  targetIndustries?: string[];
  targetCompanies?: string[];
  targetRoleTypes?: string[];
  interestTags?: string[];
  tonePreference?: TonePreference | null;
  lengthPreference?: LengthPreference | null;
  location?: string | null;
  openToLocations?: string[];
  _backfillProvenance?: BackfillProvenance;
  profileConfirmedAt?: string;
}

/** Body for POST /api/users/profile-confirm. */
export interface ProfileConfirmWriteRequest {
  school?: string | null;
  major?: string | null;
  graduationYear?: number | null;
  graduationStatus?: GraduationStatus | null;
  gpa?: number | null;
  currentRole?: string | null;
  currentCompany?: string | null;
  targetIndustries?: string[];
  targetCompanies?: string[];
  targetRoleTypes?: string[];
  interestTags?: string[];
  tonePreference?: TonePreference | null;
  lengthPreference?: LengthPreference | null;
  location?: string | null;
  openToLocations?: string[];
}
