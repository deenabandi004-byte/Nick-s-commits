/*
 * Public, anonymous cover-letter lead magnet at /tools/cover-letter.
 *
 * Backend: POST /api/tools/cover-letter/capture-email
 *          POST /api/tools/cover-letter/generate  (multipart)
 *
 * Flow:
 *   1. email-gate   - name + email submitted, lead captured
 *   2. compose      - resume upload + job URL, then generate
 *   3. running      - faux stepped progress while the single sync POST runs
 *   4. completed    - cover letter text on the left, PDF preview on the right
 *   5. failed       - error message + retry button
 *
 * Visual language mirrors InterviewPrepFree.tsx (Libre Baskerville serif
 * headings, DM Sans body, brand blue accent, PreviewNav / PreviewFooter
 * from the seo-preview shared kit). House style: no em dashes, no Sparkle.
 */
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  Download,
  FileText,
  Link as LinkIcon,
  Loader2,
  Lock,
  PenLine,
  RefreshCw,
  Target,
  TrendingUp,
  Upload,
  X,
} from 'lucide-react';
import {
  BRAND,
  BRAND_DARK,
  INK,
  serif,
  PreviewNav,
  PreviewFooter,
} from './seo-preview/_shared';
import {
  captureEmail,
  generateCoverLetter,
  downloadPdf,
  type GenerateCoverLetterResponse,
} from '../services/coverLetterLeadMagnet';

type Phase = 'compose' | 'email_gate' | 'running' | 'completed' | 'failed';

const ALLOWED_EXTENSIONS = ['pdf', 'docx'];
const MAX_FILE_MB = 10;

const STEPS = [
  { label: 'Reading the job posting', detail: 'Scraping the page with Firecrawl' },
  { label: 'Researching the company', detail: 'Pulling recent news from Perplexity' },
  { label: 'Writing your cover letter', detail: 'GPT-4o, drafted from your resume' },
  { label: 'Building your PDF', detail: 'Same format we use for paying users' },
];

