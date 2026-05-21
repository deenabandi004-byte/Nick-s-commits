# Email Personalization Data Inspection Report

**Date:** Inspection completed  
**Purpose:** Understand all available data for email personalization before implementing anchor-based logic  
**Status:** READ-ONLY inspection - no logic changes made

---

## Executive Summary

This document catalogs all available data fields for email personalization, organized by:
1. **Contact Data** (PDL + LinkedIn-derived)
2. **Sender Data** (Resume + Profile-derived)
3. **Data Flow** (How data moves into the prompt)
4. **Anchor Candidates** (Fields suitable for safe anchor usage)

---

## 1. CONTACT DATA STRUCTURE

### 1.1 PDL (People Data Labs) Fields

**Source:** `backend/app/services/pdl_client.py::extract_contact_from_pdl_person_enhanced()`

#### Basic Identity Fields
| Field Name | Source | Example Value | Reliability | Notes |
|------------|--------|---------------|-------------|-------|
| `FirstName` | PDL `first_name` | "John" | **High** | Always present |
| `LastName` | PDL `last_name` | "Smith" | **High** | Always present |
| `LinkedIn` | PDL `profiles[].url` | "https://linkedin.com/in/johnsmith" | **High** | Extracted from profiles array |
| `Email` | PDL `emails[]` + Hunter.io verification | "john.smith@company.com" | **Medium** | Verified via Hunter.io, may be "Not available" |
| `WorkEmail` | PDL `emails[]` (type=work) | "john.smith@company.com" | **Medium** | May be "Not available" |
| `PersonalEmail` | PDL `recommended_personal_email` | "john@gmail.com" | **Low** | Often missing |
| `Phone` | PDL `phone_numbers[]` | "+1-555-0123" | **Low** | Often missing |

#### Professional Fields
| Field Name | Source | Example Value | Reliability | Notes |
|------------|--------|---------------|-------------|-------|
| `Title` | PDL `experience[0].title.name` | "Senior Software Engineer" | **High** | Current job title |
| `Company` | PDL `experience[0].company.name` | "Google" | **High** | Current company |
| `WorkSummary` | PDL `experience[]` (constructed) | "Current Senior Software Engineer at Google (5 years experience). Previously at Microsoft" | **Medium** | Constructed from experience array |
| `Group` | Constructed | "Google Senior Team" | **Low** | Auto-generated, not from PDL |

#### Location Fields
| Field Name | Source | Example Value | Reliability | Notes |
|------------|--------|---------------|-------------|-------|
| `City` | PDL `location.locality` | "San Francisco" | **Medium** | Often present |
| `State` | PDL `location.region` | "California" | **Medium** | Often present |
| `Hometown` | Inferred from education | "Los Angeles, CA" | **Low** | Only for meeting prep |

#### Education Fields
| Field Name | Source | Example Value | Reliability | Notes |
|------------|--------|---------------|-------------|-------|
| `College` | PDL `education[0].school.name` | "Stanford University" | **High** | Primary degree-granting institution |
| `EducationTop` | PDL `education[]` (constructed) | "Stanford University - Bachelor of Science (2015 - 2019)" | **Medium** | Full education history string |

**PDL Education Structure (Raw):**
```python
education = [
    {
        "school": {"name": "Stanford University"},
        "degrees": ["Bachelor of Science"],
        "field_of_study": "Computer Science",
        "start_date": {"year": 2015, "month": 9},
        "end_date": {"year": 2019, "month": 6}
    }
]
```

#### Additional PDL Fields (Available but Not Always Used)
| Field Name | Source | Reliability | Currently Used? |
|------------|--------|-------------|-----------------|
| `LinkedInConnections` | PDL `linkedin_connections` | **Low** | ❌ No |
| `DataVersion` | PDL `dataset_version` | **High** | ❌ No |
| `EmailSource` | Tracked internally | **High** | ❌ No (tracked but not used) |
| `EmailVerified` | Tracked internally | **High** | ❌ No (tracked but not used) |
| `IsCurrentlyAtTarget` | Computed | **High** | ❌ No (computed but not used) |
| `SocialProfiles` | Constructed | **Low** | ❌ No |
| `VolunteerHistory` | PDL `interests[]` + `summary` | **Low** | ❌ No |

#### PDL Experience Array (Full Structure Available)
```python
experience = [
    {
        "company": {"name": "Google", "size": "10000+", "industry": "Technology"},
        "title": {"name": "Senior Software Engineer", "role": "engineering", "sub_role": "software"},
        "start_date": {"year": 2020, "month": 3},
        "end_date": None,  # None = current job
        "summary": "Led development of..."
    }
]
```

