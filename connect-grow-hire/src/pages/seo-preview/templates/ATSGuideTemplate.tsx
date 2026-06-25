/*
 * ATS Guide template. Renders any row from seo/data/ats.ts.
 * Mounted at /seo-preview/ats/:slug via the dynamic route.
 *
 * Supports three variants from the row's `variant` field:
 *   - generic: "what is an ATS" hero page
 *   - by-firm: ATS at [firm]
 *   - by-role: ATS keywords for [role] resume
 */
import { Helmet } from 'react-helmet-async';
import { useParams, useLocation } from 'react-router-dom';
import {
  Upload, Target, BadgeCheck, Lightbulb, Download,
  AlertTriangle, Check, TrendingUp, Bot,
} from 'lucide-react';
import {
  BRAND, BRAND_DARK, INK, kicker, serif,
  PreviewNav, PreviewFooter,
  ProblemSection, StatStrip, HowItWorks, FAQ, PreviewCTA,
  InlineEmailCapture, ExitIntentCapture, h2Style, pStyle, gridLayer,
} from '../_shared';
import { ResumeReviewWidget } from '../../../components/widgets/ResumeReviewWidget';
import { getATSRow } from '../../../seo/data/ats';
import { getFirm } from '../../../seo/data/firms';
import { getRole } from '../../../seo/data/roles';
import type { ATSRow, ExampleRec } from '../../../seo/data/types';

const cardShell: React.CSSProperties = {
  background: '#FFF', border: '1px solid #E2E8F0', borderRadius: 14,
  padding: 18, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', boxSizing: 'border-box',
};
const panelHeading: React.CSSProperties = {
  fontFamily: serif, fontSize: 17, fontWeight: 400, color: INK, margin: 0,
};
const sectionChip: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
  background: '#F1F5F9', color: '#475569', letterSpacing: '0.04em', textTransform: 'uppercase',
};
const principleChip: React.CSSProperties = {
  fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 999,
  background: '#EFF6FF', color: BRAND_DARK,
};

