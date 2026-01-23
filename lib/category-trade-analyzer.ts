/**
 * Category-Based Trade Analyzer
 * 
 * Analyzes fantasy hockey trades based on category contributions
 * in a categories league (where you need to win categories, not total points).
 * 
 * Categories: G, A, +/-, PIM, PPP, SOG, HIT, BLK, FOW, W, SO, SV%, GAA
 */

import { prisma } from './prisma'
import { CategoryCode, CategoryDefinition, CategoryStats, CategoryPlayerValue, CategoryTradeAnalysis, CategoryTradeAnalysisInput, CategoryTradeSide, CategoryAnalysis, CategoryImpact } from '@/types/category-trade'
import { computeRosStrengthOfSchedule, TeamScheduleStats } from './strength-of-schedule'
import { calculateSkaterZScore, calculateGoalieZScore } from './z-score-calculator'

// Types matching z-score-calculator
interface SkaterStatsForZScore {
  goals: number
  assists: number
  plusMinus: number
  penaltyMinutes: number
  ppPoints?: number
  faceoffsWon?: number
  shots: number
  hits?: number
  blockedShots?: number
  gamesPlayed: number
}

interface GoalieStatsForZScore {
  wins?: number
  shutouts?: number
  goalsAgainstAverage?: number
  savePct?: number
  gamesPlayed: number
}

/**
 * Category definitions for the 13 categories
 */
export const CATEGORY_DEFINITIONS: Record<CategoryCode, CategoryDefinition> = {
  G: { code: 'G', displayName: 'Goals', statKey: 'goals', isGoalieCategory: false, higherIsBetter: true },
  A: { code: 'A', displayName: 'Assists', statKey: 'assists', isGoalieCategory: false, higherIsBetter: true },
  '±': { code: '±', displayName: 'Plus/Minus', statKey: 'plusMinus', isGoalieCategory: false, higherIsBetter: true },
  PIM: { code: 'PIM', displayName: 'Penalty Minutes', statKey: 'pim', isGoalieCategory: false, higherIsBetter: true },
  PPP: { code: 'PPP', displayName: 'Power Play Points', statKey: 'powerPlayPoints', isGoalieCategory: false, higherIsBetter: true },
  SOG: { code: 'SOG', displayName: 'Shots on Goal', statKey: 'shotsOnGoal', isGoalieCategory: false, higherIsBetter: true },
  HIT: { code: 'HIT', displayName: 'Hits', statKey: 'hits', isGoalieCategory: false, higherIsBetter: true },
  BLK: { code: 'BLK', displayName: 'Blocks', statKey: 'blockedShots', isGoalieCategory: false, higherIsBetter: true },
  FOW: { code: 'FOW', displayName: 'Faceoffs Won', statKey: 'faceoffsWon', isGoalieCategory: false, higherIsBetter: true },
  W: { code: 'W', displayName: 'Goalie Wins', statKey: 'wins', isGoalieCategory: true, higherIsBetter: true },
  SO: { code: 'SO', displayName: 'Goalie Shutouts', statKey: 'shutouts', isGoalieCategory: true, higherIsBetter: true },
  'SV%': { code: 'SV%', displayName: 'Goalie Save %', statKey: 'savePct', isGoalieCategory: true, higherIsBetter: true },
  GAA: { code: 'GAA', displayName: 'Goalie Goals Against Avg', statKey: 'gaa', isGoalieCategory: true, higherIsBetter: false },
}

/**
 * All category codes (skater first, then goalie)
 */
export const ALL_CATEGORIES: CategoryCode[] = [
  'G', 'A', '±', 'PIM', 'PPP', 'SOG', 'HIT', 'BLK', 'FOW',  // Skater categories
  'W', 'SO', 'SV%', 'GAA'  // Goalie categories
]

/**
 * Skater categories
 */
export const SKATER_CATEGORIES: CategoryCode[] = ['G', 'A', '±', 'PIM', 'PPP', 'SOG', 'HIT', 'BLK', 'FOW']

/**
 * Goalie categories
 */
export const GOALIE_CATEGORIES: CategoryCode[] = ['W', 'SO', 'SV%', 'GAA']

/**
 * Get category value from player stats
 */
function getCategoryValue(stats: any, category: CategoryCode): number {
  const definition = CATEGORY_DEFINITIONS[category]
  const value = stats[definition.statKey] ?? 0
  
  // Handle special cases
  if (category === 'SV%' && stats.savePct) {
    return stats.savePct // Already a percentage
  }
  
  return value || 0
}

/**
 * Convert player stats to category stats
 */
export function playerStatsToCategoryStats(stats: any, gamesPlayed: number): CategoryStats {
  return {
    G: stats.goals || 0,
    A: stats.assists || 0,
    '±': stats.plusMinus || 0,
    PIM: stats.pim || 0,
    PPP: stats.powerPlayPoints || 0,
    SOG: stats.shotsOnGoal || stats.shots || 0,
    HIT: stats.hits || 0,
    BLK: stats.blockedShots || 0,
    FOW: stats.faceoffsWon || 0,
    W: stats.wins || 0,
    SO: stats.shutouts || 0,
    'SV%': stats.savePct || 0,
    GAA: stats.gaa || 0,
  }
}

/**
 * Calculate mean of an array
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((acc, val) => acc + val, 0) / values.length
}

/**
 * Calculate standard deviation
 */
function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0
  const avg = mean(values)
  const squareDiffs = values.map(val => Math.pow(val - avg, 2))
  return Math.sqrt(mean(squareDiffs))
}

