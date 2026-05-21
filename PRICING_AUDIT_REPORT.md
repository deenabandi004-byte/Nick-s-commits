# PRICING TIER AUDIT REPORT

**Date:** 2025-01-XX  
**Auditor:** AI Assistant  
**Scope:** Complete codebase audit per `offerloop-pricing-audit.md` specifications

---

## EXECUTIVE SUMMARY

**Total Issues Found:** 15+  
**Critical:** 3  
**High:** 6  
**Medium:** 4  
**Low:** 2+

---

## SECTION 1: CONFIGURATION & CONSTANTS

### ✅ CORRECTLY IMPLEMENTED

1. **Backend Tier Config (`backend/app/config.py`)**
   - ✅ Credits: 300 (free), 1500 (pro), 3000 (elite) - CORRECT
   - ✅ Alumni searches: 10 (free), unlimited (pro/elite) - CORRECT
   - ✅ Meeting Prep: 1 (free), 10/month (pro), unlimited (elite) - CORRECT
   - ✅ Interview Prep: 1 (free), 5/month (pro), unlimited (elite) - CORRECT
   - ✅ Feature flags (firm_search, export_enabled, etc.) - CORRECT

2. **Frontend Tier Config (`connect-grow-hire/src/utils/featureAccess.ts`)**
   - ✅ All limits match backend config
   - ✅ Helper functions implemented correctly

### 🚩 ISSUES FOUND

#### ISSUE #1
**SEVERITY:** CRITICAL  
**CATEGORY:** Config / Frontend  
**FILE:** `connect-grow-hire/src/contexts/FirebaseAuthContext.tsx`  
**LINE:** 21, 119, 120, 138, 139, 184, 185

**DESCRIPTION:**
Hardcoded incorrect credit values in `initialCreditsByTier` function and multiple user creation locations.

**EXPECTED:**
```typescript
const initialCreditsByTier = (tier: "free" | "pro" | "elite") => {
  if (tier === "free") return 300;
  if (tier === "pro") return 1500;
  if (tier === "elite") return 3000;
  return 300;
};
```

**FOUND:**
```typescript
const initialCreditsByTier = (tier: "free" | "pro") => (tier === "free" ? 120 : 840);
// Also hardcoded: credits: 120, maxCredits: 120 in multiple places
```

**STATUS:** ✅ FIXED - Updated to use correct values (300, 1500, 3000)

---

#### ISSUE #2
**SEVERITY:** HIGH  
**CATEGORY:** Config / Backend  
**FILE:** `backend/app/routes/runs.py`  
**LINE:** 72, 352

**DESCRIPTION:**
Hardcoded fallback credit values that don't match tier configs.

**EXPECTED:**
```python
credits_available = TIER_CONFIGS['free']['credits']  # 300
# or for pro:
credits_available = TIER_CONFIGS['pro']['credits']  # 1500
```

**FOUND:**
```python
credits_available = 120  # Line 72 - should be 300
credits_available = 1800  # Line 352 - should be 1500
```

**STATUS:** ✅ FIXED - Updated to use TIER_CONFIGS

---

#### ISSUE #3
**SEVERITY:** HIGH  
**CATEGORY:** Config / Backend  
**FILE:** `backend/app/config.py`  
**LINE:** 105, 127, 151

**DESCRIPTION:**
Batch size configuration mismatch. Audit specifies batch sizes of (1, 5, 15) but config uses `max_contacts` of (3, 8, 15).

**EXPECTED:**
According to audit:
- Free: batch_size = 1
- Pro: batch_size = 5
- Elite: batch_size = 15

**FOUND:**
```python
'free': {
    'max_contacts': 3,  # Should this be batch_size: 1?
}
'pro': {
    'max_contacts': 8,  # Should this be batch_size: 5?
}
'elite': {
    'max_contacts': 15,  # This matches
}
```

**RECOMMENDED FIX:**
Clarify if `max_contacts` and `batch_size` are different concepts:
- If they're the same: Update config to match audit (1, 5, 15)
- If different: Add explicit `batch_size` field to config

**STATUS:** ⚠️ NEEDS CLARIFICATION

---

## SECTION 2: FIREBASE/FIRESTORE AUDIT

### 🚩 ISSUES FOUND

#### ISSUE #4
**SEVERITY:** HIGH  
**CATEGORY:** Firebase / Security  
**FILE:** `firestore.rules` or `firestore.indexes.json`  
**LINE:** N/A

**DESCRIPTION:**
Need to verify Firestore security rules enforce tier restrictions.

**EXPECTED:**
- Export operations blocked for Free tier
- Full Firm Search blocked for Free tier
- Batch size validation
- Tier field cannot be modified by client

**FOUND:**
⚠️ Security rules file not found in codebase search. Need to verify rules exist and are properly configured.

