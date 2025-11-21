/**
 * Cron endpoint for scheduled NHL stats refresh
 * 
 * This endpoint is called by:
 * - Vercel Cron (if deployed on Vercel)
 * - External cron service (GitHub Actions, etc.)
 * - Manual trigger via API call
 * 
 * Protected by cron secret to prevent unauthorized access
 */

import { NextRequest, NextResponse } from 'next/server';
import { runRefreshTask } from '@/lib/data-refresh-scheduler';

/**
 * Verify cron request is legitimate (optional but recommended)
 */
function verifyCronRequest(request: NextRequest): boolean {
  // Option 1: Check for cron secret header (set by Vercel Cron)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  // Option 2: Check for Vercel Cron header
  const cronHeader = request.headers.get('x-vercel-cron');
  if (cronHeader) {
    return true;
  }

  // Option 3: Allow manual triggers in development
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  // Option 4: Check for API key if using external cron service
  const apiKey = request.headers.get('x-api-key');
  if (apiKey && apiKey === process.env.API_KEY) {
    return true;
  }

  // In production, require authentication
  if (process.env.NODE_ENV === 'production' && !cronSecret) {
    console.warn('CRON_SECRET not set - cron endpoint is unprotected');
  }

  return false;
}

export async function GET(request: NextRequest) {
  // Verify request is from legitimate cron service
  if (!verifyCronRequest(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    console.log('[Cron] Starting scheduled NHL stats refresh...');
    
    const result = await runRefreshTask('nhl_stats_daily');

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Stats refresh completed successfully',
        result,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          message: 'Stats refresh failed',
          error: result.error,
          result,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('[Cron] Error in stats refresh:', error);
    
    return NextResponse.json(
      {
        success: false,
        message: 'Stats refresh failed',
        error: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // Allow manual trigger via POST
  const body = await request.json().catch(() => ({}));
  const taskId = body.taskId || 'nhl_stats_daily';

  // Verify request (can be less strict for manual triggers with API key)
  const apiKey = request.headers.get('x-api-key');
  if (process.env.NODE_ENV === 'production' && !verifyCronRequest(request) && apiKey !== process.env.API_KEY) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    console.log(`[Cron] Manual trigger for task: ${taskId}`);
    
    const result = await runRefreshTask(taskId);

    return NextResponse.json({
      success: result.success,
      message: result.success ? 'Task completed' : 'Task failed',
      result,
    });
  } catch (error: any) {
    console.error('[Cron] Error in manual task execution:', error);
    
    return NextResponse.json(
      {
        success: false,
        message: 'Task execution failed',
        error: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

