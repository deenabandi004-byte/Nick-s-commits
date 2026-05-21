import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { Company } from '@/data/companies';
import BeehiivPopup from '@/components/BeehiivPopup';
import offerloopLogo from '../../assets/offerloop_logo2.png';
import ExitIntentPopup from '@/components/ExitIntentPopup';
import SEOHead from '@/components/SEOHead';
import { generateMeta } from '@/utils/generateMeta';

interface Props {
  company: Company;
}

const industryLabels: Record<string, string> = {
  'consulting': 'consulting',
  'investment-banking': 'investment banking',
  'private-equity': 'private equity',
  'tech': 'tech',
  'finance': 'finance',
};

function getQuestions(company: Company) {
  const ind = company.industry;

  const roleQuestions = ind === 'consulting' ? [
    `What does a typical week look like for you at ${company.name}?`,
    `How much variety do you get across different projects and industries?`,
    `What skills from your pre-${company.name} experience do you use most often?`,
    `How is staffing handled? Do you get to choose which projects you work on?`,
    `What's the most challenging part of the ${company.divisions[0]} work at ${company.name}?`,
  ] : ind === 'investment-banking' ? [
    `What does a typical week look like in ${company.name}'s ${company.divisions[0]} group?`,
    `How much client interaction do you get as a junior banker?`,
    `What types of deals has your group been working on recently?`,
    `How do analysts contribute to live deal execution at ${company.name}?`,
    `What skills have you developed most since joining ${company.name}?`,
  ] : ind === 'private-equity' ? [
    `What does the deal sourcing process look like at ${company.name}?`,
    `How involved are junior team members in due diligence?`,
    `What types of companies does ${company.name} typically look at in ${company.divisions[0]}?`,
    `How does the work at ${company.name} compare to your previous experience?`,
    `What is the most intellectually challenging part of the role?`,
  ] : ind === 'tech' ? [
    `What does a typical sprint or work cycle look like on your team at ${company.name}?`,
    `How much autonomy do you have over the projects you work on?`,
    `What tech stack does your team use at ${company.name}?`,
    `How do cross-functional teams collaborate at ${company.name}?`,
    `What has surprised you most about working at ${company.name}?`,
  ] : [
    `What does a typical week look like in your role at ${company.name}?`,
    `What types of projects have you been working on recently?`,
    `How much do you interact with other teams at ${company.name}?`,
    `What skills have been most important in your role?`,
    `What has been the most rewarding project you've worked on at ${company.name}?`,
  ];

  const cultureQuestions = [
    `How would you describe the culture at ${company.name} in your own words?`,
    `What is the mentorship structure like for junior employees?`,
    `How does ${company.name} support professional development and growth?`,
    `What do you enjoy most about working at ${company.name}?`,
    `Is there anything about the culture that surprised you when you joined?`,
  ];

  const recruitingQuestions = ind === 'consulting' ? [
    `What made your application to ${company.name} stand out?`,
    `How important is networking in the ${company.name} recruiting process?`,
    `What is the best way to prepare for ${company.name}'s case interviews?`,
    `Are there specific experiences or backgrounds that ${company.name} values?`,
    `What advice would you give to a student applying to ${company.name} this cycle?`,
  ] : ind === 'investment-banking' ? [
    `How important was networking in your path to ${company.name}?`,
    `What did the superday experience at ${company.name} look like?`,
    `What technical topics should I focus on for ${company.name}'s interviews?`,
    `Are there specific things ${company.name} looks for beyond technical skills?`,
    `What would you do differently if you were going through recruiting again?`,
  ] : [
    `How important was networking in your path to ${company.name}?`,
    `What did the interview process at ${company.name} look like?`,
    `What should I prioritize to prepare for ${company.name}'s interviews?`,
    `What does ${company.name} look for in candidates beyond technical ability?`,
    `What advice would you give to someone applying to ${company.name} this cycle?`,
  ];

  return { roleQuestions, cultureQuestions, recruitingQuestions };
}

