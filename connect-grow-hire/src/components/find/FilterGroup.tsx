// connect-grow-hire/src/components/find/FilterGroup.tsx
// One accordion group in the Find filter rail: label + chips + tag input.
import { useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";

interface FilterGroupProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  suggestions?: string[];      // optional autocomplete pool
  placeholder?: string;
  singleValue?: boolean;       // Companies tab: industry/location are single strings
}

const MAX_VALUES = 5;

export function FilterGroup({ label, values, onChange, suggestions = [], placeholder, singleValue = false }: FilterGroupProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = draft.trim().toLowerCase();
    if (q.length < 2) return [];
    return suggestions
      .filter((s) => s.toLowerCase().includes(q) && !values.includes(s))
      .slice(0, 6);
  }, [draft, suggestions, values]);

  const add = (raw: string) => {
    if (!singleValue && values.length >= MAX_VALUES) return;
    const v = raw.trim().slice(0, 100);
    if (!v || values.includes(v)) return;
    onChange(singleValue ? [v] : [...values, v].slice(0, MAX_VALUES));
    setDraft("");
  };

  const remove = (v: string) => onChange(values.filter((x) => x !== v));

  return (
    <div style={{ borderBottom: "1px solid var(--line, #E8E8E8)" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between transition-colors"
        style={{
          padding: "10px 12px", fontSize: 13, fontWeight: 500,
          color: "var(--ink, #111318)", background: "transparent",
          border: "none", cursor: "pointer", fontFamily: "inherit",
        }}
      >
        <span className="flex items-center" style={{ gap: 7 }}>
          {label}
          {values.length > 0 && (
            <span
              className="font-mono"
              style={{
                fontSize: 10, padding: "1px 6px", borderRadius: 999,
                background: "var(--primary-50, #EEF1F9)", color: "var(--accent, #4A60A8)",
              }}
            >
              {values.length}
            </span>
          )}
        </span>
        <ChevronDown
          style={{
            width: 14, height: 14, color: "var(--ink-3, #94A3B8)",
            transform: open ? "rotate(180deg)" : "none", transition: "transform .15s",
          }}
        />
      </button>

      {open && (
        <div style={{ padding: "0 12px 10px" }}>
          {values.length > 0 && (
            <div className="flex flex-wrap" style={{ gap: 5, marginBottom: 7 }}>
              {values.map((v) => (
                <span
                  key={v}
                  className="inline-flex items-center"
                  style={{
                    gap: 4, padding: "3px 8px", borderRadius: 999, fontSize: 12,
                    background: "var(--primary-50, #EEF1F9)", color: "var(--accent, #4A60A8)",
                  }}
                >
                  {v}
                  <button
                    type="button"
                    onClick={() => remove(v)}
                    aria-label={`Remove ${v}`}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", color: "inherit" }}
                  >
                    <X style={{ width: 11, height: 11 }} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div style={{ position: "relative" }}>
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); add(draft); }
              }}
              disabled={!singleValue && values.length >= MAX_VALUES}
              placeholder={!singleValue && values.length >= MAX_VALUES ? "Max 5" : placeholder ?? `Add ${label.toLowerCase()}…`}
              style={{
                width: "100%", padding: "6px 9px", fontSize: 12.5,
                border: "1px solid var(--line, #E8E8E8)", borderRadius: 7,
                outline: "none", fontFamily: "inherit", background: "#fff",
              }}
            />
            {matches.length > 0 && (
              <div
                style={{
                  position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 30,
                  background: "#fff", border: "1px solid var(--line, #E8E8E8)",
                  borderRadius: 8, boxShadow: "0 6px 18px rgba(15,18,25,0.10)", overflow: "hidden",
                }}
              >
                {matches.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => add(m)}
                    className="block w-full text-left"
                    style={{
                      padding: "7px 10px", fontSize: 12.5, background: "transparent",
                      border: "none", cursor: "pointer", fontFamily: "inherit", color: "var(--ink, #111318)",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--brand-blue-subtle, #F5F8FF)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
