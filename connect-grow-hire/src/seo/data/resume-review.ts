/*
 * Cluster 1: Resume Review (target: 100 pages, firm x role).
 *
 * Each row renders /seo-preview/resume-review/<slug> via ResumeReviewTemplate.
 *
 * Wave 0 (live now): 5 rich entries seeded below. The original Goldman IB
 * hand-built mock at /seo-preview/resume-review-goldman-ib remains live as
 * the reference implementation but is the same content as the `goldman-sachs-ib-analyst`
 * row below (templates emit identical pages).
 *
 * Waves 1-4: add rows from the universe per SEO_KEYWORD_UNIVERSE.md.
 * 100 firm-role pairs total: 10 banks x 4 banking roles + 5 consulting x 4
 * consulting roles + 10 tech x 4 tech roles.
 */
import type { ResumeReviewRow } from './types';
import generatedResumeReview from './generated/resume-review.generated.json';

export const RESUME_REVIEW_ROWS: ResumeReviewRow[] = [
  ...(generatedResumeReview as unknown as ResumeReviewRow[]),
  // ──────────────────────────────────────────────────────────────────
  // 1. Goldman Sachs IB Analyst (the hand-built reference)
  // ──────────────────────────────────────────────────────────────────
  {
    slug: 'goldman-sachs-ib-analyst',
    firmSlug: 'goldman-sachs',
    roleSlug: 'ib-analyst',
    primaryKeyword: 'goldman sachs ib analyst resume',
    metaDescription: 'Free resume review for Goldman Sachs investment banking analyst applications. Upload your PDF, paste the JD, get your ATS score and line-by-line edits that get past Workday\'s first cut.',
    quickAnswer: 'Goldman Sachs runs every analyst application through Workday, which scores resumes against the JD for keyword match, format, and section structure before a recruiter ever opens the file. A passing Goldman IB resume hits 75+ on keyword match, uses single-column formatting, names specific deal types and models (LBO, accretion/dilution, three-statement), and quantifies every bullet. The widget below scores yours against the actual Goldman JD in 30 seconds.',
    statStrip: [
      { value: '300+', label: 'applicants on average per Goldman Sachs analyst opening' },
      { value: '~6 sec', label: 'average first-scan time a banking recruiter spends per resume after the ATS pass' },
      { value: '30 sec', label: 'what the widget above takes to score your resume against the JD' },
    ],
    uniqueDataBlock: [
      { title: 'Deal language', body: 'Buyside/sellside, M&A, leveraged finance, IPO, debt issuance, restructuring. JDs require these as keywords.' },
      { title: 'Modeling depth', body: 'Three-statement, DCF, LBO, accretion/dilution, comps. Generic "financial analysis" loses to the named model.' },
      { title: 'Quant outcomes', body: 'Every bullet ends in a dollar figure, a multiple, a basis-point delta, or a percentage.' },
      { title: 'Section ordering', body: 'Education first for analyst applications. GPA visible. Relevant coursework, not full transcript.' },
      { title: 'Bullet cadence', body: 'Action verb + transaction + scale + outcome. ~22-30 words per bullet, never more than two lines.' },
      { title: 'ATS-safe layout', body: 'Single column. No tables, no graphics, no text in headers or footers. Goldman uses Workday under the hood.' },
      { title: 'JD keyword match', body: 'The score includes a raw match against the JD you paste. Missing keywords are returned as a chip strip.' },
    ],
    examplePanel: {
      studentBlurb: 'USC Marshall student, Goldman IB analyst JD',
      score: 92,
      scoreLabel: 'Goldman-ready',
      previousScore: 58,
      rewriteCount: 3,
      recommendations: [
        { section: 'EXPERIENCE', chip: 'Quantify impact', severity: 'high',
          original: 'Helped with financial analysis for a leveraged buyout in the consumer sector.',
          suggested: 'Built a 3-statement LBO model for a $1.2B sponsor-led carve-out of a $400M EBITDA consumer assets group, sized $750M of debt across TLB and secured notes, modeled 22% sponsor IRR at a 9.0x exit multiple.',
          why: 'Goldman M&A JDs grade three things on every bullet: deal size, financial mechanic, outcome. The original surfaces none.' },
        { section: 'EXPERIENCE', chip: 'IB keyword density', severity: 'high',
          original: 'Built spreadsheets to model financial scenarios and present to senior team members.',
          suggested: 'Built a merger model and accretion/dilution analysis for a $2.4B all-stock combination, including synergy waterfall, deal financing matrix (cash/stock/debt), and revenue synergy sensitivity. Presented in IC materials to MD-level reviewers.',
          why: 'Workday matches the JD verbatim. Goldman analyst postings call out merger model, accretion/dilution, IC materials by name.' },
        { section: 'SECTION ORDER', chip: 'Analyst convention', severity: 'medium',
          original: 'Work Experience above Education',
          suggested: 'Move Education to the top of page 1, with school, GPA, expected graduation, and 4-6 relevant courses.',
          why: 'Analyst applications are screened against undergrad cohort. The recruiter expects school, GPA, and grad year in the top quarter of page 1.' },
      ],
    },
    faq: [
      { q: 'Is this really free? What is the catch?', a: 'No catch. Upload, paste, get the score and the rewrites without an account. We ask for an email when you submit so we can send you the report and the weekly banking digest, and so we can rate-limit the tool.' },
      { q: 'Will Goldman know I used Offerloop?', a: 'No. Offerloop never contacts the firm. The output is a PDF you download and submit through Goldman\'s own application portal. We do not stamp the PDF or include any tracking marker.' },
      { q: 'What ATS does Goldman use?', a: 'Goldman runs applications through Workday for most regions and roles. Workday is strict about formatting: single column, no tables, no graphics, no text in headers or footers, standard fonts. The widget flags these issues directly.' },
      { q: 'I am applying to multiple banks. Do I rerun this for each one?', a: 'Yes, and you should. The ATS keyword match is tailored to whichever JD you paste. A bullet that scores well for Goldman M&A may score worse for a Morgan Stanley capital markets posting because the keyword set differs.' },
      { q: 'My GPA is below 3.5. Should I leave it off?', a: 'For Goldman analyst applications the recruiter expectation is GPA visible. Leaving it off reads as hiding it, which gets weighted more harshly than a 3.4 would.' },
      { q: 'How is the score calculated?', a: 'Three weighted components: keyword match against the JD, formatting/ATS compliance, and content relevance. The widget shows the breakdown so you can see where you are losing points.' },
      { q: 'Do you keep my resume?', a: 'We keep the parsed text long enough to send you the report. The PDF itself is processed in memory and not retained. Full policy on the Privacy page.' },
      { q: 'What if my recommendations look generic?', a: 'Either the JD you pasted was too short for the model to extract specific requirements, or your resume already aligns well. Paste the full JD (not just the role title) for the best line-by-line rewrites.' },
    ],
    updatedAt: '2026-05-26',
    published: true,
  },

  // ──────────────────────────────────────────────────────────────────
  // 2. JPMorgan IB Analyst
  // ──────────────────────────────────────────────────────────────────
  {
    slug: 'jpmorgan-ib-analyst',
    firmSlug: 'jpmorgan',
    roleSlug: 'ib-analyst',
    primaryKeyword: 'jpmorgan investment banking analyst resume',
    metaDescription: 'Free resume review for JPMorgan investment banking analyst applications. Score your resume against the JD, get line-by-line edits that pass Workday and the recruiter\'s 6-second scan.',
    quickAnswer: 'JPMorgan parses every analyst application through Workday with the same strictness as Goldman. The 2026 IB analyst class is targeting 2,800 hires globally against ~200,000 applications, putting the keyword bar high. A passing JPM resume hits 75+ ATS, leads bullets with the deal type and a quantified outcome, and surfaces sector coverage relevant to the group you applied to (TMT, healthcare, consumer, FIG). The widget below scores yours against the JPM JD in 30 seconds.',
    statStrip: [
      { value: '~71x', label: 'oversubscription ratio for the 2026 JPM IB analyst class (200K apps for 2,800 seats)' },
      { value: 'Workday', label: 'JPM\'s ATS, same parser strictness as Goldman' },
      { value: '30 sec', label: 'what the widget above takes to score your resume against the JD' },
    ],
    uniqueDataBlock: [
      { title: 'Sector coverage signal', body: 'JPM analyst JDs name the coverage group (TMT, healthcare, FIG, consumer, industrials). Bullets that surface relevant sector exposure score higher.' },
      { title: 'JPM modeling language', body: 'Same model set as Goldman (LBO, DCF, accretion/dilution) but JPM JDs more often call out "trading comps" and "precedent transactions" by name.' },
      { title: 'Athletic Greens, Apollo, Endeavor', body: 'JPM-led 2024-2025 deals frequently named in recent JDs as "complex situations" examples. Referencing one in your bullets shows you have studied the deal pipeline.' },
      { title: 'Workday formatting rules', body: 'Single column, no tables, standard fonts, MM/YYYY dates, contact info in body not header. ~41% Workday parse failure on two-column resumes.' },
      { title: 'Section ordering', body: 'Education first. GPA visible. Recent JPM JDs flag "minimum 3.5 GPA preferred" verbatim; leaving GPA off reads as hiding it.' },
      { title: 'Diversity and SEO badges', body: 'JPM-specific signals (Launching Leaders, Advancing Black Pathways, etc.) belong in a dedicated line under Education if applicable.' },
      { title: 'Bullet quantification', body: 'Every bullet should end in $, %, multiple, or basis-point delta. JPM\'s parser flags verb-only bullets ("Helped with...") as content-light.' },
    ],
    examplePanel: {
      studentBlurb: 'NYU Stern student, JPMorgan IB analyst JD',
      score: 91,
      scoreLabel: 'JPM-ready',
      previousScore: 61,
      rewriteCount: 3,
      recommendations: [
        { section: 'EXPERIENCE', chip: 'Sector coverage signal', severity: 'high',
          original: 'Worked on a deal for a consumer goods client.',
          suggested: 'Supported sell-side advisory on a $1.8B carve-out of a household-products division (consumer coverage), built the management presentation and the buyer process tracker across 14 strategic and 9 sponsor bidders, second-round bids received within 6 weeks.',
          why: 'JPM consumer coverage JDs name "household products" and "process management" by keyword. Naming the sector and the scale moves this bullet from generic to indexed.' },
        { section: 'EXPERIENCE', chip: 'Named model', severity: 'high',
          original: 'Built models in Excel to evaluate deal structures.',
          suggested: 'Built a precedent transactions analysis across 12 comparable consumer M&A transactions ($500M to $3B EV), normalized for synergies and minority-interest adjustments, output a valuation range of 11.5-13.0x EV/EBITDA used in the MD pitch deck.',
          why: 'JPM JDs call out "precedent transactions" and "trading comps" verbatim. Replacing "models in Excel" with the named valuation methodology hits the keyword match directly.' },
        { section: 'EDUCATION', chip: 'JPM-specific signal', severity: 'medium',
          original: 'NYU Stern, Finance major',
          suggested: 'NYU Stern \'27, B.S. Finance + Data Science · GPA 3.81 · Expected May 2027 · Relevant coursework: Foundations of Finance, Financial Modeling, Corporate Finance, Accounting · JPM Launching Leaders 2025 cohort',
          why: 'JPM weights named JPM diversity/early-engagement programs (Launching Leaders, Advancing Black Pathways) when filtering. Surfacing it in Education raises first-pass relevance.' },
      ],
    },
    faq: [
      { q: 'Does JPM weight cover letters?', a: 'JPM does not require cover letters for most analyst applications and the recruiters do not read them in the first pass. Spend the time on the resume and the application form responses instead.' },
      { q: 'What groups should I rank in the JPM application?', a: 'JPM uses preference ranking, and the algorithm reportedly weights your second and third choices similarly to your first. Ranking M&A first and a sector group (TMT, healthcare, FIG, consumer) second is the safest pattern.' },
      { q: 'Will JPM see my Goldman application?', a: 'No. Application data is firm-internal. Recruiters do not cross-reference applications between firms.' },
      { q: 'What ATS does JPM use?', a: 'JPM runs applications through Workday for most regions and roles. The widget formats your resume to be Workday-clean, which also parses cleanly in Greenhouse, Lever, and iCIMS.' },
      { q: 'My GPA is below 3.5. Should I leave it off?', a: 'Recent JPM JDs flag "minimum 3.5 GPA preferred" verbatim. Leaving GPA off reads as hiding it and gets weighted more harshly than a 3.4 would. Keep it visible.' },
      { q: 'How does this differ from a Goldman resume?', a: 'Same Workday parser, same modeling vocabulary, slightly different sector coverage signal. JPM JDs more often name "trading comps" and "precedent transactions" by keyword; Goldman JDs more often emphasize "deal execution" and "process management."' },
      { q: 'Do you keep my resume?', a: 'We keep the parsed text long enough to send you the report. The PDF itself is processed in memory and not retained.' },
      { q: 'What if my JD is for a SUMMER role, not full-time?', a: 'Paste the summer JD specifically. The widget tunes the keyword match and the bullet conventions differently for summer analyst JDs (less emphasis on closed deals, more on coursework and project-based experience).' },
    ],
    updatedAt: '2026-05-26',
    published: true,
  },

  // ──────────────────────────────────────────────────────────────────
  // 3. McKinsey BA
  // ──────────────────────────────────────────────────────────────────
  {
    slug: 'mckinsey-ba',
    firmSlug: 'mckinsey',
    roleSlug: 'ba',
    primaryKeyword: 'mckinsey business analyst resume',
    metaDescription: 'Free resume review for McKinsey Business Analyst applications. Score your resume against the JD, get line-by-line edits with case-hint language and leadership signal McKinsey recruiters look for.',
    quickAnswer: 'McKinsey runs BA applications through an internal review built on top of Workday, with the recruiter scan focusing on structured-problem-solving signal, quantified leadership, and one distinctive personal narrative. A passing McKinsey BA resume hits 80+ on the parser, leads each bullet with a result (not a task), and surfaces 1-2 leadership roles where you owned the outcome. The widget below scores yours against the actual McKinsey JD in 30 seconds.',
    statStrip: [
      { value: '<1%', label: 'reported acceptance rate for McKinsey BA programs at most target schools' },
      { value: '3', label: 'PEI dimensions McKinsey screens for: leadership, drive, personal impact' },
      { value: '30 sec', label: 'what the widget above takes to score your resume against the JD' },
    ],
    uniqueDataBlock: [
      { title: 'Result-first bullets', body: 'McKinsey BA recruiters look for the outcome in the first 5 words of every bullet. "Cut volunteer turnover 18% by..." beats "Led a 12-week diagnostic to..."' },
      { title: 'Leadership-with-scope', body: 'Every leadership role should name the team size, the duration, and the measurable result. "5-person team, 12 weeks, 18% reduction" hits all three.' },
      { title: 'Case-hint language', body: 'Bullets that show structured thinking ("hypothesis-driven analysis", "MECE breakdown", "synthesized findings into a 3-part recommendation") score higher because they signal you have done some case prep.' },
      { title: 'Quant comfort signal', body: 'McKinsey weights quantitative coursework and one statistics or modeling-heavy project. Surface it in coursework or projects.' },
      { title: 'One distinctive thread', body: 'McKinsey filters for "one interesting story per resume." Sports, entrepreneurship, research, arts, anything that gives the interviewer one hook for PEI.' },
      { title: 'School-section format', body: 'School first, GPA visible, expected grad, relevant coursework (4-6 max), study-abroad if applicable. McKinsey reads top-down.' },
      { title: 'No prestige-stuffing', body: 'McKinsey recruiters notice when a resume lists 8 honor societies and 4 conferences. One or two with depth beats a long list with no commitment.' },
    ],
    examplePanel: {
      studentBlurb: 'USC Marshall student, McKinsey BA JD',
      score: 90,
      scoreLabel: 'McKinsey-ready',
      previousScore: 62,
      rewriteCount: 3,
      recommendations: [
        { section: 'EXPERIENCE', chip: 'Result-first opener', severity: 'high',
          original: 'Led a 12-week diagnostic for a 40-person environmental nonprofit struggling with volunteer turnover.',
          suggested: 'Cut volunteer turnover 18% over two quarters by leading a 12-week stakeholder-interview-driven diagnostic for a 40-person environmental nonprofit, redesigning the onboarding flow and saving the ED 8 hours/week of recruiting time.',
          why: 'McKinsey recruiters look for the outcome in the first 5 words. Moving the 18% result to the front turns a task description into a McKinsey-shaped bullet.' },
        { section: 'EXPERIENCE', chip: 'Case-hint language', severity: 'high',
          original: 'Analyzed customer retention data for a SaaS company internship.',
          suggested: 'Ran a hypothesis-driven cohort analysis on 18 months of SaaS retention data ($2.4M ARR), identified 3 primary churn drivers, recommended an onboarding email sequence that lifted 30-day retention from 64% to 71% in A/B test.',
          why: 'Bullets with "hypothesis-driven", "cohort analysis", and a clean before/after read as case-prep-ready and signal structured thinking to a McKinsey recruiter.' },
        { section: 'EDUCATION', chip: 'McKinsey-format school block', severity: 'medium',
          original: 'University of Southern California, Marshall School of Business, Finance',
          suggested: 'USC Marshall \'27, B.S. Business Administration · Concentration: Finance · GPA 3.85 · Expected May 2027 · Relevant coursework: Operations Management, Statistical Analysis, Microeconomics, Decision Modeling',
          why: 'McKinsey reads the school block first. Tighter format, GPA visible, 4 relevant courses that signal quant comfort lifts first-pass relevance.' },
      ],
    },
    faq: [
      { q: 'Does McKinsey read cover letters?', a: 'Yes for BA applications, especially from non-target schools. McKinsey weights the cover letter moderately to heavily; spend ~280 words on it. See our McKinsey BA cover letter page for the format.' },
      { q: 'What GPA does McKinsey want?', a: 'McKinsey does not publish a hard floor but the consensus across the 2025 cycle is 3.7+ for target schools, 3.8+ for semi-targets, and 3.9+ for non-targets without other distinctive signal.' },
      { q: 'How does McKinsey BA differ from Bain and BCG?', a: 'McKinsey weights leadership-with-scope and structured-thinking signal hardest. Bain weights culture fit and team athleticism. BCG weights intellectual curiosity and analytical range. Tune the resume slightly per firm.' },
      { q: 'Will McKinsey see if I applied to Bain or BCG?', a: 'No. Each firm\'s application is internal. Recruiters do not cross-reference.' },
      { q: 'What ATS does McKinsey use?', a: 'McKinsey uses an internal applicant system built on top of Workday for most regions. Same formatting rules apply: single column, standard fonts, no tables.' },
      { q: 'How do I get an internal referral?', a: 'Use Offerloop\'s Find feature to identify USC, NYU, Michigan, or UPenn alumni at McKinsey, then send a cold email asking for 15 minutes. McKinsey alumni respond at notably higher rates than the BB banks.' },
      { q: 'How early do I need to apply?', a: 'McKinsey pulled BA recruiting earlier in 2026. Sophomore-fall is now the standard for first interactions; junior-year-summer applications close in early August at most schools.' },
      { q: 'Do you keep my resume?', a: 'We keep the parsed text long enough to send you the report. The PDF is processed in memory and not retained.' },
    ],
    updatedAt: '2026-05-26',
    published: true,
  },

  // ──────────────────────────────────────────────────────────────────
  // 4. Google SWE
  // ──────────────────────────────────────────────────────────────────
  {
    slug: 'google-swe',
    firmSlug: 'google',
    roleSlug: 'swe',
    primaryKeyword: 'google software engineer resume',
    metaDescription: 'Free resume review for Google Software Engineer applications. Score your resume against the JD, get line-by-line edits with the named-system signal and quantified-scope language Google recruiters look for.',
    quickAnswer: 'Google parses SWE applications through its internal ATS with the recruiter scan focusing on named systems, quantified scope, and impact-per-engineer signal. A passing Google SWE resume hits 80+ on the parser, leads bullets with the system you owned and the scale (QPS, users, latency, $), and shows one project where you owned the design end-to-end. The widget below scores yours against the actual Google JD in 30 seconds.',
    statStrip: [
      { value: '~0.2%', label: 'reported acceptance rate for Google new-grad SWE roles across recent cycles' },
      { value: '3', label: 'signals Google recruiters scan for: named systems, scope, end-to-end ownership' },
      { value: '30 sec', label: 'what the widget above takes to score your resume against the JD' },
    ],
    uniqueDataBlock: [
      { title: 'Named systems, not buzzwords', body: 'Replace "distributed systems" with the actual system: Spanner, Bigtable, Pub/Sub, Cloud Run, plus the language and the protocol. Specificity scores higher than buzzword density.' },
      { title: 'Scope quantification', body: 'Every backend bullet should carry one of: QPS handled, users served, p99 latency, data volume, infra cost. Frontend gets Core Web Vitals, bundle size, render time.' },
      { title: 'End-to-end ownership story', body: 'Google recruiters look for one project where you owned design, implementation, deploy, and monitoring. Surface it explicitly: "Designed and shipped..."' },
      { title: 'Open-source or visible work', body: 'A GitHub link with a real repo (50+ stars, or a contribution to a well-known project) gives the recruiter a verification path. Surface it in the header.' },
      { title: 'On-call signal', body: 'Bullets that mention on-call, incident response, or production debugging signal real-world experience that intern-only resumes lack.' },
      { title: 'Coursework alignment', body: 'Distributed Systems, Operating Systems, Algorithms, Databases, Compilers signal alignment with Google\'s technical bar. Surface 4-6 in Education.' },
      { title: 'Bullet cadence', body: 'Verb + system + scale + outcome. "Owned Cloud Run autoscaler config across 8 services, cut cold-start p99 from 1.4s to 320ms" hits all four.' },
    ],
    examplePanel: {
      studentBlurb: 'Berkeley EECS student, Google new-grad SWE JD',
      score: 88,
      scoreLabel: 'strong',
      previousScore: 59,
      rewriteCount: 3,
      recommendations: [
        { section: 'EXPERIENCE', chip: 'Named system + scope', severity: 'high',
          original: 'Worked on backend services for a fintech startup.',
          suggested: 'Owned 3 of 8 microservices in the payments stack (Go + Postgres + Pub/Sub), cut p99 checkout latency from 410ms to 145ms via connection-pool tuning and idempotent retry logic, recovered $2.1M of previously failed transactions per quarter.',
          why: 'Google recruiters look for the named system, the language, the quantified scope, and the outcome. The original surfaces none; the rewrite hits all four.' },
        { section: 'PROJECTS', chip: 'End-to-end ownership', severity: 'high',
          original: 'Built a distributed cache as a class project.',
          suggested: 'Designed and shipped a consistent-hashing distributed key-value cache (Rust, gRPC) handling 12K QPS with p99 sub-2ms across 5 nodes; wrote the gossip-protocol layer, the failover testing harness, and the deploy automation on GKE. Open-source: github.com/[name]/cache (340 stars).',
          why: 'Project that names the design, the scale, the deploy target, and links to verifiable code is the single strongest SWE resume signal Google looks for.' },
        { section: 'EDUCATION', chip: 'Coursework alignment', severity: 'medium',
          original: 'UC Berkeley, EECS major',
          suggested: 'UC Berkeley \'27, B.S. EECS · GPA 3.92 · Expected May 2027 · Relevant coursework: CS162 (Operating Systems), CS186 (Databases), CS161 (Computer Security), CS170 (Algorithms), CS189 (Machine Learning) · Course staff: CS61B Fall 2025',
          why: 'Google recruiters scan for the canonical systems courses by number (162, 186, 170). Adding course-staff role signals depth beyond just taking the class.' },
      ],
    },
    faq: [
      { q: 'Does Google read cover letters for SWE?', a: 'No. Google explicitly says cover letters are not required for SWE applications and the recruiters do not read them. Spend the time on the resume and on building one visible project.' },
      { q: 'What GPA does Google want?', a: 'Google does not publish a hard floor. Across the 2025 cycle the median accepted-resume GPA was 3.85 at top CS schools, with some accepted resumes at 3.5+ when paired with a strong open-source project or competitive programming record.' },
      { q: 'Should I list my LeetCode rank?', a: 'List your competitive programming record if it is notable (e.g. Codeforces Specialist+, Google Code Jam round, ACM ICPC regional). Generic "solved 500 LeetCode" reads as filler; named competitive achievements signal ability.' },
      { q: 'What ATS does Google use?', a: 'Google uses an internal ATS, not Workday. The format rules are looser than Workday (PDFs parse well, two-column has been observed to work) but the resume content bar is significantly higher.' },
      { q: 'How do I get an internal referral?', a: 'A Google employee referral moves your application to a recruiter-read tier within 7 days. Use Offerloop\'s Find feature to identify Google engineers from your university and send a short cold email asking for a referral coffee chat.' },
      { q: 'Do internships matter more than the resume?', a: 'A previous Google or top-tier (Meta, Stripe, Anthropic, OpenAI, etc.) internship is the single strongest signal. After that, projects with verifiable impact, then coursework. A great resume cannot substitute for zero internships, but it can substitute for non-top-tier ones.' },
      { q: 'How does this differ from a Meta SWE resume?', a: 'Similar bar. Meta weights distributed systems and infra experience slightly higher; Google weights breadth-and-depth across systems courses slightly higher. Run both pages if applying to both.' },
      { q: 'Do you keep my resume?', a: 'We keep the parsed text long enough to send you the report. The PDF is processed in memory and not retained.' },
    ],
    updatedAt: '2026-05-26',
    published: true,
  },

  // ──────────────────────────────────────────────────────────────────
  // 5. Stripe SWE
  // ──────────────────────────────────────────────────────────────────
  {
    slug: 'stripe-swe',
    firmSlug: 'stripe',
    roleSlug: 'swe',
    primaryKeyword: 'stripe software engineer resume',
    metaDescription: 'Free resume review for Stripe Software Engineer applications. Score your resume against the JD, get line-by-line edits with the writing-quality and end-to-end-ownership signal Stripe weights most.',
    quickAnswer: 'Stripe runs SWE applications through Greenhouse with one of the most writing-quality-weighted recruiter screens in tech. A passing Stripe SWE resume hits 80+ on the parser, but the differentiator is bullet writing quality: tight, specific, no jargon. Stripe weights end-to-end project ownership and infrastructure depth higher than algorithm-puzzle skill. The widget below scores yours against the actual Stripe JD in 30 seconds.',
    statStrip: [
      { value: 'Greenhouse', label: 'Stripe\'s ATS, friendlier to two-column than Workday but still single-column-preferred' },
      { value: 'Writing', label: 'the differentiator Stripe weights most in the recruiter screen' },
      { value: '30 sec', label: 'what the widget above takes to score your resume against the JD' },
    ],
    uniqueDataBlock: [
      { title: 'Writing quality is the screen', body: 'Stripe is famous for weighting clear writing. Resume bullets that read like good engineering tech specs (concrete, scoped, no buzzwords) outperform bullets that read like marketing copy.' },
      { title: 'Infrastructure depth', body: 'Stripe weights infra and platform work higher than feature-shipping. Bullets about latency, durability, idempotency, distributed-transaction safety score higher than UI ones.' },
      { title: 'Payments domain bonus', body: 'Any payments, billing, fraud, ledger, or financial-systems experience moves a resume to the top. Surface it explicitly even if it was a side project.' },
      { title: 'Idempotency and reliability language', body: 'Stripe SWE JDs name "idempotent", "exactly-once", "graceful degradation", "blast radius" as keywords. Adding these to relevant bullets signals payments-systems thinking.' },
      { title: 'Open-source contribution weight', body: 'Stripe weights public contributions to popular OSS (Ruby, Go, Sorbet, their own repos) heavily. A merged PR to a well-known library is a strong signal.' },
      { title: 'Bullet length discipline', body: 'Stripe-style writing prefers 18-22 word bullets that end on a measurable outcome. Long flowery bullets read as low signal.' },
      { title: 'Greenhouse-safe layout', body: 'Greenhouse is more lenient than Workday. PDFs parse cleanly. Two-column layouts work but single-column is still safer.' },
    ],
    examplePanel: {
      studentBlurb: 'CMU CS student, Stripe SWE JD',
      score: 89,
      scoreLabel: 'Stripe-ready',
      previousScore: 64,
      rewriteCount: 3,
      recommendations: [
        { section: 'EXPERIENCE', chip: 'Stripe-style writing', severity: 'high',
          original: 'Built a payment processing feature that handled lots of transactions with low latency and was very reliable.',
          suggested: 'Shipped an idempotent retry layer on the checkout payment path (Go, Postgres, Redis-backed dedupe keys), absorbed 4K QPS peak with zero double-charges over the 6-month measurement window.',
          why: 'Stripe screens for writing quality. The original is vague and marketing-toned; the rewrite is concrete, scoped, and names the mechanism (idempotency, dedupe keys).' },
        { section: 'PROJECTS', chip: 'Payments domain signal', severity: 'high',
          original: 'Made a ledger system for fun.',
          suggested: 'Built a double-entry ledger service from scratch (Python + Postgres + an event-log table for audit), supports multi-currency, posts and reverses transactions atomically, has a property-based test suite (Hypothesis) verifying invariants like "sum of debits equals sum of credits per ledger per period."',
          why: 'Anything payments-domain is a top signal for Stripe. Surfacing the design choices (double-entry, event log, property-based testing) shows the thinking Stripe wants in production code.' },
        { section: 'EDUCATION', chip: 'Coursework depth', severity: 'medium',
          original: 'CMU, Computer Science',
          suggested: 'CMU \'27, B.S. Computer Science · GPA 3.87 · Expected May 2027 · Relevant coursework: 15-440 (Distributed Systems), 15-445 (Database Systems), 15-441 (Networking), 15-451 (Algorithms) · TA: 15-150 (Functional Programming) Fall 2025',
          why: 'Stripe recruiters scan for the canonical systems courses by number. Adding a TA role signals depth beyond just taking the class.' },
      ],
    },
    faq: [
      { q: 'Does Stripe read cover letters?', a: 'Stripe explicitly weights the application form responses higher than the cover letter for SWE. If a cover letter slot exists in the application, write 200-280 words that read like a thoughtful engineering email; do not write marketing copy.' },
      { q: 'What ATS does Stripe use?', a: 'Stripe uses Greenhouse for most engineering hiring. Greenhouse is friendlier than Workday on format but the recruiter screen is famous for weighting writing quality.' },
      { q: 'How important is the take-home for Stripe SWE?', a: 'Very. Stripe is one of the few tech companies that uses take-home assignments for new-grad and intern roles. Your resume gets you to the take-home; the take-home gets you to onsites.' },
      { q: 'Do I need payments experience?', a: 'No, but any payments, billing, ledger, or financial-systems experience moves you to the top of the pile. Surface it even if it was a side project.' },
      { q: 'How does this differ from a Google SWE resume?', a: 'Google weights breadth-and-depth across systems courses and named-system experience. Stripe weights writing quality and infra depth. The resume reads differently for the two even with the same underlying experience.' },
      { q: 'What is the Stripe Press signal worth?', a: 'Mentioning that you have read a Stripe Press book (High Growth Handbook, The Dream Machine, Working in Public) in a cover letter or application form response signals genuine interest. Do not overdo it.' },
      { q: 'How do I get an internal referral?', a: 'Stripe employees can refer at any point in the funnel. Use Offerloop\'s Find feature to identify Stripe engineers from your university and send a cold email asking for 15 minutes plus a referral.' },
      { q: 'Do you keep my resume?', a: 'We keep the parsed text long enough to send you the report. The PDF is processed in memory and not retained.' },
    ],
    updatedAt: '2026-05-26',
    published: true,
  },

  // ──────────────────────────────────────────────────────────────────
  // ROW STUBS for Waves 1-4 (95 remaining):
  // Each new row follows the same shape as above. The path to 100:
  // - Every Tier-1 firm x its 4 industry-matched roles (per SEO_KEYWORD_UNIVERSE.md)
  // - Per-cell content needs to be genuinely firm/role-specific (no copy-paste
  //   across rows; doorway page risk per SEO_STRATEGY.md)
  // - Each row takes ~30 minutes of focused authoring with the firm's recent
  //   recruiting data, ATS quirks, and 2-3 representative example rewrites
  // - Quarterly refresh per ranking-playbook.md: rewrite Quick-Answer + bump
  //   one stat + refresh one FAQ + bump updatedAt
  // ──────────────────────────────────────────────────────────────────
];

export const RESUME_REVIEW_BY_SLUG: Record<string, ResumeReviewRow> = Object.fromEntries(
  RESUME_REVIEW_ROWS.map((r) => [r.slug, r])
);

export const getResumeReviewRow = (slug: string): ResumeReviewRow | undefined =>
  RESUME_REVIEW_BY_SLUG[slug];

export const getPublishedResumeReviewRows = (): ResumeReviewRow[] =>
  RESUME_REVIEW_ROWS.filter((r) => r.published);
