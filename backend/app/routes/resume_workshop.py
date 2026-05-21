"""
Resume Workshop API endpoints - dedicated routes for resume analysis and optimization.
"""
from __future__ import annotations

import logging
import json
import uuid
import base64
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional

from flask import Blueprint, jsonify, request

from app.extensions import require_firebase_auth, get_db
from app.services.openai_client import get_async_openai_client
from app.utils.async_runner import run_async
from app.services.auth import deduct_credits_atomic, refund_credits_atomic

logger = logging.getLogger('resume_workshop')

resume_workshop_bp = Blueprint("resume_workshop", __name__, url_prefix="/api/resume-workshop")


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def _fetch_user_resume_data(user_id: str) -> Dict[str, Any]:
    """
    Fetch user's resume data from Firestore.
    Checks multiple possible locations for resume text to handle any inconsistencies.
    """
    db = get_db()
    if not db:
        logger.error(f"[ResumeWorkshop] Database not available")
        raise ValueError("Database not available")
    
    logger.info(f"[ResumeWorkshop] Fetching resume data for user {user_id[:8]}...")
    
    user_doc = db.collection('users').document(user_id).get()
    if not user_doc.exists:
        logger.error(f"[ResumeWorkshop] User {user_id[:8]}... not found")
        raise ValueError("User not found")
    
    user_data = user_doc.to_dict()
    
    # Log available keys for debugging
    resume_related_keys = [k for k in user_data.keys() if 'resume' in k.lower() or 'text' in k.lower()]
    logger.info(f"[ResumeWorkshop] User data keys related to resume: {resume_related_keys}")
    
    # Check multiple possible locations for resume text
    resume_text = None
    source = None
    
    # Priority 1: originalResumeText (guaranteed to be the original uploaded resume)
    if user_data.get('originalResumeText'):
        resume_text = user_data['originalResumeText']
        source = 'originalResumeText'
        logger.info(f"[ResumeWorkshop] ✅ Found resume at originalResumeText ({len(resume_text)} chars)")
    
    # Priority 2: resumeText (main field)
    elif user_data.get('resumeText'):
        resume_text = user_data['resumeText']
        source = 'resumeText'
        logger.info(f"[ResumeWorkshop] ✅ Found resume at resumeText ({len(resume_text)} chars)")
    
    # Priority 3: rawText (alternative field name)
    elif user_data.get('rawText'):
        resume_text = user_data['rawText']
        source = 'rawText'
        logger.info(f"[ResumeWorkshop] ✅ Found resume at rawText ({len(resume_text)} chars)")
    
    # Priority 4: Check nested in profile object
    elif user_data.get('profile', {}).get('resumeText'):
        resume_text = user_data['profile']['resumeText']
        source = 'profile.resumeText'
        logger.info(f"[ResumeWorkshop] ✅ Found resume at profile.resumeText ({len(resume_text)} chars)")
    
    # Priority 5: Check resumeParsed for text
    elif user_data.get('resumeParsed', {}).get('rawText'):
        resume_text = user_data['resumeParsed']['rawText']
        source = 'resumeParsed.rawText'
        logger.info(f"[ResumeWorkshop] ✅ Found resume at resumeParsed.rawText ({len(resume_text)} chars)")
    
    else:
        # Log what we found for debugging
        logger.warning(f"[ResumeWorkshop] ❌ No resume text found for user {user_id[:8]}...")
        logger.warning(f"[ResumeWorkshop] Available fields: resumeUrl={bool(user_data.get('resumeUrl'))}, "
                      f"resumeFileName={user_data.get('resumeFileName')}, "
                      f"resumeParsed={bool(user_data.get('resumeParsed'))}")
    
    result = {
        'resume_text': resume_text or '',
        'resume_url': user_data.get('resumeUrl') or user_data.get('originalResumeUrl'),
        'resume_parsed': user_data.get('resumeParsed') or user_data.get('originalResumeParsed') or {},
        'resume_file_name': user_data.get('resumeFileName'),
        'source': source,
    }
    
    logger.info(f"[ResumeWorkshop] Resume fetch result: source={source}, "
               f"text_length={len(result['resume_text'])}, "
               f"has_url={bool(result['resume_url'])}, "
               f"has_parsed={bool(result['resume_parsed'])}")
    
    return result


def _deduct_credits(user_id: str, amount: int) -> int:
    """
    Deduct credits from user atomically and return new balance.
    Uses atomic transaction to prevent race conditions.
    """
    success, new_credits = deduct_credits_atomic(user_id, amount, "resume_workshop")
    if not success:
        raise ValueError(f"Insufficient credits. You have {new_credits} credits but need {amount}.")
    return new_credits


async def _parse_job_url(job_url: str) -> Optional[Dict[str, Any]]:
    """Try to parse job details from a URL."""
    try:
        from app.services.interview_prep.job_posting_parser import fetch_job_posting
        
        # fetch_job_posting returns (text_content, metadata)
        content, metadata = await fetch_job_posting(job_url)
        
        if not content:
            return None
        
        # If metadata already has good info, use it directly
        if metadata.get('job_title') and metadata.get('company_name'):
            return {
                "job_title": str(metadata.get('job_title', '') or ''),
                "company": str(metadata.get('company_name', '') or ''),
                "location": str(metadata.get('location', '') or ''),
                "job_description": str(metadata.get('description', content[:3000]) or '')
            }
        
        # Otherwise, use GPT to extract structured job info
        openai_client = get_async_openai_client()
        if not openai_client:
            return None
        
        prompt = f"""Extract job information from this content. Return JSON only.

Content:
{content[:6000]}

Return JSON:
{{
    "job_title": "...",
    "company": "...",
    "location": "...",
    "job_description": "..."
}}"""

        response = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            response_format={"type": "json_object"}
        )
        
        result = json.loads(response.choices[0].message.content)
        # Ensure all values are strings
        return {
            "job_title": str(result.get('job_title', '') or ''),
            "company": str(result.get('company', '') or ''),
            "location": str(result.get('location', '') or ''),
            "job_description": str(result.get('job_description', '') or '')
        }
        
    except Exception as e:
        logger.warning(f"[ResumeWorkshop] Job URL parsing failed: {e}")
        return None


async def _fix_resume(resume_text: str, openai_client) -> Dict[str, Any]:
    """Fix resume without job context - improve formatting, clarity, bullets, impact."""
    
    prompt = f"""You are an expert resume editor. Improve this resume for:
1. Formatting and structure
2. Clarity and conciseness
3. Impact-focused bullet points (quantify achievements where possible)
4. Professional language
5. Grammar and punctuation

Do NOT tailor for any specific job - make general improvements that would help for any role.

## RESUME
{resume_text[:10000]}

Return the COMPLETE improved resume text. Keep all sections and content, just improve how it's written.
Return only the resume text, no explanations or JSON."""

    response = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are an expert resume editor. Return only the improved resume text."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.3,
        max_tokens=8000
    )
    
    improved_text = response.choices[0].message.content.strip()
    
    # Generate PDF
    from app.services.pdf_builder import build_resume_pdf_from_text
    pdf_bytes = await build_resume_pdf_from_text(improved_text)
    pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
    
    return {
        'improved_resume_text': improved_text,
        'pdf_base64': pdf_base64
    }


