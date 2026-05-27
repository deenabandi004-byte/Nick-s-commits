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

const BASE_URL = 'https://offerloop.ai';

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

const clusters = [
  { file: 'resume-review.ts', prefix: '/seo-preview/resume-review' },
  { file: 'cover-letter.ts', prefix: '/seo-preview/cover-letter' },
  { file: 'interview-prep.ts', prefix: '/seo-preview/interview-prep' },
  { file: 'ats.ts', prefix: '/seo-preview/ats' },
];

const allUrls = [];
for (const c of clusters) {
  const rows = extractRows(path.join(dataDir, c.file), c.prefix);
  for (const r of rows) allUrls.push(r);
  console.log(`[seo-sitemap] ${c.file}: ${rows.length} published rows`);
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
