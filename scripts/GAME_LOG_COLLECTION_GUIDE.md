# Game Log Collection Guide

## Overview
This guide explains how to collect game-by-game data directly from the NHL API. This is the recommended approach since it provides accurate, complete game-by-game data.

## How It Works

The collection script:
1. Fetches game-by-game stats from NHL API using `isGame: true` parameter
2. Combines summary stats (goals, assists, points) with realtime stats (hits, blocks)
3. Stores each game as a separate record in the `GameLog` table
4. Automatically skips duplicates

## Usage

### Basic Collection

Collect all players for a season:
```bash
npm run collect-game-logs -- --season=20232024
```

### Test with One Player

Test with a specific player first:
```bash
npm run collect-game-logs -- --season=20232024 --player-id=8471214
```
(8471214 is Connor McDavid's NHL ID - you can find player IDs in your database)

### Dry Run (Test Without Inserting)

Test the collection without inserting data:
```bash
npm run collect-game-logs -- --season=20232024 --dry-run
```

### Limit Players (For Testing)

Test with first 10 players:
```bash
npm run collect-game-logs -- --season=20232024 --limit=10
```

### Collect Multiple Seasons

Run for each season you want:
```bash
# 2021-22 season
npm run collect-game-logs -- --season=20212022

# 2022-23 season
npm run collect-game-logs -- --season=20222023

# 2023-24 season
npm run collect-game-logs -- --season=20232024
```

## Season Format

Seasons use the format: `YYYY(YY+1)`
- 2021-22 season = `20212022`
- 2022-23 season = `20222023`
- 2023-24 season = `20232024`
- 2024-25 season = `20242025`

## Collection Process

### What Gets Collected

For each player, the script collects:
- **Game identification**: gameId, gameDate, season, gameType
- **Context**: opponent, home/away, team
- **Skater stats**: goals, assists, points, shots, hits, blocks, PPP, plus/minus, PIM, TOI
- **Goalie stats**: wins, saves, shots against, goals against, SV%, shutouts

### Rate Limiting

- 200ms delay between API requests
- 300ms delay between players
- Automatic retry on failures
- Respects NHL API rate limits

### Performance

- **Per player**: ~1-2 seconds (depending on games played)
- **Full season (850 players)**: ~15-30 minutes
- **3 seasons**: ~45-90 minutes

## Example Output

```
🚀 Starting game log collection...

Season: 20232024

📊 Processing 850 players...

[1/850] Processing Connor McDavid (NHL ID: 8471214)...
  ✓ Inserted 82 game logs
[2/850] Processing Nathan MacKinnon (NHL ID: 8477492)...
  ✓ Inserted 82 game logs
  ⊘ Skipped 0 duplicates
...

📊 Collection Summary
==================================================
Total players:     850
Processed:         850
Game logs inserted: 69,700
Game logs skipped:  0
Errors:            0
Total game logs:   69,700
==================================================

✅ Collection completed!
```

## Troubleshooting

### Player Not Found
If a player is not found in your database:
- The script will skip them
- Check your Player table to ensure all players are imported
- Run your stats refresh first to populate players

### API Errors
If you get API errors:
- Check your internet connection
- NHL API may be temporarily unavailable
- Wait a few minutes and retry
- The script will continue with other players

### Duplicate Records
- The script automatically skips duplicates
- If you see "Skipped X duplicates", that's normal for re-runs
- Each player-game combination is unique

### Slow Collection
- This is normal - collecting 3 seasons takes time
- You can run it overnight
- Or collect one season at a time

## Verification

After collection, verify data:

```sql
-- Check total game logs
SELECT COUNT(*) FROM "GameLog";

-- Check by season
SELECT season, COUNT(*) 
FROM "GameLog" 
GROUP BY season 
ORDER BY season;

-- Check a specific player
SELECT * FROM "GameLog" 
WHERE "playerId" = (SELECT id FROM "Player" WHERE "fullName" = 'Connor McDavid' LIMIT 1)
ORDER BY "gameDate" DESC 
LIMIT 10;

-- Check games per player
SELECT p."fullName", COUNT(*) as games
FROM "GameLog" gl
JOIN "Player" p ON p.id = gl."playerId"
WHERE gl.season = '20232024'
GROUP BY p."fullName"
ORDER BY games DESC
LIMIT 20;
```

## Next Steps

After collecting game logs:
1. Verify data quality (see queries above)
2. Train your ML model with the game-by-game data
3. Set up daily collection for ongoing games (Phase 3)

## Tips

- **Start small**: Test with `--limit=10` first
- **One player test**: Use `--player-id` to test a specific player
- **Dry run first**: Always test with `--dry-run` before full collection
- **Monitor progress**: The script shows progress for each player
- **Re-run safe**: You can re-run - duplicates are automatically skipped

