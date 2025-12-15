/**
 * Matchup Analyzer Service
 * 
 * Analyzes fantasy team matchups by comparing the number of players
 * playing during a given week (Monday to Sunday).
 */

import { PrismaClient } from '@prisma/client'
import {
  fetchScheduleForWeek,
  getWeekStart,
  formatDate,
  type NHLGame,
} from './nhl-api-service'

const INTERNAL_API_BASE_URL =
  process.env.INTERNAL_API_BASE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  'http://localhost:3000'

const prisma = new PrismaClient()

export interface TeamReference {
  id: string
  source?: 'db' | 'manual' | 'espn'
  leagueId?: string
  season?: string
  platformTeamId?: string
}

interface NormalizedRosterEntry {
  nhlId: number
  fullName: string
  team: string | null
  position: string
  slotPosition: string | null
  stats?: any | null
}

interface NormalizedTeam {
  id: string
  teamName: string
  roster: NormalizedRosterEntry[]
}

export interface PlayerGame {
  gameId: number;
  date: string; // YYYY-MM-DD
  opponent: string; // Opponent team abbreviation
  isHome: boolean;
}

export interface PlayerGameCount {
  playerId: number;
  playerName: string;
  position: string;
  nhlTeam: string | null;
  gamesCount: number;
  gameDates: string[]; // Dates when the player's team plays (legacy, for backwards compatibility)
  games: PlayerGame[]; // Detailed game information
}

export interface TeamStats {
  // Skater stats
  goals: number;
  assists: number;
  points: number;
  plusMinus: number;
  pim: number;
  powerPlayPoints: number;
  shotsOnGoal: number;
  hits: number;
  blockedShots: number;
  // Goalie stats
  wins: number;
  shutouts: number;
  saves: number;
  goalsAgainst: number;
  // Calculated
  gaa: number; // Goals Against Average
  savePct: number; // Save Percentage
}

export interface TeamMatchupAnalysis {
  teamId: string;
  teamName: string;
  totalPlayers: number;
  playersWithGames: number;
  totalGames: number;
  playerBreakdown: PlayerGameCount[];
  stats: TeamStats;
}

export interface MatchupComparison {
  team1: TeamMatchupAnalysis;
  team2: TeamMatchupAnalysis;
  weekStart: string; // YYYY-MM-DD
  weekEnd: string; // YYYY-MM-DD
  advantage: {
    team: string; // team1 or team2
    gamesDifference: number;
  };
  projections?: {
    team1: TeamStats;
    team2: TeamStats;
    categoryWins: {
      team1: number;
      team2: number;
    };
  };
}

/**
 * Analyze a single fantasy team's weekly matchup
 */
async function analyzeTeamMatchup(
  teamRef: TeamReference,
  weekStartDate: Date,
  schedule: NHLGame[]
): Promise<TeamMatchupAnalysis> {
  const team = await resolveTeam(teamRef)

  // Filter out IR/BN players if needed - for now, include all
  // You can modify this to only count active players
  const excludedSlots = new Set([
    'IR',
    'IR+',
    'IR-LT',
    'IR-NR',
    'IR-COVID',
    'BN',
    'BENCH',
    'RES',
    'RESERVE',
    'NA',
    'MINORS',
    'TAXI',
    'SUSPENDED',
    'UNKNOWN',
  ])

  const activeRoster = team.roster.filter(r => {
    if (!r.slotPosition) return true
    const slot = r.slotPosition.toString().trim().toUpperCase()
    if (!slot) return true
    return !excludedSlots.has(slot)
  })

  const playerBreakdown: PlayerGameCount[] = []

  // Track unique games by game ID for total count
  const uniqueGames = new Set<number>()

  // For each player, find their team's games
  let fallbackIdCounter = 1

  for (const rosterEntry of activeRoster) {
    if (!rosterEntry.team) {
      // Free agent or no team assigned
      playerBreakdown.push({
        playerId: rosterEntry.nhlId,
        playerName: rosterEntry.fullName,
        position: rosterEntry.position,
        nhlTeam: null,
        gamesCount: 0,
        gameDates: [],
        games: [],
      })
      continue
    }

    // Find games for this player's NHL team
    const teamGames = schedule.filter(
      game => 
        game.homeTeam.abbrev === rosterEntry.team || 
        game.awayTeam.abbrev === rosterEntry.team
    )

    // Track unique games for this player's team
    const playerUniqueGames = new Set<number>()
    const playerGameDates: string[] = []
    const playerGames: PlayerGame[] = []
    
    teamGames.forEach(game => {
      // Add to unique games set (by game ID) for total count
      uniqueGames.add(game.id)
      
      if (!playerUniqueGames.has(game.id)) {
        playerUniqueGames.add(game.id)
        
        // Extract date string from gameDate (YYYY-MM-DD format)
        if (!game.gameDate) {
          return
        }
        
        const dateStr = game.gameDate.includes('T') 
          ? game.gameDate.split('T')[0] 
          : game.gameDate.split(' ')[0]
        
        if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
          return
        }
        
        playerGameDates.push(dateStr)
        
        // Determine opponent and home/away status
        const isHome = game.homeTeam.abbrev === rosterEntry.team
        const opponent = isHome ? game.awayTeam.abbrev : game.homeTeam.abbrev
        
        playerGames.push({
          gameId: game.id,
          date: dateStr,
          opponent,
          isHome,
        })
      }
    })

    // Sort games by date
    playerGames.sort((a, b) => a.date.localeCompare(b.date))

    playerBreakdown.push({
      playerId: rosterEntry.nhlId,
      playerName: rosterEntry.fullName,
      position: rosterEntry.position,
      nhlTeam: rosterEntry.team,
      gamesCount: playerUniqueGames.size, // Count of unique games for this player's team
      gameDates: playerGameDates, // Legacy field for backwards compatibility
      games: playerGames,
    })
  }

  // Calculate totals - count unique games across all players
  const totalGames = uniqueGames.size;
  const playersWithGames = playerBreakdown.filter(p => p.gamesCount > 0).length;

  // Calculate team stats
  const teamStats: TeamStats = {
    goals: 0,
    assists: 0,
    points: 0,
    plusMinus: 0,
    pim: 0,
    powerPlayPoints: 0,
    shotsOnGoal: 0,
    hits: 0,
    blockedShots: 0,
    wins: 0,
    shutouts: 0,
    saves: 0,
    goalsAgainst: 0,
    gaa: 0,
    savePct: 0,
  }

  let totalGoalieGames = 0
  let totalGoalieSaves = 0
  let totalGoalieGoalsAgainst = 0

  let playersWithStats = 0
  let playersWithoutStats = 0

  for (const rosterEntry of activeRoster) {
    const stats = rosterEntry.stats

    if (!stats) {
      playersWithoutStats++
      console.log(`[Matchup] Player ${rosterEntry.fullName} (${rosterEntry.position}) has no stats`)
      continue
    }

    playersWithStats++

    // Skater stats
    teamStats.goals += stats.goals || 0
    teamStats.assists += stats.assists || 0
    teamStats.points += stats.points || 0
    teamStats.plusMinus += stats.plusMinus || 0
    teamStats.pim += stats.pim || 0
    teamStats.powerPlayPoints += stats.powerPlayPoints || 0
    teamStats.shotsOnGoal += stats.shotsOnGoal || 0
    teamStats.hits += stats.hits || 0
    teamStats.blockedShots += stats.blockedShots || 0

    // Goalie stats (only for goalies)
    if (rosterEntry.position === 'G') {
      teamStats.wins += stats.wins || 0
      teamStats.shutouts += stats.shutouts || 0
      teamStats.saves += stats.saves || 0
      teamStats.goalsAgainst += stats.goalsAgainst || 0

      if (stats.gamesPlayed > 0) {
        totalGoalieGames += stats.gamesPlayed
        totalGoalieSaves += stats.saves || 0
        totalGoalieGoalsAgainst += stats.goalsAgainst || 0
      }
    }
  }

  console.log(`[Matchup] Team ${team.teamName} stats aggregation:`, {
    totalPlayers: activeRoster.length,
    playersWithStats,
    playersWithoutStats,
    aggregatedStats: {
      goals: teamStats.goals,
      assists: teamStats.assists,
      points: teamStats.points,
      shotsOnGoal: teamStats.shotsOnGoal,
      hits: teamStats.hits,
      blockedShots: teamStats.blockedShots,
      wins: teamStats.wins,
      shutouts: teamStats.shutouts,
    }
  })

  // Calculate goalie averages
  if (totalGoalieGames > 0) {
    teamStats.gaa = totalGoalieGoalsAgainst / totalGoalieGames
    const totalShots = totalGoalieSaves + totalGoalieGoalsAgainst
    teamStats.savePct = totalShots > 0 ? (totalGoalieSaves / totalShots) * 100 : 0
  }

  return {
    teamId: team.id,
    teamName: team.teamName,
    totalPlayers: activeRoster.length,
    playersWithGames,
    totalGames,
    playerBreakdown,
    stats: teamStats,
  };
}

