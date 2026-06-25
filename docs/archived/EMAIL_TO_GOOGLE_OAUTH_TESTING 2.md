# Email Response to Google - OAuth Consent Screen Testing Instructions

---

**Subject**: Re: OAuth Verification - Testing Instructions for Project 184607281467 (offerloop-native)

---

Hello Google Developer Team,

Thank you for reviewing our OAuth verification request. Please find below detailed instructions on how to access and test the OAuth consent screen for our application.

## Project Information
- **Project ID**: offerloop-native
- **Project Number**: 184607281467
- **Application URL**: https://www.offerloop.ai

## How to Access the OAuth Consent Screen

### Option 1: Direct URL Access (Easiest for Testing)

You can directly access the OAuth consent screen by constructing and visiting this URL:

```
https://accounts.google.com/o/oauth2/v2/auth?client_id=[YOUR_CLIENT_ID]&redirect_uri=https://www.offerloop.ai/api/google/oauth/callback&response_type=code&scope=https://www.googleapis.com/auth/gmail.compose%20https://www.googleapis.com/auth/gmail.readonly%20https://www.googleapis.com/auth/gmail.send%20openid%20https://www.googleapis.com/auth/userinfo.email%20https://www.googleapis.com/auth/userinfo.profile&access_type=offline&include_granted_scopes=true&prompt=consent
```

**Note**: Replace `[YOUR_CLIENT_ID]` with the OAuth 2.0 Client ID from the Google Cloud Console for project `offerloop-native`. You can find this in:
- Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs

### Option 2: Through the Application

1. Visit: https://www.offerloop.ai/signin
2. Click "Sign in with Google" (this uses Firebase Authentication)
3. After signing in, the application automatically checks if Gmail is connected
4. If Gmail is not connected, you will be automatically redirected to the OAuth consent screen

### Option 3: Via API Endpoint

The OAuth flow can be initiated programmatically:

**Endpoint**: `GET https://www.offerloop.ai/api/google/oauth/start`

**Required Header**: 
```
Authorization: Bearer <Firebase_ID_Token>
```

**Response**: Returns JSON with `authUrl` containing the OAuth consent screen URL.

## OAuth Scopes Requested

Our application requests the following scopes:
- `https://www.googleapis.com/auth/gmail.compose` - Create Gmail drafts
- `https://www.googleapis.com/auth/gmail.readonly` - Read Gmail messages (read-only)
- `https://www.googleapis.com/auth/gmail.send` - Send emails through Gmail
- `openid` - OpenID Connect authentication
- `https://www.googleapis.com/auth/userinfo.email` - Access user's email address
- `https://www.googleapis.com/auth/userinfo.profile` - Access user's basic profile

## OAuth Redirect URI

The authorized redirect URI is:
- **Production**: `https://www.offerloop.ai/api/google/oauth/callback`

This URI is configured in the OAuth 2.0 Client settings in Google Cloud Console.

## Testing Mode Considerations

If the application is currently in **Testing** mode, please ensure that:
1. Your Google account email is added to the "Test users" list in:
   - Google Cloud Console → APIs & Services → OAuth consent screen → Test users
2. Only test user accounts will be able to complete the OAuth flow

## What You Should See

When accessing the OAuth consent screen, you should see:
- Application name: "Offerloop" (or as configured)
- List of permissions being requested
- Account selection interface
- "Allow" and "Cancel" buttons

## Application Use Case

**Purpose**: Offerloop helps users create personalized email drafts in Gmail for professional networking and job applications. The Gmail OAuth scopes are required to:
- Create email drafts in the user's Gmail account
- Read email content for context
- Send emails (only when explicitly authorized by the user)

**User Flow**:
1. User signs in with Google (Firebase Authentication)
2. User connects their Gmail account (OAuth flow - this is the consent screen you need to test)
3. User provides contact information and resume
4. Application generates personalized email drafts
5. Drafts are created in the user's Gmail account
6. User reviews and sends emails manually from Gmail

## Troubleshooting

If you encounter any issues:

1. **"access_denied" error**: The app may be in Testing mode. Add your Google account to the Test users list.

2. **"redirect_uri_mismatch" error**: Verify that `https://www.offerloop.ai/api/google/oauth/callback` is listed in the Authorized redirect URIs in OAuth 2.0 Client settings.

3. **Consent screen doesn't appear**: 
   - Verify OAuth consent screen is published (not in draft)
   - Check that all required fields are completed
   - Ensure scopes are properly configured

## Additional Information

If you need the exact Client ID or require additional information, please let me know. I can also provide a test user account if needed.

Thank you for your assistance with the verification process.

Best regards,
[Your Name]
[Your Email]
[Your Contact Information]

---

