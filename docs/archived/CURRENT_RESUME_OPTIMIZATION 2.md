# Resume Optimization Implementation

## Overview

The resume optimization feature allows users to optimize their resume for specific job postings using AI. The system extracts text from uploaded PDF resumes, uses OpenAI GPT-4o to enhance the content with job-relevant keywords, calculates ATS scores, and returns both text and structured data that can be converted to PDF.

## System Evolution

### Current System (Legacy)
**Key Characteristics:**
- Text-only extraction from PDFs (no formatting preservation)
- AI-powered content enhancement with strict fact-preservation rules
- Programmatic ATS scoring (keyword matching + formatting checks)
- Frontend PDF generation using React-PDF (fixed template)
- Credit-based system (20 credits per optimization)

### New System (Planned - Formatting Preservation)
**Key Characteristics:**
- LibreOffice PDF→DOCX conversion (preserves formatting)
- Find/replace text in DOCX while preserving styles
- LibreOffice DOCX→PDF conversion (preserves layout)
- Original formatting preserved in output
- Server-side PDF generation

| Aspect | Old System | New System |
|--------|-----------|------------|
| Text extraction | PyPDF2 (text only) | LibreOffice PDF→DOCX (preserves formatting) |
| Modification | Generate new content | Find/replace in DOCX (preserves styles) |
| PDF generation | React-PDF template | LibreOffice DOCX→PDF (preserves layout) |
| Output | Fixed template look | Original formatting preserved |

---

## File Structure

### Backend Files

- **`backend/app/routes/job_board.py`** (lines 2613-3175, 3690-4040)
  - `optimize_resume()` - Main API endpoint handler
  - `optimize_resume_with_ai()` - Core AI optimization logic
  - `extract_keywords_from_job()` - Keyword extraction from job descriptions
  - `calculate_ats_score()` - ATS scoring (imported from ats_scorer)

- **`backend/app/services/resume_parser.py`**
  - `extract_text_from_pdf()` - PDF text extraction using PyPDF2
  - `extract_user_info_from_resume_priority()` - Resume info extraction

- **`backend/app/services/ats_scorer.py`**
  - `calculate_ats_score()` - Main ATS scoring function
  - `calculate_keyword_score()` - Keyword matching
  - `calculate_formatting_score()` - Formatting validation
  - `extract_keywords_from_jd()` - Skill extraction from job descriptions

- **`backend/app/routes/resume.py`** (lines 179-297)
  - `parse_resume()` - Initial resume upload and parsing endpoint
  - `save_resume_to_firebase()` - Save parsed resume to Firestore

- **`backend/app/utils/users.py`** (lines 229-426)
  - `parse_resume_info()` - OpenAI-based resume parsing to structured JSON
  - `validate_parsed_resume()` - Resume validation

### Frontend Files

- **`connect-grow-hire/src/pages/JobBoardPage.tsx`** (lines 679-730)
  - `handleOptimizeResume()` - Frontend handler for optimize button
  - State management for optimized resume

- **`connect-grow-hire/src/components/ResumePDFDownload.tsx`**
  - `handleDownload()` - PDF generation trigger
  - `normalizeResumeForPDF()` - Data normalization for PDF

- **`connect-grow-hire/src/components/ResumePDF.tsx`**
  - React-PDF component that renders structured resume data to PDF
  - Uses `@react-pdf/renderer` library

- **`connect-grow-hire/src/services/api.ts`** (lines 1433-1435)
  - `optimizeResume()` - API service method

---

## API Endpoint

### Endpoint: `POST /api/job-board/optimize-resume`

**Authentication:** Required (Firebase Auth token)

**Request Body:**
```json
{
  "jobUrl": "https://...",           // Optional: URL to parse job details
  "jobDescription": "...",           // Required if no jobUrl
  "jobTitle": "...",                 // Optional
  "company": "...",                  // Optional
  "userId": "user_id"                // Optional (from auth token)
}
```

