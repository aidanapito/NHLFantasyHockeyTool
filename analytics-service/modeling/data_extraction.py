"""
Data extraction utilities for player game-by-game modeling.

Responsibilities:
- Connect to Postgres using DATABASE_URL
- Read Player and GameLog tables into pandas DataFrames
- Produce a leakage-safe, time-ordered base dataset for feature engineering
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional, Tuple

import pandas as pd
from sqlalchemy import create_engine, text

from .config import DataConfig


@dataclass
class BaseDataset:
    """
    Container for the raw data used for feature engineering.
    """

    game_logs: pd.DataFrame
    players: pd.DataFrame


def get_engine():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL environment variable is not set")
    # Remove Prisma-specific schema parameter (not valid for psycopg2)
    if "?schema=" in database_url:
        database_url = database_url.split("?")[0]
    return create_engine(database_url)


def load_players(engine=None) -> pd.DataFrame:
    """
    Load Player table with key columns needed for modeling.
    """
    engine = engine or get_engine()
    query = text(
        """
        SELECT
          id,
          "nhlId"      AS nhl_id,
          "fullName"   AS full_name,
          position,
          team,
          "birthDate"  AS birth_date
        FROM "Player"
        """
    )
    return pd.read_sql_query(query, engine)


def load_game_logs(config: Optional[DataConfig] = None, engine=None) -> pd.DataFrame:
    """
    Load GameLog table for the seasons and game type defined in DataConfig.
    """
    engine = engine or get_engine()
    config = config or DataConfig()

    seasons_tuple = tuple(config.seasons)

    query = text(
        """
        SELECT
          gl.id,
          gl."playerId"      AS player_id,
          gl."gameId"        AS game_id,
          gl."gameDate"      AS game_date,
          gl.season,
          gl."gameType"      AS game_type,
          gl."opponentTeam"  AS opponent_team,
          gl."isHome"        AS is_home,
          gl.team,
          gl.goals,
          gl.assists,
          gl.points,
          gl.shots,
          gl."shotsOnGoal"   AS shots_on_goal,
          gl.hits,
          gl.blocks,
          gl."powerPlayPoints" AS power_play_points,
          gl."plusMinus"     AS plus_minus,
          gl.pim,
          gl."timeOnIceSeconds" AS toi_seconds,
          gl.wins,
          gl.saves,
          gl."shotsAgainst"  AS shots_against,
          gl."goalsAgainst"  AS goals_against,
          gl."savePct"       AS save_pct,
          gl.shutouts
        FROM "GameLog" gl
        WHERE gl.season = ANY(:seasons)
          AND gl."gameType" = :game_type
        ORDER BY gl."playerId", gl."gameDate"
        """
    )

    df = pd.read_sql_query(
        query,
        engine,
        params={
            "seasons": list(seasons_tuple),
            "game_type": config.game_type,
        },
    )

    # Ensure correct dtypes
    df["game_date"] = pd.to_datetime(df["game_date"])
    return df


def load_base_dataset(
    config: Optional[DataConfig] = None, engine=None
) -> BaseDataset:
    """
    Load players and game logs into a BaseDataset for further processing.
    """
    engine = engine or get_engine()
    players = load_players(engine)
    game_logs = load_game_logs(config=config, engine=engine)
    return BaseDataset(game_logs=game_logs, players=players)



