import type { JobFeedSummary } from "@/services/api";

// Editorial 4-cell stat row: Matched / New today / Saved / Ranking.
// Extracted verbatim from JobBoardPage.tsx so the blend page reuses it.
// CSS classes match the existing JobBoardEditorial.css (.ledger, .cell, .k,
// .num, .of, .sub, .italic-on).

interface LedgerProps {
  summary: JobFeedSummary | null;
}

export function Ledger({ summary }: LedgerProps) {
  return (
    <div className="ledger">
      <div className="cell">
        <div className="k">Matched</div>
        <div className="num"><em>{summary?.matched ?? 0}</em></div>
        <div className="sub">aligned with your targets</div>
      </div>
      <div className="cell">
        <div className="k">New today</div>
        <div className="num">
          {summary?.new_today ?? 0}<span className="of">past 24h</span>
        </div>
        <div className="sub">above your match floor</div>
      </div>
      <div className="cell">
        <div className="k">Saved</div>
        <div className="num">
          {summary?.saved ?? 0}<span className="of">in tracker</span>
        </div>
        <div className="sub">tap to follow up</div>
      </div>
      <div className="cell">
        <div className="k">Ranking</div>
        <div className={`num ${summary?.ranking_active ? "italic-on" : ""}`}>
          {summary?.ranking_active ? "On" : "Off"}
        </div>
        <div className="sub">based on {summary?.ranking_basis || "no resume"}</div>
      </div>
    </div>
  );
}
