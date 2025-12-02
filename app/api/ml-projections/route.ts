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

    // Group by player and get most recent projection
    const playerMap = new Map();
    for (const proj of projections) {
      const key = proj.playerId;
      if (!playerMap.has(key)) {
        playerMap.set(key, {
          player: proj.player,
          projection: {
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

