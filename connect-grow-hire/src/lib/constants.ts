export const COFFEE_CHAT_CREDITS = 15;
export const INTERVIEW_PREP_CREDITS = 25;
export const TIMELINE_CREDITS = 10;

export const TIER_CONFIGS = {
  free: {
    maxContacts: 5,
    minContacts: 1,
    name: "Search Free Plan Tier",
    credits: 500,
    description: "Try out the platform free - up to 5 contacts per search + AI email drafts",
    coffeeChat: true,
    interviewPrep: false,
    timeSavedMinutes: 300,
    usesResume: false,
  },
  pro: {
    maxContacts: 15,
    minContacts: 1,
    name: "Search Pro Plan Tier",
    credits: 3000,
    description: "Up to 15 contacts per search, resume matching, firm search, bulk drafting",
    coffeeChat: true,
    interviewPrep: true,
    timeSavedMinutes: 2500,
    usesResume: true,
  },
  elite: {
    maxContacts: 30,
    minContacts: 1,
    name: "Search Elite Plan Tier",
    credits: 12000,
    description: "Up to 30 contacts per search, The Agent, unlimited coffee chat prep, all premium features",
    coffeeChat: true,
    interviewPrep: true,
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

