# Next Steps Gameplan - Fantasy Hockey Data Science Platform

## Current Status ✅

### What We Have:
1. **NHL Data Acquisition** ✅
   - Working NHL API integration (`nhl-api-service.ts`)
   - Can fetch skater stats (summary, realtime, faceoffs)
   - Can fetch goalie stats
   - API routes set up (`/api/test-nhl-api`, `/api/refresh-stats`)

2. **Stats Display** ✅
   - Comprehensive player stats table
   - Search functionality (works across all players)
   - Sortable columns
   - Filters for skaters/goalies/combined
   - Display all stats in one view

3. **Infrastructure** ✅
   - Next.js 14 app with App Router
   - TypeScript setup
   - Tailwind CSS styling
   - Basic component structure

### What We're Missing:
- ❌ **Database integration** - Currently fetching from NHL API every time (slow, unreliable)
- ❌ **Player detail pages** - No way to drill into individual player stats
- ❌ **Fantasy league integration** - Can't connect user's leagues
- ❌ **Trade analyzer** - No way to evaluate trades
- ❌ **Roster management** - No team/roster features
- ❌ **User authentication** - No user accounts
- ❌ **Caching/persistent storage** - Data lost on refresh

---

## Priority Roadmap

### 🎯 Phase 1: Database & Persistence (Next 1-2 Weeks)
**Goal**: Store player data in database for fast, reliable access

#### 1.1 Set Up Database (Week 1)
- [ ] **Choose & Set Up PostgreSQL**
  - Local development database
  - Production-ready setup (Neon, Supabase, or Railway)
  - Connection string management (.env)

- [ ] **Create Prisma Schema**
  ```prisma
  model Player {
    id            Int      @id @default(autoincrement())
    nhlPlayerId   Int      @unique
    firstName     String
    lastName      String
    fullName      String
    position      String   // C, LW, RW, D, G
    team          String?  // Team abbreviation
    jerseyNumber  Int?
    height        String?
    weight        Int?
    birthDate     DateTime?
    nationality   String?
    
    stats         PlayerStats[]
    createdAt     DateTime @default(now())
    updatedAt     DateTime @updatedAt
  }

  model PlayerStats {
    id            Int      @id @default(autoincrement())
    playerId      Int
    season        String   // "20232024"
    gameType      Int      @default(2) // 2 = regular season
    gamesPlayed   Int
    goals         Int
    assists       Int
    points        Int
    plusMinus     Int
    penaltyMinutes Int
    shots         Int
    shootingPct   Float?
    hits          Int?
    blockedShots  Int?
    giveaways     Int?
    takeaways     Int?
    faceoffPct    Float?
    timeOnIcePerGame String?
    // Goalie stats
    wins          Int?
    losses        Int?
    otLosses      Int?
    savePct       Float?
    gaa           Float?
    shutouts      Int?
    
    player        Player   @relation(fields: [playerId], references: [id])
    
    createdAt     DateTime @default(now())
    updatedAt     DateTime @updatedAt
    
    @@unique([playerId, season, gameType])
    @@index([season])
    @@index([points])
  }

  model DataRefresh {
    id          Int      @id @default(autoincrement())
    refreshType String   // "player_stats", "goalies", "rosters"
    status      String   // "success", "error", "in_progress"
    lastRefresh DateTime
    recordCount Int?
    errorMessage String?
    createdAt   DateTime @default(now())
  }
  ```

- [ ] **Initialize Prisma**
  - Run `npx prisma init`
  - Create migration for schema
  - Generate Prisma client

#### 1.2 Migrate Data Fetching to Database (Week 1-2)
- [ ] **Update `/api/refresh-stats` Route**
  - Fetch from NHL API (as currently does)
  - Store/update players in database
  - Store/update player stats in database
  - Upsert logic (handle existing players)
  - Error handling and logging

- [ ] **Create Database-First API Route**
  - New route: `/api/players/stats`
  - Query from database instead of NHL API
  - Fast responses (< 100ms vs 5+ seconds)
  - Filtering, sorting, pagination in database

- [ ] **Update StatsDisplay Component**
  - Switch from `/api/test-nhl-api` to `/api/players/stats`
  - Much faster page loads
  - Better error handling

#### 1.3 Set Up Automated Data Refresh (Week 2)
- [ ] **Configure Cron Jobs**
  - Daily refresh at 3 AM (after NHL games update)
  - Vercel cron or external service
  - Error notifications if refresh fails

