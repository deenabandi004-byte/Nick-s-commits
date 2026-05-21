# Offerloop Email Generation System - Current State

## 1. Entry Points

### Primary Entry Points

#### `/api/emails/generate-and-draft` (POST)
- **Location**: `backend/app/routes/emails.py:64`
- **Function**: `generate_and_draft()`
- **Trigger**: Frontend calls this endpoint when user wants to generate emails and create Gmail drafts
- **Input Parameters**:
  - `contacts`: List of contact dictionaries
  - `resumeText`: User's resume text (string)
  - `userProfile`: User profile dict (name, email, phone, linkedin, university, year, major)
  - `careerInterests`: Career interests string/array
  - `fitContext`: Optional job fit analysis context (job_title, company, score, pitch, talking_points, strengths, gaps, keywords)
  - `resumeUrl`: Optional resume URL for attachment
  - `resumeFileName`: Optional resume filename

#### `/api/free-run` (POST)
- **Location**: `backend/app/routes/runs.py:581`
- **Function**: `free_run()`
- **Trigger**: Free tier contact search with email generation
- **Calls**: `run_free_tier_enhanced_optimized()` → `batch_generate_emails()`

#### `/api/pro-run` (POST)
- **Location**: `backend/app/routes/runs.py:785`
- **Function**: `pro_run()`
- **Trigger**: Pro/Elite tier contact search with email generation
- **Calls**: `run_pro_tier_enhanced_final_with_text()` → `batch_generate_emails()`

### Secondary Entry Point (Recruiter Emails)

#### Recruiter Email Generator
- **Location**: `backend/app/services/recruiter_email_generator.py:48`
- **Function**: `generate_recruiter_emails()`
- **Trigger**: Internal call for recruiter-specific outreach (different from general networking)
- **Note**: Uses separate prompt system (see Section 2.2)

---

## 2. Email Body Generation

### 2.1 Primary Function: General Networking Emails

#### Function Details
- **Name**: `batch_generate_emails`
- **Location**: `backend/app/services/reply_generation.py:358`
- **Trigger**: Called by `/api/emails/generate-and-draft`, `/api/free-run`, `/api/pro-run`
- **Input Parameters**:
  - `contacts`: List of contact dictionaries (from PDL)
  - `resume_text`: User's resume text
  - `user_profile`: User profile dict
  - `career_interests`: Career interests
  - `fit_context`: Optional job fit analysis context

#### OpenAI Configuration
- **Model**: `gpt-4o-mini`
- **Temperature**: `0.9` (high for creativity and naturalness)
- **Max tokens**: `2500` (increased for more detailed emails)

#### System Prompt (EXACT TEXT)
```
You write professional, natural networking emails that feel familiar, thoughtful, and human. These emails should look like normal cold outreach - just done well. Do NOT try to be clever, bold, or overly insightful. Do NOT use marketing language or hype. Do NOT sound automated. The goal is simple: Make the email feel reasonable to receive and easy to reply to. Use only standard ASCII characters. CRITICAL: Always use proper grammar with correct apostrophes in contractions (I'm, I'd, couldn't, I've, you're, it's, that's, etc.). Never write 'Im', 'Id', 'couldnt', 'Ive', 'youre', 'thats' - always include the apostrophe.
```