/**
 * Calculate Z-score for a value
 */
function zScore(value: number, mean: number, stdDev: number, invert: boolean = false): number {
  if (stdDev === 0 || isNaN(value) || !isFinite(value)) return 0
  const z = (value - mean) / stdDev
  return invert ? -z : z
}

/**
 * Calculate per-category Z-scores for a skater (returns individual category Z-scores)
 */
function calculateSkaterCategoryZScores(
  player: SkaterStatsForZScore,
  allPlayers: SkaterStatsForZScore[]
): Record<CategoryCode, number> {
  const result: Record<CategoryCode, number> = {
    G: 0, A: 0, '±': 0, PIM: 0, PPP: 0, SOG: 0, HIT: 0, BLK: 0, FOW: 0,
    W: 0, SO: 0, 'SV%': 0, GAA: 0,
  }
  
  const validPlayers = allPlayers.filter(p => p.gamesPlayed > 0)
  if (validPlayers.length === 0 || player.gamesPlayed === 0) return result
  
  const calculateRate = (stat: number, gp: number) => gp > 0 ? stat / gp : 0
  const mean = (arr: number[]) => arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length
  const stdDev = (arr: number[]) => {
    if (arr.length === 0) return 0
    const m = mean(arr)
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length)
  }
  const zScore = (val: number, arr: number[]) => {
    const s = stdDev(arr)
    return s === 0 ? 0 : (val - mean(arr)) / s
  }
  
  // Calculate per-game rates for all players
  const goalsPerGame = validPlayers.map(p => calculateRate(p.goals, p.gamesPlayed))
  const assistsPerGame = validPlayers.map(p => calculateRate(p.assists, p.gamesPlayed))
  const plusMinusPerGame = validPlayers.map(p => calculateRate(p.plusMinus, p.gamesPlayed))
  const pimPerGame = validPlayers.map(p => calculateRate(p.penaltyMinutes, p.gamesPlayed))
  const pppPerGame = validPlayers.map(p => calculateRate(p.ppPoints || 0, p.gamesPlayed))
  const fowPerGame = validPlayers.map(p => calculateRate(p.faceoffsWon || 0, p.gamesPlayed))
  const sogPerGame = validPlayers.map(p => calculateRate(p.shots, p.gamesPlayed))
  const hitsPerGame = validPlayers.map(p => calculateRate(p.hits || 0, p.gamesPlayed))
  const blkPerGame = validPlayers.map(p => calculateRate(p.blockedShots || 0, p.gamesPlayed))
  
  // Calculate player's per-game rates
  const playerGoalsPerGame = calculateRate(player.goals, player.gamesPlayed)
  const playerAssistsPerGame = calculateRate(player.assists, player.gamesPlayed)
  const playerPlusMinusPerGame = calculateRate(player.plusMinus, player.gamesPlayed)
  const playerPimPerGame = calculateRate(player.penaltyMinutes, player.gamesPlayed)
  const playerPppPerGame = calculateRate(player.ppPoints || 0, player.gamesPlayed)
  const playerFowPerGame = calculateRate(player.faceoffsWon || 0, player.gamesPlayed)
  const playerSogPerGame = calculateRate(player.shots, player.gamesPlayed)
  const playerHitsPerGame = calculateRate(player.hits || 0, player.gamesPlayed)
  const playerBlkPerGame = calculateRate(player.blockedShots || 0, player.gamesPlayed)
  
  // Calculate Z-scores for each category
  result.G = zScore(playerGoalsPerGame, goalsPerGame)
  result.A = zScore(playerAssistsPerGame, assistsPerGame)
  result['±'] = zScore(playerPlusMinusPerGame, plusMinusPerGame)
  result.PIM = zScore(playerPimPerGame, pimPerGame)
  result.PPP = zScore(playerPppPerGame, pppPerGame)
  result.FOW = zScore(playerFowPerGame, fowPerGame)
  result.SOG = zScore(playerSogPerGame, sogPerGame)
  result.HIT = zScore(playerHitsPerGame, hitsPerGame)
  result.BLK = zScore(playerBlkPerGame, blkPerGame)
  
  return result
}

/**
 * Calculate per-category Z-scores for a goalie (returns individual category Z-scores)
 */
function calculateGoalieCategoryZScores(
  player: GoalieStatsForZScore,
  allGoalies: GoalieStatsForZScore[]
): Record<CategoryCode, number> {
  const result: Record<CategoryCode, number> = {
    G: 0, A: 0, '±': 0, PIM: 0, PPP: 0, SOG: 0, HIT: 0, BLK: 0, FOW: 0,
    W: 0, SO: 0, 'SV%': 0, GAA: 0,
  }
  
  const validGoalies = allGoalies.filter(p => p.gamesPlayed > 0)
  if (validGoalies.length === 0 || player.gamesPlayed === 0) return result
  
  const calculateRate = (stat: number, gp: number) => gp > 0 ? stat / gp : 0
  const mean = (arr: number[]) => arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length
  const stdDev = (arr: number[]) => {
    if (arr.length === 0) return 0
    const m = mean(arr)
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length)
  }
  const zScore = (val: number, arr: number[], invert: boolean = false) => {
    const s = stdDev(arr)
    if (s === 0) return 0
    const z = (val - mean(arr)) / s
    return invert ? -z : z
  }
  
  // Calculate per-game rates
  const winsPerGame = validGoalies.map(p => calculateRate(p.wins || 0, p.gamesPlayed))
  const shutoutsPerGame = validGoalies.map(p => calculateRate(p.shutouts || 0, p.gamesPlayed))
  const gaaValues = validGoalies.map(p => p.goalsAgainstAverage || 0).filter(g => g > 0)
  const svpctValues = validGoalies.map(p => p.savePct || 0).filter(s => s > 0)
  
  // Calculate player's rates
  const playerWinsPerGame = calculateRate(player.wins || 0, player.gamesPlayed)
  const playerShutoutsPerGame = calculateRate(player.shutouts || 0, player.gamesPlayed)
  const playerGaa = player.goalsAgainstAverage || 0
  const playerSvpct = player.savePct || 0
  
  // Calculate Z-scores (GAA is inverted - lower is better)
  result.W = zScore(playerWinsPerGame, winsPerGame)
  result.SO = zScore(playerShutoutsPerGame, shutoutsPerGame)
  result.GAA = playerGaa > 0 && gaaValues.length > 0 ? zScore(playerGaa, gaaValues, true) : 0
  result['SV%'] = playerSvpct > 0 && svpctValues.length > 0 ? zScore(playerSvpct, svpctValues) : 0
  
  return result
}

