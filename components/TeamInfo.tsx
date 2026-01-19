'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'

import {
  loadLeagueSettings,
  onLeagueSettingsUpdated,
  type LeagueSettings,
} from '@/lib/league-settings'
import { calculateTPV } from '@/lib/enhanced-valuation-engine'

const formatTeamLabel = (team: string | null) => {
  if (!team) return 'FA'
  const trimmed = team.trim()
  return trimmed.length <= 4 ? trimmed.toUpperCase() : trimmed
}

// Z-score calculation functions
function calculateSkaterZScore(
  stats: { goals: number; assists: number; plusMinus: number; pims: number; shots: number; hits: number; blocks: number; ppPoints: number; fow: number },
  allStats: Array<{ goals: number; assists: number; plusMinus: number; pims: number; shots: number; hits: number; blocks: number; ppPoints: number; fow: number }>
): number {
  if (allStats.length === 0) return 0
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
  const stdDev = (arr: number[]) => {
    const m = mean(arr)
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length)
  }
  const zScore = (val: number, arr: number[]) => {
    const s = stdDev(arr)
    return s === 0 ? 0 : (val - mean(arr)) / s
  }
  const weights = { goals: 3, assists: 2, plusMinus: 0.5, pims: 0.5, shots: 0.5, hits: 0.5, blocks: 0.5, ppPoints: 1, fow: 0.25 }
  return (
    zScore(stats.goals, allStats.map(s => s.goals)) * weights.goals +
    zScore(stats.assists, allStats.map(s => s.assists)) * weights.assists +
    zScore(stats.plusMinus, allStats.map(s => s.plusMinus)) * weights.plusMinus +
    zScore(stats.pims, allStats.map(s => s.pims)) * weights.pims +
    zScore(stats.shots, allStats.map(s => s.shots)) * weights.shots +
    zScore(stats.hits, allStats.map(s => s.hits)) * weights.hits +
    zScore(stats.blocks, allStats.map(s => s.blocks)) * weights.blocks +
    zScore(stats.ppPoints, allStats.map(s => s.ppPoints)) * weights.ppPoints +
    zScore(stats.fow, allStats.map(s => s.fow)) * weights.fow
  )
}

function calculateGoalieZScore(
  stats: { wins: number; shutouts: number; savePct: number; gaa: number },
  allStats: Array<{ wins: number; shutouts: number; savePct: number; gaa: number }>
): number {
  if (allStats.length === 0) return 0
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
  const stdDev = (arr: number[]) => {
    const m = mean(arr)
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length)
  }
  const zScore = (val: number, arr: number[]) => {
    const s = stdDev(arr)
    return s === 0 ? 0 : (val - mean(arr)) / s
  }
  const weights = { wins: 3, shutouts: 2, savePct: 2, gaa: -2 }
  return (
    zScore(stats.wins, allStats.map(s => s.wins)) * weights.wins +
    zScore(stats.shutouts, allStats.map(s => s.shutouts)) * weights.shutouts +
    zScore(stats.savePct, allStats.map(s => s.savePct)) * weights.savePct +
    zScore(stats.gaa, allStats.map(s => s.gaa)) * weights.gaa
  )
}

interface PlayerStatsData {
  playerId: number
  fullName: string
  zScore: number
  tpv: number
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
  const [playerStats, setPlayerStats] = useState<Map<string, PlayerStatsData>>(new Map())

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

  // Load player stats with Z-scores and TPV
  const loadPlayerStats = useCallback(async () => {
    try {
      const res = await fetch('/api/players/stats?season=20252026', { cache: 'no-store' })
      if (!res.ok) return
      
      const data = await res.json()
      const skaters = data.skaters || []
      const goalies = data.goalies || []
      
      const statsMap = new Map<string, PlayerStatsData>()
      
      // Prepare data for Z-score calculations
      const skaterZStats = skaters.map((p: any) => ({
        goals: p.goals || 0,
        assists: p.assists || 0,
        plusMinus: p.plusMinus || 0,
        pims: p.penaltyMinutes || p.pim || 0,
        shots: p.shots || 0,
        hits: p.hits || 0,
        blocks: p.blockedShots || p.blocks || 0,
        ppPoints: p.ppPoints || ((p.ppGoals || 0) + (p.ppAssists || 0)),
        fow: p.faceoffsWon || p.fow || 0,
      }))
      
      const skaterTPVStats = skaters.map((p: any) => ({
        goals: p.goals || 0,
        assists: p.assists || 0,
        plusMinus: p.plusMinus || 0,
        penaltyMinutes: p.penaltyMinutes || p.pim || 0,
        shots: p.shots || 0,
        hits: p.hits || 0,
        blockedShots: p.blockedShots || p.blocks || 0,
        powerPlayPoints: p.ppPoints || ((p.ppGoals || 0) + (p.ppAssists || 0)),
        gamesPlayed: p.gamesPlayed || 0,
      }))
      
      skaters.forEach((p: any, idx: number) => {
        const name = (p.fullName || p.name || '').toLowerCase().trim()
        const zScore = calculateSkaterZScore(skaterZStats[idx], skaterZStats)
        const tpv = calculateTPV(skaterTPVStats[idx], skaterTPVStats)
        statsMap.set(name, { playerId: p.playerId || p.id, fullName: p.fullName || p.name, zScore, tpv })
      })
      
      // Goalie Z-scores
      const goalieZStats = goalies.map((p: any) => ({
        wins: p.wins || 0,
        shutouts: p.shutouts || 0,
        savePct: parseFloat(p.savePct || p.savePercentage || '0') || 0,
        gaa: parseFloat(p.gaa || p.goalsAgainstAverage || '0') || 0,
      }))
      
      goalies.forEach((p: any, idx: number) => {
        const name = (p.fullName || p.name || '').toLowerCase().trim()
        const zScore = calculateGoalieZScore(goalieZStats[idx], goalieZStats)
        statsMap.set(name, { playerId: p.playerId || p.id, fullName: p.fullName || p.name, zScore, tpv: zScore })
      })
      
      setPlayerStats(statsMap)
    } catch (err) {
      console.error('Error loading player stats:', err)
    }
  }, [])

  useEffect(() => {
    const stored = loadLeagueSettings()
    setLeagueSettings(stored)
    loadTeams(stored, true)
    loadStandings(stored)
    loadPlayerStats()

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
  }, [loadTeams, loadStandings, loadPlayerStats])

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

  const sortedStandings = useMemo(() => {
    if (!sortField || standings.length === 0) return standings

    return [...standings].sort((a, b) => {
      const aValue = a[sortField]
      const bValue = b[sortField]

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
  }, [standings, sortField, sortDirection])

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
                    team.roster.map(player => {
                      const stats = playerStats.get(player.playerName.toLowerCase().trim())
                      return (
                        <div
                          key={`${team.id}-${player.playerId}-${player.playerName}`}
                          className="py-2 border-t border-gray-100 first:border-t-0 flex items-center justify-between"
                        >
                          <div className="flex-1 min-w-0">
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
                          {stats && (
                            <div className="flex gap-2 text-xs ml-2">
                              <span className={`px-1.5 py-0.5 rounded ${stats.zScore >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                Z: {stats.zScore.toFixed(1)}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                                TPV: {stats.tpv.toFixed(1)}
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
          </div>
        ))}
      </div>
    </div>
  )
}