function getFaqData(company: Company) {
  const ind = industryLabels[company.industry] || company.industry;
  return [
    {
      question: `How long should a meeting with a ${company.name} employee be?`,
      answer: `Plan for 15 to 20 minutes. This is long enough to build a genuine connection and ask meaningful questions, but short enough to respect their time. Always ask for 15 minutes when scheduling, as this makes it easy for them to say yes. If the conversation is going well, they will often extend it naturally.`,
    },
    {
      question: `What should I NOT ask during a ${company.name} meeting?`,
      answer: `Avoid asking about compensation, hours, or work-life balance directly. Do not ask questions you could answer with a simple Google search (like "What does ${company.name} do?"). Never ask for a referral during the first conversation. And do not dominate the conversation by talking about yourself for more than 30 percent of the time.`,
    },
    {
      question: `How should I follow up after a ${company.name} meeting?`,
      answer: `Send a thank-you email within 24 hours. Reference a specific topic from your conversation and mention a concrete action you plan to take based on their advice. Keep the follow-up under 100 words. Then check in periodically (every 4 to 6 weeks) with brief updates on your recruiting progress.`,
    },
    {
      question: `How many meetings should I have with ${company.name} employees?`,
      answer: `Aim for 3 to 5 meetings at ${company.name} over the course of a recruiting cycle. This gives you a well-rounded perspective on the firm and builds enough internal connections that someone is likely to advocate for you during the hiring process. Spread your conversations across different divisions or teams.`,
    },
    {
      question: `Is a meeting with a ${company.name} employee an interview?`,
      answer: `Technically no, but in ${ind} recruiting, meetings are often informal evaluations. The person you speak with may share their impression of you with the recruiting team. Treat every conversation as an opportunity to make a positive impression: be prepared, ask thoughtful questions, and be genuinely engaged.`,
    },
  ];
}

