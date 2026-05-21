import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import offerloopLogo from '../assets/offerloop_logo2.png';

const faqData = [
  {
    question: "Can ChatGPT find email addresses for professionals I want to network with?",
    answer: "No. ChatGPT is a language model that generates text - it cannot look up real contact information, verify email addresses, or access databases of professional contacts. If you ask ChatGPT for someone's email, it will either refuse or make one up. Offerloop has a database of 2.2 billion verified contacts with real, deliverable email addresses."
  },
  {
    question: "Is ChatGPT good for writing networking emails?",
    answer: "ChatGPT can generate decent email templates, but it can't personalize them to a specific recipient because it doesn't know their background, career history, or connection to you. You'd need to manually research each person and feed that context into ChatGPT for every email. Offerloop's AI automatically pulls each contact's background from its database and generates truly personalized emails in seconds."
  },
  {
    question: "Can I use ChatGPT and Offerloop together?",
    answer: "You could, but Offerloop already includes AI email generation that's specifically trained for networking outreach. Unlike ChatGPT, Offerloop's AI has access to each contact's professional background and generates emails that reference specific details. It also sends directly through Gmail and tracks responses - things ChatGPT can't do."
  },
  {
    question: "Does Offerloop use ChatGPT or GPT-4 for its email generation?",
    answer: "Offerloop uses advanced AI models optimized for professional outreach. The key difference from using ChatGPT directly is that Offerloop's AI has access to each contact's verified professional data - company, role, education, career trajectory - and uses that context to generate genuinely personalized emails without any manual research on your part."
  },
  {
    question: "Why can't I just use a free AI tool instead of paying for Offerloop?",
    answer: "Free AI tools like ChatGPT solve one piece of the puzzle - writing text. But effective networking requires finding the right people, accessing their verified email addresses, personalizing each message to their specific background, sending through a professional email client, and tracking responses. Offerloop handles the entire workflow end-to-end. ChatGPT handles only the writing, and even that requires manual context you'd need to research yourself."
  }
];

const comparisonRows = [
  { feature: "Primary Use Case", offerloop: "End-to-end networking outreach", competitor: "General text generation" },
  { feature: "Built for Students", offerloop: true, competitor: false },
  { feature: "Contact Database", offerloop: "2.2B verified contacts", competitor: false },
  { feature: "AI Email Generation", offerloop: "Auto-personalized per contact", competitor: "Generic templates only" },
  { feature: "Gmail Integration", offerloop: true, competitor: false },
  { feature: "Networking Pipeline Tracker", offerloop: true, competitor: false },
  { feature: "Knows Recipient's Background", offerloop: true, competitor: false },
  { feature: "Pricing", offerloop: "Free / $14.99/mo Pro", competitor: "Free / $20/mo Plus" },
];

const CompareChatGPT = () => {
  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>Offerloop vs ChatGPT for Networking | Find Real Contacts | Offerloop</title>
        <meta name="description" content="ChatGPT can write emails but can't find real contact information. Offerloop has 2.2B verified contacts and drafts directly into Gmail. See the difference." />
        <link rel="canonical" href="https://offerloop.ai/compare/chatgpt" />
        <meta property="og:title" content="Offerloop vs ChatGPT for Networking | Offerloop" />
        <meta property="og:description" content="ChatGPT writes generic templates. Offerloop finds real contacts and writes personalized emails. Compare both." />
        <meta property="og:url" content="https://offerloop.ai/compare/chatgpt" />
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
          Offerloop vs <span style={{ color: '#3B82F6' }}>ChatGPT</span>
        </h1>
        <p style={{ fontSize: '17px', lineHeight: 1.7, color: '#64748B', maxWidth: '620px' }}>
          ChatGPT is great at writing text. But networking requires finding real people, accessing verified emails, and sending personalized messages - things ChatGPT can't do. Offerloop handles the full workflow.
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
                <th className="text-center py-4 px-5 text-sm font-semibold" style={{ color: '#64748B' }}>ChatGPT</th>
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
          Can ChatGPT actually help me network for internships?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          ChatGPT can help with one part of networking: writing email drafts. If you describe the person you're emailing and provide their background details, ChatGPT can generate a reasonable template. But that's only about 20% of the networking workflow - and it requires you to manually research each person first.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          The other 80% - finding the right people, accessing their verified email addresses, personalizing messages based on real professional data, sending through Gmail, and tracking responses - ChatGPT simply can't do. It's a text generation tool, not a networking platform.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Offerloop handles the entire workflow. Search 2.2 billion contacts, get verified email addresses, generate AI-personalized emails using each contact's real background data, send directly through Gmail, and track every conversation in your networking pipeline.
        </p>
      </section>

      {/* Content Section 2 */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          What's the problem with using ChatGPT for networking emails?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          The biggest problem is that ChatGPT doesn't know who you're emailing. It can write a generic template for "a consultant at McKinsey," but it can't reference that the person went to your school, worked in the Atlanta office, or transitioned from engineering to consulting. Real personalization - the kind that gets responses - requires specific knowledge about the recipient.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          You could manually research each person and paste their details into ChatGPT, but that takes 10-15 minutes per contact. At 50-100 outreach emails during recruiting season, that's 8-25 hours of pure research - on top of an already demanding schedule.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Offerloop eliminates that research entirely. The AI already has each contact's professional background, education, career trajectory, and company details. It uses this data to generate genuinely personalized emails - the kind that reference specific details and sound hand-written - without you doing any manual research.
        </p>
      </section>

      {/* Content Section 3 */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          How is Offerloop's AI different from ChatGPT?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          ChatGPT is a general-purpose language model. It can write poems, debug code, summarize articles, and generate email templates. It's impressively versatile but knows nothing about the specific person you're trying to email.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Offerloop's AI is purpose-built for networking outreach. It has access to each contact's verified professional data - their current company, role, education, career history, and shared connections with you. When it generates an email, it references real, specific details that make the message feel personal and genuine.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          The result: Offerloop generates emails that are genuinely personalized to each recipient, ready to send in seconds, and delivered directly through your Gmail account. No manual research, no copy-pasting between tools, no tracking conversations in a separate spreadsheet.
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

export default CompareChatGPT;
