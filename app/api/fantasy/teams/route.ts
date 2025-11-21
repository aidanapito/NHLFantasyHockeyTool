import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const leagueId = searchParams.get('leagueId');
    
    if (leagueId) {
      const teams = await prisma.fantasyTeam.findMany({
        where: {
          fantasyLeagueId: parseInt(leagueId),
        },
        include: {
          rosters: {
            include: {
              player: true,
            },
          },
        },
      });
      
      return NextResponse.json({ teams });
    }
    
    // Get all teams
    const teams = await prisma.fantasyTeam.findMany({
      include: {
        rosters: {
          include: {
            player: true,
          },
        },
      },
    });
    
    return NextResponse.json({ teams });
  } catch (error: any) {
    console.error('Error fetching teams:', error);
    return NextResponse.json(
      { error: 'Failed to fetch teams' },
      { status: 500 }
    );
  }
}

