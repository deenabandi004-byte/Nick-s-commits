/*
 * Shared types for the SEO data layer.
 *
 * Every page in clusters 1-4 is a row of one of these types, rendered by
 * the matching template. The dynamic route at /seo-preview/<cluster>/:slug
 * looks up the slug in the cluster's array and renders the template.
 *
 * The `published: false` slugs sit in the data file but are excluded from
 * the sitemap (see scripts/generate-seo-sitemap.cjs). This is the staggered
 * release mechanism per SEO_ROLLOUT_PLAN.md.
 */

export type ATSName = 'Workday' | 'Greenhouse' | 'Lever' | 'Ashby' | 'iCIMS' | 'Internal';

export interface Firm {
  /** stable slug, kebab-case */
  slug: string;
  /** display name */
  name: string;
  /** short brand for headlines */
  shortName: string;
  /** industry the firm belongs to */
  industry: 'banking' | 'consulting' | 'tech';
  /** which ATS this firm uses (best public knowledge as of 2026) */
  ats: ATSName;
  /** application portal hostname (for HowTo trust signal) */
  applicationDomain?: string;
}

export interface Role {
  /** stable slug, kebab-case */
  slug: string;
  /** display name */
  name: string;
  /** short label */
  shortName: string;
  /** industry the role is associated with */
  industry: 'banking' | 'consulting' | 'tech';
  /** one-sentence description used in copy */
  blurb: string;
}

export interface StatTile {
  value: string;
  label: string;
}

export interface UniqueDataItem {
  /** short title, headline-cased */
  title: string;
  /** 1-2 sentence body */
  body: string;
}

export interface FAQItem {
  q: string;
  a: string;
}

/**
 * Cluster-1 row (resume review). The example panel data is firm/role-specific
 * and renders inside the template's <ResumeReviewExamplePanel>.
 */
export interface ResumeReviewRow {
  slug: string;
  firmSlug: string;
  roleSlug: string;
  /** The page's exact primary keyword for the H1 and meta */
  primaryKeyword: string;
  /** <=160 chars meta description, includes primary keyword early */
  metaDescription: string;
  /** 40-60 word AEO Quick-Answer block */
  quickAnswer: string;
  /** Stat strip (3 entries, all sourced facts) */
  statStrip: [StatTile, StatTile, StatTile];
  /** "What the widget checks for this JD" cards (6-8 entries) */
  uniqueDataBlock: UniqueDataItem[];
  /** Example panel: scored result with these rewrites */
  examplePanel: {
    studentBlurb: string;       // "USC Marshall student, [firm] [role] JD"
    score: number;
    scoreLabel: string;
    previousScore: number;       // for the "+X from N before edits" badge
    rewriteCount: number;        // shown on the Download button
    recommendations: ExampleRec[];
  };
  /** 6-8 FAQ entries, all tailored to firm + role */
  faq: FAQItem[];
  /** ISO date for the visible "Updated" byline + Article schema */
  updatedAt: string;
  /** if false, route still resolves but sitemap excludes it */
  published: boolean;
}

/**
 * Cluster-5 row (find people, school x firm). The page mirrors the live
 * FindPeopleWidget with a school x firm angle on the free people-search tool.
 * The example panel is clearly-labelled sample output, never a factual claim.
 */
export interface FindPeopleRow {
  slug: string;            // `${schoolSlug}-${firmSlug}`, e.g. 'usc-google'
  schoolSlug: string;      // references src/data/seo-universities.ts
  firmSlug: string;        // references seo/data/firms.ts
  /** role emphasis for the example output; the tool itself accepts any role */
  roleLabel?: string;
  primaryKeyword: string;
  metaDescription: string;
  quickAnswer: string;
  /**
   * Optional verified PDL alumni count for this school x firm cell. Leave
   * undefined until backfilled from a real /person/search. Never ship a
   * fabricated number; the stat strip stands on honest tool facts without it.
   */
  alumniCount?: number;
  statStrip: [StatTile, StatTile, StatTile];
  /** roles the alumni most commonly hold, most common first */
  topRoles: string[];
  /** sample result cards for the idle-state example panel (clearly labelled) */
  examplePeople: { name: string; title: string; school: string }[];
  /**
   * Real per-cell aggregate from a PDL profile sample (data-density upgrade).
   * titleBreakdown and seniority vary genuinely cell to cell and form the page
   * body. Aggregate only, no individual names. Optional so hand-authored rows
   * without it still render.
   */
  titleBreakdown?: { title: string; count: number }[];
  topFunctions?: { title: string; count: number }[];
  priorEmployers?: { name: string; count: number }[];
  sampleSize?: number;
  faq: FAQItem[];
  updatedAt: string;
  published: boolean;
}

