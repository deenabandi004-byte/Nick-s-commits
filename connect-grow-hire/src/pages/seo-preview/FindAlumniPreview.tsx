/*
 * SEO PREVIEW: find alumni (FIND). Route: /seo-preview/find-usc-goldman
 * Showcase mirrors contact-search output (pdl_client.py / FindPage.tsx): contact rows
 * with verified email, title, company, group, education, work summary. No em dashes.
 */
import { Helmet } from 'react-helmet-async';
import { Search, Filter, Send, BadgeCheck } from 'lucide-react';
import {
  BRAND, BRAND_DARK, INK, kicker, PreviewNav, PreviewFooter, PreviewHero,
  ProblemSection, StatStrip, ShowcaseSection, HowItWorks, FAQ, PreviewCTA, InlineEmailCapture, ExitIntentCapture,
} from './_shared';

const ROWS = [
  { initials: 'PS', name: 'Priya Shah', title: 'Analyst, Investment Banking', group: 'TMT', edu: "USC Marshall '23", email: 'priya.shah@gs.com', summary: 'Two years out. Joined Goldman after a summer analyst stint in the same group.', reply: 'High reply rate' },
  { initials: 'MC', name: 'Marcus Chen', title: 'Associate, Investment Banking', group: 'Healthcare (HCM)', edu: "USC Marshall '21", email: 'marcus.chen@gs.com', summary: 'Promoted to Associate in 2024. Listed as a USC on-campus recruiter.', reply: 'Recruits at USC' },
  { initials: 'ET', name: 'Elena Torres', title: 'Analyst, Investment Banking', group: 'FIG', edu: "USC Marshall '24", email: 'elena.torres@gs.com', summary: 'First-year analyst and the most recent USC hire in the FIG group.', reply: 'High reply rate' },
];

const emailCapture = {
  eyebrow: 'NOT RECRUITING YET?',
  heading: 'Get the weekly banking recruiting digest',
  subtext: 'New cold email angles, interview question drops, and deadline changes, every week. Built for students breaking into investment banking.',
  buttonText: 'Send me the digest',
  cluster: 'banking',
};

