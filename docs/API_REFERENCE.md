# API Reference

All routes are prefixed with `/api/` unless otherwise noted. Auth = `@require_firebase_auth` required.

---

## Health

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/ping` | GET | No | 0 | Simple ping |
| `/api/health` | GET | No | 0 | Health check with Firebase/Stripe status |
| `/api/healthz` | GET | No | 0 | Kubernetes-style health check |

---

## Contact Search (runs)

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/free-run` | POST | Yes | 15 | Free/unified tier search - PDL search + email generation + Gmail drafts |
| `/api/pro-run` | POST | Yes | 15 | Pro tier search (legacy, same as free-run with tier detection) |
| `/api/basic-run` | POST | Yes | 15 | Alias for free-run |
| `/api/advanced-run` | POST | Yes | 15 | Alias for pro-run |
| `/api/prompt-search` | POST | Yes | 15 | Natural language prompt search |
| `/api/free-run-csv` | POST | Yes | 0 | Export search results as CSV |
| `/api/pro-run-csv` | POST | Yes | 0 | Pro tier CSV export |

### POST `/api/free-run`
```json
Request: {
  "jobTitle": "Software Engineer",
  "company": "Google",           // optional
  "location": "San Francisco",
  "collegeAlumni": "USC",        // optional
  "batchSize": 3,                // 1-15 depending on tier
  "emailTemplate": {             // optional
    "purpose": "networking",
    "stylePreset": "casual",
    "customInstructions": "...",
    "subject": "Quick question about...",
    "signoffPhrase": "Best,",
    "signatureBlock": ""
  }
}

Response: {
  "contacts": [{
    "FirstName": "...", "LastName": "...", "Title": "...", "Company": "...",
    "Email": "...", "LinkedIn": "...", "City": "...", "State": "...",
    "emailSubject": "...", "emailBody": "...",
    "gmailDraftId": "...", "gmailComposeUrl": "..."
  }],
  "successful_drafts": 3,
  "total_contacts": 3,
  "credits_used": 15
}

Errors: 400 (validation), 401 (auth), 402 (insufficient credits), 500 (server error)
```

---

## Prompt Search

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/prompt-run` | POST | Yes | 15 | Execute prompt-based search |
| `/api/parse-prompt` | POST | Yes | 0 | Parse natural language → structured query |

---

## Emails

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/emails/generate-and-draft` | POST | Yes | 0 | Generate emails for given contacts + create Gmail drafts |

### POST `/api/emails/generate-and-draft`
```json
Request: {
  "contacts": [{...}],           // Contact objects with FirstName, LastName, etc.
  "resumeText": "...",           // optional
  "userProfile": {...},          // optional
  "fitContext": {...},           // optional - target role context
  "emailTemplate": {...}        // optional - template override
}
```

---

## Email Templates

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/email-templates` | GET | Yes | 0 | Get user's current default template |
| `/api/email-templates` | POST | Yes | 0 | Save default email template |
| `/api/email-templates/presets` | GET | No | 0 | Get available style/purpose presets |
| `/api/email-templates/saved` | GET | Yes | 0 | List user's saved templates |
| `/api/email-templates/saved` | POST | Yes | 0 | Save a named template |
| `/api/email-templates/saved/{id}` | DELETE | Yes | 0 | Delete a saved template |

---

## Contacts

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/contacts` | GET | Yes | 0 | List user's saved contacts |
| `/api/contacts` | POST | Yes | 0 | Save a contact |
| `/api/contacts/{id}` | GET | Yes | 0 | Get a single contact |
| `/api/contacts/{id}` | PUT | Yes | 0 | Update a contact |
| `/api/contacts/{id}` | DELETE | Yes | 0 | Delete a contact |
| `/api/contacts/bulk` | POST | Yes | 0 | Bulk save contacts |
| `/api/contacts/bulk-delete` | POST | Yes | 0 | Bulk delete contacts |
| `/api/contacts/{id}/check-replies` | GET | Yes | 0 | Check Gmail for replies |
| `/api/contacts/batch-check-replies` | POST | Yes | 0 | Batch reply check |
| `/api/contacts/{id}/generate-reply` | POST | Yes | 0 | Generate AI reply to received email |
| `/api/contacts/{id}/mute-notifications` | POST | Yes | 0 | Mute reply notifications |

