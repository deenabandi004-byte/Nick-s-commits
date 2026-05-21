"""
Production resume parser - zero hallucination design.
Rules-first, LLM for structure only, reconstruct from original text.
"""

import re
import json
import logging
import time
from typing import Dict, List, Optional, Tuple, Any
from difflib import get_close_matches

logger = logging.getLogger(__name__)


# ============================================================
# CONSTANTS
# ============================================================

SECTION_PATTERNS = [
    ("leadership_experience", re.compile(
        r'^(?:leadership\s+experience|leadership\s+&\s+activities|leadership)s?\s*$', re.IGNORECASE)),
    ("activities", re.compile(
        r'^(?:activities?\s*(?:&\s*interests?)?|interests?\s*(?:&\s*activities?)?|'
        r'extra\s*curricular|extracurricular(?:\s+activities?)?(?:s|\s+activities)?|'
        r'clubs?\s*(?:&\s*organizations?)?|'
        r'volunteer(?:ing)?\s*(?:experience|work)?)\s*$', re.IGNORECASE)),
    ("education", re.compile(r'^education\s*$', re.IGNORECASE)),
    ("experience", re.compile(
        r'^(?:(?:work|professional|relevant)\s+)?experience\s*$', re.IGNORECASE)),
    ("projects", re.compile(
        r'^(?:(?:personal|academic|selected|relevant)\s+)?(?:projects?\s*(?:and\s+research)?|research)\s*$', re.IGNORECASE)),
    ("skills", re.compile(
        r'^(?:(?:technical|core|key|relevant)\s+)?skills?\s*$', re.IGNORECASE)),
    ("certifications", re.compile(
        r'^(?:certifications?|licenses?\s*(?:&\s*certifications?)?)\s*$', re.IGNORECASE)),
    ("summary", re.compile(
        r'^(?:summary|objective|profile|about(?:\s+me)?)\s*$', re.IGNORECASE)),
    ("awards", re.compile(
        r'^(?:awards?|honors?|achievements?)\s*(?:&\s*(?:honors?|awards?))?\s*$', re.IGNORECASE)),
    ("publications", re.compile(r'^publications?\s*$', re.IGNORECASE)),
    ("coursework", re.compile(r'^(?:relevant\s+)?coursework\s*$', re.IGNORECASE)),
]

BULLET_MARKERS = re.compile(r'^[\s]*[•◦▪▸▹►▻‣⁃\-– - \*]\s*')
NUMBERED_BULLET = re.compile(r'^[\s]*\d+[.)]\s+')

DATE_PATTERN = re.compile(
    r'(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|'
    r'Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|'
    r'Dec(?:ember)?)[.\s]*\d{4})',
    re.IGNORECASE
)
YEAR_PATTERN = re.compile(r'\b20\d{2}\b')
DATE_RANGE_PATTERN = re.compile(
    r'(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z.]*\s*\d{4}|'
    r'\d{4}|Present|Current|Ongoing)'
    r'\s*[-– - to]+\s*'
    r'(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z.]*\s*\d{4}|'
    r'\d{4}|Present|Current|Ongoing)',
    re.IGNORECASE
)


# ============================================================
# LINE PREPROCESSING
# ============================================================

def preprocess_lines(raw_text: str) -> List[Dict]:
    """Split raw text into lines and merge bullet continuations."""
    raw_lines = raw_text.split('\n')
    processed = []

    for i, line in enumerate(raw_lines):
        stripped = line.rstrip()
        if not stripped:
            continue

        # Skip lines that are ONLY a bullet marker with no content (e.g. standalone "•")
        clean_of_markers = BULLET_MARKERS.sub('', stripped).strip()
        if not clean_of_markers:
            continue

        is_bullet = bool(BULLET_MARKERS.match(stripped) or NUMBERED_BULLET.match(stripped))
        is_header = _is_section_header(stripped)

        # Check if this line is a continuation of the previous line
        if (not is_bullet and not is_header and processed and
                not _looks_like_new_entry(stripped) and
                not _is_section_header(stripped)):
            prev = processed[-1]
            starts_lowercase = stripped.strip()[0].islower() if stripped.strip() else False
            prev_ends_incomplete = not prev['text'].rstrip().endswith(('.', ';', '!', '?'))

            # Merge if: starts lowercase, or previous bullet ended mid-sentence
            if starts_lowercase or (prev['is_bullet'] and prev_ends_incomplete):
                prev['text'] = prev['text'].rstrip() + ' ' + stripped.strip()
                prev['original_line_nums'].append(i + 1)
                continue

        clean_text = BULLET_MARKERS.sub('', stripped).strip() if is_bullet else stripped.strip()

        processed.append({
            'text': clean_text,
            'raw_text': stripped,
            'original_line_nums': [i + 1],
            'is_bullet': is_bullet,
            'is_header': is_header,
            'line_index': len(processed),
        })

    return processed


