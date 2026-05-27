/*
 * Cover Letter template. Renders any row from seo/data/cover-letter.ts.
 * Mounted at /seo-preview/cover-letter/:slug via the dynamic route.
 */
import { Helmet } from 'react-helmet-async';
import { useParams } from 'react-router-dom';
import {
  Upload, Target, PenLine, Download, Copy, RefreshCw, BadgeCheck,
} from 'lucide-react';
import {
  BRAND, BRAND_DARK, INK, kicker, serif,
  PreviewNav, PreviewFooter,
  HowItWorks, FAQ, PreviewCTA,
  InlineEmailCapture, ExitIntentCapture, h2Style, pStyle, gridLayer,
} from '../_shared';
import { CoverLetterWidget } from '../../../components/widgets/CoverLetterWidget';
import { getCoverLetterRow } from '../../../seo/data/cover-letter';
import { getFirm } from '../../../seo/data/firms';
import { getRole } from '../../../seo/data/roles';
import type { CoverLetterRow } from '../../../seo/data/types';

const cardShell: React.CSSProperties = {
  background: '#FFF', border: '1px solid #E2E8F0', borderRadius: 14,
  padding: 18, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', boxSizing: 'border-box',
};

const ExamplePanel = ({ row, firmName, firmShortName, roleName }: { row: CoverLetterRow; firmName: string; firmShortName: string; roleName: string }) => (
  <div style={{ width: '100%' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ ...kicker, display: 'inline-block' }}>EXAMPLE OUTPUT</span>
      <span style={{ fontSize: 12, color: '#94A3B8' }}>{row.examplePanel.studentBlurb}</span>
    </div>

    <div style={cardShell}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND, letterSpacing: '0.06em' }}>READY</div>
          <h3 style={{ fontFamily: serif, fontSize: 28, fontWeight: 400, color: INK, margin: '4px 0 0 0' }}>Your cover letter</h3>
          <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
            {roleName} at {firmName}{row.examplePanel.location ? `, ${row.examplePanel.location}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button disabled style={ghostBtn}><RefreshCw size={14} /> Regenerate</button>
          <button disabled style={ghostBtn}><Copy size={14} /> Copy text</button>
          <button disabled style={primaryBtn}><Download size={16} /> Download PDF</button>
        </div>
      </div>
    </div>

    <div style={{ ...cardShell, marginTop: 14, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '22px 26px', background: '#FAFBFF', borderBottom: '1px solid #E2E8F0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PenLine size={14} style={{ color: BRAND }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: INK, letterSpacing: '0.04em' }}>COVER LETTER</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#15803D', background: '#DCFCE7', borderRadius: 999, padding: '3px 10px' }}>
            {row.examplePanel.wordCount} WORDS · {row.examplePanel.paragraphs.length - 1} PARAGRAPHS
          </span>
        </div>
      </div>
      <div style={{ padding: '24px 28px', fontSize: 13.5, lineHeight: 1.7, color: INK, background: '#FFF' }}>
        {row.examplePanel.paragraphs.map((p, i) => (
          <p key={i} style={{ margin: i === row.examplePanel.paragraphs.length - 1 ? '0' : '0 0 12px 0', whiteSpace: 'pre-line' }}>{p}</p>
        ))}
      </div>
    </div>

    <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 12, textAlign: 'center' }}>
      Example output for a fictional student. Your real letter is written from your own resume and the {firmShortName} JD you paste.
    </p>
  </div>
);

const primaryBtn: React.CSSProperties = {
  background: BRAND, color: '#FFF', border: 'none', borderRadius: 8,
  padding: '10px 14px', fontSize: 13, fontWeight: 600, cursor: 'not-allowed',
  opacity: 0.95, display: 'inline-flex', alignItems: 'center', gap: 6,
};
const ghostBtn: React.CSSProperties = {
  background: '#FFF', color: INK, border: '1px solid #CBD5E1', borderRadius: 8,
  padding: '10px 14px', fontSize: 13, fontWeight: 500, cursor: 'not-allowed',
  opacity: 0.95, display: 'inline-flex', alignItems: 'center', gap: 6,
};

const CoverLetterTemplate = () => {
  const { slug } = useParams<{ slug: string }>();
  const row = slug ? getCoverLetterRow(slug) : undefined;
  if (!row) return <NotFound slug={slug} />;
  const firm = getFirm(row.firmSlug);
  const role = getRole(row.roleSlug);
  if (!firm || !role) return <Misconfigured firmSlug={row.firmSlug} roleSlug={row.roleSlug} />;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Article', headline: `${firm.name} ${role.name} Cover Letter (Free, Tailored, Downloadable)`,
        datePublished: row.updatedAt, dateModified: row.updatedAt,
        author: { '@type': 'Organization', name: 'Offerloop' },
        publisher: { '@type': 'Organization', name: 'Offerloop' },
        description: row.metaDescription },
      { '@type': 'FAQPage', mainEntity: row.faq.map((f) => ({
          '@type': 'Question', name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
      { '@type': 'WebApplication', name: 'Offerloop Free Cover Letter Writer',
        applicationCategory: 'BusinessApplication', operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } },
    ],
  };

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>{firm.name} {role.shortName} Cover Letter (Free, Tailored, Downloadable) | Offerloop</title>
        <meta name="robots" content="noindex" />
        <meta name="description" content={row.metaDescription} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <PreviewNav />

      <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid #F1F5F9' }}>
        <div style={gridLayer('rgba(15,23,42,0.045)', 'radial-gradient(ellipse 75% 70% at 50% 0%, #000 30%, transparent 75%)')} />
        <div className="px-6 pt-14 pb-10 text-center" style={{ maxWidth: 880, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <span className="inline-flex items-center gap-1.5 mb-5" style={{ background: '#EFF5FF', border: '1px solid #DBEAFE', color: BRAND_DARK, fontSize: 12.5, fontWeight: 600, padding: '5px 12px', borderRadius: 999 }}>
            <PenLine className="w-3.5 h-3.5" /> COVER LETTER · {firm.name.toUpperCase()} {role.shortName.toUpperCase()}
          </span>
          <h1 style={{ fontFamily: serif, fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.03em', color: INK, marginBottom: 14, fontSize: 'clamp(34px, 4.6vw, 52px)' }}>
            Write your <span style={{ color: BRAND }}>{firm.shortName} {role.shortName}</span> cover letter in 45 seconds.
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: '#64748B', maxWidth: 680, margin: '0 auto 6px' }}>
            Free, tailored to your resume and the actual {firm.shortName} posting, in the format {firm.shortName} recruiters expect.
          </p>
          <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>
            Updated {new Date(row.updatedAt).toLocaleString('en-US', { month: 'long', year: 'numeric' })}<span style={{ marginLeft: 8 }}>·</span><span style={{ marginLeft: 8 }}>7 min read</span>
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
          <span style={{ ...kicker, display: 'inline-block' }}>SEE THE OUTPUT, THEN WRITE YOUR OWN</span>
        </div>
        <CoverLetterWidget
          source={`seo-preview-cover-letter-${row.slug}`}
          eyebrow="" heading="" subhead=""
          examplePanel={<ExamplePanel row={row} firmName={firm.name} firmShortName={firm.shortName} roleName={role.name} />}
        />
      </section>

      <section className="px-6 py-14" style={{ maxWidth: 820, margin: '0 auto', background: '#FAFBFF', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9' }}>
        <h2 style={h2Style}>What the widget checks for a {firm.shortName} {role.shortName} JD</h2>
        <p style={pStyle}>
          The flags tuned to {firm.shortName}\'s letter format. These are the checks that drive the rewrites
          for a {firm.name} {role.name.toLowerCase()} application specifically.
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
        heading="How the cover letter writer works"
        steps={[
          { Icon: Upload, t: 'Upload your resume', d: 'PDF or DOCX. The widget reads your resume to pull specific bullets it can reference in the letter.' },
          { Icon: Target, t: `Paste the ${firm.shortName} JD`, d: `Either the JD text or the URL of the posting on ${firm.applicationDomain || firm.shortName}.` },
          { Icon: PenLine, t: 'Pick a tone', d: 'Professional, conversational, or enthusiastic. For most banking and consulting roles, default to professional.' },
          { Icon: Download, t: 'Edit and download', d: 'The letter renders in an editable text area on the left, with a live PDF preview on the right.' },
        ]}
      />

      <InlineEmailCapture
        eyebrow="NOT APPLYING YET?"
        heading={`Get the weekly ${firm.industry} digest`}
        subtext={`Every Monday: new cover letter angles for ${firm.shortName} and peer firms, deadline changes, and the specific phrasing that lifted response rates last week.`}
        buttonText="Send me the digest"
        cluster={firm.industry}
      />

      <FAQ items={row.faq} />

      <PreviewCTA
        eyebrow="WHEN YOU ARE READY FOR THE FULL TOOLKIT"
        headline={`Cover letter sent, then reach a ${firm.shortName} alum the same session`}
        subhead={`Once your letter is downloaded, Offerloop helps you find a USC, NYU, Michigan, or UPenn alum at ${firm.shortName}, drafts the cold email, and tracks the reply.`}
        buttonText="Create your free Offerloop account"
        to="/signin?mode=signup"
        footnote="Free tier: 3 contacts per search, 2 interview preps, no credit card."
      />

      <ExitIntentCapture
        eyebrow="BEFORE YOU GO"
        heading={`The weekly ${firm.industry} digest`}
        subtext={`New cover letter angles, deadline changes, and what is working at ${firm.shortName} this week. Free, no spam.`}
        buttonText="Send me the digest"
        cluster={firm.industry}
      />

      <PreviewFooter />
    </div>
  );
};

const NotFound = ({ slug }: { slug?: string }) => (
  <div className="min-h-screen w-full" style={{ background: '#FFF', padding: '64px 24px' }}>
    <h1>Cover letter page not found</h1><p>Slug: {slug || '(none)'}</p>
  </div>
);
const Misconfigured = ({ firmSlug, roleSlug }: { firmSlug: string; roleSlug: string }) => (
  <div className="min-h-screen w-full" style={{ background: '#FFF', padding: '64px 24px' }}>
    <h1>Cover letter page misconfigured</h1>
    <p>Missing firm ({firmSlug}) or role ({roleSlug}) registry entry.</p>
  </div>
);

export default CoverLetterTemplate;
