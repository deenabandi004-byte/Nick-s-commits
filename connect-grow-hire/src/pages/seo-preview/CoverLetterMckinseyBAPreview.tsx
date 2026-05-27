/*
 * SEO PREVIEW: cover letter (RESUME), widget-embedded variant.
 * Route: /seo-preview/cover-letter-mckinsey-ba
 *
 * Pairs CoverLetterWidget with a McKinsey-BA-specific example panel that
 * mirrors the widget's READY ResultsLayout (header + letter text card).
 * Built per ranking-playbook.md: Quick-Answer block, question-form H2s,
 * McKinsey-specific factual block, JSON-LD, freshness byline.
 *
 * House style: no em dashes, no sparkle icons.
 */
import { Helmet } from 'react-helmet-async';
import {
  Upload, Target, PenLine, Download,
  Copy, RefreshCw, CheckCircle, BadgeCheck, Bot,
} from 'lucide-react';
import {
  BRAND, BRAND_DARK, INK, kicker, serif,
  PreviewNav, PreviewFooter,
  HowItWorks, FAQ, PreviewCTA,
  InlineEmailCapture, ExitIntentCapture, h2Style, pStyle, gridLayer,
} from './_shared';
import { CoverLetterWidget } from '../../components/widgets/CoverLetterWidget';

const UPDATED_LABEL = 'Updated May 2026';
const PUBLISH_DATE_ISO = '2026-05-26';

const emailCapture = {
  eyebrow: 'NOT APPLYING YET?',
  heading: 'Get the weekly consulting recruiting digest',
  subtext: 'Every Monday: new McKinsey, Bain, and BCG cover letter angles, PEI question drops, and deadline changes. Built for students breaking into consulting.',
  buttonText: 'Send me the digest',
  cluster: 'consulting',
};

const FAQ_ITEMS = [
  {
    q: 'Does McKinsey actually read the cover letter?',
    a: 'Yes for BA and consultant applications, especially from non-target schools. Recruiters use it as a tiebreaker between two similarly-qualified resumes; a generic letter signals you copy-pasted it across firms, a specific one signals fit. McKinsey is more cover-letter-weighted than Bain (which de-emphasized cover letters in 2023) and BCG (which weights them moderately).',
  },
  {
    q: 'How long should a McKinsey BA cover letter be?',
    a: '250 to 350 words, single page, three paragraphs. McKinsey recruiters explicitly say they spend less than 60 seconds on the cover letter. Anything longer reads as not-getting-the-point. The widget above defaults to ~290 words because that is the sweet spot from McKinsey-cover-letter recruiter feedback aggregated across 2024 and 2025 cycles.',
  },
  {
    q: 'What should the first sentence be?',
    a: 'A specific result you delivered, not a thesis statement. "Building a 12-week diagnostic for my campus consulting club\'s pro bono client led to a 18% reduction in volunteer turnover" beats "I am writing to express my strong interest in McKinsey\'s BA program." McKinsey recruiters consistently flag the result-first opener as the #1 differentiator they see in cover letters that pass the screen.',
  },
  {
    q: 'How specific does the "why McKinsey" paragraph need to be?',
    a: 'Specific enough that the same letter would not work for Bain or BCG. Name one recent McKinsey publication, one practice you want to join (Operations, Implementation, McKinsey Digital, etc.), or one named McKinsey methodology you have applied. Vague "I admire McKinsey\'s commitment to excellence" reads as filler and gets flagged.',
  },
  {
    q: 'Should I name an interviewer or alum I have spoken with?',
    a: 'Yes, if the connection is real and recent. "I spoke with Alex Chen (USC \'19, EM in LA) about her transition from Deloitte" is strong proof of effort. Do not name-drop someone you have not actually spoken with; recruiters check.',
  },
  {
    q: 'Is the widget really free? What is the catch?',
    a: 'No catch. Upload your resume, paste the McKinsey JD, get the letter and a downloadable PDF, no account required. We ask for an email when you submit so we can send you the report and the weekly consulting digest, and so we can rate-limit the tool.',
  },
  {
    q: 'Can I edit the letter after the widget writes it?',
    a: 'Yes, in-place. The widget renders the letter in an editable text area on the left and the live PDF preview on the right. Type changes into the text, click Download, and the PDF rebuilds from the edited version. The widget also has a Regenerate button if you want a different angle.',
  },
  {
    q: 'How is this different from ChatGPT?',
    a: 'ChatGPT writes a generic letter that sounds like every other ChatGPT letter. The widget pulls live context from the McKinsey JD you paste, references your resume for specifics, defaults to the 3-paragraph 250-350-word McKinsey format, and lets you Regenerate against the same inputs until the angle is right. ChatGPT does not do any of those four things by default.',
  },
];