**Unused PDL Fields in Experience:**
- `company.size` - Company size
- `company.industry` - Industry tags
- `title.role` - Job title role (e.g., "engineering")
- `title.sub_role` - Job title sub-role (e.g., "software")
- `summary` - Job description/summary

---

### 1.2 LinkedIn-Derived Fields

**Source:** `backend/app/routes/linkedin_import.py::extract_contact_from_pdl_person_enhanced()`

LinkedIn enrichment uses the same PDL extraction function, so fields are identical to PDL fields above.

**Note:** LinkedIn profiles are enriched via PDL's `/person/enrich` API, which returns the same structure as PDL search results.

---

## 2. SENDER (USER) DATA STRUCTURE

### 2.1 Resume-Derived Fields

**Source:** `backend/app/utils/users.py::parse_resume_info()` and `extract_user_info_from_resume_priority()`

#### Basic Identity
| Field Name | Source | Example Value | Reliability | Notes |
|------------|--------|---------------|-------------|-------|
| `name` | Resume parsing (OpenAI) | "Jane Doe" | **High** | Extracted from resume header |
| `contact.email` | Resume parsing | "jane@university.edu" | **Medium** | May be missing |
| `contact.phone` | Resume parsing | "+1-555-0123" | **Low** | Often missing |
| `contact.location` | Resume parsing | "Los Angeles, CA" | **Medium** | May be missing |
| `contact.linkedin` | Resume parsing | "https://linkedin.com/in/janedoe" | **Medium** | May be missing |

#### Education (Resume)
| Field Name | Source | Example Value | Reliability | Notes |
|------------|--------|---------------|-------------|-------|
| `education.university` | Resume parsing | "University of Southern California" | **High** | Primary university |
| `education.major` | Resume parsing | "Computer Science" | **High** | Field of study |
| `education.degree` | Resume parsing | "Bachelor of Science" | **High** | Degree type |
| `education.graduation` | Resume parsing | "May 2025" | **High** | Graduation date |
| `education.gpa` | Resume parsing | "3.8" | **Low** | Often missing |
| `education.coursework` | Resume parsing | ["Data Structures", "Algorithms"] | **Medium** | Array of courses |
| `education.honors` | Resume parsing | ["Dean's List", "Summa Cum Laude"] | **Low** | Often missing |
| `education.minor` | Resume parsing | "Business" | **Low** | Often missing |

#### Experience (Resume)
| Field Name | Source | Example Value | Reliability | Notes |
|------------|--------|---------------|-------------|-------|
| `experience[]` | Resume parsing | Array of experience objects | **High** | Full experience history |
| `experience[].company` | Resume parsing | "Google" | **High** | Exact company name |
| `experience[].title` | Resume parsing | "Software Engineering Intern" | **High** | Exact job title |
| `experience[].dates` | Resume parsing | "June 2024 – August 2024" | **High** | Date range |
| `experience[].location` | Resume parsing | "Mountain View, CA" | **Medium** | May be missing |
| `experience[].bullets` | Resume parsing | ["Built feature X", "Led team Y"] | **High** | All bullet points preserved |

**Experience Array Structure:**
```python
experience = [
    {
        "company": "Google",
        "title": "Software Engineering Intern",
        "dates": "June 2024 – August 2024",
        "location": "Mountain View, CA",
        "bullets": [
            "Developed feature X using Python and React",
            "Collaborated with team of 5 engineers",
            "Improved performance by 30%"
        ]
    }
]
```

#### Projects (Resume)
| Field Name | Source | Example Value | Reliability | Notes |
|------------|--------|---------------|-------------|-------|
| `projects[]` | Resume parsing | Array of project objects | **Medium** | Often present |
| `projects[].name` | Resume parsing | "Machine Learning Classifier" | **Medium** | Project name |
| `projects[].description` | Resume parsing | "Built a classifier using..." | **Medium** | Full description |
| `projects[].technologies` | Resume parsing | ["Python", "TensorFlow", "Scikit-learn"] | **Medium** | Tech stack |
| `projects[].date` | Resume parsing | "Spring 2024" | **Low** | Often missing |
| `projects[].link` | Resume parsing | "https://github.com/..." | **Low** | Often missing |