**Response:**
```json
{
  "optimizedResume": {
    "content": "Full optimized resume text...",
    "structured": {
      "name": "...",
      "contact": {...},
      "Summary": "...",
      "Experience": [...],
      "Education": {...},
      "Skills": {...},
      "Projects": [...],
      "Extracurriculars": [...]
    },
    "atsScore": {
      "overall": 85,
      "keywords": 80,
      "formatting": 90,
      "relevance": 75,
      "suggestions": [...],
      "jdQualityWarning": null,
      "technicalKeywordsInJd": 12
    },
    "keywordsAdded": ["Python", "React", ...],
    "importantKeywordsMissing": ["Kubernetes", ...],
    "sectionsOptimized": ["Experience", "Skills"],
    "warnings": [...],
    "confidenceLevel": "high"
  },
  "creditsUsed": 20,
  "creditsRemaining": 80,
  "processingTimeMs": 15234
}
```

**Error Responses:**
- `400` - Invalid job description, resume not found, insufficient credits
- `402` - Insufficient credits
- `500` - AI error, database error, JSON parse error
- `503` - AI timeout, rate limit

**Credit Cost:** 20 credits (refunded on failure)

---

## Flow Diagram

```
User clicks "Optimize Resume" button
       ↓
Frontend: handleOptimizeResume()
       ↓
POST /api/job-board/optimize-resume
       ↓
Backend: optimize_resume()
       ├─ Validate inputs & check credits
       ├─ Deduct 20 credits (atomic)
       ├─ Parse job URL (if provided)
       └─ Retrieve user resume from Firestore
       ↓
Backend: optimize_resume_with_ai()
       ├─ Sanitize resume data (remove DocumentReferences)
       ├─ Extract keywords from job description
       ├─ Build OpenAI prompt with strict rules
       └─ Call OpenAI GPT-4o API
       ↓
OpenAI Response (JSON)
       ├─ optimized_content (text)
       ├─ relevance_score
       ├─ keywords_added
       ├─ important_keywords_missing
       ├─ sections_optimized
       ├─ suggestions
       └─ warnings
       ↓
Backend: calculate_ats_score()
       ├─ Keyword matching (taxonomy-based)
       ├─ Formatting validation
       └─ Combine with AI relevance score
       ↓
Build response with:
       ├─ Text content
       ├─ Structured data (for PDF)
       ├─ ATS scores
       └─ Metadata
       ↓
Return JSON to frontend
       ↓
Frontend: Display optimized resume
       ├─ Show ATS scores
       ├─ Display keywords added/missing
       └─ Render structured data
       ↓
User clicks "Download PDF"
       ↓
Frontend: ResumePDFDownload component
       ├─ Normalize data structure
       └─ Generate PDF using @react-pdf/renderer
       ↓
PDF downloaded to user's device
```

---

## Text Extraction

### Library: PyPDF2

**File:** `backend/app/services/resume_parser.py` (lines 11-43)

**Function:** `extract_text_from_pdf(pdf_file)`

**Process:**
1. Save uploaded file to temporary location
2. Open PDF with `PyPDF2.PdfReader`
3. Iterate through all pages
4. Extract text using `page.extract_text()`
5. Clean text:
   - Remove non-printable characters
   - Normalize Unicode encoding
   - Remove extra whitespace
6. Delete temporary file
7. Return plain text string

**Limitations:**
- **No formatting preservation** - Only extracts plain text
- **No layout information** - Tables, columns, and spacing are lost
- **No font/styling** - All formatting metadata is discarded
- **Table handling** - Tables are extracted as plain text, structure lost
- **Encoding issues** - Some special characters may be lost or corrupted
- **Scanned PDFs** - Cannot extract text from image-based PDFs (would need OCR)

**Example Output:**
```
John Doe
john.doe@email.com | (555) 123-4567
San Francisco, CA

EXPERIENCE
Software Engineer | Company Name | Jan 2020 - Present
• Built features using React and Python
• Led team of 5 engineers
...
```

---

## OpenAI Integration

### Model: GPT-4o

**Configuration:**
- Model: `gpt-4o`
- Temperature: `0.7`
- Max Tokens: `3500`
- Timeout: `180 seconds` (base), up to `300 seconds` with retries
- Retries: `2 attempts` with exponential backoff

**Function:** `optimize_resume_with_ai()` in `backend/app/routes/job_board.py` (lines 2613-3175)

### Prompt Structure

The prompt is built with strict rules to prevent fabrication:

**System Message:**
```
You are a resume optimization expert. You MUST follow all rules exactly.
Your primary directive is to ENHANCE the resume without CHANGING any facts.
Never fabricate, never delete content, never change dates/titles/companies/degrees.
If you're unsure about something, keep it exactly as-is.
Return ONLY valid JSON. Do not include explanations or markdown.
```

**User Prompt Template:**
```
You are an expert resume optimizer. Your task is to enhance a resume for a specific job while following STRICT rules.

## ABSOLUTE RULES (NEVER VIOLATE)

### Rule 1: NEVER FABRICATE
- NEVER change degree types (Bachelor's stays Bachelor's, not Master's)
- NEVER change or invent dates
- NEVER change company names or job titles
- NEVER add skills, certifications, or experiences the candidate doesn't have
- NEVER guess or fill in missing information
- If something is unclear, keep it exactly as-is

### Rule 2: PRESERVE ALL CONTENT
- Keep ALL sections from the original resume
- Keep ALL bullet points - you may reword them but never delete them
- Keep ALL projects listed
- Keep ALL skills listed - you may reorder by relevance but never remove
- Keep coursework if present

### Rule 3: PRESERVE ALL FACTS
These must remain EXACTLY as in the original:
- Degree type and major
- University name
- Graduation date/expected graduation
- Company names
- Job titles
- Employment dates
- Locations
- Quantified achievements

### Rule 4: WHAT YOU CAN CHANGE
- Reword bullet points for stronger impact
- Reorder bullet points to prioritize most relevant ones first
- Reorder skills to put job-relevant skills first
- Add job-relevant keywords INTO existing bullet points where they fit naturally
- Improve action verbs
- Make quantified impacts more prominent
- Tighten verbose language

### Rule 5: KEYWORD INTEGRATION
- Review the job keywords provided
- Insert keywords ONLY into existing content where they make sense
- DO NOT add keywords as standalone items if the candidate doesn't have that experience

## JOB DETAILS

**Target Position:** {job_title}
**Company:** {company}
**Job Description:**
{job_description}

**Key Keywords to Consider (only use where naturally applicable):**
{keywords_list}

## ORIGINAL RESUME DATA

{resume_json}

## YOUR TASK

1. Read the original resume carefully
2. Identify which experiences and skills are most relevant to the target job
3. Enhance bullet points with stronger language and relevant keywords
4. Reorder content to prioritize relevance (most relevant first)
5. Return the optimized resume in the exact JSON format specified below

## OUTPUT FORMAT

Return ONLY valid JSON in this exact structure:

{
  "optimized_content": "Full optimized resume text with clear sections...",
  "relevance_score": 0-100,
  "keywords_added": ["list of keywords you successfully integrated"],
  "important_keywords_missing": ["list of job keywords that didn't fit"],
  "sections_optimized": ["list of sections you improved"],
  "suggestions": ["specific, actionable suggestions"],
  "warnings": ["any concerns"]
}
```

### Response Format

The AI returns JSON with:
- `optimized_content` - Full resume text (plain text, no formatting)
- `relevance_score` - 0-100 score of how well candidate fits the role
- `keywords_added` - List of keywords successfully integrated
- `important_keywords_missing` - List of job keywords not found in resume
- `sections_optimized` - List of sections that were improved
- `suggestions` - Actionable improvement suggestions
- `warnings` - Any concerns or issues

**Processing:**
1. Parse JSON response (strip markdown code blocks if present)
2. Extract optimized text content
3. Calculate programmatic ATS scores
4. Combine AI suggestions with ATS scorer suggestions
5. Build structured resume data from original (for PDF generation)

---

## PDF Generation

### Frontend Generation (Client-Side)

**Library:** `@react-pdf/renderer`

**Files:**
- `connect-grow-hire/src/components/ResumePDFDownload.tsx` - Download handler
- `connect-grow-hire/src/components/ResumePDF.tsx` - PDF template component

**Process:**
1. User clicks "Download PDF" button
2. Frontend normalizes resume data structure
3. React-PDF renders structured data to PDF blob
4. Browser downloads the PDF file

**Template Structure:**
- Uses React-PDF's `Document`, `Page`, `Text`, `View` components
- Hardcoded styling with StyleSheet
- Font: Helvetica (built-in, no registration needed)
- Page size: Letter (8.5" x 11")