async def _score_resume(resume_text: str, openai_client) -> Dict[str, Any]:
    """Score resume and provide improvement suggestions (without job tailoring)."""
    
    prompt = f"""You are an expert resume analyst. Score this resume and provide improvement suggestions.

## RESUME
{resume_text[:10000]}

## RESPONSE FORMAT
Return JSON:
{{
    "score": 75,
    "score_label": "Good",
    "categories": [
        {{
            "name": "Impact & Results",
            "score": 70,
            "explanation": "Brief explanation of what's working and what could improve",
            "suggestions": [
                "Specific actionable suggestion 1",
                "Specific actionable suggestion 2"
            ]
        }},
        {{
            "name": "Clarity & Structure",
            "score": 75,
            "explanation": "Brief explanation",
            "suggestions": ["Suggestion"]
        }},
        {{
            "name": "Keywords / ATS Readiness",
            "score": 80,
            "explanation": "Brief explanation",
            "suggestions": ["Suggestion"]
        }},
        {{
            "name": "Professional Presentation",
            "score": 70,
            "explanation": "Brief explanation",
            "suggestions": ["Suggestion"]
        }}
    ],
    "summary": "2-3 sentence overall summary with key strengths and areas for improvement"
}}

Guidelines:
- Score from 0-100 where 70+ is good, 80+ is very good, 90+ is excellent
- Be honest but constructive
- Each suggestion should be specific and actionable
- Focus on general improvements, not job-specific tailoring
- Score_label should be: "Needs Work" (0-59), "Good" (60-74), "Very Good" (75-89), "Excellent" (90-100)"""

    response = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are an expert resume analyst. Return only valid JSON."},
            {"role": "user", "content": prompt}
        ],
        response_format={"type": "json_object"},
        temperature=0.4,
        max_tokens=3000
    )
    
    return json.loads(response.choices[0].message.content)


async def _apply_improvements(resume_text: str, suggestions: List[str], openai_client) -> Dict[str, Any]:
    """Apply improvement suggestions to generate an improved resume."""
    
    suggestions_text = "\n".join([f"- {s}" for s in suggestions])
    
    prompt = f"""Apply these improvements to the resume:

## IMPROVEMENTS TO APPLY
{suggestions_text}

## RESUME
{resume_text[:10000]}

Return the COMPLETE improved resume text with ALL the improvements applied.
Keep all sections and content, just improve based on the suggestions.
Return only the resume text, no explanations."""

    response = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "Apply the improvements and return the updated resume text only."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.3,
        max_tokens=8000
    )
    
    improved_text = response.choices[0].message.content.strip()
    
    # Generate PDF
    from app.services.pdf_builder import build_resume_pdf_from_text
    pdf_bytes = await build_resume_pdf_from_text(improved_text)
    pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
    
    return {
        'improved_resume_text': improved_text,
        'pdf_base64': pdf_base64
    }


async def _analyze_resume_sections(
    resume_text: str,
    job_title: str,
    company: str,
    location: str,
    job_description: str,
    openai_client
) -> Dict[str, Any]:
    """
    Analyze resume against job posting and return section-by-section suggestions.
    """
    # Ensure all string inputs are actually strings
    resume_text = str(resume_text) if resume_text else ""
    job_title = str(job_title) if job_title else ""
    company = str(company) if company else ""
    location = str(location) if location else ""
    job_description = str(job_description) if job_description else ""
    
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
    }},
    "keyword_analysis": {{
        "match_percentage": <0-100 percentage of required+preferred skills found in resume>,
        "required_present": [<skills from JD that ARE in the resume>],
        "required_missing": [<skills from JD that are NOT in the resume>],
        "preferred_present": [<preferred/nice-to-have skills that ARE in the resume>],
        "preferred_missing": [<preferred/nice-to-have skills NOT in the resume>]
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

    messages = [
        {
            "role": "system",
            "content": "You are an expert resume consultant. Always respond with valid JSON only."
        },
        {
            "role": "user",
            "content": prompt
        }
    ]
    create_kwargs = dict(
        messages=messages,
        temperature=0.5,
        max_tokens=4000,
        response_format={"type": "json_object"},
        timeout=120.0,
    )
    try:
        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            **create_kwargs
        )
    except Exception as e:
        logger.warning(f"[ResumeWorkshop] gpt-4o failed ({type(e).__name__}), falling back to gpt-4o-mini")
        response = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            **create_kwargs
        )

    # Parse response - runs for BOTH gpt-4o and gpt-4o-mini
    try:
        result_text = response.choices[0].message.content.strip()
        result = json.loads(result_text)

        # Validate required fields
        if "score" not in result:
            logger.warning(f"[ResumeWorkshop] AI response missing 'score' field, using default 50")
            result["score"] = 50
        else:
            # Ensure score is an integer and in valid range
            try:
                score = int(result["score"])
                if score < 0 or score > 100:
                    logger.warning(f"[ResumeWorkshop] AI returned invalid score {score}, clamping to 0-100")
                    score = max(0, min(100, score))
                result["score"] = score
                logger.info(f"[ResumeWorkshop] Resume analysis score: {score}/100")
            except (ValueError, TypeError):
                logger.warning(f"[ResumeWorkshop] AI returned non-numeric score: {result['score']}, using default 50")
                result["score"] = 50

        if "score_label" not in result:
            if result["score"] >= 90:
                result["score_label"] = "Excellent"
            elif result["score"] >= 75:
                result["score_label"] = "Good"
            elif result["score"] >= 60:
                result["score_label"] = "Fair"
            else:
                result["score_label"] = "Needs Work"

        if "sections" not in result:
            result["sections"] = {}

        return result
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse GPT response as JSON: {e}")
        raise ValueError("Failed to analyze resume. Please try again.")
    except Exception as e:
        logger.error(f"Error in resume analysis: {e}")
        raise