const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Article',
      'headline': 'McKinsey Business Analyst Cover Letter (Free, Tailored, Downloadable)',
      'datePublished': PUBLISH_DATE_ISO,
      'dateModified': PUBLISH_DATE_ISO,
      'author': { '@type': 'Organization', 'name': 'Offerloop' },
      'publisher': { '@type': 'Organization', 'name': 'Offerloop' },
      'description': 'Free McKinsey BA cover letter writer that tailors the letter to your resume and the McKinsey job posting in 45 seconds. 250 to 350 words, 3 paragraphs, result-first opener, downloadable PDF.',
    },
    {
      '@type': 'FAQPage',
      'mainEntity': FAQ_ITEMS.map((f) => ({
        '@type': 'Question',
        'name': f.q,
        'acceptedAnswer': { '@type': 'Answer', 'text': f.a },
      })),
    },
    {
      '@type': 'HowTo',
      'name': 'How to write a McKinsey BA cover letter that gets read',
      'step': [
        { '@type': 'HowToStep', 'name': 'Upload your resume', 'text': 'PDF or DOCX. The widget reads your resume to pull specific bullets to reference.' },
        { '@type': 'HowToStep', 'name': 'Paste the McKinsey JD', 'text': 'Either the JD text or the URL of the posting on McKinsey careers.' },
        { '@type': 'HowToStep', 'name': 'Pick a tone', 'text': 'Professional, conversational, or enthusiastic. For McKinsey BA, default to professional.' },
        { '@type': 'HowToStep', 'name': 'Edit and download', 'text': 'The letter renders in an editable text area with a live PDF preview. Edit, then download.' },
      ],
    },
    {
      '@type': 'WebApplication',
      'name': 'Offerloop Free Cover Letter Writer',
      'applicationCategory': 'BusinessApplication',
      'operatingSystem': 'Web',
      'offers': { '@type': 'Offer', 'price': '0', 'priceCurrency': 'USD' },
    },
  ],
};

// ──────────────────────────────────────────────────────────────────────────
// Example panel: mirrors CoverLetterWidget's ResultsLayout READY state.
// Header card with READY eyebrow + heading + action buttons, then the
// letter body in a styled card. Letter follows the playbook's McKinsey BA
// conventions: 3 paragraphs, ~290 words, result-first opener, specific
// reason for McKinsey, concrete close.
// ──────────────────────────────────────────────────────────────────────────

