# Marketing Email Context

## Offerloop Voice & Positioning

**Product:** Offerloop - AI-powered professional networking platform for college students breaking into competitive industries.

**Target Launch:** UC LAUNCH Spring 2026, NVSC

**Team:**
- Nick (CEO) - USC 2027
- Sid (CTO) - USC 2027
- Rylan (CMO) - USC 2027

**Voice Principles:**
- Warm, confident, student-to-professional tone
- Not corporate, not overly casual
- Shows genuine curiosity - never transactional
- Research-backed personalization, not mass-email templates
- Emails should sound like they were written by a real student, not a bot

**Tagline Positioning:** Offerloop helps students network smarter - find the right people, send the right emails, and prep for the right conversations.

---

## Target Segments

| Segment | Description | Primary Features |
|---------|-------------|-----------------|
| **College students** | Undergrads/grads breaking into consulting, banking, tech, etc. | Contact Search, Email Drafting, Meeting Prep |
| **Career pivoters** | Students exploring unfamiliar industries | Interview Prep, Firm Search, Resume Workshop |
| **Alumni networkers** | Students leveraging school connections | Alumni-filtered search, shared-school personalization |
| **Job seekers** | Students actively applying to roles | Application Lab, Resume Tailor, Cover Letters |

---

## Complete Email Template Library

### Style Presets

All styles are defined in `backend/email_templates.py` → `EMAIL_STYLE_PRESETS`.

#### 1. `casual`
**Name:** Casual
**Description:** Relaxed and friendly - like texting a friend of a friend

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

#### 2. `professional`
**Name:** Professional
**Description:** Polished and respectful - safe for senior executives

```
STYLE INSTRUCTIONS:
- Tone: polished, respectful, confident but not stiff
- Use complete sentences with proper grammar
- Show that you've researched them specifically
- Structure: brief intro → specific reason for reaching out → clear ask
- Avoid slang, exclamation marks, and overly casual language
- Sign off with "Best regards," or "Thank you," then full name
```

#### 3. `short_direct`
**Name:** Short & Direct
**Description:** Under 50 words - get to the point fast

```
STYLE INSTRUCTIONS:
- STRICT: Keep the entire email body under 50 words (excluding greeting and sign-off)
- Get to the point in the first sentence
- One specific question or ask - nothing else
- No filler, no pleasantries beyond "Hi [Name],"
- Every word must earn its place
- Sign off with just "Thanks," then name
```

#### 4. `warm_enthusiastic`
**Name:** Warm & Enthusiastic
**Description:** Genuinely excited - great for people you admire

```
STYLE INSTRUCTIONS:
- Tone: warm, genuinely enthusiastic, admiring but not sycophantic
- Show specific excitement about their work (not generic "I'm a huge fan")
- Use energetic but natural language
- OK to use one exclamation mark (not more)
- Make the ask feel collaborative, not transactional
- Sign off warmly: "Really appreciate it," or "Would love to chat," then name
```

#### 5. `bold_confident`
**Name:** Bold & Confident
**Description:** Stand out in the inbox - memorable and direct

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

### Purpose Presets

All purposes are defined in `backend/email_templates.py` → `EMAIL_PURPOSE_PRESETS`.

#### 1. `networking` (default)
**Name:** Networking
**Description:** Meetings and informational interviews

- Introduce sender as a student interested in recipient's field
- Reference something specific about recipient's background or company
- Highlight similarities or shared connections
- Ask for a 15-20 minute chat
- Mention attached resume for context
- Close: "Thank you," → name → "I've attached my resume in case helpful for context." → contact info

#### 2. `referral`
**Name:** Referral Request
**Description:** Ask for a referral to a specific role at their company

- Brief intro (student, school, major)
- Mention specific role or team
- Explain fit in 1-2 sentences (from resume)
- Reference why this specific person
- Direct ask for referral/introduction
- Acknowledge if they're not comfortable
- Mention attached resume

#### 3. `follow_up`
**Name:** Follow-Up
**Description:** Follow up on a previous email or meeting

- SHORT: 2-3 sentences max
- Reference previous interaction naturally (no guilt-tripping)
- Add one small piece of new value (article, company news, progress update)
- Restate ask lightly without being pushy
- Close: "Thanks," → name

#### 4. `sales`
**Name:** Sales / Partnership
**Description:** Pitch a product or propose a partnership

- Lead with pain point or opportunity relevant to recipient
- One sentence: what product does and who it's for
- One proof point (users, results, traction)
- Specific low-friction ask (15-min demo, quick call, reply)
- Do NOT sound like a mass email
- Do NOT include resume attachment line

### Template Combination Logic

`get_template_instructions()` in `backend/email_templates.py`:

```
Input: purpose, style_preset, custom_instructions
Output: Combined prompt string

Rules:
- If purpose is None/"networking" AND style is None AND no custom → returns "" (backwards compatible)
- Otherwise builds: [purpose base_prompt] + [style instructions] + [custom instructions]
- Custom instructions wrapped with: "Note: Follow these instructions... Do not generate harmful content."
```

`build_template_prompt()` in `reply_generation.py` injects template instructions between the context block and requirements block.

