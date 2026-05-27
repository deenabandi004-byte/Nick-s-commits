/*
 * ResumeReviewWidget - self-contained, embeddable React component for the
 * free resume-review lead magnet. Drop it into any page:
 *
 *   <ResumeReviewWidget source="goldman-cover-letter-page" />
 *
 * The `source` prop is sent to /api/tools/resume-review/analyze and written
 * into the lead_magnet_emails Firestore doc so you can attribute leads to the
 * SEO page they came from.
 *
 * The widget renders its own compact form initially and expands in place to
 * show the PDF + recommendations once the user submits. No <Helmet>, no nav,
 * no footer - frame-agnostic. The results layout auto-stacks to one column
 * when the container is narrow (< ~900px).
 *
 * House style: no em dashes, no Sparkles icon.
 */
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Download,
  FileText,
  Loader2,
  Lock,
  RefreshCw,
  Undo2,
  Upload,
} from "lucide-react";
import { API_BASE_URL } from "../../services/api";

// ── Visual tokens (inlined so the widget has no shared-kit dependency) ────
const BRAND = "#3B82F6";
const BRAND_DARK = "#2563EB";
const INK = "#0F172A";
const SERIF = "'Libre Baskerville', Georgia, serif";

// ── Types ─────────────────────────────────────────────────────────────────

export type Phase = "idle" | "email_gate" | "running" | "results" | "failed";

export interface Recommendation {
  id: number;
  category: string;
  severity: "high" | "medium" | "low";
  section: string;
  original_text: string;
  suggested_text: string;
  rationale: string;
  principle: string;
}

export interface AnalyzeResponse {
  score: number;
  score_label: string;
  score_breakdown: { keywords?: number; formatting?: number; relevance?: number };
  matched_keywords: string[];
  missing_keywords: string[];
  suggestions: string[];
  recommendations: Recommendation[];
  resume_text: string;
  job_title: string | null;
  company: string | null;
  job_source: string;
}

export interface ResumeReviewWidgetProps {
  /**
   * String identifier for the page/surface embedding the widget. Stored on the
   * lead_magnet_emails record so we can attribute conversions by page.
   * Examples: "standalone-tools", "goldman-cover-letter", "alumni-anthropic".
   */
  source?: string;
  /**
   * Optional callback fired when an email is captured (after a successful
   * /analyze call). Use this to fire analytics events from the embedding page.
   */
  onLeadCaptured?: (email: string) => void;
  /**
   * Optional eyebrow / heading override. Defaults to a neutral landing prompt;
   * pass page-specific copy on SEO pages to feel native to the article.
   */
  eyebrow?: string;
  heading?: string;
  subhead?: string;
  /**
   * Optional preview node. When set AND the widget is in an idle-like phase
   * (idle, email_gate, failed), the widget renders side-by-side: this node on
   * the left, the try-it form on the right. Once the user submits and the
   * widget enters running or results, the example disappears and the widget
   * takes the full container width (the visitor's real result deserves the
   * stage). Pass a styled mock of the scored output that mirrors what the
   * real widget produces. Omit to get today's single-column behavior.
   */
  examplePanel?: ReactNode;
}

// ──────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────

