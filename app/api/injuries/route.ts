import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET - Fetch injury data for players
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const playerId = searchParams.get('playerId');
    const team = searchParams.get('team');
    const status = searchParams.get('status'); // day-to-day, injured reserve, healthy
    const activeOnly = searchParams.get('activeOnly') === 'true';

    let whereClause: any = {};

    if (playerId) {
      whereClause.playerId = parseInt(playerId);
    }

    if (team) {
      whereClause.player = { team };
    }

    if (status) {
      whereClause.status = status;
    }

    if (activeOnly) {
      whereClause.isActive = true;
    }

    const injuries = await prisma.playerInjury.findMany({
      where: whereClause,
      include: {
        player: {
          select: {
            id: true,
            nhlId: true,
            firstName: true,
            lastName: true,
            position: true,
            team: true,
            headshot: true
          }
        }
      },
      orderBy: [
        { isActive: 'desc' },
        { dateInjured: 'desc' }
      ]
    });

    // Calculate injury impact metrics
    const injuryData = injuries.map(injury => {
      const daysSinceInjury = injury.dateInjured 
        ? Math.floor((Date.now() - injury.dateInjured.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      const daysUntilReturn = injury.expectedReturn
        ? Math.floor((injury.expectedReturn.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;

      // Determine injury severity
      let severity: 'minor' | 'moderate' | 'major' | 'season-ending' = 'minor';
      if (injury.gamesMissed >= 20) severity = 'season-ending';
      else if (injury.gamesMissed >= 10) severity = 'major';
      else if (injury.gamesMissed >= 5) severity = 'moderate';

      return {
        id: injury.id,
        player: injury.player,
        injuryType: injury.injuryType,
        status: injury.status,
        description: injury.description,
        dateInjured: injury.dateInjured,
        expectedReturn: injury.expectedReturn,
        gamesMissed: injury.gamesMissed,
        isActive: injury.isActive,
        severity,
        daysSinceInjury,
        daysUntilReturn,
        createdAt: injury.createdAt,
        updatedAt: injury.updatedAt
      };
    });

    return NextResponse.json(injuryData);
  } catch (error) {
    console.error('Error fetching injury data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch injury data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST - Add new injury record
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      playerId,
      injuryType,
      status,
      description,
      dateInjured,
      expectedReturn,
      gamesMissed = 0
    } = body;

    if (!playerId || !injuryType || !status) {
      return NextResponse.json(
        { error: 'Missing required fields: playerId, injuryType, status' },
        { status: 400 }
      );
    }

    const injury = await prisma.playerInjury.create({
      data: {
        playerId: parseInt(playerId),
        injuryType,
        status,
        description,
        dateInjured: dateInjured ? new Date(dateInjured) : null,
        expectedReturn: expectedReturn ? new Date(expectedReturn) : null,
        gamesMissed: parseInt(gamesMissed)
      },
      include: {
        player: {
          select: {
            id: true,
            nhlId: true,
            firstName: true,
            lastName: true,
            position: true,
            team: true
          }
        }
      }
    });

    return NextResponse.json(injury, { status: 201 });
  } catch (error) {
    console.error('Error creating injury record:', error);
    return NextResponse.json(
      { error: 'Failed to create injury record', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