/**
 * Filter games to only include those within the week range
 * Uses the same date parsing logic as the main analysis to ensure consistency
 */
function filterGamesByWeek(games: NHLGame[], weekStart: Date, weekEnd: Date): NHLGame[] {
  const weekStartStr = formatDate(weekStart); // YYYY-MM-DD
  const weekEndStr = formatDate(weekEnd); // YYYY-MM-DD
  
  return games.filter(game => {
    if (!game.gameDate) {
      return false;
    }
    
    const gameDateStr = game.gameDate.includes('T') 
      ? game.gameDate.split('T')[0] 
      : game.gameDate.split(' ')[0];
    
    if (!gameDateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return false;
    }
    
    return gameDateStr >= weekStartStr && gameDateStr <= weekEndStr;
  });
}

/**
 * Merge ESPN standings stats into team stats (season totals)
 */
function mergeStandingsStats(currentStats: TeamStats, standings: any): TeamStats {
  return {
    // Skater stats from ESPN standings (season totals)
    goals: standings.G !== undefined && standings.G !== null ? Number(standings.G) : (currentStats.goals ?? 0),
    assists: standings.A !== undefined && standings.A !== null ? Number(standings.A) : (currentStats.assists ?? 0),
    points: standings.PTS !== undefined && standings.PTS !== null ? Number(standings.PTS) : (standings.points !== undefined ? Number(standings.points) : (currentStats.points ?? 0)),
    plusMinus: standings.plusMinus !== undefined && standings.plusMinus !== null ? Number(standings.plusMinus) : (standings['+/-'] !== undefined ? Number(standings['+/-']) : (currentStats.plusMinus ?? 0)),
    pim: standings.PIM !== undefined && standings.PIM !== null ? Number(standings.PIM) : (currentStats.pim ?? 0),
    powerPlayPoints: standings.PPP !== undefined && standings.PPP !== null ? Number(standings.PPP) : (currentStats.powerPlayPoints ?? 0),
    shotsOnGoal: standings.SOG !== undefined && standings.SOG !== null ? Number(standings.SOG) : (standings.shotsOnGoal !== undefined ? Number(standings.shotsOnGoal) : (standings.shots !== undefined ? Number(standings.shots) : (currentStats.shotsOnGoal ?? 0))),
    hits: standings.HIT !== undefined && standings.HIT !== null ? Number(standings.HIT) : (currentStats.hits ?? 0),
    blockedShots: standings.BLK !== undefined && standings.BLK !== null ? Number(standings.BLK) : (standings.blockedShots !== undefined ? Number(standings.blockedShots) : (standings.blocks !== undefined ? Number(standings.blocks) : (currentStats.blockedShots ?? 0))),
    
    // Goalie stats from ESPN standings
    wins: standings.W !== undefined && standings.W !== null ? Number(standings.W) : (currentStats.wins ?? 0),
    shutouts: standings.SO !== undefined && standings.SO !== null ? Number(standings.SO) : (currentStats.shutouts ?? 0),
    saves: standings.saves !== undefined && standings.saves !== null ? Number(standings.saves) : (currentStats.saves ?? 0),
    goalsAgainst: standings.GA !== undefined && standings.GA !== null ? Number(standings.GA) : (currentStats.goalsAgainst ?? 0),
    
    // Calculated stats
    gaa: standings.GAA !== undefined && standings.GAA !== null ? Number(standings.GAA) : (currentStats.gaa ?? 0),
    savePct: standings.SV !== undefined && standings.SV !== null 
      ? (typeof standings.SV === 'number' 
          ? (standings.SV > 1 ? standings.SV : standings.SV * 100) 
          : parseFloat(String(standings.SV)) * 100)
      : (currentStats.savePct ?? 0),
  }
}

/**
 * Analyze matchup between two fantasy teams for a given week
 */
