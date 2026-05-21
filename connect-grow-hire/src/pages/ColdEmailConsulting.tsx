import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import offerloopLogo from '../assets/offerloop_logo2.png';

const faqData = [
  {
    question: "What's the best subject line for a cold email to a consultant?",
    answer: "Keep it specific and personal. Subject lines like 'Fellow [University] Student - Quick Question on [Office/Practice]' or '[Mutual Connection] Suggested I Reach Out' consistently get higher open rates than generic lines like 'Networking Request.' Mention something concrete that connects you to the recipient."
  },
  {
    question: "How long should my cold email to a McKinsey consultant be?",
    answer: "Under 100 words. Consultants are busy and often read emails on their phone between meetings. Your email should have a one-sentence intro, one sentence about why you're reaching out to them specifically, and a clear ask - typically a 15-minute phone call. Offerloop's AI drafts emails at this ideal length automatically."
  },
  {
    question: "Should I email partners or analysts at consulting firms?",
    answer: "Start with analysts and associates who are 1-3 years into their career - they remember what recruiting was like and are more likely to respond. As you build confidence, reach out to engagement managers and principals. Offerloop lets you filter contacts by seniority level so you can target the right people."
  },
  {
    question: "How many consultants should I cold email per week?",
    answer: "Aim for 10-15 personalized outreach emails per week during recruiting season. Quality matters more than quantity - a well-researched, personalized email to 10 people will outperform a generic template sent to 50. Offerloop helps you maintain quality at volume by generating unique emails for each contact."
  },
  {
    question: "Is it okay to follow up if a consultant doesn't respond?",
    answer: "Yes - one follow-up after 5-7 business days is appropriate and expected. Keep it short: reference your original email, reiterate your ask, and make it easy to say yes. Don't follow up more than once. Offerloop's Network Tracker helps you see who hasn't responded so you know exactly when to follow up."
  }
];

const howToSteps = [
  { name: "Find", text: "Search Offerloop's database of 2.2 billion contacts to find consultants at McKinsey, BCG, Bain, Deloitte, and other firms filtered by office, practice area, and university." },
  { name: "Understand", text: "Review each consultant's professional background, career trajectory, and shared connections to identify personalization angles for your outreach." },
  { name: "Reach", text: "Generate a personalized cold email using Offerloop's AI, which drafts unique messages based on the consultant's profile and your background. Send directly through Gmail." },
  { name: "Track", text: "Monitor responses in Offerloop's Network Tracker with pipeline stages - Sent, Replied, Scheduled, Completed - so you never lose track of a conversation." }
];

const ColdEmailConsulting = () => {
  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>Cold Email for Consulting Recruiting | MBB &amp; Big 4 Networking | Offerloop</title>
        <meta name="description" content="Learn how to cold email McKinsey, BCG, Bain, and Big 4 consultants as a college student. Free templates + AI-powered personalized outreach with Offerloop." />
        <link rel="canonical" href="https://offerloop.ai/cold-email-consulting" />
        <meta property="og:title" content="Cold Email for Consulting Recruiting | Offerloop" />
        <meta property="og:description" content="Learn how to cold email MBB and Big 4 consultants. AI-powered personalized outreach for college students." />
        <meta property="og:url" content="https://offerloop.ai/cold-email-consulting" />
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
          "name": "How to Cold Email Consultants for Networking",
          "description": "A step-by-step guide to finding and emailing consultants at top firms using Offerloop.",
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
        <p className="text-sm font-medium mb-4" style={{ color: '#3B82F6', letterSpacing: '0.02em' }}>CONSULTING RECRUITING</p>
        <h1 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.025em', color: '#0F172A', marginBottom: '20px' }}>
          How to Cold Email Consultants at <span style={{ color: '#3B82F6' }}>McKinsey, BCG & Bain</span>
        </h1>
        <p style={{ fontSize: '17px', lineHeight: 1.7, color: '#64748B', maxWidth: '620px' }}>
          Cold emailing is the most effective way to build a consulting network before recruiting season. Here's how top students land meetings at MBB and Big 4 firms - and how Offerloop makes it effortless.
        </p>
      </section>

      {/* Content Section 1 */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          How do I cold email a McKinsey consultant?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          The best cold emails to McKinsey consultants follow a simple formula: personalized opening, specific reason for reaching out, and a low-commitment ask. Start by mentioning a shared connection - your university, a club, or a specific project they worked on. Then explain why you're interested in consulting and their firm specifically. End with a clear ask for a 15-minute phone call.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Avoid opening with "I hope this email finds you well" or "I'm a student at X interested in consulting." Every student says that. Instead, reference something specific: their practice area, a case study their team published, or their career path from your shared alma mater.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Offerloop automates the hardest part - finding verified email addresses and generating personalized emails. Search for McKinsey consultants by office location, practice area, or university, and Offerloop's AI drafts a unique email for each person based on their background and yours. Read our full <Link to="/blog/cold-email-mckinsey-consultant" style={{ color: '#2563EB', textDecoration: 'underline' }}>McKinsey cold email guide</Link> for step-by-step examples.
        </p>
      </section>

      {/* Content Section 2 */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          What makes a consulting cold email actually get a response?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Response rates for consulting networking emails average 15-25% when done well. The difference between emails that get responses and those that don't comes down to three factors: personalization, brevity, and a specific ask.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Personalization means referencing something unique about the recipient - not just their firm name. Mention their specific office, the practice group they joined, or a shared extracurricular. Brevity means keeping it under 100 words. A specific ask means "Would you have 15 minutes for a quick call next week?" not "I'd love to learn more about your experience."
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Offerloop's AI analyzes each contact's professional background to find the best personalization angle. It generates emails that feel hand-written - because the content is unique to each recipient - but takes seconds instead of 20 minutes per email.
        </p>
      </section>

      {/* Content Section 3 */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          How many people should I reach out to during consulting recruiting?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Students who successfully break into MBB typically have 15-30 networking conversations before their interviews. That means reaching out to 60-100+ people, since not everyone will respond. Starting early - at least 3 months before application deadlines - gives you time to build relationships without rushing.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          The biggest bottleneck isn't sending emails - it's finding the right people and writing personalized messages for each one. Most students spend 15-20 minutes per email researching someone's background and crafting a message. At 100 emails, that's 25-30 hours just on outreach.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Offerloop compresses that timeline dramatically. Search for consultants at BCG, Bain, Deloitte, or any firm, and generate personalized emails in seconds. Track every conversation in the Network Tracker so you always know who you've contacted, who replied, and who you need to follow up with.
        </p>
      </section>

      {/* How It Works */}
      <section className="px-6 py-16" style={{ background: '#FAFBFF' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '32px', textAlign: 'center' }}>
            How Offerloop Works for Consulting Outreach
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

export default ColdEmailConsulting;
