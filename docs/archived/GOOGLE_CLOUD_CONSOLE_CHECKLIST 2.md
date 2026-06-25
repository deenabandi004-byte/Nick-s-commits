# Google Cloud Console OAuth Setup Checklist

Before sending the testing instructions to Google, verify the following in your Google Cloud Console:

## 1. OAuth Consent Screen Configuration

**Location**: Google Cloud Console → APIs & Services → OAuth consent screen

### Required Fields:
- [ ] **App name**: Set to "Offerloop" (or your preferred name)
- [ ] **User support email**: Your support email address
- [ ] **Developer contact information**: Your email address
- [ ] **App domain**: 
  - Homepage URL: `https://www.offerloop.ai`
  - Privacy Policy URL: (Required for sensitive/restricted scopes)
  - Terms of Service URL: (Optional but recommended)
- [ ] **Authorized domains**: `offerloop.ai` should be listed
- [ ] **Application logo**: (Optional but recommended - upload your app logo)

### Publishing Status:
- [ ] **Publishing status**: 
  - If in "Testing" mode: Add Google reviewer accounts to "Test users" list
  - If in "Production" mode: Ensure all required information is complete

### Scopes:
- [ ] Verify all requested scopes are listed:
  - `https://www.googleapis.com/auth/gmail.compose`
  - `https://www.googleapis.com/auth/gmail.readonly`
  - `https://www.googleapis.com/auth/gmail.send`
  - `openid`
  - `https://www.googleapis.com/auth/userinfo.email`
  - `https://www.googleapis.com/auth/userinfo.profile`

## 2. OAuth 2.0 Client Configuration

**Location**: Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs

### Client ID Settings:
- [ ] **Application type**: Web application
- [ ] **Name**: Descriptive name (e.g., "Offerloop Web Client")
- [ ] **Authorized JavaScript origins**: 
  - `https://www.offerloop.ai`
  - `http://localhost:8080` (for local development, if needed)
- [ ] **Authorized redirect URIs**: 
  - `https://www.offerloop.ai/api/google/oauth/callback` ✅ **CRITICAL**
  - `http://localhost:5001/api/google/oauth/callback` (for local development)

### Client ID Information:
- [ ] **Note your Client ID**: You'll need this for the testing instructions
- [ ] **Client Secret**: Keep this secure (stored in environment variables)

## 3. APIs Enabled

**Location**: Google Cloud Console → APIs & Services → Enabled APIs

Verify these APIs are enabled:
- [ ] **Gmail API**: Must be enabled
- [ ] **Google+ API** (if using userinfo scopes): May be required
- [ ] **People API** (if using userinfo scopes): May be required

## 4. Test Users (If in Testing Mode)

**Location**: Google Cloud Console → APIs & Services → OAuth consent screen → Test users

- [ ] Add Google reviewer email addresses to the test users list
- [ ] Add your own test accounts
- [ ] **Important**: Only accounts in this list can complete OAuth when app is in Testing mode

## 5. Domain Verification

**Location**: Google Cloud Console → APIs & Services → OAuth consent screen → Domain verification

- [ ] **Domain verified**: `offerloop.ai` should be verified
- [ ] Verification method: DNS TXT record or HTML file upload

## 6. Privacy Policy

**Location**: Google Cloud Console → APIs & Services → OAuth consent screen → App domain

- [ ] **Privacy Policy URL**: Must be publicly accessible
- [ ] Privacy policy must mention:
  - What data you collect
  - How you use Gmail data
  - How you store user data
  - User rights and data deletion

## 7. Verification Requirements Checklist

Based on Google's requirements, ensure you have:

### All Scopes (Non-Sensitive, Sensitive, Restricted):
- [ ] App Homepage: `https://www.offerloop.ai`
- [ ] Domain Verification: `offerloop.ai` verified
- [ ] App Identity & Branding: Logo, name, support email configured
- [ ] Cloud Abuse Project History: No violations

### Restricted and Sensitive Only:
- [ ] App Privacy Policy: Publicly accessible URL
- [ ] Demo Video: (If required - shows OAuth flow)
- [ ] In-app Testing: Instructions provided
- [ ] Application Use Cases: Documented
- [ ] Requesting Minimum Scopes: Only necessary scopes requested

### Restricted Only:
- [ ] CASA Security Assessment: (If applicable for restricted scopes)

## 8. Common Issues to Check

### Issue: "redirect_uri_mismatch"
- [ ] Verify redirect URI in code matches exactly with Google Cloud Console
- [ ] Check for trailing slashes, http vs https, subdomain differences
- [ ] Current redirect URI: `https://www.offerloop.ai/api/google/oauth/callback`

### Issue: "access_denied" or "not a test user"
- [ ] App is in Testing mode
- [ ] Reviewer's Google account is in Test users list
- [ ] Consider switching to Production mode (after completing all requirements)

### Issue: Consent screen not appearing
- [ ] OAuth consent screen is published (not in draft)
- [ ] All required fields are filled
- [ ] Domain is verified
- [ ] Privacy policy URL is accessible

## 9. Environment Variables

Verify these are set correctly in your production environment:
- [ ] `GOOGLE_CLIENT_ID`: Matches the Client ID in Google Cloud Console
- [ ] `GOOGLE_CLIENT_SECRET`: Matches the Client Secret in Google Cloud Console
- [ ] `OAUTH_REDIRECT_URI`: Set to `https://www.offerloop.ai/api/google/oauth/callback`

## 10. Testing Before Submission

Before sending instructions to Google, test yourself:

1. [ ] Visit `https://www.offerloop.ai/signin`
2. [ ] Sign in with Google
3. [ ] Verify OAuth consent screen appears
4. [ ] Complete the OAuth flow
5. [ ] Verify Gmail connection succeeds
6. [ ] Test creating a draft in Gmail

## Next Steps

1. Complete all checklist items above
2. Test the OAuth flow yourself
3. Copy the email template from `EMAIL_TO_GOOGLE_OAUTH_TESTING.md`
4. Replace `[YOUR_CLIENT_ID]` with your actual Client ID
5. Add your contact information
6. Send the email as a reply to Google's verification email

---

**Important Notes**:
- Keep your Client Secret secure - never share it
- The Client ID is safe to share in the testing instructions
- Make sure your Privacy Policy is publicly accessible
- If in Testing mode, add Google reviewer emails to test users list

