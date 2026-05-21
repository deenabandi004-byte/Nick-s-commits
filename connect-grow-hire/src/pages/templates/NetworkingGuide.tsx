import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import offerloopLogo from '../../assets/offerloop_logo2.png';
import { ArrowRight } from 'lucide-react';
import type { Company } from '@/data/companies';
import BeehiivPopup from '@/components/BeehiivPopup';
import ExitIntentPopup from '@/components/ExitIntentPopup';
import SEOHead from '@/components/SEOHead';
import { generateMeta } from '@/utils/generateMeta';

interface Props {
  company: Company;
}

const industryLabels: Record<string, string> = {
  'consulting': 'Management Consulting',
  'investment-banking': 'Investment Banking',
  'private-equity': 'Private Equity',
  'tech': 'Technology',
  'finance': 'Finance',
};

const industrySubtitles: Record<string, string> = {
  'consulting': 'Consulting recruiting is driven by relationships. Getting your name in front of the right people at the right time is often the difference between landing an interview and being filtered out.',
  'investment-banking': 'Investment banking recruiting is one of the most competitive processes on any campus. Internal referrals and networking are the primary way students land interviews at top banks.',
  'private-equity': 'Private equity recruiting is notoriously selective and relationship-driven. Most PE roles are filled through a tight network of referrals from investment banking analysts and internal connections.',
  'tech': 'Tech recruiting rewards preparation and persistence. While technical skills matter most, networking with current employees can help you get referrals that move your resume to the top of the pile.',
  'finance': 'Finance recruiting at elite firms is intensely competitive. Building relationships with current employees gives you a significant edge over candidates who rely solely on online applications.',
};

function getFaqData(company: Company) {
  const industry = industryLabels[company.industry] || company.industry;
  return [
    {
      question: `How do I find ${company.name} employees to network with?`,
      answer: `The best approach is to search for ${company.name} employees who share a connection with you, such as alumni from your university, people who studied your major, or professionals in your target division. Offerloop lets you search across 2.2 billion verified contacts with queries like "${company.name} analysts who went to [your school]." LinkedIn is another option, but it does not provide verified email addresses.`,
    },
    {
      question: `What should I say in a cold email to someone at ${company.name}?`,
      answer: `Keep your email under 150 words. Open with who you are and why you are emailing this specific person (shared school, shared background, interest in their division). Ask for a 15-minute meeting. Do not ask for a referral in the first email. Reference something specific about their role or career path to show you have done your research.`,
    },
    {
      question: `When is the best time to network with ${company.name} employees?`,
      answer: `Start networking 3 to 6 months before recruiting season begins. For ${industry} roles, this typically means reaching out in late spring or early summer for fall recruiting cycles. Send emails Tuesday through Thursday between 8 AM and 10 AM in the recipient's time zone for the best response rates.`,
    },
    {
      question: `Should I network with junior or senior people at ${company.name}?`,
      answer: `Start with junior employees (analysts and associates with 1 to 3 years of experience). They recently went through the same recruiting process, have the most relevant advice, and are more likely to respond to cold outreach. Once you build relationships with junior employees, they can sometimes introduce you to more senior professionals internally.`,
    },
    {
      question: `How many people at ${company.name} should I reach out to?`,
      answer: `Aim to connect with 8 to 15 people at ${company.name} over the course of a recruiting cycle. This gives you enough conversations to understand the firm's culture, get diverse perspectives on the recruiting process, and build genuine relationships that could lead to referrals. Quality of conversations matters more than quantity of outreach.`,
    },
  ];
}

function getHowToSteps(company: Company) {
  return [
    { name: `Find ${company.name} employees`, text: `Search for ${company.name} professionals who share a connection with you. Look for alumni from your university, people in your target division, or employees who transitioned from similar backgrounds.` },
    { name: 'Craft personalized outreach', text: `Write a concise, personalized email that references the recipient's specific role, background, or division at ${company.name}. Mention why you are reaching out to them specifically.` },
    { name: 'Prepare for your meeting', text: `Research the person's career path and prepare thoughtful questions about their experience at ${company.name}. Focus on their division, the recruiting process, and what they wish they had known as a student.` },
    { name: 'Track and follow up', text: 'Send a thank-you note within 24 hours. Follow up periodically with updates on your recruiting progress. Keep track of every conversation in your networking pipeline so nothing falls through the cracks.' },
  ];
}

