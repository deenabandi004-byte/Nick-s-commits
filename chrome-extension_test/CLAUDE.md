# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Offerloop Chrome Extension - a Manifest V3 browser extension that integrates with LinkedIn and job board sites. It allows users to find contact emails, import LinkedIn contacts, generate cover letters, prepare for interviews/meetings, and find recruiters - all powered by the Offerloop backend API.

## Architecture

**Plain JavaScript, no build toolchain.** All source files (`popup.js`, `content.js`, `background.js`) are vanilla JS loaded directly by the extension. There is no bundler, transpiler, or framework.

### Key Files

- **`manifest.json`** - Manifest V3 config. Defines permissions, content script injection patterns, OAuth2 client ID, and host permissions.
- **`background.js`** - Service worker. Handles message routing (`chrome.runtime.onMessage`), API calls to the backend, auth token management (Google OAuth → Firebase token exchange), context menu integration, and automatic 401 token refresh/retry.
- **`popup.js`** (~1850 lines) - Popup UI logic. Two-tab interface: **Contact tab** (email lookup, meeting prep) and **Job tab** (recruiter finder, cover letter generation, interview prep). Handles Google OAuth login flow via `chrome.identity.getAuthToken`.
- **`popup.html` / `popup.css`** - Popup markup and styles.
- **`content.js`** (~620 lines) - Content script injected into LinkedIn profiles and job board pages. Adds an "Add to Offerloop" button overlay on LinkedIn profile pages. Contains a large base64-encoded PNG icon.
- **`content.css`** - Styles for the injected LinkedIn button.
- **`build.js`** - Simple Node script that swaps OAuth client IDs between dev/prod in `manifest.json`. Currently both IDs are identical.

### Communication Pattern

```
popup.js / content.js  →  chrome.runtime.sendMessage()  →  background.js  →  fetch() to backend API
```

Messages use an `action` field: `addToOfferloop`, `importLinkedIn`, `getCredits`, `setAuthToken`, `getStatus`.

### Backend API

All API calls go to `API_BASE_URL` (hardcoded in both `background.js` and `popup.js` as `https://final-offerloop.onrender.com`). Auth is via `Bearer` token in the `Authorization` header. Key endpoints used:

- `POST /api/auth/google-extension` - Exchange Google token for Firebase token
- `POST /api/contacts/import-linkedin` - Import a LinkedIn contact
- `GET /api/check-credits` - Get user's credit balance and tier
- `POST /api/contacts/find-email` - Find email for a LinkedIn profile
- `POST /api/job-contacts` - Find recruiters for a job posting
- `POST /api/generate-cover-letter` - Generate cover letter
- `POST /api/interview-prep` / `GET /api/interview-prep/{id}/status` - Interview prep (async polling)
- `POST /api/meeting-prep` / `GET /api/meeting-prep/{id}/status` - Meeting prep (async polling)

### Auth Flow

1. User clicks "Sign in with Google" in popup
2. `chrome.identity.getAuthToken({ interactive: true })` gets a Google OAuth token
3. Token is exchanged via `POST /api/auth/google-extension` for a Firebase auth token
4. Firebase token stored in `chrome.storage.local` and used for all subsequent API calls
5. On 401, `background.js` automatically refreshes the token and retries once

## Commands

```bash
# Switch manifest to dev OAuth client ID (default)
node build.js --dev

# Switch manifest to production OAuth client ID
node build.js --prod
```

### Loading the Extension Locally

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this directory
4. After code changes, click the reload button on the extension card

## Content Script Injection Sites

Content scripts run on: LinkedIn profiles (`/in/*`), LinkedIn jobs, Greenhouse, Lever, Workday, Indeed, Handshake, Glassdoor, ZipRecruiter, and Wellfound.

## Storage

Uses `chrome.storage.local` for persisting: `authToken`, `isLoggedIn`, `userEmail`, `userName`, `userPhoto`, `credits`.