**Styling:**
```javascript
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    lineHeight: 1.4,
    color: '#333333',
  },
  name: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  // ... more styles
});
```

**Sections Rendered:**
1. Header (name, contact info)
2. Summary
3. Education
4. Experience (with bullets)
5. Projects
6. Skills (categorized)
7. Extracurriculars

**Limitations:**
- **No original formatting** - All resumes use the same template
- **No custom fonts** - Only Helvetica available
- **No images/logos** - Text only
- **No tables** - Skills and other structured data rendered as lists
- **Fixed layout** - Cannot preserve original resume layout
- **Client-side only** - PDF generated in browser, not on server

**Data Flow:**
```
Backend returns structured data
       ↓
Frontend: normalizeResumeForPDF()
       ├─ Extract structured field
       ├─ Normalize contact info
       ├─ Map Experience, Education, Skills, etc.
       └─ Return normalized object
       ↓
React-PDF: <ResumePDF resume={normalized} />
       ├─ Render Document with Page
       ├─ Apply styles
       └─ Generate PDF blob
       ↓
Browser downloads PDF
```

---

## Current Limitations

### 1. Formatting Loss

**Problem:** Original PDF formatting is completely lost during optimization.

**What's Lost:**
- Fonts (typeface, size, weight, color)
- Layout (columns, tables, spacing)
- Visual elements (lines, borders, boxes)
- Images and logos
- Custom styling
- Page breaks

**Impact:** All optimized resumes look identical, regardless of original design.

### 2. Text-Only Extraction

**Problem:** PyPDF2 only extracts plain text, no structure information.

**Issues:**
- Tables become plain text (structure lost)
- Multi-column layouts become single column
- Headers/footers mixed with content
- No way to distinguish section boundaries visually

### 3. PDF Generation Limitations

**Problem:** Frontend PDF uses a fixed template.

**Issues:**
- Cannot recreate original design
- Limited to Helvetica font
- No support for images
- Fixed layout (cannot preserve original spacing/alignment)
- Skills rendered as simple lists, not tables

### 4. Scanned PDFs

**Problem:** Cannot extract text from image-based PDFs.

**Impact:** Users with scanned resumes cannot use the feature (would need OCR).

### 5. Encoding Issues

**Problem:** Some special characters may be lost during extraction.

**Examples:**
- Accented characters (é, ñ, ü)
- Special symbols (→, •, ★)
- Non-ASCII characters

### 6. Large Resumes

**Problem:** Very long resumes may be truncated or cause timeouts.

**Limits:**
- Resume text limited to 8000 characters for parsing
- OpenAI prompt size limits
- PDF generation may be slow for very long resumes

### 7. Structured Data Dependency

**Problem:** PDF generation requires structured data, but optimization returns text.

**Workaround:** Backend includes original structured data in response, but optimized content is only text.

**Issue:** If structured data is missing or incomplete, PDF generation fails.

### 8. No Formatting Validation

**Problem:** ATS formatting checks are basic (presence of sections, not quality).

**Missing:**
- Font size validation
- Margin/spacing checks
- Table structure validation
- Image detection
- Complex layout validation

### 9. Keyword Extraction Limitations

**Problem:** Keyword extraction uses regex patterns, may miss context.

**Issues:**
- May extract false positives
- Doesn't understand skill variations well
- Limited to predefined patterns
- No semantic understanding

### 10. AI Response Variability

**Problem:** AI may not always follow formatting rules perfectly.

**Issues:**
- Sometimes changes facts despite rules
- May not preserve all bullet points
- Inconsistent keyword integration
- May add content that wasn't in original

---

## Dependencies

### Backend

**Python Libraries:**
- `PyPDF2==3.0.1` - PDF text extraction
- `openai` - OpenAI API client (GPT-4o)
- `firebase-admin` - Firestore database access
- `flask` - Web framework

**Key Functions:**
- `PyPDF2.PdfReader` - Read PDF files
- `openai.ChatCompletion.create()` - Call GPT-4o API
- `firebase_admin.firestore` - Database operations

### Frontend

**NPM Packages:**
- `@react-pdf/renderer` - PDF generation
- `@react-pdf/pdfkit` - PDF rendering engine (dependency)

**Key Components:**
- `Document`, `Page`, `Text`, `View` from `@react-pdf/renderer`
- `pdf()` function to generate blob

