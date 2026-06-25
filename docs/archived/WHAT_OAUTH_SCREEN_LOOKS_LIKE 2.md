# What the OAuth Consent Screen Looks Like

## Visual Description

The OAuth consent screen is a Google page that appears when your app requests access to a user's Google account. Here's what you'll see:

### Top Section
- **Google logo** (top left)
- **"Sign in" or "Choose an account"** text
- Your **application name** (e.g., "Offerloop") - this comes from your OAuth consent screen settings
- Your **application logo** (if you uploaded one in Google Cloud Console)

### Middle Section - Account Selection
If the user has multiple Google accounts signed in, they'll see:
- A list of Google accounts to choose from
- Each account shows:
  - Profile picture
  - Email address
  - "Use another account" option at the bottom

### Bottom Section - Permission Request
After selecting an account, you'll see:

**"Offerloop wants to access your Google Account"**

Then a list of permissions being requested:

1. **"See, edit, compose, and send emails from your Gmail account"**
   - This is for: `gmail.compose`, `gmail.readonly`, `gmail.send`

2. **"See your primary Google Account email address"**
   - This is for: `userinfo.email`

3. **"See your personal info, including any personal info you've made publicly available"**
   - This is for: `userinfo.profile`

4. **"Associate you with your personal info on Google"**
   - This is for: `openid`

### Bottom Buttons
- **"Allow"** button (blue, primary button) - to grant permissions
- **"Cancel"** button (text link) - to deny access

### Warning Messages (If Applicable)
If your app is unverified or in testing mode, you might see:
- **Yellow warning banner**: "This app isn't verified" or "This app is in testing mode"
- Text explaining that only test users can access it

## What You Should See in Your Case

Based on your app setup, when you test it:

1. **Visit**: https://www.offerloop.ai/signin
2. **Click**: "Sign in with Google"
3. **First screen**: Google account selection (if multiple accounts)
4. **Second screen**: Firebase authentication completes
5. **Third screen**: OAuth consent screen appears automatically (if Gmail not connected)

The OAuth consent screen should show:
- App name: "Offerloop" (or whatever you set in Google Cloud Console)
- The 4 permission requests listed above
- "Allow" and "Cancel" buttons

## Screenshots Reference

The OAuth consent screen looks similar to this structure:

```
┌─────────────────────────────────────────┐
│ [Google Logo]     Sign in              │
├─────────────────────────────────────────┤
│                                         │
│         [Your App Logo]                 │
│         Offerloop                       │
│                                         │
│  Offerloop wants to access your         │
│  Google Account                         │
│                                         │
│  ✓ See, edit, compose, and send        │
│    emails from your Gmail account       │
│                                         │
│  ✓ See your primary Google Account     │
│    email address                        │
│                                         │
│  ✓ See your personal info              │
│                                         │
│  ✓ Associate you with your personal    │
│    info on Google                       │
│                                         │
│  [Cancel]  [Allow]                      │
│                                         │
└─────────────────────────────────────────┘
```

## How to Test It

1. **Go to**: https://www.offerloop.ai/signin
2. **Click**: "Sign in with Google"
3. **Select**: Your Google account
4. **Wait**: After Firebase sign-in completes
5. **Look for**: The OAuth consent screen should appear automatically

If you see a screen asking for Gmail permissions with "Allow" and "Cancel" buttons, that's the OAuth consent screen! ✅

## Common Issues

### If you DON'T see the OAuth screen:
- **Gmail already connected**: If you've already connected Gmail before, the app might skip the OAuth screen
- **Solution**: Disconnect Gmail first, or use a different test account

### If you see an error:
- **"access_denied"**: Your account might not be in the test users list (if app is in Testing mode)
- **"redirect_uri_mismatch"**: The redirect URI doesn't match what's configured

### If you see "This app isn't verified":
- This is normal if your app is in Testing mode or not yet verified
- Google reviewers will see this too - it's expected during verification

## What Google Reviewers Will See

Google reviewers will see the same OAuth consent screen you see. They need to:
1. Access the screen successfully
2. See all the permissions clearly listed
3. Understand what your app is requesting

That's why you're providing them with instructions on how to access it!