#### Skills (Resume)
| Field Name | Source | Example Value | Reliability | Notes |
|------------|--------|---------------|-------------|-------|
| `skills` | Resume parsing | Dict or List | **High** | Structured by category |
| `skills.programming_languages` | Resume parsing | ["Python", "Java", "C++"] | **High** | Often present |
| `skills.tools_frameworks` | Resume parsing | ["React", "Django", "AWS"] | **High** | Often present |
| `skills.databases` | Resume parsing | ["PostgreSQL", "MongoDB"] | **Medium** | Often present |
| `skills.cloud_devops` | Resume parsing | ["AWS", "Docker", "Kubernetes"] | **Medium** | Often present |
| `skills.core_skills` | Resume parsing | ["Data Analysis", "Machine Learning"] | **Medium** | Often present |
| `skills.soft_skills` | Resume parsing | ["Leadership", "Communication"] | **Low** | Often missing |
| `skills.languages` | Resume parsing | ["English", "Spanish"] | **Low** | Often missing |

**Skills Structure:**
```python
skills = {
    "programming_languages": ["Python", "Java"],
    "tools_frameworks": ["React", "Django"],
    "databases": ["PostgreSQL"],
    "cloud_devops": ["AWS"],
    "core_skills": ["Data Analysis"],
    "soft_skills": ["Leadership"],
    "languages": ["English"]
}
```

#### Other Resume Fields
| Field Name | Source | Example Value | Reliability | Notes |
|------------|--------|---------------|-------------|-------|
| `objective` | Resume parsing | "Seeking software engineering..." | **Low** | Often missing |
| `extracurriculars[]` | Resume parsing | Array of activities | **Low** | Often missing |
| `certifications[]` | Resume parsing | Array of certs | **Low** | Often missing |
| `publications[]` | Resume parsing | Array of publications | **Very Low** | Rarely present |
| `awards[]` | Resume parsing | Array of awards | **Low** | Often missing |
| `volunteer[]` | Resume parsing | Array of volunteer work | **Low** | Often missing |

---

### 2.2 Profile-Derived Fields

**Source:** User profile form + Firestore `users` collection

| Field Name | Source | Example Value | Reliability | Notes |
|------------|--------|---------------|-------------|-------|
| `name` | Profile form | "Jane Doe" | **High** | Fallback if resume missing |
| `firstName` | Profile form | "Jane" | **High** | Fallback |
| `lastName` | Profile form | "Doe" | **High** | Fallback |
| `email` | Profile form | "jane@university.edu" | **High** | User's email |
| `phone` | Profile form | "+1-555-0123" | **Medium** | May be missing |
| `linkedin` | Profile form | "https://linkedin.com/in/janedoe" | **Medium** | May be missing |
| `university` | Profile form | "University of Southern California" | **High** | Fallback if resume missing |
| `major` / `fieldOfStudy` | Profile form | "Computer Science" | **High** | Fallback if resume missing |
| `year` / `graduationYear` | Profile form | "2025" | **High** | Fallback if resume missing |
| `careerInterests` | Profile form | "Software engineering at tech companies" | **Medium** | User-entered text |
| `resumeUrl` | Profile form | Firebase Storage URL | **High** | Resume file location |
| `resumeFileName` | Profile form | "Resume.pdf" | **High** | Resume filename |
| `resumeParsed` | Cached | Parsed resume JSON | **Medium** | Cached parse result |

---

### 2.3 Computed/Inferred Fields

**Source:** `backend/app/utils/users.py` utility functions

| Field Name | Source | Example Value | Reliability | Notes |
|------------|--------|---------------|-------------|-------|
| `key_experiences` | Extracted from `experience[]` | ["Software Engineering Intern at Google", "Research Assistant at USC"] | **High** | Top 2 experiences |
| `achievements` | Extracted from resume | ["Dean's List", "Hackathon Winner"] | **Low** | Often missing |
| `sender_university_short` | `get_university_shorthand()` | "USC" | **High** | Shorthand for email signature |

**Note:** `key_experiences` and `achievements` are NOT currently extracted from the resume parser output. They would need to be computed from the `experience[]` and `awards[]` arrays.

---

## 3. DATA FLOW INTO EMAIL GENERATION

### 3.1 Entry Point

**Function:** `backend/app/services/reply_generation.py::batch_generate_emails()`

**Parameters:**
- `contacts`: List of contact dicts (PDL-enriched)
- `resume_text`: Raw resume text string
- `user_profile`: User profile dict from Firestore
- `career_interests`: Career interests string
- `fit_context`: Optional job fit analysis dict

### 3.2 User Info Extraction

**Function:** `extract_user_info_from_resume_priority(resume_text, user_profile)`

**Priority:**
1. **Resume parsing** (if `resume_text` available) → `parse_resume_info()`
2. **Profile fallback** (if resume missing fields)