def _is_section_header(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False
    for _, pattern in SECTION_PATTERNS:
        if pattern.match(stripped):
            return True
    if (stripped.isupper() and len(stripped) < 40 and
            not BULLET_MARKERS.match(stripped) and
            not any(c.isdigit() for c in stripped)):
        return True
    return False


def _looks_like_new_entry(line: str) -> bool:
    stripped = line.strip()
    if DATE_RANGE_PATTERN.search(stripped):
        return True
    if (not BULLET_MARKERS.match(stripped) and stripped and stripped[0].isupper() and '|' in stripped):
        return True
    return False


# ============================================================
# RULE-BASED SECTION DETECTION
# ============================================================

def detect_sections_rule_based(lines: List[Dict]) -> Tuple[Dict[str, List[int]], float]:
    """Detect sections using regex patterns on headers."""
    sections = {}
    current_section = 'header'
    sections['header'] = []

    for i, line in enumerate(lines):
        text = line['text']
        raw = line.get('raw_text', text)

        matched_section = None
        for section_name, pattern in SECTION_PATTERNS:
            if pattern.match(text.strip()) or pattern.match(raw.strip()):
                matched_section = section_name
                break

        if not matched_section and raw.strip().isupper() and len(raw.strip()) < 40:
            upper_text = raw.strip().upper()
            caps_map = {
                'EDUCATION': 'education',
                'EXPERIENCE': 'experience',
                'WORK EXPERIENCE': 'experience',
                'PROFESSIONAL EXPERIENCE': 'experience',
                'PROJECTS': 'projects',
                'PROJECTS AND RESEARCH': 'projects',
                'RESEARCH': 'projects',
                'SKILLS': 'skills',
                'TECHNICAL SKILLS': 'skills',
                'LEADERSHIP': 'leadership_experience',
                'LEADERSHIP EXPERIENCE': 'leadership_experience',
                'ACTIVITIES': 'activities',
                'ACTIVITIES & INTERESTS': 'activities',
                'EXTRA CURRICULAR': 'activities',
                'EXTRACURRICULAR': 'activities',
                'EXTRACURRICULAR ACTIVITIES': 'activities',
                'EXTRACURRICULARS': 'activities',
                'CERTIFICATIONS': 'certifications',
                'AWARDS': 'awards',
                'HONORS': 'awards',
                'SUMMARY': 'summary',
                'OBJECTIVE': 'summary',
                'RELEVANT COURSEWORK': 'coursework',
            }
            matched_section = caps_map.get(upper_text)

        if matched_section:
            current_section = matched_section
            if current_section not in sections:
                sections[current_section] = []
            continue

        if current_section not in sections:
            sections[current_section] = []
        sections[current_section].append(i)

    total_content_lines = len([l for l in lines if not l['is_header']])
    assigned_lines = sum(len(indices) for name, indices in sections.items() if name != 'header')
    confidence = assigned_lines / max(total_content_lines, 1)
    key_sections = {'education', 'experience', 'skills'}
    found_key = sum(1 for s in key_sections if s in sections and sections[s])
    confidence = min(1.0, confidence * (0.7 + 0.1 * found_key))

    logger.info(f"[ResumeParserV2] Rule-based detection: {len(sections)} sections, "
                f"confidence: {confidence:.2f}, sections found: {list(sections.keys())}")

    return sections, confidence


# ============================================================
# LLM FALLBACK - LINE-BY-LINE CLASSIFICATION
# ============================================================

async def classify_lines_with_llm(lines: List[Dict]) -> Dict[str, List[int]]:
    """Fallback: LLM classifies each line into a section. LLM never returns content."""
    from app.services.openai_client import get_async_openai_client

    numbered_text = '\n'.join(
        f"{i+1}: {line['text'][:120]}" for i, line in enumerate(lines)
    )
    total_lines = len(lines)

    system_prompt = """You are a resume structure classifier.
You are NOT allowed to rewrite, summarize, modify, or infer any resume content.
Your ONLY job is to assign each numbered line to exactly one section.
You must assign EVERY line number from 1 to {total_lines} exactly once.
Return ONLY valid JSON - no markdown, no explanation.""".format(total_lines=total_lines)

    user_prompt = f"""Classify each line of this resume into sections.

The resume has {total_lines} numbered lines. Assign each line number to exactly
one section. Every number from 1 to {total_lines} must appear exactly once.

RESUME:
{numbered_text}

Return this JSON format:
{{
  "name_lines": [],
  "contact_lines": [],
  "summary_lines": [],
  "education_lines": [],
  "experience": [
    {{ "header_lines": [], "bullet_lines": [] }}
  ],
  "projects": [
    {{ "header_lines": [], "description_lines": [] }}
  ],
  "skills_lines": [],
  "leadership_lines": [],
  "activities_lines": [],
  "awards_lines": [],
  "certifications_lines": [],
  "other_lines": []
}}

RULES:
- Every number from 1 to {total_lines} must appear exactly once
- No duplicates, no missing numbers
- Each experience entry is a separate job/role
- Each project entry is a separate project
- Return ONLY JSON"""

    client = get_async_openai_client()
    if not client:
        return {}

    try:
        start_time = time.time()
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            max_tokens=4000,
            temperature=0.0,
        )
        elapsed = time.time() - start_time
        logger.info(f"[ResumeParserV2] LLM classification took {elapsed:.1f}s")

        result_text = response.choices[0].message.content.strip()
        result_text = re.sub(r'^```(?:json)?\s*\n?', '', result_text)
        result_text = re.sub(r'\n?```\s*$', '', result_text)
        structure = json.loads(result_text)
        _validate_llm_structure(structure, total_lines)
        return _convert_llm_structure_to_sections(structure)

    except Exception as e:
        logger.error(f"[ResumeParserV2] LLM classification failed: {type(e).__name__}: {e}")
        return {}


