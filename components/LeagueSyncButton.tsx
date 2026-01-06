'use client'

import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'

import {
  loadLeagueSettings,
  saveLeagueSettings,
  type LeagueSettings,
} from '@/lib/league-settings'

type StatusState = 'idle' | 'loading' | 'success' | 'error'

export default function LeagueSyncButton() {
  const [open, setOpen] = useState(false)
  const [leagueIdInput, setLeagueIdInput] = useState('')
  const [seasonInput, setSeasonInput] = useState('')
  const [status, setStatus] = useState<StatusState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [leagueName, setLeagueName] = useState<string | undefined>()

  useEffect(() => {
    const stored = loadLeagueSettings()
    if (stored?.leagueId) {
      setLeagueIdInput(stored.leagueId)
      setSeasonInput(stored.season ?? '')
      setLastSyncedAt(stored.lastSyncedAt ?? null)
      setLeagueName(stored.leagueName)
    }
  }, [])

  const lastSyncedLabel = useMemo(() => {
    if (!lastSyncedAt) return 'Never synced'
    return new Date(lastSyncedAt).toLocaleString()
  }, [lastSyncedAt])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!leagueIdInput.trim()) {
      setStatus('error')
      setMessage('League ID is required')
      return
    }

    setStatus('loading')
    setMessage(null)

    try {
      // Refresh both NHL stats and league data in parallel
      const [nhlRes, leagueRes] = await Promise.allSettled([
        fetch('/api/refresh-stats', { method: 'POST' }),
        fetch('/api/fantasy/league/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leagueId: leagueIdInput.trim(),
            season: seasonInput.trim() || undefined,
          }),
        }),
      ])

      // Parse responses
      let nhlResult: any = null
      let nhlOk = false
      if (nhlRes.status === 'fulfilled') {
        const response = nhlRes.value
        nhlOk = response.ok
        try {
          nhlResult = await response.json()
        } catch (e) {
          // Failed to parse NHL response - might be HTML error page
          if (!nhlOk) {
            nhlResult = { error: `HTTP ${response.status}: ${response.statusText}` }
          }
        }
      }

      let leagueResult: any = null
      let leagueOk = false
      if (leagueRes.status === 'fulfilled') {
        const response = leagueRes.value
        leagueOk = response.ok
        try {
          leagueResult = await response.json()
        } catch (e) {
          // Failed to parse league response - might be HTML error page
          if (!leagueOk) {
            leagueResult = { error: `HTTP ${response.status}: ${response.statusText}` }
          }
        }
      }

      // Build summary message
      const summaryParts: string[] = []
      const errors: string[] = []

      if (nhlOk) {
        summaryParts.push('NHL stats refreshed')
      } else {
        const errorMsg = nhlResult?.error || nhlResult?.message || 'NHL stats refresh failed'
        errors.push(errorMsg)
      }

      if (leagueOk && leagueResult) {
        summaryParts.push(`Updated ${leagueResult.updatedTeams ?? 0} teams`)
        if (leagueResult.updatedPlayers) {
          summaryParts.push(`${leagueResult.updatedPlayers} players`)
        }
        setLeagueName(leagueResult.leagueName)
        if (typeof leagueResult.refreshedAt === 'string') {
          setLastSyncedAt(leagueResult.refreshedAt)
        } else {
          setLastSyncedAt(new Date().toISOString())
        }

        const settings: LeagueSettings = {
          leagueId: leagueIdInput.trim(),
          season: seasonInput.trim() || undefined,
          leagueName: leagueResult.leagueName ?? leagueResult.league?.leagueName,
          fantasyLeagueId: leagueResult.league?.id,
          lastSyncedAt: leagueResult.refreshedAt ?? new Date().toISOString(),
        }
        saveLeagueSettings(settings)
      } else {
        const errorMsg = leagueResult?.error || leagueResult?.message || 'League refresh failed'
        errors.push(errorMsg)
      }

      // Set status and message
      if (errors.length > 0 && summaryParts.length === 0) {
        // All failed
        setStatus('error')
        setMessage(errors.join(' • '))
      } else if (errors.length > 0) {
        // Partial success
        setStatus('success')
        setMessage([...summaryParts, ...errors].join(' • '))
      } else {
        // All succeeded
        setStatus('success')
        setMessage(summaryParts.join(' • '))
      }
    } catch (err: any) {
      setStatus('error')
      setMessage(err?.message || 'Failed to refresh')
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
      >
        <RefreshCw className="h-4 w-4 mr-2" />
        Refresh
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-lg border border-gray-200 bg-white shadow-xl z-50">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Refresh All Data</h3>
              {leagueName && (
                <p className="text-xs text-gray-500 truncate">
                  Current: <span className="font-medium text-gray-700">{leagueName}</span>
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="px-4 py-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">League ID</label>
              <input
                type="text"
                value={leagueIdInput}
                onChange={event => setLeagueIdInput(event.target.value)}
                placeholder="e.g. 12345"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Season (optional)</label>
              <input
                type="text"
                value={seasonInput}
                onChange={event => setSeasonInput(event.target.value)}
                placeholder="e.g. 2026"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="text-xs text-gray-500">
              Last synced:{' '}
              <span className="font-medium text-gray-700">{lastSyncedLabel}</span>
            </div>

            {message && (
              <div
                className={`rounded-md px-3 py-2 text-xs ${
                  status === 'success'
                    ? 'bg-green-50 text-green-700 border border-green-100'
                    : 'bg-red-50 text-red-700 border border-red-100'
                }`}
              >
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'loading'}
              className="inline-flex w-full items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === 'loading' ? 'Refreshing...' : 'Refresh All'}
            </button>
          </form>

          <div className="px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Refreshes NHL stats and ESPN league data. Updates every page (team info, matchup analyzer, etc.) with the latest data.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}


