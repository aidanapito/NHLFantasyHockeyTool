# Matchup Analyzer Projections Debug

## Issue
The matchup analyzer is not correctly showing projected stats for the week. One team shows all zeros or very low values.

## Current Flow

1. **Matchup Analyzer** (`lib/matchup-analyzer.ts`)
   - Gets roster players with NHL IDs
   - Converts NHL IDs → Database IDs using `nhlIdToDbId` map
   - Creates prediction requests with database IDs
   - Calls `/api/ml-projections/matchup` with database IDs

2. **Matchup Projections API** (`app/api/ml-projections/matchup/route.ts`)
   - Receives prediction requests with database IDs
   - Calls Python `batch_predict.py` script
   - Passes database IDs to Python script

3. **Python Batch Predict** (`analytics-service/modeling/batch_predict.py`)
   - Receives database IDs
   - Calls `predict_game_for_player_with_model()` with database IDs

4. **Python Inference** (`analytics-service/modeling/inference.py`)
   - Function `predict_game_for_player_with_model()` expects database IDs
   - Has fallback logic to handle NHL IDs if database ID not found
   - Queries GameLog using `features[features["player_id"] == player_id]`
   - GameLog.playerId uses database IDs (verified by validation)

## Potential Issues

### 1. Player ID Mismatch
The matchup analyzer converts NHL IDs to database IDs, but there might be issues with:
- Players not found in database
- Duplicate player entries (225 duplicate names found)
- Players without GameLog entries (227 active players with no logs)

### 2. Date Filtering
The matchup analyzer filters games by `cutoffDate`:
- Uses `weekStartDate` if provided
- Otherwise uses `today`
- Only includes games >= cutoffDate

### 3. Projection Aggregation
In `lib/matchup-analyzer.ts` lines 1426-1536:
- Aggregates projections per player per game
- Maps NHL ID → Database ID for lookups
- Uses key format: `${dbId}-${game.date}`

## Debugging Steps

1. **Check if players have GameLog entries**
   ```typescript
   // In matchup-analyzer.ts, log players without GameLog entries
   ```

2. **Verify NHL ID → Database ID mapping**
   ```typescript
   // Log the nhlIdToDbId map to see if all players are mapped
   ```

3. **Check Python script output**
   - Look for warnings about players not found
   - Check if predictions are all zeros

4. **Verify date filtering**
   - Ensure games are not being filtered out incorrectly
   - Check if weekStartDate is being used correctly

## Next Steps

1. Add logging to track player ID conversions
2. Check server logs for Python script errors
3. Verify that players have GameLog entries
4. Test with a single player to isolate the issue

