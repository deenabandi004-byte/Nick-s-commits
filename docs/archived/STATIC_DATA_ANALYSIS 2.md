# Static Data & Missing Backend Connections Analysis

## Dashboard Tab (`connect-grow-hire/src/components/Dashboard.tsx`)

### ✅ Connected to Backend
- **Contact Count** - Fetched from Firebase (`firebaseApi.getContacts`)
- **Firm Count** - Fetched from API (`apiService.getFirmSearchHistory`)
- **Meeting Count** - Fetched from API (`apiService.getAllCoffeeChatPreps`)
- **Weekly Summary** - Calculated from activities (`calculateWeeklySummary`)
- **Streak Data** - Calculated from activities (`calculateStreak`)
- **Goal Progress** - Calculated from activities (`calculateGoalProgress`)
- **Activity Feed** - Fetched from Firebase (`firebaseApi.getActivities`)
- **Time Saved** - Calculated from contact/firm/meeting counts

### ❌ Static/Hardcoded Data (NOT Connected)

#### 1. **Outreach vs Replies Chart** (Lines 17-24, 832-848)
- **Location**: `timeSeriesData` constant
- **Issue**: Hardcoded monthly data (Jan-Jun) with static outreach/replies numbers
- **Should be**: Calculated from actual Gmail thread data, tracking:
  - Emails sent per month
  - Replies received per month
  - Response rate trends
- **Backend needed**: Endpoint to aggregate email stats by month from Gmail threads

#### 2. **Top Firms List** (Lines 26-32)
- **Location**: `topFirms` constant
- **Issue**: Hardcoded list of 5 firms (Goldman Sachs, McKinsey, etc.)
- **Should be**: Dynamic list based on:
  - Most searched firms
  - Firms with most contacts
  - Firms with highest reply rates
- **Backend needed**: Endpoint to get top firms by various metrics

#### 3. **AI Recommendations** (Lines 88-92)
- **Location**: `recommendations` constant
- **Issue**: Three hardcoded recommendation cards
- **Should be**: AI-generated recommendations based on:
  - Contacts needing follow-up (from Gmail threads)
  - Unread replies (from Gmail sync)
  - Similar users' next steps
  - Goal progress insights
- **Backend needed**: Endpoint to generate personalized recommendations

#### 4. **Recruiting Timeline** (Lines 94-101, 296-403)
- **Location**: `timelineData` constant and `RecruitingTimeline` component
- **Issue**: 
  - Hardcoded 6-month timeline phases
  - Hardcoded "current month" (March) and progress (40%)
- **Should be**: Dynamic timeline based on:
  - User's actual recruiting season dates
  - Progress calculated from activities/goals
  - Customizable milestones
- **Backend needed**: User settings for recruiting timeline, or calculate from activity dates

#### 5. **US Map with Firm Locations** (Lines 103-112, 405-450)
- **Location**: `firmLocations` constant and `USMap` component
- **Issue**: 
  - Hardcoded 8 firm locations with coordinates
  - Map is just a static SVG with no data
- **Should be**: Dynamic map showing:
  - Actual firm locations from searches
  - Contact density by location
  - Reply rates by region
- **Backend needed**: Aggregate firm/contact data by location

#### 6. **Replies Received KPI** (Line 809)
- **Location**: KPICard component
- **Issue**: Hardcoded value `156` with hardcoded subtitle "68% response rate"
- **Should be**: Calculated from:
  - Gmail threads with replies
  - Total emails sent
  - Actual response rate percentage
- **Backend needed**: Endpoint to count replies from Gmail threads

#### 7. **Interview Preps KPI** (Line 811)
- **Location**: KPICard component
- **Issue**: Hardcoded value `8` with hardcoded subtitle "3 completed this month"
- **Should be**: Fetched from:
  - Interview prep API (`apiService.getInterviewPrepHistory`)
  - Count completed vs total
- **Backend needed**: Already exists, just needs to be wired up

#### 8. **Meetings Subtitle** (Line 808)
- **Location**: KPICard component
- **Issue**: Hardcoded subtitle "12 scheduled"
- **Should be**: Count of:
  - Meeting preps with scheduled dates
  - Or calendar events linked to meetings
