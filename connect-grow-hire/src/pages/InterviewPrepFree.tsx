/*
 * Public, anonymous interview-prep lead magnet at /tools/interview-prep.
 *
 * Backend: POST /api/tools/interview-prep/generate -> { prep_id }
 *          GET  /api/tools/interview-prep/status/<prep_id>
 *          GET  /api/tools/interview-prep/download/<prep_id>
 *
 * Marketing/landing visual language (Libre Baskerville serif headings,
 * DM Sans body, brand blue accent). House style: no em dashes, no
 * Sparkles icon. Reuses PreviewNav / PreviewFooter from the seo-preview
 * shared kit so this page feels native to the marketing surface.
 */
import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  ClipboardPaste,
  Download,
  FileText,
  Loader2,
  Lock,
  Target,
  TrendingUp,
} from 'lucide-react';
import {
  BRAND,
  BRAND_DARK,
  INK,
  serif,
  PreviewNav,
  PreviewFooter,
} from './seo-preview/_shared';
import { API_BASE_URL } from '../services/api';

type Phase = 'idle' | 'running' | 'completed' | 'failed';

interface StatusPayload {
  status: string;
  progress: string;
  progressPercent: number;
  currentStep: number;
  totalSteps: number;
  error: string | null;
  pdf_url: string | null;
  jobDetails: {
    company_name?: string;
    job_title?: string;
    location?: string;
  } | null;
}