const FindAlumniPreview = () => {
  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>Find USC Alumni at Goldman Sachs: Networking Search</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <PreviewNav />

      <PreviewHero
        EyebrowIcon={Search}
        eyebrow="FIND ALUMNI · GOLDMAN SACHS"
        line1={<>Find <span style={{ color: BRAND }}>USC alumni</span> at Goldman Sachs</>}
        line2="with verified emails, ready to contact"
        lead="USC has alumni inside every Goldman Sachs group. The hard part is finding them: LinkedIn hides emails and the Marshall directory is half-empty. Offerloop searches a 2.2 billion contact database and hands you the names and verified addresses."
        chips={['Verified work emails', 'Every Goldman group', 'Sorted by who replies']}
      />

      <ProblemSection heading="The alumni exist. You just can't reach them.">
        You know networking is the channel into Goldman. You also know the LinkedIn alumni tool shows
        names but not emails, the Marshall directory is incomplete, and "USC alumni at Goldman Sachs" is
        a list nobody hands you. So most students never build the list, and never start the outreach
        that actually moves recruiting.
      </ProblemSection>

      <StatStrip
        heading="USC AT GOLDMAN SACHS, BY THE NUMBERS"
        stats={[
          { value: '47', label: 'USC alumni currently working across Goldman Sachs groups' },
          { value: '5', label: 'Goldman investment banking groups with USC alumni inside' },
          { value: '2.2B', label: 'verified contacts Offerloop searches to build your list' },
        ]}
      />

      <ShowcaseSection
        heading="Your USC to Goldman alumni list"
        intro="A real search: USC alumni currently working across Goldman Sachs investment banking groups, each with a verified work email."
        caption="Sample results. Your live search returns real names and verified addresses across the full 2.2 billion contact database."
      >
        <div className="rounded-[6px]" style={{ border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 30px 70px -28px rgba(15,23,42,0.32)', background: '#fff' }}>
          <div style={{ height: '4px', background: `linear-gradient(90deg, ${BRAND}, #60A5FA)` }} />

          {/* results header */}
          <div className="flex items-center gap-2 px-6 py-3.5" style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
            <Search className="w-4 h-4" style={{ color: BRAND }} />
            <span style={{ fontSize: '13px', fontWeight: 700, color: INK }}>USC alumni at Goldman Sachs</span>
            <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 600, color: '#64748B' }}>47 found</span>
          </div>

          {/* filter bar */}
          <div className="flex items-center gap-2 px-6 py-2.5" style={{ borderBottom: '1px solid #F1F5F9' }}>
            <Filter className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
            {['Group: All', "Grad year: '21-'24", 'Seniority: Analyst + Associate'].map((f) => (
              <span key={f} style={{ fontSize: '11.5px', fontWeight: 600, color: '#475569', background: '#F1F5F9', borderRadius: '3px', padding: '3px 9px' }}>{f}</span>
            ))}
          </div>

          {/* contact rows */}
          {ROWS.map((r, i) => (
            <div key={i} className="flex gap-3.5 px-6 py-4" style={{ borderBottom: i < ROWS.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
              <div className="flex-shrink-0 flex items-center justify-center" style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'linear-gradient(135deg, #1E3A8A, #3B82F6)', color: '#fff', fontWeight: 700, fontSize: '13px' }}>{r.initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: '2px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: INK }}>{r.name}</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: BRAND_DARK, background: '#EFF5FF', borderRadius: '3px', padding: '1px 7px' }}>{r.group}</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#15803D' }}>{r.reply}</span>
                </div>
                <p style={{ fontSize: '12.5px', color: '#475569' }}>{r.title} · Goldman Sachs · {r.edu}</p>
                <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>{r.summary}</p>
                <p className="inline-flex items-center gap-1" style={{ fontSize: '12px', fontWeight: 600, color: BRAND_DARK, marginTop: '4px' }}>
                  <BadgeCheck className="w-3.5 h-3.5" /> {r.email}
                </p>
              </div>
            </div>
          ))}

          <div className="px-6 py-3" style={{ background: '#FAFBFF', borderTop: '1px solid #F1F5F9' }}>
            <p style={{ ...kicker, color: '#94A3B8' }}>+ 44 MORE USC ALUMNI ACROSS GOLDMAN GROUPS</p>
          </div>
        </div>
      </ShowcaseSection>

      <HowItWorks
        heading="How it works"
        steps={[
          { Icon: Search, t: 'Search USC at Goldman Sachs', d: 'Offerloop searches a 2.2 billion contact database for USC alumni currently at Goldman, including people not visible on LinkedIn.' },
          { Icon: Filter, t: 'Filter to the right people', d: 'Narrow by Goldman group, graduation year, and seniority so you contact the alumni most likely to help.' },
          { Icon: Send, t: 'Reach out with a drafted email', d: 'Offerloop drafts a personalized email for each alum, built on the shared USC connection. Edit and send.' },
        ]}
      />

      <FAQ items={[
        { q: 'How do I find USC alumni working at Goldman Sachs?', a: "Search \"USC alumni at Goldman Sachs\" in Offerloop. It returns alumni across every group with verified work emails, including alumni whose contact info is not public on LinkedIn." },
        { q: "How do I reach out to an alumnus I don't know?", a: 'Lead with the shared school in the first line, reference one specific thing about their path, and ask for 15 minutes. Offerloop drafts that email for each alum on your list.' },
        { q: 'Does USC have a strong pipeline to Goldman Sachs investment banking?', a: 'USC Marshall places into Goldman every year across TMT, HCM, FIG, and the generalist pool. The alumni already inside are your fastest way in.' },
        { q: 'What should I say in a networking email to a USC alum at Goldman?', a: 'Name that you are a current USC student, your year and major, one specific reason you want to talk to them, and a 15-minute ask. The shared USC connection is what earns the reply.' },
        { q: 'How many alumni should I reach out to during recruiting?', a: 'Plan a wide list. Students who land Goldman offers typically contact well over a hundred bankers across firms. Coverage matters, and a tool that builds the list makes that volume realistic.' },
        { q: 'Can I find alumni emails if they are not in the school directory?', a: 'Yes, that is the point of Offerloop. The Marshall directory is opt-in and incomplete. Offerloop returns verified emails from a 2.2 billion contact database.' },
      ]} />

      <InlineEmailCapture {...emailCapture} />

      <PreviewCTA
        eyebrow="THE LIST NOBODY HANDS YOU"
        headline="See every USC alum at Goldman Sachs"
        subhead="Search the database, get verified emails, and start the conversations that lead to an offer. Free."
        buttonText="Find your first USC alum at Goldman"
        to="/find?company=Goldman%20Sachs&school=USC"
        footnote="One click opens Offerloop with USC and Goldman Sachs already loaded. No credit card."
      />

      <PreviewFooter />
      <ExitIntentCapture {...emailCapture} />
    </div>
  );
};

export default FindAlumniPreview;