- **Backend needed**: Link meeting preps to calendar events, or add scheduled date field

#### 9. **"View all activity" Button** (Line 289-291)
- **Location**: ActivityFeed component
- **Issue**: Button doesn't navigate anywhere
- **Should be**: Link to full activity history page
- **Backend needed**: Already exists (`firebaseApi.getActivities`), just needs navigation

---

## Outbox Tab

### ✅ Connected to Backend (`connect-grow-hire/src/pages/Outbox.tsx`)
- **Threads List** - Fetched from API (`apiService.getOutboxThreads`)
- **Thread Details** - Loaded from API response
- **Suggested Replies** - Generated via API (`apiService.regenerateOutboxReply`)
- **Gmail Draft Integration** - Connected via Gmail OAuth
- **Status Tracking** - Synced from Gmail threads

### ❌ Static/Hardcoded Data

#### 1. **Old Outbox Component** (`connect-grow-hire/src/components/Outbox.tsx`)
- **Location**: Entire component is static
- **Issue**: This appears to be an old/unused component with:
  - Hardcoded `emailThreads` array (4 threads)
  - Hardcoded `conversationMessages` array
  - Hardcoded contact details (job title, location, industry)
  - Static "Suggested Next Steps" buttons (no functionality)
- **Status**: This file should probably be deleted if `pages/Outbox.tsx` is the active one

#### 2. **Contact Details in New Outbox** (`pages/Outbox.tsx`)
- **Location**: Lines 411-417 (contact info display)
- **Issue**: Shows contact name, job title, company, email - but these ARE from backend
- **Status**: ✅ Actually connected, just displays data from `selectedThread`

#### 3. **Suggested Actions** (if any exist)
- **Location**: Check if there are any action buttons
- **Issue**: Need to verify if "Schedule meeting", "View firm research" buttons work
- **Status**: Need to check if these are wired up

---

## Missing Backend Endpoints Needed

### Dashboard Statistics Endpoint
```python
GET /api/dashboard/stats
Response: {
  "outreachByMonth": [
    {"month": "Jan", "outreach": 12, "replies": 8},
    ...
  ],
  "topFirms": [
    {"name": "...", "contacts": 12, "replyRate": 0.68},
    ...
  ],
  "replyStats": {
    "totalReplies": 156,
    "responseRate": 0.68,
    "totalSent": 230
  },
  "interviewPrepStats": {
    "total": 8,
    "completedThisMonth": 3
  }
}
```

### Recommendations Endpoint
```python
GET /api/dashboard/recommendations
Response: {
  "recommendations": [
    {
      "type": "follow_up",
      "title": "Follow up with Sarah at Evercore",
      "description": "You reached out 3 days ago...",
      "action": "Draft follow-up",
      "contactId": "..."
    },
    ...
  ]
}
```

### Firm Locations Endpoint
```python
GET /api/dashboard/firm-locations
Response: {
  "locations": [
    {
      "name": "Goldman Sachs",
      "city": "New York",
      "state": "NY",
      "contacts": 12,
      "coordinates": {"x": 82, "y": 35}
    },
    ...
  ]
}
```

### Recruiting Timeline Endpoint
```python
GET /api/dashboard/timeline
Response: {
  "phases": [
    {"month": "Jan", "description": "...", "isActive": false},
    ...
  ],
  "currentPhase": 2,
  "progress": 0.4
}
```

---

## Summary

### Dashboard Tab
- **Static Items**: 9 major components/sections
- **Connected Items**: 7 major components/sections
- **Missing Backend**: 4 new endpoints needed

### Outbox Tab
- **Static Items**: 1 old component (likely unused)
- **Connected Items**: Main outbox page is fully connected
- **Missing Backend**: None (already well connected)

### Priority Fixes
1. **High Priority**: Replies Received KPI, Outreach vs Replies Chart
2. **Medium Priority**: Top Firms, AI Recommendations, Interview Preps count
3. **Low Priority**: US Map, Recruiting Timeline, Meetings scheduled count
