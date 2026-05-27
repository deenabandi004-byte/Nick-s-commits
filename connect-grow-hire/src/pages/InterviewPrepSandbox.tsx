/*
 * InterviewPrepSandbox at /sandbox/interview-prep-widget.
 *
 * Bare-minimum surface that renders ONLY the InterviewPrepWidget. No
 * marketing chrome, no other widgets. Used to dogfood / QA the widget
 * in isolation before embedding it on real SEO landing pages.
 */
import { InterviewPrepWidget } from "../components/widgets/InterviewPrepWidget";

const InterviewPrepSandbox = () => (
  <div
    style={{
      minHeight: "100vh",
      background: "#F1F5F9",
      padding: "40px 16px",
      boxSizing: "border-box",
    }}
  >
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <div
        style={{
          marginBottom: 24,
          padding: "12px 18px",
          background: "#FFFBEB",
          border: "1px dashed #FCD34D",
          borderRadius: 8,
          color: "#78350F",
          fontSize: 13,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        }}
      >
        Interview Prep widget sandbox. The widget below has no nav/header/footer
        of its own and is rendered with <code>source="sandbox"</code>. Same
        backend as the <code>/tools/interview-prep</code> page.
      </div>

      <InterviewPrepWidget
        source="sandbox"
        eyebrow="FREE INTERVIEW PREP"
        heading="Paste any job posting, get a real interview prep."
        subhead="We pull candidate reports from Reddit, run live Perplexity research, and hand back a source-backed PDF in about 60 to 90 seconds. No signup."
      />
    </div>
  </div>
);

export default InterviewPrepSandbox;
