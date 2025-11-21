import { TradeAnalysis, EnhancedPlayerValue, TradeSide } from '@/types/trade'
import { CalculatedPlayerValue } from '@/types/player'
import { calculateEnhancedPlayerValue } from './enhanced-valuation-engine'
import { prisma } from './prisma'

/**
 * Enhanced Trade Analyzer
 * 
 * Provides comprehensive trade evaluation with:
 * - True Player Value (TPV) analysis
 * - Fairness scoring
 * - Detailed insights and recommendations
 * - Category impact analysis
 * - Risk assessment
 */

interface TradeAnalysisInput {
  sideA: CalculatedPlayerValue[]
  sideB: CalculatedPlayerValue[]
  sideAName?: string
  sideBName?: string
}

/**
 * Calculate fairness score on 0-100 scale
 * Higher score = more fair trade
 */
function calculateFairnessScore(netTPVGain: number, totalValue: number): number {
  if (totalValue === 0) return 50
  
  // Calculate percentage difference
  const percentageDiff = (Math.abs(netTPVGain) / totalValue) * 100
  
  // Convert to fairness score (inverse relationship)
  // 0% diff = 100 score, 10% diff = 90 score, etc.
  const fairnessScore = Math.max(0, 100 - percentageDiff * 10)
  
  return Math.round(fairnessScore)
}

/**
 * Generate recommendation based on fairness score and net gain
 */
function generateRecommendation(
  fairnessScore: number,
  netCompositeGain: number
): {
  recommendation: 'accept' | 'reject' | 'negotiate' | 'heavily-favor-a' | 'heavily-favor-b'
  reasoning: string
  insights: string[]
  suggestions?: string[]
} {
  const insights: string[] = []
  const suggestions: string[] = []
  
  let recommendation: 'accept' | 'reject' | 'negotiate' | 'heavily-favor-a' | 'heavily-favor-b'
  let reasoning = ''

  // Determine recommendation based on fairness and value
  if (fairnessScore >= 85) {
    recommendation = 'accept'
    reasoning = 'This is a balanced trade with minimal value disparity.'
  } else if (fairnessScore >= 70) {
    recommendation = 'negotiate'
    reasoning = 'This trade is relatively fair but may benefit from minor adjustments.'
  } else if (fairnessScore >= 50) {
    recommendation = Math.abs(netCompositeGain) > 3 ? 'heavily-favor-a' : 'heavily-favor-b'
    reasoning = 'This trade has significant value imbalance and favors one side.'
  } else {
    recommendation = netCompositeGain > 0 ? 'reject' : 'heavily-favor-a'
    reasoning = 'This trade is heavily lopsided and should be rejected or significantly adjusted.'
  }

  // Generate detailed insights
  // netCompositeGain = sideB.compositeValue - sideA.compositeValue
  // Composite value = 60% current performance (TPV) + 40% talent/expected (PPV)
  // This represents Team A's net gain (what they receive - what they give)
  // So if netCompositeGain > 0, Team A gains; if < 0, Team B gains
  if (Math.abs(netCompositeGain) > 0.1) {
    const favoredSide = netCompositeGain > 0 ? 'Team A' : 'Team B'
    const percentageAdvantage = Math.abs(netCompositeGain) / Math.max(Math.abs(netCompositeGain) + 10, 20) * 100
    insights.push(`${favoredSide} gains ${Math.abs(netCompositeGain).toFixed(1)} net composite value (${percentageAdvantage.toFixed(0)}% advantage)`)
    insights.push('Composite value balances 60% current performance with 40% underlying talent')
  }

  if (fairnessScore < 70) {
    insights.push(`Fairness score of ${fairnessScore}/100 indicates significant imbalance`)
    
    // Generate suggestions
    if (recommendation === 'negotiate' || recommendation.includes('favor')) {
      const disadvantagedSide = netCompositeGain > 0 ? 'Team B' : 'Team A'
      suggestions.push(`${disadvantagedSide} should consider requesting additional value to balance the trade`)
      suggestions.push('Evaluate if any players are trending up/down significantly')
      suggestions.push('Consider whether current hot streaks justify trading away proven talent')
    }
  }

  if (fairnessScore >= 85) {
    insights.push('Both sides appear to be receiving reasonable value for their players')
  }

  return {
    recommendation,
    reasoning,
    insights,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  }
}

/**
 * Calculate category impact for each side using actual database stats
 * Returns what each team is giving away and receiving, plus net changes
 */
