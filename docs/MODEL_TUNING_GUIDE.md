# Model Tuning and Accuracy Testing Guide

This guide explains how to tune hyperparameters, test model accuracy, and compare different model configurations.

## Quick Start

### 1. Evaluate Current Model
```bash
cd /Users/aidan/Documents/NHLStatAnalyzer
source analytics-service/venv/bin/activate
python -m analytics-service.modeling.evaluate_model --model-name player_perf_v1 --split test
```

### 2. Train with Current Configuration
```bash
python -m analytics-service.modeling.train_player_perf
```

## Understanding Current Configuration

The model configuration is defined in `config.py`. Key hyperparameters you can tune:

### Training Configuration (`TrainingConfig`)
- `batch_size`: 512 (default) - Larger = faster training, more memory
- `num_epochs`: 50 (default) - Number of training epochs
- `learning_rate`: 1e-3 (default) - Lower = slower but more stable
- `weight_decay`: 1e-4 (default) - L2 regularization strength
- `hidden_dims`: [256, 256, 128] (default) - Neural network architecture
- `dropout`: 0.1 (default) - Prevents overfitting (0.0-1.0)
- `early_stopping_patience`: 5 (default) - Stop if no improvement for N epochs

### Data Configuration (`DataConfig`)
- `seasons`: Which seasons to include in training
- `train_end_date`: Optional date cutoff for training data
- `val_end_date`: Optional date cutoff for validation data

## Hyperparameter Tuning Methods

### Method 1: Manual Tuning (Recommended for Start)

Create a script to train with different hyperparameters:

```python
# tune_model.py
from analytics_service.modeling.config import ExperimentConfig, TrainingConfig, DataConfig
from analytics_service.modeling.train_player_perf import main as train

# Example: Try different learning rates
learning_rates = [1e-4, 5e-4, 1e-3, 5e-3]
for lr in learning_rates:
    cfg = ExperimentConfig(
        training=TrainingConfig(learning_rate=lr),
        model=ModelConfig(name=f"player_perf_lr{lr}")
    )
    # Train with this config
    train_with_config(cfg)
```

### Method 2: Grid Search Script

Create `tune_hyperparameters.py`:

```python
"""
Grid search over hyperparameters.

Usage:
    python -m analytics-service.modeling.tune_hyperparameters
"""

import itertools
from pathlib import Path
import json
from analytics_service.modeling.config import (
    ExperimentConfig, TrainingConfig, ModelConfig, DataConfig
)

# Define search space
hyperparameter_grid = {
    'learning_rate': [5e-4, 1e-3, 2e-3],
    'batch_size': [256, 512, 1024],
    'hidden_dims': [
        [128, 128],
        [256, 256, 128],
        [512, 256, 128],
    ],
    'dropout': [0.0, 0.1, 0.2],
    'weight_decay': [1e-5, 1e-4, 1e-3],
}

def generate_configs():
    """Generate all combinations of hyperparameters."""
    keys = hyperparameter_grid.keys()
    values = hyperparameter_grid.values()
    
    for combo in itertools.product(*values):
        config_dict = dict(zip(keys, combo))
        yield config_dict

# Train each configuration and compare results
for i, params in enumerate(generate_configs()):
    model_name = f"player_perf_tune_{i}"
    # Create and train with this config
    # Save results for comparison
```

### Method 3: Focused Tuning (Recommended)

Focus on one hyperparameter at a time:

**Learning Rate Tuning:**
```bash
# Create a script that modifies config.py temporarily or pass config via CLI
python -m analytics-service.modeling.train_player_perf --learning-rate 5e-4 --model-name player_perf_lr5e4
python -m analytics-service.modeling.train_player_perf --learning-rate 1e-3 --model-name player_perf_lr1e3
python -m analytics-service.modeling.train_player_perf --learning-rate 2e-3 --model-name player_perf_lr2e3
```

## Testing Accuracy

### 1. Run Full Evaluation

```bash
# Evaluate on test set
python -m analytics-service.modeling.evaluate_model --model-name player_perf_v1 --split test

# Evaluate on validation set
python -m analytics-service.modeling.evaluate_model --model-name player_perf_v1 --split val

# Evaluate on training set (to check for overfitting)
python -m analytics-service.modeling.evaluate_model --model-name player_perf_v1 --split train
```

### 2. Review Metrics

Results are saved to `reports/{model_name}/`:

```bash
# View overall metrics
cat analytics-service/modeling/reports/player_perf_v1/metrics_overall.csv

# View metrics by position
cat analytics-service/modeling/reports/player_perf_v1/metrics_by_position.csv

# View summary
cat analytics-service/modeling/reports/player_perf_v1/summary.json
```

### 3. Compare Models

Create a comparison script:

```python
# compare_models.py
import pandas as pd
from pathlib import Path

models_to_compare = [
    "player_perf_v1",
    "player_perf_lr5e4",
    "player_perf_lr1e3",
]

results = {}
for model_name in models_to_compare:
    metrics_path = Path(f"analytics-service/modeling/reports/{model_name}/metrics_overall.csv")
    if metrics_path.exists():
        df = pd.read_csv(metrics_path)
        results[model_name] = df.set_index('stat')[['mae', 'rmse', 'r2']].to_dict('index')

# Compare key stats
key_stats = ['goals', 'assists', 'points', 'wins', 'saves']
for stat in key_stats:
    print(f"\n{stat.upper()}:")
    for model_name, metrics in results.items():
        if stat in metrics:
            print(f"  {model_name}: R²={metrics[stat]['r2']:.4f}, MAE={metrics[stat]['mae']:.4f}")
```

