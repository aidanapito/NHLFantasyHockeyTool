# Model Improvements Summary

This document outlines the improvements made to the player performance prediction model to address poor accuracy on key statistics.

## Issues Identified

Based on evaluation metrics, the model showed poor performance on:
- **Offensive stats**: Goals (R²=0.047), Assists (R²=0.048), Points (R²=0.089)
- **Rare events**: Shutouts (R²=-0.81 - worse than random!)
- **Unpredictable stats**: Plus/Minus (R²=0.0005), PIM (R²=-0.00004)

Root causes identified:
1. **Data leakage**: Random train/test splits allowed future data to leak into training
2. **Equal weighting**: All targets weighted equally, rare events overwhelmed
3. **Missing context**: No opponent quality or matchup difficulty features
4. **Position mixing**: Goalies and skaters have fundamentally different stats

## Improvements Implemented

### 1. Time-Based Data Splitting ✅
**File**: `train_player_perf.py`

- Replaced random splits with time-based splits
- Prevents data leakage by ensuring training data comes before validation/test
- Respects temporal ordering of games

```python
def train_val_test_split_time_based(
    features, targets, game_date_col="game_date", 
    val_end_date: str | None = None, test_ratio: float = 0.1
)
```

### 2. Weighted Loss Function ✅
**File**: `train_player_perf.py`

- Implemented weighted MSE loss that:
  - Gives 10x weight to rare events (mean < 0.1)
  - Gives 2x weight to moderately rare events (mean < 0.5)
  - Gives 2x additional weight to key offensive stats (goals, assists, points)
- Prevents rare events like shutouts from being overwhelmed

```python
def weighted_mse_loss(predictions, targets, stat_names):
    # Inverse frequency weighting + importance weighting
```

### 3. Opponent Quality Features ✅
**File**: `features.py`

- Added opponent team's recent offensive performance:
  - `opp_goals_avg_5`: Opponent's avg goals per game (last 5 games)
  - `opp_goals_avg_10`: Opponent's avg goals per game (last 10 games)
  - `opp_shots_avg_5`: Opponent's avg shots per game (last 5 games)
  - `opp_shots_avg_10`: Opponent's avg shots per game (last 10 games)
- Provides context about matchup difficulty

### 4. Additional Context Features ✅
**File**: `features.py`

- **Rest days**: `days_since_last_game` - accounts for fatigue/freshness
- **Position flags**: `is_goalie`, `is_skater` - explicit position encoding
- All features properly shifted to avoid leakage

### 5. Updated Evaluation Script ✅
**File**: `evaluate_model.py`

- Updated to use same time-based split logic as training
- Ensures consistent evaluation methodology

## Expected Impact

1. **Time-based splits**: Should improve R² by 0.05-0.10 on most stats by eliminating leakage
2. **Weighted loss**: Should dramatically improve rare event prediction (shutouts from R²=-0.81 → R²>0)
3. **Opponent features**: Should improve offensive stat predictions (goals, assists, points) by 0.02-0.05 R²
4. **Context features**: Should improve all predictions by accounting for rest and position

## Next Steps (Not Yet Implemented)

### 4. Handle Rare Events as Classification
For stats like shutouts (mean=0.003, R²=-0.81), consider:
- Binary classification: Will there be a shutout? (Yes/No)
- Then regression: If yes, predict the exact value
- Or use specialized loss functions (Focal Loss, etc.)

### 6. Position-Specific Models
Options:
- **Separate models**: One for goalies, one for skaters
- **Shared encoder + separate heads**: Shared feature extraction, position-specific prediction heads
- **Position embeddings**: Enhanced position representation in current architecture

## Testing the Improvements

To train with the new improvements:

```bash
cd analytics-service
source venv/bin/activate
python -m modeling.train_player_perf
```

To evaluate:
```bash
python -m modeling.evaluate_model --model-name player_perf_v1 --split test
```

Compare the new metrics to the baseline:
- Goals: R² should improve from 0.047 to >0.10
- Assists: R² should improve from 0.048 to >0.10
- Points: R² should improve from 0.089 to >0.15
- Shutouts: R² should improve from -0.81 to >-0.20 (still challenging but better)

## Notes

- The model still uses a single multi-task head for all targets. Consider position-specific heads for further improvement.
- Shutouts remain extremely difficult to predict (rare event, requires predicting both team performance and goalie performance).
- Plus/Minus and PIM are inherently difficult due to high variance and contextual factors not captured in features.

