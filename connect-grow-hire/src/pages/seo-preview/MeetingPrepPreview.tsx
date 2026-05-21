/*
 * SEO PREVIEW: product-led page format demo. Not linked, not in sitemap.
 * Route: /seo-preview/meeting-mckinsey
 * The prep-doc preview mirrors the REAL product output (app/utils/meeting_prep.py):
 *   Common Ground + Secret Weapon, Career Arc, 10 questions in 5 categories each
 *   referencing a specific career move / news item, and "what they care about now".
 * "Maya Rodriguez" is an illustrative sample consultant, exaggerated to show quality.
 * House style: no em dashes anywhere in copy.
 */
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowRight, Coffee, Key, UserSearch, FileText, Send, Newspaper, CornerDownRight } from 'lucide-react';
import offerloopLogo from '../../assets/offerloop_logo2.png';
import { InlineEmailCapture, ExitIntentCapture } from './_shared';

const BRAND = '#3B82F6';
const BRAND_DARK = '#2563EB';
const INK = '#0F172A';
const serif = "'Libre Baskerville', Georgia, serif";

const h2Style: React.CSSProperties = { fontFamily: serif, fontSize: '30px', fontWeight: 400, color: INK, marginBottom: '14px', letterSpacing: '-0.02em' };
const pStyle: React.CSSProperties = { fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '14px' };
const kicker: React.CSSProperties = { fontSize: '12px', fontWeight: 700, color: BRAND, letterSpacing: '0.06em' };

const gridLayer = (color: string, fade: string): React.CSSProperties => ({
  position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
  backgroundImage: `linear-gradient(to right, ${color} 1px, transparent 1px), linear-gradient(to bottom, ${color} 1px, transparent 1px)`,
  backgroundSize: '56px 56px',
  maskImage: fade, WebkitMaskImage: fade,
});

// the contact's career timeline
const ARC = [
  { label: 'UCLA', sub: 'B.A. Econ · ’16' },
  { label: 'Deloitte S&O', sub: 'Analyst · ’16-’18' },
  { label: 'McKinsey', sub: 'Business Analyst · ’19' },
  { label: 'McKinsey', sub: 'Associate · ’21' },
  { label: 'McKinsey', sub: 'Engagement Mgr · ’24', now: true },
];

// 5 categories x 1 shown question, each with the data point it was generated from
const QUESTIONS = [
  { cat: 'Career Trajectory', q: 'You moved from Deloitte S&O to McKinsey as a Business Analyst in 2019. Was that a deliberate reset, or did the title come with the firm switch?', hook: 'her 2018→’19 Deloitte→McKinsey move' },
  { cat: 'Company & Role', q: "McKinsey LA's healthcare practice has been leaning into payer cost work. Has that shifted the kind of studies you get staffed on as an EM?", hook: 'recent McKinsey LA healthcare news' },
  { cat: 'Industry Insight', q: 'With hospital systems under real margin pressure, are clients asking McKinsey for cost transformation over growth strategy right now?', hook: 'a 2026 healthcare-cost industry trend' },
  { cat: 'Skill & Craft', q: 'You’ve built deep operating-model design experience. Did you specialize into that, or did McKinsey’s staffing model steer you there?', hook: 'skills listed on her LinkedIn' },
  { cat: 'Personal Journey', q: 'You recruited into McKinsey LA from UCLA. For someone doing the same from USC now, what’s different about LA-office recruiting since 2018?', hook: 'her path vs. your USC profile' },
];

const emailCapture = {
  eyebrow: 'NOT RECRUITING YET?',
  heading: 'Get the weekly consulting recruiting digest',
  subtext: 'MBB deadline changes, case-prep tactics, and a new meeting playbook, every week. For students targeting McKinsey, Bain, and BCG.',
  buttonText: 'Send me the digest',
  cluster: 'consulting',
};

