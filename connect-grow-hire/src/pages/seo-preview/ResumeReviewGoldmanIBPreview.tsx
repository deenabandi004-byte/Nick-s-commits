/*
 * SEO PREVIEW: resume review (RESUME), widget-embedded variant.
 * Route: /seo-preview/resume-review-goldman-ib
 *
 * First mock of the new widget-embedded SEO format. The left of the widget
 * shows a styled example of a scored Goldman IB resume (exaggerated quality
 * so the visitor sees what good output looks like). The right is the live
 * try-it form. Once the visitor submits, the widget takes the full width and
 * runs against their actual PDF + JD.
 *
 * The widget's email gate is the primary conversion. The inline + exit
 * email captures and the bottom CTA are second-chance layers for the
 * visitor who bounces before completing the widget.
 *
 * House style: no em dashes, no sparkle icons. See seo-examples/SEO_STRATEGY.md.
 */
import { Helmet } from 'react-helmet-async';
import {
  FileText, Upload, Target, BadgeCheck, Lightbulb, Download,
  AlertTriangle, Check, TrendingUp,
} from 'lucide-react';
import {
  BRAND, BRAND_DARK, INK, kicker, serif,
  PreviewNav, PreviewFooter, PreviewHero,
  ProblemSection, StatStrip, HowItWorks, FAQ, PreviewCTA,
  InlineEmailCapture, ExitIntentCapture, h2Style, pStyle,
} from './_shared';
import { ResumeReviewWidget } from '../../components/widgets/ResumeReviewWidget';

const emailCapture = {
  eyebrow: 'NOT APPLYING YET?',
  heading: 'Get the weekly banking resume digest',
  subtext: 'New ATS keyword drops for each IB analyst JD, deadline changes, and the specific resume mistakes that get cut in the first pass. Built for students breaking into investment banking.',
  buttonText: 'Send me the digest',
  cluster: 'banking',
};

// ──────────────────────────────────────────────────────────────────────────
// Example panel: a styled mock of the scored output for a fictional USC
// Marshall student's Goldman IB resume. Mirrors the structure of the real
// widget's ResultsLayout (score header + recommendation cards) so the
// visitor sees what their own output will look like. Quality of the
// rewrites is exaggerated to demonstrate the upper bound of what the
// widget produces. House style: no em dashes.
// ──────────────────────────────────────────────────────────────────────────

