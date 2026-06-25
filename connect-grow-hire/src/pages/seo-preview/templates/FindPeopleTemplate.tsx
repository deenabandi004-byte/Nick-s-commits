/*
 * Find People template (cluster 5, school x firm). Renders any row from
 * seo/data/find-people.ts. Mounted at /seo-preview/find-people/:slug via the
 * dynamic route. Mirrors the hand-built FindPeopleUscGooglePreview, generalized
 * over the school x firm registry.
 *
 * House style: no em dashes, no sparkle icons.
 */
import { Helmet } from 'react-helmet-async';
import { useParams, useLocation } from 'react-router-dom';
import { BadgeCheck, GraduationCap, Linkedin, Search, Users } from 'lucide-react';
import {
  BRAND, BRAND_DARK, INK, kicker, serif,
  PreviewNav, PreviewFooter, HowItWorks, FAQ, PreviewCTA,
  InlineEmailCapture, ExitIntentCapture, StatStrip, h2Style, pStyle,
} from '../_shared';
import FindPeopleWidget from '../../../components/widgets/FindPeopleWidget';
import { getFindPeopleRow, getSchool } from '../../../seo/data/find-people';
import { LIVE_FIND_PEOPLE_SLUGS } from '../../../seo/data/find-people-live';
import { getFirm } from '../../../seo/data/firms';
import type { FindPeopleRow } from '../../../seo/data/types';

const ExamplePanel = ({ row, firmName }: { row: FindPeopleRow; firmName: string }) => (
  <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22, boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: BRAND_DARK, letterSpacing: '0.06em' }}>EXAMPLE OUTPUT</div>
    <h3 style={{ fontFamily: serif, fontSize: 22, fontWeight: 400, color: INK, margin: '4px 0 0 0' }}>
      {row.examplePeople.length} people at {firmName}
    </h3>
    {row.roleLabel && (
      <p style={{ fontSize: 12.5, color: '#64748B', marginTop: 4, marginBottom: 18 }}>Matching role: {row.roleLabel}</p>
    )}
    {row.examplePeople.map((p, i) => (
      <div key={i} style={{ borderTop: '1px solid #F1F5F9', paddingTop: 14, paddingBottom: i < row.examplePeople.length - 1 ? 14 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h4 style={{ fontFamily: serif, fontSize: 17, fontWeight: 400, color: INK, margin: 0 }}>{p.name}</h4>
            <p style={{ fontSize: 13, color: '#475569', margin: '4px 0 0 0' }}>
              <span style={{ fontWeight: 600 }}>{p.title}</span>
              <span style={{ color: '#94A3B8' }}> at </span>
              {firmName}
            </p>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: BRAND_DARK, background: '#EFF5FF', border: '1px solid #DBEAFE', borderRadius: 6, padding: '5px 9px' }}>
            <Linkedin size={13} /> LinkedIn
          </span>
        </div>
        <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#334155', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '4px 8px' }}>
          <GraduationCap size={12} style={{ color: BRAND_DARK }} /> {p.school}
        </div>
      </div>
    ))}
    <p style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 16 }}>
      Sample output for illustration. Your real search returns live, currently-employed profiles.
    </p>
  </div>
);

