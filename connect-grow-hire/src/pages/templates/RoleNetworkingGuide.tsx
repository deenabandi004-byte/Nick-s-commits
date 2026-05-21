import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { Role } from '@/data/roles';
import BeehiivPopup from '@/components/BeehiivPopup';
import offerloopLogo from '../../assets/offerloop_logo2.png';
import ExitIntentPopup from '@/components/ExitIntentPopup';
import SEOHead from '@/components/SEOHead';
import { generateMeta } from '@/utils/generateMeta';

interface Props {
  role: Role;
}

const industryLabels: Record<string, string> = {
  'consulting': 'Management Consulting',
  'investment-banking': 'Investment Banking',
  'private-equity': 'Private Equity',
  'tech': 'Technology',
  'finance': 'Finance',
  'venture-capital': 'Venture Capital',
};

function getWhoToNetwork(role: Role) {
  if (role.industry === 'investment-banking') {
    return [
      { title: 'First and second-year analysts', desc: `Junior analysts at ${role.top_employers.slice(0, 3).join(', ')} are the most responsive to cold outreach. They went through the same process recently and can give you the most tactical advice.` },
      { title: 'Associates (3 to 5 years)', desc: 'Associates have a broader perspective on the firm and can often share insights about team dynamics, deal flow, and what differentiates candidates who succeed.' },
      { title: 'University alumni in any group', desc: 'Shared alma mater is the strongest predictor of a response. Even if an alum is in a different group than your target, they can provide warm introductions.' },
      { title: 'Campus recruiters and HR contacts', desc: 'While less common for cold outreach, connecting with the campus recruiting team at info sessions gives you a direct line to the people who manage the hiring pipeline.' },
    ];
  } else if (role.industry === 'consulting') {
    return [
      { title: 'Business Analysts and Associates (1 to 3 years)', desc: `Junior consultants at ${role.top_employers.slice(0, 3).join(', ')} remember the recruiting process vividly and are generally enthusiastic about helping students navigate it.` },
      { title: 'Engagement Managers and Project Leaders', desc: 'Mid-level consultants can share a broader perspective on the firm, practice areas, and what it takes to advance. They are harder to reach but offer deeper insights.' },
      { title: 'Alumni from your university', desc: 'Alumni connections are the single most effective networking channel in consulting. Response rates from alumni are 2 to 3 times higher than cold outreach.' },
      { title: 'Consultants in your target office or practice', desc: 'If you are interested in a specific office or practice area, networking with people in that group shows focused interest and gives you practice-specific insights.' },
    ];
  } else if (role.industry === 'tech') {
    return [
      { title: 'Current interns and recent return-offer recipients', desc: 'People who just completed internships at your target companies have the freshest, most relevant advice about the application and interview process.' },
      { title: `Junior ${role.name.includes('Engineer') ? 'engineers' : role.name.includes('Product') ? 'PMs' : 'professionals'} (1 to 3 years)`, desc: `Early-career ${role.name.includes('Engineer') ? 'engineers' : 'professionals'} at ${role.top_employers.slice(0, 3).join(', ')} are often willing to share their experience and can sometimes refer you directly.` },
      { title: 'University alumni at target companies', desc: 'Shared school connections work well in tech, especially at companies with strong campus recruiting programs.' },
      { title: 'Hiring managers and team leads', desc: 'Harder to reach, but connecting with the person who would manage your role gives you the most direct insight into what they are looking for.' },
    ];
  } else if (role.industry === 'private-equity') {
    return [
      { title: 'First and second-year PE associates', desc: `Associates at ${role.top_employers.slice(0, 3).join(', ')} are often former IB analysts who recently transitioned. They understand the recruiting path intimately.` },
      { title: 'Current IB analysts who recruited for PE', desc: 'Analysts at bulge brackets who went through PE recruiting can share real-time intelligence about timelines, headhunters, and what PE firms are looking for.' },
      { title: 'Headhunters specializing in PE', desc: 'Building relationships with PE headhunters (like HSP, SG Partners, and Oxbridge) is critical since they control much of the recruiting pipeline.' },
      { title: 'University alumni in PE', desc: 'The PE world is small and relationship-driven. A warm introduction from an alum can open doors that cold outreach cannot.' },
    ];
  } else if (role.industry === 'venture-capital') {
    return [
      { title: 'Current VC analysts and associates', desc: `Junior team members at ${role.top_employers.slice(0, 3).join(', ')} can share how they broke in and what their day-to-day looks like.` },
      { title: 'Founders and operators in the portfolio', desc: 'Connecting with founders backed by your target VC firms shows genuine interest in the ecosystem and can lead to warm introductions.' },
      { title: 'University alumni in VC or startup ecosystems', desc: 'The VC world is heavily network-driven. Alumni connections carry significant weight in an industry built on relationships.' },
      { title: 'VC scouts and fellows program participants', desc: 'Many firms run scout or fellowship programs for students. Past participants can help you understand these entry points.' },
    ];
  }
  return [
    { title: 'Junior professionals (1 to 3 years)', desc: `Early-career employees at ${role.top_employers.slice(0, 3).join(', ')} are the most accessible and can relate to your position as a student.` },
    { title: 'University alumni', desc: 'Shared alma mater dramatically increases response rates and provides a natural conversation starter.' },
    { title: 'Professionals in your target division', desc: 'People in the specific team or function you are targeting can give you the most relevant insights about the role.' },
    { title: 'Campus recruiters and hiring managers', desc: 'Building rapport with the people who manage the recruiting pipeline gives you an informational advantage over other candidates.' },
  ];
}

