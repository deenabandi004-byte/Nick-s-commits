/*
 * Live find-people pages. First batch expanded to 25 on 2026-06-16 with approval.
 *
 * ONLY these slugs render index,follow (at the /people/ prefix) and appear in the
 * production sitemap. Every other find-people page stays noindex. Single source of
 * truth: the template reads it for robots + canonical, the sitemap lists exactly
 * these. 25 strongest cells (full PDL sample, well above the floor, clean role
 * data), spread across banking, consulting, and tech for a clean index watch.
 */
export const LIVE_FIND_PEOPLE_SLUGS = new Set<string>([
  // banking
  'nyu-alumni-at-morgan-stanley',
  'nyu-alumni-at-jpmorgan',
  'upenn-alumni-at-morgan-stanley',
  'columbia-alumni-at-morgan-stanley',
  'harvard-alumni-at-goldman-sachs',
  'berkeley-alumni-at-goldman-sachs',
  'uchicago-alumni-at-goldman-sachs',
  'cornell-alumni-at-jpmorgan',
  // consulting
  'berkeley-alumni-at-bcg',
  'northwestern-alumni-at-bcg',
  'michigan-alumni-at-bcg',
  'columbia-alumni-at-mckinsey',
  'upenn-alumni-at-mckinsey',
  'cornell-alumni-at-mckinsey',
  'michigan-alumni-at-mckinsey',
  'harvard-alumni-at-bain',
  // tech
  'berkeley-alumni-at-meta',
  'columbia-alumni-at-meta',
  'berkeley-alumni-at-google',
  'usc-alumni-at-google',
  'columbia-alumni-at-amazon',
  'michigan-alumni-at-microsoft',
  'usc-alumni-at-amazon',
  'harvard-alumni-at-microsoft',
  'michigan-alumni-at-apple',
]);