const FindPeopleTemplate = () => {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const row = slug ? getFindPeopleRow(slug) : undefined;
  if (!row) return <NotFound slug={slug} />;
  const firm = getFirm(row.firmSlug);
  const school = getSchool(row.schoolSlug);
  if (!firm || !school) return <Misconfigured schoolSlug={row.schoolSlug} firmSlug={row.firmSlug} />;
  // Only the approved first-batch cells are indexable, and only at the clean
  // /people/ prefix. The /seo-preview/ version of a live cell stays noindex and
  // canonicalizes to /people/ so there is no duplicate indexed URL.
  const isLive = LIVE_FIND_PEOPLE_SLUGS.has(row.slug);
  const onCleanPrefix = location.pathname.startsWith('/people/');
  const canonicalUrl = isLive
    ? `https://www.offerloop.ai/people/${row.slug}`
    : `https://www.offerloop.ai/seo-preview/find-people/${row.slug}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Article', headline: `Find 5 ${school.name} Alumni at ${firm.name} (Free People Search)`,
        datePublished: row.updatedAt, dateModified: row.updatedAt,
        author: { '@type': 'Organization', name: 'Offerloop' },
        publisher: { '@type': 'Organization', name: 'Offerloop' },
        description: row.metaDescription },
      { '@type': 'FAQPage', mainEntity: row.faq.map((f) => ({
          '@type': 'Question', name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
      { '@type': 'HowTo', name: `How to find ${school.name} alumni at ${firm.name}`,
        step: [
          { '@type': 'HowToStep', name: 'Type the company', text: `${firm.name}, or any firm with a real workforce.` },
          { '@type': 'HowToStep', name: 'Type the role', text: row.roleLabel || 'Any role you want to target.' },
          { '@type': 'HowToStep', name: 'Add your school', text: `${school.full_name} so alumni surface first.` },
          { '@type': 'HowToStep', name: 'Get 5 named profiles', text: 'Name, title, company, school, and LinkedIn URL.' },
        ] },
      { '@type': 'WebApplication', name: 'Offerloop Free People Finder',
        applicationCategory: 'BusinessApplication', operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } },
    ],
  };

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>Find 5 {school.name} Alumni at {firm.shortName} in Seconds (Free People Search) | Offerloop</title>
        <meta name="robots" content={isLive && onCleanPrefix ? 'index,follow' : 'noindex'} />
        <meta name="description" content={row.metaDescription} />
        <link rel="canonical" href={canonicalUrl} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <PreviewNav />

      <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid #F1F5F9' }}>
        <div style={{ position: 'absolute', top: '-260px', left: '50%', transform: 'translateX(-50%)', width: '1000px', height: '560px', zIndex: 0, pointerEvents: 'none', background: 'radial-gradient(circle, rgba(59,130,246,0.16), transparent 70%)' }} />
        <div className="px-6 pt-12 pb-10 text-center" style={{ maxWidth: '820px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <span className="inline-flex items-center gap-1.5 mb-5" style={{ background: '#EFF5FF', border: '1px solid #DBEAFE', color: BRAND_DARK, fontSize: '12.5px', fontWeight: 600, padding: '5px 12px', borderRadius: '999px' }}>
            <Users className="w-3.5 h-3.5" /> FREE TOOL · {school.name.toUpperCase()} AT {firm.shortName.toUpperCase()}
          </span>
          <h1 style={{ fontFamily: serif, fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.03em', color: INK, marginBottom: '16px' }}>
            <span style={{ display: 'block', fontSize: 'clamp(34px, 4.8vw, 54px)' }}>Find 5 {school.name} alumni at {firm.shortName}</span>
            <span style={{ display: 'block', fontSize: 'clamp(34px, 4.8vw, 54px)', color: BRAND, marginTop: '4px' }}>in 5 seconds, free.</span>
          </h1>
          <p style={{ fontSize: '17px', lineHeight: 1.6, color: '#64748B', maxWidth: '640px', margin: '0 auto' }}>
            Type a company and a role. We search 2.2 billion contacts and return 5 named {school.name} alumni at {firm.shortName} with their current title, school, and LinkedIn URL. No account, no credit card.
          </p>
        </div>
      </section>

      <section className="px-6 pt-10" style={{ maxWidth: '820px', margin: '0 auto' }}>
        <div className="rounded-[6px]" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '20px 22px' }}>
          <p style={{ ...kicker, marginBottom: '8px' }}>QUICK ANSWER</p>
          <p style={{ fontSize: '15px', lineHeight: 1.7, color: '#334155', margin: 0 }}>{row.quickAnswer}</p>
        </div>
      </section>

      <section className="px-6 py-12" style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <FindPeopleWidget
          source={`seo-preview-find-people-${row.slug}`}
          eyebrow="TRY IT NOW"
          heading="Type any company and role"
          subhead={`We'll return 5 real people with title, school, and LinkedIn URL.`}
          examplePanel={<ExamplePanel row={row} firmName={firm.name} />}
        />
      </section>

      <StatStrip heading={`${school.name.toUpperCase()} AT ${firm.shortName.toUpperCase()}, BY THE NUMBERS`} stats={row.statStrip} />

      {row.titleBreakdown && row.titleBreakdown.length > 0 && (
        <section className="px-6 py-10" style={{ maxWidth: 820, margin: '0 auto' }}>
          <h2 style={h2Style}>What {school.name} alumni actually do at {firm.shortName}</h2>
          <p style={pStyle}>
            The most common current roles among {school.name} alumni at {firm.name}, from a live
            sample of {row.sampleSize} profiles. This is the real distribution for this school and firm, not a generic list.
          </p>
          <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
            {row.titleBreakdown.map((t) => {
              const max = row.titleBreakdown![0].count || 1;
              const pct = Math.max(8, Math.round((t.count / max) * 100));
              return (
                <div key={t.title} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: '0 0 230px', fontSize: 13.5, color: INK, fontWeight: 600 }}>{t.title}</div>
                  <div style={{ flex: 1, background: '#F1F5F9', borderRadius: 6, height: 22 }}>
                    <div style={{ width: `${pct}%`, background: BRAND, height: '100%', borderRadius: 6 }} />
                  </div>
                  <div style={{ flex: '0 0 30px', fontSize: 13, color: '#475569', textAlign: 'right' }}>{t.count}</div>
                </div>
              );
            })}
          </div>
          {row.topFunctions && row.topFunctions.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <p style={{ ...kicker, marginBottom: 8 }}>FUNCTION MIX (SAMPLE)</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {row.topFunctions.map((s) => (
                  <span key={s.title} style={{ fontSize: 12.5, fontWeight: 600, color: BRAND_DARK, background: '#EFF5FF', border: '1px solid #DBEAFE', borderRadius: 999, padding: '4px 12px' }}>
                    {s.title}: {s.count}
                  </span>
                ))}
              </div>
            </div>
          )}
          {row.priorEmployers && row.priorEmployers.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <p style={{ ...kicker, marginBottom: 8 }}>WHERE THEY WORKED BEFORE {firm.shortName.toUpperCase()}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {row.priorEmployers.map((s) => (
                  <span key={s.name} style={{ fontSize: 12.5, fontWeight: 600, color: INK, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 999, padding: '4px 12px' }}>
                    {s.name}{s.count > 1 ? ` (${s.count})` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <HowItWorks
        heading="How the finder works under the hood"
        steps={[
          { Icon: Search, t: 'You type two fields', d: `Company name (${firm.name}) and a role (${row.roleLabel || 'any title'}). That is the entire query.` },
          { Icon: BadgeCheck, t: 'Live profile search', d: 'A 2.2 billion profile index returns people currently at that company in that role, with verified LinkedIn presence.' },
          { Icon: GraduationCap, t: 'School field surfaces alumni', d: `Add ${school.full_name} and the ${school.name} alumni come to the top, so you can lead with the warm connection.` },
          { Icon: Linkedin, t: 'You get a clean answer', d: '5 named profiles with LinkedIn URLs. Download as CSV or click through to start the outreach.' },
        ]}
      />

      <InlineEmailCapture
        eyebrow="NOT RECRUITING YET?"
        heading="Get the weekly recruiting digest"
        subtext={`Every Monday: new ${school.name} alumni hires at ${firm.shortName} and peer firms, fresh cold-email templates, and posting changes worth chasing.`}
        buttonText="Send me the digest"
        cluster="recruiting"
      />

      <FAQ items={row.faq} />

      <PreviewCTA
        eyebrow="FIVE NAMES IS A LEAD. A PIPELINE IS AN OFFER."
        headline={`Get unlimited ${firm.shortName} searches free for 7 days`}
        subhead={`Offerloop runs the same finder across every firm on your target list, returns Hunter-verified work emails, and ties each ${school.name} alum into your networking pipeline.`}
        buttonText="Create a free account"
        to="/onboarding"
        footnote="300 free credits to start. No card required."
      />

      <ExitIntentCapture
        eyebrow="BEFORE YOU GO"
        heading="The weekly recruiting digest"
        subtext={`New ${school.name} alumni hires at ${firm.shortName}, cold-email templates, and what is working this week. Free, no spam.`}
        buttonText="Send me the digest"
        cluster="recruiting"
      />

      <PreviewFooter />
    </div>
  );
};

const NotFound = ({ slug }: { slug?: string }) => (
  <div className="min-h-screen w-full" style={{ background: '#FFF', padding: '64px 24px' }}>
    <h1>Find-people page not found</h1><p>Slug: {slug || '(none)'}</p>
  </div>
);
const Misconfigured = ({ schoolSlug, firmSlug }: { schoolSlug: string; firmSlug: string }) => (
  <div className="min-h-screen w-full" style={{ background: '#FFF', padding: '64px 24px' }}>
    <h1>Find-people page misconfigured</h1>
    <p>Missing school ({schoolSlug}) or firm ({firmSlug}) registry entry.</p>
  </div>
);

export default FindPeopleTemplate;
