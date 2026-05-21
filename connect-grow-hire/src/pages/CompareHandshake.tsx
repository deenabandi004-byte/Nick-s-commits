import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import offerloopLogo from '../assets/offerloop_logo2.png';

const faqData = [
  {
    question: "Can I use Handshake for cold emailing professionals?",
    answer: "No. Handshake is designed for job applications and on-campus recruiting events - not cold outreach to individual professionals. You can't search for specific people at a company, find their email addresses, or send personalized emails through Handshake. Offerloop is built specifically for proactive outreach: find contacts, generate AI emails, and send through Gmail."
  },
  {
    question: "Is Handshake free for students?",
    answer: "Yes, Handshake is free for students and is typically provided through your university's career center. However, Handshake only covers job postings and events - it doesn't offer contact discovery, email generation, or networking pipeline management. Offerloop's free tier includes 300 credits for contact search and AI-generated emails."
  },
  {
    question: "Should I use Handshake and Offerloop together?",
    answer: "Yes - they complement each other well. Use Handshake to find job postings, attend career fairs, and apply to on-campus recruiting positions. Use Offerloop to proactively reach out to professionals at those same companies, build relationships before interviews, and track your networking conversations. Students who combine both have the strongest recruiting strategy."
  },
  {
    question: "Does Handshake have a contact database like Offerloop?",
    answer: "No. Handshake connects students to employers who have posted jobs on the platform, but it doesn't provide a searchable database of individual professionals with their email addresses. Offerloop gives you access to 2.2 billion verified contacts searchable by company, role, university, and location."
  },
  {
    question: "Why do students switch from Handshake to Offerloop for networking?",
    answer: "Handshake is passive - you wait for companies to post jobs and events. Offerloop is proactive - you find specific professionals, reach out with personalized emails, and build relationships on your own terms. Students who want to break into competitive industries like consulting, banking, and tech need proactive outreach, not just job board applications."
  }
];

const comparisonRows = [
  { feature: "Primary Use Case", offerloop: "Cold outreach & networking", competitor: "Job postings & career fairs" },
  { feature: "Built for Students", offerloop: true, competitor: true },
  { feature: "Contact Database", offerloop: "2.2B verified contacts", competitor: false },
  { feature: "AI Email Generation", offerloop: true, competitor: false },
  { feature: "Gmail Integration", offerloop: true, competitor: false },
  { feature: "Networking Pipeline Tracker", offerloop: true, competitor: false },
  { feature: "Job Postings", offerloop: false, competitor: true },
  { feature: "Pricing", offerloop: "Free / $14.99/mo Pro", competitor: "Free for students" },
];

const CompareHandshake = () => {
  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>Offerloop vs Handshake for Student Networking | Comparison | Offerloop</title>
        <meta name="description" content="Handshake is great for job postings. Offerloop is built for cold outreach - find professionals, generate AI emails, and track conversations. Compare both." />
        <link rel="canonical" href="https://offerloop.ai/compare/handshake" />
        <meta property="og:title" content="Offerloop vs Handshake for Student Networking | Offerloop" />
        <meta property="og:description" content="Handshake is for job postings. Offerloop is for cold outreach. Compare both platforms for student networking." />
        <meta property="og:url" content="https://offerloop.ai/compare/handshake" />
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
          Offerloop vs <span style={{ color: '#3B82F6' }}>Handshake</span>
        </h1>
        <p style={{ fontSize: '17px', lineHeight: 1.7, color: '#64748B', maxWidth: '620px' }}>
          Handshake is the best platform for job postings and campus recruiting events. Offerloop is the best platform for proactive cold outreach and 1-on-1 networking. Most successful students use both.
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
                <th className="text-center py-4 px-5 text-sm font-semibold" style={{ color: '#64748B' }}>Handshake</th>
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
          Is Handshake good for cold outreach?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Handshake was not designed for cold outreach. It's a job board platform where employers post positions and students apply - similar to Indeed or LinkedIn Jobs, but tailored to college recruiting. You can browse employers, attend virtual events, and submit applications through the platform.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          What Handshake doesn't offer is the ability to find specific professionals, access their email addresses, or send personalized outreach emails. If you want to cold email a consultant at McKinsey, an analyst at Goldman Sachs, or an engineer at Google, Handshake can't help with that.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Offerloop fills this gap. Search 2.2 billion verified contacts by company, role, and university, generate AI-personalized emails, and send directly through Gmail. Handshake helps you apply; Offerloop helps you network.
        </p>
      </section>

      {/* Content Section 2 */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          What can Handshake do that Offerloop can't?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Handshake excels at what it was built for: connecting students with employers who are actively hiring. It aggregates job postings from thousands of companies, hosts virtual career fairs, and integrates with your university's career center. If you're looking for posted internship or full-time positions, Handshake is the go-to platform.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Offerloop doesn't have job postings or career fair features. It's focused entirely on proactive networking - finding people, sending personalized emails, and managing conversations. The two platforms solve different problems, which is why top students use both.
        </p>
      </section>

      {/* Content Section 3 */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          Why isn't applying on Handshake enough to land top internships?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          At competitive firms in consulting, banking, and tech, the application is only one piece of the puzzle. Most successful candidates also network extensively - they have 10-30 conversations with employees before their interview. These conversations provide insider knowledge, demonstrate genuine interest, and often result in referrals that move your resume to the top of the pile.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Handshake helps you submit the application. Offerloop helps you build the relationships that make your application stand out. The most effective recruiting strategy combines both: apply through Handshake and network through Offerloop.
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

export default CompareHandshake;
