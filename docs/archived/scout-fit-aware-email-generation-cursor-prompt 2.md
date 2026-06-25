# Cursor Prompt: Fit-Aware Email Generation

## Context

Offerloop generates personalized networking emails using:
- User's resume (name, school, major, experiences)
- Contact info (name, title, company)
- Detected commonalities (same school, hometown, company)

**The problem:** Emails are generic networking requests. They don't reference the specific job/role the user is targeting or leverage the job fit analysis we now generate.

## Objective

Enhance email generation to use **job fit context** when available:
- The pitch we generated for this role
- Talking points specific to this opportunity
- Strengths and evidence from their resume
- Keywords that matter for this role

**Result:** Emails that feel targeted and intentional, not spray-and-pray networking.

---

## Files to Modify

### Backend
- `app/services/reply_generation.py` - Core email generation logic
- `app/routes/emails.py` - Email generation endpoint

### Frontend
- Component that calls `/api/emails/generate-and-draft` (needs to pass fit_context)
- State management to persist fit_context from job analysis → email generation

---

## Backend Implementation

### Step 1: Update `batch_generate_emails()` in `reply_generation.py`

Add `fit_context` as an optional parameter:

```python
def batch_generate_emails(
    contacts, 
    resume_text, 
    user_profile, 
    career_interests,
    fit_context=None  # NEW: Job fit analysis context
):
    """
    Generate personalized networking emails.
    
    Args:
        contacts: List of contact dicts
        resume_text: User's resume text
        user_profile: User profile dict
        career_interests: Career interests string
        fit_context: Optional dict with job fit analysis:
            {
                "job_title": "Business Analyst Intern",
                "company": "McKinsey",
                "score": 65,
                "match_level": "moderate",
                "pitch": "As a Data Science major with strong analytical skills...",
                "talking_points": ["specific project", "relevant coursework"],
                "strengths": [{"point": "...", "evidence": "..."}],
                "gaps": [{"gap": "...", "mitigation": "..."}],
                "keywords": ["analytical", "data-driven", "business insights"]
            }
    """
```

### Step 2: Build Fit Context Section for Prompt

Add this after extracting user info (around line 37):

```python
    # Build fit context section if available
    fit_context_section = ""
    if fit_context:
        fit_context_section = f"""
TARGET ROLE CONTEXT:
- Target Role: {fit_context.get('job_title', 'Not specified')}
- Target Company: {fit_context.get('company', 'Not specified')}
- Fit Score: {fit_context.get('score', 'N/A')}%
- Match Level: {fit_context.get('match_level', 'unknown')}

KEY PITCH (use this as inspiration, don't copy verbatim):
{fit_context.get('pitch', '')}

TALKING POINTS TO WEAVE IN:
{chr(10).join(f"- {tp}" for tp in fit_context.get('talking_points', [])[:3])}

STRENGTHS TO HIGHLIGHT:
{chr(10).join(f"- {s.get('point', '')}: {s.get('evidence', '')}" for s in fit_context.get('strengths', [])[:2])}

KEYWORDS TO NATURALLY INCLUDE:
{', '.join(fit_context.get('keywords', [])[:5])}

IMPORTANT: The user is reaching out specifically about {fit_context.get('job_title', 'this role')} opportunities. 
The email should reflect genuine interest in this specific path, not generic networking.
"""
```

### Step 3: Modify the Prompt

Update the main prompt (around line 108) to include fit context:

