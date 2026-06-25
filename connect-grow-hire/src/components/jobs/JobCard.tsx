import React, { useState } from "react";
import type { ProtoJob } from "@/pages/jobBoardAdapter";
import { CompanyLogo } from "./CompanyLogo";
import {
  IconClock,
  IconDismiss,
  IconInfoGreen,
  IconLocation,
  IconRefresh,
  IconSalary,
} from "./icons";

// JobCard renders one row in the left list. Prototype-faithful markup
// (offerloop-job-board.html lines 704-758).
// - White card, 1px solid #e5e5e5 border, radius 8, padding 20.
// - 41x41 logo tile with first letter (or employer_logo image).
// - Title 18px, weight 400. Company + posted on one line.
// - Meta row: location (slate), jobtype (slate), salary (green) when present.
// - Tags row: New badge, match% green pill with info icon, content tags.
// - Dismiss X top-right -> dismissed state shows undo refresh icon.

interface JobCardProps {
  job: ProtoJob;
  selected: boolean;
  dismissed?: boolean;
  onClick: () => void;
  onDismiss: () => void;
  onUndo?: () => void;
}

export function JobCard({
  job,
  selected,
  dismissed,
  onClick,
  onDismiss,
  onUndo,
}: JobCardProps) {
  const [dismissing, setDismissing] = useState(false);

  if (dismissed) {
    return (
      <div className="jb-card dismissed">
        <div className="jb-card-top">
          <div className="jb-card-top-left">
            <CompanyLogo
              className="jb-logo"
              company={job.company}
              monogram={job.logoMonogram}
              fallbackUrl={job.logoUrl}
            />
            <div className="jb-card-body">
              <div className="jb-card-title" style={{ color: "var(--ink-7)" }}>{job.title}</div>
              <div className="jb-card-sub" style={{ color: "var(--ink-7)" }}>{job.company}</div>
            </div>
          </div>
          <button
            className="jb-dismiss"
            onClick={(e) => { e.stopPropagation(); onUndo?.(); }}
            type="button"
            title="Undo"
          >
            <IconRefresh />
          </button>
        </div>
        <span className="jb-undo-note">We won't show you this job again.</span>
      </div>
    );
  }

  const handleDismiss: React.MouseEventHandler = async (e) => {
    e.stopPropagation();
    setDismissing(true);
    try {
      await onDismiss();
    } catch {
      setDismissing(false);
    }
  };

  return (
    <div
      className={`jb-card ${selected ? "selected" : ""} ${dismissing ? "dismissed" : ""}`}
      onClick={onClick}
    >
      <div className="jb-card-top">
        <div className="jb-card-top-left">
          <CompanyLogo
            className="jb-logo"
            company={job.company}
            monogram={job.logoMonogram}
            fallbackUrl={job.logoUrl}
          />
          <div className="jb-card-body">
            <div className="jb-card-title">{job.title}</div>
            <div className="jb-card-sub">
              <span className="co">{job.company}</span>
              {job.posted && <> · <span className="posted">{job.posted}</span></>}
            </div>
          </div>
        </div>
        <button
          className="jb-dismiss"
          onClick={handleDismiss}
          type="button"
          title="Not for me"
        >
          <IconDismiss />
        </button>
      </div>

      <div className="jb-card-meta">
        {job.location && (
          <span className="jb-card-meta-item">
            <IconLocation />
            {job.location}
          </span>
        )}
        <span className="jb-card-meta-item">
          <IconClock />
          {job.jobType}
        </span>
        {job.salary && (
          <span className="jb-card-meta-item salary">
            <IconSalary />
            {job.salary}
          </span>
        )}
      </div>

      <div className="jb-card-tags">
        {job.isNew && <span className="jb-tag new">New!</span>}
        {/* Wording-based fit label. The internal match score still drives the
            tier, but the user sees a phrase, not a number — the algorithm's
            precision is noisy, and a "47% Match" feels worse than the
            underlying signal warrants. Three tiers:
              60+   green  "Strong fit"
              30-59 orange "Similar to you"
              <30   hidden (no label) */}
        {job.match != null && job.match >= 60 && (
          <span className="jb-tag match">Strong fit</span>
        )}
        {job.match != null && job.match >= 30 && job.match < 60 && (
          <span className="jb-tag match-cool">Similar to you</span>
        )}
        {job.tags.map((t, i) => (
          <span key={`tag-${i}`} className="jb-tag">{t}</span>
        ))}
      </div>
    </div>
  );
}
