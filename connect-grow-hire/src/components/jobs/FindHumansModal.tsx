/**
 * FindHumansModal — Find the Humans surface (job board).
 *
 *   - Skips JD parser via no_parse=true (uses job card's structured fields).
 *   - source='find_humans' opts the request into the Pro/Elite gate and
 *     the per-user hourly cap.
 *   - PREVIEW FIRST: the search finds the people (name, title, email) without
 *     generating emails or Gmail drafts, so it returns fast. The user then
 *     chooses to Draft or Send from the result — mirroring Find People.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle, Inbox, Linkedin, Loader2, Mail, Send, Table2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SteppedLoadingBar } from "@/components/ui/LoadingBar";
import { SendConfirmDialog } from "@/components/SendConfirmDialog";
import { toast } from "@/hooks/use-toast";
import {
  apiService,
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

// Per-person draft state, keyed by lowercased email. Populated on demand when
// the user clicks Draft / Send — not during the (fast) preview search.
interface DraftInfo {
  draftId?: string;
  gmailUrl?: string;
  subject?: string;
  sent?: boolean;
}

const LOADING_STEPS = [
  { id: "read", label: "Reading job posting…" },
  { id: "search", label: "Searching for the right people…" },
  { id: "match", label: "Cross-referencing your background…" },
] as const;

const AVATAR_COLORS = ["#5965D8", "#8B5CF6", "#0D9488", "#D97706", "#DB2777", "#2563EB"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function recruiterFullName(r: Recruiter): string {
  return `${r.FirstName ?? ""} ${r.LastName ?? ""}`.trim() || cleanEmail(r) || "Unknown";
}

// The backend sets Email to "Not available" / Title to "unknown" when those
// couldn't be resolved. Treat both as absent so the card never shows junk.
function cleanEmail(r: Recruiter): string {
  const e = (r.Email || r.WorkEmail || "").trim();
  return e.toLowerCase() === "not available" ? "" : e;
}
function cleanTitle(r: Recruiter): string {
  const t = (r.Title || "").trim();
  return t.toLowerCase() === "unknown" ? "" : t;
}
function recruiterSubtitle(r: Recruiter): string {
  return [cleanTitle(r), r.Company].filter(Boolean).join(" · ");
}
function initialsOf(name: string): string {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

// ---------------------------------------------------------------------------
// Candidate card — clean identity row with a LinkedIn button and, once the
// user drafts, an inline View-draft / Sent affordance.
// ---------------------------------------------------------------------------

function CandidateCard({ recruiter, draft, index }: { recruiter: Recruiter; draft?: DraftInfo; index: number }) {
  const name = recruiterFullName(recruiter);
  const subtitle = recruiterSubtitle(recruiter);
  const email = cleanEmail(recruiter);
  const linkedin = recruiter.LinkedIn
    ? (recruiter.LinkedIn.startsWith("http") ? recruiter.LinkedIn : `https://${recruiter.LinkedIn}`)
    : "";
  const bg = AVATAR_COLORS[index % AVATAR_COLORS.length];

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#ECEEF3] bg-white p-3.5">
      <div
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white"
        style={{ background: bg }}
      >
        {initialsOf(name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-bold text-[#0F172A]">{name}</div>
        <div className="truncate text-[12.5px] text-[#64748B]">
          {subtitle}
          {subtitle && (email || true) && <span className="text-[#CBD5E1]"> · </span>}
          {email
            ? <span className="text-[#94A3B8]">{email}</span>
            : <span className="italic text-[#B45309]">No email found</span>}
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {linkedin && (
          <a
            href={linkedin}
            target="_blank"
            rel="noreferrer noopener"
            title="View LinkedIn profile"
            aria-label="View LinkedIn profile"
            className="inline-flex h-9 w-9 items-center justify-center rounded-[9px] border border-[#E2E8F0] bg-white text-[#0A66C2] hover:bg-[#F1F5F9]"
          >
            <Linkedin className="h-4 w-4" />
          </a>
        )}
        {draft?.sent ? (
          <span className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-[#BBF7D0] bg-white px-3 text-[12.5px] font-semibold text-[#15803D]">
            <CheckCircle className="h-4 w-4" /> Sent
          </span>
        ) : draft?.draftId ? (
          <a
            href={draft.gmailUrl || "https://mail.google.com/mail/u/0/#drafts"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-[#C7CCF0] bg-white px-3.5 text-[12.5px] font-semibold text-[#4A60A8] hover:bg-[#F2F3FC]"
          >
            <Mail className="h-4 w-4" /> View draft
          </a>
        ) : null}
      </div>
    </div>
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
      ? kind === "employee" ? "person" : "human"
      : kind === "employee" ? "people" : "humans";
  const navigate = useNavigate();
  const { user } = useFirebaseAuth();
  const isPeople = kind === "employee";
  const networkTab = isPeople ? "people" : "managers";
  const outboxSegment = isPeople ? "people" : "hiringManagers";

  const [state, setState] = useState<ModalState>("idle");
  const [response, setResponse] = useState<FindRecruiterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStepId, setLoadingStepId] = useState<string>(LOADING_STEPS[0].id);

  // On-demand draft/send state (keyed by lowercased email).
  const [draftInfo, setDraftInfo] = useState<Record<string, DraftInfo>>({});
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);

  // Token to ignore stale responses if the modal is closed/reopened mid-flight.
  const requestTokenRef = useRef(0);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
    }, 2200);
  }, [clearStepTimer]);

  const recruiters = response?.recruiters ?? [];
  const withEmail = useMemo(() => recruiters.filter((r) => cleanEmail(r)), [recruiters]);
  const draftedCount = withEmail.filter((r) => draftInfo[cleanEmail(r).toLowerCase()]?.draftId).length;
  const sentCount = withEmail.filter((r) => draftInfo[cleanEmail(r).toLowerCase()]?.sent).length;
  const allSent = withEmail.length > 0 && sentCount === withEmail.length;
  const allDrafted = withEmail.length > 0 && draftedCount === withEmail.length;

  const focusEmail = (): string | undefined =>
    (withEmail.find((r) => draftInfo[cleanEmail(r).toLowerCase()]?.draftId) || withEmail[0])
      ? cleanEmail(withEmail.find((r) => draftInfo[cleanEmail(r).toLowerCase()]?.draftId) || withEmail[0]) || undefined
      : undefined;

  // Persist found people so they appear (and blue-highlight) in My Network.
  // Preview search has no draft info yet — they save as Not Contacted.
  const persistResults = useCallback(
    async (result: FindRecruiterResponse) => {
      const uid = user?.uid;
      const found = result.recruiters ?? [];
      if (!uid || found.length === 0) return;
      const today = new Date().toLocaleDateString("en-US");
      try {
        if (isPeople) {
          const mapped: Omit<FirebaseContact, "id">[] = found.map((r) => ({
            firstName: r.FirstName || "",
            lastName: r.LastName || "",
            linkedinUrl: r.LinkedIn || "",
            email: cleanEmail(r),
            company: r.Company || job?.company || "",
            jobTitle: cleanTitle(r),
            college: "",
            location: [r.City, r.State].filter(Boolean).join(", "),
            firstContactDate: today,
            lastContactDate: today,
            status: "Not Contacted",
          }));
          await firebaseApi.bulkCreateContacts(uid, mapped);
        } else {
          const mapped: Omit<FirebaseRecruiter, "id">[] = found.map((r) => {
            const rec: Omit<FirebaseRecruiter, "id"> = {
              firstName: r.FirstName || "",
              lastName: r.LastName || "",
              linkedinUrl: r.LinkedIn || "",
              email: cleanEmail(r),
              company: r.Company || job?.company || "",
              jobTitle: cleanTitle(r),
              location: [r.City, r.State].filter(Boolean).join(", "),
              dateAdded: new Date().toISOString(),
              status: "Not Contacted",
            };
            if (r.Phone) rec.phone = r.Phone;
            if (r.WorkEmail) rec.workEmail = r.WorkEmail;
            if (r.PersonalEmail) rec.personalEmail = r.PersonalEmail;
            if (job?.title) rec.associatedJobTitle = job.title;
            if (job?.url) rec.associatedJobUrl = job.url;
            return rec;
          });
          const existing = await firebaseApi.getRecruiters(uid);
          const existingEmails = new Set(existing.map((r) => (r.email || "").trim().toLowerCase()).filter(Boolean));
          const existingLinkedIns = new Set(existing.map((r) => (r.linkedinUrl || "").trim()).filter(Boolean));
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
    setDraftInfo({});
    startStepAnimation();

    // Preview: find the people only. No email generation, no Gmail drafts — the
    // user drafts/sends afterward. Faster, and matches the Find People flow.
    // All three endpoints read generateEmails/createDrafts (default true), so
    // setting them false is what makes the search find-only.
    const previewFlags = { generateEmails: false, createDrafts: false };

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
          ...previewFlags,
        });
      } else if (kind === "hiring-manager") {
        const hm = await apiService.findHiringManagers({
          company: job.company,
          jobTitle: job.title || undefined,
          jobDescription: job.description || undefined,
          location: job.location || undefined,
          jobUrl: job.url || undefined,
          maxResults: count ?? 3,
          ...previewFlags,
        });
        result = { ...hm, recruiters: hm.hiringManagers } as unknown as FindRecruiterResponse;
      } else {
        result = await apiService.findRecruiters({
          company: job.company,
          jobTitle: job.title || undefined,
          jobDescription: job.description || undefined,
          location: job.location || undefined,
          jobUrl: job.url || undefined,
          no_parse: true,
          source: "find_humans",
          maxResults: 3,
          ...previewFlags,
        });
      }

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

      if (persistedTokenRef.current !== token) {
        persistedTokenRef.current = token;
        void persistResults(result);
      }
    } catch (e) {
      if (token !== requestTokenRef.current) return;
      clearStepTimer();
      const message = e instanceof Error ? e.message : "Something went wrong. No credits were charged.";
      setError(message);
      setState("error");
    }
  }, [clearStepTimer, job, startStepAnimation, kind, count, persistResults]);

  // Draft a personalized email to every found person with an email.
  const ensureDrafts = useCallback(
    async (): Promise<Record<string, DraftInfo> | null> => {
      const need = withEmail.filter((r) => !draftInfo[cleanEmail(r).toLowerCase()]?.draftId);
      if (need.length === 0) return draftInfo;
      const contacts = need.map((r) => ({
        ...r,
        Name: recruiterFullName(r),
        Email: cleanEmail(r),
        Title: cleanTitle(r),
      }));
      const res = await apiService.generateAndDraftEmails({ contacts });
      if ("error" in res) {
        toast({
          title: "Couldn't create drafts",
          description: res.message || res.error || "Reconnect your Gmail account and try again.",
          variant: "destructive",
        });
        return null;
      }
      const next: Record<string, DraftInfo> = { ...draftInfo };
      for (const d of res.drafts || []) {
        const k = (d.to || "").trim().toLowerCase();
        if (k) next[k] = { ...next[k], draftId: d.draftId, gmailUrl: d.gmailUrl, subject: d.subject };
      }
      setDraftInfo(next);
      return next;
    },
    [withEmail, draftInfo],
  );

  const handleDraftAll = async () => {
    if (drafting || sending) return;
    setDrafting(true);
    try {
      const next = await ensureDrafts();
      if (next) {
        const n = Object.values(next).filter((d) => d.draftId).length;
        toast({ title: "Drafts ready", description: `${n} draft${n === 1 ? "" : "s"} created in your Gmail.` });
      }
    } finally {
      setDrafting(false);
    }
  };

  const handleSendAll = async () => {
    if (drafting || sending) return;
    setSending(true);
    try {
      const info = await ensureDrafts();
      if (!info) return;
      const next = { ...info };
      let sent = 0;
      for (const r of withEmail) {
        const k = cleanEmail(r).toLowerCase();
        const di = next[k];
        if (di?.draftId && !di.sent) {
          const sres = await apiService.sendDraft(di.draftId);
          if (sres.success) {
            next[k] = { ...di, sent: true };
            sent += 1;
          }
        }
      }
      setDraftInfo(next);
      toast({ title: sent > 0 ? "Emails sent" : "Nothing sent", description: `${sent} email${sent === 1 ? "" : "s"} sent from your Gmail.` });
    } finally {
      setSending(false);
    }
  };

  // Kick off the search the first time the modal opens for a given job.
  useEffect(() => {
    if (!open) {
      clearStepTimer();
      return;
    }
    if (state === "idle") void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reset state when the modal fully closes so the next open starts fresh.
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setState("idle");
        setResponse(null);
        setError(null);
        setDraftInfo({});
        setLoadingStepId(LOADING_STEPS[0].id);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleInbox = () => {
    navigate("/outbox", { state: { focusEmail: focusEmail(), segment: outboxSegment } });
    onOpenChange(false);
  };
  const handleViewSpreadsheet = () => {
    navigate(`/my-network/${networkTab}`);
    onOpenChange(false);
  };

  const busy = drafting || sending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <SendConfirmDialog
          open={confirmSend}
          count={withEmail.length}
          loading={sending}
          onCancel={() => setConfirmSend(false)}
          onConfirm={() => {
            setConfirmSend(false);
            void handleSendAll();
          }}
        />
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold text-gray-900">{heading}</DialogTitle>
              {job?.title && job?.company && (
                <p className="mt-0.5 text-xs text-gray-500 truncate">
                  {job.title} · {job.company}
                </p>
              )}
              {state === "success" && response && (
                <p className="mt-1 text-xs text-gray-500">
                  Charged: {response.creditsCharged} credits for {recruiters.length} {personNoun(recruiters.length)}
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
              <p className="mt-4 text-xs text-gray-500 text-center">Hang tight — usually under 10 seconds.</p>
            </div>
          )}

          {state === "success" && recruiters.length > 0 && (
            <>
              <div className="space-y-2.5">
                {recruiters.map((r, i) => (
                  <CandidateCard
                    key={`${cleanEmail(r) || r.LinkedIn || "r"}-${i}`}
                    recruiter={r}
                    draft={draftInfo[cleanEmail(r).toLowerCase()]}
                    index={i}
                  />
                ))}
              </div>

              {/* Draft / Send — outreach happens here, on demand. */}
              {withEmail.length > 0 && (
                <div className="mt-4 flex items-center justify-center gap-2.5">
                  <button
                    type="button"
                    disabled={busy || allDrafted}
                    onClick={handleDraftAll}
                    className="inline-flex items-center gap-2 rounded-[10px] px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-60"
                    style={{ background: "linear-gradient(180deg, #5965D8 0%, #4B55C4 100%)", boxShadow: "0 1px 2px rgba(74,96,168,0.18), 0 8px 20px rgba(74,96,168,0.24)" }}
                  >
                    {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    {allDrafted ? "Drafts ready" : `Draft ${withEmail.length} email${withEmail.length === 1 ? "" : "s"}`}
                  </button>
                  <button
                    type="button"
                    disabled={busy || allSent}
                    onClick={() => setConfirmSend(true)}
                    className="inline-flex items-center gap-2 rounded-[10px] border border-[#E2E8F0] bg-white px-5 py-2.5 text-[14px] font-semibold text-[#0F172A] disabled:opacity-60"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {allSent ? "Emails sent" : "Send emails"}
                  </button>
                </div>
              )}

              {/* Destinations */}
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={handleInbox}>
                  <Inbox className="h-3.5 w-3.5 mr-1.5" />
                  Open inbox
                </Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={handleViewSpreadsheet}>
                  <Table2 className="h-3.5 w-3.5 mr-1.5" />
                  View in spreadsheet
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
          {state === "success" && (sentCount > 0 || draftedCount > 0) ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
              {sentCount > 0 ? (
                <><CheckCircle className="h-3.5 w-3.5 text-[#15803D]" /> {sentCount} sent</>
              ) : (
                <><Mail className="h-3.5 w-3.5 text-[#4A60A8]" /> {draftedCount} draft{draftedCount === 1 ? "" : "s"} ready in Gmail</>
              )}
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
                Finding…
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
