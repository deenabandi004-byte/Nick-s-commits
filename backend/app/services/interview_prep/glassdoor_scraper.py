"""
Glassdoor Scraper for Interview Prep 2.0
Extracts interview reviews and questions

NOTE: Glassdoor scraping is in a legal gray area. 
Consider their robots.txt and ToS. Use responsibly with caching.
"""
import asyncio
import aiohttp
import re
import json
import hashlib
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
import logging

logger = logging.getLogger(__name__)

# Simple in-memory cache (replace with Redis in production)
_glassdoor_cache = {}
CACHE_TTL_HOURS = 24


class GlassdoorScraper:
    """Scrapes Glassdoor for interview reviews"""
    
    BASE_URL = "https://www.glassdoor.com"
    
    # Rotate user agents
    USER_AGENTS = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    ]
    
    def __init__(self, proxy_url: Optional[str] = None):
        self.proxy = proxy_url
        self._ua_index = 0
    
    def _get_user_agent(self) -> str:
        ua = self.USER_AGENTS[self._ua_index % len(self.USER_AGENTS)]
        self._ua_index += 1
        return ua
    
    def _get_cache_key(self, company: str, role: str = "") -> str:
        key = f"glassdoor:{company.lower()}:{role.lower()}"
        return hashlib.md5(key.encode()).hexdigest()
    
    def _check_cache(self, cache_key: str) -> Optional[List[Dict]]:
        if cache_key in _glassdoor_cache:
            entry = _glassdoor_cache[cache_key]
            if datetime.now() - entry["timestamp"] < timedelta(hours=CACHE_TTL_HOURS):
                logger.info(f"Glassdoor cache hit: {cache_key}")
                return entry["data"]
        return None
    
    def _set_cache(self, cache_key: str, data: List[Dict]):
        _glassdoor_cache[cache_key] = {
            "data": data,
            "timestamp": datetime.now()
        }
    
    async def search_company(self, company_name: str) -> Optional[str]:
        """Search for company and get their Glassdoor URL slug"""
        search_url = f"{self.BASE_URL}/Search/results.htm"
        params = {
            "keyword": company_name,
            "locT": "",
            "locId": "",
        }
        
        headers = {
            "User-Agent": self._get_user_agent(),
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    search_url, 
                    params=params, 
                    headers=headers,
                    proxy=self.proxy,
                    timeout=15,
                    allow_redirects=True
                ) as resp:
                    if resp.status == 200:
                        html = await resp.text()
                        # Look for company link in results
                        soup = BeautifulSoup(html, 'html.parser')
                        
                        # Find company overview links
                        company_links = soup.find_all('a', href=re.compile(r'/Overview/Working-at'))
                        
                        for link in company_links:
                            href = link.get('href', '')
                            # Extract company slug
                            match = re.search(r'Working-at-([^-]+-EI_IE\d+)', href)
                            if match:
                                return match.group(1)
                        
                        return None
                    else:
                        logger.warning(f"Glassdoor search failed: {resp.status}")
                        return None
        except Exception as e:
            logger.error(f"Glassdoor search error: {e}")
            return None
    
    async def get_interview_reviews(
        self, 
        company_slug: str,
        job_title: Optional[str] = None,
        max_pages: int = 3
    ) -> List[Dict]:
        """Fetch interview reviews for a company"""
        
        reviews = []
        
        for page in range(1, max_pages + 1):
            # Build interview reviews URL
            # Format: /Interview/Company-Interview-Questions-EI_IE12345.htm
            interview_url = f"{self.BASE_URL}/Interview/{company_slug}.htm"
            
            if page > 1:
                interview_url = f"{self.BASE_URL}/Interview/{company_slug}_P{page}.htm"
            
            if job_title:
                # Add job title filter
                job_slug = job_title.replace(" ", "-").lower()
                interview_url += f"?filter.jobTitleFTS={job_slug}"
            
            headers = {
                "User-Agent": self._get_user_agent(),
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": self.BASE_URL,
            }
            
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        interview_url,
                        headers=headers,
                        proxy=self.proxy,
                        timeout=15
                    ) as resp:
                        if resp.status == 200:
                            html = await resp.text()
                            page_reviews = self._parse_interview_page(html)
                            reviews.extend(page_reviews)
                            
                            if len(page_reviews) == 0:
                                break  # No more results
                            
                            # Rate limiting
                            await asyncio.sleep(1.5)
                        else:
                            logger.warning(f"Glassdoor page {page} failed: {resp.status}")
                            break
                            
            except Exception as e:
                logger.error(f"Glassdoor fetch error: {e}")
                break
        
        return reviews
    
    def _parse_interview_page(self, html: str) -> List[Dict]:
        """Parse Glassdoor interview review page"""
        reviews = []
        soup = BeautifulSoup(html, 'html.parser')
        
        # Find interview review containers
        # Note: Glassdoor's HTML structure changes frequently - may need updates
        review_containers = soup.find_all('div', {'data-test': 'InterviewCard'})
        
        if not review_containers:
            # Try alternative selectors
            review_containers = soup.find_all('li', class_=re.compile(r'interview'))
        
        if not review_containers:
            # Try another common pattern
            review_containers = soup.find_all('div', class_=re.compile(r'InterviewReview|interview'))
        
        for container in review_containers:
            try:
                review = self._parse_single_review(container)
                if review:
                    reviews.append(review)
            except Exception as e:
                logger.debug(f"Error parsing review: {e}")
                continue
        
        return reviews
    
    def _parse_single_review(self, container) -> Optional[Dict]:
        """Parse a single interview review container"""
        review = {
            "source": "glassdoor",
            "questions": [],
            "experience": "",
            "difficulty": "",
            "outcome": "",
            "date": "",
            "job_title": "",
            "interview_process": "",
        }
        
        # Job title
        title_elem = container.find(['span', 'a'], class_=re.compile(r'title|job'))
        if title_elem:
            review["job_title"] = title_elem.get_text(strip=True)
        
        # Date
        date_elem = container.find(['span', 'time'], class_=re.compile(r'date|time'))
        if date_elem:
            review["date"] = date_elem.get_text(strip=True)
        
        # Outcome (Accepted/Declined/No Offer)
        outcome_elem = container.find(text=re.compile(r'Accepted|Declined|No Offer', re.I))
        if outcome_elem:
            review["outcome"] = outcome_elem.strip()
        else:
            # Try finding in parent
            outcome_text = container.get_text()
            outcome_match = re.search(r'(Accepted|Declined|No Offer)', outcome_text, re.I)
            if outcome_match:
                review["outcome"] = outcome_match.group(1)
        
        # Difficulty
        difficulty_elem = container.find(text=re.compile(r'Easy|Average|Difficult|Hard', re.I))
        if difficulty_elem:
            review["difficulty"] = difficulty_elem.strip()
        else:
            difficulty_text = container.get_text()
            difficulty_match = re.search(r'(Easy|Average|Difficult|Hard)', difficulty_text, re.I)
            if difficulty_match:
                review["difficulty"] = difficulty_match.group(1)
        
        # Experience/Process description
        desc_elem = container.find(['p', 'div'], class_=re.compile(r'description|content|review'))
        if desc_elem:
            review["experience"] = desc_elem.get_text(strip=True)[:2000]
        else:
            # Try to get all text and use first substantial paragraph
            all_text = container.get_text()
            paragraphs = [p.strip() for p in all_text.split('\n') if len(p.strip()) > 50]
            if paragraphs:
                review["experience"] = paragraphs[0][:2000]
        
        # Interview questions
        questions_section = container.find(['div', 'ul'], class_=re.compile(r'question'))
        if questions_section:
            question_items = questions_section.find_all(['li', 'p'])
            for item in question_items[:10]:  # Limit questions
                q_text = item.get_text(strip=True)
                if q_text and len(q_text) > 10:
                    review["questions"].append(q_text)
        else:
            # Try to find questions in text (look for question marks)
            all_text = container.get_text()
            # Look for patterns like "Q:", "Question:", or sentences ending with ?
            question_patterns = re.findall(r'(?:Q:|Question:)\s*([^\.\n]{20,200})', all_text)
            question_patterns.extend(re.findall(r'([^\.\n]{20,200}\?)', all_text))
            for q in question_patterns[:10]:
                q_clean = q.strip()
                if len(q_clean) > 10:
                    review["questions"].append(q_clean)
        
        # Only return if we have meaningful content
        if review["experience"] or review["questions"]:
            return review
        
        return None
    
    async def search_glassdoor(
        self, 
        job_details: Dict,
        timeout_seconds: int = 45
    ) -> List[Dict]:
        """
        Main entry point: Search Glassdoor for interview reviews
        
        Returns list of reviews matching content aggregator interface
        """
        company = job_details.get("company_name", "")
        role = job_details.get("job_title", "")
        
        if not company:
            return []
        
        # Check cache first
        cache_key = self._get_cache_key(company, role)
        cached = self._check_cache(cache_key)
        if cached is not None:
            return cached
        
        logger.info(f"Starting Glassdoor search for {company}")
        
        try:
            # Search for company
            company_slug = await asyncio.wait_for(
                self.search_company(company),
                timeout=15
            )
            
            if not company_slug:
                logger.warning(f"Company not found on Glassdoor: {company}")
                return []
            
            # Get reviews
            reviews = await asyncio.wait_for(
                self.get_interview_reviews(company_slug, job_title=role),
                timeout=timeout_seconds - 15
            )
            
            # Cache results
            self._set_cache(cache_key, reviews)
            
            logger.info(f"Found {len(reviews)} Glassdoor reviews for {company}")
            return reviews
            
        except asyncio.TimeoutError:
            logger.warning("Glassdoor search timed out")
            return []
        except Exception as e:
            logger.error(f"Glassdoor search failed: {e}")
            return []


# Convenience function
async def search_glassdoor(job_details: Dict, timeout_seconds: int = 45) -> List[Dict]:
    """Search Glassdoor for interview reviews"""
    scraper = GlassdoorScraper()
    return await scraper.search_glassdoor(job_details, timeout_seconds=timeout_seconds)

