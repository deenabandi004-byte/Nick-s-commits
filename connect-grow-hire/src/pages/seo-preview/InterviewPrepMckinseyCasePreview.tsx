/*
 * SEO PREVIEW: interview prep (PREP), widget-embedded variant.
 * Route: /seo-preview/interview-prep-mckinsey-case
 *
 * Pairs InterviewPrepWidget with a McKinsey-case-specific example panel.
 * The widget's CompletedCard is intentionally minimal (READY + Download),
 * so the example panel renders that header card AND a preview of what is
 * IN the generated PDF: a sample case framework, a sample PEI question,
 * and McKinsey-specific intel. This demonstrates value beyond a button.
 *
 * Built per ranking-playbook.md: Quick-Answer block, question-form H2s,
 * McKinsey-specific factual block, JSON-LD, freshness byline.
 *
 * House style: no em dashes, no sparkle icons.
 */
import { Helmet } from 'react-helmet-async';
import {
  Target, Download, FileText, BadgeCheck, Bot, ClipboardPaste, TrendingUp, Lightbulb,
  Calculator, MessageCircleQuestion, CalendarDays, Users,
} from 'lucide-react';
import {
  BRAND, BRAND_DARK, INK, kicker, serif,
  PreviewNav, PreviewFooter,
  HowItWorks, FAQ, PreviewCTA,
  InlineEmailCapture, ExitIntentCapture, h2Style, pStyle, gridLayer,
} from './_shared';
import { InterviewPrepWidget } from '../../components/widgets/InterviewPrepWidget';

const UPDATED_LABEL = 'Updated May 2026';
const PUBLISH_DATE_ISO = '2026-05-26';

const emailCapture = {
  eyebrow: 'NOT INTERVIEWING YET?',
  heading: 'Get the weekly consulting interview drop',
  subtext: 'Every Monday: new case types appearing in McKinsey, Bain, and BCG rounds, fresh PEI question drops, and the firm-specific intel that moved the needle for last cycle\'s candidates. Free, no spam.',
  buttonText: 'Send me the drop',
  cluster: 'consulting',
};

const FAQ_ITEMS = [
  {
    q: 'How does the McKinsey first round actually work in 2026?',
    a: 'First round is typically 2 back-to-back interviews, each running 45 to 60 minutes. Each interview is split: roughly 10 minutes of PEI (personal experience interview), 30 to 35 minutes of case, and 5 minutes for your questions. PEI questions come from a fixed bank (leadership, drive, personal impact). Cases are interviewer-led: McKinsey moves you through a structured prompt, market sizing, recommendation. The widget generates prep tailored to all three parts.',
  },
  {
    q: 'What kinds of cases does McKinsey actually give in 2026?',
    a: 'The 2025 to 2026 cycle skewed toward 3 case types: profitability (find why margin is down for a specific industry client), operations (improve throughput or cut waste in a process), and growth strategy (where to enter, what to launch). Less common but appearing: M&A target evaluation and digital transformation ROI. The widget pulls live samples from the role and office you paste, so the case bank matches what is currently being asked.',
  },
  {
    q: 'How is the PEI different from a regular behavioral interview?',
    a: 'McKinsey\'s PEI is structured around 3 dimensions: leadership (a time you led a team or initiative), drive (a time you pushed through resistance to deliver), and personal impact (a time you changed someone\'s mind or behavior). Each story should be 5 to 7 minutes, follow STAR with a heavy emphasis on the Action, and surface one specific learning. Vague stories that bounce between dimensions get cut. The widget produces 2 to 3 fully-built stories per dimension from your resume.',
  },
  {
    q: 'How long should I prep for a McKinsey first round?',
    a: 'The consensus across 2025 cycle reports: 40 to 80 hours of focused prep, spread over 4 to 8 weeks. Heavier if you are new to cases, lighter if you have prepared for Bain or BCG already (the case structures overlap). The widget output is designed to compress the "what do I prep" question so your 40 to 80 hours go to actual practice, not figuring out what to study.',
  },
  {
    q: 'Should I use ChatGPT to mock cases?',
    a: 'ChatGPT is fine for the structuring drill (you propose a framework, it tells you what is missing) and weak for the iterative drill (it does not push back like a real interviewer). Pair it: use ChatGPT for the first 5 to 10 reps of structuring, then switch to live mocks with a peer or paid coach (Pramp is free, RocketBlocks paid). The widget generates the question and case banks ChatGPT then drills you on.',
  },
  {
    q: 'Is the widget really free? What is the catch?',
    a: 'No catch. Paste the McKinsey JD or describe the round you have, get the PDF prep doc, no account required. We ask for an email when you submit so we can send you the report and the weekly consulting drop, and so we can rate-limit the tool.',
  },
  {
    q: 'How long does the widget take?',
    a: 'Usually 60 to 90 seconds. The widget runs live research against the role and the firm: pulls case patterns from Glassdoor and Reddit reports, scrapes the JD for office-specific signals, and aggregates the most-asked PEI questions for the cycle. The output PDF is typically 12 to 18 pages.',
  },
  {
    q: 'Can I run this for a final round, not just first round?',
    a: 'Yes. Paste the round in the JD field (e.g. "McKinsey LA, final round, BA, after first-round case on profitability"). The widget tailors the prep to the round, including the kind of partner-style questions that show up in finals.',
  },
];

