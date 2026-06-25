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
      `${found} found · ${target}/wk target`,
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
      "18 credits per contact draft, 26 per hiring manager draft, 2 per job, 2 per company.",
  },

  // ── Phase 8 — pause reasons (chip on the card, banner on detail) ────
  // Every backend pauseReason value (loop_service.LOOP_STATUS + the
  // jobs/scheduler-written ones in the audit table) needs a full-sentence
  // entry here. Adding a new reason on the backend without adding copy
  // here would fall back to a generic "Paused." with no context — the
  // bug Sid hit with rate_limited and planner_unavailable.
  pauseReason: {
    budget_capped: "Paused — used this week's credits. Resumes Monday.",
    credits_capped: "Paused — out of credits this month.",
    inactivity: "Paused — drafts waiting. Open them so it can keep going.",
    quiet_hours: "Quiet hours — picking back up in the morning.",
    paused: "Paused.",
    rate_limited:
      "Paused — upstream API rate-limited 3 cycles in a row. Wait an hour, then Resume.",
    planner_unavailable:
      "Paused — the planner couldn't reach its model. Resume to retry, or check Settings if it persists.",
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

// ── Mode-aware copy helper ────────────────────────────────────────────
//
// Loops have three modes:
//   "people" — autonomous networking (find professionals, draft cold outreach)
//   "roles"  — autonomous job-search (find postings, optionally draft outreach
//              about specific roles)
//   "both"   — pursue BOTH pipelines in one Loop, balanced against one credit
//              budget. The wizard surfaces "both" as a parser outcome (when
//              the student's prompt explicitly asks for both networking and
//              job-search) rather than as a third mode card.
//
// Most strings are the same across modes. The helper layers mode-specific
// overrides on top of LOOP_COPY so existing call sites that don't care about
// mode keep working unchanged. Only the wizard and other mode-aware screens
// need to import this helper.
//
// School-name substitution: pass the user's school in opts.school. When known,
// the alumni-preference label reads "Push USC alumni to the top" instead of
// the generic "Push people from my school to the top".

export type LoopModeForCopy = "people" | "roles" | "both";
export type LoopCadenceForCopy = "daily" | "every_other_day" | "weekly" | "manual";

// Short cadence label for status-line use ("daily", "every other day", "weekly", "manual").
// Distinct from LOOP_COPY.cadence.options.*.title, which are picker titles
// ("Just when I ask"). These read mid-sentence.
export function cadenceLabel(c: LoopCadenceForCopy | undefined | null): string {
  switch (c) {
    case "daily": return "daily";
    case "every_other_day": return "every other day";
    case "weekly": return "weekly";
    case "manual": return "manual";
    default: return "every other day";
  }
}

// Short pause-reason label for chip use ("weekly budget hit", etc).
// Distinct from LOOP_COPY.pauseReason.*, which are full sentences for banners.
export type LoopPauseReasonForCopy =
  | "credits_capped" | "budget_capped" | "inactivity"
  | "quiet_hours" | "paused" | "rate_limited" | "planner_unavailable"
  | string | null | undefined;
export function pauseReasonLabel(r: LoopPauseReasonForCopy): string {
  switch (r) {
    case "budget_capped": return "weekly budget hit";
    case "credits_capped": return "monthly credits low";
    case "inactivity": return "drafts waiting";
    case "quiet_hours": return "quiet hours";
    case "rate_limited": return "rate-limited";
    case "planner_unavailable": return "planner offline";
    case "paused":
    case null:
    case undefined:
      return "paused";
    default:
      // Surface unknown reasons verbatim so a new backend value is at least
      // diagnosable instead of silently rendering "paused".
      return String(r).replace(/_/g, " ");
  }
}
// Mirror of services/loops.ts LoopAutoSendMode. Duplicated locally to keep
// lib/ free of service imports.
export type LoopAutoSendModeForCopy = "approve_each" | "draft_only" | "send_for_me";

export function loopCopy(
  mode: LoopModeForCopy,
  opts: {
    school?: string;
    cadence?: LoopCadenceForCopy;
    autoSendMode?: LoopAutoSendModeForCopy;
  } = {}
) {
  const school = opts.school?.trim();
  const isRoles = mode === "roles";
  const isBoth = mode === "both";
  const cadence = opts.cadence;
  const autoSend: LoopAutoSendModeForCopy = opts.autoSendMode ?? "draft_only";
  const isSend = autoSend === "send_for_me";
  const isApprove = autoSend === "approve_each";

  // Cadence phrasing used in the activity-feed empty-state body so the
  // student knows when the next batch will land.
  const cadenceLine =
    cadence === "daily"
      ? "Cadence: daily."
      : cadence === "weekly"
        ? "Cadence: weekly."
        : cadence === "manual"
          ? "Run it when you're ready."
          : cadence === "every_other_day"
            ? "Cadence: every other day."
            : "";

  return {
    ...LOOP_COPY,

    // ── autoSendMode-aware overrides on shared keys ───────────────────
    // The base LOOP_COPY assumes draft mode. When the student picked
    // send_for_me or approve_each, these keys swap to copy that matches
    // what actually happens with their outbox.
    card: {
      ...LOOP_COPY.card,
      readEmailsCta: isSend
        ? "View what was sent"
        : isApprove
          ? "Open the queue"
          : LOOP_COPY.card.readEmailsCta,
    },
    pauseReason: {
      ...LOOP_COPY.pauseReason,
      inactivity: isSend
        ? "Paused — daily cap hit. Picks back up tomorrow."
        : isApprove
          ? "Paused — approvals waiting. Open them to keep it moving."
          : LOOP_COPY.pauseReason.inactivity,
    },

    // ── LoopDetailPage / per-Loop Overview copy ──────────────────────
    // The screenshot is the editorial masthead in LoopDetailPage:
    //   {kicker} → {title} {italic accent}
    //
    // The first section ("Today's mail" / "Drafts ready for review.")
    // is the only one that's outbound-flavored, so it's the only one
    // that flips on autoSendMode. Replies/jobs/companies headlines
    // describe inbound signal and discovery — same in every mode.
    overview: {
      // Hero headline word: "You have {N drafts} and {N replies}." flips
      // the noun based on what's actually sitting in the student's
      // outbox. Singular and plural variants because n=1 reads weird.
      heroOutboundNoun: (n: number): string =>
        isSend
          ? n === 1 ? "one sent email" : `${n} sent emails`
          : isApprove
            ? n === 1 ? "one approval" : `${n} approvals`
            : n === 1 ? "one draft" : `${n} drafts`,
      // BigCounter label under the hero number.
      heroOutboundLabel: isSend
        ? "sent this week"
        : isApprove
          ? "waiting on you"
          : "drafts ready",
      // Section kicker — "Today's mail / Drafts ready for review."
      // Rows are already numbered (01, 02, …) so the leading "01 ·" on
      // the kicker doubled up visually with the row index.
      mailKicker: isSend
        ? "Already out"
        : isApprove
          ? "Needs your okay"
          : "Today's mail",
      mailTitle: isSend ? "Emails" : isApprove ? "Holds" : "Drafts",
      mailItalic: isSend
        ? "out the door."
        : isApprove
          ? "waiting your call."
          : "ready for review.",
      mailEmpty: isSend
        ? "Nothing sent yet. Emails appear here as the Loop drafts and sends them."
        : isApprove
          ? "Nothing waiting yet. Items appear here as the Loop finds them."
          : "No drafts yet. They appear here as the agent writes outreach.",
      // Tab label for the "Drafts" tab.
      tabLabel: isSend ? "Sent" : isApprove ? "Queue" : "Drafts",
      // DraftsTab kicker / title / italic + counts line + empty.
      tabKicker: isSend
        ? "The trail"
        : isApprove
          ? "The queue"
          : "The queue",
      tabTitle: isSend ? "Sent" : isApprove ? "Approvals" : "Drafts",
      tabItalic: isSend
        ? "this week."
        : isApprove
          ? "needing your okay."
          : "awaiting your send.",
      tabCountWord: isSend ? "sent" : isApprove ? "pending" : "ready",
      tabEmpty: isSend
        ? "Nothing sent yet. The Loop writes and sends outreach as it finds contacts."
        : isApprove
          ? "Nothing to approve yet. The Loop queues items here for you to review."
          : "No drafts yet. The Loop writes outreach as it finds contacts — give it a moment.",
      // Per-row badge on NumberedItem for type="draft".
      rowBadge: isSend ? "Email sent" : isApprove ? "Needs approval" : "Email draft",
      // Pipeline column name for the "drafted" stage + the per-card
      // count suffix ({N} drafts | sent | pending).
      pipelineColumn: isSend ? "Sent" : isApprove ? "Queued" : "Drafted",
      pipelineCountWord: (n: number): string =>
        isSend
          ? `${n} sent`
          : isApprove
            ? `${n} pending`
            : `${n} draft${n !== 1 ? "s" : ""}`,
      pipelineEmpty: isSend
        ? "No pipeline yet. As the Loop sends outreach, companies appear here grouped by stage."
        : isApprove
          ? "No pipeline yet. As the Loop queues items, companies appear here grouped by stage."
          : "No pipeline yet. As the Loop finds contacts, drafts appear here grouped by company.",
    },

    // ── Wizard headlines and mode picker ─────────────────────────────
    // The prompt-first wizard uses ONE headline regardless of mode (the
    // textarea is the focus). Mode-specific copy lives on the chip
    // section + the mode-picker fallback below.
    goalsTitle: isBoth
      ? "Tell your Loop what to chase — and who."
      : isRoles
        ? "Tell your Loop what to chase."
        : "Tell your Loop who to chase.",
    goalsTitleAccent: isBoth ? "what" : (isRoles ? "what" : "who"),
    goalsSubtitle: isBoth
      ? "The loop scans for open postings AND surfaces people to network with. Edit anytime."
      : isRoles
        ? "The loop scans for open postings matching the companies and roles you list here. Edit anytime."
        : "The loop only considers companies, industries, and roles you list here. Edit anytime.",
    modeSectionLabel: "Mode",
    modeSectionHint: "What's this Loop chasing?",
    modePeopleBtn: "Find people",
    modePeopleDesc: "Reach professionals at target companies for coffee chats and referrals.",
    modeRolesBtn: "Find roles",
    modeRolesDesc: "Surface open postings matching your target roles. Optional outreach to founders at small companies.",
    modeBothBtn: "Both",
    modeBothDesc: "Network with people AND surface open postings, balanced against one credit budget.",

    // Summary chip rendered next to the parser-detected mode. Lets the
    // wizard say "We read this as: BOTH (job-search + networking)"
    // without re-deriving the phrasing at every call site.
    modeSummary: isBoth
      ? "job-search + networking"
      : isRoles
        ? "job-search"
        : "networking",

    // ── "Prefer alumni" toggle (label flips, field name stays preferAlumni) ─
    preferAlumniLabel: isRoles
      ? "Prefer warm angles"
      : "Prefer alumni",
    preferAlumniHint: isRoles
      ? (school
          ? `Push companies hiring ${school} alumni to the top.`
          : "Push companies my school feeds to the top.")
      : (school
          ? `Push ${school} alumni to the top.`
          : "Push people from my school to the top."),

    // ── H carve-out: LoopActivityFeed interaction-state copy ──────────
    //
    // Mode shapes what the student is here to see — postings (roles),
    // people (people), or both. Empty + loading copy follows.
    // Per eng D11: PARTIAL eyebrow ("still finding more…") dropped from
    // H scope — activity endpoint has no cycle-status field and the
    // state is rarely watched.
    feed: {
      empty: isBoth
        ? `Hunting roles and people. First batch in 5–15 min.${cadenceLine ? ` ${cadenceLine}` : ""}`
        : isRoles
          ? `Hunting open postings. First batch in 5–15 min.${cadenceLine ? ` ${cadenceLine}` : ""}`
          : `Looking for people. First drafts in 5–15 min.${cadenceLine ? ` ${cadenceLine}` : ""}`,
      loading: {
        eyebrow: isBoth ? "WORKING…" : isRoles ? "HUNTING POSTINGS" : "SCOUTING PEOPLE",
      },
      error: "Couldn't reach the feed. Retry in a minute or refresh.",
      // Return-visit eyebrow. Singular vs plural matters at n=1 so we
      // don't say "1 NEW THINGS SINCE…" — small detail but the eyebrow
      // is the felt moment on each visit.
      newSinceLastVisit: (n: number): string =>
        n === 1
          ? "1 NEW SINCE YOU LAST CHECKED"
          : `${n} NEW SINCE YOU LAST CHECKED`,
    },

  };
}
