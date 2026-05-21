# Pricing Page Differences Summary

## Quick Reference: Current vs New Design

---

## 1. Layout Structure

| Aspect | Current | New Design |
|--------|---------|------------|
| **Grid Layout** | 2 columns (Free + Pro) | 3 columns (Free + Pro + Elite) |
| **Max Width** | `max-w-6xl` | `max-w-7xl` |
| **Grid Classes** | `grid-cols-1 md:grid-cols-2` | `grid-cols-1 md:grid-cols-3` |

---

## 2. Free Plan

| Feature | Current | New Design |
|---------|---------|------------|
| **Credits** | 150 credits (10 emails) | 300 credits (~20 contacts) |
| **Features** | • 150 credits<br>• Estimated time saved: 250 minutes<br>• Try out platform risk free<br>• Limited Features | • 300 credits (~20 contacts)<br>• Basic contact search + AI email drafts<br>• Gmail integration<br>• Directory saves all contacts<br>• 1 Meeting Prep + 1 Interview Prep<br>• Exports disabled |
| **Button Text** | "Start for free" | "Start for Free" |

---

## 3. Pro Plan

| Feature | Current | New Design |
|---------|---------|------------|
| **Price** | ~~$34.99~~ **$8.99/month** | ~~$19.99~~ **$14.99/month** |
| **Credits** | 1800 credits (120 emails) | 1,500 credits (~100 contacts) |
| **Badge** | "RECOMMENDED" or "ACTIVE" | "MOST POPULAR" or "ACTIVE" |
| **Visual Style** | Simple border: `border-2 border-blue-500/50` | Gradient border wrapper with shadow effect |
| **Hover Effect** | `hover:scale-[1.02]` | `hover:scale-[1.07]` |
| **Scale** | Normal | `scale-105` (always scaled up) |
| **Features** | • 1800 credits<br>• Estimated time saved: 2500 minutes<br>• Everything in free plus:<br>• Directory permanently saves<br>• Priority Support<br>• Advanced features | • 1,500 credits (~100 contacts)<br>• Everything in Free, plus:<br>• Full Firm Search<br>• Smart school/major/career filters<br>• 10 Meeting Preps/month<br>• 5 Interview Preps/month<br>• Unlimited directory saving<br>• Bulk drafting + Export unlocked (CSV & Gmail)<br>• Estimated time saved: ~2,500 minutes/month |
| **Button Text** | "Start now" | "Upgrade to Pro" |
| **Price Font Size** | `text-3xl` | `text-4xl` |

---

## 4. Elite Plan

| Feature | Current | New Design |
|---------|---------|------------|
| **Existence** | ❌ Does not exist | ✅ New tier |
| **Price** | N/A | **$34.99/month** |
| **Credits** | N/A | 3,000 credits (~200 contacts) |
| **Features** | N/A | • 3,000 credits (~200 contacts)<br>• Everything in Pro, plus:<br>• Unlimited Meeting Prep<br>• Unlimited Interview Prep<br>• Priority queue for contact generation<br>• Personalized outreach templates (tailored to resume)<br>• Weekly personalized firm insights<br>• Early access to new AI tools<br>• Estimated time saved: ~5,000 minutes/month |
| **Button Text** | N/A | "Go Elite" |

---

## 5. Visual Design Differences

### Pro Plan Styling

**Current:**
```tsx
<GlassCard className="border-2 border-blue-500/50">
```

**New Design:**
```tsx
<div className="p-[3px] rounded-2xl bg-gradient-to-r from-blue-400 via-blue-600 to-cyan-400 shadow-[0_0_40px_rgba(59,130,246,0.5)] scale-105 z-10">
  <GlassCard className="relative rounded-xl h-full">
    {/* Badge positioned top-right */}
  </GlassCard>
</div>
```

---

## 6. Functionality Differences

| Aspect | Current | New Design |
|--------|---------|------------|
| **handleUpgrade Types** | `'free' \| 'pro'` | `'free' \| 'pro' \| 'elite'` |
| **Elite Checkout** | N/A | Stripe checkout (same as Pro) |

---

## 7. Content Organization

| Aspect | Current | New Design |
|--------|---------|------------|
| **Feature Hierarchy** | Simple list | Clear "Everything in X, plus:" structure |
| **Feature Detail** | Less detailed | More specific and comprehensive |
| **Feature Naming** | Generic ("Advanced features") | Specific ("Full Firm Search", "Smart filters") |

---

## 8. Text Styling

| Element | Current | New Design |
|---------|---------|------------|
| **Headings** | `text-white text-slate-900` | Same (consistent) |
| **Body Text** | `text-gray-300 text-slate-700` | Same (consistent) |
| **Muted Text** | `text-gray-400 text-slate-600` | Same (consistent) |
| **Pro Price** | `text-3xl` | `text-4xl` |

---

## 9. Key Missing Features in New Design

1. **Free Plan**: "10 alumni searches" (present in Index.tsx but not in new Pricing.tsx)
2. **Free Plan**: "Estimated time saved" (present in Index.tsx but not in new Pricing.tsx)

---

## 10. Summary of Major Changes

✅ **Add**: Elite plan tier  
✅ **Update**: Free plan credits (150 → 300)  
✅ **Update**: Pro plan price ($8.99 → $14.99)  
✅ **Update**: Pro plan credits (1800 → 1,500)  
✅ **Update**: Layout (2-column → 3-column)  
✅ **Update**: Pro plan visual styling (gradient border)  
✅ **Update**: All feature lists (more detailed)  
✅ **Update**: Button text (more specific)  
✅ **Update**: Function signatures (add 'elite' type)  

---

## 🎯 Priority Changes

1. **High Priority**:
   - Add Elite plan
   - Update layout to 3 columns
   - Update Pro plan styling (gradient border)
   - Update all feature lists

2. **Medium Priority**:
   - Update pricing ($8.99 → $14.99)
   - Update credits (150 → 300 for Free, 1800 → 1,500 for Pro)
   - Update button text

3. **Low Priority**:
   - Text styling refinements
   - Hover effect updates
   - Font size adjustments
