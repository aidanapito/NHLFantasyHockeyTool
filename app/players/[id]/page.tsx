'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, AlertCircle, CheckCircle } from 'lucide-react';
import Header from '@/components/Header';

interface PlayerDetailData {
  player: {
    id: number;
    nhlId: number;
    fullName: string;
    firstName: string;
    lastName: string;
    position: string;
    team: string | null;
    jerseyNumber: number | null;
    headshot: string | null;
    birthDate: string | null;
    height: string | null;
    weight: number | null;
  };
  currentStats: {
    season: string;
    gamesPlayed: number;
    goals: number;
    assists: number;
    points: number;
    shots: number;
    shotsOnGoal: number;
    hits: number;
    blocks: number;
    powerPlayPoints: number;
    plusMinus: number;
    pim: number;
    timeOnIceSeconds: number;
    wins?: number;
    saves?: number;
    shotsAgainst?: number;
    goalsAgainst?: number;
    savePct?: number;
    shutouts?: number;
    updatedAt: string;
  } | null;
  perGameStats: {
    goals: number;
    assists: number;
    points: number;
    shots: number;
    shotsOnGoal: number;
    hits: number;
    blocks: number;
    powerPlayPoints: number;
    plusMinus: number;
    pim: number;
    timeOnIceSeconds: number;
  } | null;
  projection: {
    gameDate: string;
    season: string;
    modelVersion: string;
    predictedGoals: number;
    predictedAssists: number;
    predictedPoints: number;
    predictedShots: number;
    predictedShotsOnGoal: number;
    predictedHits: number;
    predictedBlocks: number;
    predictedPowerPlayPoints: number;
    predictedPlusMinus: number;
    predictedPim: number;
    predictedToiSeconds: number;
    predictedWins?: number;
    predictedSaves?: number;
    predictedShotsAgainst?: number;
    predictedGoalsAgainst?: number;
    predictedSavePct?: number;
    predictedShutouts?: number;
    createdAt: string;
  } | null;
  projectionConfidence: 'High' | 'Medium' | 'Low';
  gameLogs: Array<{
    gameDate: string;
    opponentTeam: string;
    isHome: boolean;
    goals: number;
    assists: number;
    points: number;
    shots: number;
    shotsOnGoal: number;
    hits: number;
    blocks: number;
    powerPlayPoints: number;
    plusMinus: number;
    pim: number;
    timeOnIceSeconds: number;
    wins?: number;
    saves?: number;
    shotsAgainst?: number;
    goalsAgainst?: number;
    savePct?: number;
    shutouts?: number;
  }>;
}

const STAT_COMPARISON_FIELDS = [
  { key: 'goals', label: 'Goals', isGoalie: false },
  { key: 'assists', label: 'Assists', isGoalie: false },
  { key: 'points', label: 'Points', isGoalie: false },
  { key: 'shots', label: 'Shots', isGoalie: false },
  { key: 'shotsOnGoal', label: 'Shots on Goal', isGoalie: false },
  { key: 'hits', label: 'Hits', isGoalie: false },
  { key: 'blocks', label: 'Blocks', isGoalie: false },
  { key: 'powerPlayPoints', label: 'PP Points', isGoalie: false },
  { key: 'plusMinus', label: '+/-', isGoalie: false },
  { key: 'pim', label: 'PIM', isGoalie: false },
  { key: 'timeOnIceSeconds', label: 'TOI (sec)', isGoalie: false },
  { key: 'wins', label: 'Wins', isGoalie: true },
  { key: 'saves', label: 'Saves', isGoalie: true },
  { key: 'shotsAgainst', label: 'Shots Against', isGoalie: true },
  { key: 'goalsAgainst', label: 'Goals Against', isGoalie: true },
  { key: 'savePct', label: 'Save %', isGoalie: true },
  { key: 'shutouts', label: 'Shutouts', isGoalie: true },
];

