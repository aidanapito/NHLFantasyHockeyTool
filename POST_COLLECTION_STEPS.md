# Post Game Log Collection Steps

## 1. Verify Data Collection ✅

After running `npm run collect-game-logs`, verify the data was collected:

### Check Database
```bash
# Using Prisma Studio (already running on localhost:5555)
# Navigate to GameLog table and check:
# - Total records count
# - Sample records for a few players
# - Date ranges (should match the seasons you collected)
```

### Quick SQL Check (if you have direct DB access)
```sql
SELECT 
  COUNT(*) as total_logs,
  COUNT(DISTINCT "playerId") as unique_players,
  MIN("gameDate") as earliest_game,
  MAX("gameDate") as latest_game
FROM "GameLog";
```

## 2. Data Quality Check 🔍

### Check for Missing Data
```sql
-- Players with no game logs
SELECT p.id, p."fullName", COUNT(gl.id) as log_count
FROM "Player" p
LEFT JOIN "GameLog" gl ON gl."playerId" = p.id
WHERE p."isActive" = true
GROUP BY p.id, p."fullName"
HAVING COUNT(gl.id) = 0
LIMIT 20;
```

### Check Season Coverage
```sql
-- Game logs per season
SELECT season, COUNT(*) as log_count, COUNT(DISTINCT "playerId") as players
FROM "GameLog"
GROUP BY season
ORDER BY season DESC;
```

## 3. Prepare Data for ML Training 📊

### Create Training Data Export Script

You'll need to:
1. Extract features from game logs
2. Create sequences for time series models
3. Prepare target variables (next game predictions)
4. Split into train/validation/test sets

### Features to Extract:
- **Player features**: Position, age, team
- **Historical stats**: Rolling averages (last 5, 10, 20 games)
- **Recent form**: Goals, assists, points in last N games
- **Context**: Home/away, opponent strength, rest days
- **Time features**: Game number in season, days since last game

### Target Variables (Multi-output):
- Goals
- Assists  
- Points
- Shots on Goal
- Hits
- Blocks
- Power Play Points
- Plus/Minus

## 4. Train ML Model 🤖

### Option A: Python Script (Recommended)

Create `analytics-service/train_model.py`:

```python
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers

# Load game logs from database
# (Use Prisma or direct SQL query)

# Feature engineering
# - Create rolling averages
# - Encode categorical features
# - Create sequences

# Multi-output model architecture
inputs = keras.Input(shape=(sequence_length, num_features))
x = layers.LSTM(128, return_sequences=True)(inputs)
x = layers.Dropout(0.2)(x)
x = layers.LSTM(64)(x)
x = layers.Dropout(0.2)(x)

# Multiple output heads
goals = layers.Dense(1, activation='relu', name='goals')(x)
assists = layers.Dense(1, activation='relu', name='assists')(x)
points = layers.Dense(1, activation='relu', name='points')(x)
shots = layers.Dense(1, activation='relu', name='shots')(x)
hits = layers.Dense(1, activation='relu', name='hits')(x)
blocks = layers.Dense(1, activation='relu', name='blocks')(x)

model = keras.Model(inputs=inputs, outputs=[goals, assists, points, shots, hits, blocks])

model.compile(
    optimizer='adam',
    loss={'goals': 'mse', 'assists': 'mse', 'points': 'mse', 
          'shots': 'mse', 'hits': 'mse', 'blocks': 'mse'},
    metrics=['mae']
)

# Train
history = model.fit(
    X_train, [y_goals_train, y_assists_train, y_points_train, 
              y_shots_train, y_hits_train, y_blocks_train],
    validation_data=(X_val, [y_goals_val, y_assists_val, y_points_val,
                              y_shots_val, y_hits_val, y_blocks_val]),
    epochs=50,
    batch_size=32
)
```

### Option B: Use Existing Analytics Service

If you have the analytics-service set up:
```bash
cd analytics-service
python train_model.py --data-path ../data/game_logs.csv
```

## 5. Evaluate Model Performance 📈

### Metrics to Track:
- **MAE (Mean Absolute Error)** per stat
- **RMSE (Root Mean Squared Error)** per stat
- **R² Score** per stat
- **Correlation** between predicted and actual

### Visualizations:
- Prediction vs Actual scatter plots
- Error distributions
- Feature importance

## 6. Deploy Model 🚀

### Save Model
```python
model.save('models/nhl_player_projection_model.h5')
```

### Create API Endpoint
Update `app/api/ml-projections/player/route.ts` to:
1. Load the trained model
2. Accept player ID and game context
3. Return predictions for next game

### Integration
- Use in trade analyzer
- Use in matchup analyzer
- Display on player pages

## 7. Continuous Improvement 🔄

### Daily Updates:
- Collect new game logs (cron job)
- Retrain model weekly/monthly
- Monitor prediction accuracy
- Adjust features based on performance

## Quick Start Commands

```bash
# 1. Verify collection
npm run collect-game-logs -- --season=20232024 --player-id=8471214 --dry-run

# 2. Check Prisma Studio (already running)
# Open http://localhost:5555 and view GameLog table

# 3. Export data for training (create script)
node scripts/export-game-logs-for-training.js

# 4. Train model (in analytics-service)
cd analytics-service
python train_model.py

# 5. Test predictions
curl http://localhost:3000/api/ml-projections/player?playerId=8471214
```

## Next Immediate Steps

1. ✅ Verify game logs were collected (check Prisma Studio)
2. ✅ Check data quality (run SQL queries above)
3. ⏭️ Create data export script
4. ⏭️ Set up ML training pipeline
5. ⏭️ Train initial model
6. ⏭️ Integrate predictions into API