export interface ExampleRec {
  section: string;       // e.g. 'EXPERIENCE'
  chip: string;          // e.g. 'Quantify impact'
  severity: 'high' | 'medium' | 'low';
  original: string;
  suggested: string;
  why: string;
}

/**
 * Cluster-2 row (cover letter). The example panel renders the widget's
 * READY ResultsLayout with a fictional letter body inline.
 */
export interface CoverLetterRow {
  slug: string;
  firmSlug: string;
  roleSlug: string;
  primaryKeyword: string;
  metaDescription: string;
  quickAnswer: string;
  uniqueDataBlock: UniqueDataItem[];
  examplePanel: {
    studentBlurb: string;
    location: string;                // e.g. 'Los Angeles' for the job header
    wordCount: number;
    paragraphs: string[];            // ordered list, including greeting and signature
  };
  faq: FAQItem[];
  updatedAt: string;
  published: boolean;
}

/**
 * Cluster-3 row (interview prep). The example panel mirrors the widget's
 * CompletedCard plus a deep preview of what's in the PDF.
 */
export interface InterviewPrepRow {
  slug: string;
  firmSlug: string;
  roleSlug: string;
  primaryKeyword: string;
  metaDescription: string;
  quickAnswer: string;
  /** Round-by-round process breakdown for the example panel */
  process: {
    timeline: string;
    rounds: { name: string; format: string; evaluate: string }[];
  };
  /** Stat strip for the page */
  statStrip: [StatTile, StatTile, StatTile];
  /** A single fully-fleshed sample case / system design / tech question */
  sampleCase: {
    kicker: string;          // e.g. 'CASE 2 OF 4'
    title: string;
    body: string;            // markdown-ish, rendered as <p>s and <ul>s in template
  };
  /** A single PEI / behavioral / system-design sample story */
  sampleBehavioral: {
    kicker: string;          // e.g. 'PEI · LEADERSHIP'
    question: string;
    body: string;
  };
  /** Math drill / coding drill / equivalent */
  drillSample: {
    kicker: string;          // e.g. 'MATH DRILL · 2 OF 18'
    title: string;
    body: string;
  };
  /** Firm-specific intel (4-6 bullets) */
  firmIntel: string[];
  faq: FAQItem[];
  updatedAt: string;
  published: boolean;
}

/**
 * Cluster-4 row (ATS explainer). Two sub-variants share this type:
 * - firm-specific: `firmSlug` set, `roleSlug` undefined
 * - role-specific: `roleSlug` set, `firmSlug` undefined
 * - generic: both undefined (the "what is an ats" hero page)
 */
export interface ATSRow {
  slug: string;
  variant: 'generic' | 'by-firm' | 'by-role';
  firmSlug?: string;
  roleSlug?: string;
  primaryKeyword: string;
  metaDescription: string;
  quickAnswer: string;
  statStrip: [StatTile, StatTile, StatTile];
  /** "What the widget checks" cards, role/firm-tailored */
  uniqueDataBlock: UniqueDataItem[];
  /** Example panel for the embedded resume widget */
  examplePanel: {
    studentBlurb: string;
    score: number;
    scoreLabel: string;
    previousScore: number;
    rewriteCount: number;
    recommendations: ExampleRec[];
  };
  faq: FAQItem[];
  updatedAt: string;
  published: boolean;
}
