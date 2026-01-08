"""
Rest-of-Season Strength of Schedule Features.

This module computes forward-looking schedule features:
- Remaining schedule for each team
- Average opponent defensive quality for remaining games
- "Easy stretch" and "hard stretch" indicators
- Weekly strength of schedule for streaming decisions
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sqlalchemy import text

from .config import DataConfig
from .data_extraction import get_engine
from .team_stats import (
    TeamSeasonStats,
    compute_team_season_stats,
    get_opponent_quality_features,
)


@dataclass
class TeamScheduleStats:
    """Strength of schedule metrics for a team's remaining games."""
    team: str
    games_remaining: int
    avg_opp_goals_against: float  # Avg goals allowed by opponents (higher = easier)
    avg_opp_boom_factor: float  # Avg boom factor of opponents (higher = easier)
    avg_opp_defensive_rating: float  # Avg defensive rating (lower = easier for scoring)
    easy_games_count: int  # Games vs bottom-8 defenses
    hard_games_count: int  # Games vs top-8 defenses
    sos_rank: int  # 1 = easiest ROS schedule, 32 = hardest
    sos_rating: float  # 0-100, higher = easier schedule


@dataclass
class WeeklyScheduleStats:
    """Strength of schedule for a specific week."""
    team: str
    week_start: str
    week_end: str
    games_count: int
    opponents: List[str]
    avg_boom_factor: float
    has_back_to_back: bool
    home_games: int
    away_games: int


def fetch_remaining_schedule(
    team: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    season: Optional[str] = None,
    engine=None,
) -> pd.DataFrame:
    """
    Fetch remaining regular season schedule from the database or NHL API.
    
    This function attempts to get schedule data from multiple sources:
    1. GameLog table (for games already played - useful for historical analysis)
    2. External schedule data if available
    
    Args:
        team: Specific team abbreviation (if None, gets all teams)
        from_date: Start date (YYYY-MM-DD), defaults to today
        to_date: End date (YYYY-MM-DD), defaults to end of regular season
        season: Season identifier (e.g., "20242025")
        engine: SQLAlchemy engine
        
    Returns:
        DataFrame with columns: game_date, home_team, away_team, game_id
    """
    engine = engine or get_engine()
    
    if from_date is None:
        from_date = datetime.now().strftime("%Y-%m-%d")
    
    # For rest-of-season, estimate season end (mid-April for regular season)
    if to_date is None:
        # Parse the season to get the end year
        if season:
            end_year = int(season[4:8])
        else:
            end_year = datetime.now().year
            if datetime.now().month >= 9:
                end_year += 1
        to_date = f"{end_year}-04-15"
    
    target_season = season or "20242025"
    
    # Try to get schedule from GameLog (for historical games we have data for)
    # This gives us the matchups that have been recorded
    query = text("""
        SELECT DISTINCT
            gl."gameDate" as game_date,
            gl."gameId" as game_id,
            CASE WHEN gl."isHome" THEN gl.team ELSE gl."opponentTeam" END as home_team,
            CASE WHEN gl."isHome" THEN gl."opponentTeam" ELSE gl.team END as away_team
        FROM "GameLog" gl
        WHERE gl.season = :season
          AND gl."gameType" = 'regular'
        ORDER BY gl."gameDate"
    """)
    
    df = pd.read_sql_query(
        query,
        engine,
        params={"season": target_season},
    )
    
    df["game_date"] = pd.to_datetime(df["game_date"])
    
    # Filter to date range
    df = df[
        (df["game_date"] >= pd.to_datetime(from_date)) &
        (df["game_date"] <= pd.to_datetime(to_date))
    ]
    
    # Filter to specific team if requested
    if team:
        df = df[(df["home_team"] == team) | (df["away_team"] == team)]
    
    return df


