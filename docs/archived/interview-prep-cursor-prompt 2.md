# Interview Prep Feature - Cursor Prompt

## Pre-requisites (Do Outside Cursor First)

### 1. Dependencies Already Installed ✅
You already have `aiohttp` and `beautifulsoup4` installed.

### 2. No Reddit API Key Needed! 
We're using Reddit's public JSON endpoints (no authentication required).

### 3. Create File Structure:
Run this command in your terminal:
```bash
mkdir -p backend/app/services/interview_prep
touch backend/app/services/interview_prep/__init__.py
touch backend/app/services/interview_prep/job_posting_parser.py
touch backend/app/services/interview_prep/reddit_scraper.py
touch backend/app/services/interview_prep/content_processor.py
touch backend/app/services/interview_prep/pdf_generator.py
```

This creates:
```
backend/app/services/interview_prep/
  ├── __init__.py
  ├── job_posting_parser.py    # NEW: Extracts info from job postings
  ├── reddit_scraper.py
  ├── content_processor.py
  └── pdf_generator.py
```

---

## Cursor Prompt

Paste everything below this line into Cursor:

---

**Build an Interview Prep feature for Offerloop.ai that takes a job posting URL, extracts role details, scrapes Reddit for targeted interview insights, and generates a comprehensive study PDF tailored to that specific role.**

## Context
- This is for Offerloop.ai, a Flask + React networking/career platform
- I already have OpenAI integrated (check existing email generation code for patterns)
- I already have PDF generation logic (check existing meeting prep feature in `services/` for reference)
- Using Flask backend on Render, React frontend with TypeScript
- Authentication uses Firebase (check existing protected routes for patterns)
- Credit system already exists (check how meeting deducts credits)

---

## Backend Requirements

### 0. Job Posting Parser (`backend/app/services/interview_prep/job_posting_parser.py`)

```python
# This module extracts structured data from job posting URLs
# Use BeautifulSoup to scrape the job posting page, then OpenAI to extract structured info

import aiohttp
from bs4 import BeautifulSoup

async def fetch_job_posting(url: str) -> str:
    """Fetch the raw HTML/text content from a job posting URL"""
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }
    async with aiohttp.ClientSession(headers=headers) as session:
        async with session.get(url) as resp:
            if resp.status == 200:
                html = await resp.text()
                soup = BeautifulSoup(html, 'html.parser')
                # Remove script and style elements
                for element in soup(['script', 'style', 'nav', 'footer', 'header']):
                    element.decompose()
                return soup.get_text(separator='\n', strip=True)
            raise Exception(f"Failed to fetch job posting: {resp.status}")

# ============================================================================
# ROLE CATEGORY DETECTION - CRITICAL FOR CORRECT CONTENT
# ============================================================================
# The role_category determines EVERYTHING about the prep content:
# - What type of interview questions to include
# - What resources to recommend
# - What frameworks/skills to focus on

ROLE_CATEGORY_KEYWORDS = {
    "Consulting": [
        "consultant", "consulting", "advisory", "strategy", "management consulting",
        "case interview", "McKinsey", "BCG", "Bain", "Deloitte Consulting", 
        "Accenture Strategy", "client-facing", "engagement manager"
    ],
    "Software Engineering": [
        "software engineer", "software developer", "SWE", "backend", "frontend",
        "full stack", "fullstack", "developer", "programmer", "coding",
        "algorithms", "data structures", "system design", "DevOps", "SRE",
        "mobile developer", "iOS", "Android", "web developer"
    ],
    "Product Management": [
        "product manager", "PM", "product owner", "product lead",
        "product strategy", "product development", "roadmap", "PRD",
        "user research", "product sense"
    ],
    "Data Science": [
        "data scientist", "data science", "machine learning", "ML engineer",
        "data analyst", "analytics", "statistician", "AI engineer",
        "research scientist", "deep learning", "NLP"
    ],
    "Finance": [
        "investment banking", "IB analyst", "private equity", "PE",
        "hedge fund", "asset management", "equity research", "trader",
        "financial analyst", "M&A", "DCF", "valuation", "capital markets",
        "wealth management", "banking analyst"
    ],
    "Marketing": [
        "marketing", "brand manager", "growth", "digital marketing",
        "content marketing", "SEO", "SEM", "social media", "campaign",
        "marketing manager", "CMO"
    ],
    "Design": [
        "UX designer", "UI designer", "product designer", "design",
        "user experience", "user interface", "visual designer",
        "interaction designer", "design systems"
    ],
    "Operations": [
        "operations", "supply chain", "logistics", "program manager",
        "project manager", "business operations", "chief of staff"
    ]
}

def detect_role_category(job_title: str, job_text: str) -> str:
    """
    Detect the role category based on job title and description.
    This is CRITICAL - wrong category = completely wrong prep content!
    """
    combined_text = f"{job_title} {job_text}".lower()
    
    # Score each category based on keyword matches
    scores = {}
    for category, keywords in ROLE_CATEGORY_KEYWORDS.items():
        score = sum(1 for keyword in keywords if keyword.lower() in combined_text)
        scores[category] = score
    
    # Return the category with highest score, or "Other" if no matches
    best_category = max(scores, key=scores.get)
    if scores[best_category] > 0:
        return best_category
    return "Other"

def extract_job_details(job_text: str) -> dict:
    """Use OpenAI to extract structured info from job posting text"""
    # Use GPT-4o-mini to extract all relevant details
    
    prompt = """Extract the following information from this job posting. 
    Return as JSON. If a field is not found, set it to null.
    
    IMPORTANT for role_category: Choose based on these rules:
    - "Consulting" if: Management consulting, strategy consulting, case interviews mentioned (McKinsey, BCG, Bain, Deloitte Consulting, etc.)
    - "Software Engineering" if: Software development, coding, algorithms, system design
    - "Product Management" if: Product manager, PM, product owner, roadmap
    - "Data Science" if: Data scientist, ML engineer, analytics, statistics
    - "Finance" if: Investment banking, PE, hedge fund, trading, financial analyst
    - "Marketing" if: Marketing, brand, growth, digital marketing
    - "Design" if: UX/UI, product design, visual design
    - "Operations" if: Operations, supply chain, program management
    
    {
        "company_name": "string",
        "company_domain": "string (e.g., google.com)",
        "job_title": "string",
        "level": "Intern | Entry-Level | Mid-Level | Senior | Staff | Principal | Manager | Director | VP | null",
        "team_division": "string or null (e.g., 'Google Cloud', 'AWS', 'Investment Banking Division')",
        "location": "string",
        "remote_policy": "Remote | Hybrid | On-site | null",
        "required_skills": ["skill1", "skill2", ...],
        "preferred_skills": ["skill1", "skill2", ...],
        "years_experience": "string or null (e.g., '3-5 years')",
        "job_type": "Full-time | Part-time | Contract | Internship",
        "key_responsibilities": ["responsibility1", "responsibility2", ...],
        "interview_hints": "string or null (any mentions of interview process in the posting)",
        "salary_range": "string or null (if mentioned)",
        "role_category": "Consulting | Software Engineering | Product Management | Data Science | Finance | Marketing | Design | Operations | Other"
    }
    
    Job Posting:
    """
    
    # Call OpenAI API (follow existing patterns in codebase)
    # IMPORTANT: After getting OpenAI response, validate/override role_category
    # using the detect_role_category function as a sanity check

# Supported job posting sites (handle each appropriately):
# - LinkedIn (linkedin.com/jobs)
# - Indeed (indeed.com)
# - Greenhouse (boards.greenhouse.io)
# - Lever (jobs.lever.co)
# - Workday (myworkdayjobs.com)
# - Company career pages
# - Handshake (for students)
# - Google Jobs
# - Glassdoor

# COMPANY-SPECIFIC ROLE CATEGORY HINTS:
# Some companies are known for specific interview styles:
COMPANY_CATEGORY_HINTS = {
    # Consulting firms - ALWAYS use consulting interview style
    "mckinsey": "Consulting",
    "bcg": "Consulting", 
    "bain": "Consulting",
    "deloitte consulting": "Consulting",
    "accenture strategy": "Consulting",
    "kearney": "Consulting",
    "oliver wyman": "Consulting",
    "roland berger": "Consulting",
    "strategy&": "Consulting",
    "lek consulting": "Consulting",
    
    # Banks - Use finance interview style
    "goldman sachs": "Finance",
    "morgan stanley": "Finance",
    "jp morgan": "Finance",
    "jpmorgan": "Finance",
    "bank of america": "Finance",
    "citi": "Finance",
    "barclays": "Finance",
    "credit suisse": "Finance",
    "ubs": "Finance",
    "deutsche bank": "Finance",
    "blackstone": "Finance",
    "kkr": "Finance",
    "carlyle": "Finance",
}

# Output structure:
JobDetails = {
    "company_name": str,
    "company_domain": str,
    "job_title": str,
    "level": str | None,
    "team_division": str | None,
    "location": str,
    "remote_policy": str | None,
    "required_skills": list[str],
    "preferred_skills": list[str],
    "years_experience": str | None,
    "job_type": str,
    "key_responsibilities": list[str],
    "interview_hints": str | None,
    "salary_range": str | None,
    "role_category": str  # CRITICAL - determines entire prep content!
}
```

