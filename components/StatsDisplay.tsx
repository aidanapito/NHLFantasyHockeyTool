'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Filter, X } from 'lucide-react';
import { calculateSkaterZScore, calculateGoalieZScore } from '@/lib/z-score-calculator';
import { calculateTPV } from '@/lib/enhanced-valuation-engine';

interface PlayerStats {
  playerId: number;
  name: string;
  position: string;
  team: string;
  gamesPlayed: number;
  goals: number;
  assists: number;
  points: number;
  plusMinus: number;
  shots: number;
  hits?: number;
  blockedShots?: number;
  ppPoints?: number;
  faceoffsWon?: number;
  penaltyMinutes?: number;
  zScore?: number; // Calculated Z-score for fantasy value
  tpv?: number; // True Player Value
}

interface StatsData {
  success: boolean;
  season: string;
  data: {
    totalPlayers?: number;
    totalGoalies?: number;
    samplePlayers?: PlayerStats[];
    sampleGoalies?: any[];
  };
}

type SortField = 'name' | 'position' | 'team' | 'gamesPlayed' | 'goals' | 'assists' | 'points' | 'pointsPerGame' | 
  'plusMinus' | 'ppGoals' | 'ppPoints' | 'evGoals' | 'evPoints' | 'shGoals' | 'shPoints' | 
  'shots' | 'shootingPct' | 'hits' | 'blockedShots' | 'takeaways' | 'giveaways' | 
  'totalFaceoffs' | 'faceoffsWon' | 'faceoffPct' | 'penaltyMinutes' | 'timeOnIcePerGame' |
  'wins' | 'losses' | 'savePct' | 'gaa' | 'shutouts' | 'zScore' | 'tpv';
type SortDirection = 'asc' | 'desc';

