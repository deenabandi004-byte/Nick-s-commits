// Segmented control that switches the Job Board between its two layouts:
//   • "list"    — the personalized two-pane board (JobBoardPage.redesign)
//   • "gallery" — the browse-everything card gallery (BrowseJobsPage)
//
// Rendered in the same spot in both boards so switching is one obvious click.
// The container (JobBoardContainer) owns the actual view state + persistence.
import React from "react";
import { List, LayoutGrid } from "lucide-react";

export type JobBoardView = "list" | "gallery";

interface JobBoardViewToggleProps {
  view: JobBoardView;
  onChange: (view: JobBoardView) => void;
}

export const JobBoardViewToggle: React.FC<JobBoardViewToggleProps> = ({ view, onChange }) => {
  const options: { key: JobBoardView; label: string; Icon: typeof List }[] = [
    { key: "list", label: "List", Icon: List },
    { key: "gallery", label: "Gallery", Icon: LayoutGrid },
  ];

  return (
    <div
      role="tablist"
      aria-label="Job board view"
      style={{
        display: "inline-flex",
        padding: 3,
        gap: 2,
        borderRadius: 10,
        background: "var(--paper-2, #F1F5F9)",
        border: "1px solid var(--line, #E5E5E5)",
      }}
    >
      {options.map(({ key, label, Icon }) => {
        const active = view === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => !active && onChange(key)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 8,
              border: "none",
              cursor: active ? "default" : "pointer",
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 600,
              color: active ? "var(--brand-blue, #3B82F6)" : "var(--ink-3, #94A3B8)",
              background: active ? "var(--paper, #fff)" : "transparent",
              boxShadow: active ? "0 1px 2px rgba(15,23,42,0.08)" : "none",
              transition: "color .12s, background .12s",
            }}
          >
            <Icon size={15} strokeWidth={2} />
            {label}
          </button>
        );
      })}
    </div>
  );
};

export default JobBoardViewToggle;