## Backend Requirements

### 1. Reddit Scraper (`backend/app/services/interview_prep/reddit_scraper.py`)

```python
# USE REDDIT'S PUBLIC JSON ENDPOINTS - NO API KEY NEEDED!
# Simply append .json to any Reddit URL
# 
# This scraper uses the extracted job details to create TARGETED searches
# Much more relevant results than generic company-wide searches
#
# IMPORTANT: Must include a descriptive User-Agent header or Reddit blocks requests

import aiohttp
import asyncio
from urllib.parse import quote_plus
from typing import Optional

# Target subreddits - select based on role_category from job posting
SUBREDDIT_MAP = {
    "Software Engineering": ['cscareerquestions', 'leetcode', 'experienceddevs', 'programming', 'webdev'],
    "Product Management": ['ProductManagement', 'cscareerquestions', 'jobs'],
    "Data Science": ['datascience', 'MachineLearning', 'cscareerquestions', 'analytics'],
    "Consulting": ['consulting', 'MBA', 'jobs', 'FinancialCareers'],
    "Finance": ['FinancialCareers', 'MBA', 'jobs', 'investing'],
    "Marketing": ['marketing', 'jobs', 'advertising'],
    "Design": ['UXDesign', 'userexperience', 'jobs', 'graphic_design'],
    "Operations": ['jobs', 'supplychain', 'operations'],
    "Other": ['jobs', 'interviews', 'careeradvice']
}

def build_search_queries(job_details: dict) -> list[str]:
    """Build targeted search queries based on job posting details"""
    queries = []
    company = job_details.get("company_name", "")
    role = job_details.get("job_title", "")
    level = job_details.get("level", "")
    team = job_details.get("team_division", "")
    skills = job_details.get("required_skills", [])[:5]  # Top 5 skills
    
    # Company + Role specific (MOST VALUABLE)
    queries.append(f"{company} {role} interview")
    queries.append(f"{company} {role} interview experience")
    queries.append(f"{company} {role} interview questions")
    
    # Team/Division specific (if available)
    if team:
        queries.append(f"{company} {team} interview")
        queries.append(f"{company} {team} culture")
    
    # Level specific
    if level:
        queries.append(f"{company} {level} interview")
        queries.append(f"{level} {role} interview tips")
    
    # Skill-based queries (for technical roles)
    for skill in skills[:3]:
        queries.append(f"{skill} interview questions")
    
    # General company queries
    queries.append(f"{company} interview process")
    queries.append(f"{company} hiring timeline")
    queries.append(f"{company} offer negotiation")
    queries.append(f"{company} salary {role}")
    queries.append(f"{company} work life balance")
    queries.append(f"{company} culture")
    queries.append(f"{company} interview rejected")
    
    return queries

async def search_reddit(job_details: dict) -> list:
    """
    Search Reddit using targeted queries based on job posting details
    
    Args:
        job_details: Parsed job posting with company_name, job_title, level, etc.
    
    Returns:
        List of relevant Reddit posts with comments
    """
    headers = {
        "User-Agent": "Offerloop/1.0 (interview prep tool for students; contact@offerloop.ai)"
    }
    
    all_posts = []
    seen_ids = set()  # For deduplication
    
    # Select subreddits based on role category
    role_category = job_details.get("role_category", "Other")
    subreddits = SUBREDDIT_MAP.get(role_category, SUBREDDIT_MAP["Other"])
    subreddits = subreddits + ['interviews', 'jobs']  # Always include these
    subreddits = list(dict.fromkeys(subreddits))  # Remove duplicates, preserve order
    
    # Build targeted queries
    queries = build_search_queries(job_details)
    
    async with aiohttp.ClientSession(headers=headers) as session:
        for subreddit in subreddits[:6]:  # Limit subreddits
            for query in queries[:15]:  # Limit queries
                url = f"https://www.reddit.com/r/{subreddit}/search.json?q={quote_plus(query)}&sort=top&t=year&limit=25"
                try:
                    async with session.get(url) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            posts = data.get("data", {}).get("children", [])
                            for post in posts:
                                post_id = post.get("data", {}).get("id")
                                if post_id and post_id not in seen_ids:
                                    seen_ids.add(post_id)
                                    all_posts.append(post)
                        elif resp.status == 429:
                            # Rate limited - wait longer
                            await asyncio.sleep(2)
                        await asyncio.sleep(0.6)  # Rate limit: stay safe
                except Exception as e:
                    print(f"Error fetching {url}: {e}")
                    continue
    
    # Sort by upvotes and relevance
    all_posts.sort(key=lambda x: x.get("data", {}).get("ups", 0), reverse=True)
    top_posts = all_posts[:50]
    
    # Fetch comments for top 25 posts (comments have the best insights)
    posts_with_comments = []
    for post in top_posts[:25]:
        post_data = post.get("data", {})
        permalink = post_data.get("permalink", "")
        if permalink:
            comments_url = f"https://www.reddit.com{permalink}.json?limit=15&sort=top"
            try:
                async with session.get(comments_url) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        if len(data) > 1:
                            comments = data[1].get("data", {}).get("children", [])
                            post_data["top_comments"] = [
                                c.get("data", {}).get("body", "") 
                                for c in comments[:15] 
                                if c.get("kind") == "t1"
                            ]
                await asyncio.sleep(0.6)
            except Exception as e:
                print(f"Error fetching comments: {e}")
        posts_with_comments.append(post_data)
    
    return posts_with_comments

# Key improvements over generic company search:
# 1. Role-specific subreddits (PM questions vs SWE questions are very different)
# 2. Level-specific queries (intern vs senior interviews differ greatly)
# 3. Team/division targeting (Google Cloud vs Google Ads have different cultures)
# 4. Skill-based queries (Python interview questions if Python is required)
# 5. Better relevance from targeted queries
```
    headers = {
        "User-Agent": "Offerloop/1.0 (interview prep tool for students; contact@offerloop.ai)"
    }
    
    all_posts = []
    seen_ids = set()  # For deduplication
    
    async with aiohttp.ClientSession(headers=headers) as session:
        for subreddit in SUBREDDITS:
            for query_template in QUERY_TEMPLATES:
                query = query_template.format(company_name=company_name)
                url = f"https://www.reddit.com/r/{subreddit}/search.json?q={quote_plus(query)}&sort=top&t=year&limit=25"
                try:
                    async with session.get(url) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            posts = data.get("data", {}).get("children", [])
                            for post in posts:
                                post_id = post.get("data", {}).get("id")
                                if post_id and post_id not in seen_ids:
                                    seen_ids.add(post_id)
                                    all_posts.append(post)
                        await asyncio.sleep(0.6)  # Rate limit: stay safe at ~10 req/min
                except Exception as e:
                    print(f"Error fetching {url}: {e}")
                    continue
    
    # Sort by upvotes and take top 50 most relevant posts
    all_posts.sort(key=lambda x: x.get("data", {}).get("ups", 0), reverse=True)
    top_posts = all_posts[:50]
    
    # Fetch comments for top 20 posts (most valuable content is in comments)
    posts_with_comments = []
    for post in top_posts[:20]:
        post_data = post.get("data", {})
        permalink = post_data.get("permalink", "")
        if permalink:
            comments_url = f"https://www.reddit.com{permalink}.json?limit=10&sort=top"
            try:
                async with session.get(comments_url) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        # Reddit returns [post, comments] array
                        if len(data) > 1:
                            comments = data[1].get("data", {}).get("children", [])
                            post_data["top_comments"] = [
                                c.get("data", {}).get("body", "") 
                                for c in comments[:10] 
                                if c.get("kind") == "t1"
                            ]
                await asyncio.sleep(0.6)
            except Exception as e:
                print(f"Error fetching comments: {e}")
        posts_with_comments.append(post_data)
    
    return posts_with_comments

