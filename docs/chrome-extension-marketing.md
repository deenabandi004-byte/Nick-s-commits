# Chrome Extension Marketing Strategy

How Offerloop's Chrome extension gets positioned, distributed, and grown. Separate from the website positioning work in [`positioning-and-messaging.md`](./positioning-and-messaging.md). The homepage rule is fixed: **the extension is not a homepage section.** This doc is everything else.

---

## Core principle

The extension is not a product. It is a surface where Offerloop already runs. It brings find → reach → track into the two places students live online: **LinkedIn** and **job boards**.

The pattern is the same across every category leader with a Chrome extension. Their extension is positioned as the main product extended into the host site, not as a standalone tool:

- **Lemlist**: brings lemlist into Gmail, HubSpot, Salesforce
- **Apollo**: turns LinkedIn into a live prospecting tool
- **Lavender**: a personal email coach right in your inbox
- **Clay**: turns the entire internet into a data source

The verb is *brings* or *turns*. Not *adds*. The extension extends the host.

For Offerloop, the line is: **Offerloop, where the people already are.**

Two modes today:
- **Contact mode**: LinkedIn profile → generate email → save to your tracker
- **Job mode**: job posting on 8 boards (Greenhouse, Lever, Workday, Indeed, Handshake, Glassdoor, ZipRecruiter, Wellfound) → find recruiters, draft cover letter

---

## Where the extension does NOT go

- **Not on the homepage.** Above-the-fold space goes to the product loop, not the install button. Cold visitors have not earned the extension yet.
- **Not in the primary CTA.** Primary CTA stays `Create account`. The extension is a power-user surface, not the entry point.
- **Not in the hero.** Same reason.
- **Not in the pricing page as a paid-tier gate.** Lemlist does this. We will not. The extension is a top-of-funnel acquisition surface; gating it kills that role.

---

## Where the extension DOES go

### 1. Chrome Web Store listing (canonical)

The Web Store listing **is** the extension's landing page. That is where install conversion actually happens. Optimize it like one.

- **Title.** Current: `Offerloop`. Better: `Offerloop - LinkedIn networking and job board assistant` (puts both host sites into Web Store search).
- **Short description.** Current: `LinkedIn networking assistant powered by Offerloop`. Better: `Generate emails from any LinkedIn profile. Find recruiters on any job posting. Save everything to your tracker.`
- **Full description.** Screenshot-led. Show Contact mode in action, then Job mode. Then the install button.
- **Demo video.** Short loop. LinkedIn button injection, Gmail draft appearing. Web Store conversion responds heavily to video.

### 2. Dedicated `/extension` page on offerloop.ai

Public, indexable, anchors organic SEO. Sections:

1. Hero: `Offerloop, where the people already are.` Install button → Chrome Web Store.
2. Contact mode: LinkedIn profile → email draft. Animated GIF.
3. Job mode: job posting → recruiter list + cover letter draft. Animated GIF.
4. The 9 supported sites, with wordmarks.
5. Install button (footer).

Link from: top nav (`Extension`), site footer, account settings, post-signup checklist.

### 3. In-app install prompt (highest-converting moment)

After a user's first successful contact search, show a non-blocking banner:

> Install the extension to find emails from LinkedIn profiles in one click.

This is the moment the user has felt the value once. Conversion to install at this step should be 2–3x the cold website rate.

### 4. Reddit / forum organic acquisition

The extension's primary acquisition channel is **not** paid ads or the homepage. It's organic discovery in threads where the problem is being discussed.

Target subreddits:
- r/csMajors
- r/InvestmentBanking
- r/consulting
- r/financialcareers
- r/EngineeringStudents
- r/cscareerquestions
- r/sales (B2B angle, not students)

Listen for: `how do I find this person's email`, `how do I cold email recruiters`, `best way to network on LinkedIn for [industry]`.

Engagement rules:
- Don't post the extension. Reply with a specific answer first. Mention the extension as a tool the person could use. Link only if asked.
- One Reddit account per founder. No alts. No mod-flagged self-promotion.
- Track which threads convert to installs (UTM the Web Store link).

---

## Messaging guardrails

Same ban list as the homepage. No `AI-powered`, no `intelligent`, no `seamless`, no em dashes.

Position the extension as a verb, not a feature:

| ✅ Yes | ❌ No |
|---|---|
| Generate emails from any LinkedIn profile. | AI-powered email generation for LinkedIn. |
| Find recruiters on any job posting. | Intelligent recruiter discovery for job boards. |
| Save everything to your tracker. | Seamless tracker integration. |
| Offerloop, where the people already are. | Take Offerloop with you, anywhere. |

---

## Metrics to track

| Metric | Why it matters | How to measure |
|---|---|---|
| Install rate from in-app prompt | Confirms the prompt fires at the right moment | % of users who see the prompt and install within 7 days |
| Retention lift, extension users vs not | Confirms the extension drives stickiness | Cohort: 30-day retention of installers vs non-installers |
| Reddit-driven installs | Confirms organic channel works | UTM Web Store link from every Reddit reply |
| Chrome Web Store conversion | Confirms listing is well-optimized | Web Store dashboard analytics |
| Extension DAU / overall DAU | Health of the extension as a product surface | Internal analytics, weekly |

---

## Kill criteria

After 8 weeks of in-app prompt + Reddit acquisition + Web Store optimization:

1. **If in-app install prompt converts at <10% lifetime**, the prompt is at the wrong moment or the copy is wrong. Move it earlier or later in the flow.
2. **If extension users do not retain better than non-installers at 30 days**, the extension is not a stickiness driver and gets deprioritized as a strategic surface.
3. **If Web Store conversion stays below 5%** (installs / listing views), the listing copy and screenshots need a full rebuild before anything else.

---

## Out of scope (for now)

- Paid Chrome ad campaigns. Organic only until install rate proves out.
- Gating the extension behind Pro/Elite. It is acquisition, not retention.
- Safari extension distribution. Safari-extension folder exists; deprioritized until Chrome version is converting.
- "Install extension" CTA on the pricing page. Not a paid feature.

---

## Open questions

1. Should Job mode get its own page or stay bundled with Contact mode on `/extension`? Job mode is harder to explain but solves a different pain. Lean: **bundle, with a section toggle.**
2. Founder-led Reddit acquisition or hire it out? Lean: **founder-led for the first 8 weeks.** Hand off only after a proven reply script.
3. Should the in-app prompt fire after the first search or after the first reply? Lean: **first search**, because that is when the user feels the email-finding pain. First reply is too late.
