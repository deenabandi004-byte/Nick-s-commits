# Complete Resume Parsing Logic

This document contains the complete resume parsing implementation in the codebase.

## Overview

The resume parsing system extracts text from PDF files and uses OpenAI GPT-4o-mini to parse the text into a structured JSON format. The parsed data is then stored in Firestore with full version tracking.

## Architecture

1. **PDF Text Extraction** - Extracts raw text from PDF files
2. **AI-Powered Parsing** - Uses OpenAI to structure the resume data
3. **Validation** - Validates parsed resume structure
4. **Storage** - Saves to Firestore and Firebase Storage
5. **API Endpoint** - RESTful endpoint for resume upload and parsing

---

## 1. PDF Text Extraction

**File:** `backend/app/services/resume_parser.py`

```python
def extract_text_from_pdf(pdf_file):
    """Extract text from PDF using PyPDF2 with improved encoding handling"""
    try:
        print("Extracting text from PDF...")
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
            pdf_file.save(temp_file.name)
            
            with open(temp_file.name, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                text = ""
                
                for page in pdf_reader.pages:
                    page_text = page.extract_text()
                    # Clean and encode the text properly
                    if page_text:
                        # Remove non-printable characters and fix encoding issues
                        cleaned_text = ''.join(char for char in page_text if char.isprintable() or char.isspace())
                        # Normalize unicode characters
                        cleaned_text = cleaned_text.encode('utf-8', errors='ignore').decode('utf-8')
                        text += cleaned_text + "\n"
            
            os.unlink(temp_file.name)
            
            # Final cleanup - remove extra whitespace and normalize
            text = ' '.join(text.split())
            
            print(f"Extracted {len(text)} characters from PDF")
            return text.strip() if text.strip() else None
            
    except Exception as e:
        print(f"PDF text extraction failed: {e}")
        return None
```

**Key Features:**
- Uses PyPDF2 library for PDF reading
- Handles encoding issues and non-printable characters
- Normalizes Unicode characters
- Cleans up whitespace
- Returns extracted text or None on failure

---

## 2. Main Resume Parsing Function

**File:** `backend/app/utils/users.py`

### Function: `parse_resume_info(resume_text)`

This is the core parsing function that uses OpenAI to extract structured data from resume text.

**Parameters:**
- `resume_text: str` - Raw text extracted from PDF (limited to 8000 characters)

**Returns:**
- `dict` - Structured JSON with all resume information

**Implementation:**