const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Article',
      'headline': 'McKinsey Case Interview Prep (Free PDF, Tailored to Your Round)',
      'datePublished': PUBLISH_DATE_ISO,
      'dateModified': PUBLISH_DATE_ISO,
      'author': { '@type': 'Organization', 'name': 'Offerloop' },
      'publisher': { '@type': 'Organization', 'name': 'Offerloop' },
      'description': 'Free McKinsey case interview prep tool. Generates a tailored PDF with case frameworks, PEI question banks, and firm-specific intel in 90 seconds. Tuned to the 2026 first-round format.',
    },
    {
      '@type': 'FAQPage',
      'mainEntity': FAQ_ITEMS.map((f) => ({
        '@type': 'Question',
        'name': f.q,
        'acceptedAnswer': { '@type': 'Answer', 'text': f.a },
      })),
    },
    {
      '@type': 'HowTo',
      'name': 'How to prep for a McKinsey case interview in 2026',
      'step': [
        { '@type': 'HowToStep', 'name': 'Paste the McKinsey posting', 'text': 'JD text or URL. Include the office and round if you have it.' },
        { '@type': 'HowToStep', 'name': 'Generate the prep PDF', 'text': 'The widget runs live research against the role and the firm, takes 60 to 90 seconds.' },
        { '@type': 'HowToStep', 'name': 'Drill the case bank', 'text': 'Work through the 4 to 6 case frameworks tailored to current McKinsey case types.' },
        { '@type': 'HowToStep', 'name': 'Mock the PEI', 'text': 'Use the 2 to 3 fully-built stories per PEI dimension to prep your STAR structure.' },
      ],
    },
    {
      '@type': 'WebApplication',
      'name': 'Offerloop Free Interview Prep',
      'applicationCategory': 'BusinessApplication',
      'operatingSystem': 'Web',
      'offers': { '@type': 'Offer', 'price': '0', 'priceCurrency': 'USD' },
    },
  ],
};

// ──────────────────────────────────────────────────────────────────────────
// Example panel.
// Top: mirrors InterviewPrepWidget's CompletedCard (READY + heading +
// Download / Try-another).
// Below: preview of what is INSIDE the generated PDF, so the example panel
// demonstrates value, not just a download button. Three preview cards:
// sample case framework, sample PEI question, McKinsey-specific intel.
// ──────────────────────────────────────────────────────────────────────────

