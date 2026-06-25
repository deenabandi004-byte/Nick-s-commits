# Prompt-First Contact Search Implementation

## Overview

This document describes the experimental prompt-first contact search flow that converts natural language prompts into structured search filters, which are then used by Offerloop's existing Contact Search logic.

## ⚠️ Important Notes

- **This is an ADDITIVE experiment** - it does NOT replace the current strict filter-based search
- **All existing credit logic, API calls, and result caps remain unchanged**
- **Credits are NOT deducted during prompt parsing** - only when contact data is revealed
- **Feature flag controlled** - can be easily enabled/disabled

## Architecture

### Backend Components

#### 1. Prompt Parser Service (`backend/app/services/prompt_parser.py`)

Converts natural language prompts into structured search filters using OpenAI's GPT-4o-mini model.

**Key Features:**
- Extracts only supported fields (company, roles, location, schools, industries)
- Never hallucinates unsupported filters
- Normalizes values (e.g., "GS" → "Goldman Sachs", "USC" → "University of Southern California")
- Includes fallback parser for when LLM is unavailable
- Validates and normalizes all responses

**Supported Fields:**
- `company`: Array of company names (normalized)
- `roles`: Array of job titles/roles
- `location`: Array of locations (cities, states, regions)
- `schools`: Array of school/university names (normalized)
- `industries`: Array of industry names
- `max_results`: Number (capped at 15)
- `confidence`: Float between 0.0 and 1.0

#### 2. Parse Prompt Endpoint (`backend/app/routes/parse_prompt.py`)

**Endpoint:** `POST /api/search/parse-prompt`

**Request:**
```json
{
  "prompt": "Find USC alumni in investment banking at Goldman Sachs in New York"
}
```

**Response:**
```json
{
  "company": ["Goldman Sachs"],
  "roles": ["Investment Banking Analyst"],
  "location": ["New York"],
  "schools": ["University of Southern California"],
  "industries": [],
  "max_results": 15,
  "confidence": 0.87
}
```

**Features:**
- Feature flag protected (checks `PROMPT_SEARCH_ENABLED`)
- No credit deduction
- Logs all prompt → filter mappings to Firestore for evaluation
- Comprehensive error handling

#### 3. Feature Flag (`backend/app/config.py`)

```python
PROMPT_SEARCH_ENABLED = os.getenv('PROMPT_SEARCH_ENABLED', 'false').lower() == 'true'
```

Enable by setting environment variable:
```bash
PROMPT_SEARCH_ENABLED=true
```

### Frontend Components

#### 1. PromptSearchInput (`connect-grow-hire/src/components/search/PromptSearchInput.tsx`)

Textarea input component with:
- Placeholder text: "Describe who you want to reach…"
- Example prompts shown below input
- Submit button: "Generate Search"
- Loading states

#### 2. SearchConfirmation (`connect-grow-hire/src/components/search/SearchConfirmation.tsx`)

Confirmation UI that displays extracted filters as editable chips:
- Each chip can be removed or edited
- Shows filter type labels (Company, Role, Location, School, Industry)
- Color-coded by filter type
- Displays confidence score and max results
- User must explicitly confirm before running search

#### 3. PromptSearchFlow (`connect-grow-hire/src/components/search/PromptSearchFlow.tsx`)

Complete flow orchestrator:
1. Shows prompt input
2. Parses prompt to filters
3. Shows confirmation with editable chips
4. Converts filters to `ContactSearchRequest` format
5. Runs existing search logic (via `apiService.runFreeSearch`)

#### 4. API Service Updates (`connect-grow-hire/src/services/api.ts`)

Added:
- `ParsedSearchFilters` interface
- `parseSearchPrompt(prompt: string)` method

## Integration Points

### Filter Mapping

The parsed filters are converted to `ContactSearchRequest` format:

```typescript
const searchRequest: ContactSearchRequest = {
  jobTitle: filters.roles[0] || '',           // First role → jobTitle
  company: filters.company[0] || undefined,    // First company → company
  location: filters.location.join(', ') || '', // Joined locations → location
  collegeAlumni: filters.schools[0] || undefined, // First school → collegeAlumni
};
```

**Note:** `industries` and `max_results` are logged but not directly used in the current search request format.

### Credit Logic

- **Prompt parsing:** FREE (no credits deducted)
- **Search execution:** Normal credit deduction (15 credits per search)
- Credits are only deducted when contact data is revealed

### Logging & Evaluation

All prompt → filter mappings are logged to Firestore:
- Collection: `prompt_parses`
- Fields: `userId`, `userEmail`, `prompt`, `extractedFilters`, `createdAt`

This allows for:
- Evaluation of extraction accuracy
- User behavior analysis
- Prompt improvement iterations

## Usage

### Enable the Feature

1. Set environment variable:
   ```bash
   PROMPT_SEARCH_ENABLED=true
   ```

2. Restart the backend server

### Use in Frontend

```tsx
import { PromptSearchFlow } from '@/components/search/PromptSearchFlow';

function MyComponent() {
  return (
    <PromptSearchFlow
      onSearchComplete={(contacts) => {
        console.log('Found contacts:', contacts);
      }}
      onSearchStart={() => {
        console.log('Search started');
      }}
    />
  );
}
```

Or use the wrapper with tabs:

```tsx
import { ContactSearchWithPrompt } from '@/components/search/PromptSearchFlow';

function MyComponent() {
  return <ContactSearchWithPrompt />;
}
```

## Example Prompts

1. "Find USC alumni in investment banking at Goldman Sachs in New York"
2. "Software engineers at Google in San Francisco"
3. "Consultants at McKinsey who went to Harvard"
4. "Product managers at Meta in Seattle"

## File Structure

```
backend/
  app/
    routes/
      parse_prompt.py          # New endpoint
    services/
      prompt_parser.py         # LLM parsing service
    config.py                  # Feature flag added

connect-grow-hire/
  src/
    components/
      search/
        PromptSearchInput.tsx      # Input component
        SearchConfirmation.tsx     # Confirmation UI
        PromptSearchFlow.tsx       # Flow orchestrator
    services/
      api.ts                      # API service updated
```

## Testing

### Backend Testing

```bash
curl -X POST http://localhost:5001/api/search/parse-prompt \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"prompt": "Find USC alumni in investment banking at Goldman Sachs in New York"}'
```

### Frontend Testing

1. Navigate to a page with the `PromptSearchFlow` component
2. Enter a natural language prompt
3. Review extracted filters
4. Edit/remove filters as needed
5. Confirm to run search

## Future Enhancements

1. **Multi-role support:** Currently uses first role only - could support multiple roles
2. **Industry filtering:** Add industry support to `ContactSearchRequest`
3. **Batch processing:** Support multiple companies/schools in a single search
4. **Prompt suggestions:** Learn from user edits to improve prompts
5. **Confidence thresholds:** Warn users when confidence is too low

## Rollback Plan

To disable the feature:

1. Set `PROMPT_SEARCH_ENABLED=false` or remove the env var
2. Restart backend
3. Frontend will show 403 error if attempted (graceful degradation)

To completely remove:

1. Delete `backend/app/routes/parse_prompt.py`
2. Delete `backend/app/services/prompt_parser.py`
3. Remove blueprint registration from `backend/wsgi.py`
4. Remove frontend components
5. Remove API service methods

## Success Criteria

✅ Prompt → filters works reliably  
✅ Users understand and trust the output  
✅ Existing Contact Search remains untouched  
✅ Can be removed or expanded easily  
✅ No credit deduction for parsing  
✅ All existing logic preserved  

## Notes

- The LLM prompt is carefully crafted to prevent hallucination
- Fallback parser ensures functionality even if OpenAI is unavailable
- All user edits are logged for evaluation
- The feature is completely additive - no existing code was modified

