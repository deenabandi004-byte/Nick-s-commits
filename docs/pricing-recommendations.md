# Offerloop Pricing Plan

Canonical pricing plan. Last updated 2026-05-17. Supersedes all prior pricing notes.

---

## TL;DR

Anchor with a public list price ($29 / $69). Show `.edu`-verified students the real prices ($14.99 / $34.99) as "50% student discount". Lifetime price lock for `.edu` users. Split the trial: 30 days for `.edu`, 14 days for non-`.edu`. Add annual plans at 17% off. Bump contacts-per-search (5 / 15 / 30). Bump credit budgets (Free 500 / Pro 3,000 / Elite 12,000). Drop the interview prep feature for now. No promo discounts.

---

## Final pricing table

| Tier | Public list | **Student (.edu)** | Annual student | Trial |
|---|---|---|---|---|
| Free | $0 | $0 | — | — |
| Pro | ~~$29/mo~~ | **$14.99/mo** | **$149/yr** (17% off) | 30d for `.edu` / 14d non-`.edu`, no credit card |
| Elite | ~~$69/mo~~ | **$34.99/mo** | **$349/yr** (17% off) | 30d Pro for `.edu` / 14d non-`.edu`; upgrade to Elite anytime |

**Lifetime student price lock**: once `.edu`-verified at signup, that user keeps the student price forever — including after graduation. Tag the customer in Stripe with `metadata.studentLockIn = 'true'` so future price changes route them to the locked-in student price.

---

## Tier limits

| Setting | Free | Pro | Elite |
|---|---|---|---|
| **Credits / month** | **500** | **3,000** | **12,000** |
| Contacts per search | **5** | **15** | **30** |
| Searches per day | 3 | unlimited | unlimited |
| Coffee chat preps | 1 / month | 10 / month | unlimited |
| Alumni searches | within credit budget | within credit budget | within credit budget |
| Email drafting | unlimited within credits | unlimited within credits | unlimited within credits |
| Network tracker | view + manual add | full (Gmail sync) | full (Gmail sync) |
| Scout AI | within credit budget | within credit budget | priority queue |
| Firm search | locked | included | included |
| Resume tools | locked | included | included |
| Smart filters | locked | included | included |
| Bulk drafting | locked | included | included |
| Export | locked | included | included |
| The Agent | locked | locked | included |
| Founder kickoff call | — | — | included |
| Weekly insights | — | — | included |
| Early access | — | — | included |

**Interview prep is dropped for now** — was 2/lifetime on Free, 5/mo on Pro, unlimited on Elite. Re-introduce later if/when the feature ships back.

---

## Why these credit numbers

Unit cost: ~$0.02 per contact found (PDL + Hunter verification + enrichment).

| Tier | Credits | Max contacts | Cost @ 100% util | Margin @ 100% | Margin @ ~30% (real) | Multiplier vs Free |
|---|---|---|---|---|---|---|
| Free | 500 | ~33 | $0.66 | — (loss) | — | 1x |
| Pro | 3,000 | ~200 | $4.00 | 73% | ~87% | **6x** |
| Elite | 12,000 | ~800 | $16.00 | 54% | ~85% | **24x** (4x Pro) |

- **6x Free→Pro** matches Lusha's free→paid pattern. Big enough that hitting the Free ceiling produces a strong upgrade pull (Slack data: ceiling-hit users convert at 3x average rate).
- **4x Pro→Elite** gives Elite an "effectively unlimited" feel without torching margins. 800 contacts/month is past any single student's practical use.
- Credits are the throttle. Per-search caps (5/15/30) are just UX to prevent "show me 1,000 results" expectations.

---

## Trial structure

| Audience | Trial | Reasoning |
|---|---|---|
| `.edu` verified | **30 days Pro, no credit card** | Captures full recruiting-cycle (Sept IB, Jan consulting). 3-4 weeks to send emails → get replies → do coffee chats → feel the loop close. |
| Non-`.edu` | **14 days Pro, no credit card** | SaaS standard (62% of products). Day 7 = activation, day 14 = conversion cliff. |

Both fall back to Free tier at expiration (soft landing, no surprise charge).

---

## What stays from the original plan

- Three-tier structure (Free / Pro / Elite)
- Ungate the `/pricing` page (it currently redirects to `/signin`)
- Annual plans at 17% off (= "2 months free" framing)
- No promo discounts, ever. Only allowed discount is the annual one. The student price is *the* price for students, not a coupon.
- Build the Elite value stack: The Agent, unlimited coffee chat, priority response support, early access, founder kickoff call

## What changed from the original plan

- ❌ Original "shorten trial to 7 days for everyone" → **NEW: 30 days for .edu, 14 days non-.edu**
- ❌ Original kept Free tier at 300 credits, lifetime caps → **NEW: 500 credits, monthly caps, no interview prep**
- ❌ Original kept contacts-per-search at 3/8/15 → **NEW: 5/15/30** (competitor data showed nobody else has per-search caps)
- ➕ Added: list-price anchor strategy ($29/$69 crossed out)
- ➕ Added: lifetime `.edu` price lock
- ➕ Added: credit budget restructure (500 / 3,000 / 12,000)
- ➕ Added: annual credit-refill cron (critical bug fix — see below)

---

## Implementation checklist

### Code (this branch)

