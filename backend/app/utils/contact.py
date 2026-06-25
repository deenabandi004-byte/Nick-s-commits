"""
Contact utilities - email cleaning, hometown extraction
"""
import html
import re
from app.services.openai_client import get_openai_client


def strip_dashes(text):
    """Replace em/en dashes with a comma so generated copy never ships a dash.

    Standing product rule: no em dashes (\u2014) or en dashes (\u2013) in
    user-facing email copy. A dash used mid-sentence becomes ", "; the cleanup
    passes then collapse the double spaces, double commas, and stray " ," the
    swap can leave behind. Single ASCII hyphens (real-world, check-in) are
    intentionally left alone.

    This is the dash chokepoint for generated email text: clean_email_text below
    calls it, and the recruiter email generator calls it on the finalized body,
    so both the HTML body and plain_body are covered in one place per generator.
    """
    if not text:
        return text
    # Fast path: nothing to do when there is no em/en dash present.
    if "\u2014" not in text and "\u2013" not in text:
        return text
    text = re.sub(r"\s*[\u2014\u2013]\s*", ", ", text)
    text = re.sub(r" {2,}", " ", text)            # doubled spaces
    text = re.sub(r",\s*,+", ", ", text)           # doubled commas
    text = re.sub(r"\s+,", ",", text)              # space before a comma
    text = re.sub(r",\s*([.!?])", r"\1", text)     # comma butting end punctuation
    return text


def clean_email_text(text):
    """Clean email text to remove problematic characters"""
    if not text:
        return ""

    # Decode HTML entities (e.g. &#39; -> ', &amp; -> &, etc.)
    text = html.unescape(text)

    # Em / en dashes are banned in user-facing copy. Convert them to commas
    # BEFORE the ASCII pass below so they never become "--"/"-" artifacts. See
    # strip_dashes for the policy. Single ASCII hyphens are preserved.
    text = strip_dashes(text)

    # Replace common Unicode characters with ASCII equivalents
    replacements = {
        '\u2019': "'",  # Right single quote
        '\u2018': "'",  # Left single quote
        '\u201C': '"',  # Left double quote
        '\u201D': '"',  # Right double quote
        '\u2026': '...',  # Ellipsis
        '\u00A0': ' ',  # Non-breaking space
        '\u00AD': '',   # Soft hyphen
        # Common corrupted UTF-8 sequences
        'â€™': "'",     # Corrupted apostrophe
        'â€œ': '"',     # Corrupted left quote
        'â€': '"',      # Corrupted right quote
        'â€"': '--',    # Corrupted em dash
        'â€"': '-',     # Corrupted en dash
        'Ã¢': '',       # Remove corrupted characters
        'â‚¬': '',
        'Å': '',
        '¸': '',
        'Â': '',
        # Em / en dashes are handled by strip_dashes() above (converted to
        # commas), so they are intentionally not mapped to hyphens here.
        '’': "'",
        '‘': "'",
        '"': '"',
        '"': '"',
    }
    
    for old, new in replacements.items():
        text = text.replace(old, new)
    
    # Remove any remaining non-ASCII characters that might cause issues
    # But preserve common accented characters that are valid
    cleaned = []
    for char in text:
        if ord(char) < 128:  # ASCII range
            cleaned.append(char)
        elif ord(char) in range(192, 256):  # Extended ASCII (accented letters)
            cleaned.append(char)
        else:
            # Replace other characters with space or appropriate substitute
            # (em / en dashes are already gone via strip_dashes above)
            if ord(char) in [8216, 8217]:  # smart quotes
                cleaned.append("'")
            elif ord(char) in [8220, 8221]:  # smart double quotes
                cleaned.append('"')
            else:
                cleaned.append(' ')
    
    text = ''.join(cleaned)
    
    # Clean up extra spaces but PRESERVE newlines
    # Split by newlines, clean each line, then rejoin with newlines
    lines = text.split('\n')
    cleaned_lines = []
    for line in lines:
        # Clean extra spaces within each line, but keep the line
        cleaned_line = ' '.join(line.split())
        cleaned_lines.append(cleaned_line)
    
    text = '\n'.join(cleaned_lines)
    
    return text


