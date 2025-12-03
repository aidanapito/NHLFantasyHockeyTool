# Model Evaluation Guide

This guide explains how to evaluate the player performance prediction model and interpret the results.

## Overview

The evaluation system provides:
- **Per-stat metrics**: MAE, RMSE, and R² for each predicted statistic
- **Breakdowns**: Performance by position, home/away, and other categorical features
- **Diagnostic plots**: Residual plots, prediction vs actual scatter plots, and position breakdowns
- **Evaluation reports**: CSV files and JSON summaries saved to disk

## Running Evaluation

### Automatic Evaluation (After Training)

When you run the training script, evaluation automatically runs on the test set after training completes:

```bash
source analytics-service/venv/bin/activate
python -m analytics-service.modeling.train_player_perf
```

The evaluation results will be saved to `analytics-service/modeling/reports/player_perf_v1/`.

### Standalone Evaluation

To evaluate an existing trained model:

```bash
source analytics-service/venv/bin/activate
python -m analytics-service.modeling.evaluate_model --model-name player_perf_v1 --split test
```

Options:
- `--model-name`: Name of the model to evaluate (default: `player_perf_v1`)
- `--split`: Which split to evaluate on (`train`, `val`, or `test`, default: `test`)

## Output Files

After evaluation, the following files are generated in `reports/{model_name}/`:

### Metrics Files

1. **`metrics_overall.csv`**: Overall metrics for all stats
   - Columns: `stat`, `mae`, `rmse`, `r2`, `mean_actual`, `mean_predicted`, `n_samples`
   - One row per predicted statistic

2. **`metrics_by_position.csv`**: Metrics broken down by player position
   - Columns: `breakdown_value`, `stat`, `mae`, `rmse`, `r2`, `n_samples`
   - Useful for identifying which positions the model predicts well/poorly

3. **`metrics_by_home_away.csv`**: Metrics broken down by home/away games
   - Same structure as position breakdown
   - Helps identify if the model handles home/away differently

### Summary File

4. **`summary.json`**: High-level summary of evaluation
   - Overall sample count
   - Top 5 best-performing stats (by MAE)
   - Top 5 worst-performing stats (by MAE)
   - Full metrics list

### Diagnostic Plots

5. **`residuals.png`**: Residual plots for each stat
   - Shows prediction error (predicted - actual) vs actual value
   - Ideal: residuals centered around 0 with no clear patterns
   - Patterns indicate systematic bias

6. **`prediction_vs_actual.png`**: Scatter plots of predictions vs actuals
   - Each stat gets its own subplot
   - Red diagonal line shows perfect predictions
   - Points closer to the line = better predictions

7. **`metrics_by_position_points.png`**: Bar charts showing MAE and RMSE by position for points
   - Helps identify which positions have better/worse point predictions

## Interpreting Results

### Metrics

- **MAE (Mean Absolute Error)**: Average absolute difference between predicted and actual
  - Lower is better
  - Example: MAE of 0.5 for goals means predictions are off by 0.5 goals on average

- **RMSE (Root Mean Squared Error)**: Square root of average squared error
  - Lower is better
  - More sensitive to large errors than MAE
  - Example: RMSE of 1.2 for points means larger errors are penalized more

- **R² (Coefficient of Determination)**: Proportion of variance explained
  - Range: -∞ to 1.0 (higher is better)
  - R² = 1.0 means perfect predictions
  - R² = 0.0 means model performs as well as predicting the mean
  - Negative R² means model is worse than predicting the mean

### What to Look For

1. **Overall Performance**: Check `metrics_overall.csv` for stats with high MAE/RMSE or low R²
2. **Position Bias**: Check `metrics_by_position.csv` - are certain positions harder to predict?
3. **Systematic Errors**: Look at residual plots - are there clear patterns (e.g., underestimating high performers)?
4. **Calibration**: Check prediction vs actual plots - are predictions well-calibrated across the range?

### Common Issues

- **Low R² for rare events**: Stats like shutouts or hat tricks are rare, so R² may be low even if MAE is reasonable
- **Position-specific issues**: Goalies vs skaters may have very different prediction challenges
- **High variance stats**: Stats like plus/minus are highly dependent on team performance, making them harder to predict

## Next Steps

After evaluation:

1. **Identify weak areas**: Focus on stats with poor metrics
2. **Feature engineering**: Add features that might help with poorly predicted stats
3. **Model tuning**: Adjust hyperparameters or model architecture
4. **Retrain**: Iterate on improvements and re-evaluate

## Example Workflow

```bash
# 1. Train a model
python -m analytics-service.modeling.train_player_perf

# 2. Review evaluation results
ls -la analytics-service/modeling/reports/player_perf_v1/

# 3. Check overall metrics
cat analytics-service/modeling/reports/player_perf_v1/metrics_overall.csv

# 4. View diagnostic plots (open in image viewer)
open analytics-service/modeling/reports/player_perf_v1/prediction_vs_actual.png

# 5. Re-evaluate on validation set if needed
python -m analytics-service.modeling.evaluate_model --split val
```

