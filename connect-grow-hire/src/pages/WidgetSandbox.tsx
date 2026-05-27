/*
 * WidgetSandbox at /sandbox/resume-widget.
 *
 * Bare-minimum test surface. No marketing chrome, no SEO meta - just all the
 * lead-magnet widgets stacked, each labeled with a chip naming which one it
 * is. Used to confirm the widgets are fully self-contained drop-ins before
 * embedding them on real SEO pages.
 */
import { CoverLetterWidget } from "../components/widgets/CoverLetterWidget";
import { InterviewPrepWidget } from "../components/widgets/InterviewPrepWidget";
import { ResumeReviewWidget } from "../components/widgets/ResumeReviewWidget";

const chip: React.CSSProperties = {
  display: "inline-block",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#1E40AF",
  background: "#DBEAFE",
  border: "1px solid #BFDBFE",
  padding: "4px 10px",
  borderRadius: 999,
  marginBottom: 16,
};

const WidgetSandbox = () => (
  <div
    style={{
      minHeight: "100vh",
      background: "#F1F5F9",
      padding: "40px 16px",
      boxSizing: "border-box",
    }}
  >
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
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
        Widget sandbox. Each widget below has no nav/header/footer of its own
        and is rendered with <code>source="sandbox"</code>. Same backends as the
        <code>/tools/resume-review</code>, <code>/tools/interview-prep</code>, and
        <code>/tools/cover-letter</code> pages.
      </div>

      <section style={{ marginBottom: 40 }}>
        <span style={chip}>Resume Review Widget</span>
        <ResumeReviewWidget source="sandbox" />
      </section>

      <section style={{ marginBottom: 40 }}>
        <span style={chip}>Interview Prep Widget</span>
        <InterviewPrepWidget source="sandbox" />
      </section>

      <section>
        <span style={chip}>Cover Letter Widget</span>
        <CoverLetterWidget source="sandbox" />
      </section>
    </div>
  </div>
);

export default WidgetSandbox;
