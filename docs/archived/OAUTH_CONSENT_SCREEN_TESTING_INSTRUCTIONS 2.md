# OAuth Consent Screen Testing Instructions

## Project Information
- **Project ID**: offerloop-native
- **Project Number**: 184607281467
- **Application Name**: Offerloop
- **Application URL**: https://www.offerloop.ai

## How to Access and Test the OAuth Consent Screen

### Method 1: Direct OAuth URL (Recommended for Testing)

You can directly access the OAuth consent screen by visiting this URL in your browser:

```
https://accounts.google.com/o/oauth2/v2/auth?client_id=YOUR_CLIENT_ID&redirect_uri=https://www.offerloop.ai/api/google/oauth/callback&response_type=code&scope=https://www.googleapis.com/auth/gmail.compose%20https://www.googleapis.com/auth/gmail.readonly%20https://www.googleapis.com/auth/gmail.send%20openid%20https://www.googleapis.com/auth/userinfo.email%20https://www.googleapis.com/auth/userinfo.profile&access_type=offline&include_granted_scopes=true&prompt=consent
```

**Note**: Replace `YOUR_CLIENT_ID` with the actual Client ID from the OAuth 2.0 Client in Google Cloud Console.

### Method 2: Through the Application Flow

1. **Visit the application homepage**: https://www.offerloop.ai
2. **Navigate to Sign In**: Click on "Sign In" or visit https://www.offerloop.ai/signin
3. **Click "Sign in with Google"**: This will initiate Firebase Authentication first
4. **After Firebase sign-in completes**: The application automatically checks if Gmail is connected
5. **Gmail OAuth Flow**: If Gmail is not connected, the application automatically redirects to the OAuth consent screen

### Method 3: Programmatic Access (For Automated Testing)

The OAuth flow can be initiated via API:

**Endpoint**: `GET https://www.offerloop.ai/api/google/oauth/start`

**Headers Required**:
```
Authorization: Bearer <Firebase_ID_Token>
```

**Response**: Returns a JSON object with `authUrl` that contains the OAuth consent screen URL:
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "state": "<state_token>"
}
```

## OAuth Scopes Requested

The application requests the following scopes:

1. `https://www.googleapis.com/auth/gmail.compose` - Create and compose Gmail drafts
2. `https://www.googleapis.com/auth/gmail.readonly` - Read Gmail messages (read-only)
3. `https://www.googleapis.com/auth/gmail.send` - Send emails through Gmail
4. `openid` - OpenID Connect authentication
5. `https://www.googleapis.com/auth/userinfo.email` - Access user's email address
6. `https://www.googleapis.com/auth/userinfo.profile` - Access user's basic profile information

## What You Should See on the Consent Screen

When you access the OAuth consent screen, you should see:

1. **Application Name**: "Offerloop" (or the name configured in OAuth consent screen settings)
2. **Application Logo**: (if configured)
3. **Permission Request**: A list of permissions being requested
4. **Account Selection**: Option to select which Google account to use
5. **Consent Buttons**: "Allow" and "Cancel" buttons

## Testing User Accounts

If the application is in **Testing** mode, you will need to add test user accounts:

1. Go to Google Cloud Console → APIs & Services → OAuth consent screen
2. Scroll to "Test users" section
3. Add the Google account email addresses that should be able to test the OAuth flow
4. Save the changes

**Important**: Only accounts added to the "Test users" list will be able to complete the OAuth flow when the app is in Testing mode.

## OAuth Redirect URI

The OAuth callback redirect URI is:
- **Production**: `https://www.offerloop.ai/api/google/oauth/callback`
- **Development**: `http://localhost:5001/api/google/oauth/callback` (for local testing only)

## Troubleshooting

### If you see "access_denied" error:
- The application may be in Testing mode and your account is not in the test users list
- Solution: Add your Google account email to the Test users list in OAuth consent screen settings

### If you see "redirect_uri_mismatch" error:
- The redirect URI in the OAuth request doesn't match what's configured in Google Cloud Console
- Solution: Verify that `https://www.offerloop.ai/api/google/oauth/callback` is added to the Authorized redirect URIs in the OAuth 2.0 Client settings

### If the consent screen doesn't appear:
- Check that the OAuth consent screen is published (not in draft state)
- Verify that all required fields are filled in the OAuth consent screen configuration
- Ensure the scopes are properly configured and approved

## Application Use Case

**Purpose**: Offerloop helps users create personalized email drafts in Gmail for networking and job applications. The Gmail OAuth scopes are required to:
- Create email drafts in the user's Gmail account
- Read email content (for context)
- Send emails (only when explicitly authorized by the user)

**User Flow**:
1. User signs in with Google (Firebase Authentication)
2. User connects their Gmail account (OAuth flow)
3. User provides contact information and resume
4. Application generates personalized email drafts
5. Drafts are created in the user's Gmail account
6. User reviews and sends emails manually from Gmail

## Contact Information

If you need additional information or encounter issues accessing the OAuth consent screen, please contact:
- **Email**: [Your support email]
- **Application Support**: https://www.offerloop.ai

---

**Last Updated**: [Current Date]
**Application Version**: Production