def extract_hometown_from_education_history_enhanced(education_history):
    """Smart hometown extraction: Try regex first (instant), fall back to OpenAI only if needed"""
    if not education_history or education_history in ['Not available', '']:
        return "Unknown"
    
    # ============================================
    # STEP 1: Try regex patterns first (instant)
    # ============================================
    
    # Pattern 1: "High School, City, State" or "High School - City, State"
    match = re.search(
        r'(?:High School|Secondary School|Prep)[,\-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)[,\s]+([A-Z]{2})',
        education_history
    )
    if match:
        city, state = match.groups()
        hometown = f"{city}, {state}"
        print(f"✓ Regex found hometown: {hometown}")
        return hometown
    
    # Pattern 2: "City High School, State"
    match = re.search(
        r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+High School[,\s]+([A-Z]{2})',
        education_history
    )
    if match:
        city, state = match.groups()
        hometown = f"{city}, {state}"
        print(f"✓ Regex found hometown: {hometown}")
        return hometown
    
    # Pattern 3: Generic "City, State" near school terms
    match = re.search(
        r'(?:School|Academy|Institute).*?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)[,\s]+([A-Z]{2})',
        education_history
    )
    if match:
        city, state = match.groups()
        hometown = f"{city}, {state}"
        print(f"✓ Regex found hometown: {hometown}")
        return hometown
    
    # ============================================
    # STEP 2: Regex failed - use OpenAI fallback
    # ============================================
    
    print(f"Regex failed for education: {education_history[:100]}...")
    print("Using OpenAI fallback...")
    
    try:
        client = get_openai_client()
        if not client:
            return "Unknown"
        
        prompt = f"""Extract hometown from education history. Return ONLY "City, State" or "Unknown".

Education: {education_history[:300]}

Hometown:"""
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=30,
            temperature=0.3
        )
        
        hometown = response.choices[0].message.content.strip()
        hometown = hometown.replace('"', '').replace("'", "").strip()
        
        if hometown and len(hometown) > 0 and hometown.lower() not in ['unknown', 'n/a', 'not available']:
            print(f"✓ OpenAI found hometown: {hometown}")
            return hometown
        else:
            print(f"OpenAI couldn't determine hometown")
            return "Unknown"
            
    except Exception as e:
        print(f"OpenAI fallback failed: {e}")
        return "Unknown"


def batch_extract_hometowns(contacts):
    """Extract hometowns for all contacts in one API call"""
    try:
        client = get_openai_client()
        if not client:
            return {i: "Unknown" for i in range(len(contacts))}
        
        if not contacts:
            return {}
        
        # Build a single prompt for all contacts
        education_data = []
        for i, contact in enumerate(contacts):
            edu = contact.get('EducationTop', '')
            if edu and edu != 'Not available':
                education_data.append(f"{i}: {edu}")
        
        if not education_data:
            return {i: "Unknown" for i in range(len(contacts))}
        
        prompt = f"""Extract the hometown (city where high school is located) for each education history.
If no high school is mentioned or hometown cannot be determined, use "Unknown".

{chr(10).join(education_data)}

Return ONLY a valid JSON object in this exact format with no other text:
{{"0": "City, State", "1": "City, State", "2": "Unknown"}}"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a JSON extraction assistant. Return only valid JSON with no explanation."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=500,
            temperature=0.1
        )
        
        result_text = response.choices[0].message.content.strip()
        
        # Try to extract JSON even if there's extra text
        import json
        
        # Find JSON pattern in response
        json_match = re.search(r'\{[^{}]*\}', result_text)
        if json_match:
            result = json.loads(json_match.group())
            return {int(k): v for k, v in result.items()}
        else:
            # If no JSON found, try to parse the whole response
            result = json.loads(result_text)
            return {int(k): v for k, v in result.items()}
        
    except Exception as e:
        print(f"Batch hometown extraction failed: {e}")
        # Fallback: return Unknown for all
        return {i: "Unknown" for i in range(len(contacts))}

