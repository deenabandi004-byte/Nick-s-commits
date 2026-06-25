import { type ProtoSegment } from "@/pages/trackerAdapter";

// People / Hiring Managers. The Hiring Managers segment shows outbox
// conversations whose contact matches a saved hiring manager (matched by email
// in the tracker page).

interface SegmentTabsProps {
  activeSegment: ProtoSegment;
  onSelectSegment: (segment: ProtoSegment) => void;
}

export function SegmentTabs({ activeSegment, onSelectSegment }: SegmentTabsProps) {
  return (
    <div className="segment-tabs-wrap">
      <div className="segment-tabs">
        <button
          type="button"
          className={`segment-btn${activeSegment === "people" ? " active" : ""}`}
          onClick={() => onSelectSegment("people")}
        >
          People
        </button>
        <button
          type="button"
          className={`segment-btn${activeSegment === "hiringManagers" ? " active" : ""}`}
          onClick={() => onSelectSegment("hiringManagers")}
        >
          Hiring Managers
        </button>
      </div>
    </div>
  );
}
