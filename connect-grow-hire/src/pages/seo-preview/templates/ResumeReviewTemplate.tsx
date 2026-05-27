/*
 * Resume Review template.
 * Renders any row from seo/data/resume-review.ts. Mounted at
 * /seo-preview/resume-review/:slug via the dynamic route in App.tsx.
 *
 * Shape is identical to the hand-built ResumeReviewGoldmanIBPreview but
 * driven by the row's data. Reads the firm and role from registries.
 *
 * House style: no em dashes, no sparkle icons.
 */
import { Helmet } from 'react-helmet-async';
import { useParams } from 'react-router-dom';
import {
  FileText, Upload, Target, BadgeCheck, Lightbulb, Download,
  AlertTriangle, Check, TrendingUp,
} from 'lucide-react';
import {
  BRAND, BRAND_DARK, INK, kicker, serif,
  PreviewNav, PreviewFooter, PreviewHero,
  ProblemSection, StatStrip, HowItWorks, FAQ, PreviewCTA,
  InlineEmailCapture, ExitIntentCapture, h2Style, pStyle,
} from '../_shared';
import { ResumeReviewWidget } from '../../../components/widgets/ResumeReviewWidget';
import { getResumeReviewRow } from '../../../seo/data/resume-review';
import { getFirm } from '../../../seo/data/firms';
import { getRole } from '../../../seo/data/roles';
import type { ResumeReviewRow, ExampleRec } from '../../../seo/data/types';

// ──────────────────────────────────────────────────────────────────────────
// Example panel renderer (firm/role-tailored from the row)
// ──────────────────────────────────────────────────────────────────────────

const ExamplePanel = ({ row, firmShortName }: { row: ResumeReviewRow; firmShortName: string }) => (
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
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>vs the {firmShortName} JD you pasted</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, padding: '3px 9px', borderRadius: 999, background: '#DCFCE7', color: '#166534', fontSize: 11, fontWeight: 700 }}>
            <TrendingUp size={11} /> +{row.examplePanel.score - row.examplePanel.previousScore} from {row.examplePanel.previousScore} before edits
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
          <Download size={14} /> Download new PDF ({row.examplePanel.rewriteCount})
        </button>
      </div>
    </div>

    {/* Group recommendations by severity */}
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
      Example output for a fictional student. Your real review uses your own resume and the JD you paste.
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
    <div style={{ fontSize: 13, color: '#94A3B8', textDecoration: 'line-through', marginBottom: 6, lineHeight: 1.5 }}>
      {rec.original}
    </div>
    <div style={{ fontSize: 13.5, color: INK, fontWeight: 500, lineHeight: 1.5 }}>
      {rec.suggested}
    </div>
    <div style={{ fontSize: 12, color: '#475569', marginTop: 8, lineHeight: 1.5, fontStyle: 'italic' }}>
      Why: {rec.why}
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
    <span style={{
      background: colors.bg, color: colors.fg, fontSize: 11, fontWeight: 700,
      padding: '3px 8px', borderRadius: 999, letterSpacing: '0.04em',
      textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      {tone === 'high' ? <AlertTriangle size={11} /> : null}
      {colors.label}
    </span>
  );
};

const scoreColor = (s: number) => s >= 80 ? '#16A34A' : s >= 60 ? '#CA8A04' : '#DC2626';

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

// ──────────────────────────────────────────────────────────────────────────
// Main template
// ──────────────────────────────────────────────────────────────────────────