async def _apply_recommendation(
    resume_text: str,
    recommendation: Dict[str, Any],
    job_context: Dict[str, Any],
    openai_client
) -> Dict[str, Any]:
    """Apply a single recommendation to the resume and generate updated PDF."""
    
    current_text = recommendation.get('current_text', '')
    suggested_text = recommendation.get('suggested_text', '')
    
    # Apply the change to resume text
    if current_text and suggested_text and current_text in resume_text:
        updated_resume_text = resume_text.replace(current_text, suggested_text, 1)
    else:
        # If exact match not found, use AI to apply the change
        prompt = f"""Apply this specific recommendation to the resume.

RECOMMENDATION:
Title: {recommendation.get('title', '')}
Section: {recommendation.get('section', '')}
Current: {current_text}
Suggested: {suggested_text}
Explanation: {recommendation.get('explanation', '')}

RESUME:
{resume_text[:10000]}

Return the COMPLETE updated resume text with this one change applied. 
Keep all other content exactly the same.
Return only the resume text, no JSON or explanation."""

        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "Apply the recommendation and return the updated resume text only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            max_tokens=8000
        )
        
        updated_resume_text = response.choices[0].message.content.strip()
    
    # Generate PDF from updated text
    from app.services.pdf_builder import build_resume_pdf_from_text
    
    pdf_bytes = await build_resume_pdf_from_text(updated_resume_text)
    pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
    
    return {
        'updated_resume_text': updated_resume_text,
        'pdf_base64': pdf_base64
    }


def _save_to_resume_library(
    user_id: str,
    job_title: str,
    company: str,
    location: str,
    pdf_base64: str,
    score: Optional[int] = None,
    source_resume_id: Optional[str] = None
) -> str:
    """Save the updated resume to the user's Resume Library."""
    db = get_db()
    if not db:
        raise ValueError("Database not available")
    
    # Generate display name with timestamp to avoid collisions
    sanitized_title = job_title.replace(' ', '_').replace('/', '-')[:40]
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    display_name = f"{sanitized_title}_resume_{timestamp}"
    
    # Create library entry
    entry_id = str(uuid.uuid4())
    entry = {
        'id': entry_id,
        'display_name': display_name,
        'job_title': job_title,
        'company': company,
        'location': location,
        'created_at': datetime.now().isoformat(),
        'pdf_base64': pdf_base64,
        'source_base_resume_id': source_resume_id,
        'score': score
    }
    
    # Save to user's resume_library subcollection
    db.collection('users').document(user_id).collection('resume_library').document(entry_id).set(entry)
    
    logger.info(f"[ResumeWorkshop] Saved resume to library for user {user_id[:8]}... Entry ID: {entry_id}")
    
    return entry_id


# ============================================================================
# API ENDPOINTS
# ============================================================================

@resume_workshop_bp.route("/analyze", methods=["POST"])
@require_firebase_auth
def analyze():
    """
    Analyze resume against job and generate score + recommendations.
    Costs 5 credits.
    
    Request body:
    {
        "job_url": "optional URL to parse",
        "job_title": "required if no URL or URL fails",
        "company": "required if no URL or URL fails",
        "location": "required if no URL or URL fails",
        "job_description": "required if no URL or URL fails"
    }
    
    Response:
    {
        "status": "ok",
        "score": { ... },
        "recommendations": [ ... ],
        "parsed_job": { ... } // if URL was parsed
        "credits_remaining": 123
    }
    """
    payload = request.get_json(force=True, silent=True) or {}
    
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated"
        }), 401
    
    try:
        # Get user's resume
        resume_data = _fetch_user_resume_data(user_id)
        resume_text = resume_data.get('resume_text', '')
        
        if not resume_text or len(resume_text) < 100:
            return jsonify({
                "status": "error",
                "message": "No resume found. Please upload your resume in Account Settings first.",
                "error_code": "NO_RESUME"
            }), 400
        
        # Try to parse job URL if provided
        job_url = payload.get('job_url', '').strip()
        parsed_job = None
        
        if job_url:
            parsed_job = run_async(_parse_job_url(job_url), timeout=45.0)
        
        # Get job context (from parsed URL or manual inputs)
        if parsed_job:
            job_title = str(parsed_job.get('job_title', payload.get('job_title', '')) or '')
            company = str(parsed_job.get('company', payload.get('company', '')) or '')
            location = str(parsed_job.get('location', payload.get('location', '')) or '')
            parsed_desc = parsed_job.get('job_description', payload.get('job_description', ''))
            job_description = str(parsed_desc if parsed_desc else '')
        else:
            job_title = str(payload.get('job_title', '') or '').strip()
            company = str(payload.get('company', '') or '').strip()
            location = str(payload.get('location', '') or '').strip()
            job_desc_raw = payload.get('job_description', '')
            job_description = str(job_desc_raw if job_desc_raw else '').strip()
        
        # Ensure all fields are strings (handle cases where they might be dicts or other types)
        job_title = str(job_title) if job_title else ''
        company = str(company) if company else ''
        location = str(location) if location else ''
        job_description = str(job_description) if job_description else ''
        
        # Validate required fields - only job_description is required for manual entry
        # If URL parsing failed, we still need job_description
        if not job_description or not job_description.strip():
            return jsonify({
                "status": "error",
                "message": "Job description is required.",
                "url_parse_error": "Could not read job URL. Please provide a job description manually." if job_url and not parsed_job else None
            }), 400
        
        # If no URL was provided and no job_title/company, try to extract from job_description using AI
        if not job_url and (not job_title or not company):
            try:
                openai_client = get_async_openai_client()
                if openai_client:
                    job_desc_str = str(job_description) if job_description else ''
                    extract_prompt = f"""Extract the job title and company name from this job description. Return JSON only.

Job Description:
{job_desc_str[:2000]}

Return JSON:
{{
    "job_title": "...",
    "company": "..."
}}

If you cannot determine either field, use empty string."""

                    extract_response = run_async(
                        openai_client.chat.completions.create(
                            model="gpt-4o-mini",
                            messages=[
                                {"role": "system", "content": "Extract job information. Return valid JSON only."},
                                {"role": "user", "content": extract_prompt}
                            ],
                            response_format={"type": "json_object"},
                            temperature=0.1,
                            max_tokens=200
                        ),
                        timeout=10.0
                    )
                    
                    extracted = json.loads(extract_response.choices[0].message.content)
                    if not job_title and extracted.get("job_title"):
                        job_title = extracted["job_title"]
                    if not company and extracted.get("company"):
                        company = extracted["company"]
            except Exception as e:
                logger.warning(f"[ResumeWorkshop] Failed to extract job title/company from description: {e}")
                # Continue with empty job_title/company if extraction fails
        
        # Check credits before operation (but don't deduct yet)
        db = get_db()
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        if not user_doc.exists:
            return jsonify({
                "status": "error",
                "message": "User not found"
            }), 404
        
        current_credits = user_doc.to_dict().get('credits', 0)
        if current_credits < 5:
            return jsonify({
                "status": "error",
                "message": f"Insufficient credits. You have {current_credits} credits but need 5.",
                "error_code": "INSUFFICIENT_CREDITS"
            }), 402
        
        # Deduct credits (5 for analyze) - using atomic function
        deduct_success, new_credits = deduct_credits_atomic(user_id, 5, "resume_workshop_analyze")
        if not deduct_success:
            return jsonify({
                "status": "error",
                "message": f"Insufficient credits. You have {new_credits} credits but need 5.",
                "error_code": "INSUFFICIENT_CREDITS"
            }), 402
        
        # Analyze resume - refund credits on failure
        try:
            openai_client = get_async_openai_client()
            if not openai_client:
                refund_credits_atomic(user_id, 5, "resume_workshop_analyze_ai_unavailable")
                return jsonify({
                    "status": "error",
                    "message": "AI service unavailable",
                    "credits_refunded": True
                }), 503
            
            analysis = run_async(
                _analyze_resume_sections(
                    resume_text=resume_text[:10000],  # Standardized truncation
                    job_title=job_title,
                    company=company,
                    location=location,
                    job_description=job_description,
                    openai_client=openai_client
                ),
                timeout=180.0  # Accommodate gpt-4o
            )
        except TimeoutError:
            refund_credits_atomic(user_id, 5, "resume_workshop_analyze_timeout")
            raise
        except Exception as e:
            refund_credits_atomic(user_id, 5, "resume_workshop_analyze_error")
            raise
        
        response = {
            "status": "ok",
            "score": analysis.get("score", 50),
            "score_label": analysis.get("score_label", "Fair"),
            "sections": analysis.get("sections", {}),
            "keyword_analysis": analysis.get("keyword_analysis", {}),
            "job_context": {
                "job_title": job_title,
                "company": company,
                "location": location,
                "job_description": (str(job_description)[:500] + "...") if len(str(job_description)) > 500 else str(job_description)
            },
            "credits_remaining": new_credits
        }
        
        # Add URL parse warning if URL parsing failed
        if job_url and not parsed_job:
            response["url_parse_warning"] = "Could not read job URL. Please use manual inputs."
        
        return jsonify(response)
        
    except ValueError as exc:
        if "Insufficient credits" in str(exc):
            return jsonify({
                "status": "error",
                "message": str(exc),
                "error_code": "INSUFFICIENT_CREDITS"
            }), 402
        return jsonify({
            "status": "error",
            "message": str(exc)
        }), 400
    except TimeoutError:
        logger.error(f"[ResumeWorkshop] Analyze timed out for user {user_id[:8]}...")
        return jsonify({
            "status": "error",
            "message": "Analysis timed out. Your credits have been refunded. Please try again.",
            "credits_refunded": True
        }), 504
    except Exception as exc:
        logger.error(f"[ResumeWorkshop] Analyze failed: {type(exc).__name__}: {exc}")
        import traceback
        logger.error(f"[ResumeWorkshop] Traceback: {traceback.format_exc()}")
        # Try to refund credits if not already refunded
        try:
            refund_credits_atomic(user_id, 5, "resume_workshop_analyze_exception")
            credits_refunded = True
        except:
            credits_refunded = False
        return jsonify({
            "status": "error",
            "message": f"Analysis failed: {str(exc)}",
            "credits_refunded": credits_refunded
        }), 500