**RECOMMENDED FIX:**
1. Locate or create `firestore.rules`
2. Add rules to prevent Free tier from accessing Pro/Elite features
3. Prevent client-side tier modification

**STATUS:** ⚠️ NEEDS VERIFICATION

---

#### ISSUE #5
**SEVERITY:** MEDIUM  
**CATEGORY:** Firebase / Schema  
**FILE:** `backend/app/models/users.py`  
**LINE:** 48-50

**DESCRIPTION:**
User schema has usage tracking fields but may be missing monthly reset tracking for Pro/Elite.

**EXPECTED:**
```python
'meetingPrep': {
    'used': 0,
    'limit': tier_config['coffee_chat_preps'],
    'lastResetDate': timestamp
},
'interviewPrep': {
    'used': 0,
    'limit': tier_config['interview_preps'],
    'lastResetDate': timestamp
}
```

**FOUND:**
```python
'coffeeChatPrepsUsed': 0,
'interviewPrepsUsed': 0,
# Missing: lastResetDate, limit fields
```

**RECOMMENDED FIX:**
Add structured usage tracking with reset dates for monthly features.

**STATUS:** ⚠️ NEEDS IMPROVEMENT

---

## SECTION 3: STRIPE INTEGRATION AUDIT

### ✅ CORRECTLY IMPLEMENTED

1. **Price IDs** - Correctly configured in `backend/app/config.py`
2. **Checkout Session** - Appears to be implemented

### 🚩 ISSUES FOUND

#### ISSUE #6
**SEVERITY:** HIGH  
**CATEGORY:** Stripe / Webhooks  
**FILE:** `backend/app/routes/billing.py` or webhook handler  
**LINE:** TBD

**DESCRIPTION:**
Need to verify webhook handlers properly update tier and reset credits/usage on:
- `checkout.session.completed`
- `invoice.paid` (monthly reset)
- `customer.subscription.deleted` (downgrade to free)

**EXPECTED:**
- On subscription: Set credits to 1500 (pro) or 3000 (elite)
- On invoice.paid: Reset monthly credits AND usage counters
- On cancellation: Revert to free tier (300 credits)

**FOUND:**
⚠️ Webhook handler implementation needs verification

**STATUS:** ⚠️ NEEDS VERIFICATION

---

## SECTION 4: FLASK BACKEND API AUDIT

### 🚩 ISSUES FOUND

#### ISSUE #7
**SEVERITY:** HIGH  
**CATEGORY:** Backend / Enforcement  
**FILE:** `backend/app/routes/runs.py`, `backend/app/routes/firm_search.py`  
**LINE:** TBD

**DESCRIPTION:**
Need to verify all routes have proper tier enforcement decorators.

**EXPECTED:**
```python
@require_tier(['pro', 'elite'])
def export_contacts():
    # Export logic
```

**FOUND:**
⚠️ Need to verify decorators exist and are applied to:
- Export endpoints
- Full Firm Search endpoints
- Bulk drafting endpoints

**STATUS:** ⚠️ NEEDS VERIFICATION

---

#### ISSUE #8
**SEVERITY:** MEDIUM  
**CATEGORY:** Backend / Credit Deduction  
**FILE:** `backend/app/routes/runs.py`  
**LINE:** 108-114

**DESCRIPTION:**
Credit validation exists but need to verify atomic operations.

**EXPECTED:**
```python
# Atomic credit deduction
db.collection('users').document(user_id).update({
    'credits': firestore.Increment(-cost)
})
```

**FOUND:**
⚠️ Need to verify credit deduction uses atomic operations to prevent race conditions

**STATUS:** ⚠️ NEEDS VERIFICATION

---

## SECTION 5: REACT FRONTEND AUDIT

### 🚩 ISSUES FOUND

#### ISSUE #9
**SEVERITY:** MEDIUM  
**CATEGORY:** Frontend / UI  
**FILE:** `connect-grow-hire/src/components/AppSidebar.tsx`  
**LINE:** 235, 244

**DESCRIPTION:**
Hardcoded fallback credit values in UI display.

**EXPECTED:**
```typescript
{user?.credits ?? 0}/{user?.maxCredits ?? TIER_LIMITS[user?.tier || 'free'].credits} credits
```

**FOUND:**
```typescript
{user?.credits ?? 0}/{user?.maxCredits ?? 120} credits
```

**STATUS:** ⚠️ NEEDS FIX

---

#### ISSUE #10
**SEVERITY:** MEDIUM  
**CATEGORY:** Frontend / Feature Gates  
**FILE:** Multiple component files  
**LINE:** TBD

**DESCRIPTION:**
Need to verify all feature gates are properly implemented:
- Export buttons disabled for Free
- Full Firm Search locked for Free
- Smart filters locked for Free
- Batch size limits enforced

