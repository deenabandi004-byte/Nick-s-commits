# Resume Optimization Formatting Preservation - Implementation Guide

## Overview

This document outlines the implementation plan to preserve original resume formatting during optimization by using LibreOffice for PDF↔DOCX conversion and python-docx for text replacement.

## Architecture Changes

### Current Flow
```
PDF Upload → PyPDF2 (text only) → AI Optimization → React-PDF (template) → PDF Download
```

### New Flow
```
PDF Upload → LibreOffice PDF→DOCX → Extract Text → AI Optimization → 
Find/Replace in DOCX → LibreOffice DOCX→PDF → PDF Download
```

## Implementation Steps

### Step 1: Add Dependencies

**File:** `backend/requirements.txt`

Add:
```txt
python-docx==1.1.0
```

**System Requirements:**
- LibreOffice must be installed on the server
- Command: `libreoffice --headless --convert-to docx --outdir <output_dir> <input.pdf>`
- Command: `libreoffice --headless --convert-to pdf --outdir <output_dir> <input.docx>`

### Step 2: Create LibreOffice Service

**New File:** `backend/app/services/libreoffice_service.py`

```python
"""
LibreOffice service for PDF↔DOCX conversion
"""
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

def convert_pdf_to_docx(pdf_path: str, output_dir: Optional[str] = None) -> Optional[str]:
    """
    Convert PDF to DOCX using LibreOffice.
    
    Args:
        pdf_path: Path to input PDF file
        output_dir: Directory for output (defaults to same directory as PDF)
    
    Returns:
        Path to generated DOCX file, or None if conversion failed
    """
    try:
        if output_dir is None:
            output_dir = os.path.dirname(pdf_path)
        
        # LibreOffice command
        cmd = [
            'libreoffice',
            '--headless',
            '--convert-to', 'docx',
            '--outdir', output_dir,
            pdf_path
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            print(f"LibreOffice conversion error: {result.stderr}")
            return None
        
        # Generated DOCX has same name as PDF but with .docx extension
        pdf_name = Path(pdf_path).stem
        docx_path = os.path.join(output_dir, f"{pdf_name}.docx")
        
        if os.path.exists(docx_path):
            return docx_path
        else:
            print(f"DOCX file not found at expected path: {docx_path}")
            return None
            
    except subprocess.TimeoutExpired:
        print("LibreOffice conversion timed out")
        return None
    except Exception as e:
        print(f"Error converting PDF to DOCX: {e}")
        return None


def convert_docx_to_pdf(docx_path: str, output_dir: Optional[str] = None) -> Optional[str]:
    """
    Convert DOCX to PDF using LibreOffice.
    
    Args:
        docx_path: Path to input DOCX file
        output_dir: Directory for output (defaults to same directory as DOCX)
    
    Returns:
        Path to generated PDF file, or None if conversion failed
    """
    try:
        if output_dir is None:
            output_dir = os.path.dirname(docx_path)
        
        # LibreOffice command
        cmd = [
            'libreoffice',
            '--headless',
            '--convert-to', 'pdf',
            '--outdir', output_dir,
            docx_path
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            print(f"LibreOffice conversion error: {result.stderr}")
            return None
        
        # Generated PDF has same name as DOCX but with .pdf extension
        docx_name = Path(docx_path).stem
        pdf_path = os.path.join(output_dir, f"{docx_name}.pdf")
        
        if os.path.exists(pdf_path):
            return pdf_path
        else:
            print(f"PDF file not found at expected path: {pdf_path}")
            return None
            
    except subprocess.TimeoutExpired:
        print("LibreOffice conversion timed out")
        return None
    except Exception as e:
        print(f"Error converting DOCX to PDF: {e}")
        return None
```

### Step 3: Create DOCX Manipulation Service

**New File:** `backend/app/services/docx_service.py`

