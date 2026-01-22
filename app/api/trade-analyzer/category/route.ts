import { NextRequest, NextResponse } from 'next/server'
import { analyzeCategoryTrade } from '@/lib/category-trade-analyzer'
import { CategoryTradeAnalysisInput } from '@/types/category-trade'

export const dynamic = 'force-dynamic'

/**
 * POST /api/trade-analyzer/category
 * 
 * Analyze a fantasy hockey trade based on category contributions
 * 
 * Request body:
 * {
 *   sideA: [{ playerId: string, nhlId: number }, ...],  // Max 3 players
 *   sideB: [{ playerId: string, nhlId: number }, ...],  // Max 3 players
 *   sideAName?: string,
 *   sideBName?: string,
 *   season?: string,  // Defaults to '20252026'
 *   timePeriod?: 'season' | 'recent14' | 'recent30',  // Defaults to 'season'
 *   myTeamId?: string,  // Optional: for team context analysis
 *   leagueId?: string,  // Optional: for category standings
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validate request body
    if (!body.sideA || !Array.isArray(body.sideA) || body.sideA.length === 0) {
      return NextResponse.json(
        { error: 'sideA is required and must be a non-empty array' },
        { status: 400 }
      )
    }
    
    if (!body.sideB || !Array.isArray(body.sideB) || body.sideB.length === 0) {
      return NextResponse.json(
        { error: 'sideB is required and must be a non-empty array' },
        { status: 400 }
      )
    }
    
    // Validate max 3 players per side
    if (body.sideA.length > 3) {
      return NextResponse.json(
        { error: 'sideA cannot have more than 3 players' },
        { status: 400 }
      )
    }
    
    if (body.sideB.length > 3) {
      return NextResponse.json(
        { error: 'sideB cannot have more than 3 players' },
        { status: 400 }
      )
    }
    
    // Validate player IDs
    for (const player of [...body.sideA, ...body.sideB]) {
      if (!player.playerId || !player.nhlId) {
        return NextResponse.json(
          { error: 'Each player must have playerId (string) and nhlId (number)' },
          { status: 400 }
        )
      }
    }
    
    // Build analysis input
    const input: CategoryTradeAnalysisInput = {
      sideA: body.sideA.map((p: any) => ({
        playerId: String(p.playerId),
        nhlId: Number(p.nhlId),
      })),
      sideB: body.sideB.map((p: any) => ({
        playerId: String(p.playerId),
        nhlId: Number(p.nhlId),
      })),
      sideAName: body.sideAName,
      sideBName: body.sideBName,
      season: body.season || '20252026',
      timePeriod: body.timePeriod || 'season',
      myTeamId: body.myTeamId,
      leagueId: body.leagueId,
    }
    
    // Analyze trade
    const analysis = await analyzeCategoryTrade(input)
    
    return NextResponse.json({
      success: true,
      data: analysis,
    })
    
  } catch (error: any) {
    console.error('Error analyzing category trade:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to analyze trade',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/trade-analyzer/category
 * 
 * Get information about the category trade analyzer
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    name: 'Category Trade Analyzer',
    description: 'Analyzes fantasy hockey trades based on category contributions',
    categories: {
      skater: ['G', 'A', '±', 'PIM', 'PPP', 'SOG', 'HIT', 'BLK', 'FOW'],
      goalie: ['W', 'SO', 'SV%', 'GAA'],
      total: 13,
    },
    maxPlayersPerSide: 3,
    supportedTimePeriods: ['season', 'recent14', 'recent30'],
  })
}

