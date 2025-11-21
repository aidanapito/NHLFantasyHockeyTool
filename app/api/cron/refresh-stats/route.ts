import { NextRequest, NextResponse } from 'next/server';
import { fetchSkaterSummaryStats, fetchGoalieStats, getCurrentSeason } from '@/lib/nhl-api-service';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    // Verify this is a cron request (add authentication)
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const season = getCurrentSeason();
    console.log(`Cron: Refreshing stats for season ${season}...`);
    
    // Fetch and update stats
    const skaterStats = await fetchSkaterSummaryStats(season);
    const goalieStats = await fetchGoalieStats(season);
    
    // Update database
    // Implementation would update PlayerStats table
    
    return NextResponse.json({
      success: true,
      season,
      skaterCount: skaterStats.length,
      goalieCount: goalieStats.length,
    });
  } catch (error: any) {
    console.error('Error in cron refresh stats:', error);
    return NextResponse.json(
      { error: 'Failed to refresh stats' },
      { status: 500 }
    );
  }
}

