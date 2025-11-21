import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const playerId = searchParams.get('playerId');
    const season = searchParams.get('season') || '20252026';
    
    if (!playerId) {
      return NextResponse.json(
        { error: 'playerId parameter is required' },
        { status: 400 }
      );
    }
    
    // Get game logs for the player
    const gameLogs = await prisma.gameLog.findMany({
      where: {
        player: {
          nhlId: parseInt(playerId),
        },
        season,
      },
      orderBy: {
        gameDate: 'asc',
      },
    });
    
    return NextResponse.json({ gameLogs });
  } catch (error: any) {
    console.error('Error fetching player trends:', error);
    return NextResponse.json(
      { error: 'Failed to fetch player trends' },
      { status: 500 }
    );
  }
}

