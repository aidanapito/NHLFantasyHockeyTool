# Duplicate Player Entries Issue

## Problem

You're seeing "no game logs found" for players like Mitch Marner and other good players, even though they definitely played last year.

## Root Cause

**There are duplicate player entries in the database** with different NHL IDs:
- **Correct entry**: Has the real NHL ID (e.g., 8478483) with game logs ✅
- **Duplicate entry**: Has an incorrect NHL ID (e.g., 3899937) with 0 game logs ❌

### Example: Mitch Marner

- **Correct**: DB ID 44, NHL ID 8478483 (TOR) - **337 game logs** ✅
- **Duplicate**: DB ID 1089, NHL ID 3899937 (VGK) - **0 game logs** ❌

When fantasy rosters use the wrong NHL ID, the matchup analyzer can't find game logs.

## Current Status

Found **20 players** with duplicate entries, including:
- Mitch Marner
- Sebastian Aho (3 entries!)
- Elias Pettersson (3 entries!)
- Alex Tuch
- Alex DeBrincat
- And 15+ more...

## How It's Currently Handled

The matchup analyzer (`lib/matchup-analyzer.ts`) has logic (lines 1123-1164) to resolve players with no game logs by:
1. Finding players with the same name
2. Matching them to players with game logs
3. Using the player with game logs for predictions

**However**, this is a workaround. The real issue is duplicate entries in the database.

## Check Duplicates

Run this script to see all duplicate players:

```bash
npm run check-duplicate-players
```

This will show:
- Which players have duplicates
- Which entry has game logs
- Which entry should be kept/removed

## Solution Options

### Option 1: Manual Cleanup (Recommended for Now)

For each duplicate:
1. Identify which entry has game logs (correct one)
2. Update FantasyRoster entries to use the correct player ID
3. Delete the duplicate player entry

### Option 2: Automated Cleanup Script (Future)

Create a script that:
1. Identifies duplicate players (one with logs, one without)
2. Updates all FantasyRoster entries to use the correct player ID
3. Deletes duplicate player entries

### Option 3: Fix Player Import Process (Long-term)

Fix the root cause - ensure player imports don't create duplicates:
- Check `ensurePlayerExists` in `lib/player-matcher.ts`
- Ensure NHL IDs are validated before creating new players
- Add unique constraint on `nhlId` (already exists, so this shouldn't happen)

## For Mitch Marner Specifically

The correct entry is:
- **DB ID**: 44
- **NHL ID**: 8478483
- **Status**: Has 337 game logs ✅

The duplicate entry is:
- **DB ID**: 1089
- **NHL ID**: 3899937
- **Status**: Has 0 game logs ❌

**Action needed**: Check which NHL ID ESPN/fantasy rosters are using, and update them to use NHL ID 8478483 (or ensure the matchup analyzer's resolution logic works correctly).

## Quick Test

To verify the matchup analyzer is resolving correctly, check the logs when running matchup analysis. You should see messages like:

```
[Matchup Projections] Resolved Mitch Marner (NHL ID 3899937, no logs) -> DB ID 44 (NHL ID 8478483, with logs)
```

If you see this message, the resolution is working. If you don't see it, the resolution logic may not be working for all cases.

