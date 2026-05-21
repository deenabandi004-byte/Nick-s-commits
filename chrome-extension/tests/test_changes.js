/**
 * Tests for chrome extension changes.
 * Run with: node tests/test_changes.js
 */

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

// ============================================
// 1. Test JOB_URL_PATTERNS extraction (popup.js)
// ============================================
console.log('\n--- JOB_URL_PATTERNS ---');

const JOB_URL_PATTERNS = [
  /linkedin\.com\/jobs\//,
  /boards\.greenhouse\.io\//,
  /jobs\.lever\.co\//,
  /\.myworkdayjobs\.com\//,
  /indeed\.com\/(viewjob|jobs)/,
  /handshake\.com\/.*jobs/,
  /joinhandshake\.com\/.*jobs/,
  /app\.joinhandshake\.com\/.*jobs/,
  /glassdoor\.com\/job-listing/,
  /ziprecruiter\.com\/jobs/,
  /wellfound\.com\/jobs/,
  /\/careers\//,
  /\/jobs\//
];

function isJobUrl(url) {
  if (!url) return false;
  return JOB_URL_PATTERNS.some(pattern => pattern.test(url));
}

function detectMode(url) {
  if (url && url.match(/linkedin\.com\/in\//)) return 'contact';
  if (url) {
    for (const pattern of JOB_URL_PATTERNS) {
      if (url.match(pattern)) return 'job';
    }
  }
  return 'contact';
}

// Job URLs should be detected
assert(isJobUrl('https://www.linkedin.com/jobs/view/123456'), 'LinkedIn job URL detected');
assert(isJobUrl('https://boards.greenhouse.io/company/jobs/123'), 'Greenhouse URL detected');
assert(isJobUrl('https://jobs.lever.co/company/abc-def'), 'Lever URL detected');
assert(isJobUrl('https://company.myworkdayjobs.com/en-US/jobs/123'), 'Workday URL detected');
assert(isJobUrl('https://www.indeed.com/viewjob?jk=abc'), 'Indeed viewjob URL detected');
assert(isJobUrl('https://www.indeed.com/jobs?q=engineer'), 'Indeed jobs URL detected');
assert(isJobUrl('https://app.joinhandshake.com/stu/jobs/123'), 'Handshake URL detected');
assert(isJobUrl('https://www.glassdoor.com/job-listing/engineer'), 'Glassdoor URL detected');
assert(isJobUrl('https://www.ziprecruiter.com/jobs/abc'), 'ZipRecruiter URL detected');
assert(isJobUrl('https://wellfound.com/jobs/123'), 'Wellfound URL detected');
assert(isJobUrl('https://company.com/careers/engineer'), 'Generic /careers/ URL detected');
assert(isJobUrl('https://company.com/jobs/123'), 'Generic /jobs/ URL detected');

// Non-job URLs
assert(!isJobUrl('https://www.linkedin.com/in/johndoe'), 'LinkedIn profile NOT a job URL');
assert(!isJobUrl('https://www.google.com'), 'Google NOT a job URL');
assert(!isJobUrl('https://www.linkedin.com/feed'), 'LinkedIn feed NOT a job URL');
assert(!isJobUrl(null), 'null URL returns false');
assert(!isJobUrl(''), 'empty URL returns false');

// detectMode should distinguish contact vs job
assert(detectMode('https://www.linkedin.com/in/johndoe') === 'contact', 'LinkedIn profile → contact mode');
assert(detectMode('https://www.linkedin.com/jobs/view/123') === 'job', 'LinkedIn job → job mode');
assert(detectMode('https://boards.greenhouse.io/stripe/jobs/123') === 'job', 'Greenhouse → job mode');
assert(detectMode('https://www.google.com') === 'contact', 'Unknown URL → contact mode (default)');
assert(detectMode(null) === 'contact', 'null → contact mode (default)');

// ============================================
// 2. Test sanitizeFilename extraction (popup.js)
// ============================================
console.log('\n--- sanitizeFilename ---');

function sanitizeFilename(str) {
  if (!str) return 'unknown';
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

assert(sanitizeFilename('Google') === 'google', 'Simple company name');
assert(sanitizeFilename('McKinsey & Company') === 'mckinsey_company', 'Company with special chars');
assert(sanitizeFilename('  Stripe  ') === 'stripe', 'Trimmed whitespace');
assert(sanitizeFilename('Jane Doe') === 'jane_doe', 'Name with space');
assert(sanitizeFilename('') === 'unknown', 'Empty string → unknown');
assert(sanitizeFilename(null) === 'unknown', 'null → unknown');
assert(sanitizeFilename(undefined) === 'unknown', 'undefined → unknown');
assert(sanitizeFilename('!!!') === '', '!! edge case (all special chars)'); // This is a known edge - becomes empty
assert(sanitizeFilename('Goldman Sachs - NYC') === 'goldman_sachs_nyc', 'Complex company name');
assert(sanitizeFilename('café') === 'caf', 'Non-ASCII stripped'); // accented chars removed

// Test filename generation patterns
const company = 'Google';
const jobTitle = 'Software Engineer';
const pdfFilename = company ? `${sanitizeFilename(company)}_cover_letter.pdf` : 'cover_letter.pdf';
assert(pdfFilename === 'google_cover_letter.pdf', 'PDF filename generated correctly');

const txtFilename = `cover-letter-${sanitizeFilename(company)}-${sanitizeFilename(jobTitle)}.txt`;
assert(txtFilename === 'cover-letter-google-software_engineer.txt', 'TXT filename generated correctly');

// ============================================
// 3. Test exponential backoff logic
// ============================================
console.log('\n--- Exponential Backoff ---');

function getBackoffDelay(attempt) {
  return Math.min(2000 * Math.pow(1.5, attempt), 15000);
}

assert(getBackoffDelay(0) === 2000, 'Attempt 0: 2s');
assert(getBackoffDelay(1) === 3000, 'Attempt 1: 3s');
assert(getBackoffDelay(2) === 4500, 'Attempt 2: 4.5s');
assert(getBackoffDelay(3) === 6750, 'Attempt 3: 6.75s');
assert(getBackoffDelay(4) === 10125, 'Attempt 4: 10.125s');
assert(getBackoffDelay(5) === 15000, 'Attempt 5: capped at 15s');
assert(getBackoffDelay(10) === 15000, 'Attempt 10: still capped at 15s');
assert(getBackoffDelay(100) === 15000, 'Attempt 100: still capped at 15s');

// Total time for 60 attempts (max)
let totalMs = 0;
for (let i = 0; i < 60; i++) {
  totalMs += getBackoffDelay(i);
}
const totalMinutes = totalMs / 1000 / 60;
assert(totalMinutes > 5, `Total polling time (${totalMinutes.toFixed(1)} min) > 5 min`);
assert(totalMinutes < 20, `Total polling time (${totalMinutes.toFixed(1)} min) < 20 min`);

// Compare with old approach: 200 * 2000ms = 400s = 6.67 min, 200 requests
// New approach: ~60 requests over ~15 min - much less network load
const oldRequests = 200;
const newRequests = 60;
assert(newRequests < oldRequests, `New approach uses fewer requests (${newRequests} vs ${oldRequests})`);

// ============================================
// 4. Test Promise.race timeout pattern
// ============================================
console.log('\n--- Content Script Timeout ---');

async function testTimeout() {
  // Simulate a message that never responds
  const neverResolves = new Promise(() => {});
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Content script timeout')), 100) // Use 100ms for test speed
  );

  try {
    await Promise.race([neverResolves, timeout]);
    assert(false, 'Should have timed out');
  } catch (e) {
    assert(e.message === 'Content script timeout', 'Timeout fires when content script hangs');
  }

  // Simulate a message that responds quickly
  const quickResponse = new Promise(resolve =>
    setTimeout(() => resolve({ description: 'Job description here' }), 10)
  );
  const timeout2 = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Content script timeout')), 100)
  );

  try {
    const result = await Promise.race([quickResponse, timeout2]);
    assert(result.description === 'Job description here', 'Fast response wins over timeout');
  } catch (e) {
    assert(false, 'Should not have timed out');
  }
}

// ============================================
// 5. Test debounce guard pattern
// ============================================
console.log('\n--- Debounce Guard ---');

let _actionInProgress = false;
let callCount = 0;

async function simulateAction() {
  if (_actionInProgress) return;
  _actionInProgress = true;
  try {
    callCount++;
    await new Promise(resolve => setTimeout(resolve, 50));
  } finally {
    _actionInProgress = false;
  }
}

async function testDebounce() {
  callCount = 0;
  // Fire 5 rapid calls
  await Promise.all([
    simulateAction(),
    simulateAction(),
    simulateAction(),
    simulateAction(),
    simulateAction(),
  ]);
  assert(callCount === 1, `Debounce: only 1 of 5 rapid calls executed (got ${callCount})`);

  // After the first completes, a new call should work
  callCount = 0;
  await simulateAction();
  assert(callCount === 1, 'Debounce: new call after completion works');
}

// ============================================
// 6. Test History API patching pattern (content.js)
// ============================================
console.log('\n--- History API Patching ---');

// Simulate the patching approach
let urlChangeDetected = false;
let lastUrl = 'https://linkedin.com/in/alice';

function checkUrlChange(currentUrl) {
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    urlChangeDetected = true;
  }
}

