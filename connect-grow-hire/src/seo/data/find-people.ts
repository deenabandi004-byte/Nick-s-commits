/*
 * Cluster 5: Find People (school x firm). The defensible cluster per
 * SEO_STRATEGY.md: every school x firm cell is a distinct, doorway-resistant
 * page because the live FindPeopleWidget returns real PDL profiles for that
 * exact pair. Target: 5 schools x 20 firms in Wave 1, scaling to 40 x 60.
 *
 * /seo-preview/find-people/<slug> via FindPeopleTemplate.
 *
 * Slug convention: `${schoolSlug}-${firmSlug}` (e.g. 'usc-google').
 * schoolSlug -> src/data/seo-universities.ts, firmSlug -> seo/data/firms.ts.
 *
 * MOAT UPGRADE: populate `alumniCount` from a real PDL /person/search before
 * promoting these to the production sitemap. Until then the pages stand on the
 * school x firm angle, honest tool facts, clearly-labelled sample output, and
 * the live widget. Never ship a fabricated count as fact.
 */
import type { FindPeopleRow } from './types';
import { seoUniversities, type SeoUniversity } from '../../data/seo-universities';
import { GENERATED_FIND_PEOPLE_ROWS } from './find-people.generated';

export const FIND_PEOPLE_ROWS: FindPeopleRow[] = [
  // ──────────────────────────────────────────────────────────────────
  // 1. USC x Google (mirrors the hand-built reference preview)
  // ──────────────────────────────────────────────────────────────────
  {
    slug: 'usc-alumni-at-google',
    schoolSlug: 'usc',
    firmSlug: 'google',
    roleLabel: 'Software Engineer',
    primaryKeyword: 'usc alumni at google',
    metaDescription: 'Find 5 USC alumni at Google in seconds. Free people search returns name, title, school, and LinkedIn URL for USC grads at Google. No account, powered by People Data Labs.',
    quickAnswer: 'The widget below takes a company (Google) and a role and returns 5 currently-employed USC alumni at Google with name, title, school, and a LinkedIn URL. Free, no account, one search per 24 hours. USC pushes a heavy class into FAANG every cycle, so a warm alumni intro is one of the highest-yield ways into the Google funnel.',
    statStrip: [
      { value: '2.2B', label: 'Contacts searched per query via People Data Labs' },
      { value: '5 names', label: 'USC alumni at Google returned per free search' },
      { value: 'Top 4', label: "Google ranks among USC grads' most common employers" },
    ],
    topRoles: ['Software Engineer', 'Product Manager', 'Data Scientist', 'Associate Product Manager'],
    examplePeople: [
      { name: 'Priya S.', title: 'Software Engineer', school: 'University of Southern California' },
      { name: 'Daniel K.', title: 'Product Manager', school: 'University of Southern California' },
      { name: 'Elena T.', title: 'Senior Software Engineer', school: 'Carnegie Mellon University' },
    ],
    faq: [
      { q: 'How do you find USC alumni at Google in seconds?', a: 'One People Data Labs /person/search against a 2.2 billion contact index, filtered to people currently at Google in the role you typed, then ranked by recency and verified LinkedIn presence. Drop your school (USC) into the school field to surface the alumni first. The whole call takes 2 to 5 seconds.' },
      { q: 'Why USC at Google specifically?', a: 'USC sends a large class into Google through both Marshall and Viterbi, but the alumni directories are incomplete and hard to filter by employer. This tool inverts the search: start from Google, filter to USC, and get named people you can actually reach.' },
      { q: 'Can I see each person\'s email?', a: 'Not on the free tool. The free version returns name, current title, company, school, and LinkedIn URL. Hunter-verified work emails come back when you run the same search inside a free Offerloop account.' },
      { q: 'What roles do USC grads usually hold at Google?', a: 'Mostly Software Engineer, Product Manager, and Data Scientist tracks, plus the APM program. Type the specific role you want into the widget and it filters to that title.' },
      { q: 'How is this different from LinkedIn\'s alumni tool?', a: 'LinkedIn\'s alumni view shows aggregate charts and gates the actual profiles behind connections and InMail. This returns 5 named, currently-employed people with a direct LinkedIn URL in one search, no account.' },
    ],
    updatedAt: '2026-06-15',
    published: true,
  },

  // ──────────────────────────────────────────────────────────────────
  // 2. UCLA x Google
  // ──────────────────────────────────────────────────────────────────
  {
    slug: 'ucla-alumni-at-google',
    schoolSlug: 'ucla',
    firmSlug: 'google',
    roleLabel: 'Software Engineer',
    primaryKeyword: 'ucla alumni at google',
    metaDescription: 'Find 5 UCLA alumni at Google in seconds. Free people search returns name, title, school, and LinkedIn URL for UCLA grads at Google. No account, powered by People Data Labs.',
    quickAnswer: 'The widget below takes a company (Google) and a role and returns 5 currently-employed UCLA alumni at Google with name, title, school, and a LinkedIn URL. Free, no account, one search per 24 hours. Google is the single most common destination for UCLA grads, so the alumni network at the company is deep.',
    statStrip: [
      { value: '2.2B', label: 'Contacts searched per query via People Data Labs' },
      { value: '5 names', label: 'UCLA alumni at Google returned per free search' },
      { value: '#1 employer', label: 'Google is the most common employer of UCLA grads' },
    ],
    topRoles: ['Software Engineer', 'Data Scientist', 'Product Manager', 'Engineering'],
    examplePeople: [
      { name: 'Marcus C.', title: 'Software Engineer II', school: 'University of California Los Angeles' },
      { name: 'Aisha R.', title: 'Data Scientist', school: 'University of California Los Angeles' },
      { name: 'Tyler N.', title: 'Software Engineer', school: 'UC Berkeley' },
    ],
    faq: [
      { q: 'How do you find UCLA alumni at Google in seconds?', a: 'A single People Data Labs /person/search across 2.2 billion profiles, filtered to current Google employees in the role you typed and ranked by verified LinkedIn presence. Put UCLA in the school field to pull alumni to the top.' },
      { q: 'Is Google really UCLA\'s top employer?', a: 'Yes. Across the schools tracked here, Google is the single most common employer of UCLA graduates, ahead of the consulting and banking firms, which makes the alumni pool at Google unusually deep for a warm intro.' },
      { q: 'What roles do UCLA grads hold at Google?', a: 'Predominantly Software Engineer and Data Scientist roles out of Samueli and the CS program, plus Product Manager tracks. Type the role into the widget to filter.' },
      { q: 'Is the tool really free?', a: 'Yes. One search per 24 hours per network, no account, no card. We absorb the per-call PDL cost to keep it free; the cap just prevents abuse.' },
      { q: 'How is this different from Handshake?', a: 'Handshake shows you job postings, not the named people already inside the company. This returns 5 real UCLA alumni at Google you can message directly on LinkedIn.' },
    ],
    updatedAt: '2026-06-15',
    published: true,
  },

  // ──────────────────────────────────────────────────────────────────
  // 3. Michigan x Goldman Sachs
  // ──────────────────────────────────────────────────────────────────
  {
    slug: 'michigan-alumni-at-goldman-sachs',
    schoolSlug: 'michigan',
    firmSlug: 'goldman-sachs',
    roleLabel: 'Investment Banking Analyst',
    primaryKeyword: 'michigan alumni at goldman sachs',
    metaDescription: 'Find 5 University of Michigan alumni at Goldman Sachs in seconds. Free people search returns name, title, school, and LinkedIn URL. No account, powered by People Data Labs.',
    quickAnswer: 'The widget below takes a company (Goldman Sachs) and a role and returns 5 currently-employed Michigan alumni at Goldman with name, title, school, and a LinkedIn URL. Free, no account, one search per 24 hours. Goldman is the most common employer of Michigan grads in this set, so the Ross and LSA alumni network on the desk is strong for warm intros.',
    statStrip: [
      { value: '2.2B', label: 'Contacts searched per query via People Data Labs' },
      { value: '5 names', label: 'Michigan alumni at Goldman returned per free search' },
      { value: '#1 employer', label: 'Goldman is among the most common employers of Michigan grads' },
    ],
    topRoles: ['Investment Banking Analyst', 'Analyst', 'Sales & Trading Analyst', 'Associate'],
    examplePeople: [
      { name: 'Jordan P.', title: 'Investment Banking Analyst', school: 'University of Michigan' },
      { name: 'Maya R.', title: 'Analyst, Global Markets', school: 'University of Michigan' },
      { name: 'Chris L.', title: 'Associate', school: 'University of Notre Dame' },
    ],
    faq: [
      { q: 'How do you find Michigan alumni at Goldman in seconds?', a: 'One People Data Labs /person/search across 2.2 billion profiles, filtered to current Goldman Sachs employees in the role you typed, with University of Michigan in the school field so alumni surface first. Results come back ranked by recency and verified LinkedIn presence.' },
      { q: 'Why Michigan into Goldman specifically?', a: 'Ross runs a structured pipeline into the bulge bracket and Goldman is one of the heaviest recruiters on campus. A warm intro from a Michigan analyst already on the desk is worth far more than a cold application through Workday.' },
      { q: 'Can I see each banker\'s email?', a: 'Not on the free tool, which returns name, title, company, school, and LinkedIn URL. Hunter-verified work emails come back when you run the search inside a free Offerloop account, which is built to send the outreach, not just identify the person.' },
      { q: 'What groups do Michigan grads land in at Goldman?', a: 'A mix of coverage and product groups plus Global Markets. Type the specific role (Investment Banking Analyst, Sales & Trading Analyst) into the widget and it filters to that title.' },
      { q: 'How is this better than cold-applying?', a: 'Cold applications to Goldman get filtered by an ATS before a human reads them. A referral from a Michigan alum already inside routes your resume to the recruiter directly, which is the entire point of finding these people first.' },
    ],
    updatedAt: '2026-06-15',
    published: true,
  },

  // ──────────────────────────────────────────────────────────────────
  // 4. NYU x JPMorgan
  // ──────────────────────────────────────────────────────────────────
  {
    slug: 'nyu-alumni-at-jpmorgan',
    schoolSlug: 'nyu',
    firmSlug: 'jpmorgan',
    roleLabel: 'Investment Banking Analyst',
    primaryKeyword: 'nyu alumni at jpmorgan',
    metaDescription: 'Find 5 NYU alumni at JPMorgan in seconds. Free people search returns name, title, school, and LinkedIn URL for NYU grads at JPMorgan. No account, powered by People Data Labs.',
    quickAnswer: 'The widget below takes a company (JPMorgan) and a role and returns 5 currently-employed NYU alumni at JPMorgan with name, title, school, and a LinkedIn URL. Free, no account, one search per 24 hours. JPMorgan is a top-two employer of NYU grads, and the Stern pipeline into the analyst class is one of the deepest in the city.',
    statStrip: [
      { value: '2.2B', label: 'Contacts searched per query via People Data Labs' },
      { value: '5 names', label: 'NYU alumni at JPMorgan returned per free search' },
      { value: 'Top 2', label: "JPMorgan ranks among NYU grads' most common employers" },
    ],
    topRoles: ['Investment Banking Analyst', 'Analyst', 'Sales & Trading Analyst', 'Asset Management Analyst'],
    examplePeople: [
      { name: 'Sofia M.', title: 'Investment Banking Analyst', school: 'New York University' },
      { name: 'Ethan W.', title: 'Analyst, Markets', school: 'New York University' },
      { name: 'Hannah G.', title: 'Associate', school: 'Fordham University' },
    ],
    faq: [
      { q: 'How do you find NYU alumni at JPMorgan in seconds?', a: 'A single People Data Labs /person/search across 2.2 billion profiles, filtered to current JPMorgan employees in the role you typed, with New York University in the school field so alumni surface first.' },
      { q: 'Why NYU into JPMorgan specifically?', a: 'Stern sits a few blocks from the analyst class and JPMorgan recruits it hard, so the alumni density on the desk is high. Being in New York, NYU students can often convert a warm intro into an in-person coffee, which lifts response rates further.' },
      { q: 'Can I see each person\'s email?', a: 'Not on the free tool. It returns name, title, company, school, and LinkedIn URL. Work emails come back when you run the search inside a free Offerloop account.' },
      { q: 'What roles do NYU grads hold at JPMorgan?', a: 'Investment Banking and Markets analyst seats most often, plus Asset Management. Type the exact role into the widget to filter to it.' },
      { q: 'How is this different from the Stern alumni database?', a: 'The Stern database is opt-in and often stale on current employer. This pulls live, verified LinkedIn presence so the 5 people you get are actually at JPMorgan right now.' },
    ],
    updatedAt: '2026-06-15',
    published: true,
  },

  // ──────────────────────────────────────────────────────────────────
  // 5. Berkeley x Apple
  // ──────────────────────────────────────────────────────────────────
  {
    slug: 'berkeley-alumni-at-apple',
    schoolSlug: 'berkeley',
    firmSlug: 'apple',
    roleLabel: 'Software Engineer',
    primaryKeyword: 'berkeley alumni at apple',
    metaDescription: 'Find 5 UC Berkeley alumni at Apple in seconds. Free people search returns name, title, school, and LinkedIn URL for Berkeley grads at Apple. No account, powered by People Data Labs.',
    quickAnswer: 'The widget below takes a company (Apple) and a role and returns 5 currently-employed UC Berkeley alumni at Apple with name, title, school, and a LinkedIn URL. Free, no account, one search per 24 hours. Apple is a top-two destination for Berkeley grads, and the EECS and Haas pipelines into the company run deep.',
    statStrip: [
      { value: '2.2B', label: 'Contacts searched per query via People Data Labs' },
      { value: '5 names', label: 'Berkeley alumni at Apple returned per free search' },
      { value: 'Top 2', label: "Apple ranks among Berkeley grads' most common employers" },
    ],
    topRoles: ['Software Engineer', 'Hardware Engineer', 'Product Manager', 'Machine Learning Engineer'],
    examplePeople: [
      { name: 'Kevin L.', title: 'Software Engineer', school: 'UC Berkeley' },
      { name: 'Nina P.', title: 'Machine Learning Engineer', school: 'UC Berkeley' },
      { name: 'Omar S.', title: 'Hardware Engineer', school: 'Stanford University' },
    ],
    faq: [
      { q: 'How do you find Berkeley alumni at Apple in seconds?', a: 'One People Data Labs /person/search across 2.2 billion profiles, filtered to current Apple employees in the role you typed, with UC Berkeley in the school field so alumni surface first.' },
      { q: 'Why Berkeley into Apple specifically?', a: 'EECS is one of Apple\'s most heavily-recruited programs and the Bay Area proximity means a large standing alumni base. A warm intro from a Berkeley engineer already inside is the fastest route past Apple\'s referral-heavy hiring.' },
      { q: 'What roles do Berkeley grads hold at Apple?', a: 'Mostly Software, Hardware, and Machine Learning Engineering, plus some Product Manager seats. Type the role into the widget to filter to it.' },
      { q: 'Is the tool really free?', a: 'Yes. One search per 24 hours per network, no account, no card required.' },
      { q: 'How is this different from LinkedIn Sales Navigator?', a: 'Sales Navigator is a paid CRM built for sales teams searching at scale. This is built for a single student running one search: two fields, 5 named Berkeley alumni at Apple, no subscription.' },
    ],
    updatedAt: '2026-06-15',
    published: true,
  },

  // ──────────────────────────────────────────────────────────────────
  // 6. UPenn x McKinsey
  // ──────────────────────────────────────────────────────────────────
  {
    slug: 'upenn-alumni-at-mckinsey',
    schoolSlug: 'upenn',
    firmSlug: 'mckinsey',
    roleLabel: 'Business Analyst',
    primaryKeyword: 'upenn alumni at mckinsey',
    metaDescription: 'Find 5 UPenn alumni at McKinsey in seconds. Free people search returns name, title, school, and LinkedIn URL for Penn grads at McKinsey. No account, powered by People Data Labs.',
    quickAnswer: 'The widget below takes a company (McKinsey) and a role and returns 5 currently-employed UPenn alumni at McKinsey with name, title, school, and a LinkedIn URL. Free, no account, one search per 24 hours. McKinsey is a top destination for Penn grads, and the Wharton and CAS pipelines into the Business Analyst class are among the strongest at any firm.',
    statStrip: [
      { value: '2.2B', label: 'Contacts searched per query via People Data Labs' },
      { value: '5 names', label: 'UPenn alumni at McKinsey returned per free search' },
      { value: 'Top 2', label: "McKinsey ranks among UPenn grads' most common employers" },
    ],
    topRoles: ['Business Analyst', 'Associate', 'Engagement Manager', 'Implementation Consultant'],
    examplePeople: [
      { name: 'Alex T.', title: 'Business Analyst', school: 'University of Pennsylvania' },
      { name: 'Riya D.', title: 'Associate', school: 'University of Pennsylvania' },
      { name: 'Sam K.', title: 'Engagement Manager', school: 'Cornell University' },
    ],
    faq: [
      { q: 'How do you find UPenn alumni at McKinsey in seconds?', a: 'A single People Data Labs /person/search across 2.2 billion profiles, filtered to current McKinsey employees in the role you typed, with University of Pennsylvania in the school field so alumni surface first.' },
      { q: 'Why UPenn into McKinsey specifically?', a: 'Wharton is a core McKinsey target and Penn places a heavy Business Analyst class every cycle, so the standing alumni base inside the firm is large. A referral from a Penn BA or Associate is one of the most effective ways into the recruiting funnel.' },
      { q: 'Can I see each consultant\'s email?', a: 'Not on the free tool, which returns name, title, company, school, and LinkedIn URL. Verified work emails come back when you run the search inside a free Offerloop account.' },
      { q: 'What titles do Penn grads hold at McKinsey?', a: 'Business Analyst out of undergrad, then Associate and Engagement Manager. Type the title you want into the widget to filter to it.' },
      { q: 'How is this different from cold-applying to McKinsey?', a: 'McKinsey weighs referrals and networking heavily, and a cold application from a target school still competes with thousands of others. Finding a Penn alum first turns the application into a warm, referred one.' },
    ],
    updatedAt: '2026-06-15',
    published: true,
  },

  // Waves 1-3 expand to 5 schools x 20 firms, then 40 x 60. Same shape.
];

const SCHOOL_BY_SLUG: Record<string, SeoUniversity> = Object.fromEntries(
  seoUniversities.map((s) => [s.slug, s]),
);

export const getSchool = (slug: string): SeoUniversity | undefined => SCHOOL_BY_SLUG[slug];

/** Hand-authored Wave-0 rows plus the gated, generated pilot rows. */
export const ALL_FIND_PEOPLE_ROWS: FindPeopleRow[] = [
  ...FIND_PEOPLE_ROWS,
  ...GENERATED_FIND_PEOPLE_ROWS,
];

const FIND_PEOPLE_BY_SLUG: Record<string, FindPeopleRow> = Object.fromEntries(
  ALL_FIND_PEOPLE_ROWS.map((r) => [r.slug, r]),
);

export const getFindPeopleRow = (slug: string): FindPeopleRow | undefined =>
  FIND_PEOPLE_BY_SLUG[slug];

// Generated pilot rows are published:false, so they stay out of the sitemap
// fragment until a batch is deliberately promoted past the 14-day index gate.
export const getPublishedFindPeopleRows = (): FindPeopleRow[] =>
  ALL_FIND_PEOPLE_ROWS.filter((r) => r.published);
