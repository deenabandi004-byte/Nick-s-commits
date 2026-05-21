# Tailor Feature - End-to-End Trace

Complete trace of the tailor flow from user click to final result, for upgrading with ATS intelligence and role-type detection.

---

## 1. Frontend trigger

### Where the user initiates tailor
- **Component:** `connect-grow-hire/src/components/resume/TailorTab.tsx`
- **Button:** "Tailor Resume" - rendered in the form view (when `showResults` is false). No separate "results" view has its own trigger; the same tab shows form → then results after the API returns.

### User inputs (all optional as a set; at least job URL or manual fields required)
- **jobUrl** - Job posting URL (e.g. LinkedIn, Greenhouse). Normalized with `normalizeJobUrl` (adds `https://` if missing).
- **jobTitle** - Manual job title.
- **company** - Manual company.
- **locationInput** - Manual location.
- **jobDescription** - Manual job description (textarea).

Validation: `hasJobContext = hasJobUrl || hasManualFields` where `hasManualFields = jobTitle.trim() && company.trim() && locationInput.trim() && jobDescription.trim()`. So either a non-empty job URL or all four manual fields.

### State read before the API call
- **No resume state is sent in the request.** The frontend only sends job context. The backend loads the user’s resume from Firestore by `user_id` (from Firebase auth token).
- **Credits:** `credits < 5` disables the button and shows a message; the backend also enforces 5 credits.

### Exact API call (TailorTab → service)

**TailorTab.tsx (handleTailor):**

```typescript
const result = await tailorResume({
  job_url: hasJobUrl ? normalizeJobUrl(jobUrl.trim()) : undefined,
  job_title: jobTitle.trim() || undefined,
  company: company.trim() || undefined,
  location: locationInput.trim() || undefined,
  job_description: jobDescription.trim() || undefined,
});
```

**resumeWorkshop.ts (tailorResume):**

```typescript
const response = await fetch(`${BACKEND_URL}/api/resume-workshop/analyze`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token && { 'Authorization': `Bearer ${token}` }) },
  body: JSON.stringify(params),
  signal: controller.signal,
});
```

- **Endpoint:** `POST /api/resume-workshop/analyze`
- **Request body:** JSON with optional `job_url`, `job_title`, `company`, `location`, `job_description` (only what the user filled; missing keys are omitted or sent as empty string per the frontend).

---

## 2. API service layer (frontend)

### tailorResume (resumeWorkshop.ts)

- **Location:** `connect-grow-hire/src/services/resumeWorkshop.ts`
- **Parameters sent to backend:** Exactly the keys above: `job_url`, `job_title`, `company`, `location`, `job_description`. All optional; only present keys are sent.
- **Resume:** Not sent. Backend uses Firebase auth to identify the user and loads resume from Firestore.
- **Job description:** Sent as provided: either from manual textarea or, when a job URL is used, the backend fetches/parses the URL and can override with manual `job_description` if provided.

---

## 3. Backend endpoint

### Route
- **File:** `backend/app/routes/resume_workshop.py`
- **Blueprint:** `resume_workshop_bp`, prefix `/api/resume-workshop`
- **Route:** `@resume_workshop_bp.route("/analyze", methods=["POST"])`
- **Handler:** `analyze()`

### Before calling OpenAI

1. **Auth:** `@require_firebase_auth` → `user_id = request.firebase_user.get('uid')`.
2. **Load resume:** `resume_data = _fetch_user_resume_data(user_id)` → `resume_text = resume_data.get('resume_text', '')`. Resume text is taken from Firestore (see `_fetch_user_resume_data` below). If `len(resume_text) < 100` → 400 with `NO_RESUME`.
3. **Job URL (if provided):** `parsed_job = run_async(_parse_job_url(job_url), timeout=45.0)`. `_parse_job_url` uses `fetch_job_posting_sync` (from `app.utils.job_url_fetcher`) then optionally GPT to extract title/company/location/description from the fetched content.
4. **Job context:** From `parsed_job` or payload: `job_title`, `company`, `location`, `job_description`. If URL was parsed, manual `job_description` overrides parsed description when non-empty.
5. **Fallback when no URL:** If no `job_url` and missing `job_title` or `company`, backend can call GPT to extract title/company from `job_description` (gpt-4o-mini, JSON, ~200 tokens).
6. **Validation:** `job_description` must be non-empty or 400.
7. **Credits:** Check then `deduct_credits_atomic(user_id, 5, "resume_workshop_analyze")`.

