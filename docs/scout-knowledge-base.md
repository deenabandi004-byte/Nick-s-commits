# Offerloop Knowledge Base for Scout AI Assistant

**Purpose:** Comprehensive knowledge base document for training Scout, the AI assistant that helps users understand and navigate Offerloop.

**Last Updated:** Generated from codebase audit

---

## Table of Contents

1. [Application Overview](#1-application-overview)
2. [User Journey Mapping](#2-user-journey-mapping)
3. [Feature Documentation](#3-feature-documentation)
4. [Subscription & Credits System](#4-subscription--credits-system)
5. [FAQ Knowledge Base](#5-faq-knowledge-base)
6. [Scout Training Data (Q&A Pairs)](#6-scout-training-data-qa-pairs)
7. [Error States & Edge Cases](#7-error-states--edge-cases)
8. [Settings & Customization](#8-settings--customization)

---

## 1. Application Overview

### What is Offerloop?

**Offerloop** is a comprehensive platform built by students, for students and young professionals. The mission is to make it easier to connect with professionals, stand out, and land great opportunities.

**Value Proposition:**
- Automates the networking outreach process
- Helps students spend less time on tedious work
- More time building real connections and preparing for careers
- Reduces the stress and exhaustion of traditional networking

**Target Users:**
- Students (especially at USC and similar universities)
- Young professionals
- Anyone looking to network and find opportunities

**Core Promise:**
Offerloop automates the outreach process, helping users spend less time on tedious work and more time building real connections and preparing for what truly matters in their careers.

### High-Level Architecture

**Frontend:**
- React 18 with TypeScript
- Vite build system
- React Router for navigation
- Tailwind CSS + shadcn/ui for styling
- Firebase SDK for authentication and data
- TanStack Query for data fetching

**Backend:**
- Flask (Python) REST API
- Firebase Firestore for database
- Firebase Auth for authentication
- External API integrations (OpenAI, People Data Labs, Gmail, Stripe)

**Key Integrations:**
- **People Data Labs (PDL):** Contact search and enrichment
- **OpenAI:** AI-powered email generation, resume optimization, prep materials
- **Gmail API:** Email draft creation and management
- **Stripe:** Payment processing and subscription management
- **SerpAPI:** Job listings and web search

---

## 2. User Journey Mapping

### Onboarding Flow

**Step 1: Sign Up**
1. User visits landing page
2. Clicks "Sign In" or "Get Started"
3. Chooses Google Sign-In
4. Firebase authentication creates account
5. User document created in Firestore with:
   - `tier: "free"`
   - `credits: 300`
   - `maxCredits: 300`
   - `needsOnboarding: true`

**Step 2: Gmail Connection (Immediate)**
- After sign-in, system checks if Gmail is connected
- If not connected, user is immediately redirected to Gmail OAuth flow
- User grants permissions for Gmail draft access
- OAuth credentials saved to Firestore
- User redirected back to app

**Step 3: Onboarding Form**
- User sees onboarding flow with 3 steps:
  1. **Profile:** First name, last name, email, phone
  2. **Academics:** University, degree, major, graduation month/year
  3. **Location:** Country, state, city, job types, career interests, preferred location
- Data saved to Firestore user document
- `needsOnboarding` set to `false`
- User redirected to Home/Dashboard

**Step 4: First Experience**
- User lands on Home page with Dashboard tab
- Can explore features from sidebar
- Recommended first action: Upload resume in Account Settings (for Pro/Elite users)

### Core User Journeys

#### Journey 1: Finding and Contacting Professionals

**Flow:**
1. User navigates to **Contact Search** (`/contact-search`)
2. Enters search criteria:
   - Job title (e.g., "Investment Banking Analyst")
   - Company (e.g., "Goldman Sachs")
   - Location (e.g., "New York, NY")
   - Batch size (1-15 contacts, depends on tier)
3. Clicks "Search"
4. System:
   - Calls People Data Labs API to find matching professionals
   - Verifies email addresses
   - Scores and ranks candidates
   - Returns top matches
5. User reviews contacts
6. User clicks "Generate Emails"
7. System:
   - Uses OpenAI to generate personalized emails for each contact
   - Creates Gmail drafts with resume attached (if available)
   - Saves drafts to user's Gmail account
8. User opens Gmail, reviews drafts, personalizes if needed, and sends

**Credit Cost:** 15 credits per contact

**Tier Differences:**
- **Free:** Up to 3 contacts per search, basic email generation
- **Pro:** Up to 8 contacts per search, resume-matched personalized emails
- **Elite:** Up to 15 contacts per search, all Pro features

#### Journey 2: Preparing for Meeting

**Flow:**
1. User navigates to **Meeting Prep** (`/meeting-prep`)
2. User pastes LinkedIn URL of person they're meeting
3. Clicks "Generate Prep"
4. System processes in background (1-2 minutes):
   - Enriches LinkedIn profile via People Data Labs
   - Generates similarity summary (shared university, career path, etc.)
   - Generates 8 personalized questions
   - Fetches recent company news via SERP
   - Creates industry summary
   - Generates PDF
5. User sees prep materials:
   - Contact information
   - Similarity summary
   - Suggested questions
   - Company news
   - Industry insights
6. User downloads PDF for reference

**Credit Cost:** 15 credits per prep

**Tier Limits:**
- **Free:** 3 preps (lifetime, not monthly)
- **Pro:** 10 preps per month
- **Elite:** Unlimited

#### Journey 3: Preparing for Interview

**Flow:**
1. User navigates to **Interview Prep** (`/interview-prep`)
2. User pastes job posting URL or enters job details manually
3. Clicks "Generate Prep"
4. System processes in background (2-3 minutes):
   - Parses job posting to extract details
   - Scrapes Reddit for real interview experiences
   - Processes content with OpenAI
   - Generates comprehensive PDF guide
5. User sees interview prep with:
   - Interview process stages
   - Common questions (behavioral, technical, role-specific)
   - Real interview experiences
   - Success tips and red flags
   - Day-of-interview logistics
   - Compensation insights
6. User downloads PDF

**Credit Cost:** 25 credits per prep

**Tier Limits:**
- **Free:** 2 preps (lifetime, not monthly)
- **Pro:** 5 preps per month
- **Elite:** Unlimited

#### Journey 4: Job Application with Application Lab

**Flow:**
1. User navigates to **Application Lab** (`/application-lab`)
2. User pastes job posting URL or description
3. Clicks "Analyze"
4. System:
   - Fetches full job description
   - Analyzes resume against job requirements
   - Generates fit score (0-100)
   - Matches requirements to resume content
   - Suggests resume edits
   - Generates talking points and keywords
5. User reviews:
   - Overall fit score
   - Requirement-by-requirement breakdown
   - Suggested resume edits (with before/after)
   - Missing keywords
6. User can:
   - Apply resume edits
   - Generate custom cover letter
   - View pitch and talking points

**Credit Cost:** Varies (analysis and generation use credits)

**Tier Access:**
- **Free:** Limited access
- **Pro:** Full access
- **Elite:** Full access with priority

#### Journey 5: Finding Companies (Firm Search)

**Flow:**
1. User navigates to **Firm Search** (`/firm-search`)
2. User enters natural language query (e.g., "Investment banks in NYC focused on healthcare M&A")
3. Selects batch size (how many firms to return)
4. Clicks "Search"
5. System:
   - Uses People Data Labs to search companies
   - Filters by industry, location, size
   - Returns matching firms
6. User reviews firms:
   - Company name, industry, location
   - Size and description
   - Can save to saved firms list
7. User can then search for contacts at saved firms

**Credit Cost:** 5 credits per firm

**Tier Access:**
- **Free:** Blocked (Pro+ feature)
- **Pro:** Full access
- **Elite:** Full access

#### Journey 6: Job Board and Resume Optimization

**Flow:**
1. User navigates to **Job Board** (`/job-board`)
2. System shows personalized job listings based on user profile
3. User can:
   - Browse jobs in "Jobs" tab
   - Filter by job type, location, company
   - Save jobs for later
4. User clicks on a job
5. User can:
   - **Optimize Resume:** AI analyzes resume against job, suggests improvements
   - **Generate Cover Letter:** AI creates personalized cover letter
   - **Find Recruiter:** Searches for recruiters at that company
6. User reviews optimized resume or cover letter
7. User downloads or applies changes

**Credit Cost:**
- Resume optimization: 10 credits
- Cover letter: 10 credits
- Recruiter search: 15 credits

#### Journey 7: Interacting with Scout

**Flow:**
1. User sees Scout chat bubble on various pages
2. User clicks to open Scout
3. User asks question (e.g., "How do I find contacts?")
4. Scout:
   - Understands intent
   - Provides helpful answer
   - Can navigate user to relevant page
   - Can auto-populate form fields (if applicable)
5. User follows Scout's guidance

**Credit Cost:** Free (no credits charged for Scout interactions)

**Scout Capabilities:**
- Answers questions about features
- Helps navigate to pages
- Explains how features work
- Troubleshoots common issues
- Provides step-by-step guidance
- Can parse job URLs and auto-fill forms
- Can search for jobs based on natural language

---

## 3. Feature Documentation

### Contact Search

**What it does:**
Finds professionals at companies based on job title, company, and location. Automatically generates personalized outreach emails using AI.

**How it works:**
1. User enters search criteria (job title, company, location)
2. System queries People Data Labs API
3. PDL returns matching professionals
4. System verifies email addresses
5. System scores and ranks candidates
6. User selects contacts
7. System generates personalized emails using OpenAI
8. Emails saved as Gmail drafts

**Search Filters:**
- Job title (required)
- Company (optional)
- Location (optional)
- Batch size (1-15, depends on tier)
- College alumni filter (Pro+)

**Data Fields Returned:**
- Name (first, last)
- Email (verified)
- Job title
- Company
- Location
- LinkedIn URL
- Education (university, degree)
- Experience summary

**People Data Labs Integration:**
- Uses PDL `/person/search` endpoint
- Progressive query relaxation if no results
- Email verification via Hunter.io or pattern generation
- Alumni filtering happens post-fetch (not in PDL query)

**Search Limits:**
- **Free:** 3 contacts per search
- **Pro:** 8 contacts per search
- **Elite:** 15 contacts per search

**Credit Consumption:**
- 15 credits per contact found
- Deducted when contacts are returned (not when search is initiated)

**Email Generation:**
- Uses OpenAI GPT-4o or GPT-4o-mini
- Personalized based on:
  - Contact's background
  - User's resume (Pro+)
  - User's profile and career interests
  - Job fit context (if from Application Lab)
- Multiple email styles (direct, warm, enthusiastic, brief, story-driven)
- 60-90 words, natural tone
- Includes resume attachment (if available)

### Saved Contacts (Contact Directory)

**How contacts are saved:**
- Automatically saved when user searches
- Can manually save from search results
- Stored in Firestore: `users/{uid}/contacts`
- Also stored in SQLite for legacy support

**Organization Features:**
- Contact status tracking (Not Contacted, Contacted, Replied, etc.)
- First contact date
- Last contact date
- Search and filter by company, location, status
- Export to CSV (Pro+)

**Actions Available:**
- View contact details
- Update status
- Delete contact
- Export contacts (Pro+)
- Generate new email for contact
- View email history

**Export:**
- CSV export (Pro+ only)
- Includes: name, email, company, title, location, status, dates

### Email Generation

**AI Model:**
- Primary: OpenAI GPT-4o
- Fallback: GPT-4o-mini
- Temperature: 0.7-0.8 for natural variation

**User Inputs:**
- Contact information (from search)
- User's resume (Pro+, optional)
- User profile (university, major, career interests)
- Job fit context (optional, from Application Lab)

**Email Templates/Types:**
- **Direct Confident:** Professional, assertive, gets to the point
- **Warm Personable:** Friendly, conversational, builds rapport
- **Enthusiastic Specific:** High energy, very specific about why they're excited
- **Brief Respectful:** Short, respects recruiter's time, punchy
- **Story Driven:** Opens with a hook, tells a mini narrative

**Customization:**
- Users can edit generated emails before sending
- Emails saved as Gmail drafts (not sent automatically)
- Users review and send manually

**Email History:**
- Stored in Firestore: `users/{uid}/emails`
- Tracked in Outbox tab on Home page
- Shows: sent date, recipient, subject, reply status

### Gmail Integration

**OAuth Connection:**
1. User clicks "Connect Gmail" in Account Settings
2. Redirected to Google OAuth consent screen
3. User grants permissions:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.modify`
4. OAuth tokens saved to Firestore: `users/{uid}/gmail_credentials`
5. Connection status shown in Account Settings

**How Emails are Sent:**
- Emails are NOT sent automatically
- System creates Gmail drafts
- User opens Gmail, reviews draft, sends manually
- Drafts include:
  - Personalized subject line
  - Email body
  - Resume attachment (if available)

**Email Tracking:**
- Sent emails tracked in Outbox
- System can check for replies (via Gmail API)
- Reply status shown in Outbox
- Can regenerate reply suggestions

**Disconnecting Gmail:**
- User goes to Account Settings
- Clicks "Disconnect Gmail"
- OAuth tokens removed from Firestore
- User can reconnect anytime

**Fallback:**
- If user's Gmail not connected, system falls back to shared Gmail account (if available)
- User should connect their own Gmail for best experience

### Meeting Prep

**What it generates:**
- One-page PDF with:
  - Contact information
  - Similarity summary (shared university, career path, etc.)
  - 8 personalized questions
  - Recent company news (3-5 items)
  - Industry summary
  - Hometown (if inferred)

**Inputs Required:**
- LinkedIn URL of person you're meeting
- User's resume (optional, for similarity analysis)
- User's profile (university, major, etc.)

**PDF Structure:**
1. Header: Contact name, title, company
2. Contact info: Email, LinkedIn, location
3. Similarity summary: 45-60 word paragraph
4. Questions: 8 personalized questions
5. Company news: Recent developments
6. Industry insights: Industry summary

**Research Sources:**
- People Data Labs: Contact enrichment
- SERP API: Company news search
- OpenAI: Similarity analysis and question generation

**Processing Time:**
- 1-2 minutes (background processing)
- Status updates shown to user
- PDF downloadable when complete

**Credit Cost:** 15 credits per prep

**Tier Limits:**
- **Free:** 3 preps (lifetime)
- **Pro:** 10 preps per month
- **Elite:** Unlimited

### Interview Prep

**What it generates:**
- 7-8 page PDF guide with:
  - Job overview and details
  - Interview process stages
  - Common questions (behavioral, technical, role-specific)
  - Real interview experiences from Reddit
  - Success tips and red flags
  - Day-of-interview logistics
  - Compensation insights
  - After-interview guidance

**Inputs Required:**
- Job posting URL (preferred) OR
- Manual entry: job title, company, location, description

**Question Generation:**
- Behavioral questions (8-10)
- Technical questions (role-specific)
- Skill-specific questions
- Company-specific questions
- Real questions from Reddit
- Role-specific sections (case interviews for consulting, coding for SWE, etc.)

**Practice/Mock Interview:**
- No built-in practice functionality
- Provides questions and tips for self-practice
- Suggests external resources (PrepLounge for consulting, LeetCode for SWE, etc.)

**Research Sources:**
- Job posting URL parsing (SERP + GPT)
- Reddit API: Real interview experiences
- OpenAI: Content processing and insights

**Processing Time:**
- 2-3 minutes (background processing)
- Status updates: parsing → scraping → processing → generating PDF

**Credit Cost:** 25 credits per prep

**Tier Limits:**
- **Free:** 2 preps (lifetime)
- **Pro:** 5 preps per month
- **Elite:** Unlimited

### Scout (AI Assistant)

**What Scout can help with:**
- Understanding features and how to use them
- Navigating to the right pages
- Troubleshooting common issues
- Learning about credits and pricing
- Parsing job URLs and auto-filling forms
- Finding jobs based on natural language queries
- Answering questions about companies, roles, interview processes

**Capabilities:**
- Conversational Q&A
- Page navigation
- Form auto-population
- Job URL parsing
- Job search assistance
- Feature explanations
- Step-by-step guidance

**Limitations:**
- Cannot perform actions that cost credits (only guides user)
- Cannot access user's private data beyond what's in context
- Cannot modify user settings directly
- Responses should complete within 30-60 seconds

**How Scout accesses user context:**
- Current page/route
- User tier and credits
- User name
- Conversation history (last 10 messages)

**Conversation History:**
- Maintained in frontend (not persisted to database)
- Last 10 messages kept for context
- Resets when user closes Scout

**Where Scout appears:**
- Floating chat bubble on multiple pages
- Home page (Professional Search form)
- Firm Search page (Firm Assistant)
- Can be opened from sidebar

### Job Board

**What it does:**
- Shows personalized job listings based on user profile
- Resume optimization for specific jobs
- Cover letter generation
- Recruiter search

**Job Listings:**
- Fetched from SerpAPI Google Jobs
- Filtered by user preferences (job types, industries, locations)
- Scored and ranked by match quality
- Cached in Firestore (6-hour TTL)

**Resume Optimization:**
- Analyzes resume against job description
- Provides ATS score
- Suggests improvements
- Can generate optimized version

**Cover Letter Generation:**
- AI-generated personalized cover letter
- Addresses specific job requirements
- Company-specific content
- 3-4 paragraphs, professional tone

**Recruiter Search:**
- Finds recruiters at target company
- Generates outreach emails
- Saves to Gmail drafts

**Credit Costs:**
- Resume optimization: 10 credits
- Cover letter: 10 credits
- Recruiter search: 15 credits

### Resume Workshop

**What it does:**
- Score resume for general quality
- Fix resume with general improvements
- Tailor resume for specific job postings
- Apply individual recommendations
- Save tailored resumes to library
- Replace main resume with improved versions

**Score Resume:**
- Provides score (0-100)
- Score categories: Impact & Results, Clarity & Structure, Keywords/ATS, Professional Presentation
- Improvement suggestions per category

**Fix Resume:**
- General improvements (formatting, clarity, impact)
- Not job-specific
- Generates improved PDF

**Tailor Resume:**
- Job-specific optimization
- Requires job URL or job details
- Provides recommendations with before/after
- Can apply recommendations individually

**Credit Costs:**
- Score: 5 credits
- Fix: 10 credits
- Tailor: 5 credits
- Apply recommendation: No additional cost

### Application Lab

**What it does:**
- Deep job fit analysis
- Requirement-by-requirement matching
- Resume edit suggestions
- Custom cover letter generation

**Inputs:**
- Job posting URL (preferred) OR job description
- User's resume (required)

**Outputs:**
- Overall fit score (0-100)
- Requirement matches (met/partially met/not met)
- Resume edits (specific before/after suggestions)
- Missing keywords
- Pitch and talking points
- Cover letter (optional)

**Credit Cost:** Varies (analysis and generation use credits)

**Tier Access:**
- **Free:** Limited
- **Pro:** Full access
- **Elite:** Full access

### Firm Search

**What it does:**
- Discovers companies matching criteria
- Natural language search
- Filter by industry, location, size

**How it works:**
1. User enters natural language query
2. System uses People Data Labs to search companies
3. Filters by industry, location, size
4. Returns matching firms
5. User can save firms to list

**Credit Cost:** 5 credits per firm

**Tier Access:**
- **Free:** Blocked (Pro+ feature)
- **Pro:** Full access
- **Elite:** Full access

---

## 4. Subscription & Credits System

### Subscription Tiers

#### Free Tier
- **Price:** $0/month
- **Credits:** 300/month (resets monthly)
- **Max Credits:** 300
- **Contact Search:** Up to 3 contacts per search
- **Features:**
  - Basic email generation
  - Meeting Prep: 3 preps (lifetime)
  - Interview Prep: 2 preps (lifetime)
  - Gmail integration
  - Contact directory
- **Limitations:**
  - No resume-matched emails
  - No Firm Search
  - No exports (CSV, bulk drafts)
  - Limited Interview Prep access
  - Basic personalization

#### Pro Tier
- **Price:** $9.99/month (student pricing)
- **Credits:** 1,500/month (resets monthly)
- **Max Credits:** 1,500
- **Contact Search:** Up to 8 contacts per search
- **Features:**
  - Resume-matched personalized emails
  - Full Firm Search access
  - Meeting Prep: 10/month
  - Interview Prep: 5/month
  - Smart filters (school, major, career)
  - Bulk drafting
  - CSV exports
  - Priority support
- **Limitations:**
  - No unlimited preps
  - No Application Lab priority
  - No advanced analytics

#### Elite Tier
- **Price:** $34.99/month
- **Credits:** 3,000/month (resets monthly)
- **Max Credits:** 3,000
- **Contact Search:** Up to 15 contacts per search
- **Features:**
  - All Pro features
  - Unlimited Meeting Prep
  - Unlimited Interview Prep
  - Application Lab access
  - Advanced analytics
  - Priority queue for contact generation
  - Personalized templates
  - Weekly firm insights
  - Early access to new AI tools

### Credits System

**What actions consume credits:**
- Contact Search: 15 credits per contact
- Firm Search: 5 credits per firm
- Meeting Prep: 15 credits per prep
- Interview Prep: 25 credits per prep
- Resume Optimization: 10 credits per optimization
- Cover Letter: 10 credits per letter
- Recruiter Search: 15 credits per search
- Resume Scoring: 5 credits
- Resume Fix: 10 credits
- Resume Tailor: 5 credits

**How credits refresh:**
- Credits reset monthly based on subscription date
- Reset happens on the same day of month as subscription started
- Unused credits do NOT roll over
- Credits added immediately upon subscription upgrade

**What happens when credits run out:**
- User sees "Insufficient credits" message
- Actions that require credits are blocked
- User can upgrade plan to get more credits
- User can wait for monthly reset

**Stripe Integration:**
- Payment processing via Stripe
- Subscriptions managed through Stripe
- Upgrade/downgrade handled via Stripe Customer Portal
- Webhooks update user tier in Firestore
- Refunds handled through Stripe (manual process)

---

## 5. FAQ Knowledge Base

### Getting Started

**Q: How do I sign up for Offerloop?**
A: Click "Sign In" or "Get Started" on the landing page, then choose Google Sign-In. You'll be guided through onboarding to set up your profile.

**Q: Is Offerloop free?**
A: Yes! We offer a Free tier with 300 credits per month. You can upgrade to Pro ($9.99/month) or Elite ($34.99/month) for more credits and features.

**Q: Who is Offerloop for?**
A: Offerloop is built for students and young professionals who want to network more effectively and find opportunities. It's especially popular with students at universities like USC.

### Contact Search

**Q: How do I find professionals to network with?**
A: Go to Contact Search from the sidebar, enter a job title (e.g., "Investment Banking Analyst"), company name, and location. Click Search to find matching professionals.

**Q: What search filters can I use?**
A: You can filter by job title (required), company (optional), location (optional), and batch size. Pro+ users can also filter by college alumni.

**Q: Why am I not finding the person I'm looking for?**
A: Try broader job titles (e.g., "Analyst" instead of "Investment Banking Analyst"), check spelling of company name, or try different locations. Some smaller companies may have limited data available.

**Q: How accurate is the contact information?**
A: We use People Data Labs, a professional data provider, and verify email addresses. However, contact information can change, so we recommend double-checking important contacts.

### Email Features

**Q: How do I generate a networking email?**
A: After finding contacts in Contact Search, click "Generate Emails". The AI will create personalized emails for each contact, which are saved to your Gmail drafts.

**Q: Can I edit the AI-generated emails?**
A: Yes! Emails are saved as Gmail drafts, so you can review and edit them before sending. We recommend personalizing them further if needed.

**Q: How do I connect my Gmail?**
A: Go to Account Settings, find the Gmail section, and click "Connect Gmail". Sign in with your Google account and grant the required permissions.

**Q: Are my emails tracked?**
A: Yes, sent emails are tracked in the Outbox tab on your Home page. You can see reply status and manage email threads there.

### Credits & Billing

**Q: How do credits work?**
A: Credits are your currency for using Offerloop features. Each action costs a specific number of credits (e.g., 15 credits per contact). Credits reset monthly based on your subscription date.

**Q: What happens when I run out of credits?**
A: You'll see an "Insufficient credits" message and actions requiring credits will be blocked. You can upgrade your plan to get more credits or wait for the monthly reset.

**Q: How do I upgrade my plan?**
A: Go to Pricing from the sidebar, compare plans, and click "Upgrade" on your chosen plan. Complete payment through Stripe and credits are added immediately.

**Q: Can I get a refund?**
A: Refunds are handled on a case-by-case basis through Stripe. Contact support if you need assistance with a refund.

### Meeting Prep

**Q: What is Meeting Prep?**
A: Meeting Prep generates comprehensive preparation materials for networking conversations. It includes talking points, questions to ask, and research on the person and their company.

**Q: How do I prepare for a networking call?**
A: Go to Meeting Prep, paste the LinkedIn URL of the person you're meeting, and click Generate Prep. Wait 1-2 minutes for the AI to research and compile materials, then download the PDF.

### Interview Prep

**Q: How does Interview Prep work?**
A: Go to Interview Prep, paste a job posting URL, and click Generate Prep. The system scrapes Reddit and other sources for real interview experiences, then generates a comprehensive PDF guide.

**Q: What types of interviews can I prepare for?**
A: Interview Prep works for any job posting. It provides role-specific questions (case interviews for consulting, coding for software engineering, etc.) and general behavioral questions.

### Account & Privacy

**Q: How do I delete my account?**
A: Contact support to delete your account. This will remove all your data from our systems.

**Q: What data does Offerloop store?**
A: We store your profile information, resume, contacts, email history, and usage data. All data is stored securely in Firebase and is only accessible to you.

**Q: Is my Gmail data secure?**
A: Yes, we only request permissions to create drafts and read email threads you've sent through Offerloop. We never access your full inbox or other emails. OAuth tokens are encrypted and stored securely.

---

## 6. Scout Training Data (Q&A Pairs)

### Feature Explanations (15 examples)

**USER:** What is Contact Search?
**SCOUT:** Contact Search helps you find professionals at companies to network with. Enter a job title, company, and location, and we'll find matching professionals and generate personalized outreach emails. It costs 15 credits per contact. Free users can find up to 3 contacts per search, Pro users up to 8, and Elite users up to 15.

**USER:** How does Meeting Prep work?
**SCOUT:** Meeting Prep generates preparation materials for networking conversations. Paste the LinkedIn URL of the person you're meeting, and we'll create a PDF with talking points, questions to ask, and research on their company. It takes 1-2 minutes to generate and costs 15 credits per prep.

**USER:** What's the difference between Free and Pro?
**SCOUT:** Free tier gives you 300 credits/month and up to 3 contacts per search with basic email generation. Pro ($9.99/month) gives you 1,500 credits, up to 8 contacts per search, resume-matched personalized emails, full Firm Search access, and more Meeting/Interview Prep access. Would you like me to show you the Pricing page to compare all plans?

**USER:** How do I use Firm Search?
**SCOUT:** Firm Search helps you discover companies matching your criteria. Enter a natural language query like "Investment banks in NYC focused on healthcare M&A", select how many firms you want, and click Search. It costs 5 credits per firm and is available for Pro+ users. I can help you navigate there if you'd like!

**USER:** What is Application Lab?
**SCOUT:** Application Lab provides deep job fit analysis. Paste a job posting URL, and we'll analyze how well you match the job, provide requirement-by-requirement breakdown, suggest resume edits, and generate a custom cover letter. It's available for Pro+ users and uses credits for analysis and generation.

**USER:** How does email generation work?
**SCOUT:** After you find contacts in Contact Search, click "Generate Emails" and our AI creates personalized emails for each contact. The emails are saved as Gmail drafts in your account, so you can review and edit them before sending. Pro+ users get resume-matched personalization for better emails.

**USER:** What is Interview Prep?
**SCOUT:** Interview Prep generates comprehensive guides for job interviews. Paste a job posting URL, and we'll scrape Reddit and other sources for real interview experiences, then create a PDF with common questions, success tips, and company insights. It takes 2-3 minutes and costs 25 credits per prep.

**USER:** How do I save contacts?
**SCOUT:** Contacts are automatically saved when you search for them. You can also manually save contacts from search results. All saved contacts are available in your Contact Directory, where you can view, update status, and export them (Pro+ users can export to CSV).

**USER:** What is the Job Board?
**SCOUT:** The Job Board shows personalized job listings based on your profile. You can browse jobs, optimize your resume for specific positions, generate cover letters, and find recruiters. It uses SerpAPI to fetch real job listings and caches them for faster loading.

**USER:** How does Resume Workshop work?
**SCOUT:** Resume Workshop helps you improve your resume in three ways: Score (general quality assessment), Fix (general improvements), and Tailor (job-specific optimization). You can apply individual recommendations and save tailored resumes to your library. Would you like me to navigate you there?

**USER:** What can Scout help me with?
**SCOUT:** I can help you understand features, navigate to pages, troubleshoot issues, learn about credits and pricing, parse job URLs, search for jobs, and answer questions about Offerloop. I'm here to make your experience smoother! What would you like help with?

**USER:** How do I find recruiters?
**SCOUT:** Go to the Job Board, find a job listing you're interested in, and click "Find Recruiter". We'll search for recruiters at that company and generate outreach emails saved to your Gmail drafts. It costs 15 credits per search.

**USER:** What is the Outbox?
**SCOUT:** The Outbox (on your Home page) shows all your email threads. You can see sent emails, track reply status, regenerate reply suggestions, and open emails in Gmail. It helps you manage your networking outreach in one place.

**USER:** How does Gmail integration work?
**SCOUT:** Connect your Gmail in Account Settings to automatically save email drafts. When you generate emails in Contact Search, they're saved directly to your Gmail drafts folder. You review and send them manually. We only request permissions to create drafts and read threads you've sent through Offerloop.

**USER:** What is the Calendar feature?
**SCOUT:** The Calendar (on your Home page) shows your personalized recruiting timeline with key dates and milestones. It's AI-generated based on your goals and helps you plan your recruiting process. You can customize it based on your timeline.

### How-to Guidance (15 examples)

**USER:** How do I find contacts to network with?
**SCOUT:** Here's how: 1) Go to Contact Search from the sidebar, 2) Enter job title, company, and location, 3) Select batch size (1-15 depending on your plan), 4) Click Search, 5) Review contacts and click "Generate Emails", 6) Emails are saved to Gmail drafts - open Gmail to review and send. Make sure Gmail is connected first in Account Settings!

**USER:** How do I connect my Gmail?
**SCOUT:** 1) Click Settings in the sidebar (or your profile), 2) Go to Account Settings, 3) Find the Gmail section, 4) Click "Connect Gmail", 5) Sign in with your Google account, 6) Grant permissions for draft access. Once connected, emails will automatically save to your Gmail drafts!

**USER:** How do I get more credits?
**SCOUT:** Go to Pricing from the sidebar, compare Free, Pro ($9.99/month), and Elite ($34.99/month) plans, click "Upgrade" on your chosen plan, and complete payment through Stripe. Credits are added immediately and reset monthly based on your subscription date.

**USER:** How do I prepare for a meeting?
**SCOUT:** 1) Go to Meeting Prep, 2) Find the LinkedIn URL of the person you're meeting, 3) Paste the URL and click Generate, 4) Wait 1-2 minutes for research to complete, 5) Review the prep materials (similarity points, questions, company news), 6) Download PDF to reference during the meeting. It costs 15 credits per prep.

**USER:** How do I prepare for an interview?
**SCOUT:** 1) Go to Interview Prep, 2) Get the job posting URL, 3) Paste it and click Generate Prep, 4) Wait 2-3 minutes for Reddit and online research, 5) Review interview process and common questions, 6) Study success tips and red flags, 7) Download PDF for offline review. It costs 25 credits per prep.

**USER:** How do I optimize my resume for a job?
**SCOUT:** 1) Go to Job Board and find a job you like, 2) Click "Optimize Resume" on that job, 3) AI analyzes your resume against the job, 4) Review ATS score and suggestions, 5) Apply recommended changes, 6) Download the optimized version. It costs 10 credits per optimization.

**USER:** How do I generate a cover letter?
**SCOUT:** You can generate cover letters in two ways: 1) In Job Board, click "Generate Cover Letter" on a job listing, or 2) In Application Lab, after analyzing a job, click "Generate Cover Letter". The AI creates a personalized cover letter addressing specific job requirements. It costs 10 credits per letter.

**USER:** How do I use Application Lab?
**SCOUT:** 1) Go to Application Lab, 2) Paste a job posting URL or description, 3) Click Analyze, 4) Review your fit score and requirement matches, 5) Apply suggested resume edits, 6) Generate a custom cover letter if needed. This is best for jobs you're serious about!

**USER:** How do I find companies to apply to?
**SCOUT:** Use Firm Search (Pro+ feature): 1) Go to Firm Search, 2) Enter a natural language query (e.g., "Investment banks in NYC"), 3) Select batch size, 4) Click Search, 5) Review matching firms and save interesting ones, 6) Then search for contacts at those firms. It costs 5 credits per firm.

**USER:** How do I upload my resume?
**SCOUT:** 1) Go to Account Settings, 2) Find the Resume section, 3) Click "Upload Resume", 4) Select your PDF resume file, 5) Wait for parsing to complete. Your resume is now used for better email personalization (Pro+) and Meeting Prep similarity analysis.

**USER:** How do I check my email replies?
**SCOUT:** Go to your Home page and click the "Outbox" tab. You'll see all your email threads with reply status. If someone replied, you can see their message and regenerate a reply suggestion. You can also open emails directly in Gmail from there.

**USER:** How do I save a job for later?
**SCOUT:** In the Job Board, when viewing a job listing, click the "Save" button. Saved jobs are available in the "Saved Jobs" tab. You can come back to them later to optimize your resume, generate a cover letter, or find recruiters.

**USER:** How do I export my contacts?
**SCOUT:** Go to Contact Directory, and if you're on Pro+ plan, you'll see an "Export" button. Click it to download your contacts as a CSV file. Free users don't have access to exports - upgrade to Pro to unlock this feature.

**USER:** How do I update my profile?
**SCOUT:** Go to Account Settings from the sidebar. You can update your profile information, career interests, location preferences, and more. These updates help personalize your experience, especially for job recommendations and email generation.

**USER:** How do I see my recruiting timeline?
**SCOUT:** Go to your Home page and click the "Calendar" tab. You'll see your personalized recruiting timeline with key dates and milestones. It's AI-generated based on your goals and helps you plan your recruiting process.

### Troubleshooting (10 examples)

**USER:** My emails aren't saving to Gmail drafts
**SCOUT:** This usually means Gmail isn't connected. Go to Account Settings, find the Gmail section, and click "Connect Gmail". Sign in with Google and grant permissions. Once connected, try your search again - emails should save to drafts automatically.

**USER:** I'm out of credits, what do I do?
**SCOUT:** You have a few options: 1) Check your credits in the sidebar to see when they reset (monthly), 2) Go to Pricing to upgrade your plan (Pro gives 1,500 credits, Elite gives 3,000), 3) Wait for your monthly reset. Credits don't roll over, so use them before they reset!

**USER:** I'm not finding any contacts
**SCOUT:** Try these tips: 1) Use broader job titles (e.g., "Analyst" instead of "Investment Banking Analyst"), 2) Check spelling of company name, 3) Try different locations or remove location filter, 4) Some smaller companies may have limited data. If still no results, the role might be too specific - try a more general title.

**USER:** My emails seem generic
**SCOUT:** Make sure you've uploaded your resume in Account Settings - Pro+ users get resume-matched personalization. Also complete your profile with career interests and university info. The more information you provide, the better the personalization. Free users get basic emails, so consider upgrading to Pro for resume-matched emails.

**USER:** Meeting Prep is taking too long
**SCOUT:** Meeting Prep usually takes 1-2 minutes to generate. If it's been longer than 5 minutes, try refreshing and generating again. Make sure the LinkedIn URL is accessible and correct. If it keeps timing out, the profile might be private or the URL might be invalid.

**USER:** Interview Prep failed to generate
**SCOUT:** Interview Prep can take 2-3 minutes and sometimes fails if: 1) The job posting URL is invalid or inaccessible, 2) Reddit scraping finds no results, 3) The job description is too short. Try pasting the job description manually instead of using the URL, or try a different job posting.

**USER:** My subscription didn't update
**SCOUT:** If you upgraded but your plan isn't showing: 1) Refresh the page, 2) Go to Pricing and click "Manage Subscription" to check Stripe, 3) Make sure payment went through, 4) Check if credits were added (they should be immediate). If still not working, contact support.

**USER:** I can't access Firm Search
**SCOUT:** Firm Search is a Pro+ feature, so Free users don't have access. Upgrade to Pro ($9.99/month) or Elite ($34.99/month) to unlock Firm Search. Pro also gives you more credits (1,500 vs 300) and other premium features.

**USER:** My resume won't upload
**SCOUT:** Make sure your resume is: 1) A PDF file (not Word or other formats), 2) Under 10MB, 3) Not password-protected, 4) Properly formatted. If it still fails, try a different PDF or contact support. The resume parser works best with clean, well-formatted PDFs.

**USER:** Gmail connection keeps failing
**SCOUT:** Try these steps: 1) Disconnect Gmail in Account Settings, 2) Clear browser cache and cookies, 3) Reconnect Gmail, 4) Make sure you're signing in with the correct Google account, 5) Grant all requested permissions. If it still fails, try a different browser or contact support.

### Account/Billing Questions (5 examples)

**USER:** How do I cancel my subscription?
**SCOUT:** Go to Pricing and click "Manage Subscription". This opens Stripe's customer portal where you can cancel your subscription. Your plan will remain active until the end of your billing period, then revert to Free tier.

**USER:** When do my credits reset?
**SCOUT:** Credits reset monthly on the same day you started your subscription. For example, if you subscribed on the 15th, credits reset on the 15th of each month. You can see your reset date in the sidebar next to your credit balance. Unused credits don't roll over.

**USER:** Can I get a refund?
**SCOUT:** Refunds are handled on a case-by-case basis. Contact support with your request, and we'll review it. Refunds are processed through Stripe, and the timeline depends on your payment method.

**USER:** What happens if my payment fails?
**SCOUT:** If payment fails, Stripe will retry a few times. If it continues to fail, your subscription may be paused. Go to Pricing and click "Manage Subscription" to update your payment method in Stripe. Once payment succeeds, your subscription and credits will be restored.

**USER:** How do I change my plan?
**SCOUT:** Go to Pricing, compare plans, and click "Upgrade" or "Downgrade" on your desired plan. Complete payment through Stripe, and your new plan and credits will be active immediately. You can also manage your subscription through Stripe's customer portal.

### General Questions About Offerloop (5 examples)

**USER:** What makes Offerloop different?
**SCOUT:** Offerloop automates the tedious parts of networking - finding contacts, generating personalized emails, and preparing for conversations - so you can focus on building real connections. We use AI to personalize everything based on your resume and profile, making your outreach more effective.

**USER:** Is my data secure?
**SCOUT:** Yes! We use Firebase (Google's secure platform) to store all data. Your Gmail connection uses OAuth, so we only access what you grant permission for (draft creation and reading threads you've sent). We never access your full inbox or other emails. All data is encrypted and only accessible to you.

**USER:** Can I use Offerloop on mobile?
**SCOUT:** Offerloop is a web application that works on mobile browsers, but it's optimized for desktop use. For the best experience, we recommend using it on a computer, especially for features like resume upload and email review.

**USER:** How accurate are the contact emails?
**SCOUT:** We use People Data Labs, a professional data provider, and verify email addresses through multiple methods. However, contact information can change, so we recommend double-checking important contacts, especially for high-stakes outreach.

**USER:** What if I need help?
**SCOUT:** I'm here to help! Ask me anything about Offerloop features, how to use them, or troubleshooting. You can also contact support through the app if you need additional assistance. Pro+ users get priority support.

---

## 7. Error States & Edge Cases

### User Runs Out of Credits

**What happens:**
- User sees "Insufficient credits" error message
- Actions requiring credits are blocked
- User can still browse features but cannot perform credit-consuming actions

**User options:**
- Upgrade plan to get more credits
- Wait for monthly credit reset
- Contact support (rare cases)

**Scout response:**
- Explain credit system
- Suggest upgrading plan
- Show when credits reset
- Navigate to Pricing page

### API Calls Fail

**Contact Search fails:**
- User sees error message
- Credits not deducted
- User can retry search
- If PDL API is down, suggest trying later

**Email Generation fails:**
- User sees error message
- Credits not deducted
- User can retry generation
- If OpenAI API is down, suggest trying later

**Gmail API fails:**
- User sees "Gmail service unavailable" message
- Suggests reconnecting Gmail
- Falls back to shared account if available

### Gmail Connection Expires

**What happens:**
- OAuth tokens expire (typically after 1 hour of inactivity)
- User sees "Gmail not connected" message
- System prompts to reconnect

**User action:**
- Go to Account Settings
- Click "Connect Gmail" again
- Re-authenticate with Google

### Search Returns No Results

**Contact Search:**
- User sees "No contacts found" message
- Suggests: broader job titles, check spelling, try different location
- System uses progressive query relaxation (tries multiple strategies)

**Firm Search:**
- User sees "No firms found" message
- Suggests: broader query, different keywords, remove filters

**Job Board:**
- User sees empty state
- Suggests: update preferences, try different filters, refresh

### Email Generation Fails

**What happens:**
- User sees error message
- Credits not deducted
- User can retry

**Common causes:**
- OpenAI API timeout
- Invalid contact data
- Resume parsing failed (for Pro+ users)

**User action:**
- Retry generation
- Check if resume is uploaded (for Pro+)
- Contact support if persistent

### User Exceeds Rate Limits

**What happens:**
- API returns rate limit error
- User sees "Too many requests" message
- Suggests waiting a few minutes

**User action:**
- Wait and retry
- Elite users have priority queue (faster processing)

### Payment Fails

**What happens:**
- Stripe payment fails
- Subscription not upgraded
- User remains on current tier
- Stripe retries payment automatically

**User action:**
- Go to Pricing → "Manage Subscription"
- Update payment method in Stripe
- Retry payment

### Resume Upload Fails

**What happens:**
- User sees error message
- Resume not saved

**Common causes:**
- File too large (>10MB)
- Not a PDF
- Password-protected PDF
- Corrupted file

**User action:**
- Check file format and size
- Try a different PDF
- Contact support if persistent

### Meeting Prep Fails

**What happens:**
- Status shows "failed"
- Credits not deducted (if failed early)
- User can retry

**Common causes:**
- Invalid LinkedIn URL
- Private LinkedIn profile
- PDL API failure
- Timeout during processing

**User action:**
- Check LinkedIn URL is correct and public
- Retry generation
- Contact support if persistent

### Interview Prep Fails

**What happens:**
- Status shows "failed" or "parsing_failed"
- Credits not deducted (if failed early)
- User can enter job details manually

**Common causes:**
- Invalid job URL
- Job posting not accessible
- Reddit scraping finds no results
- Timeout during processing

**User action:**
- Try pasting job description manually
- Try a different job posting URL
- Retry generation

---

## 8. Settings & Customization

### User Settings Available

**Profile Settings:**
- Name (first, last)
- Email (from Google account, read-only)
- Phone number
- Profile picture (from Google account)

**Academic Information:**
- University
- Degree
- Major
- Graduation month/year

**Location Preferences:**
- Country
- State
- City
- Preferred locations (multiple)

**Career Preferences:**
- Job types (Internship, Full-Time, etc.)
- Career interests (multiple)
- Target industries (multiple)

### Profile Information Editing

**Where to edit:**
- Account Settings page
- Onboarding flow (for new users)

**What can be edited:**
- All profile fields listed above
- Resume (upload/replace)
- Gmail connection (connect/disconnect)

**What cannot be edited:**
- Email (tied to Google account)
- User ID (Firebase UID)
- Subscription tier (managed through Stripe)

### Notification Preferences

**Current implementation:**
- No in-app notification system
- Email notifications not implemented
- Users check Outbox for email replies

**Future considerations:**
- Email reply notifications
- Credit reset reminders
- Feature announcements

### Account Deletion

**How it works:**
- Contact support to delete account
- All user data removed from Firestore
- Gmail OAuth tokens revoked
- Stripe subscription cancelled (if active)
- Contacts, emails, and preps deleted

**Data retention:**
- No data retained after deletion
- Backup data may exist for up to 30 days (standard practice)

---

## Appendix: Quick Reference

### Credit Costs Summary
- Contact Search: 15 credits per contact
- Firm Search: 5 credits per firm
- Meeting Prep: 15 credits per prep
- Interview Prep: 25 credits per prep
- Resume Optimization: 10 credits
- Cover Letter: 10 credits
- Recruiter Search: 15 credits
- Resume Score: 5 credits
- Resume Fix: 10 credits
- Resume Tailor: 5 credits

### Tier Comparison
| Feature | Free | Pro | Elite |
|---------|------|-----|-------|
| Monthly Credits | 300 | 1,500 | 3,000 |
| Contacts/Search | 3 | 8 | 15 |
| Meeting Prep | 3 (lifetime) | 10/month | Unlimited |
| Interview Prep | 2 (lifetime) | 5/month | Unlimited |
| Firm Search | ❌ | ✅ | ✅ |
| Resume-Matched Emails | ❌ | ✅ | ✅ |
| Exports | ❌ | ✅ | ✅ |
| Application Lab | Limited | ✅ | ✅ |
| Price | $0 | $9.99 | $34.99 |

### Page Routes
- `/home` - Dashboard, Outbox, Calendar
- `/contact-search` - Contact Search
- `/firm-search` - Firm Search
- `/job-board` - Job Board
- `/meeting-prep` - Meeting Prep
- `/interview-prep` - Interview Prep
- `/application-lab` - Application Lab
- `/pricing` - Pricing
- `/account-settings` - Account Settings
- `/contact-directory` - Contact Directory
- `/meeting-library` - Meeting Library

---

**End of Knowledge Base**

This document is maintained for Scout AI Assistant training. Last updated from comprehensive codebase audit.

