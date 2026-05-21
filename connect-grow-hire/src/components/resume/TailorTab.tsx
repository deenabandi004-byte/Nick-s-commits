/**
 * Tailor tab: job URL/description input, tailor API, results, Save to Library, Use as Main.
 * Used inside ResumePage. Needs resumeData for applying tailor and Use as Main.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  Code,
  FolderOpen,
  Search,
  Layout,
  Target,
  CheckCircle,
  XCircle,
  AlertCircle,
  Lightbulb,
  Check,
  X,
  ArrowRight,
  BarChart3,
  Eye,
  BookOpen,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  tailorResume,
  getResumeLibrary,
  saveToResumeLibrary,
  type JobContext,
  type TailorResult,
  type KeywordAnalysis,
} from '@/services/resumeWorkshop';
import { auth } from '@/lib/firebase';
import type { ParsedResume } from '@/types/resume';
import { generateResumePDF } from '@/utils/resumePDFGenerator';
import { applyTailorToParsedResume } from '@/utils/applyTailorToResume';
import { getResumePdfFilename } from '@/utils/resumeFilename';

import { BACKEND_URL as API_BASE_URL } from '@/services/api';

/** Map JSON skill keys to the actual label text in the PDF (ResumePDF / user-uploaded). */
const SKILL_KEY_TO_PDF_LABEL: Record<string, string> = {
  programming_languages: 'Programming',
  tools_frameworks: 'Tools & Frameworks',
  databases: 'Databases',
  cloud_devops: 'Cloud & DevOps',
  core_skills: 'Core Skills',
  soft_skills: 'Soft Skills',
  languages: 'Languages',
};

export type PatchItem = {
  type: 'bullet_rewrite' | 'skill_append';
  original_text: string;
  replacement_text: string;
};

/** Build patches array from accepted recommendations (excludes Summary - handled in JSON only). */
function buildPatchesFromAccepted(
  acceptedRecs: Recommendation[],
  resumeData: ParsedResume | null
): PatchItem[] {
  console.log('[Patch] buildPatchesFromAccepted called, acceptedRecs:', acceptedRecs);
  const patches: PatchItem[] = [];
  const skillAppendsByOriginal = new Map<string, string[]>();

  for (const rec of acceptedRecs) {
    if (rec.category === 'Summary') continue; // Skip - handled in editor/JSON only
    if (rec.category === 'Experience') {
      if (!rec.suggested?.trim()) continue;
      // Resolve original_text: rec.current may be empty when API returns bullets as plain strings
      let originalText = rec.current?.trim();
      if (!originalText && rec.id.startsWith('exp-') && resumeData?.experience) {
        const match = rec.id.match(/^exp-(\d+)-(\d+)$/);
        if (match) {
          const expIndex = parseInt(match[1], 10);
          const bulletIndex = parseInt(match[2], 10);
          const exp = resumeData.experience[expIndex];
          const bullet = exp?.bullets?.[bulletIndex];
          if (typeof bullet === 'string') originalText = bullet.trim();
        }
      }
      if (originalText && rec.suggested) {
        patches.push({
          type: 'bullet_rewrite',
          original_text: originalText,
          replacement_text: rec.suggested,
        });
      }
    } else if (rec.category === 'Skills' && rec.id.startsWith('skill-add-')) {
      // skill_append: need original skills line from resume - use PDF display label, not JSON key
      const skillName = rec.suggested?.trim();
      if (!skillName) continue;
      const skills = resumeData?.skills;
      if (!skills) continue;
      const coreVals = skills.core_skills;
      const entry =
        Array.isArray(coreVals) && coreVals.length > 0
          ? (['core_skills', coreVals] as const)
          : Object.entries(skills).find(([, vals]) => Array.isArray(vals) && vals.length > 0);
      if (entry) {
        const [cat, vals] = entry;
        const displayLabel = SKILL_KEY_TO_PDF_LABEL[cat] ?? cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        const original = `${displayLabel}: ${vals.join(', ')}`;
        const existing = skillAppendsByOriginal.get(original) ?? [];
        if (!existing.includes(skillName)) existing.push(skillName);
        skillAppendsByOriginal.set(original, existing);
      }
    }
    // Skip: Keywords, Formatting, Projects (complex PDF matching)
  }

  // Merge skill_append patches targeting the same line into one (avoids garbled overlapping text)
  for (const [original, skillsToAdd] of skillAppendsByOriginal) {
    const replacement = `${original}${original.endsWith(',') ? '' : ','} ${skillsToAdd.join(', ')}`;
    patches.push({ type: 'skill_append', original_text: original, replacement_text: replacement });
  }

  return patches;
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  category: string;
  current: string;
  suggested: string;
  why?: string;
  priority?: 'high' | 'medium' | 'low';
  is_learnable_gap?: boolean;
}

const roleTypeBadgeStyles: Record<string, string> = {
  TECH: 'bg-[#FAFBFF] text-[#0F172A] border-[#E2E8F0]',
  CONSULTING: 'bg-violet-50 text-violet-700 border-violet-200',
  FINANCE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  DATA_SCIENCE: 'bg-amber-50 text-amber-700 border-amber-200',
  PRODUCT_MANAGEMENT: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  GENERAL: 'bg-gray-50 text-gray-600 border-gray-200',
};

const roleTypeColors = roleTypeBadgeStyles;

const scoreColor = (score: number) => {
  if (score >= 85) return 'text-green-600';
  if (score >= 70) return 'text-amber-600';
  if (score >= 55) return 'text-amber-500';
  return 'text-red-500';
};

const scoreBgColor = (score: number) => {
  if (score >= 85) return 'bg-green-50';
  if (score >= 70) return 'bg-amber-50';
  if (score >= 55) return 'bg-amber-50';
  return 'bg-red-50';
};

const priorityBadgeStyles: Record<string, string> = {
  high: 'bg-red-50 text-red-600 border border-red-100',
  medium: 'bg-amber-50 text-amber-600 border border-amber-100',
  low: 'bg-gray-50 text-gray-500 border border-gray-100',
};
const priorityBadge: Record<string, string> = priorityBadgeStyles;