def _validate_llm_structure(structure: dict, total_lines: int):
    assigned = set()

    def collect_numbers(obj):
        if isinstance(obj, list):
            for item in obj:
                if isinstance(item, int):
                    assigned.add(item)
                elif isinstance(item, dict):
                    for v in item.values():
                        collect_numbers(v)
        elif isinstance(obj, dict):
            for v in obj.values():
                collect_numbers(v)

    collect_numbers(structure)
    expected = set(range(1, total_lines + 1))
    missing = expected - assigned
    extra = assigned - expected
    if missing:
        logger.warning(f"[ResumeParserV2] LLM missed lines: {sorted(missing)}")
    if extra:
        logger.warning(f"[ResumeParserV2] LLM invalid line numbers: {sorted(extra)}")
    coverage = len(assigned & expected) / total_lines
    if coverage < 0.8:
        raise ValueError(f"LLM structure coverage too low: {coverage:.1%}")


def _convert_llm_structure_to_sections(structure: dict) -> Dict[str, List[int]]:
    sections = {}
    simple_mappings = {
        'name_lines': 'header', 'contact_lines': 'header', 'summary_lines': 'summary',
        'education_lines': 'education', 'skills_lines': 'skills',
        'leadership_lines': 'leadership_experience', 'activities_lines': 'activities',
        'awards_lines': 'awards', 'certifications_lines': 'certifications', 'other_lines': 'other',
    }
    for key, section_name in simple_mappings.items():
        if key in structure and structure[key]:
            if section_name not in sections:
                sections[section_name] = []
            sections[section_name].extend([n - 1 for n in structure[key] if isinstance(n, int)])

    for key, section_name in [('experience', 'experience'), ('projects', 'projects')]:
        if key in structure and structure[key]:
            if section_name not in sections:
                sections[section_name] = []
            for entry in structure[key]:
                if isinstance(entry, dict):
                    for line_nums in entry.values():
                        if isinstance(line_nums, list):
                            sections[section_name].extend([n - 1 for n in line_nums if isinstance(n, int)])

    for section_name in sections:
        sections[section_name] = sorted(set(sections[section_name]))
    return sections


# ============================================================
# FIELD PARSING - FROM ORIGINAL LINES ONLY
# ============================================================

def parse_header(lines: List[Dict], header_indices: List[int]) -> Dict:
    """Parse name and contact from header lines."""
    if not header_indices:
        return {'name': '', 'contact': {}}

    header_lines = [lines[i]['text'] for i in header_indices if i < len(lines)]
    all_header_text = ' '.join(header_lines)
    contact = {}

    email_match = re.search(r'[\w.+-]+@[\w-]+\.[\w.-]+', all_header_text)
    if email_match:
        contact['email'] = email_match.group()

    phone_match = re.search(r'[\+]?1?[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4}', all_header_text)
    if phone_match:
        contact['phone'] = phone_match.group().strip()

    linkedin_match = re.search(r'linkedin\.com/in/[\w-]+', all_header_text, re.IGNORECASE)
    if linkedin_match:
        contact['linkedin'] = linkedin_match.group()

    github_match = re.search(r'github\.com/[\w-]+', all_header_text, re.IGNORECASE)
    if github_match:
        contact['github'] = github_match.group()

    location_match = re.search(r'([A-Z][a-z]+(?:\s[A-Z][a-z]+)?,\s*[A-Z]{2})\b', all_header_text)
    if location_match:
        contact['location'] = location_match.group(1)

    # Name: first header line, stripped of anything after contact-info keywords or inline contact data
    name_line = header_lines[0] if header_lines else ''
    name_line = re.split(r'\s*(?:Email|email|E-mail|Phone|Mobile|Tel|LinkedIn|github)', name_line)[0]
    name_line = re.sub(r'[\w.+-]+@[\w-]+\.[\w.-]+', '', name_line)
    name_line = re.sub(r'[\+]?1?[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4}', '', name_line)
    name_line = re.sub(r'\s*[|]\s*', ' ', name_line)
    name_line = re.sub(r'\s+', ' ', name_line).strip()

    for key in ('email', 'phone', 'location', 'linkedin', 'github', 'website'):
        if key not in contact:
            contact[key] = ''

    return {'name': name_line, 'contact': contact}


