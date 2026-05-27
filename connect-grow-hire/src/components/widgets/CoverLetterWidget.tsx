/*
 * CoverLetterWidget - self-contained, embeddable React component for the
 * free cover-letter lead magnet. Drop it into any page:
 *
 *   <CoverLetterWidget source="goldman-deep-dive-page" />
 *
 * The `source` prop is sent to /api/tools/cover-letter/generate and written
 * into the lead_magnet_emails Firestore doc so you can attribute leads to the
 * SEO page they came from.
 *
 * No <Helmet>, no nav, no footer - frame-agnostic. Results layout uses CSS
 * grid auto-fit so it auto-stacks to single column when the container is
 * narrow (<~900px).
 *
 * IMPORTANT: render ONE CoverLetterWidget per page. The PDF preview iframe
 * keeps its base64 source in component state; mounting two widgets on the
 * same page would cause their PDF previews to fight for memory and could
 * stall the browser.
 *
 * House style: no em dashes, no Sparkles icon.
 */
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle,
  Copy,
  Download,
  FileText,
  Loader2,
  Lock,
  PenLine,
  RefreshCw,
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

export type Tone = "professional" | "conversational" | "enthusiastic";

export interface GenerateResponse {
  cover_letter_text: string;
  pdf_base64: string;
  job: { title: string; company: string; location: string };
  request_id: string;
}

export interface CoverLetterWidgetProps {
  source?: string;
  onLeadCaptured?: (email: string) => void;
  eyebrow?: string;
  heading?: string;
  subhead?: string;
  /**
   * Optional preview node. When set AND the widget is idle/email_gate/failed,
   * renders side-by-side: this node on the left, the form on the right. Once
   * running or results, the widget takes the full container width and the
   * example disappears (the visitor's real letter deserves the stage). Pass
   * a styled mock of the cover letter output. Omit for single-column.
   */
  examplePanel?: ReactNode;
}

// ──────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────

