/*
 * InterviewPrepWidget - self-contained, embeddable React component for the
 * free interview-prep lead magnet. Drop it into any page:
 *
 *   <InterviewPrepWidget source="goldman-superday-prep-page" />
 *
 * The `source` prop is sent to /api/tools/interview-prep/generate and written
 * into the lead_magnet_emails Firestore doc so we can attribute leads to the
 * SEO page they came from.
 *
 * This is the same visual container that lives inside the standalone
 * /tools/interview-prep page (IdleCard / RunningCard / CompletedCard /
 * FailedCard), extracted so it can be embedded on SEO landing pages. The
 * extra phase compared to the standalone page is `email_gate`: we ask for
 * an email BEFORE kicking off the generate call so we can capture the lead.
 *
 * No <Helmet>, no nav, no footer - frame-agnostic. Drop it inside whatever
 * marketing chrome the embedding page already has.
 *
 * NOTE: only render ONE instance of this widget per page. It owns its own
 * polling interval keyed to a single prep_id; multiple instances would
 * race on the status endpoint.
 *
 * House style: no em dashes, no Sparkles icon. Visual tokens are inlined
 * so the widget has no dependency on the seo-preview shared kit.
 */
import { ReactNode, useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import { API_BASE_URL } from "../../services/api";

// ── Visual tokens (inlined so the widget has no shared-kit dependency) ────
const BRAND = "#3B82F6";
const BRAND_DARK = "#2563EB";
const INK = "#0F172A";
const SERIF = "'Libre Baskerville', Georgia, serif";

// ── Types ─────────────────────────────────────────────────────────────────

type Phase = "idle" | "email_gate" | "running" | "completed" | "failed";

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

export interface InterviewPrepWidgetProps {
  /**
   * Identifier for the page/surface embedding the widget. Stored on the
   * lead_magnet_emails record so we can attribute conversions by page.
   * Examples: "standalone-tools", "goldman-superday", "alumni-anthropic".
   */
  source?: string;
  /**
   * Called after a successful /generate kickoff (i.e. the moment we have
   * an email + a prep_id in flight). Use this to fire analytics events.
   */
  onLeadCaptured?: (email: string) => void;
  /**
   * Optional eyebrow / heading / subhead. Pass them on a sandbox or a
   * standalone embed; on the marketing page they live in the page hero,
   * not inside the widget, so leave them undefined.
   */
  eyebrow?: string;
  heading?: string;
  subhead?: string;
  /**
   * Optional preview node. When set AND the widget is idle or in email_gate,
   * renders side-by-side: this node on the left, the form on the right.
   * Once running, completed, or failed, the widget takes the full container
   * width and the example disappears. Pass a styled mock of the interview
   * prep output (firm-specific questions, talking points, etc). Omit for
   * single-column.
   */
  examplePanel?: ReactNode;
}

// ──────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2500;
const MAX_CONSECUTIVE_404S = 8; // ~20s of consecutive 404s before bailing

export const InterviewPrepWidget = ({
  source = "embedded",
  onLeadCaptured,
  eyebrow,
  heading,
  subhead,
  examplePanel,
}: InterviewPrepWidgetProps) => {
  const [jobInput, setJobInput] = useState("");
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);
  const missesRef = useRef<number>(0);

  useEffect(
    () => () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    },
    [],
  );

  const stopPolling = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (prepId: string) => {
    missesRef.current = 0;
    const tick = async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/tools/interview-prep/status/${prepId}`,
        );
        if (res.status === 404) {
          missesRef.current += 1;
          if (missesRef.current >= MAX_CONSECUTIVE_404S) {
            stopPolling();
            setStatus((prev) => ({
              ...(prev || ({} as StatusPayload)),
              status: "failed",
              progress: "",
              progressPercent: 0,
              currentStep: 0,
              totalSteps: 5,
              pdf_url: null,
              jobDetails: null,
              error:
                'The session expired or the server restarted while your prep was being built. Click "Try again" to start over.',
            }));
            setPhase("failed");
          }
          return;
        }
        if (!res.ok) throw new Error(`status ${res.status}`);
        missesRef.current = 0;
        const payload = (await res.json()) as StatusPayload;
        setStatus(payload);
        if (payload.status === "completed") {
          setPhase("completed");
          stopPolling();
        } else if (payload.status === "failed") {
          setPhase("failed");
          stopPolling();
        }
      } catch (err) {
        console.error("status poll failed", err);
      }
    };
    void tick();
    pollRef.current = window.setInterval(tick, POLL_INTERVAL_MS);
  };

  // Step 1: validate job input, advance to email gate.
  const onStart = () => {
    setError(null);
    const trimmed = jobInput.trim();
    if (trimmed.length < 30 && !/^https?:\/\//i.test(trimmed)) {
      setError(
        "Paste a job posting URL or the full job posting text (at least a paragraph).",
      );
      return;
    }
    setPhase("email_gate");
  };

  // Step 2: validate email, fire /generate, start polling.
  const onSubmit = async () => {
    setError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Enter a valid email.");
      return;
    }
    const trimmedJob = jobInput.trim();
    try {
      setPhase("running");
      setStatus({
        status: "queued",
        progress: "Queued...",
        progressPercent: 0,
        currentStep: 0,
        totalSteps: 5,
        error: null,
        pdf_url: null,
        jobDetails: null,
      });

      const form = new FormData();
      form.append("job_input", trimmedJob);
      form.append("email", trimmedEmail);
      if (source) form.append("source", source);

      const res = await fetch(`${API_BASE_URL}/tools/interview-prep/generate`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body && (body as { error?: string }).error) ||
            `Server returned ${res.status}`,
        );
      }
      const { prep_id } = (await res.json()) as { prep_id: string };
      onLeadCaptured?.(trimmedEmail);
      startPolling(prep_id);
    } catch (err) {
      setPhase("failed");
      setStatus({
        status: "failed",
        progress: "",
        progressPercent: 0,
        currentStep: 0,
        totalSteps: 5,
        pdf_url: null,
        jobDetails: null,
        error:
          err instanceof Error
            ? err.message
            : "Something went wrong starting your prep.",
      });
    }
  };

  const onReset = () => {
    stopPolling();
    setPhase("idle");
    setStatus(null);
    setError(null);
  };

  return (
    <div
      style={{
        width: "100%",
        fontFamily: "'DM Sans', system-ui, sans-serif",
        color: INK,
      }}
    >
      {(eyebrow || heading || subhead) && (
        <WidgetHeader eyebrow={eyebrow} heading={heading} subhead={subhead} />
      )}

      {(phase === "idle" || phase === "email_gate") && (
        examplePanel ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))",
              gap: 24,
              alignItems: "start",
            }}
          >
            <div>{examplePanel}</div>
            <div>
              {phase === "idle" ? (
                <IdleCard
                  jobInput={jobInput}
                  onChange={setJobInput}
                  onContinue={onStart}
                  error={error}
                />
              ) : (
                <EmailGateCard
                  email={email}
                  onChange={setEmail}
                  onBack={() => setPhase("idle")}
                  onSubmit={onSubmit}
                  error={error}
                />
              )}
            </div>
          </div>
        ) : phase === "idle" ? (
          <IdleCard
            jobInput={jobInput}
            onChange={setJobInput}
            onContinue={onStart}
            error={error}
          />
        ) : (
          <EmailGateCard
            email={email}
            onChange={setEmail}
            onBack={() => setPhase("idle")}
            onSubmit={onSubmit}
            error={error}
          />
        )
      )}
      {phase === "running" && status && <RunningCard status={status} />}
      {phase === "completed" && status && (
        <CompletedCard status={status} onReset={onReset} />
      )}
      {phase === "failed" && status && (
        <FailedCard status={status} onReset={onReset} />
      )}
    </div>
  );
};

export default InterviewPrepWidget;

// ── Optional header (eyebrow / heading / subhead) ─────────────────────────

const WidgetHeader = ({
  eyebrow,
  heading,
  subhead,
}: {
  eyebrow?: string;
  heading?: string;
  subhead?: string;
}) => (
  <header style={{ textAlign: "center", marginBottom: 24 }}>
    {eyebrow ? (
      <span
        style={{
          background: "#EFF5FF",
          border: "1px solid #DBEAFE",
          color: BRAND_DARK,
          fontSize: 12.5,
          fontWeight: 600,
          padding: "5px 12px",
          borderRadius: 999,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 14,
        }}
      >
        <Target style={{ width: 14, height: 14 }} />
        {eyebrow}
      </span>
    ) : null}
    {heading ? (
      <h2
        style={{
          fontFamily: SERIF,
          fontSize: 32,
          fontWeight: 400,
          color: INK,
          marginBottom: 12,
          letterSpacing: "-0.02em",
          lineHeight: 1.2,
        }}
      >
        {heading}
      </h2>
    ) : null}
    {subhead ? (
      <p
        style={{
          fontSize: 15,
          lineHeight: 1.6,
          color: "#475569",
          maxWidth: 580,
          margin: "0 auto",
        }}
      >
        {subhead}
      </p>
    ) : null}
  </header>
);

// ──────────────────────────────────────────────────────────────────────────
// Idle (paste a job posting)
// Mirrors InterviewPrepFree.tsx IdleCard.
// ──────────────────────────────────────────────────────────────────────────

const IdleCard = ({
  jobInput,
  onChange,
  onContinue,
  error,
}: {
  jobInput: string;
  onChange: (v: string) => void;
  onContinue: () => void;
  error: string | null;
}) => (
  <div
    style={{
      background: "#FFFFFF",
      border: "1px solid #E2E8F0",
      borderRadius: 6,
      padding: 24,
    }}
  >
    <label
      htmlFor="ipw-job-input"
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: INK,
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 12,
      }}
    >
      <ClipboardPaste style={{ width: 16, height: 16, color: BRAND }} />
      Paste a job posting URL or the full posting text
    </label>
    <textarea
      id="ipw-job-input"
      value={jobInput}
      onChange={(e) => onChange(e.target.value)}
      placeholder="https://boards.greenhouse.io/.../job/12345  or paste the full job posting text"
      rows={6}
      style={{
        width: "100%",
        padding: "12px",
        border: "1px solid #CBD5E1",
        borderRadius: 4,
        fontSize: 14,
        fontFamily: "inherit",
        outline: "none",
        resize: "vertical",
        color: INK,
        boxSizing: "border-box",
      }}
    />
    <p
      style={{
        fontSize: 12,
        color: "#94A3B8",
        marginTop: 8,
        lineHeight: 1.5,
      }}
    >
      Works with LinkedIn, Greenhouse, Lever, Workday, Indeed, and most company career pages.
      We do not save the posting or send you marketing email.
    </p>

    {error ? <ErrorBox>{error}</ErrorBox> : null}

    <button
      type="button"
      onClick={onContinue}
      style={{
        marginTop: 20,
        background: BRAND,
        color: "#FFFFFF",
        border: "none",
        borderRadius: 3,
        padding: "12px 20px",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      Generate my prep
      <ArrowRight style={{ width: 16, height: 16 }} />
    </button>

    <div
      style={{
        marginTop: 24,
        paddingTop: 16,
        borderTop: "1px solid #F1F5F9",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 12,
      }}
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
    <Icon style={{ width: 16, height: 16, color: BRAND }} />
    <p style={{ fontSize: 13, fontWeight: 700, color: INK, marginTop: 8, marginBottom: 0 }}>
      {title}
    </p>
    <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "#64748B", marginTop: 4, marginBottom: 0 }}>
      {body}
    </p>
  </div>
);

// ──────────────────────────────────────────────────────────────────────────
// Email gate (capture email before kicking off generate)
// ──────────────────────────────────────────────────────────────────────────

const EmailGateCard = ({
  email,
  onChange,
  onBack,
  onSubmit,
  error,
}: {
  email: string;
  onChange: (v: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  error: string | null;
}) => (
  <div
    style={{
      background: "#FFFFFF",
      border: "1px solid #E2E8F0",
      borderRadius: 6,
      padding: 24,
    }}
  >
    <p
      style={{
        fontSize: 12.5,
        fontWeight: 700,
        color: BRAND_DARK,
        letterSpacing: "0.05em",
        marginBottom: 8,
      }}
    >
      ONE LAST STEP
    </p>
    <h3
      style={{
        fontFamily: SERIF,
        fontSize: 24,
        fontWeight: 400,
        color: INK,
        margin: 0,
        marginBottom: 12,
      }}
    >
      Where should we send your prep?
    </h3>
    <p
      style={{
        fontSize: 14,
        color: "#475569",
        lineHeight: 1.6,
        marginTop: 0,
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <Lock style={{ width: 14, height: 14, color: "#94A3B8" }} />
      We email you the PDF link plus one or two interview tips for this company. No spam.
    </p>

    <input
      type="email"
      value={email}
      onChange={(e) => onChange(e.target.value)}
      placeholder="you@university.edu"
      style={{
        width: "100%",
        padding: 12,
        border: "1px solid #CBD5E1",
        borderRadius: 4,
        fontSize: 14,
        fontFamily: "inherit",
        outline: "none",
        color: INK,
        boxSizing: "border-box",
      }}
    />

    {error ? <ErrorBox>{error}</ErrorBox> : null}

    <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          background: "#FFFFFF",
          color: INK,
          border: "1px solid #CBD5E1",
          borderRadius: 3,
          padding: "12px 18px",
          fontSize: 14,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Back
      </button>
      <button
        type="button"
        onClick={onSubmit}
        style={{
          flex: 1,
          background: BRAND,
          color: "#FFFFFF",
          border: "none",
          borderRadius: 3,
          padding: "12px 20px",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        Generate my prep
        <ArrowRight style={{ width: 16, height: 16 }} />
      </button>
    </div>
  </div>
);

// ──────────────────────────────────────────────────────────────────────────
// Running (progress bar)
// Mirrors InterviewPrepFree.tsx RunningCard.
// ──────────────────────────────────────────────────────────────────────────

const RunningCard = ({ status }: { status: StatusPayload }) => (
  <div
    style={{
      background: "#FFFFFF",
      border: "1px solid #E2E8F0",
      borderRadius: 6,
      padding: 28,
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 16,
      }}
    >
      <Loader2
        style={{
          width: 20,
          height: 20,
          color: BRAND,
          animation: "ipw-spin 1s linear infinite",
        }}
      />
      <p style={{ fontSize: 15, fontWeight: 600, color: INK, margin: 0 }}>
        {status.progress || "Working..."}
      </p>
    </div>
    <div
      style={{
        height: 8,
        background: "#F1F5F9",
        borderRadius: 999,
        overflow: "hidden",
        marginBottom: 14,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.max(4, status.progressPercent || 0)}%`,
          background: BRAND,
          transition: "width 0.6s ease",
        }}
      />
    </div>
    <p style={{ fontSize: 12.5, color: "#64748B", margin: 0 }}>
      Step {status.currentStep || 1} of {status.totalSteps || 5} · usually 60 to 90 seconds.
    </p>

    {status.jobDetails?.company_name ? (
      <div
        style={{
          marginTop: 20,
          background: "#F8FAFC",
          border: "1px solid #E2E8F0",
          borderRadius: 4,
          padding: "12px 14px",
        }}
      >
        <p style={{ fontSize: 12, color: "#94A3B8", margin: 0, marginBottom: 2 }}>
          Detected role
        </p>
        <p style={{ fontSize: 14, fontWeight: 600, color: INK, margin: 0 }}>
          {status.jobDetails.job_title}{" "}
          <span style={{ color: "#94A3B8" }}>at</span>{" "}
          {status.jobDetails.company_name}
        </p>
      </div>
    ) : null}

    <style>
      {`@keyframes ipw-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
    </style>
  </div>
);

// ──────────────────────────────────────────────────────────────────────────
// Completed
// Mirrors InterviewPrepFree.tsx CompletedCard.
// ──────────────────────────────────────────────────────────────────────────

const CompletedCard = ({
  status,
  onReset,
}: {
  status: StatusPayload;
  onReset: () => void;
}) => {
  const downloadUrl = status.pdf_url || "";
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E2E8F0",
        borderRadius: 6,
        padding: 28,
      }}
    >
      <p
        style={{
          fontSize: 12.5,
          fontWeight: 700,
          color: BRAND_DARK,
          letterSpacing: "0.05em",
          margin: 0,
          marginBottom: 8,
        }}
      >
        READY
      </p>
      <h2
        style={{
          fontFamily: SERIF,
          fontSize: 26,
          fontWeight: 400,
          color: INK,
          margin: 0,
          marginBottom: 6,
        }}
      >
        Your interview prep is ready
      </h2>
      {status.jobDetails?.company_name ? (
        <p style={{ fontSize: 14, color: "#475569", marginTop: 0, marginBottom: 18 }}>
          {status.jobDetails.job_title} at {status.jobDetails.company_name}
        </p>
      ) : (
        <div style={{ height: 12 }} />
      )}

      <a
        href={downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          background: BRAND,
          color: "#FFFFFF",
          padding: "12px 20px",
          borderRadius: 3,
          fontSize: 14,
          fontWeight: 600,
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Download style={{ width: 16, height: 16 }} />
        Download PDF
      </a>
      <button
        type="button"
        onClick={onReset}
        style={{
          marginLeft: 12,
          background: "#FFFFFF",
          color: INK,
          border: "1px solid #CBD5E1",
          borderRadius: 3,
          padding: "12px 16px",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Try another posting
      </button>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// Failed
// Mirrors InterviewPrepFree.tsx FailedCard.
// ──────────────────────────────────────────────────────────────────────────

const FailedCard = ({
  status,
  onReset,
}: {
  status: StatusPayload;
  onReset: () => void;
}) => (
  <div
    style={{
      background: "#FEF2F2",
      border: "1px solid #FECACA",
      borderRadius: 6,
      padding: 24,
    }}
  >
    <p
      style={{
        fontSize: 13,
        fontWeight: 700,
        color: "#991B1B",
        margin: 0,
        marginBottom: 6,
      }}
    >
      We couldn't finish your prep
    </p>
    <p
      style={{
        fontSize: 14,
        color: "#7F1D1D",
        lineHeight: 1.6,
        marginTop: 0,
        marginBottom: 14,
      }}
    >
      {status.error || "Something went wrong. Try a different posting."}
    </p>
    <button
      type="button"
      onClick={onReset}
      style={{
        background: BRAND,
        color: "#FFFFFF",
        border: "none",
        borderRadius: 3,
        padding: "10px 18px",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      Try again
    </button>
  </div>
);

// ──────────────────────────────────────────────────────────────────────────
// Small shared bits
// ──────────────────────────────────────────────────────────────────────────

const ErrorBox = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      background: "#FEF2F2",
      border: "1px solid #FECACA",
      color: "#991B1B",
      fontSize: 13,
      padding: "10px 12px",
      borderRadius: 4,
      marginTop: 14,
    }}
  >
    {children}
  </div>
);
