import Link from 'next/link'
import RefreshStatsButton from '@/components/RefreshStatsButton'
import RosterRemoveButton from '@/components/RosterRemoveButton'
import { prisma } from '@/lib/prisma'

function getBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
  if (envUrl) {
    // Ensure protocol
    return envUrl.startsWith('http') ? envUrl : `https://${envUrl}`
  }
  return 'http://localhost:3000'
}

function getCurrentSeason(): string {
  const now = new Date()
  const year = now.getUTCFullYear()
  // NHL seasons span two years, encode as YYYYYYYY like 20252026
  const start = now.getUTCMonth() >= 6 ? year : year - 1
  const end = start + 1
  return `${start}${end}`
}

function convertEspnSeasonToDbSeason(espnSeason: string | undefined): string {
  // ESPN uses format like "2026" which refers to the 2025-2026 season
  // Database uses "20252026" format (start year + end year)
  if (!espnSeason) {
    return getCurrentSeason()
  }
  // If already in database format (8 digits), return as-is
  if (espnSeason.length === 8) {
    return espnSeason
  }
  // Convert from ESPN format (4 digits) to database format
  // ESPN "2026" means the season ending in 2026, which is 2025-2026
  if (espnSeason.length === 4) {
    const endYear = parseInt(espnSeason)
    const startYear = endYear - 1
    return `${startYear}${endYear}`
  }
  // Fallback to current season
  return getCurrentSeason()
}

