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


def train_val_test_split(
    features, targets, val_ratio: float = 0.1, test_ratio: float = 0.1
) -> Tuple:
    n = len(features)
    n_test = int(n * test_ratio)
    n_val = int(n * val_ratio)
    n_train = n - n_val - n_test

    indices = np.random.permutation(n)
    train_idx = indices[:n_train]
    val_idx = indices[n_train : n_train + n_val]
    test_idx = indices[n_train + n_val :]

    return (
        features.iloc[train_idx],
        targets.iloc[train_idx],
        features.iloc[val_idx],
        targets.iloc[val_idx],
        features.iloc[test_idx],
        targets.iloc[test_idx],
    )


def build_datasets_and_encoders(cfg: ExperimentConfig):
    base = load_base_dataset(cfg.data)
    ftables = build_feature_tables(base, cfg.data)

    (
        f_train,
        t_train,
        f_val,
        t_val,
        f_test,
        t_test,
    ) = train_val_test_split(ftables.features, ftables.targets)

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
    criterion = nn.MSELoss()

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