function calculateCategoryImpact(
  sideA: CalculatedPlayerValue[],
  sideB: CalculatedPlayerValue[],
  playerStatsMap: Map<string, any>
): {
  sideA: Record<string, number>
  sideB: Record<string, number>
  netChange: Record<string, number> // Net change for Team A (positive = gaining)
} {
  const impactA: Record<string, number> = {
    G: 0, // Goals
    A: 0, // Assists
    PTS: 0, // Points
    '±': 0, // Plus/Minus
    PIM: 0, // Penalty Minutes
    PPP: 0, // Power Play Points
    FOW: 0, // Faceoffs Won
    SOG: 0, // Shots On Goal
    HIT: 0, // Hits
    BLK: 0, // Blocks
    W: 0, // Goalie Wins
    SO: 0, // Shutouts
    GAA: 0, // Goals Against Average (average, weighted by games)
    'SV%': 0, // Save Percentage (average, weighted by saves)
    totalGAA: 0, // Sum for averaging
    gaaGames: 0, // Games for GAA calculation
    totalSV: 0, // Total saves for SV% calculation
    totalSA: 0, // Total shots against for SV% calculation
  }

  const impactB: Record<string, number> = {
    G: 0,
    A: 0,
    PTS: 0,
    '±': 0,
    PIM: 0,
    PPP: 0,
    FOW: 0,
    SOG: 0,
    HIT: 0,
    BLK: 0,
    W: 0,
    SO: 0,
    GAA: 0,
    'SV%': 0,
    totalGAA: 0,
    gaaGames: 0,
    totalSV: 0,
    totalSA: 0,
  }

  // Sum up category contributions for each side using actual stats
  const calculateImpact = (players: CalculatedPlayerValue[], impact: Record<string, number>) => {
    players.forEach(player => {
      const stats = playerStatsMap.get(player.id)
      if (!stats) return

      // Skater stats
      impact.G += stats.goals || 0
      impact.A += stats.assists || 0
      impact.PTS += stats.points || 0
      impact['±'] += stats.plusMinus || 0
      impact.PIM += stats.pim || 0
      impact.PPP += stats.powerPlayPoints || 0
      impact.FOW += stats.faceoffsWon || 0
      impact.SOG += stats.shotsOnGoal || 0
      impact.HIT += stats.hits || 0
      impact.BLK += stats.blockedShots || 0

      // Goalie stats
      impact.W += stats.wins || 0
      impact.SO += stats.shutouts || 0
      
      // For GAA and SV%, we need to aggregate properly
      if (stats.gaa !== null && stats.gaa !== undefined && stats.gamesPlayed > 0) {
        impact.totalGAA += (stats.gaa * stats.gamesPlayed)
        impact.gaaGames += stats.gamesPlayed
      }
      
      if (stats.saves !== null && stats.saves !== undefined) {
        impact.totalSV += stats.saves
      }
      if (stats.shotsAgainst !== null && stats.shotsAgainst !== undefined) {
        impact.totalSA += stats.shotsAgainst
      }
    })

    // Calculate weighted averages for goalie stats
    if (impact.gaaGames > 0) {
      impact.GAA = impact.totalGAA / impact.gaaGames
    }
    if (impact.totalSA > 0) {
      impact['SV%'] = impact.totalSV / impact.totalSA
    }
  }

  calculateImpact(sideA, impactA)
  calculateImpact(sideB, impactB)

  // Calculate net change for Team A (what they receive - what they give)
  const netChange: Record<string, number> = {
    G: impactB.G - impactA.G,
    A: impactB.A - impactA.A,
    PTS: impactB.PTS - impactA.PTS,
    '±': impactB['±'] - impactA['±'],
    PIM: impactB.PIM - impactA.PIM,
    PPP: impactB.PPP - impactA.PPP,
    FOW: impactB.FOW - impactA.FOW,
    SOG: impactB.SOG - impactA.SOG,
    HIT: impactB.HIT - impactA.HIT,
    BLK: impactB.BLK - impactA.BLK,
    W: impactB.W - impactA.W,
    SO: impactB.SO - impactA.SO,
    GAA: impactB.GAA - impactA.GAA, // Lower is better, so negative change is good
    'SV%': impactB['SV%'] - impactA['SV%'], // Higher is better
  }

  // Clean up internal calculation fields
  const cleanImpact = (impact: Record<string, number>) => {
    const { totalGAA, gaaGames, totalSV, totalSA, ...clean } = impact
    return clean
  }

  return {
    sideA: cleanImpact(impactA),
    sideB: cleanImpact(impactB),
    netChange,
  }
}

/**
 * Analyze trade comprehensively
 */
