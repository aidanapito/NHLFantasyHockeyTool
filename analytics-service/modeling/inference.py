"""
Inference utilities for player game-by-game projections.

These functions are designed to be called from batch scripts or, later,
from a lightweight API service.
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
import torch

from .config import ALL_TARGET_STATS, ExperimentConfig, artifact_paths, default_experiment_config
from .data_extraction import BaseDataset, load_base_dataset
from .dataset import Encoders, PlayerGameDataset, fit_encoders
from .features import FeatureTables, build_feature_tables
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
    preloaded_base: Optional[BaseDataset] = None,
    preloaded_ftables: Optional[FeatureTables] = None,
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
        preloaded_base: Optional pre-loaded base dataset (for batch predictions)
        preloaded_ftables: Optional pre-loaded feature tables (for batch predictions)
        
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
    
    # Load base dataset and build features (reuse if provided for batch predictions)
    if preloaded_base is not None:
        base = preloaded_base
    else:
        base = load_base_dataset(cfg.data)
    
    # Check if player_id is actually an NHL ID by looking it up in the Player table
    # If the player_id doesn't match any Player.id, try to find it by nhlId
    # This handles cases where GameLog might have been populated with NHL IDs
    player_info_by_id = base.players[base.players["id"] == player_id]
    if player_info_by_id.empty:
        # Maybe player_id is actually an NHL ID? Try to find by nhlId
        player_info_by_nhl = base.players[base.players["nhl_id"] == player_id]
        if not player_info_by_nhl.empty:
            # Found by NHL ID, use the database ID instead
            actual_player_id = player_info_by_nhl["id"].iloc[0]
            print(f"Warning: player_id {player_id} was an NHL ID, using database ID {actual_player_id} instead", file=sys.stderr)
            player_id = actual_player_id
        else:
            # Player doesn't exist in Player table at all
            print(f"Warning: player_id {player_id} not found in Player table (neither as id nor nhlId)", file=sys.stderr)
    
    # Reuse feature tables if provided, otherwise build them
    if preloaded_ftables is not None:
        ftables = preloaded_ftables
    else:
        ftables = build_feature_tables(base, cfg.data)
    
    # Filter to this player's historical games (strictly before game_date)
    features = ftables.features.copy()
    player_rows = features[features["player_id"] == player_id].copy()
    
    # If not found by database ID, try to find by NHL ID
    # This handles the case where GameLog.playerId contains NHL IDs
    if player_rows.empty:
        # Get the player's NHL ID
        player_info = base.players[base.players["id"] == player_id]
        if not player_info.empty and "nhl_id" in player_info.columns:
            nhl_id = player_info["nhl_id"].iloc[0]
            # Check if GameLog was populated with NHL IDs by looking for this NHL ID in the features
            # But wait - the features table should have database IDs after the join, so this won't work
            # Instead, we need to check if GameLog has entries for this player's NHL ID
            # The query should have already handled this, so if we're here, the player truly has no GameLog entries
            print(f"Warning: Player ID {player_id} (NHL ID: {nhl_id}) not found in dataset.", file=sys.stderr)
        else:
            print(f"Warning: Player ID {player_id} not found in dataset.", file=sys.stderr)
        
        unique_player_ids = features['player_id'].unique() if len(features) > 0 else []
        sample_ids = unique_player_ids[:20].tolist() if len(unique_player_ids) > 0 else []
        print(f"  Requested player_id: {player_id}", file=sys.stderr)
        print(f"  Total players in dataset: {len(unique_player_ids)}", file=sys.stderr)
        print(f"  Sample player IDs in dataset: {sample_ids}", file=sys.stderr)
        print(f"  Player ID range in dataset: min={unique_player_ids.min() if len(unique_player_ids) > 0 else 'N/A'}, max={unique_player_ids.max() if len(unique_player_ids) > 0 else 'N/A'}", file=sys.stderr)
        # Check if this player exists in the Player table but has no GameLog entries
        player_exists = not base.players[base.players["id"] == player_id].empty
        if player_exists:
            print(f"  Note: Player ID {player_id} exists in Player table but has no GameLog entries", file=sys.stderr)
            # Check if GameLog has entries for this player's NHL ID (in case GameLog.playerId contains NHL IDs)
            if "nhl_id" in base.players.columns:
                player_nhl_id = base.players[base.players["id"] == player_id]["nhl_id"].iloc[0] if not base.players[base.players["id"] == player_id].empty else None
                if player_nhl_id is not None:
                    # Check raw GameLog to see if it has entries with this NHL ID
                    # We can't easily check this here since we don't have raw GameLog, but the query should have handled it
                    print(f"  Player NHL ID: {player_nhl_id} - GameLog query should have matched this if GameLog.playerId contains NHL IDs", file=sys.stderr)
        return {name: 0.0 for name in loaded_model.target_names}
    
    # Convert game_date to datetime for comparison
    game_date_dt = pd.to_datetime(game_date)
    player_rows["game_date_dt"] = pd.to_datetime(player_rows["game_date"])
    historical_rows = player_rows[player_rows["game_date_dt"] < game_date_dt].copy()
    
    if historical_rows.empty:
        # No historical games before this date - return zeros/defaults
        print(f"Warning: Player {player_id} has no games before {game_date_obj}. Total games: {len(player_rows)}", file=sys.stderr)
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
    future_row["day_of_week"] = future_row["game_date"].dt.weekday
    
    # Drop helper columns that shouldn't be in features
    future_row = future_row.drop(columns=["game_date_dt", "season_start"], errors="ignore")
    
    # Ensure position column exists (required for categorical encoding)
    # Position should already be in future_row from the merge, but check just in case
    if "position" not in future_row.columns:
        # Try to get position from the base dataset players
        if hasattr(base, 'players'):
            players_df = base.players
            player_info = players_df[players_df["id"] == player_id] if "id" in players_df.columns else pd.DataFrame()
            if not player_info.empty and "position" in player_info.columns:
                position = player_info["position"].iloc[0]
                future_row["position"] = position
            else:
                # Default to center if we can't find it
                print(f"Warning: Could not find position for player {player_id}, defaulting to 'C'", file=sys.stderr)
                future_row["position"] = "C"
        else:
            print(f"Warning: Could not find position for player {player_id}, defaulting to 'C'", file=sys.stderr)
            future_row["position"] = "C"
    
    # Create a dummy targets row (filled with zeros, won't be used for prediction)
    # Ensure we have all required target columns
    if not loaded_model.target_names:
        print(f"Warning: loaded_model.target_names is empty! Using default target names.", file=sys.stderr)
        default_targets = ["goals", "assists", "points", "shots", "shotsOnGoal", "hits", "blocks", "powerPlayPoints", "plusMinus", "pim", "timeOnIceSeconds", "wins", "saves", "shotsAgainst", "goalsAgainst", "savePct", "shutouts"]
        dummy_targets = pd.DataFrame(
            {name: [0.0] for name in default_targets},
            index=future_row.index
        )
        target_names_to_use = default_targets
    else:
        dummy_targets = pd.DataFrame(
            {name: [0.0] for name in loaded_model.target_names},
            index=future_row.index
        )
        target_names_to_use = loaded_model.target_names
    
    # Debug: Print target names and dummy_targets columns to help diagnose issues
    print(f"[Inference] Target names: {loaded_model.target_names}", file=sys.stderr)
    print(f"[Inference] Dummy targets columns: {list(dummy_targets.columns)}", file=sys.stderr)
    print(f"[Inference] Future row columns (sample): {list(future_row.columns)[:10]}...", file=sys.stderr)
    
    # Encode features using pre-loaded encoders (use full future_row, same as original function)
    try:
        dataset = PlayerGameDataset(
            future_row,
            dummy_targets,
            loaded_model.encoders,
            target_names=target_names_to_use
        )
    
        # Make prediction
        batch = dataset[0]
        numeric = batch["numeric"].unsqueeze(0)
        categorical = batch["categorical"].unsqueeze(0)  # This is a tensor, not a dict
        
        with torch.no_grad():
            outputs = loaded_model.model(numeric, categorical).numpy().squeeze(0)
    
        # Convert to dict, ensuring non-negative values for certain stats (same as original function)
        predicted_dict = {}
        for name, val in zip(loaded_model.target_names, outputs):
            float_val = float(val)
            # Ensure non-negative values for counts/stats
            if name in ["goals", "assists", "points", "shots", "shotsOnGoal", "hits", "blocks",
                       "powerPlayPoints", "pim", "timeOnIceSeconds", "wins", "saves", 
                       "shotsAgainst", "goalsAgainst", "shutouts"]:
                float_val = max(0.0, float_val)
            
            # Map internal names to API names
            if name == "blocks":
                predicted_dict["blocks"] = float_val
            elif name == "shots":
                predicted_dict["shots"] = float_val
                predicted_dict["shotsOnGoal"] = float_val
            elif name == "hits":
                predicted_dict["hits"] = float_val
            elif name == "goals":
                predicted_dict["goals"] = float_val
            elif name == "assists":
                predicted_dict["assists"] = float_val
            elif name == "points":
                predicted_dict["points"] = float_val
            elif name == "power_play_points" or name == "powerPlayPoints":
                predicted_dict["powerPlayPoints"] = float_val
            elif name == "plus_minus" or name == "plusMinus":
                predicted_dict["plusMinus"] = float_val
            elif name == "pim":
                predicted_dict["pim"] = float_val
            elif name == "time_on_ice_seconds" or name == "timeOnIceSeconds":
                predicted_dict["timeOnIceSeconds"] = float_val
            elif name == "wins":
                predicted_dict["wins"] = 1.0 if float_val > 0.5 else 0.0
            elif name == "saves":
                predicted_dict["saves"] = float_val
            elif name == "shots_against" or name == "shotsAgainst":
                predicted_dict["shotsAgainst"] = float_val
            elif name == "goals_against" or name == "goalsAgainst":
                predicted_dict["goalsAgainst"] = float_val
            elif name == "save_pct" or name == "savePct":
                predicted_dict["savePct"] = max(0, min(1, float_val))
            elif name == "shutouts":
                predicted_dict["shutouts"] = 1.0 if float_val > 0.5 else 0.0
        
        return predicted_dict
    except Exception as e:
        # If feature construction fails, return zeros
        import traceback
        print(f"Warning: Failed to predict for player {player_id} with pre-loaded model: {e}", file=sys.stderr)
        print(f"Traceback: {traceback.format_exc()}", file=sys.stderr)
        return {name: 0.0 for name in loaded_model.target_names}



