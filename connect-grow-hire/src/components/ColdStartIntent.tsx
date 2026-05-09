/**
 * ColdStartIntent -- Phase 3 of the Personalization Data Layer.
 *
 * 5-question gate for thin-resume users (no resumeText OR profileConfirmedAt
 * is null). Per §15 #3:
 *   - Don't gate the FIRST email -- gate the first AI-personalized email.
 *   - Don't call this anything in user-facing copy. The page just has
 *     questions on it. No "cold start," no "intent flow."
 *   - Question 4 (the wedge) is the unlock. Partial completion at Q4 still
 *     pays off -- Q4 alone produces a meaningfully better email than no
 *     answers at all.
 *   - localStorage-backed partials so a closed tab doesn't waste effort.
 *   - 7-day "resume" banner brings the user back to where they left off.
 *
 * The 5 questions (locked content per the design decision):
 *   1. What career path are you most focused on right now?
 *   2. Which 1–3 companies are at the top of your list?
 *   3. What's one role / team you'd love to land?
 *   4. What's your wedge -- the thing that makes you different from
 *      classmates targeting the same path?  ← the unlock
 *   5. What's a recent thing (project, class, internship, side bet) you'd
 *      want to talk about with someone in this field?
 *
 * Writes go to:
 *   - users/{uid} -- `targetIndustries`, `targetCompanies`, `targetRoleTypes`,
 *     `interestTags`, `professionalInfo.wedge`, `professionalInfo.recentWork`
 *     via the existing `/api/users/profile-confirm` endpoint where possible,
 *     and a small `/api/users/cold-start` shim for the wedge / recent fields
 *     that aren't covered by the Phase 1 confirm-modal whitelist.
 *
 * Events fired:
 *   - profile_field_edited per question on submit (one per non-empty answer)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, RotateCcw } from 'lucide-react';
import { getAuth } from 'firebase/auth';

import { API_BASE_URL } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  COLD_START_INTENT_ENABLED,
  TARGET_INDUSTRIES,
  TARGET_ROLE_TYPES,
} from '@/lib/constants';
import { useEventLogger } from '@/hooks/useEventLogger';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'offerloop_cold_start_partial';
const STORAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const Q4_WEDGE_INDEX = 3; // 0-indexed unlock question

type Answers = {
  industry: string;       // single value from TARGET_INDUSTRIES
  companies: string;      // free-text, comma-separated
  roleType: string;       // single value from TARGET_ROLE_TYPES
  wedge: string;          // the unlock -- what makes you different
  recentWork: string;     // recent project / class / internship to discuss
};

const EMPTY: Answers = {
  industry: '',
  companies: '',
  roleType: '',
  wedge: '',
  recentWork: '',
};

interface ColdStartIntentProps {
  /** Called once the user submits Q4 or all 5; caller closes/redirects. */
  onComplete?: (answers: Answers) => void;
  /** Called when the user dismisses without completing Q4. */
  onSkipped?: () => void;
  className?: string;
}

interface PersistedPartial {
  answers: Answers;
  step: number;
  savedAt: number;
}

function readPartial(): PersistedPartial | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedPartial;
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > STORAGE_TTL_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writePartial(answers: Answers, step: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ answers, step, savedAt: Date.now() }),
    );
  } catch {
    /* localStorage full / disabled */
  }
}

function clearPartial(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* swallow */
  }
}