#### User Prompt Template (EXACT TEXT)
```
You write professional, natural networking emails that feel familiar, thoughtful, and human.

These emails should look like normal cold outreach - just done well.

Do NOT try to be clever, bold, or overly insightful.
Do NOT use marketing language or hype.
Do NOT sound automated.

The goal is simple:
Make the email feel reasonable to receive and easy to reply to.

CRITICAL:
- Always use correct grammar and apostrophes (I'm, I'd, I've, you're, it's, that's).
- Never write incomplete sentences.
- Use only standard ASCII characters.

TASK:
Write {len(contacts)} personalized networking emails.
Each email must be unique and intentionally written for the specific recipient.

ABOUT THE SENDER:
- Name: {sender_name}
- University: {sender_university_short if sender_university_short else 'Not specified'}
- Major: {user_info.get('major', 'Not specified')}
- Year: {user_info.get('year', 'Not specified')}{resume_context}
{fit_context_section}
{outreach_type_guidance}

QUALITY BAR (SAFE-HUMAN):
Before writing each email, decide:
- Why is it reasonable for this person to receive this email?
- What single detail explains why the sender chose them?

Avoid:
- "I hope you're doing well"
- "Hope this finds you well"
- "I came across your profile"
- "My name is…"
- Generic praise ("impressed by your background")

Prefer:
- A clear, simple reason for reaching out
- One specific reference
- Plain, professional language

CONTACTS:
{chr(10).join(contact_contexts)}

ANCHOR PRIORITY RULE:
If multiple anchors are available, prioritize:
1) Career transition
2) Tenure / timing
3) Title (fallback)

Use exactly ONE anchor.
Never stack anchors.

CONNECTION USAGE RULES:
If the sender and recipient share a strong connection (same university or same company):
- Mention it naturally once, either in the subject OR first sentence (not both)

If the connection is weaker (industry, location):
- Reference it lightly, without overemphasis

If no connection exists:
- Lead with a simple reason tied to the recipient's role or experience

WRITING GUIDELINES:
1. Write like a thoughtful student or early-career professional
2. Keep the tone professional, natural, and calm
3. Use at most one personalized detail per email
4. Keep length between 60–90 words
5. Vary opening sentences across emails
6. Favor clarity over creativity
7. Avoid buzzwords, hype, or sales language

If targeted outreach:
- Reference the role or path naturally
- Ask one relevant, straightforward question

If general networking:
- Focus on their experience or decisions
- Ask one simple, genuine question

CALL TO ACTION:
End with ONE polite, low-pressure ask.
Examples:
- "Would you be open to a quick 10–15 minute chat?"
- "I'd appreciate hearing your perspective."
- "Would you be open to connecting briefly?"
Do not ask multiple questions at the end.
Do not sound like you are asking for a favor.

RESUME ATTACHMENT RULE:
Only include a resume mention if (a) outreach is targeted OR (b) a strong connection exists (same university or same company).
If included:
- Mention it once, near the end
- Use neutral language only: "I've attached my resume below for context." or "I've attached my resume below in case helpful."
- Do NOT ask them to review it and do NOT ask for feedback.
If no strong reason exists, do NOT mention a resume.

FINAL CHECK:
Before returning the email, ask:
"Does this sound like a normal, well-written cold email a real person would send?"
If it feels robotic, clever, or forced - rewrite it.

FORMATTING:
- Start with: "Hi [FirstName],"
- Use \n\n for paragraph breaks in JSON
- End with:
  "Best,\n[Sender Full Name]\n{sender_university_short} | Class of {user_info.get('year', '')}"
  (only include university/year if available)
- Do NOT mention attached resumes unless RESUME ATTACHMENT RULE says to include it
- NEVER write sentences like "I'm studying at ."

Return ONLY valid JSON:
{"0": {"subject": "...", "body": "..."}, "1": {"subject": "...", "body": "..."}, ...}
```

#### Variables Available

**User Data** (extracted from resume and profile):
- `name`: User's full name
- `university`: University name (converted to shorthand)
- `major`: Major/field of study
- `year`: Graduation year
- `key_experiences`: Top 2 experiences from resume
- `skills`: Top 3 skills from resume
- `achievements`: Top achievement from resume
- `email`: User's email address
- `phone`: User's phone number
- `linkedin`: User's LinkedIn URL
- `hometown`: Extracted from resume (for commonality detection)
- `companies`: Companies mentioned in resume (for commonality detection)

**Contact Data** (from PDL):
- `FirstName`: Contact's first name
- `LastName`: Contact's last name
- `Email`: Contact's email (or WorkEmail, PersonalEmail)
- `Title`: Job title
- `Company`: Company name
- `City`, `State`: Location
- `College`: Education
- `LinkedIn`: LinkedIn URL
- `Phone`: Phone number
- `experience`: Array of work experience (structured)
- `WorkSummary`: Text summary of work history
- `industry`: Determined from company/title

**Fit Context** (optional, for targeted outreach):
- `job_title`: Target job title
- `company`: Target company
- `score`: Fit score percentage
- `match_level`: "strong", "moderate", "weak"
- `pitch`: Key pitch text
- `talking_points`: List of talking points
- `strengths`: List of strength objects with point/evidence
- `gaps`: List of gap objects with gap/mitigation
- `keywords`: List of keywords to naturally include