---

## Contact Import

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/contacts/import/preview` | POST | Yes | 0 | Preview CSV import (parse and validate) |
| `/api/contacts/import` | POST | Yes | 0 | Execute CSV import |
| `/api/contacts/import/template` | GET | No | 0 | Download CSV import template |
| `/api/contacts/import-linkedin` | POST | Yes | 0 | Import from LinkedIn data |

---

## Directory

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/directory/contacts` | GET | Yes | 0 | Search contact directory (SQLite) |
| `/api/directory/contacts` | POST | Yes | 0 | Add to directory |

---

## Enrichment

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/autocomplete/{data_type}` | GET | No | 0 | Autocomplete for job titles, companies, locations, schools |
| `/api/enrich-job-title` | POST | Yes | 0 | Enrich job title with similar titles (OpenAI) |

---

## Gmail OAuth

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/google/oauth/start` | GET | Yes | 0 | Initiate Gmail OAuth flow |
| `/api/google/oauth/callback` | GET | No | 0 | OAuth callback (exchanges code for tokens) |
| `/api/google/gmail/status` | GET | Yes | 0 | Check Gmail connection status |
| `/api/google/gmail/revoke` | POST | Yes | 0 | Disconnect Gmail |
| `/api/gmail/oauth/start` | GET | Yes | 0 | Legacy alias for `/api/google/oauth/start` |
| `/api/gmail/status` | GET | Yes | 0 | Legacy alias for `/api/google/gmail/status` |

---

## Gmail Webhook

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/google/gmail/webhook` | POST | No* | 0 | Gmail Pub/Sub push notification receiver |

*Authenticated via Pub/Sub verification, not Firebase auth.

---

## Resume

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/parse-resume` | POST | Yes | 0 | Upload and parse resume (PDF/DOCX) |
| `/api/resume` | DELETE | Yes | 0 | Delete uploaded resume |

---

## Resume Workshop

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/resume-workshop/analyze` | POST | Yes | 0 | Analyze resume with AI |
| `/api/resume-workshop/fix` | POST | Yes | 0 | Generate fix suggestions |
| `/api/resume-workshop/score` | POST | Yes | 0 | ATS score resume |
| `/api/resume-workshop/apply-improvements` | POST | Yes | 0 | Apply AI improvements |
| `/api/resume-workshop/replace-main` | POST | Yes | 0 | Replace main resume |
| `/api/resume-workshop/apply` | POST | Yes | 0 | Apply edits to resume |
| `/api/resume-workshop/library` | GET | Yes | 0 | List resume library |
| `/api/resume-workshop/library` | POST | Yes | 0 | Save to resume library |
| `/api/resume-workshop/library/{id}` | GET | Yes | 0 | Get library entry |
| `/api/resume-workshop/library/{id}` | DELETE | Yes | 0 | Delete library entry |
| `/api/resume-workshop/health` | GET | No | 0 | Health check |

---

## Resume PDF Patch

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/resume-pdf/patch-pdf` | POST | Yes | 0 | Patch/edit resume PDF |

---