/**
 * OLD FUNCTION - Calculate per-category Z-scores for a player (DEPRECATED - use calculateSkaterCategoryZScores or calculateGoalieCategoryZScores)
 */
function calculateCategoryZScores_OLD(
  playerStats: CategoryStats,
  gamesPlayed: number,
  allPlayersStats: Array<{ stats: CategoryStats; gamesPlayed: number; position: string }>,
  playerPosition?: string
): Record<CategoryCode, number> {
  // Determine if player is a goalie based on position (most reliable) or stats
  const isGoalie = playerPosition === 'G' || 
                   playerPosition === 'G/LW' || 
                   playerPosition === 'G/RW' ||
                   (playerPosition === undefined && (playerStats.W > 0 || playerStats.SO > 0 || (playerStats['SV%'] > 0 && playerStats.GAA > 0)))
  
  // Filter players by position for fair comparison
  const relevantPlayers = isGoalie
    ? allPlayersStats.filter(p => p.stats.W > 0 || p.stats.SO > 0)
    : allPlayersStats.filter(p => p.stats.W === 0 && p.stats.SO === 0)
  
  const validPlayers = relevantPlayers.filter(p => p.gamesPlayed > 0)
  
  // Debug logging
  if (validPlayers.length === 0) {
    console.warn(`     ⚠️ No valid players found for Z-score calculation!`)
    console.warn(`        Player position: ${playerPosition}, Is goalie: ${isGoalie}`)
    console.warn(`        Total league players: ${allPlayersStats.length}`)
    console.warn(`        Relevant players (after position filter): ${relevantPlayers.length}`)
    console.warn(`        Valid players (with GP > 0): ${validPlayers.length}`)
    return ALL_CATEGORIES.reduce((acc, cat) => ({ ...acc, [cat]: 0 }), {} as Record<CategoryCode, number>)
  }
  
  if (gamesPlayed === 0) {
    console.warn(`     ⚠️ Player has 0 games played, cannot calculate Z-scores`)
    return ALL_CATEGORIES.reduce((acc, cat) => ({ ...acc, [cat]: 0 }), {} as Record<CategoryCode, number>)
  }
  
  const calculateRate = (stat: number, gp: number) => gp > 0 ? stat / gp : 0
  
  const result: Record<CategoryCode, number> = {} as any
  
  // Calculate Z-scores for each category
  for (const category of ALL_CATEGORIES) {
    const def = CATEGORY_DEFINITIONS[category]
    
    // Skip if this category doesn't apply to player type
    if (isGoalie && !def.isGoalieCategory) continue
    if (!isGoalie && def.isGoalieCategory) continue
    
    // Get per-game rates for all players
    const allRates = validPlayers.map(p => {
      const value = getCategoryValue(p.stats, category)
      // For percentages (SV%, GAA), use raw values
      if (category === 'SV%' || category === 'GAA') {
        return value
      }
      // For counting stats, use per-game rates
      return calculateRate(value, p.gamesPlayed)
    }).filter(v => v !== 0 && isFinite(v))
    
    if (allRates.length === 0) {
      result[category] = 0
      continue
    }
    
    // Calculate mean and std dev
    const catMean = mean(allRates)
    const catStdDev = standardDeviation(allRates)
    
    // Get player's value
    let playerValue = getCategoryValue(playerStats, category)
    if (category !== 'SV%' && category !== 'GAA') {
      playerValue = calculateRate(playerValue, gamesPlayed)
    }
    
    // Calculate Z-score (invert for GAA since lower is better)
    result[category] = zScore(playerValue, catMean, catStdDev, !def.higherIsBetter)
  }
  
  // Fill in zeros for non-applicable categories
  for (const category of ALL_CATEGORIES) {
    if (!(category in result)) {
      result[category] = 0
    }
  }
  
  return result
}

/**
 * Calculate category win contribution (estimated weekly category wins)
 * This estimates how often a player helps win each category in weekly matchups
 */
