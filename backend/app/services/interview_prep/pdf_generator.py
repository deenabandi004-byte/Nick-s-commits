"""
PDF generator service - create interview prep PDFs
"""
from io import BytesIO
from typing import Dict, List, Optional
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Image, Table, TableStyle
from reportlab.lib import colors
from reportlab.lib.utils import ImageReader
import requests


def _safe_paragraph(text: str, style) -> Paragraph:
    """Create a safe paragraph that handles newlines"""
    if not text:
        text = ""
    return Paragraph(text.replace("\n", "<br/>"), style)


def _has_content(data) -> bool:
    """Check if data has meaningful content"""
    if not data:
        return False
    if isinstance(data, list):
        return len(data) > 0
    if isinstance(data, dict):
        return len(data) > 0 and not all(not v for v in data.values())
    return bool(data)


def _get_company_logo(company_domain: str) -> Optional[ImageReader]:
    """Fetch company logo from Clearbit"""
    try:
        logo_url = f"https://logo.clearbit.com/{company_domain}"
        response = requests.get(logo_url, timeout=3)
        if response.status_code == 200:
            return ImageReader(BytesIO(response.content))
    except Exception:
        pass
    return None


def generate_interview_prep_pdf(
    *,
    prep_id: str,
    job_details: Dict,
    insights: Dict,
) -> BytesIO:
    """
    Generate a comprehensive 5-6 page Interview Prep PDF tailored to the specific role.
    
    Args:
        prep_id: Unique prep ID
        job_details: Parsed job posting details (company_name, job_title, level, etc.)
        insights: Structured insights from content_processor
    """
    try:
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer, 
            pagesize=letter, 
            topMargin=36, 
            bottomMargin=36,
            leftMargin=72,
            rightMargin=72
        )
        styles = getSampleStyleSheet()
        story: List = []

        # Define styles
        title_style = ParagraphStyle(
            "InterviewTitle",
            parent=styles["Heading1"],
            fontSize=24,
            textColor="#1a73e8",
            spaceAfter=18,
            alignment=TA_CENTER,
        )
        section_title = ParagraphStyle(
            "SectionTitle",
            parent=styles["Heading2"],
            fontSize=16,
            textColor="#0b5394",
            spaceAfter=12,
            spaceBefore=18,
        )
        subsection_title = ParagraphStyle(
            "SubsectionTitle",
            parent=styles["Heading3"],
            fontSize=13,
            textColor="#1565c0",
            spaceAfter=8,
            spaceBefore=12,
        )
        body_style = ParagraphStyle(
            "Body",
            parent=styles["BodyText"],
            fontSize=10.5,
            leading=14,
            alignment=TA_LEFT,
            spaceAfter=6,
        )
        bullet_style = ParagraphStyle(
            "Bullets",
            parent=body_style,
            leftIndent=16,
            bulletIndent=6,
            bulletFontName="Helvetica-Bold",
        )

        company_name = job_details.get("company_name", "Company")
        company_domain = job_details.get("company_domain", "")
        job_title = job_details.get("job_title", "Role")
        level = job_details.get("level", "")
        team_division = job_details.get("team_division", "")
        location = job_details.get("location", "")
        remote_policy = job_details.get("remote_policy", "")
        required_skills = job_details.get("required_skills", [])
        role_category = job_details.get("role_category", "Other")
        
        # PAGE 1 - Cover & Job Overview
        # Header with company logo
        if company_domain:
            logo = _get_company_logo(company_domain)
            if logo:
                try:
                    img = Image(logo, width=2*inch, height=0.5*inch)
                    story.append(img)
                    story.append(Spacer(1, 0.1*inch))
                except Exception:
                    pass
        
        # Job title in large text
        full_job_title = job_title
        if level:
            full_job_title = f"{level} {job_title}"
        if team_division:
            full_job_title = f"{full_job_title} - {team_division}"
        
        story.append(_safe_paragraph(full_job_title, title_style))
        story.append(Spacer(1, 0.1*inch))
        
        # Job details box
        details_text = f"<b>Company:</b> {company_name}<br/>"
        details_text += f"<b>Role:</b> {job_title}<br/>"
        if level:
            details_text += f"<b>Level:</b> {level}<br/>"
        if team_division:
            details_text += f"<b>Team:</b> {team_division}<br/>"
        if location:
            location_text = location
            if remote_policy:
                location_text += f" ({remote_policy})"
            details_text += f"<b>Location:</b> {location_text}<br/>"
        
        story.append(_safe_paragraph(details_text, body_style))
        story.append(Spacer(1, 0.15*inch))
        
        # Quick stats
        interview_process = insights.get("interview_process", {})
        stages = interview_process.get("stages", [])
        sources_count = insights.get("sources_count", 0)
        stats_text = f"{len(stages)} interview stages"
        if interview_process.get("total_timeline") and interview_process.get("total_timeline") != "Not mentioned":
            stats_text += f" | {interview_process.get('total_timeline')}"
        elif interview_process.get("timeline") and interview_process.get("timeline") != "Not mentioned":
            stats_text += f" | {interview_process.get('timeline')}"
        stats_text += f" | Based on {sources_count} Reddit posts"
        story.append(_safe_paragraph(stats_text, ParagraphStyle(
            "Stats",
            parent=body_style,
            fontSize=10,
            textColor="#666666",
            alignment=TA_CENTER,
        )))
        story.append(Spacer(1, 0.15*inch))
        
        # Required skills list
        if required_skills:
            story.append(_safe_paragraph("Required Skills:", subsection_title))
            for skill in required_skills[:10]:  # Top 10 skills
                story.append(Paragraph(f"<bullet>•</bullet> {skill}", bullet_style))
        
        story.append(PageBreak())
        
        # PAGE 2 - Interview Process Deep Dive
        story.append(_safe_paragraph(f"Interview Process for {job_title}", section_title))
        
        if stages:
            story.append(_safe_paragraph("Stages:", subsection_title))
            for i, stage in enumerate(stages, 1):
                if isinstance(stage, dict):
                    stage_name = stage.get("name", f"Stage {i}")
                    stage_desc = stage.get("description", "")
                    stage_duration = stage.get("duration", "")
                    stage_interviewer = stage.get("interviewer", "")
                    stage_format = stage.get("format", "")
                    stage_tips = stage.get("tips", "")
                    
                    stage_text = f"<b>{i}. {stage_name}</b><br/>"
                    if stage_desc:
                        stage_text += f"{stage_desc}<br/>"
                    if stage_duration and stage_duration != "N/A":
                        stage_text += f"Duration: {stage_duration}<br/>"
                    if stage_interviewer and stage_interviewer != "N/A":
                        stage_text += f"Interviewer: {stage_interviewer}<br/>"
                    if stage_format:
                        stage_text += f"Format: {stage_format}<br/>"
                    if stage_tips:
                        stage_text += f"<i>Tip: {stage_tips}</i>"
                    story.append(_safe_paragraph(stage_text, body_style))
                else:
                    # Fallback for old string format
                    story.append(Paragraph(f"{i}. {stage}", body_style))
                story.append(Spacer(1, 0.1*inch))
        
        if interview_process.get("total_timeline") and interview_process.get("total_timeline") != "Not mentioned":
            story.append(_safe_paragraph("Total Timeline:", subsection_title))
            story.append(_safe_paragraph(interview_process.get("total_timeline"), body_style))
        
        if interview_process.get("level_specific_notes"):
            story.append(_safe_paragraph("Level-Specific Notes:", subsection_title))
            story.append(_safe_paragraph(interview_process.get("level_specific_notes"), body_style))
        
        story.append(PageBreak())
        
        # PAGE 3 - Questions Tailored to This Role
        story.append(_safe_paragraph("Questions You Should Prepare For", section_title))
        common_questions = insights.get("common_questions", {})
        
        # Behavioral Questions
        if isinstance(common_questions, dict) and common_questions.get("behavioral"):
            behavioral = common_questions.get("behavioral", {})
            behavioral_questions = behavioral.get("questions", [])
            
            if behavioral_questions:
                story.append(_safe_paragraph("Behavioral Questions:", subsection_title))
                for q_obj in behavioral_questions[:8]:
                    if isinstance(q_obj, dict):
                        question_text = f"<b>{q_obj.get('question', '')}</b>"
                        if q_obj.get("why_asked"):
                            question_text += f"<br/><i>Why asked: {q_obj.get('why_asked')}</i>"
                        if q_obj.get("answer_hint"):
                            question_text += f"<br/>Hint: {q_obj.get('answer_hint')}"
                        story.append(_safe_paragraph(question_text, body_style))
                    else:
                        story.append(Paragraph(f"<bullet>•</bullet> {q_obj}", bullet_style))
                    story.append(Spacer(1, 0.05*inch))
                
                if behavioral.get("general_tips"):
                    story.append(_safe_paragraph("Behavioral Tips:", ParagraphStyle(
                        "Tips",
                        parent=body_style,
                        fontSize=10,
                        textColor="#1565c0",
                        fontName="Helvetica-Bold",
                    )))
                    story.append(_safe_paragraph(behavioral.get("general_tips"), body_style))
                story.append(Spacer(1, 0.1*inch))
        
        # Technical Questions
        if isinstance(common_questions, dict) and common_questions.get("technical"):
            technical = common_questions.get("technical", {})
            technical_questions = technical.get("questions", [])
            
            if technical_questions:
                story.append(_safe_paragraph("Technical Questions:", subsection_title))
                for q_obj in technical_questions[:8]:
                    if isinstance(q_obj, dict):
                        question_text = f"<b>{q_obj.get('question', '')}</b>"
                        if q_obj.get("difficulty"):
                            question_text += f" <i>({q_obj.get('difficulty')})</i>"
                        if q_obj.get("skills_tested"):
                            skills = q_obj.get("skills_tested", [])
                            if isinstance(skills, list):
                                question_text += f"<br/>Skills: {', '.join(skills)}"
                        if q_obj.get("hint"):
                            question_text += f"<br/>Hint: {q_obj.get('hint')}"
                        story.append(_safe_paragraph(question_text, body_style))
                    else:
                        story.append(Paragraph(f"<bullet>•</bullet> {q_obj}", bullet_style))
                    story.append(Spacer(1, 0.05*inch))
                
                # Skill-specific questions
                skill_specific = technical.get("skill_specific_questions", {})
                if skill_specific and isinstance(skill_specific, dict):
                    story.append(_safe_paragraph("Skill-Specific Questions:", subsection_title))
                    for skill, questions_list in list(skill_specific.items())[:3]:
                        story.append(_safe_paragraph(f"{skill}:", ParagraphStyle(
                            "SkillTitle",
                            parent=subsection_title,
                            fontSize=11,
                        )))
                        for q in questions_list[:3]:
                            story.append(Paragraph(f"<bullet>•</bullet> {q}", bullet_style))
                        story.append(Spacer(1, 0.05*inch))
                
                if technical.get("general_tips"):
                    story.append(_safe_paragraph("Technical Tips:", ParagraphStyle(
                        "Tips",
                        parent=body_style,
                        fontSize=10,
                        textColor="#1565c0",
                        fontName="Helvetica-Bold",
                    )))
                    story.append(_safe_paragraph(technical.get("general_tips"), body_style))
                story.append(Spacer(1, 0.1*inch))
        
        # Company-Specific Questions
        if isinstance(common_questions, dict) and common_questions.get("company_specific"):
            company_specific = common_questions.get("company_specific", {})
            company_questions = company_specific.get("questions", [])
            
            if company_questions:
                story.append(_safe_paragraph("Company-Specific Questions:", subsection_title))
                for q_obj in company_questions[:5]:
                    if isinstance(q_obj, dict):
                        question_text = f"<b>{q_obj.get('question', '')}</b>"
                        if q_obj.get("what_they_want"):
                            question_text += f"<br/><i>What they want: {q_obj.get('what_they_want')}</i>"
                        if q_obj.get("good_answer_elements"):
                            elements = q_obj.get("good_answer_elements", [])
                            if isinstance(elements, list):
                                question_text += f"<br/>Include: {', '.join(elements)}"
                        story.append(_safe_paragraph(question_text, body_style))
                    else:
                        story.append(Paragraph(f"<bullet>•</bullet> {q_obj}", bullet_style))
                    story.append(Spacer(1, 0.05*inch))
        
        # Reported Actual Questions
        if isinstance(common_questions, dict) and common_questions.get("reported_actual_questions"):
            reported = common_questions.get("reported_actual_questions", [])
            if reported:
                story.append(_safe_paragraph("Real Questions from Candidates:", subsection_title))
                for q_obj in reported[:5]:
                    if isinstance(q_obj, dict):
                        question_text = f"<b>{q_obj.get('question', '')}</b>"
                        if q_obj.get("source"):
                            question_text += f" <i>({q_obj.get('source')})</i>"
                        if q_obj.get("context"):
                            question_text += f"<br/>{q_obj.get('context')}"
                        story.append(_safe_paragraph(question_text, body_style))
                    else:
                        story.append(Paragraph(f"<bullet>•</bullet> {q_obj}", bullet_style))
                    story.append(Spacer(1, 0.05*inch))
        
        # Fallback for old format
        if not isinstance(common_questions, dict) and isinstance(common_questions, list):
            for category_group in common_questions:
                category = category_group.get("category", "General") if isinstance(category_group, dict) else "General"
                questions = category_group.get("questions", []) if isinstance(category_group, dict) else []
                if questions:
                    story.append(_safe_paragraph(f"{category} Questions:", subsection_title))
                    for question in questions[:10]:
                        story.append(Paragraph(f"<bullet>•</bullet> {question}", bullet_style))
                    story.append(Spacer(1, 0.1*inch))
        
        if not common_questions or (isinstance(common_questions, dict) and not any([
            common_questions.get("behavioral"), 
            common_questions.get("technical"), 
            common_questions.get("company_specific")
        ])):
            story.append(_safe_paragraph("No specific questions found. Research company-specific questions on Glassdoor.", body_style))
        
        # Role-specific sections
        if role_category == "Consulting" and insights.get("case_interview_prep"):
            story.append(Spacer(1, 0.15*inch))
            story.append(_safe_paragraph("Case Interview Preparation", section_title))
            case_prep = insights.get("case_interview_prep", {})
            
            if case_prep.get("frameworks"):
                story.append(_safe_paragraph("Case Frameworks:", subsection_title))
                for framework in case_prep.get("frameworks", [])[:5]:
                    if isinstance(framework, dict):
                        framework_text = f"<b>{framework.get('name', '')}</b>"
                        if framework.get("when_to_use"):
                            framework_text += f"<br/>When to use: {framework.get('when_to_use')}"
                        if framework.get("structure"):
                            framework_text += f"<br/>Structure: {framework.get('structure')}"
                        story.append(_safe_paragraph(framework_text, body_style))
                        story.append(Spacer(1, 0.05*inch))
            
            if case_prep.get("market_sizing"):
                market_sizing = case_prep.get("market_sizing", {})
                story.append(_safe_paragraph("Market Sizing:", subsection_title))
                if market_sizing.get("approach"):
                    story.append(_safe_paragraph(f"Approach: {market_sizing.get('approach')}", body_style))
                if market_sizing.get("example_questions"):
                    story.append(_safe_paragraph("Example Questions:", ParagraphStyle(
                        "ExampleTitle",
                        parent=subsection_title,
                        fontSize=11,
                    )))
                    for q in market_sizing.get("example_questions", [])[:3]:
                        story.append(Paragraph(f"<bullet>•</bullet> {q}", bullet_style))
        
        elif role_category == "Software Engineering":
            # Coding interview prep
            if insights.get("coding_interview_prep"):
                story.append(Spacer(1, 0.15*inch))
                story.append(_safe_paragraph("Coding Interview Preparation", section_title))
                coding_prep = insights.get("coding_interview_prep", {})
                
                if coding_prep.get("patterns_to_master"):
                    story.append(_safe_paragraph("Key Patterns to Master:", subsection_title))
                    for pattern in coding_prep.get("patterns_to_master", [])[:5]:
                        if isinstance(pattern, dict):
                            pattern_text = f"<b>{pattern.get('pattern', '')}</b>"
                            if pattern.get("example"):
                                pattern_text += f"<br/>Example: {pattern.get('example')}"
                            if pattern.get("when_to_use"):
                                pattern_text += f"<br/>When to use: {pattern.get('when_to_use')}"
                            story.append(_safe_paragraph(pattern_text, body_style))
                            story.append(Spacer(1, 0.05*inch))
            
            # System design prep
            if insights.get("system_design_prep"):
                story.append(Spacer(1, 0.1*inch))
                story.append(_safe_paragraph("System Design Preparation", section_title))
                system_prep = insights.get("system_design_prep", {})
                
                if system_prep.get("topics"):
                    story.append(_safe_paragraph("Key Topics:", subsection_title))
                    for topic in system_prep.get("topics", [])[:8]:
                        story.append(Paragraph(f"<bullet>•</bullet> {topic}", bullet_style))
                
                if system_prep.get("common_questions"):
                    story.append(_safe_paragraph("Common System Design Questions:", subsection_title))
                    for q in system_prep.get("common_questions", [])[:5]:
                        story.append(Paragraph(f"<bullet>•</bullet> {q}", bullet_style))
        
        elif role_category == "Finance" and insights.get("technical_interview_prep"):
            story.append(Spacer(1, 0.15*inch))
            story.append(_safe_paragraph("Technical Interview Preparation", section_title))
            tech_prep = insights.get("technical_interview_prep", {})
            
            if tech_prep.get("accounting_questions"):
                story.append(_safe_paragraph("Accounting Questions:", subsection_title))
                for q_obj in tech_prep.get("accounting_questions", [])[:5]:
                    if isinstance(q_obj, dict):
                        q_text = f"<b>{q_obj.get('question', '')}</b>"
                        if q_obj.get("hint"):
                            q_text += f"<br/>Hint: {q_obj.get('hint')}"
                        story.append(_safe_paragraph(q_text, body_style))
                        story.append(Spacer(1, 0.05*inch))
            
            if tech_prep.get("valuation_questions"):
                story.append(_safe_paragraph("Valuation Questions:", subsection_title))
                for q_obj in tech_prep.get("valuation_questions", [])[:5]:
                    if isinstance(q_obj, dict):
                        q_text = f"<b>{q_obj.get('question', '')}</b>"
                        if q_obj.get("hint"):
                            q_text += f"<br/>Hint: {q_obj.get('hint')}"
                        story.append(_safe_paragraph(q_text, body_style))
                        story.append(Spacer(1, 0.05*inch))
        
        story.append(PageBreak())
        
        # PAGE 4 - Preparation Plan
        story.append(_safe_paragraph("How to Prepare for This Role", section_title))
        preparation_plan = insights.get("preparation_plan", {})
        
        if preparation_plan.get("timeline"):
            story.append(_safe_paragraph("Recommended Timeline:", subsection_title))
            story.append(_safe_paragraph(preparation_plan.get("timeline"), body_style))
            story.append(Spacer(1, 0.1*inch))
        
        week_by_week = preparation_plan.get("week_by_week", [])
        if week_by_week:
            story.append(_safe_paragraph("Week-by-Week Plan:", subsection_title))
            for week_plan in week_by_week[:6]:  # Show up to 6 weeks
                if isinstance(week_plan, dict):
                    week_num = week_plan.get("week", "")
                    focus = week_plan.get("focus", "")
                    tasks = week_plan.get("tasks", [])
                    
                    week_text = f"<b>Week {week_num}: {focus}</b><br/>"
                    story.append(_safe_paragraph(week_text, subsection_title))
                    
                    for task in tasks[:5]:  # Max 5 tasks per week
                        story.append(Paragraph(f"<bullet>•</bullet> {task}", bullet_style))
                    story.append(Spacer(1, 0.1*inch))
        
        resources = preparation_plan.get("resources", {})
        if resources:
            story.append(_safe_paragraph("Recommended Resources:", subsection_title))
            
            # Handle dictionary structure (categories like coding_practice, company_research)
            if isinstance(resources, dict):
                for category, resource_list in resources.items():
                    if isinstance(resource_list, list) and resource_list:
                        # Format category name (e.g., "coding_practice" -> "Coding Practice")
                        category_name = category.replace("_", " ").title()
                        story.append(_safe_paragraph(f"{category_name}:", ParagraphStyle(
                            "ResourceCategory",
                            parent=subsection_title,
                            fontSize=11,
                        )))
                        
                        for resource in resource_list[:5]:  # Max 5 per category
                            if isinstance(resource, dict):
                                resource_text = f"<b>{resource.get('name', '')}</b>"
                                if resource.get("url"):
                                    resource_text += f" - {resource.get('url')}"
                                if resource.get("note"):
                                    resource_text += f"<br/>{resource.get('note')}"
                                elif resource.get("description"):
                                    resource_text += f"<br/>{resource.get('description')}"
                                story.append(_safe_paragraph(resource_text, body_style))
                            else:
                                story.append(Paragraph(f"<bullet>•</bullet> {resource}", bullet_style))
                            story.append(Spacer(1, 0.05*inch))
                        story.append(Spacer(1, 0.1*inch))
            # Handle list structure (fallback for old format)
            elif isinstance(resources, list):
                for resource in resources[:8]:
                    if isinstance(resource, dict):
                        resource_text = f"<b>{resource.get('name', '')}</b>"
                        if resource.get("url"):
                            resource_text += f" - {resource.get('url')}"
                        if resource.get("description"):
                            resource_text += f"<br/>{resource.get('description')}"
                        story.append(_safe_paragraph(resource_text, body_style))
                    else:
                        story.append(Paragraph(f"<bullet>•</bullet> {resource}", bullet_style))
                    story.append(Spacer(1, 0.05*inch))
        
        # Fallback to old success_tips structure
        if not preparation_plan:
            success_tips = insights.get("success_tips", {})
            if success_tips.get("preparation"):
                story.append(_safe_paragraph("Preparation:", subsection_title))
                for tip in success_tips.get("preparation", [])[:8]:
                    story.append(Paragraph(f"<bullet>•</bullet> {tip}", bullet_style))
        
        story.append(PageBreak())
        
        # PAGE 5 - Day of Interview & What to Avoid
        story.append(_safe_paragraph("Day of Interview", section_title))
        
        day_logistics = insights.get("day_of_logistics", {})
        if day_logistics.get("what_to_wear") and day_logistics.get("what_to_wear") != "Not mentioned":
            story.append(_safe_paragraph("What to Wear:", subsection_title))
            story.append(_safe_paragraph(day_logistics.get("what_to_wear"), body_style))
        
        if day_logistics.get("arrival_time") and day_logistics.get("arrival_time") != "Not mentioned":
            story.append(_safe_paragraph("Arrival Time:", subsection_title))
            story.append(_safe_paragraph(day_logistics.get("arrival_time"), body_style))
        
        if day_logistics.get("what_to_bring") and day_logistics.get("what_to_bring") != "Not mentioned":
            story.append(_safe_paragraph("What to Bring:", subsection_title))
            story.append(_safe_paragraph(day_logistics.get("what_to_bring"), body_style))
        
        if day_logistics.get("virtual_setup") and day_logistics.get("virtual_setup") != "Not mentioned":
            story.append(_safe_paragraph("Virtual Setup:", subsection_title))
            story.append(_safe_paragraph(day_logistics.get("virtual_setup"), body_style))
        
        success_tips = insights.get("success_tips", {})
        if success_tips.get("during_interview"):
            story.append(_safe_paragraph("During Interview Tips:", subsection_title))
            for tip in success_tips.get("during_interview", [])[:6]:
                story.append(Paragraph(f"<bullet>•</bullet> {tip}", bullet_style))
        
        story.append(Spacer(1, 0.15*inch))
        story.append(_safe_paragraph("What to Avoid", section_title))
        red_flags = insights.get("red_flags_and_mistakes", {})
        
        if isinstance(red_flags, dict):
            if red_flags.get("common_mistakes"):
                story.append(_safe_paragraph("Common Mistakes:", subsection_title))
                for mistake in red_flags.get("common_mistakes", [])[:6]:
                    story.append(Paragraph(f"<bullet>•</bullet> {mistake}", bullet_style))
                story.append(Spacer(1, 0.1*inch))
            
            if red_flags.get("company_specific_mistakes"):
                story.append(_safe_paragraph("Company-Specific Mistakes:", subsection_title))
                for mistake in red_flags.get("company_specific_mistakes", [])[:5]:
                    story.append(Paragraph(f"<bullet>•</bullet> {mistake}", bullet_style))
                story.append(Spacer(1, 0.1*inch))
            
            if red_flags.get("what_interviewers_flagged"):
                story.append(_safe_paragraph("What Interviewers Flagged:", subsection_title))
                for flag in red_flags.get("what_interviewers_flagged", [])[:5]:
                    story.append(Paragraph(f"<bullet>•</bullet> {flag}", bullet_style))
        elif isinstance(red_flags, list):
            # Fallback for old format
            for flag in red_flags[:10]:
                story.append(Paragraph(f"<bullet>•</bullet> {flag}", bullet_style))
        else:
            story.append(_safe_paragraph("No specific warnings found. General advice: be authentic, prepared, and professional.", body_style))
        
        story.append(PageBreak())
        
        # PAGE 6 - Real Experiences & Culture
        story.append(_safe_paragraph("Real Interview Experiences", section_title))
        real_experiences = insights.get("real_interview_experiences", [])
        
        if real_experiences:
            for exp in real_experiences[:4]:
                if isinstance(exp, dict):
                    exp_text = f"<b>{exp.get('role', 'Role')} ({exp.get('year', 'Year')})</b>"
                    if exp.get('result'):
                        exp_text += f" - {exp.get('result')}"
                    exp_text += "<br/>"
                    
                    if exp.get('rounds_completed'):
                        exp_text += f"Rounds: {exp.get('rounds_completed')}<br/>"
                    
                    if exp.get('detailed_experience'):
                        exp_text += f"{exp.get('detailed_experience')}<br/>"
                    
                    if exp.get('questions_asked'):
                        questions = exp.get('questions_asked', [])
                        if isinstance(questions, list) and questions:
                            exp_text += "<br/><b>Questions Asked:</b><br/>"
                            for q in questions[:3]:
                                exp_text += f"• {q}<br/>"
                    
                    if exp.get('what_surprised_them'):
                        exp_text += f"<br/><i>Surprising: {exp.get('what_surprised_them')}</i><br/>"
                    
                    if exp.get('advice'):
                        exp_text += f"<b>Advice:</b> {exp.get('advice')}<br/>"
                    
                    if exp.get('difficulty'):
                        exp_text += f"Difficulty: {exp.get('difficulty')}"
                    
                    story.append(_safe_paragraph(exp_text, body_style))
                else:
                    # Fallback for old format
                    story.append(_safe_paragraph(str(exp), body_style))
                story.append(Spacer(1, 0.15*inch))
        else:
            story.append(_safe_paragraph("No specific experiences found in available sources.", body_style))
        
        story.append(Spacer(1, 0.15*inch))
        story.append(_safe_paragraph(f"Culture at {company_name}", section_title))
        
        culture = insights.get("culture_insights", {})
        if team_division:
            story.append(_safe_paragraph(f"Team-Specific Culture ({team_division}):", subsection_title))
            story.append(_safe_paragraph("Team-specific culture insights may vary. Research the division separately.", body_style))
        
        if culture.get("work_life_balance") and culture.get("work_life_balance") != "Not mentioned":
            story.append(_safe_paragraph("Work-Life Balance:", subsection_title))
            story.append(_safe_paragraph(culture.get("work_life_balance"), body_style))
        
        if culture.get("team_dynamics") and culture.get("team_dynamics") != "Not mentioned":
            story.append(_safe_paragraph("Team Dynamics:", subsection_title))
            story.append(_safe_paragraph(culture.get("team_dynamics"), body_style))
        
        if culture.get("management_style") and culture.get("management_style") != "Not mentioned":
            story.append(_safe_paragraph("Management Style:", subsection_title))
            story.append(_safe_paragraph(culture.get("management_style"), body_style))
        
        if culture.get("growth_opportunities") and culture.get("growth_opportunities") != "Not mentioned":
            story.append(_safe_paragraph("Growth Opportunities:", subsection_title))
            story.append(_safe_paragraph(culture.get("growth_opportunities"), body_style))
        
        if culture.get("remote_policy") and culture.get("remote_policy") != "Not mentioned":
            story.append(_safe_paragraph("Remote Policy:", subsection_title))
            story.append(_safe_paragraph(culture.get("remote_policy"), body_style))
        
        story.append(PageBreak())
        
        # PAGE 7 - Compensation
        story.append(_safe_paragraph(f"Compensation for {job_title}", section_title))
        compensation = insights.get("compensation", {})
        
        salary_range = job_details.get("salary_range")
        if salary_range:
            story.append(_safe_paragraph("Job Posting Salary Range:", subsection_title))
            story.append(_safe_paragraph(salary_range, body_style))
            story.append(Spacer(1, 0.1*inch))
        
        comp_level = compensation.get("level", level or "Not specified")
        if comp_level and comp_level != "Not specified":
            story.append(_safe_paragraph(f"Level: {comp_level}", subsection_title))
        
        base_pay = compensation.get("base_pay", {})
        if isinstance(base_pay, dict):
            if base_pay.get("hourly_rate"):
                story.append(_safe_paragraph("Hourly Rate:", subsection_title))
                story.append(_safe_paragraph(base_pay.get("hourly_rate"), body_style))
            if base_pay.get("annual_base"):
                story.append(_safe_paragraph("Annual Base Salary:", subsection_title))
                story.append(_safe_paragraph(base_pay.get("annual_base"), body_style))
            if base_pay.get("monthly_estimate"):
                story.append(_safe_paragraph("Monthly Estimate:", subsection_title))
                story.append(_safe_paragraph(base_pay.get("monthly_estimate"), body_style))
        
        additional_comp = compensation.get("additional_compensation", {})
        if isinstance(additional_comp, dict):
            story.append(_safe_paragraph("Additional Compensation:", subsection_title))
            if additional_comp.get("housing_stipend"):
                story.append(Paragraph(f"<bullet>•</bullet> Housing Stipend: {additional_comp.get('housing_stipend')}", bullet_style))
            if additional_comp.get("relocation"):
                story.append(Paragraph(f"<bullet>•</bullet> Relocation: {additional_comp.get('relocation')}", bullet_style))
            if additional_comp.get("signing_bonus"):
                story.append(Paragraph(f"<bullet>•</bullet> Signing Bonus: {additional_comp.get('signing_bonus')}", bullet_style))
            if additional_comp.get("equity"):
                story.append(Paragraph(f"<bullet>•</bullet> Equity: {additional_comp.get('equity')}", bullet_style))
        
        benefits = compensation.get("benefits", [])
        if benefits:
            story.append(_safe_paragraph("Benefits:", subsection_title))
            for benefit in benefits[:8]:
                story.append(Paragraph(f"<bullet>•</bullet> {benefit}", bullet_style))
        
        if compensation.get("negotiation"):
            story.append(_safe_paragraph("Negotiation Tips:", subsection_title))
            story.append(_safe_paragraph(compensation.get("negotiation"), body_style))
        
        # Fallback for old format
        if not base_pay and not additional_comp:
            if compensation.get("base_salary_range") and compensation.get("base_salary_range") != "Not mentioned":
                story.append(_safe_paragraph("Base Salary Range:", subsection_title))
                story.append(_safe_paragraph(compensation.get("base_salary_range"), body_style))
            
            if compensation.get("bonus_structure") and compensation.get("bonus_structure") != "Not mentioned":
                story.append(_safe_paragraph("Bonus Structure:", subsection_title))
                story.append(_safe_paragraph(compensation.get("bonus_structure"), body_style))
            
            if level and compensation.get("salary_by_level") and compensation.get("salary_by_level") != "Not mentioned":
                story.append(_safe_paragraph(f"Salary by Level ({level}):", subsection_title))
                story.append(_safe_paragraph(compensation.get("salary_by_level"), body_style))
        
        story.append(PageBreak())
        
        # PAGE 8 - After the Interview
        story.append(_safe_paragraph("After the Interview", section_title))
        
        post_interview = insights.get("post_interview", {})
        if post_interview.get("response_timeline") and post_interview.get("response_timeline") != "Not mentioned":
            story.append(_safe_paragraph("Response Timeline:", subsection_title))
            story.append(_safe_paragraph(post_interview.get("response_timeline"), body_style))
            story.append(Spacer(1, 0.1*inch))
        
        if post_interview.get("thank_you_notes") and post_interview.get("thank_you_notes") != "Not mentioned":
            story.append(_safe_paragraph("Thank You Notes:", subsection_title))
            story.append(_safe_paragraph(post_interview.get("thank_you_notes"), body_style))
            story.append(Spacer(1, 0.1*inch))
        
        if post_interview.get("follow_up") and post_interview.get("follow_up") != "Not mentioned":
            story.append(_safe_paragraph("Follow Up:", subsection_title))
            story.append(_safe_paragraph(post_interview.get("follow_up"), body_style))
            story.append(Spacer(1, 0.1*inch))
        
        if post_interview.get("offer_details") and post_interview.get("offer_details") != "Not mentioned":
            story.append(_safe_paragraph("Offer Details:", subsection_title))
            story.append(_safe_paragraph(post_interview.get("offer_details"), body_style))
            story.append(Spacer(1, 0.1*inch))
        
        if post_interview.get("negotiation_tips") and post_interview.get("negotiation_tips") != "Not mentioned":
            story.append(_safe_paragraph("Negotiation Tips:", subsection_title))
            story.append(_safe_paragraph(post_interview.get("negotiation_tips"), body_style))

        # Footer
        story.append(Spacer(1, 0.3*inch))
        last_updated = insights.get("last_updated", "")
        footer_text = "Powered by Offerloop.ai"
        if sources_count:
            footer_text += f" | Based on {sources_count} Reddit posts"
        if last_updated:
            try:
                date_str = last_updated.split("T")[0]
                footer_text += f" | Generated {date_str}"
            except:
                pass
        
        story.append(_safe_paragraph(footer_text, ParagraphStyle(
            "Footer",
            parent=body_style,
            fontSize=9,
            textColor="#666666",
            alignment=TA_CENTER,
        )))

        doc.build(story)
        buffer.seek(0)
        return buffer

    except Exception as exc:
        print(f"PDF generation failed: {exc}")
        import traceback
        traceback.print_exc()
        # Re-raise the exception so the route handler can catch it and fail properly
        raise Exception(f"PDF generation failed: {str(exc)}") from exc


