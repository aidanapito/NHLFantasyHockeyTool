---
name: Projected Week Matchup with ML Model
overview: Add projected week matchup functionality to the Matchup Analyzer by integrating the ML player performance model. The system will predict stats for each player's games during the selected week and aggregate projections to show which team is projected to win each category.
todos:
  - id: create-batch-predict-script
    content: Create Python batch prediction script (batch_predict.py) that accepts JSON input, loads model once, and predicts stats for multiple player-game combinations
    status: completed
  - id: extend-inference-helpers
    content: Add predict_game_for_player() helper function to inference.py that accepts explicit game context (opponent, date, home/away) and builds appropriate features
    status: completed
  - id: create-batch-api-endpoint
    content: Create /api/ml-projections/matchup endpoint that calls Python batch prediction script via child_process and returns predictions
    status: completed
    dependencies:
      - create-batch-predict-script
  - id: enhance-matchup-service
    content: Add analyzeWeeklyMatchupWithProjections() function to matchup-analyzer.ts that gets player games, calls batch prediction, and aggregates results
    status: completed
    dependencies:
      - create-batch-api-endpoint
  - id: update-matchup-api-route
    content: Modify /api/matchup/analyze to accept projections parameter and call enhanced matchup service when requested
    status: completed
    dependencies:
      - enhance-matchup-service
  - id: update-matchup-ui
    content: Add projections toggle and UI to MatchupAnalyzer.tsx to display projected stats alongside current stats with category win indicators
    status: completed
    dependencies:
      - update-matchup-api-route
---

# Projected Week Matchup with ML Model

## Overview

Extend the existing Matchup Analyzer to include ML-based projections for upcoming week matchups. The system will predict per-game stats for each roster player using the trained `TabularMultiTaskModel`, aggregate predictions across all games in the week, and compare projected category totals between teams.

## Architecture

### Data Flow

```
Matchup Analyzer UI
  ↓ (team IDs, week start date)
/api/matchup/analyze (POST) - Enhanced
  ↓
 - Fetch team rosters
 - Fetch NHL schedule for week
 - For each active player:
  - Determine games they play
  - Call batch prediction API
  ↓
/api/ml-projections/matchup (POST) - New
  ↓
 - Prepare prediction requests (player_id, game_date, opponent, is_home)
 - Call Python batch prediction script
  ↓
analytics-service/modeling/batch_predict.py - New
  ↓
 - Load model (cached per request)
 - For each request:
  - Load player historical data up to game_date
  - Build features (rolling stats, opponent quality, etc.)
  - Predict stats for that game
  ↓
 - Return JSON predictions
  ↓
 - Aggregate player predictions across week
 - Aggregate team totals
 - Compare categories
  ↓
 - Return projected matchup results
  ↓
Matchup Analyzer UI - Enhanced
 - Display projected vs actual stats
 - Show projected category wins
```

## Implementation Tasks

### 1. Create Python Batch Prediction Script

**File**: `analytics-service/modeling/batch_predict.py`

- Accept JSON input via stdin or file with structure:
  ```json
  {
    "predictions": [
      {
        "player_id": 8471214,
        "game_date": "2025-01-15",
        "opponent_team": "TOR",
        "player_team": "EDM",
        "is_home": true
      }
    ]
  }
  ```

- Load model once at startup (cache for batch efficiency)
- For each prediction:
                - Load player's historical `GameLog` data up to (but not including) `game_date`
                - Build feature vector using existing `build_feature_tables` logic
                - Use last available game's context for rolling stats
                - Make prediction using loaded model
- Return JSON output with predicted stats for each request
- Handle edge cases:
                - Player with no historical data (use zeros/defaults)
                - Game date in the past (validation error)
                - Missing opponent/team info

### 2. Create Batch Prediction API Endpoint

**File**: `app/api/ml-projections/matchup/route.ts`

- Accept POST request with:
  ```typescript
  {
    predictions: Array<{
      playerId: number;
      gameDate: string; // YYYY-MM-DD
      opponentTeam: string;
      playerTeam: string;
      isHome: boolean;
    }>
  }
  ```

- Execute Python script via `child_process.spawn()`:
  ```typescript
  python -m analytics-service.modeling.batch_predict
  ```

- Pass JSON via stdin, read JSON from stdout
- Handle errors gracefully (missing model, Python errors, etc.)
- Return predictions in same order as input

### 3. Enhance Matchup Analysis Service

**File**: `lib/matchup-analyzer.ts`

