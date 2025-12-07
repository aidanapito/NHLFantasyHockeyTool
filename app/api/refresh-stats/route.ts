import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { prisma } from '@/lib/prisma';
import { ensurePlayerExists } from '@/lib/player-matcher';
import axios from 'axios';

const NHL_STATS_API_BASE = 'https://api.nhle.com/stats/rest/en';
const NHL_API_BASE = 'https://api-web.nhle.com/v1';

interface SummaryStats {
  playerId: number;
  skaterFullName: string;
  positionCode: string;
  teamAbbrevs: string;
  gamesPlayed: number;
  goals: number;
  assists: number;
  points: number;
  plusMinus: number;
  penaltyMinutes: number;
  ppGoals: number;
  ppPoints: number;
  shots: number;
  shootingPct: number;
  faceoffWinPct: number | null;
  timeOnIcePerGame: string;
  evGoals: number;
  evPoints: number;
  shGoals: number;
  shPoints: number;
}

interface RealtimeStats {
  playerId: number;
  blockedShots: number;
  hits: number;
  giveaways: number;
  takeaways: number;
}

interface FaceoffStats {
  playerId: number;
  totalFaceoffs: number;
  totalFaceoffWins: number;
  totalFaceoffLosses: number;
  faceoffWinPct: number;
}

interface GoalieStats {
  playerId: number;
  goalieFullName: string;
  positionCode: string;
  teamAbbrevs: string;
  gamesPlayed: number;
  gamesStarted: number;
  wins: number;
  losses: number;
  otLosses: number;
  shotsAgainst: number;
  saves: number;
  savePct: number;
  goalsAgainstAverage: number;
  shutouts: number;
}

async function fetchSkaterSummaryStats(season: string, retries = 2): Promise<SummaryStats[]> {
  const allStats: SummaryStats[] = [];
  let start = 0;
  const batchSize = 100;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`  ⏳ Retry attempt ${attempt}/${retries} for season ${season}...`);
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Exponential backoff
      }
      
      while (true) {
        const response = await axios.get(
          `${NHL_STATS_API_BASE}/skater/summary`,
          {
            params: {
              isAggregate: false,
              isGame: false,
              sort: '[{"property":"points","direction":"DESC"}]',
              start: start,
              limit: batchSize,
              factCayenneExp: 'gamesPlayed>=1',
              cayenneExp: `gameTypeId=2 and seasonId=${season}`
            },
            timeout: 30000, // 30 second timeout per request
          }
        );
        
        const data = response.data.data || [];
        if (data.length === 0) {
          if (start === 0) {
            console.warn(`⚠️  No data found for season ${season} - season may not exist or have no stats`);
          }
          break;
        }
        
        allStats.push(...data);
        start += batchSize;
        
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      console.log(`  ✓ Fetched ${allStats.length} skater summary stats for season ${season}`);
      return allStats;
    } catch (error: any) {
      const isTimeout = error.code === 'ECONNABORTED' || 
                       error.response?.status === 524 || 
                       error.message?.includes('timeout');
      
      if (isTimeout && attempt < retries) {
        console.warn(`  ⚠️  Timeout fetching season ${season}, will retry...`);
        start = 0; // Reset for retry
        allStats.length = 0; // Clear previous data
        continue;
      }
      
      console.error(`❌ Error fetching summary stats for season ${season}:`, error.message || error);
      if (error.response) {
        console.error(`  Response status: ${error.response.status}`);
        if (error.response.status === 524) {
          console.error(`  → Cloudflare timeout - season ${season} may be unavailable or too slow`);
        }
      }
      
      // If it's a timeout and we've exhausted retries, return empty array
      if (isTimeout) {
        return [];
      }
      
      return allStats; // Return what we have so far
    }
  }
  
  return allStats;
}

