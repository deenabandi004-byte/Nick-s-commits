/**
 * AlumniDiscoveryPanel — confirm + results phases of the auto-discover
 * referral flow. Mounted INSIDE ReferralDraftModal when the modal is
 * opened in `discovery` mode (the JobRow has no saved contact at the
 * job's company).
 *
 * Stateless on API. Phase ('confirm' | 'results') and result data are
 * owned by the parent modal; this component only renders + raises
 * callbacks. That keeps the Draft phase (still owned by the modal) and
 * the back-button transitions in a single state machine.
 *
 * Three failure surfaces this panel handles inline:
 *   - studentSchool missing → onboarding deep link
 *   - empty results          → "no alumni found" + negative-cache note
 *   - 410 discovery_expired  → "Rerun discovery" CTA on the row
 */
import { useState } from "react";
import {
  Loader2,
  Search,
  ChevronLeft,
  GraduationCap,
  Linkedin,
  Mail,
  MailX,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FeedJob } from "@/services/api";

type DiscoveryRung =
  | "school+company+title"
  | "school+company"
  | "no-alumni-fallback"
  | "empty";

export interface AlumniRow {
  pdl_id: string;
  first_name: string;
  last_name: string;
  title: string;
  company: string;
  school: string;
  linkedin_url: string;
  email: string;
  email_available: boolean;
  relationship: "moderate" | "weak";
  match_strength: "strong" | "moderate" | "weak";
  match_reasons: string[];
  matched_on: string[];
}

export interface DiscoveryResult {
  contacts: AlumniRow[];
  credits_used: number;
  cache_hit: boolean | "negative";
  rung: DiscoveryRung;
  tier_max: number;
  partial: boolean;
}

export interface AlumniDiscoveryPanelProps {
  phase: "confirm" | "results";
  job: FeedJob;
  studentSchool: string | null;
  tierMax: number;
  result: DiscoveryResult | null;
  isLoading: boolean;
  loadingMessage?: string;
  error: string | null;
  selectingPdlId: string | null; // disables row while drafting
  onConfirmSearch: (opts: {
    allowDropTitle?: boolean;
    allowNoSchoolFallback?: boolean;
  }) => void;
  onSelectContact: (pdlId: string) => void;
  onBack: () => void;
  onGoOnboarding: () => void;
}

const STRENGTH_BADGE: Record<AlumniRow["match_strength"], string> = {
  strong: "bg-emerald-100 text-emerald-800 border-emerald-200",
  moderate: "bg-sky-100 text-sky-800 border-sky-200",
  weak: "bg-slate-100 text-slate-700 border-slate-200",
};
const STRENGTH_LABEL: Record<AlumniRow["match_strength"], string> = {
  strong: "Strong match",
  moderate: "Moderate match",
  weak: "Weak match",
};

const RUNG_BANNER: Record<DiscoveryRung, string | null> = {
  "school+company+title": null,
  "school+company": "Showing alumni at this company in any role.",
  "no-alumni-fallback":
    "Recent hires at this company — NOT alumni from your school.",
  empty: null,
};

export function AlumniDiscoveryPanel(props: AlumniDiscoveryPanelProps) {
  const {
    phase,
    job,
    studentSchool,
    tierMax,
    result,
    isLoading,
    loadingMessage,
    error,
    selectingPdlId,
    onConfirmSearch,
    onSelectContact,
    onBack,
    onGoOnboarding,
  } = props;

  // -------- No-school inline prompt --------------------------------------
  if (!studentSchool) {
    return (
      <div className="py-8 space-y-3">
        <div className="flex items-start gap-2">
          <GraduationCap className="w-5 h-5 mt-0.5 text-slate-500" />
          <div className="text-sm text-slate-700">
            <div className="font-medium">
              Add your school to find alumni at {job.company}
            </div>
            <div className="text-slate-500 text-xs mt-1">
              The "Find alumni" feature uses your school to match you with
              people from your network at this company.
            </div>
          </div>
        </div>
        <Button onClick={onGoOnboarding} aria-label="Go to onboarding to add school">
          Add school
        </Button>
      </div>
    );
  }

  // -------- Confirm phase ------------------------------------------------
  if (phase === "confirm") {
    return <ConfirmPhase
      job={job}
      studentSchool={studentSchool}
      tierMax={tierMax}
      isLoading={isLoading}
      loadingMessage={loadingMessage}
      error={error}
      onSearch={onConfirmSearch}
    />;
  }

  // -------- Results phase ------------------------------------------------
  return <ResultsPhase
    job={job}
    studentSchool={studentSchool}
    tierMax={tierMax}
    result={result}
    isLoading={isLoading}
    loadingMessage={loadingMessage}
    error={error}
    selectingPdlId={selectingPdlId}
    onSelectContact={onSelectContact}
    onBack={onBack}
    onTryWithoutTitle={() =>
      onConfirmSearch({ allowDropTitle: true })
    }
    onTryNoSchoolFallback={() =>
      onConfirmSearch({ allowDropTitle: true, allowNoSchoolFallback: true })
    }
  />;
}

