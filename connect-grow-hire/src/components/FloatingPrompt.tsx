/**
 * FloatingPrompt -- Phase 3 of the Personalization Data Layer.
 *
 * Inline (NOT modal -- modals break flow per §15 #2) component that asks
 * the user "why this company?" before an outreach email is generated.
 * The answer becomes a `companyContext` document that downstream gens
 * weave into the email body.
 *
 * State machine:
 *   idle ─► loading-decision ─► hidden | shown
 *   shown ─► answering ─► saving ─► answered | error
 *   shown ─► dismissed
 *   shown ─► remind-later
 *
 * Behavior rules (per spec):
 *   - Skipping does NOT block the email send. Caller renders this and
 *     proceeds independently -- the prompt is a side-channel.
 *   - Stale re-ask UI MUST acknowledge the prior answer
 *     ("Last time you said: '{reason}'. Anything different now?") so the
 *     user knows the system remembers them.
 *   - 3 industry-seeded suggestion chips (FLOATING_PROMPT_CHIPS).
 *   - Post-answer regen target <4s; we surface a "Generating..." state
 *     above 1.5s and a fallback notice above 8s (caller-side; this
 *     component just signals `onAnswered`).
 *
 * Events fired:
 *   - prompt_shown    -- once on first render after the API says show=true
 *   - prompt_answered -- when the user submits a valid reason
 *   - prompt_dismissed -- Skip / Remind-me-later (with `promptType` stable)
 *
 * The component is a no-op when FLOATING_PROMPT_ENABLED is false. Render
 * it unconditionally; the flag short-circuits internally so callers don't
 * have to thread the flag through.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, X, Clock } from 'lucide-react';
import { getAuth } from 'firebase/auth';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useEventLogger } from '@/hooks/useEventLogger';
import { API_BASE_URL } from '@/services/api';
import {
  DEFAULT_FLOATING_PROMPT_CHIPS,
  FLOATING_PROMPT_CHIPS,
  FLOATING_PROMPT_ENABLED,
  type TargetIndustryValue,
} from '@/lib/constants';

const REASON_MIN_CHARS = 10;
const REASON_MAX_CHARS = 1000;
const REMIND_LATER_KEY = 'offerloop_floating_prompt_remind_later';
const REMIND_LATER_TTL_HOURS = 24;

interface ShouldShowResponse {
  show: boolean;
  reason:
    | 'no_context'
    | 'inferred_only'
    | 'stale'
    | 'unanswered_threshold'
    | 'fresh'
    | 'invalid_input'
    | 'flag_disabled';
  priorAnswer: string | null;
  priorSource?: string | null;
  companyId: string;
}

export interface FloatingPromptProps {
  /** Display name (e.g. "Goldman Sachs"). Required. */
  companyName: string;
  /** Already-normalized slug; if omitted, backend re-normalizes from name. */
  companyId?: string;
  /** User's target industries -- used to seed suggestion chips. */
  targetIndustries?: TargetIndustryValue[] | string[];
  /** Called once the user submits an answer, after the POST resolves. */
  onAnswered?: (reason: string) => void;
  /** Called when the user skips / dismisses; caller continues unblocked. */
  onSkipped?: (kind: 'skip' | 'remind-later') => void;
  className?: string;
}

function getRemindLaterUntil(companyId: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(REMIND_LATER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, number>;
    const value = parsed?.[companyId];
    return typeof value === 'number' ? value : null;
  } catch {
    return null;
  }
}

function setRemindLaterUntil(companyId: string, untilMs: number): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(REMIND_LATER_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    parsed[companyId] = untilMs;
    window.localStorage.setItem(REMIND_LATER_KEY, JSON.stringify(parsed));
  } catch {
    // localStorage full / disabled -- drop silently.
  }
}

async function fetchShouldShow(
  companyName: string,
  companyId?: string,
): Promise<ShouldShowResponse | null> {
  const user = getAuth().currentUser;
  if (!user) return null;
  let token: string;
  try {
    token = await user.getIdToken();
  } catch {
    return null;
  }
  const params = new URLSearchParams({ company: companyName });
  if (companyId) params.set('companyId', companyId);
  const resp = await fetch(
    `${API_BASE_URL}/company-contexts/should-show?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!resp.ok) return null;
  return (await resp.json()) as ShouldShowResponse;
}

async function postCompanyContext(
  companyName: string,
  reason: string,
  companyId?: string,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const user = getAuth().currentUser;
  if (!user) return { ok: false, status: 401, error: 'not signed in' };
  const token = await user.getIdToken();
  const resp = await fetch(`${API_BASE_URL}/company-contexts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ company: companyName, companyId, reason }),
  });
  if (!resp.ok) {
    let error = `HTTP ${resp.status}`;
    try {
      const data = await resp.json();
      error = data?.error || error;
    } catch {
      /* swallow */
    }
    return { ok: false, status: resp.status, error };
  }
  return { ok: true, status: resp.status };
}

