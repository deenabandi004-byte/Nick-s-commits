/*
 * FindPeopleWidget - self-contained, embeddable React component for the
 * free people-search lead magnet. Drop it into any page:
 *
 *   <FindPeopleWidget source="goldman-ib-deep-dive" />
 *
 * The `source` prop is sent to /api/tools/find-people/search and written
 * into the lead_magnet_emails Firestore doc so you can attribute leads to
 * the SEO page they came from.
 *
 * No <Helmet>, no nav, no footer - frame-agnostic. Result cards stack
 * gracefully on narrow containers.
 *
 * IMPORTANT: render ONE FindPeopleWidget per page.
 *
 * House style: no em dashes, no Sparkles icon.
 */
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Download,
  GraduationCap,
  Linkedin,
  Loader2,
  Lock,
  Search,
  Target,
  Users,
} from 'lucide-react';
import {
  captureEmail,
  downloadPeopleCsv,
  searchPeople,
  type PublicPerson,
  type SearchPeopleResponse,
} from '../../services/findPeopleLeadMagnet';

// ── Visual tokens (inlined so the widget has no shared-kit dependency) ────
const BRAND = '#3B82F6';
const BRAND_DARK = '#2563EB';
const INK = '#0F172A';
const SERIF = "'Libre Baskerville', Georgia, serif";

// ── Types ─────────────────────────────────────────────────────────────────

export type Phase = 'idle' | 'email_gate' | 'running' | 'results' | 'failed';

export interface FindPeopleWidgetProps {
  source?: string;
  onLeadCaptured?: (email: string) => void;
  eyebrow?: string;
  heading?: string;
  subhead?: string;
  /**
   * Optional preview node. Renders side-by-side on idle/email_gate when
   * the container is wide. Disappears once the search is running or
   * results are ready, so the real output owns the stage.
   */
  examplePanel?: ReactNode;
}

const RUNNING_STEPS = [
  { label: 'Searching the company', detail: 'Searching across 2.2 billion profiles' },
  { label: 'Filtering by role', detail: 'Matching current title to your input' },
  { label: 'Ranking the top 5', detail: 'Most relevant profiles with a verified LinkedIn' },
];

// ──────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────

const FindPeopleWidget = ({
  source = 'embedded',
  onLeadCaptured,
  eyebrow = 'FREE PEOPLE FINDER',
  heading = 'Find 5 real people at any company, in any role.',
  subhead = 'Type a company name and a role. We search a 2.2 billion contact database and return 5 named people with their title, school, and LinkedIn. No account needed.',
  examplePanel,
}: FindPeopleWidgetProps) => {
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchPeopleResponse | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const stepTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (stepTimerRef.current) window.clearInterval(stepTimerRef.current);
    },
    [],
  );

  const onStart = () => {
    setError(null);
    if (!company.trim()) {
      setError('Enter a company name.');
      return;
    }
    if (!role.trim()) {
      setError('Enter a role or job title.');
      return;
    }
    setPhase('email_gate');
  };

  const onSubmitEmailGate = async () => {
    setError(null);
    const trimmedEmail = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmedEmail)) {
      setError('Enter a valid email.');
      return;
    }
    // Best-effort lead capture before running the heavier search.
    void captureEmail(trimmedEmail, source);
    onLeadCaptured?.(trimmedEmail);
    void runSearch(trimmedEmail);
  };

  const runSearch = async (submittedEmail: string) => {
    setPhase('running');
    setStepIndex(0);
    if (stepTimerRef.current) window.clearInterval(stepTimerRef.current);
    stepTimerRef.current = window.setInterval(() => {
      setStepIndex((prev) => (prev < RUNNING_STEPS.length - 1 ? prev + 1 : prev));
    }, 1200);

    const res = await searchPeople({
      company: company.trim(),
      role: role.trim(),
      email: submittedEmail,
      source,
    });

    if (stepTimerRef.current) {
      window.clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }

    setResult(res);
    if (res.ok && res.results.length > 0) {
      setStepIndex(RUNNING_STEPS.length - 1);
      setPhase('results');
    } else if (res.status === 'rate_limited') {
      setError(res.message || 'Free search is limited to once every 24 hours.');
      setPhase('failed');
    } else if (res.status === 'no_candidates') {
      setError(
        `We couldn't find 5 ${role.trim()}s at ${company.trim()}. Try a broader title (e.g. "Analyst" instead of "Junior FX Analyst").`,
      );
      setPhase('failed');
    } else {
      setError(res.message || "We couldn't return results. Try again in a minute.");
      setPhase('failed');
    }
  };

  const onReset = () => {
    setPhase('idle');
    setResult(null);
    setError(null);
    setStepIndex(0);
  };

  const onDownload = () => {
    const people = result?.results || [];
    if (people.length === 0) return;
    const co = (result?.company || company || 'people').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    downloadPeopleCsv(people, `find-people-${co || 'offerloop'}.csv`);
  };

  // ── Render ────────────────────────────────────────────────────────────

  const isIdleLike = phase === 'idle' || phase === 'email_gate';

  const idleCard = (
    <IdleCard
      phase={phase}
      company={company}
      role={role}
      name={name}
      email={email}
      error={error}
      eyebrow={eyebrow}
      heading={heading}
      subhead={subhead}
      setCompany={setCompany}
      setRole={setRole}
      setName={setName}
      setEmail={setEmail}
      onStart={onStart}
      onSubmit={onSubmitEmailGate}
      onBack={() => setPhase('idle')}
    />
  );

  return (
    <div style={{ width: '100%', color: INK }}>
      {isIdleLike ? (
        examplePanel ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
              gap: 24,
              alignItems: 'start',
            }}
          >
            <div>{examplePanel}</div>
            <div>{idleCard}</div>
          </div>
        ) : (
          idleCard
        )
      ) : null}

      {phase === 'running' ? <RunningCard stepIndex={stepIndex} /> : null}

      {phase === 'results' && result ? (
        <ResultsBlock result={result} onDownload={onDownload} onReset={onReset} />
      ) : null}

      {phase === 'failed' ? (
        <FailedCard
          message={error || result?.message || 'Something went wrong.'}
          onReset={onReset}
        />
      ) : null}
    </div>
  );
};