### _fetch_user_resume_data (what resume text is used)

```python
# backend/app/routes/resume_workshop.py (excerpt)
def _fetch_user_resume_data(user_id: str) -> Dict[str, Any]:
    # Priority 1: originalResumeText
    # Priority 2: resumeText
    # Priority 3: rawText
    # Priority 4: profile.resumeText
    # Priority 5: resumeParsed.rawText
    result = {
        'resume_text': resume_text or '',
        'resume_url': ...,
        'resume_parsed': ...,
        ...
    }
    return result
```

Only `resume_text` is used for the tailor call; `resume_parsed` is not sent to the tailor model.

### _parse_job_url (job URL fetching)

- Uses `fetch_job_posting_sync(job_url)` (sync wrapper around `job_url_fetcher.fetch_job_posting`).
- Returns `job_title`, `company`, `location`, `job_description` (from JSON-LD, HTML parse, or fallback text). If description is long and title/company are missing, backend can call GPT to extract from content.

### Exact OpenAI system prompt (tailor)

There is a single system message; the main instructions are in the user message.

**System message:**

```text
You are an expert resume consultant. Always respond with valid JSON only.
```

**User message (full prompt):**

```python
# backend/app/routes/resume_workshop.py - _analyze_resume_sections()
prompt = f"""You are an expert resume consultant. Analyze this resume against the job posting and provide specific, actionable suggestions to tailor it for this role.

## RESUME:
{resume_text[:12000]}

## JOB POSTING:
Title: {job_title}
Company: {company}
Location: {location}

Description:
{job_description[:4000]}

## YOUR TASK:
Provide a detailed analysis with specific suggestions for each section of the resume. For each suggestion, show the CURRENT text from the resume and your SUGGESTED improvement.

Respond in this exact JSON format:
{{
    "score": <0-100 match score>,
    "score_label": "<Excellent/Good/Fair/Needs Work>",
    "sections": {{
        "summary": {{
            "current": "<exact current summary from resume, or 'No summary found' if missing>",
            "suggested": "<your improved summary tailored to this job>",
            "why": "<1-2 sentences explaining why this change helps>"
        }},
        "experience": [
            {{
                "role": "<job title>",
                "company": "<company name>",
                "bullets": [
                    {{
                        "current": "<exact current bullet point>",
                        "suggested": "<your improved version>",
                        "why": "<why this change helps for this specific job>"
                    }}
                ]
            }}
        ],
        "skills": {{
            "add": [
                {{
                    "skill": "<skill to add>",
                    "reason": "<why this skill matters for the job>"
                }}
            ],
            "remove": [
                {{
                    "skill": "<skill to consider removing>",
                    "reason": "<why it's not relevant or hurts the application>"
                }}
            ]
        }},
        "keywords": [
            {{
                "keyword": "<keyword from job posting missing in resume>",
                "where_to_add": "<specific suggestion where to add it>"
            }}
        ]
    }}
}}

## IMPORTANT GUIDELINES:
1. For "current" fields, use the EXACT text from the resume - do not paraphrase
2. For "suggested" fields, provide ready-to-use text the user can copy directly
3. Focus on the TOP 3-5 most impactful changes for each section
4. For experience bullets, prioritize bullets that can be improved with quantified metrics, keywords from the job posting, stronger action verbs
5. For skills, only suggest adding skills the candidate likely has based on their experience
6. For keywords, focus on important terms that appear multiple times in the job posting
7. Make suggestions specific to THIS job at THIS company
8. Keep the score honest - don't inflate it

Score guidelines:
- 90-100: Excellent match
- 75-89: Good match
- 60-74: Fair match
- Below 60: Needs significant work

Respond with ONLY the JSON object, no other text.
"""
```

### OpenAI request (model, temperature, max_tokens)

```python
response = await openai_client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {"role": "system", "content": "You are an expert resume consultant. Always respond with valid JSON only."},
        {"role": "user", "content": prompt}
    ],
    temperature=0.5,
    max_tokens=4000,
    response_format={"type": "json_object"}
)
```

- **Model:** `gpt-4o-mini`
- **Temperature:** `0.5`
- **max_tokens:** `4000`
- **Response format:** `json_object` - raw response is a single JSON object.

### Raw OpenAI response shape

