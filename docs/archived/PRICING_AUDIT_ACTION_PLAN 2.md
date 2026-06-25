# PRICING AUDIT ACTION PLAN

Based on `PRICING_AUDIT_REPORT.md`, here's what needs to be done, organized by priority.

---

## ✅ COMPLETED (Already Fixed)

1. ✅ **Issue #1**: Frontend credit defaults - Fixed hardcoded 120/840 → 300/1500/3000
2. ✅ **Issue #2**: Backend credit defaults - Fixed hardcoded 120/1800 → Using TIER_CONFIGS
3. ✅ **Issue #9**: UI hardcoded values - Fixed AppSidebar, Outbox, MeetingLibrary

---

## 🔴 CRITICAL PRIORITY (Do First)

### Issue #12: Tier Tampering Prevention
**Why Critical:** Security vulnerability - users could potentially fake their tier

**Tasks:**
1. Search all backend routes for any that accept `tier` from request body/params
2. Verify ALL routes fetch tier from Firestore, never from client
3. Add validation to reject any tier values in request payloads
4. Test: Try sending fake tier in API requests - should be ignored

**Files to Check:**
- `backend/app/routes/*.py` - All route handlers
- Look for patterns like: `request.json.get('tier')` or `request.form.get('tier')`

**Expected Pattern:**
```python
# ✅ CORRECT - Always fetch from DB
user_ref = db.collection('users').document(user_id)
user_data = user_ref.get().to_dict()
tier = user_data.get('tier', 'free')

# ❌ WRONG - Never trust client
tier = request.json.get('tier')  # SECURITY RISK
```

---

## 🟠 HIGH PRIORITY (Do Next)

### Issue #3: Batch Size Configuration Clarification
**Why High:** Mismatch between audit spec (1, 5, 15) and config (3, 8, 15)

**Tasks:**
1. **Clarify requirement:** Are `max_contacts` and `batch_size` different?
   - `max_contacts` = Maximum contacts returned per search?
   - `batch_size` = Maximum batch operations allowed?
2. **Decision needed:**
   - If same: Update `TIER_CONFIGS` to use batch_size: 1, 5, 15
   - If different: Add explicit `batch_size` field to config
3. **Update code** to use correct values

**Files:**
- `backend/app/config.py` - TIER_CONFIGS
- `backend/app/routes/runs.py` - Uses max_contacts
- `backend/app/routes/firm_search.py` - Uses batch_size

---

### Issue #4: Firestore Security Rules
**Why High:** Security - prevents client-side bypass of tier restrictions

**Tasks:**
1. **Locate or create** `firestore.rules` file
2. **Add rules** to:
   - Block Free tier from export operations
   - Block Free tier from Full Firm Search
   - Prevent client from modifying `tier` field
   - Validate batch size limits
3. **Deploy rules** to Firebase
4. **Test** that rules work correctly

**Expected Rules:**
```javascript
// Example structure needed
match /users/{userId} {
  // Prevent tier modification
  allow update: if request.auth.uid == userId 
    && !('tier' in request.resource.data.diff(resource.data));
  
  // Export operations require Pro/Elite
  match /exports/{exportId} {
    allow create: if get(/databases/$(database)/documents/users/$(userId)).data.tier in ['pro', 'elite'];
  }
}
```

---

### Issue #6: Stripe Webhook Handlers
**Why High:** Payment/subscription logic - affects user upgrades and monthly resets

**Tasks:**
1. **Locate webhook handler** (likely in `backend/app/routes/billing.py`)
2. **Verify handlers exist for:**
   - `checkout.session.completed` → Set tier, credits (1500/3000)
   - `invoice.paid` → Reset monthly credits AND usage counters
   - `customer.subscription.deleted` → Revert to free (300 credits)
3. **Test each webhook** with Stripe test events
4. **Verify** credit reset logic works correctly

**Files to Check:**
- `backend/app/routes/billing.py`
- Look for `@app.route('/api/webhook')` or similar
- Check for `stripe.Webhook.construct_event()` calls

**Expected Behavior:**
```python
# On checkout.session.completed
if event['type'] == 'checkout.session.completed':
    # Update tier to pro/elite
    # Set credits to 1500 (pro) or 3000 (elite)
    # Reset usage counters

# On invoice.paid (monthly reset)
if event['type'] == 'invoice.paid':
    # Reset credits to tier amount
    # Reset coffeeChatPrepsUsed = 0
    # Reset interviewPrepsUsed = 0
    # Update lastCreditReset, lastUsageReset dates
```

---

### Issue #7: Backend Tier Enforcement
**Why High:** Prevents Free users from accessing paid features

**Tasks:**
1. **Find or create** `@require_tier()` decorator
2. **Apply decorator** to all protected routes:
   - Export endpoints (`/api/export`, `/api/contacts/export`)
   - Full Firm Search (`/api/firm-search`)
   - Bulk drafting endpoints
3. **Verify** decorator checks tier from database (not request)
4. **Test** that Free users get 403 errors

**Files to Check:**
- `backend/app/routes/runs.py` - Export logic
- `backend/app/routes/firm_search.py` - Firm search
- `backend/app/routes/emails.py` - Bulk drafting
- `backend/app/extensions.py` - Decorator definitions

**Expected Pattern:**
```python
@require_tier(['pro', 'elite'])
@require_firebase_auth
def export_contacts():
    # Export logic here
    pass
```

---

### Issue #11: Elite Features Implementation
**Why High:** Missing features that users are paying for