**Contact Context** (built per contact):
- `firstname`: Contact's first name
- `lastname`: Contact's last name
- `company`: Company name
- `title`: Job title
- `industry`: Determined industry
- `connection`: Personalization note (university, hometown, company commonality)
- `anchor_detail`: Selected anchor (transition, tenure, or title)

### 2.2 Secondary Function: Recruiter Emails

#### Function Details
- **Name**: `generate_single_email` (for recruiters)
- **Location**: `backend/app/services/recruiter_email_generator.py:102`
- **Trigger**: Called by `generate_recruiter_emails()` for recruiter-specific outreach
- **Input Parameters**:
  - `recruiter`: Recruiter contact dict
  - `job_title`: Job title from posting
  - `company`: Company name
  - `job_description`: Full job description (truncated to 2000 chars)
  - `user_resume`: User's parsed resume data
  - `user_contact`: User's contact info

#### OpenAI Configuration
- **Model**: `gpt-4o` (different from general emails!)
- **Temperature**: `0.85` (high for variation)
- **Max tokens**: `500`

#### System Prompt (EXACT TEXT)
```
You are an expert at writing compelling, personalized job application outreach emails. Your emails feel human, genuine, and eager without being desperate. You never use clichés or generic phrases. Every email you write feels like it was written by a real person who genuinely wants the job. CRITICAL: Always use proper grammar with correct apostrophes in contractions (I'm, I'd, couldn't, I've, you're, it's, that's, etc.). Never write 'Im', 'Id', 'couldnt', 'Ive', 'youre', 'thats' - always include the apostrophe.
```

#### User Prompt Template (EXACT TEXT)
```
Generate a personalized recruiter outreach email for a job application.

APPROACH STYLE: {selected_approach.replace('_', ' ').title()}
- direct_confident: Professional, assertive, gets to the point
- warm_personable: Friendly, conversational, builds rapport
- enthusiastic_specific: High energy, very specific about why they're excited
- brief_respectful: Short, respects recruiter's time, punchy
- story_driven: Opens with a hook, tells a mini narrative

RECRUITER INFO:
- Name: {recruiter_first_name}
- Title: {recruiter.get('Title', 'Recruiter')}
- Company: {company}

JOB INFO:
- Title: {job_title}
- Company: {company}
- Description: {job_description[:2000]}

CANDIDATE INFO:
- Name: {user_name}
- Phone: {user_phone}
- LinkedIn: {user_linkedin}
- Resume Summary:
{resume_summary}

REQUIREMENTS:
1. Address recruiter by first name ({recruiter_first_name})
2. Mention the specific job title ({job_title}) and company ({company})
3. Include ONE specific detail from the job description that excites the candidate
4. Include ONE specific achievement or experience from the resume that's relevant
5. Keep it concise (150-200 words max for body)
6. Sound human and genuine - like someone who really wants this job
7. Don't be generic - make it feel personal
8. End with a call to action (would love to chat, etc.)
9. DO NOT include subject line or sign-off - I'll add those separately
10. DO NOT include "Dear" - start with "Hi {recruiter_first_name},"
11. DO NOT include attachments mentions - I'll handle that
12. Vary sentence structure and length for natural flow
13. CRITICAL: Always use proper grammar with correct apostrophes in contractions:
    - "I'm" not "Im"
    - "I'd" not "Id"
    - "couldn't" not "couldnt"
    - "I've" not "Ive"
    - "you're" not "youre"
    - "it's" not "its" (when meaning "it is")
    - "that's" not "thats"
    Always use proper English grammar with correct apostrophes in contractions.

OUTPUT FORMAT:
Return ONLY the email body text. No subject line, no signature block.
Start directly with "Hi {recruiter_first_name}," 
```

---

## 3. Subject Line Generation

### 3.1 General Networking Emails

**Generation Method**: Subject lines are generated **together with email bodies** in a single OpenAI call. The prompt instructs GPT to return JSON with both `subject` and `body` for each contact.

**Location**: `backend/app/services/reply_generation.py:707`
- The prompt explicitly asks for: `{"0": {"subject": "...", "body": "..."}, ...}`
- Subject and body are generated simultaneously, ensuring they match in tone and content

**No separate subject line generation function exists** - it's part of the batch email generation.

### 3.2 Recruiter Emails

**Generation Method**: Uses **template-based** subject lines (not GPT-generated)

**Location**: `backend/app/services/recruiter_email_generator.py:236-238`