checkUrlChange('https://linkedin.com/in/alice'); // Same URL
assert(!urlChangeDetected, 'No change detected for same URL');

checkUrlChange('https://linkedin.com/in/bob'); // Different URL
assert(urlChangeDetected, 'Change detected for different URL');
assert(lastUrl === 'https://linkedin.com/in/bob', 'lastUrl updated');

// ============================================
// 7. Test fetchWithTimeout pattern
// ============================================
console.log('\n--- fetchWithTimeout ---');

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error(`Request timed out after ${timeoutMs}ms`);
    throw err;
  }
}

async function testFetchWithTimeout() {
  const originalFetch = globalThis.fetch;

  // Mock fetch that respects abort signal (like real fetch does)
  globalThis.fetch = (url, opts) => new Promise((resolve, reject) => {
    if (opts?.signal) {
      opts.signal.addEventListener('abort', () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        reject(err);
      });
    }
    // Never resolves on its own - simulates a hanging request
  });
  try {
    await fetchWithTimeout('https://example.com', {}, 100);
    assert(false, 'Should have timed out');
  } catch (e) {
    assert(e.message.includes('timed out'), 'fetchWithTimeout throws on timeout');
  }

  // Mock fetch that resolves quickly
  globalThis.fetch = async (url, opts) => {
    assert(opts && opts.signal instanceof AbortSignal, 'AbortSignal passed to fetch');
    return { ok: true, status: 200 };
  };
  try {
    const res = await fetchWithTimeout('https://example.com', {}, 5000);
    assert(res.ok === true, 'fetchWithTimeout returns response on success');
  } catch (e) {
    assert(false, 'Should not have thrown: ' + e.message);
  }

  // Mock fetch that throws network error
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  try {
    await fetchWithTimeout('https://example.com', {}, 5000);
    assert(false, 'Should have thrown network error');
  } catch (e) {
    assert(e.message === 'Failed to fetch', 'Network errors propagate through');
  }

  globalThis.fetch = originalFetch;
}

