# Scout Enhanced Job Fit Analysis - Comprehensive Cursor Prompt

## Overview

Upgrade Scout's job fit analysis from a basic score/strengths/gaps view to a comprehensive, actionable system that:

1. **Resume-to-Job Requirement Mapping**: Show exactly which resume bullet points match which job requirements
2. **Tailored Resume Edit Suggestions**: Provide specific edits to optimize the resume for this job
3. **Custom Cover Letter Generation**: Create a tailored cover letter based on the fit analysis

This transforms the analysis from "here's how you fit" to "here's how to maximize your chances."

---

## Current Architecture

### Existing Endpoint
```
POST /api/scout/analyze-job
```

### Current Request
```json
{
  "job": {
    "title": "Software Engineer",
    "company": "Google",
    "location": "Mountain View, CA",
    "url": "https://...",
    "snippet": "We're looking for..."
  },
  "user_resume": {
    "resumeParsed": {...},
    "resumeText": "..."
  }
}
```

### Current Response
```json
{
  "status": "ok",
  "analysis": {
    "score": 75,
    "match_level": "good",
    "strengths": [
      {"point": "Strong Python experience", "evidence": "Built ML models in coursework"}
    ],
    "gaps": [
      {"gap": "Missing cloud experience", "mitigation": "Highlight transferable skills"}
    ],
    "pitch": "As a Data Science major with...",
    "talking_points": ["Mention capstone project", "Discuss Python portfolio"],
    "keywords_to_use": ["Python", "Machine Learning", "Data Analysis"]
  }
}
```

### Current Files
- `backend/app/routes/scout.py` - API endpoints
- `backend/app/services/scout_service.py` - Core logic
- `connect-grow-hire/src/components/ScoutChatbot.tsx` - Frontend

---

## Implementation Plan

### Phase 1: Enhanced Data Models

#### 1.1 Backend Data Models

Add to `backend/app/services/scout_service.py`:

```python
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any
from enum import Enum

class RequirementType(Enum):
    REQUIRED = "required"
    PREFERRED = "preferred"
    NICE_TO_HAVE = "nice_to_have"

class MatchStrength(Enum):
    STRONG = "strong"      # Direct, clear match
    PARTIAL = "partial"    # Related experience, not exact
    WEAK = "weak"          # Tangentially related
    NONE = "none"          # No match found

class EditType(Enum):
    ADD = "add"                    # Add new content
    MODIFY = "modify"              # Change existing content
    REORDER = "reorder"            # Move content higher/lower
    EMPHASIZE = "emphasize"        # Make more prominent
    ADD_KEYWORDS = "add_keywords"  # Incorporate specific keywords
    QUANTIFY = "quantify"          # Add metrics/numbers

@dataclass
class ResumeMatch:
    """A single resume bullet that matches a requirement."""
    section: str              # "Experience", "Projects", "Skills", "Education"
    company_or_context: str   # "Offerloop", "USC Capstone Project", etc.
    bullet: str               # The actual resume text
    relevance: str            # "direct", "partial", "transferable"

@dataclass
class RequirementMatch:
    """Maps a job requirement to matching resume content."""
    requirement: str                      # The job requirement text
    requirement_type: str                 # "required", "preferred", "nice_to_have"
    importance: str                       # "critical", "high", "medium", "low"
    is_matched: bool                      # Whether resume addresses this
    match_strength: str                   # "strong", "partial", "weak", "none"
    resume_matches: List[ResumeMatch]     # All matching resume bullets
    explanation: str                      # Human-readable explanation
    suggestion_if_missing: Optional[str]  # How to address if not matched

@dataclass
class ResumeEdit:
    """A suggested edit to improve resume for this job."""
    id: str                               # Unique ID for frontend tracking
    section: str                          # "Summary", "Experience", "Skills", "Projects"
    subsection: Optional[str]             # Company name or project name if applicable
    edit_type: str                        # "add", "modify", "reorder", "emphasize", "add_keywords", "quantify"
    priority: str                         # "high", "medium", "low"
    impact: str                           # "Addresses critical requirement", "Improves keyword match", etc.
    
    # Content
    current_content: Optional[str]        # Existing text (if modifying)
    suggested_content: str                # New/modified text
    
    # Context
    rationale: str                        # Why this helps
    requirements_addressed: List[str]     # Which job requirements this addresses
    keywords_added: List[str]             # Keywords incorporated
    
    # Preview
    before_after_preview: Optional[Dict[str, str]]  # {"before": "...", "after": "..."}

@dataclass
class CoverLetterParagraph:
    """A paragraph of the cover letter with metadata."""
    paragraph_type: str     # "opening", "experience_highlight", "skills_bridge", "culture_fit", "closing"
    content: str            # The paragraph text
    requirements_addressed: List[str]  # Which requirements this paragraph addresses
    resume_points_used: List[str]      # Which resume bullets were referenced

@dataclass
class CoverLetter:
    """Complete generated cover letter."""
    full_text: str                           # Complete letter ready to copy
    paragraphs: List[CoverLetterParagraph]   # Broken down for editing
    tone: str                                # "formal", "conversational", "enthusiastic"
    word_count: int
    
    # Metadata
    key_requirements_addressed: List[str]
    key_resume_points_used: List[str]
    customization_summary: str               # "Emphasized Python experience and startup background"
    
    # Variations
    alternate_openings: List[str]            # 2-3 alternative opening lines
    alternate_closings: List[str]            # 2-3 alternative closing lines

@dataclass
class EnhancedFitAnalysis:
    """Complete enhanced job fit analysis."""
    # === EXISTING FIELDS ===
    score: int                               # 0-100
    match_level: str                         # "strong", "good", "moderate", "stretch"
    strengths: List[Dict[str, str]]          # [{"point": "...", "evidence": "..."}]
    gaps: List[Dict[str, str]]               # [{"gap": "...", "mitigation": "..."}]
    pitch: str
    talking_points: List[str]
    keywords_to_use: List[str]
    
    # === NEW: REQUIREMENT MAPPING ===
    job_requirements: List[RequirementMatch]
    requirements_summary: Dict[str, int]     # {"total": 12, "matched": 8, "partial": 2, "missing": 2}
    match_breakdown: Dict[str, int]          # {"required": {"matched": 5, "total": 6}, "preferred": {...}}
    
    # === NEW: RESUME OPTIMIZATION ===
    resume_edits: List[ResumeEdit]
    edits_summary: Dict[str, int]            # {"high_priority": 3, "medium": 4, "low": 2}
    potential_score_after_edits: int         # Estimated improved score
    
    # === NEW: COVER LETTER (optional, generated on demand) ===
    cover_letter: Optional[CoverLetter] = None
```

#### 1.2 TypeScript Types

Create/update `connect-grow-hire/src/types/scout.ts`:

```typescript
// Requirement Matching
export interface ResumeMatch {
  section: string;
  company_or_context: string;
  bullet: string;
  relevance: 'direct' | 'partial' | 'transferable';
}

export interface RequirementMatch {
  requirement: string;
  requirement_type: 'required' | 'preferred' | 'nice_to_have';
  importance: 'critical' | 'high' | 'medium' | 'low';
  is_matched: boolean;
  match_strength: 'strong' | 'partial' | 'weak' | 'none';
  resume_matches: ResumeMatch[];
  explanation: string;
  suggestion_if_missing?: string;
}

// Resume Edits
export interface ResumeEdit {
  id: string;
  section: string;
  subsection?: string;
  edit_type: 'add' | 'modify' | 'reorder' | 'emphasize' | 'add_keywords' | 'quantify';
  priority: 'high' | 'medium' | 'low';
  impact: string;
  current_content?: string;
  suggested_content: string;
  rationale: string;
  requirements_addressed: string[];
  keywords_added: string[];
  before_after_preview?: {
    before: string;
    after: string;
  };
}

// Cover Letter
export interface CoverLetterParagraph {
  paragraph_type: 'opening' | 'experience_highlight' | 'skills_bridge' | 'culture_fit' | 'closing';
  content: string;
  requirements_addressed: string[];
  resume_points_used: string[];
}

export interface CoverLetter {
  full_text: string;
  paragraphs: CoverLetterParagraph[];
  tone: 'formal' | 'conversational' | 'enthusiastic';
  word_count: number;
  key_requirements_addressed: string[];
  key_resume_points_used: string[];
  customization_summary: string;
  alternate_openings: string[];
  alternate_closings: string[];
}

// Enhanced Analysis
export interface EnhancedFitAnalysis {
  // Existing
  score: number;
  match_level: 'strong' | 'good' | 'moderate' | 'stretch';
  strengths: Array<{ point: string; evidence: string }>;
  gaps: Array<{ gap: string; mitigation: string }>;
  pitch: string;
  talking_points: string[];
  keywords_to_use: string[];
  
  // New: Requirements
  job_requirements: RequirementMatch[];
  requirements_summary: {
    total: number;
    matched: number;
    partial: number;
    missing: number;
  };
  match_breakdown: {
    required: { matched: number; total: number };
    preferred: { matched: number; total: number };
    nice_to_have: { matched: number; total: number };
  };
  
  // New: Resume Edits
  resume_edits: ResumeEdit[];
  edits_summary: {
    high_priority: number;
    medium: number;
    low: number;
  };
  potential_score_after_edits: number;
  
  // New: Cover Letter (optional)
  cover_letter?: CoverLetter;
}
```

---

### Phase 2: Backend Implementation

#### 2.1 Update Analyze Job Endpoint

Modify `backend/app/routes/scout.py`:

```python
@scout_bp.route('/analyze-job', methods=['POST'])
@require_auth
def analyze_job():
    """
    Enhanced job fit analysis with requirement mapping and resume suggestions.
    
    Request:
    {
        "job": {
            "title": "...",
            "company": "...",
            "location": "...",
            "url": "...",
            "snippet": "..."
        },
        "user_resume": {...},
        "options": {
            "include_requirement_mapping": true,  // Default: true
            "include_resume_edits": true,         // Default: true
            "include_cover_letter": false         // Default: false (separate call)
        }
    }
    """
    try:
        data = request.get_json()
        job = data.get('job', {})
        user_resume = data.get('user_resume', {})
        options = data.get('options', {})
        
        if not job:
            return jsonify({
                'status': 'error',
                'message': 'Job information is required'
            }), 400
        
        # Get analysis options with defaults
        include_mapping = options.get('include_requirement_mapping', True)
        include_edits = options.get('include_resume_edits', True)
        include_cover_letter = options.get('include_cover_letter', False)
        
        # Perform enhanced analysis
        analysis = scout_service.analyze_job_fit_enhanced(
            job=job,
            user_resume=user_resume,
            include_requirement_mapping=include_mapping,
            include_resume_edits=include_edits,
            include_cover_letter=include_cover_letter
        )
        
        return jsonify({
            'status': 'ok',
            'analysis': analysis.to_dict()
        })
        
    except Exception as e:
        logger.error(f"[Scout] Enhanced analysis error: {e}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to analyze job fit'
        }), 500


@scout_bp.route('/generate-cover-letter', methods=['POST'])
@require_auth
def generate_cover_letter():
    """
    Generate a cover letter based on job and fit analysis.
    
    Request:
    {
        "job": {...},
        "user_resume": {...},
        "fit_analysis": {...},  // Optional: pass existing analysis to save recomputing
        "options": {
            "tone": "formal" | "conversational" | "enthusiastic",
            "length": "short" | "medium" | "long",
            "emphasis": ["technical_skills", "leadership", "culture_fit"]
        }
    }
    """
    try:
        data = request.get_json()
        job = data.get('job', {})
        user_resume = data.get('user_resume', {})
        fit_analysis = data.get('fit_analysis')
        options = data.get('options', {})
        
        cover_letter = scout_service.generate_cover_letter(
            job=job,
            user_resume=user_resume,
            fit_analysis=fit_analysis,
            tone=options.get('tone', 'conversational'),
            length=options.get('length', 'medium'),
            emphasis=options.get('emphasis', [])
        )
        
        return jsonify({
            'status': 'ok',
            'cover_letter': cover_letter.to_dict()
        })
        
    except Exception as e:
        logger.error(f"[Scout] Cover letter generation error: {e}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to generate cover letter'
        }), 500


@scout_bp.route('/apply-resume-edit', methods=['POST'])
@require_auth
def apply_resume_edit():
    """
    Preview or apply a resume edit suggestion.
    
    Request:
    {
        "edit": {...},           // The ResumeEdit object
        "user_resume": {...},
        "action": "preview" | "apply"
    }
    
    For "preview": Returns the resume section with edit applied
    For "apply": Updates the resume in Firestore (future feature)
    """
    try:
        data = request.get_json()
        edit = data.get('edit', {})
        user_resume = data.get('user_resume', {})
        action = data.get('action', 'preview')
        
        if action == 'preview':
            preview = scout_service.preview_resume_edit(edit, user_resume)
            return jsonify({
                'status': 'ok',
                'preview': preview
            })
        else:
            # Future: Actually apply the edit to stored resume
            return jsonify({
                'status': 'error',
                'message': 'Apply action not yet implemented'
            }), 501
            
    except Exception as e:
        logger.error(f"[Scout] Resume edit error: {e}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to process resume edit'
        }), 500
```

#### 2.2 Enhanced Analysis Service

Add to `backend/app/services/scout_service.py`:

