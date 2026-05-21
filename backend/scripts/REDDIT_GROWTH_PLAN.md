# Reddit Growth Engine - Offerloop

## What We're Building

A real-time Reddit scanner that finds threads where people are asking questions Offerloop already solves. Instead of running ads, we show up in organic conversations with genuinely helpful answers - then let the product sell itself.

## The Problem

Our target users (college students, new grads, career switchers in finance/consulting/tech) are actively asking for help on Reddit every day:
- "How do I cold email someone at Goldman?"
- "My resume isn't getting past ATS"
- "How do I prepare for a meeting?"
- "Breaking into investment banking without connections"

These are high-intent, ready-to-convert users. Right now we're not in those conversations.

## The System

### Phase 1: Listen (Built ✅)
**`reddit_scanner.py`** scans 10 subreddits every 30 minutes:

| Subreddit | Why |
|---|---|
| r/cscareerquestions | Largest tech career community (1M+) |
| r/internships | Direct internship seekers |
| r/FinancialCareers | Finance recruiting - our core demographic |
| r/resumes | Resume help seekers |
| r/college | Students planning career moves |
| r/careerguidance | Career pivoters |
| r/jobs | General job seekers |
| r/consulting | MBB/Big4 recruiting |
| r/MBA | MBA networking and recruiting |
| r/wallstreetjobs | Finance job seekers |

**How it finds threads:**
- 8 keyword groups mapped to Offerloop features (networking, meeting, resume, job search, internships, finance recruiting, cover letters, hiring manager)
- Filters: 3+ upvotes, 2+ comments, under 48 hours old
- Scores by: engagement × recency × keyword relevance
- Deduplicates across scans so we never see the same thread twice
- Sends top 10 to Telegram with real links + priority ranking

### Phase 2: Engage (Manual - Now)
When a thread comes in on Telegram, we:
1. Read the thread to understand what they're actually asking
2. Write a genuinely helpful reply that answers their question
3. **No product mentions** - pure value. Build karma and credibility first
4. If someone asks "how do you do this?" in replies, then mention Offerloop naturally

**Example reply style:**
> Thread: "How do I find emails for cold outreach?"
>
> Reply: "I've had the best luck combining LinkedIn + company email patterns. Most companies use firstname.lastname@company.com or first.last@company.com. Check if the company uses Google Workspace (search 'company.com site:google.com/a') - if they do, you can sometimes verify emails. For finance/consulting firms specifically, many use firstname.lastname format. Also try reaching out to alumni from your school who work there - the shared connection gets a much higher response rate than pure cold outreach."

This is a real, helpful answer. If someone then asks "is there a tool for this?" - that's the opening.

### Phase 3: Semi-Automate (Future)
- Add OpenAI to draft reply suggestions based on thread context
- One-click approve/edit/send workflow from Telegram
- Track which threads we replied to and engagement metrics
- A/B test reply styles to optimize for karma and responses

### Phase 4: Scale (Future)
- Expand to more subreddits based on performance data
- Add Twitter/X monitoring for similar signals
- Build a "community presence" dashboard showing karma growth, thread engagement, and conversion signals
- Eventually create original posts (guides, data analysis) that establish Offerloop as a thought leader

## Why Reddit, Not Ads

| | Reddit Organic | Paid Ads |
|---|---|---|
| **Cost** | $0 | $3-8 per click |
| **Trust** | High (peer recommendation) | Low (obvious ad) |
| **Targeting** | Perfect (they're literally asking) | Approximate (interest-based) |
| **Longevity** | Thread lives forever in search | Gone when budget runs out |
| **SEO** | Reddit threads rank on Google | No SEO benefit |
| **Conversion intent** | Actively seeking solution | Passively browsing |

## Target Metrics

| Metric | Month 1 | Month 3 | Month 6 |
|---|---|---|---|
| Threads engaged/week | 10-15 | 25-30 | 40-50 |
| Avg karma per reply | 5-10 | 15-25 | 25+ |
| Account karma | 200+ | 1000+ | 3000+ |
| Referral signups (est.) | 5-10 | 30-50 | 100+ |

## Feature ↔ Subreddit Map

Each Offerloop feature maps to specific Reddit pain points:

| Feature | Pain Point | Where They Ask |
|---|---|---|
| Contact Search + Email | "How to find emails / cold email" | cscareerquestions, FinancialCareers |
| Meeting Prep | "What to ask in informational interviews" | college, internships |
| Resume Workshop | "Why am I not getting callbacks" | resumes, cscareerquestions |
| Job Board | "Where to find entry-level jobs" | jobs, internships |
| Cover Letter Generator | "Do I need a cover letter / how to write one" | resumes, jobs |
| Hiring Manager Finder | "Who to reach out to at a company" | cscareerquestions, consulting |
| Recruiter Email | "How to find/contact recruiters" | FinancialCareers, internships |
| Network Tracker | "How to keep track of networking contacts" | careerguidance, MBA |

## Rules of Engagement

1. **Never spam.** One reply per thread, only when we have genuine value to add.
2. **Never lead with the product.** Answer the question first. Mention Offerloop only if asked.
3. **Be a real person.** Use the account as a helpful community member, not a marketing channel.
4. **Follow subreddit rules.** Many subs ban self-promotion. We're not promoting - we're helping.
5. **Quality over quantity.** One great reply that gets 50 upvotes > 10 mediocre replies.
