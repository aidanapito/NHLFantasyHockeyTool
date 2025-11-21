import { TradeAnalysis, TradeSide } from '@/types/trade'
import { CalculatedPlayerValue } from '@/types/player'

export function analyzeTrade(
  sideA: CalculatedPlayerValue[],
  sideB: CalculatedPlayerValue[],
  sideAName?: string,
  sideBName?: string
): TradeAnalysis {
  const calculateSideTotal = (players: CalculatedPlayerValue[]): { totalValue: number; projectedValue: number } => {
    let totalValue = 0
    let projectedValue = 0

    players.forEach((player) => {
      totalValue += player.currentValue?.actualValue || 0
      projectedValue += player.currentValue?.projectedValue || 0
    })

    return { totalValue, projectedValue }
  }

  const sideAData = calculateSideTotal(sideA)
  const sideBData = calculateSideTotal(sideB)

  const sideAValue = sideAData.totalValue
  const sideBValue = sideBData.totalValue
  const sideAProjected = sideAData.projectedValue
  const sideBProjected = sideBData.projectedValue

  const netValueGain = sideBValue - sideAValue

  // Determine if trade is fair (within 5% difference)
  const fairnessThreshold = (sideAValue + sideBValue) * 0.05
  const fairTrade = Math.abs(netValueGain) <= fairnessThreshold

  // Generate recommendation
  let recommendation: 'accept' | 'reject' | 'negotiate'
  let reasoning = ''

  if (netValueGain > fairnessThreshold) {
    recommendation = netValueGain > fairnessThreshold * 2 ? 'reject' : 'negotiate'
    reasoning = `Side B receives ${netValueGain.toFixed(2)} more value. ${netValueGain > fairnessThreshold * 2 ? 'This trade significantly favors the other side.' : 'Consider asking for an additional player or draft pick to balance the trade.'}`
  } else if (netValueGain < -fairnessThreshold) {
    recommendation = 'accept'
    reasoning = `You receive ${Math.abs(netValueGain).toFixed(2)} more value. This trade benefits your team.`
  } else {
    recommendation = 'accept'
    reasoning = `This is a balanced trade with only ${Math.abs(netValueGain).toFixed(2)} value difference. Both sides benefit relatively equally.`
  }

  const analysis: TradeAnalysis = {
    sideA: {
      players: sideA,
      teamName: sideAName || 'Team A',
      totalValue: sideAValue,
      projectedTotalValue: sideAProjected,
      valueDelta: sideAValue - sideAProjected,
    },
    sideB: {
      players: sideB,
      teamName: sideBName || 'Team B',
      totalValue: sideBValue,
      projectedTotalValue: sideBProjected,
      valueDelta: sideBValue - sideBProjected,
    },
    netValueGain,
    fairTrade,
    recommendation,
    reasoning,
    playerBreakdown: {
      sideA: sideA.map((player) => ({
        player,
        value: player.currentValue?.actualValue || 0,
        projection: player.currentValue?.projectedValue || 0,
        delta: player.currentValue?.valueDelta || 0,
      })),
      sideB: sideB.map((player) => ({
        player,
        value: player.currentValue?.actualValue || 0,
        projection: player.currentValue?.projectedValue || 0,
        delta: player.currentValue?.valueDelta || 0,
      })),
    },
  }

  return analysis
}
