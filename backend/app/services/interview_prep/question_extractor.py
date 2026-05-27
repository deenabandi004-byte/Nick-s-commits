"""
Question Extractor for Interview Prep 2.0
Extracts and categorizes interview questions from aggregated content
"""
import re
import json
from typing import Dict, List, Optional
from collections import defaultdict
from app.services.openai_client import get_openai_client
import logging

logger = logging.getLogger(__name__)


class QuestionExtractor:
    """Extracts and categorizes interview questions from content"""
    
    # Patterns to identify questions in text
    QUESTION_PATTERNS = [
        r'(?:asked|question|they asked)[:\s]+["\']?([^"\'\.]{20,200})["\']?',
        r'(?:Q:|Question:)\s*(.{20,200})',
        r'"([^"]{20,200}\?)"',
        r'(?:implement|design|write|explain|describe|tell me about)\s+(.{10,150})',
    ]
    
    # Keywords indicating question categories
    CATEGORY_KEYWORDS = {
        "behavioral": [
            "tell me about", "describe a time", "give an example", 
            "how do you handle", "why do you want", "what would you do",
            "strength", "weakness", "challenge", "conflict", "failure",
            "leadership", "teamwork", "difficult situation"
        ],
        "technical_coding": [
            "implement", "write code", "algorithm", "data structure",
            "leetcode", "coding", "function", "array", "string", "tree",
            "graph", "dynamic programming", "recursion", "complexity",
            "binary search", "hash", "linked list", "stack", "queue"
        ],
        "system_design": [
            "design", "architecture", "scale", "distributed", "database",
            "cache", "load balancer", "microservice", "api", "system",
            "million users", "high availability", "throughput"
        ],
        "technical_concepts": [
            "explain", "difference between", "what is", "how does",
            "compare", "trade-off", "pros and cons", "when would you use"
        ],
        "company_specific": [
            "why", "company", "product", "mission", "culture", "values"
        ],
    }
    
    def __init__(self):
        self.client = get_openai_client()
    
    def extract_questions_regex(self, content: str) -> List[str]:
        """Extract questions using regex patterns"""
        questions = []
        
        for pattern in self.QUESTION_PATTERNS:
            matches = re.findall(pattern, content, re.IGNORECASE)
            questions.extend(matches)
        
        # Also find sentences ending with ?
        sentences = re.split(r'[.!]\s+', content)
        for sentence in sentences:
            if sentence.strip().endswith('?') and len(sentence) > 20:
                questions.append(sentence.strip())
        
        # Deduplicate and clean
        unique = list(set(questions))
        cleaned = [q.strip().strip('"\'') for q in unique if len(q) > 15]
        
        return cleaned[:50]  # Limit
    
    def categorize_question(self, question: str) -> str:
        """Categorize a single question based on keywords"""
        q_lower = question.lower()
        
        scores = defaultdict(int)
        for category, keywords in self.CATEGORY_KEYWORDS.items():
            for keyword in keywords:
                if keyword in q_lower:
                    scores[category] += 1
        
        if scores:
            return max(scores, key=scores.get)
        return "general"
    
    def extract_questions_with_ai(
        self, 
        content: List[Dict],
        job_details: Dict
    ) -> Dict[str, List[Dict]]:
        """
        Use AI to extract and categorize questions from content
        
        Returns dict with categories as keys and question objects as values
        """
        if not self.client:
            logger.warning("OpenAI client not available, using fallback extraction")
            return self._fallback_extraction(content, job_details)
        
        # Prepare content for AI
        content_text = self._prepare_content_for_ai(content)
        
        company = job_details.get("company_name", "Unknown")
        role = job_details.get("job_title", "Unknown")
        role_category = job_details.get("role_category", "Software Engineering")
        
        prompt = f"""Extract interview questions from the following content about {company} {role} interviews.

Content from multiple sources (Reddit, YouTube, Glassdoor):
{content_text}

Extract ALL interview questions mentioned, including:
1. Behavioral questions (teamwork, challenges, motivation)
2. Technical coding questions (algorithms, data structures, implementation)
3. System design questions (architecture, scaling, trade-offs)
4. Technical concept questions (explain X, difference between Y and Z)
5. Company-specific questions (why {company}, product knowledge)

For each question, provide:
- The exact question or a close paraphrase
- Which source type it came from (reddit/youtube/glassdoor)
- How many times it was mentioned (frequency)
- Any hints or context about what interviewers are looking for
- Difficulty level (easy/medium/hard)

Respond in JSON format:
{{
    "behavioral": [
        {{
            "question": "Tell me about a time you faced a challenge...",
            "source": "glassdoor",
            "frequency": 5,
            "hint": "They want to see problem-solving and resilience",
            "difficulty": "medium"
        }}
    ],
    "technical_coding": [...],
    "system_design": [...],
    "technical_concepts": [...],
    "company_specific": [...],
    "real_questions": [
        {{
            "question": "Exact question from interview",
            "source": "reddit",
            "context": "Asked during phone screen",
            "year": "2024"
        }}
    ]
}}

Focus on questions that are specific to {company} or commonly asked there.
Include frequency counts where multiple sources mention the same question.
For {role_category} roles, prioritize relevant technical questions.
"""
        
        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are an expert at extracting and categorizing interview questions. Always respond with valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=4000,
            )
            
            result_text = response.choices[0].message.content
            
            # Parse JSON from response
            json_match = re.search(r'\{[\s\S]*\}', result_text)
            if json_match:
                questions = json.loads(json_match.group())
                return questions
            else:
                logger.error("Could not parse AI response as JSON")
                return self._fallback_extraction(content, job_details)
                
        except json.JSONDecodeError as e:
            logger.error(f"JSON parse error in question extraction: {e}")
            return self._fallback_extraction(content, job_details)
        except Exception as e:
            logger.error(f"AI question extraction failed: {e}")
            return self._fallback_extraction(content, job_details)
    
    def _prepare_content_for_ai(self, content: List[Dict], max_chars: int = 30000) -> str:
        """Prepare content for AI processing, respecting token limits"""
        parts = []
        total_chars = 0
        
        for item in content:
            source = item.get("source", "unknown")
            title = item.get("title", "")
            body = item.get("content", "")[:3000]  # Limit per item
            questions = item.get("questions", [])
            
            part = f"[{source.upper()}] {title}\n{body}"
            if questions:
                part += f"\nQuestions mentioned: {', '.join(questions[:5])}"
            
            if total_chars + len(part) > max_chars:
                break
            
            parts.append(part)
            total_chars += len(part)
        
        return "\n\n---\n\n".join(parts)
    
    def _fallback_extraction(self, content: List[Dict], job_details: Dict) -> Dict:
        """Fallback extraction using regex when AI fails"""
        questions = {
            "behavioral": [],
            "technical_coding": [],
            "system_design": [],
            "technical_concepts": [],
            "company_specific": [],
            "real_questions": [],
        }
        
        all_text = " ".join([item.get("content", "") for item in content])
        extracted = self.extract_questions_regex(all_text)
        
        for q in extracted:
            category = self.categorize_question(q)
            if category in questions:
                questions[category].append({
                    "question": q,
                    "source": "mixed",
                    "frequency": 1,
                    "hint": "",
                    "difficulty": "medium"
                })
        
        # Also include pre-extracted Glassdoor questions
        for item in content:
            if item.get("source") == "glassdoor":
                for q in item.get("questions", []):
                    questions["real_questions"].append({
                        "question": q,
                        "source": "glassdoor",
                        "context": f"From {item.get('metadata', {}).get('job_title', 'interview')}",
                        "year": "2024"
                    })
        
        return questions
    
    def enrich_questions(
        self, 
        questions: Dict[str, List[Dict]], 
        job_details: Dict
    ) -> Dict[str, List[Dict]]:
        """Add additional context and scoring to extracted questions"""
        role_category = job_details.get("role_category", "Software Engineering")
        
        # Sort by frequency within each category
        for category in questions:
            if isinstance(questions[category], list):
                questions[category].sort(
                    key=lambda x: x.get("frequency", 1) if isinstance(x, dict) else 0,
                    reverse=True
                )
        
        # Add role-specific relevance
        priority_categories = {
            "Software Engineering": ["technical_coding", "system_design"],
            "Consulting": ["behavioral", "company_specific"],
            "Finance": ["technical_concepts", "behavioral"],
            "Product Management": ["behavioral", "system_design"],
            "Data Science": ["technical_coding", "technical_concepts"],
        }
        
        questions["_metadata"] = {
            "priority_categories": priority_categories.get(role_category, ["behavioral", "technical_coding"]),
            "total_questions": sum(len(v) for v in questions.values() if isinstance(v, list)),
            "role_category": role_category,
        }
        
        return questions


# Convenience function
def extract_questions(content: List[Dict], job_details: Dict) -> Dict[str, List[Dict]]:
    """Extract and categorize interview questions from aggregated content"""
    extractor = QuestionExtractor()
    questions = extractor.extract_questions_with_ai(content, job_details)
    return extractor.enrich_questions(questions, job_details)