export default function StatsDisplay() {
  const router = useRouter();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshingNHL, setRefreshingNHL] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [statsType, setStatsType] = useState<'skaters' | 'goalies' | 'combined'>('combined');
  const [limit, setLimit] = useState(20); // Keep for initial display limit
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('zScore');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc'); // desc = high to low (best players first)
  
  // Season state
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [availableSeasons, setAvailableSeasons] = useState<string[]>([]);
  const [loadingSeasons, setLoadingSeasons] = useState(true);
  
  // Filter state
  const [filterPosition, setFilterPosition] = useState<string>('all');
  const [filterMinGames, setFilterMinGames] = useState<number>(0);
  const [showFilters, setShowFilters] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50); // Items per page

  // Fetch available seasons on mount
  useEffect(() => {
    const fetchSeasons = async () => {
      try {
        const response = await fetch('/api/seasons');
        const data = await response.json();
        if (data.success && data.seasons && data.seasons.length > 0) {
          setAvailableSeasons(data.seasons);
          // Set default to first (most recent) season if none selected
          setSelectedSeason(prev => prev || data.seasons[0]);
        }
      } catch (err) {
        console.error('Error fetching seasons:', err);
      } finally {
        setLoadingSeasons(false);
      }
    };
    fetchSeasons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Debug: Log component mount
  useEffect(() => {
    console.log('[StatsDisplay] Component mounted');
    return () => console.log('[StatsDisplay] Component unmounted');
  }, []);

  // Debounce search query for better performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300); // 300ms delay

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset to page 1 when search, stats type, season, or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, statsType, selectedSeason, filterPosition, filterMinGames]);

  useEffect(() => {
    if (selectedSeason) {
      console.log('[StatsDisplay] useEffect triggered, calling fetchStats for type:', statsType, 'season:', selectedSeason);
      fetchStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsType, selectedSeason]); // Added selectedSeason dependency

  // When search query changes, we don't need to refetch - just filter locally
  // When limit changes (and no search), we don't need to refetch either

  // Calculate Z-scores for all players (memoized for performance)
  const playersWithZScore = useMemo(() => {
    if (!stats?.data.samplePlayers || stats.data.samplePlayers.length === 0) {
      // If no samplePlayers, check if we have goalies (for goalies-only view)
      if (stats?.data.sampleGoalies && stats.data.sampleGoalies.length > 0) {
        return [];
      }
      return [];
    }
    
    const players = [...stats.data.samplePlayers];
    
    // Separate skaters and goalies
    // Default to skater if position is missing/null/undefined/empty string
    const skaters = players.filter((p: any) => {
      const pos = p.position;
      return !pos || pos === '' || (pos && pos !== 'G');
    });
    const goalies = players.filter((p: any) => p.position === 'G');
    
    // Debug: log if we're losing players
    if (skaters.length + goalies.length !== players.length) {
      console.warn(`Player count mismatch: ${players.length} total, ${skaters.length} skaters + ${goalies.length} goalies = ${skaters.length + goalies.length}`);
    }
    
    // Calculate Z-scores and TPV for skaters
    const skatersWithZScore = skaters.map((player: any) => {
      // Stats for Z-score calculation (uses existing names)
      const zscoreStats = {
        goals: player.goals || 0,
        assists: player.assists || 0,
        plusMinus: player.plusMinus || 0,
        penaltyMinutes: player.penaltyMinutes || 0,
        ppPoints: player.ppPoints || 0,
        faceoffsWon: player.faceoffsWon || 0,
        shots: player.shots || 0,
        hits: player.hits || 0,
        blockedShots: player.blockedShots || 0,
        gamesPlayed: player.gamesPlayed || 0,
      };
      
      const zscoreAllStats = skaters.map((p: any) => ({
        goals: p.goals || 0,
        assists: p.assists || 0,
        plusMinus: p.plusMinus || 0,
        penaltyMinutes: p.penaltyMinutes || 0,
        ppPoints: p.ppPoints || 0,
        faceoffsWon: p.faceoffsWon || 0,
        shots: p.shots || 0,
        hits: p.hits || 0,
        blockedShots: p.blockedShots || 0,
        gamesPlayed: p.gamesPlayed || 0,
      }));
      
      // Stats for TPV calculation (needs different field names)
      const tpvStats = {
        goals: player.goals || 0,
        assists: player.assists || 0,
        points: player.points || 0,
        plusMinus: player.plusMinus || 0,
        shotsOnGoal: player.shots || 0,
        hits: player.hits || 0,
        blocks: player.blockedShots || 0,
        powerPlayPoints: player.ppPoints || 0,
        pim: player.penaltyMinutes || 0,
        gamesPlayed: player.gamesPlayed || 0,
      };
      
      const tpvAllStats = skaters.map((p: any) => ({
        goals: p.goals || 0,
        assists: p.assists || 0,
        points: p.points || 0,
        plusMinus: p.plusMinus || 0,
        shotsOnGoal: p.shots || 0,
        hits: p.hits || 0,
        blocks: p.blockedShots || 0,
        powerPlayPoints: p.ppPoints || 0,
        pim: p.penaltyMinutes || 0,
        gamesPlayed: p.gamesPlayed || 0,
      }));
      
      return {
        ...player,
        zScore: calculateSkaterZScore(zscoreStats, zscoreAllStats),
        tpv: calculateTPV(tpvStats, tpvAllStats),
      };
    });
    
    // Calculate Z-scores for goalies
    const goaliesWithZScore = goalies.map((player: any) => ({
      ...player,
      zScore: calculateGoalieZScore(
        {
          wins: player.wins || 0,
          shutouts: player.shutouts || 0,
          goalsAgainstAverage: player.gaa || 0,
          savePct: player.savePct || 0,
          gamesPlayed: player.gamesPlayed || 0,
        },
        goalies.map((p: any) => ({
          wins: p.wins || 0,
          shutouts: p.shutouts || 0,
          goalsAgainstAverage: p.gaa || 0,
          savePct: p.savePct || 0,
          gamesPlayed: p.gamesPlayed || 0,
        }))
      ),
    }));
    
    return [...skatersWithZScore, ...goaliesWithZScore];
  }, [stats?.data.samplePlayers]);

  // Get all filtered and sorted players (without pagination) - memoized for performance
  const getAllFilteredAndSorted = useMemo(() => {
    if (playersWithZScore.length === 0) return [];
    
    // Ensure all players have zScore calculated
    let filtered = playersWithZScore.map((p: any) => ({
      ...p,
      zScore: typeof p.zScore === 'number' && !isNaN(p.zScore) ? p.zScore : 0
    }));
    
    // Apply search filter FIRST
    const hasSearch = debouncedSearchQuery.trim().length > 0;
    
    if (hasSearch) {
      const query = debouncedSearchQuery.toLowerCase().trim();
      const queryWords = query.split(/\s+/).filter(q => q.length > 0);
      
      filtered = filtered.filter((player: any) => {
        const name = (player.name || '').toLowerCase();
        const team = (player.team || '').toLowerCase();
        const position = (player.position || '').toLowerCase();
        
        if (queryWords.length === 1) {
          const word = queryWords[0];
          if (name.includes(word) || name.split(' ').some(n => n.startsWith(word))) {
            return true;
          }
          return team.includes(word) || position.includes(word);
        } else {
          return queryWords.every(word => 
            name.includes(word) || 
            team.includes(word) || 
            position.includes(word) ||
            name.split(' ').some(n => n.startsWith(word)) ||
            team.split(' ').some(t => t.startsWith(word))
          );
        }
      });
    }
    
    // Apply additional filters
    if (filterPosition !== 'all') {
      filtered = filtered.filter((player: any) => player.position === filterPosition);
    }
    
    if (filterMinGames > 0) {
      filtered = filtered.filter((player: any) => (player.gamesPlayed || 0) >= filterMinGames);
    }
    
    // Apply sorting to all filtered players
    filtered = [...filtered].sort((a: any, b: any) => {
      let aValue: any;
      let bValue: any;
      let isString = false;
      let isNumber = false;
      
      // Handle special cases and type conversion - get values directly from object
      if (sortField === 'name') {
        aValue = (a.name || '').toLowerCase();
        bValue = (b.name || '').toLowerCase();
        isString = true;
      } else if (sortField === 'team') {
        aValue = (a.team || '').toLowerCase();
        bValue = (b.team || '').toLowerCase();
        isString = true;
      } else if (sortField === 'position') {
        aValue = (a.position || '').toLowerCase();
        bValue = (b.position || '').toLowerCase();
        isString = true;
      } else if (sortField === 'timeOnIcePerGame') {
        // Parse time like "20:45" to minutes
        const parseTime = (time: string | number) => {
          if (!time) return 0;
          if (typeof time === 'number') return time;
          const parts = String(time).split(':');
          return parseInt(parts[0] || '0', 10) * 60 + parseFloat(parts[1] || '0');
        };
        aValue = parseTime(a.timeOnIcePerGame || '0:0');
        bValue = parseTime(b.timeOnIcePerGame || '0:0');
        isNumber = true;
      } else if (sortField === 'faceoffPct') {
        aValue = parseFloat(a.faceoffPct || a.faceoffWinPct || '0');
        bValue = parseFloat(b.faceoffPct || b.faceoffWinPct || '0');
        isNumber = true;
      } else if (sortField === 'zScore') {
        // Ensure zScore is always a number - handle null/undefined explicitly
        // IMPORTANT: Access zScore directly from the object, not via bracket notation
        const parseZScore = (val: any): number => {
          if (val === null || val === undefined || val === '') return 0;
          if (typeof val === 'number') {
            return isNaN(val) || !isFinite(val) ? 0 : val;
          }
          const parsed = parseFloat(String(val || '0'));
          return isNaN(parsed) || !isFinite(parsed) ? 0 : parsed;
        };
        aValue = parseZScore(a.zScore);
        bValue = parseZScore(b.zScore);
        isNumber = true;
      } else if (sortField === 'tpv') {
        // Ensure TPV is always a number - handle null/undefined explicitly
        const parseTPV = (val: any): number => {
          if (val === null || val === undefined || val === '') return 0;
          if (typeof val === 'number') {
            return isNaN(val) || !isFinite(val) ? 0 : val;
          }
          const parsed = parseFloat(String(val || '0'));
          return isNaN(parsed) || !isFinite(parsed) ? 0 : parsed;
        };
        aValue = parseTPV(a.tpv);
        bValue = parseTPV(b.tpv);
        isNumber = true;
      } else {
        // For numeric fields, try to parse
        // List of numeric fields
        const numericFields: SortField[] = [
          'gamesPlayed', 'goals', 'assists', 'points', 'pointsPerGame', 'plusMinus',
          'ppGoals', 'ppPoints', 'evGoals', 'evPoints', 'shGoals', 'shPoints',
          'shots', 'shotsPerGame', 'shootingPct', 'hits', 'blockedShots', 'takeaways', 'giveaways',
          'totalFaceoffs', 'faceoffsWon', 'penaltyMinutes', 'wins', 'losses', 'savePct', 'gaa', 'shutouts'
        ];
        
        // First, get the actual value from the player object
        // Handle field name mappings (e.g., penaltyMinutes vs pim)
        if (sortField === 'penaltyMinutes') {
          aValue = a.penaltyMinutes ?? a.pim ?? 0;
          bValue = b.penaltyMinutes ?? b.pim ?? 0;
        } else {
          aValue = a[sortField];
          bValue = b[sortField];
        }
        
        if (numericFields.includes(sortField)) {
          // Convert to number - handle null/undefined/NaN
          aValue = aValue !== null && aValue !== undefined && aValue !== '' 
            ? parseFloat(String(aValue)) 
            : (sortField === 'shootingPct' || sortField === 'savePct' || sortField === 'gaa' || sortField === 'faceoffPct' ? null : 0);
          bValue = bValue !== null && bValue !== undefined && bValue !== '' 
            ? parseFloat(String(bValue)) 
            : (sortField === 'shootingPct' || sortField === 'savePct' || sortField === 'gaa' || sortField === 'faceoffPct' ? null : 0);
          
          // Handle NaN values
          if (aValue !== null && (isNaN(aValue) || !isFinite(aValue))) aValue = 0;
          if (bValue !== null && (isNaN(bValue) || !isFinite(bValue))) bValue = 0;
          
          isNumber = true;
        } else {
          // Default: treat as string
          aValue = String(aValue || '').toLowerCase();
          bValue = String(bValue || '').toLowerCase();
          isString = true;
        }
      }
      
      // Handle null/undefined/empty values
      if (isNumber) {
        // For numbers, handle null/undefined/NaN - put them at the end
        if (aValue === null || aValue === undefined || isNaN(aValue) || !isFinite(aValue)) {
          aValue = sortDirection === 'asc' ? Infinity : -Infinity;
        }
        if (bValue === null || bValue === undefined || isNaN(bValue) || !isFinite(bValue)) {
          bValue = sortDirection === 'asc' ? Infinity : -Infinity;
        }
      } else {
        // For strings, empty is sent to end
        if (aValue === '' || aValue == null) aValue = sortDirection === 'asc' ? '\uffff' : '';
        if (bValue === '' || bValue == null) bValue = sortDirection === 'asc' ? '\uffff' : '';
      }
      
      // Compare values
      if (isString) {
        const result = aValue.localeCompare(bValue);
        return sortDirection === 'asc' ? result : -result;
      }
      
      if (isNumber) {
        // Numeric comparison
        // For ascending: a < b means return negative (a comes before b)
        // For descending: a > b means return negative (a comes before b)
        if (sortDirection === 'asc') {
          // Ascending: smaller values first
          if (aValue < bValue) return -1;
          if (aValue > bValue) return 1;
          return 0;
        } else {
          // Descending: larger values first
          if (aValue > bValue) return -1;
          if (aValue < bValue) return 1;
          return 0;
        }
      }
      
      // Fallback: string comparison
      const aStr = String(aValue || '');
      const bStr = String(bValue || '');
      const result = aStr.localeCompare(bStr);
      return sortDirection === 'asc' ? result : -result;
    });
    
    return filtered;
  }, [playersWithZScore, debouncedSearchQuery, sortField, sortDirection, filterPosition, filterMinGames]);

  // Get paginated players for display - computed from getAllFilteredAndSorted
  const getFilteredPlayers = useMemo(() => {
    const allFiltered = getAllFilteredAndSorted;
    
    // Calculate pagination
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    
    // Return only the current page's data
    return allFiltered.slice(startIndex, endIndex);
  }, [getAllFilteredAndSorted, currentPage, pageSize]);

  // Get total count for pagination - computed from memoized value
  const getTotalFilteredCount = useMemo(() => {
    return getAllFilteredAndSorted.length;
  }, [getAllFilteredAndSorted]);

  // Get total pages - computed from memoized value
  const getTotalPages = useMemo(() => {
    return Math.ceil(getTotalFilteredCount / pageSize);
  }, [getTotalFilteredCount, pageSize]);

  // Handle column header click for sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction if clicking the same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new field, default to desc for most fields
      setSortField(field);
      setSortDirection(
        field === 'name' || field === 'team' || field === 'position' ? 'asc' : 'desc'
      );
      // Reset to first page when changing sort
      setCurrentPage(1);
    }
  };

  const refreshFromNHL = async () => {
    setRefreshingNHL(true);
    setRefreshMessage(null);
    setRefreshError(null);
    try {
      const res = await fetch('/api/refresh-stats', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || data.message || `Failed (${res.status})`);
      }
      const data = await res.json();
      setRefreshMessage(data.message || 'Stats updated');
      // After server refresh, re-fetch from DB
      await fetchStats();
    } catch (e: any) {
      setRefreshError(e.message || 'Unknown error');
    } finally {
      setRefreshingNHL(false);
    }
  };

  // Render sortable header
  const SortableHeader = ({ field, children, className = '' }: { field: SortField; children: React.ReactNode; className?: string }) => {
    const isActive = sortField === field;
    return (
      <th 
        className={`${className} cursor-pointer select-none hover:bg-gray-100 transition-colors group`}
        onClick={() => handleSort(field)}
      >
        <div className="flex items-center justify-end gap-1">
          <span>{children}</span>
          {isActive ? (
            sortDirection === 'asc' ? (
              // Ascending: up arrow (small to large)
              <svg className="h-3 w-3 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
            ) : (
              // Descending: down arrow (large to small)
              <svg className="h-3 w-3 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            )
          ) : (
            <span className="flex flex-col items-center opacity-0 group-hover:opacity-30">
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
            </span>
          )}
        </div>
      </th>
    );
  };

  const fetchStats = async () => {
    if (!selectedSeason) {
      console.log('[StatsDisplay] No season selected, skipping fetch');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      let type: string;
      if (statsType === 'goalies') {
        type = 'goalies';
      } else if (statsType === 'combined') {
        type = 'combined';
      } else {
        type = 'skaters';
      }
      
      // Try to fetch from database first (fast) with timeout
      console.log('[StatsDisplay] Fetching stats from database...', type, 'season:', selectedSeason);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('[StatsDisplay] Request timeout - aborting');
        controller.abort();
      }, 10000); // 10 second timeout
      
      try {
        const response = await fetch(`/api/players/stats?type=${type}&season=${selectedSeason}`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        console.log('[StatsDisplay] Response received:', response.status, response.ok);
        
        if (!response.ok) {
          // If database error, show error instead of slow fallback
          throw new Error(`Database error: ${response.statusText}. Please refresh stats first.`);
        }
        
        const dbData = await response.json();
        console.log('[StatsDisplay] Data received:', dbData.success, 'count:', dbData.count);
        
        if (!dbData.success) {
          throw new Error('Failed to fetch stats from database');
        }
        
        // If database is empty, show helpful message
        if (!dbData.data || dbData.data.length === 0 || dbData.count === 0) {
          throw new Error('No stats found in database. Please use the "Refresh Stats" button to populate the database first.');
        }
        
        // Transform database response to match StatsData format
        const transformedData: StatsData = {
          success: true,
          season: dbData.season || '20252026',
          data: {
            samplePlayers: dbData.data || [],
            totalPlayers: dbData.count || 0,
          },
        };
        
        console.log('[StatsDisplay] Setting stats, player count:', transformedData.data.totalPlayers);
        setStats(transformedData);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        console.error('[StatsDisplay] Fetch error:', fetchError.name, fetchError.message);
        if (fetchError.name === 'AbortError') {
          throw new Error('Request timed out. The database may be slow. Please try again.');
        }
        throw fetchError;
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching stats');
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loadingSeasons || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">
            {loadingSeasons ? 'Loading seasons...' : 'Loading NHL stats...'}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error loading stats</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{error}</p>
            </div>
            <div className="mt-4">
              <button
                onClick={fetchStats}
                className="text-sm font-medium text-red-800 hover:text-red-900 underline"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with controls */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {statsType === 'skaters' ? 'Skater Stats' : 
                   statsType === 'combined' ? 'Combined Stats' : 'Goalie Stats'}
                </h2>
                {stats?.season && (
                  <p className="text-sm text-gray-600 mt-1">
                    {stats.season.substring(0, 4)}-{stats.season.substring(4, 8)} Season
                    {stats.data.totalPlayers && ` • ${stats.data.totalPlayers.toLocaleString()} players`}
                    {stats.data.totalGoalies && ` • ${stats.data.totalGoalies.toLocaleString()} goalies`}
                  </p>
                )}
              </div>
              
              {/* Season Selector - Only show when multiple seasons are available */}
              {availableSeasons.length > 1 && selectedSeason && (
                <div className="flex items-center gap-2">
                  <label htmlFor="season-select" className="text-sm font-medium text-gray-700">
                    Season:
                  </label>
                  <select
                    id="season-select"
                    value={selectedSeason}
                    onChange={(e) => setSelectedSeason(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={loadingSeasons}
                  >
                    {availableSeasons.map((season) => (
                      <option key={season} value={season}>
                        {season.substring(0, 4)}-{season.substring(4, 8)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Search Bar */}
          <div className="w-full sm:w-auto">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search players by name, team, or position..."
                className="block w-full sm:w-64 pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 text-gray-900 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
                autoComplete="off"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  <svg className="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Toggle between skaters and goalies */}
            <div className="flex rounded-lg border border-gray-300 p-1">
              <button
                onClick={() => { setStatsType('combined'); setSearchQuery(''); }}
                className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                  statsType === 'combined'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Combined Stats
              </button>
              <button
                onClick={() => { setStatsType('skaters'); setSearchQuery(''); }}
                className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                  statsType === 'skaters'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Skaters Only
              </button>
              <button
                onClick={() => { setStatsType('goalies'); setSearchQuery(''); }}
                className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                  statsType === 'goalies'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Goalies
              </button>
            </div>

            {/* Compact Filter Button */}
            <div className="flex items-center gap-2 relative">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm font-medium ${
                showFilters || filterPosition !== 'all' || filterMinGames > 0
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
              {(filterPosition !== 'all' || filterMinGames > 0) && (
                <span className="ml-1 px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                  {[filterPosition !== 'all' ? 1 : 0, filterMinGames > 0 ? 1 : 0].reduce((a, b) => a + b, 0)}
                </span>
              )}
            </button>

            {/* Filter Dropdown */}
            {showFilters && (
              <div className="absolute z-50 top-full left-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-lg p-4 min-w-[250px]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">Filters</h3>
                  <button
                    onClick={() => setShowFilters(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="space-y-4">
                  {/* Position Filter */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                      Position
                    </label>
                    <select
                      value={filterPosition}
                      onChange={(e) => setFilterPosition(e.target.value)}
                      className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    >
                      <option value="all">All Positions</option>
                      <option value="C">Centers (C)</option>
                      <option value="L">Left Wing (L)</option>
                      <option value="R">Right Wing (R)</option>
                      <option value="D">Defense (D)</option>
                    </select>
                  </div>

                  {/* Min Games Filter */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                      Minimum Games Played
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="82"
                      value={filterMinGames}
                      onChange={(e) => setFilterMinGames(parseInt(e.target.value) || 0)}
                      className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                      placeholder="0"
                    />
                  </div>

                  {/* Clear Filters Button */}
                  {(filterPosition !== 'all' || filterMinGames > 0) && (
                    <button
                      onClick={() => {
                        setFilterPosition('all');
                        setFilterMinGames(0);
                      }}
                      className="w-full text-sm text-blue-600 hover:text-blue-800 font-medium py-1.5"
                    >
                      Clear All Filters
                    </button>
                  )}
                </div>
              </div>
            )}
            </div>
          </div>

          {/* Results count and pagination info */}
          {stats && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="text-sm text-gray-600">
                {(() => {
                  const totalFiltered = getTotalFilteredCount;
                  const totalPlayers = stats.data.totalPlayers || stats.data.samplePlayers?.length || 0;
                  const totalPages = getTotalPages;
                  const startIndex = (currentPage - 1) * pageSize + 1;
                  const endIndex = Math.min(currentPage * pageSize, totalFiltered);
                  
                  if (debouncedSearchQuery) {
                    return `Found ${totalFiltered} of ${totalPlayers} players`;
                  } else {
                    return `Showing ${startIndex}-${endIndex} of ${totalFiltered} players (Page ${currentPage} of ${totalPages})`;
                  }
                })()}
                {searchQuery && searchQuery !== debouncedSearchQuery && (
                  <span className="ml-2 text-xs text-gray-400">(Searching...)</span>
                )}
              </div>
              
              {/* Page size selector */}
              <div className="flex items-center gap-2 text-sm">
                <label className="text-gray-600">Per page:</label>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1); // Reset to first page when changing page size
                  }}
                  className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats Table - Comprehensive View */}
      {(statsType === 'skaters' || statsType === 'combined') && stats?.data.samplePlayers && stats.data.samplePlayers.length > 0 ? (
        <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 rounded-lg">
          <table className="min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-50">
              <tr>
                <SortableHeader field="name" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6 sticky left-0 bg-gray-50 z-10">
                  <div className="flex items-center justify-start gap-1">Player</div>
                </SortableHeader>
                <SortableHeader field="zScore" className="px-2 py-3.5 text-right text-xs font-semibold text-gray-900 bg-blue-50">
                  <div className="flex items-center justify-end gap-1">
                    <span className="font-bold">Value</span>
                    <span className="text-[10px] text-gray-500">(Z)</span>
                  </div>
                </SortableHeader>
                <SortableHeader field="tpv" className="px-2 py-3.5 text-right text-xs font-semibold text-gray-900 bg-green-50">
                  <div className="flex items-center justify-end gap-1">
                    <span className="font-bold">TPV</span>
                  </div>
                </SortableHeader>
                <SortableHeader field="position" className="px-2 py-3.5 text-center text-xs font-semibold text-gray-900">POS</SortableHeader>
                <SortableHeader field="team" className="px-2 py-3.5 text-center text-xs font-semibold text-gray-900">Team</SortableHeader>
                <SortableHeader field="gamesPlayed" className="px-2 py-3.5 text-right text-xs font-semibold text-gray-900">GP</SortableHeader>
                {/* Scoring */}
                <SortableHeader field="goals" className="px-2 py-3.5 text-right text-xs font-semibold text-gray-900">G</SortableHeader>
                <SortableHeader field="assists" className="px-2 py-3.5 text-right text-xs font-semibold text-gray-900">A</SortableHeader>
                <SortableHeader field="points" className="px-2 py-3.5 text-right text-xs font-semibold text-gray-900">P</SortableHeader>
                <SortableHeader field="pointsPerGame" className="px-2 py-3.5 text-right text-xs font-semibold text-gray-900">P/GP</SortableHeader>
                <SortableHeader field="plusMinus" className="px-2 py-3.5 text-right text-xs font-semibold text-gray-900">+/-</SortableHeader>
                {/* Advanced Scoring */}
                <SortableHeader field="ppGoals" className="px-2 py-3.5 text-right text-xs font-semibold text-gray-900">PPG</SortableHeader>
                <SortableHeader field="ppPoints" className="px-2 py-3.5 text-right text-xs font-semibold text-gray-900">PPP</SortableHeader>
                <SortableHeader field="evGoals" className="px-2 py-3.5 text-right text-xs font-semibold text-gray-900">EVG</SortableHeader>
                <SortableHeader field="evPoints" className="px-2 py-3.5 text-right text-xs font-semibold text-gray-900">EVP</SortableHeader>
                <SortableHeader field="shGoals" className="px-2 py-3.5 text-right text-xs font-semibold text-gray-900">SHG</SortableHeader>
                <SortableHeader field="shPoints" className="px-2 py-3.5 text-right text-xs font-semibold text-gray-900">SHP</SortableHeader>
                {/* Shooting */}
                <SortableHeader field="shots" className="px-2 py-3.5 text-right text-xs font-semibold text-gray-900">SOG</SortableHeader>
                <SortableHeader field="shootingPct" className="px-2 py-3.5 text-right text-xs font-semibold text-gray-900">S%</SortableHeader>
                {/* Physical */}
                {statsType === 'combined' && (
                  <>
                    <SortableHeader field="hits" className="px-2 py-3.5 text-right text-xs font-semibold text-gray-900">Hits</SortableHeader>
                    <SortableHeader field="blockedShots" className="px-2 py-3.5 text-right text-xs font-semibold text-gray-900">Blks</SortableHeader>
                    <SortableHeader field="takeaways" className="px-2 py-3.5 text-right text-xs font-semibold text-gray-900">TA</SortableHeader>
                    <SortableHeader field="giveaways" className="px-2 py-3.5 text-right text-xs font-semibold text-gray-900">GA</SortableHeader>
                  </>
                )}
                {/* Faceoffs */}
                {statsType === 'combined' && (
                  <>
                    <SortableHeader field="totalFaceoffs" className="px-2 py-3.5 text-right text-xs font-semibold text-gray-900">FO</SortableHeader>
                    <SortableHeader field="faceoffsWon" className="px-2 py-3.5 text-right text-xs font-semibold text-gray-900">FOW</SortableHeader>
                    <SortableHeader field="faceoffPct" className="px-2 py-3.5 text-right text-xs font-semibold text-gray-900">FO%</SortableHeader>
                  </>
                )}
                {/* Other */}
                <SortableHeader field="penaltyMinutes" className="px-2 py-3.5 text-right text-xs font-semibold text-gray-900">PIM</SortableHeader>
                <SortableHeader field="timeOnIcePerGame" className="px-2 py-3.5 text-right text-xs font-semibold text-gray-900">TOI/GP</SortableHeader>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white" key={`skaters-${debouncedSearchQuery}-${statsType}`}>
              {getFilteredPlayers.map((player: any, index) => (
                <tr key={player.playerId} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="whitespace-nowrap py-3 pl-4 pr-3 text-sm sm:pl-6 sticky left-0 bg-inherit z-10">
                    <Link
                      href={`/players/${player.playerId}`}
                      className="font-medium hover:underline cursor-pointer"
                      style={{ color: '#2563eb' }}
                      prefetch={true}
                      onMouseEnter={() => {
                        // Prefetch the route on hover for faster navigation
                        router.prefetch(`/players/${player.playerId}`);
                      }}
                    >
                      {player.name}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 text-xs text-right bg-blue-50">
                    <span className={`font-semibold ${(player.zScore || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {(player.zScore || 0).toFixed(2)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 text-xs text-right bg-green-50">
                    <span className={`font-semibold ${(player.tpv || 0) >= 10 ? 'text-blue-700' : (player.tpv || 0) >= 5 ? 'text-green-700' : 'text-gray-600'}`}>
                      {(player.tpv || 0).toFixed(2)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-500 text-center">{player.position}</td>
                  <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-500 text-center">{player.team}</td>
                  <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-500 text-right">{player.gamesPlayed}</td>
                  {/* Scoring */}
                  <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-900 text-right font-medium">{player.goals}</td>
                  <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-900 text-right">{player.assists}</td>
                  <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-900 text-right font-bold">{player.points}</td>
                  <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-900 text-right font-medium">{player.pointsPerGame?.toFixed(2) || '-'}</td>
                  <td className={`whitespace-nowrap px-2 py-3 text-xs text-right ${
                    player.plusMinus > 0 ? 'text-green-600' : player.plusMinus < 0 ? 'text-red-600' : 'text-gray-500'
                  }`}>
                    {player.plusMinus > 0 ? '+' : ''}{player.plusMinus}
                  </td>
                  {/* Advanced Scoring */}
                  <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-900 text-right">{player.ppGoals || 0}</td>
                  <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-900 text-right">{player.ppPoints || 0}</td>
                  <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-900 text-right">{player.evGoals || 0}</td>
                  <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-900 text-right">{player.evPoints || 0}</td>
                  <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-900 text-right">{player.shGoals || 0}</td>
                  <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-900 text-right">{player.shPoints || 0}</td>
                  {/* Shooting */}
                  <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-500 text-right">{player.shots}</td>
                  <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-900 text-right">{(player.shootingPct || 0).toFixed(1)}%</td>
                  {/* Physical */}
                  {statsType === 'combined' && (
                    <>
                      <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-500 text-right">{player.hits || 0}</td>
                      <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-500 text-right">{player.blockedShots || 0}</td>
                      <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-500 text-right">{player.takeaways || 0}</td>
                      <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-500 text-right">{player.giveaways || 0}</td>
                    </>
                  )}
                  {/* Faceoffs */}
                  {statsType === 'combined' && (
                    <>
                      <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-500 text-right">{player.totalFaceoffs || 0}</td>
                      <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-500 text-right">{player.faceoffsWon || 0}</td>
                      <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-900 text-right font-medium">
                        {player.faceoffPct ? `${(player.faceoffPct * 100).toFixed(1)}%` : '-'}
                      </td>
                    </>
                  )}
                  {/* Other */}
                  <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-500 text-right">{player.penaltyMinutes || 0}</td>
                  <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-500 text-right">{player.timeOnIcePerGame || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : statsType === 'goalies' && stats?.data.sampleGoalies && (() => {
        // Helper to get filtered goalies count
        if (!stats.data.sampleGoalies) return false;
        if (debouncedSearchQuery.trim()) {
          const query = debouncedSearchQuery.toLowerCase().trim().split(/\s+/);
          const filtered = stats.data.sampleGoalies.filter((goalie: any) => {
            const name = (goalie.name || '').toLowerCase();
            const team = (goalie.team || '').toLowerCase();
            return query.every(word => name.includes(word) || team.includes(word) || name.split(' ').some(n => n.startsWith(word)));
          });
          return filtered.length > 0;
        }
        return stats.data.sampleGoalies.length > 0;
      })() ? (
        <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 rounded-lg">
          <table className="min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-50">
              <tr>
                <SortableHeader field="name" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6 sticky left-0 bg-gray-50 z-10">
                  <div className="flex items-center justify-start gap-1">Goalie</div>
                </SortableHeader>
                <SortableHeader field="zScore" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 bg-blue-50">
                  <div className="flex items-center justify-end gap-1">
                    <span className="font-bold">Value</span>
                    <span className="text-xs text-gray-500">(Z)</span>
                  </div>
                </SortableHeader>
                <SortableHeader field="team" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Team</SortableHeader>
                <SortableHeader field="gamesPlayed" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">GP</SortableHeader>
                <SortableHeader field="wins" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">W</SortableHeader>
                <SortableHeader field="losses" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">L</SortableHeader>
                <SortableHeader field="savePct" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">SV%</SortableHeader>
                <SortableHeader field="gaa" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">GAA</SortableHeader>
                <SortableHeader field="shutouts" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">SO</SortableHeader>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white" key={`goalies-${debouncedSearchQuery}`}>
              {(() => {
                if (!stats.data.sampleGoalies) return [];
                
                // Calculate Z-scores for goalies
                const goaliesWithZScore = stats.data.sampleGoalies.map((goalie: any) => ({
                  ...goalie,
                  zScore: calculateGoalieZScore(
                    {
                      wins: goalie.wins || 0,
                      shutouts: goalie.shutouts || 0,
                      goalsAgainstAverage: goalie.gaa || 0,
                      savePct: goalie.savePct || 0,
                      gamesPlayed: goalie.gamesPlayed || 0,
                    },
                    stats.data.sampleGoalies.map((g: any) => ({
                      wins: g.wins || 0,
                      shutouts: g.shutouts || 0,
                      goalsAgainstAverage: g.gaa || 0,
                      savePct: g.savePct || 0,
                      gamesPlayed: g.gamesPlayed || 0,
                    }))
                  ),
                }));
                
                let filtered = goaliesWithZScore;
                
                // Apply search filter FIRST
                if (debouncedSearchQuery.trim()) {
                  const query = debouncedSearchQuery.toLowerCase().trim().split(/\s+/);
                  filtered = filtered.filter((goalie: any) => {
                    const name = (goalie.name || '').toLowerCase();
                    const team = (goalie.team || '').toLowerCase();
                    
                    return query.every(word => 
                      name.includes(word) || 
                      team.includes(word) ||
                      name.split(' ').some(n => n.startsWith(word))
                    );
                  });
                }
                
                // Apply sorting (using same logic as skaters)
                const sorted = [...filtered].sort((a: any, b: any) => {
                  let aValue: any = a[sortField];
                  let bValue: any = b[sortField];
                  let isString = false;
                  let isNumber = false;
                  
                  // Handle special cases for goalies
                  if (sortField === 'name') {
                    aValue = (a.name || '').toLowerCase();
                    bValue = (b.name || '').toLowerCase();
                    isString = true;
                  } else if (sortField === 'team') {
                    aValue = (a.team || '').toLowerCase();
                    bValue = (b.team || '').toLowerCase();
                    isString = true;
                  } else if (sortField === 'savePct') {
                    // Save percentage is already a decimal (0.925 for 92.5%)
                    aValue = parseFloat(String(a.savePct || '0')) || 0;
                    bValue = parseFloat(String(b.savePct || '0')) || 0;
                    isNumber = true;
                  } else if (sortField === 'zScore') {
                    aValue = parseFloat(String(a.zScore || '0')) || 0;
                    bValue = parseFloat(String(b.zScore || '0')) || 0;
                    isNumber = true;
                  } else {
                    // For numeric goalie fields
                    const numericFields: SortField[] = [
                      'gamesPlayed', 'wins', 'losses', 'gaa', 'shutouts'
                    ];
                    
                    if (numericFields.includes(sortField)) {
                      aValue = parseFloat(String(aValue || '0')) || 0;
                      bValue = parseFloat(String(bValue || '0')) || 0;
                      isNumber = true;
                    } else {
                      aValue = String(aValue || '').toLowerCase();
                      bValue = String(bValue || '').toLowerCase();
                      isString = true;
                    }
                  }
                  
                  // Handle null/undefined/empty values
                  if (isNumber) {
                    if (isNaN(aValue) || !isFinite(aValue)) aValue = sortDirection === 'asc' ? Infinity : -Infinity;
                    if (isNaN(bValue) || !isFinite(bValue)) bValue = sortDirection === 'asc' ? Infinity : -Infinity;
                  } else {
                    if (aValue === '' || aValue == null) aValue = sortDirection === 'asc' ? '\uffff' : '';
                    if (bValue === '' || bValue == null) bValue = sortDirection === 'asc' ? '\uffff' : '';
                  }
                  
                  // Compare values
                  if (isString) {
                    const result = aValue.localeCompare(bValue);
                    return sortDirection === 'asc' ? result : -result;
                  }
                  
                  if (isNumber) {
                    // Use same logic as skaters sorting
                    if (sortDirection === 'asc') {
                      if (aValue < bValue) return -1;
                      if (aValue > bValue) return 1;
                      return 0;
                    } else {
                      if (aValue > bValue) return -1;
                      if (aValue < bValue) return 1;
                      return 0;
                    }
                  }
                  
                  // Fallback
                  const aStr = String(aValue || '');
                  const bStr = String(bValue || '');
                  const result = aStr.localeCompare(bStr);
                  return sortDirection === 'asc' ? result : -result;
                });
                
                // Apply pagination
                const startIndex = (currentPage - 1) * pageSize;
                const endIndex = startIndex + pageSize;
                
                return sorted.slice(startIndex, endIndex);
              })().map((goalie: any, index: number) => (
                <tr key={goalie.playerId} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-6">
                    <Link
                      href={`/players/${goalie.playerId}`}
                      className="font-medium hover:underline cursor-pointer"
                      style={{ color: '#2563eb' }}
                      prefetch={true}
                      onMouseEnter={() => {
                        // Prefetch the route on hover for faster navigation
                        router.prefetch(`/players/${goalie.playerId}`);
                      }}
                    >
                      {goalie.name}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-right bg-blue-50">
                    <span className={`font-semibold ${(goalie.zScore || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {(goalie.zScore || 0).toFixed(2)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{goalie.team}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 text-right">{goalie.gamesPlayed}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900 text-right font-medium">{goalie.wins}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 text-right">{goalie.losses}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900 text-right font-medium">
                    {goalie.savePct ? (goalie.savePct * 100).toFixed(3) : 'N/A'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900 text-right">{goalie.gaa?.toFixed(2) || 'N/A'}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900 text-right">{goalie.shutouts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Pagination Controls for Goalies */}
      {stats && statsType === 'goalies' && stats.data.sampleGoalies && stats.data.sampleGoalies.length > 0 && (() => {
        // Calculate filtered goalies count for pagination
        if (!stats.data.sampleGoalies) return 0;
        let filtered = stats.data.sampleGoalies;
        if (debouncedSearchQuery.trim()) {
          const query = debouncedSearchQuery.toLowerCase().trim().split(/\s+/);
          filtered = filtered.filter((goalie: any) => {
            const name = (goalie.name || '').toLowerCase();
            const team = (goalie.team || '').toLowerCase();
            return query.every(word => 
              name.includes(word) || 
              team.includes(word) ||
              name.split(' ').some(n => n.startsWith(word))
            );
          });
        }
        return filtered.length;
      })() > 0 && (
        <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 mt-4">
          <div className="flex flex-1 justify-between sm:hidden">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => {
                const totalGoalies = (() => {
                  if (!stats.data.sampleGoalies) return 0;
                  let filtered = stats.data.sampleGoalies;
                  if (debouncedSearchQuery.trim()) {
                    const query = debouncedSearchQuery.toLowerCase().trim().split(/\s+/);
                    filtered = filtered.filter((goalie: any) => {
                      const name = (goalie.name || '').toLowerCase();
                      const team = (goalie.team || '').toLowerCase();
                      return query.every(word => name.includes(word) || team.includes(word) || name.split(' ').some(n => n.startsWith(word)));
                    });
                  }
                  return filtered.length;
                })();
                const totalPages = Math.ceil(totalGoalies / pageSize);
                setCurrentPage(prev => Math.min(totalPages, prev + 1));
              }}
              disabled={(() => {
                const totalGoalies = (() => {
                  if (!stats.data.sampleGoalies) return 0;
                  let filtered = stats.data.sampleGoalies;
                  if (debouncedSearchQuery.trim()) {
                    const query = debouncedSearchQuery.toLowerCase().trim().split(/\s+/);
                    filtered = filtered.filter((goalie: any) => {
                      const name = (goalie.name || '').toLowerCase();
                      const team = (goalie.team || '').toLowerCase();
                      return query.every(word => name.includes(word) || team.includes(word) || name.split(' ').some(n => n.startsWith(word)));
                    });
                  }
                  return filtered.length;
                })();
                return currentPage >= Math.ceil(totalGoalies / pageSize);
              })()}
              className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                {(() => {
                  const totalGoalies = (() => {
                    if (!stats.data.sampleGoalies) return 0;
                    let filtered = stats.data.sampleGoalies;
                    if (debouncedSearchQuery.trim()) {
                      const query = debouncedSearchQuery.toLowerCase().trim().split(/\s+/);
                      filtered = filtered.filter((goalie: any) => {
                        const name = (goalie.name || '').toLowerCase();
                        const team = (goalie.team || '').toLowerCase();
                        return query.every(word => name.includes(word) || team.includes(word) || name.split(' ').some(n => n.startsWith(word)));
                      });
                    }
                    return filtered.length;
                  })();
                  const totalPages = Math.ceil(totalGoalies / pageSize);
                  const startIndex = (currentPage - 1) * pageSize + 1;
                  const endIndex = Math.min(currentPage * pageSize, totalGoalies);
                  return (
                    <>
                      Showing <span className="font-medium">{startIndex}</span> to{' '}
                      <span className="font-medium">{endIndex}</span> of{' '}
                      <span className="font-medium">{totalGoalies}</span> goalies (Page {currentPage} of {totalPages})
                    </>
                  );
                })()}
              </p>
            </div>
            <div>
              <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                {(() => {
                  const totalGoalies = (() => {
                    if (!stats.data.sampleGoalies) return 0;
                    let filtered = stats.data.sampleGoalies;
                    if (debouncedSearchQuery.trim()) {
                      const query = debouncedSearchQuery.toLowerCase().trim().split(/\s+/);
                      filtered = filtered.filter((goalie: any) => {
                        const name = (goalie.name || '').toLowerCase();
                        const team = (goalie.team || '').toLowerCase();
                        return query.every(word => name.includes(word) || team.includes(word) || name.split(' ').some(n => n.startsWith(word)));
                      });
                    }
                    return filtered.length;
                  })();
                  const totalPages = Math.ceil(totalGoalies / pageSize);
                  
                  return (
                    <>
                      <button
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="sr-only">First</span>
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M15.79 14.77a.75.75 0 01-1.06.02l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 111.04 1.08L11.832 10l3.938 3.71a.75.75 0 01.02 1.06zm-6 0a.75.75 0 01-1.06.02l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 111.04 1.08L5.832 10l3.938 3.71a.75.75 0 01.02 1.06z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="relative inline-flex items-center px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="sr-only">Previous</span>
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                        </svg>
                      </button>
                      {(() => {
                        const showPages = 7;
                        let startPage = Math.max(1, currentPage - Math.floor(showPages / 2));
                        let endPage = Math.min(totalPages, startPage + showPages - 1);
                        if (endPage - startPage < showPages - 1) {
                          startPage = Math.max(1, endPage - showPages + 1);
                        }
                        const pages = [];
                        for (let i = startPage; i <= endPage; i++) {
                          pages.push(
                            <button
                              key={i}
                              onClick={() => setCurrentPage(i)}
                              className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                                i === currentPage
                                  ? 'z-10 bg-blue-600 text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                                  : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                              }`}
                            >
                              {i}
                            </button>
                          );
                        }
                        return pages;
                      })()}
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage >= totalPages}
                        className="relative inline-flex items-center px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="sr-only">Next</span>
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage >= totalPages}
                        className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="sr-only">Last</span>
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M10.21 14.77a.75.75 0 01.02-1.06L14.168 10 10.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02zm-6 0a.75.75 0 01.02-1.06L8.168 10 4.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </>
                  );
                })()}
              </nav>
            </div>
          </div>
        </div>
      )}

      {/* Pagination Controls for Skaters */}
      {stats && (statsType === 'skaters' || statsType === 'combined') && stats.data.samplePlayers && stats.data.samplePlayers.length > 0 && getTotalFilteredCount > 0 && (
        <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 mt-4">
          <div className="flex flex-1 justify-between sm:hidden">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(getTotalPages, prev + 1))}
              disabled={currentPage >= getTotalPages}
              className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                <span className="font-medium">{Math.min(currentPage * pageSize, getTotalFilteredCount)}</span> of{' '}
                <span className="font-medium">{getTotalFilteredCount}</span> results
              </p>
            </div>
            <div>
              <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">First</span>
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M15.79 14.77a.75.75 0 01-1.06.02l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 111.04 1.08L11.832 10l3.938 3.71a.75.75 0 01.02 1.06zm-6 0a.75.75 0 01-1.06.02l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 111.04 1.08L5.832 10l3.938 3.71a.75.75 0 01.02 1.06z" clipRule="evenodd" />
                  </svg>
                </button>
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">Previous</span>
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                  </svg>
                </button>
                
                {/* Page numbers */}
                {(() => {
                  const totalPages = getTotalPages;
                  const pages = [];
                  const showPages = 7; // Show up to 7 page buttons
                  
                  let startPage = Math.max(1, currentPage - Math.floor(showPages / 2));
                  let endPage = Math.min(totalPages, startPage + showPages - 1);
                  
                  if (endPage - startPage < showPages - 1) {
                    startPage = Math.max(1, endPage - showPages + 1);
                  }
                  
                  for (let i = startPage; i <= endPage; i++) {
                    pages.push(
                      <button
                        key={i}
                        onClick={() => setCurrentPage(i)}
                        className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                          i === currentPage
                            ? 'z-10 bg-blue-600 text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                            : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                        }`}
                      >
                        {i}
                      </button>
                    );
                  }
                  
                  return pages;
                })()}
                
                <button
                  onClick={() => setCurrentPage(prev => Math.min(getTotalPages, prev + 1))}
                  disabled={currentPage >= getTotalPages}
                  className="relative inline-flex items-center px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">Next</span>
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                  </svg>
                </button>
                <button
                  onClick={() => setCurrentPage(getTotalPages)}
                  disabled={currentPage >= getTotalPages}
                  className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">Last</span>
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M10.21 14.77a.75.75 0 01.02-1.06L14.168 10 10.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02zm-6 0a.75.75 0 01.02-1.06L8.168 10 4.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                  </svg>
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}

      {/* Empty states */}
      {debouncedSearchQuery && (statsType === 'skaters' || statsType === 'combined') && getTotalFilteredCount === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No players found matching "{debouncedSearchQuery}"</p>
          <p className="text-sm text-gray-400 mt-2">Try searching by first name, last name, team abbreviation, or position</p>
          <button
            onClick={() => setSearchQuery('')}
            className="mt-4 text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          No stats data available
        </div>
      )}

      {/* Refresh actions */}
      <div className="flex justify-end gap-3 items-center">
        {refreshMessage && <span className="text-sm text-green-700">{refreshMessage}</span>}
        {refreshError && <span className="text-sm text-red-600">{refreshError}</span>}
        <button
          onClick={fetchStats}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-gray-700 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-600"
        >
          <svg className="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Reload from DB
        </button>
        <button
          onClick={refreshFromNHL}
          disabled={refreshingNHL}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          {refreshingNHL ? 'Updating…' : 'Update from NHL'}
        </button>
      </div>
    </div>
  );
}

