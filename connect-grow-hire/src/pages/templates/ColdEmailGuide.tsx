import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { Industry } from '@/data/industries';
import BeehiivPopup from '@/components/BeehiivPopup';
import offerloopLogo from '../../assets/offerloop_logo2.png';
import ExitIntentPopup from '@/components/ExitIntentPopup';
import SEOHead from '@/components/SEOHead';
import { generateMeta } from '@/utils/generateMeta';

interface Props {
  industry: Industry;
}

const industryEmailTips: Record<string, string> = {
  'management-consulting': 'Consulting professionals value structured thinking and conciseness. Your cold email should mirror these qualities: get to the point quickly, show that you have done your research, and make a specific ask. Consultants are trained to be skeptical of vague claims, so be genuine and avoid flattery.',
  'investment-banking': 'Bankers are incredibly busy and scan emails in seconds. Your subject line and opening sentence will determine whether they read further. Keep the entire email under 120 words. Reference their specific group or a recent deal if possible. Bankers respect people who do their homework.',
  'private-equity': 'PE professionals are among the hardest to reach because firms are small and deal flow is intense. Your best approach is to get introduced through a mutual connection, ideally someone in investment banking. If you are cold emailing, demonstrate that you understand the firm\'s investment thesis and portfolio.',
  'tech': 'Tech professionals are generally receptive to cold outreach, especially from students who demonstrate genuine technical curiosity. Reference a specific project, product, or team they work on. Engineers appreciate specificity and dislike generic messages. Product managers value clear communication and structured thinking.',
  'venture-capital': 'VC professionals are relationship-driven by nature, which means they are often open to meeting interesting people. However, they receive a high volume of outreach. Stand out by sharing a unique perspective on a market or company, or by referencing their portfolio companies and investment thesis specifically.',
};

const industrySubjectLines: Record<string, string[]> = {
  'management-consulting': [
    '[University] student, question about [Firm]\'s [Practice] practice',
    'Fellow [Major] major, 15 min on your [Firm] experience',
    '[University] \'[Year], interested in [Firm] [Office]',
    '[Mutual connection] recommended I reach out about [Firm]',
    'Quick question about the [Practice] analyst role at [Firm]',
  ],
  'investment-banking': [
    '[University] \'[Year] interested in [Bank] [Group]',
    'Fellow [University] alum, question about [Bank]\'s [Group]',
    '[University] finance student, 15 min on [Bank] [Group]',
    'Quick question about the analyst experience in [Bank]\'s [Sector] team',
    '[Mutual connection] suggested I reach out about [Bank]',
  ],
  'private-equity': [
    '[University] student, question about [Firm]\'s investment approach',
    'Fellow [University] alum, 15 min on your PE experience at [Firm]',
    'Aspiring PE professional, interested in [Firm]\'s [Sector] portfolio',
    '[University] \'[Year], quick question about [Firm]\'s analyst program',
    '[Mutual connection] recommended I reach out about [Firm]',
  ],
  'tech': [
    '[University] CS student, question about [Company]\'s [Team]',
    'Fellow [University] alum, 15 min on your [Role] experience at [Company]',
    '[University] \'[Year], interested in [Company]\'s [Product/Team]',
    'Quick question about the [Role] intern experience at [Company]',
    'Loved [specific project/feature], would love to learn more about [Team]',
  ],
  'venture-capital': [
    '[University] student interested in [Firm]\'s [Sector] thesis',
    'Fellow [University] alum, 15 min on your VC experience at [Firm]',
    '[University] \'[Year], question about [Firm]\'s analyst program',
    'Interesting perspective on [Market/Trend] relevant to [Firm]\'s portfolio',
    '[Mutual connection] suggested I reach out about [Firm]',
  ],
};