export const ResumeReviewWidget = ({
  source = "embedded",
  onLeadCaptured,
  eyebrow = "FREE RESUME REVIEW",
  heading = "See your resume's score for any job in 30 seconds.",
  subhead = "Upload your resume, drop in the job posting, and see substantive line-by-line edits that get interviews. No account needed.",
  examplePanel,
}: ResumeReviewWidgetProps) => {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [jobInput, setJobInput] = useState("");
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [originalPdfUrl, setOriginalPdfUrl] = useState<string | null>(null);
  const [patchedPdfDataUrl, setPatchedPdfDataUrl] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const rebuildTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (originalPdfUrl) URL.revokeObjectURL(originalPdfUrl);
      if (rebuildTimerRef.current) window.clearTimeout(rebuildTimerRef.current);
    };
  }, [originalPdfUrl]);

  const onPickFile = (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please upload a PDF file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("PDF must be 10MB or smaller.");
      return;
    }
    setError(null);
    if (originalPdfUrl) URL.revokeObjectURL(originalPdfUrl);
    setPdfFile(file);
    setOriginalPdfUrl(URL.createObjectURL(file));
  };

  const onStart = () => {
    setError(null);
    if (!pdfFile) {
      setError("Upload your resume PDF first.");
      return;
    }
    if (!jobInput.trim()) {
      setError("Paste a job URL, role name, or full job description.");
      return;
    }
    setPhase("email_gate");
  };

  const onSubmit = async () => {
    setError(null);
    if (!email.trim() || !email.includes("@")) {
      setError("Enter a valid email.");
      return;
    }
    if (!pdfFile) return;

    setPhase("running");
    try {
      const form = new FormData();
      form.append("resume_pdf", pdfFile);
      form.append("job_input", jobInput.trim());
      form.append("email", email.trim());
      if (source) form.append("source", source);

      const res = await fetch(`${API_BASE_URL}/tools/resume-review/analyze`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
      setResult(data as AnalyzeResponse);
      setAccepted(new Set());
      setPatchedPdfDataUrl(null);
      setPhase("results");
      onLeadCaptured?.(email.trim());
    } catch (e: any) {
      setError(e?.message || "Something went wrong. Try again.");
      setPhase("failed");
    }
  };

  const triggerRebuild = useCallback(
    (acceptedSet: Set<number>) => {
      if (rebuildTimerRef.current) window.clearTimeout(rebuildTimerRef.current);
      if (!result || !pdfFile) return;
      if (acceptedSet.size === 0) {
        setPatchedPdfDataUrl(null);
        return;
      }
      rebuildTimerRef.current = window.setTimeout(async () => {
        setRebuilding(true);
        try {
          const patches = result.recommendations
            .filter((r) => acceptedSet.has(r.id) && r.original_text)
            .map((r) => ({
              original_text: r.original_text,
              replacement_text: r.suggested_text,
              type: "bullet_rewrite",
            }));
          if (patches.length === 0) {
            setPatchedPdfDataUrl(null);
            return;
          }
          const form = new FormData();
          form.append("resume_pdf", pdfFile);
          form.append("patches", JSON.stringify(patches));
          const res = await fetch(`${API_BASE_URL}/tools/resume-review/rebuild`, {
            method: "POST",
            body: form,
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || `Rebuild failed (${res.status})`);
          setPatchedPdfDataUrl(`data:application/pdf;base64,${data.pdf_base64}`);
        } catch (e: any) {
          setError(e?.message || "Preview rebuild failed.");
        } finally {
          setRebuilding(false);
        }
      }, 450);
    },
    [result, pdfFile]
  );

  const toggleAccept = (id: number) => {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      triggerRebuild(next);
      return next;
    });
  };

  const onDownload = async () => {
    if (!patchedPdfDataUrl) {
      setError("Accept at least one change before downloading.");
      return;
    }
    setDownloading(true);
    try {
      const a = document.createElement("a");
      a.href = patchedPdfDataUrl;
      a.download = `resume-improved-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setDownloading(false);
    }
  };

  const currentPdfSrc = patchedPdfDataUrl || originalPdfUrl;

  // ── Render ────────────────────────────────────────────────────────────

  const isIdleLike =
    phase === "idle" || phase === "email_gate" || phase === "failed";

  const idleCard = (
    <IdleCard
      phase={phase}
      pdfFile={pdfFile}
      jobInput={jobInput}
      email={email}
      error={error}
      eyebrow={eyebrow}
      heading={heading}
      subhead={subhead}
      fileInputRef={fileInputRef}
      onPickFile={onPickFile}
      setJobInput={setJobInput}
      setEmail={setEmail}
      onStart={onStart}
      onSubmit={onSubmit}
      onBack={() => setPhase("idle")}
    />
  );

  return (
    <div style={{ width: "100%", color: INK }}>
      {isIdleLike ? (
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
            <div>{idleCard}</div>
          </div>
        ) : (
          idleCard
        )
      ) : null}

      {phase === "running" ? <RunningCard /> : null}

      {phase === "results" && result ? (
        <ResultsLayout
          result={result}
          pdfSrc={currentPdfSrc}
          accepted={accepted}
          onToggle={toggleAccept}
          onDownload={onDownload}
          downloading={downloading}
          rebuilding={rebuilding}
          error={error}
          patchedReady={Boolean(patchedPdfDataUrl)}
        />
      ) : null}
    </div>
  );
};

export default ResumeReviewWidget;

// ──────────────────────────────────────────────────────────────────────────
// Idle / email gate
// ──────────────────────────────────────────────────────────────────────────

const IdleCard = ({
  phase,
  pdfFile,
  jobInput,
  email,
  error,
  eyebrow,
  heading,
  subhead,
  fileInputRef,
  onPickFile,
  setJobInput,
  setEmail,
  onStart,
  onSubmit,
  onBack,
}: {
  phase: Phase;
  pdfFile: File | null;
  jobInput: string;
  email: string;
  error: string | null;
  eyebrow: string;
  heading: string;
  subhead: string;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onPickFile: (f: File | undefined) => void;
  setJobInput: (v: string) => void;
  setEmail: (v: string) => void;
  onStart: () => void;
  onSubmit: () => void;
  onBack: () => void;
}) => (
  <div>
    {eyebrow || heading || subhead ? (
      <header style={{ textAlign: "center", marginBottom: 28 }}>
        {eyebrow ? (
          <div style={{ fontSize: 12, fontWeight: 700, color: BRAND, letterSpacing: "0.06em", marginBottom: 12 }}>
            {eyebrow}
          </div>
        ) : null}
        {heading ? (
          <h2 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 400, color: INK, marginBottom: 12, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
            {heading}
          </h2>
        ) : null}
        {subhead ? (
          <p style={{ fontSize: 15, lineHeight: 1.6, color: "#475569", maxWidth: 560, margin: "0 auto" }}>
            {subhead}
          </p>
        ) : null}
      </header>
    ) : null}

    <div style={cardShell}>
      <Label num={1} text="Upload your resume (PDF)" />
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onPickFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${pdfFile ? BRAND : "#CBD5E1"}`,
          borderRadius: 10,
          padding: 28,
          textAlign: "center",
          cursor: "pointer",
          background: pdfFile ? "#F0F7FF" : "#F8FAFC",
          marginBottom: 24,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          style={{ display: "none" }}
          onChange={(e) => onPickFile(e.target.files?.[0] || undefined)}
        />
        {pdfFile ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: BRAND_DARK }}>
            <FileText size={20} />
            <span style={{ fontWeight: 600 }}>{pdfFile.name}</span>
            <span style={{ fontSize: 13, color: "#64748B" }}>({Math.round(pdfFile.size / 1024)} KB)</span>
          </div>
        ) : (
          <div style={{ color: "#64748B" }}>
            <Upload size={22} style={{ marginBottom: 6 }} />
            <div style={{ fontWeight: 500, color: INK, marginBottom: 4 }}>Drop PDF here, or click to browse</div>
            <div style={{ fontSize: 13 }}>10MB max. Text-based PDFs only.</div>
          </div>
        )}
      </div>

      <Label num={2} text="Paste a job URL, role name, or the full job description" />
      <textarea
        value={jobInput}
        onChange={(e) => setJobInput(e.target.value)}
        placeholder={
          "https://jobs.lever.co/anthropic/...\nor: Software Engineer at Stripe\nor: paste the full job description"
        }
        rows={4}
        style={{
          width: "100%",
          padding: 12,
          border: "1px solid #CBD5E1",
          borderRadius: 8,
          fontSize: 14,
          fontFamily: "inherit",
          marginBottom: 24,
          resize: "vertical",
          boxSizing: "border-box",
        }}
      />

      {phase === "email_gate" ? (
        <>
          <Label num={3} text="Your email" />
          <div style={{ fontSize: 13, color: "#64748B", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <Lock size={14} />
            We use this to send you the report. No spam.
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@university.edu"
            style={{
              width: "100%",
              padding: 12,
              border: "1px solid #CBD5E1",
              borderRadius: 8,
              fontSize: 14,
              fontFamily: "inherit",
              marginBottom: 18,
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onBack} style={ghostBtn}>Back</button>
            <button onClick={onSubmit} style={{ ...primaryBtn, flex: 1 }}>Show my score</button>
          </div>
        </>
      ) : (
        <button onClick={onStart} style={{ ...primaryBtn, width: "100%" }}>Get my score</button>
      )}

      {error ? <div style={errorBox}>{error}</div> : null}
    </div>
  </div>
);

// ──────────────────────────────────────────────────────────────────────────
// Loading
// ──────────────────────────────────────────────────────────────────────────

const RunningCard = () => (
  <div style={{ ...cardShell, textAlign: "center", padding: 64 }}>
    <Loader2 size={32} style={{ color: BRAND, animation: "spin 1s linear infinite", marginBottom: 18 }} />
    <h3 style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 400, color: INK, marginBottom: 8 }}>
      Analyzing your resume...
    </h3>
    <p style={{ color: "#64748B", fontSize: 14, margin: 0 }}>
      Fetching the job description, scoring, drafting line-by-line edits. ~20 seconds.
    </p>
    <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
  </div>
);

