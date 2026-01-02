# Understanding Model Evaluation Metrics

This document explains what the evaluation metrics mean and how to interpret them.

## Metric Definitions

### MAE (Mean Absolute Error)
- **What it is**: Average absolute difference between predicted and actual values
- **Interpretation**: Lower is better
- **Example**: MAE of 0.28 for goals means predictions are off by 0.28 goals on average
- **Real-world meaning**: If a player actually scores 1 goal, the model might predict anywhere from 0.72 to 1.28 goals

### RMSE (Root Mean Squared Error)
- **What it is**: Square root of average squared error
- **Interpretation**: Lower is better (penalizes large errors more than MAE)
- **Example**: RMSE of 0.40 for goals means large prediction errors are more heavily penalized
- **Real-world meaning**: RMSE > MAE indicates there are some large prediction errors (outliers)

### R² (Coefficient of Determination)
- **What it is**: Proportion of variance in actual values explained by predictions
- **Range**: -∞ to 1.0
- **Interpretation**: 
  - **R² = 1.0**: Perfect predictions
  - **R² > 0.2**: Good predictions (model is useful)
  - **R² = 0.0**: Model performs as well as just predicting the mean
  - **R² < 0.0**: Model is worse than just predicting the mean
- **Real-world meaning**: Higher R² means the model captures more patterns in the data

## Your Current Model Performance

### ✅ Excellent Performance (R² > 0.7)
- **timeOnIceSeconds**: R² = 0.9996
  - Almost perfect! Time on ice is very predictable (coaches have consistent usage patterns)
  - MAE = 5.85 seconds (off by ~6 seconds on average)
  
- **savePct**: R² = 0.972
  - Excellent for goalies
  - MAE = 0.013 (off by 1.3 percentage points on average)
  
- **shotsAgainst**: R² = 0.906
  - Very good for goalies
  - MAE = 0.47 shots (very accurate)
  
- **saves**: R² = 0.893
  - Very good for goalies
  - MAE = 0.44 saves (very accurate)
  
- **goalsAgainst**: R² = 0.734
  - Good for goalies
  - MAE = 0.09 goals (very accurate)

### ⚠️ Moderate Performance (R² 0.05 - 0.5)
- **wins**: R² = 0.431
  - Acceptable for goalies
  - MAE = 0.037 wins (predicts within ~0.04 wins on average)
  
- **points**: R² = 0.090
  - **Needs improvement** - Key stat for fantasy hockey
  - MAE = 0.53 points (predicts within ~0.5 points on average)
  - This means if a player gets 2 points, model might predict 1.5-2.5 points
  
- **shots**: R² = 0.154
  - Acceptable
  - MAE = 1.04 shots (predicts within ~1 shot on average)
  
- **blocks**: R² = 0.161
  - Acceptable
  - MAE = 0.74 blocks (predicts within ~0.7 blocks on average)
  
- **hits**: R² = 0.048
  - Poor performance
  - MAE = 0.98 hits (predicts within ~1 hit on average)
  
- **powerPlayPoints**: R² = 0.042
  - Poor performance (rare event - hard to predict)
  - MAE = 0.15 power play points

### ❌ Poor Performance (R² < 0.05)
- **goals**: R² = 0.032
  - **Needs significant improvement** - Critical stat for fantasy
  - MAE = 0.28 goals (predicts within ~0.3 goals on average)
  - If a player scores 1 goal, model might predict 0.7-1.3 goals
  
- **assists**: R² = 0.026
  - **Needs significant improvement** - Critical stat for fantasy
  - MAE = 0.44 assists (predicts within ~0.4 assists on average)
  - If a player gets 1 assist, model might predict 0.6-1.4 assists
  
- **pim**: R² = 0.008
  - Very poor (penalty minutes are highly unpredictable)
  - MAE = 0.73 minutes (predicts within ~0.7 minutes on average)
  
- **shutouts**: R² = 0.011
  - Very poor (extremely rare event - only ~0.3% of goalie games)
  - MAE = 0.014 shutouts (very small, but R² shows model isn't capturing patterns)
  
- **plusMinus**: R² = -0.012
  - **Worse than random!** Model performs worse than just predicting the mean
  - This stat is very difficult to predict (depends heavily on team performance)
  - MAE = 0.84 (predicts within ~0.8 on average)

## What This Means for Fantasy Hockey

### ✅ Stats That Are Reliable
- **Goalie stats** (saves, goalsAgainst, savePct, shotsAgainst) - Very reliable
- **Time on Ice** - Extremely reliable
- **Shots, Blocks** - Moderately reliable

### ⚠️ Stats That Need Improvement
- **Goals, Assists, Points** - These are THE most important stats for fantasy, but model performs poorly
  - Goals: R² = 0.032 (should target >0.10)
  - Assists: R² = 0.026 (should target >0.10)
  - Points: R² = 0.090 (should target >0.15)

### ❌ Stats That Are Inherently Hard to Predict
- **Plus/Minus** - R² = -0.012 (worse than random)
  - Depends heavily on team performance and game flow
  - Very difficult to predict accurately
  
- **PIM (Penalty Minutes)** - R² = 0.008
  - Unpredictable player behavior
  - Penalties are somewhat random events
  
- **Shutouts** - R² = 0.011
  - Extremely rare (happens in ~0.3% of games)
  - Requires predicting both team defense AND goalie performance

## Key Takeaways

1. **Model is excellent at predicting goalie stats** - You can trust saves, goalsAgainst, savePct predictions
2. **Model struggles with offensive stats** - Goals, assists, and points need significant improvement
3. **Some stats are inherently unpredictable** - Plus/minus and PIM are very difficult to predict well
4. **Time on ice is nearly perfect** - Model captures player usage patterns very well

## Next Steps for Improvement

Focus on improving:
1. **Goals prediction** (R² 0.032 → target 0.10+)
2. **Assists prediction** (R² 0.026 → target 0.10+)
3. **Points prediction** (R² 0.090 → target 0.15+)

See `MODEL_TUNING_GUIDE.md` and `TUNING_QUICK_START.md` for how to improve these metrics.