export async function analyzeWeeklyMatchup(
  team1Input: TeamReference | string,
  team2Input: TeamReference | string,
  weekStartDate?: Date,
  standingsData?: any[] // Optional ESPN standings data with season totals
): Promise<MatchupComparison> {
  const team1Ref = normalizeTeamReference(team1Input)
  const team2Ref = normalizeTeamReference(team2Input)

  // Determine week boundaries (Monday to Sunday)
  const weekStart = getWeekStart(weekStartDate)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  // Fetch schedule for the week
  const allGames = await fetchScheduleForWeek(weekStart)
  
  // Filter games to only include those within the week boundaries
  const schedule = filterGamesByWeek(allGames, weekStart, weekEnd)

  // Analyze both teams
  const [team1Analysis, team2Analysis] = await Promise.all([
    analyzeTeamMatchup(team1Ref, weekStart, schedule),
    analyzeTeamMatchup(team2Ref, weekStart, schedule),
  ])

  // If standings data is provided, replace stats with season totals from ESPN
  if (standingsData && standingsData.length > 0) {
    console.log(`[Matchup Analyzer] Attempting to match teams with ${standingsData.length} standings entries`)
    
    // Match teams by ID or name
    const team1Standings = standingsData.find((s: any) => {
      const team1Id = team1Analysis.teamId?.toString()
      const standingsId = (s.id || s.teamId || s.team_id)?.toString()
      if (team1Id && standingsId && team1Id === standingsId) return true
      
      // Fallback to name matching
      const team1Name = team1Analysis.teamName?.toLowerCase().trim().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]/g, '')
      const standingsName = (s.teamName || '').toLowerCase().trim().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]/g, '')
      return team1Name && standingsName && (team1Name === standingsName || team1Name.includes(standingsName) || standingsName.includes(team1Name))
    })

    const team2Standings = standingsData.find((s: any) => {
      const team2Id = team2Analysis.teamId?.toString()
      const standingsId = (s.id || s.teamId || s.team_id)?.toString()
      if (team2Id && standingsId && team2Id === standingsId) return true
      
      const team2Name = team2Analysis.teamName?.toLowerCase().trim().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]/g, '')
      const standingsName = (s.teamName || '').toLowerCase().trim().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]/g, '')
      return team2Name && standingsName && (team2Name === standingsName || team2Name.includes(standingsName) || standingsName.includes(team2Name))
    })

    // Replace stats with standings (season totals)
    if (team1Standings) {
      console.log(`[Matchup Analyzer] Using ESPN standings for team1: ${team1Analysis.teamName}`)
      team1Analysis.stats = mergeStandingsStats(team1Analysis.stats, team1Standings)
    } else {
      console.warn(`[Matchup Analyzer] Team1 standings not found - using aggregated player stats`)
    }
    
    if (team2Standings) {
      console.log(`[Matchup Analyzer] Using ESPN standings for team2: ${team2Analysis.teamName}`)
      team2Analysis.stats = mergeStandingsStats(team2Analysis.stats, team2Standings)
    } else {
      console.warn(`[Matchup Analyzer] Team2 standings not found - using aggregated player stats`)
    }
  } else {
    console.log(`[Matchup Analyzer] No standings data provided - using aggregated player stats`)
  }

  // Determine advantage
  const gamesDifference = team1Analysis.totalGames - team2Analysis.totalGames
  const advantage = {
    team: gamesDifference > 0 ? 'team1' : gamesDifference < 0 ? 'team2' : 'tie',
    gamesDifference: Math.abs(gamesDifference),
  }

  return {
    team1: team1Analysis,
    team2: team2Analysis,
    weekStart: formatDate(weekStart),
    weekEnd: formatDate(weekEnd),
    advantage,
  };
}

/**
 * Get matchup analysis for multiple weeks (for visualization)
 */
export async function analyzeMatchupForMultipleWeeks(
  team1Input: TeamReference | string,
  team2Input: TeamReference | string,
  numberOfWeeks: number = 4,
  startDate?: Date
): Promise<MatchupComparison[]> {
  const team1Ref = normalizeTeamReference(team1Input)
  const team2Ref = normalizeTeamReference(team2Input)

  const results: MatchupComparison[] = []
  let currentDate = startDate ? new Date(startDate) : new Date()

  for (let i = 0; i < numberOfWeeks; i++) {
    const weekStart = getWeekStart(currentDate)
    const analysis = await analyzeWeeklyMatchup(team1Ref, team2Ref, weekStart)
    results.push(analysis)

    // Move to next week
    currentDate = new Date(weekStart)
    currentDate.setDate(currentDate.getDate() + 7)
  }

  return results
}

/**
 * Calculate category wins by comparing two sets of team stats
 */
function calculateCategoryWins(stats1: TeamStats, stats2: TeamStats): { team1: number; team2: number } {
  let team1Wins = 0
  let team2Wins = 0
  
  // Skater categories (higher is better)
  const skaterCategories: (keyof TeamStats)[] = [
    'goals', 'assists', 'points', 'plusMinus', 'powerPlayPoints',
    'shotsOnGoal', 'hits', 'blockedShots'
  ]
  
  // For PIM, higher is better (though this can be debatable)
  // Goalie categories
  const goalieCategoriesHigher: (keyof TeamStats)[] = ['wins', 'shutouts', 'saves', 'savePct']
  const goalieCategoriesLower: (keyof TeamStats)[] = ['gaa'] // Lower GAA is better
  
  // Compare skater stats
  for (const category of skaterCategories) {
    const val1 = stats1[category] as number || 0
    const val2 = stats2[category] as number || 0
    if (val1 > val2) {
      team1Wins++
    } else if (val2 > val1) {
      team2Wins++
    }
    // Tie: no winner
  }
  
  // Compare PIM (higher is better)
  const pim1 = stats1.pim || 0
  const pim2 = stats2.pim || 0
  if (pim1 > pim2) {
    team1Wins++
  } else if (pim2 > pim1) {
    team2Wins++
  }
  
  // Compare goalie stats (higher is better)
  for (const category of goalieCategoriesHigher) {
    const val1 = stats1[category] as number || 0
    const val2 = stats2[category] as number || 0
    if (val1 > val2) {
      team1Wins++
    } else if (val2 > val1) {
      team2Wins++
    }
  }
  
  // Compare GAA (lower is better)
  const gaa1 = stats1.gaa || 0
  const gaa2 = stats2.gaa || 0
  if (gaa1 > 0 && gaa2 > 0) {
    if (gaa1 < gaa2) {
      team1Wins++
    } else if (gaa2 < gaa1) {
      team2Wins++
    }
  } else if (gaa1 > 0) {
    team1Wins++
  } else if (gaa2 > 0) {
    team2Wins++
  }
  
  return { team1: team1Wins, team2: team2Wins }
}

/**
 * Aggregate projected stats from player predictions
 */