```python
"""
DOCX manipulation service for text replacement while preserving formatting
"""
from docx import Document
from docx.shared import RGBColor
from typing import Dict, List, Optional
import re

def extract_text_from_docx(docx_path: str) -> Optional[str]:
    """
    Extract plain text from DOCX file.
    
    Args:
        docx_path: Path to DOCX file
    
    Returns:
        Plain text content, or None if extraction failed
    """
    try:
        doc = Document(docx_path)
        text_parts = []
        
        for paragraph in doc.paragraphs:
            text_parts.append(paragraph.text)
        
        # Also extract text from tables
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    for paragraph in cell.paragraphs:
                        text_parts.append(paragraph.text)
        
        return '\n'.join(text_parts)
        
    except Exception as e:
        print(f"Error extracting text from DOCX: {e}")
        return None


def find_replace_in_docx(
    docx_path: str,
    replacements: Dict[str, str],
    output_path: Optional[str] = None
) -> bool:
    """
    Find and replace text in DOCX while preserving formatting.
    
    This function performs intelligent text replacement:
    - Preserves all formatting (fonts, colors, styles)
    - Handles text across multiple runs
    - Maintains paragraph structure
    
    Args:
        docx_path: Path to input DOCX file
        replacements: Dictionary mapping old text to new text
        output_path: Path for output file (defaults to overwriting input)
    
    Returns:
        True if successful, False otherwise
    """
    try:
        doc = Document(docx_path)
        
        # Replace in paragraphs
        for paragraph in doc.paragraphs:
            _replace_in_paragraph(paragraph, replacements)
        
        # Replace in tables
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    for paragraph in cell.paragraphs:
                        _replace_in_paragraph(paragraph, replacements)
        
        # Save
        output = output_path or docx_path
        doc.save(output)
        return True
        
    except Exception as e:
        print(f"Error replacing text in DOCX: {e}")
        return False


def _replace_in_paragraph(paragraph, replacements: Dict[str, str]):
    """
    Helper function to replace text in a paragraph while preserving formatting.
    
    This is complex because DOCX stores formatting per "run" (text segment),
    so we need to carefully merge runs when replacing text.
    """
    # Build full text of paragraph
    full_text = paragraph.text
    
    # Check if any replacement is needed
    needs_replacement = False
    for old_text, new_text in replacements.items():
        if old_text in full_text:
            needs_replacement = True
            break
    
    if not needs_replacement:
        return
    
    # For each replacement, find and replace
    for old_text, new_text in replacements.items():
        if old_text not in full_text:
            continue
        
        # Find all occurrences
        start_idx = 0
        while True:
            idx = full_text.find(old_text, start_idx)
            if idx == -1:
                break
            
            # Get the run that contains this position
            run_start = 0
            for run in paragraph.runs:
                run_end = run_start + len(run.text)
                
                # Check if replacement spans this run
                if idx < run_end and idx + len(old_text) > run_start:
                    # This is complex - we need to split/merge runs
                    # For now, simple approach: replace text in the run
                    if old_text in run.text:
                        run.text = run.text.replace(old_text, new_text)
                        # Update full_text for next iteration
                        full_text = full_text.replace(old_text, new_text, 1)
                        break
                
                run_start = run_end
            
            start_idx = idx + len(new_text)
    
    # Alternative simpler approach: rebuild paragraph
    # This preserves formatting better but is more complex
    # For MVP, we'll use the simpler approach above


def replace_section_in_docx(
    docx_path: str,
    section_mapping: Dict[str, str],
    output_path: Optional[str] = None
) -> bool:
    """
    Replace entire sections in DOCX (e.g., replace all Experience bullets).
    
    This is more sophisticated than find_replace_in_docx and can handle
    replacing entire bullet lists or sections while preserving formatting.
    
    Args:
        docx_path: Path to input DOCX file
        section_mapping: Dictionary mapping section identifiers to new content
        output_path: Path for output file
    
    Returns:
        True if successful, False otherwise
    """
    # This is a more advanced function that would:
    # 1. Identify sections by headers (e.g., "EXPERIENCE", "EDUCATION")
    # 2. Replace all content in that section
    # 3. Preserve section header formatting
    
    # For MVP, we can use find_replace_in_docx for now
    return find_replace_in_docx(docx_path, section_mapping, output_path)
```

### Step 4: Update Resume Parser

**File:** `backend/app/services/resume_parser.py`

Add new function:
```python
def extract_text_from_pdf_via_docx(pdf_file):
    """
    Extract text from PDF by converting to DOCX first (preserves formatting info).
    
    This is the new method that will replace extract_text_from_pdf().
    """
    import tempfile
    from app.services.libreoffice_service import convert_pdf_to_docx
    from app.services.docx_service import extract_text_from_docx
    
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_pdf:
            pdf_file.save(temp_pdf.name)
            pdf_path = temp_pdf.name
        
        # Convert PDF to DOCX
        docx_path = convert_pdf_to_docx(pdf_path, os.path.dirname(pdf_path))
        if not docx_path:
            # Fallback to old method
            return extract_text_from_pdf(pdf_file)
        
        # Extract text from DOCX
        text = extract_text_from_docx(docx_path)
        
        # Cleanup
        try:
            os.unlink(pdf_path)
            os.unlink(docx_path)
        except:
            pass
        
        return text
        
    except Exception as e:
        print(f"Error extracting text via DOCX: {e}")
        # Fallback to old method
        return extract_text_from_pdf(pdf_file)
```

