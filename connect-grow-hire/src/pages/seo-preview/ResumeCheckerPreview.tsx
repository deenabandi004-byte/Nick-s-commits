/*
 * SEO PREVIEW: resume ATS checker (RESUME). Route: /seo-preview/resume-checker
 * Showcase mirrors ats_scorer.py output: overall score, keyword / formatting / relevance
 * sub-scores, matched + missing keywords, formatting checks, ranked fixes. No em dashes.
 */
import { Helmet } from 'react-helmet-async';
import { ScanLine, Upload, FileCheck, Check, X, CornerDownRight } from 'lucide-react';
import {
  BRAND, INK, kicker, PreviewNav, PreviewFooter, PreviewHero,
  ProblemSection, StatStrip, ShowcaseSection, HowItWorks, FAQ, PreviewCTA, InlineEmailCapture, ExitIntentCapture,
} from './_shared';

const SUBSCORES = [
  { label: 'Keyword match', score: 58, color: '#D97706' },
  { label: 'ATS formatting', score: 71, color: '#3B82F6' },
  { label: 'IB relevance', score: 62, color: '#D97706' },
];
const MATCHED = ['financial modeling', 'DCF', 'valuation', 'Excel', 'leadership'];
const MISSING = ['LBO', 'comparable company analysis', 'accretion / dilution', 'Bloomberg', 'deal experience'];
const CHECKS = [
  { label: 'Contact email present', ok: true },
  { label: 'Phone number present', ok: false },
  { label: 'Experience section', ok: true },
  { label: 'Education section', ok: true },
  { label: 'Skills section', ok: true },
  { label: 'One page', ok: true },
  { label: 'ATS-readable layout', ok: false },
  { label: 'Consistent dates', ok: true },
];
const FIXES = [
  'Add LBO and comparable company analysis to your skills and bullets. Banks screen for both and yours has neither.',
  'Drop the two-column layout. The ATS parser reads top to bottom and silently discards your right column.',
  'Quantify vague bullets. "Built a valuation model" becomes "Built a 3-statement DCF valuing a $400M target."',
  'Add a phone number to your header.',
];

const emailCapture = {
  eyebrow: 'NOT RECRUITING YET?',
  heading: 'Get the weekly banking recruiting digest',
  subtext: 'New cold email angles, interview question drops, and deadline changes, every week. Built for students breaking into investment banking.',
  buttonText: 'Send me the digest',
  cluster: 'banking',
};

