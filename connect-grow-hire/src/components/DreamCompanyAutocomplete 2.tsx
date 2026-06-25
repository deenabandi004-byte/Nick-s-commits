import {
  useState,
  useMemo,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { X, Plus, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { companies } from "@/data/companies";

export interface DreamCompanyAutocompleteHandle {
  /** Commit any text the user typed but didn't submit via Enter/comma.
   *  Returns the final array (also fired via onChange).
   *  Use on form submit to avoid losing in-progress input. */
  flushPending: () => string[];
}

// Career-track → companies.ts industry buckets. Drives the
// "Suggested for you" pills under the autocomplete input.
const TRACK_TO_INDUSTRIES: Record<string, string[]> = {
  "Investment Banking": ["investment-banking"],
  "Management Consulting": ["consulting"],
  "Private Equity / VC": ["private-equity", "finance"],
  "Product Management": ["tech"],
  "Software Engineering": ["tech"],
  "Sales & Trading": ["investment-banking", "finance"],
  "Corporate Finance / FP&A": ["finance", "investment-banking"],
  Other: [],
};

function suggestedCompanyNames(track: string, exclude: string[]): string[] {
  const industries = TRACK_TO_INDUSTRIES[track] || [];
  if (!industries.length) return [];
  const excludeLower = new Set(exclude.map((s) => s.toLowerCase()));
  return companies
    .filter((c) => industries.includes(c.industry))
    .map((c) => c.name)
    .filter((name) => !excludeLower.has(name.toLowerCase()))
    .slice(0, 8);
}

function filterCompaniesByQuery(query: string, exclude: string[]): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const excludeLower = new Set(exclude.map((s) => s.toLowerCase()));
  return companies
    .filter((c) => c.name.toLowerCase().includes(q))
    .map((c) => c.name)
    .filter((name) => !excludeLower.has(name.toLowerCase()))
    .slice(0, 6);
}

interface DreamCompanyAutocompleteProps {
  value: string[];
  onChange: (next: string[]) => void;
  /** Career track for the "Common picks" suggestions row. Omit/empty to hide. */
  careerTrack?: string;
  placeholder?: string;
  /** Show the "Common picks for X" pills when careerTrack is set. Default true. */
  showSuggestions?: boolean;
}

export const DreamCompanyAutocomplete = forwardRef<
  DreamCompanyAutocompleteHandle,
  DreamCompanyAutocompleteProps
>(function DreamCompanyAutocomplete(
  {
    value,
    onChange,
    careerTrack,
    placeholder = "Search companies (Goldman, McKinsey, Stripe...)",
    showSuggestions = true,
  },
  ref,
) {
  const [query, setQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    flushPending: () => {
      const pending = query.trim().replace(/,$/, "");
      if (!pending) return value;
      if (value.some((v) => v.toLowerCase() === pending.toLowerCase())) return value;
      const next = [...value, pending];
      onChange(next);
      setQuery("");
      return next;
    },
  }), [query, value, onChange]);

  const filteredMatches = useMemo(
    () => filterCompaniesByQuery(query, value),
    [query, value],
  );

  const suggestions = useMemo(
    () => (careerTrack ? suggestedCompanyNames(careerTrack, value) : []),
    [careerTrack, value],
  );

  useEffect(() => {
    if (!dropdownOpen) return;
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(t) &&
        inputRef.current &&
        !inputRef.current.contains(t)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [dropdownOpen]);

  const add = (name: string) => {
    const trimmed = name.trim().replace(/,$/, "");
    if (!trimmed) return;
    if (value.some((v) => v.toLowerCase() === trimmed.toLowerCase())) return;
    onChange([...value, trimmed]);
    setQuery("");
    setDropdownOpen(false);
  };

  const remove = (name: string) => {
    onChange(value.filter((c) => c !== name));
  };

  return (
    <div>
      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {value.map((co) => (
            <span
              key={co}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 10px",
                borderRadius: 3,
                fontSize: 12,
                background: "#EFF6FF",
                border: "1px solid #BFDBFE",
                color: "#1D4ED8",
              }}
            >
              {co}
              <button
                type="button"
                onClick={() => remove(co)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <X size={11} color="#60A5FA" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div style={{ position: "relative" }}>
        <Input
          ref={inputRef}
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setDropdownOpen(true);
          }}
          onFocus={() => setDropdownOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              if (query.trim()) {
                e.preventDefault();
                const pick = filteredMatches[0] || query.trim().replace(/,$/, "");
                add(pick);
              }
            } else if (e.key === "Backspace" && query === "" && value.length > 0) {
              onChange(value.slice(0, -1));
            } else if (e.key === "Escape") {
              setDropdownOpen(false);
            }
          }}
        />

        {dropdownOpen && filteredMatches.length > 0 && (
          <div
            ref={dropdownRef}
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              background: "#FFFFFF",
              border: "1px solid #E2E8F0",
              borderRadius: 4,
              boxShadow: "0 6px 18px rgba(15, 23, 42, 0.08)",
              zIndex: 20,
              maxHeight: 240,
              overflowY: "auto",
            }}
          >
            {filteredMatches.map((name) => (
              <button
                key={name}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(name)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 12px",
                  fontSize: 13,
                  color: "#0F172A",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#F1F5F9";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {name}
              </button>
            ))}
            {query.trim() &&
              !filteredMatches.some(
                (m) => m.toLowerCase() === query.trim().toLowerCase(),
              ) && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(query)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 12px",
                    fontSize: 13,
                    color: "#475569",
                    background: "transparent",
                    border: "none",
                    borderTop: "1px solid #F1F5F9",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#F1F5F9";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <Plus size={12} />
                  Add &ldquo;{query.trim()}&rdquo;
                </button>
              )}
          </div>
        )}
      </div>

      {showSuggestions && careerTrack && suggestions.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "#94A3B8",
              marginBottom: 6,
            }}
          >
            <Sparkles size={11} />
            Common picks for {careerTrack.toLowerCase()}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {suggestions.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => add(name)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  background: "#FFFFFF",
                  border: "1px dashed #CBD5E1",
                  color: "#475569",
                  cursor: "pointer",
                  transition: "all 0.12s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderStyle = "solid";
                  e.currentTarget.style.borderColor = "#3B82F6";
                  e.currentTarget.style.color = "#2563EB";
                  e.currentTarget.style.background = "#EFF6FF";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderStyle = "dashed";
                  e.currentTarget.style.borderColor = "#CBD5E1";
                  e.currentTarget.style.color = "#475569";
                  e.currentTarget.style.background = "#FFFFFF";
                }}
              >
                <Plus size={11} />
                {name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

