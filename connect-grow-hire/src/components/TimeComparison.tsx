import { useEffect, useRef } from 'react';
import './TimeComparison.css';

const scales = [
  { bad: { num: '2 hrs', desc: 'Finding 12 people on LinkedIn' }, good: { num: '~30 sec', desc: '12 verified emails, instantly' }, noStrike: false },
  { bad: { num: '3 hrs', desc: 'Writing 12 personalized emails' }, good: { num: '~2 min', desc: '12 drafts in your Gmail' }, noStrike: false },
  { bad: { num: '4 hr 30 min', desc: 'Prepping for 12 meetings' }, good: { num: '~2 min', desc: '12 full prep sheets, talking points included' }, noStrike: false },
  { bad: { num: '30 min', desc: 'Logging 12 contacts to a spreadsheet' }, good: { num: '0 sec', desc: 'Auto-tracked the moment you search' }, noStrike: false },
  { bad: { num: '10 hrs', desc: 'A full weekend, manually' }, good: { num: '< 5 min', desc: "Same weekend's work, fully handled" }, noStrike: true },
];

export default function TimeComparison() {
  const scaleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scoreboardRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const firedRef = useRef(false);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const Td = (fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms);
      timeoutsRef.current.push(t);
      return t;
    };

    const openPair = (rowIdx: number, delay: number) => {
      const badIdx = rowIdx * 2;
      const goodIdx = rowIdx * 2 + 1;
      // Bad tile first
      Td(() => {
        const el = scaleRefs.current[badIdx];
        if (!el) return;
        const inner = el.querySelector('.tc-scale-inner');
        if (inner) inner.classList.add('open');
        el.classList.add('open');
      }, delay);
      // Good tile 200ms later
      Td(() => {
        const el = scaleRefs.current[goodIdx];
        if (!el) return;
        const inner = el.querySelector('.tc-scale-inner');
        if (inner) inner.classList.add('open');
        el.classList.add('open');
      }, delay + 200);
    };

    const runSequence = () => {
      if (firedRef.current) return;
      firedRef.current = true;

      const rowDelay = 1200; // 1.2s between each row for dramatic pacing
      scales.forEach((_row, i) => {
        openPair(i, i * rowDelay);
      });

      // Show scoreboard after all rows
      Td(() => {
        scoreboardRef.current?.classList.add('show');
      }, scales.length * rowDelay + 400);
    };

    // Trigger when section scrolls into view
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          runSequence();
          obs.disconnect();
        }
      },
      { threshold: 0.2 }
    );

    if (wrapRef.current) obs.observe(wrapRef.current);

    return () => {
      obs.disconnect();
      timeoutsRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  return (
    <div className="tc-wrap" ref={wrapRef}>
      <div className="tc-heading">
        What used to take a weekend.<br />Now takes minutes.
      </div>
      <div style={{ height: 1.5, background: 'linear-gradient(90deg, #2563EB, #60A5FA, transparent)', maxWidth: 200, margin: '0 auto 28px' }} />

      <div className="tc-col-heads">
        <div className="tc-col-head without">Without Offerloop</div>
        <div className="tc-col-head with">With Offerloop</div>
      </div>

      <div className="tc-scales-grid">
        {scales.map((row, rowIdx) => (
          <>
            <div
              key={`bad-${rowIdx}`}
              className={`tc-scale bad${row.noStrike ? ' no-strike' : ''}`}
              ref={(el) => { scaleRefs.current[rowIdx * 2] = el; }}
            >
              <div className="tc-scale-inner">
                <div className="tc-scale-num">{row.bad.num}</div>
                <div className="tc-scale-desc">{row.bad.desc}</div>
              </div>
            </div>
            <div
              key={`good-${rowIdx}`}
              className="tc-scale good"
              ref={(el) => { scaleRefs.current[rowIdx * 2 + 1] = el; }}
            >
              <div className="tc-scale-inner">
                <div className="tc-scale-num">{row.good.num}</div>
                <div className="tc-scale-desc">{row.good.desc}</div>
              </div>
            </div>
          </>
        ))}
      </div>

      <div className="tc-scoreboard" ref={scoreboardRef}>
        <div className="tc-score-top">
          <div className="tc-score-side without">
            <div className="tc-score-label">Without Offerloop</div>
            <div className="tc-score-total">10 hrs</div>
            <div className="tc-score-sub">per weekend, manually</div>
          </div>
          <div className="tc-score-side with">
            <div className="tc-score-label">With Offerloop</div>
            <div className="tc-score-total">&lt; 5 min</div>
            <div className="tc-score-sub">same weekend, done</div>
          </div>
        </div>
        <div className="tc-score-bottom">
          <div className="tc-score-bottom-text">That's <span>10 hours back</span>, every weekend.</div>
        </div>
      </div>
    </div>
  );
}
