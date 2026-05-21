import { useState, useEffect, useRef, useCallback } from 'react';
import './FeatureShowcase.css';

const queries = [
  'USC alumni working at Goldman Sachs in New York',
  'Michigan grads at McKinsey, Chicago office',
  'Georgetown alumni in private equity on the West Coast',
];

const emailBody =
  "Hi Maya,\n\nI came across your profile and noticed your path from USC to Goldman - exactly where I want to be.\n\nWould you be open to a quick 15-minute call?\n\nBest,\nAlex Chen · USC '26";

const contacts = [
  { id: 0, initials: 'MR', cls: 'fs-av1', name: 'Maya Rodriguez', sub: 'Associate · Goldman Sachs · USC \'21', email: 'm.rodriguez@gs.com' },
  { id: 1, initials: 'JK', cls: 'fs-av2', name: 'James Kim', sub: 'Analyst · Goldman Sachs · USC \'22', email: 'j.kim@gs.com' },
  { id: 2, initials: 'SP', cls: 'fs-av3', name: 'Sofia Patel', sub: 'VP · Goldman Sachs · USC \'19', email: 's.patel@gs.com' },
];

const trackerRows = [
  { id: 'nr', name: 'Chris Wallace', firm: 'Evercore', role: 'IB Analyst', highlight: true, status: { cls: 'fs-s-needreply fs-pulse-badge', label: 'Follow up', hasNotify: true } },
  { id: 'tr1', name: 'Maya Rodriguez', firm: 'Goldman', role: 'Associate', status: { cls: 'fs-s-drafted', label: 'Drafted' } },
  { id: 'tr2', name: 'James Kim', firm: 'Goldman', role: 'Analyst', status: { cls: 'fs-s-drafted', label: 'Drafted' } },
  { id: 'tr3', name: 'Sofia Patel', firm: 'Goldman', role: 'VP', status: { cls: 'fs-s-drafted', label: 'Drafted' } },
  { id: 'tr4', name: 'Aidan Murphy', firm: 'Bain & Co.', role: 'Consultant', status: { cls: 'fs-s-replied', label: 'Replied' } },
  { id: 'tr5', name: 'Rachel Nguyen', firm: 'McKinsey', role: 'Associate', status: { cls: 'fs-s-opened', label: 'Opened' } },
  { id: 'tr6', name: 'Tyler Brooks', firm: 'Blackstone', role: 'Analyst', status: { cls: 'fs-s-sent', label: 'Sent' } },
  { id: 'tr7', name: 'Priya Sharma', firm: 'BCG', role: 'Consultant', status: { cls: 'fs-s-replied', label: 'Replied' } },
  { id: 'tr8', name: 'Daniel Park', firm: 'Centerview', role: 'Analyst', status: { cls: 'fs-s-opened', label: 'Opened' } },
  { id: 'tr9', name: 'Lauren Cole', firm: 'JPMorgan', role: 'Associate', status: { cls: 'fs-s-sent', label: 'Sent' } },
];

const drafts = [
  { id: 0, to: 'Maya Rodriguez', subj: 'Quick question about your path at Goldman', prev: 'Hi Maya, I came across your profile...' },
  { id: 1, to: 'James Kim', subj: 'Fellow Trojan - 15 min meeting?', prev: 'Hi James, as a fellow USC student...' },
  { id: 2, to: 'Sofia Patel', subj: 'Curious about your journey to Goldman', prev: 'Hi Sofia, I noticed you made the transition...' },
];

function rnd(a: number, b: number) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

