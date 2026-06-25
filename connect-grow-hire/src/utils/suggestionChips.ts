import { industries } from '@/data/industries';
import { getUniversityShortName } from '@/lib/universityUtils';

export interface SuggestionChip {
  id: string;
  label: string;
  prompt: string;
  category: 'alumni' | 'industry' | 'location' | 'dream';
}

export interface UserContext {
  firstName: string;
  university: string;
  graduationYear: string;
  targetIndustries: string[];
  preferredLocations: string[];
  dreamCompanies: string[];
  careerTrack: string;
  preferredJobRole: string;
  // Newer profile-driven fields — populated from the Direction extractor + Profile page
  targetFirms: string[];        // explicit firms the user picked
  extractedRoles: string[];     // role titles inferred from their narrative
  directionNarrative: string;   // freeform "what they want"
  personalContext: string;      // freeform "anything we missed"
}

const EMPTY_CONTEXT: UserContext = {
  firstName: '', university: '', graduationYear: '',
  targetIndustries: [], preferredLocations: [], dreamCompanies: [], careerTrack: '',
  preferredJobRole: '',
  targetFirms: [], extractedRoles: [], directionNarrative: '', personalContext: '',
};

function getCompaniesForIndustry(interest: string): string[] {
  const slug = interest.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-');
  const match = industries.find(i =>
    i.name.toLowerCase() === interest.toLowerCase() ||
    i.slug === slug ||
    i.name.toLowerCase().includes(interest.toLowerCase()) ||
    interest.toLowerCase().includes(i.name.toLowerCase())
  );
  return match?.top_companies?.slice(0, 4) || [];
}

function getSeniorityLabel(gradYear: string): string {
  if (!gradYear) return '';
  const now = new Date().getFullYear();
  const grad = parseInt(gradYear, 10);
  if (isNaN(grad)) return '';
  const delta = grad - now;
  if (delta >= 0) return 'Analyst';
  if (delta >= -3) return 'Associate';
  return 'VP';
}

export function shortUniversity(uni: string): string {
  const abbrevs: Record<string, string> = {
    'University of Southern California': 'USC',
    'University of California, Los Angeles': 'UCLA',
    'University of Michigan': 'UMich',
    'University of Pennsylvania': 'UPenn',
    'New York University': 'NYU',
    'Georgetown University': 'Georgetown',
    'University of California, Berkeley': 'UC Berkeley',
    'Massachusetts Institute of Technology': 'MIT',
    'Stanford University': 'Stanford',
    'Columbia University': 'Columbia',
    'Harvard University': 'Harvard',
    'Yale University': 'Yale',
    'Princeton University': 'Princeton',
    'Cornell University': 'Cornell',
    'Duke University': 'Duke',
    'Northwestern University': 'Northwestern',
    'University of Chicago': 'UChicago',
    'University of Virginia': 'UVA',
    'University of Texas at Austin': 'UT Austin',
  };

  // Direct match
  if (abbrevs[uni]) return abbrevs[uni];

  // Strip parenthetical suffix: "University of Southern California (USC)" → "University of Southern California"
  const parenMatch = uni.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (parenMatch) {
    const baseName = parenMatch[1].trim();
    const parenAbbrev = parenMatch[2].trim();
    // Use the known abbreviation if the base name matches, otherwise use the parenthetical
    return abbrevs[baseName] || parenAbbrev;
  }

  return uni;
}

export function generatePeopleChips(ctx: UserContext): SuggestionChip[] {
  const chips: SuggestionChip[] = [];
  const seen = new Set<string>();
  const uni = shortUniversity(ctx.university);
  const seniority = getSeniorityLabel(ctx.graduationYear);

  const addChip = (category: SuggestionChip['category'], label: string, prompt: string) => {
    const key = prompt.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    chips.push({ id: `${category}-${chips.length}`, label, prompt, category });
  };

  // Alumni chips
  if (ctx.university) {
    const allCompanies = ctx.targetIndustries.flatMap(i => getCompaniesForIndustry(i));
    const alumniCompanies = [...new Set(allCompanies)].slice(0, 4);
    for (const company of alumniCompanies) {
      addChip('alumni', `${uni} grads at ${company}`, `${ctx.university} alumni at ${company}`);
    }
    if (ctx.graduationYear && seniority) {
      const gradYear = parseInt(ctx.graduationYear, 10);
      const recentGrad = gradYear - 1;
      const topCompany = alumniCompanies[0] || 'top firms';
      addChip('alumni',
        `${uni} class of '${String(recentGrad).slice(-2)} at ${topCompany}`,
        `${ctx.university} ${recentGrad} graduates working as ${seniority} at ${topCompany}`
      );
    }
    if (alumniCompanies.length === 0) {
      addChip('alumni', `${uni} grads in finance`, `${ctx.university} alumni in finance`);
      addChip('alumni', `${uni} grads in consulting`, `${ctx.university} alumni in consulting`);
    }
  }

  // Industry chips
  for (const industry of ctx.targetIndustries.slice(0, 3)) {
    const companies = getCompaniesForIndustry(industry);
    for (const company of companies.slice(0, 2)) {
      const location = ctx.preferredLocations[0] || '';
      const locationSuffix = location ? ` in ${location}` : '';
      const seniorityPrefix = seniority || 'Professionals';
      addChip('industry',
        `${seniorityPrefix} at ${company}${locationSuffix}`,
        `${seniorityPrefix} at ${company}${locationSuffix}`
      );
    }
  }

  // Location chips
  for (const location of ctx.preferredLocations.slice(0, 3)) {
    const industry = ctx.targetIndustries[0] || 'Finance';
    addChip('location',
      `${industry} people in ${location}`,
      `${industry} professionals in ${location}`
    );
  }

  // Dream company chips (no-op until Goals step is wired)
  for (const company of ctx.dreamCompanies.slice(0, 3)) {
    addChip('dream', `Who works at ${company}`, `Professionals at ${company}`);
  }

  return chips;
}