export default FindPeopleWidget;
export { FindPeopleWidget };

// ──────────────────────────────────────────────────────────────────────────
// Idle / email gate
// ──────────────────────────────────────────────────────────────────────────

const IdleCard = ({
  phase,
  company,
  role,
  name,
  email,
  error,
  eyebrow,
  heading,
  subhead,
  setCompany,
  setRole,
  setName,
  setEmail,
  onStart,
  onSubmit,
  onBack,
}: {
  phase: Phase;
  company: string;
  role: string;
  name: string;
  email: string;
  error: string | null;
  eyebrow: string;
  heading: string;
  subhead: string;
  setCompany: (v: string) => void;
  setRole: (v: string) => void;
  setName: (v: string) => void;
  setEmail: (v: string) => void;
  onStart: () => void;
  onSubmit: () => void;
  onBack: () => void;
}) => (
  <div>
    {eyebrow || heading || subhead ? (
      <header style={{ textAlign: 'center', marginBottom: 28 }}>
        {eyebrow ? (
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: BRAND,
              letterSpacing: '0.06em',
              marginBottom: 12,
            }}
          >
            {eyebrow}
          </div>
        ) : null}
        {heading ? (
          <h2
            style={{
              fontFamily: SERIF,
              fontSize: 32,
              fontWeight: 400,
              color: INK,
              marginBottom: 12,
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
            }}
          >
            {heading}
          </h2>
        ) : null}
        {subhead ? (
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              color: '#475569',
              maxWidth: 560,
              margin: '0 auto',
            }}
          >
            {subhead}
          </p>
        ) : null}
      </header>
    ) : null}

    <div style={cardShell}>
      <Label num={1} text="Company name" />
      <div style={inputShell}>
        <Building2 size={16} color="#94A3B8" style={{ flexShrink: 0 }} />
        <input
          type="text"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Goldman Sachs"
          disabled={phase === 'email_gate'}
          style={inputBare}
        />
      </div>
      <div style={{ height: 14 }} />

      <Label num={2} text="Role or job title" />
      <div style={inputShell}>
        <Users size={16} color="#94A3B8" style={{ flexShrink: 0 }} />
        <input
          type="text"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Investment Banking Analyst"
          disabled={phase === 'email_gate'}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && phase === 'idle') onStart();
          }}
          style={inputBare}
        />
      </div>
      <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 6, marginBottom: 22, lineHeight: 1.5 }}>
        Broader titles return more matches. Try "Analyst" before "Junior FX Analyst".
      </p>

      {phase === 'email_gate' ? (
        <>
          <Label num={3} text="Almost there - where should we send results?" />
          <div
            style={{
              fontSize: 13,
              color: '#64748B',
              marginTop: -4,
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Lock size={14} />
            We use this to follow up if Offerloop can help on your next search. No spam.
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 10,
              marginBottom: 14,
            }}
          >
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name (Jane Doe)"
              style={textInput}
              autoFocus
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@university.edu"
              style={textInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSubmit();
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onBack} style={ghostBtn} type="button">
              Back
            </button>
            <button
              onClick={onSubmit}
              style={{
                ...primaryBtn,
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
              type="button"
            >
              <Search size={16} />
              Find 5 people
            </button>
          </div>
        </>
      ) : (
        <button
          onClick={onStart}
          style={{
            ...primaryBtn,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
          type="button"
        >
          <Search size={16} />
          Find 5 people
        </button>
      )}

      {error ? <div style={errorBox}>{error}</div> : null}
    </div>
  </div>
);

// ──────────────────────────────────────────────────────────────────────────
// Loading
// ──────────────────────────────────────────────────────────────────────────

const RunningCard = ({ stepIndex }: { stepIndex: number }) => {
  const percent = Math.round(((stepIndex + 1) / RUNNING_STEPS.length) * 100);
  return (
    <div style={{ ...cardShell, padding: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Loader2 size={20} style={{ color: BRAND, animation: 'fpp-spin 1s linear infinite' }} />
        <p style={{ fontSize: 15, fontWeight: 600, color: INK, margin: 0 }}>
          {RUNNING_STEPS[stepIndex]?.label || 'Working...'}
        </p>
      </div>

      <div
        style={{
          height: 6,
          background: '#F1F5F9',
          borderRadius: 999,
          overflow: 'hidden',
          marginBottom: 18,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${percent}%`,
            background: BRAND,
            transition: 'width 0.6s ease',
          }}
        />
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
        {RUNNING_STEPS.map((step, i) => {
          const done = i < stepIndex;
          const active = i === stepIndex;
          return (
            <li key={step.label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              {done ? (
                <CheckCircle2 size={16} style={{ color: BRAND, marginTop: 2, flexShrink: 0 }} />
              ) : active ? (
                <Loader2
                  size={16}
                  style={{
                    color: BRAND,
                    marginTop: 2,
                    animation: 'fpp-spin 1s linear infinite',
                    flexShrink: 0,
                  }}
                />
              ) : (
                <span
                  style={{
                    width: 16,
                    height: 16,
                    marginTop: 2,
                    background: '#F1F5F9',
                    border: '1px solid #E2E8F0',
                    borderRadius: '50%',
                    flexShrink: 0,
                  }}
                />
              )}
              <div>
                <p
                  style={{
                    fontSize: 13.5,
                    fontWeight: active ? 600 : 500,
                    color: done || active ? INK : '#94A3B8',
                    margin: 0,
                  }}
                >
                  {step.label}
                </p>
                <p style={{ fontSize: 12, color: '#94A3B8', margin: '1px 0 0 0' }}>{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>

      <p style={{ fontSize: 12.5, color: '#94A3B8', marginTop: 20 }}>
        Usually 2 to 5 seconds.
      </p>

      <style>{`@keyframes fpp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// Results
// ──────────────────────────────────────────────────────────────────────────

const ResultsBlock = ({
  result,
  onDownload,
  onReset,
}: {
  result: SearchPeopleResponse;
  onDownload: () => void;
  onReset: () => void;
}) => {
  const people = result.results || [];
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND_DARK, letterSpacing: '0.06em' }}>
            READY
          </div>
          <h3
            style={{
              fontFamily: SERIF,
              fontSize: 28,
              fontWeight: 400,
              color: INK,
              margin: '4px 0 0 0',
            }}
          >
            {people.length} {people.length === 1 ? 'person' : 'people'} at {result.company}
          </h3>
          {result.role ? (
            <p
              style={{
                fontSize: 13,
                color: '#64748B',
                marginTop: 4,
                marginBottom: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Users size={13} color="#94A3B8" />
              Matching role: {result.role}
            </p>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={onReset}
            style={{ ...ghostBtn, display: 'flex', alignItems: 'center', gap: 6 }}
            type="button"
          >
            New search
          </button>
          <button
            onClick={onDownload}
            style={{ ...primaryBtn, display: 'flex', alignItems: 'center', gap: 8 }}
            type="button"
          >
            <Download size={16} />
            Download CSV
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          marginBottom: 20,
        }}
      >
        {people.map((p, idx) => (
          <PersonCard key={`${p.name}-${idx}`} p={p} />
        ))}
      </div>

      <UpgradeFooter />
    </div>
  );
};

const PersonCard = ({ p }: { p: PublicPerson }) => (
  <div style={cardShell}>
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h4
          style={{
            fontFamily: SERIF,
            fontSize: 19,
            fontWeight: 400,
            color: INK,
            margin: 0,
            lineHeight: 1.25,
            letterSpacing: '-0.01em',
          }}
        >
          {p.name || '(unnamed)'}
        </h4>
        <p style={{ fontSize: 13.5, color: '#475569', margin: '4px 0 0 0', lineHeight: 1.5 }}>
          {p.title ? <span style={{ fontWeight: 600 }}>{p.title}</span> : null}
          {p.title && p.company ? <span style={{ color: '#94A3B8' }}> at </span> : null}
          {p.company || null}
        </p>
      </div>
      {p.linkedin ? (
        <a
          href={p.linkedin}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            fontWeight: 600,
            color: BRAND_DARK,
            background: '#EFF5FF',
            border: '1px solid #DBEAFE',
            borderRadius: 6,
            padding: '6px 10px',
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          <Linkedin size={14} />
          LinkedIn
        </a>
      ) : null}
    </div>

    {p.school ? (
      <div
        style={{
          marginTop: 14,
          padding: '10px 12px',
          background: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: 6,
          fontSize: 12.5,
          color: '#334155',
          lineHeight: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <GraduationCap size={14} style={{ color: BRAND_DARK, flexShrink: 0 }} />
        {p.school}
      </div>
    ) : null}
  </div>
);

const UpgradeFooter = () => (
  <div
    style={{
      borderTop: '1px solid #F1F5F9',
      paddingTop: 20,
      display: 'flex',
      flexWrap: 'wrap',
      gap: 12,
      alignItems: 'center',
      justifyContent: 'space-between',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Target size={18} color={BRAND} />
      <div>
        <p style={{ fontSize: 14, fontWeight: 600, color: INK, margin: 0 }}>
          Need more than 5?
        </p>
        <p style={{ fontSize: 12.5, color: '#64748B', margin: '2px 0 0 0' }}>
          Unlimited searches with verified work emails inside Offerloop.
        </p>
      </div>
    </div>
    <Link
      to="/onboarding"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: BRAND,
        color: '#FFF',
        padding: '10px 16px',
        borderRadius: 3,
        fontSize: 14,
        fontWeight: 600,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      Find more people
      <ArrowRight size={14} />
    </Link>
  </div>
);

// ──────────────────────────────────────────────────────────────────────────
// Failure
// ──────────────────────────────────────────────────────────────────────────

const FailedCard = ({ message, onReset }: { message: string; onReset: () => void }) => (
  <div
    style={{
      background: '#FEF2F2',
      border: '1px solid #FECACA',
      borderRadius: 6,
      padding: 24,
    }}
  >
    <p style={{ fontSize: 13, fontWeight: 700, color: '#991B1B', margin: 0 }}>
      We couldn't return results
    </p>
    <p style={{ fontSize: 14, color: '#7F1D1D', lineHeight: 1.55, margin: '6px 0 14px 0' }}>
      {message}
    </p>
    <button
      type="button"
      onClick={onReset}
      style={{
        background: BRAND,
        color: '#FFF',
        border: 'none',
        borderRadius: 3,
        padding: '10px 16px',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      Try a different search
    </button>
  </div>
);

// ──────────────────────────────────────────────────────────────────────────
// Style tokens
// ──────────────────────────────────────────────────────────────────────────

const cardShell: React.CSSProperties = {
  background: '#FFF',
  border: '1px solid #E2E8F0',
  borderRadius: 14,
  padding: 22,
  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
  boxSizing: 'border-box',
};

const inputShell: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: 12,
  border: '1px solid #CBD5E1',
  borderRadius: 8,
  background: '#FFF',
};

const inputBare: React.CSSProperties = {
  width: '100%',
  border: 'none',
  outline: 'none',
  fontSize: 14,
  color: INK,
  background: 'transparent',
};

const textInput: React.CSSProperties = {
  width: '100%',
  padding: 12,
  border: '1px solid #CBD5E1',
  borderRadius: 8,
  fontSize: 14,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const primaryBtn: React.CSSProperties = {
  background: BRAND,
  color: '#FFF',
  border: 'none',
  borderRadius: 8,
  padding: '12px 18px',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
};

const ghostBtn: React.CSSProperties = {
  background: '#FFF',
  color: INK,
  border: '1px solid #CBD5E1',
  borderRadius: 8,
  padding: '12px 18px',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: 12,
  background: '#FEF2F2',
  border: '1px solid #FECACA',
  borderRadius: 8,
  color: '#991B1B',
  fontSize: 14,
};

const Label = ({ num, text }: { num: number; text: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
    <span
      style={{
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: BRAND,
        color: '#FFF',
        fontSize: 12,
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {num}
    </span>
    <span style={{ fontWeight: 600, fontSize: 14, color: INK }}>{text}</span>
  </div>
);
