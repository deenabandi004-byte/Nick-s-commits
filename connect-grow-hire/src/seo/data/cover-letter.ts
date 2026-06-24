/*
 * Cluster 2: Cover Letter (target: 100 pages, firm x role).
 * /seo-preview/cover-letter/<slug> via CoverLetterTemplate.
 *
 * Wave 0: 4 rich entries below. Waves 1-4 add rows from the firm-role
 * universe in SEO_KEYWORD_UNIVERSE.md, prioritizing banking and consulting
 * (where letters are still read) over tech.
 */
import type { CoverLetterRow } from './types';
import generatedCoverLetter from './generated/cover-letter.generated.json';

export const COVER_LETTER_ROWS: CoverLetterRow[] = [
  ...(generatedCoverLetter as unknown as CoverLetterRow[]),
  // ──────────────────────────────────────────────────────────────────
  // 1. McKinsey BA (hand-built reference)
  // ──────────────────────────────────────────────────────────────────
  {
    slug: 'mckinsey-ba',
    firmSlug: 'mckinsey',
    roleSlug: 'ba',
    primaryKeyword: 'mckinsey business analyst cover letter',
    metaDescription: 'Free McKinsey BA cover letter writer that tailors the letter to your resume and the McKinsey job posting in 45 seconds. 250-350 words, 3 paragraphs, result-first opener, downloadable PDF.',
    quickAnswer: 'A McKinsey BA cover letter that gets responses is 250 to 350 words across 3 paragraphs, opens with a specific result you delivered (not a thesis statement), names one specific reason for McKinsey (a recent publication, a named practice, a real conversation with an alum), and ends with a concrete ask. The widget below writes that letter from your resume and the McKinsey JD in 45 seconds.',
    uniqueDataBlock: [
      { title: 'Result-first opener', body: 'First sentence is a specific outcome you delivered, not a thesis statement. Recruiters flag generic openers as the #1 cause of cut.' },
      { title: 'McKinsey-only reason', body: 'The why-McKinsey paragraph names something that would not work for Bain or BCG. Generic "I admire the firm" gets flagged.' },
      { title: 'Named practice or office', body: 'Reference a specific practice (Operations, Implementation, McKinsey Digital, Risk & Resilience) or office (LA, NY, Chicago).' },
      { title: 'One resume bullet hook', body: 'Connect one specific resume bullet to one consulting-relevant skill. Do not retell the resume; reference one thing and explain its consulting parallel.' },
      { title: '3-paragraph structure', body: 'McKinsey recruiters spend under 60 seconds on the letter. 3 paragraphs at 250-350 words is the read-time fit.' },
      { title: 'Concrete close', body: 'Last sentence is a concrete ask, not "I look forward to hearing from you." Name the BA class, the office, the timeframe.' },
      { title: 'No ChatGPT-isms', body: 'Strip "In today\'s competitive consulting landscape", "I am writing to express", "as a passionate problem-solver", and similar phrases recruiters now skim past automatically.' },
    ],
    examplePanel: {
      studentBlurb: 'USC Marshall student, McKinsey BA application',
      location: 'Los Angeles',
      wordCount: 287,
      paragraphs: [
        'Dear McKinsey Recruiting Team,',
        'Leading a 12-week diagnostic for my campus consulting club\'s pro bono client, a 40-person nonprofit, cut their volunteer turnover by 18% and saved their executive director eight hours a week of recruiting time. The work pulled together stakeholder interviews, a process map, and a phased rollout, the same shape of work I see in McKinsey\'s Operations practice. I am applying to the McKinsey Los Angeles BA class for that reason.',
        'What draws me to McKinsey specifically, beyond the firm\'s range, is the recent Implementation practice work I read in The Operations Practice\'s 2026 industrial productivity report. The case study on the chemicals client\'s frontline-led continuous-improvement program tracked the exact mechanic I struggled with at the nonprofit: how to make a structured intervention stick after the consultants leave. I want to learn that mechanic from the team that wrote the playbook. My conversation last month with Alex Chen (USC \'19, EM in LA) confirmed the practice is a fit; she described the same frontline-engagement work she leads with a consumer-goods client.',
        'The attached resume covers my coursework in Operations and Strategy at USC Marshall, my year on the consulting club\'s leadership team, and a summer at PDL where I owned the rebuild of the customer-onboarding flow. I would welcome the chance to discuss the McKinsey BA role in an interview at your convenience.',
        'Best regards,\nMaya Chen',
      ],
    },
    faq: [
      { q: 'Does McKinsey actually read the cover letter?', a: 'Yes for BA and consultant applications, especially from non-target schools. Recruiters use it as a tiebreaker between two similarly-qualified resumes; a generic letter signals you copy-pasted it across firms, a specific one signals fit.' },
      { q: 'How long should a McKinsey BA cover letter be?', a: '250 to 350 words, single page, three paragraphs. McKinsey recruiters spend under 60 seconds on it.' },
      { q: 'What should the first sentence be?', a: 'A specific result you delivered, not a thesis statement. "Cutting volunteer turnover 18% by leading a 12-week diagnostic" beats "I am writing to express my strong interest."' },
      { q: 'How specific does the "why McKinsey" paragraph need to be?', a: 'Specific enough that the same letter would not work for Bain or BCG. Name one recent McKinsey publication, one practice you want to join, or one named methodology you have applied.' },
      { q: 'Should I name an interviewer or alum I have spoken with?', a: 'Yes, if the connection is real and recent. Do not name-drop someone you have not actually spoken with; recruiters check.' },
      { q: 'Is the widget really free?', a: 'No catch. Upload your resume, paste the McKinsey JD, get the letter and a downloadable PDF, no account required.' },
      { q: 'Can I edit the letter after the widget writes it?', a: 'Yes, in-place. The widget renders the letter in an editable text area on the left and the live PDF preview on the right.' },
      { q: 'How is this different from ChatGPT?', a: 'ChatGPT writes a generic letter that sounds like every other ChatGPT letter. The widget pulls live context from the McKinsey JD, references your resume specifics, defaults to the 3-paragraph 250-350-word format, and lets you Regenerate.' },
    ],
    updatedAt: '2026-05-26',
    published: true,
  },

  // ──────────────────────────────────────────────────────────────────
  // 2. Goldman Sachs IB Analyst cover letter
  // ──────────────────────────────────────────────────────────────────
  {
    slug: 'goldman-sachs-ib-analyst',
    firmSlug: 'goldman-sachs',
    roleSlug: 'ib-analyst',
    primaryKeyword: 'goldman sachs investment banking cover letter',
    metaDescription: 'Free Goldman Sachs IB cover letter writer. Tailors the letter to your resume and the Goldman JD in 45 seconds. 3-paragraph format, deal-language opener, downloadable PDF.',
    quickAnswer: 'A Goldman Sachs IB cover letter that gets read is 250 to 320 words, three paragraphs, and leads with a specific deal-flavored experience (a transaction you supported, a model you built, a financial outcome you delivered). The middle paragraph names the specific Goldman group (TMT, Healthcare, Industrials, FIG) and one named recent deal or thesis. The widget below writes it from your resume and the Goldman JD in 45 seconds.',
    uniqueDataBlock: [
      { title: 'Deal-language opener', body: 'Lead with a specific transaction, model, or deal-adjacent outcome. "Built a $1.2B LBO model that informed a sponsor bid" beats "I am writing to express interest."' },
      { title: 'Named Goldman group', body: 'Goldman analyst applications let you preference groups. Name the specific group (TMT, Healthcare, FIG, Industrials, Consumer, Real Estate) and one recent deal from that group.' },
      { title: 'Recent deal reference', body: 'Mention one Goldman-led 2024-2025 deal relevant to the group you applied to. Shows you read DealBook, the WSJ M&A column, or PitchBook.' },
      { title: '3-paragraph structure', body: 'Hook (deal experience), why-Goldman (named group + named deal), close (the ask). Single page, ~290 words ideal.' },
      { title: 'No "passion for finance" language', body: 'Goldman recruiters cut letters with "passionate about finance" / "drawn to high-paced environments" on sight. Replace with specifics.' },
      { title: 'Concrete close', body: 'Last sentence names the analyst class, the group preference, and a specific timeframe ask. Not "I look forward to hearing from you."' },
      { title: 'Quant outcome in the hook', body: 'Even one number in the first sentence ($, %, multiple, deal size) lifts the read rate. Recruiters skim for numbers first.' },
    ],
    examplePanel: {
      studentBlurb: 'NYU Stern student, Goldman Sachs IB analyst application',
      location: 'New York',
      wordCount: 294,
      paragraphs: [
        'Dear Goldman Sachs Recruiting Team,',
        'Supporting the sell-side advisory on a $1.8B consumer carve-out as a summer analyst at a middle-market bank taught me what it means to run a process: I built the management presentation, tracked 23 bidders across two rounds, and watched the deal close at a 12.3x EV/EBITDA exit, three turns above the floor case in our model. The pace of that work and the responsibility I held even as the most junior person on the team is the reason I am applying to the Goldman Sachs Consumer Retail Group as a full-time analyst.',
        'What draws me to Consumer Retail specifically is the team\'s recent work on the Athletic Greens $1B Series secondary and the rumored $4B-plus Olipop strategic process. Both deals sit at the intersection I find most interesting: scaled DTC brands transitioning from venture capital backing to strategic exits, with the messy capital-structure and earn-out modeling that comes with it. My conversation last month with [name], an analyst in the group who I met through the Stern Investment Banking Society, confirmed the group culture matches what I am looking for.',
        'The attached resume covers my summer at the middle-market bank, my role leading the Stern IB Society modeling workshops this year, and my coursework in Corporate Finance, Financial Modeling, and Advanced Accounting at NYU Stern. I would welcome the chance to discuss the Consumer Retail full-time analyst role in a Superday interview.',
        'Best regards,\nJordan Park',
      ],
    },
    faq: [
      { q: 'Does Goldman actually read cover letters?', a: 'Yes, but skim-read. Recruiters spend under 45 seconds on a Goldman cover letter; the letter\'s job is to confirm the resume narrative and signal genuine fit with the group, not to repeat the resume.' },
      { q: 'How long should a Goldman cover letter be?', a: '250 to 320 words, single page, three paragraphs. Anything longer reads as not-getting-the-point.' },
      { q: 'Should I name the group I want?', a: 'Yes. Goldman analyst applications let you preference groups. Name one in the middle paragraph and reference a recent deal from it.' },
      { q: 'Should I name an analyst I have spoken with?', a: 'Yes if the connection is real and the analyst would remember the conversation. Goldman recruiters do check.' },
      { q: 'Is the widget really free?', a: 'No catch. Upload your resume, paste the Goldman JD, get the letter and a downloadable PDF, no account required.' },
      { q: 'How is this different from ChatGPT?', a: 'ChatGPT writes a generic letter. The widget pulls live context from the Goldman JD, references your resume specifics, defaults to the 3-paragraph format Goldman recruiters expect, and lets you Regenerate.' },
      { q: 'How does this differ from JPM or Morgan Stanley?', a: 'Same overall format, slightly different group-preference language. JPM and MS use different group names and have different recent deal pipelines worth referencing. Run the widget once per firm.' },
      { q: 'What if I am applying to summer, not full-time?', a: 'The widget tunes the cover letter differently for summer applications (less emphasis on closed deals you supported, more on coursework, modeling competitions, and project-based finance experience).' },
    ],
    updatedAt: '2026-05-26',
    published: true,
  },

  // ──────────────────────────────────────────────────────────────────
  // 3. Centerview IB Analyst (high-volume boutique query)
  // ──────────────────────────────────────────────────────────────────
  {
    slug: 'centerview-ib-analyst',
    firmSlug: 'centerview',
    roleSlug: 'ib-analyst',
    primaryKeyword: 'centerview partners cover letter',
    metaDescription: 'Free Centerview Partners cover letter writer. Tailors to your resume and the Centerview JD in 45 seconds. 3-paragraph format, deal-pedigree opener, downloadable PDF.',
    quickAnswer: 'A Centerview cover letter that gets read is 280 to 340 words, three paragraphs, and leads with a specific transactional experience that signals you understand what makes Centerview different (sell-side advisory expertise, partner-heavy deal teams, the highest analyst-to-deal ratio on the Street). The middle paragraph names a specific Centerview deal and the kind of work they are known for. The widget below writes it in 45 seconds.',
    uniqueDataBlock: [
      { title: 'Centerview-specific opener', body: 'Lead with sell-side or strategic-advisory experience. Centerview is sell-side-heavy; private-equity-coverage hooks land flat.' },
      { title: 'Partner-heavy deal team signal', body: 'Centerview prides itself on the highest senior-banker-to-junior ratio on the Street. Reference that you want exposure to senior bankers, not flat hierarchy generality.' },
      { title: 'Named Centerview deal', body: 'Reference one named recent Centerview deal (BMC sale, Pioneer Natural Resources advice, Cigna restructuring, etc.). Shows you have studied the firm.' },
      { title: '3-paragraph structure', body: 'Hook (sell-side/advisory experience), why-Centerview (named deal + partner-heavy model), close (ask). ~310 words ideal.' },
      { title: 'No M&A bromides', body: 'Skip "I am drawn to mergers and acquisitions" / "passion for complex transactions." Replace with one specific deal mechanic you find interesting.' },
      { title: 'Class size + selectivity awareness', body: 'Centerview hires ~10-15 full-time analysts per class. Signaling that you know the selectivity (and want the close partner exposure that comes with it) lands well.' },
      { title: 'GPA bar', body: 'Centerview applications consistently filter for 3.8+ GPA. Surface it visibly in the opening line of Education.' },
    ],
    examplePanel: {
      studentBlurb: 'Wharton senior, Centerview IB analyst application',
      location: 'New York',
      wordCount: 308,
      paragraphs: [
        'Dear Centerview Recruiting Team,',
        'Supporting the sell-side advisory on a $2.3B specialty-chemicals carve-out as a summer analyst at Lazard taught me what differentiates a senior-banker-led process from a junior-led one: the deal closed at a 14.1x EV/EBITDA exit, two turns above what the financial buyers had bid in round one, because our MD personally negotiated the strategic premium with the eventual acquirer. I am applying to the Centerview full-time analyst class because the firm\'s model of partner-led, lean-team M&A is the one I learned to value through that experience.',
        'What draws me specifically to Centerview, beyond the firm\'s reputation for sell-side execution, is the recent BMC Software take-private advisory and the ongoing 21st Century Fox engagement. Both deals show the firm\'s comfort with the complexity I find most interesting: shareholder dynamics, multi-bidder strategic processes, and the partner-led judgment calls that move outcomes by hundreds of basis points. My conversation in February with Sarah Kim (Wharton \'21, analyst in the M&A group) confirmed what I had heard about the firm culture: small teams, direct mentorship, and the senior-banker access I want as a junior.',
        'The attached resume covers my summer at Lazard, my coursework in M&A Strategy, Valuation, and Restructuring at Wharton, and my work this year leading the Wharton Investment and Trading Group\'s buy-side research vertical. I would welcome the chance to discuss the Centerview full-time analyst role.',
        'Best regards,\nAlex Thompson',
      ],
    },
    faq: [
      { q: 'Does Centerview weight cover letters heavily?', a: 'Yes. Centerview hires ~10-15 analysts per year and the recruiter screen reads every cover letter carefully. A generic letter is an automatic cut.' },
      { q: 'What GPA does Centerview want?', a: 'Centerview applications consistently filter for 3.8+ GPA. Surface yours visibly in the opening line of Education.' },
      { q: 'Should I have a specific group preference for Centerview?', a: 'Centerview is generalist M&A, not group-preferenced. The middle paragraph should reference deal types or sectors you find interesting, not a specific group.' },
      { q: 'Should I mention I am applying because I want partner exposure?', a: 'Yes, but specifically. "I want exposure to senior bankers" lands flat; "I want to learn how MDs negotiate strategic premium in sell-side processes" lands.' },
      { q: 'What ATS does Centerview use?', a: 'Centerview uses Greenhouse. Formatting is more lenient than Workday but the recruiter screen is famously strict on writing quality.' },
      { q: 'How do I get an internal referral?', a: 'Use Offerloop\'s Find feature to identify Wharton, Stern, or Harvard alumni at Centerview, then send a cold email asking for 15 minutes. Centerview analysts respond at notably higher rates than the BB banks.' },
      { q: 'Is the widget really free?', a: 'No catch. Upload your resume, paste the Centerview JD, get the letter and a downloadable PDF, no account required.' },
      { q: 'How is this different from Evercore or Lazard?', a: 'Same boutique-M&A category but different culture signals. Evercore weights deal-execution depth; Lazard weights restructuring exposure; Centerview weights sell-side judgment and partner-led model. Run the widget once per firm.' },
    ],
    updatedAt: '2026-05-26',
    published: true,
  },

  // ──────────────────────────────────────────────────────────────────
  // 4. Bain BA cover letter
  // ──────────────────────────────────────────────────────────────────
  {
    slug: 'bain-ba',
    firmSlug: 'bain',
    roleSlug: 'ba',
    primaryKeyword: 'bain business analyst cover letter',
    metaDescription: 'Free Bain Associate Consultant / BA cover letter writer. Tailors to your resume and the Bain JD in 45 seconds. Culture-fit opener, team-athletic signal, downloadable PDF.',
    quickAnswer: 'A Bain Associate Consultant / BA cover letter that gets read is 220 to 300 words (shorter than McKinsey), three paragraphs, and leads with a culture-fit signal (team athletics, organization-building, real ownership in extracurriculars) rather than a pure result. The middle paragraph references a named Bain practice or case, and the close names the office. Bain de-emphasized cover letters in 2023 but still uses them as tiebreakers. The widget writes it in 45 seconds.',
    uniqueDataBlock: [
      { title: 'Culture-fit opener', body: 'Bain weights culture and team athletics. Lead with a leadership-of-a-team story (sports, A&Cs, organization-building), not a pure analytical result.' },
      { title: 'Shorter than McKinsey', body: '220 to 300 words is the Bain norm. Bain recruiters spend less time on cover letters than McKinsey does; tight is better than long.' },
      { title: 'Named Bain practice', body: 'Reference one Bain Capability (Customer Experience, Mergers & Acquisitions, Performance Improvement, Sustainability & Responsibility) or one named recent case.' },
      { title: 'Office reference', body: 'Bain hires by office. Name the specific office you applied to and one reason that office (e.g. LA\'s entertainment-industry exposure, NY\'s PE coverage).' },
      { title: 'No "I am a problem-solver" language', body: 'Bain recruiters skim past "I am drawn to solving complex problems" / "I am a passionate analytical thinker." Replace with a specific story.' },
      { title: '3-paragraph structure', body: 'Hook (team / leadership story), why-Bain (practice + office), close (the ask). Single page, ~270 words ideal.' },
      { title: 'Team-athletic signal', body: 'Sports leadership, club leadership, group-organization stories land especially well with Bain recruiters. Surface one even if not your main experience.' },
    ],
    examplePanel: {
      studentBlurb: 'Michigan Ross student, Bain BA application',
      location: 'Chicago',
      wordCount: 273,
      paragraphs: [
        'Dear Bain Recruiting Team,',
        'Captaining the Michigan Ross women\'s club basketball team this season, taking us from a 4-12 record to the conference semifinals in 14 weeks, taught me the kind of leadership work I want to do for a living: building trust with people who do not have to listen to you, holding the line on standards when convenience pushes the other way, and finding the one play that turns a game. The same shape of work runs through Bain\'s Performance Improvement practice, and that is the reason I am applying to the Bain Chicago BA class.',
        'What draws me to Bain Chicago specifically, beyond the firm\'s collaborative culture, is the office\'s Performance Improvement work with consumer and industrials clients (the Mondelez productivity engagement and the recent CDW supply-chain work in particular). The PI practice runs on the operational-detail-and-leadership-of-frontline-teams combination I learned through the basketball team and through my year leading the Ross Women in Business chapter. My conversation with Priya Shah (Ross \'21, AC in Chicago) confirmed the Chicago office\'s culture is built around the team-athletic feel I want.',
        'The attached resume covers my AC roles in Women in Business and the basketball team, my summer at Target HQ on the Supply Chain Strategy team, and my coursework in Operations and Marketing at Ross. I would welcome the chance to discuss the Bain Chicago BA role.',
        'Best regards,\nMaya Johnson',
      ],
    },
    faq: [
      { q: 'Does Bain actually read cover letters?', a: 'Bain de-emphasized cover letters in 2023, so they read fewer of them. But they still use them as tiebreakers between similarly-qualified resumes. A specific letter signals fit; a generic one signals you did not put in the time.' },
      { q: 'How long should a Bain BA cover letter be?', a: '220 to 300 words. Shorter than McKinsey. Bain recruiters spend less time on the letter, so tight is better than long.' },
      { q: 'What should the opener be?', a: 'A culture-fit story (team leadership, organization-building, real ownership in extracurriculars). Bain weights athletics-and-leadership signal harder than pure analytical results.' },
      { q: 'Should I name a Bain Capability?', a: 'Yes. Reference one Bain Capability (Customer Experience, Performance Improvement, M&A, etc.) in the middle paragraph and explain why it maps to your experience.' },
      { q: 'Should I name a specific office?', a: 'Yes. Bain hires by office and the recruiter screens by office. Name yours and reference one thing about it (industry coverage, culture, alumni you have spoken with).' },
      { q: 'How does this differ from McKinsey?', a: 'Shorter (220-300 vs 250-350), culture-fit opener instead of result-first opener, Bain-specific practice and office names instead of McKinsey-specific ones. Same overall 3-paragraph structure.' },
      { q: 'How do I get an internal referral?', a: 'Use Offerloop\'s Find feature to identify Ross, Marshall, or Wharton alumni at Bain Chicago (or your target office), then send a cold email asking for 15 minutes plus a referral.' },
      { q: 'Is the widget really free?', a: 'No catch. Upload your resume, paste the Bain JD, get the letter and a downloadable PDF, no account required.' },
    ],
    updatedAt: '2026-05-26',
    published: true,
  },

  // Waves 1-4 add the remaining ~96 rows. Each follows the same shape.
];

export const COVER_LETTER_BY_SLUG: Record<string, CoverLetterRow> = Object.fromEntries(
  COVER_LETTER_ROWS.map((r) => [r.slug, r])
);

export const getCoverLetterRow = (slug: string): CoverLetterRow | undefined =>
  COVER_LETTER_BY_SLUG[slug];

export const getPublishedCoverLetterRows = (): CoverLetterRow[] =>
  COVER_LETTER_ROWS.filter((r) => r.published);
