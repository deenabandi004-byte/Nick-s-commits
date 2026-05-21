"""
Meeting prep utilities - similarity, questions, cheat sheet, strategy generation
"""
import json
import logging
import re

from app.services.openai_client import get_openai_client
from app.utils.users import (
    extract_hometown_from_resume,
    extract_companies_from_resume,
    get_university_shorthand,
    get_university_mascot,
    get_university_variants,
)

logger = logging.getLogger(__name__)


def detect_commonality(user_info, contact, resume_text):
    """
    Detect strongest commonality between user and contact.
    Handles both legacy field names (College, Company, City) and
    PDL-enriched field names (educationArray, company, city, location).
    Returns: (commonality_type, details_dict)
    """
    user_university = (user_info.get('university', '') or '').strip()

    # Build contact education string and extract individual school names
    edu_parts = []
    contact_schools = []  # individual school names for variant matching
    # PDL enriched format
    for edu in contact.get('educationArray', []):
        if isinstance(edu, dict):
            school = edu.get('school', '')
            # PDL returns school as {"name": "...", "type": "..."} or as a string
            if isinstance(school, dict):
                school = school.get('name', '')
            if school:
                contact_schools.append(school)
            edu_parts.append(school or '')
            edu_parts.append(edu.get('degree', ''))
            edu_parts.append(edu.get('major', ''))
    # Legacy / flat fields
    legacy_college = contact.get('College', '') or ''
    if legacy_college:
        contact_schools.append(legacy_college)
    edu_parts.append(legacy_college)
    edu_parts.append(contact.get('EducationTop', '') or '')
    edu_parts.append(contact.get('education', '') if isinstance(contact.get('education'), str) else '')
    contact_education = ' '.join(filter(None, edu_parts)).lower()

    # Company: handle both PDL (lowercase) and legacy (Title case) field names
    contact_company = (
        contact.get('company', '') or contact.get('Company', '') or ''
    ).lower()

    # 1. Check same university (STRONGEST commonality)
    if user_university:
        user_uni_variants = get_university_variants(user_university)
        # Check if any user variant is a substring of the contact education blob
        matched = any(v in contact_education for v in user_uni_variants)
        # Also check variant overlap with each individual school name
        if not matched:
            for school in contact_schools:
                if user_uni_variants & get_university_variants(school):
                    matched = True
                    break
        if matched:
            return ('university', {
                'university': user_university,
                'university_short': get_university_shorthand(user_university),
                'mascot': get_university_mascot(user_university)
            })

    # 2. Check same hometown
    user_hometown = extract_hometown_from_resume(resume_text or '')
    # PDL uses lowercase 'city'/'location', legacy uses 'City'
    contact_city = (
        contact.get('city', '') or contact.get('City', '')
        or contact.get('location', '') or ''
    ).lower()
    if user_hometown and user_hometown.lower() in contact_city:
        return ('hometown', {
            'hometown': user_hometown
        })

    # 3. Check same company/internship
    user_companies = extract_companies_from_resume(resume_text or '')
    if contact_company and any(uc.lower() in contact_company for uc in user_companies if uc):
        connection_type = 'interned' if 'intern' in (resume_text or '').lower() else 'worked'
        role_type = 'Intern' if 'intern' in (resume_text or '').lower() else 'Team Member'
        return ('company', {
            'company': contact.get('company', '') or contact.get('Company', ''),
            'connection_type': connection_type,
            'role_type': role_type
        })

    # 4. No strong commonality - use general template
    return ('general', {})


