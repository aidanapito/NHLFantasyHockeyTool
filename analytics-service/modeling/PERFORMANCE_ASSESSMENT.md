# Model Performance Assessment

## R² Interpretation Guide

**R² (Coefficient of Determination)** measures how much variance in the target is explained by the model:
- **R² = 1.0**: Perfect predictions (all variance explained)
- **R² = 0.0**: Model is as good as predicting the mean
- **R² < 0.0**: Model is worse than just predicting the mean

## Current Model Performance by Category

### 🟢 Excellent Performance (R² > 0.8)
These stats are highly predictable, likely because they're:
- Highly structured (time-on-ice is scheduled/managed)
- Consistent patterns (goalie performance more stable)

| Stat | R² | Assessment |
|------|----|-----------| 
| TimeOnIceSeconds | 0.9996 | Near-perfect - coaching decisions are predictable |
| SavePct | 0.9785 | Excellent - goalie form is consistent |
| ShotsAgainst | 0.9098 | Excellent - team defensive patterns |
| Saves | 0.8971 | Excellent - correlates with shots against |

### 🟡 Good Performance (R² 0.4-0.7)
These are reasonably predictable but still challenging:

| Stat | R² | Assessment |
|------|----|-----------|
| GoalsAgainst | 0.6869 | Good - goalie/team defense somewhat predictable |
| Wins | 0.4467 | Moderate - depends on many factors |

### 🔴 Poor Performance (R² < 0.2)
**These are the problem areas** - key fantasy/offensive stats are barely better than guessing:

| Stat | R² | Assessment |
|------|----|-----------|
| Points | 0.1025 | **Poor** - only 10% of variance explained |
| Shots | 0.1952 | Poor - 20% variance explained |
| Blocks | 0.1610 | Poor |
| Assists | 0.0540 | **Very poor** - 5% variance explained |
| Goals | 0.0503 | **Very poor** - 5% variance explained |
| Hits | 0.0398 | Very poor |
| PIM | 0.0109 | Essentially random |

### 🔴 Critical Failures (R² ≤ 0)
Model is worse than just predicting the mean:

| Stat | R² | Issue |
|------|----|-------|
| PlusMinus | 0.0023 | Near-zero - essentially unpredictable |
| PowerPlayPoints | -0.0169 | Worse than mean - over-predicting |
| Shutouts | -2.1340 | **Critical** - predicting 25x too high |

## Why Are Offensive Stats So Hard to Predict?

1. **High Variance**: A player might score 2 goals one game, 0 the next - lots of randomness
2. **Context Dependence**: Depends on linemates, opponent, game situation, luck
3. **Low Frequency**: Most players score 0-1 goals per game, so predictions cluster near zero
4. **Sample Size**: Game-by-game data is noisy compared to season-long averages

## Industry Context

For game-by-game predictions in sports:
- **R² > 0.3**: Considered good
- **R² 0.1-0.3**: Acceptable but challenging
- **R² < 0.1**: Very difficult problem

Your model's offensive stats (R² ~0.05-0.10) are in the "very difficult" range, which is common for:
- Individual player game-by-game scoring
- Low-frequency events (goals, assists)
- Highly contextual stats (plus/minus)

## Recommendations by Priority

### 1. Immediate Fixes
- **Tune weighted loss**: Reduce rare event weight from 10x to 3-5x
- **Fix shutouts**: Consider binary classification or remove from multi-task head
- **Calibrate predictions**: Post-process to match actual distributions

### 2. Feature Engineering
- **Opponent defensive strength** (goals against, not just goals for)
- **Line/matchup features**: Linemate quality, opponent defensive pairing
- **Game context**: Score situation, momentum, back-to-back games
- **Player-opponent history**: Head-to-head performance

### 3. Architecture Changes
- **Separate models**: One for skaters, one for goalies
- **Position-specific heads**: Different prediction heads per position
- **Ensemble methods**: Combine multiple models

### 4. Target Engineering
- **Transform targets**: Log-transform for skewed distributions
- **Binning**: Convert rare events to classification problems
- **Relative targets**: Predict vs. season average rather than absolute

## Bottom Line

**For fantasy hockey purposes:**
- ✅ **Use for**: Goalie stats, time-on-ice, defensive stats
- ⚠️ **Use with caution**: Points, goals, assists (better than nothing, but low confidence)
- ❌ **Don't rely on**: Plus/minus, shutouts, power play points

The model is working as expected for highly structured stats, but game-by-game offensive production is inherently difficult to predict with high accuracy.

