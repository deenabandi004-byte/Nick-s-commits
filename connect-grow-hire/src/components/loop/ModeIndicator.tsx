// ModeIndicator — segmented pill row for selecting a Loop's mode.
//
// Foundation showed mode as a two-card radio. Later iterations made mode a
// parser outcome with a small inline override so the chip rows stay the
// star of the composer. Used by both:
//   - AgentSetupInline (the multi-step wizard)
//   - StartLoopHero (the front-door composer)
// — so the shape lives here.

import type { LoopModeForCopy } from "@/lib/loopCopy";

export function ModeIndicator({
  mode,
  onChange,
}: {
  mode: LoopModeForCopy;
  onChange: (m: LoopModeForCopy) => void;
}) {
  const opts: { key: LoopModeForCopy; label: string }[] = [
    { key: "people", label: "people" },
    { key: "roles", label: "roles" },
    { key: "both", label: "both" },
  ];
  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-2 mb-2">
        <span
          className="font-serif italic text-[14px]"
          style={{ color: "var(--ink-2)", fontWeight: 400 }}
        >
          Mode
        </span>
        <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
          &middot; what's this Loop chasing?
        </span>
      </div>
      <div role="radiogroup" aria-label="Loop mode" className="inline-flex border border-line rounded-full overflow-hidden">
        {opts.map((o, i) => {
          const active = mode === o.key;
          return (
            <button
              key={o.key}
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.key)}
              className="px-3 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors"
              style={{
                background: active ? "var(--ink)" : "var(--paper)",
                color: active ? "var(--paper)" : "var(--ink-3)",
                borderLeft: i > 0 ? "1px solid var(--line)" : "none",
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