const CoverLetterFree = () => {
  const [phase, setPhase] = useState<Phase>('compose');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [gateError, setGateError] = useState<string | null>(null);
  const [submittingGate, setSubmittingGate] = useState(false);

  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jobUrl, setJobUrl] = useState('');
  const [composeError, setComposeError] = useState<string | null>(null);

  const [stepIndex, setStepIndex] = useState(0);
  const stepTimerRef = useRef<number | null>(null);

  const [result, setResult] = useState<GenerateCoverLetterResponse | null>(null);

  useEffect(() => {
    return () => {
      if (stepTimerRef.current) window.clearInterval(stepTimerRef.current);
    };
  }, []);

  const pdfDataUrl = useMemo(() => {
    if (!result?.pdfBase64) return '';
    return `data:application/pdf;base64,${result.pdfBase64}`;
  }, [result?.pdfBase64]);

  const handleSubmitEmailGate = async () => {
    setGateError(null);
    const trimmedEmail = email.trim();
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setGateError('Please enter your full name.');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmedEmail)) {
      setGateError('Please enter a valid email address.');
      return;
    }
    setSubmittingGate(true);
    // Best-effort lead capture - don't block the user if Firestore hiccups
    await captureEmail(trimmedEmail, trimmedName);
    setSubmittingGate(false);
    // Kick off the actual generation immediately - no extra click required
    void runGeneration(trimmedEmail, trimmedName);
  };

  const validateAndSetFile = (file: File | null): string | null => {
    if (!file) return 'Please upload a resume.';
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return 'Please upload a PDF or DOCX resume.';
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      return `Resume is too large. Max ${MAX_FILE_MB} MB.`;
    }
    setResumeFile(file);
    return null;
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setComposeError(null);
    const err = validateAndSetFile(file);
    if (err) setComposeError(err);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setComposeError(null);
    const file = e.dataTransfer.files?.[0] || null;
    const err = validateAndSetFile(file);
    if (err) setComposeError(err);
  };

  const handleGenerateClick = () => {
    setComposeError(null);
    if (!resumeFile) {
      setComposeError('Please upload your resume.');
      return;
    }
    const trimmedUrl = jobUrl.trim();
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      setComposeError('Please paste a valid job posting URL (starts with https://).');
      return;
    }
    // Form is valid - reveal the inline email step
    setGateError(null);
    setPhase('email_gate');
  };

  const runGeneration = async (submittedEmail: string, submittedName: string) => {
    if (!resumeFile) return; // belt-and-suspenders
    const trimmedUrl = jobUrl.trim();

    // Kick off faux progress; the backend call is synchronous and takes ~30-60s
    setPhase('running');
    setStepIndex(0);
    if (stepTimerRef.current) window.clearInterval(stepTimerRef.current);
    stepTimerRef.current = window.setInterval(() => {
      setStepIndex((prev) => (prev < STEPS.length - 1 ? prev + 1 : prev));
    }, 12_000);

    const res = await generateCoverLetter({
      email: submittedEmail,
      name: submittedName,
      jobUrl: trimmedUrl,
      resumeFile,
    });

    if (stepTimerRef.current) {
      window.clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }

    if (!res.ok) {
      setResult(res);
      setPhase('failed');
      return;
    }
    setResult(res);
    setStepIndex(STEPS.length - 1);
    setPhase('completed');
  };

  const handleReset = () => {
    setPhase('compose');
    setResult(null);
    setStepIndex(0);
    setComposeError(null);
  };

  const handleDownload = () => {
    if (!result?.pdfBase64) return;
    const company = (result.job?.company || 'company').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const filename = `cover-letter-${company || 'offerloop'}.pdf`;
    downloadPdf(result.pdfBase64, filename);
  };

  return (
    <div
      className="min-h-screen w-full"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}
    >
      <Helmet>
        <title>Free AI Cover Letter Generator | Offerloop</title>
        <meta
          name="description"
          content="Upload your resume, paste a job posting URL, and get a tailored cover letter PDF in under a minute. Free, no credit card, powered by Firecrawl + Perplexity + GPT-4o."
        />
      </Helmet>

      <PreviewNav />

      <Hero compact={phase !== 'compose' && phase !== 'email_gate'} />

      <section
        className="px-6 pb-20 pt-2"
        style={{ maxWidth: phase === 'completed' ? '1100px' : '760px', margin: '0 auto' }}
      >
        {(phase === 'compose' || phase === 'email_gate') && (
          <ComposeCard
            phase={phase}
            resumeFile={resumeFile}
            jobUrl={jobUrl}
            name={name}
            email={email}
            composeError={composeError}
            gateError={gateError}
            submittingGate={submittingGate}
            onFileInput={handleFileInput}
            onDrop={handleDrop}
            onClearFile={() => setResumeFile(null)}
            onUrlChange={setJobUrl}
            onGenerateClick={handleGenerateClick}
            onNameChange={setName}
            onEmailChange={setEmail}
            onSubmitEmailGate={handleSubmitEmailGate}
            onBackToCompose={() => setPhase('compose')}
          />
        )}

        {phase === 'running' && <RunningCard stepIndex={stepIndex} />}

        {phase === 'completed' && result && (
          <CompletedSplit
            result={result}
            pdfDataUrl={pdfDataUrl}
            onDownload={handleDownload}
            onReset={handleReset}
          />
        )}

        {phase === 'failed' && (
          <FailedCard
            message={result?.message || 'Something went wrong generating your cover letter.'}
            onReset={handleReset}
          />
        )}
      </section>

      <UpgradeSection />

      <PreviewFooter />
    </div>
  );
};

// ── Hero ───────────────────────────────────────────────────────────