function getFaqData(industry: Industry) {
  return [
    {
      question: `How do I find email addresses for ${industry.name.toLowerCase()} professionals?`,
      answer: `The most reliable method is to use a verified contact database like Offerloop, which has 2.2 billion professional contacts with deliverable email addresses. You can search by company, role, and education to find exactly the right people. Guessing email formats (firstname.lastname@company.com) works sometimes, but bounce rates are high and it does not scale well.`,
    },
    {
      question: `What response rate should I expect from cold emails in ${industry.name.toLowerCase()}?`,
      answer: `With well-personalized emails, expect a 15 to 25 percent response rate for alumni outreach and a 10 to 15 percent response rate for fully cold contacts. Generic, template-style emails typically get under 5 percent. The biggest factor in response rate is personalization quality, not volume.`,
    },
    {
      question: `How long should a cold email to a ${industry.name.toLowerCase()} professional be?`,
      answer: `Keep your email under 150 words. ${industry.name} professionals are busy and often read emails on their phones. A concise message with a clear ask (15-minute meeting) gets far more responses than a long email explaining your career aspirations. Every sentence should earn its place.`,
    },
    {
      question: `When is the best time to send cold emails for ${industry.name.toLowerCase()} networking?`,
      answer: `Send emails Tuesday through Thursday between 8 AM and 10 AM in the recipient's time zone. Start your networking campaign 3 to 6 months before the recruiting season begins. For ${industry.name.toLowerCase()}, this means aligning with the typical application timeline for ${industry.typical_roles[0]} roles.`,
    },
    {
      question: `Should I follow up if I don't hear back from a ${industry.name.toLowerCase()} professional?`,
      answer: `Yes, always send one follow-up email 5 to 7 days after your initial message. Keep it short and reference your previous email. A polite follow-up can double your response rate. After two total emails with no response, move on. Do not send more than two messages to someone who has not replied.`,
    },
  ];
}