export async function analyzeEnhancedTrade(
  input: TradeAnalysisInput
): Promise<TradeAnalysis> {
  const { sideA, sideB, sideAName, sideBName } = input

  // Fetch all players at once for better performance
  const allPlayerIds = [...sideA.map(p => p.id), ...sideB.map(p => p.id)]
  
  const dbPlayers = await prisma.player.findMany({
    where: {
      nhlId: { in: allPlayerIds.map(id => parseInt(id)) },
    },
    include: {
      stats: {
        where: { season: '20252026', gameType: 'regular' },
        take: 1,
      },
    },
  })

  // Create a map for quick lookup
  const playerStatsMap = new Map(
    dbPlayers.map(dbPlayer => [dbPlayer.nhlId.toString(), dbPlayer.stats[0]])
  )

  // For z-score context, use players in the trade
  const allPlayersForContext = [...sideA, ...sideB]

  // Calculate enhanced values for each player
  const enhancedValuesA: EnhancedPlayerValue[] = await Promise.all(
    sideA.map(async (player) => {
      const stats = playerStatsMap.get(player.id)
      const projection: any = {} // Would fetch from ESPN or projections table

      return calculateEnhancedPlayerValue(
        player,
        stats || player,
        projection,
        allPlayersForContext as any
      )
    })
  )

  const enhancedValuesB: EnhancedPlayerValue[] = await Promise.all(
    sideB.map(async (player) => {
      const stats = playerStatsMap.get(player.id)
      const projection: any = {}

      return calculateEnhancedPlayerValue(
        player,
        stats || player,
        projection,
        allPlayersForContext as any
      )
    })
  )

  // Calculate totals for each side
  const sideAData = calculateSideTotals(sideA, enhancedValuesA, sideAName)
  const sideBData = calculateSideTotals(sideB, enhancedValuesB, sideBName)

  // Calculate net values (for backwards compatibility)
  const netValueGain = sideBData.totalValue - sideAData.totalValue
  const netTPVGain = sideBData.totalTPV - sideAData.totalTPV
  
  // Use composite value (60% TPV + 40% PPV) for trade evaluation
  // This balances current performance with underlying talent
  // netCompositeGain represents Team A's net gain (positive = Team A benefits)
  const netCompositeGain = sideBData.compositeValue - sideAData.compositeValue
  
  // Use composite value for total value calculation
  const totalValue = (Math.abs(sideAData.compositeValue) + Math.abs(sideBData.compositeValue)) / 2

  // Calculate fairness score based on composite value
  const fairnessScore = calculateFairnessScore(netCompositeGain, totalValue)
  const fairTrade = fairnessScore >= 70

  // Generate recommendation and insights using composite value
  // netCompositeGain represents Team A's net gain (what they receive vs what they give)
  const { recommendation, reasoning, insights, suggestions } = generateRecommendation(
    fairnessScore,
    netCompositeGain
  )

  // Calculate category impact using actual database stats
  const categoryImpact = calculateCategoryImpact(sideA, sideB, playerStatsMap)

  // Build player breakdown with enhanced data
  const playerBreakdown = {
    sideA: sideA.map((player, idx) => ({
      player,
      value: sideAData.totalValue / sideA.length,
      projection: sideAData.projectedTotalValue / sideA.length,
      delta: (sideAData.totalValue - sideAData.projectedTotalValue) / sideA.length,
      tpv: enhancedValuesA[idx]?.tpv,
      rosProjection: enhancedValuesA[idx]?.rosProjection,
      riskMetrics: enhancedValuesA[idx]?.riskMetrics,
      contextualData: enhancedValuesA[idx]?.contextualData,
    })),
    sideB: sideB.map((player, idx) => ({
      player,
      value: sideBData.totalValue / sideB.length,
      projection: sideBData.projectedTotalValue / sideB.length,
      delta: (sideBData.totalValue - sideBData.projectedTotalValue) / sideB.length,
      tpv: enhancedValuesB[idx]?.tpv,
      rosProjection: enhancedValuesB[idx]?.rosProjection,
      riskMetrics: enhancedValuesB[idx]?.riskMetrics,
      contextualData: enhancedValuesB[idx]?.contextualData,
    })),
  }

  return {
    sideA: sideAData,
    sideB: sideBData,
    netValueGain,
    netTPVGain,
    netCompositeGain,
    fairnessScore,
    fairTrade,
    recommendation,
    reasoning,
    detailedInsights: insights,
    suggestedAdjustments: suggestions,
    categoryImpact,
    playerBreakdown,
  }
}

/**
 * Calculate totals for a trade side
 */
function calculateSideTotals(
  players: CalculatedPlayerValue[],
  enhancedValues: EnhancedPlayerValue[],
  teamName?: string
): TradeSide {
  const totalValue = players.reduce((sum, p) => sum + (p.currentValue?.actualValue || 0), 0)
  const projectedTotalValue = players.reduce((sum, p) => sum + (p.currentValue?.projectedValue || 0), 0)
  const totalTPV = enhancedValues.reduce((sum, v) => sum + v.tpv, 0)
  const totalPPV = enhancedValues.reduce((sum, v) => sum + v.ppv, 0)
  
  // Calculate composite value: 60% current performance (TPV) + 40% talent/expected (PPV)
  // This balances hot streaks with underlying talent
  const compositeValue = totalTPV * 0.6 + totalPPV * 0.4
  
  const totalRiskScore = enhancedValues.length > 0
    ? enhancedValues.reduce((sum, v) => sum + v.riskMetrics.volatilityScore, 0) / enhancedValues.length
    : 50
  const avgROSConfidence = enhancedValues.length > 0
    ? enhancedValues.reduce((sum, v) => sum + v.rosProjection.confidence, 0) / enhancedValues.length
    : 50

  return {
    players,
    teamName,
    totalValue,
    projectedTotalValue,
    valueDelta: totalValue - projectedTotalValue,
    totalTPV,
    totalPPV,
    compositeValue,
    totalRiskScore: Math.round(totalRiskScore),
    avgROSConfidence: Math.round(avgROSConfidence),
  }
}