def parse_education(lines: List[Dict], indices: List[int]) -> List[Dict]:
    """Parse education entries. Output uses university, graduation for schema compatibility."""
    if not indices:
        return []

    section_lines = [lines[i] for i in indices if i < len(lines)]
    entries = []
    current_entry = None
    collecting_coursework = False

    for line in section_lines:
        text = line['text']
        # NOTE: has_coursework uses '\s*:' so it only matches "Coursework:" etc. not free text.
        # It must be checked BEFORE has_degree to prevent "Coursework: ..." from
        # being misidentified as a degree line.
        has_school = bool(re.search(r'(?:University|College|Institute|School|Academy)', text, re.IGNORECASE))
        has_coursework = bool(re.search(
            r'(?:coursework|courses?\s*taken|relevant\s*courses)\s*:',
            text, re.IGNORECASE
        ))
        has_degree = bool(re.search(
            r'(?:Bachelor|Master|Ph\.?D|B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?A\.?|Associate|Doctor)',
            text, re.IGNORECASE
        ))
        has_year = bool(YEAR_PATTERN.search(text))
        has_gpa = bool(re.search(r'GPA', text, re.IGNORECASE))

        logger.info(
            f"[ResumeParserV2] Education line: '{text[:80]}' "
            f"bullet={line['is_bullet']} school={has_school} coursework={has_coursework} "
            f"degree={has_degree} year={has_year} gpa={has_gpa}"
        )

        # Bullet lines following a "Courses taken:" (or similar) header are coursework items
        if collecting_coursework and line['is_bullet'] and current_entry:
            items = [c.strip() for c in text.split(',') if c.strip()]
            current_entry['coursework'].extend(items)
            logger.info(f"[ResumeParserV2] → COURSEWORK (bullets): {items}")
            continue
        if collecting_coursework and not line['is_bullet']:
            collecting_coursework = False

        if has_school:
            if current_entry:
                entries.append(current_entry)
            current_entry = {
                'university': '', 'degree': '', 'major': '', 'graduation': '',
                'gpa': '', 'location': '', 'coursework': [], 'honors': [], 'details': []
            }
            parts = re.split(r'\s*[|]\s*', text)
            current_entry['university'] = parts[0].strip()
            for part in parts[1:]:
                if YEAR_PATTERN.search(part):
                    current_entry['graduation'] = part.strip()
                elif re.search(r'[A-Z][a-z]+,?\s*[A-Z]{2}', part.strip()):
                    current_entry['location'] = part.strip()
            # Extract graduation date from school line (e.g. "USC, Los Angeles, CA  Expected Graduation: Dec 2025")
            date_match = re.search(
                r'((?:Expected\s+)?(?:Graduation\s*:?\s*)?(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z.]*\s+)?\d{4})',
                text, re.IGNORECASE
            )
            if date_match and not current_entry['graduation']:
                current_entry['graduation'] = date_match.group().strip()
                # Strip the date from the school name
                current_entry['university'] = text[:date_match.start()].strip().rstrip(',').strip()
            logger.info(f"[ResumeParserV2] → SCHOOL: {current_entry['university']}")

        elif has_coursework and current_entry:
            # Strip everything up to and including the coursework label
            coursework_text = re.sub(
                r'^.*?(?:coursework|courses?\s*taken|relevant\s*courses)\s*:\s*',
                '', text, flags=re.IGNORECASE
            )
            if coursework_text.strip():
                current_entry['coursework'] = [c.strip() for c in coursework_text.split(',') if c.strip()]
            collecting_coursework = True  # Next bullet lines are coursework items
            logger.info(f"[ResumeParserV2] → COURSEWORK: {current_entry['coursework']}")

        elif has_degree and current_entry and not current_entry['degree']:
            current_entry['degree'] = text.strip()
            if has_year and not current_entry['graduation']:
                date_match = re.search(
                    r'((?:Expected\s+)?(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z.]*\s+)?\d{4})',
                    text, re.IGNORECASE
                )
                if date_match:
                    current_entry['graduation'] = date_match.group().strip()
            logger.info(f"[ResumeParserV2] → DEGREE: {current_entry['degree']}, graduation: {current_entry['graduation']}")

        elif has_gpa and current_entry:
            gpa_match = re.search(r'GPA:?\s*([\d.]+)', text, re.IGNORECASE)
            if gpa_match:
                current_entry['gpa'] = gpa_match.group(1)
            logger.info(f"[ResumeParserV2] → GPA: {current_entry.get('gpa')}")

        elif current_entry:
            if has_year and not current_entry['graduation']:
                current_entry['graduation'] = text.strip()
                logger.info(f"[ResumeParserV2] → DATES: {text.strip()}")
            else:
                current_entry['details'].append(text)
                logger.info(f"[ResumeParserV2] → DETAIL: {text[:60]}")

        else:
            current_entry = {
                'university': text.strip(), 'degree': '', 'major': '', 'graduation': '',
                'gpa': '', 'location': '', 'coursework': [], 'honors': [], 'details': []
            }
            logger.info(f"[ResumeParserV2] → NEW ENTRY (fallback): {text[:60]}")

    if current_entry:
        entries.append(current_entry)

    result = [
        {
            'university': e.get('university', ''),
            'degree': e.get('degree', ''),
            'major': e.get('major', ''),
            'graduation': e.get('graduation', ''),
            'gpa': e.get('gpa', ''),
            'location': e.get('location', ''),
            'coursework': e.get('coursework', []),
            'honors': e.get('honors', []),
        }
        for e in entries
    ]
    logger.info(f"[ResumeParserV2] Education result: {json.dumps(result)[:400]}")
    return result