```python
def parse_resume_info(resume_text):
    """Parse comprehensive info from resume text using OpenAI - extracts full structure"""
    try:
        client = get_openai_client()
        if not client or not resume_text:
            return {}
        
        # Use full resume text (or reasonable limit for very long resumes)
        resume_snippet = resume_text[:8000]  # Increased to capture full resume
        
        RESUME_PARSING_PROMPT = """You are an expert resume parser. Extract ALL information from the resume into a structured JSON format.

## CRITICAL RULES

1. **EXTRACT EVERYTHING** - Do not summarize or condense. Keep all details.
2. **PRESERVE EXACT TEXT** - Company names, job titles, dates, and degrees must be copied exactly as written.
3. **KEEP ALL BULLETS** - Every bullet point in experience and projects must be preserved.
4. **KEEP ALL SKILLS** - Extract every skill mentioned, organized by category.
5. **KEEP COURSEWORK** - Extract all courses listed.
6. **KEEP PROJECTS** - Extract all projects with full descriptions.

## RESUME TEXT

{resume_text}

## OUTPUT FORMAT

Return ONLY valid JSON in this exact structure:

{{
  "name": "Full name exactly as written",
  "contact": {{
    "email": "email if present, null otherwise",
    "phone": "phone if present, null otherwise",
    "location": "city, state if present",
    "linkedin": "LinkedIn URL if present, null otherwise",
    "github": "GitHub URL if present, null otherwise",
    "website": "personal website if present, null otherwise"
  }},
  "objective": "Objective or summary statement if present, null otherwise",
  
  "education": {{
    "degree": "Exact degree type (e.g., 'Bachelor of Science', 'Master of Arts')",
    "major": "Major/field of study",
    "university": "Full university name exactly as written",
    "location": "City, State of university",
    "graduation": "Graduation date exactly as written (e.g., 'Dec 2025', 'May 2024')",
    "gpa": "GPA if present, null otherwise",
    "coursework": ["Course 1", "Course 2", "...all courses listed..."],
    "honors": ["Honor 1", "Honor 2", "...all honors/awards listed..."],
    "minor": "Minor if present, null otherwise"
  }},
  
  "experience": [
    {{
      "company": "Exact company name as written",
      "title": "Exact job title as written",
      "dates": "Exact date range as written (e.g., 'March 2024 – May 2025')",
      "location": "City, State or 'Remote' if specified",
      "bullets": [
        "First bullet point exactly as written",
        "Second bullet point exactly as written",
        "...ALL bullet points, do not skip any..."
      ]
    }}
  ],
  
  "projects": [
    {{
      "name": "Exact project name",
      "description": "Full project description exactly as written",
      "technologies": ["Tech 1", "Tech 2", "...technologies mentioned..."],
      "date": "Date if present, null otherwise",
      "link": "URL if present, null otherwise"
    }}
  ],
  
  "skills": {{
    "programming_languages": ["Language 1", "Language 2", "..."],
    "tools_frameworks": ["Tool 1", "Framework 1", "..."],
    "databases": ["Database 1", "..."],
    "cloud_devops": ["AWS", "Docker", "..."],
    "core_skills": ["Skill 1", "Skill 2", "..."],
    "soft_skills": ["Communication", "Leadership", "..."],
    "languages": ["English", "Spanish", "..."]
  }},
  
  "extracurriculars": [
    {{
      "activity": "Activity name",
      "role": "Role if specified",
      "organization": "Organization name if specified",
      "dates": "Dates if specified",
      "description": "Description if present"
    }}
  ],
  
  "certifications": [
    {{
      "name": "Certification name",
      "issuer": "Issuing organization",
      "date": "Date obtained",
      "expiry": "Expiry date if applicable"
    }}
  ],
  
  "publications": [],
  "awards": [],
  "volunteer": []
}}

## IMPORTANT REMINDERS

- If a section doesn't exist in the resume, use an empty array [] or null
- Do NOT invent or infer information that isn't explicitly stated
- Do NOT summarize bullet points - copy them exactly
- Do NOT merge multiple experiences into one
- Do NOT skip any experiences, projects, or skills
- Dates should be copied exactly as formatted in the resume
- Company names and job titles must match the resume exactly"""

        prompt = RESUME_PARSING_PROMPT.format(resume_text=resume_snippet)
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are an expert resume parser. Extract ALL information from resumes without summarizing. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=4000,  # Significantly increased to handle full structure
            temperature=0.1
        )
        
        import json
        result_text = response.choices[0].message.content.strip()
        # Remove markdown code blocks if present
        if '```' in result_text:
            result_text = result_text.split('```')[1]
            if result_text.startswith('json'):
                result_text = result_text[4:]
            result_text = result_text.strip()
        
        parsed = json.loads(result_text)
        
        # Ensure proper structure for nested objects
        if 'contact' in parsed and not isinstance(parsed['contact'], dict):
            parsed['contact'] = {}
        if 'education' in parsed and not isinstance(parsed['education'], dict):
            parsed['education'] = {}
        if 'skills' in parsed and not isinstance(parsed['skills'], dict):
            # Convert old format to new format if needed
            old_skills = parsed['skills'] if isinstance(parsed['skills'], list) else []
            parsed['skills'] = {
                'programming_languages': old_skills,
                'tools_frameworks': [],
                'databases': [],
                'cloud_devops': [],
                'core_skills': [],
                'soft_skills': [],
                'languages': []
            }
        
        # Ensure arrays are arrays
        for key in ['experience', 'projects', 'extracurriculars', 'certifications', 'publications', 'awards', 'volunteer']:
            if key in parsed and not isinstance(parsed[key], list):
                parsed[key] = []
        
        # Ensure education arrays
        if 'education' in parsed:
            edu = parsed['education']
            if 'coursework' in edu and not isinstance(edu['coursework'], list):
                edu['coursework'] = []
            if 'honors' in edu and not isinstance(edu['honors'], list):
                edu['honors'] = []
        
        return parsed
        
    except Exception as e:
        print(f"Resume parsing failed: {e}")
        import traceback
        traceback.print_exc()
        return {}