def compute_ros_strength_of_schedule(
    config: Optional[DataConfig] = None,
    as_of_date: Optional[str] = None,
    season: Optional[str] = None,
    team_stats_cache: Optional[Dict[str, TeamSeasonStats]] = None,
) -> Dict[str, TeamScheduleStats]:
    """
    Compute rest-of-season strength of schedule for all teams.
    
    Args:
        config: Data configuration
        as_of_date: Date to compute from (defaults to today)
        season: Season identifier
        team_stats_cache: Pre-computed team defensive stats
        
    Returns:
        Dictionary mapping team abbreviation to TeamScheduleStats
    """
    config = config or DataConfig()
    
    if as_of_date is None:
        as_of_date = datetime.now().strftime("%Y-%m-%d")
    
    target_season = season or (config.seasons[-1] if config.seasons else "20242025")
    
    # Get current team defensive stats
    if team_stats_cache is not None:
        team_stats = team_stats_cache
    else:
        # Use stats as of the current date to evaluate opponent quality
        team_stats = compute_team_season_stats(config, target_season, as_of_date)
    
    if not team_stats:
        print(f"[SoS] Warning: No team stats available", file=sys.stderr)
        return {}
    
    # Get remaining schedule
    remaining_schedule = fetch_remaining_schedule(
        from_date=as_of_date,
        season=target_season,
    )
    
    if remaining_schedule.empty:
        print(f"[SoS] Warning: No remaining schedule data found from {as_of_date}", file=sys.stderr)
        return {}
    
    # Build opponent lists for each team
    team_opponents: Dict[str, List[str]] = {}
    
    for _, game in remaining_schedule.iterrows():
        home = game["home_team"]
        away = game["away_team"]
        
        # Home team plays away team
        if home not in team_opponents:
            team_opponents[home] = []
        team_opponents[home].append(away)
        
        # Away team plays home team
        if away not in team_opponents:
            team_opponents[away] = []
        team_opponents[away].append(home)
    
    # Compute SoS metrics for each team
    result: Dict[str, TeamScheduleStats] = {}
    sos_scores: Dict[str, float] = {}  # For ranking
    
    for team, opponents in team_opponents.items():
        if not opponents:
            continue
        
        # Get opponent stats
        opp_boom_factors = []
        opp_goals_against = []
        opp_defensive_ratings = []
        easy_count = 0
        hard_count = 0
        
        for opp in opponents:
            if opp in team_stats:
                opp_stat = team_stats[opp]
                opp_boom_factors.append(opp_stat.opponent_boom_factor)
                opp_goals_against.append(opp_stat.defensive.goals_against_per_game)
                opp_defensive_ratings.append(opp_stat.defensive.defensive_rating)
                
                # Bottom 8 defenses = easy games (ranks 1-8 = most goals allowed)
                if opp_stat.defensive.goals_against_rank <= 8:
                    easy_count += 1
                # Top 8 defenses = hard games (ranks 25-32)
                elif opp_stat.defensive.goals_against_rank >= 25:
                    hard_count += 1
            else:
                # Use league averages for unknown teams
                opp_boom_factors.append(50.0)
                opp_goals_against.append(3.0)
                opp_defensive_ratings.append(50.0)
        
        avg_boom = np.mean(opp_boom_factors) if opp_boom_factors else 50.0
        avg_ga = np.mean(opp_goals_against) if opp_goals_against else 3.0
        avg_def_rating = np.mean(opp_defensive_ratings) if opp_defensive_ratings else 50.0
        
        sos_scores[team] = avg_boom  # Higher = easier schedule
        
        result[team] = TeamScheduleStats(
            team=team,
            games_remaining=len(opponents),
            avg_opp_goals_against=avg_ga,
            avg_opp_boom_factor=avg_boom,
            avg_opp_defensive_rating=avg_def_rating,
            easy_games_count=easy_count,
            hard_games_count=hard_count,
            sos_rank=0,  # Will be set after ranking
            sos_rating=avg_boom,  # 0-100 scale
        )
    
    # Compute rankings (1 = easiest, 32 = hardest based on avg boom factor)
    sorted_teams = sorted(sos_scores.items(), key=lambda x: x[1], reverse=True)
    for rank, (team, _) in enumerate(sorted_teams, 1):
        if team in result:
            result[team].sos_rank = rank
    
    print(f"[SoS] Computed ROS strength of schedule for {len(result)} teams", file=sys.stderr)
    return result


