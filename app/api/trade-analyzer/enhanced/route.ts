import { NextRequest, NextResponse } from 'next/server'
import { analyzeEnhancedTrade } from '@/lib/enhanced-trade-analyzer'
import { prisma } from '@/lib/prisma'
import { CalculatedPlayerValue } from '@/types/player'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sideA, sideB, sideAName, sideBName } = body

    if (!sideA || !sideB || sideA.length === 0 || sideB.length === 0) {
      return NextResponse.json(
        { error: 'Both sides must have at least one player' },
        { status: 400 }
      )
    }

    // Fetch player data from database
    const fetchPlayerData = async (playerIds: string[]): Promise<CalculatedPlayerValue[]> => {
      const players = await prisma.player.findMany({
        where: {
          nhlId: {
            in: playerIds.map(id => parseInt(id)),
          },
        },
        include: {
          stats: {
            where: {
              season: '20252026',
              gameType: 'regular',
            },
            take: 1,
          },
        },
      })

      return players.map(player => {
        const stats = player.stats[0]
        if (!stats) {
          // Return minimal player data if no stats found
          return {
            id: player.nhlId.toString(),
            name: player.fullName,
            team: player.team || 'Unknown',
            position: player.position,
            currentValue: {
              playerId: player.nhlId.toString(),
              actualValue: 0,
              projectedValue: 0,
              valueDelta: 0,
              overUnderPerformance: 'fair',
              recentTrend: 'stable',
              consistencyScore: 50,
              trendData: {
                last5Games: { gamesPlayed: 0, points: 0, toi: 0 },
                last10Games: { gamesPlayed: 0, points: 0, toi: 0 },
              },
            },
            fantasyCategories: {
              goals: 0,
              assists: 0,
              points: 0,
              plusMinus: 0,
              pim: 0,
              shots: 0,
              hits: 0,
              blocks: 0,
              ppp: 0,
              toi: 0,
            },
          } as CalculatedPlayerValue
        }

        // Map database stats to CalculatedPlayerValue format
        return {
          id: player.nhlId.toString(),
          name: player.fullName,
          team: player.team || 'Unknown',
          position: player.position,
          playerId: player.nhlId.toString(),
          gamesPlayed: stats.gamesPlayed,
          goals: stats.goals,
          assists: stats.assists,
          points: stats.points,
          plusMinus: stats.plusMinus,
          pim: stats.pim,
          shotsOnGoal: stats.shotsOnGoal || stats.shots,
          hits: stats.hits,
          blocks: stats.blockedShots,
          powerPlayPoints: stats.powerPlayPoints,
          timeOnIce: stats.timeOnIce || '0:00',
          averageToi: parseToIMinutes(stats.timeOnIce || stats.timeOnIcePerGame || '0:00'),
          currentValue: {
            playerId: player.nhlId.toString(),
            actualValue: calculateValueFromStats(stats),
            projectedValue: calculateValueFromStats(stats), // Simplified for now
            valueDelta: 0,
            overUnderPerformance: 'fair',
            recentTrend: 'stable',
            consistencyScore: 50,
            trendData: {
              last5Games: {
                gamesPlayed: Math.min(5, stats.gamesPlayed),
                points: Math.floor(stats.points * 0.3),
                toi: (stats.averageToi || parseToIMinutes(stats.timeOnIce || '0:00')) * 5,
              },
              last10Games: {
                gamesPlayed: Math.min(10, stats.gamesPlayed),
                points: Math.floor(stats.points * 0.6),
                toi: (stats.averageToi || parseToIMinutes(stats.timeOnIce || '0:00')) * 10,
              },
            },
          },
          fantasyCategories: {
            goals: stats.goals,
            assists: stats.assists,
            points: stats.points,
            plusMinus: stats.plusMinus,
            pim: stats.pim,
            shots: stats.shotsOnGoal || stats.shots,
            hits: stats.hits,
            blocks: stats.blockedShots,
            ppp: stats.powerPlayPoints,
            toi: parseToIMinutes(stats.timeOnIce || stats.timeOnIcePerGame || '0:00'),
          },
        } as CalculatedPlayerValue
      })
    }

    // Fetch players for both sides
    const sideAPlayers = await fetchPlayerData(sideA)
    const sideBPlayers = await fetchPlayerData(sideB)

    // Analyze trade
    const analysis = await analyzeEnhancedTrade({
      sideA: sideAPlayers,
      sideB: sideBPlayers,
      sideAName: sideAName || 'Team A',
      sideBName: sideBName || 'Team B',
    })

    return NextResponse.json({ analysis })
  } catch (error) {
    console.error('Error in enhanced trade analyzer:', error)
    return NextResponse.json(
      { error: 'Failed to analyze trade', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * Helper function to parse time on ice string to decimal minutes
 */
function parseToIMinutes(timeOnIce: string): number {
  if (!timeOnIce) return 0
  
  // Handle format like "20:45" or "1:23:45"
  const parts = timeOnIce.split(':').map(p => parseInt(p, 10) || 0)
  
  if (parts.length === 2) {
    // MM:SS format
    return parts[0] + parts[1] / 60
  } else if (parts.length === 3) {
    // HH:MM:SS format
    return parts[0] * 60 + parts[1] + parts[2] / 60
  }
  
  return 0
}

/**
 * Simplified value calculation from stats
 */
function calculateValueFromStats(stats: any): number {
  const weights = {
    goals: 3.0,
    assists: 2.5,
    points: 4.0,
    plusMinus: 1.5,
    pim: 0.8,
    shots: 0.3,
    hits: 0.7,
    blocks: 0.6,
    ppp: 1.2,
    toi: 0.1,
  }

  const gp = stats.gamesPlayed || 1
  
  const goalsValue = (stats.goals || 0) * weights.goals / gp
  const assistsValue = (stats.assists || 0) * weights.assists / gp
  const pointsValue = (stats.points || 0) * weights.points / gp
  const plusMinusValue = (stats.plusMinus || 0) * weights.plusMinus / gp
  const pimValue = (stats.pim || 0) * weights.pim / gp
  const shotsValue = ((stats.shotsOnGoal || stats.shots || 0)) * weights.shots / gp
  const hitsValue = (stats.hits || 0) * weights.hits / gp
  const blocksValue = (stats.blockedShots || 0) * weights.blocks / gp
  const pppValue = (stats.powerPlayPoints || 0) * weights.ppp / gp
  
  let toiValue = 0
  if (stats.timeOnIce) {
    toiValue = parseToIMinutes(stats.timeOnIce) * weights.toi / gp
  } else if (stats.averageToi) {
    toiValue = stats.averageToi * weights.toi / gp
  }

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