```python
class ScoutService:
    
    # ... existing methods ...
    
    def analyze_job_fit_enhanced(
        self,
        job: Dict[str, Any],
        user_resume: Dict[str, Any],
        include_requirement_mapping: bool = True,
        include_resume_edits: bool = True,
        include_cover_letter: bool = False
    ) -> EnhancedFitAnalysis:
        """
        Perform comprehensive job fit analysis with requirement mapping,
        resume suggestions, and optional cover letter.
        """
        
        # Step 1: Fetch full job description if URL available
        job_description = self._get_full_job_description(job)
        
        # Step 2: Extract structured requirements from job description
        requirements = self._extract_job_requirements(job, job_description)
        
        # Step 3: Parse resume into structured format
        parsed_resume = self._parse_resume_structured(user_resume)
        
        # Step 4: Match requirements to resume
        requirement_matches = []
        if include_requirement_mapping:
            requirement_matches = self._match_requirements_to_resume(
                requirements, 
                parsed_resume
            )
        
        # Step 5: Generate resume edit suggestions
        resume_edits = []
        if include_resume_edits:
            resume_edits = self._generate_resume_edits(
                job,
                requirements,
                requirement_matches,
                parsed_resume
            )
        
        # Step 6: Calculate scores and summaries
        score, match_level = self._calculate_fit_score(requirement_matches)
        strengths, gaps = self._extract_strengths_gaps(requirement_matches)
        
        # Step 7: Generate pitch and talking points
        pitch = self._generate_pitch(job, strengths, parsed_resume)
        talking_points = self._generate_talking_points(job, requirement_matches, gaps)
        keywords = self._extract_keywords(requirements, job_description)
        
        # Step 8: Build summaries
        requirements_summary = self._build_requirements_summary(requirement_matches)
        match_breakdown = self._build_match_breakdown(requirement_matches)
        edits_summary = self._build_edits_summary(resume_edits)
        potential_score = self._estimate_score_after_edits(score, resume_edits)
        
        # Step 9: Generate cover letter if requested
        cover_letter = None
        if include_cover_letter:
            cover_letter = self._generate_cover_letter_internal(
                job=job,
                parsed_resume=parsed_resume,
                requirement_matches=requirement_matches,
                strengths=strengths,
                gaps=gaps,
                tone="conversational"
            )
        
        return EnhancedFitAnalysis(
            score=score,
            match_level=match_level,
            strengths=strengths,
            gaps=gaps,
            pitch=pitch,
            talking_points=talking_points,
            keywords_to_use=keywords,
            job_requirements=requirement_matches,
            requirements_summary=requirements_summary,
            match_breakdown=match_breakdown,
            resume_edits=resume_edits,
            edits_summary=edits_summary,
            potential_score_after_edits=potential_score,
            cover_letter=cover_letter
        )
    
    def _extract_job_requirements(
        self, 
        job: Dict[str, Any], 
        job_description: str
    ) -> List[Dict[str, Any]]:
        """Extract structured requirements from job description using GPT."""
        
        prompt = f"""Analyze this job posting and extract ALL requirements/qualifications.

JOB TITLE: {job.get('title', 'Unknown')}
COMPANY: {job.get('company', 'Unknown')}

JOB DESCRIPTION:
{job_description[:6000]}

Extract requirements into these categories:
1. REQUIRED - Must-have qualifications explicitly stated as required
2. PREFERRED - Nice-to-have, "preferred", "bonus", "plus" qualifications  
3. NICE_TO_HAVE - Implied preferences or soft requirements

For each requirement, identify:
- The specific requirement text
- Category (required/preferred/nice_to_have)
- Importance (critical/high/medium/low)
- Type (technical_skill, soft_skill, experience, education, certification, tool, other)

Return JSON array:
[
  {{
    "requirement": "3+ years of Python experience",
    "category": "required",
    "importance": "critical",
    "type": "experience"
  }},
  {{
    "requirement": "Experience with AWS or GCP",
    "category": "preferred",
    "importance": "high",
    "type": "technical_skill"
  }}
]

Be thorough - extract 10-20 requirements. Include both explicit and implicit requirements.
Return ONLY valid JSON array, no other text."""

        try:
            response = self._call_openai(prompt, max_tokens=2000)
            requirements = json.loads(response)
            return requirements
        except Exception as e:
            logger.error(f"[Scout] Failed to extract requirements: {e}")
            return []
    
    def _parse_resume_structured(
        self, 
        user_resume: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Parse resume into structured sections with individual bullets."""
        
        resume_parsed = user_resume.get('resumeParsed', {})
        resume_text = user_resume.get('resumeText', '')
        
        # If already parsed, enhance it
        if resume_parsed:
            return self._enhance_parsed_resume(resume_parsed)
        
        # Otherwise, parse from text
        prompt = f"""Parse this resume into structured sections.

RESUME:
{resume_text[:8000]}

Return JSON with this structure:
{{
  "summary": "Professional summary if present",
  "experience": [
    {{
      "company": "Company Name",
      "title": "Job Title",
      "dates": "Jan 2023 - Present",
      "bullets": [
        "Built and deployed ML models serving 1M+ users",
        "Led team of 5 engineers on core product features"
      ]
    }}
  ],
  "projects": [
    {{
      "name": "Project Name",
      "context": "Personal / Course / Hackathon",
      "bullets": [
        "Developed full-stack app using React and Python",
        "Integrated OpenAI API for natural language features"
      ]
    }}
  ],
  "education": [
    {{
      "school": "University Name",
      "degree": "BS Computer Science",
      "dates": "2020-2024",
      "details": ["GPA: 3.8", "Relevant coursework: ML, Data Structures"]
    }}
  ],
  "skills": {{
    "languages": ["Python", "JavaScript", "SQL"],
    "frameworks": ["React", "Flask", "TensorFlow"],
    "tools": ["Git", "AWS", "Docker"],
    "other": ["Agile", "Technical Writing"]
  }},
  "certifications": ["AWS Solutions Architect"],
  "achievements": ["Dean's List", "Hackathon Winner"]
}}

Return ONLY valid JSON."""

        try:
            response = self._call_openai(prompt, max_tokens=3000)
            return json.loads(response)
        except Exception as e:
            logger.error(f"[Scout] Failed to parse resume: {e}")
            return {"raw_text": resume_text}
    
    def _match_requirements_to_resume(
        self,
        requirements: List[Dict[str, Any]],
        parsed_resume: Dict[str, Any]
    ) -> List[RequirementMatch]:
        """Match each job requirement to relevant resume content."""
        
        # Build a flat list of all resume bullets with context
        resume_bullets = self._flatten_resume_bullets(parsed_resume)
        
        prompt = f"""Match each job requirement to relevant resume content.

JOB REQUIREMENTS:
{json.dumps(requirements, indent=2)}

RESUME CONTENT (with section context):
{json.dumps(resume_bullets, indent=2)}

For EACH requirement, find ALL matching resume bullets and assess match quality.

Return JSON array with one object per requirement:
[
  {{
    "requirement": "3+ years Python experience",
    "requirement_type": "required",
    "importance": "critical",
    "is_matched": true,
    "match_strength": "strong",
    "resume_matches": [
      {{
        "section": "Experience",
        "company_or_context": "TechCorp",
        "bullet": "Built data pipelines using Python, processing 10M records daily",
        "relevance": "direct"
      }},
      {{
        "section": "Projects",
        "company_or_context": "ML Capstone",
        "bullet": "Developed ML classification model in Python with 95% accuracy",
        "relevance": "direct"
      }}
    ],
    "explanation": "Strong match - multiple examples of Python experience across work and projects",
    "suggestion_if_missing": null
  }},
  {{
    "requirement": "Experience with Kubernetes",
    "requirement_type": "preferred",
    "importance": "medium",
    "is_matched": false,
    "match_strength": "none",
    "resume_matches": [],
    "explanation": "No Kubernetes experience found in resume",
    "suggestion_if_missing": "Consider adding any container orchestration or Docker experience, or highlight cloud deployment work"
  }}
]

Match strength levels:
- "strong": Direct, clear match with evidence
- "partial": Related experience but not exact match
- "weak": Tangentially related, transferable skills
- "none": No relevant experience found

Be thorough in finding matches - check all sections. A single requirement might match multiple resume bullets.
Return ONLY valid JSON array."""

        try:
            response = self._call_openai(prompt, max_tokens=4000, timeout=45)
            matches_data = json.loads(response)
            
            # Convert to dataclass objects
            matches = []
            for m in matches_data:
                resume_matches = [
                    ResumeMatch(
                        section=rm.get('section', ''),
                        company_or_context=rm.get('company_or_context', ''),
                        bullet=rm.get('bullet', ''),
                        relevance=rm.get('relevance', 'partial')
                    )
                    for rm in m.get('resume_matches', [])
                ]
                
                matches.append(RequirementMatch(
                    requirement=m.get('requirement', ''),
                    requirement_type=m.get('requirement_type', 'required'),
                    importance=m.get('importance', 'medium'),
                    is_matched=m.get('is_matched', False),
                    match_strength=m.get('match_strength', 'none'),
                    resume_matches=resume_matches,
                    explanation=m.get('explanation', ''),
                    suggestion_if_missing=m.get('suggestion_if_missing')
                ))
            
            return matches
            
        except Exception as e:
            logger.error(f"[Scout] Failed to match requirements: {e}")
            return []
    
    def _flatten_resume_bullets(
        self, 
        parsed_resume: Dict[str, Any]
    ) -> List[Dict[str, str]]:
        """Flatten resume into list of bullets with context."""
        
        bullets = []
        
        # Experience
        for exp in parsed_resume.get('experience', []):
            for bullet in exp.get('bullets', []):
                bullets.append({
                    'section': 'Experience',
                    'context': f"{exp.get('title', '')} at {exp.get('company', '')}",
                    'bullet': bullet
                })
        
        # Projects
        for proj in parsed_resume.get('projects', []):
            for bullet in proj.get('bullets', []):
                bullets.append({
                    'section': 'Projects',
                    'context': proj.get('name', ''),
                    'bullet': bullet
                })
        
        # Education
        for edu in parsed_resume.get('education', []):
            for detail in edu.get('details', []):
                bullets.append({
                    'section': 'Education',
                    'context': edu.get('school', ''),
                    'bullet': detail
                })
        
        # Skills (flatten)
        skills = parsed_resume.get('skills', {})
        if isinstance(skills, dict):
            for category, skill_list in skills.items():
                if isinstance(skill_list, list):
                    bullets.append({
                        'section': 'Skills',
                        'context': category,
                        'bullet': ', '.join(skill_list)
                    })
        
        # Summary
        if parsed_resume.get('summary'):
            bullets.append({
                'section': 'Summary',
                'context': 'Professional Summary',
                'bullet': parsed_resume['summary']
            })
        
        return bullets
    
    def _generate_resume_edits(
        self,
        job: Dict[str, Any],
        requirements: List[Dict[str, Any]],
        requirement_matches: List[RequirementMatch],
        parsed_resume: Dict[str, Any]
    ) -> List[ResumeEdit]:
        """Generate specific resume edit suggestions."""
        
        # Identify gaps and weak matches
        gaps = [m for m in requirement_matches if not m.is_matched or m.match_strength in ['weak', 'none']]
        partial_matches = [m for m in requirement_matches if m.match_strength == 'partial']
        
        prompt = f"""Generate specific resume edit suggestions to improve fit for this job.

JOB: {job.get('title', '')} at {job.get('company', '')}

GAPS (requirements not matched):
{json.dumps([{{'requirement': g.requirement, 'importance': g.importance, 'suggestion': g.suggestion_if_missing}} for g in gaps], indent=2)}

PARTIAL MATCHES (could be strengthened):
{json.dumps([{{'requirement': p.requirement, 'current_match': p.resume_matches[0].bullet if p.resume_matches else None, 'explanation': p.explanation}} for p in partial_matches], indent=2)}

CURRENT RESUME STRUCTURE:
{json.dumps(parsed_resume, indent=2)[:4000]}

Generate 5-10 specific, actionable resume edits. Types of edits:
1. ADD - Add new bullet points or skills
2. MODIFY - Rewrite existing bullets to better match requirements
3. ADD_KEYWORDS - Incorporate missing keywords into existing content
4. QUANTIFY - Add metrics/numbers to strengthen existing bullets
5. EMPHASIZE - Suggest reordering to highlight relevant experience

Return JSON array:
[
  {{
    "id": "edit_1",
    "section": "Experience",
    "subsection": "TechCorp",
    "edit_type": "modify",
    "priority": "high",
    "impact": "Addresses critical Python requirement",
    "current_content": "Built data pipelines using Python",
    "suggested_content": "Architected and maintained Python data pipelines processing 10M+ records daily, reducing processing time by 40%",
    "rationale": "Adds quantifiable impact and emphasizes scale to match '3+ years Python' requirement",
    "requirements_addressed": ["3+ years Python experience", "Experience with large-scale data"],
    "keywords_added": ["Python", "data pipelines", "scale"],
    "before_after_preview": {{
      "before": "Built data pipelines using Python",
      "after": "Architected and maintained Python data pipelines processing 10M+ records daily, reducing processing time by 40%"
    }}
  }},
  {{
    "id": "edit_2",
    "section": "Skills",
    "subsection": null,
    "edit_type": "add",
    "priority": "medium",
    "impact": "Addresses preferred cloud experience",
    "current_content": null,
    "suggested_content": "Add to tools: 'AWS (EC2, S3, Lambda)' if you have any AWS experience",
    "rationale": "Job prefers AWS experience - even basic exposure should be listed",
    "requirements_addressed": ["Experience with AWS"],
    "keywords_added": ["AWS", "EC2", "S3", "Lambda"]
  }}
]

Prioritize edits that address REQUIRED and HIGH importance requirements.
Be specific - include actual suggested text, not vague advice.
Return ONLY valid JSON array."""

        try:
            response = self._call_openai(prompt, max_tokens=3000, timeout=40)
            edits_data = json.loads(response)
            
            edits = []
            for e in edits_data:
                edits.append(ResumeEdit(
                    id=e.get('id', f"edit_{len(edits)}"),
                    section=e.get('section', ''),
                    subsection=e.get('subsection'),
                    edit_type=e.get('edit_type', 'modify'),
                    priority=e.get('priority', 'medium'),
                    impact=e.get('impact', ''),
                    current_content=e.get('current_content'),
                    suggested_content=e.get('suggested_content', ''),
                    rationale=e.get('rationale', ''),
                    requirements_addressed=e.get('requirements_addressed', []),
                    keywords_added=e.get('keywords_added', []),
                    before_after_preview=e.get('before_after_preview')
                ))
            
            # Sort by priority
            priority_order = {'high': 0, 'medium': 1, 'low': 2}
            edits.sort(key=lambda x: priority_order.get(x.priority, 1))
            
            return edits
            
        except Exception as e:
            logger.error(f"[Scout] Failed to generate resume edits: {e}")
            return []
    
    def generate_cover_letter(
        self,
        job: Dict[str, Any],
        user_resume: Dict[str, Any],
        fit_analysis: Optional[Dict[str, Any]] = None,
        tone: str = "conversational",
        length: str = "medium",
        emphasis: List[str] = None
    ) -> CoverLetter:
        """Generate a tailored cover letter."""
        
        # Parse resume if needed
        parsed_resume = self._parse_resume_structured(user_resume)
        
        # Get requirement matches if we have fit analysis
        requirement_matches = []
        strengths = []
        if fit_analysis:
            requirement_matches = fit_analysis.get('job_requirements', [])
            strengths = fit_analysis.get('strengths', [])
        
        return self._generate_cover_letter_internal(
            job=job,
            parsed_resume=parsed_resume,
            requirement_matches=requirement_matches,
            strengths=strengths,
            gaps=[],
            tone=tone,
            length=length,
            emphasis=emphasis or []
        )
    
    def _generate_cover_letter_internal(
        self,
        job: Dict[str, Any],
        parsed_resume: Dict[str, Any],
        requirement_matches: List[RequirementMatch],
        strengths: List[Dict[str, str]],
        gaps: List[Dict[str, str]],
        tone: str = "conversational",
        length: str = "medium",
        emphasis: List[str] = None
    ) -> CoverLetter:
        """Internal cover letter generation with full context."""
        
        # Determine word count target
        length_targets = {
            'short': 200,
            'medium': 350,
            'long': 500
        }
        target_words = length_targets.get(length, 350)
        
        # Build matched requirements context
        matched_reqs = [m for m in requirement_matches if m.is_matched][:5]
        matched_context = "\n".join([
            f"- {m.requirement}: {m.resume_matches[0].bullet if m.resume_matches else ''}"
            for m in matched_reqs
        ])
        
        prompt = f"""Write a tailored cover letter for this job application.

JOB: {job.get('title', '')} at {job.get('company', '')}
LOCATION: {job.get('location', '')}

CANDIDATE BACKGROUND:
{json.dumps(parsed_resume, indent=2)[:3000]}

KEY MATCHES (requirements matched by resume):
{matched_context}

STRENGTHS TO HIGHLIGHT:
{json.dumps(strengths[:4], indent=2)}

TONE: {tone}
- formal: Professional, traditional business letter style
- conversational: Warm but professional, shows personality
- enthusiastic: High energy, shows genuine excitement

TARGET LENGTH: ~{target_words} words

{f"EMPHASIS AREAS: {', '.join(emphasis)}" if emphasis else ""}

Write a compelling cover letter that:
1. Opens with a hook (not "I am writing to apply...")
2. Connects 2-3 specific resume experiences to job requirements
3. Shows knowledge/interest in the company
4. Demonstrates cultural fit
5. Closes with confidence and call to action

Return JSON:
{{
  "full_text": "The complete cover letter...",
  "paragraphs": [
    {{
      "paragraph_type": "opening",
      "content": "First paragraph...",
      "requirements_addressed": [],
      "resume_points_used": []
    }},
    {{
      "paragraph_type": "experience_highlight",
      "content": "Second paragraph about experience...",
      "requirements_addressed": ["3+ years Python", "data engineering"],
      "resume_points_used": ["Built data pipelines at TechCorp"]
    }}
  ],
  "word_count": 320,
  "key_requirements_addressed": ["Python", "data engineering", "team collaboration"],
  "key_resume_points_used": ["TechCorp data pipeline work", "ML capstone project"],
  "customization_summary": "Emphasized Python and data engineering experience, connected to company's focus on data-driven products",
  "alternate_openings": [
    "Alternative opening line 1...",
    "Alternative opening line 2..."
  ],
  "alternate_closings": [
    "Alternative closing 1...",
    "Alternative closing 2..."
  ]
}}

Make it genuine and specific - avoid generic phrases. Show don't tell.
Return ONLY valid JSON."""

        try:
            response = self._call_openai(prompt, max_tokens=2500, timeout=50)
            data = json.loads(response)
            
            paragraphs = [
                CoverLetterParagraph(
                    paragraph_type=p.get('paragraph_type', 'body'),
                    content=p.get('content', ''),
                    requirements_addressed=p.get('requirements_addressed', []),
                    resume_points_used=p.get('resume_points_used', [])
                )
                for p in data.get('paragraphs', [])
            ]
            
            return CoverLetter(
                full_text=data.get('full_text', ''),
                paragraphs=paragraphs,
                tone=tone,
                word_count=data.get('word_count', 0),
                key_requirements_addressed=data.get('key_requirements_addressed', []),
                key_resume_points_used=data.get('key_resume_points_used', []),
                customization_summary=data.get('customization_summary', ''),
                alternate_openings=data.get('alternate_openings', []),
                alternate_closings=data.get('alternate_closings', [])
            )
            
        except Exception as e:
            logger.error(f"[Scout] Failed to generate cover letter: {e}")
            return CoverLetter(
                full_text="Unable to generate cover letter. Please try again.",
                paragraphs=[],
                tone=tone,
                word_count=0,
                key_requirements_addressed=[],
                key_resume_points_used=[],
                customization_summary="",
                alternate_openings=[],
                alternate_closings=[]
            )
    
    # Helper methods for scores and summaries
    
    def _calculate_fit_score(
        self, 
        requirement_matches: List[RequirementMatch]
    ) -> Tuple[int, str]:
        """Calculate overall fit score from requirement matches."""
        
        if not requirement_matches:
            return 50, "moderate"
        
        # Weight by importance
        importance_weights = {
            'critical': 4,
            'high': 3,
            'medium': 2,
            'low': 1
        }
        
        match_scores = {
            'strong': 1.0,
            'partial': 0.6,
            'weak': 0.3,
            'none': 0
        }
        
        total_weight = 0
        weighted_score = 0
        
        for match in requirement_matches:
            weight = importance_weights.get(match.importance, 2)
            score = match_scores.get(match.match_strength, 0)
            
            # Required requirements count more
            if match.requirement_type == 'required':
                weight *= 1.5
            
            weighted_score += weight * score
            total_weight += weight
        
        if total_weight == 0:
            return 50, "moderate"
        
        score = int((weighted_score / total_weight) * 100)
        
        if score >= 80:
            match_level = "strong"
        elif score >= 60:
            match_level = "good"
        elif score >= 40:
            match_level = "moderate"
        else:
            match_level = "stretch"
        
        return score, match_level
    
    def _build_requirements_summary(
        self, 
        matches: List[RequirementMatch]
    ) -> Dict[str, int]:
        """Build summary of requirement matching."""
        
        summary = {
            'total': len(matches),
            'matched': 0,
            'partial': 0,
            'missing': 0
        }
        
        for m in matches:
            if m.match_strength == 'strong':
                summary['matched'] += 1
            elif m.match_strength in ['partial', 'weak']:
                summary['partial'] += 1
            else:
                summary['missing'] += 1
        
        return summary
    
    def _build_match_breakdown(
        self, 
        matches: List[RequirementMatch]
    ) -> Dict[str, Dict[str, int]]:
        """Build breakdown by requirement type."""
        
        breakdown = {
            'required': {'matched': 0, 'total': 0},
            'preferred': {'matched': 0, 'total': 0},
            'nice_to_have': {'matched': 0, 'total': 0}
        }
        
        for m in matches:
            req_type = m.requirement_type
            if req_type in breakdown:
                breakdown[req_type]['total'] += 1
                if m.match_strength in ['strong', 'partial']:
                    breakdown[req_type]['matched'] += 1
        
        return breakdown
    
    def _build_edits_summary(
        self, 
        edits: List[ResumeEdit]
    ) -> Dict[str, int]:
        """Build summary of edit suggestions."""
        
        summary = {
            'high_priority': 0,
            'medium': 0,
            'low': 0
        }
        
        for e in edits:
            if e.priority == 'high':
                summary['high_priority'] += 1
            elif e.priority == 'medium':
                summary['medium'] += 1
            else:
                summary['low'] += 1
        
        return summary
    
    def _estimate_score_after_edits(
        self, 
        current_score: int, 
        edits: List[ResumeEdit]
    ) -> int:
        """Estimate potential score improvement from edits."""
        
        # Rough estimation based on edit priorities
        high_impact = len([e for e in edits if e.priority == 'high'])
        medium_impact = len([e for e in edits if e.priority == 'medium'])
        
        boost = min(25, high_impact * 5 + medium_impact * 2)
        
        return min(100, current_score + boost)
```

