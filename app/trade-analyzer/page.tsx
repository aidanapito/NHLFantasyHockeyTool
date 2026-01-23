'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Search, TrendingUp, TrendingDown, Minus, X, AlertCircle, 
  CheckCircle, BarChart3, Info, Target, Zap
} from 'lucide-react';
import Header from '@/components/Header';
import {
  loadLeagueSettings,
  onLeagueSettingsUpdated,
  type LeagueSettings,
} from '@/lib/league-settings';
import { normalizeTeamName } from '@/lib/team-name-mapping';

interface Player {
  id: string;
  nhlId: number;
  name: string;
  position: string;
  team: string;
  stats?: {
    goals: number;
    assists: number;
    points: number;
    plusMinus: number;
    pim: number;
    powerPlayPoints: number;
    shotsOnGoal: number;
    hits: number;
    blockedShots: number;
    gamesPlayed: number;
  };
}

interface EnhancedPlayerBreakdown {
  player: Player;
  value: number;
  projection: number;
  delta: number;
  tpv?: number;
  rosProjection?: {
    projectedFantasyPointsPerGame: number;
    projectedTotalGames: number;
    projectedTotalValue: number;
    confidence: number;
    categoryBreakdown: any;
  };
  riskMetrics?: {
    volatilityScore: number;
    consistencyRating: 'High' | 'Medium' | 'Low';
    boomOrBust: boolean;
    trend: 'Up' | 'Down' | 'Stable';
    trendStrength: number;
  };
  contextualData?: {
    lineAssignment?: string;
    powerPlayUsage?: number;
    injuryStatus?: string;
    gamesRemaining?: number;
  };
}

interface TradeSide {
  totalValue: number;
  projectedTotalValue: number;
  valueDelta: number;
  totalTPV: number;
  totalPPV: number;
  compositeValue: number;
  totalRiskScore: number;
  avgROSConfidence: number;
}

interface EnhancedTradeAnalysis {
  sideA: TradeSide;
  sideB: TradeSide;
  netValueGain: number;
  netTPVGain: number;
  netCompositeGain: number;
  fairnessScore: number;
  fairTrade: boolean;
  recommendation: 'accept' | 'reject' | 'negotiate' | 'heavily-favor-a' | 'heavily-favor-b';
  reasoning: string;
  detailedInsights: string[];
  suggestedAdjustments?: string[];
  categoryImpact?: {
    sideA: Record<string, number>;
    sideB: Record<string, number>;
    netChange: Record<string, number>;
  };
  playerBreakdown: {
    sideA: EnhancedPlayerBreakdown[];
    sideB: EnhancedPlayerBreakdown[];
  };
}

interface FantasyTeam {
  id: string;
  teamName: string;
  ownerName?: string | null;
}

interface StandingsEntry {
  rank: number;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  winPercentage: number;
  G?: number;
  A?: number;
  plusMinus?: number;
  PIM?: number;
  PPP?: number;
  FOW?: number;
  SOG?: number;
  HIT?: number;
  BLK?: number;
  W?: number;
  SO?: number;
  GAA?: number;
  SV?: number;
}

