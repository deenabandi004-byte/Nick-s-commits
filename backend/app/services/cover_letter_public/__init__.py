"""Public, anonymous cover-letter generation (lead magnet).

No auth, no credits, no Firestore user lookup. Resume is uploaded each
time; job URL is scraped fresh via Firecrawl; company context comes from
Perplexity; the letter is written by GPT-4o.

Modules:
    resume_reader   PDF/DOCX upload to plain text
    job_extractor   Firecrawl scrape of a job posting URL
    company_research Perplexity research on the company
    letter_writer   GPT-4o cover-letter generation
"""
