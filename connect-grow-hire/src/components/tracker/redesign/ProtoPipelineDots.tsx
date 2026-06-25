import { PROTO_STAGES, PROTO_STAGE_LABELS, type ProtoStage } from "@/pages/trackerAdapter";

// 5-dot clickable pipeline. Visually live (hover glow, cursor pointer) but
// onStageClick is stubbed at the page level in PR1: it surfaces a toast,
// no patchOutboxStage write. The 11-to-5 mapping is read-only bucketing,
// so writes are deferred to the production-swap PR.

interface ProtoPipelineDotsProps {
  activeStage: ProtoStage | null;
  onStageClick: (stage: ProtoStage) => void;
}

export function ProtoPipelineDots({ activeStage, onStageClick }: ProtoPipelineDotsProps) {
  const activeIdx = activeStage ? PROTO_STAGES.indexOf(activeStage) : -1;
  const fillPct = activeIdx >= 0 ? activeIdx * 25 : 0;

  return (
    <div className="pipeline-wrap">
      <div className="pipeline-dots-row">
        <div className="pipeline-track">
          <div className="pipeline-track-fill" style={{ width: `${fillPct}%` }} />
        </div>
        {PROTO_STAGES.map((stage, i) => {
          const done = activeIdx >= 0 && i < activeIdx;
          const active = i === activeIdx;
          const cls = `pipeline-dot${done ? " done" : ""}${active ? " active" : ""}`;
          return (
            <div key={stage} className="pipeline-dot-wrap">
              <div
                className={cls}
                data-clickable=""
                role="button"
                tabIndex={0}
                aria-label={`Move to ${PROTO_STAGE_LABELS[stage]}`}
                onClick={() => onStageClick(stage)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onStageClick(stage);
                  }
                }}
              >
                {done && (
                  <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10 3L4.5 8.5L2 6" stroke="white" strokeWidth="1.5" />
                  </svg>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="pipeline-stage-labels">
        {PROTO_STAGES.map((stage, i) => {
          // When nothing is selected (activeIdx === -1), no label is muted.
          const muted = activeIdx >= 0 && i > activeIdx;
          return (
            <span key={stage} className={`pipeline-stage-name${muted ? " muted" : ""}`}>
              {PROTO_STAGE_LABELS[stage]}
            </span>
          );
        })}
      </div>
    </div>
  );
}