const GoldmanIBExamplePanel = () => (
  <div style={{ width: '100%' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ ...kicker, display: 'inline-block' }}>EXAMPLE OUTPUT</span>
      <span style={{ fontSize: 12, color: '#94A3B8' }}>USC Marshall student, Goldman IB analyst JD</span>
    </div>

    {/* Score header card */}
    <div style={cardShell}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND, letterSpacing: '0.06em', marginBottom: 4 }}>YOUR ATS SCORE</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span style={{ fontFamily: serif, fontSize: 48, fontWeight: 400, color: '#16A34A', lineHeight: 1 }}>92</span>
            <span style={{ fontSize: 15, color: '#64748B' }}>/ 100, Goldman-ready</span>
          </div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>vs Investment Banking Analyst at Goldman Sachs</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, padding: '3px 9px', borderRadius: 999, background: '#DCFCE7', color: '#166534', fontSize: 11, fontWeight: 700 }}>
            <TrendingUp size={11} /> +34 from 58 before edits
          </div>
        </div>
        <button
          disabled
          style={{
            background: BRAND, color: '#FFF', border: 'none', borderRadius: 8,
            padding: '10px 14px', fontSize: 13, fontWeight: 600, cursor: 'not-allowed',
            opacity: 0.95, display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <Download size={14} /> Download new PDF (3)
        </button>
      </div>
    </div>

    {/* Recommendation cards */}
    <div style={{ ...cardShell, marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <SeverityBadge tone="high" />
        <span style={panelHeading}>Critical (2)</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ExampleRecCard
          section="EXPERIENCE"
          chip="Quantify impact"
          original="Helped with financial analysis for a leveraged buyout in the consumer sector."
          suggested="Built a 3-statement LBO model for a $1.2B sponsor-led carve-out of a $400M EBITDA consumer assets group, sized $750M of debt across TLB and secured notes, modeled 22% sponsor IRR at a 9.0x exit multiple."
          why="Goldman M&A JDs grade three things on every bullet: deal size, financial mechanic, and outcome. The original surfaces none."
        />
        <ExampleRecCard
          section="EXPERIENCE"
          chip="IB keyword density"
          original="Built spreadsheets to model financial scenarios and present to senior team members."
          suggested="Built a merger model and accretion/dilution analysis for a $2.4B all-stock combination, including synergy waterfall, deal financing matrix (cash/stock/debt), and revenue synergy sensitivity. Presented in IC materials to MD-level reviewers."
          why="Workday matches the JD verbatim. Goldman analyst postings call out merger model, accretion/dilution, IC materials by name. Adding the actual terms moves a resume from auto-cut to keyword-passing in a single bullet."
        />
      </div>
    </div>

    <div style={{ ...cardShell, marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <SeverityBadge tone="medium" />
        <span style={panelHeading}>Worth fixing (1)</span>
      </div>
      <ExampleRecCard
        section="SECTION ORDER"
        chip="Analyst convention"
        original="Work Experience above Education"
        suggested="Move Education to the top of page 1, with school, GPA, expected graduation, and 4 to 6 relevant courses (Corporate Finance, Financial Modeling, Accounting, Valuation)."
        why="Analyst applications are screened against undergrad cohort. The recruiter expects school, GPA, and grad year in the top quarter of page 1. Bumping it raises first-pass relevance before a recruiter even scrolls."
      />
    </div>

    <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 12, textAlign: 'center' }}>
      Example output for a fictional USC Marshall sophomore. Your real review uses your own resume and the JD you paste.
    </p>
  </div>
);

// Sub-component used inside GoldmanIBExamplePanel.
const ExampleRecCard = ({
  section,
  chip,
  original,
  suggested,
  why,
}: {
  section: string;
  chip: string;
  original: string;
  suggested: string;
  why: string;
}) => (
  <div style={{ border: `1px solid ${BRAND}`, background: '#F0F7FF', borderRadius: 10, padding: 14 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={sectionChip}>{section}</span>
        <span style={principleChip}>{chip}</span>
      </div>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: BRAND, color: '#FFF', border: `1px solid ${BRAND}`,
        padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
      }}>
        <Check size={12} /> Applied
      </span>
    </div>
    <div style={{ fontSize: 13, color: '#94A3B8', textDecoration: 'line-through', marginBottom: 6, lineHeight: 1.5 }}>
      {original}
    </div>
    <div style={{ fontSize: 13.5, color: INK, fontWeight: 500, lineHeight: 1.5 }}>
      {suggested}
    </div>
    <div style={{ fontSize: 12, color: '#475569', marginTop: 8, lineHeight: 1.5, fontStyle: 'italic' }}>
      Why: {why}
    </div>
  </div>
);

const SeverityBadge = ({ tone }: { tone: 'high' | 'medium' | 'low' }) => {
  const colors = {
    high: { bg: '#FEE2E2', fg: '#991B1B', label: 'Critical' },
    medium: { bg: '#FEF3C7', fg: '#92400E', label: 'Notable' },
    low: { bg: '#DBEAFE', fg: '#1E40AF', label: 'Polish' },
  }[tone];
  return (
    <span
      style={{
        background: colors.bg,
        color: colors.fg,
        fontSize: 11,
        fontWeight: 700,
        padding: '3px 8px',
        borderRadius: 999,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {tone === 'high' ? <AlertTriangle size={11} /> : null}
      {colors.label}
    </span>
  );
};

const cardShell: React.CSSProperties = {
  background: '#FFF',
  border: '1px solid #E2E8F0',
  borderRadius: 14,
  padding: 18,
  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
  boxSizing: 'border-box',
};

const panelHeading: React.CSSProperties = {
  fontFamily: serif,
  fontSize: 17,
  fontWeight: 400,
  color: INK,
  margin: 0,
};

const sectionChip: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: '3px 8px',
  borderRadius: 999,
  background: '#F1F5F9',
  color: '#475569',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

const principleChip: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  padding: '3px 8px',
  borderRadius: 999,
  background: '#EFF6FF',
  color: BRAND_DARK,
};

// ──────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────

const ResumeReviewGoldmanIBPreview = () => {
  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>Goldman Sachs IB Resume Review (Free, Tailored to the JD) | Offerloop</title>
        <meta name="robots" content="noindex" />
        <meta
          name="description"
          content="Free resume review for Goldman Sachs investment banking analyst applications. Upload your PDF, paste the JD, get your ATS score and the specific line-by-line edits that get past Workday's first cut. No account required."
        />
      </Helmet>

      <PreviewNav />

      <PreviewHero
        EyebrowIcon={FileText}
        eyebrow="RESUME REVIEW · GOLDMAN SACHS IB"
        line1={<>Make your resume <span style={{ color: BRAND }}>Goldman-ready</span></>}
        line2="get past Workday, then past the recruiter, in 30 seconds"
        lead="Drop your resume PDF and paste the Goldman Sachs investment banking analyst posting. Offerloop scores it against the JD, rewrites the bullets that read weakly, surfaces the keywords you are missing, and gives you a downloadable improved PDF. No account needed."
        chips={['Tailored to the JD', 'ATS score in 30 seconds', 'Downloadable PDF']}
      />

      {/* Widget mount with example panel: left shows what good looks like,
          right is the live try-it form. Once the visitor submits, the widget
          takes the full width and runs on their own resume + JD. */}
      <section className="px-6 pt-12 pb-6" style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 20, textAlign: 'center' }}>
          <span style={{ ...kicker, display: 'inline-block' }}>SEE THE OUTPUT, THEN SCORE YOUR OWN</span>
        </div>
        <ResumeReviewWidget
          source="seo-preview-resume-review-goldman-ib"
          eyebrow=""
          heading=""
          subhead=""
          examplePanel={<GoldmanIBExamplePanel />}
        />
      </section>

      <ProblemSection heading="Your resume meets a bot before it meets a banker.">
        Goldman runs every analyst application through Workday, an applicant tracking system that
        scores resumes for keyword match, format, and section structure before a single recruiter
        sees them. A bullet that reads fine to a friend can score in the 40s against the actual
        JD because Workday matches the exact phrases, models, and quantified outcomes a banking
        analyst posting expects. Don't let the bot cut you before the recruiter ever opens the
        file. The widget above runs your PDF against the Goldman JD you paste so you can see, in
        seconds, exactly what the gap is for this specific application.
      </ProblemSection>

      <StatStrip
        heading="GOLDMAN IB RESUMES, BY THE NUMBERS"
        stats={[
          { value: '75+', label: 'typical ATS score threshold to clear the first automated cut at large financial firms' },
          { value: '300+', label: 'applicants on average per Goldman Sachs analyst opening' },
          { value: '30 sec', label: 'what the Offerloop widget above takes to score your resume against the JD' },
        ]}
      />

      {/* IB-specific "what we look for" - the unique-data block required on
          every widget page. Not the widget output; this is the firm-specific
          body content that defends against doorway flagging. */}
      <section className="px-6 py-14" style={{ maxWidth: 820, margin: '0 auto', background: '#FAFBFF', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9' }}>
        <h2 style={h2Style}>What the widget checks for a Goldman IB JD</h2>
        <p style={pStyle}>
          These are the seven flags that drive the score and the rewrites for an investment
          banking analyst application. Each one is calibrated to what Workday matches against
          and what an IB recruiter looks for in the human pass that follows.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 18 }}>
          {[
            { t: 'Deal language', d: 'Buyside/sellside, M&A, leveraged finance, IPO, debt issuance, restructuring. JDs require these as keywords.' },
            { t: 'Modeling depth', d: 'Three-statement, DCF, LBO, accretion/dilution, comps. Generic "financial analysis" loses to the named model.' },
            { t: 'Quant outcomes', d: 'Every bullet ends in a dollar figure, a multiple, a basis-point delta, or a percentage. Vague verbs get rewritten.' },
            { t: 'Section ordering', d: 'Education first for analyst applications. GPA visible. Relevant coursework, not full transcript.' },
            { t: 'Bullet cadence', d: 'Action verb + transaction + scale + outcome, in that order. Roughly 22-30 words per bullet, never more than two lines.' },
            { t: 'ATS-safe layout', d: 'Single column. No tables, no graphics, no text in headers or footers. Goldman uses Workday under the hood.' },
            { t: 'JD keyword match', d: 'The score includes a raw match against the JD you paste. Missing keywords are returned to you as a chip strip.' },
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

      <HowItWorks
        heading="How the review works"
        steps={[
          { Icon: Upload, t: 'Upload your resume', d: 'Drop the PDF you would submit to Goldman. 10MB max, text-based PDF only (Workday cannot parse images).' },
          { Icon: Target, t: 'Paste the Goldman JD', d: 'Either the full job description text or the URL of the posting on Goldman careers, LinkedIn, or Greenhouse. The score is tailored to that exact JD.' },
          { Icon: Lightbulb, t: 'Review the line-by-line edits', d: 'Critical, notable, and polish edits are grouped by severity. Each shows the original bullet, the rewrite, and why the rewrite is stronger for an IB JD.' },
          { Icon: Download, t: 'Download your improved PDF', d: 'Click Apply on the rewrites you want. The right-side preview rebuilds the PDF live as you accept edits, ready to submit.' },
        ]}
      />

      <InlineEmailCapture {...emailCapture} />

      <FAQ
        items={[
          {
            q: 'Is this really free? What is the catch?',
            a: 'No catch. Upload, paste, get the score and the rewrites without an account. We ask for an email when you submit so we can send you the report and the weekly banking digest, and so we can rate-limit the tool. You can use it once and never come back.',
          },
          {
            q: 'Will Goldman know I used Offerloop?',
            a: 'No. Offerloop never contacts the firm. The output is a PDF you download and submit through Goldman\'s own application portal. We do not stamp the PDF or include any tracking marker.',
          },
          {
            q: 'What ATS does Goldman use?',
            a: 'Goldman runs applications through Workday for most regions and roles. Workday is strict about formatting: single column, no tables, no graphics, no text in headers or footers, standard fonts. The widget flags these issues directly.',
          },
          {
            q: 'I am applying to multiple banks. Do I rerun this for each one?',
            a: 'Yes, and you should. The ATS keyword match is tailored to whichever JD you paste. A bullet that scores well for Goldman M&A may score worse for a Morgan Stanley capital markets posting because the keyword set differs. Each JD gets its own score.',
          },
          {
            q: 'My GPA is below 3.5. Should I leave it off?',
            a: 'For Goldman analyst applications the recruiter expectation is GPA visible. Leaving it off reads as hiding it, which gets weighted more harshly than a 3.4 would. The widget will flag a missing GPA on the section-ordering check.',
          },
          {
            q: 'How is the score calculated?',
            a: 'Three weighted components: keyword match against the JD, formatting/ATS compliance, and content relevance (bullet structure, modeling and deal language, quantified outcomes). The widget shows the breakdown so you can see where you are losing points.',
          },
          {
            q: 'Do you keep my resume?',
            a: 'We keep the parsed text long enough to send you the report. The PDF itself is processed in memory and not retained. You can read the full policy on the Privacy page.',
          },
          {
            q: 'What if my recommendations look generic?',
            a: 'Either the JD you pasted was too short for the model to extract specific requirements, or your resume already aligns well. Paste the full JD (not just the role title) for the best line-by-line rewrites.',
          },
        ]}
      />

      <PreviewCTA
        eyebrow="WHEN YOU ARE READY FOR THE FULL TOOLKIT"
        headline="Score, rewrite, and reach an alum in the same session"
        subhead="Once your resume scores 80+, Offerloop helps you find a USC, NYU, Michigan, or UPenn alum at Goldman, drafts the cold email, and tracks the reply, in the same workflow."
        buttonText="Create your free Offerloop account"
        to="/signin?mode=signup"
        footnote="Free tier: 3 contacts per search, 2 interview preps, no credit card."
      />

      <ExitIntentCapture
        eyebrow="BEFORE YOU GO"
        heading="One last thing"
        subtext="Get the weekly banking digest: ATS keyword drops, deadline changes, and the specific resume mistakes that get cut in the first pass. Free, no spam."
        buttonText="Send me the digest"
        cluster="banking"
      />

      <PreviewFooter />
    </div>
  );
};

export default ResumeReviewGoldmanIBPreview;