function aggregateProjectedPlayerStats(
  predictions: Array<{
    playerId: number
    gameDate: string
    stats: Record<string, number>
  }>,
  playerBreakdown: PlayerGameCount[]
): TeamStats {
  const stats: TeamStats = {
    goals: 0,
    assists: 0,
    points: 0,
    plusMinus: 0,
    pim: 0,
    powerPlayPoints: 0,
    shotsOnGoal: 0,
    hits: 0,
    blockedShots: 0,
    wins: 0,
    shutouts: 0,
    saves: 0,
    goalsAgainst: 0,
    gaa: 0,
    savePct: 0,
  }
  
  // Group predictions by player
  const predictionsByPlayer = new Map<number, typeof predictions>()
  for (const pred of predictions) {
    if (!predictionsByPlayer.has(pred.playerId)) {
      predictionsByPlayer.set(pred.playerId, [])
    }
    predictionsByPlayer.get(pred.playerId)!.push(pred)
  }
  
  // Map stat names from model output to TeamStats
  const statMapping: Record<string, keyof TeamStats> = {
    goals: 'goals',
    assists: 'assists',
    points: 'points',
    plusMinus: 'plusMinus',
    pim: 'pim',
    powerPlayPoints: 'powerPlayPoints',
    shotsOnGoal: 'shotsOnGoal',
    hits: 'hits',
    blocks: 'blockedShots',
    wins: 'wins',
    shutouts: 'shutouts',
    saves: 'saves',
    goalsAgainst: 'goalsAgainst',
    // Note: shots, shotsAgainst, timeOnIceSeconds, savePct are also available but not directly aggregated
  }
  
  let totalGoalieSaves = 0
  let totalGoalieShotsAgainst = 0
  let totalGoalieGoalsAgainst = 0
  let totalGoalieGames = 0
  
  // Aggregate stats for each player
  for (const [playerId, playerPreds] of predictionsByPlayer) {
    // Find player info to determine position
    const playerInfo = playerBreakdown.find(p => p.playerId === playerId)
    const isGoalie = playerInfo?.position === 'G'
    
    // Sum predictions across all games for this player
    for (const pred of playerPreds) {
      const predStats = pred.stats || {}
      
      for (const [modelStat, teamStat] of Object.entries(statMapping)) {
        const value = predStats[modelStat] || 0
        if (typeof value === 'number' && !isNaN(value)) {
          // For goalies, handle special stats
          if (isGoalie && modelStat === 'saves') {
            totalGoalieSaves += value
          } else if (isGoalie && modelStat === 'goalsAgainst') {
            totalGoalieGoalsAgainst += value
          } else if (isGoalie && modelStat === 'shotsAgainst') {
            totalGoalieShotsAgainst += value
          } else {
            // Regular stat aggregation
            const current = stats[teamStat] as number
            stats[teamStat] = (current + value) as any
          }
        }
      }
      
      // Count goalie games
      if (isGoalie) {
        totalGoalieGames++
      }
    }
  }
  
  // Calculate goalie averages
  stats.saves = totalGoalieSaves
  stats.goalsAgainst = totalGoalieGoalsAgainst
  
  if (totalGoalieGames > 0) {
    stats.gaa = totalGoalieGoalsAgainst / totalGoalieGames
    if (totalGoalieShotsAgainst > 0) {
      stats.savePct = totalGoalieSaves / totalGoalieShotsAgainst
    }
  }
  
  return stats
}

function normalizeTeamReference(input: TeamReference | string): TeamReference {
  if (typeof input === 'string') {
    return { id: input }
  }
  if (!input.id && input.platformTeamId) {
    return { ...input, id: input.platformTeamId }
  }
  if (!input.id) {
    throw new Error('Team reference must include an id')
  }
  return input
}

async function resolveTeam(teamRef: TeamReference): Promise<NormalizedTeam> {
  if (teamRef.source === 'espn') {
    return fetchEspnTeam(teamRef)
  }
  return fetchDatabaseTeam(teamRef)
}

async function fetchDatabaseTeam(teamRef: TeamReference): Promise<NormalizedTeam> {
  let team = await prisma.fantasyTeam.findUnique({
    where: { id: teamRef.id },
    include: {
      roster: {
        include: {
          player: {
            include: {
              stats: {
                where: {
                  season: '20252026',
                  gameType: 'regular',
                },
                take: 1,
              },
            },
          },
        },
      },
    },
  })

  if (!team && teamRef.platformTeamId) {
    team = await prisma.fantasyTeam.findFirst({
      where: { platformTeamId: teamRef.platformTeamId },
      include: {
        roster: {
          include: {
            player: {
              include: {
                stats: {
                  where: {
                    season: '20252026',
                    gameType: 'regular',
                  },
                  take: 1,
                },
              },
            },
          },
        },
      },
    })
  }

  if (!team && teamRef.id) {
    // Attempt to match on platformTeamId using incoming id
    team = await prisma.fantasyTeam.findFirst({
      where: { platformTeamId: teamRef.id },
      include: {
        roster: {
          include: {
            player: {
              include: {
                stats: {
                  where: {
                    season: '20252026',
                    gameType: 'regular',
                  },
                  take: 1,
                },
              },
            },
          },
        },
      },
    })
  }

  if (!team) {
    throw new Error(`Team ${teamRef.id} not found`)
  }

  const roster: NormalizedRosterEntry[] = team.roster.map(entry => {
    const stats = entry.player.stats?.[0] ?? null
    if (!stats) {
      console.log(`[Matchup] Player ${entry.player.fullName} (ID: ${entry.player.nhlId}) has no stats for season 20252026`)
    } else {
      console.log(`[Matchup] Player ${entry.player.fullName} has stats:`, {
        goals: stats.goals,
        assists: stats.assists,
        points: stats.points,
        season: stats.season,
      })
    }
    return {
      nhlId: entry.player.nhlId,
      fullName: entry.player.fullName,
      team: entry.player.team,
      position: entry.player.position,
      slotPosition: entry.slotPosition,
      stats,
    }
  })

  return {
    id: team.id,
    teamName: team.teamName,
    roster,
  }
}

/**
 * Extract and normalize stats from ESPN player stats array
 * ESPN stats are in format: { statSourceId, scoringPeriodId, appliedStats: {...}, stats: {...} }
 */