const NetworkingGuide = ({ company }: Props) => {
  const industry = industryLabels[company.industry] || company.industry;
  const subtitle = industrySubtitles[company.industry] || '';
  const faqData = getFaqData(company);
  const howToSteps = getHowToSteps(company);
  const divisionsText = company.divisions.join(', ');
  const cultureWords = company.culture.split(', ');
  const recruitsFromText = company.recruits_from.map(r => r === 'non-target' ? 'non-target schools' : `${r} schools`).join(', ');

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <SEOHead {...generateMeta('networking', { company: company.name })} ogType="article" />
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
          "name": `How to Network at ${company.name} as a College Student`,
          "description": `Step-by-step guide to building a professional network at ${company.name} through cold email outreach and meetings.`,
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
        <p className="text-sm font-medium mb-4" style={{ color: '#3B82F6', letterSpacing: '0.02em' }}>NETWORKING GUIDE</p>
        <h1 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.025em', color: '#0F172A', marginBottom: '20px' }}>
          How to Network at <span style={{ color: '#3B82F6' }}>{company.name}</span> as a College Student
        </h1>
        <p style={{ fontSize: '17px', lineHeight: 1.7, color: '#64748B', maxWidth: '620px' }}>
          {subtitle}
        </p>
      </section>

      {/* Quick Info */}
      <section className="px-6 pb-8" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-[3px] p-4" style={{ border: '1px solid #E2E8F0', background: '#FAFBFF' }}>
            <p className="text-xs font-medium mb-1" style={{ color: '#94A3B8' }}>Industry</p>
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{industry}</p>
          </div>
          <div className="rounded-[3px] p-4" style={{ border: '1px solid #E2E8F0', background: '#FAFBFF' }}>
            <p className="text-xs font-medium mb-1" style={{ color: '#94A3B8' }}>Culture</p>
            <p className="text-sm font-semibold capitalize" style={{ color: '#0F172A' }}>{cultureWords.slice(0, 2).join(', ')}</p>
          </div>
          <div className="rounded-[3px] p-4" style={{ border: '1px solid #E2E8F0', background: '#FAFBFF' }}>
            <p className="text-xs font-medium mb-1" style={{ color: '#94A3B8' }}>Recruits From</p>
            <p className="text-sm font-semibold capitalize" style={{ color: '#0F172A' }}>{recruitsFromText}</p>
          </div>
        </div>
      </section>

      {/* Section 1: Why Networking Matters */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          Why Networking at {company.name} Matters
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          {company.name} receives thousands of applications every recruiting cycle. The students who land interviews almost always have internal advocates who vouch for their candidacy. At a firm known for being {company.culture}, building genuine relationships with current employees is one of the most effective ways to stand out from the applicant pool and demonstrate that you understand the firm's values.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Networking also gives you information that is not available anywhere else. Through conversations with {company.name} employees, you will learn about specific team dynamics, unwritten cultural norms, what interviewers actually look for, and which divisions are actively hiring. This intelligence is invaluable for tailoring your application and performing well in interviews. Students who network effectively often cite their conversations as the single biggest factor in their success.
        </p>
      </section>

      {/* Section 2: Who to Reach Out To */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          Who Should You Reach Out to at {company.name}?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          {company.name} has several major divisions: {divisionsText}. Your target contacts should align with the division you are most interested in. Junior employees (1 to 3 years of experience) are your best bet for initial outreach because they recently went through the recruiting process, remember what it was like, and are generally more responsive to cold emails from students.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Prioritize contacts who share something in common with you. Alumni from your university are the strongest targets, followed by people who studied your major, worked in a similar field before joining {company.name}, or are involved in organizations you belong to. These shared connections give you a natural reason to reach out and significantly increase your response rate.
        </p>
        <div className="rounded-[3px] p-5 mt-4" style={{ background: '#FAFBFF', border: '1px solid #E2E8F0' }}>
          <p className="text-sm font-semibold mb-2" style={{ color: '#0F172A' }}>Key divisions at {company.name}:</p>
          <div className="flex flex-wrap gap-2">
            {company.divisions.map((div, i) => (
              <span key={i} className="text-xs font-medium px-3 py-1.5 rounded-full" style={{ background: '#FAFBFF', color: '#3B82F6' }}>{div}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Section 3: Cold Email */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          How to Write a Cold Email to a {company.name} Employee
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          The best cold emails to {company.name} employees are short (under 150 words), personalized to the specific recipient, and include a clear, low-commitment ask. Do not ask for a referral in your first email. Instead, ask for a 15-minute conversation to learn about their experience. If the conversation goes well, referrals often happen naturally.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '20px' }}>
          Here is a proven template you can adapt:
        </p>
        <div className="rounded-[3px] p-6" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: '#3B82F6' }}>Sample Email Template</p>
          <div style={{ fontSize: '14px', lineHeight: 1.8, color: '#334155' }}>
            <p style={{ marginBottom: '4px' }}><strong>Subject:</strong> [Your University] student, question about {company.name}'s [Division]</p>
            <p style={{ marginBottom: '12px', color: '#94A3B8', fontSize: '13px' }}>___</p>
            <p style={{ marginBottom: '8px' }}>Hi [First Name],</p>
            <p style={{ marginBottom: '8px' }}>
              I'm a [year] at [University] studying [major]. I came across your profile and was interested to see that you work in {company.name}'s [Division] group. [One specific, personalized sentence referencing their background.]
            </p>
            <p style={{ marginBottom: '8px' }}>
              I'm exploring {industry.toLowerCase()} roles and am particularly drawn to {company.name} because [one genuine reason]. I'd really value hearing your perspective on the team and the recruiting process.
            </p>
            <p style={{ marginBottom: '8px' }}>Would you have 15 minutes for a quick call?</p>
            <p style={{ marginBottom: '4px' }}>Best,</p>
            <p>[Your Name]</p>
            <p style={{ color: '#64748B', fontSize: '13px' }}>[University] '[Grad Year] | [Major]</p>
          </div>
        </div>
      </section>

      {/* Section 4: Meeting Prep */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          How to Prepare for Your {company.name} Meeting
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Once someone at {company.name} agrees to a meeting, preparation is critical. You want to make the most of their time and leave a strong impression. Here are five things to do before every conversation:
        </p>
        <ul className="space-y-3 mb-4">
          {[
            `Research their career path thoroughly. Review their LinkedIn profile, any articles they have written, and their tenure at ${company.name}. Know their division, role, and approximate years of experience.`,
            `Prepare 5 to 7 specific questions. Avoid questions you could answer with a Google search. Focus on their personal experience: what surprised them about the role, what they would do differently, and how ${company.name}'s culture compares to what they expected.`,
            `Know ${company.name}'s recent news. Read about recent deals, product launches, or company initiatives relevant to their division. Referencing something current shows genuine interest and helps you stand out from other students.`,
            'Have your "story" ready. Be prepared to explain your background, what you are interested in, and why you are exploring this specific career path in under 60 seconds. Practice until it sounds natural, not rehearsed.',
            'Plan your follow-up. Before the call even starts, decide when and how you will follow up. Send a thank-you email within 24 hours that references a specific takeaway from the conversation.',
          ].map((item, i) => (
            <li key={i} className="flex gap-3" style={{ fontSize: '15px', lineHeight: 1.7, color: '#475569' }}>
              <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: '#FAFBFF', color: '#3B82F6', marginTop: '2px' }}>{i + 1}</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* How It Works */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '20px' }}>
          4 Steps to Network at {company.name} with Offerloop
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
          <Link to={`/meeting/${company.slug}`} style={{ display: 'block', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#fff', textDecoration: 'none', transition: 'border-color 0.15s ease' }} onMouseEnter={e => (e.currentTarget.style.borderColor = '#3B82F6')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#E2E8F0')}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>{company.name} Meeting Guide</p>
            <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5 }}>Questions to ask, how to prepare, and follow-up templates.</p>
          </Link>
          <Link to={`/cold-email/${company.industry}`} style={{ display: 'block', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#fff', textDecoration: 'none', transition: 'border-color 0.15s ease' }} onMouseEnter={e => (e.currentTarget.style.borderColor = '#3B82F6')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#E2E8F0')}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>{industryLabels[company.industry] || company.industry} Cold Email Guide</p>
            <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5 }}>Templates and tips for cold emailing in {industryLabels[company.industry]?.toLowerCase() || company.industry}.</p>
          </Link>
          <Link to="/blog" style={{ display: 'block', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#fff', textDecoration: 'none', transition: 'border-color 0.15s ease' }} onMouseEnter={e => (e.currentTarget.style.borderColor = '#3B82F6')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#E2E8F0')}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>Offerloop Blog</p>
            <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5 }}>Networking strategies, recruiting tips, and career advice.</p>
          </Link>
          {company.slug === 'mckinsey' && (
            <Link to="/blog/cold-email-mckinsey-consultant" style={{ display: 'block', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#fff', textDecoration: 'none', transition: 'border-color 0.15s ease' }} onMouseEnter={e => (e.currentTarget.style.borderColor = '#2563EB')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#E2E8F0')}>
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>McKinsey Cold Email Template</p>
              <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5 }}>Step-by-step guide to cold emailing McKinsey consultants with real examples.</p>
            </Link>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20" style={{ background: '#FAFBFF' }}>
        <div className="text-center" style={{ maxWidth: '560px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 400, lineHeight: 1.15, color: '#0F172A', marginBottom: '16px' }}>
            Find {company.name} employees on Offerloop
          </h2>
          <p style={{ fontSize: '15px', color: '#64748B', marginBottom: '28px' }}>
            Search 2.2B verified contacts. Get real email addresses. Send personalized outreach in seconds.
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

export default NetworkingGuide;
