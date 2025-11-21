import { Player, PlayerStats, PlayerProjection } from '@/types/player'
import {
  EnhancedPlayerValue,
  ROSProjection,
  PlayerRiskMetrics,
  PlayerContextualData,
} from '@/types/trade'
import {
  calculateFantasyValue,
  calculateConsistencyScore,
  determineTrend,
} from './player-value-calculator'

/**
 * Enhanced Valuation Engine
 * 
 * Provides comprehensive player valuation including:
 * - True Player Value (TPV) calculations
 * - Projected Player Value (PPV)
 * - Rest of Season (ROS) projections
 * - Risk and volatility metrics
 * - Contextual adjustments
 */

interface HistoricalStats {
  gamesPlayed: number
  goals: number
  assists: number
  points: number
  shots: number
  hits: number
  blocks: number
  ppp: number
  plusMinus: number
  pim: number
}

/**
 * Calculate True Player Value (TPV)
 * Combines z-score methodology with fantasy weights for comprehensive value
 */
export function calculateTPV(
  stats: Partial<PlayerStats>,
  allPlayersStats: Array<Partial<PlayerStats>>
): number {
  const gamesPlayed = stats.gamesPlayed || 1
  
  // Convert to per-game rates for fair comparison
  const playerStatsPerGame = {
    goals: (stats.goals || 0) / gamesPlayed,
    assists: (stats.assists || 0) / gamesPlayed,
    points: (stats.points || 0) / gamesPlayed,
    shots: (stats.shotsOnGoal || 0) / gamesPlayed,
    hits: (stats.hits || 0) / gamesPlayed,
    blocks: (stats.blocks || 0) / gamesPlayed,
    ppp: (stats.powerPlayPoints || 0) / gamesPlayed,
    plusMinus: (stats.plusMinus || 0) / gamesPlayed,
    pim: (stats.pim || 0) / gamesPlayed,
  }

  // Calculate league averages
  const leagueAverages = calculateLeagueAverages(allPlayersStats)

  // Calculate z-scores for each category
  const zScores = calculateZScoresForCategories(playerStatsPerGame, leagueAverages)

  // Weight categories based on fantasy impact
  const weights = {
    goals: 3.0,
    assists: 2.5,
    points: 4.0,
    shots: 0.3,
    hits: 0.7,
    blocks: 0.6,
    ppp: 1.2,
    plusMinus: 1.5,
    pim: 0.8,
  }

  // Calculate weighted TPV
  const tpv =
    zScores.goals * weights.goals +
    zScores.assists * weights.assists +
    zScores.points * weights.points +
    zScores.shots * weights.shots +
    zScores.hits * weights.hits +
    zScores.blocks * weights.blocks +
    zScores.ppp * weights.ppp +
    zScores.plusMinus * weights.plusMinus +
    zScores.pim * weights.pim

  return tpv
}

/**
 * Calculate Projected Player Value (PPV)
 * Based on preseason projections, ADP, or historical averages
 * Falls back to current TPV if no projection data available
 */
export function calculatePPV(
  projection: Partial<PlayerProjection>,
  historicalStats?: HistoricalStats[],
  currentStats?: Partial<PlayerStats>,
  allPlayersStats?: Array<Partial<PlayerStats>>
): number {
  // If we have ESPN projected value, use that
  if (projection.espnProjectedValue !== undefined && projection.espnProjectedValue > 0) {
    return projection.espnProjectedValue
  }

  // If we have projected stats, calculate fantasy value
  if (projection.projectedPoints !== undefined && projection.projectedPoints > 0) {
    // Estimate other stats from projected points
    const estimatedStats: Partial<PlayerStats> = {
      goals: Math.round(projection.projectedPoints * 0.4),
      assists: Math.round(projection.projectedPoints * 0.6),
      points: projection.projectedPoints,
      shotsOnGoal: Math.round(projection.projectedPoints * 3),
      hits: Math.round(projection.projectedPoints * 1.5),
      blocks: Math.round(projection.projectedPoints * 0.5),
      powerPlayPoints: Math.round(projection.projectedPoints * 0.25),
      plusMinus: 0,
      pim: 20,
      gamesPlayed: 82,
    }
    return calculateFantasyValue(estimatedStats)
  }

  // If we have historical stats, project based on trends
  if (historicalStats && historicalStats.length > 0) {
    return projectFromHistory(historicalStats)
  }

  // Fallback: Use current TPV as proxy for projection if we have current stats
  // This provides a meaningful baseline even without preseason projections
  if (currentStats && allPlayersStats && allPlayersStats.length > 0) {
    return calculateTPV(currentStats, allPlayersStats)
  }

  // Last resort: return 0 if no data available
  return 0
}

/**
 * Calculate Rest of Season (ROS) projection
 */
