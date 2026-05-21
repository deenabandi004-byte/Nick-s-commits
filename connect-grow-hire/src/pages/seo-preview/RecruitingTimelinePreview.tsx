/*
 * SEO PREVIEW: recruiting timeline tracker (TRACK). Route: /seo-preview/ib-recruiting-timeline
 * Showcase is a live deadline tracker: per-firm status, deadline, and a find-alumni link.
 * House style: no em dashes.
 */
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { CalendarClock, Search, Bell, ArrowRight } from 'lucide-react';
import {
  BRAND, BRAND_DARK, INK, kicker, PreviewNav, PreviewFooter, PreviewHero,
  ProblemSection, StatStrip, ShowcaseSection, HowItWorks, FAQ, PreviewCTA, InlineEmailCapture, ExitIntentCapture,
} from './_shared';

const STATUS: Record<string, { bg: string; fg: string }> = {
  Open: { bg: '#DCFCE7', fg: '#15803D' },
  'Closing soon': { bg: '#FEF3C7', fg: '#B45309' },
  Closed: { bg: '#F1F5F9', fg: '#94A3B8' },
  'Not open yet': { bg: '#EFF5FF', fg: '#2563EB' },
};
const FIRMS = [
  { name: 'Goldman Sachs', status: 'Closing soon', deadline: 'Closes May 30', q: 'Goldman%20Sachs' },
  { name: 'JPMorgan', status: 'Open', deadline: 'Closes Jun 8', q: 'JPMorgan' },
  { name: 'Morgan Stanley', status: 'Open', deadline: 'Closes Jun 15', q: 'Morgan%20Stanley' },
  { name: 'Moelis & Company', status: 'Open', deadline: 'Closes Jun 20', q: 'Moelis' },
  { name: 'Evercore', status: 'Closed', deadline: 'Closed Apr 12', q: 'Evercore' },
  { name: 'Centerview Partners', status: 'Not open yet', deadline: 'Opens early July', q: 'Centerview' },
];

const emailCapture = {
  eyebrow: 'STAY AHEAD OF THE DEADLINES',
  heading: 'Get 2028 deadline alerts by email',
  subtext: 'We email you the moment a target firm opens applications or a deadline moves. No more digging through career pages.',
  buttonText: 'Email me deadline alerts',
  cluster: 'banking',
};

