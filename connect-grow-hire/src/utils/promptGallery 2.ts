import type { UserContext } from '@/utils/suggestionChips';
import type { PromptCardData } from '@/types/promptCard';
import { getUniversityShortName } from '@/lib/universityUtils';

interface PromptGalleryResult {
  tier: 1 | 2 | 3;
  items: PromptCardData[];
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 16807 + 0) % 2147483647;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function getWeekSeed(): number {
  return Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
}

function buildTier1(ctx: UserContext): PromptCardData[] {
  const school = getUniversityShortName(ctx.university) || ctx.university;
  const industry = ctx.targetIndustries[0] || 'finance';
  const location = ctx.preferredLocations[0] || 'New York';
  const track = ctx.careerTrack || ctx.preferredJobRole || 'analyst';
  const year = ctx.graduationYear || '2026';
  const dreamCo = ctx.dreamCompanies[0] || '';

  const industryLower = industry.toLowerCase();
  const isIB = /banking|ib|investment/i.test(industryLower);
  const isConsulting = /consulting|strategy|management/i.test(industryLower);
  const isTech = /tech|software|engineering|data|ai|product/i.test(industryLower);
  const isFinance = /finance|asset|hedge|pe|private equity|venture/i.test(industryLower);

  const candidates: PromptCardData[] = [];

  // School-specific prompts (always include at least 2)
  candidates.push({
    prompt: `${industry} firms that recruited from ${school} in the last two years`,
    hint: `${school} · School affinity`,
  });
  candidates.push({
    prompt: `Companies in ${location} with ${school} alumni in ${track} roles`,
    hint: `${school} · ${location} · Alumni signal`,
  });

  // Industry + location + role combos
  if (isIB) {
    candidates.push(
      { prompt: `Boutique investment banks in ${location} hiring summer ${year} analysts`, hint: `${track} · ${industry} · ${location}` },
      { prompt: `Middle-market banks in ${location} with strong ${track} programs`, hint: `${industry} · ${location}` },
      { prompt: `Investment banks under 500 employees in ${location}`, hint: `Size · ${location}` },
      { prompt: `Banks in ${location} known for lateral hiring from ${school}`, hint: `${school} · ${industry}` },
    );
  } else if (isConsulting) {
    candidates.push(
      { prompt: `Boutique consulting firms in ${location} hiring ${year} analysts`, hint: `${track} · ${industry} · ${location}` },
      { prompt: `Strategy consulting firms with offices in ${location}`, hint: `${industry} · ${location}` },
      { prompt: `Management consulting firms under 200 employees in ${location}`, hint: `Size · ${location}` },
      { prompt: `Consulting firms that recruit heavily from ${school}`, hint: `${school} · ${industry}` },
    );
  } else if (isTech) {
    candidates.push(
      { prompt: `Series B+ AI companies in ${location} hiring ${track}s`, hint: `${track} · ${industry} · ${location}` },
      { prompt: `Tech startups in ${location} under 100 employees hiring ${track}s`, hint: `Size · ${track} · ${location}` },
      { prompt: `FAANG-tier companies hiring new grad ${track}s in ${location}`, hint: `${industry} · ${location}` },
      { prompt: `Climate tech startups hiring ${track}s across the US`, hint: `${industry} · ${track}` },
    );
  } else if (isFinance) {
    candidates.push(
      { prompt: `Hedge funds in ${location} under 100 employees with ${school} alumni`, hint: `Size · Alumni signal` },
      { prompt: `Asset management firms in ${location} hiring ${year} analysts`, hint: `${industry} · ${location}` },
      { prompt: `PE firms that recruited from ${school} in the last two years`, hint: `${school} · ${industry}` },
      { prompt: `Venture capital firms in ${location} hiring associates`, hint: `${industry} · ${location}` },
    );
  } else {
    candidates.push(
      { prompt: `${industry} companies in ${location} hiring ${year} graduates`, hint: `${industry} · ${location}` },
      { prompt: `${industry} firms in ${location} under 200 employees`, hint: `Size · ${location}` },
      { prompt: `Growing ${industry} companies hiring ${track}s`, hint: `${industry} · ${track}` },
      { prompt: `${industry} companies with strong early-career programs`, hint: `${industry} · Entry-level` },
    );
  }

  // Dream company adjacent
  if (dreamCo) {
    candidates.push({
      prompt: `Companies similar to ${dreamCo} in ${location}`,
      hint: `${dreamCo} · ${location}`,
    });
  }

  return candidates;
}

