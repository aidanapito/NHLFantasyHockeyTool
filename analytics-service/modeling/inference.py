"""
Inference utilities for player game-by-game projections.

These functions are designed to be called from batch scripts or, later,
from a lightweight API service.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional

import numpy as np
import pandas as pd
import torch

from .config import ALL_TARGET_STATS, ExperimentConfig, artifact_paths, default_experiment_config
from .data_extraction import load_base_dataset
from .dataset import Encoders, PlayerGameDataset, fit_encoders
from .features import build_feature_tables
from .models import TabularModelConfig, TabularMultiTaskModel


@dataclass
class LoadedModel:
    model: TabularMultiTaskModel
    encoders: Encoders
    target_names: List[str]


def _load_encoders(path_map) -> Encoders:
    with path_map["encoders"].open() as f:
        data = json.load(f)
    return Encoders(
        category_maps=data["category_maps"],
        numeric_means=data["numeric_means"],
        numeric_stds=data["numeric_stds"],
    )


def load_latest_model(cfg: Optional[ExperimentConfig] = None) -> LoadedModel:
    """
    Load the latest trained model and associated encoders/metadata.
    """
    cfg = cfg or default_experiment_config()
    paths = artifact_paths(cfg.model.name)
    if not paths["model_state"].exists():
        raise FileNotFoundError(
            f"Model state not found at {paths['model_state']}. "
            "Train the model first with train_player_perf.py."
        )

    with paths["metadata"].open() as f:
        metadata = json.load(f)
    target_names = metadata.get("targets", ALL_TARGET_STATS)

    encoders = _load_encoders(paths)

    # We need to reconstruct the numeric feature dimension; a simple way is to
    # rebuild a tiny dataset from a sample batch.
    base = load_base_dataset(cfg.data)
    ftables = build_feature_tables(base, cfg.data)
    encoders_for_shape = fit_encoders(ftables.features.head(100))
    tmp_ds = PlayerGameDataset(ftables.features.head(100), ftables.targets.head(100), encoders_for_shape, target_names)
    num_numeric = tmp_ds._numeric.shape[1]

    cfg_model = TabularModelConfig(
        num_numeric_features=num_numeric,
        num_targets=len(target_names),
        team_vocab_size=len(encoders.category_maps.get("team", {})),
        opponent_vocab_size=len(encoders.category_maps.get("opponent_team", {})),
        position_vocab_size=len(encoders.category_maps.get("position", {})),
        hidden_dims=[256, 256, 128],
        dropout=0.1,
    )

    model = TabularMultiTaskModel(cfg_model)
    state = torch.load(paths["model_state"], map_location="cpu")
    model.load_state_dict(state)
    model.eval()

    return LoadedModel(model=model, encoders=encoders, target_names=target_names)


def predict_next_game_for_player(
    player_id: int,
    as_of_date: Optional[datetime] = None,
    cfg: Optional[ExperimentConfig] = None,
) -> Dict[str, float]:
    """
    Predict next-game stats for a single player, using all games up to as_of_date.
    """
    cfg = cfg or default_experiment_config()
    loaded = load_latest_model(cfg)

    base = load_base_dataset(cfg.data)
    ftables = build_feature_tables(base, cfg.data)

    # Filter to rows for this player up to as_of_date
    features = ftables.features.copy()
    targets = ftables.targets.copy()
    # We rely on game_date existing in the original game_logs; if not, this will
    # simply use the last row for the player.
    # For simplicity here we just take the last row.
    player_rows = features[features["player_id"] == player_id]
    if player_rows.empty:
        raise ValueError(f"No game log rows found for player_id={player_id}")

    last_row = player_rows.tail(1)
    idx = last_row.index
    last_targets = targets.loc[idx]

    ds = PlayerGameDataset(last_row, last_targets, loaded.encoders, target_names=loaded.target_names)
    batch = ds[0]
    numeric = batch["numeric"].unsqueeze(0)
    categorical = batch["categorical"].unsqueeze(0)

    with torch.no_grad():
        outputs = loaded.model(numeric, categorical).numpy().squeeze(0)

    return {name: float(val) for name, val in zip(loaded.target_names, outputs)}



