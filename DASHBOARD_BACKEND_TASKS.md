# Dashboard Backend Implementation Tasks

## Overview
This document outlines all backend tasks needed to support the home page (Dashboard) frontend features. Currently, many features are calculated client-side or use mock data. We need to create efficient backend endpoints to support these features.

---

## ✅ Already Implemented
- **Outbox API** - `/api/outbox/threads` and `/api/outbox/threads/<id>/regenerate` ✅
- **Activity Logging** - Firestore-based activity logging ✅
- **Goals Management** - Firestore-based goals storage ✅
- **Meeting Preps** - Full CRUD operations ✅
- **Interview Preps** - Full CRUD operations ✅
- **Firm Search** - Search and history endpoints ✅
- **Contact Management** - Firestore-based contact storage ✅

---

## 🔨 Tasks to Implement

### 1. Dashboard Statistics API
**Priority: High**

**Endpoint:** `GET /api/dashboard/stats`

**Purpose:** Provide aggregated statistics for the dashboard KPI cards

**Response:**
```json
{
  "contactsFound": 156,
  "firmsSearched": 42,
  "meetingsCreated": 12,
  "repliesReceived": 68,
  "responseRate": 0.68,
  "totalTimeSavedHours": 24.5,
  "interviewPrepsCreated": 8,
  "interviewPrepsThisMonth": 3
}
```

**Implementation Notes:**
- Calculate `contactsFound` from user's contacts collection
- Calculate `firmsSearched` from firm search history
- Calculate `meetingsCreated` from meeting preps
- Calculate `repliesReceived` from contacts with `hasUnreadReply=true` or `threadStatus='new_reply'`
- Calculate `responseRate` as replies / contacts with emails sent
- Calculate `totalTimeSavedHours` using formula: (contacts * 20min + firms * 2min + meetings * 30min) / 60
- Calculate `interviewPrepsCreated` from interview prep history
- Filter `interviewPrepsThisMonth` by current month

**Files to Create/Modify:**
- `backend/app/routes/dashboard.py` (new file)
- `backend/app/routes/__init__.py` (register blueprint)

---

### 2. Weekly Summary API
**Priority: High**

**Endpoint:** `GET /api/dashboard/weekly-summary`

**Purpose:** Provide weekly activity summary (last 7 days)

**Response:**
```json
{
  "contactsGenerated": 12,
  "firmsSearched": 5,
  "meetingsCreated": 3,
  "interviewPrepsCreated": 2,
  "totalActivities": 22
}
```

**Implementation Notes:**
- Query activities collection filtered by timestamp (last 7 days)
- Count activities by type: `contactSearch`, `firmSearch`, `coffeePrep`, `interviewPrep`
- Return aggregated counts

**Files to Create/Modify:**
- `backend/app/routes/dashboard.py`

---

### 3. Streak API
**Priority: Medium**

**Endpoint:** `GET /api/dashboard/streak`

**Purpose:** Calculate and return user's login streak

**Response:**
```json
{
  "currentStreak": 7,
  "longestStreak": 14,
  "lastActivityDate": "2025-12-04"
}
```

**Implementation Notes:**
- Query activities collection, group by day (any activity on a day = logged in)
- Calculate consecutive days from today backwards
- Track longest streak across all time
- Cache result in user document for performance
- Update cache when new activity is logged

**Files to Create/Modify:**
- `backend/app/routes/dashboard.py`
- `backend/app/services/dashboard_service.py` (new - streak calculation logic)

---

### 4. Goals Progress API
**Priority: Medium**

**Endpoint:** `GET /api/dashboard/goals/progress`

**Purpose:** Calculate progress for all user goals

**Response:**
```json
{
  "goals": [
    {
      "id": "goal123",
      "type": "contacts",
      "target": 50,
      "current": 35,
      "percentage": 70,
      "period": "month"
    },
    {
      "id": "goal456",
      "type": "firms",
      "target": 20,
      "current": 12,
      "percentage": 60,
      "period": "month"
    }
  ]
}
```

**Implementation Notes:**
- Fetch all goals from user's goals collection
- For each goal, calculate current progress based on:
  - `contacts`: Count contacts created within goal period
  - `firms`: Count firm search activities within goal period
  - `meetings`: Count meeting prep activities within goal period
  - `outreach`: Count contacts with `firstContactDate` within goal period and status != 'Not Contacted'
- Calculate percentage: `(current / target) * 100`

