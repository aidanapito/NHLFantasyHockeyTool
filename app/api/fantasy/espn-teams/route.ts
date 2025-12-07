import { NextRequest, NextResponse } from 'next/server'

import { EspnSyncError, fetchEspnLeagueData } from '@/lib/espn/league'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const leagueId = searchParams.get('leagueId')
    const season = searchParams.get('season') ?? undefined
    const includeDebug = searchParams.get('debug') === 'true'

    if (!leagueId) {
      return NextResponse.json({ error: 'leagueId is required' }, { status: 400 })
    }

    const result = await fetchEspnLeagueData({ leagueId, season, includeDebug })

    const responseBody: Record<string, any> = {
      success: result.success,
      leagueId: result.leagueId,
      season: result.season,
      leagueName: result.leagueName,
      categories: result.categories,
      teams: result.teams,
    }

    if (includeDebug && result.debug) {
      responseBody.debugProTeams = result.debug.proTeams
      responseBody.debugPlayers = result.debug.players
      responseBody.rawSettingsProTeams = result.raw?.settingsProTeams ?? null
      responseBody.rawProTeams = result.raw?.proTeams ?? null
    }

    return NextResponse.json(responseBody)
  } catch (error: any) {
    if (error instanceof EspnSyncError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error('Error fetching ESPN teams:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch teams from ESPN',
        message: error?.message ?? 'Unknown error',
      },
      { status: 500 }
    )
  }
}


