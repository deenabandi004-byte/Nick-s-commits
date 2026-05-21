/**
 * Static teaser fixture for the Agentic Networking Queue.
 *
 * Shown to Free-tier users on the "Suggested For You" tab. Never hits the
 * backend - purely a visual paywall that demonstrates what Pro/Elite gets.
 * Keep this deterministic (no Math.random, no Date.now) so the preview
 * never shifts between renders.
 */
import type { QueueContact } from "@/services/api";

export const QUEUE_TEASER_CONTACTS: QueueContact[] = [
  {
    id: "teaser-1",
    pdlId: null,
    firstName: "Priya",
    lastName: "Raman",
    name: "Priya Raman",
    email: "priya.raman@example.com",
    title: "Investment Banking Analyst",
    company: "Goldman Sachs",
    linkedinUrl: "https://linkedin.com/in/priya-raman",
    city: "New York",
    state: "NY",
    college: "University of Southern California",
    warmthTier: "warm",
    warmthScore: 92,
    warmthSignals: ["USC alumni", "Same major (Business)", "NYC metro"],
    whyThisContact:
      "USC alum at your #1 target firm. Only 2 years ahead, same major - strong meeting fit.",
    emailSubject: "USC → Goldman: 15 minutes this week?",
    emailBody:
      "Hi Priya - I'm a junior at USC studying Business Administration with a focus on finance. I saw you made the jump to Goldman's IBD team and would love to hear how you navigated recruiting. Would you have 15 minutes this week or next?",
    status: "pending",
  },
  {
    id: "teaser-2",
    pdlId: null,
    firstName: "Marcus",
    lastName: "Chen",
    name: "Marcus Chen",
    email: "marcus.chen@example.com",
    title: "Associate Consultant",
    company: "McKinsey & Company",
    linkedinUrl: "https://linkedin.com/in/marcus-chen",
    city: "San Francisco",
    state: "CA",
    college: "University of Southern California",
    warmthTier: "warm",
    warmthScore: 88,
    warmthSignals: ["USC alumni", "SF Bay Area", "Consulting track"],
    whyThisContact:
      "USC Marshall grad doing the exact MBB consulting path you're targeting. Active in the alumni network.",
    emailSubject: "Marshall alum → MBB: quick chat?",
    emailBody:
      "Hi Marcus - I'm a USC Marshall junior recruiting for MBB consulting this fall. Your path from Marshall to McKinsey is exactly what I'm trying to build toward. Would you have 15 minutes in the next two weeks to share how you prepped for case interviews?",
    status: "pending",
  },
  {
    id: "teaser-3",
    pdlId: null,
    firstName: "Sarah",
    lastName: "Patel",
    name: "Sarah Patel",
    email: "sarah.patel@example.com",
    title: "Product Manager",
    company: "Google",
    linkedinUrl: "https://linkedin.com/in/sarah-patel",
    city: "Mountain View",
    state: "CA",
    college: "UCLA",
    warmthTier: "neutral",
    warmthScore: 72,
    warmthSignals: ["West Coast tech", "PM track"],
    whyThisContact:
      "Well-known APM-program grad with a public portfolio on PM interview prep. Good secondary contact for tech track.",
    emailSubject: "UCLA → Google APM: advice on PM recruiting",
    emailBody:
      "Hi Sarah - I came across your blog posts on the APM interview process while prepping for tech PM recruiting. Would you have 15 minutes to share how you landed at Google straight from UCLA?",
    status: "pending",
  },
  {
    id: "teaser-4",
    pdlId: null,
    firstName: "David",
    lastName: "Kim",
    name: "David Kim",
    email: "david.kim@example.com",
    title: "Strategy Analyst",
    company: "Bain & Company",
    linkedinUrl: "https://linkedin.com/in/david-kim",
    city: "Los Angeles",
    state: "CA",
    college: "University of Southern California",
    warmthTier: "warm",
    warmthScore: 85,
    warmthSignals: ["USC alumni", "LA-based", "Recent grad"],
    whyThisContact:
      "Recent USC grad now at Bain LA - relatable and close enough in age to remember exactly how recruiting worked for you.",
    emailSubject: "Fellow Trojan at Bain - 15 minutes?",
    emailBody:
      "Hi David - Fellow Trojan here. I'm recruiting for consulting and noticed you're at Bain's LA office. Would you have 15 minutes to chat about how you prepped for the interviews? Happy to work around your schedule.",
    status: "pending",
  },
  {
    id: "teaser-5",
    pdlId: null,
    firstName: "Jessica",
    lastName: "Wong",
    name: "Jessica Wong",
    email: "jessica.wong@example.com",
    title: "Senior Analyst",
    company: "Morgan Stanley",
    linkedinUrl: "https://linkedin.com/in/jessica-wong",
    city: "New York",
    state: "NY",
    college: "University of Southern California",
    warmthTier: "neutral",
    warmthScore: 68,
    warmthSignals: ["USC alumni", "Finance track"],
    whyThisContact:
      "Great fallback if the Goldman contact doesn't reply. Different bank, same class year - gives you another shot at IBD.",
    emailSubject: "USC → Morgan Stanley IBD: quick question",
    emailBody:
      "Hi Jessica - I'm a USC junior starting IBD recruiting this fall and would love to learn how your path at Morgan Stanley has gone. Would you have 15 minutes in the next couple weeks for a quick chat?",
    status: "pending",
  },
];
