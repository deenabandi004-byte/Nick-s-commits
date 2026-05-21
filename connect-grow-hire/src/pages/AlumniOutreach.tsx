import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import offerloopLogo from '../assets/offerloop_logo2.png';

const faqData = [
  {
    question: "How do I find alumni from my university who work at a specific company?",
    answer: "Most university alumni directories are outdated and limited. Offerloop lets you search 2.2 billion verified contacts filtered by university and company simultaneously - so you can find every USC alum at Goldman Sachs or every Michigan grad at Google in seconds. Results include verified professional email addresses ready for outreach."
  },
  {
    question: "What should I say in an alumni outreach email?",
    answer: "Lead with your shared university connection, then mention a specific reason you're reaching out to them - their career path, current role, or industry. Keep it under 100 words. Your ask should be a 15-minute phone call, not a job or referral. Example: 'As a fellow Trojan now exploring consulting, I'd love to hear how you made the transition from [previous role] to [current role] at [company].'"
  },
  {
    question: "Is alumni outreach more effective than cold emailing strangers?",
    answer: "Significantly. Shared alma mater increases response rates by 2-3x compared to cold emails with no connection point. Alumni feel an implicit obligation to help current students from their school - it's one of the strongest networking advantages you have. Offerloop's AI automatically detects shared university connections and highlights them in generated emails."
  },
  {
    question: "How many alumni should I reach out to per week?",
    answer: "10-15 personalized emails per week is a sustainable pace. Focus on quality over quantity - a well-researched email to an alum in your exact target role is worth more than 20 generic messages. Offerloop lets you batch-generate personalized emails while maintaining the quality of hand-written outreach."
  },
  {
    question: "What universities does Offerloop have alumni data for?",
    answer: "Offerloop's database covers alumni from every university - not just top-20 schools. Whether you attend USC, UCLA, University of Michigan, NYU, Georgetown, UPenn, or any other school, you can search for alumni by university name and filter by company, role, location, and industry."
  }
];

const howToSteps = [
  { name: "Find", text: "Search Offerloop's 2.2 billion contacts by university name to find alumni at any company, role, or location. Filter by graduation year, industry, and seniority level." },
  { name: "Understand", text: "Review each alum's career trajectory, current role, and shared connections beyond just your university - clubs, majors, hometowns, and mutual contacts." },
  { name: "Reach", text: "Generate a personalized alumni outreach email with Offerloop's AI that leads with your shared school connection and references specific details from their career path. Send through Gmail." },
  { name: "Track", text: "Monitor every alumni conversation in Offerloop's Network Tracker. See who responded, schedule follow-ups, and build a lasting professional network." }
];

const AlumniOutreach = () => {
  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>Alumni Networking Outreach for College Students | Offerloop</title>
        <meta name="description" content="Find and email alumni at any company. Search 2.2B verified contacts by university, generate personalized outreach, and track responses with Offerloop." />
        <link rel="canonical" href="https://offerloop.ai/alumni-outreach" />
        <meta property="og:title" content="Alumni Networking Outreach for College Students | Offerloop" />
        <meta property="og:description" content="Find alumni at any company, generate personalized outreach emails, and track networking conversations." />
        <meta property="og:url" content="https://offerloop.ai/alumni-outreach" />
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
          "name": "How to Network with Alumni Using Offerloop",
          "description": "A step-by-step guide to finding and emailing university alumni for career networking using Offerloop.",
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
        <p className="text-sm font-medium mb-4" style={{ color: '#3B82F6', letterSpacing: '0.02em' }}>ALUMNI NETWORKING</p>
        <h1 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.025em', color: '#0F172A', marginBottom: '20px' }}>
          Find & Email <span style={{ color: '#3B82F6' }}>Alumni</span> at Any Company
        </h1>
        <p style={{ fontSize: '17px', lineHeight: 1.7, color: '#64748B', maxWidth: '620px' }}>
          Your university network is your strongest recruiting asset. Offerloop helps you find alumni at target companies, generate personalized outreach, and track every conversation - all in one place.
        </p>
      </section>

      {/* Content Section 1 */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          How do I reach out to alumni for career advice?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Alumni outreach starts with finding the right people. Most university alumni directories are incomplete, outdated, and limited to people who opted in. The best approach combines your school's directory with external tools to build a comprehensive list of alumni in your target industry.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Your outreach email should immediately establish the school connection - it's the reason they'll open your email and the reason they'll respond. After that, demonstrate genuine curiosity about their specific career path. Avoid generic questions like "What's it like working at [company]?" Instead, ask about their transition from one role to another or what surprised them about their industry.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Offerloop lets you search 2.2 billion contacts by university to find alumni at any company in the world. The AI generates emails that lead with your shared school connection and reference specific details from each alum's career - making every email feel personal and thoughtful.
        </p>
      </section>

      {/* Content Section 2 */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          Why is alumni networking more effective than cold outreach?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Shared alma mater is one of the strongest connection points in professional networking. Studies show that alumni are 2-3 times more likely to respond to a current student from their school compared to a stranger. There's an implicit social contract - they benefited from alumni help when they were students, and they want to pay it forward.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Beyond higher response rates, alumni conversations tend to be more candid and helpful. Alumni are more willing to share honest advice about their firm, introduce you to colleagues, and advocate for you during the hiring process. A single strong alumni connection can open doors that dozens of cold emails cannot.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Offerloop automatically identifies shared university connections and uses them as the primary personalization angle. The AI knows that an email from a "fellow Trojan" or "fellow Wolverine" will resonate differently than a generic networking request - and it writes accordingly.
        </p>
      </section>

      {/* Content Section 3 */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          How do I build a systematic alumni networking strategy?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          The most successful students treat alumni networking like a funnel. Start by identifying 50-100 alumni across your target firms and roles. Prioritize those with the strongest connection points: same major, same student org, same hometown, or recent graduates who remember what recruiting was like.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Send 10-15 personalized emails per week, track who responds, and schedule calls within a few days of their reply. After each call, send a thank-you email and add any referrals they mention to your pipeline. This systematic approach ensures you're always building momentum rather than scrambling at the last minute.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Offerloop was built for exactly this workflow. Search for alumni, generate personalized emails, send through Gmail, and track every conversation in one dashboard. The Network Tracker shows your entire pipeline - Sent, Replied, Scheduled, Completed - so you never miss a follow-up or lose track of a warm connection.
        </p>
      </section>

      {/* How It Works */}
      <section className="px-6 py-16" style={{ background: '#FAFBFF' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '32px', textAlign: 'center' }}>
            How Offerloop Works for Alumni Outreach
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

export default AlumniOutreach;