def get_ros_sos_rankings(
    config: Optional[DataConfig] = None,
    as_of_date: Optional[str] = None,
    season: Optional[str] = None,
) -> pd.DataFrame:
    """
    Get a DataFrame of team ROS strength of schedule rankings.
    
    Returns DataFrame sorted by easiest schedule first.
    """
    sos_stats = compute_ros_strength_of_schedule(config, as_of_date, season)
    
    if not sos_stats:
        return pd.DataFrame()
    
    rows = []
    for team, stats in sos_stats.items():
        rows.append({
            "team": team,
            "sos_rank": stats.sos_rank,
            "games_remaining": stats.games_remaining,
            "avg_opp_goals_against": stats.avg_opp_goals_against,
            "avg_opp_boom_factor": stats.avg_opp_boom_factor,
            "easy_games": stats.easy_games_count,
            "hard_games": stats.hard_games_count,
            "sos_rating": stats.sos_rating,
        })
    
    df = pd.DataFrame(rows)
    df = df.sort_values("sos_rank").reset_index(drop=True)
    
    return df


def compute_weekly_schedule(
    team: str,
    week_start: Optional[str] = None,
    config: Optional[DataConfig] = None,
    season: Optional[str] = None,
    team_stats_cache: Optional[Dict[str, TeamSeasonStats]] = None,
) -> Optional[WeeklyScheduleStats]:
    """
    Compute schedule strength for a specific week.
    
    Args:
        team: Team abbreviation
        week_start: Start of the week (defaults to current Monday)
        config: Data configuration
        season: Season identifier
        team_stats_cache: Pre-computed team stats
        
    Returns:
        WeeklyScheduleStats or None if no games
    """
    config = config or DataConfig()
    
    if week_start is None:
        # Get current Monday
        today = datetime.now()
        monday = today - timedelta(days=today.weekday())
        week_start = monday.strftime("%Y-%m-%d")
    
    week_start_dt = datetime.strptime(week_start, "%Y-%m-%d")
    week_end_dt = week_start_dt + timedelta(days=6)
    week_end = week_end_dt.strftime("%Y-%m-%d")
    
    target_season = season or (config.seasons[-1] if config.seasons else "20242025")
    
    # Get team schedule for the week
    schedule = fetch_remaining_schedule(
        team=team,
        from_date=week_start,
        to_date=week_end,
        season=target_season,
    )
    
    if schedule.empty:
        return None
    
    # Get opponent quality stats
    if team_stats_cache is None:
        team_stats_cache = compute_team_season_stats(config, target_season, week_start)
    
    opponents = []
    boom_factors = []
    home_games = 0
    away_games = 0
    
    for _, game in schedule.iterrows():
        if game["home_team"] == team:
            opp = game["away_team"]
            home_games += 1
        else:
            opp = game["home_team"]
            away_games += 1
        
        opponents.append(opp)
        
        if opp in team_stats_cache:
            boom_factors.append(team_stats_cache[opp].opponent_boom_factor)
        else:
            boom_factors.append(50.0)
    
    # Check for back-to-back
    game_dates = schedule["game_date"].sort_values()
    has_b2b = False
    prev_date = None
    for date in game_dates:
        if prev_date is not None:
            if (date - prev_date).days == 1:
                has_b2b = True
                break
        prev_date = date
    
    return WeeklyScheduleStats(
        team=team,
        week_start=week_start,
        week_end=week_end,
        games_count=len(schedule),
        opponents=opponents,
        avg_boom_factor=np.mean(boom_factors) if boom_factors else 50.0,
        has_back_to_back=has_b2b,
        home_games=home_games,
        away_games=away_games,
    )


