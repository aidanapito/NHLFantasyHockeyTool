# How to Improve Goals, Assists, and Points Predictions

Current performance:
- **Goals**: R² = 0.032 (needs improvement)
- **Assists**: R² = 0.026 (needs improvement)
- **Points**: R² = 0.090 (needs improvement)

## Quick Fix: Increase Loss Weight (Easiest, Start Here)

The model currently gives 1.5x weight to goals/assists/points. Increase this to focus more on these stats.

### Step 1: Edit the Loss Function

File: `train_player_perf.py` (around line 208)

**Current code:**
```python
# Key offensive stats get more weight (but not excessive)
if stat in ['goals', 'assists', 'points']:
    stat_weights[i] *= 1.5  # Reduced from 2.0 to 1.5
```

**Change to:**
```python
# Key offensive stats get more weight
if stat in ['goals', 'assists', 'points']:
    stat_weights[i] *= 3.0  # Increased from 1.5 to 3.0 for better focus
```

Or try even higher (4.0 or 5.0) to really emphasize these stats.

### Step 2: Retrain and Evaluate

```bash
cd /Users/aidan/Documents/NHLStatAnalyzer
source analytics-service/venv/bin/activate
python -m analytics-service.modeling.train_player_perf
python -m analytics-service.modeling.quick_evaluate --model-name player_perf_v1
```

**Expected improvement**: R² should increase by 0.01-0.03 for each stat.

## Method 2: Hyperparameter Tuning (More Impact)

Focus on learning rate and architecture specifically for offensive stats.

### Option A: Lower Learning Rate (More Stable Learning)

File: `config.py`

**Current:**
```python
learning_rate: float = 1e-3
```

**Try:**
```python
learning_rate: float = 5e-4  # Slower, more stable
```

Lower learning rates often help with difficult-to-predict stats.

### Option B: Deeper Network (More Capacity)

File: `config.py`

**Current:**
```python
hidden_dims: List[int] = field(default_factory=lambda: [256, 256, 128])
```

**Try:**
```python
hidden_dims: List[int] = field(default_factory=lambda: [512, 256, 128, 64])  # Deeper
```

Or:
```python
hidden_dims: List[int] = field(default_factory=lambda: [256, 256, 256, 128])  # Wider
```

More capacity may help capture complex patterns in offensive stats.

### Option C: More Training Epochs

File: `config.py`

**Current:**
```python
num_epochs: int = 50
```

**Try:**
```python
num_epochs: int = 100  # More training
early_stopping_patience: int = 10  # Wait longer before stopping
```

## Method 3: Feature Engineering (Advanced)

Add more features that specifically help predict goals/assists/points.

### Add Power Play Features

Edit `features.py` to add power play time and opportunities (if available in GameLog):

```python
# After line 109 (rolling features section)
# Add power play specific features
for w in [5, 10]:
    pp_mean = f"power_play_points_roll{w}_mean"
    # Use existing power_play_points rolling mean
    # Then compute power play time percentage if available
```

### Add Shooting Percentage Trends

Edit `features.py` to add shooting percentage:

```python
# After rolling features (around line 109)
# Compute shooting percentage (goals / shots)
gl['shooting_pct'] = gl['goals'] / (gl['shots'] + 1e-6)  # Avoid division by zero
gl['shooting_pct'] = gl['shooting_pct'].fillna(0.0)

# Rolling shooting percentage
for w in [10, 20]:
    gl[f'shooting_pct_roll{w}'] = (
        gl.groupby('player_id')['shooting_pct']
        .rolling(window=w, min_periods=5)
        .mean()
        .reset_index(level=0, drop=True)
        .shift(1)
        .fillna(0.0)
    )
```

Then add to feature_cols:
```python
feature_cols.extend(['shooting_pct_roll10', 'shooting_pct_roll20'])
```

### Add Teammate Quality Features

If you have player line/teammate data, add teammate quality:

```python
# Average points/goals/assists of linemates (would require line combination data)
# This is advanced and requires additional data sources
```

## Method 4: Position-Specific Weighting

Give more weight to offensive stats when the player is a forward (C, LW, RW).

Edit `train_player_perf.py` loss function to consider position:

```python
# This would require passing position info to the loss function
# More complex - consider this if other methods don't work
```

## Recommended Approach: Start Simple

### Step 1: Increase Loss Weight (5 minutes)
1. Edit `train_player_perf.py` line 209: Change `1.5` to `3.0`
2. Retrain: `python -m analytics-service.modeling.train_player_perf`
3. Evaluate: `python -m analytics-service.modeling.quick_evaluate`
4. Check if goals/assists/points R² improved

### Step 2: Try Learning Rate (15 minutes)
1. Edit `config.py`: Change `learning_rate` to `5e-4`
2. Retrain and evaluate
3. Compare results

### Step 3: Try Architecture (30 minutes)
1. Try deeper network: `[512, 256, 128, 64]`
2. Retrain and evaluate
3. Compare with baseline

### Step 4: Combine Best Settings
- Use the loss weight that worked best
- Use the learning rate that worked best
- Use the architecture that worked best
- Retrain with all combined

## Expected Results

After implementing these changes:

- **Goals**: R² should improve from 0.032 to 0.05-0.12
- **Assists**: R² should improve from 0.026 to 0.05-0.12
- **Points**: R² should improve from 0.090 to 0.12-0.20

## Monitoring Progress

After each change, compare metrics:

```bash
# Quick comparison
python -m analytics-service.modeling.quick_evaluate --model-name player_perf_v1

# Check the key stats:
# - goals: R² should increase
# - assists: R² should increase
# - points: R² should increase
```

## Troubleshooting

**If R² gets worse:**
- Revert the change
- Try a different approach
- Make smaller adjustments (e.g., 2.0 instead of 3.0 for loss weight)

**If model overfits (train R² >> val R²):**
- Increase dropout (0.1 → 0.2)
- Increase weight_decay (1e-4 → 1e-3)
- Reduce model capacity

**If improvement is minimal:**
- Try combining multiple methods
- Consider that offensive stats are inherently harder to predict
- Focus on MAE improvement even if R² doesn't improve much

## Quick Reference

**Files to edit:**
- `train_player_perf.py` - Loss function weighting (line ~209)
- `config.py` - Hyperparameters (learning_rate, hidden_dims, num_epochs)
- `features.py` - Feature engineering (add shooting %, power play features)

**Commands:**
```bash
# Activate venv
source analytics-service/venv/bin/activate

# Train
python -m analytics-service.modeling.train_player_perf

# Evaluate
python -m analytics-service.modeling.quick_evaluate --model-name player_perf_v1
```

