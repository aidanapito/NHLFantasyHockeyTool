/**
 * Strength of Schedule Calculator
 * 
 * Computes team defensive/offensive quality metrics and rest-of-season
 * strength of schedule for fantasy hockey analysis.
 */

import { prisma } from './prisma';

export interface TeamDefensiveStats {
  team: string;
  gamesPlayed: number;
  goalsAgainstTotal: number;
  goalsAgainstPerGame: number;
  shotsAgainstTotal: number;
  shotsAgainstPerGame: number;
  goalsAgainstRank: number;  // 1 = most goals allowed (worst defense)
  defensiveRating: number;   // 0-100, higher = better defense
}

export interface TeamOffensiveStats {
  team: string;
  gamesPlayed: number;
  goalsForTotal: number;
  goalsPerGame: number;
  shotsForTotal: number;
  shotsPerGame: number;
  goalsForRank: number;      // 1 = fewest goals (worst offense)
  offensiveRating: number;   // 0-100, higher = better offense
}

export interface TeamSeasonStats {
  team: string;
  defensive: TeamDefensiveStats;
  offensive: TeamOffensiveStats;
  // Boom factor: how likely are opposing players to have big games?
  // Higher = easier matchup for opposing players
  opponentBoomFactor: number;
}

export interface TeamScheduleStats {
  team: string;
  gamesRemaining: number;
  avgOppGoalsAgainst: number;  // Avg goals allowed by opponents (higher = easier)
  avgOppBoomFactor: number;    // Avg boom factor of opponents (higher = easier)
  easyGamesCount: number;      // Games vs bottom-8 defenses
  hardGamesCount: number;      // Games vs top-8 defenses
  sosRank: number;             // 1 = easiest ROS schedule
  sosRating: number;           // 0-100, higher = easier schedule
}

export interface OpponentQualityFeatures {
  oppDefensiveRating: number;
  oppBoomFactor: number;
  oppGoalsAgainstPerGame: number;
  oppShotsAgainstPerGame: number;
  oppIsWeakDefense: boolean;
  oppIsStrongDefense: boolean;
}

/**
 * Compute team season stats from GameLog data.
 */
