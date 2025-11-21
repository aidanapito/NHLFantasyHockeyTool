export interface Player {
  id: string
  name: string
  team: string
  position: string
  age?: number
  photoUrl?: string
}

export interface PlayerStats {
  playerId: string
  gamesPlayed: number
  goals: number
  assists: number
  points: number
  plusMinus: number
  pim: number // Penalty Minutes
  shotsOnGoal: number
  hits: number
  blocks: number
  powerPlayPoints: number
  timeOnIce: string // Format: "XX:XX"
  averageToi: number // Minutes
}

export interface PlayerProjection {
  playerId: string
  projectedGoals: number
  projectedAssists: number
  projectedPoints: number
  draftPosition?: number
  espnProjectedValue?: number
}

export interface PlayerValue {
  playerId: string
  actualValue: number
  projectedValue: number
  valueDelta: number
  overUnderPerformance: 'over' | 'under' | 'fair'
  recentTrend: 'up' | 'down' | 'stable'
  consistencyScore: number // 0-100
  trendData: {
    last5Games: {
      gamesPlayed: number
      points: number
      toi: number
    }
    last10Games: {
      gamesPlayed: number
      points: number
      toi: number
    }
  }
}

export interface FantasyCategories {
  goals: number
  assists: number
  points: number
  plusMinus: number
  pim: number
  shots: number
  hits: number
  blocks: number
  ppp: number
  toi: number
}

export interface CalculatedPlayerValue extends Player, Partial<PlayerStats>, Partial<PlayerProjection> {
  currentValue: PlayerValue
  fantasyCategories: FantasyCategories
}