// ──────────────────────────────────────────────────────────────────────────
// Results
// ──────────────────────────────────────────────────────────────────────────

const ResultsLayout = ({
  result,
  pdfSrc,
  accepted,
  onToggle,
  onDownload,
  downloading,
  rebuilding,
  error,
  patchedReady,
}: {
  result: AnalyzeResponse;
  pdfSrc: string | null;
  accepted: Set<number>;
  onToggle: (id: number) => void;
  onDownload: () => void;
  downloading: boolean;
  rebuilding: boolean;
  error: string | null;
  patchedReady: boolean;
}) => {
  const scoreColor = result.score >= 80 ? "#16A34A" : result.score >= 60 ? "#CA8A04" : "#DC2626";
  const grouped = useMemo(() => {
    const high = result.recommendations.filter((r) => r.severity === "high");
    const med = result.recommendations.filter((r) => r.severity === "medium");
    const low = result.recommendations.filter((r) => r.severity === "low");
    return { high, med, low };
  }, [result]);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND, letterSpacing: "0.06em" }}>YOUR ATS SCORE</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 4 }}>
            <span style={{ fontFamily: SERIF, fontSize: 48, fontWeight: 400, color: scoreColor, lineHeight: 1 }}>
              {result.score}
            </span>
            <span style={{ fontSize: 16, color: "#64748B" }}>
              / 100 — {result.score_label}
            </span>
          </div>
          {result.job_title || result.company ? (
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>
              vs {result.job_title || "this role"}{result.company ? ` at ${result.company}` : ""}
            </div>
          ) : null}
        </div>

        <button
          onClick={onDownload}
          disabled={!patchedReady || downloading}
          style={{
            ...primaryBtn,
            opacity: !patchedReady || downloading ? 0.5 : 1,
            cursor: !patchedReady || downloading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {downloading ? (
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <Download size={16} />
          )}
          Download new PDF ({accepted.size})
        </button>
      </div>

      {error ? <div style={errorBox}>{error}</div> : null}

      {/* Two columns: PDF preview gets the lion's share so the rendered
          resume is actually readable. Rec cards live in a narrower scrolling
          column on the right. Stacks to single column under ~960px container. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(0, 2.2fr) minmax(0, 1fr)",
          gap: 20,
          alignItems: "start",
        }}
        className="resume-results-grid"
      >
        <style>{`
          @media (max-width: 960px) {
            .resume-results-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
        <div style={cardShell}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <h3 style={panelHeading}>
              {patchedReady ? "Resume preview (with changes)" : "Resume preview"}
            </h3>
            {rebuilding ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: BRAND_DARK }}>
                <RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} />
                Updating...
              </span>
            ) : null}
          </div>
          <div
            style={{
              border: "1px solid #E2E8F0",
              borderRadius: 8,
              overflow: "hidden",
              background: "#F8FAFC",
            }}
          >
            {pdfSrc ? (
              <iframe
                key={pdfSrc}
                // #view=FitH tells PDF.js to fit the page horizontally to
                // the iframe width. Without this, PDF.js defaults to
                // fit-page which makes the resume tiny in a narrow iframe.
                // #toolbar=0 trims the chrome so the page itself gets more
                // vertical space (supported in Chromium PDF viewer; Firefox
                // ignores silently, no harm).
                src={`${pdfSrc}#view=FitH&toolbar=0`}
                title="Resume preview"
                style={{ width: "100%", height: 1100, border: 0, display: "block" }}
              />
            ) : (
              <div style={{ height: 1100, display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8" }}>
                No PDF loaded.
              </div>
            )}
          </div>
          <p style={{ fontSize: 12, color: "#64748B", marginTop: 10, marginBottom: 0 }}>
            Click Apply on a card to swap that text in the PDF live.
          </p>
        </div>

        <div style={{ maxHeight: 1156, overflowY: "auto", paddingRight: 4 }}>
          {grouped.high.length > 0 ? (
            <RecGroup title={`Critical (${grouped.high.length})`} tone="high" recs={grouped.high} accepted={accepted} onToggle={onToggle} />
          ) : null}
          {grouped.med.length > 0 ? (
            <RecGroup title={`Worth fixing (${grouped.med.length})`} tone="medium" recs={grouped.med} accepted={accepted} onToggle={onToggle} />
          ) : null}
          {grouped.low.length > 0 ? (
            <RecGroup title={`Polish (${grouped.low.length})`} tone="low" recs={grouped.low} accepted={accepted} onToggle={onToggle} />
          ) : null}

          {result.recommendations.length === 0 ? (
            <div style={cardShell}>
              <p style={{ fontSize: 14, color: "#64748B", margin: 0 }}>
                No specific recommendations generated. The resume may already be well aligned, or the job description was too thin.
              </p>
            </div>
          ) : null}

          {result.missing_keywords.length > 0 ? (
            <div style={{ ...cardShell, marginTop: 16 }}>
              <h3 style={panelHeading}>Missing keywords from the JD</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {result.missing_keywords.slice(0, 30).map((k) => (
                  <span key={k} style={keywordChip}>{k}</span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const RecGroup = ({
  title,
  tone,
  recs,
  accepted,
  onToggle,
}: {
  title: string;
  tone: "high" | "medium" | "low";
  recs: Recommendation[];
  accepted: Set<number>;
  onToggle: (id: number) => void;
}) => (
  <div style={{ ...cardShell, marginBottom: 16 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <SeverityBadge severity={tone} />
      <h3 style={panelHeading}>{title}</h3>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {recs.map((r) => (
        <RecCard key={r.id} rec={r} accepted={accepted.has(r.id)} onToggle={() => onToggle(r.id)} />
      ))}
    </div>
  </div>
);

const RecCard = ({
  rec,
  accepted,
  onToggle,
}: {
  rec: Recommendation;
  accepted: boolean;
  onToggle: () => void;
}) => {
  const isAddition = !rec.original_text;
  return (
    <div
      style={{
        border: `1px solid ${accepted ? BRAND : "#E2E8F0"}`,
        background: accepted ? "#F0F7FF" : "#FFF",
        borderRadius: 10,
        padding: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {rec.section ? <span style={sectionChip}>{rec.section}</span> : null}
          {rec.principle ? <span style={principleChip}>{rec.principle}</span> : null}
        </div>
        <button
          onClick={onToggle}
          title={accepted ? "Undo" : "Apply"}
          disabled={isAddition}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            border: `1px solid ${accepted ? BRAND : "#CBD5E1"}`,
            background: accepted ? BRAND : "#FFF",
            color: accepted ? "#FFF" : INK,
            padding: "6px 10px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: isAddition ? "not-allowed" : "pointer",
            opacity: isAddition ? 0.5 : 1,
          }}
        >
          {accepted ? <Undo2 size={12} /> : <Check size={12} />}
          {isAddition ? "Manual add" : accepted ? "Undo" : "Apply"}
        </button>
      </div>

      {isAddition ? (
        <div style={{ fontSize: 13, fontWeight: 600, color: INK, marginBottom: 6 }}>
          Add new line:
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "#94A3B8", textDecoration: "line-through", marginBottom: 6, lineHeight: 1.5 }}>
          {rec.original_text}
        </div>
      )}
      <div style={{ fontSize: 13.5, color: INK, fontWeight: 500, lineHeight: 1.5 }}>
        {rec.suggested_text}
      </div>
      {rec.rationale ? (
        <div style={{ fontSize: 12, color: "#475569", marginTop: 8, lineHeight: 1.5, fontStyle: "italic" }}>
          Why: {rec.rationale}
        </div>
      ) : null}
    </div>
  );
};

const SeverityBadge = ({ severity }: { severity: "high" | "medium" | "low" }) => {
  const colors = {
    high: { bg: "#FEE2E2", fg: "#991B1B", label: "Critical" },
    medium: { bg: "#FEF3C7", fg: "#92400E", label: "Notable" },
    low: { bg: "#DBEAFE", fg: "#1E40AF", label: "Polish" },
  }[severity];
  return (
    <span
      style={{
        background: colors.bg,
        color: colors.fg,
        fontSize: 11,
        fontWeight: 700,
        padding: "3px 8px",
        borderRadius: 999,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {severity === "high" ? <AlertTriangle size={11} /> : null}
      {colors.label}
    </span>
  );
};

// ── Style tokens ──────────────────────────────────────────────────────────

const cardShell: React.CSSProperties = {
  background: "#FFF",
  border: "1px solid #E2E8F0",
  borderRadius: 14,
  padding: 22,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  boxSizing: "border-box",
};

const panelHeading: React.CSSProperties = {
  fontFamily: SERIF,
  fontSize: 17,
  fontWeight: 400,
  color: INK,
  margin: 0,
};

const sectionChip: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: "3px 8px",
  borderRadius: 999,
  background: "#F1F5F9",
  color: "#475569",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const principleChip: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  padding: "3px 8px",
  borderRadius: 999,
  background: "#EFF6FF",
  color: BRAND_DARK,
};

const keywordChip: React.CSSProperties = {
  fontSize: 12,
  padding: "4px 10px",
  borderRadius: 999,
  background: "#FEF3C7",
  color: "#92400E",
};

const primaryBtn: React.CSSProperties = {
  background: BRAND,
  color: "#FFF",
  border: "none",
  borderRadius: 8,
  padding: "12px 18px",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  background: "#FFF",
  color: INK,
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  padding: "12px 18px",
  fontSize: 15,
  fontWeight: 500,
  cursor: "pointer",
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: 12,
  background: "#FEF2F2",
  border: "1px solid #FECACA",
  borderRadius: 8,
  color: "#991B1B",
  fontSize: 14,
};

const Label = ({ num, text }: { num: number; text: string }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
    <span
      style={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        background: BRAND,
        color: "#FFF",
        fontSize: 12,
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {num}
    </span>
    <span style={{ fontWeight: 600, fontSize: 14, color: INK }}>{text}</span>
  </div>
);