def _new_experience_entry() -> Dict:
    return {'title': '', 'company': '', 'dates': '', 'location': '', 'bullets': []}


def _looks_like_role_header(text: str) -> bool:
    if '|' in text:
        return True
    if len(text) < 80 and text and text[0].isupper() and not BULLET_MARKERS.match(text):
        # Use word boundaries so "engineering" doesn't match "engineer". Role titles are whole words.
        role_pattern = re.compile(
            r'\b(?:intern|engineer|developer|analyst|assistant|manager|lead|director|'
            r'founder|tutor|instructor|researcher|consultant|coordinator|president|vice)\b',
            re.IGNORECASE
        )
        if role_pattern.search(text):
            return True
    return False


def _looks_like_company(text: str) -> bool:
    """Check if text looks like a company/org name."""
    clean = BULLET_MARKERS.sub('', text).strip()
    if not clean or len(clean) > 100:
        return False

    org_words = ['inc', 'corp', 'llc', 'ltd', 'university', 'institute', 'center',
                 'foundation', 'company', 'technologies', 'consulting', 'services',
                 'supercomputing', 'laboratory', 'labs', 'research', 'group',
                 'hospital', 'clinic', 'agency', 'department', 'bureau']
    if any(w in clean.lower() for w in org_words):
        return True

    action_verbs = ['built', 'designed', 'developed', 'created', 'implemented', 'led',
                    'managed', 'conducted', 'performed', 'analyzed', 'engineered',
                    'optimized', 'deployed', 'automated', 'refactored', 'provided',
                    'collaborated', 'coordinated', 'instructed', 'delivered',
                    'log', 'support', 'track', 'handle', 'resolve', 'maintain']
    words = clean.split()
    first_word = words[0].lower() if words else ''

    if len(clean) < 60 and first_word not in action_verbs:
        return True

    return False


def _parse_entry_header(entry: dict, text: str):
    """Parse title and dates from an entry header line, modifying entry in place."""
    date_match = DATE_RANGE_PATTERN.search(text)
    if date_match:
        entry['dates'] = date_match.group().strip()
        text = (text[:date_match.start()] + text[date_match.end():]).strip()
    else:
        date_match = DATE_PATTERN.search(text)
        if date_match:
            entry['dates'] = date_match.group().strip()
            text = (text[:date_match.start()] + text[date_match.end():]).strip()

    parts = [p.strip() for p in re.split(r'\s*[|]\s*', text) if p.strip()]
    if parts:
        entry['title'] = parts[0]
        for part in parts[1:]:
            if re.search(r'[A-Z][a-z]+,\s*[A-Z]{2}', part):
                entry['location'] = part
            elif not entry['company']:
                entry['company'] = part


