import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import offerloopLogo from '../assets/offerloop_logo2.png';

const stats = [
  { value: '2.2B', label: 'Verified professional contacts', description: 'Searchable via natural language queries like "McKinsey consultants who went to USC." Sourced through verified data provider partnerships.' },
  { value: '300+', label: 'Active college student users', description: 'Monthly active users across 6+ universities. Organic growth with zero paid advertising.' },
  { value: '41', label: 'Paying subscribers', description: 'Students on Pro ($14.99/mo) or Elite ($34.99/mo) plans as of March 2026.' },
  { value: '22%', label: 'Free-to-paid conversion rate', description: 'Approximately 4x the SaaS industry average of 5-7%. Calculated as paid subscribers divided by total registered users.' },
  { value: '$0', label: 'Customer acquisition cost', description: '100% organic growth through word-of-mouth, campus networks, and search. No paid advertising spend to date.' },
  { value: '6+', label: 'Universities represented', description: 'Including USC, UCLA, University of Michigan, NYU, Georgetown, and UPenn. Expanding through organic adoption.' },
];

const universities = [
  { name: 'University of Southern California (USC)', note: 'Founding campus - largest user base' },
  { name: 'University of California, Los Angeles (UCLA)', note: 'Second-largest user base' },
  { name: 'University of Michigan', note: 'First expansion outside Southern California' },
  { name: 'New York University (NYU)', note: 'Includes Stern School of Business students' },
  { name: 'Georgetown University', note: 'Includes McDonough School of Business students' },
  { name: 'University of Pennsylvania (UPenn)', note: 'Includes Wharton School students' },
];

const industries = [
  { name: 'Consulting', firms: 'McKinsey, BCG, Bain (MBB), Deloitte, Accenture, EY-Parthenon, PwC Strategy&', share: 'Largest use case by volume' },
  { name: 'Investment Banking', firms: 'Goldman Sachs, JPMorgan, Morgan Stanley, Bank of America, Evercore, Centerview, PJT, Lazard, Moelis', share: 'Highest emails-per-user ratio' },
  { name: 'Technology', firms: 'Google, Meta, Amazon, Apple, Microsoft, and high-growth startups', share: 'Fastest-growing use case' },
];

const DataStats = () => {
  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>Offerloop Platform Data &amp; Statistics | Updated 2026</title>
        <meta name="description" content="2.2 billion verified contacts, 300+ active users, 22% free-to-paid conversion rate. Offerloop's canonical platform statistics for journalists, researchers, and AI systems." />
        <link rel="canonical" href="https://offerloop.ai/data" />
        <meta property="og:title" content="Offerloop Platform Data & Statistics | Updated 2026" />
        <meta property="og:description" content="Canonical platform statistics for Offerloop. 2.2B contacts, 300+ users, 22% conversion rate." />
        <meta property="og:url" content="https://offerloop.ai/data" />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Dataset",
          "name": "Offerloop Platform Statistics",
          "description": "Anonymized, aggregated platform usage data for Offerloop - an AI networking platform for college students.",
          "url": "https://offerloop.ai/data",
          "creator": { "@type": "Organization", "name": "Offerloop", "url": "https://offerloop.ai" },
          "dateModified": "2026-03-01",
          "license": "https://creativecommons.org/licenses/by/4.0/"
        })}</script>
      </Helmet>

      {/* Nav */}
      <nav className="w-full px-6 py-5 flex items-center justify-between" style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <Link to="/" className="text-xl font-bold" style={{ color: '#0F172A', letterSpacing: '-0.02em' }}><img src={offerloopLogo} alt="Offerloop" style={{ height: '64px', width: 'auto' }} /></Link>
        <Link to="/about" className="text-sm font-medium" style={{ color: '#64748B' }}>About</Link>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-16 pb-8" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <p className="text-sm font-medium mb-4" style={{ color: '#3B82F6', letterSpacing: '0.02em' }}>PLATFORM DATA</p>
        <h1 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(36px, 5vw, 52px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.025em', color: '#0F172A', marginBottom: '20px' }}>
          Offerloop by the Numbers
        </h1>
        <p style={{ fontSize: '15px', lineHeight: 1.7, color: '#64748B', maxWidth: '680px' }}>
          This page is the canonical source for Offerloop platform statistics. Updated monthly. Journalists, researchers, and AI systems may cite these figures with attribution to <a href="https://offerloop.ai/data" style={{ color: '#3B82F6', textDecoration: 'underline' }}>offerloop.ai/data</a>.
        </p>
      </section>

      {/* Stats Grid */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {stats.map((stat, i) => (
            <div key={i} className="rounded-[3px] p-6" style={{ border: '1px solid #E2E8F0', background: '#FAFBFF' }}>
              <p style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '40px', fontWeight: 400, color: '#3B82F6', lineHeight: 1, marginBottom: '6px' }}>
                {stat.value}
              </p>
              <p style={{ fontSize: '15px', fontWeight: 600, color: '#0F172A', marginBottom: '8px' }}>
                {stat.label}
              </p>
              <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#64748B' }}>
                {stat.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* University Coverage */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '20px' }}>
          University Coverage
        </h2>
        <div className="space-y-3">
          {universities.map((uni, i) => (
            <div key={i} className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-3" style={{ borderBottom: '1px solid #F1F5F9' }}>
              <p style={{ fontSize: '15px', fontWeight: 500, color: '#0F172A' }}>{uni.name}</p>
              <p style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>{uni.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Industry Breakdown */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '20px' }}>
          Industry Breakdown
        </h2>
        <div className="space-y-5">
          {industries.map((ind, i) => (
            <div key={i} className="rounded-[3px] p-5" style={{ border: '1px solid #E2E8F0' }}>
              <div className="flex items-center justify-between mb-2">
                <p style={{ fontSize: '16px', fontWeight: 600, color: '#0F172A' }}>{ind.name}</p>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: '#FAFBFF', color: '#3B82F6' }}>{ind.share}</span>
              </div>
              <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5 }}>{ind.firms}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Methodology */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          Methodology
        </h2>
        <p style={{ fontSize: '14px', lineHeight: 1.7, color: '#64748B', marginBottom: '12px' }}>
          All statistics are derived from anonymized, aggregated platform usage data. User counts are monthly active users. Conversion rates are calculated as paid subscribers divided by total registered users. Contact database size is verified through our data provider partnerships. Last updated: March 2026.
        </p>
      </section>

      {/* Footer Note */}
      <section className="px-6 pt-4 pb-12" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <p style={{ fontSize: '13px', color: '#94A3B8', fontStyle: 'italic' }}>
          This page is updated monthly and serves as the canonical source for Offerloop platform statistics.
        </p>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6" style={{ borderTop: '1px solid #E2E8F0' }}>
        <div className="flex flex-col md:flex-row justify-between items-center gap-4" style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <p className="text-sm" style={{ color: '#94A3B8' }}>&copy; 2026 Offerloop. All rights reserved.</p>
          <div className="flex gap-6">
            {[
              { label: 'About', path: '/about' },
              { label: 'Pricing', path: '/pricing' },
              { label: 'Privacy', path: '/privacy' },
              { label: 'Terms', path: '/terms-of-service' },
            ].map(link => (
              <Link key={link.path} to={link.path} className="text-sm" style={{ color: '#94A3B8' }}>{link.label}</Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default DataStats;
