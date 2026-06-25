// Frontend mirror of backend/app/config.py — kept in sync.
// 2026-06-22: find_contact reverted to 5 (matches actual deduction site
// at routes/runs.py:824). The 2026-06-10 double-to-10 was never picked
// up by the deduction, so the UI was advertising 50 credits per
// 5-contact search while users were only charged 25.
// See backend CREDIT_COSTS dict for the single source of truth.
export const COFFEE_CHAT_CREDITS = 30;
export const TIMELINE_CREDITS = 20;

// Per-action credit costs — mirror of backend CREDIT_COSTS.
export const CREDIT_COSTS = {
  find_contact: 5,
  find_hiring_manager: 10,
  find_recruiter: 6,
  find_employee: 4,
  firm_search: 10,
  coffee_chat_prep: 30,
  meeting_prep: 30,
  resume_optimization: 40,
  cover_letter: 20,
  timeline: 20,
  reply_generation: 20,
  loop_contact_draft: 18,
  loop_hm_draft: 26,
  loop_job_found: 2,
  loop_auto_send: 2,
  loop_company_discovered: 2,
  scout_chat: 0,
} as const;

// Sidebar CreditsPanel urgency thresholds. Percent of remaining credits.
// At or below CREDITS_LOW_PCT, the panel switches to "low" (amber).
// At or below CREDITS_CRITICAL_PCT, the panel switches to "critical" (rose).
// Above CREDITS_LOW_PCT, the panel is "ample" (brand blue).
export const CREDITS_LOW_PCT = 25;
export const CREDITS_CRITICAL_PCT = 10;

export type CreditsTier = "ample" | "low" | "critical";

export const CREDITS_TIER_AMPLE: CreditsTier = "ample";
export const CREDITS_TIER_LOW: CreditsTier = "low";
export const CREDITS_TIER_CRITICAL: CreditsTier = "critical";

export const TIER_CONFIGS = {
  free: {
    maxContacts: 3,
    minContacts: 1,
    name: "Search Free Plan Tier",
    credits: 300,
    description: "Try out platform risk free - up to 3 contacts + Email drafts",
    coffeeChat: true,
    timeSavedMinutes: 200,
    usesResume: false,
  },
  pro: {
    maxContacts: 8,
    minContacts: 1,
    name: "Search Pro Plan Tier",
    credits: 2000,
    description: "Everything in free plus advanced features - up to 8 contacts + Resume matching",
    coffeeChat: true,
    timeSavedMinutes: 1200,
    usesResume: true,
  },
  elite: {
    maxContacts: 15,
    minContacts: 1,
    name: "Search Elite Plan Tier",
    credits: 5000,
    description: "Full access - up to 15 contacts + All premium features",
    coffeeChat: true,
    timeSavedMinutes: 5000,
    usesResume: true,
  },
} as const;

// Agent feature (Elite-only)
export const AGENT_CONFIG = {
  maxContactsPerWeek: 15,
  maxCreditsPerWeek: 150,
  minCreditBalance: 20,
  enabledTiers: ["elite"] as const,
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

