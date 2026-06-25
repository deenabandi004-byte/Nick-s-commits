/**
 * AutoApplyReviewModal — final confirmation + dry-run preview + real submit.
 *
 * Three visual states:
 *
 *   "review"   — User sees prefilled identity + screening + editable LLM
 *                answers. Toggle "Preview-fill only" (default ON) vs
 *                "Submit for real". Clicking Submit transitions to "running".
 *
 *   "running"  — We're polling /auto-apply/<id>/status. Shows the current
 *                `stage` from Firestore (queued / loading_data /
 *                downloading_resume / filling_form). No screenshot yet.
 *
 *   "done"     — Filler returned. Shows the full-page screenshot of what
 *                Browserless saw. For dry_run_complete, a "Submit for real
 *                now" button appears below. For submitted, a confirmation
 *                + "Close" button.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  pollAutoApplyStatus,
  submitAutoApply,
  type AutoApplyPrepareResponse,
  type AutoApplyStatusResponse,
} from "@/services/api";

interface AutoApplyReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prepared: AutoApplyPrepareResponse | null;
  onEditProfile: () => void;
}

type ModalPhase = "review" | "running" | "done";

export function AutoApplyReviewModal({
  open,
  onOpenChange,
  prepared,
  onEditProfile,
}: AutoApplyReviewModalProps) {
  const [editedAnswers, setEditedAnswers] = useState<Record<string, string>>(
    {},
  );
  const [dryRun, setDryRun] = useState(true);
  const [phase, setPhase] = useState<ModalPhase>("review");
  const [autoApplyId, setAutoApplyId] = useState<string | null>(null);
  const [statusDoc, setStatusDoc] = useState<AutoApplyStatusResponse | null>(
    null,
  );
  const [submitError, setSubmitError] = useState<{
    code: string;
    message: string;
  } | null>(null);
  const pollHandle = useRef<number | null>(null);

  // Reset when reopened on a fresh prepared payload
  useEffect(() => {
    if (open && prepared) {
      setPhase("review");
      setEditedAnswers({});
      setDryRun(true);
      setAutoApplyId(null);
      setStatusDoc(null);
      setSubmitError(null);
    }
  }, [open, prepared]);

  // Status polling
  useEffect(() => {
    if (phase !== "running" || !autoApplyId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const doc = await pollAutoApplyStatus(autoApplyId);
        if (cancelled) return;
        setStatusDoc(doc);
        if (
          doc.status === "dry_run_complete" ||
          doc.status === "submitted" ||
          doc.status === "submit_failed" ||
          doc.status === "failed"
        ) {
          setPhase("done");
          return;
        }
      } catch {
        // ignore transient polling failures
      }
      pollHandle.current = window.setTimeout(tick, 2_000);
    };
    tick();
    return () => {
      cancelled = true;
      if (pollHandle.current) {
        window.clearTimeout(pollHandle.current);
        pollHandle.current = null;
      }
    };
  }, [phase, autoApplyId]);

  if (!prepared) return null;
  const { job, preview, ats_platform } = prepared;
  const platformLabel = ats_platform
    ? ats_platform.charAt(0).toUpperCase() + ats_platform.slice(1)
    : "Unknown";

  const fireSubmit = async (asDryRun: boolean) => {
    setSubmitError(null);
    const resp = await submitAutoApply(prepared.job_id, {
      dry_run: asDryRun,
      edited_answers: editedAnswers,
    });
    if (!resp.ok || !resp.data?.auto_apply_id) {
      setSubmitError({
        code: resp.data?.code || "SUBMIT_FAILED",
        message:
          resp.data?.error || "Submission could not start. Try again later.",
      });
      return;
    }
    setAutoApplyId(resp.data.auto_apply_id);
    setDryRun(asDryRun);
    setStatusDoc(null);
    setPhase("running");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {phase === "review"
              ? `Review auto-apply for ${job.title} at ${job.company}`
              : phase === "running"
                ? dryRun
                  ? "Preview-filling the form…"
                  : "Submitting your application…"
                : statusDoc?.status === "submitted"
                  ? "Application submitted"
                  : statusDoc?.status === "dry_run_complete"
                    ? "Preview ready — verify below"
                    : "Submission failed"}
          </DialogTitle>
          <DialogDescription>
            {phase === "review"
              ? `${platformLabel} application. You can edit the open-ended answers below. Everything else is pulled from your resume and Application Profile.`
              : phase === "running"
                ? "We're driving Chromium against the live application page. This usually takes 20-40 seconds."
                : null}
          </DialogDescription>
        </DialogHeader>

        {phase === "review" && (
          <ReviewBody
            preview={preview}
            editedAnswers={editedAnswers}
            setEditedAnswers={setEditedAnswers}
            onEditProfile={onEditProfile}
          />
        )}

        {phase === "running" && (
          <RunningBody stage={statusDoc?.stage} />
        )}

        {phase === "done" && statusDoc && (
          <DoneBody doc={statusDoc} />
        )}

        {submitError && (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <div className="font-medium">{prettyErrorTitle(submitError.code)}</div>
            <div className="mt-1">{submitError.message}</div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {phase === "review" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button variant="outline" onClick={() => fireSubmit(true)}>
                Preview-fill only (free)
              </Button>
              <Button onClick={() => fireSubmit(false)}>
                Submit for real (5 credits)
              </Button>
            </>
          )}
          {phase === "running" && (
            <Button variant="outline" disabled>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Running…
            </Button>
          )}
          {phase === "done" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              {statusDoc?.status === "dry_run_complete" && (
                <Button onClick={() => fireSubmit(false)}>
                  Looks right — submit for real (5 credits)
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Phase bodies
// ---------------------------------------------------------------------------

interface ReviewBodyProps {
  preview: AutoApplyPrepareResponse["preview"];
  editedAnswers: Record<string, string>;
  setEditedAnswers: (a: Record<string, string>) => void;
  onEditProfile: () => void;
}

function ReviewBody({
  preview,
  editedAnswers,
  setEditedAnswers,
  onEditProfile,
}: ReviewBodyProps) {
  return (
    <div className="space-y-5 py-2">
      <section className="space-y-2">
        <SectionHeader title="Identity" />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <ReadOnlyRow label="Name" value={preview.fields.full_name} />
          <ReadOnlyRow label="Email" value={preview.fields.email} />
          <ReadOnlyRow label="Phone" value={preview.fields.phone} />
          <ReadOnlyRow label="Location" value={preview.fields.location} />
          {preview.fields.linkedin_url && (
            <ReadOnlyRow label="LinkedIn" value={preview.fields.linkedin_url} />
          )}
          <ReadOnlyRow
            label="Resume"
            value={
              preview.resume.has_resume
                ? preview.resume.filename
                : "(no resume on file — upload one in Account Settings)"
            }
          />
        </div>
      </section>

      <section className="space-y-2">
        <SectionHeader
          title="Screening answers"
          action={
            <button
              type="button"
              onClick={onEditProfile}
              className="text-xs text-blue-600 hover:underline"
            >
              Edit profile
            </button>
          }
        />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <ReadOnlyRow
            label="Authorized to work in US"
            value={fmtBool(preview.structured_answers.authorized_to_work_us)}
          />
          <ReadOnlyRow
            label="Requires sponsorship"
            value={fmtBool(preview.structured_answers.requires_sponsorship)}
          />
          <ReadOnlyRow
            label="Gender"
            value={fmtChoice(preview.structured_answers.gender)}
          />
          <ReadOnlyRow
            label="Race"
            value={fmtChoice(preview.structured_answers.race)}
          />
          <ReadOnlyRow
            label="Ethnicity"
            value={fmtChoice(preview.structured_answers.ethnicity)}
          />
          <ReadOnlyRow
            label="Veteran status"
            value={fmtChoice(preview.structured_answers.veteran_status)}
          />
          <ReadOnlyRow
            label="Disability status"
            value={fmtChoice(preview.structured_answers.disability_status)}
          />
          {preview.structured_answers.earliest_start_date && (
            <ReadOnlyRow
              label="Earliest start"
              value={preview.structured_answers.earliest_start_date}
            />
          )}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Open-ended answers (edit before submitting)" />
        {Object.entries(preview.open_ended_answers).map(([key, qa]) => {
          const current = editedAnswers[key] ?? qa.answer;
          const needsUser = qa.answer === "NEEDS_USER";
          return (
            <div key={key} className="space-y-1.5">
              <Label className="text-xs font-medium">{qa.question}</Label>
              <Textarea
                rows={4}
                value={needsUser && current === "NEEDS_USER" ? "" : current}
                placeholder={
                  needsUser
                    ? "We couldn't generate an answer from your resume — fill this in yourself."
                    : ""
                }
                onChange={(e) =>
                  setEditedAnswers({
                    ...editedAnswers,
                    [key]: e.target.value,
                  })
                }
              />
            </div>
          );
        })}
      </section>
    </div>
  );
}

function RunningBody({ stage }: { stage?: string }) {
  const friendly =
    stage === "loading_data"
      ? "Loading your profile and the job posting…"
      : stage === "downloading_resume"
        ? "Fetching your resume…"
        : stage === "filling_form"
          ? "Filling the application form in a headless browser…"
          : "Working…";
  return (
    <div className="py-10 flex flex-col items-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      <div className="text-sm text-slate-600">{friendly}</div>
    </div>
  );
}

function DoneBody({ doc }: { doc: AutoApplyStatusResponse }) {
  if (doc.status === "failed" || doc.status === "submit_failed") {
    return (
      <div className="space-y-3 py-2">
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <div className="font-medium">
            {doc.status === "submit_failed"
              ? "Filled the form, but the final Submit click failed"
              : "Form-filler crashed"}
          </div>
          {doc.failure_reason && (
            <div className="mt-1 font-mono text-xs">{doc.failure_reason}</div>
          )}
          {doc.attempt_log && doc.attempt_log.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs cursor-pointer">
                Attempted {doc.attempt_log.length} URL
                {doc.attempt_log.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-1 list-disc pl-5 font-mono text-xs space-y-0.5">
                {doc.attempt_log.map((a, i) => (
                  <li key={i}>
                    {a.url} → <em>{a.result}</em>
                    {a.final_url && a.final_url !== a.url && (
                      <span className="text-red-700"> (landed at {a.final_url})</span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {doc.credits_refunded && (
            <div className="mt-2 text-xs text-red-700">
              Credits were refunded.
            </div>
          )}
        </div>
        {doc.unmapped && doc.unmapped.length > 0 && (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-medium">
              {doc.unmapped.length} field{doc.unmapped.length === 1 ? "" : "s"}{" "}
              couldn't be filled automatically:
            </div>
            <ul className="mt-1 list-disc pl-5 text-xs space-y-0.5">
              {doc.unmapped.slice(0, 20).map((u, i) => (
                <li key={i}>
                  <span className="font-medium">{u.label}</span>
                  {u.reason ? (
                    <em className="text-amber-700"> — {u.reason}</em>
                  ) : null}
                </li>
              ))}
              {doc.unmapped.length > 20 && (
                <li className="italic">
                  …and {doc.unmapped.length - 20} more
                </li>
              )}
            </ul>
          </div>
        )}
        {(doc.screenshot_b64 || doc.screenshot_url) && (
          <div className="space-y-1">
            <div className="text-xs text-slate-500">
              Screenshot of the page after Submit (shows validation state):
            </div>
            <Screenshot b64={doc.screenshot_b64} url={doc.screenshot_url} />
          </div>
        )}
      </div>
    );
  }

  const verb =
    doc.status === "submitted"
      ? "submitted"
      : "preview-filled (not submitted)";
  return (
    <div className="space-y-3 py-2">
      <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-900">
        Application {verb} on the live page. Screenshot below — verify it
        looks right before you trust it.
      </div>
      {doc.unmapped && doc.unmapped.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-medium">
            {doc.unmapped.length} field{doc.unmapped.length === 1 ? "" : "s"}{" "}
            couldn't be filled automatically:
          </div>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {doc.unmapped.slice(0, 8).map((u, i) => (
              <li key={i}>
                {u.label} {u.reason ? <em className="text-amber-700">— {u.reason}</em> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(doc.screenshot_b64 || doc.screenshot_url) && (
        <Screenshot b64={doc.screenshot_b64} url={doc.screenshot_url} />
      )}
    </div>
  );
}

function Screenshot({ b64, url }: { b64?: string; url?: string }) {
  // Backend stores small screenshots inline as base64 in Firestore and
  // large ones (> 1MB) in Cloud Storage with a public URL. Render whichever
  // is present; prefer the inline b64 since it doesn't trigger an extra
  // HTTP request when both are unexpectedly set.
  const src = b64 ? `data:image/png;base64,${b64}` : url;
  if (!src) return null;
  return (
    <div className="rounded border border-slate-200 overflow-hidden">
      <img
        src={src}
        alt="Filled application form screenshot"
        className="w-full h-auto block"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {action}
    </div>
  );
}

function ReadOnlyRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-slate-500">{label}</Label>
      <Input
        readOnly
        value={value || "—"}
        className="bg-slate-50 text-slate-700"
      />
    </div>
  );
}

function fmtBool(v: boolean | null): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "Not set";
}

function fmtChoice(v: string | null | undefined): string {
  if (!v) return "—";
  if (v === "decline") return "Decline to answer";
  return v
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function prettyErrorTitle(code: string): string {
  switch (code) {
    case "BROWSERLESS_NOT_CONFIGURED":
      return "Auto-apply infrastructure not configured yet";
    case "INSUFFICIENT_CREDITS":
      return "Not enough credits";
    case "PROFILE_REQUIRED":
      return "Application Profile needs to be saved first";
    case "INELIGIBLE":
      return "This job isn't auto-apply eligible";
    case "JOB_NOT_FOUND":
      return "Job not found";
    default:
      return "Submission failed";
  }
}
