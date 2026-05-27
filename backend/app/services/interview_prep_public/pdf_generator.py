"""Slim ReportLab PDF for the public interview-prep lead magnet.

Mirrors the visual language of the authenticated PDF (same accent blue,
same fonts) but skips fit analysis / STAR / personalized prep plan and
adds a "Get personalized prep" signup CTA section where those used to be.
"""
from __future__ import annotations

from io import BytesIO
from typing import List

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


BRAND_BLUE = "#3B82F6"
DEEP_BLUE = "#0B5394"
INK_PRIMARY = "#0F172A"
INK_SECONDARY = "#475569"
SURFACE_BG = "#F1F5F9"


def _p(text: str, style) -> Paragraph:
    return Paragraph((text or "").replace("\n", "<br/>"), style)


def _bullets(items: List[str], style) -> List[Paragraph]:
    out = []
    for item in items or []:
        if item:
            out.append(Paragraph(f"• {item}", style))
    return out


def generate_public_interview_prep_pdf(
    *,
    prep_id: str,
    job_details: dict,
    insights: dict,
) -> BytesIO:
    """Build the public, anonymous PDF.

    Args:
        prep_id: anonymous prep id (used only in the footer for support)
        job_details: normalized job dict from job_extractor
        insights: structured dict from content_processor
    """
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        topMargin=42,
        bottomMargin=42,
        leftMargin=64,
        rightMargin=64,
        title="Interview Prep",
        author="Offerloop",
    )

    base = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Title", parent=base["Heading1"], fontSize=24, leading=28,
        textColor=BRAND_BLUE, alignment=TA_CENTER, spaceAfter=8,
    )
    subtitle_style = ParagraphStyle(
        "Subtitle", parent=base["BodyText"], fontSize=11.5, leading=15,
        textColor=INK_SECONDARY, alignment=TA_CENTER, spaceAfter=20,
    )
    section_style = ParagraphStyle(
        "Section", parent=base["Heading2"], fontSize=15, leading=19,
        textColor=DEEP_BLUE, spaceBefore=18, spaceAfter=8,
    )
    sub_style = ParagraphStyle(
        "Sub", parent=base["Heading3"], fontSize=12, leading=16,
        textColor=INK_PRIMARY, spaceBefore=10, spaceAfter=4,
    )
    body_style = ParagraphStyle(
        "Body", parent=base["BodyText"], fontSize=10.5, leading=14.5,
        textColor=INK_PRIMARY, alignment=TA_LEFT, spaceAfter=4,
    )
    muted_style = ParagraphStyle(
        "Muted", parent=body_style, textColor=INK_SECONDARY, fontSize=9.5,
    )
    cta_title_style = ParagraphStyle(
        "CTATitle", parent=base["Heading2"], fontSize=15, leading=19,
        textColor=BRAND_BLUE, alignment=TA_CENTER, spaceAfter=6,
    )
    cta_body_style = ParagraphStyle(
        "CTABody", parent=body_style, alignment=TA_CENTER,
        textColor=INK_PRIMARY,
    )

    company = insights.get("company_name") or job_details.get("company_name") or "Company"
    title = job_details.get("job_title") or "Role"
    level = job_details.get("level") or ""
    location = job_details.get("location") or ""

    story: list = []

    # ── Header ──
    story.append(_p("Interview Prep", title_style))
    sub_bits = [f"<b>{company}</b>", title]
    if level:
        sub_bits.append(level)
    if location:
        sub_bits.append(location)
    story.append(_p("  ·  ".join(sub_bits), subtitle_style))

    # Teaser banner explaining what this is
    teaser_text = (
        "This is a sample, public prep based on Reddit threads, Perplexity research, "
        "and the job posting. Create a free Offerloop account to get a personalized "
        "version: STAR stories from your resume, a fit analysis against this role, "
        "and a week-by-week prep plan."
    )
    teaser = Table(
        [[_p(teaser_text, muted_style)]],
        colWidths=[6.4 * inch],
    )
    teaser.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(SURFACE_BG)),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(teaser)
    story.append(Spacer(1, 12))

    if insights.get("degraded"):
        story.append(_p(
            "Heads up: some research sources were unavailable when we built "
            "this prep. The questions and tips below are still based on real "
            "candidate reports, but coverage may be thinner than usual.",
            muted_style,
        ))
        story.append(Spacer(1, 6))

    # ── Interview process ──
    process = insights.get("interview_process") or {}
    stages = process.get("stages") or []
    if stages:
        story.append(_p("Interview Process", section_style))
        if process.get("total_timeline"):
            story.append(_p(f"<b>Timeline:</b> {process['total_timeline']}", body_style))
        for stage in stages[:8]:
            name = stage.get("name", "Stage")
            story.append(_p(name, sub_style))
            meta = []
            if stage.get("format"):
                meta.append(f"Format: {stage['format']}")
            if stage.get("duration"):
                meta.append(f"Duration: {stage['duration']}")
            if meta:
                story.append(_p(" · ".join(meta), muted_style))
            if stage.get("description"):
                story.append(_p(stage["description"], body_style))
            if stage.get("what_they_evaluate"):
                story.append(_p(
                    f"<b>What they evaluate:</b> {stage['what_they_evaluate']}",
                    body_style,
                ))

    # ── Questions (with source markers) ──
    questions = insights.get("common_questions") or {}
    def _render_question_block(label: str, items: list):
        if not items:
            return
        story.append(_p(label, sub_style))
        for q in items:
            if not isinstance(q, dict):
                continue
            text = q.get("question") or ""
            why = q.get("why_asked") or ""
            source = q.get("source") or ""
            line = f"<b>·</b> {text}"
            if why:
                line += f"<br/><i>Why asked:</i> {why}"
            if source:
                line += f"<br/><font color='#94A3B8' size='8'>Source: {source}</font>"
            story.append(_p(line, body_style))

    if any(questions.get(k) for k in ("behavioral", "technical", "company_specific")):
        story.append(_p("Common Questions", section_style))
        _render_question_block("Behavioral", questions.get("behavioral") or [])
        _render_question_block("Technical", questions.get("technical") or [])
        _render_question_block("Company-Specific", questions.get("company_specific") or [])

    # ── What candidates actually said (verbatim Reddit quotes) ──
    voices = insights.get("candidate_voices") or []
    if voices:
        story.append(_p("What Candidates Actually Said", section_style))
        for v in voices[:8]:
            if not isinstance(v, dict):
                continue
            quote = (v.get("quote") or "").strip()
            if not quote:
                continue
            sub = v.get("subreddit") or "?"
            upv = v.get("upvotes") or 0
            attribution = f"r/{sub} · {upv} upvotes"
            story.append(_p(f"&ldquo;{quote}&rdquo;", body_style))
            story.append(_p(attribution, muted_style))
            story.append(Spacer(1, 4))

    # ── Success tips (with sources) ──
    tips = insights.get("success_tips") or []
    if tips:
        story.append(_p("Success Tips", section_style))
        for t in tips:
            if isinstance(t, dict):
                tip_text = t.get("tip") or ""
                source = t.get("source") or ""
                if not tip_text:
                    continue
                line = f"·  {tip_text}"
                if source:
                    line += f"<br/><font color='#94A3B8' size='8'>Source: {source}</font>"
                story.append(_p(line, body_style))
            elif isinstance(t, str) and t:
                story.append(_p(f"·  {t}", body_style))

    # ── Red flags (with sources) ──
    flags = insights.get("red_flags") or []
    if flags:
        story.append(_p("Red Flags to Watch For", section_style))
        for f in flags:
            if isinstance(f, dict):
                flag_text = f.get("flag") or ""
                source = f.get("source") or ""
                if not flag_text:
                    continue
                line = f"·  {flag_text}"
                if source:
                    line += f"<br/><font color='#94A3B8' size='8'>Source: {source}</font>"
                story.append(_p(line, body_style))
            elif isinstance(f, str) and f:
                story.append(_p(f"·  {f}", body_style))

    if insights.get("day_of_logistics"):
        story.append(_p("Day-Of Logistics", section_style))
        story.extend(_bullets(insights["day_of_logistics"], body_style))

    if insights.get("company_news"):
        story.append(_p("Recent Company Signal", section_style))
        story.extend(_bullets(insights["company_news"], body_style))

    # ── Signup CTA (replaces the personalized sections) ──
    # Rendered as a series of free-flowing paragraphs wrapped in a tinted
    # background panel via two thin spacer rows. Avoids ReportLab's
    # KeepTogether-inside-Table overflow trap (cell can't exceed page height).
    story.append(Spacer(1, 18))
    cta_header_style = ParagraphStyle(
        "CTAHeader", parent=cta_title_style, alignment=TA_LEFT,
    )
    cta_lead_style = ParagraphStyle(
        "CTALead", parent=body_style, textColor=INK_PRIMARY,
    )
    cta_panel = Table(
        [
            [_p("Want a personalized version?", cta_header_style)],
            [_p(
                "This sample didn't analyze <b>you</b>. With a free Offerloop "
                "account, the same prep is rebuilt against your resume:",
                cta_lead_style,
            )],
            [_p("·  A fit analysis showing your strengths and gaps vs this role", body_style)],
            [_p("·  A STAR story bank built from your actual experience", body_style)],
            [_p("·  A week-by-week prep plan you can check off", body_style)],
            [_p("·  Cold-email drafts to alumni and recruiters at this company", body_style)],
            [_p(
                "<b>Create a free account at offerloop.ai</b>, no credit card, "
                "300 credits to start.",
                cta_lead_style,
            )],
        ],
        colWidths=[6.4 * inch],
    )
    cta_panel.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EFF6FF")),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor(BRAND_BLUE)),
        ("LEFTPADDING", (0, 0), (-1, -1), 18),
        ("RIGHTPADDING", (0, 0), (-1, -1), 18),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 16),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 16),
    ]))
    story.append(cta_panel)

    # ── Citations ──
    citations = insights.get("citations") or []
    if citations:
        story.append(PageBreak())
        story.append(_p("Sources", section_style))
        for c in citations[:15]:
            story.append(_p(c, muted_style))

    # ── Footer note ──
    story.append(Spacer(1, 12))
    story.append(_p(
        f"Generated by Offerloop · prep id {prep_id}",
        muted_style,
    ))

    doc.build(story)
    buf.seek(0)
    return buf
