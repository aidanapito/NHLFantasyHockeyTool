/**
 * Test endpoint for NHL API data fetching
 * 
 * This endpoint tests the NHL API service without requiring a database.
 * Use this to verify that NHL data fetching is working correctly.
 * 
 * GET /api/test-nhl-api
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  fetchSkaterSummaryStats,
  fetchSkaterRealtimeStats,
  fetchFaceoffStats,
  fetchGoalieStats,
  fetchPlayerDetails,
  getCurrentSeason,
  type SkaterSummaryStats,
  type SkaterRealtimeStats,
} from '@/lib/nhl-api-service';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const testType = searchParams.get('type') || 'summary';
  const limit = parseInt(searchParams.get('limit') || '5');

  try {
    const season = getCurrentSeason();
    const results: any = {
      success: true,
      season,
      testType,
      timestamp: new Date().toISOString(),
    };

    switch (testType) {
      case 'summary':
        console.log(`[Test] Fetching skater summary stats...`);
        const skaterStats = await fetchSkaterSummaryStats(season);
        
        // Enrich with calculated stats
        const enrichedStats = skaterStats.map((player) => ({
          ...player,
          pointsPerGame: player.gamesPlayed > 0 ? parseFloat((player.points / player.gamesPlayed).toFixed(2)) : 0,
          goalsPerGame: player.gamesPlayed > 0 ? parseFloat((player.goals / player.gamesPlayed).toFixed(2)) : 0,
          shotsPerGame: player.gamesPlayed > 0 ? parseFloat((player.shots / player.gamesPlayed).toFixed(2)) : 0,
        }));
        
        // If limit is very large (like 10000), return all players
        const playersToReturn = limit >= 10000 ? enrichedStats : enrichedStats.slice(0, limit);
        
        results.data = {
          totalPlayers: skaterStats.length,
          samplePlayers: playersToReturn.map((player) => ({
            playerId: player.playerId,
            name: player.skaterFullName,
            position: player.positionCode,
            team: player.teamAbbrevs,
            gamesPlayed: player.gamesPlayed,
            goals: player.goals,
            assists: player.assists,
            points: player.points,
            plusMinus: player.plusMinus,
            shots: player.shots,
            shootingPct: player.shootingPct,
            penaltyMinutes: player.penaltyMinutes,
            ppGoals: player.ppGoals,
            ppPoints: player.ppPoints,
            evGoals: player.evGoals,
            evPoints: player.evPoints,
            timeOnIcePerGame: player.timeOnIcePerGame,
            faceoffPct: player.faceoffWinPct,
            // Calculated fields
            pointsPerGame: player.pointsPerGame,
            goalsPerGame: player.goalsPerGame,
            shotsPerGame: player.shotsPerGame,
          })),
        };
        break;

      case 'realtime':
        console.log(`[Test] Fetching skater realtime stats (first ${limit} players)...`);
        const realtimeStats = await fetchSkaterRealtimeStats(season);
        results.data = {
          totalPlayers: realtimeStats.length,
          samplePlayers: realtimeStats.slice(0, limit).map((player) => ({
            playerId: player.playerId,
            hits: player.hits,
            blockedShots: player.blockedShots,
            giveaways: player.giveaways,
            takeaways: player.takeaways,
            plusMinus: player.takeaways - player.giveaways, // Net takeaways
          })),
        };
        break;

      case 'faceoffs':
        console.log(`[Test] Fetching faceoff stats (first ${limit} players)...`);
        const faceoffStats = await fetchFaceoffStats(season);
        results.data = {
          totalPlayers: faceoffStats.length,
          samplePlayers: faceoffStats.slice(0, limit).map((player) => ({
            playerId: player.playerId,
            totalFaceoffs: player.totalFaceoffs,
            faceoffsWon: player.totalFaceoffWins,
            faceoffsLost: player.totalFaceoffLosses,
            faceoffPct: player.faceoffWinPct,
          })),
        };
        break;

      case 'combined':
        // Fetch and combine summary, realtime, and faceoff stats
        console.log(`[Test] Fetching combined stats (first ${limit} players)...`);
        const [summaryStats, realtimeStatsCombined, faceoffStatsCombined] = await Promise.all([
          fetchSkaterSummaryStats(season),
          fetchSkaterRealtimeStats(season),
          fetchFaceoffStats(season),
        ]);

        // Create maps for quick lookup
        const realtimeMap = new Map<number, SkaterRealtimeStats>();
        realtimeStatsCombined.forEach(stat => {
          realtimeMap.set(stat.playerId, stat);
        });

        const faceoffMap = new Map<number, any>();
        faceoffStatsCombined.forEach(stat => {
          faceoffMap.set(stat.playerId, stat);
        });

        // If limit is very large (like 10000), return all players
        const playersToCombine = limit >= 10000 ? summaryStats : summaryStats.slice(0, limit);
        
        // Combine stats
        const combinedStats = playersToCombine.map((player) => {
          const realtime = realtimeMap.get(player.playerId);
          const faceoff = faceoffMap.get(player.playerId);
          
          return {
            // Basic info
            playerId: player.playerId,
            name: player.skaterFullName,
            position: player.positionCode,
            team: player.teamAbbrevs,
            gamesPlayed: player.gamesPlayed,
            
            // Scoring
            goals: player.goals,
            assists: player.assists,
            points: player.points,
            pointsPerGame: player.gamesPlayed > 0 ? parseFloat((player.points / player.gamesPlayed).toFixed(2)) : 0,
            
            // Advanced scoring
            ppGoals: player.ppGoals,
            ppPoints: player.ppPoints,
            evGoals: player.evGoals,
            evPoints: player.evPoints,
            shGoals: player.shGoals,
            shPoints: player.shPoints,
            
            // Shooting
            shots: player.shots,
            shotsPerGame: player.gamesPlayed > 0 ? parseFloat((player.shots / player.gamesPlayed).toFixed(2)) : 0,
            shootingPct: player.shootingPct,
            
            // Physical
            hits: realtime?.hits || 0,
            blockedShots: realtime?.blockedShots || 0,
            giveaways: realtime?.giveaways || 0,
            takeaways: realtime?.takeaways || 0,
            
            // Other
            plusMinus: player.plusMinus,
            penaltyMinutes: player.penaltyMinutes,
            timeOnIcePerGame: player.timeOnIcePerGame,
            
            // Faceoffs
            totalFaceoffs: faceoff?.totalFaceoffs || 0,
            faceoffsWon: faceoff?.totalFaceoffWins || 0,
            faceoffPct: faceoff?.faceoffWinPct || player.faceoffWinPct,
          };
        });

        results.data = {
          totalPlayers: summaryStats.length,
          samplePlayers: combinedStats,
        };
        break;

      case 'goalies':
        console.log(`[Test] Fetching goalie stats...`);
        const goalieStats = await fetchGoalieStats(season);
        // If limit is very large (like 10000), return all goalies
        const goaliesToReturn = limit >= 10000 ? goalieStats : goalieStats.slice(0, limit);
        results.data = {
          totalGoalies: goalieStats.length,
          sampleGoalies: goaliesToReturn.map((goalie) => ({
            playerId: goalie.playerId,
            name: goalie.goalieFullName,
            team: goalie.teamAbbrevs,
            gamesPlayed: goalie.gamesPlayed,
            wins: goalie.wins,
            losses: goalie.losses,
            savePct: goalie.savePct,
            gaa: goalie.goalsAgainstAverage,
            shutouts: goalie.shutouts,
          })),
        };
        break;

      case 'player':
        const playerId = searchParams.get('playerId') || '8471214'; // Default: Connor McDavid
        console.log(`[Test] Fetching player details for ID: ${playerId}...`);
        
        try {
          const playerDetails = await fetchPlayerDetails(parseInt(playerId));
          results.data = {
            playerId: parseInt(playerId),
            details: {
              name: playerDetails?.player?.firstName?.default 
                ? `${playerDetails.player.firstName.default} ${playerDetails.player.lastName?.default || ''}`
                : 'Unknown',
              position: playerDetails?.player?.position || 'N/A',
              team: playerDetails?.player?.currentTeam?.abbrev || 'N/A',
              jerseyNumber: playerDetails?.player?.sweaterNumber || 'N/A',
              height: playerDetails?.player?.heightInInches 
                ? `${Math.floor(playerDetails.player.heightInInches / 12)}'${playerDetails.player.heightInInches % 12}"`
                : 'N/A',
              weight: playerDetails?.player?.weightInPounds || 'N/A',
              birthDate: playerDetails?.player?.birthDate || 'N/A',
              headshot: playerDetails?.player?.headshot || 'N/A',
            },
            rawData: playerDetails, // Include raw data for inspection
          };
        } catch (error: any) {
          results.error = `Failed to fetch player details: ${error.message}`;
          results.success = false;
        }
        break;

      case 'all':
        // Test all endpoints with a quick sample
        console.log(`[Test] Running comprehensive test...`);
        const [skaters, realtime, faceoffs, goalies] = await Promise.all([
          fetchSkaterSummaryStats(season).then(s => s.slice(0, 3)),
          fetchSkaterRealtimeStats(season).then(r => r.slice(0, 3)),
          fetchFaceoffStats(season).then(f => f.slice(0, 3)),
          fetchGoalieStats(season).then(g => g.slice(0, 2)),
        ]);

        results.data = {
          skaters: {
            count: skaters.length,
            sample: skaters.map(s => ({
              id: s.playerId,
              name: s.skaterFullName,
              points: s.points,
            })),
          },
          realtime: {
            count: realtime.length,
            sample: realtime.map(r => ({
              id: r.playerId,
              hits: r.hits,
              blocks: r.blockedShots,
            })),
          },
          faceoffs: {
            count: faceoffs.length,
            sample: faceoffs.map(f => ({
              id: f.playerId,
              faceoffPct: f.faceoffWinPct,
            })),
          },
          goalies: {
            count: goalies.length,
            sample: goalies.map(g => ({
              id: g.playerId,
              name: g.goalieFullName,
              wins: g.wins,
            })),
          },
        };
        break;

      default:
        return NextResponse.json(
          {
            success: false,
            error: `Invalid test type: ${testType}`,
            availableTypes: ['summary', 'realtime', 'faceoffs', 'goalies', 'player', 'combined', 'all'],
          },
          { status: 400 }
        );
    }

    return NextResponse.json(results);
  } catch (error: any) {
    console.error('[Test] Error testing NHL API:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

