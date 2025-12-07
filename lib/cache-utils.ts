/**
 * Cache Utilities
 * 
 * Provides data freshness tracking, caching strategies, and cache invalidation
 * for both database and in-memory caching.
 */

// ============================================================================
// DATA FRESHNESS TRACKING
// ============================================================================

export interface CacheMetadata {
  key: string;
  lastUpdated: Date;
  expiresAt?: Date;
  version?: number;
  source: 'nhl_api' | 'fantasy_api' | 'database';
}

/**
 * Track when data was last refreshed
 */
export class DataFreshnessTracker {
  private static instance: DataFreshnessTracker;
  private metadata: Map<string, CacheMetadata> = new Map();

  private constructor() {}

  static getInstance(): DataFreshnessTracker {
    if (!DataFreshnessTracker.instance) {
      DataFreshnessTracker.instance = new DataFreshnessTracker();
    }
    return DataFreshnessTracker.instance;
  }

  /**
   * Record when data was last fetched/updated
   */
  recordUpdate(key: string, metadata: Omit<CacheMetadata, 'key'>): void {
    this.metadata.set(key, {
      key,
      ...metadata,
      lastUpdated: new Date(),
    });
  }

  /**
   * Get when data was last updated
   */
  getLastUpdate(key: string): Date | null {
    const meta = this.metadata.get(key);
    return meta?.lastUpdated || null;
  }

  /**
   * Check if data is stale (older than maxAge minutes)
   */
  isStale(key: string, maxAgeMinutes: number = 60): boolean {
    const lastUpdate = this.getLastUpdate(key);
    if (!lastUpdate) return true;

    const ageMinutes = (Date.now() - lastUpdate.getTime()) / (1000 * 60);
    return ageMinutes > maxAgeMinutes;
  }

  /**
   * Check if data is expired
   */
  isExpired(key: string): boolean {
    const meta = this.metadata.get(key);
    if (!meta || !meta.expiresAt) return false;

    return new Date() > meta.expiresAt;
  }

  /**
   * Get all tracked keys
   */
  getTrackedKeys(): string[] {
    return Array.from(this.metadata.keys());
  }

  /**
   * Clear metadata for a key
   */
  clear(key: string): void {
    this.metadata.delete(key);
  }

  /**
   * Clear all metadata
   */
  clearAll(): void {
    this.metadata.clear();
  }
}

// ============================================================================
// CACHE KEYS
// ============================================================================

/**
 * Standardized cache key generation
 */
export class CacheKeys {
  /**
   * Player stats cache key
   */
  static playerStats(playerId: number, season: string, gameType: string = 'regular'): string {
    return `player:stats:${playerId}:${season}:${gameType}`;
  }

  /**
   * Player details cache key
   */
  static playerDetails(playerId: number): string {
    return `player:details:${playerId}`;
  }

  /**
   * League cache key
   */
  static league(provider: string, leagueId: string, season: string): string {
    return `league:${provider}:${leagueId}:${season}`;
  }

  /**
   * Team roster cache key
   */
  static teamRoster(teamId: string, season: string): string {
    return `team:roster:${teamId}:${season}`;
  }

  /**
   * Season stats cache key
   */
  static seasonStats(season: string): string {
    return `season:stats:${season}`;
  }

  /**
   * Last refresh timestamp
   */
  static lastRefresh(type: string): string {
    return `refresh:${type}`;
  }
}

// ============================================================================
// REFRESH STRATEGY
// ============================================================================

export interface RefreshStrategy {
  /**
   * How often to refresh (in minutes)
   */
  refreshIntervalMinutes: number;

  /**
   * Whether to refresh on-demand
   */
  allowOnDemandRefresh: boolean;

  /**
   * Priority level (higher = more important)
   */
  priority: number;
}

/**
 * Default refresh strategies for different data types
 */
