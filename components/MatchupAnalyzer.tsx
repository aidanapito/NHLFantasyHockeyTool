'use client'

import { useState, useEffect, useCallback } from 'react'
import { Calendar, BarChart3, AlertCircle } from 'lucide-react'

import {
  loadLeagueSettings,
  onLeagueSettingsUpdated,
  type LeagueSettings,
} from '@/lib/league-settings'

interface PlayerGame {
  gameId: number
  date: string // YYYY-MM-DD
  opponent: string // Opponent team abbreviation
  isHome: boolean
}

interface PlayerGameCount {
  playerId: number
  playerName: string
  position: string
  nhlTeam: string | null
  gamesCount: number
  gameDates: string[] // Legacy field for backwards compatibility
  games: PlayerGame[] // Detailed game information
}

interface TeamStats {
  goals: number
  assists: number
  points: number
  plusMinus: number
  pim: number
  powerPlayPoints: number
  shotsOnGoal: number
  hits: number
  blockedShots: number
  wins: number
  shutouts: number
  saves: number
  goalsAgainst: number
  gaa: number
  savePct: number
}

interface TeamMatchupAnalysis {
  teamId: string
  teamName: string
  totalPlayers: number
  playersWithGames: number
  totalGames: number
  playerBreakdown: PlayerGameCount[]
  stats: TeamStats
}

interface MatchupComparison {
  team1: TeamMatchupAnalysis
  team2: TeamMatchupAnalysis
  weekStart: string
  weekEnd: string
  advantage: {
    team: string
    gamesDifference: number
  }
  projections?: {
    team1: TeamStats
    team2: TeamStats
    categoryWins: {
      team1: number
      team2: number
    }
  }
}

interface TeamReference {
  id: string
  source?: 'db' | 'manual' | 'espn'
  leagueId?: string
  season?: string
  platformTeamId?: string
}

interface TeamOption {
  key: string
  label: string
  reference: TeamReference
}

