/*
 * SEO PREVIEW: ATS-screening explainer + free resume review.
 * Route: /seo-preview/what-is-an-ats
 *
 * The first page of the new ATS cluster. Built directly from the ranking
 * playbook (~/.claude/skills/offerloop-seo-article/ranking-playbook.md):
 *
 *  - Quick-Answer block (40-60 words) right under the H1 for AEO extraction
 *  - Updated [Month YYYY] byline for the freshness signal
 *  - Question-form H2s in the body
 *  - Widget embedded above the fold, generic-role example panel on the left
 *  - Workday/Greenhouse/Lever-specific factual block (the unique-data block)
 *  - 8-question FAQ for FAQPage schema
 *  - One CTA into onboarding; inline + exit-intent email capture as
 *    second-chance layers
 *
 * House style: no em dashes, no sparkle icons. See seo-examples/SEO_STRATEGY.md.
 */
import { Helmet } from 'react-helmet-async';
import {
  Upload, Target, BadgeCheck, Lightbulb, Download,
  AlertTriangle, Check, TrendingUp, Bot,
} from 'lucide-react';
import {
  BRAND, BRAND_DARK, INK, kicker, serif,
  PreviewNav, PreviewFooter,
  ProblemSection, StatStrip, HowItWorks, FAQ, PreviewCTA,
  InlineEmailCapture, ExitIntentCapture, h2Style, pStyle, gridLayer,
} from './_shared';
import { ResumeReviewWidget } from '../../components/widgets/ResumeReviewWidget';

const UPDATED_LABEL = 'Updated May 2026';
const PUBLISH_DATE_ISO = '2026-05-26';

const emailCapture = {
  eyebrow: 'NOT APPLYING YET?',
  heading: 'Get the weekly ATS-keyword drop',
  subtext: 'Every Monday: the specific ATS keywords showing up in newly posted JDs at Goldman, McKinsey, Google, and 20 other firms. Free, no spam.',
  buttonText: 'Send me the keyword drop',
  cluster: 'student',
};

// ──────────────────────────────────────────────────────────────────────────
// JSON-LD: Article + FAQPage + HowTo + WebApplication
// Required schema per ranking-playbook.md. dateModified matches the visible
// Updated byline; refresh both together on the quarterly cadence.
// ──────────────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: 'What is an applicant tracking system (ATS) in simple terms?',
    a: 'An ATS is software that parses your resume into structured data (name, contact, jobs, dates, skills), scores it against the job description for keyword and format match, and ranks it against other applicants before a recruiter reads any of them. Around 90% of large employers use one. The two most common are Workday (used by Goldman, JPMorgan, Morgan Stanley, BofA, and most large banks) and Greenhouse (used by many growth-stage tech firms).',
  },
  {
    q: 'How does an ATS read my resume?',
    a: 'Top-to-bottom in document order. The parser extracts text into named fields: contact info first, then work experience (employer, title, dates), then education, then skills. Two-column layouts break this on roughly 41% of resumes because the parser reads the left column first or in the wrong order. Headers and footers are often skipped entirely. Tables scramble content order. Image-based PDFs fail outright.',
  },
  {
    q: 'What score do I need to pass the ATS?',
    a: '75+ is the threshold most large firms set for first-cut survival. 80+ puts you in the top tier for competitive roles. The score is a function of three things: keyword match against the JD (15-25 relevant keywords, 60-80% coverage), formatting compliance (single-column, standard fonts, parseable section headers), and content relevance (the right kind of bullets for the role).',
  },
  {
    q: 'How do I find the right keywords for an ATS?',
    a: 'Paste the job description into the widget above. It extracts the keywords the JD calls for and tells you which ones are missing from your resume. The single most powerful keyword to include is the exact job title from the posting; doing so raises interview likelihood by 10.6x per a Jobscan 2024 study. After that, the JD\'s technical skills, named tools, and named processes are the next priority.',
  },
  {
    q: 'Does Workday actually reject resumes automatically?',
    a: 'Contrary to popular belief, Workday rarely rejects automatically. It acts as a search engine for recruiters. The recruiter filters the database by keyword, school, GPA, location, and a few other facets, then reads the resumes that match those filters. The way to "beat" Workday is to be one of the resumes the recruiter\'s filter surfaces, which means matching the JD keywords precisely and being parseable as structured data.',
  },
  {
    q: 'Which ATS does [my target firm] use?',
    a: 'Goldman Sachs, JPMorgan, Morgan Stanley, Bank of America, and most other large banks use Workday. McKinsey, Bain, and BCG run on internal systems built on top of Workday. Google, Amazon, and Meta use a mix of internal tools and Greenhouse. Startups under ~500 people most often use Greenhouse, Lever, or Ashby. If you cannot find an answer for a specific firm, format your resume to Workday spec since it is the strictest of the major systems.',
  },
  {
    q: 'Is the resume review really free? What is the catch?',
    a: 'No catch. Upload, paste, get the score and the rewrites without an account. We ask for an email when you submit so we can send you the report and the weekly keyword digest, and so we can rate-limit the tool. The widget never shares your resume with the firm and never stamps the output PDF.',
  },
  {
    q: 'How often do I need to re-run this for the same role at different firms?',
    a: 'Every time, and you should. The ATS keyword match is tailored to whichever JD you paste. A bullet that scores well for Goldman M&A may score worse for a Morgan Stanley capital markets posting because the keyword set differs. Each JD gets its own score and its own rewrites.',
  },
];

