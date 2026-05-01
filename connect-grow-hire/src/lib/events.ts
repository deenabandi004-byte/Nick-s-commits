/**
 * Event taxonomy — Phase 2 of the Personalization Data Layer.
 *
 * Mirrors `backend/app/models/events.py`. Discriminated union per event
 * type; each payload is validated with zod before being queued so a typo
 * in a caller doesn't poison the batch.
 *
 * CRITICAL (per §3.1): EmailEditedEvent payload is TYPED. NO raw email
 * text, NO raw diff. Only structured edit categories + character counts.
 * Future event types must follow the same rule — capture the *shape* of
 * what changed, not the content.
 */
import { z } from 'zod';

export type EventType =
  // Selection signals
  | 'contact_saved'
  | 'contact_skipped'
  | 'job_saved'
  | 'job_skipped'
  | 'contact_card_viewed'
  // Email composition signals
  | 'email_drafted'
  | 'email_edited'
  | 'email_sent_clicked'
  | 'email_discarded'
  // Prompt UX
  | 'prompt_shown'
  | 'prompt_answered'
  | 'prompt_dismissed'
  // Dashboard
  | 'dashboard_cta_clicked'
  | 'dashboard_cta_dismissed'
  | 'dashboard_recommendation_viewed'
  | 'dashboard_recommendation_clicked'
  // Profile
  | 'profile_field_edited'
  | 'profile_confirmed'
  // Alumni surface (P6)
  | 'alumni_consent_decision'
  | 'alumni_card_viewed'
  | 'alumni_card_clicked';

// =============================================================================
// Per-payload schemas
// =============================================================================

const ContactRefSchema = z.object({
  contactId: z.string().min(1),
});

const JobRefSchema = z.object({
  postingId: z.string().min(1),
});

export const EmailEditedPayloadSchema = z.object({
  contactId: z.string().min(1),
  trackingId: z.string().min(1),
  // Structured categories only — no raw text per §3.1.
  editTypes: z.array(
    z.enum(['tone', 'length', 'opener', 'closer', 'body', 'subject']),
  ),
  delta: z.object({
    beforeChars: z.number().int().nonnegative(),
    afterChars: z.number().int().nonnegative(),
    wordsChanged: z.number().int().nonnegative(),
  }),
  timeSpentSeconds: z.number().nonnegative(),
});

export const EmailDraftedPayloadSchema = z.object({
  contactId: z.string().min(1),
  trackingId: z.string().min(1).optional(),
  templateUsed: z.string().optional(),
  subjectChars: z.number().int().nonnegative().optional(),
  bodyChars: z.number().int().nonnegative().optional(),
});

export const EmailSentClickedPayloadSchema = z.object({
  contactId: z.string().min(1),
  trackingId: z.string().min(1).optional(),
});

export const EmailDiscardedPayloadSchema = z.object({
  contactId: z.string().min(1),
  trackingId: z.string().min(1).optional(),
});

export const ContactCardViewedPayloadSchema = z.object({
  contactId: z.string().min(1),
  surface: z.enum(['find', 'tracker', 'directory']).optional(),
  alumniCount: z.number().int().nonnegative().optional(),
});

export const PromptPayloadSchema = z.object({
  promptType: z.enum(['floating_company_context', 'cold_start_intent', 'profile_confirm_banner']).optional(),
  companyId: z.string().optional(),
  /** For prompt_answered: length only, never raw answer. */
  answerChars: z.number().int().nonnegative().optional(),
});

export const ProfileFieldEditedPayloadSchema = z.object({
  field: z.string().min(1),
  /** True if the value changed from a non-empty value. */
  hadPriorValue: z.boolean().optional(),
});

export const ProfileConfirmedPayloadSchema = z.object({
  fieldsConfirmed: z.array(z.string()).optional(),
});

export const DashboardPayloadSchema = z.object({
  ctaId: z.string().optional(),
  recommendationId: z.string().optional(),
  surface: z.string().optional(),
});

export const AlumniConsentDecisionPayloadSchema = z.object({
  value: z.enum(['opt_in', 'opt_out']),
  surface: z.enum(['count_badge', 'account_settings', 'first_run']).optional(),
});

export const AlumniCardPayloadSchema = z.object({
  schoolId: z.string().min(1),
  companyId: z.string().min(1),
  count: z.number().int().nonnegative().optional(),
});

const GenericPayloadSchema = z.record(z.string(), z.unknown());

// =============================================================================
// Type → payload mapping
// =============================================================================

