import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Injury data endpoint
    // This would fetch from NHL API or injury tracking service
    return NextResponse.json({
      message: 'Injuries endpoint - coming soon',
      injuries: [],
    });
  } catch (error: any) {
    console.error('Error fetching injuries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch injuries' },
      { status: 500 }
    );
  }
}

