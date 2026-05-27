<!--
Resume principles reference, written directly (Perplexity deep_research repeatedly
timed out). Used by backend/app/services/resume_recommender.py as system-prompt
context for grounding GPT-4o suggestions. Refresh by editing this file directly,
or by re-running backend/scripts/build_resume_principles.py if Perplexity is
accessible.
-->

# Resume principles for early-career consulting, IB, and tech recruiting

This document is a working rubric for evaluating and improving resumes of
undergraduate juniors / seniors and candidates with 0-2 years of professional
experience targeting management consulting (MBB, Big 4), investment banking
(bulge bracket and elite boutique), and tech (FAANG-tier and AI startups).

Use it as a checklist when reading a resume against a specific job description.
Every suggestion should be tied back to one or more principles below.

---

## 1. Structural rules

### Section order

- **Currently enrolled or graduating within 6 months:** `Education` first, then
  `Experience`, then `Skills / Projects / Leadership`.
- **Already graduated (1+ years out):** `Experience` first, then `Education`,
  then `Skills / Projects`. The recruiter wants to see what you did last, not
  where you went to school.
- **Career switchers / non-traditional:** `Summary` (3-line max) at top, then
  whichever section best supports the pivot.

### One-page rule

- **Always one page** for 0-5 years of experience. Two pages signal poor
  prioritization and almost never get the second page read.
- If you can't fit on one page, the bullets are too long, the formatting
  margins are too wide, or there are bullets that don't earn their space.
- Acceptable margins: 0.5"-0.75" all sides. Acceptable fonts: 10-11pt body,
  11-12pt headers. Calibri, Garamond, Times New Roman, Helvetica are all fine.
  Avoid Comic Sans, Papyrus, decorative serifs.

### Reverse chronological order

- Within each section, list most recent first.
- For Education: degree institution, then degree type, then GPA, then dates.
- For Experience: role title, company, location, dates.

### Dates, locations, GPA cutoffs

- Use **Month YYYY - Month YYYY** format consistently. "Present" for current.
- Include city/state for US roles, city/country for international.
- **Include GPA only if 3.5+** (or 3.3+ for tech, where major GPA matters more
  than overall). Below that, omit. Recruiters at MBB and bulge bracket banks
  generally cut at 3.5 cumulative, sometimes 3.7 for highly selective groups.
- For schools with non-standard scales (Oxford, etc.) translate to a US
  equivalent in parentheses.

### ATS-friendly formatting

- **No tables, no columns, no text boxes.** They break parsing.
- **No icons or images** (linkedin/email logos). They are noise to ATS.
- **No headers/footers** for contact info - put it in the document body.
- **No fancy bullets** (►, ★, ✓). Use a standard round or square bullet.
- **No two-column layouts** even though they look slick visually. They reorder
  text unpredictably when parsed.
- **Save as PDF, not Word.** PDFs preserve layout across systems.
- **Use standard section headers** ("Experience", "Education", "Skills",
  "Projects", "Leadership"). Don't get creative ("My Journey", "Adventures").

### Optional sections (include only if they earn their space)

- `Skills`: include if technical roles or if you have hard skills (languages,
  tools, certifications, foreign languages). Skip if your only "skills" are
  Microsoft Office.
- `Projects`: include if shipped, technical, or relevant to target role. Each
  needs real outcomes, not just descriptions.
- `Leadership / Activities`: include if you held a role with meaningful scope.
  "Member" of a club is not leadership.
- `Certifications`: include only if industry-recognized (CFA Level 1, CPA,
  AWS Solutions Architect, Bloomberg Market Concepts). Skip LinkedIn Learning
  certificates.
- `Publications / Patents`: include for research-heavy or technical roles.

---

## 2. Bullet writing

### The pattern that wins: action + how + impact

Every bullet should answer three questions:
1. What did you do? (strong action verb)
2. How did you do it? (method, tool, scope)
3. What was the outcome? (quantified result)