---

### Phase 3: Frontend Implementation

#### 3.1 Enhanced Analysis Panel Component

Create `connect-grow-hire/src/components/EnhancedFitAnalysis.tsx`:

```typescript
import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  Circle,
  Edit3,
  FileText,
  Copy,
  Check,
  Sparkles,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { EnhancedFitAnalysis, RequirementMatch, ResumeEdit, CoverLetter } from '../types/scout';

interface EnhancedFitAnalysisPanelProps {
  analysis: EnhancedFitAnalysis;
  job: {
    title: string;
    company: string;
  };
  onGenerateCoverLetter: () => Promise<void>;
  isGeneratingCoverLetter: boolean;
}

export const EnhancedFitAnalysisPanel: React.FC<EnhancedFitAnalysisPanelProps> = ({
  analysis,
  job,
  onGenerateCoverLetter,
  isGeneratingCoverLetter
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'requirements' | 'edits' | 'cover_letter'>('overview');
  const [expandedRequirements, setExpandedRequirements] = useState<Set<number>>(new Set());
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const toggleRequirement = (index: number) => {
    const newExpanded = new Set(expandedRequirements);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRequirements(newExpanded);
  };

  const getMatchIcon = (strength: string) => {
    switch (strength) {
      case 'strong':
        return <CheckCircle2 className="text-green-500" size={16} />;
      case 'partial':
        return <Circle className="text-yellow-500 fill-yellow-200" size={16} />;
      case 'weak':
        return <Circle className="text-orange-400" size={16} />;
      default:
        return <AlertCircle className="text-red-400" size={16} />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header with Score */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">
              Fit Analysis: {job.title}
            </h3>
            <p className="text-sm text-gray-600">{job.company}</p>
          </div>
          <div className="text-right">
            <div className={`text-3xl font-bold ${
              analysis.score >= 80 ? 'text-green-600' :
              analysis.score >= 60 ? 'text-blue-600' :
              analysis.score >= 40 ? 'text-yellow-600' :
              'text-red-600'
            }`}>
              {analysis.score}%
            </div>
            <div className="text-sm text-gray-500 capitalize">
              {analysis.match_level} match
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="flex gap-4 mt-3 text-sm">
          <div className="flex items-center gap-1">
            <CheckCircle2 size={14} className="text-green-500" />
            <span>{analysis.requirements_summary.matched} matched</span>
          </div>
          <div className="flex items-center gap-1">
            <Circle size={14} className="text-yellow-500 fill-yellow-200" />
            <span>{analysis.requirements_summary.partial} partial</span>
          </div>
          <div className="flex items-center gap-1">
            <AlertCircle size={14} className="text-red-400" />
            <span>{analysis.requirements_summary.missing} missing</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'requirements', label: `Requirements (${analysis.job_requirements.length})` },
          { id: 'edits', label: `Resume Edits (${analysis.resume_edits.length})` },
          { id: 'cover_letter', label: 'Cover Letter' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4 max-h-[500px] overflow-y-auto">
        
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Pitch */}
            <div className="bg-blue-50 rounded-lg p-3">
              <h4 className="font-medium text-blue-900 mb-1">Your Pitch</h4>
              <p className="text-blue-800 text-sm">{analysis.pitch}</p>
            </div>

            {/* Strengths */}
            {analysis.strengths.length > 0 && (
              <div>
                <h4 className="font-medium text-green-700 mb-2 flex items-center gap-1">
                  <CheckCircle2 size={16} /> Strengths
                </h4>
                <ul className="space-y-2">
                  {analysis.strengths.map((s, i) => (
                    <li key={i} className="bg-green-50 rounded p-2 text-sm">
                      <span className="font-medium text-green-800">{s.point}</span>
                      {s.evidence && (
                        <span className="text-green-600"> - {s.evidence}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Gaps */}
            {analysis.gaps.length > 0 && (
              <div>
                <h4 className="font-medium text-orange-700 mb-2 flex items-center gap-1">
                  <AlertCircle size={16} /> Gaps to Address
                </h4>
                <ul className="space-y-2">
                  {analysis.gaps.map((g, i) => (
                    <li key={i} className="bg-orange-50 rounded p-2 text-sm">
                      <span className="font-medium text-orange-800">{g.gap}</span>
                      {g.mitigation && (
                        <span className="text-orange-600 block mt-1">
                          → {g.mitigation}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Keywords */}
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Keywords to Use</h4>
              <div className="flex flex-wrap gap-2">
                {analysis.keywords_to_use.map((keyword, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>

            {/* Talking Points */}
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Talking Points</h4>
              <ul className="space-y-1">
                {analysis.talking_points.map((point, i) => (
                  <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                    <ArrowRight size={14} className="mt-0.5 text-blue-500 flex-shrink-0" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Requirements Tab */}
        {activeTab === 'requirements' && (
          <div className="space-y-2">
            {analysis.job_requirements.map((req, index) => (
              <div
                key={index}
                className="border border-gray-200 rounded-lg overflow-hidden"
              >
                {/* Requirement Header */}
                <button
                  onClick={() => toggleRequirement(index)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 text-left"
                >
                  {getMatchIcon(req.match_strength)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {req.requirement}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        req.requirement_type === 'required'
                          ? 'bg-red-100 text-red-700'
                          : req.requirement_type === 'preferred'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {req.requirement_type}
                      </span>
                      <span className="text-xs text-gray-500">
                        {req.importance} priority
                      </span>
                    </div>
                  </div>
                  {expandedRequirements.has(index) ? (
                    <ChevronUp size={16} className="text-gray-400" />
                  ) : (
                    <ChevronDown size={16} className="text-gray-400" />
                  )}
                </button>

                {/* Expanded Content */}
                {expandedRequirements.has(index) && (
                  <div className="px-3 pb-3 border-t border-gray-100 bg-gray-50">
                    <p className="text-sm text-gray-600 mt-2 mb-2">
                      {req.explanation}
                    </p>

                    {/* Matching Resume Bullets */}
                    {req.resume_matches.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-gray-500 mb-1">
                          Matching Resume Content:
                        </p>
                        {req.resume_matches.map((match, mi) => (
                          <div
                            key={mi}
                            className="bg-white rounded p-2 mt-1 border border-gray-200 text-sm"
                          >
                            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                              <span className="font-medium">{match.section}</span>
                              <span>•</span>
                              <span>{match.company_or_context}</span>
                              <span className={`ml-auto px-1.5 py-0.5 rounded ${
                                match.relevance === 'direct'
                                  ? 'bg-green-100 text-green-700'
                                  : match.relevance === 'partial'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-gray-100 text-gray-600'
                              }`}>
                                {match.relevance}
                              </span>
                            </div>
                            <p className="text-gray-700">{match.bullet}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Suggestion if Missing */}
                    {!req.is_matched && req.suggestion_if_missing && (
                      <div className="mt-2 p-2 bg-yellow-50 rounded border border-yellow-200">
                        <p className="text-xs font-medium text-yellow-800 mb-1">
                          How to address:
                        </p>
                        <p className="text-sm text-yellow-700">
                          {req.suggestion_if_missing}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Resume Edits Tab */}
        {activeTab === 'edits' && (
          <div className="space-y-3">
            {/* Potential Score Improvement */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-green-800">
                  Potential score after edits:
                </span>
                <span className="text-xl font-bold text-green-600">
                  {analysis.potential_score_after_edits}%
                  <span className="text-sm font-normal text-green-500 ml-1">
                    (+{analysis.potential_score_after_edits - analysis.score})
                  </span>
                </span>
              </div>
            </div>

            {/* Edit Suggestions */}
            {analysis.resume_edits.map((edit, index) => (
              <div
                key={edit.id}
                className="border border-gray-200 rounded-lg overflow-hidden"
              >
                <div className="p-3">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Edit3 size={16} className="text-blue-500" />
                      <span className="font-medium text-gray-900">
                        {edit.section}
                        {edit.subsection && (
                          <span className="text-gray-500"> • {edit.subsection}</span>
                        )}
                      </span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded border ${getPriorityColor(edit.priority)}`}>
                      {edit.priority} priority
                    </span>
                  </div>

                  {/* Impact */}
                  <p className="text-sm text-blue-600 mb-2">{edit.impact}</p>

                  {/* Before/After */}
                  {edit.before_after_preview && (
                    <div className="space-y-2 mb-2">
                      {edit.before_after_preview.before && (
                        <div className="bg-red-50 rounded p-2 border border-red-100">
                          <p className="text-xs text-red-500 font-medium mb-1">Before:</p>
                          <p className="text-sm text-red-700 line-through">
                            {edit.before_after_preview.before}
                          </p>
                        </div>
                      )}
                      <div className="bg-green-50 rounded p-2 border border-green-100">
                        <p className="text-xs text-green-600 font-medium mb-1">
                          {edit.current_content ? 'After:' : 'Add:'}
                        </p>
                        <p className="text-sm text-green-800">
                          {edit.before_after_preview.after || edit.suggested_content}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Just Suggested Content if no preview */}
                  {!edit.before_after_preview && (
                    <div className="bg-blue-50 rounded p-2 border border-blue-100 mb-2">
                      <p className="text-xs text-blue-600 font-medium mb-1">Suggestion:</p>
                      <p className="text-sm text-blue-800">{edit.suggested_content}</p>
                    </div>
                  )}

                  {/* Rationale */}
                  <p className="text-xs text-gray-500 mb-2">{edit.rationale}</p>

                  {/* Keywords */}
                  {edit.keywords_added.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {edit.keywords_added.map((kw, i) => (
                        <span
                          key={i}
                          className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded"
                        >
                          +{kw}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Copy Button */}
                  <button
                    onClick={() => copyToClipboard(
                      edit.suggested_content,
                      edit.id
                    )}
                    className="mt-2 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                  >
                    {copiedText === edit.id ? (
                      <>
                        <Check size={12} className="text-green-500" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        Copy suggestion
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Cover Letter Tab */}
        {activeTab === 'cover_letter' && (
          <div>
            {analysis.cover_letter ? (
              <CoverLetterPanel
                coverLetter={analysis.cover_letter}
                onCopy={(text, id) => copyToClipboard(text, id)}
                copiedText={copiedText}
              />
            ) : (
              <div className="text-center py-8">
                <FileText size={48} className="mx-auto text-gray-300 mb-4" />
                <h4 className="font-medium text-gray-900 mb-2">
                  Generate a Tailored Cover Letter
                </h4>
                <p className="text-sm text-gray-500 mb-4">
                  Based on your fit analysis, we'll create a personalized cover letter
                  that highlights your strengths and addresses key requirements.
                </p>
                <button
                  onClick={onGenerateCoverLetter}
                  disabled={isGeneratingCoverLetter}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white 
                             rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isGeneratingCoverLetter ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      Generate Cover Letter
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Cover Letter Sub-Component
interface CoverLetterPanelProps {
  coverLetter: CoverLetter;
  onCopy: (text: string, id: string) => void;
  copiedText: string | null;
}

const CoverLetterPanel: React.FC<CoverLetterPanelProps> = ({
  coverLetter,
  onCopy,
  copiedText
}) => {
  const [showAlternates, setShowAlternates] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className={`text-xs px-2 py-1 rounded ${
            coverLetter.tone === 'formal'
              ? 'bg-gray-100 text-gray-700'
              : coverLetter.tone === 'enthusiastic'
              ? 'bg-orange-100 text-orange-700'
              : 'bg-blue-100 text-blue-700'
          }`}>
            {coverLetter.tone} tone
          </span>
          <span className="text-xs text-gray-500 ml-2">
            {coverLetter.word_count} words
          </span>
        </div>
        <button
          onClick={() => onCopy(coverLetter.full_text, 'full_letter')}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white 
                     rounded hover:bg-blue-700 text-sm"
        >
          {copiedText === 'full_letter' ? (
            <>
              <Check size={14} />
              Copied!
            </>
          ) : (
            <>
              <Copy size={14} />
              Copy Full Letter
            </>
          )}
        </button>
      </div>

      {/* Customization Summary */}
      <div className="bg-purple-50 rounded-lg p-3 text-sm">
        <span className="font-medium text-purple-800">Customization: </span>
        <span className="text-purple-700">{coverLetter.customization_summary}</span>
      </div>

      {/* Full Letter */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <div className="prose prose-sm max-w-none">
          {coverLetter.full_text.split('\n\n').map((paragraph, i) => (
            <p key={i} className="text-gray-800 mb-3 last:mb-0">
              {paragraph}
            </p>
          ))}
        </div>
      </div>

      {/* What's Addressed */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <h5 className="font-medium text-gray-700 mb-2">Requirements Addressed:</h5>
          <ul className="space-y-1">
            {coverLetter.key_requirements_addressed.map((req, i) => (
              <li key={i} className="flex items-center gap-1 text-gray-600">
                <CheckCircle2 size={12} className="text-green-500" />
                {req}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h5 className="font-medium text-gray-700 mb-2">Resume Points Used:</h5>
          <ul className="space-y-1">
            {coverLetter.key_resume_points_used.map((point, i) => (
              <li key={i} className="flex items-center gap-1 text-gray-600">
                <ArrowRight size={12} className="text-blue-500" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Alternate Options */}
      <div>
        <button
          onClick={() => setShowAlternates(!showAlternates)}
          className="text-sm text-blue-600 hover:underline flex items-center gap-1"
        >
          {showAlternates ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {showAlternates ? 'Hide' : 'Show'} alternate openings & closings
        </button>

        {showAlternates && (
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <h5 className="text-xs font-medium text-gray-500 mb-2">
                Alternate Openings:
              </h5>
              {coverLetter.alternate_openings.map((alt, i) => (
                <div
                  key={i}
                  className="bg-white rounded p-2 border border-gray-200 mb-2 text-sm"
                >
                  <p className="text-gray-700">{alt}</p>
                  <button
                    onClick={() => onCopy(alt, `opening_${i}`)}
                    className="text-xs text-gray-400 hover:text-gray-600 mt-1"
                  >
                    {copiedText === `opening_${i}` ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              ))}
            </div>
            <div>
              <h5 className="text-xs font-medium text-gray-500 mb-2">
                Alternate Closings:
              </h5>
              {coverLetter.alternate_closings.map((alt, i) => (
                <div
                  key={i}
                  className="bg-white rounded p-2 border border-gray-200 mb-2 text-sm"
                >
                  <p className="text-gray-700">{alt}</p>
                  <button
                    onClick={() => onCopy(alt, `closing_${i}`)}
                    className="text-xs text-gray-400 hover:text-gray-600 mt-1"
                  >
                    {copiedText === `closing_${i}` ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
```

#### 3.2 Update ScoutChatbot to Use Enhanced Analysis

Update the `analyzeJob` function in `ScoutChatbot.tsx`:

```typescript
// In ScoutChatbot.tsx

const [enhancedAnalyses, setEnhancedAnalyses] = useState<Record<string, EnhancedFitAnalysis>>({});
const [generatingCoverLetter, setGeneratingCoverLetter] = useState<string | null>(null);

const analyzeJob = async (job: any, jobId: string) => {
  if (analyzingJobId || !user?.uid) return;
  
  setAnalyzingJobId(jobId);
  
  try {
    const response = await fetch('/api/scout/analyze-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job,
        user_resume: userResume,
        options: {
          include_requirement_mapping: true,
          include_resume_edits: true,
          include_cover_letter: false  // Generate on demand
        }
      })
    });
    
    const data = await response.json();
    
    if (data.status === 'ok' && data.analysis) {
      setEnhancedAnalyses(prev => ({
        ...prev,
        [jobId]: data.analysis
      }));
      setExpandedJobId(jobId);
    }
  } catch (error) {
    console.error('Job analysis error:', error);
  } finally {
    setAnalyzingJobId(null);
  }
};

const generateCoverLetter = async (jobId: string, job: any) => {
  if (generatingCoverLetter) return;
  
  setGeneratingCoverLetter(jobId);
  
  try {
    const existingAnalysis = enhancedAnalyses[jobId];
    
    const response = await fetch('/api/scout/generate-cover-letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job,
        user_resume: userResume,
        fit_analysis: existingAnalysis,
        options: {
          tone: 'conversational',
          length: 'medium'
        }
      })
    });
    
    const data = await response.json();
    
    if (data.status === 'ok' && data.cover_letter) {
      setEnhancedAnalyses(prev => ({
        ...prev,
        [jobId]: {
          ...prev[jobId],
          cover_letter: data.cover_letter
        }
      }));
    }
  } catch (error) {
    console.error('Cover letter generation error:', error);
  } finally {
    setGeneratingCoverLetter(null);
  }
};

// In the render, replace the old analysis panel with:
{enhancedAnalyses[jobId] && expandedJobId === jobId && (
  <EnhancedFitAnalysisPanel
    analysis={enhancedAnalyses[jobId]}
    job={{ title: job.title, company: job.company }}
    onGenerateCoverLetter={() => generateCoverLetter(jobId, job)}
    isGeneratingCoverLetter={generatingCoverLetter === jobId}
  />
)}
```

---

### Phase 4: Conversational Cover Letter Generation

Add the ability to generate cover letters via natural conversation in Scout.

#### 4.1 Update Intent Classification

Add cover letter intent detection in `scout_service.py`:

```python
# In _classify_intent method, add:

# Cover letter patterns
cover_letter_pattern = r'\b(write|create|generate|draft|make)\b.*\b(cover letter|covering letter)\b'
if re.search(cover_letter_pattern, message, re.IGNORECASE):
    return IntentType.COVER_LETTER, self._extract_cover_letter_context(message, context)
```

#### 4.2 Add Cover Letter Handler

```python
def _handle_cover_letter_request(
    self,
    message: str,
    context: Dict[str, Any],
    conversation_history: List[Dict[str, str]]
) -> ScoutResponse:
    """Handle conversational cover letter generation."""
    
    # Check if we have job context from conversation
    job = self._extract_job_from_conversation(conversation_history)
    
    if not job:
        return ScoutResponse(
            status="needs_input",
            message="I'd be happy to write a cover letter! Could you share the job posting URL or tell me about the position you're applying for?",
            intent="COVER_LETTER"
        )
    
    user_resume = context.get('user_resume', {})
    if not user_resume:
        return ScoutResponse(
            status="needs_input",
            message="I'll need your resume to write a personalized cover letter. Could you upload your resume first?",
            intent="COVER_LETTER"
        )
    
    # Determine tone from message
    tone = "conversational"
    if any(word in message.lower() for word in ['formal', 'professional', 'traditional']):
        tone = "formal"
    elif any(word in message.lower() for word in ['enthusiastic', 'excited', 'passionate']):
        tone = "enthusiastic"
    
    # Generate cover letter
    cover_letter = self.generate_cover_letter(
        job=job,
        user_resume=user_resume,
        fit_analysis=None,  # Will compute fresh
        tone=tone
    )
    
    return ScoutResponse(
        status="ok",
        message=f"Here's a tailored cover letter for the {job.get('title', 'position')} role at {job.get('company', 'the company')}:\n\n{cover_letter.full_text}",
        intent="COVER_LETTER",
        context={
            'cover_letter': cover_letter.to_dict(),
            'job': job
        }
    )
```

---

## Testing Checklist

### Requirement Mapping
- [ ] Extracts 10-20 requirements from various job postings
- [ ] Correctly categorizes as required/preferred/nice_to_have
- [ ] Matches resume bullets to requirements accurately
- [ ] Shows "direct", "partial", "transferable" relevance correctly
- [ ] Suggestions for missing requirements are actionable

### Resume Edits
- [ ] Generates 5-10 relevant edit suggestions
- [ ] Priority ordering is sensible (high priority = critical requirements)
- [ ] Before/after previews are clear
- [ ] Keywords added are relevant to job
- [ ] Edit suggestions are specific, not generic advice
- [ ] Potential score improvement estimate is reasonable

### Cover Letter
- [ ] Generates coherent, professional cover letter
- [ ] Tone variations work (formal/conversational/enthusiastic)
- [ ] Incorporates actual resume points
- [ ] Addresses key job requirements
- [ ] Alternate openings/closings are distinct and useful
- [ ] Copy functionality works
- [ ] Conversational trigger ("write me a cover letter") works

### Integration
- [ ] Enhanced analysis loads without breaking existing flow
- [ ] Tab navigation works smoothly
- [ ] Loading states display correctly
- [ ] Errors handled gracefully
- [ ] Performance acceptable (< 20s for full analysis)

---

## Performance Considerations

### API Call Optimization
- Requirement extraction: ~2s
- Requirement matching: ~4s
- Resume edits: ~3s
- Cover letter: ~5s
- Total: ~14s for full analysis

### Caching Opportunities
- Cache parsed resume structure (1 hour TTL)
- Cache extracted requirements per job URL (1 hour TTL)
- Don't cache cover letters (too personalized)

### Timeout Handling
```python
# Suggested timeouts
REQUIREMENT_EXTRACTION_TIMEOUT = 15
REQUIREMENT_MATCHING_TIMEOUT = 25
RESUME_EDITS_TIMEOUT = 20
COVER_LETTER_TIMEOUT = 30
TOTAL_ANALYSIS_TIMEOUT = 60
```

---

## Notes

- Enhanced analysis is backward compatible - existing clients still work
- Cover letter generation is on-demand to save API costs
- Resume edits are suggestions only - "apply" functionality is future work
- Consider adding PDF export for cover letters later
- Mobile responsiveness for the analysis panel is important

---

*Generated for Offerloop Scout Enhanced Job Fit Analysis*