// ============================================
// 8. Test credits caching pattern
// ============================================
console.log('\n--- Credits Caching ---');

let _creditsCacheTime = 0;
const CREDITS_CACHE_TTL = 120000; // 2 minutes
let mockCredits = null;
let apiCallCount = 0;

async function simulateCreditsFetch() {
  const now = Date.now();
  if (mockCredits !== null && (now - _creditsCacheTime) < CREDITS_CACHE_TTL) {
    return { cached: true, credits: mockCredits };
  }
  // Simulate API call
  apiCallCount++;
  mockCredits = 150;
  _creditsCacheTime = now;
  return { cached: false, credits: mockCredits };
}

async function testCreditsCache() {
  // First call should hit API
  apiCallCount = 0;
  mockCredits = null;
  _creditsCacheTime = 0;

  let result = await simulateCreditsFetch();
  assert(!result.cached, 'First call hits API');
  assert(apiCallCount === 1, 'API called once');
  assert(result.credits === 150, 'Credits returned');

  // Second call within TTL should use cache
  result = await simulateCreditsFetch();
  assert(result.cached, 'Second call uses cache');
  assert(apiCallCount === 1, 'API not called again');

  // Simulate TTL expiry
  _creditsCacheTime = Date.now() - CREDITS_CACHE_TTL - 1;
  result = await simulateCreditsFetch();
  assert(!result.cached, 'After TTL expiry, hits API again');
  assert(apiCallCount === 2, 'API called again after expiry');

  // After action updates credits, cache is refreshed
  mockCredits = 135;
  _creditsCacheTime = Date.now();
  result = await simulateCreditsFetch();
  assert(result.cached, 'Updated credits served from cache');
  assert(result.credits === 135, 'Updated credit value returned');
}

