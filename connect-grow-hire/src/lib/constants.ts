export const MEETING_CREDITS = 15;
export const TIMELINE_CREDITS = 10;

export const TIER_CONFIGS = {
  free: {
    maxContacts: 5,
    minContacts: 1,
    name: "Search Free Plan Tier",
    credits: 500,
    description: "Try out the platform free - up to 5 contacts per search + AI email drafts",
    meeting: true,
    timeSavedMinutes: 1680,
    usesResume: false,
    agentMaxConcurrent: 0,
  },
  pro: {
    maxContacts: 15,
    minContacts: 1,
    name: "Search Pro Plan Tier",
    credits: 3000,
    description: "Up to 15 contacts/search, unlimited meeting prep, The Agent (1 at a time), all networking features",
    meeting: true,
    timeSavedMinutes: 12600,
    usesResume: true,
    agentMaxConcurrent: 1,
  },
  elite: {
    maxContacts: 30,
    minContacts: 1,
    name: "Search Elite Plan Tier",
    credits: 12000,
    description: "Run up to 5 agents simultaneously, 30 contacts/search, priority queue, founder kickoff call",
    meeting: true,
    timeSavedMinutes: 67200,
    usesResume: true,
    agentMaxConcurrent: 5,
  },
} as const;

// Agent feature - Pro gets 1 concurrent, Elite gets up to 5
export const AGENT_CONFIG = {
  maxContactsPerWeek: 15,
  maxCreditsPerWeek: 150,
  minCreditBalance: 20,
  enabledTiers: ["pro", "elite"] as const,
  concurrencyByTier: {
    free: 0,
    pro: 1,
    elite: 5,
  } as const,
} as const;

export type MeetingHistoryItem = {
  id: string;
  contactName: string;
  company: string;
  jobTitle: string;
  status: string;
  createdAt: string;
  pdfUrl?: string;
  error?: string;
};

