# Email Generation System

## OpenAI Configuration

| Parameter | Value |
|-----------|-------|
| Model | `gpt-4o-mini` |
| Temperature | `0.75` (balanced for naturalness and consistency) |
| Max Tokens | `4000` (increased for batches of 15+ contacts) |
| Estimated Cost | ~$0.002-0.005 per batch (input + output tokens) |
| Client | `openai_client.py` → `get_openai_client()` |

---

## Email Template Types

### Style Presets (from `email_templates.py`)

| ID | Name | Description |
|----|------|-------------|
| `casual` | Casual | Relaxed and friendly - like texting a friend of a friend |
| `professional` | Professional | Polished and respectful - safe for senior executives |
| `short_direct` | Short & Direct | Under 50 words - get to the point fast |
| `warm_enthusiastic` | Warm & Enthusiastic | Genuinely excited - great for people you admire |
| `bold_confident` | Bold & Confident | Stand out in the inbox - memorable and direct |

### Purpose Presets (from `email_templates.py`)

| ID | Name | Description |
|----|------|-------------|
| `networking` | Networking | Meetings and informational interviews |
| `referral` | Referral Request | Ask for a referral to a specific role at their company |
| `follow_up` | Follow-Up | Follow up on a previous email or meeting |
| `sales` | Sales / Partnership | Pitch a product or propose a partnership |

---

## Complete System Prompts

### Networking Email System Prompt (Default)

```
You write warm, professional networking emails for college students. Your emails are 4-5 sentences
(not counting greeting/signature), show genuine interest in the recipient's company and role, and
always ask TWO specific questions. You ALWAYS mention the sender's university and major. You use the
exact phrase 'I came across your background at [Company]' to open. The resume mention always comes
BEFORE the signature. You ALWAYS end every email with a sign-off line (e.g. Best, or Best regards,)
followed by the sender's full name. Use proper apostrophes (I'm, I'd, you're). Never use placeholders
like [your major] - always fill in actual values or omit gracefully.
```

### Custom Purpose System Prompt

```
You write personalized emails. Follow the user's custom instructions and style exactly. Do not add
networking rules, resume mentions, or meeting asks unless the instructions say so. Return only
valid JSON.
```

### User Prompt Template (Networking - Full Reproduction)

