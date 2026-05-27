"""
Content processor service - extract structured insights from Reddit data using OpenAI
"""
import json
from datetime import datetime
from typing import Dict, List
from app.services.openai_client import get_openai_client


def process_interview_content(reddit_posts: List[Dict], job_details: Dict) -> Dict:
    """
    Process Reddit posts with context from the job posting to generate
    highly relevant, personalized interview prep content.
    
    Args:
        reddit_posts: List of Reddit posts with comments
        job_details: Parsed job posting with company_name, job_title, level, skills, etc.
    
    Returns structured JSON with highly detailed, personalized interview insights.
    """
    company_name = job_details.get("company_name", "Unknown Company")
    job_title = job_details.get("job_title", "")
    level = job_details.get("level", "")
    role_category = job_details.get("role_category", "Other")
    
    if not reddit_posts:
        return {
            "company_name": company_name,
            "last_updated": datetime.now().isoformat(),
            "error": "No Reddit posts found for this company",
            "sources_count": 0
        }
    
    client = get_openai_client()
    if not client:
        raise Exception("OpenAI client not available")
    
    # Prepare Reddit data summary for OpenAI - include MAXIMUM context for comprehensive extraction
    posts_summary = []
    # Process ALL posts (up to 50) for maximum coverage
    for i, post in enumerate(reddit_posts[:50], 1):
        post_text = f"=== POST {i} ===\n"
        post_text += f"Subreddit: r/{post.get('subreddit', 'unknown')}\n"
        post_text += f"Upvotes: {post.get('upvotes', 0)}\n"
        post_text += f"Title: {post.get('post_title', '')}\n"
        if post.get('post_body'):
            # Include full body (up to 5000 chars) - every detail matters
            body = post.get('post_body', '')
            post_text += f"Full Content:\n{body[:5000]}\n"
            if len(body) > 5000:
                post_text += f"[... {len(body) - 5000} more characters truncated ...]\n"
        if post.get('top_comments'):
            # Include ALL top comments (up to 10) - comments often have the best insights
            comments_text = "\n".join([
                f"--- Comment {j+1} ({c.get('upvotes', 0)} upvotes) ---\n{c.get('body', '')[:2500]}" 
                for j, c in enumerate(post.get('top_comments', [])[:10])
            ])
            post_text += f"\nTOP COMMENTS (often contain the most valuable interview insights):\n{comments_text}\n"
        post_text += "\n"
        posts_summary.append(post_text)
    
    reddit_data_text = "\n\n".join(posts_summary)
    
    required_skills = job_details.get("required_skills", [])
    team_division = job_details.get("team_division")
    
    role_context = f" for {job_title} at {company_name}"
    if level:
        role_context += f" ({level})"
    
    skills_context = ""
    if required_skills:
        skills_context = f"\n\nREQUIRED SKILLS FROM JOB POSTING: {', '.join(required_skills[:10])}"
        skills_context += "\n\nIMPORTANT: Tailor technical questions to these specific skills. If Swift is required, include Swift questions. If Python is required, include Python questions."
    
    # CRITICAL: Role-specific instructions
    role_specific_instructions = ""
    if role_category == "Consulting":
        role_specific_instructions = """
CRITICAL ROLE-SPECIFIC INSTRUCTIONS FOR CONSULTING:
- Focus on CASE INTERVIEWS, frameworks (profitability, market entry, M&A), and market sizing
- Include behavioral/fit questions (consulting firms care deeply about fit)
- DO NOT include LeetCode, coding problems, or data structures
- Resources should be: Case in Point, PrepLounge, CaseCoach, Victor Cheng LOMS
- Typical questions: "How many gas stations in the US?", "Should Company X acquire Y?", case frameworks
- Interview stages: Application → First Round (Case + Fit) → Final Round (Partner interviews)
- Prep timeline: 6-8 weeks, 40-50 cases recommended
"""
    elif role_category == "Software Engineering":
        role_specific_instructions = """
CRITICAL ROLE-SPECIFIC INSTRUCTIONS FOR SOFTWARE ENGINEERING:
- Focus on CODING problems, algorithms, data structures, and system design
- Include LeetCode-style questions tailored to required_skills
- DO NOT include case interviews, market sizing, or consulting frameworks
- Resources should be: LeetCode, NeetCode, System Design Primer, Blind 75
- Typical questions: "Implement LRU cache", "Design Twitter", coding patterns
- Interview stages: Resume Screen → Recruiter Call → Technical Phone Screen → Onsite (coding + system design + behavioral)
- Prep timeline: 4-6 weeks for interns, 6-8 weeks for full-time, 100-150 LeetCode problems
"""
    elif role_category == "Finance":
        role_specific_instructions = """
CRITICAL ROLE-SPECIFIC INSTRUCTIONS FOR FINANCE/INVESTMENT BANKING:
- Focus on TECHNICAL questions: DCF, valuation, accounting, LBO, M&A
- Include behavioral questions (IB cares about fit and work ethic)
- DO NOT include LeetCode, coding problems, or case interviews (unless M&A case)
- Resources should be: Breaking Into Wall Street, Wall Street Oasis, Rosenbaum IB book
- Typical questions: "Walk me through a DCF", "What happens when depreciation increases by $10?", "Walk me through an LBO"
- Interview stages: Application → Phone Screen → Superday (multiple technical + behavioral rounds)
- Prep timeline: 4-6 weeks, focus on technicals and Excel modeling
"""
    elif role_category == "Product Management":
        role_specific_instructions = """
CRITICAL ROLE-SPECIFIC INSTRUCTIONS FOR PRODUCT MANAGEMENT:
- Focus on PRODUCT SENSE questions, estimation, prioritization, and behavioral
- Include frameworks: CIRCLES, RICE, AARRR
- Limited coding (some PM roles have light technical questions)
- DO NOT include heavy LeetCode or case interviews
- Resources should be: Cracking the PM Interview, Exponent, Product Alliance
- Typical questions: "How would you improve Google Maps?", "How many piano tuners in Chicago?", product design
- Interview stages: Resume Screen → Phone Screen → Onsite (product sense + analytical + behavioral)
- Prep timeline: 4-6 weeks, practice product design questions
"""
    elif role_category == "Data Science":
        role_specific_instructions = """
CRITICAL ROLE-SPECIFIC INSTRUCTIONS FOR DATA SCIENCE:
- Focus on SQL, statistics, machine learning, A/B testing, and product analytics
- Include coding questions (SQL, Python/R) but NOT LeetCode algorithms
- Resources should be: StrataScratch, DataLemur, LeetCode Database, Ace the Data Science Interview
- Typical questions: "Write SQL to find second highest salary", "Design an A/B test", "Explain L1 vs L2 regularization"
- Interview stages: Resume Screen → Technical Screen (SQL/coding) → Case Study → Behavioral
- Prep timeline: 4-6 weeks, focus on SQL and statistics
"""
    else:
        role_specific_instructions = f"""
ROLE CATEGORY: {role_category}
Generate appropriate interview prep content for this role type.
"""
    
    prompt = f"""You are creating a COMPREHENSIVE interview preparation guide{role_context}. This document should be so thorough that a candidate could use it as their PRIMARY preparation resource.

JOB POSTING CONTEXT:
- Company: {company_name}
- Job Title: {job_title}
- Level: {level or 'Not specified'}
- Team/Division: {team_division or 'Not specified'}
- Role Category: {role_category}
{skills_context}

{role_specific_instructions}

Your goal: Extract EVERY SINGLE piece of relevant information from the Reddit posts below. Use the job posting context to FILTER and TAILOR the content. For example:
- If the job is for an INTERN, focus on intern experiences and intern-level questions
- If the job requires Swift, prioritize Swift-related technical questions
- If the job is for a specific team (e.g., "Apple Intelligence"), look for team-specific insights
- CRITICALLY: Follow the role-specific instructions above - the content MUST match the role type!

Analyze the following Reddit posts about {company_name} interviews:

REDDIT DATA:
{reddit_data_text}

Return ONLY valid JSON in this exact structure:
{{
    "company_name": "{company_name}",
    "last_updated": "{datetime.now().isoformat()}",
    
    "interview_process": {{
        "stages": [
            {{
                "name": "Application",
                "description": "Submit resume and cover letter online",
                "duration": "N/A",
                "interviewer": "N/A",
                "format": "Online",
                "tips": "Tailor resume to job description keywords"
            }},
            {{
                "name": "Recruiter Screen",
                "description": "Initial phone/video call with recruiter",
                "duration": "30 minutes",
                "interviewer": "Recruiter",
                "format": "Video call",
                "tips": "Be ready to discuss your resume and interest in the role"
            }}
            # ... more stages with SPECIFIC details
        ],
        "total_timeline": "4-6 weeks from application to offer",
        "level_specific_notes": "For {level if level else 'this'} roles, expect specific details based on level"
    }},
    
    "common_questions": {{
        "behavioral": {{
            "questions": [
                {{
                    "question": "Tell me about a time you [company-specific behavioral question]",
                    "why_asked": "[Why this company asks this - tie to company values]",
                    "answer_hint": "Use STAR method, focus on [specific aspect]"
                }}
                # 8-10 questions, each with context
            ],
            "general_tips": "[Company-specific behavioral tips]"
        }},
        "technical": {{
            # IMPORTANT: For CONSULTING roles, this section should be EMPTY or contain case interview questions only
            # For SOFTWARE ENGINEERING: Include coding questions like "Implement an LRU cache"
            # For FINANCE: Include technical questions like "Walk me through a DCF"
            # For DATA SCIENCE: Include SQL/statistics questions
            # DO NOT include LeetCode or coding problems for CONSULTING, FINANCE, or MARKETING roles
            "questions": [
                # Role-appropriate questions ONLY - see role-specific instructions above
            ],
            "skill_specific_questions": {{
                # Only for technical roles (SWE, Data Science) - leave empty for Consulting/Finance/Marketing
            }},
            "general_tips": "[Role-appropriate tips - NO LeetCode for consulting/finance/marketing]"
        }},
        "company_specific": {{
            "questions": [
                {{
                    "question": "Why {company_name}?",
                    "what_they_want": "Genuine passion for [company-specific values/products]",
                    "good_answer_elements": ["Specific product/feature you love", "[Company] philosophy", "[Company] stance on [issue]"]
                }}
            ]
        }},
        "reported_actual_questions": [
            # REAL questions from Reddit posts - quote directly if available
            {{
                "question": "[Actual question from Reddit]",
                "source": "Reddit user in r/[subreddit], 2024",
                "context": "Asked during [specific round]"
            }}
        ]
    }},
    
    "real_interview_experiences": [
        {{
            "role": "{job_title}",
            "year": "2024",
            "result": "Offer received",  # or "Rejected", "Ghosted"
            "rounds_completed": 4,
            "detailed_experience": "[Detailed description of their interview experience with specifics]",
            "questions_asked": [
                "[Actual question 1]",
                "[Actual question 2]"
            ],
            "what_surprised_them": "[What surprised them]",
            "advice": "[Their advice for future candidates]",
            "difficulty": "Medium"
        }}
        # 3-5 detailed experiences like this, filtered to match job_title and level where possible
    ],
    
    "success_tips": {{
        "preparation": [
            "How many weeks to prepare",
            "How many practice problems/cases to do",
            "Recommended resources (books, websites, courses)",
        ...
    ],
        "during_interview": [
            "Communication tips",
            "Problem-solving approach tips",
            "Questions to ask the interviewer",
        ...
    ],
        "company_specific": [
            "What makes this company's interviews unique",
            "Culture fit signals they look for",
            "Keywords or values to emphasize",
            ...
        ]
    }},
    
    "red_flags_and_mistakes": {{
        "common_mistakes": [
            # Role-appropriate mistakes - for consulting: case interview mistakes, for SWE: coding mistakes
            # Examples: "Not explaining your thought process while coding" (SWE) OR "Not structuring case properly" (Consulting)
        ],
        "company_specific_mistakes": [
            # Company-specific mistakes based on company values/culture
        ],
        "what_interviewers_flagged": [
            # From Reddit posts
            "Candidate couldn't explain their own projects",
            "Lack of curiosity - didn't ask good questions"
        ]
    }},
    
    "day_of_logistics": {{
        "what_to_wear": "Dress code expectations",
        "arrival_time": "How early to arrive",
        "what_to_bring": "Items to have ready",
        "virtual_setup": "Tech requirements for virtual interviews",
        "parking_building_access": "Logistics for in-person"
    }},
    
    "post_interview": {{
        "response_timeline": "When to expect to hear back",
        "thank_you_notes": "Whether/how to send them",
        "follow_up": "How to follow up if no response",
        "offer_details": "What the offer call/email typically includes",
        "negotiation_tips": "Advice on negotiating if applicable"
    }},
    
    "culture_insights": {{
        "work_life_balance": "Detailed WLB info with specifics",
        "team_dynamics": "How teams operate, collaboration style",
        "management_style": "How managers/leadership operate",
        "growth_opportunities": "Promotion timeline, learning opportunities",
        "diversity_inclusion": "DEI culture if mentioned",
        "remote_policy": "WFH/hybrid/in-office expectations"
    }},
    
    "compensation": {{
        "level": "{level if level else 'Not specified'}",
        "base_pay": {{
            # LEVEL-APPROPRIATE: For interns show hourly_rate and monthly_estimate, for full-time show annual_base
            # Example for intern: {{"hourly_rate": "$45-55/hour", "monthly_estimate": "$7,200-8,800/month", "annual_base": null}}
            # Example for full-time: {{"hourly_rate": null, "monthly_estimate": null, "annual_base": "$150-180k"}}
            "hourly_rate": "string or null",
            "annual_base": "string or null",
            "monthly_estimate": "string or null"
        }},
        "additional_compensation": {{
            "housing_stipend": "string or null (for interns)",
            "relocation": "string",
            "signing_bonus": "string",
            "equity": "string or null (for full-time roles)"
        }},
        "benefits": [
            # Company-specific benefits as strings
        ],
        "negotiation": "string with level-appropriate advice",
        "source": "Based on Levels.fyi and Reddit reports"
    }},
    
    "preparation_plan": {{
        "timeline": "[Role-appropriate timeline: Consulting=6-8 weeks, SWE=4-6 weeks for intern/6-8 for full-time, Finance=4-6 weeks]",
        "week_by_week": [
            # CRITICAL: Week-by-week plan MUST match role type:
            # - CONSULTING: Focus on case frameworks, market sizing, behavioral prep (NO LeetCode)
            # - SOFTWARE ENGINEERING: Focus on coding problems, algorithms, system design
            # - FINANCE: Focus on technicals (DCF, valuation), Excel, behavioral
            # Example for CONSULTING Week 1: "Learn profitability and market entry frameworks", "Read Case in Point"
            # Example for SWE Week 1: "Review data structures", "Start LeetCode easy problems"
            {{
                "week": 1,
                "focus": "[Role-appropriate focus]",
                "tasks": [
                    # Role-appropriate tasks ONLY - see role-specific instructions
                ]
            }}
            # ... more weeks
        ],
        "resources": {{
            # CRITICAL: Resources MUST match role type:
            # - CONSULTING: Case in Point, PrepLounge, CaseCoach, Victor Cheng (NO LeetCode)
            # - SOFTWARE ENGINEERING: LeetCode, NeetCode, System Design Primer
            # - FINANCE: Breaking Into Wall Street, WSO, Rosenbaum book (NO LeetCode)
            # Structure: Use categories like "case_practice" for consulting, "coding_practice" for SWE
            "case_practice": [
                # For CONSULTING roles only
                # {{"name": "Case in Point", "url": "...", "note": "Essential frameworks"}},
                # {{"name": "PrepLounge", "url": "...", "note": "Find case partners"}}
            ],
            "coding_practice": [
                # For SOFTWARE ENGINEERING roles only
                # {{"name": "LeetCode", "url": "https://leetcode.com/", "note": "Practice coding problems"}}
            ],
            "company_research": [
                {{"name": "Glassdoor {company_name} Interviews", "url": "https://glassdoor.com/Interview/{company_name}-Interview-Questions", "note": "Real interview reports"}},
                {{"name": "Levels.fyi", "url": "https://levels.fyi/companies/{company_name.lower()}", "note": "Compensation data"}}
            ]
        }},
        "number_of_cases": "[For CONSULTING: '40-50 cases recommended']",
        "number_of_problems": "[For SWE: '100-150 LeetCode problems recommended']"
    }},
    
    # ROLE-SPECIFIC SECTIONS (include only if applicable):
    "case_interview_prep": {{
        # ONLY for CONSULTING roles - include frameworks, market sizing, mental math tips
        "frameworks": [
            {{"name": "Profitability Framework", "when_to_use": "...", "structure": "...", "example_question": "..."}}
        ],
        "market_sizing": {{"approach": "...", "example_questions": ["..."], "tips": ["..."]}},
        "mental_math_tips": ["..."]
    }},
    
    "coding_interview_prep": {{
        # ONLY for SOFTWARE ENGINEERING roles
        "patterns_to_master": [
            {{"pattern": "Two Pointers", "example": "...", "when_to_use": "..."}}
        ]
    }},
    
    "technical_interview_prep": {{
        # For FINANCE roles - DCF, valuation, accounting questions
        "accounting_questions": [
            {{"question": "Walk me through the three financial statements", "hint": "..."}}
        ],
        "valuation_questions": [
            {{"question": "Walk me through a DCF", "hint": "..."}}
        ]
    }},
    
    "sources_count": {len(reddit_posts)},
    "sources_quality": "Mix of recent (2024) and older posts, primarily from r/cscareerquestions",
    "data_gaps": ["Limited info on specific team cultures", "Few reports on remote interview format"]
}}

CRITICAL INSTRUCTIONS - READ CAREFULLY:
1. ROLE CATEGORY IS {role_category} - THE CONTENT MUST MATCH THIS EXACTLY
2. For CONSULTING roles: 
   - DO NOT include ANY LeetCode, coding problems, data structures, or algorithms
   - DO include case interview frameworks, market sizing, behavioral questions
   - Resources: Case in Point, PrepLounge, CaseCoach (NOT LeetCode)
   - Week-by-week: Focus on case practice, frameworks, behavioral prep
3. For SOFTWARE ENGINEERING roles:
   - DO include coding problems, LeetCode, algorithms, system design
   - DO NOT include case interviews or consulting frameworks
4. For FINANCE roles:
   - DO include DCF, valuation, accounting questions
   - DO NOT include LeetCode or coding problems
5. Extract ACTUAL questions from Reddit posts, not generic ones
6. Make compensation LEVEL-APPROPRIATE (intern vs full-time vs senior)
7. Include role-specific sections (case_interview_prep for consulting, coding_interview_prep for SWE)
8. Resources in preparation_plan MUST match role type - NO LeetCode for consulting/finance/marketing

Return ONLY valid JSON, no markdown formatting."""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert at extracting structured insights from interview-related discussions. You analyze Reddit posts and extract factual, specific information about interview processes, questions, and tips. You always return valid JSON."
                },
                {"role": "user", "content": prompt}
            ],
            max_tokens=8000,  # Much higher limit for comprehensive extraction
            temperature=0.15,  # Very low temperature for factual, comprehensive extraction
        )
        
        response_text = response.choices[0].message.content.strip()
        
        # Remove markdown if present
        if '```' in response_text:
            response_text = response_text.split('```')[1]
            if response_text.startswith('json'):
                response_text = response_text[4:]
            response_text = response_text.strip()
        
        # Parse JSON
        result = json.loads(response_text)
        
        # Ensure all required fields exist with comprehensive structure
        defaults = {
            'interview_process': {
                "stages": [],
                "total_timeline": "Not mentioned",
                "level_specific_notes": "Not mentioned"
            },
            'common_questions': {
                "behavioral": {"questions": [], "general_tips": ""},
                "technical": {"questions": [], "skill_specific_questions": {}, "general_tips": ""},
                "company_specific": {"questions": []},
                "reported_actual_questions": []
            },
            'real_interview_experiences': [],
            'success_tips': {
                "preparation": [],
                "during_interview": [],
                "company_specific": []
            },
            'red_flags_and_mistakes': {
                "common_mistakes": [],
                "company_specific_mistakes": [],
                "what_interviewers_flagged": []
            },
            'day_of_logistics': {
                "what_to_wear": "Not mentioned",
                "arrival_time": "Not mentioned",
                "what_to_bring": "Not mentioned",
                "virtual_setup": "Not mentioned",
                "parking_building_access": "Not mentioned"
            },
            'post_interview': {
                "response_timeline": "Not mentioned",
                "thank_you_notes": "Not mentioned",
                "follow_up": "Not mentioned",
                "offer_details": "Not mentioned",
                "negotiation_tips": "Not mentioned"
            },
            'culture_insights': {
                "work_life_balance": "Not mentioned",
                "team_dynamics": "Not mentioned",
                "management_style": "Not mentioned",
                "growth_opportunities": "Not mentioned",
                "diversity_inclusion": "Not mentioned",
                "remote_policy": "Not mentioned"
            },
            'compensation': {
                "base_salary_range": "Not mentioned",
                "bonus_structure": "Not mentioned",
                "benefits_highlights": "Not mentioned",
                "salary_by_level": "Not mentioned",
                "negotiation_room": "Not mentioned"
            },
            'preparation_plan': {
                "timeline": "4-6 weeks recommended",
                "week_by_week": [],
                "resources": {
                    "coding_practice": [],
                    "company_research": [],
                    "skill_specific": []
                },
                "number_of_problems": "50 LeetCode problems recommended"
            },
            'sources_count': len(reddit_posts),
            'sources_quality': "Based on available Reddit posts",
            'data_gaps': []
        }
        
        for key, default_value in defaults.items():
            if key not in result:
                result[key] = default_value
        
        return result
        
    except json.JSONDecodeError as e:
        print(f"JSON decode error: {e}")
        print(f"Response text: {response_text[:500]}")
        # Return fallback structure with comprehensive fields
        return {
            "company_name": company_name,
            "last_updated": datetime.now().isoformat(),
            "interview_process": {
                "stages": [],
                "total_timeline": "Unable to extract timeline",
                "level_specific_notes": "Not mentioned"
            },
            "common_questions": {
                "behavioral": {"questions": [], "general_tips": ""},
                "technical": {"questions": [], "skill_specific_questions": {}, "general_tips": ""},
                "company_specific": {"questions": []},
                "reported_actual_questions": []
            },
            "real_interview_experiences": [],
            "success_tips": {
                "preparation": [],
                "during_interview": [],
                "company_specific": []
            },
            "red_flags_and_mistakes": {
                "common_mistakes": [],
                "company_specific_mistakes": [],
                "what_interviewers_flagged": []
            },
            "day_of_logistics": {
                "what_to_wear": "Not mentioned",
                "arrival_time": "Not mentioned",
                "what_to_bring": "Not mentioned",
                "virtual_setup": "Not mentioned",
                "parking_building_access": "Not mentioned"
            },
            "post_interview": {
                "response_timeline": "Not mentioned",
                "thank_you_notes": "Not mentioned",
                "follow_up": "Not mentioned",
                "offer_details": "Not mentioned",
                "negotiation_tips": "Not mentioned"
            },
            "culture_insights": {
                "work_life_balance": "Not mentioned",
                "team_dynamics": "Not mentioned",
                "management_style": "Not mentioned",
                "growth_opportunities": "Not mentioned",
                "diversity_inclusion": "Not mentioned",
                "remote_policy": "Not mentioned"
            },
            "compensation": {
                "base_salary_range": "Not mentioned",
                "bonus_structure": "Not mentioned",
                "benefits_highlights": "Not mentioned",
                "salary_by_level": "Not mentioned",
                "negotiation_room": "Not mentioned"
            },
            "preparation_plan": {
                "timeline": "4-6 weeks recommended",
                "week_by_week": [],
                "resources": {
                    "coding_practice": [],
                    "company_research": [],
                    "skill_specific": []
                },
                "number_of_problems": "50 LeetCode problems recommended"
            },
            "sources_count": len(reddit_posts),
            "sources_quality": "Failed to extract insights",
            "data_gaps": [],
            "error": "Failed to parse OpenAI response"
        }
    except Exception as e:
        print(f"Error processing Reddit data: {e}")
        import traceback
        traceback.print_exc()
        raise