# Requirements:
# - Search across multiple subreddits for comprehensive coverage
# - Use all query templates to find different types of content
# - Filter posts from last 12 months only (use 't=year' param)
# - Grab top 50 most upvoted posts, fetch comments for top 20
# - For each post, get top 10 comments (most insights are in comments!)
# - Add 600ms delay between requests to respect rate limits
# - Timeout after 45 seconds total scraping time
# - Deduplicate posts by ID
# - Return structured data with: post_title, post_body, top_comments[], upvotes, date, subreddit, url
```

### 2. Content Processor (`backend/app/services/interview_prep/content_processor.py`)

```python
# Use OpenAI GPT-4o-mini to keep costs low (check existing OpenAI usage patterns in codebase)
# Take the scraped Reddit data AND the job_details to extract HIGHLY SPECIFIC insights
# The output should be detailed enough to generate a 7-8 page personalized PDF

# ============================================================================
# CRITICAL: ROLE CATEGORY DETECTION AND ADAPTATION
# ============================================================================
# The content MUST be completely different based on role_category from job_details.
# A consulting interview is NOTHING like a software engineering interview!

ROLE_CATEGORY_CONFIG = {
    "Consulting": {
        "interview_types": ["Case Interview", "Behavioral/Fit Interview", "Group Exercise", "Partner Interview"],
        "question_categories": ["Case Questions", "Behavioral Questions", "Fit Questions", "Market Sizing"],
        "prep_resources": [
            {"name": "Case in Point (book)", "url": "https://www.amazon.com/Case-Point-Complete-Interview-Preparation/dp/0986370711", "note": "The consulting interview bible"},
            {"name": "PrepLounge", "url": "https://www.preplounge.com/", "note": "Case practice with partners"},
            {"name": "CaseCoach", "url": "https://www.casecoach.com/", "note": "AI-powered case practice"},
            {"name": "Management Consulted", "url": "https://managementconsulted.com/", "note": "Frameworks and tips"},
            {"name": "Victor Cheng - LOMS", "url": "https://www.caseinterview.com/", "note": "Look Over My Shoulder program"}
        ],
        "no_leetcode": True,  # DO NOT include LeetCode for consulting
        "case_frameworks": ["Profitability", "Market Entry", "M&A", "Growth Strategy", "Pricing", "Operations"],
        "skills_tested": ["Structured thinking", "Mental math", "Business intuition", "Communication", "Synthesis"],
        "typical_questions": [
            "Your client is a retailer seeing declining profits. How would you diagnose the issue?",
            "How many gas stations are there in the United States?",
            "Should Company X acquire Company Y?",
            "A PE firm is considering investing in a hospital chain. What factors should they consider?",
            "How would you help a bank increase customer retention?"
        ]
    },
    
    "Software Engineering": {
        "interview_types": ["Coding Interview", "System Design", "Behavioral", "Technical Deep Dive"],
        "question_categories": ["Coding/Algorithms", "System Design", "Behavioral", "Language-Specific"],
        "prep_resources": [
            {"name": "LeetCode", "url": "https://leetcode.com/", "note": "Practice coding problems"},
            {"name": "NeetCode", "url": "https://neetcode.io/", "note": "Curated problem lists with explanations"},
            {"name": "System Design Primer", "url": "https://github.com/donnemartin/system-design-primer", "note": "Free system design guide"},
            {"name": "Designing Data-Intensive Applications", "url": "https://www.amazon.com/Designing-Data-Intensive-Applications-Reliable-Maintainable/dp/1449373321", "note": "Deep dive into distributed systems"},
            {"name": "Blind 75", "url": "https://neetcode.io/practice", "note": "Must-do 75 problems"}
        ],
        "skills_tested": ["Data Structures", "Algorithms", "System Design", "Coding", "Problem Solving"],
        "typical_questions": [
            "Implement an LRU cache",
            "Design a URL shortener",
            "Find the longest substring without repeating characters",
            "Design Twitter's news feed",
            "Merge k sorted lists"
        ]
    },
    
    "Product Management": {
        "interview_types": ["Product Sense", "Analytical/Estimation", "Behavioral/Leadership", "Technical"],
        "question_categories": ["Product Design", "Estimation", "Strategy", "Behavioral", "Technical"],
        "prep_resources": [
            {"name": "Cracking the PM Interview", "url": "https://www.amazon.com/Cracking-PM-Interview-Product-Technology/dp/0984782818", "note": "Comprehensive PM prep"},
            {"name": "Exponent", "url": "https://www.tryexponent.com/", "note": "PM interview practice"},
            {"name": "Product Alliance", "url": "https://www.productalliance.com/", "note": "Company-specific PM prep"},
            {"name": "Lewis Lin's books", "url": "https://www.amazon.com/Lewis-C.-Lin/e/B00B7RNKP4", "note": "PM interview frameworks"}
        ],
        "no_leetcode": True,  # PMs don't do LeetCode (usually)
        "frameworks": ["CIRCLES", "RICE", "AARRR", "Root Cause Analysis"],
        "skills_tested": ["Product intuition", "Prioritization", "User empathy", "Metrics thinking", "Communication"],
        "typical_questions": [
            "How would you improve Google Maps?",
            "Design a product for elderly users to stay connected with family",
            "How many piano tuners are there in Chicago?",
            "What metrics would you use to measure success for Instagram Stories?",
            "Tell me about a product you love and how you'd improve it"
        ]
    },
    
    "Finance / Investment Banking": {
        "interview_types": ["Technical Interview", "Behavioral", "Case Study", "Superday"],
        "question_categories": ["Accounting", "Valuation", "M&A", "LBO", "Behavioral"],
        "prep_resources": [
            {"name": "Wall Street Oasis", "url": "https://www.wallstreetoasis.com/", "note": "Forums and guides"},
            {"name": "Breaking Into Wall Street", "url": "https://breakingintowallstreet.com/", "note": "Technical prep courses"},
            {"name": "Rosenbaum Investment Banking", "url": "https://www.amazon.com/Investment-Banking-Valuation-Leveraged-Acquisitions/dp/1118656210", "note": "The IB textbook"},
            {"name": "400 Investment Banking Questions", "url": "https://www.wallstreetoasis.com/resources/interviews/investment-banking-interview-questions-answers", "note": "Common IB questions"},
            {"name": "Vault Guide to Finance Interviews", "url": "https://www.vault.com/", "note": "Industry-standard prep"}
        ],
        "no_leetcode": True,
        "technical_topics": ["DCF", "Comparable Companies", "Precedent Transactions", "LBO", "Accretion/Dilution"],
        "skills_tested": ["Accounting", "Valuation", "Financial Modeling", "Excel", "Attention to Detail"],
        "typical_questions": [
            "Walk me through a DCF",
            "What happens to each financial statement when depreciation increases by $10?",
            "Walk me through an LBO",
            "How do you value a company?",
            "Why investment banking?"
        ]
    },
    
    "Data Science / Analytics": {
        "interview_types": ["Technical Screen", "SQL/Coding", "Case Study", "Behavioral", "Presentation"],
        "question_categories": ["SQL", "Statistics", "Machine Learning", "Product Analytics", "Behavioral"],
        "prep_resources": [
            {"name": "LeetCode Database", "url": "https://leetcode.com/problemset/database/", "note": "SQL practice"},
            {"name": "StrataScratch", "url": "https://www.stratascratch.com/", "note": "Real interview SQL questions"},
            {"name": "Ace the Data Science Interview", "url": "https://www.acethedatascienceinterview.com/", "note": "Comprehensive DS prep"},
            {"name": "DataLemur", "url": "https://datalemur.com/", "note": "SQL interview questions"}
        ],
        "skills_tested": ["SQL", "Python/R", "Statistics", "A/B Testing", "Machine Learning", "Communication"],
        "typical_questions": [
            "Write a SQL query to find the second highest salary",
            "How would you design an A/B test for a new feature?",
            "Explain the difference between L1 and L2 regularization",
            "How would you measure the success of a new product feature?",
            "Walk me through a project where you used data to drive a decision"
        ]
    },
    
    "Marketing": {
        "interview_types": ["Behavioral", "Case Study", "Portfolio Review", "Presentation"],
        "question_categories": ["Campaign Strategy", "Analytics", "Brand", "Digital Marketing", "Behavioral"],
        "prep_resources": [
            {"name": "Google Analytics Academy", "url": "https://analytics.google.com/analytics/academy/", "note": "Free certifications"},
            {"name": "HubSpot Academy", "url": "https://academy.hubspot.com/", "note": "Marketing certifications"},
            {"name": "MarketingProfs", "url": "https://www.marketingprofs.com/", "note": "Industry resources"}
        ],
        "no_leetcode": True,
        "skills_tested": ["Creativity", "Analytics", "Communication", "Strategy", "Digital tools"],
        "typical_questions": [
            "Walk me through a successful campaign you've run",
            "How would you market our product to a new demographic?",
            "What metrics would you use to measure brand awareness?",
            "How do you stay current with marketing trends?",
            "Critique one of our recent campaigns"
        ]
    }
}

