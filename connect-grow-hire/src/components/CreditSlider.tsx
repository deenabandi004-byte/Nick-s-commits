/**
 * CreditSlider — Higgsfield-style in-tier credit dial.
 *
 * Behavior (the previous version's pip-only click targets were too small):
 *  - Native `<input type="range">` does the heavy lifting → fully draggable
 *    with mouse / touch / keyboard out of the box, zero JS glue.
 *  - Visual overlay shows the rail, the filled portion, and per-stop pips.
 *  - Range input is invisible but sits on top of the track for hit-testing,
 *    so the WHOLE track is draggable. Click anywhere snaps to that stop.
 *
 * The slider always rounds to a discrete stop (no in-between values).
 */
import type { SliderStop } from '@/hooks/useTierConfig';

interface CreditSliderProps {
  stops: SliderStop[];
  /** Currently-selected stop index. */
  selectedIndex: number;
  onChange: (nextIndex: number) => void;
  /** Brand color for the active rail + thumb. Pro = #3B82F6, Elite = #0F172A. */
  accentColor?: string;
  /** Compact mode: tighter padding for small cards. */
  compact?: boolean;
  /** Dark-surface mode: swaps label/rail/pip colors for dark card backgrounds. */
  dark?: boolean;
}

const KCOMP = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : String(n);

export function CreditSlider({
  stops,
  selectedIndex,
  onChange,
  accentColor = '#3B82F6',
  compact = false,
  dark = false,
}: CreditSliderProps) {
  const defaultIdx = stops.findIndex((s) => s.default);
  const lastIdx = stops.length - 1;
  const fillPct = lastIdx === 0 ? 0 : (selectedIndex / lastIdx) * 100;

  return (
    <div
      style={{
        padding: compact ? '14px 4px 8px' : '18px 6px 10px',
        userSelect: 'none',
      }}
    >
      {/* Label row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontFamily: "'Inter', sans-serif",
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: dark ? '#8E99AD' : '#64748B',
          }}
        >
          Credits / month
        </span>
        <span
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: dark ? '#FFFFFF' : '#0F172A',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {stops[selectedIndex].credits.toLocaleString()}
        </span>
      </div>

      {/* Track wrapper — also the click target for the whole strip */}
      <div
        style={{
          position: 'relative',
          height: 28,
          margin: '0 8px',
          cursor: 'pointer',
        }}
      >
        {/* The visible rail (centered vertically) */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            transform: 'translateY(-50%)',
            height: 6,
            borderRadius: 999,
            background: dark ? 'rgba(255,255,255,0.16)' : '#E2E8F0',
            pointerEvents: 'none',
          }}
        />
        {/* Active fill */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            transform: 'translateY(-50%)',
            height: 6,
            width: `${fillPct}%`,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${accentColor}AA 0%, ${accentColor} 100%)`,
            transition: 'width 180ms ease',
            pointerEvents: 'none',
          }}
        />
        {/* Visual pips at each stop */}
        {stops.map((stop, idx) => {
          const left = `${(idx / lastIdx) * 100}%`;
          const isSelected = idx === selectedIndex;
          const isPassed = idx <= selectedIndex;
          const isDefaultPip = idx === defaultIdx;
          return (
            <div
              key={stop.credits}
              aria-hidden
              style={{
                position: 'absolute',
                top: '50%',
                left,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  width: isSelected ? 18 : 10,
                  height: isSelected ? 18 : 10,
                  borderRadius: '50%',
                  background: isPassed ? accentColor : dark ? 'rgba(255,255,255,0.3)' : '#CBD5E1',
                  border: isSelected ? `3px solid ${dark ? '#1A1A1A' : '#fff'}` : 'none',
                  boxShadow: isSelected
                    ? `0 0 0 3px ${accentColor}33, 0 4px 8px rgba(15,37,69,0.18)`
                    : 'none',
                  transition: 'all 160ms ease',
                }}
              />
              {/* Recommended tooltip on the default pip when not selected */}
              {isDefaultPip && !isSelected && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 6px)',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: accentColor,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Recommended
                </span>
              )}
            </div>
          );
        })}
        {/* Native range input — invisible, sits on top, owns interaction */}
        <input
          type="range"
          min={0}
          max={lastIdx}
          step={1}
          value={selectedIndex}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          aria-label="Monthly credits"
          aria-valuemin={stops[0].credits}
          aria-valuemax={stops[lastIdx].credits}
          aria-valuenow={stops[selectedIndex].credits}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
            margin: 0,
            padding: 0,
            // The browser-native thumb is hidden under our visual pip.
            // Keep the input above the visuals so it gets all pointer events.
            zIndex: 2,
          }}
        />
      </div>

      {/* Tick labels — also each clickable for quick jumps */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 10,
          padding: '0 4px',
          fontFamily: "'Inter', sans-serif",
          fontSize: 10,
          fontWeight: 600,
          color: dark ? '#7C8595' : '#94A3B8',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {stops.map((s, idx) => (
          <button
            key={s.credits}
            type="button"
            onClick={() => onChange(idx)}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '2px 4px',
              cursor: 'pointer',
              color: idx === selectedIndex ? accentColor : dark ? '#7C8595' : '#94A3B8',
              fontWeight: idx === selectedIndex ? 800 : 600,
              fontSize: 10,
              fontVariantNumeric: 'tabular-nums',
              transition: 'color 160ms ease',
            }}
          >
            {KCOMP(s.credits)}
          </button>
        ))}
      </div>
    </div>
  );
}
