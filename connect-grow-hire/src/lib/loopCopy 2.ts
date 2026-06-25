// loopCopy.ts — every string the Loop UI shows the user lives here.
//
// Rule: no jargon. Words like "agent", "cycle", "deploy", "approval mode",
// "OTP", "credits", "configure" do NOT appear in this file. If you find
// yourself reaching for one, rewrite the sentence to talk about the user's
// outcome instead.

export const LOOP_COPY = {
  // ── Page chrome ────────────────────────────────────────────────────────
  pageTitle: "Loops",
  fleetHeader: "Your Loops",
  fleetSubtitle: "Walk away. We'll text you when there's something to look at.",

  // ── Empty state hero (zero Loops yet) ─────────────────────────────────
  hero: {
    title: "Start a Loop.",
    titleAccent: "Loop.",
    subtitle: "Tell it what you want. Walk away. Get a text when the work's done.",
    placeholder:
      'Say it like you\'d tell a friend. Try: "10 AI analysts at Goldman, JPMorgan, and Morgan Stanley. Reach out about summer internships."',
    primaryCta: "Start the Loop",
    primaryCtaHint: "We'll text you when it's done. Nothing sends without you tapping yes.",
  },

  // ── The four marketing cards (verbatim from the design) ───────────────
  cards: [
    {
      n: "01",
      title: "Tell it what you're after",
      body:
        "Say it in plain words. \"10 AI analysts at Goldman, JPM, and Morgan Stanley.\" Or \"5 specific companies, this kind of person.\" Plain English.",
    },
    {
      n: "02",
      title: "Hit Run",
      body:
        "Your Loop runs in the background. Walk away. Close the tab. Go to class.",
    },
    {
      n: "03",
      title: "It finds everything",
      body:
        "Companies, hiring managers, the right people, perfect emails — anything that matters.",
    },
    {
      n: "04",
      title: "You get a text",
      body:
        "You wake up to your phone pinging. One tap to send the emails to the Loop.",
    },
  ],

  // ── Loop cards (the fleet grid) ────────────────────────────────────────
  card: {
    statusRunning: "Running",
    statusDone: "Done",
    statusPaused: "Paused",
    statusIdle: "Not started",
    openCta: "Open",
    readEmailsCta: "Read the emails",
    wakeCta: "Wake it up",
    startCta: "Start it",
    foundLabel: (found: number, target: number) =>
      `${found} of ${target} found this week`,
    nextRunIn: (when: string) => `Looking again ${when}`,
    smsSentAt: (when: string) => `You got the text ${when}`,
    pausedHint: "Tap to wake it up",
    idleHint: "Hit start when you're ready.",
  },

  // ── "+ New Loop" tile ─────────────────────────────────────────────────
  newTile: {
    titleAvailable: "Start another Loop",
    bodyAvailable: "Different brief, same magic.",
    titleAtCap: "You're at your limit",
    bodyAtCap: (cap: number) =>
      `Your plan allows ${cap} Loop${cap === 1 ? "" : "s"}. Upgrade to add more.`,
    upgradeCta: "See plans",
  },

  // ── Confirmations & errors ────────────────────────────────────────────
  toasts: {
    loopStarted: "Loop started. We'll text you when there's news.",
    loopPaused: "Paused.",
    loopResumed: "Back at it.",
    loopDeleted: "Loop removed.",
    briefRequired: "Tell it what you're after first.",
    somethingBroke: "Something went sideways. Try again in a sec.",
  },

  // ── Phase 8 — automation cadence picker ──────────────────────────────
  cadence: {
    label: "How often?",
    options: {
      daily: { title: "Daily", body: "A run every day. Best for recruiting season." },
      every_other_day: { title: "Every other day", body: "Steady drip. Good default." },
      weekly: { title: "Weekly", body: "Easy on credits. One run per week." },
      manual: { title: "Just when I ask", body: "No schedule. You hit Run." },
    },
    recommendedTag: "recommended",
  },

  // ── Phase 8 — cost estimate strip under the textarea ────────────────
  estimate: {
    loading: "Working out the cost…",
    perCycle: (n: number) => `About ${n} credits per cycle`,
    monthlyFit: (cycles: number) =>
      `~${cycles} cycle${cycles === 1 ? "" : "s"} fit in your monthly budget`,
  },

  // ── Phase 8 — budget bar on the Loop card ───────────────────────────
  budget: {
    label: (spent: number, cap: number) => `${spent} / ${cap} credits this week`,
    tooltip:
      "9 credits per contact, 13 per hiring manager, 1 per job, 1 per company.",
  },

  // ── Phase 8 — pause reasons (chip on the card, banner on detail) ────
  pauseReason: {
    budget_capped: "Paused — used this week's credits. Resumes Monday.",
    credits_capped: "Paused — out of credits this month.",
    inactivity: "Paused — drafts waiting. Open them so it can keep going.",
    quiet_hours: "Quiet hours — picking back up in the morning.",
    paused: "Paused.",
  },

  // ── Phase 8 — Account Settings usage breakdown ──────────────────────
  usageBreakdown: {
    title: "Where my credits went",
    subtitle: "This month, broken down by what you used them on.",
    labels: {
      contacts: "Contacts found",
      hiring_managers: "Hiring managers",
      jobs: "Jobs matched",
      companies: "Companies discovered",
      manual: "Manual searches",
      coffee_chat_preps: "Coffee chat preps",
      interview_preps: "Interview preps",
      scout: "Scout chats",
      other: "Other",
    },
  },
} as const;
