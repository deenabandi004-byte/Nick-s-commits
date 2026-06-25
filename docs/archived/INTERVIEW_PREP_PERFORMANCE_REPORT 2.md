# Interview Prep Performance Analysis Report

**Date:** December 2024  
**Feature:** Interview Prep Generation  
**Issue:** Interview prep takes a long time to generate

---

## Executive Summary

The interview prep generation feature currently takes **60-120+ seconds** to complete due to several sequential bottlenecks, with the Reddit scraping phase being the primary culprit (up to 90 seconds). This report identifies all performance bottlenecks, explains why they occur, and provides actionable improvement recommendations.

---

## Current Flow & Timing Breakdown

### Step-by-Step Process Timeline

1. **Job Posting Parsing** (5-30 seconds)
   - Fetches HTML from job posting URL
   - Parses with BeautifulSoup
   - Calls OpenAI API to extract structured data
   - **Timeout:** 30 seconds

2. **Reddit Scraping** (30-90 seconds) ⚠️ **BIGGEST BOTTLENECK**
   - Builds 10-15 search queries per job
   - Searches across 6 subreddits
   - Makes sequential API calls to Reddit
   - Fetches comments for top 25 posts
   - **Timeout:** 90 seconds

3. **Content Processing** (10-30 seconds)
   - Processes up to 50 Reddit posts
   - Calls OpenAI API with large context (up to 8000 tokens)
   - Extracts structured insights

4. **PDF Generation** (5-10 seconds)
   - Fetches company logo (3s timeout)
   - Generates 7-8 page PDF
   - Uploads to Firebase Storage

**Total Estimated Time: 50-160 seconds** (with typical time around 90-120 seconds)

---

## Detailed Bottleneck Analysis

### 🚨 Critical Issue #1: Sequential Reddit Scraping

**Location:** `backend/app/services/interview_prep/reddit_scraper.py`

**The Problem:**
```python
# Current inefficient pattern:
for subreddit in subreddits[:6]:  # Up to 6 subreddits
    for query in queries[:15]:  # Up to 15 queries per subreddit
        # Sequential API call
        async with session.get(url) as resp:
            # Process response
        await asyncio.sleep(0.6)  # Rate limiting delay

# Then fetch comments sequentially
for post in top_posts[:25]:
    async with session.get(comments_url) as resp:
        # Process comments
    await asyncio.sleep(0.6)
```

**Why This Happens:**
- **Rate limiting delays:** 0.6 seconds between each request
- **Sequential execution:** No parallel requests
- **Worst case scenario:** 
  - 6 subreddits × 15 queries = 90 potential requests
  - 90 requests × 0.6s delay = **54 seconds in delays alone**
  - Plus 25 comment requests × 0.6s = **15 more seconds**
  - **Total delay overhead: ~69 seconds** before actual processing

**Impact:** This is the single largest bottleneck, consuming 60-90% of total processing time.

**Solutions:**
1. **Parallelize Reddit requests** using `asyncio.gather()` or `asyncio.TaskGroup`
2. **Reduce query count** - prioritize most relevant queries
3. **Batch comment fetching** - fetch multiple post comments in parallel
4. **Early termination** - stop when we have enough quality posts (e.g., 30-40)
5. **Smarter rate limiting** - use concurrent request pools instead of sequential delays

---

### ⚠️ Issue #2: Job Posting Parsing Sequential Execution

**Location:** `backend/app/services/interview_prep/job_posting_parser.py`

**The Problem:**
- Fetches HTML sequentially
- Then parses sequentially
- Then calls OpenAI sequentially
- All within a 30-second timeout

**Why This Happens:**
- No parallelization between HTML fetch and initial metadata extraction
- OpenAI API call happens after HTML fetch completes

**Impact:** 5-30 seconds, but necessary for correctness

