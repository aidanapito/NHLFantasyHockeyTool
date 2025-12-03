"""
Comprehensive evaluation and diagnostics for player performance models.

This module provides:
- Per-stat metrics (MAE, RMSE, R²)
- Breakdowns by position, team, home/away
- Diagnostic plots (residuals, calibration, prediction vs actual)
- Evaluation reports saved to disk
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import matplotlib
matplotlib.use('Agg')  # Non-interactive backend for scripts
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
import torch
from torch.utils.data import DataLoader

from .config import ALL_TARGET_STATS, REPORTS_DIR, SKATER_TARGET_STATS, GOALIE_TARGET_STATS
from .dataset import Encoders, PlayerGameDataset
from .models import TabularModelConfig, TabularMultiTaskModel


def compute_metrics(
    predictions: np.ndarray,
    targets: np.ndarray,
    stat_names: List[str],
) -> pd.DataFrame:
    """
    Compute MAE, RMSE, and R² for each target stat.

    Args:
        predictions: (n_samples, n_targets) array of predictions
        targets: (n_samples, n_targets) array of actual values
        stat_names: List of stat names corresponding to columns

    Returns:
        DataFrame with columns: stat, mae, rmse, r2, mean_actual, mean_predicted
    """
    metrics = []
    for i, stat in enumerate(stat_names):
        pred = predictions[:, i]
        actual = targets[:, i]

        # Remove NaN/inf values
        mask = np.isfinite(pred) & np.isfinite(actual)
        if mask.sum() == 0:
            continue

        pred_clean = pred[mask]
        actual_clean = actual[mask]

        mae = np.mean(np.abs(pred_clean - actual_clean))
        rmse = np.sqrt(np.mean((pred_clean - actual_clean) ** 2))
        
        # R² calculation
        ss_res = np.sum((actual_clean - pred_clean) ** 2)
        ss_tot = np.sum((actual_clean - np.mean(actual_clean)) ** 2)
        r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0

        metrics.append({
            "stat": stat,
            "mae": float(mae),
            "rmse": float(rmse),
            "r2": float(r2),
            "mean_actual": float(np.mean(actual_clean)),
            "mean_predicted": float(np.mean(pred_clean)),
            "n_samples": int(mask.sum()),
        })

    return pd.DataFrame(metrics)


def compute_breakdown_metrics(
    predictions: np.ndarray,
    targets: np.ndarray,
    features: pd.DataFrame,
    stat_names: List[str],
    breakdown_col: str,
) -> pd.DataFrame:
    """
    Compute metrics broken down by a categorical feature (e.g., position, team).

    Args:
        predictions: (n_samples, n_targets) array
        targets: (n_samples, n_targets) array
        features: DataFrame with breakdown column
        stat_names: List of stat names
        breakdown_col: Column name to break down by

    Returns:
        DataFrame with columns: breakdown_value, stat, mae, rmse, r2, n_samples
    """
    breakdown_values = features[breakdown_col].unique()
    results = []

    for value in breakdown_values:
        mask = features[breakdown_col] == value
        if mask.sum() == 0:
            continue

        pred_subset = predictions[mask]
        target_subset = targets[mask]

        for i, stat in enumerate(stat_names):
            pred = pred_subset[:, i]
            actual = target_subset[:, i]

            # Remove NaN/inf
            valid_mask = np.isfinite(pred) & np.isfinite(actual)
            if valid_mask.sum() == 0:
                continue

            pred_clean = pred[valid_mask]
            actual_clean = actual[valid_mask]

            mae = np.mean(np.abs(pred_clean - actual_clean))
            rmse = np.sqrt(np.mean((pred_clean - actual_clean) ** 2))
            
            ss_res = np.sum((actual_clean - pred_clean) ** 2)
            ss_tot = np.sum((actual_clean - np.mean(actual_clean)) ** 2)
            r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0

            results.append({
                "breakdown_value": str(value),
                "stat": stat,
                "mae": float(mae),
                "rmse": float(rmse),
                "r2": float(r2),
                "n_samples": int(valid_mask.sum()),
            })

    return pd.DataFrame(results)


def generate_predictions(
    model: TabularMultiTaskModel,
    dataloader: DataLoader,
    device: torch.device,
) -> Tuple[np.ndarray, np.ndarray, pd.DataFrame]:
    """
    Generate predictions for a dataset.

    Returns:
        (predictions, targets, features_df)
    """
    model.eval()
    all_preds = []
    all_targets = []
    all_features = []

    with torch.no_grad():
        for batch in dataloader:
            numeric = batch["numeric"].to(device)
            categorical = batch["categorical"].to(device)
            targets = batch["targets"].to(device)

            outputs = model(numeric, categorical)
            
            all_preds.append(outputs.cpu().numpy())
            all_targets.append(targets.cpu().numpy())

            # Store feature metadata for breakdowns
            # We need to reconstruct the features DataFrame from the dataset
            # For now, we'll extract what we can from the dataset
            batch_size = numeric.size(0)
            # We'll handle features separately by accessing the dataset

    predictions = np.vstack(all_preds)
    targets = np.vstack(all_targets)

    # Extract features DataFrame from dataset
    dataset = dataloader.dataset
    features_df = dataset.features.copy()

    return predictions, targets, features_df


def plot_residuals(
    predictions: np.ndarray,
    targets: np.ndarray,
    stat_names: List[str],
    output_path: Path,
    max_stats: int = 12,
) -> None:
    """
    Generate residual plots (predicted - actual) for each stat.
    """
    n_stats = min(len(stat_names), max_stats)
    n_cols = 4
    n_rows = (n_stats + n_cols - 1) // n_cols

    fig, axes = plt.subplots(n_rows, n_cols, figsize=(16, 4 * n_rows))
    axes = axes.flatten() if n_stats > 1 else [axes]

    for i, stat in enumerate(stat_names[:max_stats]):
        ax = axes[i]
        pred = predictions[:, i]
        actual = targets[:, i]

        # Remove NaN/inf
        mask = np.isfinite(pred) & np.isfinite(actual)
        pred_clean = pred[mask]
        actual_clean = actual[mask]
        residuals = pred_clean - actual_clean

        ax.scatter(actual_clean, residuals, alpha=0.3, s=10)
        ax.axhline(y=0, color="r", linestyle="--", linewidth=1)
        ax.set_xlabel(f"Actual {stat}")
        ax.set_ylabel("Residual (Predicted - Actual)")
        ax.set_title(f"Residuals: {stat}")
        ax.grid(True, alpha=0.3)

    # Hide unused subplots
    for i in range(n_stats, len(axes)):
        axes[i].set_visible(False)

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()


def plot_prediction_vs_actual(
    predictions: np.ndarray,
    targets: np.ndarray,
    stat_names: List[str],
    output_path: Path,
    max_stats: int = 12,
) -> None:
    """
    Generate prediction vs actual scatter plots for each stat.
    """
    n_stats = min(len(stat_names), max_stats)
    n_cols = 4
    n_rows = (n_stats + n_cols - 1) // n_cols

    fig, axes = plt.subplots(n_rows, n_cols, figsize=(16, 4 * n_rows))
    axes = axes.flatten() if n_stats > 1 else [axes]

    for i, stat in enumerate(stat_names[:max_stats]):
        ax = axes[i]
        pred = predictions[:, i]
        actual = targets[:, i]

        # Remove NaN/inf
        mask = np.isfinite(pred) & np.isfinite(actual)
        pred_clean = pred[mask]
        actual_clean = actual[mask]

        ax.scatter(actual_clean, pred_clean, alpha=0.3, s=10)
        
        # Add perfect prediction line
        min_val = min(np.min(actual_clean), np.min(pred_clean))
        max_val = max(np.max(actual_clean), np.max(pred_clean))
        ax.plot([min_val, max_val], [min_val, max_val], "r--", linewidth=1, label="Perfect")
        
        ax.set_xlabel(f"Actual {stat}")
        ax.set_ylabel(f"Predicted {stat}")
        ax.set_title(f"Prediction vs Actual: {stat}")
        ax.legend()
        ax.grid(True, alpha=0.3)

    # Hide unused subplots
    for i in range(n_stats, len(axes)):
        axes[i].set_visible(False)

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()


def plot_metrics_by_position(
    breakdown_df: pd.DataFrame,
    output_path: Path,
    stat: str = "points",
) -> None:
    """
    Plot MAE and RMSE by position for a specific stat.
    """
    stat_data = breakdown_df[breakdown_df["stat"] == stat]
    if len(stat_data) == 0:
        return

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))

    # MAE by position
    stat_data_sorted = stat_data.sort_values("mae")
    ax1.barh(stat_data_sorted["breakdown_value"], stat_data_sorted["mae"])
    ax1.set_xlabel("MAE")
    ax1.set_title(f"MAE by Position: {stat}")
    ax1.grid(True, alpha=0.3, axis="x")

    # RMSE by position
    stat_data_sorted = stat_data.sort_values("rmse")
    ax2.barh(stat_data_sorted["breakdown_value"], stat_data_sorted["rmse"])
    ax2.set_xlabel("RMSE")
    ax2.set_title(f"RMSE by Position: {stat}")
    ax2.grid(True, alpha=0.3, axis="x")

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()


def evaluate_model(
    model: TabularMultiTaskModel,
    dataloader: DataLoader,
    device: torch.device,
    stat_names: List[str] = None,
    output_dir: Optional[Path] = None,
    model_name: str = "player_perf_v1",
) -> Dict:
    """
    Comprehensive model evaluation.

    Returns:
        Dictionary with evaluation results and paths to saved artifacts
    """
    if stat_names is None:
        stat_names = ALL_TARGET_STATS

    output_dir = output_dir or (REPORTS_DIR / model_name)
    output_dir.mkdir(parents=True, exist_ok=True)

    print("Generating predictions...")
    predictions, targets, features_df = generate_predictions(model, dataloader, device)

    print("Computing overall metrics...")
    metrics_df = compute_metrics(predictions, targets, stat_names)
    metrics_df.to_csv(output_dir / "metrics_overall.csv", index=False)

    print("Computing breakdown by position...")
    position_breakdown = compute_breakdown_metrics(
        predictions, targets, features_df, stat_names, "position"
    )
    position_breakdown.to_csv(output_dir / "metrics_by_position.csv", index=False)

    print("Computing breakdown by home/away...")
    if "is_home" in features_df.columns:
        home_breakdown = compute_breakdown_metrics(
            predictions, targets, features_df, stat_names, "is_home"
        )
        home_breakdown.to_csv(output_dir / "metrics_by_home_away.csv", index=False)
    else:
        home_breakdown = None

    print("Generating diagnostic plots...")
    plot_residuals(
        predictions, targets, stat_names, output_dir / "residuals.png"
    )
    plot_prediction_vs_actual(
        predictions, targets, stat_names, output_dir / "prediction_vs_actual.png"
    )
    
    if len(position_breakdown) > 0:
        plot_metrics_by_position(
            position_breakdown, output_dir / "metrics_by_position_points.png", stat="points"
        )

    # Create summary report
    summary = {
        "model_name": model_name,
        "n_samples": len(predictions),
        "overall_metrics": metrics_df.to_dict("records"),
        "top_stats_by_mae": metrics_df.nsmallest(5, "mae")[["stat", "mae", "rmse", "r2"]].to_dict("records"),
        "worst_stats_by_mae": metrics_df.nlargest(5, "mae")[["stat", "mae", "rmse", "r2"]].to_dict("records"),
    }

    with (output_dir / "summary.json").open("w") as f:
        json.dump(summary, f, indent=2)

    print(f"\nEvaluation complete! Results saved to {output_dir}")
    print("\nOverall Metrics Summary:")
    print(metrics_df[["stat", "mae", "rmse", "r2"]].to_string(index=False))

    return {
        "summary": summary,
        "metrics_df": metrics_df,
        "position_breakdown": position_breakdown,
        "home_breakdown": home_breakdown,
        "output_dir": str(output_dir),
    }

