import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const teamId1 = searchParams.get('teamId1');
    const teamId2 = searchParams.get('teamId2');
    
    if (!teamId1 || !teamId2) {
      return NextResponse.json(
        { error: 'teamId1 and teamId2 parameters are required' },
        { status: 400 }
      );
    }
    
    // Get team rosters and stats
    const team1 = await prisma.fantasyTeam.findUnique({
      where: { id: parseInt(teamId1) },
      include: {
        rosters: {
          include: {
            player: {
              include: {
                stats: true,
              },
          },
        },
      },
    });
    
    const team2 = await prisma.fantasyTeam.findUnique({
      where: { id: parseInt(teamId2) },
      include: {
        rosters: {
          include: {
            player: {
              include: {
                stats: true,
              },
          },
        },
      },
    });
    
    if (!team1 || !team2) {
      return NextResponse.json(
        { error: 'One or both teams not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      team1: {
        id: team1.id,
        name: team1.name,
        roster: team1.rosters,
      },
      team2: {
        id: team2.id,
        name: team2.name,
        roster: team2.rosters,
      },
    });
  } catch (error: any) {
    console.error('Error analyzing matchup:', error);
    return NextResponse.json(
      { error: 'Failed to analyze matchup' },
      { status: 500 }
    );
  }
}