const McKinseyCaseExamplePanel = () => (
  <div style={{ width: '100%' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ ...kicker, display: 'inline-block' }}>EXAMPLE OUTPUT</span>
      <span style={{ fontSize: 12, color: '#94A3B8' }}>USC Marshall student, McKinsey BA first round</span>
    </div>

    {/* READY card matching widget's CompletedCard */}
    <div style={cardShell}>
      <p style={{ fontSize: 12.5, fontWeight: 700, color: BRAND_DARK, letterSpacing: '0.05em', margin: 0, marginBottom: 8 }}>
        READY
      </p>
      <h3 style={{ fontFamily: serif, fontSize: 26, fontWeight: 400, color: INK, margin: 0, marginBottom: 6 }}>
        Your interview prep is ready
      </h3>
      <p style={{ fontSize: 14, color: '#475569', marginTop: 0, marginBottom: 18 }}>
        Business Analyst at McKinsey & Company, Los Angeles
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button disabled style={primaryBtnExample}><Download size={16} /> Download PDF</button>
        <button disabled style={ghostBtnExample}>Try another posting</button>
      </div>
      <div style={{ marginTop: 18, padding: '12px 14px', background: '#F0F7FF', border: `1px solid #DBEAFE`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <FileText size={14} style={{ color: BRAND_DARK }} />
        <span style={{ fontSize: 12.5, color: BRAND_DARK, fontWeight: 600 }}>17-page PDF</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#475569' }}>
          process · 4 cases · 9 PEI · math drills · 48-hr plan
        </span>
      </div>
    </div>

    {/* What's inside the PDF: preview cards */}
    <div style={{ marginTop: 18, marginBottom: 10 }}>
      <p style={{ ...kicker, marginBottom: 0 }}>WHAT IS IN THE PDF</p>
    </div>

    {/* SECTION 1: Interview Process round-by-round */}
    <PreviewCard
      icon={<Users size={14} style={{ color: BRAND }} />}
      kicker="SECTION 1 OF 7 · INTERVIEW PROCESS"
      title="The McKinsey LA BA round, end-to-end"
      body={
        <>
          <p style={{ ...previewPara, marginBottom: 12 }}>
            <strong>Timeline:</strong> 4 to 6 weeks from application to offer. Decision turnaround
            shortened to 2 to 3 weeks between rounds for the 2026 LA BA cohort.
          </p>
          <RoundRow
            name="Recruiter screen"
            format="Phone · 25 to 30 min"
            evaluate="Basic fit, story coherence, why-McKinsey, why-now. Recruiters gauge whether you are seriously interviewing or shopping the firm against others. Expect one PEI-flavored question (often drive)."
          />
          <RoundRow
            name="First round (back-to-back)"
            format="Video · 2 interviews · 45 to 60 min each"
            evaluate="10 min PEI (one dimension per interviewer, surfaced from the recruiter's notes) + 30 to 35 min interviewer-led case + 5 min your questions. Cases skew profitability or operations in LA. Math is moderately heavy (one 3-step calculation per case typical)."
          />
          <RoundRow
            name="Final round (partner + EM)"
            format="Video or onsite · 3 interviews · 60 min each"
            evaluate="Same format, harder cases (growth strategy, M&A target evaluation), partner-style 'what would you tell the CEO' synthesis questions. PEI digs deeper, often into the same story across two interviewers to test consistency."
          />
          <RoundRow
            name="Offer decision"
            format="Recruiter call · 5 to 10 min"
            evaluate="LA office traditionally extends offers within 48 hours of final round close. Sell-the-offer call follows within a week (alumni introductions, office-tour invite, signing bonus discussion)."
            noBorder
          />
        </>
      }
    />

    {/* SECTION 2: Case framework */}
    <PreviewCard
      icon={<Target size={14} style={{ color: BRAND }} />}
      kicker="SECTION 2 OF 7 · CASE BANK · 2 OF 4"
      title="Profitability, consumer electronics"
      body={
        <>
          <p style={{ ...previewPara, marginBottom: 10 }}>
            <strong>Prompt.</strong> A West Coast consumer-electronics manufacturer has seen
            gross margin slip from 38% to 31% over the last 6 quarters while revenue grew
            flat at ~$1.4B annually. The CEO wants to know where the margin went and what
            to do. You have 30 minutes.
          </p>
          <p style={{ ...previewPara, marginBottom: 6 }}>
            <strong>Clarifications to ask up front (60 sec).</strong>
          </p>
          <ul style={{ ...previewPara, paddingLeft: 18, marginBottom: 10 }}>
            <li>Is this margin slip versus our own history, or versus competitors too?</li>
            <li>Same product mix, same channels, or has either shifted?</li>
            <li>What is the CEO\'s timeline: protect the next 2 quarters, or 18-month structural fix?</li>
          </ul>
          <p style={{ ...previewPara, marginBottom: 6 }}>
            <strong>Suggested structure (verbatim opener):</strong> "I\'d like to look at this through two branches, revenue-side and cost-side, because margin compresses for one of those reasons. On revenue I\'ll look at price and mix. On cost I\'ll split COGS, manufacturing, and freight."
          </p>
          <ul style={{ ...previewPara, paddingLeft: 18, marginBottom: 10 }}>
            <li><strong>Revenue:</strong> avg unit price (list vs net), mix shift to lower-margin SKUs, discounting depth, promo frequency, channel mix (D2C vs retail vs Amazon, each at different margins), returns/RMA rate.</li>
            <li><strong>COGS:</strong> raw input prices (rare earths, lithium, semiconductors), supplier concentration risk, tariffs (2024 schedule on China-sourced components is the biggest driver in this case type).</li>
            <li><strong>Manufacturing:</strong> labor wage growth (Tier-1 supplier wages up 8 to 12% since 2023), utilization, scrap rate, automation depreciation.</li>
            <li><strong>Freight:</strong> ocean freight normalized in 2024 (this is a margin tailwind, not a driver), last-mile costs.</li>
          </ul>
          <p style={{ ...previewPara, marginBottom: 6 }}>
            <strong>Numbers the interviewer will likely hand you.</strong> Avg unit price flat at $89.
            COGS up from $52 to $58. Tariff exposure: 22% of components from China. Promo discount
            depth up from 12% to 17%. Walk through: 7-point margin loss splits roughly 4 points
            from COGS/tariffs, 3 points from promo discounting.
          </p>
          <p style={{ ...previewPara, marginBottom: 6 }}>
            <strong>Recommendation (top-down, 90 sec).</strong> "We\'ve lost 7 margin points,
            roughly 4 from input cost and tariff exposure, 3 from deeper promo discounting.
            I\'d recommend three moves: (1) accelerate the supplier diversification away from
            China-sourced components to recover 1.5 to 2 points within 18 months, (2) renegotiate
            promo cadence with retail partners to recover 1 to 1.5 points within 2 quarters,
            (3) revisit pricing on the top 3 SKUs to test elasticity, potential 0.5 to 1 point
            upside. Biggest risk is competitor pricing pressure if we move first on (3)."
          </p>
          <p style={{ ...previewPara, margin: 0 }}>
            <strong>Pitfall to avoid.</strong> Jumping to "raise prices" before sizing the
            volume sensitivity, or proposing automation as the first lever (multi-year payback,
            wrong tool for the CEO\'s 18-month frame). McKinsey interviewers cut for both.
          </p>
        </>
      }
    />

    {/* SECTION 3: PEI */}
    <PreviewCard
      icon={<ClipboardPaste size={14} style={{ color: BRAND }} />}
      kicker="SECTION 3 OF 7 · PEI · LEADERSHIP · 1 OF 3 STORIES"
      title='"Tell me about a time you led a team through resistance to deliver a result."'
      body={
        <>
          <p style={{ ...previewPara, marginBottom: 8 }}>
            <strong>Built from your resume:</strong> the 12-week consulting club diagnostic for a 40-person nonprofit.
          </p>
          <p style={{ ...previewPara, marginBottom: 6 }}>
            <strong>STAR draft (5 to 7 min target, 70% on Action).</strong>
          </p>
          <p style={{ ...previewPara, marginBottom: 6 }}>
            <em>Situation (45 sec).</em> Pro bono client was a 40-person environmental nonprofit losing 31% of volunteers per quarter and burning the ED\'s time on constant rerecruiting. I led a 5-person diagnostic team over 12 weeks.
          </p>
          <p style={{ ...previewPara, marginBottom: 6 }}>
            <em>Task (30 sec).</em> Identify the volunteer-turnover drivers and propose a phased intervention the ED could run without consultants.
          </p>
          <p style={{ ...previewPara, marginBottom: 6 }}>
            <em>Action (3 to 4 min, heaviest weight).</em> Two team members wanted to skip stakeholder interviews and run a survey "to be more rigorous." I disagreed because interviews surface the unspoken drivers, but I knew the disagreement would matter for the rest of the 12 weeks, so I did three things: (1) walked through one literature example where the survey caught the wrong root cause, (2) ran 3 demonstration interviews with them shadowing so they could see the unprompted "actually..." moments, (3) redivided ownership so they led 4 of the next 12 interviews. After the third demo interview one of them said "I get it now, you can\'t survey what people don\'t know to flag." We did add a survey for triangulation, but it was scoped to the hypotheses interviews surfaced first.
          </p>
          <p style={{ ...previewPara, marginBottom: 6 }}>
            <em>Result (45 sec).</em> Recommendation cut turnover 18% over the next two quarters; the ED later said the volunteer-onboarding rework was the single highest-impact change. The two team members who pushed back stayed on the club leadership track; one is now co-president.
          </p>
          <p style={{ ...previewPara, margin: 0 }}>
            <em>Personal learning.</em> Resistance from capable peers usually maps to a missing skill or context, not a missing buy-in. The intervention is to teach the skill, not to argue.
          </p>
        </>
      }
    />

    {/* SECTION 4: Math drills */}
    <PreviewCard
      icon={<Calculator size={14} style={{ color: BRAND }} />}
      kicker="SECTION 4 OF 7 · MATH DRILL · 2 OF 18"
      title="Quick math, calibrated to current McKinsey case math difficulty"
      body={
        <>
          <p style={{ ...previewPara, marginBottom: 8 }}>
            <strong>Problem 4.</strong> A 14% promo discount on a $89 unit, applied to 38% of
            units sold, drives total revenue from a $1.4B baseline to what number? Solve in
            under 60 seconds, narrate as you go.
          </p>
          <p style={{ ...previewPara, marginBottom: 4 }}>
            <em>Step 1, sanity-check.</em> "14% off on 38% of volume is about 5.3% blended discount on total revenue."
          </p>
          <p style={{ ...previewPara, marginBottom: 4 }}>
            <em>Step 2, apply.</em> "5.3% of $1.4B is $74M. New revenue ~$1.326B."
          </p>
          <p style={{ ...previewPara, marginBottom: 12 }}>
            <em>Step 3, verbalize the check.</em> "Order of magnitude looks right; we\'re moving billions to hundreds of millions, not flipping a sign."
          </p>
          <p style={{ ...previewPara, marginBottom: 8 }}>
            <strong>Problem 5.</strong> The CEO wants to know what 1 margin point is worth
            annually at $1.4B revenue. Answer in under 30 seconds.
          </p>
          <p style={{ ...previewPara, margin: 0 }}>
            <em>Answer.</em> "1% of $1.4B = $14M of margin per point. So the 7-point margin loss is roughly $98M annually." Saying the dollar value out loud is the move that signals you can translate percent to impact.
          </p>
        </>
      }
    />

    {/* SECTION 5: Questions to ask */}
    <PreviewCard
      icon={<MessageCircleQuestion size={14} style={{ color: BRAND }} />}
      kicker="SECTION 5 OF 7 · QUESTIONS TO ASK · 4 OF 24"
      title="Tailored to McKinsey LA Operations practice, interviewer-specific"
      body={
        <>
          <ul style={{ ...previewPara, paddingLeft: 18, margin: 0 }}>
            <li><strong>For a senior associate.</strong> "What\'s the difference between the kind of work you did as a BA versus the work you\'re doing now as an SA? What\'s the muscle you grew that you didn\'t see coming?"</li>
            <li><strong>For an EM in Operations.</strong> "The LA Operations practice has been hiring into healthcare clients (Kaiser, City of Hope as of Q1 2026). Where do you see healthcare ops work going for the LA team in the next 18 months?"</li>
            <li><strong>For a partner.</strong> "What\'s the partner-level decision you faced this year that you couldn\'t have solved with the BA-level toolkit, even with more time?"</li>
            <li><strong>For anyone, end of interview.</strong> "What\'s one thing about this office that doesn\'t show up in the recruiting materials but matters once you\'re here?" (Surfaces real culture signal; recruiters consistently flag this as a strong end-of-round close.)</li>
          </ul>
        </>
      }
    />

    {/* SECTION 6: Firm intel */}
    <PreviewCard
      icon={<Lightbulb size={14} style={{ color: BRAND }} />}
      kicker="SECTION 6 OF 7 · FIRM INTEL · MAY 2026"
      title="McKinsey LA: what is new, what to reference, who is who"
      body={
        <>
          <ul style={{ ...previewPara, paddingLeft: 18, margin: 0 }}>
            <li><strong>Recent practice news.</strong> LA Operations practice is hiring heavily into healthcare clients (Kaiser, City of Hope) as of Q1 2026. Frontline-engagement work and continuous-improvement programs are the active study areas. The Implementation practice is the fastest-growing sub-practice in the office.</li>
            <li><strong>Office culture signal.</strong> LA is known internally as a sports-and-A&Cs office (Lakers and Sparks club season tickets are real, and the office runs an annual studio-tour offsite). If you have sports leadership on your resume, surface it in PEI.</li>
            <li><strong>Recent publication to reference.</strong> "The Operations Practice 2026 industrial productivity report" (Feb 2026). Key takeaway: 60% of the productivity gap between leading and lagging plants comes from frontline behavior, not capital investment. One specific reference makes a strong why-McKinsey hook.</li>
            <li><strong>Recruiter intel.</strong> Class size for LA BA 2026 cohort is reportedly ~30% larger than 2025. Slightly faster decision turnaround (2 to 3 weeks vs 3 to 4). The lead campus recruiter for USC Marshall as of May 2026 is Priya Shah; she runs the diversity-recruiting track and weights non-traditional backgrounds positively.</li>
            <li><strong>Alumni surfaced from your network.</strong> 2 USC Marshall alums currently at McKinsey LA show up on the LA Ops team page: Alex Chen (\'19, EM, healthcare focus) and Jordan Park (\'21, SA, consumer goods). Both are visible on the office\'s landing page; an alumni cold email is a strong pre-interview move.</li>
          </ul>
        </>
      }
    />

    {/* SECTION 7: 48-hour study plan */}
    <PreviewCard
      icon={<CalendarDays size={14} style={{ color: BRAND }} />}
      kicker="SECTION 7 OF 7 · 48-HOUR STUDY PLAN"
      title="If your first round is the day after tomorrow"
      body={
        <>
          <p style={{ ...previewPara, marginBottom: 6 }}>
            <strong>Day -2 (today, ~5 hours)</strong>
          </p>
          <ul style={{ ...previewPara, paddingLeft: 18, marginBottom: 10 }}>
            <li>90 min: read this PDF end to end, mark the 2 PEI stories you\'ll lead with.</li>
            <li>120 min: 2 live case mocks (Pramp or a peer). Record both. Self-review the structuring move.</li>
            <li>60 min: math drills 1 to 8 from Section 4. Time yourself.</li>
            <li>30 min: rewrite your top PEI story tighter on Action. Read aloud, time it.</li>
          </ul>
          <p style={{ ...previewPara, marginBottom: 6 }}>
            <strong>Day -1 (~4 hours)</strong>
          </p>
          <ul style={{ ...previewPara, paddingLeft: 18, marginBottom: 10 }}>
            <li>120 min: 2 more live case mocks, ideally one profitability and one operations. Focus on the 90-sec recommendation close.</li>
            <li>45 min: re-read Section 6 (firm intel). Pick 4 specific questions you\'ll ask.</li>
            <li>30 min: math drills 9 to 18.</li>
            <li>45 min: take a break, walk, sleep early.</li>
          </ul>
          <p style={{ ...previewPara, marginBottom: 6 }}>
            <strong>Day 0 (interview day, ~90 min before the call)</strong>
          </p>
          <ul style={{ ...previewPara, paddingLeft: 18, margin: 0 }}>
            <li>20 min: re-read your 3 PEI stories once, out loud.</li>
            <li>15 min: re-read your top 4 questions to ask, out loud.</li>
            <li>10 min: warm up the math with 3 quick drills.</li>
            <li>45 min: walk, eat something, hydrate. Do not cram.</li>
          </ul>
        </>
      }
    />

    <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 12, textAlign: 'center' }}>
      Example output for a fictional USC Marshall sophomore. Your real PDF is generated live from the McKinsey JD you paste, with sections tailored to the office, round, and your resume.
    </p>
  </div>
);

// Round breakdown row used inside Section 1 of the example panel.
const RoundRow = ({
  name, format, evaluate, noBorder,
}: { name: string; format: string; evaluate: string; noBorder?: boolean }) => (
  <div style={{ paddingBottom: 12, marginBottom: 12, borderBottom: noBorder ? 'none' : '1px solid #F1F5F9' }}>
    <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 2px 0' }}>{name}</p>
    <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 6px 0', fontStyle: 'italic' }}>{format}</p>
    <p style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.55, margin: 0 }}>
      <strong style={{ color: INK }}>What they evaluate.</strong> {evaluate}
    </p>
  </div>
);

