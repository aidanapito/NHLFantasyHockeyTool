'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'

import {
  loadLeagueSettings,
  onLeagueSettingsUpdated,
  type LeagueSettings,
} from '@/lib/league-settings'

const formatTeamLabel = (team: string | null) => {
  if (!team) return 'FA'
  const trimmed = team.trim()
  return trimmed.length <= 4 ? trimmed.toUpperCase() : trimmed
}

interface RosterEntry {
  playerId: number
  playerName: string
  position: string
  nhlTeam: string | null
  slotPosition: string | null
  injuryStatus?: string | null
}

interface TeamData {
  id: string
  teamName: string
  ownerName: string | null
  roster: RosterEntry[]
  source: 'db'
}

const DEFAULT_SEASON_LABEL = '2026'

interface StandingsEntry {
  rank: number
  teamName: string
  wins: number
  losses: number
  ties: number
  winPercentage: number
  pointsFor: number
  pointsAgainst: number
  G?: number
  A?: number
  plusMinus?: number
  PIM?: number
  PPP?: number
  FOW?: number
  SOG?: number
  HIT?: number
  BLK?: number
  W?: number
  SO?: number
  GAA?: number
  SV?: number
}

export default function TeamInfo() {
  const [leagueSettings, setLeagueSettings] = useState<LeagueSettings | null>(null)
  const [teams, setTeams] = useState<TeamData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null)
  const [standings, setStandings] = useState<StandingsEntry[]>([])
  const [loadingStandings, setLoadingStandings] = useState(false)
  const [sortField, setSortField] = useState<keyof StandingsEntry | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const currentSeasonLabel = useMemo(() => {
    if (leagueSettings?.season && leagueSettings.season.trim().length > 0) {
      return leagueSettings.season
    }
    return DEFAULT_SEASON_LABEL
  }, [leagueSettings?.season])

  const normalizeTeams = useCallback((data: any[]): TeamData[] => {
    return (Array.isArray(data) ? data : []).map(team => {
      const roster = Array.isArray(team.roster) ? team.roster : []
      return {
        id: team.id?.toString?.() ?? String(team.platformTeamId ?? Math.random()),
        teamName: team.teamName ?? team.name ?? 'Unknown Team',
        ownerName: team.ownerName ?? null,
        source: 'db' as const,
        roster: roster.map((entry: any) => ({
          playerId:
            typeof entry.playerId === 'number'
              ? entry.playerId
              : entry.player?.nhlId ?? entry.player?.id ?? Math.random(),
          playerName: entry.player?.fullName ?? entry.playerName ?? 'Unknown Player',
          position: (entry.player?.position ?? entry.position ?? 'N/A').toString(),
          nhlTeam:
            entry.player?.team ??
            entry.nhlTeam ??
            entry.player?.nhlTeam ??
            entry.player?.proTeam ??
            null,
          slotPosition: entry.slotPosition ?? entry.lineupSlot ?? null,
          injuryStatus: entry.player?.injuryStatus ?? entry.injuryStatus ?? null,
        })),
      }
    })
  }, [])

  const loadTeams = useCallback(
    async (settings: LeagueSettings | null, showSpinner = true) => {
      if (!settings?.leagueId) {
        setTeams([])
        setError('Use the Refresh League button in the header to load an ESPN league.')
        return
      }

      if (showSpinner) {
        setLoading(true)
      }
      setError(null)

      try {
        const params = new URLSearchParams({ leagueId: settings.leagueId })
        if (settings.season) {
          params.set('season', settings.season)
        }

        const res = await fetch(`/api/fantasy/teams?${params.toString()}`, {
          cache: 'no-store',
        })
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data?.error || 'Failed to load teams from database')
        }

        // API returns { teams: [...] }, so extract the teams array
        const teamsArray = data.teams || (Array.isArray(data) ? data : [])
        const normalized = normalizeTeams(teamsArray)
        setTeams(normalized)
        setLastLoadedAt(new Date().toISOString())
        if (normalized.length === 0) {
          setError('No teams found in the database for the selected league. Run the refresh again to import rosters.')
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load teams')
        setTeams([])
      } finally {
        if (showSpinner) {
          setLoading(false)
        }
      }
    },
    [normalizeTeams]
  )

  const loadStandings = useCallback(
    async (settings: LeagueSettings | null) => {
      if (!settings?.leagueId) {
        setStandings([])
        return
      }

      setLoadingStandings(true)
      try {
        const params = new URLSearchParams({ leagueId: settings.leagueId })
        if (settings.season) {
          params.set('season', settings.season)
        }

        const res = await fetch(`/api/fantasy/espn-standings?${params.toString()}`, {
          cache: 'no-store',
        })

        if (!res.ok) {
          console.error('Failed to load standings:', await res.text())
          setStandings([])
          return
        }

        const data = await res.json()
        const standingsArray = data.standings || data.results || (Array.isArray(data) ? data : [])
        setStandings(standingsArray)
      } catch (err: any) {
        console.error('Error loading standings:', err)
        setStandings([])
      } finally {
        setLoadingStandings(false)
      }
    },
    []
  )

  useEffect(() => {
    const stored = loadLeagueSettings()
    setLeagueSettings(stored)
    loadTeams(stored, true)
    loadStandings(stored)

    const unsubscribe = onLeagueSettingsUpdated(updated => {
      setLeagueSettings(updated)
      loadTeams(updated, true)
      loadStandings(updated)
    })

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [loadTeams, loadStandings])

  const handleManualReload = async () => {
    await loadTeams(leagueSettings, true)
  }

  const handleSort = (field: keyof StandingsEntry) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  // Calculate rankings for each category and compute TotalScore
  const standingsWithTotalScore = useMemo(() => {
    if (standings.length === 0) return []

    // Categories where higher is better
    const higherIsBetter: (keyof StandingsEntry)[] = ['G', 'A', 'plusMinus', 'PIM', 'PPP', 'FOW', 'SOG', 'HIT', 'BLK', 'W', 'SO', 'SV']
    // Categories where lower is better
    const lowerIsBetter: (keyof StandingsEntry)[] = ['GAA']
    
    const allCategories = [...higherIsBetter, ...lowerIsBetter]
    
    // Calculate rank for each team in each category
    const rankings: Record<number, Record<string, number>> = {}
    
    standings.forEach((_, idx) => {
      rankings[idx] = {}
    })
    
    allCategories.forEach(category => {
      // Get values with indices, filtering out null/undefined
      const values = standings.map((team, idx) => ({
        idx,
        value: team[category] as number | undefined
      })).filter(item => item.value != null)
      
      // Sort based on whether higher or lower is better
      const isHigherBetter = higherIsBetter.includes(category)
      values.sort((a, b) => {
        if (isHigherBetter) {
          return (b.value ?? 0) - (a.value ?? 0) // Higher first
        } else {
          return (a.value ?? 0) - (b.value ?? 0) // Lower first
        }
      })
      
      // Assign ranks (handle ties by giving same rank)
      let currentRank = 1
      values.forEach((item, sortIdx) => {
        if (sortIdx > 0 && item.value === values[sortIdx - 1].value) {
          // Same value as previous, give same rank
          rankings[item.idx][category] = rankings[values[sortIdx - 1].idx][category]
        } else {
          rankings[item.idx][category] = currentRank
        }
        currentRank++
      })
      
      // Teams with null values get last place rank
      standings.forEach((team, idx) => {
        if (team[category] == null) {
          rankings[idx][category] = standings.length
        }
      })
    })
    
    // Calculate total score for each team
    return standings.map((team, idx) => ({
      ...team,
      totalScore: allCategories.reduce((sum, cat) => sum + (rankings[idx][cat] || standings.length), 0)
    }))
  }, [standings])

  const sortedStandings = useMemo(() => {
    if (!sortField || standingsWithTotalScore.length === 0) return standingsWithTotalScore

    return [...standingsWithTotalScore].sort((a, b) => {
      const aValue = a[sortField as keyof typeof a]
      const bValue = b[sortField as keyof typeof b]

      // Handle null/undefined values
      if (aValue == null && bValue == null) return 0
      if (aValue == null) return 1
      if (bValue == null) return -1

      // Handle numeric values
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
      }

      // Handle string values
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      }

      return 0
    })
  }, [standingsWithTotalScore, sortField, sortDirection])

  const lastSyncedDisplay = useMemo(() => {
    const timestamp = leagueSettings?.lastSyncedAt ?? lastLoadedAt
    if (!timestamp) return 'Never'
    return new Date(timestamp).toLocaleString()
  }, [lastLoadedAt, leagueSettings?.lastSyncedAt])

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Current League</h2>
          {leagueSettings?.leagueId ? (
            <div className="text-sm text-gray-600 space-y-1 mt-1">
              <p>
                League:{' '}
                <span className="font-medium text-gray-800">
                  {leagueSettings.leagueName ?? leagueSettings.leagueId}
                </span>
              </p>
              <p>Season: {currentSeasonLabel}</p>
              <p>Last refreshed: {lastSyncedDisplay}</p>
        </div>
          ) : (
            <p className="text-sm text-gray-600 mt-1">
              Use the <span className="font-medium">Refresh League</span> button in the header to pull your ESPN
              rosters into the database.
            </p>
          )}
        </div>
          <button
          type="button"
          onClick={handleManualReload}
          disabled={loading || !leagueSettings?.leagueId}
          className="inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Reload Teams
          </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* ESPN Standings Table */}
      {standings.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">League Standings - Season Stats</h2>
            <button
              type="button"
              onClick={() => loadStandings(leagueSettings)}
              disabled={loadingStandings || !leagueSettings?.leagueId}
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-3 w-3 mr-1.5 ${loadingStandings ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th 
                    className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('rank')}
                  >
                    RK {sortField === 'rank' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('teamName')}
                  >
                    TEAM {sortField === 'teamName' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('G')}
                  >
                    G {sortField === 'G' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('A')}
                  >
                    A {sortField === 'A' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('plusMinus')}
                  >
                    +/- {sortField === 'plusMinus' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('PIM')}
                  >
                    PIM {sortField === 'PIM' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('PPP')}
                  >
                    PPP {sortField === 'PPP' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('FOW')}
                  >
                    FOW {sortField === 'FOW' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('SOG')}
                  >
                    SOG {sortField === 'SOG' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('HIT')}
                  >
                    HIT {sortField === 'HIT' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('BLK')}
                  >
                    BLK {sortField === 'BLK' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('W')}
                  >
                    W {sortField === 'W' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('SO')}
                  >
                    SO {sortField === 'SO' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('GAA')}
                  >
                    GAA {sortField === 'GAA' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('SV')}
                  >
                    SV% {sortField === 'SV' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase cursor-pointer hover:bg-gray-100 select-none bg-blue-50"
                    onClick={() => handleSort('totalScore' as keyof StandingsEntry)}
                  >
                    SCORE {sortField === 'totalScore' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedStandings.map((team, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{team.rank || idx + 1}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                      {team.teamName}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right text-gray-900">{team.G ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right text-gray-900">{team.A ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right text-gray-900">{team.plusMinus ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right text-gray-900">{team.PIM ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right text-gray-900">{team.PPP ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right text-gray-900">{team.FOW ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right text-gray-900">{team.SOG ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right text-gray-900">{team.HIT ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right text-gray-900">{team.BLK ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right text-gray-900">{team.W ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right text-gray-900">{team.SO ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                      {typeof team.GAA === 'number' ? team.GAA.toFixed(3) : '-'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                      {typeof team.SV === 'number' ? (team.SV * 100).toFixed(2) + '%' : '-'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right font-semibold text-blue-700 bg-blue-50">
                      {team.totalScore ?? '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loadingStandings && standings.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
          <div className="animate-pulse">
            <div className="h-5 bg-gray-200 rounded w-1/3 mb-4" />
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={idx} className="h-4 bg-gray-100 rounded" />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={`skeleton-${idx}`}
                className="border border-gray-200 rounded-lg bg-white shadow-sm p-4 animate-pulse"
              >
                <div className="h-5 bg-gray-200 rounded w-2/3" />
                <div className="mt-2 space-y-2">
                  {Array.from({ length: 4 }).map((__, pIdx) => (
                    <div key={`player-skeleton-${idx}-${pIdx}`} className="h-4 bg-gray-100 rounded" />
                  ))}
          </div>
        </div>
            ))
          : teams.map(team => (
              <div key={team.id} className="border border-gray-200 rounded-lg bg-white shadow-sm">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                    <h3 className="text-base font-semibold text-gray-900">
                      <Link href={`/teams/${team.id}`} className="hover:underline text-blue-700">
                        {team.teamName}
                      </Link>
                </h3>
                    {team.ownerName && <p className="text-xs text-gray-500 mt-0.5">Owner: {team.ownerName}</p>}
              </div>
            </div>
                <div className="px-4 py-2">
                  {team.roster.length === 0 && !loading ? (
                    <p className="text-xs text-gray-500">No players found for this roster.</p>
                  ) : (
                    team.roster.map(player => (
                      <div
                        key={`${team.id}-${player.playerId}-${player.playerName}`}
                        className="py-2 border-t border-gray-100 first:border-t-0"
                      >
                <div className="text-sm font-medium text-gray-900">{player.playerName}</div>
                        <div className="text-xs text-gray-600">
                          {formatTeamLabel(player.nhlTeam)} · {player.position || 'N/A'}
                          {(() => {
                            if (!player.slotPosition) return null
                            const slotUpper = player.slotPosition.toUpperCase()
                            if (slotUpper === 'BN' || slotUpper === 'BENCH' || slotUpper === 'F' || slotUpper === 'UTIL') {
                              return null
                            }
                            if (slotUpper === 'G' && player.position !== 'G') {
                              return null
                            }
                            if (slotUpper === player.position?.toUpperCase()) {
                              return null
                            }
                            return ` · ${player.slotPosition}`
                          })()}
                        </div>
                      </div>
                    ))
                  )}
                </div>
          </div>
        ))}
      </div>
    </div>
  )
}