export type PayloadFor<T extends EventType> =
  T extends 'email_edited' ? z.infer<typeof EmailEditedPayloadSchema> :
  T extends 'email_drafted' ? z.infer<typeof EmailDraftedPayloadSchema> :
  T extends 'email_sent_clicked' ? z.infer<typeof EmailSentClickedPayloadSchema> :
  T extends 'email_discarded' ? z.infer<typeof EmailDiscardedPayloadSchema> :
  T extends 'contact_card_viewed' ? z.infer<typeof ContactCardViewedPayloadSchema> :
  T extends 'contact_saved' | 'contact_skipped' ? z.infer<typeof ContactRefSchema> :
  T extends 'job_saved' | 'job_skipped' | 'job_applied' ? z.infer<typeof JobRefSchema> :
  T extends 'prompt_shown' | 'prompt_answered' | 'prompt_dismissed' ? z.infer<typeof PromptPayloadSchema> :
  T extends 'profile_field_edited' ? z.infer<typeof ProfileFieldEditedPayloadSchema> :
  T extends 'profile_confirmed' ? z.infer<typeof ProfileConfirmedPayloadSchema> :
  T extends 'dashboard_cta_clicked' | 'dashboard_cta_dismissed' | 'dashboard_recommendation_viewed' | 'dashboard_recommendation_clicked' ? z.infer<typeof DashboardPayloadSchema> :
  T extends 'alumni_consent_decision' ? z.infer<typeof AlumniConsentDecisionPayloadSchema> :
  T extends 'alumni_card_viewed' | 'alumni_card_clicked' ? z.infer<typeof AlumniCardPayloadSchema> :
  Record<string, unknown>;

const PAYLOAD_SCHEMAS: Record<EventType, z.ZodTypeAny> = {
  email_edited: EmailEditedPayloadSchema,
  email_drafted: EmailDraftedPayloadSchema,
  email_sent_clicked: EmailSentClickedPayloadSchema,
  email_discarded: EmailDiscardedPayloadSchema,
  contact_card_viewed: ContactCardViewedPayloadSchema,
  contact_saved: ContactRefSchema,
  contact_skipped: ContactRefSchema,
  job_saved: JobRefSchema,
  job_skipped: JobRefSchema,
  prompt_shown: PromptPayloadSchema,
  prompt_answered: PromptPayloadSchema,
  prompt_dismissed: PromptPayloadSchema,
  profile_field_edited: ProfileFieldEditedPayloadSchema,
  profile_confirmed: ProfileConfirmedPayloadSchema,
  dashboard_cta_clicked: DashboardPayloadSchema,
  dashboard_cta_dismissed: DashboardPayloadSchema,
  dashboard_recommendation_viewed: DashboardPayloadSchema,
  dashboard_recommendation_clicked: DashboardPayloadSchema,
  alumni_consent_decision: AlumniConsentDecisionPayloadSchema,
  alumni_card_viewed: AlumniCardPayloadSchema,
  alumni_card_clicked: AlumniCardPayloadSchema,
};

export interface BaseEvent<T extends EventType = EventType> {
  eventId: string;
  type: T;
  timestamp: string;
  source: 'frontend';
  schemaVersion: 1;
  sessionId: string;
  payload: PayloadFor<T>;
}

export type AppEvent = BaseEvent<EventType>;

// =============================================================================
// Helpers
// =============================================================================

const SESSION_KEY = 'offerloop_event_session_id';

function generateUUID(): string {
  // Use crypto.randomUUID when available; fall back to a sufficient
  // random string for older browsers. Both yield client-side idempotency
  // keys good enough for at-most-once writes.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = generateUUID();
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return 'session-unavailable';
  }
}

export interface ValidationFailure {
  ok: false;
  type: EventType;
  error: string;
}

export interface ValidatedEvent<T extends EventType> {
  ok: true;
  event: BaseEvent<T>;
}

/**
 * Build + validate an event envelope. Returns either a validated event
 * ready to enqueue, or a failure with a logged error string. Callers
 * should NOT silently swallow `ok: false` — log to console at minimum so
 * a buggy payload is visible during development.
 */
export function buildEvent<T extends EventType>(
  type: T,
  payload: PayloadFor<T>,
): ValidatedEvent<T> | ValidationFailure {
  const schema = PAYLOAD_SCHEMAS[type];
  if (!schema) {
    return { ok: false, type, error: `unknown event type: ${type}` };
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      type,
      error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    };
  }
  return {
    ok: true,
    event: {
      eventId: generateUUID(),
      type,
      timestamp: new Date().toISOString(),
      source: 'frontend',
      schemaVersion: 1,
      sessionId: getSessionId(),
      payload: parsed.data as PayloadFor<T>,
    },
  };
}
