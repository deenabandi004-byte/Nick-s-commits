import React, { useState, useCallback } from "react";
import { ArrowRight } from "lucide-react";
import { UNIVERSITIES } from "@/data/universities";
import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";

const POPULAR_SCHOOLS = [
  "USC",
  "UCLA",
  "Stanford",
  "Berkeley",
  "NYU",
  "Michigan",
  "Georgia Tech",
  "UT Austin",
];

interface NoSchoolEmptyStateProps {
  uid: string;
  onSchoolSet: () => void;
}

export const NoSchoolEmptyState: React.FC<NoSchoolEmptyStateProps> = ({ uid, onSchoolSet }) => {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const filtered = query.length >= 2
    ? (UNIVERSITIES || []).filter((u: string) =>
        u.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : [];

  const handleSubmit = useCallback(async () => {
    const school = selected || query.trim();
    if (!school || !uid) return;
    setSubmitting(true);
    try {
      await updateDoc(doc(db, "users", uid), { university: school });
      onSchoolSet();
    } catch {
      setSubmitting(false);
    }
  }, [selected, query, uid, onSchoolSet]);

  const handlePillClick = (school: string) => {
    setSelected(school);
    setQuery(school);
    setShowSuggestions(false);
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "60px 40px 40px", textAlign: "left" }}>
      {/* Eyebrow */}
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.14em",
        color: "var(--accent)",
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}>
        <span style={{ fontSize: 11 }}>&#9670;</span>
        QUICK SETUP
      </div>

      {/* Headline */}
      <h2 className="font-serif" style={{
        fontSize: 36,
        lineHeight: 1.15,
        fontWeight: 400,
        color: "var(--ink)",
        marginBottom: 12,
      }}>
        Tell us your school and we&rsquo;ll show you{" "}
        <em style={{ fontStyle: "italic", color: "var(--accent)" }}>who&rsquo;s there</em>.
      </h2>

      {/* Subhead */}
      <p style={{
        fontSize: 15,
        color: "var(--ink-2)",
        marginBottom: 32,
        maxWidth: 520,
        lineHeight: 1.5,
      }}>
        We&rsquo;ll match you with alumni at top companies, show school-specific recommendations, and personalize your outreach.
      </p>

      {/* Input + button */}
      <div style={{ position: "relative", marginBottom: 20 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          placeholder="Search 4,000+ universities..."
          style={{
            width: "100%",
            padding: "14px 16px",
            fontSize: 15,
            border: "1px solid var(--line)",
            borderRadius: 8,
            background: "var(--paper)",
            color: "var(--ink)",
            outline: "none",
            fontFamily: "inherit",
            transition: "border-color .15s",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
        />

        {/* Typeahead suggestions */}
        {showSuggestions && filtered.length > 0 && (
          <div style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            background: "var(--paper)",
            border: "1px solid var(--line)",
            borderRadius: 8,
            boxShadow: "var(--shadow-md)",
            zIndex: 10,
            maxHeight: 240,
            overflowY: "auto",
          }}>
            {filtered.map((uni: string) => (
              <button
                key={uni}
                type="button"
                onClick={() => {
                  setSelected(uni);
                  setQuery(uni);
                  setShowSuggestions(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 16px",
                  fontSize: 14,
                  color: "var(--ink)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--paper-2)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {uni}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Primary button */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || (!selected && !query.trim())}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 24px",
          fontSize: 14,
          fontWeight: 500,
          background: "var(--ink)",
          color: "#FFFFFF",
          border: "none",
          borderRadius: 8,
          cursor: submitting ? "wait" : "pointer",
          fontFamily: "inherit",
          opacity: (!selected && !query.trim()) ? 0.5 : 1,
          transition: "opacity .15s",
        }}
      >
        {submitting ? "Setting up..." : "Continue"}
        {!submitting && <ArrowRight style={{ width: 14, height: 14 }} />}
      </button>

      {/* Popular pills */}
      <div style={{ marginTop: 28 }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "var(--ink-3)",
          display: "block",
          marginBottom: 10,
        }}>
          Popular
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {POPULAR_SCHOOLS.map((school) => (
            <button
              key={school}
              type="button"
              onClick={() => handlePillClick(school)}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                borderRadius: 100,
                border: "1px solid var(--line)",
                background: selected === school ? "var(--accent)" : "var(--paper)",
                color: selected === school ? "#FFFFFF" : "var(--ink-2)",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all .12s",
              }}
              onMouseEnter={(e) => {
                if (selected !== school) {
                  e.currentTarget.style.borderColor = "var(--accent)";
                  e.currentTarget.style.color = "var(--accent)";
                }
              }}
              onMouseLeave={(e) => {
                if (selected !== school) {
                  e.currentTarget.style.borderColor = "var(--line)";
                  e.currentTarget.style.color = "var(--ink-2)";
                }
              }}
            >
              {school}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              // Route to non-student flow - for now, just set query
              setQuery("Not a student");
              setSelected("Not a student");
            }}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              borderRadius: 100,
              border: "1px dashed var(--line)",
              background: "transparent",
              color: "var(--ink-3)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontStyle: "italic",
            }}
          >
            Not a student &rarr;
          </button>
        </div>
      </div>

      {/* Meta row */}
      <div style={{
        marginTop: 32,
        fontSize: 11,
        color: "var(--ink-3)",
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        2M+ students across 4,000+ schools
      </div>
    </div>
  );
};