```
You write professional, warm networking emails for college students reaching out to industry professionals.

TASK:
Write {N} personalized networking emails.
Each email must be unique and specifically written for that recipient.

ABOUT THE SENDER:
- Name: {sender_name}
- University: {sender_university_short}
- Major: {major}
- Year: {year}
- Key Experiences: {key_experiences[0]}, {key_experiences[1]}
- Skills: {skills[0]}, {skills[1]}, {skills[2]}
- Notable Achievement: {achievements[0]}

[TARGET ROLE CONTEXT (if fit_context provided):
- Target Role: {job_title}
- Target Company: {company}
- Fit Score: {score}%
- Match Level: {match_level}

KEY PITCH (use this as inspiration, don't copy verbatim):
{pitch}

TALKING POINTS TO WEAVE IN:
- {talking_point_1}
- {talking_point_2}
- {talking_point_3}

STRENGTHS TO HIGHLIGHT:
- {strength_1}: {evidence_1}
- {strength_2}: {evidence_2}

KEYWORDS TO NATURALLY INCLUDE:
{keyword_1}, {keyword_2}, {keyword_3}, {keyword_4}, {keyword_5}

IMPORTANT: The user is reaching out specifically about {job_title} opportunities.
The email should reflect genuine interest in this specific path, not generic networking.]

[OUTREACH TYPE: Targeted Role Inquiry | General Networking]

CONTACTS:
Contact 0:
- Name: {FirstName} {LastName}
- Title: {Title} at {Company}
- Location: {City}, {State}
- Email: {Email}
- LinkedIn: {LinkedIn}
- Work Summary: {WorkSummary}
- Education: {EducationTop}
- Personalization anchor: {anchor_type} - {anchor_value}
- Personalize by: Mentioning their role/company, asking about their experience, showing genuine interest in their work

[Repeat for each contact...]

===== EMAIL STRUCTURE (FOLLOW THIS EXACTLY) =====

OPENING (First Paragraph):
- Start with: "Hi [FirstName],"
- Then: "I came across your background at [Company] and noticed your work as a [title] there."
- Then: "I'm a [University] student studying [Major], and I'm especially interested in [something specific about their company/role/industry]."

MIDDLE (Second Paragraph):
- Ask TWO specific questions:
  1. About their projects or work: "I'd love to hear about the projects you've found most engaging"
  2. About their day-to-day: "and what your day-to-day looks like on the [engineering/product/etc.] side"
- End with specific time ask: "If you're open to it, would you have 15 minutes for a quick chat sometime in the next couple of weeks?"

RESUME LINE (Third Paragraph - BEFORE signature):
- "I've included my resume ({resume_filename}) for your reference."

SIGNATURE (REQUIRED - every email MUST end with this):
Use exactly this format (sign-off line then name/signature block):
{signoff_phrase}
{sender_name}

CRITICAL: Never end the email without a sign-off and the sender's name.

===== FORMATTING RULES =====

1. Use "I came across your background at [Company]" - NOT "I'm reaching out because I noticed"
2. ALWAYS mention the sender's major: "I'm a [University] student studying [Major]"
3. Show interest in the COMPANY's work, not just generic "your work"
4. Ask TWO questions (projects + day-to-day OR career path + advice)
5. Specific time: "15 minutes" and "next couple of weeks"
6. Resume mention comes BEFORE the signature, not after
7. No parentheses around university name - use "University of Southern California" not "(USC)"
8. LENGTH: 4-5 sentences in the body (not counting greeting/signature). Do NOT be too brief.

===== DO NOT =====
- Start with "I'm reaching out because I noticed..."
- Use generic phrases like "I'd be interested in hearing about your work"
- Put resume mention after signature
- Use parentheses in university name like "(USC)"
- Write emails shorter than 4 sentences
- Use "Hope this finds you well" or "I hope you're doing well"
- Sound templated or robotic
- Write "[your major]" or any placeholder text - always fill in actual values

===== SUBJECT LINES =====
Make them conversational and specific:
- "Question about your work at [Company]"
- "Curious about your journey at [Company]"
- "Quick question from a [University] student"
- "Learning from your path at [Company]"
- "Insight on your role at [Company]"

NOT these generic ones:
- "Networking request"
- "Introduction"
- "Meeting request"
- "Hope to connect"

===== CRITICAL =====
- If major is empty or "Not specified", write "I'm a [University] student" without mentioning major
- Use proper grammar with apostrophes (I'm, I'd, you're, it's)
- Use \n\n for paragraph breaks in JSON

Return ONLY valid JSON:
{"0": {"subject": "...", "body": "..."}, "1": {"subject": "...", "body": "..."}, ...}
```

### Style Preset Instructions (injected when style is selected)

**Casual:**
```
STYLE INSTRUCTIONS:
- Tone: relaxed, genuine, like you're messaging someone a mutual friend introduced you to
- Use contractions freely (I'm, you're, I'd)
- Keep sentences short and punchy
- Avoid formal language ("I hope this finds you well", "I would greatly appreciate")
- One short paragraph max, then the ask
- OK to start sentences with "And" or "But"
- Sign off casually: "Thanks," or "Cheers," then name
```

**Professional:**
```
STYLE INSTRUCTIONS:
- Tone: polished, respectful, confident but not stiff
- Use complete sentences with proper grammar
- Show that you've researched them specifically
- Structure: brief intro → specific reason for reaching out → clear ask
- Avoid slang, exclamation marks, and overly casual language
- Sign off with "Best regards," or "Thank you," then full name
```

**Short & Direct:**
```
STYLE INSTRUCTIONS:
- STRICT: Keep the entire email body under 50 words (excluding greeting and sign-off)
- Get to the point in the first sentence
- One specific question or ask - nothing else
- No filler, no pleasantries beyond "Hi [Name],"
- Every word must earn its place
- Sign off with just "Thanks," then name
```

