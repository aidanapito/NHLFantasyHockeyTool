"""
Batch script to generate per-game player projections and store them in
the PlayerProjection table via raw SQL.

Usage (from project root, with venv activated):

    cd analytics-service
    source venv/bin/activate
    python run_projections.py
"""

from __future__ import annotations

import os
from datetime import datetime

import pandas as pd
from sqlalchemy import create_engine, text

from modeling.config import default_experiment_config
from modeling.inference import load_latest_model, predict_next_game_for_player


def main(as_of_date: str | None = None) -> None:
    cfg = default_experiment_config()
    engine = create_engine(os.environ["DATABASE_URL"])

    # Load model once
    _ = load_latest_model(cfg)

    as_of = datetime.fromisoformat(as_of_date) if as_of_date else datetime.utcnow()
    season = cfg.data.seasons[-1] if cfg.data.seasons else "20252026"
    model_version = cfg.model.name

    players_df = pd.read_sql_query(
        text('SELECT id AS "playerId" FROM "Player" WHERE "isActive" = true'),
        engine,
    )

    for _, row in players_df.iterrows():
        player_id = int(row["playerId"])
        try:
            preds = predict_next_game_for_player(player_id, as_of, cfg)
        except Exception:
            continue

        stmt = text(
            """
            INSERT INTO "PlayerProjection" (
              "playerId", "gameDate", season, "modelVersion",
              "predictedGoals", "predictedAssists", "predictedPoints",
              "predictedShots", "predictedShotsOnGoal", "predictedHits",
              "predictedBlocks", "predictedPowerPlayPoints", "predictedPlusMinus",
              "predictedPim", "predictedToiSeconds", "predictedWins",
              "predictedSaves", "predictedShotsAgainst", "predictedGoalsAgainst",
              "predictedSavePct", "predictedShutouts"
            )
            VALUES (
              :player_id, :game_date, :season, :model_version,
              :goals, :assists, :points,
              :shots, :shots_on_goal, :hits,
              :blocks, :ppp, :plus_minus,
              :pim, :toi_seconds, :wins,
              :saves, :shots_against, :goals_against,
              :save_pct, :shutouts
            )
            ON CONFLICT ("playerId", "gameDate", "modelVersion")
            DO UPDATE SET
              "predictedGoals" = EXCLUDED."predictedGoals",
              "predictedAssists" = EXCLUDED."predictedAssists",
              "predictedPoints" = EXCLUDED."predictedPoints",
              "predictedShots" = EXCLUDED."predictedShots",
              "predictedShotsOnGoal" = EXCLUDED."predictedShotsOnGoal",
              "predictedHits" = EXCLUDED."predictedHits",
              "predictedBlocks" = EXCLUDED."predictedBlocks",
              "predictedPowerPlayPoints" = EXCLUDED."predictedPowerPlayPoints",
              "predictedPlusMinus" = EXCLUDED."predictedPlusMinus",
              "predictedPim" = EXCLUDED."predictedPim",
              "predictedToiSeconds" = EXCLUDED."predictedToiSeconds",
              "predictedWins" = EXCLUDED."predictedWins",
              "predictedSaves" = EXCLUDED."predictedSaves",
              "predictedShotsAgainst" = EXCLUDED."predictedShotsAgainst",
              "predictedGoalsAgainst" = EXCLUDED."predictedGoalsAgainst",
              "predictedSavePct" = EXCLUDED."predictedSavePct",
              "predictedShutouts" = EXCLUDED."predictedShutouts"
            ;
            """
        )

        params = {
            "player_id": player_id,
            "game_date": as_of,
            "season": season,
            "model_version": model_version,
            "goals": preds.get("goals", 0.0),
            "assists": preds.get("assists", 0.0),
            "points": preds.get("points", 0.0),
            "shots": preds.get("shots", 0.0),
            "shots_on_goal": preds.get("shotsOnGoal", 0.0),
            "hits": preds.get("hits", 0.0),
            "blocks": preds.get("blocks", 0.0),
            "ppp": preds.get("powerPlayPoints", 0.0),
            "plus_minus": preds.get("plusMinus", 0.0),
            "pim": preds.get("pim", 0.0),
            "toi_seconds": preds.get("timeOnIceSeconds", 0.0),
            "wins": preds.get("wins", 0.0),
            "saves": preds.get("saves", 0.0),
            "shots_against": preds.get("shotsAgainst", 0.0),
            "goals_against": preds.get("goalsAgainst", 0.0),
            "save_pct": preds.get("savePct", 0.0),
            "shutouts": preds.get("shutouts", 0.0),
        }

        with engine.begin() as conn:
            conn.execute(stmt, params)


if __name__ == "__main__":
    main()



