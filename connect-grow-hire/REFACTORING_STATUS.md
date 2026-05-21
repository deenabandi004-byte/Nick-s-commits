# Refactoring Status: Home.tsx Modularization

## Completed ✅

1. ✅ Created shared constants file (`src/lib/constants.ts`)
   - TIER_CONFIGS
   - MEETING_CREDITS
   - INTERVIEW_PREP_CREDITS
   - MeetingHistoryItem type

2. ✅ Created shared components:
   - `BackToHomeButton.tsx`
   - `ComingSoonOverlay.tsx` (extracted from Home.tsx)

3. ✅ Created feature pages:
   - `MeetingPrepPage.tsx` - Meeting Prep + Coffee Library tabs (FULLY FUNCTIONAL)
   - `ContactSearchPage.tsx` - Placeholder (needs full extraction)
   - `InterviewPrepPage.tsx` - Placeholder with ComingSoonOverlay
   - `FirmSearchPage.tsx` - Placeholder with ComingSoonOverlay

## Still Needed ⚠️

### ContactSearchPage.tsx - Needs Full Extraction

Extract from Home.tsx:
- [ ] All contact search state (jobTitle, company, location, collegeAlumni, uploadedFile, batchSize)
- [ ] handleSearch function (lines ~1191-1422)
- [ ] handleFileUpload function (lines ~1479-1502)
- [ ] handleJobTitleSuggestion function (lines ~1504-1517)
- [ ] autoSaveToDirectory function (lines ~397-456)
- [ ] getUserProfileData function (lines ~350-392)
- [ ] checkNeedsGmailConnection function (lines ~458-487)
- [ ] initiateGmailOAuth function (lines ~489-552)
- [ ] generateAndDraftEmailsBatch function (lines ~554-604)
- [ ] Gmail connection status UI (lines ~1582-1611)
- [ ] Contact search form UI (lines ~1632-1850)
- [ ] Search results display UI (lines ~1822-1848)
- [ ] Progress indicator (lines ~2353-2383)
- [ ] Scout chatbot integration

### InterviewPrepPage.tsx - Needs Full Extraction

Extract from Home.tsx:
- [ ] Interview prep state (jobPostingUrl, parsedJobDetails, showManualInput, manualCompanyName, manualJobTitle)
- [ ] handleInterviewPrepSubmit function (lines ~893-1094)
- [ ] downloadInterviewPrepPDF function (lines ~1096-1189)
- [ ] Interview prep form UI (lines ~2027-2350)

### Home.tsx - Simplify to Dashboard

Replace current monolithic Home.tsx with:
- Simple dashboard/landing page
- Cards linking to each feature page:
  - ContactSearchPage
  - MeetingPrepPage
  - InterviewPrepPage
  - FirmSearchPage
  - Outbox (dashboard)
- Quick stats/widgets
- Recent activity summary

## Routes to Add

Update `App.tsx` routes:
- `/contact-search` → ContactSearchPage
- `/meeting-prep` → MeetingPrepPage
- `/interview-prep` → InterviewPrepPage
- `/firm-search` → FirmSearchPage

## Next Steps

1. Extract contact search logic to ContactSearchPage.tsx
2. Extract interview prep logic to InterviewPrepPage.tsx
3. Complete Home.tsx simplification
4. Update all navigation links
5. Test all functionality