export function generateFirmChips(ctx: UserContext): SuggestionChip[] {
  const chips: SuggestionChip[] = [];
  const seen = new Set<string>();

  const addChip = (category: SuggestionChip['category'], label: string, prompt: string) => {
    const key = prompt.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    chips.push({ id: `firm-${category}-${chips.length}`, label, prompt, category });
  };

  // Industry + location chips
  for (const industry of ctx.targetIndustries.slice(0, 3)) {
    for (const location of ctx.preferredLocations.slice(0, 2)) {
      addChip('industry', `${industry} firms in ${location}`, `${industry} firms in ${location}`);
    }
    if (ctx.preferredLocations.length === 0) {
      addChip('industry', `Top ${industry} firms`, `Leading ${industry} firms hiring entry-level`);
    }
  }

  // Location-only chips
  for (const location of ctx.preferredLocations.slice(0, 2)) {
    const industry = ctx.targetIndustries[0] || 'Finance';
    addChip('location', `${industry} companies in ${location}`, `${industry} companies in ${location}`);
  }

  // Dream company chips (no-op until Goals step)
  for (const company of ctx.dreamCompanies.slice(0, 3)) {
    addChip('dream', `Companies like ${company}`, `Firms similar to ${company}`);
  }

  return chips;
}

// ── Discovery-oriented firm chips for "Find Companies" tab ──────────

// Niche angles per industry — more specific than the industry name itself
const INDUSTRY_NICHE_ANGLES: Record<string, string[]> = {
  'Data Science': ['AI and ML startups', 'Data-driven companies', 'Analytics companies'],
  'Data Science & Analytics': ['AI and ML startups', 'Data-driven companies', 'Analytics companies'],
  'Tech': ['High-growth tech startups', 'Developer-first companies', 'B2B SaaS companies'],
  'Software Development': ['High-growth tech startups', 'Developer-first companies', 'Engineering-led companies'],
  'Investment Banking': ['Boutique investment banks', 'Middle-market banks', 'Restructuring advisory firms'],
  'Management Consulting': ['Strategy consulting firms', 'Boutique consulting firms', 'Digital transformation consultancies'],
  'Consulting': ['Strategy consulting firms', 'Boutique consulting firms', 'Digital transformation consultancies'],
  'Product Management': ['Product-led growth companies', 'Consumer tech companies', 'Platform companies'],
  'Marketing & Advertising': ['Digital marketing agencies', 'Brand strategy firms', 'Growth-stage DTC companies'],
  'Marketing and Advertising': ['Digital marketing agencies', 'Brand strategy firms', 'Growth-stage DTC companies'],
  'Private Equity': ['Middle-market PE firms', 'Growth equity firms', 'Operationally-focused PE firms'],
  'Venture Capital': ['Early-stage VC firms', 'Sector-focused VCs', 'Corporate venture arms'],
  'Hedge Funds': ['Quantitative trading firms', 'Multi-strategy hedge funds', 'Systematic funds'],
  'Finance': ['Fintech companies', 'Asset management firms', 'Financial advisory firms'],
  'Healthcare': ['Digital health startups', 'Healthcare analytics companies', 'Biotech companies'],
  'Cybersecurity': ['Cybersecurity startups', 'Enterprise security companies', 'Identity and access companies'],
  'Real Estate': ['PropTech startups', 'Commercial real estate firms', 'Real estate investment firms'],
  'Media and Entertainment': ['Streaming and content companies', 'Gaming studios', 'Digital media companies'],
  'Accounting': ['Big 4 accounting firms', 'Advisory-focused accounting firms', 'Forensic accounting firms'],
};

export interface PromptChip {
  id: string;
  prompt: string;
  hint: string;
}

