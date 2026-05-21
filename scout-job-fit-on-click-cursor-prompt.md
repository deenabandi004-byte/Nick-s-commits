# Cursor Prompt: On-Click Job Fit Analysis for Scout

## Context

Scout is a conversational job search assistant in Offerloop.ai. We've added resume-aware job fit analysis, but the current implementation auto-analyzes the first search result which is:
- Slow (blocks the initial results)
- Often analyzing the wrong job
- Too shallow (trying to show 5 jobs + analysis)
- Wasteful on API calls

## New Approach

**On-demand analysis**: Show search results immediately, let user click "Analyze Fit" on jobs they actually care about, then show deep personalized analysis.

## Files to Modify

### Backend
- `app/services/scout_service.py` - Add dedicated job analysis method
- `app/routes/scout.py` - Add new `/api/scout/analyze-job` endpoint

### Frontend
- `ScoutChatbot.tsx` - Add Analyze Fit button, handle expanded analysis view

---

## Backend Implementation

### Step 1: Add New Endpoint in `scout.py`

```python
@scout_bp.route("/analyze-job", methods=["POST"])
def analyze_job():
    """
    Analyze how well the user fits a specific job.
    
    Request body:
    {
        "job": {
            "title": "...",
            "company": "...",
            "location": "...",
            "url": "...",
            "snippet": "..."
        },
        "user_resume": { ... }
    }
    
    Response:
    {
        "status": "ok",
        "analysis": {
            "score": 45,
            "match_level": "stretch",
            "strengths": [...],
            "gaps": [...],
            "pitch": "...",
            "talking_points": [...]
        }
    }
    """
    payload = request.get_json(force=True, silent=True) or {}
    job = payload.get("job", {})
    user_resume = payload.get("user_resume")
    
    if not job or not user_resume:
        return jsonify({
            "status": "error",
            "message": "Missing job or resume data"
        }), 400
    
    try:
        result = asyncio.run(
            scout_service.analyze_job_fit(
                job=job,
                user_resume=user_resume,
            )
        )
        return jsonify(result)
    except Exception as exc:
        print(f"[Scout] Analyze job failed: {type(exc).__name__}: {exc}")
        return jsonify({
            "status": "error",
            "message": "Failed to analyze job fit"
        }), 500
```

### Step 2: Add Detailed Analysis Method in `scout_service.py`