def get_player_sos_boost(
    player_team: str,
    opponent_team: str,
    config: Optional[DataConfig] = None,
    season: Optional[str] = None,
    as_of_date: Optional[str] = None,
    team_stats_cache: Optional[Dict[str, TeamSeasonStats]] = None,
) -> Dict[str, float]:
    """
    Get strength of schedule boost features for a player's upcoming game.
    
    These features indicate how favorable the matchup is based on:
    1. Opponent defensive quality (immediate game)
    2. Player's team ROS schedule (future outlook)
    
    Args:
        player_team: Player's team abbreviation
        opponent_team: Opponent team abbreviation
        config: Data configuration
        season: Season identifier
        as_of_date: Date for calculations
        team_stats_cache: Pre-computed team stats
        
    Returns:
        Dictionary of SoS features for the model
    """
    config = config or DataConfig()
    target_season = season or (config.seasons[-1] if config.seasons else "20242025")
    
    # Get opponent quality features (for immediate game)
    opp_features = get_opponent_quality_features(
        opponent_team=opponent_team,
        config=config,
        season=target_season,
        as_of_date=as_of_date,
        team_stats_cache=team_stats_cache,
    )
    
    # Get ROS SoS for context
    ros_sos = compute_ros_strength_of_schedule(
        config=config,
        as_of_date=as_of_date,
        season=target_season,
        team_stats_cache=team_stats_cache,
    )
    
    # Get player's team ROS schedule quality
    if player_team in ros_sos:
        team_sos = ros_sos[player_team]
        ros_features = {
            "team_ros_sos_rank": team_sos.sos_rank,
            "team_ros_sos_rating": team_sos.sos_rating,
            "team_ros_easy_games": team_sos.easy_games_count,
            "team_ros_hard_games": team_sos.hard_games_count,
            "team_ros_games_remaining": team_sos.games_remaining,
        }
    else:
        ros_features = {
            "team_ros_sos_rank": 16,  # Middle of the pack
            "team_ros_sos_rating": 50.0,
            "team_ros_easy_games": 0,
            "team_ros_hard_games": 0,
            "team_ros_games_remaining": 0,
        }
    
    # Combine all features
    return {**opp_features, **ros_features}


if __name__ == "__main__":
    # Test the module
    print("Testing Rest-of-Season Strength of Schedule...")
    
    print("\n=== ROS Strength of Schedule Rankings ===")
    rankings = get_ros_sos_rankings(season="20242025")
    
    if not rankings.empty:
        print(rankings.to_string(index=False))
        
        print("\n=== Teams with Easiest ROS Schedule ===")
        for _, row in rankings.head(5).iterrows():
            print(f"  {row['team']}: Rank #{row['sos_rank']}, "
                  f"Avg Opp GA: {row['avg_opp_goals_against']:.2f}, "
                  f"Easy Games: {row['easy_games']}, Hard Games: {row['hard_games']}")
        
        print("\n=== Teams with Hardest ROS Schedule ===")
        for _, row in rankings.tail(5).iterrows():
            print(f"  {row['team']}: Rank #{row['sos_rank']}, "
                  f"Avg Opp GA: {row['avg_opp_goals_against']:.2f}, "
                  f"Easy Games: {row['easy_games']}, Hard Games: {row['hard_games']}")
    else:
        print("No schedule data found - check database connection and season data")
    
    # Test player SoS features
    print("\n=== Sample Player SoS Features (EDM vs ANA) ===")
    features = get_player_sos_boost(
        player_team="EDM",
        opponent_team="ANA",
        season="20242025",
    )
    for k, v in features.items():
        print(f"  {k}: {v}")