- One JSON object with top-level keys: `score`, `score_label`, `sections`.
- `sections`: `summary` (current/suggested/why), `experience` (list of role/company/bullets), `skills` (add/remove), `keywords` (keyword/where_to_add).

---

## 4. Response processing (backend)

- `result_text = response.choices[0].message.content.strip()`
- `result = json.loads(result_text)`
- **Score:** If missing or invalid, default 50; clamp to 0–100.
- **score_label:** If missing, derived from score (90+ Excellent, 75+ Good, 60+ Fair, else Needs Work).
- **sections:** If missing, `result["sections"] = {}`.
- No extra scoring or categorizing; structure is passed through to the API response.

### Exact response structure returned to frontend

```python
# backend/app/routes/resume_workshop.py - analyze() success path
response = {
    "status": "ok",
    "score": analysis.get("score", 50),
    "score_label": analysis.get("score_label", "Fair"),
    "sections": analysis.get("sections", {}),
    "job_context": {
        "job_title": job_title,
        "company": company,
        "location": location,
        "job_description": (str(job_description)[:500] + "...") if len(str(job_description)) > 500 else str(job_description)
    },
    "credits_remaining": new_credits
}
# Optional:
# response["url_parse_warning"] = "..."  # if job URL was used but parse was partial or failed
return jsonify(response)
```

---

## 5. Frontend rendering (TailorTab)

### When the response comes back

- `handleTailor` sets: `setTailorScore(scoreValue)`, `setTailorScoreLabel(result.score_label)`, `setTailorJobContext(result.job_context)`, `setLastTailorResult(result)`, `setRecommendations(convertSectionsToRecommendations(result))`, `setShowResults(true)`.

### How recommendations are displayed

- **convertSectionsToRecommendations** maps `result.sections` into a flat list of `Recommendation` objects: `id`, `title`, `description`, `category`, `current`, `suggested`, `why`.
- **RecommendationCard:** One card per recommendation; click to expand. Shows title, description, category; when expanded: “Current” (gray box), “Suggested” (gray box + Copy button), and optional “why”.
- Categories used: Summary, Experience, Skills, Keywords.

### Fields from the response used

- **score** - Shown as “{score}/100” and for score band styling (green/amber/red).
- **score_label** - Shown next to the score.
- **sections.summary** - One recommendation (current/suggested/why).
- **sections.experience** - One recommendation per bullet (role/company in title; current/suggested/why).
- **sections.skills.add** - “Add Skill: X” with reason.
- **sections.skills.remove** - “Consider Removing: X” with reason.
- **sections.keywords** - “Add Keyword: X” with where_to_add.
- **job_context** - Used for “Tailored for: {job_title} at {company}” and for Save to Library display name.
- **url_parse_warning** - Shown in an amber banner when present.
- **credits_remaining** - Passed to `updateCredits` if provided.
- **categories** - Not rendered in TailorTab (only in type; could be used elsewhere).

### Score display

- Single score card: “{score}/100”, score_label, “Job fit score for this role”. Color by band (e.g. ≥80 green, ≥60 amber, &lt;60 red).

### Save to Library

- **Button:** “Save to Library” (only when `resumeData` and `lastTailorResult.status === 'ok'`).
- **Logic:** `modified = applyTailorToParsedResume(resumeData, lastTailorResult)` → generate PDF from `modified` → `saveToResumeLibrary({ display_name: "Tailored for {job_title|company|Job}", job_title, company, location, pdf_base64, structured_data: modified, score: tailorScore, source: 'tailor' })`. So the tailored **parsed** resume (with suggestions applied) is what’s saved; PDF is generated from that.

### Use as Main Resume

- **Button:** “Use as Main Resume”.
- **Logic:** `modified = applyTailorToParsedResume(resumeData, lastTailorResult)` → `setResumeData(modified)` → `onSwitchToEditor()`. No Firestore write here; user reviews in Editor and clicks “Save Changes” to persist.

### applyTailorToParsedResume (how tailor result becomes parsed resume)

- **File:** `connect-grow-hire/src/utils/applyTailorToResume.ts`
- **Behavior:** Deep-clones `parsed`, then:
  - **summary** → sets `result.objective = sections.summary.suggested`.
  - **experience** → for each index, replaces `exp.bullets` with the suggested (or current) text from each bullet suggestion.
  - **skills** → merges `sections.skills.add` into `core_skills`, removes `sections.skills.remove` from all skill arrays.
  - **keywords** → merges `sections.keywords` into `result.skills.keywords`.

