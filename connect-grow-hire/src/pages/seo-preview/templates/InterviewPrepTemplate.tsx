/*
 * Interview Prep template. Renders any row from seo/data/interview-prep.ts.
 * Mounted at /seo-preview/interview-prep/:slug via the dynamic route.
 */
import { Helmet } from 'react-helmet-async';
import { useParams } from 'react-router-dom';
import {
  Target, Download, FileText, BadgeCheck, Bot, ClipboardPaste, TrendingUp,
  Lightbulb, Calculator, MessageCircleQuestion, CalendarDays, Users,
} from 'lucide-react';
import {
  BRAND, BRAND_DARK, INK, kicker, serif,
  PreviewNav, PreviewFooter,
  HowItWorks, FAQ, PreviewCTA, StatStrip,
  InlineEmailCapture, ExitIntentCapture, h2Style, pStyle, gridLayer,
} from '../_shared';
import { InterviewPrepWidget } from '../../../components/widgets/InterviewPrepWidget';
import { getInterviewPrepRow } from '../../../seo/data/interview-prep';
import { getFirm } from '../../../seo/data/firms';
import { getRole } from '../../../seo/data/roles';
import type { InterviewPrepRow } from '../../../seo/data/types';

const cardShell: React.CSSProperties = {
  background: '#FFF', border: '1px solid #E2E8F0', borderRadius: 14,
  padding: 18, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', boxSizing: 'border-box',
};

