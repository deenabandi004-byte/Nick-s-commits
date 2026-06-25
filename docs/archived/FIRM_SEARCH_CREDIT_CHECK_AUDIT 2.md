# Firm Search Credit Checking - Full Audit Report

## Executive Summary
This audit examines the firm search functionality's credit checking system to ensure credits are correctly validated before and during searches, and properly deducted after successful searches.

## Findings

### ✅ **What's Working Correctly**

1. **Backend Credit Validation (firm_search.py)**
   - ✅ Credits are checked BEFORE performing the search (line 134-146)
   - ✅ Uses `check_and_reset_credits()` to ensure credits are up-to-date (line 39)
   - ✅ Validates batch size against tier limits (line 137-139)
   - ✅ Calculates max credits needed based on batch size (line 142)
   - ✅ Raises `InsufficientCreditsError` if credits are insufficient (line 145-146)
   - ✅ Uses atomic credit deduction to prevent race conditions (line 178)
   - ✅ Charges based on ACTUAL firms returned, not requested batch size (line 174-175)
   - ✅ No charge if no firms found (line 157-167)

2. **Credit Deduction Logic**
   - ✅ Uses `deduct_credits_atomic()` which prevents race conditions (line 178)
   - ✅ Re-checks credits if deduction fails (line 180-182)
   - ✅ Only charges for firms actually returned (line 174-175)

3. **Frontend Pre-Search Validation**
   - ✅ Shows warning if credits are insufficient (line 468-475)
   - ✅ Disables search button if credits are insufficient (line 479)
   - ✅ Displays credit cost before search (line 458-463)

### ⚠️ **Issues Found**

#### Issue 1: Frontend Error Handling for 402 Status Code
**Severity: Medium**

**Problem:**
- The backend returns HTTP 402 (Payment Required) with `InsufficientCreditsError`
- The frontend's `apiService.makeRequest()` doesn't have special handling for 402 status codes
- When a 402 error occurs, it throws a generic `Error` with just the message
- The frontend code checks for `result.insufficientCredits` (line 183), but this field is never set because the error is thrown before the response is parsed

**Location:**
- `connect-grow-hire/src/services/api.ts` (line 457-471)
- `connect-grow-hire/src/pages/FirmSearchPage.tsx` (line 183-189)

**Impact:**
- Users see a generic error message instead of a helpful "Insufficient Credits" message
- The error doesn't include `creditsNeeded` and `currentCredits` details
- User experience is degraded

**Fix Required:**
- Add special handling for 402 status code in `makeRequest()` similar to how 401 is handled
- Parse the error response to extract `required` and `available` from `details`
- Return a structured error object that the frontend can use

#### Issue 2: Stale Credit Data in Frontend
**Severity: Low**

**Problem:**
- Frontend uses `effectiveUser.credits` which may be stale
- Credits are only refreshed after a successful search (line 174-176)
- If user's credits changed elsewhere (e.g., another tab, another feature), the UI won't reflect it until after a search

**Location:**
- `connect-grow-hire/src/pages/FirmSearchPage.tsx` (line 468, 479)

**Impact:**
- User might see incorrect credit warnings
- Button might be disabled when credits are actually sufficient (or vice versa)

**Fix Required:**
- Refresh credits when component mounts or when batch size changes
- Consider refreshing credits before showing the warning

#### Issue 3: Credit Check Timing
**Severity: Low**

**Problem:**
- Frontend checks credits using potentially stale data
- Backend always re-checks credits, so this is mostly a UX issue
- However, it could lead to unnecessary API calls if frontend validation is off

**Location:**
- `connect-grow-hire/src/pages/FirmSearchPage.tsx` (line 468-479)

**Impact:**
- Minor UX issue - user might see incorrect warnings

## Detailed Code Analysis

### Backend Flow (firm_search.py)

```python
# Line 134: Get current credits (with reset check)
current_credits, tier, max_credits = get_user_credits_and_tier(db, uid)

# Line 142: Calculate max credits needed
max_credits_needed = calculate_firm_search_cost(batch_size)

# Line 145-146: Check if user has enough credits BEFORE search
if current_credits < max_credits_needed:
    raise InsufficientCreditsError(max_credits_needed, current_credits)

# Line 149: Perform search
result = search_firms(query, limit=batch_size)

# Line 174-175: Calculate ACTUAL credits to charge
actual_firms_returned = len(firms)
actual_credits_to_charge = calculate_firm_search_cost(actual_firms_returned)

# Line 178: Atomically deduct credits
success, new_credit_balance = deduct_credits_atomic(uid, actual_credits_to_charge, "firm_search")
```

**✅ This flow is correct:**
1. Checks credits before search
2. Only charges for actual results
3. Uses atomic operations
4. Handles edge cases (no firms found = no charge)

### Frontend Flow (FirmSearchPage.tsx)

```typescript
// Line 468-475: Shows warning based on effectiveUser.credits
{effectiveUser.credits !== undefined && effectiveUser.credits < (batchSize * creditsPerFirm) && (
  // Warning displayed
)}

// Line 479: Disables button based on effectiveUser.credits
disabled={isSearching || !query.trim() || (effectiveUser.credits ?? 0) < (batchSize * creditsPerFirm)}

// Line 149: Makes API call
const result: FirmSearchResult = await apiService.searchFirms(q, batchSize);

// Line 183-189: Handles insufficient credits (but this code path may never execute)
} else if (result.insufficientCredits) {
  // This won't work if error is thrown
}
```

**⚠️ Issues:**
1. Uses potentially stale credit data
2. Error handling for 402 doesn't work correctly
3. Credits only refreshed after successful search

## Recommendations

### Priority 1: Fix Error Handling (High Priority)
1. Update `apiService.makeRequest()` to handle 402 status codes
2. Parse error response to extract credit details
3. Return structured error that frontend can use
4. Update frontend to properly display insufficient credits error

### Priority 2: Improve Credit Refresh (Medium Priority)
1. Refresh credits when component mounts
2. Refresh credits when batch size changes
3. Consider polling credits periodically if user has multiple tabs open

### Priority 3: Enhance UX (Low Priority)
1. Show loading state while checking credits
2. Add tooltip explaining credit costs
3. Show credit balance update in real-time

## Test Cases to Verify

1. ✅ **Test 1: Sufficient Credits**
   - User has 50 credits, requests 10 firms (50 credits needed)
   - Expected: Search succeeds, 50 credits deducted

2. ✅ **Test 2: Insufficient Credits**
   - User has 20 credits, requests 10 firms (50 credits needed)
   - Expected: Error before search, no credits deducted

3. ✅ **Test 3: Partial Results**
   - User has 30 credits, requests 10 firms, but only 5 firms found
   - Expected: Search succeeds, 25 credits deducted (5 firms × 5 credits)

4. ✅ **Test 4: No Results**
   - User has 50 credits, requests 10 firms, but no firms found
   - Expected: Search succeeds, 0 credits deducted

5. ✅ **Test 5: Race Condition**
   - Two simultaneous requests with exactly enough credits for one
   - Expected: One succeeds, one fails (atomic operation prevents double deduction)

6. ⚠️ **Test 6: Error Response Parsing**
   - User has insufficient credits, backend returns 402
   - Expected: Frontend shows helpful error with credit details
   - **Current Status: Fails - shows generic error**

## Conclusion

The backend credit checking logic is **solid and correct**. The main issues are in the frontend:
1. Error handling for 402 status codes needs improvement
2. Credit data freshness could be better

The credit deduction system is properly implemented with atomic operations, preventing race conditions and ensuring accurate credit tracking.