def generate_interview_prep_pdf_v2(
    *,
    prep_id: str,
    insights: Dict,
    fit_analysis: Dict,
    story_bank: Dict,
    prep_plan: Dict,
    job_details: Dict,
    user_profile: Dict = None,
) -> BytesIO:
    """
    Generate Interview Prep 2.0 PDF with multi-source data and personalization.
    
    Args:
        prep_id: Unique prep ID
        insights: Structured insights from process_interview_content_v2
        fit_analysis: Fit analysis from personalization engine
        story_bank: Story bank from personalization engine
        prep_plan: Prep plan from personalization engine
        job_details: Parsed job posting details
        user_profile: User profile data (optional)
    """
    try:
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            topMargin=36,
            bottomMargin=36,
            leftMargin=72,
            rightMargin=72
        )
        styles = getSampleStyleSheet()
        story: List = []

        # Define styles
        title_style = ParagraphStyle(
            "InterviewTitle",
            parent=styles["Heading1"],
            fontSize=24,
            textColor="#1a73e8",
            spaceAfter=18,
            alignment=TA_CENTER,
        )
        section_title = ParagraphStyle(
            "SectionTitle",
            parent=styles["Heading2"],
            fontSize=16,
            textColor="#0b5394",
            spaceAfter=12,
            spaceBefore=18,
        )
        subsection_title = ParagraphStyle(
            "SubsectionTitle",
            parent=styles["Heading3"],
            fontSize=13,
            textColor="#1565c0",
            spaceAfter=8,
            spaceBefore=12,
        )
        body_style = ParagraphStyle(
            "Body",
            parent=styles["BodyText"],
            fontSize=10.5,
            leading=14,
            alignment=TA_LEFT,
            spaceAfter=6,
        )
        source_style = ParagraphStyle(
            "Source",
            parent=body_style,
            fontSize=9,
            textColor="#666666",
            fontName="Helvetica-Oblique",
            spaceAfter=8,
        )
        bullet_style = ParagraphStyle(
            "Bullets",
            parent=body_style,
            leftIndent=16,
            bulletIndent=6,
        )

        company_name = job_details.get("company_name", "Company")
        company_domain = job_details.get("company_domain", "")
        job_title = job_details.get("job_title", "Role")
        level = job_details.get("level", "")
        
        # PAGE 1: Header + Fit Analysis + Role Overview
        if company_domain:
            logo = _get_company_logo(company_domain)
            if logo:
                try:
                    img = Image(logo, width=2*inch, height=0.5*inch)
                    story.append(img)
                    story.append(Spacer(1, 0.1*inch))
                except Exception:
                    pass
        
        # Title
        # Use job posting year if available, otherwise current year
        from datetime import datetime
        display_year = job_details.get("year") or insights.get("year")
        if not display_year:
            # Try to extract year from job posting date if available
            job_date = job_details.get("start_date") or job_details.get("posted_date")
            if job_date:
                try:
                    display_year = str(job_date).split()[0] if isinstance(job_date, str) else str(job_date.year)
                except:
                    pass
        if not display_year:
            display_year = str(datetime.now().year)
        
        story.append(_safe_paragraph(f"{company_name}", title_style))
        story.append(_safe_paragraph(f"{job_title}: {display_year}", ParagraphStyle(
            "Subtitle",
            parent=title_style,
            fontSize=18,
            spaceAfter=12,
        )))
        story.append(Spacer(1, 0.2*inch))
        
        # Stats table
        stats = insights.get("summary_stats", {})
        interview_rounds = len(insights.get("interview_stages", []))
        timeline = stats.get("timeline_weeks", "4-6 weeks")
        total_sources = stats.get("total_sources", 0)
        fit_score = fit_analysis.get("fit_score")
        
        stats_data = [
            ["Interview Stages", "Timeline", "Data Sources", "Your Fit Score"],
            [
                f"{interview_rounds} rounds",
                timeline,
                f"{total_sources} sources",
                f"{fit_score}%" if fit_score is not None else "N/A"
            ]
        ]
        stats_table = Table(stats_data, colWidths=[1.5*inch, 1.5*inch, 1.5*inch, 1.5*inch])
        stats_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ]))
        story.append(stats_table)
        story.append(Spacer(1, 0.2*inch))
        
        # Fit Analysis - only show if personalized
        if fit_analysis.get("is_personalized") or fit_analysis.get("personalized"):
            story.append(_safe_paragraph("Your Personalized Fit Analysis", section_title))
            if fit_score is not None:
                story.append(_safe_paragraph(f"Fit Score: {fit_score}%", subsection_title))
            
            strengths = fit_analysis.get("strengths", []) or fit_analysis.get("strong_matches", [])
            if strengths:
                story.append(_safe_paragraph("Strong Matches:", subsection_title))
                for strength in strengths[:4]:
                    story.append(Paragraph(f"✓ {strength}", bullet_style))
                story.append(Spacer(1, 0.1*inch))
            
            gaps = fit_analysis.get("gaps", []) or fit_analysis.get("gaps_to_address", [])
            if gaps:
                story.append(_safe_paragraph("Gaps to Address:", subsection_title))
                for gap in gaps[:3]:
                    story.append(Paragraph(f"• {gap}", bullet_style))
        # If not personalized, skip the entire section (don't show placeholder)
        
        story.append(PageBreak())
        
        # PAGE 2: Interview Process Deep Dive
        story.append(_safe_paragraph("Interview Process Deep Dive", section_title))
        
        # Source attribution - build dynamically, excluding zeros
        reddit_count = stats.get("reddit_count", 0)
        youtube_count = stats.get("youtube_count", 0)
        glassdoor_count = stats.get("glassdoor_count", 0)
        
        sources = []
        if reddit_count > 0:
            sources.append(f"{reddit_count} Reddit posts")
        if youtube_count > 0:
            sources.append(f"{youtube_count} YouTube videos")
        if glassdoor_count > 0:
            sources.append(f"{glassdoor_count} Glassdoor reviews")
        
        source_text = f"■ Aggregated from {', '.join(sources)}" if sources else "■ Compiled from available interview data"
        story.append(_safe_paragraph(source_text, source_style))
        story.append(Spacer(1, 0.1*inch))
        
        # Interview stages
        stages = insights.get("interview_stages", [])
        for stage in stages[:6]:
            if isinstance(stage, dict):
                stage_text = f"<b>Stage {stage.get('stage_number', '')}: {stage.get('name', '')}</b><br/>"
                if stage.get("description"):
                    stage_text += f"{stage.get('description')}<br/>"
                if stage.get("duration") and stage.get("duration") != "N/A":
                    stage_text += f"Duration: {stage.get('duration')}<br/>"
                if stage.get("format"):
                    stage_text += f"Format: {stage.get('format')}<br/>"
                
                # Add quotes with attribution
                quotes = stage.get("quotes", [])
                if quotes:
                    for quote_obj in quotes[:2]:
                        if isinstance(quote_obj, dict):
                            quote_text = quote_obj.get("text", "")
                            source = quote_obj.get("source", "")
                            attribution = quote_obj.get("attribution", "")
                            if quote_text:
                                stage_text += f'<br/>"{quote_text}"'
                                if source:
                                    stage_text += f" — {source}"
                                if attribution:
                                    stage_text += f" ({attribution})"
                
                story.append(_safe_paragraph(stage_text, body_style))
                story.append(Spacer(1, 0.1*inch))
        
        # Interview rounds table
        rounds_table_data = insights.get("interview_rounds_table", [])
        if rounds_table_data:
            table_data = [["Round", "Duration", "Focus", "Interviewers"]]
            for round_data in rounds_table_data[:6]:
                if isinstance(round_data, dict):
                    table_data.append([
                        round_data.get("round", ""),
                        round_data.get("duration", ""),
                        round_data.get("focus", ""),
                        round_data.get("interviewers", "")
                    ])
            
            if len(table_data) > 1:
                rounds_table = Table(table_data, colWidths=[1.5*inch, 1.2*inch, 2*inch, 1.3*inch])
                rounds_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, 0), 10),
                    ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                    ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                    ('GRID', (0, 0), (-1, -1), 1, colors.black),
                ]))
                story.append(rounds_table)
        
        story.append(PageBreak())
        
        # PAGE 3: Questions You'll Face
        story.append(_safe_paragraph("Questions You'll Face", section_title))
        
        # Behavioral Questions
        behavioral_qs = insights.get("behavioral_questions", [])
        if _has_content(behavioral_qs):
            story.append(_safe_paragraph("Behavioral Questions", subsection_title))
            
            # Smart source attribution
            sources_used = []
            if glassdoor_count > 0:
                sources_used.append(f"{glassdoor_count} Glassdoor reviews")
            if reddit_count > 0:
                sources_used.append(f"{reddit_count} Reddit posts")
            if youtube_count > 0:
                sources_used.append(f"{youtube_count} YouTube videos")
            
            if sources_used:
                story.append(_safe_paragraph(
                    f"■ Most frequently asked based on {', '.join(sources_used)}",
                    source_style
                ))
            else:
                story.append(_safe_paragraph(
                    "■ Compiled from available interview data",
                    source_style
                ))
            
            for q_obj in behavioral_qs[:10]:
                if isinstance(q_obj, dict):
                    q_text = f"<b>Q: {q_obj.get('question', '')}</b><br/>"
                    if q_obj.get("why_asked"):
                        q_text += f"Why asked: {q_obj.get('why_asked')}. "
                    if q_obj.get("tip"):
                        q_text += f"{q_obj.get('tip')}"
                    story.append(_safe_paragraph(q_text, body_style))
                    story.append(Spacer(1, 0.05*inch))
        
        # Technical Questions
        technical_qs = insights.get("technical_questions", [])
        if _has_content(technical_qs):
            story.append(_safe_paragraph("Technical Questions", subsection_title))
            
            # Smart source attribution
            sources_used = []
            if youtube_count > 0:
                sources_used.append(f"{youtube_count} YouTube videos")
            if reddit_count > 0:
                sources_used.append(f"{reddit_count} Reddit posts")
            if glassdoor_count > 0:
                sources_used.append(f"{glassdoor_count} Glassdoor reviews")
            
            if sources_used:
                story.append(_safe_paragraph(
                    f"■ From {', '.join(sources_used)}",
                    source_style
                ))
            else:
                story.append(_safe_paragraph(
                    "■ Compiled from available interview data",
                    source_style
                ))
            
            for q_obj in technical_qs[:10]:
                if isinstance(q_obj, dict):
                    q_text = f"• {q_obj.get('question', '')}"
                    if q_obj.get("frequency"):
                        q_text += f" (Asked {q_obj.get('frequency')} times in last 12 months)"
                    story.append(Paragraph(q_text, bullet_style))
            story.append(Spacer(1, 0.1*inch))
        
        # Company-Specific Questions
        company_qs = insights.get("company_specific_questions", [])
        if _has_content(company_qs):
            story.append(_safe_paragraph("Company-Specific Questions", subsection_title))
            story.append(_safe_paragraph(
                f"■ From {company_name} careers page + recent interviews",
                source_style
            ))
            for q_obj in company_qs[:5]:
                if isinstance(q_obj, dict):
                    q_text = f'<b>"{q_obj.get("question", "")}"</b> — What they want to hear:<br/>'
                    wants = q_obj.get("what_they_want", [])
                    if isinstance(wants, list):
                        for want in wants:
                            q_text += f"• {want}<br/>"
                    story.append(_safe_paragraph(q_text, body_style))
                    story.append(Spacer(1, 0.05*inch))
        
        story.append(PageBreak())
        
        # PAGE 4-5: Story Bank (if personalized)
        story_bank_data = story_bank.get("stories", []) if isinstance(story_bank, dict) else []
        if _has_content(story_bank_data):
            story.append(_safe_paragraph("Your Story Bank", section_title))
            story.append(_safe_paragraph(
                "■ PERSONALIZED: These stories are tailored from your Offerloop profile and resume",
                source_style
            ))
            
            for story_obj in story_bank_data[:3]:
                if isinstance(story_obj, dict):
                    category = story_obj.get("category") or story_obj.get("theme", "")
                    title = story_obj.get("title", "")
                    use_for = story_obj.get("use_for", [])
                    
                    story.append(_safe_paragraph(
                        f"Story: {category} → {title}",
                        subsection_title
                    ))
                    
                    if use_for:
                        use_text = "USE FOR: " + " / ".join([f'"{u}"' for u in use_for[:2]])
                        story.append(_safe_paragraph(use_text, body_style))
                    
                    story.append(_safe_paragraph(f"<b>SITUATION:</b> {story_obj.get('situation', '')}", body_style))
                    story.append(_safe_paragraph(f"<b>TASK:</b> {story_obj.get('task', '')}", body_style))
                    story.append(_safe_paragraph(f"<b>ACTION:</b> {story_obj.get('action', '')}", body_style))
                    story.append(_safe_paragraph(f"<b>RESULT:</b> {story_obj.get('result', '')}", body_style))
                    
                    if story_obj.get("company_connection"):
                        story.append(_safe_paragraph(
                            f"<b>{company_name.upper()} CONNECTION:</b> {story_obj.get('company_connection')}",
                            body_style
                        ))
                    
                    story.append(Spacer(1, 0.15*inch))
            
            story.append(PageBreak())
        
        # PAGE 6: Real Interview Experiences
        experiences = insights.get("real_experiences", [])
        if _has_content(experiences):
            story.append(_safe_paragraph("Real Interview Experiences", section_title))
            
            # Smart source attribution
            sources_used = []
            if reddit_count > 0:
                sources_used.append(f"{reddit_count} Reddit posts")
            if youtube_count > 0:
                sources_used.append(f"{youtube_count} YouTube videos")
            if glassdoor_count > 0:
                sources_used.append(f"{glassdoor_count} Glassdoor reviews")
            
            if sources_used:
                story.append(_safe_paragraph(
                    f"■ Aggregated from {', '.join(sources_used)} ({display_year})",
                    source_style
                ))
            else:
                story.append(_safe_paragraph(
                    f"■ Compiled from available interview data ({display_year})",
                    source_style
                ))
            
            for exp in experiences[:6]:
                if not isinstance(exp, dict):
                    continue
                    
                outcome = exp.get("outcome", "")
                outcome_emoji = "✓" if "OFFER" in outcome.upper() else ("✗" if "REJECT" in outcome.upper() else "○")
                
                # Header with role, year, outcome
                header = f"<b>{exp.get('role', 'Unknown Role')} ({exp.get('year', 'Year')}) — {outcome} {outcome_emoji}</b>"
                story.append(_safe_paragraph(header, body_style))
                
                # Source
                source_text = f"Source: {exp.get('source_type', 'Unknown')}"
                if exp.get("source_detail"):
                    source_text += f" ({exp.get('source_detail')})"
                story.append(_safe_paragraph(source_text, source_style))
                
                # Quote (this is the most valuable part)
                if exp.get("quote"):
                    story.append(_safe_paragraph(
                        f'"{exp.get("quote")}"',
                        ParagraphStyle('Quote', parent=body_style, leftIndent=20, rightIndent=20, fontName='Helvetica-Oblique')
                    ))
                
                # Key insight
                if exp.get("key_insight"):
                    story.append(_safe_paragraph(f"<b>Key Insight:</b> {exp.get('key_insight')}", body_style))
                
                # Questions asked
                questions = exp.get("questions_asked", [])
                if questions and isinstance(questions, list):
                    story.append(_safe_paragraph(f"<b>Questions Asked:</b> {', '.join(questions[:5])}", body_style))
                
                # Timeline
                if exp.get("timeline"):
                    story.append(_safe_paragraph(f"<b>Timeline:</b> {exp.get('timeline')}", body_style))
                
                # Difficulty
                if exp.get("difficulty"):
                    story.append(_safe_paragraph(f"<b>Difficulty:</b> {exp.get('difficulty')}", body_style))
                
                story.append(Spacer(1, 0.2*inch))
            
            story.append(PageBreak())
        else:
            # Show message if no experiences found
            story.append(_safe_paragraph("Real Interview Experiences", section_title))
            story.append(_safe_paragraph(
                "No detailed interview experiences found in available sources. Check Glassdoor or Reddit directly for more experiences.",
                body_style
            ))
            story.append(PageBreak())
        
        # PAGE 7: Personalized Prep Plan
        prep_weeks = prep_plan.get("weeks", []) if isinstance(prep_plan, dict) else []
        if not prep_weeks:
            # Fallback to insights preparation_plan
            prep_weeks = insights.get("preparation_plan", {}).get("week_by_week", [])
        
        if _has_content(prep_weeks):
            story.append(_safe_paragraph("Your Personalized Prep Plan", section_title))
            story.append(_safe_paragraph(
                "■ Customized based on your current skill level and the role requirements",
                source_style
            ))
            
            for week_data in prep_weeks[:4]:
                if isinstance(week_data, dict):
                    week_num = week_data.get("week", "")
                    week_title = week_data.get("title") or week_data.get("focus", f"Week {week_num}")
                    
                    story.append(_safe_paragraph(f"Week {week_num}: {week_title}", subsection_title))
                    
                    # Show focus if available
                    if week_data.get("focus"):
                        story.append(_safe_paragraph(
                            f"<i>Focus: {week_data.get('focus')}</i>",
                            ParagraphStyle("Focus", parent=body_style, textColor="#1565c0")
                        ))
                    
                    tasks = week_data.get("tasks", [])
                    for task in tasks[:6]:
                        story.append(Paragraph(f"• {task}", bullet_style))
                    
                    # Show target questions if available
                    target_questions = week_data.get("target_questions", [])
                    if target_questions:
                        story.append(_safe_paragraph(
                            f"<b>Practice these questions:</b> {', '.join(target_questions[:3])}",
                            body_style
                        ))
                    
                    # Show resources if available
                    week_resources = week_data.get("resources", [])
                    if week_resources:
                        story.append(_safe_paragraph(
                            f"<b>Resources:</b> {', '.join(week_resources[:3])}",
                            body_style
                        ))
                    
                    if week_data.get("user_focus") or week_data.get("personalized"):
                        focus = week_data.get("user_focus") or week_data.get("personalized")
                        story.append(_safe_paragraph(
                            f"<i>Your focus: {focus}</i>",
                            ParagraphStyle("Focus", parent=body_style, textColor="#1565c0")
                        ))
                    
                    story.append(Spacer(1, 0.1*inch))
            
            # Resources
            resources = insights.get("resources", [])
            if resources:
                story.append(_safe_paragraph("Recommended Resources:", subsection_title))
                for resource in resources[:8]:
                    if isinstance(resource, dict):
                        res_text = f"<b>{resource.get('name', '')}</b>"
                        if resource.get("url"):
                            res_text += f" — {resource.get('url')}"
                        if resource.get("description"):
                            res_text += f"<br/>{resource.get('description')}"
                        story.append(_safe_paragraph(res_text, body_style))
                        story.append(Spacer(1, 0.05*inch))
            
            story.append(PageBreak())
        
        # PAGE 8: Day of Interview + Compensation
        story.append(_safe_paragraph("Day of Interview", section_title))
        
        # Day logistics table
        timeline_data = insights.get("timeline", {})
        logistics_data = [
            ["What to Wear", "Virtual Setup"],
            [
                job_details.get("dress_code", "Business casual recommended"),
                timeline_data.get("virtual_setup", "Test your tech beforehand")
            ],
            ["Arrival Time", "What to Bring"],
            [
                "15 minutes early",
                "Resume, questions for interviewer, notebook"
            ]
        ]
        logistics_table = Table(logistics_data, colWidths=[2.5*inch, 2.5*inch])
        logistics_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ]))
        story.append(logistics_table)
        story.append(Spacer(1, 0.15*inch))
        
        # Red Flags
        red_flags = insights.get("red_flags", [])
        if red_flags:
            story.append(_safe_paragraph("What to Avoid (Interviewer Red Flags):", subsection_title))
            story.append(_safe_paragraph(
                "■ From interviewer feedback on Glassdoor",
                source_style
            ))
            for flag in red_flags[:6]:
                story.append(Paragraph(f"■■ {flag}", bullet_style))
        
        story.append(Spacer(1, 0.2*inch))
        
        # Compensation
        story.append(_safe_paragraph("Compensation Intelligence", section_title))
        story.append(_safe_paragraph(
            f"■ Data from Levels.fyi, Glassdoor, and Blind ({display_year})",
            source_style
        ))
        
        compensation = insights.get("compensation", {})
        comp_data = [
            ["Component", "Range", "Notes"],
            [
                "Hourly Rate / Salary",
                compensation.get("salary_range", "See job posting"),
                ""
            ],
            [
                "Bonus",
                compensation.get("bonus", "Varies"),
                ""
            ],
            [
                "Housing/Relocation",
                compensation.get("housing_stipend") or compensation.get("relocation", "N/A"),
                ""
            ],
            [
                "Signing Bonus",
                compensation.get("signing_bonus", "Varies"),
                ""
            ]
        ]
        comp_table = Table(comp_data, colWidths=[2*inch, 2*inch, 1.5*inch])
        comp_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ]))
        story.append(comp_table)
        
        if compensation.get("negotiation_tip"):
            story.append(Spacer(1, 0.1*inch))
            story.append(_safe_paragraph(
                f"<b>Negotiation Tip:</b> {compensation.get('negotiation_tip')}",
                body_style
            ))
        
        story.append(PageBreak())
        
        # PAGE 9: After Interview + Culture
        story.append(_safe_paragraph("After the Interview", section_title))
        
        if timeline_data.get("response_time"):
            story.append(_safe_paragraph("Response Timeline:", subsection_title))
            story.append(_safe_paragraph(timeline_data.get("response_time"), body_style))
        
        if timeline_data.get("thank_you_advice"):
            story.append(_safe_paragraph("Thank You Notes:", subsection_title))
            story.append(_safe_paragraph(timeline_data.get("thank_you_advice"), body_style))
        
        if timeline_data.get("follow_up_advice"):
            story.append(_safe_paragraph("Follow Up:", subsection_title))
            story.append(_safe_paragraph(timeline_data.get("follow_up_advice"), body_style))
        
        if timeline_data.get("offer_details"):
            story.append(_safe_paragraph("Offer Details:", subsection_title))
            story.append(_safe_paragraph(timeline_data.get("offer_details"), body_style))
        
        story.append(Spacer(1, 0.2*inch))
        
        # Culture
        story.append(_safe_paragraph(f"Culture at {company_name}", section_title))
        story.append(_safe_paragraph(
            "■ From 'Day in the Life' YouTube videos + Glassdoor reviews",
            source_style
        ))
        
        culture = insights.get("culture", {})
        if culture.get("work_life_balance"):
            story.append(_safe_paragraph("Work-Life Balance:", subsection_title))
            story.append(_safe_paragraph(culture.get("work_life_balance"), body_style))
        
        if culture.get("team_dynamics"):
            story.append(_safe_paragraph("Team Dynamics:", subsection_title))
            story.append(_safe_paragraph(culture.get("team_dynamics"), body_style))
        
        if culture.get("management_style"):
            story.append(_safe_paragraph("Management Style:", subsection_title))
            story.append(_safe_paragraph(culture.get("management_style"), body_style))
        
        if culture.get("growth_opportunities"):
            story.append(_safe_paragraph("Growth Opportunities:", subsection_title))
            story.append(_safe_paragraph(culture.get("growth_opportunities"), body_style))
        
        if culture.get("remote_policy"):
            story.append(_safe_paragraph("Remote Policy:", subsection_title))
            story.append(_safe_paragraph(culture.get("remote_policy"), body_style))
        
        # Footer
        story.append(Spacer(1, 0.3*inch))
        last_updated = insights.get("last_updated", "")
        footer_text = "Powered by Offerloop.ai | Multi-Source Intelligence Platform"
        
        # Build source string dynamically, excluding zeros
        footer_sources = []
        if reddit_count > 0:
            footer_sources.append(f"{reddit_count} Reddit posts")
        if youtube_count > 0:
            footer_sources.append(f"{youtube_count} YouTube videos")
        if glassdoor_count > 0:
            footer_sources.append(f"{glassdoor_count} Glassdoor reviews")
        
        if footer_sources:
            footer_text += f"<br/>Based on {total_sources} sources: {', '.join(footer_sources)}"
        elif total_sources > 0:
            footer_text += f"<br/>Based on {total_sources} sources"
        
        if last_updated:
            try:
                date_str = last_updated.split("T")[0]
                footer_text += f" | Generated {date_str}"
            except:
                pass
        
        story.append(_safe_paragraph(footer_text, ParagraphStyle(
            "Footer",
            parent=body_style,
            fontSize=9,
            textColor="#666666",
            alignment=TA_CENTER,
        )))

        # Remove consecutive page breaks that would create blank pages
        cleaned_story = []
        prev_was_pagebreak = False
        for element in story:
            if isinstance(element, PageBreak):
                if not prev_was_pagebreak:
                    cleaned_story.append(element)
                prev_was_pagebreak = True
            else:
                cleaned_story.append(element)
                prev_was_pagebreak = False
        
        doc.build(cleaned_story)
        buffer.seek(0)
        return buffer

    except Exception as exc:
        print(f"PDF v2 generation failed: {exc}")
        import traceback
        traceback.print_exc()
        raise Exception(f"PDF v2 generation failed: {str(exc)}") from exc