// ---------------------------------------------------------------------------
// Confirm phase
// ---------------------------------------------------------------------------

function ConfirmPhase({
  job,
  studentSchool,
  tierMax,
  isLoading,
  loadingMessage,
  error,
  onSearch,
}: {
  job: FeedJob;
  studentSchool: string;
  tierMax: number;
  isLoading: boolean;
  loadingMessage?: string;
  error: string | null;
  onSearch: (opts: { allowDropTitle?: boolean }) => void;
}) {
  // Editable chips for school + title — user can drop the title filter
  // before searching to broaden the rung 1 query.
  const [title, setTitle] = useState(job.title || "");
  const [includeTitle, setIncludeTitle] = useState(true);

  const onClickSearch = () => {
    onSearch({ allowDropTitle: !includeTitle });
  };

  return (
    <div className="py-4 space-y-4">
      <div className="text-sm text-slate-700 leading-relaxed">
        Search PDL for alumni from{" "}
        <span className="font-medium">{studentSchool}</span> at{" "}
        <span className="font-medium">{job.company}</span>
        {includeTitle && title ? (
          <>
            {" "}matching{" "}
            <span className="font-medium">{title}</span>
          </>
        ) : null}?
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Chip label={studentSchool} />
        <Chip label={job.company} />
        <ChipToggle
          label={title || "any title"}
          on={includeTitle}
          onToggle={() => setIncludeTitle((v) => !v)}
        />
        {includeTitle && (
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Edit title"
            className="border border-slate-300 rounded px-2 py-1 text-xs w-44 focus:border-slate-500 focus:outline-none"
            aria-label="Job title filter"
          />
        )}
      </div>

      <div className="text-xs text-slate-500">
        Uses up to <span className="font-medium">{tierMax}</span> credits
        <span className="text-slate-400"> · 0 if cached</span>
      </div>

      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <div>{error}</div>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Button onClick={onClickSearch} disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {loadingMessage || "Searching…"}
            </>
          ) : (
            <>
              <Search className="w-4 h-4 mr-2" /> Search
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results phase
// ---------------------------------------------------------------------------

function ResultsPhase({
  job,
  studentSchool,
  tierMax,
  result,
  isLoading,
  loadingMessage,
  error,
  selectingPdlId,
  onSelectContact,
  onBack,
  onTryWithoutTitle,
  onTryNoSchoolFallback,
}: {
  job: FeedJob;
  studentSchool: string;
  tierMax: number;
  result: DiscoveryResult | null;
  isLoading: boolean;
  loadingMessage?: string;
  error: string | null;
  selectingPdlId: string | null;
  onSelectContact: (pdlId: string) => void;
  onBack: () => void;
  onTryWithoutTitle: () => void;
  onTryNoSchoolFallback: () => void;
}) {
  if (isLoading) {
    return (
      <div className="py-12 flex flex-col items-center gap-2 text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <div className="text-sm">
          {loadingMessage ||
            `Searching ${studentSchool} alumni at ${job.company}…`}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 space-y-3">
        <div className="text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>{error}</div>
        </div>
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="w-4 h-4 mr-2" /> Back
        </Button>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="py-8 text-center text-sm text-slate-500">
        No results yet.
      </div>
    );
  }

  const rows = result.contacts;
  const rungBanner = RUNG_BANNER[result.rung];

  // ---- Empty state ---------------------------------------------------
  if (rows.length === 0) {
    return (
      <div className="py-6 space-y-4">
        <div className="text-sm text-slate-700">
          No {studentSchool} alumni found at{" "}
          <span className="font-medium">{job.company}</span>
          {job.title ? <> for {job.title}</> : null}.
        </div>
        <div className="text-xs text-slate-500">
          We'll remember this for 7 days so we don't burn credits checking
          again.
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Offer the explicit broadening rungs the student didn't try yet.
              We only know which rung last ran via `result.rung`; show the
              next-broader rung's button so the path is never silent. */}
          {result.rung === "school+company+title" && (
            <Button variant="outline" size="sm" onClick={onTryWithoutTitle}>
              Try without title filter
            </Button>
          )}
          {result.rung === "school+company" && (
            <Button variant="outline" size="sm" onClick={onTryNoSchoolFallback}>
              Try without school filter — recent hires, not alumni
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Back
          </Button>
        </div>
      </div>
    );
  }

  // ---- Results list --------------------------------------------------
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Back
        </Button>
        <div className="text-xs text-slate-500">
          {result.cache_hit === true ? (
            <span className="text-emerald-700">Cached — 0 credits used</span>
          ) : result.cache_hit === "negative" ? null : (
            <span>
              Used {result.credits_used} credit
              {result.credits_used === 1 ? "" : "s"}
            </span>
          )}
          {result.partial && (
            <span className="ml-2 text-amber-700">
              (partial — credits ran out)
            </span>
          )}
        </div>
      </div>

      {rungBanner && (
        <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-2">
          {rungBanner}
        </div>
      )}

      <ul className="divide-y divide-slate-100" role="list">
        {rows.map((row) => (
          <li key={row.pdl_id} className="py-3 flex items-start gap-3" role="listitem">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-slate-900">
                  {row.first_name} {row.last_name}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${STRENGTH_BADGE[row.match_strength]}`}
                  aria-label={`${STRENGTH_LABEL[row.match_strength]}: ${row.match_reasons.join(", ")}`}
                >
                  {STRENGTH_LABEL[row.match_strength]}
                </span>
              </div>
              <div className="text-xs text-slate-600 mt-0.5">
                {row.title}
                {row.company ? ` · ${row.company}` : ""}
                {row.school ? ` · ${row.school}` : ""}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {row.match_reasons.slice(0, 3).map((r, i) => (
                  <span
                    key={i}
                    className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded"
                  >
                    {r}
                  </span>
                ))}
                {row.linkedin_url && (
                  <a
                    href={row.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-sky-600 hover:underline inline-flex items-center gap-0.5"
                    aria-label="Open LinkedIn profile"
                  >
                    <Linkedin className="w-3 h-3" /> LinkedIn
                  </a>
                )}
                {row.email_available ? (
                  <span
                    className="text-[10px] text-emerald-700 inline-flex items-center gap-0.5"
                    aria-label="Email available"
                  >
                    <Mail className="w-3 h-3" /> Email available
                  </span>
                ) : (
                  <span
                    className="text-[10px] text-slate-400 inline-flex items-center gap-0.5"
                    aria-label="No email on file"
                    title="No email on file — paste into LinkedIn DM"
                  >
                    <MailX className="w-3 h-3" /> No email
                  </span>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onSelectContact(row.pdl_id)}
              disabled={selectingPdlId !== null}
              aria-label={`Draft email to ${row.first_name} ${row.last_name}`}
            >
              {selectingPdlId === row.pdl_id ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Drafting…
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 mr-1" /> Draft email
                </>
              )}
            </Button>
          </li>
        ))}
      </ul>
      <div className="text-[11px] text-slate-400 text-right">
        Showing {rows.length} of up to {tierMax} alumni
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small UI atoms
// ---------------------------------------------------------------------------

function Chip({ label }: { label: string }) {
  return (
    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs">
      {label}
    </span>
  );
}

function ChipToggle({
  label,
  on,
  onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={
        on
          ? "bg-slate-700 text-white px-2 py-0.5 rounded text-xs"
          : "bg-slate-100 text-slate-500 line-through px-2 py-0.5 rounded text-xs"
      }
    >
      {label}
    </button>
  );
}
