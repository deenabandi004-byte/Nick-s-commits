# Offerloop Find Page - Human Feel Audit

Date: 2026-04-15

---

## People Tab

### Issues found

1. **"Find people" button looks disabled when it IS the primary CTA.** The button at rest is `background: #E8E4DE` (warm gray) with `color: #9C9590` - the exact same palette as disabled state. Only when the user types does it flip to `#2563EB` blue. A first-time visitor sees a dead-looking button and has no signal that anything will happen. This is the single biggest conversion killer on the page.

2. **The greeting card is dark in a light page.** The card uses a dark gradient (`#FDFAF6 → #F5F0E8`) but the Lora serif heading is `#1A1714` on a very light background - so the card reads as "dark" primarily because of the heavy font weight against the muted parchment tone. The real problem: it doesn't connect to anything else on the page visually. It sits like a banner ad.

3. **Stats bar reads as placeholder text.** "3,200+ USC alumni tracked · 13,700+ jobs indexed · Updated today" at 11px / `rgba(156,149,144,0.65)` is so faded it's almost invisible. The numbers are hardcoded (`TODO: wire up real Firestore counts`). Even if wired up, the phrasing is passive and data-labelly - it tells you what the database has, not what it means for you.

4. **Gmail warning banner is visually loud and tonally wrong.** Amber background (`#FFFBEB`) with `text-amber-800` creates a stark horizontal stripe that dominates the page. For a new user this is the most eye-catching element - a warning - before they've even searched once. The phrase "drafts won't be created" is threatening for a feature the user hasn't tried to use yet.

5. **Suggestion chips are flat and uniformly gray.** All three chips ("Software engineers at FAANG in SF", "USC alumni in investment banking", "Marketing managers at startups in LA") are 11.5px text in identical `#FAF9F6` pills with `#E8E4DE` border. There is zero visual hierarchy, no color variation, no emoji or icon. They read as database tags, not as invitations to explore.

6. **The search input is a tall empty rectangle.** The input area is roughly 80px tall (textarea height) but holds a single-line placeholder. The large blank space below the placeholder text makes it look broken, like a multiline field that's accidentally empty. The warm-beige background (`#F5F0E8`-ish) nearly disappears into the page background.

7. **"Template: Networking · Import contacts" reads as developer metadata.** These two links at 11px below the search input look like debug labels. "Template: Networking" is cryptic - what template? Why does the user care right now? This should either be hidden until relevant or rewritten to be meaningful.

8. **"Add resume for better personalization" is an afterthought.** It sits at 12px gray below the CTA, flush with the bottom of the content zone. It's actually a powerful feature (resume matching improves results quality) but its presentation makes it look like a footnote.

9. **Massive dead zone below the CTA.** Below "Add resume for better personalization", the page is empty warm cream all the way to the bottom of the viewport. This is roughly 30% of the visible screen. It makes the page feel like a single-purpose form, not a discovery hub.

10. **Sidebar credits show "0 / 300" and "User" for the mock.** This is a dev preview artifact, not a real issue - but it's worth noting that in production the sidebar does not reflect the greeting user state, which creates a disconnect (greeting says "Deena" but sidebar says "User").

### Recommended fixes

1. **Restyle the CTA button idle state.** When empty, use a warm-tinted outline style (e.g., `border: 1.5px solid #D5D0C9`, `background: transparent`, `color: #6B6560`) with the placeholder text "Find people" - still clearly a button, but soft. When the user types, transition to solid `#2563EB` blue (the active color it already uses). The key: idle must look interactive, not disabled.

2. **Make the greeting card feel earned, not decorative.** Either (a) add a subtle micro-stat ("You've saved 12 contacts this week") or (b) shrink it to a single line greeting without the card wrapper - just `18px Lora + date` left-aligned at the top of the content area. The card border and background gradient are adding visual noise without adding information.

3. **Rewrite stats bar as social proof or remove it.** Change to something with agency: "Deena, 47 USC students used Offerloop this week" or "12 new Goldman contacts added this month". If real counts aren't available, remove the bar entirely - fake-feeling stats erode trust faster than no stats.

4. **Demote the Gmail banner.** Move it out of the main content flow. Options: (a) collapse it into a small inline text link below the search input like "💡 Connect Gmail to auto-create drafts", (b) show it only after the first search returns results and the user tries to email, or (c) make it a one-time dismissible tooltip on the CTA button.

5. **Give suggestion chips personality.** Add a subtle left-border color per chip category (e.g., blue for role-based, cardinal for alumni-based, green for location-based). Increase font to 12.5px. Consider prefixing with a tiny relevant emoji or using slightly different background tints per chip. The goal: they should feel curated, not generated.

6. **Reduce input height or add inline guidance.** Either (a) make it a single-line `<input>` at ~48px height with an expand icon for multi-line, or (b) add faint helper text inside the textarea like "Describe who you're looking for - name, company, school, role, or location" at 11px below the placeholder, so the empty space has purpose.

7. **Hide "Template: Networking" until post-search.** It's a power-user feature. Show it in the results header or email generation step. Replace the current spot with something useful like a subtle "Tip: paste a LinkedIn URL to import a contact directly" hint.

