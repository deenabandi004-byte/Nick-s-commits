import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import offerloopLogo from '../assets/offerloop_logo2.png';
import { ArrowRight } from 'lucide-react';

const faqData = [
  {
    question: "How much does Apollo.io cost compared to Offerloop?",
    answer: "Apollo's paid plans start at $49/month (billed annually) and go up to $119/month for Professional features. Enterprise plans run $500+/month. Offerloop Pro is $14.99/month - purpose-built for students, not enterprise sales teams. Offerloop also has a free tier with 300 credits, while Apollo's free tier is limited to 60 mobile credits/month."
  },
  {
    question: "Is Apollo.io good for college students?",
    answer: "Apollo was designed for B2B sales teams - its interface, features, and pricing reflect that. Features like sequence automation, call dialer, and CRM sync are built for sales reps running hundreds of outreach campaigns. For a college student sending 10-15 networking emails per week, Apollo is overkill and overpriced. Offerloop is purpose-built for the student networking use case."
  },
  {
    question: "Does Apollo have a better contact database than Offerloop?",
    answer: "Apollo claims 275+ million contacts. Offerloop has access to over 2.2 billion verified contacts. More importantly, Offerloop's search is designed for how students think - natural language queries like 'McKinsey consultants who went to USC' rather than complex Boolean filters designed for sales prospecting."
  },
  {
    question: "Can I use Apollo.io to send networking emails through Gmail?",
    answer: "Apollo has email integration, but it's designed for automated sales sequences - not personalized 1-on-1 networking emails. Offerloop generates unique, personalized emails for each contact and sends them through your Gmail account so they look and feel like hand-written messages, not bulk outreach."
  },
  {
    question: "What does Offerloop have that Apollo doesn't?",
    answer: "Offerloop offers features specifically for student networking that Apollo lacks: Meeting Prep PDFs, interview preparation tools, a resume workshop, natural language contact search, and a networking pipeline tracker designed for relationship-building rather than sales funnels. Offerloop also costs 70-90% less than Apollo's paid plans."
  }
];

const comparisonRows = [
  { feature: "Primary Use Case", offerloop: "Student networking & outreach", competitor: "B2B sales prospecting" },
  { feature: "Built for Students", offerloop: true, competitor: false },
  { feature: "Contact Database", offerloop: "2.2B verified contacts", competitor: "275M+ contacts" },
  { feature: "AI Email Generation", offerloop: true, competitor: true },
  { feature: "Gmail Integration", offerloop: true, competitor: true },
  { feature: "Meeting / Interview Prep", offerloop: true, competitor: false },
  { feature: "Free Tier", offerloop: "300 credits", competitor: "60 mobile credits/mo" },
  { feature: "Pricing", offerloop: "Free / $14.99/mo Pro", competitor: "$49-119/mo (annual billing)" },
];