@resume_workshop_bp.route("/fix", methods=["POST"])
@require_firebase_auth
def fix_resume():
    """
    Fix resume without job context - improves formatting, clarity, bullets, impact.
    Costs 5 credits.
    
    Response:
    {
        "status": "ok",
        "improved_resume_text": "...",
        "pdf_base64": "...",
        "credits_remaining": 123
    }
    """
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated"
        }), 401
    
    try:
        # Get user's resume
        resume_data = _fetch_user_resume_data(user_id)
        resume_text = resume_data.get('resume_text', '')
        
        if not resume_text or len(resume_text) < 100:
            return jsonify({
                "status": "error",
                "message": "No resume found. Please upload your resume in Account Settings first.",
                "error_code": "NO_RESUME"
            }), 400
        
        # Check credits before operation
        db = get_db()
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        if not user_doc.exists:
            return jsonify({
                "status": "error",
                "message": "User not found"
            }), 404
        
        current_credits = user_doc.to_dict().get('credits', 0)
        if current_credits < 5:
            return jsonify({
                "status": "error",
                "message": f"Insufficient credits. You have {current_credits} credits but need 5.",
                "error_code": "INSUFFICIENT_CREDITS"
            }), 402
        
        # Deduct credits atomically
        deduct_success, new_credits = deduct_credits_atomic(user_id, 5, "resume_workshop_fix")
        if not deduct_success:
            return jsonify({
                "status": "error",
                "message": f"Insufficient credits. You have {new_credits} credits but need 5.",
                "error_code": "INSUFFICIENT_CREDITS"
            }), 402
        
        # Fix resume - refund credits on failure
        try:
            openai_client = get_async_openai_client()
            if not openai_client:
                refund_credits_atomic(user_id, 5, "resume_workshop_fix_ai_unavailable")
                return jsonify({
                    "status": "error",
                    "message": "AI service unavailable",
                    "credits_refunded": True
                }), 503
            
            result = run_async(
                _fix_resume(resume_text=resume_text, openai_client=openai_client),
                timeout=90.0
            )
        except TimeoutError:
            refund_credits_atomic(user_id, 5, "resume_workshop_fix_timeout")
            raise
        except Exception as e:
            refund_credits_atomic(user_id, 5, "resume_workshop_fix_error")
            raise
        
        return jsonify({
            "status": "ok",
            "improved_resume_text": result['improved_resume_text'],
            "pdf_base64": result['pdf_base64'],
            "credits_remaining": new_credits
        })
        
    except ValueError as exc:
        if "Insufficient credits" in str(exc):
            return jsonify({
                "status": "error",
                "message": str(exc),
                "error_code": "INSUFFICIENT_CREDITS"
            }), 402
        return jsonify({
            "status": "error",
            "message": str(exc)
        }), 400
    except TimeoutError:
        logger.error(f"[ResumeWorkshop] Fix timed out for user {user_id[:8]}...")
        return jsonify({
            "status": "error",
            "message": "Fix timed out. Your credits have been refunded. Please try again.",
            "credits_refunded": True
        }), 504
    except Exception as exc:
        logger.error(f"[ResumeWorkshop] Fix failed: {type(exc).__name__}: {exc}")
        import traceback
        logger.error(f"[ResumeWorkshop] Traceback: {traceback.format_exc()}")
        # Try to refund credits if not already refunded
        try:
            refund_credits_atomic(user_id, 5, "resume_workshop_fix_exception")
            credits_refunded = True
        except:
            credits_refunded = False
        return jsonify({
            "status": "error",
            "message": f"Fix failed: {str(exc)}",
            "credits_refunded": credits_refunded
        }), 500


