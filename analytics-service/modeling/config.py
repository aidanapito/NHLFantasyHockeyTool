"""
Central configuration for player game-by-game projection models.

This module defines:
- Which stats we try to predict (targets)
- Basic training/data parameters
- Convenience helpers for paths used by training & inference
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List


PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODELING_ROOT = PROJECT_ROOT / "analytics-service" / "modeling"
ARTIFACTS_DIR = MODELING_ROOT / "artifacts"
REPORTS_DIR = MODELING_ROOT / "reports"
DATA_DIR = MODELING_ROOT / "data"


# --- Targets -----------------------------------------------------------------

# Skater game-by-game targets from GameLog
SKATER_TARGET_STATS: List[str] = [
    "goals",
    "assists",
    "points",
    "shots",
    "shotsOnGoal",
    "hits",
    "blocks",
    "powerPlayPoints",
    "plusMinus",
    "pim",
    "timeOnIceSeconds",
]

# Goalie game-by-game targets from GameLog
GOALIE_TARGET_STATS: List[str] = [
    "wins",
    "saves",
    "shotsAgainst",
    "goalsAgainst",
    "savePct",
    "shutouts",
]


ALL_TARGET_STATS: List[str] = SKATER_TARGET_STATS + GOALIE_TARGET_STATS


@dataclass
class DataConfig:
    """
    Configuration describing which games and seasons to use.

    Time-based splits are critical to avoid leakage. These are expressed as
    ISO date strings so they can be compared in SQL and pandas easily.
    """

    seasons: List[str] = field(
        default_factory=lambda: [
            # Historical seasons - only include seasons that exist in GameLog table
            "20212022", 
            "20222023", 
            "20232024", 
            "20242025", 
            "20252026",  
        ]
    )
    game_type: str = "regular"

    # Date-based split boundaries (inclusive/exclusive semantics documented
    # in the data_extraction module).
    train_end_date: str | None = None  # e.g. "2024-02-01"
    val_end_date: str | None = None  # e.g. "2024-03-15"


@dataclass
class TrainingConfig:
    batch_size: int = 512
    num_epochs: int = 50
    learning_rate: float = 1e-3
    weight_decay: float = 1e-4
    hidden_dims: List[int] = field(default_factory=lambda: [256, 256, 128])
    dropout: float = 0.1
    early_stopping_patience: int = 5
    num_workers: int = 4


@dataclass
class ModelConfig:
    """
    Model-level settings that both training and inference need.
    """

    name: str = "player_perf_v1"
    targets: List[str] = field(default_factory=lambda: ALL_TARGET_STATS.copy())


@dataclass
class ExperimentConfig:
    """
    Top-level config that can be serialized to JSON/YAML if desired.
    """

    data: DataConfig = field(default_factory=DataConfig)
    training: TrainingConfig = field(default_factory=TrainingConfig)
    model: ModelConfig = field(default_factory=ModelConfig)


def default_experiment_config() -> ExperimentConfig:
    return ExperimentConfig()


def ensure_directories() -> None:
    """
    Ensure that directories used by training/inference exist.
    """
    for d in (ARTIFACTS_DIR, REPORTS_DIR, DATA_DIR):
        d.mkdir(parents=True, exist_ok=True)


def artifact_paths(model_name: str) -> Dict[str, Path]:
    """
    Convenience helper for the standard set of artifact paths for a model.
    """
    ensure_directories()
    base = ARTIFACTS_DIR / model_name
    return {
        "model_state": base.with_suffix(".pt"),
        "metadata": base.with_suffix(".metadata.json"),
        "scalers": base.with_suffix(".scalers.json"),
        "encoders": base.with_suffix(".encoders.json"),
    }