const Hero = ({ compact }: { compact: boolean }) => (
  <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid #F1F5F9' }}>
    <div
      style={{
        position: 'absolute',
        top: '-260px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '1000px',
        height: '560px',
        zIndex: 0,
        pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(59,130,246,0.16), transparent 70%)',
      }}
    />
    <div
      className={compact ? 'px-6 pt-10 pb-8 text-center' : 'px-6 pt-14 pb-12 text-center'}
      style={{ maxWidth: '820px', margin: '0 auto', position: 'relative', zIndex: 1 }}
    >
      <span
        className="inline-flex items-center gap-1.5 mb-6"
        style={{
          background: '#EFF5FF',
          border: '1px solid #DBEAFE',
          color: BRAND_DARK,
          fontSize: '12.5px',
          fontWeight: 600,
          padding: '5px 12px',
          borderRadius: '999px',
        }}
      >
        <PenLine className="w-3.5 h-3.5" /> FREE TOOL · COVER LETTER GENERATOR
      </span>
      <h1
        style={{
          fontFamily: serif,
          fontWeight: 400,
          lineHeight: 1.08,
          letterSpacing: '-0.03em',
          color: INK,
          marginBottom: '18px',
        }}
      >
        <span style={{ display: 'block', fontSize: compact ? 'clamp(28px, 4vw, 42px)' : 'clamp(38px, 5.2vw, 58px)' }}>
          Upload your resume, paste the job,
        </span>
        <span
          style={{
            display: 'block',
            fontSize: compact ? 'clamp(28px, 4vw, 42px)' : 'clamp(38px, 5.2vw, 58px)',
            color: BRAND,
            marginTop: '4px',
          }}
        >
          get a real cover letter
        </span>
      </h1>
      {!compact && (
        <p
          style={{
            fontSize: '18px',
            lineHeight: 1.6,
            color: '#64748B',
            maxWidth: '620px',
            margin: '0 auto',
          }}
        >
          Firecrawl reads the job posting, Perplexity researches the company, GPT-4o writes you
          a specific, non-generic cover letter. Free, no credit card.
        </p>
      )}
    </div>
  </section>
);

// ── Compose card (resume + URL, with inline email step) ───────────

