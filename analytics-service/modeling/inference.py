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


def predict_game_for_player(
    player_id: int,
    game_date: datetime,
    opponent_team: str,
    player_team: str,
    is_home: bool,
    cfg: Optional[ExperimentConfig] = None,
) -> Dict[str, float]:
    """
    Predict stats for a specific future game for a player.
    
    Args:
        player_id: NHL player ID
        game_date: Date of the game to predict (must be in the future)
        opponent_team: Opponent team abbreviation (e.g., "TOR")
        player_team: Player's team abbreviation (e.g., "EDM")
        is_home: Whether the player's team is playing at home
        cfg: Optional experiment config
        
    Returns:
        Dictionary of predicted stats (goals, assists, points, etc.)
    """
    from datetime import date
    
    cfg = cfg or default_experiment_config()
    
    # Validate game_date format (allow past dates for testing/backtesting)
    if isinstance(game_date, datetime):
        game_date_obj = game_date.date()
    elif isinstance(game_date, date):
        game_date_obj = game_date
    else:
        game_date_obj = pd.to_datetime(game_date).date()
    
    # Warn but don't fail for past dates (useful for testing/backtesting)
    today = datetime.now().date()
    if game_date_obj < today:
        print(f"Warning: game_date {game_date_obj} is in the past. Proceeding with prediction anyway.")
    
    # Load model (should be cached in production)
    loaded = load_latest_model(cfg)
    
    # Load base dataset and build features
    base = load_base_dataset(cfg.data)
    ftables = build_feature_tables(base, cfg.data)
    
    # Filter to this player's historical games (strictly before game_date)
    features = ftables.features.copy()
    player_rows = features[features["player_id"] == player_id].copy()
    
    if player_rows.empty:
        # Player has no historical data - return zeros/defaults
        return {name: 0.0 for name in loaded.target_names}
    
    # Convert game_date to datetime for comparison
    game_date_dt = pd.to_datetime(game_date)
    player_rows["game_date_dt"] = pd.to_datetime(player_rows["game_date"])
    historical_rows = player_rows[player_rows["game_date_dt"] < game_date_dt].copy()
    
    if historical_rows.empty:
        # No historical games before this date - return zeros/defaults
        return {name: 0.0 for name in loaded.target_names}
    
    # Get the most recent historical game's features (this contains rolling stats)
    last_historical_row = historical_rows.sort_values("game_date_dt").tail(1).copy()
    
    # Create a synthetic row for the future game
    future_row = last_historical_row.copy()
    
    # Override game-specific fields
    future_row["game_date"] = game_date_dt
    future_row["opponent_team"] = opponent_team
    future_row["is_home"] = 1 if is_home else 0
    future_row["team"] = player_team
    
    # Calculate days_since_last_game (from last historical game to future game)
    last_game_date = last_historical_row["game_date_dt"].iloc[0]
    days_diff = (game_date_dt - last_game_date).days
    future_row["days_since_last_game"] = max(0, days_diff)
    
    # Calculate days_since_season_start for the future game
    future_row["season_start"] = future_row["game_date"].dt.to_period("Y").dt.start_time
    future_row["days_since_season_start"] = (future_row["game_date"] - future_row["season_start"]).dt.days
    future_row["day_of_week"] = future_row["game_date"].dt.weekday
    
    # For opponent quality features, we'll need to compute them from historical data
    # For now, use the last known values (these might be slightly stale but better than nothing)
    # In a production system, you might want to recompute opponent quality up to the prediction date
    
    # Drop helper columns
    future_row = future_row.drop(columns=["game_date_dt"], errors="ignore")
    
    # Create a dummy targets row (filled with zeros, won't be used for prediction)
    dummy_targets = pd.DataFrame(
        {name: [0.0] for name in loaded.target_names},
        index=future_row.index
    )
    
    # Create dataset and get prediction
    try:
        ds = PlayerGameDataset(future_row, dummy_targets, loaded.encoders, target_names=loaded.target_names)
        batch = ds[0]
        numeric = batch["numeric"].unsqueeze(0)
        categorical = batch["categorical"].unsqueeze(0)
        
        with torch.no_grad():
            outputs = loaded.model(numeric, categorical).numpy().squeeze(0)
        
        # Convert to dict, ensuring non-negative values for certain stats
        result = {}
        for name, val in zip(loaded.target_names, outputs):
            float_val = float(val)
            # Ensure non-negative values for counts/stats
            if name in ["goals", "assists", "points", "shots", "shotsOnGoal", "hits", "blocks",
                       "powerPlayPoints", "pim", "timeOnIceSeconds", "wins", "saves", 
                       "shotsAgainst", "goalsAgainst", "shutouts"]:
                float_val = max(0.0, float_val)
            result[name] = float_val
        
        return result
    except Exception as e:
        # If feature construction fails, return zeros
        print(f"Warning: Failed to predict for player {player_id}: {e}")
        return {name: 0.0 for name in loaded.target_names}


