import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import offerloopLogo from '../assets/offerloop_logo2.png';

const faqData = [
  {
    question: "What is a meeting in the context of recruiting?",
    answer: "A meeting is an informal 15-30 minute conversation between a student and a professional, usually over the phone or Zoom. It's not a formal interview - it's an opportunity to learn about someone's career, ask questions about their firm, and build a relationship that may lead to a referral or mentorship. Meetings are the backbone of consulting, banking, and tech recruiting."
  },
  {
    question: "How do I ask someone for a meeting without being awkward?",
    answer: "Keep your request specific and low-commitment. Instead of 'Can we get coffee sometime?', try 'Would you have 15 minutes this week for a quick call? I'm exploring careers in [industry] and your transition from [previous role] to [current role] really resonated with me.' Specificity shows you've done your research, and a defined time commitment makes it easy to say yes."
  },
  {
    question: "What questions should I ask during a meeting?",
    answer: "Ask questions that show genuine curiosity and can't be answered by Google: 'What surprised you most about the transition from school to your role?', 'What would you do differently if you were recruiting again?', 'What does a typical week look like in your group?' Avoid asking about salary, work-life balance complaints, or anything that sounds like you're evaluating whether the job is worth it."
  },
  {
    question: "How do I prepare for a meeting?",
    answer: "Research the person's background (LinkedIn, company bio, news mentions), prepare 5-7 specific questions, have a 30-second intro about yourself ready, and know why you're talking to this person specifically. Offerloop's Meeting Prep feature generates a comprehensive PDF prep document for each conversation with background research, suggested talking points, and personalized questions."
  },
  {
    question: "Should I send a thank-you email after a meeting?",
    answer: "Always - within 24 hours. Reference something specific from your conversation to show you were listening. Keep it to 3-4 sentences: thank them, mention a specific takeaway, and leave the door open for future contact. This is also the natural moment to ask for a referral or an introduction if the conversation went well."
  }
];

const howToSteps = [
  { name: "Find", text: "Search Offerloop's 2.2 billion contacts to find professionals in your target industry. Filter by company, role, university, and location to identify ideal meeting candidates." },
  { name: "Understand", text: "Review each contact's professional background and career trajectory. Offerloop's Meeting Prep generates a PDF with talking points, background research, and personalized questions for each conversation." },
  { name: "Reach", text: "Generate a personalized meeting request email with Offerloop's AI. Each email references the contact's background and proposes a specific, low-commitment ask. Send directly through Gmail." },
  { name: "Track", text: "Monitor every meeting in Offerloop's Network Tracker - from initial outreach to scheduled call to completed conversation. Never lose track of a relationship." }
];

const MeetingNetworking = () => {
  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>Meeting Networking Guide for College Students | Offerloop</title>
        <meta name="description" content="Request meetings, prepare with AI-generated prep PDFs, and track your networking conversations. The complete meeting toolkit for students." />
        <link rel="canonical" href="https://offerloop.ai/meeting-networking" />
        <meta property="og:title" content="Meeting Networking Guide for College Students | Offerloop" />
        <meta property="og:description" content="The complete meeting toolkit: find contacts, send personalized requests, prep with AI, and track conversations." />
        <meta property="og:url" content="https://offerloop.ai/meeting-networking" />
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
          "name": "How to Set Up and Prepare for Meetings",
          "description": "A step-by-step guide to requesting, preparing for, and tracking meeting networking conversations using Offerloop.",
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
        <p className="text-sm font-medium mb-4" style={{ color: '#3B82F6', letterSpacing: '0.02em' }}>MEETING NETWORKING</p>
        <h1 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.025em', color: '#0F172A', marginBottom: '20px' }}>
          The Complete <span style={{ color: '#3B82F6' }}>Meeting</span> Toolkit for College Students
        </h1>
        <p style={{ fontSize: '17px', lineHeight: 1.7, color: '#64748B', maxWidth: '620px' }}>
          Meetings are how students break into consulting, banking, and tech. Offerloop handles the entire workflow - finding contacts, sending requests, preparing for conversations, and tracking follow-ups.
        </p>
      </section>

      {/* Content Section 1 */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          How do I request a meeting with someone I've never met?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          A strong meeting request has three elements: a personalized reason for reaching out, a brief introduction of yourself, and a specific ask. The most important part is the first sentence - it needs to give them a reason to keep reading. "I noticed you transitioned from [X] to [Y] at [Company]" is much stronger than "I'm a student interested in your industry."
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Keep the request under 80 words and propose a specific format: "Would you have 15 minutes for a quick phone call this week or next?" This respects their time and makes it easy to say yes. Avoid suggesting in-person coffee unless they're in your city and you have a strong connection.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Offerloop's AI generates personalized meeting requests for every contact in your pipeline. Each email references specific details from the person's background - their career transitions, shared alma mater, or current projects - so your request feels genuine and thoughtful rather than templated.
        </p>
      </section>

      {/* Content Section 2 */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          How should I prepare for a meeting?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Preparation is what separates a memorable meeting from a forgettable one. Before any call, you should know the person's career trajectory, their current role and team, any shared connections, and 5-7 specific questions you want to ask. The more you prepare, the more valuable the conversation - for both of you.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Your questions should show that you've done your research. Ask about things you can't find on Google: their decision-making process when choosing between firms, what their first six months looked like, or what they wish they'd known before starting. These questions lead to genuine insights and memorable conversations.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Offerloop's Meeting Prep feature generates a comprehensive PDF for each conversation. It includes background research on the person, their career timeline, suggested talking points based on your shared connections, and personalized questions tailored to their experience. Students save 20-30 minutes of research per conversation.
        </p>
      </section>

      {/* Content Section 3 */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          How do I keep track of all my meeting conversations?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          During peak recruiting season, you might have 5-10 meetings per week across multiple firms and industries. Without a tracking system, you'll forget who said what, miss follow-up emails, and lose track of referrals. This isn't just disorganized - it's a missed opportunity, since each conversation builds on the last.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          The best tracking system captures the full lifecycle: initial outreach, response, scheduled call, completed conversation, thank-you sent, and any referrals or next steps. Spreadsheets work for the first 10 contacts, but they become unmanageable fast.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Offerloop's Network Tracker automatically logs every email you send and organizes contacts into pipeline stages - Sent, Replied, Scheduled, Completed. You can see your entire networking funnel at a glance, know exactly who needs a follow-up, and never let a warm conversation go cold.
        </p>
      </section>

      {/* How It Works */}
      <section className="px-6 py-16" style={{ background: '#FAFBFF' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '32px', textAlign: 'center' }}>
            How Offerloop Works for Meeting Networking
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

export default MeetingNetworking;