function convertSectionsToRecommendations(tailorResult: TailorResult): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const sections = tailorResult.sections || {};
  console.log('[Tailor DEBUG] convertSectionsToRecommendations called with sections:', Object.keys(sections || {}));
  console.log('[Tailor DEBUG] experience exists?', !!sections?.experience);
  console.log('[Tailor DEBUG] experience length:', sections?.experience?.length);
  if (sections?.experience?.[0]) {
    console.log('[Tailor DEBUG] first entry keys:', Object.keys(sections.experience[0]));
    console.log('[Tailor DEBUG] first entry bullets type:', typeof sections.experience[0].bullets);
    console.log('[Tailor DEBUG] first entry bullets is array:', Array.isArray(sections.experience[0].bullets));
    if (Array.isArray(sections.experience[0].bullets) && sections.experience[0].bullets.length > 0) {
      console.log('[Tailor DEBUG] first bullet type:', typeof sections.experience[0].bullets[0]);
      console.log('[Tailor DEBUG] first bullet value:', sections.experience[0].bullets[0]);
    }
  }
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.log('[Tailor] Full sections object:', JSON.stringify(sections, null, 2));
  }
  const summary = sections.summary;
  if (summary?.suggested && summary.current !== summary.suggested) {
    recommendations.push({
      id: 'summary',
      title: 'Update Professional Summary',
      description: summary.why || 'Tailor your summary.',
      category: 'Summary',
      current: summary.current || 'No summary found',
      suggested: summary.suggested,
      why: summary.why,
      priority: (summary as { priority?: string }).priority as 'high' | 'medium' | 'low' | undefined,
    });
  }
  const experienceEntries = sections.experience || [];
  if (experienceEntries.length > 0) {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.log('[Tailor] Raw experience from API:', JSON.stringify(experienceEntries, null, 2));
    }
  }
  for (let expIndex = 0; expIndex < experienceEntries.length; expIndex++) {
    const entry = experienceEntries[expIndex];
    const bullets = Array.isArray(entry.bullets)
      ? entry.bullets
      : entry.current != null || entry.suggested != null
        ? [entry]
        : [];
    for (let bulletIndex = 0; bulletIndex < bullets.length; bulletIndex++) {
      const bullet = bullets[bulletIndex];
      // MUST check string first - model sometimes returns bullets as plain strings
      if (typeof bullet === 'string') {
        recommendations.push({
          id: `exp-${expIndex}-${bulletIndex}`,
          title: `Improve ${entry.role || entry.title || 'Role'} @ ${entry.company || 'Company'}`,
          description: 'Suggested improvement for this bullet point.',
          category: 'Experience',
          current: '',
          suggested: bullet,
          why: 'Suggested improvement for this bullet point.',
          priority: 'medium',
        });
        continue;
      }
      // Bullet is an object: must have suggested or current to show
      if (bullet && typeof bullet === 'object' && (bullet.suggested != null || bullet.current != null)) {
        const hasSuggestion = bullet.suggested != null && String(bullet.suggested).trim() !== '';
        if (hasSuggestion || bullet.current) {
          recommendations.push({
            id: `exp-${expIndex}-${bulletIndex}`,
            title: `Improve ${entry.role || entry.title || 'Role'} @ ${entry.company || 'Company'}`,
            description: bullet.why || 'Strengthen this bullet.',
            category: 'Experience',
            current: bullet.current ?? '',
            suggested: bullet.suggested ?? '',
            why: bullet.why,
            priority: (bullet.priority as 'high' | 'medium' | 'low') || 'medium',
          });
        }
      }
    }
  }
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.log('[Tailor] Flattened experience recs:', recommendations.filter((r) => r.category === 'Experience').length);
  }
  const skillsAdd = sections.skills?.add;
  if (skillsAdd && Array.isArray(skillsAdd)) {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.log('[Tailor] Skills.add from API:', skillsAdd);
    }
  }
  (skillsAdd || []).forEach((s: any, index: number) => {
    const skillName = s && (s.skill ?? s.name ?? s.keyword ?? '');
    if (!skillName) return;
    recommendations.push({
      id: `skill-add-${index}`,
      title: `Add Skill: ${skillName}`,
      description: s.reason ?? s.why ?? '',
      category: 'Skills',
      current: '',
      suggested: skillName,
      why: s.reason ?? s.why,
      priority: (s.priority as 'high' | 'medium' | 'low') || 'medium',
    });
  });
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.log('[Tailor] Skills recs built:', recommendations.filter((r) => r.category === 'Skills').length);
  }
  (sections.skills?.remove || []).forEach((s: any, index: number) => {
    recommendations.push({
      id: `skill-remove-${index}`,
      title: `Consider Removing: ${s.skill}`,
      description: s.reason,
      category: 'Skills',
      current: s.skill,
      suggested: '',
      why: s.reason,
    });
  });
  (sections.keywords || []).forEach((kw: any, index: number) => {
    recommendations.push({
      id: `keyword-${index}`,
      title: `Add Keyword: ${kw.keyword}`,
      description: kw.where_to_add,
      category: 'Keywords',
      current: '',
      suggested: kw.keyword,
      why: kw.where_to_add,
      priority: kw.priority as 'high' | 'medium' | 'low' | undefined,
      is_learnable_gap: kw.is_learnable_gap,
    });
  });
  (sections.projects || []).forEach((p: any, index: number) => {
    recommendations.push({
      id: `project-${index}`,
      title: `Project: ${p.name}`,
      description: p.why || 'Improve project description.',
      category: 'Projects',
      current: p.current || 'Not described',
      suggested: p.suggested || '',
      why: p.why,
      priority: p.priority as 'high' | 'medium' | 'low' | undefined,
    });
  });
  (sections.formatting || []).forEach((f: any, index: number) => {
    recommendations.push({
      id: `format-${index}`,
      title: f.issue,
      description: f.fix,
      category: 'Formatting',
      current: '',
      suggested: f.fix,
      why: f.fix,
      priority: f.priority as 'high' | 'medium' | 'low' | undefined,
    });
  });
  return recommendations;
}

/** Build a partial TailorResult containing only accepted suggestions (by recommendation id). */
function buildFilteredTailorResult(
  fullResult: TailorResult,
  acceptedIds: Set<string>,
  recommendations: Recommendation[]
): TailorResult {
  const filtered = JSON.parse(JSON.stringify(fullResult)) as TailorResult;
  if (!filtered.sections) return filtered;

  const summaryRec = recommendations.find((r) => r.category === 'Summary');
  if (summaryRec && !acceptedIds.has(summaryRec.id)) {
    delete filtered.sections.summary;
  }

  if (filtered.sections.experience?.length) {
    filtered.sections.experience = filtered.sections.experience
      .map((exp, expIndex) => {
        const bullets = (exp.bullets || []).map((bullet, bulletIndex) => {
          const recId = `exp-${expIndex}-${bulletIndex}`;
          const useSuggested = acceptedIds.has(recId);
          return {
            ...bullet,
            suggested: useSuggested ? (bullet.suggested || bullet.current || '').trim() : (bullet.current || '').trim(),
          };
        });
        return { ...exp, bullets };
      });
  }

  if (filtered.sections.skills) {
    const add = filtered.sections.skills.add || [];
    filtered.sections.skills.add = add.filter((_, i) => acceptedIds.has(`skill-add-${i}`));
    const remove = filtered.sections.skills.remove || [];
    filtered.sections.skills.remove = remove.filter((_, i) => acceptedIds.has(`skill-remove-${i}`));
  }

  if (filtered.sections.keywords) {
    filtered.sections.keywords = filtered.sections.keywords.filter((_, i) =>
      acceptedIds.has(`keyword-${i}`)
    );
  }

  if (filtered.sections.projects) {
    filtered.sections.projects = filtered.sections.projects.filter((_, i) =>
      acceptedIds.has(`project-${i}`)
    );
  }

  if (filtered.sections.formatting) {
    filtered.sections.formatting = filtered.sections.formatting.filter((_, i) =>
      acceptedIds.has(`format-${i}`)
    );
  }

  return filtered;
}

