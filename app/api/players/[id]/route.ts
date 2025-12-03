import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/players/[id]
 * 
 * Fetch comprehensive player data including:
 * - Player info
 * - Current season stats
 * - ML projections
 * - Historical game logs (for trends)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const playerId = parseInt(params.id);
    const { searchParams } = new URL(request.url);
    const season = searchParams.get('season') || '20252026';
    const modelVersion = searchParams.get('modelVersion') || 'player_perf_v1';
    const gameLogsLimit = parseInt(searchParams.get('gameLogsLimit') || '30');

    // Fetch player
    const player = await prisma.player.findUnique({
      where: { id: playerId },
    });

    if (!player) {
      return NextResponse.json(
        { error: 'Player not found' },
        { status: 404 }
      );
    }

    // Fetch current season stats
    const currentStats = await prisma.playerStats.findFirst({
      where: {
        playerId: player.id,
        season,
        gameType: 'regular',
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Fetch latest projection
    const projection = await prisma.playerProjection.findFirst({
      where: {
        playerId: player.id,
        modelVersion,
      },
      orderBy: { gameDate: 'desc' },
    });

    // Fetch recent game logs for trends
    const gameLogs = await prisma.gameLog.findMany({
      where: {
        playerId: player.id,
        season,
        gameType: 'regular',
      },
      orderBy: { gameDate: 'desc' },
      take: gameLogsLimit,
    });

    // Calculate per-game averages from current stats
    const gamesPlayed = currentStats?.gamesPlayed || 0;
    const perGameStats = gamesPlayed > 0 ? {
      goals: (currentStats?.goals || 0) / gamesPlayed,
      assists: (currentStats?.assists || 0) / gamesPlayed,
      points: (currentStats?.points || 0) / gamesPlayed,
      shots: (currentStats?.shots || 0) / gamesPlayed,
      shotsOnGoal: (currentStats?.shotsOnGoal || 0) / gamesPlayed,
      hits: (currentStats?.hits || 0) / gamesPlayed,
      blocks: (currentStats?.blocks || 0) / gamesPlayed,
      powerPlayPoints: (currentStats?.powerPlayPoints || 0) / gamesPlayed,
      plusMinus: (currentStats?.plusMinus || 0) / gamesPlayed,
      pim: (currentStats?.pim || 0) / gamesPlayed,
      timeOnIceSeconds: currentStats?.timeOnIceSeconds 
        ? currentStats.timeOnIceSeconds / gamesPlayed 
        : 0,
    } : null;

    // Calculate projection confidence based on games played and model performance
    // More games = higher confidence, but we can also factor in model evaluation metrics
    const projectionConfidence = gamesPlayed >= 20 
      ? 'High' 
      : gamesPlayed >= 10 
      ? 'Medium' 
      : 'Low';

    return NextResponse.json({
      player: {
        id: player.id,
        nhlId: player.nhlId,
        fullName: player.fullName,
        firstName: player.firstName,
        lastName: player.lastName,
        position: player.position,
        team: player.team,
        jerseyNumber: player.jerseyNumber,
        headshot: player.headshot,
        birthDate: player.birthDate,
        height: player.height,
        weight: player.weight,
      },
      currentStats: currentStats ? {
        season: currentStats.season,
        gamesPlayed: currentStats.gamesPlayed,
        goals: currentStats.goals,
        assists: currentStats.assists,
        points: currentStats.points,
        shots: currentStats.shots,
        shotsOnGoal: currentStats.shotsOnGoal,
        hits: currentStats.hits,
        blocks: currentStats.blocks,
        powerPlayPoints: currentStats.powerPlayPoints,
        plusMinus: currentStats.plusMinus,
        pim: currentStats.pim,
        timeOnIceSeconds: currentStats.timeOnIceSeconds,
        wins: currentStats.wins,
        saves: currentStats.saves,
        shotsAgainst: currentStats.shotsAgainst,
        goalsAgainst: currentStats.goalsAgainst,
        savePct: currentStats.savePct,
        shutouts: currentStats.shutouts,
        updatedAt: currentStats.updatedAt,
      } : null,
      perGameStats,
      projection: projection ? {
        gameDate: projection.gameDate,
        season: projection.season,
        modelVersion: projection.modelVersion,
        predictedGoals: projection.predictedGoals,
        predictedAssists: projection.predictedAssists,
        predictedPoints: projection.predictedPoints,
        predictedShots: projection.predictedShots,
        predictedShotsOnGoal: projection.predictedShotsOnGoal,
        predictedHits: projection.predictedHits,
        predictedBlocks: projection.predictedBlocks,
        predictedPowerPlayPoints: projection.predictedPowerPlayPoints,
        predictedPlusMinus: projection.predictedPlusMinus,
        predictedPim: projection.predictedPim,
        predictedToiSeconds: projection.predictedToiSeconds,
        predictedWins: projection.predictedWins,
        predictedSaves: projection.predictedSaves,
        predictedShotsAgainst: projection.predictedShotsAgainst,
        predictedGoalsAgainst: projection.predictedGoalsAgainst,
        predictedSavePct: projection.predictedSavePct,
        predictedShutouts: projection.predictedShutouts,
        createdAt: projection.createdAt,
      } : null,
      projectionConfidence,
      gameLogs: gameLogs.map(log => ({
        gameDate: log.gameDate,
        opponentTeam: log.opponentTeam,
        isHome: log.isHome,
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
        timeOnIceSeconds: log.timeOnIceSeconds,
        wins: log.wins,
        saves: log.saves,
        shotsAgainst: log.shotsAgainst,
        goalsAgainst: log.goalsAgainst,
        savePct: log.savePct,
        shutouts: log.shutouts,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching player details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch player details' },
      { status: 500 }
    );
  }
}