- Add new function `analyzeWeeklyMatchupWithProjections()`:
                - Takes same inputs as `analyzeWeeklyMatchup()` (team refs, week start)
                - Calls existing `analyzeWeeklyMatchup()` for current stats
                - For each active player in each team:
                                - Find games they play in the week (from schedule)
                                - Prepare prediction requests for each game
                - Batch all prediction requests and call `/api/ml-projections/matchup`
                - Aggregate per-player predictions across week (sum stats)
                - Aggregate team totals from player projections
                - Calculate projected category wins
                - Return enhanced `MatchupComparison` with:
    ```typescript
    {
      ...existing_fields,
      projections: {
        team1: TeamStats; // Projected stats
        team2: TeamStats;
        categoryWins: {
          team1: number;
          team2: number;
        };
      }
    }
    ```


### 4. Update Matchup API Route

**File**: `app/api/matchup/analyze/route.ts`

- Add optional query parameter `?projections=true` or body field
- If projections requested:
                - Call `analyzeWeeklyMatchupWithProjections()` instead of `analyzeWeeklyMatchup()`
                - Return enhanced response with projections

### 5. Update Matchup Analyzer UI

**File**: `components/MatchupAnalyzer.tsx`

- Add toggle/checkbox: "Show Projected Stats"
- When enabled:
                - Call API with `projections: true` parameter
                - Display projected stats section alongside current stats
                - Show side-by-side comparison:
                                - Current stats (existing)
                                - Projected stats (new)
                                - Difference/trend indicators
                - Highlight projected category winners
                - Show projected final score (category wins)
- Add loading state for projection generation
- Handle errors (model not available, prediction failures)

### 6. UI Design Enhancements

- **Projected Stats Section**:
                - Similar layout to current stats comparison
                - Color coding: green (favorable projection), red (unfavorable), gray (neutral)
                - Show projected vs current differential
                - Projected category wins badge
- **Player-Level Projections** (optional, advanced view):
                - Expandable section showing per-player projections
                - Per-game breakdown for players with multiple games
                - Confidence indicators (if model provides uncertainty)

## Technical Considerations

### Model Input Requirements

The model expects:

- Player's historical game logs up to prediction date
- Features: rolling averages, opponent quality, position, home/away, etc.
- Current implementation in `predict_next_game_for_player()` uses last game's features

**Solution**: Extend `inference.py` with `predict_game_for_player()` that:

- Accepts explicit game context (opponent, date, home/away)
- Loads player data up to that date
- Builds features using that context
- Returns prediction

### Performance Optimization

- **Model Loading**: Load once per batch request (not per prediction)
- **Feature Building**: Cache feature-building logic where possible
- **Batching**: Process all players in single Python call to avoid startup overhead
- **Caching**: Cache predictions for same player/date combinations (optional, future enhancement)

### Error Handling

- Player with no historical data: Skip or use zero/default predictions
- Model not found: Return error, fallback to historical averages
- Python script errors: Log, return partial results or error
- Missing game data: Skip that game's prediction

### Category Matching

Match projected stats to fantasy categories:

- Skater: goals, assists, points, +/-, PIM, PPP, shots, hits, blocks
- Goalie: wins, saves, GAA, SV%, shutouts

Use same category calculation as existing matchup analyzer.

## Files to Create/Modify

### New Files

1. `analytics-service/modeling/batch_predict.py` - Batch prediction script
2. `analytics-service/modeling/inference.py` - Add `predict_game_for_player()` helper
3. `app/api/ml-projections/matchup/route.ts` - Batch prediction API endpoint

### Modified Files

1. `lib/matchup-analyzer.ts` - Add `analyzeWeeklyMatchupWithProjections()`
2. `app/api/matchup/analyze/route.ts` - Add projections parameter
3. `components/MatchupAnalyzer.tsx` - Add projections UI

## Testing Strategy

1. **Unit Tests**:

                        - Test batch prediction script with sample inputs
                        - Test projection aggregation logic
                        - Test category win calculations

2. **Integration Tests**:

                        - Test full flow: UI → API → Python → Results
                        - Test with real team rosters
                        - Test edge cases (no historical data, missing games, etc.)

3. **Manual Testing**:

                        - Select two teams in UI
                        - Enable projections
                        - Verify predictions appear
                        - Compare projections to actual results (for past weeks)

## Future Enhancements (Out of Scope)

- Confidence intervals/uncertainty quantification
- Sensitivity analysis (best/worst case projections)
- Lineup optimization based on projections
- Historical accuracy tracking
- Player-level projection details UI
- Caching predictions for performance