## Cover Letter Workshop

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/cover-letter/generate` | POST | Yes | 0 | Generate cover letter |
| `/api/cover-letter/library` | GET | Yes | 0 | List cover letters |
| `/api/cover-letter/library/{id}` | GET | Yes | 0 | Get cover letter |
| `/api/cover-letter/library/{id}` | DELETE | Yes | 0 | Delete cover letter |
| `/api/cover-letter/health` | GET | No | 0 | Health check |

---

## Meeting Prep

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/meeting-prep` | POST | Yes | 15 | Generate meeting prep |
| `/api/meeting-prep/history` | GET | Yes | 0 | List past preps |
| `/api/meeting-prep/all` | GET | Yes | 0 | List all preps |
| `/api/meeting-prep/{id}` | GET | Yes | 0 | Get specific prep |
| `/api/meeting-prep/{id}` | DELETE | Yes | 0 | Delete prep |
| `/api/meeting-prep/{id}/download` | GET | Yes | 0 | Download prep as PDF |

---

## Interview Prep

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/interview-prep/generate` | POST | Yes | 25 | Generate interview prep |
| `/api/interview-prep/status/{id}` | GET | Yes | 0 | Check generation status |
| `/api/interview-prep/download/{id}` | GET | Yes | 0 | Download prep PDF |
| `/api/interview-prep/history` | GET | Yes | 0 | List past preps |

---

## Billing & Subscriptions

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/tier-info` | GET | No | 0 | Get tier definitions and features |
| `/api/check-credits` | GET | Yes | 0 | Check current credits |
| `/api/create-checkout-session` | POST | Yes | 0 | Create Stripe checkout session |
| `/api/complete-upgrade` | POST | Yes | 0 | Complete upgrade after checkout |
| `/api/stripe-webhook` | POST | No* | 0 | Stripe webhook receiver |
| `/api/update-subscription` | POST | Yes | 0 | Change subscription tier |
| `/api/create-portal-session` | POST | Yes | 0 | Create Stripe customer portal session |
| `/api/subscription-status` | GET | Yes | 0 | Get subscription status |
| `/api/user/subscription` | GET | Yes | 0 | Get user subscription details |
| `/api/user/update-tier` | POST | Yes | 0 | Update user tier |
| `/api/user/check-feature` | POST | Yes | 0 | Check if user can access a feature |
| `/api/user/increment-usage` | POST | Yes | 0 | Increment usage counter |

*Authenticated via Stripe signature verification.

---

## Users

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/user/update-preferences` | POST | Yes | 0 | Update user profile/preferences |

---

## Outbox

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/outbox/threads` | GET | Yes | 0 | List outbox threads |
| `/api/outbox/threads/batch-sync` | POST | Yes | 0 | Batch sync Gmail thread statuses |
| `/api/outbox/threads/{id}/stage` | PATCH | Yes | 0 | Update thread stage |
| `/api/outbox/threads/{id}/regenerate` | POST | Yes | 0 | Regenerate email for thread |
| `/api/outbox/threads/{id}/sync` | POST | Yes | 0 | Sync single thread |
| `/api/outbox/stats` | GET | Yes | 0 | Get outbox statistics |

---

## Scout AI

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/scout/chat` | POST | Yes | 0 | Scout AI chat message |
| `/api/scout/analyze-job` | POST | Yes | 0 | Analyze job posting |
| `/api/scout/firm-assist` | POST | Yes | 0 | Firm research assistant |
| `/api/scout/health` | GET | No | 0 | Health check |

---

## Scout Assistant

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/scout-assistant/chat` | POST | Yes | 0 | Scout assistant chat |
| `/api/scout-assistant/search-help` | POST | Yes | 0 | Search help/guidance |
| `/api/scout-assistant/health` | GET | No | 0 | Health check |

---

