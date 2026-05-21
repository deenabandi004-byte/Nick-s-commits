# Features Reference

## Contact Search

**Description:** Search for professionals by job title, company, location, and alumni network.

**User Flow:**
1. User enters job title, company (optional), location, alumni school (optional), batch size
2. Frontend calls `POST /api/runs/search` (unified search endpoint)
3. Backend: validates inputs → checks credits → searches PDL → enriches with Hunter → generates emails → creates Gmail drafts
4. Results displayed as contact cards with email previews

**Required Inputs:** job_title, location
**Optional Inputs:** company, college_alumni, batch_size, email_template

**API Calls:** PDL Person Search, PDL Company Clean, PDL Location Clean, OpenAI (email generation), Gmail (draft creation), Hunter.io (email enrichment)

**Credit Cost:** 15 credits per search

**Tier Limits:**
- Free: 3 contacts/search, basic fields
- Pro: 8 contacts/search, extended fields, resume-enhanced
- Elite: 15 contacts/search, all fields, priority queue

---

## Saved Contacts & Contact Library

**Description:** Save contacts from search results to a persistent library. Contacts are stored as a Firestore subcollection.

**User Flow:**
1. After search, user clicks "Save" on individual contacts or "Save All"
2. Frontend calls contact save API
3. Contact stored in `users/{uid}/contacts/{contactId}`
4. Contact library page (`/contact-directory`) shows all saved contacts
5. Users can filter, sort, search, and manage contacts

**Firestore Path:** `users/{uid}/contacts/{contactId}`

**Features:**
- Bulk save from search results
- Manual contact creation
- CSV import (`/api/contacts/import`)
- LinkedIn import
- Contact deduplication (by name + company)
- Export (Pro/Elite only)

---

## Email Drafting

**Description:** AI-generated personalized networking emails. See [EMAIL_GENERATION.md](./EMAIL_GENERATION.md) for full details.

**User Flow:**
1. Emails generated automatically during contact search
2. User can preview/edit in contact card
3. If Gmail connected: drafts created automatically
4. User can regenerate with different template/style
5. Email template presets available (casual, professional, short_direct, etc.)

**Credit Cost:** Included in search cost (no additional credits)

---

## Outbox / Email Tracking

**Description:** Track sent emails, detect replies, manage follow-ups.

**User Flow:**
1. Navigate to `/outbox`
2. See all sent/drafted emails with status
3. Statuses: Draft → Sent → Replied / No Response
4. Reply detection via Gmail thread monitoring
5. Follow-up reminders

**Firestore Structure:**
- Contacts with `emailStatus` field: "draft" | "sent" | "replied"
- `gmailDraftId` and `gmailThreadId` for Gmail integration
- Reply checking via `check_for_replies()` in `gmail_client.py`

**API Endpoints:**
- `GET /api/outbox/entries` - list outbox entries
- `PUT /api/outbox/entries/{id}` - update entry status
- `POST /api/outbox/check-replies` - bulk reply check

---

## Meeting Prep

**Description:** AI-generated preparation notes for meetings with professionals.

**User Flow:**
1. Navigate to `/meeting-prep`
2. Enter contact info (name, title, company, LinkedIn URL)
3. Backend generates comprehensive prep:
   - Company overview and recent news
   - Person's background summary
   - Talking points and conversation starters
   - Questions to ask
   - Commonalities with user (shared schools, interests, etc.)
4. Prep saved to Firestore for future reference

**API Calls:** OpenAI (content generation), SerpAPI/Jina (web research for company/person info)

**Credit Cost:** 15 credits (`MEETING_CREDITS`)

**Tier Limits:**
- Free: 3 lifetime
- Pro: 10/month
- Elite: Unlimited

**Firestore Path:** `users/{uid}/coffee-chat-preps/{docId}`

---

## Interview Prep

**Description:** AI-powered interview preparation with question generation and research aggregation.

**User Flow:**
1. Navigate to `/interview-prep`
2. Enter company, role, and optionally paste job description
3. Backend generates:
   - Common interview questions for the role/company
   - Behavioral question examples with STAR framework
   - Technical questions (role-specific)
   - Company culture insights
   - YouTube video recommendations
   - Reddit discussion summaries
   - Glassdoor interview experience data
4. Content aggregated into downloadable PDF

**API Calls:** OpenAI, YouTube Data API, SerpAPI (Reddit/Glassdoor), Jina AI (content extraction)

**Credit Cost:** 25 credits (`INTERVIEW_PREP_CREDITS`)

**Tier Limits:**
- Free: 2 lifetime
- Pro: 5/month
- Elite: Unlimited

**Backend Services:**
- `services/interview_prep/glassdoor_scraper.py` - Glassdoor interview data
- `services/interview_prep/content_processor.py` - content processing
- `services/interview_prep/question_extractor.py` - question extraction
- `services/interview_prep/pdf_generator.py` - PDF generation

**Firestore Path:** `users/{uid}/interview-preps/{docId}`

---

## Resume Workshop

