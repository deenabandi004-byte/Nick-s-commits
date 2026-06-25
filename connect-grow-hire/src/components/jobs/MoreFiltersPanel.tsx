import { useEffect, useState } from "react";
import { IconCloseLg } from "./icons";

// More Filters right-side drawer.
//
// Two sections, both wired to backend params:
//   - Experience Level (single-select)
//       "Internship"  -> type=INTERNSHIP
//       "Entry Level" -> seniority=entry
//       "Mid Level"   -> seniority=mid
//       "Senior"      -> seniority=senior
//   - Date Posted (single-select)
//       "Any time"    -> no filter
//       "Past 24h"    -> posted_after=24h
//       "Past week"   -> posted_after=7d
//       "Past month"  -> posted_after=30d
//
// The "Describe what you're looking for" textarea was removed: it pushed its
// contents straight into the top search bar, which is where users already
// type free-text queries. Two inputs for the same field was misleading.
//
// Company Size and Visa Sponsorship are NOT here. The audit confirmed 0%
// data coverage on those fields across all sources. Shipping them would be
// the original sin we paid down (chips that don't filter). Add them back
// when a real enrichment source populates the underlying fields.

export interface MoreFiltersState {
  experience: string[];
  datePosted: string;
}

interface MoreFiltersPanelProps {
  open: boolean;
  onClose: () => void;
  onApply: (state: MoreFiltersState) => void;
  initial?: Partial<MoreFiltersState>;
}

const EXP_LEVELS = ["Internship", "Entry Level", "Mid Level", "Senior"];
const DATE_POSTED = ["Any time", "Past 24h", "Past week", "Past month"];

export function MoreFiltersPanel({
  open,
  onClose,
  onApply,
  initial,
}: MoreFiltersPanelProps) {
  const [exp, setExp] = useState<string[]>(initial?.experience ?? []);
  const [datePosted, setDatePosted] = useState(initial?.datePosted ?? "Any time");

  // Re-seed state when the drawer reopens with new initial values.
  useEffect(() => {
    if (!open) return;
    setExp(initial?.experience ?? []);
    setDatePosted(initial?.datePosted ?? "Any time");
  }, [open, initial]);

  if (!open) return null;

  // Experience Level is single-select against the backend (one type or one
  // seniority value), so clicking a pill replaces the previous selection
  // instead of toggling. Clicking the active pill clears it.
  function pickExperience(val: string) {
    setExp(exp[0] === val ? [] : [val]);
  }

  function clearAll() {
    setExp([]);
    setDatePosted("Any time");
  }

  function handleApply() {
    onApply({
      experience: exp,
      datePosted,
    });
    onClose();
  }

  return (
    <>
      <div className="jb-overlay light" onClick={onClose} />
      <div className="jb-drawer">
        <div className="jb-drawer-head">
          <h2>More Filters</h2>
          <button className="jb-modal-close" onClick={onClose} type="button">
            <IconCloseLg />
          </button>
        </div>

        <div className="jb-drawer-body">
          <div>
            <p className="jb-drawer-section-title">Experience Level</p>
            <div className="jb-drawer-pills">
              {EXP_LEVELS.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`jb-drawer-pill ${exp.includes(v) ? "active" : ""}`}
                  onClick={() => pickExperience(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="jb-drawer-section-title">Date Posted</p>
            <div className="jb-drawer-pills">
              {DATE_POSTED.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`jb-drawer-pill ${datePosted === v ? "active" : ""}`}
                  onClick={() => setDatePosted(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="jb-drawer-foot">
          <button className="clear" type="button" onClick={clearAll}>
            Clear All
          </button>
          <button className="apply" type="button" onClick={handleApply}>
            Apply Filters
          </button>
        </div>
      </div>
    </>
  );
}
