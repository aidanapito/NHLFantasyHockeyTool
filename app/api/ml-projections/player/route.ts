import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const playerId = searchParams.get('playerId');
    
    if (!playerId) {
      return NextResponse.json(
        { error: 'playerId parameter is required' },
        { status: 400 }
      );
    }
    
    // Get player and generate ML projections
    const player = await prisma.player.findUnique({
      where: { nhlId: parseInt(playerId) },
      include: {
        stats: true,
        gameLogs: {
          take: 20,
          orderBy: { gameDate: 'desc' },
        },
      },
    });
    
    return NextResponse.json({
      player,
      projections: 'ML projections - coming soon',
    });
  } catch (error: any) {
    console.error('Error fetching ML projections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projections' },
      { status: 500 }
    );
  }
}

