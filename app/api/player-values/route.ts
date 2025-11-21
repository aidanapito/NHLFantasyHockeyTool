import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const season = searchParams.get('season') || '20252026';
    
    // Get players with their stats and calculate values
    const players = await prisma.player.findMany({
      where: {
        stats: {
          some: {
            season,
          },
        },
      },
      include: {
        stats: {
          where: {
            season,
          },
        },
      },
    });
    
    return NextResponse.json({
      players: players.map(p => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`,
        position: p.position,
        stats: p.stats[0],
        value: 0, // Calculate value based on stats
      })),
    });
  } catch (error: any) {
    console.error('Error fetching player values:', error);
    return NextResponse.json(
      { error: 'Failed to fetch player values' },
      { status: 500 }
    );
  }
}