export default function TradeAnalyzerPage() {
  const [leagueSettings, setLeagueSettings] = useState<LeagueSettings | null>(null);
  const [selectedTeamA, setSelectedTeamA] = useState<string>('');
  const [selectedTeamB, setSelectedTeamB] = useState<string>('');
  const [teams, setTeams] = useState<FantasyTeam[]>([]);
  const [standings, setStandings] = useState<StandingsEntry[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingStandings, setLoadingStandings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [teamAPlayers, setTeamAPlayers] = useState<Player[]>([]);
  const [teamBPlayers, setTeamBPlayers] = useState<Player[]>([]);
  // Analysis can be either enhanced or category-based format
  const [analysis, setAnalysis] = useState<EnhancedTradeAnalysis | any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tradeSuggestions, setTradeSuggestions] = useState<any>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Load teams from database using existing pattern
  const loadTeams = useCallback(
    async (settings: LeagueSettings | null, showSpinner = true) => {
      if (!settings?.leagueId) {
        setTeams([]);
        setError('Use the Refresh League button in the header to load an ESPN league.');
        return;
      }

      if (showSpinner) {
        setLoadingTeams(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams({ leagueId: settings.leagueId });
        if (settings.season) {
          params.set('season', settings.season);
        }

        const res = await fetch(`/api/fantasy/teams?${params.toString()}`, {
          cache: 'no-store',
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || 'Failed to load teams from database');
        }

        // API returns { teams: [...] }, so extract the teams array
        const teamsArray = data.teams || (Array.isArray(data) ? data : []);
        const teamsList = teamsArray.map((team: any) => ({
          id: team.id || team.teamName,
          teamName: team.teamName || 'Unknown Team',
          ownerName: team.ownerName,
        }));
        
        setTeams(teamsList);
        
        if (teamsList.length === 0) {
          setError('No teams found in the database for the selected league. Run the refresh again to import rosters.');
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load teams');
        setTeams([]);
      } finally {
        if (showSpinner) {
          setLoadingTeams(false);
        }
      }
    },
    []
  );

  // Load standings
  const loadStandings = useCallback(
    async (settings: LeagueSettings | null) => {
      if (!settings?.leagueId) {
        setStandings([]);
        return;
      }

      setLoadingStandings(true);
      try {
        const params = new URLSearchParams({ 
          leagueId: settings.leagueId,
          season: settings.season || '',
        });
        const response = await fetch(`/api/fantasy/espn-standings?${params.toString()}`);
        if (response.ok) {
          const data = await response.json();
          const standingsArray = data.standings || data;
          setStandings(Array.isArray(standingsArray) ? standingsArray : []);
        }
      } catch (error) {
        console.error('Failed to load standings:', error);
      } finally {
        setLoadingStandings(false);
      }
    },
    []
  );

  // Load league settings on mount
  useEffect(() => {
    const stored = loadLeagueSettings();
    setLeagueSettings(stored);
    loadTeams(stored ?? null, true);
    loadStandings(stored ?? null);

    const unsubscribe = onLeagueSettingsUpdated(updated => {
      setLeagueSettings(updated);
      loadTeams(updated ?? null, true);
      loadStandings(updated ?? null);
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [loadTeams, loadStandings]);


  // Load a suggested trade into the analyzer
  async function loadSuggestedTrade(suggestion: any) {
    if (!suggestion.yourPlayer.id || !suggestion.targetPlayer.id) {
      alert('Invalid trade suggestion');
      return;
    }

    try {
      // Fetch both players
      const [yourPlayerRes, targetPlayerRes] = await Promise.all([
        fetch(`/api/fantasy/search-players?q=${encodeURIComponent(suggestion.yourPlayer.id)}&limit=1`),
        fetch(`/api/fantasy/search-players?q=${encodeURIComponent(suggestion.targetPlayer.id)}&limit=1`),
      ]);

      const yourPlayerData = await yourPlayerRes.json();
      const targetPlayerData = await targetPlayerRes.json();

      const playersArray = Array.isArray(yourPlayerData) ? yourPlayerData : [];
      const targetPlayersArray = Array.isArray(targetPlayerData) ? targetPlayerData : [];

      if (playersArray.length > 0 && targetPlayersArray.length > 0) {
        const yourPlayer = playersArray.find((p: any) => 
          p.nhlId?.toString() === suggestion.yourPlayer.id || 
          p.id?.toString() === suggestion.yourPlayer.id
        );
        const targetPlayer = targetPlayersArray.find((p: any) => 
          p.nhlId?.toString() === suggestion.targetPlayer.id || 
          p.id?.toString() === suggestion.targetPlayer.id
        );

        if (yourPlayer && targetPlayer) {
          // Transform to our format
          const yourPlayerFormatted: Player = {
            id: yourPlayer.nhlId?.toString() || yourPlayer.id?.toString(),
            nhlId: yourPlayer.nhlId || yourPlayer.id,
            name: yourPlayer.firstName && yourPlayer.lastName 
              ? `${yourPlayer.firstName} ${yourPlayer.lastName}`
              : yourPlayer.name || `${yourPlayer.firstName} ${yourPlayer.lastName}`,
            position: yourPlayer.position,
            team: yourPlayer.team || 'N/A',
            stats: yourPlayer.stats,
          };

          const targetPlayerFormatted: Player = {
            id: targetPlayer.nhlId?.toString() || targetPlayer.id?.toString(),
            nhlId: targetPlayer.nhlId || targetPlayer.id,
            name: targetPlayer.firstName && targetPlayer.lastName 
              ? `${targetPlayer.firstName} ${targetPlayer.lastName}`
              : targetPlayer.name || `${targetPlayer.firstName} ${targetPlayer.lastName}`,
            position: targetPlayer.position,
            team: targetPlayer.team || 'N/A',
            stats: targetPlayer.stats,
          };

          // Clear existing trade and set new one
          setTeamAPlayers([yourPlayerFormatted]);
          setTeamBPlayers([targetPlayerFormatted]);

          // Scroll to trade builder section
          setTimeout(() => {
            document.getElementById('trade-builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
        } else {
          alert('Could not find one or both players in the database');
        }
      } else {
        alert('Could not fetch player data');
      }
    } catch (error) {
      console.error('Failed to load suggested trade:', error);
      alert('Failed to load trade suggestion');
    }
  }

  // Fetch AI-powered trade suggestions
  async function fetchTradeSuggestions() {
    if (!selectedTeamA || !leagueSettings?.leagueId) {
      alert('Please select a team first and ensure league is synced');
      return;
    }

    setLoadingSuggestions(true);
    setShowSuggestions(true);
    try {
      const playerIds = teamAPlayers.map(p => p.nhlId.toString());
      
      console.log('Fetching trade suggestions with players:', {
        teamName: selectedTeamA,
        playerCount: teamAPlayers.length,
        playerIds,
        playerNames: teamAPlayers.map(p => p.name),
      });
      
      // Normalize team name (convert abbrev to full name if needed)
      const normalizedTeamName = normalizeTeamName(selectedTeamA);
      
      const response = await fetch('/api/trade-analyzer/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamName: normalizedTeamName,
          leagueId: leagueSettings.leagueId,
          season: leagueSettings.season || '2026',
          yourPlayerIds: playerIds,
          maxSuggestions: 10,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch suggestions');
      }

      const data = await response.json();
      console.log('Trade suggestions received:', data);
      setTradeSuggestions(data);
    } catch (error) {
      console.error('Failed to fetch trade suggestions:', error);
      alert(`Failed to get trade suggestions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoadingSuggestions(false);
    }
  }

  // Calculate projected standings after trade
  function getProjectedStandings(): StandingsEntry[] {
    // Handle both categoryImpact (enhanced) and categoryImpacts/netCategoryChanges (category-based)
    const categoryChanges = analysis?.categoryImpact?.netChange || analysis?.netCategoryChanges;
    if (!standings.length || !categoryChanges) return standings;

    return standings.map(team => {
      // Use the unified categoryChanges variable
      if (team.teamName === selectedTeamA) {
        // Team A is losing sideA stats, gaining sideB stats
        return {
          ...team,
          G: (team.G || 0) + (categoryChanges.G || 0),
          A: (team.A || 0) + (categoryChanges.A || 0),
          PTS: (team.G || 0) + (team.A || 0) + (categoryChanges.G || 0) + (categoryChanges.A || 0),
          plusMinus: (team.plusMinus || 0) + (categoryChanges['±'] || 0),
          PIM: (team.PIM || 0) + (categoryChanges.PIM || 0),
          PPP: (team.PPP || 0) + (categoryChanges.PPP || 0),
          FOW: (team.FOW || 0) + (categoryChanges.FOW || 0),
          SOG: (team.SOG || 0) + (categoryChanges.SOG || 0),
          HIT: (team.HIT || 0) + (categoryChanges.HIT || 0),
          BLK: (team.BLK || 0) + (categoryChanges.BLK || 0),
          W: (team.W || 0) + (categoryChanges.W || 0),
          SO: (team.SO || 0) + (categoryChanges.SO || 0),
          GAA: team.GAA ? team.GAA + (categoryChanges.GAA || 0) : undefined,
          SV: team.SV ? team.SV + (categoryChanges['SV%'] || 0) : undefined,
        };
      } else if (team.teamName === selectedTeamB) {
        // Team B is losing sideB stats, gaining sideA stats (opposite of Team A)
        return {
          ...team,
          G: (team.G || 0) - (categoryChanges.G || 0),
          A: (team.A || 0) - (categoryChanges.A || 0),
          PTS: (team.G || 0) + (team.A || 0) - (categoryChanges.G || 0) - (categoryChanges.A || 0),
          plusMinus: (team.plusMinus || 0) - (categoryChanges['±'] || 0),
          PIM: (team.PIM || 0) - (categoryChanges.PIM || 0),
          PPP: (team.PPP || 0) - (categoryChanges.PPP || 0),
          FOW: (team.FOW || 0) - (categoryChanges.FOW || 0),
          SOG: (team.SOG || 0) - (categoryChanges.SOG || 0),
          HIT: (team.HIT || 0) - (categoryChanges.HIT || 0),
          BLK: (team.BLK || 0) - (categoryChanges.BLK || 0),
          W: (team.W || 0) - (categoryChanges.W || 0),
          SO: (team.SO || 0) - (categoryChanges.SO || 0),
          GAA: team.GAA ? team.GAA - (categoryChanges.GAA || 0) : undefined,
          SV: team.SV ? team.SV - (categoryChanges['SV%'] || 0) : undefined,
        };
      }
      return team;
    });
  }

  // Search for players
  async function handleSearch() {
    if (!searchQuery.trim()) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/fantasy/search-players?q=${encodeURIComponent(searchQuery)}&limit=20`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Search failed:', errorData);
        alert(`Failed to search players: ${errorData.error || 'Unknown error'}`);
        setSearchResults([]);
        return;
      }
      
      const data = await response.json();
      
      // API returns { players: [...] }, handle both formats
      const playersArray = Array.isArray(data) ? data : (data.players || []);
      
      // Transform to our format
      const players = playersArray.map((player: any) => ({
        id: player.nhlId?.toString() || player.id?.toString(),
        nhlId: player.nhlId || player.id,
        name: player.firstName && player.lastName 
          ? `${player.firstName} ${player.lastName}`
          : player.name || `${player.firstName || ''} ${player.lastName || ''}`.trim() || 'Unknown Player',
        position: player.position || 'N/A',
        team: player.team || 'N/A',
        stats: Array.isArray(player.stats) ? player.stats[0] : player.stats,
      }));
      
      setSearchResults(players);
      
      if (players.length === 0) {
        console.log('No players found for query:', searchQuery);
      }
    } catch (error) {
      console.error('Search failed:', error);
      alert(`Failed to search players: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  }

  // Add player to Team A
  function addToTeamA(player: Player) {
    if (!teamAPlayers.some(p => p.nhlId === player.nhlId)) {
      setTeamAPlayers([...teamAPlayers, player]);
    }
  }

  // Add player to Team B
  function addToTeamB(player: Player) {
    if (!teamBPlayers.some(p => p.nhlId === player.nhlId)) {
      setTeamBPlayers([...teamBPlayers, player]);
    }
  }

  // Remove player from Team A
  function removeFromTeamA(playerId: number) {
    setTeamAPlayers(teamAPlayers.filter(p => p.nhlId !== playerId));
  }

  // Remove player from Team B
  function removeFromTeamB(playerId: number) {
    setTeamBPlayers(teamBPlayers.filter(p => p.nhlId !== playerId));
  }

  const [useCategoryAnalysis, setUseCategoryAnalysis] = useState(true); // Default to category-based

  // Evaluate trade
  async function evaluateTrade() {
    if (teamAPlayers.length === 0 || teamBPlayers.length === 0) {
      alert('Both teams need at least one player');
      return;
    }

    // Validate max 3 players per side for category analysis
    if (useCategoryAnalysis && (teamAPlayers.length > 3 || teamBPlayers.length > 3)) {
      alert('Category-based analysis supports a maximum of 3 players per side');
      return;
    }

    setIsLoading(true);
    try {
      const endpoint = useCategoryAnalysis 
        ? '/api/trade-analyzer/category'
        : '/api/trade-analyzer/enhanced';
      
      const requestBody = useCategoryAnalysis
        ? {
            sideA: teamAPlayers.map(p => ({ playerId: p.id, nhlId: p.nhlId })),
            sideB: teamBPlayers.map(p => ({ playerId: p.id, nhlId: p.nhlId })),
            sideAName: selectedTeamA || 'Team A',
            sideBName: selectedTeamB || 'Team B',
            season: leagueSettings?.season ? convertSeasonFormat(leagueSettings.season) : '20252026',
            timePeriod: 'season',
            myTeamId: selectedTeamA,
            leagueId: leagueSettings?.leagueId,
          }
        : {
            sideA: teamAPlayers.map(p => p.nhlId.toString()),
            sideB: teamBPlayers.map(p => p.nhlId.toString()),
            sideAName: selectedTeamA || 'Team A',
            sideBName: selectedTeamB || 'Team B',
          };
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to analyze trade');
      }
      
      const data = await response.json();
      
      // Handle different response formats
      if (data.success && data.data) {
        // Category analysis format: { success: true, data: analysis }
        setAnalysis(data.data);
      } else if (data.analysis) {
        // Enhanced analysis format: { analysis: ... }
        setAnalysis(data.analysis);
      } else {
        // Fallback: use data directly
        setAnalysis(data);
      }
      
      console.log('Trade analysis received:', {
        hasAnalysis: !!data.data || !!data.analysis,
        sideA: data.data?.sideA || data.analysis?.sideA,
        sideB: data.data?.sideB || data.analysis?.sideB,
      });
    } catch (error) {
      console.error('Evaluation failed:', error);
      alert(`Failed to evaluate trade: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  }

  // Clear trade
  function clearTrade() {
    setTeamAPlayers([]);
    setTeamBPlayers([]);
    setAnalysis(null);
    setShowAdvanced(false);
  }

  // Get recommendation color
  function getRecommendationColor(recommendation: string) {
    switch (recommendation) {
      case 'accept':
        return 'bg-green-500';
      case 'negotiate':
        return 'bg-yellow-500';
      case 'reject':
      case 'heavily-favor-a':
      case 'heavily-favor-b':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  }

  // Get recommendation icon
  function getRecommendationIcon(recommendation: string) {
    switch (recommendation) {
      case 'accept':
        return <CheckCircle className="w-6 h-6" />;
      case 'negotiate':
        return <AlertCircle className="w-6 h-6" />;
      case 'reject':
        return <X className="w-6 h-6" />;
      default:
        return <AlertCircle className="w-6 h-6" />;
    }
  }

  // Helper function to convert season format
  function convertSeasonFormat(season: string): string {
    if (season.length === 8) return season;
    if (season.length === 4) {
      const endYear = parseInt(season);
      const startYear = endYear - 1;
      return `${startYear}${endYear}`;
    }
    return '20252026';
  }

  const projectedStandings = analysis ? getProjectedStandings() : standings;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Trade Analyzer
          </h1>
          <p className="text-gray-600">
            Analyze fantasy hockey trades using category-based analysis, Z-scores, and win contribution metrics
          </p>
        </div>

        {/* Error message if league not synced */}
        {error && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              <p className="text-yellow-800">{error}</p>
            </div>
          </div>
        )}

        {/* Team Selection */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Select Teams</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Team A {selectedTeamA && <span className="text-blue-600">✓</span>}
              </label>
              <select
                value={selectedTeamA}
                onChange={(e) => setSelectedTeamA(e.target.value)}
                disabled={loadingTeams || teams.length === 0}
                className={`w-full px-3 py-2 border rounded-md text-gray-900 ${
                  selectedTeamA 
                    ? 'border-blue-500 bg-blue-50 font-semibold' 
                    : 'border-gray-300'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <option value="">Select Team A</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.teamName}>
                    {team.teamName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Team B {selectedTeamB && <span className="text-purple-600">✓</span>}
              </label>
              <select
                value={selectedTeamB}
                onChange={(e) => setSelectedTeamB(e.target.value)}
                disabled={loadingTeams || teams.length === 0}
                className={`w-full px-3 py-2 border rounded-md text-gray-900 ${
                  selectedTeamB 
                    ? 'border-purple-500 bg-purple-50 font-semibold' 
                    : 'border-gray-300'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <option value="">Select Team B</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.teamName}>
                    {team.teamName}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {loadingTeams && (
            <div className="mt-4 text-sm text-gray-600">Loading teams...</div>
          )}
          {!loadingTeams && teams.length === 0 && leagueSettings?.leagueId && (
            <div className="mt-4 text-sm text-yellow-600">
              No teams found. Make sure you've synced your league using the Refresh League button in the header.
            </div>
          )}
        </div>
        {teams.length > 0 && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-800 font-semibold">
              ✓ Successfully loaded {teams.length} teams. Select teams from the dropdowns above.
            </p>
            <div className="text-xs text-green-700 mt-1">
              Available teams: {teams.map(t => t.teamName).join(', ')}
            </div>
          </div>
        )}
      </div>

      {/* AI Trade Suggestions */}
      {selectedTeamA && teams.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-8 border-2 border-purple-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-purple-600 mb-1">🤖 AI Trade Suggestions</h2>
              <p className="text-sm text-gray-600">
                Analyze your team's weaknesses and get personalized trade recommendations
              </p>
              {teamAPlayers.length > 0 && (
                <div className="mt-2 text-sm">
                  <span className="font-semibold text-blue-600">
                    Players to trade ({teamAPlayers.length}):
                  </span>
                  <span className="text-gray-700 ml-2">
                    {teamAPlayers.map(p => p.name).join(', ')}
                  </span>
                </div>
              )}
              {teamAPlayers.length === 0 && (
                <p className="mt-2 text-sm text-orange-600">
                  💡 Tip: Add players to Team A above to get specific trade suggestions for those players
                </p>
              )}
            </div>
            <button
              onClick={fetchTradeSuggestions}
              disabled={loadingSuggestions || !selectedTeamA}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2 font-semibold ml-4"
            >
              <Zap className="w-5 h-5" />
              {loadingSuggestions ? 'Analyzing...' : 'Get AI Suggestions'}
            </button>
          </div>

          {showSuggestions && (
            <>
              {loadingSuggestions ? (
                <div className="text-center py-8 text-gray-600">
                  Analyzing your team and finding trade opportunities...
                </div>
              ) : tradeSuggestions ? (
                <div>
                  {/* Team Analysis */}
                  {tradeSuggestions.teamAnalysis && (
                    <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <h3 className="font-semibold text-red-800 mb-2">Weak Categories</h3>
                        <ul className="space-y-1 text-sm">
                          {tradeSuggestions.teamAnalysis.weakCategories.slice(0, 5).map((cat: any) => (
                            <li key={cat.category} className="text-red-700">
                              {cat.category}: Rank {cat.rank} ({cat.percentile}th percentile)
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <h3 className="font-semibold text-green-800 mb-2">Strong Categories</h3>
                        <ul className="space-y-1 text-sm">
                          {tradeSuggestions.teamAnalysis.strongCategories.slice(0, 5).map((cat: any) => (
                            <li key={cat.category} className="text-green-700">
                              {cat.category}: Rank {cat.rank} ({cat.percentile}th percentile)
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Trade Suggestions */}
                  {tradeSuggestions.suggestions && tradeSuggestions.suggestions.length > 0 ? (
                    <div className="space-y-4">
                      <h3 className="font-semibold text-lg mb-3">
                        Recommended Trades ({tradeSuggestions.suggestions.length})
                      </h3>
                      {tradeSuggestions.suggestions.map((suggestion: any, idx: number) => (
                        <div
                          key={idx}
                          className="border-2 border-gray-200 rounded-lg p-4 hover:border-purple-300 transition-colors"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                            {/* Your Player */}
                            <div className="text-center">
                              <div className="text-sm text-gray-600 mb-1">You Trade Away</div>
                              <div className="font-semibold text-lg text-blue-600">
                                {suggestion.yourPlayer.name || 'Select a player'}
                              </div>
                              {suggestion.yourPlayer.tpv && (
                                <div className="text-xs text-gray-500">TPV: {suggestion.yourPlayer.tpv.toFixed(1)}</div>
                              )}
                              {suggestion.yourPlayer.position && (
                                <div className="text-xs text-gray-500">
                                  {suggestion.yourPlayer.position} - {suggestion.yourPlayer.team}
                                </div>
                              )}
                            </div>

                            {/* Arrow */}
                            <div className="text-center">
                              <div className="text-2xl">⇄</div>
                              {suggestion.fairnessScore && (
                                <div className={`text-xs font-semibold mt-1 ${
                                  suggestion.fairnessScore >= 80 ? 'text-green-600' :
                                  suggestion.fairnessScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                                }`}>
                                  {suggestion.fairnessScore}/100 Fair
                                </div>
                              )}
                            </div>

                            {/* Target Player */}
                            <div className="text-center">
                              <div className="text-sm text-gray-600 mb-1">You Receive</div>
                              <div className="font-semibold text-lg text-purple-600">
                                {suggestion.targetPlayer.name}
                              </div>
                              {suggestion.targetPlayer.tpv && (
                                <div className="text-xs text-gray-500">TPV: {suggestion.targetPlayer.tpv.toFixed(1)}</div>
                              )}
                              <div className="text-xs text-gray-500">
                                {suggestion.targetPlayer.position} - {suggestion.targetPlayer.team}
                              </div>
                            </div>
                          </div>

                          {/* Reason and Category Impact */}
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <div className="text-sm font-semibold text-gray-700 mb-2">
                              💡 {suggestion.reason}
                            </div>
                            {Object.keys(suggestion.categoryImprovement).length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {Object.entries(suggestion.categoryImprovement)
                                  .filter(([_, val]) => Math.abs(val as number) > 0.1)
                                  .slice(0, 5)
                                  .map(([cat, val]) => (
                                    <span
                                      key={cat}
                                      className={`text-xs px-2 py-1 rounded ${
                                        (val as number) > 0
                                          ? 'bg-green-100 text-green-700'
                                          : 'bg-red-100 text-red-700'
                                      }`}
                                    >
                                      {cat}: {(val as number) > 0 ? '+' : ''}{(val as number).toFixed(1)}
                                    </span>
                                  ))}
                              </div>
                            )}
                            <button
                              onClick={() => loadSuggestedTrade(suggestion)}
                              className="mt-2 px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700"
                            >
                              Use This Trade
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <div className={`font-semibold mb-2 ${
                        tradeSuggestions.message?.includes('No fair trades') ? 'text-orange-600' : 'text-gray-600'
                      }`}>
                        {tradeSuggestions.message || 'No trade suggestions found. Try adding players you\'re willing to trade first.'}
                      </div>
                      {tradeSuggestions.debug && (
                        <div className="text-xs text-gray-500 mt-2">
                          Debug: Analyzed {tradeSuggestions.debug.playersAnalyzed} player(s), found {tradeSuggestions.debug.targetPlayersFound} target players, generated {tradeSuggestions.debug.suggestionsGenerated} suggestions
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

      {/* Search Section */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <div className="flex gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search for players (e.g., Connor McDavid, Nathan MacKinnon)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400 bg-white"
              style={{ color: '#111827' }}
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={isLoading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Search className="w-5 h-5" />
            Search
          </button>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="mt-4 border-t pt-4">
            <h3 className="font-semibold mb-2">Search Results</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {searchResults.map((player) => (
                <div
                  key={player.nhlId}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div>
                    <div className="font-medium text-gray-900">
                      {player.name} - {player.position} - {player.team}
                    </div>
                    {player.stats && (
                    <div className="text-sm text-gray-600">
                        {player.stats.goals}G, {player.stats.assists}A, {player.stats.points}P
                    </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => addToTeamA(player)}
                      className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                      title={selectedTeamA || 'Team A'}
                    >
                      Add to {selectedTeamA || 'Team A'}
                    </button>
                    <button
                      onClick={() => addToTeamB(player)}
                      className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
                      title={selectedTeamB || 'Team B'}
                    >
                      Add to {selectedTeamB || 'Team B'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Trade Builder */}
      <div id="trade-builder" className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Team A */}
        <div className="bg-white rounded-lg shadow-md p-6 border-2 border-blue-200">
          <div className="mb-4">
            <h2 className="text-2xl font-bold text-blue-600">
              {selectedTeamA || 'Team A'}
            </h2>
            {selectedTeamA && (
              <p className="text-xs text-blue-600 mb-1">Selected from league</p>
            )}
            <p className="text-sm font-semibold text-gray-700 mt-1">
              <span className="inline-block px-2 py-1 bg-red-100 text-red-700 rounded">
                ↙ Giving Away
              </span>
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {teamAPlayers.length} player{teamAPlayers.length !== 1 ? 's' : ''} being sent to {selectedTeamB || 'Team B'}
            </p>
          </div>
          {teamAPlayers.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              Search for players above and add them to this team
            </p>
          ) : (
            <div className="space-y-2">
              {teamAPlayers.map((player) => (
                <div key={player.nhlId} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div>
                    <div className="font-medium text-gray-900">{player.name}</div>
                    <div className="text-sm text-gray-600">
                      {player.position} - {player.team}
                    </div>
                  </div>
                  <button
                    onClick={() => removeFromTeamA(player.nhlId)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Team B */}
        <div className="bg-white rounded-lg shadow-md p-6 border-2 border-purple-200">
          <div className="mb-4">
            <h2 className="text-2xl font-bold text-purple-600">
              {selectedTeamB || 'Team B'}
            </h2>
            {selectedTeamB && (
              <p className="text-xs text-purple-600 mb-1">Selected from league</p>
            )}
            <p className="text-sm font-semibold text-gray-700 mt-1">
              <span className="inline-block px-2 py-1 bg-red-100 text-red-700 rounded">
                ↙ Giving Away
              </span>
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {teamBPlayers.length} player{teamBPlayers.length !== 1 ? 's' : ''} being sent to {selectedTeamA || 'Team A'}
            </p>
          </div>
          {teamBPlayers.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              Search for players above and add them to this team
            </p>
          ) : (
            <div className="space-y-2">
              {teamBPlayers.map((player) => (
                <div key={player.nhlId} className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <div>
                    <div className="font-medium text-gray-900">{player.name}</div>
                    <div className="text-sm text-gray-600">
                      {player.position} - {player.team}
                    </div>
                  </div>
                  <button
                    onClick={() => removeFromTeamB(player.nhlId)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Analysis Mode Toggle */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-semibold text-gray-700">Analysis Mode:</label>
            <p className="text-xs text-gray-500 mt-1">
              {useCategoryAnalysis 
                ? 'Category-based analysis (optimized for categories leagues)' 
                : 'Enhanced analysis (TPV + projections)'}
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={useCategoryAnalysis}
              onChange={(e) => setUseCategoryAnalysis(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            <span className="ml-3 text-sm font-medium text-gray-700">
              {useCategoryAnalysis ? 'Category Mode' : 'Enhanced Mode'}
            </span>
          </label>
        </div>
        {useCategoryAnalysis && (teamAPlayers.length > 3 || teamBPlayers.length > 3) && (
          <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
            ⚠️ Category analysis supports max 3 players per side. Please remove {Math.max(0, teamAPlayers.length - 3) + Math.max(0, teamBPlayers.length - 3)} player(s).
          </div>
        )}
      </div>

      {/* Evaluate Button */}
      <div className="flex gap-4 justify-center mb-8">
        <button
          onClick={evaluateTrade}
          disabled={isLoading || teamAPlayers.length === 0 || teamBPlayers.length === 0 || (useCategoryAnalysis && (teamAPlayers.length > 3 || teamBPlayers.length > 3))}
          className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-lg flex items-center gap-2"
        >
          {isLoading ? 'Analyzing...' : (
            <>
              <BarChart3 className="w-5 h-5" />
              Analyze Trade {useCategoryAnalysis ? '(Category-Based)' : '(Enhanced)'}
            </>
          )}
        </button>
        <button
          onClick={clearTrade}
          className="px-8 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
        >
          Clear Trade
        </button>
      </div>

      {/* Enhanced Analysis Results */}
      {analysis && (
        <div className="bg-white rounded-lg shadow-lg p-6 border-2 border-blue-200">
          <h2 className="text-3xl font-bold mb-6 text-center">Advanced Trade Analysis</h2>
          
          {/* Recommendation Header */}
          <div className="flex items-center justify-center gap-4 mb-8 p-6 bg-gray-50 rounded-lg">
            <div className={`p-3 rounded-full ${getRecommendationColor(analysis.recommendation)} text-white`}>
              {getRecommendationIcon(analysis.recommendation)}
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900 mb-2">
                {analysis.recommendation.toUpperCase().replace(/-/g, ' ')}
              </div>
              <div className="text-gray-600">
                {Array.isArray(analysis.reasoning) ? analysis.reasoning.join('. ') : analysis.reasoning}
              </div>
            </div>
          </div>

          {/* Fairness Meter */}
          {analysis.fairnessScore !== undefined && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <span className="text-lg font-semibold">Fairness Score</span>
                <span className="text-2xl font-bold">{analysis.fairnessScore}/100</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className={`h-4 rounded-full transition-all ${
                    analysis.fairnessScore >= 80
                      ? 'bg-green-500'
                      : analysis.fairnessScore >= 60
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                  }`}
                  style={{ width: `${analysis.fairnessScore}%` }}
                />
              </div>
            </div>
          )}
          
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-blue-50 p-6 rounded-lg border-2 border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold text-gray-700">Team A</div>
              </div>
              <div className="text-3xl font-bold text-blue-600 mb-1">
                {useCategoryAnalysis 
                  ? (analysis.sideA?.totalZScore?.toFixed(1) || '0.0')
                  : (analysis.sideA?.compositeValue?.toFixed(1) || '0.0')}
            </div>
              <div className="text-xs text-gray-600 mb-2">
                {useCategoryAnalysis 
                  ? <span className="font-semibold">Total Z-Score</span>
                  : <><span className="font-semibold">Composite Value</span> (60% current + 40% talent)</>}
              </div>
              {!useCategoryAnalysis && (
                <div className="text-xs text-gray-500 mb-2">
                  Current: {analysis.sideA?.totalTPV?.toFixed(1) || '0.0'} TPV | Talent: {analysis.sideA?.totalPPV?.toFixed(1) || '0.0'} PPV
                </div>
              )}
              <div className="text-xs text-gray-600 mt-2 pt-2 border-t border-blue-200 space-y-1">
                <div>
                  <span className="font-semibold text-red-700">↘ Giving Away:</span> {teamAPlayers.length} player{teamAPlayers.length !== 1 ? 's' : ''} → Team B
                </div>
                <div>
                  <span className="font-semibold text-green-700">↗ Receiving:</span> {teamBPlayers.length} player{teamBPlayers.length !== 1 ? 's' : ''} ← Team B
                </div>
              </div>
            </div>
            <div className="bg-purple-50 p-6 rounded-lg border-2 border-purple-200">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold text-gray-700">Team B</div>
              </div>
              <div className="text-3xl font-bold text-purple-600 mb-1">
                {useCategoryAnalysis 
                  ? (analysis.sideB?.totalZScore?.toFixed(1) || '0.0')
                  : (analysis.sideB?.compositeValue?.toFixed(1) || '0.0')}
              </div>
              <div className="text-xs text-gray-600 mb-2">
                {useCategoryAnalysis 
                  ? <span className="font-semibold">Total Z-Score</span>
                  : <><span className="font-semibold">Composite Value</span> (60% current + 40% talent)</>}
              </div>
              {!useCategoryAnalysis && (
                <div className="text-xs text-gray-500 mb-2">
                  Current: {analysis.sideB?.totalTPV?.toFixed(1) || '0.0'} TPV | Talent: {analysis.sideB?.totalPPV?.toFixed(1) || '0.0'} PPV
                </div>
              )}
              <div className="text-xs text-gray-600 mt-2 pt-2 border-t border-purple-200 space-y-1">
                <div>
                  <span className="font-semibold text-red-700">↘ Giving Away:</span> {teamBPlayers.length} player{teamBPlayers.length !== 1 ? 's' : ''} → Team A
                </div>
                <div>
                  <span className="font-semibold text-green-700">↗ Receiving:</span> {teamAPlayers.length} player{teamAPlayers.length !== 1 ? 's' : ''} ← Team A
                </div>
              </div>
            </div>
          </div>

          {/* Net Gain */}
          <div className="bg-indigo-50 border-l-4 border-indigo-400 p-4 mb-6">
            <div className="flex items-center gap-2">
              {useCategoryAnalysis ? (
                // Category-based analysis
                (() => {
                  const netZScore = (analysis.sideB?.totalZScore || 0) - (analysis.sideA?.totalZScore || 0);
                  return netZScore > 0 ? (
                    <>
                      <TrendingUp className="w-6 h-6 text-green-600" />
                      <span className="text-lg font-semibold text-green-600">
                        Team A gains {Math.abs(netZScore).toFixed(1)} net Z-score
                      </span>
                      <span className="text-sm text-gray-600 ml-2">
                        (Category-based value)
                      </span>
                    </>
                  ) : netZScore < 0 ? (
                    <>
                      <TrendingDown className="w-6 h-6 text-red-600" />
                      <span className="text-lg font-semibold text-red-600">
                        Team B gains {Math.abs(netZScore).toFixed(1)} net Z-score
                      </span>
                      <span className="text-sm text-gray-600 ml-2">
                        (Category-based value)
                      </span>
                    </>
                  ) : (
                    <>
                      <Minus className="w-6 h-6 text-gray-600" />
                      <span className="text-lg font-semibold text-gray-600">
                        Balanced trade
                      </span>
                    </>
                  );
                })()
              ) : (
                // Enhanced analysis
                (() => {
                  const netGain = analysis.netCompositeGain || 0;
                  return netGain > 0 ? (
                    <>
                      <TrendingUp className="w-6 h-6 text-green-600" />
                      <span className="text-lg font-semibold text-green-600">
                        Team A gains {Math.abs(netGain).toFixed(1)} net value
                      </span>
                      <span className="text-sm text-gray-600 ml-2">
                        (Composite: 60% current + 40% talent)
                      </span>
                    </>
                  ) : netGain < 0 ? (
                    <>
                      <TrendingDown className="w-6 h-6 text-red-600" />
                      <span className="text-lg font-semibold text-red-600">
                        Team B gains {Math.abs(netGain).toFixed(1)} net value
                      </span>
                      <span className="text-sm text-gray-600 ml-2">
                        (Composite: 60% current + 40% talent)
                      </span>
                    </>
                  ) : (
                    <>
                      <Minus className="w-6 h-6 text-gray-600" />
                      <span className="text-lg font-semibold text-gray-600">
                        Balanced trade
                      </span>
                    </>
                  );
                })()
              )}
            </div>
          </div>

          {/* Category Impact Table */}
          {(analysis.categoryImpact || analysis.categoryImpacts) && (
            <div className="bg-white border-2 border-gray-300 rounded-lg p-6 mb-6">
              <div className="font-semibold text-lg text-gray-800 mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Category Impact on Standings
              </div>
              <div className="text-sm text-gray-600 mb-4">
                Shows how this trade affects each fantasy category. Net change is from Team A's perspective.
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Team A Giving Away
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Team A Receiving
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Net Change
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {Object.entries((analysis.categoryImpact?.netChange || analysis.netCategoryChanges || {})).map(([category, netChange]) => {
                      const givingAway = analysis.categoryImpact?.sideA?.[category] || analysis.sideA?.categoryStats?.[category] || 0
                      const receiving = analysis.categoryImpact?.sideB?.[category] || analysis.sideB?.categoryStats?.[category] || 0
                      
                      // Determine if this is a "lower is better" stat (GAA)
                      const lowerIsBetter = category === 'GAA'
                      
                      // Format the value based on category
                      const formatValue = (val: number) => {
                        if (category === 'GAA' || category === 'SV%') {
                          return val.toFixed(3)
                        }
                        return Math.round(val).toString()
                      }
                      
                      // Determine color for net change
                      let netChangeColor = 'text-gray-700'
                      if (lowerIsBetter) {
                        // For GAA, negative change (decrease) is good
                        netChangeColor = netChange < 0 ? 'text-green-600 font-semibold' : netChange > 0 ? 'text-red-600 font-semibold' : 'text-gray-700'
                      } else {
                        // For most stats, positive change is good
                        netChangeColor = netChange > 0 ? 'text-green-600 font-semibold' : netChange < 0 ? 'text-red-600 font-semibold' : 'text-gray-700'
                      }
                      
                      return (
                        <tr key={category} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                            {category}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700">
                            {formatValue(givingAway)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700">
                            {formatValue(receiving)}
                          </td>
                          <td className={`px-4 py-3 whitespace-nowrap text-sm text-right ${netChangeColor}`}>
                            {netChange > 0 ? '+' : ''}{formatValue(netChange)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Projected Standings Table */}
          {standings.length > 0 && analysis && (
            <div className="bg-white border-2 border-gray-300 rounded-lg p-6 mb-6">
              <div className="font-semibold text-lg text-gray-800 mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Projected Standings After Trade
              </div>
              <div className="text-sm text-gray-600 mb-4">
                Shows how the standings would change after this trade. Teams involved in the trade are highlighted.
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50">
                        Rank
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase sticky left-12 bg-gray-50">
                        Team
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        W
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        L
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        T
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        PCT
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        G
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        A
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        +/-
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        PIM
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        PPP
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        FOW
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        SOG
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        HIT
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        BLK
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        W (G)
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        SO
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        GAA
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        SV%
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {projectedStandings.map((team, idx) => {
                      const originalTeam = standings.find(t => t.teamName === team.teamName);
                      const isTradeTeam = team.teamName === selectedTeamA || team.teamName === selectedTeamB;
                      const rowBgColor = isTradeTeam ? (team.teamName === selectedTeamA ? 'bg-blue-50' : 'bg-purple-50') : '';
                      
                      return (
                        <tr key={team.teamName} className={`hover:bg-gray-50 ${rowBgColor}`}>
                          <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-inherit">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-12 bg-inherit">
                            {team.teamName}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm text-right text-gray-700">
                            {team.wins}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm text-right text-gray-700">
                            {team.losses}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm text-right text-gray-700">
                            {team.ties}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm text-right text-gray-700">
                            {team.winPercentage.toFixed(3)}
                          </td>
                          <td className={`px-3 py-2 whitespace-nowrap text-sm text-right ${isTradeTeam && originalTeam && team.G !== originalTeam.G ? (team.G! > (originalTeam.G || 0) ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold') : 'text-gray-700'}`}>
                            {team.G?.toFixed(0) || 0}
                            {isTradeTeam && originalTeam && team.G !== originalTeam.G && (
                              <span className="text-xs ml-1">
                                ({team.G! > (originalTeam.G || 0) ? '+' : ''}{((team.G || 0) - (originalTeam.G || 0)).toFixed(0)})
                              </span>
                            )}
                          </td>
                          <td className={`px-3 py-2 whitespace-nowrap text-sm text-right ${isTradeTeam && originalTeam && team.A !== originalTeam.A ? (team.A! > (originalTeam.A || 0) ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold') : 'text-gray-700'}`}>
                            {team.A?.toFixed(0) || 0}
                            {isTradeTeam && originalTeam && team.A !== originalTeam.A && (
                              <span className="text-xs ml-1">
                                ({team.A! > (originalTeam.A || 0) ? '+' : ''}{((team.A || 0) - (originalTeam.A || 0)).toFixed(0)})
                              </span>
                            )}
                          </td>
                          <td className={`px-3 py-2 whitespace-nowrap text-sm text-right ${isTradeTeam && originalTeam && team.plusMinus !== originalTeam.plusMinus ? (team.plusMinus! > (originalTeam.plusMinus || 0) ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold') : 'text-gray-700'}`}>
                            {team.plusMinus?.toFixed(0) || 0}
                            {isTradeTeam && originalTeam && team.plusMinus !== originalTeam.plusMinus && (
                              <span className="text-xs ml-1">
                                ({team.plusMinus! > (originalTeam.plusMinus || 0) ? '+' : ''}{((team.plusMinus || 0) - (originalTeam.plusMinus || 0)).toFixed(0)})
                              </span>
                            )}
                          </td>
                          <td className={`px-3 py-2 whitespace-nowrap text-sm text-right ${isTradeTeam && originalTeam && team.PIM !== originalTeam.PIM ? (team.PIM! > (originalTeam.PIM || 0) ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold') : 'text-gray-700'}`}>
                            {team.PIM?.toFixed(0) || 0}
                            {isTradeTeam && originalTeam && team.PIM !== originalTeam.PIM && (
                              <span className="text-xs ml-1">
                                ({team.PIM! > (originalTeam.PIM || 0) ? '+' : ''}{((team.PIM || 0) - (originalTeam.PIM || 0)).toFixed(0)})
                              </span>
                            )}
                          </td>
                          <td className={`px-3 py-2 whitespace-nowrap text-sm text-right ${isTradeTeam && originalTeam && team.PPP !== originalTeam.PPP ? (team.PPP! > (originalTeam.PPP || 0) ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold') : 'text-gray-700'}`}>
                            {team.PPP?.toFixed(0) || 0}
                            {isTradeTeam && originalTeam && team.PPP !== originalTeam.PPP && (
                              <span className="text-xs ml-1">
                                ({team.PPP! > (originalTeam.PPP || 0) ? '+' : ''}{((team.PPP || 0) - (originalTeam.PPP || 0)).toFixed(0)})
                              </span>
                            )}
                          </td>
                          <td className={`px-3 py-2 whitespace-nowrap text-sm text-right ${isTradeTeam && originalTeam && team.FOW !== originalTeam.FOW ? (team.FOW! > (originalTeam.FOW || 0) ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold') : 'text-gray-700'}`}>
                            {team.FOW?.toFixed(0) || 0}
                            {isTradeTeam && originalTeam && team.FOW !== originalTeam.FOW && (
                              <span className="text-xs ml-1">
                                ({team.FOW! > (originalTeam.FOW || 0) ? '+' : ''}{((team.FOW || 0) - (originalTeam.FOW || 0)).toFixed(0)})
                              </span>
                            )}
                          </td>
                          <td className={`px-3 py-2 whitespace-nowrap text-sm text-right ${isTradeTeam && originalTeam && team.SOG !== originalTeam.SOG ? (team.SOG! > (originalTeam.SOG || 0) ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold') : 'text-gray-700'}`}>
                            {team.SOG?.toFixed(0) || 0}
                            {isTradeTeam && originalTeam && team.SOG !== originalTeam.SOG && (
                              <span className="text-xs ml-1">
                                ({team.SOG! > (originalTeam.SOG || 0) ? '+' : ''}{((team.SOG || 0) - (originalTeam.SOG || 0)).toFixed(0)})
                              </span>
                            )}
                          </td>
                          <td className={`px-3 py-2 whitespace-nowrap text-sm text-right ${isTradeTeam && originalTeam && team.HIT !== originalTeam.HIT ? (team.HIT! > (originalTeam.HIT || 0) ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold') : 'text-gray-700'}`}>
                            {team.HIT?.toFixed(0) || 0}
                            {isTradeTeam && originalTeam && team.HIT !== originalTeam.HIT && (
                              <span className="text-xs ml-1">
                                ({team.HIT! > (originalTeam.HIT || 0) ? '+' : ''}{((team.HIT || 0) - (originalTeam.HIT || 0)).toFixed(0)})
                              </span>
                            )}
                          </td>
                          <td className={`px-3 py-2 whitespace-nowrap text-sm text-right ${isTradeTeam && originalTeam && team.BLK !== originalTeam.BLK ? (team.BLK! > (originalTeam.BLK || 0) ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold') : 'text-gray-700'}`}>
                            {team.BLK?.toFixed(0) || 0}
                            {isTradeTeam && originalTeam && team.BLK !== originalTeam.BLK && (
                              <span className="text-xs ml-1">
                                ({team.BLK! > (originalTeam.BLK || 0) ? '+' : ''}{((team.BLK || 0) - (originalTeam.BLK || 0)).toFixed(0)})
                              </span>
                            )}
                          </td>
                          <td className={`px-3 py-2 whitespace-nowrap text-sm text-right ${isTradeTeam && originalTeam && team.W !== originalTeam.W ? (team.W! > (originalTeam.W || 0) ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold') : 'text-gray-700'}`}>
                            {team.W?.toFixed(0) || 0}
                            {isTradeTeam && originalTeam && team.W !== originalTeam.W && (
                              <span className="text-xs ml-1">
                                ({team.W! > (originalTeam.W || 0) ? '+' : ''}{((team.W || 0) - (originalTeam.W || 0)).toFixed(0)})
                              </span>
                            )}
                          </td>
                          <td className={`px-3 py-2 whitespace-nowrap text-sm text-right ${isTradeTeam && originalTeam && team.SO !== originalTeam.SO ? (team.SO! > (originalTeam.SO || 0) ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold') : 'text-gray-700'}`}>
                            {team.SO?.toFixed(0) || 0}
                            {isTradeTeam && originalTeam && team.SO !== originalTeam.SO && (
                              <span className="text-xs ml-1">
                                ({team.SO! > (originalTeam.SO || 0) ? '+' : ''}{((team.SO || 0) - (originalTeam.SO || 0)).toFixed(0)})
                              </span>
                            )}
                          </td>
                          <td className={`px-3 py-2 whitespace-nowrap text-sm text-right ${isTradeTeam && originalTeam && team.GAA !== originalTeam.GAA ? (team.GAA! < (originalTeam.GAA || 999) ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold') : 'text-gray-700'}`}>
                            {team.GAA?.toFixed(3) || '-'}
                            {isTradeTeam && originalTeam && team.GAA !== originalTeam.GAA && (
                              <span className="text-xs ml-1">
                                ({team.GAA! < (originalTeam.GAA || 999) ? '' : '+'}{((team.GAA || 0) - (originalTeam.GAA || 0)).toFixed(3)})
                              </span>
                            )}
                          </td>
                          <td className={`px-3 py-2 whitespace-nowrap text-sm text-right ${isTradeTeam && originalTeam && team.SV !== originalTeam.SV ? (team.SV! > (originalTeam.SV || 0) ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold') : 'text-gray-700'}`}>
                            {team.SV ? (team.SV * 100).toFixed(1) + '%' : '-'}
                            {isTradeTeam && originalTeam && team.SV !== originalTeam.SV && (
                              <span className="text-xs ml-1">
                                ({team.SV! > (originalTeam.SV || 0) ? '+' : ''}{((team.SV || 0) - (originalTeam.SV || 0)).toFixed(3)})
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Detailed Insights */}
          {((analysis.detailedInsights && analysis.detailedInsights.length > 0) || (analysis.insights && analysis.insights.length > 0)) && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
              <div className="font-semibold text-yellow-800 mb-2 flex items-center gap-2">
                <Info className="w-5 h-5" />
                Key Insights
          </div>
              <ul className="list-disc list-inside text-yellow-700 space-y-1">
                {(analysis.detailedInsights || analysis.insights || []).map((insight: string, idx: number) => (
                  <li key={idx}>{insight}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggested Adjustments */}
          {analysis.suggestedAdjustments && analysis.suggestedAdjustments.length > 0 && (
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
              <div className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
                <Target className="w-5 h-5" />
                Suggested Adjustments
              </div>
              <ul className="list-disc list-inside text-blue-700 space-y-1">
                {analysis.suggestedAdjustments.map((adjustment, idx) => (
                  <li key={idx}>{adjustment}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Toggle Advanced Details */}
          <div className="text-center mb-4">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-2 mx-auto"
            >
              <Zap className="w-4 h-4" />
              {showAdvanced ? 'Hide' : 'Show'} Advanced Details
            </button>
          </div>

          {/* Advanced Details */}
          {showAdvanced && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-6">
            <div>
                <div className="mb-4 pb-2 border-b-2 border-blue-300">
                  <h3 className="font-bold text-lg text-blue-600">Team A</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    <span className="font-semibold">Giving Away:</span> {teamAPlayers.length} player{teamAPlayers.length !== 1 ? 's' : ''} 
                    {' → '}
                    <span className="text-purple-600">Team B</span>
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    <span className="font-semibold">Receiving:</span> {teamBPlayers.length} player{teamBPlayers.length !== 1 ? 's' : ''} 
                    {' ← '}
                    <span className="text-purple-600">Team B</span>
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-gray-700 mb-2 px-2">
                    Players Team A is Sending:
                  </div>
                  {(analysis.playerBreakdown?.sideA || analysis.sideA?.players || []).map((playerData: any, idx: number) => {
                    // Handle both formats: enhanced has playerData.player, category has playerData.player directly
                    const player = playerData.player || playerData;
                    const playerName = player.name || `${player.firstName || ''} ${player.lastName || ''}`.trim() || 'Unknown Player';
                    
                    return (
                      <div key={idx} className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                        <div className="font-medium text-lg mb-2">{playerName}</div>
                        {!useCategoryAnalysis && playerData.tpv !== undefined && (
                          <div className="text-sm text-gray-600 mb-2">
                            <strong>TPV:</strong> {playerData.tpv.toFixed(1)}
                          </div>
                        )}
                        {useCategoryAnalysis && playerData.totalZScore !== undefined && (
                          <div className="text-sm text-gray-600 mb-2">
                            <strong>Total Z-Score:</strong> {playerData.totalZScore.toFixed(2)}
                          </div>
                        )}
                        {!useCategoryAnalysis && playerData.riskMetrics && (
                          <div className="text-sm space-y-1">
                            <div>
                              <strong>Trend:</strong> {playerData.riskMetrics.trend} 
                              ({playerData.riskMetrics.trendStrength}/100)
                            </div>
                            <div>
                              <strong>Consistency:</strong> {playerData.riskMetrics.consistencyRating}
                              {playerData.riskMetrics.boomOrBust && ' (Boom-or-Bust)'}
                            </div>
                          </div>
                        )}
                        {!useCategoryAnalysis && playerData.rosProjection && (
                          <div className="text-sm mt-2 pt-2 border-t border-blue-200">
                            <strong>ROS Projected:</strong> {playerData.rosProjection.projectedFantasyPointsPerGame.toFixed(1)} FPPG
                            <br />
                            <strong>Confidence:</strong> {playerData.rosProjection.confidence}%
                          </div>
                        )}
                        {useCategoryAnalysis && playerData.gamesRemaining !== undefined && (
                          <div className="text-sm mt-2 pt-2 border-t border-blue-200">
                            <strong>Games Remaining:</strong> {playerData.gamesRemaining}
                            <br />
                            <strong>Strength of Schedule:</strong> {playerData.strengthOfSchedule?.toFixed(0) || 'N/A'}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
            <div>
                <div className="mb-4 pb-2 border-b-2 border-purple-300">
                  <h3 className="font-bold text-lg text-purple-600">Team B</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    <span className="font-semibold">Giving Away:</span> {teamBPlayers.length} player{teamBPlayers.length !== 1 ? 's' : ''} 
                    {' → '}
                    <span className="text-blue-600">Team A</span>
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    <span className="font-semibold">Receiving:</span> {teamAPlayers.length} player{teamAPlayers.length !== 1 ? 's' : ''} 
                    {' ← '}
                    <span className="text-blue-600">Team A</span>
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-gray-700 mb-2 px-2">
                    Players Team B is Sending:
                  </div>
                  {(analysis.playerBreakdown?.sideB || analysis.sideB?.players || []).map((playerData: any, idx: number) => {
                    // Handle both formats: enhanced has playerData.player, category has playerData.player directly
                    const player = playerData.player || playerData;
                    const playerName = player.name || `${player.firstName || ''} ${player.lastName || ''}`.trim() || 'Unknown Player';
                    
                    return (
                      <div key={idx} className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                        <div className="font-medium text-lg mb-2">{playerName}</div>
                        {!useCategoryAnalysis && playerData.tpv !== undefined && (
                          <div className="text-sm text-gray-600 mb-2">
                            <strong>TPV:</strong> {playerData.tpv.toFixed(1)}
                          </div>
                        )}
                        {useCategoryAnalysis && playerData.totalZScore !== undefined && (
                          <div className="text-sm text-gray-600 mb-2">
                            <strong>Total Z-Score:</strong> {playerData.totalZScore.toFixed(2)}
                          </div>
                        )}
                        {!useCategoryAnalysis && playerData.riskMetrics && (
                          <div className="text-sm space-y-1">
                            <div>
                              <strong>Trend:</strong> {playerData.riskMetrics.trend} 
                              ({playerData.riskMetrics.trendStrength}/100)
                            </div>
                            <div>
                              <strong>Consistency:</strong> {playerData.riskMetrics.consistencyRating}
                              {playerData.riskMetrics.boomOrBust && ' (Boom-or-Bust)'}
                            </div>
                          </div>
                        )}
                        {!useCategoryAnalysis && playerData.rosProjection && (
                          <div className="text-sm mt-2 pt-2 border-t border-purple-200">
                            <strong>ROS Projected:</strong> {playerData.rosProjection.projectedFantasyPointsPerGame.toFixed(1)} FPPG
                            <br />
                            <strong>Confidence:</strong> {playerData.rosProjection.confidence}%
                          </div>
                        )}
                        {useCategoryAnalysis && playerData.gamesRemaining !== undefined && (
                          <div className="text-sm mt-2 pt-2 border-t border-purple-200">
                            <strong>Games Remaining:</strong> {playerData.gamesRemaining}
                            <br />
                            <strong>Strength of Schedule:</strong> {playerData.strengthOfSchedule?.toFixed(0) || 'N/A'}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
          )}
        </div>
      )}
    </div>
  );
}
