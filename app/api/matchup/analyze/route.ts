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

/**
 * Fetch ESPN standings data for a league
 */
async function fetchStandingsData(leagueId?: string, season?: string): Promise<any[]> {
  if (!leagueId) {
    console.log('[Matchup API] No leagueId provided, skipping standings fetch')
    return []
  }
  
  try {
    const params = new URLSearchParams({ leagueId })
    if (season) {
      params.set('season', season)
    }
    const url = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/fantasy/espn-standings?${params.toString()}`
    console.log(`[Matchup API] Fetching ESPN standings from: ${url}`)
    
    const response = await fetch(url, {
      cache: 'no-store',
    })
    
    console.log(`[Matchup API] ESPN standings response status: ${response.status}`)
    
    if (response.ok) {
      const data = await response.json()
      const standings = data.standings || data.results || []
      console.log(`[Matchup API] Successfully fetched ${standings.length} teams from ESPN standings`)
      if (standings.length > 0) {
        console.log(`[Matchup API] Sample team: ${standings[0].teamName}`, {
          hasG: 'G' in standings[0],
          G: standings[0].G,
          A: standings[0].A,
          SOG: standings[0].SOG,
        })
      }
      return standings
    } else {
      const errorData = await response.json().catch(() => ({}))
      console.error(`[Matchup API] ESPN standings API returned ${response.status}:`, errorData)
    }
  } catch (error: any) {
    console.error('[Matchup API] Error fetching standings:', error.message || error)
  }
  
  return []
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { team1, team2, weekStartDate, leagueId, season } = body;

    if (!team1 || !team2) {
      return NextResponse.json(
        { error: 'team1 and team2 are required' },
        { status: 400 }
      );
    }

    // Parse week start date if provided
    const weekStart = weekStartDate ? new Date(weekStartDate) : undefined;

    // Fetch ESPN standings data if leagueId is provided (primary source for season stats)
    let standingsData: any[] = []
    if (leagueId) {
      standingsData = await fetchStandingsData(leagueId, season)
      console.log(`[Matchup API] Fetched ${standingsData.length} teams from ESPN standings`)
    }

    // Analyze the matchup
    const analysis = await analyzeWeeklyMatchup(
      team1 as TeamReference,
      team2 as TeamReference,
      weekStart,
      standingsData // Pass standings data to analyzer
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