def parse_experience(lines: List[Dict], indices: List[int]) -> List[Dict]:
    """Parse experience entries from section lines."""
    if not indices:
        return []

    section_lines = [lines[i] for i in indices if i < len(lines)]
    entries = []
    current_entry = None
    i = 0

    while i < len(section_lines):
        line = section_lines[i]
        text = line['text']
        has_date = bool(DATE_RANGE_PATTERN.search(text) or DATE_PATTERN.search(text))

        if line['is_bullet'] and not has_date and not _looks_like_role_header(text):
            # Regular bullet - check if it could be a company name (no title yet)
            if current_entry and not current_entry['company'] and _looks_like_company(text):
                current_entry['company'] = text.strip()
            elif current_entry is not None:
                current_entry['bullets'].append(text)
            else:
                current_entry = _new_experience_entry()
                current_entry['bullets'].append(text)

        elif has_date or _looks_like_role_header(text):
            if current_entry and (current_entry['bullets'] or current_entry['title']):
                entries.append(current_entry)

            # If current entry has company but no title, this line is the title for that entry
            if (current_entry and current_entry['company'] and
                    not current_entry['title'] and not current_entry['bullets']):
                _parse_entry_header(current_entry, text)
            else:
                current_entry = _new_experience_entry()
                _parse_entry_header(current_entry, text)

                # Peek ahead: next non-bullet line with no date might be the company name
                if i + 1 < len(section_lines):
                    next_line = section_lines[i + 1]
                    next_text = next_line['text'].strip()
                    next_has_date = bool(DATE_RANGE_PATTERN.search(next_text) or DATE_PATTERN.search(next_text))

                    if not next_has_date and not _looks_like_role_header(next_text) and _looks_like_company(next_text):
                        current_entry['company'] = BULLET_MARKERS.sub('', next_text).strip()
                        i += 1  # consume the company line

        else:
            # Non-bullet line - could be continuation bullet (lost marker), location, company, or new entry
            # If current entry has bullets and this doesn't look like a new header, treat as continuation
            looks_like_company = _looks_like_company(text)
            looks_like_role = bool(re.search(
                r'\b(?:intern|engineer|developer|manager|assistant|analyst|tutor|instructor|'
                r'president|coordinator|director|lead|associate|consultant|researcher|specialist)\b',
                text, re.IGNORECASE
            ))
            has_dash_separator = bool(re.search(r'\s+[– - -]\s+', text))

            # Continuation: entry has bullets, or has title (first bullet lost its marker)
            has_content = current_entry and (current_entry['bullets'] or current_entry['title'])
            is_continuation = (
                has_content and
                not has_date and not looks_like_company and
                not looks_like_role and not has_dash_separator
            )
            if is_continuation:
                current_entry['bullets'].append(text.strip())
                logger.info(f"[ResumeParserV2] → CONTINUATION BULLET: {text[:60]}")
                i += 1
                continue

            # Location line (e.g. "San Diego, CA") - only if line doesn't look like new entry
            location_match = re.search(r'[A-Z][a-z]+,\s*[A-Z]{2}', text)
            if (current_entry and not current_entry['location'] and location_match and
                    not has_dash_separator):
                current_entry['location'] = text.strip()
            else:
                # Start new entry - this line is company or title
                if current_entry and (current_entry['bullets'] or current_entry['title']):
                    entries.append(current_entry)

                current_entry = _new_experience_entry()
                if i + 1 < len(section_lines):
                    next_line = section_lines[i + 1]
                    next_has_date = bool(
                        DATE_RANGE_PATTERN.search(next_line['text']) or
                        DATE_PATTERN.search(next_line['text'])
                    )
                    if next_has_date:
                        current_entry['company'] = text.strip()
                    else:
                        if _looks_like_company(text):
                            current_entry['company'] = text.strip()
                        else:
                            current_entry['title'] = text.strip()
                else:
                    current_entry['title'] = text.strip()

        i += 1

    if current_entry and (current_entry['bullets'] or current_entry['title']):
        entries.append(current_entry)
    return entries


def parse_projects(lines: List[Dict], indices: List[int]) -> List[Dict]:
    """Parse project entries. Handles both bullet-style (each bullet = project) and header-style.
    Output uses name, description, technologies, date, link for schema."""
    if not indices:
        return []

    section_lines = [lines[i] for i in indices if i < len(lines)]
    entries = []

    for line in section_lines:
        text = line['text']
        if line.get('is_header'):
            continue
        # Bullet-style: "• Wordle Solver and Scheduler: Created an innovative..."
        if ':' in text:
            parts = text.split(':', 1)
            name = parts[0].strip()
            desc = parts[1].strip()
            entries.append({
                'name': name,
                'description': desc,
                'technologies': '',
                'date': '',
                'link': '',
            })
        else:
            entries.append({
                'name': text.strip(),
                'description': '',
                'technologies': '',
                'date': '',
                'link': '',
            })

    return entries