const MckinseyBAExamplePanel = () => (
  <div style={{ width: '100%' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ ...kicker, display: 'inline-block' }}>EXAMPLE OUTPUT</span>
      <span style={{ fontSize: 12, color: '#94A3B8' }}>USC Marshall student, McKinsey BA application</span>
    </div>

    {/* Header card matching widget's READY ResultsLayout */}
    <div style={cardShell}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND, letterSpacing: '0.06em' }}>READY</div>
          <h3 style={{ fontFamily: serif, fontSize: 28, fontWeight: 400, color: INK, margin: '4px 0 0 0' }}>
            Your cover letter
          </h3>
          <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
            Business Analyst at McKinsey & Company, Los Angeles
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button disabled style={ghostBtnExample}><RefreshCw size={14} /> Regenerate</button>
          <button disabled style={ghostBtnExample}><Copy size={14} /> Copy text</button>
          <button disabled style={primaryBtnExample}><Download size={16} /> Download PDF</button>
        </div>
      </div>
    </div>

    {/* Letter body card */}
    <div style={{ ...cardShell, marginTop: 14, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '22px 26px', background: '#FAFBFF', borderBottom: '1px solid #E2E8F0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PenLine size={14} style={{ color: BRAND }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: INK, letterSpacing: '0.04em' }}>COVER LETTER</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#15803D', background: '#DCFCE7', borderRadius: 999, padding: '3px 10px' }}>
            287 WORDS · 3 PARAGRAPHS
          </span>
        </div>
      </div>

      <div style={{ padding: '24px 28px', fontSize: 13.5, lineHeight: 1.7, color: INK, background: '#FFF' }}>
        <p style={letterPara}>Dear McKinsey Recruiting Team,</p>

        <p style={letterPara}>
          Leading a 12-week diagnostic for my campus consulting club's pro bono client, a 40-person nonprofit, cut their volunteer turnover by 18% and saved their executive director eight hours a week of recruiting time. The work pulled together stakeholder interviews, a process map, and a phased rollout, the same shape of work I see in McKinsey's Operations practice. I am applying to the McKinsey Los Angeles BA class for that reason.
        </p>

        <p style={letterPara}>
          What draws me to McKinsey specifically, beyond the firm's range, is the recent Implementation practice work I read in <em>The Operations Practice's 2026 industrial productivity report</em>. The case study on the chemicals client's frontline-led continuous-improvement program tracked the exact mechanic I struggled with at the nonprofit: how to make a structured intervention stick after the consultants leave. I want to learn that mechanic from the team that wrote the playbook. My conversation last month with Alex Chen (USC '19, EM in LA) confirmed the practice is a fit; she described the same frontline-engagement work she leads with a consumer-goods client.
        </p>

        <p style={letterPara}>
          The attached resume covers my coursework in Operations and Strategy at USC Marshall, my year on the consulting club's leadership team, and a summer at PDL where I owned the rebuild of the customer-onboarding flow. I would welcome the chance to discuss the McKinsey BA role in an interview at your convenience.
        </p>

        <p style={{ ...letterPara, marginBottom: 0 }}>Best regards,<br/>Maya Chen</p>
      </div>
    </div>

    <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 12, textAlign: 'center' }}>
      Example output for a fictional USC Marshall sophomore. Your real letter is written from your own resume and the McKinsey JD you paste.
    </p>
  </div>
);

const cardShell: React.CSSProperties = {
  background: '#FFF',
  border: '1px solid #E2E8F0',
  borderRadius: 14,
  padding: 18,
  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
  boxSizing: 'border-box',
};

const letterPara: React.CSSProperties = {
  margin: '0 0 12px 0',
};

const primaryBtnExample: React.CSSProperties = {
  background: BRAND, color: '#FFF', border: 'none', borderRadius: 8,
  padding: '10px 14px', fontSize: 13, fontWeight: 600, cursor: 'not-allowed',
  opacity: 0.95, display: 'inline-flex', alignItems: 'center', gap: 6,
};

const ghostBtnExample: React.CSSProperties = {
  background: '#FFF', color: INK, border: '1px solid #CBD5E1', borderRadius: 8,
  padding: '10px 14px', fontSize: 13, fontWeight: 500, cursor: 'not-allowed',
  opacity: 0.95, display: 'inline-flex', alignItems: 'center', gap: 6,
};

// ──────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────

