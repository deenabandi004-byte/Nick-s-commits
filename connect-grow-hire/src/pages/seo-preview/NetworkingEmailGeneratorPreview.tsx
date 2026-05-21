/*
 * SEO PREVIEW: free networking email generator (REACH). Route: /seo-preview/networking-email-generator
 * Showcase is the tool itself: an input panel feeding a generated email (reply_generation.py
 * output). The page IS the product. House style: no em dashes.
 */
import { Helmet } from 'react-helmet-async';
import { PenLine, Mail, Send, CornerDownRight } from 'lucide-react';
import {
  BRAND, INK, kicker, PreviewNav, PreviewFooter, PreviewHero,
  ProblemSection, StatStrip, ShowcaseSection, HowItWorks, FAQ, PreviewCTA, InlineEmailCapture, ExitIntentCapture,
} from './_shared';

const INPUTS = [
  { label: "Who you're emailing", value: 'Anaya Patel · Campus Recruiter at BCG' },
  { label: 'You', value: 'Michigan Ross · Junior · Strategy & Finance' },
  { label: 'Goal', value: 'Request a 15-minute informational interview' },
];

const emailCapture = {
  eyebrow: 'NOT RECRUITING YET?',
  heading: 'Get the weekly recruiting digest',
  subtext: 'Cold email templates, deadline alerts, and networking tactics, every week. For students recruiting in finance, consulting, and tech.',
  buttonText: 'Send me the digest',
  cluster: 'student',
};

