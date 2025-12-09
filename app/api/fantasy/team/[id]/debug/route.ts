import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const teamId = params.id
    const searchParams = request.nextUrl.searchParams
    const seasonParam = searchParams.get('season') || undefined

    const team = await prisma.fantasyTeam.findUnique({
      where: { id: teamId },
      include: {
        league: true,
        roster: {
          include: {
            player: {
              select: {
                id: true,
                nhlId: true,
                fullName: true,
                position: true,
              },
            },
          },
        },
      },
    })

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    const nhlIds = team.roster.map(r => r.player?.nhlId).filter((id): id is number => id != null)
    
    // Check if stats exist for these players
    const statsCheck = await prisma.playerStats.findMany({
      where: {
        player: {
          nhlId: { in: nhlIds },
        },
      },
      select: {
        season: true,
        gameType: true,
        player: {
          select: {
            nhlId: true,
            fullName: true,
          },
        },
      },
      distinct: ['season', 'playerId'],
    })

    const seasons = [...new Set(statsCheck.map(s => s.season))].sort().reverse()

    return NextResponse.json({
      team: {
        id: team.id,
        teamName: team.teamName,
        leagueSeason: team.league.season,
        requestedSeason: seasonParam,
        rosterSize: team.roster.length,
        nhlIds: nhlIds.length,
      },
      stats: {
        totalRecords: statsCheck.length,
        availableSeasons: seasons,
        playersWithStats: [...new Set(statsCheck.map(s => s.player.nhlId))].length,
      },
      roster: team.roster.map(r => ({
        name: r.player.fullName,
        nhlId: r.player.nhlId,
        dbId: r.player.id,
        position: r.player.position,
        hasStats: statsCheck.some(s => s.player.nhlId === r.player.nhlId),
      })),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to debug team' }, { status: 500 })
  }
}

