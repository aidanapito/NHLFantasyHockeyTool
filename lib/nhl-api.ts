import axios from 'axios'
import { Player, PlayerStats } from '@/types/player'

const NHL_API_BASE = 'https://statsapi.web.nhl.com/api/v1'

export interface NHLPlayer {
  id: number
  fullName: string
  primaryPosition: { code: string; name: string }
  currentTeam: { id: number; name: string }
}

export interface NHLPlayerStats {
  id: number
  stats: Array<{
    type: { displayName: string }
    splits: Array<{
      stat: {
        games: number
        goals: number
        assists: number
        points: number
        plusMinus: number
        pim: number
        shots: number
        hits: number
        blocked: number
        powerPlayPoints: number
        timeOnIce: string
        evenTimeOnIce: string
        powerPlayTimeOnIce: string
      }
    }>
  }>
}

/**
 * Search for players by name
 */
export async function searchPlayers(query: string): Promise<Player[]> {
  try {
    const response = await axios.get(`${NHL_API_BASE}/search`, {
      params: { q: query },
    })

    // Transform NHL API response to our Player type
    const players: Player[] = []
    // Note: NHL API doesn't have a direct search endpoint
    // This is a placeholder - you'd need to implement a proper search
    // or use a local database
    
    return players
  } catch (error) {
    console.error('Error searching players:', error)
    return []
  }
}

/**
 * Get player stats for current season
 */
export async function getPlayerStats(playerId: string): Promise<PlayerStats | null> {
  try {
    const response = await axios.get(`${NHL_API_BASE}/people/${playerId}/stats`, {
      params: {
        stats: 'yearByYear',
        seasons: '20232024', // Current season
      },
    })

    const stats = response.data.stats[0]?.splits[0]?.stat
    
    if (!stats) return null

    return {
      playerId,
      gamesPlayed: stats.games || 0,
      goals: stats.goals || 0,
      assists: stats.assists || 0,
      points: stats.points || 0,
      plusMinus: stats.plusMinus || 0,
      pim: stats.pim || 0,
      shotsOnGoal: stats.shots || 0,
      hits: stats.hits || 0,
      blocks: stats.blocked || 0,
      powerPlayPoints: stats.powerPlayPoints || 0,
      timeOnIce: stats.timeOnIce || '0:00',
      averageToi: parseToIMinutes(stats.timeOnIce || '0:00'),
    }
  } catch (error) {
    console.error('Error fetching player stats:', error)
    return null
  }
}

/**
 * Convert time on ice string (MM:SS) to minutes (decimal)
 */
function parseToIMinutes(timeOnIce: string): number {
  const parts = timeOnIce.split(':')
  const minutes = parseInt(parts[0], 10) || 0
  const seconds = parseInt(parts[1], 10) || 0
  return minutes + seconds / 60
}

/**
 * Get player information
 */
export async function getPlayerInfo(playerId: string): Promise<Player | null> {
  try {
    const response = await axios.get(`${NHL_API_BASE}/people/${playerId}`)
    
    const data = response.data.people[0]
    if (!data) return null

    return {
      id: data.id.toString(),
      name: data.fullName,
      team: data.currentTeam?.name || 'Free Agent',
      position: data.primaryPosition?.code || 'N/A',
      age: data.currentAge,
    }
  } catch (error) {
    console.error('Error fetching player info:', error)
    return null
  }
}

/**
 * Generate mock player data for development/demo purposes
 */
export function generateMockPlayer(overrides?: Partial<Player & PlayerStats>): Player & PlayerStats {
  return {
    id: overrides?.id || '12345',
    name: overrides?.name || 'Connor McDavid',
    team: overrides?.team || 'Edmonton Oilers',
    position: overrides?.position || 'C',
    playerId: overrides?.playerId || overrides?.id || '12345',
    gamesPlayed: overrides?.gamesPlayed || 20,
    goals: overrides?.goals || 15,
    assists: overrides?.assists || 25,
    points: overrides?.points || 40,
    plusMinus: overrides?.plusMinus || 12,
    pim: overrides?.pim || 8,
    shotsOnGoal: overrides?.shotsOnGoal || 95,
    hits: overrides?.hits || 35,
    blocks: overrides?.blocks || 22,
    powerPlayPoints: overrides?.powerPlayPoints || 15,
    timeOnIce: overrides?.timeOnIce || '23:45',
    averageToi: overrides?.averageToi || 23.75,
  }
}