@resume_workshop_bp.route("/score", methods=["POST"])
@require_firebase_auth
def score_resume():
    """
    Score resume and provide improvement suggestions (without job tailoring).
    Costs 5 credits (unless cached result found).
    
    Response:
    {
        "status": "ok",
        "score": 75,
        "score_label": "Good",
        "categories": [...],
        "summary": "...",
        "credits_remaining": 123,
        "cached": true  // if returned from cache
    }
    """
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated",
            "error_code": "NOT_AUTHENTICATED"
        }), 401
    
    try:
        # Get user's resume
        resume_data = _fetch_user_resume_data(user_id)
        resume_text = resume_data.get('resume_text', '')
        
        if not resume_text:
            return jsonify({
                "status": "error",
                "message": "No resume found. Please upload your resume in Account Settings first.",
                "error_code": "RESUME_NOT_FOUND"
            }), 400
        
        if len(resume_text) < 100:
            return jsonify({
                "status": "error",
                "message": "Your resume needs more content before scoring. Please add more details.",
                "error_code": "RESUME_TOO_SHORT"
            }), 400
        
        # Generate MD5 hash of resume text for caching
        resume_hash = hashlib.md5(resume_text.encode('utf-8')).hexdigest()
        
        # Check for cached score (within last 24 hours)
        db = get_db()
        if db:
            scores_ref = db.collection('users').document(user_id).collection('resume_scores')
            # Query for scores with matching hash created within last 24 hours
            cutoff_time = datetime.now(timezone.utc) - timedelta(hours=24)
            
            cached_scores = scores_ref.where('resume_hash', '==', resume_hash).order_by('created_at', direction='DESCENDING').limit(1).get()
            
            for cached_doc in cached_scores:
                cached_data = cached_doc.to_dict()
                created_at = cached_data.get('created_at')
                
                # Check if created_at is a timestamp and within 24 hours
                if created_at:
                    try:
                        # Handle Firestore timestamp
                        if hasattr(created_at, 'timestamp'):
                            # Firestore Timestamp object
                            cache_time = datetime.fromtimestamp(created_at.timestamp(), tz=timezone.utc)
                        elif isinstance(created_at, datetime):
                            # Already a datetime
                            cache_time = created_at
                            if cache_time.tzinfo is None:
                                cache_time = cache_time.replace(tzinfo=timezone.utc)
                        else:
                            # Try to parse as ISO string
                            if isinstance(created_at, str):
                                cache_time = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                            else:
                                continue
                        
                        # Check if within 24 hours
                        now = datetime.now(timezone.utc)
                        time_diff = now - cache_time
                        if time_diff < timedelta(hours=24) and time_diff.total_seconds() >= 0:
                            # Return cached result (no credit charge)
                            logger.info(f"[ResumeWorkshop] Returning cached score for user {user_id[:8]}... (age: {time_diff})")
                            
                            # Get current credits (no deduction needed)
                            user_ref = db.collection('users').document(user_id)
                            user_doc = user_ref.get()
                            current_credits = user_doc.to_dict().get('credits', 0) if user_doc.exists else 0
                            
                            return jsonify({
                                "status": "ok",
                                "score": cached_data.get('score'),
                                "score_label": cached_data.get('score_label'),
                                "categories": cached_data.get('categories', []),
                                "summary": cached_data.get('summary', ''),
                                "credits_remaining": current_credits,
                                "cached": True
                            })
                    except Exception as cache_error:
                        logger.warning(f"[ResumeWorkshop] Error checking cache timestamp: {cache_error}")
                        continue
        
        # No cached result found - proceed with new scoring
        # Check credits before operation
        if not db:
            return jsonify({
                "status": "error",
                "message": "Database not available",
                "error_code": "DATABASE_ERROR"
            }), 500
        
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        if not user_doc.exists:
            return jsonify({
                "status": "error",
                "message": "User not found",
                "error_code": "USER_NOT_FOUND"
            }), 404
        
        current_credits = user_doc.to_dict().get('credits', 0)
        if current_credits < 5:
            return jsonify({
                "status": "error",
                "message": f"Insufficient credits. You have {current_credits} credits but need 5.",
                "error_code": "INSUFFICIENT_CREDITS"
            }), 402
        
        # Deduct credits atomically
        deduct_success, new_credits = deduct_credits_atomic(user_id, 5, "resume_workshop_score")
        if not deduct_success:
            return jsonify({
                "status": "error",
                "message": f"Insufficient credits. You have {new_credits} credits but need 5.",
                "error_code": "INSUFFICIENT_CREDITS"
            }), 402
        
        # Score resume - refund credits on failure
        try:
            openai_client = get_async_openai_client()
            if not openai_client:
                refund_credits_atomic(user_id, 5, "resume_workshop_score_ai_unavailable")
                return jsonify({
                    "status": "error",
                    "message": "AI service unavailable",
                    "error_code": "AI_ERROR",
                    "credits_refunded": True
                }), 503
            
            result = run_async(
                _score_resume(resume_text=resume_text, openai_client=openai_client),
                timeout=60.0
            )
        except TimeoutError:
            refund_credits_atomic(user_id, 5, "resume_workshop_score_timeout")
            return jsonify({
                "status": "error",
                "message": "Scoring timed out. Your credits have been refunded. Please try again.",
                "error_code": "AI_TIMEOUT",
                "credits_refunded": True
            }), 504
        except Exception as e:
            refund_credits_atomic(user_id, 5, "resume_workshop_score_error")
            logger.error(f"[ResumeWorkshop] AI error during scoring: {e}")
            return jsonify({
                "status": "error",
                "message": "Something went wrong during scoring. Credits refunded. Please try again.",
                "error_code": "AI_ERROR",
                "credits_refunded": True
            }), 500
        
        # Store result in cache
        if db:
            try:
                from firebase_admin import firestore
                scores_ref = db.collection('users').document(user_id).collection('resume_scores')
                cache_data = {
                    "score": result.get('score'),
                    "score_label": result.get('score_label'),
                    "categories": result.get('categories', []),
                    "summary": result.get('summary', ''),
                    "resume_hash": resume_hash,
                    "created_at": firestore.SERVER_TIMESTAMP
                }
                scores_ref.add(cache_data)
                logger.info(f"[ResumeWorkshop] Cached score for user {user_id[:8]}...")
            except Exception as cache_error:
                logger.warning(f"[ResumeWorkshop] Failed to cache score: {cache_error}")
        
        return jsonify({
            "status": "ok",
            "score": result.get('score'),
            "score_label": result.get('score_label'),
            "categories": result.get('categories', []),
            "summary": result.get('summary', ''),
            "credits_remaining": new_credits,
            "cached": False
        })
        
    except ValueError as exc:
        if "Insufficient credits" in str(exc):
            return jsonify({
                "status": "error",
                "message": str(exc),
                "error_code": "INSUFFICIENT_CREDITS"
            }), 402
        return jsonify({
            "status": "error",
            "message": str(exc),
            "error_code": "VALIDATION_ERROR"
        }), 400
    except Exception as exc:
        logger.error(f"[ResumeWorkshop] Score failed: {type(exc).__name__}: {exc}")
        import traceback
        logger.error(f"[ResumeWorkshop] Traceback: {traceback.format_exc()}")
        # Try to refund credits if not already refunded
        try:
            refund_credits_atomic(user_id, 5, "resume_workshop_score_exception")
            credits_refunded = True
        except:
            credits_refunded = False
        return jsonify({
            "status": "error",
            "message": f"Scoring failed: {str(exc)}",
            "error_code": "UNKNOWN_ERROR",
            "credits_refunded": credits_refunded
        }), 500