def parse_skills(lines: List[Dict], indices: List[int]) -> Dict[str, List[str]]:
    """Parse skills section. Returns dict of category -> list of strings.
    Category names are kept verbatim from the resume (e.g. 'Languages', 'Frameworks & Web').
    """
    if not indices:
        return {}

    section_lines = [lines[i] for i in indices if i < len(lines)]
    skills = {}
    current_category = 'General'

    for line in section_lines:
        text = line['text']
        logger.info(f"[ResumeParserV2] Skills line: '{text[:80]}'")

        if ':' in text:
            parts = text.split(':', 1)
            # Preserve original casing and spacing - the PDF renderer iterates dynamically
            category = parts[0].strip()
            items_text = parts[1].strip()
            if items_text:
                items = [s.strip() for s in items_text.split(',') if s.strip()]
                skills[category] = items
                logger.info(f"[ResumeParserV2] → SKILL CATEGORY '{category}': {len(items)} items")
            else:
                current_category = category
                if current_category not in skills:
                    skills[current_category] = []
        else:
            items = [s.strip() for s in text.split(',') if s.strip()]
            if current_category not in skills:
                skills[current_category] = []
            skills[current_category].extend(items)

    logger.info(f"[ResumeParserV2] Skills result: {list(skills.keys())}")
    return skills


def parse_activities(lines: List[Dict], indices: List[int]) -> List[Dict]:
    """Parse activities/leadership. Output uses organization, role, dates, description.

    Each bullet line is treated as a separate entry (common in leadership sections where
    each role is listed as '• Role - Organization: description text').
    Non-bullet lines are treated as standalone entries or continuations.
    """
    if not indices:
        return []

    section_lines = [lines[i] for i in indices if i < len(lines)]
    entries = []
    current_entry = None

    for line in section_lines:
        text = line['text']
        logger.info(f"[ResumeParserV2] Activity line: bullet={line['is_bullet']} '{text[:80]}'")

        if line['is_bullet']:
            # Each bullet = its own activity entry
            if current_entry:
                entries.append(current_entry)
            current_entry = {'role': '', 'organization': '', 'description': '', 'dates': ''}

            # Parse "Role - Organization: Description" or "Role - Organization"
            parsed = False
            for sep in [' - ', '–', ' - ']:
                if sep in text:
                    head, rest = text.split(sep, 1)
                    current_entry['role'] = head.strip()
                    rest = rest.strip()
                    if ':' in rest:
                        org, desc = rest.split(':', 1)
                        current_entry['organization'] = org.strip()
                        current_entry['description'] = desc.strip()
                    else:
                        current_entry['organization'] = rest
                    parsed = True
                    break

            if not parsed:
                # No separator - treat the whole text as description
                current_entry['description'] = text

            logger.info(
                f"[ResumeParserV2] → ACTIVITY: role='{current_entry['role']}' "
                f"org='{current_entry['organization']}'"
            )

        else:
            # Non-bullet: start new entry or append to previous description
            if current_entry and not current_entry['role'] and not current_entry['organization']:
                current_entry['description'] = (current_entry.get('description', '') + ' ' + text).strip()
            else:
                if current_entry:
                    entries.append(current_entry)
                current_entry = {'role': '', 'organization': '', 'description': '', 'dates': ''}
                for sep in [' - ', '–', '|', ' - ']:
                    if sep in text:
                        parts = text.split(sep, 1)
                        current_entry['role'] = parts[0].strip()
                        current_entry['organization'] = parts[1].strip()
                        break
                else:
                    current_entry['role'] = text

    if current_entry:
        entries.append(current_entry)

    logger.info(f"[ResumeParserV2] Activities result: {len(entries)} entries")
    return entries


def parse_summary(lines: List[Dict], indices: List[int]) -> str:
    if not indices:
        return ''
    return ' '.join(lines[i]['text'] for i in indices if i < len(lines))


# ============================================================
# SNAP TO ORIGINAL - SAFETY NET
# ============================================================

def snap_to_original(parsed_info: dict, original_text: str) -> dict:
    """Ensure parsed content matches original text."""
    original_lines = [l.strip() for l in original_text.split('\n') if l.strip()]
    clean_originals = [BULLET_MARKERS.sub('', l).strip() for l in original_lines]

    for exp in parsed_info.get('experience', []):
        corrected = []
        for bullet in exp.get('bullets', []):
            matches = get_close_matches(bullet, clean_originals, n=1, cutoff=0.6)
            corrected.append(matches[0] if matches else bullet)
        exp['bullets'] = corrected

    for proj in parsed_info.get('projects', []):
        desc = proj.get('description', '')
        if desc:
            matches = get_close_matches(desc, clean_originals, n=1, cutoff=0.6)
            if matches:
                proj['description'] = matches[0]
        # Projects may have bullets list from parsing; snap if present
        if proj.get('bullets'):
            corrected = []
            for bullet in proj['bullets']:
                matches = get_close_matches(bullet, clean_originals, n=1, cutoff=0.6)
                corrected.append(matches[0] if matches else bullet)
            proj['bullets'] = corrected

    # Date correction: only log mismatches - do not auto-swap dates (causes false corrections).
    original_dates_set = set(DATE_PATTERN.findall(original_text))
    parsed_json_str = json.dumps(parsed_info)
    parsed_dates_set = set(DATE_PATTERN.findall(parsed_json_str))

    missing_from_parsed = original_dates_set - parsed_dates_set
    extra_in_parsed = parsed_dates_set - original_dates_set

    if missing_from_parsed:
        logger.warning(f"[ResumeParserV2] Dates in original but not in parsed: {missing_from_parsed}")
    if extra_in_parsed:
        logger.warning(f"[ResumeParserV2] Dates in parsed but not in original: {extra_in_parsed}")

    return parsed_info