export function calculateROSProjection(
  stats: Partial<PlayerStats>,
  projection: Partial<PlayerProjection>,
  gamesPlayed: number,
  seasonLength: number = 82
): ROSProjection {
  const gamesRemaining = Math.max(0, seasonLength - gamesPlayed)
  
  // Current per-game rates
  const currentFppg = calculateFantasyValue(stats)
  const goalsPerGame = (stats.goals || 0) / gamesPlayed
  const assistsPerGame = (stats.assists || 0) / gamesPlayed
  const pointsPerGame = (stats.points || 0) / gamesPlayed
  const shotsPerGame = (stats.shotsOnGoal || 0) / gamesPlayed
  const hitsPerGame = (stats.hits || 0) / gamesPlayed
  const blocksPerGame = (stats.blocks || 0) / gamesPlayed
  const pppPerGame = (stats.powerPlayPoints || 0) / gamesPlayed

  // Project ROS using weighted average of current rate and preseason projection
  // Use 70% current rate, 30% preseason projection to account for regression
  // Convert PPV (total value) to per-game rate for comparison (assuming 82 game season)
  const ppvPerGame = calculatePPV(projection, undefined, stats) / 82
  const projectedFppg = currentFppg * 0.7 + ppvPerGame * 0.3

  // Category breakdown
  const projectedGoalsPerGame = goalsPerGame * 0.7 + ((projection.projectedGoals || 0) / seasonLength) * 0.3
  const projectedAssistsPerGame = assistsPerGame * 0.7 + ((projection.projectedAssists || 0) / seasonLength) * 0.3

  const categoryBreakdown = {
    goals: projectedGoalsPerGame * gamesRemaining,
    assists: projectedAssistsPerGame * gamesRemaining,
    points: (projectedGoalsPerGame + projectedAssistsPerGame) * gamesRemaining,
    shots: shotsPerGame * 0.9 * gamesRemaining, // Slight regression
    hits: hitsPerGame * gamesRemaining,
    blocks: blocksPerGame * gamesRemaining,
    ppp: pppPerGame * 0.9 * gamesRemaining,
  }

  // Calculate confidence based on sample size
  const confidence = Math.min(100, gamesPlayed * 2)
  
  // Adjust confidence based on consistency
  const consistency = calculateConsistencyScore(
    { gamesPlayed: Math.min(5, gamesPlayed), points: Math.floor((stats.points || 0) * 0.3) },
    { gamesPlayed: Math.min(10, gamesPlayed), points: Math.floor((stats.points || 0) * 0.6) }
  )
  const adjustedConfidence = (confidence * 0.7 + consistency * 0.3)

  return {
    projectedFantasyPointsPerGame: projectedFppg,
    projectedTotalGames: gamesRemaining,
    projectedTotalValue: projectedFppg * gamesRemaining,
    confidence: Math.round(adjustedConfidence),
    categoryBreakdown,
  }
}

/**
 * Calculate risk metrics for a player
 */
export function calculateRiskMetrics(
  stats: Partial<PlayerStats>,
  historicalStats?: HistoricalStats[]
): PlayerRiskMetrics {
  const gamesPlayed = stats.gamesPlayed || 1
  
  // Calculate trend
  const last5Games = {
    gamesPlayed: Math.min(5, gamesPlayed),
    points: Math.floor((stats.points || 0) * 0.3),
    toi: (stats.averageToi || 0) * 5,
  }
  const last10Games = {
    gamesPlayed: Math.min(10, gamesPlayed),
    points: Math.floor((stats.points || 0) * 0.6),
    toi: (stats.averageToi || 0) * 10,
  }

  const trend = determineTrend(last5Games, last10Games)
  
  // Calculate volatility
  const consistencyScore = calculateConsistencyScore(last5Games, last10Games)
  const volatilityScore = 100 - consistencyScore

  // Determine trend strength
  const ppgLast5 = last5Games.gamesPlayed > 0 ? last5Games.points / last5Games.gamesPlayed : 0
  const ppgLast10 = last10Games.gamesPlayed > 0 ? last10Games.points / last10Games.gamesPlayed : 0
  const trendStrength = Math.min(100, Math.abs(ppgLast5 - ppgLast10) * 10)

  // Determine boom-or-bust status
  // High variance in recent games indicates boom-or-bust
  const boomOrBust = volatilityScore > 60

  // Consistency rating
  let consistencyRating: 'High' | 'Medium' | 'Low'
  if (consistencyScore >= 70) {
    consistencyRating = 'High'
  } else if (consistencyScore >= 40) {
    consistencyRating = 'Medium'
  } else {
    consistencyRating = 'Low'
  }

  return {
    volatilityScore,
    consistencyRating,
    boomOrBust,
    trend,
    trendStrength: Math.round(trendStrength),
  }
}

/**
 * Calculate contextual data for a player
 * This would ideally come from external data sources or database
 */
