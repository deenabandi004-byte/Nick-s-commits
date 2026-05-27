"""
Reddit scraper service - fetch interview-related posts from Reddit
"""
import aiohttp
import asyncio
import time
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from urllib.parse import quote_plus

logger = logging.getLogger(__name__)

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

# User-Agent header required by Reddit
REDDIT_USER_AGENT = "Offerloop/1.0 (interview prep tool for students; contact@offerloop.ai)"


def build_search_queries(job_details: Dict) -> List[str]:
    """Build targeted search queries - OPTIMIZED: Only top 5 most important queries"""
    queries = []
    company = job_details.get("company_name", "")
    role = job_details.get("job_title", "")
    
    # Top 5 most valuable queries (prioritized for speed)
    if company and role:
        queries.append(f"{company} {role} interview")
        queries.append(f"{company} {role} interview experience")
    if company:
        queries.append(f"{company} interview process")
        queries.append(f"{company} interview questions")
        queries.append(f"{company} offer")
    
    # Limit to exactly 5 queries for performance
    return queries[:5]


async def fetch_post_comments(session: aiohttp.ClientSession, post_id: str, subreddit: str) -> List[Dict]:
    """Fetch top comments for a specific post"""
    url = f"https://www.reddit.com/r/{subreddit}/comments/{post_id}.json"
    try:
        async with session.get(url) as resp:
            if resp.status == 200:
                data = await resp.json()
                # Reddit comments API returns array: [post_data, comments_data]
                if len(data) >= 2 and 'data' in data[1]:
                    comments = data[1]['data'].get('children', [])
                    # Filter out deleted/removed comments and get top 5 by upvotes
                    valid_comments = [
                        c['data'] for c in comments 
                        if c['kind'] == 't1' and 
                        c['data'].get('body') and 
                        c['data'].get('body') not in ['[deleted]', '[removed]']
                    ]
                    # Sort by upvotes and take top 10 (comments often have the best info)
                    valid_comments.sort(key=lambda x: x.get('ups', 0), reverse=True)
                    return valid_comments[:10]
    except Exception as e:
        print(f"Error fetching comments for {post_id}: {e}")
    return []