**Files to Create/Modify:**
- `backend/app/routes/dashboard.py`
- `backend/app/services/dashboard_service.py` (goal progress calculation)

---

### 5. Activity Feed API
**Priority: Low** (Already works client-side, but could optimize)

**Endpoint:** `GET /api/dashboard/activities?limit=10`

**Purpose:** Get recent activities for the activity feed

**Response:**
```json
{
  "activities": [
    {
      "id": "act123",
      "type": "firmSearch",
      "summary": "Searched for investment banking firms in New York",
      "timestamp": "2025-12-04T10:30:00Z",
      "metadata": {}
    }
  ]
}
```

**Implementation Notes:**
- Query activities collection, ordered by timestamp desc
- Limit results (default 10)
- Return formatted for frontend consumption

**Files to Create/Modify:**
- `backend/app/routes/dashboard.py`

**Note:** This is optional since it already works client-side via Firestore. Consider if we want to move it to backend for consistency.

---

### 6. Outreach vs Replies Chart Data API
**Priority: Medium**

**Endpoint:** `GET /api/dashboard/outreach-chart?months=6`

**Purpose:** Provide time series data for outreach vs replies chart

**Response:**
```json
{
  "data": [
    {
      "month": "Jan",
      "outreach": 12,
      "replies": 8
    },
    {
      "month": "Feb",
      "outreach": 19,
      "replies": 14
    }
  ]
}
```

**Implementation Notes:**
- Query contacts collection
- For each month in range:
  - `outreach`: Count contacts with `firstContactDate` in that month
  - `replies`: Count contacts with replies received in that month (check `hasUnreadReply` or `threadStatus`)
- Group by month, return formatted data

**Files to Create/Modify:**
- `backend/app/routes/dashboard.py`
- `backend/app/services/dashboard_service.py` (chart data aggregation)

---

### 7. AI Recommendations API
**Priority: Medium**

**Endpoint:** `GET /api/dashboard/recommendations`

**Purpose:** Generate personalized AI recommendations for the user

**Response:**
```json
{
  "recommendations": [
    {
      "type": "follow_up",
      "title": "Follow up with Sarah at Evercore",
      "description": "You reached out 3 days ago - a follow-up could help",
      "action": "Draft follow-up",
      "contactId": "contact123",
      "metadata": {}
    },
    {
      "type": "unread_replies",
      "title": "You have 3 unread replies to review",
      "description": "Recent responses from Goldman Sachs and Bain",
      "action": "View replies",
      "metadata": {
        "replyCount": 3
      }
    },
    {
      "type": "firm_suggestions",
      "title": "Students like you often target these 5 firms next",
      "description": "Based on your search history and profile",
      "action": "Explore firms",
      "metadata": {
        "firmIds": ["firm1", "firm2"]
      }
    }
  ]
}
```

**Implementation Notes:**
- Analyze user's contacts, activities, and search history
- Generate recommendations:
  1. **Follow-ups**: Contacts contacted 3+ days ago with no reply
  2. **Unread replies**: Count contacts with unread replies
  3. **Firm suggestions**: Based on user's search patterns and similar users
- Use OpenAI or similar to generate personalized descriptions
- Limit to 3-5 recommendations

**Files to Create/Modify:**
- `backend/app/routes/dashboard.py`
- `backend/app/services/dashboard_service.py` (recommendation logic)
- Potentially use existing OpenAI client

---

### 8. Top Firms API
**Priority: Low**

**Endpoint:** `GET /api/dashboard/top-firms?limit=5`

**Purpose:** Get top firms by contact count

**Response:**
```json
{
  "firms": [
    {
      "name": "Goldman Sachs",
      "city": "New York, NY",
      "industry": "Investment Banking",
      "contacts": 12
    }
  ]
}
```

**Implementation Notes:**
- Query contacts collection
- Group by company name
- Count contacts per company
- Sort by count desc, limit results
- Optionally enrich with firm data from firm search history

**Files to Create/Modify:**
- `backend/app/routes/dashboard.py`

---

### 9. Calendar Events API
**Priority: Medium**

**Endpoint:** `GET /api/dashboard/calendar/events`

**Purpose:** Get calendar events (meetings, follow-ups, etc.)

**Response:**
```json
{
  "events": [
    {
      "id": "event123",
      "title": "Meeting with Sarah Chen",
      "firm": "Goldman Sachs",
      "date": "2025-12-05",
      "time": "14:00",
      "type": "video",
      "status": "confirmed",
      "contactId": "contact123"
    }
  ],
  "followUpReminders": [
    {
      "id": "reminder123",
      "title": "Follow up with Jane Doe",
      "description": "No response after 5 days",
      "dueDate": "2025-12-05",
      "contactId": "contact456"
    }
  ]
}
```

