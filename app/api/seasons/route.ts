import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/seasons
 * 
 * Returns list of available seasons from the database
 */
export async function GET(request: NextRequest) {
  try {
    // Get distinct seasons from PlayerStats that have actual player data
    // Only include seasons where players have played at least 1 game
    const seasons = await prisma.playerStats.findMany({
      where: {
        gamesPlayed: {
          gt: 0, // Only seasons with players who have played games
        },
      },
      select: {
        season: true,
      },
      distinct: ['season'],
      orderBy: {
        season: 'desc', // Most recent first
      },
    });

    const seasonList = seasons.map(s => s.season);

    // If no seasons in database, return current season as default
    if (seasonList.length === 0) {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      let currentSeason: string;
      if (month < 9) {
        const prevYear = year - 1;
        currentSeason = `${prevYear}${year}`;
      } else {
        const nextYear = year + 1;
        currentSeason = `${year}${nextYear}`;
      }
      return NextResponse.json({
        success: true,
        seasons: [currentSeason],
      });
    }

    return NextResponse.json({
      success: true,
      seasons: seasonList,
    });

  } catch (error: any) {
    console.error('Error fetching seasons:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to fetch seasons',
        error: error.message,
      },
      { status: 500 }
    );
  }
}