function getTimeline(role: Role) {
  if (role.industry === 'investment-banking') {
    return [
      { period: 'January to March (Sophomore Year)', activity: 'Begin exploratory networking. Reach out to alumni and junior bankers at target firms. No ask beyond meetings at this stage.' },
      { period: 'April to May', activity: 'Deepen relationships with 3 to 5 key contacts. Attend any bank-sponsored events on campus. Start preparing for technicals.' },
      { period: 'June to July', activity: 'Applications open for most summer analyst programs. Reach out to contacts for referrals. Finalize your resume and cover letters.' },
      { period: 'August to September', activity: 'Superdays and final interviews at most banks. Leverage your network for last-minute prep and insider tips on the interview process.' },
    ];
  } else if (role.industry === 'consulting') {
    return [
      { period: 'March to May (Sophomore Year)', activity: 'Start exploratory networking with consultants at target firms. Focus on understanding different practice areas and offices.' },
      { period: 'June to July', activity: 'Deepen relationships. Begin case prep. Attend any summer networking events or meetings organized by firms.' },
      { period: 'August to September', activity: 'Applications open for most consulting firms. Request referrals from contacts you have built relationships with. Submit applications.' },
      { period: 'October to November', activity: 'First-round and final-round interviews. Leverage contacts for firm-specific case prep tips and behavioral interview advice.' },
    ];
  } else if (role.industry === 'tech') {
    return [
      { period: 'May to July', activity: 'Begin networking with engineers and PMs at target companies. Focus on understanding team structures and what projects interest you.' },
      { period: 'August to September', activity: 'Applications open at most major tech companies. Begin Leetcode or product case prep in earnest. Request referrals from contacts.' },
      { period: 'October to November', activity: 'Peak interview season. Most tech companies conduct phone screens and on-sites during this period. Continue networking for warm referrals at companies you haven\'t heard back from.' },
      { period: 'December to January', activity: 'Late-cycle applications and interviews. Some companies (especially startups) recruit on rolling timelines through early spring.' },
    ];
  }
  return [
    { period: '6 months before recruiting season', activity: 'Begin exploratory networking. Reach out to alumni and professionals at target firms for meetings.' },
    { period: '3 to 4 months before', activity: 'Deepen relationships with key contacts. Begin preparing for interviews specific to your target role.' },
    { period: '1 to 2 months before applications open', activity: 'Request referrals from contacts. Finalize application materials. Attend firm-sponsored events.' },
    { period: 'During recruiting season', activity: 'Leverage your network for interview prep, insider tips, and last-minute referrals. Send updates to contacts about your progress.' },
  ];
}

