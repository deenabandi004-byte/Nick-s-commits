# Interview Prep 2.0 - Gap Analysis

**Date:** January 2025  
**Goal:** Upgrade from single-source (Reddit-only) to multi-source interview prep with personalization

---

## Executive Summary

### Current State
- ✅ **Reddit scraper** - Working
- ✅ **Basic content processor** - Processes Reddit posts with OpenAI
- ✅ **PDF generator** - Creates 5-6 page PDFs
- ❌ **Single source only** - Only Reddit data
- ❌ **No personalization** - Generic prep for all users
- ❌ **No question extraction** - Questions embedded in text
- ❌ **No source attribution** - Can't see where info came from

### Target State (from Sample PDF)
- ✅ **Multi-source aggregation** - 47 sources (25 Reddit, 12 YouTube, 18 Glassdoor)
- ✅ **Personalized fit analysis** - "87% fit score" based on user profile
- ✅ **Story bank** - Personalized STAR stories from user's resume
- ✅ **Source badges** - 📺 YouTube, 💬 Reddit, ⭐ Glassdoor
- ✅ **Enhanced questions** - Categorized with frequency counts
- ✅ **Real interview experiences** - With source attribution
- ✅ **Compensation intelligence** - Data from multiple sources

---

## Detailed Comparison

### 1. Data Sources

| Feature | Current | Target | Gap |
|---------|---------|--------|-----|
| Reddit | ✅ Working | ✅ Required | None |
| YouTube | ❌ Missing | ✅ Required | **NEW** |
| Glassdoor | ❌ Missing | ✅ Required | **NEW** |
| Company Page | ❌ Missing | ⚠️ Optional | Nice-to-have |
| Source Count | 1 source | 47 sources | **Major gap** |

**Impact:** Current system only has Reddit data. Target needs 3x more sources.

---

### 2. Content Processing

| Feature | Current | Target | Gap |
|---------|---------|--------|-----|
| Basic extraction | ✅ Works | ✅ Required | None |
| Question extraction | ❌ Embedded | ✅ Categorized | **NEW** |
| Question frequency | ❌ No | ✅ Yes | **NEW** |
| Source attribution | ❌ No | ✅ Yes | **NEW** |
| Deduplication | ❌ No | ✅ Yes | **NEW** |
| Content ranking | ❌ No | ✅ Yes | **NEW** |

**Impact:** Current system doesn't extract or categorize questions. Target has sophisticated question extraction with frequency counts.

---

### 3. Personalization

| Feature | Current | Target | Gap |
|---------|---------|--------|-----|
| Fit analysis | ❌ No | ✅ 87% fit score | **NEW** |
| Strengths/Gaps | ❌ No | ✅ Yes | **NEW** |
| Story bank | ❌ No | ✅ 3 STAR stories | **NEW** |
| Resume integration | ❌ No | ✅ Yes | **NEW** |
| Prep plan customization | ❌ Generic | ✅ Personalized | **NEW** |

**Impact:** Current system is one-size-fits-all. Target is fully personalized based on user's resume and profile.

---

### 4. PDF Output

| Feature | Current | Target | Gap |
|---------|---------|--------|-----|
| Cover page | ✅ Basic | ✅ Enhanced | Minor |
| Source count | ❌ No | ✅ "47 sources" | **NEW** |
| Fit score section | ❌ No | ✅ Yes | **NEW** |
| Story bank section | ❌ No | ✅ Yes | **NEW** |
| Source badges | ❌ No | ✅ Yes | **NEW** |
| Question frequency | ❌ No | ✅ Yes | **NEW** |
| Real experiences | ✅ Basic | ✅ Enhanced | Minor |

**Impact:** Current PDF is generic. Target PDF is personalized with source attribution.

---

## Implementation Requirements

### Phase 1: YouTube Scraper (Week 1)
**Priority: HIGH** - High impact, medium complexity

**Files to create:**
- `backend/app/services/interview_prep/youtube_scraper.py` (NEW)
- `backend/tests/test_youtube_scraper.py` (NEW)

**Dependencies:**
```bash
pip install google-api-python-client youtube-transcript-api
```

**Environment variables:**
```bash
YOUTUBE_API_KEY=your_key_here
```

**Key features:**
- Search YouTube for interview experience videos
- Extract transcripts
- Score relevance
- Return format matching Reddit scraper interface

**Estimated effort:** 2-3 days

---

### Phase 2: Glassdoor Scraper (Week 2)
**Priority: HIGH** - High impact, high complexity (legal gray area)

**Files to create:**
- `backend/app/services/interview_prep/glassdoor_scraper.py` (NEW)
- `backend/tests/test_glassdoor_scraper.py` (NEW)

**Dependencies:**
```bash
pip install beautifulsoup4 aiohttp
```

**Key features:**
- Search for company on Glassdoor
- Scrape interview reviews
- Extract questions and outcomes
- Caching (24-hour TTL)
- Rate limiting

**Legal considerations:**
- Respect robots.txt
- Use caching aggressively
- Consider manual data collection as alternative

**Estimated effort:** 3-4 days

---

### Phase 3: Content Aggregator (Week 2)
**Priority: HIGH** - Required for multi-source

**Files to create:**
- `backend/app/services/interview_prep/content_aggregator.py` (NEW)
- `backend/tests/test_content_aggregator.py` (NEW)

**Key features:**
- Gather from all sources in parallel
- Normalize content format
- Deduplicate content
- Rank by relevance
- Return unified format

**Estimated effort:** 2 days

---

### Phase 4: Question Extractor (Week 3)
**Priority: MEDIUM** - Enhances quality

**Files to create:**
- `backend/app/services/interview_prep/question_extractor.py` (NEW)
- `backend/tests/test_question_extractor.py` (NEW)

