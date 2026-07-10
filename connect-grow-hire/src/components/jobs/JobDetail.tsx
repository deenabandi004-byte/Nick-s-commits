import { useEffect, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import type { ProtoJob } from "@/pages/jobBoardAdapter";
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

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
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
  // Collapsed by default so FindPeoplePanel stays above the fold; the header
  // chevron expands the full description in place.
  const [expanded, setExpanded] = useState(false);
  // Collapse again whenever the user switches jobs. Without this, jumping
  // from a long expanded description into the next job leaves the toggle
  // stuck open.
  useEffect(() => {
    setExpanded(false);
  }, [job.id]);

  const decodedText =
    description.status === "loaded" ? decodeDescription(description.text) : "";
  const paragraphs = decodedText ? splitParagraphs(decodedText) : [];

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
        <div className="jb-detail-actions" data-tour="tour-job-actions">
          <div className="jb-action-row">
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
          <div className="jb-action-row">
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
          </div>
        </div>
      </div>

      <div className="jb-detail-body">
        {/* At a Glance (left) and the Job Description toggle (right) share one
            row so FindPeoplePanel stays above the fold. Expanding the
            description renders it full-width below the row. */}
        <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
          <div className="jb-detail-section" style={{ flex: 1, minWidth: 0 }}>
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

          <div className="jb-detail-section" style={{ flex: 1, minWidth: 0 }}>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                width: "100%",
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <h3 style={{ margin: 0 }}>JOB DESCRIPTION</h3>
              <ChevronRight
                size={14}
                style={{
                  color: "var(--ink-3, #94A3B8)",
                  transform: expanded ? "rotate(90deg)" : "none",
                  transition: "transform 0.15s ease",
                  flexShrink: 0,
                }}
              />
            </button>
          </div>
        </div>

        {expanded && (
          <div className="jb-detail-section">
            {description.status === "loading" && (
                <p className="jb-detail-paragraph" style={{ color: "var(--ink-3, #94A3B8)" }}>
                  Loading description...
                </p>
              )}
              {description.status === "loaded" && paragraphs.length > 0 &&
                paragraphs.map((p, i) => (
                  <p key={`p-${i}`} className="jb-detail-paragraph">{p}</p>
                ))}
              {(description.status === "empty" ||
                (description.status === "loaded" && paragraphs.length === 0)) && (
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
        )}

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