const PreviewCard = ({
  icon, kickerText, title, body,
}: { icon: React.ReactNode; kickerText: string; title: string; body: React.ReactNode }) => (
  <div style={{ ...cardShell, marginTop: 14, borderColor: '#DBEAFE' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      {icon}
      <span style={{ fontSize: 11, fontWeight: 700, color: BRAND_DARK, letterSpacing: '0.05em' }}>{kickerText}</span>
    </div>
    <h4 style={{ fontFamily: serif, fontSize: 17, fontWeight: 400, color: INK, margin: '0 0 12px 0', lineHeight: 1.3 }}>{title}</h4>
    {body}
  </div>
);

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

const ExamplePanel = ({ row, firmName, firmShortName, roleName }: { row: InterviewPrepRow; firmName: string; firmShortName: string; roleName: string }) => (
  <div style={{ width: '100%' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ ...kicker, display: 'inline-block' }}>EXAMPLE OUTPUT</span>
      <span style={{ fontSize: 12, color: '#94A3B8' }}>fictional student, {firmShortName} {roleName.toLowerCase()}</span>
    </div>

    <div style={cardShell}>
      <p style={{ fontSize: 12.5, fontWeight: 700, color: BRAND_DARK, letterSpacing: '0.05em', margin: 0, marginBottom: 8 }}>READY</p>
      <h3 style={{ fontFamily: serif, fontSize: 26, fontWeight: 400, color: INK, margin: 0, marginBottom: 6 }}>Your interview prep is ready</h3>
      <p style={{ fontSize: 14, color: '#475569', marginTop: 0, marginBottom: 18 }}>{roleName} at {firmName}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button disabled style={primaryBtn}><Download size={16} /> Download PDF</button>
        <button disabled style={ghostBtn}>Try another posting</button>
      </div>
      <div style={{ marginTop: 18, padding: '12px 14px', background: '#F0F7FF', border: '1px solid #DBEAFE', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <FileText size={14} style={{ color: BRAND_DARK }} />
        <span style={{ fontSize: 12.5, color: BRAND_DARK, fontWeight: 600 }}>17-page PDF</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#475569' }}>process · 4 questions · behavioral · drill · intel · 48-hr plan</span>
      </div>
    </div>

    <div style={{ marginTop: 18, marginBottom: 10 }}>
      <p style={{ ...kicker, marginBottom: 0 }}>WHAT IS IN THE PDF</p>
    </div>

    {/* Section 1: Interview Process */}
    <PreviewCard
      icon={<Users size={14} style={{ color: BRAND }} />}
      kickerText="SECTION 1 OF 7 · INTERVIEW PROCESS"
      title={`The ${firmShortName} ${roleName} round, end-to-end`}
      body={
        <>
          <p style={{ ...previewPara, marginBottom: 12 }}>
            <strong>Timeline:</strong> {row.process.timeline}
          </p>
          {row.process.rounds.map((r, i) => (
            <RoundRow key={i} name={r.name} format={r.format} evaluate={r.evaluate} noBorder={i === row.process.rounds.length - 1} />
          ))}
        </>
      }
    />

    {/* Section 2: Sample question/case */}
    <PreviewCard
      icon={<Target size={14} style={{ color: BRAND }} />}
      kickerText={`SECTION 2 OF 7 · ${row.sampleCase.kicker}`}
      title={row.sampleCase.title}
      body={<p style={{ ...previewPara, margin: 0 }}>{row.sampleCase.body}</p>}
    />

    {/* Section 3: Sample behavioral */}
    <PreviewCard
      icon={<ClipboardPaste size={14} style={{ color: BRAND }} />}
      kickerText={`SECTION 3 OF 7 · ${row.sampleBehavioral.kicker}`}
      title={row.sampleBehavioral.question}
      body={<p style={{ ...previewPara, margin: 0 }}>{row.sampleBehavioral.body}</p>}
    />

    {/* Section 4: Drill */}
    <PreviewCard
      icon={<Calculator size={14} style={{ color: BRAND }} />}
      kickerText={`SECTION 4 OF 7 · ${row.drillSample.kicker}`}
      title={row.drillSample.title}
      body={<p style={{ ...previewPara, margin: 0 }}>{row.drillSample.body}</p>}
    />

    {/* Section 5: Firm intel */}
    <PreviewCard
      icon={<Lightbulb size={14} style={{ color: BRAND }} />}
      kickerText="SECTION 5 OF 7 · FIRM-SPECIFIC INTEL"
      title={`${firmShortName}: what is new, what to reference`}
      body={
        <ul style={{ ...previewPara, paddingLeft: 18, margin: 0 }}>
          {row.firmIntel.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      }
    />

    <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 12, textAlign: 'center' }}>
      Example output for a fictional student. Your real PDF is generated live from the {firmShortName} JD you paste.
    </p>
  </div>
);

const previewPara: React.CSSProperties = { fontSize: 13, lineHeight: 1.6, color: '#334155', margin: '0 0 8px 0' };
const primaryBtn: React.CSSProperties = {
  background: BRAND, color: '#FFF', border: 'none', borderRadius: 8,
  padding: '11px 16px', fontSize: 14, fontWeight: 600, cursor: 'not-allowed',
  opacity: 0.95, display: 'inline-flex', alignItems: 'center', gap: 6,
};
const ghostBtn: React.CSSProperties = {
  background: '#FFF', color: INK, border: '1px solid #CBD5E1', borderRadius: 8,
  padding: '11px 16px', fontSize: 14, fontWeight: 500, cursor: 'not-allowed',
  opacity: 0.95, display: 'inline-flex', alignItems: 'center', gap: 6,
};

const InterviewPrepTemplate = () => {
  const { slug } = useParams<{ slug: string }>();
  const row = slug ? getInterviewPrepRow(slug) : undefined;
  if (!row) return <NotFound slug={slug} />;
  const firm = getFirm(row.firmSlug);
  const role = getRole(row.roleSlug);
  if (!firm || !role) return <Misconfigured firmSlug={row.firmSlug} roleSlug={row.roleSlug} />;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Article', headline: `${firm.name} ${role.name} Interview Prep (Free PDF, Tailored)`,
        datePublished: row.updatedAt, dateModified: row.updatedAt,
        author: { '@type': 'Organization', name: 'Offerloop' },
        publisher: { '@type': 'Organization', name: 'Offerloop' },
        description: row.metaDescription },
      { '@type': 'FAQPage', mainEntity: row.faq.map((f) => ({
          '@type': 'Question', name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
      { '@type': 'WebApplication', name: 'Offerloop Free Interview Prep',
        applicationCategory: 'BusinessApplication', operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } },
    ],
  };

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>{firm.name} {role.shortName} Interview Prep (Free, Tailored) | Offerloop</title>
        <meta name="robots" content="noindex" />
        <meta name="description" content={row.metaDescription} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <PreviewNav />

      <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid #F1F5F9' }}>
        <div style={gridLayer('rgba(15,23,42,0.045)', 'radial-gradient(ellipse 75% 70% at 50% 0%, #000 30%, transparent 75%)')} />
        <div className="px-6 pt-14 pb-10 text-center" style={{ maxWidth: 880, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <span className="inline-flex items-center gap-1.5 mb-5" style={{ background: '#EFF5FF', border: '1px solid #DBEAFE', color: BRAND_DARK, fontSize: 12.5, fontWeight: 600, padding: '5px 12px', borderRadius: 999 }}>
            <Bot className="w-3.5 h-3.5" /> INTERVIEW PREP · {firm.name.toUpperCase()} {role.shortName.toUpperCase()}
          </span>
          <h1 style={{ fontFamily: serif, fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.03em', color: INK, marginBottom: 14, fontSize: 'clamp(34px, 4.6vw, 52px)' }}>
            Prep for the <span style={{ color: BRAND }}>{firm.shortName} {role.shortName}</span> interview in 90 seconds.
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: '#64748B', maxWidth: 680, margin: '0 auto 6px' }}>
            A tailored PDF with round breakdown, question patterns, behavioral stories, and firm-specific intel, generated from the actual {firm.shortName} posting you paste.
          </p>
          <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>
            Updated {new Date(row.updatedAt).toLocaleString('en-US', { month: 'long', year: 'numeric' })}<span style={{ marginLeft: 8 }}>·</span><span style={{ marginLeft: 8 }}>8 min read</span>
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
          <span style={{ ...kicker, display: 'inline-block' }}>SEE WHAT THE PDF CONTAINS, THEN GENERATE YOUR OWN</span>
        </div>
        <InterviewPrepWidget
          source={`seo-preview-interview-prep-${row.slug}`}
          examplePanel={<ExamplePanel row={row} firmName={firm.name} firmShortName={firm.shortName} roleName={role.name} />}
        />
      </section>

      <StatStrip
        heading={`${firm.name.toUpperCase()} ${role.shortName.toUpperCase()} INTERVIEW, BY THE NUMBERS`}
        stats={row.statStrip}
      />

      <section className="px-6 py-14" style={{ maxWidth: 820, margin: '0 auto' }}>
        <h2 style={h2Style}>What is in the {firm.shortName} {role.shortName} prep PDF?</h2>
        <p style={pStyle}>
          A typical 14 to 18 page PDF tailored to the {firm.shortName} JD you paste. Seven sections: full
          round-by-round process breakdown, 3 to 6 question patterns or case frameworks, 9 behavioral stories
          drafted from your resume, a drill bank (math or coding or technical), firm-specific intel including
          recent practice news and named alumni, 20 to 30 specific questions to ask each interviewer, and a
          48-hour study plan.
        </p>
      </section>

      <HowItWorks
        heading="How the prep generator works"
        steps={[
          { Icon: ClipboardPaste, t: `Paste the ${firm.shortName} posting`, d: `JD text or URL. Include the office and round if you have it.` },
          { Icon: TrendingUp, t: 'The widget runs live research', d: 'Pulls question patterns from Glassdoor and Reddit, scrapes the JD for office signals, aggregates current-cycle behavioral questions. 60 to 90 seconds.' },
          { Icon: FileText, t: 'Download the prep PDF', d: '14 to 18 pages, tailored to the role and round. Print-ready and structured for offline study.' },
          { Icon: Target, t: 'Drill against the banks', d: `Use the question bank with a peer or ChatGPT for structuring reps; use the behavioral stories for live mocks.` },
        ]}
      />

      <InlineEmailCapture
        eyebrow="NOT INTERVIEWING YET?"
        heading={`Get the weekly ${firm.industry} interview drop`}
        subtext={`Every Monday: new question patterns appearing in ${firm.shortName} and peer-firm rounds, behavioral question drops, and firm-specific intel.`}
        buttonText="Send me the drop"
        cluster={firm.industry}
      />

      <FAQ items={row.faq} />

      <PreviewCTA
        eyebrow="WHEN YOU ARE READY FOR THE FULL TOOLKIT"
        headline={`Prep generated, then reach a ${firm.shortName} alum the same session`}
        subhead={`Once your prep PDF is downloaded, Offerloop helps you find a USC, NYU, Michigan, or UPenn alum at ${firm.shortName}, drafts the cold email, and tracks the reply, all in the same workflow.`}
        buttonText="Create your free Offerloop account"
        to="/signin?mode=signup"
        footnote="Free tier: 3 contacts per search, 2 interview preps, no credit card."
      />

      <ExitIntentCapture
        eyebrow="BEFORE YOU GO"
        heading={`The weekly ${firm.industry} drop`}
        subtext={`New question patterns, behavioral angles, and firm-specific intel from ${firm.shortName} and peer firms. Free, no spam.`}
        buttonText="Send me the drop"
        cluster={firm.industry}
      />

      <PreviewFooter />
    </div>
  );
};

const NotFound = ({ slug }: { slug?: string }) => (
  <div className="min-h-screen w-full" style={{ background: '#FFF', padding: '64px 24px' }}>
    <h1>Interview prep page not found</h1><p>Slug: {slug || '(none)'}</p>
  </div>
);
const Misconfigured = ({ firmSlug, roleSlug }: { firmSlug: string; roleSlug: string }) => (
  <div className="min-h-screen w-full" style={{ background: '#FFF', padding: '64px 24px' }}>
    <h1>Interview prep page misconfigured</h1>
    <p>Missing firm ({firmSlug}) or role ({roleSlug}) registry entry.</p>
  </div>
);

export default InterviewPrepTemplate;