**Implementation Notes:**
- **Events**: Query contacts with scheduled meetings (need to add `scheduledDate`, `scheduledTime` fields to contacts)
- **Follow-up reminders**: Contacts contacted 3+ days ago with no reply
- Return formatted for calendar component

**Files to Create/Modify:**
- `backend/app/routes/dashboard.py`
- Consider adding calendar event fields to contact model

**Note:** This requires adding calendar scheduling functionality to contacts. May need to create a separate `calendar_events` collection.

---

### 10. US Map Visualization Data API
**Priority: Low**

**Endpoint:** `GET /api/dashboard/map-data`

**Purpose:** Get firm locations for US map visualization

**Response:**
```json
{
  "locations": [
    {
      "id": "loc1",
      "name": "Goldman Sachs",
      "city": "New York",
      "state": "NY",
      "contacts": 12,
      "coordinates": {
        "x": 82,
        "y": 35
      }
    }
  ]
}
```

**Implementation Notes:**
- Query contacts collection
- Group by company and location
- Count contacts per location
- Return with coordinates for map rendering
- May need to geocode city/state to map coordinates

**Files to Create/Modify:**
- `backend/app/routes/dashboard.py`
- `backend/app/services/dashboard_service.py` (coordinate calculation)

---

### 11. Recruiting Timeline API
**Priority: Low**

**Endpoint:** `GET /api/dashboard/recruiting-timeline`

**Purpose:** Get recruiting timeline progress

**Response:**
```json
{
  "currentMonth": "Mar",
  "currentMonthIndex": 2,
  "progressWithinMonth": 0.4,
  "phases": [
    {
      "month": "Jan",
      "description": "Research & Target Firms",
      "isActive": false,
      "completed": true
    },
    {
      "month": "Mar",
      "description": "Submit 30 Applications",
      "isActive": true,
      "completed": false
    }
  ]
}
```

**Implementation Notes:**
- Determine current recruiting phase based on user's activities and goals
- Calculate progress within current phase
- Return timeline phases with active/completed status

**Files to Create/Modify:**
- `backend/app/routes/dashboard.py`
- `backend/app/services/dashboard_service.py` (timeline logic)

**Note:** This is somewhat arbitrary logic - may want to make it configurable or remove if not valuable.

---

## Implementation Order (Suggested)

1. **Phase 1: Core Statistics** (High Priority)
   - Dashboard Statistics API (#1)
   - Weekly Summary API (#2)
   - Streak API (#3)

2. **Phase 2: Goals & Analytics** (Medium Priority)
   - Goals Progress API (#4)
   - Outreach vs Replies Chart Data API (#6)

3. **Phase 3: Recommendations & Calendar** (Medium Priority)
   - AI Recommendations API (#7)
   - Calendar Events API (#9)

4. **Phase 4: Nice-to-Have** (Low Priority)
   - Activity Feed API (#5) - Optional
   - Top Firms API (#8)
   - US Map Visualization Data API (#10)
   - Recruiting Timeline API (#11)

---

## Database Considerations

### New Fields Needed:
- **Contacts Collection:**
  - `scheduledDate` (string, ISO date) - For calendar events
  - `scheduledTime` (string, time) - For calendar events
  - `eventType` (string) - 'video', 'phone', 'in-person'
  - `eventStatus` (string) - 'confirmed', 'pending', 'cancelled'

### Indexes Needed:
- Activities collection: `timestamp` (descending) - for activity feed and streak
- Contacts collection: `firstContactDate` - for outreach chart
- Contacts collection: `company` - for top firms aggregation

---

## Testing Checklist

For each endpoint:
- [ ] Test with authenticated user
- [ ] Test with user with no data (empty state)
- [ ] Test with user with large dataset (performance)
- [ ] Test error handling (database errors, auth errors)
- [ ] Verify response format matches frontend expectations
- [ ] Test edge cases (null values, missing fields)

---

## Notes

- Most calculations can be done efficiently with Firestore queries
- Consider caching expensive calculations (streak, goals progress) in user document
- Some features (like AI recommendations) may require OpenAI API calls
- Calendar functionality may require a separate `calendar_events` collection if we want more robust scheduling
- US Map coordinates can be hardcoded for major cities or use a geocoding service
