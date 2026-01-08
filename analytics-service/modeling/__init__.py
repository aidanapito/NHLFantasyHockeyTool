"""
Modeling package for player game-by-game performance projections.

This package is intentionally framework-agnostic with a clean separation between:
- Data extraction from Postgres
- Feature engineering
- Torch datasets/models/training
- Inference utilities
- Team strength of schedule analysis

All configuration should flow through `config.py`.
"""

from .team_stats import (
    compute_team_season_stats,
    get_team_defensive_rankings,
    get_opponent_quality_features,
    TeamSeasonStats,
    TeamDefensiveStats,
    TeamOffensiveStats,
)

from .schedule_features import (
    compute_ros_strength_of_schedule,
    get_ros_sos_rankings,
    get_player_sos_boost,
    TeamScheduleStats,
)


