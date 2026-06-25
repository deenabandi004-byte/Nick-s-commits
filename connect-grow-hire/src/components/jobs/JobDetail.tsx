import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ProtoJob } from "@/pages/jobBoardAdapter";
import { apiService } from "@/services/api";
import { CompanyLogo } from "./CompanyLogo";
import {
  IconArrowRight,
  IconBookmark,
  IconClock,
  IconLocation,
  IconSalary,
  IconShare,
} from "./icons";
import { FindPeoplePanel } from "./FindPeoplePanel";

// JobDetail renders the right pane. Prototype-faithful (offerloop-job-board.html
// lines 760-816):
// - 160px slate banner
// - Header with logo, title, "company · posted · X people clicked apply"
// - Save / Share / Apply buttons
// - At a Glance section (location, jobtype, salary green)
// - Job Description section
// - FindPeoplePanel embedded at the bottom

// Loading / loaded / empty / error are distinct so the panel never shows
// placeholder filler in place of a real description.
export type JobDescriptionState =
  | { status: "loading" }
  | { status: "loaded"; text: string }
  | { status: "empty" }
  | { status: "error" };

interface JobDetailProps {
  job: ProtoJob;
  description: JobDescriptionState;
  onRetryDescription?: () => void;
  isSaved: boolean;
  onApply: () => void;
  onAutoApply?: () => void;
  autoApplyLoading?: boolean;
  onSave: () => void;
  onShare?: () => void;
  onFindPeople: () => void;
  onFindEmployees?: (count: number) => void;
  userPlan?: "free" | "pro" | "elite" | "premium";
  currentCredits?: number;
}