const PreviewCard = ({
  icon, kicker: k, title, body,
}: { icon: React.ReactNode; kicker: string; title: string; body: React.ReactNode }) => (
  <div style={{ ...cardShell, marginTop: 14, borderColor: '#DBEAFE' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      {icon}
      <span style={{ fontSize: 11, fontWeight: 700, color: BRAND_DARK, letterSpacing: '0.05em' }}>{k}</span>
    </div>
    <h4 style={{ fontFamily: serif, fontSize: 17, fontWeight: 400, color: INK, margin: '0 0 12px 0', lineHeight: 1.3 }}>
      {title}
    </h4>
    {body}
  </div>
);

const cardShell: React.CSSProperties = {
  background: '#FFF',
  border: '1px solid #E2E8F0',
  borderRadius: 14,
  padding: 18,
  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
  boxSizing: 'border-box',
};

const previewPara: React.CSSProperties = {
  fontSize: 13, lineHeight: 1.6, color: '#334155', margin: '0 0 8px 0',
};

const primaryBtnExample: React.CSSProperties = {
  background: BRAND, color: '#FFF', border: 'none', borderRadius: 8,
  padding: '11px 16px', fontSize: 14, fontWeight: 600, cursor: 'not-allowed',
  opacity: 0.95, display: 'inline-flex', alignItems: 'center', gap: 6,
};

const ghostBtnExample: React.CSSProperties = {
  background: '#FFF', color: INK, border: '1px solid #CBD5E1', borderRadius: 8,
  padding: '11px 16px', fontSize: 14, fontWeight: 500, cursor: 'not-allowed',
  opacity: 0.95, display: 'inline-flex', alignItems: 'center', gap: 6,
};

// ──────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────

const InterviewPrepMckinseyCasePreview = () => {
  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>McKinsey Case Interview Prep (Free, Tailored to Your Round) | Offerloop</title>
        <meta name="robots" content="noindex" />
        <meta
          name="description"
          content="Free McKinsey case interview prep tool. Generates a tailored PDF with case frameworks, PEI question banks, and firm-specific intel in 90 seconds. Tuned to the 2026 first-round format."
        />
        <script type="application/ld+json">{JSON.stringify(JSON_LD)}</script>
      </Helmet>

      <PreviewNav />

      {/* Hero. Tight so Quick-Answer + widget sit close to the H1. */}
      <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid #F1F5F9' }}>
        <div style={gridLayer('rgba(15,23,42,0.045)', 'radial-gradient(ellipse 75% 70% at 50% 0%, #000 30%, transparent 75%)')} />
        <div className="px-6 pt-14 pb-10 text-center" style={{ maxWidth: 880, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <span className="inline-flex items-center gap-1.5 mb-5" style={{ background: '#EFF5FF', border: '1px solid #DBEAFE', color: BRAND_DARK, fontSize: 12.5, fontWeight: 600, padding: '5px 12px', borderRadius: 999 }}>
            <Bot className="w-3.5 h-3.5" /> INTERVIEW PREP · McKINSEY CASE
          </span>
          <h1 style={{ fontFamily: serif, fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.03em', color: INK, marginBottom: 14, fontSize: 'clamp(34px, 4.6vw, 52px)' }}>
            Prep for the <span style={{ color: BRAND }}>McKinsey case</span> in 90 seconds.
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: '#64748B', maxWidth: 680, margin: '0 auto 6px' }}>
            A tailored PDF with case frameworks, PEI question banks, and firm-specific intel, generated from the actual McKinsey posting you paste.
          </p>
          <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>
            {UPDATED_LABEL} <span style={{ marginLeft: 8 }}>·</span> <span style={{ marginLeft: 8 }}>8 min read</span>
          </p>
        </div>

        {/* Quick-Answer block per ranking-playbook.md */}
        <div className="px-6" style={{ maxWidth: 820, margin: '0 auto 36px', position: 'relative', zIndex: 1 }}>
          <div style={{ background: '#F0F7FF', borderLeft: `3px solid ${BRAND}`, borderRadius: 6, padding: '18px 22px' }}>
            <div style={{ ...kicker, marginBottom: 6, color: BRAND_DARK }}>QUICK ANSWER</div>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: INK, margin: 0 }}>
              A McKinsey first round is 2 back-to-back 45 to 60 minute interviews, each split into ~10 minutes of PEI (leadership, drive, personal impact), 30 to 35 minutes of an interviewer-led case (most often profitability, operations, or growth strategy in 2026), and 5 minutes for your questions. To prep efficiently: drill the 3 PEI dimensions with 2 to 3 stories each, run 15 to 25 cases across the current case types, and study the office and practice you applied to. The widget below generates that prep PDF from the JD you paste in 90 seconds.
            </p>
          </div>
        </div>
      </section>

      {/* Widget mount: McKinsey-specific example panel on the left. */}
      <section className="px-6 pt-10 pb-6" style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 18, textAlign: 'center' }}>
          <span style={{ ...kicker, display: 'inline-block' }}>SEE WHAT THE PDF CONTAINS, THEN GENERATE YOUR OWN</span>
        </div>
        <InterviewPrepWidget
          source="seo-preview-interview-prep-mckinsey-case"
          examplePanel={<McKinseyCaseExamplePanel />}
        />
      </section>

      {/* H2 #1 */}
      <section className="px-6 py-14" style={{ maxWidth: 820, margin: '0 auto' }}>
        <h2 style={h2Style}>What does the McKinsey case interview actually test?</h2>
        <p style={pStyle}>
          Three things, in priority order:
        </p>
        <ul style={{ ...pStyle, paddingLeft: 22 }}>
          <li><strong>Structured problem-solving.</strong> Can you take a vague client problem ("margin is down") and decompose it into a tree of testable drivers without missing major branches. Interviewers grade whether your structure is MECE-ish (mutually exclusive, collectively exhaustive) and whether your initial decomposition hits the right level of abstraction.</li>
          <li><strong>Quantitative comfort.</strong> Can you do back-of-envelope math live (multiply 12 x 47, compute a CAGR, size a market) without losing the thread of the case. McKinsey interviewers are watching whether you ask for clarifications before computing, and whether you sanity-check the magnitude of your answer.</li>
          <li><strong>Synthesis and recommendation.</strong> At the end of the case (usually the last 5 to 7 minutes), you should be able to give a clear top-down recommendation, name the 2 to 3 supporting reasons, and flag the biggest risk. "What would you tell the CEO?" is graded as much on the structure as on the actual answer.</li>
        </ul>
      </section>

      {/* H2 #2: what's in the PDF */}
      <section className="px-6 py-14" style={{ maxWidth: 820, margin: '0 auto', background: '#FAFBFF', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9' }}>
        <h2 style={h2Style}>What does the widget put in the prep PDF?</h2>
        <p style={pStyle}>
          A typical 12 to 18 page PDF tailored to the McKinsey JD you paste. The seven
          sections, in order:
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 18 }}>
          {[
            { t: 'Round-by-round breakdown', d: 'How many interviews, format split, time per section. Different for first vs final.' },
            { t: '4 to 6 case frameworks', d: 'Tailored to the current McKinsey case mix (profitability, operations, growth strategy). Each with a prompt, structure, and pitfalls.' },
            { t: '9 PEI stories (3 per dimension)', d: 'Leadership / drive / personal impact, drafted from your actual resume in STAR with the heaviest weight on the Action.' },
            { t: 'Firm and office intel', d: 'Recent practice news, office culture signals, recent publications to reference, recruiter intel for the cycle.' },
            { t: '20 to 30 questions to ask', d: 'Tailored to the office and practice you applied to. Not generic "what is your favorite project".' },
            { t: 'Math drill bank', d: '15 to 20 quick math problems calibrated to current case math difficulty.' },
            { t: '48-hour study schedule', d: 'A specific day-by-day plan for the 48 hours before the interview, if that is the timeline you have.' },
          ].map((b) => (
            <div key={b.t} className="rounded-[4px]" style={{ background: '#fff', border: '1px solid #E2E8F0', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <BadgeCheck className="w-4 h-4" style={{ color: BRAND }} />
                <p style={{ fontSize: 14, fontWeight: 700, color: INK, margin: 0 }}>{b.t}</p>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.55, color: '#64748B', margin: 0 }}>{b.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* H2 #3 */}
      <section className="px-6 py-14" style={{ maxWidth: 820, margin: '0 auto' }}>
        <h2 style={h2Style}>How is McKinsey case prep different from Bain and BCG?</h2>
        <p style={pStyle}>
          All three firms run a case + behavioral round. The differences that matter:
        </p>
        <ul style={{ ...pStyle, paddingLeft: 22 }}>
          <li><strong>McKinsey:</strong> Interviewer-led case. The interviewer steers you through structured prompts and asks follow-ups. PEI is explicit and structured (3 named dimensions). Math tends to be cleaner / less hairy than Bain.</li>
          <li><strong>Bain:</strong> Candidate-led case. You drive the structure and decide what to dig into. Behavioral is looser. Math tends toward heavier number-crunching (revenue / cost / growth sizing).</li>
          <li><strong>BCG:</strong> Mix of interviewer- and candidate-led. Cases trend more strategy-flavored (where to play, how to win). Behavioral leans on intellectual-curiosity signals.</li>
        </ul>
        <p style={pStyle}>
          Run the widget separately for each firm. The case bank and the behavioral framing
          shift meaningfully.
        </p>
      </section>

      <HowItWorks
        heading="How the prep generator works"
        steps={[
          { Icon: ClipboardPaste, t: 'Paste the McKinsey posting', d: 'JD text or URL. Include the office and round if you have it (e.g. "LA, BA, first round").' },
          { Icon: TrendingUp, t: 'The widget runs live research', d: 'Pulls case patterns from Glassdoor and Reddit, scrapes the JD for office-specific signals, aggregates current cycle PEI questions. 60 to 90 seconds.' },
          { Icon: FileText, t: 'Download the prep PDF', d: '12 to 18 pages, tailored to the role and round. Print-ready and structured for offline study.' },
          { Icon: Target, t: 'Drill against the case and PEI banks', d: 'Use the case bank with a peer or with ChatGPT for structuring reps; use the PEI stories for live mocks.' },
        ]}
      />

      <InlineEmailCapture {...emailCapture} />

      <FAQ items={FAQ_ITEMS} />

      <PreviewCTA
        eyebrow="WHEN YOU ARE READY FOR THE FULL TOOLKIT"
        headline="Prep generated, then reach a McKinsey alum the same session"
        subhead="Once your prep PDF is downloaded, Offerloop helps you find a USC, NYU, Michigan, or UPenn alum at McKinsey, drafts the cold email, and tracks the reply, all in the same workflow."
        buttonText="Create your free Offerloop account"
        to="/signin?mode=signup"
        footnote="Free tier: 3 contacts per search, 2 interview preps, no credit card."
      />

      <ExitIntentCapture
        eyebrow="BEFORE YOU GO"
        heading="The weekly consulting drop"
        subtext="Every Monday: new case types appearing in McKinsey, Bain, and BCG rounds, fresh PEI question drops, and firm-specific intel. Free, no spam."
        buttonText="Send me the drop"
        cluster="consulting"
      />

      <PreviewFooter />
    </div>
  );
};

export default InterviewPrepMckinseyCasePreview;
