# Player Matching and Deduplication Guide

## Overview

This system ensures that every player matches itself across different IDs in different tables, preventing duplicate players and maintaining data integrity across all data sources (NHL API, ESPN, manual imports).

## Key Components

### 1. Player Matcher (`lib/player-matcher.ts`)

A comprehensive player matching utility that uses a cascading approach:

1. **NHL ID Matching** (Highest Confidence - 1.0)
   - Matches players by their unique NHL ID
   - Used when importing from NHL API or ESPN (when NHL ID is available)

2. **Exact Name Matching** (High Confidence - 0.9-0.95)
   - Matches by exact full name (case-insensitive)
   - Falls back to first + last name matching
   - Position matching increases confidence

3. **Fuzzy Name Matching** (Lower Confidence - 0.85+)
   - Uses Levenshtein distance algorithm
   - Handles name variations, abbreviations, typos
   - Only used when exact matching fails

### 2. Player Deduplicator (`lib/player-deduplicator.ts`)

Utilities to detect and merge duplicate players:

- **`detectAndReportDuplicates()`**: Finds all duplicate players and suggests which to keep
- **`mergeDuplicatePlayers()`**: Merges duplicate players into a single record, updating all related tables

### 3. API Endpoints

#### `GET /api/players/deduplicate`
Finds and reports all duplicate players in the database.

**Response:**
```json
{
  "success": true,
  "duplicates": [
    {
      "players": [
        {
          "id": 123,
          "nhlId": 8471214,
          "fullName": "Connor McDavid",
          "firstName": "Connor",
          "lastName": "McDavid",
          "position": "C",
          "team": "EDM"
        }
      ],
      "similarity": 0.95,
      "reason": "Similar name (95%) and same position",
      "suggestedKeepId": 123
    }
  ],
  "totalDuplicates": 5
}
```

#### `POST /api/players/deduplicate`
Merges duplicate players.

**Request:**
```json
{
  "playerIds": [123, 456, 789],
  "keepPlayerId": 123
}
```

**Response:**
```json
{
  "success": true,
  "mergedCount": 2,
  "message": "Successfully merged 2 duplicate player(s)"
}
```

## How It Works

### During Data Import

#### NHL API Refresh (`app/api/refresh-stats/route.ts`)
- Uses `ensurePlayerExists()` to find or create players
- Matches by NHL ID first (from API)
- Falls back to name matching if NHL ID is missing
- Updates existing players with new information

#### ESPN Import (`lib/espn/league.ts`)
- Uses enhanced matching logic within transactions
- Matches by NHL ID if available from ESPN
- Falls back to name + position matching
- Creates players with temporary negative NHL IDs if no ID available

### Player Matching Flow

```
Input: Player data (NHL ID, name, position, etc.)
  ↓
1. Try NHL ID match → Found? Return (confidence: 1.0)
  ↓ No
2. Try exact name match → Found? Return (confidence: 0.9-0.95)
  ↓ No
3. Try fuzzy name match → Found? Return (confidence: 0.85+)
  ↓ No
4. Create new player
```

## Database Schema

All tables consistently use `Player.id` (database ID) as the foreign key:

- ✅ `PlayerStats.playerId` → `Player.id`
- ✅ `GameLog.playerId` → `Player.id`
- ✅ `FantasyRoster.playerId` → `Player.id`

The `Player.nhlId` is used for matching but is not used as a foreign key.

## Handling Missing NHL IDs

When a player doesn't have an NHL ID:
- Temporary negative IDs are assigned (e.g., -1, -2, -3...)
- These can be updated later when the NHL ID becomes available
- The system still matches by name to prevent duplicates

## Best Practices

### 1. Regular Duplicate Detection

Run duplicate detection periodically:
```bash
curl http://localhost:3000/api/players/deduplicate
```

### 2. Merging Duplicates

When duplicates are found:
1. Review the suggested keep player
2. Verify it has the most complete data
3. Merge using the API:
```bash
curl -X POST http://localhost:3000/api/players/deduplicate \
  -H "Content-Type: application/json" \
  -d '{"playerIds": [123, 456], "keepPlayerId": 123}'
```

### 3. Data Import Order

1. Import from NHL API first (most reliable NHL IDs)
2. Then import from ESPN (will match existing players)
3. Manual imports last (will match existing players)

## Example Usage

### Finding a Player

```typescript
import { findOrMatchPlayer } from '@/lib/player-matcher';

const result = await findOrMatchPlayer({
  nhlId: 8471214,
  fullName: "Connor McDavid",
  firstName: "Connor",
  lastName: "McDavid",
  position: "C",
});

if (result.player) {
  console.log(`Found player: ${result.player.fullName} (confidence: ${result.confidence})`);
} else {
  console.log('Player not found');
}
```

### Ensuring Player Exists

```typescript
import { ensurePlayerExists } from '@/lib/player-matcher';

const result = await ensurePlayerExists({
  nhlId: 8471214,
  fullName: "Connor McDavid",
  firstName: "Connor",
  lastName: "McDavid",
  position: "C",
  team: "EDM",
});

console.log(`Player ID: ${result.id}, Created: ${result.created}, Matched: ${result.matched}`);
```

## Troubleshooting

### Issue: Duplicate players with same NHL ID

**Cause**: Data integrity issue or race condition during import

**Solution**: 
1. Run duplicate detection
2. Merge duplicates keeping the player with most complete data
3. Ensure NHL ID uniqueness constraint is working

### Issue: Players not matching across sources

**Cause**: Name variations or missing NHL IDs

**Solution**:
1. Check name normalization (handles most variations)
2. Verify fuzzy matching threshold (default 0.85)
3. Manually merge if needed using deduplication API

### Issue: Performance with large datasets

**Cause**: Fuzzy matching scans all players

**Solution**:
- Fuzzy matching is limited to 1000 candidates
- Position filtering reduces candidates
- Consider adding database indexes on name fields

## Future Enhancements

- [ ] Add ESPN player ID mapping table
- [ ] Implement player merge history/audit log
- [ ] Add automatic duplicate detection cron job
- [ ] Improve fuzzy matching with phonetic algorithms (Soundex, Metaphone)
- [ ] Add confidence scoring for manual review