def generate_meeting_similarity(contact_data: dict, user_context: dict, research: dict) -> str:
    """
    Generate an opening observation + icebreaker list using full user and contact data.
    Returns markdown string.
    """
    client = get_openai_client()
    if not client:
        return ""

    try:
        # Build experience timeline string for the contact
        exp_lines = []
        for e in contact_data.get("experienceArray", [])[:5]:
            dates = f"{e.get('start_date','')} - {'Present' if e.get('is_current') else e.get('end_date','')}"
            exp_lines.append(f"  - {e.get('title', '')} @ {e.get('company', '')} ({dates})")
        contact_timeline = "\n".join(exp_lines) or contact_data.get("workExperience", [""])[0]

        # Build education string for contact
        edu_lines = [
            f"  - {e.get('degree','')} in {e.get('major','')} @ {e.get('school','')} ({e.get('end_date','')})"
            for e in contact_data.get("educationArray", [])
        ]
        contact_education = "\n".join(edu_lines) or contact_data.get("education", "")

        # User experience bullets
        user_exp_lines = [
            f"  - {e.get('title','')} at {e.get('company','')} ({e.get('dates','')}): {'; '.join(e.get('bullets',[])[:2])}"
            for e in user_context.get("experiences", [])[:4]
        ]
        user_exp = "\n".join(user_exp_lines) or "No prior experience listed"

        person_mentions = "\n".join([
            f"  - {r.get('title','')} ({r.get('source','')}): {r.get('snippet','')}"
            for r in research.get("person_mentions", [])[:3]
        ]) or "None found"

        prompt = f"""You are helping a college student prepare for a meeting. Find genuine, specific common ground between them and their contact. Be warm and conversational - not sycophantic.

STUDENT PROFILE:
Name: {user_context.get('name', 'the student')}
University: {user_context.get('university', '')}
Major: {user_context.get('major', '')}
Year: {user_context.get('year', '')}
GPA: {user_context.get('gpa') or 'not provided'}
Skills: {', '.join(user_context.get('skills', [])[:10]) or 'not provided'}
Interests/Hobbies: {', '.join(user_context.get('interests', [])[:8]) or 'not provided'}
Clubs & Activities: {', '.join(user_context.get('clubs', [])[:6]) or 'not provided'}
Work Experience:
{user_exp}
Projects: {', '.join([p.get('name','') for p in user_context.get('projects',[])[:3]]) or 'none listed'}
Career Goals: {user_context.get('careerGoals', 'not stated')}
Target Industries: {', '.join(user_context.get('targetIndustries', [])) or 'not stated'}
Target Roles: {', '.join(user_context.get('targetRoles', [])) or 'not stated'}
Languages: {', '.join(user_context.get('languages', [])) or 'not stated'}

CONTACT PROFILE:
Name: {contact_data.get('fullName', '')}
Current Role: {contact_data.get('jobTitle', '')} at {contact_data.get('company', '')}
Industry: {contact_data.get('industry', '')}
Location: {contact_data.get('location', '')}
Years Experience: {contact_data.get('yearsExperience', 'unknown')}
Career Timeline:
{contact_timeline}
Education:
{contact_education}
Skills: {', '.join(contact_data.get('skills', [])[:10]) or 'not available'}
Interests: {', '.join(contact_data.get('interests', [])[:8]) or 'not available'}
LinkedIn Summary: {contact_data.get('summary', 'not available')[:300]}
Languages: {', '.join(contact_data.get('languages', [])) or 'not available'}
Certifications: {', '.join([c.get('name','') for c in contact_data.get('certifications', [])]) or 'none'}

RESEARCH ABOUT THIS PERSON:
{person_mentions}

---

Generate a "Common Ground & Icebreakers" section with:

1. An **opening observation** (2-3 sentences) about genuine, specific similarities. Must cite actual evidence (school names, companies, skills, shared interests). No vague language like "both passionate about X".

2. A list of **3-5 icebreaker topics**, each with:
   - The topic name (short)
   - Why it connects them (1 sentence, specific)

3. One **secret weapon** - the single most interesting or unexpected connection point.

RULES - read carefully:
1. PRIORITY ORDER for the opening observation:
   - FIRST: If student has startup/founder experience → lead with how their product/domain connects to the contact's industry or company. This is ALWAYS the strongest hook.
   - SECOND: Shared career stage transition (e.g. both moved from engineering to management)
   - THIRD: Direct industry overlap (contact works in a field the student is targeting)
   - FOURTH: Shared alma mater or geography
   - LAST RESORT ONLY: Shared generic skills (Python, C++, Excel) - never lead with these

2. The opening observation must answer: "Why is THIS student uniquely interesting to THIS specific person?" - not just "what do they have in common?"

3. BAD example (never write this):
   "Both have experience with C++ and software development, providing common technical ground."

4. GOOD example (write like this):
   "You're building an AI recruiting platform as a USC founder - and Rupesh has spent 20+ years building the wireless infrastructure that smartphones run on. That's not the obvious connection, but it's the real one: you both know what it takes to build technical systems from the ground up inside large constraints, just at different scales."

5. Every icebreaker MUST have a specific "because" citing a real fact.
   BAD: "Discuss technology trends"
   GOOD: "His 7 years at Intel on LTE protocols - ask how he thinks about platform transitions, since you're making your own right now as a founder moving from 0→1"

6. The secret weapon must be something that would make the contact genuinely curious - not just a restatement of the opening observation.

7. Do NOT use: "both passionate about", "shared interest in", "common ground in", "aligns well with"
8. Output clean markdown, no code fences.
"""

        response = client.chat.completions.create(
            model="gpt-4o",
            max_tokens=600,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.choices[0].message.content.strip()

    except Exception as e:
        logger.error(f"Similarity generation failed: {e}")
        return ""


def generate_meeting_questions(contact_data: dict, user_context: dict, research: dict) -> list:
    """
    Generate 10 highly specific questions organized by category.
    Returns list of {"name": str, "questions": [str, str]}.
    """
    client = get_openai_client()
    if not client:
        return []

    try:
        exp_lines = []
        for e in contact_data.get("experienceArray", [])[:5]:
            dates = f"{e.get('start_date','')}-{'now' if e.get('is_current') else e.get('end_date','')}"
            exp_lines.append(f"  - {e.get('title', '')} @ {e.get('company', '')} ({dates})")
        contact_timeline = "\n".join(exp_lines) or "Not available"

        edu_lines = [
            f"  - {e.get('degree','')} in {e.get('major','')} @ {e.get('school','')} ({e.get('end_date','')})"
            for e in contact_data.get("educationArray", [])
        ]
        contact_education = "\n".join(edu_lines) or "Not available"

        user_exp_summary = "; ".join([
            f"{e.get('title','')} at {e.get('company','')}"
            for e in user_context.get("experiences", [])[:3]
        ]) or "No prior experience"

        news_lines = "\n".join([
            f"  - {n.get('title','')} ({n.get('source','')}): {n.get('snippet','')}"
            for n in research.get("company_news", [])[:4]
        ]) or "None available"

        industry_trends = "\n".join([
            f"  - {t.get('title','')} ({t.get('source','')}): {t.get('snippet','')}"
            for t in research.get("industry_trends", [])[:3]
        ]) or "None available"

        person_mentions = "\n".join([
            f"  - {r.get('title','')} ({r.get('source','')}): {r.get('snippet','')}"
            for r in research.get("person_mentions", [])[:3]
        ]) or "None found"

        prompt = f"""Generate 10 meeting questions for a student to ask their contact. These should make the contact feel genuinely seen and the student seem exceptionally well-prepared.

CONTACT:
Name: {contact_data.get('fullName', '')}
Title: {contact_data.get('jobTitle', '')} at {contact_data.get('company', '')}
Industry: {contact_data.get('industry', '')}
Company Size: {contact_data.get('jobCompanySize', 'unknown')}
Years Experience: {contact_data.get('yearsExperience', 'unknown')}
Skills: {', '.join(contact_data.get('skills', [])[:8]) or 'not available'}
Certifications: {', '.join([c.get('name','') for c in contact_data.get('certifications',[])]) or 'none'}
Interests: {', '.join(contact_data.get('interests', [])[:6]) or 'not available'}
LinkedIn Summary: {contact_data.get('summary', '')[:400]}
Career Timeline:
{contact_timeline}
Education:
{contact_education}

COMPANY RESEARCH - Recent News:
{news_lines}

INDUSTRY TRENDS:
{industry_trends}

PERSON-SPECIFIC RESEARCH (articles, talks, interviews featuring this person):
{person_mentions}

STUDENT CONTEXT:
{user_context.get('name','The student')} is a {user_context.get('year','')} studying {user_context.get('major','')} at {user_context.get('university','')}
Their work experience: {user_exp_summary}
Their skills: {', '.join(user_context.get('skills',[])[:8]) or 'not listed'}
Their career goals: {user_context.get('careerGoals','not stated')}
Their target roles: {', '.join(user_context.get('targetRoles',[])[:4]) or 'not stated'}

---

Generate exactly 5 categories with 2 questions each:
1. Career Trajectory (reference specific transitions in their timeline)
2. Company & Role (reference real news or company specifics)
3. Industry Insight (tie to actual trends from research)
4. Skill & Craft (reference their specific skills, certs, or tools)
5. Personal Journey (thoughtful, based on career moves and background)

CRITICAL RULES:
- Every question MUST reference something specific to this person (company name, school name, specific career move, actual news item, real skill, certification)
- NO generic questions - "What does a typical day look like?", "What advice would you give?", "What do you wish you'd known?" are ALL banned unless combined with something highly specific
- Questions should be curious and insightful, not flattering
- If research found an article/talk/interview mentioning this person, write a question about it
- If the student has relevant experience or skills that overlap, make some questions implicitly acknowledge that
- Calibrate question sophistication to the student's background - if they have finance internships, skip basic questions

Return exactly 5 categories in this order:
1. Career Trajectory
2. Company & Role
3. Industry Insight
4. Skill & Craft
5. Personal Journey

Each must have exactly 2 questions. Return ONLY valid JSON, no code fences, no preamble.
{{
  "categories": [
    {{
      "name": "Career Trajectory",
      "questions": ["question 1", "question 2"]
    }},
    ...
  ]
}}"""

        response = client.chat.completions.create(
            model="gpt-4o",
            max_tokens=800,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.choices[0].message.content.strip()
        logger.info(f'[QUESTIONS] raw output: {raw[:500] if raw else None}')
        raw = re.sub(r"^```json\s*", "", raw)
        raw = re.sub(r"\s*```$",    "", raw)
        try:
            categories = json.loads(raw).get("categories", [])
            logger.info(f'[QUESTIONS] parsed categories: {len(categories)} - {categories[:1]}')
            return categories
        except Exception:
            return []

    except Exception as e:
        logger.error(f"Question generation failed: {e}")
        return []


def generate_company_cheat_sheet(contact_data: dict, research: dict) -> str:
    """Generate a 4-5 row company cheat sheet. Returns markdown."""
    client = get_openai_client()
    if not client:
        return ""

    try:
        overview_snippets = "\n".join([
            f"  - {r.get('title','')} ({r.get('source','')}): {r.get('snippet','')}"
            for r in research.get("company_overview", [])[:3]
        ]) or "None found"

        news_snippets = "\n".join([
            f"  - {n.get('title','')} ({n.get('source','')}): {n.get('snippet','')}"
            for n in research.get("company_news", [])[:3]
        ]) or "None found"

        prompt = f"""Generate a concise company cheat sheet for a student preparing to meet someone at {contact_data.get('company','this company')}.

KNOWN DATA:
- Industry: {contact_data.get('industry', 'unknown')}
- Company Size: {contact_data.get('jobCompanySize', 'unknown')}
- Founded: {contact_data.get('jobCompanyFounded', 'unknown')}
- Contact's Role: {contact_data.get('jobTitle', '')}

RESEARCH:
Company Overview Articles:
{overview_snippets}

Recent News:
{news_snippets}

---

Generate exactly these 4 rows in markdown table format, or as labeled sections:

**What They Do** - 1-2 sentences, plain English, no jargon
**Key Facts** - 5 bullets: size, founded, HQ, business model, one recent milestone
**Industry Position** - Main competitors + what makes this company distinct (2 sentences)
**Culture Signals** - Any signals about values, work style, career paths from research (2 sentences)

Be factual and concise. If a section has no data, write a brief honest note rather than fabricating.
Output as a short structured markdown block.

IMPORTANT: Do NOT wrap your response in markdown code fences (no ```markdown or ```). Output plain markdown only.
"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=400,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.choices[0].message.content.strip()

    except Exception as e:
        logger.error(f"Company cheat sheet generation failed: {e}")
        return ""


def generate_conversation_strategy(contact_data: dict, user_context: dict, similarity_text: str) -> str:
    """Generate a 6-step conversation roadmap with Do/Avoid. Returns markdown."""
    client = get_openai_client()
    if not client:
        return ""

    try:
        prompt = f"""Create a practical conversation roadmap for a college student meeting with {contact_data.get('fullName','this contact')}.

STUDENT: {user_context.get('name','The student')}, {user_context.get('year','')} studying {user_context.get('major','')} at {user_context.get('university','')}
CONTACT: {contact_data.get('jobTitle','')} at {contact_data.get('company','')} · {contact_data.get('yearsExperience','?')} years experience
MEETING: 25-minute meeting (virtual or in-person)
STUDENT GOALS: {user_context.get('careerGoals','Not stated')}
COMMON GROUND IDENTIFIED:
{similarity_text[:400]}

---

Generate:

**CONVERSATION FLOW** (6 steps with timing):
Opening (0-2 min): One specific suggested opener referencing the common ground identified above
Rapport (2-7 min): 1-2 specific warm-up topics
Core Questions (7-17 min): Which 3-4 questions to prioritize and why
Your Story (17-20 min): What to share about themselves and how to connect it
The Ask (20-23 min): One specific, appropriate ask for this type of contact
Close (23-25 min): How to wrap up and set up follow-through

**DO THIS** (output exactly this header, then exactly 4 dash-list items):
- [specific do item 1]
- [specific do item 2]
- [specific do item 3]
- [specific do item 4]

**AVOID THIS** (output exactly this header, then exactly 4 dash-list items):
- [specific avoid item 1]
- [specific avoid item 2]
- [specific avoid item 3]
- [specific avoid item 4]

Keep it specific to this person and this student's background. No generic advice.

CRITICAL FORMAT RULES - follow exactly:
- Output ONLY the sections listed above
- Use **Bold Header:** format for section titles
- Use "- " (dash space) for all list items - never use numbered lists, never use • bullets
- Do NOT add any extra sections, headers, or content beyond what is specified
- Do NOT wrap output in code fences
- Do NOT add blank lines between list items
"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.choices[0].message.content.strip()

    except Exception as e:
        logger.error(f"Conversation strategy generation failed: {e}")
        return ""


# ─── Legacy helper functions (kept for backward compat) ─────────────────────

def _score_similarity_strength(similarity_summary: str) -> float:
    """Compute a 0-1 score for similarity strength based on content richness."""
    if not similarity_summary:
        return 0.0
    score = 0.0
    capitalized_count = len(re.findall(r'\b[A-Z][a-z]+\b', similarity_summary))
    score += min(capitalized_count * 0.1, 0.4)
    connection_words = ['both', 'shared', 'same', 'similar', 'common', 'also', 'together']
    connection_count = sum(1 for word in connection_words if word.lower() in similarity_summary.lower())
    score += min(connection_count * 0.05, 0.2)
    word_count = len(similarity_summary.split())
    if word_count >= 50:
        score += 0.3
    elif word_count >= 35:
        score += 0.2
    elif word_count >= 25:
        score += 0.1
    has_specifics = bool(re.search(r'\d+|years?|months?|university|college|company|firm', similarity_summary.lower()))
    if has_specifics:
        score += 0.1
    return min(score, 1.0)


def _score_question_relevance(question: str, similarity_summary: str) -> float:
    """Compute a 0-1 relevance score for a question based on similarity summary."""
    if not question or not similarity_summary:
        return 0.0
    stop_words = {
        'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'must', 'can', 'to', 'for', 'of', 'in',
        'on', 'at', 'by', 'with', 'from', 'as', 'and', 'or', 'but', 'if',
        'than', 'that', 'this', 'these', 'those', 'i', 'you', 'he', 'she',
        'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why',
        'how', 'both', 'each', 'every', 'some', 'any', 'all', 'about', 'into',
        'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down',
        'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once'
    }
    similarity_words = set()
    words = re.findall(r'\b[a-zA-Z]{2,}\b', similarity_summary.lower())
    for word in words:
        if word not in stop_words:
            similarity_words.add(word)
    if not similarity_words:
        return 0.0
    question_lower = question.lower()
    overlap_count = sum(1 for keyword in similarity_words if keyword in question_lower)
    max_possible = min(len(similarity_words), 10)
    normalized_score = min(overlap_count / max_possible, 1.0) if max_possible > 0 else 0.0
    if overlap_count >= 3:
        normalized_score = min(normalized_score * 1.3, 1.0)
    elif overlap_count >= 2:
        normalized_score = min(normalized_score * 1.1, 1.0)
    return normalized_score


def select_relevant_questions(questions: list, similarity_summary: str, max_questions: int = 3) -> list:
    """Select questions that best relate to the similarity summary."""
    if not questions or not similarity_summary:
        return (questions or [])[:max_questions]
    scored_questions = []
    for question in questions:
        if not question:
            continue
        score = _score_question_relevance(question, similarity_summary)
        scored_questions.append((score, question))
    scored_questions.sort(key=lambda x: x[0], reverse=True)
    selected = [q for _, q in scored_questions[:max_questions]]
    return selected if selected else (questions or [])[:max_questions]
