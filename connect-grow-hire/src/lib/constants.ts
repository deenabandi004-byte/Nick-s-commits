export const COFFEE_CHAT_CREDITS = 15;
export const INTERVIEW_PREP_CREDITS = 25;

export const TIER_CONFIGS = {
  free: {
    maxContacts: 3,
    minContacts: 1,
    name: "Search Free Plan Tier",
    credits: 150,
    description: "Try out platform risk free - up to 3 contacts + Email drafts",
    coffeeChat: true,
    interviewPrep: false,
    timeSavedMinutes: 200,
    usesResume: false,
  },
  pro: {
    maxContacts: 8,
    minContacts: 1,
    name: "Search Pro Plan Tier",
    credits: 1800,
    description: "Everything in free plus advanced features - up to 8 contacts + Resume matching",
    coffeeChat: true,
    interviewPrep: true,
    timeSavedMinutes: 1200,
    usesResume: true,
  },
  elite: {
    maxContacts: 15,
    minContacts: 1,
    name: "Search Elite Plan Tier",
    credits: 3000,
    description: "Full access - up to 15 contacts + All premium features",
    coffeeChat: true,
    interviewPrep: true,
    timeSavedMinutes: 5000,
    usesResume: true,
  },
} as const;

export type CoffeeChatHistoryItem = {
  id: string;
  contactName: string;
  company: string;
  jobTitle: string;
  status: string;
  createdAt: string;
  pdfUrl?: string;
  error?: string;
};

// =============================================================================
// Phase 1 — Personalization Data Layer controlled vocab
// =============================================================================
// Mirror of `backend/app/config.py` (TARGET_INDUSTRIES / TARGET_ROLE_TYPES /
// OPEN_TO_LOCATIONS). Keep both sides in sync — the backend will reject any
// value that isn't here once strict-mode validation lands in Phase 3.

export const TARGET_INDUSTRIES = [
  { value: 'investment_banking', label: 'Investment Banking' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'private_equity', label: 'Private Equity' },
  { value: 'venture_capital', label: 'Venture Capital' },
  { value: 'hedge_fund', label: 'Hedge Funds' },
  { value: 'tech_swe', label: 'Tech — Software Engineering' },
  { value: 'tech_pm', label: 'Tech — Product Management' },
  { value: 'tech_ds', label: 'Tech — Data Science' },
  { value: 'big_4_accounting', label: 'Big 4 Accounting' },
  { value: 'corporate_finance', label: 'Corporate Finance' },
  { value: 'sales_trading', label: 'Sales & Trading' },
  { value: 'wealth_management', label: 'Wealth Management' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'biotech', label: 'Biotech' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'media_entertainment', label: 'Media & Entertainment' },
  { value: 'product_design', label: 'Product Design' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'startups', label: 'Startups' },
] as const;

export const TARGET_ROLE_TYPES = [
  { value: 'analyst', label: 'Analyst' },
  { value: 'associate', label: 'Associate' },
  { value: 'consultant', label: 'Consultant' },
  { value: 'pm', label: 'Product Manager' },
  { value: 'apm', label: 'Associate PM' },
  { value: 'swe', label: 'Software Engineer' },
  { value: 'data_scientist', label: 'Data Scientist' },
  { value: 'data_analyst', label: 'Data Analyst' },
  { value: 'researcher', label: 'Researcher' },
  { value: 'designer', label: 'Designer' },
  { value: 'trader', label: 'Trader' },
  { value: 'rotational', label: 'Rotational Program' },
  { value: 'internship', label: 'Internship' },
  { value: 'full_time', label: 'Full-time' },
] as const;

export const OPEN_TO_LOCATIONS = [
  { value: 'new-york', label: 'New York' },
  { value: 'sf', label: 'San Francisco' },
  { value: 'la', label: 'Los Angeles' },
  { value: 'chicago', label: 'Chicago' },
  { value: 'boston', label: 'Boston' },
  { value: 'dc', label: 'Washington DC' },
  { value: 'seattle', label: 'Seattle' },
  { value: 'atlanta', label: 'Atlanta' },
  { value: 'austin', label: 'Austin' },
  { value: 'miami', label: 'Miami' },
  { value: 'philadelphia', label: 'Philadelphia' },
  { value: 'dallas', label: 'Dallas' },
  { value: 'houston', label: 'Houston' },
  { value: 'denver', label: 'Denver' },
  { value: 'remote', label: 'Remote' },
] as const;

export type TargetIndustryValue = (typeof TARGET_INDUSTRIES)[number]['value'];
export type TargetRoleTypeValue = (typeof TARGET_ROLE_TYPES)[number]['value'];
export type OpenToLocationValue = (typeof OPEN_TO_LOCATIONS)[number]['value'];

export const TONE_PREFERENCES = [
  { value: 'formal', label: 'Formal' },
  { value: 'casual', label: 'Casual' },
  { value: 'warm', label: 'Warm' },
] as const;

export const LENGTH_PREFERENCES = [
  { value: 'short', label: 'Short' },
  { value: 'medium', label: 'Medium' },
] as const;

