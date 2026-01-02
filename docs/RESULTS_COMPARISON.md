# Model Performance Comparison

## Baseline vs Improved Model

### Key Offensive Stats

| Stat | Baseline R² | New R² | Change | Baseline MAE | New MAE | Change |
|------|-------------|--------|--------|--------------|---------|--------|
| **Goals** | 0.0467 | **0.0503** | ✅ +0.0036 | 0.2358 | 0.2773 | ⚠️ +0.0415 |
| **Assists** | 0.0477 | **0.0540** | ✅ +0.0063 | 0.3698 | 0.4223 | ⚠️ +0.0525 |
| **Points** | 0.0886 | **0.1025** | ✅ +0.0139 | 0.5067 | 0.5290 | ⚠️ +0.0223 |
| **Shots** | 0.2067 | **0.1952** | ⚠️ -0.0115 | 1.0568 | 1.0661 | ⚠️ +0.0093 |
| **ShotsOnGoal** | 0.2063 | **0.1952** | ⚠️ -0.0111 | 1.0578 | 1.0662 | ⚠️ +0.0084 |

### Rare Events

| Stat | Baseline R² | New R² | Change | Baseline MAE | New MAE | Change |
|------|-------------|--------|--------|--------------|---------|--------|
| **Shutouts** | -0.8100 | **-2.1340** | ❌ -1.3240 | 0.0514 | 0.0795 | ❌ +0.0281 |
| **PowerPlayPoints** | 0.0688 | **-0.0169** | ❌ -0.0857 | 0.1725 | 0.2317 | ❌ +0.0592 |

### Other Stats

| Stat | Baseline R² | New R² | Change |
|------|-------------|--------|--------|
| **Hits** | 0.0469 | **0.0398** | ⚠️ -0.0071 |
| **Blocks** | 0.1767 | **0.1610** | ⚠️ -0.0157 |
| **PlusMinus** | 0.0005 | **0.0023** | ✅ +0.0018 |
| **PIM** | -0.00004 | **0.0109** | ✅ +0.0109 |
| **TimeOnIce** | 0.9996 | **0.9996** | ✅ Same |

### Goalie Stats

| Stat | Baseline R² | New R² | Change |
|------|-------------|--------|--------|
| **Wins** | 0.4649 | **0.4467** | ⚠️ -0.0182 |
| **Saves** | 0.8993 | **0.8971** | ⚠️ -0.0022 |
| **ShotsAgainst** | 0.9119 | **0.9098** | ⚠️ -0.0021 |
| **GoalsAgainst** | 0.7239 | **0.6869** | ⚠️ -0.0370 |
| **SavePct** | 0.9836 | **0.9785** | ⚠️ -0.0051 |

## Analysis

### ✅ Improvements
1. **Points**: Modest improvement (+0.014 R²) - the most important composite stat
2. **Assists**: Small improvement (+0.006 R²)
3. **Goals**: Small improvement (+0.004 R²)
4. **PlusMinus & PIM**: Slight improvements (still very low R² overall)

### ❌ Regressions
1. **Shutouts**: Significantly worse (R² went from -0.81 to -2.13)
   - The weighted loss appears to have caused **over-prediction**
   - Mean predicted: 0.076 vs Mean actual: 0.003 (25x over-prediction!)
   
2. **PowerPlayPoints**: Worse (R² went from 0.069 to -0.017)
   - Also shows over-prediction (mean_predicted: 0.182 vs mean_actual: 0.092)

3. **Several other stats**: Small regressions in MAE despite similar R²

## Issues Identified

1. **Weighted Loss Over-Correction**: The 10x weight for rare events may be causing the model to over-predict shutouts and other rare events

2. **Time-Based Split**: The test set is now from Feb-Apr 2024 (different distribution than random split), which may affect comparisons

3. **Opponent Features**: May need more tuning - current features might not be capturing the right signal

## Recommendations

1. **Tune Weighted Loss**: Reduce the weight multiplier for rare events (try 5x instead of 10x)
2. **Separate Rare Event Handling**: Consider binary classification for shutouts (yes/no) instead of regression
3. **Feature Engineering**: 
   - Add opponent defensive strength (goals against, not just goals for)
   - Add home/away context to opponent features
   - Add player-opponent head-to-head history
4. **Position-Specific Models**: Consider separate models for goalies vs skaters
5. **Calibration**: Add post-processing to calibrate rare event predictions