```python
@dataclass
class DetailedJobFitAnalysis:
    """Comprehensive job fit analysis for a single job."""
    score: int  # 0-100
    match_level: str  # "strong", "good", "moderate", "stretch"
    strengths: List[Dict[str, str]]  # [{"point": "...", "evidence": "..."}]
    gaps: List[Dict[str, str]]  # [{"gap": "...", "mitigation": "..."}]
    pitch: str  # 2-3 sentence positioning statement
    talking_points: List[str]  # For networking/interviews
    keywords_to_use: List[str]  # Resume/cover letter keywords
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


async def analyze_job_fit(
    self,
    job: Dict[str, Any],
    user_resume: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Deep analysis of user fit for a specific job.
    Called on-demand when user clicks "Analyze Fit".
    """
    
    if not self._openai:
        return {"status": "error", "message": "Analysis unavailable"}
    
    # If job has URL, try to fetch full description for better analysis
    job_content = job.get("snippet", "")
    if job.get("url"):
        full_content = await self._fetch_url_content(job["url"])
        if full_content:
            job_content = full_content[:5000]
    
    try:
        prompt = f"""You are a career coach analyzing job fit. Provide detailed, actionable analysis.

## JOB POSTING
Title: {job.get('title', 'Unknown')}
Company: {job.get('company', 'Unknown')}
Location: {job.get('location', 'Unknown')}

Description:
{job_content if job_content else 'No detailed description available'}

## CANDIDATE RESUME
{json.dumps(user_resume, indent=2)[:5000]}

## INSTRUCTIONS
Analyze the fit and return JSON:

{{
    "score": <0-100>,
    "match_level": "strong" | "good" | "moderate" | "stretch",
    "strengths": [
        {{
            "point": "What matches well (specific skill/experience)",
            "evidence": "Concrete proof from their resume"
        }}
    ],
    "gaps": [
        {{
            "gap": "What's missing or weak",
            "mitigation": "How to address this in application/interview"
        }}
    ],
    "pitch": "A 2-3 sentence positioning statement they could use to introduce themselves for this role. Make it specific and compelling.",
    "talking_points": [
        "Specific point to bring up in networking/interview",
        "Another specific talking point"
    ],
    "keywords_to_use": ["keyword1", "keyword2", "keyword3"]
}}

## GUIDELINES
- score: 80+ = strong, 60-79 = good, 40-59 = moderate, <40 = stretch
- strengths: 2-4 items, be SPECIFIC with evidence from resume
- gaps: 1-3 items, always include mitigation strategy
- pitch: Write in first person, something they could actually say
- talking_points: 3-5 specific, actionable points
- keywords_to_use: Terms from job posting to include in their materials

Be honest but constructive. Focus on actionable insights.
"""

        completion = await asyncio.wait_for(
            self._openai.chat.completions.create(
                model="gpt-4o-mini",  # or gpt-4o for even better analysis
                messages=[
                    {
                        "role": "system", 
                        "content": "You are an expert career coach. Provide specific, actionable job fit analysis. Return only valid JSON."
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.4,
                max_tokens=800,
                response_format={"type": "json_object"},
            ),
            timeout=15.0
        )
        
        result = json.loads(completion.choices[0].message.content)
        
        return {
            "status": "ok",
            "analysis": result,
        }
        
    except asyncio.TimeoutError:
        return {"status": "error", "message": "Analysis timed out"}
    except Exception as e:
        print(f"[Scout] Job fit analysis failed: {e}")
        return {"status": "error", "message": "Analysis failed"}
```

### Step 3: Remove Auto-Analysis from Job Search

In `_handle_job_search()`, remove any automatic fit analysis. Just return the jobs:

```python
async def _handle_job_search(
    self, 
    message: str,
    extracted: Dict[str, Any],
    context: Dict[str, Any]
) -> ScoutResponse:
    """Handle job search queries using SERP API."""
    
    query = await self._build_job_search_query(message, extracted, context)
    jobs = await self._search_jobs(query)
    
    if not jobs:
        return await self._handle_no_jobs_found(message, extracted, context)
    
    # Simple, fast response - no analysis
    location = extracted.get("location", "your area")
    message = f"🔍 Found {len(jobs)} positions in {location}\n\nClick **Analyze Fit** on any job to see how well you match."
    
    return ScoutResponse(
        status="ok",
        message=message,
        job_listings=jobs,
        context=self._update_context(context, last_search=extracted),
    )
```

---

## Frontend Implementation

### Step 4: Update Types

```typescript
interface JobFitAnalysis {
  score: number;
  match_level: 'strong' | 'good' | 'moderate' | 'stretch';
  strengths: Array<{ point: string; evidence: string }>;
  gaps: Array<{ gap: string; mitigation: string }>;
  pitch: string;
  talking_points: string[];
  keywords_to_use: string[];
}

interface JobListing {
  title: string;
  company: string;
  location?: string;
  url?: string;
  snippet?: string;
}
```

### Step 5: Add State for Analysis

```typescript
const [analyzingJobId, setAnalyzingJobId] = useState<string | null>(null);
const [jobAnalyses, setJobAnalyses] = useState<Record<string, JobFitAnalysis>>({});
const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
```

### Step 6: Add Analysis Function