export function generateFirmDiscoveryPrompts(ctx: UserContext): PromptChip[] {
  const chips: PromptChip[] = [];
  const seen = new Set<string>();
  const uni = shortUniversity(ctx.university);
  const city = ctx.preferredLocations[0]?.split(',')[0]?.trim() || '';
  const state = ctx.preferredLocations[0]?.includes(',')
    ? ctx.preferredLocations[0].split(',')[1]?.trim() || ''
    : '';
  const industry = ctx.targetIndustries[0] || '';
  const role = inferRoleLabel(ctx, industry);
  const gradYear = ctx.graduationYear || '';
  const gradSeason = gradYear ? `summer ${gradYear}` : 'entry-level';

  const add = (prompt: string, hint: string) => {
    const key = prompt.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    chips.push({ id: `fd-${chips.length}`, prompt, hint });
  };

  // Chip 1: Niche + location + timing (highest signal)
  const nicheAngles = INDUSTRY_NICHE_ANGLES[industry] || INDUSTRY_NICHE_ANGLES[ctx.careerTrack] || [];
  if (nicheAngles.length > 0 && city) {
    add(
      `${nicheAngles[0]} in ${city} hiring ${gradSeason} ${role || 'analysts'}`,
      [uni, industry, city].filter(Boolean).join(' \u00b7 '),
    );
  } else if (industry && city) {
    add(
      `${industry} companies in ${city} hiring ${gradSeason} ${role || 'analysts'}`,
      [uni, industry, city].filter(Boolean).join(' \u00b7 '),
    );
  }

  // Chip 2: School affinity — firms that recruited from user's school
  if (uni && industry) {
    add(
      `${industry} firms that recruited from ${uni} in the last two years`,
      'School affinity',
    );
  }

  // Chip 3: Growth-stage / funding angle
  if (industry && city) {
    const fundingIndustry = industry.toLowerCase().includes('tech') || industry.toLowerCase().includes('data')
      ? 'tech' : industry.toLowerCase();
    add(
      `Growth-stage ${fundingIndustry} in ${state || city} with Series B+ funding`,
      'Industry \u00b7 Stage',
    );
  } else if (industry) {
    add(
      `Growth-stage ${industry} companies with Series B+ funding`,
      'Industry \u00b7 Stage',
    );
  }

  // Chip 4: Second niche angle in different location or same location
  if (nicheAngles.length > 1) {
    const secondCity = ctx.preferredLocations[1]?.split(',')[0]?.trim() || city;
    const suffix = secondCity ? ` in ${secondCity}` : '';
    add(
      `${nicheAngles[1]}${suffix}`,
      [uni, secondCity].filter(Boolean).join(' \u00b7 '),
    );
  } else if (city && industry) {
    add(
      `Mid-size ${industry} companies in ${city}`,
      [uni, city, industry].filter(Boolean).join(' \u00b7 '),
    );
  }

  // Chip 5: Role-specific or seasonal hiring
  if (role && city) {
    add(
      `Companies hiring ${gradSeason} ${role} in ${city}`,
      'Season \u00b7 Role \u00b7 Geo',
    );
  } else if (role) {
    add(
      `Best companies to start your career as a ${role}`,
      'Role \u00b7 Career',
    );
  }

  // Chip 6: Alumni signal + size constraint
  if (uni && city && industry) {
    add(
      `${industry} firms in ${city} under 100 employees with ${uni} alumni`,
      'Size \u00b7 Alumni signal',
    );
  } else if (uni && industry) {
    add(
      `Small ${industry} firms with ${uni} alumni`,
      'Size \u00b7 Alumni signal',
    );
  }

  // Second industry chips if we still need more
  if (chips.length < 6 && ctx.targetIndustries.length > 1) {
    const secondIndustry = ctx.targetIndustries[1];
    const secondCity = ctx.preferredLocations[1]?.split(',')[0]?.trim() || city;
    if (secondCity) {
      add(`${secondIndustry} companies in ${secondCity}`, `${secondIndustry} \u00b7 ${secondCity}`);
    } else {
      add(`Leading ${secondIndustry} companies hiring ${gradSeason}`, secondIndustry);
    }
  }

  // Fallback padding to reach 6
  if (chips.length < 6 && industry) {
    add(`Top ${industry} employers for new graduates`, 'Industry \u00b7 Entry-level');
  }
  if (chips.length < 6 && city) {
    add(`Fast-growing startups in ${city}`, `Startups \u00b7 ${city}`);
  }
  if (chips.length < 6) {
    add('Companies actively hiring new graduates for entry-level roles', 'Entry-level \u00b7 Nationwide');
  }

  return chips.slice(0, 6);
}

// Generic prompts for users without onboarding data
export function getGenericFirmPrompts(): PromptChip[] {
  return [
    { id: 'gen-0', prompt: 'AI startups in San Francisco hiring data scientists', hint: 'Tech \u00b7 West Coast' },
    { id: 'gen-1', prompt: 'Top consulting firms in New York hiring analysts', hint: 'Consulting \u00b7 East Coast' },
    { id: 'gen-2', prompt: 'Climate tech companies hiring across the US', hint: 'Mission \u00b7 Remote-friendly' },
    { id: 'gen-3', prompt: 'Investment banks in NYC hiring summer interns', hint: 'Finance \u00b7 East Coast' },
    { id: 'gen-4', prompt: 'Gaming studios in Los Angeles hiring designers', hint: 'Media \u00b7 West Coast' },
    { id: 'gen-5', prompt: 'Healthcare startups in Boston hiring product managers', hint: 'Healthcare \u00b7 East Coast' },
  ];
}

// Keep old function for backward compat
export function generateFirmDiscoveryChips(ctx: UserContext): SuggestionChip[] {
  return generateFirmDiscoveryPrompts(ctx).map((p, i) => ({
    id: p.id,
    label: p.prompt,
    prompt: p.prompt,
    category: 'industry' as const,
  }));
}