// Defensive decoder. The Greenhouse scraper now html.unescape-s entities at
// write time, but historical docs may still contain `&lt;` / `&amp;nbsp;` /
// stray tags. Running this on every description means a future scraper drift
// cannot reproduce the literal-`&lt;p&gt;`-on-screen bug. Idempotent on
// already-clean text.
function decodeDescription(raw: string): string {
  const entityMap: Record<string, string> = {
    "&lt;": "<",
    "&gt;": ">",
    "&amp;": "&",
    "&nbsp;": " ",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
  };
  // Run twice. Greenhouse historical docs are double-encoded: `&amp;nbsp;`
  // becomes `&nbsp;` after one pass, then ` ` after the second. The backfill
  // only does one pass too, so the second pass also covers any document the
  // backfill has touched but never sees again.
  let out = raw;
  for (let i = 0; i < 2; i++) {
    out = out.replace(/&(?:lt|gt|amp|nbsp|quot|#39|apos);/g, (m) => entityMap[m] ?? m);
  }
  // Strip any tags revealed by decoding.
  out = out.replace(/<[^>]+>/g, " ");
  // Collapse runs of whitespace introduced by tag removal.
  return out.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim();
}

// Characters per paragraph used as the collapsed preview budget. Tuned so
// the average detail card shows roughly the first half-screen of body copy
// before the user has to commit to expanding.
const PREVIEW_BUDGET = 600;

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function buildPreview(paragraphs: string[]): { preview: string[]; truncated: boolean } {
  if (paragraphs.length === 0) return { preview: [], truncated: false };
  const preview: string[] = [];
  let budget = PREVIEW_BUDGET;
  for (const p of paragraphs) {
    if (budget <= 0) break;
    if (p.length <= budget) {
      preview.push(p);
      budget -= p.length;
    } else {
      preview.push(p.slice(0, budget).trimEnd() + "...");
      budget = 0;
      break;
    }
  }
  const previewLen = preview.reduce((n, p) => n + p.length, 0);
  const fullLen = paragraphs.reduce((n, p) => n + p.length, 0);
  const truncated = preview.length < paragraphs.length || previewLen < fullLen;
  return { preview, truncated };
}

export function JobDetail({
  job,
  description,
  onRetryDescription,
  isSaved,
  onApply,
  onAutoApply,
  autoApplyLoading = false,
  onSave,
  onShare,
  onFindPeople,
  onFindEmployees,
  userPlan,
  currentCredits,
}: JobDetailProps) {
  const [expanded, setExpanded] = useState(false);
  // Collapse back to preview whenever the user switches jobs. Without this,
  // jumping from a long expanded description into a short next job leaves
  // the toggle stuck in the wrong state.
  useEffect(() => {
    setExpanded(false);
  }, [job.id]);

  const decodedText =
    description.status === "loaded" ? decodeDescription(description.text) : "";
  const paragraphs = decodedText ? splitParagraphs(decodedText) : [];
  const { preview, truncated } = buildPreview(paragraphs);
  const paragraphsToShow = expanded ? paragraphs : preview;

  return (
    <>
      <div className="jb-banner">
        <CompanyLogo
          className="jb-banner-watermark"
          company={job.company}
          monogram={job.logoMonogram}
          fallbackUrl={job.logoUrl}
          imageBg="transparent"
        />
      </div>

      <div className="jb-detail-header">
        <div className="jb-detail-header-left">
          <CompanyLogo
            className="jb-detail-logo"
            company={job.company}
            monogram={job.logoMonogram}
            fallbackUrl={job.logoUrl}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="jb-detail-title">{job.title}</h2>
            <div className="jb-detail-meta">
              {job.company} · {job.detailPosted || job.posted} · Over 100 people clicked apply
            </div>
          </div>
        </div>
        <div className="jb-detail-actions">
          <button
            className={`jb-action ${isSaved ? "saved" : ""}`}
            type="button"
            onClick={onSave}
          >
            <IconBookmark filled={isSaved} color={isSaved ? "#3B82F6" : "currentColor"} />
            {isSaved ? "Saved" : "Save"}
          </button>
          <button className="jb-action" type="button" onClick={onShare}>
            <IconShare />
            Share
          </button>
          {job.autoApplyEligible && onAutoApply && (
            <button
              className="jb-action primary"
              type="button"
              onClick={onAutoApply}
              disabled={autoApplyLoading}
              aria-busy={autoApplyLoading}
              style={autoApplyLoading ? { opacity: 0.7, cursor: "wait" } : undefined}
              title="We fill the application for you using your saved profile"
            >
              {autoApplyLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" style={{ marginRight: 6 }} />
                  Applying…
                </>
              ) : (
                <>
                  Auto-apply
                  <IconArrowRight />
                </>
              )}
            </button>
          )}
          <button
            className={`jb-action ${job.autoApplyEligible && onAutoApply ? "" : "primary"}`}
            type="button"
            onClick={onApply}
          >
            Apply
            <IconArrowRight />
          </button>
        </div>
      </div>

      <div className="jb-detail-body">
        <div className="jb-detail-section">
          <h3>AT A GLANCE</h3>
          <div className="jb-glance">
            <div className="jb-glance-row">
              <IconLocation />
              <span>{job.detailLocation || job.location || "Location TBD"}</span>
            </div>
            <div className="jb-glance-row">
              <IconClock />
              <span>{job.jobType}</span>
            </div>
            {job.salary && (
              <div className="jb-glance-row salary">
                <IconSalary />
                <span>{job.salary}</span>
              </div>
            )}
          </div>
        </div>

        <div className="jb-divider" />

        <div className="jb-detail-section">
          <h3>JOB DESCRIPTION</h3>
          {description.status === "loading" && (
            <p className="jb-detail-paragraph" style={{ color: "var(--ink-3, #94A3B8)" }}>
              Loading description...
            </p>
          )}
          {description.status === "loaded" && paragraphsToShow.length > 0 && (
            <>
              {paragraphsToShow.map((p, i) => (
                <p key={`p-${i}`} className="jb-detail-paragraph">{p}</p>
              ))}
              {truncated && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="jb-detail-expand"
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    marginTop: 4,
                    color: "var(--brand, #3B82F6)",
                    cursor: "pointer",
                    font: "inherit",
                    fontWeight: 500,
                  }}
                >
                  {expanded ? "Show less" : "Show full description"}
                </button>
              )}
            </>
          )}
          {description.status === "loaded" && paragraphsToShow.length === 0 && (
            <p className="jb-detail-paragraph" style={{ color: "var(--ink-3, #94A3B8)" }}>
              No description provided for this role.
            </p>
          )}
          {description.status === "empty" && (
            <p className="jb-detail-paragraph" style={{ color: "var(--ink-3, #94A3B8)" }}>
              No description provided for this role.
            </p>
          )}
          {description.status === "error" && (
            <p className="jb-detail-paragraph" style={{ color: "var(--ink-3, #94A3B8)" }}>
              Couldn't load the description.{" "}
              <button
                type="button"
                onClick={onRetryDescription}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "var(--brand, #3B82F6)",
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                Try again
              </button>
            </p>
          )}
        </div>

        <div className="jb-divider" />

        <FindPeoplePanel
          userPlan={userPlan}
          currentCredits={currentCredits}
          onFind={onFindPeople}
          onFindEmployees={onFindEmployees}
        />
      </div>
    </>
  );
}

