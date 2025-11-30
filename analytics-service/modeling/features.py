"""
Feature engineering for player game-by-game modeling.

Key responsibilities:
- Join Player and GameLog data
- Compute rolling / recent-form features per player
- Compute season-to-date aggregates
- Prepare a clean feature/target table suitable for Torch models
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd

from .config import ALL_TARGET_STATS, DataConfig
from .data_extraction import BaseDataset


ROLLING_WINDOWS = (3, 5, 10)


@dataclass
class FeatureTables:
    """
    Container for model-ready feature and target tables.
    """

    features: pd.DataFrame
    targets: pd.DataFrame


def _compute_age(birth_date: pd.Series, as_of_date: pd.Series) -> pd.Series:
    # Convert to datetime and handle None/NaT values
    birth_date = pd.to_datetime(birth_date, errors='coerce')
    as_of_date = pd.to_datetime(as_of_date, errors='coerce')
    
    # Compute age only where both dates are valid
    age_years = (as_of_date - birth_date).dt.days / 365.25
    
    # Fill missing values with median age (computed from valid values)
    median_age = age_years.median()
    if pd.isna(median_age):
        median_age = 25.0  # Default fallback if no valid ages
    return age_years.fillna(median_age)


def build_feature_tables(
    base: BaseDataset,
    config: DataConfig,
) -> FeatureTables:
    """
    Build model-ready feature and target tables from the raw base dataset.
    """
    gl = base.game_logs.copy()
    players = base.players.copy()

    # Join player info
    gl = gl.merge(
        players[["id", "position", "team", "birth_date"]],
        left_on="player_id",
        right_on="id",
        how="left",
        suffixes=("", "_player"),
    )
    gl.rename(columns={"team_player": "player_team"}, inplace=True)

    # Basic temporal features
    gl["season_start"] = gl["game_date"].dt.to_period("Y").dt.start_time
    gl["days_since_season_start"] = (gl["game_date"] - gl["season_start"]).dt.days
    gl["day_of_week"] = gl["game_date"].dt.weekday

    # Sort for rolling operations and ensure unique index
    gl.sort_values(["player_id", "game_date"], inplace=True)
    gl.reset_index(drop=True, inplace=True)

    # Rolling / recent-form features
    for w in ROLLING_WINDOWS:
        for stat in [
            "goals",
            "assists",
            "points",
            "shots_on_goal",
            "hits",
            "blocks",
            "power_play_points",
            "plus_minus",
            "pim",
            "toi_seconds",
        ]:
            mean_col = f"{stat}_roll{w}_mean"
            # Compute rolling mean per player, then shift to avoid leakage
            rolled = (
                gl.groupby("player_id")[stat]
                .rolling(window=w, min_periods=1)
                .mean()
                .reset_index(level=0, drop=True)
            )
            # Assign using integer positions to avoid index alignment issues
            gl[mean_col] = rolled.values

        # Shift so we only use *previous* games (no leakage)
        roll_cols = [c for c in gl.columns if c.endswith(f"_roll{w}_mean")]
        gl[roll_cols] = (
            gl.groupby("player_id")[roll_cols].shift(1).fillna(0.0)
        )

    # Season-to-date aggregates (per-game rates up to previous game)
    agg_cols = [
        "goals",
        "assists",
        "points",
        "shots_on_goal",
        "hits",
        "blocks",
        "power_play_points",
        "plus_minus",
        "pim",
    ]
    gl["game_index_in_season"] = (
        gl.sort_values("game_date")
        .groupby(["player_id", "season"])
        .cumcount()
        + 1
    )
    for col in agg_cols:
        cum = (
            gl.groupby(["player_id", "season"])[col]
            .cumsum()
            .rename(f"{col}_season_cum")
        )
        gl[f"{col}_season_avg"] = cum / gl["game_index_in_season"]
        gl[f"{col}_season_avg"] = (
            gl.groupby(["player_id", "season"])[f"{col}_season_avg"]
            .shift(1)
            .fillna(0.0)
        )

    # Age feature
    gl["age"] = _compute_age(gl["birth_date"], gl["game_date"])

    # Targets: directly from the GameLog columns
    target_cols: Dict[str, str] = {
        "goals": "goals",
        "assists": "assists",
        "points": "points",
        "shots": "shots",
        "shotsOnGoal": "shots_on_goal",
        "hits": "hits",
        "blocks": "blocks",
        "powerPlayPoints": "power_play_points",
        "plusMinus": "plus_minus",
        "pim": "pim",
        "timeOnIceSeconds": "toi_seconds",
        "wins": "wins",
        "saves": "saves",
        "shotsAgainst": "shots_against",
        "goalsAgainst": "goals_against",
        "savePct": "save_pct",
        "shutouts": "shutouts",
    }

    targets = gl[[target_cols[t] for t in ALL_TARGET_STATS]].rename(
        columns={v: k for k, v in target_cols.items()}
    )

    # Feature columns (numeric + categorical indices prepared later)
    feature_cols: List[str] = [
        "player_id",
        "game_id",
        "season",
        "game_type",
        "opponent_team",
        "is_home",
        "team",
        "position",
        "age",
        "days_since_season_start",
        "day_of_week",
        "toi_seconds",
    ]
    feature_cols.extend(
        [c for c in gl.columns if "_roll" in c or "_season_avg" in c]
    )

    features = gl[feature_cols].copy()

    return FeatureTables(features=features, targets=targets)