export async function computeTeamSeasonStats(
  season: string = '20242025',
  asOfDate?: Date
): Promise<Map<string, TeamSeasonStats>> {
  const dateFilter = asOfDate 
    ? { lte: asOfDate }
    : undefined;

  // Get all game logs for the season
  const gameLogs = await prisma.gameLog.findMany({
    where: {
      season,
      gameType: 'regular',
      gameDate: dateFilter,
    },
    select: {
      team: true,
      opponentTeam: true,
      gameId: true,
      gameDate: true,
      goals: true,
      shots: true,
    },
  });

  if (gameLogs.length === 0) {
    return new Map();
  }

  // Aggregate stats per team
  const teamStats = new Map<string, {
    gamesPlayed: Set<number>;
    goalsFor: number;
    shotsFor: number;
    goalsAgainst: number;
    shotsAgainst: number;
  }>();

  for (const log of gameLogs) {
    // Initialize team stats if not exists
    if (!teamStats.has(log.team)) {
      teamStats.set(log.team, {
        gamesPlayed: new Set(),
        goalsFor: 0,
        shotsFor: 0,
        goalsAgainst: 0,
        shotsAgainst: 0,
      });
    }
    
    const stats = teamStats.get(log.team)!;
    stats.gamesPlayed.add(log.gameId);
    stats.goalsFor += log.goals;
    stats.shotsFor += log.shots;

    // Goals/shots against for opponent (opponent's perspective)
    if (!teamStats.has(log.opponentTeam)) {
      teamStats.set(log.opponentTeam, {
        gamesPlayed: new Set(),
        goalsFor: 0,
        shotsFor: 0,
        goalsAgainst: 0,
        shotsAgainst: 0,
      });
    }
    const oppStats = teamStats.get(log.opponentTeam)!;
    oppStats.goalsAgainst += log.goals;
    oppStats.shotsAgainst += log.shots;
  }

  // Calculate per-game rates and rankings
  const teamsArray = Array.from(teamStats.entries()).map(([team, stats]) => {
    const gamesPlayed = stats.gamesPlayed.size;
    return {
      team,
      gamesPlayed,
      goalsFor: stats.goalsFor,
      shotsFor: stats.shotsFor,
      goalsAgainst: stats.goalsAgainst,
      shotsAgainst: stats.shotsAgainst,
      goalsPerGame: gamesPlayed > 0 ? stats.goalsFor / gamesPlayed : 0,
      shotsPerGame: gamesPlayed > 0 ? stats.shotsFor / gamesPlayed : 0,
      goalsAgainstPerGame: gamesPlayed > 0 ? stats.goalsAgainst / gamesPlayed : 0,
      shotsAgainstPerGame: gamesPlayed > 0 ? stats.shotsAgainst / gamesPlayed : 0,
    };
  });

  // Sort by goals against per game for ranking (most = rank 1 = worst defense)
  teamsArray.sort((a, b) => b.goalsAgainstPerGame - a.goalsAgainstPerGame);
  
  const totalTeams = teamsArray.length;
  
  const result = new Map<string, TeamSeasonStats>();
  
  teamsArray.forEach((team, index) => {
    const goalsAgainstRank = index + 1; // 1 = most goals allowed (worst defense)
    const goalsForRank = teamsArray
      .slice()
      .sort((a, b) => a.goalsPerGame - b.goalsPerGame)
      .findIndex(t => t.team === team.team) + 1;
    
    // Defensive rating: lower goals against = higher rating
    // Rank 1 (worst defense, most GA) = low rating
    // Rank 32 (best defense, least GA) = high rating
    const defensiveRating = (goalsAgainstRank / totalTeams) * 100;
    
    // Offensive rating: higher goals for = higher rating
    const offensiveRating = ((totalTeams - goalsForRank + 1) / totalTeams) * 100;
    
    // Boom factor: higher goals against = higher boom factor (easier matchup for opponents)
    // Rank 1 = most goals allowed = highest boom factor (100%)
    // Rank 32 = fewest goals allowed = lowest boom factor (3%)
    // This is the INVERSE of defensive rating
    const boomFactor = ((totalTeams - goalsAgainstRank + 1) / totalTeams) * 100;
    
    result.set(team.team, {
      team: team.team,
      defensive: {
        team: team.team,
        gamesPlayed: team.gamesPlayed,
        goalsAgainstTotal: team.goalsAgainst,
        goalsAgainstPerGame: team.goalsAgainstPerGame,
        shotsAgainstTotal: team.shotsAgainst,
        shotsAgainstPerGame: team.shotsAgainstPerGame,
        goalsAgainstRank,
        defensiveRating,
      },
      offensive: {
        team: team.team,
        gamesPlayed: team.gamesPlayed,
        goalsForTotal: team.goalsFor,
        goalsPerGame: team.goalsPerGame,
        shotsForTotal: team.shotsFor,
        shotsPerGame: team.shotsPerGame,
        goalsForRank,
        offensiveRating,
      },
      opponentBoomFactor: boomFactor,
    });
  });

  return result;
}

/**
 * Get team defensive rankings sorted by boom factor (easiest matchups first).
 */
export async function getTeamDefensiveRankings(
  season: string = '20242025',
  asOfDate?: Date
): Promise<TeamSeasonStats[]> {
  const statsMap = await computeTeamSeasonStats(season, asOfDate);
  const stats = Array.from(statsMap.values());
  
  // Sort by boom factor (highest = easiest matchup = first)
  return stats.sort((a, b) => b.opponentBoomFactor - a.opponentBoomFactor);
}

/**
 * Get opponent quality features for a specific matchup.
 */
export async function getOpponentQualityFeatures(
  opponentTeam: string,
  season: string = '20242025',
  asOfDate?: Date,
  statsCache?: Map<string, TeamSeasonStats>
): Promise<OpponentQualityFeatures> {
  const stats = statsCache ?? await computeTeamSeasonStats(season, asOfDate);
  const oppStats = stats.get(opponentTeam);

  if (!oppStats) {
    // Return neutral defaults for unknown teams
    return {
      oppDefensiveRating: 50,
      oppBoomFactor: 50,
      oppGoalsAgainstPerGame: 3.0,
      oppShotsAgainstPerGame: 30.0,
      oppIsWeakDefense: false,
      oppIsStrongDefense: false,
    };
  }

  // Bottom 8 defenses = weak (rank 1-8)
  const isWeakDefense = oppStats.defensive.goalsAgainstRank <= 8;
  // Top 8 defenses = strong (rank 25-32)
  const isStrongDefense = oppStats.defensive.goalsAgainstRank >= 25;

  return {
    oppDefensiveRating: oppStats.defensive.defensiveRating,
    oppBoomFactor: oppStats.opponentBoomFactor,
    oppGoalsAgainstPerGame: oppStats.defensive.goalsAgainstPerGame,
    oppShotsAgainstPerGame: oppStats.defensive.shotsAgainstPerGame,
    oppIsWeakDefense: isWeakDefense,
    oppIsStrongDefense: isStrongDefense,
  };
}

