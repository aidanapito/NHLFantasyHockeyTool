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

export interface PlayerGameCount {
  playerId: number;
  playerName: string;
  nhlTeam: string | null;
  gamesCount: number;
  gameDates: string[]; // Dates when the player's team plays
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
        nhlTeam: null,
        gamesCount: 0,
        gameDates: [],
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
      }
    })

    playerBreakdown.push({
      playerId: rosterEntry.nhlId,
      playerName: rosterEntry.fullName,
      nhlTeam: rosterEntry.team,
      gamesCount: playerUniqueGames.size, // Count of unique games for this player's team
      gameDates: playerGameDates,
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

  for (const rosterEntry of activeRoster) {
    const stats = rosterEntry.stats

    if (!stats) continue

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
 * Analyze matchup between two fantasy teams for a given week
 */
export async function analyzeWeeklyMatchup(
  team1Input: TeamReference | string,
  team2Input: TeamReference | string,
  weekStartDate?: Date
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

  const roster: NormalizedRosterEntry[] = team.roster.map(entry => ({
    nhlId: entry.player.nhlId,
    fullName: entry.player.fullName,
    team: entry.player.team,
    position: entry.player.position,
    slotPosition: entry.slotPosition,
    stats: entry.player.stats?.[0] ?? null,
  }))

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

