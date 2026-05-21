import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import offerloopLogo from '../../assets/offerloop_logo2.png';
import { ArrowRight } from 'lucide-react';
import type { SeoUniversity } from '@/data/seo-universities';
import BeehiivPopup from '@/components/BeehiivPopup';
import ExitIntentPopup from '@/components/ExitIntentPopup';
import SEOHead from '@/components/SEOHead';
import { generateMeta } from '@/utils/generateMeta';

interface Props {
  university: SeoUniversity;
}

function getFaqData(uni: SeoUniversity) {
  return [
    {
      question: `How do I find ${uni.name} alumni at companies I'm targeting?`,
      answer: `Start with your university's alumni directory if one exists. For a much broader search, Offerloop lets you search across 2.2 billion verified contacts with queries like "${uni.name} alumni at McKinsey" or "${uni.full_name} graduates at Goldman Sachs." You can filter by company, role, graduation year, and location to find the most relevant alumni for your networking goals.`,
    },
    {
      question: `What should I say when emailing a ${uni.name} alum?`,
      answer: `Lead with the shared connection. Mention that you are a current ${uni.name} student, your year, and your major. Reference something specific about their career path that genuinely interests you. Ask for a 15-minute meeting, not a referral. The shared alma mater gives you a natural reason to reach out and significantly increases your response rate compared to fully cold outreach.`,
    },
    {
      question: `When is the best time to start alumni networking at ${uni.name}?`,
      answer: `Start 3 to 6 months before your target recruiting season. For consulting and banking (which typically recruit in the fall), begin alumni outreach in late spring or early summer. For tech roles with rolling deadlines, start as early as possible. The earlier you build relationships, the more natural it will feel when you eventually need advice or referrals.`,
    },
    {
      question: `How many ${uni.name} alumni should I reach out to?`,
      answer: `Plan to contact 30 to 50 alumni across your target companies over the course of a recruiting cycle. Expect roughly a 25 to 40 percent response rate (higher than cold outreach because of the shared school connection). This should yield 10 to 20 meaningful conversations, which is enough to build a strong network across 3 to 5 target firms.`,
    },
    {
      question: `Should I use the ${uni.name} alumni directory or a tool like Offerloop?`,
      answer: `Both have their place. The official alumni directory is useful for finding people who actively opted in, but it is often incomplete, hard to search, and does not provide work email addresses. Offerloop gives you access to a much larger database (2.2 billion contacts), lets you search by company and role, and provides verified email addresses so you can reach out directly.`,
    },
  ];
}

