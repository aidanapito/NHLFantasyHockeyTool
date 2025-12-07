import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const leagueId = searchParams.get('leagueId');
    
    if (!leagueId) {
      return NextResponse.json(
        { error: 'leagueId parameter is required' },
        { status: 400 }
      );
    }
    
    // Get league categories/scoring settings
    const league = await prisma.fantasyLeague.findUnique({
      where: { id: parseInt(leagueId) },
    });
    
    return NextResponse.json({
      leagueId,
      categories: league?.categories || [],
      message: 'Categories endpoint - coming soon',
    });
  } catch (error: any) {
    console.error('Error fetching categories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}

