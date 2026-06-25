import { useState } from "react";
import {
  IconLock,
  IconPerson,
  IconRocket,
  IconSearchSmall,
} from "./icons";

// Inline Find People panel that lives inside JobDetail. Two stacked actions:
//   1. Find Hiring Managers -> onFind() (the /find-hiring-manager flow).
//   2. Find People -> onFindEmployees(count) (the /find-employee flow), with a
//      1 to 5 quantity slider for how many teammates to surface.
// Costs mirror backend CREDIT_COSTS: HM 10/contact, employee 4/contact. Both
// gated to non-free tiers; free users see an upgrade affordance. The actual
// searches run in the shared FindHumansModal.

const HM_CREDITS = 10;       // find_hiring_manager
const EMPLOYEE_CREDITS = 4;  // find_employee
const MIN_PEOPLE = 1;
const MAX_PEOPLE = 5;
const DEFAULT_PEOPLE = 3;

interface FindPeoplePanelProps {
  userPlan?: "free" | "pro" | "elite" | "premium";
  currentCredits?: number;
  onFind: () => void;
  onFindEmployees?: (count: number) => void;
  onUpgradeClick?: () => void;
}

export function FindPeoplePanel({
  userPlan = "free",
  currentCredits = 0,
  onFind,
  onFindEmployees,
  onUpgradeClick,
}: FindPeoplePanelProps) {
  const hasPremiumAccess = userPlan !== "free";
  // Per-column credit checks — HM and employee searches cost different amounts.
  const notEnoughHm = hasPremiumAccess && currentCredits < HM_CREDITS;
  const notEnoughEmployee = hasPremiumAccess && currentCredits < EMPLOYEE_CREDITS;
  const [count, setCount] = useState(DEFAULT_PEOPLE);

  // Filled portion of the slider track, in percent, so the navy fill grows as
  // the count rises. The shared .slider-custom track is transparent, so without
  // this the slider is invisible on the white panel.
  const sliderPct = ((count - MIN_PEOPLE) / (MAX_PEOPLE - MIN_PEOPLE)) * 100;

  const hmLabel = !hasPremiumAccess
    ? "Upgrade to Find Hiring Managers"
    : notEnoughHm
      ? "Not enough credits"
      : "Find Hiring Managers";

  const peopleLabel = !hasPremiumAccess
    ? "Upgrade to Find People"
    : notEnoughEmployee
      ? "Not enough credits"
      : "Find People";

  return (
    <div className="jb-fp" data-tour="tour-job-board-find-people">
      <div>
        <h3 className="jb-fp-eyebrow">FIND PEOPLE</h3>
      </div>

      {/* Two actions side by side. Columns stretch to equal height and each
          action block is pinned to the bottom (see .jb-fp-col-action) so the two
          buttons share a baseline even though the right column is taller. The
          row wraps to stacked when the pane is too narrow for two columns. */}
      <div className="jb-fp-actions">
        {/* Left column: Hiring Manager */}
        <div className="jb-fp-col">
          <div className="jb-fp-role">
            <div className="jb-fp-role-meta">
              <div className="jb-fp-role-head">
                <span className="jb-fp-role-icon"><IconRocket /></span>
                <span className="jb-fp-role-name">Hiring Manager</span>
                <span className="jb-fp-premium-tag">Premium</span>
              </div>
            </div>
            {!hasPremiumAccess && (
              <span className="jb-fp-counter locked"><IconLock /></span>
            )}
          </div>

          <div className="jb-fp-col-action">
            <button
              className="jb-fp-cta"
              type="button"
              disabled={notEnoughHm}
              onClick={() => {
                if (!hasPremiumAccess) {
                  onUpgradeClick?.();
                  return;
                }
                if (!notEnoughHm) onFind();
              }}
            >
              <IconSearchSmall />
              {hmLabel}
            </button>
            <span style={{ fontSize: 12, color: "var(--ink-7)", textAlign: "center" }}>
              {HM_CREDITS} credits each
            </span>
          </div>
        </div>

        {/* Right column: People on the team. Slider sits above the button and
            fills the extra vertical space the left column does not have. */}
        <div className="jb-fp-col">
          <div className="jb-fp-role">
            <div className="jb-fp-role-meta">
              <div className="jb-fp-role-head">
                <span className="jb-fp-role-icon"><IconPerson /></span>
                <span className="jb-fp-role-name">People on the team</span>
                <span className="jb-fp-premium-tag">Premium</span>
              </div>
              <div className="jb-fp-role-credits">Peers and teammates worth a coffee chat</div>
            </div>
            {!hasPremiumAccess && (
              <span className="jb-fp-counter locked"><IconLock /></span>
            )}
          </div>

          {hasPremiumAccess && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input
                type="range"
                className="slider-custom"
                min={MIN_PEOPLE}
                max={MAX_PEOPLE}
                step={1}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                aria-label="Number of people to find"
                style={{
                  flex: 1,
                  background: `linear-gradient(to right, var(--ink-2) 0%, var(--ink-2) ${sliderPct}%, #E2E8F0 ${sliderPct}%, #E2E8F0 100%)`,
                }}
              />
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--ink-2)",
                  minWidth: 18,
                  textAlign: "right",
                }}
              >
                {count}
              </span>
            </div>
          )}

          <div className="jb-fp-col-action">
            <button
              className="jb-fp-cta"
              type="button"
              disabled={notEnoughEmployee}
              onClick={() => {
                if (!hasPremiumAccess) {
                  onUpgradeClick?.();
                  return;
                }
                if (!notEnoughEmployee) onFindEmployees?.(count);
              }}
            >
              <IconSearchSmall />
              {peopleLabel}
            </button>
            <span style={{ fontSize: 12, color: "var(--ink-7)", textAlign: "center" }}>
              {EMPLOYEE_CREDITS} credits each
            </span>
          </div>
        </div>
      </div>

      {!hasPremiumAccess && (
        <p style={{ fontSize: 12, color: "var(--ink-5)", margin: 0 }}>
          Finding people requires a Premium plan.{" "}
          <button
            type="button"
            onClick={onUpgradeClick}
            style={{
              background: "none",
              border: "none",
              color: "var(--slate)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 500,
              padding: 0,
            }}
          >
            Upgrade
          </button>
        </p>
      )}
    </div>
  );
}
