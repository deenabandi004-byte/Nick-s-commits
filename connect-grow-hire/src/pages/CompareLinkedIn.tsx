import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import offerloopLogo from '../assets/offerloop_logo2.png';

const faqData = [
  {
    question: "Can I use LinkedIn for cold emailing professionals?",
    answer: "Not effectively. LinkedIn lets you send connection requests and InMail messages, but response rates on LinkedIn DMs are very low (under 5% for cold outreach). You also can't access professional email addresses through LinkedIn. Offerloop provides verified email addresses and generates personalized emails that go to actual inboxes - where response rates are 3-5x higher."
  },
  {
    question: "Is LinkedIn Premium worth it for college students?",
    answer: "LinkedIn Premium costs $29.99-59.99/month and gives you InMail credits and profile insights. For students focused on networking, it's not the best value - InMail response rates are low and you still can't export email addresses. Offerloop at $14.99/month gives you verified emails, AI-generated personalized outreach, Gmail integration, and conversation tracking."
  },
  {
    question: "Should I use LinkedIn and Offerloop together?",
    answer: "Yes. LinkedIn is great for research - browsing profiles, understanding career paths, and identifying people you want to connect with. Offerloop is great for action - finding their email, writing a personalized message, and sending it through Gmail where it's more likely to be read. Use LinkedIn to research, Offerloop to reach out."
  },
  {
    question: "Why do LinkedIn connection requests get ignored?",
    answer: "Most professionals receive dozens of connection requests weekly and can't tell who genuinely wants to network vs. who is mass-connecting. InMail messages are also easy to ignore since they feel like spam. Email outreach has higher response rates because it signals more effort, arrives in the primary inbox, and allows for real personalization beyond LinkedIn's 300-character limit."
  },
  {
    question: "Does Offerloop use LinkedIn data?",
    answer: "No. Offerloop has its own independent database of 2.2 billion verified professional contacts. You don't need a LinkedIn Premium account to use Offerloop. The platform provides professional email addresses, company information, education history, and career trajectory data directly."
  }
];

const comparisonRows = [
  { feature: "Primary Use Case", offerloop: "Cold outreach & pipeline tracking", competitor: "Profile browsing & connections" },
  { feature: "Built for Students", offerloop: true, competitor: false },
  { feature: "Contact Database", offerloop: "2.2B verified emails", competitor: "900M+ profiles (no emails)" },
  { feature: "AI Email Generation", offerloop: true, competitor: false },
  { feature: "Gmail Integration", offerloop: true, competitor: false },
  { feature: "Networking Pipeline Tracker", offerloop: true, competitor: false },
  { feature: "Professional Profiles", offerloop: "Basic", competitor: "Comprehensive" },
  { feature: "Pricing", offerloop: "Free / $14.99/mo Pro", competitor: "Free / $29.99-59.99/mo Premium" },
];

const CompareLinkedIn = () => {
  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>Offerloop vs LinkedIn for College Student Networking | Offerloop</title>
        <meta name="description" content="LinkedIn is for passive browsing. Offerloop finds verified emails, writes personalized outreach, and tracks your pipeline. See why students choose Offerloop." />
        <link rel="canonical" href="https://offerloop.ai/compare/linkedin" />
        <meta property="og:title" content="Offerloop vs LinkedIn for College Student Networking | Offerloop" />
        <meta property="og:description" content="LinkedIn is for browsing profiles. Offerloop is for proactive outreach. Compare both for student networking." />
        <meta property="og:url" content="https://offerloop.ai/compare/linkedin" />
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
          Offerloop vs <span style={{ color: '#3B82F6' }}>LinkedIn</span>
        </h1>
        <p style={{ fontSize: '17px', lineHeight: 1.7, color: '#64748B', maxWidth: '620px' }}>
          LinkedIn has the largest professional network in the world. But it wasn't built for proactive outreach - Offerloop was. Use LinkedIn to research. Use Offerloop to reach out.
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
                <th className="text-center py-4 px-5 text-sm font-semibold" style={{ color: '#64748B' }}>LinkedIn</th>
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
          Is LinkedIn effective for cold outreach as a student?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          LinkedIn is the world's largest professional network with over 900 million profiles, and it's an essential tool for browsing career paths, researching companies, and building your online presence. However, LinkedIn was designed for passive networking - profile views, connection requests, and content feeds - not active cold outreach.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          The biggest limitation for students is reach. LinkedIn connection requests have a 300-character limit, InMail messages cost $5-10 each with Premium, and DM response rates for cold outreach hover around 3-5%. You also can't access anyone's professional email address through LinkedIn, which means you're limited to messages within the platform.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Offerloop solves the outreach problem that LinkedIn doesn't. Find verified professional email addresses, generate AI-personalized emails with no character limit, and send directly through Gmail where messages land in the primary inbox - not a LinkedIn notification that's easy to dismiss.
        </p>
      </section>

      {/* Content Section 2 */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          What can LinkedIn do that Offerloop can't?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          LinkedIn offers the richest professional profile data in the world. Detailed work histories, skill endorsements, recommendations, shared content, and company pages make it the best tool for researching someone before you reach out. LinkedIn also has job postings, company reviews, and industry news - none of which Offerloop provides.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          The ideal workflow is to use LinkedIn for research and Offerloop for action. Browse someone's LinkedIn profile to understand their background, then use Offerloop to find their email and send a personalized message that references what you learned. This combination gives you the best of both platforms.
        </p>
      </section>

      {/* Content Section 3 */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          Why does email outreach get better response rates than LinkedIn messages?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Email outreach consistently outperforms LinkedIn messages for three reasons. First, emails land in the primary inbox - a space professionals check dozens of times daily - while LinkedIn messages compete with connection requests, recruiter spam, and platform notifications. Second, email allows for longer, more personalized messages with no character limit. Third, email signals more effort, which professionals notice and appreciate.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Students who switch from LinkedIn DMs to personalized email outreach through Offerloop typically see response rates increase from under 5% to 15-25%. The combination of verified email delivery, AI personalization, and Gmail integration makes every outreach attempt count.
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

export default CompareLinkedIn;