export function FloatingPrompt({
  companyName,
  companyId,
  targetIndustries,
  onAnswered,
  onSkipped,
  className,
}: FloatingPromptProps) {
  const { logEvent } = useEventLogger();
  const [decision, setDecision] = useState<ShouldShowResponse | null>(null);
  const [phase, setPhase] = useState<
    'loading' | 'shown' | 'saving' | 'answered' | 'dismissed' | 'error'
  >('loading');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const promptShownLogged = useRef(false);

  // Fetch decision (or short-circuit if flag is off / remind-later still active).
  useEffect(() => {
    let cancelled = false;
    setPhase('loading');
    setDecision(null);
    setReason('');
    setError(null);
    promptShownLogged.current = false;

    if (!FLOATING_PROMPT_ENABLED || !companyName) {
      setPhase('dismissed');
      return;
    }

    const remindUntil = companyId ? getRemindLaterUntil(companyId) : null;
    if (remindUntil && remindUntil > Date.now()) {
      setPhase('dismissed');
      return;
    }

    fetchShouldShow(companyName, companyId).then((res) => {
      if (cancelled) return;
      if (!res || !res.show) {
        setPhase('dismissed');
        return;
      }
      setDecision(res);
      setPhase('shown');
    });

    return () => {
      cancelled = true;
    };
  }, [companyName, companyId]);

  // Fire prompt_shown ONCE per (user, company) reveal.
  useEffect(() => {
    if (phase !== 'shown' || promptShownLogged.current) return;
    promptShownLogged.current = true;
    logEvent('prompt_shown', {
      promptType: 'floating_company_context',
      companyId: decision?.companyId,
    });
  }, [phase, decision, logEvent]);

  const chips = useMemo<readonly string[]>(() => {
    if (!targetIndustries || targetIndustries.length === 0) {
      return DEFAULT_FLOATING_PROMPT_CHIPS;
    }
    for (const ind of targetIndustries) {
      const set = FLOATING_PROMPT_CHIPS[ind as string];
      if (set && set.length > 0) return set;
    }
    return DEFAULT_FLOATING_PROMPT_CHIPS;
  }, [targetIndustries]);

  if (phase === 'loading' || phase === 'dismissed' || phase === 'answered') {
    return null;
  }

  const isStale = decision?.reason === 'stale' || decision?.reason === 'unanswered_threshold';
  const trimmedLen = reason.trim().length;
  const canSubmit = trimmedLen >= REASON_MIN_CHARS && trimmedLen <= REASON_MAX_CHARS;

  const handleChip = (chip: string) => {
    setReason(chip);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setPhase('saving');
    setError(null);
    const result = await postCompanyContext(companyName, reason.trim(), companyId);
    if (!result.ok) {
      setError(result.error || 'Could not save your reason. Try again.');
      setPhase('error');
      return;
    }
    logEvent('prompt_answered', {
      promptType: 'floating_company_context',
      companyId: decision?.companyId,
      answerChars: reason.trim().length,
    });
    setPhase('answered');
    onAnswered?.(reason.trim());
  };

  const handleDismiss = (kind: 'skip' | 'remind-later') => {
    if (kind === 'remind-later' && decision?.companyId) {
      setRemindLaterUntil(
        decision.companyId,
        Date.now() + REMIND_LATER_TTL_HOURS * 60 * 60 * 1000,
      );
    }
    logEvent('prompt_dismissed', {
      promptType: 'floating_company_context',
      companyId: decision?.companyId,
    });
    setPhase('dismissed');
    onSkipped?.(kind);
  };

  return (
    <div
      className={cn(
        'rounded-lg border border-primary/20 bg-primary/5 p-4 shadow-sm',
        'animate-in fade-in slide-in-from-top-1 duration-200',
        className,
      )}
      role="region"
      aria-label="Personalize this email"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-primary/10 p-1.5 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Why <span className="text-primary">{companyName}</span>?
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                One sentence is plenty -- we&apos;ll weave it into the email.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleDismiss('skip')}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Skip this prompt"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {isStale && decision?.priorAnswer ? (
            <div className="mt-3 rounded-md border border-border/60 bg-background px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Last time you said:</span>{' '}
              &quot;{decision.priorAnswer}&quot;
              <div className="mt-1">Anything different now?</div>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => handleChip(chip)}
                className={cn(
                  'rounded-full border border-primary/20 bg-background px-3 py-1 text-xs',
                  'text-foreground hover:border-primary/40 hover:bg-primary/5',
                  'transition-colors',
                )}
              >
                {chip}
              </button>
            ))}
          </div>

          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX_CHARS))}
            placeholder="e.g. My uncle worked in their TMT group; I want to learn from that team."
            className="mt-3 min-h-[72px] resize-none border-border/80 bg-background text-sm"
            disabled={phase === 'saving'}
          />

          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {trimmedLen < REASON_MIN_CHARS
                ? `${REASON_MIN_CHARS - trimmedLen} more characters`
                : `${trimmedLen} / ${REASON_MAX_CHARS}`}
            </span>
            {error ? <span className="text-destructive">{error}</span> : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              disabled={!canSubmit || phase === 'saving'}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {phase === 'saving' ? 'Saving…' : 'Use this reason'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => handleDismiss('remind-later')}
              className="text-muted-foreground hover:text-foreground"
            >
              <Clock className="mr-1 h-3.5 w-3.5" />
              Remind me later
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => handleDismiss('skip')}
              className="text-muted-foreground hover:text-foreground"
            >
              Skip
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FloatingPrompt;
