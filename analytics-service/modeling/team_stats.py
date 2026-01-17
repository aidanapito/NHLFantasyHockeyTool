"""
Team-level statistics for strength of schedule calculations.

This module computes:
- Team defensive quality (goals/shots allowed per game)
- Team offensive quality (goals/shots scored per game)
- League-wide rankings and percentiles
- Season-to-date aggregates
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sqlalchemy import create_engine, text

from .config import DataConfig, PROJECT_ROOT
from .data_extraction import get_engine


@dataclass
class TeamDefensiveStats:
    """Defensive statistics for a single team."""
    team: str
    games_played: int
    goals_against_total: int
    goals_against_per_game: float
    shots_against_total: int
    shots_against_per_game: float
    save_pct_against: float  # How well opposing goalies save against this team
    # Rankings (1 = worst defense, 32 = best defense for goals against)
    goals_against_rank: int
    defensive_rating: float  # 0-100 scale, higher = better defense


@dataclass
class TeamOffensiveStats:
    """Offensive statistics for a single team."""
    team: str
    games_played: int
    goals_for_total: int
    goals_per_game: float
    shots_for_total: int
    shots_per_game: float
    shooting_pct: float
    # Rankings (1 = worst offense, 32 = best offense)
    goals_for_rank: int
    offensive_rating: float  # 0-100 scale, higher = better offense


@dataclass
class TeamSeasonStats:
    """Combined season stats for a team."""
    team: str
    defensive: TeamDefensiveStats
    offensive: TeamOffensiveStats
    # Boom potential: how likely are opposing players to have big games?
    # Higher = easier matchup for opposing players
    opponent_boom_factor: float


def load_team_game_stats(
    config: Optional[DataConfig] = None,
    season: Optional[str] = None,
    as_of_date: Optional[str] = None,
    engine=None
) -> pd.DataFrame:
    """
    Load game-by-game team statistics aggregated from GameLog.
    
    Args:
        config: Data configuration
        season: Specific season to load (e.g., "20242025")
        as_of_date: Only include games up to this date (YYYY-MM-DD format)
        engine: SQLAlchemy engine
        
    Returns:
        DataFrame with columns: team, game_date, game_id, goals_for, shots_for, 
                               goals_against, shots_against, is_home
    """
    engine = engine or get_engine()
    config = config or DataConfig()
    
    # Use specified season or get the most recent from config
    target_season = season or config.seasons[-1] if config.seasons else "20242025"
    
    # Build date filter
    date_filter = ""
    if as_of_date:
        date_filter = f"AND gl.\"gameDate\" <= '{as_of_date}'"
    
    query = text(f"""
        WITH team_game_stats AS (
            -- Goals and shots FOR each team (what they scored)
            SELECT 
                gl.team,
                gl."gameDate" as game_date,
                gl."gameId" as game_id,
                gl."isHome" as is_home,
                gl."opponentTeam" as opponent_team,
                SUM(gl.goals) as goals_for,
                SUM(gl.shots) as shots_for
            FROM "GameLog" gl
            WHERE gl.season = :season
              AND gl."gameType" = :game_type
              {date_filter}
            GROUP BY gl.team, gl."gameDate", gl."gameId", gl."isHome", gl."opponentTeam"
        ),
        opponent_stats AS (
            -- Goals and shots AGAINST each team (what opponent scored)
            SELECT 
                gl."opponentTeam" as team,
                gl."gameDate" as game_date,
                gl."gameId" as game_id,
                SUM(gl.goals) as goals_against,
                SUM(gl.shots) as shots_against
            FROM "GameLog" gl
            WHERE gl.season = :season
              AND gl."gameType" = :game_type
              {date_filter}
            GROUP BY gl."opponentTeam", gl."gameDate", gl."gameId"
        )
        SELECT 
            t.team,
            t.game_date,
            t.game_id,
            t.is_home,
            t.opponent_team,
            t.goals_for,
            t.shots_for,
            COALESCE(o.goals_against, 0) as goals_against,
            COALESCE(o.shots_against, 0) as shots_against
        FROM team_game_stats t
        LEFT JOIN opponent_stats o ON t.team = o.team 
            AND t.game_date = o.game_date 
            AND t.game_id = o.game_id
        ORDER BY t.team, t.game_date
    """)
    
    df = pd.read_sql_query(
        query,
        engine,
        params={
            "season": target_season,
            "game_type": config.game_type,
        },
    )
    
    df["game_date"] = pd.to_datetime(df["game_date"])
    return df


def compute_team_season_stats(
    config: Optional[DataConfig] = None,
    season: Optional[str] = None,
    as_of_date: Optional[str] = None,
    engine=None
) -> Dict[str, TeamSeasonStats]:
    """
    Compute season-to-date team statistics for strength of schedule.
    
    Args:
        config: Data configuration
        season: Specific season
        as_of_date: Only include games up to this date
        engine: SQLAlchemy engine
        
    Returns:
        Dictionary mapping team abbreviation to TeamSeasonStats
    """
    team_games = load_team_game_stats(config, season, as_of_date, engine)
    
    if team_games.empty:
        print(f"[Team Stats] Warning: No team game data found for season {season}", file=sys.stderr)
        return {}
    
    # Aggregate to team totals
    team_totals = team_games.groupby("team").agg({
        "game_id": "nunique",  # Games played
        "goals_for": "sum",
        "shots_for": "sum",
        "goals_against": "sum",
        "shots_against": "sum",
    }).reset_index()
    
    team_totals.columns = ["team", "games_played", "goals_for", "shots_for", 
                           "goals_against", "shots_against"]
    
    # Compute per-game rates
    team_totals["goals_per_game"] = team_totals["goals_for"] / team_totals["games_played"]
    team_totals["shots_per_game"] = team_totals["shots_for"] / team_totals["games_played"]
    team_totals["goals_against_per_game"] = team_totals["goals_against"] / team_totals["games_played"]
    team_totals["shots_against_per_game"] = team_totals["shots_against"] / team_totals["games_played"]
    
    # Compute percentages
    team_totals["shooting_pct"] = np.where(
        team_totals["shots_for"] > 0,
        team_totals["goals_for"] / team_totals["shots_for"] * 100,
        0
    )
    team_totals["save_pct_against"] = np.where(
        team_totals["shots_against"] > 0,
        1 - (team_totals["goals_against"] / team_totals["shots_against"]),
        0
    )
    
    # Compute rankings (for goals against: rank 1 = most goals allowed = worst defense)
    team_totals["goals_against_rank"] = team_totals["goals_against_per_game"].rank(
        ascending=True, method="min"
    ).astype(int)
    
    # For goals for: rank 1 = fewest goals = worst offense
    team_totals["goals_for_rank"] = team_totals["goals_per_game"].rank(
        ascending=True, method="min"
    ).astype(int)
    
    # Compute ratings (0-100 scale using percentiles)
    # Defensive rating: lower goals against = higher rating
    team_totals["defensive_rating"] = (
        1 - team_totals["goals_against_per_game"].rank(pct=True)
    ) * 100
    
    # Offensive rating: higher goals for = higher rating
    team_totals["offensive_rating"] = team_totals["goals_per_game"].rank(pct=True) * 100
    
    # Boom factor: how likely are opposing players to boom against this team?
    # Higher goals against + higher shots against = higher boom factor
    # Normalize to 0-100 scale
    goals_against_pct = team_totals["goals_against_per_game"].rank(pct=True)
    shots_against_pct = team_totals["shots_against_per_game"].rank(pct=True)
    team_totals["opponent_boom_factor"] = ((goals_against_pct + shots_against_pct) / 2) * 100
    
    # Build result dictionary
    result: Dict[str, TeamSeasonStats] = {}
    
    for _, row in team_totals.iterrows():
        team = row["team"]
        
        defensive = TeamDefensiveStats(
            team=team,
            games_played=int(row["games_played"]),
            goals_against_total=int(row["goals_against"]),
            goals_against_per_game=float(row["goals_against_per_game"]),
            shots_against_total=int(row["shots_against"]),
            shots_against_per_game=float(row["shots_against_per_game"]),
            save_pct_against=float(row["save_pct_against"]),
            goals_against_rank=int(row["goals_against_rank"]),
            defensive_rating=float(row["defensive_rating"]),
        )
        
        offensive = TeamOffensiveStats(
            team=team,
            games_played=int(row["games_played"]),
            goals_for_total=int(row["goals_for"]),
            goals_per_game=float(row["goals_per_game"]),
            shots_for_total=int(row["shots_for"]),
            shots_per_game=float(row["shots_per_game"]),
            shooting_pct=float(row["shooting_pct"]),
            goals_for_rank=int(row["goals_for_rank"]),
            offensive_rating=float(row["offensive_rating"]),
        )
        
        result[team] = TeamSeasonStats(
            team=team,
            defensive=defensive,
            offensive=offensive,
            opponent_boom_factor=float(row["opponent_boom_factor"]),
        )
    
    print(f"[Team Stats] Computed stats for {len(result)} teams", file=sys.stderr)
    return result


def get_team_defensive_rankings(
    config: Optional[DataConfig] = None,
    season: Optional[str] = None,
    as_of_date: Optional[str] = None,
) -> pd.DataFrame:
    """
    Get a DataFrame of team defensive rankings for easy lookup.
    
    Returns DataFrame with columns:
        team, goals_against_per_game, goals_against_rank, defensive_rating, 
        opponent_boom_factor
    
    Teams are sorted by boom factor (descending) - easiest matchups first.
    """
    team_stats = compute_team_season_stats(config, season, as_of_date)
    
    if not team_stats:
        return pd.DataFrame()
    
    rows = []
    for team, stats in team_stats.items():
        rows.append({
            "team": team,
            "games_played": stats.defensive.games_played,
            "goals_against_per_game": stats.defensive.goals_against_per_game,
            "shots_against_per_game": stats.defensive.shots_against_per_game,
            "goals_against_rank": stats.defensive.goals_against_rank,
            "defensive_rating": stats.defensive.defensive_rating,
            "opponent_boom_factor": stats.opponent_boom_factor,
        })
    
    df = pd.DataFrame(rows)
    df = df.sort_values("opponent_boom_factor", ascending=False).reset_index(drop=True)
    
    return df


def get_opponent_quality_features(
    opponent_team: str,
    config: Optional[DataConfig] = None,
    season: Optional[str] = None,
    as_of_date: Optional[str] = None,
    team_stats_cache: Optional[Dict[str, TeamSeasonStats]] = None,
) -> Dict[str, float]:
    """
    Get opponent quality features for a single matchup.
    
    These features can be added to the model input to boost/reduce
    predictions based on opponent defensive quality.
    
    Args:
        opponent_team: Opponent team abbreviation (e.g., "ANA" for Anaheim)
        config: Data configuration
        season: Season string
        as_of_date: Date to compute stats up to
        team_stats_cache: Pre-computed team stats (for batch efficiency)
        
    Returns:
        Dictionary of opponent quality features
    """
    if team_stats_cache is not None:
        team_stats = team_stats_cache
    else:
        team_stats = compute_team_season_stats(config, season, as_of_date)
    
    if opponent_team not in team_stats:
        # Return neutral/average values for unknown teams
        return {
            "opp_defensive_rating": 50.0,
            "opp_boom_factor": 50.0,
            "opp_goals_against_per_game": 3.0,  # League average ~3 goals/game
            "opp_shots_against_per_game": 30.0,  # League average ~30 shots/game
            "opp_is_weak_defense": 0,
            "opp_is_strong_defense": 0,
        }
    
    opp_stats = team_stats[opponent_team]
    
    # Determine if this is a notably weak or strong defense
    # Top 8 (25%) = strong defense, Bottom 8 (25%) = weak defense
    is_weak = opp_stats.defensive.goals_against_rank <= 8  # Rank 1-8 = most goals allowed
    is_strong = opp_stats.defensive.goals_against_rank >= 25  # Rank 25-32 = fewest goals allowed
    
    return {
        "opp_defensive_rating": opp_stats.defensive.defensive_rating,
        "opp_boom_factor": opp_stats.opponent_boom_factor,
        "opp_goals_against_per_game": opp_stats.defensive.goals_against_per_game,
        "opp_shots_against_per_game": opp_stats.defensive.shots_against_per_game,
        "opp_is_weak_defense": 1 if is_weak else 0,
        "opp_is_strong_defense": 1 if is_strong else 0,
    }


if __name__ == "__main__":
    # Test the module
    print("Testing team stats computation...")
    
    rankings = get_team_defensive_rankings(season="20242025")
    
    if not rankings.empty:
        print("\n=== Team Defensive Rankings (Easiest Matchups First) ===")
        print(rankings.to_string(index=False))
        
        print("\n=== Top 5 Easiest Matchups (Boom Potential) ===")
        for _, row in rankings.head(5).iterrows():
            print(f"  {row['team']}: {row['goals_against_per_game']:.2f} GA/G, "
                  f"Boom Factor: {row['opponent_boom_factor']:.1f}")
        
        print("\n=== Top 5 Hardest Matchups ===")
        for _, row in rankings.tail(5).iterrows():
            print(f"  {row['team']}: {row['goals_against_per_game']:.2f} GA/G, "
                  f"Boom Factor: {row['opponent_boom_factor']:.1f}")
    else:
        print("No team data found - check database connection and season data")



