import { useEffect, useRef, useState } from "react";

// Editorial toolbar dropdown: shows "Label: Value v" button, opens a menu of
// options on click, closes on outside click. Extracted from JobBoardPage.tsx
// without behavior changes. Used for Type / Field / Sort selectors.
//
// CSS classes (.ddown, .filt, .v, .chev, .menu, .on) live in
// JobBoardEditorial.css today and need to be ported into the redesign CSS
// in a follow-up step.

interface FilterDropdownProps {
  label: string;
  value: string;
  options: string[];
  onPick: (v: string) => void;
}

export function FilterDropdown({
  label,
  value,
  options,
  onPick,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="ddown" ref={ref}>
      <button
        className="filt"
        type="button"
        onClick={() => setOpen((v) => !v)}
      >
        {label} <span className="v">{value}</span> <span className="chev">v</span>
      </button>
      {open && (
        <div className="menu">
          {options.map((o) => (
            <button
              key={o}
              type="button"
              className={value === o ? "on" : ""}
              onClick={() => {
                onPick(o);
                setOpen(false);
              }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