function buildTier2(ctx: UserContext): PromptCardData[] {
  const industries = ctx.targetIndustries;
  const candidates: PromptCardData[] = [];

  const industryPrompts: Record<string, PromptCardData[]> = {
    tech: [
      { prompt: 'Series B+ AI companies in San Francisco', hint: 'Tech · San Francisco' },
      { prompt: 'Climate tech startups hiring across the US', hint: 'Tech · Nationwide' },
      { prompt: 'Enterprise SaaS companies in New York hiring engineers', hint: 'Tech · New York' },
      { prompt: 'Gaming studios in Los Angeles hiring new grads', hint: 'Tech · Los Angeles' },
    ],
    finance: [
      { prompt: 'Boutique investment banks in New York', hint: 'Finance · New York' },
      { prompt: 'Hedge funds in Chicago under 100 employees', hint: 'Finance · Chicago' },
      { prompt: 'Fintech companies in San Francisco hiring analysts', hint: 'Finance · San Francisco' },
      { prompt: 'Asset management firms in Boston', hint: 'Finance · Boston' },
    ],
    consulting: [
      { prompt: 'Boutique strategy firms in New York', hint: 'Consulting · New York' },
      { prompt: 'Management consulting firms in Chicago', hint: 'Consulting · Chicago' },
      { prompt: 'Healthcare consulting firms hiring analysts', hint: 'Consulting · Healthcare' },
      { prompt: 'Tech consulting firms in San Francisco', hint: 'Consulting · San Francisco' },
    ],
    default: [
      { prompt: 'Fast-growing startups hiring in New York', hint: 'Startups · New York' },
      { prompt: 'Companies in San Francisco under 200 employees', hint: 'Size · San Francisco' },
      { prompt: 'Top employers in Chicago hiring new graduates', hint: 'Chicago · Entry-level' },
      { prompt: 'Mission-driven companies hiring across the US', hint: 'Impact · Nationwide' },
    ],
  };

  for (const ind of industries.slice(0, 2)) {
    const lower = ind.toLowerCase();
    const key = /tech|software|ai|data|engineer/i.test(lower) ? 'tech'
      : /banking|finance|hedge|pe|asset/i.test(lower) ? 'finance'
      : /consulting|strategy/i.test(lower) ? 'consulting'
      : 'default';
    candidates.push(...(industryPrompts[key] || industryPrompts.default));
  }

  if (candidates.length < 6) {
    candidates.push(...industryPrompts.default);
  }

  return candidates;
}

const TIER_3_CANDIDATES: PromptCardData[] = [
  { prompt: 'AI startups in San Francisco hiring data scientists', hint: 'Tech · San Francisco' },
  { prompt: 'Boutique investment banks in New York', hint: 'Finance · New York' },
  { prompt: 'Climate tech companies hiring across the US', hint: 'Climate · Nationwide' },
  { prompt: 'Management consulting firms in Chicago', hint: 'Consulting · Chicago' },
  { prompt: 'Gaming studios in Los Angeles hiring new grads', hint: 'Entertainment · Los Angeles' },
  { prompt: 'Healthcare startups in Boston under 100 employees', hint: 'Healthcare · Boston' },
  { prompt: 'Fintech companies in New York hiring analysts', hint: 'Fintech · New York' },
  { prompt: 'Series B+ edtech companies hiring product managers', hint: 'Edtech · Product' },
];

export function buildPromptGallery(ctx: UserContext): PromptGalleryResult {
  const hasSchool = !!ctx.university;
  const hasIndustry = ctx.targetIndustries.length > 0;
  const hasTrackOrRole = !!(ctx.careerTrack || ctx.preferredJobRole);
  const hasLocationOrDream = !!(ctx.preferredLocations[0] || ctx.dreamCompanies[0]);

  let tier: 1 | 2 | 3;
  let candidates: PromptCardData[];

  if (hasSchool && hasIndustry && hasTrackOrRole && hasLocationOrDream) {
    tier = 1;
    candidates = buildTier1(ctx);
  } else if (hasIndustry) {
    tier = 2;
    candidates = buildTier2(ctx);
  } else {
    tier = 3;
    candidates = TIER_3_CANDIDATES;
  }

  // Deterministic weekly shuffle
  const seed = getWeekSeed();
  const shuffled = seededShuffle(candidates, seed);

  // Deduplicate by prompt text
  const seen = new Set<string>();
  const unique: PromptCardData[] = [];
  for (const item of shuffled) {
    const key = item.prompt.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  return { tier, items: unique.slice(0, 6) };
}
