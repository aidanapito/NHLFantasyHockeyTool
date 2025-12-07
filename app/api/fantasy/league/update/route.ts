import { NextRequest, NextResponse } from 'next/server'

import { EspnSyncError, syncEspnLeagueToDatabase } from '@/lib/espn/league'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const leagueId = body.leagueId || body.platformId
    const season = body.season ?? undefined

    if (!leagueId || typeof leagueId !== 'string' || leagueId.trim().length === 0) {
      return NextResponse.json({ error: 'leagueId is required' }, { status: 400 })
    }

    const result = await syncEspnLeagueToDatabase({ leagueId: leagueId.trim(), season })

    const payload = {
      success: true,
      leagueId: result.leagueId,
      season: result.season,
      leagueName: result.leagueName ?? result.league?.leagueName,
      updatedTeams: result.teamCount,
      updatedPlayers: result.playerCount,
      refreshedAt: new Date().toISOString(),
      league: result.league
        ? {
            id: result.league.id,
            platform: result.league.platform,
            platformId: result.league.platformId,
            leagueName: result.league.leagueName,
            season: result.league.season,
            categories: result.league.categories,
          }
        : null,
    }

    return NextResponse.json(payload, { status: 200 })
  } catch (error: any) {
    if (error instanceof EspnSyncError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error('Failed to update league from ESPN', error)
    return NextResponse.json(
      { error: 'Failed to update league from ESPN', message: error?.message ?? 'Unknown error' },
      { status: 500 }
    )
  }
}


