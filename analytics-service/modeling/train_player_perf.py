"""
Training script for the player game-by-game projection model.

This is designed to be run from the project root with the analytics-service
virtualenv activated, e.g.:

    source analytics-service/venv/bin/activate
    python -m analytics-service.modeling.train_player_perf
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, Tuple

import numpy as np
import pandas as pd
import torch
from torch import nn
from torch.utils.data import DataLoader, random_split

from .config import (
    ALL_TARGET_STATS,
    ExperimentConfig,
    artifact_paths,
    default_experiment_config,
    ensure_directories,
)
from .data_extraction import load_base_dataset
from .dataset import Encoders, PlayerGameDataset, fit_encoders
from .evaluation import evaluate_model
from .features import build_feature_tables
from .models import TabularModelConfig, TabularMultiTaskModel


def train_val_test_split_time_based(
    features, targets, game_date_col="game_date", 
    val_end_date: str | None = None, test_ratio: float = 0.1
) -> Tuple:
    """
    Time-based split to avoid data leakage.
    If val_end_date is None, uses the last (1-test_ratio) of dates as validation cutoff.
    """
    # Ensure we have game_date in features
    if game_date_col not in features.columns:
        raise ValueError(f"game_date column not found in features")
    
    # Sort by date
    date_sorted_idx = features[game_date_col].sort_values().index
    features_sorted = features.loc[date_sorted_idx].reset_index(drop=True)
    targets_sorted = targets.loc[date_sorted_idx].reset_index(drop=True)
    
    n = len(features_sorted)
    
    # Determine validation cutoff
    if val_end_date is None:
        # Use 90% for train+val, 10% for test
        test_start_idx = int(n * (1 - test_ratio))
        # Within train+val, use 90% for train, 10% for val
        val_start_idx = int(test_start_idx * 0.9)
        val_end_idx = test_start_idx
    else:
        # Use provided date
        val_end = pd.to_datetime(val_end_date)
        val_date_mask = features_sorted[game_date_col] < val_end
        if not val_date_mask.any():
            # If no dates before val_end_date, use default split
            test_start_idx = int(n * (1 - test_ratio))
            val_start_idx = int(test_start_idx * 0.9)
            val_end_idx = test_start_idx
        else:
            # Find the last position where date < val_end (since we reset_index, positions are 0-based)
            val_start_idx = int(val_date_mask[val_date_mask].index[-1]) + 1
            # Ensure we have room for test set
            test_start_idx = int(n * (1 - test_ratio))
            if test_start_idx <= val_start_idx:
                test_start_idx = min(val_start_idx + int((n - val_start_idx) * 0.5), n)
            val_end_idx = test_start_idx
    
    # Ensure indices are valid
    val_start_idx = max(0, min(val_start_idx, n - 2))
    val_end_idx = max(val_start_idx + 1, min(val_end_idx, n))
    
    # Split
    f_train = features_sorted.iloc[:val_start_idx].copy()
    t_train = targets_sorted.iloc[:val_start_idx].copy()
    f_val = features_sorted.iloc[val_start_idx:val_end_idx].copy()
    t_val = targets_sorted.iloc[val_start_idx:val_end_idx].copy()
    f_test = features_sorted.iloc[val_end_idx:].copy()
    t_test = targets_sorted.iloc[val_end_idx:].copy()
    
    print(f"Time-based split: Train={len(f_train)} ({f_train[game_date_col].min()} to {f_train[game_date_col].max()})")
    print(f"                  Val={len(f_val)} ({f_val[game_date_col].min()} to {f_val[game_date_col].max()})")
    print(f"                  Test={len(f_test)} ({f_test[game_date_col].min()} to {f_test[game_date_col].max()})")
    
    return f_train, t_train, f_val, t_val, f_test, t_test


def build_datasets_and_encoders(cfg: ExperimentConfig):
    base = load_base_dataset(cfg.data)
    ftables = build_feature_tables(base, cfg.data)

    # Use time-based split to avoid data leakage
    (
        f_train,
        t_train,
        f_val,
        t_val,
        f_test,
        t_test,
    ) = train_val_test_split_time_based(
        ftables.features, 
        ftables.targets, 
        game_date_col="game_date",
        val_end_date=cfg.data.val_end_date,
        test_ratio=0.1
    )

    encoders = fit_encoders(f_train)

    train_ds = PlayerGameDataset(f_train, t_train, encoders, target_names=ALL_TARGET_STATS)
    val_ds = PlayerGameDataset(f_val, t_val, encoders, target_names=ALL_TARGET_STATS)
    test_ds = PlayerGameDataset(f_test, t_test, encoders, target_names=ALL_TARGET_STATS)

    return train_ds, val_ds, test_ds, encoders


def save_encoders(encoders: Encoders, path_map: Dict[str, Path]) -> None:
    encoders_data = {
        "category_maps": encoders.category_maps,
        "numeric_means": encoders.numeric_means,
        "numeric_stds": encoders.numeric_stds,
    }
    with path_map["encoders"].open("w") as f:
        json.dump(encoders_data, f)


def train(cfg: ExperimentConfig | None = None) -> None:
    ensure_directories()
    cfg = cfg or default_experiment_config()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    train_ds, val_ds, test_ds, encoders = build_datasets_and_encoders(cfg)

    train_loader = DataLoader(
        train_ds,
        batch_size=cfg.training.batch_size,
        shuffle=True,
        num_workers=cfg.training.num_workers,
    )
    val_loader = DataLoader(
        val_ds,
        batch_size=cfg.training.batch_size,
        shuffle=False,
        num_workers=cfg.training.num_workers,
    )

    num_numeric = train_ds._numeric.shape[1]
    cfg_model = TabularModelConfig(
        num_numeric_features=num_numeric,
        num_targets=len(ALL_TARGET_STATS),
        team_vocab_size=len(encoders.category_maps.get("team", {})),
        opponent_vocab_size=len(encoders.category_maps.get("opponent_team", {})),
        position_vocab_size=len(encoders.category_maps.get("position", {})),
        hidden_dims=cfg.training.hidden_dims,
        dropout=cfg.training.dropout,
    )

    model = TabularMultiTaskModel(cfg_model).to(device)
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=cfg.training.learning_rate,
        weight_decay=cfg.training.weight_decay,
    )
    
    # Weighted loss function - give more weight to rare events and important stats
    def weighted_mse_loss(predictions, targets, stat_names):
        """Weighted MSE that gives more importance to rare events and key stats."""
        mse_per_stat = (predictions - targets) ** 2
        
        # Compute inverse frequency weights (more weight to rare events)
        stat_weights = torch.ones(len(stat_names), device=targets.device)
        for i, stat in enumerate(stat_names):
            # Rare events get higher weight
            stat_mean = targets[:, i].abs().mean().item()
            if stat_mean < 0.1:  # Rare events like shutouts
                stat_weights[i] = 10.0 / (stat_mean + 0.01)
            elif stat_mean < 0.5:  # Moderately rare
                stat_weights[i] = 2.0
            # Key offensive stats get more weight
            if stat in ['goals', 'assists', 'points']:
                stat_weights[i] *= 2.0
        
        weighted_mse = (mse_per_stat * stat_weights.unsqueeze(0)).mean()
        return weighted_mse
    
    criterion = lambda pred, tgt: weighted_mse_loss(pred, tgt, ALL_TARGET_STATS)

    best_val_loss = float("inf")
    patience_counter = 0

    for epoch in range(cfg.training.num_epochs):
        model.train()
        train_loss = 0.0
        for batch in train_loader:
            numeric = batch["numeric"].to(device)
            categorical = batch["categorical"].to(device)
            targets = batch["targets"].to(device)

            optimizer.zero_grad()
            outputs = model(numeric, categorical)
            loss = criterion(outputs, targets)
            loss.backward()
            optimizer.step()

            train_loss += loss.item() * numeric.size(0)

        train_loss /= len(train_ds)

        # Validation
        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for batch in val_loader:
                numeric = batch["numeric"].to(device)
                categorical = batch["categorical"].to(device)
                targets = batch["targets"].to(device)
                outputs = model(numeric, categorical)
                loss = criterion(outputs, targets)
                val_loss += loss.item() * numeric.size(0)

        val_loss /= len(val_ds)
        print(f"Epoch {epoch+1}/{cfg.training.num_epochs} - train_loss={train_loss:.4f} val_loss={val_loss:.4f}")

        # Early stopping
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            patience_counter = 0
            # Save best model and encoders
            paths = artifact_paths(cfg.model.name)
            torch.save(model.state_dict(), paths["model_state"])
            save_encoders(encoders, paths)
            # Also persist a simple metadata file
            metadata = {
                "model_name": cfg.model.name,
                "targets": ALL_TARGET_STATS,
            }
            with paths["metadata"].open("w") as f:
                json.dump(metadata, f)
        else:
            patience_counter += 1
            if patience_counter >= cfg.training.early_stopping_patience:
                print("Early stopping triggered")
                break

    # Load best model for evaluation
    print("\nLoading best model for evaluation...")
    paths = artifact_paths(cfg.model.name)
    model.load_state_dict(torch.load(paths["model_state"], map_location=device, weights_only=False))

    # Run comprehensive evaluation on test set
    print("\n" + "="*60)
    print("Running evaluation on test set...")
    print("="*60)
    test_loader = DataLoader(
        test_ds,
        batch_size=cfg.training.batch_size,
        shuffle=False,
        num_workers=cfg.training.num_workers,
    )
    
    evaluate_model(
        model=model,
        dataloader=test_loader,
        device=device,
        stat_names=ALL_TARGET_STATS,
        model_name=cfg.model.name,
    )


if __name__ == "__main__":
    train()



