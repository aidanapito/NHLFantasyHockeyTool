import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function getCurrentSeason(): string {
  const now = new Date()
  const year = now.getUTCFullYear()
  const start = now.getUTCMonth() >= 6 ? year : year - 1
  const end = start + 1
  return `${start}${end}`
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const teamId = params.id
    const season = getCurrentSeason()

    const team = await prisma.fantasyTeam.findUnique({
      where: { id: teamId },
      include: {
        roster: {
          include: {
            player: { select: { id: true, nhlId: true, fullName: true } },
          },
        },
      },
    })

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    const playerIds = team.roster.map(r => r.player.id)
    const statsRows = await prisma.playerStats.findMany({
      where: { playerId: { in: playerIds }, season, gameType: 'regular' },
      select: { playerId: true, gamesPlayed: true, points: true, updatedAt: true },
    })

    const playerIdToStats = new Map<number, { playerId: number; gamesPlayed: number | null; points: number | null; updatedAt: Date }>()
    let lastUpdated: Date | null = null
    for (const row of statsRows) {
      playerIdToStats.set(row.playerId, row)
      if (!lastUpdated || row.updatedAt > lastUpdated) lastUpdated = row.updatedAt
    }

    const missing = [] as { nhlId: number; name: string }[]
    const zeroGames = [] as { nhlId: number; name: string }[]

    for (const r of team.roster) {
      const s = playerIdToStats.get(r.player.id)
      if (!s) {
        missing.push({ nhlId: r.player.nhlId, name: r.player.fullName })
      } else if (!s.gamesPlayed || s.gamesPlayed === 0) {
        zeroGames.push({ nhlId: r.player.nhlId, name: r.player.fullName })
      }
    }

    return NextResponse.json({
      team: { id: team.id, name: team.teamName },
      season,
      rosterCount: team.roster.length,
      withStatsCount: statsRows.length,
      lastUpdated,
      missingPlayers: missing,
      zeroGamesPlayers: zeroGames,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 })
  }
}