const InterviewPrepFree = () => {
  const [jobInput, setJobInput] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const missesRef = useRef<number>(0);

  useEffect(() => () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (prepId: string) => {
    missesRef.current = 0;
    const MAX_MISSES = 8; // ~20s of consecutive 404s before bailing
    const tick = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/tools/interview-prep/status/${prepId}`);
        if (res.status === 404) {
          missesRef.current += 1;
          if (missesRef.current >= MAX_MISSES) {
            stopPolling();
            setStatus(prev => ({
              ...(prev || {
                status: 'failed',
                progress: '',
                progressPercent: 0,
                currentStep: 0,
                totalSteps: 5,
                pdf_url: null,
                jobDetails: null,
                error: null,
              }),
              status: 'failed',
              error:
                'The session expired or the server restarted while your prep was being built. Click "Try again" to start over.',
            }));
            setPhase('failed');
          }
          return;
        }
        if (!res.ok) throw new Error(`status ${res.status}`);
        missesRef.current = 0;
        const payload: StatusPayload = await res.json();
        setStatus(payload);
        if (payload.status === 'completed') {
          setPhase('completed');
          stopPolling();
        } else if (payload.status === 'failed') {
          setPhase('failed');
          stopPolling();
        }
      } catch (err) {
        console.error('status poll failed', err);
      }
    };
    void tick();
    pollRef.current = window.setInterval(tick, 2500);
  };

  const handleGenerate = async () => {
    setSubmitError(null);
    const trimmed = jobInput.trim();
    if (trimmed.length < 30 && !/^https?:\/\//i.test(trimmed)) {
      setSubmitError(
        'Paste a job posting URL or the full job posting text (at least a paragraph).',
      );
      return;
    }
    try {
      setPhase('running');
      setStatus({
        status: 'queued',
        progress: 'Queued...',
        progressPercent: 0,
        currentStep: 0,
        totalSteps: 5,
        error: null,
        pdf_url: null,
        jobDetails: null,
      });
      const res = await fetch(`${API_BASE_URL}/tools/interview-prep/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_input: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server returned ${res.status}`);
      }
      const { prep_id } = await res.json();
      startPolling(prep_id);
    } catch (err) {
      setPhase('idle');
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  const handleReset = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPhase('idle');
    setStatus(null);
    setSubmitError(null);
  };

  return (
    <div
      className="min-h-screen w-full"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}
    >
      <Helmet>
        <title>Free Interview Prep Generator | Offerloop</title>
        <meta
          name="description"
          content="Paste any job posting and get a free, source-backed interview prep PDF in under two minutes. Real questions, real process, real signal from Reddit + Perplexity."
        />
      </Helmet>

      <PreviewNav />

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
          className="px-6 pt-14 pb-12 text-center"
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
            <Target className="w-3.5 h-3.5" /> FREE TOOL · INTERVIEW PREP
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
            <span style={{ display: 'block', fontSize: 'clamp(38px, 5.2vw, 58px)' }}>
              Paste any job posting,
            </span>
            <span
              style={{
                display: 'block',
                fontSize: 'clamp(38px, 5.2vw, 58px)',
                color: BRAND,
                marginTop: '4px',
              }}
            >
              get a real interview prep
            </span>
          </h1>
          <p
            style={{
              fontSize: '18px',
              lineHeight: 1.6,
              color: '#64748B',
              maxWidth: '620px',
              margin: '0 auto',
            }}
          >
            We pull real candidate reports from Reddit, run live research through Perplexity,
            and turn it into a clean PDF you can study tonight. No signup, no credit card.
          </p>
        </div>
      </section>

      <section className="px-6 pb-16 pt-2" style={{ maxWidth: '820px', margin: '0 auto' }}>
        {phase === 'idle' && (
          <IdleCard
            jobInput={jobInput}
            onChange={setJobInput}
            onGenerate={handleGenerate}
            error={submitError}
          />
        )}
        {phase === 'running' && status && <RunningCard status={status} />}
        {phase === 'completed' && status && (
          <CompletedCard status={status} onReset={handleReset} />
        )}
        {phase === 'failed' && status && (
          <FailedCard status={status} onReset={handleReset} />
        )}
      </section>

      <UpgradeSection />

      <PreviewFooter />
    </div>
  );
};

const IdleCard = ({
  jobInput,
  onChange,
  onGenerate,
  error,
}: {
  jobInput: string;
  onChange: (v: string) => void;
  onGenerate: () => void;
  error: string | null;
}) => (
  <div
    className="rounded-[6px]"
    style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '24px' }}
  >
    <label
      htmlFor="job-input"
      className="flex items-center gap-2 mb-3"
      style={{ fontSize: '13px', fontWeight: 600, color: INK }}
    >
      <ClipboardPaste className="w-4 h-4" style={{ color: BRAND }} />
      Paste a job posting URL or the full posting text
    </label>
    <textarea
      id="job-input"
      value={jobInput}
      onChange={(e) => onChange(e.target.value)}
      placeholder="https://boards.greenhouse.io/.../job/12345 — or paste the full job posting text"
      rows={6}
      className="w-full rounded-[4px] px-3 py-3 text-sm"
      style={{
        border: '1px solid #CBD5E1',
        outline: 'none',
        resize: 'vertical',
        fontFamily: 'inherit',
        color: INK,
      }}
    />
    <p
      style={{ fontSize: '12px', color: '#94A3B8', marginTop: '8px', lineHeight: 1.5 }}
    >
      Works with LinkedIn, Greenhouse, Lever, Workday, Indeed, and most company career pages.
      We do not save the posting or send you email.
    </p>

    {error && (
      <div
        className="rounded-[4px] mt-4 px-3 py-2"
        style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: '13px' }}
      >
        {error}
      </div>
    )}

    <button
      type="button"
      onClick={onGenerate}
      className="mt-5 inline-flex items-center gap-2 px-5 py-3 rounded-[3px] text-sm font-semibold text-white"
      style={{ background: BRAND }}
    >
      Generate my prep
      <ArrowRight className="w-4 h-4" />
    </button>

    <div
      className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3"
      style={{ paddingTop: '16px', borderTop: '1px solid #F1F5F9' }}
    >
      <Bullet
        Icon={FileText}
        title="Real questions"
        body="Pulled from Reddit threads where candidates report what they were actually asked."
      />
      <Bullet
        Icon={TrendingUp}
        title="Live research"
        body="Perplexity searches the last month for current interview-process changes."
      />
      <Bullet
        Icon={Bot}
        title="Source-backed"
        body="Every claim in your PDF traces back to a citation, not an LLM guess."
      />
    </div>
  </div>
);

const Bullet = ({
  Icon,
  title,
  body,
}: {
  Icon: typeof FileText;
  title: string;
  body: string;
}) => (
  <div>
    <Icon className="w-4 h-4" style={{ color: BRAND }} />
    <p style={{ fontSize: '13px', fontWeight: 700, color: INK, marginTop: '8px' }}>{title}</p>
    <p style={{ fontSize: '12.5px', lineHeight: 1.55, color: '#64748B', marginTop: '4px' }}>
      {body}
    </p>
  </div>
);

const RunningCard = ({ status }: { status: StatusPayload }) => (
  <div
    className="rounded-[6px]"
    style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '28px' }}
  >
    <div className="flex items-center gap-3 mb-4">
      <Loader2 className="w-5 h-5 animate-spin" style={{ color: BRAND }} />
      <p style={{ fontSize: '15px', fontWeight: 600, color: INK }}>
        {status.progress || 'Working...'}
      </p>
    </div>
    <div
      style={{
        height: '8px',
        background: '#F1F5F9',
        borderRadius: '999px',
        overflow: 'hidden',
        marginBottom: '14px',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${Math.max(4, status.progressPercent || 0)}%`,
          background: BRAND,
          transition: 'width 0.6s ease',
        }}
      />
    </div>
    <p style={{ fontSize: '12.5px', color: '#64748B' }}>
      Step {status.currentStep || 1} of {status.totalSteps || 5} · usually 60 to 90 seconds.
    </p>

    {status.jobDetails?.company_name && (
      <div
        className="mt-5 rounded-[4px] px-3 py-3"
        style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}
      >
        <p style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '2px' }}>Detected role</p>
        <p style={{ fontSize: '14px', fontWeight: 600, color: INK }}>
          {status.jobDetails.job_title} <span style={{ color: '#94A3B8' }}>at</span>{' '}
          {status.jobDetails.company_name}
        </p>
      </div>
    )}
  </div>
);

