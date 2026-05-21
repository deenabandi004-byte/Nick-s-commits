import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import offerloopLogo from '../assets/offerloop_logo2.png';

const faqData = [
  {
    question: "When should I start cold emailing bankers for summer analyst recruiting?",
    answer: "Start 3-6 months before application deadlines. For summer analyst positions at bulge bracket banks, this typically means beginning outreach in the spring of your sophomore year. Early outreach builds relationships before the formal recruiting process begins, giving you an edge when applications open."
  },
  {
    question: "Should I email analysts, associates, or MDs at investment banks?",
    answer: "Focus on analysts and associates first - they're closest to the recruiting process and most likely to respond. First-year analysts remember what it was like to recruit and can give you the most tactical advice. Once you've had a few conversations, ask for introductions to more senior bankers."
  },
  {
    question: "What's the ideal cold email length for investment banking networking?",
    answer: "Under 80 words. Bankers work 80-100 hour weeks and read emails at 2 AM on their phone. Get to the point immediately: who you are, why them specifically, and your ask (15-minute call). Offerloop's AI generates concise, high-impact emails tailored to each banker's background."
  },
  {
    question: "How do I find email addresses for bankers at Goldman Sachs or JPMorgan?",
    answer: "Corporate email patterns (firstname.lastname@gs.com) work sometimes, but many bounce or go to spam. Offerloop provides verified professional email addresses for over 2.2 billion contacts, including analysts and associates at every major investment bank. Search by firm, group, and university to find exactly the right people."
  },
  {
    question: "What if a banker doesn't respond to my cold email?",
    answer: "Send one follow-up after 5-7 business days. Keep it to 2-3 sentences: reference your original email, reiterate your ask, and add a new angle if possible. If they still don't respond, move on - there are plenty of bankers to network with. Offerloop's tracker shows you who hasn't replied so you can prioritize follow-ups."
  }
];

const howToSteps = [
  { name: "Find", text: "Search Offerloop's 2.2 billion contact database to find analysts and associates at Goldman Sachs, JPMorgan, Morgan Stanley, and every major bank - filtered by group, office, and school." },
  { name: "Understand", text: "Review each banker's background: their group, deal experience, career path, and any shared connections like alma mater or hometown." },
  { name: "Reach", text: "Generate a personalized cold email with Offerloop's AI. Each email is unique, concise, and references specific details from the banker's profile. Send directly through Gmail." },
  { name: "Track", text: "Monitor your entire IB networking pipeline in Offerloop's Network Tracker - see who you've emailed, who replied, and who you have calls scheduled with." }
];

const ColdEmailBanking = () => {
  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>Cold Email for Investment Banking Recruiting | Goldman, JPMorgan &amp; More | Offerloop</title>
        <meta name="description" content="Cold email templates for investment banking networking. Reach analysts and associates at bulge bracket and elite boutique firms. AI-powered outreach with Offerloop." />
        <link rel="canonical" href="https://offerloop.ai/cold-email-investment-banking" />
        <meta property="og:title" content="Cold Email for Investment Banking Recruiting | Offerloop" />
        <meta property="og:description" content="Cold email templates and AI outreach for investment banking networking. Reach analysts at bulge brackets and elite boutiques." />
        <meta property="og:url" content="https://offerloop.ai/cold-email-investment-banking" />
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
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "HowTo",
          "name": "How to Cold Email Investment Bankers for Networking",
          "description": "A step-by-step guide to finding and emailing investment banking professionals using Offerloop.",
          "step": howToSteps.map((s, i) => ({
            "@type": "HowToStep",
            "position": i + 1,
            "name": s.name,
            "text": s.text
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
        <p className="text-sm font-medium mb-4" style={{ color: '#3B82F6', letterSpacing: '0.02em' }}>INVESTMENT BANKING RECRUITING</p>
        <h1 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.025em', color: '#0F172A', marginBottom: '20px' }}>
          How to Cold Email <span style={{ color: '#3B82F6' }}>Investment Banking</span> Analysts & Associates
        </h1>
        <p style={{ fontSize: '17px', lineHeight: 1.7, color: '#64748B', maxWidth: '620px' }}>
          Networking is the single biggest factor in landing an investment banking internship. Here's how to write cold emails that get responses from bankers at Goldman Sachs, JPMorgan, Morgan Stanley, and elite boutiques.
        </p>
      </section>

      {/* Content Section 1 */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          How do I cold email an analyst at Goldman Sachs or JPMorgan?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          The most effective cold emails to IB analysts have three components: a shared connection point, genuine curiosity about their specific group, and a concrete ask. Lead with your strongest link - a shared university, mutual contact, or hometown. Then reference their specific group (TMT, Healthcare, M&A) rather than just the firm name. Close with a request for a 15-minute phone call at their convenience.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Timing matters. Avoid Monday mornings (deal reviews) and Friday evenings. Tuesday through Thursday, sent between 7-9 AM in their time zone, tends to perform best. Keep the email under 80 words - analysts read everything on their phones.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Offerloop finds verified email addresses for analysts and associates across every major bank. Search by firm, coverage group, office, and university - then generate a personalized email in seconds that references their specific background.
        </p>
      </section>

      {/* Content Section 2 */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          What's the difference between networking at bulge brackets vs. elite boutiques?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Bulge bracket banks (Goldman Sachs, JPMorgan, Morgan Stanley, Bank of America) have larger analyst classes and more structured recruiting. Your networking is about standing out among hundreds of candidates. Focus on building multiple touchpoints within your target group - speak to 3-5 people in the same division.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Elite boutiques (Evercore, Centerview, PJT, Lazard, Moelis) have smaller classes and more relationship-driven recruiting. Every conversation matters more. Your emails should demonstrate deeper knowledge of their deal flow and positioning. Since these firms are smaller, you're more likely to be remembered - positively or negatively.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Offerloop covers both. Search for bankers across bulge brackets and boutiques alike, and the AI adapts its email tone based on the firm's culture and the recipient's seniority level.
        </p>
      </section>

      {/* Content Section 3 */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          How do I manage my IB networking pipeline without losing track?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Banking recruiting requires tracking dozens or hundreds of conversations across multiple firms and groups. Without a system, you'll forget who you've emailed, miss follow-ups, and lose track of relationships you've already built.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Most students rely on spreadsheets, but they break down quickly. You need to track the person's name, firm, group, email date, response status, call date, key takeaways, and referrals - across 50-100+ contacts. That's a lot of manual data entry on top of an already demanding academic schedule.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Offerloop's Network Tracker was built specifically for this problem. Every email you send through Offerloop is automatically tracked with pipeline stages - Sent, Replied, Scheduled, Completed. You can see your entire networking funnel at a glance and know exactly who needs a follow-up.
        </p>
      </section>

      {/* How It Works */}
      <section className="px-6 py-16" style={{ background: '#FAFBFF' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '32px', textAlign: 'center' }}>
            How Offerloop Works for IB Outreach
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {howToSteps.map((step, i) => (
              <div key={i} className="bg-white rounded-[3px] p-6" style={{ border: '1px solid #E2E8F0' }}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold text-white" style={{ background: '#3B82F6' }}>{i + 1}</span>
                  <h3 className="font-semibold text-base" style={{ color: '#0F172A' }}>{step.name}</h3>
                </div>
                <p className="text-sm" style={{ lineHeight: 1.7, color: '#64748B' }}>{step.text}</p>
              </div>
            ))}
          </div>
        </div>
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
            Start networking with AI - try Offerloop free
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

export default ColdEmailBanking;