**Output:** `user_info` dict containing:
- `name`, `university`, `major`, `year` (basic info)
- `education` (full education dict)
- `experience[]` (full experience array)
- `projects[]` (full projects array)
- `skills` (dict or list)

### 3.3 Contact Context Construction

**Location:** `batch_generate_emails()` lines 85-136

**Process:**
1. For each contact, call `detect_commonality(user_info, contact, resume_text)`
2. Extract: `FirstName`, `LastName`, `Company`, `Title`
3. Compute: `industry = determine_industry(company, title)`
4. Build `contact_context` string:
   ```
   Contact {i}: {firstname} {lastname}
   - Role: {title} at {company}
   - Industry: {industry}
   - Connection: {personalization_note}
   - Personalize by: Mentioning their role/company...
   ```

**Currently Used Contact Fields:**
- ✅ `FirstName`, `LastName`
- ✅ `Company`, `Title`
- ✅ `College`, `EducationTop` (via `detect_commonality()`)
- ✅ `City` (via `detect_commonality()` for hometown)

**Currently UNUSED Contact Fields:**
- ❌ `WorkSummary` (full employment history)
- ❌ `VolunteerHistory`
- ❌ `Phone`, `PersonalEmail`, `WorkEmail`
- ❌ `SocialProfiles`
- ❌ `Group`
- ❌ `LinkedInConnections`
- ❌ PDL `experience[]` array (full employment history)
- ❌ PDL `education[]` array (full education history)
- ❌ PDL `interests[]`
- ❌ PDL `summary`
- ❌ Company size, industry tags, job title role/sub_role

### 3.4 Resume Context Construction

**Location:** `batch_generate_emails()` lines 138-157

**Currently Included:**
- `key_experiences` (top 2) - **BUT THIS FIELD IS NOT EXTRACTED FROM RESUME PARSER**
- `skills` (top 3) - Flattened from dict structure
- `achievements` (top 1) - **BUT THIS FIELD IS NOT EXTRACTED FROM RESUME PARSER**

**Note:** `key_experiences` and `achievements` are referenced but not actually populated from the resume parser output. They would need to be computed from `experience[]` and `awards[]`.

### 3.5 Commonality Detection

**Function:** `backend/app/utils/meeting_prep.py::detect_commonality()`

**Checks:**
1. **University** (strongest): Compares `user_info.university` with `contact.College` + `contact.EducationTop`
2. **Hometown**: Compares `extract_hometown_from_resume(resume_text)` with `contact.City`
3. **Company**: Compares `extract_companies_from_resume(resume_text)` with `contact.Company`

**Returns:**
- `commonality_type`: "university" | "hometown" | "company" | "general"
- `commonality_details`: Dict with specific details (e.g., `{'university': 'USC'}`)

### 3.6 Final Prompt Construction

**Location:** `batch_generate_emails()` lines 228-335

**Sections:**
1. **ABOUT THE SENDER:**
   - Name, University (shorthand), Major, Year
   - `resume_context` (key experiences, skills, achievements) - **BUT THESE ARE NOT POPULATED**

2. **TARGET ROLE CONTEXT** (if `fit_context` provided):
   - Job title, company, fit score, match level
   - Pitch, talking points, strengths, keywords

3. **CONTACTS:**
   - `contact_contexts` (one per contact)

---

## 4. ANCHOR CANDIDATES

### 4.1 Strong Anchor Candidates (High Reliability + High Value)

| Field | Source | Why It's Safe | Example Usage |
|-------|--------|---------------|---------------|
| `contact.Company` | PDL | Always present, exact match | "I noticed you work at Google..." |
| `contact.Title` | PDL | Always present, specific | "As a Senior Software Engineer..." |
| `contact.FirstName` | PDL | Always present | "Hi John," |
| `contact.College` | PDL | High reliability, strong connection | "Fellow USC alum..." |
| `user_info.education.university` | Resume | High reliability | "As a USC student..." |
| `user_info.experience[].company` | Resume | High reliability, exact match | "I also interned at Google..." |
| `user_info.experience[].title` | Resume | High reliability | "As a Software Engineering Intern..." |

### 4.2 Medium Anchor Candidates (Medium Reliability)

| Field | Source | Why It's Medium | Example Usage |
|-------|--------|-----------------|---------------|
| `contact.City` | PDL | Often present but may be missing | "Based in San Francisco..." |
| `contact.State` | PDL | Often present but may be missing | "California-based..." |
| `user_info.experience[].bullets[]` | Resume | High reliability but long | "Your experience with [specific project]..." |
| `user_info.skills.programming_languages[]` | Resume | High reliability | "Given your Python experience..." |
| `contact.WorkSummary` | PDL (constructed) | Medium reliability, constructed | "Your background at Google and Microsoft..." |