const CompletedCard = ({
  status,
  onReset,
}: {
  status: StatusPayload;
  onReset: () => void;
}) => {
  const downloadUrl = status.pdf_url || '';
  return (
    <div
      className="rounded-[6px]"
      style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '28px' }}
    >
      <p
        style={{
          fontSize: '12.5px',
          fontWeight: 700,
          color: BRAND_DARK,
          letterSpacing: '0.05em',
          marginBottom: '8px',
        }}
      >
        READY
      </p>
      <h2
        style={{
          fontFamily: serif,
          fontSize: '26px',
          fontWeight: 400,
          color: INK,
          marginBottom: '6px',
        }}
      >
        Your interview prep is ready
      </h2>
      {status.jobDetails?.company_name && (
        <p style={{ fontSize: '14px', color: '#475569', marginBottom: '18px' }}>
          {status.jobDetails.job_title} at {status.jobDetails.company_name}
        </p>
      )}

      <a
        href={downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-5 py-3 rounded-[3px] text-sm font-semibold text-white"
        style={{ background: BRAND }}
      >
        <Download className="w-4 h-4" />
        Download PDF
      </a>
      <button
        type="button"
        onClick={onReset}
        className="ml-3 inline-flex items-center gap-2 px-4 py-3 rounded-[3px] text-sm font-semibold"
        style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', color: INK }}
      >
        Try another posting
      </button>
    </div>
  );
};

const FailedCard = ({
  status,
  onReset,
}: {
  status: StatusPayload;
  onReset: () => void;
}) => (
  <div
    className="rounded-[6px]"
    style={{ background: '#FEF2F2', border: '1px solid #FECACA', padding: '24px' }}
  >
    <p style={{ fontSize: '13px', fontWeight: 700, color: '#991B1B', marginBottom: '6px' }}>
      We couldn't finish your prep
    </p>
    <p style={{ fontSize: '14px', color: '#7F1D1D', lineHeight: 1.6, marginBottom: '14px' }}>
      {status.error || 'Something went wrong. Try a different posting.'}
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
        The personalized version is the real lift
      </h2>
      <p style={{ fontSize: '15px', lineHeight: 1.75, color: '#475569', marginBottom: '24px' }}>
        The PDF above is what you get from public sources. The version inside Offerloop is
        rebuilt around <em>you</em>: your resume, your stories, your gaps. Same prep, 10x more
        useful.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-7">
        <UpgradeCell
          Icon={Target}
          title="Fit analysis"
          body="Your strengths and gaps mapped against this exact role, with what to emphasize and what to defend."
        />
        <UpgradeCell
          Icon={FileText}
          title="Story bank from your resume"
          body="STAR-formatted stories pulled from your experience, mapped to the behavioral questions this company actually asks."
        />
        <UpgradeCell
          Icon={TrendingUp}
          title="Week-by-week prep plan"
          body="A checklist sized to your interview date and starting from where you actually are."
        />
        <UpgradeCell
          Icon={Bot}
          title="Cold-email drafts"
          body="Generated emails to alumni and recruiters at this company so you walk in already known."
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

export default InterviewPrepFree;
