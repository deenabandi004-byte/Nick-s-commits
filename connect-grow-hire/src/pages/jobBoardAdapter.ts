// Adapter layer that translates our backend FeedJob shape into the
// prototype's ProtoJob shape. Components in components/jobs/ depend on
// ProtoJob only; the FeedJob type stays confined to this file and the
// page-level data layer.
//
// Pure helpers (postedShort, normalizeLocation, jobTypeLabel, etc.) live
// here too so JobBoardPage and JobBoardPage.redesign can share them.

import type {
  FeedJob,
  JobFeedResponse,
  JobStructured,
} from "@/services/api";

export type ProtoSection = "recent" | "recommended";

export interface ProtoJob {
  id: string;
  section: ProtoSection;

  // Identity
  title: string;
  company: string;
  logoUrl: string | null;
  logoMonogram: string;

  // Meta (already humanized)
  posted: string;
  postedISO: string | null;
  location: string;
  jobType: string;
  category: string;            // raw category for Field filter

  // Match
  match: number | null;
  matchSignals: string[];
  whyLine: string;
  ranked: boolean;

  // Salary
  salary: string | null;
  salaryAnnual: number | null;

  // Tags (first 3 match signals, prototype look)
  tags: string[];

  // Actions
  applyUrl: string;
  // Auto-apply (backend-tagged from FantasticJobs ats_* metadata).
  // atsPlatform is null when the job's source ATS is unknown/unsupported.
  atsPlatform: "greenhouse" | "lever" | "ashby" | null;
  autoApplyEligible: boolean;

  // Badges
  isNew: boolean;
  isStale: boolean;

  // Detail-only (collapse to source values)
  detailPosted: string;
  detailMatch: number | null;
  detailLocation: string;
  structured: JobStructured | undefined;
}

const STALE_DAYS = 10;

// ---------------------------------------------------------------------------
// Pure helpers (moved from JobBoardPage.tsx so multiple pages can share)
// ---------------------------------------------------------------------------

export function normalizeLocation(loc: unknown): string {
  if (!loc) return "";
  if (typeof loc === "string") return loc;
  if (typeof loc === "object") {
    const o = loc as Record<string, unknown>;
    const parts = [o.addressLocality, o.addressRegion, o.addressCountry]
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    if (parts.length) return parts.join(", ");
    return Object.values(o)
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .join(" ");
  }
  return String(loc);
}

export function initialOf(name?: string | null): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed[0].toUpperCase();
}

export function postedDaysFrom(iso?: string | null): number | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return null;
  return Math.max(0, Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24)));
}

export function postedShort(iso?: string | null): string {
  const d = postedDaysFrom(iso);
  if (d == null) return "";
  if (d === 0) {
    const hrs = Math.max(
      1,
      Math.floor((Date.now() - new Date(iso!).getTime()) / (1000 * 60 * 60))
    );
    return `${hrs}h ago`;
  }
  if (d === 1) return "1 day ago";
  return `${d} days ago`;
}

export function jobTypeLabel(type?: string | null): string {
  switch ((type || "").toUpperCase()) {
    case "INTERNSHIP": return "Internship";
    case "PARTTIME":   return "Part-Time";
    case "FULLTIME":   return "Full-Time";
    default:           return type || "Full-Time";
  }
}

export function whyOneLine(j: FeedJob): string {
  if (j.match_reason) return j.match_reason;
  const sig = j.match_signals?.[0];
  if (sig) return sig;
  return j.ranked === false ? "Recently posted" : "Matched to your profile";
}

// Salary precedence: salary_display (Fantastic.jobs + a fraction of Greenhouse
// / Lever), then structured.salary_range_text (Firecrawl-extracted), else null.
// Callers render the green chip when non-null and a muted "Not listed" chip
// when null. No enrichment trigger in this layer.
export function pickSalary(j: FeedJob): string | null {
  const direct = j.salary_display?.trim();
  if (direct) return direct;
  const fromStructured = j.structured?.salary_range_text?.trim();
  if (fromStructured) return fromStructured;
  return null;
}

// ---------------------------------------------------------------------------
// Translators
// ---------------------------------------------------------------------------

export function feedJobToProto(j: FeedJob, section: ProtoSection): ProtoJob {
  const signals = j.match_signals ?? [];
  const daysOld = postedDaysFrom(j.posted_at) ?? 99;
  const within24h = daysOld <= 0;
  return {
    id: j.job_id,
    section,
    title: j.title,
    company: j.company,
    logoUrl: j.employer_logo ?? null,
    logoMonogram: initialOf(j.company),
    posted: postedShort(j.posted_at),
    postedISO: j.posted_at ?? null,
    location: normalizeLocation(j.location),
    jobType: jobTypeLabel(j.type),
    category: j.category || "",
    match: j.match_score ?? null,
    matchSignals: signals,
    whyLine: whyOneLine(j),
    ranked: j.ranked,
    salary: pickSalary(j),
    salaryAnnual: j.salary_normalized_annual ?? null,
    tags: signals.slice(0, 3),
    applyUrl: j.apply_url,
    atsPlatform: j.ats_platform ?? null,
    autoApplyEligible: j.auto_apply_eligible ?? false,
    isNew: section === "recent" || within24h,
    isStale: daysOld >= STALE_DAYS,
    detailPosted: postedShort(j.posted_at),
    detailMatch: j.match_score ?? null,
    detailLocation: normalizeLocation(j.location),
    structured: j.structured,
  };
}

// Section-aware dedup: a job that appears in both new_matches and top_jobs
// stays in "recent" only. Empty arrays handled.
export function buildSectionedJobs(feed: JobFeedResponse | null): {
  recent: ProtoJob[];
  recommended: ProtoJob[];
} {
  if (!feed) return { recent: [], recommended: [] };

  const recent: ProtoJob[] = [];
  const seenInRecent = new Set<string>();
  for (const j of feed.new_matches ?? []) {
    if (!j.job_id || seenInRecent.has(j.job_id)) continue;
    seenInRecent.add(j.job_id);
    recent.push(feedJobToProto(j, "recent"));
  }

  const recommended: ProtoJob[] = [];
  const seenInRec = new Set<string>();
  for (const j of feed.top_jobs ?? []) {
    if (!j.job_id) continue;
    if (seenInRecent.has(j.job_id)) continue;
    if (seenInRec.has(j.job_id)) continue;
    seenInRec.add(j.job_id);
    recommended.push(feedJobToProto(j, "recommended"));
  }

  return { recent, recommended };
}