**Solutions:**
1. **Extract metadata in parallel** while fetching HTML
2. **Cache parsed job postings** - same URL = same results
3. **Use structured data** more aggressively (JSON-LD) before falling back to OpenAI

---

### ⚠️ Issue #3: Large OpenAI Context Window

**Location:** `backend/app/services/interview_prep/content_processor.py`

**The Problem:**
```python
# Processes ALL 50 posts at once
for i, post in enumerate(reddit_posts[:50], 1):
    post_text = f"{body[:5000]}\n"  # Up to 5000 chars per post
    # Plus up to 10 comments per post at 2500 chars each
    # Total: 50 posts × (5000 + 10×2500) = ~1.75 million characters
```

**Why This Happens:**
- Attempting to process maximum context for "comprehensive" extraction
- Single large OpenAI API call with up to 8000 tokens
- Processing can take 10-30 seconds depending on context size

**Impact:** 10-30 seconds, but necessary for quality

**Solutions:**
1. **Intelligent post filtering** - prioritize posts with highest upvotes/relevance
2. **Chunked processing** - process in batches and merge results
3. **Reduce context per post** - limit to 2000 chars + top 5 comments
4. **Use faster model** - `gpt-4o-mini` is already fast, but could optimize prompt
5. **Cache insights** - similar job postings (company + role) could reuse insights

---

### ⚠️ Issue #4: Logo Fetching Blocking PDF Generation

**Location:** `backend/app/services/interview_prep/pdf_generator.py`

**The Problem:**
```python
def _get_company_logo(company_domain: str) -> Optional[ImageReader]:
    logo_url = f"https://logo.clearbit.com/{company_domain}"
    response = requests.get(logo_url, timeout=3)  # Blocks for up to 3 seconds
```

**Why This Happens:**
- Synchronous HTTP request blocks PDF generation
- 3-second timeout adds unnecessary delay if logo fetch fails

**Impact:** 0-3 seconds (usually fails fast, but still adds latency)

**Solutions:**
1. **Make logo fetching optional/non-blocking**
2. **Fetch logo in parallel** with other operations
3. **Cache logos** - same company domain = same logo
4. **Remove logo or make it truly optional**

---

### ⚠️ Issue #5: Async-in-Sync Context Pattern

**Location:** `backend/app/routes/interview_prep.py`

**The Problem:**
```python
# Creating new event loop in sync context
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)
try:
    job_details = loop.run_until_complete(parse_job_posting_url(job_posting_url))
finally:
    loop.close()
```

**Why This Happens:**
- Background thread (not async context)
- Need to run async functions in sync thread
- Creating/destroying event loops has overhead

**Impact:** Small overhead, but inefficient pattern

**Solutions:**
1. **Use native async framework** (FastAPI/Quart instead of Flask threads)
2. **Better async bridge** - use `nest_asyncio` or proper async worker
3. **Convert to sync** - use `requests` instead of `aiohttp` where parallelism isn't needed

---

### ⚠️ Issue #6: No Caching Strategy

**The Problem:**
- Same company + job title combinations are scraped repeatedly
- Reddit posts don't change frequently (maybe daily/weekly)
- Job posting parsing for same URL repeats
- OpenAI insights for similar jobs could be reused

**Why This Happens:**
- No caching layer implemented
- Each request triggers full pipeline

**Impact:** Unnecessary work for repeat requests

**Solutions:**
1. **Redis caching layer** for:
   - Parsed job postings (key: URL, TTL: 7 days)
   - Reddit scraping results (key: company+role, TTL: 1 day)
   - OpenAI insights (key: company+role+hash, TTL: 7 days)
2. **Firestore caching** as fallback if Redis unavailable
3. **Smart cache invalidation** - refresh if data > 1 day old

---

## Performance Improvement Recommendations

### 🔥 High Priority (Immediate Impact - 60-70% speedup)

#### 1. Parallelize Reddit Scraping
**Estimated Impact:** 50-60 seconds → 10-15 seconds  
**Effort:** Medium (2-3 days)

