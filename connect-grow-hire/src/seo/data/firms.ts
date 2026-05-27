/*
 * Firm registry. 25 Tier-1 firms across banking, consulting, tech.
 *
 * The ATS attribution is best public knowledge as of May 2026, sourced
 * from the firm's careers portal subdomain + employee reports on
 * Glassdoor/Reddit. Verify before publishing; update via the quarterly
 * refresh per ranking-playbook.md.
 */
import type { Firm } from './types';

export const FIRMS: Firm[] = [
  // ─── Banking (10) ─────────────────────────────────────────────────
  { slug: 'goldman-sachs', name: 'Goldman Sachs', shortName: 'Goldman', industry: 'banking', ats: 'Workday', applicationDomain: 'goldmansachs.com' },
  { slug: 'jpmorgan', name: 'JPMorgan', shortName: 'JPMorgan', industry: 'banking', ats: 'Workday', applicationDomain: 'jpmorganchase.com' },
  { slug: 'morgan-stanley', name: 'Morgan Stanley', shortName: 'Morgan Stanley', industry: 'banking', ats: 'Workday', applicationDomain: 'morganstanley.com' },
  { slug: 'bank-of-america', name: 'Bank of America', shortName: 'BofA', industry: 'banking', ats: 'Workday', applicationDomain: 'bankofamerica.com' },
  { slug: 'citi', name: 'Citi', shortName: 'Citi', industry: 'banking', ats: 'Workday', applicationDomain: 'citigroup.com' },
  { slug: 'evercore', name: 'Evercore', shortName: 'Evercore', industry: 'banking', ats: 'Workday', applicationDomain: 'evercore.com' },
  { slug: 'lazard', name: 'Lazard', shortName: 'Lazard', industry: 'banking', ats: 'Workday', applicationDomain: 'lazard.com' },
  { slug: 'centerview', name: 'Centerview Partners', shortName: 'Centerview', industry: 'banking', ats: 'Greenhouse', applicationDomain: 'centerviewpartners.com' },
  { slug: 'moelis', name: 'Moelis & Company', shortName: 'Moelis', industry: 'banking', ats: 'Workday', applicationDomain: 'moelis.com' },
  { slug: 'houlihan-lokey', name: 'Houlihan Lokey', shortName: 'Houlihan', industry: 'banking', ats: 'Workday', applicationDomain: 'hl.com' },

  // ─── Consulting (5) ───────────────────────────────────────────────
  { slug: 'mckinsey', name: 'McKinsey & Company', shortName: 'McKinsey', industry: 'consulting', ats: 'Internal', applicationDomain: 'mckinsey.com' },
  { slug: 'bain', name: 'Bain & Company', shortName: 'Bain', industry: 'consulting', ats: 'Internal', applicationDomain: 'bain.com' },
  { slug: 'bcg', name: 'Boston Consulting Group', shortName: 'BCG', industry: 'consulting', ats: 'Internal', applicationDomain: 'bcg.com' },
  { slug: 'deloitte', name: 'Deloitte Consulting', shortName: 'Deloitte', industry: 'consulting', ats: 'Workday', applicationDomain: 'deloitte.com' },
  { slug: 'ey-parthenon', name: 'EY-Parthenon', shortName: 'EY-Parthenon', industry: 'consulting', ats: 'Workday', applicationDomain: 'ey.com' },

  // ─── Tech (10) ────────────────────────────────────────────────────
  { slug: 'google', name: 'Google', shortName: 'Google', industry: 'tech', ats: 'Internal', applicationDomain: 'google.com' },
  { slug: 'meta', name: 'Meta', shortName: 'Meta', industry: 'tech', ats: 'Internal', applicationDomain: 'meta.com' },
  { slug: 'amazon', name: 'Amazon', shortName: 'Amazon', industry: 'tech', ats: 'Internal', applicationDomain: 'amazon.jobs' },
  { slug: 'microsoft', name: 'Microsoft', shortName: 'Microsoft', industry: 'tech', ats: 'Internal', applicationDomain: 'microsoft.com' },
  { slug: 'apple', name: 'Apple', shortName: 'Apple', industry: 'tech', ats: 'Internal', applicationDomain: 'apple.com' },
  { slug: 'stripe', name: 'Stripe', shortName: 'Stripe', industry: 'tech', ats: 'Greenhouse', applicationDomain: 'stripe.com' },
  { slug: 'anthropic', name: 'Anthropic', shortName: 'Anthropic', industry: 'tech', ats: 'Lever', applicationDomain: 'anthropic.com' },
  { slug: 'openai', name: 'OpenAI', shortName: 'OpenAI', industry: 'tech', ats: 'Greenhouse', applicationDomain: 'openai.com' },
  { slug: 'nvidia', name: 'NVIDIA', shortName: 'NVIDIA', industry: 'tech', ats: 'Workday', applicationDomain: 'nvidia.com' },
  { slug: 'tesla', name: 'Tesla', shortName: 'Tesla', industry: 'tech', ats: 'Workday', applicationDomain: 'tesla.com' },
];

export const FIRMS_BY_SLUG: Record<string, Firm> = Object.fromEntries(
  FIRMS.map((f) => [f.slug, f])
);

export const getFirm = (slug: string): Firm | undefined => FIRMS_BY_SLUG[slug];