def predict_game_for_player_with_model(
    player_id: int,
    game_date: datetime | str,
    opponent_team: str,
    player_team: str,
    is_home: bool,
    loaded_model: LoadedModel,
    cfg: Optional[ExperimentConfig] = None,
) -> Dict[str, float]:
    """
    Predict stats for a specific future game for a player, using a pre-loaded model.
    This is faster than predict_game_for_player when making many predictions.
    
    Args:
        player_id: NHL player ID
        game_date: Date of the game to predict
        opponent_team: Opponent team abbreviation (e.g., "TOR")
        player_team: Player's team abbreviation (e.g., "EDM")
        is_home: Whether the player's team is playing at home
        loaded_model: Pre-loaded model and encoders
        cfg: Optional experiment config
        
    Returns:
        Dictionary of predicted stats (goals, assists, points, etc.)
    """
    from datetime import date
    
    cfg = cfg or default_experiment_config()
    
    # Validate game_date format
    if isinstance(game_date, datetime):
        game_date_obj = game_date.date()
    elif isinstance(game_date, date):
        game_date_obj = game_date
    else:
        game_date_obj = pd.to_datetime(game_date).date()
    
    # Load base dataset and build features (this is still needed for player data)
    base = load_base_dataset(cfg.data)
    ftables = build_feature_tables(base, cfg.data)
    
    # Filter to this player's historical games (strictly before game_date)
    features = ftables.features.copy()
    player_rows = features[features["player_id"] == player_id].copy()
    
    if player_rows.empty:
        # Player has no historical data - return zeros/defaults
        return {name: 0.0 for name in loaded_model.target_names}
    
    # Convert game_date to datetime for comparison
    game_date_dt = pd.to_datetime(game_date)
    player_rows["game_date_dt"] = pd.to_datetime(player_rows["game_date"])
    historical_rows = player_rows[player_rows["game_date_dt"] < game_date_dt].copy()
    
    if historical_rows.empty:
        # No historical games before this date - return zeros/defaults
        return {name: 0.0 for name in loaded_model.target_names}
    
    # Get the most recent historical game's features (this contains rolling stats)
    last_historical_row = historical_rows.sort_values("game_date_dt").tail(1).copy()
    
    # Create a synthetic row for the future game
    future_row = last_historical_row.copy()
    
    # Override game-specific fields
    future_row["game_date"] = game_date_dt
    future_row["opponent_team"] = opponent_team
    future_row["is_home"] = 1 if is_home else 0
    future_row["team"] = player_team
    
    # Calculate days_since_last_game (from last historical game to future game)
    last_game_date = last_historical_row["game_date_dt"].iloc[0]
    days_diff = (game_date_dt - last_game_date).days
    future_row["days_since_last_game"] = max(0, days_diff)
    
    # Calculate days_since_season_start for the future game
    future_row["season_start"] = future_row["game_date"].dt.to_period("Y").dt.start_time
    future_row["days_since_season_start"] = (future_row["game_date"] - future_row["season_start"]).dt.days
    
    # Encode features using pre-loaded encoders
    dataset = PlayerGameDataset(
        future_row[["player_id", "game_date", "opponent_team", "is_home", "team"] + [c for c in future_row.columns if c not in ["player_id", "game_date", "opponent_team", "is_home", "team", "game_date_dt", "season_start"] and c in ftables.features.columns]],
        pd.DataFrame(),  # Empty targets for prediction
        loaded_model.encoders,
        loaded_model.target_names
    )
    
    # Make prediction
    with torch.no_grad():
        batch = dataset[0]
        numeric = batch["numeric"].unsqueeze(0)
        categorical = {k: v.unsqueeze(0) for k, v in batch["categorical"].items()}
        predictions = loaded_model.model(numeric, categorical)
    
    # Convert predictions to dictionary (same mapping as predict_game_for_player)
    predicted_dict = {}
    for i, target_name in enumerate(loaded_model.target_names):
        value = float(predictions[i].item())
        # Map internal names to API names
        if target_name == "blocks":
            predicted_dict["blocks"] = max(0, value)
        elif target_name == "shots":
            predicted_dict["shots"] = max(0, value)
            predicted_dict["shotsOnGoal"] = max(0, value)
        elif target_name == "hits":
            predicted_dict["hits"] = max(0, value)
        elif target_name == "goals":
            predicted_dict["goals"] = max(0, value)
        elif target_name == "assists":
            predicted_dict["assists"] = max(0, value)
        elif target_name == "points":
            predicted_dict["points"] = max(0, value)
        elif target_name == "power_play_points":
            predicted_dict["powerPlayPoints"] = max(0, value)
        elif target_name == "plus_minus":
            predicted_dict["plusMinus"] = value
        elif target_name == "pim":
            predicted_dict["pim"] = max(0, value)
        elif target_name == "time_on_ice_seconds":
            predicted_dict["timeOnIceSeconds"] = max(0, value)
        elif target_name == "wins":
            predicted_dict["wins"] = 1.0 if value > 0.5 else 0.0
        elif target_name == "saves":
            predicted_dict["saves"] = max(0, value)
        elif target_name == "shots_against":
            predicted_dict["shotsAgainst"] = max(0, value)
        elif target_name == "goals_against":
            predicted_dict["goalsAgainst"] = max(0, value)
        elif target_name == "save_pct":
            predicted_dict["savePct"] = max(0, min(1, value))
        elif target_name == "shutouts":
            predicted_dict["shutouts"] = 1.0 if value > 0.5 else 0.0
    
    return predicted_dict



