/*
 * Builds a UTM-tagged CTA URL for SEO pages. Every SEO page CTA routes through this,
 * so the internal hop from an SEO landing page into the product is attributable.
 * No template hand-codes a CTA URL. Phase 1b of the SEO rollout.
 */

export interface SeoPageMeta {
  /** Template id, e.g. 'cold_email', 'meeting', 'find_alumni'. Becomes utm_campaign. */
  template: string;
  /** Page slug, e.g. 'goldman-sachs' or 'usc-goldman-sachs'. Becomes utm_content. */
  slug: string;
  /** Firm name when the page is firm-specific. Becomes utm_term. */
  firm?: string;
  school?: string;
  role?: string;
}

/**
 * Returns `target` with SEO UTM params appended. Preserves any query params already
 * on `target` (the product pre-fill params, e.g. ?company=Goldman%20Sachs).
 *
 *   buildCtaUrl('/find?company=Goldman%20Sachs', { template: 'cold_email', slug: 'goldman-sachs', firm: 'Goldman Sachs' })
 *   => '/find?company=Goldman+Sachs&utm_source=seo&utm_medium=organic&utm_campaign=cold_email&utm_content=goldman-sachs&utm_term=Goldman+Sachs'
 */
export function buildCtaUrl(target: string, meta: SeoPageMeta): string {
  const [path, existing = ''] = target.split('?');
  const params = new URLSearchParams(existing);
  params.set('utm_source', 'seo');
  params.set('utm_medium', 'organic');
  params.set('utm_campaign', meta.template);
  params.set('utm_content', meta.slug);
  if (meta.firm) params.set('utm_term', meta.firm);
  return `${path}?${params.toString()}`;
}