```python
        # Determine if this is targeted outreach or general networking
        is_targeted_outreach = bool(fit_context and fit_context.get('job_title'))
        
        outreach_type_guidance = ""
        if is_targeted_outreach:
            target_role = fit_context.get('job_title', '')
            target_company = fit_context.get('company', '')
            outreach_type_guidance = f"""
OUTREACH TYPE: Targeted Role Inquiry
The sender is specifically interested in {target_role} roles{f' at {target_company}' if target_company else ''}.
- Reference the specific role/path naturally
- Show you've done research (use the talking points)
- Ask targeted questions about their experience in this type of role
- Position your background as relevant to this specific opportunity
"""
        else:
            outreach_type_guidance = """
OUTREACH TYPE: General Networking
The sender is exploring broadly and building their network.
- Focus on learning about their career journey
- Ask open-ended questions about their experience
- Show genuine curiosity about their work
"""

        prompt = f"""Write {len(contacts)} personalized, natural networking emails. Each email should be unique and tailored to the specific contact.

ABOUT THE SENDER:
- Name: {sender_name}
- University: {sender_university_short if sender_university_short else 'Not specified'}
- Major: {user_info.get('major', 'Not specified')}
- Year: {user_info.get('year', 'Not specified')}{resume_context}
{fit_context_section}
{outreach_type_guidance}

CONTACTS:
{chr(10).join(contact_contexts)}

WRITING GUIDELINES:
1. Be natural and conversational - write like a real person, not a template
2. Each email must be unique - no copy-paste between contacts
3. Personalize based on their role, company, and any connections (alumni, hometown, etc.)
4. {"Reference the target role and weave in talking points naturally" if is_targeted_outreach else "Show genuine curiosity about their career path"}
5. {"Position your relevant experience using the strengths provided" if is_targeted_outreach else "Reference specific details from the sender's resume when relevant"}
6. Keep it concise (80-100 words) but warm and authentic
7. Subject lines should be specific and interesting, not generic
8. {"Ask a specific question related to the target role" if is_targeted_outreach else "Ask about their experience or journey"}

{"SUBJECT LINE GUIDANCE FOR TARGETED OUTREACH:" if is_targeted_outreach else ""}
{"- Include the role or company naturally: 'Quick question about BA roles at McKinsey' or 'Fellow Trojan exploring consulting'" if is_targeted_outreach else ""}
{"- Avoid generic subjects like 'Meeting request' or 'Quick question'" if is_targeted_outreach else ""}

FORMATTING:
- Start with "Hi [FirstName],"
- Use \\n\\n for paragraph breaks in JSON
- End with "Best regards,\\n[Sender Full Name]\\n{sender_university_short} | Class of {user_info.get('year', '')}" (only include university/year if available)
- Do NOT mention "attached resume" - that's handled separately

Return ONLY valid JSON:
{{"0": {{"subject": "...", "body": "..."}}, "1": {{"subject": "...", "body": "..."}}, ...}}"""
```

### Step 4: Update the Endpoint in `emails.py`

Modify the `/generate-and-draft` endpoint to accept fit_context:

```python
@emails_bp.post("/generate-and-draft")
@require_firebase_auth
def generate_and_draft():
    """Generate emails and create Gmail drafts"""
    db = get_db()
    uid = request.firebase_user["uid"]
    payload = request.get_json() or {}
    
    contacts = payload.get("contacts", [])
    resume_text = payload.get("resumeText", "")
    user_profile = payload.get("userProfile", {})
    career_interest = payload.get("careerInterests")
    fit_context = payload.get("fitContext")  # NEW
    
    # ... existing Gmail service setup ...
    
    # Generate emails with fit context
    results = batch_generate_emails(
        contacts, 
        resume_text, 
        user_profile, 
        career_interest,
        fit_context=fit_context  # NEW
    )
    
    # ... rest of existing code ...
```

---

## Frontend Implementation

### Step 5: Store Fit Context After Job Analysis

When user analyzes a job and clicks "Find Contacts in This Role", store the fit context:

```typescript
// In your state management (context, zustand, redux, etc.)
interface AppState {
  // ... existing state
  currentFitContext: JobFitContext | null;
}

interface JobFitContext {
  job_title: string;
  company: string;
  score: number;
  match_level: string;
  pitch: string;
  talking_points: string[];
  strengths: Array<{ point: string; evidence: string }>;
  gaps: Array<{ gap: string; mitigation: string }>;
  keywords: string[];
}

// When user clicks "Find Contacts in This Role" after analysis
const handleFindContacts = (job: JobListing, analysis: JobFitAnalysis) => {
  // Store fit context for email generation
  setCurrentFitContext({
    job_title: job.title,
    company: job.company,
    score: analysis.score,
    match_level: analysis.match_level,
    pitch: analysis.pitch,
    talking_points: analysis.talking_points,
    strengths: analysis.strengths,
    gaps: analysis.gaps,
    keywords: analysis.keywords_to_use,
  });
  
  // Fill search form and navigate
  onJobTitleSuggestion(job.title, job.company, job.location);
};
```

