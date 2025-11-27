# Scripts Directory

Utility scripts for the NHL Stat Analyzer project.

## test-espn.js

Interactive script to test ESPN Fantasy League API connection.

### Usage

```bash
# Make sure your dev server is running first
npm run dev

# In another terminal, run:
npm run test-espn
```

The script will prompt you for:
- League ID (from ESPN URL)
- Season year (e.g., 2025 for 2024-25 season)
- Whether the league is private
- ESPN cookies (if private)

### Example

```bash
$ npm run test-espn

=== ESPN Fantasy League API Tester ===

Enter your League ID: 12345678
Enter season year (e.g., 2025 for 2024-25): 2025
Is your league private? (y/n): n

🧪 Testing connection...

✅ Successfully connected to ESPN!

League: My Fantasy Hockey League
Season: 2025
Teams: 12
Scoring Type: headToHead
Categories: G, A, +/-, PIM, PPP, SOG, HITS, BLKS, W, SV%, GAA

📊 Teams:
  - Team 1 (Owner: John, Roster: 20 players)
  - Team 2 (Owner: Sarah, Roster: 20 players)
  ...
```

## Dependencies

No additional npm packages required - uses Node.js built-in modules only.