const AlumniGuide = ({ university: uni }: Props) => {
  const faqData = getFaqData(uni);

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <SEOHead {...generateMeta('alumni', { university: uni.name })} ogType="article" />
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
        <p className="text-sm font-medium mb-4" style={{ color: '#3B82F6', letterSpacing: '0.02em' }}>ALUMNI GUIDE</p>
        <h1 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.025em', color: '#0F172A', marginBottom: '20px' }}>
          How to Leverage <span style={{ color: '#3B82F6' }}>{uni.name}</span> Alumni for Recruiting
        </h1>
        <p style={{ fontSize: '17px', lineHeight: 1.7, color: '#64748B', maxWidth: '620px' }}>
          {uni.full_name} alumni are one of your most powerful resources during recruiting. They are more likely to respond to your outreach, more willing to share advice, and more inclined to refer you than any other type of professional contact.
        </p>
      </section>

      {/* Quick Info */}
      <section className="px-6 pb-8" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-[3px] p-4" style={{ border: '1px solid #E2E8F0', background: '#FAFBFF' }}>
            <p className="text-xs font-medium mb-1" style={{ color: '#94A3B8' }}>Location</p>
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{uni.location}</p>
          </div>
          <div className="rounded-[3px] p-4" style={{ border: '1px solid #E2E8F0', background: '#FAFBFF' }}>
            <p className="text-xs font-medium mb-1" style={{ color: '#94A3B8' }}>Business School</p>
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{uni.business_school}</p>
          </div>
          <div className="rounded-[3px] p-4" style={{ border: '1px solid #E2E8F0', background: '#FAFBFF' }}>
            <p className="text-xs font-medium mb-1" style={{ color: '#94A3B8' }}>Notable Programs</p>
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{uni.notable_programs.join(', ')}</p>
          </div>
        </div>
      </section>

      {/* Section 1: Why Alumni Matter */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          Why {uni.name} Alumni Are Your Secret Weapon
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Shared alma mater is the single strongest predictor of whether a professional will respond to a student's cold email. {uni.name} alumni feel a genuine connection to current students and often want to pay forward the help they received when they were in your position. This is not theoretical: response rates for alumni outreach are typically 2 to 3 times higher than fully cold emails.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          Beyond response rates, {uni.name} alumni can provide university-specific advice that is far more valuable than generic career guidance. They know which on-campus recruiting events matter, which professors have industry connections, which student organizations are most respected by recruiters, and how {uni.name}'s reputation is perceived at their specific firm. This insider knowledge is impossible to get from any other source.
        </p>
      </section>

      {/* Section 2: Where Alumni Work */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          Where {uni.name} Alumni Work
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '20px' }}>
          {uni.full_name} graduates have a strong presence at many of the most competitive employers in consulting, banking, tech, and beyond. Here are some of the top companies where you will find {uni.name} alumni:
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {uni.top_employers.map((employer, i) => (
            <div key={i} className="rounded-[3px] p-4 text-center" style={{ border: '1px solid #E2E8F0', background: '#FAFBFF' }}>
              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{employer}</p>
            </div>
          ))}
        </div>
        <p style={{ fontSize: '14px', lineHeight: 1.7, color: '#64748B', marginTop: '16px' }}>
          This is just a sample. {uni.name} alumni are represented at hundreds of firms across every major industry. The key is to search for alumni at the specific companies you are targeting, rather than limiting yourself to the best-known names.
        </p>
      </section>

      {/* Section 3: How to Find Alumni */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          How to Find {uni.name} Alumni at Your Target Companies
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Most students start with their university's official alumni directory, and that is a reasonable first step. However, alumni directories are often incomplete, difficult to search by company or role, and rarely provide work email addresses. To find alumni at specific companies, you need a broader data source.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Offerloop lets you search across 2.2 billion verified professional contacts using natural language queries. Type something like "{uni.name} alumni at Goldman Sachs" or "{uni.full_name} graduates working at McKinsey" and get a curated list of contacts with verified email addresses. You can filter by graduation year, current role, division, and location to find the most relevant people for your specific networking goals.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          LinkedIn can also surface alumni connections, but it does not provide email addresses, and InMail messages have notoriously low response rates. For targeted, high-response-rate outreach, email consistently outperforms LinkedIn messaging.
        </p>
      </section>

      {/* Section 4: Email Templates */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '20px' }}>
          3 Email Templates for {uni.name} Alumni Outreach
        </h2>

        {/* Template 1 */}
        <div className="rounded-[3px] p-6 mb-5" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: '#3B82F6' }}>Template 1: General Alumni Meeting</p>
          <div style={{ fontSize: '14px', lineHeight: 1.8, color: '#334155' }}>
            <p style={{ marginBottom: '4px' }}><strong>Subject:</strong> {uni.name} student, would love 15 min on your experience at [Company]</p>
            <p style={{ marginBottom: '12px', color: '#94A3B8', fontSize: '13px' }}>___</p>
            <p style={{ marginBottom: '8px' }}>Hi [First Name],</p>
            <p style={{ marginBottom: '8px' }}>
              I'm a [year] at {uni.full_name} studying [major]. I found your profile and saw that you're at [Company] working in [role/team]. As a fellow {uni.name} alum, I'd love to hear about your experience, especially how you made the transition from {uni.name} to [Company].
            </p>
            <p style={{ marginBottom: '8px' }}>Would you have 15 minutes for a quick call in the next couple of weeks?</p>
            <p style={{ marginBottom: '4px' }}>Best,</p>
            <p>[Your Name]</p>
            <p style={{ color: '#64748B', fontSize: '13px' }}>{uni.name} '[Grad Year] | [Major]</p>
          </div>
        </div>

        {/* Template 2 */}
        <div className="rounded-[3px] p-6 mb-5" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: '#3B82F6' }}>Template 2: Division-Specific Outreach</p>
          <div style={{ fontSize: '14px', lineHeight: 1.8, color: '#334155' }}>
            <p style={{ marginBottom: '4px' }}><strong>Subject:</strong> {uni.name} [major], question about [Company]'s [Division]</p>
            <p style={{ marginBottom: '12px', color: '#94A3B8', fontSize: '13px' }}>___</p>
            <p style={{ marginBottom: '8px' }}>Hi [First Name],</p>
            <p style={{ marginBottom: '8px' }}>
              I'm a [year] at {uni.full_name} studying [major], and I'm preparing for [industry] recruiting. I noticed you work in [Company]'s [Division] group and graduated from {uni.name} in [year]. I'm particularly interested in [Division] because [one genuine reason], and your perspective as someone who went through {uni.name}'s recruiting pipeline would be incredibly valuable.
            </p>
            <p style={{ marginBottom: '8px' }}>Would you be open to a brief 15-minute call?</p>
            <p style={{ marginBottom: '4px' }}>Thank you,</p>
            <p>[Your Name]</p>
            <p style={{ color: '#64748B', fontSize: '13px' }}>{uni.name} '[Grad Year] | [Major]</p>
          </div>
        </div>

        {/* Template 3 */}
        <div className="rounded-[3px] p-6" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: '#3B82F6' }}>Template 3: Referral Request (After a Meeting)</p>
          <div style={{ fontSize: '14px', lineHeight: 1.8, color: '#334155' }}>
            <p style={{ marginBottom: '4px' }}><strong>Subject:</strong> Thank you, [First Name], and a quick question</p>
            <p style={{ marginBottom: '12px', color: '#94A3B8', fontSize: '13px' }}>___</p>
            <p style={{ marginBottom: '8px' }}>Hi [First Name],</p>
            <p style={{ marginBottom: '8px' }}>
              Thank you again for taking the time to chat last [day]. Your advice about [specific topic] was really helpful, and I've already started [specific action you took based on their advice].
            </p>
            <p style={{ marginBottom: '8px' }}>
              I'm planning to apply to [Company]'s [program/role] this [season]. If you're comfortable, would you be willing to submit a referral on my behalf? I completely understand if that's not something you're able to do. Either way, I really appreciate the time you've already given me.
            </p>
            <p style={{ marginBottom: '4px' }}>Best,</p>
            <p>[Your Name]</p>
            <p style={{ color: '#64748B', fontSize: '13px' }}>{uni.name} '[Grad Year] | [Major]</p>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link to="/cold-email/management-consulting" style={{ display: 'block', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#fff', textDecoration: 'none', transition: 'border-color 0.15s ease' }} onMouseEnter={e => (e.currentTarget.style.borderColor = '#3B82F6')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#E2E8F0')}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>Consulting Cold Emails</p>
            <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5 }}>Templates for reaching out to MBB and Big 4 consultants.</p>
          </Link>
          <Link to="/cold-email/investment-banking" style={{ display: 'block', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#fff', textDecoration: 'none', transition: 'border-color 0.15s ease' }} onMouseEnter={e => (e.currentTarget.style.borderColor = '#3B82F6')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#E2E8F0')}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>IB Cold Emails</p>
            <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5 }}>Cold email templates for investment banking networking.</p>
          </Link>
          <Link to="/meeting/mckinsey" style={{ display: 'block', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#fff', textDecoration: 'none', transition: 'border-color 0.15s ease' }} onMouseEnter={e => (e.currentTarget.style.borderColor = '#3B82F6')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#E2E8F0')}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>Meeting Guides</p>
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
            Search for {uni.name} alumni on Offerloop
          </h2>
          <p style={{ fontSize: '15px', color: '#64748B', marginBottom: '28px' }}>
            Find verified email addresses for {uni.full_name} graduates at your target companies. Send personalized outreach in seconds.
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

export default AlumniGuide;
