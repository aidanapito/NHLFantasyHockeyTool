import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/players/stats
 * 
 * Fetches player stats from the database (fast, cached data)
 * Query params:
 *   - type: 'skaters' | 'goalies' | 'combined' (default: 'combined')
 *   - season: Season ID like "20252026" (default: current season)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'combined';
    const season = searchParams.get('season') || '20252026'; // Default to current season
    
    // Query database for players with stats
    // Optimized: Only select fields we need, use select instead of include for better performance
    const players = await prisma.player.findMany({
      where: {
        isActive: true,
        stats: {
          some: {
            season: season,
            gameType: 'regular',
          },
        },
      },
      select: {
        id: true,
        nhlId: true,
        firstName: true,
        lastName: true,
        fullName: true,
        position: true,
        team: true,
        stats: {
          where: {
            season: season,
            gameType: 'regular',
          },
          take: 1,
          select: {
            gamesPlayed: true,
            goals: true,
            assists: true,
            points: true,
            plusMinus: true,
            pim: true,
            shots: true,
            shotsOnGoal: true,
            shootingPct: true,
            powerPlayGoals: true,
            powerPlayPoints: true,
            evGoals: true,
            evPoints: true,
            shGoals: true,
            shPoints: true,
            hits: true,
            blockedShots: true,
            takeaways: true,
            giveaways: true,
            totalFaceoffs: true,
            faceoffsWon: true,
            faceoffsLost: true,
            faceoffPct: true,
            timeOnIce: true,
            timeOnIcePerGame: true,
            wins: true,
            losses: true,
            otLosses: true,
            saves: true,
            shotsAgainst: true,
            goalsAgainst: true,
            savePct: true,
            gaa: true,
            shutouts: true,
          },
        },
      },
    });

    // Transform data to match the format expected by StatsDisplay component
    const transformedPlayers: any[] = [];
    
    for (const player of players) {
      const stats = player.stats[0];
      if (!stats) continue;

      // Check if this is a goalie
      const isGoalie = player.position === 'G';
      
      // Filter by type
      if (type === 'skaters' && isGoalie) continue;
      if (type === 'goalies' && !isGoalie) continue;

      if (isGoalie) {
        // Format goalie data
        transformedPlayers.push({
          playerId: player.nhlId,
          name: player.fullName,
          position: player.position,
          team: player.team || '',
          gamesPlayed: stats.gamesPlayed,
          
          // Goalie stats
          wins: stats.wins || 0,
          losses: stats.losses || 0,
          otLosses: stats.otLosses || 0,
          saves: stats.saves || 0,
          shotsAgainst: stats.shotsAgainst || 0,
          goalsAgainst: stats.goalsAgainst || 0,
          savePct: stats.savePct || 0,
          goalsAgainstAverage: stats.gaa || 0,
          shutouts: stats.shutouts || 0,
        });
      } else {
        // Format skater data (combined stats)
        const ppPoints = stats.powerPlayPoints || 0;
        const faceoffPct = stats.faceoffPct;
        
        transformedPlayers.push({
          playerId: player.nhlId,
          name: player.fullName,
          position: player.position,
          team: player.team || '',
          gamesPlayed: stats.gamesPlayed,
          
          // Scoring
          goals: stats.goals,
          assists: stats.assists,
          points: stats.points,
          pointsPerGame: stats.gamesPlayed > 0 
            ? parseFloat((stats.points / stats.gamesPlayed).toFixed(2)) 
            : 0,
          
          // Advanced scoring
          ppGoals: stats.powerPlayGoals || 0,
          ppPoints: ppPoints,
          evGoals: stats.evGoals || 0,
          evPoints: stats.evPoints || 0,
          shGoals: stats.shGoals || 0,
          shPoints: stats.shPoints || 0,
          
          // Shooting
          shots: stats.shots,
          shotsPerGame: stats.gamesPlayed > 0 
            ? parseFloat((stats.shots / stats.gamesPlayed).toFixed(2)) 
            : 0,
          shootingPct: stats.shootingPct,
          
          // Physical
          hits: stats.hits || 0,
          blockedShots: stats.blockedShots || 0,
          giveaways: stats.giveaways || 0,
          takeaways: stats.takeaways || 0,
          
          // Other
          plusMinus: stats.plusMinus,
          penaltyMinutes: stats.pim,
          timeOnIcePerGame: stats.timeOnIcePerGame || stats.timeOnIce || '',
          
          // Faceoffs
          totalFaceoffs: stats.totalFaceoffs || 0,
          faceoffsWon: stats.faceoffsWon || 0,
          faceoffPct: faceoffPct,
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: transformedPlayers,
      count: transformedPlayers.length,
      season: season,
      type: type,
    });

  } catch (error: any) {
    console.error('Error fetching player stats from database:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to fetch player stats',
        error: error.message,
      },
      { status: 500 }
    );
  }
}