function extractEspnStats(player: any): any | null {
  const statsArray = Array.isArray(player.stats) ? player.stats : []
  
  if (statsArray.length === 0) {
    console.log(`[ESPN Stats] No stats array for player ${player.fullName || player.name}`)
    return null
  }

  // Log the structure for debugging
  if (statsArray.length > 0) {
    console.log(`[ESPN Stats] Player ${player.fullName || player.name} has ${statsArray.length} stat entries`)
    console.log(`[ESPN Stats] First entry keys:`, Object.keys(statsArray[0] || {}))
    if (statsArray[0]) {
      console.log(`[ESPN Stats] Sample stat entry:`, JSON.stringify(statsArray[0], null, 2).substring(0, 500))
    }
  }
  
  // Find season stats (scoringPeriodId 0 typically means season totals)
  // statSourceId 0 = actual stats, 1 = projected stats
  const seasonStats = statsArray.find((stat: any) => {
    const periodId = stat.scoringPeriodId ?? stat.periodId
    const sourceId = stat.statSourceId ?? stat.sourceId
    return periodId === 0 && sourceId === 0
  })

  if (!seasonStats) {
    // Try to find any stats with period 0
    const anySeasonStats = statsArray.find((stat: any) => {
      const periodId = stat.scoringPeriodId ?? stat.periodId
      return periodId === 0
    })
    if (!anySeasonStats) {
      console.log(`[ESPN Stats] No season stats found for ${player.fullName || player.name}`)
      return null
    }
    console.log(`[ESPN Stats] Using fallback season stats for ${player.fullName || player.name}`)
    return normalizeEspnStats(anySeasonStats)
  }

  console.log(`[ESPN Stats] Found season stats for ${player.fullName || player.name}`)
  return normalizeEspnStats(seasonStats)
}

/**
 * Normalize ESPN stats format to match PlayerStats schema
 */
function normalizeEspnStats(espnStat: any): any {
  // ESPN uses appliedStats or stats object with numeric keys
  const statsObj = espnStat.appliedStats ?? espnStat.stats ?? {}
  
  console.log(`[ESPN Stats] Normalizing stats. Keys in statsObj:`, Object.keys(statsObj))
  console.log(`[ESPN Stats] Sample statsObj:`, JSON.stringify(statsObj, null, 2).substring(0, 500))
  
  // ESPN stat ID mappings (common fantasy hockey stat IDs)
  // These may vary by league settings, but these are common defaults
  // Note: ESPN uses different stat IDs for different leagues, we may need to map dynamically
  const statMap: Record<number, string> = {
    0: 'gamesPlayed',
    1: 'goals',
    2: 'assists',
    3: 'points',
    4: 'plusMinus',
    5: 'pim',
    6: 'powerPlayPoints',
    7: 'shotsOnGoal',
    8: 'hits',
    9: 'blockedShots',
    10: 'faceoffsWon',
    // Goalie stats
    20: 'wins',
    21: 'losses',
    22: 'otLosses',
    23: 'saves',
    24: 'goalsAgainst',
    25: 'shutouts',
    26: 'savePct',
    27: 'gaa',
  }

  const normalized: any = {
    gamesPlayed: 0,
    goals: 0,
    assists: 0,
    points: 0,
    plusMinus: 0,
    pim: 0,
    powerPlayPoints: 0,
    shotsOnGoal: 0,
    hits: 0,
    blockedShots: 0,
    faceoffsWon: 0,
    wins: 0,
    losses: 0,
    otLosses: 0,
    saves: 0,
    goalsAgainst: 0,
    shutouts: 0,
    savePct: 0,
    gaa: 0,
  }

  // Extract stats from ESPN format
  let foundStats = 0
  for (const [key, value] of Object.entries(statsObj)) {
    const statId = parseInt(key)
    const statName = statMap[statId]
    if (statName && typeof value === 'number') {
      normalized[statName] = value
      foundStats++
    } else if (typeof value === 'number' && value !== 0) {
      // Log unmapped stat IDs for debugging
      console.log(`[ESPN Stats] Unmapped stat ID ${statId} with value ${value}`)
    }
  }

  console.log(`[ESPN Stats] Mapped ${foundStats} stats from ESPN format`)

  // Calculate save percentage if we have saves and goals against
  if (normalized.saves > 0 || normalized.goalsAgainst > 0) {
    const totalShots = normalized.saves + normalized.goalsAgainst
    if (totalShots > 0) {
      normalized.savePct = (normalized.saves / totalShots) * 100
    }
  }

  // Calculate GAA if we have goals against and games played
  if (normalized.goalsAgainst > 0 && normalized.gamesPlayed > 0) {
    normalized.gaa = normalized.goalsAgainst / normalized.gamesPlayed
  }

  return normalized
}

async function fetchEspnTeam(teamRef: TeamReference): Promise<NormalizedTeam> {
  if (!teamRef.leagueId) {
    throw new Error('leagueId is required to analyze ESPN teams')
  }

  const params = new URLSearchParams({ leagueId: teamRef.leagueId })
  if (teamRef.season) {
    params.set('season', teamRef.season)
  }

  const response = await fetch(`${INTERNAL_API_BASE_URL}/api/fantasy/espn-teams?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Matchup-Analyzer': 'true',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Failed to load ESPN teams (${response.status}): ${errorBody}`)
  }

  const data = await response.json()
  const teams: any[] = Array.isArray(data.teams) ? data.teams : []

  const match = teams.find(team => {
    const possibleIds = [
      team.teamId,
      team.team_id,
      team.id,
      team.teamName,
      team.abbrev,
    ]
    return possibleIds.some(id => id?.toString?.() === teamRef.id)
  })

  if (!match) {
    throw new Error(`ESPN team ${teamRef.id} not found in league ${teamRef.leagueId}`)
  }

  const roster: NormalizedRosterEntry[] = Array.isArray(match.roster)
    ? await Promise.all(
        match.roster.map(async (player: any, index: number) => {
          const rawId = player.playerId ?? player.id ?? `${match.teamId}-${index}`
          const parsedId = Number(rawId)
          const nhlId = Number.isFinite(parsedId) && parsedId > 0 ? parsedId : index + 1_000_000
          const position =
            (typeof player.defaultPosition === 'string' && player.defaultPosition.trim()) ||
            (typeof player.defaultPositionAbbrev === 'string' && player.defaultPositionAbbrev.trim()) ||
            'N/A'
          
          // Extract stats from ESPN player data
          let stats = extractEspnStats(player)
          
          // If ESPN stats extraction failed, try to get stats from database
          if (!stats || Object.values(stats).every(v => v === 0)) {
            try {
              const dbPlayer = await prisma.player.findUnique({
                where: { nhlId },
                include: {
                  stats: {
                    where: {
                      season: teamRef.season || '20252026',
                      gameType: 'regular',
                    },
                    take: 1,
                  },
                },
              })
              if (dbPlayer?.stats?.[0]) {
                stats = dbPlayer.stats[0]
                console.log(`[ESPN Stats] Using database stats for ${player.fullName || player.name}`)
              }
            } catch (err) {
              console.error(`[ESPN Stats] Error fetching DB stats for player ${nhlId}:`, err)
            }
          }
          
          return {
            nhlId,
            fullName: player.fullName ?? player.name ?? player.displayName ?? 'Unknown Player',
            team: player.proTeamAbbrev ?? player.proTeamName ?? null,
            position,
            slotPosition: player.lineupSlot ?? player.slotPosition ?? null,
            stats,
          }
        })
      )
    : []

  return {
    id: match.teamId?.toString?.() ?? teamRef.id,
    teamName: match.teamName ?? `Team ${teamRef.id}`,
    roster,
  }
}