const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Article',
      'headline': 'What Is an Applicant Tracking System (ATS)? Complete 2026 Guide + Free Resume Review',
      'datePublished': PUBLISH_DATE_ISO,
      'dateModified': PUBLISH_DATE_ISO,
      'author': { '@type': 'Organization', 'name': 'Offerloop' },
      'publisher': { '@type': 'Organization', 'name': 'Offerloop' },
      'description': 'How applicant tracking systems parse, score, and rank resumes in 2026, with the format, keyword, and structure rules to get past Workday, Greenhouse, and Lever. Includes a free, instant resume review tailored to any job description.',
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
      'name': 'How to get a resume past an ATS in 2026',
      'step': [
        { '@type': 'HowToStep', 'name': 'Upload your resume', 'text': 'Drop your PDF or DOCX into the widget. Use text-selectable PDF or DOCX only; image PDFs fail.' },
        { '@type': 'HowToStep', 'name': 'Paste the job description', 'text': 'Paste the JD text or the URL of the posting. The score is tailored to that exact JD.' },
        { '@type': 'HowToStep', 'name': 'Apply the line-by-line edits', 'text': 'Accept the critical and notable rewrites the widget surfaces. Each names the keyword or formatting issue it fixes.' },
        { '@type': 'HowToStep', 'name': 'Download the improved PDF', 'text': 'The widget rebuilds your PDF live as you accept edits, single-column and parseable for Workday and Greenhouse.' },
      ],
    },
    {
      '@type': 'WebApplication',
      'name': 'Offerloop Free Resume Review',
      'applicationCategory': 'BusinessApplication',
      'operatingSystem': 'Web',
      'offers': { '@type': 'Offer', 'price': '0', 'priceCurrency': 'USD' },
    },
  ],
};

// ──────────────────────────────────────────────────────────────────────────
// Generic-role example panel.
// Unlike the Goldman IB page, this page covers ATS broadly, so the example
// is a generic strong scored result demonstrating the universal ATS
// principles (keywords, quantification, single-column format).
// ──────────────────────────────────────────────────────────────────────────

