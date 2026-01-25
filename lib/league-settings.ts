export interface LeagueSettings {
  leagueId: string;
  season?: string;
  lastSyncedAt?: string;
}

const STORAGE_KEY = 'fantasy-league-settings';

export function loadLeagueSettings(): LeagueSettings | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return null;
    }
    return JSON.parse(stored) as LeagueSettings;
  } catch (error) {
    console.error('Failed to load league settings:', error);
    return null;
  }
}

export function saveLeagueSettings(settings: LeagueSettings): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    // Trigger update event
    window.dispatchEvent(new CustomEvent('league-settings-updated', { detail: settings }));
  } catch (error) {
    console.error('Failed to save league settings:', error);
  }
}

export function onLeagueSettingsUpdated(
  callback: (settings: LeagueSettings | null) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (event: CustomEvent<LeagueSettings>) => {
    callback(event.detail);
  };

  window.addEventListener('league-settings-updated', handler as EventListener);

  // Also call with current settings on subscribe
  callback(loadLeagueSettings());

  return () => {
    window.removeEventListener('league-settings-updated', handler as EventListener);
  };
}