@resume_workshop_bp.route("/apply-improvements", methods=["POST"])
@require_firebase_auth
def apply_improvements():
    """
    Apply improvement suggestions from scoring to generate an improved resume.
    Costs 5 credits.
    
    Request body:
    {
        "suggestions": ["suggestion1", "suggestion2", ...]
    }
    
    Response:
    {
        "status": "ok",
        "improved_resume_text": "...",
        "pdf_base64": "...",
        "credits_remaining": 123
    }
    """
    payload = request.get_json(force=True, silent=True) or {}
    
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated"
        }), 401
    
    suggestions = payload.get('suggestions', [])
    if not suggestions:
        return jsonify({
            "status": "error",
            "message": "No suggestions provided"
        }), 400
    
    try:
        # Get user's resume
        resume_data = _fetch_user_resume_data(user_id)
        resume_text = resume_data.get('resume_text', '')
        
        if not resume_text or len(resume_text) < 100:
            return jsonify({
                "status": "error",
                "message": "No resume found"
            }), 400
        
        # Check credits before operation
        db = get_db()
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        if not user_doc.exists:
            return jsonify({
                "status": "error",
                "message": "User not found"
            }), 404
        
        current_credits = user_doc.to_dict().get('credits', 0)
        if current_credits < 5:
            return jsonify({
                "status": "error",
                "message": f"Insufficient credits. You have {current_credits} credits but need 5.",
                "error_code": "INSUFFICIENT_CREDITS"
            }), 402
        
        # Deduct credits atomically
        deduct_success, new_credits = deduct_credits_atomic(user_id, 5, "resume_workshop_apply_improvements")
        if not deduct_success:
            return jsonify({
                "status": "error",
                "message": f"Insufficient credits. You have {new_credits} credits but need 5.",
                "error_code": "INSUFFICIENT_CREDITS"
            }), 402
        
        # Apply improvements - refund credits on failure
        try:
            openai_client = get_async_openai_client()
            if not openai_client:
                refund_credits_atomic(user_id, 5, "resume_workshop_apply_improvements_ai_unavailable")
                return jsonify({
                    "status": "error",
                    "message": "AI service unavailable",
                    "credits_refunded": True
                }), 503
            
            result = run_async(
                _apply_improvements(
                    resume_text=resume_text,
                    suggestions=suggestions,
                    openai_client=openai_client
                ),
                timeout=90.0
            )
        except TimeoutError:
            refund_credits_atomic(user_id, 5, "resume_workshop_apply_improvements_timeout")
            raise
        except Exception as e:
            refund_credits_atomic(user_id, 5, "resume_workshop_apply_improvements_error")
            raise
        
        return jsonify({
            "status": "ok",
            "improved_resume_text": result['improved_resume_text'],
            "pdf_base64": result['pdf_base64'],
            "credits_remaining": new_credits
        })
        
    except ValueError as exc:
        if "Insufficient credits" in str(exc):
            return jsonify({
                "status": "error",
                "message": str(exc),
                "error_code": "INSUFFICIENT_CREDITS"
            }), 402
        return jsonify({
            "status": "error",
            "message": str(exc)
        }), 400
    except TimeoutError:
        logger.error(f"[ResumeWorkshop] Apply improvements timed out for user {user_id[:8]}...")
        return jsonify({
            "status": "error",
            "message": "Operation timed out. Your credits have been refunded. Please try again.",
            "credits_refunded": True
        }), 504
    except Exception as exc:
        logger.error(f"[ResumeWorkshop] Apply improvements failed: {type(exc).__name__}: {exc}")
        import traceback
        logger.error(f"[ResumeWorkshop] Traceback: {traceback.format_exc()}")
        # Try to refund credits if not already refunded
        try:
            refund_credits_atomic(user_id, 5, "resume_workshop_apply_improvements_exception")
            credits_refunded = True
        except:
            credits_refunded = False
        return jsonify({
            "status": "error",
            "message": f"Failed to apply improvements: {str(exc)}",
            "credits_refunded": credits_refunded
        }), 500


@resume_workshop_bp.route("/replace-main", methods=["POST"])
@require_firebase_auth
def replace_main_resume():
    """
    Replace the user's main resume in account settings with a new version.
    
    Request body:
    {
        "pdf_base64": "...",
        "resume_text": "..."
    }
    
    Response:
    {
        "status": "ok",
        "message": "Resume replaced successfully"
    }
    """
    payload = request.get_json(force=True, silent=True) or {}
    
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated"
        }), 401
    
    pdf_base64 = payload.get('pdf_base64')
    resume_text = payload.get('resume_text')
    
    if not pdf_base64 or not resume_text:
        return jsonify({
            "status": "error",
            "message": "Missing pdf_base64 or resume_text"
        }), 400
    
    try:
        db = get_db()
        if not db:
            return jsonify({
                "status": "error",
                "message": "Database not available"
            }), 500
        
        # Upload PDF to Firebase Storage and get URL
        from firebase_admin import storage
        
        bucket = storage.bucket()
        blob_name = f"resumes/{user_id}/improved_resume.pdf"
        blob = bucket.blob(blob_name)
        
        # Decode base64 and upload
        pdf_bytes = base64.b64decode(pdf_base64)
        blob.upload_from_string(pdf_bytes, content_type='application/pdf')
        
        # Make blob publicly accessible
        blob.make_public()
        pdf_url = blob.public_url
        
        # Update user document
        user_ref = db.collection('users').document(user_id)
        user_ref.update({
            'resumeUrl': pdf_url,
            'resumeText': resume_text,
            'rawText': resume_text,
            'resumeFileName': 'improved_resume.pdf',
            'resumeReplacedAt': datetime.now().isoformat()
        })
        
        logger.info(f"[ResumeWorkshop] Replaced main resume for user {user_id[:8]}...")
        
        return jsonify({
            "status": "ok",
            "message": "Resume replaced successfully",
            "new_resume_url": pdf_url
        })
        
    except Exception as exc:
        logger.error(f"[ResumeWorkshop] Replace main failed: {type(exc).__name__}: {exc}")
        import traceback
        logger.error(f"[ResumeWorkshop] Traceback: {traceback.format_exc()}")
        return jsonify({
            "status": "error",
            "message": f"Failed to replace resume: {str(exc)}"
        }), 500


