import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Briefcase,
  MapPin,
  Building2,
  Clock,
  DollarSign,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Search,
  FileText,
  Download,
  Copy,
  Bookmark,
  BookmarkCheck,
  RefreshCw,
  FileCheck,
  AlertTriangle,
  Users,
  Linkedin,
  Mail,
  ArrowRight,
  X,
  Loader2,
} from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { apiService, type GenerateCoverLetterRequest, type Recruiter, type SuggestionsResult, type TemplateRebuildResult, type FeedJob, type JobFeedResponse } from "@/services/api";
import { firebaseApi, type Recruiter as FirebaseRecruiter } from "../services/firebaseApi";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { FindHumansModal, type FindHumansJob } from "@/components/jobs/FindHumansModal";
import { JobBoardSkeleton } from "@/components/JobBoardSkeleton";
import { cn } from "@/lib/utils";
import { InlineLoadingBar } from "@/components/ui/LoadingBar";
import { doc, collection, getDocs, setDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import "@/components/ResumeRenderer.css";

// Lazy-load heavy components only shown in secondary tabs/flows
const ResumeOptimizationModal = React.lazy(() => import('@/components/ResumeOptimizationModal').then(m => ({ default: m.ResumeOptimizationModal })));
const SuggestionsView = React.lazy(() => import('@/components/SuggestionsView').then(m => ({ default: m.SuggestionsView })));
const ResumeRenderer = React.lazy(() => import('@/components/ResumeRenderer'));
const ResumeActions = React.lazy(() => import('@/components/ResumeActions'));
const RecruiterSpreadsheet = React.lazy(() => import('@/components/RecruiterSpreadsheet'));
import { downloadCoverLetterAsPDF } from "@/utils/pdfGenerator";
import { getCompanyLogoUrl } from "@/utils/suggestionChips";

// ============================================================================
// TYPES
// ============================================================================

interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  salary?: string;
  type: "Internship" | "Full-Time" | "Part-Time" | "Contract";
  posted: string;
  description: string;
  requirements: string[];
  url: string;
  logo?: string;
  remote?: boolean;
  experienceLevel?: string;
  via?: string;
  matchScore?: number;
  qualityScore?: number;
  combinedScore?: number;
}



interface ATSScore {
  overall: number;
  keywords: number;
  formatting: number;
  relevance: number;
  suggestions: string[];
  jdQualityWarning?: string;
  technicalKeywordsInJd?: number;
}

interface OptimizedResume {
  content?: string;
  atsScore: ATSScore;
  keywordsAdded: string[];
  sectionsOptimized: string[];
  // JSON format fields (new format)
  name?: string;
  contact?: any;
  Summary?: string;
  Experience?: any[];
  Education?: any;
  Skills?: any;
  Projects?: any[];
  Extracurriculars?: any[];
}

interface CoverLetter {
  content: string;
  highlights: string[];
  tone: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const JOBS_PER_PAGE = 12;
const OPTIMIZATION_CREDIT_COST = 20;
const COVER_LETTER_CREDIT_COST = 5;

const JOB_TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "INTERNSHIP", label: "Internship" },
  { value: "FULLTIME", label: "Full-Time" },
  { value: "PARTTIME", label: "Part-Time" },
];

const CATEGORY_OPTIONS = [
  { value: "all", label: "All Fields" },
  { value: "software_engineering", label: "Software Engineering" },
  { value: "finance_banking", label: "Finance & Banking" },
  { value: "marketing_growth", label: "Marketing & Growth" },
  { value: "consulting", label: "Consulting" },
  { value: "product_management", label: "Product Management" },
  { value: "data_science", label: "Data Science" },
  { value: "venture_capital", label: "Venture Capital" },
  { value: "real_estate", label: "Real Estate" },
];

function decodeHtml(html: string): string {
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}

function cleanDescription(raw: string): string[] {
  // Decode HTML entities, then strip tags
  const decoded = decodeHtml(raw);
  const text = decoded
    // Block-level tags → double newline
    .replace(/<\/?(p|div|li|h[1-6]|tr|ul|ol|section|article|blockquote)[^>]*>/gi, '\n\n')
    // Line breaks → single newline
    .replace(/<br\s*\/?>/gi, '\n')
    // Strip remaining tags
    .replace(/<[^>]*>/g, ' ')
    // Decode &nbsp; (literal string and unicode)
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00A0/g, ' ')
    // Collapse spaces on each line (but preserve newlines)
    .replace(/[^\S\n]+/g, ' ')
    .trim();

  // Split on double newlines
  let paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  // If we got one giant block, try splitting on single newlines
  if (paragraphs.length <= 1 && text.length > 300) {
    paragraphs = text.split(/\n/).map((p) => p.trim()).filter(Boolean);
  }

  // If still one giant block, split on sentence boundaries every ~3 sentences
  if (paragraphs.length <= 1 && text.length > 300) {
    const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
    paragraphs = [];
    for (let i = 0; i < sentences.length; i += 3) {
      paragraphs.push(sentences.slice(i, i + 3).join('').trim());
    }
  }

  return paragraphs.filter(Boolean);
}

const TYPE_DISPLAY: Record<string, string> = {
  INTERNSHIP: "Internship",
  FULLTIME: "Full-Time",
  PARTTIME: "Part-Time",
};

/** Convert a FeedJob from the API into the legacy Job shape used by detail views */
function normalizeLocation(loc: unknown): string {
  if (!loc) return "";
  if (typeof loc === "string") return loc;
  if (typeof loc === "object" && loc !== null) {
    const l = loc as Record<string, unknown>;
    const parts = [l.addressLocality, l.addressRegion, l.addressCountry].filter(Boolean);
    return parts.join(", ") || JSON.stringify(loc);
  }
  return String(loc);
}

function feedJobToLegacy(fj: FeedJob): Job {
  return {
    id: fj.job_id,
    title: fj.title,
    company: fj.company,
    location: normalizeLocation(fj.location),
    salary: fj.salary_display || undefined,
    type: (TYPE_DISPLAY[fj.type] || fj.type) as Job["type"],
    posted: fj.posted_at,
    description: "",
    requirements: [],
    url: fj.apply_url,
    logo: fj.employer_logo || undefined,
    remote: fj.remote,
    matchScore: fj.match_score ?? undefined,
  };
}

/** Extract the core role from a job title (e.g. "Senior Data Analyst, Talent Acquisition" → "Data Analyst") */
function simplifyTitle(title: string): string {
  // Known core roles - match longest first
  const CORE_ROLES = [
    "software development engineer", "software engineer", "data scientist",
    "data analyst", "data engineer", "product manager", "product designer",
    "program manager", "project manager", "business analyst", "systems engineer",
    "machine learning engineer", "solutions architect", "account executive",
    "financial analyst", "investment analyst", "research analyst",
    "marketing manager", "operations manager", "technical writer",
    "ux designer", "ux researcher", "ui designer", "frontend engineer",
    "backend engineer", "full stack engineer", "devops engineer",
    "site reliability engineer", "security engineer", "qa engineer",
    "sales engineer", "customer success manager", "recruiter",
    "consultant", "accountant", "engineer", "designer", "analyst",
    "developer", "manager", "scientist", "researcher", "architect",
  ];
  const lower = title.toLowerCase();
  for (const role of CORE_ROLES) {
    if (lower.includes(role)) {
      // Return with original casing from the title
      const idx = lower.indexOf(role);
      return title.slice(idx, idx + role.length);
    }
  }
  // Fallback: take first segment before comma/dash/pipe, strip seniority
  const segment = title.split(/[,\-– - |/]/)[0].trim();
  return segment
    .replace(/\b(senior|sr\.?|junior|jr\.?|lead|principal|staff|head of|associate|intern|entry[- ]level|mid[- ]level|people|team|global|regional)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || title.split(/\s+/).pop() || title;
}

/** Format an ISO date string as relative time */
function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}

function normalizeLinkedInUrl(url: string): string {
  if (!url || url.trim() === '') return '';
  const trimmedUrl = url.trim();
  if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) return trimmedUrl;
  if (trimmedUrl.startsWith('linkedin.com') || trimmedUrl.startsWith('www.linkedin.com')) return `https://${trimmedUrl}`;
  if (trimmedUrl.startsWith('/in/')) return `https://www.linkedin.com${trimmedUrl}`;
  if (trimmedUrl.includes('linkedin') && trimmedUrl.includes('/in/')) {
    const match = trimmedUrl.match(/\/in\/[^\/\s]+/);
    if (match) return `https://www.linkedin.com${match[0]}`;
  }
  return `https://www.linkedin.com/in/${trimmedUrl}`;
}

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

const MatchScoreBadge: React.FC<{ score?: number }> = ({ score }) => {
  if (!score && score !== 0) return null;

  let barColor = "bg-gray-400";
  let textColor = "text-gray-600";

  if (score >= 80) {
    barColor = "bg-green-500";
    textColor = "text-green-700 dark:text-green-400";
  } else if (score >= 60) {
    barColor = "bg-[#0F172A]";
    textColor = "text-[#3B82F6]";
  } else if (score >= 40) {
    barColor = "bg-yellow-500";
    textColor = "text-yellow-700 dark:text-yellow-400";
  }

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
      <span className={`text-xs font-medium ${textColor}`}>{Math.round(score)}%</span>
    </div>
  );
};

