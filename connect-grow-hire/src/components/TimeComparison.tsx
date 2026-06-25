import { useEffect, useRef } from 'react';
import './TimeComparison.css';
import DoodleBurstLeft from '@/assets/for-students/doodle-burst-left.png';
import DoodleBurstRight from '@/assets/for-students/doodle-burst-right.png';

const scales = [
  { bad: { num: '20 min', desc: 'Finding one person\'s email' }, good: { num: '~3 sec', desc: 'Verified email, instantly' }, noStrike: false },
  { bad: { num: '15 min', desc: 'Writing one personalized email' }, good: { num: '~10 sec', desc: 'AI-drafted and in your Gmail' }, noStrike: false },
  { bad: { num: '45 min', desc: 'Prepping for one coffee chat' }, good: { num: '~30 sec', desc: 'Full prep sheet with talking points' }, noStrike: false },
  { bad: { num: '5 min', desc: 'Logging each contact to a spreadsheet' }, good: { num: '0 sec', desc: 'Auto-tracked the moment you search' }, noStrike: false },
  { bad: { num: '1 hr 25 min', desc: 'Total time per contact, manually' }, good: { num: '< 1 min', desc: 'Same contact, fully handled' }, noStrike: true },
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
      // Good tile slightly later
      Td(() => {
        const el = scaleRefs.current[goodIdx];
        if (!el) return;
        const inner = el.querySelector('.tc-scale-inner');
        if (inner) inner.classList.add('open');
        el.classList.add('open');
      }, delay + 110);
    };

    const runSequence = () => {
      if (firedRef.current) return;
      firedRef.current = true;

      const rowDelay = 620; // tightened further for a snappier reveal
      scales.forEach((_row, i) => {
        openPair(i, i * rowDelay);
      });

      // Show scoreboard after all rows
      Td(() => {
        scoreboardRef.current?.classList.add('show');
      }, scales.length * rowDelay + 220);
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
      {/* Hand-drawn blue squiggle accents from the Figma Misc set —
          parked in the wide side margins around the centered comparison
          table to add a little character. Hidden on narrower viewports
          where there's no margin space. */}
      <img
        src={DoodleBurstLeft}
        alt=""
        aria-hidden
        className="tc-doodle tc-doodle-left"
      />
      <img
        src={DoodleBurstRight}
        alt=""
        aria-hidden
        className="tc-doodle tc-doodle-right"
      />
      <div className="tc-heading">
        Where your time<br />actually goes.
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
            <div className="tc-score-total">1 hr 25 min</div>
            <div className="tc-score-sub">per contact, manually</div>
          </div>
          <div className="tc-score-side with">
            <div className="tc-score-label">With Offerloop</div>
            <div className="tc-score-total">&lt; 1 min</div>
            <div className="tc-score-sub">same contact, done</div>
          </div>
        </div>
        <div className="tc-score-bottom">
          <div className="tc-score-bottom-text">That's <span>84 minutes back</span> — per contact you reach out to.</div>
        </div>
      </div>
    </div>
  );
}
