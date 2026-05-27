"""
Content Aggregator for Interview Prep 2.0
Combines data from multiple sources, deduplicates, and scores
"""
import asyncio
import hashlib
import time
from typing import Dict, List, Tuple
from datetime import datetime
import logging

from .reddit_scraper import search_reddit
from .youtube_scraper import search_youtube
from .glassdoor_scraper import search_glassdoor

logger = logging.getLogger(__name__)


class ContentAggregator:
    """Aggregates and normalizes content from multiple sources"""
    
    def __init__(self):
        self.sources_status = {}
    
    async def gather_all_sources(
        self, 
        job_details: Dict,
        timeout_seconds: int = 180
    ) -> Dict[str, List[Dict]]:
        """
        Fetch data from all sources in parallel, collecting results as they complete
        
        This fixes the bug where completed results were lost on timeout.
        Now we collect results incrementally and keep partial results.
        """
        company = job_details.get('company_name', 'Unknown')
        role = job_details.get('job_title', 'Unknown')
        logger.info(f"Gathering content from all sources for company={company}, role={role}")
        logger.debug(f"Job details: {job_details}")
        
        # Initialize results and status tracking
        results = {
            "reddit": [],
            "youtube": [],
            "glassdoor": []
        }
        self.sources_status = {
            "reddit": "pending",
            "youtube": "pending",
            "glassdoor": "pending"
        }
        
        # Create tasks for all sources with per-source timeouts
        # Reddit needs more time (sequential requests with delays), YouTube/Glassdoor are faster
        tasks = {
            "reddit": asyncio.create_task(search_reddit(job_details, timeout_seconds=45)),  # Increased: 45s for Reddit
            "youtube": asyncio.create_task(search_youtube(job_details, timeout_seconds=20)),
            "glassdoor": asyncio.create_task(search_glassdoor(job_details, timeout_seconds=15)),
        }
        
        # OPTIMIZATION: Cap total timeout at 50s (must be > Reddit timeout of 45s to allow completion)
        # The aggregation timeout should be MAX of individual source timeouts + buffer
        max_wait = min(timeout_seconds, 50)  # 50s allows Reddit (45s) to complete
        start_time = time.time()
        pending = set(tasks.values())
        
        # Collect results as tasks complete (don't wait for all)
        while pending:
            remaining_timeout = max_wait - (time.time() - start_time)
            if remaining_timeout <= 0:
                logger.warning(f"Content aggregation timeout reached ({max_wait}s) - collecting partial results")
                break
            
            try:
                # Wait for next task to complete
                done, pending = await asyncio.wait(
                    pending,
                    timeout=remaining_timeout,
                    return_when=asyncio.FIRST_COMPLETED
                )
                
                # Collect results from completed tasks IMMEDIATELY
                for task in done:
                    # Find which source this task belongs to
                    for source_name, t in tasks.items():
                        if t == task:
                            try:
                                result = task.result()
                                if isinstance(result, list):
                                    results[source_name] = result
                                    if len(result) > 0:
                                        self.sources_status[source_name] = "success"
                                        logger.info(f"✅ {source_name} completed: {len(result)} items")
                                    else:
                                        self.sources_status[source_name] = "empty"
                                        logger.info(f"⚠️ {source_name} returned empty list (0 items)")
                                else:
                                    logger.warning(f"⚠️ {source_name} returned unexpected type: {type(result)}")
                                    results[source_name] = []
                                    self.sources_status[source_name] = "empty"
                            except Exception as e:
                                logger.warning(f"❌ {source_name} failed: {type(e).__name__}: {e}")
                                results[source_name] = []
                                self.sources_status[source_name] = "failed"
                            break
                            
            except asyncio.TimeoutError:
                logger.warning(f"Content aggregation timed out after {max_wait}s - collecting partial results")
                break
        
        # Cancel any still-pending tasks
        for source_name, task in tasks.items():
            if not task.done():
                logger.warning(f"⏱️ {source_name} timed out - cancelling task")
                self.sources_status[source_name] = "timeout"
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    logger.debug(f"Task cancellation error for {source_name}: {e}")
        
        # Log final results
        total_items = sum(len(v) for v in results.values())
        logger.info(f"After gather: reddit={len(results['reddit'])}, youtube={len(results['youtube'])}, glassdoor={len(results['glassdoor'])}, total={total_items}")
        logger.info(f"Source statuses: {self.sources_status}")
        
        # Early termination check - if we have 20+ items, we're good
        if total_items >= 20:
            logger.info(f"Early termination: Have {total_items} items, sufficient for processing")
        
        return results
    
    def normalize_content(self, raw_data: Dict[str, List[Dict]]) -> List[Dict]:
        """
        Normalize content from all sources into unified format
        
        Unified format:
        {
            "id": str,              # Unique identifier
            "source": str,          # reddit, youtube, glassdoor
            "source_url": str,      # Link to original
            "title": str,           # Title/headline
            "content": str,         # Main text content
            "date": str,            # ISO date string
            "score": float,         # Engagement score (0-1)
            "questions": List[str], # Extracted questions
            "metadata": Dict,       # Source-specific metadata
        }
        """
        normalized = []
        
        # Normalize Reddit posts
        reddit_posts = raw_data.get("reddit", [])
        logger.debug(f"Normalizing {len(reddit_posts)} Reddit posts")
        for post in reddit_posts:
            # Reddit scraper returns: post_id, post_title, post_body, top_comments, url, date
            post_id = post.get('post_id', '') or post.get('id', '')
            post_title = post.get('post_title', '') or post.get('title', '')
            post_url = post.get('url', '') or f"https://reddit.com{post.get('permalink', '')}"
            post_date = post.get('date', '') or post.get('created_utc', '')
            
            combined_content = self._combine_reddit_content(post)
            if not combined_content:
                logger.warning(f"Reddit post {post_id} has empty content. Keys: {list(post.keys())}")
            
            normalized.append({
                "id": f"reddit_{post_id}",
                "source": "reddit",
                "source_url": post_url,
                "title": post_title,
                "content": combined_content,
                "date": post_date,
                "score": self._normalize_score(post.get("upvotes", 0), "reddit"),
                "questions": [],  # Will be extracted later
                "metadata": {
                    "subreddit": post.get("subreddit", ""),
                    "upvotes": post.get("upvotes", 0),
                    "num_comments": len(post.get("top_comments", [])) or post.get("num_comments", 0),
                }
            })
        
        # Normalize YouTube videos
        youtube_videos = raw_data.get("youtube", [])
        logger.debug(f"Normalizing {len(youtube_videos)} YouTube videos")
        for video in youtube_videos:
            normalized.append({
                "id": f"youtube_{video.get('video_id', '')}",
                "source": "youtube",
                "source_url": f"https://youtube.com/watch?v={video.get('video_id', '')}",
                "title": video.get("title", ""),
                "content": video.get("transcript", video.get("description", "")),
                "date": video.get("published_at", ""),
                "score": self._normalize_score(video.get("view_count", 0), "youtube"),
                "questions": [],
                "metadata": {
                    "channel": video.get("channel_title", ""),
                    "view_count": video.get("view_count", 0),
                    "has_transcript": video.get("has_transcript", False),
                    "relevance_score": video.get("relevance_score", 0),
                }
            })
        
        # Normalize Glassdoor reviews
        glassdoor_reviews = raw_data.get("glassdoor", [])
        logger.debug(f"Normalizing {len(glassdoor_reviews)} Glassdoor reviews")
        for review in glassdoor_reviews:
            normalized.append({
                "id": f"glassdoor_{hashlib.md5(review.get('experience', '')[:100].encode()).hexdigest()[:12]}",
                "source": "glassdoor",
                "source_url": "https://glassdoor.com",  # Generic, specific URLs hard to get
                "title": f"Interview for {review.get('job_title', 'Unknown Position')}",
                "content": review.get("experience", ""),
                "date": review.get("date", ""),
                "score": self._glassdoor_outcome_score(review.get("outcome", "")),
                "questions": review.get("questions", []),
                "metadata": {
                    "job_title": review.get("job_title", ""),
                    "difficulty": review.get("difficulty", ""),
                    "outcome": review.get("outcome", ""),
                }
            })
        
        return normalized
    
    def _combine_reddit_content(self, post: Dict) -> str:
        """Combine Reddit post body with top comments"""
        # Reddit scraper returns: post_body, top_comments (list of dicts with 'body')
        parts = []
        
        # Get post body (try both key names for compatibility)
        post_body = post.get("post_body", "") or post.get("body", "")
        if post_body:
            parts.append(post_body)
        
        # Get top comments (try both key names)
        comments = post.get("top_comments", []) or post.get("comments", [])
        for comment in comments[:5]:
            if isinstance(comment, dict):
                comment_body = comment.get("body", "")
                if comment_body and comment_body not in ['[deleted]', '[removed]']:
                    parts.append(comment_body)
            elif isinstance(comment, str) and comment not in ['[deleted]', '[removed]']:
                parts.append(comment)
        
        combined = "\n\n".join(filter(None, parts))
        
        # If still empty, use title as fallback
        if not combined:
            combined = post.get("post_title", "") or post.get("title", "")
        
        return combined
    
    def _normalize_score(self, raw_score: int, source: str) -> float:
        """Normalize engagement score to 0-1 range"""
        if source == "reddit":
            # Reddit: 100 upvotes = 0.5, 1000+ = 1.0
            return min(raw_score / 1000, 1.0)
        elif source == "youtube":
            # YouTube: 10k views = 0.5, 100k+ = 1.0
            return min(raw_score / 100000, 1.0)
        return 0.5
    
    def _glassdoor_outcome_score(self, outcome: str) -> float:
        """Score Glassdoor reviews by outcome (accepted offers are more useful)"""
        outcome_lower = outcome.lower()
        if "accepted" in outcome_lower:
            return 0.9
        elif "declined" in outcome_lower:
            return 0.7
        elif "no offer" in outcome_lower:
            return 0.5
        return 0.4
    
    def deduplicate(self, content: List[Dict]) -> List[Dict]:
        """Remove duplicate content based on similarity"""
        seen_hashes = set()
        unique = []
        
        for item in content:
            # Create hash that includes title + source + content preview to avoid collisions
            # This prevents empty content from causing all items to hash the same
            title = item.get("title", "")[:100].lower()
            source = item.get("source", "")
            content_preview = item.get("content", "")[:200].lower()
            
            # Combine title + source + content for hash
            hash_input = f"{source}:{title}:{content_preview}"
            content_hash = hashlib.md5(hash_input.encode()).hexdigest()
            
            if content_hash not in seen_hashes:
                seen_hashes.add(content_hash)
                unique.append(item)
                logger.debug(f"Added unique item: {item.get('id', 'unknown')} (hash: {content_hash[:8]}, title: {title[:50]})")
            else:
                logger.debug(f"Skipped duplicate: {item.get('id', 'unknown')} (hash: {content_hash[:8]}, title: {title[:50]})")
        
        return unique
    
    def rank_content(self, content: List[Dict], job_details: Dict) -> List[Dict]:
        """Rank content by relevance and quality"""
        company = job_details.get("company_name", "").lower()
        role = job_details.get("job_title", "").lower()
        
        def compute_rank(item: Dict) -> float:
            score = item.get("score", 0.5)
            
            # Boost if title mentions company
            if company in item.get("title", "").lower():
                score += 0.2
            
            # Boost if content mentions role
            if role in item.get("content", "").lower():
                score += 0.1
            
            # Boost recent content
            try:
                date_str = item.get("date", "")
                if date_str:
                    # Simple recency check
                    if "2024" in date_str or "2025" in date_str:
                        score += 0.15
            except:
                pass
            
            # Boost Glassdoor (structured data)
            if item.get("source") == "glassdoor":
                score += 0.1
            
            # Boost YouTube with transcripts (rich content)
            if item.get("source") == "youtube" and item.get("metadata", {}).get("has_transcript"):
                score += 0.15
            
            return score
        
        for item in content:
            item["rank_score"] = compute_rank(item)
        
        return sorted(content, key=lambda x: x["rank_score"], reverse=True)
    
    async def aggregate(
        self, 
        job_details: Dict,
        max_items: int = 50,
        timeout_seconds: int = 180
    ) -> Tuple[List[Dict], Dict]:
        """
        Main entry point: Aggregate content from all sources
        
        Returns:
            - List of normalized, deduplicated, ranked content
            - Stats dict with source counts
        """
        # Gather from all sources
        raw_data = await self.gather_all_sources(job_details, timeout_seconds=timeout_seconds)
        reddit_count = len(raw_data.get('reddit', []))
        youtube_count = len(raw_data.get('youtube', []))
        glassdoor_count = len(raw_data.get('glassdoor', []))
        logger.info(f"After gather: reddit={reddit_count}, youtube={youtube_count}, glassdoor={glassdoor_count}")
        
        # Normalize
        normalized = self.normalize_content(raw_data)
        logger.info(f"After normalize: {len(normalized)} items")
        
        # Log sample of normalized content to debug
        if normalized:
            sample = normalized[0]
            logger.debug(f"Sample normalized item: id={sample.get('id')}, title={sample.get('title', '')[:50]}, content_len={len(sample.get('content', ''))}, source={sample.get('source')}")
        
        # Deduplicate
        unique = self.deduplicate(normalized)
        logger.info(f"After deduplicate: {len(unique)} items (removed {len(normalized) - len(unique)} duplicates)")
        
        # Rank
        ranked = self.rank_content(unique, job_details)
        logger.info(f"After rank: {len(ranked)} items")
        
        # Limit
        final = ranked[:max_items]
        logger.info(f"After limit (max={max_items}): {len(final)} items")
        
        # Compute stats
        stats = {
            "total_sources": len([s for s, status in self.sources_status.items() if status == "success"]),
            "total_items": len(final),
            "by_source": {
                "reddit": len([i for i in final if i["source"] == "reddit"]),
                "youtube": len([i for i in final if i["source"] == "youtube"]),
                "glassdoor": len([i for i in final if i["source"] == "glassdoor"]),
            },
            "sources_status": self.sources_status,
        }
        
        logger.info(f"Aggregation complete: {stats}")
        
        return final, stats


# Convenience function
async def aggregate_content(job_details: Dict, max_items: int = 50, timeout_seconds: int = 180) -> Tuple[List[Dict], Dict]:
    """Aggregate interview content from all sources"""
    aggregator = ContentAggregator()
    return await aggregator.aggregate(job_details, max_items, timeout_seconds=timeout_seconds)