Equivalent frameworks: CAR (Context, Action, Result), STAR (Situation, Task,
Action, Result), XYZ ("Accomplished X by doing Y, measured by Z" - the Google
recruiting team's classic prompt).

### Strong action verbs

Lead every bullet with a verb. Past tense for prior roles, present tense for
current. Never start with "Responsible for", "Helped with", "Worked on",
"Assisted", "Participated in" - these signal passivity.

Curated verbs by category:

- **Leadership:** Led, Directed, Managed, Spearheaded, Oversaw, Championed,
  Mobilized, Orchestrated, Headed, Chaired
- **Analysis:** Analyzed, Modeled, Forecasted, Evaluated, Investigated,
  Diagnosed, Synthesized, Quantified, Benchmarked, Audited
- **Building / shipping:** Built, Engineered, Architected, Designed,
  Developed, Launched, Shipped, Deployed, Implemented, Productionized
- **Optimization:** Optimized, Streamlined, Accelerated, Reduced, Cut,
  Doubled, Tripled, Scaled, Improved, Automated
- **Communication:** Presented, Pitched, Authored, Drafted, Negotiated,
  Persuaded, Briefed, Communicated, Advised, Recommended
- **Initiative:** Founded, Launched, Pioneered, Initiated, Established,
  Created, Originated, Conceived, Bootstrapped

### Quantify everything

Recruiters and ATS keyword scoring both reward numbers. If a bullet has no
metric, it's incomplete.

Types of metrics, in order of preference:
1. **Dollar amounts:** revenue, cost saved, AUM, deal size, budget
2. **Percentages:** growth, conversion lift, error reduction, retention
3. **Counts:** users, transactions, models trained, audience size, articles
4. **Time:** weeks shortened, hours saved per week, latency reduced
5. **Rankings / selectivity:** "1 of 12 selected from 800 applicants",
   "Top 5% of class"

**When you don't have the exact number, estimate (truthfully) and round.**
"Roughly 200 weekly users" beats no metric. "~$3M deal" beats no metric. Do
not fabricate. Recruiters can and do ask you to back up numbers in interviews,
and saying "I made it up" loses the offer.

### Specificity

Generic bullets get skimmed past. Specific bullets stick.

- Name the **technologies, tools, frameworks** (Python, SQL, Tableau, Excel,
  PowerPoint, Bloomberg, FactSet, Java, React, Snowflake, dbt, Airflow).
- Name the **deal type / engagement type / project type** (LBO model, IPO
  comp set, customer segmentation, machine learning pipeline, A/B test).
- Name the **audience / team / scope** (C-suite, board of directors, 12-person
  team, 800-person event, cross-functional pod).
- Name the **industry / sub-vertical** when relevant (healthcare M&A, fintech
  pricing, B2B SaaS retention).

### Tense

- **Past tense** for all roles you have left (Built, Led, Analyzed).
- **Present tense** for roles you currently hold (Build, Lead, Analyze).
- **Never mix** within a single bullet.

### What to cut

- Pronouns: never use "I", "we", "my", "our". Start with the verb.
- Cliches: "team player", "hard-working", "passionate", "results-driven",
  "self-starter", "detail-oriented", "synergy", "value-add".
- Filler: "tasked with", "in charge of", "responsible for", "duties included".
- Redundancy: "successfully launched" - if it shipped, it was successful.
- Soft modifiers: "helped", "assisted", "supported", "contributed to" - either
  you did it or you didn't. If you only helped, name what you specifically
  owned.

---

## 3. Tailoring to the job description

This is the single highest-leverage improvement most candidates miss.

### Mirror exact keywords

ATS systems score keyword overlap. Recruiters skim for the exact phrasing in
the JD. If the posting says "financial modeling", your bullet should say
"financial modeling", not "quantitative analysis of company financials".

Steps:
1. Read the JD twice.
2. Highlight every **noun phrase that names a skill, tool, deliverable, or
   responsibility**. ("financial modeling", "client-facing", "Python",
   "stakeholder management", "DCF", "GTM strategy", "cross-functional").
3. For each highlighted phrase, find one bullet in your resume where you
   honestly used that skill, and rewrite the bullet to include the exact JD
   phrase. Never fabricate to match.

### Re-prioritize experiences

Move bullets that map to the JD higher within each role. Cut bullets that
don't map to the JD, even if they're impressive in isolation.

### Add / remove bullets

If you have 5 bullets in an old role and 3 in a current role, but the old
role maps better to the JD, swap the count. Most relevant experience deserves
the most ink, regardless of recency.

### Insert hard skills

If the JD lists `SQL`, `Tableau`, `Python`, `AWS`, and you have any of those:
add them to the `Skills` section AND surface them in a bullet ("Built SQL
pipeline...", "Visualized in Tableau..."). One mention isn't enough; ATS
rewards multiple occurrences.

### When NOT to tailor

- Don't claim a skill, language, or tool you don't have. Recruiters and
  hiring managers will test it.
- Don't fabricate metrics or projects to match the JD.
- Don't rewrite a role description in a way that misrepresents what you
  actually did.

---

## 4. Industry-specific guidance

### Consulting (MBB, Big 4)

**What MBB looks for:**
- Leadership scope at scale (200+ people, $X budget, multi-quarter program)
- Structured problem solving signal (case competitions, debate, research)
- Quantitative rigor (high GPA in quant major, finance/math/CS coursework,
  modeling experience)
- Communication (presentation experience, journalism, teaching, sales)
- Achievement at the top of selective filters ("1 of 8 from 1,200", D1 sport,
  national-level award)

**Resume tactics:**
- Quantify leadership: "Led 14-person team", "Managed $40K event budget",
  "Coordinated 6 cross-functional workstreams".
- Use structured language: "Diagnosed root cause", "Built 3-pillar
  framework", "Synthesized findings into a 12-slide deck for CFO".
- Show breadth: extracurriculars matter. A consulting club case competition
  win plus a varsity sport plus published research beats three IB internships.
- Mention any "1 of X" selection - case team selection, consulting club
  exec board, leadership program admission.

### Investment Banking (BB, EB)

**What banks look for:**
- Hard finance signal: finance club leadership, prior IB / PE / asset
  management internship, M&A research, modeling courses
- Technical fluency: DCF, LBO, comparable companies, precedent transactions,
  three-statement modeling, accretion/dilution
- Excel and PowerPoint speed and accuracy
- Detail orientation (zero typos, perfect formatting, consistent dates)
- High GPA (3.7+ for BB, often 3.5+ for EB)

**Resume tactics:**
- Name the deal type and deal context: "Constructed DCF for $250M cross-border
  software M&A target", "Built LBO model for $1.2B carve-out".
- Show specific technical tools: Excel (with model types named),
  PowerPoint, Bloomberg, FactSet, CapIQ, PitchBook.
- Highlight selectivity: "1 of 5 sophomores admitted to Goldman Engagement
  Program", "Junior IB Diversity Fellowship recipient".
- For finance clubs: name your role specifically ("VP Coverage",
  "Sector Head"), and what you produced ("Authored 3 stock pitches presented
  to 60-member club").
- Formatting matters here more than anywhere else. Banks scan for typos and
  inconsistencies as a proxy for diligence.

### Tech (FAANG, AI startups)

**What tech looks for:**
- Shipped projects with real users / measurable impact
- Language / framework specificity (not just "Programming")
- Internship-to-FTE pipeline (return offer signal is strong)
- Open source contributions, hackathon wins, GitHub portfolio
- For AI / ML roles: production ML systems, evaluation rigor, named
  model architectures, paper implementations
- For research roles: publications, citations, conference presentations

**Resume tactics:**
- Lead bullets with the system / product / model: "Built recommendation
  system serving 50K DAU", "Trained transformer model on 2M-row dataset".
- Name the stack explicitly: "Python, PostgreSQL, FastAPI, React, AWS Lambda".
- Quantify usage: DAU/MAU, requests/sec, latency reduction, conversion lift,
  test coverage %.
- Link to GitHub / portfolio in the header (just the username and short URL,
  no logo).
- For internships, name the team, the impact, and whether you received a
  return offer (if yes).
- For startups, name the funding round / stage if it's a credibility signal
  (Series A YC company, Series B, etc.).

---

## 5. Summary / Objective section

### When to include one

**Early career: usually skip.** Your education and experience already speak
for themselves on one page. A summary that says "Motivated finance student
seeking opportunities" is wasted space.

**Include a summary only if:**
- You are a career switcher and need to frame a non-obvious path.
- You are pivoting industries (e.g., consulting to tech PM).
- You have a unique credential cluster that needs explicit framing
  (PhD + startup founder + published author).

### If you write one

- **3 lines max**, ~30 words total.
- **No first person** ("Senior at USC studying...", not "I am a senior").
- **State**: who you are, what you want, your strongest differentiator.
- Example: "Senior at Wharton concentrating in Finance and Statistics. Prior
  M&A summer at Lazard and incoming SA at Goldman TMT. Built three-statement
  models for $200M+ deals."

### Never write an "Objective"

The objective section died in 2010. "Seeking a challenging position where I
can grow and develop my skills" tells a recruiter nothing.

---

## 6. Skills section

### What to include

- **Programming languages** with proficiency tier (e.g., "Python (advanced),
  SQL (intermediate)"). Don't list languages you can't pass a screen in.
- **Tools / platforms** specific to your target role (Excel, PowerPoint,
  Bloomberg, FactSet, Tableau, Looker, AWS, GCP, Docker, Git, R, Stata).
- **Foreign languages** with proficiency (Native, Fluent, Conversational,
  Beginner). Skip "Beginner" unless the role specifically asks for it.
- **Certifications** that are industry-recognized (CFA L1, CPA, BMC, AWS
  Solutions Architect).

### What to skip

- "Microsoft Word" - assumed. Same for Email, PowerPoint at a basic level,
  Google Docs.
- Soft skills - "Communication", "Leadership", "Teamwork". Show these in
  bullets, don't list them.
- Adjectives - "Excellent", "Proficient", "Expert" without specifics.

### How to organize

- **Grouped by category** (Languages / Tools / Frameworks / Certifications)
  is cleaner than a flat list.
- **Order by relevance to the target role**, not alphabetically. If applying
  to a Python-heavy role, lead with Python.

---

## 7. Common mistakes that get resumes rejected

In rough order of how often they appear:

1. **No metrics.** Bullets that describe activities without outcomes. Fix:
   add at least one number per bullet.
2. **Weak verbs.** "Helped with", "Assisted with", "Was responsible for".
   Fix: replace with a strong action verb.
3. **Generic cliches.** "Hard-working team player." Fix: delete and replace
   with a specific accomplishment.
4. **Buried JD keywords.** The JD says "Python", your bullet says "scripting
   language". Fix: mirror exact JD phrasing where truthful.
5. **Two pages without justification.** Fix: cut to one page.
6. **Tables, columns, icons.** Fix: use a single-column, plain-text-friendly
   format.
7. **Inconsistent dates / formatting.** "Aug 2024 - Present" vs
   "August 2024 - present" on the same page. Fix: pick one format, apply
   everywhere.
8. **Typos.** Especially in IB / law. One typo costs the interview.
9. **First-person pronouns.** Delete every "I", "we", "my".
10. **Stale skills section.** Listing skills you no longer use, omitting
    skills the JD asked for. Fix: rewrite skills against the JD.
11. **Education at the bottom for current students.** Fix: Education above
    Experience until 6 months past graduation.
12. **No GitHub / portfolio link for tech.** Fix: add one if you have any
    public work.
13. **Including high school.** Fix: drop high school unless it's HYPS-tier
    boarding school and you're an underclassman.
14. **Photos.** Never include a headshot on a US resume. (Different in EU.)
15. **Hobbies that don't differentiate.** "Reading, hiking, traveling" -
    everyone says this. Either drop the section or include genuinely
    unusual interests.

---

## 8. High-impact rewrites (before / after)

### A. Banking analyst - weak verb, no metrics

**Before:**
```
- Helped with M&A analysis for healthcare clients
```

**After:**
```
- Built three-statement model and DCF for $480M cross-border medtech M&A;
  outputs informed final $34/share offer accepted by target board
```

Principles applied: strong verb (Built), specific deal type and size,
quantified outcome, tied to client decision.

---

### B. Consulting intern - generic activity, no scope

**Before:**
```
- Worked on a market sizing project for a consumer goods client
```

**After:**
```
- Sized $2.1B addressable US market for direct-to-consumer skincare client
  using bottoms-up demographic model; recommendation drove client's decision
  to enter Gen Z segment, projected $80M Y1 revenue
```

Principles applied: quantified market, specific methodology, named segment,
linked to a client decision and projected impact.

---

### C. Software engineering intern - vague impact

**Before:**
```
- Built a website using React and worked on backend APIs
```

**After:**
```
- Shipped React + Node onboarding flow that reduced new-user activation time
  from 6 minutes to 90 seconds across 4,000 weekly signups; A/B tested
  against legacy flow, 22% lift in D7 retention
```

Principles applied: shipped (not just built), named stack, before/after
metric, measurement methodology, retention outcome.

---

### D. Finance club leadership - title without scope

**Before:**
```
- VP of Investment Club at USC
```

**After:**
```
- VP Coverage, Marshall Investment Banking Club (USC); authored 4 sell-side
  research reports presented to 80-member club, mentored 12 underclassmen
  through technical interview prep, 9 received bulge bracket SA offers
```

Principles applied: titled role with sub-role, quantified deliverables,
mentorship scope, downstream outcome of mentees.

---

### E. ML research project - no technical specificity

**Before:**
```
- Conducted research on natural language processing models
```

**After:**
```
- Fine-tuned LLaMA-2 7B on 220K customer support tickets using LoRA;
  reduced ticket-routing error rate from 14% to 4.8% versus prior BERT
  baseline; results submitted to EMNLP 2025 student workshop
```

Principles applied: named model architecture, dataset size, technique (LoRA),
before/after metric, baseline comparison, venue.

---

### F. Sales / business development internship

**Before:**
```
- Reached out to potential clients to grow the business
```

**After:**
```
- Sourced 140 outbound leads for B2B SaaS startup ($3M ARR pre-Series A),
  booked 22 discovery calls, closed 4 design partner deals totaling
  $68K ACV; built Outreach + HubSpot sequence still used 6 months later
```

Principles applied: top-of-funnel quantified, conversion rate implicit,
ACV outcome, tooling named, durability of contribution.

---

### G. Teaching assistant - typical filler

**Before:**
```
- TA for Intro to Economics
```

**After:**
```
- Teaching Assistant, ECON 101 (300-student lecture, Prof. Smith); led 3
  weekly discussion sections of 25 students each, wrote and graded weekly
  problem sets; median student rating 4.8/5
```

Principles applied: scope of class, owned deliverables, quantified
performance.

---

### H. Founded a club - resume claim with no proof

**Before:**
```
- Founded a startup club at my university
```

**After:**
```
- Founded USC Generative AI Society from 0 to 240 members in 8 months;
  organized monthly speaker series (alumni founders, Anthropic + OpenAI
  PMs), partnered with Marshall School to integrate as official affiliate
```

Principles applied: growth metric, programming specifics, named external
guests, institutional legitimacy.

---

### I. Personal project - no real users or outcome

**Before:**
```
- Built a stock trading app as a personal project
```

**After:**
```
- Built and deployed paper-trading web app (Next.js + Postgres + Alpaca
  API) currently used by 480 weekly active users; integrated 3 trading
  strategies with backtest visualizations; 1.2k stars on GitHub
```

Principles applied: deployed (not just built), full stack named, real usage
numbers, feature scope, social proof via GitHub stars.

---

### J. Restaurant / retail job - underestimated, often worth keeping

**Before:**
```
- Worked at a coffee shop during the school year
```

**After:**
```
- Trained 6 new baristas across 2 store locations while balancing 18-credit
  course load; promoted to shift lead in 4 months, managed cash drawer and
  open/close procedures
```

Principles applied: leadership of others, balanced commitment, promotion
signal, ownership scope. Service jobs absolutely belong on early-career
resumes when bullets are written with scope and outcomes.

---

## 9. Final reading-pass checklist

Before sending any resume:

- [ ] Reads cleanly in 30 seconds from top to bottom.
- [ ] Every bullet has a strong verb and at least one number.
- [ ] Every section header appears exactly once and uses standard naming.
- [ ] Dates and locations are formatted identically across sections.
- [ ] No "I", "we", "my", "our".
- [ ] No "Responsible for", "Helped with", "Assisted with", "Worked on".
- [ ] Skills section mirrors the JD's named tools / languages.
- [ ] Education GPA is included if 3.5+, omitted otherwise.
- [ ] Contact info is in the document body, not a header/footer.
- [ ] Single-column, no tables, no images, no icons.
- [ ] PDF saved with embedded fonts.
- [ ] Filename: `Firstname_Lastname_Resume.pdf` (or with target company
      suffix for highly targeted apps).
- [ ] Passes a paste-into-Notepad ATS test: text comes out in correct order
      and no garbled characters.

---

## Quick reference: when GPT-4o produces recommendations, it should...

- Cite which principle from sections 1-7 applies.
- Provide a verbatim original_text span from the resume.
- Provide a suggested_text rewrite that is concrete and tailored to the JD,
  using bracketed placeholders for any number the candidate must supply
  rather than fabricating one.
- Tag severity high if the bullet would cost the candidate an interview at
  the target firm; medium if it materially weakens fit; low for polish.
- Avoid single-word verb swaps unless the verb is genuinely weak AND the
  bullet has no other issue. Prefer fuller rewrites that fix multiple
  problems in one card.
- Skip recommendations to add metrics the candidate may not have. Frame
  metric additions as placeholders.
