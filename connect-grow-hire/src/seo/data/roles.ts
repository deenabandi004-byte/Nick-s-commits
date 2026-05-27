/*
 * Role registry. 4 roles per industry x 3 industries = 12 role variants.
 * Cluster data files reference these by slug.
 */
import type { Role } from './types';

export const ROLES: Role[] = [
  // ─── Banking ──────────────────────────────────────────────────────
  { slug: 'ib-analyst', name: 'Investment Banking Analyst', shortName: 'IB Analyst', industry: 'banking', blurb: 'Front-office M&A, capital markets, and advisory work in the analyst class.' },
  { slug: 'st-analyst', name: 'Sales & Trading Analyst', shortName: 'S&T Analyst', industry: 'banking', blurb: 'Markets-side role across cash equities, FX, rates, credit.' },
  { slug: 'tech-ib-analyst', name: 'TMT Investment Banking Analyst', shortName: 'TMT IB Analyst', industry: 'banking', blurb: 'Coverage analyst within the Technology, Media, and Telecom industry group.' },
  { slug: 'am-analyst', name: 'Asset Management Analyst', shortName: 'AM Analyst', industry: 'banking', blurb: 'Buyside, fundamental research, multi-asset, and portfolio analytics.' },

  // ─── Consulting ───────────────────────────────────────────────────
  { slug: 'ba', name: 'Business Analyst', shortName: 'BA', industry: 'consulting', blurb: 'Undergrad entry-level consultant track, 2 to 3 year program before MBA or staying on.' },
  { slug: 'consultant', name: 'Consultant', shortName: 'Consultant', industry: 'consulting', blurb: 'Post-MBA / experienced entry level for senior associate-equivalent track.' },
  { slug: 'implementation', name: 'Implementation Consultant', shortName: 'Implementation', industry: 'consulting', blurb: 'McKinsey Implementation practice and equivalent on-the-ground execution roles.' },
  { slug: 'tech-analyst', name: 'Technology Analyst', shortName: 'Tech Analyst', industry: 'consulting', blurb: 'Digital and technology consulting arm (McKinsey Digital, Bain DigitalX, BCG X).' },

  // ─── Tech ─────────────────────────────────────────────────────────
  { slug: 'swe', name: 'Software Engineer', shortName: 'SWE', industry: 'tech', blurb: 'New-grad and intern software engineering tracks across product and infrastructure teams.' },
  { slug: 'pm', name: 'Product Manager', shortName: 'PM', industry: 'tech', blurb: 'Associate and rotational PM programs (APM, RPM, etc).' },
  { slug: 'ds', name: 'Data Scientist', shortName: 'DS', industry: 'tech', blurb: 'Analytics, experimentation, and applied modeling roles.' },
  { slug: 'mle', name: 'ML Engineer', shortName: 'ML Engineer', industry: 'tech', blurb: 'Applied ML, training infrastructure, and model deployment roles.' },
];

export const ROLES_BY_SLUG: Record<string, Role> = Object.fromEntries(
  ROLES.map((r) => [r.slug, r])
);

export const getRole = (slug: string): Role | undefined => ROLES_BY_SLUG[slug];