function calculateCategoryWinContribution(
  playerZScore: number,
  categoryZScore: number,
  leagueSize: number = 12
): number {
  // Estimate win contribution based on Z-score
  // A Z-score of 1 = roughly 84th percentile = wins category in ~84% of matchups vs average team
  // But in a league with 12 teams, you need to beat 11 other teams, so we adjust
  
  // Convert Z-score to percentile (using standard normal distribution approximation)
  // Z-score of 1 ≈ 84th percentile, 2 ≈ 98th percentile
  const percentile = 50 + (categoryZScore * 16.7) // Rough approximation: Z * 16.7 ≈ percentile points
  
  // In a league of size N, you need to be in top N-1 teams to win
  // Estimate: if you're in top X% of category, you win roughly X% of weeks (simplified)
  // Adjust for league size - need to be better than (N-1)/N teams
  const winThreshold = (leagueSize - 1) / leagueSize * 100 // e.g., 91.7% for 12-team league
  
  // If player's percentile is above threshold, they win most weeks
  // Below threshold, they lose most weeks
  if (percentile >= winThreshold) {
    return Math.min(1.0, 0.5 + ((percentile - winThreshold) / (100 - winThreshold)) * 0.5)
  } else {
    return Math.max(0.0, (percentile / winThreshold) * 0.5)
  }
}

/**
 * Get games remaining for a player's team
 */
async function getGamesRemaining(
  team: string,
  season: string,
  asOfDate: Date = new Date()
): Promise<number> {
  try {
    // Get the maximum games played for any player on this team
    // This represents how many games the team has played
    const teamMaxGames = await prisma.playerStats.findFirst({
      where: {
        season,
        gameType: 'regular',
        player: {
          team: team,
        },
      },
      select: {
        gamesPlayed: true,
      },
      orderBy: {
        gamesPlayed: 'desc', // Get the player with most games (represents team games played)
      },
    })
    
    if (!teamMaxGames || teamMaxGames.gamesPlayed === 0) {
      console.warn(`⚠️ No stats found for team ${team} in season ${season}`)
      return 0
    }
    
    // NHL regular season is 82 games
    const totalGamesInSeason = 82
    const gamesRemaining = Math.max(0, totalGamesInSeason - teamMaxGames.gamesPlayed)
    
    console.log(`   Team ${team}: ${teamMaxGames.gamesPlayed} games played, ${gamesRemaining} games remaining`)
    return gamesRemaining
  } catch (error) {
    console.error(`Error getting games remaining for ${team}:`, error)
    return 0
  }
}

/**
 * Calculate strength of schedule for a player's team
 */
async function getStrengthOfSchedule(
  team: string,
  season: string,
  asOfDate: Date = new Date()
): Promise<number> {
  try {
    console.log(`   Calculating SOS for team: ${team}, season: ${season}`)
    
    // Try to get SOS from the strength-of-schedule module
    const sosData = await computeRosStrengthOfSchedule(season, asOfDate)
    
    console.log(`   SOS data map size: ${sosData.size}`)
    if (sosData.size > 0) {
      console.log(`   Available teams in SOS data: ${Array.from(sosData.keys()).slice(0, 5).join(', ')}...`)
    }
    
    let teamSos = sosData.get(team)
    
    // Try case-insensitive match if exact match failed
    if (!teamSos) {
      const teamLower = team.toLowerCase()
      for (const [key, value] of sosData.entries()) {
        if (key.toLowerCase() === teamLower) {
          teamSos = value
          console.log(`   Found team with case-insensitive match: ${key}`)
          break
        }
      }
    }
    
    if (teamSos && teamSos.sosRating) {
      const sosRating = teamSos.sosRating
      console.log(`   Team ${team}: SOS rating ${sosRating.toFixed(1)}/100 (higher = easier)`)
      return sosRating
    }
    
    // Fallback: Since we don't have future schedule data in gameLog,
    // we'll calculate a simple SOS based on the team's recent opponents
    // This is a rough approximation until we can fetch the actual schedule
    console.warn(`⚠️ No SOS data from schedule module for team ${team}, using fallback calculation`)
    
    // For now, return 50 as a neutral value
    // TODO: Implement proper SOS by fetching schedule from NHL API or calculating
    // based on remaining games vs teams with known defensive stats
    console.warn(`   Using default SOS value (50) - future schedule data not available in gameLog`)
    console.warn(`   Note: gameLog only contains past games, not future scheduled games`)
    return 50 // Default middle value until we have proper schedule data
  } catch (error) {
    console.error(`Error calculating strength of schedule for ${team}:`, error)
    return 50 // Default middle value
  }
}

/**
 * Main function to analyze a category-based trade
 */
