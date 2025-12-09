# Fantasy League Integration & Category Management Roadmap

## Current Status
✅ NHL player stats are being collected  
✅ Z-score calculations for fantasy value  
❌ No fantasy league data (roster ownership)  
❌ No category analysis  

## Goal
Enable category management features by integrating with fantasy leagues to know:
- Which players you own
- Which players your opponents own
- Your team's strengths and weaknesses by category

---

## Phase 1: Database Schema for Fantasy Leagues

### 1.1 Add Prisma Models for Fantasy Data

```prisma
model FantasyLeague {
  id            String   @id @default(cuid())
  platform      String   // 'espn', 'yahoo', 'sleeper'
  platformId    String   // Original league ID from platform
  leagueName    String
  season        String
  scoringType   String   // 'h2h', 'roto'
  categories    String[] // ['G', 'A', '+/-', 'PIM', etc.]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  teams         FantasyTeam[]
  owners        User[]   @relation("LeagueOwners")

  @@unique([platform, platformId, season])
}

model FantasyTeam {
  id            String   @id @default(cuid())
  leagueId      String
  teamName      String
  ownerName     String?
  platformTeamId String  // Original team ID from platform
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  league        FantasyLeague @relation(fields: [leagueId], references: [id], onDelete: Cascade)
  roster        FantasyRoster[]
  owner         User?    @relation("TeamOwner")

  @@unique([leagueId, platformTeamId])
}

model FantasyRoster {
  id            String   @id @default(cuid())
  teamId        String
  playerId      Int
  slotPosition  String   // 'C', 'LW', 'RW', 'D', 'G', 'BN', 'IR'
  addedDate     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  team          FantasyTeam @relation(fields: [teamId], references: [id], onDelete: Cascade)
  player        Player   @relation(fields: [playerId], references: [nhlId], onDelete: Cascade)

  @@unique([teamId, playerId])
  @@index([teamId])
  @@index([playerId])
}
```

### 1.2 Run Migration
```bash
npx prisma migrate dev --name add_fantasy_league_schema
```

---

## Phase 2: League Integration (Choose One Platform to Start)

### Option A: Sleeper (Easiest - No Auth Required)
**Pros:**
- No authentication needed
- Well-documented API
- Simple HTTP requests

**Implementation Steps:**
1. User provides Sleeper league ID
2. Fetch league data: `GET https://api.sleeper.app/v1/league/{leagueId}`
3. Fetch rosters: `GET https://api.sleeper.app/v1/league/{leagueId}/rosters`
4. Fetch users/team names: `GET https://api.sleeper.app/v1/league/{leagueId}/users`
5. Map player IDs from Sleeper to NHL player IDs
6. Save to database

### Option B: Yahoo (Official API but Requires OAuth)
**Pros:**
- Official API
- Reliable data
**Cons:**
- Requires OAuth setup
- More complex authentication flow

### Option C: ESPN (Unofficial/Cookie-Based)
**Pros:**
- Most popular platform
**Cons:**
- No official API
- Requires web scraping or cookies
- May break easily

### Recommendation: Start with Sleeper
Create API route: `/api/fantasy/connect-league`

---

## Phase 3: Category Analysis & Trade Recommendations

### 3.1 Category Analysis Endpoint
**Route:** `GET /api/fantasy/categories?teamId={id}`

**What it does:**
1. Fetch team roster
2. Sum stats across all owned players for each category
3. Compare to league averages
4. Identify strong and weak categories
5. Return analysis with rankings

**Example Response:**
```json
{
  "teamName": "My Team",
  "categories": [
    {
      "category": "G",
      "yourTotal": 45,
      "leagueRank": 3,
      "leagueAverage": 38,
      "strength": "strong",
      "need": false
    },
    {
      "category": "BLK",
      "yourTotal": 120,
      "leagueRank": 10,
      "leagueAverage": 180,
      "strength": "weak",
      "need": true
    }
  ]
}
```

### 3.2 Trade Target Finder
**Route:** `GET /api/fantasy/trade-targets?teamId={id}&category={cat}`

**What it does:**
1. Identify players you DON'T own who excel in weak categories
2. Filter by position needs (if you have weak D, prioritize D-men)
3. Rank by Z-score in specific categories
4. Calculate trade value

**Example Response:**
```json
{
  "category": "BLK",
  "targets": [
    {
      "player": "Artemi Panarin",
      "team": "NYR",
      "position": "L",
      "blocks": 45,
      "blockPerGame": 4.5,
      "zScore": 2.3,
      "currentOwner": "Team B"
    }
  ]
}
```

### 3.3 Punt Strategy Calculator
**Route:** `GET /api/fantasy/punt-strategy?leagueId={id}`

**What it does:**
1. Calculate total category points if you "punt" one category
2. Simulate different punt strategies (punting SV%, punting FW, etc.)
3. Show optimal strategy based on your roster

---

## Phase 4: UI Components

### 4.1 League Connection Page
- Form to enter league ID (platform-specific)
- Dropdown to select platform (ESPN/Yahoo/Sleeper)
- Button to fetch and import league data
- Display league info after connection

### 4.2 Team Dashboard
- Team roster display
- Category strength visualization (bar chart)
- Quick stats: "You're strongest in G, weakest in BLK"
- Action buttons: "Find Trade Targets", "Get Recommendations"

### 4.3 Category Analysis Page
- Table showing all categories with your rank
- Visual indicators (green for strong, red for weak)
- Trade target recommendations per category
- "Find players to help with this category" button

### 4.4 Trade Analyzer (Future)
- Select player to trade away
- Get recommended players to target
- Show category impact
- Calculate whether trade helps your weak categories

---

## Implementation Priority

### Week 1: Database & ESPN Integration (Updated for User's Platform)
1. ✅ Add Prisma schema (models above)
2. ✅ Run migration
3. ✅ Create API route to connect ESPN league
4. ✅ Fetch and store roster data (unofficial ESPN API)
5. ✅ Create UI to enter league ID + optional cookies
6. ⚠️ Alternative: CSV import as fallback

### Week 2: Category Analysis
1. ✅ Build category analysis endpoint
2. ✅ Calculate league rankings
3. ✅ Identify weak categories
4. ✅ Create visualization component

### Week 3: Trade Recommendations
1. ✅ Build trade target finder
2. ✅ Filter by position needs
3. ✅ Calculate category impact
4. ✅ Create UI to display recommendations

### Week 4: Polish & Additional Platforms
1. ✅ Add ESPN/Yahoo support
2. ✅ Build punt strategy calculator
3. ✅ Add manual roster import option
4. ✅ Polish UI/UX

---

## Next Steps

Choose one to start:
1. **Sleeper Integration** - Easiest, no auth needed
2. **Manual Import** - Simple CSV upload for now
3. **Database First** - Just build the schema and work offline

Which would you like to tackle first?