# ============================================================================
# CONTENT PROCESSOR MAIN FUNCTION
# ============================================================================

def process_interview_content(reddit_posts: list, job_details: dict) -> dict:
    """
    Process Reddit posts with context from the job posting to generate
    highly relevant, personalized interview prep content.
    
    CRITICAL: Use role_category to completely change the content structure!
    """
    
    company_name = job_details.get("company_name")
    job_title = job_details.get("job_title")
    level = job_details.get("level")  # Intern, Entry, Senior, etc.
    required_skills = job_details.get("required_skills", [])
    team_division = job_details.get("team_division")
    role_category = job_details.get("role_category", "Other")  # CRITICAL!
    
    # Get role-specific configuration
    role_config = ROLE_CATEGORY_CONFIG.get(role_category, {})
    
    # IMPORTANT: Pass role_config to OpenAI prompt so it knows what type of content to generate
    # For example:
    # - If role_category == "Consulting": Focus on case interviews, NO LeetCode
    # - If role_category == "Software Engineering": Focus on coding, system design
    # - If role_category == "Finance": Focus on technicals, DCF, valuation

# Output JSON structure - ADAPTS BASED ON ROLE CATEGORY:

# ============================================================================
# FOR CONSULTING ROLES (Deloitte, McKinsey, BCG, Bain, etc.)
# ============================================================================
CONSULTING_OUTPUT = {
    "company_name": str,
    "job_title": str,
    "level": str,
    "role_category": "Consulting",
    
    "interview_process": {
        "stages": [
            {
                "name": "Application & Resume Screen",
                "description": "Online application reviewed by recruiting team",
                "tips": "Highlight leadership, impact, and quantifiable achievements"
            },
            {
                "name": "First Round (Case + Fit)",
                "description": "Usually 2 back-to-back interviews with consultants/managers",
                "duration": "45-60 min each",
                "format": "Video or in-person",
                "case_type": "Interviewer-led or candidate-led depending on firm",
                "tips": "Practice case frameworks, prepare 3-5 strong behavioral stories"
            },
            {
                "name": "Final Round (Partner Interviews)",
                "description": "2-3 interviews with Partners or Principals",
                "duration": "45-60 min each",
                "format": "Usually in-person at office",
                "tips": "More emphasis on fit and senior presence; cases may be more ambiguous"
            }
        ]
    },
    
    "case_interview_prep": {  # CONSULTING-SPECIFIC SECTION
        "frameworks": [
            {
                "name": "Profitability Framework",
                "when_to_use": "Client profits are declining",
                "structure": "Revenue (Price x Volume) - Costs (Fixed + Variable)",
                "example_question": "Our client, a retailer, has seen profits decline 20% YoY. Diagnose."
            },
            {
                "name": "Market Entry Framework",
                "when_to_use": "Client considering entering new market/geography/segment",
                "structure": "Market attractiveness, Competitive landscape, Client capabilities, Entry strategy",
                "example_question": "Should Starbucks enter the Indian market?"
            },
            {
                "name": "M&A Framework",
                "when_to_use": "Evaluating acquisition or merger",
                "structure": "Strategic rationale, Target evaluation, Synergies, Integration risks, Valuation",
                "example_question": "Should Disney acquire a gaming company?"
            },
            {
                "name": "Pricing Framework",
                "when_to_use": "Setting or changing prices",
                "structure": "Cost-based, Competitor-based, Value-based pricing",
                "example_question": "How should a new SaaS startup price its product?"
            }
        ],
        "market_sizing": {
            "approach": "Top-down or bottom-up estimation",
            "example_questions": [
                "How many gas stations are in the US?",
                "What is the market size for baby diapers in California?",
                "How many pizzas are sold in NYC each day?"
            ],
            "tips": [
                "Always clarify scope and assumptions",
                "Round numbers aggressively for easy math",
                "Walk through logic step by step",
                "Sanity check your final answer"
            ]
        },
        "mental_math_tips": [
            "Practice multiplying large numbers without calculator",
            "Memorize common percentages (15% = 10% + 5%)",
            "Use round numbers and adjust",
            "Practice under time pressure"
        ]
    },
    
    "behavioral_questions": {  # Fit is HUGE in consulting
        "questions": [
            {
                "question": "Tell me about a time you led a team through a difficult project.",
                "what_they_assess": "Leadership, teamwork, problem-solving",
                "tips": "Use STAR method, quantify impact"
            },
            {
                "question": "Describe a time you had to convince someone to change their mind.",
                "what_they_assess": "Influence, communication, stakeholder management",
                "tips": "Show empathy and structured persuasion"
            },
            {
                "question": "Why consulting? Why {company_name}?",
                "what_they_assess": "Motivation, fit, research",
                "tips": "Be specific about the firm, mention people you've talked to"
            },
            {
                "question": "Tell me about a time you failed.",
                "what_they_assess": "Self-awareness, learning agility",
                "tips": "Show genuine reflection and what you learned"
            }
        ]
    },
    
    "preparation_plan": {
        "timeline": "6-8 weeks for consulting interviews",
        "week_by_week": [
            {"week": "1-2", "focus": "Learn frameworks", "tasks": ["Read Case in Point", "Watch Victor Cheng videos", "Learn profitability & market entry frameworks"]},
            {"week": "3-4", "focus": "Practice solo cases", "tasks": ["Do 10-15 cases from casebooks", "Practice mental math daily", "Record yourself to improve communication"]},
            {"week": "5-6", "focus": "Partner practice", "tasks": ["Do 15-20 live cases with partners", "Use PrepLounge or find case partners", "Get feedback on structure and delivery"]},
            {"week": "7-8", "focus": "Final prep", "tasks": ["Mock interviews", "Refine behavioral stories", "Research the specific firm deeply"]}
        ],
        "resources": [
            {"name": "Case in Point", "type": "Book", "note": "Essential frameworks"},
            {"name": "PrepLounge", "url": "https://www.preplounge.com/", "note": "Find case partners"},
            {"name": "CaseCoach", "url": "https://www.casecoach.com/", "note": "AI case practice"},
            {"name": "Victor Cheng LOMS", "url": "https://www.caseinterview.com/", "note": "Video walkthroughs"}
        ],
        "number_of_cases": "40-50 cases recommended before interviews"
    }
}

