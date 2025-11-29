export interface Player {
  id: string;
  nhlId: number;
  name: string;
  position: string;
  team: string;
  stats?: PlayerStats;
}

export interface PlayerStats {
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
  timeOnIce?: string;
}

export interface PlayerProjection {
  playerId: number;
  gameDate: string;
  season: string;
  modelVersion: string;
  // Deep learning per-game projections
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
  // Legacy / ESPN-style projection fields (optional, for compatibility)
  espnProjectedValue?: number;
  projectedGoals?: number;
  projectedAssists?: number;
  projectedPoints?: number;
}

export interface PlayerValue {
  player: Player;
  value: number;
  projection?: number;
  delta?: number;
}

