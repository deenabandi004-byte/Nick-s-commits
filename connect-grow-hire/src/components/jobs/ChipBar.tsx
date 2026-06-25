import { IconClose } from "./icons";

// ChipBar renders the prototype's "Active filters: [x] [y] Clear all" row.
// Save Search and More Filters buttons are intentionally omitted this PR;
// they will land alongside the SaveSearchModal and MoreFiltersPanel.
//
// Caller owns the chip list. A chip is anything the user can remove with a
// single click: today that means Type, Field, and Sort when they are set to
// non-default values. When MoreFiltersPanel lands, experience level and
// date-posted chips will plug into the same array.

export interface Chip {
  key: string;
  label: string;
  onClear: () => void;
}

interface ChipBarProps {
  chips: Chip[];
  onClearAll: () => void;
}

export function ChipBar({ chips, onClearAll }: ChipBarProps) {
  if (chips.length === 0) {
    return (
      <div className="jb-chips">
        <span className="jb-chips-label">Active filters:</span>
        <span className="jb-chips-label" style={{ fontStyle: "italic" }}>
          none, showing your full feed
        </span>
      </div>
    );
  }

  return (
    <div className="jb-chips">
      <span className="jb-chips-label">Active filters:</span>
      {chips.map((c) => (
        <span key={c.key} className="jb-chip">
          {c.label}
          <button
            type="button"
            onClick={c.onClear}
            aria-label={`Remove ${c.label}`}
          >
            <IconClose />
          </button>
        </span>
      ))}
      <button
        className="jb-chip-clear"
        type="button"
        onClick={onClearAll}
      >
        Clear all
      </button>
    </div>
  );
}
