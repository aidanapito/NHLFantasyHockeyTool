'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Projection {
  gameDate: string;
  season: string;
  modelVersion: string;
  predictedGoals: number | null;
  predictedAssists: number | null;
  predictedPoints: number | null;
  predictedShots: number | null;
  predictedShotsOnGoal: number | null;
  predictedHits: number | null;
  predictedBlocks: number | null;
  predictedPowerPlayPoints: number | null;
  predictedPlusMinus: number | null;
  predictedPim: number | null;
  predictedToiSeconds: number | null;
  predictedWins: number | null;
  predictedSaves: number | null;
  predictedShotsAgainst: number | null;
  predictedGoalsAgainst: number | null;
  predictedSavePct: number | null;
  predictedShutouts: number | null;
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

type SortField = 'name' | 'position' | 'team' | 'predictedPoints' | 'predictedGoals' | 'predictedAssists' | 'predictedShots' | 'predictedHits' | 'predictedBlocks';
type SortDirection = 'asc' | 'desc';

export default function ProjectionsDisplay() {
  const [data, setData] = useState<ProjectionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('predictedPoints');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [positionFilter, setPositionFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

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
        case 'predictedPoints':
          aVal = a.projection.predictedPoints || 0;
          bVal = b.projection.predictedPoints || 0;
          break;
        case 'predictedGoals':
          aVal = a.projection.predictedGoals || 0;
          bVal = b.projection.predictedGoals || 0;
          break;
        case 'predictedAssists':
          aVal = a.projection.predictedAssists || 0;
          bVal = b.projection.predictedAssists || 0;
          break;
        case 'predictedShots':
          aVal = a.projection.predictedShots || 0;
          bVal = b.projection.predictedShots || 0;
          break;
        case 'predictedHits':
          aVal = a.projection.predictedHits || 0;
          bVal = b.projection.predictedHits || 0;
          break;
        case 'predictedBlocks':
          aVal = a.projection.predictedBlocks || 0;
          bVal = b.projection.predictedBlocks || 0;
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
            Deep learning model predictions for next game performance
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Model: {data?.modelVersion} | {data?.count} players
          </p>
        </div>
      </div>

      {/* Filters */}
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
                <th
                  onClick={() => handleSort('predictedPoints')}
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  PTS {sortField === 'predictedPoints' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => handleSort('predictedGoals')}
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  G {sortField === 'predictedGoals' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => handleSort('predictedAssists')}
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  A {sortField === 'predictedAssists' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  SOG
                </th>
                <th
                  onClick={() => handleSort('predictedHits')}
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  HIT {sortField === 'predictedHits' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => handleSort('predictedBlocks')}
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  BLK {sortField === 'predictedBlocks' && (sortDirection === 'asc' ? '↓' : '↑')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  TOI
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  PPP
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedAndFiltered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-4 text-center text-gray-500">
                    No projections found
                  </td>
                </tr>
              ) : (
                sortedAndFiltered.map((item) => (
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
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                      {item.projection.predictedPoints?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {item.projection.predictedGoals?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {item.projection.predictedAssists?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {item.projection.predictedShotsOnGoal?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {item.projection.predictedHits?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {item.projection.predictedBlocks?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {formatToi(item.projection.predictedToiSeconds)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {item.projection.predictedPowerPlayPoints?.toFixed(2) || '0.00'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