const CompareApollo = () => {
  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>Offerloop vs Apollo.io for Students | Affordable Alternative | Offerloop</title>
        <meta name="description" content="Apollo costs $50-500/mo and targets B2B sales teams. Offerloop is $14.99/mo and built for college students. Compare features and pricing." />
        <link rel="canonical" href="https://offerloop.ai/compare/apollo" />
        <meta property="og:title" content="Offerloop vs Apollo.io for Students | Offerloop" />
        <meta property="og:description" content="Apollo.io costs $49-500/mo for sales teams. Offerloop is $14.99/mo for students. Compare features and pricing." />
        <meta property="og:url" content="https://offerloop.ai/compare/apollo" />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": faqData.map(f => ({
            "@type": "Question",
            "name": f.question,
            "acceptedAnswer": { "@type": "Answer", "text": f.answer }
          }))
        })}</script>
      </Helmet>

      {/* Nav */}
      <nav className="w-full px-6 py-5 flex items-center justify-between" style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <Link to="/" className="text-xl font-bold" style={{ color: '#0F172A', letterSpacing: '-0.02em' }}><img src={offerloopLogo} alt="Offerloop" style={{ height: '64px', width: 'auto' }} /></Link>
        <Link to="/signin?mode=signup" className="px-5 py-2.5 rounded-[3px] text-sm font-semibold text-white" style={{ background: '#3B82F6' }}>
          Get Started Free
        </Link>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-16 pb-12" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <p className="text-sm font-medium mb-4" style={{ color: '#3B82F6', letterSpacing: '0.02em' }}>COMPARISON</p>
        <h1 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.025em', color: '#0F172A', marginBottom: '20px' }}>
          Offerloop vs <span style={{ color: '#3B82F6' }}>Apollo.io</span>
        </h1>
        <p style={{ fontSize: '17px', lineHeight: 1.7, color: '#64748B', maxWidth: '620px' }}>
          Apollo.io is a powerful B2B sales platform - but it's built for sales teams, not students. Offerloop delivers the same core capability (find contacts, send emails) at a fraction of the price, with features designed specifically for student networking.
        </p>
      </section>

      {/* Comparison Table */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div className="rounded-[3px] overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
          <table className="w-full">
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th className="text-left py-4 px-5 text-sm font-semibold" style={{ color: '#0F172A' }}>Feature</th>
                <th className="text-center py-4 px-5 text-sm font-semibold" style={{ color: '#3B82F6' }}>Offerloop</th>
                <th className="text-center py-4 px-5 text-sm font-semibold" style={{ color: '#64748B' }}>Apollo.io</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row, i) => (
                <tr key={i} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td className="py-3.5 px-5 text-sm" style={{ color: '#334155' }}>{row.feature}</td>
                  <td className="text-center py-3.5 px-5 text-sm font-medium" style={{ color: row.offerloop === false ? '#CBD5E1' : '#0F172A' }}>
                    {row.offerloop === true ? <span style={{ color: '#16A34A' }}>&#10003;</span> : row.offerloop === false ? <span style={{ color: '#CBD5E1' }}>&#10007;</span> : row.offerloop}
                  </td>
                  <td className="text-center py-3.5 px-5 text-sm" style={{ color: row.competitor === false ? '#CBD5E1' : '#64748B' }}>
                    {row.competitor === true ? <span style={{ color: '#16A34A' }}>&#10003;</span> : row.competitor === false ? <span style={{ color: '#CBD5E1' }}>&#10007;</span> : row.competitor}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Content Section 1 */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          Is Apollo.io worth the price for college students?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Apollo.io is an excellent tool - for its target audience. B2B sales teams use Apollo to build lead lists, run automated email sequences, track engagement, and integrate with CRMs like Salesforce and HubSpot. If you're a sales development rep sending 500 emails per day, Apollo's $49-119/month pricing makes sense.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          For a college student sending 10-15 personalized networking emails per week, Apollo is massive overkill. You don't need automated sequences, call dialers, or CRM integrations. You need to find the right person, write a great email, send it, and track the response. That's exactly what Offerloop does - at $14.99/month instead of $49-119.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Offerloop also includes student-specific features that Apollo doesn't offer: Meeting Prep PDFs, interview preparation tools, a resume workshop, and a networking tracker designed for relationship-building rather than sales pipeline management.
        </p>
      </section>

      {/* Content Section 2 */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          What can Apollo do that Offerloop can't?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Apollo excels at enterprise sales workflows. It offers multi-step email sequences with automated follow-ups, a built-in phone dialer, engagement scoring, A/B testing, and deep CRM integrations. If you're managing thousands of leads across a sales team, these features are essential.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Offerloop intentionally doesn't have these features because they're not relevant to student networking. Automated sequences feel impersonal for 1-on-1 outreach. Sales-style engagement scoring doesn't apply to meeting requests. Students need a simpler, more affordable tool that does the core job - find, email, track - exceptionally well.
        </p>
      </section>

      {/* Content Section 3 */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          How does Offerloop's contact database compare to Apollo's?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Apollo reports 275+ million contacts in its database. Offerloop provides access to over 2.2 billion verified contacts - roughly 8x larger. Both databases cover professionals across industries, companies, and roles. The difference isn't just size - it's how you search.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Apollo's search interface is built for sales prospecting with complex Boolean filters, revenue ranges, and technographic data. Offerloop's search is built for students - type natural language queries like "Goldman Sachs analysts who went to Michigan" and get instant results. The AI understands what you're looking for without requiring you to build a complex filter chain.
        </p>
      </section>

      {/* FAQ */}
      <section id="faq" className="px-6 py-16" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px', color: '#0F172A' }}>Frequently Asked Questions</h2>
        {faqData.map((faq, i) => (
          <div key={i} style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', color: '#0F172A' }}>{faq.question}</h3>
            <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#4a5568' }}>{faq.answer}</p>
          </div>
        ))}
      </section>

      {/* CTA */}
      <section className="px-6 py-20" style={{ background: '#FAFBFF' }}>
        <div className="text-center" style={{ maxWidth: '520px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 400, lineHeight: 1.15, color: '#0F172A', marginBottom: '16px' }}>
            Try Offerloop free - built for student networking
          </h2>
          <p style={{ fontSize: '15px', color: '#64748B', marginBottom: '28px' }}>
            Search 2.2B contacts. Generate personalized emails. Track every conversation.
          </p>
          <Link
            to="/signin?mode=signup"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-[3px] text-white font-semibold text-base hover:shadow-lg transition-all"
            style={{ background: '#3B82F6' }}
          >
            Create free account <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
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

export default CompareApollo;
