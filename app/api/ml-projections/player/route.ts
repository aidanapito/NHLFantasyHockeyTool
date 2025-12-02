import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/ml-projections/player
 * 
 * Fetch player projections from the deep learning model.
 * 
 * Query params:
 * - playerId: NHL player ID (required)
 * - modelVersion: Model version to use (default: 'player_perf_v1')
 * - limit: Number of projections to return (default: 1, returns most recent)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const playerId = searchParams.get('playerId');
    const modelVersion = searchParams.get('modelVersion') || 'player_perf_v1';
    const limit = parseInt(searchParams.get('limit') || '1');

    if (!playerId) {
      return NextResponse.json(
        { error: 'playerId query parameter is required' },
        { status: 400 }
      );
    }

    // Find player by NHL ID
    const player = await prisma.player.findUnique({
      where: { nhlId: parseInt(playerId) },
      select: { id: true },
    });

    if (!player) {
      return NextResponse.json(
        { error: 'Player not found' },
        { status: 404 }
      );
    }

    // Fetch projections
    const projections = await prisma.playerProjection.findMany({
      where: {
        playerId: player.id,
        modelVersion,
      },
      orderBy: {
        gameDate: 'desc',
      },
      take: limit,
    });

    return NextResponse.json({
      playerId: parseInt(playerId),
      projections: projections.map(proj => ({
        gameDate: proj.gameDate,
        season: proj.season,
        modelVersion: proj.modelVersion,
        predictedGoals: proj.predictedGoals,
        predictedAssists: proj.predictedAssists,
        predictedPoints: proj.predictedPoints,
        predictedShots: proj.predictedShots,
        predictedShotsOnGoal: proj.predictedShotsOnGoal,
        predictedHits: proj.predictedHits,
        predictedBlocks: proj.predictedBlocks,
        predictedPowerPlayPoints: proj.predictedPowerPlayPoints,
        predictedPlusMinus: proj.predictedPlusMinus,
        predictedPim: proj.predictedPim,
        predictedToiSeconds: proj.predictedToiSeconds,
        predictedWins: proj.predictedWins,
        predictedSaves: proj.predictedSaves,
        predictedShotsAgainst: proj.predictedShotsAgainst,
        predictedGoalsAgainst: proj.predictedGoalsAgainst,
        predictedSavePct: proj.predictedSavePct,
        predictedShutouts: proj.predictedShutouts,
        createdAt: proj.createdAt,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching player projections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch player projections' },
      { status: 500 }
    );
  }
}
