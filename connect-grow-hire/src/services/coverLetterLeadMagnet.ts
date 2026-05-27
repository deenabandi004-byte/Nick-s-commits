/**
 * Public Cover Letter Lead Magnet - no auth, no credits, no library.
 *
 * Endpoints live at /api/tools/cover-letter on the backend. The flow is:
 *   1) captureEmail(email, name)        -> logs the lead immediately
 *   2) generateCoverLetter(form)        -> returns text + base64 PDF
 *
 * Both are public (no Firebase token sent).
 */
import { BACKEND_URL } from './api';

const BASE = `${BACKEND_URL}/api/tools/cover-letter`;

export interface CaptureEmailResponse {
  ok?: boolean;
  error?: string;
  message?: string;
}

export interface GenerateCoverLetterRequest {
  email: string;
  name: string;
  jobUrl: string;
  resumeFile: File;
}

export interface GenerateCoverLetterResponse {
  ok: boolean;
  coverLetterText?: string;
  pdfBase64?: string;
  job?: { title: string; company: string; location: string };
  requestId?: string;
  error?: string;
  message?: string;
}

export async function captureEmail(email: string, name = ''): Promise<CaptureEmailResponse> {
  try {
    const res = await fetch(`${BASE}/capture-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error, message: data.message || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, message: (err as Error).message || 'Network error' };
  }
}

export async function generateCoverLetter(
  req: GenerateCoverLetterRequest,
): Promise<GenerateCoverLetterResponse> {
  const formData = new FormData();
  formData.append('email', req.email);
  formData.append('name', req.name);
  formData.append('job_url', req.jobUrl);
  formData.append('resume', req.resumeFile);

  // 3 minutes - Firecrawl + Perplexity + GPT-4o can stretch on slow JD pages
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180_000);

  try {
    const res = await fetch(`${BASE}/generate`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: data.error,
        message: data.message || `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      coverLetterText: data.cover_letter_text,
      pdfBase64: data.pdf_base64,
      job: data.job,
      requestId: data.request_id,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const e = err as Error;
    if (e.name === 'AbortError') {
      return {
        ok: false,
        message: 'This took longer than expected. Try a different job URL or retry.',
      };
    }
    return { ok: false, message: e.message || 'Network error' };
  }
}

export function downloadPdf(base64: string, filename = 'cover-letter.pdf'): void {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
