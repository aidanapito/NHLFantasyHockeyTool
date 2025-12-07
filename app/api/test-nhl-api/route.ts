import { NextRequest, NextResponse } from 'next/server';
import { fetchSkaterSummaryStats } from '@/lib/nhl-api-service';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const season = searchParams.get('season') || '20232024';
    
    const stats = await fetchSkaterSummaryStats(season);
    
    return NextResponse.json({
      success: true,
      season,
      playerCount: stats.length,
      sample: stats.slice(0, 5),
    });
  } catch (error: any) {
    console.error('Error testing NHL API:', error);
    return NextResponse.json(
      { error: 'Failed to test NHL API', message: error.message },
      { status: 500 }
    );
  }
}