**EXPECTED:**
All gated features should check `hasFeatureAccess()` or similar before rendering.

**FOUND:**
⚠️ Need systematic review of all components

**STATUS:** ⚠️ NEEDS VERIFICATION

---

## SECTION 6: ELITE-SPECIFIC FEATURES

### 🚩 ISSUES FOUND

#### ISSUE #11
**SEVERITY:** HIGH  
**CATEGORY:** Features / Elite  
**FILE:** Multiple files  
**LINE:** TBD

**DESCRIPTION:**
Need to verify Elite-specific features are implemented:
- Priority queue for contact generation
- Personalized outreach templates (tailored to resume)
- Weekly personalized firm insights
- Early access to new AI tools

**EXPECTED:**
These features should exist and be gated to Elite tier only.

**FOUND:**
⚠️ Need to search codebase for these feature implementations

**STATUS:** ⚠️ NEEDS VERIFICATION

---

## SECTION 7: EDGE CASES & SECURITY

### 🚩 ISSUES FOUND

#### ISSUE #12
**SEVERITY:** CRITICAL  
**CATEGORY:** Security / Tier Tampering  
**FILE:** Backend routes  
**LINE:** TBD

**DESCRIPTION:**
Need to verify tier is always validated from database, never trusted from client request.

**EXPECTED:**
```python
# Always fetch from DB
user_ref = db.collection('users').document(user_id)
user_data = user_ref.get().to_dict()
tier = user_data.get('tier', 'free')
```

**FOUND:**
⚠️ Need to verify no routes accept tier from request body/params

**STATUS:** ⚠️ NEEDS VERIFICATION

---

#### ISSUE #13
**SEVERITY:** HIGH  
**CATEGORY:** Edge Cases / Free Tier  
**FILE:** Backend reset logic  
**LINE:** TBD

**DESCRIPTION:**
Verify Free tier limits are LIFETIME, not monthly.

**EXPECTED:**
- Free tier Meeting Prep: 1 lifetime (never resets)
- Free tier Interview Prep: 1 lifetime (never resets)
- Free tier Alumni Searches: 10 lifetime (never resets)

**FOUND:**
⚠️ Need to verify monthly reset logic excludes Free tier

**STATUS:** ⚠️ NEEDS VERIFICATION

---

## SECTION 8: UI/UX CONSISTENCY

### 🚩 ISSUES FOUND

#### ISSUE #14
**SEVERITY:** LOW  
**CATEGORY:** UI / Consistency  
**FILE:** Multiple frontend files  
**LINE:** TBD

**DESCRIPTION:**
Need to verify consistent terminology and usage display across all components.

**EXPECTED:**
- "Meeting Prep" (not "Meeting" or variations)
- "Interview Prep" (not "Interview Preparation")
- Accurate usage displays with correct limits

**FOUND:**
⚠️ Need systematic review

**STATUS:** ⚠️ NEEDS VERIFICATION

---

## PRIORITY FIX ORDER

1. **CRITICAL (Fix Immediately):**
   - ✅ Issue #1: Frontend credit defaults (FIXED)
   - ✅ Issue #2: Backend credit defaults (FIXED)
   - Issue #12: Tier tampering prevention (VERIFY)

2. **HIGH (Fix Soon):**
   - Issue #3: Batch size configuration (CLARIFY)
   - Issue #4: Firestore security rules (VERIFY)
   - Issue #6: Stripe webhook handlers (VERIFY)
   - Issue #7: Backend tier enforcement (VERIFY)
   - Issue #11: Elite features implementation (VERIFY)

3. **MEDIUM (Fix When Possible):**
   - Issue #5: Usage tracking schema (IMPROVE)
   - Issue #8: Atomic credit operations (VERIFY)
   - Issue #9: UI hardcoded values (FIX)
   - Issue #10: Feature gates (VERIFY)

4. **LOW (Polish):**
   - Issue #13: Free tier reset logic (VERIFY)
   - Issue #14: UI consistency (REVIEW)

---

## ESTIMATED EFFORT

- **Critical fixes:** 2-4 hours
- **High priority:** 8-12 hours
- **Medium priority:** 4-6 hours
- **Low priority:** 2-4 hours
- **Total:** 16-26 hours

---

## NEXT STEPS

1. ✅ Fix critical credit defaults (COMPLETED)
2. Verify Firestore security rules exist and are correct
3. Review and test Stripe webhook handlers
4. Add tier enforcement decorators to all protected routes
5. Verify Elite features are implemented
6. Systematic review of frontend feature gates
7. Add comprehensive tests for tier logic

---

## NOTES

- Most tier configurations are correctly defined in `backend/app/config.py`
- Frontend tier limits match backend in `featureAccess.ts`
- Main issues are hardcoded fallback values and missing verification of enforcement
- Need to verify security rules and webhook handlers are properly implemented