export default function FeatureShowcase() {
  const [typedText, setTypedText] = useState('');
  const [showCursor, setShowCursor] = useState(true);
  const [showFindBtn, setShowFindBtn] = useState(false);
  const [phase, setPhase] = useState<'contacts' | 'finding' | 'tracker' | 'gmail'>('contacts');
  const [pipCount, setPipCount] = useState(1);
  const [phaseTitle, setPhaseTitle] = useState('Search');
  const [showChips, setShowChips] = useState(false);
  const [chipN, setChipN] = useState(4);
  const [findingText, setFindingText] = useState('Finding contacts...');
  const [visibleCards, setVisibleCards] = useState<number[]>([]);
  const [outCards, setOutCards] = useState<number[]>([]);
  const [visibleRows, setVisibleRows] = useState<string[]>([]);
  const [outRows, setOutRows] = useState<string[]>([]);
  const [trackerStatuses, setTrackerStatuses] = useState<Record<string, { cls: string; label: string }>>({});
  const [visibleDrafts, setVisibleDrafts] = useState<number[]>([]);
  const [draftCount, setDraftCount] = useState(0);
  const [showCompose, setShowCompose] = useState(false);
  const [composeTyped, setComposeTyped] = useState('');
  const [showComposeCursor, setShowComposeCursor] = useState(false);
  const [, setQueryIndex] = useState(0);

  const mainTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const qIdxRef = useRef(0);
  const currentNRef = useRef(4);

  const clearAll = useCallback(() => {
    if (mainTimer.current) clearTimeout(mainTimer.current);
    timeouts.current.forEach(t => clearTimeout(t));
    timeouts.current = [];
  }, []);

  const T = useCallback((fn: () => void, ms: number) => {
    if (mainTimer.current) clearTimeout(mainTimer.current);
    mainTimer.current = setTimeout(fn, ms);
  }, []);

  const Td = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timeouts.current.push(t);
    return t;
  }, []);

  const setPhaseState = useCallback((p: 'contacts' | 'finding' | 'tracker' | 'gmail', pips: number, title: string) => {
    setPhase(p);
    setPipCount(pips);
    setPhaseTitle(title);
  }, []);

  const setStatus = useCallback((id: string, cls: string, label: string) => {
    setTrackerStatuses(prev => ({ ...prev, [id]: { cls, label } }));
  }, []);

  const typeBody = useCallback((body: string, i: number) => {
    if (i < body.length) {
      setComposeTyped(body.slice(0, i + 1));
      Td(() => typeBody(body, i + 1), body[i] === '\n' ? 60 : 9 + Math.random() * 7);
    } else {
      setShowComposeCursor(false);
      T(reset, 3000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showComposePhase = useCallback(() => {
    setShowCompose(true);
    setShowComposeCursor(true);
    Td(() => typeBody(emailBody, 0), 300);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const morphToGmail = useCallback(() => {
    const rowIds = trackerRows.map(r => r.id);
    rowIds.forEach((id, i) => {
      Td(() => setOutRows(prev => [...prev, id]), i * 30);
    });
    Td(() => {
      setPhaseState('gmail', 3, 'Gmail drafts');
      drafts.forEach((d, i) => {
        Td(() => {
          setVisibleDrafts(prev => [...prev, d.id]);
          setDraftCount(Math.min(i + 1, currentNRef.current));
        }, i * 160);
      });
      Td(() => setDraftCount(currentNRef.current), drafts.length * 160);
      Td(showComposePhase, 700);
    }, 400);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runStatusPipeline = useCallback(() => {
    Td(() => setStatus('tr1', 'fs-s-sent', 'Sent'), 0);
    Td(() => setStatus('tr2', 'fs-s-sent', 'Sent'), 180);
    Td(() => setStatus('tr3', 'fs-s-sent', 'Sent'), 360);
    Td(() => setStatus('tr1', 'fs-s-opened', 'Opened'), 700);
    Td(() => setStatus('tr2', 'fs-s-opened', 'Opened'), 1000);
    Td(() => setStatus('tr1', 'fs-s-replied', 'Replied'), 1500);
    Td(() => setStatus('tr3', 'fs-s-opened', 'Opened'), 1800);
    Td(morphToGmail, 2400);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const morphToTracker = useCallback(() => {
    [0, 1, 2].forEach((id, i) => {
      Td(() => setOutCards(prev => [...prev, id]), i * 50);
    });
    Td(() => {
      setPhaseState('tracker', 2, 'Network tracker');
      const rowIds = trackerRows.map(r => r.id);
      rowIds.forEach((id, i) => {
        Td(() => setVisibleRows(prev => [...prev, id]), i * 60);
      });
      Td(runStatusPipeline, rowIds.length * 60 + 300);
    }, 350);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showContacts = useCallback(() => {
    setPhaseState('contacts', 1, 'Contacts found');
    [0, 1, 2].forEach((id, i) => {
      Td(() => setVisibleCards(prev => [...prev, id]), i * 120);
    });
    T(morphToTracker, 1600);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showFinding = useCallback(() => {
    setShowCursor(false);
    setPhaseState('finding', 1, 'Finding contacts...');
    Td(() => {
      const n = rnd(3, 6);
      currentNRef.current = n;
      setChipN(n);
      setShowChips(true);
      setFindingText('Done - ');
    }, 700);
    T(showContacts, 1400);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startTyping = useCallback(() => {
    setPhaseState('contacts', 1, 'Search');
    const q = queries[qIdxRef.current];
    let i = 0;
    function next() {
      if (i < q.length) {
        i++;
        setTypedText(q.slice(0, i));
        T(next, 28 + Math.random() * 18);
      } else {
        setShowFindBtn(true);
        T(showFinding, 500);
      }
    }
    next();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  function reset() {
    setTypedText('');
    setShowCursor(true);
    setShowFindBtn(false);
    setComposeTyped('');
    setShowComposeCursor(false);
    setShowCompose(false);
    setDraftCount(0);
    setShowChips(false);
    setFindingText('Finding contacts...');
    setVisibleCards([]);
    setOutCards([]);
    setVisibleDrafts([]);
    setVisibleRows([]);
    setOutRows([]);
    setTrackerStatuses({});
    qIdxRef.current = (qIdxRef.current + 1) % queries.length;
    setQueryIndex(qIdxRef.current);
    setPhaseState('contacts', 1, 'Search');
    T(startTyping, 400);
  }

  useEffect(() => {
    T(startTyping, 500);
    return clearAll;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getRowStatus = (row: typeof trackerRows[0]) => {
    const override = trackerStatuses[row.id];
    return override || { cls: row.status.cls, label: row.status.label };
  };

  return (
    <div className="fs-wrap">
      <div className="fs-stage">
        {/* Search bar */}
        <div className="fs-search-bar">
          <div className="fs-search-icon" />
          <div className="fs-search-input">
            <span>{typedText}</span>
            {showCursor && <span className="fs-cursor" />}
          </div>
          <div className={`fs-find-btn${showFindBtn ? ' show' : ''}`}>Find people</div>
        </div>

        {/* Phase label bar */}
        <div className="fs-phase-label">
          {[1, 2, 3].map(i => (
            <span key={i} className={`fs-phase-pip${i <= pipCount ? ' on' : ''}`} />
          ))}
          <span className="fs-phase-title">{phaseTitle}</span>
          <div className={`fs-phase-chips${showChips ? ' show' : ''}`}>
            <div className="fs-pchip"><div className="fs-pchip-dot" /><span>{chipN} contacts</span></div>
            <div className="fs-pchip"><div className="fs-pchip-dot" /><span>{chipN} drafted</span></div>
          </div>
        </div>

        {/* Phase body */}
        <div className="fs-phase-body">
          {/* Contacts phase */}
          <div className={`fs-phase${phase === 'contacts' ? ' active' : ''}`}>
            {contacts.map(c => (
              <div
                key={c.id}
                className={`fs-contact-card${visibleCards.includes(c.id) ? ' visible' : ''}${outCards.includes(c.id) ? ' out' : ''}`}
              >
                <div className={`fs-avatar ${c.cls}`}>{c.initials}</div>
                <div>
                  <div className="fs-contact-name">{c.name}</div>
                  <div className="fs-contact-sub">{c.sub}</div>
                  <div className="fs-email-chip">{c.email} · verified</div>
                </div>
                <div className="fs-verified-dot" />
              </div>
            ))}
          </div>

          {/* Finding phase */}
          <div className={`fs-phase${phase === 'finding' ? ' active' : ''}`}>
            <div className="fs-finding-wrap">
              <div className="fs-finding-dots">
                <div className="fs-dot" /><div className="fs-dot" /><div className="fs-dot" />
              </div>
              <span className="fs-finding-text">{findingText}</span>
            </div>
          </div>

          {/* Tracker phase */}
          <div className={`fs-phase${phase === 'tracker' ? ' active' : ''}`}>
            <table className="fs-tracker-table">
              <thead><tr><th>Contact</th><th>Firm</th><th>Role</th><th>Status</th></tr></thead>
              <tbody>
                {trackerRows.map(row => {
                  const st = getRowStatus(row);
                  return (
                    <tr
                      key={row.id}
                      className={`fs-trow${row.highlight ? ' highlight' : ''}${visibleRows.includes(row.id) ? ' visible' : ''}${outRows.includes(row.id) ? ' out' : ''}`}
                    >
                      <td><div className="fs-tname">{row.name}</div></td>
                      <td style={{ fontSize: 10, color: '#64748b' }}>{row.firm}</td>
                      <td style={{ fontSize: 10, color: '#64748b' }}>{row.role}</td>
                      <td>
                        <span className={`fs-sbadge ${st.cls}`}>
                          {row.status.hasNotify && !trackerStatuses[row.id] && <span className="fs-notify-dot" />}
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Gmail phase */}
          <div className={`fs-phase${phase === 'gmail' ? ' active' : ''}`}>
            <div className="fs-gmail-chrome">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect width="16" height="16" rx="3" fill="#fff" stroke="#e5e7eb" strokeWidth=".5" />
                <path d="M2.5 5l5.5 3.5L13.5 5" stroke="#EA4335" strokeWidth="1" strokeLinecap="round" fill="none" />
                <rect x="2" y="5" width="12" height="8" rx=".5" stroke="#94a3b8" strokeWidth=".5" fill="none" />
              </svg>
              <div className="fs-gmail-search">Search mail</div>
            </div>
            <div className="fs-gmail-layout">
              <div className="fs-gmail-nav">
                <div className="fs-gmail-nav-item">Inbox</div>
                <div className="fs-gmail-nav-item">Starred</div>
                <div className="fs-gmail-nav-item active">Drafts<span className="fs-dcount">{draftCount}</span></div>
                <div className="fs-gmail-nav-item">Sent</div>
              </div>
              <div className="fs-draft-col">
                {drafts.map(d => (
                  <div key={d.id} className={`fs-draft-row${visibleDrafts.includes(d.id) ? ' visible' : ''}`}>
                    <div className="fs-draft-tag">Draft</div>
                    <div className="fs-draft-to">{d.to}</div>
                    <div className="fs-draft-subj">{d.subj}</div>
                    <div className="fs-draft-prev">{d.prev}</div>
                  </div>
                ))}
                <div className={`fs-compose-wrap${showCompose ? ' visible' : ''}`}>
                  <div className="fs-compose-header"><span>New Message</span><span>✕</span></div>
                  <div className="fs-cf"><span className="fs-cfl">To</span><span>m.rodriguez@gs.com</span></div>
                  <div className="fs-cf"><span className="fs-cfl">Subject</span><span>Quick question about your path at Goldman</span></div>
                  <div className="fs-compose-body">
                    <span>{composeTyped}</span>
                    {showComposeCursor && <span className="fs-cursor" />}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
