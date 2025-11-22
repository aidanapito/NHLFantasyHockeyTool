import { NextRequest, NextResponse } from 'next/server';
import { detectAndReportDuplicates, mergeDuplicatePlayers } from '@/lib/player-deduplicator';

export const dynamic = 'force-dynamic';

/**
 * GET /api/players/deduplicate
 * Find and report duplicate players
 */
export async function GET(request: NextRequest) {
  try {
    const result = await detectAndReportDuplicates();

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Error detecting duplicates:', error);
    return NextResponse.json(
      { error: 'Failed to detect duplicates', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/players/deduplicate
 * Merge duplicate players
 * Body: { playerIds: number[], keepPlayerId: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { playerIds, keepPlayerId } = body;

    if (!Array.isArray(playerIds) || playerIds.length < 2) {
      return NextResponse.json(
        { error: 'playerIds must be an array with at least 2 IDs' },
        { status: 400 }
      );
    }

    if (typeof keepPlayerId !== 'number') {
      return NextResponse.json(
        { error: 'keepPlayerId must be a number' },
        { status: 400 }
      );
    }

    const result = await mergeDuplicatePlayers(playerIds, keepPlayerId);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Failed to merge players', details: result.errors },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      mergedCount: result.mergedCount,
      message: `Successfully merged ${result.mergedCount} duplicate player(s)`,
    });
  } catch (error: any) {
    console.error('Error merging duplicates:', error);
    return NextResponse.json(
      { error: 'Failed to merge duplicates', message: error.message },
      { status: 500 }
    );
  }
}

