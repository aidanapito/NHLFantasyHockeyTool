import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET - Fetch line combination data
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const team = searchParams.get('team');
    const season = searchParams.get('season') || '20252026';
    const lineNumber = searchParams.get('lineNumber');
    const playerId = searchParams.get('playerId');
    const minGames = parseInt(searchParams.get('minGames') || '5');

    let whereClause: any = {
      season,
      gameType: 'regular',
      gamesTogether: { gte: minGames }
    };

    if (team) {
      whereClause.team = team;
    }

    if (lineNumber) {
      whereClause.lineNumber = parseInt(lineNumber);
    }

    if (playerId) {
      whereClause.OR = [
        { player1Id: parseInt(playerId) },
        { player2Id: parseInt(playerId) },
        { player3Id: parseInt(playerId) }
      ];
    }

    const lineCombinations = await prisma.lineCombination.findMany({
      where: whereClause,
      include: {
        player1: {
          select: {
            id: true,
            nhlId: true,
            firstName: true,
            lastName: true,
            position: true,
            team: true,
            headshot: true
          }
        },
        player2: {
          select: {
            id: true,
            nhlId: true,
            firstName: true,
            lastName: true,
            position: true,
            team: true,
            headshot: true
          }
        },
        player3: {
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
        { gamesTogether: 'desc' },
        { goalsFor: 'desc' }
      ]
    });

    // Calculate line performance metrics
    const lineData = lineCombinations.map(line => {
      const corsiFor = line.corsiFor || 0;
      const corsiAgainst = line.corsiAgainst || 0;
      const fenwickFor = line.fenwickFor || 0;
      const fenwickAgainst = line.fenwickAgainst || 0;
      const goalsFor = line.goalsFor || 0;
      const goalsAgainst = line.goalsAgainst || 0;

      // Calculate percentages
      const corsiPercentage = corsiFor + corsiAgainst > 0 
        ? (corsiFor / (corsiFor + corsiAgainst)) * 100 
        : 0;
      
      const fenwickPercentage = fenwickFor + fenwickAgainst > 0 
        ? (fenwickFor / (fenwickFor + fenwickAgainst)) * 100 
        : 0;

      const goalPercentage = goalsFor + goalsAgainst > 0 
        ? (goalsFor / (goalsFor + goalsAgainst)) * 100 
        : 0;

      // Calculate per-game averages
      const goalsForPerGame = line.gamesTogether > 0 ? goalsFor / line.gamesTogether : 0;
      const goalsAgainstPerGame = line.gamesTogether > 0 ? goalsAgainst / line.gamesTogether : 0;
      const corsiForPerGame = line.gamesTogether > 0 ? corsiFor / line.gamesTogether : 0;
      const corsiAgainstPerGame = line.gamesTogether > 0 ? corsiAgainst / line.gamesTogether : 0;

      // Determine line effectiveness
      let effectiveness: 'elite' | 'good' | 'average' | 'poor' = 'average';
      if (corsiPercentage >= 55 && goalPercentage >= 60) effectiveness = 'elite';
      else if (corsiPercentage >= 52 && goalPercentage >= 55) effectiveness = 'good';
      else if (corsiPercentage < 45 || goalPercentage < 40) effectiveness = 'poor';

      return {
        id: line.id,
        season: line.season,
        team: line.team,
        lineNumber: line.lineNumber,
        players: [
          line.player1,
          line.player2,
          line.player3
        ].filter(Boolean), // Remove null players
        
        // Performance metrics
        gamesTogether: line.gamesTogether,
        timeOnIce: line.timeOnIce,
        
        // Goals
        goalsFor,
        goalsAgainst,
        goalPercentage: Math.round(goalPercentage * 100) / 100,
        goalsForPerGame: Math.round(goalsForPerGame * 100) / 100,
        goalsAgainstPerGame: Math.round(goalsAgainstPerGame * 100) / 100,
        
        // Corsi
        corsiFor,
        corsiAgainst,
        corsiPercentage: Math.round(corsiPercentage * 100) / 100,
        corsiForPerGame: Math.round(corsiForPerGame * 100) / 100,
        corsiAgainstPerGame: Math.round(corsiAgainstPerGame * 100) / 100,
        
        // Fenwick
        fenwickFor,
        fenwickAgainst,
        fenwickPercentage: Math.round(fenwickPercentage * 100) / 100,
        
        // Line rating
        effectiveness,
        
        createdAt: line.createdAt,
        updatedAt: line.updatedAt
      };
    });

    return NextResponse.json(lineData);
  } catch (error) {
    console.error('Error fetching line combinations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch line combinations', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST - Add new line combination
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      season,
      gameType = 'regular',
      team,
      lineNumber,
      player1Id,
      player2Id,
      player3Id,
      gamesTogether = 0,
      timeOnIce,
      goalsFor = 0,
      goalsAgainst = 0,
      corsiFor = 0,
      corsiAgainst = 0,
      fenwickFor = 0,
      fenwickAgainst = 0
    } = body;

    if (!season || !team || !lineNumber || !player1Id) {
      return NextResponse.json(
        { error: 'Missing required fields: season, team, lineNumber, player1Id' },
        { status: 400 }
      );
    }

    const lineCombination = await prisma.lineCombination.create({
      data: {
        season,
        gameType,
        team,
        lineNumber: parseInt(lineNumber),
        player1Id: parseInt(player1Id),
        player2Id: player2Id ? parseInt(player2Id) : null,
        player3Id: player3Id ? parseInt(player3Id) : null,
        gamesTogether: parseInt(gamesTogether),
        timeOnIce,
        goalsFor: parseInt(goalsFor),
        goalsAgainst: parseInt(goalsAgainst),
        corsiFor: parseInt(corsiFor),
        corsiAgainst: parseInt(corsiAgainst),
        fenwickFor: parseInt(fenwickFor),
        fenwickAgainst: parseInt(fenwickAgainst)
      },
      include: {
        player1: {
          select: {
            id: true,
            nhlId: true,
            firstName: true,
            lastName: true,
            position: true,
            team: true
          }
        },
        player2: {
          select: {
            id: true,
            nhlId: true,
            firstName: true,
            lastName: true,
            position: true,
            team: true
          }
        },
        player3: {
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

    return NextResponse.json(lineCombination, { status: 201 });
  } catch (error) {
    console.error('Error creating line combination:', error);
    return NextResponse.json(
      { error: 'Failed to create line combination', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