@resume_workshop_bp.route("/apply", methods=["POST"])
@require_firebase_auth
def apply_recommendation():
    """
    DEPRECATED: This endpoint is deprecated. 
    
    The frontend now uses copy/paste instead of PDF generation to avoid timeouts
    and reduce credit costs. Users can copy suggestions directly from the 
    recommendations UI.
    
    This endpoint may be removed in a future version.
    
    Apply a single recommendation to the resume.
    Costs 5 credits.
    
    Request body:
    {
        "recommendation": { ... },
        "job_context": {
            "job_title": "...",
            "company": "...",
            "location": "..."
        },
        "current_working_resume_text": "optional, if applying to already-modified resume",
        "score": 75  // optional, for library entry
    }
    
    Response:
    {
        "status": "ok",
        "updated_resume_pdf_base64": "...",
        "library_entry_id": "...",
        "credits_remaining": 123
    }
    """
    # Return deprecation message
    return jsonify({
        "status": "error",
        "message": "This endpoint is deprecated. Please use the copy/paste feature in the UI instead.",
        "error_code": "DEPRECATED_ENDPOINT"
    }), 410  # 410 Gone - indicates the resource is no longer available
    
    # Original implementation below (commented out for reference)
    # payload = request.get_json(force=True, silent=True) or {}
    # 
    # user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    # if not user_id:
    #     return jsonify({
    #         "status": "error",
    #         "message": "User not authenticated"
    #     }), 401
    # 
    # recommendation = payload.get('recommendation')
    # job_context = payload.get('job_context', {})
    # current_working_resume_text = payload.get('current_working_resume_text')
    # score = payload.get('score')
    # 
    # if not recommendation:
    #     return jsonify({
    #         "status": "error",
    #         "message": "Missing recommendation"
    #     }), 400
    
    try:
        # Get resume text (either working version or original)
        if current_working_resume_text:
            resume_text = current_working_resume_text
        else:
            resume_data = _fetch_user_resume_data(user_id)
            resume_text = resume_data.get('resume_text', '')
        
        if not resume_text or len(resume_text) < 100:
            return jsonify({
                "status": "error",
                "message": "No resume found"
            }), 400
        
        # Check credits before operation
        db = get_db()
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        if not user_doc.exists:
            return jsonify({
                "status": "error",
                "message": "User not found"
            }), 404
        
        current_credits = user_doc.to_dict().get('credits', 0)
        if current_credits < 5:
            return jsonify({
                "status": "error",
                "message": f"Insufficient credits. You have {current_credits} credits but need 5.",
                "error_code": "INSUFFICIENT_CREDITS"
            }), 402
        
        # Deduct credits atomically
        deduct_success, new_credits = deduct_credits_atomic(user_id, 5, "resume_workshop_apply")
        if not deduct_success:
            return jsonify({
                "status": "error",
                "message": f"Insufficient credits. You have {new_credits} credits but need 5.",
                "error_code": "INSUFFICIENT_CREDITS"
            }), 402
        
        # Apply recommendation - refund credits on failure
        try:
            openai_client = get_async_openai_client()
            if not openai_client:
                refund_credits_atomic(user_id, 5, "resume_workshop_apply_ai_unavailable")
                return jsonify({
                    "status": "error",
                    "message": "AI service unavailable",
                    "credits_refunded": True
                }), 503
            
            result = run_async(
                _apply_recommendation(
                    resume_text=resume_text,
                    recommendation=recommendation,
                    job_context=job_context,
                    openai_client=openai_client
                ),
                timeout=60.0
            )
        except TimeoutError:
            refund_credits_atomic(user_id, 5, "resume_workshop_apply_timeout")
            raise
        except Exception as e:
            refund_credits_atomic(user_id, 5, "resume_workshop_apply_error")
            raise
        
        # Save to Resume Library
        job_title = job_context.get('job_title', 'Unknown')
        company = job_context.get('company', 'Unknown')
        location = job_context.get('location', '')
        
        library_entry_id = _save_to_resume_library(
            user_id=user_id,
            job_title=job_title,
            company=company,
            location=location,
            pdf_base64=result['pdf_base64'],
            score=score
        )
        
        return jsonify({
            "status": "ok",
            "updated_resume_pdf_base64": result['pdf_base64'],
            "updated_resume_text": result['updated_resume_text'],
            "library_entry_id": library_entry_id,
            "credits_remaining": new_credits
        })
        
    except ValueError as exc:
        if "Insufficient credits" in str(exc):
            return jsonify({
                "status": "error",
                "message": str(exc),
                "error_code": "INSUFFICIENT_CREDITS"
            }), 402
        return jsonify({
            "status": "error",
            "message": str(exc)
        }), 400
    except TimeoutError:
        logger.error(f"[ResumeWorkshop] Apply timed out for user {user_id[:8]}...")
        return jsonify({
            "status": "error",
            "message": "Apply timed out. Your credits have been refunded. Please try again.",
            "credits_refunded": True
        }), 504
    except Exception as exc:
        logger.error(f"[ResumeWorkshop] Apply failed: {type(exc).__name__}: {exc}")
        import traceback
        logger.error(f"[ResumeWorkshop] Traceback: {traceback.format_exc()}")
        # Try to refund credits if not already refunded
        try:
            refund_credits_atomic(user_id, 5, "resume_workshop_apply_exception")
            credits_refunded = True
        except:
            credits_refunded = False
        return jsonify({
            "status": "error",
            "message": f"Failed to apply recommendation: {str(exc)}",
            "credits_refunded": credits_refunded
        }), 500


@resume_workshop_bp.route("/library", methods=["POST"])
@require_firebase_auth
def save_to_library():
    """Save a resume to the user's Resume Library."""
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated"
        }), 401

    payload = request.get_json(force=True, silent=True) or {}
    display_name = payload.get('display_name') or f"Resume - {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    job_title = payload.get('job_title') or ''
    company = payload.get('company') or ''
    location = payload.get('location') or ''
    pdf_base64 = payload.get('pdf_base64')
    structured_data = payload.get('structured_data')
    score = payload.get('score')
    source = payload.get('source') or 'manual'

    if not pdf_base64:
        return jsonify({
            "status": "error",
            "message": "Missing pdf_base64"
        }), 400

    try:
        db = get_db()
        if not db:
            return jsonify({
                "status": "error",
                "message": "Database not available"
            }), 500

        entry_id = str(uuid.uuid4())
        entry = {
            'id': entry_id,
            'display_name': display_name,
            'job_title': job_title,
            'company': company,
            'location': location,
            'created_at': datetime.now().isoformat(),
            'pdf_base64': pdf_base64,
            'score': score,
            'source': source,
        }
        if structured_data is not None:
            entry['structured_data'] = structured_data

        db.collection('users').document(user_id).collection('resume_library').document(entry_id).set(entry)
        logger.info(f"[ResumeWorkshop] Saved resume to library for user {user_id[:8]}... Entry ID: {entry_id}")
        return jsonify({
            "status": "ok",
            "library_entry_id": entry_id,
        })
    except Exception as exc:
        logger.error(f"[ResumeWorkshop] Save to library failed: {type(exc).__name__}: {exc}")
        return jsonify({
            "status": "error",
            "message": str(exc)
        }), 500