### Step 5: Update Optimization Function

**File:** `backend/app/routes/job_board.py`

Modify `optimize_resume_with_ai()` to:
1. Accept DOCX path instead of just text
2. Return optimized text content for replacement
3. Handle DOCX manipulation

Add new function:
```python
async def optimize_resume_with_formatting_preservation(
    user_resume_docx_path: str,
    job_description: str,
    job_title: str = "",
    company: str = "",
) -> Dict[str, Any]:
    """
    Optimize resume while preserving formatting.
    
    This is the new version that works with DOCX files.
    """
    from app.services.docx_service import extract_text_from_docx, find_replace_in_docx
    from app.services.libreoffice_service import convert_docx_to_pdf
    import tempfile
    
    try:
        # Extract text for AI processing
        resume_text = extract_text_from_docx(user_resume_docx_path)
        if not resume_text:
            raise ValueError("Could not extract text from DOCX")
        
        # Get structured resume data (for ATS scoring)
        # ... existing code to get user_resume dict ...
        
        # Call AI optimization (same as before)
        optimized_result = await optimize_resume_with_ai(
            user_resume,  # structured data
            job_description,
            job_title,
            company
        )
        
        optimized_content = optimized_result.get("content", "")
        
        # Create mapping of old text to new text
        # This is the tricky part - we need to map original sections to optimized sections
        replacements = _build_text_replacements(resume_text, optimized_content)
        
        # Create temporary DOCX for output
        with tempfile.NamedTemporaryFile(delete=False, suffix='.docx') as temp_docx:
            temp_docx_path = temp_docx.name
        
        # Copy original DOCX to temp location
        import shutil
        shutil.copy(user_resume_docx_path, temp_docx_path)
        
        # Replace text in DOCX
        success = find_replace_in_docx(temp_docx_path, replacements)
        if not success:
            raise ValueError("Failed to replace text in DOCX")
        
        # Convert DOCX to PDF
        pdf_path = convert_docx_to_pdf(temp_docx_path, os.path.dirname(temp_docx_path))
        if not pdf_path:
            raise ValueError("Failed to convert DOCX to PDF")
        
        # Read PDF bytes
        with open(pdf_path, 'rb') as f:
            pdf_bytes = f.read()
        
        # Cleanup
        try:
            os.unlink(temp_docx_path)
            os.unlink(pdf_path)
        except:
            pass
        
        # Return result with PDF
        return {
            **optimized_result,
            "pdf_bytes": pdf_bytes,  # Add PDF to response
            "formatting_preserved": True
        }
        
    except Exception as e:
        print(f"Error in formatting-preserving optimization: {e}")
        raise


def _build_text_replacements(original_text: str, optimized_text: str) -> Dict[str, str]:
    """
    Build a mapping of original text segments to optimized text segments.
    
    This is complex because we need to:
    1. Identify which sections changed
    2. Map old bullet points to new bullet points
    3. Handle cases where content was reordered
    
    For MVP, we can use a simpler approach:
    - Replace entire sections (e.g., all Experience bullets)
    - Or use AI to identify specific text spans to replace
    """
    # This is a placeholder - actual implementation would be more sophisticated
    # For now, we could:
    # 1. Use AI to identify what changed
    # 2. Or replace entire sections based on headers
    
    return {
        # Example: replace entire experience section
        # This would need to be more sophisticated in practice
    }
```

### Step 6: Update API Endpoint

**File:** `backend/app/routes/job_board.py`

Modify `optimize_resume()` endpoint:

```python
@job_board_bp.route("/optimize-resume", methods=["POST"])
@require_firebase_auth
def optimize_resume():
    """
    Optimize user's resume for a specific job (with formatting preservation).
    """
    # ... existing validation code ...
    
    # Get user's resume DOCX (convert from PDF if needed)
    resume_url = user_data.get("resumeUrl")
    if not resume_url:
        return jsonify({"error": "No resume found"}), 400
    
    # Download resume
    resume_response = requests.get(resume_url, timeout=15)
    resume_response.raise_for_status()
    
    # Save to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_pdf:
        temp_pdf.write(resume_response.content)
        temp_pdf_path = temp_pdf.name
    
    # Convert PDF to DOCX
    from app.services.libreoffice_service import convert_pdf_to_docx
    docx_path = convert_pdf_to_docx(temp_pdf_path, os.path.dirname(temp_pdf_path))
    
    if not docx_path:
        # Fallback to old method
        return optimize_resume_legacy()  # Old implementation
    
    try:
        # Optimize with formatting preservation
        optimized = await optimize_resume_with_formatting_preservation(
            docx_path,
            job_description,
            job_title,
            company
        )
        
        # Return PDF bytes as base64 or upload to storage
        pdf_bytes = optimized.get("pdf_bytes")
        
        # Upload to Firebase Storage
        from firebase_admin import storage
        bucket = storage.bucket()
        blob_path = f"users/{user_id}/optimized_resumes/{int(time.time())}.pdf"
        blob = bucket.blob(blob_path)
        blob.upload_from_string(pdf_bytes, content_type='application/pdf')
        blob.make_public()
        pdf_url = blob.public_url
        
        # Cleanup
        try:
            os.unlink(temp_pdf_path)
            os.unlink(docx_path)
        except:
            pass
        
        return jsonify({
            "optimizedResume": {
                **optimized,
                "pdfUrl": pdf_url  # Return URL to optimized PDF
            },
            "creditsUsed": OPTIMIZATION_CREDIT_COST,
            "creditsRemaining": new_credits,
        })
        
    except Exception as e:
        # Cleanup on error
        try:
            os.unlink(temp_pdf_path)
            if docx_path and os.path.exists(docx_path):
                os.unlink(docx_path)
        except:
            pass
        raise
```

### Step 7: Update Frontend

**File:** `connect-grow-hire/src/pages/JobBoardPage.tsx`

Update download handler:
```typescript
const handleDownloadPDF = async () => {
  if (!optimizedResume?.pdfUrl) {
    toast({ title: "PDF not available", variant: "destructive" });
    return;
  }
  
  // Download PDF from server
  const response = await fetch(optimizedResume.pdfUrl);
  const blob = await response.blob();
  
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'optimized_resume.pdf';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
```

**File:** `connect-grow-hire/src/components/ResumePDFDownload.tsx`

Update to use server PDF:
```typescript
// Remove React-PDF dependency for resume optimization
// Use server-generated PDF instead
```

## Testing Checklist

1. **Format Preservation Test:**
   - [ ] Upload resume with custom fonts (e.g., Garamond, Arial)
   - [ ] Upload resume with colors (e.g., blue headers, red highlights)
   - [ ] Upload resume with columns (2-column layout)
   - [ ] Upload resume with tables
   - [ ] Run optimization
   - [ ] Verify fonts are preserved
   - [ ] Verify colors are preserved
   - [ ] Verify layout is preserved
   - [ ] Verify only text content changed

2. **Text Replacement Test:**
   - [ ] Verify all bullet points are updated
   - [ ] Verify section headers are preserved
   - [ ] Verify contact info formatting is preserved
   - [ ] Verify tables maintain structure

3. **Edge Cases:**
   - [ ] Scanned PDFs (should fallback gracefully)
   - [ ] Very long resumes (multi-page)
   - [ ] Resumes with images/logos
   - [ ] Resumes with complex tables
   - [ ] Resumes with special characters

4. **Performance:**
   - [ ] Conversion time < 30 seconds
   - [ ] Memory usage reasonable
   - [ ] Cleanup of temp files works

## Challenges & Solutions

### Challenge 1: Text Mapping
**Problem:** Mapping original text to optimized text for replacement is complex.

**Solution:** 
- Use AI to identify which sections changed
- Or replace entire sections based on headers
- For MVP, replace entire Experience/Education sections

### Challenge 2: Complex Formatting
**Problem:** Some formatting (tables, columns) may not convert perfectly.

**Solution:**
- Test with various resume formats
- Provide fallback to old method if conversion fails
- Document limitations

### Challenge 3: LibreOffice Installation
**Problem:** Requires LibreOffice to be installed on server.

**Solution:**
- Add to deployment scripts
- Use Docker image with LibreOffice pre-installed
- Document system requirements

### Challenge 4: Performance
**Problem:** PDF↔DOCX conversion adds latency.

**Solution:**
- Cache converted DOCX files
- Use async processing for large files
- Optimize LibreOffice command flags

## Migration Strategy

1. **Phase 1:** Implement new system alongside old system
2. **Phase 2:** Add feature flag to switch between systems
3. **Phase 3:** Test with real resumes
4. **Phase 4:** Enable for all users
5. **Phase 5:** Remove old system

## Rollback Plan

If issues arise:
1. Feature flag can disable new system
2. Old system remains as fallback
3. Monitor error rates and conversion success