function getFaqData(role: Role) {
  const industry = industryLabels[role.industry] || role.industry;
  return [
    {
      question: `How early should I start networking for ${role.name} positions?`,
      answer: `Start networking 3 to 6 months before applications open. For ${role.name} roles specifically, ${role.timeline.toLowerCase()}. Early networking gives you time to build genuine relationships rather than rushing to ask for referrals when applications are about to close.`,
    },
    {
      question: `What should I know about the ${role.name} interview process?`,
      answer: `${role.name} interviews typically involve ${role.interview_type.toLowerCase()}. Your networking contacts can provide invaluable, firm-specific insights about what interviewers look for, common questions, and how to prepare. Many students credit their meeting contacts with giving them the specific preparation tips that helped them succeed.`,
    },
    {
      question: `How many people should I network with for ${role.name} recruiting?`,
      answer: `Aim to have meaningful conversations with 30 to 50 professionals across your target firms during a full recruiting cycle. This typically yields 3 to 5 deep relationships at each of your top-choice companies, which is enough to understand the firm's culture and secure referrals.`,
    },
    {
      question: `Which companies are the top employers for ${role.name} positions?`,
      answer: `The most sought-after ${role.name} positions are at ${role.top_employers.join(', ')}. However, there are many excellent opportunities beyond these firms. Cast a wide net initially and narrow your focus as you learn more through networking conversations.`,
    },
    {
      question: `Can networking actually help me get a ${role.name} offer?`,
      answer: `Absolutely. In ${industry.toLowerCase()}, networking is often the single most important factor in landing an interview. Referred candidates are 3 to 5 times more likely to receive an interview compared to cold applicants. Building genuine relationships also gives you insider knowledge about the interview process, team culture, and what specific firms value in candidates.`,
    },
  ];
}