# ============================================================================
# FOR SOFTWARE ENGINEERING ROLES
# ============================================================================
SOFTWARE_ENGINEERING_OUTPUT = {
    "company_name": str,
    "job_title": str,
    "level": str,
    "role_category": "Software Engineering",
    
    "interview_process": {
        "stages": [
            {"name": "Resume Screen", "description": "..."},
            {"name": "Recruiter Call", "description": "..."},
            {"name": "Technical Phone Screen", "description": "45-60 min coding on shared editor", "tips": "Practice thinking aloud"},
            {"name": "Onsite/Virtual Onsite", "description": "4-5 rounds: coding, system design, behavioral", "tips": "Pace yourself, ask questions"}
        ]
    },
    
    "coding_interview_prep": {  # SWE-SPECIFIC SECTION
        "patterns_to_master": [
            {"pattern": "Two Pointers", "example": "Container with most water", "when_to_use": "Array/string problems with pairs"},
            {"pattern": "Sliding Window", "example": "Longest substring without repeating", "when_to_use": "Subarray/substring problems"},
            {"pattern": "BFS/DFS", "example": "Number of islands", "when_to_use": "Graph/tree traversal"},
            {"pattern": "Dynamic Programming", "example": "Longest common subsequence", "when_to_use": "Optimization with overlapping subproblems"},
            {"pattern": "Binary Search", "example": "Search in rotated array", "when_to_use": "Sorted arrays, finding boundaries"}
        ],
        "companies_focus": {
            # Different companies emphasize different things
            "Google": "Heavy on algorithms, expect hard LC problems",
            "Meta": "Move fast, explain trade-offs clearly",
            "Amazon": "Leadership principles woven into technical",
            "Apple": "Deep dive into past projects, less LC-heavy"
        }
    },
    
    "system_design_prep": {  # For mid+ levels
        "topics": ["Load balancing", "Caching", "Database sharding", "Message queues", "CDNs"],
        "common_questions": [
            "Design Twitter/Instagram feed",
            "Design URL shortener",
            "Design chat application",
            "Design rate limiter"
        ],
        "framework": "Requirements → High-level design → Deep dive → Trade-offs → Bottlenecks"
    },
    
    "preparation_plan": {
        "resources": [
            {"name": "LeetCode", "url": "https://leetcode.com/", "note": "Primary practice"},
            {"name": "NeetCode 150", "url": "https://neetcode.io/", "note": "Curated list"},
            {"name": "System Design Primer", "url": "https://github.com/donnemartin/system-design-primer", "note": "Free guide"}
        ],
        "number_of_problems": "100-150 problems (50 easy, 80 medium, 20 hard)"
    }
}

# ============================================================================
# FOR FINANCE / INVESTMENT BANKING ROLES
# ============================================================================
FINANCE_OUTPUT = {
    "company_name": str,
    "job_title": str,
    "level": str,
    "role_category": "Finance",
    
    "technical_interview_prep": {  # FINANCE-SPECIFIC SECTION
        "accounting_questions": [
            {"question": "Walk me through the three financial statements", "hint": "Show how they connect"},
            {"question": "If depreciation increases by $10, what happens to each statement?", "hint": "Walk through the cascade"},
            {"question": "What's the difference between cash and accrual accounting?", "hint": "Timing of recognition"}
        ],
        "valuation_questions": [
            {"question": "Walk me through a DCF", "hint": "UFCF → discount at WACC → terminal value → enterprise value → equity value"},
            {"question": "How do you value a company?", "hint": "DCF, comparable companies, precedent transactions"},
            {"question": "When would you use a LBO model?", "hint": "PE acquisitions, debt capacity"}
        ],
        "brain_teasers": [
            "If you had $1M, how would you invest it?",
            "What's your favorite stock and why?"
        ]
    },
    
    "preparation_plan": {
        "resources": [
            {"name": "Breaking Into Wall Street", "url": "https://breakingintowallstreet.com/", "note": "Technical prep"},
            {"name": "Wall Street Oasis", "url": "https://www.wallstreetoasis.com/", "note": "Forums and guides"},
            {"name": "Rosenbaum IB Book", "note": "The textbook for IB technicals"}
        ],
        "skills_to_practice": ["DCF modeling", "Comparable analysis", "Excel shortcuts", "Mental math"]
    }
}

# ============================================================================
# OPENAI PROMPT INSTRUCTIONS
# ============================================================================
# When calling OpenAI, include the role_category and use it to:
# 1. Select the appropriate output structure above
# 2. NEVER include LeetCode for consulting/finance/marketing roles
# 3. NEVER include case interviews for software engineering roles
# 4. Use role-appropriate resources and prep timelines
# 5. Extract role-appropriate questions from Reddit posts

# Example prompt snippet:
"""
Role category: {role_category}

Based on this role category, generate interview prep content following these rules:
- If Consulting: Focus on case interviews, frameworks, market sizing. NO LeetCode or coding.
- If Software Engineering: Focus on coding problems, system design. NO case interviews.
- If Finance: Focus on technicals (DCF, valuation), accounting. NO LeetCode or case interviews.
- If PM: Focus on product sense, estimation. Limited coding.

Use the role-specific resources from ROLE_CATEGORY_CONFIG.
"""
```

### 3. PDF Generator (`backend/app/services/interview_prep/pdf_generator.py`)
                    "Start LeetCode easy problems (10-15)"
                ]
            },
            {
                "week": 2,
                "focus": "Core Problem Types",
                "tasks": [
                    "LeetCode medium problems (20-25)",
                    "Focus on: Two pointers, sliding window, BFS/DFS",
                    "Start behavioral question prep"
                ]
            },
            # ... weeks 3-4
        ],
        "resources": {
            "coding_practice": [
                {"name": "LeetCode", "url": "https://leetcode.com/", "note": "Focus on medium difficulty"},
                {"name": "LeetCode Apple tagged", "url": "https://leetcode.com/company/apple/", "note": "Apple-specific questions"},
                {"name": "NeetCode", "url": "https://neetcode.io/", "note": "Great video explanations"}
            ],
            "company_research": [
                {"name": "Glassdoor Apple Interviews", "url": "https://glassdoor.com/Interview/Apple-Interview-Questions", "note": "Real interview reports"},
                {"name": "Levels.fyi", "url": "https://levels.fyi/companies/apple", "note": "Compensation data"},
                {"name": "Blind", "url": "https://teamblind.com/", "note": "Search 'Apple interview'"}
            ],
            "skill_specific": [
                # Dynamically based on required_skills
                {"skill": "Swift", "resource": "Swift documentation", "url": "https://swift.org/documentation/"},
                {"skill": "iOS", "resource": "Apple Developer tutorials", "url": "https://developer.apple.com/tutorials/"}
            ]
        },
        "number_of_problems": "50 LeetCode problems recommended (20 easy, 25 medium, 5 hard)"
    },
    
    "red_flags_and_mistakes": {
        "common_mistakes": [
            "Not explaining your thought process while coding",
            "Jumping into code without clarifying requirements",
            "Not knowing your resume deeply"
        ],
        "company_specific_mistakes": [
            "Saying you don't use Apple products",
            "Not showing passion for design and user experience",
            "Being unable to articulate why Apple specifically"
        ],
        "what_interviewers_flagged": [
            # From Reddit posts
            "Candidate couldn't explain their own projects",
            "Lack of curiosity - didn't ask good questions"
        ]
    },
    
    "compensation": {
        # LEVEL-APPROPRIATE compensation
        "level": "Intern",  # matches job_details["level"]
        "base_pay": {
            "hourly_rate": "$45-55/hour",
            "monthly_estimate": "$7,200-8,800/month"
        },
        "additional_compensation": {
            "housing_stipend": "$3,000-4,000 for summer",
            "relocation": "Covered",
            "signing_bonus": "Usually none for interns"
        },
        "benefits": [
            "Free/discounted Apple products",
            "Access to employee gym",
            "Free meals at campus cafeterias"
        ],
        "negotiation": "Intern offers are typically non-negotiable",
        "source": "Based on Levels.fyi and Reddit reports"
    },
    
    "post_interview": {
        "response_timeline": "1-2 weeks after final round",
        "thank_you_note": {
            "should_send": True,
            "timing": "Within 24 hours",
            "template": "Brief, professional, reference specific conversation points"
        },
        "follow_up": {
            "when": "After 2 weeks with no response",
            "how": "Email your recruiter politely asking for an update"
        },
        "offer_process": "Verbal offer call, then written offer within a few days"
    },
    
    "sources_count": 25,
    "sources_quality": "Mix of recent (2024) and older posts, primarily from r/cscareerquestions",
    "data_gaps": ["Limited info on specific team cultures", "Few reports on remote interview format"]
}

# CRITICAL INSTRUCTIONS FOR OPENAI PROMPT:
# 1. Extract ACTUAL questions mentioned in Reddit posts, not generic ones
# 2. Include SPECIFIC details from candidate experiences (what round, what happened)
# 3. Tailor technical questions to the required_skills from job posting
# 4. Make compensation LEVEL-APPROPRIATE (intern vs full-time vs senior)
# 5. Include real quotes from Reddit where impactful
# 6. Note data gaps honestly rather than making things up
# 7. Make company-specific questions actually specific (not "Why do you want to work here?")
```