export default function MatchupAnalyzer() {
  const [team1Key, setTeam1Key] = useState<string>('')
  const [team2Key, setTeam2Key] = useState<string>('')
  const [weekStartDate, setWeekStartDate] = useState<string>('')
  const [teams, setTeams] = useState<TeamOption[]>([])
  const [leagueSettings, setLeagueSettings] = useState<LeagueSettings | null>(null)
  const [analysis, setAnalysis] = useState<MatchupComparison | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [standings, setStandings] = useState<any[]>([])
  const [showProjections, setShowProjections] = useState(false)

  const loadSavedTeams = useCallback(
    async (settings: LeagueSettings | null, showSpinner = true) => {
      if (!settings?.leagueId) {
        setTeams([])
        setError('Use the Refresh League button to load an ESPN league before analyzing matchups.')
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
        const response = await fetch(`/api/fantasy/teams?${params.toString()}`, {
          cache: 'no-store',
        })
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data?.error || 'Failed to fetch teams from database')
        }
        // API returns { teams: [...] }, so extract the teams array
        const teamsArray = data.teams || (Array.isArray(data) ? data : [])
        const mapped: TeamOption[] = teamsArray.map((team: any) => ({
          key: `db:${team.id}`,
          label: team.teamName ?? team.name ?? `Team ${team.id}`,
          reference: {
            id: team.id?.toString?.() ?? String(team.id),
            source: 'db',
            leagueId: settings.leagueId,
            season: settings.season,
          },
        }))
        setTeams(mapped.sort((a, b) => a.label.localeCompare(b.label)))
      } catch (err: any) {
        console.error('Error fetching teams:', err)
        setTeams([])
        setError(err?.message || 'Failed to load teams')
      } finally {
        if (showSpinner) {
          setLoading(false)
        }
      }
    },
    []
  )

  useEffect(() => {
    const stored = loadLeagueSettings()
    setLeagueSettings(stored)
    loadSavedTeams(stored ?? null, true)

    const unsubscribe = onLeagueSettingsUpdated(updated => {
      setLeagueSettings(updated)
      loadSavedTeams(updated ?? null, true)
    })

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [loadSavedTeams])

  useEffect(() => {
    if (!team1Key || teams.some(team => team.key === team1Key)) {
      // nothing to do
    } else {
      setTeam1Key('')
    }
    if (!team2Key || teams.some(team => team.key === team2Key)) {
      // nothing to do
    } else {
      setTeam2Key('')
    }
  }, [teams, team1Key, team2Key])

  // Set default week start date to current week's Monday
  useEffect(() => {
    const today = new Date()
    const dayOfWeek = today.getDay()
    let daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    if (dayOfWeek === 1) {
      daysToMonday = 0
    }
    const monday = new Date(today)
    monday.setDate(today.getDate() + daysToMonday)
    monday.setHours(12, 0, 0, 0)
    const iso = new Date(
      Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate())
    )
    setWeekStartDate(iso.toISOString().split('T')[0])
  }, [])

  const analyzeMatchup = async () => {
    if (!team1Key || !team2Key) {
      setError('Please select both teams')
      return
    }

    const team1 = teams.find(option => option.key === team1Key)?.reference
    const team2 = teams.find(option => option.key === team2Key)?.reference

    if (!team1 || !team2) {
      setError('Selected teams are no longer available. Please reload the teams.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Fetch standings data in parallel
      let standingsData: any[] = []
      if (leagueSettings?.leagueId) {
        try {
          const params = new URLSearchParams({ leagueId: leagueSettings.leagueId })
          if (leagueSettings.season) {
            params.set('season', leagueSettings.season)
          }
          const standingsResponse = await fetch(`/api/fantasy/espn-standings?${params.toString()}`, {
            cache: 'no-store',
          })
          if (standingsResponse.ok) {
            const standingsResult = await standingsResponse.json()
            standingsData = standingsResult.standings || standingsResult.results || []
          }
        } catch (standingsErr) {
          console.warn('Failed to fetch standings, continuing without them:', standingsErr)
        }
      }

      const response = await fetch(`/api/matchup/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team1,
          team2,
          weekStartDate: weekStartDate || undefined,
          leagueId: leagueSettings?.leagueId || undefined,
          season: leagueSettings?.season || undefined,
          projections: showProjections,
        }),
      })
      
      if (!response.ok) {
        const contentType = response.headers.get('content-type')
        let errorMessage = 'Failed to analyze matchup'
        
        try {
          if (contentType?.includes('application/json')) {
            const errorData = await response.json()
            errorMessage = errorData.message || errorData.error || errorMessage
          } else {
            const errorText = await response.text()
            // If we got HTML, try to extract useful info
            if (errorText.includes('<!DOCTYPE')) {
              errorMessage = 'Server returned an error page. Check server logs for details.'
            } else {
              errorMessage = errorText.substring(0, 200)
            }
          }
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`
        }
        
        throw new Error(errorMessage)
      }

      const contentType = response.headers.get('content-type')
      if (!contentType?.includes('application/json')) {
        const text = await response.text()
        throw new Error(`Expected JSON but got ${contentType}. Response: ${text.substring(0, 200)}`)
      }

      const result = await response.json()
      let analysisData = result.data

      // Log projections data for debugging
      if (showProjections) {
        console.log('[Matchup Analyzer] Projections requested, received data:', {
          hasProjections: !!analysisData.projections,
          projections: analysisData.projections,
        })
      }

      // Direct mapping of full team names to abbreviations
      const teamNameToAbbrev: Record<string, string> = {
        'On the Hutson': 'Dady',
        'No Longer Boeser than You': 'Mama',
        'Yee Haw (screaming)': 'YH',
        'Yee Haw': 'YH',
        "Theo's Thrashers": 'MASH',
        'Bros Before Hossas': 'Bros',
        'Colonel Klink': 'KLNK',
        "Spoked B's": 'KLUC',
        'Buds 4 Ever!': 'Buds',
        'Buds 4 ever': 'Buds',
        "Stacy's Basketball Team": 'MAC',
        'Stacys Basketball Team': 'MAC',
        'Hockey Team': 'CBS',
      }

      // Reverse mapping: abbrev -> fullName
      const abbrevToFullName: Record<string, string> = {}
      Object.entries(teamNameToAbbrev).forEach(([fullName, abbrev]) => {
        abbrevToFullName[abbrev.toUpperCase()] = fullName
      })

      // Fetch team data to get additional abbreviations for matching
      let teamAbbreviations: Record<string, string> = {} // abbrev -> fullName
      try {
        if (leagueSettings?.leagueId) {
          const teamParams = new URLSearchParams({ leagueId: leagueSettings.leagueId })
          if (leagueSettings.season) {
            teamParams.set('season', leagueSettings.season)
          }
          const teamsResponse = await fetch(`/api/fantasy/espn-teams?${teamParams.toString()}`, {
            cache: 'no-store',
          })
          if (teamsResponse.ok) {
            const teamsData = await teamsResponse.json()
            const espnTeams = teamsData.teams || []
            espnTeams.forEach((team: any) => {
              if (team.abbrev && team.teamName) {
                teamAbbreviations[team.abbrev] = team.teamName
              }
            })
            console.log('[Matchup Analyzer] Team abbreviations loaded:', teamAbbreviations)
          }
        }
      } catch (teamErr) {
        console.warn('[Matchup Analyzer] Failed to load team abbreviations:', teamErr)
      }

      // Merge direct mappings with fetched abbreviations
      Object.assign(teamAbbreviations, abbrevToFullName)

      // Merge standings stats into the analysis if available
      if (standingsData.length > 0 && analysisData.team1 && analysisData.team2) {
        console.log('[Matchup Analyzer] Standings data fetched:', standingsData.length, 'teams')
        console.log('[Matchup Analyzer] Looking for team1:', analysisData.team1.teamName, 'ID:', analysisData.team1.teamId)
        console.log('[Matchup Analyzer] Looking for team2:', analysisData.team2.teamName, 'ID:', analysisData.team2.teamId)
        console.log('[Matchup Analyzer] Available standings teams:', standingsData.map((s: any) => ({
          teamName: s.teamName,
          id: s.id || s.teamId || s.team_id,
          abbrev: s.abbrev || s.abbreviation
        })))
        
        // Get team abbreviations for the selected teams
        // Try to find the team abbreviation from the loaded teams list
        let team1Abbrev: string | undefined
        let team2Abbrev: string | undefined
        
        const team1Option = teams.find(t => t.key === team1Key)
        const team2Option = teams.find(t => t.key === team2Key)
        
        // Check if the team label itself is the abbreviation (short 4-letter codes)
        if (team1Option && team1Option.label.length <= 4) {
          team1Abbrev = team1Option.label.toUpperCase()
        }
        if (team2Option && team2Option.label.length <= 4) {
          team2Abbrev = team2Option.label.toUpperCase()
        }
        
        // Also try to get abbreviation from the team data we fetched
        // The team1Name might be the abbreviation itself
        if (!team1Abbrev) {
          const team1Name = analysisData.team1.teamName
          // If team name is short (likely an abbreviation), use it
          if (team1Name.length <= 4) {
            team1Abbrev = team1Name.toUpperCase()
          } else {
            // Look up the full name in our abbreviations map to get the abbrev
            for (const [abbrev, fullName] of Object.entries(teamAbbreviations)) {
              if (normalizeTeamName(fullName) === normalizeTeamName(team1Name)) {
                team1Abbrev = abbrev
                break
              }
            }
          }
        }
        
        if (!team2Abbrev) {
          const team2Name = analysisData.team2.teamName
          if (team2Name.length <= 4) {
            team2Abbrev = team2Name.toUpperCase()
          } else {
            for (const [abbrev, fullName] of Object.entries(teamAbbreviations)) {
              if (normalizeTeamName(fullName) === normalizeTeamName(team2Name)) {
                team2Abbrev = abbrev
                break
              }
            }
          }
        }
        
        console.log('[Matchup Analyzer] Team1 abbrev:', team1Abbrev, 'from name:', analysisData.team1.teamName)
        console.log('[Matchup Analyzer] Team2 abbrev:', team2Abbrev, 'from name:', analysisData.team2.teamName)

        // Helper function to normalize team names for matching
        const normalizeTeamName = (name: string): string => {
          return name
            .toLowerCase()
            .replace(/\([^)]*\)/g, '') // Remove parenthetical text (owner names)
            .trim()
            .replace(/[^a-z0-9\s]/g, '') // Remove special characters
            .replace(/\s+/g, ' ') // Normalize whitespace
        }

        const team1Standings = standingsData.find((s: any) => {
          const team1Name = analysisData.team1.teamName
          const team1Id = analysisData.team1.teamId?.toString()
          const standingsName = s.teamName || ''
          const standingsId = (s.id || s.teamId || s.team_id)?.toString()
          const standingsAbbrev = s.abbrev || s.abbreviation
          
          // First try to match by ID if available
          if (team1Id && standingsId && team1Id === standingsId) {
            console.log('[Matchup Analyzer] Found team1 by ID match:', standingsName)
            return true
          }
          
          // Try direct mapping first (most reliable)
          if (team1Abbrev) {
            const mappedFullName = teamNameToAbbrev[standingsName]
            if (mappedFullName && mappedFullName === team1Abbrev) {
              console.log('[Matchup Analyzer] Found team1 by direct mapping:', standingsName, '->', team1Abbrev)
              return true
            }
            // Check reverse: if team1Abbrev maps to this standings name
            const fullNameForAbbrev = abbrevToFullName[team1Abbrev.toUpperCase()]
            if (fullNameForAbbrev && normalizeTeamName(fullNameForAbbrev) === normalizeTeamName(standingsName)) {
              console.log('[Matchup Analyzer] Found team1 by reverse direct mapping:', standingsName, '<-', team1Abbrev)
              return true
            }
          }
          
          // Try matching by abbreviation
          // Check if team1Name is an abbreviation and matches standings abbreviation
          if (team1Abbrev && standingsAbbrev && 
              team1Abbrev.toUpperCase() === standingsAbbrev.toUpperCase()) {
            console.log('[Matchup Analyzer] Found team1 by abbreviation match:', standingsName, '(', standingsAbbrev, ')')
            return true
          }
          
          // Check if team1Name matches any full name from the abbreviations map
          const fullNameFromAbbrev = teamAbbreviations[team1Abbrev?.toUpperCase() || '']
          if (fullNameFromAbbrev) {
            const normalizedFullName = normalizeTeamName(fullNameFromAbbrev)
            const normalizedStandings = normalizeTeamName(standingsName)
            if (normalizedFullName === normalizedStandings) {
              console.log('[Matchup Analyzer] Found team1 by abbreviation->full name match:', standingsName)
              return true
            }
          }
          
          // Also check reverse: if standings name matches an abbreviation in our map
          for (const [abbrev, fullName] of Object.entries(teamAbbreviations)) {
            if (normalizeTeamName(fullName) === normalizeTeamName(standingsName) &&
                abbrev.toUpperCase() === team1Abbrev?.toUpperCase()) {
              console.log('[Matchup Analyzer] Found team1 by reverse abbreviation match:', standingsName)
              return true
            }
          }
          
          // Try multiple matching strategies for name
          const normalizedTeam1 = normalizeTeamName(team1Name)
          const normalizedStandings = normalizeTeamName(standingsName)
          
          // Check exact match (normalized)
          if (normalizedTeam1 === normalizedStandings) {
            console.log('[Matchup Analyzer] Found team1 by exact match:', standingsName)
            return true
          }
          
          // Check if one contains the other (case-insensitive substring match)
          if (normalizedTeam1.includes(normalizedStandings) || normalizedStandings.includes(normalizedTeam1)) {
            console.log('[Matchup Analyzer] Found team1 by contains match:', standingsName)
            return true
          }
          
          // Check if they share significant words
          const team1Words = normalizedTeam1.split(' ').filter(w => w.length > 0)
          const standingsWords = normalizedStandings.split(' ').filter(w => w.length > 0)
          const commonWords = team1Words.filter(w => standingsWords.includes(w))
          
          // If one of the words is at least 3 chars and matches, consider it a match
          // This helps with short names like "Dady" and "MAMA"
          if (commonWords.length >= 1 && team1Words.length <= 2 && standingsWords.length <= 2) {
            // For very short names (1-2 words), even one word match is good
            console.log('[Matchup Analyzer] Found team1 by short name word match:', standingsName)
            return true
          }
          
          if (commonWords.length >= 2 || (commonWords.length === 1 && commonWords[0].length > 4)) {
            console.log('[Matchup Analyzer] Found team1 by word match:', standingsName)
            return true
          }
          
          return false
        })

        const team2Standings = standingsData.find((s: any) => {
          const team2Name = analysisData.team2.teamName
          const team2Id = analysisData.team2.teamId?.toString()
          const standingsName = s.teamName || ''
          const standingsId = (s.id || s.teamId || s.team_id)?.toString()
          const standingsAbbrev = s.abbrev || s.abbreviation
          
          // First try to match by ID if available
          if (team2Id && standingsId && team2Id === standingsId) {
            console.log('[Matchup Analyzer] Found team2 by ID match:', standingsName)
            return true
          }
          
          // Try direct mapping first (most reliable)
          if (team2Abbrev) {
            const mappedFullName = teamNameToAbbrev[standingsName]
            if (mappedFullName && mappedFullName === team2Abbrev) {
              console.log('[Matchup Analyzer] Found team2 by direct mapping:', standingsName, '->', team2Abbrev)
              return true
            }
            // Check reverse: if team2Abbrev maps to this standings name
            const fullNameForAbbrev = abbrevToFullName[team2Abbrev.toUpperCase()]
            if (fullNameForAbbrev && normalizeTeamName(fullNameForAbbrev) === normalizeTeamName(standingsName)) {
              console.log('[Matchup Analyzer] Found team2 by reverse direct mapping:', standingsName, '<-', team2Abbrev)
              return true
            }
          }
          
          // Try matching by abbreviation
          // Check if team2Name is an abbreviation and matches standings abbreviation
          if (team2Abbrev && standingsAbbrev && 
              team2Abbrev.toUpperCase() === standingsAbbrev.toUpperCase()) {
            console.log('[Matchup Analyzer] Found team2 by abbreviation match:', standingsName, '(', standingsAbbrev, ')')
            return true
          }
          
          // Check if team2Name matches any full name from the abbreviations map
          const fullNameFromAbbrev = teamAbbreviations[team2Abbrev?.toUpperCase() || '']
          if (fullNameFromAbbrev) {
            const normalizedFullName = normalizeTeamName(fullNameFromAbbrev)
            const normalizedStandings = normalizeTeamName(standingsName)
            if (normalizedFullName === normalizedStandings) {
              console.log('[Matchup Analyzer] Found team2 by abbreviation->full name match:', standingsName)
              return true
            }
          }
          
          // Also check reverse: if standings name matches an abbreviation in our map
          for (const [abbrev, fullName] of Object.entries(teamAbbreviations)) {
            if (normalizeTeamName(fullName) === normalizeTeamName(standingsName) &&
                abbrev.toUpperCase() === team2Abbrev?.toUpperCase()) {
              console.log('[Matchup Analyzer] Found team2 by reverse abbreviation match:', standingsName)
              return true
            }
          }
          
          const normalizedTeam2 = normalizeTeamName(team2Name)
          const normalizedStandings = normalizeTeamName(standingsName)
          
          if (normalizedTeam2 === normalizedStandings) {
            console.log('[Matchup Analyzer] Found team2 by exact match:', standingsName)
            return true
          }
          
          if (normalizedTeam2.includes(normalizedStandings) || normalizedStandings.includes(normalizedTeam2)) {
            console.log('[Matchup Analyzer] Found team2 by contains match:', standingsName)
            return true
          }
          
          const team2Words = normalizedTeam2.split(' ').filter(w => w.length > 0)
          const standingsWords = normalizedStandings.split(' ').filter(w => w.length > 0)
          const commonWords = team2Words.filter(w => standingsWords.includes(w))
          
          // For short names, be more lenient
          if (commonWords.length >= 1 && team2Words.length <= 2 && standingsWords.length <= 2) {
            console.log('[Matchup Analyzer] Found team2 by short name word match:', standingsName)
            return true
          }
          
          if (commonWords.length >= 2 || (commonWords.length === 1 && commonWords[0].length > 4)) {
            console.log('[Matchup Analyzer] Found team2 by word match:', standingsName)
            return true
          }
          
          return false
        })

        console.log('[Matchup Analyzer] Team1 standings found:', !!team1Standings, team1Standings)
        console.log('[Matchup Analyzer] Team2 standings found:', !!team2Standings, team2Standings)

        // Merge standings stats into team stats
        if (team1Standings) {
          console.log('[Matchup Analyzer] Merging team1 standings:', team1Standings)
          analysisData.team1.stats = {
            ...analysisData.team1.stats,
            goals: team1Standings.G ?? analysisData.team1.stats.goals ?? 0,
            assists: team1Standings.A ?? analysisData.team1.stats.assists ?? 0,
            plusMinus: team1Standings.plusMinus ?? analysisData.team1.stats.plusMinus ?? 0,
            pim: team1Standings.PIM ?? analysisData.team1.stats.pim ?? 0,
            powerPlayPoints: team1Standings.PPP ?? analysisData.team1.stats.powerPlayPoints ?? 0,
            shotsOnGoal: team1Standings.SOG ?? analysisData.team1.stats.shotsOnGoal ?? 0,
            hits: team1Standings.HIT ?? analysisData.team1.stats.hits ?? 0,
            blockedShots: team1Standings.BLK ?? analysisData.team1.stats.blockedShots ?? 0,
            wins: team1Standings.W ?? analysisData.team1.stats.wins ?? 0,
            shutouts: team1Standings.SO ?? analysisData.team1.stats.shutouts ?? 0,
            gaa: team1Standings.GAA ?? analysisData.team1.stats.gaa ?? 0,
            savePct: team1Standings.SV ? (team1Standings.SV * 100) : (analysisData.team1.stats.savePct ?? 0),
          }
          console.log('[Matchup Analyzer] Team1 stats after merge:', analysisData.team1.stats)
        } else {
          console.warn('[Matchup Analyzer] Team1 not found in standings')
        }

        if (team2Standings) {
          console.log('[Matchup Analyzer] Merging team2 standings:', team2Standings)
          analysisData.team2.stats = {
            ...analysisData.team2.stats,
            goals: team2Standings.G ?? analysisData.team2.stats.goals ?? 0,
            assists: team2Standings.A ?? analysisData.team2.stats.assists ?? 0,
            plusMinus: team2Standings.plusMinus ?? analysisData.team2.stats.plusMinus ?? 0,
            pim: team2Standings.PIM ?? analysisData.team2.stats.pim ?? 0,
            powerPlayPoints: team2Standings.PPP ?? analysisData.team2.stats.powerPlayPoints ?? 0,
            shotsOnGoal: team2Standings.SOG ?? analysisData.team2.stats.shotsOnGoal ?? 0,
            hits: team2Standings.HIT ?? analysisData.team2.stats.hits ?? 0,
            blockedShots: team2Standings.BLK ?? analysisData.team2.stats.blockedShots ?? 0,
            wins: team2Standings.W ?? analysisData.team2.stats.wins ?? 0,
            shutouts: team2Standings.SO ?? analysisData.team2.stats.shutouts ?? 0,
            gaa: team2Standings.GAA ?? analysisData.team2.stats.gaa ?? 0,
            savePct: team2Standings.SV ? (team2Standings.SV * 100) : (analysisData.team2.stats.savePct ?? 0),
          }
          console.log('[Matchup Analyzer] Team2 stats after merge:', analysisData.team2.stats)
        } else {
          console.warn('[Matchup Analyzer] Team2 not found in standings')
        }

        setStandings(standingsData)
      }

      setAnalysis(analysisData)
    } catch (err: any) {
      console.error('Error analyzing matchup:', err)
      setError(err.message || 'Failed to analyze matchup')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return ''
    const [year, month, day] = dateStr.split('-').map(Number)
    if ([year, month, day].some(Number.isNaN)) {
      return dateStr
    }
    const date = new Date(year, month - 1, day)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h1 className="text-3xl font-bold mb-6 flex items-center gap-2 text-gray-900">
          <BarChart3 className="w-8 h-8" />
          Matchup Analyzer
        </h1>

        <div className="mb-6 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          {leagueSettings?.leagueId ? (
            <div className="space-y-1">
              <p>
                League:{' '}
                <span className="font-semibold text-gray-900">
                  {leagueSettings.leagueName ?? leagueSettings.leagueId}
                </span>
              </p>
              <p>Season: {leagueSettings.season ?? '2026'}</p>
              <p>
                Last refreshed:{' '}
                <span className="font-medium text-gray-800">
                  {leagueSettings.lastSyncedAt
                    ? new Date(leagueSettings.lastSyncedAt).toLocaleString()
                    : 'Not yet'}
                </span>
              </p>
            </div>
          ) : (
            <p>
              Use the <span className="font-semibold">Refresh League</span> button in the header to load ESPN rosters. Once synced, teams will appear here automatically.
            </p>
          )}
        </div>

        {/* Team Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Team 1
            </label>
            <select
              value={team1Key}
              onChange={(e) => setTeam1Key(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
            >
              <option value="" className="text-gray-900">Select Team 1</option>
              {teams.map((team) => (
                <option key={team.key} value={team.key} className="text-gray-900">
                  {team.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Team 2
            </label>
            <select
              value={team2Key}
              onChange={(e) => setTeam2Key(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
            >
              <option value="" className="text-gray-900">Select Team 2</option>
              {teams.map((team) => (
                <option key={team.key} value={team.key} className="text-gray-900">
                  {team.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Team Loading Controls */}
        <div className="grid grid-cols-1 gap-4 mb-6">
          <div className="space-y-2">
            <button
              onClick={() => loadSavedTeams(leagueSettings, true)}
              className="w-full md:w-auto px-4 py-2 bg-slate-600 text-white rounded-md hover:bg-slate-700 disabled:bg-gray-400 disabled:text-gray-200 transition-colors"
              disabled={loading || !leagueSettings?.leagueId}
            >
              Reload Teams from Database
            </button>
            <p className="text-xs text-gray-500">
              Teams are sourced from the database. Use the Refresh League button in the header to pull the latest rosters from ESPN and save them for every page.
            </p>
          </div>
        </div>

        {/* Week Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Calendar className="w-4 h-4 inline mr-2" />
            Week Start Date (Monday)
          </label>
          <input
            type="date"
            value={weekStartDate}
            onChange={(e) => setWeekStartDate(e.target.value)}
            className="w-full md:w-auto px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
          />
        </div>

        {/* Projections Toggle */}
        <div className="mb-4">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={showProjections}
              onChange={(e) => setShowProjections(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span>Show Projected Stats (ML Model)</span>
          </label>
          {showProjections && (
            <p className="mt-1 text-xs text-gray-500">
              Projections may take longer to generate. Using ML model to predict player performance for the week.
            </p>
          )}
        </div>

        {/* Analyze Button */}
        <button
          onClick={analyzeMatchup}
          disabled={loading || !team1Key || !team2Key}
          className="w-full md:w-auto px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed font-medium transition-colors"
        >
          {loading ? 'Analyzing...' : 'Analyze Matchup'}
        </button>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {analysis && (
        <div className="space-y-6">
          {/* Team Stats Comparison */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-xl font-bold mb-4 text-gray-900">Team Stats Comparison</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Skater Stats */}
              <div>
                <h4 className="font-semibold text-lg mb-3 text-gray-700">Skater Stats</h4>
                <div className="space-y-2">
                  {[
                    { key: 'goals', label: 'Goals' },
                    { key: 'assists', label: 'Assists' },
                    { key: 'plusMinus', label: '+/-' },
                    { key: 'pim', label: 'PIM' },
                    { key: 'powerPlayPoints', label: 'PPP' },
                    { key: 'shotsOnGoal', label: 'Shots' },
                    { key: 'hits', label: 'Hits' },
                    { key: 'blockedShots', label: 'Blocks' },
                  ].map(({ key, label }) => {
                    const team1Value = analysis.team1.stats[key as keyof TeamStats] || 0
                    const team2Value = analysis.team2.stats[key as keyof TeamStats] || 0
                    const team1Wins = team1Value > team2Value
                    const team2Wins = team2Value > team1Value
                    const diff = Math.abs(team1Value - team2Value)
                    const isHigherBetter = true // For most stats, higher is better
                    
                    return (
                      <div key={key} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="font-medium text-sm text-gray-700 w-20">{label}</span>
                        <div className="flex items-center gap-4 flex-1">
                          <span className={`font-semibold text-sm ${team1Wins ? 'text-blue-600' : team2Wins ? 'text-gray-500' : 'text-gray-700'} w-20 text-right`}>
                            {team1Value.toLocaleString()}
                          </span>
                          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div className="flex h-full">
                              <div 
                                className={`${team1Wins ? 'bg-blue-500' : 'bg-gray-300'} transition-all`}
                                style={{ 
                                  width: team1Value + team2Value > 0 
                                    ? `${(team1Value / (team1Value + team2Value)) * 100}%` 
                                    : '50%' 
                                }}
                              />
                              <div 
                                className={`${team2Wins ? 'bg-red-500' : 'bg-gray-300'} transition-all`}
                                style={{ 
                                  width: team1Value + team2Value > 0 
                                    ? `${(team2Value / (team1Value + team2Value)) * 100}%` 
                                    : '50%' 
                                }}
                              />
                            </div>
                          </div>
                          <span className={`font-semibold text-sm ${team2Wins ? 'text-red-600' : team1Wins ? 'text-gray-500' : 'text-gray-700'} w-20 text-right`}>
                            {team2Value.toLocaleString()}
                          </span>
                          {(team1Wins || team2Wins) && (
                            <span className="text-xs text-gray-500 w-12 text-right">
                              {team1Wins ? '+' : '-'}{diff.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Goalie Stats */}
              <div>
                <h4 className="font-semibold text-lg mb-3 text-gray-700">Goalie Stats</h4>
                <div className="space-y-2">
                  {[
                    { key: 'wins', label: 'Wins', higherBetter: true },
                    { key: 'shutouts', label: 'Shutouts', higherBetter: true },
                    { key: 'savePct', label: 'SV%', higherBetter: true, format: (v: number) => v.toFixed(2) + '%' },
                    { key: 'gaa', label: 'GAA', higherBetter: false, format: (v: number) => v.toFixed(2) },
                  ].map(({ key, label, higherBetter, format }) => {
                    const team1Value = analysis.team1.stats[key as keyof TeamStats] || 0
                    const team2Value = analysis.team2.stats[key as keyof TeamStats] || 0
                    const team1Wins = higherBetter ? team1Value > team2Value : team1Value < team2Value
                    const team2Wins = higherBetter ? team2Value > team1Value : team2Value < team1Value
                    const diff = Math.abs(team1Value - team2Value)
                    
                    const displayValue = (v: number) => format ? format(v) : v.toLocaleString()
                    
                    return (
                      <div key={key} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="font-medium text-sm text-gray-700 w-20">{label}</span>
                        <div className="flex items-center gap-4 flex-1">
                          <span className={`font-semibold text-sm ${team1Wins ? 'text-blue-600' : team2Wins ? 'text-gray-500' : 'text-gray-700'} w-20 text-right`}>
                            {displayValue(team1Value)}
                          </span>
                          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div className="flex h-full">
                              <div 
                                className={`${team1Wins ? 'bg-blue-500' : 'bg-gray-300'} transition-all`}
                                style={{ 
                                  width: team1Value + team2Value > 0 
                                    ? `${(team1Value / (team1Value + team2Value)) * 100}%` 
                                    : '50%' 
                                }}
                              />
                              <div 
                                className={`${team2Wins ? 'bg-red-500' : 'bg-gray-300'} transition-all`}
                                style={{ 
                                  width: team1Value + team2Value > 0 
                                    ? `${(team2Value / (team1Value + team2Value)) * 100}%` 
                                    : '50%' 
                                }}
                              />
                            </div>
                          </div>
                          <span className={`font-semibold text-sm ${team2Wins ? 'text-red-600' : team1Wins ? 'text-gray-500' : 'text-gray-700'} w-20 text-right`}>
                            {displayValue(team2Value)}
                          </span>
                          {(team1Wins || team2Wins) && (
                            <span className="text-xs text-gray-500 w-12 text-right">
                              {team1Wins ? '+' : '-'}{format ? displayValue(diff) : diff.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            
            {/* Summary */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h4 className="font-semibold text-lg mb-3 text-gray-700">Category Wins</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">
                    {(() => {
                      let wins = 0
                      // Higher is better stats
                      wins += (analysis.team1.stats.goals > analysis.team2.stats.goals) ? 1 : 0
                      wins += (analysis.team1.stats.assists > analysis.team2.stats.assists) ? 1 : 0
                      wins += (analysis.team1.stats.plusMinus > analysis.team2.stats.plusMinus) ? 1 : 0
                      wins += (analysis.team1.stats.pim > analysis.team2.stats.pim) ? 1 : 0
                      wins += (analysis.team1.stats.powerPlayPoints > analysis.team2.stats.powerPlayPoints) ? 1 : 0
                      wins += (analysis.team1.stats.shotsOnGoal > analysis.team2.stats.shotsOnGoal) ? 1 : 0
                      wins += (analysis.team1.stats.hits > analysis.team2.stats.hits) ? 1 : 0
                      wins += (analysis.team1.stats.blockedShots > analysis.team2.stats.blockedShots) ? 1 : 0
                      wins += (analysis.team1.stats.wins > analysis.team2.stats.wins) ? 1 : 0
                      wins += (analysis.team1.stats.shutouts > analysis.team2.stats.shutouts) ? 1 : 0
                      wins += (analysis.team1.stats.savePct > analysis.team2.stats.savePct) ? 1 : 0
                      // Lower is better for GAA
                      wins += (analysis.team1.stats.gaa > 0 && analysis.team2.stats.gaa > 0 && analysis.team1.stats.gaa < analysis.team2.stats.gaa) ? 1 : 0
                      return wins
                    })()}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">Categories {analysis.team1.teamName} leads</p>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <p className="text-2xl font-bold text-red-600">
                    {(() => {
                      let wins = 0
                      // Higher is better stats
                      wins += (analysis.team2.stats.goals > analysis.team1.stats.goals) ? 1 : 0
                      wins += (analysis.team2.stats.assists > analysis.team1.stats.assists) ? 1 : 0
                      wins += (analysis.team2.stats.plusMinus > analysis.team1.stats.plusMinus) ? 1 : 0
                      wins += (analysis.team2.stats.pim > analysis.team1.stats.pim) ? 1 : 0
                      wins += (analysis.team2.stats.powerPlayPoints > analysis.team1.stats.powerPlayPoints) ? 1 : 0
                      wins += (analysis.team2.stats.shotsOnGoal > analysis.team1.stats.shotsOnGoal) ? 1 : 0
                      wins += (analysis.team2.stats.hits > analysis.team1.stats.hits) ? 1 : 0
                      wins += (analysis.team2.stats.blockedShots > analysis.team1.stats.blockedShots) ? 1 : 0
                      wins += (analysis.team2.stats.wins > analysis.team1.stats.wins) ? 1 : 0
                      wins += (analysis.team2.stats.shutouts > analysis.team1.stats.shutouts) ? 1 : 0
                      wins += (analysis.team2.stats.savePct > analysis.team1.stats.savePct) ? 1 : 0
                      // Lower is better for GAA
                      wins += (analysis.team1.stats.gaa > 0 && analysis.team2.stats.gaa > 0 && analysis.team2.stats.gaa < analysis.team1.stats.gaa) ? 1 : 0
                      return wins
                    })()}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">Categories {analysis.team2.teamName} leads</p>
                </div>
              </div>
            </div>
          </div>

          {/* Projected Stats Section */}
          {showProjections && analysis.projections && (
            <div className="bg-gradient-to-br from-green-50 to-blue-50 rounded-lg shadow-md p-6 border-2 border-green-200">
              <h3 className="text-xl font-bold mb-4 text-gray-900 flex items-center gap-2">
                <span className="text-2xl">📊</span>
                Projected Stats (ML Model)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Projected Skater Stats */}
                <div>
                  <h4 className="font-semibold text-lg mb-3 text-gray-700">Projected Skater Stats</h4>
                  <div className="space-y-2">
                    {[
                      { key: 'goals', label: 'Goals' },
                      { key: 'assists', label: 'Assists' },
                      { key: 'plusMinus', label: '+/-' },
                      { key: 'pim', label: 'PIM' },
                      { key: 'powerPlayPoints', label: 'PPP' },
                      { key: 'shotsOnGoal', label: 'Shots' },
                      { key: 'hits', label: 'Hits' },
                      { key: 'blockedShots', label: 'Blocks' },
                    ].map(({ key, label }) => {
                      const current1 = analysis.team1.stats[key as keyof TeamStats] || 0
                      const current2 = analysis.team2.stats[key as keyof TeamStats] || 0
                      const projected1 = analysis.projections!.team1[key as keyof TeamStats] || 0
                      const projected2 = analysis.projections!.team2[key as keyof TeamStats] || 0
                      const team1Wins = projected1 > projected2
                      const team2Wins = projected2 > projected1
                      
                      return (
                        <div key={key} className="flex items-center justify-between p-2 bg-white/70 rounded">
                          <span className="font-medium text-sm text-gray-700 w-20">{label}</span>
                          <div className="flex items-center gap-4 flex-1">
                            <span className={`font-semibold text-sm ${team1Wins ? 'text-green-600' : team2Wins ? 'text-gray-500' : 'text-gray-700'} w-20 text-right`}>
                              {projected1.toFixed(1)}
                            </span>
                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div className="flex h-full">
                                <div 
                                  className={`${team1Wins ? 'bg-green-500' : 'bg-gray-300'} transition-all`}
                                  style={{ 
                                    width: projected1 + projected2 > 0 
                                      ? `${(projected1 / (projected1 + projected2)) * 100}%` 
                                      : '50%' 
                                  }}
                                />
                                <div 
                                  className={`${team2Wins ? 'bg-orange-500' : 'bg-gray-300'} transition-all`}
                                  style={{ 
                                    width: projected1 + projected2 > 0 
                                      ? `${(projected2 / (projected1 + projected2)) * 100}%` 
                                      : '50%' 
                                  }}
                                />
                              </div>
                            </div>
                            <span className={`font-semibold text-sm ${team2Wins ? 'text-orange-600' : team1Wins ? 'text-gray-500' : 'text-gray-700'} w-20 text-right`}>
                              {projected2.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Projected Goalie Stats */}
                <div>
                  <h4 className="font-semibold text-lg mb-3 text-gray-700">Projected Goalie Stats</h4>
                  <div className="space-y-2">
                    {[
                      { key: 'wins', label: 'Wins', higherBetter: true },
                      { key: 'shutouts', label: 'Shutouts', higherBetter: true },
                      { key: 'savePct', label: 'SV%', higherBetter: true, format: (v: number) => v.toFixed(2) + '%' },
                      { key: 'gaa', label: 'GAA', higherBetter: false, format: (v: number) => v.toFixed(2) },
                    ].map(({ key, label, higherBetter, format }) => {
                      const projected1 = analysis.projections!.team1[key as keyof TeamStats] || 0
                      const projected2 = analysis.projections!.team2[key as keyof TeamStats] || 0
                      const team1Wins = higherBetter ? projected1 > projected2 : projected1 < projected2
                      const team2Wins = higherBetter ? projected2 > projected1 : projected2 < projected1
                      
                      const displayValue = (v: number) => format ? format(v) : v.toFixed(1)
                      
                      return (
                        <div key={key} className="flex items-center justify-between p-2 bg-white/70 rounded">
                          <span className="font-medium text-sm text-gray-700 w-20">{label}</span>
                          <div className="flex items-center gap-4 flex-1">
                            <span className={`font-semibold text-sm ${team1Wins ? 'text-green-600' : team2Wins ? 'text-gray-500' : 'text-gray-700'} w-20 text-right`}>
                              {displayValue(projected1)}
                            </span>
                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div className="flex h-full">
                                <div 
                                  className={`${team1Wins ? 'bg-green-500' : 'bg-gray-300'} transition-all`}
                                  style={{ 
                                    width: projected1 + projected2 > 0 
                                      ? `${(projected1 / (projected1 + projected2)) * 100}%` 
                                      : '50%' 
                                  }}
                                />
                                <div 
                                  className={`${team2Wins ? 'bg-orange-500' : 'bg-gray-300'} transition-all`}
                                  style={{ 
                                    width: projected1 + projected2 > 0 
                                      ? `${(projected2 / (projected1 + projected2)) * 100}%` 
                                      : '50%' 
                                  }}
                                />
                              </div>
                            </div>
                            <span className={`font-semibold text-sm ${team2Wins ? 'text-orange-600' : team1Wins ? 'text-gray-500' : 'text-gray-700'} w-20 text-right`}>
                              {displayValue(projected2)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
              
              {/* Projected Category Wins Summary */}
              <div className="mt-6 pt-6 border-t border-green-200">
                <h4 className="font-semibold text-lg mb-3 text-gray-700">Projected Category Wins</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-green-100 rounded-lg border-2 border-green-300">
                    <p className="text-3xl font-bold text-green-700">
                      {analysis.projections.categoryWins.team1}
                    </p>
                    <p className="text-sm text-gray-700 mt-1">Categories {analysis.team1.teamName} is projected to win</p>
                  </div>
                  <div className="text-center p-4 bg-orange-100 rounded-lg border-2 border-orange-300">
                    <p className="text-3xl font-bold text-orange-700">
                      {analysis.projections.categoryWins.team2}
                    </p>
                    <p className="text-sm text-gray-700 mt-1">Categories {analysis.team2.teamName} is projected to win</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Player Game Schedules */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-xl font-bold mb-4 text-gray-900">Player Game Schedules</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Team 1 Players */}
              <div>
                <h4 className="font-semibold text-lg mb-3 text-blue-600">
                  {analysis.team1.teamName}
                  <span className="ml-2 text-sm text-gray-600 font-normal">
                    ({analysis.team1.totalGames} total games)
                  </span>
                </h4>
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {analysis.team1.playerBreakdown
                    .sort((a, b) => (b.gamesCount || 0) - (a.gamesCount || 0))
                    .map((player) => (
                      <div
                        key={player.playerId}
                        className="border border-gray-200 rounded-lg p-3 bg-gray-50"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-gray-900">
                              {player.playerName}
                            </span>
                            <span className="text-xs text-gray-500 px-2 py-0.5 bg-gray-200 rounded">
                              {player.position}
                            </span>
                            {player.nhlTeam && (
                              <span className="text-xs text-gray-600 px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                                {player.nhlTeam}
                              </span>
                            )}
                          </div>
                          <span className="text-sm font-semibold text-gray-700">
                            {player.gamesCount || 0} {player.gamesCount === 1 ? 'game' : 'games'}
                          </span>
                        </div>
                        {player.games && player.games.length > 0 ? (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {player.games.map((game, idx) => {
                              const gameDate = new Date(game.date + 'T12:00:00')
                              const dayAbbrev = gameDate.toLocaleDateString('en-US', {
                                weekday: 'short',
                              })
                              const dateStr = gameDate.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })

                              return (
                                <div
                                  key={`${game.gameId}-${idx}`}
                                  className="text-xs px-2 py-1 rounded bg-white border border-gray-300"
                                >
                                  <div className="font-medium text-gray-900">
                                    {dayAbbrev} {dateStr}
                                  </div>
                                  <div className="text-gray-600">
                                    {game.isHome ? 'vs' : '@'} {game.opponent}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500 italic mt-1">No games scheduled</div>
                        )}
                      </div>
                    ))}
                </div>
              </div>

              {/* Team 2 Players */}
              <div>
                <h4 className="font-semibold text-lg mb-3 text-red-600">
                  {analysis.team2.teamName}
                  <span className="ml-2 text-sm text-gray-600 font-normal">
                    ({analysis.team2.totalGames} total games)
                  </span>
                </h4>
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {analysis.team2.playerBreakdown
                    .sort((a, b) => (b.gamesCount || 0) - (a.gamesCount || 0))
                    .map((player) => (
                      <div
                        key={player.playerId}
                        className="border border-gray-200 rounded-lg p-3 bg-gray-50"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-gray-900">
                              {player.playerName}
                            </span>
                            <span className="text-xs text-gray-500 px-2 py-0.5 bg-gray-200 rounded">
                              {player.position}
                            </span>
                            {player.nhlTeam && (
                              <span className="text-xs text-gray-600 px-2 py-0.5 bg-red-100 text-red-700 rounded">
                                {player.nhlTeam}
                              </span>
                            )}
                          </div>
                          <span className="text-sm font-semibold text-gray-700">
                            {player.gamesCount || 0} {player.gamesCount === 1 ? 'game' : 'games'}
                          </span>
                        </div>
                        {player.games && player.games.length > 0 ? (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {player.games.map((game, idx) => {
                              const gameDate = new Date(game.date + 'T12:00:00')
                              const dayAbbrev = gameDate.toLocaleDateString('en-US', {
                                weekday: 'short',
                              })
                              const dateStr = gameDate.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })

                              return (
                                <div
                                  key={`${game.gameId}-${idx}`}
                                  className="text-xs px-2 py-1 rounded bg-white border border-gray-300"
                                >
                                  <div className="font-medium text-gray-900">
                                    {dayAbbrev} {dateStr}
                                  </div>
                                  <div className="text-gray-600">
                                    {game.isHome ? 'vs' : '@'} {game.opponent}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500 italic mt-1">No games scheduled</div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

