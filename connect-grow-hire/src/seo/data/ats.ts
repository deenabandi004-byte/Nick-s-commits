/*
 * Cluster 4: ATS Explainer (target: 100 pages).
 * Three variants per types.ts: generic, by-firm, by-role.
 *
 * /seo-preview/ats/<slug> via ATSGuideTemplate.
 *
 * Wave 0: 5 entries below (1 generic + 2 firm-specific + 2 role-specific).
 * Waves 1-4 fill the remaining ~95 from the universe in SEO_KEYWORD_UNIVERSE.md.
 */
import type { ATSRow } from './types';
import generatedATS from './generated/ats.generated.json';

export const ATS_ROWS: ATSRow[] = [
  ...(generatedATS as unknown as ATSRow[]),
  // ──────────────────────────────────────────────────────────────────
  // 1. Generic "what is an ATS" (hand-built reference)
  // ──────────────────────────────────────────────────────────────────
  {
    slug: 'what-is-an-ats',
    variant: 'generic',
    primaryKeyword: 'what is an applicant tracking system',
    metaDescription: 'How applicant tracking systems parse, score, and rank resumes in 2026. The format, keyword, and structure rules to get past Workday, Greenhouse, and Lever. Free instant resume review tailored to any JD.',
    quickAnswer: 'An applicant tracking system (ATS) is software that 90% of large employers use to parse, score, and rank resumes before a recruiter sees them. To get past one, submit a single-column resume in DOCX or text-selectable PDF, mirror 60-80% of the job description\'s exact keywords, and aim for a 75+ ATS score. The widget below runs that scoring on your resume for free in 30 seconds.',
    statStrip: [
      { value: '90%', label: 'of large employers use automated systems to filter or rank applications (World Economic Forum, 2025)' },
      { value: '75%', label: 'of resumes are filtered by ATS before a human reads them (industry consensus)' },
      { value: '10.6x', label: 'increase in interview likelihood when your resume includes the exact job title from the posting (Jobscan, 2024)' },
    ],
    uniqueDataBlock: [
      { title: 'Single-column layout', body: 'Two-column resumes fail Workday parsing on ~41% of submissions. Left-column sidebars get read after the right column, scrambling chronology.' },
      { title: 'No tables or graphics', body: 'Tables scramble content order during parsing. Skills inside a table cell often never reach the indexed record.' },
      { title: 'Contact info in body, not headers', body: 'Many parsers skip headers and footers entirely. Contact info placed there becomes invisible.' },
      { title: 'Standard fonts only', body: 'Arial, Calibri, Times New Roman. Decorative fonts trip the parser.' },
      { title: 'Standard section headers', body: 'Work Experience, Education, Skills. Custom labels like "Career Journey" fail field mapping.' },
      { title: 'MM/YYYY or Month YYYY dates', body: 'Mixed date formats reduce timeline confidence. Pick one and use it consistently.' },
      { title: 'DOCX or text-selectable PDF', body: 'Image-based PDFs (Canva exports) cannot be read by any ATS. Rebuild in Google Docs, Word, or a parseable template.' },
      { title: 'File size under 2MB', body: 'Most ATS parsers reject files over 2MB or process them slowly enough that timing causes drops.' },
    ],
    examplePanel: {
      studentBlurb: 'Software engineer applicant, mid-size firm JD',
      score: 89,
      scoreLabel: 'strong',
      previousScore: 58,
      rewriteCount: 3,
      recommendations: [
        { section: 'EXPERIENCE', chip: 'Quantify impact', severity: 'high',
          original: 'Worked on backend services for the payments team.',
          suggested: 'Owned 3 of 8 microservices in the payments stack (Go + Postgres), cut p99 checkout latency from 410ms to 145ms, and shipped idempotent retry logic that recovered $2.1M in previously failed transactions per quarter.',
          why: 'The JD calls for backend services, latency wins, and ownership scope. The original surfaces none.' },
        { section: 'FORMAT', chip: 'Workday parser fix', severity: 'high',
          original: 'Two-column resume with sidebar for skills',
          suggested: 'Single-column layout, skills moved inline under each Experience role with a Skills summary block at the bottom.',
          why: 'Workday and most ATS parsers read top-to-bottom. Two-column layouts cause parse failure on ~41% of resumes.' },
        { section: 'KEYWORDS', chip: 'JD match', severity: 'medium',
          original: 'Familiar with cloud infrastructure and CI/CD pipelines.',
          suggested: 'Built and operated AWS infrastructure (ECS, RDS, Lambda) with GitHub Actions and Terraform-managed deploys; ran on-call rotation for 6 services with 99.95% uptime over 18 months.',
          why: 'The JD names AWS, GitHub Actions, and on-call by keyword. Generic "cloud infrastructure" fails the match.' },
      ],
    },
    faq: [
      { q: 'What is an applicant tracking system in simple terms?', a: 'Software that 90% of large employers use to parse, score, and rank resumes before a recruiter sees them. The two most common are Workday (banks, large enterprises) and Greenhouse (growth-stage tech).' },
      { q: 'How does an ATS read my resume?', a: 'Top-to-bottom in document order. The parser extracts text into named fields: contact, employer, title, dates, education, skills. Layout failures (two-column, tables, headers) scramble or drop fields.' },
      { q: 'What score do I need to pass?', a: '75+ for first-cut survival at most large firms. 80+ for competitive roles.' },
      { q: 'How do I find the right keywords?', a: 'Paste the JD into the widget above. It extracts the keywords and tells you which ones are missing from your resume. The exact job title is the highest-leverage single keyword.' },
      { q: 'Does Workday actually reject resumes automatically?', a: 'Rarely. It acts as a search engine for recruiters who filter the database. The way to "beat" Workday is to match the filter, not avoid rejection.' },
      { q: 'Which ATS does [my target firm] use?', a: 'Goldman, JPM, MS, BofA = Workday. McKinsey/Bain/BCG = internal systems often built on Workday. Google/Meta/Amazon = internal. Startups under ~500 people = Greenhouse, Lever, or Ashby.' },
      { q: 'Is the widget really free?', a: 'No catch. Upload, paste, get the score and rewrites without an account.' },
      { q: 'How often should I rerun this?', a: 'Every time, for every firm. The keyword match is JD-specific.' },
    ],
    updatedAt: '2026-05-26',
    published: true,
  },

  // ──────────────────────────────────────────────────────────────────
  // 2. Workday at Goldman Sachs
  // ──────────────────────────────────────────────────────────────────
  {
    slug: 'goldman-sachs',
    variant: 'by-firm',
    firmSlug: 'goldman-sachs',
    primaryKeyword: 'goldman sachs workday ats',
    metaDescription: 'How to beat the Workday ATS at Goldman Sachs. The format, keyword, and structure rules that get past the first cut, plus a free resume review tailored to any Goldman JD.',
    quickAnswer: 'Goldman Sachs uses Workday for analyst and associate applications across regions. Workday parses your resume top-to-bottom and scores it for keyword match against the JD before a recruiter ever opens the file. To get past it: single-column, named modeling vocabulary (LBO, DCF, accretion/dilution), quantified outcomes on every bullet, GPA visible, MM/YYYY dates, file under 2MB. The widget below runs that scoring on your resume against the actual Goldman JD in 30 seconds.',
    statStrip: [
      { value: 'Workday', label: 'the ATS Goldman uses for analyst applications across IB, S&T, AM, and Engineering' },
      { value: '300+', label: 'applicants on average per Goldman Sachs analyst opening' },
      { value: '~41%', label: 'of two-column resumes fail Workday parsing (ProfileOps 2026 study)' },
    ],
    uniqueDataBlock: [
      { title: 'Goldman group preference', body: 'Goldman applications let you preference groups. Your resume bullets should signal which group you want before the recruiter reads the cover letter.' },
      { title: 'Named modeling vocabulary', body: 'LBO, DCF, accretion/dilution, three-statement, trading comps, precedent transactions. Generic "financial modeling" loses to the named model.' },
      { title: 'Deal scale + outcome', body: 'Every IB bullet should end with deal size ($), multiple (Nx EV/EBITDA), or sponsor IRR (%). Workday flags verb-only bullets as content-light.' },
      { title: 'Section ordering: Education first', body: 'Analyst applications screen against undergrad cohort. School, GPA, expected grad in the top quarter of page 1.' },
      { title: 'GPA visible', body: 'Goldman recruiters expect GPA visible. Leaving it off reads as hiding it, weighted more harshly than a 3.4 would be.' },
      { title: 'Workday formatting absolutes', body: 'Single column. No tables. No graphics. No text in headers or footers. Contact info in the document body. DOCX or text-selectable PDF.' },
      { title: 'Diversity programs surface', body: 'Goldman tracks named-program participation (LIONS, Pine Street, Possibilities). Surface in Education if applicable.' },
    ],
    examplePanel: {
      studentBlurb: 'USC Marshall student, Goldman IB analyst JD',
      score: 92,
      scoreLabel: 'Goldman-ready',
      previousScore: 58,
      rewriteCount: 3,
      recommendations: [
        { section: 'EXPERIENCE', chip: 'Deal scale + named model', severity: 'high',
          original: 'Helped with financial analysis for a leveraged buyout in the consumer sector.',
          suggested: 'Built a 3-statement LBO model for a $1.2B sponsor-led carve-out of a $400M EBITDA consumer assets group, sized $750M of debt across TLB and secured notes, modeled 22% sponsor IRR at a 9.0x exit multiple.',
          why: 'Goldman M&A JDs grade three things on every bullet: deal size, financial mechanic, outcome. The original surfaces none.' },
        { section: 'EXPERIENCE', chip: 'Workday keyword match', severity: 'high',
          original: 'Built spreadsheets to model financial scenarios.',
          suggested: 'Built a merger model and accretion/dilution analysis for a $2.4B all-stock combination, including synergy waterfall, deal financing matrix (cash/stock/debt), and revenue synergy sensitivity. Presented in IC materials to MD-level reviewers.',
          why: 'Workday matches the JD verbatim. Goldman analyst postings call out merger model, accretion/dilution, IC materials by name.' },
        { section: 'FORMAT', chip: 'Workday parser fix', severity: 'medium',
          original: 'Two-column resume with sidebar for skills and activities',
          suggested: 'Single-column layout with skills moved inline. Activities consolidated into a single section at the bottom.',
          why: '~41% of two-column resumes fail Workday parsing. The sidebar gets read after the right column.' },
      ],
    },
    faq: [
      { q: 'What ATS does Goldman Sachs use?', a: 'Workday for most regions and most analyst and associate roles. The same Workday instance is used across IB, S&T, Asset Management, and Engineering, though scoring weights differ.' },
      { q: 'Does Goldman use AI to score resumes?', a: 'Workday\'s scoring is rule-based keyword-and-format matching, not generative AI. The 2026 Workday release added some semantic-similarity scoring on top of keyword matching but the keyword bar still dominates.' },
      { q: 'How strict is Goldman\'s Workday setup?', a: 'Among the strictest in industry. Single column, standard fonts, no tables, no headers/footers, MM/YYYY dates, <2MB file. The widget enforces all of these.' },
      { q: 'Do internal referrals bypass Workday?', a: 'No. Even referred applications go through Workday. Referrals move you to a recruiter-read tier within ~7 days but you still need to pass the keyword and format filter.' },
      { q: 'Does Goldman read cover letters?', a: 'For full-time analyst yes (skim-read). For summer most groups have moved away from cover letters. The widget covers both formats.' },
      { q: 'What is the 2026 Goldman analyst class size?', a: '~2,900 summer analyst seats globally against ~250,000 applications (1.16% acceptance rate). Full-time class is smaller and skews from converted summer interns.' },
      { q: 'Is the widget really free?', a: 'No catch. Upload your resume, paste the Goldman JD, get the score and rewrites without an account.' },
      { q: 'How does this differ from JPM or Morgan Stanley?', a: 'All three use Workday with similar strictness. Group names and recent deals differ; the widget tunes the example panel by firm.' },
    ],
    updatedAt: '2026-05-26',
    published: true,
  },

  // ──────────────────────────────────────────────────────────────────
  // 3. Lever ATS at Anthropic
  // ──────────────────────────────────────────────────────────────────
  {
    slug: 'anthropic',
    variant: 'by-firm',
    firmSlug: 'anthropic',
    primaryKeyword: 'anthropic ats lever',
    metaDescription: 'How Anthropic uses Lever to screen resumes. Format and keyword rules to get past the first cut, plus a free resume review tailored to any Anthropic JD.',
    quickAnswer: 'Anthropic uses Lever as its ATS for engineering, research, and operations hiring. Lever is more lenient than Workday on format (two-column sometimes parses cleanly, decorative fonts often work) but the recruiter screen is famous for weighting writing quality and concrete-impact signal. To get past it: tight single-column resume, named ML/LLM frameworks if relevant, end-to-end project ownership stories, clear evidence of safety-aligned thinking for research roles. The widget below scores yours against the actual Anthropic JD in 30 seconds.',
    statStrip: [
      { value: 'Lever', label: 'the ATS Anthropic uses for engineering, research, and operations hiring' },
      { value: 'Writing', label: 'the differentiator the Anthropic recruiter screen weights most heavily' },
      { value: '30 sec', label: 'what the widget above takes to score your resume against the JD' },
    ],
    uniqueDataBlock: [
      { title: 'Writing quality is the screen', body: 'Anthropic recruiters explicitly weight resume bullet clarity. Vague marketing-toned bullets lose to concrete scoped ones.' },
      { title: 'ML / LLM vocabulary signal', body: 'If applying to research or ML engineering: named frameworks (PyTorch, JAX, vLLM, transformers), named training paradigms (RLHF, constitutional AI, sparse autoencoders), and named eval benchmarks.' },
      { title: 'Safety-aligned thinking', body: 'For research roles, Anthropic looks for evidence you think about safety as a first-class concern: red-teaming, interpretability, robustness, evals. Surface any of these explicitly.' },
      { title: 'End-to-end ownership signal', body: 'Anthropic engineering JDs weight projects where you owned design, implementation, and operation. "Shipped X" beats "contributed to X."' },
      { title: 'Lever-safe formatting', body: 'Lever parses two-column reliably and tolerates decorative fonts. Single-column is still safer if you also apply to firms on Workday.' },
      { title: 'Open-source weight', body: 'Anthropic recruiters notice public AI/ML contributions (a paper, an evals harness, a vLLM optimization, a popular HuggingFace model). Surface in the header.' },
      { title: 'No "passionate about AI" language', body: 'Anthropic recruiters skim past "I am passionate about AI safety" / "drawn to mission-driven companies." Replace with one specific thing you have built or read.' },
    ],
    examplePanel: {
      studentBlurb: 'CMU CS student, Anthropic research engineer JD',
      score: 90,
      scoreLabel: 'Anthropic-ready',
      previousScore: 63,
      rewriteCount: 3,
      recommendations: [
        { section: 'EXPERIENCE', chip: 'Concrete-impact rewrite', severity: 'high',
          original: 'Worked on a machine learning project at a startup.',
          suggested: 'Built an evals harness for a 7B-param customer-support model (Python + transformers + vLLM serving), defined 12 task-specific eval suites including 3 red-team prompts, surfaced a 14% factual-accuracy gap between top-p 0.9 and 0.5 sampling that informed our default config.',
          why: 'Anthropic weights writing quality and concrete impact. Named frameworks (transformers, vLLM), named techniques (top-p sampling), and a measurable outcome lift this from generic to senior.' },
        { section: 'PROJECTS', chip: 'Safety-aligned signal', severity: 'high',
          original: 'Built a chatbot for fun.',
          suggested: 'Built and red-teamed a Llama-3.2-8B fine-tune for a domain-specific tutoring task; wrote a 240-prompt adversarial test set (jailbreaks, prompt injections, off-topic redirects), measured 89% safe-response rate before and 96% after applying constitutional-AI-style critique loop.',
          why: 'Surfacing the safety mechanic (red-teaming, adversarial prompts, constitutional AI) is what Anthropic looks for. Same project, different framing.' },
        { section: 'EDUCATION', chip: 'Open-source visibility', severity: 'medium',
          original: 'CMU, Computer Science · GPA 3.9',
          suggested: 'CMU \'27, B.S. Computer Science · GPA 3.92 · Expected May 2027 · Coursework: 15-440 Distributed Systems, 11-785 Intro to Deep Learning, 10-708 Probabilistic Graphical Models, 15-840 Foundations of LLMs · Open source: vllm-project/vllm (8 merged PRs), github.com/[name]/evals-harness (1.2K stars)',
          why: 'Anthropic recruiters scan the Education block for the canonical LLM/systems courses and for verifiable open-source contributions. Naming both lifts first-pass relevance significantly.' },
      ],
    },
    faq: [
      { q: 'What ATS does Anthropic use?', a: 'Lever for engineering, research, and operations hiring. The same Lever instance is used across all teams.' },
      { q: 'Is Lever as strict as Workday?', a: 'No. Lever parses two-column reliably and tolerates decorative fonts. The recruiter screen is the binding constraint at Anthropic, not the parser.' },
      { q: 'What does Anthropic look for in a research engineer resume?', a: 'Named ML/LLM frameworks (PyTorch, JAX, transformers, vLLM), named training paradigms, named eval methodologies, and evidence of safety-aligned thinking (red-teaming, interpretability, robustness).' },
      { q: 'Do I need a published paper to get a research role?', a: 'Not strictly. Strong open-source ML/eval contributions (a popular HuggingFace model, a well-known evals harness, vLLM optimizations) substitute for papers in many recent hires.' },
      { q: 'How long does Anthropic\'s interview process take?', a: '~4 to 8 weeks from application to offer. The take-home (technical screen for engineering, paper-discussion for research) is the highest-leverage round.' },
      { q: 'Does Anthropic do referrals?', a: 'Yes, and they matter. A referral moves you to a recruiter-read tier within ~5 days. Use Offerloop\'s Find feature to identify Anthropic employees from your university.' },
      { q: 'Is the widget really free?', a: 'No catch. Upload your resume, paste the Anthropic JD, get the score and rewrites without an account.' },
      { q: 'How does this differ from OpenAI?', a: 'Similar bar on technical depth. Anthropic weights safety-aligned thinking more heavily; OpenAI weights distribution and product surface. Tune the resume accordingly.' },
    ],
    updatedAt: '2026-05-26',
    published: true,
  },

  // ──────────────────────────────────────────────────────────────────
  // 4. ATS keywords for software engineer resumes (by-role)
  // ──────────────────────────────────────────────────────────────────
  {
    slug: 'keywords-swe',
    variant: 'by-role',
    roleSlug: 'swe',
    primaryKeyword: 'ats keywords for software engineer resume',
    metaDescription: 'The exact ATS keywords for software engineer resumes in 2026, organized by framework, by domain (backend, frontend, ML, infra), and by seniority. Free resume scoring widget tailored to any SWE JD.',
    quickAnswer: 'ATS keywords for software engineer resumes in 2026 fall into 4 buckets: named languages and frameworks (Go, Rust, React, gRPC, Terraform), named systems (Kafka, Postgres, Spanner, Pub/Sub), named practices (on-call, CI/CD, observability, idempotency), and named outcomes (QPS, p99 latency, uptime %, $-saved). A passing SWE resume includes 15-25 keywords from these buckets with 60-80% coverage of the JD. The widget below extracts the missing ones from any SWE JD in 30 seconds.',
    statStrip: [
      { value: '15-25', label: 'ATS keywords per SWE resume is the modern target' },
      { value: '60-80%', label: 'coverage of the JD\'s keyword set is the scoring threshold for first-cut survival' },
      { value: '10.6x', label: 'increase in interview likelihood when your resume includes the exact job title from the posting' },
    ],
    uniqueDataBlock: [
      { title: 'Languages: name them, don\'t list them', body: 'Bullets that say "Built X in Go" beat a Skills block that lists 12 languages. ATS weights in-context keywords higher than skill-block keywords.' },
      { title: 'Named framework signal', body: 'React, Next.js, gRPC, FastAPI, Spring Boot, Express, Django, Rails. Generic "web frameworks" fails the keyword match.' },
      { title: 'Named system signal', body: 'Kafka, RabbitMQ, Postgres, MySQL, Spanner, DynamoDB, Redis, ElasticSearch, S3. Generic "databases" loses to the named one.' },
      { title: 'Named practice signal', body: 'On-call, CI/CD (with the specific tool: GitHub Actions, CircleCI, Jenkins), observability (with the tool: Datadog, Prometheus, Grafana), idempotency, blue-green deploys.' },
      { title: 'Quant outcomes per bullet', body: 'Every bullet should end with QPS, p99 latency, uptime %, MTTR, $-saved, or users served. ATS flags verb-only bullets ("Helped with...") as content-light.' },
      { title: 'Cloud platform specificity', body: 'AWS, GCP, Azure with the specific services (ECS, Lambda, GKE, Cloud Run, Aurora). Generic "cloud experience" fails the match.' },
      { title: 'Architecture vocabulary', body: 'Microservices, event-driven, distributed, async, REST, GraphQL, gRPC, WebSocket. Surface the ones that match the JD.' },
      { title: 'Concurrency / safety vocabulary', body: 'Thread-safe, lock-free, ACID, idempotent, exactly-once, eventually-consistent. Modern SWE JDs name these explicitly.' },
    ],
    examplePanel: {
      studentBlurb: 'Berkeley EECS student, mid-stage startup SWE JD',
      score: 87,
      scoreLabel: 'strong',
      previousScore: 56,
      rewriteCount: 3,
      recommendations: [
        { section: 'EXPERIENCE', chip: 'Named framework + scope', severity: 'high',
          original: 'Built backend APIs for a startup.',
          suggested: 'Built a gRPC-backed user-events API in Go (Postgres + Redis stream-based dedupe), handled 8K QPS peak with p99 latency under 90ms, scaled horizontally on GKE with autoscaler tuned to CPU + custom event-lag metric.',
          why: 'Hits gRPC, Go, Postgres, Redis, QPS, p99, GKE keywords from the JD in one bullet. The original surfaces none.' },
        { section: 'PROJECTS', chip: 'Named system + outcome', severity: 'high',
          original: 'Built a chat app as a side project.',
          suggested: 'Built a real-time chat app (Next.js + WebSocket + Postgres) supporting 1.2K concurrent users with p99 message-delivery latency of 110ms; wrote integration tests covering reconnection, offline-message-queueing, and partial-network failures.',
          why: 'Adds Next.js, WebSocket, concurrent-user count, latency, and resilience testing. ATS weights all of these.' },
        { section: 'EDUCATION', chip: 'Course depth signal', severity: 'medium',
          original: 'UC Berkeley, EECS',
          suggested: 'UC Berkeley \'27, B.S. EECS · GPA 3.89 · Expected May 2027 · Relevant coursework: CS162 (Operating Systems), CS186 (Databases), CS161 (Security), CS170 (Algorithms), CS162 TA Fall 2025',
          why: 'ATS scans Education for canonical systems courses by number. Adding a TA role signals depth beyond just taking the class.' },
      ],
    },
    faq: [
      { q: 'How many keywords should a SWE resume have?', a: '15 to 25 relevant keywords with 60-80% coverage of the JD\'s keyword set. More than 25 reads as keyword stuffing; modern ATS 2.0 platforms flag it.' },
      { q: 'Should I have a Skills block?', a: 'Yes, but treat it as backup. ATS weights in-context keywords (mentioned inside Experience or Projects) higher than Skills-block-only keywords. Lead with in-context.' },
      { q: 'Do I need to tailor for every job?', a: 'Yes. The JD keyword match is JD-specific. A bullet that hits the Stripe keyword set might miss the Google one because they call out different tools.' },
      { q: 'What is the most overrated SWE keyword?', a: '"Agile" and "Scrum." Every JD lists them and every resume includes them, so they no longer differentiate. Replace with the actual tool you used (Jira, Linear, Shortcut).' },
      { q: 'What is the most underrated SWE keyword?', a: '"On-call." Bullets that mention on-call rotation, incident response, or production debugging signal real-world experience that intern-only resumes lack.' },
      { q: 'How does this differ by seniority?', a: 'New grad: weight projects + coursework heavier. Mid (L4-L5): weight named systems + scope. Senior (L6+): weight architecture decisions, cross-team ownership, mentorship.' },
      { q: 'Is the widget really free?', a: 'No catch. Upload your resume, paste the SWE JD, get the score and missing keywords without an account.' },
      { q: 'Does this work for ML engineer or data scientist roles?', a: 'Yes, but those have separate dedicated keyword pages with the named ML frameworks and named eval methodologies they look for.' },
    ],
    updatedAt: '2026-05-26',
    published: true,
  },

  // ──────────────────────────────────────────────────────────────────
  // 5. ATS keywords for investment banking analyst (by-role)
  // ──────────────────────────────────────────────────────────────────
  {
    slug: 'keywords-ib-analyst',
    variant: 'by-role',
    roleSlug: 'ib-analyst',
    primaryKeyword: 'ats keywords for investment banking analyst resume',
    metaDescription: 'The exact ATS keywords for investment banking analyst resumes in 2026, organized by model type, deal type, and group. Free resume scoring widget tailored to any IB analyst JD.',
    quickAnswer: 'ATS keywords for IB analyst resumes in 2026 fall into 4 buckets: named valuation methodologies (DCF, LBO, accretion/dilution, trading comps, precedent transactions), named deal types (M&A, IPO, debt issuance, restructuring, leveraged finance), named sector coverage (TMT, healthcare, FIG, consumer, industrials), and named transaction outcomes (deal size $, multiple, IRR %). A passing IB analyst resume includes 15-22 keywords from these buckets. The widget below extracts the missing ones from any IB analyst JD in 30 seconds.',
    statStrip: [
      { value: '15-22', label: 'ATS keywords per IB analyst resume is the modern target' },
      { value: '300+', label: 'applicants on average per analyst seat at the top BB and elite boutiques' },
      { value: '~6 sec', label: 'average first-scan time a banking recruiter spends per resume after the ATS pass' },
    ],
    uniqueDataBlock: [
      { title: 'Valuation methodology vocabulary', body: 'DCF, LBO, accretion/dilution, three-statement, trading comps, precedent transactions, sum-of-parts. Generic "financial modeling" loses to the named methodology.' },
      { title: 'Deal type vocabulary', body: 'M&A, sell-side advisory, buyside advisory, IPO, follow-on offering, debt issuance (TLA, TLB, senior notes), restructuring, leveraged finance.' },
      { title: 'Sector coverage signal', body: 'TMT, healthcare, FIG, consumer, industrials, real estate, energy, power & utilities. Bullets that name the sector beat generic ones.' },
      { title: 'Quant outcome per bullet', body: 'Deal size $, multiple (e.g. 11.5x EV/EBITDA), IRR %, basis points spread, leverage multiple. ATS flags verb-only bullets.' },
      { title: 'Bullet cadence', body: 'Action verb + transaction + scale + outcome. ~22-30 words per bullet, never more than two lines.' },
      { title: 'Bank- or process-specific language', body: 'Sell-side process, second-round bids, IC materials, management presentation, working group list, due diligence room. Naming these signals you have been on a live deal.' },
      { title: 'Senior banker exposure', body: 'MD, partner, senior advisor mentions in bullets signal you have been in the room. "Presented to MD-level reviewers" beats "supported the team."' },
      { title: 'Tool vocabulary', body: 'CapIQ, Bloomberg, FactSet, Dealogic, PitchBook. Showing tool fluency on the resume helps the ATS match.' },
    ],
    examplePanel: {
      studentBlurb: 'NYU Stern student, JPMorgan IB summer analyst JD',
      score: 91,
      scoreLabel: 'IB-ready',
      previousScore: 60,
      rewriteCount: 3,
      recommendations: [
        { section: 'EXPERIENCE', chip: 'Named methodology + scale', severity: 'high',
          original: 'Built models in Excel to evaluate deal structures.',
          suggested: 'Built a precedent transactions analysis across 12 comparable consumer M&A transactions ($500M to $3B EV), normalized for synergies and minority-interest adjustments, output a valuation range of 11.5-13.0x EV/EBITDA used in the MD pitch deck.',
          why: 'Adds precedent transactions (named methodology), sector (consumer M&A), scale ($500M-$3B EV), output multiple (11.5-13.0x), and senior-banker exposure (MD pitch deck).' },
        { section: 'EXPERIENCE', chip: 'Process language + outcome', severity: 'high',
          original: 'Supported the team on a deal for a consumer client.',
          suggested: 'Supported sell-side advisory on a $1.8B carve-out of a household-products division (consumer coverage), built the management presentation and the buyer process tracker across 14 strategic and 9 sponsor bidders, second-round bids received within 6 weeks.',
          why: 'Adds sell-side advisory (deal type), $1.8B (scale), household-products (sub-sector), management presentation + buyer process tracker (process language), bidder counts (specificity).' },
        { section: 'EDUCATION', chip: 'IB-ready format', severity: 'medium',
          original: 'NYU Stern, Finance major',
          suggested: 'NYU Stern \'27, B.S. Finance + Data Science · GPA 3.81 · Expected May 2027 · Relevant coursework: Foundations of Finance, Financial Modeling, Corporate Finance, Advanced Accounting · Tools: Excel, CapIQ, Bloomberg, FactSet',
          why: 'Tighter format with named coursework and tool fluency lifts first-pass relevance. Tools line tells the recruiter you can hit the ground running.' },
      ],
    },
    faq: [
      { q: 'How many keywords should an IB analyst resume have?', a: '15 to 22 relevant keywords with 60-80% coverage of the JD\'s keyword set. The bar is tighter than tech because IB JDs have more specific vocabulary.' },
      { q: 'Should I list every model I have built?', a: 'List the named ones (LBO, DCF, accretion/dilution, comps) in bullets where you used them, not in a separate Models block. ATS weights in-context keywords higher.' },
      { q: 'Do I need a Skills section?', a: 'A short one at the bottom listing tools (Excel, CapIQ, Bloomberg, FactSet, PitchBook, S&P Global) is useful. Skip a long skills list.' },
      { q: 'Does this work for full-time vs summer applications?', a: 'Yes, with tuning. Summer analyst resumes weight coursework, projects, and modeling competitions higher. Full-time weights closed-deal experience higher. The widget tunes per JD.' },
      { q: 'What is the most overrated IB keyword?', a: '"Detail-oriented" and "strong work ethic." Every resume includes them. Replace with specific examples of late-night turn cycles or 14-bidder process management.' },
      { q: 'What is the most underrated IB keyword?', a: '"Sell-side advisory" or "buyside advisory." Naming the side you were on signals you understand the deal, not just the model.' },
      { q: 'How does this differ by group (TMT vs Consumer vs FIG)?', a: 'Sector vocabulary differs significantly. TMT JDs name SaaS metrics (ARR, NDR, CAC). FIG JDs name balance-sheet metrics (CET1, NIM, ROTE). Consumer JDs name retail metrics (same-store sales, GMV). Tune per group.' },
      { q: 'Is the widget really free?', a: 'No catch. Upload your resume, paste the IB analyst JD, get the score and missing keywords without an account.' },
    ],
    updatedAt: '2026-05-26',
    published: true,
  },
  // Waves 1-4 add the remaining ~95 rows.
];

export const ATS_BY_SLUG: Record<string, ATSRow> = Object.fromEntries(
  ATS_ROWS.map((r) => [r.slug, r])
);

export const getATSRow = (slug: string): ATSRow | undefined => ATS_BY_SLUG[slug];

export const getPublishedATSRows = (): ATSRow[] =>
  ATS_ROWS.filter((r) => r.published);