### 3. PDF Generator (`backend/app/services/interview_prep/pdf_generator.py`)

```python
# Follow the SAME pattern as existing meeting PDF generation
# Use the same PDF library and styling approach
# TARGET: 7-8 page comprehensive prep guide TAILORED TO THE SPECIFIC ROLE

# CRITICAL: The PDF must feel personalized, not generic. Every section should reference
# the specific company, role, level, and skills from the job posting.

# PDF Structure:

# PAGE 1 - Professional Cover Page
# ================================
# 1. Company logo - LARGE, centered (use Clearbit: https://logo.clearbit.com/{domain})
#    - Make it prominent, this immediately shows personalization
# 2. Job title in large, bold text (e.g., "Software Engineering Intern")
# 3. Company name below (e.g., "at Apple")
# 4. Styled job details box with icons:
#    ┌─────────────────────────────────────────┐
#    │ 📍 Location: Cupertino, CA (On-site)    │
#    │ 👥 Team: Apple Intelligence             │
#    │ 📊 Level: Intern                        │
#    │ 📅 Type: Summer 2025 Internship         │
#    └─────────────────────────────────────────┘
# 5. Quick stats bar: "5 stages | 4-6 weeks | 25 sources"
# 6. "Required Skills" section - show the skills from the job posting as tags/chips:
#    [Swift] [iOS] [Python] [Data Structures] [Git]
# 7. Table of contents with page numbers

# PAGE 2 - Interview Process Deep Dive
# =====================================
# 8. "Your Interview Journey at {company_name}"
#    - VISUAL TIMELINE (not just text) showing stages as connected steps:
#      [Apply] → [Recruiter] → [Technical] → [Behavioral] → [Team Match] → [Offer]
#    - Below each stage, show:
#      * Duration (e.g., "45 min")
#      * Who you'll meet (e.g., "Senior Engineer")
#      * Format (e.g., "Video Call")
# 9. Level-specific callout box:
#    "💡 For intern roles: Focus on fundamentals and learning ability over deep experience"
# 10. Timeline expectations with specific dates:
#     "Typical timeline: Apply → Offer in 4-6 weeks"

# PAGE 3-4 - Questions (2 pages, comprehensive)
# =============================================
# 11. "Questions You'll Face at {company_name}"
#
# BEHAVIORAL (8-10 questions):
# - Include {company_name}-SPECIFIC behavioral questions, not generic ones
# - Example for Apple: "Tell me about a time you obsessed over details"
# - Example for Amazon: "Describe a time you disagreed with your manager"
# - Tie to company values (Apple = innovation/design, Amazon = leadership principles)
#
# TECHNICAL - MUST BE TAILORED TO required_skills:
# - If job mentions "Swift": Include Swift-specific questions
# - If job mentions "Python": Include Python questions
# - If job mentions "System Design": Include system design questions
# - Format: Show the question AND a brief hint for answering
#   Example:
#   Q: "How would you implement a LRU cache?"
#   💡 Hint: Use a hashmap + doubly linked list for O(1) operations
#
# COMPANY-SPECIFIC (very important):
# - "Why {company_name}?" - with tips on what they want to hear
# - Product-specific questions:
#   * Apple: "How would you improve Siri?" / "What's your favorite Apple product?"
#   * Google: "How would you improve Google Maps?"
#   * Amazon: "How would you reduce delivery times?"
# - Culture/values questions specific to the company
#
# ACTUAL QUESTIONS FROM REDDIT:
# - Include 3-5 REAL questions that candidates reported being asked
# - Format: "📣 Reported by candidates: 'They asked me to design...'"

# PAGE 5 - How to Prepare
# =======================
# 12. "Your {X}-Week Prep Plan for {company_name}"
#     - Level-appropriate timeline (intern = 4 weeks, senior = 6-8 weeks)
#     - Week-by-week breakdown:
#       Week 1: Fundamentals review
#       Week 2: Practice problems (specify number: "50 LeetCode mediums")
#       Week 3: System design / behavioral prep
#       Week 4: Mock interviews + company research
#
# 13. "Resources" - WITH CLICKABLE LINKS:
#     - LeetCode: https://leetcode.com/
#     - Company-specific prep: https://leetcode.com/company/apple/
#     - Glassdoor interviews: https://glassdoor.com/Interview/apple-interview-questions
#     - Levels.fyi: https://levels.fyi/companies/apple
#     - Blind: Search "{company} interview" on Blind app
#
# 14. Skill-specific prep based on job posting:
#     - If Swift required: "Swift prep resources: [link], [link]"
#     - If System Design: "System Design prep: 'Designing Data-Intensive Applications'"

# PAGE 6 - Interview Day & What to Avoid
# ======================================
# 15. "Interview Day Checklist"
#     ✅ Tech setup (for virtual): Camera, mic, quiet space, backup internet
#     ✅ What to wear: Business casual (or company-specific guidance)
#     ✅ What to bring: Notebook, pen, questions to ask, water
#     ✅ Arrive 10 min early / log in 5 min early
#
# 16. "What to Avoid" - Be SPECIFIC, not generic:
#     ❌ Common mistakes candidates make at {company_name}
#     ❌ Specific things that hurt candidates (from Reddit experiences)
#     ❌ Red flags interviewers mentioned
#     Example: "Apple interviewers noted candidates who couldn't articulate WHY Apple"

# PAGE 7 - Real Experiences
# =========================
# 17. "What Candidates Said About {company_name} Interviews"
#     - 3-5 detailed experiences from Reddit
#     - MUST include specifics, not vague summaries:
#       * What questions they were asked (actual questions if mentioned)
#       * What surprised them
#       * What they wish they knew
#       * Whether they got the offer
#     - Format as cards/boxes with:
#       ┌─────────────────────────────────────────┐
#       │ 👤 SWE Intern Candidate (2024)          │
#       │ ⭐ Difficulty: Medium                   │
#       │                                         │
#       │ "The first round was a LeetCode medium  │
#       │ on arrays. Second round focused on my   │
#       │ iOS project and Swift knowledge..."     │
#       │                                         │
#       │ 💡 Tip: "Know your resume deeply"       │
#       │ ✅ Result: Offer received               │
#       └─────────────────────────────────────────┘

# PAGE 8 - Compensation & Next Steps
# ==================================
# 18. "Compensation for {job_title} at {company_name}"
#     - LEVEL-APPROPRIATE data:
#       * For INTERNS: Hourly rate, housing stipend, relocation, perks
#         "Apple SWE Interns: $45-55/hr + $3,000 housing stipend + relocation"
#       * For FULL-TIME: Base, bonus, equity, total comp
#         Show ranges: "L3: $150-180k base + $50k stock"
#     - Benefits highlights specific to company
#     - Negotiation tips appropriate to level
#       (Interns: usually non-negotiable)
#       (Full-time: "Stock is often more negotiable than base")
#
# 19. "After Your Interview"
#     - Expected response timeline (be specific: "Apple typically responds in 1-2 weeks")
#     - Thank you note template (brief)
#     - How to follow up (with example email)
#     - What the offer process looks like
#
# 20. Footer on every page:
#     "Powered by Offerloop.ai | Based on {X} Reddit posts | Generated {date}"
#     + Company logo small in corner

# ==================
# STYLING REQUIREMENTS
# ==================
# - Company logo on EVERY page (header or footer)
# - Use brand colors where possible (Apple = white/gray, Google = blue/red/yellow/green)
# - Visual elements: timelines, progress bars, card boxes, icons
# - Color-coded sections (green for tips, red for warnings, blue for info)
# - Highlight required skills wherever they appear (bold or colored)
# - Professional but friendly tone
# - Page numbers on every page
# - Clear visual hierarchy with consistent spacing
# - No walls of text - use bullets, cards, and visual breaks

# Store PDF in same location as meeting PDFs (check existing implementation)
```

