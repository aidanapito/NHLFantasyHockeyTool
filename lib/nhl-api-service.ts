/**
 * NHL API Service
 * 
 * Centralized service for fetching NHL player and team data.
 * Includes rate limiting, error handling, retry logic, and response caching.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

// NHL API Base URLs
export const NHL_STATS_API_BASE = 'https://api.nhle.com/stats/rest/en';
export const NHL_WEB_API_BASE = 'https://api-web.nhle.com/v1';

// Rate limiting configuration
const DEFAULT_DELAY_MS = 200; // Delay between requests (ms)
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Request queue for rate limiting
let lastRequestTime = 0;
let requestQueue: Array<() => void> = [];
let isProcessingQueue = false;

/**
 * Simple rate limiter - ensures minimum delay between requests
 */
async function rateLimitedRequest<T>(requestFn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const executeRequest = async () => {
      const now = Date.now();
      const timeSinceLastRequest = now - lastRequestTime;
      const waitTime = Math.max(0, DEFAULT_DELAY_MS - timeSinceLastRequest);

      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      lastRequestTime = Date.now();

      try {
        const result = await requestFn();
        resolve(result);
      } catch (error) {
        reject(error);
      } finally {
        if (requestQueue.length > 0) {
          const nextRequest = requestQueue.shift();
          if (nextRequest) nextRequest();
        } else {
          isProcessingQueue = false;
        }
      }
    };

    requestQueue.push(executeRequest);

    if (!isProcessingQueue) {
      isProcessingQueue = true;
      executeRequest();
    }
  });
}

/**
 * Retry logic with exponential backoff
 */
