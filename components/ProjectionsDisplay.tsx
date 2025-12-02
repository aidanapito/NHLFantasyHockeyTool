'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface PerGameProjection {
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
  toiSeconds: number;
  wins: number;
  saves: number;
  shotsAgainst: number;
  goalsAgainst: number;
  shutouts: number;
}

interface SeasonProjection {
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
  wins: number;
  saves: number;
  shotsAgainst: number;
  goalsAgainst: number;
  shutouts: number;
}

interface CurrentStats {
  gamesPlayed: number;
  goals: number;
  assists: number;
  points: number;
  shotsOnGoal: number;
  hits: number;
  blockedShots: number;
  powerPlayPoints: number;
  plusMinus: number;
  pim: number;
  wins: number | null;
  saves: number | null;
  shotsAgainst: number | null;
  goalsAgainst: number | null;
  shutouts: number | null;
}

interface Projection {
  gameDate: string;
  season: string;
  modelVersion: string;
  perGame: PerGameProjection;
  seasonProjection: SeasonProjection;
  current: CurrentStats;
  gamesRemaining: number;
  createdAt: string;
}

interface PlayerProjection {
  player: {
    id: number;
    nhlId: number;
    fullName: string;
    position: string;
    team: string | null;
  };
  projection: Projection;
}

interface ProjectionsData {
  success: boolean;
  count: number;
  modelVersion: string;
  projections: PlayerProjection[];
}

type SortField = 'name' | 'position' | 'team' | 'seasonPoints' | 'seasonGoals' | 'seasonAssists' | 'perGamePoints' | 'perGameGoals' | 'perGameAssists';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'per-game' | 'season';

export default function ProjectionsDisplay() {
  const [data, setData] = useState<ProjectionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('seasonPoints');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [positionFilter, setPositionFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('season');

  useEffect(() => {
    fetchProjections();
  }, [positionFilter]);

  const fetchProjections = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = positionFilter !== 'all' 
        ? `/api/ml-projections?position=${positionFilter}`
        : '/api/ml-projections';
      const response = await fetch(url);
      const result = await response.json();
      
      if (result.success) {
        setData(result);
      } else {
        setError(result.error || 'Failed to load projections');
      }
    } catch (err) {
      setError('Failed to fetch projections');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedAndFiltered = data?.projections
    .filter(p => 
      searchTerm === '' || 
      p.player.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.player.team?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortField) {
        case 'name':
          aVal = a.player.fullName;
          bVal = b.player.fullName;
          break;
        case 'position':
          aVal = a.player.position;
          bVal = b.player.position;
          break;
        case 'team':
          aVal = a.player.team || '';
          bVal = b.player.team || '';
          break;
        case 'seasonPoints':
          aVal = a.projection.seasonProjection.points || 0;
          bVal = b.projection.seasonProjection.points || 0;
          break;
        case 'seasonGoals':
          aVal = a.projection.seasonProjection.goals || 0;
          bVal = b.projection.seasonProjection.goals || 0;
          break;
        case 'seasonAssists':
          aVal = a.projection.seasonProjection.assists || 0;
          bVal = b.projection.seasonProjection.assists || 0;
          break;
        case 'perGamePoints':
          aVal = a.projection.perGame.points || 0;
          bVal = b.projection.perGame.points || 0;
          break;
        case 'perGameGoals':
          aVal = a.projection.perGame.goals || 0;
          bVal = b.projection.perGame.goals || 0;
          break;
        case 'perGameAssists':
          aVal = a.projection.perGame.assists || 0;
          bVal = b.projection.perGame.assists || 0;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    }) || [];

  const formatToi = (seconds: number | null) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading projections...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
        <button
          onClick={fetchProjections}
          className="mt-2 text-red-600 hover:text-red-800 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">ML Projections</h2>
          <p className="text-gray-600 mt-1">
            Deep learning model predictions: per-game rates and full season totals
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Model: {data?.modelVersion} | {data?.count} players | Toggle between per-game and season projections
          </p>
        </div>
      </div>

      {/* Filters and View Toggle */}
      <div className="flex gap-4 items-center">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search players or teams..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <select
          value={positionFilter}
          onChange={(e) => setPositionFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="all">All Positions</option>
          <option value="C">Centers</option>
          <option value="LW">Left Wings</option>
          <option value="RW">Right Wings</option>
          <option value="D">Defensemen</option>
          <option value="G">Goalies</option>
        </select>
        <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('per-game')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              viewMode === 'per-game'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Per Game
          </button>
          <button
            onClick={() => setViewMode('season')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              viewMode === 'season'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Season Total
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  onClick={() => handleSort('name')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  Player {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => handleSort('position')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  Pos {sortField === 'position' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => handleSort('team')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  Team {sortField === 'team' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                {viewMode === 'season' && (
                  <>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      GP
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Current
                    </th>
                  </>
                )}
                <th
                  onClick={() => handleSort(viewMode === 'season' ? 'seasonPoints' : 'perGamePoints')}
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  {viewMode === 'season' ? 'Season PTS' : 'PTS/G'} {sortField.includes('Points') && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => handleSort(viewMode === 'season' ? 'seasonGoals' : 'perGameGoals')}
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  {viewMode === 'season' ? 'Season G' : 'G/G'} {sortField.includes('Goals') && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => handleSort(viewMode === 'season' ? 'seasonAssists' : 'perGameAssists')}
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  {viewMode === 'season' ? 'Season A' : 'A/G'} {sortField.includes('Assists') && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {viewMode === 'season' ? 'Season SOG' : 'SOG/G'}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {viewMode === 'season' ? 'Season HIT' : 'HIT/G'}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {viewMode === 'season' ? 'Season BLK' : 'BLK/G'}
                </th>
                {viewMode === 'per-game' && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    TOI/G
                  </th>
                )}
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {viewMode === 'season' ? 'Season PPP' : 'PPP/G'}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedAndFiltered.length === 0 ? (
                <tr>
                  <td colSpan={viewMode === 'season' ? 13 : 10} className="px-6 py-4 text-center text-gray-500">
                    No projections found
                  </td>
                </tr>
              ) : (
                sortedAndFiltered.map((item) => {
                  const proj = viewMode === 'season' ? item.projection.seasonProjection : item.projection.perGame;
                  const current = item.projection.current;
                  
                  return (
                    <tr key={item.player.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {item.player.fullName}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">{item.player.position}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">{item.player.team || '-'}</span>
                      </td>
                      {viewMode === 'season' && (
                        <>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                            {current.gamesPlayed}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">
                            {current.points} / {proj.points.toFixed(0)}
                          </td>
                        </>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                        {proj.points.toFixed(viewMode === 'season' ? 0 : 2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        {proj.goals.toFixed(viewMode === 'season' ? 0 : 2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        {proj.assists.toFixed(viewMode === 'season' ? 0 : 2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        {proj.shotsOnGoal.toFixed(viewMode === 'season' ? 0 : 2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        {proj.hits.toFixed(viewMode === 'season' ? 0 : 2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        {proj.blocks.toFixed(viewMode === 'season' ? 0 : 2)}
                      </td>
                      {viewMode === 'per-game' && (
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                          {formatToi(proj.toiSeconds)}
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        {proj.powerPlayPoints.toFixed(viewMode === 'season' ? 0 : 2)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

