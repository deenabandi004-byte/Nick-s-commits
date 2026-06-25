/**
 * PostHog Event Names
 * 
 * Global event schema - only these 7 event names are allowed.
 * Use the analytics helper functions in src/lib/analytics.ts for tracking.
 */

export const POSTHOG_EVENTS = {
  /**
   * Fired when user clicks a navigation item
   * Properties: nav_item, location, feature?
   */
  NAV_CLICKED: 'nav_clicked',

  /**
   * Fired when a feature action completes (search, generate, create, etc.)
   * Properties: feature, action, success, credits_spent?, results_count?
   */
  FEATURE_ACTION_COMPLETED: 'feature_action_completed',

  /**
   * Fired when content is viewed (PDF, prep, library item, etc.)
   * Properties: feature, content_type, content_id?
   */
  CONTENT_VIEWED: 'content_viewed',

  /**
   * Fired when user clicks an upgrade button
   * Properties: feature, from_action?, from_location?, plan_selected?
   */
  UPGRADE_CLICKED: 'upgrade_clicked',

  /**
   * Fired when checkout/payment is completed
   * Properties: plan, feature?
   */
  CHECKOUT_COMPLETED: 'checkout_completed',

  /**
   * Fired when an error occurs
   * Properties: feature, action, error_type, error_code?
   */
  ERROR_OCCURRED: 'error_occurred',

  /**
   * Fired once when a brand-new account is created (never on returning logins)
   * Properties: signup_method (no email or PII)
   */
  SIGN_UP: 'sign_up',
} as const;

/**
 * Type-safe event name type
 */
export type PostHogEventName = typeof POSTHOG_EVENTS[keyof typeof POSTHOG_EVENTS];
