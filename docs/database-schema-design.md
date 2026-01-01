# Database Schema Design

## Overview
This document outlines the ideal database structure for the NHL Stat Analyzer, showing how data flows from external sources into the database and how entities relate to each other.

## Data Sources

1. **NHL API** (`statsapi.web.nhl.com`)
   - Player information (names, positions, teams)
   - Game-by-game statistics
   - Schedule information
   - Player IDs (NHL IDs)

2. **ESPN Fantasy API**
   - League information
   - Team rosters
   - Player IDs (may differ from NHL IDs)

3. **Sleeper Fantasy API** (optional)
   - League information
   - Team rosters
   - Player IDs

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL DATA SOURCES                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐          │
│  │   NHL API    │      │  ESPN API   │      │ Sleeper API │          │
│  │              │      │              │      │              │          │
│  │ - Players    │      │ - Leagues    │      │ - Leagues    │          │
│  │ - Game Logs  │      │ - Teams      │      │ - Teams      │          │
│  │ - Schedules  │      │ - Rosters    │      │ - Rosters    │          │
│  └──────┬───────┘      └──────┬───────┘      └──────┬───────┘          │
│         │                      │                      │                  │
│         │                      │                      │                  │
└─────────┼──────────────────────┼──────────────────────┼──────────────────┘
          │                      │                      │
          │                      │                      │
          ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          DATABASE SCHEMA                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                         Player (Core Entity)                       │ │