const MeetingPrepPreview = () => {
  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>McKinsey Meeting Prep: Questions + Free Prep Doc | Offerloop</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* Nav */}
      <nav className="w-full px-6 py-5 flex items-center justify-between" style={{ maxWidth: '1100px', margin: '0 auto', position: 'relative', zIndex: 2 }}>
        <Link to="/"><img src={offerloopLogo} alt="Offerloop" style={{ height: '64px', width: 'auto' }} /></Link>
        <Link to="/signin?mode=signup" className="px-5 py-2.5 rounded-[3px] text-sm font-semibold text-white" style={{ background: BRAND }}>
          Get Started Free
        </Link>
      </nav>

      {/* Hero */}
      <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid #F1F5F9' }}>
        <div style={gridLayer('rgba(15,23,42,0.045)', 'radial-gradient(ellipse 75% 70% at 50% 0%, #000 30%, transparent 75%)')} />
        <div style={{ position: 'absolute', top: '-260px', left: '50%', transform: 'translateX(-50%)', width: '1000px', height: '560px', zIndex: 0, pointerEvents: 'none', background: 'radial-gradient(circle, rgba(59,130,246,0.16), transparent 70%)' }} />
        <div className="px-6 pt-16 pb-20 text-center" style={{ maxWidth: '780px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <span className="inline-flex items-center gap-1.5 mb-6" style={{ background: '#EFF5FF', border: '1px solid #DBEAFE', color: BRAND_DARK, fontSize: '12.5px', fontWeight: 600, padding: '5px 12px', borderRadius: '999px' }}>
            <Coffee className="w-3.5 h-3.5" /> MEETING PREP · MCKINSEY
          </span>
          <h1 style={{ fontFamily: serif, fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.03em', color: INK, marginBottom: '20px' }}>
            <span style={{ display: 'block', fontSize: 'clamp(42px, 5.6vw, 64px)' }}>
              Ace your <span style={{ color: BRAND }}>McKinsey</span> meeting
            </span>
            <span style={{ display: 'block', fontSize: 'clamp(20px, 2.7vw, 31px)', color: '#475569', marginTop: '14px', lineHeight: 1.28, letterSpacing: '-0.02em' }}>
              Walk in knowing their whole career and exactly what the office is working on
            </span>
          </h1>
          <p style={{ fontSize: '18px', lineHeight: 1.65, color: '#64748B', maxWidth: '640px', margin: '0 auto' }}>
            Offerloop reads the consultant's LinkedIn, maps every step of their career, surfaces what their team is working on right now and the work the office is known for, then turns it into 10 questions they've never been asked. Five minutes, and you're the most prepared person they meet all week.
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap mt-7">
            {['Every step of their career', 'What the office is working on now', '10 questions in 5 minutes'].map((t) => (
              <span key={t} style={{ fontSize: '13px', fontWeight: 600, color: '#475569', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '3px', padding: '6px 12px' }}>{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="px-6 py-14" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h2 style={h2Style}>Generic prep doesn't survive contact</h2>
        <p style={pStyle}>
          You can find a list of "meeting questions" anywhere. What you can't easily do is prep for <em>this</em> consultant: the career switch they made, the practice they sit in, the McKinsey work they'd expect you to have read. A consultant clocks a generic question in one second. The fix isn't more questions. It's questions built from their actual profile.
        </p>
      </section>

      {/* THE PREP DOC: rich, personalized, exaggerated quality */}
      <section className="px-6 py-16" style={{ background: '#FAFBFF', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto' }}>
          <h2 style={h2Style}>This is the prep doc Offerloop writes you</h2>
          <p style={pStyle}>A real example, generated for one McKinsey engagement manager from her LinkedIn and your profile:</p>

          <div className="rounded-[6px]" style={{ border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 30px 70px -28px rgba(15,23,42,0.32)', background: '#fff' }}>
            <div style={{ height: '4px', background: `linear-gradient(90deg, ${BRAND}, #60A5FA)` }} />

            {/* doc header: the contact */}
            <div className="flex items-center gap-3.5 px-6 py-4" style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
              <div className="flex-shrink-0 flex items-center justify-center" style={{ width: '46px', height: '46px', borderRadius: '50%', background: 'linear-gradient(135deg, #1E3A8A, #3B82F6)', color: '#fff', fontWeight: 700, fontSize: '15px', letterSpacing: '0.02em' }}>MR</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '15px', fontWeight: 700, color: INK }}>Maya Rodriguez</p>
                <p style={{ fontSize: '12.5px', color: '#64748B' }}>Engagement Manager · McKinsey & Company · Los Angeles · Healthcare &amp; Operations</p>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', textAlign: 'right', lineHeight: 1.5 }}>PREP DOC<br />by Offerloop</span>
            </div>

            <div className="px-6 py-6">
              {/* CAREER ARC */}
              <p style={{ ...kicker, marginBottom: '12px' }}>HER CAREER ARC</p>
              <div className="flex items-stretch flex-wrap" style={{ marginBottom: '26px', gap: '0' }}>
                {ARC.map((s, i) => (
                  <div key={i} className="flex items-center">
                    <div style={{ padding: '8px 12px', borderRadius: '4px', background: s.now ? '#EFF5FF' : '#F8FAFC', border: `1px solid ${s.now ? '#BFDBFE' : '#E2E8F0'}`, textAlign: 'center', minWidth: '96px' }}>
                      <p style={{ fontSize: '12.5px', fontWeight: 700, color: s.now ? BRAND_DARK : INK }}>{s.label}</p>
                      <p style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '1px' }}>{s.sub}</p>
                    </div>
                    {i < ARC.length - 1 && <div style={{ width: '14px', height: '2px', background: '#CBD5E1' }} />}
                  </div>
                ))}
              </div>

              {/* COMMON GROUND */}
              <p style={{ ...kicker, marginBottom: '8px' }}>COMMON GROUND</p>
              <p style={{ fontSize: '14px', lineHeight: 1.7, color: '#334155', marginBottom: '12px' }}>
                You and Maya both started in <strong>economics</strong> and did a stint in <strong>Big 4 advisory</strong> before targeting MBB. She ran the exact Deloitte S&O to McKinsey path you're weighing, and recruited from a West Coast school into the <strong>LA office</strong> you're targeting.
              </p>
              <div className="flex gap-3 rounded-[4px] p-3.5" style={{ background: 'linear-gradient(135deg, #EFF5FF, #F8FAFF)', border: '1px solid #BFDBFE', marginBottom: '26px' }}>
                <Key className="flex-shrink-0 w-4 h-4" style={{ color: BRAND_DARK, marginTop: '2px' }} />
                <p style={{ fontSize: '13.5px', lineHeight: 1.65, color: '#1E3A5F' }}>
                  <strong style={{ color: BRAND_DARK }}>Secret weapon: </strong>
                  Maya's UCLA senior thesis was on hospital pricing, and she's staffed in McKinsey LA's healthcare practice today. You're recruiting for healthcare-focused consulting. Lead with that and you're not a student asking for advice. You're someone who cares about the same problem she does.
                </p>
              </div>

              {/* QUESTIONS */}
              <div className="flex items-baseline justify-between" style={{ marginBottom: '12px' }}>
                <p style={kicker}>YOUR 10 QUESTIONS</p>
                <span style={{ fontSize: '11.5px', color: '#94A3B8' }}>5 categories · showing 5 of 10</span>
              </div>
              <div className="space-y-2.5" style={{ marginBottom: '26px' }}>
                {QUESTIONS.map((item, i) => (
                  <div key={i} className="rounded-[4px]" style={{ border: '1px solid #E8EDF3', borderLeft: `3px solid ${BRAND}`, padding: '11px 14px' }}>
                    <p style={{ fontSize: '10.5px', fontWeight: 700, color: BRAND, letterSpacing: '0.05em', marginBottom: '4px' }}>{item.cat.toUpperCase()}</p>
                    <p style={{ fontSize: '13.5px', lineHeight: 1.6, color: '#1E293B', marginBottom: '5px' }}>"{item.q}"</p>
                    <p className="flex items-center gap-1.5" style={{ fontSize: '11.5px', color: '#94A3B8', fontStyle: 'italic' }}>
                      <CornerDownRight className="w-3 h-3" /> generated from {item.hook}
                    </p>
                  </div>
                ))}
              </div>

              {/* WHAT SHE CARES ABOUT NOW */}
              <p className="flex items-center gap-1.5" style={{ ...kicker, marginBottom: '8px' }}>
                <Newspaper className="w-3.5 h-3.5" /> WHAT SHE CARES ABOUT RIGHT NOW
              </p>
              <ul className="space-y-1.5">
                {[
                  ['McKinsey Health Institute published new payer-cost research last month', 'mckinsey.com'],
                  ["McKinsey LA expanded its provider operations team, relevant to Maya's practice", 'industry press'],
                  ['Hospital margin pressure is pushing cost-transformation demand industry-wide', 'sector trend'],
                ].map(([t, src], i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span style={{ color: '#CBD5E1', fontSize: '14px' }}>•</span>
                    <span style={{ fontSize: '13px', lineHeight: 1.6, color: '#334155' }}>{t} <span style={{ color: '#94A3B8' }}>· {src}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p style={{ fontSize: '12.5px', color: '#94A3B8', marginTop: '12px' }}>
            Sample output. Your real prep doc is generated live from the LinkedIn profile you paste and your own resume. Every question changes with the person.
          </p>
        </div>
      </section>

      {/* Do it in Offerloop */}
      <section className="px-6 py-16" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h2 style={h2Style}>How it works</h2>
        <div style={{ position: 'relative', marginTop: '24px' }}>
          <div style={{ position: 'absolute', left: '19px', top: '20px', bottom: '20px', width: '2px', background: '#DBEAFE' }} />
          {[
            { Icon: UserSearch, t: 'Paste their LinkedIn', d: "Drop in the profile of the exact consultant you're meeting. Add your resume so the questions flex to your background too." },
            { Icon: FileText, t: 'Offerloop researches them', d: 'It maps their career arc, pulls recent company and industry news, and finds what you genuinely have in common.' },
            { Icon: Send, t: 'Get the prep doc above', d: 'Common ground, your secret weapon, 10 specific questions, and a follow-up draft. Five minutes, not two hours.' },
          ].map((s, i) => (
            <div key={i} className="flex gap-4" style={{ position: 'relative', marginBottom: i < 2 ? '14px' : 0 }}>
              <div className="flex-shrink-0 flex items-center justify-center" style={{ width: '40px', height: '40px', borderRadius: '50%', background: BRAND, boxShadow: '0 6px 16px -4px rgba(59,130,246,0.5)', zIndex: 1 }}>
                <s.Icon className="text-white" style={{ width: '18px', height: '18px' }} />
              </div>
              <div className="rounded-[4px] p-4 flex-1" style={{ background: '#fff', border: '1px solid #E2E8F0' }}>
                <p className="text-sm font-bold mb-1" style={{ color: INK }}>{i + 1}. {s.t}</p>
                <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#64748B' }}>{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-16" style={{ maxWidth: '800px', margin: '0 auto', background: '#FAFBFF', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: serif, fontSize: '26px', fontWeight: 400, marginBottom: '24px', color: INK }}>Frequently Asked Questions</h2>
        {[
          { q: 'How does Offerloop personalize the questions?', a: 'It reads the consultant’s LinkedIn (their career timeline, education, skills) plus recent company and industry news, and your own resume. Every question references a specific move, role, or news item. No generic questions.' },
          { q: 'Does it work for BCG, Bain, and tech firms too?', a: 'Yes. Paste anyone’s LinkedIn at any firm and the doc rebuilds entirely around that person.' },
          { q: 'What if the consultant has a thin LinkedIn?', a: 'Offerloop still maps what’s there and leans more on company and industry research so the questions stay specific.' },
          { q: 'How long does it take?', a: 'About five minutes from pasting the link to a finished prep doc you can read on your phone before the call.' },
        ].map((f, i) => (
          <div key={i} style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px', color: INK }}>{f.q}</h3>
            <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#4a5568' }}>{f.a}</p>
          </div>
        ))}
      </section>

      <InlineEmailCapture {...emailCapture} />

      {/* CTA */}
      <section style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(140deg, #1D4ED8 0%, #2563EB 50%, #3B82F6 100%)' }}>
        <div style={gridLayer('rgba(255,255,255,0.07)', 'radial-gradient(ellipse 80% 80% at 50% 50%, #000, transparent 75%)')} />
        <div style={{ position: 'absolute', top: '-180px', right: '-120px', width: '520px', height: '520px', zIndex: 0, pointerEvents: 'none', background: 'radial-gradient(circle, rgba(255,255,255,0.22), transparent 65%)' }} />
        <div className="px-6 py-24 text-center" style={{ maxWidth: '640px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <p style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.08em', color: '#BFDBFE', marginBottom: '16px' }}>YOUR CHAT IS COMING UP</p>
          <h2 style={{ fontFamily: serif, fontSize: 'clamp(30px, 4.2vw, 44px)', fontWeight: 400, lineHeight: 1.12, color: '#fff', marginBottom: '14px', letterSpacing: '-0.02em' }}>
            Build a prep doc for the consultant you're actually meeting
          </h2>
          <p style={{ fontSize: '16px', color: '#DBEAFE', marginBottom: '32px', lineHeight: 1.6 }}>
            Paste their LinkedIn. Get common ground, a secret weapon, and 10 questions they've never been asked. Free.
          </p>
          <Link
            to="/meeting-prep?company=McKinsey"
            className="inline-flex items-center gap-2.5 transition-transform duration-150 hover:-translate-y-0.5"
            style={{ background: '#fff', color: BRAND_DARK, fontWeight: 700, fontSize: '16px', padding: '17px 34px', borderRadius: '4px', boxShadow: '0 16px 40px -12px rgba(2,6,23,0.55)' }}
          >
            Prep your first McKinsey meeting <ArrowRight className="w-4 h-4" />
          </Link>
          <p style={{ fontSize: '12.5px', color: '#93C5FD', marginTop: '16px' }}>
            One click opens Offerloop with McKinsey already loaded. No credit card.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6" style={{ borderTop: '1px solid #E2E8F0' }}>
        <div className="flex flex-col md:flex-row justify-between items-center gap-4" style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <p className="text-sm" style={{ color: '#94A3B8' }}>&copy; 2026 Offerloop. All rights reserved.</p>
          <div className="flex gap-6">
            {[{ label: 'About', path: '/about' }, { label: 'Pricing', path: '/pricing' }, { label: 'Privacy', path: '/privacy' }, { label: 'Terms', path: '/terms-of-service' }].map(link => (
              <Link key={link.path} to={link.path} className="text-sm" style={{ color: '#94A3B8' }}>{link.label}</Link>
            ))}
          </div>
        </div>
      </footer>
      <ExitIntentCapture {...emailCapture} />
    </div>
  );
};

export default MeetingPrepPreview;