### 4. Visual Comparison

Open the diagnostic plots:

```bash
# View prediction vs actual plots
open analytics-service/modeling/reports/player_perf_v1/prediction_vs_actual.png

# View residual plots
open analytics-service/modeling/reports/player_perf_v1/residuals.png

# View position breakdown
open analytics-service/modeling/reports/player_perf_v1/metrics_by_position_points.png
```

## Key Metrics to Watch

### For Each Stat:
- **R² (Coefficient of Determination)**: Higher is better (target: >0.2 for key stats)
  - Goals: Aim for R² > 0.10
  - Assists: Aim for R² > 0.10
  - Points: Aim for R² > 0.15
  - Wins (goalies): Aim for R² > 0.20
  - Saves: Aim for R² > 0.30

- **MAE (Mean Absolute Error)**: Lower is better
  - Goals: MAE < 0.5 is good
  - Points: MAE < 1.0 is good
  - Saves: MAE < 5.0 is good

- **RMSE (Root Mean Squared Error)**: Lower is better (penalizes large errors more)

### Overall Health Checks:
1. **Train vs Val vs Test**: Check if model overfits
   - Train R² >> Test R² = Overfitting (increase dropout/weight_decay)
   - Train R² ≈ Test R² = Good generalization

2. **Position Breakdown**: Check if certain positions perform worse
   - Goalies vs Skaters should have similar R² for their respective stats

3. **Residual Patterns**: Look for systematic bias
   - Residuals should be centered around 0
   - No clear patterns = good calibration

## Tuning Strategy

### Step 1: Baseline
Train and evaluate the current model:
```bash
python -m analytics-service.modeling.train_player_perf
python -m analytics-service.modeling.evaluate_model --model-name player_perf_v1 --split test
```

### Step 2: Learning Rate
Try different learning rates (most impactful):
- Start: 1e-3 (current)
- Try: 5e-4, 2e-3
- Evaluate on validation set
- Keep the best one

### Step 3: Architecture
Try different hidden dimensions:
- Current: [256, 256, 128]
- Try: [512, 256, 128] (deeper)
- Try: [128, 128] (shallower)
- Evaluate

### Step 4: Regularization
Adjust dropout and weight_decay if overfitting:
- Increase dropout (0.1 → 0.2) if train >> val
- Increase weight_decay (1e-4 → 1e-3) if still overfitting

### Step 5: Batch Size
Try different batch sizes:
- Current: 512
- Try: 256 (more updates per epoch)
- Try: 1024 (faster training, may need LR adjustment)

## Automated Tuning Script

Create `tune_model.py` in the modeling directory:

```python
"""
Automated hyperparameter tuning script.

Usage:
    python -m analytics-service.modeling.tune_model --param learning_rate --values 5e-4 1e-3 2e-3
"""

import argparse
import subprocess
import json
from pathlib import Path

def train_and_evaluate(model_name, config_overrides):
    """Train a model with given config and evaluate it."""
    # Modify config or pass via environment
    # Train
    subprocess.run([
        "python", "-m", "analytics-service.modeling.train_player_perf",
        "--model-name", model_name
    ])
    # Evaluate
    result = subprocess.run([
        "python", "-m", "analytics-service.modeling.evaluate_model",
        "--model-name", model_name, "--split", "test"
    ], capture_output=True)
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--param", required=True, help="Hyperparameter to tune")
    parser.add_argument("--values", nargs="+", required=True, help="Values to try")
    args = parser.parse_args()
    
    results = {}
    for value in args.values:
        model_name = f"player_perf_{args.param}_{value}"
        print(f"Training {model_name}...")
        # Train and evaluate
        # Store results
        results[value] = extract_metrics(model_name)
    
    # Print comparison
    print_comparison(results)

if __name__ == "__main__":
    main()
```

## Best Practices

1. **Use Validation Set for Tuning**: Don't use test set until final evaluation
2. **One Parameter at a Time**: Easier to understand impact
3. **Track Experiments**: Save configs and results for each experiment
4. **Time-Based Splits**: Always use time-based splits (already implemented)
5. **Multiple Runs**: Train each config multiple times to account for randomness
6. **Focus on Key Stats**: Prioritize improvements on goals, assists, points, wins, saves

## Quick Reference

### Training
```bash
# Default training
python -m analytics-service.modeling.train_player_perf

# With custom model name
python -m analytics-service.modeling.train_player_perf --model-name my_experiment_v1
```

### Evaluation
```bash
# Test set
python -m analytics-service.modeling.evaluate_model --model-name player_perf_v1 --split test

# Validation set  
python -m analytics-service.modeling.evaluate_model --model-name player_perf_v1 --split val

# Training set (check overfitting)
python -m analytics-service.modeling.evaluate_model --model-name player_perf_v1 --split train
```

### View Results
```bash
# Metrics
cat analytics-service/modeling/reports/player_perf_v1/metrics_overall.csv
cat analytics-service/modeling/reports/player_perf_v1/summary.json

# Plots
open analytics-service/modeling/reports/player_perf_v1/prediction_vs_actual.png
```

## Next Steps

1. **Run baseline evaluation** to understand current performance
2. **Identify weak areas** from metrics
3. **Tune one hyperparameter** at a time (start with learning rate)
4. **Compare results** and select best configuration
5. **Iterate** on improvements

For more details, see:
- `EVALUATION_GUIDE.md` - Detailed evaluation interpretation
- `IMPROVEMENTS_SUMMARY.md` - Previous improvements made
- `PERFORMANCE_ASSESSMENT.md` - Current performance baseline