**Key features:**
- Extract questions using regex + AI
- Categorize (behavioral, technical, system design, etc.)
- Count frequency
- Add hints and context

**Estimated effort:** 2 days

---

### Phase 5: Personalization Engine (Week 3)
**Priority: HIGH** - Major differentiator

**Files to create:**
- `backend/app/services/interview_prep/personalization.py` (NEW)
- `backend/tests/test_personalization.py` (NEW)

**Key features:**
- Get user context (resume, profile, history)
- Generate fit analysis (0-100 score)
- Generate STAR stories from resume
- Customize prep plan based on gaps

**Estimated effort:** 3-4 days

---

### Phase 6: Updated Content Processor (Week 3)
**Priority: HIGH** - Required for new flow

**Files to update:**
- `backend/app/services/interview_prep/content_processor.py` (UPDATE)

**Key changes:**
- Accept aggregated content (not just Reddit)
- Include source attribution in prompt
- Include pre-extracted questions
- Include personalization data
- Update prompt structure

**Estimated effort:** 1-2 days

---

### Phase 7: Updated PDF Generator (Week 4)
**Priority: HIGH** - Required for new output

**Files to update:**
- `backend/app/services/interview_prep/pdf_generator.py` (UPDATE)

**Key changes:**
- Add source count to cover page
- Add source badges (📺 💬 ⭐)
- Add fit score section (if personalized)
- Add story bank section (if personalized)
- Show question frequency
- Enhanced source attribution

**Estimated effort:** 2-3 days

---

### Phase 8: Route Updates (Week 4)
**Priority: HIGH** - Wire everything together

**Files to update:**
- `backend/app/routes/interview_prep.py` (UPDATE)

**Key changes:**
- Replace Reddit-only flow with aggregator
- Add personalization step
- Pass personalization to content processor
- Update status messages

**Estimated effort:** 1 day

---

## Implementation Roadmap

### Week 1: YouTube Integration
- [ ] Day 1-2: Implement YouTube scraper
- [ ] Day 3: Write tests
- [ ] Day 4: Integration testing
- [ ] Day 5: Deploy behind feature flag

### Week 2: Glassdoor + Aggregator
- [ ] Day 1-2: Implement Glassdoor scraper
- [ ] Day 3: Implement content aggregator
- [ ] Day 4: Integration testing
- [ ] Day 5: Deploy to 10% of users

### Week 3: Personalization
- [ ] Day 1-2: Implement question extractor
- [ ] Day 3-4: Implement personalization engine
- [ ] Day 5: Update content processor

### Week 4: PDF + Integration
- [ ] Day 1-2: Update PDF generator
- [ ] Day 3: Update routes
- [ ] Day 4: End-to-end testing
- [ ] Day 5: Full rollout

---

## Risk Assessment

### High Risk
1. **Glassdoor scraping** - Legal gray area, may get blocked
   - **Mitigation:** Aggressive caching, consider manual data collection
   
2. **YouTube API quota** - May hit rate limits
   - **Mitigation:** Cache results, limit queries per request

3. **Generation time** - Multi-source may be slower
   - **Mitigation:** Parallel fetching, timeouts, progress updates

### Medium Risk
1. **Personalization quality** - AI-generated stories may be generic
   - **Mitigation:** Test with real resumes, iterate on prompts

2. **PDF size** - More content = larger PDFs
   - **Mitigation:** Optimize images, compress content

---

## Success Metrics

### Quality Metrics
- [ ] Average source count: 30+ sources per prep
- [ ] Personalization rate: 60%+ of users have resumes
- [ ] Question extraction: 20+ questions per prep
- [ ] Fit score accuracy: User feedback on relevance

### Performance Metrics
- [ ] Generation time: < 60 seconds (target: < 45 seconds)
- [ ] Cache hit rate: > 70% for repeat companies
- [ ] Error rate: < 5%

### User Metrics
- [ ] User satisfaction: Survey after using prep
- [ ] Completion rate: % of preps downloaded
- [ ] Reuse rate: % of users creating multiple preps

---

## Quick Start

### Immediate Next Steps

1. **Get YouTube API Key**
   ```bash
   # Go to https://console.cloud.google.com/
   # Enable YouTube Data API v3
   # Create API key
   export YOUTUBE_API_KEY=your_key_here
   ```

2. **Start with YouTube Scraper** (lowest risk, high impact)
   - Follow implementation guide Phase 1
   - Test with IBM example
   - Deploy behind feature flag

3. **Test with Sample Company**
   ```python
   job_details = {
       "company_name": "IBM",
       "job_title": "Software Developer Intern",
       "level": "Intern",
       "role_category": "Software Engineering"
   }
   ```

---

## Questions to Resolve

1. **Glassdoor approach:** Scrape or manual collection?
   - Recommendation: Start with scraping + aggressive caching, have manual fallback

2. **Personalization opt-in:** Always on or opt-in?
   - Recommendation: Always on if resume exists, show message if not

3. **Feature flag strategy:** Gradual rollout or all at once?
   - Recommendation: Gradual (10% → 25% → 50% → 100%)

4. **Error handling:** What if one source fails?
   - Recommendation: Continue with available sources, show partial results

---

## Conclusion

The current implementation is a solid foundation but needs significant enhancement to match the target. The biggest gaps are:

1. **Multi-source data** (YouTube + Glassdoor)
2. **Personalization** (fit analysis + story bank)
3. **Enhanced question extraction**
4. **Source attribution in output**

**Estimated total effort:** 3-4 weeks for full implementation

**Recommended approach:** Start with YouTube (Week 1), then add Glassdoor + aggregator (Week 2), then personalization (Week 3), then polish (Week 4).

