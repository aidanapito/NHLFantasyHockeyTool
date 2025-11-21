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

 at least one team are required' },
        { status: 400 }
      );
    }

    // Create league with a custom platform label 'manual'
    const league = await prisma.fantasyLeague.create({
      data: {
        platform: 'manual',
        platformId: crypto.randomUUID(),
        leagueName,
        season,
        scoringType: null,
        categories: [],
        espnCookies: null,
      },
    });

    let teamsCreated = 0;

    for (const t of teams) {
      const name = (t.teamName || '').trim();
      if (!name) continue;

      await prisma.fantasyTeam.create({
        data: {
          leagueId: league.id,
          teamName: name,
          ownerName: t.ownerName || null,
          platformTeamId: t.platformTeamId || `${teamsCreated + 1}`,
          isMyTeam: !!t.isMyTeam,
        },
      });

      teamsCreated++;
    }

    return NextResponse.json({
      success: true,
      league: {
        id: league.id,
        name: league.leagueName,
        season: league.season,
        platform: league.platform,
      },
      stats: {
        teamsCreated,
      },
      message: `Manual league created with ${teamsCreated} teams`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to create manual league' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leagueName = searchParams.get('leagueName') || '';
    const season = searchParams.get('season') || '';

    if (!leagueName || !season) {
      return NextResponse.json(
        { error: 'leagueName and season are required' },
        { status: 400 }
      );
    }

    const league = await prisma.fantasyLeague.findFirst({
      where: { platform: 'manual', leagueName, season },
      select: { id: true, leagueName: true, season: true, platform: true }
    });

    if (!league) {
      return NextResponse.json(
        { error: `Manual league not found: ${leagueName} (${season})` },
        { status: 404 }
      );
    }

    const teams = await prisma.fantasyTeam.findMany({
      where: { leagueId: league.id },
      include: {
        roster: {
          include: {
            player: {
              select: { nhlId: true, fullName: true, position: true, team: true }
            }
          },
          orderBy: { addedDate: 'asc' }
        }
      },
      orderBy: { teamName: 'asc' }
    });

    const result = {
      league,
      teams: teams.map(t => ({
        id: t.id,
        teamName: t.teamName,
        ownerName: t.ownerName,
        roster: t.roster.map(r => ({
          playerId: r.playerId,
          playerName: r.player.fullName,
          position: r.player.position,
          nhlTeam: r.player.team,
          slotPosition: r.slotPosition,
        }))
      }))
    };

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch manual league' },
      { status: 500 }
    );
  }
}


