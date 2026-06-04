export const COFFEE_CHAT_CREDITS = 15;
export const TIMELINE_CREDITS = 10;

export const TIER_CONFIGS = {
  free: {
    maxContacts: 5,
    minContacts: 1,
    name: "Search Free Plan Tier",
    credits: 300,
    description: "Try out platform risk free - up to 5 contacts + Email drafts",
    coffeeChat: true,
    timeSavedMinutes: 200,
    usesResume: false,
  },
  pro: {
    maxContacts: 20,
    minContacts: 1,
    name: "Search Pro Plan Tier",
    credits: 3000,
    description: "Everything in free plus advanced features - up to 20 contacts + Resume matching",
    coffeeChat: true,
    timeSavedMinutes: 1200,
    usesResume: true,
  },
  elite: {
    maxContacts: 40,
    minContacts: 1,
    name: "Search Elite Plan Tier",
    credits: 12000,
    description: "Full access - up to 40 contacts + All premium features",
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