---

## Subject Line Patterns

### Default (no custom subject)

Approved patterns:
- "Question about your work at [Company]"
- "Curious about your journey at [Company]"
- "Quick question from a [University] student"
- "Learning from your path at [Company]"
- "Insight on your role at [Company]"

Banned patterns:
- "Networking request"
- "Introduction"
- "Meeting request"
- "Hope to connect"

### Custom Subject Lines

When `subject_line` is provided by user, injected as:
`Use this exact subject line pattern for all emails (personalize with [Company] or recipient details): "{subject_line}"`

---

## Email Quality Rules

### Banned Openers (Post-Processing)

Defined in `reply_generation.py` line 904:

```python
banned_openers = [
    "I hope you're doing well",
    "Hope you're doing well",
    "I hope this",
    "Hope this",
    "My name is"
]
```

When a banned opener is detected after the greeting line, it is replaced with:
- If company known: `"Your work at {company} caught my attention."`
- If title known: `"Your experience as a {title} caught my attention."`
- Fallback: `"I'd like to learn more about your experience."`

### DO NOT List (Prompt-Level)

From the email requirements block:
- Start with "I'm reaching out because I noticed..."
- Use generic phrases like "I'd be interested in hearing about your work"
- Put resume mention after signature
- Use parentheses in university name like "(USC)"
- Write emails shorter than 4 sentences
- Use "Hope this finds you well" or "I hope you're doing well"
- Sound templated or robotic
- Write "[your major]" or any placeholder text

### Required Email Structure (Default Networking)

1. **Opening (First Paragraph):**
   - "Hi [FirstName],"
   - "I came across your background at [Company] and noticed your work as a [title] there."
   - "I'm a [University] student studying [Major], and I'm especially interested in [specific thing]."

2. **Middle (Second Paragraph):**
   - TWO specific questions: projects/work + day-to-day
   - Time ask: "15 minutes for a quick chat sometime in the next couple of weeks?"

3. **Resume Line (Third Paragraph, if applicable):**
   - "I've included my resume ({filename}) for your reference."

4. **Signature:**
   - Sign-off phrase (configurable, default "Best,")
   - Sender name
   - University | Class of [Year]

### Formatting Rules

1. Use "I came across your background at [Company]" - NOT "I'm reaching out because I noticed"
2. ALWAYS mention sender's major
3. Show interest in COMPANY's work, not just generic "your work"
4. Ask TWO questions
5. Specific time: "15 minutes" and "next couple of weeks"
6. Resume mention comes BEFORE signature
7. No parentheses around university name
8. LENGTH: 4-5 sentences in body (not counting greeting/signature)

---

## Post-Processing Pipeline

Sequential pipeline applied to every generated email (in `batch_generate_emails()`):

| Step | Function | What It Does |
|------|----------|-------------|
| 1 | `unicodedata.normalize('NFKC', ...)` | Unicode normalization |
| 2 | Markdown stripping | Remove ````json` fences from response |
| 3 | `json.loads()` | Parse JSON response |
| 4 | `clean_email_text()` | Replace smart quotes, em dashes, corrupted UTF-8 with ASCII equivalents |
| 5 | `fix_apostrophes_and_formatting()` | Fix missing apostrophes in contractions (30+ patterns), fix concatenated number ranges (1015→10-15) |
| 6 | Placeholder replacement | `[FirstName]`, `[Name]`, `[Company]` → actual values |
| 7 | Banned opener removal | Replace banned first sentences with context-first alternatives |
| 8 | Anchor deduplication | Ensure only ONE anchor pattern appears (transition/tenure/title) |
| 9 | Resume line injection | Add resume mention if purpose is networking/referral and filename provided |
| 10 | `ensure_sign_off()` | Append sign-off + name if missing |
| 11 | `_deduplicate_signoff()` | Remove duplicate sign-off blocks |

---

## Anchor Priority System

The anchor system ensures each email contains exactly ONE personalized hook. Defined in `reply_generation.py`.

| Priority | Type | Detection | Example Value |
|----------|------|-----------|---------------|
| 1 (highest) | `transition` | `_detect_career_transition()` - checks if current vs previous job spans different industries | "transitioned into consulting" |
| 2 | `tenure` | `_detect_tenure()` - checks if current role started within 3 years | "recently joined at Google" |
| 3 (fallback) | `title` | `_build_title_anchor()` - uses current title + company | "Software Engineer at Google" |

**Selection:** `_select_anchor()` picks highest-priority (lowest number) anchor.

**Post-processing enforcement:** After generation, anchor deduplication scans for multiple mentions of transition/tenure/title patterns and removes extras.

---

## Personalization Variables

### Available in Email Prompt

| Variable | Source | Example |
|----------|--------|---------|
| `{sender_name}` | Resume → profile → Auth displayName → "Student" | "Karthik Sharma" |
| `{sender_university_short}` | `get_university_shorthand()` | "USC" |
| `{major}` | user_info from resume/profile | "Computer Science" |
| `{year}` | user_info from resume/profile | "Junior" |
| `{key_experiences}` | Resume parser (top 2) | "Software intern at Meta" |
| `{skills}` | Resume parser (top 3) | "Python, React, SQL" |
| `{achievements}` | Resume parser (top 1) | "Dean's List 2024" |
| `{contact_info_str}` | Profile email, phone, LinkedIn | "k@usc.edu \| 555-1234" |

### Commonality Detection

`detect_commonality()` from `app/utils/meeting_prep.py`:

| Type | Trigger | Prompt Injection |
|------|---------|-----------------|
| `university` | Sender + recipient share school | "Both attended {school} - emphasize the alumni connection naturally" |
| `hometown` | Sender + recipient share hometown | "Both from {hometown} - mention the shared hometown connection" |
| `company` | Sender + recipient worked at same company | "Both worked at {company} - reference the shared experience" |

### Strong Connection Tracking

Alumni and shared-company contacts are flagged as `has_strong_connection = True`. This influences whether resume details are prominently featured.

---

## Personalization by Tier

| Feature | Free | Pro | Elite |
|---------|------|-----|-------|
| Email generation | Yes (basic) | Yes (resume-enhanced) | Yes (all features) |
| Resume-enhanced emails | No | Yes - `fit_context` with strengths, talking points, keywords | Yes |
| Custom templates | Basic | Full style + purpose presets | Full + personalized templates |
| Batch size | 1 email/search | Up to 5 | Up to 15 |
| Custom subject lines | No | Yes | Yes |
| Custom sign-off/signature | No | Yes | Yes |
| Custom instructions | No | Yes | Yes |

### Pro/Elite: Fit Context (Resume-Enhanced)

When `fit_context` is provided (Pro+ with resume uploaded):

```
TARGET ROLE CONTEXT:
- Target Role: {job_title}
- Target Company: {company}
- Fit Score: {score}%
- Match Level: {match_level}