/**
 * Get remaining games for teams from the database.
 * Uses existing GameLog data to infer schedule (limited to recorded games).
 */
export async function getRemainingGamesFromLogs(
  season: string,
  fromDate: Date,
  toDate?: Date
): Promise<Map<string, string[]>> {
  // For future games, we need to check what games exist in the database
  // that haven't been played yet or are scheduled
  const futureLogs = await prisma.gameLog.findMany({
    where: {
      season,
      gameType: 'regular',
      gameDate: {
        gte: fromDate,
        ...(toDate ? { lte: toDate } : {}),
      },
    },
    distinct: ['team', 'gameId'],
    select: {
      team: true,
      opponentTeam: true,
      gameDate: true,
      gameId: true,
    },
  });

  const teamOpponents = new Map<string, string[]>();

  for (const game of futureLogs) {
    if (!teamOpponents.has(game.team)) {
      teamOpponents.set(game.team, []);
    }
    teamOpponents.get(game.team)!.push(game.opponentTeam);
  }

  return teamOpponents;
}

/**
 * Compute rest-of-season strength of schedule for all teams.
 */
export async function computeRosStrengthOfSchedule(
  season: string = '20242025',
  asOfDate?: Date
): Promise<Map<string, TeamScheduleStats>> {
  const today = asOfDate ?? new Date();
  
  // Get current team defensive stats
  const teamStats = await computeTeamSeasonStats(season, today);
  
  if (teamStats.size === 0) {
    return new Map();
  }

  // Get remaining schedule
  const remainingOpponents = await getRemainingGamesFromLogs(season, today);
  
  const result = new Map<string, TeamScheduleStats>();
  const sosScores = new Map<string, number>();

  for (const [team, opponents] of remainingOpponents) {
    if (opponents.length === 0) continue;

    let totalBoomFactor = 0;
    let totalGoalsAgainst = 0;
    let easyGames = 0;
    let hardGames = 0;
    let validOpponents = 0;

    for (const opp of opponents) {
      const oppStats = teamStats.get(opp);
      if (oppStats) {
        totalBoomFactor += oppStats.opponentBoomFactor;
        totalGoalsAgainst += oppStats.defensive.goalsAgainstPerGame;
        validOpponents++;

        if (oppStats.defensive.goalsAgainstRank <= 8) {
          easyGames++;
        } else if (oppStats.defensive.goalsAgainstRank >= 25) {
          hardGames++;
        }
      }
    }

    const avgBoomFactor = validOpponents > 0 ? totalBoomFactor / validOpponents : 50;
    const avgGoalsAgainst = validOpponents > 0 ? totalGoalsAgainst / validOpponents : 3.0;

    sosScores.set(team, avgBoomFactor);

    result.set(team, {
      team,
      gamesRemaining: opponents.length,
      avgOppGoalsAgainst: avgGoalsAgainst,
      avgOppBoomFactor: avgBoomFactor,
      easyGamesCount: easyGames,
      hardGamesCount: hardGames,
      sosRank: 0, // Will be set after sorting
      sosRating: avgBoomFactor,
    });
  }

  // Compute rankings
  const sortedTeams = Array.from(sosScores.entries())
    .sort((a, b) => b[1] - a[1]); // Higher boom factor = easier = rank 1

  sortedTeams.forEach(([team], index) => {
    const stats = result.get(team);
    if (stats) {
      stats.sosRank = index + 1;
    }
  });

  return result;
}

/**
 * Get ROS strength of schedule rankings as an array sorted by easiest first.
 */
export async function getRosSosRankings(
  season: string = '20242025',
  asOfDate?: Date
): Promise<TeamScheduleStats[]> {
  const sosMap = await computeRosStrengthOfSchedule(season, asOfDate);
  const rankings = Array.from(sosMap.values());
  return rankings.sort((a, b) => a.sosRank - b.sosRank);
}

