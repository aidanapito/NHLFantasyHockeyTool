/**
 * Fantasy League Integration Services
 * 
 * Services for connecting to and fetching data from:
 * - ESPN Fantasy Hockey
 * - Yahoo Fantasy Hockey
 * - Sleeper Fantasy Hockey
 */

import axios, { AxiosInstance } from 'axios';

// ESPN integration removed per request

// ============================================================================
// YAHOO FANTASY HOCKEY INTEGRATION
// ============================================================================

/**
 * Yahoo Fantasy League Service
 * 
 * Yahoo has an official Fantasy Sports API using OAuth 2.0
 * Documentation: https://developer.yahoo.com/fantasysports/guide/
 */

export interface YahooLeagueInfo {
  leagueId: string;
  leagueKey: string;
  leagueName: string;
  season: string;
  teams: YahooTeam[];
  scoringSettings: YahooScoringSettings;
}

export interface YahooTeam {
  teamId: string;
  teamKey: string;
  teamName: string;
  manager: string;
  roster: YahooPlayer[];
  standings?: any;
}

export interface YahooPlayer {
  playerId: string;
  playerKey: string;
  playerName: string;
  positions: string[];
  team: string;
  stats: Record<string, any>;
  isActive: boolean;
  selectedPosition?: string;
}

export interface YahooScoringSettings {
  categories: string[];
  scoringType: string; // 'H2H' or 'ROTO'
}

/**
 * Yahoo Fantasy Service
 */
export class YahooFantasyService {
  private baseUrl = 'https://fantasysports.yahooapis.com/fantasy/v2';
  private accessToken?: string;
  private refreshToken?: string;
  private clientId?: string;
  private clientSecret?: string;

  /**
   * Initialize with OAuth credentials
   */
  async initialize(oauthConfig: {
    clientId: string;
    clientSecret: string;
    accessToken?: string;
    refreshToken?: string;
  }): Promise<void> {
    this.clientId = oauthConfig.clientId;
    this.clientSecret = oauthConfig.clientSecret;
    this.accessToken = oauthConfig.accessToken;
    this.refreshToken = oauthConfig.refreshToken;

    // If no access token, would initiate OAuth flow here
    if (!this.accessToken) {
      console.log('Yahoo OAuth flow required - to be implemented');
    }
  }

  /**
   * Get OAuth authorization URL (step 1 of OAuth flow)
   */
  getAuthorizationUrl(redirectUri: string): string {
    if (!this.clientId) {
      throw new Error('Client ID required for Yahoo OAuth');
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'fspt-r', // Fantasy sports read-only scope
    });

