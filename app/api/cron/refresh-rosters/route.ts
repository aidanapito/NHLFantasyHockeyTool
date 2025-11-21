/**
 * Cron endpoint for scheduled fantasy roster refresh
 */

import { NextRequest, NextResponse } from 'next/server';
import { runRefreshTask } from '@/lib/data-refresh-scheduler';

function verifyCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  const cronHeader = request.headers.get('x-vercel-cron');
  if (cronHeader) {
    return true;
  }

  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  const apiKey = request.headers.get('x-api-key');
  if (apiKey && apiKey === process.env.API_KEY) {
    return true;
  }

  return false;
}

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    console.log('[Cron] Starting scheduled fantasy roster refresh...');
    
    const result = await runRefreshTask('fantasy_rosters');

    return NextResponse.json({
      success: result.success,
      message: result.success ? 'Roster refresh completed' : 'Roster refresh failed',
      result,
    });
  } catch (error: any) {
    console.error('[Cron] Error in roster refresh:', error);
    
    return NextResponse.json(
      {
        success: false,
        message: 'Roster refresh failed',
        error: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