│  │  ┌────────────────────────────────────────────────────────────┐  │ │
│  │  │ id: Int (PK) - Internal database ID                       │  │ │
│  │  │ nhlId: Int (UNIQUE) - Current NHL API player ID            │  │ │
│  │  │ firstName: String                                          │  │ │
│  │  │ lastName: String                                            │  │ │
│  │  │ fullName: String                                            │  │ │
│  │  │ position: String (C, LW, RW, D, G)                         │  │ │
│  │  │ team: String? (current team abbreviation)                  │  │ │
│  │  │ isActive: Boolean                                          │  │ │
│  │  │ createdAt: DateTime                                         │  │ │
│  │  │ updatedAt: DateTime                                         │  │ │
│  │  └────────────────────────────────────────────────────────────┘  │ │
│  │                                                                     │ │
│  │  ┌────────────────────────────────────────────────────────────┐  │ │
│  │  │ PlayerIdMapping (NEW - Track ID changes)                  │  │ │
│  │  │  ┌──────────────────────────────────────────────────────┐ │  │ │
│  │  │  │ id: Int (PK)                                         │ │  │ │
│  │  │  │ playerId: Int (FK -> Player.id)                      │ │  │ │
│  │  │  │ nhlId: Int - Historical NHL ID                        │ │  │ │
│  │  │  │ espnId: String? - ESPN player ID                      │ │  │ │
│  │  │  │ sleeperId: String? - Sleeper player ID                 │ │  │ │
│  │  │  │ source: String - Where this ID came from              │ │  │ │
│  │  │  │ isActive: Boolean - Is this the current ID?          │ │  │ │
│  │  │  │ createdAt: DateTime                                    │ │  │ │
│  │  │  └──────────────────────────────────────────────────────┘ │  │ │
│  │  └────────────────────────────────────────────────────────────┘  │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                         GameLog                                   │ │
│  │  ┌────────────────────────────────────────────────────────────┐  │ │
│  │  │ id: Int (PK)                                               │  │ │
│  │  │ playerId: Int (FK -> Player.id) ⚠️ ALWAYS use DB ID        │  │ │
│  │  │ gameId: Int                                                 │  │ │
│  │  │ gameDate: DateTime                                          │  │ │
│  │  │ season: String (e.g., "20232024")                          │  │ │
│  │  │ gameType: String ("regular", "playoff")                    │  │ │
│  │  │ opponentTeam: String                                        │  │ │
│  │  │ isHome: Boolean                                             │  │ │
│  │  │ team: String                                                │  │ │
│  │  │                                                              │  │ │
│  │  │ -- Skater Stats                                             │  │ │
│  │  │ goals: Int                                                  │  │ │
│  │  │ assists: Int                                                │  │ │
│  │  │ points: Int                                                 │  │ │
│  │  │ shots: Int                                                  │  │ │
│  │  │ shotsOnGoal: Int                                           │  │ │
│  │  │ hits: Int                                                   │  │ │
│  │  │ blocks: Int                                                 │  │ │
│  │  │ powerPlayPoints: Int                                        │  │ │
│  │  │ plusMinus: Int                                              │  │ │
│  │  │ pim: Int                                                    │  │ │
│  │  │ timeOnIceSeconds: Int                                       │  │ │
│  │  │                                                              │  │ │
│  │  │ -- Goalie Stats                                             │  │ │
│  │  │ wins: Int                                                   │  │ │
│  │  │ saves: Int                                                  │  │ │
│  │  │ shotsAgainst: Int                                          │  │ │
│  │  │ goalsAgainst: Int                                          │  │ │
│  │  │ savePct: Float                                             │  │ │
│  │  │ shutouts: Int                                               │  │ │
│  │  └────────────────────────────────────────────────────────────┘  │ │
│  │                                                                     │ │
│  │  @@unique([playerId, gameId])                                      │ │
│  │  @@index([playerId, season])                                       │ │
│  │  @@index([gameDate])                                               │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                      PlayerStats (Aggregated)                     │ │
│  │  ┌────────────────────────────────────────────────────────────┐  │ │
│  │  │ id: Int (PK)                                               │  │ │
│  │  │ playerId: Int (FK -> Player.id) ⚠️ ALWAYS use DB ID        │  │ │
│  │  │ season: String                                             │  │ │
│  │  │ gameType: String                                           │  │ │
│  │  │ gamesPlayed: Int                                           │  │ │
│  │  │                                                              │  │ │
│  │  │ -- Skater Stats (aggregated)                                │  │ │
│  │  │ goals: Int                                                  │  │ │
│  │  │ assists: Int                                               │  │ │
│  │  │ points: Int                                                 │  │ │
│  │  │ ... (other stats)                                          │  │ │
│  │  └────────────────────────────────────────────────────────────┘  │ │
│  │                                                                     │ │
│  │  @@unique([playerId, season, gameType])                          │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                      FantasyLeague                                │ │
│  │  ┌────────────────────────────────────────────────────────────┐  │ │
│  │  │ id: String (PK)                                           │  │ │
│  │  │ platform: String ("espn", "sleeper")                      │  │ │
│  │  │ platformId: String (external league ID)                   │  │ │
│  │  │ leagueName: String                                        │  │ │
│  │  │ season: String                                            │  │ │
│  │  │ scoringType: String?                                       │  │ │
│  │  │ categories: String[]                                      │  │ │
│  │  └────────────────────────────────────────────────────────────┘  │ │
│  │                                                                     │ │
│  │  @@unique([platform, platformId, season])                        │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                      FantasyTeam                                │ │
│  │  ┌────────────────────────────────────────────────────────────┐  │ │
│  │  │ id: String (PK)                                            │  │ │
│  │  │ leagueId: String (FK -> FantasyLeague.id)                 │  │ │
│  │  │ teamName: String                                           │  │ │
│  │  │ ownerName: String?                                         │  │ │
│  │  │ platformTeamId: String (external team ID)                 │  │ │
│  │  │ isMyTeam: Boolean                                          │  │ │
│  │  └────────────────────────────────────────────────────────────┘  │ │
│  │                                                                     │ │
│  │  @@unique([leagueId, platformTeamId])                              │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                      FantasyRoster                               │ │
│  │  ┌────────────────────────────────────────────────────────────┐  │ │
│  │  │ id: String (PK)                                            │  │ │
│  │  │ teamId: String (FK -> FantasyTeam.id)                      │  │ │
│  │  │ playerId: Int (FK -> Player.id) ⚠️ ALWAYS use DB ID         │  │ │
│  │  │ slotPosition: String                                       │  │ │
│  │  │ addedDate: DateTime                                        │  │ │
│  │  └────────────────────────────────────────────────────────────┘  │ │
│  │                                                                     │ │
│  │  @@unique([teamId, playerId])                                      │ │
│  │  @@index([playerId])                                               │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                      PlayerProjection (ML)                      │ │
│  │  ┌────────────────────────────────────────────────────────────┐  │ │
│  │  │ id: Int (PK)                                                │  │ │
│  │  │ playerId: Int (FK -> Player.id) ⚠️ ALWAYS use DB ID         │  │ │
│  │  │ gameDate: DateTime                                          │  │ │
│  │  │ projectedGoals: Float                                       │  │ │
│  │  │ projectedAssists: Float                                    │  │ │
│  │  │ ... (other projected stats)                                 │  │ │
│  │  │ modelVersion: String                                        │  │ │
│  │  │ createdAt: DateTime                                         │  │ │
│  │  └────────────────────────────────────────────────────────────┘  │ │
│  │                                                                     │ │
│  │  @@unique([playerId, gameDate, modelVersion])                      │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘

## Key Relationships

```
Player (1) ────────< (many) GameLog
Player (1) ────────< (many) PlayerStats
Player (1) ────────< (many) PlayerProjection
Player (1) ────────< (many) PlayerIdMapping
Player (1) ────────< (many) FantasyRoster

FantasyLeague (1) ────────< (many) FantasyTeam
FantasyTeam (1) ────────< (many) FantasyRoster
```

## Critical Rules

### 1. Player ID Resolution
- **NEVER** store NHL IDs directly in GameLog, PlayerStats, FantasyRoster, etc.
- **ALWAYS** use `Player.id` (database ID) as the foreign key
- Use `PlayerIdMapping` to track all external IDs (NHL, ESPN, Sleeper)

### 2. Data Flow

#### From NHL API → Database
```
NHL API (nhlId: 8478398)
    ↓
1. Check if Player exists with nhlId = 8478398
2. If not, create new Player
3. If yes, update Player info if needed
4. Create/Update PlayerIdMapping (nhlId: 8478398 → playerId: 24)
5. Create GameLog entries with playerId = 24 (NOT nhlId!)
```

#### From ESPN API → Database
```
ESPN API (espnPlayerId: "12345", playerName: "Kyle Connor")
    ↓
1. Try to find Player by:
   a. PlayerIdMapping.espnId = "12345"
   b. Player.fullName = "Kyle Connor" (if espnId not found)
2. If found, create/update PlayerIdMapping (espnId: "12345" → playerId: 24)
3. Create FantasyRoster with playerId = 24 (NOT espnId!)
```

### 3. Duplicate Prevention

**Problem**: Multiple Player entries for same person
- Player 1: id=24, nhlId=8478398, fullName="Kyle Connor" ✅ (has game logs)
- Player 2: id=1024, nhlId=3899952, fullName="Kyle Connor" ❌ (no game logs)

**Solution**:
1. Before creating new Player, check for existing by:
   - Exact name match (fullName)
   - Similar name match (firstName + lastName)
   - If found, use existing Player and add new PlayerIdMapping entry
2. Migration script to merge duplicates:
   - Identify duplicates by name
   - Keep the Player entry with most game logs
   - Move all related data to that entry
   - Delete duplicate entries

### 4. ID Mapping Strategy

```
Player (id: 24, fullName: "Kyle Connor")
    ↓
PlayerIdMapping entries:
  - nhlId: 8478398, isActive: true
  - nhlId: 3899952, isActive: false (old ID)
  - espnId: "12345", isActive: true
```

When resolving external IDs:
1. Look up PlayerIdMapping by external ID
2. Get playerId from mapping
3. Use that playerId for all operations

## Migration Steps

1. **Create PlayerIdMapping table**
2. **Populate PlayerIdMapping** from existing Player.nhlId values
3. **Identify duplicate Players** by name
4. **Merge duplicates**:
   - Keep Player with most GameLog entries
   - Update all foreign keys to point to kept Player
   - Add PlayerIdMapping entries for all NHL IDs
   - Delete duplicate Player entries
5. **Update all foreign keys** to ensure they use Player.id (not NHL IDs)
6. **Add constraints** to prevent future duplicates

## Data Collection Scripts

### collect-game-logs.ts
```typescript
// Pseudo-code
1. Fetch from NHL API using nhlId
2. Resolve to Player.id:
   - Find PlayerIdMapping where nhlId = fetchedNhlId
   - Get playerId from mapping
3. Create GameLog with playerId (NOT nhlId)
```

### sync-fantasy-roster.ts
```typescript
// Pseudo-code
1. Fetch from ESPN API
2. For each player in roster:
   a. Try PlayerIdMapping.espnId = espnPlayerId
   b. If not found, try Player.fullName = playerName
   c. If still not found, create new Player
   d. Create/update PlayerIdMapping
3. Create FantasyRoster with playerId (NOT espnId)
```

## Benefits of This Design

1. **Single Source of Truth**: One Player entry per actual person
2. **ID Flexibility**: Can track multiple external IDs per player
3. **Data Integrity**: All foreign keys use stable database IDs
4. **Easy Resolution**: PlayerIdMapping makes it easy to resolve any external ID
5. **No Duplicates**: Prevents the duplicate player problem
6. **Future-Proof**: Easy to add new data sources (Yahoo, Fantrax, etc.)


