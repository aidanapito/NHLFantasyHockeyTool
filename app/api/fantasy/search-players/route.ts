import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');
    
    if (!query) {
      return NextResponse.json(
        { error: 'q (query) parameter is required' },
        { status: 400 }
      );
    }
    
    const players = await prisma.player.findMany({
      where: {
        OR: [
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 20,
      include: {
        stats: true,
      },
    });
    
    return NextResponse.json({ players });
  } catch (error: any) {
    console.error('Error searching players:', error);
    return NextResponse.json(
      { error: 'Failed to search players' },
      { status: 500 }
    );
  }
}