8. **Elevate resume upload.** Move "Add resume for better personalization" above the CTA button or into the search input as a small attached badge. Rephrase to: "📎 Upload your resume - we'll match you to people who can help". Make it a clickable button, not passive text.

9. **Fill the dead zone.** Add one of: (a) a "Recent searches" list (even if empty, with ghost state "Your search history will appear here"), (b) a "Recommended for you" section with 2-3 pre-populated contact cards from the user's school/industry, or (c) a brief "How it works" three-step mini-guide for first-time users.

---

## Companies Tab

### Issues found

1. **The search input has a light blue tint that doesn't match the People tab.** People tab's search input is warm beige; Companies tab's is `#EFF6FF`-ish (blue tint). This inconsistency between sibling tabs on the same page is jarring - it signals that the tabs were built independently and not unified.

2. **"↑ Pick a suggestion or type below" is confusing and passive.** The arrow points up (toward the chips) but the text says "below" (referring to the input above it). It reads as an instruction label, not a call to action. Competitor products use an actionable verb here: "Search companies" or nothing at all.

3. **Even more dead space than People tab.** Below the "Pick a suggestion" button, the entire lower half of the viewport is empty. There's no content whatsoever - no preview cards, no recent searches, no suggested companies, nothing. The page looks like a prototype.

4. **Suggestion chips are all industry/location.** "Tech startups in SF", "Healthcare M&A banks", "Consulting in Chicago", "Fintech in London" - all four follow the same "[industry] in [location]" pattern. This uniformity feels algorithmically generated. A human would mix query types: "Companies hiring USC grads", "Where your contacts work", "Trending this week".

5. **Placeholder text says "Try: USC grads at McKinsey".** The "Try:" prefix is the universal AI-generated placeholder pattern. Real products show the example directly: "USC grads at McKinsey" - no prefix.

### Recommended fixes

1. **Unify search input styling across tabs.** Use the same background, border-radius, and height for the search input on all three tabs. Pick the warm beige if staying with the page palette, or a very light neutral gray (`#FAFAF9`). The input should be identical no matter which tab you're on.

2. **Replace the "Pick a suggestion" button with a proper CTA.** When no text is entered, show "Search companies" (with Building2 icon) in the same style as the People tab's "Find people" button - full width, 52px height, matching warm-idle + blue-active styling.

3. **Fill the dead space.** Add a "Trending companies" or "Popular with USC students" section below the search - 3-4 company cards with logo, name, industry, and a "# contacts available" count. Even static mock data is better than white space.

4. **Diversify chip content.** Mix formats: "Companies hiring now", "Where USC alumni work", "Goldman Sachs", "Series B startups in LA". Include at least one specific company name - it signals that this search is about real companies, not abstract queries.

5. **Drop the "Try:" prefix from placeholders.** Change to just the example text: "USC grads at McKinsey" or "Search by company name, industry, or location".

---

## Hiring Managers Tab

### Issues found

1. **Completely different layout from the other two tabs - feels like a different product.** People and Companies show search input + chips + button. Hiring Managers shows a centered marketing block with icon, heading, description, YouTube embed, and a "Start Free Trial" button. There's no search bar, no chips, no visual consistency.

2. **ProGate paywall is showing for an Elite user.** The `ProGate` wrapper is rendering its "Start Free Trial" gate even though the mock user (and likely real Elite users) should have full access. The dev preview user has `tier: 'elite'` - this gate should not appear. This is either a bug in ProGate not checking tier, or ProGate is checking via Firestore (which is bypassed in dev preview).

3. **YouTube video thumbnail as primary content.** The embedded YouTube thumbnail ("How To Use The Find Hiring Manager") is the visual centerpiece of the tab. This signals "we haven't built the feature yet, here's a tutorial." Actual product tabs should show the feature, not a video about the feature.

4. **"Start Free Trial" is wrong copy.** If the user is on any paid plan, this button text is incorrect. Even for free users, "Start Free Trial" implies a subscription commitment - it should be "Find hiring managers" or "Try it now".

5. **No search affordance at all.** The other two tabs are clearly search-driven. This tab hides the actual search form behind the ProGate. A user switching between tabs expects to see a search bar on each one.

### Recommended fixes

1. **Give Hiring Managers the same search layout as the other tabs.** Show search input + chips + CTA at the top. Chips like "Paste a job URL", "Goldman Sachs analyst", "Google PM in NYC". The form should ask for a job posting URL (the primary input) in the same visual style as the other tabs' search bars.

2. **Fix the ProGate bypass for Elite/Pro users.** Ensure `ProGate` checks the user's tier correctly and does not render the gate for Pro/Elite users. In dev preview, the mock user should pass through.

3. **Move the video to an optional "How it works" expandable section** below the search form, not as the hero content. Or link it as "Watch a 2-min walkthrough →" in small text below the search.

4. **Replace "Start Free Trial" with an action verb.** "Find hiring managers" or "Search" - matching the language of the other tabs.

---