async def search_reddit(job_details: Dict, timeout_seconds: int = 90) -> List[Dict]:
    """
    Search Reddit using targeted queries based on job posting details
    
    Args:
        job_details: Parsed job posting with company_name, job_title, level, etc.
        timeout_seconds: Maximum time to spend scraping
    
    Returns:
        List of relevant Reddit posts with comments
    """
    # OPTIMIZATION: Early termination - stop searching once we have enough posts
    MAX_POSTS_NEEDED = 20  # Stop searching once we have this many
    
    total_start = time.time()
    headers = {"User-Agent": REDDIT_USER_AGENT}
    
    all_posts = []
    seen_ids = set()  # For deduplication
    
    # Select subreddits based on role category
    role_category = job_details.get("role_category", "Other")
    subreddits = SUBREDDIT_MAP.get(role_category, SUBREDDIT_MAP["Other"])
    subreddits = subreddits + ['interviews', 'jobs']  # Always include these
    subreddits = list(dict.fromkeys(subreddits))  # Remove duplicates, preserve order
    
    # OPTIMIZATION: Reduce to top 3 subreddits (was 5)
    subreddits = subreddits[:3]
    
    # Build targeted queries
    queries = build_search_queries(job_details)
    
    # OPTIMIZATION: Reduce to top 3 queries (was 5)
    queries = queries[:3]
    
    logger.info(f"🔍 Reddit scraper starting: {len(subreddits)} subreddits, {len(queries)} queries, timeout={timeout_seconds}s, max_posts={MAX_POSTS_NEEDED}")
    
    start_time = datetime.now()
    search_start = time.time()
    search_requests = 0
    
    async with aiohttp.ClientSession(headers=headers, timeout=aiohttp.ClientTimeout(total=timeout_seconds)) as session:
        for subreddit_idx, subreddit in enumerate(subreddits):
            # EARLY EXIT: Stop if we have enough posts
            if len(all_posts) >= MAX_POSTS_NEEDED:
                logger.info(f"✅ Reddit early exit: found {len(all_posts)} posts, skipping remaining subreddits")
                break
                
            if (datetime.now() - start_time).total_seconds() > timeout_seconds:
                logger.warning(f"⏱️ Reddit timeout reached during subreddit {subreddit_idx+1}/{len(subreddits)}")
                break
                
            for query_idx, query in enumerate(queries):
                # EARLY EXIT: Stop if we have enough posts
                if len(all_posts) >= MAX_POSTS_NEEDED:
                    logger.info(f"✅ Reddit early exit: found {len(all_posts)} posts, skipping remaining queries")
                    break
                    
                if (datetime.now() - start_time).total_seconds() > timeout_seconds:
                    logger.warning(f"⏱️ Reddit timeout reached during query {query_idx+1}/{len(queries)}")
                    break
                
                query_start = time.time()
                url = f"https://www.reddit.com/r/{subreddit}/search.json?q={quote_plus(query)}&sort=top&t=year&limit=25"
                search_requests += 1
                
                try:
                    async with session.get(url) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            posts = data.get("data", {}).get("children", [])
                            new_posts = 0
                            for post in posts:
                                if post.get("kind") != "t3":
                                    continue
                                post_data = post.get("data", {})
                                post_id = post_data.get("id")
                                if post_id and post_id not in seen_ids:
                                    seen_ids.add(post_id)
                                    
                                    # Filter posts from last 12 months
                                    created_utc = post_data.get('created_utc', 0)
                                    if created_utc:
                                        post_date = datetime.fromtimestamp(created_utc)
                                        if post_date < datetime.now() - timedelta(days=365):
                                            continue
                                    
                                    title = post_data.get('title', '')
                                    if not title:
                                        continue
                                    
                                    all_posts.append(post)
                                    new_posts += 1
                            
                            query_time = time.time() - query_start
                            logger.debug(f"  Query {query_idx+1}/{len(queries)} '{query[:40]}...' in r/{subreddit}: {query_time:.2f}s ({new_posts} new posts, total={len(all_posts)})")
                        elif resp.status == 429:
                            # Rate limited - wait longer
                            logger.warning(f"⚠️ Reddit rate limited on query {query_idx+1}, waiting 2s...")
                            await asyncio.sleep(2)
                        await asyncio.sleep(0.6)  # Rate limit: stay safe
                except Exception as e:
                    query_time = time.time() - query_start
                    logger.error(f"❌ Error fetching query {query_idx+1} in r/{subreddit}: {e} ({query_time:.2f}s)")
                    continue
        
        search_time = time.time() - search_start
        logger.info(f"📊 Reddit search phase: {search_requests} requests, {len(all_posts)} posts found in {search_time:.2f}s")
        
        # Sort by upvotes and relevance, limit to MAX_POSTS_NEEDED
        all_posts.sort(key=lambda x: x.get("data", {}).get("ups", 0), reverse=True)
        top_posts = all_posts[:MAX_POSTS_NEEDED]  # Limit to what we need
        logger.info(f"📊 Reddit search complete: {len(all_posts)} posts found, keeping top {len(top_posts)}")
        
        # OPTIMIZED: Fetch comments for top 15 posts, only top 3 comments each
        comments_start = time.time()
        posts_with_comments = []
        comment_requests = 0
        comments_to_fetch = min(15, len(top_posts))  # Fetch comments for top 15 or all if less
        
        for post_idx, post in enumerate(top_posts[:comments_to_fetch]):
            if (datetime.now() - start_time).total_seconds() > timeout_seconds:
                logger.warning(f"⏱️ Reddit timeout reached during comment fetching ({post_idx}/{comments_to_fetch})")
                break
                
            post_data = post.get("data", {})
            permalink = post_data.get("permalink", "")
            if permalink:
                comment_start = time.time()
                comments_url = f"https://www.reddit.com{permalink}.json?limit=3&sort=top"  # OPTIMIZED: Only 3 comments
                comment_requests += 1
                
                try:
                    async with session.get(comments_url) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            if len(data) > 1:
                                comments = data[1].get("data", {}).get("children", [])
                                post_data["top_comments"] = [
                                    {
                                        'body': c.get("data", {}).get("body", "")[:2500],
                                        'upvotes': c.get("data", {}).get("ups", 0)
                                    }
                                    for c in comments[:3]  # OPTIMIZED: Only top 3 comments (was 15)
                                    if c.get("kind") == "t1"
                                ]
                                comment_time = time.time() - comment_start
                                logger.debug(f"  Comments for post {post_idx+1}/{comments_to_fetch}: {comment_time:.2f}s ({len(post_data.get('top_comments', []))} comments)")
                    await asyncio.sleep(0.6)
                except Exception as e:
                    comment_time = time.time() - comment_start
                    logger.error(f"❌ Error fetching comments for post {post_idx+1}: {e} ({comment_time:.2f}s)")
            
            # Structure the post data (after fetching comments)
            structured_post = {
                'post_id': post_data.get('id'),
                'post_title': post_data.get('title', ''),
                'post_body': post_data.get('selftext', '')[:5000] if post_data.get('selftext') else '',
                'top_comments': post_data.get('top_comments', []),
                'upvotes': post_data.get('ups', 0),
                'date': datetime.fromtimestamp(post_data.get('created_utc', 0)).isoformat() if post_data.get('created_utc') else None,
                'subreddit': post_data.get('subreddit', ''),
                'url': f"https://www.reddit.com{post_data.get('permalink', '')}"
            }
            posts_with_comments.append(structured_post)
        
        # Add remaining posts without comments (if we stopped early due to timeout)
        for post in top_posts[comments_to_fetch:]:
            post_data = post.get("data", {})
            structured_post = {
                'post_id': post_data.get('id'),
                'post_title': post_data.get('title', ''),
                'post_body': post_data.get('selftext', '')[:5000] if post_data.get('selftext') else '',
                'top_comments': [],  # No comments fetched
                'upvotes': post_data.get('ups', 0),
                'date': datetime.fromtimestamp(post_data.get('created_utc', 0)).isoformat() if post_data.get('created_utc') else None,
                'subreddit': post_data.get('subreddit', ''),
                'url': f"https://www.reddit.com{post_data.get('permalink', '')}"
            }
            posts_with_comments.append(structured_post)
        
        comments_time = time.time() - comments_start
        logger.info(f"💬 Reddit comments phase: {comment_requests} requests in {comments_time:.2f}s")
    
    total_time = time.time() - total_start
    logger.info(f"✅ Reddit scraper complete: {len(posts_with_comments)} posts with comments in {total_time:.2f}s")
    logger.info(f"   Breakdown: search={search_time:.2f}s, comments={comments_time:.2f}s, total={total_time:.2f}s")
    
    return posts_with_comments

