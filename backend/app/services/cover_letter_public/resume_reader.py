"""Read an uploaded resume file (PDF or DOCX) into plain text.

Reuses the existing `extract_text_from_file` from app.services.resume_parser,
so we get the same battle-tested pdfplumber / python-docx code paths used
on the authenticated side. No Firestore, no Firebase Storage upload - the
file is read in memory and discarded.
"""
from __future__ import annotations

import logging

from app.services.resume_parser import extract_text_from_file

logger = logging.getLogger(__name__)


ALLOWED_EXTENSIONS = {"pdf", "docx"}
MAX_BYTES = 10 * 1024 * 1024  # 10 MB


def _get_extension(filename: str) -> str:
    if not filename or "." not in filename:
        return ""
    return filename.rsplit(".", 1)[1].lower().strip()


def _guess_name(resume_text: str) -> str:
    """Best-effort: the name on a resume is almost always the first non-empty
    line (or close to it). Fall back to empty string if nothing plausible.
    """
    if not resume_text:
        return ""
    for raw_line in resume_text.splitlines()[:8]:
        line = raw_line.strip()
        if not line:
            continue
        # Skip obvious non-name lines
        lower = line.lower()
        if "@" in line or "linkedin" in lower or "http" in lower:
            continue
        if any(ch.isdigit() for ch in line):
            continue
        word_count = len(line.split())
        if 2 <= word_count <= 5 and len(line) <= 60:
            return line
    return ""


def read_resume(file_storage, filename: str) -> dict:
    """Extract text from an uploaded resume file.

    Args:
        file_storage: werkzeug FileStorage from request.files
        filename: original filename (used only for extension detection)

    Returns:
        {"text": str, "name": str, "extension": str}

    Raises:
        ValueError: unsupported extension, file too large, or empty extraction.
    """
    extension = _get_extension(filename)
    if extension not in ALLOWED_EXTENSIONS:
        raise ValueError(
            "Unsupported file type. Please upload a PDF or DOCX resume."
        )

    # Size check without reading the file into memory if we can avoid it
    try:
        file_storage.stream.seek(0, 2)  # seek to end
        size = file_storage.stream.tell()
        file_storage.stream.seek(0)
        if size > MAX_BYTES:
            raise ValueError("Resume file is too large. Max size is 10 MB.")
    except (AttributeError, OSError):
        # Some FileStorage implementations don't support seek; let extract_text_from_file handle it
        pass

    text = extract_text_from_file(file_storage, extension)
    if not text or not text.strip():
        raise ValueError(
            "We couldn't extract any text from that resume. "
            "If it's a scanned image PDF, try exporting a text-based PDF or upload a DOCX."
        )

    name = _guess_name(text)
    logger.info(
        "Public cover letter: extracted %d chars from %s resume; guessed name=%r",
        len(text), extension, name,
    )
    return {"text": text.strip(), "name": name, "extension": extension}