const ResumeReviewTemplate = () => {
  const { slug } = useParams<{ slug: string }>();
  const row = slug ? getResumeReviewRow(slug) : undefined;

  if (!row) {
    return (
      <div className="min-h-screen w-full" style={{ background: '#FFF', padding: '64px 24px' }}>
        <h1>Resume review page not found</h1>
        <p>Slug: {slug || '(none)'}</p>
      </div>
    );
  }

  const firm = getFirm(row.firmSlug);
  const role = getRole(row.roleSlug);
  if (!firm || !role) {
    return (
      <div className="min-h-screen w-full" style={{ background: '#FFF', padding: '64px 24px' }}>
        <h1>Resume review page misconfigured</h1>
        <p>Missing firm ({row.firmSlug}) or role ({row.roleSlug}) registry entry.</p>
      </div>
    );
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        'headline': `${firm.name} ${role.name} Resume Review (Free, Tailored to the JD)`,
        'datePublished': row.updatedAt,
        'dateModified': row.updatedAt,
        'author': { '@type': 'Organization', 'name': 'Offerloop' },
        'publisher': { '@type': 'Organization', 'name': 'Offerloop' },
        'description': row.metaDescription,
      },
      {
        '@type': 'FAQPage',
        'mainEntity': row.faq.map((f) => ({
          '@type': 'Question', 'name': f.q,
          'acceptedAnswer': { '@type': 'Answer', 'text': f.a },
        })),
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

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>{firm.name} {role.shortName} Resume Review (Free, Tailored to the JD) | Offerloop</title>
        <meta name="robots" content="noindex" />
        <meta name="description" content={row.metaDescription} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <PreviewNav />

      <PreviewHero
        EyebrowIcon={FileText}
        eyebrow={`RESUME REVIEW · ${firm.name.toUpperCase()} ${role.shortName.toUpperCase()}`}
        line1={<>Make your resume <span style={{ color: BRAND }}>{firm.shortName}-ready</span></>}
        line2={`free, tailored to the actual ${firm.shortName} JD, in 30 seconds`}
        lead={`Drop your resume PDF and paste the ${firm.name} ${role.name} posting. Offerloop scores it against the JD, rewrites the bullets that read weakly, surfaces the keywords you are missing, and gives you a downloadable improved PDF. No account needed.`}
        chips={['Tailored to the JD', 'ATS score in 30 seconds', 'Downloadable PDF']}
      />

      <section className="px-6 pt-12 pb-6" style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 20, textAlign: 'center' }}>
          <span style={{ ...kicker, display: 'inline-block' }}>SEE THE OUTPUT, THEN SCORE YOUR OWN</span>
        </div>
        <ResumeReviewWidget
          source={`seo-preview-resume-review-${row.slug}`}
          eyebrow=""
          heading=""
          subhead=""
          examplePanel={<ExamplePanel row={row} firmShortName={firm.shortName} />}
        />
      </section>

      {/* Quick-Answer block per ranking-playbook.md */}
      <section className="px-6 pt-8" style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ background: '#F0F7FF', borderLeft: `3px solid ${BRAND}`, borderRadius: 6, padding: '18px 22px' }}>
          <div style={{ ...kicker, marginBottom: 6, color: BRAND_DARK }}>QUICK ANSWER</div>
          <p style={{ fontSize: 16, lineHeight: 1.65, color: INK, margin: 0 }}>{row.quickAnswer}</p>
        </div>
      </section>

      <ProblemSection heading={`Your resume meets a bot before it meets a ${firm.industry === 'banking' ? 'banker' : firm.industry === 'consulting' ? 'consulting recruiter' : 'recruiter'}.`}>
        {firm.name} runs every {role.shortName} application through {firm.ats}, which scores resumes against the JD
        for keyword match, format, and section structure before a single human reads them. A bullet that reads
        fine to a friend can score in the 40s against the actual JD because {firm.ats} matches exact phrases,
        models, and quantified outcomes the {role.name.toLowerCase()} posting expects. Don't let the bot cut you
        before the recruiter ever opens the file. The widget above runs that scoring on your PDF against the
        {' '}{firm.shortName} JD you paste, in 30 seconds.
      </ProblemSection>

      <StatStrip
        heading={`${firm.name.toUpperCase()} ${role.shortName.toUpperCase()} RESUMES, BY THE NUMBERS`}
        stats={row.statStrip}
      />

      {/* Unique-data block per ranking-playbook.md */}
      <section className="px-6 py-14" style={{ maxWidth: 820, margin: '0 auto', background: '#FAFBFF', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9' }}>
        <h2 style={h2Style}>What the widget checks for a {firm.shortName} {role.shortName} JD</h2>
        <p style={pStyle}>
          The flags that drive the score and the rewrites for a {firm.name} {role.name.toLowerCase()} application.
          Calibrated to what {firm.ats} matches against and what a {firm.shortName} recruiter looks for in the
          human pass that follows.
        </p>
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
        heading="How the review works"
        steps={[
          { Icon: Upload, t: 'Upload your resume', d: `Drop the PDF you would submit to ${firm.shortName}. 10MB max, text-based PDF only (${firm.ats} cannot parse images).` },
          { Icon: Target, t: `Paste the ${firm.shortName} JD`, d: `Either the full JD text or the URL of the posting on ${firm.applicationDomain || `${firm.shortName} careers`} / LinkedIn. The score is tailored to that exact JD.` },
          { Icon: Lightbulb, t: 'Review the line-by-line edits', d: 'Critical, notable, and polish edits are grouped by severity. Each shows the original bullet, the rewrite, and why the rewrite is stronger.' },
          { Icon: Download, t: 'Download your improved PDF', d: 'Click Apply on the rewrites you want. The right-side preview rebuilds the PDF live as you accept edits, ready to submit.' },
        ]}
      />

      <InlineEmailCapture
        eyebrow="NOT APPLYING YET?"
        heading={`Get the weekly ${firm.industry} digest`}
        subtext={`New ATS keyword drops for each ${firm.shortName} JD, deadline changes, and the specific resume mistakes that get cut in the first pass.`}
        buttonText="Send me the digest"
        cluster={firm.industry}
      />

      <FAQ items={row.faq} />

      <PreviewCTA
        eyebrow="WHEN YOU ARE READY FOR THE FULL TOOLKIT"
        headline={`Score your resume, then reach a ${firm.shortName} alum the same session`}
        subhead={`Once your resume scores 80+, Offerloop helps you find a USC, NYU, Michigan, or UPenn alum at ${firm.shortName}, drafts the cold email, and tracks the reply, all in the same workflow.`}
        buttonText="Create your free Offerloop account"
        to="/signin?mode=signup"
        footnote="Free tier: 3 contacts per search, 2 interview preps, no credit card."
      />

      <ExitIntentCapture
        eyebrow="BEFORE YOU GO"
        heading={`The weekly ${firm.industry} digest`}
        subtext={`Every Monday: ATS keyword drops, deadline changes, and the specific resume mistakes that get cut in the first pass at ${firm.shortName} and similar firms.`}
        buttonText="Send me the digest"
        cluster={firm.industry}
      />

      <PreviewFooter />
    </div>
  );
};

export default ResumeReviewTemplate;
