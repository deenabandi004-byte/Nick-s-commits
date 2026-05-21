/**
 * FindHumansModal - Find the Humans surface.
 *
 *   - Skips JD parser via no_parse=true (uses job card's structured fields).
 *   - source='find_humans' opts the request into the Pro/Elite gate and
 *     the per-user hourly cap.
 *   - Backend already auto-creates Gmail drafts and saves recruiters; the
 *     modal renders the result with per-candidate evidence receipts.
 *
 * Composes ContactCardBase primitives (ContactAvatar / ContactIdentity /
 * CardAccentBorder / StatusLine).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, Loader2, MailCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SteppedLoadingBar } from "@/components/ui/LoadingBar";
import {
  CardAccentBorder,
  ContactAvatar,
  ContactIdentity,
  StatusLine,
} from "@/components/tracker/shared/ContactCardBase";
import {
  apiService,
  type FindHumansReceipt,
  type FindRecruiterResponse,
  type Recruiter,
} from "@/services/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FindHumansJob {
  id?: string;
  title?: string;
  company?: string;
  location?: string;
  description?: string;
  url?: string;
}

interface FindHumansModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: FindHumansJob | null;
}

type ModalState = "idle" | "loading" | "success" | "error";

const LOADING_STEPS = [
  { id: "read", label: "Reading job posting…" },
  { id: "search", label: "Searching for hiring teams…" },
  { id: "match", label: "Cross-referencing your background…" },
  { id: "draft", label: "Drafting emails…" },
] as const;

// Aesthetic constant from the agentic queue design (non-negotiable per design doc).
const ACCENT_BLUE = "#3B82F6";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function recruiterFullName(r: Recruiter): string {
  return `${r.FirstName ?? ""} ${r.LastName ?? ""}`.trim() || r.Email || "Unknown";
}

function recruiterSubtitle(r: Recruiter): string {
  const parts: string[] = [];
  if (r.Title) parts.push(r.Title);
  if (r.Company) parts.push(r.Company);
  return parts.join(" · ");
}

function recruiterLocation(r: Recruiter): string {
  const parts: string[] = [];
  if (r.City) parts.push(r.City);
  if (r.State) parts.push(r.State);
  return parts.join(", ");
}

// Phase 1 receipts have NO href field - they are pure provenance text.
function ReceiptRow({ receipt }: { receipt: FindHumansReceipt }) {
  const dotClass =
    receipt.strength === "high"
      ? "bg-[#3B82F6]"
      : receipt.strength === "medium"
        ? "border border-[#3B82F6] bg-transparent"
        : "bg-transparent";

  return (
    <li className="flex items-start gap-2 text-xs text-gray-600">
      <span
        aria-hidden
        className={`mt-1 inline-block h-1.5 w-1.5 rounded-full flex-shrink-0 ${dotClass}`}
      />
      <span>{receipt.label}</span>
    </li>
  );
}

function CandidateReceiptCard({ recruiter }: { recruiter: Recruiter }) {
  const name = recruiterFullName(recruiter);
  const subtitle = recruiterSubtitle(recruiter);
  const location = recruiterLocation(recruiter);
  const receipts = recruiter.findHumansReceipts ?? [];

  return (
    <CardAccentBorder accentColor={ACCENT_BLUE} as="div" className="items-start">
      <ContactAvatar name={name} size="md" />
      <div className="min-w-0 flex-1">
        <ContactIdentity
          name={name}
          subtitle={subtitle}
          status={location ? <StatusLine text={location} tone="muted" /> : undefined}
        />

        {receipts.length > 0 && (
          <ul className="mt-2 space-y-1">
            {receipts.slice(0, 4).map((r, i) => (
              <ReceiptRow key={`${r.type}-${i}`} receipt={r} />
            ))}
          </ul>
        )}

        {recruiter.LinkedIn && (
          <a
            href={recruiter.LinkedIn}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 inline-flex items-center gap-1 text-xs text-[#2563EB] hover:underline"
          >
            View LinkedIn <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </CardAccentBorder>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

export function FindHumansModal({ open, onOpenChange, job }: FindHumansModalProps) {
  const [state, setState] = useState<ModalState>("idle");
  const [response, setResponse] = useState<FindRecruiterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStepId, setLoadingStepId] = useState<string>(LOADING_STEPS[0].id);

  // Token to ignore stale responses if the modal is closed/reopened mid-flight.
  const requestTokenRef = useRef(0);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearStepTimer = useCallback(() => {
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  }, []);

  const startStepAnimation = useCallback(() => {
    clearStepTimer();
    setLoadingStepId(LOADING_STEPS[0].id);
    let i = 0;
    stepTimerRef.current = setInterval(() => {
      i = Math.min(i + 1, LOADING_STEPS.length - 1);
      setLoadingStepId(LOADING_STEPS[i].id);
      if (i === LOADING_STEPS.length - 1) clearStepTimer();
    }, 2500);
  }, [clearStepTimer]);

  const runSearch = useCallback(async () => {
    if (!job?.company) {
      setError("This job is missing a company name. Try a different listing.");
      setState("error");
      return;
    }

    const token = ++requestTokenRef.current;
    setState("loading");
    setError(null);
    setResponse(null);
    startStepAnimation();

    try {
      const result = await apiService.findRecruiters({
        company: job.company,
        jobTitle: job.title || undefined,
        jobDescription: job.description || undefined,
        location: job.location || undefined,
        jobUrl: job.url || undefined,
        generateEmails: true,
        createDrafts: true,
        no_parse: true,
        source: "find_humans",
        maxResults: 3,
      });

      // Stale response - caller already moved on.
      if (token !== requestTokenRef.current) return;

      clearStepTimer();

      if (result.error) {
        setError(result.error);
        setState("error");
        return;
      }

      if (!result.recruiters || result.recruiters.length === 0) {
        setError(
          "We couldn't verify a hiring team for this specific role. The job posting may not expose enough data.",
        );
        setState("error");
        return;
      }

      setResponse(result);
      setState("success");
    } catch (e) {
      if (token !== requestTokenRef.current) return;
      clearStepTimer();
      const message =
        e instanceof Error ? e.message : "Something went wrong. No credits were charged.";
      setError(message);
      setState("error");
    }
  }, [clearStepTimer, job, startStepAnimation]);

  // Kick off the search the first time the modal opens for a given job.
  useEffect(() => {
    if (!open) {
      // Cancel any pending step animation when modal closes.
      clearStepTimer();
      return;
    }
    if (state === "idle") {
      void runSearch();
    }
    // Intentionally only depend on `open` so we don't re-run on every state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reset state when the modal fully closes so the next open starts fresh.
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setState("idle");
        setResponse(null);
        setError(null);
        setLoadingStepId(LOADING_STEPS[0].id);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ----- render -----

  const draftCount = response?.draftsCreated?.length ?? 0;
  const recruiters = response?.recruiters ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold text-gray-900">
                Find the Humans
              </DialogTitle>
              {job?.title && job?.company && (
                <p className="mt-0.5 text-xs text-gray-500 truncate">
                  {job.title} · {job.company}
                </p>
              )}
              {state === "success" && response && (
                <p className="mt-1 text-xs text-gray-500">
                  Charged: {response.creditsCharged} credits for {recruiters.length}{" "}
                  {recruiters.length === 1 ? "human" : "humans"}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </DialogHeader>

        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          {state === "loading" && (
            <div className="py-6">
              <SteppedLoadingBar
                steps={LOADING_STEPS as unknown as { id: string; label: string }[]}
                currentStepId={loadingStepId}
              />
              <p className="mt-4 text-xs text-gray-500 text-center">
                Hang tight - usually under 15 seconds.
              </p>
            </div>
          )}

          {state === "success" && recruiters.length > 0 && (
            <div className="space-y-2">
              {recruiters.map((r, i) => (
                <CandidateReceiptCard
                  key={`${r.Email || r.LinkedIn || "r"}-${i}`}
                  recruiter={r}
                />
              ))}
            </div>
          )}

          {state === "error" && (
            <div className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p>{error || "Something went wrong."}</p>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between gap-2">
          {state === "success" && draftCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
              <MailCheck className="h-3.5 w-3.5 text-[#3B82F6]" />
              {draftCount} draft{draftCount === 1 ? "" : "s"} ready in Gmail
            </span>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            {state === "error" && (
              <Button size="sm" variant="outline" onClick={() => void runSearch()}>
                Retry
              </Button>
            )}
            {state === "loading" ? (
              <Button size="sm" disabled>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Searching…
              </Button>
            ) : (
              <Button size="sm" onClick={() => onOpenChange(false)}>
                {state === "success" ? "Done" : "Close"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default FindHumansModal;