KEY PITCH (use as inspiration):
{pitch}

TALKING POINTS TO WEAVE IN:
- {talking_point_1}
- {talking_point_2}

STRENGTHS TO HIGHLIGHT:
- {strength}: {evidence}

KEYWORDS TO NATURALLY INCLUDE:
{keywords}
```

---

## OpenAI Configuration

| Parameter | Value |
|-----------|-------|
| Model | `gpt-4o-mini` |
| Temperature | `0.75` |
| Max Tokens | `4000` |
| System prompt (networking) | "You write warm, professional networking emails for college students..." |
| System prompt (custom) | "You write personalized emails. Follow the user's custom instructions and style exactly..." |

---

## Resume Attachment Logic

**Which purposes include resume?** `PURPOSES_INCLUDE_RESUME = (None, "networking", "referral")`

**Detection phrases:** `RESUME_MENTIONS = ["attached my resume", "attached resume", "resume below", "resume attached"]`

**Resume line template:** `"I've included my resume ({resume_filename}) for your reference."`

**Draft attachment:** When `email_body_mentions_resume()` returns True AND user has a resume file, the Gmail draft includes the PDF as an attachment.

---

## Sign-Off Configuration

**Recognized sign-off phrases:**
```python
SIGN_OFF_PHRASES = (
    "Best,", "Best regards,", "Thank you,", "Thanks,",
    "Sincerely,", "Kind regards,", "Warm regards,",
    "Looking forward to connecting,"
)
```

**Default sign-off block format:**
```
{signoffPhrase}     # default: "Best,"
{signatureBlock}    # default: "[Full Name]\n[University] | Class of [Year]"
```

**Deduplication:** `_deduplicate_signoff()` removes extra sign-off blocks if the LLM generates duplicates.

---

## Gmail Draft Integration

After email generation, if Gmail is connected:
1. `create_gmail_draft()` creates draft via Gmail API
2. If `email_body_mentions_resume()` → attaches resume PDF
3. `gmailDraftId` stored on contact document
4. Compose URL generated: `https://mail.google.com/mail/?authuser={email}#drafts/{draftId}`
5. Feature flag: `CREATE_GMAIL_DRAFTS` in config.py (currently `False` - returns compose links instead)

---

## Marketing Agent Integration Points

### For Email Automation
- **Template API:** `GET /api/email-templates/presets` - returns all available styles and purposes
- **Email Generation:** `POST /api/runs/search` - generates emails as part of search flow
- **Template Storage:** `users/{uid}.emailTemplate` Firestore field stores user's default template config:
  ```
  {
    purpose: "networking" | "referral" | "follow_up" | "sales",
    stylePreset: "casual" | "professional" | "short_direct" | ...,
    customInstructions: string,
    subject: string,
    signoffPhrase: string,
    signatureBlock: string
  }
  ```

### For Outreach Tracking
- **Outbox:** `GET /api/outbox/entries` - all sent/drafted emails
- **Reply Detection:** `POST /api/outbox/check-replies` - bulk Gmail thread check
- **Status Flow:** Draft → Sent → Replied / No Response

### For Content Generation
- **Meeting Prep:** `POST /api/meeting-prep/generate` - generates prep notes
- **Interview Prep:** `POST /api/interview-prep/generate` - generates interview prep
- **Scout AI:** `POST /api/scout-assistant/chat` - conversational career guidance