**Warm & Enthusiastic:**
```
STYLE INSTRUCTIONS:
- Tone: warm, genuinely enthusiastic, admiring but not sycophantic
- Show specific excitement about their work (not generic "I'm a huge fan")
- Use energetic but natural language
- OK to use one exclamation mark (not more)
- Make the ask feel collaborative, not transactional
- Sign off warmly: "Really appreciate it," or "Would love to chat," then name
```

**Bold & Confident:**
```
STYLE INSTRUCTIONS:
- Tone: confident, slightly bold, memorable
- Open with something unexpected or a sharp observation about their work/company
- Use one vivid or surprising word/phrase that makes the email stick
- Don't be apologetic ("Sorry to bother you", "I know you're busy")
- State what you bring to the conversation, not just what you want
- Keep it punchy - short paragraphs, no walls of text
- Sign off with "Thanks," then name
```

### Purpose Preset Base Prompts

**Networking:**
```
Write a personalized networking email requesting an informational interview or meeting.

The email should:
- Introduce the sender as a student interested in the recipient's field
- Reference something specific about the recipient's background or company
- Highlight relevant similarities or shared connections if present
- Ask for a 15-20 minute chat
- Mention attached resume for context
- Close with "Thank you," then sender's name, then "I've attached my resume in case helpful for context." followed by sender's contact info
```

**Referral Request:**
```
Write a personalized email requesting a referral for a specific role at the recipient's company.

The email should:
- Introduce the sender briefly (student, school, major)
- Mention the specific role or team they're interested in
- Explain why they're a strong fit in 1-2 sentences (draw from their resume/background)
- Reference something specific about the recipient that made them reach out to this person specifically
- Make a clear, direct ask for a referral or introduction
- Acknowledge that you understand if they're not comfortable doing so
- Mention attached resume for context
- Close with "Thank you," then sender's name, then contact info
```

**Follow-Up:**
```
Write a brief, warm follow-up email to someone who hasn't responded to a previous outreach or to follow up after a meeting/call.

The email should:
- Be SHORT - 2-3 sentences max
- Reference the previous interaction naturally without guilt-tripping
- Add one small piece of new value (a relevant article, company news, or brief update on sender's progress)
- Restate the ask lightly without being pushy
- Close with "Thanks," then sender's name
```

**Sales / Partnership:**
```
Write a concise, compelling sales or partnership outreach email.

The email should:
- Lead with a specific pain point or opportunity relevant to the recipient's role/organization
- Introduce the product/service in ONE sentence - what it does and who it's for
- Include one concrete proof point (users, results, traction) if available from sender context
- Make a specific, low-friction ask (15-min demo, quick call, or reply)
- Do NOT sound like a mass email - reference something specific about their organization
- Do NOT include a resume attachment line
- Close with sender's name and title/role
```

---

## Input Data Used in Prompts

### From PDL Contact Object
- `FirstName`, `LastName` - recipient name
- `Title` - job title (e.g., "Software Engineer")
- `Company` - current company
- `City`, `State` - location
- `Email` - best email address
- `LinkedIn` - LinkedIn URL
- `WorkSummary` - previous companies text (e.g., "Previously at Google, Microsoft")
- `EducationTop` - education summary
- `experience[]` - structured work history (for career transition detection)

### From User Profile (Firestore)
- `name` - sender's full name
- `email` - sender's email
- `university` / `school` - sender's university (shortened via `get_university_shorthand()`)
- `major` - sender's major
- `year` - graduation year
- `resumeText` - extracted resume text
- `resumeFileName` - uploaded resume filename

### Resume Parsing
- `extract_text_from_pdf()` / `extract_text_from_file()` in `resume_parser.py`
- Uses PyPDF2 for PDF text extraction
- `extract_user_info_from_resume_priority()` extracts: name, university, major, year, key_experiences, skills, achievements
- `extract_experience_summary()` - summarizes work experience
- `extract_hometown_from_resume()` - hometown for commonality detection
- `extract_companies_from_resume()` - previous companies

---

## Anchor Priority System

The email generation uses an "anchor" - a personalization hook based on the contact's background.

### Priority Order (highest first):

