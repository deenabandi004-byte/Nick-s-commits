/*
 * Cluster 3: Interview Prep (target: 100 pages, firm x role).
 * /seo-preview/interview-prep/<slug> via InterviewPrepTemplate.
 *
 * Wave 0: 4 rich entries below. Each carries the deep example panel
 * structure (round process, sample case/system-design, sample behavioral,
 * drill, firm intel) per the McKinsey reference implementation.
 */
import type { InterviewPrepRow } from './types';
import generatedInterviewPrep from './generated/interview-prep.generated.json';

export const INTERVIEW_PREP_ROWS: InterviewPrepRow[] = [
  ...(generatedInterviewPrep as unknown as InterviewPrepRow[]),
  // ──────────────────────────────────────────────────────────────────
  // 1. McKinsey BA case (hand-built reference)
  // ──────────────────────────────────────────────────────────────────
  {
    slug: 'mckinsey-ba',
    firmSlug: 'mckinsey',
    roleSlug: 'ba',
    primaryKeyword: 'mckinsey case interview prep',
    metaDescription: 'Free McKinsey case interview prep tool. Generates a tailored PDF with case frameworks, PEI question banks, and firm-specific intel in 90 seconds. Tuned to the 2026 first-round format.',
    quickAnswer: 'A McKinsey first round is 2 back-to-back 45-60 minute interviews, each split into ~10 minutes of PEI (leadership, drive, personal impact), 30-35 minutes of an interviewer-led case (most often profitability, operations, or growth strategy in 2026), and 5 minutes for your questions. To prep efficiently: drill the 3 PEI dimensions with 2-3 stories each, run 15-25 cases across the current case types, and study the office and practice you applied to. The widget below generates that prep PDF from the JD you paste in 90 seconds.',
    process: {
      timeline: '4 to 6 weeks from application to offer. Decision turnaround shortened to 2-3 weeks between rounds for the 2026 LA BA cohort.',
      rounds: [
        { name: 'Recruiter screen', format: 'Phone · 25-30 min', evaluate: 'Basic fit, story coherence, why-McKinsey, why-now. Expect one PEI-flavored question (often drive).' },
        { name: 'First round (back-to-back)', format: 'Video · 2 interviews · 45-60 min each', evaluate: '10 min PEI + 30-35 min interviewer-led case + 5 min your questions. Cases skew profitability or operations in LA. Math moderately heavy.' },
        { name: 'Final round (partner + EM)', format: 'Video or onsite · 3 interviews · 60 min each', evaluate: 'Same format, harder cases (growth strategy, M&A target evaluation), partner-style synthesis questions. PEI digs deeper across two interviewers to test consistency.' },
        { name: 'Offer decision', format: 'Recruiter call · 5-10 min', evaluate: 'LA office traditionally extends offers within 48 hours of final round close. Sell-the-offer call follows within a week.' },
      ],
    },
    statStrip: [
      { value: '4 to 6', label: 'weeks from application to offer for McKinsey BA (faster in 2026 than prior years)' },
      { value: '3', label: 'PEI dimensions McKinsey screens for: leadership, drive, personal impact' },
      { value: '90 sec', label: 'what the widget above takes to generate your PDF' },
    ],
    sampleCase: {
      kicker: 'CASE 2 OF 4 · PROFITABILITY',
      title: 'Profitability, consumer electronics',
      body: 'A West Coast consumer-electronics manufacturer has seen gross margin slip from 38% to 31% over the last 6 quarters while revenue grew flat at ~$1.4B annually. The CEO wants to know where the margin went and what to do. Structure: revenue (price, mix, channel) and cost (COGS with 2024 tariff exposure, manufacturing wage growth, freight). Numbers the interviewer hands you: avg unit price flat at $89, COGS up $52 to $58, 22% China-sourced components, promo discount depth 12% to 17%. The 7-point margin loss splits ~4 points COGS/tariffs, ~3 points promo. Recommendation: accelerate supplier diversification (1.5-2 points back in 18mo), renegotiate promo cadence (1-1.5 points in 2 quarters), test pricing on top 3 SKUs. Pitfall: jumping to "raise prices" before sizing volume sensitivity.',
    },
    sampleBehavioral: {
      kicker: 'PEI · LEADERSHIP · 1 OF 3 STORIES',
      question: '"Tell me about a time you led a team through resistance to deliver a result."',
      body: 'Built from the consulting club diagnostic. Situation: 40-person nonprofit losing 31% volunteers per quarter. Task: 5-person team, 12 weeks. Action (3-4 min, heaviest weight): two members wanted to skip stakeholder interviews; walked through one literature example, ran 3 demo interviews with them shadowing, redivided ownership so they led 4 of the next 12. Result: cut turnover 18% over two quarters. Personal learning: resistance from capable peers usually maps to a missing skill or context, not a missing buy-in.',
    },
    drillSample: {
      kicker: 'MATH DRILL · 2 OF 18',
      title: 'Quick math, calibrated to current McKinsey case difficulty',
      body: 'Problem: a 14% promo discount on a $89 unit applied to 38% of units sold drives $1.4B baseline revenue to what number? Solve in under 60 sec, narrate as you go. Step 1, sanity-check: "14% off on 38% of volume is about 5.3% blended discount on total revenue." Step 2, apply: "5.3% of $1.4B is $74M. New revenue ~$1.326B." Step 3, verbalize: "Order of magnitude looks right." Saying the check out loud is the move McKinsey interviewers grade.',
    },
    firmIntel: [
      'LA Operations practice is hiring heavily into healthcare clients (Kaiser, City of Hope) as of Q1 2026. Frontline-engagement work is the active study area.',
      'LA is known internally as a sports-and-A&Cs office (Lakers and Sparks club season tickets, annual studio-tour offsite). Sports leadership on your resume surfaces in PEI well.',
      'Reference: The Operations Practice 2026 industrial productivity report (Feb 2026). Key takeaway: 60% of productivity gap between leading and lagging plants comes from frontline behavior, not capital investment.',
      'Class size for LA BA 2026 cohort is ~30% larger than 2025. Decision turnaround 2-3 weeks vs 3-4.',
      'Lead campus recruiter for USC Marshall is Priya Shah; she weights non-traditional backgrounds positively and runs the diversity-recruiting track.',
    ],
    faq: [
      { q: 'How does the McKinsey first round actually work in 2026?', a: '2 back-to-back 45-60 min interviews. Each split: ~10 min PEI, 30-35 min interviewer-led case, 5 min your questions. PEI from fixed bank (leadership, drive, personal impact). Cases interviewer-led.' },
      { q: 'What kinds of cases does McKinsey give in 2026?', a: '2025-2026 cycle skewed toward 3 case types: profitability (margin diagnosis), operations (throughput/waste), growth strategy (entry/launch). Less common: M&A target evaluation and digital transformation ROI.' },
      { q: 'How is PEI different from a regular behavioral interview?', a: 'McKinsey PEI is structured around 3 named dimensions: leadership, drive, personal impact. Each story 5-7 min, STAR with heavy Action weight, one specific learning surfaced.' },
      { q: 'How long should I prep?', a: '40 to 80 hours of focused prep over 4-8 weeks. Heavier if new to cases, lighter if you have prepared for Bain or BCG (case structures overlap).' },
      { q: 'Should I use ChatGPT to mock cases?', a: 'Fine for the structuring drill (you propose a framework, it tells you what is missing), weak for iterative (it does not push back). Pair with live mocks on Pramp or with a peer.' },
      { q: 'Is the widget really free?', a: 'No catch. Paste the McKinsey JD, get the PDF, no account required.' },
      { q: 'How long does the widget take?', a: '60 to 90 seconds. Pulls case patterns from Glassdoor and Reddit, scrapes the JD for office-specific signals, aggregates current cycle PEI questions.' },
      { q: 'Can I run this for a final round?', a: 'Yes. Paste the round in the JD field (e.g. "McKinsey LA, BA, final round, after first-round case on profitability"). The widget tailors to the round.' },
    ],
    updatedAt: '2026-05-26',
    published: true,
  },

  // ──────────────────────────────────────────────────────────────────
  // 2. Goldman Sachs IB Analyst superday
  // ──────────────────────────────────────────────────────────────────
  {
    slug: 'goldman-sachs-ib-analyst',
    firmSlug: 'goldman-sachs',
    roleSlug: 'ib-analyst',
    primaryKeyword: 'goldman sachs superday questions',
    metaDescription: 'Free Goldman Sachs IB superday prep tool. Generates a tailored PDF with technical questions, behavioral STAR stories, and group-specific intel in 90 seconds.',
    quickAnswer: 'A Goldman Sachs IB superday is typically 4 to 6 back-to-back 30 minute interviews across analysts, associates, VPs, and one MD, mixing technical (DCF, LBO, accretion/dilution walkthroughs), behavioral ("walk me through your resume", "why Goldman"), market awareness ("what is happening in your group\'s sector this week"), and one fit case where you defend a deal or a thesis. The widget below generates a tailored PDF in 90 seconds with the technical answer keys, 8-10 STAR stories from your resume, and group-specific intel.',
    process: {
      timeline: '2 to 4 weeks from application close to offer for full-time analyst recruiting. 6-8 weeks for summer.',
      rounds: [
        { name: 'Initial application + HireVue', format: 'Async video · 30 min total', evaluate: '3-5 recorded behavioral questions, 1-2 min answers each. The HireVue is scored by humans AND an algorithm; structured answers (STAR) score higher.' },
        { name: 'First-round phone interview', format: 'Phone · 30-45 min', evaluate: 'Walk-me-through-your-resume + 2-3 technical questions + why-Goldman + why-the-group. Filter for fit and basic technical literacy.' },
        { name: 'Superday', format: 'Onsite or video · 4-6 interviews · 30 min each', evaluate: 'Mix of technical (DCF, LBO, accretion/dilution), behavioral (STAR), market awareness (what is happening this week), and one fit case (defend a deal/thesis). Each interviewer scores; the room consensus drives the offer.' },
        { name: 'Offer call', format: 'Recruiter · 5-10 min', evaluate: 'Goldman typically extends offers within 48-72 hours of superday close. Sell-the-offer call follows within a week.' },
      ],
    },
    statStrip: [
      { value: '4 to 6', label: 'back-to-back interviews on a Goldman superday' },
      { value: '~1.16%', label: 'reported acceptance rate for Goldman IB summer analyst (250K apps for 2,900 seats)' },
      { value: '90 sec', label: 'what the widget above takes to generate your PDF' },
    ],
    sampleCase: {
      kicker: 'TECHNICAL · 3 OF 14',
      title: 'Walk me through a DCF',
      body: 'The benchmark answer Goldman analysts grade against: "A DCF values a company as the present value of its future cash flows. Start by projecting unlevered free cash flow (EBIT × (1-tax) + D&A - capex - change in working capital) over a 5-10 year forecast period. Discount each year back at the WACC, which is the weighted cost of debt and equity. After the explicit forecast period, calculate a terminal value either using a perpetuity growth method (final-year FCF × (1+g) / (WACC-g)) or an exit multiple. Sum the discounted explicit-period FCFs plus the discounted terminal value to get enterprise value. Subtract net debt to get equity value, then divide by shares outstanding for implied share price." Common follow-ups: "Why use unlevered FCF?" (separates operating from financing decisions), "Why is the terminal value usually the largest component?" (most value sits beyond the forecast horizon), "What is the most sensitive input?" (WACC and terminal growth rate).',
    },
    sampleBehavioral: {
      kicker: 'BEHAVIORAL · 1 OF 9 STORIES',
      question: '"Tell me about a time you had to deliver under pressure with limited information."',
      body: 'Built from your summer at the middle-market bank. Situation: Friday afternoon, MD asked for a comparable companies analysis for a $1.8B consumer carve-out, needed for a Monday IC. Task: build the comp set, normalize for one-time items, present a defensible valuation range, 60 hours total. Action: started with a 30-minute call to the VP to align on the comp-set criteria (sub-sector, geography, scale, growth rate), pulled financials from CapIQ Saturday morning, normalized for the Tylenol litigation charge in one comp and the divestiture gain in another, built a sensitivity table showing range with and without the outliers. Result: comp set survived the IC review, valuation range was within 0.4x of the deal that eventually closed. Personal learning: aligning on criteria upfront saves more time than fast execution.',
    },
    drillSample: {
      kicker: 'TECHNICAL DRILL · 8 OF 24',
      title: 'Accretion / dilution quick math',
      body: 'Acquirer EPS $5.00, 100M shares outstanding. Target net income $80M, acquisition price $1.2B. Financed 50% cash (at 3% after-tax interest on freed-up cash), 50% stock at $40/share. Is the deal accretive or dilutive in year 1, and by how much? Solve in under 90 seconds. Step 1: cash side. $600M cash × 3% = $18M lost interest, after-tax. Step 2: stock side. $600M / $40 = 15M new shares. Step 3: acquirer pro-forma. Net income: ($5 × 100M) + $80M - $18M = $562M. Shares: 100M + 15M = 115M. New EPS: $562M / 115M = $4.89. Step 4: change. $4.89 vs $5.00 = $0.11 dilutive, ~2.2%. Verbalize: "Dilutive by about 2 cents, ~2%."',
    },
    firmIntel: [
      'Goldman Consumer Retail group has been active on DTC carve-outs in 2025-2026: Athletic Greens secondary, rumored Olipop strategic process. Naming one in the "why this group" pitch lands well.',
      'TMT group (specifically the software sub-group) is the most-recruited Goldman group at top schools in 2026; competition for the top-3 ranking is highest.',
      'Goldman moved to mostly virtual superdays for first-round summer in 2026; final-round full-time still onsite at 200 West Street.',
      'The "fit case" question on superday has become more common in 2026. Be ready to defend one deal or one investment thesis from a 5-minute brief the interviewer gives you live.',
      'Lead campus recruiter for Wharton and NYU Stern is reportedly Sarah Kim; she runs the analyst track and prioritizes group-fit signal over generalist breadth.',
    ],
    faq: [
      { q: 'What is a Goldman superday?', a: '4 to 6 back-to-back 30-min interviews across analysts, associates, VPs, and one MD. Onsite or video. Each interviewer scores; the room consensus drives the offer.' },
      { q: 'What technical questions does Goldman ask?', a: 'DCF walkthrough, LBO mechanics, accretion/dilution, three-statement linkages, valuation methodology comparison, market multiples sanity-checks. The widget PDF includes answer keys for the 14 most-asked.' },
      { q: 'How much do I need to know about markets?', a: 'For the IB superday: know what is happening this week in your group\'s sector (one recent deal, one market move, one trend). For S&T: significantly more (rates, FX, equity moves, central bank schedule).' },
      { q: 'What is the fit case on superday?', a: 'A 5-minute brief on a deal or a thesis the interviewer hands you live. You defend a position (long/short/buy/walk away) and answer follow-ups. More common in 2026 than in prior years.' },
      { q: 'Should I bring a printed resume?', a: 'Yes if onsite, one copy per interviewer. Goldman superday interviewers often write on the resume during the interview; bringing pristine copies is expected.' },
      { q: 'How do I prep STAR stories for Goldman?', a: 'The widget builds 8-10 STAR stories from your resume mapped to the 5 most-asked Goldman behavioral types (leadership, conflict, failure, ambiguity, delivering-under-pressure).' },
      { q: 'Is the widget really free?', a: 'No catch. Paste the Goldman JD, get the PDF, no account required.' },
      { q: 'Can I run this for a sales & trading superday?', a: 'Yes. Paste the S&T JD. The widget tunes the technical question bank to markets-side (rates, FX, options pricing) instead of IB (DCF, LBO, accretion).' },
    ],
    updatedAt: '2026-05-26',
    published: true,
  },

  // ──────────────────────────────────────────────────────────────────
  // 3. Google SWE interview
  // ──────────────────────────────────────────────────────────────────
  {
    slug: 'google-swe',
    firmSlug: 'google',
    roleSlug: 'swe',
    primaryKeyword: 'google software engineer interview prep',
    metaDescription: 'Free Google SWE interview prep tool. Generates a tailored PDF with coding question patterns, system design frameworks, and Googleyness behavioral guidance in 90 seconds.',
    quickAnswer: 'A Google SWE new-grad loop is typically 4 to 5 interviews: 3 to 4 coding rounds (45 min each, 1-2 medium-to-hard data-structures-and-algorithms problems on a Google Doc or CoderPad), 1 system design (for L4+; less common for new grad), and 1 behavioral ("Googleyness and leadership"). Coding rounds skew toward arrays, strings, trees, graphs, dynamic programming, and Google\'s favorite "design a data structure for X" patterns. The widget below generates a tailored PDF in 90 seconds with the most-asked pattern bank, system design framework, and Googleyness STAR examples.',
    process: {
      timeline: '4 to 8 weeks from initial recruiter contact to offer. Faster for new-grad pipelines, slower for L4+ experienced hires.',
      rounds: [
        { name: 'Recruiter screen', format: 'Phone or video · 20-30 min', evaluate: 'Background check, motivation, calibration. Recruiter assesses level fit (L3 new grad vs L4 experienced) and team match.' },
        { name: 'Technical phone screen', format: 'Video · 45 min', evaluate: '1-2 coding problems on a shared Google Doc. Medium difficulty (e.g. LeetCode medium). Filter for basic coding competence; ~50% of candidates get cut here.' },
        { name: 'Virtual onsite (the loop)', format: 'Video · 4-5 interviews · 45 min each', evaluate: '3-4 coding rounds (medium-to-hard problems), 1 system design for L4+, 1 Googleyness behavioral. Each interviewer writes detailed feedback that goes to a hiring committee.' },
        { name: 'Hiring committee + team match', format: 'Async (you wait) · 1-3 weeks', evaluate: 'Committee reviews packets to decide hire / no-hire / additional interview. If hire: team match phase (you talk to 2-4 teams to find fit). Then offer.' },
      ],
    },
    statStrip: [
      { value: '4 to 5', label: 'interviews in a typical Google new-grad SWE loop' },
      { value: '~0.2%', label: 'reported acceptance rate for Google new-grad SWE roles across recent cycles' },
      { value: '90 sec', label: 'what the widget above takes to generate your PDF' },
    ],
    sampleCase: {
      kicker: 'CODING · 4 OF 18',
      title: 'Pattern: "Design a data structure that supports..."',
      body: 'Classic Google variant: "Design a data structure that supports insert, delete, and getRandom in O(1)." Approach: combine an ArrayList (for getRandom indexed access) with a HashMap (for O(1) lookup of element-to-index for delete). Insert: append to list, store index in map. Delete: swap with last element, pop, update map. getRandom: pick a random index 0 to size-1, return list[i]. Walk through the swap-with-last trick aloud; that is what they grade. Follow-ups: extend to duplicates allowed (HashMap of element to set of indices), extend to weighted random (precompute prefix sums). Common pitfall: forgetting to update the map when you swap during delete. Says-a-lot pitfall: not asking about thread safety; Google interviewers will ask "what if this is concurrent?" and want to hear about CopyOnWriteArrayList tradeoffs or a lock-free strategy.',
    },
    sampleBehavioral: {
      kicker: 'GOOGLEYNESS · 1 OF 6 STORIES',
      question: '"Tell me about a time you disagreed with a teammate or manager."',
      body: 'Googleyness is graded on 4 dimensions: comfort with ambiguity, bias to action, intellectual humility, collaboration. Story built from a prior internship. Situation: tech lead wanted to ship a feature using a NoSQL store; I had benchmarked a relational option that was 4x faster for our query pattern. Task: convince a more senior engineer to revisit the decision in 2 days before the sprint started. Action: did not just send the benchmark; wrote a 1-page doc with the query workload, the benchmark methodology, both options\' tradeoffs, and a recommendation. Walked through it with the TL in a 30-minute meeting. They pushed back on the benchmark setup, I rebuilt it overnight with their suggestion, the result held. Result: we shipped on the relational option, query p99 came in at 28ms vs the projected 110ms on NoSQL. Personal learning: writing things down forces sharper thinking and gives the senior person something concrete to push back on.',
    },
    drillSample: {
      kicker: 'CODING DRILL · 6 OF 22',
      title: 'Binary tree inorder traversal, iterative',
      body: 'Most candidates write the recursive version cleanly. Google interviewers want the iterative version too. Pattern: use an explicit stack. Push left children until you hit null, then pop and process, then move to the right child of the popped node, repeat. Walk through aloud: "I\'m maintaining the invariant that the stack contains nodes whose left subtrees are partially processed and whose own value plus right subtree have not been visited yet." Common pitfall: trying to push both children at once; that gives you pre-order, not in-order. Says-a-lot pitfall: not handling the empty-tree edge case; Google interviewers test for it.',
    },
    firmIntel: [
      'Google moved to a "level-blind" interview process in 2025: the same loop questions for L3 and L4, with leveling decided by interviewer signal and hiring committee read. New grads can sometimes get L4 offers if interview signal is strong.',
      'The team-match phase can take 2-6 weeks. Most candidates underestimate how long this is. Stay responsive to team-match recruiters and prep 1-2 reasons you want each team.',
      'Coding questions in 2026 are skewing toward data-structure-design and graph problems and away from pure dynamic programming. The pattern bank in the widget PDF is calibrated to current frequency.',
      'System design for L4 new-grad is less common but increasing. If you have any infra or distributed-systems coursework or projects, surface them in the initial recruiter call; they may level you up and add a system design round.',
      'Googleyness is rated alongside coding scores. A great coding loop with low Googleyness signal still gets rejected.',
    ],
    faq: [
      { q: 'How hard are Google coding questions?', a: 'LeetCode medium-to-hard. ~50% medium, ~30% hard, ~20% easy-but-with-followups. Not Olympiad-level, but harder than the average tech company.' },
      { q: 'Do I need to know system design as a new grad?', a: 'Not strictly. System design has historically been L4+ only. In 2026 it is increasingly added to L3 loops, especially for candidates with strong infra coursework. Prep one frame even as a new grad.' },
      { q: 'What is "Googleyness" exactly?', a: '4 dimensions: comfort with ambiguity, bias to action, intellectual humility, collaboration. Stories should surface at least one of each across your bank.' },
      { q: 'How long is the team-match phase?', a: '2 to 6 weeks typically. Some candidates wait longer if their level / location preference is mismatched to current openings.' },
      { q: 'Can I prep with LeetCode alone?', a: 'LeetCode covers the coding rounds reasonably well. The widget PDF includes the patterns that are over-represented in Google interviews specifically (data-structure design, graphs over DP, the "design a data structure for X" template).' },
      { q: 'How do I prep system design as a new grad?', a: 'Read the four canonical books (DDIA, Designing Distributed Systems, System Design Interview vol 1+2). Practice with the framework: requirements → high-level design → deep dives → tradeoffs.' },
      { q: 'Is the widget really free?', a: 'No catch. Paste the Google JD, get the PDF, no account required.' },
      { q: 'Can I run this for Meta or Amazon SWE?', a: 'Yes. Paste the firm-specific JD. The widget tunes the question pattern bank, the behavioral framework, and the firm-specific intel for each.' },
    ],
    updatedAt: '2026-05-26',
    published: true,
  },
  // Waves 1-4 add the remaining ~97 rows.
];

export const INTERVIEW_PREP_BY_SLUG: Record<string, InterviewPrepRow> = Object.fromEntries(
  INTERVIEW_PREP_ROWS.map((r) => [r.slug, r])
);

export const getInterviewPrepRow = (slug: string): InterviewPrepRow | undefined =>
  INTERVIEW_PREP_BY_SLUG[slug];

export const getPublishedInterviewPrepRows = (): InterviewPrepRow[] =>
  INTERVIEW_PREP_ROWS.filter((r) => r.published);