```typescript
const analyzeJob = async (job: JobListing, jobId: string) => {
  // Don't re-analyze if we already have it
  if (jobAnalyses[jobId]) {
    setExpandedJobId(jobId);
    return;
  }
  
  setAnalyzingJobId(jobId);
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/scout/analyze-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job,
        user_resume: userResume,
      }),
    });
    
    const data = await response.json();
    
    if (data.status === 'ok' && data.analysis) {
      setJobAnalyses(prev => ({
        ...prev,
        [jobId]: data.analysis,
      }));
      setExpandedJobId(jobId);
    }
  } catch (error) {
    console.error('[Scout] Analysis failed:', error);
  } finally {
    setAnalyzingJobId(null);
  }
};
```

### Step 7: Update Job Listing Render

```tsx
{message.jobListings?.map((job, idx) => {
  const jobId = `${message.id}-job-${idx}`;
  const analysis = jobAnalyses[jobId];
  const isExpanded = expandedJobId === jobId;
  const isAnalyzing = analyzingJobId === jobId;
  
  return (
    <div key={idx} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      {/* Job Header - Always visible */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-3">
          <button
            onClick={() => handleJobClick(job)}
            className="flex-1 text-left"
          >
            <div className="text-sm font-medium text-slate-900">
              {job.title}
            </div>
            <div className="text-xs text-slate-500">
              {job.company}
              {job.location && ` • ${job.location}`}
            </div>
          </button>
          
          <div className="flex items-center gap-2">
            {/* Analyze Fit Button */}
            {userResume && (
              <button
                onClick={() => analyzeJob(job, jobId)}
                disabled={isAnalyzing}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-all
                  ${analysis 
                    ? 'bg-green-50 text-green-700 border border-green-200' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
              >
                {isAnalyzing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : analysis ? (
                  `${analysis.score}% Match`
                ) : (
                  'Analyze Fit'
                )}
              </button>
            )}
            
            {/* View Job Button */}
            {job.url && (
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-xs font-medium text-white rounded"
                style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' }}
              >
                View
              </a>
            )}
          </div>
        </div>
      </div>
      
      {/* Expanded Analysis Panel */}
      {isExpanded && analysis && (
        <div className="border-t border-slate-100 bg-slate-50 p-4">
          {/* Score Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className={`text-2xl font-bold ${
              analysis.score >= 70 ? 'text-green-600' :
              analysis.score >= 50 ? 'text-yellow-600' : 'text-orange-600'
            }`}>
              {analysis.score}%
            </div>
            <div>
              <div className="text-sm font-medium text-slate-900">
                {analysis.match_level === 'strong' && '🎯 Strong Match'}
                {analysis.match_level === 'good' && '👍 Good Match'}
                {analysis.match_level === 'moderate' && '🤔 Moderate Match'}
                {analysis.match_level === 'stretch' && '🌱 Stretch Role'}
              </div>
              <div className="text-xs text-slate-500">
                Based on your resume
              </div>
            </div>
          </div>
          
          {/* Strengths */}
          <div className="mb-4">
            <div className="text-xs font-medium text-slate-700 mb-2">
              What aligns:
            </div>
            <div className="space-y-2">
              {analysis.strengths.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <div>
                    <span className="text-sm text-slate-800">{s.point}</span>
                    <span className="text-xs text-slate-500 ml-1"> - {s.evidence}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Gaps */}
          {analysis.gaps.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-medium text-slate-700 mb-2">
                Gaps to address:
              </div>
              <div className="space-y-2">
                {analysis.gaps.map((g, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-orange-500 mt-0.5">!</span>
                    <div>
                      <span className="text-sm text-slate-800">{g.gap}</span>
                      <div className="text-xs text-slate-600 mt-0.5">
                        💡 {g.mitigation}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Pitch */}
          <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
            <div className="text-xs font-medium text-blue-800 mb-1">
              💬 How to pitch yourself:
            </div>
            <div className="text-sm text-blue-900 italic">
              "{analysis.pitch}"
            </div>
          </div>
          
          {/* Talking Points */}
          <div className="mb-4">
            <div className="text-xs font-medium text-slate-700 mb-2">
              Talking points for outreach:
            </div>
            <ul className="space-y-1">
              {analysis.talking_points.map((point, i) => (
                <li key={i} className="text-sm text-slate-700 flex gap-2">
                  <span className="text-slate-400">•</span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
          
          {/* Keywords */}
          <div className="flex flex-wrap gap-1">
            {analysis.keywords_to_use.map((kw, i) => (
              <span
                key={i}
                className="px-2 py-0.5 bg-slate-200 text-slate-700 text-xs rounded"
              >
                {kw}
              </span>
            ))}
          </div>
          
          {/* Actions */}
          <div className="flex gap-2 mt-4 pt-3 border-t border-slate-200">
            <button
              onClick={() => handleJobClick(job)}
              className="flex-1 py-2 text-sm font-medium text-white rounded"
              style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' }}
            >
              Find Contacts in This Role
            </button>
            <button
              onClick={() => setExpandedJobId(null)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded"
            >
              Collapse
            </button>
          </div>
        </div>
      )}
    </div>
  );
})}
```