1. **Career Transition** (priority 1) - `_detect_career_transition()`
   - Detects if contact changed industries (e.g., engineering → consulting)
   - Requires 2+ entries in `experience[]` array
   - Anchor text: e.g., "transitioned from engineering to consulting"

2. **Tenure** (priority 2) - `_detect_tenure()`
   - Detects if contact recently joined current company (<3 years)
   - Anchor text: e.g., "recently joined" or "early in your time"

3. **Title/Company** (priority 3) - fallback
   - Uses job title and company name as the anchor
   - Always available

### Anchor Selection: `_select_anchor()`
- Tries career transition first, then tenure, then title/company
- Selected anchor is injected into the per-contact context block

---

## Post-Processing Pipeline

After OpenAI returns the raw JSON response, the following pipeline processes each email:

### 1. Unicode Normalization
```python
unicodedata.normalize('NFKC', response_text)
```

### 2. Markdown Removal
Strips ` ```json ` fences if GPT wraps the response.

### 3. JSON Parsing
Parses the response into `{"0": {"subject": "...", "body": "..."}, ...}`.

### 4. `clean_email_text()` (from `utils/contact.py`)
Basic text cleaning for both subject and body.

### 5. `fix_apostrophes_and_formatting()`
Fixes common GPT issues:
- Converts straight quotes to proper apostrophes
- Fixes missing apostrophes in contractions (Im → I'm, Id → I'd, youre → you're, its → it's)
- Normalizes whitespace

### 6. Placeholder Replacement
Replaces any remaining literal placeholders:
```python
body.replace('[FirstName]', contact.get('FirstName', ''))
body.replace('[Name]', user_info.get('name', ''))
body.replace('[Company]', contact.get('Company', ''))
```

### 7. Banned Opener Removal
Checks first sentence after greeting for banned openers:
- "I hope you're doing well"
- "Hope you're doing well"
- "I hope this"
- "Hope this"
- "My name is"

If found, replaces with context-first opener: "Your work at {Company} caught my attention."

### 8. Anchor Deduplication
If the selected anchor appears multiple times in the body, removes subsequent mentions and keeps only the first occurrence.

### 9. Resume Line Injection
If user has a resume file (`resume_filename`):
- Checks if body already mentions resume via `email_body_mentions_resume()`
- If yes: replaces generic mention with specific filename reference
- If no: injects resume line before signature

### 10. Sign-off Enforcement (`ensure_sign_off()`)
Ensures every email ends with:
```
{signoff_phrase}
{sender_name}
```
Deduplicates if GPT added multiple sign-offs.

---

## Gmail Integration

### OAuth2 Connection Flow

1. **Start:** `GET /api/google/oauth/start` (requires auth)
   - Generates CSRF state token, stores in Firestore (`oauth_state/{state}`)
   - Builds Google OAuth URL with scopes, `prompt=consent`, `login_hint={email}`
   - Returns `{"authUrl": "https://accounts.google.com/o/oauth2/v2/auth?..."}`

2. **Callback:** `GET /api/google/oauth/callback?code={code}&state={state}`
   - Verifies state token from Firestore
   - Exchanges auth code for tokens via Google token endpoint
   - Saves credentials to `users/{uid}/integrations/gmail`
   - Starts Gmail watch (push notifications)
   - Redirects to frontend: `/signin?connected=gmail`

3. **Scopes Requested:**
   ```
   https://www.googleapis.com/auth/gmail.compose
   https://www.googleapis.com/auth/gmail.readonly
   https://www.googleapis.com/auth/gmail.send
   openid
   https://www.googleapis.com/auth/userinfo.email
   https://www.googleapis.com/auth/userinfo.profile
   ```

### Token Storage in Firestore

**Path:** `users/{uid}/integrations/gmail`

| Field | Description |
|-------|-------------|
| `token` | OAuth access token |
| `refresh_token` | OAuth refresh token (for auto-renewal) |
| `token_uri` | Token endpoint (`https://oauth2.googleapis.com/token`) |
| `client_id` | OAuth client ID |
| `scopes` | Granted scopes array |
| `expiry` | Token expiry (ISO datetime) |
| `gmailAddress` | Connected Gmail address |
| `updatedAt` | Last update timestamp |

