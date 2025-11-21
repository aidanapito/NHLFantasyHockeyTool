import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'

const DEFAULT_SEASON = '2026'
const DEFAULT_STATS_SEASON = '20252026'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const leaguePlatformId = searchParams.get('leagueId')
    const season = searchParams.get('season') ?? undefined

    const where: Prisma.FantasyTeamWhereInput = {}

    if (leaguePlatformId) {
      where.league = {
        platform: 'espn',
        platformId: leaguePlatformId,
        ...(season ? { season } : {}),
      }
    }

    const teams = await prisma.fantasyTeam.findMany({
      where,
      include: {
        league: true,
        roster: {
          include: {
            player: {
              include: {
                stats: {
                  where: { season: DEFAULT_STATS_SEASON, gameType: 'regular' },
                  take: 1,
                },
              },
            },
          },
          orderBy: {
            slotPosition: 'asc',
          },
        },
      },
      orderBy: [{ leagueId: 'asc' }, { teamName: 'asc' }],
    })

    return NextResponse.json(teams)
  } catch (error) {
    console.error('Error fetching fantasy teams:', error)
    return NextResponse.json({ error: 'Failed to fetch fantasy teams' }, { status: 500 })
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}

export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}