export const CoverLetterWidget = ({
  source = "embedded",
  onLeadCaptured,
  eyebrow = "FREE COVER LETTER WRITER",
  heading = "Get a tailored cover letter in 45 seconds.",
  subhead = "Drop your resume and the job posting. We pull live company context and write a specific, non-generic cover letter you can edit and download. No account needed.",
  examplePanel,
}: CoverLetterWidgetProps) => {
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jobInput, setJobInput] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tone, setTone] = useState<Tone>("professional");

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [editedText, setEditedText] = useState("");
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  // Whenever a new result lands, seed the editable textarea.
  useEffect(() => {
    if (result?.cover_letter_text) setEditedText(result.cover_letter_text);
  }, [result?.request_id]);

  const pdfDataUrl = useMemo(
    () => (result?.pdf_base64 ? `data:application/pdf;base64,${result.pdf_base64}` : null),
    [result?.pdf_base64]
  );

  const onPickFile = (file: File | undefined) => {
    if (!file) return;
    const ext = file.name.toLowerCase().split(".").pop() || "";
    const okType =
      file.type === "application/pdf" ||
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      ext === "pdf" ||
      ext === "docx";
    if (!okType) {
      setError("Please upload a PDF or DOCX file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Resume must be 10MB or smaller.");
      return;
    }
    setError(null);
    setResumeFile(file);
  };

  const onStart = () => {
    setError(null);
    if (!resumeFile) {
      setError("Upload your resume first.");
      return;
    }
    if (!jobInput.trim()) {
      setError("Paste a job URL, role name, or the full job description.");
      return;
    }
    setPhase("email_gate");
  };

  const submitGenerate = async () => {
    if (!resumeFile) return;
    const form = new FormData();
    form.append("resume", resumeFile);
    form.append("job_input", jobInput.trim());
    form.append("email", email.trim());
    if (name.trim()) form.append("name", name.trim());
    form.append("tone", tone);
    form.append("source", source);

    const res = await fetch(`${API_BASE_URL}/tools/cover-letter/generate`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || data?.error || `Request failed (${res.status})`);
    return data as GenerateResponse;
  };

  const onSubmitEmail = async () => {
    setError(null);
    if (!email.trim() || !email.includes("@")) {
      setError("Enter a valid email.");
      return;
    }
    if (!resumeFile) return;
    setPhase("running");
    try {
      const data = await submitGenerate();
      if (!data) throw new Error("No response from server.");
      setResult(data);
      setPhase("results");
      onLeadCaptured?.(email.trim());
    } catch (e: any) {
      setError(e?.message || "Something went wrong. Try again.");
      setPhase("failed");
    }
  };

  const onRegenerate = async () => {
    if (!resumeFile) return;
    setError(null);
    setRegenerating(true);
    try {
      const data = await submitGenerate();
      if (!data) throw new Error("No response from server.");
      setResult(data);
      // editedText is reseeded via the useEffect on request_id
    } catch (e: any) {
      setError(e?.message || "Regenerate failed. Try again.");
    } finally {
      setRegenerating(false);
    }
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(editedText);
      setCopied(true);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Copy failed. Select the text and use Cmd+C / Ctrl+C.");
    }
  };

  const onDownload = () => {
    if (!result?.pdf_base64) {
      setError("No PDF available to download.");
      return;
    }
    const a = document.createElement("a");
    const co = (result.job?.company || "cover-letter").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    a.href = `data:application/pdf;base64,${result.pdf_base64}`;
    a.download = `cover-letter-${co || "offerloop"}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // ── Render ────────────────────────────────────────────────────────────

  const isIdleLike =
    phase === "idle" || phase === "email_gate" || phase === "failed";

  const idleCard = (
    <IdleCard
      phase={phase}
      resumeFile={resumeFile}
      jobInput={jobInput}
      name={name}
      email={email}
      tone={tone}
      error={error}
      eyebrow={eyebrow}
      heading={heading}
      subhead={subhead}
      fileInputRef={fileInputRef}
      onPickFile={onPickFile}
      setJobInput={setJobInput}
      setName={setName}
      setEmail={setEmail}
      setTone={setTone}
      onStart={onStart}
      onSubmit={onSubmitEmail}
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
          pdfDataUrl={pdfDataUrl}
          editedText={editedText}
          onEdit={setEditedText}
          onCopy={onCopy}
          copied={copied}
          onDownload={onDownload}
          onRegenerate={onRegenerate}
          regenerating={regenerating}
          error={error}
        />
      ) : null}
    </div>
  );
};

export default CoverLetterWidget;

// ──────────────────────────────────────────────────────────────────────────
// Idle / email gate
// ──────────────────────────────────────────────────────────────────────────

const IdleCard = ({
  phase,
  resumeFile,
  jobInput,
  name,
  email,
  tone,
  error,
  eyebrow,
  heading,
  subhead,
  fileInputRef,
  onPickFile,
  setJobInput,
  setName,
  setEmail,
  setTone,
  onStart,
  onSubmit,
  onBack,
}: {
  phase: Phase;
  resumeFile: File | null;
  jobInput: string;
  name: string;
  email: string;
  tone: Tone;
  error: string | null;
  eyebrow: string;
  heading: string;
  subhead: string;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onPickFile: (f: File | undefined) => void;
  setJobInput: (v: string) => void;
  setName: (v: string) => void;
  setEmail: (v: string) => void;
  setTone: (v: Tone) => void;
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
      {/* Step 1: resume */}
      <Label num={1} text="Upload your resume (PDF or DOCX)" />
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onPickFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${resumeFile ? BRAND : "#CBD5E1"}`,
          borderRadius: 10,
          padding: 28,
          textAlign: "center",
          cursor: "pointer",
          background: resumeFile ? "#F0F7FF" : "#F8FAFC",
          marginBottom: 24,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          style={{ display: "none" }}
          onChange={(e) => onPickFile(e.target.files?.[0] || undefined)}
        />
        {resumeFile ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: BRAND_DARK }}>
            <FileText size={20} />
            <span style={{ fontWeight: 600 }}>{resumeFile.name}</span>
            <span style={{ fontSize: 13, color: "#64748B" }}>({Math.round(resumeFile.size / 1024)} KB)</span>
          </div>
        ) : (
          <div style={{ color: "#64748B" }}>
            <Upload size={22} style={{ marginBottom: 6 }} />
            <div style={{ fontWeight: 500, color: INK, marginBottom: 4 }}>Drop PDF or DOCX here, or click to browse</div>
            <div style={{ fontSize: 13 }}>10MB max. Text-based files only.</div>
          </div>
        )}
      </div>

      {/* Step 2: job */}
      <Label num={2} text="Paste a job URL, role name, or the full job description" />
      <textarea
        value={jobInput}
        onChange={(e) => setJobInput(e.target.value)}
        placeholder={
          "https://boards.greenhouse.io/.../job/12345\nor: Software Engineer at Stripe\nor: paste the full job description"
        }
        rows={4}
        style={{
          width: "100%",
          padding: 12,
          border: "1px solid #CBD5E1",
          borderRadius: 8,
          fontSize: 14,
          fontFamily: "inherit",
          marginBottom: 18,
          resize: "vertical",
          boxSizing: "border-box",
        }}
      />

      {/* Tone selector */}
      <Label num={3} text="Pick a tone" />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        {(["professional", "conversational", "enthusiastic"] as Tone[]).map((t) => {
          const active = tone === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTone(t)}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: `1px solid ${active ? BRAND : "#CBD5E1"}`,
                background: active ? "#F0F7FF" : "#FFF",
                color: active ? BRAND_DARK : INK,
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      {/* Step 4: email gate OR start */}
      {phase === "email_gate" ? (
        <>
          <Label num={4} text="Your name and email" />
          <div style={{ fontSize: 13, color: "#64748B", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <Lock size={14} />
            We use this to sign the letter and follow up if Offerloop can help on the next application. No spam.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 18 }}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name (Jane Doe)"
              style={textInput}
              autoFocus
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@university.edu"
              style={textInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSubmit();
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onBack} style={ghostBtn} type="button">Back</button>
            <button onClick={onSubmit} style={{ ...primaryBtn, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }} type="button">
              <PenLine size={16} />
              Write my cover letter
            </button>
          </div>
        </>
      ) : (
        <button
          onClick={onStart}
          style={{ ...primaryBtn, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          type="button"
        >
          <PenLine size={16} />
          Get my cover letter
        </button>
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
      Writing your cover letter...
    </h3>
    <p style={{ color: "#64748B", fontSize: 14, margin: 0, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
      Scraping the posting, researching the company, drafting the letter, building the PDF. Usually 30 to 60 seconds.
    </p>
    <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
  </div>
);

// ──────────────────────────────────────────────────────────────────────────
// Results
// ──────────────────────────────────────────────────────────────────────────

const ResultsLayout = ({
  result,
  pdfDataUrl,
  editedText,
  onEdit,
  onCopy,
  copied,
  onDownload,
  onRegenerate,
  regenerating,
  error,
}: {
  result: GenerateResponse;
  pdfDataUrl: string | null;
  editedText: string;
  onEdit: (v: string) => void;
  onCopy: () => void;
  copied: boolean;
  onDownload: () => void;
  onRegenerate: () => void;
  regenerating: boolean;
  error: string | null;
}) => (
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
        <div style={{ fontSize: 11, fontWeight: 700, color: BRAND, letterSpacing: "0.06em" }}>READY</div>
        <h3 style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 400, color: INK, margin: "4px 0 0 0" }}>
          Your cover letter
        </h3>
        {result.job?.title || result.job?.company ? (
          <div style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>
            {result.job.title}{result.job.company ? ` at ${result.job.company}` : ""}
            {result.job.location ? ` - ${result.job.location}` : ""}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={onRegenerate} disabled={regenerating} style={{ ...ghostBtn, display: "flex", alignItems: "center", gap: 6 }} type="button">
          {regenerating ? (
            <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <RefreshCw size={14} />
          )}
          Regenerate
        </button>
        <button onClick={onCopy} style={{ ...ghostBtn, display: "flex", alignItems: "center", gap: 6 }} type="button">
          {copied ? <CheckCircle size={14} style={{ color: "#16A34A" }} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy text"}
        </button>
        <button onClick={onDownload} style={{ ...primaryBtn, display: "flex", alignItems: "center", gap: 8 }} type="button">
          <Download size={16} />
          Download PDF
        </button>
      </div>
    </div>

    {error ? <div style={errorBox}>{error}</div> : null}

    {/* Two-column when container >= ~900px, single-column when narrower */}
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))",
        gap: 20,
        alignItems: "start",
      }}
    >
      <div style={cardShell}>
        <h4 style={panelHeading}>PDF preview</h4>
        <div
          style={{
            border: "1px solid #E2E8F0",
            borderRadius: 8,
            overflow: "hidden",
            background: "#F8FAFC",
            marginTop: 10,
          }}
        >
          {pdfDataUrl ? (
            <iframe
              key={result.request_id}
              src={pdfDataUrl}
              title="Cover letter preview"
              style={{ width: "100%", height: 720, border: 0, display: "block" }}
            />
          ) : (
            <div style={{ height: 720, display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8" }}>
              No PDF generated.
            </div>
          )}
        </div>
        <p style={{ fontSize: 12, color: "#64748B", marginTop: 10, marginBottom: 0 }}>
          Edits to the text on the right don't auto-rebuild the PDF. Hit Download to get the PDF as generated, or copy the edited text into Word.
        </p>
      </div>

      <div style={cardShell}>
        <h4 style={panelHeading}>Edit the text</h4>
        <p style={{ fontSize: 12, color: "#64748B", marginTop: 6, marginBottom: 10 }}>
          Tweak phrasing, swap a sentence, or strip a paragraph. Then copy the final version.
        </p>
        <textarea
          value={editedText}
          onChange={(e) => onEdit(e.target.value)}
          rows={28}
          style={{
            width: "100%",
            padding: 14,
            border: "1px solid #E2E8F0",
            borderRadius: 8,
            fontSize: 14,
            lineHeight: 1.6,
            fontFamily: "Georgia, 'Libre Baskerville', serif",
            background: "#FFF",
            color: INK,
            resize: "vertical",
            boxSizing: "border-box",
            minHeight: 480,
          }}
        />
        <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 8 }}>
          {editedText.length} characters · ~{Math.max(1, Math.round(editedText.split(/\s+/).filter(Boolean).length))} words
        </div>
      </div>
    </div>
  </div>
);

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

const textInput: React.CSSProperties = {
  width: "100%",
  padding: 12,
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  fontSize: 14,
  fontFamily: "inherit",
  boxSizing: "border-box",
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
  fontSize: 14,
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