async function postProfileFields(payload: Record<string, unknown>): Promise<boolean> {
  const user = getAuth().currentUser;
  if (!user) return false;
  let token: string;
  try {
    token = await user.getIdToken();
  } catch {
    return false;
  }
  // Phase 1 endpoint covers most fields; we send the wedge + recentWork as
  // `interestTags` extensions until a dedicated /cold-start writer ships.
  const resp = await fetch(`${API_BASE_URL}/users/profile-confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return resp.ok;
}

export function ColdStartIntent({
  onComplete,
  onSkipped,
  className,
}: ColdStartIntentProps) {
  const { logEvent } = useEventLogger();
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [step, setStep] = useState<number>(0);
  const [resumed, setResumed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reachedUnlock, setReachedUnlock] = useState(false);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    const partial = readPartial();
    if (partial) {
      setAnswers(partial.answers);
      setStep(partial.step);
      setResumed(true);
    }
  }, []);

  // Auto-persist on every change.
  useEffect(() => {
    writePartial(answers, step);
  }, [answers, step]);

  const totalSteps = 5;
  const isLastStep = step === totalSteps - 1;
  const currentValue = useMemo(() => {
    switch (step) {
      case 0: return answers.industry;
      case 1: return answers.companies;
      case 2: return answers.roleType;
      case 3: return answers.wedge;
      case 4: return answers.recentWork;
      default: return '';
    }
  }, [step, answers]);

  const stepValid = useMemo(() => {
    if (step === 3) {
      // Q4 (wedge) -- require a real answer (15+ chars) since this is the unlock.
      return answers.wedge.trim().length >= 15;
    }
    return (currentValue || '').toString().trim().length > 0;
  }, [step, currentValue, answers.wedge]);

  const setAnswer = useCallback(<K extends keyof Answers>(key: K, value: Answers[K]) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }, []);

  const submit = useCallback(async (final: boolean) => {
    setSubmitting(true);
    setError(null);
    const payload: Record<string, unknown> = {};
    const fields_edited: string[] = [];

    if (answers.industry.trim()) {
      payload.targetIndustries = [answers.industry.trim()];
      fields_edited.push('targetIndustries');
    }
    if (answers.companies.trim()) {
      payload.targetCompanies = answers.companies
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 5);
      fields_edited.push('targetCompanies');
    }
    if (answers.roleType.trim()) {
      payload.targetRoleTypes = [answers.roleType.trim()];
      fields_edited.push('targetRoleTypes');
    }
    // wedge + recentWork ride along on `interestTags` until a dedicated
    // writer ships -- they survive synthesis as user-supplied signal.
    const tagBag: string[] = [];
    if (answers.wedge.trim()) {
      tagBag.push(`wedge:${answers.wedge.trim().slice(0, 240)}`);
      fields_edited.push('wedge');
    }
    if (answers.recentWork.trim()) {
      tagBag.push(`recent:${answers.recentWork.trim().slice(0, 240)}`);
      fields_edited.push('recentWork');
    }
    if (tagBag.length) payload.interestTags = tagBag;

    if (Object.keys(payload).length === 0) {
      setSubmitting(false);
      return;
    }
    const ok = await postProfileFields(payload);
    if (!ok) {
      setError('Could not save -- try again in a second.');
      setSubmitting(false);
      return;
    }
    fields_edited.forEach((field) => {
      logEvent('profile_field_edited', { field, hadPriorValue: false });
    });
    if (final) {
      clearPartial();
    }
    setSubmitting(false);
    onComplete?.(answers);
  }, [answers, logEvent, onComplete]);

  if (!COLD_START_INTENT_ENABLED) return null;

  // The 5 questions, content locked per spec.
  const questions = [
    {
      title: 'What are you focused on right now?',
      hint: 'Pick the path that takes the most of your time, even if you\'re still exploring.',
      render: () => (
        <Select
          value={answers.industry}
          onValueChange={(v) => setAnswer('industry', v)}
        >
          <SelectTrigger className="bg-background">
            <SelectValue placeholder="Pick a focus area" />
          </SelectTrigger>
          <SelectContent>
            {TARGET_INDUSTRIES.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      title: 'Which companies are at the top of your list?',
      hint: 'Up to three, separated by commas. Names are fine -- we\'ll match them to firms.',
      render: () => (
        <Input
          placeholder="e.g. Goldman Sachs, Evercore, Centerview"
          value={answers.companies}
          onChange={(e) => setAnswer('companies', e.target.value)}
          className="bg-background"
        />
      ),
    },
    {
      title: 'What role would you love to land?',
      hint: 'Pick the one you\'d say first if someone asked at a coffee chat.',
      render: () => (
        <Select
          value={answers.roleType}
          onValueChange={(v) => setAnswer('roleType', v)}
        >
          <SelectTrigger className="bg-background">
            <SelectValue placeholder="Pick a role type" />
          </SelectTrigger>
          <SelectContent>
            {TARGET_ROLE_TYPES.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      title: 'What\'s your wedge?',
      hint: 'The thing that makes you different from your classmates aiming for the same path. One sentence -- be specific.',
      render: () => (
        <Textarea
          placeholder="e.g. I built a working trading bot that learned options pricing from scratch."
          value={answers.wedge}
          onChange={(e) => setAnswer('wedge', e.target.value.slice(0, 280))}
          className="min-h-[88px] resize-none bg-background"
        />
      ),
    },
    {
      title: 'What\'s a recent thing you\'d want to talk about?',
      hint: 'A class, project, internship, or side bet. Used to make every email reference your real work.',
      render: () => (
        <Textarea
          placeholder="e.g. Finishing a thesis on bank capital frameworks; I\'d love to talk through it."
          value={answers.recentWork}
          onChange={(e) => setAnswer('recentWork', e.target.value.slice(0, 280))}
          className="min-h-[88px] resize-none bg-background"
        />
      ),
    },
  ];

  const q = questions[step];

  // After Q4 (the unlock), surface a "Done -- write me a great email" affordance
  // even if Q5 is unanswered.
  const showUnlockBanner = step >= Q4_WEDGE_INDEX && answers.wedge.trim().length >= 15;
  if (showUnlockBanner && !reachedUnlock) {
    setReachedUnlock(true);
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-background p-6 shadow-sm',
        'max-w-xl',
        className,
      )}
    >
      {resumed ? (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
          <RotateCcw className="h-3.5 w-3.5" />
          <span>We saved where you left off. Pick up from question {step + 1}.</span>
        </div>
      ) : null}

      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>Question {step + 1} of {totalSteps}</span>
        <span>{Math.round(((step + 1) / totalSteps) * 100)}%</span>
      </div>
      <div className="mb-6 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
        />
      </div>

      <Label className="text-base font-semibold text-foreground">{q.title}</Label>
      <p className="mt-1 text-xs text-muted-foreground">{q.hint}</p>
      <div className="mt-4">{q.render()}</div>

      {error ? (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      ) : null}

      <div className="mt-6 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || submitting}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              clearPartial();
              onSkipped?.();
            }}
            disabled={submitting}
            className="text-muted-foreground hover:text-foreground"
          >
            Skip
          </Button>

          {showUnlockBanner && step >= Q4_WEDGE_INDEX && !isLastStep ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => submit(false)}
              disabled={submitting}
            >
              {submitting ? 'Saving…' : 'Done -- write me an email'}
            </Button>
          ) : null}

          {isLastStep ? (
            <Button
              type="button"
              size="sm"
              onClick={() => submit(true)}
              disabled={!stepValid || submitting}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Check className="mr-1 h-4 w-4" />
              {submitting ? 'Saving…' : 'Finish'}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => setStep((s) => Math.min(totalSteps - 1, s + 1))}
              disabled={!stepValid}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Next
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ColdStartIntent;