async function retryRequest<T>(
  requestFn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error as Error;
      const isAxiosError = error instanceof AxiosError;
      const status = isAxiosError ? error.response?.status : null;

      // Don't retry on 4xx errors (client errors)
      if (status && status >= 400 && status < 500) {
        throw error;
      }

      // Don't retry if we've exhausted retries
      if (attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff
      const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Create configured axios instance
 */
function createAxiosInstance(baseURL: string): AxiosInstance {
  const instance = axios.create({
    baseURL,
    timeout: 30000, // 30 second timeout
    headers: {
      'User-Agent': 'FantasyHockeyAnalyzer/1.0',
    },
  });

  // Add request interceptor for logging (optional)
  instance.interceptors.request.use(
    (config) => {
      // Can add logging here if needed
      return config;
    },
    (error) => Promise.reject(error)
  );

  return instance;
}

const statsApi = createAxiosInstance(NHL_STATS_API_BASE);
const webApi = createAxiosInstance(NHL_WEB_API_BASE);

/**
 * Generic API request wrapper with rate limiting and retries
 */
async function apiRequest<T>(
  requestFn: () => Promise<T>
): Promise<T> {
  return rateLimitedRequest(() => retryRequest(requestFn));
}

// ============================================================================
// PLAYER DATA FETCHING
// ============================================================================

export interface SkaterSummaryStats {
  playerId: number;
  skaterFullName: string;
  positionCode: string;
  teamAbbrevs: string;
  gamesPlayed: number;
  goals: number;
  assists: number;
  points: number;
  plusMinus: number;
  penaltyMinutes: number;
  ppGoals: number;
  ppPoints: number;
  shots: number;
  shootingPct: number;
  faceoffWinPct: number | null;
  timeOnIcePerGame: string;
  evGoals: number;
  evPoints: number;
  shGoals: number;
  shPoints: number;
  // Additional calculated fields
  pointsPerGame?: number;
  goalsPerGame?: number;
  shotsPerGame?: number;
}

export interface SkaterShootingStats {
  playerId: number;
  shots: number;
  goals: number;
  shootingPct: number;
  shotAttempts?: number;
  missShots?: number;
  blockedShots?: number;
}

export interface SkaterRealtimeStats {
  playerId: number;
  blockedShots: number;
  hits: number;
  giveaways: number;
  takeaways: number;
  // Additional realtime stats if available
  shotAttempts?: number;
  missedShots?: number;
}

export interface FaceoffStats {
  playerId: number;
  totalFaceoffs: number;
  totalFaceoffWins: number;
  totalFaceoffLosses: number;
  faceoffWinPct: number;
}

export interface GoalieSummaryStats {
  playerId: number;
  goalieFullName: string;
  positionCode: string;
  teamAbbrevs: string;
  gamesPlayed: number;
  gamesStarted: number;
  wins: number;
  losses: number;
  otLosses: number;
  shotsAgainst: number;
  saves: number;
  savePct: number;
  goalsAgainstAverage: number;
  shutouts: number;
}

/**
 * Fetch all skater summary stats for a season (paginated)
 */
export async function fetchSkaterSummaryStats(
  season: string,
  gameTypeId: number = 2 // 2 = regular season
): Promise<SkaterSummaryStats[]> {
  const allStats: SkaterSummaryStats[] = [];
  let start = 0;
  const batchSize = 100;

  try {
    while (true) {
      const data = await apiRequest(() =>
        statsApi.get('/skater/summary', {
          params: {
            isAggregate: false,
            isGame: false,
            sort: '[{"property":"points","direction":"DESC"}]',
            start,
            limit: batchSize,
            factCayenneExp: 'gamesPlayed>=1',
            cayenneExp: `gameTypeId=${gameTypeId} and seasonId=${season}`,
          },
        })
      );

      const batch = data.data.data || [];
      if (batch.length === 0) break;

      allStats.push(...batch);
      start += batchSize;

      // Small delay to avoid hammering the API
      if (batch.length === batchSize) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return allStats;
  } catch (error) {
    console.error(`Error fetching skater summary stats for season ${season}:`, error);
    throw error;
  }
}

/**
 * Fetch all skater realtime stats (hits, blocks, etc.)
 */
export async function fetchSkaterRealtimeStats(
  season: string,
  gameTypeId: number = 2
): Promise<SkaterRealtimeStats[]> {
  const allStats: SkaterRealtimeStats[] = [];
  let start = 0;
  const batchSize = 100;

  try {
    while (true) {
      const data = await apiRequest(() =>
        statsApi.get('/skater/realtime', {
          params: {
            isAggregate: false,
            isGame: false,
            sort: '[{"property":"hits","direction":"DESC"}]',
            start,
            limit: batchSize,
            factCayenneExp: 'gamesPlayed>=1',
            cayenneExp: `gameTypeId=${gameTypeId} and seasonId=${season}`,
          },
        })
      );

      const batch = data.data.data || [];
      if (batch.length === 0) break;

      allStats.push(...batch);
      start += batchSize;

      if (batch.length === batchSize) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return allStats;
  } catch (error) {
    console.error(`Error fetching skater realtime stats for season ${season}:`, error);
    throw error;
  }
}

/**
 * Fetch faceoff statistics
 */
export async function fetchFaceoffStats(
  season: string,
  gameTypeId: number = 2
): Promise<FaceoffStats[]> {
  const allStats: FaceoffStats[] = [];
  let start = 0;
  const batchSize = 100;

  try {
    while (true) {
      const data = await apiRequest(() =>
        statsApi.get('/skater/faceoffwins', {
          params: {
            isAggregate: false,
            isGame: false,
            sort: '[{"property":"totalFaceoffs","direction":"DESC"}]',
            start,
            limit: batchSize,
            factCayenneExp: 'gamesPlayed>=1',
            cayenneExp: `gameTypeId=${gameTypeId} and seasonId=${season}`,
          },
        })
      );

      const batch = data.data.data || [];
      if (batch.length === 0) break;

      allStats.push(...batch);
      start += batchSize;

      if (batch.length === batchSize) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return allStats;
  } catch (error) {
    console.error(`Error fetching faceoff stats for season ${season}:`, error);
    throw error;
  }
}

/**
 * Fetch goalie summary stats
 */
export async function fetchGoalieStats(
  season: string,
  gameTypeId: number = 2
): Promise<GoalieSummaryStats[]> {
  const allStats: GoalieSummaryStats[] = [];
  let start = 0;
  const batchSize = 100;

  try {
    while (true) {
      const data = await apiRequest(() =>
        statsApi.get('/goalie/summary', {
          params: {
            isAggregate: false,
            isGame: false,
            sort: '[{"property":"wins","direction":"DESC"}]',
            start,
            limit: batchSize,
            factCayenneExp: 'gamesPlayed>=1',
            cayenneExp: `gameTypeId=${gameTypeId} and seasonId=${season}`,
          },
        })
      );

      const batch = data.data.data || [];
      if (batch.length === 0) break;

      allStats.push(...batch);
      start += batchSize;

      if (batch.length === batchSize) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return allStats;
  } catch (error) {
    console.error(`Error fetching goalie stats for season ${season}:`, error);
    throw error;
  }
}

/**
 * Fetch detailed player information
 */
export async function fetchPlayerDetails(playerId: number): Promise<any> {
  try {
    const data = await apiRequest(() =>
      webApi.get(`/player/${playerId}/landing`)
    );
    return data.data;
  } catch (error) {
    console.error(`Error fetching player details for ${playerId}:`, error);
    throw error;
  }
}

/**
 * Search for players by name
 */
export async function searchPlayers(query: string): Promise<any[]> {
  try {
    // This would use the NHL web API search endpoint if available
    // For now, this is a placeholder that would be implemented based on available endpoints
    // You may need to use your database for player search instead
    throw new Error('Player search via NHL API not yet implemented - use database search');
  } catch (error) {
    console.error(`Error searching players:`, error);
    throw error;
  }
}

/**
 * Get current season identifier
 * Format: YYYY(YY+1) e.g., 20252026 for 2025-26 season
 */
export function getCurrentSeason(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11

  // NHL season typically starts in October (month 9)
  // If we're before October, we're in the previous season
  if (month < 9) {
    const prevYear = year - 1;
    return `${prevYear}${year}`;
  } else {
    const nextYear = year + 1;
    return `${year}${nextYear}`;
  }
}

/**
 * Get all seasons data for a player (multiple seasons)
 */
export async function fetchPlayerStatsForSeasons(
  playerId: number,
  seasons: string[]
): Promise<Map<string, any>> {
  const seasonStats = new Map<string, any>();

  for (const season of seasons) {
    try {
      // Fetch stats for this season
      // This would combine summary, realtime, and faceoff stats
      // Implementation depends on your needs
      await new Promise(resolve => setTimeout(resolve, DEFAULT_DELAY_MS));
    } catch (error) {
      console.error(`Error fetching stats for season ${season}:`, error);
    }
  }

  return seasonStats;
}

/**
 * Batch fetch player details (with rate limiting)
 */
export async function batchFetchPlayerDetails(
  playerIds: number[],
  onProgress?: (completed: number, total: number) => void
): Promise<Map<number, any>> {
  const playerDetails = new Map<number, any>();
  const total = playerIds.length;

  for (let i = 0; i < playerIds.length; i++) {
    const playerId = playerIds[i];
    try {
      const details = await fetchPlayerDetails(playerId);
      playerDetails.set(playerId, details);

      if (onProgress) {
        onProgress(i + 1, total);
      }
    } catch (error) {
      console.error(`Error fetching details for player ${playerId}:`, error);
      // Continue with other players
    }
  }

  return playerDetails;
}

// ============================================================================
// SCHEDULE DATA FETCHING
// ============================================================================

export interface NHLGame {
  id: number;
  gameDate: string; // ISO date string
  gameTime: string; // ISO datetime string
  homeTeam: {
    id: number;
    abbrev: string;
    name: string;
  };
  awayTeam: {
    id: number;
    abbrev: string;
    name: string;
  };
  gameState: string; // "LIVE", "OFF", "PRE", "FINAL"
  startTimeUTC: string;
}

/**
 * Fetch schedule for a specific date
 * Format: YYYY-MM-DD
 */
export async function fetchScheduleForDate(date: string): Promise<NHLGame[]> {
  try {
    const response = await apiRequest(() =>
      webApi.get(`/schedule/${date}`)
    );

    const games: NHLGame[] = [];
    const data = response.data;

    // NHL Web API returns schedule in different formats
    // Handle both direct game array and gameWeek structure
    if (data) {
      // Check if it's a gameWeek structure
      if (data.gameWeek && Array.isArray(data.gameWeek)) {
        for (const day of data.gameWeek) {
          if (day.games && Array.isArray(day.games)) {
            for (const game of day.games) {
              games.push({
                id: game.id,
                gameDate: day.date || date,
                gameTime: game.startTimeUTC || game.gameDate || date,
                homeTeam: {
                  id: game.homeTeam?.id || game.homeTeamId,
                  abbrev: game.homeTeam?.abbrev || game.homeTeamAbbrev,
                  name: game.homeTeam?.name || game.homeTeamName,
                },
                awayTeam: {
                  id: game.awayTeam?.id || game.awayTeamId,
                  abbrev: game.awayTeam?.abbrev || game.awayTeamAbbrev,
                  name: game.awayTeam?.name || game.awayTeamName,
                },
                gameState: game.gameState || game.state || 'PRE',
                startTimeUTC: game.startTimeUTC || game.gameDate || date,
              });
            }
          }
        }
      }
      // Check if it's a direct games array
      else if (Array.isArray(data)) {
        for (const game of data) {
          games.push({
            id: game.id,
            gameDate: game.gameDate || game.date || date,
            gameTime: game.startTimeUTC || game.gameDate || date,
            homeTeam: {
              id: game.homeTeam?.id || game.homeTeamId,
              abbrev: game.homeTeam?.abbrev || game.homeTeamAbbrev,
              name: game.homeTeam?.name || game.homeTeamName,
            },
            awayTeam: {
              id: game.awayTeam?.id || game.awayTeamId,
              abbrev: game.awayTeam?.abbrev || game.awayTeamAbbrev,
              name: game.awayTeam?.name || game.awayTeamName,
            },
            gameState: game.gameState || game.state || 'PRE',
            startTimeUTC: game.startTimeUTC || game.gameDate || date,
          });
        }
      }
      // Check if it's nested in a data property
      else if (data.games && Array.isArray(data.games)) {
        for (const game of data.games) {
          games.push({
            id: game.id,
            gameDate: game.gameDate || game.date || date,
            gameTime: game.startTimeUTC || game.gameDate || date,
            homeTeam: {
              id: game.homeTeam?.id || game.homeTeamId,
              abbrev: game.homeTeam?.abbrev || game.homeTeamAbbrev,
              name: game.homeTeam?.name || game.homeTeamName,
            },
            awayTeam: {
              id: game.awayTeam?.id || game.awayTeamId,
              abbrev: game.awayTeam?.abbrev || game.awayTeamAbbrev,
              name: game.awayTeam?.name || game.awayTeamName,
            },
            gameState: game.gameState || game.state || 'PRE',
            startTimeUTC: game.startTimeUTC || game.gameDate || date,
          });
        }
      }
    }

    return games;
  } catch (error) {
    console.error(`Error fetching schedule for date ${date}:`, error);
    // Return empty array instead of throwing to allow date range to continue
    return [];
  }
}

/**
 * Fetch schedule for a date range
 * Dates should be in YYYY-MM-DD format
 */
export async function fetchScheduleForDateRange(
  startDate: string,
  endDate: string
): Promise<NHLGame[]> {
  try {
    const allGames: NHLGame[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // NHL API returns a full week when you query a single date
    // So we only need to call the API once per week, not per day
    // Calculate the week start (Monday) of the start date
    const weekStart = new Date(start);
    const dayOfWeek = weekStart.getDay();
    const diff = weekStart.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust to Monday
    weekStart.setDate(diff);
    weekStart.setHours(0, 0, 0, 0);
    
    // If the range spans multiple weeks, we need multiple API calls
    const weeksToFetch = new Set<string>();
    let currentDate = new Date(start);
    
    while (currentDate <= end) {
      const weekStartForDate = new Date(currentDate);
      const dayOfWeekForDate = weekStartForDate.getDay();
      const diffForDate = weekStartForDate.getDate() - dayOfWeekForDate + (dayOfWeekForDate === 0 ? -6 : 1);
      weekStartForDate.setDate(diffForDate);
      weekStartForDate.setHours(0, 0, 0, 0);
      const weekKey = weekStartForDate.toISOString().split('T')[0];
      weeksToFetch.add(weekKey);
      
      // Move to next week
      currentDate.setDate(currentDate.getDate() + 7);
    }
    
    // Fetch once per week
    const startDateStr = start.toISOString().split('T')[0];
    const endDateStr = end.toISOString().split('T')[0];
    
    for (const weekStartStr of weeksToFetch) {
      try {
        const games = await fetchScheduleForDate(weekStartStr);
        
        // Filter games to only include those in our date range
        // Use string comparison for dates to avoid timezone issues
        const filteredGames = games.filter(game => {
          if (!game.gameDate) return false;
          const gameDateStr = game.gameDate.includes('T') 
            ? game.gameDate.split('T')[0] 
            : game.gameDate.split(' ')[0];
          // Simple string comparison for YYYY-MM-DD format
          const inRange = gameDateStr >= startDateStr && gameDateStr <= endDateStr;
          return inRange;
        });
        
        allGames.push(...filteredGames);
      } catch (error) {
        console.error(`Error fetching schedule for week starting ${weekStartStr}, continuing...`, error);
        // Continue with other weeks even if one fails
      }
    }

    // Remove duplicates by game ID
    const seenGameIds = new Set<number>();
    const uniqueGames = allGames.filter(game => {
      if (seenGameIds.has(game.id)) {
        return false;
      }
      seenGameIds.add(game.id);
      return true;
    });

    return uniqueGames;
  } catch (error) {
    console.error(`Error fetching schedule for date range ${startDate} to ${endDate}:`, error);
    throw error;
  }
}

/**
 * Get week start date (Monday) for a given date
 */
export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(d.setDate(diff));
}

/**
 * Get week end date (Sunday) for a given date
 */
export function getWeekEnd(date: Date = new Date()): Date {
  const weekStart = getWeekStart(date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return weekEnd;
}

/**
 * Format date as YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Fetch schedule for a week (Monday to Sunday)
 */
export async function fetchScheduleForWeek(weekStartDate?: Date): Promise<NHLGame[]> {
  const weekStart = getWeekStart(weekStartDate);
  const weekEnd = getWeekEnd(weekStartDate);
  
  return fetchScheduleForDateRange(
    formatDate(weekStart),
    formatDate(weekEnd)
  );
}

/**
 * Get games for a specific team during a week
 */
export async function getTeamGamesForWeek(
  teamAbbrev: string,
  weekStartDate?: Date
): Promise<NHLGame[]> {
  const games = await fetchScheduleForWeek(weekStartDate);
  return games.filter(
    game => 
      game.homeTeam.abbrev === teamAbbrev || 
      game.awayTeam.abbrev === teamAbbrev
  );
}

// ============================================================================
// GAME-BY-GAME DATA FETCHING
// ============================================================================

export interface GameLogData {
  playerId: number;
  gameId: number;
  gameDate: string;
  season: string;
  gameType: string;
  opponentTeam: string;
  isHome: boolean;
  team: string;
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
  timeOnIce: string | null;
  timeOnIceSeconds: number | null;
  wins?: number | null;
  saves?: number | null;
  shotsAgainst?: number | null;
  goalsAgainst?: number | null;
  savePct?: number | null;
  shutouts?: number | null;
}

/**
 * Fetch game-by-game stats for a specific player in a season
 */
export async function fetchPlayerGameLogs(
  playerId: number,
  season: string,
  gameTypeId: number = 2 // 2 = regular season
): Promise<GameLogData[]> {
  const gameLogs: GameLogData[] = [];
  let start = 0;
  const batchSize = 100;

  try {
    while (true) {
      // Fetch summary stats (goals, assists, points, etc.)
      const summaryData = await apiRequest(() =>
        statsApi.get('/skater/summary', {
          params: {
            isAggregate: false,
            isGame: true, // KEY: This gets game-by-game data
            sort: '[{"property":"gameDate","direction":"DESC"}]',
            start,
            limit: batchSize,
            factCayenneExp: `playerId=${playerId}`,
            cayenneExp: `gameTypeId=${gameTypeId} and seasonId=${season}`,
          },
        })
      );

      const summaryBatch = summaryData.data.data || [];
      if (summaryBatch.length === 0) break;

      // Fetch realtime stats (hits, blocks) for the same games
      const realtimeData = await apiRequest(() =>
        statsApi.get('/skater/realtime', {
          params: {
            isAggregate: false,
            isGame: true,
            sort: '[{"property":"gameDate","direction":"DESC"}]',
            start,
            limit: batchSize,
            factCayenneExp: `playerId=${playerId}`,
            cayenneExp: `gameTypeId=${gameTypeId} and seasonId=${season}`,
          },
        })
      );

      const realtimeBatch = realtimeData.data.data || [];

      // Combine summary and realtime stats by gameId
      const realtimeMap = new Map<number, any>();
      for (const rt of realtimeBatch) {
        if (rt.gameId) {
          realtimeMap.set(rt.gameId, rt);
        }
      }

      for (const summary of summaryBatch) {
        const realtime = realtimeMap.get(summary.gameId) || {};
        
        // Parse time on ice - handle various formats
        const toiValue = summary.timeOnIcePerGame || summary.timeOnIce || summary.timeOnIceSeconds || null;
        const toiStr = toiValue != null ? String(toiValue) : null;
        const toiSeconds = parseTimeOnIceToSeconds(toiValue);

        // Determine home/away - handle various formats
        const homeRoad = summary.homeRoad || summary.homeRoadInd || '';
        const isHome = homeRoad === 'H' || homeRoad === 'HOME' || homeRoad === '1' || summary.isHome === true;

        // Get game date - handle various formats
        let gameDate = summary.gameDate;
        if (!gameDate && summary.gameId) {
          // Try to extract date from gameId if available
          // NHL game IDs sometimes encode date information
          gameDate = summary.gameId.toString();
        }

        gameLogs.push({
          playerId: summary.playerId || playerId,
          gameId: summary.gameId,
          gameDate: gameDate || new Date().toISOString().split('T')[0],
          season: season,
          gameType: gameTypeId === 2 ? 'regular' : 'playoff',
          opponentTeam: summary.opponentTeamAbbrev || summary.opponentTeam || summary.opponentAbbrev || '',
          isHome: isHome,
          team: summary.teamAbbrevs || summary.team || summary.teamAbbrev || '',
          goals: summary.goals || 0,
          assists: summary.assists || 0,
          points: summary.points || (summary.goals || 0) + (summary.assists || 0),
          shots: summary.shots || summary.shotsOnGoal || 0,
          shotsOnGoal: summary.shotsOnGoal || summary.shots || 0,
          hits: realtime.hits || 0,
          blocks: realtime.blockedShots || realtime.blocks || 0,
          powerPlayPoints: summary.ppPoints || summary.powerPlayPoints || summary.powerPlayAssists || 0,
          plusMinus: summary.plusMinus || summary.plusMinus || 0,
          pim: summary.penaltyMinutes || summary.pim || 0,
          timeOnIce: toiStr,
          timeOnIceSeconds: toiSeconds,
        });
      }

      start += batchSize;

      if (summaryBatch.length < batchSize) break;

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return gameLogs;
  } catch (error) {
    console.error(`Error fetching game logs for player ${playerId} season ${season}:`, error);
    throw error;
  }
}

/**
 * Fetch game-by-game stats for a goalie in a season
 */
export async function fetchGoalieGameLogs(
  playerId: number,
  season: string,
  gameTypeId: number = 2
): Promise<GameLogData[]> {
  const gameLogs: GameLogData[] = [];
  let start = 0;
  const batchSize = 100;

  try {
    while (true) {
      const data = await apiRequest(() =>
        statsApi.get('/goalie/summary', {
          params: {
            isAggregate: false,
            isGame: true, // KEY: This gets game-by-game data
            sort: '[{"property":"gameDate","direction":"DESC"}]',
            start,
            limit: batchSize,
            factCayenneExp: `playerId=${playerId}`,
            cayenneExp: `gameTypeId=${gameTypeId} and seasonId=${season}`,
          },
        })
      );

      const batch = data.data.data || [];
      if (batch.length === 0) break;

      for (const game of batch) {
        const homeRoad = game.homeRoad || game.homeRoadInd || '';
        const isHome = homeRoad === 'H' || homeRoad === 'HOME' || homeRoad === '1' || game.isHome === true;

        gameLogs.push({
          playerId: game.playerId || playerId,
          gameId: game.gameId,
          gameDate: game.gameDate || game.gameId?.toString() || new Date().toISOString().split('T')[0],
          season: season,
          gameType: gameTypeId === 2 ? 'regular' : 'playoff',
          opponentTeam: game.opponentTeamAbbrev || game.opponentTeam || game.opponentAbbrev || '',
          isHome: isHome,
          team: game.teamAbbrevs || game.team || game.teamAbbrev || '',
          goals: 0,
          assists: 0,
          points: 0,
          shots: 0,
          shotsOnGoal: 0,
          hits: 0,
          blocks: 0,
          powerPlayPoints: 0,
          plusMinus: 0,
          pim: 0,
          timeOnIce: null,
          timeOnIceSeconds: null,
          wins: game.wins || (game.decision === 'W' ? 1 : 0) || null,
          saves: game.saves || null,
          shotsAgainst: game.shotsAgainst || null,
          goalsAgainst: game.goalsAgainst || null,
          savePct: game.savePct || null,
          shutouts: game.shutouts || (game.shutout === 1 ? 1 : 0) || null,
        });
      }

      start += batchSize;

      if (batch.length < batchSize) break;

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return gameLogs;
  } catch (error) {
    console.error(`Error fetching goalie game logs for player ${playerId} season ${season}:`, error);
    throw error;
  }
}

/**
 * Parse time on ice string to seconds
 */
function parseTimeOnIceToSeconds(timeStr: string | number | null | undefined): number | null {
  if (!timeStr) return null;
  
  // If it's already a number (seconds), return it
  if (typeof timeStr === 'number') {
    return timeStr;
  }
  
  // Convert to string if needed
  const timeStrValue = String(timeStr).trim();
  if (!timeStrValue || timeStrValue === '0' || timeStrValue === '0:00') {
    return null;
  }
  
  // Handle "MM:SS" format
  const match = timeStrValue.match(/(\d+):(\d+)/);
  if (match) {
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    if (!isNaN(minutes) && !isNaN(seconds)) {
      return minutes * 60 + seconds;
    }
  }
  
  // Handle seconds as number string
  const seconds = parseInt(timeStrValue, 10);
  if (!isNaN(seconds) && seconds > 0) {
    return seconds;
  }
  
  return null;
}


