#!/usr/bin/env node
/*
 * Generates an SEO sitemap fragment from the 4 cluster data files.
 * Emits only rows with `published: true`. Run as part of the build:
 *
 *   node scripts/generate-seo-sitemap.cjs
 *
 * Output: connect-grow-hire/public/sitemap-seo.xml
 *
 * This is the staggered-release mechanism per SEO_ROLLOUT_PLAN.md.
 * Pages exist in code (the route resolves any seeded slug) but Google
 * sees them only when the row's `published` flag flips to true.
 *
 * For Wave 0 the URLs emit under /seo-preview/* (noindex) so this fragment
 * is for review-and-validation only; the production sitemap entry point
 * (sitemap.xml) does NOT include this fragment yet. Once the format is
 * approved and the noindex is removed, point sitemap.xml at this fragment.
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.offerloop.ai';

// CommonJS quasi-parser for the TS data files. We don't run TS in the
// build script; instead we parse the data files with a regex match on
// the slug + published fields. This is brittle but adequate for the
// review phase. When promoting to production sitemap, replace with a
// proper ts-node or build-step import.

function extractRows(filePath, urlPrefix) {
  if (!fs.existsSync(filePath)) return [];
  const src = fs.readFileSync(filePath, 'utf8');
  const slugMatches = [...src.matchAll(/slug:\s*'([^']+)'[\s\S]*?published:\s*(true|false)/g)];
  return slugMatches
    .filter((m) => m[2] === 'true')
    .map((m) => ({ slug: m[1], url: `${BASE_URL}${urlPrefix}/${m[1]}` }));
}

const here = __dirname;
const dataDir = path.join(here, '..', 'src', 'seo', 'data');

// Clean, indexable production prefixes. The templates emit index,follow only on
// these prefixes (and only for published rows); the /seo-preview/* twins stay
// noindex. find-people is still in review (noindex) so it is omitted here.
const clusters = [
  { file: 'resume-review.ts', prefix: '/resume-review' },
  { file: 'cover-letter.ts', prefix: '/cover-letter' },
  { file: 'interview-prep.ts', prefix: '/interview-prep' },
  { file: 'ats.ts', prefix: '/ats' },
];

// Generated rows (from backend/scripts/seo_build_pages.py) live as JSON next to
// the hand-authored .ts files. Read their published rows too.
function extractGeneratedRows(filePath, urlPrefix) {
  if (!fs.existsSync(filePath)) return [];
  let rows;
  try { rows = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return []; }
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r && r.published === true && r.slug)
    .map((r) => ({ slug: r.slug, url: `${BASE_URL}${urlPrefix}/${r.slug}` }));
}

const allUrls = [{ slug: 'free-tools', url: `${BASE_URL}/free-tools` }];
for (const c of clusters) {
  const handAuthored = extractRows(path.join(dataDir, c.file), c.prefix);
  const generated = extractGeneratedRows(
    path.join(dataDir, 'generated', c.file.replace('.ts', '.generated.json')),
    c.prefix
  );
  // de-dupe by slug (hand-authored wins)
  const seen = new Set(handAuthored.map((r) => r.slug));
  const merged = handAuthored.concat(generated.filter((r) => !seen.has(r.slug)));
  for (const r of merged) allUrls.push(r);
  console.log(`[seo-sitemap] ${c.file}: ${handAuthored.length} hand + ${merged.length - handAuthored.length} generated published rows`);
}

const today = new Date().toISOString().slice(0, 10);
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map((u) => `  <url>
    <loc>${u.url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('\n')}
</urlset>
`;

const outPath = path.join(here, '..', 'public', 'sitemap-seo.xml');
fs.writeFileSync(outPath, xml);
console.log(`[seo-sitemap] wrote ${allUrls.length} URLs to ${outPath}`);