/**
 * Analyze matchup with ML projections for upcoming week
 */
export async function analyzeWeeklyMatchupWithProjections(
  team1Input: TeamReference | string,
  team2Input: TeamReference | string,
  weekStartDate?: Date,
  standingsData?: any[]
): Promise<MatchupComparison> {
  // First get the base matchup analysis (current stats)
  const baseAnalysis = await analyzeWeeklyMatchup(
    team1Input,
    team2Input,
    weekStartDate,
    standingsData
  );

  // Build mapping from NHL IDs (used in matchup analysis) to internal DB player IDs (used in ML dataset)
  const allNhlIds = Array.from(
    new Set([
      ...baseAnalysis.team1.playerBreakdown.map(p => p.playerId).filter((id): id is number => !!id),
      ...baseAnalysis.team2.playerBreakdown.map(p => p.playerId).filter((id): id is number => !!id),
    ]),
  );

  let nhlIdToDbId = new Map<number, number>();
  if (allNhlIds.length > 0) {
    try {
      const dbPlayers = await prisma.player.findMany({
        where: {
          nhlId: { in: allNhlIds },
        },
        select: {
          id: true,
          nhlId: true,
        },
      });

      nhlIdToDbId = new Map(dbPlayers.map(p => [p.nhlId, p.id]));

      console.log('[Matchup Projections] NHL->DB ID map:', {
        totalNhlIds: allNhlIds.length,
        mapped: nhlIdToDbId.size,
        sample: allNhlIds.slice(0, 5).map(id => ({
          nhlId: id,
          dbId: nhlIdToDbId.get(id),
        })),
      });
    } catch (e) {
      console.error('[Matchup Projections] Failed to build NHL->DB ID map:', e);
    }
  }

  // Prepare prediction requests for all player games in the week
  const predictionRequests: Array<{
    playerId: number;
    gameDate: string;
    opponentTeam: string;
    playerTeam: string;
    isHome: boolean;
  }> = [];

  // Filter to only future games (games >= weekStartDate if provided, otherwise >= today)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let cutoffDate: Date;
  if (weekStartDate) {
    cutoffDate = new Date(weekStartDate);
    cutoffDate.setHours(0, 0, 0, 0);
    // Don't filter out games that are in the past relative to today if weekStartDate is provided
    // We want to predict all games in the selected week
  } else {
    cutoffDate = today;
  }
  
  console.log(`[Matchup Projections] Date filtering - today: ${today.toISOString().split('T')[0]}, weekStart: ${weekStartDate ? new Date(weekStartDate).toISOString().split('T')[0] : 'not provided'}, cutoff: ${cutoffDate.toISOString().split('T')[0]}`);

  // Collect games for team1 players (only future games)
  let totalGamesBeforeFilter = 0;
  for (const player of baseAnalysis.team1.playerBreakdown) {
    if (player.games && player.games.length > 0 && player.nhlTeam) {
      totalGamesBeforeFilter += player.games.length;
      const nhlId = player.playerId;
      const dbId = nhlIdToDbId.get(nhlId);
      if (!dbId) {
        console.warn(`[Matchup Projections] No DB player.id for nhlId=${nhlId} (team1), skipping predictions for this player`);
        continue;
      }
      for (const game of player.games) {
        const gameDate = new Date(game.date + 'T00:00:00');
        gameDate.setHours(0, 0, 0, 0);
        // Only include games on or after the cutoff date
        if (gameDate >= cutoffDate) {
          predictionRequests.push({
            playerId: dbId,
            gameDate: game.date,
            opponentTeam: game.opponent,
            playerTeam: player.nhlTeam,
            isHome: game.isHome,
          });
        }
      }
    }
  }
  
  for (const player of baseAnalysis.team2.playerBreakdown) {
    if (player.games && player.games.length > 0 && player.nhlTeam) {
      totalGamesBeforeFilter += player.games.length;
      const nhlId = player.playerId;
      const dbId = nhlIdToDbId.get(nhlId);
      if (!dbId) {
        console.warn(`[Matchup Projections] No DB player.id for nhlId=${nhlId} (team2), skipping predictions for this player`);
        continue;
      }
      for (const game of player.games) {
        const gameDate = new Date(game.date + 'T00:00:00');
        gameDate.setHours(0, 0, 0, 0);
        // Only include games on or after the cutoff date
        if (gameDate >= cutoffDate) {
          predictionRequests.push({
            playerId: dbId,
            gameDate: game.date,
            opponentTeam: game.opponent,
            playerTeam: player.nhlTeam,
            isHome: game.isHome,
          });
        }
      }
    }
  }
  
  console.log(`[Matchup Projections] Total games before filtering: ${totalGamesBeforeFilter}, After filtering: ${predictionRequests.length}`);

  // Collect games for team2 players (only future games)
  for (const player of baseAnalysis.team2.playerBreakdown) {
    if (player.games && player.games.length > 0 && player.nhlTeam) {
      for (const game of player.games) {
        const gameDate = new Date(game.date + 'T00:00:00');
        gameDate.setHours(0, 0, 0, 0);
        // Only include games on or after the cutoff date
        if (gameDate >= cutoffDate) {
          predictionRequests.push({
            playerId: player.playerId,
            gameDate: game.date,
            opponentTeam: game.opponent,
            playerTeam: player.nhlTeam,
            isHome: game.isHome,
          });
        } else {
          console.log(`[Matchup Projections] Filtered out past game: ${game.date} (cutoff: ${cutoffDate.toISOString().split('T')[0]})`);
        }
      }
    }
  }

  // If no games to predict, return base analysis without projections
  if (predictionRequests.length === 0) {
    console.warn(`[Matchup Projections] No future games found to predict. Cutoff date: ${cutoffDate.toISOString().split('T')[0]}`);
    console.warn(`[Matchup Projections] Team1 players: ${baseAnalysis.team1.playerBreakdown.length}, Team2 players: ${baseAnalysis.team2.playerBreakdown.length}`);
    return baseAnalysis;
  }
  
  console.log(`[Matchup Projections] Filtered to ${predictionRequests.length} future games (cutoff: ${cutoffDate.toISOString().split('T')[0]})`);

  // Call batch prediction API
  let team1ProjectedStats: TeamStats = {
    goals: 0,
    assists: 0,
    points: 0,
    plusMinus: 0,
    pim: 0,
    powerPlayPoints: 0,
    shotsOnGoal: 0,
    hits: 0,
    blockedShots: 0,
    wins: 0,
    shutouts: 0,
    saves: 0,
    goalsAgainst: 0,
    gaa: 0,
    savePct: 0,
  };

  let team2ProjectedStats: TeamStats = { ...team1ProjectedStats };

  try {
    console.log(`[Matchup Projections] Making batch prediction request for ${predictionRequests.length} player-game combinations`);
    console.log(`[Matchup Projections] Sample request:`, predictionRequests.slice(0, 2));
    
    // Use relative URL for same-origin requests (works in both dev and prod)
    // Only use absolute URL if we're in a server-to-server context
    const apiUrl = typeof window === 'undefined' 
      ? `${INTERNAL_API_BASE_URL}/api/ml-projections/matchup`
      : '/api/ml-projections/matchup';
    
    console.log(`[Matchup Projections] Calling API: ${apiUrl}`);
    console.log(`[Matchup Projections] INTERNAL_API_BASE_URL: ${INTERNAL_API_BASE_URL}`);
    console.log(`[Matchup Projections] Is server-side: ${typeof window === 'undefined'}`);
    console.log(`[Matchup Projections] Request count: ${predictionRequests.length}`);
    
    let response: Response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          predictions: predictionRequests,
        }),
        cache: 'no-store',
      });
      console.log(`[Matchup Projections] Response status: ${response.status} ${response.statusText}`);
    } catch (fetchError: any) {
      console.error(`[Matchup Projections] Fetch failed:`, fetchError);
      console.error(`[Matchup Projections] Fetch error details:`, {
        message: fetchError.message,
        stack: fetchError.stack,
        name: fetchError.name,
      });
      // Return base analysis without projections if fetch fails
      return baseAnalysis;
    }

    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      let errorText = '';
      try {
        if (contentType?.includes('application/json')) {
          const errorJson = await response.json();
          errorText = JSON.stringify(errorJson);
        } else {
          const text = await response.text();
          // If we got HTML, it's likely an error page
          if (text.includes('<!DOCTYPE') || text.includes('<html')) {
            errorText = `Server returned HTML error page (status ${response.status}). Check server logs.`;
          } else {
            errorText = text.substring(0, 500);
          }
        }
      } catch (e: any) {
        errorText = `Failed to read error response: ${e.message}`;
      }
      console.error(`[Matchup Projections] API returned ${response.status}:`, errorText);
      // Return base analysis without projections if API fails
      return baseAnalysis;
    }
    
    // Verify we got JSON
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      const text = await response.text();
      console.error(`[Matchup Projections] Expected JSON but got ${contentType}. Response preview:`, text.substring(0, 200));
      // Return base analysis without projections
      return baseAnalysis;
    }

    const data = await response.json();
    const predictions = data.predictions || [];
    const errors = data.errors || [];
    
    console.log(`[Matchup Projections] Received ${predictions.length} predictions from API`);
    if (errors.length > 0) {
      console.warn(`[Matchup Projections] API returned ${errors.length} errors:`, errors);
    }
    if (predictions.length === 0) {
      console.warn(`[Matchup Projections] No predictions returned. Errors:`, errors);
      console.warn(`[Matchup Projections] Full API response:`, JSON.stringify(data, null, 2));
    }

    // Create a map of player-game predictions
    const predictionMap = new Map<string, any>();
    let emptyStatsCount = 0;
    let nonZeroStatsCount = 0;
    for (const pred of predictions) {
      const key = `${pred.playerId}-${pred.gameDate}`;
      const stats = pred.stats || {};
      predictionMap.set(key, stats);
      
      // Check if stats are all zeros
      const hasNonZero = Object.values(stats).some((v: any) => typeof v === 'number' && v !== 0);
      if (hasNonZero) {
        nonZeroStatsCount++;
      } else {
        emptyStatsCount++;
        if (emptyStatsCount <= 5) { // Only log first 5 to avoid spam
          console.warn(`[Matchup Projections] All-zero stats for player ${pred.playerId} on ${pred.gameDate}`);
        }
      }
    }
    
    console.log(`[Matchup Projections] Created prediction map with ${predictionMap.size} entries`);
    console.log(`[Matchup Projections] Non-zero predictions: ${nonZeroStatsCount}, Zero predictions: ${emptyStatsCount}`);

    // Aggregate projections per player, then per team
    // Team 1 players
    let team1PredCount = 0;
    let team1ZeroCount = 0;
    for (const player of baseAnalysis.team1.playerBreakdown) {
      if (player.games && player.games.length > 0) {
        for (const game of player.games) {
          const key = `${player.playerId}-${game.date}`;
          const gamePred = predictionMap.get(key);
          
          if (gamePred) {
            team1PredCount++;
            const hasNonZero = Object.values(gamePred).some((v: any) => typeof v === 'number' && v !== 0);
            if (!hasNonZero) team1ZeroCount++;
            // Aggregate skater stats
            team1ProjectedStats.goals += gamePred.goals || 0;
            team1ProjectedStats.assists += gamePred.assists || 0;
            team1ProjectedStats.points += gamePred.points || 0;
            team1ProjectedStats.plusMinus += gamePred.plusMinus || 0;
            team1ProjectedStats.pim += gamePred.pim || 0;
            team1ProjectedStats.powerPlayPoints += gamePred.powerPlayPoints || 0;
            team1ProjectedStats.shotsOnGoal += gamePred.shotsOnGoal || 0;
            team1ProjectedStats.hits += gamePred.hits || 0;
            team1ProjectedStats.blockedShots += gamePred.blocks || 0;
            
            // Aggregate goalie stats
            if (player.position === 'G') {
              team1ProjectedStats.wins += gamePred.wins || 0;
              team1ProjectedStats.shutouts += gamePred.shutouts || 0;
              team1ProjectedStats.saves += gamePred.saves || 0;
              team1ProjectedStats.goalsAgainst += gamePred.goalsAgainst || 0;
            }
          }
        }
      }
    }

    // Team 2 players
    let team2PredCount = 0;
    let team2ZeroCount = 0;
    for (const player of baseAnalysis.team2.playerBreakdown) {
      if (player.games && player.games.length > 0) {
        for (const game of player.games) {
          const key = `${player.playerId}-${game.date}`;
          const gamePred = predictionMap.get(key);
          
          if (gamePred) {
            team2PredCount++;
            const hasNonZero = Object.values(gamePred).some((v: any) => typeof v === 'number' && v !== 0);
            if (!hasNonZero) team2ZeroCount++;
            // Aggregate skater stats
            team2ProjectedStats.goals += gamePred.goals || 0;
            team2ProjectedStats.assists += gamePred.assists || 0;
            team2ProjectedStats.points += gamePred.points || 0;
            team2ProjectedStats.plusMinus += gamePred.plusMinus || 0;
            team2ProjectedStats.pim += gamePred.pim || 0;
            team2ProjectedStats.powerPlayPoints += gamePred.powerPlayPoints || 0;
            team2ProjectedStats.shotsOnGoal += gamePred.shotsOnGoal || 0;
            team2ProjectedStats.hits += gamePred.hits || 0;
            team2ProjectedStats.blockedShots += gamePred.blocks || 0;
            
            // Aggregate goalie stats
            if (player.position === 'G') {
              team2ProjectedStats.wins += gamePred.wins || 0;
              team2ProjectedStats.shutouts += gamePred.shutouts || 0;
              team2ProjectedStats.saves += gamePred.saves || 0;
              team2ProjectedStats.goalsAgainst += gamePred.goalsAgainst || 0;
            }
          }
        }
      }
    }

    // Calculate goalie averages for team projections
    const team1GoalieGames = baseAnalysis.team1.playerBreakdown
      .filter(p => p.position === 'G' && p.gamesCount > 0)
      .reduce((sum, p) => sum + p.gamesCount, 0);
    const team2GoalieGames = baseAnalysis.team2.playerBreakdown
      .filter(p => p.position === 'G' && p.gamesCount > 0)
      .reduce((sum, p) => sum + p.gamesCount, 0);

    if (team1GoalieGames > 0) {
      team1ProjectedStats.gaa = team1ProjectedStats.goalsAgainst / team1GoalieGames;
      const totalShots = team1ProjectedStats.saves + team1ProjectedStats.goalsAgainst;
      team1ProjectedStats.savePct = totalShots > 0 ? (team1ProjectedStats.saves / totalShots) * 100 : 0;
    }

    if (team2GoalieGames > 0) {
      team2ProjectedStats.gaa = team2ProjectedStats.goalsAgainst / team2GoalieGames;
      const totalShots = team2ProjectedStats.saves + team2ProjectedStats.goalsAgainst;
      team2ProjectedStats.savePct = totalShots > 0 ? (team2ProjectedStats.saves / totalShots) * 100 : 0;
    }

    // Calculate projected category wins
    let team1Wins = 0;
    let team2Wins = 0;

    // Skater stats (higher is better)
    if (team1ProjectedStats.goals > team2ProjectedStats.goals) team1Wins++;
    else if (team2ProjectedStats.goals > team1ProjectedStats.goals) team2Wins++;

    if (team1ProjectedStats.assists > team2ProjectedStats.assists) team1Wins++;
    else if (team2ProjectedStats.assists > team1ProjectedStats.assists) team2Wins++;

    if (team1ProjectedStats.points > team2ProjectedStats.points) team1Wins++;
    else if (team2ProjectedStats.points > team1ProjectedStats.points) team2Wins++;

    if (team1ProjectedStats.plusMinus > team2ProjectedStats.plusMinus) team1Wins++;
    else if (team2ProjectedStats.plusMinus > team1ProjectedStats.plusMinus) team2Wins++;

    if (team1ProjectedStats.pim > team2ProjectedStats.pim) team1Wins++;
    else if (team2ProjectedStats.pim > team1ProjectedStats.pim) team2Wins++;

    if (team1ProjectedStats.powerPlayPoints > team2ProjectedStats.powerPlayPoints) team1Wins++;
    else if (team2ProjectedStats.powerPlayPoints > team1ProjectedStats.powerPlayPoints) team2Wins++;

    if (team1ProjectedStats.shotsOnGoal > team2ProjectedStats.shotsOnGoal) team1Wins++;
    else if (team2ProjectedStats.shotsOnGoal > team1ProjectedStats.shotsOnGoal) team2Wins++;

    if (team1ProjectedStats.hits > team2ProjectedStats.hits) team1Wins++;
    else if (team2ProjectedStats.hits > team1ProjectedStats.hits) team2Wins++;

    if (team1ProjectedStats.blockedShots > team2ProjectedStats.blockedShots) team1Wins++;
    else if (team2ProjectedStats.blockedShots > team1ProjectedStats.blockedShots) team2Wins++;

    // Goalie stats
    if (team1ProjectedStats.wins > team2ProjectedStats.wins) team1Wins++;
    else if (team2ProjectedStats.wins > team1ProjectedStats.wins) team2Wins++;

    if (team1ProjectedStats.shutouts > team2ProjectedStats.shutouts) team1Wins++;
    else if (team2ProjectedStats.shutouts > team1ProjectedStats.shutouts) team2Wins++;

    if (team1ProjectedStats.savePct > team2ProjectedStats.savePct) team1Wins++;
    else if (team2ProjectedStats.savePct > team1ProjectedStats.savePct) team2Wins++;

    // GAA (lower is better)
    if (team1ProjectedStats.gaa > 0 && team2ProjectedStats.gaa > 0) {
      if (team1ProjectedStats.gaa < team2ProjectedStats.gaa) team1Wins++;
      else if (team2ProjectedStats.gaa < team1ProjectedStats.gaa) team2Wins++;
    }

    console.log(`[Matchup Projections] Calculated projections - Team1 wins: ${team1Wins}, Team2 wins: ${team2Wins}`);
    console.log(`[Matchup Projections] Team1 predictions: ${team1PredCount} total, ${team1ZeroCount} zeros`);
    console.log(`[Matchup Projections] Team2 predictions: ${team2PredCount} total, ${team2ZeroCount} zeros`);
    console.log(`[Matchup Projections] Sample Team1 stats:`, {
      goals: team1ProjectedStats.goals,
      assists: team1ProjectedStats.assists,
      points: team1ProjectedStats.points,
    });
    console.log(`[Matchup Projections] Sample Team2 stats:`, {
      goals: team2ProjectedStats.goals,
      assists: team2ProjectedStats.assists,
      points: team2ProjectedStats.points,
    });
    
    return {
      ...baseAnalysis,
      projections: {
        team1: team1ProjectedStats,
        team2: team2ProjectedStats,
        categoryWins: {
          team1: team1Wins,
          team2: team2Wins,
        },
      },
    };
  } catch (error: any) {
    console.error('[Matchup Projections] Error fetching projections:', error);
    // Return base analysis without projections if error occurs
    return baseAnalysis;
  }
}