const MeetingGuide = ({ company }: Props) => {
  const faqData = getFaqData(company);
  const { roleQuestions, cultureQuestions, recruitingQuestions } = getQuestions(company);
  const ind = industryLabels[company.industry] || company.industry;

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <SEOHead {...generateMeta('meeting', { company: company.name })} ogType="article" />
      <Helmet>
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
        <p className="text-sm font-medium mb-4" style={{ color: '#3B82F6', letterSpacing: '0.02em' }}>MEETING GUIDE</p>
        <h1 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.025em', color: '#0F172A', marginBottom: '20px' }}>
          Meeting Guide for <span style={{ color: '#3B82F6' }}>{company.name}</span>
        </h1>
        <p style={{ fontSize: '17px', lineHeight: 1.7, color: '#64748B', maxWidth: '620px' }}>
          Everything you need to request, prepare for, and follow up on a meeting with a {company.name} employee. From the initial email to the thank-you note, this guide covers every step.
        </p>
      </section>

      {/* Section 1: How to Request */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          How to Request a Meeting at {company.name}
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          The key to getting a "yes" is making your request specific, concise, and easy to accept. Ask for exactly 15 minutes (not "some time" or "whenever works"). Mention a specific reason you want to talk to this person, not just their company. And always provide your availability to reduce friction.
        </p>

        <div className="rounded-[3px] p-6" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: '#3B82F6' }}>Sample Meeting Request Email</p>
          <div style={{ fontSize: '14px', lineHeight: 1.8, color: '#334155' }}>
            <p style={{ marginBottom: '4px' }}><strong>Subject:</strong> [University] student, 15 min on your {company.name} experience</p>
            <p style={{ marginBottom: '12px', color: '#94A3B8', fontSize: '13px' }}>___</p>
            <p style={{ marginBottom: '8px' }}>Hi [First Name],</p>
            <p style={{ marginBottom: '8px' }}>I'm a [year] at [University] studying [major]. I came across your profile and was interested to see that you work in {company.name}'s {company.divisions[0]} group. [One personalized sentence about their background or career path.]</p>
            <p style={{ marginBottom: '8px' }}>I'm exploring {ind} careers and would love to hear about your experience at {company.name}. Would you have 15 minutes for a quick call? I'm flexible and happy to work around your schedule.</p>
            <p>Best,<br />[Your Name]<br /><span style={{ color: '#64748B', fontSize: '13px' }}>[University] '[Grad Year] | [Major]</span></p>
          </div>
        </div>
      </section>

      {/* Section 2: How to Prepare */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          How to Prepare for Your {company.name} Meeting
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Preparation is what separates a forgettable conversation from one that leads to a referral. Here is your pre-chat checklist:
        </p>
        <div className="space-y-3">
          {[
            { title: 'Research their background', desc: `Review their LinkedIn profile thoroughly. Know their current role, division (${company.divisions.join(', ')}), and tenure at ${company.name}. Note any shared experiences.` },
            { title: `Study ${company.name}'s recent news`, desc: `Read about recent deals, product launches, or company developments. Being able to reference something current shows genuine interest and helps you stand out.` },
            { title: 'Prepare 7 to 10 questions', desc: 'Have more questions than you need so the conversation flows naturally. Prioritize questions that cannot be answered by a Google search.' },
            { title: 'Practice your "story"', desc: 'Be ready to explain who you are, what you are interested in, and why you are exploring this career path in under 60 seconds. Keep it natural and conversational.' },
            { title: 'Set up your environment', desc: 'If the call is virtual, test your camera and microphone. Find a quiet, well-lit space. Have your questions and notes ready but avoid reading from a script.' },
            { title: 'Plan your follow-up in advance', desc: 'Before the call, draft a skeleton thank-you email so you can fill in specifics immediately after the conversation and send it within 24 hours.' },
          ].map((item, i) => (
            <div key={i} className="flex gap-3 rounded-[3px] p-4" style={{ background: '#FAFBFF', border: '1px solid #F1F5F9' }}>
              <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: '#FAFBFF', color: '#3B82F6', marginTop: '2px' }}>&#10003;</span>
              <div>
                <p className="text-sm font-semibold mb-1" style={{ color: '#0F172A' }}>{item.title}</p>
                <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#64748B' }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 3: 15 Questions */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '20px' }}>
          15 Questions to Ask During a {company.name} Meeting
        </h2>

        {/* Role Questions */}
        <div className="mb-8">
          <h3 className="text-base font-semibold mb-3" style={{ color: '#0F172A' }}>Role and Day-to-Day</h3>
          <div className="space-y-2">
            {roleQuestions.map((q, i) => (
              <div key={i} className="flex items-start gap-3 py-2">
                <span className="flex-shrink-0 text-sm font-bold" style={{ color: '#3B82F6', minWidth: '20px' }}>{i + 1}.</span>
                <p className="text-sm" style={{ color: '#334155', lineHeight: 1.6 }}>{q}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Culture Questions */}
        <div className="mb-8">
          <h3 className="text-base font-semibold mb-3" style={{ color: '#0F172A' }}>Culture and Growth</h3>
          <div className="space-y-2">
            {cultureQuestions.map((q, i) => (
              <div key={i} className="flex items-start gap-3 py-2">
                <span className="flex-shrink-0 text-sm font-bold" style={{ color: '#3B82F6', minWidth: '20px' }}>{i + 6}.</span>
                <p className="text-sm" style={{ color: '#334155', lineHeight: 1.6 }}>{q}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recruiting Questions */}
        <div>
          <h3 className="text-base font-semibold mb-3" style={{ color: '#0F172A' }}>Recruiting Process</h3>
          <div className="space-y-2">
            {recruitingQuestions.map((q, i) => (
              <div key={i} className="flex items-start gap-3 py-2">
                <span className="flex-shrink-0 text-sm font-bold" style={{ color: '#3B82F6', minWidth: '20px' }}>{i + 11}.</span>
                <p className="text-sm" style={{ color: '#334155', lineHeight: 1.6 }}>{q}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 4: What NOT to Do */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          What NOT to Do in a {company.name} Meeting
        </h2>
        <div className="space-y-3">
          {[
            { mistake: 'Asking for a referral in the first conversation', why: 'Build a genuine relationship first. If the conversation goes well, referrals often happen naturally or in a follow-up conversation.' },
            { mistake: 'Asking questions you could Google', why: `"What does ${company.name} do?" or "How many employees does ${company.name} have?" signals that you have not done basic research.` },
            { mistake: 'Talking about yourself for more than 30 percent of the time', why: 'The conversation should be about them and their experience. Ask questions and listen actively. People remember good listeners.' },
            { mistake: 'Going over time without asking', why: 'When you hit 15 minutes, say "I know I asked for 15 minutes and I want to be respectful of your time. Is it okay to keep going?" Let them decide.' },
            { mistake: 'Asking about compensation or work-life balance directly', why: 'These are important topics, but asking about them in a first conversation comes across as transactional. You can learn about these from online resources and Glassdoor.' },
          ].map((item, i) => (
            <div key={i} className="rounded-[3px] p-4" style={{ background: '#FFF7ED', border: '1px solid #FED7AA' }}>
              <p className="text-sm font-semibold mb-1" style={{ color: '#9A3412' }}>{item.mistake}</p>
              <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#78350F' }}>{item.why}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 5: Follow Up */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          How to Follow Up After Your {company.name} Meeting
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          The follow-up is where most students drop the ball. A thoughtful thank-you email within 24 hours keeps you top of mind and turns a single conversation into an ongoing relationship. Reference something specific from your chat to show you were genuinely engaged.
        </p>

        <div className="rounded-[3px] p-6" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: '#3B82F6' }}>Follow-Up Email Template</p>
          <div style={{ fontSize: '14px', lineHeight: 1.8, color: '#334155' }}>
            <p style={{ marginBottom: '4px' }}><strong>Subject:</strong> Thank you for your time, [First Name]</p>
            <p style={{ marginBottom: '12px', color: '#94A3B8', fontSize: '13px' }}>___</p>
            <p style={{ marginBottom: '8px' }}>Hi [First Name],</p>
            <p style={{ marginBottom: '8px' }}>Thank you so much for taking the time to speak with me today. Your insights about [specific topic from the conversation] were incredibly helpful. I especially appreciated your point about [specific takeaway].</p>
            <p style={{ marginBottom: '8px' }}>I'm going to [specific action you plan to take based on their advice]. I'll keep you posted on how my recruiting process goes this [season].</p>
            <p style={{ marginBottom: '8px' }}>Thanks again for your generosity with your time.</p>
            <p>Best,<br />[Your Name]</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-16" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px', color: '#0F172A' }}>Frequently Asked Questions</h2>
        {faqData.map((faq, i) => (
          <div key={i} style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', color: '#0F172A' }}>{faq.question}</h3>
            <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#4a5568' }}>{faq.answer}</p>
          </div>
        ))}
      </section>

      {/* Related Resources */}
      <section className="px-6 py-16" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px', color: '#0F172A' }}>Related Resources</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link to={`/networking/${company.slug}`} style={{ display: 'block', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#fff', textDecoration: 'none', transition: 'border-color 0.15s ease' }} onMouseEnter={e => (e.currentTarget.style.borderColor = '#3B82F6')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#E2E8F0')}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>{company.name} Networking Guide</p>
            <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5 }}>Who to reach out to, email templates, and full networking strategy.</p>
          </Link>
          <Link to={`/cold-email/${company.industry}`} style={{ display: 'block', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#fff', textDecoration: 'none', transition: 'border-color 0.15s ease' }} onMouseEnter={e => (e.currentTarget.style.borderColor = '#3B82F6')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#E2E8F0')}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>{industryLabels[company.industry] || company.industry} Cold Email Guide</p>
            <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5 }}>Cold email templates and tips for {industryLabels[company.industry] || company.industry}.</p>
          </Link>
          <Link to="/blog" style={{ display: 'block', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#fff', textDecoration: 'none', transition: 'border-color 0.15s ease' }} onMouseEnter={e => (e.currentTarget.style.borderColor = '#3B82F6')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#E2E8F0')}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>Offerloop Blog</p>
            <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5 }}>Networking strategies, recruiting tips, and career advice.</p>
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20" style={{ background: '#FAFBFF' }}>
        <div className="text-center" style={{ maxWidth: '560px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 400, lineHeight: 1.15, color: '#0F172A', marginBottom: '16px' }}>
            Prep for your {company.name} meeting with Offerloop
          </h2>
          <p style={{ fontSize: '15px', color: '#64748B', marginBottom: '28px' }}>
            Find {company.name} employees, get verified emails, and generate AI-powered meeting prep materials.
          </p>
          <Link
            to="/signin?mode=signup"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-[3px] text-white font-semibold text-base hover:shadow-lg transition-all"
            style={{ background: '#3B82F6' }}
          >
            Get started free <ArrowRight className="w-4 h-4" />
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
      <BeehiivPopup />
      <ExitIntentPopup />
    </div>
  );
};

export default MeetingGuide;
