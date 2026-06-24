/*
 * Firm registry. 60 Tier-1 firms across banking/finance, consulting, tech.
 *
 * The ATS attribution is best public knowledge as of June 2026, sourced
 * from the firm's careers portal subdomain + employee reports on
 * Glassdoor/Reddit. Verify before publishing; the seo_build_pages.py
 * fact pull re-confirms ATS per firm and the quarterly refresh updates it
 * per ranking-playbook.md.
 *
 * `industry` is one of three buckets that map to the role registry. PE / HF /
 * asset-management firms live under 'banking' (the am-analyst / ib-analyst
 * roles cover the buy-side angle).
 */
import type { Firm } from './types';

export const FIRMS: Firm[] = [
  // ─── Banking & Finance (23) ───────────────────────────────────────
  // Bulge bracket
  { slug: 'goldman-sachs', name: 'Goldman Sachs', shortName: 'Goldman', industry: 'banking', ats: 'Workday', applicationDomain: 'goldmansachs.com' },
  { slug: 'jpmorgan', name: 'JPMorgan', shortName: 'JPMorgan', industry: 'banking', ats: 'Workday', applicationDomain: 'jpmorganchase.com' },
  { slug: 'morgan-stanley', name: 'Morgan Stanley', shortName: 'Morgan Stanley', industry: 'banking', ats: 'Workday', applicationDomain: 'morganstanley.com' },
  { slug: 'bank-of-america', name: 'Bank of America', shortName: 'BofA', industry: 'banking', ats: 'Workday', applicationDomain: 'bankofamerica.com' },
  { slug: 'citi', name: 'Citi', shortName: 'Citi', industry: 'banking', ats: 'Workday', applicationDomain: 'citigroup.com' },
  { slug: 'barclays', name: 'Barclays', shortName: 'Barclays', industry: 'banking', ats: 'Workday', applicationDomain: 'barclays.com' },
  { slug: 'ubs', name: 'UBS', shortName: 'UBS', industry: 'banking', ats: 'Workday', applicationDomain: 'ubs.com' },
  { slug: 'deutsche-bank', name: 'Deutsche Bank', shortName: 'Deutsche Bank', industry: 'banking', ats: 'Workday', applicationDomain: 'db.com' },
  { slug: 'rbc', name: 'RBC Capital Markets', shortName: 'RBC', industry: 'banking', ats: 'Workday', applicationDomain: 'rbc.com' },
  { slug: 'wells-fargo', name: 'Wells Fargo', shortName: 'Wells Fargo', industry: 'banking', ats: 'Workday', applicationDomain: 'wellsfargo.com' },
  // Elite boutique / advisory
  { slug: 'evercore', name: 'Evercore', shortName: 'Evercore', industry: 'banking', ats: 'Workday', applicationDomain: 'evercore.com' },
  { slug: 'lazard', name: 'Lazard', shortName: 'Lazard', industry: 'banking', ats: 'Workday', applicationDomain: 'lazard.com' },
  { slug: 'centerview', name: 'Centerview Partners', shortName: 'Centerview', industry: 'banking', ats: 'Greenhouse', applicationDomain: 'centerviewpartners.com' },
  { slug: 'moelis', name: 'Moelis & Company', shortName: 'Moelis', industry: 'banking', ats: 'Workday', applicationDomain: 'moelis.com' },
  { slug: 'houlihan-lokey', name: 'Houlihan Lokey', shortName: 'Houlihan', industry: 'banking', ats: 'Workday', applicationDomain: 'hl.com' },
  { slug: 'pjt-partners', name: 'PJT Partners', shortName: 'PJT', industry: 'banking', ats: 'Greenhouse', applicationDomain: 'pjtpartners.com' },
  { slug: 'perella-weinberg', name: 'Perella Weinberg Partners', shortName: 'Perella Weinberg', industry: 'banking', ats: 'Greenhouse', applicationDomain: 'pwpartners.com' },
  { slug: 'jefferies', name: 'Jefferies', shortName: 'Jefferies', industry: 'banking', ats: 'Workday', applicationDomain: 'jefferies.com' },
  { slug: 'guggenheim', name: 'Guggenheim Partners', shortName: 'Guggenheim', industry: 'banking', ats: 'Workday', applicationDomain: 'guggenheimpartners.com' },
  // Private equity / hedge funds / asset management
  { slug: 'blackstone', name: 'Blackstone', shortName: 'Blackstone', industry: 'banking', ats: 'Workday', applicationDomain: 'blackstone.com' },
  { slug: 'kkr', name: 'KKR', shortName: 'KKR', industry: 'banking', ats: 'Workday', applicationDomain: 'kkr.com' },
  { slug: 'citadel', name: 'Citadel', shortName: 'Citadel', industry: 'banking', ats: 'Greenhouse', applicationDomain: 'citadel.com' },
  { slug: 'blackrock', name: 'BlackRock', shortName: 'BlackRock', industry: 'banking', ats: 'Workday', applicationDomain: 'blackrock.com' },

  // ─── Consulting (13) ──────────────────────────────────────────────
  { slug: 'mckinsey', name: 'McKinsey & Company', shortName: 'McKinsey', industry: 'consulting', ats: 'Internal', applicationDomain: 'mckinsey.com' },
  { slug: 'bain', name: 'Bain & Company', shortName: 'Bain', industry: 'consulting', ats: 'Internal', applicationDomain: 'bain.com' },
  { slug: 'bcg', name: 'Boston Consulting Group', shortName: 'BCG', industry: 'consulting', ats: 'Internal', applicationDomain: 'bcg.com' },
  { slug: 'deloitte', name: 'Deloitte Consulting', shortName: 'Deloitte', industry: 'consulting', ats: 'Workday', applicationDomain: 'deloitte.com' },
  { slug: 'ey-parthenon', name: 'EY-Parthenon', shortName: 'EY-Parthenon', industry: 'consulting', ats: 'Workday', applicationDomain: 'ey.com' },
  { slug: 'strategy-and', name: 'Strategy& (PwC)', shortName: 'Strategy&', industry: 'consulting', ats: 'Workday', applicationDomain: 'strategyand.pwc.com' },
  { slug: 'kpmg', name: 'KPMG', shortName: 'KPMG', industry: 'consulting', ats: 'Workday', applicationDomain: 'kpmg.com' },
  { slug: 'accenture', name: 'Accenture', shortName: 'Accenture', industry: 'consulting', ats: 'Workday', applicationDomain: 'accenture.com' },
  { slug: 'oliver-wyman', name: 'Oliver Wyman', shortName: 'Oliver Wyman', industry: 'consulting', ats: 'Workday', applicationDomain: 'oliverwyman.com' },
  { slug: 'kearney', name: 'Kearney', shortName: 'Kearney', industry: 'consulting', ats: 'Workday', applicationDomain: 'kearney.com' },
  { slug: 'lek', name: 'L.E.K. Consulting', shortName: 'L.E.K.', industry: 'consulting', ats: 'Greenhouse', applicationDomain: 'lek.com' },
  { slug: 'booz-allen', name: 'Booz Allen Hamilton', shortName: 'Booz Allen', industry: 'consulting', ats: 'Workday', applicationDomain: 'boozallen.com' },
  { slug: 'zs-associates', name: 'ZS Associates', shortName: 'ZS', industry: 'consulting', ats: 'Workday', applicationDomain: 'zs.com' },

  // ─── Tech (24) ────────────────────────────────────────────────────
  // Big tech
  { slug: 'google', name: 'Google', shortName: 'Google', industry: 'tech', ats: 'Internal', applicationDomain: 'google.com' },
  { slug: 'meta', name: 'Meta', shortName: 'Meta', industry: 'tech', ats: 'Internal', applicationDomain: 'meta.com' },
  { slug: 'amazon', name: 'Amazon', shortName: 'Amazon', industry: 'tech', ats: 'Internal', applicationDomain: 'amazon.jobs' },
  { slug: 'microsoft', name: 'Microsoft', shortName: 'Microsoft', industry: 'tech', ats: 'Internal', applicationDomain: 'microsoft.com' },
  { slug: 'apple', name: 'Apple', shortName: 'Apple', industry: 'tech', ats: 'Internal', applicationDomain: 'apple.com' },
  { slug: 'netflix', name: 'Netflix', shortName: 'Netflix', industry: 'tech', ats: 'Lever', applicationDomain: 'netflix.com' },
  { slug: 'nvidia', name: 'NVIDIA', shortName: 'NVIDIA', industry: 'tech', ats: 'Workday', applicationDomain: 'nvidia.com' },
  { slug: 'salesforce', name: 'Salesforce', shortName: 'Salesforce', industry: 'tech', ats: 'Workday', applicationDomain: 'salesforce.com' },
  // AI labs
  { slug: 'anthropic', name: 'Anthropic', shortName: 'Anthropic', industry: 'tech', ats: 'Lever', applicationDomain: 'anthropic.com' },
  { slug: 'openai', name: 'OpenAI', shortName: 'OpenAI', industry: 'tech', ats: 'Greenhouse', applicationDomain: 'openai.com' },
  { slug: 'scale-ai', name: 'Scale AI', shortName: 'Scale', industry: 'tech', ats: 'Greenhouse', applicationDomain: 'scale.com' },
  // High-growth / unicorns
  { slug: 'stripe', name: 'Stripe', shortName: 'Stripe', industry: 'tech', ats: 'Greenhouse', applicationDomain: 'stripe.com' },
  { slug: 'databricks', name: 'Databricks', shortName: 'Databricks', industry: 'tech', ats: 'Greenhouse', applicationDomain: 'databricks.com' },
  { slug: 'snowflake', name: 'Snowflake', shortName: 'Snowflake', industry: 'tech', ats: 'Greenhouse', applicationDomain: 'snowflake.com' },
  { slug: 'airbnb', name: 'Airbnb', shortName: 'Airbnb', industry: 'tech', ats: 'Greenhouse', applicationDomain: 'airbnb.com' },
  { slug: 'uber', name: 'Uber', shortName: 'Uber', industry: 'tech', ats: 'Greenhouse', applicationDomain: 'uber.com' },
  { slug: 'doordash', name: 'DoorDash', shortName: 'DoorDash', industry: 'tech', ats: 'Greenhouse', applicationDomain: 'doordash.com' },
  { slug: 'datadog', name: 'Datadog', shortName: 'Datadog', industry: 'tech', ats: 'Greenhouse', applicationDomain: 'datadoghq.com' },
  { slug: 'palantir', name: 'Palantir', shortName: 'Palantir', industry: 'tech', ats: 'Greenhouse', applicationDomain: 'palantir.com' },
  { slug: 'coinbase', name: 'Coinbase', shortName: 'Coinbase', industry: 'tech', ats: 'Greenhouse', applicationDomain: 'coinbase.com' },
  { slug: 'figma', name: 'Figma', shortName: 'Figma', industry: 'tech', ats: 'Greenhouse', applicationDomain: 'figma.com' },
  { slug: 'notion', name: 'Notion', shortName: 'Notion', industry: 'tech', ats: 'Greenhouse', applicationDomain: 'notion.so' },
  { slug: 'ramp', name: 'Ramp', shortName: 'Ramp', industry: 'tech', ats: 'Ashby', applicationDomain: 'ramp.com' },
  { slug: 'tesla', name: 'Tesla', shortName: 'Tesla', industry: 'tech', ats: 'Workday', applicationDomain: 'tesla.com' },
];

export const FIRMS_BY_SLUG: Record<string, Firm> = Object.fromEntries(
  FIRMS.map((f) => [f.slug, f])
);

export const getFirm = (slug: string): Firm | undefined => FIRMS_BY_SLUG[slug];