const SuggestionCard: React.FC<{
  rec: Recommendation;
  state: 'accepted' | 'rejected' | 'neutral';
  onAccept: () => void;
  onReject: () => void;
}> = ({ rec, state, onAccept, onReject }) => {
  const [expanded, setExpanded] = useState(false);
  const cardBorder: Record<string, string> = {
    accepted: 'border-l-4 border-l-green-500 bg-white',
    rejected: 'border-l-4 border-l-gray-300 bg-gray-50 opacity-60',
    neutral: 'border-l-4 border-l-transparent bg-white',
  };
  const copySuggested = () => {
    if (rec.suggested) {
      navigator.clipboard.writeText(rec.suggested);
      toast({ title: 'Copied to clipboard!', duration: 2000 });
    }
  };
  const priority = rec.priority || 'low';
  const hasComparison = !!(rec.current || rec.suggested);
  return (
    <div className={`rounded-2xl border border-gray-100 shadow-sm bg-white p-5 transition-all duration-200 ${cardBorder[state]}`}>
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => hasComparison && setExpanded(!expanded)}
          className={`flex items-center gap-2 flex-1 min-w-0 text-left ${hasComparison ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <span
            className={`shrink-0 inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${priorityBadgeStyles[priority]}`}
          >
            {priority}
          </span>
          {rec.is_learnable_gap && (
            <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#FAFBFF] text-[#3B82F6] border border-[#E2E8F0]">
              <BookOpen className="w-3 h-3" />
              Learning gap
            </span>
          )}
          <h4 className="text-sm font-medium text-gray-900 truncate">{rec.title}</h4>
          {hasComparison && (
            <ChevronDown className={`w-4 h-4 shrink-0 text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          )}
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAccept}
            className={state === 'accepted' ? 'bg-green-600 border-green-600 text-white hover:bg-green-700 hover:text-white' : 'text-[#3B82F6] border-[#3B82F6]/20 hover:bg-[#FAFBFF]'}
          >
            <Check className="w-3.5 h-3.5 mr-1" />
            {state === 'accepted' ? 'Accepted' : 'Accept'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReject}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-3.5 h-3.5 mr-1" />
            Skip
          </Button>
          {rec.suggested && (
            <Button type="button" variant="ghost" size="sm" onClick={copySuggested} className="text-gray-400 hover:text-gray-600 p-1">
              <Copy className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>
      {expanded && hasComparison && (
        <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
          {rec.current && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Current</span>
              </div>
              <div className="bg-[#FAFBFF] rounded-[3px] p-4 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                {rec.current}
              </div>
            </div>
          )}
          {rec.suggested && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Suggested</span>
              </div>
              <div className="bg-white border border-[#3B82F6]/10 rounded-[3px] p-4 text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">
                {rec.suggested}
              </div>
              {rec.why && <p className="text-xs text-gray-400 italic mt-2">{rec.why}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const CategorySection: React.FC<{
  category: string;
  icon: React.ComponentType<{ className?: string }>;
  recommendations: Recommendation[];
  suggestionStates: Record<string, 'accepted' | 'rejected' | 'neutral'>;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onAcceptAll: (category: string) => void;
  defaultOpen?: boolean;
}> = ({
  category,
  icon: Icon,
  recommendations,
  suggestionStates,
  onAccept,
  onReject,
  onAcceptAll,
  defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const acceptedInCategory = recommendations.filter((r) => suggestionStates[r.id] === 'accepted').length;
  const allAccepted = recommendations.length > 0 && acceptedInCategory === recommendations.length;
  const highCount = recommendations.filter((r) => r.priority === 'high').length;

  return (
    <div className="rounded-2xl border border-gray-100 shadow-sm bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition-colors text-left border-b border-gray-100 pb-3 mb-4"
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          <Icon className="w-4 h-4 text-gray-400 shrink-0" />
          <span className="text-base font-semibold text-gray-900">{category}</span>
          <span className="bg-[rgba(59,130,246,0.15)] text-[#3B82F6] text-xs font-medium px-2 py-0.5 rounded-full">
            {recommendations.length}
          </span>
          {highCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600 border border-red-100">
              {highCount} high
            </span>
          )}
          {acceptedInCategory > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-600 border border-green-100">
              {acceptedInCategory} accepted
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAcceptAll(category);
            }}
            className="text-sm text-[#3B82F6] font-medium hover:underline transition-colors"
          >
            {allAccepted ? 'Undo All' : 'Accept All'}
          </button>
          <ChevronDown className={`w-4 h-4 text-gray-300 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {isOpen && (
        <div className="p-5 space-y-4 bg-white">
          {recommendations.map((rec) => (
            <SuggestionCard
              key={rec.id}
              rec={rec}
              state={suggestionStates[rec.id] || 'neutral'}
              onAccept={() => onAccept(rec.id)}
              onReject={() => onReject(rec.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const CollapsibleSection: React.FC<{
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
}> = ({ title, icon: Icon, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-sm font-semibold text-gray-900 hover:bg-gray-50/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-gray-400" />
          {title}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
};

const TailorDashboard: React.FC<{
  result: TailorResult;
  projectedScore: number | null;
  projectedKeywordMatch: number | null;
  acceptedCount: number;
  totalCount: number;
  allRecommendations: Recommendation[];
  suggestionStates: Record<string, 'accepted' | 'rejected' | 'neutral'>;
  setSuggestionStates: React.Dispatch<React.SetStateAction<Record<string, 'accepted' | 'rejected' | 'neutral'>>>;
  onApply: () => void;
  onBack: () => void;
  tailorJobContext: JobContext | null;
}> = ({
  result,
  projectedScore,
  projectedKeywordMatch,
  acceptedCount,
  totalCount,
  allRecommendations,
  suggestionStates,
  setSuggestionStates,
  onApply,
  onBack,
  tailorJobContext,
}) => {
  const recs = allRecommendations || [];
  const roleTypeBadgeClass = roleTypeBadgeStyles[result.role_type || ''] || roleTypeBadgeStyles.GENERAL;
  return (
    <div className="mx-4 mt-4 mb-3 rounded-2xl border border-gray-100 shadow-sm bg-white overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2 mb-1">
          <button type="button" onClick={onBack} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            ← Back
          </button>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <h3 className="text-base font-semibold text-gray-900 truncate max-w-md">
            {tailorJobContext?.job_title || 'Job'} at {tailorJobContext?.company || 'Company'}
          </h3>
          {result.role_type_label && (
            <span className={`shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${roleTypeBadgeClass}`}>
              {result.role_type_label}
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-gray-100">
        <div className="px-4 py-3 text-center">
          <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">Match Score</div>
          <div className="flex items-center justify-center gap-1.5">
            <span className={`text-xl font-bold ${scoreColor(result.score)}`}>{result.score}</span>
            {projectedScore != null && projectedScore > result.score && (
              <>
                <ArrowRight className="w-3.5 h-3.5 text-gray-300" />
                <span className={`text-xl font-bold ${scoreColor(projectedScore)}`}>{projectedScore}</span>
              </>
            )}
          </div>
        </div>
        <div className="px-4 py-3 text-center">
          <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">Keywords</div>
          <div className="flex items-center justify-center gap-1.5">
            <span className="text-xl font-bold text-gray-700">{result.keyword_analysis?.match_percentage ?? 0}%</span>
            {projectedKeywordMatch != null && projectedKeywordMatch > (result.keyword_analysis?.match_percentage ?? 0) && (
              <>
                <ArrowRight className="w-3.5 h-3.5 text-gray-300" />
                <span className="text-xl font-bold text-green-600">{projectedKeywordMatch}%</span>
              </>
            )}
          </div>
        </div>
        <div className="px-4 py-3 text-center">
          <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">Accepted</div>
          <div className="text-xl font-bold text-gray-700">
            {acceptedCount}<span className="text-sm font-normal text-gray-400">/{totalCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const ScoreBreakdown: React.FC<{ breakdown: TailorResult['score_breakdown'] }> = ({ breakdown }) => {
  if (!breakdown || Object.keys(breakdown).length === 0) return null;
  const categories = [
    { key: 'hard_skill_match', label: 'Hard Skills', weight: 30 },
    { key: 'job_title_match', label: 'Job Title', weight: 15 },
    { key: 'keyword_coverage', label: 'Keywords', weight: 15 },
    { key: 'bullet_quality', label: 'Bullet Quality', weight: 15 },
    { key: 'section_structure', label: 'Sections', weight: 10 },
    { key: 'skills_section', label: 'Skills', weight: 10 },
    { key: 'formatting', label: 'Formatting', weight: 5 },
  ];
  return (
    <div className="space-y-3 pt-3">
      {categories.map(({ key, label, weight }) => {
        const item = breakdown[key as keyof typeof breakdown];
        if (!item) return null;
        const score = item.score;
        const barColor = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-amber-400' : 'bg-red-400';
        return (
          <div key={key}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-600">{label}</span>
              <span className="text-xs text-gray-400">{score}% · {weight}% weight</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
                style={{ width: `${score}%` }}
              />
            </div>
            {item.detail && (
              <p className="text-[11px] text-gray-400 mt-0.5">{item.detail}</p>
            )}
          </div>
        );
      })}
    </div>
  );
};

const KeywordAnalysisBlock: React.FC<{ analysis: KeywordAnalysis | undefined }> = ({ analysis }) => {
  if (!analysis) return null;
  const requiredPresent = analysis.required_present || [];
  const requiredMissing = analysis.required_missing || [];
  const preferredPresent = analysis.preferred_present || [];
  const preferredMissing = analysis.preferred_missing || [];
  return (
    <div className="pt-3 space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              analysis.match_percentage >= 70 ? 'bg-green-500' : analysis.match_percentage >= 50 ? 'bg-amber-400' : 'bg-red-400'
            }`}
            style={{ width: `${analysis.match_percentage}%` }}
          />
        </div>
        <span className="text-sm font-semibold text-gray-700 tabular-nums w-12 text-right">
          {analysis.match_percentage}%
        </span>
      </div>
      {(requiredPresent.length > 0 || requiredMissing.length > 0) && (
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Required</p>
          <div className="flex flex-wrap gap-1.5">
            {requiredPresent.map((kw) => (
              <span key={kw} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                <Check className="w-3 h-3" /> {kw}
              </span>
            ))}
            {requiredMissing.map((kw) => (
              <span key={kw} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-red-50 text-red-600 border border-red-200">
                <X className="w-3 h-3" /> {kw}
              </span>
            ))}
          </div>
        </div>
      )}
      {(preferredPresent.length > 0 || preferredMissing.length > 0) && (
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Preferred</p>
          <div className="flex flex-wrap gap-1.5">
            {preferredPresent.map((kw) => (
              <span key={kw} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                <Check className="w-3 h-3" /> {kw}
              </span>
            ))}
            {preferredMissing.map((kw) => (
              <span key={kw} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200">
                <AlertCircle className="w-3 h-3" /> {kw}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const RoleSpecificTipsBlock: React.FC<{ tips: string[]; roleType: string }> = ({ tips, roleType }) => {
  if (!tips || tips.length === 0) return null;
  return (
    <div className="bg-amber-50/50 border border-amber-200/50 rounded-2xl p-5">
      <h4 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-1.5">
        <Lightbulb className="w-4 h-4 text-amber-600" />
        Industry Tips
      </h4>
      <ul className="space-y-1.5">
        {tips.map((tip, i) => (
          <li key={i} className="text-sm text-amber-900/80 leading-relaxed flex gap-2">
            <span className="text-amber-400 mt-0.5">•</span>
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export interface TailorTabProps {
  uid: string;
  resumeData: ParsedResume | null;
  setResumeData: (data: ParsedResume) => void;
  onSwitchToEditor: () => void;
  loadLibrary: () => void;
  updateCredits?: (n: number) => Promise<void>;
  credits?: number;
  /** When tailor results have accepted suggestions, call with modified resume for PDF preview; call with null when no accepted. Fallback when patch-pdf not available. */
  onTailorPreviewData?: (data: ParsedResume | null) => void;
  /** Pass accepted count and whether preview is showing so parent can show banner. */
  onTailorPreviewState?: (state: { acceptedCount: number; isShowingPreview: boolean } | null) => void;
  /** When patch-pdf succeeds, pass the patched PDF URL for preview. */
  onTailorPatchedPdfUrl?: (url: string | null) => void;
  /** When patch-pdf returns unsafe/not_found patches, pass counts for warning banner. */
  onTailorPatchResult?: (result: { unsafeCount: number; notFoundCount: number } | null) => void;
}

export function TailorTab({
  uid,
  resumeData,
  setResumeData,
  onSwitchToEditor,
  loadLibrary,
  updateCredits,
  credits = 0,
  onTailorPreviewData,
  onTailorPreviewState,
  onTailorPatchedPdfUrl,
  onTailorPatchResult,
}: TailorTabProps) {
  const [jobUrl, setJobUrl] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  /** 'url' = paste job URL, 'paste' = paste full job description text */
  const [inputMode, setInputMode] = useState<'url' | 'paste'>('url');
  const [showManualInputs, setShowManualInputs] = useState(false);
  const [jobUrlError, setJobUrlError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** When backend returns insufficient_job_description we show this and switch to paste mode */
  const [insufficientJdMessage, setInsufficientJdMessage] = useState<string | null>(null);
  const [isTailoring, setIsTailoring] = useState(false);
  const [tailorScore, setTailorScore] = useState<number | null>(null);
  const [tailorScoreLabel, setTailorScoreLabel] = useState('');
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [tailorJobContext, setTailorJobContext] = useState<JobContext | null>(null);
  const [lastTailorResult, setLastTailorResult] = useState<TailorResult | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [isSavingTailorToLibrary, setIsSavingTailorToLibrary] = useState(false);
  const [isUsingTailorAsMain, setIsUsingTailorAsMain] = useState(false);

  const [suggestionStates, setSuggestionStates] = useState<Record<string, 'accepted' | 'rejected' | 'neutral'>>({});
  const [previewResumeData, setPreviewResumeData] = useState<ParsedResume | null>(null);
  const [projectedScore, setProjectedScore] = useState<number | null>(null);
  const [projectedKeywordMatch, setProjectedKeywordMatch] = useState<number | null>(null);
  const [isPreviewUpdating, setIsPreviewUpdating] = useState(false);

  const hasJobUrl = jobUrl.trim().length > 0;
  const hasJobDescription = jobDescription.trim().length > 0;
  const hasManualFields = jobTitle.trim() && locationInput.trim() && jobDescription.trim();
  const hasJobContext =
    hasJobUrl ||
    hasJobDescription ||
    hasManualFields;

  const normalizeJobUrl = (url: string) => {
    const u = url.trim();
    if (!u) return u;
    if (u.startsWith('http://') || u.startsWith('https://')) return u;
    return 'https://' + u;
  };
  const isValidUrl = (url: string) => {
    try {
      new URL(normalizeJobUrl(url || ''));
      return true;
    } catch {
      return false;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  const acceptedCount = Object.values(suggestionStates).filter((s) => s === 'accepted').length;
  const totalCount = recommendations.length;
  const acceptedRecommendations = recommendations.filter((r) => suggestionStates[r.id] === 'accepted');

  const handleToggleAccept = (id: string) => {
    console.log('[Patch] Suggestion accepted, building patches...', { id });
    setSuggestionStates((prev) => ({
      ...prev,
      [id]: prev[id] === 'accepted' ? 'neutral' : 'accepted',
    }));
  };
  const handleToggleReject = (id: string) => {
    setSuggestionStates((prev) => ({
      ...prev,
      [id]: prev[id] === 'rejected' ? 'neutral' : 'rejected',
    }));
  };
  const handleAcceptAll = (category: string) => {
    console.log('[Patch] Suggestion accepted (Accept All), building patches...', { category });
    const categoryRecs = recommendations.filter((r) => r.category === category);
    const allAccepted = categoryRecs.every((r) => suggestionStates[r.id] === 'accepted');
    setSuggestionStates((prev) => {
      const next = { ...prev };
      categoryRecs.forEach((r) => {
        next[r.id] = allAccepted ? 'neutral' : 'accepted';
      });
      return next;
    });
  };

  const handleApplyChanges = async () => {
    if (!resumeData || !lastTailorResult || acceptedCount === 0) return;
    console.log('[Patch] handleApplyChanges called');
    const acceptedIds = new Set(
      Object.entries(suggestionStates)
        .filter(([, state]) => state === 'accepted')
        .map(([id]) => id)
    );
    const filteredResult = buildFilteredTailorResult(lastTailorResult, acceptedIds, recommendations);
    const modified = applyTailorToParsedResume(resumeData, filteredResult);

    setResumeData(modified);
    setPreviewResumeData(modified);
    onTailorPreviewState?.({ acceptedCount: acceptedIds.size, isShowingPreview: true });
    onTailorPreviewData?.(modified);

    const acceptedRecs = recommendations.filter((r) => acceptedIds.has(r.id));
    const patches = buildPatchesFromAccepted(acceptedRecs, resumeData);
    console.log('[Patch] handleApplyChanges: Calling callPatchPdf with', patches.length, 'patches');

    if (patchDebounceRef.current) {
      clearTimeout(patchDebounceRef.current);
      patchDebounceRef.current = null;
    }

    if (patches.length > 0) {
      const patchOk = await callPatchPdf(patches);
      if (patchOk === null) {
        onTailorPatchedPdfUrl?.(null);
      }
    } else {
      onTailorPatchedPdfUrl?.(null);
      onTailorPatchResult?.(null);
    }

    toast({
      title: 'All changes applied',
    });
  };

  const patchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const callPatchPdf = useCallback(
    async (patches: PatchItem[]) => {
      const url = `${API_BASE_URL}/api/resume-workshop/patch-pdf`;
      console.log('[Patch] callPatchPdf called, patches:', JSON.stringify(patches));
      console.log('[Patch] API URL:', url);
      console.log('[Patch] onTailorPatchedPdfUrl is:', typeof onTailorPatchedPdfUrl);
      if (patches.length === 0) return;
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        console.log('[Patch] callPatchPdf: No auth token, aborting');
        return;
      }
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ patches }),
        });
        const result = await res.json();
        if (res.ok && result.status === 'ok' && result.patched_pdf_url) {
          console.log('[Patch] callPatchPdf success:', result);
          onTailorPatchedPdfUrl?.(result.patched_pdf_url);
          onTailorPatchResult?.(
            (result.unsafe_count || result.not_found_count) > 0
              ? { unsafeCount: result.unsafe_count || 0, notFoundCount: result.not_found_count || 0 }
              : null
          );
          return true;
        } else if (res.status === 400 && result.message?.includes('No uploaded resume')) {
          onTailorPatchedPdfUrl?.(null);
          onTailorPatchResult?.(null);
          return null; // Signal fallback to JSON
        } else {
          onTailorPatchedPdfUrl?.(null);
          onTailorPatchResult?.(null);
          return null;
        }
      } catch {
        onTailorPatchedPdfUrl?.(null);
        onTailorPatchResult?.(null);
        return null;
      }
    },
    [onTailorPatchedPdfUrl, onTailorPatchResult]
  );

  useEffect(() => {
    console.log('[Patch] useEffect triggered', { lastTailorResult: !!lastTailorResult, resumeData: !!resumeData, suggestionStatesKeys: Object.keys(suggestionStates).length });
    if (!lastTailorResult || !resumeData) return;
    const acceptedIds = new Set(
      Object.entries(suggestionStates)
        .filter(([, state]) => state === 'accepted')
        .map(([id]) => id)
    );
    if (acceptedIds.size === 0) {
      setPreviewResumeData(null);
      setProjectedScore(null);
      setProjectedKeywordMatch(null);
      onTailorPreviewData?.(null);
      onTailorPreviewState?.(null);
      onTailorPatchedPdfUrl?.(null);
      onTailorPatchResult?.(null);
      return;
    }

    const filteredResult = buildFilteredTailorResult(lastTailorResult, acceptedIds, recommendations);
    const modified = applyTailorToParsedResume(resumeData, filteredResult);
    setPreviewResumeData(modified);
    onTailorPreviewState?.({ acceptedCount: acceptedIds.size, isShowingPreview: true });
    onTailorPreviewData?.(modified);

    const acceptedRecs = recommendations.filter((r) => acceptedIds.has(r.id));
    const patches = buildPatchesFromAccepted(acceptedRecs, resumeData);

    if (patchDebounceRef.current) clearTimeout(patchDebounceRef.current);

    if (patches.length > 0) {
      console.log('[Patch] Calling callPatchPdf with', patches.length, 'patches (debounced 1s)');
      setIsPreviewUpdating(true);
      patchDebounceRef.current = setTimeout(async () => {
        console.log('[Patch] Debounce fired, calling patch-pdf...');
        patchDebounceRef.current = null;
        const patchOk = await callPatchPdf(patches);
        if (patchOk === null) {
          onTailorPatchedPdfUrl?.(null);
        }
        setIsPreviewUpdating(false);
      }, 1000);
    } else {
      console.log('[Patch] patches.length is 0, skipping callPatchPdf');
      onTailorPatchedPdfUrl?.(null);
      onTailorPatchResult?.(null);
      setIsPreviewUpdating(false);
    }

    const result = lastTailorResult;
    const breakdown = result.score_breakdown;
    if (breakdown) {
      const accepted = recommendations.filter((r) => acceptedIds.has(r.id));
      const acceptedByCategory = accepted.reduce((acc, r) => {
        acc[r.category] = (acc[r.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const totalByCategory = recommendations.reduce((acc, r) => {
        acc[r.category] = (acc[r.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      let projected = result.score;
      if (acceptedByCategory['Summary'] && breakdown.job_title_match?.score === 0) {
        projected += 15 * 0.6;
      }
      if (acceptedByCategory['Experience'] && breakdown.bullet_quality) {
        const experienceTotal = totalByCategory['Experience'] || 1;
        const experienceAccepted = acceptedByCategory['Experience'] || 0;
        const currentBulletScore = breakdown.bullet_quality.score;
        const improvementRoom = 100 - currentBulletScore;
        projected += (improvementRoom * (experienceAccepted / experienceTotal)) * 0.15 * 0.6;
      }
      const keywordAccepted = (acceptedByCategory['Keywords'] || 0) + (acceptedByCategory['Skills'] || 0);
      const keywordTotal = (totalByCategory['Keywords'] || 0) + (totalByCategory['Skills'] || 0);
      if (keywordAccepted > 0 && breakdown.hard_skill_match) {
        const currentSkillScore = breakdown.hard_skill_match.score;
        const improvementRoom = 100 - currentSkillScore;
        projected += (improvementRoom * (keywordAccepted / Math.max(keywordTotal, 1))) * 0.3 * 0.6;
      }
      setProjectedScore(Math.min(95, Math.round(projected)));
      const missingCount =
        (result.keyword_analysis?.required_missing?.length || 0) +
        (result.keyword_analysis?.preferred_missing?.length || 0);
      const keywordRecsAccepted = acceptedByCategory['Keywords'] || 0;
      if (missingCount > 0 && keywordRecsAccepted > 0) {
        const totalKeywords =
          (result.keyword_analysis?.required_present?.length || 0) + missingCount;
        const addedKeywords = Math.min(keywordRecsAccepted, missingCount);
        const newMatch = Math.round(
          ((result.keyword_analysis?.required_present?.length || 0) + addedKeywords) /
            totalKeywords *
            100
        );
        setProjectedKeywordMatch(Math.min(100, newMatch));
      } else {
        setProjectedKeywordMatch(null);
      }
    }

    return () => {
      if (patchDebounceRef.current) clearTimeout(patchDebounceRef.current);
    };
  }, [
    suggestionStates,
    resumeData,
    lastTailorResult,
    recommendations,
    onTailorPreviewData,
    onTailorPreviewState,
    onTailorPatchedPdfUrl,
    onTailorPatchResult,
    callPatchPdf,
  ]);

  const handleTailor = async () => {
    setError(null);
    setJobUrlError(null);
    setInsufficientJdMessage(null);
    if (!hasJobContext) {
      setError(
        'Provide a job URL, paste the job description, or enter job title, location, and description.'
      );
      return;
    }
    if (credits < 5) {
      toast({ title: 'Insufficient credits', description: 'You need at least 5 credits.', variant: 'destructive' });
      return;
    }
    setTailorScore(null);
    setRecommendations([]);
    setLastTailorResult(null);
    setIsTailoring(true);
    try {
      const payload: Parameters<typeof tailorResume>[0] = {
        job_title: jobTitle.trim() || undefined,
        company: company.trim() || undefined,
        location: locationInput.trim() || undefined,
      };
      if (inputMode === 'paste') {
        payload.job_description_text = jobDescription.trim() || undefined;
        if (jobUrl.trim()) payload.job_url = normalizeJobUrl(jobUrl.trim());
      } else {
        payload.job_url = hasJobUrl ? normalizeJobUrl(jobUrl.trim()) : undefined;
        payload.job_description = jobDescription.trim() || undefined;
      }
      const result = await tailorResume(payload);
      if (result.status === 'error') {
        const isInsufficientJd =
          result.error === 'insufficient_job_description' || result.error_code === 'INSUFFICIENT_JOB_DESCRIPTION';
        if (isInsufficientJd) {
          setInsufficientJdMessage(
            result.message || 'LinkedIn limited our access to this job posting. Please paste the full job description below.'
          );
          setInputMode('paste');
          if (result.jd_preview) setJobDescription(result.jd_preview);
          setShowManualInputs(true);
          if (result.credits_remaining !== undefined && updateCredits) await updateCredits(result.credits_remaining);
          toast({
            title: 'Paste job description',
            description: 'We could only retrieve a preview. Paste the full description and try again.',
            variant: 'destructive',
          });
        } else if (result.error_code === 'URL_PARSE_FAILED') {
          setJobUrlError('Could not read job URL. Use manual inputs or paste job description.');
          setShowManualInputs(true);
        } else {
          setError(result.message || 'Tailoring failed.');
          toast({ title: 'Error', description: result.message, variant: 'destructive' });
        }
        return;
      }
      const scoreValue = typeof result.score === 'number' ? result.score : null;
      setTailorScore(scoreValue);
      setTailorScoreLabel(result.score_label || '');
      setTailorJobContext(result.job_context || null);
      setLastTailorResult(result.status === 'ok' ? result : null);
      setRecommendations(convertSectionsToRecommendations(result));
      setSuggestionStates({});
      setPreviewResumeData(null);
      setProjectedScore(null);
      setProjectedKeywordMatch(null);
      setShowResults(true);
      if (result.url_parse_warning) setShowManualInputs(true);
      if (result.credits_remaining !== undefined && updateCredits) await updateCredits(result.credits_remaining);
      toast({ title: 'Analysis complete', description: `Score: ${result.score}/100 for this role.` });
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsTailoring(false);
    }
  };

  const handleSaveTailorToLibrary = async () => {
    if (!resumeData || !lastTailorResult || lastTailorResult.status !== 'ok') {
      toast({ title: 'Cannot save', description: 'Resume data not available. Save from Editor first.', variant: 'destructive' });
      return;
    }
    setIsSavingTailorToLibrary(true);
    try {
      let modified: ParsedResume;
      if (acceptedCount > 0) {
        const acceptedIds = new Set(
          Object.entries(suggestionStates)
            .filter(([, state]) => state === 'accepted')
            .map(([id]) => id)
        );
        const filteredResult = buildFilteredTailorResult(lastTailorResult, acceptedIds, recommendations);
        modified = applyTailorToParsedResume(resumeData, filteredResult);
      } else {
        modified = applyTailorToParsedResume(resumeData, lastTailorResult);
      }
      const blob = await generateResumePDF(modified);
      const buffer = await blob.arrayBuffer();
      const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      const jt = tailorJobContext?.job_title || '';
      const co = tailorJobContext?.company || '';
      const descriptiveName = getResumePdfFilename(modified, co).replace(/\.pdf$/i, '');
      const res = await saveToResumeLibrary({
        display_name: descriptiveName || `Tailored for ${jt || co || 'Job'}`,
        job_title: jt,
        company: co,
        location: tailorJobContext?.location || '',
        pdf_base64: pdfBase64,
        structured_data: modified,
        score: tailorScore ?? undefined,
        source: 'tailor',
      });
      if (res.status === 'error') {
        toast({ title: 'Error', description: res.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Saved to resume library' });
      loadLibrary();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to save.', variant: 'destructive' });
    } finally {
      setIsSavingTailorToLibrary(false);
    }
  };

  const handleUseTailorAsMain = async () => {
    if (!uid || !resumeData || !lastTailorResult || lastTailorResult.status !== 'ok') {
      toast({ title: 'Cannot update', description: 'Resume data not available.', variant: 'destructive' });
      return;
    }
    if (!window.confirm('Replace your current resume with this tailored version? You can review in the Editor and save.')) return;
    setIsUsingTailorAsMain(true);
    try {
      const modified = applyTailorToParsedResume(resumeData, lastTailorResult);
      setResumeData(modified);
      setLastTailorResult(null);
      setShowResults(false);
      toast({ title: 'Resume updated', description: 'Tailored version is in the Editor. Review and click Save Changes.' });
      onSwitchToEditor();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to update.', variant: 'destructive' });
    } finally {
      setIsUsingTailorAsMain(false);
    }
  };

  if (showResults && lastTailorResult) {
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const sortedRecommendations = [...recommendations].sort(
      (a, b) => (priorityOrder[a.priority || 'low'] ?? 2) - (priorityOrder[b.priority || 'low'] ?? 2)
    );
    const categoryOrderList = ['Summary', 'Experience', 'Skills', 'Projects', 'Keywords', 'Formatting'];
    const categoryIconsMap: Record<string, React.ComponentType<{ className?: string }>> = {
      Summary: FileText,
      Experience: Briefcase,
      Skills: Code,
      Projects: FolderOpen,
      Keywords: Search,
      Formatting: Layout,
    };
    const groupedByCategory = sortedRecommendations.reduce((acc, rec) => {
      if (!acc[rec.category]) acc[rec.category] = [];
      acc[rec.category].push(rec);
      return acc;
    }, {} as Record<string, Recommendation[]>);

    return (
      <div className="flex flex-col h-full pb-6">
        {/* Sticky hero: Apply All Suggestions */}
        <div className="sticky top-0 z-10 shrink-0 mx-4 mt-4 mb-2">
          <div className="flex items-center justify-between gap-4 rounded-[3px] shadow-md bg-gradient-to-r from-[#0F172A] to-[#1E293B] py-3 px-6">
            <button
              type="button"
              onClick={() => {
                const allIds = recommendations.map((r) => r.id);
                const allAccepted = allIds.every((id) => suggestionStates[id] === 'accepted');
                if (allAccepted) {
                  const newStates: Record<string, 'accepted' | 'rejected' | 'neutral'> = {};
                  allIds.forEach((id) => { newStates[id] = 'neutral'; });
                  setSuggestionStates((prev) => ({ ...prev, ...newStates }));
                } else {
                  const newStates: Record<string, 'accepted' | 'rejected' | 'neutral'> = {};
                  allIds.forEach((id) => { newStates[id] = 'accepted'; });
                  setSuggestionStates((prev) => ({ ...prev, ...newStates }));
                }
              }}
              className="text-white/90 hover:text-white text-sm font-medium"
            >
              {recommendations.every((r) => suggestionStates[r.id] === 'accepted') ? 'Undo All' : 'Accept All'}
            </button>
            <button
              type="button"
              onClick={handleApplyChanges}
              disabled={acceptedCount === 0}
              className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-base font-semibold text-white bg-white/20 hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              <Check className="w-5 h-5" />
              Apply All Suggestions
            </button>
            <span className="text-white/70 text-sm tabular-nums">
              {totalCount} suggestion{totalCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <TailorDashboard
          result={lastTailorResult}
          projectedScore={projectedScore}
          projectedKeywordMatch={projectedKeywordMatch}
          acceptedCount={acceptedCount}
          totalCount={totalCount}
          allRecommendations={recommendations}
          suggestionStates={suggestionStates}
          setSuggestionStates={setSuggestionStates}
          onApply={handleApplyChanges}
          onBack={() => {
            setShowResults(false);
            setLastTailorResult(null);
            setSuggestionStates({});
            setPreviewResumeData(null);
            setProjectedScore(null);
            setProjectedKeywordMatch(null);
            onTailorPreviewData?.(null);
            onTailorPreviewState?.(null);
            onTailorPatchedPdfUrl?.(null);
            onTailorPatchResult?.(null);
          }}
          tailorJobContext={tailorJobContext}
        />
        <div className="px-4 space-y-3 overflow-auto flex-1">
          <CollapsibleSection title="Score Breakdown" icon={BarChart3}>
            <ScoreBreakdown breakdown={lastTailorResult.score_breakdown} />
          </CollapsibleSection>
          <CollapsibleSection title="Keyword Analysis" icon={Search}>
            <KeywordAnalysisBlock analysis={lastTailorResult.keyword_analysis} />
          </CollapsibleSection>
          <RoleSpecificTipsBlock
            tips={lastTailorResult.role_specific_tips || []}
            roleType={lastTailorResult.role_type || 'GENERAL'}
          />
        </div>
        <div className="px-4 space-y-3 overflow-auto flex-1">
          {categoryOrderList.map((category) => {
            const categoryRecs = groupedByCategory[category];
            if (!categoryRecs || categoryRecs.length === 0) return null;
            return (
              <CategorySection
                key={category}
                category={category}
                icon={categoryIconsMap[category]}
                recommendations={categoryRecs}
                suggestionStates={suggestionStates}
                onAccept={handleToggleAccept}
                onReject={handleToggleReject}
                onAcceptAll={handleAcceptAll}
                defaultOpen={category === 'Summary' || category === 'Experience'}
              />
            );
          })}
        </div>
        {resumeData && lastTailorResult.status === 'ok' && (
          <div className="px-4 shrink-0">
            <Button
              onClick={handleSaveTailorToLibrary}
              disabled={isSavingTailorToLibrary}
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
            >
              {isSavingTailorToLibrary ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Tailored Version to Library
            </Button>
          </div>
        )}
        {lastTailorResult.url_parse_warning && (
          <div className="mx-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{lastTailorResult.url_parse_warning}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {insufficientJdMessage && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">LinkedIn limited our access to this job posting.</p>
            <p className="mt-1 text-amber-700">{insufficientJdMessage}</p>
            <p className="mt-2 text-xs">Paste the full job description below and click Tailor Resume again. Your credits were refunded.</p>
          </div>
          <button
            type="button"
            onClick={() => setInsufficientJdMessage(null)}
            className="text-amber-600 hover:text-amber-800 shrink-0"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex justify-between items-center">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-red-600 hover:text-red-800">×</button>
        </div>
      )}
      <p className="text-sm text-gray-600">Paste a job URL or the full job description to tailor your resume.</p>
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        <button
          type="button"
          onClick={() => { setInputMode('url'); setError(null); setInsufficientJdMessage(null); }}
          className={`px-3 py-1.5 rounded-t text-sm font-medium transition-colors ${
            inputMode === 'url' ? 'bg-gray-100 text-gray-900 border border-gray-200 border-b-white -mb-0.5' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Paste URL
        </button>
        <button
          type="button"
          onClick={() => { setInputMode('paste'); setError(null); setInsufficientJdMessage(null); }}
          className={`px-3 py-1.5 rounded-t text-sm font-medium transition-colors ${
            inputMode === 'paste' ? 'bg-gray-100 text-gray-900 border border-gray-200 border-b-white -mb-0.5' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Paste Job Description
        </button>
      </div>
      {inputMode === 'url' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Posting URL</label>
            <input
              type="url"
              value={jobUrl}
              onChange={(e) => { setJobUrl(e.target.value); setJobUrlError(null); }}
              placeholder="https://linkedin.com/jobs/..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6]"
            />
            <p className="text-xs text-gray-500 mt-1">Paste any job URL - LinkedIn, Greenhouse, Lever, Indeed, etc.</p>
            {jobUrlError && <p className="text-sm text-red-600 mt-1">{jobUrlError}</p>}
          </div>
          <div>
            <button
              type="button"
              onClick={() => setShowManualInputs(!showManualInputs)}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
            >
              {showManualInputs ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Or enter job details manually
            </button>
            {showManualInputs && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">Company</label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="e.g. Google"
                    disabled={!!jobUrl}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">Job Title</label>
                  <input
                    type="text"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="e.g. Product Manager"
                    disabled={!!jobUrl}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">Location</label>
                  <input
                    type="text"
                    value={locationInput}
                    onChange={(e) => setLocationInput(e.target.value)}
                    placeholder="e.g. San Francisco, CA"
                    disabled={!!jobUrl}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">Job Description</label>
                  <textarea
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    placeholder="Paste the job description here..."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-y"
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}
      {inputMode === 'paste' && (
        <div className="space-y-3">
          {jobUrl.trim() && (
            <p className="text-xs text-gray-500">Job URL saved: {jobUrl.trim().slice(0, 60)}…</p>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Job Description</label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the complete job description here (requirements, responsibilities, etc.). At least 300 characters for best results."
              rows={10}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-y"
            />
            <p className="text-xs text-gray-500 mt-1">We’ll use this instead of scraping the URL. You can still paste a URL above to keep it for reference.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs font-medium text-gray-600 mb-0.5">Job Title (optional)</label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Data Analyst"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs font-medium text-gray-600 mb-0.5">Company (optional)</label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Acme Inc"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs font-medium text-gray-600 mb-0.5">Location (optional)</label>
              <input
                type="text"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                placeholder="e.g. Remote"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
          </div>
        </div>
      )}
      <Button onClick={handleTailor} disabled={!hasJobContext || isTailoring || credits < 5} className="w-full sm:w-auto">
        {isTailoring ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Tailor Resume
      </Button>
      {credits < 5 && <p className="text-xs text-amber-600">You need at least 5 credits to tailor.</p>}
    </div>
  );
}