/**
 * Get player SoS boost features for an upcoming game.
 * Returns features indicating how favorable the matchup is.
 */
export async function getPlayerSosBoost(
  playerTeam: string,
  opponentTeam: string,
  season: string = '20242025',
  asOfDate?: Date
): Promise<{
  opponent: OpponentQualityFeatures;
  rosSchedule: TeamScheduleStats | null;
}> {
  const teamStats = await computeTeamSeasonStats(season, asOfDate);
  const oppFeatures = await getOpponentQualityFeatures(
    opponentTeam, 
    season, 
    asOfDate, 
    teamStats
  );

  const rosSchedule = await computeRosStrengthOfSchedule(season, asOfDate);
  const teamRosSchedule = rosSchedule.get(playerTeam) ?? null;

  return {
    opponent: oppFeatures,
    rosSchedule: teamRosSchedule,
  };
}

/**
 * Cache team stats to the database for faster lookups.
 */
export async function cacheTeamSeasonStats(
  season: string,
  asOfDate: Date
): Promise<void> {
  const stats = await computeTeamSeasonStats(season, asOfDate);
  const rosSchedule = await computeRosStrengthOfSchedule(season, asOfDate);

  for (const [team, teamStats] of stats) {
    const ros = rosSchedule.get(team);

    await prisma.teamSeasonStats.upsert({
      where: {
        team_season_asOfDate: {
          team,
          season,
          asOfDate,
        },
      },
      update: {
        gamesPlayed: teamStats.defensive.gamesPlayed,
        goalsFor: teamStats.offensive.goalsForTotal,
        goalsPerGame: teamStats.offensive.goalsPerGame,
        shotsFor: teamStats.offensive.shotsForTotal,
        shotsPerGame: teamStats.offensive.shotsPerGame,
        offensiveRating: teamStats.offensive.offensiveRating,
        goalsForRank: teamStats.offensive.goalsForRank,
        goalsAgainst: teamStats.defensive.goalsAgainstTotal,
        goalsAgainstPerGame: teamStats.defensive.goalsAgainstPerGame,
        shotsAgainst: teamStats.defensive.shotsAgainstTotal,
        shotsAgainstPerGame: teamStats.defensive.shotsAgainstPerGame,
        defensiveRating: teamStats.defensive.defensiveRating,
        goalsAgainstRank: teamStats.defensive.goalsAgainstRank,
        opponentBoomFactor: teamStats.opponentBoomFactor,
        rosGamesRemaining: ros?.gamesRemaining,
        rosSosRank: ros?.sosRank,
        rosSosRating: ros?.sosRating,
        rosEasyGames: ros?.easyGamesCount,
        rosHardGames: ros?.hardGamesCount,
        avgOppGoalsAgainst: ros?.avgOppGoalsAgainst,
        updatedAt: new Date(),
      },
      create: {
        team,
        season,
        asOfDate,
        gamesPlayed: teamStats.defensive.gamesPlayed,
        goalsFor: teamStats.offensive.goalsForTotal,
        goalsPerGame: teamStats.offensive.goalsPerGame,
        shotsFor: teamStats.offensive.shotsForTotal,
        shotsPerGame: teamStats.offensive.shotsPerGame,
        offensiveRating: teamStats.offensive.offensiveRating,
        goalsForRank: teamStats.offensive.goalsForRank,
        goalsAgainst: teamStats.defensive.goalsAgainstTotal,
        goalsAgainstPerGame: teamStats.defensive.goalsAgainstPerGame,
        shotsAgainst: teamStats.defensive.shotsAgainstTotal,
        shotsAgainstPerGame: teamStats.defensive.shotsAgainstPerGame,
        defensiveRating: teamStats.defensive.defensiveRating,
        goalsAgainstRank: teamStats.defensive.goalsAgainstRank,
        opponentBoomFactor: teamStats.opponentBoomFactor,
        rosGamesRemaining: ros?.gamesRemaining,
        rosSosRank: ros?.sosRank,
        rosSosRating: ros?.sosRating,
        rosEasyGames: ros?.easyGamesCount,
        rosHardGames: ros?.hardGamesCount,
        avgOppGoalsAgainst: ros?.avgOppGoalsAgainst,
      },
    });
  }
}