### Step 6: Pass Fit Context to Email Generation

When calling the email generation endpoint:

```typescript
const generateEmails = async (selectedContacts: Contact[]) => {
  const response = await fetch(`${BACKEND_URL}/api/emails/generate-and-draft`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      contacts: selectedContacts,
      resumeText: userResume?.rawText || '',
      userProfile: userProfile,
      careerInterests: careerInterests,
      fitContext: currentFitContext,  // NEW - pass the stored fit context
    }),
  });
  
  // ... handle response
};
```

### Step 7: Clear Fit Context When Appropriate

Clear the fit context when user starts a new search unrelated to a job analysis:

```typescript
// When user manually searches without going through job analysis
const handleManualSearch = () => {
  setCurrentFitContext(null);  // Clear fit context
  // ... proceed with search
};

// When user clicks "Clear" or starts fresh
const handleClearSearch = () => {
  setCurrentFitContext(null);
  // ... reset form
};
```

---

## Expected Results

### Without Fit Context (General Networking)

```
Subject: Fellow Trojan in consulting - quick question

Hi Sarah,

I'm Deena, a Data Science and Economics major at USC. 
I came across your profile and was impressed by your 
journey to McKinsey. 

I'd love to hear about your experience transitioning 
into consulting. Would you be open to a brief chat?

Best regards,
Deena Bandi
USC | Class of 2025
```

### With Fit Context (Targeted Outreach)

```
Subject: Exploring BA intern roles at McKinsey - fellow Trojan

Hi Sarah,

I'm a Data Science and Economics major at USC specifically 
exploring business analyst opportunities. Your path to 
McKinsey's analytics practice caught my attention.

I've been applying analytical skills to real problems - 
recently built a data pipeline for a startup that identified 
$50K in cost savings. I'd love to hear how you positioned 
your quantitative background for consulting, especially 
for intern recruiting.

Would you have 15 minutes for a quick call?

Best regards,
Deena Bandi
USC | Class of 2025
```

---

## Key Differences in Generated Email

| Aspect | Without Fit Context | With Fit Context |
|--------|---------------------|------------------|
| Subject | Generic networking | Role-specific |
| Opening | "I came across your profile" | "I'm exploring [role] opportunities" |
| Body | General interest | Specific talking points from analysis |
| Evidence | Generic resume mention | Specific strength + evidence |
| Question | "Tell me about your experience" | "How did you position X for Y?" |
| Intent | Vague exploration | Clear purpose |

---

## Testing Checklist

- [ ] Emails generate correctly WITHOUT fit context (backwards compatible)
- [ ] Emails generate with fit context and include:
  - [ ] Reference to target role in subject
  - [ ] Pitch elements woven naturally into body
  - [ ] At least one talking point included
  - [ ] Specific question related to the role
- [ ] Fit context persists from job analysis → contact search → email generation
- [ ] Fit context clears when user starts unrelated search
- [ ] No errors when fit_context is None or empty
- [ ] Email length stays within bounds (80-100 words)

---

## Edge Cases to Handle

1. **Partial fit context**: User has job_title but analysis failed
   - Use job_title for targeting, skip detailed talking points
   
2. **Contact at different company than target**: 
   - Still use the role context, but ask about their experience in similar roles
   
3. **Alumni connection + fit context**:
   - Lead with alumni connection, then pivot to role interest
   
4. **Multiple contacts, different relevance**:
   - Each email should adapt - PM at target company vs. PM elsewhere

---

## Future Enhancements

1. **Per-contact fit scoring**: If reaching out to 5 people, show which are most relevant to the target role

2. **Email tone variants**: 
   - "More casual" / "More formal" toggle that adjusts based on contact seniority

3. **Follow-up awareness**: 
   - If this is a follow-up email, reference the previous outreach and any new context

4. **A/B subject lines**: 
   - Generate 2 subject options, let user pick or auto-select

5. **Gap-aware framing**:
   - If fit analysis identified gaps, proactively frame them positively in the email
