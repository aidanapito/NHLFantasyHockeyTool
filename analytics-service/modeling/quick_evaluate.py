"""
Quick evaluation script to check model accuracy on key stats.

Usage:
    python -m analytics-service.modeling.quick_evaluate --model-name player_perf_v1
"""

import argparse
import json
import pandas as pd
from pathlib import Path

def load_metrics(model_name: str, split: str = "test"):
    """Load metrics for a model."""
    metrics_path = Path(__file__).parent / "reports" / model_name / f"metrics_overall.csv"
    
    if not metrics_path.exists():
        print(f"❌ Metrics file not found: {metrics_path}")
        print(f"   Run evaluation first: python -m analytics-service.modeling.evaluate_model --model-name {model_name} --split {split}")
        return None
    
    df = pd.read_csv(metrics_path)
    return df.set_index('stat').to_dict('index')

def print_summary(model_name: str, split: str = "test"):
    """Print a summary of model performance."""
    metrics = load_metrics(model_name, split)
    
    if metrics is None:
        return
    
    print(f"\n{'='*70}")
    print(f"Model: {model_name} ({split} set)")
    print(f"{'='*70}\n")
    
    # Key offensive stats
    key_stats = {
        'Offensive': ['goals', 'assists', 'points'],
        'Goalie': ['wins', 'saves', 'goalsAgainst', 'savePct'],
        'Other': ['shots', 'hits', 'blocks', 'timeOnIceSeconds'],
    }
    
    for category, stats in key_stats.items():
        print(f"\n{category} Stats:")
        print(f"{'Stat':<20} {'R²':<10} {'MAE':<10} {'RMSE':<10} {'Mean Actual':<12}")
        print("-" * 70)
        
        for stat in stats:
            if stat in metrics:
                m = metrics[stat]
                r2 = m.get('r2', 0)
                mae = m.get('mae', 0)
                rmse = m.get('rmse', 0)
                mean_actual = m.get('mean_actual', 0)
                
                # Color coding for R²
                if r2 > 0.2:
                    status = "✅"
                elif r2 > 0.1:
                    status = "⚠️"
                else:
                    status = "❌"
                
                print(f"{status} {stat:<18} {r2:>8.4f}  {mae:>8.4f}  {rmse:>8.4f}  {mean_actual:>10.2f}")
    
    # Overall summary
    summary_path = Path(__file__).parent / "reports" / model_name / "summary.json"
    if summary_path.exists():
        with summary_path.open() as f:
            summary = json.load(f)
        
        print(f"\n{'='*70}")
        print("Summary:")
        print(f"  Total samples: {summary.get('n_samples', 'N/A')}")
        
        best_stats = summary.get('best_stats', [])
        worst_stats = summary.get('worst_stats', [])
        
        if best_stats:
            print(f"\n  Top 5 Best (by MAE):")
            for stat, mae in best_stats[:5]:
                print(f"    • {stat}: MAE={mae:.4f}")
        
        if worst_stats:
            print(f"\n  Top 5 Worst (by MAE):")
            for stat, mae in worst_stats[:5]:
                print(f"    • {stat}: MAE={mae:.4f}")

def compare_models(model_names: list[str], split: str = "test"):
    """Compare multiple models."""
    print(f"\n{'='*70}")
    print(f"Comparing Models ({split} set)")
    print(f"{'='*70}\n")
    
    all_metrics = {}
    for model_name in model_names:
        metrics = load_metrics(model_name, split)
        if metrics:
            all_metrics[model_name] = metrics
    
    if not all_metrics:
        print("No metrics found for any models.")
        return
    
    # Key stats to compare
    key_stats = ['goals', 'assists', 'points', 'wins', 'saves']
    
    print(f"{'Stat':<15} ", end="")
    for model_name in all_metrics.keys():
        print(f"{model_name[:20]:<22}", end="")
    print()
    print("-" * (15 + 22 * len(all_metrics)))
    
    for stat in key_stats:
        print(f"{stat:<15} ", end="")
        for model_name in all_metrics.keys():
            if stat in all_metrics[model_name]:
                r2 = all_metrics[model_name][stat].get('r2', 0)
                print(f"R²={r2:>7.4f}  MAE={all_metrics[model_name][stat].get('mae', 0):>6.3f}  ", end="")
            else:
                print(f"{'N/A':<22}", end="")
        print()

def main():
    parser = argparse.ArgumentParser(description="Quick evaluation of model performance")
    parser.add_argument(
        "--model-name",
        type=str,
        default="player_perf_v1",
        help="Name of the model to evaluate",
    )
    parser.add_argument(
        "--split",
        type=str,
        default="test",
        choices=["train", "val", "test"],
        help="Which split to evaluate on",
    )
    parser.add_argument(
        "--compare",
        nargs="+",
        help="Compare multiple models (provide model names)",
    )
    
    args = parser.parse_args()
    
    if args.compare:
        compare_models(args.compare, args.split)
    else:
        print_summary(args.model_name, args.split)

if __name__ == "__main__":
    main()

