import { Player } from './player'

export interface PlayerContextualData {
  lineAssignment?: 'First' | 'Second' | 'Third' | 'Fourth' | 'PP1' | 'PP2' | 'Not on PP'
  powerPlayUsage?: number // Percentage
  teammateSynergy?: number // Boost from quality linemates
  teamOffensiveRating?: number // Team's offensive strength
  teamDefensiveRating?: number // Team's defensive strength
  upcomingScheduleStrength?: number // Average opponent quality
  gamesRemaining?: number // ROS games
  injuryStatus?: 'Healthy' | 'Questionable' | 'Injured'
  injuryExpectedReturn?: string
}

export interface PlayerRiskMetrics {
  volatilityScore: number // Standard deviation of recent performance (0-100)
  consistencyRating: 'High' | 'Medium' | 'Low'
  boomOrBust: boolean // True if high variance player
  trend: 'Up' | 'Down' | 'Stable'
  trendStrength: number // Magnitude of trend (0-100)
}

export interface ROSProjection {
  projectedFantasyPointsPerGame: number
  projectedTotalGames: number
  projectedTotalValue: number
  confidence: number // 0-100
  categoryBreakdown: {
    goals: number
    assists: number
    points: number
    shots: number
    hits: number
    blocks: number
    ppp: number
  }
}

export interface EnhancedPlayerValue {
  // True Player Value - comprehensive value score
  tpv: number
  
  // Projected Player Value - preseason/draft projections
  ppv: number
  
  // Value Delta = TPV - PPV
  valueDelta: number
  
  // Rest of Season Projection
  rosProjection: ROSProjection
  
  // Risk and volatility metrics
  riskMetrics: PlayerRiskMetrics
  
  // Contextual adjustments
  contextualData: PlayerContextualData
  
  // Additional metadata
  tier: 'Elite' | 'Starter' | 'Depth' | 'Fringe'
  clusterId?: number // For tier grouping
}

export interface TradeSide {
  players: Player[]
  teamName?: string
  totalValue: number
  projectedTotalValue: number
  valueDelta: number
  totalTPV: number // Sum of True Player Values (current season performance)
  totalPPV: number // Sum of Projected Player Values (talent/expected level)
  compositeValue: number // Weighted combination: 60% TPV + 40% PPV
  totalRiskScore: number // Average risk across players
  avgROSConfidence: number
}

export interface TradeAnalysis {
  sideA: TradeSide
  sideB: TradeSide
  netValueGain: number // Positive means side B benefits, negative means side A benefits
  netTPVGain: number // Net True Value gain (current performance only)
  netCompositeGain: number // Net composite value gain (60% TPV + 40% PPV) - used for trade evaluation
  fairnessScore: number // 0-100 scale
  fairTrade: boolean
  recommendation: 'accept' | 'reject' | 'negotiate' | 'heavily-favor-a' | 'heavily-favor-b'
  reasoning: string
  detailedInsights: string[]
  suggestedAdjustments?: string[]
  categoryImpact?: {
    sideA: Record<string, number> // Stats Team A is giving away
    sideB: Record<string, number> // Stats Team B is giving away (which Team A receives)
    netChange: Record<string, number> // Net change for Team A (positive = gaining)
  }
  playerBreakdown: {
    sideA: Array<{
      player: Player
      value: number
      projection: number
      delta: number
      tpv?: number
      rosProjection?: ROSProjection
      riskMetrics?: PlayerRiskMetrics
      contextualData?: PlayerContextualData
    }>
    sideB: Array<{
      player: Player
      value: number
      projection: number
      delta: number
      tpv?: number
      rosProjection?: ROSProjection
      riskMetrics?: PlayerRiskMetrics
      contextualData?: PlayerContextualData
    }>
  }
}
