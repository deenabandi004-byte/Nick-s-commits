/*
 * SEO PREVIEW: interview prep (PREP-interview). Route: /seo-preview/interview-prep-goldman-superday
 * Showcase mirrors interview-prep output (interview_prep/): process stages, question bank
 * by type, real interview experience, fit score with strengths/gaps. No em dashes.
 */
import { Helmet } from 'react-helmet-async';
import { ClipboardCheck, Target, FileText, CornerDownRight, Quote } from 'lucide-react';
import {
  BRAND, BRAND_DARK, INK, kicker, PreviewNav, PreviewFooter, PreviewHero,
  ProblemSection, StatStrip, ShowcaseSection, HowItWorks, FAQ, PreviewCTA, InlineEmailCapture, ExitIntentCapture,
} from './_shared';

const ROUNDS = [
  { r: 'Round 1', type: 'Technical', who: 'Analyst' },
  { r: 'Round 2', type: 'Behavioral', who: 'Associate' },
  { r: 'Round 3', type: 'Fit + deal talk', who: 'VP' },
  { r: 'Round 4', type: 'Why Goldman', who: 'MD', now: true },
];

const QUESTIONS = [
  { tag: 'TECHNICAL', q: 'A company raises depreciation by $10. Walk me through all three statements.', hook: 'IBD analyst level, a top-frequency Goldman technical' },
  { tag: 'TECHNICAL', q: 'Walk me through a DCF, then tell me which assumption you would pressure-test first.', hook: 'the IBD generalist question bank' },
  { tag: 'FIT', q: 'Why Goldman, and why this group specifically?', hook: 'the #1 superday rejection cause, a generic answer' },
  { tag: 'FIT', q: 'Tell me about a deal or company you have followed and what you would have done differently.', hook: 'commercial-awareness signal Goldman screens for' },
];

const emailCapture = {
  eyebrow: 'NOT RECRUITING YET?',
  heading: 'Get the weekly banking recruiting digest',
  subtext: 'New cold email angles, interview question drops, and deadline changes, every week. Built for students breaking into investment banking.',
  buttonText: 'Send me the digest',
  cluster: 'banking',
};