const ColdEmailGuide = ({ industry }: Props) => {
  const faqData = getFaqData(industry);
  const tips = industryEmailTips[industry.slug] || '';
  const subjectLines = industrySubjectLines[industry.slug] || [];
  const companiesText = industry.top_companies.join(', ');

  const howToSteps = [
    { name: `Identify your targets at ${industry.name.toLowerCase()} firms`, text: `Search for professionals at ${companiesText} who share a connection with you. Prioritize alumni from your university, people in your target role, and employees with 1 to 3 years of experience.` },
    { name: 'Write a personalized cold email', text: `Craft a concise email (under 150 words) that references the recipient's specific role, company, and background. Include a clear ask for a 15-minute meeting. Avoid generic templates.` },
    { name: 'Send at the right time', text: 'Send your emails Tuesday through Thursday between 8 AM and 10 AM in the recipient\'s time zone. Plan a follow-up 5 to 7 days later if you do not hear back.' },
    { name: 'Track and manage your pipeline', text: 'Keep track of every email you send, every response you receive, and every meeting you schedule. A well-organized pipeline ensures you never lose track of a promising connection.' },
  ];

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <SEOHead {...generateMeta('cold-email', { industry: industry.name })} ogType="article" />
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
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "HowTo",
          "name": `How to Cold Email ${industry.name} Professionals`,
          "description": `Step-by-step guide to cold emailing professionals in ${industry.name.toLowerCase()} as a college student.`,
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
        <p className="text-sm font-medium mb-4" style={{ color: '#3B82F6', letterSpacing: '0.02em' }}>COLD EMAIL GUIDE</p>
        <h1 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.025em', color: '#0F172A', marginBottom: '20px' }}>
          Cold Email Templates for <span style={{ color: '#3B82F6' }}>{industry.name}</span> Recruiting
        </h1>
        <p style={{ fontSize: '17px', lineHeight: 1.7, color: '#64748B', maxWidth: '620px' }}>
          Cold emailing is one of the most effective ways to break into {industry.name.toLowerCase()}. These templates have been refined through thousands of successful outreach campaigns by students targeting {companiesText}.
        </p>
      </section>

      {/* Quick Info */}
      <section className="px-6 pb-8" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-[3px] p-4" style={{ border: '1px solid #E2E8F0', background: '#FAFBFF' }}>
            <p className="text-xs font-medium mb-1" style={{ color: '#94A3B8' }}>Top Companies</p>
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{industry.top_companies.slice(0, 3).join(', ')}</p>
          </div>
          <div className="rounded-[3px] p-4" style={{ border: '1px solid #E2E8F0', background: '#FAFBFF' }}>
            <p className="text-xs font-medium mb-1" style={{ color: '#94A3B8' }}>Entry Roles</p>
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{industry.typical_roles.slice(0, 2).join(', ')}</p>
          </div>
          <div className="rounded-[3px] p-4" style={{ border: '1px solid #E2E8F0', background: '#FAFBFF' }}>
            <p className="text-xs font-medium mb-1" style={{ color: '#94A3B8' }}>Culture</p>
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{industry.culture_notes.split(', ').slice(0, 2).join(', ')}</p>
          </div>
        </div>
      </section>

      {/* Section 1: What They Want to See */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          What {industry.name} Professionals Want to See in a Cold Email
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          {tips}
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Across every industry, three principles hold true: personalize every message to the specific recipient, keep the email under 150 words, and make a clear, low-commitment ask. A request for a 15-minute phone call is almost always the right first step.
        </p>
      </section>

      {/* Section 2: 5 Templates */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '20px' }}>
          5 Cold Email Templates for {industry.name}
        </h2>

        {/* Template 1: Meeting */}
        <div className="rounded-[3px] p-6 mb-5" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: '#3B82F6' }}>Template 1: Meeting Request</p>
          <div style={{ fontSize: '14px', lineHeight: 1.8, color: '#334155' }}>
            <p style={{ marginBottom: '4px' }}><strong>Subject:</strong> [University] student, question about your experience at [Company]</p>
            <p style={{ marginBottom: '12px', color: '#94A3B8', fontSize: '13px' }}>___</p>
            <p style={{ marginBottom: '8px' }}>Hi [First Name],</p>
            <p style={{ marginBottom: '8px' }}>I'm a [year] at [University] studying [major], and I'm exploring careers in {industry.name.toLowerCase()}. I came across your profile and was interested to see that you work at [Company] as a [Role]. [One specific, personalized sentence about their background.]</p>
            <p style={{ marginBottom: '8px' }}>I'd love to hear about your experience and any advice you have for someone preparing for {industry.name.toLowerCase()} recruiting. Would you have 15 minutes for a quick call?</p>
            <p>Best,<br />[Your Name]<br /><span style={{ color: '#64748B', fontSize: '13px' }}>[University] '[Grad Year] | [Major]</span></p>
          </div>
        </div>

        {/* Template 2: Alumni */}
        <div className="rounded-[3px] p-6 mb-5" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: '#3B82F6' }}>Template 2: Alumni Connection</p>
          <div style={{ fontSize: '14px', lineHeight: 1.8, color: '#334155' }}>
            <p style={{ marginBottom: '4px' }}><strong>Subject:</strong> Fellow [University] alum, 15 min on your [Company] experience</p>
            <p style={{ marginBottom: '12px', color: '#94A3B8', fontSize: '13px' }}>___</p>
            <p style={{ marginBottom: '8px' }}>Hi [First Name],</p>
            <p style={{ marginBottom: '8px' }}>I'm a [year] at [University] studying [major]. I noticed in the alumni network that you graduated from [University] in [year] and are now at [Company] in [Role]. As a fellow [University] alum preparing for {industry.name.toLowerCase()} recruiting, I'd love to learn about your path from campus to [Company].</p>
            <p style={{ marginBottom: '8px' }}>Would you be open to a 15-minute call in the next couple of weeks?</p>
            <p>Best,<br />[Your Name]<br /><span style={{ color: '#64748B', fontSize: '13px' }}>[University] '[Grad Year] | [Major]</span></p>
          </div>
        </div>

        {/* Template 3: Post-Event */}
        <div className="rounded-[3px] p-6 mb-5" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: '#3B82F6' }}>Template 3: Post-Event Follow-Up</p>
          <div style={{ fontSize: '14px', lineHeight: 1.8, color: '#334155' }}>
            <p style={{ marginBottom: '4px' }}><strong>Subject:</strong> Great meeting you at [Event Name]</p>
            <p style={{ marginBottom: '12px', color: '#94A3B8', fontSize: '13px' }}>___</p>
            <p style={{ marginBottom: '8px' }}>Hi [First Name],</p>
            <p style={{ marginBottom: '8px' }}>It was great connecting with you at [event] on [day]. I really appreciated your insights about [specific topic they discussed]. It gave me a much clearer picture of what {industry.name.toLowerCase()} work looks like day-to-day.</p>
            <p style={{ marginBottom: '8px' }}>I'd love to continue our conversation if you have time. Would a 15-minute call work sometime this week or next?</p>
            <p>Best,<br />[Your Name]<br /><span style={{ color: '#64748B', fontSize: '13px' }}>[University] '[Grad Year] | [Major]</span></p>
          </div>
        </div>

        {/* Template 4: Informational Interview */}
        <div className="rounded-[3px] p-6 mb-5" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: '#3B82F6' }}>Template 4: Informational Interview Request</p>
          <div style={{ fontSize: '14px', lineHeight: 1.8, color: '#334155' }}>
            <p style={{ marginBottom: '4px' }}><strong>Subject:</strong> [University] [year], question about [Company]'s [Team/Division]</p>
            <p style={{ marginBottom: '12px', color: '#94A3B8', fontSize: '13px' }}>___</p>
            <p style={{ marginBottom: '8px' }}>Hi [First Name],</p>
            <p style={{ marginBottom: '8px' }}>I'm a [year] at [University] and I'm seriously exploring a career in {industry.name.toLowerCase()}. I've been researching [Company]'s [Team/Division] and your background caught my attention because [one specific, genuine reason]. I have a few targeted questions about the {industry.typical_roles[0]} role and the recruiting process.</p>
            <p style={{ marginBottom: '8px' }}>Would you be willing to spend 15 to 20 minutes on a call? I'll come prepared with focused questions to make the most of your time.</p>
            <p>Thank you,<br />[Your Name]<br /><span style={{ color: '#64748B', fontSize: '13px' }}>[University] '[Grad Year] | [Major]</span></p>
          </div>
        </div>

        {/* Template 5: Referral Ask */}
        <div className="rounded-[3px] p-6" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: '#3B82F6' }}>Template 5: Referral Ask (After a Meeting)</p>
          <div style={{ fontSize: '14px', lineHeight: 1.8, color: '#334155' }}>
            <p style={{ marginBottom: '4px' }}><strong>Subject:</strong> Thank you, [First Name], and a quick question</p>
            <p style={{ marginBottom: '12px', color: '#94A3B8', fontSize: '13px' }}>___</p>
            <p style={{ marginBottom: '8px' }}>Hi [First Name],</p>
            <p style={{ marginBottom: '8px' }}>Thank you again for taking the time to chat last [day]. Your advice about [specific topic] was incredibly helpful, and I've already started [specific action based on their advice].</p>
            <p style={{ marginBottom: '8px' }}>I'm planning to apply to [Company]'s [Program/Role] this [season]. If you're comfortable, would you be willing to submit a referral on my behalf? I completely understand if that's not possible. Either way, I'm grateful for the time you've already given me.</p>
            <p>Best,<br />[Your Name]<br /><span style={{ color: '#64748B', fontSize: '13px' }}>[University] '[Grad Year] | [Major]</span></p>
          </div>
        </div>
      </section>

      {/* Section 3: Subject Lines */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          Subject Lines That Get Opened in {industry.name}
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Your subject line determines whether your email gets opened. In {industry.name.toLowerCase()}, the most effective subject lines are specific, personal, and under 60 characters. Here are five proven formulas:
        </p>
        <div className="space-y-3">
          {subjectLines.map((line, i) => (
            <div key={i} className="flex items-start gap-3 rounded-[3px] p-3" style={{ background: '#FAFBFF', border: '1px solid #F1F5F9' }}>
              <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: '#FAFBFF', color: '#3B82F6' }}>{i + 1}</span>
              <p className="text-sm font-medium" style={{ color: '#334155' }}>{line}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 4: Timing and Follow-Up */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          When to Send and How to Follow Up
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Timing matters more than most students realize. The best days to send cold emails are Tuesday, Wednesday, and Thursday. The best times are 8:00 AM to 10:00 AM in the recipient's time zone, when most professionals are checking their inbox before their day gets busy. Avoid Monday mornings (inbox overload after the weekend) and Friday afternoons (mentally checked out).
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          If you do not hear back within 5 to 7 days, send a short follow-up. Keep it under 50 words: reference your previous email, reiterate your ask, and make it easy for them to say yes. A polite follow-up can double your response rate. After two total emails with no response, move on to other contacts.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          For {industry.name.toLowerCase()} specifically, plan your outreach campaign 3 to 6 months before recruiting season begins. This gives you time to build genuine relationships rather than rushing to ask for referrals at the last minute. Early networking also means less competition for people's time, since most students wait until applications are about to open.
        </p>
      </section>

      {/* How It Works */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '20px' }}>
          4 Steps to Cold Email {industry.name} Professionals with Offerloop
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {howToSteps.map((step, i) => (
            <div key={i} className="rounded-[3px] p-5" style={{ border: '1px solid #E2E8F0' }}>
              <div className="flex items-center gap-3 mb-3">
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: '#3B82F6', color: '#fff' }}>{i + 1}</span>
                <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{step.name}</p>
              </div>
              <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#64748B' }}>{step.text}</p>
            </div>
          ))}
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
          <Link to={`/networking/${industry.top_companies[0]?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'mckinsey'}`} style={{ display: 'block', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#fff', textDecoration: 'none', transition: 'border-color 0.15s ease' }} onMouseEnter={e => (e.currentTarget.style.borderColor = '#3B82F6')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#E2E8F0')}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>{industry.top_companies[0]} Networking Guide</p>
            <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5 }}>Full networking playbook for {industry.top_companies[0]}.</p>
          </Link>
          <Link to="/blog" style={{ display: 'block', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#fff', textDecoration: 'none', transition: 'border-color 0.15s ease' }} onMouseEnter={e => (e.currentTarget.style.borderColor = '#3B82F6')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#E2E8F0')}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>Offerloop Blog</p>
            <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5 }}>Networking strategies, recruiting tips, and career advice.</p>
          </Link>
          <Link to="/glossary" style={{ display: 'block', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#fff', textDecoration: 'none', transition: 'border-color 0.15s ease' }} onMouseEnter={e => (e.currentTarget.style.borderColor = '#3B82F6')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#E2E8F0')}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>Networking Glossary</p>
            <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5 }}>Definitions for cold email, meeting, and recruiting terms.</p>
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20" style={{ background: '#FAFBFF' }}>
        <div className="text-center" style={{ maxWidth: '560px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 400, lineHeight: 1.15, color: '#0F172A', marginBottom: '16px' }}>
            Generate a personalized {industry.name.toLowerCase()} cold email with Offerloop AI
          </h2>
          <p style={{ fontSize: '15px', color: '#64748B', marginBottom: '28px' }}>
            Search 2.2B verified contacts at {industry.top_companies.slice(0, 3).join(', ')}, and more. AI writes the email. Gmail sends it.
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
          <p className="text-sm" style={{ color: '#94A3B8' }}>&copy; {new Date().getFullYear()} Offerloop. All rights reserved.</p>
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

export default ColdEmailGuide;
