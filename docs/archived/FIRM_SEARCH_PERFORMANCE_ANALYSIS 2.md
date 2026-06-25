# Firm Search Performance Analysis

## Current Performance Issues

### Major Bottlenecks Identified

1. **Per-Firm ChatGPT Extraction (CRITICAL)**
   - Each firm requires a separate ChatGPT API call to extract structured data from SERP results
   - Average ChatGPT call: 2-5 seconds
   - For 10 firms: 10 × 3s = 30 seconds just for ChatGPT
   - This is the #1 bottleneck

2. **Multiple Sequential API Calls Per Firm**
   - SERP API call: up to 12 seconds timeout
   - ChatGPT extraction: 2-5 seconds
   - LinkedIn fallback search: up to 8 seconds timeout
   - **Worst case per firm: 25 seconds**

3. **Iterative Fetching Overhead**
   - System can run up to 3 iterations
   - Each iteration generates new firm names and fetches details
   - If first iteration doesn't yield enough results, time is multiplied

4. **High Timeout Values**
   - SERP timeout: 12s (too high)
   - Future timeout: 15s (too high)
   - LinkedIn search: 8s (too high)
   - These cause unnecessary waiting when APIs are slow

5. **Parallel Processing Limitations**
   - 10 workers processing in parallel
   - But each worker still does sequential operations (SERP → ChatGPT → LinkedIn)
   - Rate limits may be hit with 10 concurrent ChatGPT calls

## Performance Breakdown (10 firms)

**Current Flow:**
1. ChatGPT generates firm names: ~2s
2. Parallel fetch details (10 workers):
   - SERP API calls: ~3-5s (parallel)
   - ChatGPT extractions: ~20-30s (10 × 2-3s, potentially rate limited)
   - LinkedIn fallbacks: ~5-8s (if needed)
3. Transform and filter: ~1s
4. **Total: 30-45 seconds**

**If iterative fetching needed:**
- Iteration 1: 30-45s
- Iteration 2: 30-45s
- Iteration 3: 30-45s
- **Total: 90-135 seconds**

## Root Cause

The main issue is **per-firm ChatGPT extraction**. We're making 10+ individual ChatGPT API calls, each taking 2-5 seconds. This is:
- Slow (sequential-like behavior even with parallel workers)
- Expensive (more API calls)
- Rate-limit prone (too many concurrent calls)

## Optimization Strategy

### 1. Batch ChatGPT Extraction (HIGH PRIORITY)
Instead of calling ChatGPT for each firm individually, batch extract multiple firms in one call:
- Extract 5-10 firms per ChatGPT call
- Reduces 10 calls → 1-2 calls
- **Expected speedup: 5-10x for ChatGPT portion**

### 2. Reduce Timeouts
- SERP timeout: 12s → 8s
- Future timeout: 15s → 10s
- LinkedIn search: 8s → 5s
- **Expected speedup: 20-30% for failed/slow requests**

### 3. Optimize Iterative Fetching
- Reduce max iterations: 3 → 2
- Smarter early stopping
- Better multiplier calculation
- **Expected speedup: 30-50% for multi-iteration cases**

### 4. Increase Parallel Workers (if not rate limited)
- Current: 10 workers
- Consider: 15-20 workers if ChatGPT batching reduces rate limit issues
- **Expected speedup: 20-30% for parallel operations**

### 5. Better Caching
- Cache ChatGPT extraction results
- Cache SERP results more aggressively
- **Expected speedup: 50-80% for repeated searches**

## Expected Performance After Optimization

**10 firms:**
- Before: 30-45 seconds
- After: 8-15 seconds
- **Speedup: 3-5x**

**20 firms:**
- Before: 60-90 seconds
- After: 15-25 seconds
- **Speedup: 4-6x**

**40 firms:**
- Before: 120-180 seconds
- After: 30-45 seconds
- **Speedup: 4-6x**

## Implementation Priority

1. **P0: Batch ChatGPT Extraction** - Biggest impact
2. **P1: Reduce Timeouts** - Quick win
3. **P1: Optimize Iterative Fetching** - Reduces worst-case time
4. **P2: Increase Workers** - If rate limits allow
5. **P2: Better Caching** - Long-term improvement