**Templates** (EXACT TEXT):
```python
SUBJECT_LINE_TEMPLATES = [
    "{job_title} Application - Excited to Connect",
    "Following Up on My {job_title} Application",
    "Eager {job_title} Candidate - Let's Connect!",
    "{job_title} at {company} - Quick Introduction",
    "Why I'm Excited About the {job_title} Role",
    "Reaching Out About the {job_title} Position",
    "{job_title} Role - Passionate Candidate Here",
]
```

**Selection**: Random choice from templates, then formatted with `job_title` and `company` variables.

---

## 4. Templates

### 4.1 General Networking Emails

**No predefined templates** - all emails are generated dynamically by GPT using the prompt system described above.

### 4.2 Recruiter Emails

**Subject Line Templates**: See Section 3.2 above.

**Sign-off Variations** (EXACT TEXT):
```python
SIGN_OFFS = [
    "Best,",
    "Best regards,",
    "Thanks so much,",
    "Looking forward to hearing from you,",
    "Warm regards,",
    "Thank you for your time,",
    "Cheers,",
]
```

**Approach Styles** (for email body variation):
- `direct_confident`: Professional, assertive, gets to the point
- `warm_personable`: Friendly, conversational, builds rapport
- `enthusiastic_specific`: High energy, very specific about why they're excited
- `brief_respectful`: Short, respects recruiter's time, punchy
- `story_driven`: Opens with a hook, tells a mini narrative

---

## 5. Similarity/Personalization Logic

### 5.1 Commonality Detection

**Function**: `detect_commonality()`
**Location**: `backend/app/utils/meeting_prep.py` (imported in `reply_generation.py:16`)

**How similarities are found**:
1. **University match**: Compares user's university with contact's `College` field
2. **Hometown match**: Compares user's hometown (extracted from resume) with contact's location
3. **Company match**: Compares companies in user's resume with contact's `Company` field

**How they're incorporated**:
- If university match: `personalization_note = "Both attended {university} - emphasize the alumni connection naturally"`
- If hometown match: `personalization_note = "Both from {hometown} - mention the shared hometown connection"`
- If company match: `personalization_note = "Both worked at {company} - reference the shared experience"`

**Connection strength**:
- **Strong connections**: Same university OR same company → triggers resume attachment rule
- **Weak connections**: Industry, location → referenced lightly

### 5.2 Anchor System

**Purpose**: Selects ONE personalized detail to anchor the email around.

**Priority Order** (implemented in `reply_generation.py:234-276`):
1. **Career transition** (priority 1): Detects if contact transitioned between industries (e.g., engineering → consulting)
   - Function: `_detect_career_transition()`
   - Checks `experience` array for current vs previous job differences
   - Returns phrases like "transitioned into consulting", "moved into banking"

2. **Tenure** (priority 2): Detects if contact has short tenure (≤3 years) at current role
   - Function: `_detect_tenure()`
   - Calculates from `start_date` in experience array
   - Returns phrases like "recently joined at {company}", "early in your time at {company}"

3. **Title** (priority 3): Fallback anchor using job title and company
   - Function: `_build_title_anchor()`
   - Returns: "{title} at {company}"

**Selection Logic**: `_select_anchor()` picks the highest priority (lowest number) anchor available.

**Usage in Prompt**: The selected anchor is included in the contact context with instruction: "Use exactly ONE anchoring detail in the email. Do NOT include any other anchoring facts."

---

## 6. Post-Processing

### 6.1 Response Parsing

**Location**: `backend/app/services/reply_generation.py:719-731`

**Steps**:
1. Extract response text from OpenAI
2. Clean ASCII encoding: `response_text.encode('ascii', 'ignore').decode('ascii')`
3. Remove markdown code blocks if present (```json ... ```)
4. Parse JSON: `json.loads(response_text)`
5. Expected format: `{"0": {"subject": "...", "body": "..."}, "1": {...}, ...}`

### 6.2 Text Cleaning

**Function**: `clean_email_text()`
**Location**: `backend/app/utils/contact.py` (imported in `reply_generation.py:6`)

**Purpose**: Sanitizes email text (removes special characters, normalizes whitespace)

### 6.3 Post-Processing Rules

**Location**: `backend/app/services/reply_generation.py:733-899`

**Rules Applied**:

1. **Placeholder Replacement**:
   - `[FirstName]` → Contact's first name
   - `[Name]` → User's name
   - `[Company]` → Contact's company

