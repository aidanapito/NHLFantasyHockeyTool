import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/ml-projections
 * 
 * Fetch all player projections from the deep learning model.
 * 
 * Query params:
 * - modelVersion: Model version to use (default: 'player_perf_v1')
 * - limit: Number of projections to return (default: 1000)
 * - position: Filter by position (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const modelVersion = searchParams.get('modelVersion') || 'player_perf_v1';
    const limit = parseInt(searchParams.get('limit') || '1000');
    const position = searchParams.get('position');

    // Build where clause
    const where: any = {
      modelVersion,
    };

    if (position) {
      where.player = {
        position: position,
      };
    }

    // Fetch latest projection per player
    const projections = await prisma.playerProjection.findMany({
      where,
      include: {
        player: {
          select: {
            id: true,
            nhlId: true,
            fullName: true,
            position: true,
            team: true,
          },
        },
      },
      orderBy: [
        { player: { fullName: 'asc' } },
        { gameDate: 'desc' },
      ],
      take: limit,
    });

    // Get current season stats to calculate games played
    const seasonStats = await prisma.playerStats.findMany({
      where: {
        playerId: { in: projections.map(p => p.playerId) },
        season: projections[0]?.season || '20252026',
        gameType: 'regular',
      },
      select: {
        playerId: true,
        gamesPlayed: true,
        goals: true,
        assists: true,
        points: true,
        shotsOnGoal: true,
        hits: true,
        blockedShots: true,
        powerPlayPoints: true,
        plusMinus: true,
        pim: true,
        wins: true,
        saves: true,
        shotsAgainst: true,
        goalsAgainst: true,
        shutouts: true,
      },
    });

    const statsMap = new Map(seasonStats.map(s => [s.playerId, s]));

    // NHL season is 82 games
    const SEASON_LENGTH = 82;

    // Group by player and get most recent projection
    const playerMap = new Map();
    for (const proj of projections) {
      const key = proj.playerId;
      if (!playerMap.has(key)) {
        const stats = statsMap.get(proj.playerId);
        const gamesPlayed = stats?.gamesPlayed || 0;
        const gamesRemaining = Math.max(0, SEASON_LENGTH - gamesPlayed);

        // Model's per-game predictions
        const modelPerGame = {
          goals: proj.predictedGoals || 0,
          assists: proj.predictedAssists || 0,
          points: proj.predictedPoints || 0,
          shots: proj.predictedShots || 0,
          shotsOnGoal: proj.predictedShotsOnGoal || 0,
          hits: proj.predictedHits || 0,
          blocks: proj.predictedBlocks || 0,
          powerPlayPoints: proj.predictedPowerPlayPoints || 0,
          plusMinus: proj.predictedPlusMinus || 0,
          pim: proj.predictedPim || 0,
          toiSeconds: proj.predictedToiSeconds || 0,
          wins: proj.predictedWins || 0,
          saves: proj.predictedSaves || 0,
          shotsAgainst: proj.predictedShotsAgainst || 0,
          goalsAgainst: proj.predictedGoalsAgainst || 0,
          shutouts: proj.predictedShutouts || 0,
        };

        // Current pace (per-game rates from actual stats)
        const currentPace = gamesPlayed > 0 ? {
          goals: (stats?.goals || 0) / gamesPlayed,
          assists: (stats?.assists || 0) / gamesPlayed,
          points: (stats?.points || 0) / gamesPlayed,
          shots: (stats?.shotsOnGoal || 0) / gamesPlayed,
          shotsOnGoal: (stats?.shotsOnGoal || 0) / gamesPlayed,
          hits: (stats?.hits || 0) / gamesPlayed,
          blocks: (stats?.blockedShots || 0) / gamesPlayed,
          powerPlayPoints: (stats?.powerPlayPoints || 0) / gamesPlayed,
          plusMinus: (stats?.plusMinus || 0) / gamesPlayed,
          pim: (stats?.pim || 0) / gamesPlayed,
          wins: (stats?.wins || 0) / gamesPlayed,
          saves: (stats?.saves || 0) / gamesPlayed,
          shotsAgainst: (stats?.shotsAgainst || 0) / gamesPlayed,
          goalsAgainst: (stats?.goalsAgainst || 0) / gamesPlayed,
          shutouts: (stats?.shutouts || 0) / gamesPlayed,
        } : modelPerGame;

        // Blend current pace with model prediction
        // More games played = more weight on current pace (less regression)
        // Formula: weight = min(0.7, gamesPlayed / 30) - caps at 70% current pace
        // This means: 0 games = 0% current, 30+ games = 70% current, 30% model
        const currentPaceWeight = Math.min(0.7, gamesPlayed / 30);
        const modelWeight = 1 - currentPaceWeight;

        // Blended per-game projection
        const perGame = {
          goals: (currentPace.goals * currentPaceWeight) + (modelPerGame.goals * modelWeight),
          assists: (currentPace.assists * currentPaceWeight) + (modelPerGame.assists * modelWeight),
          points: (currentPace.points * currentPaceWeight) + (modelPerGame.points * modelWeight),
          shots: (currentPace.shots * currentPaceWeight) + (modelPerGame.shots * modelWeight),
          shotsOnGoal: (currentPace.shotsOnGoal * currentPaceWeight) + (modelPerGame.shotsOnGoal * modelWeight),
          hits: (currentPace.hits * currentPaceWeight) + (modelPerGame.hits * modelWeight),
          blocks: (currentPace.blocks * currentPaceWeight) + (modelPerGame.blocks * modelWeight),
          powerPlayPoints: (currentPace.powerPlayPoints * currentPaceWeight) + (modelPerGame.powerPlayPoints * modelWeight),
          plusMinus: (currentPace.plusMinus * currentPaceWeight) + (modelPerGame.plusMinus * modelWeight),
          pim: (currentPace.pim * currentPaceWeight) + (modelPerGame.pim * modelWeight),
          toiSeconds: (currentPace.toiSeconds || modelPerGame.toiSeconds) * currentPaceWeight + (modelPerGame.toiSeconds * modelWeight),
          wins: (currentPace.wins * currentPaceWeight) + (modelPerGame.wins * modelWeight),
          saves: ((currentPace.saves || 0) * currentPaceWeight) + (modelPerGame.saves * modelWeight),
          shotsAgainst: ((currentPace.shotsAgainst || 0) * currentPaceWeight) + (modelPerGame.shotsAgainst * modelWeight),
          goalsAgainst: ((currentPace.goalsAgainst || 0) * currentPaceWeight) + (modelPerGame.goalsAgainst * modelWeight),
          shutouts: (currentPace.shutouts * currentPaceWeight) + (modelPerGame.shutouts * modelWeight),
        };

        // Season projections = current stats + (blended per-game * games remaining)
        const seasonProjection = {
          goals: (stats?.goals || 0) + (perGame.goals * gamesRemaining),
          assists: (stats?.assists || 0) + (perGame.assists * gamesRemaining),
          points: (stats?.points || 0) + (perGame.points * gamesRemaining),
          shots: (stats?.shotsOnGoal || 0) + (perGame.shotsOnGoal * gamesRemaining),
          shotsOnGoal: (stats?.shotsOnGoal || 0) + (perGame.shotsOnGoal * gamesRemaining),
          hits: (stats?.hits || 0) + (perGame.hits * gamesRemaining),
          blocks: (stats?.blockedShots || 0) + (perGame.blocks * gamesRemaining),
          powerPlayPoints: (stats?.powerPlayPoints || 0) + (perGame.powerPlayPoints * gamesRemaining),
          plusMinus: (stats?.plusMinus || 0) + (perGame.plusMinus * gamesRemaining),
          pim: (stats?.pim || 0) + (perGame.pim * gamesRemaining),
          wins: (stats?.wins || 0) + (perGame.wins * gamesRemaining),
          saves: (stats?.saves || 0) + (perGame.saves * gamesRemaining),
          shotsAgainst: (stats?.shotsAgainst || 0) + (perGame.shotsAgainst * gamesRemaining),
          goalsAgainst: (stats?.goalsAgainst || 0) + (perGame.goalsAgainst * gamesRemaining),
          shutouts: (stats?.shutouts || 0) + (perGame.shutouts * gamesRemaining),
        };

        playerMap.set(key, {
          player: proj.player,
          projection: {
            gameDate: proj.gameDate,
            season: proj.season,
            modelVersion: proj.modelVersion,
            // Per-game projections
            perGame,
            // Season projections (full season totals)
            seasonProjection: seasonProjection,
            // Current stats
            current: {
              gamesPlayed,
              goals: stats?.goals || 0,
              assists: stats?.assists || 0,
              points: stats?.points || 0,
              shotsOnGoal: stats?.shotsOnGoal || 0,
              hits: stats?.hits || 0,
              blockedShots: stats?.blockedShots || 0,
              powerPlayPoints: stats?.powerPlayPoints || 0,
              plusMinus: stats?.plusMinus || 0,
              pim: stats?.pim || 0,
              wins: stats?.wins || 0,
              saves: stats?.saves || 0,
              shotsAgainst: stats?.shotsAgainst || 0,
              goalsAgainst: stats?.goalsAgainst || 0,
              shutouts: stats?.shutouts || 0,
            },
            gamesRemaining,
            createdAt: proj.createdAt,
          },
        });
      }
    }

    const results = Array.from(playerMap.values());

    return NextResponse.json({
      success: true,
      count: results.length,
      modelVersion,
      projections: results,
    });
  } catch (error: any) {
    console.error('Error fetching projections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projections' },
      { status: 500 }
    );
  }
}