export function calculateContextualData(
  stats: Partial<PlayerStats>,
  player: Player
): PlayerContextualData {
  // Mock contextual data - in production this would come from real data sources
  // Line assignments would come from line combination APIs
  // Injury status from NHL API or injury tracking service
  // Team ratings from advanced stats sources

  const contextualData: PlayerContextualData = {
    injuryStatus: 'Healthy', // Default
    gamesRemaining: 82 - (stats.gamesPlayed || 0),
  }

  // Estimate line assignment based on TOI (mock logic)
  if (stats.averageToi) {
    if (stats.averageToi >= 20) {
      contextualData.lineAssignment = 'First'
    } else if (stats.averageToi >= 17) {
      contextualData.lineAssignment = 'Second'
    } else if (stats.averageToi >= 14) {
      contextualData.lineAssignment = 'Third'
    } else {
      contextualData.lineAssignment = 'Fourth'
    }

    // Estimate PP usage
    if (stats.powerPlayPoints && stats.powerPlayPoints > (stats.points || 0) * 0.3) {
      contextualData.powerPlayUsage = 80
      contextualData.lineAssignment = 'PP1'
    } else if (stats.powerPlayPoints && stats.powerPlayPoints > 0) {
      contextualData.powerPlayUsage = 30
      contextualData.lineAssignment = 'PP2'
    } else {
      contextualData.lineAssignment = contextualData.lineAssignment
      contextualData.powerPlayUsage = 0
    }
  }

  // Mock team ratings (would come from real data)
  contextualData.teamOffensiveRating = 50
  contextualData.teamDefensiveRating = 50
  contextualData.upcomingScheduleStrength = 50
  contextualData.teammateSynergy = 50

  return contextualData
}

/**
 * Determine player tier based on TPV
 */
export function determineTier(tpv: number): 'Elite' | 'Starter' | 'Depth' | 'Fringe' {
  if (tpv >= 15) return 'Elite'
  if (tpv >= 5) return 'Starter'
  if (tpv >= 0) return 'Depth'
  return 'Fringe'
}

/**
 * Calculate comprehensive enhanced player value
 */
export function calculateEnhancedPlayerValue(
  player: Player,
  stats: Partial<PlayerStats>,
  projection: Partial<PlayerProjection>,
  allPlayersStats: Array<Partial<PlayerStats>>
): EnhancedPlayerValue {
  const tpv = calculateTPV(stats, allPlayersStats)
  const ppv = calculatePPV(projection, undefined, stats, allPlayersStats)
  const valueDelta = tpv - ppv
  
  const rosProjection = calculateROSProjection(stats, projection, stats.gamesPlayed || 1)
  const riskMetrics = calculateRiskMetrics(stats)
  const contextualData = calculateContextualData(stats, player)
  const tier = determineTier(tpv)

  return {
    tpv,
    ppv,
    valueDelta,
    rosProjection,
    riskMetrics,
    contextualData,
    tier,
  }
}

// Helper functions

function calculateLeagueAverages(
  allPlayersStats: Array<Partial<PlayerStats>>
): Record<string, { mean: number; stdDev: number }> {
  const validPlayers = allPlayersStats.filter(p => (p.gamesPlayed || 0) > 0)
  
  if (validPlayers.length === 0) {
    return {}
  }

  const categories = ['goals', 'assists', 'points', 'shots', 'hits', 'blocks', 'ppp', 'plusMinus', 'pim']
  const averages: Record<string, { mean: number; stdDev: number }> = {}

  for (const category of categories) {
    const rates = validPlayers.map(p => {
      const gp = p.gamesPlayed || 1
      const stat = (p as any)[category] || 0
      return stat / gp
    })

    const mean = rates.reduce((sum, val) => sum + val, 0) / rates.length
    const variance = rates.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / rates.length
    const stdDev = Math.sqrt(variance)

    averages[category] = { mean, stdDev }
  }

  return averages
}

function calculateZScoresForCategories(
  playerStatsPerGame: Record<string, number>,
  leagueAverages: Record<string, { mean: number; stdDev: number }>
): Record<string, number> {
  const zScores: Record<string, number> = {}

  for (const [category, stats] of Object.entries(playerStatsPerGame)) {
    const avg = leagueAverages[category]
    if (avg && avg.stdDev > 0) {
      zScores[category] = (stats - avg.mean) / avg.stdDev
    } else {
      zScores[category] = 0
    }
  }

  return zScores
}

function projectFromHistory(historicalStats: HistoricalStats[]): number {
  if (historicalStats.length === 0) return 0

  // Use most recent season as primary, with weighted average of others
  const mostRecent = historicalStats[0]
  const estimatedStats: Partial<PlayerStats> = {
    goals: mostRecent.goals,
    assists: mostRecent.assists,
    points: mostRecent.points,
    shotsOnGoal: mostRecent.shots,
    hits: mostRecent.hits,
    blocks: mostRecent.blocks,
    powerPlayPoints: mostRecent.ppp,
    plusMinus: mostRecent.plusMinus,
    pim: mostRecent.pim,
    gamesPlayed: mostRecent.gamesPlayed,
  }

  return calculateFantasyValue(estimatedStats)
}