export const RefreshStrategies: Record<string, RefreshStrategy> = {
  // NHL stats should be refreshed daily
  nhl_player_stats: {
    refreshIntervalMinutes: 60 * 24, // 24 hours
    allowOnDemandRefresh: true,
    priority: 10,
  },

  // Player details change rarely
  nhl_player_details: {
    refreshIntervalMinutes: 60 * 24 * 7, // 7 days
    allowOnDemandRefresh: true,
    priority: 5,
  },

  // Fantasy league data should be refreshed more frequently during season
  fantasy_league: {
    refreshIntervalMinutes: 60 * 12, // 12 hours
    allowOnDemandRefresh: true,
    priority: 8,
  },

  // Team rosters change with transactions
  fantasy_roster: {
    refreshIntervalMinutes: 60 * 6, // 6 hours
    allowOnDemandRefresh: true,
    priority: 9,
  },

  // Injury data should be checked daily
  injuries: {
    refreshIntervalMinutes: 60 * 24, // 24 hours
    allowOnDemandRefresh: true,
    priority: 7,
  },
};

/**
 * Determine if data should be refreshed based on strategy
 */
export function shouldRefresh(
  cacheKey: string,
  strategy: RefreshStrategy,
  lastRefresh?: Date
): boolean {
  if (!lastRefresh) return true;

  if (strategy.allowOnDemandRefresh) {
    // Check if refresh interval has passed
    const ageMinutes = (Date.now() - lastRefresh.getTime()) / (1000 * 60);
    return ageMinutes >= strategy.refreshIntervalMinutes;
  }

  return false;
}

// ============================================================================
// CACHE INVALIDATION
// ============================================================================

/**
 * Cache invalidation manager
 */
export class CacheInvalidator {
  private tracker: DataFreshnessTracker;

  constructor() {
    this.tracker = DataFreshnessTracker.getInstance();
  }

  /**
   * Invalidate cache for a specific key
   */
  invalidate(key: string): void {
    this.tracker.clear(key);
  }

  /**
   * Invalidate all player-related caches
   */
  invalidatePlayer(playerId: number): void {
    const keys = this.tracker.getTrackedKeys();
    keys.forEach(key => {
      if (key.includes(`player:${playerId}`)) {
        this.invalidate(key);
      }
    });
  }

  /**
   * Invalidate all season-related caches
   */
  invalidateSeason(season: string): void {
    const keys = this.tracker.getTrackedKeys();
    keys.forEach(key => {
      if (key.includes(`:${season}:`)) {
        this.invalidate(key);
      }
    });
  }

  /**
   * Invalidate all league-related caches
   */
  invalidateLeague(provider: string, leagueId: string): void {
    const keys = this.tracker.getTrackedKeys();
    keys.forEach(key => {
      if (key.includes(`league:${provider}:${leagueId}`)) {
        this.invalidate(key);
      }
    });
  }

  /**
   * Invalidate all stale caches
   */
  invalidateStale(maxAgeMinutes: number = 60): void {
    const keys = this.tracker.getTrackedKeys();
    keys.forEach(key => {
      if (this.tracker.isStale(key, maxAgeMinutes)) {
        this.invalidate(key);
      }
    });
  }
}

// ============================================================================
// DATABASE CACHE HELPERS
// ============================================================================

/**
 * Check if database cache is fresh enough
 */
export async function checkDatabaseCacheFreshness(
  lastUpdateColumn: Date | null,
  maxAgeMinutes: number
): Promise<boolean> {
  if (!lastUpdateColumn) return false;

  const ageMinutes = (Date.now() - lastUpdateColumn.getTime()) / (1000 * 60);
  return ageMinutes < maxAgeMinutes;
}

/**
 * Get cache status summary
 */
export function getCacheStatus(): {
  totalTracked: number;
  staleCount: number;
  expiredCount: number;
} {
  const tracker = DataFreshnessTracker.getInstance();
  const keys = tracker.getTrackedKeys();

  let staleCount = 0;
  let expiredCount = 0;

  keys.forEach(key => {
    if (tracker.isStale(key)) staleCount++;
    if (tracker.isExpired(key)) expiredCount++;
  });

  return {
    totalTracked: keys.length,
    staleCount,
    expiredCount,
  };
}