# ============================================================
# VALIDATION
# ============================================================

def validate_parse(parsed_info: dict, original_text: str, lines: List[Dict]) -> List[str]:
    warnings = []
    original_dates = set(DATE_PATTERN.findall(original_text))
    parsed_json = json.dumps(parsed_info)
    for date in original_dates:
        if date not in parsed_json:
            warnings.append(f"Date '{date}' in original but missing from parsed")
    original_bullets = sum(1 for l in lines if l['is_bullet'])
    parsed_bullets = sum(len(exp.get('bullets', [])) for exp in parsed_info.get('experience', []))
    parsed_bullets += sum(len(proj.get('bullets', [])) for proj in parsed_info.get('projects', []))
    if original_bullets > 0 and parsed_bullets < original_bullets * 0.7:
        warnings.append(f"Original {original_bullets} bullets but parsed {parsed_bullets}")
    return warnings


# ============================================================
# MAIN PARSER
# ============================================================

def parse_resume_v2(resume_text: str) -> dict:
    """Main entry point. Synchronous wrapper."""
    import asyncio

    try:
        return asyncio.run(_parse_resume_async(resume_text))
    except Exception as e:
        logger.error(f"[ResumeParserV2] Parse failed: {type(e).__name__}: {e}")
        logger.info("[ResumeParserV2] Falling back to legacy parser")
        from app.utils.users import parse_resume_info_legacy
        return parse_resume_info_legacy(resume_text)


async def _parse_resume_async(resume_text: str) -> dict:
    start_time = time.time()
    lines = preprocess_lines(resume_text)
    logger.info(f"[ResumeParserV2] Preprocessed {len(lines)} lines from {len(resume_text)} chars")
    for i, line in enumerate(lines):
        logger.info(
            f"[ResumeParserV2] Line {i}: bullet={line['is_bullet']} "
            f"header={line['is_header']} text={line['text'][:100]}"
        )

    sections, confidence = detect_sections_rule_based(lines)

    used_llm = False
    if confidence < 0.85:
        logger.info(f"[ResumeParserV2] Rule-based confidence {confidence:.2f} < 0.85, using LLM fallback")
        llm_sections = await classify_lines_with_llm(lines)
        if llm_sections:
            sections = llm_sections
            used_llm = True
            logger.info(f"[ResumeParserV2] LLM fallback returned {len(llm_sections)} sections")
        else:
            logger.warning("[ResumeParserV2] LLM fallback failed, using rule-based result")

    header_info = parse_header(lines, sections.get('header', []))
    parsed = {
        'name': header_info['name'],
        'contact': header_info['contact'],
        'objective': parse_summary(lines, sections.get('summary', [])),
        'education': parse_education(lines, sections.get('education', [])),
        'experience': parse_experience(lines, sections.get('experience', [])),
        'projects': parse_projects(lines, sections.get('projects', [])),
        'skills': parse_skills(lines, sections.get('skills', [])),
        'extracurriculars': parse_activities(
            lines,
            sections.get('leadership_experience', []) + sections.get('activities', [])
        ),
        'certifications': [],
        'awards': [],
    }

    # Only snap when LLM was used - LLM may hallucinate/paraphrase content that needs
    # anchoring back to the original text. The rule-based parser uses original text
    # verbatim, so snapping only corrupts correctly merged multi-line bullets.
    if used_llm:
        parsed = snap_to_original(parsed, resume_text)
    warnings = validate_parse(parsed, resume_text, lines)
    for w in warnings:
        logger.warning(f"[ResumeParserV2] {w}")

    elapsed = time.time() - start_time
    logger.info(f"[ResumeParserV2] Parse complete in {elapsed:.1f}s - "
                f"{len(parsed.get('experience', []))} experiences, "
                f"{sum(len(e.get('bullets', [])) for e in parsed.get('experience', []))} bullets, "
                f"{len(parsed.get('projects', []))} projects")
    return parsed
