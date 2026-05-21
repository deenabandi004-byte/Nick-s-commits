/**
 * Analytics Helper Functions
 * 
 * Centralized wrapper for PostHog analytics using the global event schema.
 * All analytics tracking should go through these helpers to ensure consistency.
 */

import posthog from './posthog';

/**
 * Track navigation clicks
 * @param nav_item - The navigation item that was clicked (e.g., "Contact Search", "Meeting Prep")
 * @param location - Where the navigation click occurred (e.g., "sidebar", "header", "footer")
 * @param feature - Optional feature context (e.g., "contact_search", "meeting_prep")
 */
export function trackNavClick(
  nav_item: string,
  location: string,
  feature?: string
): void {
  posthog.capture('nav_clicked', {
    nav_item,
    location,
    ...(feature && { feature }),
  });
}

/**
 * Track feature action completions
 * @param feature - The feature name (e.g., "contact_search", "meeting_prep", "interview_prep")
 * @param action - The action performed (e.g., "search", "generate", "create")
 * @param success - Whether the action succeeded
 * @param credits_spent - Optional credits spent for this action
 * @param results_count - Optional number of results returned
 * @param additionalProps - Optional additional properties (must not contain sensitive data)
 */
export function trackFeatureActionCompleted(
  feature: string,
  action: string,
  success: boolean = true,
  options?: {
    credits_spent?: number;
    results_count?: number;
    [key: string]: any;
  }
): void {
  posthog.capture('feature_action_completed', {
    feature,
    action,
    success,
    ...(options?.credits_spent !== undefined && { credits_spent: options.credits_spent }),
    ...(options?.results_count !== undefined && { results_count: options.results_count }),
    ...(options && Object.fromEntries(
      Object.entries(options).filter(([key]) => 
        key !== 'credits_spent' && key !== 'results_count'
      )
    )),
  });
}

/**
 * Track content views
 * @param feature - The feature where content was viewed (e.g., "meeting_prep", "interview_prep")
 * @param content_type - Type of content viewed (e.g., "pdf", "prep", "library_item")
 * @param content_id - Optional unique identifier for the content
 */
export function trackContentViewed(
  feature: string,
  content_type: string,
  content_id?: string
): void {
  posthog.capture('content_viewed', {
    feature,
    content_type,
    ...(content_id && { content_id }),
  });
}

/**
 * Track upgrade clicks
 * @param feature - The feature where the upgrade was clicked (e.g., "contact_search", "meeting_prep")
 * @param from_action - Optional action context (e.g., "limit_reached", "paywall_shown")
 * @param from_location - Optional location context (e.g., "sidebar", "modal", "banner")
 * @param plan_selected - Optional plan that was selected (e.g., "pro", "elite")
 */
export function trackUpgradeClick(
  feature: string,
  options?: {
    from_action?: string;
    from_location?: string;
    plan_selected?: string;
  }
): void {
  posthog.capture('upgrade_clicked', {
    feature,
    ...(options?.from_action && { from_action: options.from_action }),
    ...(options?.from_location && { from_location: options.from_location }),
    ...(options?.plan_selected && { plan_selected: options.plan_selected }),
  });
}

/**
 * Track checkout completion
 * @param plan - The plan that was purchased (e.g., "pro", "elite")
 * @param feature - Optional feature that led to checkout
 */
export function trackCheckoutCompleted(
  plan: string,
  feature?: string
): void {
  posthog.capture('checkout_completed', {
    plan,
    ...(feature && { feature }),
  });
}

/**
 * Track errors
 * @param feature - The feature where the error occurred (e.g., "contact_search", "meeting_prep")
 * @param action - The action that failed (e.g., "search", "generate", "download")
 * @param error_type - Type of error (e.g., "api_error", "network_error", "validation_error")
 * @param error_code - Optional error code
 */
export function trackError(
  feature: string,
  action: string,
  error_type: string,
  error_code?: string
): void {
  posthog.capture('error_occurred', {
    feature,
    action,
    error_type,
    ...(error_code && { error_code }),
  });
}