---

## Code Snippets

### Text Extraction

```python
# backend/app/services/resume_parser.py
def extract_text_from_pdf(pdf_file):
    with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
        pdf_file.save(temp_file.name)
        
        with open(temp_file.name, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            text = ""
            
            for page in pdf_reader.pages:
                page_text = page.extract_text()
                if page_text:
                    cleaned_text = ''.join(char for char in page_text if char.isprintable() or char.isspace())
                    cleaned_text = cleaned_text.encode('utf-8', errors='ignore').decode('utf-8')
                    text += cleaned_text + "\n"
        
        os.unlink(temp_file.name)
        text = ' '.join(text.split())
        return text.strip() if text.strip() else None
```

### OpenAI API Call

```python
# backend/app/routes/job_board.py
api_call = openai_client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": system_content},
        {"role": "user", "content": user_content}
    ],
    temperature=0.7,
    max_tokens=3500,
    timeout=timeout,
)

response = await asyncio.wait_for(api_call, timeout=timeout + 60.0)
content = response.choices[0].message.content.strip()
result = json.loads(content)
```

### PDF Generation

```typescript
// connect-grow-hire/src/components/ResumePDFDownload.tsx
const blob = await pdf(<ResumePDF resume={normalizedResume} />).toBlob();

const url = URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = url;
link.download = fileName;
document.body.appendChild(link);
link.click();
document.body.removeChild(link);
URL.revokeObjectURL(url);
```

### ATS Scoring

```python
# backend/app/services/ats_scorer.py
ats_result = calculate_ats_score(
    resume_text=optimized_content,
    job_description=job_description,
    ai_relevance_score=ai_relevance_score
)

# Returns:
# {
#   "overall": 85,
#   "keywords": 80,
#   "formatting": 90,
#   "relevance": 75,
#   "details": {...}
# }
```

---

## Summary

### Current System (Legacy)

The current resume optimization system:

1. **Extracts text only** from PDFs using PyPDF2 (no formatting)
2. **Uses OpenAI GPT-4o** to enhance content with job-relevant keywords
3. **Calculates ATS scores** programmatically (keywords + formatting)
4. **Returns text + structured data** for frontend PDF generation
5. **Generates PDFs client-side** using React-PDF with a fixed template

**Key Limitation:** Original formatting is completely lost. All optimized resumes use the same template design, regardless of the original PDF's appearance.

### New System (Planned)

The new system will:

1. **Convert PDF→DOCX** using LibreOffice (preserves formatting, fonts, layout)
2. **Extract text** from DOCX for AI optimization
3. **Use OpenAI GPT-4o** to generate optimized text content
4. **Find/replace text** in DOCX while preserving all styles and formatting
5. **Convert DOCX→PDF** using LibreOffice (preserves original layout)
6. **Return server-generated PDF** with original formatting intact

**Key Benefit:** Original formatting is completely preserved. Optimized resumes maintain the exact same appearance as the original, with only text content changed.

## Implementation Plan for New System

### Required Changes

1. **Backend Dependencies:**
   - Add `python-docx` library for DOCX manipulation
   - Ensure LibreOffice is installed on server (system dependency)
   - Add subprocess handling for LibreOffice commands

2. **New Functions Needed:**
   - `convert_pdf_to_docx()` - Use LibreOffice to convert PDF→DOCX
   - `extract_text_from_docx()` - Extract text from DOCX for AI processing
   - `find_replace_in_docx()` - Replace text while preserving styles
   - `convert_docx_to_pdf()` - Use LibreOffice to convert DOCX→PDF

3. **Modified Functions:**
   - `extract_text_from_pdf()` → Use DOCX extraction instead
   - `optimize_resume_with_ai()` → Return optimized text for find/replace
   - `optimize_resume()` → Generate PDF server-side instead of returning structured data

4. **Frontend Changes:**
   - Remove React-PDF dependency for resume optimization
   - Update download handler to download server-generated PDF
   - Remove PDF template component (no longer needed)

### Testing Requirements

1. Upload a resume with custom formatting (fonts, colors, columns)
2. Run optimization
3. Compare original vs optimized:
   - Layout should be identical
   - Fonts/colors should be preserved
   - Only text content should differ

