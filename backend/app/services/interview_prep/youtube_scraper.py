"""
from dotenv import load_dotenv
load_dotenv()
YouTube Scraper for Interview Prep 2.0
Extracts interview experience videos and transcripts
"""
import asyncio
import aiohttp
import os
import re
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    TranscriptsDisabled, 
    NoTranscriptFound,
    VideoUnavailable
)
import logging

logger = logging.getLogger(__name__)

YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")
YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
YOUTUBE_VIDEO_URL = "https://www.googleapis.com/youtube/v3/videos"


class YouTubeScraper:
    """Scrapes YouTube for interview experience videos and transcripts"""
    
    def __init__(self):
        self.api_key = YOUTUBE_API_KEY
        if not self.api_key:
            logger.warning("YOUTUBE_API_KEY not set - YouTube scraping disabled")
    
    def build_search_queries(self, job_details: Dict) -> List[str]:
        """Build targeted search queries based on job details"""
        company = job_details.get("company_name", "")
        role = job_details.get("job_title", "")
        level = job_details.get("level", "")
        role_category = job_details.get("role_category", "Software Engineering")
        
        queries = []
        
        # High priority: Company + interview experience
        queries.append(f'"{company}" interview experience')
        queries.append(f'"{company}" interview process')
        
        # Role-specific
        if role:
            queries.append(f'"{company}" {role} interview')
            queries.append(f'{role} interview questions {company}')
        
        # Level-specific
        if level:
            if "intern" in level.lower():
                queries.append(f'"{company}" internship interview')
                queries.append(f'"{company}" intern interview experience')
            elif "senior" in level.lower():
                queries.append(f'"{company}" senior engineer interview')
        
        # Day in the life (for culture insights)
        queries.append(f'"day in the life" "{company}"')
        queries.append(f'working at "{company}"')
        
        # Role category specific
        if role_category == "Software Engineering":
            queries.append(f'"{company}" coding interview')
            queries.append(f'"{company}" technical interview')
            queries.append(f'"{company}" system design interview')
        elif role_category == "Consulting":
            queries.append(f'"{company}" case interview')
            queries.append(f'"{company}" consulting interview')
        elif role_category == "Finance":
            queries.append(f'"{company}" investment banking interview')
            queries.append(f'"{company}" finance interview')
        elif role_category == "Product Management":
            queries.append(f'"{company}" PM interview')
            queries.append(f'"{company}" product manager interview')
        
        # Mock interviews
        queries.append(f'"{company}" mock interview')
        
        # Recruiter tips
        queries.append(f'"{company}" recruiter tips')
        queries.append(f'how to get hired at "{company}"')
        
        return queries[:12]  # Limit to 12 queries to stay within API quota
    
    async def search_videos(
        self, 
        query: str, 
        max_results: int = 10,
        published_after: Optional[datetime] = None
    ) -> List[Dict]:
        """Search YouTube for videos matching query"""
        if not self.api_key:
            return []
        
        if published_after is None:
            published_after = datetime.now() - timedelta(days=365)
        
        params = {
            "part": "snippet",
            "q": query,
            "type": "video",
            "maxResults": max_results,
            "order": "relevance",
            "publishedAfter": published_after.isoformat() + "Z",
            "key": self.api_key,
            "videoDuration": "medium",  # 4-20 minutes - typical for interview vids
            "relevanceLanguage": "en",
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(YOUTUBE_SEARCH_URL, params=params, timeout=15) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return self._parse_search_results(data, query)
                    elif resp.status == 403:
                        logger.error("YouTube API quota exceeded")
                        return []
                    else:
                        logger.error(f"YouTube search error: {resp.status}")
                        return []
        except asyncio.TimeoutError:
            logger.warning(f"YouTube search timeout for query: {query}")
            return []
        except Exception as e:
            logger.error(f"YouTube search error: {e}")
            return []
    
    def _parse_search_results(self, data: Dict, query: str) -> List[Dict]:
        """Parse YouTube search API response"""
        videos = []
        for item in data.get("items", []):
            snippet = item.get("snippet", {})
            video_id = item.get("id", {}).get("videoId")
            
            if not video_id:
                continue
            
            videos.append({
                "video_id": video_id,
                "title": snippet.get("title", ""),
                "description": snippet.get("description", ""),
                "channel_title": snippet.get("channelTitle", ""),
                "published_at": snippet.get("publishedAt", ""),
                "thumbnail": snippet.get("thumbnails", {}).get("medium", {}).get("url", ""),
                "search_query": query,
                "source": "youtube",
            })
        
        return videos
    
    async def get_video_stats(self, video_ids: List[str]) -> Dict[str, Dict]:
        """Get view counts and other stats for videos"""
        if not self.api_key or not video_ids:
            return {}
        
        params = {
            "part": "statistics,contentDetails",
            "id": ",".join(video_ids[:50]),  # API limit
            "key": self.api_key,
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(YOUTUBE_VIDEO_URL, params=params, timeout=15) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        stats = {}
                        for item in data.get("items", []):
                            vid = item.get("id")
                            statistics = item.get("statistics", {})
                            stats[vid] = {
                                "view_count": int(statistics.get("viewCount", 0)),
                                "like_count": int(statistics.get("likeCount", 0)),
                                "comment_count": int(statistics.get("commentCount", 0)),
                                "duration": item.get("contentDetails", {}).get("duration", ""),
                            }
                        return stats
                    return {}
        except Exception as e:
            logger.error(f"Error fetching video stats: {e}")
            return {}
    
    def get_transcript(self, video_id: str, max_chars: int = 15000) -> Optional[str]:
        """Extract transcript from a YouTube video"""
        try:
            # Use the new API: create instance and call fetch()
            transcript_api = YouTubeTranscriptApi()
            fetched_transcript = transcript_api.fetch(video_id, languages=['en'])
            
            # FetchedTranscript is iterable and contains dict entries with 'text' key
            # Convert to list if needed, or iterate directly
            full_text = " ".join([entry.text for entry in fetched_transcript])
            
            # Clean up
            full_text = re.sub(r'\[.*?\]', '', full_text)  # Remove [Music], [Applause], etc.
            full_text = re.sub(r'\s+', ' ', full_text).strip()
            
            return full_text[:max_chars]
        
        except TranscriptsDisabled:
            logger.debug(f"Transcripts disabled for video {video_id}")
            return None
        except NoTranscriptFound:
            logger.debug(f"No English transcript for video {video_id}")
            return None
        except VideoUnavailable:
            logger.debug(f"Video unavailable: {video_id}")
            return None
        except Exception as e:
            logger.error(f"Transcript error for {video_id}: {e}")
            return None
    
    async def get_transcripts_parallel(
        self, 
        video_ids: List[str], 
        max_concurrent: int = 5
    ) -> Dict[str, str]:
        """Fetch transcripts in parallel using thread pool"""
        transcripts = {}
        
        # Use thread pool since youtube_transcript_api is synchronous
        loop = asyncio.get_event_loop()
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def fetch_one(vid):
            async with semaphore:
                # Run sync function in thread pool
                transcript = await loop.run_in_executor(
                    None, self.get_transcript, vid
                )
                if transcript:
                    transcripts[vid] = transcript
        
        await asyncio.gather(*[fetch_one(vid) for vid in video_ids])
        return transcripts
    
    def score_video_relevance(self, video: Dict, job_details: Dict) -> float:
        """Score a video's relevance to the job (0-1)"""
        score = 0.0
        company = job_details.get("company_name", "").lower()
        role = job_details.get("job_title", "").lower()
        
        title = video.get("title", "").lower()
        description = video.get("description", "").lower()
        
        # Company name in title (high weight)
        if company in title:
            score += 0.4
        elif company in description:
            score += 0.2
        
        # Interview-related keywords
        interview_keywords = ["interview", "hired", "offer", "rejected", "process"]
        for kw in interview_keywords:
            if kw in title:
                score += 0.15
                break
        
        # Role match
        role_words = role.split()
        for word in role_words:
            if len(word) > 3 and word in title:
                score += 0.1
        
        # Recency boost (newer = better)
        try:
            pub_date = datetime.fromisoformat(video.get("published_at", "").replace("Z", ""))
            days_old = (datetime.now() - pub_date).days
            if days_old < 90:
                score += 0.15
            elif days_old < 180:
                score += 0.1
            elif days_old < 365:
                score += 0.05
        except:
            pass
        
        # View count boost
        view_count = video.get("view_count", 0)
        if view_count > 100000:
            score += 0.1
        elif view_count > 10000:
            score += 0.05
        
        return min(score, 1.0)
    
    async def search_youtube(
        self, 
        job_details: Dict, 
        max_videos: int = 15,
        timeout_seconds: int = 30
    ) -> List[Dict]:
        """
        Main entry point: Search YouTube for interview content
        
        Returns list of videos with transcripts, matching reddit_scraper interface
        """
        if not self.api_key:
            logger.warning("YouTube API key not configured, skipping YouTube search")
            return []
        
        logger.info(f"Starting YouTube search for {job_details.get('company_name')}")
        
        try:
            # Build queries
            queries = self.build_search_queries(job_details)
            
            # Search in parallel
            all_videos = []
            search_tasks = [self.search_videos(q, max_results=8) for q in queries]
            
            results = await asyncio.wait_for(
                asyncio.gather(*search_tasks, return_exceptions=True),
                timeout=timeout_seconds
            )
            
            for result in results:
                if isinstance(result, list):
                    all_videos.extend(result)
            
            # Deduplicate by video_id
            seen_ids = set()
            unique_videos = []
            for video in all_videos:
                vid = video.get("video_id")
                if vid and vid not in seen_ids:
                    seen_ids.add(vid)
                    unique_videos.append(video)
            
            logger.info(f"Found {len(unique_videos)} unique videos")
            
            # Get stats for all videos
            video_ids = [v["video_id"] for v in unique_videos]
            stats = await self.get_video_stats(video_ids)
            
            # Add stats to videos
            for video in unique_videos:
                vid = video["video_id"]
                if vid in stats:
                    video.update(stats[vid])
            
            # Score and sort by relevance
            for video in unique_videos:
                video["relevance_score"] = self.score_video_relevance(video, job_details)
            
            unique_videos.sort(key=lambda x: x["relevance_score"], reverse=True)
            
            # Take top videos
            top_videos = unique_videos[:max_videos]
            
            # OPTIMIZATION 3: Skip transcript fetching - it's failing and slow
            # Just use video metadata (title, description) instead
            videos_with_metadata = []
            for video in top_videos:
                # Use description as content instead of transcript
                video["transcript"] = video.get("description", "")[:2000]  # Use description as fallback
                video["has_transcript"] = False  # Mark as no transcript since we're skipping
                videos_with_metadata.append(video)
            
            logger.info(f"Returning {len(videos_with_metadata)} videos (transcripts skipped for performance)")
            
            return videos_with_metadata
            
        except asyncio.TimeoutError:
            logger.warning("YouTube search timed out")
            return []
        except Exception as e:
            logger.error(f"YouTube search failed: {e}")
            return []


# Convenience function matching reddit_scraper interface
async def search_youtube(job_details: Dict, timeout_seconds: int = 30) -> List[Dict]:
    """Search YouTube for interview content - matches reddit_scraper interface"""
    scraper = YouTubeScraper()
    return await scraper.search_youtube(job_details, timeout_seconds=timeout_seconds)

