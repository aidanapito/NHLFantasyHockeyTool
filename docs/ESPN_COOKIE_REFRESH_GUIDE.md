# ESPN Cookie Refresh Guide

## Current Status

✅ **API Integration**: Code is working correctly  
❌ **Authentication**: Cookies appear to be expired or invalid

## Problem

ESPN is returning HTML instead of JSON, which means authentication failed. This typically happens when:
1. Cookies have expired (most common)
2. Cookies were copied incorrectly
3. The league requires fresh authentication

## How to Get Fresh Cookies

### Step 1: Open Your ESPN Fantasy League
1. Go to https://fantasy.espn.com/hockey/
2. Log in if needed
3. Navigate to your league (ID: 91445140)
4. Make sure you're on the league homepage or team page

### Step 2: Open Developer Tools
- **Mac**: Press `Cmd + Option + I`
- **Windows/Linux**: Press `F12` or `Ctrl + Shift + I`

### Step 3: Find the Cookies
1. Click on the **Application** tab (Chrome) or **Storage** tab (Firefox)
2. In the left sidebar, expand **Cookies**
3. Click on `https://fantasy.espn.com`
4. Find these two cookies:
   - **SWID** - Should look like: `{1D922F28-5927-49E5-922F-28592759E536}`
   - **espn_s2** - A long base64-like string

### Step 4: Copy the Cookies
1. Click on the **SWID** cookie
2. Copy the **Value** field (including the curly braces `{}`)
3. Click on the **espn_s2** cookie
4. Copy the **Value** field

### Step 5: Format the Cookie String
Combine them in this exact format:
```
SWID={your-swid-value}; espn_s2={your-espn_s2-value}
```

**Important Notes:**
- Keep the curly braces `{}` around the SWID value
- Include a semicolon and space between the two cookies
- Don't add any quotes around the values
- Copy the raw values - don't URL encode them (the code handles that)

### Step 6: Test the Cookies
Use the test endpoint to verify they work:
```bash
curl -X POST http://localhost:3000/api/fantasy/test-espn \
  -H "Content-Type: application/json" \
  -d '{
    "leagueId": "91445140",
    "season": "2026",
    "espnCookies": "SWID={your-swid}; espn_s2={your-espn_s2}"
  }'
```

## Alternative: Browser Network Tab Method

If the Application tab doesn't show cookies:

1. Open Developer Tools → **Network** tab
2. Refresh the league page
3. Click on any request to `fantasy.espn.com`
4. Look at **Request Headers**
5. Find the `Cookie:` header
6. Copy the entire cookie string

The cookie header will look like:
```
Cookie: SWID={...}; espn_s2=...; other_cookie=...; ...
```

You can use just the SWID and espn_s2 parts for the API.

## Troubleshooting

### Cookies Still Not Working?
1. **Make sure you're logged in** - Open the league in a regular browser tab and verify you can see your team
2. **Try in an incognito window** - Sometimes browser extensions interfere
3. **Check for typos** - The SWID must have curly braces, no spaces around the semicolon
4. **Verify league access** - Make sure you can access the league normally

### Common Errors

**"HTML instead of JSON"**
- Cookies are expired or invalid
- Get fresh cookies following steps above

**"League not found"**
- Check the league ID in the ESPN URL
- Verify the season year (use 2026 for 2025-26 season)

**"401 Unauthorized"**
- Cookies are missing or malformed
- Verify the cookie string format

## Update Your Credentials

Once you have fresh cookies, update them in:
1. The setup script: `scripts/setup-espn-league.js`
2. Any API calls you make directly
3. Your application configuration (if storing them)

## Security Note

⚠️ **Important**: These cookies give full access to your ESPN account. Treat them like passwords:
- Don't commit them to git
- Don't share them publicly
- They expire periodically, so you'll need to refresh them

