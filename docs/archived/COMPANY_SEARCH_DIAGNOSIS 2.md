# Company Search Performance & Loading Bar Diagnosis

**Date:** January 2025  
**Status:** Diagnostic Report

---

## 🔴 Critical Issues Identified

### 1. Loading Bar Not Working

**Problem:**
- Frontend sets initial progress state: `{current: 0, total: batchSize, step: "Generating firm names..."}`
- Backend has progress callback in `get_firm_details_batch()` but it only logs to backend
- **No communication channel** between backend progress and frontend UI
- Frontend waits for entire HTTP response before updating UI

**Location:**
- Frontend: `FirmSearchPage.tsx:306` - Sets initial progress, then waits
- Backend: `firm_details_extraction.py:397-406` - Progress callback only logs
- Backend: `serp_client.py:397-406` - Progress callback only logs

**Root Cause:**
- The search is a **synchronous HTTP request** - no streaming/SSE/WebSocket
- Progress updates are logged but never sent to frontend
- Frontend progress bar shows static 10% (fallback when `searchProgress` is null)

**Code Evidence:**
```typescript
// Frontend: Sets initial progress, then waits for response
setSearchProgress({current: 0, total: batchSize, step: `Generating firm names...`});
const result = await apiService.searchFirms(q, batchSize); // BLOCKS until complete
setSearchProgress(null); // Only cleared after response
```

```python
# Backend: Progress callback only logs
def progress_callback(current, total):
    progress_data["completed"] = current
    logger.debug("company_search_progress", ...)  # Only logs, doesn't send to frontend
```

---

### 2. Performance Issues

**Current Flow:**
```
1. User submits search
2. Frontend shows loading modal (static progress bar at 10%)
3. Backend:
   a. Parse query with ChatGPT (~1-2s)
   b. Generate firm names with ChatGPT (~2-3s)
   c. Iterative loop (up to 2 iterations):
      - Generate N firm names (~2-3s per iteration)
      - Parallel SERP fetch (15 workers, ~5-15s per iteration)
      - Batch ChatGPT extraction (~2-5s per iteration)
      - Location filtering
      - If not enough, retry with higher multiplier
   d. Transform & sort results
4. Return complete response (~15-30s for 10 firms)
5. Frontend updates UI with all results at once
```

**Bottlenecks:**
1. **Iterative approach**: Up to 2 iterations (MAX_ITERATIONS=2)
   - Each iteration can take 10-20 seconds
   - If first iteration doesn't yield enough results, total time doubles
   
2. **No progressive updates**: Frontend waits 15-30 seconds with no feedback
   - Progress bar stuck at 10% (fallback value)
   - User has no idea if search is working or stuck

3. **Sequential operations**: Even with parallel SERP fetching, operations are sequential:
   - Parse → Generate Names → Fetch Details → Extract → Filter → Return
   - No streaming of partial results

4. **ChatGPT calls**: Multiple ChatGPT calls per search:
   - Query parsing: 1 call (~1-2s)
   - Firm name generation: 1-2 calls (~2-3s each)
   - Batch extraction: Multiple batches (~2-5s total)

**Performance Metrics:**
- **10 firms**: 15-30 seconds (typical)
- **20 firms**: 25-45 seconds
- **40 firms**: 40-70 seconds

---

## 🔍 Technical Details

### Backend Progress Tracking

**Location:** `backend/app/services/firm_details_extraction.py:949-1176`

The `get_firm_details_batch()` function has a `progress_callback` parameter:
```python
def get_firm_details_batch(
    firm_names: List[str], 
    progress_callback: Optional[Callable[[int, int], None]] = None,
    ...
):
    # Progress callback is called during parallel processing
    if progress_callback:
        progress_callback(completed, total)
```

**But:** This callback is only used for logging in `serp_client.py:397-406`:
```python
def progress_callback(current, total):
    progress_data["completed"] = current
    logger.debug("company_search_progress", ...)  # Only logs!
```

**No mechanism exists to send progress to frontend.**

### Frontend Progress Display

**Location:** `FirmSearchPage.tsx:1191-1208`

```typescript
{isSearching && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div 
        className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full" 
        style={{ 
          width: searchProgress 
            ? `${(searchProgress.current / searchProgress.total) * 100}%` 
            : '10%'  // Fallback when searchProgress is null
        }}
      />
    </div>
  </div>
)}
```

**Problem:** `searchProgress` is only set initially, then cleared after response. No updates during search.

---

## ✅ Recommended Solutions

### Solution 1: Add Progress Updates (Quick Fix)

**Option A: Polling (Simplest)**
- Add `/api/firm-search/status/:searchId` endpoint
- Frontend polls every 1-2 seconds for progress
- Backend stores progress in memory/cache

**Option B: Server-Sent Events (Better UX)**
- Convert endpoint to streaming response
- Backend yields progress updates as they happen
- Frontend receives real-time updates

**Option C: WebSocket (Best for real-time)**
- Establish WebSocket connection
- Backend sends progress events
- Frontend updates UI in real-time

### Solution 2: Optimize Performance

1. **Reduce iterations**: Better initial multiplier calculation
2. **Cache firm names**: Cache ChatGPT-generated firm names
3. **Stream partial results**: Return firms as they're found
4. **Optimize ChatGPT calls**: Batch more operations
5. **Parallelize more**: Overlap parsing and generation

---

## 📊 Expected Improvements

### With Progress Updates:
- **User Experience**: Users see progress (0% → 100%)
- **Perceived Performance**: Feels faster even if actual time is same
- **Error Detection**: Users can see if search is stuck

### With Performance Optimizations:
- **10 firms**: 15-30s → 8-15s (50% faster)
- **20 firms**: 25-45s → 15-25s (40% faster)
- **40 firms**: 40-70s → 25-40s (35% faster)

---

## 🎯 Implementation Priority

1. **P0 (Critical)**: Fix loading bar - Add progress updates (Polling or SSE)
2. **P1 (High)**: Optimize performance - Reduce iterations, better caching
3. **P2 (Medium)**: Stream partial results - Show firms as they're found

---

## 📝 Next Steps

1. Implement progress tracking endpoint (polling or SSE)
2. Update frontend to poll/stream progress updates
3. Optimize backend performance bottlenecks
4. Test with real searches to measure improvements