async function fetchSkaterRealtimeStats(season: string): Promise<RealtimeStats[]> {
  const allStats: RealtimeStats[] = [];
  let start = 0;
  const batchSize = 100;
  
  try {
    while (true) {
      const response = await axios.get(
        `${NHL_STATS_API_BASE}/skater/realtime`,
        {
          params: {
            isAggregate: false,
            isGame: false,
            sort: '[{"property":"hits","direction":"DESC"}]',
            start: start,
            limit: batchSize,
            factCayenneExp: 'gamesPlayed>=1',
            cayenneExp: `gameTypeId=2 and seasonId=${season}`
          }
        }
      );
      
      const data = response.data.data || [];
      if (data.length === 0) break;
      
      allStats.push(...data);
      start += batchSize;
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return allStats;
  } catch (error) {
    console.error(`Error fetching realtime stats for season ${season}:`, error);
    return allStats;
  }
}

async function fetchFaceoffStats(season: string): Promise<FaceoffStats[]> {
  const allStats: FaceoffStats[] = [];
  let start = 0;
  const batchSize = 100;
  
  try {
    while (true) {
      const response = await axios.get(
        `${NHL_STATS_API_BASE}/skater/faceoffwins`,
        {
          params: {
            isAggregate: false,
            isGame: false,
            sort: '[{"property":"totalFaceoffs","direction":"DESC"}]',
            start: start,
            limit: batchSize,
            factCayenneExp: 'gamesPlayed>=1',
            cayenneExp: `gameTypeId=2 and seasonId=${season}`
          }
        }
      );
      
      const data = response.data.data || [];
      if (data.length === 0) break;
      
      allStats.push(...data);
      start += batchSize;
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return allStats;
  } catch (error) {
    console.error(`Error fetching faceoff stats for season ${season}:`, error);
    return allStats;
  }
}

async function fetchGoalieStats(season: string): Promise<GoalieStats[]> {
  const allStats: GoalieStats[] = [];
  let start = 0;
  const batchSize = 100;
  
  try {
    while (true) {
      const response = await axios.get(
        `${NHL_STATS_API_BASE}/goalie/summary`,
        {
          params: {
            isAggregate: false,
            isGame: false,
            sort: '[{"property":"wins","direction":"DESC"}]',
            start: start,
            limit: batchSize,
            factCayenneExp: 'gamesPlayed>=1',
            cayenneExp: `gameTypeId=2 and seasonId=${season}`
          }
        }
      );
      
      const data = response.data.data || [];
      if (data.length === 0) break;
      
      allStats.push(...data);
      start += batchSize;
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return allStats;
  } catch (error) {
    console.error(`Error fetching goalie stats for season ${season}:`, error);
    return allStats;
  }
}

async function fetchPlayerDetails(playerId: number) {
  try {
    const response = await axios.get(`${NHL_API_BASE}/player/${playerId}/landing`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching details for player ${playerId}:`, error);
    return null;
  }
}

function convertHeightToFeetInches(heightInInches: number): string {
  const feet = Math.floor(heightInInches / 12);
  const inches = heightInInches % 12;
  return `${feet}'${inches}"`;
}

function getNationalityFromCountry(country: string): string {
  const nationalityMap: { [key: string]: string } = {
    'CAN': 'Canadian',
    'USA': 'American',
    'SWE': 'Swedish',
    'FIN': 'Finnish',
    'RUS': 'Russian',
    'CZE': 'Czech',
    'SVK': 'Slovak',
    'CHE': 'Swiss',
    'DEU': 'German',
    'DNK': 'Danish',
    'NOR': 'Norwegian',
    'LVA': 'Latvian',
    'SVN': 'Slovenian',
    'AUT': 'Austrian',
    'FRA': 'French',
    'BLR': 'Belarusian',
    'GBR': 'British',
  };
  return nationalityMap[country] || country;
}

/**
 * Get current season identifier
 * Format: YYYY(YY+1) e.g., 20252026 for 2025-26 season
 */
function getCurrentSeason(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11

  // NHL season typically starts in October (month 9)
  // If we're before October, we're in the previous season
  if (month < 9) {
    const prevYear = year - 1;
    return `${prevYear}${year}`;
  } else {
    const nextYear = year + 1;
    return `${year}${nextYear}`;
  }
}

/**
 * Process stats for a single season
 */
async function processSeason(season: string) {
  console.log(`\n📊 Processing ${season} season stats...`);

  // Fetch all stats for this season
  console.log(`  Fetching summary stats...`);
  const summaryStats = await fetchSkaterSummaryStats(season);
  console.log(`  Found ${summaryStats.length} skaters`);

  // Skip processing if no data found for this season
  if (summaryStats.length === 0) {
    console.log(`  ⚠️  Skipping season ${season} - no data available`);
    return {
      season,
      processedSkaters: 0,
      processedGoalies: 0,
      newPlayers: 0,
      errors: 0,
      skipped: true,
    };
  }

  console.log(`  Fetching realtime stats...`);
  const realtimeStats = await fetchSkaterRealtimeStats(season);
  console.log(`  Found realtime data for ${realtimeStats.length} skaters`);

  console.log(`  Fetching faceoff stats...`);
  const faceoffStats = await fetchFaceoffStats(season);
  console.log(`  Found faceoff data for ${faceoffStats.length} skaters`);

  console.log(`  Fetching goalie stats...`);
  const goalieStats = await fetchGoalieStats(season);
  console.log(`  Found ${goalieStats.length} goalies`);

  // Create maps for quick lookup
  const realtimeMap = new Map<number, RealtimeStats>();
  realtimeStats.forEach(stat => {
    realtimeMap.set(stat.playerId, stat);
  });

  const faceoffMap = new Map<number, FaceoffStats>();
  faceoffStats.forEach(stat => {
    faceoffMap.set(stat.playerId, stat);
  });

  // Process skaters
  let processedSkaters = 0;
  let processedGoalies = 0;
  let newPlayers = 0;
  let errors = 0;

  for (const skater of summaryStats) {
    try {
      // Try to fetch detailed player info, but don't fail if it doesn't work
      let playerDetails = null;
      try {
        playerDetails = await fetchPlayerDetails(skater.playerId);
      } catch (error) {
        console.log(`Could not fetch details for player ${skater.playerId}, using basic info`);
      }

      const player = playerDetails?.player || {};
      
      // Parse name from stats or player details
      const nameParts = (skater.skaterFullName || "").split(' ');
      const firstName = player.firstName?.default || nameParts[0] || "";
      const lastName = player.lastName?.default || nameParts.slice(1).join(' ') || skater.skaterFullName || "";
      const fullName = (player.firstName?.default && player.lastName?.default)
        ? `${player.firstName.default} ${player.lastName.default}`
        : (skater.skaterFullName || `${firstName} ${lastName}`).trim() || "Unknown Player";

      // Use player matcher to ensure player exists (matches by NHL ID or name)
      const playerResult = await ensurePlayerExists({
        nhlId: skater.playerId,
        fullName: fullName || skater.skaterFullName || "Unknown Player",
        firstName: firstName || "Unknown",
        lastName: lastName || "Player",
        position: skater.positionCode || "C",
        team: skater.teamAbbrevs?.split(',')[0] || null,
        jerseyNumber: player.sweaterNumber || null,
        height: player.heightInInches ? convertHeightToFeetInches(player.heightInInches) : null,
        weight: player.weightInPounds || null,
        birthDate: player.birthDate ? new Date(player.birthDate) : null,
        birthCity: player.birthCity?.default || null,
        birthCountry: player.birthCountry || null,
        nationality: player.birthCountry ? getNationalityFromCountry(player.birthCountry) : null,
        headshot: player.headshot || `https://assets.nhle.com/mugs/nhl/latest/${skater.playerId}.png`,
        isActive: true,
      });

      if (playerResult.created) {
        newPlayers++;
      }

      // Get the player record
      const dbPlayer = await prisma.player.findUnique({
        where: { id: playerResult.id },
      });

      // Verify we have a valid player record
      if (!dbPlayer || !dbPlayer.id) {
        console.error(`Invalid player record for skater ${skater.playerId}, skipping stats`);
        errors++;
        continue;
      }

      // Get realtime and faceoff stats for this player
      const realtime = realtimeMap.get(skater.playerId);
      const faceoff = faceoffMap.get(skater.playerId);

      // Create or update player stats
      try {
        await prisma.playerStats.upsert({
          where: {
            playerId_season_gameType: {
              playerId: dbPlayer.id,
              season: season,
              gameType: "regular",
            },
          },
          update: {
            gamesPlayed: skater.gamesPlayed,
            goals: skater.goals,
            assists: skater.assists,
            points: skater.points,
            plusMinus: skater.plusMinus,
            pim: skater.penaltyMinutes,
            powerPlayGoals: skater.ppGoals,
            powerPlayPoints: skater.ppPoints,
            shots: skater.shots,
            shotsOnGoal: skater.shots,
            shootingPct: skater.shootingPct !== null && skater.shootingPct !== undefined ? Number(skater.shootingPct) : null,
            evGoals: skater.evGoals,
            evPoints: skater.evPoints,
            shGoals: skater.shGoals,
            shPoints: skater.shPoints,
            timeOnIce: skater.timeOnIcePerGame ? String(skater.timeOnIcePerGame) : null,
            timeOnIcePerGame: skater.timeOnIcePerGame ? String(skater.timeOnIcePerGame) : null,
            faceoffPct: skater.faceoffWinPct !== null && skater.faceoffWinPct !== undefined ? Number(skater.faceoffWinPct) : null,
            totalFaceoffs: faceoff?.totalFaceoffs || 0,
            blockedShots: realtime?.blockedShots || 0,
            hits: realtime?.hits || 0,
            giveaways: realtime?.giveaways || 0,
            takeaways: realtime?.takeaways || 0,
            faceoffsWon: faceoff?.totalFaceoffWins || 0,
            faceoffsLost: faceoff?.totalFaceoffLosses || 0,
          },
          create: {
            playerId: dbPlayer.id,
            season: season,
            gameType: "regular",
            gamesPlayed: skater.gamesPlayed,
            goals: skater.goals,
            assists: skater.assists,
            points: skater.points,
            plusMinus: skater.plusMinus,
            pim: skater.penaltyMinutes,
            powerPlayGoals: skater.ppGoals,
            powerPlayPoints: skater.ppPoints,
            shots: skater.shots,
            shotsOnGoal: skater.shots,
            shootingPct: skater.shootingPct !== null && skater.shootingPct !== undefined ? Number(skater.shootingPct) : null,
            evGoals: skater.evGoals,
            evPoints: skater.evPoints,
            shGoals: skater.shGoals,
            shPoints: skater.shPoints,
            timeOnIce: skater.timeOnIcePerGame ? String(skater.timeOnIcePerGame) : null,
            timeOnIcePerGame: skater.timeOnIcePerGame ? String(skater.timeOnIcePerGame) : null,
            faceoffPct: skater.faceoffWinPct !== null && skater.faceoffWinPct !== undefined ? Number(skater.faceoffWinPct) : null,
            totalFaceoffs: faceoff?.totalFaceoffs || 0,
            blockedShots: realtime?.blockedShots || 0,
            hits: realtime?.hits || 0,
            giveaways: realtime?.giveaways || 0,
            takeaways: realtime?.takeaways || 0,
            faceoffsWon: faceoff?.totalFaceoffWins || 0,
            faceoffsLost: faceoff?.totalFaceoffLosses || 0,
          },
        });
      } catch (upsertError: any) {
        console.error(`  ❌ Database upsert error for player ${skater.playerId} season ${season}:`, upsertError.message);
        if (upsertError.message?.includes('Unique constraint')) {
          console.error(`    → Duplicate key - stats may already exist for this season`);
        }
        throw upsertError; // Re-throw to be caught by outer try-catch
      }

      processedSkaters++;
      if (processedSkaters % 100 === 0) {
        console.log(`  Processed ${processedSkaters} skaters so far...`);
      }
    } catch (e: any) {
      console.error(`Error processing skater ${skater.playerId} (${skater.skaterFullName}):`, e.message || e);
      if (process.env.NODE_ENV === 'development' && errors < 5) {
        console.error(`  Full error:`, e);
      }
      errors++;
    }
  }

  // Process goalies
  for (const goalie of goalieStats) {
    try {
      // Try to fetch detailed player info, but don't fail if it doesn't work
      let playerDetails = null;
      try {
        playerDetails = await fetchPlayerDetails(goalie.playerId);
      } catch (error) {
        console.log(`Could not fetch details for goalie ${goalie.playerId}, using basic info`);
      }

      const player = playerDetails?.player || {};
      
      // Parse name from stats or player details
      const nameParts = (goalie.goalieFullName || "").split(' ');
      const firstName = player.firstName?.default || nameParts[0] || "";
      const lastName = player.lastName?.default || nameParts.slice(1).join(' ') || goalie.goalieFullName || "";
      const fullName = (player.firstName?.default && player.lastName?.default)
        ? `${player.firstName.default} ${player.lastName.default}`
        : (goalie.goalieFullName || `${firstName} ${lastName}`).trim() || "Unknown Player";

      // Use player matcher to ensure player exists (matches by NHL ID or name)
      const playerResult = await ensurePlayerExists({
        nhlId: goalie.playerId,
        fullName: fullName || goalie.goalieFullName || "Unknown Player",
        firstName: firstName || "Unknown",
        lastName: lastName || "Player",
        position: "G",
        team: goalie.teamAbbrevs?.split(',')[0] || null,
        jerseyNumber: player.sweaterNumber || null,
        height: player.heightInInches ? convertHeightToFeetInches(player.heightInInches) : null,
        weight: player.weightInPounds || null,
        birthDate: player.birthDate ? new Date(player.birthDate) : null,
        birthCity: player.birthCity?.default || null,
        birthCountry: player.birthCountry || null,
        nationality: player.birthCountry ? getNationalityFromCountry(player.birthCountry) : null,
        headshot: player.headshot || `https://assets.nhle.com/mugs/nhl/latest/${goalie.playerId}.png`,
        isActive: true,
      });

      if (playerResult.created) {
        newPlayers++;
      }

      // Get the player record
      const dbPlayer = await prisma.player.findUnique({
        where: { id: playerResult.id },
      });

      if (!dbPlayer || !dbPlayer.id) {
        console.error(`Invalid player record for goalie ${goalie.playerId}, skipping stats`);
        errors++;
        continue;
      }

      await prisma.playerStats.upsert({
        where: {
          playerId_season_gameType: {
            playerId: dbPlayer.id,
            season: season,
            gameType: "regular",
          },
        },
        update: {
          gamesPlayed: goalie.gamesPlayed,
          wins: goalie.wins,
          losses: goalie.losses,
          otLosses: goalie.otLosses,
          saves: goalie.saves,
          shotsAgainst: goalie.shotsAgainst,
          goalsAgainst: goalie.shotsAgainst - goalie.saves,
          savePct: goalie.savePct,
          gaa: goalie.goalsAgainstAverage,
          shutouts: goalie.shutouts,
        },
        create: {
          playerId: dbPlayer.id,
          season: season,
          gameType: "regular",
          gamesPlayed: goalie.gamesPlayed,
          wins: goalie.wins,
          losses: goalie.losses,
          otLosses: goalie.otLosses,
          saves: goalie.saves,
          shotsAgainst: goalie.shotsAgainst,
          goalsAgainst: goalie.shotsAgainst - goalie.saves,
          savePct: goalie.savePct,
          gaa: goalie.goalsAgainstAverage,
          shutouts: goalie.shutouts,
        },
      });

      processedGoalies++;
    } catch (e) {
      console.error(`Error processing goalie ${goalie.playerId}:`, e);
      errors++;
    }
  }

  return {
    season,
    processedSkaters,
    processedGoalies,
    newPlayers,
    errors,
  };
}

export async function POST(request: NextRequest) {
  try {
    console.log("🏒 Starting NHL stats refresh...");
    
    // Get seasons from query parameter or request body
    let seasons: string[] = [];
    
    // Try query parameter first
    const { searchParams } = new URL(request.url);
    const seasonParam = searchParams.get('season') || searchParams.get('seasons');
    
    if (seasonParam) {
      // Support comma-separated seasons or single season
      seasons = seasonParam.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      // Try request body
      try {
        const body = await request.json();
        if (body.seasons && Array.isArray(body.seasons)) {
          seasons = body.seasons;
        } else if (body.season) {
          seasons = [body.season];
        }
      } catch {
        // No body or invalid JSON, continue
      }
    }
    
    // If no seasons specified, default to current season plus recent past seasons
    if (seasons.length === 0) {
      const currentSeason = getCurrentSeason();
      seasons = [currentSeason];
      
      // Also include the last 3 previous seasons for historical data
      // Parse current season (e.g., "20252026" -> 2025, 2026)
      const currentYear1 = parseInt(currentSeason.substring(0, 4));
      const currentYear2 = parseInt(currentSeason.substring(4, 8));
      
      // Calculate previous seasons (going backwards)
      for (let i = 1; i <= 3; i++) {
        const prevYear1 = currentYear1 - i;
        const prevYear2 = currentYear2 - i;
        const seasonId = `${prevYear1}${prevYear2}`;
        seasons.push(seasonId);
      }
      
      console.log(`📅 Defaulting to current season plus recent seasons: ${seasons.join(', ')}`);
    }
    
    console.log(`📊 Processing ${seasons.length} season(s): ${seasons.join(', ')}`);
    
    // Process each season sequentially
    const results = [];
    let totalProcessedSkaters = 0;
    let totalProcessedGoalies = 0;
    let totalNewPlayers = 0;
    let totalErrors = 0;
    
    for (const season of seasons) {
      try {
        const result = await processSeason(season);
        results.push(result);
        
        // Only count successful seasons (not skipped ones)
        if (!result.skipped) {
          totalProcessedSkaters += result.processedSkaters;
          totalProcessedGoalies += result.processedGoalies;
          totalNewPlayers += result.newPlayers;
          totalErrors += result.errors;
        }
        
        if (result.skipped) {
          console.log(`⚠️  Skipped ${season}: No data available`);
        } else {
          console.log(`✅ Completed ${season}: ${result.processedSkaters} skaters, ${result.processedGoalies} goalies, ${result.newPlayers} new players, ${result.errors} errors`);
        }
      } catch (error: any) {
        console.error(`❌ Error processing season ${season}:`, error.message);
        const isTimeout = error.message?.includes('timeout') || error.message?.includes('524');
        results.push({
          season,
          processedSkaters: 0,
          processedGoalies: 0,
          newPlayers: 0,
          errors: 1,
          error: error.message,
          skipped: isTimeout, // Mark timeout errors as skipped
        });
        if (!isTimeout) {
          totalErrors++;
        }
      }
    }

    // Record the refresh in DataRefresh table
    await prisma.dataRefresh.create({
      data: {
        refreshType: 'player_stats',
        status: totalErrors > 0 ? 'error' : 'success',
        lastRefresh: new Date(),
        recordCount: totalProcessedSkaters + totalProcessedGoalies,
        errorMessage: totalErrors > 0 ? `Encountered ${totalErrors} errors across ${seasons.length} season(s)` : null,
      },
    });

    console.log(`\n✅ Stats refresh complete!`);
    console.log(`📊 Summary:`);
    console.log(`  - Seasons processed: ${results.length}/${seasons.length}`);
    console.log(`  - Total skaters: ${totalProcessedSkaters}`);
    console.log(`  - Total goalies: ${totalProcessedGoalies}`);
    console.log(`  - New players added: ${totalNewPlayers}`);
    if (totalErrors > 0) {
      console.log(`  - Errors: ${totalErrors}`);
    }
    console.log(`\n📋 Per-season results:`);
    results.forEach((result: any) => {
      if (result.skipped) {
        console.log(`  ⚠️  ${result.season}: SKIPPED (no data available)`);
      } else {
        console.log(`  ✓ ${result.season}: ${result.processedSkaters} skaters, ${result.processedGoalies} goalies, ${result.newPlayers} new players, ${result.errors} errors`);
      }
    });

    return NextResponse.json({
      success: true,
      message: `Stats refreshed successfully for ${seasons.length} season(s)`,
      data: {
        seasons: results,
        totals: {
          processedSkaters: totalProcessedSkaters,
          processedGoalies: totalProcessedGoalies,
          newPlayers: totalNewPlayers,
          errors: totalErrors,
        },
      },
    });

  } catch (error: any) {
    console.error('Error refreshing stats:', error);
    
    // Record failed refresh
    try {
      await prisma.dataRefresh.create({
        data: {
          refreshType: 'player_stats',
          status: 'error',
          lastRefresh: new Date(),
          errorMessage: error.message || 'Unknown error',
        },
      });
    } catch (refreshError) {
      console.error('Failed to record refresh error:', refreshError);
    }
    
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to refresh stats',
        error: error.message
      },
      { status: 500 }
    );
  }
}

