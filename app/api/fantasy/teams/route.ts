import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const leagueId = searchParams.get('leagueId'); // This is the ESPN platform ID
    const season = searchParams.get('season');
    
    if (leagueId) {
      // First, find the FantasyLeague by platformId (ESPN league ID)
      const league = await prisma.fantasyLeague.findFirst({
        where: {
          platform: 'espn',
          platformId: leagueId,
          ...(season ? { season } : {}),
        },
      });

      if (!league) {
        return NextResponse.json(
          { error: 'League not found in database. Please refresh the league first.' },
          { status: 404 }
        );
      }

      // Now get teams using the database league ID
      const teams = await prisma.fantasyTeam.findMany({
        where: {
          leagueId: league.id, // Use the database ID, not platformId
        },
        include: {
          roster: {
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
        roster: {
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
      { error: 'Failed to fetch teams', message: error?.message },
      { status: 500 }
    );
  }
}