---

## Expected Behavior

### Initial Search Results (instant)
```
🔍 Found 10 positions in Los Angeles

Click Analyze Fit on any job to see how well you match.

┌────────────────────────────────────────────────────┐
│ Project Manager - Academic Initiatives             │
│ UC Los Angeles • Los Angeles, CA                   │
│                          [Analyze Fit] [View]      │
├────────────────────────────────────────────────────┤
│ Data Analyst                                       │
│ TechCorp • Los Angeles, CA                         │
│                          [Analyze Fit] [View]      │
└────────────────────────────────────────────────────┘
```

### After Clicking "Analyze Fit"
```
┌────────────────────────────────────────────────────┐
│ Project Manager - Academic Initiatives             │
│ UC Los Angeles • Los Angeles, CA                   │
│                            [45% Match] [View]      │
├────────────────────────────────────────────────────┤
│                                                    │
│  45%  🌱 Stretch Role                              │
│       Based on your resume                         │
│                                                    │
│  What aligns:                                      │
│  ✓ Data Science @ USC shows analytical rigor      │
│ - Coursework in statistics and data analysis   │
│  ✓ Offerloop demonstrates project ownership       │
│ - Built full-stack SaaS from scratch           │
│                                                    │
│  Gaps to address:                                  │
│  ! No formal PM title                              │
│    💡 Frame Offerloop as product leadership        │
│  ! Academic sector experience missing             │
│    💡 Emphasize university project collaborations  │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │ 💬 How to pitch yourself:                    │ │
│  │ "As someone who built Offerloop from zero   │ │
│  │ to production, I've managed the full        │ │
│  │ lifecycle of complex technical projects..." │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  Talking points:                                   │
│  • Cross-functional work coordinating design,     │
│    engineering, and go-to-market                  │
│  • Experience with stakeholder management         │
│    through user research at Offerloop             │
│                                                    │
│  Keywords: project management, stakeholders,      │
│  academic, planning, cross-functional             │
│                                                    │
│  [──── Find Contacts in This Role ────] [Collapse]│
│                                                    │
└────────────────────────────────────────────────────┘
```

---

## Testing Checklist

- [ ] Search results load instantly without analysis
- [ ] "Analyze Fit" button only shows when resume is available
- [ ] Clicking "Analyze Fit" shows loading state
- [ ] Analysis expands below the job card
- [ ] Score badge replaces "Analyze Fit" button after analysis
- [ ] Clicking score badge toggles expand/collapse
- [ ] Analysis is cached (clicking again doesn't re-fetch)
- [ ] "Find Contacts in This Role" fills search form
- [ ] Works gracefully without resume (no Analyze button)
- [ ] Error states handled (timeout, API failure)

---

## Future Enhancements

1. **Batch quick scores**: After initial load, fetch lightweight scores (just 0-100) for all jobs in background
2. **Sort by fit**: Add "Sort by match %" option
3. **Save analysis**: Let user save/export analysis for later
4. **Compare jobs**: Select 2-3 jobs and compare fit side-by-side
5. **Draft outreach**: "Write email to someone in this role" using the analysis context