### 4. Flask Routes (`backend/app/routes/interview_prep.py` or add to existing routes file)

```python
# POST /api/interview-prep/generate
# Request body: { "job_posting_url": "https://boards.greenhouse.io/..." }
# 
# Flow:
# 1. Receive job posting URL from frontend
# 2. Fetch and parse job posting (job_posting_parser.py)
# 3. Extract job details (company, role, level, skills, etc.)
# 4. Use job details to build targeted Reddit searches (reddit_scraper.py)
# 5. Process Reddit data with OpenAI (content_processor.py)
# 6. Generate PDF (pdf_generator.py)
# 7. Return PDF URL to user
#
# Requirements:
# - Require authentication (use same auth decorator as other protected routes)
# - Check user has sufficient credits (use INTERVIEW_PREP_CREDITS = 25)
# - Deduct credits on success (check how meeting does this)
# - Return: { "id": prep_id, "status": "processing", "job_details": {...} }

@app.route('/api/interview-prep/generate', methods=['POST'])
@require_auth  # Use your existing auth decorator
async def generate_interview_prep():
    data = request.json
    job_posting_url = data.get('job_posting_url')
    
    if not job_posting_url:
        return jsonify({"error": "Job posting URL is required"}), 400
    
    # Check credits
    user_credits = get_user_credits(current_user)  # Use existing credit check
    if user_credits < 25:
        return jsonify({"error": "Insufficient credits. Need 25 credits."}), 402
    
    # Create prep record in database
    prep_id = create_interview_prep_record(current_user, job_posting_url)
    
    # Start async job (use existing background task pattern from meeting)
    start_interview_prep_job(prep_id, job_posting_url)
    
    return jsonify({
        "id": prep_id,
        "status": "processing",
        "message": "Analyzing job posting and gathering interview insights..."
    })

# GET /api/interview-prep/status/<prep_id>
# - Return current status, job details extracted, and result when complete
# - Same polling pattern as meeting
# Response when processing:
# { "id": "...", "status": "processing", "progress": "Scraping Reddit for insights..." }
# Response when complete:
# { "id": "...", "status": "completed", "job_details": {...}, "pdfUrl": "..." }

# GET /api/interview-prep/download/<prep_id>
# - Return { "pdfUrl": signed_url }
# - Same pattern as meeting download

# GET /api/interview-prep/history
# - Return list of user's past interview preps
# - Include: id, job_title, company_name, created_at, pdf_url
```

### 5. Error Handling
- Handle invalid/inaccessible job posting URLs (return friendly error: "Could not access job posting. Please check the URL or try pasting the job description directly.")
- Handle cases where job posting site blocks scraping (LinkedIn often does this) - suggest copying job description text instead
- Handle cases where no Reddit posts are found (suggest company may be too small/new)
- Handle Reddit rate limits (429) with exponential backoff retry logic
- Timeout the entire generation after 90 seconds
- Return user-friendly error messages with suggestions
- If fewer than 5 posts found, warn user that prep guide may be limited

---

## Frontend Requirements

### Update `connect-grow-hire/src/pages/Home.tsx` - Replace the Interview Prep Tab

Find the existing `<TabsContent value="interview-prep">` section (around line 1668) and replace it with a FULLY FUNCTIONAL implementation.

**New state variables to add** (add near other state declarations around line 200):
```typescript
// Interview Prep state
const [interviewPrepLoading, setInterviewPrepLoading] = useState(false);
const [interviewPrepProgress, setInterviewPrepProgress] = useState<string>("");
const [interviewPrepId, setInterviewPrepId] = useState<string | null>(null);
const [interviewPrepResult, setInterviewPrepResult] = useState<any | null>(null);
const [interviewPrepStatus, setInterviewPrepStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
const [jobPostingUrl, setJobPostingUrl] = useState("");
const [parsedJobDetails, setParsedJobDetails] = useState<any | null>(null);
```

**Credit cost constant** (add near MEETING_CREDITS):
```typescript
const INTERVIEW_PREP_CREDITS = 25;
```

**Handler function** (add near handleMeetingSubmit):
```typescript
const handleInterviewPrepSubmit = async () => {
  // 1. Validate job posting URL
  if (!jobPostingUrl.trim()) {
    toast({ title: "Please enter a job posting URL", variant: "destructive" });
    return;
  }
  
  // 2. Check credits
  const currentCredits = await checkCredits();
  if (currentCredits < INTERVIEW_PREP_CREDITS) {
    toast({ title: "Insufficient credits", description: `You need ${INTERVIEW_PREP_CREDITS} credits.`, variant: "destructive" });
    return;
  }
  
  // 3. Start generation
  setInterviewPrepLoading(true);
  setInterviewPrepStatus('processing');
  setInterviewPrepProgress('Analyzing job posting...');
  
  try {
    // 4. Call API to start generation
    const response = await apiService.generateInterviewPrep(jobPostingUrl);
    setInterviewPrepId(response.id);
    
    // 5. Poll for status until complete (same pattern as meeting)
    // Update progress messages:
    // - "Analyzing job posting..."
    // - "Extracting role requirements..."
    // - "Searching Reddit for interview experiences..."
    // - "Processing insights with AI..."
    // - "Generating your prep guide..."
    
    // 6. On complete, update UI with results
    // 7. Deduct credits on success
  } catch (error) {
    setInterviewPrepStatus('failed');
    toast({ title: "Generation failed", description: error.message, variant: "destructive" });
  } finally {
    setInterviewPrepLoading(false);
  }
};

const downloadInterviewPrepPDF = async (prepId?: string) => {
  // Same pattern as downloadMeetingPDF
};
```

**UI Requirements for the Interview Prep tab:**
- Remove the ComingSoonOverlay
- Single input field:
  - **Job Posting URL** (required) - e.g., "https://boards.greenhouse.io/company/jobs/123"
  - Placeholder text: "Paste the job posting URL here..."
  - Help text: "Supports LinkedIn, Indeed, Greenhouse, Lever, Workday, and most career pages"
- "Generate Interview Prep" button with gradient styling matching meeting
- Loading state with Loader2 spinner and step-by-step progress messages:
  1. "Analyzing job posting..."
  2. "Extracting role requirements..."
  3. "Searching for interview experiences..."
  4. "Processing insights..."
  5. "Generating your prep guide..."
- When job details are parsed, show a preview card:
  - Company name + logo
  - Job title
  - Level (if detected)
  - Team/Division (if detected)
  - Key skills extracted