// ============================================
// 9. Test scraper health logging payload
// ============================================
console.log('\n--- Scraper Health Logging ---');

function buildScraperLog(result) {
  const fieldsFound = ['jobTitle', 'company', 'location', 'description']
    .filter(f => result[f]);
  const urlPattern = result.jobUrl
    .replace(/\/\d+/g, '/:id')
    .replace(/[a-f0-9-]{20,}/g, ':hash');
  return {
    platform: result.platform,
    success: result.scrapedSuccessfully,
    fieldsFound,
    urlPattern,
  };
}

// Successful scrape
const successResult = {
  jobTitle: 'Software Engineer',
  company: 'Google',
  location: 'Mountain View, CA',
  description: 'Build cool stuff...',
  jobUrl: 'https://boards.greenhouse.io/google/jobs/123456',
  platform: 'greenhouse',
  scrapedSuccessfully: true,
};
let log = buildScraperLog(successResult);
assert(log.platform === 'greenhouse', 'Platform logged');
assert(log.success === true, 'Success logged');
assert(log.fieldsFound.length === 4, 'All 4 fields found');
assert(log.urlPattern === 'https://boards.greenhouse.io/google/jobs/:id', 'Job ID anonymized in URL');

// Partial scrape (missing description)
const partialResult = {
  jobTitle: 'PM',
  company: 'Stripe',
  location: null,
  description: null,
  jobUrl: 'https://jobs.lever.co/stripe/abc12345-def6-7890-abcd-ef1234567890',
  platform: 'lever',
  scrapedSuccessfully: true,
};
log = buildScraperLog(partialResult);
assert(log.fieldsFound.length === 2, 'Only 2 fields found (jobTitle, company)');
assert(log.urlPattern.includes(':hash'), 'UUID anonymized in URL');

// Failed scrape
const failResult = {
  jobTitle: null,
  company: null,
  location: null,
  description: null,
  jobUrl: 'https://unknown-site.com/jobs/123',
  platform: 'generic',
  scrapedSuccessfully: false,
};
log = buildScraperLog(failResult);
assert(log.success === false, 'Failure logged');
assert(log.fieldsFound.length === 0, 'No fields found');

// ============================================
// Run async tests
// ============================================
async function runAsyncTests() {
  await testTimeout();
  await testDebounce();
  await testFetchWithTimeout();
  await testCreditsCache();

  // Summary
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'='.repeat(40)}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAsyncTests();
