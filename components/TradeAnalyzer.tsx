'use client'

import { useState, useEffect } from 'react'
import { X, Plus, Search, TrendingUp, TrendingDown, CheckCircle, AlertCircle } from 'lucide-react'

interface Player {
  id: string
  name: string
  team: string
  position: string
}

interface PlayerWithValue extends Player {
  value: number
  projection: number
  delta: number
}

interface TradeAnalysis {
  sideA: {
    players: Player[]
    totalValue: number
    projectedTotalValue: number
    valueDelta: number
  }
  sideB: {
    players: Player[]
    totalValue: number
    projectedTotalValue: number
    valueDelta: number
  }
  netValueGain: number
  fairTrade: boolean
  recommendation: 'accept' | 'reject' | 'negotiate'
  reasoning: string
}

export default function TradeAnalyzer() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Player[]>([])
  const [sideA, setSideA] = useState<Player[]>([])
  const [sideB, setSideB] = useState<Player[]>([])
  const [showPlayerPicker, setShowPlayerPicker] = useState<'A' | 'B' | null>(null)
  const [analysis, setAnalysis] = useState<TradeAnalysis | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (searchQuery.length >= 2) {
      fetchSearchResults()
    } else {
      setSearchResults([])
    }
  }, [searchQuery])

  const fetchSearchResults = async () => {
    try {
      const response = await fetch(`/api/players/search?q=${encodeURIComponent(searchQuery)}`)
      const data = await response.json()
      setSearchResults(data.players || [])
    } catch (error) {
      console.error('Error searching players:', error)
    }
  }

  const handleAddPlayer = (player: Player, side: 'A' | 'B') => {
    if (side === 'A') {
      setSideA([...sideA, player])
    } else {
      setSideB([...sideB, player])
    }
    setSearchQuery('')
    setSearchResults([])
    setShowPlayerPicker(null)
  }

  const handleRemovePlayer = (playerId: string, side: 'A' | 'B') => {
    if (side === 'A') {
      setSideA(sideA.filter(p => p.id !== playerId))
    } else {
      setSideB(sideB.filter(p => p.id !== playerId))
    }
  }

  const handleAnalyze = async () => {
    if (sideA.length === 0 || sideB.length === 0) {
      alert('Please add at least one player to each side of the trade')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/trade/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sideA: sideA.map(p => p.id),
          sideB: sideB.map(p => p.id),
          sideAName: 'Your Team',
          sideBName: 'Other Team',
        }),
      })
      const data = await response.json()
      setAnalysis(data.analysis)
    } catch (error) {
      console.error('Error analyzing trade:', error)
      alert('Failed to analyze trade')
    } finally {
      setLoading(false)
    }
  }

  const getRecommendationColor = (recommendation: string) => {
    switch (recommendation) {
      case 'accept':
        return 'bg-green-500'
      case 'negotiate':
        return 'bg-yellow-500'
      case 'reject':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getRecommendationIcon = (recommendation: string) => {
    switch (recommendation) {
      case 'accept':
        return <CheckCircle className="w-5 h-5" />
      case 'negotiate':
        return <AlertCircle className="w-5 h-5" />
      case 'reject':
        return <X className="w-5 h-5" />
      default:
        return null
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Trade Builder */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Side A */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            Your Side
          </h2>
          <div className="space-y-2 mb-4">
            {sideA.map(player => (
              <div key={player.id} className="flex items-center justify-between bg-slate-50 p-3 rounded">
                <div>
                  <span className="font-medium">{player.name}</span>
                  <span className="text-sm text-gray-500 ml-2">
                    ({player.position} - {player.team})
                  </span>
                </div>
                <button
                  onClick={() => handleRemovePlayer(player.id, 'A')}
                  className="text-red-500 hover:text-red-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setShowPlayerPicker('A')}
            className="w-full py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Player
          </button>
        </div>

        {/* Side B */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Other Team</h2>
          <div className="space-y-2 mb-4">
            {sideB.map(player => (
              <div key={player.id} className="flex items-center justify-between bg-slate-50 p-3 rounded">
                <div>
                  <span className="font-medium">{player.name}</span>
                  <span className="text-sm text-gray-500 ml-2">
                    ({player.position} - {player.team})
                  </span>
                </div>
                <button
                  onClick={() => handleRemovePlayer(player.id, 'B')}
                  className="text-red-500 hover:text-red-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setShowPlayerPicker('B')}
            className="w-full py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Player
          </button>
        </div>
      </div>

      {/* Analyze Button */}
      <div className="text-center mb-8">
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-lg font-semibold"
        >
          {loading ? 'Analyzing...' : 'Analyze Trade'}
        </button>
      </div>

      {/* Player Picker Modal */}
      {showPlayerPicker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">
                Add Player to Side {showPlayerPicker}
              </h3>
              <button onClick={() => setShowPlayerPicker(null)}>
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search for a player..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {searchResults.length === 0 && searchQuery.length >= 2 && (
                <p className="text-gray-500 text-center py-4">No players found</p>
              )}
              {searchResults.map(player => (
                <button
                  key={player.id}
                  onClick={() => handleAddPlayer(player, showPlayerPicker)}
                  className="w-full text-left p-3 hover:bg-gray-100 rounded"
                >
                  <div className="font-medium">{player.name}</div>
                  <div className="text-sm text-gray-500">
                    {player.position} - {player.team}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Analysis Results */}
      {analysis && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className={`p-2 rounded-full ${getRecommendationColor(analysis.recommendation)}`}>
              {getRecommendationIcon(analysis.recommendation)}
            </div>
            <div>
              <h2 className="text-2xl font-bold">
                Recommendation: {analysis.recommendation.toUpperCase()}
              </h2>
              <p className="text-gray-600">{analysis.reasoning}</p>
            </div>
          </div>

          {/* Trade Balance Comparison */}
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-2">Side A Value</h3>
              <div className="text-3xl font-bold text-blue-600">
                {analysis.sideA.totalValue.toFixed(2)}
              </div>
              <div className="text-sm text-gray-500 mt-1">
                Projected: {analysis.sideA.projectedTotalValue.toFixed(2)}
              </div>
            </div>
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-2">Side B Value</h3>
              <div className="text-3xl font-bold text-green-600">
                {analysis.sideB.totalValue.toFixed(2)}
              </div>
              <div className="text-sm text-gray-500 mt-1">
                Projected: {analysis.sideB.projectedTotalValue.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Net Gain */}
          <div className="border-t pt-4 mb-6">
            <div className="flex items-center gap-2">
              {analysis.netValueGain > 0 ? (
                <>
                  <TrendingDown className="w-5 h-5 text-red-500" />
                  <span className="text-lg font-semibold text-red-500">
                    You are giving up {Math.abs(analysis.netValueGain).toFixed(2)} value
                  </span>
                </>
              ) : (
                <>
                  <TrendingUp className="w-5 h-5 text-green-500" />
                  <span className="text-lg font-semibold text-green-500">
                    You gain {Math.abs(analysis.netValueGain).toFixed(2)} value
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Player Breakdown */}
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold mb-3">Side A Players</h3>
              <div className="space-y-2">
                {analysis.sideA.players.map((player, index) => {
                  const playerData = (analysis.playerBreakdown?.sideA || [])[index]
                  return (
                    <div key={player.id} className="bg-slate-50 p-3 rounded">
                      <div className="font-medium">{player.name}</div>
                      <div className="text-sm text-gray-600">
                        Value: {playerData?.value.toFixed(2) || '0.00'}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-3">Side B Players</h3>
              <div className="space-y-2">
                {analysis.sideB.players.map((player, index) => {
                  const playerData = (analysis.playerBreakdown?.sideB || [])[index]
                  return (
                    <div key={player.id} className="bg-slate-50 p-3 rounded">
                      <div className="font-medium">{player.name}</div>
                      <div className="text-sm text-gray-600">
                        Value: {playerData?.value.toFixed(2) || '0.00'}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
