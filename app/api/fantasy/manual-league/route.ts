import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, season, teams } = body;
    
    if (!name || !season) {
      return NextResponse.json(
        { error: 'name and season are required' },
        { status: 400 }
      );
    }
    
    // Create manual league
    const league = await prisma.fantasyLeague.create({
      data: {
        name,
        season,
        platform: 'manual',
        // Add other fields as needed
      },
    });
    
    return NextResponse.json({
      success: true,
      league,
    });
  } catch (error: any) {
    console.error('Error creating manual league:', error);
    return NextResponse.json(
      { error: 'Failed to create league' },
      { status: 500 }
    );
  }
}

