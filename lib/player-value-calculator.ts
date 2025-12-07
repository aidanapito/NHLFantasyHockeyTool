import { Player, PlayerStats, PlayerProjection, PlayerValue, FantasyCategories, CalculatedPlayerValue } from '@/types/player'

/**
 * Weights for different fantasy categories
 * These represent the relative importance of each stat in fantasy hockey
 */
const FANTASY_WEIGHTS = {
  goals: 3.0,
  assists: 2.5,
  points: 4.0,
  plusMinus: 1.5,
  pim: 0.8,
  shots: 0.3,
  hits: 0.7,
  blocks: 0.6,
  ppp: 1.2, // Power play points
  toi: 0.1, // Time on ice per minute
}

/**
 * Calculate per-game fantasy value for a player
 */
export function calculateFantasyValue(stats: Partial<PlayerStats>): number {
  const gamesPlayed = stats.gamesPlayed || 1
  
  const goalsValue = (stats.goals || 0) * FANTASY_WEIGHTS.goals / gamesPlayed
  const assistsValue = (stats.assists || 0) * FANTASY_WEIGHTS.assists / gamesPlayed
  const pointsValue = (stats.points || 0) * FANTASY_WEIGHTS.points / gamesPlayed
  const plusMinusValue = (stats.plusMinus || 0) * FANTASY_WEIGHTS.plusMinus / gamesPlayed
  const pimValue = (stats.pim || 0) * FANTASY_WEIGHTS.pim / gamesPlayed
  const shotsValue = (stats.shotsOnGoal || 0) * FANTASY_WEIGHTS.shots / gamesPlayed
  const hitsValue = (stats.hits || 0) * FANTASY_WEIGHTS.hits / gamesPlayed
  const blocksValue = (stats.blocks || 0) * FANTASY_WEIGHTS.blocks / gamesPlayed
  const pppValue = (stats.powerPlayPoints || 0) * FANTASY_WEIGHTS.ppp / gamesPlayed
  const toiValue = (stats.averageToi || 0) * FANTASY_WEIGHTS.toi / gamesPlayed

  return (
    goalsValue +
    assistsValue +
    pointsValue +
    plusMinusValue +
    pimValue +
    shotsValue +
    hitsValue +
    blocksValue +
    pppValue +
    toiValue
  )
}

/**
 * Calculate consistency score based on recent performance variance
 * Higher score = more consistent
 */
export function calculateConsistencyScore(
  last5Games: { gamesPlayed: number; points: number },
  last10Games: { gamesPlayed: number; points: number }
): number {
  const pointsPerGame5 = last5Games.gamesPlayed > 0 ? last5Games.points / last5Games.gamesPlayed : 0
  const pointsPerGame10 = last10Games.gamesPlayed > 0 ? last10Games.points / last10Games.gamesPlayed : 0

  if (last5Games.gamesPlayed === 0 || last10Games.gamesPlayed === 0) return 50

  // Score based on consistency (how close recent PPG is to overall PPG)
  const variance = Math.abs(pointsPerGame5 - pointsPerGame10)
  const consistencyScore = Math.max(0, Math.min(100, 100 - variance * 10))

  return consistencyScore
}

/**
 * Determine if player is trending up, down, or stable
 */
export function determineTrend(
  last5Games: { gamesPlayed: number; points: number; toi: number },
  last10Games: { gamesPlayed: number; points: number; toi: number }
): 'up' | 'down' | 'stable' {
  const ppgLast5 = last5Games.gamesPlayed > 0 ? last5Games.points / last5Games.gamesPlayed : 0
  const ppgLast10 = last10Games.gamesPlayed > 0 ? last10Games.points / last10Games.gamesPlayed : 0

  const toiLast5 = last5Games.gamesPlayed > 0 ? last5Games.toi / last5Games.gamesPlayed : 0
  const toiLast10 = last10Games.gamesPlayed > 0 ? last10Games.toi / last10Games.gamesPlayed : 0

  const toiChange = toiLast5 - toiLast10

  // Significant TOI increase suggests upward trend
  if (toiChange > 2 && ppgLast5 > ppgLast10) return 'up'
  
  // Significant TOI decrease suggests downward trend  
  if (toiChange < -2 && ppgLast5 < ppgLast10) return 'down'

  // PPG trend determines it
  if (ppgLast5 > ppgLast10 + 0.2) return 'up'
  if (ppgLast5 < ppgLast10 - 0.2) return 'down'

  return 'stable'
}

/**
 * Calculate comprehensive player value
 */
export function calculatePlayerValue(
  stats: Partial<PlayerStats>,
  projection: Partial<PlayerProjection>
): PlayerValue {
  const actualValue = calculateFantasyValue(stats)
  
  // Estimate projected value if not provided
  let projectedValue = 0
  if (projection.projectedPoints) {
    projectedValue = projection.projectedPoints * FANTASY_WEIGHTS.points / 82 // Assuming 82 game season
  } else {
    projectedValue = actualValue // Use current as proxy
  }

  const valueDelta = actualValue - projectedValue
  const overUnderPerformance = valueDelta > 0.5 ? 'over' : valueDelta < -0.5 ? 'under' : 'fair'

  // Mock trend data (would come from real data in production)
  const last5Games = {
    gamesPlayed: Math.min(5, stats.gamesPlayed || 0),
    points: Math.floor((stats.points || 0) * 0.3), // Rough estimate
    toi: (stats.averageToi || 0) * 5,
  }
  
  const last10Games = {
    gamesPlayed: Math.min(10, stats.gamesPlayed || 0),
    points: Math.floor((stats.points || 0) * 0.6),
    toi: (stats.averageToi || 0) * 10,
  }

  const consistencyScore = calculateConsistencyScore(last5Games, last10Games)
  const recentTrend = determineTrend(last5Games, last10Games)

  return {
    playerId: stats.playerId || '',
    actualValue,
    projectedValue,
    valueDelta,
    overUnderPerformance,
    recentTrend,
    consistencyScore,
    trendData: {
      last5Games,
      last10Games,
    },
  }
}

/**
 * Calculate fantasy categories from stats
 */
export function calculateFantasyCategories(stats: Partial<PlayerStats>): FantasyCategories {
  const gamesPlayed = stats.gamesPlayed || 1

  return {
    goals: stats.goals || 0,
    assists: stats.assists || 0,
    points: stats.points || 0,
    plusMinus: stats.plusMinus || 0,
    pim: stats.pim || 0,
    shots: stats.shotsOnGoal || 0,
    hits: stats.hits || 0,
    blocks: stats.blocks || 0,
    ppp: stats.powerPlayPoints || 0,
    toi: stats.averageToi || 0,
  }
}
