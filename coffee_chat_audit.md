# Meeting Prep -- Audit Report

## Feature Overview

Meeting Prep lets users paste a LinkedIn URL to generate a one-page PDF prep sheet for an upcoming meeting. The pipeline enriches the profile via PDL, fetches company/industry news via SerpAPI, generates a similarity summary and tailored questions via GPT-4o-mini, renders a ReportLab PDF, and uploads it to Firebase Storage. Costs 15 credits per prep. Tier limits: Free=3/mo, Pro=10/mo, Elite=unlimited.

---

## Files Involved

### Backend
| File | Purpose |
|------|---------|
| `backend/app/routes/meeting_prep.py` | 6 API endpoints (create, status, download, history, all, delete) + background processing pipeline |
| `backend/app/services/meeting.py` | SERP news research, article summarization, industry overview, hometown inference |
| `backend/app/services/pdl_client.py` | PDL Person Enrichment API integration (`enrich_linkedin_profile` at line 3057) |
| `backend/app/services/pdf_builder.py` | ReportLab PDF generation (`generate_meeting_pdf` at line 34) |
| `backend/app/utils/meeting_prep.py` | AI prompts: similarity summary + question generation |
| `backend/app/models/meeting_prep.py` | Data models & validation |
| `backend/app/utils/users.py` | `parse_resume_info()` for user context extraction |
| `backend/app/config.py` | `MEETING_CREDITS = 15`, tier configs |
| `backend/wsgi.py` | Blueprint registration (line 109) |

### Frontend
| File | Purpose |
|------|---------|
| `connect-grow-hire/src/pages/MeetingPrepPage.tsx` | Main page: input LinkedIn URL, poll status, display results, download PDF |
| `connect-grow-hire/src/pages/MeetingLibrary.tsx` | Library view of all generated preps |
| `connect-grow-hire/src/services/api.ts` | 6 API methods: `createMeetingPrep`, `getCoffeeChatPrepStatus`, `downloadMeetingPDF`, `getAllCoffeeChatPreps`, `getMeetingHistory`, `deleteMeetingPrep` |
| `connect-grow-hire/src/components/AppSidebar.tsx` | Nav link under PREPARE section |
| `connect-grow-hire/src/components/Dashboard.tsx` | Dashboard metric: meeting count + time saved |
| `connect-grow-hire/src/contexts/TourContext.tsx` | Tour step for meeting prep |
| `connect-grow-hire/src/hooks/useSubscription.ts` | Usage tracking (`coffeeChatPrepsUsed`) |
| `connect-grow-hire/src/utils/featureAccess.ts` | Tier-based access control |
| `connect-grow-hire/src/lib/constants.ts` | `MEETING_CREDITS = 15`, tier limits |
| `connect-grow-hire/src/data/scout-knowledge.ts` | Scout chatbot knowledge entry |
| `connect-grow-hire/src/components/demo/MeetingDemoPlaceholder.tsx` | Placeholder demo component |
| `connect-grow-hire/src/components/ProductTour.tsx` | Feature showcase with video |
| `connect-grow-hire/src/components/gates/UsageMeter.tsx` | Usage meter display |
| `connect-grow-hire/src/lib/analytics.ts` | Event tracking for meeting actions |
| `connect-grow-hire/src/App.tsx` | Route definitions: `/meeting-prep`, `/meeting-library` |

---

## Current Data Pipeline

```
User pastes LinkedIn URL
        |
        v
POST /api/meeting-prep
        |
        v
[Background Thread Spawned]
        |
  Step 1: PDL Person Enrichment API
        |  -> enrich_linkedin_profile(url)
        |  -> extract_contact_from_pdl_person_enhanced()
        |  -> Transform to meeting_data dict (13 fields)
        |
  Step 2: SerpAPI News Research
        |  -> fetch_serp_research(company, division, office, industry, job_title)
        |  -> Up to 4 fallback queries on news tab
        |  -> GPT-4o-mini summarizes each article (30-40 words)
        |  -> GPT-4o-mini generates industry overview
        |
  Step 3: User Context Extraction
        |  -> parse_resume_info(resume_text) OR user_profile fields
        |  -> Extracts: name, university, major, year
        |
  Step 4: Hometown Inference
        |  -> infer_hometown_from_education(education, contact_data)
        |  -> Regex + PDL location fallback
        |
  Step 5: AI Content Generation (GPT-4o-mini)
        |  -> generate_meeting_similarity(user_data, contact_data) -- 45-60 word paragraph
        |  -> generate_meeting_questions(contact_data, user_data) -- up to 8 questions
        |
  Step 6: PDF Generation (ReportLab)
        |  -> generate_meeting_pdf() -- 1 page, 5 sections
        |
  Step 7: Upload to Firebase Storage
        |  -> coffee_chat_preps/{user_id}/{prep_id}.pdf
        |
  Step 8: Deduct 15 credits
        |
  Step 9: Increment usage counter
        |
        v
Frontend polls GET /api/meeting-prep/{prepId}
until status = "completed"
```

