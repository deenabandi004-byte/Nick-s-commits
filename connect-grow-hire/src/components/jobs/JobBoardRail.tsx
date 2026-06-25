import type { JobFeedSummary } from "@/services/api";

// Editorial right rail: Job feed live, Matched count, Last sync, Saved
// snippets (clickable), filter tip. Extracted from JobBoardPage.tsx.
//
// We pass in already-selected/sliced data instead of the full job array
// so this component stays decoupled from FeedJob and ProtoJob shapes.

export interface SavedSnippet {
  id: string;
  title: string;
  company: string;
  match: number | null;
}

interface JobBoardRailProps {
  summary: JobFeedSummary | null;
  freshnessLabel: string | null;
  savedSnippets: SavedSnippet[];
  savedCount: number;
  onSelectSnippet: (id: string) => void;
}

export function JobBoardRail({
  summary,
  freshnessLabel,
  savedSnippets,
  savedCount,
  onSelectSnippet,
}: JobBoardRailProps) {
  return (
    <aside className="rail">
      <div className="h">
        <span className="pulse" />
        Job feed · live
      </div>

      <div className="stats">
        <div className="c">
          <div className="k">Matched</div>
          <div className="v">{summary?.matched ?? 0}</div>
        </div>
        <div className="c">
          <div className="k">Last sync</div>
          <div className="v small">{freshnessLabel ?? "not yet"}</div>
        </div>
      </div>

      <div className="h" style={{ marginTop: 0 }}>
        Saved · {savedCount} active
      </div>
      <div className="saved">
        {savedSnippets.map((s) => (
          <div
            className="it"
            key={s.id}
            onClick={() => onSelectSnippet(s.id)}
          >
            <div className="ttl">{s.title}</div>
            <div className="sub"><span className="co">{s.company}</span></div>
            <div className="stat good">
              match · {s.match != null ? s.match : "not ranked"}
            </div>
          </div>
        ))}
        {savedCount === 0 && (
          <div className="it" style={{ borderBottom: "none" }}>
            <div className="sub" style={{ fontStyle: "italic" }}>
              Save a role to start tracking follow-ups here.
            </div>
          </div>
        )}
      </div>

      <div className="filter-tip">
        Ranking pulls from <b>your resume</b>, the schools and skills on your
        profile, and the companies you save. Adjust in <b>Account settings</b>.
      </div>
    </aside>
  );
}
