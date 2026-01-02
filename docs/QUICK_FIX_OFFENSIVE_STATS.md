# Quick Fix: Improve Goals/Assists/Points (5 Minutes)

## What I Just Changed

I increased the loss weight for goals, assists, and points from 1.5x to **3.0x** in `train_player_perf.py`.

This means the model will focus **twice as much** on getting these stats right during training.

## What To Do Next

1. **Retrain the model:**
   ```bash
   cd /Users/aidan/Documents/NHLStatAnalyzer
   source analytics-service/venv/bin/activate
   python -m analytics-service.modeling.train_player_perf
   ```
   (This will take 10-30 minutes)

2. **Check if it improved:**
   ```bash
   python -m analytics-service.modeling.quick_evaluate --model-name player_perf_v1
   ```

3. **Look for improvement in:**
   - Goals R² (currently 0.032) → target >0.05
   - Assists R² (currently 0.026) → target >0.05
   - Points R² (currently 0.090) → target >0.12

## If You Want to Try Different Weights

Edit `train_player_perf.py` line ~209 and change `3.0` to:
- `2.0` - More conservative
- `4.0` - More aggressive
- `5.0` - Very aggressive (might overfit)

## Next Steps (If This Helps)

See `IMPROVE_OFFENSIVE_STATS.md` for more advanced techniques like:
- Tuning learning rate
- Changing network architecture
- Adding more features

