/**
 * FindHumansModal — Find the Humans surface.
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
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ExternalLink, Inbox, Loader2, Mail, MailCheck, Users, X } from "lucide-react";
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
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import {
  firebaseApi,
  type Contact as FirebaseContact,
  type Recruiter as FirebaseRecruiter,
} from "@/services/firebaseApi";

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
  // Which search to run. "recruiter" is the original Find the Humans flow.
  // "hiring-manager" hits /find-hiring-manager; "employee" hits /find-employee.
  kind?: "recruiter" | "employee" | "hiring-manager";
  // Number of people to find (employee + hiring-manager flows). Ignored by the
  // recruiter flow, which is fixed at 3.
  count?: number;
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

// Phase 1 receipts have NO href field — they are pure provenance text.
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
            href={recruiter.LinkedIn.startsWith('http') ? recruiter.LinkedIn : `https://${recruiter.LinkedIn}`}
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

export function FindHumansModal({ open, onOpenChange, job, kind = "recruiter", count }: FindHumansModalProps) {
  const heading =
    kind === "employee"
      ? "Find People"
      : kind === "hiring-manager"
        ? "Find Hiring Managers"
        : "Find the Humans";
  const personNoun = (n: number) =>
    n === 1
      ? kind === "employee"
        ? "person"
        : "human"
      : kind === "employee"
        ? "people"
        : "humans";
  const navigate = useNavigate();
  const { user } = useFirebaseAuth();
  // People (employee flow) land in My Network → People; hiring managers /
  // recruiters land in the Hiring Managers tab. Both tabs blue-highlight rows
  // saved within the last 60s, so saving below makes the just-found contacts
  // glow when "View in Spreadsheet" navigates there.
  const isPeople = kind === "employee";
  const networkTab = isPeople ? "people" : "managers";
  const outboxSegment = isPeople ? "people" : "hiringManagers";

  const [state, setState] = useState<ModalState>("idle");
  const [response, setResponse] = useState<FindRecruiterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStepId, setLoadingStepId] = useState<string>(LOADING_STEPS[0].id);

  // Token to ignore stale responses if the modal is closed/reopened mid-flight.
  const requestTokenRef = useRef(0);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guards a one-time save per successful search.
  const persistedTokenRef = useRef(0);

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

  // Map of lowercased recruiter email -> draft info (for draft/email lookups).
  const buildDraftMap = (result: FindRecruiterResponse) => {
    const m = new Map<string, { draft_id?: string; draft_url?: string; message_id?: string }>();
    for (const d of result.draftsCreated ?? []) {
      const key = (d.recruiter_email || "").trim().toLowerCase();
      if (key) m.set(key, { draft_id: d.draft_id, draft_url: d.draft_url, message_id: d.message_id });
    }
    return m;
  };

  const buildEmailMap = (result: FindRecruiterResponse) => {
    const m = new Map<string, { subject?: string; body?: string }>();
    for (const e of result.emails ?? []) {
      const key = (e.to_email || e.recruiter?.Email || "").trim().toLowerCase();
      if (key) m.set(key, { subject: e.subject, body: e.plain_body || e.body });
    }
    return m;
  };

  // The first found person's email is what the Inbox button focuses; prefer a
  // person who actually got a draft so the tracker opens a real conversation.
  const focusEmailFor = (result: FindRecruiterResponse | null): string | undefined => {
    if (!result) return undefined;
    const draftMap = buildDraftMap(result);
    const list = result.recruiters ?? [];
    const drafted = list.find((r) => r.Email && draftMap.has(r.Email.trim().toLowerCase()));
    return (drafted?.Email || list.find((r) => r.Email)?.Email || "").trim() || undefined;
  };

  // Persist found contacts so they show up (and blue-highlight) in My Network.
  // People → contacts subcollection (backend /contacts/bulk dedupes); hiring
  // managers / recruiters → recruiters subcollection (dedupe client-side here).
  const persistResults = useCallback(
    async (result: FindRecruiterResponse) => {
      const uid = user?.uid;
      const found = result.recruiters ?? [];
      if (!uid || found.length === 0) return;

      const draftMap = buildDraftMap(result);
      const emailMap = buildEmailMap(result);
      const today = new Date().toLocaleDateString("en-US");

      try {
        if (isPeople) {
          const mapped: Omit<FirebaseContact, "id">[] = found.map((r) => {
            const email = (r.Email || r.WorkEmail || "").trim();
            const key = email.toLowerCase();
            const draft = key ? draftMap.get(key) : undefined;
            const em = key ? emailMap.get(key) : undefined;
            const location = [r.City, r.State].filter(Boolean).join(", ");
            // Sent over fetch+JSON to /contacts/bulk, so undefined fields drop out.
            return {
              firstName: r.FirstName || "",
              lastName: r.LastName || "",
              linkedinUrl: r.LinkedIn || "",
              email,
              company: r.Company || job?.company || "",
              jobTitle: r.Title || "",
              college: "",
              location,
              firstContactDate: today,
              lastContactDate: today,
              status: "Not Contacted",
              emailSubject: em?.subject,
              emailBody: em?.body,
              gmailDraftId: draft?.draft_id,
              gmailDraftUrl: draft?.draft_url,
              gmailMessageId: draft?.message_id,
            };
          });
          await firebaseApi.bulkCreateContacts(uid, mapped);
        } else {
          const mapped: Omit<FirebaseRecruiter, "id">[] = found.map((r) => {
            const email = (r.Email || r.WorkEmail || "").trim();
            const key = email.toLowerCase();
            const draft = key ? draftMap.get(key) : undefined;
            // batch.set rejects undefined, so only attach optional fields when set.
            const rec: Omit<FirebaseRecruiter, "id"> = {
              firstName: r.FirstName || "",
              lastName: r.LastName || "",
              linkedinUrl: r.LinkedIn || "",
              email,
              company: r.Company || job?.company || "",
              jobTitle: r.Title || "",
              location: [r.City, r.State].filter(Boolean).join(", "),
              dateAdded: new Date().toISOString(),
              status: "Not Contacted",
            };
            if (r.Phone) rec.phone = r.Phone;
            if (r.WorkEmail) rec.workEmail = r.WorkEmail;
            if (r.PersonalEmail) rec.personalEmail = r.PersonalEmail;
            if (job?.title) rec.associatedJobTitle = job.title;
            if (job?.url) rec.associatedJobUrl = job.url;
            if (draft?.draft_id) rec.gmailDraftId = draft.draft_id;
            if (draft?.draft_url) rec.gmailDraftUrl = draft.draft_url;
            if (draft?.message_id) rec.gmailMessageId = draft.message_id;
            return rec;
          });

          const existing = await firebaseApi.getRecruiters(uid);
          const existingEmails = new Set(
            existing.map((r) => (r.email || "").trim().toLowerCase()).filter(Boolean),
          );
          const existingLinkedIns = new Set(
            existing.map((r) => (r.linkedinUrl || "").trim()).filter(Boolean),
          );
          const toSave = mapped.filter((r) => {
            const e = (r.email || "").trim().toLowerCase();
            const li = (r.linkedinUrl || "").trim();
            if (e && existingEmails.has(e)) return false;
            if (li && existingLinkedIns.has(li)) return false;
            return true;
          });
          if (toSave.length > 0) await firebaseApi.bulkCreateRecruiters(uid, toSave);
        }
      } catch (e) {
        // Non-fatal: the results are still shown; they just may not appear in
        // My Network. Surface in dev for debugging.
        if (import.meta.env.DEV) console.error("[FindHumansModal] persist failed:", e);
      }
    },
    [user?.uid, isPeople, job?.company, job?.title, job?.url],
  );

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
      let result: FindRecruiterResponse;
      if (kind === "employee") {
        result = await apiService.findEmployees({
          company: job.company,
          jobTitle: job.title || undefined,
          jobDescription: job.description || undefined,
          location: job.location || undefined,
          jobUrl: job.url || undefined,
          jobId: job.id || undefined,
          maxResults: count ?? 3,
          generateEmails: true,
          createDrafts: true,
        });
      } else if (kind === "hiring-manager") {
        const hm = await apiService.findHiringManagers({
          company: job.company,
          jobTitle: job.title || undefined,
          jobDescription: job.description || undefined,
          location: job.location || undefined,
          jobUrl: job.url || undefined,
          maxResults: count ?? 3,
          generateEmails: true,
          createDrafts: true,
        });
        // Normalize the hiring-manager response (people in `hiringManagers`)
        // into the shared shape the rest of this modal renders (`recruiters`).
        result = { ...hm, recruiters: hm.hiringManagers } as unknown as FindRecruiterResponse;
      } else {
        result = await apiService.findRecruiters({
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
      }

      // Stale response — caller already moved on.
      if (token !== requestTokenRef.current) return;

      clearStepTimer();

      if (result.error) {
        setError(result.error);
        setState("error");
        return;
      }

      if (!result.recruiters || result.recruiters.length === 0) {
        setError(
          kind === "employee"
            ? "We couldn't find teammates to reach for this role yet. The posting may not expose enough data."
            : "We couldn't verify a hiring team for this specific role. The job posting may not expose enough data.",
        );
        setState("error");
        return;
      }

      setResponse(result);
      setState("success");

      // Save the found people once so they appear (and blue-highlight) in My
      // Network. Fire-and-forget — never blocks the result UI.
      if (persistedTokenRef.current !== token) {
        persistedTokenRef.current = token;
        void persistResults(result);
      }
    } catch (e) {
      if (token !== requestTokenRef.current) return;
      clearStepTimer();
      const message =
        e instanceof Error ? e.message : "Something went wrong. No credits were charged.";
      setError(message);
      setState("error");
    }
  }, [clearStepTimer, job, startStepAnimation, kind, count, persistResults]);

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

  // Inbox → open the first found person's conversation in the tracker.
  const handleInbox = () => {
    navigate("/outbox", { state: { focusEmail: focusEmailFor(response), segment: outboxSegment } });
    onOpenChange(false);
  };
  // View in Spreadsheet → My Network, on the matching tab, where the freshly
  // saved rows blue-highlight via the 60s recency window.
  const handleViewSpreadsheet = () => {
    navigate(`/my-network/${networkTab}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold text-gray-900">
                {heading}
              </DialogTitle>
              {job?.title && job?.company && (
                <p className="mt-0.5 text-xs text-gray-500 truncate">
                  {job.title} · {job.company}
                </p>
              )}
              {state === "success" && response && (
                <p className="mt-1 text-xs text-gray-500">
                  Charged: {response.creditsCharged} credits for {recruiters.length}{" "}
                  {personNoun(recruiters.length)}
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
                Hang tight — usually under 15 seconds.
              </p>
            </div>
          )}

          {state === "success" && recruiters.length > 0 && (
            <>
              <div className="space-y-2">
                {recruiters.map((r, i) => (
                  <CandidateReceiptCard
                    key={`${r.Email || r.LinkedIn || "r"}-${i}`}
                    recruiter={r}
                  />
                ))}
              </div>

              {/* Post-search actions — mirror the Find People results bar. */}
              <div className="mt-4 flex items-center gap-2">
                {draftCount > 0 && (
                  <Button
                    asChild
                    size="sm"
                    className="flex-1 bg-[#3B82F6] hover:bg-[#2563EB] text-white"
                  >
                    <a
                      href="https://mail.google.com/mail/u/0/#drafts"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Mail className="h-3.5 w-3.5 mr-1.5" />
                      Gmail drafts
                    </a>
                  </Button>
                )}
                <Button size="sm" variant="outline" className="flex-1" onClick={handleInbox}>
                  <Inbox className="h-3.5 w-3.5 mr-1.5" />
                  Inbox
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={handleViewSpreadsheet}
                >
                  <Users className="h-3.5 w-3.5 mr-1.5" />
                  View in Spreadsheet
                </Button>
              </div>
            </>
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
