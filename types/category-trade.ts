/**
 * Category-Based Trade Analysis Types
 * 
 * Types for analyzing fantasy hockey trades based on category contributions
 * in a categories league (where you need to win categories, not total points)
 */

import { Player } from './player'

/**
 * The 13 categories in your fantasy league
 */
export type CategoryCode = 
  | 'G'      // Goals
  | 'A'      // Assists
  | '±'      // Plus/Minus
  | 'PIM'    // Penalty Minutes
  | 'PPP'    // Power Play Points
  | 'SOG'    // Shots on Goal
  | 'HIT'    // Hits
  | 'BLK'    // Blocks
  | 'FOW'    // Faceoffs Won
  | 'W'      // Goalie Wins
  | 'SO'     // Goalie Shutouts
  | 'SV%'    // Goalie Save Percentage
  | 'GAA'    // Goalie Goals Against Average

/**
 * Category metadata and configuration
 */
export interface CategoryDefinition {
  code: CategoryCode
  displayName: string
  statKey: string  // Key in PlayerStats
  isGoalieCategory: boolean
  higherIsBetter: boolean  // true for most, false for GAA
}

/**
 * Category statistics for a player or trade side
 */
export interface CategoryStats {
  G: number
  A: number
  '±': number
  PIM: number
  PPP: number
  SOG: number
  HIT: number
  BLK: number
  FOW: number
  W: number
  SO: number
  'SV%': number
  GAA: number
}

/**
 * Per-category analysis for a player or side
 */
export interface CategoryAnalysis {
  category: CategoryCode
  total: number
  perGame: number
  zScore: number
  winContribution: number  // Estimated category wins per week (0-1)
  rank: number  // Rank among all players in league
  percentile: number  // 0-100
}

/**
 * Player with category-based analysis
 */
export interface CategoryPlayerValue {
  player: Player & {
    id: string  // NHL ID as string
    nhlId: number
  }
  stats: CategoryStats
  gamesPlayed: number
  gamesRemaining: number
  categoryAnalysis: Record<CategoryCode, CategoryAnalysis>
  totalZScore: number
  totalWinContribution: number
  strengthOfSchedule: number  // 0-100, higher = easier schedule
}

/**
 * Games remaining information for a player
 */
export interface GamesRemainingInfo {
  playerId: string
  nhlId: number
  gamesRemaining: number
  gamesByWeek: Record<string, number>  // Week number -> game count
  averageOpponentDifficulty: number  // 0-100, higher = easier opponents
  easyGamesCount: number
  hardGamesCount: number
}

/**
 * Trade side analysis
 */
export interface CategoryTradeSide {
  players: CategoryPlayerValue[]
  teamName?: string
  categoryStats: CategoryStats
  categoryAnalysis: Record<CategoryCode, CategoryAnalysis>
  totalZScore: number
  totalWinContribution: number
  averageGamesRemaining: number
  averageStrengthOfSchedule: number
  categoryStrengths: CategoryCode[]  // Categories this side is strong in
  categoryWeaknesses: CategoryCode[]  // Categories this side is weak in
}

/**
 * Category impact of a trade
 */
export interface CategoryImpact {
  category: CategoryCode
  sideATotal: number
  sideBTotal: number
  netChange: number  // For evaluating team: sideB - sideA (what you receive - what you give)
  netChangePercentage: number
  zScoreDifference: number  // sideB - sideA
  winContributionDifference: number  // sideB - sideA
  helpsCategory: boolean  // Does this trade help this category?
  hurtsCategory: boolean  // Does this trade hurt this category?
}

/**
 * Team category needs analysis
 */
export interface TeamCategoryNeeds {
  teamId: string
  teamName: string
  weakCategories: Array<{
    category: CategoryCode
    currentRank: number
    needsImprovement: number  // How much they need to improve
    percentile: number  // Current percentile in league
  }>
  strongCategories: Array<{
    category: CategoryCode
    currentRank: number
    surplus: number  // How much they can afford to lose
    percentile: number
  }>
  categoryRankings: Record<CategoryCode, number>
  contextualValueMultipliers: Record<CategoryCode, number>  // Adjust values based on needs (e.g., 1.5x for weak categories)
}

/**
 * Main category-based trade analysis result
 */
export interface CategoryTradeAnalysis {
  sideA: CategoryTradeSide
  sideB: CategoryTradeSide
  categoryImpacts: CategoryImpact[]
  netCategoryChanges: CategoryStats  // Net change for evaluating team (sideB - sideA)
  recommendation: 'accept' | 'reject' | 'negotiate'
  fairnessScore: number  // 0-100, higher = more fair
  reasoning: string[]
  insights: string[]
  suggestions?: string[]
  
  // Category win analysis
  estimatedCategoryWins: {
    before: Record<CategoryCode, number>  // Estimated wins per week before trade
    after: Record<CategoryCode, number>   // Estimated wins per week after trade
    netChange: Record<CategoryCode, number>
  }
  
  // Team context (if provided)
  teamContext?: {
    myTeamNeeds?: TeamCategoryNeeds
    contextualValueAdjustments: Record<string, number>  // Per-player adjustments based on team needs
    whyThisHelps: string[]  // Why this trade helps your team
    whyThisHurts: string[]  // Why this trade might hurt your team
  }
  
  // Games and schedule analysis
  gamesRemaining: {
    sideA: number
    sideB: number
    netChange: number
  }
  
  strengthOfSchedule: {
    sideA: number
    sideB: number
    netChange: number  // Positive = easier schedule, negative = harder
  }
  
  // Time period used for analysis
  timePeriod: 'season' | 'recent14' | 'recent30'
  analysisDate: string
}

/**
 * Input for category trade analysis
 */
export interface CategoryTradeAnalysisInput {
  sideA: Array<{
    playerId: string  // NHL ID as string
    nhlId: number
  }>
  sideB: Array<{
    playerId: string  // NHL ID as string
    nhlId: number
  }>
  sideAName?: string
  sideBName?: string
  season?: string  // Defaults to current season
  timePeriod?: 'season' | 'recent14' | 'recent30'  // Defaults to 'season'
  myTeamId?: string  // If provided, will analyze with team context
  leagueId?: string  // For category standings if available
}

/**
 * Trade suggestion based on category needs
 */
export interface CategoryTradeSuggestion {
  targetPlayer: CategoryPlayerValue
  yourPlayers: CategoryPlayerValue[]  // Players to offer
  categoryImprovements: Record<CategoryCode, number>  // How much each category improves
  totalCategoryWinImprovement: number  // Total estimated weekly category wins gained
  winWinScore: number  // 0-100, how good for both teams
  reasoning: string[]
  estimatedMatchupWinIncrease: number  // How much this increases weekly matchup win probability
}

