/**
 * Game Log Utilities
 * 
 * Helper functions for querying game logs from the database for ML predictions.
 * These utilities provide easy access to game-by-game statistics needed for
 * building features and making predictions.
 */

import { prisma } from './prisma';

export interface GameLogRow {
  id: number;
  playerId: number;
  gameId: number;
  gameDate: Date;
  season: string;
  gameType: string;
  opponentTeam: string;
  isHome: boolean;
  team: string;
  goals: number;
  assists: number;
  points: number;
  shots: number;
  shotsOnGoal: number;
  hits: number;
  blocks: number;
  powerPlayPoints: number;
  plusMinus: number;
  pim: number;
  timeOnIce: string | null;
  timeOnIceSeconds: number | null;
  wins: number | null;
  saves: number | null;
  shotsAgainst: number | null;
  goalsAgainst: number | null;
  savePct: number | null;
  shutouts: number | null;
}

/**
 * Get game logs for a specific player up to (but not including) a given date.
 * This is useful for building features for predictions where we need historical
 * data up to a certain point in time.
 * 
 * @param nhlId - NHL player ID (from Player.nhlId)
 * @param season - Season identifier (e.g., "20252026")
 * @param beforeDate - Get only games before this date (exclusive)
 * @returns Array of game logs ordered by date (ascending)
 */
export async function getPlayerGameLogsUpToDate(
  nhlId: number,
  season: string,
  beforeDate?: Date
): Promise<GameLogRow[]> {
  const whereClause: any = {
    player: {
      nhlId: nhlId,
    },
    season: season,
    gameType: 'regular',
  };

  if (beforeDate) {
    whereClause.gameDate = {
      lt: beforeDate,
    };
  }

  const gameLogs = await prisma.gameLog.findMany({
    where: whereClause,
    orderBy: {
      gameDate: 'asc',
    },
    include: {
      player: {
        select: {
          id: true,
          nhlId: true,
        },
      },
    },
  });

  // Map to the return type format
  return gameLogs.map((log) => ({
    id: log.id,
    playerId: log.playerId,
    gameId: log.gameId,
    gameDate: log.gameDate,
    season: log.season,
    gameType: log.gameType,
    opponentTeam: log.opponentTeam,
    isHome: log.isHome,
    team: log.team,
    goals: log.goals,
    assists: log.assists,
    points: log.points,
    shots: log.shots,
    shotsOnGoal: log.shotsOnGoal,
    hits: log.hits,
    blocks: log.blocks,
    powerPlayPoints: log.powerPlayPoints,
    plusMinus: log.plusMinus,
    pim: log.pim,
    timeOnIce: log.timeOnIce,
    timeOnIceSeconds: log.timeOnIceSeconds,
    wins: log.wins,
    saves: log.saves,
    shotsAgainst: log.shotsAgainst,
    goalsAgainst: log.goalsAgainst,
    savePct: log.savePct,
    shutouts: log.shutouts,
  }));
}

/**
 * Get all game logs for a specific player in a season.
 * 
 * @param nhlId - NHL player ID
 * @param season - Season identifier (e.g., "20252026")
 * @returns Array of game logs ordered by date (ascending)
 */
export async function getPlayerGameLogsForSeason(
  nhlId: number,
  season: string
): Promise<GameLogRow[]> {
  return getPlayerGameLogsUpToDate(nhlId, season);
}

/**
 * Get game logs for multiple players in a season.
 * Useful for batch processing predictions.
 * 
 * @param nhlIds - Array of NHL player IDs
 * @param season - Season identifier (e.g., "20252026")
 * @param beforeDate - Optional: Get only games before this date
 * @returns Map of player NHL ID to array of game logs
 */
export async function getMultiplePlayersGameLogs(
  nhlIds: number[],
  season: string,
  beforeDate?: Date
): Promise<Map<number, GameLogRow[]>> {
  const whereClause: any = {
    player: {
      nhlId: {
        in: nhlIds,
      },
    },
    season: season,
    gameType: 'regular',
  };

  if (beforeDate) {
    whereClause.gameDate = {
      lt: beforeDate,
    };
  }

  const gameLogs = await prisma.gameLog.findMany({
    where: whereClause,
    orderBy: [
      {
        player: {
          nhlId: 'asc',
        },
      },
      {
        gameDate: 'asc',
      },
    ],
    include: {
      player: {
        select: {
          id: true,
          nhlId: true,
        },
      },
    },
  });

  // Group by player NHL ID
  const result = new Map<number, GameLogRow[]>();
  
  for (const log of gameLogs) {
    const playerNhlId = log.player.nhlId;
    if (!result.has(playerNhlId)) {
      result.set(playerNhlId, []);
    }
    
    result.get(playerNhlId)!.push({
      id: log.id,
      playerId: log.playerId,
      gameId: log.gameId,
      gameDate: log.gameDate,
      season: log.season,
      gameType: log.gameType,
      opponentTeam: log.opponentTeam,
      isHome: log.isHome,
      team: log.team,
      goals: log.goals,
      assists: log.assists,
      points: log.points,
      shots: log.shots,
      shotsOnGoal: log.shotsOnGoal,
      hits: log.hits,
      blocks: log.blocks,
      powerPlayPoints: log.powerPlayPoints,
      plusMinus: log.plusMinus,
      pim: log.pim,
      timeOnIce: log.timeOnIce,
      timeOnIceSeconds: log.timeOnIceSeconds,
      wins: log.wins,
      saves: log.saves,
      shotsAgainst: log.shotsAgainst,
      goalsAgainst: log.goalsAgainst,
      savePct: log.savePct,
      shutouts: log.shutouts,
    });
  }

  return result;
}

/**
 * Check if game log data exists for a specific season.
 * 
 * @param season - Season identifier (e.g., "20252026")
 * @returns Object with count of games and unique players
 */
export async function checkSeasonGameLogData(season: string): Promise<{
  gameCount: number;
  playerCount: number;
  dateRange: { min: Date | null; max: Date | null };
}> {
  const [count, playerCountResult, dateRange] = await Promise.all([
    prisma.gameLog.count({
      where: {
        season: season,
        gameType: 'regular',
      },
    }),
    prisma.gameLog.groupBy({
      by: ['playerId'],
      where: {
        season: season,
        gameType: 'regular',
      },
      _count: {
        playerId: true,
      },
    }),
    prisma.gameLog.aggregate({
      where: {
        season: season,
        gameType: 'regular',
      },
      _min: {
        gameDate: true,
      },
      _max: {
        gameDate: true,
      },
    }),
  ]);

  return {
    gameCount: count,
    playerCount: playerCountResult.length,
    dateRange: {
      min: dateRange._min.gameDate,
      max: dateRange._max.gameDate,
    },
  };
}