    return `https://api.login.yahoo.com/oauth2/request_auth?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token (step 2)
   */
  async exchangeCodeForToken(code: string, redirectUri: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Client credentials required');
    }

    try {
      const response = await axios.post(
        'https://api.login.yahoo.com/oauth2/get_token',
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
          },
        }
      );

      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token;

      return {
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
      };
    } catch (error) {
      console.error('Error exchanging Yahoo OAuth code:', error);
      throw error;
    }
  }

  /**
   * Refresh access token if expired
   */
  async refreshAccessToken(): Promise<string> {
    if (!this.refreshToken || !this.clientId || !this.clientSecret) {
      throw new Error('Refresh token required');
    }

    try {
      const response = await axios.post(
        'https://api.login.yahoo.com/oauth2/get_token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
          },
        }
      );

      this.accessToken = response.data.access_token;
      return this.accessToken;
    } catch (error) {
      console.error('Error refreshing Yahoo token:', error);
      throw error;
    }
  }

  /**
   * Make authenticated API request
   */
  private async makeRequest(endpoint: string): Promise<any> {
    if (!this.accessToken) {
      await this.refreshAccessToken();
    }

    try {
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      });

      return response.data;
    } catch (error: any) {
      // If 401, try refreshing token once
      if (error.response?.status === 401 && this.refreshToken) {
        await this.refreshAccessToken();
        const retryResponse = await axios.get(`${this.baseUrl}${endpoint}`, {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        });
        return retryResponse.data;
      }

      throw error;
    }
  }

  /**
   * Fetch league information
   * League key format: {game_key}.l.{league_id}
   */
  async fetchLeague(leagueKey: string): Promise<YahooLeagueInfo> {
    try {
      const data = await this.makeRequest(`/league/${leagueKey}`);
      // Parse Yahoo's nested response structure
      // Implementation would parse the response and return structured data
      return data as YahooLeagueInfo;
    } catch (error) {
      console.error('Error fetching Yahoo league:', error);
      throw error;
    }
  }

  /**
   * Fetch team roster
   */
  async fetchTeamRoster(teamKey: string): Promise<YahooTeam> {
    try {
      const data = await this.makeRequest(`/team/${teamKey}/roster/players`);
      return data as YahooTeam;
    } catch (error) {
      console.error('Error fetching Yahoo roster:', error);
      throw error;
    }
  }

  /**
   * Fetch league teams
   */
  async fetchLeagueTeams(leagueKey: string): Promise<YahooTeam[]> {
    try {
      const data = await this.makeRequest(`/league/${leagueKey}/teams`);
      return data as YahooTeam[];
    } catch (error) {
      console.error('Error fetching Yahoo teams:', error);
      throw error;
    }
  }
}

// ============================================================================
// SLEEPER FANTASY HOCKEY INTEGRATION
// ============================================================================

/**
 * Sleeper Fantasy League Service
 * 
 * Sleeper has a well-documented public API (no authentication required for read operations)
 * Documentation: https://docs.sleeper.app/
 */

export interface SleeperLeagueInfo {
  leagueId: string;
  leagueName: string;
  season: string;
  seasonType: string;
  teams: SleeperTeam[];
  settings: SleeperSettings;
}

export interface SleeperTeam {
  teamId: string;
  ownerId: string;
  rosterId: string;
  teamName: string;
  roster: SleeperPlayer[];
}

export interface SleeperPlayer {
  playerId: string;
  playerName: string;
  position: string;
  team: string;
  stats?: Record<string, any>;
}

export interface SleeperSettings {
  scoringSettings: Record<string, number>;
  rosterSettings: Record<string, any>;
}

/**
 * Sleeper Fantasy Service
 */
export class SleeperFantasyService {
  private baseUrl = 'https://api.sleeper.app/v1';

  /**
   * Fetch league information
   */
  async fetchLeague(leagueId: string): Promise<SleeperLeagueInfo> {
    try {
      const [leagueData, rostersData, usersData] = await Promise.all([
        axios.get(`${this.baseUrl}/league/${leagueId}`),
        axios.get(`${this.baseUrl}/league/${leagueId}/rosters`),
        axios.get(`${this.baseUrl}/league/${leagueId}/users`),
      ]);

      // Combine data to build complete league info
      const league = leagueData.data;
      const rosters = rostersData.data;
      const users = usersData.data;

      // Build teams array
      const teams: SleeperTeam[] = rosters.map((roster: any) => {
        const user = users.find((u: any) => u.user_id === roster.owner_id);
        return {
          teamId: roster.roster_id,
          ownerId: roster.owner_id,
          rosterId: roster.roster_id,
          teamName: user?.display_name || `Team ${roster.roster_id}`,
          roster: [], // Will be populated separately
        };
      });

      return {
        leagueId,
        leagueName: league.name,
        season: league.season,
        seasonType: league.season_type,
        teams,
        settings: {
          scoringSettings: league.scoring_settings || {},
          rosterSettings: league.roster_positions || {},
        },
      };
    } catch (error) {
      console.error('Error fetching Sleeper league:', error);
      throw error;
    }
  }

  /**
   * Fetch roster for a specific team
   */
  async fetchRoster(leagueId: string, rosterId: string): Promise<SleeperPlayer[]> {
    try {
      const rosterData = await axios.get(`${this.baseUrl}/league/${leagueId}/rosters`);
      const roster = rosterData.data.find((r: any) => r.roster_id === rosterId);

      if (!roster) {
        throw new Error(`Roster ${rosterId} not found`);
      }

      // Fetch player details for each player ID in roster
      const playerIds = roster.players || [];
      const players = await this.fetchPlayers(playerIds);

      return players.map((player: any) => ({
        playerId: player.player_id,
        playerName: `${player.first_name} ${player.last_name}`,
        position: player.position,
        team: player.team,
      }));
    } catch (error) {
      console.error('Error fetching Sleeper roster:', error);
      throw error;
    }
  }

  /**
   * Fetch player data from Sleeper
   */
  async fetchPlayers(playerIds: string[]): Promise<any[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/players/nfl`); // Note: Sleeper's API may vary for NHL
      const allPlayers = response.data;
      
      return playerIds
        .map(id => allPlayers[id])
        .filter(Boolean);
    } catch (error) {
      console.error('Error fetching Sleeper players:', error);
      throw error;
    }
  }

  /**
   * Fetch all rosters in a league
   */
  async fetchAllRosters(leagueId: string): Promise<Map<string, SleeperPlayer[]>> {
    try {
      const leagueData = await this.fetchLeague(leagueId);
      const rosterMap = new Map<string, SleeperPlayer[]>();

      for (const team of leagueData.teams) {
        const roster = await this.fetchRoster(leagueId, team.rosterId);
        rosterMap.set(team.rosterId, roster);
      }

      return rosterMap;
    } catch (error) {
      console.error('Error fetching all Sleeper rosters:', error);
      throw error;
    }
  }
}

// ============================================================================
// UNIFIED FANTASY LEAGUE INTERFACE
// ============================================================================

/**
 * Unified interface for all fantasy league providers
 */
export type FantasyLeagueProvider = 'yahoo' | 'sleeper';

export interface UnifiedLeagueInfo {
  provider: FantasyLeagueProvider;
  leagueId: string;
  leagueName: string;
  season: string;
  teams: UnifiedTeam[];
  scoringSettings: Record<string, any>;
}

export interface UnifiedTeam {
  teamId: string;
  teamName: string;
  ownerName?: string;
  roster: UnifiedPlayer[];
}

export interface UnifiedPlayer {
  playerId: string;
  playerName: string;
  position: string[];
  nhlTeam?: string;
  stats?: Record<string, any>;
  slotPosition?: string;
}

/**
 * Get the appropriate service instance based on provider
 */
export function getFantasyService(provider: FantasyLeagueProvider) {
  switch (provider) {
    case 'yahoo':
      return new YahooFantasyService();
    case 'sleeper':
      return new SleeperFantasyService();
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

