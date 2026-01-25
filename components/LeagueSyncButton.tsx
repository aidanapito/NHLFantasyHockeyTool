'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { loadLeagueSettings } from '@/lib/league-settings'

export default function LeagueSyncButton() {
  const [isLoading, setIsLoading] = useState(false)

  const handleRefresh = async () => {
    setIsLoading(true)
    try {
      // Trigger league refresh
      window.location.href = '/espn-setup'
    } catch (error) {
      console.error('Failed to refresh league:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={isLoading}
      className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium"
    >
      <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
      <span>{isLoading ? 'Syncing...' : 'Refresh League'}</span>
    </button>
  )
}