---

## PDL Usage: 8 of 20+ fields used

The `enrich_linkedin_profile()` function calls `extract_contact_from_pdl_person_enhanced()` which pulls many PDL fields, but then **discards most of them** during the transform to meeting format at line 3114.

| PDL Field | Extracted? | Passed to Meeting? | Used in AI Prompt? | Used in PDF? | Notes |
|-----------|-----------|----------------------|-------------------|-------------|-------|
| `first_name` | Yes | Yes (firstName) | Yes | Yes | Core field |
| `last_name` | Yes | Yes (lastName) | Yes | Yes | Core field |
| `experience` (array) | Yes | **Partially** -- only WorkSummary string | **No** -- only as flat string | Yes (if raw array present) | Full career history extracted but flattened to 1-line WorkSummary. PDF tries to use raw `experience` array but meeting_data only has `workExperience: [WorkSummary]` |
| `education` (array) | Yes | **Partially** -- only EducationTop string | Yes (flat string) | Yes (if raw array present) | Same issue: rich education data flattened to single string |
| `location` (locality, region) | Yes | Yes (city, state, location) | Yes | Yes | |
| `emails` (array) | Yes | Yes (email) | No | Yes | Only best email selected |
| `interests` (array) | Yes | **No** -- `interests: []` hardcoded empty! | No | No | **CRITICAL GAP**: Extracted in `extract_contact_from_pdl_person_enhanced` but explicitly set to `[]` in meeting transform (line 3127) |
| `summary` | Yes (for volunteer extraction) | No | No | No | Only scanned for volunteer keywords, not passed through |
| `profiles` (LinkedIn) | Yes | Yes (linkedinUrl) | No | Yes | |
| `phone_numbers` | Yes | No | No | No | Extracted but not passed to meeting |
| `linkedin_connections` | Yes | No | No | No | Available but unused |
| `inferred_years_experience` | Yes (in WorkSummary) | Embedded in WorkSummary string | No | Indirectly | Not a standalone field |
| `skills` (array) | **No** | **No** | **No** | Yes (checks for it but won't find it) | PDF builder checks `contact_data.get('skills', [])` at line 247 but PDL skills are never extracted or passed |
| `certifications` | **No** | **No** | **No** | **No** | Available from PDL, completely unused |
| `languages` | **No** | **No** | **No** | **No** | Available from PDL, completely unused |
| `industry` | **No** | **No** | **No** | Derived from Group | PDL provides `industry` field, but it's never extracted. Industry in context falls back to `Group` which is fabricated as "{Company} {FirstWordOfTitle} Team" |
| `job_company_size` | **No** | **No** | **No** | **No** | Available from PDL, would enrich company context |
| `job_company_industry` | **No** | **No** | **No** | **No** | Available from PDL, would give real industry |
| `job_company_founded` | **No** | **No** | **No** | **No** | Available from PDL |
| `job_company_linkedin_url` | **No** | **No** | **No** | **No** | Available from PDL |
| `github_url` / `twitter_url` | **No** | **No** | **No** | **No** | Available from PDL profiles array but only LinkedIn extracted |
| `inferred_salary` | **No** | **No** | **No** | **No** | Available from PDL |
| `recommended_personal_email` | Yes | No (only used for email selection) | No | No | |

### Key Data Loss Points

1. **Line 3114-3128 (`enrich_linkedin_profile`)**: The transform to `meeting_data` discards most of the rich `enriched` dict. Only 13 fields survive.
2. **`interests: []` hardcoded**: PDL interests are extracted by `extract_contact_from_pdl_person_enhanced` but the meeting transform explicitly sets `interests: []`.
3. **`skills` never extracted**: PDF builder looks for skills but they're never in the data.
4. **`experience` flattened**: Full career timeline with dates, companies, titles is compressed to a single WorkSummary string. The PDF builder tries to use a raw `experience` array but the meeting data only has `workExperience: ["Current X at Y. Previously at Z"]`.
5. **`education` flattened**: Same issue -- rich education array compressed to one string.
6. **`industry` fabricated**: Real PDL industry field never extracted. Falls back to `Group` which is "{Company} {FirstWord} Team" -- meaningless.

---

## SERP Usage

**Yes -- SerpAPI is used for news research.**

- Queries: Up to 4 fallback queries combining company + division/office/industry
- Tab: `nws` (news results only)
- Count: 10 results per query
- Time window: Configurable, defaults to "last 90 days"
- Post-processing: Deduplication, eligibility filtering, relevance scoring, GPT-4o-mini summarization
- Output: List of `NewsItem` objects (title, url, source, published_at, summary, relevance_tag) + industry summary string

**Limitations:**
- Only searches news tab -- no web results, no company website scraping, no annual reports
- Domain classification is simplistic (checks for "manufacturing", "process", etc. in job title)
- Heavy filtering may reject relevant news (AI/tech/fintech news rejected for "industrial" domain)
- Industry summary only uses items with relevance >= 0.8, which may be empty
- No company-specific research beyond news (no about page, no Wikipedia, no Glassdoor)

---

## AI Prompt Quality

### Similarity Summary Prompt
**Model:** GPT-4o-mini | **Temperature:** 0.5 | **Max tokens:** 150

**Assessment: Well-crafted but data-starved.**

The prompt itself is excellent -- it has strict quality rules, anti-generic filtering, geographic similarity rules, and requires explicit evidence. The post-processing is also thorough (rejects generic phrases, requires proper nouns, converts trailing questions).

**Problem:** The data fed to the prompt is thin:
- User data: only name, university, major (no skills, interests, work experience, career goals)
- Contact data: firstName, lastName, company, jobTitle, education (flat string), location, experience (empty or flat string)
- No interests, skills, certifications, languages, publications, social activity
- Result: the prompt can only find university overlap or location match. Everything else requires data that isn't provided.

### Question Generation Prompt
**Model:** GPT-4o-mini | **Temperature:** 0.6 | **Max tokens:** 400

**Assessment: Good rules, mediocre results.**

The prompt correctly rejects generic questions ("what inspired you", "typical day") and requires role-specific references. Post-filtering is solid.

**Problem:** Same data starvation:
- Only role, company, education, and experience strings available
- No company research, no industry trends, no recent projects, no publications
- Result: questions are better than generic but still surface-level ("How does your role in [title] at [company]..." without knowing what the company actually does)

### Article Summarization
**Model:** GPT-4o-mini | **Temperature:** 0.4 | **Max tokens:** 120

Straightforward and appropriate. The SKIP mechanism works well.

### Industry Overview
**Model:** GPT-4o-mini | **Temperature:** 0.5 | **Max tokens:** 120

Fine for what it does, but heavily filtered -- often returns empty.

---

## PDF Output Quality

### Score: 4/10

### Layout Description
- **Single page**, Letter size (8.5" x 11")
- **Teal header bar** (#0d4f6e) with "Offerloop.ai" logo and "{Name} One Pager" title
- **5 sections** with teal underlined headers, bullet-point content, Helvetica font
- **Footer** with disclaimer text and "Offerloop.ai 2025"

### Visual Quality Issues
1. **Dated design**: Looks like a 2015 corporate report, not a modern prep tool
2. **ReportLab canvas-based**: No HTML/CSS flexibility, no responsive layout, no modern typography
3. **Single font family** (Helvetica) with no visual hierarchy beyond bold/italic
4. **No images, icons, or visual elements** beyond the header bar
5. **Monochrome** aside from teal -- no color coding, no visual separation between sections
6. **Fixed layout** that can't adapt to varying content lengths (questions get cut off at 0.8" from bottom)
7. **Title says "One Pager"** but content is genuinely crammed -- sections fight for space

### Content Quality Issues
1. **Profile Snapshot**: Adequate but basic -- name, company, title, email, location
2. **Professional Background**: Shows current role + up to 3 previous + education + skills. BUT skills are always empty (never passed), and experience is often just WorkSummary string
3. **Organization & Industry Context**: Company name, fabricated "Team/Division" (e.g., "Google Software Team"), fabricated industry, plus news (when available). The division/industry values are meaningless generated strings.
4. **Personal Hooks**: Often shows "No specific shared background identified" because similarity prompt has too little data
5. **Questions**: 4-8 questions, quality varies. Better than fully generic but not deeply personalized.
6. **No company cheat sheet**: No funding, size, recent launches, competitors, culture notes
7. **No icebreakers**: No common ground section beyond the thin similarity summary
8. **No preparation tips**: No suggested conversation flow, no dos/don'ts
9. **No follow-up template**: No suggested thank-you email draft

---

## Top 10 Gaps (Prioritized)

### 1. Data Loss in PDL Transform (Critical)
`enrich_linkedin_profile()` extracts rich data then discards 60%+ during the meeting transform. Skills, interests, full experience timeline, full education array, industry, company metadata -- all lost. Fix: pass raw PDL data through or build a richer transform.

### 2. Skills Never Reach PDF (Critical)
PDF builder has code to display skills (`contact_data.get('skills', [])`) but skills are never extracted from PDL or included in the meeting data dict. Always shows nothing.

### 3. Interests Hardcoded Empty (Critical)
Line 3127: `'interests': []`. PDL interests are available and extracted elsewhere in the same function but explicitly zeroed out for meeting. These would massively improve similarity matching and icebreakers.

### 4. Industry Field Fabricated (High)
The "industry" context falls back to `Group` which is generated as "{Company} {FirstWordOfTitle} Team" -- e.g., "Goldman Sachs Vice Team". PDL provides real `industry` and `job_company_industry` fields that are never extracted.

### 5. No Company Research Beyond News (High)
No company website scraping, no Wikipedia/Crunchbase data, no company size/funding/founding year. PDL provides `job_company_size`, `job_company_industry`, `job_company_founded` but none are used. No SERP web search (only news tab).

### 6. User Context is Minimal (High)
Only name, university, major extracted from user profile. No user skills, interests, career goals, work experience, target roles. The similarity and question prompts can't personalize without this.

### 7. PDF Design is Dated (Medium)
ReportLab canvas-based PDF with Helvetica, no modern typography, no visual hierarchy, no icons. Looks like an internal memo, not a premium prep tool.

### 8. Experience Data Flattened (Medium)
Rich career timeline (5 jobs with dates, titles, companies) compressed to "Current X at Y. Previously at Z" string. AI prompts can't analyze career transitions, tenure patterns, or progression.

### 9. No Conversation Strategy Section (Medium)
No suggested flow (opener -> rapport -> learning -> ask -> close). No preparation checklist. No "things to avoid" guidance. Just questions in a list.

### 10. Single-Page Constraint (Low)
Everything crammed into one page. Questions get cut off. No room for company deep-dive, industry trends detail, or preparation tips. Could be 2-3 pages with proper content.

---

## Rebuild Opportunities

### Highest Impact (Data Layer)
1. **Pass full PDL data through** -- stop flattening experience/education/skills/interests
2. **Extract PDL company fields** -- industry, size, founded, LinkedIn URL
3. **Add SERP web search** -- company about page, Wikipedia, Glassdoor, recent blog posts
4. **Enrich user context** -- pull user's full resume, skills, interests, career goals into prompts

### High Impact (AI Layer)
5. **Upgrade to GPT-4o** for similarity/questions (currently mini) -- better reasoning about career parallels
6. **Add company research prompt** -- generate a "company cheat sheet" with what they do, culture, recent news
7. **Add conversation strategy prompt** -- suggest openers, flow, and follow-up plan
8. **Add icebreaker/common ground section** -- using interests, hobbies, volunteer work, shared connections

### Medium Impact (Output Layer)
9. **Redesign PDF** -- use WeasyPrint or HTML-to-PDF for modern layout with typography, icons, color coding
10. **Expand to 2-3 pages** -- page 1: profile + company, page 2: questions + strategy, page 3: follow-up template
11. **Add inline preview** -- show prep content in-app before/alongside PDF download
12. **Add email follow-up draft** -- auto-generate a thank-you email template based on the conversation topics
