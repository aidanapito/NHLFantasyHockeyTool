import { NextRequest, NextResponse } from 'next/server';
import { 
  fetchScheduleForWeek, 
  getTeamGamesForWeek,
  getWeekStart,
  formatDate 
} from '@/lib/nhl-api-service';

export const dynamic = 'force-dynamic';

/**
 * Test endpoint to verify schedule fetching
 * 
 * Query params:
 * - team: Optional team abbreviation (e.g., "TOR", "EDM")
 * - weekStart: Optional date string (YYYY-MM-DD), defaults to current week
 * - future: If "true", test with next week's date
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamAbbrev = searchParams.get('team');
    const weekStartParam = searchParams.get('weekStart');
    const testFuture = searchParams.get('future') === 'true';

    // Determine test date
    let testDate: Date | undefined;
    if (weekStartParam) {
      testDate = new Date(weekStartParam);
    } else if (testFuture) {
      // Next week
      const today = new Date();
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);
      testDate = nextWeek;
    } else {
      // Current week
      testDate = undefined;
    }

    const weekStart = getWeekStart(testDate);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    console.log(`[Schedule Test] Fetching schedule for week: ${formatDate(weekStart)} to ${formatDate(weekEnd)}`);

    // Fetch all games for the week
    const allGames = await fetchScheduleForWeek(testDate);
    console.log(`[Schedule Test] Found ${allGames.length} total games`);

    // If team specified, filter for that team
    let teamGames: typeof allGames = [];
    if (teamAbbrev) {
      teamGames = await getTeamGamesForWeek(teamAbbrev, testDate);
      console.log(`[Schedule Test] Found ${teamGames.length} games for team ${teamAbbrev}`);
    }

    // Sample a few games to show structure
    const sampleGames = (teamGames.length > 0 ? teamGames : allGames).slice(0, 5).map(game => ({
      id: game.id,
      gameDate: game.gameDate,
      homeTeam: game.homeTeam.abbrev,
      awayTeam: game.awayTeam.abbrev,
      gameState: game.gameState,
    }));

    return NextResponse.json({
      success: true,
      testDate: testDate ? formatDate(testDate) : 'current week',
      weekStart: formatDate(weekStart),
      weekEnd: formatDate(weekEnd),
      totalGames: allGames.length,
      teamFilter: teamAbbrev || null,
      teamGames: teamAbbrev ? teamGames.length : null,
      sampleGames,
      allGames: teamGames.length > 0 ? teamGames.map(g => ({
        id: g.id,
        date: g.gameDate,
        home: g.homeTeam.abbrev,
        away: g.awayTeam.abbrev,
      })) : allGames.map(g => ({
        id: g.id,
        date: g.gameDate,
        home: g.homeTeam.abbrev,
        away: g.awayTeam.abbrev,
      })),
    });
  } catch (error: any) {
    console.error('Error testing schedule:', error);
    return NextResponse.json(
      { 
        error: 'Failed to test schedule', 
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

