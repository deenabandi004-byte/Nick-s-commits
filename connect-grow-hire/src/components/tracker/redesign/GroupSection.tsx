import { type ReactNode } from "react";

// Single accordion section. Used by ContactListAccordion to render stage groups.

interface GroupSectionProps {
  label: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
  // Optional element between the chevron and the label, e.g. a company logo.
  leading?: ReactNode;
}

export function GroupSection({ label, count, isOpen, onToggle, children, leading }: GroupSectionProps) {
  return (
    <>
      <button
        type="button"
        className="group-header"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span className={`group-chevron${isOpen ? "" : " closed"}`}>
          <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="1.33333" />
          </svg>
        </span>
        {leading}
        <span className="group-label">{label}</span>
        <span className="group-count">{count}</span>
      </button>
      <div className={`group-body${isOpen ? "" : " collapsed"}`}>{children}</div>
    </>
  );
}
