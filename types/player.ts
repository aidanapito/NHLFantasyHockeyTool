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

export interface PlayerValue {
  player: Player;
  value: number;
  projection?: number;
  delta?: number;
}