@resume_workshop_bp.route("/library", methods=["GET"])
@require_firebase_auth
def get_library():
    """Get user's Resume Library entries."""
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated"
        }), 401
    
    try:
        db = get_db()
        if not db:
            return jsonify({
                "status": "error",
                "message": "Database not available"
            }), 500
        
        entries_ref = db.collection('users').document(user_id).collection('resume_library')
        entries = entries_ref.order_by('created_at', direction='DESCENDING').limit(50).stream()
        
        library = []
        for entry in entries:
            entry_data = entry.to_dict()
            # Don't send full PDF base64 in list view
            library.append({
                'id': entry_data.get('id'),
                'display_name': entry_data.get('display_name'),
                'job_title': entry_data.get('job_title'),
                'company': entry_data.get('company'),
                'location': entry_data.get('location'),
                'created_at': entry_data.get('created_at'),
                'score': entry_data.get('score')
            })
        
        return jsonify({
            "status": "ok",
            "entries": library
        })
        
    except Exception as exc:
        logger.error(f"[ResumeWorkshop] Get library failed: {type(exc).__name__}: {exc}")
        return jsonify({
            "status": "error",
            "message": f"Failed to get library: {str(exc)}"
        }), 500


@resume_workshop_bp.route("/library/<entry_id>", methods=["GET"])
@require_firebase_auth
def get_library_entry(entry_id: str):
    """Get a specific Resume Library entry with full PDF."""
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated"
        }), 401
    
    try:
        db = get_db()
        if not db:
            return jsonify({
                "status": "error",
                "message": "Database not available"
            }), 500
        
        entry_ref = db.collection('users').document(user_id).collection('resume_library').document(entry_id)
        entry_doc = entry_ref.get()
        
        if not entry_doc.exists:
            return jsonify({
                "status": "error",
                "message": "Entry not found"
            }), 404
        
        return jsonify({
            "status": "ok",
            "entry": entry_doc.to_dict()
        })
        
    except Exception as exc:
        logger.error(f"[ResumeWorkshop] Get library entry failed: {type(exc).__name__}: {exc}")
        return jsonify({
            "status": "error",
            "message": f"Failed to get entry: {str(exc)}"
        }), 500


@resume_workshop_bp.route("/library/<entry_id>", methods=["DELETE"])
@require_firebase_auth
def delete_library_entry(entry_id: str):
    """Delete a Resume Library entry."""
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated"
        }), 401
    
    try:
        db = get_db()
        if not db:
            return jsonify({
                "status": "error",
                "message": "Database not available"
            }), 500
        
        entry_ref = db.collection('users').document(user_id).collection('resume_library').document(entry_id)
        entry_ref.delete()
        
        return jsonify({
            "status": "ok",
            "message": "Entry deleted"
        })
        
    except Exception as exc:
        logger.error(f"[ResumeWorkshop] Delete library entry failed: {type(exc).__name__}: {exc}")
        return jsonify({
            "status": "error",
            "message": f"Failed to delete entry: {str(exc)}"
        }), 500


@resume_workshop_bp.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "service": "resume_workshop"})


@resume_workshop_bp.route("/debug/check-resume", methods=["GET"])
@require_firebase_auth
def debug_check_resume():
    """
    Debug endpoint to check where resume data exists for the authenticated user.
    Returns a detailed report of all possible resume storage locations.
    """
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({"status": "error", "message": "User not authenticated"}), 401
    
    try:
        db = get_db()
        if not db:
            return jsonify({"status": "error", "message": "Database not available"}), 500
        
        result = {
            'user_id': user_id[:8] + '...',
            'locations_checked': {},
            'recommendation': None
        }
        
        # Check user document
        user_doc = db.collection('users').document(user_id).get()
        if user_doc.exists:
            user_data = user_doc.to_dict()
            
            # Check all possible resume text locations
            text_locations = {
                'resumeText': user_data.get('resumeText'),
                'originalResumeText': user_data.get('originalResumeText'),
                'rawText': user_data.get('rawText'),
                'profile.resumeText': user_data.get('profile', {}).get('resumeText') if isinstance(user_data.get('profile'), dict) else None,
                'resumeParsed.rawText': user_data.get('resumeParsed', {}).get('rawText') if isinstance(user_data.get('resumeParsed'), dict) else None,
            }
            
            for loc_name, text_value in text_locations.items():
                if text_value:
                    result['locations_checked'][loc_name] = {
                        'found': True,
                        'length': len(text_value),
                        'preview': text_value[:100] + '...' if len(text_value) > 100 else text_value
                    }
                else:
                    result['locations_checked'][loc_name] = {'found': False}
            
            # Check other resume-related fields
            result['other_fields'] = {
                'resumeUrl': bool(user_data.get('resumeUrl')),
                'originalResumeUrl': bool(user_data.get('originalResumeUrl')),
                'resumeFileName': user_data.get('resumeFileName'),
                'resumeParsed_exists': bool(user_data.get('resumeParsed')),
                'originalResumeParsed_exists': bool(user_data.get('originalResumeParsed')),
            }
            
            # Use the helper function to see what it returns
            try:
                resume_data = _fetch_user_resume_data(user_id)
                result['fetch_helper_result'] = {
                    'source': resume_data.get('source'),
                    'text_length': len(resume_data.get('resume_text', '')),
                    'has_url': bool(resume_data.get('resume_url')),
                    'has_parsed': bool(resume_data.get('resume_parsed')),
                }
            except Exception as e:
                result['fetch_helper_result'] = {'error': str(e)}
            
            # Provide recommendation
            if resume_data.get('resume_text') and len(resume_data.get('resume_text', '')) >= 100:
                result['recommendation'] = 'Resume found! The endpoints should work.'
            elif user_data.get('resumeUrl'):
                result['recommendation'] = 'Resume URL exists but text not extracted. Try re-uploading resume.'
            else:
                result['recommendation'] = 'No resume found. Please upload a resume in Account Settings.'
        else:
            result['locations_checked']['user_document'] = {'found': False}
            result['recommendation'] = 'User document not found in Firestore.'
        
        return jsonify({"status": "ok", **result})
        
    except Exception as exc:
        logger.error(f"[ResumeWorkshop] Debug check failed: {type(exc).__name__}: {exc}")
        import traceback
        logger.error(f"[ResumeWorkshop] Traceback: {traceback.format_exc()}")
        return jsonify({
            "status": "error",
            "message": f"Debug check failed: {str(exc)}"
        }), 500