- [x] Rewrite `docs/pricing-recommendations.md` with consolidated plan
- [ ] Update `backend/app/config.py` TIER_CONFIGS (credits, contact caps, drop interview_preps, monthly coffee chat)
- [ ] Update `connect-grow-hire/src/lib/constants.ts` (mirror backend, fix all drift)
- [ ] `.edu` verification at signup → set `isStudent: true` + `verifiedEduEmail` on user doc
- [ ] `backend/app/services/stripe_client.py:75` → conditional `trial_period_days`: 30 if `isStudent` else 14
- [ ] Add `metadata: { studentLockIn: 'true' }` to checkout session for lifetime price lock
- [ ] Add monthly credit-refill cron / scheduled job for annual subscribers (**must ship before annual goes live**)
- [ ] Ungate `/pricing` route (remove auth gate)
- [ ] Add Monthly/Annual toggle to pricing page
- [ ] Add list-price strikethrough on pricing page
- [ ] Surface "Lock in student price for life" badge for `.edu` users
- [ ] Update CTA microtext sitewide: `Free. No credit card. 30 days of Pro with your .edu.`

### Stripe dashboard (manual)

- [ ] Create Price: **Pro Annual** $149/yr (recurring, interval = year)
- [ ] Create Price: **Pro List** $29/mo (recurring, interval = month) — anchor only, not in checkout flow yet
- [ ] Create Price: **Elite Annual** $349/yr (recurring, interval = year)
- [ ] Create Price: **Elite List** $69/mo (recurring, interval = month)
- [ ] Add env vars: `STRIPE_PRO_ANNUAL_PRICE_ID`, `STRIPE_ELITE_ANNUAL_PRICE_ID`
- [ ] (Optional, defer) `STRIPE_PRO_LIST_PRICE_ID`, `STRIPE_ELITE_LIST_PRICE_ID`

### Stripe — do NOT do

- ❌ Do not use Stripe Coupons for the student discount. Use separate Price objects. Coupons appear as "discount" on receipts and train customers to expect promos.
- ❌ Do not enable Stripe Tax surcharge on the student price (it'd defeat the "this is the real price" framing).

---

## Critical bug to fix before annual ships

`backend/app/services/stripe_client.py:332` refills credits on `invoice.payment_succeeded`. For monthly subs this fires monthly. **For annual subs it fires once a year** — meaning annual subscribers would get 3,000 (Pro) or 12,000 (Elite) credits *for a whole year* and starve mid-year.

Fix: add a separate scheduled job (daemon thread or external cron) that resets credits for active annual subscribers on the 1st of every month. Look at the Gmail watch renewal daemon thread in `wsgi.py` as a reference pattern.

---

## Kill criteria (revisit at day 90)

Pricing is wrong if any of these hit after 60-90 days live:

1. **Free → paid conversion drops below 18%** (currently 22%; 4-point drop means the list-price anchor or trial split is hurting more than helping)
2. **Annual mix stays below 20% of new paid subs** (means the lifetime lock-in or 17% discount isn't compelling — pull the lock-in earlier in the upgrade flow)
3. **Non-`.edu` signups exceed 5% of paid users** (verification gate is leaking — tighten)
4. **Trial → paid drops below 25%** (current 30-day trial-to-paid baseline; if it drops, the trial-length split was wrong)

If two hit, restructure. If one hits, isolate the lever and adjust that one.

---

## Sources

- [SaaS Pricing Guide 2026 — Momentum Nexus](https://www.momentumnexus.com/blog/saas-pricing-strategy-guide-2026/)
- [Patrick Campbell / ProfitWell on pricing — Intercom](https://www.intercom.com/blog/podcasts/profitwells-patrick-campbell-on-the-art-and-science-of-pricing/)
- [Van Westendorp PSM — Wikipedia](https://en.wikipedia.org/wiki/Van_Westendorp's_Price_Sensitivity_Meter)
- [Free trial conversion benchmarks — Userpilot](https://userpilot.com/blog/free-trial-conversion-rate/)
- [Annual discount analysis of 100 SaaS — InnerTrends](https://www.innertrends.com/blog/saas-pricing-strategies)
- [SaaS discount strategy 2026 — Medium](https://medium.com/@lesiapolivod/saas-discount-strategy-2026-when-discounts-work-and-when-they-dont-e33dac0014fb)
- [Hormozi value equation — QuantumByte](https://quantumbyte.ai/articles/alex-hormozi-value-equation-app-monetization)
- [Cursor Student Discount — Cursor Docs](https://cursor.com/help/account-and-billing/student-discount)
- [Notion for Education](https://www.notion.com/help/notion-for-education)
- [2026 Free-to-Paid Conversion Report — Growth Unhinged](https://www.growthunhinged.com/p/free-to-paid-conversion-report)
- [Apollo.io Pricing 2026 — Saleshandy](https://www.saleshandy.com/blog/apolloio-pricing/)
- [Lusha Pricing 2026 — Salesmotion](https://salesmotion.io/blog/lusha-pricing)
- [Hunter.io Pricing 2026 — MarketBetter](https://marketbetter.ai/blog/hunter-io-pricing-breakdown-2026/)
- [Perplexity Free vs Pro 2026 — Datastudios](https://www.datastudios.org/post/perplexity-ai-free-versus-paid-features-explained-usage-limits-model-availability-speed-and-work)
- [Freemium Upgrade Triggers — Monetizely](https://www.getmonetizely.com/articles/crafting-freemium-to-premium-upgrade-journeys-that-actually-convert)