export async function analyzeCategoryTrade(
  input: CategoryTradeAnalysisInput
): Promise<CategoryTradeAnalysis> {
  const {
    sideA,
    sideB,
    sideAName,
    sideBName,
    season = '20252026',
    timePeriod = 'season',
    myTeamId,
    leagueId,
  } = input
  
  const analysisDate = new Date().toISOString()
  
  // Get all player NHL IDs
  const allPlayerIds = [
    ...sideA.map(p => p.nhlId),
    ...sideB.map(p => p.nhlId),
  ]
  
  // Determine date range based on time period
  let dateFilter: { gte?: Date } | undefined = undefined
  if (timePeriod === 'recent14') {
    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
    dateFilter = { gte: fourteenDaysAgo }
  } else if (timePeriod === 'recent30') {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    dateFilter = { gte: thirtyDaysAgo }
  }
  
  console.log(`\n🔍 Analyzing trade for ${sideA.length + sideB.length} players (season: ${season})`)
  console.log(`Player IDs: ${allPlayerIds.join(', ')}`)
  
  // Fetch all players first
  const dbPlayers = await prisma.player.findMany({
    where: {
      nhlId: { in: allPlayerIds },
    },
  })
  
  if (dbPlayers.length === 0) {
    throw new Error(`No players found in database for NHL IDs: ${allPlayerIds.join(', ')}`)
  }
  
  if (dbPlayers.length !== allPlayerIds.length) {
    const foundIds = dbPlayers.map(p => p.nhlId)
    const missingIds = allPlayerIds.filter(id => !foundIds.includes(id))
    console.warn(`⚠️ Some players not found in database: ${missingIds.join(', ')}`)
  }
  
  // Create player ID map for lookup
  const playerIdMap = new Map(dbPlayers.map(p => [p.nhlId.toString(), p.id]))
  
  // Fetch stats directly by playerId (more reliable than include)
  const playerIds = Array.from(playerIdMap.values())
  const allStats = await prisma.playerStats.findMany({
    where: {
      playerId: { in: playerIds },
      season,
      gameType: 'regular',
    },
  })
  
  // Create player stats map - map by NHL ID for easy lookup
  const playerStatsMap = new Map<string, any>()
  
  for (const player of dbPlayers) {
    // Find stats for this player
    const stats = allStats.find(s => s.playerId === player.id) || null
    playerStatsMap.set(player.nhlId.toString(), stats)
    
    if (!stats) {
      console.warn(`⚠️ Player ${player.firstName} ${player.lastName} (${player.nhlId}) has no stats for season ${season}`)
      // Try to find stats from any season as fallback
      const anySeasonStats = await prisma.playerStats.findFirst({
        where: {
          playerId: player.id,
          gameType: 'regular',
        },
        orderBy: {
          season: 'desc', // Get most recent season
        },
      })
      if (anySeasonStats) {
        console.log(`  → Found stats from season ${anySeasonStats.season} as fallback`)
        playerStatsMap.set(player.nhlId.toString(), anySeasonStats)
      }
    } else {
      console.log(`✓ Player ${player.firstName} ${player.lastName} (${player.nhlId}): ${stats.gamesPlayed} GP, G:${stats.goals || 0} A:${stats.assists || 0} P:${stats.points || 0}`)
    }
  }
  
  console.log(`Fetched ${dbPlayers.length} players, ${Array.from(playerStatsMap.values()).filter(s => s !== null).length} have stats`)
  
  // Get all league players for Z-score context (for now, use all players in season)
  // TODO: Could optimize to only use active roster players or league-specific players
  console.log(`\n📊 Fetching league-wide stats for Z-score context (season: ${season})...`)
  const allLeagueStats = await prisma.playerStats.findMany({
    where: {
      season,
      gameType: 'regular',
    },
    include: {
      player: {
        select: {
          position: true,
        },
      },
    },
    take: 1000, // Limit for performance - could be optimized
  })
  
  console.log(`Found ${allLeagueStats.length} total PlayerStats records for season ${season}`)
  
  // Prepare all players stats for Z-score calculation (using same format as z-score-calculator)
  const allSkatersForZScore: SkaterStatsForZScore[] = []
  const allGoaliesForZScore: GoalieStatsForZScore[] = []
  
  for (const ps of allLeagueStats) {
    if (ps.gamesPlayed === 0) continue
    
    const position = ps.player?.position || ''
    const isGoalie = position === 'G' || position.includes('G/')
    
    if (isGoalie) {
      allGoaliesForZScore.push({
        wins: ps.wins || 0,
        shutouts: ps.shutouts || 0,
        goalsAgainstAverage: ps.gaa || 0,
        savePct: ps.savePct || 0,
        gamesPlayed: ps.gamesPlayed,
      })
    } else {
      allSkatersForZScore.push({
        goals: ps.goals || 0,
        assists: ps.assists || 0,
        plusMinus: ps.plusMinus || 0,
        penaltyMinutes: ps.pim || 0,
        ppPoints: ps.powerPlayPoints || 0,
        faceoffsWon: ps.faceoffsWon || 0,
        shots: ps.shotsOnGoal || ps.shots || 0,
        hits: ps.hits || 0,
        blockedShots: ps.blockedShots || 0,
        gamesPlayed: ps.gamesPlayed,
      })
    }
  }
  
  console.log(`  → ${allSkatersForZScore.length} skaters, ${allGoaliesForZScore.length} goalies for Z-score context`)
  
  if (allSkatersForZScore.length === 0 && allGoaliesForZScore.length === 0) {
    console.error(`❌ ERROR: No players found with stats for season ${season}. Z-scores will all be 0.`)
    console.error(`   This means the trade analysis will not work correctly.`)
    console.error(`   Please ensure stats have been refreshed for season ${season}.`)
  } else if (allSkatersForZScore.length + allGoaliesForZScore.length < 50) {
    console.warn(`⚠️ WARNING: Only ${allSkatersForZScore.length + allGoaliesForZScore.length} players found. Z-scores may be inaccurate.`)
  }
  
  // Analyze each player
  const analyzePlayer = async (playerInput: { playerId: string; nhlId: number }): Promise<CategoryPlayerValue> => {
    const stats = playerStatsMap.get(playerInput.nhlId.toString())
    const dbPlayer = dbPlayers.find(p => p.nhlId === playerInput.nhlId)
    
    if (!dbPlayer) {
      throw new Error(`Player not found: ${playerInput.nhlId}`)
    }
    
    if (!stats) {
      console.warn(`No stats found for player ${playerInput.nhlId} (${dbPlayer.firstName} ${dbPlayer.lastName}) for season ${season}`)
    }
    
    const gamesPlayed = stats?.gamesPlayed || 0
    const categoryStats = playerStatsToCategoryStats(stats || {}, gamesPlayed)
    
    // Log for debugging
    console.log(`\n📊 Analyzing player: ${dbPlayer.firstName} ${dbPlayer.lastName} (${playerInput.nhlId})`)
    console.log(`   Position: ${dbPlayer.position}`)
    console.log(`   Games Played: ${gamesPlayed}`)
    console.log(`   Stats object:`, stats ? {
      goals: stats.goals,
      assists: stats.assists,
      points: stats.points,
      hits: stats.hits,
      shotsOnGoal: stats.shotsOnGoal,
      wins: stats.wins,
    } : 'null')
    console.log(`   Category Stats:`, {
      G: categoryStats.G,
      A: categoryStats.A,
      SOG: categoryStats.SOG,
      HIT: categoryStats.HIT,
      W: categoryStats.W,
    })
    
    if (!stats) {
      console.warn(`⚠️ No stats found for player ${dbPlayer.firstName} ${dbPlayer.lastName} (${playerInput.nhlId}) for season ${season}`)
    } else if (gamesPlayed === 0) {
      console.warn(`⚠️ Player ${dbPlayer.firstName} ${dbPlayer.lastName} (${playerInput.nhlId}) has 0 games played`)
    } else {
      console.log(`✓ Player ${dbPlayer.firstName} ${dbPlayer.lastName}: ${gamesPlayed} GP, ${categoryStats.G}G ${categoryStats.A}A ${(stats.points || categoryStats.G + categoryStats.A)}P`)
    }
    
    // If no stats or no games played, return zero values
    if (!stats || gamesPlayed === 0) {
      const zeroCategoryAnalysis: Record<CategoryCode, CategoryAnalysis> = {} as any
      for (const category of ALL_CATEGORIES) {
        zeroCategoryAnalysis[category] = {
          category,
          total: 0,
          perGame: 0,
          zScore: 0,
          winContribution: 0,
          rank: 0,
          percentile: 0,
        }
      }
      
      return {
        player: {
          id: playerInput.playerId,
          nhlId: playerInput.nhlId,
          name: `${dbPlayer.firstName} ${dbPlayer.lastName}`,
          position: dbPlayer.position,
          team: dbPlayer.team || '',
          stats: categoryStats,
        },
        stats: categoryStats,
        gamesPlayed: 0,
        gamesRemaining: 0,
        categoryAnalysis: zeroCategoryAnalysis,
        totalZScore: 0,
        totalWinContribution: 0,
        strengthOfSchedule: 50,
      }
    }
    
    // Calculate Z-scores using the same functions as the stats page
    console.log(`   Calculating Z-scores...`)
    const isGoalie = dbPlayer.position === 'G' || dbPlayer.position?.includes('G/')
    
    let totalZScore = 0
    const categoryZScores: Record<CategoryCode, number> = {} as any
    
    if (isGoalie) {
      // Use goalie Z-score calculator
      const goalieStats: GoalieStatsForZScore = {
        wins: stats?.wins || 0,
        shutouts: stats?.shutouts || 0,
        goalsAgainstAverage: stats?.gaa || 0,
        savePct: stats?.savePct || 0,
        gamesPlayed: gamesPlayed,
      }
      
      totalZScore = calculateGoalieZScore(goalieStats, allGoaliesForZScore)
      
      // For goalies, we can't easily break down per-category Z-scores from the existing function
      // So we'll use a simplified approach: distribute the total Z-score proportionally
      // Or we can calculate per-category manually for goalies
      const goalieCategoryZScores = calculateGoalieCategoryZScores(goalieStats, allGoaliesForZScore)
      Object.assign(categoryZScores, goalieCategoryZScores)
    } else {
      // Use skater Z-score calculator
      const skaterStats: SkaterStatsForZScore = {
        goals: stats?.goals || 0,
        assists: stats?.assists || 0,
        plusMinus: stats?.plusMinus || 0,
        penaltyMinutes: stats?.pim || 0,
        ppPoints: stats?.powerPlayPoints || 0,
        faceoffsWon: stats?.faceoffsWon || 0,
        shots: stats?.shotsOnGoal || stats?.shots || 0,
        hits: stats?.hits || 0,
        blockedShots: stats?.blockedShots || 0,
        gamesPlayed: gamesPlayed,
      }
      
      totalZScore = calculateSkaterZScore(skaterStats, allSkatersForZScore)
      
      // Calculate per-category Z-scores for skaters
      const skaterCategoryZScores = calculateSkaterCategoryZScores(skaterStats, allSkatersForZScore)
      Object.assign(categoryZScores, skaterCategoryZScores)
    }
    
    // Fill in zeros for non-applicable categories
    for (const category of ALL_CATEGORIES) {
      if (!(category in categoryZScores)) {
        categoryZScores[category] = 0
      }
    }
    
    console.log(`   Z-score breakdown for ${dbPlayer.firstName} ${dbPlayer.lastName}:`, {
      total: totalZScore.toFixed(2),
      topCategories: Object.entries(categoryZScores)
        .filter(([_, z]) => Math.abs(z) > 0.5)
        .sort(([_, a], [__, b]) => Math.abs(b) - Math.abs(a))
        .slice(0, 5)
        .map(([cat, z]) => `${cat}: ${z.toFixed(2)}`)
    })
    
    // Calculate category win contributions
    const categoryAnalysis: Record<CategoryCode, CategoryAnalysis> = {} as any
    let totalWinContribution = 0
    
    for (const category of ALL_CATEGORIES) {
      const zScore = categoryZScores[category]
      const winContribution = calculateCategoryWinContribution(totalZScore, zScore)
      totalWinContribution += winContribution
      
      // Calculate rank and percentile (simplified for now)
      // TODO: Calculate actual rank from league-wide stats
      const rank = 0 // Placeholder
      const percentile = 50 + (zScore * 16.7) // Rough approximation
      
      categoryAnalysis[category] = {
        category,
        total: getCategoryValue(categoryStats, category),
        perGame: gamesPlayed > 0 ? getCategoryValue(categoryStats, category) / gamesPlayed : 0,
        zScore,
        winContribution,
        rank,
        percentile: Math.max(0, Math.min(100, percentile)),
      }
    }
    
    // Get games remaining and strength of schedule
    const team = dbPlayer.team || ''
    let gamesRemaining = 0
    let strengthOfSchedule = 50
    
    if (team) {
      try {
        // Get games remaining based on team's games played (not individual player's GP)
        gamesRemaining = await getGamesRemaining(team, season)
        
        // Get strength of schedule
        strengthOfSchedule = await getStrengthOfSchedule(team, season)
        
        console.log(`   Team ${team}: ${gamesRemaining} games remaining, SOS: ${strengthOfSchedule.toFixed(1)}/100`)
      } catch (error) {
        console.error(`Error getting schedule info for ${team}:`, error)
        gamesRemaining = 0
        strengthOfSchedule = 50
      }
    }
    
    return {
      player: {
        id: playerInput.playerId,
        nhlId: playerInput.nhlId,
        name: `${dbPlayer.firstName} ${dbPlayer.lastName}`,
        position: dbPlayer.position,
        team: team,
        stats: categoryStats,
      },
      stats: categoryStats,
      gamesPlayed,
      gamesRemaining,
      categoryAnalysis,
      totalZScore,
      totalWinContribution,
      strengthOfSchedule,
    }
  }
  
  // Analyze both sides
  const sideAPlayers = await Promise.all(sideA.map(analyzePlayer))
  const sideBPlayers = await Promise.all(sideB.map(analyzePlayer))
  
  // Calculate side totals
  const calculateSideTotals = (players: CategoryPlayerValue[]): CategoryTradeSide => {
    const categoryStats: CategoryStats = {
      G: 0, A: 0, '±': 0, PIM: 0, PPP: 0, SOG: 0, HIT: 0, BLK: 0, FOW: 0,
      W: 0, SO: 0, 'SV%': 0, GAA: 0,
    }
    
    const categoryAnalysis: Record<CategoryCode, CategoryAnalysis> = {} as any
    let totalZScore = 0
    let totalWinContribution = 0
    let totalGamesRemaining = 0
    let totalStrengthOfSchedule = 0
    
    for (const player of players) {
      // Sum category stats
      for (const category of ALL_CATEGORIES) {
        categoryStats[category] += player.stats[category]
      }
      
      // Sum Z-scores and win contributions
      totalZScore += player.totalZScore
      totalWinContribution += player.totalWinContribution
      totalGamesRemaining += player.gamesRemaining
      totalStrengthOfSchedule += player.strengthOfSchedule
      
      // Aggregate category analysis (average for now)
      for (const category of ALL_CATEGORIES) {
        if (!categoryAnalysis[category]) {
          categoryAnalysis[category] = {
            category,
            total: 0,
            perGame: 0,
            zScore: 0,
            winContribution: 0,
            rank: 0,
            percentile: 0,
          }
        }
        categoryAnalysis[category].total += player.categoryAnalysis[category].total
        categoryAnalysis[category].perGame += player.categoryAnalysis[category].perGame
        categoryAnalysis[category].zScore += player.categoryAnalysis[category].zScore
        categoryAnalysis[category].winContribution += player.categoryAnalysis[category].winContribution
      }
    }
    
    // Average per-game and Z-scores
    const playerCount = players.length || 1
    for (const category of ALL_CATEGORIES) {
      categoryAnalysis[category].perGame /= playerCount
      categoryAnalysis[category].zScore /= playerCount
      categoryAnalysis[category].winContribution /= playerCount
    }
    
    // Identify category strengths and weaknesses
    const categoryStrengths: CategoryCode[] = []
    const categoryWeaknesses: CategoryCode[] = []
    
    for (const category of ALL_CATEGORIES) {
      if (categoryAnalysis[category].zScore > 0.5) {
        categoryStrengths.push(category)
      } else if (categoryAnalysis[category].zScore < -0.5) {
        categoryWeaknesses.push(category)
      }
    }
    
    return {
      players,
      categoryStats,
      categoryAnalysis,
      totalZScore,
      totalWinContribution,
      averageGamesRemaining: totalGamesRemaining / playerCount,
      averageStrengthOfSchedule: totalStrengthOfSchedule / playerCount,
      categoryStrengths,
      categoryWeaknesses,
    }
  }
  
  const sideAData = calculateSideTotals(sideAPlayers)
  const sideBData = calculateSideTotals(sideBPlayers)
  
  // Calculate category impacts
  const categoryImpacts: CategoryImpact[] = ALL_CATEGORIES.map(category => {
    const sideATotal = sideAData.categoryStats[category]
    const sideBTotal = sideBData.categoryStats[category]
    const netChange = sideBTotal - sideATotal
    const netChangePercentage = sideATotal !== 0 ? (netChange / Math.abs(sideATotal)) * 100 : 0
    const zScoreDiff = sideBData.categoryAnalysis[category].zScore - sideAData.categoryAnalysis[category].zScore
    const winContributionDiff = sideBData.categoryAnalysis[category].winContribution - sideAData.categoryAnalysis[category].winContribution
    
    const def = CATEGORY_DEFINITIONS[category]
    const helps = def.higherIsBetter ? netChange > 0 : netChange < 0
    const hurts = def.higherIsBetter ? netChange < 0 : netChange > 0
    
    return {
      category,
      sideATotal,
      sideBTotal,
      netChange,
      netChangePercentage,
      zScoreDifference: zScoreDiff,
      winContributionDifference: winContributionDiff,
      helpsCategory: helps,
      hurtsCategory: hurts,
    }
  })
  
  // Calculate net category changes
  const netCategoryChanges: CategoryStats = {
    G: sideBData.categoryStats.G - sideAData.categoryStats.G,
    A: sideBData.categoryStats.A - sideAData.categoryStats.A,
    '±': sideBData.categoryStats['±'] - sideAData.categoryStats['±'],
    PIM: sideBData.categoryStats.PIM - sideAData.categoryStats.PIM,
    PPP: sideBData.categoryStats.PPP - sideAData.categoryStats.PPP,
    SOG: sideBData.categoryStats.SOG - sideAData.categoryStats.SOG,
    HIT: sideBData.categoryStats.HIT - sideAData.categoryStats.HIT,
    BLK: sideBData.categoryStats.BLK - sideAData.categoryStats.BLK,
    FOW: sideBData.categoryStats.FOW - sideAData.categoryStats.FOW,
    W: sideBData.categoryStats.W - sideAData.categoryStats.W,
    SO: sideBData.categoryStats.SO - sideAData.categoryStats.SO,
    'SV%': sideBData.categoryStats['SV%'] - sideAData.categoryStats['SV%'],
    GAA: sideBData.categoryStats.GAA - sideAData.categoryStats.GAA,
  }
  
  // Calculate estimated category wins before/after
  const estimatedCategoryWins = {
    before: {} as Record<CategoryCode, number>,
    after: {} as Record<CategoryCode, number>,
    netChange: {} as Record<CategoryCode, number>,
  }
  
  for (const category of ALL_CATEGORIES) {
    const before = sideAData.categoryAnalysis[category].winContribution
    const after = sideBData.categoryAnalysis[category].winContribution
    estimatedCategoryWins.before[category] = before
    estimatedCategoryWins.after[category] = after
    estimatedCategoryWins.netChange[category] = after - before
  }
  
  // Calculate fairness score and recommendation
  const netZScore = sideBData.totalZScore - sideAData.totalZScore
  const netWinContribution = sideBData.totalWinContribution - sideAData.totalWinContribution
  const totalZScore = Math.abs(sideAData.totalZScore) + Math.abs(sideBData.totalZScore)
  
  const fairnessScore = totalZScore > 0
    ? Math.max(0, Math.min(100, 100 - (Math.abs(netZScore) / totalZScore) * 200))
    : 50
  
  let recommendation: 'accept' | 'reject' | 'negotiate' = 'accept'
  const reasoning: string[] = []
  const insights: string[] = []
  
  if (fairnessScore >= 80) {
    recommendation = 'accept'
    reasoning.push('This is a balanced trade with minimal value disparity.')
  } else if (fairnessScore >= 60) {
    recommendation = 'negotiate'
    reasoning.push('This trade is relatively fair but may benefit from minor adjustments.')
  } else {
    recommendation = netZScore > 0 ? 'accept' : 'reject'
    reasoning.push('This trade has significant value imbalance.')
  }
  
  if (Math.abs(netZScore) > 1) {
    insights.push(`Net Z-score change: ${netZScore > 0 ? '+' : ''}${netZScore.toFixed(2)} (${netZScore > 0 ? 'favorable' : 'unfavorable'})`)
  }
  
  if (Math.abs(netWinContribution) > 0.5) {
    insights.push(`Estimated weekly category wins change: ${netWinContribution > 0 ? '+' : ''}${netWinContribution.toFixed(2)}`)
  }
  
  // Games remaining analysis
  const gamesRemaining = {
    sideA: sideAData.averageGamesRemaining,
    sideB: sideBData.averageGamesRemaining,
    netChange: sideBData.averageGamesRemaining - sideAData.averageGamesRemaining,
  }
  
  // Strength of schedule analysis
  const strengthOfSchedule = {
    sideA: sideAData.averageStrengthOfSchedule,
    sideB: sideBData.averageStrengthOfSchedule,
    netChange: sideBData.averageStrengthOfSchedule - sideAData.averageStrengthOfSchedule,
  }
  
  if (gamesRemaining.netChange !== 0) {
    insights.push(`Games remaining: ${gamesRemaining.netChange > 0 ? '+' : ''}${gamesRemaining.netChange.toFixed(1)} games`)
  }
  
  if (Math.abs(strengthOfSchedule.netChange) > 5) {
    insights.push(`Strength of schedule: ${strengthOfSchedule.netChange > 0 ? 'easier' : 'harder'} schedule remaining`)
  }
  
  // Build result
  const result: CategoryTradeAnalysis = {
    sideA: { ...sideAData, teamName: sideAName },
    sideB: { ...sideBData, teamName: sideBName },
    categoryImpacts,
    netCategoryChanges,
    recommendation,
    fairnessScore: Math.round(fairnessScore),
    reasoning,
    insights,
    estimatedCategoryWins,
    gamesRemaining,
    strengthOfSchedule,
    timePeriod,
    analysisDate,
  }
  
  // TODO: Add team context analysis if myTeamId is provided
  
  return result
}