```

**Key Features:**
- Uses GPT-4o-mini model with temperature 0.1 for consistent parsing
- Processes up to 8000 characters of resume text
- Returns up to 4000 tokens of structured output
- Handles markdown code blocks in response
- Validates and normalizes data structure
- Converts legacy skill formats to new structured format
- Ensures all arrays and objects are properly typed

---

## 3. Validation Function

**File:** `backend/app/utils/users.py`

### Function: `validate_parsed_resume(parsed: dict)`

Validates that the parsed resume contains essential fields and proper structure.

**Parameters:**
- `parsed: dict` - The parsed resume dictionary

**Returns:**
- `tuple[bool, list[str]]` - (is_valid, errors) where errors is a list of validation messages

**Implementation:**

```python
def validate_parsed_resume(parsed: dict) -> tuple[bool, list[str]]:
    """Validate that parsed resume has essential fields."""
    errors = []
    
    # Required fields
    if not parsed.get('name'):
        errors.append("Missing name")
    
    if not parsed.get('education') or not parsed['education'].get('university'):
        errors.append("Missing education/university")
    
    # Experience is recommended but not strictly required for some students
    if not parsed.get('experience') or len(parsed.get('experience', [])) == 0:
        errors.append("Warning: Missing experience section")
    
    if not parsed.get('skills'):
        errors.append("Missing skills section")
    
    # Validate experience entries have required fields
    for i, exp in enumerate(parsed.get('experience', [])):
        if not exp.get('company'):
            errors.append(f"Experience {i+1} missing company name")
        if not exp.get('title'):
            errors.append(f"Experience {i+1} missing job title")
        if not exp.get('bullets') or len(exp.get('bullets', [])) == 0:
            errors.append(f"Experience {i+1} missing bullet points")
    
    # Separate warnings from errors
    warnings = [e for e in errors if e.startswith("Warning:")]
    errors_only = [e for e in errors if not e.startswith("Warning:")]
    
    is_valid = len(errors_only) == 0
    return is_valid, errors
