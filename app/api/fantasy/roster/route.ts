import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const teamId = searchParams.get('teamId');
    
    if (!teamId) {
      return NextResponse.json(
        { error: 'teamId parameter is required' },
        { status: 400 }
      );
    }
    
    const roster = await prisma.fantasyRoster.findMany({
      where: {
        fantasyTeamId: parseInt(teamId),
      },
      include: {
        player: {
          include: {
            stats: true,
          },
        },
      },
    });
    
    return NextResponse.json({ roster });
  } catch (error: any) {
    console.error('Error fetching roster:', error);
    return NextResponse.json(
      { error: 'Failed to fetch roster' },
      { status: 500 }
    );
  }
}