- When complete, show:
  - Full job details card
  - Interview process overview preview
  - Sample questions preview (first 3-5)
  - "Download Full PDF" button (prominent, gradient)
  - "View in Browser" option
- Error state handling with helpful suggestions
- Available for all users (Free and Pro)

**Match the existing UI patterns:**
- Use same Card, CardHeader, CardContent structure as meeting
- Use same color scheme (gray-800, gradients, etc.)
- Use same badge styling
- Use same button gradients (purple/pink for primary actions)
- Use same loading/status indicators (Loader2, CheckCircle, XCircle)

---

## API Service Updates

Add to `connect-grow-hire/src/services/api.ts` (or wherever apiService is defined):

```typescript
// Interview Prep API methods
generateInterviewPrep: async (jobPostingUrl: string) => {
  // POST /api/interview-prep/generate
  // Body: { "job_posting_url": jobPostingUrl }
},

getInterviewPrepStatus: async (prepId: string) => {
  // GET /api/interview-prep/status/{prepId}
  // Returns: { id, status, progress?, job_details?, pdfUrl? }
},

downloadInterviewPrepPDF: async (prepId: string) => {
  // GET /api/interview-prep/download/{prepId}
},

getInterviewPrepHistory: async () => {
  // GET /api/interview-prep/history
}
```

---

## Type Definitions

Add to your types file:

```typescript
interface JobDetails {
  companyName: string;
  companyDomain: string;
  jobTitle: string;
  level: string | null;
  teamDivision: string | null;
  location: string;
  remotePolicy: string | null;
  requiredSkills: string[];
  preferredSkills: string[];
  yearsExperience: string | null;
  jobType: string;
  keyResponsibilities: string[];
  interviewHints: string | null;
  salaryRange: string | null;
  roleCategory: string;
}

interface InterviewPrepResult {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  progress?: string;
  jobDetails?: JobDetails;
  pdfUrl?: string;
  createdAt: string;
  
  interviewProcess?: {
    stages: string[];
    timeline: string;
    format: string;
    interviewers: string;
    duration: string;
    passRates: string | null;
  };
  
  commonQuestions?: {
    category: string;
    questions: string[];
    tips: string;
  }[];
  
  realExperiences?: {
    role: string;
    year: string;
    summary: string;
    surprising: string;
    difficulty: string;
  }[];
  
  successTips?: {
    preparation: string[];
    duringInterview: string[];
    companySpecific: string[];
  };
  
  redFlagsAndMistakes?: string[];
  
  dayOfLogistics?: {
    whatToWear: string;
    arrivalTime: string;
    whatToBring: string;
    virtualSetup: string;
    parkingBuildingAccess: string;
  };
  
  postInterview?: {
    responseTimeline: string;
    thankYouNotes: string;
    followUp: string;
    offerDetails: string;
    negotiationTips: string;
  };
  
  cultureInsights?: {
    workLifeBalance: string;
    teamDynamics: string;
    managementStyle: string;
    growthOpportunities: string;
    diversityInclusion: string;
    remotePolicy: string;
  };
  
  compensation?: {
    baseSalaryRange: string;
    bonusStructure: string;
    benefitsHighlights: string;
    salaryByLevel: string;
    negotiationRoom: string;
  };
  
  roleSpecificPrep?: {
    prepTopics: string[];
    practiceResources: string[];
    timeInvestment: string;
  };
  
  sourcesCount?: number;
  sourcesSummary?: string;
  error?: string;
}
```

---

## Important Implementation Notes

1. **Follow existing patterns** - Look at how meeting prep is implemented and mirror that approach for consistency

2. **Credit check** - Users need 25+ credits to use this feature. Check `effectiveUser.credits` before allowing generation

3. **Available for all users** - Interview prep is available for both Free and Pro tier users. No tier restrictions needed.

4. **Polling pattern** - Use the same polling approach as meeting (poll every 3 seconds, max 90 seconds timeout - longer due to job parsing + comprehensive scraping)

5. **PDF storage** - Store PDFs in the same location/bucket as meeting PDFs

6. **Error messages** - Be user-friendly with actionable suggestions:
   - "Could not access this job posting. Try pasting the job description directly." (for blocked URLs)
   - "No interview data found for [Company]. They may be too new or small." (for obscure companies)
   - "LinkedIn blocks automated access. Try copying the job URL from Greenhouse or the company's career page." (for LinkedIn)

7. **Caching** - Cache results for the same job posting URL for 7 days to avoid re-scraping. If cached, return immediately.

8. **Comprehensive extraction** - The goal is a 5-6 page PDF tailored to THE SPECIFIC ROLE, not generic company info. Use job details to personalize everything.

9. **Job posting site handling** - Different sites need different handling:
   - Greenhouse, Lever, Workday: Usually work well
   - LinkedIn: Often blocks scraping - suggest alternatives
   - Indeed: May work, may not
   - Company career pages: Usually work

10. **Fallback option** - If URL parsing fails, allow users to paste raw job description text as fallback (add a "Paste job description instead" link)

11. **Quality over speed** - It's okay if generation takes 45-90 seconds. Users want comprehensive, role-specific prep guides.

12. **Progress updates** - Show meaningful progress messages during generation:
    - "Fetching job posting..." (0-10%)
    - "Analyzing role requirements..." (10-20%)
    - "Searching Reddit for interview experiences..." (20-50%)
    - "Finding role-specific insights..." (50-70%)
    - "Generating your personalized prep guide..." (70-100%)

---

## Testing Checklist

After implementation:

**Basic Functionality:**
1. [ ] Test with Greenhouse job posting URL
2. [ ] Test with Lever job posting URL
3. [ ] Test with company career page URL
4. [ ] Test with LinkedIn URL (should show helpful error)
5. [ ] Test with invalid URL (should show error with suggestion)

**Role Category Detection (CRITICAL):**
6. [ ] Test with SOFTWARE ENGINEERING job posting
   - Should include: LeetCode, coding problems, system design
   - Should NOT include: Case interviews, frameworks like profitability
   - Resources: LeetCode, NeetCode, System Design Primer
   
7. [ ] Test with CONSULTING job posting (e.g., Deloitte, McKinsey)
   - Should include: Case frameworks, market sizing, fit questions
   - Should NOT include: LeetCode, coding problems, data structures
   - Resources: Case in Point, PrepLounge, CaseCoach
   
8. [ ] Test with FINANCE job posting (e.g., Goldman Sachs, JP Morgan)
   - Should include: DCF, valuation, accounting questions
   - Should NOT include: LeetCode, case interviews
   - Resources: Breaking Into Wall Street, WSO, Rosenbaum book
   
9. [ ] Test with PRODUCT MANAGEMENT job posting
   - Should include: Product sense, estimation, CIRCLES framework
   - Should NOT include: Heavy coding, case frameworks
   - Resources: Cracking the PM Interview, Exponent
   
10. [ ] Test with DATA SCIENCE job posting
    - Should include: SQL, statistics, ML concepts
    - Resources: StrataScratch, DataLemur

**Content Quality:**
11. [ ] Verify job details are extracted correctly (company, role, level, skills)
12. [ ] Verify role_category is detected correctly
13. [ ] Verify PDF content matches the role type (no LeetCode in consulting PDFs!)
14. [ ] Verify resources/links are appropriate for the role
15. [ ] Verify company-specific questions are actually specific

**PDF Quality:**
16. [ ] Company logo appears on cover page
17. [ ] Job details box shows role, level, team, location
18. [ ] Required skills from job posting are displayed
19. [ ] Prep timeline is level-appropriate (intern vs senior)
20. [ ] Compensation is level-appropriate (hourly for interns, base+bonus for FT)
21. [ ] 7-10 pages with good visual design

**Technical:**
22. [ ] Test credit deduction
23. [ ] Test loading states and progress messages
24. [ ] Test PDF download
25. [ ] Test caching (same URL returns cached result)
26. [ ] Test error handling for blocked sites