So “Save to Library” and “Use as Main” both use the **same** application of tailor sections to the current `resumeData` (parsed resume).

---

## 6. Current limitations (for ATS / role-type upgrade)

- **No role-type or job-level detection** - Prompt does not ask for “role type” (e.g. IC vs manager, seniority) or explicit ATS framing.
- **No ATS-specific instructions** - No mention of ATS, keyword density, or formatting that ATS systems care about.
- **Scoring** - Done entirely by OpenAI (single score + label). No separate formula or ATS-style keyword match score.
- **Recommendations** - Specific: real current/suggested text and reasons. Not generic; includes actual rewrites.
- **Missing keywords** - Yes: `sections.keywords` lists “keyword from job posting missing in resume” and “where_to_add”. Frontend shows them as “Add Keyword: X” and uses `where_to_add` as description/why.
- **Before/after** - Yes: every recommendation has `current` and `suggested`; the UI shows “Current” and “Suggested” in expandable cards with copy.
- **Resume input to OpenAI** - Plain text only (`resume_text` from Firestore, truncated to 12000 chars). No structured (parsed) resume sent to the model; no explicit “skills” or “sections” structure in the prompt beyond what’s in the prose.
- **Job description** - Sent as raw text (and optionally from URL fetch), truncated to 4000 chars in the prompt. No explicit extraction of “required skills” or “preferred qualifications” as separate fields for the model.

---

## Exact code references (files and symbols)

| Piece | File | Symbol / location |
|-------|------|-------------------|
| Tailor button & handler | `connect-grow-hire/src/components/resume/TailorTab.tsx` | `handleTailor`, “Tailor Resume” button |
| API call | `connect-grow-hire/src/services/resumeWorkshop.ts` | `tailorResume`, fetch to `/api/resume-workshop/analyze` |
| Backend route | `backend/app/routes/resume_workshop.py` | `analyze()`, `@resume_workshop_bp.route("/analyze", methods=["POST"])` |
| Resume fetch | `backend/app/routes/resume_workshop.py` | `_fetch_user_resume_data` |
| Job URL parse | `backend/app/routes/resume_workshop.py` | `_parse_job_url`; `backend/app/utils/job_url_fetcher.py` `fetch_job_posting` |
| OpenAI tailor call | `backend/app/routes/resume_workshop.py` | `_analyze_resume_sections` (full prompt + `chat.completions.create`) |
| Success response | `backend/app/routes/resume_workshop.py` | `response = { "status", "score", "score_label", "sections", "job_context", "credits_remaining" }` in `analyze()` |
| Frontend result mapping | `connect-grow-hire/src/services/resumeWorkshop.ts` | After `response.json()`: map to `TailorResult` (score, score_label, sections, job_context, credits_remaining, url_parse_warning, categories) |
| Recommendations UI | `connect-grow-hire/src/components/resume/TailorTab.tsx` | `convertSectionsToRecommendations`, `RecommendationCard`, `showResults` block (score card + recommendation list + Save to Library / Use as Main) |
| Apply tailor to parsed resume | `connect-grow-hire/src/utils/applyTailorToResume.ts` | `applyTailorToParsedResume` |

This is the full flow; changes for ATS intelligence and role-type detection would touch the backend prompt and possibly the request/response shape and the frontend display of score/recommendations.

---

## Quick reference: four exact snippets

**1. Full OpenAI system prompt (backend)**  
Single system message: `"You are an expert resume consultant. Always respond with valid JSON only."`  
All task instructions are in the user message (see Section 3 for the full user prompt).

**2. Request body sent to the backend (frontend → analyze)**  
JSON with optional keys: `job_url`, `job_title`, `company`, `location`, `job_description`. Only non-empty values are sent. No resume; backend loads it from Firestore by user id.

**3. Full response structure returned to the frontend**  
See Section 4: `status`, `score`, `score_label`, `sections` (summary, experience, skills.add/remove, keywords), `job_context`, `credits_remaining`; optionally `url_parse_warning`.

**4. Frontend component that renders tailor results**  
`connect-grow-hire/src/components/resume/TailorTab.tsx`: when `showResults === true`, the component renders the score card, `recommendations.map(rec => <RecommendationCard key={rec.id} rec={rec} />)`, and “Save to Library” / “Use as Main Resume”. Recommendations are built by `convertSectionsToRecommendations(result)` from `result.sections`.