const ComposeCard = ({
  phase,
  resumeFile,
  jobUrl,
  name,
  email,
  composeError,
  gateError,
  submittingGate,
  onFileInput,
  onDrop,
  onClearFile,
  onUrlChange,
  onGenerateClick,
  onNameChange,
  onEmailChange,
  onSubmitEmailGate,
  onBackToCompose,
}: {
  phase: 'compose' | 'email_gate';
  resumeFile: File | null;
  jobUrl: string;
  name: string;
  email: string;
  composeError: string | null;
  gateError: string | null;
  submittingGate: boolean;
  onFileInput: (e: ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onClearFile: () => void;
  onUrlChange: (v: string) => void;
  onGenerateClick: () => void;
  onNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onSubmitEmailGate: () => void;
  onBackToCompose: () => void;
}) => (
  <div
    className="rounded-[6px]"
    style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '28px' }}
  >
    {/* Resume drop zone */}
    <StepLabel num={1} text="Upload your resume" />

    {resumeFile ? (
      <div
        className="rounded-[4px] px-4 py-3 flex items-center justify-between"
        style={{ background: '#EFF5FF', border: '1px solid #DBEAFE' }}
      >
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5" style={{ color: BRAND }} />
          <div>
            <p style={{ fontSize: '14px', fontWeight: 600, color: INK }}>{resumeFile.name}</p>
            <p style={{ fontSize: '12px', color: '#64748B' }}>
              {(resumeFile.size / 1024).toFixed(0)} KB
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClearFile}
          aria-label="Remove file"
          className="p-1.5 rounded-[3px] hover:bg-white/60"
          style={{ color: '#64748B' }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    ) : (
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        className="rounded-[4px] px-4 py-7 text-center cursor-pointer"
        style={{
          background: '#F8FAFC',
          border: '1.5px dashed #CBD5E1',
        }}
      >
        <input
          id="cl-resume"
          type="file"
          accept=".pdf,.docx"
          onChange={onFileInput}
          className="sr-only"
        />
        <label htmlFor="cl-resume" className="cursor-pointer block">
          <Upload className="w-5 h-5 mx-auto mb-2" style={{ color: BRAND }} />
          <p style={{ fontSize: '14px', fontWeight: 600, color: INK }}>
            Drag a PDF or DOCX, or click to upload
          </p>
          <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
            Max {MAX_FILE_MB} MB. We don't save it anywhere.
          </p>
        </label>
      </div>
    )}

    {/* Job URL */}
    <div style={{ marginTop: '22px' }}>
      <StepLabel num={2} text="Paste the job posting URL" />
    </div>
    <div
      className="flex items-center gap-2 rounded-[4px] px-3 py-2.5"
      style={{ border: '1px solid #CBD5E1', background: '#FFFFFF' }}
    >
      <LinkIcon className="w-4 h-4 shrink-0" style={{ color: '#94A3B8' }} />
      <input
        id="cl-url"
        type="url"
        value={jobUrl}
        onChange={(e) => onUrlChange(e.target.value)}
        placeholder="https://boards.greenhouse.io/.../job/12345"
        className="w-full text-sm outline-none"
        style={{ color: INK, background: 'transparent' }}
        disabled={phase === 'email_gate'}
      />
    </div>
    <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '6px', lineHeight: 1.5 }}>
      Works with Greenhouse, Lever, Workday, LinkedIn, Indeed, and most company career pages.
    </p>

    {composeError && phase === 'compose' && (
      <div
        className="rounded-[4px] mt-4 px-3 py-2"
        style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: '13px' }}
      >
        {composeError}
      </div>
    )}

    {/* Step 3 reveals after the user clicks the primary action */}
    {phase === 'email_gate' ? (
      <>
        <div style={{ marginTop: '24px' }}>
          <StepLabel num={3} text="Almost there - where should we send the lead?" />
        </div>
        <p
          className="flex items-center gap-1.5"
          style={{ fontSize: '13px', color: '#64748B', marginTop: '-6px', marginBottom: '12px' }}
        >
          <Lock className="w-3.5 h-3.5" />
          We only use this to follow up if Offerloop could help on your next application. No spam.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <input
            id="cl-name"
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Your name (Jane Doe)"
            className="w-full rounded-[4px] px-3 py-2.5 text-sm"
            style={{ border: '1px solid #CBD5E1', outline: 'none', color: INK }}
            autoFocus
          />
          <input
            id="cl-email"
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="you@university.edu"
            className="w-full rounded-[4px] px-3 py-2.5 text-sm"
            style={{ border: '1px solid #CBD5E1', outline: 'none', color: INK }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmitEmailGate();
            }}
          />
        </div>

        {gateError && (
          <div
            className="rounded-[4px] mb-3 px-3 py-2"
            style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: '13px' }}
          >
            {gateError}
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={onBackToCompose}
            disabled={submittingGate}
            className="px-4 py-3 rounded-[3px] text-sm font-semibold disabled:opacity-50"
            style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', color: INK }}
          >
            Back
          </button>
          <button
            type="button"
            onClick={onSubmitEmailGate}
            disabled={submittingGate}
            className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-[3px] text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: BRAND }}
          >
            {submittingGate ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Starting...
              </>
            ) : (
              <>
                Get my cover letter
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </>
    ) : (
      <button
        type="button"
        onClick={onGenerateClick}
        disabled={!resumeFile || !jobUrl}
        className="mt-5 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-[3px] text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: BRAND }}
      >
        Generate my cover letter
        <ArrowRight className="w-4 h-4" />
      </button>
    )}
  </div>
);