## Firm Search

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/firm-search/search` | POST | Yes | 0 | Search for companies |
| `/api/firm-search/search-async` | POST | Yes | 0 | Async company search |
| `/api/firm-search/status/{id}` | GET | Yes | 0 | Check async search status |
| `/api/firm-search/stream/{id}` | GET | Yes | 0 | Stream search results (SSE) |
| `/api/firm-search/history` | GET | Yes | 0 | List search history |
| `/api/firm-search/history/{id}` | GET | Yes | 0 | Get specific search |
| `/api/firm-search/delete-firm` | POST | Yes | 0 | Delete saved firm |
| `/api/firm-search/options/industries` | GET | No | 0 | List industries |
| `/api/firm-search/options/sizes` | GET | No | 0 | List company sizes |

---

## Job Board

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/jobs/jobs` | POST | Yes | 0 | Search job listings |
| `/api/jobs/search` | POST | Yes | 0 | Search jobs |
| `/api/jobs/optimize-resume` | POST | Yes | 0 | Optimize resume for job |
| `/api/jobs/optimize-resume-v2` | POST | Yes | 0 | V2 resume optimization |
| `/api/jobs/resume-capabilities` | GET | Yes | 0 | Check resume capabilities |
| `/api/jobs/find-recruiter` | POST | Yes | 0 | Find recruiter for company |
| `/api/jobs/find-hiring-manager` | POST | Yes | 0 | Find hiring manager |
| `/api/jobs/save-recruiters` | POST | Yes | 0 | Save found recruiters |
| `/api/jobs/generate-cover-letter` | POST | Yes | 0 | Generate cover letter for job |
| `/api/jobs/cover-letter-pdf` | POST | Yes | 0 | Generate cover letter PDF |
| `/api/jobs/parse-job-url` | POST | Yes | 0 | Parse job posting URL |
| `/api/jobs/clear-cache` | POST | Yes | 0 | Clear job search cache |

---

## Application Lab

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/application-lab/analyze` | POST | Yes | 0 | Analyze job + resume fit |
| `/api/application-lab/analysis/{id}` | GET | Yes | 0 | Get analysis result |
| `/api/application-lab/generate-cover-letter` | POST | Yes | 0 | Generate cover letter |
| `/api/application-lab/generate-edited-resume` | POST | Yes | 0 | Generate tailored resume |
| `/api/application-lab/repair-resume` | POST | Yes | 0 | Repair resume formatting |
| `/api/application-lab/health` | GET | No | 0 | Health check |

---

## Timeline

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/timeline/generate` | POST | Yes | 0 | Generate recruiting timeline |

---

## Search History

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/search-history` | GET | Yes | 0 | List search history |
| `/api/search-history/{id}` | GET | Yes | 0 | Get specific search |
| `/api/search-history/{id}` | DELETE | Yes | 0 | Delete search |

---

## Dashboard

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/dashboard/stats` | GET | Yes | 0 | Get dashboard statistics |
| `/api/dashboard/recommendations` | GET | Yes | 0 | Get personalized recommendations |
| `/api/dashboard/firm-locations` | GET | Yes | 0 | Get firm location data |
| `/api/dashboard/interview-prep-stats` | GET | Yes | 0 | Get interview prep statistics |

---

## Auth Extension (Chrome)

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/auth/google-extension` | POST | No | 0 | Chrome extension auth |

---

## Admin

| Route | Method | Auth | Credits | Description |
|-------|--------|------|---------|-------------|
| `/api/admin/backfill-stages` | POST | Yes* | 0 | Backfill contact stages |
| `/api/admin/deduplicate-contacts` | POST | Yes* | 0 | Deduplicate user contacts |
| `/api/admin/sync-stale` | POST | Yes* | 0 | Sync stale Gmail threads |
| `/api/admin/renew-watches` | POST | Yes* | 0 | Renew Gmail push watches |
| `/api/admin/client-error` | POST | No | 0 | Log client-side error |

*Admin endpoints may have additional authorization checks.

---

## Error Response Format

All error responses follow this structure:
```json
{
  "error": "Human-readable error message",
  "message": "Additional detail (optional)",
  "retry": true  // (optional) indicates client should retry
}
```

Common HTTP status codes:
- `400` - Bad request / validation error
- `401` - Missing or invalid auth token
- `403` - Insufficient tier (upgrade required)
- `404` - Resource not found
- `500` - Server error
- `503` - Service temporarily unavailable (network error, retry suggested)