// =============================================================================
// Phase 2 — Event logging feature flag
// =============================================================================
// `useEventLogger` reads this at runtime. Set via Vite env var so we can
// flip rollout without a rebuild. Defaults to OFF in production.
export const EVENTS_LOGGING_ENABLED =
  (import.meta.env.VITE_EVENTS_LOGGING_ENABLED ?? 'false').toLowerCase() === 'true';

// =============================================================================
// Phase 3 -- Floating prompt + cold-start intent feature flags
// =============================================================================
// FloatingPrompt and ColdStartIntent both check these at render. The backend
// has matching gates (FLOATING_PROMPT_ENABLED / COLD_START_INTENT_ENABLED) so
// the API surface can be deployed dark. All default OFF.
export const FLOATING_PROMPT_ENABLED =
  (import.meta.env.VITE_FLOATING_PROMPT_ENABLED ?? 'false').toLowerCase() === 'true';

export const COLD_START_INTENT_ENABLED =
  (import.meta.env.VITE_COLD_START_INTENT_ENABLED ?? 'false').toLowerCase() === 'true';

// =============================================================================
// Phase 5 -- Recommendation engine feature flag
// =============================================================================
// EmptyRecommendations reads this at runtime. Set via Vite env var so the
// rollout flips without a rebuild. Backend has a matching gate
// (RECOMMENDATIONS_ENABLED) so the API surface stays dark until both flip.
// Default OFF.
export const RECOMMENDATIONS_ENABLED =
  (import.meta.env.VITE_RECOMMENDATIONS_ENABLED ?? 'false').toLowerCase() === 'true';

// =============================================================================
// Phase 6 — Alumni graph + consent feature flag
// =============================================================================
// AlumniConsent modal + AccountSettings consent surface read this. Backend has
// a matching gate (ALUMNI_GRAPH_ENABLED) so consent writes still work even
// when the read-side sourcing is dark. Default OFF.
export const ALUMNI_GRAPH_ENABLED =
  (import.meta.env.VITE_ALUMNI_GRAPH_ENABLED ?? 'false').toLowerCase() === 'true';

// =============================================================================
// Phase 8  Dashboard CTA cards feature flag
// =============================================================================
// useCTAs hook reads this. Backend has a matching gate (CTA_CARDS_ENABLED) so
// the GET endpoint returns an empty deck even if the frontend is on without
// the backend. Default OFF.
export const CTA_CARDS_ENABLED =
  (import.meta.env.VITE_CTA_CARDS_ENABLED ?? 'false').toLowerCase() === 'true';

// =============================================================================
// Phase 3 -- Industry-seeded suggestion chips for the FloatingPrompt
// =============================================================================
// Per 15 #2: 3 chips per industry the user has flagged in `targetIndustries`.
// The user can pick a chip to seed their answer (still editable) or write
// their own. Keep these short  the chip is a starter, not the full reason.
export const FLOATING_PROMPT_CHIPS: Record<string, readonly string[]> = {
  investment_banking: [
    'Strong M&A track record in the sectors I want to cover.',
    'Reputation for analyst training and exit opportunities.',
    'Recent deal flow lined up with industries I follow.',
  ],
  consulting: [
    'Case work in the practice area I want to break into.',
    'Reputation for early client exposure as an analyst.',
    'Office culture I have heard about from alumni.',
  ],
  private_equity: [
    'Sector focus matches the deals I followed in school.',
    'Lean deal teams that give junior PEs more ownership.',
    'Exit track record into operating roles.',
  ],
  venture_capital: [
    'Stage focus aligns with founders I want to back.',
    'Portfolio companies I have followed for years.',
    'Investment thesis I genuinely agree with.',
  ],
  hedge_fund: [
    'Strategy fits the markets I have been studying.',
    'Risk culture and research depth I want to learn from.',
    'Reputation for developing analysts long-term.',
  ],
  tech_swe: [
    'Eng culture and product velocity I admire.',
    'Tech stack matches what I want to go deep on.',
    'Specific team or product I want to ship on.',
  ],
  tech_pm: [
    'Product surface area I have been a user of for years.',
    'PM culture is rigorous about user research and metrics.',
    'Roadmap alignment with problems I want to solve.',
  ],
  tech_ds: [
    'Data scale and infra depth I want to work with.',
    'Research-into-product loop is fast here.',
    'Problem domain matches my coursework or projects.',
  ],
  big_4_accounting: [
    'Audit / advisory experience I want for grad school.',
    'Industry specialization I am building towards.',
    'CPA pipeline and rotation flexibility.',
  ],
  startups: [
    'Stage and pace of work I want exposure to.',
    'Founders I have been following or worked with.',
    'Mission and customer base I genuinely care about.',
  ],
} as const;

export const DEFAULT_FLOATING_PROMPT_CHIPS = [
  'Strong reputation in the area I want to break into.',
  'Alumni and culture I have heard great things about.',
  'Specific work or team I want to learn from.',
] as const;