**Implementation:**
```python
# Replace sequential loops with parallel execution
async def search_reddit_parallel(job_details: Dict) -> List[Dict]:
    queries = build_search_queries(job_details)
    subreddits = get_subreddits(job_details)
    
    # Create all search tasks
    search_tasks = []
    for subreddit in subreddits[:6]:
        for query in queries[:10]:  # Reduce to top 10 queries
            task = fetch_reddit_search(session, subreddit, query)
            search_tasks.append(task)
    
    # Execute in parallel batches (respect rate limits)
    results = await asyncio.gather(*search_tasks, return_exceptions=True)
    
    # Process results, dedupe, rank
    all_posts = process_results(results)
    
    # Fetch comments in parallel for top posts
    comment_tasks = [fetch_comments(post) for post in all_posts[:25]]
    comments = await asyncio.gather(*comment_tasks)
    
    return combine_posts_with_comments(all_posts, comments)
```

**Key Changes:**
- Use `asyncio.gather()` for parallel requests
- Batch requests with semaphore to respect rate limits (e.g., 10 concurrent)
- Reduce query count from 15 to 10 most relevant
- Fetch comments in parallel instead of sequentially

#### 2. Reduce Reddit Query Count
**Estimated Impact:** 5-10 seconds saved  
**Effort:** Low (2-4 hours)

**Implementation:**
- Prioritize queries: company+role > company+level > company general
- Limit to top 8-10 queries per subreddit instead of 15
- Use only top 4 subreddits instead of 6 for most roles
- Early termination when we have 30-40 quality posts

#### 3. Implement Caching Layer
**Estimated Impact:** 80-90% speedup for repeat requests  
**Effort:** Medium (3-4 days)

**Implementation:**
- Add Redis cache (or Firestore as fallback)
- Cache keys:
  - `job_parsing:{url_hash}` → parsed job details (TTL: 7 days)
  - `reddit:{company}:{role}:{hash}` → Reddit posts (TTL: 1 day)
  - `insights:{company}:{role}:{context_hash}` → OpenAI insights (TTL: 7 days)
- Check cache before expensive operations
- Warm cache for popular companies/roles

### 🟡 Medium Priority (20-30% additional speedup)

#### 4. Optimize Content Processing
**Estimated Impact:** 5-10 seconds saved  
**Effort:** Low (1-2 days)

**Changes:**
- Reduce post context: 5000 chars → 2000 chars per post
- Reduce comments: 10 comments → 5 top comments per post
- Filter posts: prioritize top 30 posts instead of all 50
- Use streaming responses for faster OpenAI completion

#### 5. Make Logo Fetching Non-Blocking
**Estimated Impact:** 0-3 seconds saved  
**Effort:** Low (1-2 hours)

**Implementation:**
- Fetch logo asynchronously or in background
- Don't wait for logo - use placeholder if unavailable
- Cache logos: `logo:{domain}` → image bytes (TTL: 30 days)

#### 6. Reduce Job Posting Parsing Time
**Estimated Impact:** 2-5 seconds saved  
**Effort:** Low (4-6 hours)

