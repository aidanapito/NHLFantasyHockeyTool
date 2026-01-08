import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Cache configuration - revalidate every 5 minutes (300 seconds)
export const revalidate = 300; // 5 minutes

/**
 * GET /api/players/[id]
 * 
 * Fetch comprehensive player data including:
 * - Player info
 * - Current season stats
 * - ML projections
 * - Historical game logs (for trends)
 * 
 * Optimized with:
 * - Parallel database queries
 * - Reduced default game logs (10 instead of 30)
 * - Selected fields only
 * - API route caching
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const idParam = parseInt(params.id);
    const { searchParams } = new URL(request.url);
    const season = searchParams.get('season') || '20252026';
    const modelVersion = searchParams.get('modelVersion') || 'player_perf_v1';
    // Reduced default from 30 to 10 since page only shows 10 initially
    const gameLogsLimit = parseInt(searchParams.get('gameLogsLimit') || '10');

    // Try to find player by database ID first, then by NHL ID
    // This handles both cases since StatsDisplay uses NHL ID but we want to support both
    let player = await prisma.player.findUnique({
      where: { id: idParam },
      select: {
        id: true,
        nhlId: true,
        firstName: true,
        lastName: true,
        fullName: true,
        position: true,
        team: true,
        jerseyNumber: true,
        headshot: true,
        birthDate: true,
        height: true,
        weight: true,
      },
    });

    // If not found by database ID, try NHL ID
    if (!player) {
      player = await prisma.player.findUnique({
        where: { nhlId: idParam },
        select: {
          id: true,
          nhlId: true,
          firstName: true,
          lastName: true,
          fullName: true,
          position: true,
          team: true,
          jerseyNumber: true,
          headshot: true,
          birthDate: true,
          height: true,
          weight: true,
        },
      });
    }

    if (!player) {
      return NextResponse.json(
        { error: 'Player not found' },
        { status: 404 }
      );
    }

    // Parallel database queries for better performance
    const [currentStats, projection, gameLogs] = await Promise.all([
      // Fetch current season stats
      prisma.playerStats.findFirst({
        where: {
          playerId: player.id,
          season,
          gameType: 'regular',
        },
        select: {
          season: true,
          gamesPlayed: true,
          goals: true,
          assists: true,
          points: true,
          shots: true,
          shotsOnGoal: true,
          hits: true,
          blockedShots: true,
          powerPlayPoints: true,
          plusMinus: true,
          pim: true,
          timeOnIce: true,
          timeOnIcePerGame: true,
          wins: true,
          saves: true,
          shotsAgainst: true,
          goalsAgainst: true,
          savePct: true,
          shutouts: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),

      // Fetch latest projection
      prisma.playerProjection.findFirst({
        where: {
          playerId: player.id,
          modelVersion,
        },
        select: {
          gameDate: true,
          season: true,
          modelVersion: true,
          predictedGoals: true,
          predictedAssists: true,
          predictedPoints: true,
          predictedShots: true,
          predictedShotsOnGoal: true,
          predictedHits: true,
          predictedBlocks: true,
          predictedPowerPlayPoints: true,
          predictedPlusMinus: true,
          predictedPim: true,
          predictedToiSeconds: true,
          predictedWins: true,
          predictedSaves: true,
          predictedShotsAgainst: true,
          predictedGoalsAgainst: true,
          predictedSavePct: true,
          predictedShutouts: true,
          createdAt: true,
        },
        orderBy: { gameDate: 'desc' },
      }),

      // Fetch recent game logs for trends (reduced default)
      prisma.gameLog.findMany({
        where: {
          playerId: player.id,
          season,
          gameType: 'regular',
        },
        select: {
          gameDate: true,
          opponentTeam: true,
          isHome: true,
          goals: true,
          assists: true,
          points: true,
          shots: true,
          shotsOnGoal: true,
          hits: true,
          blocks: true,
          powerPlayPoints: true,
          plusMinus: true,
          pim: true,
          timeOnIce: true,
          timeOnIceSeconds: true,
          wins: true,
          saves: true,
          shotsAgainst: true,
          goalsAgainst: true,
          savePct: true,
          shutouts: true,
        },
        orderBy: { gameDate: 'desc' },
        take: gameLogsLimit,
      }),
    ]);

    // Calculate per-game averages from current stats
    const gamesPlayed = currentStats?.gamesPlayed || 0;
    const perGameStats = gamesPlayed > 0 ? {
      goals: (currentStats?.goals || 0) / gamesPlayed,
      assists: (currentStats?.assists || 0) / gamesPlayed,
      points: (currentStats?.points || 0) / gamesPlayed,
      shots: (currentStats?.shots || 0) / gamesPlayed,
      shotsOnGoal: (currentStats?.shotsOnGoal || 0) / gamesPlayed,
      hits: (currentStats?.hits || 0) / gamesPlayed,
      blocks: (currentStats?.blockedShots || 0) / gamesPlayed,
      powerPlayPoints: (currentStats?.powerPlayPoints || 0) / gamesPlayed,
      plusMinus: (currentStats?.plusMinus || 0) / gamesPlayed,
      pim: (currentStats?.pim || 0) / gamesPlayed,
      timeOnIceSeconds: 0, // PlayerStats doesn't store this, use timeOnIce string if needed
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
        blocks: currentStats.blockedShots,
        powerPlayPoints: currentStats.powerPlayPoints,
        plusMinus: currentStats.plusMinus,
        pim: currentStats.pim,
        timeOnIceSeconds: 0, // Not stored in PlayerStats, frontend can calculate if needed
        wins: currentStats.wins,
        saves: currentStats.saves,
        shotsAgainst: currentStats.shotsAgainst,
        goalsAgainst: currentStats.goalsAgainst,
        savePct: currentStats.savePct,
        shutouts: currentStats.shutouts,
        updatedAt: currentStats.updatedAt,
      } : null,
      perGameStats,
      projection: projection,
      projectionConfidence,
      gameLogs,
    }, {
      // Cache headers for better performance
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error: any) {
    console.error('Error fetching player details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch player details' },
      { status: 500 }
    );
  }
}

