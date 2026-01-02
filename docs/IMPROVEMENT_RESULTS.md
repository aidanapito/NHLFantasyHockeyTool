# Model Improvement Results: Increased Offensive Stats Weight

## Change Made
Increased loss weight for goals/assists/points from 1.5x to 3.0x in `train_player_perf.py`

## Results Comparison

### Before (Baseline)
- **Goals**: R² = 0.032, MAE = 0.276
- **Assists**: R² = 0.026, MAE = 0.442
- **Points**: R² = 0.090, MAE = 0.530

### After (3.0x Weight)
- **Goals**: R² = 0.033 (+0.001), MAE = 0.293 (+0.017)
- **Assists**: R² = 0.056 (+0.030 ⬆️), MAE = 0.420 (-0.022 ⬇️)
- **Points**: R² = 0.101 (+0.011), MAE = 0.532 (+0.002)

## Analysis

### ✅ Good News
- **Assists improved significantly**: R² increased by 115% (0.026 → 0.056)
- **Points improved**: R² increased by 12% (0.090 → 0.101), now above 0.10 threshold
- **Assists MAE improved**: Lower is better, went from 0.442 to 0.420

### ⚠️ Areas for Further Improvement
- **Goals barely improved**: Only +0.001 R² improvement (0.032 → 0.033)
- **Goals MAE got slightly worse**: 0.276 → 0.293 (but within margin of error)

## Current Status

- **Points**: R² = 0.101 ✅ (Above 0.10 target!)
- **Assists**: R² = 0.056 ⚠️ (Improved but still below 0.10 target)
- **Goals**: R² = 0.033 ❌ (Still needs significant improvement)

## Next Steps to Continue Improving

### Option 1: Increase Weight Even More
Try 4.0x or 5.0x weight in `train_player_perf.py` line 209:
```python
stat_weights[i] *= 4.0  # or 5.0
```

### Option 2: Tune Learning Rate
Edit `config.py` and try:
```python
learning_rate: float = 5e-4  # Lower learning rate (currently 1e-3)
```
Lower learning rates often help with difficult predictions.

### Option 3: Try Different Architecture
Edit `config.py` and try deeper network:
```python
hidden_dims: List[int] = field(default_factory=lambda: [512, 256, 128, 64])
```

### Option 4: Combine Methods
1. Use 4.0x weight for offensive stats
2. Lower learning rate to 5e-4
3. Retrain and compare

## Recommendation

**Next step**: Try increasing the weight to 4.0x or 5.0x and retrain. The improvement in assists shows this approach works - we just need to push harder on goals.

If that doesn't help goals enough, then try tuning learning rate or architecture.