const ResumeCheckerPreview = () => {
  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>Free Investment Banking Resume Checker (ATS Scan)</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <PreviewNav />

      <PreviewHero
        EyebrowIcon={ScanLine}
        eyebrow="RESUME CHECKER · INVESTMENT BANKING"
        line1={<>Find out why banks <span style={{ color: BRAND }}>auto-reject</span> your resume</>}
        line2="before you send another application"
        lead="Offerloop scans your resume against what investment banking recruiters and their ATS actually screen for. You get a score, the exact keywords you are missing, the formatting that breaks the parser, and a ranked fix list."
        chips={['Instant ATS score', 'IB-specific keyword check', 'Ranked fix list']}
      />

      <ProblemSection heading="The IB resume screen is brutal and invisible">
        A recruiter spends six seconds on your resume. The ATS spends none, it just parses. You do not
        get feedback, you get a rejection, and you never learn whether it was the format, the missing
        keywords, or the bullets. So you keep sending the same resume into the same wall.
      </ProblemSection>

      <StatStrip
        heading="THE IB RESUME SCREEN, BY THE NUMBERS"
        stats={[
          { value: '6 sec', label: 'a recruiter spends on your resume before deciding' },
          { value: '1 page', label: 'the non-negotiable investment banking standard' },
          { value: '8 checks', label: 'ATS formatting checks Offerloop runs on every scan' },
        ]}
      />

      <ShowcaseSection
        heading="Your resume, scanned against the IB standard"
        intro="A real example: an investment banking analyst resume scored by Offerloop, with every gap traced to the job it was checked against."
        caption="Sample scan. Your real score is generated from your uploaded resume against the investment banking analyst standard."
      >
        <div className="rounded-[6px]" style={{ border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 30px 70px -28px rgba(15,23,42,0.32)', background: '#fff' }}>
          <div style={{ height: '4px', background: `linear-gradient(90deg, ${BRAND}, #60A5FA)` }} />

          {/* header */}
          <div className="flex items-center gap-3 px-6 py-4" style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
            <ScanLine className="w-5 h-5" style={{ color: BRAND }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '14px', fontWeight: 700, color: INK }}>Resume Scan</p>
              <p style={{ fontSize: '12px', color: '#64748B' }}>Checked against: Investment Banking Analyst</p>
            </div>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', textAlign: 'right', lineHeight: 1.5 }}>SCAN<br />by Offerloop</span>
          </div>

          <div className="px-6 py-6">
            {/* OVERALL + SUBSCORES */}
            <div className="flex gap-5 items-center" style={{ marginBottom: '26px' }}>
              <div className="flex-shrink-0 text-center rounded-[6px]" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', padding: '14px 18px' }}>
                <p style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: '46px', fontWeight: 400, color: '#D97706', lineHeight: 1 }}>64</p>
                <p style={{ fontSize: '10px', fontWeight: 700, color: '#B45309', letterSpacing: '0.04em', marginTop: '2px' }}>NEEDS WORK</p>
              </div>
              <div style={{ flex: 1 }}>
                {SUBSCORES.map((s, i) => (
                  <div key={i} style={{ marginBottom: i < 2 ? '10px' : 0 }}>
                    <div className="flex justify-between" style={{ fontSize: '12px', marginBottom: '3px' }}>
                      <span style={{ color: '#475569', fontWeight: 600 }}>{s.label}</span>
                      <span style={{ color: s.color, fontWeight: 700 }}>{s.score}</span>
                    </div>
                    <div style={{ height: '6px', borderRadius: '999px', background: '#F1F5F9' }}>
                      <div style={{ height: '6px', borderRadius: '999px', width: `${s.score}%`, background: s.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* KEYWORDS */}
            <p style={{ ...kicker, marginBottom: '8px' }}>KEYWORD MATCH</p>
            <div style={{ marginBottom: '6px' }}>
              {MATCHED.map((k) => (
                <span key={k} className="inline-flex items-center gap-1" style={{ fontSize: '12px', fontWeight: 600, color: '#15803D', background: '#DCFCE7', borderRadius: '3px', padding: '3px 9px', marginRight: '6px', marginBottom: '6px' }}>
                  <Check className="w-3 h-3" /> {k}
                </span>
              ))}
            </div>
            <div>
              {MISSING.map((k) => (
                <span key={k} className="inline-flex items-center gap-1" style={{ fontSize: '12px', fontWeight: 600, color: '#B91C1C', background: '#FEE2E2', borderRadius: '3px', padding: '3px 9px', marginRight: '6px', marginBottom: '6px' }}>
                  <X className="w-3 h-3" /> {k}
                </span>
              ))}
            </div>
            <p className="flex items-center gap-1.5" style={{ fontSize: '11.5px', color: '#94A3B8', fontStyle: 'italic', marginTop: '4px', marginBottom: '26px' }}>
              <CornerDownRight className="w-3 h-3" /> missing keywords pulled from the investment banking analyst job description
            </p>

            {/* FORMATTING CHECKS */}
            <p style={{ ...kicker, marginBottom: '10px' }}>ATS FORMATTING CHECKS</p>
            <div className="grid grid-cols-2 gap-x-5 gap-y-2" style={{ marginBottom: '26px' }}>
              {CHECKS.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  {c.ok
                    ? <Check className="w-4 h-4 flex-shrink-0" style={{ color: '#16A34A' }} />
                    : <X className="w-4 h-4 flex-shrink-0" style={{ color: '#DC2626' }} />}
                  <span style={{ fontSize: '13px', color: c.ok ? '#475569' : '#B91C1C' }}>{c.label}</span>
                </div>
              ))}
            </div>

            {/* TOP FIXES */}
            <p style={{ ...kicker, marginBottom: '10px' }}>TOP FIXES, RANKED BY IMPACT</p>
            <div className="space-y-2">
              {FIXES.map((f, i) => (
                <div key={i} className="flex gap-2.5 rounded-[4px]" style={{ border: '1px solid #E8EDF3', borderLeft: `3px solid ${BRAND}`, padding: '10px 13px' }}>
                  <span style={{ color: BRAND, fontWeight: 700, fontSize: '13px' }}>{i + 1}</span>
                  <span style={{ fontSize: '13px', lineHeight: 1.6, color: '#334155' }}>{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ShowcaseSection>

      <HowItWorks
        heading="How it works"
        steps={[
          { Icon: Upload, t: 'Upload your resume', d: 'Drop in your PDF or DOCX. Offerloop parses it the same way a bank\'s ATS does.' },
          { Icon: ScanLine, t: 'Offerloop scores it', d: 'It checks keyword match against the IB analyst standard, ATS formatting, and IB relevance, then ranks what to fix.' },
          { Icon: FileCheck, t: 'Fix it and rescan', d: "Offerloop's resume workshop rewrites weak bullets and rebuilds the format, then rescores it." },
        ]}
      />

      <FAQ items={[
        { q: 'Does my investment banking resume pass ATS?', a: 'Upload it to Offerloop and you will know in seconds. Most student resumes fail on a two-column layout the parser cannot read, or on missing keywords like LBO and comparable company analysis.' },
        { q: 'Should an investment banking resume be one page?', a: 'Yes. One page, no exceptions, for any student or analyst-level candidate. Offerloop flags it if yours runs over.' },
        { q: 'What keywords should be on an investment banking resume?', a: 'Match the job description: financial modeling, DCF, LBO, comparable company analysis, valuation, accretion and dilution, plus the tools (Excel, Bloomberg, Capital IQ). Offerloop shows you which ones you are missing.' },
        { q: 'Why is my resume getting auto-rejected by banks?', a: 'Usually one of three things: an ATS-unreadable layout, missing the keywords the job description screens for, or unquantified bullets that say nothing. The scan tells you which.' },
        { q: 'What ATS do investment banks use?', a: 'Most large banks run Workday or a similar enterprise ATS. They parse text, not graphics. Anything in a text box, table, or second column is at risk of being dropped.' },
        { q: 'How do I quantify deal experience with no real deals?', a: 'Use what you have. Club deal teams, stock pitches, modeling coursework, and case competitions all quantify. "Built a 3-statement DCF valuing a $400M target" is real and specific. Offerloop suggests this rewrite for vague bullets.' },
      ]} />

      <InlineEmailCapture {...emailCapture} />

      <PreviewCTA
        eyebrow="BEFORE YOU SEND ANOTHER APPLICATION"
        headline="Scan your investment banking resume free"
        subhead="Get your ATS score, the keywords you are missing, and a ranked fix list in seconds."
        buttonText="Scan my resume now"
        to="/write/resume"
        footnote="One click opens the Offerloop resume workshop. No credit card."
      />

      <PreviewFooter />
      <ExitIntentCapture {...emailCapture} />
    </div>
  );
};

export default ResumeCheckerPreview;
