/**
 * AlumniConsent, Phase 6 of the Personalization Data Layer.
 *
 * Per section 15.5 (final design decision after eng + design review): the
 * alumni graph is default-OFF, value-anchored opt-in. We surface the modal
 * the first time a user touches their school's alumni count, NOT at sign-up.
 * This trades raw opt-in rate (40-60% range) for a much cleaner FERPA
 * posture and a defensible privacy story for an 18 to 22 .edu user base.
 *
 * Two surfaces invoke this:
 *   - AlumniCountBadge click (surface = 'count_badge')
 *   - AccountSettings  Alumni Graph row (surface = 'account_settings')
 *
 * Copy is plain language. No legal jargon, no marketing puff. The single
 * value claim: "see who from your school is already there." The single
 * cost claim: "your name + role become visible to other students at your
 * school." Either side can change the answer at any time.
 */
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { setAlumniGraphConsent } from '@/services/api';
import type { AlumniGraphConsent as AlumniGraphConsentValue } from '@/types/user';
import { useEventLogger } from '@/hooks/useEventLogger';

export type AlumniConsentSurface = 'count_badge' | 'account_settings' | 'first_run';

interface AlumniConsentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The user's current consent state, used to render the right CTAs. */
  currentValue?: AlumniGraphConsentValue | null;
  /** Where the modal was opened from. Drives the surface in the audit event. */
  surface?: AlumniConsentSurface;
  /** School slug + display, used in the value claim copy. */
  schoolDisplay?: string | null;
  /** Called after a successful decision write so the parent can refresh state. */
  onDecided?: (next: 'opt_in' | 'opt_out') => void;
}

export function AlumniConsent({
  open,
  onOpenChange,
  currentValue,
  surface = 'account_settings',
  schoolDisplay,
  onDecided,
}: AlumniConsentProps) {
  const [submitting, setSubmitting] = useState<null | 'opt_in' | 'opt_out'>(null);
  const [error, setError] = useState<string | null>(null);
  const { logEvent } = useEventLogger();

  const isOptedIn = currentValue === 'opt_in';
  const isOptedOut = currentValue === 'opt_out';
  const schoolLabel = schoolDisplay && schoolDisplay.trim() ? schoolDisplay : 'your school';

  async function decide(next: 'opt_in' | 'opt_out') {
    if (submitting) return;
    setError(null);
    setSubmitting(next);
    try {
      await setAlumniGraphConsent(next, surface);
      logEvent('alumni_consent_decision', {
        value: next,
        surface,
      });
      onDecided?.(next);
      onOpenChange(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not save your choice. Try again in a moment.',
      );
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (submitting ? undefined : onOpenChange(v))}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Help other students at {schoolLabel} find each other</DialogTitle>
          <DialogDescription>
            Opt in and we'll list your name and current role on the page other
            students see when they look up alumni at your school. You'll also
            see who from {schoolLabel} is already at the companies you care
            about.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md bg-primary/5 p-4 text-sm leading-relaxed text-foreground">
          <p className="font-medium">What changes if you opt in</p>
          <ul className="mt-2 space-y-1.5 list-disc pl-5 text-muted-foreground">
            <li>Your name and role show up to other Offerloop users from {schoolLabel}.</li>
            <li>You can opt out at any time in Account Settings.</li>
            <li>Your email and other private fields are never shared.</li>
          </ul>
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={submitting !== null}
            onClick={() => decide('opt_out')}
            aria-pressed={isOptedOut}
          >
            {isOptedOut ? 'Stay opted out' : 'No thanks'}
          </Button>
          <Button
            type="button"
            disabled={submitting !== null || isOptedIn}
            onClick={() => decide('opt_in')}
            aria-pressed={isOptedIn}
          >
            {submitting === 'opt_in'
              ? 'Saving…'
              : isOptedIn
                ? 'Already opted in'
                : "I'm in"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
