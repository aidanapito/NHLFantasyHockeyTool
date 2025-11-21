import { NextRequest, NextResponse } from 'next/server';
import { analyzeWeeklyMatchup, analyzeMatchupForMultipleWeeks, type TeamReference } from '@/lib/matchup-analyzer';

function normalizeTeamReference(input: any, fallbackId?: string): TeamReference {
  if (!input && fallbackId) {
    return { id: fallbackId }
  }

  if (!input) {
    throw new Error('Team reference is required')
  }

  if (typeof input === 'string') {
    return { id: input }
  }

  const ref: TeamReference = {
    id: input.id ?? input.teamId ?? input.platformTeamId ?? fallbackId,
  }

  if (!ref.id) {
    throw new Error('Team id is required')
  }

  if (typeof input.source === 'string') {
    ref.source = input.source
  }
  if (typeof input.leagueId === 'string') {
    ref.leagueId = input.leagueId
  }
  if (typeof input.season === 'string') {
    ref.season = input.season
  }
  if (typeof input.platformTeamId === 'string') {
    ref.platformTeamId = input.platformTeamId
  }

  return ref
}

function parseWeekStart(dateStr: string | null | undefined): Date | undefined {
  if (!dateStr) return undefined
  const parts = dateStr.split('-').map(part => Number(part))
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error('Invalid weekStartDate format. Use YYYY-MM-DD')
  }
  const [year, month, day] = parts
  return new Date(year, month - 1, day, 12) // noon local time to avoid TZ rollbacks
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const team1Id = searchParams.get('team1Id');
    const team2Id = searchParams.get('team2Id');
    const weekStartDateParam = searchParams.get('weekStartDate');
    const weeksParam = searchParams.get('weeks');

    if (!team1Id || !team2Id) {
      return NextResponse.json(
        { error: 'team1Id and team2Id are required' },
        { status: 400 }
      );
    }

    // Parse week start date if provided
    let weekStartDate: Date | undefined
    if (weekStartDateParam) {
      try {
        weekStartDate = parseWeekStart(weekStartDateParam)
      } catch (err: any) {
        return NextResponse.json(
          { error: err.message },
          { status: 400 }
        )
      }
    }

    // If weeks parameter is provided, return multi-week analysis
    if (weeksParam) {
      const numberOfWeeks = parseInt(weeksParam, 10);
      if (isNaN(numberOfWeeks) || numberOfWeeks < 1 || numberOfWeeks > 12) {
        return NextResponse.json(
          { error: 'weeks must be a number between 1 and 12' },
          { status: 400 }
        );
      }

      const analysis = await analyzeMatchupForMultipleWeeks(
        team1Id,
        team2Id,
        numberOfWeeks,
        weekStartDate
      );

      return NextResponse.json({
        success: true,
        data: analysis,
      });
    }

    // Single week analysis
    const analysis = await analyzeWeeklyMatchup(
      team1Id,
      team2Id,
      weekStartDate
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
        message: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/matchup/analyze
 * 
 * Alternative endpoint for POST requests with body
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { team1, team2, team1Id, team2Id, weekStartDate, weeks } = body;

    const team1Payload = team1 ?? team1Id;
    const team2Payload = team2 ?? team2Id;

    if (!team1Payload || !team2Payload) {
      return NextResponse.json(
        { error: 'Team references are required' },
        { status: 400 }
      );
    }

    // Parse week start date if provided
    let weekStartDateParsed: Date | undefined
    if (weekStartDate) {
      try {
        weekStartDateParsed = parseWeekStart(weekStartDate)
      } catch (err: any) {
        return NextResponse.json(
          { error: err.message },
          { status: 400 }
        )
      }
    }

    // If weeks parameter is provided, return multi-week analysis
    if (weeks) {
      const numberOfWeeks = typeof weeks === 'number' ? weeks : parseInt(weeks, 10);
      if (isNaN(numberOfWeeks) || numberOfWeeks < 1 || numberOfWeeks > 12) {
        return NextResponse.json(
          { error: 'weeks must be a number between 1 and 12' },
          { status: 400 }
        );
      }

    const analysis = await analyzeMatchupForMultipleWeeks(
        normalizeTeamReference(team1Payload, team1Id),
        normalizeTeamReference(team2Payload, team2Id),
        numberOfWeeks,
        weekStartDateParsed
      );

      return NextResponse.json({
        success: true,
        data: analysis,
      });
    }

    // Single week analysis
    const analysis = await analyzeWeeklyMatchup(
      normalizeTeamReference(team1Payload, team1Id),
      normalizeTeamReference(team2Payload, team2Id),
      weekStartDateParsed
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
        message: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}

