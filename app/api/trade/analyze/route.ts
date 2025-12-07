import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { yourSide, theirSide } = body;
    
    if (!yourSide || !theirSide || !Array.isArray(yourSide) || !Array.isArray(theirSide)) {
      return NextResponse.json(
        { error: 'yourSide and theirSide arrays are required' },
        { status: 400 }
      );
    }
    
    // Get player stats for both sides
    const yourPlayers = await prisma.player.findMany({
      where: {
        id: { in: yourSide.map((p: any) => p.id || p) },
      },
      include: {
        stats: true,
      },
    });
    
    const theirPlayers = await prisma.player.findMany({
      where: {
        id: { in: theirSide.map((p: any) => p.id || p) },
      },
      include: {
        stats: true,
      },
    });
    
    return NextResponse.json({
      yourSide: yourPlayers,
      theirSide: theirPlayers,
      analysis: 'Trade analysis coming soon',
    });
  } catch (error: any) {
    console.error('Error analyzing trade:', error);
    return NextResponse.json(
      { error: 'Failed to analyze trade' },
      { status: 500 }
    );
  }
}