- [ ] **Add Data Freshness Tracking**
  - Show "Last updated: X hours ago" in UI
  - Alert if data is stale (> 24 hours old)
  - Manual refresh button for users

**Deliverable**: Fast, reliable player stats from database instead of slow API calls

---

### 🎯 Phase 2: Player Detail Pages & Enhanced Analytics (Week 3-4)
**Goal**: Allow users to dive deep into individual player stats

#### 2.1 Player Detail Page
- [ ] **Create `/app/players/[id]/page.tsx`**
  - Route with dynamic player ID
  - Fetch player data from database
  - Display comprehensive stats table
  - Headshot image (from NHL API)

- [ ] **Player Stats Breakdown**
  - Current season stats
  - Last 10 games breakdown
  - Home vs Away splits
  - Month-by-month performance
  - Career averages

- [ ] **Visualizations**
  - Points trend graph (last 10 games)
  - Goals/assists breakdown (pie chart)
  - Performance over time (line graph)
  - Shot/goal ratio trends

#### 2.2 Link from Stats Table
- [ ] **Make Player Names Clickable**
  - Navigate to `/players/[id]` on click
  - Pass player ID from StatsDisplay component

#### 2.3 Enhanced Filtering/Search
- [ ] **Advanced Filters**
  - Filter by team (dropdown)
  - Filter by position (C, LW, RW, D)
  - Filter by minimum games played
  - Filter by stat thresholds (min points, goals, etc.)
  - Save filter presets

**Deliverable**: Users can click on any player to see detailed stats and trends

---

### 🎯 Phase 3: Player Comparison & Value Tools (Week 5-6)
**Goal**: Help users make informed decisions

#### 3.1 Player Comparison Tool
- [ ] **Comparison Page `/app/compare`**
  - Select 2-4 players to compare
  - Side-by-side stat comparison
  - Highlight differences
  - "Better in" indicators for each category

- [ ] **Add Compare Button to Stats Table**
  - Checkbox to select players
  - "Compare Selected" button

#### 3.2 Player Value Calculator
- [ ] **Multi-Category Scoring**
  - League scoring settings input (G, A, P, +/-, PIM, SOG, HIT, BLK, PPP, etc.)
  - Calculate fantasy value per player
  - Z-score normalization
  - Display "Value" column in stats table

- [ ] **Value-Based Sorting**
  - Sort by fantasy value
  - Show value rank

**Deliverable**: Users can compare players and see calculated fantasy values

---

### 🎯 Phase 4: Fantasy League Integration (Week 7-9)
**Goal**: Connect user's fantasy leagues

#### 4.1 User Authentication
- [ ] **Set Up NextAuth.js**
  - Google/GitHub OAuth login
  - User model in database
  - Session management

#### 4.2 ESPN Integration (Start Here - Most Common)
- [ ] **Research ESPN API/Scraping**
  - Test ESPN fantasy API endpoints
  - Determine authentication method
  - League ID extraction

- [ ] **League Connection Flow**
  - "Connect League" button
  - Input league ID and year
  - Fetch and store roster data
  - Display user's team

#### 4.3 Team Dashboard
- [ ] **My Team Page**
  - Show roster
  - Current matchup (for H2H leagues)
  - Category standings
  - Suggested pickups

#### 4.4 Roster Storage
- [ ] **Database Schema for Fantasy**
  ```prisma
  model User {
    id          Int      @id @default(autoincrement())
    email       String   @unique
    name        String?
    fantasyLeagues FantasyLeague[]
  }

  model FantasyLeague {
    id          Int      @id @default(autoincrement())
    userId      Int
    platform    String   // "espn", "yahoo", "sleeper"
    leagueId    String
    leagueName  String
    year        Int
    teams       FantasyTeam[]
    user        User     @relation(fields: [userId], references: [id])
  }

  model FantasyTeam {
    id          Int      @id @default(autoincrement())
    leagueId    Int
    teamName    String
    roster      FantasyRoster[]
    league      FantasyLeague @relation(fields: [leagueId], references: [id])
  }

  model FantasyRoster {
    id          Int      @id @default(autoincrement())
    teamId      Int
    playerId    Int      // Reference to Player.nhlPlayerId
    position    String   // "C", "LW", "RW", "D", "G", "BN", "IR"
    acquiredDate DateTime?
    team        FantasyTeam @relation(fields: [teamId], references: [id])
  }
  ```