const InterviewPrepPreview = () => {
  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>Goldman Sachs Superday: Questions &amp; How to Prep</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <PreviewNav />

      <PreviewHero
        EyebrowIcon={ClipboardCheck}
        eyebrow="INTERVIEW PREP · GOLDMAN SACHS"
        line1={<>Walk into your <span style={{ color: BRAND }}>Goldman Sachs</span> superday ready</>}
        line2="for every question they'll actually ask"
        lead="Offerloop builds a prep doc for your exact superday: the round-by-round format, the technical and fit questions to drill, real accounts from people who interviewed, and a fit score against your resume."
        chips={['Real superday questions', 'Round-by-round format', 'Scored against your resume']}
      />

      <ProblemSection heading="A superday is four interviews. Generic prep covers one.">
        By the time you have a Goldman superday booked, you do not have time to read ten interview
        guides. You need the round-by-round format, the right technical questions for your group, a
        tight "Why Goldman" answer, and the stamina to be as sharp in interview four as in interview
        one. Generic prep spreads you thin across the wrong things.
      </ProblemSection>

      <StatStrip
        heading="THE GOLDMAN SUPERDAY, BY THE NUMBERS"
        stats={[
          { value: '4-6', label: 'interviews in a Goldman superday, back to back' },
          { value: '30 min', label: 'per interview, escalating from analyst to MD' },
          { value: 'Same day', label: 'Goldman often extends the offer within hours' },
        ]}
      />

      <ShowcaseSection
        heading="The superday prep doc Offerloop builds you"
        intro="A real example: an Investment Banking Analyst superday at Goldman Sachs, scored against the candidate's resume."
        caption="Sample output. Your real prep doc is built from the firm, group, and role you enter, plus your own resume."
      >
        <div className="rounded-[6px]" style={{ border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 30px 70px -28px rgba(15,23,42,0.32)', background: '#fff' }}>
          <div style={{ height: '4px', background: `linear-gradient(90deg, ${BRAND}, #60A5FA)` }} />

          {/* header */}
          <div className="flex items-center gap-3 px-6 py-4" style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
            <ClipboardCheck className="w-5 h-5" style={{ color: BRAND }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '14px', fontWeight: 700, color: INK }}>Goldman Sachs Superday Prep</p>
              <p style={{ fontSize: '12px', color: '#64748B' }}>Investment Banking Analyst · IBD</p>
            </div>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', textAlign: 'right', lineHeight: 1.5 }}>PREP DOC<br />by Offerloop</span>
          </div>

          <div className="px-6 py-6">
            {/* FIT SCORE */}
            <p style={{ ...kicker, marginBottom: '10px' }}>YOUR FIT SCORE</p>
            <div className="flex gap-4 items-center rounded-[4px] p-4" style={{ background: 'linear-gradient(135deg, #EFF5FF, #F8FAFF)', border: '1px solid #BFDBFE', marginBottom: '26px' }}>
              <div className="flex-shrink-0 text-center">
                <p style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: '40px', fontWeight: 400, color: BRAND_DARK, lineHeight: 1 }}>78</p>
                <p style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.04em' }}>OUT OF 100</p>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '12.5px', color: '#334155', marginBottom: '6px' }}><strong style={{ color: '#15803D' }}>Strengths:</strong> prior PE summer internship, modeling coursework, finance club deal team.</p>
                <p style={{ fontSize: '12.5px', color: '#334155' }}><strong style={{ color: '#9A3412' }}>Gap to close:</strong> your "Why Goldman TMT" answer is generic. Drill a group-specific reason before the superday.</p>
              </div>
            </div>

            {/* FORMAT */}
            <p style={{ ...kicker, marginBottom: '12px' }}>THE SUPERDAY FORMAT · 4 BACK-TO-BACK, 30 MIN EACH</p>
            <div className="flex items-stretch flex-wrap" style={{ marginBottom: '26px' }}>
              {ROUNDS.map((s, i) => (
                <div key={i} className="flex items-center">
                  <div style={{ padding: '8px 12px', borderRadius: '4px', background: s.now ? '#EFF5FF' : '#F8FAFC', border: `1px solid ${s.now ? '#BFDBFE' : '#E2E8F0'}`, textAlign: 'center', minWidth: '104px' }}>
                    <p style={{ fontSize: '12.5px', fontWeight: 700, color: s.now ? BRAND_DARK : INK }}>{s.type}</p>
                    <p style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '1px' }}>{s.r} · {s.who}</p>
                  </div>
                  {i < ROUNDS.length - 1 && <div style={{ width: '14px', height: '2px', background: '#CBD5E1' }} />}
                </div>
              ))}
            </div>

            {/* QUESTIONS */}
            <p style={{ ...kicker, marginBottom: '12px' }}>QUESTIONS TO DRILL</p>
            <div className="space-y-2.5" style={{ marginBottom: '26px' }}>
              {QUESTIONS.map((item, i) => (
                <div key={i} className="rounded-[4px]" style={{ border: '1px solid #E8EDF3', borderLeft: `3px solid ${item.tag === 'TECHNICAL' ? '#3B82F6' : '#9333EA'}`, padding: '11px 14px' }}>
                  <p style={{ fontSize: '10.5px', fontWeight: 700, color: item.tag === 'TECHNICAL' ? BRAND : '#9333EA', letterSpacing: '0.05em', marginBottom: '4px' }}>{item.tag}</p>
                  <p style={{ fontSize: '13.5px', lineHeight: 1.6, color: '#1E293B', marginBottom: '5px' }}>"{item.q}"</p>
                  <p className="flex items-center gap-1.5" style={{ fontSize: '11.5px', color: '#94A3B8', fontStyle: 'italic' }}>
                    <CornerDownRight className="w-3 h-3" /> generated from {item.hook}
                  </p>
                </div>
              ))}
            </div>

            {/* REAL EXPERIENCE */}
            <p style={{ ...kicker, marginBottom: '8px' }}>FROM A REAL GOLDMAN SUPERDAY</p>
            <div className="flex gap-3 rounded-[4px] p-4" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <Quote className="flex-shrink-0 w-4 h-4" style={{ color: '#CBD5E1', marginTop: '2px' }} />
              <div>
                <p style={{ fontSize: '13px', lineHeight: 1.65, color: '#334155' }}>
                  "Four interviews back to back. Two were almost entirely technical, one was the VP just talking through a live deal, and the MD only wanted to know why Goldman. The offer call came the same afternoon."
                </p>
                <p style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '6px' }}>IBD Analyst candidate · 2025 · Offer</p>
              </div>
            </div>
          </div>
        </div>
      </ShowcaseSection>

      <HowItWorks
        heading="How it works"
        steps={[
          { Icon: Target, t: 'Enter your superday', d: 'Tell Offerloop the firm, group, and role. Add your resume so it can score your fit and find your gaps.' },
          { Icon: FileText, t: 'Offerloop builds the prep doc', d: 'It assembles the round format, a question bank from real interview accounts, a fit score, and a day-by-day plan.' },
          { Icon: ClipboardCheck, t: 'Drill and walk in ready', d: 'Practice the technicals out loud, lock your "Why Goldman" answer, and review the doc on your phone before the call.' },
        ]}
      />

      <FAQ items={[
        { q: 'How many rounds is a Goldman Sachs superday?', a: 'Usually four to six interviews back to back, 30 minutes each, escalating in seniority. Early rounds lean technical and behavioral, later rounds lean fit and "Why Goldman."' },
        { q: 'What technical questions does Goldman Sachs ask in IBD interviews?', a: 'Core fundamentals: walk me through a DCF, how the three statements connect, accretion and dilution, and a basic merger model. Coverage groups go deeper than the generalist pool.' },
        { q: 'How do I answer "Why Goldman Sachs?"', a: "Be specific to the group, not the brand. \"I want TMT because of [a specific reason tied to the work]\" beats \"Goldman is the best.\" A generic answer here is the single most common rejection cause." },
        { q: 'Does Goldman Sachs give same-day offers after a superday?', a: 'Often, yes. Goldman can extend offers within hours of a superday, so your decision and your other recruiting timelines should be ready before you walk in.' },
        { q: 'How do I prepare for back-to-back interviews without fading?', a: 'Treat interview four like interview one. Practice your story out loud enough times that it survives fatigue, eat beforehand, and reset between rounds. Stamina is part of what they test.' },
        { q: 'What is the difference between a HireVue and a superday at Goldman?', a: 'The HireVue is a recorded, one-way video screen earlier in the process. The superday is the live final round. HireVue prep is about clear, concise recorded answers; superday prep is about technicals and fit under real pressure.' },
      ]} />

      <InlineEmailCapture {...emailCapture} />

      <PreviewCTA
        eyebrow="YOUR SUPERDAY IS BOOKED"
        headline="Build your Goldman superday prep doc"
        subhead="Round format, real questions, a fit score against your resume, and a day-by-day plan. Free."
        buttonText="Build your Goldman superday prep"
        to="/interview-prep?company=Goldman%20Sachs"
        footnote="One click opens Offerloop with Goldman Sachs already loaded. No credit card."
      />

      <PreviewFooter />
      <ExitIntentCapture {...emailCapture} />
    </div>
  );
};

export default InterviewPrepPreview;
