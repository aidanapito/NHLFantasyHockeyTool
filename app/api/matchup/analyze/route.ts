import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { analyzeWeeklyMatchup, type TeamReference } from '@/lib/matchup-analyzer';

export const dynamic = 'force-dynamic';

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
      where: { id: teamId1 },
      include: {
        roster: {
          include: {
            player: {
              include: {
                stats: true,
              },
            },
          },
        },
      },
    });
    
    const team2 = await prisma.fantasyTeam.findUnique({
      where: { id: teamId2 },
      include: {
        roster: {
          include: {
            player: {
              include: {
                stats: true,
              },
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
        name: team1.teamName,
        roster: team1.roster,
      },
      team2: {
        id: team2.id,
        name: team2.teamName,
        roster: team2.roster,
      },
    });
  } catch (error: any) {
    console.error('Error analyzing matchup:', error);
    return NextResponse.json(
      { error: 'Failed to analyze matchup', message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { team1, team2, weekStartDate } = body;

    if (!team1 || !team2) {
      return NextResponse.json(
        { error: 'team1 and team2 are required' },
        { status: 400 }
      );
    }

    // Parse week start date if provided
    const weekStart = weekStartDate ? new Date(weekStartDate) : undefined;

    // Analyze the matchup
    const analysis = await analyzeWeeklyMatchup(
      team1 as TeamReference,
      team2 as TeamReference,
      weekStart
    );

    return NextResponse.json({
      success: true,
      data: analysis,
    });
  } catch (error: any) {
    console.error('Error analyzing matchup:', error);
    return NextResponse.json(
      { 
        error: 'Failed to analyze matchup',
        message: error.message || 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}

