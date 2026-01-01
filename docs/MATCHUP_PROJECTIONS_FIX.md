# Matchup Projections Fix

## Issue
The matchup analyzer was incorrectly counting filtered-out games as "missing predictions", leading to confusing log messages and potentially incorrect aggregation.

## Root Cause
The code was iterating through all games in `playerBreakdown` (including games that were filtered out due to date filtering) and counting them as "missing" even though they were intentionally excluded.

## Fix
Removed the `team1MissingCount++` and `team2MissingCount++` increments when games don't pass the date filter. Games that are filtered out (e.g., past games) are now silently skipped, and "missing" only counts games that were requested but not found in the prediction results.

## Changes Made
**File**: `lib/matchup-analyzer.ts`

- Line ~1442: Removed `team1MissingCount++` when game not in requestedGames
- Line ~1498: Removed `team2MissingCount++` when game not in requestedGames

## Result
- ✅ Logs now show accurate "missing predictions" counts (0 for both teams)
- ✅ Projections are aggregated correctly for all requested games
- ✅ Filtered games (past games) are correctly skipped without being counted as missing

## Behavior
The projections feature correctly:
1. Filters games to only include future games (games on or after the cutoff date)
2. Requests predictions for those future games only
3. Aggregates predictions accurately
4. Shows projections for remaining games in the selected week

This is the correct behavior - projections should only be for future games, not past games that have already been played.

