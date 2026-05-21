# Backend API Documentation

## Overview

This is a Flask-based REST API backend for the Offerloop platform. The backend provides endpoints for contact search, email generation, Gmail integration, billing, user management, and meeting preparation features.

## Architecture

The backend follows a modular architecture with clear separation of concerns:

```
backend/
├── app/
│   ├── config.py          # Configuration and environment variables
│   ├── extensions.py      # Flask extensions (CORS, Firebase)
│   ├── models/           # Data models and schemas
│   ├── routes/           # API route blueprints
│   ├── services/         # Business logic and external API clients
│   └── utils/            # Utility functions
├── wsgi.py               # WSGI entry point
└── requirements.txt      # Python dependencies
```

## Getting Started

### Prerequisites

- Python 3.8+
- Firebase credentials file (`firebase-credentials.json`)
- Environment variables in `.env` file (see Configuration section)

### Installation

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Set up environment variables (create `.env` file in project root):
```bash
# API Keys
OPENAI_API_KEY=your_openai_key
PEOPLE_DATA_LABS_API_KEY=your_pdl_key
STRIPE_SECRET_KEY=your_stripe_secret
STRIPE_PUBLISHABLE_KEY=your_stripe_publishable
STRIPE_WEBHOOK_SECRET=your_webhook_secret
SERPAPI_KEY=your_serpapi_key

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Firebase
GOOGLE_APPLICATION_CREDENTIALS=path/to/firebase-credentials.json

# Flask
FLASK_SECRET=your_secret_key
FLASK_ENV=development
```

4. Start the server:
```bash
# From project root
python3 app.py

# Or from backend directory
python3 wsgi.py
```

The server will start on `http://localhost:5001` by default (configurable via `PORT` environment variable).

## Configuration

### Environment Variables

All configuration is managed through environment variables loaded from `.env` file. Key variables:

- **API Keys**: OpenAI, People Data Labs, Stripe, SerpAPI
- **OAuth**: Google Client ID/Secret for Gmail integration
- **Firebase**: Path to credentials file
- **Flask**: Secret key, environment mode

### Configuration File (`app/config.py`)

The configuration module centralizes:
- API keys and secrets
- OAuth redirect URIs (auto-detects production vs development)
- Tier configurations (Free vs Pro)
- Database paths
- PDL metro area mappings
- Constants (resume line, credits, cache duration)

## Project Structure

### Routes (`app/routes/`)

Each route file is a Flask Blueprint that handles specific API endpoints:

#### Health Routes (`health.py`)
- `GET /ping` - Simple health check (returns "pong")
- `GET /health` - Detailed health status with service connections
- `GET /healthz` - Kubernetes-style health check

#### Contact Routes (`contacts.py`)
- `GET /api/contacts` - Get all contacts for authenticated user
- `POST /api/contacts` - Create a new contact
- `PUT /api/contacts/<id>` - Update a contact
- `DELETE /api/contacts/<id>` - Delete a contact
- `GET /api/contacts/<id>/replies` - Check for email replies
- `POST /api/contacts/batch` - Create multiple contacts
- `GET /api/contacts/stats` - Get contact statistics

#### Directory Routes (`directory.py`)
- `GET /api/directory/contacts` - Get directory contacts (SQLite)
- `POST /api/directory/contacts` - Save contacts to directory

#### Run Routes (`runs.py`)
- `POST /api/free-run` - Free tier contact search
- `POST /api/pro-run` - Pro tier contact search (with resume)
- `GET /api/tier-info` - Get tier configuration information

#### Email Routes (`emails.py`)
- `POST /api/emails/generate-and-draft` - Generate and draft emails

#### Gmail OAuth Routes (`gmail_oauth.py`)
- `GET /api/google/oauth/start` - Initiate Gmail OAuth flow
- `GET /api/google/oauth/callback` - OAuth callback handler
- `GET /api/google/gmail/status` - Check Gmail connection status

#### Meeting Prep Routes (`meeting_prep.py`)
- `POST /api/meeting-prep` - Create new meeting preparation
- `GET /api/meeting-prep/history` - Get meeting history
- `GET /api/meeting-prep/all` - Get all meeting preps
- `GET /api/meeting-prep/<id>` - Get specific prep status
- `GET /api/meeting-prep/<id>/download` - Download PDF
- `DELETE /api/meeting-prep/<id>` - Delete a prep

#### Billing Routes (`billing.py`)
- `GET /api/check-credits` - Check user credits
- `POST /api/create-checkout-session` - Create Stripe checkout
- `POST /api/stripe-webhook` - Handle Stripe webhooks
- `POST /api/create-portal-session` - Create Stripe customer portal
- `GET /api/subscription-status` - Get subscription status

#### Resume Routes (`resume.py`)
- `POST /api/resume/upload` - Upload and parse resume
- `GET /api/resume` - Get user's resume

#### Enrichment Routes (`enrichment.py`)
- `GET /api/enrichment/autocomplete` - Get autocomplete suggestions
- `POST /api/enrichment/job-title` - Enrich job title

#### SPA Routes (`spa.py`)
- Catch-all route to serve the frontend SPA for non-API routes

### Services (`app/services/`)

Business logic and external API integrations:

#### `auth.py`
- `check_and_reset_credits()` - Credit management with monthly reset

#### `firebase.py`
- Firebase Admin SDK initialization
- Firestore client management

#### `gmail_client.py`
- Gmail OAuth credential management
- Gmail API operations (send, draft, read)
- Thread and reply checking

#### `openai_client.py`
- OpenAI API client initialization
- Email generation
- Meeting content generation

#### `pdl_client.py`
- People Data Labs API integration
- Contact enrichment
- LinkedIn profile parsing
- Smart location search strategies

#### `reply_generation.py`
- Batch email generation
- Email personalization

#### `resume_parser.py`
- PDF resume parsing
- Text extraction and processing

#### `pdf_builder.py`
- Meeting PDF generation

#### `stripe_client.py`
- Stripe payment processing
- Checkout session creation
- Webhook handling
- Subscription management

#### `directory_search.py`
- Directory search functionality

### Models (`app/models/`)

Data models and schemas:

#### `contact.py`
- Contact data normalization
- Contact model definitions

#### `users.py`
- User model definitions
- User tier management

#### `meeting_prep.py`
- Meeting prep data structures

#### `enums.py`
- Enum definitions (ContactStatus, UserTier, SearchType)

### Utils (`app/utils/`)

Utility functions:

#### `contact.py`
- Contact data cleaning and processing

#### `users.py`
- User data parsing (from resume)
- User profile utilities

#### `meeting_prep.py`
- Meeting similarity generation
- Question generation

## Authentication

The backend uses Firebase Authentication. Most endpoints require authentication via the `require_firebase_auth` decorator:

```python
from app.extensions import require_firebase_auth

@route_bp.route('/protected')
@require_firebase_auth
def protected_endpoint():
    user_id = request.firebase_user['uid']
    # ... endpoint logic
```

The frontend must include the Firebase ID token in the Authorization header:
```
Authorization: Bearer <firebase_id_token>
```

## CORS Configuration

CORS is configured in `app/extensions.py` to allow requests from:
- `http://localhost:8080` (frontend dev server)
- `http://localhost:5173` (Vite default)
- `http://localhost:3000` (React/Next.js)
- Production domains

## Database

### Firestore (Primary)
- User data, contacts, meeting preps
- Gmail OAuth credentials
- Subscription and billing data

### SQLite (Legacy Directory)
- Contact directory storage (`contacts.db` in project root)
- Used for backward compatibility

## Tier System

### Free Tier
- 3 contacts per search
- 150 credits
- Basic fields only
- No resume features

### Pro Tier
- 8 contacts per search
- 1800 credits
- Enhanced fields
- Resume-based personalization
- Meeting prep features

## Error Handling

All endpoints return JSON responses:
- Success: `200 OK` with data
- Client errors: `400 Bad Request`, `401 Unauthorized`, `404 Not Found`
- Server errors: `500 Internal Server Error`

Error responses follow format:
```json
{
  "error": "Error message description"
}
```

## Development

### Running in Development Mode

Set environment variables:
```bash
export FLASK_ENV=development
export FLASK_DEBUG=1
```

Or in `.env`:
```
FLASK_ENV=development
FLASK_DEBUG=1
```

### Testing

Test the health endpoint:
```bash
curl http://localhost:5001/health
```

Test with authentication:
```bash
curl -H "Authorization: Bearer <token>" http://localhost:5001/api/contacts
```

### Debugging

- Enable debug mode for detailed error messages
- Check console logs for service initialization
- Verify Firebase credentials are loaded
- Check CORS configuration matches frontend origin

## Deployment

### WSGI Entry Point

The `wsgi.py` file creates the Flask app instance and can be used with WSGI servers like:
- Gunicorn
- uWSGI
- Waitress

Example with Gunicorn:
```bash
gunicorn wsgi:app --bind 0.0.0.0:5001
```

### Environment Setup

Ensure all environment variables are set in production:
- Use secure secret keys
- Configure production OAuth redirect URIs
- Set up Firebase credentials
- Configure CORS for production domains

## API Response Format

### Success Response
```json
{
  "data": {...},
  "message": "Success message"
}
```

### Error Response
```json
{
  "error": "Error message",
  "details": {...}
}
```

## External Services

The backend integrates with:
- **Firebase/Firestore**: User data and authentication
- **OpenAI**: Email generation and AI features
- **People Data Labs**: Contact enrichment
- **Stripe**: Payment processing
- **Gmail API**: Email sending and drafting
- **SerpAPI**: Company news fetching

## Security

- All API keys stored in environment variables
- Firebase authentication required for protected endpoints
- CORS configured for specific origins
- Security headers added to all responses
- Input validation on all endpoints

## Troubleshooting

### Common Issues

1. **Firebase not initialized**
   - Check `GOOGLE_APPLICATION_CREDENTIALS` path
   - Verify credentials file exists and is valid

2. **CORS errors**
   - Verify frontend origin is in allowed list
   - Check CORS configuration in `extensions.py`

3. **Import errors**
   - Ensure you're running from project root or backend directory
   - Check Python path includes backend directory

4. **Environment variables not loading**
   - Verify `.env` file is in project root
   - Check `load_dotenv()` is called before imports

## License

[Your License Here]

