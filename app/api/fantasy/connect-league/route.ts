/**
 * API Route for Connecting Fantasy Leagues
 * 
 * Supports ESPN, Yahoo, and Sleeper
 * For now, focuses on ESPN integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/fantasy/connect-league
 * Connect a fantasy league and sync roster data
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { platform } = body;

    if (!platform) {
      return NextResponse.json(
        { error: 'platform is required' },
        { status: 400 }
      );
    }

    if (platform === 'yahoo') {
      return NextResponse.json({ message: 'Yahoo integration coming soon' });
    } else if (platform === 'sleeper') {
      return NextResponse.json({ message: 'Sleeper integration coming soon' });
    } else if (platform === 'espn') {
      return NextResponse.json(
        { error: 'ESPN integration temporarily disabled. Use manual league setup.' },
        { status: 410 }
      );
    } else {
      return NextResponse.json(
        { error: `Unsupported platform: ${platform}` },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error connecting league:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// ESPN integration removed per request

