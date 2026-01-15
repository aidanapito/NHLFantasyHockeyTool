import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { analyzeWeeklyMatchup, analyzeWeeklyMatchupWithProjections, type TeamReference } from '@/lib/matchup-analyzer';

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
    const { team1, team2, weekStartDate, leagueId, season, projections } = body;

    if (!team1 || !team2) {
      return NextResponse.json(
        { error: 'team1 and team2 are required' },
        { status: 400 }
      );
    }

    // Parse week start date if provided
    // IMPORTANT: Parse YYYY-MM-DD as local date, not UTC
    // new Date("2025-01-13") creates UTC midnight, which is the previous day in local time!
    let weekStart: Date | undefined;
    if (weekStartDate) {
      const [year, month, day] = weekStartDate.split('-').map(Number);
      weekStart = new Date(year, month - 1, day, 12, 0, 0); // Use noon to avoid timezone edge cases
    }
    console.log(`[Matchup API] Received weekStartDate: ${weekStartDate}, parsed as local date: ${weekStart?.toISOString()} (day of week: ${weekStart?.getDay()})`);

    // Fetch ESPN standings data if leagueId is provided
    let standingsData: any[] = []
    if (leagueId) {
      const params = new URLSearchParams({ leagueId })
      if (season) {
        params.set('season', season)
      }
      try {
        const url = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/fantasy/espn-standings?${params.toString()}`
        console.log(`[Matchup API] Fetching standings from: ${url}`)
        const response = await fetch(url, { cache: 'no-store' })
        if (response.ok) {
          const data = await response.json()
          standingsData = data.standings || data.results || []
          console.log(`[Matchup API] Fetched ${standingsData.length} standings entries`)
          if (standingsData.length > 0) {
            console.log(`[Matchup API] Sample standings:`, standingsData.slice(0, 2).map((s: any) => ({
              id: s.id, teamId: s.teamId, teamName: s.teamName, FOW: s.FOW, G: s.G
            })))
          }
        } else {
          console.error(`[Matchup API] Standings fetch failed: ${response.status}`)
        }
      } catch (err) {
        console.error('[Matchup API] Error fetching standings:', err)
      }
    } else {
      console.log('[Matchup API] No leagueId provided, skipping standings fetch')
    }

    // Analyze the matchup (with or without projections)
    const useProjections = projections === true || projections === 'true';
    const analysis = useProjections
      ? await analyzeWeeklyMatchupWithProjections(
          team1 as TeamReference,
          team2 as TeamReference,
          weekStart,
          standingsData
        )
      : await analyzeWeeklyMatchup(
          team1 as TeamReference,
          team2 as TeamReference,
          weekStart,
          standingsData
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