async function fetchEspnTeam(teamId: string, leagueId: string, season?: string) {
  const base = getBaseUrl()
  const params = new URLSearchParams({ leagueId })
  if (season) params.set('season', season)
  const res = await fetch(`${base}/api/fantasy/espn-teams?${params.toString()}`, {
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error('Failed to load team from ESPN')
  }
  const data = await res.json()
  const rawTeams = Array.isArray(data.teams) ? data.teams : []
  const match = rawTeams.find((team: any) => {
    const possibleIds = [
      team.teamId,
      team.team_id,
      team.id,
      team.teamName,
      team.abbrev,
    ]
    return possibleIds.some(id => id?.toString?.() === teamId)
  })
  if (!match) {
    return null
  }

  const rawRoster = Array.isArray(match.roster) ? match.roster : []
  // Convert ESPN season format to database format
  const espnSeason = season || data.season
  const statsSeason = convertEspnSeasonToDbSeason(espnSeason)

  // Build roster with player info
  const rosterWithPlayerInfo = rawRoster.map((player: any) => ({
    playerId: player.playerId ?? player.id ?? Math.random(),
    name: player.fullName ?? player.name ?? player.displayName ?? 'Unknown Player',
    position: player.defaultPosition ?? 'N/A',
    team: player.proTeamAbbrev ?? player.proTeamName ?? null,
    slotPosition: player.lineupSlot ?? player.slotPosition ?? null,
  }))

  // Try to find matching players in database and fetch their stats
  const playerNames = rosterWithPlayerInfo.map((p: any) => p.name)
  const dbPlayers = await prisma.player.findMany({
    where: {
      fullName: { in: playerNames },
      isActive: true,
    },
    include: {
      stats: {
        where: {
          season: statsSeason,
          gameType: 'regular',
        },
        take: 1,
      },
    },
  })

  // Create a map of player name -> database player
  const playerMap = new Map<string, typeof dbPlayers[0]>()
  for (const dbPlayer of dbPlayers) {
    // Try exact match first
    if (!playerMap.has(dbPlayer.fullName)) {
      playerMap.set(dbPlayer.fullName, dbPlayer)
    }
    // Also try case-insensitive match
    const lowerName = dbPlayer.fullName.toLowerCase()
    if (!playerMap.has(lowerName)) {
      playerMap.set(lowerName, dbPlayer)
    }
  }

  const skaterTotals = {
    gamesPlayed: 0,
    goals: 0,
    assists: 0,
    points: 0,
    plusMinus: 0,
    pim: 0,
    shotsOnGoal: 0,
    powerPlayPoints: 0,
    hits: 0,
    blockedShots: 0,
    faceoffsWon: 0,
  }

  const goalieTotals = {
    wins: 0,
    losses: 0,
    otLosses: 0,
    saves: 0,
    shotsAgainst: 0,
    goalsAgainst: 0,
    shutouts: 0,
    savePctNumerator: 0,
    savePctDenominator: 0,
    gaaNumerator: 0,
    gaaDenominator: 0,
  }

  // Build roster with stats
  const roster = rosterWithPlayerInfo.map((r: any) => {
    // Try to find matching player in database
    const dbPlayer = playerMap.get(r.name) || playerMap.get(r.name.toLowerCase())
    const stats = dbPlayer?.stats?.[0] || null
    const isGoalie = r.position === 'G'

    if (stats) {
      if (isGoalie) {
        goalieTotals.wins += stats.wins || 0
        goalieTotals.losses += stats.losses || 0
        goalieTotals.otLosses += stats.otLosses || 0
        goalieTotals.saves += stats.saves || 0
        goalieTotals.shotsAgainst += stats.shotsAgainst || 0
        goalieTotals.goalsAgainst += stats.goalsAgainst || 0
        goalieTotals.shutouts += stats.shutouts || 0
        goalieTotals.savePctNumerator += stats.saves || 0
        goalieTotals.savePctDenominator += stats.shotsAgainst || 0
        if (typeof stats.goalsAgainst === 'number' && typeof stats.gamesPlayed === 'number' && stats.gamesPlayed > 0) {
          goalieTotals.gaaNumerator += stats.goalsAgainst
          goalieTotals.gaaDenominator += stats.gamesPlayed
        }
      } else {
        skaterTotals.gamesPlayed += stats.gamesPlayed || 0
        skaterTotals.goals += stats.goals || 0
        skaterTotals.assists += stats.assists || 0
        skaterTotals.points += stats.points || 0
        skaterTotals.plusMinus += stats.plusMinus || 0
        skaterTotals.pim += stats.pim || 0
        skaterTotals.shotsOnGoal += stats.shotsOnGoal || 0
        skaterTotals.powerPlayPoints += stats.powerPlayPoints || 0
        skaterTotals.hits += stats.hits || 0
        skaterTotals.blockedShots += stats.blockedShots || 0
        skaterTotals.faceoffsWon += stats.faceoffsWon || 0
      }
    }

    return {
      ...r,
      stats,
    }
  })

  const aggregated = {
    skaters: skaterTotals,
    goalies: {
      wins: goalieTotals.wins,
      losses: goalieTotals.losses,
      otLosses: goalieTotals.otLosses,
      saves: goalieTotals.saves,
      shotsAgainst: goalieTotals.shotsAgainst,
      goalsAgainst: goalieTotals.goalsAgainst,
      shutouts: goalieTotals.shutouts,
      savePct:
        goalieTotals.savePctDenominator > 0
          ? goalieTotals.savePctNumerator / goalieTotals.savePctDenominator
          : null,
      gaa:
        goalieTotals.gaaDenominator > 0
          ? goalieTotals.gaaNumerator / goalieTotals.gaaDenominator
          : null,
    },
  }

  return {
    team: {
      id: match.teamId?.toString?.() ?? teamId,
      teamName: match.teamName ?? `Team ${teamId}`,
      ownerName: match.ownerName ?? null,
      league: {
        id: leagueId,
        leagueName: data.leagueName ?? `ESPN League ${leagueId}`,
        season: season ?? data.season ?? '',
      },
      roster,
      totals: aggregated,
    },
  }
}

async function fetchTeam(teamId: string, options?: { source?: string; leagueId?: string; season?: string }) {
  const base = getBaseUrl()
  const params = new URLSearchParams()
  if (options?.leagueId) params.set('leagueId', options.leagueId)
  if (options?.source) params.set('source', options.source)
  if (options?.season) params.set('season', options.season)
  const suffix = params.toString() ? `?${params.toString()}` : ''
  const res = await fetch(`${base}/api/fantasy/team/${teamId}${suffix}`, {
    // Force dynamic fetch on server; you may adjust caching if needed
    cache: 'no-store',
  })
  if (res.status === 404) {
    if (options?.source === 'espn' && options.leagueId) {
      return fetchEspnTeam(teamId, options.leagueId, options.season)
    }
    return null
  }
  if (!res.ok) {
    throw new Error('Failed to load team')
  }
  return res.json()
}

export default async function TeamPage({ params, searchParams }: { params: { teamId: string }; searchParams: { [key: string]: string | string[] | undefined } }) {
  const { teamId } = params
  const source = typeof searchParams.source === 'string' ? searchParams.source : undefined
  const leagueId = typeof searchParams.leagueId === 'string' && searchParams.leagueId.length > 0 ? searchParams.leagueId : undefined
  const season = typeof searchParams.season === 'string' && searchParams.season.length > 0 ? searchParams.season : undefined

  const data = await fetchTeam(teamId, { source, leagueId, season })

  if (!data) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center text-black">
        <h1 className="text-2xl font-semibold mb-4">Team Details Unavailable</h1>
        <p className="text-sm text-gray-600">
          We couldn&apos;t find a saved roster for this team. Load the team from the database or save it first, then try again.
        </p>
        <div className="mt-6">
          <Link href="/" className="text-blue-700 hover:underline">
            ← Back to teams
          </Link>
        </div>
      </div>
    )
  }

  const team = data.team

  return (
    <div className="max-w-7xl mx-auto py-8 text-black">
      <div className="mb-6">
        <Link href="/" className="text-sm text-blue-700 hover:underline">← Back</Link>
      </div>

      <div className="mb-6 bg-white rounded-lg shadow p-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-black">{team.teamName}</h1>
            {team.ownerName && (
              <div className="text-sm text-black">Owner: {team.ownerName}</div>
            )}
            <div className="text-xs text-black mt-1">League: {team.league.leagueName} · Season: {team.league.season}</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-black">Roster: {team.roster.length}</div>
            <RefreshStatsButton />
          </div>
        </div>
      </div>

      {team.roster.length > 0 && team.roster.every((r: any) => !r.stats) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800">
            <strong>No stats found:</strong> Player stats are not showing because they haven't been loaded into the database yet. 
            Click the <strong>"Refresh NHL Stats"</strong> button above to load current season statistics.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-5">
          <h2 className="text-xl font-semibold text-black mb-4">Roster</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-black uppercase">Player</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-black uppercase">Pos</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-black uppercase">NHL Team</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-black uppercase">GP</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-black uppercase">G</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-black uppercase">A</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-black uppercase">P</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-black uppercase">+/-</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-black uppercase">PIM</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-black uppercase">SOG</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-black uppercase">PPP</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-black uppercase">HIT</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-black uppercase">BLK</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-black uppercase">W</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-black uppercase">SV%</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-black uppercase">GAA</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-black uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {team.roster.map((r: any, idx: number) => (
                  <tr key={`${r.playerId}-${idx}`}>
                    <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-black">{r.name}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-black">{r.position}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-black">{r.team || 'FA'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right">{r.stats?.gamesPlayed ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right">{r.stats?.goals ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right">{r.stats?.assists ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right">{r.stats?.points ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right">{r.stats?.plusMinus ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right">{r.stats?.pim ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right">{r.stats?.shotsOnGoal ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right">{r.stats?.powerPlayPoints ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right">{r.stats?.hits ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right">{r.stats?.blockedShots ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right">{r.stats?.wins ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right">{typeof r.stats?.savePct === 'number' ? (r.stats.savePct * 100).toFixed(1) + '%' : '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right">{typeof r.stats?.gaa === 'number' ? r.stats.gaa.toFixed(2) : '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm">
                      <RosterRemoveButton teamId={team.id} playerId={r.playerId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-5">
          <h2 className="text-xl font-semibold text-black mb-4">Team Totals</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-black mb-2">Skaters</h3>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-black">GP</dt><dd className="font-medium">{team.totals.skaters.gamesPlayed}</dd></div>
                <div className="flex justify-between"><dt className="text-black">G</dt><dd className="font-medium">{team.totals.skaters.goals}</dd></div>
                <div className="flex justify-between"><dt className="text-black">A</dt><dd className="font-medium">{team.totals.skaters.assists}</dd></div>
                <div className="flex justify-between"><dt className="text-black">P</dt><dd className="font-medium">{team.totals.skaters.points}</dd></div>
                <div className="flex justify-between"><dt className="text-black">+/-</dt><dd className="font-medium">{team.totals.skaters.plusMinus}</dd></div>
                <div className="flex justify-between"><dt className="text-black">PIM</dt><dd className="font-medium">{team.totals.skaters.pim}</dd></div>
                <div className="flex justify-between"><dt className="text-black">SOG</dt><dd className="font-medium">{team.totals.skaters.shotsOnGoal}</dd></div>
                <div className="flex justify-between"><dt className="text-black">PPP</dt><dd className="font-medium">{team.totals.skaters.powerPlayPoints}</dd></div>
                <div className="flex justify-between"><dt className="text-black">HIT</dt><dd className="font-medium">{team.totals.skaters.hits}</dd></div>
                <div className="flex justify-between"><dt className="text-black">BLK</dt><dd className="font-medium">{team.totals.skaters.blockedShots}</dd></div>
                <div className="flex justify-between"><dt className="text-black">FOW</dt><dd className="font-medium">{team.totals.skaters.faceoffsWon}</dd></div>
              </dl>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-black mb-2">Goalies</h3>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-black">W</dt><dd className="font-medium">{team.totals.goalies.wins}</dd></div>
                <div className="flex justify-between"><dt className="text-black">L</dt><dd className="font-medium">{team.totals.goalies.losses}</dd></div>
                <div className="flex justify-between"><dt className="text-black">OTL</dt><dd className="font-medium">{team.totals.goalies.otLosses}</dd></div>
                <div className="flex justify-between"><dt className="text-black">Saves</dt><dd className="font-medium">{team.totals.goalies.saves}</dd></div>
                <div className="flex justify-between"><dt className="text-black">SA</dt><dd className="font-medium">{team.totals.goalies.shotsAgainst}</dd></div>
                <div className="flex justify-between"><dt className="text-black">GA</dt><dd className="font-medium">{team.totals.goalies.goalsAgainst}</dd></div>
                <div className="flex justify-between"><dt className="text-black">SO</dt><dd className="font-medium">{team.totals.goalies.shutouts}</dd></div>
                <div className="flex justify-between"><dt className="text-black">SV%</dt><dd className="font-medium">{typeof team.totals.goalies.savePct === 'number' ? (team.totals.goalies.savePct * 100).toFixed(1) + '%' : '-'}</dd></div>
                <div className="flex justify-between"><dt className="text-black">GAA</dt><dd className="font-medium">{typeof team.totals.goalies.gaa === 'number' ? team.totals.goalies.gaa.toFixed(2) : '-'}</dd></div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


