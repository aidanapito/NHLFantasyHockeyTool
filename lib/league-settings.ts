'use client'

export interface LeagueSettings {
  leagueId: string
  season?: string
  leagueName?: string
  fantasyLeagueId?: string
  lastSyncedAt?: string
}

const STORAGE_KEY = 'fantasy-league-settings'
const EVENT_NAME = 'league-settings-updated'

export function loadLeagueSettings(): LeagueSettings | null {
  if (typeof window === 'undefined') {
    return null
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as LeagueSettings
  } catch (error) {
    console.warn('Failed to parse league settings from localStorage', error)
    return null
  }
}

export function saveLeagueSettings(settings: LeagueSettings) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  window.dispatchEvent(new CustomEvent<LeagueSettings>(EVENT_NAME, { detail: settings }))
}

export function clearLeagueSettings() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
  window.dispatchEvent(new CustomEvent<LeagueSettings | null>(EVENT_NAME, { detail: null }))
}

export function onLeagueSettingsUpdated(handler: (settings: LeagueSettings | null) => void) {
  if (typeof window === 'undefined') return () => {}

  const wrappedHandler = (event: Event) => {
    const customEvent = event as CustomEvent<LeagueSettings | null>
    handler(customEvent.detail ?? null)
  }

  window.addEventListener(EVENT_NAME, wrappedHandler as EventListener)

  return () => window.removeEventListener(EVENT_NAME, wrappedHandler as EventListener)
}


