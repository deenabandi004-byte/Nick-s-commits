import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import offerloopLogo from '../assets/offerloop_logo2.png';

const faqData = [
  {
    question: "Is cold emailing effective for getting tech internships?",
    answer: "Yes - while tech recruiting relies more on applications and referrals than finance, cold emailing is highly effective for getting referrals, learning about unlisted roles, and building relationships with engineers and PMs who can advocate for you internally. A warm introduction from an employee dramatically increases your chances of landing an interview."
  },
  {
    question: "Should I email engineers, recruiters, or hiring managers at tech companies?",
    answer: "Start with engineers and PMs on teams you're interested in - they can give you the most authentic picture of the role and often provide internal referrals. Recruiters are useful for understanding the hiring process but get hundreds of messages daily. Offerloop lets you filter contacts by role so you can target the right people at each company."
  },
  {
    question: "How do I cold email someone at Google or Meta for a referral?",
    answer: "Don't ask for a referral in your first email. Instead, ask for a 15-minute conversation about their team and experience. After a genuine conversation, most people will offer to refer you. Your cold email should mention a shared connection (school, open source project, mutual interest), express specific interest in their team, and propose a brief call."
  },
  {
    question: "What's different about cold emailing startups vs. big tech companies?",
    answer: "At startups, your email might go directly to the hiring manager or CTO - so be more specific about what you can contribute. At big tech, you're usually emailing an individual contributor who may refer you. Startup emails should highlight relevant projects and skills; big tech emails should focus on shared connections and genuine curiosity. Offerloop adapts its AI-generated emails based on company size and culture."
  },
  {
    question: "How do I find email addresses for engineers at tech companies?",
    answer: "Engineers at big tech companies rarely use corporate email for networking. Offerloop's database of 2.2 billion verified contacts includes professional email addresses for engineers, PMs, and managers across Google, Meta, Amazon, Apple, Microsoft, and thousands of startups - saving you from guessing email formats or LinkedIn DMs that go unread."
  }
];

const howToSteps = [
  { name: "Find", text: "Search Offerloop's 2.2 billion contact database to find engineers, PMs, and recruiters at Google, Meta, Amazon, Apple, Microsoft, and startups - filtered by role, team, and university." },
  { name: "Understand", text: "Review each person's technical background, current team, past companies, and shared connections to personalize your outreach effectively." },
  { name: "Reach", text: "Generate a personalized cold email with Offerloop's AI that references their specific background and proposes a low-commitment conversation. Send directly through Gmail." },
  { name: "Track", text: "Monitor your tech networking pipeline in Offerloop's Network Tracker - see who you've emailed, who responded, and which conversations led to referrals." }
];

const ColdEmailTech = () => {
  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>Cold Email for Tech Internships | Google, Meta, Amazon &amp; Startups | Offerloop</title>
        <meta name="description" content="Cold email engineers, recruiters, and PMs at top tech companies for internships. AI-personalized outreach for CS and PM students with Offerloop." />
        <link rel="canonical" href="https://offerloop.ai/cold-email-tech-internships" />
        <meta property="og:title" content="Cold Email for Tech Internships | Offerloop" />
        <meta property="og:description" content="Cold email templates for tech internship networking. Reach engineers and PMs at FAANG and startups." />
        <meta property="og:url" content="https://offerloop.ai/cold-email-tech-internships" />
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
          "name": "How to Cold Email Tech Professionals for Internships",
          "description": "A step-by-step guide to finding and emailing engineers, PMs, and recruiters at tech companies using Offerloop.",
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
        <p className="text-sm font-medium mb-4" style={{ color: '#3B82F6', letterSpacing: '0.02em' }}>TECH INTERNSHIP RECRUITING</p>
        <h1 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.025em', color: '#0F172A', marginBottom: '20px' }}>
          How to Cold Email for <span style={{ color: '#3B82F6' }}>Tech Internships</span> at Google, Meta & Startups
        </h1>
        <p style={{ fontSize: '17px', lineHeight: 1.7, color: '#64748B', maxWidth: '620px' }}>
          Cold emailing engineers and PMs is the fastest path to referrals and unlisted opportunities at top tech companies. Here's how students at top CS programs network their way into FAANG and high-growth startups.
        </p>
      </section>

      {/* Content Section 1 */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          How do I cold email an engineer at Google or Meta for a referral?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          The key to getting tech referrals through cold email is to never ask for the referral upfront. Instead, ask for a 15-minute conversation about their team, their day-to-day work, or how they transitioned from school to their current role. If the conversation goes well, they'll almost always offer to refer you - and that organic referral is far stronger than one from a stranger.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Your email should lead with a genuine shared connection: same university, a mutual open-source project, a shared interest in their team's product, or a blog post they wrote. Tech professionals respond well to specificity and authentic curiosity - not generic networking requests.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Offerloop finds verified contact information for engineers and PMs across every major tech company. The AI generates emails that reference specific details from each person's profile - their team, past projects, and shared background - so every email feels personal and genuine.
        </p>
      </section>

      {/* Content Section 2 */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          What should I include in a cold email to a PM at a tech company?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Product managers at tech companies value clarity, user empathy, and structured thinking - and they expect to see those qualities in your email. Open with a specific reason for reaching out to them (their product area, a feature launch, or a talk they gave). Briefly mention your relevant experience - a side project, a case competition, or coursework related to their product domain.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Keep it concise and action-oriented. PMs are trained to cut scope, and they respect emails that do the same. Three to four sentences is ideal. Your ask should be specific: "Would you have 15 minutes this week or next to chat about your experience on the [Product] team?"
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Offerloop's AI understands the difference between emailing an engineer and a PM. It adapts the tone, references, and framing based on the recipient's role - so your emails always feel tailored to the person reading them.
        </p>
      </section>

      {/* Content Section 3 */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          How is cold emailing for startups different from big tech?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          At startups, your cold email might land directly in the inbox of the hiring manager, CTO, or even the CEO. The bar for personalization is higher because they'll actually read the whole thing. Reference their product, recent funding round, or a specific technical challenge their company is solving. Show that you've done your homework.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Startups also move faster. If they're interested, you might have an interview within days rather than weeks. Your email should convey energy, specific skills, and a clear understanding of what they're building. Unlike big tech outreach, it's appropriate to briefly mention what you could contribute.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Offerloop's database covers professionals at companies of all sizes - from pre-seed startups to trillion-dollar enterprises. Search by company stage, role, or technology stack to find exactly the right people at the startups you're targeting.
        </p>
      </section>

      {/* How It Works */}
      <section className="px-6 py-16" style={{ background: '#FAFBFF' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '32px', textAlign: 'center' }}>
            How Offerloop Works for Tech Outreach
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

export default ColdEmailTech;