const ExamplePanel = ({ row }: { row: ATSRow }) => (
  <div style={{ width: '100%' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ ...kicker, display: 'inline-block' }}>EXAMPLE OUTPUT</span>
      <span style={{ fontSize: 12, color: '#94A3B8' }}>{row.examplePanel.studentBlurb}</span>
    </div>

    <div style={cardShell}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND, letterSpacing: '0.06em', marginBottom: 4 }}>YOUR ATS SCORE</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span style={{ fontFamily: serif, fontSize: 48, fontWeight: 400, color: scoreColor(row.examplePanel.score), lineHeight: 1 }}>{row.examplePanel.score}</span>
            <span style={{ fontSize: 15, color: '#64748B' }}>/ 100, {row.examplePanel.scoreLabel}</span>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, padding: '3px 9px', borderRadius: 999, background: '#DCFCE7', color: '#166534', fontSize: 11, fontWeight: 700 }}>
            <TrendingUp size={11} /> +{row.examplePanel.score - row.examplePanel.previousScore} from {row.examplePanel.previousScore} before edits
          </div>
        </div>
        <button disabled style={{
          background: BRAND, color: '#FFF', border: 'none', borderRadius: 8,
          padding: '10px 14px', fontSize: 13, fontWeight: 600, cursor: 'not-allowed',
          opacity: 0.95, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Download size={14} /> Download new PDF ({row.examplePanel.rewriteCount})
        </button>
      </div>
    </div>

    {(['high', 'medium', 'low'] as const).map((sev) => {
      const recs = row.examplePanel.recommendations.filter((r) => r.severity === sev);
      if (recs.length === 0) return null;
      const label = sev === 'high' ? 'Critical' : sev === 'medium' ? 'Worth fixing' : 'Polish';
      return (
        <div key={sev} style={{ ...cardShell, marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <SeverityBadge tone={sev} />
            <span style={panelHeading}>{label} ({recs.length})</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {recs.map((r, i) => <RecCard key={i} rec={r} />)}
          </div>
        </div>
      );
    })}

    <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 12, textAlign: 'center' }}>
      Example output. Your real review uses your own resume and the JD you paste.
    </p>
  </div>
);

const RecCard = ({ rec }: { rec: ExampleRec }) => (
  <div style={{ border: `1px solid ${BRAND}`, background: '#F0F7FF', borderRadius: 10, padding: 14 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={sectionChip}>{rec.section}</span>
        <span style={principleChip}>{rec.chip}</span>
      </div>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: BRAND, color: '#FFF', border: `1px solid ${BRAND}`,
        padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
      }}>
        <Check size={12} /> Applied
      </span>
    </div>
    <div style={{ fontSize: 13, color: '#94A3B8', textDecoration: 'line-through', marginBottom: 6, lineHeight: 1.5 }}>{rec.original}</div>
    <div style={{ fontSize: 13.5, color: INK, fontWeight: 500, lineHeight: 1.5 }}>{rec.suggested}</div>
    <div style={{ fontSize: 12, color: '#475569', marginTop: 8, lineHeight: 1.5, fontStyle: 'italic' }}>Why: {rec.why}</div>
  </div>
);

const SeverityBadge = ({ tone }: { tone: 'high' | 'medium' | 'low' }) => {
  const c = { high: { bg: '#FEE2E2', fg: '#991B1B', label: 'Critical' },
              medium: { bg: '#FEF3C7', fg: '#92400E', label: 'Notable' },
              low: { bg: '#DBEAFE', fg: '#1E40AF', label: 'Polish' } }[tone];
  return (
    <span style={{
      background: c.bg, color: c.fg, fontSize: 11, fontWeight: 700,
      padding: '3px 8px', borderRadius: 999, letterSpacing: '0.04em',
      textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      {tone === 'high' ? <AlertTriangle size={11} /> : null}{c.label}
    </span>
  );
};

const scoreColor = (s: number) => s >= 80 ? '#16A34A' : s >= 60 ? '#CA8A04' : '#DC2626';

const ATSGuideTemplate = () => {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const row = slug ? getATSRow(slug) : undefined;
  if (!row) return (
    <div className="min-h-screen w-full" style={{ background: '#FFF', padding: '64px 24px' }}>
      <h1>ATS page not found</h1><p>Slug: {slug || '(none)'}</p>
    </div>
  );

  const firm = row.firmSlug ? getFirm(row.firmSlug) : undefined;
  const role = row.roleSlug ? getRole(row.roleSlug) : undefined;

  // Compute hero / problem copy per variant
  const h1 = row.variant === 'generic'
    ? <>What is an applicant tracking system <span style={{ color: BRAND }}>(ATS)</span>, and how do you beat it?</>
    : row.variant === 'by-firm' && firm
    ? <>How to beat the <span style={{ color: BRAND }}>{firm.ats} ATS</span> at {firm.shortName}</>
    : row.variant === 'by-role' && role
    ? <>ATS keywords for a <span style={{ color: BRAND }}>{role.shortName}</span> resume</>
    : 'ATS Guide';

  const eyebrow = row.variant === 'generic'
    ? 'ATS GUIDE'
    : row.variant === 'by-firm' && firm
    ? `${firm.ats.toUpperCase()} ATS · ${firm.name.toUpperCase()}`
    : row.variant === 'by-role' && role
    ? `ATS KEYWORDS · ${role.shortName.toUpperCase()}`
    : 'ATS GUIDE';

  const subhead = row.variant === 'generic'
    ? 'The 2026 guide to the software that filters 75% of resumes before a human reads them, with the format and keyword rules to get past it.'
    : row.variant === 'by-firm' && firm
    ? `The format, keyword, and structure rules that get past ${firm.shortName}'s ${firm.ats} setup, plus a free resume review tailored to any ${firm.shortName} JD.`
    : row.variant === 'by-role' && role
    ? `The exact ATS keywords for ${role.name.toLowerCase()} resumes in 2026, organized by category. Free resume scoring widget tailored to any JD.`
    : '';

  const problemHeading = row.variant === 'by-firm' && firm
    ? `Your resume meets ${firm.shortName}'s bot before it meets the recruiter.`
    : 'Your resume meets a bot before it meets a recruiter.';

  const problemBody = row.variant === 'by-firm' && firm
    ? `${firm.name} runs every application through ${firm.ats}, which scores resumes against the JD for keyword match, format, and section structure before any human sees them. The bot reads top-to-bottom, maps your text into structured fields, and scores. The way to "beat" it is to be one of the resumes the recruiter's filter surfaces, which means matching the JD keywords precisely and being parseable as structured data. The widget above runs that scoring on your resume against any ${firm.shortName} JD, in 30 seconds.`
    : 'Around 90% of large employers use applicant tracking systems to parse, score, and rank resumes before any human reads them. The bot reads top-to-bottom, maps your text into structured fields, and scores against the job description. The way to "beat" the bot is to be one of the resumes the recruiter\'s filter surfaces, which means matching the JD\'s keywords precisely and being parseable as structured data. The widget above runs that scoring on your resume against the JD you paste, in 30 seconds.';

  const checksHeading = row.variant === 'by-firm' && firm
    ? `What the widget checks for a ${firm.shortName} JD`
    : row.variant === 'by-role' && role
    ? `${role.shortName} ATS keyword categories the widget checks`
    : 'What the widget checks';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Article',
        headline: row.variant === 'generic'
          ? 'What Is an Applicant Tracking System (ATS)? Complete 2026 Guide + Free Resume Review'
          : row.variant === 'by-firm' && firm
          ? `How to Beat ${firm.name}'s ${firm.ats} ATS (2026 Guide)`
          : `ATS Keywords for ${role?.name || 'This Role'} Resumes (2026)`,
        datePublished: row.updatedAt, dateModified: row.updatedAt,
        author: { '@type': 'Organization', name: 'Offerloop' },
        publisher: { '@type': 'Organization', name: 'Offerloop' },
        description: row.metaDescription },
      { '@type': 'FAQPage', mainEntity: row.faq.map((f) => ({
          '@type': 'Question', name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
      { '@type': 'WebApplication', name: 'Offerloop Free Resume Review',
        applicationCategory: 'BusinessApplication', operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } },
    ],
  };

  const cluster = firm?.industry || (role?.industry as 'banking' | 'consulting' | 'tech' | undefined) || 'student';

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>
          {row.variant === 'generic'
            ? 'What Is an Applicant Tracking System (ATS)? Complete 2026 Guide + Free Resume Review | Offerloop'
            : row.variant === 'by-firm' && firm
            ? `${firm.name}'s ${firm.ats} ATS: How to Beat It (2026 Guide) | Offerloop`
            : `ATS Keywords for ${role?.name} Resumes (2026) | Offerloop`}
        </title>
        <meta name="robots" content={row.published && location.pathname.startsWith('/ats/') ? 'index,follow' : 'noindex'} />
        <link rel="canonical" href={`https://www.offerloop.ai/${row.published && location.pathname.startsWith('/ats/') ? 'ats' : 'seo-preview/ats'}/${row.slug}`} />
        <meta name="description" content={row.metaDescription} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <PreviewNav />

      <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid #F1F5F9' }}>
        <div style={gridLayer('rgba(15,23,42,0.045)', 'radial-gradient(ellipse 75% 70% at 50% 0%, #000 30%, transparent 75%)')} />
        <div className="px-6 pt-14 pb-10 text-center" style={{ maxWidth: 880, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <span className="inline-flex items-center gap-1.5 mb-5" style={{ background: '#EFF5FF', border: '1px solid #DBEAFE', color: BRAND_DARK, fontSize: 12.5, fontWeight: 600, padding: '5px 12px', borderRadius: 999 }}>
            <Bot className="w-3.5 h-3.5" /> {eyebrow} · UPDATED {new Date(row.updatedAt).toLocaleString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()}
          </span>
          <h1 style={{ fontFamily: serif, fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.03em', color: INK, marginBottom: 14, fontSize: 'clamp(34px, 4.6vw, 52px)' }}>{h1}</h1>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: '#64748B', maxWidth: 680, margin: '0 auto 6px' }}>{subhead}</p>
          <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>
            Updated {new Date(row.updatedAt).toLocaleString('en-US', { month: 'long', year: 'numeric' })}<span style={{ marginLeft: 8 }}>·</span><span style={{ marginLeft: 8 }}>9 min read</span>
          </p>
        </div>

        <div className="px-6" style={{ maxWidth: 820, margin: '0 auto 36px', position: 'relative', zIndex: 1 }}>
          <div style={{ background: '#F0F7FF', borderLeft: `3px solid ${BRAND}`, borderRadius: 6, padding: '18px 22px' }}>
            <div style={{ ...kicker, marginBottom: 6, color: BRAND_DARK }}>QUICK ANSWER</div>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: INK, margin: 0 }}>{row.quickAnswer}</p>
          </div>
        </div>
      </section>

      <section className="px-6 pt-10 pb-6" style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 18, textAlign: 'center' }}>
          <span style={{ ...kicker, display: 'inline-block' }}>SEE THE OUTPUT, THEN SCORE YOUR OWN</span>
        </div>
        <ResumeReviewWidget
          source={`seo-preview-ats-${row.slug}`}
          eyebrow="" heading="" subhead=""
          examplePanel={<ExamplePanel row={row} />}
        />
      </section>

      <StatStrip heading="ATS BY THE NUMBERS" stats={row.statStrip} />

      <ProblemSection heading={problemHeading}>{problemBody}</ProblemSection>

      <section className="px-6 py-14" style={{ maxWidth: 820, margin: '0 auto', background: '#FAFBFF', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9' }}>
        <h2 style={h2Style}>{checksHeading}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 18 }}>
          {row.uniqueDataBlock.map((b) => (
            <div key={b.title} className="rounded-[4px]" style={{ background: '#fff', border: '1px solid #E2E8F0', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <BadgeCheck className="w-4 h-4" style={{ color: BRAND }} />
                <p style={{ fontSize: 14, fontWeight: 700, color: INK, margin: 0 }}>{b.title}</p>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.55, color: '#64748B', margin: 0 }}>{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      <HowItWorks
        heading="How the free review works"
        steps={[
          { Icon: Upload, t: 'Upload your resume', d: 'DOCX or text-selectable PDF only. Image-based PDFs cannot be read by any ATS. 10MB max.' },
          { Icon: Target, t: 'Paste the job description', d: 'Full JD text or the URL of the posting. The score is tailored to that exact JD.' },
          { Icon: Lightbulb, t: 'Apply the rewrites', d: 'Critical and Notable edits are grouped by severity. Each shows the original, the rewrite, and which keyword or formatting rule it fixes.' },
          { Icon: Download, t: 'Download the new PDF', d: 'The preview rebuilds your resume live as you accept edits. Single-column, Workday-safe, ready to submit.' },
        ]}
      />

      <InlineEmailCapture
        eyebrow="NOT APPLYING YET?"
        heading="Get the weekly ATS-keyword drop"
        subtext="Every Monday: the specific ATS keywords showing up in newly posted JDs at Goldman, McKinsey, Google, and 20 other firms. Free, no spam."
        buttonText="Send me the keyword drop"
        cluster={cluster}
      />

      <FAQ items={row.faq} />

      <PreviewCTA
        eyebrow="WHEN YOU ARE READY FOR THE FULL TOOLKIT"
        headline="Score your resume, then reach the alum who already got in"
        subhead="Once your ATS score clears 80, Offerloop helps you find a USC, NYU, Michigan, or UPenn alum at the firm you applied to, drafts the cold email, and tracks the reply."
        buttonText="Create your free Offerloop account"
        to="/signin?mode=signup"
        footnote="Free tier: 3 contacts per search, 2 interview preps, no credit card."
      />

      <ExitIntentCapture
        eyebrow="BEFORE YOU GO"
        heading="The weekly ATS keyword drop"
        subtext="ATS keywords from newly posted JDs at top firms. Free, no spam."
        buttonText="Send me the keyword drop"
        cluster={cluster}
      />

      <PreviewFooter />
    </div>
  );
};

export default ATSGuideTemplate;