**Tasks:**
1. **Search codebase** for each Elite feature:
   - Priority queue for contact generation
   - Personalized outreach templates (tailored to resume)
   - Weekly personalized firm insights
   - Early access to new AI tools
2. **Verify** each feature exists and is gated to Elite only
3. **If missing:** Implement or document as "coming soon"

**Search Terms:**
- "priority queue"
- "personalized templates"
- "weekly insights"
- "early access"

---

## 🟡 MEDIUM PRIORITY (Do When Time Permits)

### Issue #5: Usage Tracking Schema
**Why Medium:** Better tracking for monthly resets

**Tasks:**
1. **Update user schema** to include structured usage tracking:
   ```python
   'meetingPrep': {
       'used': 0,
       'limit': 10,  # or 1 for free, 'unlimited' for elite
       'lastResetDate': timestamp
   }
   ```
2. **Update** user creation logic
3. **Update** usage increment logic
4. **Update** monthly reset logic to use new structure

**Files:**
- `backend/app/models/users.py` - User schema
- `backend/app/services/auth.py` - Reset logic

---

### Issue #8: Atomic Credit Operations
**Why Medium:** Prevents race conditions in credit deduction

**Tasks:**
1. **Find all credit deduction code**
2. **Verify** uses `firestore.Increment()` for atomic operations
3. **Replace** any non-atomic patterns:
   ```python
   # ❌ BAD - Race condition
   credits = get_credits()
   set_credits(credits - cost)
   
   # ✅ GOOD - Atomic
   user_ref.update({'credits': firestore.Increment(-cost)})
   ```

**Files to Check:**
- `backend/app/routes/runs.py` - Credit deduction
- `backend/app/services/auth.py` - Credit operations
- Any other files that modify credits

---

### Issue #10: Frontend Feature Gates
**Why Medium:** UX - users should see locked features clearly

**Tasks:**
1. **Systematic review** of all components:
   - Export buttons (CSV, Gmail bulk draft)
   - Full Firm Search component
   - Smart filters (school/major/career)
   - Batch size selectors
2. **Verify** each uses `hasFeatureAccess()` or similar
3. **Add** upgrade prompts where missing
4. **Test** that Free users see locked states

**Components to Check:**
- `ContactDirectory.tsx` - Export buttons
- `FirmSearchPage.tsx` - Firm search access
- `ContactSearchPage.tsx` - Filters, batch size
- Any component with "Pro" or "Elite" badges

---

## 🟢 LOW PRIORITY (Polish)

### Issue #13: Free Tier Reset Logic
**Why Low:** Verify existing logic is correct

**Tasks:**
1. **Find monthly reset function**
2. **Verify** it excludes Free tier users
3. **Verify** Free tier limits never reset (lifetime)

**Files:**
- `backend/app/services/auth.py` - Reset logic
- Any cron/scheduled functions

---

### Issue #14: UI/UX Consistency
**Why Low:** Polish and consistency

**Tasks:**
1. **Review terminology** across all components:
   - "Meeting Prep" (not "Meeting")
   - "Interview Prep" (not "Interview Preparation")
2. **Verify** usage displays are accurate:
   - "X / 1 used" (Free)
   - "X / 10 this month" (Pro)
   - "Unlimited" (Elite)
3. **Check** reset date displays for Pro/Elite

---

## 📋 IMPLEMENTATION CHECKLIST

### Phase 1: Security (Critical)
- [ ] Issue #12: Verify tier tampering prevention
- [ ] Issue #4: Firestore security rules
- [ ] Issue #7: Backend tier enforcement decorators

### Phase 2: Payment & Features (High)
- [ ] Issue #6: Stripe webhook handlers
- [ ] Issue #11: Elite features verification
- [ ] Issue #3: Batch size configuration

### Phase 3: Data & UX (Medium)
- [ ] Issue #5: Usage tracking schema
- [ ] Issue #8: Atomic credit operations
- [ ] Issue #10: Frontend feature gates

### Phase 4: Polish (Low)
- [ ] Issue #13: Free tier reset logic
- [ ] Issue #14: UI/UX consistency

---

## 🧪 TESTING REQUIREMENTS

After fixes, test:

1. **Security Tests:**
   - Free user cannot access export endpoints (403)
   - Free user cannot access firm search (403)
   - Cannot modify tier via API request
   - Firestore rules block unauthorized operations

2. **Payment Tests:**
   - Subscription upgrade sets correct tier and credits
   - Monthly reset works for Pro/Elite
   - Cancellation reverts to Free tier

3. **Feature Tests:**
   - Free: 1 Meeting Prep (lifetime, no reset)
   - Pro: 10 Meeting Preps/month (resets)
   - Elite: Unlimited Meeting Preps
   - Batch size limits enforced correctly

4. **Edge Cases:**
   - Race condition: Two simultaneous credit deductions
   - Mid-cycle upgrade/downgrade
   - Failed payment handling

---

## 📝 NOTES

- Most critical issues (credit defaults) are already fixed
- Focus on security (tier tampering, Firestore rules) first
- Payment webhooks are critical for subscription management
- Elite features may need to be implemented if missing
- Testing is essential after each fix

---

## ⏱️ ESTIMATED TIME

- **Phase 1 (Security):** 4-6 hours
- **Phase 2 (Payment & Features):** 6-8 hours
- **Phase 3 (Data & UX):** 4-6 hours
- **Phase 4 (Polish):** 2-3 hours
- **Testing:** 4-6 hours
- **Total:** 20-29 hours