// Small numbered step badge used inside ComposeCard
const StepLabel = ({ num, text }: { num: number; text: string }) => (
  <div className="flex items-center gap-2.5 mb-2.5">
    <span
      className="inline-flex items-center justify-center rounded-full text-white shrink-0"
      style={{
        width: 22,
        height: 22,
        background: BRAND,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {num}
    </span>
    <span style={{ fontSize: '14px', fontWeight: 600, color: INK }}>{text}</span>
  </div>
);

// ── Stage 3: Running with stepped progress ─────────────────────────

const RunningCard = ({ stepIndex }: { stepIndex: number }) => {
  const percent = Math.round(((stepIndex + 1) / STEPS.length) * 100);
  return (
    <div
      className="rounded-[6px]"
      style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '32px' }}
    >
      <div className="flex items-center gap-3 mb-5">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: BRAND }} />
        <p style={{ fontSize: '15px', fontWeight: 600, color: INK }}>
          {STEPS[stepIndex]?.label || 'Working...'}
        </p>
      </div>

      <div
        style={{
          height: '6px',
          background: '#F1F5F9',
          borderRadius: '999px',
          overflow: 'hidden',
          marginBottom: '18px',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${percent}%`,
            background: BRAND,
            transition: 'width 0.6s ease',
          }}
        />
      </div>

      <ul className="space-y-2.5">
        {STEPS.map((step, i) => {
          const done = i < stepIndex;
          const active = i === stepIndex;
          return (
            <li key={step.label} className="flex items-start gap-2.5">
              {done ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: BRAND }} />
              ) : active ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5" style={{ color: BRAND }} />
              ) : (
                <span
                  className="w-4 h-4 shrink-0 mt-0.5 rounded-full"
                  style={{ background: '#F1F5F9', border: '1px solid #E2E8F0' }}
                />
              )}
              <div>
                <p
                  style={{
                    fontSize: '13.5px',
                    fontWeight: active ? 600 : 500,
                    color: done || active ? INK : '#94A3B8',
                  }}
                >
                  {step.label}
                </p>
                <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '1px' }}>
                  {step.detail}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <p style={{ fontSize: '12.5px', color: '#94A3B8', marginTop: '18px' }}>
        Usually 30 to 60 seconds. Hang tight, we're being thorough.
      </p>
    </div>
  );
};

// ── Stage 4: Completed (split view) ────────────────────────────────

const CompletedSplit = ({
  result,
  pdfDataUrl,
  onDownload,
  onReset,
}: {
  result: GenerateCoverLetterResponse;
  pdfDataUrl: string;
  onDownload: () => void;
  onReset: () => void;
}) => {
  const job = result.job;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-5">
      {/* Left: header + text */}
      <div
        className="rounded-[6px]"
        style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '24px' }}
      >
        <p
          style={{
            fontSize: '12px',
            fontWeight: 700,
            color: BRAND_DARK,
            letterSpacing: '0.06em',
            marginBottom: '6px',
          }}
        >
          READY
        </p>
        <h2
          style={{
            fontFamily: serif,
            fontSize: '24px',
            fontWeight: 400,
            color: INK,
            marginBottom: '4px',
            letterSpacing: '-0.01em',
          }}
        >
          Your cover letter
        </h2>
        {(job?.title || job?.company) && (
          <p
            className="flex items-center gap-1.5"
            style={{ fontSize: '13.5px', color: '#475569', marginBottom: '16px' }}
          >
            <Building2 className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
            {job.title}
            {job.company && (
              <>
                <span style={{ color: '#CBD5E1' }}>at</span> {job.company}
              </>
            )}
          </p>
        )}

        <div className="flex gap-2 mb-5">
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[3px] text-sm font-semibold text-white"
            style={{ background: BRAND }}
          >
            <Download className="w-4 h-4" />
            Download PDF
          </button>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[3px] text-sm font-semibold"
            style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', color: INK }}
          >
            <RefreshCw className="w-4 h-4" />
            Generate another
          </button>
        </div>

        <div
          className="rounded-[4px] px-4 py-4"
          style={{
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            maxHeight: '520px',
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            fontSize: '13.5px',
            lineHeight: 1.7,
            color: '#1E293B',
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }}
        >
          {result.coverLetterText || '(empty)'}
        </div>
      </div>

      {/* Right: PDF preview */}
      <div
        className="rounded-[6px] overflow-hidden flex flex-col"
        style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}
      >
        <div
          className="px-4 py-2.5 flex items-center justify-between"
          style={{ borderBottom: '1px solid #F1F5F9', background: '#FAFBFC' }}
        >
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5" style={{ color: BRAND }} />
            <p style={{ fontSize: '12px', fontWeight: 600, color: INK }}>
              PDF preview
            </p>
          </div>
          <p style={{ fontSize: '11.5px', color: '#94A3B8' }}>
            US Letter · ReportLab
          </p>
        </div>
        {pdfDataUrl ? (
          <iframe
            title="Cover letter PDF preview"
            src={pdfDataUrl}
            style={{ width: '100%', height: '620px', border: 'none', background: '#F1F5F9' }}
          />
        ) : (
          <div
            className="flex items-center justify-center"
            style={{ height: '620px', color: '#94A3B8', fontSize: '13px' }}
          >
            PDF preview unavailable. Use Download PDF.
          </div>
        )}
      </div>
    </div>
  );
};

// ── Stage 5: Failure ───────────────────────────────────────────────

const FailedCard = ({ message, onReset }: { message: string; onReset: () => void }) => (
  <div
    className="rounded-[6px]"
    style={{ background: '#FEF2F2', border: '1px solid #FECACA', padding: '24px' }}
  >
    <p style={{ fontSize: '13px', fontWeight: 700, color: '#991B1B', marginBottom: '6px' }}>
      We couldn't finish your cover letter
    </p>
    <p style={{ fontSize: '14px', color: '#7F1D1D', lineHeight: 1.6, marginBottom: '14px' }}>
      {message}
    </p>
    <button
      type="button"
      onClick={onReset}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[3px] text-sm font-semibold text-white"
      style={{ background: BRAND }}
    >
      Try again
    </button>
  </div>
);

// ── Upgrade section ────────────────────────────────────────────────

const UpgradeSection = () => (
  <section
    className="px-6 py-14"
    style={{ background: '#FAFBFF', borderTop: '1px solid #F1F5F9' }}
  >
    <div style={{ maxWidth: '820px', margin: '0 auto' }}>
      <p
        style={{
          fontSize: '12.5px',
          fontWeight: 700,
          color: BRAND,
          letterSpacing: '0.06em',
          marginBottom: '14px',
        }}
      >
        WHAT THIS FREE VERSION DOESN'T HAVE
      </p>
      <h2
        style={{
          fontFamily: serif,
          fontSize: '30px',
          fontWeight: 400,
          color: INK,
          marginBottom: '14px',
          letterSpacing: '-0.02em',
        }}
      >
        The full Offerloop loop is the real lift
      </h2>
      <p style={{ fontSize: '15px', lineHeight: 1.75, color: '#475569', marginBottom: '24px' }}>
        The cover letter above is a one-shot. The version inside Offerloop ties the letter to a
        full networking pipeline: the alumni you're emailing, the meetings on your calendar,
        and the interview prep that comes after.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-7">
        <UpgradeCell
          Icon={Target}
          title="Cover letter library"
          body="Every cover letter saved, searchable, and rebuildable when the same firm reposts in three months."
        />
        <UpgradeCell
          Icon={FileText}
          title="Resume optimizer"
          body="ATS scoring, keyword gaps against the JD, and one-click rewrites grounded in your real experience."
        />
        <UpgradeCell
          Icon={TrendingUp}
          title="Alumni search"
          body="Find the people who got the role you're applying to, with verified emails and warm-intro openers."
        />
        <UpgradeCell
          Icon={Bot}
          title="Scout AI"
          body="One assistant that drafts the email, books the meeting, and preps you for the interview."
        />
      </div>

      <Link
        to="/signin?mode=signup"
        className="inline-flex items-center gap-2 px-5 py-3 rounded-[3px] text-sm font-semibold text-white"
        style={{ background: BRAND }}
      >
        Create a free account
        <ArrowRight className="w-4 h-4" />
      </Link>
      <p
        className="flex items-center gap-1.5"
        style={{ fontSize: '12.5px', color: '#94A3B8', marginTop: '10px' }}
      >
        <Lock className="w-3 h-3" />
        300 free credits to start, no credit card required.
      </p>
    </div>
  </section>
);

const UpgradeCell = ({
  Icon,
  title,
  body,
}: {
  Icon: typeof Target;
  title: string;
  body: string;
}) => (
  <div
    className="rounded-[4px] p-4"
    style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}
  >
    <Icon className="w-4 h-4" style={{ color: BRAND }} />
    <p style={{ fontSize: '14px', fontWeight: 700, color: INK, marginTop: '8px' }}>{title}</p>
    <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#64748B', marginTop: '4px' }}>
      {body}
    </p>
  </div>
);

export default CoverLetterFree;
