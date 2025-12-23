# Matchup Analyzer ML Model - Complete Requirements Guide

## Overview

This document provides a comprehensive guide to the requirements, setup, and troubleshooting for the Machine Learning model used in the Matchup Analyzer feature. The model predicts player performance for upcoming games based on historical game-by-game data.

## Table of Contents

1. [Database Requirements](#database-requirements)
2. [Model Artifacts](#model-artifacts)
3. [Configuration Requirements](#configuration-requirements)
4. [Data Quality Requirements](#data-quality-requirements)
5. [ID Mapping Requirements](#id-mapping-requirements)
6. [Feature Engineering Requirements](#feature-engineering-requirements)
7. [Prediction Date Logic](#prediction-date-logic)
8. [Current Season Data Collection](#current-season-data-collection)
9. [Environment & Dependencies](#environment--dependencies)
10. [Data Flow Verification](#data-flow-verification)
11. [Troubleshooting](#troubleshooting)

---

## Database Requirements

### A. Player Table (`Player`)

**Required Columns:**
- `id` (INT, Primary Key) - Database internal ID
- `nhlId` (INT, Unique) - NHL API player ID
- `fullName` (TEXT) - Player's full name
- `position` (TEXT) - Player position (C, LW, RW, D, G)
- `team` (TEXT) - Current team abbreviation
- `birthDate` (TIMESTAMP) - Used for age calculation

**Purpose:** Provides player metadata for feature engineering and ID mapping.

**Verification:**
```sql
SELECT COUNT(*) FROM "Player" WHERE "nhlId" IS NOT NULL;
```

### B. GameLog Table (`GameLog`)

**Required Columns:**

**Identifiers:**
- `playerId` (INT) - Must match either `Player.id` OR `Player.nhlId`
- `gameId` (INT) - Unique game identifier
- `gameDate` (TIMESTAMP) - Date of the game
- `season` (TEXT) - Season identifier (format: `"20232024"` - no dash, 8 digits)
- `gameType` (TEXT) - Usually `"regular"`

**Game Context:**
- `opponentTeam` (TEXT) - Opponent team abbreviation (e.g., "TOR", "EDM")
- `isHome` (BOOLEAN) - Whether player's team is home
- `team` (TEXT) - Player's team abbreviation

**Skater Stats:**
- `goals`, `assists`, `points`
- `shots`, `shotsOnGoal`
- `hits`, `blocks`
- `powerPlayPoints`, `plusMinus`, `pim`
- `timeOnIceSeconds`

**Goalie Stats:**
- `wins`, `saves`, `shotsAgainst`, `goalsAgainst`
- `savePct`, `shutouts`

**Critical: Historical Data Requirements**

The model uses **only games that occurred BEFORE the prediction date**. For example, if predicting a game on December 14, 2025:

1. **2023-2024 Season (`"20232024"`):**
   - ✅ Full season data for historical context
   - Used for rolling averages and baseline performance
   - Provides career trends and long-term patterns

2. **2025-2026 Season (`"20252026"`):**
   - ✅ Only games that occurred BEFORE December 14, 2025
   - Example: Need GameLog entries from October-November 2025, and December 1-13, 2025
   - Used for recent form (last 3, 5, 10 games)
   - Provides current season context and in-season trends

**Why Both Seasons Matter:**
- **2023-2024**: Baseline performance, career trends, long-term averages
- **2025-2026 (partial)**: Recent form, current season context, in-season trends

**Season Format:**
- Must be exactly 8 digits, no dash: `"20232024"`, `"20252026"`
- NOT: `"2023-2024"` or `"2023/2024"`

---

## Model Artifacts

**Location:** `analytics-service/modeling/artifacts/player_perf_v1.*`

**Required Files:**
- ✅ `player_perf_v1.pt` - PyTorch model weights
- ✅ `player_perf_v1.metadata.json` - Target names, model configuration
- ✅ `player_perf_v1.scalers.json` - Numeric feature scalers
- ✅ `player_perf_v1.encoders.json` - Categorical encoders (position, team, etc.)

**Verification:**
```bash
ls -la analytics-service/modeling/artifacts/player_perf_v1.*
```

All four files must exist and be readable. If any are missing, the model needs to be retrained.

---

## Configuration Requirements

### A. Season Configuration

**File:** `analytics-service/modeling/config.py`

**Current State:** Only `["20232024"]` is configured

**Required Update:** Add `"20252026"` to the seasons list:

```python
seasons: List[str] = field(
    default_factory=lambda: [
        "20232024",  # Full historical season
        "20252026",  # Current season (for recent form)
    ]
)
```

**Why:** The model needs access to both seasons to:
- Load historical context from 2023-2024
- Load recent games from 2025-2026 (before prediction date)

**How It Works:**
- The query filters by `season IN (:seasons)` - both seasons will be loaded
- The inference code then filters to `game_date < prediction_date` - only historical games are used

---

## Data Quality Requirements

### A. Player Coverage

For each player in the matchup roster:

- [ ] Player exists in `Player` table with correct `id` and `nhlId`
- [ ] Player has at least 1 GameLog entry in 2023-2024 season
- [ ] Player has GameLog entries in 2025-2026 season (for games already played)
- [ ] `GameLog.playerId` correctly maps to `Player.id` OR `Player.nhlId`

**Check Player Coverage:**
```sql
-- Find players with no GameLog entries
SELECT p.id, p."nhlId", p."fullName"
FROM "Player" p
LEFT JOIN "GameLog" gl ON (gl."playerId" = p.id OR gl."playerId" = p."nhlId")
WHERE gl.id IS NULL
LIMIT 20;
```

### B. GameLog Data Completeness

**For 2023-2024 Season:**
- [ ] All roster players have entries
- [ ] Entries include all required stat columns
- [ ] `gameDate` is accurate and properly formatted
- [ ] `season` field is exactly `"20232024"` (no typos)

**For 2025-2026 Season (Partial):**
- [ ] Entries exist for games already played (before today/prediction date)
- [ ] Same completeness requirements as above
- [ ] `season` field is exactly `"20252026"`

**Check Season Data:**
```sql
-- Check what seasons exist in GameLog
SELECT season, COUNT(*) as game_count, COUNT(DISTINCT "playerId") as unique_players
FROM "GameLog"
GROUP BY season
ORDER BY season;
```

---

## ID Mapping Requirements

The query in `data_extraction.py` handles both cases, but you should verify:

- [ ] If `GameLog.playerId` contains database IDs → matches `Player.id`
- [ ] If `GameLog.playerId` contains NHL IDs → matches `Player.nhlId`
- [ ] The `COALESCE` join correctly maps to database IDs

**Test Query to Verify:**
```sql
SELECT 
  gl."playerId" as gamelog_player_id,
  p.id as player_db_id,
  p."nhlId" as player_nhl_id,
  COUNT(*) as game_count
FROM "GameLog" gl
LEFT JOIN "Player" p ON gl."playerId" = p.id
LEFT JOIN "Player" p2 ON gl."playerId" = p2."nhlId"
WHERE gl.season IN ('20232024', '20252026')
  AND (p.id IS NOT NULL OR p2.id IS NOT NULL)
GROUP BY gl."playerId", p.id, p."nhlId"
LIMIT 10;
```

**Expected Result:** All rows should have either `player_db_id` or a match via `p2.id`.

---

## Feature Engineering Requirements

The model builds features from GameLog data. Here's what's needed:

### A. Rolling Statistics (3, 5, 10 games)

**Requires:** At least 3 games before prediction date (ideally 10+)

- If player has < 3 games: Rolling stats will be incomplete
- **Best case:** Player has 10+ games in 2025-2026 before prediction date
- Rolling stats include: goals, assists, points, shots, hits, blocks, etc.

**Example:** For prediction on Dec 14, 2025:
- Need games from: Dec 13, Dec 11, Dec 9, Dec 7, Dec 5, etc. (for 10-game rolling)

### B. Season-to-Date Averages

**Requires:** At least 1 game in the current season (2025-2026) before prediction date

- If no games in 2025-2026: Uses 2023-2024 season averages (less accurate)
- Calculates cumulative averages up to the previous game

### C. Temporal Features

- `days_since_last_game`: Requires last game date before prediction
- `days_since_season_start`: Requires 2025-2026 season data
- `day_of_week`: Always available (derived from prediction date)

### D. Opponent Quality Features

- Opponent's recent offensive performance
- Opponent's recent defensive performance
- Calculated from team-level aggregates

---

## Prediction Date Logic

The model filters historical games using this logic:

```python
# From inference.py line 353
historical_rows = player_rows[player_rows["game_date_dt"] < game_date_dt]
```

**This means:**
- Predicting Dec 14, 2025 → uses games from Dec 13, 2025 and earlier
- Predicting Jan 1, 2026 → uses games from Dec 31, 2025 and earlier
- As the season progresses, more 2025-2026 data becomes available

**Key Point:** The model automatically excludes future games - you only need to collect data for games that have already been played.

---

## Current Season Data Collection

For ongoing predictions during the 2025-2026 season:

### Daily Collection Strategy

- [ ] Set up daily/regular GameLog collection for 2025-2026 season
- [ ] Collect games as they are played (not future games)
- [ ] Update GameLog table with completed games
- [ ] Ensure `season` field is set to `"20252026"`

### Collection Script

```bash
# Collect all players for 2025-2026 season
npm run collect-game-logs -- --season=20252026

# Collect specific player
npm run collect-game-logs -- --season=20252026 --player-id=8471214

# Dry run to test
npm run collect-game-logs -- --season=20252026 --dry-run --limit=10
```

### When to Collect

- **Daily:** After games complete (late night/early morning)
- **Weekly:** Before matchup analysis runs
- **As needed:** When predictions return zeros for players

---

## Environment & Dependencies

### Required Environment Variables

- [ ] `DATABASE_URL` - PostgreSQL connection string
  ```bash
  # Example format
  DATABASE_URL=postgresql://user:password@localhost:5432/dbname
  ```

### Python Virtual Environment

- [ ] Python venv exists at `analytics-service/venv/`
- [ ] Required packages installed:
  ```bash
  cd analytics-service
  source venv/bin/activate
  pip install -r requirements.txt
  ```

**Required Packages:**
- `torch` (PyTorch)
- `pandas`
- `numpy`
- `sqlalchemy`
- `psycopg2` (PostgreSQL driver)

### Verification

```bash
# Check venv exists
ls -la analytics-service/venv/bin/python3

# Test Python imports
cd analytics-service
source venv/bin/activate
python -c "import torch; import pandas; import sqlalchemy; print('OK')"
```

---

## Data Flow Verification

For a prediction on **December 14, 2025**, verify each step:

### 1. Player Lookup
- [ ] Player exists in `Player` table
- [ ] `nhlId` → `id` mapping works correctly

### 2. Historical Data Loading
- [ ] GameLog entries from 2023-2024 season load successfully
- [ ] GameLog entries from 2025-2026 season (Oct-Dec 13, 2025) load successfully
- [ ] All entries have `game_date < 2025-12-14`

### 3. Feature Building
- [ ] Rolling stats computed from recent 2025-2026 games
- [ ] Season averages computed from 2025-2026 games
- [ ] Historical context from 2023-2024 available

### 4. Prediction
- [ ] Model loads successfully
- [ ] Features encode correctly
- [ ] Prediction returns non-zero values

---

## Complete Data Flow

### Step-by-Step Process

1. **Matchup Analyzer** (`lib/matchup-analyzer.ts`):
   - Gets roster players (NHL IDs)
   - Gets game schedules for the week
   - Builds prediction requests for each player-game
   - Filters to future games only (on/after week start date)

2. **API Route** (`app/api/ml-projections/matchup/route.ts`):
   - Validates input
   - Converts camelCase to snake_case
   - Spawns Python process

3. **Python Batch Predict** (`analytics-service/modeling/batch_predict.py`):
   - Loads model once (cached)
   - Loads base dataset (Player + GameLog)
   - For each request:
     - Converts NHL ID → database ID if needed
     - Calls `predict_game_for_player_with_model`

4. **Inference** (`analytics-service/modeling/inference.py`):
   - Loads base dataset
   - Builds feature tables (rolling stats, season averages, etc.)
   - Finds player's historical games (before prediction date)
   - Creates future game row with:
     - Last historical game's features (rolling stats)
     - Game-specific features (opponent, home/away, date features)
   - Encodes features using pre-loaded encoders
   - Runs model prediction
   - Returns predicted stats

---

## Troubleshooting

### Issue: All Predictions Return Zero

**Symptoms:**
- All predicted stats are 0.0
- Logs show: "Player ID X not found in dataset"

**Possible Causes:**
1. Player has no GameLog entries in configured seasons
2. Season configuration doesn't match GameLog data
3. ID mapping issue (playerId doesn't match Player table)

**Solutions:**
1. Check if player has GameLog entries:
   ```sql
   SELECT COUNT(*) FROM "GameLog" 
   WHERE "playerId" IN (SELECT id FROM "Player" WHERE "nhlId" = YOUR_NHL_ID)
     AND season IN ('20232024', '20252026');
   ```

2. Verify season format matches exactly:
   ```sql
   SELECT DISTINCT season FROM "GameLog";
   ```

3. Check ID mapping:
   ```sql
   SELECT gl."playerId", p.id, p."nhlId"
   FROM "GameLog" gl
   LEFT JOIN "Player" p ON gl."playerId" = p.id
   WHERE gl."playerId" = YOUR_PLAYER_ID;
   ```

### Issue: Model Fails to Load

**Symptoms:**
- Error: "Model file not found"
- Error: "Import error - missing dependency"

**Solutions:**
1. Verify model artifacts exist:
   ```bash
   ls -la analytics-service/modeling/artifacts/player_perf_v1.*
   ```

2. Check Python dependencies:
   ```bash
   cd analytics-service
   source venv/bin/activate
   pip list | grep torch
   ```

3. Recreate venv if needed:
   ```bash
   cd analytics-service
   rm -rf venv
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

### Issue: Predictions Are Inaccurate

**Symptoms:**
- Predictions exist but seem wrong
- All players have similar predictions

**Possible Causes:**
1. Insufficient historical data (need at least 10+ games)
2. Missing recent season data (2025-2026)
3. Model needs retraining

**Solutions:**
1. Verify player has enough games:
   ```sql
   SELECT COUNT(*) FROM "GameLog"
   WHERE "playerId" = YOUR_PLAYER_ID
     AND "gameDate" < '2025-12-14';
   ```

2. Ensure 2025-2026 data is collected:
   ```bash
   npm run collect-game-logs -- --season=20252026
   ```

### Issue: Slow Predictions

**Symptoms:**
- Predictions take > 30 seconds
- Timeout errors

**Solutions:**
1. Model is loaded once per batch (already optimized)
2. Check database query performance:
   ```sql
   EXPLAIN ANALYZE
   SELECT ... FROM "GameLog" WHERE season = ANY(ARRAY['20232024', '20252026']);
   ```

3. Ensure database indexes exist:
   ```sql
   -- Should have indexes on:
   -- GameLog(season)
   -- GameLog(playerId, gameDate)
   -- Player(nhlId)
   ```

---

## Summary Checklist

### Quick Setup Checklist

- [ ] Model artifacts exist in `analytics-service/modeling/artifacts/`
- [ ] Config includes both `"20232024"` and `"20252026"` seasons
- [ ] Player table has entries with `id` and `nhlId`
- [ ] GameLog table has entries for season `"20232024"` (full season)
- [ ] GameLog table has entries for season `"20252026"` (games already played)
- [ ] GameLog entries have `playerId` that matches `Player.id` OR `Player.nhlId`
- [ ] Players have at least 1 historical game before prediction date
- [ ] Python venv has all required packages
- [ ] `DATABASE_URL` environment variable is set

### Ongoing Maintenance

- [ ] Collect 2025-2026 GameLog data daily/weekly
- [ ] Verify new players have GameLog entries
- [ ] Monitor prediction accuracy
- [ ] Update season config when new season starts

---

## FAQ

### Q: Do I need 2025-2026 GameLog entries?

**A:** Yes, but only for games that have already been played. The model automatically filters to only use games before the prediction date.

### Q: What if a player has no 2025-2026 data yet?

**A:** The model will use 2023-2024 data, but predictions will be less accurate (missing recent form).

### Q: Can I predict games in the past?

**A:** Yes, the model will use all games before that date. Useful for backtesting.

### Q: How often should I collect GameLog data?

**A:** Daily is ideal, but weekly before matchup analysis is acceptable.

### Q: What if GameLog.playerId contains NHL IDs instead of database IDs?

**A:** The query in `data_extraction.py` handles both cases automatically using `COALESCE` joins.

---

## Additional Resources

- Model Training: See `analytics-service/modeling/train.py`
- Feature Engineering: See `analytics-service/modeling/features.py`
- Data Extraction: See `analytics-service/modeling/data_extraction.py`
- Inference Logic: See `analytics-service/modeling/inference.py`

