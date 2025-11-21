import { NextRequest, NextResponse } from 'next/server'
import { analyzeTrade } from '@/lib/trade-analyzer'
import { generateMockPlayer } from '@/lib/nhl-api'
import { calculatePlayerValue, calculateFantasyCategories } from '@/lib/player-value-calculator'
import { CalculatedPlayerValue } from '@/types/player'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sideA, sideB, sideAName, sideBName } = body

    // Fetch player data and calculate values
    const sideAPlayers: CalculatedPlayerValue[] = await Promise.all(
      sideA.map(async (playerId: string) => {
        // In production, fetch real player data
        // For demo, use mock data
        const mockPlayer = generateMockPlayer({ id: playerId })
        return {
          ...mockPlayer,
          currentValue: calculatePlayerValue(mockPlayer, {
            projectedPoints: 85,
          }),
          fantasyCategories: calculateFantasyCategories(mockPlayer),
        }
      })
    )

    const sideBPlayers: CalculatedPlayerValue[] = await Promise.all(
      sideB.map(async (playerId: string) => {
        const mockPlayer = generateMockPlayer({ id: playerId })
        return {
          ...mockPlayer,
          currentValue: calculatePlayerValue(mockPlayer, {
            projectedPoints: 80,
          }),
          fantasyCategories: calculateFantasyCategories(mockPlayer),
        }
      })
    )

    const analysis = analyzeTrade(sideAPlayers, sideBPlayers, sideAName, sideBName)

    return NextResponse.json({ analysis })
  } catch (error) {
    console.error('Error analyzing trade:', error)
    return NextResponse.json({ error: 'Failed to analyze trade' }, { status: 500 })
  }
}