def process_interview_content_v2(
    normalized_content: List[Dict], 
    job_details: Dict,
    source_stats: Dict = None,
    user_context: Dict = None,  # NEW: Accept user context for personalization
    include_prep_plan: bool = True  # NEW: Flag to include prep plan in response
) -> Dict:
    """
    Process multi-source normalized content (Reddit, YouTube, Glassdoor) with OpenAI.
    
    Args:
        normalized_content: List of normalized content items from ContentAggregator
        job_details: Parsed job posting details
        source_stats: Dict with source counts (reddit_count, youtube_count, glassdoor_count)
    
    Returns structured JSON with multi-source interview insights.
    """
    company_name = job_details.get("company_name", "Unknown Company")
    job_title = job_details.get("job_title", "")
    level = job_details.get("level", "")
    role_category = job_details.get("role_category", "Other")
    
    if not normalized_content:
        return {
            "company_name": company_name,
            "last_updated": datetime.now().isoformat(),
            "error": "No content found from any source",
            "sources_count": 0
        }
    
    client = get_openai_client()
    if not client:
        raise Exception("OpenAI client not available")
    
    # Separate content by source
    reddit_items = [item for item in normalized_content if item.get("source") == "reddit"]
    youtube_items = [item for item in normalized_content if item.get("source") == "youtube"]
    glassdoor_items = [item for item in normalized_content if item.get("source") == "glassdoor"]
    
    # Prepare content summaries with source attribution
    reddit_text = ""
    if reddit_items:
        reddit_text = "## REDDIT POSTS:\n"
        for i, item in enumerate(reddit_items[:30], 1):  # Limit to 30 for token efficiency
            reddit_text += f"\n=== POST {i} (r/{item.get('metadata', {}).get('subreddit', 'unknown')}) ===\n"
            reddit_text += f"Title: {item.get('title', '')}\n"
            reddit_text += f"Content: {item.get('content', '')[:3000]}\n"  # Limit content length
            if len(item.get('content', '')) > 3000:
                reddit_text += "[... truncated ...]\n"
    
    youtube_text = ""
    if youtube_items:
        youtube_text = "## YOUTUBE VIDEO TRANSCRIPTS:\n"
        for i, item in enumerate(youtube_items[:15], 1):  # Limit to 15 videos
            metadata = item.get("metadata", {})
            youtube_text += f"\n=== VIDEO {i}: {item.get('title', '')} ===\n"
            youtube_text += f"Channel: {metadata.get('channel', 'Unknown')}\n"
            youtube_text += f"Views: {metadata.get('view_count', 0)}\n"
            youtube_text += f"Has Transcript: {metadata.get('has_transcript', False)}\n"
            youtube_text += f"Content: {item.get('content', '')[:3000]}\n"
            if len(item.get('content', '')) > 3000:
                youtube_text += "[... truncated ...]\n"
    
    glassdoor_text = ""
    if glassdoor_items:
        glassdoor_text = "## GLASSDOOR INTERVIEW REVIEWS:\n"
        for i, item in enumerate(glassdoor_items[:20], 1):  # Limit to 20 reviews
            metadata = item.get("metadata", {})
            glassdoor_text += f"\n=== REVIEW {i} ===\n"
            glassdoor_text += f"Position: {metadata.get('job_title', 'Unknown')}\n"
            glassdoor_text += f"Outcome: {metadata.get('outcome', 'Unknown')}\n"
            glassdoor_text += f"Difficulty: {metadata.get('difficulty', 'Unknown')}\n"
            glassdoor_text += f"Experience: {item.get('content', '')[:2000]}\n"
            if len(item.get('content', '')) > 2000:
                glassdoor_text += "[... truncated ...]\n"
            # Include questions if available
            questions = item.get("questions", [])
            if questions:
                glassdoor_text += f"Questions Asked: {', '.join(questions[:5])}\n"
    
    # Get source counts
    reddit_count = source_stats.get("reddit", len(reddit_items)) if source_stats else len(reddit_items)
    youtube_count = source_stats.get("youtube", len(youtube_items)) if source_stats else len(youtube_items)
    glassdoor_count = source_stats.get("glassdoor", len(glassdoor_items)) if source_stats else len(glassdoor_items)
    
    required_skills = job_details.get("required_skills", [])
    team_division = job_details.get("team_division")
    
    role_context = f" for {job_title} at {company_name}"
    if level:
        role_context += f" ({level})"
    
    skills_context = ""
    if required_skills:
        skills_context = f"\n\nREQUIRED SKILLS FROM JOB POSTING: {', '.join(required_skills[:10])}"
    
    # Format user context for personalization
    user_context_str = ""
    if user_context:
        user_context_lines = ["\nUSER CONTEXT (for personalization):"]
        if user_context.get("name"):
            user_context_lines.append(f"- Name: {user_context.get('name')}")
        if user_context.get("major"):
            user_context_lines.append(f"- Major: {user_context.get('major')}")
        if user_context.get("university"):
            user_context_lines.append(f"- University: {user_context.get('university')}")
        if user_context.get("year"):
            user_context_lines.append(f"- Year: {user_context.get('year')}")
        if user_context.get("experience"):
            exp = user_context.get("experience", [])
            if isinstance(exp, list) and exp:
                user_context_lines.append(f"- Experience: {', '.join(str(e) for e in exp[:3])}")
        if user_context.get("skills"):
            skills = user_context.get("skills", [])
            if isinstance(skills, list) and skills:
                user_context_lines.append(f"- Skills: {', '.join(str(s) for s in skills[:5])}")
        if len(user_context_lines) > 1:  # More than just the header
            user_context_str = "\n".join(user_context_lines)
    
    # Build prep plan schema if requested
    prep_plan_schema = ""
    if include_prep_plan:
        prep_plan_schema = ''',
    
    "prep_plan": {
        "weeks": [
            {
                "week": 1,
                "title": "[Specific title like 'Master Data Fundamentals' or 'Behavioral Interview Prep']",
                "focus": "[What this week targets - tie to skill gaps or interview stages]",
                "tasks": [
                    "[Specific task 1 - e.g., 'Complete 15 LeetCode Easy problems on arrays and strings']",
                    "[Specific task 2 - e.g., 'Review SQL JOIN types with 10 practice queries']",
                    "[Specific task 3 - e.g., 'Study and practice the top 3 behavioral questions from above']",
                    "[Specific task 4 - e.g., 'Research {company_name} recent product launches and strategy']",
                    "[Specific task 5 - e.g., 'Prepare STAR stories for leadership and teamwork questions']"
                ],
                "practice_questions": [
                    "[Question from behavioral_questions above]",
                    "[Question from technical_questions above]"
                ],
                "resources": [
                    "[Specific resource 1 - e.g., 'LeetCode Array Problems']",
                    "[Specific resource 2 - e.g., 'SQL Tutorial on JOINs']"
                ]
            },
            {
                "week": 2,
                "title": "[Week 2 specific title]",
                "focus": "[Week 2 focus area]",
                "tasks": ["[Task 1]", "[Task 2]", "[Task 3]", "[Task 4]", "[Task 5]"],
                "practice_questions": ["[Question 1]", "[Question 2]"],
                "resources": ["[Resource 1]", "[Resource 2]"]
            },
            {
                "week": 3,
                "title": "[Week 3 specific title]",
                "focus": "[Week 3 focus area]",
                "tasks": ["[Task 1]", "[Task 2]", "[Task 3]", "[Task 4]", "[Task 5]"],
                "practice_questions": ["[Question 1]", "[Question 2]"],
                "resources": ["[Resource 1]", "[Resource 2]"]
            },
            {
                "week": 4,
                "title": "[Week 4 specific title - e.g., 'Final Review and Mock Interviews']",
                "focus": "[Week 4 focus area]",
                "tasks": ["[Task 1]", "[Task 2]", "[Task 3]", "[Task 4]", "[Task 5]"],
                "practice_questions": ["[Question 1]", "[Question 2]"],
                "resources": ["[Resource 1]", "[Resource 2]"]
            }
        ],
        "recommended_resources": [
            {
                "title": "[Resource name]",
                "url": "[URL if available]",
                "description": "[Why this helps for this role]"
            }
        ]
    }'''
    
    # Build the prompt
    prompt = f"""You are creating a COMPREHENSIVE interview preparation guide{role_context} using data from MULTIPLE SOURCES.
{user_context_str}

JOB POSTING CONTEXT:
- Company: {company_name}
- Job Title: {job_title}
- Level: {level or 'Not specified'}
- Team/Division: {team_division or 'Not specified'}
- Role Category: {role_category}
{skills_context}

DATA SOURCES:
- Reddit: {reddit_count} posts
- YouTube: {youtube_count} videos with transcripts
- Glassdoor: {glassdoor_count} interview reviews

IMPORTANT: 
- Attribute quotes to their sources (e.g., "Reddit r/subreddit", "YouTube 'Video Title'", "Glassdoor review")
- Identify patterns across sources (most common questions, typical timeline, etc.)
- Extract specific, actionable insights
- Distinguish between successful (offer) and unsuccessful (rejected) experiences

{reddit_text}

{youtube_text}

{glassdoor_text}

Return ONLY valid JSON in this exact structure:
{{
    "company_name": "{company_name}",
    "job_title": "{job_title}",
    "year": "2024",
    "last_updated": "{datetime.now().isoformat()}",
    
    "summary_stats": {{
        "total_sources": {reddit_count + youtube_count + glassdoor_count},
        "reddit_count": {reddit_count},
        "youtube_count": {youtube_count},
        "glassdoor_count": {glassdoor_count},
        "interview_rounds": 0,
        "timeline_weeks": "4-6 weeks"
    }},
    
    "interview_stages": [
        {{
            "stage_number": 1,
            "name": "Application",
            "duration": "N/A",
            "format": "Online",
            "description": "Submit resume and cover letter",
            "quotes": [
                {{"text": "[Quote]", "source": "Reddit r/subreddit", "attribution": "u/username"}}
            ],
            "tips": ["Tip 1", "Tip 2"]
        }}
    ],
    
    "interview_rounds_table": [
        {{"round": "Phone Screen", "duration": "30 min", "focus": "Resume review", "interviewers": "Recruiter"}}
    ],
    
    "behavioral_questions": [
        # MINIMUM 8 QUESTIONS REQUIRED - Extract from all sources
        # Include frequency (how many sources mentioned this question)
        # Include source attribution (which source(s) mentioned it)
        {{
            "question": "[Exact question text from sources]",
            "why_asked": "[Why this company asks this - tie to company values]",
            "tip": "[How to structure your answer]",
            "frequency": 5,
            "sources": ["Reddit r/cscareerquestions", "Glassdoor"]
        }}
        # ... extract 8-10 questions total ...
    ],
    
    "technical_questions": [
        # MINIMUM 8 QUESTIONS REQUIRED
        # Prioritize questions testing: {', '.join(required_skills[:6]) if required_skills else 'role-specific skills'}
        {{
            "question": "[Exact question]",
            "frequency": 3,
            "difficulty": "Easy/Medium/Hard",
            "source": "YouTube/Reddit/Glassdoor",
            "skills_tested": ["skill1", "skill2"],
            "hint": "[Brief approach hint]"
        }}
        # ... extract 8-10 questions total ...
    ],
    
    "company_specific_questions": [
        {{
            "question": "Why {company_name}?",
            "what_they_want": ["Point 1", "Point 2"]
        }}
    ],
    
    "real_experiences": [
        # MINIMUM 5 EXPERIENCES REQUIRED
        # Include mix of outcomes: offers, rejections, ghosted
        # Use DIRECT QUOTES from sources - copy actual text
        {{
            "role": "{job_title}",
            "year": "2024",
            "outcome": "OFFER RECEIVED / REJECTED / GHOSTED",
            "source_type": "Reddit/YouTube/Glassdoor",
            "source_detail": "r/subreddit or channel name",
            "quote": "[EXACT quote from the source - copy real text, don't paraphrase]",
            "key_insight": "[Main takeaway for candidates]",
            "questions_asked": ["Q1", "Q2", "Q3"],
            "timeline": "[e.g., '3 weeks from apply to offer']",
            "difficulty": "Easy/Medium/Hard",
            "rounds": 4,
            "what_went_wrong": null
        }}
        # ... extract 5-8 experiences total ...
    ],
    
    "red_flags": ["Mistake 1", "Mistake 2"],
    
    "compensation": {{
        "salary_range": "[Range]",
        "bonus": "[Info]",
        "housing_stipend": "[Info or null]",
        "relocation": "[Info]",
        "signing_bonus": "[Info]",
        "negotiation_tip": "[Advice]"
    }},
    
    "culture": {{
        "work_life_balance": "[Assessment]",
        "team_dynamics": "[Assessment]",
        "management_style": "[Assessment]",
        "growth_opportunities": "[Assessment]",
        "remote_policy": "[Policy]"
    }},
    
    "timeline": {{
        "response_time": "[Timeline]",
        "thank_you_advice": "[Advice]",
        "follow_up_advice": "[Advice]",
        "offer_details": "[Details]"
    }},
    
    "resources": [
        {{"name": "[Resource]", "url": "[URL]", "description": "[Description]"}}
    ]{prep_plan_schema}
}}

CRITICAL EXTRACTION REQUIREMENTS:
1. Extract MINIMUM 8 behavioral questions (10 preferred)
2. Extract MINIMUM 8 technical questions (10 preferred)  
3. Extract MINIMUM 5 real interview experiences (8 preferred)
4. Use DIRECT QUOTES from sources - don't paraphrase or make up quotes
5. Include frequency counts based on how often each question appears across sources
6. For technical questions, prioritize ones testing: {', '.join(required_skills[:6]) if required_skills else 'role-specific skills'}
7. Include BOTH successful (offer) and unsuccessful (rejected) experiences
8. If sources lack content for a category, still extract what's available and note it
9. Generate a SPECIFIC 4-week prep plan with actionable tasks (not generic like "practice skills")
10. Prep plan tasks should reference actual questions extracted above
11. If user profile provided, tailor prep plan to their skill gaps and background

CRITICAL: Include source attribution for all quotes and experiences. Be specific with actual data from the sources."""
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert career coach analyzing interview data from multiple sources. You synthesize content from Reddit, YouTube, and Glassdoor into structured interview intelligence. Always attribute quotes to their sources."
                },
                {"role": "user", "content": prompt}
            ],
            max_tokens=10000,  # Increased to handle prep plan in response
            temperature=0.15,
        )
        
        response_text = response.choices[0].message.content.strip()
        
        # Remove markdown if present
        if '```' in response_text:
            response_text = response_text.split('```')[1]
            if response_text.startswith('json'):
                response_text = response_text[4:]
            response_text = response_text.strip()
        
        # Parse JSON
        result = json.loads(response_text)
        
        # Ensure required fields exist
        defaults = {
            'summary_stats': {
                "total_sources": reddit_count + youtube_count + glassdoor_count,
                "reddit_count": reddit_count,
                "youtube_count": youtube_count,
                "glassdoor_count": glassdoor_count,
                "interview_rounds": 0,
                "timeline_weeks": "4-6 weeks"
            },
            'interview_stages': [],
            'interview_rounds_table': [],
            'behavioral_questions': [],
            'technical_questions': [],
            'company_specific_questions': [],
            'real_experiences': [],
            'red_flags': [],
            'compensation': {},
            'culture': {},
            'timeline': {},
            'resources': []
        }
        
        for key, default_value in defaults.items():
            if key not in result:
                result[key] = default_value
        
        return result
        
    except json.JSONDecodeError as e:
        print(f"JSON decode error in v2 processor: {e}")
        print(f"Response text: {response_text[:500]}")
        # Return fallback structure
        return {
            "company_name": company_name,
            "job_title": job_title,
            "last_updated": datetime.now().isoformat(),
            "error": "Failed to parse OpenAI response",
            **defaults
        }
    except Exception as e:
        print(f"Error processing multi-source content: {e}")
        import traceback
        traceback.print_exc()
        raise