// Fisher-Yates shuffle seeded by a numeric value
export function rotateChips(all: SuggestionChip[], count: number, seed?: number): SuggestionChip[] {
  if (all.length <= count) return [...all];
  const arr = [...all];
  let s = seed ?? Date.now();
  // Simple seeded PRNG (mulberry32)
  const rand = () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

// Default fallback chips — school-specific chips only appear if university is known
export function getDefaultPeopleChips(university?: string | null): SuggestionChip[] {
  const school = getUniversityShortName(university);
  const chips: SuggestionChip[] = [
    { id: 'default-1', label: 'Software engineers at FAANG in SF', prompt: 'Software engineers at FAANG in SF', category: 'industry' },
  ];
  if (school) {
    chips.push({ id: 'default-2', label: `${school} alumni in investment banking`, prompt: `${school} alumni in investment banking`, category: 'alumni' });
  }
  chips.push({ id: 'default-3', label: 'Marketing managers at startups in LA', prompt: 'Marketing managers at startups in LA', category: 'industry' });
  return chips;
}

export function getDefaultFirmChips(university?: string | null): SuggestionChip[] {
  const school = getUniversityShortName(university);
  const chips: SuggestionChip[] = [];
  if (school) {
    chips.push({ id: 'firm-default-1', label: `${school} grads at top consulting firms`, prompt: `Top consulting firms that hire ${school} graduates`, category: 'alumni' });
  }
  chips.push(
    { id: 'firm-default-2', label: 'AI startups hiring in LA', prompt: 'AI and machine learning startups hiring in Los Angeles', category: 'industry' },
    { id: 'firm-default-3', label: 'Where data scientists end up', prompt: 'Companies that hire the most data scientists and ML engineers', category: 'industry' },
    { id: 'firm-default-4', label: 'Companies hiring new grads now', prompt: 'Companies actively hiring new graduates for entry-level roles', category: 'industry' },
  );
  return chips;
}

// Legacy exports for backward compat — use the function versions in new code
export const DEFAULT_PEOPLE_CHIPS = getDefaultPeopleChips();
export const DEFAULT_FIRM_CHIPS = getDefaultFirmChips();

export function isContextEmpty(ctx: UserContext): boolean {
  return !ctx.university && ctx.targetIndustries.length === 0 && ctx.preferredLocations.length === 0;
}

// ── Recommendation engine ──────────────────────────────────────────

export interface CompanyReasoning {
  /**
   * Primary reasoning. `number` is optional — the recommendation engine no
   * longer fabricates alumni counts. A real number can be set here once a
   * trustworthy data source (PDL, Firestore, etc.) is wired in.
   */
  primary: { number?: number; label: string };
  qualifier?: string;
}

export interface RecommendedCompany {
  company: string;
  industry: string;
  score: number;
  reason: string;
  reasoning?: CompanyReasoning;
  /** True when this card came from the user's explicit `targetFirms` list */
  isTargetFirm?: boolean;
  /** True when this card came from the user's `dreamCompanies` onboarding list */
  isDreamCompany?: boolean;
}

export const COMPANY_DOMAINS: Record<string, string> = {
  // Investment Banking
  'Goldman Sachs': 'goldmansachs.com',
  'JPMorgan': 'jpmorgan.com',
  'Morgan Stanley': 'morganstanley.com',
  'Citi': 'citi.com',
  'Barclays': 'barclays.com',
  'Deutsche Bank': 'db.com',
  'Evercore': 'evercore.com',
  'Lazard': 'lazard.com',
  // Consulting
  'McKinsey': 'mckinsey.com',
  'BCG': 'bcg.com',
  'Bain': 'bain.com',
  'Deloitte': 'deloitte.com',
  'Oliver Wyman': 'oliverwyman.com',
  'Accenture': 'accenture.com',
  // Tech
  'Google': 'google.com',
  'Meta': 'meta.com',
  'Apple': 'apple.com',
  'Microsoft': 'microsoft.com',
  'Amazon': 'amazon.com',
  'Stripe': 'stripe.com',
  'Airbnb': 'airbnb.com',
  // Finance / Asset Management
  'BlackRock': 'blackrock.com',
  'Fidelity': 'fidelity.com',
  'Citadel': 'citadel.com',
  'Two Sigma': 'twosigma.com',
  'Point72': 'point72.com',
  'Bridgewater': 'bridgewater.com',
  'Jane Street': 'janestreet.com',
  // Private Equity
  'Blackstone': 'blackstone.com',
  'KKR': 'kkr.com',
  'Apollo': 'apollo.com',
  'Carlyle': 'carlyle.com',
  'Warburg Pincus': 'warburgpincus.com',
  // Venture Capital
  'Sequoia': 'sequoiacap.com',
  'a16z': 'a16z.com',
  // Marketing & Advertising
  'WPP': 'wpp.com',
  'Omnicom': 'omnicomgroup.com',
  'Publicis': 'publicisgroupe.com',
  'Ogilvy': 'ogilvy.com',
  // Healthcare & Pharma
  'Johnson & Johnson': 'jnj.com',
  'Johnson and Johnson': 'jnj.com',
  'Pfizer': 'pfizer.com',
  'McKinsey Health': 'mckinsey.com',
  'CVS Health': 'cvshealth.com',
  'UnitedHealth': 'unitedhealthgroup.com',
  // Accounting / Big 4
  'PwC': 'pwc.com',
  'EY': 'ey.com',
  'KPMG': 'kpmg.com',
  // Retail Banking
  'Bank of America': 'bankofamerica.com',
  'Wells Fargo': 'wellsfargo.com',
  // Consumer & Retail
  'Nike': 'nike.com',
  'PepsiCo': 'pepsico.com',
  'Coca-Cola': 'coca-cola.com',
  'Procter and Gamble': 'pg.com',
  'Unilever': 'unilever.com',
  // Media & Entertainment
  'Disney': 'disney.com',
  'Netflix': 'netflix.com',
  'Spotify': 'spotify.com',
  // SaaS / Enterprise
  'Salesforce': 'salesforce.com',
  'ServiceNow': 'servicenow.com',
  'Workday': 'workday.com',
  // AI / ML
  'OpenAI': 'openai.com',
  'Anthropic': 'anthropic.com',
  // Fintech
  'Robinhood': 'robinhood.com',
  'Plaid': 'plaid.com',
  // Defense & Aerospace
  'Lockheed Martin': 'lockheedmartin.com',
  'Boeing': 'boeing.com',
  'SpaceX': 'spacex.com',
  // Automotive
  'Tesla': 'tesla.com',
  // Real Estate
  'CBRE': 'cbre.com',
  'JLL': 'jll.com',
  'Brookfield': 'brookfield.com',
  // Logistics
  'FedEx': 'fedex.com',
  'UPS': 'ups.com',
  // Luxury
  'LVMH': 'lvmh.com',
  'Hermes': 'hermes.com',
  // Economic Consulting
  'Analysis Group': 'analysisgroup.com',
  'Cornerstone Research': 'cornerstone.com',
  'NERA': 'nera.com',
};

// Resolve a company name to a best-guess domain, or null for non-companies
// (academic institutions, freeform terms) and unresolvable input.
export function getCompanyDomain(company: string): string | null {
  if (!company || !company.trim()) return null;
  const trimmed = company.trim();
  const lowered = trimmed.toLowerCase();

  for (const [name, domain] of Object.entries(COMPANY_DOMAINS)) {
    if (name.toLowerCase() === lowered) return domain;
  }

  const skipPatterns = [
    /\buniversity\b/i, /\bcollege\b/i, /\bschool\b/i, /\binstitute\b/i,
    /\bhurricane\b/i, /\bnot available\b/i,
  ];
  if (skipPatterns.some((re) => re.test(trimmed))) return null;

  const slug = lowered.replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
  if (slug.length < 2) return null;
  return `${slug}.com`;
}

// Google Favicon API — public, no key needed, 100% uptime. Serves a generic
// globe icon for unknown domains rather than 404'ing, so worst case is still
// a non-broken image.
export function getCompanyLogoUrl(company: string): string | null {
  const domain = getCompanyDomain(company);
  return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : null;
}

// Logo URL(s) to try. Google's favicon service resolves for nearly every
// domain; the consumer renders the first that loads and falls back to a
// monogram if it fails. See <CompanyLogo />. (Clearbit's logo API was
// discontinued and its host no longer resolves, so it was removed.)
export function getCompanyLogoCandidates(company: string): string[] {
  const domain = getCompanyDomain(company);
  if (!domain) return [];
  return [
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
  ];
}

// Accent colors by broad category — used for the card accent bar
const INDUSTRY_COLOR_MAP: Record<string, string> = {
  'Investment Banking': '#F59E0B', 'Retail Banking': '#F59E0B', 'Corporate Finance': '#F59E0B',
  'Management Consulting': '#6366F1', 'Consulting': '#6366F1', 'Economic Consulting': '#6366F1',
  'Tech': '#3B82F6', 'Data Science': '#3B82F6', 'Machine Learning and AI': '#3B82F6',
  'Cybersecurity': '#3B82F6', 'SaaS': '#3B82F6', 'Enterprise Software': '#3B82F6',
  'Product Management': '#3B82F6', 'Fintech': '#3B82F6', 'E-commerce': '#3B82F6',
  'Education Technology': '#3B82F6', 'Gaming': '#3B82F6', 'Crypto and Web3': '#3B82F6',
  'Finance': '#10B981', 'Private Equity': '#10B981', 'Venture Capital': '#10B981',
  'Hedge Funds': '#10B981', 'Private Credit': '#10B981', 'Impact Investing': '#10B981',
  'Infrastructure': '#10B981', 'Accounting': '#10B981',
  'Marketing and Advertising': '#EC4899', 'Consumer Goods': '#EC4899',
  'Luxury Goods': '#EC4899', 'Sports Business': '#EC4899',
  'Healthcare': '#14B8A6', 'Biotech': '#14B8A6', 'Pharmaceuticals': '#14B8A6',
  'Life Sciences': '#14B8A6',
  'Defense and Aerospace': '#64748B', 'Aerospace': '#64748B',
  'Energy and Utilities': '#78716C', 'Clean Energy': '#78716C',
  'Media and Entertainment': '#A855F7', 'Media Production': '#A855F7',
  'Real Estate': '#D97706', 'Commercial Real Estate': '#D97706',
  'Automotive': '#475569', 'Transportation': '#475569',
};

export function getIndustryColor(industry: string): string {
  return INDUSTRY_COLOR_MAP[industry] || '#94A3B8';
}

// Fuzzy-match a user interest string to an industry from industries.ts
function findMatchingIndustry(interest: string): { name: string; companies: string[] } | null {
  const lower = interest.toLowerCase().replace(/[^a-z0-9 ]/g, '');

  // 1. Exact name match
  const exact = industries.find(i => i.name.toLowerCase() === interest.toLowerCase());
  if (exact) return { name: exact.name, companies: exact.top_companies };

  // 2. Slug-style match (e.g. "data-science" → "Data Science")
  const slug = lower.replace(/\s+/g, '-');
  const bySlug = industries.find(i => i.slug === slug);
  if (bySlug) return { name: bySlug.name, companies: bySlug.top_companies };

  // 3. Substring match (e.g. "Data Science & Analytics" contains "data science")
  const bySubstr = industries.find(i =>
    lower.includes(i.name.toLowerCase().replace(/[^a-z0-9 ]/g, '')) ||
    i.name.toLowerCase().replace(/[^a-z0-9 ]/g, '').includes(lower)
  );
  if (bySubstr) return { name: bySubstr.name, companies: bySubstr.top_companies };

  return null;
}

// Location→industry hints for location-based scoring
const LOCATION_INDUSTRY_HINTS: Record<string, string[]> = {
  'new york': ['Investment Banking', 'Finance', 'Hedge Funds', 'Private Equity'],
  'san francisco': ['Tech', 'Data Science', 'Machine Learning and AI', 'Venture Capital', 'Fintech'],
  'chicago': ['Management Consulting', 'Finance', 'Corporate Finance'],
  'los angeles': ['Tech', 'Marketing and Advertising', 'Media and Entertainment', 'Gaming'],
  'boston': ['Management Consulting', 'Healthcare', 'Biotech', 'Life Sciences'],
  'dallas': ['Finance', 'Corporate Finance', 'Energy and Utilities'],
  'houston': ['Energy and Utilities', 'Finance'],
  'seattle': ['Tech', 'E-commerce', 'Machine Learning and AI'],
  'austin': ['Tech', 'SaaS', 'Fintech'],
  'washington': ['Government and Policy', 'Cybersecurity', 'Defense and Aerospace'],
};

// ── Discovery rails: curated firm pools per industry ─────────────────────
//
// Used by the Companies tab's "Hidden gems" and "Up and coming" rails. The
// goal is exposure — surface firms a student likely hasn't considered. So:
//   - HIDDEN_GEMS: well-respected mid-tier shops (boutiques, regional
//     leaders, specialty firms) that don't show up first in a Google search.
//   - UP_AND_COMING: late-stage startups / scale-ups in each industry; the
//     "post-Series-B but pre-IPO" cohort that's hiring aggressively.
// Lists are intentionally compact (5-8 firms) and editorialized — we'd
// rather surface fewer, well-chosen names than a long noisy list.
const HIDDEN_GEMS_BY_INDUSTRY: Record<string, string[]> = {
  'investment-banking': ['Centerview Partners', 'Evercore', 'Lazard', 'Moelis & Company', 'PJT Partners', 'Guggenheim Partners', 'Jefferies', 'Houlihan Lokey'],
  'private-equity': ['Vista Equity Partners', 'Thoma Bravo', 'Hellman & Friedman', 'TPG', 'Silver Lake', 'Advent International', 'Genstar Capital'],
  'venture-capital': ['Benchmark', 'USV', 'Founders Fund', 'Ribbit Capital', 'Greenoaks', 'Coatue', 'Iconiq', 'Thrive Capital'],
  'real-estate-private-equity': ['Starwood Capital', 'Tishman Speyer', 'Related Companies', 'Hines', 'CIM Group'],
  'consulting': ['Oliver Wyman', 'Kearney', 'Roland Berger', 'L.E.K. Consulting', 'Parthenon-EY', 'Strategy&', 'ZS Associates', 'Analysis Group'],
  'product-management': ['Notion', 'Linear', 'Figma', 'Ramp', 'Brex', 'Retool', 'Vercel', 'Plaid'],
  'software-engineering': ['Stripe', 'Anthropic', 'Databricks', 'Snowflake', 'Cloudflare', 'HashiCorp', 'Confluent', 'MongoDB'],
  'data-science-analytics': ['Palantir', 'dbt Labs', 'Hex', 'Mode', 'Fivetran', 'Census', 'Looker'],
  'artificial-intelligence': ['Anthropic', 'Cohere', 'Hugging Face', 'Scale AI', 'Runway', 'Adept', 'Inflection'],
};

const UP_AND_COMING_BY_INDUSTRY: Record<string, string[]> = {
  'investment-banking': ['Liontree', 'Allen & Company', 'Solomon Partners', 'BDT & MSD Partners', 'Qatalyst Partners'],
  'private-equity': ['Clearlake Capital', 'Veritas Capital', 'New Mountain Capital', 'Insight Partners', 'General Atlantic'],
  'venture-capital': ['Lightspeed', 'Bessemer', 'Lerer Hippeau', 'Forerunner', 'BoxGroup', 'Slow Ventures', 'Founder Collective'],
  'consulting': ['Bridgespan', 'Putnam Associates', 'Charles River Associates', 'Cornerstone Research'],
  'product-management': ['Posthog', 'Liveblocks', 'Resend', 'Liveblocks', 'Sanity', 'Highlight'],
  'software-engineering': ['Modal', 'Replicate', 'Pinecone', 'Vercel', 'Supabase', 'Render', 'Fly.io'],
  'data-science-analytics': ['Hex', 'Census', 'Materialize', 'ClickHouse', 'Cube'],
  'artificial-intelligence': ['Perplexity', 'Mistral', 'Together AI', 'Eleven Labs', 'Pika', 'Cursor (Anysphere)'],
  'fintech': ['Mercury', 'Brex', 'Ramp', 'Public', 'Modern Treasury', 'Unit', 'Pilot'],
};

function _industrySlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function _resolveTopIndustry(ctx: UserContext): { name: string; slug: string } | null {
  // Pick the user's most-likely primary industry: target firms hint, then
  // first targetIndustries, then careerTrack.
  const candidates: string[] = [
    ...(ctx.targetIndustries || []).slice(0, 3),
    ctx.careerTrack || '',
  ].filter(Boolean);
  for (const c of candidates) {
    const match = findMatchingIndustry(c);
    if (match) return { name: match.name, slug: _industrySlug(match.name) };
  }
  return null;
}

/** Hidden gems — mid-tier firms in user's top industry the user likely
 *  hasn't auto-considered. Excludes firms in the user's target/dream lists. */
export function getHiddenGems(ctx: UserContext, limit = 6): RecommendedCompany[] {
  const top = _resolveTopIndustry(ctx);
  if (!top) return [];
  const pool = HIDDEN_GEMS_BY_INDUSTRY[top.slug] || [];
  if (!pool.length) return [];
  const exclude = new Set<string>();
  for (const f of [...(ctx.targetFirms || []), ...(ctx.dreamCompanies || [])]) {
    if (f) exclude.add(f.trim().toLowerCase());
  }
  const out: RecommendedCompany[] = [];
  for (const firm of pool) {
    if (exclude.has(firm.toLowerCase())) continue;
    out.push({
      company: firm,
      industry: top.name,
      score: 50,
      reason: `Hidden gem in ${top.name}`,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Up and coming — late-stage startups / scale-ups in user's top industry. */
export function getUpAndComing(ctx: UserContext, limit = 6): RecommendedCompany[] {
  const top = _resolveTopIndustry(ctx);
  if (!top) return [];
  const pool = UP_AND_COMING_BY_INDUSTRY[top.slug] || [];
  if (!pool.length) return [];
  const exclude = new Set<string>();
  for (const f of [...(ctx.targetFirms || []), ...(ctx.dreamCompanies || [])]) {
    if (f) exclude.add(f.trim().toLowerCase());
  }
  const out: RecommendedCompany[] = [];
  for (const firm of pool) {
    if (exclude.has(firm.toLowerCase())) continue;
    out.push({
      company: firm,
      industry: top.name,
      score: 30,
      reason: `Up and coming in ${top.name}`,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function getRecommendedCompanies(ctx: UserContext): RecommendedCompany[] {
  const uni = shortUniversity(ctx.university);

  // ── Tier 1: explicit target firms ────────────────────────────────────────
  // The user wrote these into their Direction. Surface them first, every time.
  // We pick a representative industry for the card if we can match the firm to one.
  const tierOne: RecommendedCompany[] = [];
  const targetFirmsSeen = new Set<string>();
  for (const firm of ctx.targetFirms) {
    const trimmed = (firm || '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (targetFirmsSeen.has(key)) continue;
    targetFirmsSeen.add(key);
    // Try to find the firm in our industries data so we can label its sector
    let industryLabel = '';
    for (const ind of industries) {
      if (ind.top_companies.some((c) => c.toLowerCase() === key)) {
        industryLabel = ind.name;
        break;
      }
    }
    tierOne.push({
      company: trimmed,
      industry: industryLabel || 'Your target',
      score: 1000, // ensures these always sort first
      reason: 'Your target firm',
      isTargetFirm: true,
    });
  }

  // ── Tier 2: dream companies from onboarding ──────────────────────────────
  // The user picked these explicitly during onboarding. They sit between
  // target firms (Direction extractor) and industry-derived suggestions.
  const tierTwo: RecommendedCompany[] = [];
  const dreamSeen = new Set<string>(targetFirmsSeen);
  for (const firm of ctx.dreamCompanies) {
    const trimmed = (firm || '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (dreamSeen.has(key)) continue;
    dreamSeen.add(key);
    let industryLabel = '';
    for (const ind of industries) {
      if (ind.top_companies.some((c) => c.toLowerCase() === key)) {
        industryLabel = ind.name;
        break;
      }
    }
    tierTwo.push({
      company: trimmed,
      industry: industryLabel || 'Your dream',
      score: 500, // sits below target firms but above industry-derived
      reason: 'On your dream company list',
      isDreamCompany: true,
    });
  }

  // Resolve user interests to actual industry data
  const matchedIndustries = ctx.targetIndustries
    .map(findMatchingIndustry)
    .filter((x): x is { name: string; companies: string[] } => !!x);

  // Also try to match career track
  const careerTrackMatch = ctx.careerTrack ? findMatchingIndustry(ctx.careerTrack) : null;

  // Build candidate pool: matched industries first, then all industries for diversity
  // Track list position so top-ranked companies in each list break ties over alphabetical
  const candidates: { company: string; industry: string; listRank: number }[] = [];
  const seen = new Set<string>();

  // Add companies from user's matched industries
  for (const match of matchedIndustries) {
    for (let idx = 0; idx < match.companies.length; idx++) {
      const company = match.companies[idx];
      if (!seen.has(company)) {
        seen.add(company);
        candidates.push({ company, industry: match.name, listRank: idx });
      }
    }
  }

  // Add career track companies
  if (careerTrackMatch) {
    for (let idx = 0; idx < careerTrackMatch.companies.length; idx++) {
      const company = careerTrackMatch.companies[idx];
      if (!seen.has(company)) {
        seen.add(company);
        candidates.push({ company, industry: careerTrackMatch.name, listRank: idx });
      }
    }
  }

  // Add companies from all other industries for diversity
  for (const ind of industries) {
    for (let idx = 0; idx < ind.top_companies.length; idx++) {
      const company = ind.top_companies[idx];
      if (!seen.has(company)) {
        seen.add(company);
        candidates.push({ company, industry: ind.name, listRank: idx });
      }
    }
  }

  const matchedNames = new Set(matchedIndustries.map(m => m.name));

  // Score each candidate
  const scored = candidates.map(({ company, industry, listRank }) => {
    let score = 0;
    let locationMatch = '';
    let industryMatch = false;
    let careerTrackBoost = false;

    // +3 for direct industry match (user's selected interests)
    if (matchedNames.has(industry)) {
      score += 3;
      industryMatch = true;
    }

    // +2 for career track match
    if (careerTrackMatch && careerTrackMatch.name === industry) {
      score += 2;
      careerTrackBoost = true;
    }

    // +1 for location match
    for (const loc of ctx.preferredLocations) {
      const locLower = loc.toLowerCase();
      const hintIndustries = Object.entries(LOCATION_INDUSTRY_HINTS)
        .filter(([k]) => locLower.includes(k))
        .flatMap(([, v]) => v);
      if (hintIndustries.includes(industry)) {
        score += 1;
        locationMatch = loc.split(',')[0].trim();
        break;
      }
    }

    // Build reason
    let reason: string;
    if (industryMatch && locationMatch) {
      reason = `${industry} in ${locationMatch}`;
    } else if (industryMatch) {
      reason = `Top in ${industry}`;
    } else if (careerTrackBoost) {
      reason = `Great for ${industry}`;
    } else if (locationMatch) {
      reason = `Strong in ${locationMatch}`;
    } else {
      reason = `Top ${industry} employer`;
    }

    return { company, industry, score, reason, listRank };
  });

  // Sort by score desc, then by list position (top-ranked in industry list first)
  scored.sort((a, b) => b.score - a.score || a.listRank - b.listRank);

  // Selection strategy: lead with the user's strongest industry signals, then
  // allow at most 2 different industries in the final slate. The previous
  // "one company per industry" rule meant a user with 5 stated industries got
  // a kitchen-sink list (Tech + Marketing + Fintech + IB + PE) even when their
  // resume / Direction made the actual focus obvious. Concentrating in the
  // top-scoring industry feels truer to the user's primary goal.
  const top: typeof scored = [];
  const usedIndustries = new Set<string>();
  const used = new Set<string>();
  const MAX_DISTINCT_INDUSTRIES = 2;

  // Pass 1: lead with the highest-scoring company. Subsequent picks may add a
  // second industry, but never a third — once 2 distinct industries are in,
  // remaining slots fill from the user's primary industry pool.
  for (const card of scored) {
    if (top.length >= 5) break;
    if (used.has(card.company)) continue;
    if (
      usedIndustries.size < MAX_DISTINCT_INDUSTRIES ||
      usedIndustries.has(card.industry)
    ) {
      top.push(card);
      usedIndustries.add(card.industry);
      used.add(card.company);
    }
  }

  // Pass 2: if we still have room (because the primary industry pool was
  // exhausted before hitting 5), open back up to any high-score candidate.
  for (const card of scored) {
    if (top.length >= 5) break;
    if (!used.has(card.company)) {
      top.push(card);
      used.add(card.company);
    }
  }
  const usedReasons = new Set<string>();
  const roleLabel = inferRoleLabel(ctx, '');
  for (const card of top) {
    if (usedReasons.has(card.reason)) {
      // Try alternate reason forms
      if (uni && card.score > 0) {
        card.reason = `Popular with ${uni}`;
      } else if (roleLabel) {
        card.reason = `Top employer for ${roleLabel}`;
      } else {
        card.reason = `Leading ${card.industry} firm`;
      }
    }
    usedReasons.add(card.reason);
  }

  // Build final industry-driven result with optional reasoning hints
  const industryDriven: RecommendedCompany[] = top.map(card => {
    const rec: RecommendedCompany = {
      company: card.company,
      industry: card.industry,
      score: card.score,
      reason: card.reason,
    };

    // Reasoning hint = the user's university label only. No fabricated
    // alumni counts — until we wire this to a real PDL/Firestore query we
    // do not render a number. The qualifier ("hiring in your field now")
    // is still derived from the user's industry score, which is real
    // profile data.
    if (uni && card.score >= 3) {
      rec.reasoning = {
        primary: { label: `${uni} alumni` },
        qualifier: card.score >= 4 ? 'hiring in your field now' : undefined,
      };
    } else if (uni && card.score >= 1) {
      rec.reasoning = {
        primary: { label: `${uni} alumni` },
      };
    }

    return rec;
  });

  // ── Compose final list: target firms → dream companies → industry-driven ──
  const finalSeen = new Set<string>();
  const out: RecommendedCompany[] = [];
  for (const card of tierOne) {
    const key = card.company.toLowerCase();
    if (finalSeen.has(key)) continue;
    finalSeen.add(key);
    // Add school-alumni reasoning hint to target firms too (label only,
    // no fabricated count).
    if (uni) {
      card.reasoning = {
        primary: { label: `${uni} alumni` },
      };
    }
    out.push(card);
  }
  for (const card of tierTwo) {
    const key = card.company.toLowerCase();
    if (finalSeen.has(key)) continue;
    finalSeen.add(key);
    if (uni) {
      card.reasoning = {
        primary: { label: `${uni} alumni` },
      };
    }
    out.push(card);
  }
  for (const card of industryDriven) {
    const key = card.company.toLowerCase();
    if (finalSeen.has(key)) continue;
    finalSeen.add(key);
    out.push(card);
  }

  return out;
}

// ── Role inference for recommendation card prompts ──────────────────

// Map user-facing interest names → role labels for prompts
const INTEREST_ROLE_LABELS: Record<string, string> = {
  'Data Science & Analytics': 'data scientists',
  'Software Development': 'software engineers',
  'Investment Banking': 'investment banking analysts',
  'Management Consulting': 'consultants',
  'Strategy Consulting': 'strategy consultants',
  'Marketing & Advertising': 'marketing professionals',
  'Product Management': 'product managers',
  'Artificial Intelligence / Machine Learning': 'machine learning engineers',
  'Cybersecurity': 'cybersecurity engineers',
  'Cloud Computing': 'cloud engineers',
  'UX/UI Design': 'designers',
  'FinTech': 'fintech engineers',
  'Private Equity': 'private equity analysts',
  'Venture Capital': 'venture capital analysts',
  'Hedge Funds': 'hedge fund analysts',
  'Accounting': 'accountants',
  'Human Resources / Recruiting': 'recruiters',
  'Finance (Wealth Management, Private Equity, Hedge Funds)': 'finance professionals',
  'Wealth Management': 'wealth management advisors',
};

const CAREER_TRACK_ROLES: Record<string, string> = {
  'Software Engineering': 'software engineers',
  'Investment Banking': 'investment banking analysts',
  'Management Consulting': 'consultants',
  'Product Management': 'product managers',
  'Private Equity / VC': 'private equity analysts',
  'Sales & Trading': 'sales & trading analysts',
  'Corporate Finance / FP&A': 'finance analysts',
  'Data Science': 'data scientists',
};

// Fallback: card industry → generic role (uses industry names from industries.ts)
const INDUSTRY_ROLE_LABELS: Record<string, string> = {
  'Investment Banking': 'investment banking analysts',
  'Management Consulting': 'consultants',
  'Tech': 'software engineers',
  'Data Science': 'data scientists',
  'Machine Learning and AI': 'ML engineers',
  'Product Management': 'product managers',
  'Fintech': 'fintech professionals',
  'Private Equity': 'private equity analysts',
  'Venture Capital': 'venture capital analysts',
  'Hedge Funds': 'hedge fund analysts',
  'Finance': 'finance professionals',
  'Corporate Finance': 'finance analysts',
  'Marketing and Advertising': 'marketing professionals',
  'Healthcare': 'healthcare professionals',
  'Cybersecurity': 'cybersecurity engineers',
  'SaaS': 'software engineers',
  'Enterprise Software': 'software engineers',
  'E-commerce': 'product managers',
  'Biotech': 'research associates',
  'Pharmaceuticals': 'pharma professionals',
  'Accounting': 'accountants',
  'Real Estate': 'real estate analysts',
  'Energy and Utilities': 'energy analysts',
  'Defense and Aerospace': 'defense professionals',
  'Aerospace': 'aerospace engineers',
  'Media and Entertainment': 'media professionals',
  'Consumer Goods': 'brand managers',
};

export function inferRoleLabel(ctx: UserContext, cardIndustry: string): string {
  // 1. Explicit preferred role
  if (ctx.preferredJobRole) return ctx.preferredJobRole;

  // 2. Career track
  if (ctx.careerTrack && CAREER_TRACK_ROLES[ctx.careerTrack])
    return CAREER_TRACK_ROLES[ctx.careerTrack];

  // 3. User's interests — first one that has a role mapping
  for (const interest of ctx.targetIndustries) {
    if (INTEREST_ROLE_LABELS[interest]) return INTEREST_ROLE_LABELS[interest];
  }

  // 4. Card's industry
  return INDUSTRY_ROLE_LABELS[cardIndustry] || '';
}

export { EMPTY_CONTEXT };
