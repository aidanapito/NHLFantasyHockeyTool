# Quick Start: Model Tuning & Testing

## Current Model Performance

Based on the latest evaluation (`metrics_overall.csv`):

### ✅ Good Performance (R² > 0.2)
- **Time on Ice**: R² = 0.999 (excellent - very predictable)
- **Save Percentage**: R² = 0.979 (excellent for goalies)
- **Saves**: R² = 0.896 (excellent for goalies)
- **Shots Against**: R² = 0.909 (excellent for goalies)
- **Goals Against**: R² = 0.717 (good for goalies)

### ⚠️ Moderate Performance (R² 0.05-0.2)
- **Points**: R² = 0.085 (needs improvement)
- **Shots**: R² = 0.169 (acceptable)
- **Shots on Goal**: R² = 0.169 (acceptable)
- **Blocks**: R² = 0.167 (acceptable)

### ❌ Poor Performance (R² < 0.05)
- **Goals**: R² = 0.034 (needs significant improvement)
- **Assists**: R² = 0.026 (needs significant improvement)
- **Wins**: R² = 0.438 (actually good, but shown for completeness)
- **Plus/Minus**: R² = -0.011 (worse than baseline - very hard to predict)
- **Shutouts**: R² = 0.021 (extremely rare event - hard to predict)

## Quick Commands

### 1. Check Current Model Performance
```bash
cd /Users/aidan/Documents/NHLStatAnalyzer
source analytics-service/venv/bin/activate

# Quick summary
python -m analytics-service.modeling.quick_evaluate --model-name player_perf_v1

# Full evaluation
python -m analytics-service.modeling.evaluate_model --model-name player_perf_v1 --split test
```

### 2. Train a New Model
```bash
# Default configuration
python -m analytics-service.modeling.train_player_perf

# This will:
# - Train the model
# - Automatically evaluate on test set
# - Save results to reports/player_perf_v1/
```

### 3. Tune Hyperparameters Manually

Edit `config.py` to modify hyperparameters:

```python
@dataclass
class TrainingConfig:
    batch_size: int = 512          # Try: 256, 1024
    num_epochs: int = 50           # Usually fine
    learning_rate: float = 1e-3    # Try: 5e-4, 2e-3
    weight_decay: float = 1e-4     # Try: 1e-5, 1e-3
    hidden_dims: List[int] = field(default_factory=lambda: [256, 256, 128])  # Try: [512, 256, 128]
    dropout: float = 0.1           # Try: 0.0, 0.2
```

Then train:
```bash
python -m analytics-service.modeling.train_player_perf
```

### 4. Compare Models

```bash
# Compare two models
python -m analytics-service.modeling.quick_evaluate --compare player_perf_v1 player_perf_v2
```

## Recommended Tuning Sequence

### Step 1: Learning Rate (Most Impactful)

Try these values:
1. `learning_rate = 5e-4` (slower, more stable)
2. `learning_rate = 1e-3` (current - baseline)
3. `learning_rate = 2e-3` (faster, might overshoot)

For each:
- Modify `config.py`
- Train: `python -m analytics-service.modeling.train_player_perf`
- Evaluate: `python -m analytics-service.modeling.quick_evaluate --model-name player_perf_v1`
- Compare R² for goals, assists, points

**Keep the learning rate that gives best R² on validation set**

### Step 2: Architecture (Hidden Dimensions)

Try deeper/shallower networks:
1. `hidden_dims = [128, 128]` (smaller)
2. `hidden_dims = [256, 256, 128]` (current)
3. `hidden_dims = [512, 256, 128]` (deeper)

Evaluate and compare.

### Step 3: Regularization

If model overfits (train R² >> val R²):
- Increase `dropout` from 0.1 to 0.2
- Increase `weight_decay` from 1e-4 to 1e-3

## Key Metrics to Focus On

When tuning, prioritize improvements in:

1. **Goals**: Current R² = 0.034 → Target: >0.10
2. **Assists**: Current R² = 0.026 → Target: >0.10
3. **Points**: Current R² = 0.085 → Target: >0.15

These are the most important for fantasy hockey predictions.

## Expected Results

After tuning, you should see:
- Goals R² improvement: 0.034 → 0.10-0.15
- Assists R² improvement: 0.026 → 0.10-0.15
- Points R² improvement: 0.085 → 0.15-0.20

## Time Investment

- **Quick evaluation**: 1-2 minutes
- **Training one model**: 10-30 minutes (depending on data size)
- **Full tuning cycle** (3 learning rates × 3 architectures): ~2-3 hours

## Next Steps

1. ✅ Run quick evaluation to see current state
2. ⚙️ Tune learning rate (start here - easiest and most impactful)
3. 📊 Compare results
4. 🔄 Iterate on other hyperparameters if needed
5. 📈 Document best configuration

See `MODEL_TUNING_GUIDE.md` for detailed information.