### Token Refresh Logic

`_load_user_gmail_creds()`:
1. Loads credentials from Firestore
2. Checks expiry - if expired:
   - If `refresh_token` exists: calls `creds.refresh(Request())`
   - Saves refreshed credentials back to Firestore
   - If refresh fails with `invalid_grant`: raises exception (user must re-authenticate)
3. If no refresh token: raises exception

### Draft Creation

`create_gmail_draft_for_user(uid, to, subject, body, attachment_data=None)`:
1. Loads user Gmail credentials
2. Builds MIME message (multipart if attachment)
3. Calls `gmail_service.users().drafts().create(userId='me', body=draft_body)`
4. Returns draft ID and compose URL

### Error Handling for Expired/Revoked Tokens
- 401 response includes `gmail_reconnect_url` for re-authentication
- Frontend shows `GmailBanner` component prompting reconnection
- `clear_user_gmail_integration()` deletes the integration doc for clean reconnect

---

## Batch Email Generation

### API Endpoint
`POST /api/runs/search` - searches contacts AND generates emails in one call.

### Flow
1. Search contacts via PDL (`contact_search_optimized()`)
2. Resolve email template (`_resolve_email_template()`)
3. Call `batch_generate_emails()` with all contacts at once
4. GPT returns JSON with all emails keyed by contact index
5. Post-process each email (see pipeline above)
6. Attach emails to contact objects
7. Optionally create Gmail drafts for each contact

### Response Structure
```json
{
  "contacts": [
    {
      "FirstName": "John",
      "LastName": "Doe",
      "Title": "Software Engineer",
      "Company": "Google",
      "Email": "john@google.com",
      "emailSubject": "Question about your work at Google",
      "emailBody": "Hi John,\n\nI came across your background at Google...",
      "gmailDraftId": "r123456789",
      "gmailComposeUrl": "https://mail.google.com/mail/u/0/#drafts/r123456789"
    }
  ],
  "successful_drafts": 3,
  "total_contacts": 3,
  "credits_used": 15
}
```

### Rate Limiting
- Backend: 500 requests/day, 200/hour per user
- PDL: No retry logic for 429 errors (known tech debt)
- OpenAI: Standard rate limits apply

---

## Tier Differences for Email Generation

| Feature | Free | Pro | Elite |
|---------|------|-----|-------|
| Max contacts per search | 3 | 8 | 15 |
| Email generation | Yes | Yes | Yes |
| Resume-enhanced emails | No | Yes | Yes |
| Batch drafting | 1 at a time | Up to 5 | Up to 15 |
| Email template presets | Default only | All presets | All presets + personalized |
| Custom instructions | No | Yes | Yes |
| Gmail draft creation | Yes | Yes | Yes |

### Template Resolution Priority
1. Per-request override (from request body `emailTemplate` field)
2. User's saved default (from `users/{uid}.emailTemplate` in Firestore)
3. No template injection (default networking format)

---

## Recruiter Outreach Emails (Separate System)

**File:** `backend/app/services/recruiter_email_generator.py`

### System Prompt
```
You are an expert at writing compelling, personalized job application outreach emails. Your emails feel
human, genuine, and eager without being desperate. You never use clichés or generic phrases. CRITICAL:
Always use proper grammar with correct apostrophes in contractions (I'm, I'd, couldn't, I've, you're,
it's, that's, etc.). Never write 'Im', 'Id', 'couldnt', 'Ive', 'youre', 'thats' - always include the
apostrophe.
```

### Approach Styles (randomly selected per email)
- `direct_confident` - Professional, assertive
- `warm_personable` - Friendly, conversational
- `enthusiastic_specific` - High energy, specific
- `brief_respectful` - Short, punchy
- `story_driven` - Opens with hook

### Functions
- `generate_recruiter_emails()` - batch generation for recruiter list
- `generate_single_email()` - single personalized email
- `build_resume_summary()` - summarizes resume for prompt context
- `plain_to_html()` - converts plain text to HTML for Gmail
