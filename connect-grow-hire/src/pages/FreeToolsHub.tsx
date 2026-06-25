/*
 * Free Tools & Guides hub.
 * Indexable crawl-path page that links every live (published) SEO page plus
 * the 8 free widget tools. Linked from the site footer and listed in the SEO
 * sitemap, this gives Google an internal route to the otherwise-orphaned
 * firm/role pages. House style: no em dashes, no sparkle icons.
 */
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { FileText, Mail, MessageSquare, ScanLine, Users, Building2, Briefcase, UserSearch } from 'lucide-react';
import { BRAND, INK, serif, PreviewNav, PreviewFooter } from './seo-preview/_shared';
import { getPublishedResumeReviewRows } from '../seo/data/resume-review';
import { getPublishedCoverLetterRows } from '../seo/data/cover-letter';
import { getPublishedInterviewPrepRows } from '../seo/data/interview-prep';
import { getPublishedATSRows } from '../seo/data/ats';

const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

const clusters = [
  { title: 'Resume reviews by firm and role', prefix: '/resume-review', Icon: FileText, rows: getPublishedResumeReviewRows() },
  { title: 'Cover letters by firm and role', prefix: '/cover-letter', Icon: Mail, rows: getPublishedCoverLetterRows() },
  { title: 'Interview prep by firm and role', prefix: '/interview-prep', Icon: MessageSquare, rows: getPublishedInterviewPrepRows() },
  { title: 'ATS guides', prefix: '/ats', Icon: ScanLine, rows: getPublishedATSRows() },
];

const widgetTools = [
  { to: '/tools/find-people', label: 'Find people at any company', Icon: Users },
  { to: '/tools/find-companies', label: 'Find target companies', Icon: Building2 },
  { to: '/tools/find-hiring-manager', label: 'Find the hiring manager', Icon: UserSearch },
  { to: '/tools/find-jobs', label: 'Find matching jobs', Icon: Briefcase },
  { to: '/tools/resume-review', label: 'Free resume review', Icon: FileText },
  { to: '/tools/cover-letter', label: 'Free cover letter writer', Icon: Mail },
  { to: '/tools/interview-prep', label: 'Free interview prep', Icon: MessageSquare },
  { to: '/tools/meeting-prep-free', label: 'Free meeting prep', Icon: MessageSquare },
];

const FreeToolsHub = () => {
  const allRows = clusters.flatMap((c) => c.rows.map((r) => ({ url: `${c.prefix}/${r.slug}`, name: cap(r.primaryKeyword) })));
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Free Tools & Recruiting Guides | Offerloop',
    description: 'Free resume reviews, cover letters, interview prep, and ATS guides for top banking, consulting, and tech firms.',
    hasPart: allRows.map((r) => ({ '@type': 'WebPage', name: r.name, url: `https://www.offerloop.ai${r.url}` })),
  };

  return (
    <div className="min-h-screen w-full" style={{ background: '#FFFFFF', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <Helmet>
        <title>Free Tools & Recruiting Guides for Banking, Consulting & Tech | Offerloop</title>
        <meta name="robots" content="index,follow" />
        <meta name="description" content="Free, firm-specific resume reviews, cover letters, interview prep, and ATS guides for Goldman Sachs, McKinsey, Google and more. Built for college students recruiting." />
        <link rel="canonical" href="https://www.offerloop.ai/free-tools" />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <PreviewNav />

      <section className="px-6 pt-14 pb-10 text-center" style={{ maxWidth: '780px', margin: '0 auto' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: BRAND, letterSpacing: '0.06em' }}>FREE TOOLS AND GUIDES</span>
        <h1 style={{ fontFamily: serif, fontWeight: 400, fontSize: 'clamp(32px, 4.6vw, 50px)', lineHeight: 1.1, letterSpacing: '-0.03em', color: INK, margin: '14px 0 16px' }}>
          Everything you need to land the interview, free.
        </h1>
        <p style={{ fontSize: '17px', lineHeight: 1.7, color: '#475569' }}>
          Firm-specific resume reviews, cover letters, interview prep, and ATS guides for the banks, consulting firms,
          and tech companies students actually recruit for. Every tool gives you a real result for your own application,
          not a generic sample.
        </p>
      </section>

      <section className="px-6 pb-12" style={{ maxWidth: '900px', margin: '0 auto' }}>
        <h2 style={{ fontFamily: serif, fontWeight: 400, fontSize: '24px', color: INK, marginBottom: '16px' }}>Free interactive tools</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {widgetTools.map((t) => (
            <Link key={t.to} to={t.to} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', border: '1px solid #E2E8F0', borderRadius: '12px', color: INK, fontWeight: 600, fontSize: '15px', textDecoration: 'none' }}>
              <t.Icon className="w-4 h-4" style={{ color: BRAND }} /> {t.label}
            </Link>
          ))}
        </div>
      </section>

      {clusters.map((c) => (
        <section key={c.prefix} className="px-6 pb-10" style={{ maxWidth: '900px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: serif, fontWeight: 400, fontSize: '24px', color: INK, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <c.Icon className="w-5 h-5" style={{ color: BRAND }} /> {c.title}
          </h2>
          <ul style={{ display: 'grid', gap: '8px', listStyle: 'none', padding: 0, margin: 0 }}>
            {c.rows.map((r) => (
              <li key={r.slug}>
                <Link to={`${c.prefix}/${r.slug}`} style={{ color: BRAND, fontSize: '15.5px', textDecoration: 'none', fontWeight: 500 }}>
                  {cap(r.primaryKeyword)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <PreviewFooter />
    </div>
  );
};

export default FreeToolsHub;
