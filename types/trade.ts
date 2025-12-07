import { Player } from './player';

export interface TradeSide {
  players: Player[];
  totalValue: number;
}

export interface TradeAnalysis {
  sideA: TradeSide;
  sideB: TradeSide;
  netValue: number;
  recommendation: 'accept' | 'reject' | 'negotiate';
  reasoning: string;
}

export interface TradeProposal {
  yourSide: Player[];
  theirSide: Player[];
}