const GenericExamplePanel = () => (
  <div style={{ width: '100%' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ ...kicker, display: 'inline-block' }}>EXAMPLE OUTPUT</span>
      <span style={{ fontSize: 12, color: '#94A3B8' }}>Software engineer applicant, mid-size firm JD</span>
    </div>

    <div style={cardShell}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND, letterSpacing: '0.06em', marginBottom: 4 }}>YOUR ATS SCORE</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span style={{ fontFamily: serif, fontSize: 48, fontWeight: 400, color: '#16A34A', lineHeight: 1 }}>89</span>
            <span style={{ fontSize: 15, color: '#64748B' }}>/ 100, strong</span>
          </div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>vs Software Engineer at the JD you pasted</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, padding: '3px 9px', borderRadius: 999, background: '#DCFCE7', color: '#166534', fontSize: 11, fontWeight: 700 }}>
            <TrendingUp size={11} /> +31 from 58 before edits
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

    <div style={{ ...cardShell, marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <SeverityBadge tone="high" />
        <span style={panelHeading}>Critical (2)</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ExampleRecCard
          section="EXPERIENCE"
          chip="Quantify impact"
          original="Worked on backend services for the payments team."
          suggested="Owned 3 of 8 microservices in the payments stack (Go + Postgres), cut p99 checkout latency from 410ms to 145ms, and shipped idempotent retry logic that recovered $2.1M in previously failed transactions per quarter."
          why="The JD calls for backend services experience, latency wins, and ownership scope. The original surfaces none of the three. The rewrite hits all three with measurable outcomes."
        />
        <ExampleRecCard
          section="FORMAT"
          chip="Workday parser fix"
          original="Two-column resume with sidebar for skills"
          suggested="Single-column layout, skills moved inline under each Experience role with a Skills summary block at the bottom."
          why="Workday and most ATS parsers read top-to-bottom. Two-column layouts cause parse failure on around 41% of resumes; the sidebar gets read after the right column, scrambling chronology and dropping skills from the indexed record."
        />
      </div>
    </div>

    <div style={{ ...cardShell, marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <SeverityBadge tone="medium" />
        <span style={panelHeading}>Worth fixing (1)</span>
      </div>
      <ExampleRecCard
        section="KEYWORDS"
        chip="JD match"
        original="Familiar with cloud infrastructure and CI/CD pipelines."
        suggested="Built and operated AWS-based infrastructure (ECS, RDS, Lambda) with GitHub Actions and Terraform-managed deploys; ran on-call rotation for 6 services with 99.95% uptime over 18 months."
        why="The JD names AWS, GitHub Actions, and on-call by keyword. Generic 'cloud infrastructure' fails the keyword match; named tools and named processes pass."
      />
    </div>

    <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 12, textAlign: 'center' }}>
      Example output for a fictional software engineer applicant. Your real review uses your own resume and the JD you paste.
    </p>
  </div>
);

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

const WhatIsAnATSPreview = () => {
  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>What Is an Applicant Tracking System (ATS)? Complete 2026 Guide + Free Resume Review | Offerloop</title>
        <meta name="robots" content="noindex" />
        <meta
          name="description"
          content="How applicant tracking systems parse, score, and rank resumes in 2026. The format, keyword, and structure rules to get past Workday, Greenhouse, and Lever. Free instant resume review tailored to any JD."
        />
        <script type="application/ld+json">{JSON.stringify(JSON_LD)}</script>
      </Helmet>

      <PreviewNav />

      {/* Hero. Tight (no big illustration block) so the Quick-Answer box and
          widget sit close to the H1 for AEO + above-fold conversion. */}
      <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid #F1F5F9' }}>
        <div style={gridLayer('rgba(15,23,42,0.045)', 'radial-gradient(ellipse 75% 70% at 50% 0%, #000 30%, transparent 75%)')} />
        <div className="px-6 pt-14 pb-10 text-center" style={{ maxWidth: 880, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <span className="inline-flex items-center gap-1.5 mb-5" style={{ background: '#EFF5FF', border: '1px solid #DBEAFE', color: BRAND_DARK, fontSize: 12.5, fontWeight: 600, padding: '5px 12px', borderRadius: 999 }}>
            <Bot className="w-3.5 h-3.5" /> ATS GUIDE · UPDATED MAY 2026
          </span>
          <h1 style={{ fontFamily: serif, fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.03em', color: INK, marginBottom: 14, fontSize: 'clamp(34px, 4.6vw, 52px)' }}>
            What is an applicant tracking system <span style={{ color: BRAND }}>(ATS)</span>, and how do you beat it?
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: '#64748B', maxWidth: 680, margin: '0 auto 6px' }}>
            The 2026 guide to the software that filters 75% of resumes before a human reads them, with the format and keyword rules to get past it.
          </p>
          <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>
            {UPDATED_LABEL} <span style={{ marginLeft: 8 }}>·</span> <span style={{ marginLeft: 8 }}>9 min read</span>
          </p>
        </div>

        {/* Quick-Answer block: the AEO citation slot. 40-60 words, direct,
            extractable, ends with the widget pointer. See ranking-playbook.md. */}
        <div className="px-6" style={{ maxWidth: 820, margin: '0 auto 36px', position: 'relative', zIndex: 1 }}>
          <div style={{ background: '#F0F7FF', borderLeft: `3px solid ${BRAND}`, borderRadius: 6, padding: '18px 22px' }}>
            <div style={{ ...kicker, marginBottom: 6, color: BRAND_DARK }}>QUICK ANSWER</div>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: INK, margin: 0 }}>
              An applicant tracking system (ATS) is software that 90% of large employers use
              to parse, score, and rank resumes before a recruiter sees them. To get past one,
              submit a single-column resume in DOCX or text-selectable PDF, mirror 60-80% of
              the job description's exact keywords, and aim for a 75+ ATS score. The widget
              below runs that scoring on your resume for free in 30 seconds.
            </p>
          </div>
        </div>
      </section>

      {/* Widget mount: above the fold per ranking-playbook.md. Generic-role
          example panel on the left so the visitor sees what good output
          looks like across any role, not just one firm. */}
      <section className="px-6 pt-10 pb-6" style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 18, textAlign: 'center' }}>
          <span style={{ ...kicker, display: 'inline-block' }}>SEE WHAT GOOD OUTPUT LOOKS LIKE, THEN SCORE YOUR OWN</span>
        </div>
        <ResumeReviewWidget
          source="seo-preview-what-is-an-ats"
          eyebrow=""
          heading=""
          subhead=""
          examplePanel={<GenericExamplePanel />}
        />
      </section>

      <StatStrip
        heading="ATS BY THE NUMBERS"
        stats={[
          { value: '90%', label: 'of large employers use automated systems to filter or rank applications (World Economic Forum, 2025)' },
          { value: '75%', label: 'of resumes are filtered by ATS before a human reads them (industry consensus)' },
          { value: '10.6x', label: 'increase in interview likelihood when your resume includes the exact job title from the posting (Jobscan, 2024)' },
        ]}
      />

      <ProblemSection heading="Your resume meets a bot before it meets a recruiter.">
        Around 90% of large employers use applicant tracking systems to parse, score, and
        rank resumes before any human reads them. The bot reads top-to-bottom, maps your
        text into structured fields (name, contact, jobs, dates, skills), and scores against
        the job description for keyword match, format compliance, and section structure.
        Contrary to popular belief, the bot rarely rejects automatically. It builds a
        searchable database that the recruiter then filters. The way to "beat" the bot is to
        be one of the resumes the recruiter's filter surfaces, which means matching the
        JD's keywords precisely and being parseable as structured data. The widget above
        runs that scoring on your resume against the JD you paste, in 30 seconds.
      </ProblemSection>

      {/* H2 #1, question form, prompt-shaped (per ranking-playbook.md) */}
      <section className="px-6 py-14" style={{ maxWidth: 820, margin: '0 auto' }}>
        <h2 style={h2Style}>How does an ATS actually read your resume?</h2>
        <p style={pStyle}>
          Top-to-bottom, in strict document order. The parser walks the file from the first
          line down and tries to match each block of text to a field in its schema: name,
          phone, email, employer, title, dates, education, skills. When the layout breaks
          that order, the parser scrambles fields or drops them entirely.
        </p>
        <p style={pStyle}>
          The four parsing failures that account for most ATS rejections in 2026:
        </p>
        <ul style={{ ...pStyle, paddingLeft: 22 }}>
          <li><strong>Two-column layouts.</strong> A ProfileOps 2026 study found ~41% of two-column resumes parse incorrectly in Workday. The left-column sidebar is read after the right column, scrambling job chronology and dropping skills from the indexed record.</li>
          <li><strong>Text in headers or footers.</strong> Many parsers skip headers and footers entirely. Contact info placed there becomes invisible.</li>
          <li><strong>Tables.</strong> Tables scramble content order during parsing. Skills inside a table cell often never reach the structured record.</li>
          <li><strong>Image-based PDFs.</strong> An ATS cannot OCR image PDFs. If your resume was exported as an image (common from Canva exports), the entire file is unreadable.</li>
        </ul>
      </section>

      {/* H2 #2 */}
      <section className="px-6 py-14" style={{ maxWidth: 820, margin: '0 auto', background: '#FAFBFF', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9' }}>
        <h2 style={h2Style}>Which ATS does my target firm use?</h2>
        <p style={pStyle}>
          The major systems and where they show up most:
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginTop: 18 }}>
          {[
            { name: 'Workday', who: 'Goldman, JPMorgan, Morgan Stanley, BofA, most large banks. McKinsey, Bain, and BCG run on internal systems built on top of Workday.', quirk: 'Strictest parser. Single-column required. <2MB. DOCX or text-selectable PDF.' },
            { name: 'Greenhouse', who: 'Many growth-stage tech firms, scaling startups, some larger tech companies.', quirk: 'More lenient than Workday but still single-column-preferred. Tables sometimes parse cleanly.' },
            { name: 'Lever', who: 'Common in mid-size tech, AI, and SaaS firms (Anthropic, several YC companies).', quirk: 'Emphasizes recent-job recency. Older roles weighted less than at Workday.' },
            { name: 'iCIMS', who: 'Legacy systems at older Fortune 500 firms, healthcare, retail.', quirk: 'Treat like Workday for safety. Strict on format.' },
            { name: 'Ashby', who: 'Newer modern startup ATS. Notion, Linear, others.', quirk: 'Modern parser. PDFs parse well. Keyword match still dominant.' },
            { name: 'Internal (Google, Amazon, Meta)', who: 'Big tech run mixes of internal tools plus Greenhouse for some pipelines.', quirk: 'Largely Workday-spec safe. The bigger filter is internal recruiter screen.' },
          ].map((s) => (
            <div key={s.name} className="rounded-[4px]" style={{ background: '#fff', border: '1px solid #E2E8F0', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <BadgeCheck className="w-4 h-4" style={{ color: BRAND }} />
                <p style={{ fontSize: 14, fontWeight: 700, color: INK, margin: 0 }}>{s.name}</p>
              </div>
              <p style={{ fontSize: 12.5, lineHeight: 1.55, color: '#64748B', margin: '0 0 6px 0' }}>{s.who}</p>
              <p style={{ fontSize: 12, lineHeight: 1.55, color: '#475569', margin: 0, fontStyle: 'italic' }}>{s.quirk}</p>
            </div>
          ))}
        </div>
        <p style={{ ...pStyle, marginTop: 18 }}>
          <strong>If you cannot find a definitive answer for a specific firm,</strong> format
          your resume to Workday spec. Workday is the strictest of the major systems, so a
          Workday-clean resume parses cleanly in everything else.
        </p>
      </section>

      {/* H2 #3 */}
      <section className="px-6 py-14" style={{ maxWidth: 820, margin: '0 auto' }}>
        <h2 style={h2Style}>How do you get past an ATS in 2026?</h2>
        <p style={pStyle}>
          Three things, in priority order:
        </p>
        <ol style={{ ...pStyle, paddingLeft: 22 }}>
          <li>
            <strong>Mirror the JD's exact keywords.</strong> The single highest-leverage
            action is including the exact job title from the posting (raises interview
            likelihood by 10.6x per a Jobscan 2024 study). After that: the named tools,
            technologies, certifications, and processes the JD calls for. Target 60-80%
            coverage of JD keywords, 15-25 keywords total. Do not stuff. Modern parsers
            flag obvious keyword stuffing.
          </li>
          <li>
            <strong>Use ATS-safe formatting.</strong> Single-column. Standard fonts (Arial,
            Calibri, Times New Roman). Standard section headers (Work Experience, Education,
            Skills, not "Career Journey" or "What I Bring"). Dates in MM/YYYY or Month YYYY
            format, consistent across the file. No tables, no graphics, no text in headers
            or footers. File size under 2MB. DOCX or text-selectable PDF.
          </li>
          <li>
            <strong>Hit 75+ on the ATS score.</strong> Most large firms set 75+ as the
            threshold for first-cut survival; 80+ for competitive roles. The widget above
            scores your resume against the JD you paste and surfaces the specific bullets to
            rewrite to lift the score.
          </li>
        </ol>
      </section>

      {/* H2 #4 */}
      <section className="px-6 py-14" style={{ maxWidth: 820, margin: '0 auto', background: '#FAFBFF', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9' }}>
        <h2 style={h2Style}>What are the most common ATS mistakes in 2026?</h2>
        <p style={pStyle}>
          Pulled from the most-repeated parsing failures across Jobscan, ProfileOps, and the
          ATS Hiring 2026 guide:
        </p>
        <ul style={{ ...pStyle, paddingLeft: 22 }}>
          <li><strong>Canva or PowerPoint resume.</strong> Exports as image PDF. ATS cannot read it. Rebuild in Google Docs, Word, or a parseable template.</li>
          <li><strong>Two-column layout.</strong> ~41% Workday parse failure rate. The "sleek" look costs you the read.</li>
          <li><strong>Contact info in the header or footer.</strong> Skipped by most parsers. Put name, email, phone, LinkedIn in the document body.</li>
          <li><strong>Mixed date formats.</strong> "2024-March" in one role and "03/24" in another reduces timeline confidence. Pick one format (MM/YYYY or Month YYYY) and use it everywhere.</li>
          <li><strong>Custom section headers.</strong> "Career Journey" instead of "Work Experience" fails field mapping.</li>
          <li><strong>Skills only in a skills section.</strong> A skill named only in your Skills block but never in an Experience bullet looks unsupported. Show every must-have skill inside an Experience bullet too.</li>
          <li><strong>Generic action verbs.</strong> "Helped" / "Worked on" / "Familiar with" carry no keyword weight. Replace with the specific action and the specific tool.</li>
          <li><strong>Vanity stats with no source bullet.</strong> "Improved efficiency by 30%" with no context reads as fabricated and trips quality classifiers in newer parsers.</li>
        </ul>
      </section>

      <HowItWorks
        heading="How the free review works"
        steps={[
          { Icon: Upload, t: 'Upload your resume', d: 'DOCX or text-selectable PDF only. Image-based PDFs (Canva exports) cannot be read by any ATS. 10MB max.' },
          { Icon: Target, t: 'Paste the job description', d: 'Full JD text or the URL of the posting. The score is tailored to that exact JD, including the keywords the JD names verbatim.' },
          { Icon: Lightbulb, t: 'Apply the rewrites', d: 'Critical and Notable edits are grouped by severity. Each shows the original bullet, the rewrite, and which JD keyword or formatting rule it fixes.' },
          { Icon: Download, t: 'Download the new PDF', d: 'The right-side preview rebuilds your resume live as you accept edits. Single-column, Workday-safe, ready to submit.' },
        ]}
      />

      <InlineEmailCapture {...emailCapture} />

      <FAQ items={FAQ_ITEMS} />

      <PreviewCTA
        eyebrow="WHEN YOU ARE READY FOR THE FULL TOOLKIT"
        headline="Score your resume, then reach the alum who already got in"
        subhead="Once your ATS score clears 80, Offerloop helps you find a USC, NYU, Michigan, or UPenn alum at the firm you applied to, drafts the cold email, and tracks the reply, all in the same workflow."
        buttonText="Create your free Offerloop account"
        to="/signin?mode=signup"
        footnote="Free tier: 3 contacts per search, 2 interview preps, no credit card."
      />

      <ExitIntentCapture
        eyebrow="BEFORE YOU GO"
        heading="The weekly ATS keyword drop"
        subtext="Every Monday: the specific ATS keywords showing up in newly posted JDs at Goldman, McKinsey, Google, and 20 other firms. Free, no spam."
        buttonText="Send me the keyword drop"
        cluster="student"
      />

      <PreviewFooter />
    </div>
  );
};

export default WhatIsAnATSPreview;