### 4.3 Weak Anchor Candidates (Low Reliability or Risky)

| Field | Source | Why It's Weak | Risk |
|-------|--------|--------------|------|
| `contact.Phone` | PDL | Often missing | Low risk, just missing |
| `contact.PersonalEmail` | PDL | Often missing | Low risk, just missing |
| `contact.VolunteerHistory` | PDL | Often missing | Low risk, just missing |
| `contact.LinkedInConnections` | PDL | Often missing, not meaningful | Low value |
| `user_info.achievements[]` | Resume | Not currently extracted | Would need extraction |
| `user_info.extracurriculars[]` | Resume | Often missing | Low risk, just missing |

---

## 5. DEBUG UTILITY

### 5.1 How to Use

**File:** `backend/app/services/reply_generation.py`

**Enable Debug:**
```python
DEBUG_EMAIL_DATA_INSPECTION = True  # Set to True
```

**What It Does:**
- Prints full contact object (first contact only)
- Prints full sender/user object
- Prints exact `contact_context` text sent to LLM
- Prints commonality detection results
- Prints fit context (if available)

**Output Location:** Console logs when `batch_generate_emails()` is called

**Security:** Automatically redacts emails and phone numbers

### 5.2 Removing Debug Code

After inspection, remove:
1. The `DEBUG_EMAIL_DATA_INSPECTION` flag
2. The `_debug_print_email_data()` function
3. The debug call in the contact loop

---

## 6. FINDINGS & RECOMMENDATIONS

### 6.1 Key Findings

1. **Rich Data Available but Underutilized:**
   - Full PDL `experience[]` array available but only current job used
   - Full resume `experience[]` array available but only top 2 used (and not properly extracted)
   - PDL `education[]` array available but only primary school used
   - Skills structured by category but only top 3 used

2. **Missing Computations:**
   - `key_experiences` referenced but not extracted from resume parser
   - `achievements` referenced but not extracted from resume parser
   - These fields would need to be computed from `experience[]` and `awards[]`

3. **Unused High-Value Fields:**
   - `contact.WorkSummary` - Full employment history
   - `contact.VolunteerHistory` - Volunteer work
   - `user_info.experience[].bullets[]` - Detailed experience bullets
   - `user_info.projects[]` - Full project descriptions
   - PDL `experience[]` array - Full employment history with dates

4. **Anchor Opportunities:**
   - Company names (both contact and sender) - **STRONG**
   - Job titles (both contact and sender) - **STRONG**
   - Universities (both contact and sender) - **STRONG**
   - Specific experience bullets (sender) - **MEDIUM**
   - Skills overlap (both contact and sender) - **MEDIUM**

### 6.2 Recommendations for Anchor Implementation

1. **Start with Strong Anchors:**
   - Company names (exact match)
   - Job titles (exact or similar)
   - Universities (exact match)

2. **Add Medium Anchors:**
   - Shared skills (if both have Python, mention it)
   - Experience overlap (if sender worked at contact's company)
   - Location (if both in same city)

3. **Avoid Weak Anchors:**
   - Phone numbers, personal emails (often missing)
   - Volunteer history (often missing)
   - LinkedIn connections (not meaningful)

4. **Extract Missing Fields:**
   - Compute `key_experiences` from `experience[]` array
   - Compute `achievements` from `awards[]` array
   - Use full `experience[].bullets[]` for detailed personalization

---

## 7. DATA RELIABILITY SUMMARY

### Contact Data Reliability
- **High (90%+):** FirstName, LastName, Title, Company, College
- **Medium (50-90%):** Email, City, State, EducationTop, WorkSummary
- **Low (<50%):** Phone, PersonalEmail, VolunteerHistory, LinkedInConnections

### Sender Data Reliability
- **High (90%+):** name, university, major, year, experience[], skills
- **Medium (50-90%):** projects[], coursework, location
- **Low (<50%):** achievements, extracurriculars, certifications, publications

---

## 8. NEXT STEPS

1. ✅ **COMPLETE:** Data inspection and documentation
2. ⏳ **PENDING:** Enable debug utility and test with real data
3. ⏳ **PENDING:** Design anchor-based logic using strong anchors
4. ⏳ **PENDING:** Implement anchor extraction and matching
5. ⏳ **PENDING:** Test anchor logic with various contact/sender combinations
6. ⏳ **PENDING:** Remove debug utility after implementation

---

**END OF INSPECTION REPORT**