// Logo component - tries SerpAPI's `employer_logo` first, falls back to our
// curated/Google-favicons resolver, then to a soft-blue initials badge so
// every card has *something* visually distinct in the leftmost slot.
const JobCardLogo: React.FC<{ job: Job }> = ({ job }) => {
  const [stage, setStage] = React.useState<"primary" | "fallback" | "initials">(
    job.logo ? "primary" : "fallback",
  );
  const fallbackUrl = React.useMemo(() => getCompanyLogoUrl(job.company), [job.company]);

  if (stage === "primary" && job.logo) {
    return (
      <img
        src={job.logo}
        alt={job.company}
        className="w-12 h-12 rounded-[6px] object-contain bg-white border border-line-2"
        onError={() => setStage(fallbackUrl ? "fallback" : "initials")}
      />
    );
  }
  if (stage === "fallback" && fallbackUrl) {
    return (
      <img
        src={fallbackUrl}
        alt={job.company}
        className="w-12 h-12 rounded-[6px] object-contain bg-white border border-line-2"
        onError={() => setStage("initials")}
      />
    );
  }
  // Final fallback: soft-blue initials badge (matches My Network's CompanyLogo)
  const initials = (job.company || "")
    .replace(/&/g, "and")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div
      className="w-12 h-12 rounded-[6px] flex items-center justify-center font-semibold"
      style={{
        background: "rgba(91,119,153,0.10)",
        color: "#64748B",
        fontSize: 16,
        letterSpacing: "-0.02em",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {initials || <Building2 className="w-5 h-5" />}
    </div>
  );
};

const JobCard: React.FC<{
  job: Job;
  isSelected: boolean;
  isSaved: boolean;
  onSelect: () => void;
  onSave: () => void;
  onApply: () => void;
  onFindHiringManager: () => void;
  onCardClick?: () => void;
  findHumansEnabled?: boolean;
  findHumansPending?: boolean;
}> = React.memo(({ job, isSelected, isSaved, onSelect, onSave, onApply, onFindHiringManager, onCardClick, findHumansEnabled = true, findHumansPending = false }) => (
  <GlassCard
    className={cn(
      "p-5 cursor-pointer transition-all duration-200",
      "hover:border-[#64748B]/60 hover:shadow-[0_2px_12px_rgba(91,119,153,0.10)]",
      "hover:-translate-y-[1px]",
      isSelected && "ring-2 ring-[#64748B]/40 ring-offset-2 ring-offset-background border-[#64748B]/60"
    )}
    glow={isSelected}
    onClick={onCardClick}
  >
    <div className="flex items-start justify-between gap-4">
      <div className="flex-shrink-0">
        <JobCardLogo job={job} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">{job.title}</h3>
            <p className="text-sm text-muted-foreground">{job.company}</p>
            {job.matchScore !== undefined && (
              <div className="mt-2">
                <MatchScoreBadge score={job.matchScore} />
              </div>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onSave(); }}
            className="flex-shrink-0 p-1.5 rounded-full hover:bg-muted/50 transition-colors"
          >
            {isSaved ? (
              <BookmarkCheck className="w-5 h-5 text-primary" />
            ) : (
              <Bookmark className="w-5 h-5 text-muted-foreground" />
            )}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          <Badge variant="secondary" className="text-xs">
            <MapPin className="w-3 h-3 mr-1" />
            {job.location}
          </Badge>
          <Badge variant={(job.type || "").toUpperCase() === "INTERNSHIP" ? "default" : "outline"} className="text-xs">
            {job.type}
          </Badge>
          {job.remote && (
            <Badge variant="outline" className="text-xs text-green-600">Remote</Badge>
          )}
          {job.salary && (
            <Badge variant="outline" className="text-xs">
              <DollarSign className="w-3 h-3 mr-1" />
              {job.salary}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {job.posted}
          </span>
          {job.via && <span>{job.via}</span>}
        </div>
      </div>
    </div>

    <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
      {/* First row: Find Contact and Apply */}
      <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        className="flex-1"
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
      >
        <Users className="w-4 h-4 mr-2" />
        Find Contact
      </Button>
      <Button
        variant="gradient"
        size="sm"
        className="flex-1"
        onClick={(e) => { e.stopPropagation(); onApply(); }}
      >
        <ExternalLink className="w-4 h-4 mr-2" />
        Apply
        </Button>
      </div>
      
      {/* Second row: Find Hiring Manager / Find the Humans */}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={findHumansEnabled && (findHumansPending || !job.company)}
        onClick={(e) => { e.stopPropagation(); onFindHiringManager(); }}
      >
        {findHumansEnabled && findHumansPending ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Users className="w-4 h-4 mr-2" />
        )}
        {findHumansEnabled
          ? (findHumansPending ? "Finding humans…" : "Find the Humans • 5 credits")
          : "Find Hiring Manager"}
      </Button>
    </div>
  </GlassCard>
));

const ATSScoreDisplay: React.FC<{ score: ATSScore }> = ({ score }) => {
  const getScoreColor = (value: number) => {
    if (value >= 80) return "text-green-500";
    if (value >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  const getProgressColor = (value: number) => {
    if (value >= 80) return "bg-green-500";
    if (value >= 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="border border-gray-200 rounded-md p-4 bg-white">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">ATS Score</h3>
        <div className={cn("text-2xl font-bold", getScoreColor(score.overall))}>
          {score.overall}%
        </div>
      </div>

      <div className="space-y-3">
        {[
          { label: "Keywords", value: score.keywords },
          { label: "Formatting", value: score.formatting },
          { label: "Relevance", value: score.relevance },
        ].map(({ label, value }) => (
          <div key={label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-600">{label}</span>
              <span className={cn("font-medium", getScoreColor(value))}>{value}%</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", getProgressColor(value))}
                style={{ width: `${value}%` }}
              />
            </div>
          </div>
        ))}

        {score.jdQualityWarning && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-gray-600 leading-relaxed">
                {score.jdQualityWarning}
              </p>
            </div>
          </div>
        )}

        {score.suggestions.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-200">
            <h4 className="text-xs font-medium text-gray-700 mb-2">Suggestions</h4>
            <ul className="space-y-1.5">
              {score.suggestions.map((suggestion, idx) => (
                <li key={idx} className="text-xs text-gray-600 flex items-start gap-2">
                  <span className="text-gray-400 mt-0.5">•</span>
                  <span>{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
    <div className="relative mb-8">
      {/* Animated glow effect */}
      <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-150 animate-pulse"></div>
      {/* Icon container with subtle animation */}
      <div className="relative w-24 h-24 rounded-[3px] bg-[#EFF6FF] flex items-center justify-center border border-primary/30 shadow-xl shadow-primary/10 transform transition-transform hover:scale-105">
        {icon}
      </div>
    </div>
    <h3 className="text-2xl font-bold text-foreground mb-4">{title}</h3>
    <p className="text-muted-foreground max-w-lg mb-8 leading-relaxed text-base font-normal">{description}</p>
    {action}
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const JobBoardPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isLoading: authLoading, updateCredits } = useFirebaseAuth();

  // Determine user tier (cast to include elite for subscription-backed tier)
  const effectiveUser = user || {
    credits: 0,
    maxCredits: 0,
    name: "User",
    email: "user@example.com",
    tier: "free",
  } as const;

  const userTier: "free" | "pro" | "elite" = useMemo(() => {
    const tier = effectiveUser?.tier as "free" | "pro" | "elite" | undefined;
    if (tier === "pro" || tier === "elite") return tier;
    return "free";
  }, [effectiveUser?.tier]);

  const _isElite = userTier === "elite";

  // Find the Humans (always enabled; backend enforces Pro/Elite gate).
  const [findHumansJob, setFindHumansJob] = useState<FindHumansJob | null>(null);
  const [findHumansOpen, setFindHumansOpen] = useState(false);

  const openFindHumans = useCallback(
    (j: FindHumansJob) => {
      if (userTier === "free") {
        toast({
          title: "Pro feature",
          description: "Find the Humans is available on Pro and Elite plans.",
          variant: "destructive",
        });
        return;
      }
      if (!j.company) {
        toast({
          title: "Missing company",
          description: "This job is missing a company name. Try a different listing.",
          variant: "destructive",
        });
        return;
      }
      setFindHumansJob(j);
      setFindHumansOpen(true);
    },
    [userTier],
  );

  // Tab State
  const [activeTab, setActiveTab] = useState<string>(searchParams.get("tab") || "jobs");
  
  // Job Detail View State
  const [showJobDetailView, setShowJobDetailView] = useState(false);
  const [selectedJobForDetail, setSelectedJobForDetail] = useState<Job | null>(null);
  const [jobDetailActiveTab, setJobDetailActiveTab] = useState<string>("job-application");

  // Job Detail Sheet State
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [detailSheetJob, setDetailSheetJob] = useState<FeedJob | null>(null);
  const [detailDescription, setDetailDescription] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Jobs Tab State - fed from /api/jobs/feed
  const [feedData, setFeedData] = useState<JobFeedResponse | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedJobType, setSelectedJobType] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortBy, setSortBy] = useState<"match" | "date" | "company">("match");
  const [savedJobs, setSavedJobs] = useState<Set<string>>(new Set());

  // Optimization Tab State
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobUrl, setJobUrl] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [isOptimizing, _setIsOptimizing] = useState(false);
  const [isGeneratingCoverLetter, setIsGeneratingCoverLetter] = useState(false);
  const [optimizedResume, setOptimizedResume] = useState<OptimizedResume | null>(null);
  const [coverLetter, setCoverLetter] = useState<CoverLetter | null>(null);
  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
  const [recruitersLoading, setRecruitersLoading] = useState(false);
  const [recruitersError, setRecruitersError] = useState<string | null>(null);
  const [, setRecruitersCount] = useState(0);
  const [recruitersHasMore, setRecruitersHasMore] = useState(false);
  const [recruitersMoreAvailable, setRecruitersMoreAvailable] = useState(0);
  const [recruiterEmails, setRecruiterEmails] = useState<any[]>([]);
  const [draftsCreated, setDraftsCreated] = useState<any[]>([]);
  const [maxRecruitersRequested, setMaxRecruitersRequested] = useState<number>(2);
  const [, setLastSearchResult] = useState<{requestedCount: number; foundCount: number; creditsCharged: number; error?: string} | null>(null);
  const [expandedEmail, setExpandedEmail] = useState<number | null>(null);
  const [parsedJobData, _setParsedJobData] = useState<{title?: string; company?: string; location?: string; description?: string} | null>(null);
  const [showJobDetails, setShowJobDetails] = useState(false);
  const resumeRef = useRef<HTMLDivElement>(null);

  // Cache known recruiter emails/linkedins to avoid full collection scans on dedup
  const knownRecruiterKeys = useRef<{ emails: Set<string>; linkedins: Set<string>; loaded: boolean }>({
    emails: new Set(),
    linkedins: new Set(),
    loaded: false,
  });

  // Resume optimization V2 state
  const [showOptimizationModal, setShowOptimizationModal] = useState(false);
  const [suggestionsResult, setSuggestionsResult] = useState<SuggestionsResult | null>(null);
  const [showSuggestionsView, setShowSuggestionsView] = useState(false);
  const [, setTemplateRebuildResult] = useState<TemplateRebuildResult | null>(null);

  // Calculate hasJobInfo reactively
  const hasJobInfo = useMemo(() => {
    return !!(jobUrl?.trim() || jobDescription?.trim());
  }, [jobUrl, jobDescription]);

  // Fetch job feed from /api/jobs/feed (kept as useCallback for refresh button)
  const fetchJobFeed = useCallback(async (refresh = false) => {
    if (!user?.uid) return;
    setLoadingJobs(true);
    try {
      const response = await apiService.getJobFeed({ refresh });
      setFeedData(response);
      // Convert top_jobs to legacy Job format for detail views
      const legacyJobs = response.top_jobs.map(feedJobToLegacy);
      setJobs(legacyJobs);
    } catch (error) {
      console.error("Error fetching job feed:", error);
      toast({
        title: "Error loading jobs",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setLoadingJobs(false);
    }
  }, [user?.uid]);

  // Load job feed on mount - honour ?refresh=true URL param
  useEffect(() => {
    if (!user?.uid) return;
    const shouldRefresh = searchParams.get("refresh") === "true";
    fetchJobFeed(shouldRefresh);
    if (shouldRefresh) {
      // Remove refresh param from URL so a browser reload doesn't re-trigger
      searchParams.delete("refresh");
      setSearchParams(searchParams, { replace: true });
    }
  }, [user?.uid]);

  // Load saved jobs from Firestore (with localStorage fallback)
  useEffect(() => {
    const loadSavedJobs = async () => {
      if (!user?.uid) {
        // Fallback to localStorage for non-authenticated users
    const saved = localStorage.getItem("offerloop_saved_jobs");
    if (saved) setSavedJobs(new Set(JSON.parse(saved)));
        return;
      }

      try {
        // Try Firestore first
        const savedJobsRef = collection(db, 'users', user.uid, 'savedJobs');
        const snapshot = await getDocs(savedJobsRef);
        const savedIds = snapshot.docs.map(doc => doc.id);
        
        if (savedIds.length > 0) {
          setSavedJobs(new Set(savedIds));
          // Also sync to localStorage as backup
          localStorage.setItem("offerloop_saved_jobs", JSON.stringify(savedIds));
        } else {
          // Fallback to localStorage if Firestore is empty
          const saved = localStorage.getItem("offerloop_saved_jobs");
          if (saved) {
            const ids = JSON.parse(saved);
            setSavedJobs(new Set(ids));
            // Migrate to Firestore using batched write
            const batch = writeBatch(db);
            for (const jobId of ids) {
              batch.set(doc(db, 'users', user.uid, 'savedJobs', jobId), {
                savedAt: new Date().toISOString(),
              });
            }
            await batch.commit();
          }
        }
      } catch (error) {
        console.error("Error loading saved jobs:", error);
        // Fallback to localStorage
        const saved = localStorage.getItem("offerloop_saved_jobs");
        if (saved) setSavedJobs(new Set(JSON.parse(saved)));
      }
    };
    
    loadSavedJobs();
  }, [user?.uid]);

  // Client-side filtered top_jobs from feed
  const filteredFeedJobs = useMemo(() => {
    if (!feedData) return [];
    return feedData.top_jobs.filter((job) => {
      if (selectedJobType !== "all" && (job.type || "").toUpperCase() !== selectedJobType.toUpperCase()) return false;
      if (selectedCategory !== "all" && job.category !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!job.title.toLowerCase().includes(q) && !job.company.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [feedData, selectedJobType, selectedCategory, searchQuery]);

  // Client-side filtered new_matches
  const filteredNewMatches = useMemo(() => {
    if (!feedData) return [];
    return feedData.new_matches.filter((job) => {
      if (selectedJobType !== "all" && (job.type || "").toUpperCase() !== selectedJobType.toUpperCase()) return false;
      if (selectedCategory !== "all" && job.category !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!job.title.toLowerCase().includes(q) && !job.company.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [feedData, selectedJobType, selectedCategory, searchQuery]);

  // Legacy filteredJobs kept for detail view flows
  const _filteredJobs = jobs;

  // Sort top_jobs feed results
  const sortedFeedJobs = useMemo(() => {
    const sorted = [...filteredFeedJobs];
    switch (sortBy) {
      case "match":
        return sorted.sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0));
      case "date":
        return sorted.sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime());
      case "company":
        return sorted.sort((a, b) => a.company.localeCompare(b.company));
      default:
        return sorted;
    }
  }, [filteredFeedJobs, sortBy]);

  // sortedJobs alias used by pagination count in the render
  const _sortedJobs = sortedFeedJobs;

  // Pagination for top_jobs grid (memoized to avoid re-slicing on unrelated state changes)
  const totalPages = Math.ceil(sortedFeedJobs.length / JOBS_PER_PAGE);
  const paginatedFeedJobs = useMemo(() =>
    sortedFeedJobs.slice(
      (currentPage - 1) * JOBS_PER_PAGE,
      currentPage * JOBS_PER_PAGE
    ),
    [sortedFeedJobs, currentPage]
  );

  // Pre-compute legacy job conversions so feedJobToLegacy isn't called in the render body
  const paginatedLegacyJobs = useMemo(() =>
    paginatedFeedJobs.map((job) => ({ feed: job, legacy: feedJobToLegacy(job) })),
    [paginatedFeedJobs]
  );
  const newMatchesLegacyJobs = useMemo(() =>
    filteredNewMatches.map((job) => ({ feed: job, legacy: feedJobToLegacy(job) })),
    [filteredNewMatches]
  );

  // Keep a ref to savedJobs so handleSaveJob has stable identity
  const savedJobsRef = useRef(savedJobs);
  savedJobsRef.current = savedJobs;

  // Handlers
  const handleSaveJob = useCallback(async (jobId: string) => {
    const isCurrentlySaved = savedJobsRef.current.has(jobId);

    setSavedJobs((prev) => {
      const newSaved = new Set(prev);
      if (isCurrentlySaved) {
        newSaved.delete(jobId);
        toast({ title: "Job removed from saved" });
      } else {
        newSaved.add(jobId);
        toast({ title: "Job saved!" });
      }
      // Update localStorage immediately for responsive UI
      localStorage.setItem("offerloop_saved_jobs", JSON.stringify([...newSaved]));
      return newSaved;
    });

    // Persist to Firestore if user is authenticated
    if (user?.uid) {
      try {
        const jobRef = doc(db, 'users', user.uid, 'savedJobs', jobId);
        if (isCurrentlySaved) {
          await deleteDoc(jobRef);
        } else {
          await setDoc(jobRef, { savedAt: new Date().toISOString() });
        }
      } catch (error) {
        console.error("Error saving job to Firestore:", error);
        setSavedJobs((prev) => {
          const reverted = new Set(prev);
          if (isCurrentlySaved) {
            reverted.add(jobId);
          } else {
            reverted.delete(jobId);
          }
          return reverted;
        });
      }
    }
  }, [user?.uid]);

  const handleSelectJobForOptimization = useCallback((job: Job) => {
    setSelectedJob(job);
    setJobUrl(job.url);
    setJobDescription(job.description);
    setOptimizedResume(null);
    setCoverLetter(null);
    // Open job detail view
    setSelectedJobForDetail(job);
    setShowJobDetailView(true);
    setJobDetailActiveTab("contact-recruiter");
  }, []);

  const handleApplyToJob = useCallback((job: Job) => {
    // Open job detail view instead of directly opening link
    setSelectedJobForDetail(job);
    setSelectedJob(job);
    setJobUrl(job.url);
    setJobDescription(job.description);
    setShowJobDetailView(true);
    setJobDetailActiveTab("job-application");
  }, []);
  
  const handleReturnToJobBoard = useCallback(() => {
    setShowJobDetailView(false);
    setSelectedJobForDetail(null);
  }, []);

  const openJobDetail = useCallback(async (job: FeedJob) => {
    setDetailSheetJob(job);
    setDetailDescription(null);
    setDetailSheetOpen(true);
    setDetailLoading(true);
    try {
      const detail = await apiService.getJobDetail(job.job_id);
      setDetailDescription(detail.description_raw || "");
    } catch {
      setDetailDescription("");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Search is now client-side filtering - no API call needed
  const handleSearch = useCallback(() => {
    // searchQuery state drives filteredFeedJobs via useMemo, nothing else to do
    setCurrentPage(1);
  }, []);

  const handleRefreshJobs = async () => {
    await fetchJobFeed(true);
    toast({ title: "Jobs refreshed!" });
  };

  // Helper function to save recruiters to Recruiter Spreadsheet
  const saveRecruitersToSpreadsheet = async (apiRecruiters: Recruiter[], job: Job | null) => {
    if (!user || !apiRecruiters.length) return;

    try {
      // Lazy-load existing recruiter keys once, then update incrementally
      if (!knownRecruiterKeys.current.loaded) {
        const existingRecruiters = await firebaseApi.getRecruiters(user.uid);
        for (const r of existingRecruiters) {
          if (r.email) knownRecruiterKeys.current.emails.add(r.email);
          if (r.linkedinUrl) knownRecruiterKeys.current.linkedins.add(r.linkedinUrl);
        }
        knownRecruiterKeys.current.loaded = true;
      }

      // Convert API recruiters to Firebase recruiter format
      const firebaseRecruiters: Omit<FirebaseRecruiter, 'id'>[] = apiRecruiters.map((apiRecruiter) => ({
        firstName: apiRecruiter.FirstName || '',
        lastName: apiRecruiter.LastName || '',
        linkedinUrl: apiRecruiter.LinkedIn || '',
        email: apiRecruiter.Email || apiRecruiter.WorkEmail || '',
        company: apiRecruiter.Company || '',
        jobTitle: apiRecruiter.Title || '',
        location: `${apiRecruiter.City || ''}${apiRecruiter.City && apiRecruiter.State ? ', ' : ''}${apiRecruiter.State || ''}`.trim() || '',
        phone: apiRecruiter.Phone,
        workEmail: apiRecruiter.WorkEmail,
        personalEmail: apiRecruiter.PersonalEmail,
        associatedJobId: job?.id,
        associatedJobTitle: job?.title,
        associatedJobUrl: job?.url,
        dateAdded: new Date().toISOString(),
        status: 'Not Contacted',
      }));

      // Check for duplicates using cached keys
      const { emails, linkedins } = knownRecruiterKeys.current;
      const newRecruiters = firebaseRecruiters.filter(r => {
        const hasEmail = r.email && emails.has(r.email);
        const hasLinkedIn = r.linkedinUrl && linkedins.has(r.linkedinUrl);
        return !hasEmail && !hasLinkedIn;
      });

      if (newRecruiters.length > 0) {
        await firebaseApi.bulkCreateRecruiters(user.uid, newRecruiters);
        // Update cache incrementally so future calls skip these too
        for (const r of newRecruiters) {
          if (r.email) emails.add(r.email);
          if (r.linkedinUrl) linkedins.add(r.linkedinUrl);
        }
      }
    } catch (error) {
      console.error('Error saving recruiters to spreadsheet:', error);
    }
  };

  const handleFindRecruiter = async () => {
    if ((user?.credits ?? 0) < 5) {
      toast({
        title: "Insufficient Credits",
        description: "You need at least 5 credits to find recruiters.",
        variant: "destructive"
      });
      return;
    }
    
    // Capture the current active tab at the start of the function
    const currentActiveTab = activeTab;
    
    // Determine company, title, location, and description from various sources
    let company: string | undefined;
    let jobTitle: string = '';
    let location: string = '';
    let description: string = '';
    
    // Priority 1: Use selectedJob from job board (most reliable source)
    if (selectedJob) {
      company = selectedJob.company;
      jobTitle = selectedJob.title || '';
      location = selectedJob.location || '';
      description = jobDescription || selectedJob.description || '';
    }
    
    // Priority 2: Parse job URL only if we're missing key fields - skip the
    // expensive backend scrape when selectedJob already has everything we need.
    const needsUrlParse = !company || !jobTitle;
    if (needsUrlParse && jobUrl && jobUrl.trim()) {
      try {
        const parseResponse = await apiService.parseJobUrl({ url: jobUrl });
        if (parseResponse.job) {
          // Use parsed data to fill in missing fields or override if more complete
          if (parseResponse.job.company && !company) {
          company = parseResponse.job.company;
          }
          if (parseResponse.job.title && !jobTitle) {
            jobTitle = parseResponse.job.title;
          }
          // Location: prefer parsed location if available, otherwise keep selectedJob location
          if (parseResponse.job.location) {
            location = parseResponse.job.location;
          }
          // Description: prefer parsed description if available, otherwise keep existing
          if (parseResponse.job.description && !description) {
            description = parseResponse.job.description;
          }
        } else if (parseResponse.error) {
          console.warn('Failed to parse job URL:', parseResponse.error);
          // Show friendly message in recruiter search mode
          if (currentActiveTab === "recruiter-search") {
            toast({
              title: "Could not parse job URL",
              description: "Please paste the job description instead of using the URL.",
              variant: "default"
            });
          }
        }
      } catch (error) {
        console.error('Error parsing job URL:', error);
        // Show friendly message in recruiter search mode for catch errors too
        if (currentActiveTab === "recruiter-search") {
          toast({
            title: "Could not parse job URL",
            description: "Please paste the job description instead of using the URL.",
            variant: "default"
          });
        }
      }
    }
    
    // Priority 3: Fallback to jobDescription if still no description
    if (!description && jobDescription) {
      description = jobDescription;
    }
    
    // Ensure location is populated from selectedJob if we still don't have it
    if (!location && selectedJob?.location) {
      location = selectedJob.location;
    }
    
    // If still no company, that's okay - backend will extract it from description via OpenAI
    // But we should still show a warning if we don't have a description either
    if (!company && !description) {
      toast({
        title: "Job Information Required",
        description: "Please select a job from the list, paste a job URL, or paste the job description in the text area below.",
        variant: "destructive"
      });
      return;
    }
    
    setRecruitersLoading(true);
    setRecruitersError(null);
    
    try {
      // Only send company if we're confident it's valid (from selectedJob or URL parsing)
      // Otherwise, let backend extract it via OpenAI from description
      // Reject obviously invalid company names
      const invalidCompanyNames = ['job type', 'job details', 'job description', 'employer', 'company', 'organization'];
      const isValidCompany = company && company.trim() && !invalidCompanyNames.includes(company.toLowerCase().trim());
      
      const response = await apiService.findRecruiters({
        company: isValidCompany ? company : undefined,  // Only send if valid
        jobTitle: jobTitle || undefined,
        jobDescription: description || jobDescription || undefined,  // Always send description if available
        location: location || undefined,
        jobUrl: jobUrl || undefined,  // Pass jobUrl as fallback for backend parsing
        maxResults: maxRecruitersRequested  // Pass user's requested number
      });
      
      const requestedCount = response.requestedCount ?? maxRecruitersRequested;
      const foundCount = response.foundCount ?? response.recruiters.length;
      
      // Store last search result for inline alert
      setLastSearchResult({
        requestedCount,
        foundCount,
        creditsCharged: response.creditsCharged,
        error: response.error
      });
      
      if (response.error) {
        setRecruitersError(response.error);
        setRecruiters([]);
        setRecruitersCount(0);
        setRecruitersHasMore(false);
        toast({
          title: "Error",
          description: "Something went wrong. No credits were charged.",
          variant: "destructive"
        });
      } else if (foundCount === 0) {
        setRecruitersError(response.message || "No recruiters found at this company.");
        setRecruiters([]);
        setRecruitersCount(0);
        setRecruitersHasMore(false);
        toast({
          title: "No Recruiters Found",
          description: "No recruiters found matching this job. Try a different job title or company. No credits were charged.",
          variant: "default"
        });
      } else if (foundCount < requestedCount) {
        // Found fewer than requested
        setRecruiters(response.recruiters);
        setRecruitersCount(response.totalFound || response.recruiters.length);
        setRecruitersHasMore(response.hasMore || false);
        setRecruitersMoreAvailable(response.moreAvailable || 0);
        setRecruiterEmails(response.emails || []);
        setDraftsCreated(response.draftsCreated || []);
        if (response.creditsRemaining !== undefined) {
          await updateCredits(response.creditsRemaining);
        }
        
        // Auto-save recruiters to Recruiter Spreadsheet
        if (user && response.recruiters.length > 0) {
          // If we're in Recruiter Search, don't associate with a job; otherwise use selectedJobForDetail
          const jobToAssociate = currentActiveTab === "recruiter-search" ? null : selectedJobForDetail;
          await saveRecruitersToSpreadsheet(response.recruiters, jobToAssociate);
        }
        
        const draftMessage = response.draftsCreated && response.draftsCreated.length > 0
          ? ` ${response.draftsCreated.length} email draft${response.draftsCreated.length > 1 ? 's' : ''} created in Gmail!`
          : '';
        toast({
          title: "Found Fewer Than Requested",
          description: `Found ${foundCount} of ${requestedCount} requested recruiters (${response.creditsCharged} credits used). We couldn't find more matches for this job - try broadening the job title or company criteria.${draftMessage}`,
          variant: "default"
        });
        // Switch to recruiters tab to show results (only if not in Recruiter Search)
        if (currentActiveTab !== "recruiter-search") {
        setActiveTab("recruiters");
        }
      } else {
        // Found exactly what was requested (or more)
        setRecruiters(response.recruiters);
        setRecruitersCount(response.totalFound || response.recruiters.length);
        setRecruitersHasMore(response.hasMore || false);
        setRecruitersMoreAvailable(response.moreAvailable || 0);
        setRecruiterEmails(response.emails || []);
        setDraftsCreated(response.draftsCreated || []);
        if (response.creditsRemaining !== undefined) {
          await updateCredits(response.creditsRemaining);
        }
        
        // Auto-save recruiters to Recruiter Spreadsheet
        if (user && response.recruiters.length > 0) {
          // If we're in Recruiter Search, don't associate with a job; otherwise use selectedJobForDetail
          const jobToAssociate = currentActiveTab === "recruiter-search" ? null : selectedJobForDetail;
          await saveRecruitersToSpreadsheet(response.recruiters, jobToAssociate);
        }
        
        const draftMessage = response.draftsCreated && response.draftsCreated.length > 0
          ? ` ${response.draftsCreated.length} email draft${response.draftsCreated.length > 1 ? 's' : ''} created in Gmail!`
          : '';
        toast({
          title: "Recruiters Found!",
          description: `Found ${foundCount} recruiter${foundCount !== 1 ? 's' : ''} (${response.creditsCharged} credits used).${draftMessage}`,
          variant: "default"
        });
        // Switch to recruiters tab to show results (only if not in Recruiter Search)
        if (currentActiveTab !== "recruiter-search") {
        setActiveTab("recruiters");
        }
      }
    } catch (error: any) {
      setRecruitersError(error.message || "Failed to find recruiters");
      setRecruiters([]);
      setRecruitersCount(0);
      setRecruitersHasMore(false);
      setLastSearchResult({
        requestedCount: maxRecruitersRequested,
        foundCount: 0,
        creditsCharged: 0,
        error: error.message || "Failed to find recruiters"
      });
      toast({
        title: "Error",
        description: "Something went wrong. No credits were charged.",
        variant: "destructive"
      });
    } finally {
      setRecruitersLoading(false);
    }
  };

  const handleGenerateCoverLetter = async () => {
    if (!user?.uid) return;
    if ((user?.credits ?? 0) < COVER_LETTER_CREDIT_COST) {
      toast({ title: "Insufficient Credits", description: `You need ${COVER_LETTER_CREDIT_COST} credits.`, variant: "destructive" });
      return;
    }
    if (!jobUrl && !jobDescription) {
      toast({ title: "Job Information Required", variant: "destructive" });
      return;
    }

    setIsGeneratingCoverLetter(true);
    try {
      // Only send jobTitle and company if we have a selectedJob AND no URL
      // If URL is provided, let the backend parse it fresh and use that data
      const requestPayload: GenerateCoverLetterRequest = {
        jobUrl: jobUrl || undefined,
        jobDescription: jobDescription || undefined,
        userId: user.uid,
      };
      
      // Only include jobTitle and company if we have a selectedJob from the list
      // AND no URL was manually pasted (to avoid sending stale data)
      if (selectedJob && !jobUrl) {
        requestPayload.jobTitle = selectedJob.title;
        requestPayload.company = selectedJob.company;
      }
      
      const response = await apiService.generateCoverLetter(requestPayload);
      if (response.coverLetter) {
        setCoverLetter(response.coverLetter);
        // Backend already deducted credits, just update with the remaining balance
        if (response.creditsRemaining !== undefined) {
          await updateCredits(response.creditsRemaining);
        }
        toast({ title: "Cover Letter Generated!" });
      }
    } catch (error: any) {
      toast({ title: "Generation Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsGeneratingCoverLetter(false);
    }
  };

  const handleCopyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${type} copied to clipboard!` });
  };

  const handleDownload = async (content: string, filename: string) => {
    try {
      // Extract base filename without extension for PDF
      const baseFilename = filename.replace(/\.(txt|pdf)$/i, '');
      await downloadCoverLetterAsPDF(content, baseFilename);
      toast({ title: "Downloaded!" });
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast({ 
        title: "Download failed", 
        description: "Failed to generate PDF. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Helper to normalize LinkedIn URLs
  // Update URL when tab changes
  useEffect(() => {
    setSearchParams({ tab: activeTab });
  }, [activeTab, setSearchParams]);

  // Reset page on filter/sort change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedJobType, selectedCategory, sortBy]);

  if (authLoading) return <LoadingSkeleton />;

  return (
    <SidebarProvider>
      <div className="flex h-screen bg-background overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <AppHeader title="Job Board" />

          {/* Spacer below header */}
          {!showJobDetailView && (
            <div className="border-b border-border/50 bg-background/80 backdrop-blur-sm px-6 pt-2 pb-2" />
          )}

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
            {showJobDetailView && selectedJobForDetail ? (
              // Job Detail View
              <div className="w-full p-6 min-w-0">
                {/* Return to Job Board Button */}
                <Button
                  variant="ghost"
                  onClick={handleReturnToJobBoard}
                  className="mb-6 flex items-center gap-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Return to Job Board
                </Button>

                {/* Job Detail Tabs */}
                <Tabs value={jobDetailActiveTab} onValueChange={setJobDetailActiveTab} className="space-y-6 w-full">
                  <div className="flex mb-8">
                    <TabsList className="h-14 tabs-container-gradient border border-border grid grid-cols-3 w-full rounded-[3px] p-1 bg-white">
                      <TabsTrigger
                        value="job-application"
                        className="h-12 font-medium text-base data-[state=active] data-[state=active]:text-white data-[state=inactive]:text-muted-foreground transition-all"
                      >
                        <FileText className="h-5 w-5 mr-2" />
                        Job Application
                      </TabsTrigger>
                      <TabsTrigger
                        value="optimize-cv"
                        className="h-12 font-medium text-base data-[state=active] data-[state=active]:text-white data-[state=inactive]:text-muted-foreground transition-all"
                      >
                        <FileCheck className="h-5 w-5 mr-2" />
                        Optimize CV & Resume
                      </TabsTrigger>
                      <TabsTrigger
                        value="contact-recruiter"
                        className="h-12 font-medium text-base data-[state=active] data-[state=active]:text-white data-[state=inactive]:text-muted-foreground transition-all"
                      >
                        <Users className="h-5 w-5 mr-2" />
                        Contact Recruiter(s)
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  {/* Job Application Tab */}
                  <TabsContent value="job-application" className="space-y-6">
                    <GlassCard className="p-6">
                      <div className="space-y-6">
                        {/* Job Title */}
                        <div>
                          <h2 className="text-2xl font-bold text-foreground mb-2">
                            {selectedJobForDetail.title}
                          </h2>
                          <p className="text-lg text-muted-foreground mb-4">
                            {selectedJobForDetail.company} • {selectedJobForDetail.location}
                          </p>
                          <Button
                            variant="gradient"
                            size="lg"
                            onClick={() => {
                              if (selectedJobForDetail.url) {
                                window.open(selectedJobForDetail.url, '_blank', 'noopener,noreferrer');
                              }
                            }}
                            className="w-full sm:w-auto"
                          >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Apply
                          </Button>
                        </div>

                        {/* Job Link */}
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            Job Link
                          </label>
                          <a
                            href={selectedJobForDetail.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline flex items-center gap-2"
                          >
                            {selectedJobForDetail.url}
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>

                        {/* Job Description */}
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            Job Description
                          </label>
                          <div className="max-h-96 overflow-y-auto p-4 bg-muted/50 rounded-[3px] border border-border">
                            <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                              {selectedJobForDetail.description || "No description available."}
                            </div>
                          </div>
                        </div>
                      </div>
                    </GlassCard>
                  </TabsContent>

                  {/* Optimize CV & Resume Tab */}
                  <TabsContent value="optimize-cv" className="space-y-6">
                    <GlassCard className="p-6">
                      <div className="flex flex-col gap-4 w-full">
                        <Button
                          variant="gradient"
                          size="lg"
                          onClick={() => {
                            setSelectedJob(selectedJobForDetail);
                            setJobUrl(selectedJobForDetail.url);
                            setJobDescription(selectedJobForDetail.description);
                            setShowOptimizationModal(true);
                          }}
                          className="w-full"
                        >
                          <FileCheck className="h-5 w-5 mr-2" />
                          Optimize Resume
                        </Button>
                        <Button
                          variant="outline"
                          size="lg"
                          onClick={() => {
                            setSelectedJob(selectedJobForDetail);
                            setJobUrl(selectedJobForDetail.url);
                            setJobDescription(selectedJobForDetail.description);
                            handleGenerateCoverLetter();
                          }}
                          disabled={!selectedJobForDetail.url && !selectedJobForDetail.description}
                          className="w-full"
                        >
                          <FileText className="h-5 w-5 mr-2" />
                          Generate CV
                        </Button>
                      </div>
                    </GlassCard>
                  </TabsContent>

                  {/* Contact Recruiter(s) Tab */}
                  <TabsContent value="contact-recruiter" className="w-full">
                    <GlassCard className="p-0 overflow-hidden">
                      <div className="w-full h-full">
                        {/* Reuse recruiter UI - header section */}
                        <div className="bg-background border-b border-border/40 px-6 py-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h2 className="text-xl font-bold flex items-center gap-2 text-foreground">
                              <Users className="w-6 h-6 text-primary" />
                              Recruiters
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1">
                              {recruiters.length > 0 
                                ? `${recruiters.length} recruiter${recruiters.length !== 1 ? 's' : ''} found`
                                : 'No recruiters found yet. Use "Find Recruiters" to search.'}
                            </p>
                          </div>
                          {selectedJobForDetail && (
                            <div className="flex items-center gap-3">
                              <label className="text-sm text-gray-600 flex items-center gap-2">
                                Number of recruiters:
                                <Select
                                  value={maxRecruitersRequested.toString()}
                                  onValueChange={(value) => setMaxRecruitersRequested(parseInt(value))}
                                  disabled={recruitersLoading}
                                >
                                  <SelectTrigger className="w-20 h-8 text-sm">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {[1, 2, 3, 4, 5].map((num) => (
                                      <SelectItem key={num} value={num.toString()}>
                                        {num}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </label>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span>
                                      <Button
                                        disabled={recruitersLoading || (user?.credits ?? 0) < 5}
                                        onClick={() => {
                                          // Set selected job info for recruiter search
                                          setSelectedJob(selectedJobForDetail);
                                          setJobUrl(selectedJobForDetail.url);
                                          setJobDescription(selectedJobForDetail.description);
                                          handleFindRecruiter();
                                        }}
                                        variant={undefined}
                                        className={`
                                          relative overflow-hidden text-sm px-4 py-2 rounded-[3px] font-medium transition-colors
                                          ${!recruitersLoading && (user?.credits ?? 0) >= 5
                                            ? '!bg-[#0F172A] !text-white hover:!bg-[#1E293B] active:!bg-[#0F172A] focus-visible:!ring-[#3B82F6]' 
                                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                          }
                                        `}
                                        style={!recruitersLoading && (user?.credits ?? 0) >= 5 ? { 
                                          backgroundColor: '#2563eb',
                                          color: '#ffffff'
                                        } : undefined}
                                      >
                                        {recruitersLoading ? 'Finding...' : 'Find Recruiters'}
                                        <InlineLoadingBar isLoading={recruitersLoading} />
                                      </Button>
                                    </span>
                                  </TooltipTrigger>
                                  {(user?.credits ?? 0) < 5 && (
                                    <TooltipContent>
                                      <p>You need at least 5 credits. You have {user?.credits ?? 0}.</p>
                                    </TooltipContent>
                                  )}
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          )}
                        </div>
                        {/* Tracker navigation buttons */}
                        {recruiters.length > 0 && (
                          <div className="flex gap-2 mt-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => { handleReturnToJobBoard(); setActiveTab("recruiters"); }}
                              className="text-xs"
                            >
                              <Users className="w-3.5 h-3.5 mr-1.5" />
                              View Recruiter Spreadsheet
                              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                            </Button>
                            {draftsCreated.length > 0 && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate('/tracker')}
                                className="text-xs"
                              >
                                <Mail className="w-3.5 h-3.5 mr-1.5" />
                                View in Tracker
                                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                              </Button>
                            )}
                          </div>
                        )}

                        {/* Show drafts created notification */}
                        {draftsCreated.length > 0 && (
                          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-[3px] p-4 mt-4">
                            <div className="flex items-center gap-2">
                              <Mail className="h-5 w-5 text-green-600" />
                              <div className="flex-1">
                                <p className="text-sm text-green-800 dark:text-green-200 font-medium">
                                  {draftsCreated.length} email draft{draftsCreated.length > 1 ? 's' : ''} created in your Gmail!
                                </p>
                                <div className="flex items-center gap-3 mt-1">
                                  <a
                                    href="https://mail.google.com/mail/u/0/#drafts"
                                    target="_blank"
                                    rel="noopener,noreferrer"
                                    className="text-sm text-green-600 dark:text-green-400 hover:underline inline-block"
                                  >
                                    Open Gmail Drafts →
                                  </a>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigate('/tracker')}
                                    className="text-xs h-7 border-green-300 text-green-700 hover:bg-green-50"
                                  >
                                    <Mail className="w-3 h-3 mr-1" />
                                    View in Tracker
                                    <ArrowRight className="w-3 h-3 ml-1" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {recruitersHasMore && (
                          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-[3px] p-4 mt-4">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                              <div>
                                <p className="text-sm font-medium text-yellow-900 dark:text-yellow-200">
                                  More Recruiters Available
                                </p>
                                <p className="text-xs text-yellow-800 dark:text-yellow-300 mt-1">
                                  {recruitersMoreAvailable} more recruiter{recruitersMoreAvailable !== 1 ? 's' : ''} found, but you need {recruitersMoreAvailable * 5} more credits to view them. 
                                  You currently have {user?.credits ?? 0} credits.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Recruiter Table - reuse existing recruiter table */}
                      {recruiters.length === 0 ? (
                        <div className="flex items-center justify-center h-[calc(100vh-400px)]">
                          <div className="text-center">
                            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                            <p className="text-muted-foreground text-lg">
                              No recruiters found yet.
                            </p>
                            <p className="text-muted-foreground mt-2 text-sm">
                              Click "Find Recruiters" to search for recruiters at this company.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full overflow-x-auto">
                          <div className="rounded-md border border-border bg-background/60 backdrop-blur-sm min-w-full">
                            <table className="w-full">
                              <thead className="bg-muted/50 sticky top-0 z-10">
                                <tr>
                                  <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">First Name</th>
                                  <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Name</th>
                                  <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">LinkedIn</th>
                                  <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</th>
                                  <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Title</th>
                                  <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Company</th>
                                  <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Location</th>
                                  <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="bg-background divide-y divide-border">
                                {recruiters.map((recruiter, index) => {
                                  const emailData = recruiterEmails.find(e => e.to_email === recruiter.Email);
                                  const draftData = draftsCreated.find(d => d.recruiter_email === recruiter.Email);
                                  
                                  return (
                                    <React.Fragment key={index}>
                                      <tr className="hover:bg-secondary/50">
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">{recruiter.FirstName}</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">{recruiter.LastName}</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                                          {recruiter.LinkedIn ? (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => window.open(normalizeLinkedInUrl(recruiter.LinkedIn), '_blank', 'noopener,noreferrer')}
                                              className="p-1 h-auto text-primary hover:text-primary/80 cursor-pointer"
                                              title="View LinkedIn"
                                            >
                                              <ExternalLink className="h-4 w-4 mr-1" />
                                              LinkedIn
                                            </Button>
                                          ) : (
                                            <span className="text-muted-foreground text-xs">No LinkedIn</span>
                                          )}
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">
                                          {recruiter.Email && recruiter.Email !== "Not available" ? (
                                            <a href={`mailto:${recruiter.Email}`} className="text-primary hover:underline">
                                              {recruiter.Email}
                                            </a>
                                          ) : (
                                            <span className="text-muted-foreground text-xs">Not available</span>
                                          )}
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">{recruiter.Title}</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">{recruiter.Company}</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">
                                          {recruiter.City && recruiter.State ? `${recruiter.City}, ${recruiter.State}` : 'N/A'}
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                                          <div className="flex gap-2">
                                            {recruiter.LinkedIn && (
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => window.open(normalizeLinkedInUrl(recruiter.LinkedIn), '_blank', 'noopener,noreferrer')}
                                                className="h-8 w-8"
                                                title="View LinkedIn"
                                              >
                                                <Linkedin className="h-4 w-4" />
                                              </Button>
                                            )}
                                            {draftData?.draft_url ? (
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => window.open(draftData.draft_url, '_blank')}
                                                className="h-8 w-8 text-green-600 hover:text-green-700"
                                                title="Open Email Draft"
                                              >
                                                <Mail className="h-4 w-4" />
                                              </Button>
                                            ) : recruiter.Email && recruiter.Email !== "Not available" ? (
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                asChild
                                                className="h-8 w-8"
                                                title="Send Email"
                                              >
                                                <a href={`mailto:${recruiter.Email}`}>
                                                  <Mail className="h-4 w-4" />
                                                </a>
                                              </Button>
                                            ) : null}
                                          </div>
                                        </td>
                                      </tr>
                                      {emailData && (
                                        <tr key={`email-${index}`} className="bg-muted/30">
                                          <td colSpan={8} className="px-4 py-3">
                                            <div className="space-y-2">
                                              <button
                                                onClick={() => setExpandedEmail(expandedEmail === index ? null : index)}
                                                className="text-sm text-[#3B82F6] hover:underline flex items-center gap-1"
                                              >
                                                {expandedEmail === index ? (
                                                  <>
                                                    <ChevronUp className="h-4 w-4" />
                                                    Hide email preview
                                                  </>
                                                ) : (
                                                  <>
                                                    <ChevronDown className="h-4 w-4" />
                                                    Preview email
                                                  </>
                                                )}
                                              </button>
                                              
                                              {expandedEmail === index && (
                                                <div className="mt-2 p-3 bg-background rounded-[3px] border border-border text-sm">
                                                  <p className="font-medium text-foreground mb-2">Subject: {emailData.subject}</p>
                                                  <div className="text-muted-foreground whitespace-pre-wrap">
                                                    {emailData.plain_body}
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      </div>
                    </GlassCard>
                  </TabsContent>
                </Tabs>
              </div>
            ) : (
              // Original Job Board View
              <div className="w-full p-6 min-w-0 space-y-6">
                {/* JOBS TAB CONTENT */}
                {activeTab === "jobs" && (
                  <div className="space-y-6">
                  {/* No-resume banner */}
                  {feedData?.no_resume && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-[3px] p-4 flex items-center gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                          Upload your resume to get AI-ranked job matches
                        </p>
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                          We'll match jobs to your skills, major, and experience.
                        </p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => navigate("/resume")} className="border-amber-300 text-amber-700 hover:bg-amber-100">
                        Upload Resume
                      </Button>
                    </div>
                  )}

                  {/* Filters */}
                  <GlassCard className="p-4">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Search jobs by title or company..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                          className="pl-10"
                        />
                      </div>
                      <Select value={selectedJobType} onValueChange={setSelectedJobType}>
                        <SelectTrigger className="w-full sm:w-40">
                          <SelectValue placeholder="Job Type" />
                        </SelectTrigger>
                        <SelectContent>
                          {JOB_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                        <SelectTrigger className="w-full sm:w-44">
                          <SelectValue placeholder="Field" />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={sortBy} onValueChange={(value) => setSortBy(value as "match" | "date" | "company")}>
                        <SelectTrigger className="w-full sm:w-40">
                          <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="match">Best Match</SelectItem>
                          <SelectItem value="date">Most Recent</SelectItem>
                          <SelectItem value="company">Company A-Z</SelectItem>
                        </SelectContent>
                      </Select>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" onClick={handleRefreshJobs} disabled={loadingJobs}>
                              <RefreshCw className={cn("w-4 h-4", loadingJobs && "animate-spin")} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Refresh jobs</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </GlassCard>

                  {/* New Matches - compact horizontal scroll rail */}
                  {filteredNewMatches.length > 0 && (
                    <div>
                      <h2 className="text-lg font-semibold text-foreground mb-3">New Matches</h2>
                      <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-thin">
                        {newMatchesLegacyJobs.map(({ feed: job, legacy: legacyJob }) => (
                            <div key={job.job_id} className="flex-shrink-0 w-52" onClick={() => openJobDetail(job)}>
                              <GlassCard className="p-3 hover:scale-[1.02] transition-transform cursor-pointer h-full flex flex-col">
                                {/* Top row: logo + match score */}
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  {job.employer_logo ? (
                                    <img src={job.employer_logo} alt={job.company} className="w-8 h-8 rounded-md object-cover bg-muted flex-shrink-0" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-md bg-[#EFF6FF] flex items-center justify-center flex-shrink-0">
                                      <Building2 className="w-4 h-4 text-primary" />
                                    </div>
                                  )}
                                  {feedData?.ranked && job.match_score != null && (
                                    <span className={cn(
                                      "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                                      job.match_score >= 80 ? "text-green-700 bg-green-100" :
                                      job.match_score >= 60 ? "text-blue-700 bg-blue-100" :
                                      job.match_score >= 40 ? "text-yellow-700 bg-yellow-100" :
                                      "text-gray-600 bg-gray-100"
                                    )}>
                                      {Math.round(job.match_score)}%
                                    </span>
                                  )}
                                </div>

                                {/* Title + company + location */}
                                <h3 className="font-semibold text-sm text-foreground truncate leading-snug">{job.title}</h3>
                                <p className="text-xs text-muted-foreground truncate mt-0.5">{job.company}</p>
                                <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5 flex items-center gap-0.5">
                                  <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                                  {normalizeLocation(job.location)}
                                </p>

                                {/* Type badge */}
                                <div className="mt-2">
                                  <Badge variant={job.type === "INTERNSHIP" ? "default" : "outline"} className="text-[10px] px-1.5 py-0">
                                    {TYPE_DISPLAY[job.type] || job.type}
                                  </Badge>
                                </div>

                                {/* Buttons */}
                                <div className="flex gap-1.5 mt-auto pt-2.5">
                                  <Button variant="outline" size="sm" className="flex-1 h-7 text-[11px] px-1" onClick={(e) => { e.stopPropagation(); const role = simplifyTitle(job.title); navigate(`/find?company=${encodeURIComponent(job.company)}&role=${encodeURIComponent(role)}`); }}>
                                    <Users className="w-3 h-3 mr-0.5" />
                                    Contact
                                  </Button>
                                  <Button variant="gradient" size="sm" className="flex-1 h-7 text-[11px] px-1" onClick={(e) => { e.stopPropagation(); handleApplyToJob(legacyJob); }}>
                                    Apply
                                  </Button>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full h-6 text-[10px] mt-1.5 px-1"
                                  disabled={findHumansOpen && findHumansJob?.id === job.job_id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openFindHumans({
                                      id: job.job_id,
                                      title: job.title,
                                      company: job.company,
                                      location: job.location,
                                      description: legacyJob.description,
                                      url: job.apply_url || legacyJob.url,
                                    });
                                  }}
                                >
                                  {findHumansOpen && findHumansJob?.id === job.job_id ? (
                                    <Loader2 className="w-2.5 h-2.5 mr-0.5 animate-spin" />
                                  ) : (
                                    <Users className="w-2.5 h-2.5 mr-0.5" />
                                  )}
                                  Find the Humans
                                </Button>
                              </GlassCard>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Top Jobs Grid */}
                  <div>
                    <h2 className="text-lg font-semibold text-foreground mb-3">
                      {feedData?.ranked ? "Top Jobs for You" : "Recent Jobs"}
                    </h2>

                  {loadingJobs ? (
                    <JobBoardSkeleton />
                  ) : sortedFeedJobs.length === 0 ? (
                    <EmptyState
                      icon={<Briefcase className="w-8 h-8 text-primary" />}
                      title="No jobs found"
                      description="Try adjusting your filters or search query."
                      action={
                        <Button variant="gradient" onClick={() => { setSearchQuery(""); setSelectedJobType("all"); setSelectedCategory("all"); }}>
                          Clear Filters
                        </Button>
                      }
                    />
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground mb-3">
                        Showing {(currentPage - 1) * JOBS_PER_PAGE + 1}-
                        {Math.min(currentPage * JOBS_PER_PAGE, sortedFeedJobs.length)} of {sortedFeedJobs.length} jobs
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {paginatedLegacyJobs.map(({ feed: job, legacy: legacyJob }) => (
                          <JobCard
                            key={job.job_id}
                            job={{
                              ...legacyJob,
                              posted: formatRelativeTime(job.posted_at),
                              matchScore: feedData?.ranked ? (job.match_score ?? undefined) : undefined,
                            }}
                            isSelected={selectedJob?.id === job.job_id}
                            isSaved={savedJobs.has(job.job_id)}
                            onCardClick={() => openJobDetail(job)}
                            onSelect={() => {
                              const role = simplifyTitle(legacyJob.title);
                              navigate(`/find?company=${encodeURIComponent(legacyJob.company)}&role=${encodeURIComponent(role)}`);
                            }}
                            onSave={() => handleSaveJob(job.job_id)}
                            onApply={() => handleApplyToJob(legacyJob)}
                            onFindHiringManager={() => {
                              openFindHumans({
                                id: job.job_id,
                                title: legacyJob.title,
                                company: legacyJob.company,
                                location: legacyJob.location,
                                description: legacyJob.description,
                                url: legacyJob.url,
                              });
                            }}
                            findHumansEnabled
                            findHumansPending={findHumansOpen && findHumansJob?.id === job.job_id}
                          />
                        ))}
                      </div>

                      {/* Pagination */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 pt-6">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <span className="text-sm text-muted-foreground">
                            Page {currentPage} of {totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                  </div>
                  </div>
                )}

                {/* RECRUITER SEARCH TAB CONTENT */}
                {activeTab === "recruiter-search" && (
                  <div className="space-y-6 max-w-4xl mx-auto">
                    {/* Job Input Card */}
                    <GlassCard className="p-6">
                      <div className="space-y-6">
                              <div>
                          <h2 className="text-2xl font-bold text-foreground mb-2">
                            Recruiter Search
                          </h2>
                          <p className="text-muted-foreground">
                            Paste a job URL or job description to find recruiters, optimize your resume, and generate a cover letter.
                                </p>
                              </div>

                        {/* Job URL Input */}
                          <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            Job URL (Optional)
                        </label>
                              <Input
                            placeholder="https://jobs.company.com/position/123"
                                value={jobUrl}
                            onChange={(e) => setJobUrl(e.target.value)}
                            className="w-full"
                              />
                          </div>

                        {/* Job Description Textarea */}
                          <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            Job Description
                        </label>
                            <Textarea
                            placeholder="Paste the job description here..."
                              value={jobDescription}
                            onChange={(e) => setJobDescription(e.target.value)}
                            className="w-full min-h-[200px]"
                          />
                          <p className="text-xs text-muted-foreground mt-2">
                            Provide either a job URL or job description (or both) to get started.
                          </p>
                        </div>

                        {/* Action Buttons */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button
                                    variant="gradient"
                                    size="lg"
                                  onClick={handleFindRecruiter}
                                    disabled={recruitersLoading || (user?.credits ?? 0) < 5 || (!jobUrl.trim() && !jobDescription.trim())}
                                    className="w-full relative overflow-hidden"
                                  >
                                    <Users className="h-5 w-5 mr-2" />
                                    Find Recruiters
                                  <InlineLoadingBar isLoading={recruitersLoading} />
                                </Button>
                              </span>
                            </TooltipTrigger>
                              {(!jobUrl.trim() && !jobDescription.trim()) && (
                              <TooltipContent>
                                  <p>Please provide a job URL or job description first</p>
                              </TooltipContent>
                              )}
                              {(user?.credits ?? 0) < 5 && (
                              <TooltipContent>
                                <p>You need at least 5 credits. You have {user?.credits ?? 0}.</p>
                              </TooltipContent>
                              )}
                          </Tooltip>
                        </TooltipProvider>

                          <Button
                            variant="gradient"
                            size="lg"
                            onClick={() => {
                              setShowOptimizationModal(true);
                            }}
                            disabled={isOptimizing || (user?.credits ?? 0) < OPTIMIZATION_CREDIT_COST || (!jobUrl.trim() && !jobDescription.trim())}
                            className="w-full relative overflow-hidden"
                          >
                            <FileCheck className="h-5 w-5 mr-2" />
                            Optimize Resume
                            <InlineLoadingBar isLoading={isOptimizing} />
                          </Button>

                          <Button
                            variant="outline"
                            size="lg"
                        onClick={handleGenerateCoverLetter}
                            disabled={isGeneratingCoverLetter || (user?.credits ?? 0) < COVER_LETTER_CREDIT_COST || (!jobUrl.trim() && !jobDescription.trim())}
                            className="w-full relative overflow-hidden"
                          >
                            <FileText className="h-5 w-5 mr-2" />
                            Generate Cover Letter
                        <InlineLoadingBar isLoading={isGeneratingCoverLetter} />
                          </Button>
                    </div>
                        
                        {/* Number of Recruiters Selector */}
                        {hasJobInfo && (
                          <div className="flex items-center gap-3 pt-2 border-t border-border">
                            <label className="text-sm text-foreground flex items-center gap-2">
                              Number of recruiters to find:
                              <Select
                                value={maxRecruitersRequested.toString()}
                                onValueChange={(value) => setMaxRecruitersRequested(parseInt(value))}
                                disabled={recruitersLoading}
                              >
                                <SelectTrigger className="w-20 h-8 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {[1, 2, 3, 4, 5].map((num) => (
                                    <SelectItem key={num} value={num.toString()}>
                                      {num}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </label>
                            </div>
                          )}
                          </div>
                    </GlassCard>

                    {/* Error Display */}
                    {recruitersError && (
                      <div className="bg-destructive/10 border border-destructive text-destructive px-6 py-3 rounded-[3px]">
                        {recruitersError}
                            </div>
                    )}
                      
                      {/* Show drafts created notification */}
                      {draftsCreated.length > 0 && (
                      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-[3px] p-4">
                          <div className="flex items-center gap-2">
                            <Mail className="h-5 w-5 text-green-600" />
                            <div className="flex-1">
                              <p className="text-sm text-green-800 dark:text-green-200 font-medium">
                                {draftsCreated.length} email draft{draftsCreated.length > 1 ? 's' : ''} created in your Gmail!
                              </p>
                              <div className="flex items-center gap-3 mt-1">
                                <a
                                  href="https://mail.google.com/mail/u/0/#drafts"
                                  target="_blank"
                                  rel="noopener,noreferrer"
                                  className="text-sm text-green-600 dark:text-green-400 hover:underline inline-block"
                                >
                                  Open Gmail Drafts →
                                </a>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => navigate('/tracker')}
                                  className="text-xs h-7 border-green-300 text-green-700 hover:bg-green-50"
                                >
                                  <Mail className="w-3 h-3 mr-1" />
                                  View in Tracker
                                  <ArrowRight className="w-3 h-3 ml-1" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                    {/* Recruiters Table */}
                    {recruiters.length > 0 && (
                      <GlassCard className="p-0 overflow-hidden">
                        <div className="bg-background border-b border-border/40 px-6 py-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="text-xl font-bold flex items-center gap-2 text-foreground">
                                <Users className="w-6 h-6 text-primary" />
                                Found {recruiters.length} Recruiter{recruiters.length !== 1 ? 's' : ''}
                              </h3>
                              <p className="text-sm text-muted-foreground mt-1">
                                These recruiters have been automatically saved to your Recruiter Spreadsheet
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setActiveTab("recruiters")}
                                className="text-xs"
                              >
                                <Users className="w-3.5 h-3.5 mr-1.5" />
                                View Recruiter Spreadsheet
                                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                              </Button>
                              {draftsCreated.length > 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => navigate('/tracker')}
                                  className="text-xs"
                                >
                                  <Mail className="w-3.5 h-3.5 mr-1.5" />
                                  View in Tracker
                                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      <div className="w-full overflow-x-auto">
                        <div className="rounded-md border border-border bg-background/60 backdrop-blur-sm min-w-full">
                          <table className="w-full">
                            <thead className="bg-muted/50 sticky top-0 z-10">
                              <tr>
                                <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">First Name</th>
                                <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Name</th>
                                <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">LinkedIn</th>
                                <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</th>
                                <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Title</th>
                                <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Company</th>
                                <th className="px-4 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="bg-background divide-y divide-border">
                              {recruiters.map((recruiter, index) => {
                                const emailData = recruiterEmails.find(e => e.to_email === recruiter.Email);
                                const draftData = draftsCreated.find(d => d.recruiter_email === recruiter.Email);
                                
                                return (
                                  <React.Fragment key={index}>
                                    <tr className="hover:bg-secondary/50">
                                      <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">{recruiter.FirstName}</td>
                                      <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">{recruiter.LastName}</td>
                                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                                        {recruiter.LinkedIn ? (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => window.open(normalizeLinkedInUrl(recruiter.LinkedIn), '_blank', 'noopener,noreferrer')}
                                            className="p-1 h-auto text-primary hover:text-primary/80 cursor-pointer"
                                            title="View LinkedIn"
                                          >
                                            <ExternalLink className="h-4 w-4 mr-1" />
                                            LinkedIn
                                          </Button>
                                        ) : (
                                          <span className="text-muted-foreground text-xs">No LinkedIn</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">
                                        {recruiter.Email && recruiter.Email !== "Not available" ? (
                                          <a href={`mailto:${recruiter.Email}`} className="text-primary hover:underline">
                                            {recruiter.Email}
                                          </a>
                                        ) : (
                                          <span className="text-muted-foreground text-xs">Not available</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">{recruiter.Title}</td>
                                      <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">{recruiter.Company}</td>
                                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                                        <div className="flex gap-2">
                                          {recruiter.LinkedIn && (
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => window.open(normalizeLinkedInUrl(recruiter.LinkedIn), '_blank', 'noopener,noreferrer')}
                                              className="h-8 w-8"
                                              title="View LinkedIn"
                                            >
                                              <Linkedin className="h-4 w-4" />
                                            </Button>
                                          )}
                                          {draftData?.draft_url ? (
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => window.open(draftData.draft_url, '_blank')}
                                              className="h-8 w-8 text-green-600 hover:text-green-700"
                                              title="Open Email Draft"
                                            >
                                              <Mail className="h-4 w-4" />
                                            </Button>
                                          ) : recruiter.Email && recruiter.Email !== "Not available" ? (
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              asChild
                                              className="h-8 w-8"
                                              title="Send Email"
                                            >
                                              <a href={`mailto:${recruiter.Email}`}>
                                                <Mail className="h-4 w-4" />
                                              </a>
                                            </Button>
                                          ) : null}
                                        </div>
                                      </td>
                                    </tr>
                                    {emailData && (
                                      <tr key={`email-${index}`} className="bg-muted/30">
                                          <td colSpan={7} className="px-4 py-3">
                                          <div className="space-y-2">
                                            <button
                                              onClick={() => setExpandedEmail(expandedEmail === index ? null : index)}
                                              className="text-sm text-[#3B82F6] hover:underline flex items-center gap-1"
                                            >
                                              {expandedEmail === index ? (
                                                <>
                                                  <ChevronUp className="h-4 w-4" />
                                                  Hide email preview
                                                </>
                                              ) : (
                                                <>
                                                  <ChevronDown className="h-4 w-4" />
                                                  Preview email
                                                </>
                                              )}
                                            </button>
                                            
                                            {expandedEmail === index && (
                                              <div className="mt-2 p-3 bg-background rounded-[3px] border border-border text-sm">
                                                <p className="font-medium text-foreground mb-2">Subject: {emailData.subject}</p>
                                                <div className="text-muted-foreground whitespace-pre-wrap">
                                                  {emailData.plain_body}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        </div>
                      </GlassCard>
                    )}

                    {/* Cover Letter Display */}
                    {coverLetter && (
                      <GlassCard className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-xl font-bold text-foreground">Cover Letter</h3>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCopyToClipboard(coverLetter.content, "Cover Letter")}
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              Copy
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownload(coverLetter.content, "cover_letter.pdf")}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Download
                            </Button>
                                  </div>
                                </div>
                        <div className="bg-muted/50 rounded-[3px] border border-border p-4 max-h-96 overflow-y-auto">
                          <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                            {coverLetter.content}
                              </div>
                                  </div>
                      </GlassCard>
                    )}

                    {/* Optimized Resume Display */}
                    {optimizedResume && (
                      <GlassCard className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-xl font-bold text-foreground">Optimized Resume</h3>
                          <React.Suspense fallback={null}>
                            <ResumeActions
                              resumeData={optimizedResume}
                              resumeRef={resumeRef}
                            />
                          </React.Suspense>
                                </div>
                        {optimizedResume.atsScore && (
                          <div className="mb-4">
                            <ATSScoreDisplay score={optimizedResume.atsScore} />
                              </div>
                        )}
                        <div className="bg-muted/50 rounded-[3px] border border-border p-4 max-h-96 overflow-y-auto">
                          <React.Suspense fallback={<div className="animate-pulse h-48 bg-muted rounded" />}>
                            <ResumeRenderer resume={optimizedResume} />
                          </React.Suspense>
                                  </div>
                      </GlassCard>
                            )}
                          </div>
                        )}

                {/* RECRUITERS TAB CONTENT */}
                {activeTab === "recruiters" && (
                  <div className="w-full">
                    <React.Suspense fallback={<LoadingSkeleton />}>
                      <RecruiterSpreadsheet />
                    </React.Suspense>
                  </div>
                )}
                      </div>
                    )}
          </div>
        </div>
      </div>

      {/* Job Details Dialog */}
      <Dialog open={showJobDetails} onOpenChange={setShowJobDetails}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedJob?.title}</DialogTitle>
            <DialogDescription>
              {selectedJob?.company} • {selectedJob?.location}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge>{selectedJob?.type}</Badge>
              {selectedJob?.remote && <Badge variant="outline">Remote</Badge>}
              {selectedJob?.salary && <Badge variant="outline">{selectedJob.salary}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedJob?.description}</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Resume Optimization V2 Modal */}
      <React.Suspense fallback={null}>
      <ResumeOptimizationModal
        isOpen={showOptimizationModal}
        onClose={() => setShowOptimizationModal(false)}
        jobDescription={selectedJob?.description || jobDescription || ''}
        jobTitle={selectedJob?.title || parsedJobData?.title || ''}
        company={selectedJob?.company || parsedJobData?.company || ''}
        jobUrl={selectedJob?.url || jobUrl || ''}
        onSuggestionsReceived={(result) => {
          setSuggestionsResult(result);
          setShowSuggestionsView(true);
          // Refresh credits display
          if (result.creditsRemaining !== undefined && user) {
            updateCredits(result.creditsRemaining);
          }
        }}
        onTemplateRebuildReceived={(result) => {
          setTemplateRebuildResult(result);
          // Handle template rebuild - convert to OptimizedResume format for existing display
          if (result.structured_content) {
            const convertedResume: OptimizedResume = {
              name: result.structured_content.contact?.name,
              contact: result.structured_content.contact,
              Summary: result.structured_content.summary,
              Experience: result.structured_content.experience,
              Education: result.structured_content.education,
              Skills: result.structured_content.skills,
              Projects: result.structured_content.projects,
              atsScore: {
                overall: result.ats_score_estimate || 0,
                keywords: 0,
                formatting: 0,
                relevance: 0,
                suggestions: [],
              },
              keywordsAdded: result.keywords_added || [],
              sectionsOptimized: [],
            };
            setOptimizedResume(convertedResume);
          }
          // Refresh credits display
          if (result.creditsRemaining !== undefined && user) {
            updateCredits(result.creditsRemaining);
          }
        }}
      />
      </React.Suspense>

      {/* Suggestions View Modal */}
      {suggestionsResult && (
        <React.Suspense fallback={null}>
          <SuggestionsView
            result={suggestionsResult}
            isOpen={showSuggestionsView}
            onClose={() => {
              setShowSuggestionsView(false);
            }}
          />
        </React.Suspense>
      )}

      {/* Find the Humans Modal */}
      <FindHumansModal
        open={findHumansOpen}
        onOpenChange={setFindHumansOpen}
        job={findHumansJob}
      />

      {/* Job Detail Modal - full-screen takeover */}
      {detailSheetOpen && detailSheetJob && (() => {
        const job = detailSheetJob;
        const legacyJob = feedJobToLegacy(job);
        const scoreColor = (s: number) => s >= 80 ? "text-green-600" : s >= 60 ? "text-blue-600" : s >= 40 ? "text-yellow-600" : "text-muted-foreground";
        const barColor = (s: number) => s >= 80 ? "bg-green-500" : s >= 60 ? "bg-blue-500" : s >= 40 ? "bg-yellow-500" : "bg-gray-400";
        return (
          <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
            {/* Content column */}
            <div className="px-6 py-8 sm:px-10 sm:py-10">

              {/* Back button */}
              <button
                onClick={() => setDetailSheetOpen(false)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-10 -ml-1"
              >
                <ChevronLeft className="w-4 h-4" />
                Back to Jobs
              </button>

              {/* Company logo + name */}
              <div className="flex items-center gap-3 mb-5">
                {job.employer_logo ? (
                  <img src={job.employer_logo} alt={job.company} className="w-12 h-12 rounded-lg object-cover bg-muted flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-[#EFF6FF] flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-6 h-6 text-primary/60" />
                  </div>
                )}
                <span className="text-sm text-muted-foreground font-medium">{job.company}</span>
              </div>

              {/* Job title */}
              <h1 className="text-2xl sm:text-[28px] font-bold text-foreground leading-tight mb-5">{job.title}</h1>

              {/* Badges row */}
              <div className="flex flex-wrap items-center gap-2 mb-6">
                <Badge variant="secondary" className="text-xs px-2.5 py-1">
                  <MapPin className="w-3 h-3 mr-1.5" />
                  {normalizeLocation(job.location)}
                </Badge>
                <Badge variant={job.type === "INTERNSHIP" ? "default" : "outline"} className="text-xs px-2.5 py-1">
                  {TYPE_DISPLAY[job.type] || job.type}
                </Badge>
                {job.remote && (
                  <Badge variant="outline" className="text-xs px-2.5 py-1 text-green-600 border-green-200">Remote</Badge>
                )}
                {job.salary_display && (
                  <Badge variant="outline" className="text-xs px-2.5 py-1">
                    <DollarSign className="w-3 h-3 mr-1" />
                    {job.salary_display}
                  </Badge>
                )}
              </div>

              {/* Match score */}
              {feedData?.ranked && job.match_score != null && (
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-1.5">
                    <div className="h-2.5 w-48 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", barColor(job.match_score))}
                        style={{ width: `${Math.min(job.match_score, 100)}%` }}
                      />
                    </div>
                    <span className={cn("text-sm font-semibold", scoreColor(job.match_score))}>
                      {Math.round(job.match_score)}% Match
                    </span>
                  </div>
                  {job.match_reason && (
                    <p className="text-sm italic text-muted-foreground">{job.match_reason}</p>
                  )}
                </div>
              )}

              {/* Posted date */}
              <p className="text-sm text-muted-foreground mb-8">
                <Clock className="w-3.5 h-3.5 inline mr-1.5 -translate-y-px" />
                Posted {formatRelativeTime(job.posted_at)}
              </p>

              {/* Divider */}
              <div className="border-t border-border/60 mb-8" />

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-3 mb-10">
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1 h-11"
                  onClick={() => {
                    setDetailSheetOpen(false);
                    const role = simplifyTitle(job.title);
                    navigate(`/find?company=${encodeURIComponent(job.company)}&role=${encodeURIComponent(role)}`);
                  }}
                >
                  <Users className="w-4 h-4 mr-2" />
                  Find Contact
                </Button>
                <Button
                  variant="gradient"
                  size="lg"
                  className="flex-1 h-11"
                  onClick={() => {
                    setDetailSheetOpen(false);
                    handleApplyToJob(legacyJob);
                  }}
                >
                  Apply
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1 h-11"
                  disabled={findHumansOpen && findHumansJob?.id === job.job_id}
                  onClick={() => {
                    setDetailSheetOpen(false);
                    openFindHumans({
                      id: job.job_id,
                      title: job.title,
                      company: job.company,
                      location: job.location,
                      description: detailDescription || undefined,
                      url: job.apply_url,
                    });
                  }}
                >
                  {findHumansOpen && findHumansJob?.id === job.job_id ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Users className="w-4 h-4 mr-2" />
                  )}
                  Find the Humans • 5 credits
                </Button>
              </div>

              {/* Description */}
              {detailLoading ? (
                <div className="space-y-4">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="h-4 bg-muted rounded animate-pulse" style={{ width: `${90 - i * 7}%` }} />
                  ))}
                </div>
              ) : detailDescription ? (
                <div className="pb-16">
                  <h2 className="text-lg font-semibold text-foreground mb-5">About this role</h2>
                  <div className="text-[15px] text-muted-foreground" style={{ lineHeight: 1.75 }}>
                    {cleanDescription(detailDescription).map((paragraph, i) => (
                      <p key={i} className="mb-4">{paragraph}</p>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No description available.</p>
              )}
            </div>
          </div>
        );
      })()}
    </SidebarProvider>
  );
};

export default JobBoardPage;