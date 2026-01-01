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
    
    // First, get the player's database ID from NHL ID (if NHL ID provided)
    // Otherwise, assume playerId is already a database ID
    let databasePlayerId: number;
    
    // Check if playerId looks like an NHL ID (typically > 1000000) or database ID
    const inputId = parseInt(playerId);
    if (inputId > 1000000) {
      // Likely an NHL ID, convert to database ID
      const player = await prisma.player.findUnique({
        where: { nhlId: inputId },
        select: { id: true },
      });
      if (!player) {
        return NextResponse.json(
          { error: 'Player not found' },
          { status: 404 }
        );
      }
      databasePlayerId = player.id;
    } else {
      // Assume it's a database ID
      databasePlayerId = inputId;
    }
    
    // Get game logs for the player using database ID
    const gameLogs = await prisma.gameLog.findMany({
      where: {
        playerId: databasePlayerId,
        season,
      },
      orderBy: {
        gameDate: 'asc',
      },
      include: {
        player: {
          select: {
            id: true,
            nhlId: true,
            fullName: true,
          },
        },
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