const RecruitingTimelinePreview = () => {
  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>2028 Investment Banking Recruiting Timeline (Live)</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <PreviewNav />

      <PreviewHero
        EyebrowIcon={CalendarClock}
        eyebrow="RECRUITING TRACKER · 2028 CYCLE"
        line1={<>Track every <span style={{ color: BRAND }}>2028 IB recruiting</span> deadline</>}
        line2="and never find out too late that you missed one"
        lead="Summer 2027 analyst applications are opening now. Offerloop tracks every bank's status live: what is open, what closes this week, and which alumni to contact at each firm before the deadline."
        chips={['Live deadline status', 'Every bulge bracket and boutique', 'Find alumni per firm']}
      />

      <ProblemSection heading="A static timeline goes stale the day it's published">
        Most recruiting timelines are blog posts written once and frozen. By the time you read one,
        deadlines have moved and firms have opened. Worse, a date on a page cannot be acted on. Knowing
        Goldman closes May 30 does not help if you have not networked into Goldman. You need live status
        and the contacts, in one place.
      </ProblemSection>

      <StatStrip
        heading="2028 IB RECRUITING, BY THE NUMBERS"
        stats={[
          { value: '134 / 178', label: 'firms that have posted summer 2027 applications so far' },
          { value: 'Aug 2026', label: 'when the first 2028-cycle applications opened' },
          { value: 'Weekly', label: 'how often Offerloop refreshes every deadline' },
        ]}
      />

      <ShowcaseSection
        heading="The 2028 recruiting tracker"
        intro="A live view of summer 2027 analyst recruiting: which banks are open, what closes this week, and who to contact at each."
        caption="Sample view. The live tracker updates weekly from firm career pages and Offerloop user submissions."
      >
        <div className="rounded-[6px]" style={{ border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 30px 70px -28px rgba(15,23,42,0.32)', background: '#fff' }}>
          <div style={{ height: '4px', background: `linear-gradient(90deg, ${BRAND}, #60A5FA)` }} />

          {/* header with live count */}
          <div className="px-6 py-4" style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
            <div className="flex items-center gap-2" style={{ marginBottom: '8px' }}>
              <CalendarClock className="w-4 h-4" style={{ color: BRAND }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: INK }}>2028 IB Recruiting Tracker</span>
              <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 600, color: '#15803D' }}>● Updated weekly</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div style={{ flex: 1, height: '7px', borderRadius: '999px', background: '#E2E8F0' }}>
                <div style={{ height: '7px', borderRadius: '999px', width: '75%', background: `linear-gradient(90deg, ${BRAND}, #60A5FA)` }} />
              </div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: BRAND_DARK }}>134 of 178 firms posted</span>
            </div>
          </div>

          {/* firm rows */}
          {FIRMS.map((f, i) => {
            const s = STATUS[f.status];
            return (
              <div key={i} className="flex items-center gap-3 px-6 py-3.5" style={{ borderBottom: i < FIRMS.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: INK }}>{f.name}</p>
                  <p style={{ fontSize: '12px', color: '#64748B' }}>{f.deadline}</p>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: s.fg, background: s.bg, borderRadius: '999px', padding: '3px 11px' }}>{f.status}</span>
                <Link to={`/find?company=${f.q}`} className="inline-flex items-center gap-1" style={{ fontSize: '12px', fontWeight: 600, color: BRAND_DARK }}>
                  Find alumni <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            );
          })}

          <div className="px-6 py-3" style={{ background: '#FAFBFF', borderTop: '1px solid #F1F5F9' }}>
            <p style={{ ...kicker, color: '#94A3B8' }}>+ 128 MORE FIRMS, BULGE BRACKET THROUGH BOUTIQUE</p>
          </div>
        </div>
      </ShowcaseSection>

      <HowItWorks
        heading="How it works"
        steps={[
          { Icon: CalendarClock, t: 'See what is open', d: "Offerloop tracks every bank's application status live and flags what closes this week." },
          { Icon: Search, t: 'Find alumni at open firms', d: 'Every firm row links straight to alumni at that bank, so networking starts the moment applications open.' },
          { Icon: Bell, t: 'Get deadline alerts', d: 'Track the firms you care about and Offerloop tells you when a status or date changes.' },
        ]}
      />

      <FAQ items={[
        { q: 'When does 2028 investment banking recruiting start?', a: "Summer 2027 analyst applications, the 2028 cohort's internship cycle, begin opening in mid-2026 and run through the fall. The bulge brackets move first." },
        { q: 'Which banks have opened summer 2027 applications?', a: 'It changes weekly. The live tracker shows the current count and per-firm status. As of the latest update, well over a hundred firms have posted.' },
        { q: 'Is it too late to apply for investment banking internships?', a: "Check the tracker. If a firm shows \"closing soon\" or \"closed,\" that one has moved, but boutiques open later and roll into the fall. There is almost always a firm still open." },
        { q: 'When does Goldman Sachs open summer analyst applications?', a: 'Goldman is an early mover and typically opens in the first wave. The tracker shows Goldman\'s exact current status and deadline.' },
        { q: 'What is the difference between bulge bracket and boutique recruiting timelines?', a: 'Bulge brackets open earliest and close fast, often months before the deadlines you would expect. Elite boutiques and middle-market banks open later and recruit further into the fall. The tracker covers both.' },
        { q: 'How early should I start networking before applications open?', a: 'Months before. By the time an application opens, the students getting referred have already had their meetings. Use the tracker to find alumni at a firm the moment it appears, not when it closes.' },
      ]} />

      <InlineEmailCapture {...emailCapture} />

      <PreviewCTA
        eyebrow="DEADLINES ARE MOVING NOW"
        headline="Track 2028 IB recruiting in one place"
        subhead="See what is open, what closes this week, and which alumni to contact at every firm. Free."
        buttonText="Start tracking your target firms"
        to="/find"
        footnote="One click opens Offerloop. Track deadlines and find alumni in the same place. No credit card."
      />

      <PreviewFooter />
      <ExitIntentCapture {...emailCapture} />
    </div>
  );
};

export default RecruitingTimelinePreview;