```

**Validation Rules:**
- **Required:** name, education/university, skills
- **Recommended:** experience section (warning if missing)
- **Experience entries:** Must have company, title, and at least one bullet point
- Returns `True` only if no critical errors (warnings are allowed)

---

## 4. API Route Handler

**File:** `backend/app/routes/resume.py`

### Endpoint: `POST /api/parse-resume`

Handles the complete resume upload and parsing workflow.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: `resume` file (PDF only)
- Headers: `Authorization: Bearer <firebase_id_token>`

**Response:**
```json
{
  "success": true,
  "data": {
    // Full parsed resume structure
  },
  "savedToFirebase": true,
  "resumeUrl": "https://firebasestorage.googleapis.com/..."
}
```

**Implementation:**

```python
@resume_bp.route('/parse-resume', methods=['POST'])
def parse_resume():
    """Parse uploaded resume, upload to storage, and extract user information"""
    try:
        from datetime import datetime
        
        print("=" * 60)
        print("📋 RESUME UPLOAD & PARSING")
        print("=" * 60)
        
        # Validate file exists
        if 'resume' not in request.files:
            print("❌ No resume file in request")
            return jsonify({'error': 'No resume file provided'}), 400
        
        file = request.files['resume']
        print(f"📄 File: {file.filename}")
        
        if file.filename == '':
            print("❌ Empty filename")
            return jsonify({'error': 'No file selected'}), 400
        
        if not file.filename.lower().endswith('.pdf'):
            print(f"❌ Invalid file type: {file.filename}")
            return jsonify({'error': 'Only PDF files are supported'}), 400
        
        # Extract text from PDF
        print("📖 Extracting text from PDF...")
        resume_text = extract_text_from_pdf(file)
        
        if not resume_text:
            print("❌ Could not extract text from PDF")
            return jsonify({'error': 'Could not extract text from PDF'}), 400
        
        print(f"✅ Extracted {len(resume_text)} characters")
        
        # Parse user info
        print("🔍 Parsing resume info...")
        parsed_info = parse_resume_info(resume_text)
        
        # Validate parsed resume
        if parsed_info:
            is_valid, errors = validate_parsed_resume(parsed_info)
            if errors:
                print(f"⚠️  Validation {'warnings' if is_valid else 'errors'}: {', '.join(errors)}")
            if not is_valid:
                print(f"❌ Resume parsing validation failed, but continuing with partial data")
        
        name = parsed_info.get('name') if parsed_info else 'Unknown'
        if not name and parsed_info and 'education' in parsed_info:
            # Try to get name from education if available
            name = 'Unknown'
        print(f"✅ Parsed: {name}")
        
        # Get user ID from auth token
        user_id = None
        resume_url = None
        
        try:
            db = get_db()
            auth_header = request.headers.get('Authorization', '')
            
            if auth_header.startswith('Bearer '):
                id_token = auth_header.split(' ', 1)[1].strip()
                
                try:
                    decoded = fb_auth.verify_id_token(id_token)
                    user_id = decoded.get('uid')
                    print(f"👤 User ID: {user_id}")
                    
                    if user_id and db:
                        # STEP 4A: Upload file to Firebase Storage
                        print("\n📤 Uploading to Firebase Storage...")
                        file.seek(0)  # Reset file pointer for re-reading
                        resume_url = upload_resume_to_firebase_storage(user_id, file)
                        
                        if not resume_url:
                            print("⚠️  File upload failed, continuing without URL")
                        
                        # STEP 4B: Save both text, URL, and parsed data to Firebase
                        print("\n💾 Saving to Firestore...")
                        file.seek(0)  # Reset again for text extraction
                        save_result = save_resume_to_firebase(
                            user_id, 
                            resume_text,
                            resume_url,
                            parsed_info  # Include parsed data
                        )
                        
                        if save_result:
                            print("✅ All data saved successfully")
                        else:
                            print("⚠️  Save returned False")
                    
                except Exception as e:
                    print(f"❌ Token verification failed: {e}")
                    import traceback
                    traceback.print_exc()
                    
        except Exception as e:
            print(f"❌ Auth check failed: {e}")
            import traceback
            traceback.print_exc()
        
        print("=" * 60)
        print("✅ RESUME PROCESSING COMPLETE")
        print("=" * 60)
        
        return jsonify({
            'success': True,
            'data': parsed_info,
            'savedToFirebase': bool(user_id),
            'resumeUrl': resume_url  # Return URL to frontend
        })
        
    except Exception as e:
        print(f"💥 FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to parse resume'}), 500
```

**Workflow:**
1. Validates file exists and is PDF
2. Extracts text from PDF
3. Parses resume using OpenAI
4. Validates parsed structure
5. Authenticates user via Firebase token
6. Uploads PDF to Firebase Storage
7. Saves text, URL, and parsed data to Firestore
8. Returns parsed data to frontend

---

## 5. Storage Functions

**File:** `backend/app/routes/resume.py`

### Function: `save_resume_to_firebase(user_id, resume_text, resume_url, parsed_info=None)`

Saves resume data to Firestore with full structure and version tracking.

**Parameters:**
- `user_id: str` - Firebase user ID
- `resume_text: str` - Raw extracted text
- `resume_url: str` - Firebase Storage URL
- `parsed_info: dict` - Parsed resume structure (optional)

**Returns:**
- `bool` - True if save succeeded

**Implementation:**

```python
def save_resume_to_firebase(user_id, resume_text, resume_url, parsed_info=None):
    """Save resume text, URL, and parsed info to Firestore with full structure"""
    try:
        from datetime import datetime
        db = get_db()
        if not db:
            return False
        
        update_data = {
            'resumeText': resume_text,
            'originalResumeText': resume_text,  # Backup of original text
            'resumeUrl': resume_url,
            'resumeFileName': 'resume.pdf',
            'resumeUpdatedAt': datetime.now().isoformat()
        }
        
        # Save parsed resume data with full structure (v2 format)
        if parsed_info:
            # Store the complete parsed structure
            update_data['resumeParsed'] = parsed_info
            update_data['resumeParseVersion'] = 2  # Track schema version
            
            print(f"[Resume] Saved resume with version 2 structure")
            print(f"[Resume] Experience entries: {len(parsed_info.get('experience', []))}")
            print(f"[Resume] Project entries: {len(parsed_info.get('projects', []))}")
            if 'skills' in parsed_info:
                if isinstance(parsed_info['skills'], dict):
                    total_skills = sum(len(v) if isinstance(v, list) else 0 for v in parsed_info['skills'].values())
                    print(f"[Resume] Total skills: {total_skills}")
                else:
                    print(f"[Resume] Skills (legacy format): {len(parsed_info['skills']) if isinstance(parsed_info['skills'], list) else 'N/A'}")
        
        db.collection('users').document(user_id).update(update_data)
        return True
    except Exception as e:
        print(f"Firestore save failed: {e}")
        import traceback
        traceback.print_exc()
        return False
```

**Stored Fields:**
- `resumeText` - Raw extracted text
- `originalResumeText` - Backup copy
- `resumeUrl` - Firebase Storage URL
- `resumeFileName` - Filename
- `resumeUpdatedAt` - ISO timestamp
- `resumeParsed` - Complete parsed structure (v2 format)
- `resumeParseVersion` - Schema version (currently 2)

### Function: `upload_resume_to_firebase_storage(user_id, file)`

Uploads PDF file to Firebase Storage.

```python
def upload_resume_to_firebase_storage(user_id, file):
    """Upload resume to Firebase Storage"""
    try:
        from firebase_admin import storage
        bucket = storage.bucket()
        blob = bucket.blob(f'resumes/{user_id}/{file.filename}')
        blob.upload_from_file(file)
        blob.make_public()
        return blob.public_url
    except Exception as e:
        print(f"Storage upload failed: {e}")
        return None
```

**Storage Path:** `resumes/{user_id}/{filename}`

---

## 6. Helper Functions

**File:** `backend/app/utils/users.py`

### Function: `extract_user_info_from_resume_priority(resume_text, profile)`

Extracts user info prioritizing resume text, falling back to profile data.

```python
def extract_user_info_from_resume_priority(resume_text, profile):
    """
    Extract user info prioritizing resume text, falling back to profile.
    This is the main function used by email generation.
    """
    # Import here to avoid circular dependencies
    from app.utils.users import parse_resume_info, extract_comprehensive_user_info
    
    user_info = {}
    
    # Priority 1: Try to extract from resume if available
    if resume_text and len(resume_text.strip()) > 50:
        try:
            parsed = parse_resume_info(resume_text)
            if parsed:
                user_info.update(parsed)
        except Exception as e:
            print(f"Resume parsing failed: {e}")
    
    # Priority 2: Fallback to profile if resume didn't provide enough info
    if profile:
        if not user_info.get('name'):
            user_info['name'] = profile.get('name') or f"{profile.get('firstName', '')} {profile.get('lastName', '')}".strip()
        if not user_info.get('year'):
            user_info['year'] = profile.get('year') or profile.get('graduationYear') or ""
        if not user_info.get('major'):
            user_info['major'] = profile.get('major') or profile.get('fieldOfStudy') or ""
        if not user_info.get('university'):
            user_info['university'] = profile.get('university') or ""
    
    return user_info
```

### Function: `extract_hometown_from_resume(resume_text)`

Extracts location/hometown from resume using regex patterns.

```python
def extract_hometown_from_resume(resume_text):
    """Extract location/hometown from resume text using multiple patterns."""
    if not resume_text:
        return None
    
    # More comprehensive patterns to catch location information
    patterns = [
        # "Based in Los Angeles, CA" or "Based in Los Angeles, California"
        r'[Bb]ased in\s+([A-Z][a-zA-Z\s]+(?:,\s*[A-Z]{2}|,\s*[A-Z][a-z]+))',
        # "From Los Angeles, CA" or "From Los Angeles, California"
        r'[Ff]rom\s+([A-Z][a-zA-Z\s]+(?:,\s*[A-Z]{2}|,\s*[A-Z][a-z]+))',
        # "Hometown: Los Angeles, CA"
        r'[Hh]ometown[:\s]+([A-Z][a-zA-Z\s]+(?:,\s*[A-Z]{2}|,\s*[A-Z][a-z]+))',
        # "Location: Los Angeles, CA"
        r'[Ll]ocation[:\s]+([A-Z][a-zA-Z\s]+(?:,\s*[A-Z]{2}|,\s*[A-Z][a-z]+))',
        # Address patterns: "123 Main St, Los Angeles, CA" or "Los Angeles, CA 90001"
        r'([A-Z][a-zA-Z\s]+),\s*([A-Z]{2})\s*(?:\d{5}|$)',
        # City, State format at start of line (common in contact sections)
        r'^([A-Z][a-zA-Z\s]+),\s*([A-Z]{2}|[A-Z][a-z]+)(?:\s|$)',
        # "Los Angeles, California" or "New York, New York"
        r'([A-Z][a-zA-Z\s]+),\s*([A-Z][a-z]+)(?:\s|,|$)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, resume_text, re.MULTILINE)
        if match:
            # ... location extraction logic with state normalization ...
            return location
    
    return None
```

### Function: `extract_companies_from_resume(resume_text)`

Extracts company names from resume text.

```python
def extract_companies_from_resume(resume_text):
    """Extract company names from resume."""
    if not resume_text:
        return []
    
    companies = []
    # Look for common patterns
    lines = resume_text.split('\n')
    for line in lines:
        if any(word in line.lower() for word in ['intern', 'analyst', 'associate', 'consultant', 'manager']):
            # Extract capitalized sequences (likely company names)
            words = re.findall(r'[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}', line)
            companies.extend(words)
    
    # Return unique companies, max 5
    return list(set(companies))[:5]
```

---

## 7. Data Structure

### Parsed Resume Schema (v2)

```json
{
  "name": "string",
  "contact": {
    "email": "string | null",
    "phone": "string | null",
    "location": "string | null",
    "linkedin": "string | null",
    "github": "string | null",
    "website": "string | null"
  },
  "objective": "string | null",
  "education": {
    "degree": "string",
    "major": "string",
    "university": "string",
    "location": "string",
    "graduation": "string",
    "gpa": "string | null",
    "coursework": ["string"],
    "honors": ["string"],
    "minor": "string | null"
  },
  "experience": [
    {
      "company": "string",
      "title": "string",
      "dates": "string",
      "location": "string",
      "bullets": ["string"]
    }
  ],
  "projects": [
    {
      "name": "string",
      "description": "string",
      "technologies": ["string"],
      "date": "string | null",
      "link": "string | null"
    }
  ],
  "skills": {
    "programming_languages": ["string"],
    "tools_frameworks": ["string"],
    "databases": ["string"],
    "cloud_devops": ["string"],
    "core_skills": ["string"],
    "soft_skills": ["string"],
    "languages": ["string"]
  },
  "extracurriculars": [
    {
      "activity": "string",
      "role": "string | null",
      "organization": "string | null",
      "dates": "string | null",
      "description": "string | null"
    }
  ],
  "certifications": [
    {
      "name": "string",
      "issuer": "string",
      "date": "string",
      "expiry": "string | null"
    }
  ],
  "publications": [],
  "awards": [],
  "volunteer": []
}
```

### Firestore Document Structure

```
users/{userId}
  ├── resumeText: string
  ├── originalResumeText: string
  ├── resumeUrl: string
  ├── resumeFileName: string
  ├── resumeUpdatedAt: string (ISO timestamp)
  ├── resumeParsed: object (v2 schema)
  └── resumeParseVersion: number (2)
```

---

## 8. Error Handling

The system handles errors at multiple levels:

1. **PDF Extraction Errors:**
   - Returns `None` if extraction fails
   - Logs error message

2. **Parsing Errors:**
   - Returns empty dict `{}` on failure
   - Logs full traceback
   - Continues with partial data if validation fails

3. **Validation Errors:**
   - Separates warnings from critical errors
   - Allows processing to continue with warnings
   - Blocks processing only on critical errors

4. **Storage Errors:**
   - Returns `False` on Firestore save failure
   - Continues without URL if Storage upload fails
   - Logs all errors with traceback

---

## 9. Dependencies

**Python Packages:**
- `PyPDF2` - PDF text extraction
- `openai` - OpenAI API client
- `firebase_admin` - Firebase Storage and Firestore
- `flask` - Web framework

**OpenAI Configuration:**
- Model: `gpt-4o-mini`
- Max Tokens: `4000`
- Temperature: `0.1`
- Input Limit: `8000` characters

---

## 10. Usage Examples

### Frontend Upload

```typescript
const formData = new FormData();
formData.append('resume', file);

const response = await fetch(`${API_URL}/api/parse-resume`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${idToken}`
  },
  body: formData
});

const result = await response.json();
// result.data contains parsed resume structure
// result.resumeUrl contains Firebase Storage URL
```

### Backend Usage

```python
from app.services.resume_parser import extract_text_from_pdf
from app.utils.users import parse_resume_info

# Extract text
resume_text = extract_text_from_pdf(pdf_file)

# Parse resume
parsed = parse_resume_info(resume_text)

# Access parsed data
name = parsed.get('name')
experiences = parsed.get('experience', [])
skills = parsed.get('skills', {})
```

---

## 11. Performance Considerations

- **Text Limit:** 8000 characters per resume (prevents token overflow)
- **Token Limit:** 4000 tokens output (handles full resume structure)
- **Model:** GPT-4o-mini (faster and cheaper than GPT-4)
- **Temperature:** 0.1 (ensures consistent parsing)
- **Caching:** Parsed resumes stored in Firestore (no re-parsing needed)

---

## 12. Future Improvements

Potential enhancements:
1. Support for DOCX files (currently PDF only)
2. OCR for scanned PDFs
3. Incremental parsing for very long resumes
4. Resume comparison/diff functionality
5. Resume optimization suggestions
6. Multi-language support
7. Resume template detection
8. Skills normalization and categorization

---

## Files Reference

- `backend/app/services/resume_parser.py` - PDF extraction and helper functions
- `backend/app/utils/users.py` - Main parsing logic and validation
- `backend/app/routes/resume.py` - API endpoints and storage functions
- `backend/app/services/openai_client.py` - OpenAI client configuration

---

*Last Updated: Based on current codebase analysis*

