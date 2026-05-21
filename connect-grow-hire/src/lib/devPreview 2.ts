/**
 * Dev preview bypass for Playwright visual QA.
 * Only active when: (1) Vite dev mode (import.meta.env.DEV) AND (2) ?devpreview=true in URL.
 * In production builds, import.meta.env.DEV is false so IS_DEV_PREVIEW is always false
 * and DEV_MOCK_USER is never used.
 */

export const IS_DEV_PREVIEW =
  typeof window !== 'undefined' &&
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).has('devpreview');

export const DEV_MOCK_USER = {
  uid: 'dev-preview-uid',
  email: 'deena@usc.edu',
  name: 'Deena',
  displayName: 'Deena',
  university: 'University of Southern California',
  targetIndustries: ['Data Science', 'AI/ML', 'Analytics'],
  careerGoals: ['Data Scientist', 'ML Engineer', 'Analytics Engineer'],
  tier: 'elite' as const,
  plan: 'elite' as const,
  credits: 999,
  maxCredits: 3000,
  onboardingComplete: true,
  needsOnboarding: false,
};
