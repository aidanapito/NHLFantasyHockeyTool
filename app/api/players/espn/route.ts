import { NextRequest, NextResponse } from 'next/server';

/**
 * ESPN Player API - Replaces NHL player API with ESPN Fantasy data
 * This provides real-time fantasy-relevant player stats from ESPN leagues
 */

interface ESPNPlayerStats {
  player_id: number;
  name: string;
  team: string;
  position: string;
  points: number;
  goals: number;
  assists: number;
  plus_minus: number;
  pim: number;
  power_play_points: number;
  shots_on_goal: number;
  hits: number;
  blocked_shots: number;
  faceoffs_won: number;
  // Goalie stats
  wins?: number;
  saves?: number;
  goals_against?: number;
  shutouts?: number;
  save_percentage?: number;
  gaa?: number;
}

interface ESPNLeagueInfo {
  league_id: number;
  year: number;
  current_week: number;
  num_teams: number;
  league_name: string;
}

// Default ESPN league configuration - you can change these
const DEFAULT_LEAGUE_ID = 91445140; // Your ESPN league ID
const DEFAULT_YEAR = 2025;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get('leagueId') || DEFAULT_LEAGUE_ID.toString();
    const year = searchParams.get('year') || DEFAULT_YEAR.toString();
    const position = searchParams.get('position');
    const team = searchParams.get('team');
    const limit = parseInt(searchParams.get('limit') || '50');
    const playerName = searchParams.get('playerName');
    const includeFreeAgents = searchParams.get('includeFreeAgents') === 'true';

    // First, get all players from ESPN league
    let players: ESPNPlayerStats[] = [];

    try {
      // Get players from league rosters
      const espnResponse = await fetch(
        `http://localhost:8000/api/espn/league/${leagueId}/${year}/players${playerName ? `?player_name=${encodeURIComponent(playerName)}` : ''}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (espnResponse.ok) {
        const espnData = await espnResponse.json();
        players = espnData.players || [];
      }

      // If free agents are requested, also get them
      if (includeFreeAgents) {
        const faResponse = await fetch(
          `http://localhost:8000/api/espn/league/${leagueId}/${year}/free-agents?limit=100`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        if (faResponse.ok) {
          const faData = await faResponse.json();
          players = players.concat(faData.free_agents || []);
        }
      }
    } catch (error) {
      console.error('Error fetching ESPN data:', error);
      // Return empty array if ESPN is not available
      return NextResponse.json([]);
    }

    // Apply filters
    let filteredPlayers = players;

    if (position) {
      filteredPlayers = filteredPlayers.filter(player => 
        player.position.toUpperCase() === position.toUpperCase()
      );
    }

    if (team) {
      filteredPlayers = filteredPlayers.filter(player => 
        player.team.toUpperCase() === team.toUpperCase()
      );
    }

    if (playerName) {
      const searchTerm = playerName.toLowerCase();
      filteredPlayers = filteredPlayers.filter(player => 
        player.name.toLowerCase().includes(searchTerm)
      );
    }

    // Sort by fantasy points (most relevant for fantasy)
    filteredPlayers.sort((a, b) => b.points - a.points);

    // Apply limit
    filteredPlayers = filteredPlayers.slice(0, limit);

    // Transform to match your existing player API format
    const transformedPlayers = filteredPlayers.map(player => ({
      id: player.player_id,
      firstName: player.name.split(' ')[0],
      lastName: player.name.split(' ').slice(1).join(' '),
      position: player.position,
      team: player.team,
      nhlId: player.player_id, // Use ESPN ID as fallback
      isActive: true,
      // Fantasy-relevant stats
      stats: [{
        season: year,
        gameType: 'regular',
        games: 1, // ESPN doesn't always provide games played
        goals: player.goals,
        assists: player.assists,
        points: player.points,
        plusMinus: player.plus_minus,
        pim: player.pim,
        powerPlayPoints: player.power_play_points,
        shotsOnGoal: player.shots_on_goal,
        hits: player.hits,
        blockedShots: player.blocked_shots,
        faceoffsWon: player.faceoffs_won,
        // Goalie stats
        wins: player.wins || 0,
        saves: player.saves || 0,
        goalsAgainst: player.goals_against || 0,
        shutouts: player.shutouts || 0,
        savePercentage: player.save_percentage || 0,
        gaa: player.gaa || 0,
      }],
      // ESPN-specific data
      espnData: {
        fantasyPoints: player.points,
        leagueId: parseInt(leagueId),
        year: parseInt(year),
        isFreeAgent: includeFreeAgents && players.length > 0,
      }
    }));

    return NextResponse.json(transformedPlayers);

  } catch (error) {
    console.error('Error in ESPN players API:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ESPN player data' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, leagueId, year, espnS2, swid } = body;

    switch (action) {
      case 'connect-league':
        return handleConnectLeague(leagueId, year, espnS2, swid);
      case 'get-league-info':
        return handleGetLeagueInfo(leagueId, year);
      case 'sync-players':
        return handleSyncPlayers(leagueId, year);
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error in ESPN players POST API:', error);
    return NextResponse.json(
      { error: 'Failed to process ESPN request' },
      { status: 500 }
    );
  }
}

async function handleConnectLeague(leagueId: number, year: number, espnS2?: string, swid?: string) {
  try {
    const response = await fetch('http://localhost:8000/api/espn/connect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        league_id: leagueId,
        year: year,
        espn_s2: espnS2,
        swid: swid,
        debug: false
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to connect to ESPN league');
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to connect to ESPN league: ${error}` },
      { status: 500 }
    );
  }
}

async function handleGetLeagueInfo(leagueId: number, year: number) {
  try {
    const response = await fetch(`http://localhost:8000/api/espn/league/${leagueId}/${year}/info`);
    
    if (!response.ok) {
      throw new Error('Failed to get league info');
    }

    const leagueInfo = await response.json();
    return NextResponse.json(leagueInfo);
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to get league info: ${error}` },
      { status: 500 }
    );
  }
}

async function handleSyncPlayers(leagueId: number, year: number) {
  try {
    const response = await fetch('http://localhost:8000/api/espn/sync-with-database', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        league_id: leagueId,
        year: year
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to sync players');
    }

    const syncResult = await response.json();
    return NextResponse.json(syncResult);
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to sync players: ${error}` },
      { status: 500 }
    );
  }
}
