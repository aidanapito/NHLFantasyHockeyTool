import { NextRequest, NextResponse } from 'next/server';
import { analyzeEnhancedTrade } from '@/lib/enhanced-trade-analyzer';
import { prisma } from '@/lib/prisma';
import { normalizeTeamName } from '@/lib/team-name-mapping';

interface TradeSuggestion {
  targetTeam: string;
  targetPlayer: {
    id: string;
    name: string;
    position: string;
    team: string;
    tpv?: number;
    stats?: any;
  };
  yourPlayer: {
    id: string;
    name: string;
    position: string;
    team: string;
    tpv?: number;
    stats?: any;
  };
  reason: string;
  categoryImprovement: Record<string, number>; // Net change in each category
  fairnessScore?: number;
  analysis?: any;
}

/**
 * Analyze team needs based on standings
 */
function analyzeTeamNeeds(
  teamStandings: any,
  allStandings: any[]
): {
  weakCategories: Array<{ category: string; rank: number; percentile: number; needs: number }>;
  strongCategories: Array<{ category: string; rank: number; percentile: number }>;
} {
  // Calculate ranks for each category
  const categories = ['G', 'A', 'plusMinus', 'PIM', 'PPP', 'FOW', 'SOG', 'HIT', 'BLK', 'W', 'SO', 'SV', 'GAA'];
  
  // For GAA, lower is better, so we reverse the logic
  const lowerIsBetter = ['GAA'];
  
  const weakCategories: Array<{ category: string; rank: number; percentile: number; needs: number }> = [];
  const strongCategories: Array<{ category: string; rank: number; percentile: number }> = [];
  
  categories.forEach(category => {
    if (!teamStandings[category] && category !== 'GAA' && category !== 'SV') return;
    
    // Sort all teams by this category
    const sorted = [...allStandings].sort((a, b) => {
      const aVal = a[category] || 0;
      const bVal = b[category] || 0;
      
      if (lowerIsBetter.includes(category)) {
        return aVal - bVal; // Lower is better for GAA
      }
      return bVal - aVal; // Higher is better for most categories
    });
    
    const teamIndex = sorted.findIndex(t => t.teamName === teamStandings.teamName);
    const rank = teamIndex + 1;
    const percentile = ((allStandings.length - rank) / allStandings.length) * 100;
    
    // Calculate what they need (difference from league average)
    const leagueAvg = allStandings.reduce((sum, t) => sum + (t[category] || 0), 0) / allStandings.length;
    const teamValue = teamStandings[category] || 0;
    const needs = Math.max(0, leagueAvg - teamValue);
    
    if (lowerIsBetter.includes(category)) {
      // For GAA, we need to reverse the needs calculation
      const reversedNeeds = Math.max(0, teamValue - leagueAvg);
      if (percentile < 50) {
        weakCategories.push({ category, rank, percentile, needs: reversedNeeds });
      } else {
        strongCategories.push({ category, rank, percentile });
      }
    } else {
      if (percentile < 50) {
        weakCategories.push({ category, rank, percentile, needs });
      } else {
        strongCategories.push({ category, rank, percentile });
      }
    }
  });
  
  // Sort weak categories by how much they need improvement
  weakCategories.sort((a, b) => b.needs - a.needs);
  
  return { weakCategories, strongCategories };
}

/**
 * Convert season format (e.g., '2026' -> '20252026')
 * NHL seasons are named after the ending year (2025-26 = 20252026)
 * So if someone enters "2026", they mean the season ending in 2026, which is 2025-26
 */
function convertSeasonFormat(season: string): string {
  // If already in full format (e.g., '20252026'), return as is
  if (season.length === 8) return season;
  // If short format (e.g., '2026'), convert to full format
  // "2026" means the season ending in 2026, which is 2025-26 = "20252026"
  if (season.length === 4) {
    const endYear = parseInt(season);
    const startYear = endYear - 1;
    return `${startYear}${endYear}`;
  }
  // Default fallback
  return '20252026';
}