## Mobile (390×844)

### Issues found

1. **"Hiring Managers" tab label is truncated to "Hiring Ma…"** at 390px width. The three-tab bar doesn't fit - the third label is cut off with no scroll indicator.

2. **Gmail banner text is truncated.** "Gmail not connected - drafts won't be create…" cuts off without wrapping. The "Connect Gmail" link and the X dismiss button may be unreachable.

3. **"Your Contacts (12…" in the top-right header is truncated.** The button doesn't fit on small screens.

4. **Greeting card padding is generous on mobile.** 16px vertical + 24px horizontal padding on the greeting card is appropriate for desktop but creates a lot of "card chrome" on a narrow screen. The card takes up ~15% of visible viewport before any functional UI appears.

5. **No horizontal scroll or collapse for suggestion chips.** The chips stack vertically, which is fine for 3 chips, but if the count grows (e.g., personalized chips based on profile) they'll push the search input below the fold.

### Recommended fixes

1. **Shorten the third tab label on mobile.** Use "Hiring" or "H. Managers" when viewport < 480px. Or use icon-only tabs on mobile with labels on hover/active.

2. **Wrap the Gmail banner text.** Allow the banner text to wrap to two lines on mobile. Ensure the dismiss X button is always visible.

3. **Hide or collapse the "Your Contacts" button on mobile.** Either hide it entirely (it's accessible from the sidebar) or show just the count badge: "12" with a people icon.

4. **Compact the greeting card on mobile.** Reduce padding to `12px 16px`. Consider removing the date line on mobile to save vertical space.

5. **Make suggestion chips horizontally scrollable on mobile.** Use `overflow-x: auto` with `flex-wrap: nowrap` on mobile. Show a fade-out on the right edge to signal more chips are available.

---

## Priority Order

| # | Fix | Why it makes it feel more human | Difficulty |
|---|-----|------|------|
| 1 | **Restyle "Find people" / "Search companies" CTA idle state** - currently looks disabled | The primary action button looking dead is the #1 reason a visitor would bounce. A warm outline idle state + blue active state makes the page feel responsive and intentional. | Easy |
| 2 | **Unify Hiring Managers tab layout with People/Companies** - show search bar + chips, not a marketing paywall | Three tabs that look like three different products destroy trust. Consistency = someone designed this. Inconsistency = this was assembled by code generation. | Hard |
| 3 | **Fill dead zones below CTAs on People + Companies tabs** - add recent searches, recommended cards, or "how it works" | 30-40% empty viewport on every tab makes the product feel like a wireframe. A single section of content below the search transforms it from "form page" to "discovery hub". | Medium |
| 4 | **Fix ProGate showing for Elite/Pro users on Hiring Managers tab** - gate should not render for paid tiers | A paying user hitting a paywall for a feature they've paid for is a support ticket. Even in dev preview, this should work correctly. | Easy |
| 5 | **Demote or redesign the Gmail banner** - move out of primary content flow | The first thing a new user's eye hits is a warning banner for a feature they haven't tried. Negative-first framing makes the product feel needy. | Easy |
| 6 | **Remove "Try:" prefix from all placeholder text** | This is a minor copy fix but it's a hallmark of AI-generated UI. Removing it instantly makes the page feel like it was written by a person. | Easy |
| 7 | **Replace "↑ Pick a suggestion or type below" with "Search companies"** - match the CTA pattern of People tab | Instructional copy in a button slot signals a placeholder that never got replaced. An action verb makes it feel finished. | Easy |
| 8 | **Unify search input styling across all tabs** - same background tint, same height, same border | Visual inconsistency between sibling tabs on the same page signals different developers built them independently. Consistency = one designer owns this. | Easy |
| 9 | **Give suggestion chips more variety and personality** - mix query types, add subtle category color, drop uniform pattern | Identically-structured chips ("X in Y") feel algorithmic. Varied shapes ("Goldman Sachs", "Who's hiring now", "USC alumni at Deloitte") feel hand-picked. | Medium |
| 10 | **Fix mobile tab truncation** - shorten "Hiring Managers" label on small screens | Truncated text signals "we didn't test this on a phone." A responsive label shows attention to detail. | Easy |
| 11 | **Reduce greeting card weight or add utility to it** - shrink, or add a micro-stat | The greeting card consumes prime real estate for zero information density. Either make it useful or make it smaller. | Easy |
| 12 | **Hide "Template: Networking" label until post-search context** | Cryptic labels confuse new users. Power features should surface in context, not on the empty state. | Easy |
| 13 | **Elevate resume upload - make it a visible button, not footnote text** | Resume matching is a real differentiator. Burying it in 12px gray text under the CTA makes it invisible. | Easy |
| 14 | **Rewrite stats bar with social proof or remove it** | "3,200+ USC alumni tracked" at barely-visible opacity reads as a developer placeholder. Either make it real and compelling, or delete it. | Easy |
| 15 | **Fix mobile Gmail banner wrapping and header button truncation** | Truncated text on mobile is the most common "AI built this" tell. Proper wrapping shows a real designer touched it. | Easy |
