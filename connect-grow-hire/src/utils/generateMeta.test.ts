import { generateMeta } from './generateMeta';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertEq(actual: string, expected: string, label: string) {
  assert(actual === expected, `${label}\n    expected: ${expected}\n    actual:   ${actual}`);
}

function assertContains(actual: string, substring: string, label: string) {
  assert(actual.includes(substring), `${label} - expected to contain "${substring}", got: ${actual}`);
}

const YEAR = new Date().getFullYear();

// --- compare: full data ---
const compare = generateMeta('compare', { slug: 'google-vs-meta', companyA: 'Google', companyB: 'Meta' });
assertContains(compare.title, 'Google vs Meta', 'compare title contains company names');
assertContains(compare.title, String(YEAR), 'compare title contains current year');
assertContains(compare.description, 'Google', 'compare description contains companyA');
assertContains(compare.description, 'Meta', 'compare description contains companyB');

// --- compare: custom override (pwc-vs-kpmg from seo-title-rewrites.md) ---
const pwcKpmg = generateMeta('compare', { slug: 'pwc-vs-kpmg', companyA: 'PwC', companyB: 'KPMG' });
assertContains(pwcKpmg.title, 'PwC vs KPMG: Recruiting, Target Schools & Which to Choose', 'pwc-vs-kpmg uses custom title');
assertContains(pwcKpmg.description, 'consulting recruiting', 'pwc-vs-kpmg uses custom description');

// --- compare: custom override (goldman-sachs-vs-jpmorgan) ---
const gsJpm = generateMeta('compare', { slug: 'goldman-sachs-vs-jpmorgan', companyA: 'Goldman Sachs', companyB: 'JPMorgan' });
assertContains(gsJpm.title, 'Goldman Sachs vs JPMorgan: IB Recruiting', 'gs-vs-jpm uses custom title');

// --- compare: missing fields ---
const compareEmpty = generateMeta('compare', { slug: 'unknown-vs-other' });
assertContains(compareEmpty.title, 'vs', 'compare with missing fields still has vs');
assertContains(compareEmpty.title, String(YEAR), 'compare with missing fields has year');

// --- meeting: full data ---
const coffee = generateMeta('meeting', { company: 'McKinsey' });
assertContains(coffee.title, 'McKinsey', 'meeting title contains company');
assertContains(coffee.title, 'Meeting', 'meeting title contains Meeting');
assertContains(coffee.description, 'McKinsey', 'meeting description contains company');

// --- meeting: missing field ---
const coffeeFallback = generateMeta('meeting', {});
assert(coffeeFallback.title.length > 0, 'meeting with empty data returns non-empty title');

// --- cold-email: full data ---
const coldEmail = generateMeta('cold-email', { industry: 'Investment Banking' });
assertContains(coldEmail.title, 'Investment Banking', 'cold-email title contains industry');
assertContains(coldEmail.title, String(YEAR), 'cold-email title contains year');
assertContains(coldEmail.description, 'Investment Banking', 'cold-email description contains industry');

// --- cold-email: missing field ---
const coldEmailEmpty = generateMeta('cold-email', {});
assertContains(coldEmailEmpty.title, String(YEAR), 'cold-email with empty data still has year');

// --- networking: full data ---
const networking = generateMeta('networking', { company: 'Citadel' });
assertContains(networking.title, 'Citadel', 'networking title contains company');
assertContains(networking.title, String(YEAR), 'networking title contains year');
assertContains(networking.description, 'Citadel', 'networking description contains company');

// --- networking: missing field ---
const networkingEmpty = generateMeta('networking', {});
assertContains(networkingEmpty.title, String(YEAR), 'networking with empty data still has year');

// --- alumni: full data ---
const alumni = generateMeta('alumni', { university: 'USC' });
assertContains(alumni.title, 'USC', 'alumni title contains university');
assertContains(alumni.title, 'Alumni', 'alumni title contains Alumni');
assertContains(alumni.description, 'USC', 'alumni description contains university');

// --- alumni: missing field ---
const alumniEmpty = generateMeta('alumni', {});
assertContains(alumniEmpty.title, 'Alumni', 'alumni with empty data still has Alumni');

// --- blog: with Offerloop in title ---
const blogWithBrand = generateMeta('blog', { title: 'Guide to Offerloop', description: 'A guide.' });
assertEq(blogWithBrand.title, 'Guide to Offerloop', 'blog with Offerloop does not double-append');

// --- blog: without Offerloop in title ---
const blogNoBrand = generateMeta('blog', { title: 'Cold Email Tips', description: 'Tips for cold email.' });
assertEq(blogNoBrand.title, 'Cold Email Tips | Offerloop', 'blog without Offerloop appends brand');

// --- blog: custom override (how-to-find-professional-email-address) ---
const blogOverride = generateMeta('blog', { slug: 'how-to-find-professional-email-address', title: 'original' });
assertContains(blogOverride.title, 'Email Addresses Ethically', 'blog override uses custom title with ethical framing');
assertContains(blogOverride.description, 'ethically find verified emails', 'blog override uses custom description with ethical framing');

// --- blog: missing fields ---
const blogEmpty = generateMeta('blog', {});
assertEq(blogEmpty.title, 'Offerloop', 'blog with no title falls back to Offerloop');

// --- default: full data ---
const defaultMeta = generateMeta('unknown-type', { title: 'Custom Page', description: 'Custom desc.' });
assertEq(defaultMeta.title, 'Custom Page', 'default uses provided title');
assertEq(defaultMeta.description, 'Custom desc.', 'default uses provided description');

// --- default: missing fields ---
const defaultEmpty = generateMeta('unknown-type', {});
assertEq(defaultEmpty.title, 'Offerloop', 'default with no data falls back to Offerloop');
assertContains(defaultEmpty.description, 'AI-powered', 'default description is the standard fallback');

// --- year is a 4-digit number ---
assert(YEAR >= 2024 && YEAR <= 2099, `year ${YEAR} is a valid 4-digit number`);
assert(String(YEAR).length === 4, `year string "${YEAR}" is exactly 4 digits`);

// --- Summary ---
console.log(`\n  generateMeta tests: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
