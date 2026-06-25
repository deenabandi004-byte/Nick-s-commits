# Interview Prep PDF Generator Redesign – Export Summary

**Date:** February 9, 2025  
**Scope:** Premium PDF redesign, content processor prompts, personalization (Story Bank), routes wiring.

---

## 1. Files Modified

| File | Purpose |
|------|--------|
| `backend/app/services/interview_prep/pdf_generator.py` | Full redesign: premium layout, tables, colors, sections |
| `backend/app/services/interview_prep/content_processor.py` | Richer prompt: frequencies, quotes, experiences, final_round_breakdown |
| `backend/app/services/interview_prep/personalization.py` | Story Bank returns `{stories, personalized}`, theme/project_name |
| `backend/app/routes/interview_prep.py` | No code change; verified personalization → insights → PDF |

---

## 2. PDF Generator (`pdf_generator.py`)

### Design
- **Colors:** `primary` #1a73e8, `success` #34a853, `warning` #fbbc04, `error` #ea4335, `dark` #202124, `light` #f8f9fa, `accent` #5f6368
- **Layout:** ReportLab `SimpleDocTemplate`, 0.5″ top/bottom, 0.75″ left/right
- **Elements:** Paragraphs, `Table`/`TableStyle`, `HRFlowable`, `Spacer`, `PageBreak`, optional logo `Image`

### Page Structure
1. **Cover:** Company name, job title, **metrics table** (Interview Stages, Timeline, Data Sources, Your Fit Score), optional **Personalized Fit Analysis**, Role Overview, Required Skills
2. **Interview Process:** Section title + source line, stages with duration/format, `what_to_expect`, tips, optional quote + attribution, optional **Final Round Breakdown** table
3. **Questions:** Behavioral (why_asked, answer_hint), Technical (with frequency text), Real questions, Company-specific (“What they want to hear”)
4. **Story Bank (conditional):** Only if `_personalization.story_bank` has stories; STAR blocks + company connection
5. **Real Experiences:** Boxed experiences with outcome (Offer ✓ / Rejected ✗), source, quote, questions asked, key insight/advice, difficulty
6. **Prep Plan:** Week-by-week focus + tasks, optional personalized note, Recommended Resources
7. **Day of Interview:** 2×2 logistics table, What to Avoid (red flags), **Compensation** table + negotiation tip
8. **After Interview + Culture:** Response timeline, thank you, follow-up, offer details; Culture at COMPANY; footer with source counts and date

### Helpers
- `_safe_paragraph(text, style)` – newline → `<br/>`, basic XML escaping
- `_get_company_logo(company_domain)` – Clearbit logo (unchanged)
- `_create_styles()` – all ParagraphStyles (title, subtitle, page_title, section_header, body, bullet, quote, etc.)
- `_build_cover_page`, `_build_interview_process_page`, `_build_questions_page`, `_build_story_bank_page`, `_build_real_experiences_page`, `_build_prep_plan_page`, `_build_day_of_page`, `_build_after_interview_page`

### Data Assumptions
- `insights._metadata.sources`: `total_items`, `by_source.reddit`, `by_source.youtube`, `by_source.glassdoor`
- `insights._personalization`: `fit_analysis` (fit_score, strengths, gaps, recommendations, personalized), `story_bank` as list of stories or `{stories, personalized}`
- Interview process: `stages[]` with `name`, `duration`, `format`, `what_to_expect`, `tips`, optional `quote`, `quote_source`; optional `final_round_breakdown[]`
- Real experiences: `result`, `source`, `detailed_experience`, `questions_asked`, `what_surprised_them`, `what_went_wrong`, `advice`, `difficulty`

---

## 3. Content Processor (`content_processor.py`)

### Prompt (build_processing_prompt_v2) Additions
- **interview_process.stages:** `quote`, `quote_source` for direct quotes and attribution
- **interview_process.final_round_breakdown:** array of `{round, duration, focus, interviewer}` for final round table
- **common_questions.technical.questions:** `frequency` and note to use “Asked X times in last 12 months” when available
- **real_interview_experiences:** At least 3 experiences; include `what_went_wrong` for rejections; specific source attribution (e.g. “YouTube ‘My IBM Interview 2024’”, “Reddit r/cscareerquestions”)

### Critical requirements (added/updated)
- Frequency counts for technical questions
- Specific source attribution (not just “youtube”/“reddit”)
- Direct quotes in stages when available
- `final_round_breakdown` when multiple rounds are mentioned

---

## 4. Personalization (`personalization.py`)

### Story Bank
- **Return type:** `Dict` with `stories: List[Dict]` and `personalized: bool` (was `List[Dict]`).
- **When no resume / no client:** returns `{"stories": [], "personalized": False}`.
- **Story shape:** `theme`, `project_name`, `use_for`, `situation`, `task`, `action`, `result`, `company_connection`. Backfill `theme` from `title` and `project_name` from title if missing.
- **Prompt:** Asks for `theme` and `project_name`; “Make stories specific using actual details from the resume.”

### personalize_prep()
- Still calls `engine.generate_story_bank(...)` and passes result as `story_bank` in the returned dict; PDF expects `_personalization["story_bank"]` as either list of stories or `{stories, personalized}`.

---

## 5. Routes (`interview_prep.py`)

- **No edits.** Flow confirmed: `personalize_prep()` → `insights["_personalization"] = personalization` → `generate_interview_prep_pdf(..., insights=insights)`.
- Story Bank is present when user has resume and `generate_story_bank` returns stories.

---

## 6. Testing Checklist (from original spec)

- [ ] With resume: Fit Score, Story Bank, personalized prep plan visible
- [ ] Without resume: Personalized sections hidden
- [ ] All sections populated: stages, questions with frequency, real experiences
- [ ] Tables render: metrics, compensation, logistics, final round
- [ ] Source attribution: Reddit/YouTube/Glassdoor in quotes and experiences

---

## 7. Run / Build

```bash
# Backend
cd backend && pip install -r requirements.txt && python3 wsgi.py

# Generate a prep (via API) then open PDF from status/download response
```

---

*Generated as export summary for the Interview Prep PDF redesign.*