/**
 * Find players who excel in categories your team needs
 */
async function findTargetPlayers(
  weakCategories: Array<{ category: string; needs: number }>,
  excludePlayerIds: string[] = [],
  limit: number = 50,
  season: string = '20252026'
): Promise<any[]> {
  // Map category names to database fields
  const categoryMap: Record<string, string> = {
    'G': 'goals',
    'A': 'assists',
    'plusMinus': 'plusMinus',
    'PIM': 'pim',
    'PPP': 'powerPlayPoints',
    'FOW': 'faceoffsWon',
    'SOG': 'shotsOnGoal',
    'HIT': 'hits',
    'BLK': 'blockedShots',
    'W': 'wins',
    'SO': 'shutouts',
    'SV': 'savePct',
    'GAA': 'gaa',
  };
  
  if (weakCategories.length === 0) return [];
  
  const dbSeason = convertSeasonFormat(season);
  const excludeIds = excludePlayerIds.map(id => parseInt(id)).filter(id => !isNaN(id));
  
  console.log(`Finding target players for weak categories:`, weakCategories.slice(0, 3).map(c => c.category));
  console.log(`Excluding ${excludeIds.length} player IDs`);
  
  // Get the top category we need to improve
  const topCategory = weakCategories[0];
  const topCategoryField = categoryMap[topCategory.category];
  
  if (!topCategoryField) {
    console.log('No valid category field found');
    return [];
  }
  
  // Strategy: Get players with the best stats in the top needed category
  // First try current season, then fall back to any season
  
  // Build orderBy object - use explicit field mapping to avoid Prisma errors
  const orderDirection = topCategory.category === 'GAA' ? 'asc' : 'desc';
  
  // Build orderBy clause explicitly (Prisma doesn't like dynamic property access)
  const orderByClause: any = {};
  // Map category fields to actual Prisma field names
  const orderByFieldMap: Record<string, string> = {
    'goals': 'goals',
    'assists': 'assists',
    'plusMinus': 'plusMinus',
    'pim': 'pim',
    'powerPlayPoints': 'powerPlayPoints',
    'faceoffsWon': 'faceoffsWon',
    'shotsOnGoal': 'shotsOnGoal',
    'hits': 'hits',
    'blockedShots': 'blockedShots',
    'wins': 'wins',
    'shutouts': 'shutouts',
    'savePct': 'savePct',
    'gaa': 'gaa',
  };
  
  const orderByField = orderByFieldMap[topCategoryField] || topCategoryField;
  if (orderByField) {
    orderByClause[orderByField] = orderDirection;
  }
  
  // Try current season first
  // Build the where clause properly - construct player filter correctly
  const playerFilter: any = {
    isActive: true,
  };
  
  // Only add nhlId exclusion if we have IDs to exclude
  if (excludeIds.length > 0) {
    playerFilter.nhlId = {
      notIn: excludeIds,
    };
  }
  
  // Build where clause with explicit field filtering
  const whereClause: any = {
    season: dbSeason,
    gameType: 'regular',
    player: playerFilter,
  };
  
  // Add the category field filter - use explicit field name
  // Only filter if the field exists in the schema
  // Note: Most fields are non-nullable, so we don't need to filter for null
  // We'll just rely on orderBy to get the best players
  // For nullable fields, we can filter them out in post-processing if needed
  
  console.log('Querying with where clause:', JSON.stringify(whereClause, null, 2));
  console.log('OrderBy clause:', JSON.stringify(orderByClause, null, 2));
  
  // Ensure orderBy is valid - if empty, use a default
  const finalOrderBy = Object.keys(orderByClause).length > 0 ? orderByClause : { goals: 'desc' };
  
  let statsQuery = await prisma.playerStats.findMany({
    where: whereClause,
    include: {
      player: true,
    },
    orderBy: finalOrderBy,
    take: limit * 2, // Get more to filter
  });
  
  console.log(`Found ${statsQuery.length} players with ${topCategoryField} stats for season ${dbSeason}`);
  
  // If not enough, try any season
  if (statsQuery.length < 10) {
    console.log(`Not enough players for ${dbSeason}, trying any season...`);
    // Build where clause for fallback query - construct player filter correctly
    const fallbackPlayerFilter: any = {
      isActive: true,
    };
    
    // Only add nhlId exclusion if we have IDs to exclude
    if (excludeIds.length > 0) {
      fallbackPlayerFilter.nhlId = {
        notIn: excludeIds,
      };
    }
    
    const fallbackWhereClause: any = {
      gameType: 'regular',
      player: fallbackPlayerFilter,
    };
    
    // Add the category field filter - use explicit field name
    // Note: Most fields are non-nullable, so we don't need to filter for null
    // We'll filter out nulls in post-processing if needed
    
    const allStatsQuery = await prisma.playerStats.findMany({
      where: fallbackWhereClause,
      include: {
        player: true,
      },
      take: limit * 3, // Get even more for deduplication
    });
    
    // Sort by season (most recent first), then by the category field
    allStatsQuery.sort((a, b) => {
      // First by season (descending - most recent first)
      const seasonCompare = b.season.localeCompare(a.season);
      if (seasonCompare !== 0) return seasonCompare;
      
      // Then by the category field
      const aVal = a[topCategoryField as keyof typeof a] as number;
      const bVal = b[topCategoryField as keyof typeof b] as number;
      if (topCategory.category === 'GAA') {
        return (aVal || 999) - (bVal || 999); // Lower is better for GAA
      } else {
        return (bVal || 0) - (aVal || 0); // Higher is better
      }
    });
    
    // Deduplicate by player, keeping the most recent season's stats
    const playerMap = new Map();
    allStatsQuery.forEach(stat => {
      const playerId = stat.playerId;
      if (!playerMap.has(playerId) || playerMap.get(playerId).season < stat.season) {
        playerMap.set(playerId, stat);
      }
    });
    statsQuery = Array.from(playerMap.values())
      .sort((a, b) => {
        const aVal = a[topCategoryField as keyof typeof a] as number;
        const bVal = b[topCategoryField as keyof typeof b] as number;
        if (topCategory.category === 'GAA') {
          return (aVal || 999) - (bVal || 999);
        } else {
          return (bVal || 0) - (aVal || 0);
        }
      })
      .slice(0, limit);
    
    console.log(`Found ${statsQuery.length} unique players with ${topCategoryField} stats from any season`);
  } else {
    // Sort the results by the category field if we got them
    statsQuery.sort((a, b) => {
      const aVal = a[topCategoryField as keyof typeof a] as number;
      const bVal = b[topCategoryField as keyof typeof b] as number;
      if (topCategory.category === 'GAA') {
        return (aVal || 999) - (bVal || 999);
      } else {
        return (bVal || 0) - (aVal || 0);
      }
    });
    statsQuery = statsQuery.slice(0, limit);
  }
  
  // Convert to player format with stats
  const players = statsQuery.map(stat => ({
    ...stat.player,
    stats: [stat],
  }));
  
  return players;
}