2. **Banned Opener Removal**:
   - Detects banned openers: "I hope", "Hope", "My name is", "I came across"
   - Replaces with context-first opener: "Your work at {company} caught my attention."

3. **Anchor Deduplication**:
   - Ensures only ONE anchor appears in email body
   - If multiple anchor patterns detected, keeps first occurrence, removes subsequent ones

4. **Resume Attachment Line**:
   - Adds resume mention if: (a) targeted outreach OR (b) strong connection exists
   - Inserts: "I've attached my resume below for context."
   - Removes resume mentions if not appropriate

5. **Malformed Pattern Detection**:
   - Detects patterns like "studying at ." (missing university)
   - Falls back to simple template if malformed

### 6.4 Signature Addition

**Location**: `backend/app/routes/emails.py:196-237`

**Logic**:
- Checks if signature already exists in body (looks for "Best,", "Best regards", user name, email, university)
- If not present, builds signature from `user_profile`:
  - Name
  - University | Class of {year}
  - Email
- Adds to both HTML and plain text versions

### 6.5 Fallback Logic

**Location**: `backend/app/services/reply_generation.py:948-992`

**Trigger**: If OpenAI call fails or returns invalid JSON

**Fallback Email Template**:
```
Hi {FirstName},

{intro} Your work at {company} caught my attention.

Would you be open to a brief 15-minute chat about your experience?

Thank you,
{signature}

I've attached my resume in case it's helpful for context.
```

Where `intro` is built from available user data (name, major, university).

---

## 7. Full Generation Pipeline

```
User initiates search/email generation
         ↓
[Entry Point]
- /api/emails/generate-and-draft (POST)
- /api/free-run (POST)
- /api/pro-run (POST)
         ↓
[Data Gathering]
- Extract user info from resume: extract_user_info_from_resume_priority()
- Extract user profile data (name, email, university, major, year)
- Get contact data from PDL (FirstName, LastName, Company, Title, etc.)
         ↓
[Contact Processing]
- For each contact:
  - Detect commonality: detect_commonality() → university/hometown/company match
  - Select anchor: _select_anchor() → transition/tenure/title
  - Build contact context string
         ↓
[Prompt Building]
- Build resume context (key experiences, skills, achievements)
- Build fit context section (if targeted outreach)
- Build outreach type guidance (targeted vs general)
- Build contact contexts list
- Assemble full prompt with all variables
         ↓
[OpenAI API Call]
- Model: gpt-4o-mini
- Temperature: 0.9
- Max tokens: 2500
- System prompt: Natural, human email writing
- User prompt: Full template with all contact contexts
         ↓
[Response Parsing]
- Extract JSON from response
- Clean ASCII encoding
- Remove markdown if present
- Parse JSON: {"0": {"subject": "...", "body": "..."}, ...}
         ↓
[Post-Processing]
- Replace placeholders ([FirstName], [Name], [Company])
- Remove banned openers
- Deduplicate anchors
- Add/remove resume mention based on rules
- Detect and fix malformed patterns
         ↓
[Signature Addition] (in emails.py)
- Check if signature exists
- Build signature from user_profile
- Add to body
         ↓
[HTML Conversion] (in emails.py)
- Convert plain text to HTML paragraphs
- Add HTML signature
         ↓
[Gmail Draft Creation] (in emails.py)
- Build MIME message
- Attach resume if available
- Create Gmail draft via API
- Save draft info to Firestore
         ↓
[Storage]
- Email subject/body stored in contact dict as emailSubject/emailBody
- Draft ID/URL stored in contact dict
- Contact saved to Firestore: users/{uid}/contacts/{contactId}
```

---

## 8. Current Output Examples

### 8.1 General Networking Email Structure

Based on the prompts, emails currently follow this pattern:

**Structure**:
1. **Greeting**: "Hi {FirstName},"
2. **Opening**: Context-first opener (not "I hope you're doing well")
3. **Body** (60-90 words):
   - ONE anchor mention (transition/tenure/title)
   - ONE connection mention (if strong: university/company)
   - Reference to their role/experience
   - ONE specific detail from resume (if targeted)
   - ONE question about their experience
4. **Resume mention** (if appropriate): "I've attached my resume below for context."
5. **Call to action**: "Would you be open to a quick 10–15 minute chat?"
6. **Signature**: 
   ```
   Best,
   {User Name}
   {University} | Class of {Year}
   {Email}
   ```