**Description:** Upload, parse, score (ATS), optimize, and tailor resumes with AI.

**User Flow:**
1. Navigate to `/write/resume`
2. Upload resume (PDF/DOCX)
3. Backend extracts text and parses sections
4. ATS Score: AI analyzes resume against ATS criteria
5. Optimization suggestions with auto-apply
6. Tailor resume to specific job descriptions
7. Resume library: save multiple versions

**Sub-features:**
- **Library Tab:** Manage multiple resume versions
- **Score & Fix Tab:** ATS scoring with actionable fixes
- **Tailor Tab:** Customize resume for specific job postings

**API Endpoints:**
- `POST /api/resume/upload` - upload and parse
- `POST /api/resume/score` - ATS scoring
- `POST /api/resume/optimize` - AI optimization
- `POST /api/resume/tailor` - tailor to job description
- `POST /api/resume/patch-pdf` - apply edits to PDF

**Backend Services:**
- `services/resume_parser.py` / `resume_parser_v2.py` - text extraction
- `services/resume_optimizer_v2.py` - AI optimization
- `services/ats_scorer.py` - ATS score calculation
- `services/pdf_patcher.py` - PDF editing
- `services/pdf_builder.py` - PDF generation

**Firestore Paths:**
- `users/{uid}/resume_library/{docId}` - saved resumes
- `users/{uid}/resume_scores/{docId}` - ATS scores

---

## Cover Letter Workshop

**Description:** AI-generated cover letters tailored to job descriptions.

**User Flow:**
1. Navigate to `/write/cover-letter`
2. Enter job title, company, paste job description
3. AI generates personalized cover letter
4. Edit inline, download as PDF
5. Save to library

**Firestore Path:** `users/{uid}/cover_letter_library/{docId}`

---

## Scout AI Assistant

**Description:** In-app AI chatbot for career guidance and platform help.

**User Flow:**
1. Click Scout icon in header or press Cmd/Ctrl+K
2. Side panel opens with chat interface
3. User types questions about career, networking strategy, platform usage
4. Scout responds with contextual advice
5. Conversation history persisted

**Frontend Components:**
- `ScoutSidePanel.tsx` - slide-out panel
- `ScoutChatbot.tsx` - chat interface
- `ScoutContext.tsx` - state management

**Backend Routes:**
- `routes/scout.py` - recruiter finder functionality
- `routes/scout_assistant.py` - AI chat endpoints

**Firestore Path:** `users/{uid}/scoutConversations/{convId}`

**Knowledge Base:** `data/scout-knowledge.ts` - static knowledge for quick answers

---

## Firm Search

**Description:** Search and research companies with AI-generated overviews.

**User Flow:**
1. Navigate to `/firm-search`
2. Search by company name or industry
3. View company overview: description, size, industry, culture
4. See key people at the company
5. Save firms to tracker

**Tier Requirement:** Pro or Elite

**Firestore Path:** `users/{uid}/firmSearches/{searchId}`

**Backend Services:**
- `services/company_search.py`
- `services/company_extraction.py`
- `services/firm_details_extraction.py`

---

## Recruiting Timeline

**Description:** Visual drag-and-drop timeline for tracking recruiting milestones.

**User Flow:**
1. Accessible from dashboard
2. Drag-and-drop phases (Application → Interview → Offer → etc.)
3. AI-powered phase suggestions based on industry
4. Persisted to Firestore

**Backend Route:** `routes/timeline.py`

---

## Job Board

**Description:** Aggregated job listings from multiple sources.

**User Flow:**
1. Navigate to `/job-board`
2. Search by title, company, location
3. View aggregated listings
4. Apply directly or save for later

---

## Onboarding Tour

**Description:** Multi-step onboarding flow for new users.

**Steps:**
1. Welcome (`/onboarding` → `OnboardingWelcome`)
2. Profile setup (`OnboardingProfile`)
3. Academic info (`OnboardingAcademics`) - university, major, year
4. Location preferences (`OnboardingLocationPreferences`)

**Data Collected:** name, university, major, graduation year, target industries, target roles, location preferences

**Completion:** Sets `needsOnboarding: false` in Firestore, redirects to `/contact-search`

**Frontend:** `TourContext.tsx` manages tour state, `ProductTour.tsx` provides guided highlights.

---

## Hiring Manager Tracker

**Description:** Track recruiters and hiring managers for target companies.

**User Flow:**
1. Navigate to `/hiring-manager-tracker`
2. Search for recruiters at specific companies
3. Save to tracker with notes
4. Generate outreach emails

**Firestore Path:** `users/{uid}/recruiters/{recruiterId}`

**Backend Service:** `services/recruiter_finder.py`, `services/recruiter_email_generator.py`

---

## Application Lab

**Description:** Track job applications across companies.

**User Flow:**
1. Navigate to `/application-lab`
2. Add applications with company, role, status
3. Track pipeline: Applied → Phone Screen → Interview → Offer

**Backend Service:** `services/application_lab_service.py`