/**
 * POST /api/trade-analyzer/suggestions
 * Generate AI-powered trade suggestions
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      teamName, 
      leagueId, 
      season,
      yourPlayerIds = [], // Players you're willing to trade
      maxSuggestions = 10 
    } = body;
    
    if (!teamName || !leagueId || !season) {
      return NextResponse.json(
        { error: 'teamName, leagueId, and season are required' },
        { status: 400 }
      );
    }
    
    // Fetch standings to analyze team needs
    let standingsResponse;
    try {
      standingsResponse = await fetch(
        `${request.nextUrl.origin}/api/fantasy/espn-standings?leagueId=${leagueId}&season=${season}`,
        {
          signal: AbortSignal.timeout(30000), // 30 second timeout
        }
      );
    } catch (error: any) {
      console.error('Error fetching standings:', error);
      return NextResponse.json(
        { 
          error: 'Failed to fetch standings',
          message: error.message || 'Request timed out or network error',
          details: 'Make sure your ESPN league ID and season are correct. You may need to refresh your ESPN login session.'
        },
        { status: 500 }
      );
    }
    
    if (!standingsResponse.ok) {
      let errorMessage = 'Failed to fetch standings';
      let errorDetails = '';
      try {
        const errorData = await standingsResponse.json().catch(() => ({}));
        errorMessage = errorData.error || errorData.message || errorMessage;
        errorDetails = errorData.details || errorData.hint || errorData.message || '';
      } catch (e) {
        // Ignore JSON parse errors
      }
      
      return NextResponse.json(
        { 
          error: errorMessage,
          message: errorDetails || (standingsResponse.status === 401 
            ? 'ESPN session expired. Please run "npm run espn-login" to refresh your session.'
            : 'Check your league ID and season are correct.'),
          status: standingsResponse.status,
        },
        { status: standingsResponse.status }
      );
    }
    
    let standingsData;
    try {
      standingsData = await standingsResponse.json();
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to parse standings response', message: 'Invalid JSON from standings API' },
        { status: 500 }
      );
    }
    
    const allStandings = standingsData.standings || standingsData || [];
    
    if (!Array.isArray(allStandings)) {
      console.error('Invalid standings format:', standingsData);
      return NextResponse.json(
        { 
          error: 'Invalid standings data format',
          details: 'Expected an array of standings, but received a different format. Check the ESPN API response.',
          receivedType: typeof standingsData
        },
        { status: 500 }
      );
    }
    
    if (allStandings.length === 0) {
      return NextResponse.json(
        { 
          error: 'No standings data found',
          details: `No teams found for league ${leagueId} in season ${season}. Make sure the season and league ID are correct.`
        },
        { status: 404 }
      );
    }
    
    // Normalize team name (convert abbrev to full name if needed)
    const normalizedTeamName = normalizeTeamName(teamName);
    
    // Try to find team by normalized name first, then by original name
    let yourTeam = allStandings.find((t: any) => t.teamName === normalizedTeamName);
    if (!yourTeam) {
      yourTeam = allStandings.find((t: any) => t.teamName === teamName);
    }
    
    if (!yourTeam) {
      return NextResponse.json(
        { 
          error: `Team "${teamName}" not found in standings`,
          details: `Available teams: ${allStandings.map((t: any) => t.teamName).join(', ')}`
        },
        { status: 404 }
      );
    }
    
    // Analyze team needs
    const { weakCategories, strongCategories } = analyzeTeamNeeds(yourTeam, allStandings);
    
    if (weakCategories.length === 0) {
      return NextResponse.json({
        suggestions: [],
        message: 'Your team is performing well across all categories!',
        weakCategories: [],
        strongCategories,
      });
    }
    
    // Find target players that address weak categories
    const dbSeason = convertSeasonFormat(season);
    const targetPlayers = await findTargetPlayers(weakCategories, yourPlayerIds, 50, season);
    
    // If user specified players they want to trade, use those; otherwise suggest players from strong categories
    let yourPlayersToTrade: any[] = [];
    
    if (yourPlayerIds.length > 0) {
      // Fetch specific players user wants to trade
      const players = await prisma.player.findMany({
        where: {
          nhlId: { in: yourPlayerIds.map((id: string) => parseInt(id)) },
        },
        include: {
          stats: {
            where: { season: dbSeason, gameType: 'regular' },
            take: 1,
          },
        },
      });
      yourPlayersToTrade = players;
    } else {
      // Suggest trading players from strong categories (excess value)
      // This would require roster data - for now, we'll suggest 1-for-1 trades with target players
      // In a full implementation, you'd fetch the team's roster here
    }
    
    // Generate trade suggestions
    const suggestions: TradeSuggestion[] = [];
    
    for (const targetPlayer of targetPlayers.slice(0, maxSuggestions)) {
      // For each target player, find a reasonable trade
      // This is simplified - in reality, you'd want to match value more carefully
      
      if (yourPlayersToTrade.length > 0) {
        // Try trading one of your players for the target
        for (const yourPlayer of yourPlayersToTrade.slice(0, 3)) {
          try {
            const analysis = await analyzeEnhancedTrade({
              sideA: [yourPlayer.nhlId.toString()],
              sideB: [targetPlayer.nhlId.toString()],
              sideAName: teamName,
              sideBName: 'Target Team',
            });
            
            // Only suggest trades that are reasonably fair (fairness score >= 60)
            if (analysis.fairnessScore >= 60) {
              const categoryImp: Record<string, number> = {};
              if (analysis.categoryImpact?.netChange) {
                Object.entries(analysis.categoryImpact.netChange).forEach(([cat, change]) => {
                  categoryImp[cat] = change;
                });
              }
              
              suggestions.push({
                targetTeam: 'Target Team',
                targetPlayer: {
                  id: targetPlayer.nhlId.toString(),
                  name: targetPlayer.fullName || `${targetPlayer.firstName} ${targetPlayer.lastName}`,
                  position: targetPlayer.position || 'N/A',
                  team: targetPlayer.team || 'N/A',
                  tpv: analysis.playerBreakdown.sideB[0]?.tpv,
                },
                yourPlayer: {
                  id: yourPlayer.nhlId.toString(),
                  name: yourPlayer.fullName || `${yourPlayer.firstName} ${yourPlayer.lastName}`,
                  position: yourPlayer.position || 'N/A',
                  team: yourPlayer.team || 'N/A',
                  tpv: analysis.playerBreakdown.sideA[0]?.tpv,
                },
                reason: `Improves ${weakCategories.slice(0, 2).map(w => w.category).join(' and ')} categories`,
                categoryImprovement: categoryImp,
                fairnessScore: analysis.fairnessScore,
                analysis,
              });
              
              // Limit suggestions
              if (suggestions.length >= maxSuggestions) break;
            }
          } catch (error) {
            console.error(`Error analyzing trade for ${targetPlayer.fullName}:`, error);
          }
        }
      } else {
        // Generic suggestion without specific player match
        suggestions.push({
          targetTeam: 'Target Team',
          targetPlayer: {
            id: targetPlayer.nhlId.toString(),
            name: targetPlayer.fullName || `${targetPlayer.firstName} ${targetPlayer.lastName}`,
            position: targetPlayer.position || 'N/A',
            team: targetPlayer.team || 'N/A',
          },
          yourPlayer: {
            id: '',
            name: 'Select a player to trade',
            position: '',
            team: '',
          },
          reason: `Top performer in ${weakCategories[0]?.category || 'needed categories'}`,
          categoryImprovement: {},
        });
      }
      
      if (suggestions.length >= maxSuggestions) break;
    }
    
    // Add helpful message if no suggestions found
    let message: string | undefined;
    if (suggestions.length === 0) {
      if (yourPlayerIds.length > 0) {
        message = `No fair trades found (fairness score >= 60) for the players you selected. The AI analyzed ${targetPlayers.length} potential target players but couldn't find balanced trades. Try selecting different players or the system may find better matches as the season progresses.`;
      } else {
        message = 'No trade suggestions found. Try adding players you\'re willing to trade to Team A first.';
      }
    }
    
    return NextResponse.json({
      suggestions,
      message,
      teamAnalysis: {
        weakCategories: weakCategories.map(w => ({
          category: w.category,
          rank: w.rank,
          percentile: Math.round(w.percentile),
          needsImprovement: w.needs > 0,
        })),
        strongCategories: strongCategories.map(s => ({
          category: s.category,
          rank: s.rank,
          percentile: Math.round(s.percentile),
        })),
      },
      debug: {
        playersAnalyzed: yourPlayerIds.length,
        targetPlayersFound: targetPlayers.length,
        suggestionsGenerated: suggestions.length,
      },
    });
  } catch (error: any) {
    console.error('Error generating trade suggestions:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate trade suggestions' },
      { status: 500 }
    );
  }
}