const NetworkingEmailGeneratorPreview = () => {
  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>Free Networking Email Generator for Students</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <PreviewNav />

      <PreviewHero
        EyebrowIcon={PenLine}
        eyebrow="FREE TOOL · NETWORKING EMAILS"
        line1={<>The networking email <span style={{ color: BRAND }}>generator</span> built for students</>}
        line2="not for salespeople"
        lead="Meeting requests, informational interviews, cold emails to recruiters and alumni. Tell Offerloop who you're emailing and it writes a personalized draft in your voice in ten seconds. Free."
        chips={['Meetings, recruiters, alumni', 'Personalized, not generic AI', 'Free to use']}
      />

      <ProblemSection heading="Every cold email generator is built to sell software">
        Search "cold email generator" and you get tools made for salespeople blasting B2B pitches. None
        of them know what a meeting request is, or how a student should email an alum, or why a
        recruiter ignores generic outreach. You do not need a sales tool. You need an email that sounds
        like a real student who did their homework.
      </ProblemSection>

      <StatStrip
        heading="NETWORKING EMAILS, BY THE NUMBERS"
        stats={[
          { value: '4-5', label: 'sentences in a networking email that actually gets a reply' },
          { value: 'Under 120', label: 'words, the length a busy professional will read' },
          { value: '10 sec', label: 'for Offerloop to generate a personalized draft' },
        ]}
      />

      <ShowcaseSection
        heading="Tell it who you're emailing. Get a draft."
        intro="A real example: an informational interview request to a BCG campus recruiter, generated from three inputs."
        caption="Sample output. Your real draft is generated from who you enter and your own background, and you edit it before sending."
      >
        <div className="rounded-[6px]" style={{ border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 30px 70px -28px rgba(15,23,42,0.32)', background: '#fff' }}>
          <div style={{ height: '4px', background: `linear-gradient(90deg, ${BRAND}, #60A5FA)` }} />
          <div className="flex items-center gap-2 px-6 py-3.5" style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
            <PenLine className="w-4 h-4" style={{ color: BRAND }} />
            <span style={{ fontSize: '13px', fontWeight: 700, color: INK }}>Networking Email Generator</span>
          </div>

          <div className="flex flex-wrap">
            {/* INPUT */}
            <div style={{ flex: '1 1 300px', borderRight: '1px solid #F1F5F9', padding: '20px 22px' }}>
              <p style={{ ...kicker, marginBottom: '12px' }}>WHAT YOU GIVE IT</p>
              {INPUTS.map((f, i) => (
                <div key={i} style={{ marginBottom: '12px' }}>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', marginBottom: '4px' }}>{f.label}</p>
                  <div style={{ fontSize: '13px', color: '#334155', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '4px', padding: '8px 11px' }}>{f.value}</div>
                </div>
              ))}
              <div className="inline-flex items-center gap-2" style={{ background: BRAND, color: '#fff', fontWeight: 700, fontSize: '13px', padding: '9px 16px', borderRadius: '4px', marginTop: '2px' }}>
                <PenLine className="w-3.5 h-3.5" /> Generate email
              </div>
            </div>

            {/* OUTPUT */}
            <div style={{ flex: '2 1 380px', padding: '20px 22px' }}>
              <p style={{ ...kicker, marginBottom: '12px' }}>YOUR EMAIL</p>
              <div style={{ fontSize: '13px', color: '#475569', marginBottom: '4px' }}>
                <span style={{ color: '#94A3B8' }}>Subject: </span>
                <span style={{ fontWeight: 600, color: INK }}>Ross junior, a question only BCG's recruiter can answer</span>
              </div>
              <div style={{ borderTop: '1px solid #F1F5F9', marginTop: '8px', paddingTop: '12px', fontSize: '13.5px', lineHeight: 1.75, color: '#334155' }}>
                <p style={{ marginBottom: '10px' }}>Hi Anaya,</p>
                <p style={{ marginBottom: '10px' }}>
                  <mark style={{ background: '#EFF5FF', color: '#1E3A5F', padding: '1px 3px', borderRadius: '2px' }}>You ran BCG's casing workshop at Ross this October</mark>, and you own that recruiting relationship after <mark style={{ background: '#EFF5FF', color: '#1E3A5F', padding: '1px 3px', borderRadius: '2px' }}>three years consulting on BCG cases yourself</mark>. That mix is the exact perspective I'm missing.
                </p>
                <p style={{ marginBottom: '10px' }}>
                  One question I'd value 15 minutes on: from the recruiter's seat, what actually separates the Ross candidates who clear round one from the ones who don't?
                </p>
                <p style={{ marginBottom: '10px' }}>Grateful for any time you can spare.</p>
                <p style={{ marginBottom: '10px' }}>Best,</p>
                <p>Jordan Lee<br /><span style={{ color: '#94A3B8' }}>Michigan Ross '27</span></p>
              </div>
              <p className="flex items-start gap-1.5" style={{ fontSize: '11.5px', color: '#94A3B8', fontStyle: 'italic', marginTop: '12px' }}>
                <CornerDownRight className="w-3 h-3 flex-shrink-0" style={{ marginTop: '3px' }} />
                Offerloop pieced this together from Anaya's LinkedIn: the casing workshop she ran at Ross in October, and her three years as a BCG consultant before she moved into recruiting.
              </p>
            </div>
          </div>
        </div>
      </ShowcaseSection>

      <HowItWorks
        heading="How it works"
        steps={[
          { Icon: PenLine, t: 'Tell it three things', d: "Who you're emailing, who you are, and what you want: a meeting, an informational interview, a referral." },
          { Icon: Mail, t: 'Get a personalized draft', d: 'Offerloop writes a short, specific email in your voice, built on the real connection between you and them.' },
          { Icon: Send, t: 'Edit and send', d: 'Tweak the one personalization line so it sounds like you, then send. Or use Offerloop to find the email too.' },
        ]}
      />

      <FAQ items={[
        { q: 'How do I write a cold email for an internship?', a: 'Keep it to four or five sentences: who you are, one specific reason you are reaching out to this person, and a small ask like 15 minutes. Offerloop\'s generator writes that structure for you.' },
        { q: 'What do I say in an informational interview request email?', a: 'Name your school and year, say specifically why you want to talk to this person, and ask for 15 minutes of their time. Do not ask for a job or a referral in the first email.' },
        { q: "How do I email a recruiter I've never met?", a: "Lead with something specific: the school they recruit, a program they run, the role you are targeting. A recruiter ignores \"I'd love to connect\" and replies to a precise, low-effort ask." },
        { q: "What's a good meeting request email template?", a: 'Short and bounded: a shared connection or specific interest in line one, a 15-minute ask in line two. Offerloop generates a meeting request tuned to the person you pick.' },
        { q: 'How do I write a networking email to an alumnus?', a: 'Lead with the shared school in the first sentence. The alma mater is your reason to reach out and it lifts your reply rate well above fully cold outreach. Offerloop builds the email around that connection.' },
        { q: 'Is it okay to use AI to write a cold email?', a: 'Yes, for drafting and for personalizing at volume. The risk is sending a generic AI email, and recruiters spot those instantly. Offerloop is tuned for student networking, not sales spam, and you edit the personalization line so it sounds like you.' },
      ]} />

      <InlineEmailCapture {...emailCapture} />

      <PreviewCTA
        eyebrow="STOP REWRITING THE SAME EMAIL"
        headline="Generate your networking email free"
        subhead="Meetings, informational interviews, cold emails to recruiters and alumni. Personalized in ten seconds."
        buttonText="Write your first networking email"
        to="/find"
        footnote="One click opens Offerloop. Generate the email and find the contact in one place. No credit card."
      />

      <PreviewFooter />
      <ExitIntentCapture {...emailCapture} />
    </div>
  );
};

export default NetworkingEmailGeneratorPreview;