**Changes:**
- Extract structured data (JSON-LD) first, use OpenAI as fallback
- Limit job text to 15,000 chars (already done) but optimize parsing
- Cache parsed results (covered in #3)

### 🟢 Low Priority (Polish & Quality of Life)

#### 7. Better Progress Updates
**Effort:** Low (2-4 hours)

**Implementation:**
- More granular progress updates during Reddit scraping
- Show "Found X posts so far..." instead of just "Searching Reddit..."
- Progress bar estimation based on subreddits/queries remaining

#### 8. Smarter Query Building
**Effort:** Low (2-3 hours)

**Implementation:**
- Analyze job posting to determine most relevant queries
- Skip generic queries if specific ones found good results
- Weight queries by job requirements (skills, level, team)

---

## Expected Performance Improvements

### Before Optimization
- **Average Time:** 90-120 seconds
- **P95 Time:** 150-180 seconds
- **P99 Time:** 180+ seconds (timeout)

### After High Priority Optimizations (#1-3)
- **Average Time:** 25-40 seconds (65-70% improvement)
- **P95 Time:** 50-60 seconds
- **P99 Time:** 70-80 seconds
- **Cached Requests:** 5-10 seconds (90% improvement)

### After All Optimizations (#1-6)
- **Average Time:** 15-25 seconds (75-85% improvement)
- **P95 Time:** 35-45 seconds
- **P99 Time:** 50-60 seconds
- **Cached Requests:** 3-5 seconds

---

## Implementation Roadmap

### Phase 1: Quick Wins (Week 1)
- [ ] Reduce Reddit query count (#2)
- [ ] Make logo fetching non-blocking (#5)
- [ ] Optimize content processing (#4)
- **Expected Improvement:** 20-30 seconds faster

### Phase 2: Major Optimization (Week 2-3)
- [ ] Implement parallel Reddit scraping (#1)
- [ ] Add caching layer (#3)
- **Expected Improvement:** Additional 40-50 seconds faster

### Phase 3: Polish (Week 4)
- [ ] Better progress updates (#7)
- [ ] Smarter query building (#8)
- [ ] Reduce job posting parsing time (#6)

---

## Technical Debt & Architecture Improvements

### Long-term Considerations

1. **Move to Async Framework**
   - Consider FastAPI or Quart instead of Flask with threads
   - Native async support = cleaner code + better performance
   - Better for I/O-bound operations like API calls

2. **Separate Workers**
   - Use Celery/Redis Queue for background processing
   - Better scalability and monitoring
   - Can scale workers independently

3. **Database Optimization**
   - Add indexes on `interview-preps` collection
   - Cache frequently accessed data
   - Consider read replicas for status checks

4. **Monitoring & Alerting**
   - Add timing metrics for each step
   - Alert on slow requests (>60s)
   - Track cache hit rates

---

## Cost Considerations

### Current Costs (Per Request)
- **OpenAI API:** ~2 calls × $0.15/1M tokens = ~$0.001-0.003
- **Reddit API:** Free (but rate limited)
- **Firebase Storage:** ~$0.0001 per PDF
- **Compute:** ~2 minutes of server time

### After Optimization
- **Cached Requests:** 95% reduction in OpenAI calls + compute
- **Fresh Requests:** 50-70% reduction in compute time
- **Estimated Savings:** 60-80% cost reduction for repeat requests

---

## Conclusion

The interview prep feature suffers from **sequential execution bottlenecks**, particularly in Reddit scraping. The primary issue is the **60-90 seconds** spent on sequential API calls with rate limiting delays.

**Recommended Action Plan:**
1. **Immediate:** Implement parallel Reddit scraping (#1) - **biggest impact**
2. **Short-term:** Add caching layer (#3) - **massive impact for repeat requests**
3. **Medium-term:** Optimize content processing and reduce query count (#2, #4)

With these optimizations, we can expect **65-85% reduction in processing time**, bringing average generation time from **90-120 seconds** down to **15-25 seconds** (or **3-5 seconds** for cached requests).

---

## Appendix: Code Locations

### Key Files to Modify
- `backend/app/services/interview_prep/reddit_scraper.py` - Parallel scraping
- `backend/app/services/interview_prep/content_processor.py` - Context optimization
- `backend/app/routes/interview_prep.py` - Async handling, caching
- `backend/app/services/interview_prep/pdf_generator.py` - Logo fetching
- `backend/app/services/interview_prep/job_posting_parser.py` - Parsing optimization

### New Files Needed
- `backend/app/services/cache.py` - Caching utilities
- `backend/app/services/interview_prep/reddit_scraper_parallel.py` - Parallel implementation