**Subject Line**: Generated by GPT, typically references the contact's role, company, or a specific reason for reaching out.

### 8.2 Recruiter Email Structure

**Structure**:
1. **Greeting**: "Hi {FirstName},"
2. **Body** (150-200 words):
   - Mentions specific job title and company
   - ONE detail from job description that excites candidate
   - ONE achievement/experience from resume
   - Call to action
3. **Resume note**: "I've attached my resume for your reference."
4. **Sign-off**: Random from SIGN_OFFS list
5. **Signature**: Name, phone, LinkedIn

**Subject Line**: Template-based, e.g., "{job_title} Application - Excited to Connect"

---

## 9. Potential Improvement Areas

Based on analysis:

### 9.1 Subject Line Generation
- **Current**: Subject lines generated together with body (general emails) or template-based (recruiter emails)
- **Issue**: No dedicated subject line optimization
- **Opportunity**: Could add separate subject line generation pass with focus on open rates

### 9.2 Prompt Length
- **Current**: Very long prompt with many rules and guidelines
- **Issue**: May confuse model or lead to inconsistent outputs
- **Opportunity**: Could split into system prompt (tone/style) and user prompt (data/requirements)

### 9.3 Temperature Setting
- **Current**: 0.9 (very high) for general emails
- **Issue**: May lead to too much variation or occasional off-tone emails
- **Opportunity**: Could test lower temperatures (0.7-0.8) for more consistency

### 9.4 Anchor System
- **Current**: Priority-based anchor selection (transition → tenure → title)
- **Issue**: May miss other interesting personalization opportunities
- **Opportunity**: Could expand anchor types (recent promotion, industry expertise, location-based)

### 9.5 Resume Context
- **Current**: Extracts top 2 experiences, top 3 skills, top 1 achievement
- **Issue**: May not capture full resume richness
- **Opportunity**: Could use more sophisticated resume parsing to extract more relevant details

### 9.6 Fit Context Integration
- **Current**: Fit context is optional and only used for targeted outreach
- **Issue**: May not be fully utilized when available
- **Opportunity**: Could better integrate talking points and strengths into email body

### 9.7 Post-Processing Complexity
- **Current**: Multiple post-processing rules (banned openers, anchor deduplication, resume mentions)
- **Issue**: Complex logic that may need maintenance
- **Opportunity**: Could simplify or move some rules into the prompt itself

### 9.8 Model Selection
- **Current**: gpt-4o-mini for general emails, gpt-4o for recruiter emails
- **Issue**: Inconsistent model usage
- **Opportunity**: Could standardize on one model or have clear criteria for model selection

### 9.9 Error Handling
- **Current**: Fallback to simple template on error
- **Issue**: Fallback may not be personalized
- **Opportunity**: Could improve fallback to use available data more effectively

### 9.10 Batch Generation
- **Current**: Generates all emails in one API call
- **Issue**: If one email fails, all fail; also harder to debug individual emails
- **Opportunity**: Could generate emails individually or in smaller batches for better error isolation

---

## 10. Additional Notes

### 10.1 Reply Generation
- **Function**: `generate_reply_to_message()` (separate from outreach emails)
- **Location**: `backend/app/services/reply_generation.py:995`
- **Purpose**: Generates replies to messages from contacts
- **Model**: gpt-4o-mini, temperature 0.85, max_tokens 600
- **Not part of main email generation system** - separate use case

### 10.2 Data Extraction Functions
- `extract_user_info_from_resume_priority()`: Extracts user data from resume text
- `extract_experience_summary()`: Extracts work experience
- `extract_hometown_from_resume()`: Extracts hometown
- `extract_companies_from_resume()`: Extracts companies
- `get_university_shorthand()`: Converts university name to shorthand
- `determine_industry()`: Determines industry from company/title

All located in `backend/app/utils/users.py` and imported in `reply_generation.py`.

### 10.3 Contact Data Source
- Contacts come from **People Data Labs (PDL)** API
- Enriched with **Hunter.io** if email missing (Pro/Elite tier only)
- Contact structure follows PDL schema with fields like `FirstName`, `LastName`, `Email`, `Company`, `Title`, `LinkedIn`, etc.

---

**Document Generated**: Based on codebase analysis as of current state
**Last Updated**: [Current Date]