**Deliverable**: Users can connect their ESPN league and see their roster

---

### 🎯 Phase 5: Trade Analyzer & Recommendations (Week 10-12)
**Goal**: Help users make smart trades

#### 5.1 Trade Analyzer Tool
- [ ] **Trade Input Interface**
  - Select players from "My Team"
  - Select players from "Other Team"
  - Calculate value exchange
  - Show category impact

- [ ] **Trade Evaluation**
  - Value gain/loss calculation
  - Category impact analysis
  - "Fairness" score
  - Recommendations (accept/reject/negotiate)

#### 5.2 Waiver Wire Analysis
- [ ] **Best Available Players**
  - Filter by position
  - Show fantasy value
  - Highlight category strengths
  - "Add to Watchlist" feature

#### 5.3 Lineup Optimizer
- [ ] **Optimal Lineup Suggestions**
  - Based on upcoming games
  - Category needs
  - Start/sit recommendations

**Deliverable**: Users can analyze trades and get pickup recommendations

---

## Immediate Next Steps (This Week)

### Priority 1: Database Setup
1. **Choose Database Provider**
   - **Option A**: Neon (PostgreSQL, free tier, easy setup)
   - **Option B**: Supabase (PostgreSQL + extras, free tier)
   - **Option C**: Local PostgreSQL (dev only)
   - **Recommendation**: Start with Neon for easy cloud setup

2. **Install & Configure Prisma**
   ```bash
   npm install prisma @prisma/client
   npx prisma init
   ```

3. **Create Schema**
   - Use schema from Phase 1.1 above
   - Focus on Player and PlayerStats models first
   - Can add fantasy tables later

4. **First Migration**
   ```bash
   npx prisma migrate dev --name init
   npx prisma generate
   ```

### Priority 2: Update Data Refresh Route
1. **Modify `/api/refresh-stats/route.ts`**
   - Keep existing NHL API fetching
   - Add Prisma client
   - Upsert players to database
   - Upsert stats to database
   - Return count of records updated

2. **Test Endpoint**
   - Call `/api/refresh-stats`
   - Verify data in database
   - Check for duplicates/errors

### Priority 3: Create Database Query Route
1. **Create `/api/players/stats/route.ts`**
   - Query Player and PlayerStats from database
   - Support filtering, sorting, pagination
   - Much faster than NHL API

2. **Update StatsDisplay Component**
   - Switch from `/api/test-nhl-api` to `/api/players/stats`
   - Should see massive performance improvement

---

## Success Metrics

### Phase 1 Success:
- ✅ Stats page loads in < 1 second (vs 5+ seconds currently)
- ✅ Data persists after refresh
- ✅ Daily automatic updates working
- ✅ Can handle 1000+ players efficiently

### Phase 2 Success:
- ✅ Can click on any player to see details
- ✅ Player pages load quickly
- ✅ Visualizations working
- ✅ Users engage with player detail pages

---

## Technical Decisions Needed

### 1. Database Hosting
- **Recommendation**: Start with Neon (neon.tech)
  - Free tier: 0.5 GB storage, good for development
  - Easy setup, PostgreSQL-compatible
  - Good for Next.js projects

### 2. Data Refresh Strategy
- **Daily Batch**: Refresh all players once per day (3 AM)
- **On-Demand**: Allow manual refresh button
- **Incremental**: In future, only update changed players

### 3. Caching Strategy
- **Database as Cache**: Primary cache layer
- **React Query**: Client-side caching (can add later)
- **Redis**: Optional for advanced caching (not needed yet)

---

## Long-Term Roadmap (After Phase 5)

### Advanced Features:
1. **ML Projections** (already have basic structure)
   - Next game projections
   - Weekly projections
   - Rest-of-season projections

2. **Schedule Analysis**
   - Upcoming games
   - Opponent difficulty
   - Streaming suggestions

3. **Line Combination Tracking**
   - Current lines
   - Power play units
   - Usage trends

4. **Injury Integration**
   - Injury reports
   - Expected return dates
   - Impact on value

5. **Yahoo & Sleeper Integration**
   - Expand beyond ESPN

---

## Summary

**Current State**: Working prototype with NHL data display
**Next Focus**: Database persistence for speed and reliability
**Timeline**: 2 weeks to Phase 1 completion
**Key Win**: Fast, reliable stats page (1s vs 5s+)

The immediate priority is moving from API-dependent to database-backed data, which will unlock all future features and make the platform production-ready.