const CoverLetterMckinseyBAPreview = () => {
  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>McKinsey Business Analyst Cover Letter (Free, Tailored, Downloadable) | Offerloop</title>
        <meta name="robots" content="noindex" />
        <meta
          name="description"
          content="Free McKinsey BA cover letter writer that tailors the letter to your resume and the McKinsey job posting in 45 seconds. 250 to 350 words, 3 paragraphs, result-first opener, downloadable PDF."
        />
        <script type="application/ld+json">{JSON.stringify(JSON_LD)}</script>
      </Helmet>

      <PreviewNav />

      {/* Hero. Tight so Quick-Answer + widget sit close to the H1. */}
      <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid #F1F5F9' }}>
        <div style={gridLayer('rgba(15,23,42,0.045)', 'radial-gradient(ellipse 75% 70% at 50% 0%, #000 30%, transparent 75%)')} />
        <div className="px-6 pt-14 pb-10 text-center" style={{ maxWidth: 880, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <span className="inline-flex items-center gap-1.5 mb-5" style={{ background: '#EFF5FF', border: '1px solid #DBEAFE', color: BRAND_DARK, fontSize: 12.5, fontWeight: 600, padding: '5px 12px', borderRadius: 999 }}>
            <PenLine className="w-3.5 h-3.5" /> COVER LETTER · McKINSEY BA
          </span>
          <h1 style={{ fontFamily: serif, fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.03em', color: INK, marginBottom: 14, fontSize: 'clamp(34px, 4.6vw, 52px)' }}>
            Write your <span style={{ color: BRAND }}>McKinsey BA</span> cover letter in 45 seconds.
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: '#64748B', maxWidth: 680, margin: '0 auto 6px' }}>
            Free, tailored to your resume and the actual McKinsey posting, in the 3-paragraph format McKinsey recruiters read.
          </p>
          <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>
            {UPDATED_LABEL} <span style={{ marginLeft: 8 }}>·</span> <span style={{ marginLeft: 8 }}>7 min read</span>
          </p>
        </div>

        {/* Quick-Answer block per ranking-playbook.md */}
        <div className="px-6" style={{ maxWidth: 820, margin: '0 auto 36px', position: 'relative', zIndex: 1 }}>
          <div style={{ background: '#F0F7FF', borderLeft: `3px solid ${BRAND}`, borderRadius: 6, padding: '18px 22px' }}>
            <div style={{ ...kicker, marginBottom: 6, color: BRAND_DARK }}>QUICK ANSWER</div>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: INK, margin: 0 }}>
              A McKinsey BA cover letter that gets responses is 250 to 350 words across 3 paragraphs, opens with a specific result you delivered (not a thesis statement), names one specific reason for McKinsey (a recent publication, a named practice, a real conversation with an alum), and ends with a concrete ask. The widget below writes that letter from your resume and the McKinsey JD in 45 seconds.
            </p>
          </div>
        </div>
      </section>

      {/* Widget mount: McKinsey-specific example panel on the left,
          try-it form on the right. Widget takes full width on submit. */}
      <section className="px-6 pt-10 pb-6" style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 18, textAlign: 'center' }}>
          <span style={{ ...kicker, display: 'inline-block' }}>SEE THE OUTPUT, THEN WRITE YOUR OWN</span>
        </div>
        <CoverLetterWidget
          source="seo-preview-cover-letter-mckinsey-ba"
          eyebrow=""
          heading=""
          subhead=""
          examplePanel={<MckinseyBAExamplePanel />}
        />
      </section>

      {/* H2 #1: question-form, prompt-shaped */}
      <section className="px-6 py-14" style={{ maxWidth: 820, margin: '0 auto' }}>
        <h2 style={h2Style}>What does a strong McKinsey BA cover letter look like?</h2>
        <p style={pStyle}>
          250 to 350 words, three paragraphs, on one page. The structure McKinsey recruiters
          read fastest, pulled from recruiter-published feedback and the 2024 to 2025 BA
          cycle:
        </p>
        <ul style={{ ...pStyle, paddingLeft: 22 }}>
          <li><strong>Paragraph 1, the result.</strong> Open with one specific outcome you delivered (numbers, timeline, scope). Map it to the kind of work McKinsey does. This is the only paragraph that decides whether the recruiter reads the next one.</li>
          <li><strong>Paragraph 2, the why-McKinsey.</strong> Name one specific reason for McKinsey that would NOT work for Bain or BCG: a recent McKinsey publication, a named practice you want to join, a real conversation with an alum, a named McKinsey methodology you have applied.</li>
          <li><strong>Paragraph 3, the close.</strong> 2 to 3 sentences. Point to the resume, name the role and class, request an interview with a concrete time-frame ask.</li>
        </ul>
        <p style={pStyle}>
          The widget above defaults to exactly this structure. The example on the left shows
          what the output reads like for a Marshall sophomore applying to the LA office.
        </p>
      </section>

      {/* H2 #2 */}
      <section className="px-6 py-14" style={{ maxWidth: 820, margin: '0 auto', background: '#FAFBFF', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9' }}>
        <h2 style={h2Style}>What does the widget check for a McKinsey BA JD?</h2>
        <p style={pStyle}>
          The seven specific checks tuned to McKinsey's BA letter format. These are the
          flags that drive the rewrites for this specific firm and role.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 18 }}>
          {[
            { t: 'Result-first opener', d: 'First sentence is a specific outcome you delivered, not a thesis statement. Recruiters flag generic openers as #1 cause of cut.' },
            { t: 'McKinsey-only reason', d: 'The why-McKinsey paragraph names something that would not work for Bain or BCG. Generic "I admire the firm" gets flagged.' },
            { t: 'Named practice or office', d: 'Reference a specific practice (Operations, Implementation, McKinsey Digital, Risk & Resilience) or office (LA, NY, Chicago, etc).' },
            { t: 'One resume bullet hook', d: 'Connect one specific resume bullet to one consulting-relevant skill. Do not retell the resume; reference one thing and explain its consulting parallel.' },
            { t: '3-paragraph structure', d: 'McKinsey recruiters spend <60 sec on the letter. 3 paragraphs at 250-350 words is the read-time fit.' },
            { t: 'Concrete close', d: 'Last sentence is a concrete ask, not "I look forward to hearing from you." Name the BA class, the office, the timeframe.' },
            { t: 'No ChatGPT-isms', d: 'The widget strips "In today\'s competitive consulting landscape", "I am writing to express", "as a passionate problem-solver", and similar phrases that recruiters now skim past automatically.' },
          ].map((b) => (
            <div key={b.t} className="rounded-[4px]" style={{ background: '#fff', border: '1px solid #E2E8F0', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <BadgeCheck className="w-4 h-4" style={{ color: BRAND }} />
                <p style={{ fontSize: 14, fontWeight: 700, color: INK, margin: 0 }}>{b.t}</p>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.55, color: '#64748B', margin: 0 }}>{b.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* H2 #3 */}
      <section className="px-6 py-14" style={{ maxWidth: 820, margin: '0 auto' }}>
        <h2 style={h2Style}>How does the McKinsey BA cover letter differ from Bain and BCG?</h2>
        <p style={pStyle}>
          The three firms read cover letters differently. The widget output is tuned for
          each.
        </p>
        <ul style={{ ...pStyle, paddingLeft: 22 }}>
          <li><strong>McKinsey:</strong> Weights cover letter moderately to heavily, especially from non-target schools. Recruiters value the result-first opener and the specific reason for McKinsey. Practice-named reasons score higher than office-named.</li>
          <li><strong>Bain:</strong> De-emphasized cover letters in 2023. Recruiters skim. Letter still matters for tiebreakers; keep it short (200-280 words) and lead with culture-fit signals (sports, A&Cs, BTM-style storytelling).</li>
          <li><strong>BCG:</strong> Weights cover letter moderately. Recruiters want intellectual curiosity signals, ideally tied to a specific BCG project or X (formerly Henderson Institute) publication.</li>
        </ul>
        <p style={pStyle}>
          Run the widget once per firm. The same letter reads as a copy-paste to the McKinsey
          recruiter if it could equally apply to BCG.
        </p>
      </section>

      <HowItWorks
        heading="How the cover letter writer works"
        steps={[
          { Icon: Upload, t: 'Upload your resume', d: 'PDF or DOCX. The widget reads your resume to pull specific bullets it can reference in the letter.' },
          { Icon: Target, t: 'Paste the McKinsey JD', d: 'Either the JD text or the URL of the posting on the McKinsey careers site. The letter is tailored to that exact role and office.' },
          { Icon: PenLine, t: 'Pick a tone', d: 'Professional, conversational, or enthusiastic. For McKinsey BA, default to professional.' },
          { Icon: Download, t: 'Edit and download', d: 'The letter renders in an editable text area on the left, with a live PDF preview on the right. Edit, then download.' },
        ]}
      />

      <InlineEmailCapture {...emailCapture} />

      <FAQ items={FAQ_ITEMS} />

      <PreviewCTA
        eyebrow="WHEN YOU ARE READY FOR THE FULL TOOLKIT"
        headline="Cover letter sent, then reach a McKinsey alum the same session"
        subhead="Once your letter is downloaded, Offerloop helps you find a USC, NYU, Michigan, or UPenn alum at McKinsey, drafts the cold email, and tracks the reply, all in the same workflow."
        buttonText="Create your free Offerloop account"
        to="/signin?mode=signup"
        footnote="Free tier: 3 contacts per search, 2 interview preps, no credit card."
      />

      <ExitIntentCapture
        eyebrow="BEFORE YOU GO"
        heading="The weekly consulting digest"
        subtext="Every Monday: new McKinsey, Bain, and BCG cover letter angles, PEI question drops, and deadline changes. Free, no spam."
        buttonText="Send me the digest"
        cluster="consulting"
      />

      <PreviewFooter />
    </div>
  );
};

export default CoverLetterMckinseyBAPreview;