const RoleNetworkingGuide = ({ role }: Props) => {
  const industry = industryLabels[role.industry] || role.industry;
  const faqData = getFaqData(role);
  const whoToNetwork = getWhoToNetwork(role);
  const timeline = getTimeline(role);

  const howToSteps = [
    { name: `Find ${role.name} professionals`, text: `Search for current and former ${role.name.toLowerCase()}s at ${role.top_employers.slice(0, 3).join(', ')} who share a connection with you. Prioritize alumni and people with 1 to 3 years of experience.` },
    { name: 'Send personalized outreach', text: `Write a concise email that references the recipient's specific role and experience. Ask for a 15-minute meeting to learn about the ${role.name.toLowerCase()} path.` },
    { name: 'Prepare for and conduct meetings', text: `Come prepared with thoughtful questions about the ${role.name.toLowerCase()} experience, the recruiting process, and firm-specific culture. Listen actively and take notes.` },
    { name: 'Build relationships and request referrals', text: 'Follow up within 24 hours with a thank-you note. Stay in touch over weeks and months. When applications open, reach out to ask for referrals from contacts you have built genuine relationships with.' },
  ];

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <SEOHead {...generateMeta('networking', { company: role.name })} ogType="article" />
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
          "name": `How to Network for ${role.name} Positions`,
          "description": `Step-by-step networking guide for students pursuing ${role.name.toLowerCase()} roles.`,
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
        <p className="text-sm font-medium mb-4" style={{ color: '#3B82F6', letterSpacing: '0.02em' }}>ROLE GUIDE</p>
        <h1 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.025em', color: '#0F172A', marginBottom: '20px' }}>
          Student Networking Guide for <span style={{ color: '#3B82F6' }}>{role.name}</span> Positions
        </h1>
        <p style={{ fontSize: '17px', lineHeight: 1.7, color: '#64748B', maxWidth: '620px' }}>
          Networking is the most effective way to land a {role.name.toLowerCase()} position. This guide covers who to reach out to, what to say, and how to turn conversations into referrals at {role.top_employers.slice(0, 3).join(', ')}, and other top firms.
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
            <p className="text-xs font-medium mb-1" style={{ color: '#94A3B8' }}>Timeline</p>
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{role.timeline}</p>
          </div>
          <div className="rounded-[3px] p-4" style={{ border: '1px solid #E2E8F0', background: '#FAFBFF' }}>
            <p className="text-xs font-medium mb-1" style={{ color: '#94A3B8' }}>Interview Type</p>
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{role.interview_type}</p>
          </div>
        </div>
      </section>

      {/* Section 1: Why Networking Is Critical */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          Why Networking Is Critical for {role.name} Recruiting
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          {role.name} positions are among the most competitive roles for college students. At firms like {role.top_employers.slice(0, 3).join(', ')}, acceptance rates for entry-level programs can be as low as 1 to 3 percent. The students who land these roles almost always have internal connections who advocate for their candidacy. Submitting an application without any networking is significantly less effective.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          The recruiting timeline for {role.name} roles is: {role.timeline.toLowerCase()}. This means you need to start building relationships months before applications even open. Early networking gives you a crucial advantage: by the time you apply, you will have insider knowledge about what the firm values, how the interview process works, and who the key decision-makers are. Your network becomes your competitive moat.
        </p>
      </section>

      {/* Section 2: Who to Network With */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '20px' }}>
          Who to Network With for {role.name} Positions
        </h2>
        <div className="space-y-4">
          {whoToNetwork.map((item, i) => (
            <div key={i} className="rounded-[3px] p-5" style={{ border: '1px solid #E2E8F0' }}>
              <p className="text-sm font-semibold mb-2" style={{ color: '#0F172A' }}>{item.title}</p>
              <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#64748B' }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 3: Cold Email Template */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          Cold Email Template for {role.name} Networking
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Here is a proven template specifically designed for students networking into {role.name.toLowerCase()} roles. Adapt it to your specific situation and always personalize the bracketed sections.
        </p>

        <div className="rounded-[3px] p-6" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: '#3B82F6' }}>Cold Email Template</p>
          <div style={{ fontSize: '14px', lineHeight: 1.8, color: '#334155' }}>
            <p style={{ marginBottom: '4px' }}><strong>Subject:</strong> [University] student, question about the {role.name.toLowerCase()} role at [Company]</p>
            <p style={{ marginBottom: '12px', color: '#94A3B8', fontSize: '13px' }}>___</p>
            <p style={{ marginBottom: '8px' }}>Hi [First Name],</p>
            <p style={{ marginBottom: '8px' }}>I'm a [year] at [University] studying [major], and I'm preparing for {role.name.toLowerCase()} recruiting. I came across your profile and was interested to see that you're a [their role] at [Company]. [One specific, personalized sentence about their background or career path.]</p>
            <p style={{ marginBottom: '8px' }}>I'm particularly interested in [Company] because [one genuine reason]. I'd love to hear about your experience in the role and any advice you have for someone going through the recruiting process. Would you have 15 minutes for a quick call?</p>
            <p>Best,<br />[Your Name]<br /><span style={{ color: '#64748B', fontSize: '13px' }}>[University] '[Grad Year] | [Major]</span></p>
          </div>
        </div>
      </section>

      {/* Section 4: Top Companies */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          Top Companies Hiring for {role.name} Positions
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          These are the most sought-after employers for {role.name.toLowerCase()} roles. Each has a distinct culture, recruiting process, and set of expectations. Networking with employees at each firm will help you understand these differences and tailor your applications accordingly.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {role.top_employers.map((employer, i) => (
            <div key={i} className="rounded-[3px] p-4 flex items-center gap-3" style={{ border: '1px solid #E2E8F0', background: '#FAFBFF' }}>
              <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: '#FAFBFF', color: '#3B82F6' }}>{i + 1}</span>
              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{employer}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 5: Recruiting Timeline */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '20px' }}>
          The {role.name} Recruiting Timeline
        </h2>
        <div className="space-y-4">
          {timeline.map((item, i) => (
            <div key={i} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ background: '#3B82F6', color: '#fff' }}>{i + 1}</span>
                {i < timeline.length - 1 && <div className="w-px flex-1 mt-2" style={{ background: '#E2E8F0' }} />}
              </div>
              <div className="pb-6">
                <p className="text-sm font-semibold mb-1" style={{ color: '#0F172A' }}>{item.period}</p>
                <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#64748B' }}>{item.activity}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '20px' }}>
          4 Steps to Network for {role.name} Roles with Offerloop
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
          <Link to={`/cold-email/${role.industry}`} style={{ display: 'block', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#fff', textDecoration: 'none', transition: 'border-color 0.15s ease' }} onMouseEnter={e => (e.currentTarget.style.borderColor = '#3B82F6')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#E2E8F0')}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>{industryLabels[role.industry] || role.industry} Cold Email Guide</p>
            <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5 }}>Email templates and tips for {industryLabels[role.industry]?.toLowerCase() || role.industry} outreach.</p>
          </Link>
          <Link to={`/meeting/${role.top_employers[0]?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'mckinsey'}`} style={{ display: 'block', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#fff', textDecoration: 'none', transition: 'border-color 0.15s ease' }} onMouseEnter={e => (e.currentTarget.style.borderColor = '#3B82F6')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#E2E8F0')}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>{role.top_employers[0]} Meeting Guide</p>
            <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5 }}>Prep questions and follow-up strategies for meetings.</p>
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
            Start your {role.name.toLowerCase()} networking campaign with Offerloop
          </h2>
          <p style={{ fontSize: '15px', color: '#64748B', marginBottom: '28px' }}>
            Search 2.2B verified contacts at {role.top_employers.slice(0, 3).join(', ')}, and more. AI-personalized outreach in seconds.
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

export default RoleNetworkingGuide;