export default function PlayerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const playerId = params?.id as string;

  const [data, setData] = useState<PlayerDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playerId) return;

    const fetchPlayerData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/players/${playerId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch player data');
        }
        const playerData = await response.json();
        setData(playerData);
      } catch (err: any) {
        setError(err.message || 'Failed to load player data');
      } finally {
        setLoading(false);
      }
    };

    fetchPlayerData();
  }, [playerId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-gray-600">Loading player data...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error || 'Player not found'}</p>
            <button
              onClick={() => router.back()}
              className="mt-4 text-blue-600 hover:text-blue-800"
            >
              ← Go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { player, currentStats, perGameStats, projection, projectionConfidence, gameLogs } = data;
  const isGoalie = player.position === 'G';

  // Calculate trend data for charts
  const recentGames = [...gameLogs].reverse(); // Oldest to newest
  const pointsTrend = recentGames.map((log, idx) => ({
    game: idx + 1,
    date: log.gameDate,
    points: log.points,
    goals: log.goals,
    assists: log.assists,
  }));

  const getStatValue = (statKey: string, source: any): number | null => {
    if (!source) return null;
    return source[statKey] ?? null;
  };

  const getTrendIcon = (current: number | null, projected: number | null) => {
    if (current === null || projected === null) return <Minus className="w-4 h-4 text-gray-400" />;
    if (projected > current * 1.1) return <TrendingUp className="w-4 h-4 text-green-600" />;
    if (projected < current * 0.9) return <TrendingDown className="w-4 h-4 text-red-600" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'High':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'Medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'Low':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 players-detail-page">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="mb-6 flex items-center text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </button>

        {/* Player Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-start gap-6">
            {player.headshot && (
              <img
                src={player.headshot}
                alt={player.fullName}
                className="w-32 h-32 rounded-lg object-cover"
              />
            )}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {player.fullName}
                {player.jerseyNumber && (
                  <span className="text-xl text-gray-500 ml-2">#{player.jerseyNumber}</span>
                )}
              </h1>
              <div className="flex items-center gap-4 text-gray-600 mb-4">
                <span className="font-medium">{player.position}</span>
                {player.team && (
                  <>
                    <span>•</span>
                    <span>{player.team}</span>
                  </>
                )}
                {player.height && player.weight && (
                  <>
                    <span>•</span>
                    <span>{player.height}, {player.weight} lbs</span>
                  </>
                )}
              </div>
              {currentStats && (
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div>
                    <div className="text-sm text-gray-500" style={{ color: '#6b7280' }}>Games Played</div>
                    <div className="text-2xl font-bold" style={{ color: '#111827' }}>{currentStats.gamesPlayed}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500" style={{ color: '#6b7280' }}>Points</div>
                    <div className="text-2xl font-bold" style={{ color: '#111827' }}>{currentStats.points}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500" style={{ color: '#6b7280' }}>Points/Game</div>
                    <div className="text-2xl font-bold" style={{ color: '#111827' }}>
                      {perGameStats ? perGameStats.points.toFixed(2) : '0.00'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Projection Confidence */}
        {projection && (
          <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Projection Confidence</h3>
                <p className="text-sm text-gray-600">
                  Based on {currentStats?.gamesPlayed || 0} games played this season
                </p>
              </div>
              <div className={`px-4 py-2 rounded-lg border ${getConfidenceColor(projectionConfidence)}`}>
                <div className="flex items-center gap-2">
                  {projectionConfidence === 'High' && <CheckCircle className="w-5 h-5" />}
                  {projectionConfidence === 'Low' && <AlertCircle className="w-5 h-5" />}
                  <span className="font-semibold">{projectionConfidence}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 text-sm text-gray-600">
              <p>Model: {projection.modelVersion} • Updated: {new Date(projection.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        )}

        {/* Current Stats vs Projections */}
        {currentStats && projection && perGameStats && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Current Stats vs Projections (Per Game)</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Stat
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Current (Per Game)
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Projected (Per Game)
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Difference
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Trend
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {STAT_COMPARISON_FIELDS
                    .filter(field => !field.isGoalie || isGoalie)
                    .filter(field => field.isGoalie || !isGoalie)
                    .map((field) => {
                      const current = getStatValue(field.key, perGameStats);
                      const projected = getStatValue(`predicted${field.key.charAt(0).toUpperCase() + field.key.slice(1)}`, projection);
                      const diff = current !== null && projected !== null ? projected - current : null;

                      if (current === null && projected === null) return null;

                      return (
                        <tr key={field.key}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900" style={{ color: '#111827' }}>
                            {field.label}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900" style={{ color: '#111827' }}>
                            {current !== null ? current.toFixed(2) : 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900" style={{ color: '#111827' }}>
                            {projected !== null ? projected.toFixed(2) : 'N/A'}
                          </td>
                          <td className={`px-6 py-4 whitespace-nowrap text-sm text-right ${
                            diff !== null
                              ? diff > 0
                                ? 'text-green-600'
                                : diff < 0
                                ? 'text-red-600'
                                : 'text-gray-600'
                              : 'text-gray-400'
                          }`}>
                            {diff !== null ? (diff > 0 ? '+' : '') + diff.toFixed(2) : 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                            {getTrendIcon(current, projected)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Historical Performance Trends */}
        {gameLogs.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Recent Game Performance</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Opponent
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      G
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      A
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      PTS
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      SOG
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      +/-
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {gameLogs.slice(0, 10).map((log, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900" style={{ color: '#111827' }}>
                        {new Date(log.gameDate).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900" style={{ color: '#111827' }}>
                        {log.isHome ? 'vs' : '@'} {log.opponentTeam}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-900" style={{ color: '#111827' }}>
                        {log.goals}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-900" style={{ color: '#111827' }}>
                        {log.assists}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-center font-semibold text-gray-900" style={{ color: '#111827' }}>
                        {log.points}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-900" style={{ color: '#111827' }}>
                        {log.shotsOnGoal}
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap text-sm text-center ${
                        log.plusMinus > 0 ? 'text-green-600' : log.plusMinus < 0 ? 'text-red-600' : 'text-gray-900'
                      }`}>
                        {log.plusMinus > 0 ? '+' : ''}{log.plusMinus}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Simple Points Trend Chart */}
        {pointsTrend.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Points Trend (Last {pointsTrend.length} Games)</h2>
            <div className="h-64 flex items-end justify-start gap-1">
              {pointsTrend.map((game, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-blue-500 rounded-t hover:bg-blue-600 transition-colors cursor-pointer"
                    style={{ height: `${Math.max(5, (game.points / Math.max(...pointsTrend.map(g => g.points))) * 100)}%` }}
                    title={`Game ${game.game}: ${game.points} points`}
                  />
                  <div className="text-xs text-gray-500 mt-1">{game.points}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-sm text-gray-600">
              <p>Average: {(pointsTrend.reduce((sum, g) => sum + g.points, 0) / pointsTrend.length).toFixed(2)} points/game</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

